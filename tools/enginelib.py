"""The shared core of the engine library of sim-spec@1 in Python (docs/INTERACTIVE_LIBRARY.md §1): the twin of the model checker of
engine/src/46_lib_core.js — the same kinds, codes, paths and messages (tests/enginelib.js runs both on the same models). The library
engines' Python twins (tools/lib_<name>.py) build their check_spec on it; they do not simulate.

  walk(o, T, path, E, W)        the table walker: kinds pos nonneg fin unit bool int:a:b enum:a|b id ref name key expr numx (+ "!")
                                and shapes {"$obj": T} {"$list": T or kind, "min"?, "max"} {"$map": kind, "max"} ({"$req": True}: required)
  problems()                    → (P, E, W)
  check_outputs(spec, id, kinds, out, E, W)"""
import math, re

MAX_POINTS, MAX_SCENE = 2000, 2000
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,31}$")
NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,31}$")
KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9_.-]{0,63}$")
RESERVED = ["t", "n", "pi", "e", "true", "false"]
STATS = ["final", "min", "max", "mean", "pp", "rms"]
ROLES = ["base", "muted", "hi", "ok", "bad", "warn", "info"]

def is_obj(v): return isinstance(v, dict)
def is_num(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
def _js_int(v): return is_num(v) and float(v).is_integer()
def _full(rx, v): return isinstance(v, str) and rx.match(v) is not None and not v.endswith("\n")

def check_kind(kind, v):
    if kind == "bool": return isinstance(v, bool)
    if kind in ("id", "ref"): return _full(ID_RE, v)
    if kind == "name": return _full(NAME_RE, v) and v not in RESERVED
    if kind == "key": return _full(KEY_RE, v)
    if kind == "expr": return isinstance(v, str) and v.strip() != ""
    if kind == "numx": return is_num(v) or (isinstance(v, str) and v.strip() != "")
    if kind.startswith("int:"):
        _, a, b = kind.split(":"); return _js_int(v) and float(a) <= v <= float(b)
    if kind.startswith("enum:"): return isinstance(v, str) and v in kind[5:].split("|")
    if not is_num(v): return False
    if kind == "pos": return v > 0
    if kind == "nonneg": return v >= 0
    if kind == "unit": return 0 <= v <= 1
    return True

def kind_msg(kind):
    if kind == "bool": return "needs true or false"
    if kind in ("id", "ref"): return "needs an id (a letter, then letters, digits, _ or -; at most 32)"
    if kind == "name": return "needs a name (a letter or _, then letters, digits, _; not t, n, pi, e, true or false)"
    if kind == "key": return "needs a key of the string tables"
    if kind == "expr": return "needs an expression"
    if kind == "numx": return "needs a number or an expression"
    if kind.startswith("int:"):
        _, a, b = kind.split(":"); return f"needs an integer from {a} to {b}"
    if kind.startswith("enum:"): return "one of " + ", ".join(kind[5:].split("|"))
    return {"pos": "needs a number > 0", "nonneg": "needs a number >= 0", "unit": "needs a number from 0 to 1", "fin": "needs a number"}[kind]

def _join(p, k): return p + "." + k if p else k

def walk_value(v, kd, p, E, W):
    if isinstance(kd, str):
        if not check_kind(kd, v): E("enum" if kd.startswith("enum:") else "value", p, kind_msg(kd))
    elif "$obj" in kd: walk(v, kd["$obj"], p, E, W)
    elif "$map" in kd:
        if not is_obj(v): E("format", p, "not an object"); return
        if len(v) > kd["max"]: E("size", p, f"more than {kd['max']} items"); return
        for k in v:
            if not check_kind("name", k): E("value", _join(p, k), kind_msg("name"))
            else: walk_value(v[k], kd["$map"], _join(p, k), E, W)
    elif not isinstance(v, list): E("format", p, "not an array")
    elif len(v) > kd["max"]: E("size", p, f"more than {kd['max']} items")
    elif kd.get("min") and len(v) < kd["min"]: E("size", p, f"fewer than {kd['min']} items")
    else:
        for i, x in enumerate(v): walk_value(x, kd["$list"], f"{p}[{i}]", E, W)

def walk(o, T, path, E, W):
    if not is_obj(o): E("format", path, "not an object"); return
    for k in o:
        if k not in T and k != "meta": W("unknown-field", _join(path, k), "ignored")
    for k, kd in T.items():
        p = _join(path, k)
        if isinstance(kd, str):
            must = kd.endswith("!"); kd = kd[:-1] if must else kd
            if k not in o:
                if must: E("value", p, "missing")
                continue
        elif kd.get("$req"):
            if k not in o: E("value", p, "missing"); continue
        elif k not in o: continue
        walk_value(o[k], kd, p, E, W)

def problems():
    P = []
    def E(code, path, msg): P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    def W(code, path, msg): P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    return P, E, W

def has_errors(P): return any(p["level"] == "error" for p in P)

def check_outputs(spec, eid, kinds, out, E, W):
    outs = spec.get("outputs") if is_obj(spec) else None
    if not isinstance(outs, list): E("format", "outputs", "not an array"); return
    for i, o in enumerate(outs):
        at = f"outputs[{i}]"
        if not is_obj(o): E("output", at, "not an object"); continue
        if o.get("kind") not in kinds: E("output", at + ".kind", "one of " + ", ".join(kinds)); continue
        if not isinstance(o.get("of"), str) or not o["of"]: E("output", at + ".of", "names what " + eid + " computes"); continue
        out(o, at, E, W)
