#!/usr/bin/env python3
"""Validate a chapter JSON file (tools/CONTENT_SPEC.md + docs/VISUAL.md).
Usage: validate.py chNN.json [--media media_meta.json] [--min-visual N]
  --media       {id: {w, h, regions}} of the subject's pictures (build.py passes it) → checks references & coordinates
  --min-visual  required visual exercises per chapter (from subject.json authoring.minVisualPerChapter)"""
import json, re, sys
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
from collections import Counter

errors, warns = [], []
def E(m): errors.append(m)
def W(m): warns.append(m)

BLOCKS = {"p":["text"],"list":["items"],"code":["code"],"diagram":["text"],"table":["head","rows"],
          "callout":["kind","text"],"compare":["items"],"flow":["items"],"reveal":["label","text"],
          "ask":["questions"],"terms":["items"],"figure":["media"]}
KINDS = {"key","pitfall","tip","exam","warn","analogy","debug","interview"}
TAGS = {"concept","syntax","pitfall","debug","exam","interview","calc","compare"}
VTYPES = {"img_hotspot","img_sequence","img_reveal","img_drag","img_label","img_select","img_occlusion"}
TYPES = {"mcq","tf","odd","order","match","bucket","cloze","spotbug","calc","scenario","free","write"} | VTYPES
ARGS = sys.argv[1:]
MEDIA = json.load(open(ARGS[ARGS.index("--media")+1], encoding="utf-8")) if "--media" in ARGS else None
MIN_VISUAL = int(ARGS[ARGS.index("--min-visual")+1]) if "--min-visual" in ARGS else 0
RID = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

def check_regions(where, regions, IW=None, IH=None):
    """Structural + bounds checks; returns {id: region}."""
    out = {}
    if not isinstance(regions, list): E(f"{where}: regions must be a list"); return out
    for r in regions:
        rid = r.get("id")
        if not isinstance(rid, str) or not RID.match(rid): E(f"{where}: bad region id {rid!r}"); continue
        if rid in out: E(f"{where}: duplicate region id {rid}")
        out[rid] = r
        sh = r.get("shape"); pts = []
        if sh == "rect":
            if not all(isinstance(r.get(k),(int,float)) for k in "xywh") or r["w"] <= 0 or r["h"] <= 0: E(f"{where}/{rid}: rect needs x,y,w>0,h>0"); continue
            pts = [(r["x"], r["y"]), (r["x"]+r["w"], r["y"]+r["h"])]
        elif sh == "circle":
            if not all(isinstance(r.get(k),(int,float)) for k in ("cx","cy","r")) or r["r"] <= 0: E(f"{where}/{rid}: circle needs cx,cy,r>0"); continue
            pts = [(r["cx"]-r["r"], r["cy"]-r["r"]), (r["cx"]+r["r"], r["cy"]+r["r"])]
        elif sh == "poly":
            P = r.get("points")
            if not isinstance(P, list) or len(P) < 3 or not all(isinstance(q, list) and len(q) == 2 for q in P): E(f"{where}/{rid}: poly needs >=3 [x,y] points"); continue
            pts = [tuple(q) for q in P]
        else: E(f"{where}/{rid}: shape must be rect|circle|poly"); continue
        if r.get("anchor") is not None: pts.append(tuple(r["anchor"]))
        if IW and IH and any(x < -0.5 or y < -0.5 or x > IW+0.5 or y > IH+0.5 for x, y in pts): E(f"{where}/{rid}: region outside the {IW:g}x{IH:g} picture")
        if "options" in r and (not isinstance(r["options"], list) or len(r["options"]) < 2): E(f"{where}/{rid}: options needs >=2 entries")
    return out

def check_visual(eid, e):
    t = e["type"]; mid = e.get("media")
    if not s(mid): E(f"{eid}: visual exercise needs media"); return
    m = (MEDIA or {}).get(mid)
    if MEDIA is not None and not m: E(f"{eid}: media '{mid}' not in media/media.json"); return
    IW, IH = (m or {}).get("w"), (m or {}).get("h")
    regions = e.get("regions", (m or {}).get("regions") if m else None)
    if t == "img_reveal" and e.get("grid"):
        g = e["grid"]
        if not (isinstance(g, list) and len(g) == 2 and all(isinstance(x, int) and 1 <= x <= 8 for x in g)): E(f"{eid}: grid must be [cols, rows] (1-8)")
        regions = regions or []
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

def s(x): return isinstance(x,str) and x.strip()!=""

def main(path):
    try:
        ch = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print("ERROR: invalid JSON:", e); sys.exit(1)
    for k in ["id","num","title","subtitle","emoji","sourcePages","mantra","objectives","sections","debug","pitfalls","flashcards","exercises"]:
        if k not in ch: E(f"chapter missing '{k}'")
    cid = ch.get("id","")
    if not re.fullmatch(r"ch\d\d", cid): E("chapter id must be chNN")
    secs = ch.get("sections",[])
    sids = [x.get("id") for x in secs]
    if len(set(sids))!=len(sids): E("duplicate section ids")
    for sec in secs:
        sid = sec.get("id","?")
        if not re.fullmatch(cid+r"-s\d\d", str(sid)): E(f"bad section id {sid}")
        if not s(sec.get("title")): E(f"{sid}: missing title")
        bl = sec.get("blocks",[])
        if len(bl) < 3: W(f"{sid}: only {len(bl)} blocks")
        for i,b in enumerate(bl):
            t = b.get("t")
            if t not in BLOCKS: E(f"{sid} block {i}: unknown type {t}"); continue
            for f in BLOCKS[t]:
                if f not in b: E(f"{sid} block {i} ({t}): missing {f}")
            if t=="callout" and b.get("kind") not in KINDS: E(f"{sid} block {i}: bad callout kind {b.get('kind')}")
            if t=="table":
                n=len(b.get("head",[]))
                for r in b.get("rows",[]):
                    if len(r)!=n: E(f"{sid} block {i}: table row width {len(r)} != head {n}")
            if t=="diagram":
                for ln in b.get("text","").split("\n"):
                    if len(ln)>78: W(f"{sid} block {i}: diagram line >78 chars"); break
            if t=="figure":
                if MEDIA is not None and b.get("media") not in MEDIA: E(f"{sid} block {i}: figure media '{b.get('media')}' not in media/media.json")
                elif "regions" in b: check_regions(f"{sid} block {i}", b["regions"], *(((MEDIA or {}).get(b.get("media")) or {}).get(k) for k in ("w", "h")))
            if t=="terms":
                for it in b["items"]:
                    if not (s(it.get("term")) and s(it.get("def"))): E(f"{sid} block {i}: term needs term+def")
            if t=="compare":
                for it in b["items"]:
                    if not s(it.get("title")) or not isinstance(it.get("points"),list): E(f"{sid} block {i}: compare item needs title+points")
    exs = ch.get("exercises",[])
    ids = [e.get("id") for e in exs]
    for k,v in Counter(ids).items():
        if v>1: E(f"duplicate exercise id {k}")
    tc = Counter(); tagc=Counter(); per_sec=Counter(); quick=Counter()
    for e in exs:
        eid = e.get("id","?")
        if not re.fullmatch(cid+r"-e\d{3}", str(eid)): E(f"bad exercise id {eid}")
        t = e.get("type")
        if t not in TYPES: E(f"{eid}: unknown type {t}"); continue
        tc[t]+=1
        if e.get("section") not in sids: E(f"{eid}: section {e.get('section')} not found")
        else: per_sec[e["section"]]+=1
        if e.get("quick"): quick[e.get("section")]+=1
        if e.get("difficulty") not in (1,2,3): E(f"{eid}: difficulty must be 1-3")
        tg = e.get("tags",[])
        if not tg or not set(tg)<=TAGS: E(f"{eid}: bad tags {tg}")
        for x in tg: tagc[x]+=1
        if not s(e.get("q")) and t!="scenario": E(f"{eid}: missing q")
        if t!="scenario" and not s(e.get("explain")): E(f"{eid}: missing explain")
        if t in ("mcq","odd"):
            o=e.get("options",[]); a=e.get("answer")
            if len(o)<2: E(f"{eid}: needs options")
            aa = a if isinstance(a,list) else [a]
            if not all(isinstance(x,int) and 0<=x<len(o) for x in aa): E(f"{eid}: bad answer index")
            if isinstance(a,list) and len(a)>1 and not e.get("multi"): E(f"{eid}: multiple answers need multi:true")
            if "why" in e and len(e["why"])!=len(o): E(f"{eid}: why length != options")
            if len(set(o))!=len(o): E(f"{eid}: duplicate options")
            if t=="odd" and len(o)!=4: W(f"{eid}: odd should have 4 options")
        if t in VTYPES: check_visual(eid, e)
        if t=="tf" and not isinstance(e.get("answer"),bool): E(f"{eid}: tf answer must be bool")
        if t=="order":
            it=e.get("items",[])
            if not (3<=len(it)<=9): E(f"{eid}: order needs 3-9 items")
            if len(set(it))!=len(it): E(f"{eid}: duplicate order items")
        if t=="match":
            p=e.get("pairs",[])
            if not (3<=len(p)<=7) or any(len(x)!=2 for x in p): E(f"{eid}: match needs 3-7 pairs of 2")
            if len(set(x[1] for x in p))!=len(p) or len(set(x[0] for x in p))!=len(p): E(f"{eid}: match sides must be distinct")
        if t=="bucket":
            b=e.get("buckets",[]); it=e.get("items",[])
            if not (2<=len(b)<=4): E(f"{eid}: 2-4 buckets")
            if not all(isinstance(x.get("bucket"),int) and 0<=x["bucket"]<len(b) and s(x.get("text")) for x in it): E(f"{eid}: bad bucket items")
            if len(it)<4: W(f"{eid}: few bucket items")
        if t=="cloze":
            bl=re.findall(r"\[\[(.+?)\]\]", e.get("text",""))
            if not bl: E(f"{eid}: cloze has no [[blanks]]")
            if any(not x.split("|")[0].strip() for x in bl): E(f"{eid}: empty blank")
        if t=="spotbug":
            L=e.get("lines",[]); B=e.get("bugs",[])
            if len(L)<3: E(f"{eid}: spotbug needs >=3 lines")
            if not B or not all(isinstance(x,int) and 0<=x<len(L) for x in B): E(f"{eid}: bad bug indexes")
            if not s(e.get("fix")): E(f"{eid}: missing fix")
        if t=="calc":
            if not isinstance(e.get("answer"),(int,float)): E(f"{eid}: calc answer must be number")
        if t=="scenario":
            st=e.get("steps",[])
            if not st: E(f"{eid}: scenario needs steps")
            if not s(e.get("q")): W(f"{eid}: scenario should have q (setup)")
            for j,x in enumerate(st):
                op=x.get("options",[])
                if sum(1 for o in op if o.get("ok"))!=1: E(f"{eid} step {j}: exactly one ok option")
                if not all(s(o.get("text")) and s(o.get("fb")) for o in op): E(f"{eid} step {j}: every option needs text+fb")
        if t=="free":
            if not s(e.get("model")) or not e.get("rubric"): E(f"{eid}: free needs model+rubric")
        if t=="write":
            if not s(e.get("solution")) or not e.get("keywords"): E(f"{eid}: write needs solution+keywords")
            else:
                sol=e["solution"].lower()
                for k in e["keywords"]:
                    if k.lower() not in sol: E(f"{eid}: keyword '{k}' not in solution")
    for d in ch.get("debug",[]):
        did=d.get("id","?")
        for k in ["title","symptom","askYourself","steps","rootCauses","fix"]:
            if k not in d: E(f"debug {did}: missing {k}")
        if d.get("section") and d["section"] not in sids: E(f"debug {did}: bad section")
        if len(d.get("askYourself",[]))<3: W(f"debug {did}: <3 askYourself")
    for f in ch.get("flashcards",[]):
        if not (s(f.get("q")) and s(f.get("a"))): E("flashcard needs q+a")
        if f.get("section") and f["section"] not in sids: E(f"flashcard bad section {f.get('section')}")
    # warnings on quantity
    for sid in sids:
        if per_sec[sid]<3: W(f"{sid}: only {per_sec[sid]} exercises")
        if quick[sid]<2: W(f"{sid}: only {quick[sid]} quick exercises")
    for t in TYPES - VTYPES:
        if tc[t]<2: W(f"type '{t}' used {tc[t]}x (<2)")
    nvis = sum(tc[t] for t in VTYPES); vkinds = sum(1 for t in VTYPES if tc[t])
    nfig = sum(1 for sec in secs for b in sec.get("blocks", []) if b.get("t") == "figure")
    if MIN_VISUAL:
        if nvis < MIN_VISUAL: E(f"only {nvis} visual exercises (subject requires >= {MIN_VISUAL} per chapter, docs/VISUAL.md)")
        if vkinds < 2: E(f"visual exercises use {vkinds} type(s); need >= 2 different visual types")
        if nfig < 1: E("no 'figure' block in the chapter (docs/VISUAL.md)")
    elif nvis < 3: W(f"only {nvis} visual exercises (docs/VISUAL.md asks for >= 3 per chapter)")
    risky = sum(1 for e in exs if set(e.get("tags",[]))&{"pitfall","debug","exam"})
    if exs and risky/len(exs)<0.3: W(f"only {risky}/{len(exs)} exercises tagged pitfall/debug/exam")
    print(f"== {path}: {len(secs)} sections, {len(exs)} exercises ({nvis} visual, {nfig} figures), {len(ch.get('debug',[]))} playbooks, {len(ch.get('flashcards',[]))} flashcards, {len(ch.get('pitfalls',[]))} pitfalls")
    print("   types:", dict(tc)); print("   tags:", dict(tagc))
    for m in errors: print("ERROR:", m)
    for m in warns: print("WARN:", m)
    print("OK" if not errors else f"{len(errors)} ERRORS")
    sys.exit(1 if errors else 0)

main(ARGS[0])
