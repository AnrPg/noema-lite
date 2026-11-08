"""rhetoric@1 in Python (docs/library/rhetoric.md): the twin of the checks of src/engines/rhetoric/rhetoric.js — check_spec(spec),
exprs(spec), keys(spec) give the same problems (code, path, msg, level) and the same lists as the JS module; tests/enginelib.js and
tests/lib_rhetoric.js compare both on tests/fixtures/enginelib/rhetoric.json. It does not compute."""
import re
import enginelib as L

ID = "rhetoric@1"
RAW_MAX = 64
LIM = {"speeches": 40, "text": 20000, "textAll": 40000, "timing": 8000, "pois": 30, "teams": 8, "ballots": 60, "nodes": 120, "edges": 400, "forms": 20, "fillers": 50}
LANGS = ["en", "el", "de", "fr", "ru", "es", "it", "other"]
SIDES = ["gov", "opp", "prop", "aff", "neg", "for", "against", "none"]
FORMATS = ["bp", "wsdc", "ld", "policy", "popper", "oxford", "custom"]
NODE_KINDS = ["claim", "premise", "data", "warrant", "backing", "qualifier", "rebuttal", "objection", "person"]
EDGE_KINDS = ["support", "attack", "undercut", "except"]
STOCK = ["harms", "inherency", "solvency", "topicality"]
APPEALS = ["ethos", "pathos", "logos"]
TOPOI = ["definition", "division", "comparison", "cause", "contraries", "circumstance", "testimony", "precedent"]
FORMAT_ROLES = {
    "bp": ["PM", "LO", "DPM", "DLO", "MG", "MO", "GW", "OW"],
    "wsdc": ["P1", "O1", "P2", "O2", "P3", "O3", "OR", "PR"],
    "ld": ["AC", "CXN", "NC", "CXA", "AR1", "NR", "AR2"],
    "policy": ["AC1", "CX1", "NC1", "CX2", "AC2", "CX3", "NC2", "CX4", "NR1", "AR1", "NR2", "AR2"],
    "popper": ["A1", "CX1", "N1", "CX2", "A2", "CX3", "N2", "CX4", "A3", "N3"],
    "oxford": ["OF1", "OA1", "OF2", "OA2", "CF", "CA"],
}
SCHEME_CQ = {"expert": 6, "position": 3, "popular": 2, "analogy": 3, "cause": 3, "correlation": 3, "consequences": 3, "practical": 5, "sign": 2,
             "example": 4, "classification": 2, "commitment": 2, "adHominem": 3, "circumstantial": 3, "slope": 3, "ignorance": 2, "precedent": 2}
SCHEME_IDS = list(SCHEME_CQ)
ORDERS = {
    "monroe": ["attention", "need", "satisfaction", "visualization", "action"],
    "oration": ["exordium", "narratio", "partitio", "confirmatio", "refutatio", "peroratio"],
    "canons": ["inventio", "dispositio", "elocutio", "memoria", "actio"],
    "stasis": ["conjecture", "definition", "quality", "translation"],
}
PARTS_ALL = []
for _v in ORDERS.values():
    for _p in _v:
        if _p not in PARTS_ALL: PARTS_ALL.append(_p)
FIGURES = ["anaphora", "epistrophe", "symploce", "anadiplosis", "climax", "epanalepsis", "epizeuxis", "antimetabole", "polyptoton",
           "alliteration", "tricolon", "isocolon", "asyndeton", "polysyndeton", "question", "antithesis"]
FORMULAS = ["flesch", "fk", "fog", "amstad", "wstf", "kandel", "oborneva", "lix", "rix"]
SEMS = "enum:grounded|preferred|stable"
SOUND_T, TROPE_T, SUPPORT_T = "enum:assonance|consonance|rhyme|paronomasia", "enum:simile|metaphor|irony", "enum:general|deductive|necessary"
LIT_RE = re.compile(r"\s*(?:[¬~!-]\s*)*[A-Za-z_][A-Za-z0-9_]{0,31}\s*")   # an ASPIC+ literal (the same as the JS LIT_RE)


def _L(t, mx, mn=None, req=False):
    d = {"$req": True} if req else {}
    d.update({"$list": t, "max": mx})
    if mn: d["min"] = mn
    return d
def _O(t): return {"$obj": t}
def _e(xs): return "enum:" + "|".join(xs)

SPEECH = {"id": "id!", "team": "ref", "role": "id", "speaker": "id", "side": _e(SIDES), "lang": _e(LANGS), "dur": "numx", "label": "key",
          "pois": _L(_O({"at": "numx!", "by": "ref", "accepted": "bool"}), LIM["pois"])}
TEAM = {"id": "id!", "side": _e(SIDES) + "!", "label": "key"}
BALLOT = {"id": "id!", "round": "int:1:20", "judge": "id", "chair": "bool", "winner": "ref",
          "ranks": _L(_O({"team": "ref!", "rank": "numx!"}), 8), "scores": _L(_O({"speech": "ref!", "pts": "numx!"}), LIM["speeches"])}
VOTE = {"for": "numx!", "against": "numx!", "undecided": "numx"}
DEBATE = {"format": _e(FORMATS) + "!", "grace": "nonneg", "panel": "enum:chair|borda|majority", "teams": _L(_O(TEAM), LIM["teams"]),
          "slots": _L(_O({"role": "id!", "side": _e(SIDES) + "!", "min": "pos!", "poi": "bool", "protect": "nonneg", "reply": "bool", "cx": "bool"}), LIM["speeches"]),
          "ballots": _L(_O(BALLOT), LIM["ballots"]), "pre": _O(VOTE), "post": _O(VOTE), "score": _L("fin", 2, 2)}
NODE = {"id": "id!", "kind": _e(NODE_KINDS), "side": _e(SIDES), "speech": "ref", "scheme": _e(SCHEME_IDS),
        "cq": _L("int:-1:1", 8), "impact": "numx", "prob": "numx", "time": "numx", "stock": _e(STOCK), "misrepresents": "ref", "offTopic": "bool",
        "options": "int:1:20", "alternatives": "int:1:20", "steps": _L("numx", 20), "appeal": _e(APPEALS), "topos": _e(TOPOI), "label": "key"}
MAP = {"nodes": _L(_O(NODE), LIM["nodes"], 1, True), "edges": _L(_O({"from": "ref!", "to": "ref!", "kind": _e(EDGE_KINDS)}), LIM["edges"])}
FORM = {"id": "id!", "premises": _L("expr", 8), "conclusion": "expr", "figure": "int:1:4", "existential": "bool"}
TABLE = {
    "lang": _e(LANGS),
    "speeches": _L(_O(SPEECH), LIM["speeches"]),
    "debate": _O(DEBATE),
    "map": _O(MAP),
    "forms": _L(_O(FORM), LIM["forms"]),
    "outline": _O({"scheme": "enum:monroe|oration|canons|stasis!", "parts": _L(_O({"id": "id!", "part": _e(PARTS_ALL) + "!", "pos": "numx!", "label": "key"}), 12, 2, True)}),
    "stasis": _O({"conjecture": "numx", "definition": "numx", "quality": "numx", "translation": "numx"}),
    "elm": _O({"motivation": "numx!", "ability": "numx!", "quality": "numx!", "cue": "numx!"}),
    "inoculation": _O({"r0": "numx", "tau": "numx", "attack": "numx", "boosters": _L("numx", 10), "horizon": "numx"}),
    "audience": _O({"grade": "numx", "formula": _e(FORMULAS), "wpmLo": "numx", "wpmHi": "numx", "tol": "numx"}),
    "delivery": _O({"pause": "numx", "window": "numx"}),
    "synizesis": "bool",
    "theory": _O({"kb": _L(_O({"f": "expr!", "kind": "enum:axiom|ordinary", "rank": "int:-1000:1000"}), 64),
                  "rules": _L(_O({"id": "id!", "body": _L("expr", 8), "head": "expr!", "kind": "enum:strict|defeasible", "rank": "int:-1000:1000"}), 64),
                  "contraries": _L(_O({"u": "expr!", "v": "expr!"}), 64), "link": "enum:last|weakest", "ordering": "enum:elitist|democratic", "transpose": "bool"}),
}
SP, TM, ND, RD = "ref", "ref!", "ref!", "int:1:20"
_SIDE_E = _e(SIDES)
OUT = {
    "scalar": {
        "words": {"speech": SP}, "sentences": {"speech": SP}, "clauses": {"speech": SP}, "syllables": {"speech": SP}, "duration": {"speech": SP},
        "wpm": {"speech": SP}, "articulation": {"speech": SP}, "pauses": {"speech": SP}, "pauseRate": {"speech": SP}, "meanPause": {"speech": SP}, "longestPause": {"speech": SP},
        "fillers": {"speech": SP}, "fillerRate": {"speech": SP}, "meanSentence": {"speech": SP}, "sdSentence": {"speech": SP}, "cvSentence": {"speech": SP}, "npvi": {"speech": SP},
        "questions": {"speech": SP}, "readability": {"speech": SP, "formula": _e(FORMULAS) + "!"},
        "figure": {"speech": SP, "type": _e(FIGURES) + "!"}, "figureAt": {"speech": SP, "type": _e(FIGURES) + "!", "sentence": "numx!"},
        "limit": {"speech": "ref!"}, "overtime": {"speech": "ref!"}, "poiOffered": {"speech": SP}, "poiAccepted": {"speech": SP}, "poiProtected": {"speech": SP}, "violations": {"speech": SP},
        "rank": {"team": TM, "round": RD, "ballot": "ref"}, "points": {"team": TM, "round": RD}, "speaks": {"team": "ref", "speech": "ref", "round": RD, "ballot": "ref"},
        "winner": {"round": RD, "ballot": "ref"}, "winnerSide": {"round": RD, "ballot": "ref"}, "consistent": {"ballot": "ref"}, "lpw": {"ballot": "ref!"},
        "ballotsFor": {"team": TM, "round": RD}, "margin": {"round": RD}, "tab": {"team": TM}, "swing": {"side": "enum:for|against!"},
        "label": {"node": ND, "semantics": SEMS, "ext": "int:1:64"}, "accepted": {"node": ND, "semantics": SEMS, "mode": "enum:credulous|sceptical"}, "extensions": {"semantics": SEMS},
        "inCount": {"semantics": SEMS, "side": _SIDE_E}, "netBenefit": {"tau": "numx"}, "weighedWinner": {"tau": "numx"},
        "dropped": {"side": _SIDE_E}, "clash": {}, "toulmin": {"node": ND}, "stockMet": {}, "primaFacie": {},
        "cqOpen": {"node": ND}, "cqFailed": {"node": ND}, "schemeCQs": {"scheme": _e(SCHEME_IDS) + "!"}, "fallacy": {"node": "ref", "form": "ref"}, "fallacies": {}, "slope": {"node": ND},
        "valid": {"form": "ref!"}, "counter": {"form": "ref!", "atom": "name!"},
        "orderOk": {}, "kendall": {}, "misplaced": {}, "stasis": {},
        "elaboration": {}, "attitude": {}, "central": {}, "peripheral": {}, "route": {},
        "resistance": {"at": "numx!"}, "attitudeAfter": {"at": "numx!"},
        "gradeGap": {"speech": SP}, "rateGap": {"speech": SP}, "fit": {"speech": SP},
        "sound": {"speech": SP, "type": SOUND_T + "!"}, "soundAt": {"speech": SP, "type": SOUND_T + "!", "sentence": "numx!"},
        "trope": {"speech": SP, "type": TROPE_T + "!"}, "tropeAt": {"speech": SP, "type": TROPE_T + "!", "sentence": "numx!"},
        "bipolarLabel": {"node": ND, "support": SUPPORT_T, "semantics": SEMS, "ext": "int:1:64"}, "bipolarAccepted": {"node": ND, "support": SUPPORT_T, "semantics": SEMS, "mode": "enum:credulous|sceptical"},
        "complexAttacks": {"support": SUPPORT_T}, "aspicArgs": {}, "aspicDefeats": {}, "justified": {"concl": "expr!", "semantics": SEMS, "mode": "enum:credulous|sceptical"}, "postulates": {"semantics": SEMS},
    },
    "series": {
        "sentenceLengths": {"speech": SP}, "sentenceAxis": {"speech": SP}, "figuresBySentence": {"speech": SP, "type": _e(FIGURES) + "!"},
        "rateCurve": {"speech": SP}, "timeAxis": {"speech": SP}, "pauseLengths": {"speech": SP},
        "durations": {}, "limits": {}, "speechAxis": {},
        "elmAxis": {}, "elmCentral": {}, "elmPeripheral": {}, "elmTotal": {}, "inocT": {}, "inocR": {},
        "soundsBySentence": {"speech": SP, "type": SOUND_T + "!"}, "tropesBySentence": {"speech": SP, "type": TROPE_T + "!"},
    },
    "scene": {
        "toulmin": {"node": ND}, "map": {"semantics": SEMS}, "flow": {}, "figures": {"speech": SP, "type": _e(FIGURES)}, "timing": {"speech": SP},
        "sounds": {"speech": SP, "type": SOUND_T}, "tropes": {"speech": SP, "type": TROPE_T}, "aspic": {"semantics": SEMS},
    },
}
NUMX_ORDER = ["sentence", "tau", "at"]
NEEDS = {
    "speeches": ["words", "sentences", "clauses", "syllables", "duration", "wpm", "articulation", "pauses", "pauseRate", "meanPause", "longestPause", "fillers", "fillerRate",
                 "meanSentence", "sdSentence", "cvSentence", "npvi", "questions", "readability", "figure", "figureAt", "sentenceLengths", "sentenceAxis", "figuresBySentence",
                 "rateCurve", "timeAxis", "pauseLengths", "figures", "timing", "gradeGap", "rateGap", "fit", "sound", "soundAt", "trope", "tropeAt", "soundsBySentence", "tropesBySentence",
                 "sounds", "tropes"],
    "debate": ["limit", "overtime", "poiOffered", "poiAccepted", "poiProtected", "violations", "rank", "points", "speaks", "winner", "winnerSide", "consistent", "lpw",
               "ballotsFor", "margin", "tab", "swing", "durations", "limits", "speechAxis"],
    "map": ["label", "accepted", "extensions", "inCount", "netBenefit", "weighedWinner", "dropped", "clash", "toulmin", "stockMet", "primaFacie", "cqOpen", "cqFailed", "slope", "map", "flow",
            "bipolarLabel", "bipolarAccepted", "complexAttacks"],
    "forms": ["valid", "counter"],
    "outline": ["orderOk", "kendall", "misplaced"],
    "stasis": ["stasis"],
    "elm": ["elaboration", "attitude", "central", "peripheral", "route", "elmAxis", "elmCentral", "elmPeripheral", "elmTotal"],
    "inoculation": ["resistance", "attitudeAfter", "inocT", "inocR"],
    "audience": ["gradeGap", "rateGap", "fit"],
    "theory": ["aspicArgs", "aspicDefeats", "justified", "postulates", "aspic"],
}


def _js_len(s): return len(s.encode("utf-16-le")) // 2   # JS string length (UTF-16 code units)
def _raw_ok(v): return isinstance(v, str) and v.strip() != "" and _js_len(v) <= RAW_MAX
def _arr(v): return v if isinstance(v, list) else []
def _ids(l): return [x["id"] for x in _arr(l) if L.is_obj(x) and isinstance(x.get("id"), str)]
def _idlike(v): return isinstance(v, str) and L._full(L.ID_RE, v)
def _ref_ok(v, ids): return not _idlike(v) or v in ids


def check_spec(spec):
    P, E, W = L.problems()
    m0 = spec.get("model") if L.is_obj(spec) else None
    m = m0
    if L.is_obj(m0):
        m = dict(m0)
        if isinstance(m0.get("speeches"), list): m["speeches"] = [({k: v for k, v in s.items() if k not in ("text", "timing")} if L.is_obj(s) else s) for s in m0["speeches"]]
        if L.is_obj(m0.get("map")) and isinstance(m0["map"].get("nodes"), list):
            m["map"] = dict(m0["map"]); m["map"]["nodes"] = [({k: v for k, v in x.items() if k != "s"} if L.is_obj(x) else x) for x in m0["map"]["nodes"]]
        if isinstance(m0.get("forms"), list): m["forms"] = [({k: v for k, v in x.items() if k != "mood"} if L.is_obj(x) else x) for x in m0["forms"]]
        if L.is_obj(m0.get("delivery")): m["delivery"] = {k: v for k, v in m0["delivery"].items() if k != "fillers"}
    L.walk(m, TABLE, "model", E, W)
    M = m0 if L.is_obj(m0) else {}

    def dups(lst, path):
        seen = []
        for i, x in enumerate(_arr(lst)):
            if L.is_obj(x) and isinstance(x.get("id"), str):
                if x["id"] in seen: E("dup", f"{path}[{i}].id", f"the id {x['id']} is used twice")
                seen.append(x["id"])
    D = M.get("debate") if L.is_obj(M.get("debate")) else None
    MP = M.get("map") if L.is_obj(M.get("map")) else None
    dups(M.get("speeches"), "model.speeches")
    if D: dups(D.get("teams"), "model.debate.teams"); dups(D.get("ballots"), "model.debate.ballots")
    if MP: dups(MP.get("nodes"), "model.map.nodes")
    dups(M.get("forms"), "model.forms")
    if L.is_obj(M.get("outline")): dups(M["outline"].get("parts"), "model.outline.parts")
    s_ids, t_ids = _ids(M.get("speeches")), (_ids(D.get("teams")) if D else [])
    n_ids, f_ids, b_ids = (_ids(MP.get("nodes")) if MP else []), _ids(M.get("forms")), (_ids(D.get("ballots")) if D else [])
    total = 0
    for i, s in enumerate(_arr(M.get("speeches"))):
        if not L.is_obj(s): continue
        at = f"model.speeches[{i}]"
        if "text" in s:
            if not isinstance(s["text"], str): E("value", at + ".text", "needs a text (a string)")
            else:
                n = _js_len(s["text"]); total += n
                if n > LIM["text"]: E("size", at + ".text", f"more than {LIM['text']} characters")
        if "timing" in s:
            tm = s["timing"]
            if not isinstance(tm, list): E("format", at + ".timing", "not an array")
            elif len(tm) > LIM["timing"]: E("size", at + ".timing", f"more than {LIM['timing']} items")
            else:
                for k, p in enumerate(tm):
                    if not (isinstance(p, list) and len(p) == 2 and L.is_num(p[0]) and L.is_num(p[1]) and p[0] >= 0 and p[1] >= p[0]):
                        E("value", f"{at}.timing[{k}]", "needs [start, end] in seconds, 0 <= start <= end"); break
            if not isinstance(s.get("text"), str): E("value", at + ".timing", "needs the text the timings belong to")
        if not _ref_ok(s.get("team"), t_ids): E("ref", at + ".team", "not a team of model.debate")
        for k, p in enumerate(_arr(s.get("pois"))):
            if L.is_obj(p) and not _ref_ok(p.get("by"), t_ids): E("ref", f"{at}.pois[{k}].by", "not a team of model.debate")
        if D and _idlike(s.get("role")):
            fmt = D.get("format")
            if fmt == "custom": roles = [x["role"] for x in _arr(D.get("slots")) if L.is_obj(x) and isinstance(x.get("role"), str)]
            elif isinstance(fmt, str) and fmt in FORMAT_ROLES: roles = FORMAT_ROLES[fmt]
            else: roles = None
            if roles is not None and s["role"] not in roles: E("ref", at + ".role", "not a speech of the format: " + ", ".join(roles))
    if total > LIM["textAll"]: E("size", "model.speeches", f"more than {LIM['textAll']} characters of text in all")
    if D:
        if D.get("format") == "custom" and not isinstance(D.get("slots"), list): E("value", "model.debate.slots", "missing (a custom format lists its speeches)")
        for i, b in enumerate(_arr(D.get("ballots"))):
            if not L.is_obj(b): continue
            at = f"model.debate.ballots[{i}]"
            if not _ref_ok(b.get("winner"), t_ids): E("ref", at + ".winner", "not a team of model.debate")
            for k, r in enumerate(_arr(b.get("ranks"))):
                if L.is_obj(r) and not _ref_ok(r.get("team"), t_ids): E("ref", f"{at}.ranks[{k}].team", "not a team of model.debate")
            for k, r in enumerate(_arr(b.get("scores"))):
                if L.is_obj(r) and not _ref_ok(r.get("speech"), s_ids): E("ref", f"{at}.scores[{k}].speech", "not a speech of the model")
        if D.get("format") == "oxford" and not (L.is_obj(D.get("pre")) and L.is_obj(D.get("post"))) and ("pre" in D or "post" in D):
            E("value", "model.debate", "an Oxford vote needs both pre and post")
    if MP:
        for i, x in enumerate(_arr(MP.get("nodes"))):
            if not L.is_obj(x): continue
            at = f"model.map.nodes[{i}]"
            if "s" in x and not _raw_ok(x["s"]): E("value", at + ".s", f"needs a short text (1-{RAW_MAX} characters)")
            if not _ref_ok(x.get("speech"), s_ids): E("ref", at + ".speech", "not a speech of the model")
            if not _ref_ok(x.get("misrepresents"), n_ids): E("ref", at + ".misrepresents", "not a node of the map")
            sc = x.get("scheme")
            if isinstance(x.get("cq"), list) and isinstance(sc, str) and sc in SCHEME_CQ and len(x["cq"]) > SCHEME_CQ[sc]:
                E("size", at + ".cq", f"the scheme {sc} has {SCHEME_CQ[sc]} critical questions")
        for i, e in enumerate(_arr(MP.get("edges"))):
            if not L.is_obj(e): continue
            for k in ("from", "to"):
                if not _ref_ok(e.get(k), n_ids): E("ref", f"model.map.edges[{i}].{k}", "not a node of the map")
    for i, f in enumerate(_arr(M.get("forms"))):
        if not L.is_obj(f): continue
        at = f"model.forms[{i}]"
        prop = "conclusion" in f or "premises" in f
        syl = "mood" in f or "figure" in f
        if prop == syl: E("value", at, "needs premises and a conclusion, or a mood and a figure")
        elif prop and not (isinstance(f.get("premises"), list) and len(f["premises"]) and "conclusion" in f): E("value", at, "needs premises (1-8) and a conclusion")
        elif syl and not (isinstance(f.get("mood"), str) and re.fullmatch(r"[AEIO]{3}", f["mood"]) and "figure" in f): E("value", at + ".mood", "needs a mood of three letters A, E, I, O and a figure 1-4")
    ol = M.get("outline")
    if L.is_obj(ol) and isinstance(ol.get("scheme"), str) and ol["scheme"] in ORDERS:
        for i, p in enumerate(_arr(ol.get("parts"))):
            if L.is_obj(p) and isinstance(p.get("part"), str) and p["part"] in PARTS_ALL and p["part"] not in ORDERS[ol["scheme"]]:
                E("ref", f"model.outline.parts[{i}].part", f"not a part of {ol['scheme']}: " + ", ".join(ORDERS[ol["scheme"]]))
    if L.is_obj(M.get("delivery")) and "fillers" in M["delivery"]:
        f = M["delivery"]["fillers"]
        if not isinstance(f, list): E("format", "model.delivery.fillers", "not an array")
        elif len(f) > LIM["fillers"]: E("size", "model.delivery.fillers", f"more than {LIM['fillers']} items")
        else:
            for i, x in enumerate(f):
                if not (isinstance(x, str) and x.strip() != "" and _js_len(x) <= 32): E("value", f"model.delivery.fillers[{i}]", "needs a filler word or phrase (1-32 characters)")
    th = M.get("theory")
    if L.is_obj(th):
        def lit(v, p):
            if isinstance(v, str) and not LIT_RE.fullmatch(v): E("literal", p, "needs a literal (an atom or ¬atom)")
        for i, k in enumerate(_arr(th.get("kb"))):
            if L.is_obj(k): lit(k.get("f"), f"model.theory.kb[{i}].f")
        for i, r in enumerate(_arr(th.get("rules"))):
            if not L.is_obj(r): continue
            for j, b in enumerate(_arr(r.get("body"))): lit(b, f"model.theory.rules[{i}].body[{j}]")
            lit(r.get("head"), f"model.theory.rules[{i}].head")
        for i, c in enumerate(_arr(th.get("contraries"))):
            if L.is_obj(c): lit(c.get("u"), f"model.theory.contraries[{i}].u"); lit(c.get("v"), f"model.theory.contraries[{i}].v")
        dups(th.get("rules"), "model.theory.rules")

    def out(o, at, E2, W2):
        T = OUT[o["kind"]].get(o["of"])
        if T is None: E2("output", at + ".of", f"{o['kind']} outputs of {ID} are: {', '.join(OUT[o['kind']])}"); return
        T2 = {"id": "expr", "kind": "expr", "of": "expr"}; T2.update(T)
        L.walk(o, T2, at, E2, W2)
        for sec, ofs in NEEDS.items():
            if o["of"] in ofs and not L.is_obj(M.get(sec)) and not (sec == "speeches" and isinstance(M.get("speeches"), list) and len(M["speeches"])) \
                    and not (sec == "forms" and isinstance(M.get("forms"), list) and len(M["forms"])):
                E2("ref", at + ".of", f"needs model.{sec}")
        if o["of"] == "swing" and not (D and D.get("format") == "oxford"): E2("ref", at + ".of", "the vote swing is for the oxford format")
        if o["of"] == "justified" and isinstance(o.get("concl"), str) and not LIT_RE.fullmatch(o["concl"]): E2("literal", at + ".concl", "needs a literal (an atom or ¬atom)")
        if o["of"] == "fallacy" and "node" not in o and "form" not in o: E2("value", at, "needs node or form")
        if o["of"] == "speaks" and "team" not in o and "speech" not in o: E2("value", at, "needs team or speech")
        if o["of"] in ("fallacies", "fallacy") and not MP and not (isinstance(M.get("forms"), list) and len(M["forms"])): E2("ref", at + ".of", "needs model.map or model.forms")
        for k, ids, msg in (("speech", s_ids, "not a speech of the model"), ("team", t_ids, "not a team of model.debate"), ("node", n_ids, "not a node of the map"),
                            ("form", f_ids, "not a form of the model"), ("ballot", b_ids, "not a ballot of model.debate")):
            if k in T and _idlike(o.get(k)) and o[k] not in ids: E2("ref", f"{at}.{k}", msg)

    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P


def _collect(o, T, path, out, kind):
    if not L.is_obj(o): return
    for k, kd in T.items():
        if k not in o: continue
        v, p = o[k], path + "." + k
        if isinstance(kd, str):
            if kd.rstrip("!") == kind and isinstance(v, str): out.append([v, p, []] if kind == "numx" else [v, p])
        elif "$obj" in kd: _collect(v, kd["$obj"], p, out, kind)
        elif "$list" in kd and isinstance(v, list):
            for i, x in enumerate(v):
                if isinstance(kd["$list"], str):
                    if kd["$list"].rstrip("!") == kind and isinstance(x, str): out.append([x, f"{p}[{i}]", []] if kind == "numx" else [x, f"{p}[{i}]"])
                elif "$obj" in kd["$list"]: _collect(x, kd["$list"]["$obj"], f"{p}[{i}]", out, kind)


def exprs(spec):
    out = []
    if L.is_obj(spec) and L.is_obj(spec.get("model")): _collect(spec["model"], TABLE, "model", out, "numx")
    for i, o in enumerate(spec.get("outputs") if L.is_obj(spec) and isinstance(spec.get("outputs"), list) else []):
        if not L.is_obj(o) or not isinstance(o.get("kind"), str) or o["kind"] not in OUT or not isinstance(o.get("of"), str) or o["of"] not in OUT[o["kind"]]: continue
        T = OUT[o["kind"]][o["of"]]
        for k in NUMX_ORDER:
            if T.get(k, "").startswith("numx") and isinstance(o.get(k), str): out.append([o[k], f"outputs[{i}].{k}", []])
    return out


def keys(spec):
    out = []
    if L.is_obj(spec) and L.is_obj(spec.get("model")): _collect(spec["model"], TABLE, "model", out, "key")
    return out
