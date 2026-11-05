"""text@1 in Python (docs/library/text.md): the twin of the checks of engine/src/48_lib_text.js — check_spec(spec), exprs(spec), keys(spec)
give the same problems (code, path, msg, level) and the same lists as the JS module; tests/enginelib.js compares both on
tests/fixtures/enginelib/text.json. It does not analyse texts."""
import re
import enginelib as L

ID = "text@1"
LANGS = ["en", "la", "grc", "el", "de", "fr", "es", "it", "ru", "ar", "he", "zh", "ja", "th", "other"]
METRES = ["hexameter", "pentameter", "elegiac", "trimeter", "senarius", "hendecasyllable", "sapphic", "iambic5", "iambic4", "trochaic4"]
FORMULAS = ["flesch", "fk", "fog", "smog", "coleman", "ari", "lix", "amstad", "kandel", "huerta", "szigriszt", "oborneva"]
MEASURES = ["pmi", "npmi", "mi3", "t", "chi2", "g2", "dice", "logDice"]
LIM = {"texts": 30, "body": 60000, "lexicon": 2000}
RAW_MAX = 64
EN_METRES = ["iambic5", "iambic4", "trochaic4"]

TABLE = {
    "texts": {"$req": True, "$list": {"$obj": {"id": "id!", "lang": "enum:" + "|".join(LANGS), "label": "key"}}, "min": 1, "max": LIM["texts"]},
    "normalize": {"$obj": {"form": "enum:NFC|NFD|NFKC|none", "case": "enum:lower|keep", "foldSigma": "bool", "diacritics": "enum:keep|strip",
                           "uvij": "bool", "numbers": "enum:keep|drop", "hyphens": "enum:join|split", "enclitics": "bool", "segment": "enum:auto|chars|words"}},
    "metre": {"$obj": {"pattern": "enum:" + "|".join(METRES) + "!", "lang": "enum:la|grc|en", "mcl": "enum:both|long|short", "synizesis": "bool", "max": "int:1:64"}},
    "lexicon": {"$list": {"$obj": {"p": "expr!"}}, "max": LIM["lexicon"]},
}
T_, LINE, READ = "ref", "int:1:2000", "int:1:64"
OUT = {
    "scalar": {
        "tokens": {"text": T_}, "types": {"text": T_}, "ttr": {"text": T_}, "hapax": {"text": T_}, "dis": {"text": T_}, "sentences": {"text": T_}, "chars": {"text": T_},
        "meanWordLen": {"text": T_}, "yuleK": {"text": T_}, "herdanC": {"text": T_}, "guiraudR": {"text": T_}, "simpsonD": {"text": T_}, "honoreR": {"text": T_},
        "mattr": {"text": T_, "window": "numx"}, "mtld": {"text": T_, "threshold": "numx"}, "hdd": {"text": T_, "sample": "numx"},
        "freq": {"text": T_, "word": "raw!", "per": "numx"},
        "zipf": {"text": T_, "fit": "enum:ols|mle", "rmin": "numx", "rmax": "numx", "xmin": "numx"}, "heaps": {"text": T_, "what": "enum:beta|K"},
        "assoc": {"text": T_, "w1": "raw", "w2": "raw", "measure": "enum:" + "|".join(MEASURES) + "!", "span": "int:1:10", "o11": "numx", "r1": "numx", "c1": "numx", "n": "numx"},
        "keyness": {"text": "ref!", "ref": "ref!", "word": "raw!", "measure": "enum:g2|logRatio"},
        "readability": {"text": T_, "formula": "enum:" + "|".join(FORMULAS) + "!", "what": "enum:score|asl|asw|words|sentences|syllables"},
        "delta": {"a": "ref!", "b": "ref!", "mfw": "numx", "variant": "enum:burrows|cosine|quadratic"},
        "syllables": {"text": T_, "line": LINE},
        "scansions": {"text": T_, "line": "int:1:2000!"},
        "foot": {"text": T_, "line": "int:1:2000!", "n": "int:1:6!", "reading": READ},
        "dactyls": {"text": T_, "line": "int:1:2000!", "reading": READ},
        "caesura": {"text": T_, "line": "int:1:2000!", "type": "enum:penthemimeral|trithemimeral|hephthemimeral|trochaic|bucolic|diaeresis!", "reading": READ},
        "metreFit": {"text": T_, "line": "int:1:2000!"},
        "rhyme": {"text": T_, "a": "int:1:2000!", "b": "int:1:2000!"},
        "scheme": {"text": T_, "scheme": "raw!", "from": LINE},
    },
    "series": {
        "rankFreq": {"text": T_, "top": "int:2:2000"}, "ranks": {"text": T_, "top": "int:2:2000"},
        "heapsV": {"text": T_}, "heapsN": {"text": T_},
        "ttrCurve": {"text": T_, "steps": "int:2:200"}, "mattrCurve": {"text": T_, "steps": "int:2:200", "window": "numx"},
        "mtldCurve": {"text": T_, "steps": "int:2:200", "threshold": "numx"}, "prefixN": {"text": T_, "steps": "int:2:200"},
        "wordLengths": {"text": T_, "max": "int:2:40"}, "lengthAxis": {"max": "int:2:40"},
        "dactylsByLine": {"text": T_}, "lineAxis": {"text": T_},
    },
    "scene": {
        "kwic": {"text": T_, "word": "raw!", "window": "int:1:12", "max": "int:1:40"},
        "scansion": {"text": T_, "line": "int:1:2000!", "reading": READ},
        "topWords": {"text": T_, "top": "int:2:30"},
        "deltaMap": {"mfw": "numx", "variant": "enum:burrows|cosine|quadratic"},
        "rhymes": {"text": T_, "from": LINE},
    },
}
RAW_F = ["word", "w1", "w2", "scheme"]
NUMX_ORDER = ["window", "threshold", "sample", "per", "rmin", "rmax", "xmin", "o11", "r1", "c1", "n", "mfw"]
SCAN_OFS = ["scansions", "foot", "dactyls", "caesura", "scansion", "dactylsByLine", "metreFit"]


def _raw_ok(v): return isinstance(v, str) and v.strip() != "" and len(v) <= RAW_MAX


def _js_len(s): return len(s.encode("utf-16-le")) // 2   # JS string length (UTF-16 code units)


def check_spec(spec):
    P, E, W = L.problems()
    m0 = spec.get("model") if L.is_obj(spec) else None
    m = m0
    if L.is_obj(m0):
        m = dict(m0)
        if isinstance(m0.get("texts"), list): m["texts"] = [({k: v for k, v in t.items() if k != "body"} if L.is_obj(t) else t) for t in m0["texts"]]
        if isinstance(m0.get("lexicon"), list): m["lexicon"] = [({k: v for k, v in x.items() if k != "w"} if L.is_obj(x) else x) for x in m0["lexicon"]]
    L.walk(m, TABLE, "model", E, W)
    M = m0 if L.is_obj(m0) else {}
    ids, total = [], 0
    for i, t in enumerate(M.get("texts") if isinstance(M.get("texts"), list) else []):
        if not L.is_obj(t): continue
        if isinstance(t.get("id"), str):
            if t["id"] in ids: E("dup", f"model.texts[{i}].id", f"the id {t['id']} is used twice")
            ids.append(t["id"])
        if not isinstance(t.get("body"), str): E("value", f"model.texts[{i}].body", "missing (the text itself, a string)")
        else:
            n = _js_len(t["body"]); total += n
            if n > LIM["body"]: E("size", f"model.texts[{i}].body", f"more than {LIM['body']} characters")
    if total > LIM["body"]: E("size", "model.texts", f"more than {LIM['body']} characters in all")
    for i, x in enumerate(M.get("lexicon") if isinstance(M.get("lexicon"), list) else []):
        if not L.is_obj(x): continue
        if not _raw_ok(x.get("w")) or _js_len(x["w"]) > RAW_MAX: E("value", f"model.lexicon[{i}].w", f"needs a word (1-{RAW_MAX} characters)")
        if isinstance(x.get("p"), str) and not re.fullmatch(r"[012]{1,12}", x["p"]): E("value", f"model.lexicon[{i}].p", "needs a stress pattern of 0, 1, 2 (one digit per syllable)")
    metre = M.get("metre") if L.is_obj(M.get("metre")) else None

    def out(o, at, E2, W2):
        T = OUT[o["kind"]].get(o["of"])
        if not T: E2("output", at + ".of", f"{o['kind']} outputs of {ID} are: {', '.join(OUT[o['kind']])}"); return
        T2 = {"id": "expr", "kind": "expr", "of": "expr"}
        for k, v in T.items():
            if not v.startswith("raw"): T2[k] = v
        o2 = {k: v for k, v in o.items() if not (k in RAW_F and k in T)}
        L.walk(o2, T2, at, E2, W2)
        for k in RAW_F:
            if k in T:
                if k not in o:
                    if T[k] == "raw!": E2("value", f"{at}.{k}", "missing")
                elif not (_raw_ok(o[k]) and _js_len(o[k]) <= RAW_MAX): E2("value", f"{at}.{k}", f"needs a short text (1-{RAW_MAX} characters)")
        for k in ("text", "ref", "a", "b"):
            if T.get(k, "").startswith("ref") and isinstance(o.get(k), str) and L._full(L.ID_RE, o[k]) and o[k] not in ids: E2("ref", f"{at}.{k}", "not a text of the model")
        if o["of"] == "assoc" and not ("w1" in o and "w2" in o) and not all(k in o for k in ("o11", "r1", "c1", "n")):
            E2("value", at, "needs w1 and w2, or the counts o11, r1, c1 and n")
        if o["of"] in SCAN_OFS and metre is None: E2("ref", at + ".of", "needs model.metre")
        if o["of"] == "metreFit" and metre is not None and metre.get("pattern") not in EN_METRES:
            E2("ref", at + ".of", "metreFit is for the English metres (iambic5, iambic4, trochaic4); use scansions")
        if o["of"] in ("foot", "dactyls", "caesura", "scansions", "scansion", "dactylsByLine") and metre is not None and metre.get("pattern") in EN_METRES:
            E2("ref", at + ".of", "the English metres give metreFit and syllables")
        if o["of"] in ("delta", "deltaMap") and len(ids) < 3: E2("value", at + ".of", "Delta needs at least 3 texts")
        if o["of"] == "scheme" and _raw_ok(o.get("scheme")) and not re.fullmatch(r"[A-Za-z ]+", o["scheme"]): E2("value", at + ".scheme", "needs letters such as ABAB CDCD EFEF GG")

    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P


def exprs(spec):
    out = []
    for i, o in enumerate(spec.get("outputs") if L.is_obj(spec) and isinstance(spec.get("outputs"), list) else []):
        if not L.is_obj(o) or o.get("kind") not in OUT or o.get("of") not in OUT[o["kind"]]: continue
        T = OUT[o["kind"]][o["of"]]
        for k in NUMX_ORDER:
            if T.get(k, "").startswith("numx") and isinstance(o.get(k), str): out.append([o[k], f"outputs[{i}].{k}", []])
    return out


def keys(spec):
    out, m = [], (spec.get("model") if L.is_obj(spec) and L.is_obj(spec.get("model")) else {})
    for i, t in enumerate(m.get("texts") if isinstance(m.get("texts"), list) else []):
        if L.is_obj(t) and isinstance(t.get("label"), str): out.append([t["label"], f"model.texts[{i}].label"])
    return out
