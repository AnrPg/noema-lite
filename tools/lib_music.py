"""music@1 — the Python twin of src/engines/music/music.js (docs/library/music.md): the same check_spec (codes, paths, messages),
exprs and keys. It does not compute pitches or sounds (the engine does, in the app). The tables are the engine's own, as JSON."""
import json
import re
import enginelib as L

ID = "music@1"
T = json.loads(r'''{"SCALES":["major","naturalMinor","harmonicMinor","melodicMinor","dorian","phrygian","lydian","mixolydian","locrian","majorPentatonic","minorPentatonic","blues","wholeTone","octatonicHW","octatonicWH","hexatonic","acoustic","hungarianMinor","doubleHarmonic","chromatic","rast","bayati","hijaz","saba","sikah"],"MODEL":{"tuning":{"$obj":{"system":"enum:12tet|pythagorean|meantone|just|werckmeister3|vallotti|kirnberger3|edo|cents","a4":"numx","tonic":"expr","edo":"numx","fraction":"numx","cents":{"$list":"numx","min":12,"max":12},"layout":"enum:spelled|keyboard","chainStart":"expr"}},"sets":{"$list":{"$obj":{"id":"id!","notes":{"$list":"expr","max":24},"midi":{"$list":"numx","max":24},"pcs":{"$list":"numx","max":12},"transpose":"expr"}},"max":24},"progressions":{"$list":{"$obj":{"id":"id!","key":"expr","mode":"enum:major|minor","chords":{"$req":true,"$list":{"$list":"expr","min":2,"max":6},"min":1,"max":32}}},"max":8},"rhythms":{"$list":{"$obj":{"id":"id!","k":"numx","n":"numx","rot":"numx","pattern":"expr"}},"max":8},"timbres":{"$list":{"$obj":{"id":"id!","kind":"enum:harmonic|saw|square|triangle|string|closed|bar|membrane|custom!","n":"numx","decay":"numx","B":"numx","pluck":"numx","ratios":{"$list":"numx","max":64},"amps":{"$list":"numx","max":64}}},"max":8}},"OUT":{"scalar":{"freq":{"id":"expr","kind":"expr","of":"expr","note":"expr","set":"ref","i":"numx"},"midi":{"id":"expr","kind":"expr","of":"expr","note":"expr","set":"ref","i":"numx"},"cents":{"id":"expr","kind":"expr","of":"expr","from":"expr!","to":"expr!"},"ratioCents":{"id":"expr","kind":"expr","of":"expr","ratio":"numx!"},"monzo":{"id":"expr","kind":"expr","of":"expr","monzo":{"$req":true,"$list":"numx","min":1,"max":6}},"comma":{"id":"expr","kind":"expr","of":"expr","name":"enum:syntonic|pythagorean|schisma|diaschisma|diesis|greaterDiesis|kleisma|septimal|holdrian!"},"interval":{"id":"expr","kind":"expr","of":"expr","from":"expr!","to":"expr!","field":"enum:number|simple|quality|semitones|cents|direction|compound|invNumber|invQuality|ic!"},"chord":{"id":"expr","kind":"expr","of":"expr","set":"ref!","field":"enum:root|quality|inversion|candidates|bass|figure!"},"roman":{"id":"expr","kind":"expr","of":"expr","set":"ref!","key":"expr!","mode":"enum:major|minor","field":"enum:degree|alter|quality|inversion|secondary|figure!"},"pcset":{"id":"expr","kind":"expr","of":"expr","set":"ref!","field":"enum:card|prime|rahnPrime|forte|z|iv1|iv2|iv3|iv4|iv5|iv6|invariance|complement|differs!"},"nrt":{"id":"expr","kind":"expr","of":"expr","set":"ref!","ops":"expr!","field":"enum:root|mode!"},"beats":{"id":"expr","kind":"expr","of":"expr","a":"expr!","b":"expr!","p":"numx","q":"numx"},"roughness":{"id":"expr","kind":"expr","of":"expr","set":"ref!","timbre":"ref","model":"enum:sethares|sethares93|vassilakis"},"partial":{"id":"expr","kind":"expr","of":"expr","timbre":"ref!","note":"expr!","k":"numx!"},"tuning":{"id":"expr","kind":"expr","of":"expr","pc":"numx!","field":"enum:cents|dev!"},"edo":{"id":"expr","kind":"expr","of":"expr","n":"numx!","ratio":"numx!","field":"enum:steps|cents|error!"},"scale":{"id":"expr","kind":"expr","of":"expr","name":"enum:major|naturalMinor|harmonicMinor|melodicMinor|dorian|phrygian|lydian|mixolydian|locrian|majorPentatonic|minorPentatonic|blues|wholeTone|octatonicHW|octatonicWH|hexatonic|acoustic|hungarianMinor|doubleHarmonic|chromatic|rast|bayati|hijaz|saba|sikah!","i":"numx","field":"enum:size|cents|semitones!"},"melakarta":{"id":"expr","kind":"expr","of":"expr","n":"numx!","i":"numx!"},"rhythm":{"id":"expr","kind":"expr","of":"expr","rhythm":"ref!","field":"enum:onsets|length|necklace|evenness!"},"onset":{"id":"expr","kind":"expr","of":"expr","rhythm":"ref!","i":"numx!"},"duration":{"id":"expr","kind":"expr","of":"expr","value":"numx!","dots":"numx","tuplet":"numx","tupletIn":"numx","bpm":"numx!","beat":"numx"},"meter":{"id":"expr","kind":"expr","of":"expr","meter":"expr!","field":"enum:beats|beatUnit|compound|bar!"},"vl":{"id":"expr","kind":"expr","of":"expr","progression":"ref!","rule":"enum:parallel5|parallel8|contrary|hidden|crossing|overlap|spacing|range|leadingTone|all!"},"resonator":{"id":"expr","kind":"expr","of":"expr","type":"enum:string|open|closed|bar|membrane!","k":"numx!","L":"numx","tension":"numx","mu":"numx","r":"numx","tempC":"numx","f1":"numx","B":"numx"}},"series":{"dissonance":{"id":"expr","kind":"expr","of":"expr","timbre":"ref","note":"expr","from":"numx","to":"numx","points":"int:2:2000","model":"enum:sethares|sethares93|vassilakis","part":"enum:x|y!"},"spectrum":{"id":"expr","kind":"expr","of":"expr","timbre":"ref!","note":"expr!","part":"enum:x|y!"},"waveform":{"id":"expr","kind":"expr","of":"expr","timbre":"ref!","samples":"int:16:2000","part":"enum:x|y!"},"tuning":{"id":"expr","kind":"expr","of":"expr","part":"enum:x|y|dev!"},"scale":{"id":"expr","kind":"expr","of":"expr","name":"enum:major|naturalMinor|harmonicMinor|melodicMinor|dorian|phrygian|lydian|mixolydian|locrian|majorPentatonic|minorPentatonic|blues|wholeTone|octatonicHW|octatonicWH|hexatonic|acoustic|hungarianMinor|doubleHarmonic|chromatic|rast|bayati|hijaz|saba|sikah!","part":"enum:x|y!"},"rhythm":{"id":"expr","kind":"expr","of":"expr","rhythm":"ref!","part":"enum:x|y!"},"harmonics":{"id":"expr","kind":"expr","of":"expr","note":"expr!","n":"int:1:64","part":"enum:x|y!"}},"scene":{"keyboard":{"id":"expr","kind":"expr","of":"expr","set":"ref","from":"expr","to":"expr","cents":"bool"},"staff":{"id":"expr","kind":"expr","of":"expr","set":"ref","progression":"ref","clef":"enum:treble|bass|grand"},"clock":{"id":"expr","kind":"expr","of":"expr","set":"ref","rhythm":"ref"},"circle":{"id":"expr","kind":"expr","of":"expr","set":"ref"},"tonnetz":{"id":"expr","kind":"expr","of":"expr","set":"ref"}},"sound":{"play":{"id":"expr","kind":"expr","of":"expr","set":"ref","progression":"ref","rhythm":"ref","timbre":"ref","mode":"enum:chord|arpeggio","dur":"numx","bpm":"numx"}}},"REFS":{"set":"sets","progression":"progressions","rhythm":"rhythms","timbre":"timbres"},"PITCHF":["note","from","to","a","b"],"PITCH_RE":"^([A-G])(#{1,3}|x|b{1,3}|n)?([\\^v])?(-1|[0-9])$","PC_RE":"^[A-G](#{1,2}|x|b{1,2})?$","IVL_RE":"^-?(P|M|m|A{1,3}|d{1,3})([1-9]|1[0-5])$","METER_RE":"^([1-9][0-9]?)/(1|2|4|8|16|32|64)$","OPS_RE":"^[PLR]{1,12}$","PAT_RE":"^[x.]{1,64}$"}''')
RX = {k: re.compile(T[v].replace("$", r"\Z")) for k, v in (("pitch", "PITCH_RE"), ("pc", "PC_RE"), ("ivl", "IVL_RE"), ("meter", "METER_RE"), ("ops", "OPS_RE"), ("pat", "PAT_RE"))}
MSG = {"pitch": "needs a pitch such as C4, F#3, Bb5, Ebb2, Gx4 (quarter tones: ^ up, v down)", "pc": "needs a pitch class such as C, F#, Bb",
       "ivl": "needs an interval such as M3, P5, d7, -m2", "meter": "needs a time signature such as 3/4 or 6/8",
       "ops": "needs P, L and R operations, such as PLR (at most 12)", "pat": "needs a pattern of x (onset) and . (rest), at most 64"}
PERFECT = [True, False, False, True, True, False, False]


def _ok(k, v): return isinstance(v, str) and RX[k].search(v) is not None
def _blank(v): return isinstance(v, str) and v.strip() != ""


def parse_ivl(s):
    """an interval name (M3, P5, d7, -m2) → True when the quality fits the number (the engine's parseIvl)"""
    m = RX["ivl"].search(s) if isinstance(s, str) else None
    if not m: return False
    per, q = PERFECT[(int(m.group(2)) - 1) % 7], m.group(1)
    if q == "P": return per
    if q in ("M", "m"): return not per
    return True


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if isinstance(spec, dict) else None
    L.walk(m, T["MODEL"], "model", E, W)
    M = m if isinstance(m, dict) else {}
    def arr(k): return M[k] if isinstance(M.get(k), list) else []
    ids = {"sets": [], "progressions": [], "rhythms": [], "timbres": []}
    seen = []
    for k in ids:
        for i, x in enumerate(arr(k)):
            if not isinstance(x, dict) or not isinstance(x.get("id"), str): continue
            if x["id"] in seen: E("duplicate", f"model.{k}[{i}].id", f"the id {x['id']} is used twice")
            else: seen.append(x["id"]); ids[k].append(x["id"])
    tu = M.get("tuning") if isinstance(M.get("tuning"), dict) else None
    if tu is not None:
        for k in ("tonic", "chainStart"):
            if isinstance(tu.get(k), str) and not _ok("pc", tu[k]): E("value", "model.tuning." + k, MSG["pc"])
        if tu.get("system") == "edo" and "edo" not in tu: E("value", "model.tuning.edo", "missing")
        if tu.get("system") == "cents" and "cents" not in tu: E("value", "model.tuning.cents", "missing")
    for i, x in enumerate(arr("sets")):
        if not isinstance(x, dict): continue
        p = f"model.sets[{i}]"
        if len([k for k in ("notes", "midi", "pcs") if k in x]) != 1: E("value", p, "needs exactly one of notes, midi, pcs")
        if isinstance(x.get("notes"), list):
            for j, v in enumerate(x["notes"]):
                if _blank(v) and not _ok("pitch", v): E("value", f"{p}.notes[{j}]", MSG["pitch"])
        if "transpose" in x:
            if "notes" not in x: W("unused", p + ".transpose", "only with notes")
            elif _blank(x["transpose"]) and not parse_ivl(x["transpose"]): E("value", p + ".transpose", MSG["ivl"])
    for i, x in enumerate(arr("progressions")):
        if not isinstance(x, dict): continue
        p = f"model.progressions[{i}]"
        if isinstance(x.get("key"), str) and not _ok("pc", x["key"]): E("value", p + ".key", MSG["pc"])
        ch = x.get("chords")
        if isinstance(ch, list):
            for j, c in enumerate(ch):
                if isinstance(c, list):
                    for k, v in enumerate(c):
                        if _blank(v) and not _ok("pitch", v): E("value", f"{p}.chords[{j}][{k}]", MSG["pitch"])
            if all(isinstance(c, list) for c in ch) and any(len(c) != len(ch[0]) for c in ch): E("size", p + ".chords", "every chord needs the same number of voices")
    for i, x in enumerate(arr("rhythms")):
        if not isinstance(x, dict): continue
        p = f"model.rhythms[{i}]"
        if not (("k" in x and "n" in x) or "pattern" in x): E("value", p, "needs k and n, or a pattern")
        if _blank(x.get("pattern")) and not _ok("pat", x["pattern"]): E("value", p + ".pattern", MSG["pat"])
    for i, x in enumerate(arr("timbres")):
        if not isinstance(x, dict): continue
        r, a = x.get("ratios"), x.get("amps")
        if x.get("kind") == "custom" and not (isinstance(r, list) and isinstance(a, list) and len(r) == len(a) and len(r) > 0):
            E("value", f"model.timbres[{i}]", "needs ratios and amps of the same length")

    def out(o, at, E, W):
        tb = T["OUT"].get(o.get("kind"), {}).get(o.get("of")) if isinstance(o.get("kind"), str) and isinstance(o.get("of"), str) else None
        if tb is None: E("output", at + ".of", f"{o.get('of')} is not a {o.get('kind')} output of {ID}"); return
        L.walk(o, tb, at, E, W)
        for k in tb:
            v = o.get(k)
            if k in T["REFS"] and isinstance(v, str) and L._full(L.ID_RE, v) and v not in ids[T["REFS"][k]]: E("ref", f"{at}.{k}", f"no {k} {v}")
            if k in T["PITCHF"] and str(tb[k]).startswith("expr") and _blank(v) and not _ok("pitch", v): E("value", f"{at}.{k}", MSG["pitch"])
        if _blank(o.get("key")) and not _ok("pc", o["key"]): E("value", at + ".key", MSG["pc"])
        if o.get("of") == "meter" and _blank(o.get("meter")) and not _ok("meter", o["meter"]): E("value", at + ".meter", MSG["meter"])
        if o.get("of") == "nrt" and _blank(o.get("ops")) and not _ok("ops", o["ops"]): E("value", at + ".ops", MSG["ops"])
        if o.get("of") in ("freq", "midi") and not ("note" in o or ("set" in o and "i" in o)): E("value", at, "needs note, or set and i")
        if o.get("of") == "play" and len([k for k in ("set", "progression", "rhythm") if k in o]) != 1: E("value", at, "needs one of set, progression, rhythm")
        if o.get("of") in ("keyboard", "staff", "clock", "circle", "tonnetz") and o.get("kind") == "scene" and not any(k in o for k in ("set", "progression", "rhythm")):
            E("value", at, "needs a set" + (" or a progression" if o["of"] == "staff" else " or a rhythm" if o["of"] == "clock" else ""))
    L.check_outputs(spec, ID, ["scalar", "series", "scene", "sound"], out, E, W)
    return P


def _collect(v, kd, p, kind, out):
    if isinstance(kd, str):
        if kd.rstrip("!") == kind and isinstance(v, str) and v.strip() != "":
            out.append((v, p, []) if kind == "numx" else (v, p))
        return
    if "$obj" in kd:
        if not isinstance(v, dict): return
        for k, sub in kd["$obj"].items():
            if k in v: _collect(v[k], sub, p + "." + k, kind, out)
        return
    if "$list" in kd and isinstance(v, list):
        for i, x in enumerate(v): _collect(x, kd["$list"], f"{p}[{i}]", kind, out)


def _gather(spec, kind):
    out = []
    if not isinstance(spec, dict): return out
    _collect(spec.get("model"), {"$obj": T["MODEL"]}, "model", kind, out)
    outs = spec.get("outputs") if isinstance(spec.get("outputs"), list) else []
    for i, o in enumerate(outs):
        if isinstance(o, dict) and isinstance(o.get("kind"), str) and o["kind"] in T["OUT"] and isinstance(o.get("of"), str) and o["of"] in T["OUT"][o["kind"]]:
            _collect(o, {"$obj": T["OUT"][o["kind"]][o["of"]]}, f"outputs[{i}]", kind, out)
    return out


def exprs(spec): return _gather(spec, "numx")
def keys(spec): return []
