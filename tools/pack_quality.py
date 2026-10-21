"""The quality rules of a chapter (tools/pack_rules.json "quality"; docs/PIPELINES.md §4, tools/CONTENT_SPEC.md).
The SAME checks as engine/packcheck.js checkQuality: tests/pack_rules.js runs both on the same chapters and compares the issues.
  check_quality(chapter, features[, types]) → [(level, rule_id, message)]   types: default quality.vocab.types   level: "error" | "warn"
chapter.map is map/chNN.json and chapter.review is review/chNN.json (make_pack.py puts them into the chapter)."""
import json, os, re

def load_quality():
    return json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pack_rules.json"), encoding="utf-8"))["quality"]

def _strings(x, skip=()):
    """Every text inside x (dicts, lists), leaving out the keys in skip."""
    if isinstance(x, str): yield x
    elif isinstance(x, list):
        for v in x: yield from _strings(v, skip)
    elif isinstance(x, dict):
        for k, v in x.items():
            if k not in skip: yield from _strings(v, skip)

SKIP = {"id", "section", "src", "cite", "media", "lr", "think", "mode", "type", "tags", "regions", "targets", "kp", "with"}

def _sentences(t):
    return len([s for s in re.split("[.!?;\u037e\u3002]+(?:\\s+|$)", (t or "").strip()) if len(s.strip()) > 1])

def _q(v):
    """A value in a message, written the same way as engine/packcheck.js does."""
    return "none" if v is None else f'"{v}"'

def _pct(x):
    return str(int(x + 0.5))

def _norm(t):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (t or "").lower())).strip()

def check_quality(ch, features=(), types=None):
    Q = load_quality(); V = Q["vocab"]; C = {c["id"]: c for c in Q["checks"]}
    out = []; cid = ch.get("id", "?")
    def add(rule, msg): out.append((C[rule]["level"], rule, f"{cid}: [{rule}] {msg}"))
    exs = ch.get("exercises") or []
    m = ch.get("map")
    if not isinstance(m, dict):
        add("map.present", "no knowledge map (write map/" + cid + ".json before the exercises)"); m = {}
    points = m.get("points") or []; lrs = m.get("learnables") or []
    P = {p.get("id"): p for p in points if isinstance(p, dict)}; L = {l.get("id"): l for l in lrs if isinstance(l, dict)}
    # map.refs
    seen = set()
    for p in points:
        pid = p.get("id")
        if not pid or pid in seen: add("map.refs", f"point id {_q(pid)} missing or repeated")
        seen.add(pid)
        if not (isinstance(p.get("text"), str) and p["text"].strip()): add("map.refs", f"{pid}: needs its text")
        if p.get("level") not in V["levels"]: add("map.refs", f"{pid}: level must be one of {', '.join(V['levels'])}")
        for c in p.get("cats") or []:
            if c not in V["cats"]: add("map.refs", f"{pid}: unknown category {_q(c)}")
        for w in p.get("with") or []:
            if w not in P and not re.match(r"^ch\d+-k", str(w)): add("map.refs", f"{pid}: with {_q(w)} is not a knowledge point")
        if "taughtIn" in p and not (isinstance(p["taughtIn"], str) and p["taughtIn"].strip()): add("map.refs", f"{pid}: taughtIn must name the earlier step or chapter")
    seen = set()
    for l in lrs:
        lid = l.get("id")
        if not lid or lid in seen: add("map.refs", f"learnable id {_q(lid)} missing or repeated")
        seen.add(lid)
        if not l.get("kp"): add("map.refs", f"{lid}: kp must list its knowledge points")
        for k in l.get("kp") or []:
            if k not in P: add("map.refs", f"{lid}: kp {_q(k)} is not a point of the map")
    # map.exhaustive
    inlr = {k for l in lrs for k in (l.get("kp") or [])}
    for p in points:
        if p.get("id") not in inlr and not p.get("taughtIn"): add("map.exhaustive", f"{p.get('id')}: in no learnable and no taughtIn")
    # fit.declared / fit.types / fit.focus / mode.coverage
    fits = m.get("fits") or {}; unfit = m.get("unfit") or {}
    pics = any(str(e.get("type", "")).startswith("img_") for e in exs) or any(b.get("t") == "figure" for s in ch.get("sections") or [] for b in s.get("blocks") or [])
    auto = set()
    for f, vals in Q["autoUnfit"].items():
        if not (pics if f == "pictures" else f in features): auto |= set(vals)
    used = lambda k: {v for e in exs for v in ((e.get("tags") or []) if k == "tags" else [e.get(k)]) if v is not None}
    for key, universe, field in (("types", sorted(types) if types else V["types"], "type"), ("focus", V["tags"], "tags"), ("modes", V["modes"], "mode")):
        fv = fits.get(key) or []
        for v in fv:
            if v not in universe: add("fit.declared", f"fits.{key}: unknown value {_q(v)}")
        for v in universe:
            if v in fv or v in auto: continue
            if not (isinstance(unfit.get(v), str) and unfit[v].strip()): add("fit.declared", f"{key} {v}: put it in fits.{key} or give the reason in unfit.{v}")
        for v in sorted(used(field) - set(fv) - {None}):
            if v in universe: add("fit.declared", f"{v} is used but not in fits.{key}")
    for key, field, rule in (("types", "type", "fit.types"), ("focus", "tags", "fit.focus"), ("modes", "mode", "mode.coverage")):
        n = C[rule]["min"]
        for v in fits.get(key) or []:
            have = sum(1 for e in exs if (v in (e.get("tags") or []) if field == "tags" else e.get(field) == v))
            if have < n: add(rule, f"{v}: {have} exercise(s), need >= {n}")
    # mix.difficulty
    N = len(exs)
    if N:
        c = C["mix.difficulty"]
        for d, pct in c["target"].items():
            share = 100 * sum(1 for e in exs if str(e.get("difficulty")) == d) / N
            if abs(share - pct) > c["tol"]: add("mix.difficulty", f"difficulty {d}: {_pct(share)} %, need {pct} ± {c['tol']} %")
        c = C["mix.think"]
        rec = 100 * sum(1 for e in exs if e.get("think") == "recall") / N
        app = 100 * sum(1 for e in exs if e.get("think") in V["applyPlus"]) / N
        cri = sum(1 for e in exs if e.get("think") in V["critical"])
        if rec > c["recallMax"]: add("mix.think", f"recall {_pct(rec)} %, at most {c['recallMax']} %")
        if app < c["applyPlusMin"]: add("mix.think", f"apply or higher {_pct(app)} %, need >= {c['applyPlusMin']} %")
        if cri < c["criticalMin"]: add("mix.think", f"critical thinking (analyze/evaluate/create) {cri} exercise(s), need >= {c['criticalMin']}")
    # mix.order
    for s in ch.get("sections") or []:
        ds = [e.get("difficulty") or 0 for e in exs if e.get("section") == s.get("id")]
        pairs = len(ds) * (len(ds) - 1) / 2
        inv = sum(1 for i in range(len(ds)) for j in range(i + 1, len(ds)) if ds[i] > ds[j])
        if pairs and 100 * inv / pairs > C["mix.order"]["maxInversions"]: add("mix.order", f"{s.get('id')}: put the easier exercises first")
    # lr.link / cite.present / explain.depth / mcq.why / trivial / self.contained
    sq = {q.get("id"): q for q in m.get("sourceQuestions") or [] if isinstance(q, dict)}
    pats = [re.compile(p, re.I) for p in C["self.contained"]["patterns"]]
    def contained(where, x, skip=SKIP):
        for t in _strings(x, skip):
            for p in pats:
                hit = p.search(t)
                if hit: add("self.contained", f"{where}: “{hit.group(0)}” points at the source; write the example or question out in full"); return
    for e in exs:
        eid = e.get("id")
        if e.get("lr") not in L: add("lr.link", f"{eid}: lr {_q(e.get('lr'))} is not a learnable of the map")
        if e.get("think") not in V["think"]: add("lr.link", f"{eid}: think must be one of {', '.join(V['think'])}")
        if e.get("mode") is not None and e.get("mode") not in V["modes"]: add("lr.link", f"{eid}: unknown mode {_q(e.get('mode'))}")
        ci = e.get("cite")
        if not (isinstance(ci, dict) and isinstance(ci.get("src"), str) and ci["src"].strip()): add("cite.present", f"{eid}: cite {{src, loc}} missing")
        elif ci.get("sq") is not None and ci["sq"] not in sq: add("source.questions", f"{eid}: cite.sq {_q(ci['sq'])} is not a source question of the map")
        if e.get("type") != "scenario":
            ex = e.get("explain") or ""; c = C["explain.depth"]
            if len(ex.strip()) < c["minChars"] or _sentences(ex) < c["minSentences"]: add("explain.depth", f"{eid}: the explanation is too short (why right, why the tempting wrong one is wrong)")
        if e.get("type") in ("mcq", "odd"):
            opts = e.get("options") or []
            why = e.get("why")
            if not (isinstance(why, list) and len(why) == len(opts) and all(isinstance(w, str) and w.strip() for w in why)): add("mcq.why", f"{eid}: needs a why for every option")
            ans = e.get("answer"); ai = ans if isinstance(ans, int) else None
            if ai is not None and 0 <= ai < len(opts):
                right = _norm(opts[ai])
                if e.get("type") == "mcq" and len(right.split()) >= C["trivial.answer"]["minWords"] and right in _norm(e.get("q")): add("trivial.answer", f"{eid}: the right option is written in the question")
                others = [len(o) for i, o in enumerate(opts) if i != ai]
                if e.get("type") == "mcq" and others and len(opts[ai]) >= C["trivial.longest"]["ratio"] * max(others): add("trivial.longest", f"{eid}: the right option is by far the longest")
        contained(eid, e)
    for f in ch.get("flashcards") or []: contained(f.get("id") or "flashcard", f)
    for s in ch.get("sections") or []:
        for b in s.get("blocks") or []:
            if b.get("t") not in ("code", "diagram", "figure"): contained(s.get("id"), b, SKIP | {"t", "lang", "code"})
    # lr.facades / cats.facades / source.questions
    by_lr = {}
    for e in exs: by_lr.setdefault(e.get("lr"), []).append(e.get("type"))
    c = C["lr.facades"]
    for lid in L:
        ts = by_lr.get(lid, [])
        if len(ts) < c["min"] or len(set(ts)) < c["types"]: add("lr.facades", f"{lid}: {len(ts)} exercise(s) in {len(set(ts))} type(s), need >= {c['min']} in >= {c['types']}")
    c = C["cats.facades"]
    for p in points:
        if not p.get("cats") or p.get("taughtIn"): continue
        ts = [t for l in lrs if p.get("id") in (l.get("kp") or []) for t in by_lr.get(l.get("id"), [])]
        if len(ts) < c["min"] or len(set(ts)) < c["types"]: add("cats.facades", f"{p.get('id')} ({', '.join(p['cats'])}): {len(ts)} exercise(s) in {len(set(ts))} type(s), need >= {c['min']} in >= {c['types']}")
    cited = {(e.get("cite") or {}).get("sq") for e in exs if isinstance(e.get("cite"), dict)}
    for qid, q in sq.items():
        if not (isinstance(q.get("text"), str) and q["text"].strip() and isinstance(q.get("answer"), str) and q["answer"].strip()): add("source.questions", f"{qid}: needs its full text and its checked answer")
        if qid not in cited: add("source.questions", f"{qid}: no exercise cites it (cite.sq)")
    # review.done
    r = ch.get("review"); c = C["review.done"]
    if not isinstance(r, dict): add("review.done", "no second-pass review (review/" + cid + ".json)")
    else:
        rub = {x.get("lr") for x in r.get("rubric") or [] if isinstance(x, dict) and x.get("lr") in L}
        need = min(c["rubricMin"], len(L))
        if len(rub) < need: add("review.done", f"the rubric covers {len(rub)} learnable(s), need {need}")
        b = r.get("blind") or {}
        if not isinstance(b.get("solved"), int) or b["solved"] < N: add("review.done", f"blind re-solve: {b.get('solved', 0)} of {N} exercises solved")
        open_ = [x.get("id") for x in b.get("mismatches") or [] if not (isinstance(x, dict) and x.get("fixed") is True)]
        if open_: add("review.done", f"blind re-solve: mismatches not fixed: {', '.join(map(str, open_[:8]))}")
    return out
