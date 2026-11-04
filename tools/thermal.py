"""The checks of the thermal engine thermal@1 in Python (docs/activities-dev/thermal.md): the twin of check() and checkSpec() in
engine/src/39_engine_thermal.js — the same codes, paths and messages (tests/thermal.js runs both on the same networks and specs).
The validators use it to check a sim-spec@1 spec whose engine is thermal@1; it does not simulate. Stdlib only.

  check(network)  → [{code, path, msg, level: 'error' | 'warning'}]   (a noema.thermal/v1 network)
  check_spec(spec) → the same for a spec's model and outputs, paths from the spec (model.…, outputs[i]…)"""
import math, re

ID, FORMAT = "thermal@1", "noema.thermal/v1"
MAX_NODES, MAX_LINKS, MAX_SOURCES, MAX_THERMOSTATS, MAX_STEPS, MAX_POINTS, MAX_BINDINGS = 50, 200, 24, 8, 200000, 20001, 24
K0 = 273.15
STATS = ["final", "min", "max", "mean", "pp", "rms"]
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]{0,31}\Z")
MSG = {"pos": "needs a number > 0", "nonneg": "needs a number ≥ 0", "fin": "needs a number", "temp": "needs a temperature (°C) above -273.15",
       "eps": "needs a number in (0, 1]", "unit": "needs a number from 0 to 1"}
WAVE_FIELDS = {   # (in the JS order: the messages come out in it)
    "step": [("P", "fin!"), ("t0", "nonneg"), ("P0", "fin")],
    "pwm": [("P", "fin!"), ("freq", "pos!"), ("duty", "unit!"), ("low", "fin"), ("delay", "nonneg")],
    "sine": [("offset", "fin"), ("amp", "fin!"), ("freq", "pos!"), ("phase", "fin")],
}
TOP_KEYS = ["format", "ambient", "nodes", "links", "sources", "thermostats", "meta"]
NODE_KEYS = ["id", "C", "T0", "fixed", "label", "note"]
LINK_KEYS = ["id", "a", "b", "R", "G", "conv", "rad", "label", "note"]
SRC_KEYS = ["id", "node", "P", "label", "note"]
TS_KEYS = ["id", "sensor", "source", "low", "high", "mode", "label", "note"]
LINK_KINDS = ["R", "G", "conv", "rad"]
SUB = {"conv": [("h", "pos"), ("A", "pos")], "rad": [("eps", "eps"), ("A", "pos")]}
MODEL_KEYS = ["network", "bindings", "transient"]
TRAN_KEYS = ["tEnd", "dt", "method", "start", "points"]
OUT_KEYS = ["id", "kind", "node", "link", "source", "thermostat", "tau", "time", "at", "stat"]
OUT_SRC = ["node", "link", "source", "thermostat", "tau", "time"]

def _obj(v): return isinstance(v, dict)
def _num(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
def _int(v): return _num(v) and float(v).is_integer()
def _expr(v): return isinstance(v, str) and v.strip() != ""
def _str(v): return isinstance(v, str)
def _extra(o, allowed): return sorted(k for k in o if k not in allowed)

def ok_num(kind, v):
    if not _num(v): return False
    if kind == "pos": return v > 0
    if kind == "nonneg": return v >= 0
    if kind == "unit": return 0 <= v <= 1
    if kind == "eps": return 0 < v <= 1
    if kind == "temp": return v > -K0
    return True

def _check_fields(q, F, path, E, code):
    for k in _extra(q, [f for f, _ in F]): E(code, f"{path}.{k}", "unknown field")
    for k, spec in F:
        must = spec.endswith("!"); kd = spec[:-1] if must else spec
        if k not in q:
            if must: E(code, f"{path}.{k}", "missing")
            continue
        if not ok_num(kd, q[k]): E(code, f"{path}.{k}", "out of range")

def _check_wave(v, path, E):
    if not _obj(v):
        if not _num(v): E("value", path, "needs a number or a waveform")
        return
    keys = list(v)
    if len(keys) != 1 or keys[0] not in WAVE_FIELDS: E("value", path, "one of a number, step, pwm, sine"); return
    kind = keys[0]; q = v[kind]
    if not _obj(q): E("value", f"{path}.{kind}", "needs an object"); return
    _check_fields(q, WAVE_FIELDS[kind], f"{path}.{kind}", E, "value")

def check(net):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    W = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    if not _obj(net): E("format", "", "network is not an object"); return P
    if "format" in net and net["format"] != FORMAT: E("format", "format", "not " + FORMAT)
    if not isinstance(net.get("nodes"), list): E("format", "nodes", "not an array")
    if not isinstance(net.get("links"), list): E("format", "links", "not an array")
    if "sources" in net and not isinstance(net["sources"], list): E("format", "sources", "not an array")
    if "thermostats" in net and not isinstance(net["thermostats"], list): E("format", "thermostats", "not an array")
    if P: return P
    for k in _extra(net, TOP_KEYS): W("unknown-field", k, "ignored")
    if "ambient" in net and not ok_num("temp", net["ambient"]): E("value", "ambient", MSG["temp"])
    sources, tss = net.get("sources") or [], net.get("thermostats") or []
    if len(net["nodes"]) > MAX_NODES: E("size", "nodes", f"more than {MAX_NODES} nodes")
    if len(net["links"]) > MAX_LINKS: E("size", "links", f"more than {MAX_LINKS} links")
    if len(sources) > MAX_SOURCES: E("size", "sources", f"more than {MAX_SOURCES} sources")
    if len(tss) > MAX_THERMOSTATS: E("size", "thermostats", f"more than {MAX_THERMOSTATS} thermostats")
    ids, node, src_ids = set(), {}, set()

    def id_ok(o, at):
        i = o.get("id")
        if not _str(i) or not ID_RE.match(i): E("id", at + ".id", "bad id"); return False
        if i == "ambient": E("id", at + ".id", "ambient is reserved"); return False
        if i in ids: E("dup-id", at + ".id", "duplicate id " + i); return False
        ids.add(i); return True

    for i, nd in enumerate(net["nodes"]):
        at = f"nodes[{i}]"
        if not _obj(nd): E("format", at, "node is not an object"); continue
        for k in _extra(nd, NODE_KEYS): W("unknown-field", f"{at}.{k}", "ignored")
        good = id_ok(nd, at)
        if "fixed" in nd:
            if not ok_num("temp", nd["fixed"]): E("value", at + ".fixed", MSG["temp"])
            if "C" in nd or "T0" in nd: E("value", at, "a fixed node takes no C or T0")
        if "C" in nd and not ok_num("nonneg", nd["C"]): E("value", at + ".C", MSG["nonneg"])
        if "T0" in nd and not ok_num("temp", nd["T0"]): E("value", at + ".T0", MSG["temp"])
        if good: node[nd["id"]] = {"i": i, "fixed": "fixed" in nd, "massive": "fixed" not in nd and _num(nd.get("C")) and nd["C"] > 0}
    is_bound = lambda x: x == "ambient" or (x in node and node[x]["fixed"])
    link_ends = []
    for i, l in enumerate(net["links"]):
        at = f"links[{i}]"
        if not _obj(l): E("format", at, "link is not an object"); continue
        for k in _extra(l, LINK_KEYS): W("unknown-field", f"{at}.{k}", "ignored")
        id_ok(l, at)
        a_ok = _str(l.get("a")) and l["a"] in node
        if not a_ok: E("unknown-node", at + ".a", "not a node of the network")
        b = l["b"] if "b" in l else "ambient"
        b_ok = _str(b) and (b == "ambient" or b in node)
        if not b_ok: E("unknown-node", at + ".b", "not a node of the network")
        if a_ok and b_ok:
            if l["a"] == b: E("self-loop", at, "both ends on one node")
            elif is_bound(l["a"]) and is_bound(b): W("boundary-link", at, "both ends are boundaries")
            link_ends.append((l["a"], b))
        kinds = [k for k in LINK_KINDS if k in l]
        if len(kinds) != 1: E("link", at, "needs exactly one of R, G, conv, rad"); continue
        k = kinds[0]
        if k in ("R", "G"):
            if not ok_num("pos", l[k]): E("value", f"{at}.{k}", MSG["pos"])
            continue
        if not _obj(l[k]): E("value", f"{at}.{k}", "needs an object {h, A}" if k == "conv" else "needs an object {eps, A}"); continue
        q = l[k]
        for x in _extra(q, [f for f, _ in SUB[k]]): E("value", f"{at}.{k}.{x}", "unknown field")
        for f, kd in SUB[k]:
            if f not in q: E("value", f"{at}.{k}.{f}", "missing")
            elif not ok_num(kd, q[f]): E("value", f"{at}.{k}.{f}", MSG[kd])
    for i, s in enumerate(sources):
        at = f"sources[{i}]"
        if not _obj(s): E("format", at, "source is not an object"); continue
        for k in _extra(s, SRC_KEYS): W("unknown-field", f"{at}.{k}", "ignored")
        if id_ok(s, at): src_ids.add(s["id"])
        if not (_str(s.get("node")) and s["node"] in node): E("unknown-node", at + ".node", "not a node of the network")
        elif node[s["node"]]["fixed"]: E("fixed-node", at + ".node", "a source on a fixed node does nothing")
        if "P" not in s: E("value", at + ".P", "missing")
        else: _check_wave(s["P"], at + ".P", E)
    gated = set()
    for i, th in enumerate(tss):
        at = f"thermostats[{i}]"
        if not _obj(th): E("format", at, "thermostat is not an object"); continue
        for k in _extra(th, TS_KEYS): W("unknown-field", f"{at}.{k}", "ignored")
        id_ok(th, at)
        if not (_str(th.get("sensor")) and th["sensor"] in node): E("unknown-node", at + ".sensor", "not a node of the network")
        if not (_str(th.get("source")) and th["source"] in src_ids): E("unknown-source", at + ".source", "not a source of the network")
        elif th["source"] in gated: E("thermostat", at + ".source", "this source already has a thermostat")
        else: gated.add(th["source"])
        lo, hi = _num(th.get("low")), _num(th.get("high"))
        if not lo: E("value", at + ".low", MSG["fin"])
        if not hi: E("value", at + ".high", MSG["fin"])
        if lo and hi and not th["low"] < th["high"]: E("value", at, "low must be below high")
        if "mode" in th and th["mode"] not in ("heat", "cool"): E("value", at + ".mode", "heat or cool")
    if any(p["level"] == "error" for p in P): return P
    par = {x: x for x, v in node.items() if not v["fixed"]}
    def find(s):
        while par[s] != s: s = par[s]
        return s
    anchored = set()
    for a, b in link_ends:
        ba, bb = is_bound(a), is_bound(b)
        if ba and bb: continue
        if ba: anchored.add(find(b))
        elif bb: anchored.add(find(a))
        else:
            x, y = find(a), find(b)
            if x != y:
                par[x] = y
                if x in anchored: anchored.add(y)
    groups = {}
    for x, v in node.items():
        if v["fixed"]: continue
        r = find(x)
        g = groups.setdefault(r, {"first": x, "massive": False, "anchored": False})
        if v["massive"]: g["massive"] = True
    for r in anchored:
        g = groups.get(find(r))
        if g: g["anchored"] = True
    for g in groups.values():
        if g["anchored"]: continue
        i = node[g["first"]]["i"]
        if not g["massive"]: E("singular", f"nodes[{i}]", "no heat capacity and no path to a boundary: " + g["first"])
        else: W("floating", f"nodes[{i}]", "no path to a boundary from " + g["first"] + " (no steady state)")
    return P

def _bindable(net):
    m = {"ambient": ["value"]}
    for nd in net["nodes"]: m[nd["id"]] = ["fixed"] if "fixed" in nd else ["C", "T0"]
    for l in net["links"]:
        k = next(x for x in LINK_KINDS if x in l)
        m[l["id"]] = [k] if k in ("R", "G") else [k + "." + f for f, _ in SUB[k]]
    for s in net.get("sources") or []:
        if _obj(s["P"]):
            kind = list(s["P"])[0]; m[s["id"]] = [kind + "." + f for f, _ in WAVE_FIELDS[kind]]
        else: m[s["id"]] = ["P"]
    for th in net.get("thermostats") or []: m[th["id"]] = ["low", "high"]
    return m

def check_spec(spec):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    m = spec.get("model") if _obj(spec) else None
    if not _obj(m): E("model", "model", ID + " needs a model {network, bindings?, transient?}"); return P
    for k in _extra(m, MODEL_KEYS): E("unknown-field", "model." + k, "unknown field")
    if not _obj(m.get("network")): E("model", "model.network", 'needs a network {format: "' + FORMAT + '", nodes, links, sources?, thermostats?}'); return P
    for p in check(m["network"]): P.append({**p, "path": "model.network" + ("." + p["path"] if p["path"] else "")})
    if any(p["level"] == "error" for p in P): return P
    net = m["network"]; can = _bindable(net); kind_of = {}
    for nd in net["nodes"]: kind_of[nd["id"]] = "node"
    for l in net["links"]: kind_of[l["id"]] = "link"
    for s in net.get("sources") or []: kind_of[s["id"]] = "source"
    for th in net.get("thermostats") or []: kind_of[th["id"]] = "thermostat"
    bs = m.get("bindings")
    if "bindings" in m and not (isinstance(bs, list) and len(bs) <= MAX_BINDINGS): E("binding", "model.bindings", f"a list of at most {MAX_BINDINGS} {{element, prop?, expr}}")
    for i, b in enumerate(bs[:MAX_BINDINGS] if isinstance(bs, list) else []):
        w = f"model.bindings[{i}]"
        if not _obj(b): E("binding", w, "an object {element, prop?, expr}"); continue
        for k in _extra(b, ["element", "prop", "expr"]): E("unknown-field", f"{w}.{k}", "unknown field")
        props = can.get(b["element"]) if _str(b.get("element")) else None
        if not props: E("binding", w + ".element", "not an id of the network (or ambient)")
        elif "prop" in b and not (_str(b["prop"]) and b["prop"] in props): E("binding", w + ".prop", "one of " + ", ".join(props))
        if not (_expr(b.get("expr")) or _num(b.get("expr"))): E("binding", w + ".expr", "needs an expression")
    tr = m.get("transient"); te = dt = None
    if "transient" in m:
        if not _obj(tr): E("transient", "model.transient", "needs an object {tEnd, dt?, method?, start?, points?}")
        else:
            for k in _extra(tr, TRAN_KEYS): E("unknown-field", "model.transient." + k, "unknown field")
            if "tEnd" not in tr: E("transient", "model.transient.tEnd", "missing")
            elif _num(tr["tEnd"]) and tr["tEnd"] > 0: te = tr["tEnd"]
            elif not _expr(tr["tEnd"]): E("transient", "model.transient.tEnd", "needs a number > 0 or an expression")
            if "dt" in tr:
                if _num(tr["dt"]) and tr["dt"] > 0: dt = tr["dt"]
                elif not _expr(tr["dt"]): E("transient", "model.transient.dt", "needs a number > 0 or an expression")
            if "method" in tr and tr["method"] not in ("trap", "be"): E("transient", "model.transient.method", "trap or be")
            if "start" in tr and tr["start"] not in ("T0", "steady"): E("transient", "model.transient.start", "T0 or steady")
            if "points" in tr and not (_int(tr["points"]) and 2 <= tr["points"] <= MAX_POINTS): E("transient", "model.transient.points", f"needs a whole number from 2 to {MAX_POINTS}")
            if te is not None and dt is not None and math.ceil(te / dt - 1e-9) > MAX_STEPS: E("budget", "model.transient", f"tEnd / dt is more than {MAX_STEPS} steps")
    massive = sum(1 for nd in net["nodes"] if "fixed" not in nd and _num(nd.get("C")) and nd["C"] > 0)
    for i, o in enumerate(spec.get("outputs") if isinstance(spec.get("outputs"), list) else []):
        w = f"outputs[{i}]"
        if not (_obj(o) and o.get("kind") in ("scalar", "series")): continue
        for k in _extra(o, OUT_KEYS): E("unknown-field", f"{w}.{k}", "unknown field")
        src = [k for k in OUT_SRC if k in o]
        if len(src) != 1: E("output", w, "must name what it reads: one of " + ", ".join(OUT_SRC)); continue
        s, at, st = src[0], "at" in o, "stat" in o
        if s == "time":
            if not (o["time"] is True and o["kind"] == "series"): E("output", w + ".time", "true on a series output (the time axis)")
        elif s == "tau":
            if not (o["kind"] == "scalar" and _int(o["tau"]) and 1 <= o["tau"] <= massive): E("output", w + ".tau", "a whole number from 1 to the number of nodes with a heat capacity, on a scalar output")
        elif not _str(o[s]) or kind_of.get(o[s]) != s: E("output", f"{w}.{s}", "not a " + s + " of the network")
        if (at or st) and not (o["kind"] == "scalar" and s in ("node", "link", "source", "thermostat")): E("output", w, "at and stat belong to a scalar output of a node, link, source or thermostat")
        if at and st: E("output", w, "at or stat, not both")
        if at and not ((_num(o["at"]) and o["at"] >= 0) or _expr(o["at"])): E("output", w + ".at", "needs a number ≥ 0 or an expression")
        if st and o["stat"] not in STATS: E("output", w + ".stat", "one of " + ", ".join(STATS))
        if s == "thermostat" and o["kind"] == "scalar" and not at and not st: E("output", w, "a thermostat has no steady state: give at or stat")
        if (o["kind"] == "series" or at or st) and not _obj(tr): E("output", w, "needs model.transient {tEnd, dt?}")
    return P
