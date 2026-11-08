"""ode@1 — the Python twin of the checks of src/engines/ode/ode.js (docs/library/ode.md): check_spec(spec), exprs(spec) and keys(spec)
give the same problems (code, path, message, level) and the same lists as the JS checkSpec / exprs / keys (tests/enginelib.js compares
them on tests/fixtures/enginelib/ode.json). It does not simulate. TMETA is the JS templateMeta() (tests/lib_ode.js checks they agree)."""
import enginelib as L

ID = "ode@1"
METHODS = ["auto", "dopri5", "rosenbrock", "rk4", "heun", "midpoint", "euler", "verlet", "yoshida4"]
FIXED = ["rk4", "heun", "midpoint", "euler", "verlet", "yoshida4"]
CODES = ["nan", "blow-up", "step-underflow", "budget", "time", "map-escape", "zeno", "stiff", "stiff-switched", "event-limit",
         "newton", "non-hyperbolic", "eigen", "lyap-short", "invariant-drift", "period-not-found", "template-quantity", "degenerate-closed-form", "stopped"]
MAX_STEPS, DEF_STEPS, MAX_EVENTS = 200000, 50000, 2000
SERIES = ["t", "state", "eventTime", "eventState", "invariant", "lyapT", "lyapRun", "sweepParam", "sweepValue"]
SCALARS = ["final", "stat", "at", "eventCount", "eventTime", "eventPeriod", "period", "drift", "eqCount", "eq", "eigRe", "eigIm", "eqStable", "eqType",
           "lyap", "lyapSum", "kaplanYorke", "quantity", "steps", "rejected", "flag", "ok"]
SCENES = ["phase", "cobweb", "orbit", "section"]
TMETA = {
    "sir": {"kind":"ode","params":["beta","gamma","mu","N","I0","Rinit"],"states":["S","I","R"],"aux":[],"delays":[],"events":["peak"],"invariants":["total"],"quantities":["R0","herd","finalSize","peakI","Sstar","Istar","period"],"pairs":False},
    "seir": {"kind":"ode","params":["beta","sigma","gamma","mu","N","E0","I0"],"states":["S","E","I","R"],"aux":[],"delays":[],"events":[],"invariants":["total"],"quantities":["R0","herd","growth"],"pairs":False},
    "sirs": {"kind":"ode","params":["beta","gamma","omega","N","I0"],"states":["S","I","R"],"aux":[],"delays":[],"events":[],"invariants":["total"],"quantities":["R0","Istar"],"pairs":False},
    "pk": {"kind":"ode","params":["dose","V","CL","ka","F","tau","doses","rate","Tinf"],"states":["Ag","Ac"],"aux":["C","k"],"delays":[],"events":["dose","infusionEnd"],"invariants":[],"quantities":["k","thalf","AUC","tmax","Cmax","Racc","CssMax","CssMin","Cavg","Css","loading"],"pairs":False},
    "pk2": {"kind":"ode","params":["dose","V1","k10","k12","k21"],"states":["A1","A2"],"aux":["C"],"delays":[],"events":[],"invariants":[],"quantities":["alpha","beta","A","B","Vss","thalfBeta"],"pairs":False},
    "mm": {"kind":"ode","params":["Vmax","Km","S0","I","Ki","Kiu"],"states":["S","P"],"aux":["ac","au","v"],"delays":[],"events":[],"invariants":["mass"],"quantities":["KmApp","VmaxApp","v0","Sexact","IC50"],"pairs":False},
    "mmfull": {"kind":"ode","params":["k1","km1","k2","E0","S0"],"states":["E","S","Cx","P"],"aux":[],"delays":[],"events":[],"invariants":["enzyme","substrate"],"quantities":["Km","Vmax","qssaRatio"],"pairs":False},
    "logistic": {"kind":"ode","params":["r","K","N0"],"states":["N"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["Nexact","tInflect","maxRate","doubling"],"pairs":False},
    "gompertz": {"kind":"ode","params":["r","K","N0"],"states":["N"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["Nexact","Ninflect","tInflect"],"pairs":False},
    "allee": {"kind":"ode","params":["r","K","A","N0"],"states":["N"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["threshold"],"pairs":False},
    "lv": {"kind":"ode","params":["alpha","beta","gamma","delta","x0","y0"],"states":["x","y"],"aux":[],"delays":[],"events":["cycle"],"invariants":["H"],"quantities":["xStar","yStar","smallPeriod"],"pairs":False},
    "rm": {"kind":"ode","params":["r","K","a","h","eff","m","x0","y0"],"states":["x","y"],"aux":["fr"],"delays":[],"events":["cycle"],"invariants":[],"quantities":["xStar","yStar","Kc"],"pairs":False},
    "competition": {"kind":"ode","params":["r1","r2","K1","K2","a12","a21","N10","N20"],"states":["N1","N2"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["outcome","N1star","N2star"],"pairs":False},
    "chemostat": {"kind":"ode","params":["mumax","Ks","Y","Sin","D","S0","X0"],"states":["S","X"],"aux":["mu"],"delays":[],"events":[],"invariants":[],"quantities":["Sstar","Xstar","Dc","Dopt"],"pairs":False},
    "toggle": {"kind":"ode","params":["a1","a2","beta","gamma","iptg","Kd","eta","u0","v0"],"states":["u","v"],"aux":["ue"],"delays":[],"events":[],"invariants":[],"quantities":[],"pairs":False},
    "repressilator": {"kind":"ode","params":["alpha","alpha0","beta","nH","m10","m20","m30"],"states":["m1","m2","m3","p1","p2","p3"],"aux":[],"delays":[],"events":["cycle"],"invariants":[],"quantities":[],"pairs":False},
    "hh": {"kind":"ode","params":["I","Ipulse","tOn","tDur","temp","gNa","gK","gL","ENa","EK","EL","Cm"],"states":["V","m","h","nK"],"aux":["phi","am","bm","ah","bh","an","bn","Iapp","INa","IK","IL"],"delays":[],"events":["spike","pulseOn","pulseOff"],"invariants":[],"quantities":["phi"],"pairs":False},
    "fhn": {"kind":"ode","params":["a","b","eps","I","v0","w0"],"states":["v","w"],"aux":[],"delays":[],"events":["spike"],"invariants":[],"quantities":["IH1","IH2"],"pairs":False},
    "pendulum": {"kind":"ode","params":["g","L","q","F","w","theta0","omega0"],"states":["theta","omega"],"aux":[],"delays":[],"events":["turn"],"invariants":["E"],"quantities":["T0","T","ratio"],"pairs":True},
    "lorenz": {"kind":"ode","params":["sigma","rho","beta","x0","y0","z0"],"states":["x","y","z"],"aux":[],"delays":[],"events":["zmax"],"invariants":[],"quantities":["rhoH","Cx","divergence"],"pairs":False},
    "rossler": {"kind":"ode","params":["a","b","c","x0","y0","z0"],"states":["x","y","z"],"aux":[],"delays":[],"events":["section"],"invariants":[],"quantities":[],"pairs":False},
    "vdp": {"kind":"ode","params":["mu","x0","y0"],"states":["x","y"],"aux":[],"delays":[],"events":["up"],"invariants":[],"quantities":["relaxPeriod"],"pairs":False},
    "brusselator": {"kind":"ode","params":["A","B","x0","y0"],"states":["x","y"],"aux":[],"delays":[],"events":["up"],"invariants":[],"quantities":["Bhopf","xStar","yStar"],"pairs":False},
    "duffing": {"kind":"ode","params":["delta","alpha","beta","gamma","omega","x0","v0"],"states":["x","v"],"aux":[],"delays":[],"events":["strobe"],"invariants":[],"quantities":["forcingPeriod"],"pairs":False},
    "robertson": {"kind":"ode","params":["k1","k2","k3"],"states":["y1","y2","y3"],"aux":[],"delays":[],"events":[],"invariants":["mass"],"quantities":[],"pairs":False},
    "arenstorf": {"kind":"ode","params":["mu","x0","vy0"],"states":["x","y","vx","vy"],"aux":["D1","D2"],"delays":[],"events":[],"invariants":[],"quantities":["period"],"pairs":False},
    "kepler": {"kind":"ode","params":["GM","x0","y0","vx0","vy0"],"states":["x","y","vx","vy"],"aux":["r3"],"delays":[],"events":[],"invariants":["energy","angmom"],"quantities":["period"],"pairs":True},
    "logisticmap": {"kind":"map","params":["r","x0"],"states":["x"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["fixedPoint","r2","feigenbaum"],"pairs":False},
    "ricker": {"kind":"map","params":["r","x0"],"states":["x"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["fixedPoint","flip"],"pairs":False},
    "henon": {"kind":"map","params":["a","b","x0","y0"],"states":["x","y"],"aux":[],"delays":[],"events":[],"invariants":[],"quantities":["fpX"],"pairs":False},
    "delaylogistic": {"kind":"dde","params":["r","K","tau","x0"],"states":["x"],"aux":[],"delays":["xd"],"events":["up"],"invariants":[],"quantities":["tauHopf"],"pairs":False},
    "mackeyglass": {"kind":"dde","params":["beta","gamma","nH","tau","x0"],"states":["x"],"aux":[],"delays":["xd"],"events":[],"invariants":[],"quantities":[],"pairs":False},
}
TEMPLATE_NAMES = list(TMETA)

SOLVE = {"t0": "numx", "tEnd": "numx!", "method": "enum:" + "|".join(METHODS), "dt": "numx", "hmax": "numx", "rtol": "pos", "atol": "pos", "points": "int:2:2000", "maxSteps": "int:1:200000", "transient": "numx"}
EVENT = {"id": "id!", "when": "expr", "dir": "int:-1:1", "at": "numx", "every": "numx", "count": "int:1:2000", "set": {"$map": "expr", "max": 12}, "stop": "bool"}
TABLE = {
    "kind": "enum:ode|map|dde", "template": "enum:" + "|".join(TEMPLATE_NAMES), "set": {"$map": "numx", "max": 24},
    "states": {"$list": {"$obj": {"id": "name!", "init": "numx!"}}, "min": 1, "max": 12}, "rhs": {"$map": "expr", "max": 12}, "next": {"$map": "expr", "max": 12},
    "aux": {"$list": {"$obj": {"id": "name!", "expr": "expr!"}}, "max": 24}, "delays": {"$list": {"$obj": {"id": "name!", "of": "name!", "tau": "numx!", "history": "numx"}}, "max": 4},
    "events": {"$list": {"$obj": EVENT}, "max": 8}, "pairs": {"$list": {"$obj": {"q": "name!", "p": "name!"}}, "max": 6},
    "invariants": {"$list": {"$obj": {"id": "name!", "expr": "expr!"}}, "max": 4},
    "solve": {"$req": True, "$obj": SOLVE},
    "equilibria": {"$obj": {"box": {"$map": {"$list": "numx", "min": 2, "max": 2}, "max": 12}, "grid": "int:1:16"}},
    "lyapunov": {"$obj": {"k": "int:1:4", "every": "numx", "transient": "numx"}},
    "sweep": {"$obj": {"var": "name!", "value": "numx!", "min": "numx!", "max": "numx!", "points": "int:2:400", "of": "name!", "keep": "int:1:200", "transient": "numx"}},
    "phase": {"$obj": {"x": "name!", "y": "name!", "xmin": "numx", "xmax": "numx", "ymin": "numx", "ymax": "numx", "field": "int:0:25", "nullclines": "bool"}},
}

def _obj(v): return isinstance(v, dict)
def _list(v): return v if isinstance(v, list) else []
def _objs(v): return [x for x in _list(v) if _obj(x)]
def _ok_name(v): return L.check_kind("name", v)
def _num(v): return isinstance(v, (int, float)) and not isinstance(v, bool)
def _int(v): return L._js_int(v)
def _n(v): return int(v) if _num(v) and float(v).is_integer() else v   # numbers in messages as JS prints them
def _str(v): return isinstance(v, str)

def spec_names(spec):
    s = []
    if _obj(spec.get("consts")): s += list(spec["consts"])
    for p in _objs(spec.get("params")):
        if _str(p.get("id")): s.append(p["id"])
    for d in _objs(spec.get("derived")):
        if _str(d.get("id")): s.append(d["id"])
    return s

def model_names(m):
    tpl = TMETA.get(m.get("template")) if _str(m.get("template")) else None
    kind = tpl["kind"] if tpl else (m["kind"] if _str(m.get("kind")) else "ode")
    ids = lambda a: [x.get("id") for x in _objs(a) if _ok_name(x.get("id"))]
    states = list(tpl["states"]) if tpl else ids(m.get("states"))
    aux = (list(tpl["aux"]) if tpl else []) + ids(m.get("aux"))
    delays = list(tpl["delays"]) if tpl else ids(m.get("delays"))
    invariants = (list(tpl["invariants"]) if tpl else []) + ids(m.get("invariants"))
    events = (list(tpl["events"]) if tpl else []) + [e.get("id") for e in _objs(m.get("events")) if _str(e.get("id"))]
    sw = m.get("sweep")
    sweep_var = [sw["var"]] if _obj(sw) and _ok_name(sw.get("var")) else []
    return {"tpl": tpl, "kind": kind, "states": states, "aux": aux, "delays": delays, "invariants": invariants, "events": events,
            "params": list(tpl["params"]) if tpl else [], "sweepVar": sweep_var}

def local_names(N): return N["states"] + N["aux"] + N["delays"] + N["params"] + N["sweepVar"] + ["n" if N["kind"] == "map" else "t"]

def check_spec(spec):
    P, E, W = L.problems()
    if not _obj(spec): E("format", "", "not an object"); return P
    m = spec.get("model")
    L.walk(m, TABLE, "model", E, W)
    if not _obj(m):
        L.check_outputs(spec, ID, ["scalar", "series", "scene"], lambda o, at, E, W: None, E, W); return P
    N = model_names(m); tpl = N["tpl"]
    if tpl:
        if m.get("kind") is not None and m.get("kind") != tpl["kind"]: E("value", "model.kind", f"the template {m['template']} is of kind {tpl['kind']}")
        for k in ["states", "rhs", "next", "delays", "pairs"]:
            if m.get(k) is not None: E("value", "model." + k, f"comes from the template {m['template']}")
        if _obj(m.get("set")):
            for k in m["set"]:
                if _ok_name(k) and k not in tpl["params"]: E("value", "model.set." + k, f"not a parameter of the template {m['template']} (its parameters: {', '.join(tpl['params'])})")
    else:
        if m.get("set") is not None: E("value", "model.set", "needs a template")
        if m.get("states") is None: E("value", "model.states", "missing")
        eq, other = ("next", "rhs") if N["kind"] == "map" else ("rhs", "next")
        if m.get(other) is not None: E("value", "model." + other, "a map is given by next" if N["kind"] == "map" else "an ODE or a delay equation is given by rhs")
        if isinstance(m.get("states"), list):
            if not _obj(m.get(eq)):
                if m.get(eq) is None: E("value", "model." + eq, "missing")
            else:
                for s in N["states"]:
                    if s not in m[eq]: E("value", f"model.{eq}.{s}", "missing (every state needs its equation)")
                for k in m[eq]:
                    if _ok_name(k) and k not in N["states"]: E("value", f"model.{eq}.{k}", "not a state")
        if N["kind"] == "dde" and not (isinstance(m.get("delays"), list) and len(m["delays"])): E("value", "model.delays", "a delay equation needs at least one delay {id, of, tau}")
        if N["kind"] != "dde" and m.get("delays") is not None: E("value", "model.delays", "only a delay equation (kind dde) has delays")
        for i, d in enumerate(_objs(m.get("delays"))):
            if _ok_name(d.get("of")) and d["of"] not in N["states"]: E("value", f"model.delays[{i}].of", "not a state")
    seen, sn = set(), spec_names(spec)
    for w, a in [("states", N["states"]), ("aux", N["aux"]), ("delays", N["delays"]), ("invariants", N["invariants"]), ("sweep", N["sweepVar"])]:
        for x in a:
            if x in seen or x in N["params"]: E("dup-name", "model." + w, f"the name {x} is used twice in the model")
            elif x in sn: E("dup-name", "model." + w, f"the name {x} is also a name of the spec (consts, params, derived)")
            seen.add(x)
    for i, e in enumerate(_objs(m.get("events"))):
        w = f"model.events[{i}]"
        if (e.get("when") is None) == (e.get("at") is None): E("event", w, "needs when (a crossing) or at (a time), not both")
        if e.get("at") is None and (e.get("every") is not None or e.get("count") is not None): E("event", w, "every and count go with at")
        if e.get("when") is None and e.get("dir") is not None: E("event", w + ".dir", "goes with when")
        if _obj(e.get("set")):
            for k in e["set"]:
                if _ok_name(k) and k not in N["states"]: E("value", f"{w}.set.{k}", "not a state")
    ev = N["events"]
    for i, x in enumerate(ev):
        if ev.index(x) != i: E("dup-name", "model.events", f"the event {x} is listed twice")
    if N["kind"] == "map" and m.get("events") is not None: E("value", "model.events", "a map has no events")
    sv = m["solve"] if _obj(m.get("solve")) else {}
    method = sv["method"] if _str(sv.get("method")) else "auto"
    if N["kind"] == "map":
        if any(sv.get(k) is not None for k in ["method", "dt", "rtol", "atol", "hmax"]): W("unknown-field", "model.solve", "a map iterates: method, dt, rtol, atol and hmax are ignored")
    else:
        if method in FIXED and sv.get("dt") is None: E("value", "model.solve.dt", f"missing ({', '.join(FIXED)} take a fixed step dt)")
        if N["kind"] == "dde" and method == "rosenbrock": E("method", "model.solve.method", "a delay equation needs an explicit method: auto, dopri5, rk4, heun, midpoint or euler")
        if N["kind"] == "dde" and method in ("verlet", "yoshida4"): E("method", "model.solve.method", "a delay equation needs an explicit method: auto, dopri5, rk4, heun, midpoint or euler")
        if method in ("verlet", "yoshida4"):
            if not tpl and not (isinstance(m.get("pairs"), list) and len(m["pairs"])): E("value", "model.pairs", f"{method} needs the pairs {{q, p}} of a separable system")
            elif tpl and not tpl["pairs"]: E("method", "model.solve.method", f"the template {m['template']} has no pairs {{q, p}} for {method}")
            elif not tpl:
                used = []
                for i, p in enumerate(_objs(m.get("pairs"))):
                    for k in ["q", "p"]:
                        if _ok_name(p.get(k)):
                            if p[k] not in N["states"]: E("value", f"model.pairs[{i}].{k}", "not a state")
                            elif p[k] in used: E("value", f"model.pairs[{i}].{k}", "in two pairs")
                            used.append(p[k])
                for s in N["states"]:
                    if s not in used: E("value", "model.pairs", f"the state {s} is in no pair")
        elif m.get("pairs") is not None: W("unknown-field", "model.pairs", "only verlet and yoshida4 use pairs")
    t0 = sv["t0"] if _num(sv.get("t0")) else 0
    max_steps = _n(sv["maxSteps"]) if _int(sv.get("maxSteps")) else DEF_STEPS
    te = sv.get("tEnd")
    if _num(te):
        if not te > t0: E("value", "model.solve.tEnd", "must be after t0")
        elif N["kind"] == "map" and (not _int(te) or te > max_steps): E("budget", "model.solve.tEnd", f"a map runs a whole number of iterations, at most maxSteps ({max_steps})")
        elif N["kind"] != "map" and method in FIXED and _num(sv.get("dt")) and sv["dt"] > 0 and (te - t0) / sv["dt"] > max_steps: E("budget", "model.solve.dt", f"(tEnd − t0)/dt is more than maxSteps ({max_steps}) steps")
    if _num(sv.get("dt")) and not sv["dt"] > 0: E("value", "model.solve.dt", "needs a number > 0")
    eqm = m.get("equilibria")
    if _obj(eqm):
        box = list(eqm["box"]) if _obj(eqm.get("box")) else []
        for k in box:
            if _ok_name(k) and k not in N["states"]: E("value", "model.equilibria.box." + k, "not a state")
        g = eqm["grid"] if _int(eqm.get("grid")) else 3
        if g ** len(box) > 512: E("budget", "model.equilibria.grid", "grid^(states in the box) is more than 512 starting points")
        if N["kind"] == "dde": W("unknown-field", "model.equilibria", "a delay equation: equilibria without eigenvalues")
    ly = m.get("lyapunov")
    if _obj(ly):
        k = _n(ly["k"]) if _int(ly.get("k")) else 1
        if N["kind"] == "dde": E("value", "model.lyapunov", "not for a delay equation")
        elif k > len(N["states"]): E("value", "model.lyapunov.k", f"at most the number of states ({len(N['states'])})")
    s = m.get("sweep")
    if _obj(s):
        if _ok_name(s.get("of")) and s["of"] not in N["states"]: E("value", "model.sweep.of", "not a state")
        if N["kind"] == "map" and _num(s.get("transient")):
            pts = s["points"] if _int(s.get("points")) else 200
            keep = s["keep"] if _int(s.get("keep")) else 50
            if not (_int(s["transient"]) and s["transient"] >= 0): E("value", "model.sweep.transient", "needs a whole number of iterations >= 0")
            elif pts * (s["transient"] + keep) > max_steps: E("budget", "model.sweep", f"points × (transient + keep) is more than maxSteps ({max_steps}) iterations")
    ph = m.get("phase")
    if _obj(ph):
        for k in ["x", "y"]:
            if _ok_name(ph.get(k)) and ph[k] not in N["states"]: E("value", "model.phase." + k, "not a state")
        if ph.get("x") == ph.get("y"): E("value", "model.phase.y", "must differ from x")
    ev_ids, inv, vars_ = N["events"], N["invariants"], N["states"] + N["aux"] + N["delays"]
    k_ly = (_n(ly["k"]) if _int(ly.get("k")) else 1) if _obj(ly) else 0
    ns = len(N["states"])

    def out(o, at, E, W):
        def need(cond, f, msg):
            if not cond: E("output", at + "." + f, msg)
            return cond
        var_ok = lambda: need(_str(o.get("var")) and o["var"] in vars_, "var", "a state or aux of the model")
        ev_ok = lambda: need(_str(o.get("event")) and o["event"] in ev_ids, "event", "an event of the model")
        of, kd = o["of"], o["kind"]
        known = SERIES if kd == "series" else SCALARS if kd == "scalar" else SCENES
        if of not in known: E("output", at + ".of", f"{ID} computes as a {kd}: {', '.join(known)}"); return
        if of in ("state", "final", "stat", "at", "period"): var_ok()
        if of == "stat": need(o.get("stat") in L.STATS, "stat", "one of " + ", ".join(L.STATS))
        if of == "at": need(o.get("t") is not None and L.check_kind("numx", o["t"]), "t", "needs a number or an expression (the time)")
        if of in ("eventTime", "eventState", "eventCount", "eventPeriod"): ev_ok()
        if of == "eventState": var_ok()
        if of == "eventTime" and kd == "scalar": need(_int(o.get("nth")) and o["nth"] != 0 and abs(o["nth"]) <= MAX_EVENTS, "nth", "a whole number ±1–2000 (1 the first, −1 the last)")
        if of in ("invariant", "drift"): need(_str(o.get("var")) and o["var"] in inv, "var", "an invariant of the model")
        if of in ("eqCount", "eq", "eigRe", "eigIm", "eqStable", "eqType"):
            if need(_obj(eqm), "of", "needs model.equilibria"):
                if of != "eqCount": need(_int(o.get("index")) and 0 <= o["index"] < 64, "index", "a whole number 0–63 (the equilibria sorted by their states)")
                if of == "eq": var_ok()
                if of in ("eigRe", "eigIm"): need(_int(o.get("k")) and 0 <= o["k"] < ns, "k", f"a whole number 0–{ns - 1} (the eigenvalues by decreasing real part)")
        if of in ("lyapT", "lyapRun", "lyap", "lyapSum", "kaplanYorke") and need(k_ly > 0, "of", "needs model.lyapunov"):
            if of in ("lyap", "lyapRun"): need(_int(o.get("k")) and 1 <= o["k"] <= k_ly, "k", f"a whole number 1–{k_ly} (model.lyapunov.k)")
            if of == "kaplanYorke": need(k_ly == ns, "of", "needs the whole spectrum (model.lyapunov.k = the number of states)")
        if of in ("sweepParam", "sweepValue", "orbit"): need(_obj(s), "of", "needs model.sweep")
        if of == "quantity":
            if need(bool(tpl), "of", "a quantity comes from a template"):
                need(_str(o.get("name")) and o["name"] in tpl["quantities"], "name", f"a quantity of the template {m['template']}: {', '.join(tpl['quantities']) or '(none)'}")
        if of == "flag": need(o.get("code") in CODES, "code", "one of " + ", ".join(CODES))
        if of == "phase": need(_obj(ph), "of", "needs model.phase")
        if of == "cobweb":
            if need(N["kind"] == "map", "of", "a cobweb is for a map"): var_ok()
        if of == "section":
            if ev_ok():
                for f in ["x", "y"]: need(_str(o.get(f)) and o[f] in vars_, f, "a state or aux of the model")
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P

def exprs(spec):
    out = []
    m = spec.get("model") if _obj(spec) else None
    if not _obj(m): return out
    N = model_names(m); loc = local_names(N)
    def add(v, p, l):
        if _str(v): out.append([v, p, l])
    if _obj(m.get("set")):
        for k, v in m["set"].items(): add(v, "model.set." + k, [])
    for i, s in enumerate(_objs(m.get("states"))): add(s.get("init"), f"model.states[{i}].init", [])
    for eq in ["rhs", "next"]:
        if _obj(m.get(eq)):
            for k, v in m[eq].items(): add(v, f"model.{eq}.{k}", loc)
    for i, a in enumerate(_objs(m.get("aux"))): add(a.get("expr"), f"model.aux[{i}].expr", loc)
    for i, d in enumerate(_objs(m.get("delays"))):
        add(d.get("tau"), f"model.delays[{i}].tau", []); add(d.get("history"), f"model.delays[{i}].history", [])
    for i, e in enumerate(_objs(m.get("events"))):
        add(e.get("when"), f"model.events[{i}].when", loc); add(e.get("at"), f"model.events[{i}].at", []); add(e.get("every"), f"model.events[{i}].every", [])
        if _obj(e.get("set")):
            for k, v in e["set"].items(): add(v, f"model.events[{i}].set.{k}", loc)
    for i, v in enumerate(_objs(m.get("invariants"))): add(v.get("expr"), f"model.invariants[{i}].expr", loc)
    if _obj(m.get("solve")):
        for k in ["t0", "tEnd", "dt", "hmax", "transient"]: add(m["solve"].get(k), "model.solve." + k, [])
    if _obj(m.get("equilibria")) and _obj(m["equilibria"].get("box")):
        for k, v in m["equilibria"]["box"].items():
            for j, x in enumerate(_list(v)): add(x, f"model.equilibria.box.{k}[{j}]", [])
    if _obj(m.get("lyapunov")):
        for k in ["every", "transient"]: add(m["lyapunov"].get(k), "model.lyapunov." + k, [])
    if _obj(m.get("sweep")):
        for k in ["value", "min", "max", "transient"]: add(m["sweep"].get(k), "model.sweep." + k, [])
    if _obj(m.get("phase")):
        for k in ["xmin", "xmax", "ymin", "ymax"]: add(m["phase"].get(k), "model.phase." + k, [])
    for i, o in enumerate(_list(spec.get("outputs"))):
        if _obj(o) and o.get("of") == "at": add(o.get("t"), f"outputs[{i}].t", [])
    return out

def keys(spec): return []
