"""The device checks of the IoT twin engine twin@1 in Python (docs/INTERACTIVE_ENGINES.md §5): the twin of check(), checkFaults() and
checkSpec() in engine/src/42_engine_twin.js — the same codes, paths and messages (tests/twin.js runs both on the same specs).
It does not simulate.

  check(device)                → [{code, path, msg, level: 'error' | 'warning'}]
  check_faults(device, faults) → [{code: 'fault', path, msg, level: 'error'}]
  check_spec(spec)             → the same for a sim-spec's model {device, bindings} and outputs"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rf import num, walk, numeric_fields, check_num, kind_msg, g, _obj, check_bindings, _check_spec   # noqa: E402

ID, FORMAT = "twin@1", "noema.twin/v1"
MAX_SENSORS, MAX_SAMPLES, MAX_EVENTS, DEF_EVENTS = 8, 2000, 5000000, 1000000
TECHS = ["lora", "ble", "fsk"]
CHEM_V0 = {"li-ion": 3.0, "lifepo4": 2.5, "alkaline": 0.9, "nimh": 1.0}
TABLE = {
    "format": "const",
    "battery": {"req": True, "$obj": {"capacity": "pos!", "chem": "enum:li-ion|lifepo4|alkaline|nimh|custom", "cells": "int:1:6",
                                      "curve": {"$list": {"soc": "unit!", "v": "pos!"}, "max": 32},
                                      "selfDischarge": "unit", "rInt": "nonneg", "soc0": "unit", "cutoff": "pos", "tempCap": "unit"}},
    "power": {"$obj": {"sleep": "nonneg", "active": "nonneg", "sense": "nonneg", "tx": "nonneg", "rx": "nonneg"}},
    "schedule": {"req": True, "$obj": {"period": "pos!", "sense": "nonneg", "txEvery": "int:1:10000", "ack": "bool", "rxWindow": "nonneg", "retries": "int:0:8", "boot": "nonneg"}},
    "sensors": {"$list": {"id": "id!", "base": "fin", "amp": "fin", "cycle": "pos", "noise": "nonneg", "drift": "fin", "current": "nonneg", "tempco": "fin"}, "max": MAX_SENSORS},
    "radio": {"$obj": {"tech": "enum:" + "|".join(TECHS), "f": "pos", "power": "fin", "gain": "fin", "d": "pos", "n": "pos", "d0": "pos", "sigma": "nonneg", "extra": "nonneg", "nf": "nonneg",
                       "sf": "int:7:12", "bw": "pos", "cr": "int:1:4", "payload": "int:0:255", "bitrate": "pos", "txTime": "pos"}},
    "brownout": {"$obj": {"v": "nonneg", "reset": "nonneg"}},
    "env": {"$obj": {"temp": "fin", "swing": "nonneg", "cycle": "pos"}},
    "clock": {"$obj": {"ppm": "fin", "tempco": "fin", "t0": "fin", "guard": "nonneg", "resync": "nonneg"}},
    "network": {"$obj": {"nodes": "int:0:200", "period": "pos", "airtime": "pos", "jitter": "unit", "capture": "nonneg", "spread": "nonneg", "offset": "fin"}},
    "sim": {"req": True, "$obj": {"duration": "pos!", "samples": f"int:2:{MAX_SAMPLES}", "trace": "nonneg", "maxEvents": f"int:1:{MAX_EVENTS}"}},
}
NUM_FIELDS = numeric_fields(TABLE)
FAULT_KINDS = ["sensor-stuck", "sensor-drift", "battery-ageing", "antenna-detached", "wake-period", "brownout", "clock-drift", "sync-wake", "busy-channel", "sensor-tempco"]
FAULT_KEYS = ["kind", "sensor", "value", "at", "rate", "factor", "rInt", "loss", "period", "v", "ppm", "nodes", "coef"]
FAULT_NUM = {"value": "fin", "at": "nonneg", "rate": "fin", "factor": "pos", "rInt": "pos", "loss": "nonneg", "period": "pos", "v": "pos", "ppm": "fin", "nodes": "int:1:200", "coef": "fin"}
SCALARS = ["lifeAnalytic", "lifeSim", "iAvg", "iAvgAnalytic", "chargeUsed", "socEnd", "vEnd", "vMin", "wakes", "sent", "attempts", "delivered", "lost", "deliveryRatio",
           "resets", "dead", "tDead", "rssiMean", "snrMean", "per", "airtime", "activeFraction", "readingMean", "readingLast", "readingErr",
           "tempMin", "tempMax", "tempMean", "collisions", "slotMisses", "clockErrMax", "ppmMean"]
SERIES = ["t", "soc", "v", "vload", "current", "delivered", "resets", "rssi", "rxT", "reading", "truth", "traceT", "traceI", "eventT", "eventCode", "temp", "clockErr"]
PER_SENSOR = ["readingMean", "readingLast", "readingErr", "reading", "truth"]

def check(dev):
    P = []
    E = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "error"})
    W = lambda code, path, msg: P.append({"code": code, "path": path, "msg": msg, "level": "warning"})
    if not _obj(dev): E("format", "", "device is not an object"); return P
    walk(dev, TABLE, "", E, W, FORMAT)
    if any(p["level"] == "error" for p in P): return P
    ids = set()
    for i, x in enumerate(dev.get("sensors") or []):
        if x["id"] in ids: E("dup-id", f"sensors[{i}].id", "duplicate id " + x["id"])
        else: ids.add(x["id"])
    b, s, r, sm = dev["battery"], dev["schedule"], dev.get("radio") or {}, dev["sim"]
    if g(b, "chem", "li-ion") == "custom":
        c = [(num(p["soc"]), num(p["v"])) for p in b["curve"]] if isinstance(b.get("curve"), list) else []
        okc = len(c) >= 2 and c[0][0] == 0 and c[-1][0] == 1 and all(i == 0 or (p[0] > c[i - 1][0] and p[1] >= c[i - 1][1]) for i, p in enumerate(c))
        if not okc: E("value", "battery.curve", "a custom battery needs a curve from soc 0 to 1, rising")
    elif "curve" in b: W("unknown-field", "battery.curve", "ignored (chem is not custom)")
    period = num(s["period"])
    if not (g(s, "sense", 0.05) < period): E("value", "schedule.sense", "must be shorter than the period")
    if g(r, "tech", "lora") == "lora" and not (7800 <= g(r, "bw", 125e3) <= 500000): E("value", "radio.bw", "LoRa bandwidth from 7.8 to 500 kHz")
    retries, ack, tx_every = g(s, "retries", 0), g(s, "ack", False), g(s, "txEvery", 1)
    wakes = num(sm["duration"]) / period   # as JS: Math.ceil(Infinity) is Infinity (math.ceil raises), and float products overflow to inf
    est = (float(math.ceil(wakes)) if math.isfinite(wakes) else math.inf) * (2 + (retries + 1) * (2 if ack else 1) / tx_every)
    if est > g(sm, "maxEvents", DEF_EVENTS): E("budget", "sim.duration", "more events than sim.maxEvents")
    return P

def check_faults(dev, faults):
    P = []
    E = lambda path, msg: P.append({"code": "fault", "path": path, "msg": msg, "level": "error"})
    if not isinstance(faults, list): E("", "faults must be a list"); return P
    sensors = {x.get("id") for x in (dev.get("sensors") if _obj(dev) and isinstance(dev.get("sensors"), list) else []) if _obj(x)}
    for i, f in enumerate(faults):
        at = f"faults[{i}]"
        if not _obj(f): E(at, "a fault is an object {kind, ...}"); continue
        for k in f:
            if k not in FAULT_KEYS: E(f"{at}.{k}", "unknown field")
        kind = f.get("kind")
        if not (isinstance(kind, str) and kind in FAULT_KINDS): E(at + ".kind", "one of " + ", ".join(FAULT_KINDS)); continue
        for k in FAULT_KEYS:
            if k in FAULT_NUM and k in f and not check_num(FAULT_NUM[k], f[k]): E(f"{at}.{k}", kind_msg(FAULT_NUM[k]))
        if kind.startswith("sensor-") and not (isinstance(f.get("sensor"), str) and f["sensor"] in sensors): E(at + ".sensor", "not a sensor of the device")
        if kind == "battery-ageing" and "factor" in f and not (num(f["factor"]) <= 1): E(at + ".factor", "needs a number > 0 and <= 1")
    return P

def check_spec(spec):
    r = _check_spec(spec, "device", check, "device")
    if isinstance(r, list): return r
    P, E, W, m = r
    check_bindings(m, NUM_FIELDS, "device", E)
    dv = m.get("device")
    sensors = [x.get("id") for x in dv["sensors"] if _obj(x)] if _obj(dv) and isinstance(dv.get("sensors"), list) else []
    outs = spec.get("outputs")
    if not isinstance(outs, list): E("format", "outputs", "not an array"); return P
    for i, o in enumerate(outs):
        at = f"outputs[{i}]"
        if not _obj(o): E("output", at, "not an object"); continue
        of = o["of"] if "of" in o else o.get("id")
        kind = o.get("kind")
        if kind == "scalar":
            if not (isinstance(of, str) and of in SCALARS): E("output", at + ".of", "not a scalar of " + ID); continue
        elif kind == "series":
            if not (isinstance(of, str) and of in SERIES): E("output", at + ".of", "not a series of " + ID); continue
        else: E("output", at + ".kind", "scalar or series"); continue
        if of in PER_SENSOR:
            bad = not (len(sensors) if "sensor" not in o else o["sensor"] in sensors)
        else: bad = "sensor" in o
        if bad: E("output", at + ".sensor", "not a sensor of the device")
    return P
