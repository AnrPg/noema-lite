"""The link checks of the radio engine rf@1 in Python (docs/activities-dev/rf.md): the twin of check() and checkSpec() in
engine/src/41_engine_rf.js — the same codes, paths and messages (tests/rf.js runs both on the same specs). It does not simulate.

  num(v)            → a float (a number, or a text with an SI prefix: "868M", "125k"), else nan
  check(link)       → [{code, path, msg, level: 'error' | 'warning'}]
  check_spec(spec)  → the same for a sim-spec's model {link, bindings} and outputs
  walk(...)         → the table walker (tools/twin.py uses it too)"""
import math, re

ID, FORMAT = "rf@1", "noema.rf/v1"
MAX_POINTS, MAX_WALLS, MAX_BINDINGS = 2000, 32, 24
SI = {"f": 1e-15, "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "m": 1e-3, "k": 1e3, "K": 1e3, "M": 1e6, "meg": 1e6, "G": 1e9}
_NUM = re.compile(r"^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|[fpnuµmkKMG])?\s*$")
NAN = float("nan")
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]{0,31}$")

def _obj(v): return isinstance(v, dict)
def _isnum(v): return isinstance(v, (int, float)) and not isinstance(v, bool)

def num(v):
    if _isnum(v): return float(v) if math.isfinite(v) else NAN
    if not isinstance(v, str): return NAN
    m = _NUM.match(v)
    if not m: return NAN
    try: return float(m.group(1)) * (SI[m.group(2)] if m.group(2) else 1)
    except (OverflowError, ValueError): return NAN

def _js_int(v): return _isnum(v) and math.isfinite(v) and float(v).is_integer()

def check_num(kind, v):
    if kind == "bool": return isinstance(v, bool)
    if kind == "id": return isinstance(v, str) and bool(ID_RE.match(v)) and not v.endswith("\n")
    if kind.startswith("int:"):
        _, a, b = kind.split(":"); return _js_int(v) and float(a) <= v <= float(b)
    if kind.startswith("enum:"): return isinstance(v, str) and v in kind[5:].split("|")
    x = num(v)
    if kind == "pos": return x > 0
    if kind == "nonneg": return x >= 0
    if kind == "unit": return 0 <= x <= 1
    return math.isfinite(x)

def kind_msg(kind):
    if kind == "bool": return "needs true or false"
    if kind == "id": return "needs a name (a letter, then letters, digits, _ or -)"
    if kind.startswith("int:"):
        _, a, b = kind.split(":"); return f"needs an integer from {a} to {b}"
    if kind.startswith("enum:"): return "one of " + ", ".join(kind[5:].split("|"))
    return {"pos": "needs a number > 0", "nonneg": "needs a number >= 0", "unit": "needs a number from 0 to 1", "fin": "needs a number"}[kind]

def _join(p, k): return p + "." + k if p else k

def walk(o, T, path, E, W, fmt):
    if not _obj(o): E("format", path, "not an object"); return
    for k in o:
        if k not in T and k != "meta": W("unknown-field", _join(path, k), "ignored")
    for k, kd in T.items():
        p = _join(path, k)
        if isinstance(kd, str):
            must = kd.endswith("!"); kind = kd[:-1] if must else kd
            if k not in o:
                if must: E("value", p, "missing")
                continue
            v = o[k]
            if kind == "const":
                if not (isinstance(v, str) and v == fmt): E("format", p, "not " + fmt)
                continue
            if not check_num(kind, v): E("enum" if kind.startswith("enum:") else "value", p, kind_msg(kind))
        elif k not in o:
            if kd.get("req"): E("value", p, "missing")
        elif "$obj" in kd: walk(o[k], kd["$obj"], p, E, W, fmt)
        elif not isinstance(o[k], list): E("format", p, "not an array")
        elif len(o[k]) > kd["max"]: E("size", p, f"more than {kd['max']} items")
        else:
            for i, x in enumerate(o[k]): walk(x, kd["$list"], f"{p}[{i}]", E, W, fmt)

def numeric_fields(T, path="", out=None):
    out = [] if out is None else out
    for k, kd in T.items():
        if isinstance(kd, str):
            kind = kd.replace("!", "")
            if kind in ("pos", "nonneg", "fin", "unit") or kind.startswith("int:"): out.append(_join(path, k))
        elif "$obj" in kd: numeric_fields(kd["$obj"], _join(path, k), out)
    return out

MODELS = ["fspl", "two-ray", "log-distance", "hata", "indoor"]
MODS = ["bpsk", "qpsk", "fsk", "lora", "ble", "wifi"]
HATA_ENVS = ["urban", "urban-large", "suburban", "open"]
INDOOR_ENVS = ["residential", "office", "commercial"]
WALLS = {"drywall": 3, "wood": 4, "glass": 2, "brick": 8, "concrete": 12, "metal": 26}
WIFI_RATES = [6, 9, 12, 18, 24, 36, 48, 54]
WALL_T = {"type": "enum:" + "|".join(WALLS), "loss": "nonneg", "count": "int:1:50"}
TABLE = {
    "format": "const", "f": "pos!", "d": "pos!", "fadeMargin": "fin",
    "tx": {"$obj": {"power": "fin", "gain": "fin", "cable": "nonneg"}},
    "rx": {"$obj": {"gain": "fin", "cable": "nonneg", "nf": "nonneg", "bw": "pos", "snr": "fin", "sensitivity": "fin"}},
    "path": {"$obj": {"model": "enum:" + "|".join(MODELS), "ht": "pos", "hr": "pos", "n": "pos", "d0": "pos", "sigma": "nonneg",
                      "env": "enum:" + "|".join(HATA_ENVS + INDOOR_ENVS), "floors": "int:0:20", "N": "pos", "lf": "nonneg", "extra": "nonneg",
                      "walls": {"$list": WALL_T, "max": MAX_WALLS}, "obstacle": {"$obj": {"d1": "pos!", "h": "fin!"}}}},
    "radio": {"$obj": {"mod": "enum:" + "|".join(MODS), "bitrate": "pos", "bw": "pos", "sf": "int:7:12", "cr": "int:1:4", "preamble": "int:0:65535",
                       "header": "bool", "crc": "bool", "ldro": "bool", "payload": "int:0:255", "phy": "enum:1M|2M", "rate": "pos", "interval": "pos", "dutyLimit": "unit"}},
    "sweep": {"$obj": {"from": "pos!", "to": "pos!", "points": f"int:2:{MAX_POINTS}", "scale": "enum:log|lin"}},
    "snrSweep": {"$obj": {"from": "fin!", "to": "fin!", "points": f"int:2:{MAX_POINTS}"}},
}
NUM_FIELDS = numeric_fields(TABLE)
SCALARS = ["lambda", "eirp", "pl", "plMedian", "shadow", "prx", "rssi", "noiseFloor", "snrReq", "sensitivity", "snr", "ebn0", "margin", "range",
           "fresnel", "clearance", "diffraction", "crossover", "wallLoss", "floorLoss", "ber", "per", "bitrate", "airtime", "symbolTime", "dutyCycle", "minInterval", "valid"]
SERIES = ["d", "pl", "plMedian", "prx", "prxMedian", "margin", "snrAxis", "per", "ber"]

def g(o, k, d):
    """the JS g(): a boolean or a non-numeric text as it is, else num(); d when absent"""
    if not _obj(o) or k not in o: return d
    v = o[k]
    if isinstance(v, bool) or (isinstance(v, str) and not math.isfinite(num(v))): return v
    return num(v)

def check(link):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    W = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    if not _obj(link): E("format", "", "link is not an object"); return P
    walk(link, TABLE, "", E, W, FORMAT)
    if any(p["level"] == "error" for p in P): return P
    p = link.get("path") or {}; q = link.get("radio") or {}
    f, d = num(link["f"]), num(link["d"])
    model = g(p, "model", "fspl")
    env = g(p, "env", "office" if model == "indoor" else "urban")
    ht, hr = g(p, "ht", 30 if model == "hata" else 10), g(p, "hr", 1.5)
    if not (1e6 <= f <= 1e11): E("range", "f", "outside 1 MHz to 100 GHz")
    if model == "hata":
        if "env" in p and env not in HATA_ENVS: E("enum", "path.env", "one of " + ", ".join(HATA_ENVS))
        if not (150e6 <= f <= 1500e6): E("range", "f", "outside 150 to 1500 MHz (Okumura-Hata)")
        if not (30 <= ht <= 200): E("range", "path.ht", "outside 30 to 200 m (Okumura-Hata)")
        if not (1 <= hr <= 10): E("range", "path.hr", "outside 1 to 10 m (Okumura-Hata)")
        if not (1000 <= d <= 20000): E("range", "d", "outside 1 to 20 km (Okumura-Hata)")
    if model == "indoor":
        if "env" in p and env not in INDOOR_ENVS: E("enum", "path.env", "one of " + ", ".join(INDOOR_ENVS))
        if not (0.8e9 <= f <= 6e9): E("range", "f", "outside 0.8 to 6 GHz (ITU-R P.1238)")
        if not (d >= 1): E("range", "d", "below 1 m (ITU-R P.1238)")
    ob = p.get("obstacle")
    if _obj(ob) and not (num(ob["d1"]) < d): E("value", "path.obstacle.d1", "must be less than d")
    for i, w in enumerate(p.get("walls") or []):
        if "type" not in w and "loss" not in w: E("value", f"path.walls[{i}]", "needs type or loss")
    mod = g(q, "mod", "lora")
    if mod == "lora" and not (7800 <= g(q, "bw", 125e3) <= 500000): E("value", "radio.bw", "LoRa bandwidth from 7.8 to 500 kHz")
    if mod == "wifi" and g(q, "rate", 6) not in WIFI_RATES: E("enum", "radio.rate", "one of " + ", ".join(str(r) for r in WIFI_RATES))
    for key in ("sweep", "snrSweep"):
        s = link.get(key)
        if s is not None and not (num(s["from"]) < num(s["to"])): E("value", key, "from must be less than to")
    return P

def _check_spec(spec, key, checker, what, extra_outputs=None):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    W = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    m = spec.get("model") if _obj(spec) else None
    if not _obj(m): E("format", "model", "not an object"); return P
    for k in m:
        if k not in (key, "bindings"): W("unknown-field", "model." + k, "ignored")
    for p in checker(m.get(key)):
        P.append(dict(p, path=f"model.{key}.{p['path']}" if p["path"] else f"model.{key}"))
    return P, E, W, m

def check_bindings(m, fields, what, E):
    if "bindings" not in m: return
    b = m["bindings"]
    if not isinstance(b, list): E("format", "model.bindings", "not an array"); return
    if len(b) > MAX_BINDINGS: E("size", "model.bindings", f"more than {MAX_BINDINGS} items"); return
    for i, x in enumerate(b):
        at = f"model.bindings[{i}]"
        if not _obj(x): E("binding", at, "a binding is an object {field, expr}"); continue
        if not (isinstance(x.get("field"), str) and x["field"] in fields): E("binding", at + ".field", "not a numeric field of the " + what)
        if not (isinstance(x.get("expr"), str) and x["expr"].strip()): E("binding", at + ".expr", "needs an expression")

def check_spec(spec):
    r = _check_spec(spec, "link", check, "link")
    if isinstance(r, list): return r
    P, E, W, m = r
    check_bindings(m, NUM_FIELDS, "link", E)
    outs = spec.get("outputs")
    if not isinstance(outs, list): E("format", "outputs", "not an array"); return P
    for i, o in enumerate(outs):
        at = f"outputs[{i}]"
        if not _obj(o): E("output", at, "not an object"); continue
        of = o["of"] if "of" in o else o.get("id")
        kind = o.get("kind")
        if kind == "scalar":
            if not (isinstance(of, str) and of in SCALARS): E("output", at + ".of", "not a scalar of " + ID)
        elif kind == "series":
            if not (isinstance(of, str) and of in SERIES): E("output", at + ".of", "not a series of " + ID)
        else: E("output", at + ".kind", "scalar or series")
    return P
