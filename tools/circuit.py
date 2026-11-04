"""The netlist checks of the circuit engine circuit-mna@1 in Python (docs/INTERACTIVE_CIRCUIT.md): the twin of check() and
checkFaults() in engine/src/36_engine_circuit.js — the same codes, paths and messages (tests/activities.js runs both on the
same netlists). tools/activities.py uses it to check a sim-spec@1 spec whose engine is circuit-mna@1; it does not simulate.

  num(v)                  → a float (a number, or a text with an SI prefix: "4.7k", "100n", "2meg"), else nan
  check(netlist)          → [{code, path, msg, level: 'error' | 'warning'}]
  check_faults(nl, faults) → [{code: 'fault', path, msg, level: 'error'}]   (on a netlist that passes check())"""
import math, re

FORMAT = "noema.circuit/v1"
MAX_NODES, MAX_ELEMENTS, MAX_STEPS = 60, 200, 200000
NODE_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_+\-]{0,31}$")
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]{0,31}$")
SI = {"f": 1e-15, "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "m": 1e-3, "k": 1e3, "K": 1e3, "M": 1e6, "meg": 1e6, "G": 1e9}
_NUM = re.compile(r"^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|[fpnuµmkKMG])?\s*$")
NAN = float("nan")
TYPES = {"R": [2], "C": [2], "L": [2], "V": [2], "I": [2], "D": [2], "SW": [2], "NPN": [3], "PNP": [3], "NMOS": [3], "PMOS": [3], "OPAMP": [3, 5]}
PARAMS = {
    "R": {}, "C": {}, "L": {}, "V": {}, "I": {},
    "D": {"Is": "pos", "n": "pos"}, "SW": {"Ron": "pos", "Roff": "pos"},
    "NPN": {"Is": "pos", "betaF": "pos", "betaR": "pos"}, "PNP": {"Is": "pos", "betaF": "pos", "betaR": "pos"},
    "NMOS": {"Vth": "fin", "k": "pos", "lambda": "nonneg"}, "PMOS": {"Vth": "fin", "k": "pos", "lambda": "nonneg"},
    "OPAMP": {"gain": "pos", "rails": "rails", "headroom": "nonneg"},
}
PRESETS = {
    "D": {"1n4148", "1n4001", "led-red", "led-orange", "led-yellow", "led-green", "led-blue", "led-white"},
    "NPN": {"2n3904", "2n2222", "bc547"}, "PNP": {"2n3906", "bc557"},
    "NMOS": {"2n7000", "bs170", "irlz44n"}, "PMOS": {"bs250", "irf9540"},
}
WAVE_FIELDS = {   # (in the JS order: the messages come out in it)
    "pulse": [("v1", "fin!"), ("v2", "fin!"), ("delay", "nonneg"), ("rise", "nonneg"), ("fall", "nonneg"), ("width", "pos"), ("period", "pos")],
    "sine": [("offset", "fin"), ("amp", "fin!"), ("freq", "pos!"), ("phase", "fin"), ("delay", "nonneg")],
    "pwm": [("v", "fin!"), ("freq", "pos!"), ("duty", "unit!"), ("low", "fin"), ("delay", "nonneg")],
}
EL_KEYS = {"id", "type", "n", "value", "ic", "params", "preset", "on", "label", "note"}
FAULT_KINDS = ["open", "short", "drift", "open-trace", "reverse"]
FAULT_KEYS = {"kind", "element", "pin", "pins", "factor", "param", "node", "side"}

def is_gnd(s): return s == "gnd" or s == "0"
def _obj(v): return isinstance(v, dict)
def _int(v): return isinstance(v, int) and not isinstance(v, bool)
def _isnum(v): return isinstance(v, (int, float)) and not isinstance(v, bool)

def num(v):
    if _isnum(v): return float(v) if math.isfinite(v) else NAN
    if not isinstance(v, str): return NAN
    m = _NUM.match(v)
    if not m: return NAN
    try: x = float(m.group(1)) * (SI[m.group(2)] if m.group(2) else 1)
    except (OverflowError, ValueError): return NAN
    return x

def _finite(x): return isinstance(x, float) and math.isfinite(x)

def check_number(kind, v):
    x = num(v)
    if kind == "pos": return x > 0
    if kind == "nonneg": return x >= 0
    if kind == "unit": return 0 <= x <= 1
    if kind == "bool": return isinstance(v, bool)
    if kind == "rails": return isinstance(v, list) and len(v) == 2 and num(v[0]) < num(v[1])
    return _finite(x)

def _z(x):
    """JS `x || 0` on a parsed number (None = undefined, nan and 0 are falsy)"""
    return 0.0 if x is None or x != x or x == 0 else x

def _canon_pulse(q):
    w = {f: (None if f not in q else num(q[f])) for f, _ in WAVE_FIELDS["pulse"]}
    for f in ("delay", "rise", "fall", "period"): w[f] = _z(w[f])
    if w["width"] is None: w["width"] = (w["period"] - w["rise"] - w["fall"]) / 2 if w["period"] > 0 else math.inf
    return w

def check_wave(v, path, E):
    if not _obj(v):
        if not _finite(num(v)): E("value", path, "needs a number or a waveform")
        return
    keys = list(v)
    if len(keys) != 1 or keys[0] not in ("dc", "pulse", "sine", "pwm"): E("value", path, "one of dc, pulse, sine, pwm"); return
    kind = keys[0]
    if kind == "dc":
        if not _finite(num(v["dc"])): E("value", path + ".dc", "needs a number")
        return
    q, F = v[kind], WAVE_FIELDS[kind]
    if not _obj(q): E("value", path + "." + kind, "needs an object"); return
    names = [f for f, _ in F]
    for k in q:
        if k not in names: E("value", f"{path}.{kind}.{k}", "unknown field")
    for k, spec in F:
        must = spec.endswith("!"); kd = spec[:-1] if must else spec
        if k not in q:
            if must: E("value", f"{path}.{kind}.{k}", "missing")
            continue
        if not check_number(kd, q[k]): E("value", f"{path}.{kind}.{k}", "out of range")
    if kind == "pulse" and "period" in q:
        w = _canon_pulse(q)
        if w["rise"] + w["width"] + w["fall"] > w["period"] * (1 + 1e-12): E("value", path + ".pulse", "rise + width + fall > period")

def check(nl):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    W = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    if not _obj(nl): E("format", "", "netlist is not an object"); return P
    if "format" in nl and nl["format"] != FORMAT: E("format", "format", "not " + FORMAT)
    if not isinstance(nl.get("nodes"), list): E("format", "nodes", "not an array")
    if not isinstance(nl.get("elements"), list): E("format", "elements", "not an array")
    if P: return P
    for k in nl:
        if k not in ("format", "nodes", "elements", "meta"): W("unknown-field", k, "ignored")
    names, labels, node_at = {}, {}, {}   # (dicts keep the order, like the JS Set and Map)
    for i, x in enumerate(nl["nodes"]):
        nm = x if isinstance(x, str) else x.get("name") if _obj(x) else None
        if not isinstance(nm, str) or not NODE_RE.match(nm) or nm.endswith("\n"): E("node-name", f"nodes[{i}]", "bad node name"); continue
        if nm in names or nm in labels: E("dup-node", f"nodes[{i}]", "duplicate node " + nm); continue
        if _obj(x) and "probe" in x:
            if is_gnd(nm): E("node-name", f"nodes[{i}]", "ground cannot be a label"); continue
            labels[nm] = (x["probe"], i)
        else: names[nm] = True; node_at[nm] = i
    for _, (to, i) in labels.items():
        if not isinstance(to, str) or not (to in names or is_gnd(to)): E("unknown-node", f"nodes[{i}].probe", "label of an unknown node")
    if len([s for s in names if not is_gnd(s)]) > MAX_NODES: E("size", "nodes", f"more than {MAX_NODES} nodes")
    if len(nl["elements"]) > MAX_ELEMENTS: E("size", "elements", f"more than {MAX_ELEMENTS} elements")
    ids = set()
    for i, el in enumerate(nl["elements"]):
        at = f"elements[{i}]"
        if not _obj(el): E("format", at, "element is not an object"); continue
        for k in el:
            if k not in EL_KEYS: W("unknown-field", f"{at}.{k}", "ignored")
        eid = el.get("id")
        if not isinstance(eid, str) or not ID_RE.match(eid) or eid.endswith("\n"): E("id", at + ".id", "bad id")
        elif eid in ids: E("dup-id", at + ".id", "duplicate id " + eid)
        else: ids.add(eid)
        t = el.get("type")
        if not isinstance(t, str) or t not in TYPES: E("type", at + ".type", "unknown type"); continue
        n = el.get("n")
        if not isinstance(n, list) or len(n) not in TYPES[t]: E("pins", at + ".n", "wrong number of terminals"); continue
        for k, m in enumerate(n):
            if isinstance(m, str) and m in labels: E("probe-only", f"{at}.n[{k}]", "a probe-only label cannot be a terminal")
            elif not isinstance(m, str) or not (m in names or is_gnd(m)): E("unknown-node", f"{at}.n[{k}]", "unknown node " + _js_str(m))
        if t in ("R", "C", "L"):
            if "value" not in el: E("value", at + ".value", "missing value")
            elif not num(el["value"]) > 0: E("value", at + ".value", "needs a positive number")
            if "ic" in el and (t == "R" or not _finite(num(el["ic"]))): E("value", at + ".ic", "needs a number")
        elif t in ("V", "I"):
            if "value" not in el: E("value", at + ".value", "missing value")
            else: check_wave(el["value"], at + ".value", E)
        elif "value" in el: E("value", at + ".value", "this type takes params, not a value")
        if "ic" in el and t not in ("C", "L"): E("value", at + ".ic", "only C and L have ic")
        if "on" in el and (t != "SW" or not isinstance(el["on"], bool)): E("value", at + ".on", "only SW has on (true/false)")
        if "preset" in el and not (t in PRESETS and isinstance(el["preset"], str) and el["preset"] in PRESETS[t]): E("preset", at + ".preset", "unknown preset")
        if "params" in el:
            if not _obj(el["params"]): E("param", at + ".params", "not an object")
            else:
                for k, v in el["params"].items():
                    kd = PARAMS[t].get(k)
                    if not kd: E("param", f"{at}.params.{k}", "unknown parameter")
                    elif not check_number(kd, v): E("param", f"{at}.params.{k}", "out of range")
    if any(p["level"] == "error" for p in P): return P
    # the graph: ground, loops of voltage-defined branches, nodes without a DC path to ground
    els = nl["elements"]; G0 = "gnd"
    key = lambda s: G0 if is_gnd(s) else s
    if els and not any(any(is_gnd(m) for m in el["n"]) for el in els): E("no-ground", "elements", "no element touches ground")
    def uf():
        par = {}
        def f(s):
            s = key(s)
            while s in par and par[s] != s: s = par[s]
            return s
        def u(a, b):
            x, y = f(a), f(b)
            if x == y: return False
            par[x] = y; return True
        return f, u
    _, vl_u = uf(); dcp_f, dcp_u = uf()
    for i, el in enumerate(els):
        n, t = el["n"], el["type"]
        if t in ("V", "L") and not vl_u(n[0], n[1]): E("vloop", f"elements[{i}]", "loop of voltage sources / inductors")
        if t == "OPAMP" and not vl_u(n[2], G0): E("vloop", f"elements[{i}]", "op-amp output on a voltage-defined node")
        if len(n) == 2 and t not in ("V", "L") and key(n[0]) == key(n[1]): W("self-loop", f"elements[{i}]", "both terminals on one node")
        if t in ("R", "L", "V", "D", "SW"): dcp_u(n[0], n[1])
        elif t in ("NPN", "PNP"): dcp_u(n[0], n[1]); dcp_u(n[1], n[2])
        elif t in ("NMOS", "PMOS"): dcp_u(n[0], n[2])
        elif t == "OPAMP": dcp_u(n[2], G0)
    used = {key(m) for el in els for m in el["n"]}
    for nm in names:
        if is_gnd(nm): continue
        if nm not in used: W("unused", f"nodes[{node_at[nm]}]", "no element uses " + nm)
        elif dcp_f(nm) != dcp_f(G0): W("floating", f"nodes[{node_at[nm]}]", "no DC path to ground from " + nm)
    return P

def _js_str(v):
    """String(v) as JS writes it (for a message that names a bad value)"""
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e21: return str(int(v))
    if isinstance(v, list): return ",".join("" if x is None else _js_str(x) for x in v)
    if isinstance(v, dict): return "[object Object]"
    return str(v)

def _pin_ref(s):
    m = re.match(r"^(.*)\.(\d+)$", s)
    return (m.group(1), int(m.group(2))) if m else (s, None)

def check_faults(nl, faults):
    P = []
    E = lambda path, msg: P.append({"code": "fault", "path": path, "msg": msg, "level": "error"})
    if not isinstance(faults, list): E("", "faults must be a list"); return P
    els = [e for e in (nl.get("elements") if _obj(nl) and isinstance(nl.get("elements"), list) else []) if _obj(e)]
    by_id = {e["id"]: e for e in els if isinstance(e.get("id"), str)}
    declared = {x if isinstance(x, str) else x.get("name") for x in (nl.get("nodes") if _obj(nl) and isinstance(nl.get("nodes"), list) else [])
                if isinstance(x, str) or (_obj(x) and "probe" not in x)}
    same = lambda m, node: m == node or (isinstance(m, str) and is_gnd(m) and is_gnd(node))
    pins_ok = lambda pins, n: isinstance(pins, list) and len(pins) == 2 and all(_int(k) and 0 <= k < n for k in pins) and pins[0] != pins[1]
    for i, f in enumerate(faults):
        at = f"faults[{i}]"
        if not _obj(f): E(at, "a fault is an object {element | node, kind}"); continue
        for k in f:
            if k not in FAULT_KEYS: E(f"{at}.{k}", "unknown field")
        if f.get("kind") not in FAULT_KINDS: E(at + ".kind", "one of " + ", ".join(FAULT_KINDS)); continue
        if f["kind"] == "open-trace":
            node = f.get("node")
            if not isinstance(node, str) or not (node in declared or is_gnd(node)): E(at + ".node", "not a node of the netlist"); continue
            touching = [e for e in els if isinstance(e.get("n"), list) and any(same(m, node) for m in e["n"])]
            if "side" not in f:
                if len(touching) < 2: E(at + ".node", "fewer than two parts touch this node")
                continue
            side = f["side"]
            if not isinstance(side, list) or not side: E(at + ".side", "a list of parts (R1) or pins (R1.0) on the node"); continue
            for j, x in enumerate(side):
                eid, pin = _pin_ref(x) if isinstance(x, str) else (None, None)
                e = by_id.get(eid) if isinstance(x, str) else None
                if not e: E(f"{at}.side[{j}]", "not a part of the netlist")
                elif (not any(same(m, node) for m in e["n"])) if pin is None else not (pin < len(e["n"]) and same(e["n"][pin], node)): E(f"{at}.side[{j}]", "does not touch the node")
            continue
        e = by_id.get(f.get("element")) if isinstance(f.get("element"), str) else None
        if not e: E(at + ".element", "not a part of the netlist"); continue
        n = len(e["n"])
        if f["kind"] == "open":
            if "pin" in f and not (_int(f["pin"]) and 0 <= f["pin"] < n): E(at + ".pin", "not a pin of the part")
        elif f["kind"] in ("short", "reverse"):
            if (not pins_ok(f["pins"], n)) if "pins" in f else (f["kind"] == "reverse" and n != 2): E(at + ".pins", "two different pins of the part")
        else:
            if "factor" in f and not num(f["factor"]) > 0: E(at + ".factor", "needs a number > 0")
            if "param" in f:
                t, prm = e["type"], f["param"]
                okp = isinstance(prm, str) and (prm == "value" if t in ("R", "C", "L", "V", "I") else prm in PARAMS[t])
                if not okp: E(at + ".param", "not a parameter of the part")
    return P
