#!/usr/bin/env python3
"""Validate a chapter JSON file (tools/CONTENT_SPEC.md + docs/VISUAL.md).
Usage: validate.py chNN.json [--media media_meta.json] [--min-visual N] [--quality error|warn] [--balance N | --balance-warn N] [--features code,math] [--source chNN.json]
       validate.py subject.json --subject [--translations el,fr]
  --media         {id: {w, h, regions}} of the subject's pictures (build.py passes it) → checks references & coordinates
  --min-visual    required visual exercises per chapter (from subject.json authoring.minVisualPerChapter)
  --balance       every exercise type, difficulty and focus tag at least N times in the chapter (tools/pack_rules.json;
                  N from subject.json authoring.minPerKind) — errors; --balance-warn N: the same as warnings (older packs)
  --quality       the quality rules of tools/pack_rules.json "quality" (tools/pack_quality.py; packs with authoring.rules >= 2):
                  the chapter's knowledge map (chapter.map), fits, the mix of difficulty and thinking, learnables with >= 2
                  versions, self-contained texts, explanations, the review (chapter.review). error: issues of level "error"
                  are errors (Claude/Gemini-made packs); warn: every issue is a warning (learner-made or imported packs)
  --features      the subject's features that are on (code, math): they make spotbug, write, calc, syntax required
  --source        the file is a TRANSLATION (translations/<locale>/chNN.json) of this chapter (as built: base + patches):
                  same ids, same structure, same answers — only the words differ (CONTENT_SPEC.md "Packs in several languages")
  --subject       check subject.json: the content language and the optional per-locale metadata (subject.i18n)
  --translations  (with --subject) the locales the subject has translations/<locale>/ folders for

The SHAPE of the file (its fields, their types and values) is its data contract — src/contracts/schemas,
noema.chapter.v1 / noema.subject.v1 — checked with the same compiled validators as the app (tools/contracts.py).
This file checks what a schema cannot say: ids that match the chapter and are unique, answers that are one of their
own options, regions inside their picture, the media and activities of the pack, the quantities and the quality."""
import json, os, re, sys
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import activities as A   # interactive activities: the registry, interactive blocks, sim exercises (docs/INTERACTIVE.md)
import contracts as C    # the data contracts (engine/contracts.js, run in node)

errors, warns = [], []
def E(m): errors.append(m)
def W(m): warns.append(m)

VTYPES = {"img_hotspot","img_sequence","img_reveal","img_drag","img_label","img_select","img_occlusion"}
TTYPES = {"flaw","case","predict","tree","inquiry","debate"}   # critical-thinking types (CONTENT_SPEC.md)
TYPES = {"mcq","tf","odd","order","match","bucket","cloze","spotbug","calc","scenario","free","write","sim"} | TTYPES | VTYPES
ARGS = sys.argv[1:]
MEDIA = json.load(open(ARGS[ARGS.index("--media")+1], encoding="utf-8")) if "--media" in ARGS else None
# {id: activity} of the pack's interactive activities (make_pack.py passes it) → checks interactive blocks and sim exercises (tools/activities.py)
ACTIVITIES = json.load(open(ARGS[ARGS.index("--activities")+1], encoding="utf-8")) if "--activities" in ARGS else None
MIN_VISUAL = int(ARGS[ARGS.index("--min-visual")+1]) if "--min-visual" in ARGS else 0
QUALITY = ARGS[ARGS.index("--quality")+1] if "--quality" in ARGS else None
BALANCE = int(ARGS[ARGS.index("--balance")+1]) if "--balance" in ARGS else 0
BALANCE_WARN = int(ARGS[ARGS.index("--balance-warn")+1]) if "--balance-warn" in ARGS else 0
FEATURES = {x for x in (ARGS[ARGS.index("--features")+1] if "--features" in ARGS else "").split(",") if x}
num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
idx = lambda v, n: isinstance(v, int) and not isinstance(v, bool) and 0 <= v < n

def region_points(r):
    """The corners / points of a region (its shape: noema.visual.v1#region), or None when its shape is not complete."""
    sh = r.get("shape")
    if sh == "rect" and all(num(r.get(k)) for k in "xywh"): return [(r["x"], r["y"]), (r["x"]+r["w"], r["y"]+r["h"])]
    if sh == "circle" and all(num(r.get(k)) for k in ("cx", "cy", "r")): return [(r["cx"]-r["r"], r["cy"]-r["r"]), (r["cx"]+r["r"], r["cy"]+r["r"])]
    if sh == "poly" and isinstance(r.get("points"), list) and all(isinstance(q, list) and len(q) == 2 and all(num(c) for c in q) for q in r["points"]): return [tuple(q) for q in r["points"]]
    return None

def check_regions(where, regions, IW=None, IH=None):
    """The regions of a picture beyond their shape: unique ids, inside the picture; returns {id: region}."""
    out = {}
    if not isinstance(regions, list): return out
    for r in regions:
        if not isinstance(r, dict) or not isinstance(r.get("id"), str): continue
        rid = r["id"]
        if rid in out: E(f"{where}: duplicate region id {rid}")
        out[rid] = r
        pts = region_points(r)
        if pts is None: continue
        if isinstance(r.get("anchor"), list) and len(r["anchor"]) == 2: pts.append(tuple(r["anchor"]))
        if IW and IH and any(x < -0.5 or y < -0.5 or x > IW+0.5 or y > IH+0.5 for x, y in pts): E(f"{where}/{rid}: region outside the {IW:g}x{IH:g} picture")
    return out

def check_visual(eid, e):
    t = e["type"]; mid = e.get("media")
    if not s(mid): return   # the contract says so
    m = (MEDIA or {}).get(mid)
    if MEDIA is not None and not m: E(f"{eid}: media '{mid}' not in media/media.json"); return
    IW, IH = (m or {}).get("w"), (m or {}).get("h")
    regions = e.get("regions", (m or {}).get("regions") if m else None)
    if t == "img_reveal" and e.get("grid"): regions = regions or []
    if regions is None:
        if MEDIA is None: return          # cannot check without the registry
        E(f"{eid}: no regions (neither in the exercise nor in media '{mid}')"); return
    R = check_regions(eid, regions, IW, IH)
    targets = e.get("targets") or list(R)
    for x in targets:
        if x not in R: E(f"{eid}: target '{x}' is not a region")
    if t in ("img_hotspot", "img_sequence"):
        a = e.get("answer")
        if not isinstance(a, list) or not a: E(f"{eid}: answer must be a list of region ids"); return
        for x in a:
            if x not in R: E(f"{eid}: answer '{x}' is not a region")
        if t == "img_sequence" and not (2 <= len(a) <= 9): E(f"{eid}: sequence needs 2-9 steps")
        if t == "img_hotspot" and e.get("any") and len(a) < 2: W(f"{eid}: any:true with one answer region is the same as a normal hotspot")
        if t == "img_sequence" and len(set(a)) != len(a): E(f"{eid}: sequence repeats a region")
        for k in (e.get("why") or {}):
            if k not in R: E(f"{eid}: why '{k}' is not a region")
    if t == "img_reveal":
        o = e.get("options", []); a = e.get("answer"); aa = a if isinstance(a, list) else [a]
        if len(o) < 2: E(f"{eid}: reveal needs options")
        if not all(isinstance(x, int) and 0 <= x < len(o) for x in aa): E(f"{eid}: bad answer index")
        if isinstance(a, list) and len(a) > 1 and not e.get("multi"): E(f"{eid}: multiple answers need multi:true")
        if not e.get("grid") and len(R) < 2: E(f"{eid}: reveal needs grid or >=2 tile regions")
        for x in e.get("start", []):
            if not e.get("grid") and x not in R: E(f"{eid}: start '{x}' is not a region")
    if t in ("img_drag", "img_label", "img_select", "img_occlusion"):
        labs = [R[x].get("label") for x in targets if x in R]
        if not all(s(l) for l in labs): E(f"{eid}: every target needs a label")
        elif len(set(l.strip().lower() for l in labs)) != len(labs) and t != "img_occlusion": W(f"{eid}: duplicate target labels")
        if t == "img_select":
            shared = set(labs) | set(e.get("distractors", []))
            if len(shared) < 2: E(f"{eid}: select needs >=2 choices")
            for x in targets:
                if x in R and "options" in R[x] and R[x].get("label") not in R[x]["options"]: E(f"{eid}/{x}: options must include the label")
        if "pass" in e and not (isinstance(e["pass"], (int, float)) and 0 <= e["pass"] <= 1): E(f"{eid}: pass must be 0-1")

def load_rules():
    """The shared quantity rules (tools/pack_rules.json, next to this script; engine/packcheck.js RULES is the same list)."""
    return json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pack_rules.json"), encoding="utf-8"))["rules"]

def check_balance(exs, n, features, report):
    """Every rule of pack_rules.json, per chapter: each required value (and each optional one the chapter uses) >= n times.
    report(message) is E or W. Messages start with the rule id, e.g. "[balance.type] img_reveal: 1 exercise(s), need >= 3"."""
    for r in load_rules():
        need = set(r["always"]) | {v for f in features for v in r["features"].get(f, [])}
        optional = {v for vs in r["features"].values() for v in vs}
        have = Counter(v for e in exs for v in (e.get(r["field"]) or [] if r["field"] == "tags" else [e.get(r["field"])]))
        for v in sorted(need | (optional & set(have)), key=str):
            if have[v] < n: report(f"[{r['id']}] {v}: {have[v]} exercise(s), need >= {n} per chapter ({r['what']}, tools/pack_rules.json)")

def s(x): return isinstance(x,str) and x.strip()!=""

# ---------------- subject packs in several languages (CONTENT_SPEC.md, docs/i18n.md §10) ----------------
LOCALE_RE = re.compile(r"^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$")   # BCP 47: el, pt-PT, zh-Hant
# the locales a learner can have as UI language (engine/i18n.js LOCALES) + the bare language a regional one falls back to
UI_LOCALES = {"en", "el", "ru", "fr", "ar-EG", "ar", "de", "hi", "zh-Hans", "zh-Hant", "ja", "it", "es-ES", "es", "sq", "pt-PT", "pt", "tr"}
I18N_TEXT = ("title", "appTitle", "description", "searchExamples")   # plain strings
I18N_OBJ = ("hero", "tutor")                                         # objects: a subset of the source's own keys

def check_locale(where, loc, lang, shaped=False):
    """shaped: the contract has checked the code already (subject.i18n); a translations/<locale>/ folder has none."""
    if not isinstance(loc, str) or not LOCALE_RE.match(loc):
        if not shaped: E(f"{where}: '{loc}' is not a locale code (BCP 47, e.g. el, fr, pt-PT, zh-Hant)")
        return False
    lang = lang if isinstance(lang, str) else "en"
    if loc == lang or (loc.split("-")[0] == lang.split("-")[0] and ("-" not in loc or "-" not in lang) and not loc.startswith("zh")): E(f"{where}: '{loc}' is the pack's own language ({lang}) — the source texts are already in it"); return False
    if loc not in UI_LOCALES: W(f"{where}: '{loc}' is not a UI language of noema-lite (nor the language of one) — no learner would see it")
    return True

def check_subject(path, translated):
    subj = json.load(open(path, encoding="utf-8"))
    for m in C.problems("noema.subject.v1", subj): E(m)
    lang = subj.get("language", "en")
    tr = subj.get("i18n") if isinstance(subj.get("i18n"), dict) else None
    for loc, m in (tr or {}).items():
        where = f"i18n.{loc}"
        if not check_locale(where, loc, lang, shaped=True) or not isinstance(m, dict): continue
        for k, v in m.items():
            if k in I18N_TEXT and s(v) and not s(subj.get(k)): E(f"{where}.{k}: the subject has no '{k}' to translate")
            elif k in I18N_OBJ and isinstance(v, dict):
                src = subj.get(k) if isinstance(subj.get(k), dict) else {}
                for kk, vv in v.items():
                    if kk not in src: E(f"{where}.{k}.{kk}: the subject's '{k}' has no '{kk}'")
                    elif s(src[kk]) and not s(vv): E(f"{where}.{k}.{kk}: must be a non-empty string")
        if "title" not in m: W(f"{where}: no title — the picker shows the source title")
    for loc in translated:
        if check_locale(f"translations/{loc}", loc, lang) and loc not in (tr or {}): W(f"translations/{loc}: add subject.i18n.{loc} (title, description) so the picker shows the translated name")
    print(f"== {path}: language {lang}, metadata in {', '.join(sorted(tr or {})) or '—'}, content in {', '.join(sorted(translated)) or '—'}")
    for m in errors: print("ERROR:", m)
    for m in warns: print("WARN:", m)
    print("OK" if not errors else f"{len(errors)} ERRORS")
    sys.exit(1 if errors else 0)

L_ = lambda v: v if isinstance(v, list) else []
D_ = lambda v: v if isinstance(v, dict) else {}

def exercise_refs(eid, e):
    """What an exercise's contract (noema.chapter.v1#exercise) cannot say: its answer is one of its own options, lines,
    buckets, nodes or regions, its lists line up, its texts agree; engine/packcheck.js exerciseRefs checks the same."""
    t = e.get("type")
    if t in ("mcq", "odd"):
        o, a = L_(e.get("options")), e.get("answer")
        if not all(idx(x, len(o)) for x in (a if isinstance(a, list) else [a])): E(f"{eid}: bad answer index")
        if isinstance(e.get("why"), list) and len(e["why"]) != len(o): E(f"{eid}: why length != options")
        if t == "odd" and len(o) != 4: W(f"{eid}: odd should have 4 options")
    elif t == "match":
        p = [x for x in L_(e.get("pairs")) if isinstance(x, list) and len(x) == 2]
        if len({x[1] for x in p if isinstance(x[1], str)}) != len(p) or len({x[0] for x in p if isinstance(x[0], str)}) != len(p): E(f"{eid}: match sides must be distinct")
    elif t == "bucket":
        b, it = L_(e.get("buckets")), L_(e.get("items"))
        if not all(idx(D_(x).get("bucket"), len(b)) for x in it): E(f"{eid}: bad bucket items")
        if len(it) < 4: W(f"{eid}: few bucket items")
    elif t == "cloze":
        if any(not x.split("|")[0].strip() for x in re.findall(r"\[\[(.+?)\]\]", e.get("text") if isinstance(e.get("text"), str) else "")): E(f"{eid}: empty blank")
    elif t == "spotbug":
        L = L_(e.get("lines"))
        if len(L) < 3: E(f"{eid}: spotbug needs >=3 lines")   # the authoring rule (the engine shows 2)
        if not all(idx(x, len(L)) for x in L_(e.get("bugs"))): E(f"{eid}: bad bug indexes")
    elif t == "scenario":
        if not s(e.get("q")): W(f"{eid}: scenario should have q (setup)")
    elif t == "write":
        sol = e.get("solution") if isinstance(e.get("solution"), str) else ""
        for k in L_(e.get("keywords")):
            if isinstance(k, str) and k.lower() not in sol.lower(): E(f"{eid}: keyword '{k}' not in solution")
    elif t in VTYPES: check_visual(eid, e)
    elif t in TTYPES: check_thinking(eid, e)

def check_thinking(eid, e):
    """flaw · case · predict · tree · inquiry · debate (CONTENT_SPEC.md, "Types") beyond their contract."""
    t = e.get("type")
    if t == "flaw":
        L, R = L_(e.get("lines")), L_(e.get("reasons"))
        if not all(idx(x, len(L)) for x in L_(e.get("flaws"))): E(f"{eid}: flaw needs lines (>=3) and flaws (line indexes)")
        if "reason" in e and not idx(e.get("reason"), len(R)): E(f"{eid}: flaw needs reasons (>=2) and reason (index)")
    elif t == "case":
        for i, p in enumerate(L_(e.get("parts"))):
            p = D_(p)
            if p.get("type") == "mcq":
                a = p.get("answer")
                if not all(idx(x, len(L_(p.get("options")))) for x in (a if isinstance(a, list) else [a])): E(f"{eid} part {i+1}: needs options and answer index")
    elif t == "predict":
        if isinstance(e.get("options"), list) and isinstance(e.get("answer"), int) and not idx(e["answer"], len(e["options"])): E(f"{eid}: predict needs options and answer index")
    elif t == "tree":
        N = D_(e.get("nodes"))
        if not N: return
        if e.get("start") not in N: E(f"{eid}: tree start must name a node")
        for k, n in N.items():
            for o in L_(D_(n).get("options")):
                if isinstance(o, dict) and o.get("to") is not None and o["to"] not in N: E(f"{eid} node {k}: to {o['to']!r} names no node")
        seen, at = set(), e.get("start")
        while isinstance(at, str) and at in N and at not in seen: seen.add(at); at = next((D_(o).get("to") for o in L_(D_(N[at]).get("options")) if D_(o).get("ok")), None)
        if at is not None: E(f"{eid}: the right path of the tree loops or leads nowhere")
    elif t == "inquiry":
        o, sc = L_(e.get("options")), L_(e.get("scores"))
        if len(sc) != len(o): E(f"{eid}: inquiry needs options (>=3) and scores 0-3, one per option")
        elif sc and all(num(x) for x in sc) and sc.count(max(sc)) != 1: E(f"{eid}: exactly one option has the highest score")
        if isinstance(e.get("why"), list) and len(e["why"]) != len(o): E(f"{eid}: inquiry needs why, one per option")
    elif t == "debate":
        for i, sd in enumerate(L_(e.get("sides"))):
            sd = D_(sd); c = L_(sd.get("counters"))
            if "best" in sd and not idx(sd.get("best"), len(c)): E(f"{eid} side {i+1}: position, counters (>=2) and best (index)")
            elif isinstance(sd.get("why"), list) and len(sd["why"]) != len(c): E(f"{eid} side {i+1}: why needs one text per counter")

def check_exercise(eid, e):
    """One exercise on its own: its contract, then exercise_refs (tests/thinking_types.js compares it with packcheck.js)."""
    for m in C.problems("noema.chapter.v1#exercise", e, eid): E(m)
    exercise_refs(eid, e)

def shape(e):
    """What a translation must keep of an exercise: everything that decides the answer (only the words may change)."""
    t = e.get("type"); out = {k: e.get(k) for k in ("type", "section", "media", "answer", "multi", "tolerance", "bugs", "grid", "targets", "any", "asCode", "start") if k in e}
    for k in ("options", "items", "pairs", "buckets", "lines", "steps", "keywords"):
        if isinstance(e.get(k), list): out["#" + k] = len(e[k])
    if t == "bucket": out["bucketOf"] = [x.get("bucket") for x in e.get("items", []) if isinstance(x, dict)]
    if t == "cloze": out["blanks"] = len(re.findall(r"\[\[(.+?)\]\]", e.get("text", "")))
    if t == "scenario": out["ok"] = [[bool(o.get("ok")) for o in st.get("options", [])] for st in e.get("steps", [])]
    # the thinking types (flaw, case, predict, tree, inquiry, debate): what decides their answer
    if t == "flaw": out.update(flaws=e.get("flaws"), reason=e.get("reason"), **{"#reasons": len(e.get("reasons") or [])})
    if t == "case": out["parts"] = [[p.get("type"), p.get("answer"), len(p.get("options") or []), p.get("tolerance")] for p in e.get("parts") or [] if isinstance(p, dict)]
    if t == "predict": out["outcome?"] = "outcome" in e
    if t == "tree": out["nodes"] = {k: [[bool(o.get("ok")), o.get("to")] for o in (n.get("options") or []) if isinstance(o, dict)] for k, n in (e.get("nodes") or {}).items() if isinstance(n, dict)}
    if t == "inquiry": out["scores"] = e.get("scores")
    if t == "sim": out.update(activity=e.get("activity"), task=e.get("task"), grade=e.get("grade"), **{"#hints": len(e.get("hints") or [])})
    if t == "debate": out["sides"] = [[s.get("best"), len(s.get("counters") or [])] for s in e.get("sides") or [] if isinstance(s, dict)]
    # own "regions" may be added to carry translated labels (the picture's are in one language); check_visual checks them
    return out

def check_same(tr, src):
    """A translation has the source chapter's ids and structure (CONTENT_SPEC.md "Packs in several languages")."""
    for k in ("id", "num"):
        if tr.get(k) != src.get(k): E(f"translation: {k} is {tr.get(k)!r}, the source chapter has {src.get(k)!r}")
    ss, ts = src.get("sections", []), tr.get("sections", [])
    if [x.get("id") for x in ts] != [x.get("id") for x in ss]: E(f"translation: sections {[x.get('id') for x in ts]} != source {[x.get('id') for x in ss]} (same ids, same order)")
    else:
        for a, b in zip(ss, ts):
            ta, tb = [x.get("t") for x in a.get("blocks", [])], [x.get("t") for x in b.get("blocks", [])]
            if ta != tb: E(f"translation {a['id']}: blocks {tb} != source {ta} (same blocks, same order)")
            else:
                for i, (x, y) in enumerate(zip(a["blocks"], b["blocks"])):
                    if x.get("t") == "figure" and x.get("media") != y.get("media"): E(f"translation {a['id']} block {i}: figure media '{y.get('media')}' != source '{x.get('media')}'")
                    if x.get("t") == "code" and (x.get("code") if "code" in x else x.get("text")) != (y.get("code") if "code" in y else y.get("text")): E(f"translation {a['id']} block {i}: code must stay exactly as the source's (translate the words around it, not the code)")
    for k, label in (("exercises", "exercise"), ("debug", "playbook"), ("flashcards", "flashcard")):
        A, B = {x.get("id"): x for x in src.get(k, [])}, {x.get("id"): x for x in tr.get(k, [])}
        miss, extra = [i for i in A if i not in B], [i for i in B if i not in A]
        if miss: E(f"translation: {label}(s) missing: {', '.join(map(str, miss))}")
        if extra: E(f"translation: {label}(s) not in the source: {', '.join(map(str, extra))}")
        if k == "exercises":
            for i in A:
                if i in B and shape(A[i]) != shape(B[i]):
                    d = sorted(x for x in set(shape(A[i])) | set(shape(B[i])) if shape(A[i]).get(x) != shape(B[i]).get(x))
                    E(f"translation {i}: differs from the source in {', '.join(d)} (only the words may change)")
        if k == "flashcards":
            for i in A:
                if i in B and A[i].get("section") != B[i].get("section"): E(f"translation {i}: section differs from the source")
    if len(tr.get("pitfalls", [])) != len(src.get("pitfalls", [])): E(f"translation: {len(tr.get('pitfalls', []))} pitfalls, the source has {len(src.get('pitfalls', []))}")
    if len(tr.get("objectives", [])) != len(src.get("objectives", [])): W(f"translation: {len(tr.get('objectives', []))} objectives, the source has {len(src.get('objectives', []))}")

def shape_problems(ch):
    """The chapter's contract (noema.chapter.v1: the authored chapter) and each exercise's (#exercise, #exerciseSource),
    in one node run. Exercise problems name the exercise ("ch01-e004: q: missing")."""
    L = ch.get("exercises") if isinstance(ch.get("exercises"), list) else []
    jobs = [("noema.chapter.v1", {**ch, "exercises": []} if isinstance(ch, dict) and "exercises" in ch else ch)]
    jobs += [(c, e) for e in L for c in ("noema.chapter.v1#exercise", "noema.chapter.v1#exerciseSource")]
    res, out = C.check_many(jobs), []
    out += [i["text"] for i in res[0]]
    for n, e in enumerate(L):
        eid = e.get("id") if isinstance(e, dict) and isinstance(e.get("id"), str) else f"exercises[{n}]"
        for i in res[1 + 2 * n] + res[2 + 2 * n]:
            m = f"{eid}: {i['text']}"
            if m not in out: out.append(m)
    return out

def main(path):
    try:
        ch = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print("ERROR: invalid JSON:", e); sys.exit(1)
    if not isinstance(ch, dict): print("ERROR: a chapter is a JSON object"); sys.exit(1)
    for m in shape_problems(ch): E(m)
    cid = ch.get("id") if isinstance(ch.get("id"), str) else ""
    secs = [x for x in L_(ch.get("sections")) if isinstance(x, dict)]
    sids = [x.get("id") for x in secs]
    if len(set(sids))!=len(sids): E("duplicate section ids")
    for sec in secs:
        sid = sec.get("id","?")
        if isinstance(sid, str) and re.fullmatch(r"ch\d\d-s\d\d", sid) and not sid.startswith(cid + "-"): E(f"bad section id {sid} (not of {cid})")
        bl = [b for b in L_(sec.get("blocks")) if isinstance(b, dict)]
        if len(bl) < 3: W(f"{sid}: only {len(bl)} blocks")
        for i,b in enumerate(bl):
            t = b.get("t")
            if t=="table":
                n=len(L_(b.get("head")))
                for r in L_(b.get("rows")):
                    if isinstance(r, list) and len(r)!=n: E(f"{sid} block {i}: table row width {len(r)} != head {n}")
            if t=="diagram" and isinstance(b.get("text"), str):
                for ln in b["text"].split("\n"):
                    if len(ln)>78: W(f"{sid} block {i}: diagram line >78 chars"); break
            if t=="figure":
                if MEDIA is not None and b.get("media") not in MEDIA: E(f"{sid} block {i}: figure media '{b.get('media')}' not in media/media.json")
                elif "regions" in b: check_regions(f"{sid} block {i}", b["regions"], *(((MEDIA or {}).get(b.get("media")) or {}).get(k) for k in ("w", "h")))
            if t=="interactive" and ACTIVITIES is not None:
                for m in A.check_block(b, ACTIVITIES): E(f"{sid} block {i}: {m}")
    exs = [e for e in L_(ch.get("exercises")) if isinstance(e, dict)]
    ids = [e.get("id") for e in exs]
    for k,v in Counter(ids).items():
        if v>1: E(f"duplicate exercise id {k}")
    tc = Counter(); tagc=Counter(); per_sec=Counter(); quick=Counter()
    for e in exs:
        eid = e.get("id","?")
        if isinstance(eid, str) and re.fullmatch(r"ch\d\d-e\d{3}", eid) and not eid.startswith(cid + "-"): E(f"bad exercise id {eid} (not of {cid})")
        t = e.get("type")
        if t not in TYPES: continue   # the contract says so
        tc[t]+=1
        if e.get("section") not in sids: E(f"{eid}: section {e.get('section')} not found")
        else: per_sec[e["section"]]+=1
        if e.get("quick"): quick[e.get("section")]+=1
        for x in L_(e.get("tags")): tagc[x]+=1
        if t=="sim" and ACTIVITIES is not None:
            for m in A.check_sim(e, ACTIVITIES): E(f"{eid}: {m}")
        exercise_refs(eid, e)
    for d in [x for x in L_(ch.get("debug")) if isinstance(x, dict)]:
        did=d.get("id","?")
        if d.get("section") and d["section"] not in sids: E(f"debug {did}: bad section")
        if len(L_(d.get("askYourself")))<3: W(f"debug {did}: <3 askYourself")
    cards = [x for x in L_(ch.get("flashcards")) if isinstance(x, dict)]
    fids = Counter(f.get("id") for f in cards)
    for f in cards:
        fid = f.get("id")
        if not re.fullmatch(re.escape(cid)+r"-f\d{3}", str(fid)): E(f"flashcard needs an id like {cid}-f001 (got {fid!r}); progress is keyed by it")
        elif fids[fid] > 1: E(f"duplicate flashcard id {fid}")
        if f.get("section") and f["section"] not in sids: E(f"flashcard bad section {f.get('section')}")
    # warnings on quantity
    for sid in sids:
        if per_sec[sid]<3: W(f"{sid}: only {per_sec[sid]} exercises")
        if quick[sid]<2: W(f"{sid}: only {quick[sid]} quick exercises")
    if not (QUALITY or BALANCE or BALANCE_WARN):   # the full rules: pack_quality.py / check_balance (pack_rules.json)
        for t in TYPES - VTYPES:
            if tc[t]<2: W(f"type '{t}' used {tc[t]}x (<2)")
    nvis = sum(tc[t] for t in VTYPES); vkinds = sum(1 for t in VTYPES if tc[t])
    nfig = sum(1 for sec in secs for b in L_(sec.get("blocks")) if isinstance(b, dict) and b.get("t") == "figure")
    if MIN_VISUAL and (nvis or nfig):   # pictures only where they teach (docs/VISUAL.md §5): a chapter with none is fine
        if nvis < MIN_VISUAL: E(f"only {nvis} visual exercises (subject requires >= {MIN_VISUAL} per chapter, docs/VISUAL.md)")
        if vkinds < 2: E(f"visual exercises use {vkinds} type(s); need >= 2 different visual types")
        if nfig < 1: E("no 'figure' block in the chapter (docs/VISUAL.md)")
    elif nfig and nvis < 3: W(f"only {nvis} visual exercises on the chapter's pictures (docs/VISUAL.md asks for >= 3)")
    if QUALITY:
        from pack_quality import check_quality
        for level, _rule, msg in check_quality(ch, FEATURES): (E if level == "error" and QUALITY == "error" else W)(msg.split(": ", 1)[1] if msg.startswith(cid + ": ") else msg)
    elif BALANCE or BALANCE_WARN: check_balance(exs, BALANCE or BALANCE_WARN, FEATURES | ({"pictures"} if nvis or nfig else set()), E if BALANCE else W)
    if "--source" in ARGS: check_same(ch, json.load(open(ARGS[ARGS.index("--source")+1], encoding="utf-8")))
    risky = sum(1 for e in exs if set(L_(e.get("tags")))&{"pitfall","debug","exam"})
    if exs and risky/len(exs)<0.3: W(f"only {risky}/{len(exs)} exercises tagged pitfall/debug/exam")
    print(f"== {path}: {len(secs)} sections, {len(exs)} exercises ({nvis} visual, {nfig} figures), {len(ch.get('debug',[]))} playbooks, {len(ch.get('flashcards',[]))} flashcards, {len(ch.get('pitfalls',[]))} pitfalls")
    print("   types:", dict(tc)); print("   tags:", dict(tagc))
    for m in errors: print("ERROR:", m)
    for m in warns: print("WARN:", m)
    print("OK" if not errors else f"{len(errors)} ERRORS")
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    if "--subject" in ARGS: check_subject(ARGS[0], [x for x in (ARGS[ARGS.index("--translations")+1] if "--translations" in ARGS else "").split(",") if x])
    else: main(ARGS[0])
