"""The checks of the control-loop engine pid@1 in Python (docs/INTERACTIVE_ENGINES.md §3): the twin of check() and checkSpec() in
src/engines/pid/pid.js — the same codes, paths and messages (tests/pid.js runs both on the same models and specs).
The validators use it to check a sim-spec@1 spec whose engine is pid@1; it does not simulate. Stdlib only.

  check(model)     → [{code, path, msg, level: 'error' | 'warning'}]   (plant, controller, signals, noise, transient, bindings)
  check_spec(spec) → the same for a spec's model and outputs, paths from the spec (model.…, outputs[i]…)"""
import math

ID = "pid@1"
MAX_STEPS, MAX_BINDINGS, MAX_STEPS_SIGNAL = 200000, 24, 32
STATS = ["final", "min", "max", "mean", "pp", "rms"]
SIGNALS = ["r", "y", "ym", "u", "e"]
METRICS = ["rise", "overshoot", "peak", "peakTime", "settling", "yFinal", "ess", "iae", "ise", "itae", "satTime"]
AW = ["none", "clamp", "backcalc"]
PLANTS = {   # (in the JS order: the messages come out in it)
    "fopdt": [("K", "fin!"), ("tau", "pos!"), ("theta", "nonneg"), ("y0", "fin")],
    "second": [("K", "fin!"), ("wn", "pos!"), ("zeta", "nonneg!"), ("theta", "nonneg"), ("y0", "fin")],
    "integrator": [("K", "fin!"), ("theta", "nonneg"), ("y0", "fin")],
    "motor": [("J", "pos"), ("b", "nonneg"), ("Kt", "pos"), ("R", "pos"), ("L", "nonneg"), ("output", "enum"), ("theta", "nonneg")],
    "thermal": [("C", "pos!"), ("R", "pos!"), ("Tamb", "fin"), ("theta", "nonneg"), ("y0", "fin")],
    "tank": [("A", "pos!"), ("k", "pos!"), ("h0", "nonneg"), ("hMax", "pos"), ("theta", "nonneg")],
}
MOTOR = {"J": 0.01, "b": 0.1, "Kt": 0.01, "R": 1, "L": 0.5}
CTRL = [("Kp", "fin"), ("Ki", "fin"), ("Kd", "fin"), ("N", "pos"), ("Tf", "nonneg"), ("b", "fin"), ("c", "fin"), ("uMin", "fin"), ("uMax", "fin"),
        ("antiWindup", "enum"), ("Tt", "pos"), ("Ts", "nonneg"), ("u0", "fin")]
SIG = {
    "step": [("from", "fin"), ("to", "fin!"), ("at", "nonneg")],
    "ramp": [("from", "fin"), ("slope", "fin!"), ("at", "nonneg"), ("until", "pos")],
    "sine": [("offset", "fin"), ("amp", "fin!"), ("freq", "pos!"), ("phase", "fin")],
}
MODEL_KEYS = ["plant", "controller", "mode", "setpoint", "load", "disturbance", "noise", "metrics", "transient", "bindings"]
BIND_EL = ["plant", "controller", "setpoint", "load", "disturbance", "noise"]
OUT_KEYS = ["id", "kind", "signal", "metric", "time", "at", "stat"]

def _obj(v): return isinstance(v, dict)
def _num(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
def _int(v): return _num(v) and float(v).is_integer()
def _expr(v): return isinstance(v, str) and v.strip() != ""
def _extra(o, allowed): return sorted(k for k in o if k not in allowed)
def _in(v, lst): return isinstance(v, str) and v in lst

def ok_num(kind, v):
    if not _num(v): return False
    if kind == "pos": return v > 0
    if kind == "nonneg": return v >= 0
    return True

def _check_fields(q, F, path, E, code, enums):
    for k in _extra(q, [f for f, _ in F]): E(code, f"{path}.{k}", "unknown field")
    for k, spec in F:
        must = spec.endswith("!"); kd = spec[:-1] if must else spec
        if k not in q:
            if must: E(code, f"{path}.{k}", "missing")
            continue
        if kd == "enum":
            if not _in(q[k], enums[k]): E(code, f"{path}.{k}", "one of " + ", ".join(enums[k]))
        elif not ok_num(kd, q[k]): E(code, f"{path}.{k}", "out of range")

def _check_signal(v, path, E):
    msg = "a number or one of step, ramp, sine, steps"
    if not _obj(v):
        if not _num(v): E("signal", path, msg)
        return
    keys = list(v)
    if len(keys) != 1 or keys[0] not in ("step", "ramp", "sine", "steps"): E("signal", path, msg); return
    kind = keys[0]; q = v[kind]
    if kind == "steps":
        ok = isinstance(q, list) and 1 <= len(q) <= MAX_STEPS_SIGNAL and all(
            isinstance(p, list) and len(p) == 2 and ok_num("nonneg", p[0]) and _num(p[1]) and (i == 0 or p[0] >= q[i - 1][0]) for i, p in enumerate(q))
        if not ok: E("signal", path + ".steps", f"a list of 1 to {MAX_STEPS_SIGNAL} [t, value] pairs, t ≥ 0 ascending")
        return
    if not _obj(q): E("signal", f"{path}.{kind}", "needs an object"); return
    _check_fields(q, SIG[kind], f"{path}.{kind}", E, "signal", {})
    if kind == "ramp" and _num(q.get("until")) and q["until"] <= (q["at"] if _num(q.get("at")) else 0): E("signal", path + ".ramp.until", "must be after at")

def _fastest(p):
    t = p["type"]
    if t == "fopdt": return p["tau"]
    if t == "second":
        z, wn = p["zeta"], p["wn"]
        return 1 / wn if z < 1 else 1 / (wn * (z + math.sqrt(z * z - 1)))
    if t == "thermal": return p["R"] * p["C"]
    if t == "motor":
        m = {**MOTOR, **p}
        te = m["L"] / m["R"] if m["L"] > 0 else math.inf
        tm = m["J"] * m["R"] / (m["Kt"] * m["Kt"] + m["b"] * m["R"])
        return min(te, tm)
    return math.inf

def _bindable(model, el):
    v = model.get(el)
    if el == "plant": return [f for f, _ in PLANTS[v["type"]] if f != "output"] if _obj(v) and _in(v.get("type"), PLANTS) else None
    if el == "controller": return [f for f, _ in CTRL] if _obj(v) else None
    if el == "noise": return ["std"] if _obj(v) else None
    if _num(v): return ["value"]
    if _obj(v) and v:
        k = list(v)[0]
        return [k + "." + f for f, _ in SIG[k]] if k in SIG else [] if k == "steps" else None
    return None

def check(model):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    W = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    if not _obj(model): E("model", "", "model is not an object"); return P
    for k in _extra(model, MODEL_KEYS): E("unknown-field", k, "unknown field")
    pl = model.get("plant"); plant_ok = False
    if not _obj(pl): E("plant", "plant", "needs an object {type, …}")
    elif not _in(pl.get("type"), PLANTS): E("plant", "plant.type", "one of " + ", ".join(PLANTS))
    else:
        n0 = len(P)
        _check_fields(pl, [("type", "enum")] + PLANTS[pl["type"]], "plant", E, "plant", {"type": list(PLANTS), "output": ["speed", "position"]})
        if pl["type"] == "tank" and _num(pl.get("h0")) and _num(pl.get("hMax")) and pl["h0"] > pl["hMax"]: E("plant", "plant.h0", "above hMax")
        plant_ok = len(P) == n0
    if "mode" in model and model["mode"] not in ("closed", "open"): E("mode", "mode", "closed or open")
    is_open = model.get("mode") == "open"; c = model.get("controller")
    if "controller" not in model:
        if not is_open: E("controller", "controller", "a closed loop needs a controller {Kp, Ki?, Kd?, …}")
    elif not _obj(c): E("controller", "controller", "needs an object {Kp, Ki?, Kd?, …}")
    else:
        _check_fields(c, CTRL, "controller", E, "controller", {"antiWindup": AW})
        if _num(c.get("uMin")) and _num(c.get("uMax")) and not c["uMin"] < c["uMax"]: E("controller", "controller", "uMin must be below uMax")
        if is_open: W("unused", "controller", "ignored in an open loop")
        elif not any(_num(c.get(k)) and c[k] != 0 for k in ("Kp", "Ki", "Kd")): W("no-gain", "controller", "Kp, Ki and Kd are all 0")
        if "antiWindup" in c and c["antiWindup"] != "none" and "uMin" not in c and "uMax" not in c: W("no-limits", "controller.antiWindup", "anti-windup needs uMin or uMax")
    for k in ("setpoint", "load", "disturbance"):
        if k in model: _check_signal(model[k], k, E)
    if "noise" in model:
        nz = model["noise"]
        if not _obj(nz): E("noise", "noise", "needs an object {std, seed?}")
        else:
            for k in _extra(nz, ["std", "seed"]): E("noise", "noise." + k, "unknown field")
            if not ok_num("nonneg", nz.get("std")): E("noise", "noise.std", "needs a number ≥ 0")
            if "seed" in nz and not (_int(nz["seed"]) and nz["seed"] >= 0): E("noise", "noise.seed", "needs a whole number ≥ 0")
    if "metrics" in model:
        mt = model["metrics"]
        if not _obj(mt): E("metrics", "metrics", "needs an object {band?}")
        else:
            for k in _extra(mt, ["band"]): E("metrics", "metrics." + k, "unknown field")
            if "band" in mt and not (_num(mt["band"]) and 0 < mt["band"] <= 0.5): E("metrics", "metrics.band", "needs a number in (0, 0.5]")
    te = dt = None
    if "transient" in model:
        tr = model["transient"]
        if not _obj(tr): E("transient", "transient", "needs an object {tEnd, dt?}")
        else:
            for k in _extra(tr, ["tEnd", "dt"]): E("unknown-field", "transient." + k, "unknown field")
            if "tEnd" not in tr: E("transient", "transient.tEnd", "missing")
            elif _num(tr["tEnd"]) and tr["tEnd"] > 0: te = tr["tEnd"]
            elif not _expr(tr["tEnd"]): E("transient", "transient.tEnd", "needs a number > 0 or an expression")
            if "dt" in tr:
                if _num(tr["dt"]) and tr["dt"] > 0: dt = tr["dt"]
                elif not _expr(tr["dt"]): E("transient", "transient.dt", "needs a number > 0 or an expression")
            elif te is not None: dt = te / 1000
            if te is not None and dt is not None and math.ceil(te / dt - 1e-9) > MAX_STEPS: E("budget", "transient", f"tEnd / dt is more than {MAX_STEPS} steps")
            if dt is not None and _obj(c) and _num(c.get("Ts")) and c["Ts"] > 0 and c["Ts"] < dt * (1 - 1e-9): E("controller", "controller.Ts", "shorter than the step (transient.dt)")
            if dt is not None and plant_ok and dt > _fastest(pl) / 2: W("stiff", "transient.dt", "longer than half the plant's fastest time constant (inaccurate or unstable)")
    bs = model.get("bindings")
    if "bindings" in model and not (isinstance(bs, list) and len(bs) <= MAX_BINDINGS): E("binding", "bindings", f"a list of at most {MAX_BINDINGS} {{element, prop?, expr}}")
    for i, b in enumerate(bs[:MAX_BINDINGS] if isinstance(bs, list) else []):
        w = f"bindings[{i}]"
        if not _obj(b): E("binding", w, "an object {element, prop?, expr}"); continue
        for k in _extra(b, ["element", "prop", "expr"]): E("unknown-field", f"{w}.{k}", "unknown field")
        el = b.get("element")
        if not _in(el, BIND_EL): E("binding", w + ".element", "one of " + ", ".join(BIND_EL))
        elif el not in model: E("binding", w + ".element", "not in the model")
        else:
            props = _bindable(model, el); prop = b["prop"] if "prop" in b else "value"
            if props is not None and not _in(prop, props): E("binding", w + ".prop", "one of " + ", ".join(props) if props else "nothing to set here")
        x = b.get("expr")
        if not (_expr(x) or _num(x) or isinstance(x, bool)): E("binding", w + ".expr", "needs an expression")
    return P

def check_spec(spec):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    m = spec.get("model") if _obj(spec) else None
    if not _obj(m): E("model", "model", ID + " needs a model {plant, controller?, setpoint?, transient, …}"); return P
    for p in check(m): P.append({**p, "path": "model" + ("." + p["path"] if p["path"] else "")})
    if "transient" not in m: E("transient", "model.transient", "missing: every output of " + ID + " comes from a run {tEnd, dt?}")
    for i, o in enumerate(spec.get("outputs") if isinstance(spec.get("outputs"), list) else []):
        w = f"outputs[{i}]"
        if not (_obj(o) and o.get("kind") in ("scalar", "series")): continue
        for k in _extra(o, OUT_KEYS): E("unknown-field", f"{w}.{k}", "unknown field")
        src = [k for k in ("signal", "metric", "time") if k in o]
        if len(src) != 1: E("output", w, "must name what it reads: one of signal, metric, time"); continue
        s, at, st = src[0], "at" in o, "stat" in o
        if s == "time" and not (o["time"] is True and o["kind"] == "series"): E("output", w + ".time", "true on a series output (the time axis)")
        if s == "signal" and not _in(o["signal"], SIGNALS): E("output", w + ".signal", "one of " + ", ".join(SIGNALS))
        if s == "metric":
            if o["kind"] != "scalar": E("output", w, "a metric is a scalar output")
            elif not _in(o["metric"], METRICS): E("output", w + ".metric", "one of " + ", ".join(METRICS))
        if (at or st) and not (o["kind"] == "scalar" and s == "signal"): E("output", w, "at and stat belong to a scalar output of a signal")
        elif s == "signal" and o["kind"] == "scalar" and not at and not st: E("output", w, "a scalar signal needs at or stat")
        if at and st: E("output", w, "at or stat, not both")
        if at and not ((_num(o["at"]) and o["at"] >= 0) or _expr(o["at"])): E("output", w + ".at", "needs a number ≥ 0 or an expression")
        if st and not _in(o["stat"], STATS): E("output", w + ".stat", "one of " + ", ".join(STATS))
    return P
