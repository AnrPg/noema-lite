"""agents@1 — the Python twin of the checks of engine/src/47_lib_agents.js (docs/library/agents.md): check_spec(spec), exprs(spec)
and keys(spec) give the same problems (code, path, message, level) and the same lists as the JS checkSpec / exprs / keys
(tests/lib_agents.js and tests/enginelib.js compare them on tests/fixtures/enginelib/agents.json). It does not simulate."""
import enginelib as L

ID = "agents@1"
MAX_AGENTS, MAX_STEPS = 5000, 2000
SPACES = ["continuous", "grid", "network", "none"]
ACTIONS = ["set", "move", "die", "reproduce", "eat", "hunt", "contact", "adopt", "average", "ising", "send", "flock"]
MOVES = ["random", "heading", "gradient", "towards", "away", "empty", "jump"]
PERFS = ["inform", "request", "propose", "accept-proposal", "reject-proposal", "cfp", "query-if", "agree", "refuse", "failure"]
FNS = ["count", "sum", "mean", "min", "max", "frac", "var", "gini", "order"]
PROTOCOLS = ["contractnet", "auction", "negotiation", "coalition", "ipd"]
IPD = ["allc", "alld", "tft", "tf2t", "grim", "pavlov", "random", "gtft", "joss"]
PROTO_NAMES = {
    "contractnet": {"scalar": ["totalCost", "optimalCost", "makespan", "messages", "refusals", "unassigned"], "series": ["load", "winner"]},
    "auction": {"scalar": ["revenue", "revenueHalf", "expectedRevenue", "efficiency", "dominance", "price", "winner", "secondValue"], "series": ["prices"]},
    "negotiation": {"scalar": ["share1", "share2", "rounds", "closedForm", "nashX", "agreement"], "series": ["offers"]},
    "coalition": {"scalar": ["grand", "coreEmpty", "shapleyInCore", "minCoreTotal"], "series": ["shapley"]},
    "ipd": {"scalar": ["winner", "coopRate", "best"], "series": ["scores", "shares", "share"]},
}
CODES = ["budget", "repl-cut", "agent-limit", "message-limit", "no-space", "stopped", "logic-fallback", "norm-parse", "kernel", "nan", "extinct", "lp", "no-agreement"]
TEMPLATES = {
    "schelling": {"size": 30, "density": 0.9, "want": 0.3, "fracA": 0.5},
    "boids": {"N": 150, "w": 100, "speed": 1, "radius": 10, "sep": 0.05, "ali": 0.1, "coh": 0.01, "sepRadius": 2},
    "sir": {"size": 50, "beta": 0.25, "gamma": 0.1, "i0": 0.01},
    "sirnet": {"N": 1000, "k": 4, "p": 0.1, "beta": 0.1, "gamma": 0.1, "i0": 0.01},
    "sirwell": {"N": 2000, "contacts": 1, "beta": 0.25, "gamma": 0.1, "i0": 0.005},
    "sugarscape": {"N": 250, "size": 50, "regrow": 1},
    "wolfsheep": {"size": 40, "sheep": 200, "wolves": 30, "sheepGain": 4, "wolfGain": 20, "sheepRepro": 0.04, "wolfRepro": 0.05, "regrowTime": 30},
    "voter": {"size": 30, "p0": 0.5},
    "ising": {"size": 32, "T": 1.5, "J": 1, "h": 0, "m0": 1},
    "degroot": {"N": 20, "k": 2, "p": 0.2, "selfw": 1},
}
# what the outputs of a template may name (the JS reads them off its template models)
TPL = {
    "schelling": {"reporters": ["similar", "unhappy", "agents"], "vars": ["group"], "breeds": ["person"], "hist": []},
    "boids": {"reporters": ["order", "agents"], "vars": [], "breeds": ["boid"], "hist": []},
    "sir": {"reporters": ["S", "I", "R"], "vars": ["state"], "breeds": ["person"], "hist": []},
    "sirnet": {"reporters": ["S", "I", "R"], "vars": ["state"], "breeds": ["person"], "hist": []},
    "sirwell": {"reporters": ["S", "I", "R"], "vars": ["state"], "breeds": ["person"], "hist": []},
    "sugarscape": {"reporters": ["agents", "meanWealth", "gini", "meanVision"], "vars": ["vision", "metab", "wealth"], "breeds": ["ant"], "hist": ["wealth"]},
    "wolfsheep": {"reporters": ["nSheep", "nWolves", "grass"], "vars": ["energy", "energy"], "breeds": ["sheep", "wolf"], "hist": []},
    "voter": {"reporters": ["mean"], "vars": ["op"], "breeds": ["voter"], "hist": []},
    "ising": {"reporters": ["m", "absm"], "vars": ["s"], "breeds": ["spin"], "hist": []},
    "degroot": {"reporters": ["mean", "spread", "weighted", "wsum"], "vars": ["x"], "breeds": ["node"], "hist": []},
}
SERIES = ["t", "reporter", "hist", "histEdges", "replValues", "agentVar", "messageCount", "violations", "protocolSeries"]
SCALARS = ["final", "stat", "replMean", "replLo", "replHi", "replHalf", "replSd", "count", "steps", "messages", "violations", "fulfilments", "bdi", "protocol", "ops", "flag", "ok"]
SCENES = ["space"]
BDI_NAMES = ["adopted", "achieved", "dropped", "actions"]
BUILTIN = ["x", "y", "heading", "age", "id", "rnd", "deg", "intending"]

SPACE_T = {"kind": "enum:" + "|".join(SPACES) + "!", "w": "numx", "h": "numx", "nx": "int:2:200", "ny": "int:2:200", "torus": "bool", "neighbourhood": "enum:moore|vonneumann|hex", "radius": "numx", "capacity": "int:1:1000",
           "edges": {"$list": {"$list": "fin", "min": 2, "max": 3}, "max": 20000}, "nodes": "int:1:5000", "directed": "bool",
           "generate": {"$obj": {"kind": "enum:ring|er|ws|ba|lattice|complete!", "n": "int:2:5000", "k": "int:1:50", "p": "unit", "m": "int:1:50", "nx": "int:2:200", "ny": "int:2:200"}}}
VAR_T = {"init": "numx!", "type": "enum:num|int|bool|cat", "min": "fin", "max": "fin", "n": "int:2:16"}
ACTION_T = {"do": "enum:" + "|".join(ACTIONS) + "!", "when": "expr", "prob": "numx", "act": "name", "var": "name", "expr": "numx", "how": "enum:" + "|".join(MOVES), "speed": "numx", "turn": "numx", "target": "id", "patch": "name",
            "amount": "numx", "into": "name", "gain": "numx", "breed": "id", "where": "expr", "set": {"$map": "numx", "max": 8}, "weights": "enum:equal|edge", "self": "numx", "J": "numx", "h": "numx", "T": "numx",
            "perf": "enum:" + "|".join(PERFS), "to": "enum:neighbours|all|random|breed", "content": "numx", "contacts": "numx", "share": {"$map": "unit", "max": 8}, "radius": "numx",
            "sep": "numx", "ali": "numx", "coh": "numx", "sepRadius": "numx", "vision": "numx"}
BDI_T = {"commitment": "enum:blind|single|open", "goals": {"$list": {"$obj": {"id": "id!", "when": "expr!", "achieved": "expr!", "impossible": "expr", "priority": "numx"}}, "min": 1, "max": 8},
         "plans": {"$list": {"$obj": {"id": "id!", "goal": "id!", "context": "expr", "body": {"$list": {"$obj": ACTION_T}, "min": 1, "max": 8}}}, "min": 1, "max": 16}}
BREED_T = {"id": "id!", "count": "numx!", "vars": {"$map": {"$obj": VAR_T}, "max": 12}, "place": "enum:random|empty|node|cluster", "rules": {"$list": {"$obj": ACTION_T}, "max": 12}, "bdi": {"$obj": BDI_T}}
AGG_T = {"id": "name!", "of": "enum:neighbours|all|here|inbox!", "breed": "id", "fn": "enum:" + "|".join(FNS) + "!", "expr": "expr", "where": "expr", "perf": "enum:" + "|".join(PERFS)}
REP_T = {"id": "name!", "of": "enum:agents|patches", "breed": "id", "fn": "enum:" + "|".join(FNS) + "!", "expr": "expr", "where": "expr"}
PATCH_T = {"nx": "int:2:200", "ny": "int:2:200", "vars": {"$map": "numx", "max": 8}, "rules": {"$list": {"$obj": {"var": "name!", "expr": "numx!"}}, "max": 8}, "diffuse": {"$list": {"$obj": {"var": "name!", "rate": "numx!"}}, "max": 4}}
NORM_T = {"id": "id!", "kind": "enum:O|F|P!", "act": "expr!", "cond": "expr", "deadline": "expr", "within": "int:1:2000", "until": "expr", "rank": "int:0:100", "issued": "int:0:100000", "mode": "enum:achieve|maintain", "breed": "id", "sanction": {"$obj": {"var": "name!", "add": "numx!"}}}
PROTO_T = {"kind": "enum:" + "|".join(PROTOCOLS) + "!",
           "tasks": "int:1:200", "contractors": "int:1:50", "costMin": "numx", "costMax": "numx", "capacity": "int:1:200", "loadFactor": "numx", "costs": {"$list": {"$list": "fin", "min": 1, "max": 50}, "max": 200},
           "format": "enum:english|dutch|first|second", "bidders": "int:2:50", "rounds": "int:1:2000", "strategy": "enum:truthful|shade|bne", "shade": "unit", "inc": "numx", "reserve": "numx", "values": {"$list": "fin", "max": 50},
           "method": "enum:rubinstein|zeuthen", "d1": "unit", "d2": "unit", "horizon": "int:1:2000", "a1": "numx", "a2": "numx", "step": "numx",
           "players": "int:1:10", "v": "expr", "weights": {"$list": "fin", "max": 10}, "kinds": {"$list": "int:0:1", "max": 10}, "table": {"$list": "fin", "max": 1023},
           "strategies": {"$list": "enum:" + "|".join(IPD), "min": 2, "max": 9}, "noise": "unit", "T": "fin", "R": "fin", "P": "fin", "S": "fin", "generations": "int:0:2000", "generosity": "unit"}
TABLE = {
    "template": "enum:" + "|".join(TEMPLATES), "set": {"$map": "numx", "max": 24},
    "space": {"$obj": SPACE_T}, "globals": {"$map": "numx", "max": 16}, "patches": {"$obj": PATCH_T}, "breeds": {"$list": {"$obj": BREED_T}, "max": 6},
    "aggregates": {"$list": {"$obj": AGG_T}, "max": 12}, "schedule": "enum:random|sync|fixed", "steps": "int:1:2000", "dt": "numx", "every": "int:1:2000", "stop": "expr",
    "reporters": {"$list": {"$obj": REP_T}, "max": 16}, "hist": {"$list": {"$obj": {"id": "id!", "breed": "id", "expr": "expr!", "bins": "int:1:100", "min": "numx!", "max": "numx!"}}, "max": 4},
    "replications": {"$obj": {"n": "int:2:100!", "level": "unit"}}, "interrupts": {"$list": {"$obj": {"at": "int:0:2000", "when": "expr", "set": {"$req": True, "$map": "numx", "max": 8}, "once": "bool"}}, "max": 8},
    "norms": {"$list": {"$obj": NORM_T}, "max": 16}, "protocol": {"$obj": PROTO_T}, "maxOps": "int:1000:4000000",
}
OUT_FIELDS = {"reporter": "name", "stat": "enum:" + "|".join(L.STATS), "hist": "id", "breed": "id", "var": "name", "perf": "enum:" + "|".join(PERFS), "norm": "id", "name": "name", "index": "int:0:9", "code": "enum:" + "|".join(CODES), "colorBy": "name", "patch": "name", "arrows": "bool", "edges": "bool"}

def _obj(v): return isinstance(v, dict)
def _list(v): return v if isinstance(v, list) else []
def _objs(v): return [x for x in _list(v) if _obj(x)]
def _ok_name(v): return L.check_kind("name", v)
def _str(v): return isinstance(v, str)
def _int(v): return L._js_int(v)
def _js(v):   # a number as JS prints it in a template string
    if v is None: return "undefined"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e21: return str(int(v))
    return str(v)

def spec_names(spec):
    s = []
    if _obj(spec.get("consts")): s += list(spec["consts"])
    for p in _objs(spec.get("params")):
        if _str(p.get("id")): s.append(p["id"])
    for d in _objs(spec.get("derived")):
        if _str(d.get("id")): s.append(d["id"])
    return s

def _tpl(m):
    t = m.get("template")
    return t if _str(t) and t in TEMPLATES else None

def names(m):
    breeds = _objs(m.get("breeds"))
    bid = [b.get("id") for b in breeds if _str(b.get("id"))]
    vars_ = {}
    for b in breeds: vars_[b.get("id")] = [k for k in b["vars"] if _ok_name(k)] if _obj(b.get("vars")) else []
    allv = []
    for vs in vars_.values():
        for v in vs:
            if v not in allv: allv.append(v)
    pt = m.get("patches")
    pvars = [k for k in pt["vars"] if _ok_name(k)] if _obj(pt) and _obj(pt.get("vars")) else []
    glob = [k for k in m["globals"] if _ok_name(k)] if _obj(m.get("globals")) else []
    aggs = [a.get("id") for a in _objs(m.get("aggregates")) if _ok_name(a.get("id"))]
    reps = [r.get("id") for r in _objs(m.get("reporters")) if _ok_name(r.get("id"))]
    return {"bid": bid, "vars": vars_, "allVars": allv, "pvars": pvars, "globals": glob, "aggs": aggs, "reps": reps}

def _check_action(a, w, N, m, E, in_body):
    d = a.get("do")
    sp = m["space"].get("kind") if _obj(m.get("space")) else "none"
    def need_var(f):
        if a.get(f) is None: E("value", f"{w}.{f}", f"missing ({d} needs {f})")
        elif _ok_name(a[f]) and a[f] not in N["allVars"]: E("value", f"{w}.{f}", "not a variable of a breed")
    def need_breed(f):
        if a.get(f) is not None and a[f] not in N["bid"]: E("value", f"{w}.{f}", "not a breed")
    if d == "set":
        need_var("var")
        if a.get("expr") is None: E("value", w + ".expr", "missing (set needs expr)")
    if d == "move":
        how = a.get("how")
        if how is None: E("value", w + ".how", "missing (" + ", ".join(MOVES) + ")")
        if how == "gradient":
            if a.get("patch") is None: E("value", w + ".patch", "missing (gradient follows a patch variable)")
            elif _ok_name(a["patch"]) and a["patch"] not in N["pvars"]: E("value", w + ".patch", "not a patch variable")
        if how in ("towards", "away") and a.get("target") not in N["bid"]: E("value", w + ".target", "a breed")
        if how in ("empty", "jump") and sp not in ("grid", "network"): E("value", w + ".how", f"{how} is for a grid or a network")
        if sp == "none": E("value", w + ".how", "a model without space has no movement")
    if d == "eat":
        if a.get("patch") is None: E("value", w + ".patch", "missing (eat takes from a patch variable)")
        elif _ok_name(a["patch"]) and a["patch"] not in N["pvars"]: E("value", w + ".patch", "not a patch variable")
        need_var("into")
    if d == "hunt":
        if a.get("breed") not in N["bid"]: E("value", w + ".breed", "the prey: a breed")
        need_var("into")
    if d == "contact":
        if not _obj(a.get("set")): E("value", w + ".set", "missing (contact sets the other agent's variables)")
        need_breed("breed")
    if d in ("contact", "average", "adopt", "ising"):
        if _obj(a.get("set")):
            for k in a["set"]:
                if _ok_name(k) and k not in N["allVars"]: E("value", f"{w}.set.{k}", "not a variable of a breed")
    if d in ("adopt", "average", "ising"): need_var("var")
    if d == "send" and a.get("perf") is None: E("value", w + ".perf", "missing (a FIPA-ACL performative)")
    if d == "send" and a.get("to") == "breed" and a.get("breed") not in N["bid"]: E("value", w + ".breed", "a breed")
    if d == "flock" and sp != "continuous": E("value", w + ".do", "flocking is for a continuous space")
    if d == "reproduce" and _obj(a.get("share")):
        for k in a["share"]:
            if _ok_name(k) and k not in N["allVars"]: E("value", f"{w}.share.{k}", "not a variable of a breed")
    if in_body and d in ("die", "reproduce"): E("value", w + ".do", "a plan body does not " + d)

def check_spec(spec):
    P, E, W = L.problems()
    if not _obj(spec): E("format", "", "not an object"); return P
    m = spec.get("model"); kinds = ["scalar", "series", "scene"]
    L.walk(m, TABLE, "model", E, W)
    if not _obj(m):
        L.check_outputs(spec, ID, kinds, lambda o, at, E, W: None, E, W); return P
    tpl = _tpl(m)
    proto = m["protocol"] if _obj(m.get("protocol")) else None
    if tpl:
        for k in ["space", "breeds", "patches", "aggregates", "reporters", "protocol"]:
            if m.get(k) is not None: E("value", "model." + k, f"comes from the template {tpl}")
        if _obj(m.get("set")):
            for k in m["set"]:
                if _ok_name(k) and k not in TEMPLATES[tpl]: E("value", "model.set." + k, f"not a parameter of the template {tpl} (its parameters: {', '.join(TEMPLATES[tpl])})")
    elif m.get("set") is not None: E("value", "model.set", "needs a template")
    if proto:
        for k in ["space", "breeds", "patches", "aggregates", "reporters", "norms", "hist"]:
            if m.get(k) is not None: E("value", "model." + k, "a protocol runs on its own (no " + k + ")")
        pk = proto.get("kind")
        if pk == "coalition":
            n = int(proto["players"]) if _int(proto.get("players")) else 3
            if (proto.get("v") is None) == (proto.get("table") is None): E("value", "model.protocol.v", "a coalitional game needs v (an expression over s, w, k0, k1) or table (2^n − 1 values), one of them")
            if isinstance(proto.get("table"), list) and len(proto["table"]) != 2 ** n - 1: E("value", "model.protocol.table", f"needs 2^players − 1 = {2 ** n - 1} values (coalitions by bitmask 1…)")
            for k in ["weights", "kinds"]:
                if isinstance(proto.get(k), list) and len(proto[k]) != n: E("value", "model.protocol." + k, f"needs one value per player ({n})")
        if pk == "contractnet" and isinstance(proto.get("costs"), list):
            costs = proto["costs"]
            T = proto.get("tasks") or len(costs)
            c0 = costs[0] if costs else None
            Cn = proto.get("contractors") or (len(c0) if isinstance(c0, (list, str)) and c0 else (0 if isinstance(c0, (list, str)) else None))
            if len(costs) != T or any(not isinstance(r, list) or len(r) != Cn for r in costs): E("value", "model.protocol.costs", f"needs tasks × contractors ({_js(T)} × {_js(Cn)}) costs")
        if pk == "auction" and isinstance(proto.get("values"), list) and _int(proto.get("bidders")) and len(proto["values"]) != proto["bidders"]: E("value", "model.protocol.values", "needs one value per bidder")
        if pk == "auction" and proto.get("strategy") == "bne" and proto.get("format") in ("english", "second"): W("value", "model.protocol.strategy", "in English and second-price auctions the equilibrium bid is the value itself (truthful)")
    N, sn = names(m), spec_names(spec)
    if not tpl and not proto:
        if not isinstance(m.get("breeds"), list) or not m["breeds"]: E("value", "model.breeds", "missing (at least one breed of agents)")
        if not _obj(m.get("space")): E("value", "model.space", "missing (kind: continuous, grid, network or none)")
        if m.get("steps") is None: E("value", "model.steps", "missing")
    seen = set()
    own = [("globals", N["globals"]), ("aggregates", N["aggs"]), ("reporters", N["reps"]), ("patches.vars", N["pvars"]), ("breeds.vars", N["allVars"])]
    for w, a in own:
        for x in a:
            if x in BUILTIN or x.startswith("my_") or x.startswith("p_"): E("dup-name", "model." + w, f"the name {x} is a built-in name of agents@1 ({', '.join(BUILTIN)}, my_…, p_…)")
            elif x in sn: E("dup-name", "model." + w, f"the name {x} is also a name of the spec (consts, params, derived)")
            elif x in seen: E("dup-name", "model." + w, f"the name {x} is used twice in the model")
            seen.add(x)
    for i, x in enumerate(N["bid"]):
        if N["bid"].index(x) != i: E("dup-name", "model.breeds", f"the breed {x} is listed twice")
    sp = m["space"] if _obj(m.get("space")) else {}
    kind = sp.get("kind")
    if kind == "network" and sp.get("edges") is None and sp.get("generate") is None: E("value", "model.space", "a network needs edges or generate")
    if kind != "network":
        for k in ["edges", "generate", "nodes", "directed"]:
            if sp.get(k) is not None: E("value", "model.space." + k, "only a network has " + k)
    if kind != "grid" and kind is not None:
        for k in ["neighbourhood", "capacity"]:
            if sp.get(k) is not None and not (k == "capacity" and kind == "network"): E("value", "model.space." + k, f"only a grid has {k}")
    if kind == "grid" and (sp.get("w") is not None or sp.get("h") is not None): E("value", "model.space.w", "a grid has nx and ny")
    if kind == "continuous" and (sp.get("nx") is not None or sp.get("ny") is not None): E("value", "model.space.nx", "a continuous space has w and h")
    pt = m.get("patches")
    if _obj(pt):
        if kind not in ("grid", "continuous"): E("value", "model.patches", "patches lie on a grid or a continuous space")
        if kind == "grid" and (pt.get("nx") is not None or pt.get("ny") is not None): E("value", "model.patches.nx", "on a grid the patches are its cells")
        rl = _objs(pt.get("rules"))
        for i, r in enumerate(rl + _objs(pt.get("diffuse"))):
            if _ok_name(r.get("var")) and r["var"] not in N["pvars"]:
                E("value", f"model.patches.{'rules' if i < len(rl) else 'diffuse'}[{i if i < len(rl) else i - len(rl)}].var", "not a patch variable")
    for bi, b in enumerate(_objs(m.get("breeds"))):
        w = f"model.breeds[{bi}]"
        for i, a in enumerate(_objs(b.get("rules"))): _check_action(a, f"{w}.rules[{i}]", N, m, E, False)
        if b.get("place") == "node" and kind != "network": E("value", w + ".place", "node placement is for a network")
        if b.get("place") == "empty" and kind != "grid": E("value", w + ".place", "empty placement is for a grid")
        if _obj(b.get("vars")):
            for k, v in b["vars"].items():
                if _obj(v) and v.get("type") == "cat" and v.get("n") is None: E("value", f"{w}.vars.{k}.n", "missing (a category variable needs n, the number of categories)")
        if _obj(b.get("bdi")):
            gid = [g.get("id") for g in _objs(b["bdi"].get("goals"))]
            plans = _objs(b["bdi"].get("plans"))
            for i, p in enumerate(plans):
                if _str(p.get("goal")) and p["goal"] not in gid: E("value", f"{w}.bdi.plans[{i}].goal", "not a goal of this breed")
                for j, a in enumerate(_objs(p.get("body"))): _check_action(a, f"{w}.bdi.plans[{i}].body[{j}]", N, m, E, True)
            for g in gid:
                if not any(p.get("goal") == g for p in plans): E("value", f"{w}.bdi.goals", f"the goal {_js(g)} has no plan")
    ag = _objs(m.get("aggregates"))
    for i, a in enumerate(ag + _objs(m.get("reporters"))):
        w = f"model.aggregates[{i}]" if i < len(ag) else f"model.reporters[{i - len(ag)}]"
        if a.get("breed") is not None and a["breed"] not in N["bid"]: E("value", w + ".breed", "not a breed")
        fn = a.get("fn")
        if fn in ("sum", "mean", "min", "max", "var", "gini") and a.get("expr") is None: E("value", w + ".expr", f"missing ({fn} needs expr)")
        if fn == "frac" and a.get("where") is None and a.get("expr") is None: E("value", w + ".where", "missing (frac needs where or expr)")
        if fn == "order" and kind != "continuous": E("value", w + ".fn", "order (the alignment of headings) is for a continuous space")
        if a.get("of") == "patches" and not N["pvars"]: E("value", w + ".of", "the model has no patches")
        if a.get("perf") is not None and a.get("of") != "inbox": E("value", w + ".perf", "goes with of: inbox")
    for i, h in enumerate(_objs(m.get("hist"))):
        if h.get("breed") is not None and h["breed"] not in N["bid"]: E("value", f"model.hist[{i}].breed", "not a breed")
    for i, it in enumerate(_objs(m.get("interrupts"))):
        w = f"model.interrupts[{i}]"
        if (it.get("at") is None) == (it.get("when") is None): E("event", w, "needs at (a step) or when (a condition), not both")
        if _obj(it.get("set")):
            for k in it["set"]:
                if _ok_name(k) and k not in N["globals"] and not (tpl and k in TEMPLATES[tpl]): E("value", f"{w}.set.{k}", "not a global of the model")
    norms = _objs(m.get("norms"))
    for i, nm in enumerate(norms):
        w = f"model.norms[{i}]"
        if nm.get("breed") is not None and nm["breed"] not in N["bid"]: E("value", w + ".breed", "not a breed")
        if _obj(nm.get("sanction")) and _ok_name(nm["sanction"].get("var")) and nm["sanction"]["var"] not in N["allVars"]: E("value", w + ".sanction.var", "not a variable of a breed")
        if nm.get("kind") == "P" and nm.get("sanction") is not None: E("value", w + ".sanction", "a permission is never violated")
    if m.get("replications") is not None and proto: E("value", "model.replications", "a protocol repeats by its own rounds")
    reps = TPL[tpl]["reporters"] if tpl else N["reps"]

    def out(o, at, E, W):
        of, kd = o.get("of"), o.get("kind")
        known = SERIES if kd == "series" else SCALARS if kd == "scalar" else SCENES
        if of not in known: E("output", at + ".of", f"{ID} computes as a {kd}: {', '.join(known)}"); return
        for f, k in OUT_FIELDS.items():
            if o.get(f) is not None and not L.check_kind(k, o[f]): E("output", at + "." + f, L.kind_msg(k))
        def need(cond, f, msg):
            if not cond: E("output", at + "." + f, msg)
            return cond
        if of in ("reporter", "final", "stat", "replMean", "replLo", "replHi", "replHalf", "replSd", "replValues"):
            need(_str(o.get("reporter")) and o["reporter"] in reps, "reporter", "a reporter of the model" + (": " + ", ".join(reps) if reps else ""))
        if of == "stat": need(o.get("stat") in L.STATS, "stat", "one of " + ", ".join(L.STATS))
        if _str(of) and of.startswith("repl"): need(_obj(m.get("replications")), "of", "needs model.replications")
        if of in ("hist", "histEdges"): need(any(h.get("id") == o.get("hist") for h in _objs(m.get("hist"))) or bool(tpl and o.get("hist") in TPL[tpl]["hist"]), "hist", "a histogram of model.hist")
        if of == "agentVar": need(_str(o.get("var")) and (o["var"] in N["allVars"] or o["var"] in BUILTIN or bool(tpl and o["var"] in TPL[tpl]["vars"])), "var", "a variable of a breed (or x, y, heading, age)")
        if of == "count" and o.get("breed") is not None: need(o["breed"] in N["bid"] or bool(tpl and o["breed"] in TPL[tpl]["breeds"]), "breed", "a breed")
        if of in ("violations", "fulfilments"):
            need(len(norms) > 0, "of", "needs model.norms")
            if o.get("norm") is not None: need(any(n.get("id") == o["norm"] for n in norms), "norm", "a norm of model.norms")
        if of == "bdi":
            need(any(_obj(b.get("bdi")) for b in _objs(m.get("breeds"))), "of", "needs a breed with bdi")
            need(o.get("name") in BDI_NAMES, "name", "one of " + ", ".join(BDI_NAMES))
        if of in ("protocol", "protocolSeries"):
            if need(bool(proto) and proto.get("kind") in PROTOCOLS, "of", "needs model.protocol"):
                nm = PROTO_NAMES[proto["kind"]][kd]
                need(o.get("name") in nm, "name", f"{proto['kind']} gives as a {kd}: {', '.join(nm)}")
        if of == "space": need(not proto, "of", "a protocol has no space")
        if of == "flag": need(o.get("code") in CODES, "code", "one of " + ", ".join(CODES))
    L.check_outputs(spec, ID, kinds, out, E, W)
    return P

def exprs(spec):
    out = []
    m = spec.get("model") if _obj(spec) and _obj(spec.get("model")) else None
    if not m: return out
    def add(v, p, l):
        if _str(v): out.append([v, p, l])
    if _obj(m.get("set")):
        for k, v in m["set"].items(): add(v, "model.set." + k, [])
    N = names(m); tpl = _tpl(m)
    G = N["globals"] + (list(TEMPLATES[tpl]) if tpl else [])
    Pv = ["p_" + v for v in N["pvars"]]
    def agentL(vs): return vs + BUILTIN + N["aggs"] + Pv + G + ["t"]
    def otherL(vs): return vs + BUILTIN + ["my_" + v for v in vs] + ["my_x", "my_y", "my_id", "content", "from"] + G + ["t"]
    if _obj(m.get("globals")):
        for k, v in m["globals"].items(): add(v, "model.globals." + k, [])
    sp = m["space"] if _obj(m.get("space")) else None
    if sp:
        for k in ["w", "h", "radius"]: add(sp.get(k), "model.space." + k, G)
    pt = m.get("patches")
    if _obj(pt):
        pl = N["pvars"] + ["px", "py", "t"] + G
        if _obj(pt.get("vars")):
            for k, v in pt["vars"].items(): add(v, "model.patches.vars." + k, ["px", "py"] + G)
        for i, r in enumerate(_objs(pt.get("rules"))): add(r.get("expr"), f"model.patches.rules[{i}].expr", pl)
        for i, r in enumerate(_objs(pt.get("diffuse"))): add(r.get("rate"), f"model.patches.diffuse[{i}].rate", G + ["t"])
    def action_exprs(a, w, own):
        Lx, O = agentL(own), otherL(N["allVars"])
        add(a.get("when"), w + ".when", Lx); add(a.get("prob"), w + ".prob", Lx); add(a.get("expr"), w + ".expr", Lx)
        for k in ["speed", "turn", "amount", "gain", "self", "J", "h", "T", "content", "contacts", "radius", "sep", "ali", "coh", "sepRadius", "vision"]: add(a.get(k), f"{w}.{k}", Lx)
        add(a.get("where"), w + ".where", O)
        if _obj(a.get("set")):
            for k, v in a["set"].items(): add(v, f"{w}.set.{k}", O)
    for bi, b in enumerate(_objs(m.get("breeds"))):
        w = f"model.breeds[{bi}]"; own = N["vars"].get(b.get("id")) or []
        add(b.get("count"), w + ".count", G)
        if _obj(b.get("vars")):
            for k, v in b["vars"].items():
                if _obj(v): add(v.get("init"), f"{w}.vars.{k}.init", ["x", "y", "id", "rnd", "deg"] + G)
        for i, a in enumerate(_objs(b.get("rules"))): action_exprs(a, f"{w}.rules[{i}]", own)
        if _obj(b.get("bdi")):
            Lx = agentL(own)
            for i, g in enumerate(_objs(b["bdi"].get("goals"))):
                for k in ["when", "achieved", "impossible", "priority"]: add(g.get(k), f"{w}.bdi.goals[{i}].{k}", Lx)
            for i, p in enumerate(_objs(b["bdi"].get("plans"))):
                add(p.get("context"), f"{w}.bdi.plans[{i}].context", Lx)
                for j, a in enumerate(_objs(p.get("body"))): action_exprs(a, f"{w}.bdi.plans[{i}].body[{j}]", own)
    for i, a in enumerate(_objs(m.get("aggregates"))):
        add(a.get("expr"), f"model.aggregates[{i}].expr", otherL(N["allVars"])); add(a.get("where"), f"model.aggregates[{i}].where", otherL(N["allVars"]))
    for i, r in enumerate(_objs(m.get("reporters"))):
        Lx = N["pvars"] + ["px", "py", "t"] + G if r.get("of") == "patches" else N["allVars"] + BUILTIN + N["aggs"] + Pv + G + ["t"]
        add(r.get("expr"), f"model.reporters[{i}].expr", Lx); add(r.get("where"), f"model.reporters[{i}].where", Lx)
    for i, h in enumerate(_objs(m.get("hist"))):
        add(h.get("expr"), f"model.hist[{i}].expr", N["allVars"] + BUILTIN + N["aggs"] + Pv + G + ["t"]); add(h.get("min"), f"model.hist[{i}].min", []); add(h.get("max"), f"model.hist[{i}].max", [])
    R = (TPL[tpl]["reporters"] if tpl else N["reps"]) + G + ["t"]
    add(m.get("dt"), "model.dt", []); add(m.get("stop"), "model.stop", R)
    for i, it in enumerate(_objs(m.get("interrupts"))):
        add(it.get("when"), f"model.interrupts[{i}].when", R)
        if _obj(it.get("set")):
            for k, v in it["set"].items(): add(v, f"model.interrupts[{i}].set.{k}", R)
    for i, n in enumerate(_objs(m.get("norms"))):
        if _obj(n.get("sanction")): add(n["sanction"].get("add"), f"model.norms[{i}].sanction.add", N["allVars"] + BUILTIN + G + ["t"])
    if _obj(m.get("protocol")):
        p = m["protocol"]
        for k in ["costMin", "costMax", "loadFactor", "inc", "reserve", "a1", "a2", "step"]: add(p.get(k), "model.protocol." + k, [])
        add(p.get("v"), "model.protocol.v", ["s", "w", "k0", "k1"])
    return out

def keys(spec): return []
