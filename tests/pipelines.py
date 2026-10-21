#!/usr/bin/env python3
"""The content pipelines (tools/pipelines/, tools/pipeline.py, docs/PIPELINES.md).
  python3 tests/pipelines.py
1. Every flow names only steps of steps.json, every step's needs come earlier in each flow that has them, every command a
   check runs exists. 2. detect picks the right flow. 3. A whole subject goes through flow 4 in a temporary folder:
   start_subject → map → write → blind re-solve → review → make_pack, each step checked; a change makes the steps after it stale."""
import json, os, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools"); SCRIPTS = os.path.join(ROOT, "skill", "noema-pack-builder", "scripts")
sys.path.insert(0, TOOLS)
import pipeline
n = 0
def ok(c, m):
    global n
    if not c: print("✗ " + m); sys.exit(1)
    n += 1; print("✓ " + m)

S = pipeline.steps(); F = pipeline.flows()
ok(set(F) == {"1", "1b", "2", "3", "4", "5", "6", "7", "8", "L1", "L2"}, "the 9 knowledge flows and the 2 language flows (Γ1, Γ2)")
for f in F.values():
    ok(all(s in S for s in f["steps"]) and f["steps"][0] == "classify", f"flow {f['id']}: known steps, classify first")
    bad = [(s, need) for i, s in enumerate(f["steps"]) for need in S[s].get("needs", []) if need in f["steps"] and f["steps"].index(need) > i]
    ok(not bad, f"flow {f['id']}: every step's needs come before it")
for sid, st in S.items():
    ck = st.get("check") or {}
    ok(len([k for k in ("local", "run", "mcp", "manual") if k in ck]) == 1 and st.get("gate", "strict") in ("strict", "review", "planned"), f"step {sid}: one kind of check, a known gate")
    if "run" in ck:
        exe = ck["run"][1].replace("{lt}", TOOLS).replace("{root}", ROOT)
        ok(os.path.exists(exe), f"step {sid}: its command exists ({os.path.relpath(exe, ROOT)})")
for k in ("map", "write", "pictures", "blind_solve", "review", "checks", "upload", "bridges"):
    ok(all(k in F[f]["steps"] for f in ("1", "2", "4")), f"the flows that build a pack all have the step {k}")
ok(all(s in F["L2"]["steps"] for s in ("L.phenomena", "L.params", "L.order", "L.words", "L.grounding", "L.notes", "L.sentences", "L.package")), "Γ2: the steps of docs/LANGUAGE_RULES.md checklist §C (phenomena, R3, D13, D14/D15, grounding, D19, D22–D24, package)")

D = lambda *a: pipeline.detect(list(a))[0]
ok(D("--sources", "3", "--topics", "5") == "1" and D("--goal") == "1b" and D("--step") == "2" and D("--queue") == "3" and D("--sources", "2") == "4"
   and D("--extend", "--sources", "1") == "5" and D("--bridge") == "6" and D("--translate") == "7" and D("--import") == "8"
   and D("--lang-task") == "L1" and D("--new-language") == "L2" and D() is None, "detect: each set of facts → its flow")

# ---- flow 4 end to end, with the scripts as the skill ships them (tools/build.py SKILL_TOOLS + pipelines/) ----
import re
work = tempfile.mkdtemp(prefix="pipe-"); sk = os.path.join(work, "_skill"); os.makedirs(os.path.join(sk, "pipelines"))
for f in os.listdir(SCRIPTS): shutil.copy(os.path.join(SCRIPTS, f), sk) if f.endswith(".py") else None
for t in re.search(r"SKILL_TOOLS = \[([^\]]*)\]", open(os.path.join(TOOLS, "build.py"), encoding="utf-8").read()).group(1).replace("'", "").split(", "): shutil.copy(os.path.join(TOOLS, t), sk)
for f in os.listdir(pipeline.PIPES): shutil.copy(os.path.join(pipeline.PIPES, f), os.path.join(sk, "pipelines"))
P = lambda *a: subprocess.run([sys.executable, os.path.join(sk, "pipeline.py"), *a], capture_output=True, text=True)
try:
    subprocess.run([sys.executable, os.path.join(sk, "start_subject.py"), work, "demo-coulomb", "Coulomb", "--lang", "en"], check=True, capture_output=True)
    d = os.path.join(work, "demo-coulomb")
    sj = json.load(open(os.path.join(d, "subject.json"), encoding="utf-8"))
    ok(sj["authoring"]["rules"] == 2 and sj["authoring"]["by"] == "claude" and os.path.isdir(os.path.join(d, "map")) and os.path.isdir(os.path.join(d, "review")), "start_subject.py: authoring.rules 2, by claude, map/ and review/")
    ok(P("start", "4", d).returncode == 0 and P("status", d).returncode == 1, "start 4 → run.json; status fails while strict steps are open")
    ok(P("check", d, "map").returncode == 1, "map: refused before start_subject is checked (needs)")
    ok(P("check", d, "start_subject").returncode == 0, "start_subject: checked")
    r = P("check", d, "map"); ok(r.returncode == 1 and "no map/chNN.json" in r.stdout, "map: no map yet → fails")
    # the chapter, its map and its review (the same good chapter as tests/pack_rules.js)
    T9 = ["mcq", "tf", "odd", "order", "match", "bucket", "cloze", "scenario", "free"]; TG = ["concept", "pitfall", "debug", "exam", "interview", "compare"]
    Q = json.load(open(os.path.join(TOOLS, "pack_rules.json"), encoding="utf-8"))["quality"]; M6 = Q["vocab"]["modes"][:6]
    SHAPE = {"tf": {"answer": True}, "order": {"items": ["a", "b", "c"]}, "match": {"pairs": [["a", "1"], ["b", "2"], ["c", "3"]]}, "bucket": {"buckets": ["x", "y"], "items": [{"text": f"t{i}", "bucket": i % 2} for i in range(4)]},
             "cloze": {"text": "The force falls with the [[square]] of the distance."}, "scenario": {"steps": [{"prompt": "p", "options": [{"text": "a", "ok": True, "fb": "f"}, {"text": "b", "ok": False, "fb": "g"}]}]}, "free": {"model": "m", "rubric": ["r"]}}
    EX = "The rule holds because the force falls with the square of the distance. The tempting answer forgets the square and halves it."
    exs = []
    for i in range(40):
        t = T9[i % 9]
        e = {"id": f"ch01-e{i + 1:03d}", "type": t, "section": "ch01-s01", "difficulty": 1 if i < 8 else 2 if i < 18 else 3, "tags": [TG[i % 6]], "q": f"Question number {i + 1} about the distance and the force?",
             "lr": f"ch01-l{i // 2 + 1:02d}", "think": "recall" if i < 10 else "explain" if i < 20 else "apply" if i < 30 else "analyze", "cite": {"src": "s1", "loc": "ch 1"}, "explain": EX}
        if i < 12: e["mode"] = M6[i % 6]
        if i == 0: e["cite"]["sq"] = "ch01-q01"
        if t in ("mcq", "odd"): e.update(options=["a short one", "another one", "a third one", "a fourth one"], answer=0, why=[f"Option {k + 1} is {'right' if k == 0 else 'wrong'} because of the rule." for k in range(4)])
        else: e.update(SHAPE[t])
        exs.append(e)
    points = [{"id": f"ch01-k{i + 1:02d}", "text": f"Point {i + 1}", "level": ["foundation", "core", "advanced"][i % 3], "cite": {"src": "s1"}} for i in range(20)]
    m = {"format": "noema.map/v1", "chapter": "ch01", "points": points, "learnables": [{"id": f"ch01-l{i + 1:02d}", "kp": [points[i]["id"]], "goal": "g"} for i in range(20)],
         "fits": {"types": T9, "focus": TG, "modes": M6}, "unfit": {x: "nothing to argue about here" for x in Q["vocab"]["modes"][6:]},
         "sourceQuestions": [{"id": "ch01-q01", "text": "The full question.", "answer": "Its checked answer.", "cite": {"src": "s1", "loc": "Q1"}}]}
    json.dump(m, open(os.path.join(d, "map", "ch01.json"), "w"))
    r = P("check", d, "map"); ok(r.returncode == 0, "map: a complete knowledge map passes" + ("" if r.returncode == 0 else "\n" + r.stdout))
    ch = {"id": "ch01", "num": 1, "title": "Coulomb", "subtitle": "Force and distance", "emoji": "⚡", "sourcePages": "1-3", "mantra": "Square the distance.", "objectives": ["You can explain the inverse square law"],
          "sections": [{"id": "ch01-s01", "title": "The law", "blocks": [{"t": "p", "text": "The force between two charges falls with the square of the distance."}, {"t": "p", "text": "Double the distance, a quarter of the force."}, {"t": "p", "text": "Halve it, four times the force."}]}],
          "debug": [], "pitfalls": [], "flashcards": [{"id": "ch01-f001", "q": "Force at twice the distance?", "a": "A quarter."}], "exercises": exs}
    json.dump(ch, open(os.path.join(d, "chapters", "ch01.json"), "w"))
    r = P("check", d, "write"); ok(r.returncode == 0, "write: the chapter is valid" + ("" if r.returncode == 0 else "\n" + r.stdout))
    r = P("check", d, "blind_solve"); ok(r.returncode == 1 and "review/ch01.json" in r.stdout, "blind_solve: no review file → fails")
    rv = {"format": "noema.review/v1", "chapter": "ch01", "rubric": [], "blind": {"solved": 40, "mismatches": [{"id": "ch01-e003", "fixed": True}]}}
    json.dump(rv, open(os.path.join(d, "review", "ch01.json"), "w"))
    ok(P("check", d, "blind_solve").returncode == 0, "blind_solve: every exercise solved blind, every mismatch fixed")
    ok(P("check", d, "review").returncode == 1, "review: an empty rubric fails")
    rv["rubric"] = [{"lr": f"ch01-l{i + 1:02d}", "ok": True} for i in range(15)]; json.dump(rv, open(os.path.join(d, "review", "ch01.json"), "w"))
    ok(P("check", d, "review").returncode == 0, "review: rubric on 15 learnables")
    ok(P("done", d, "pictures", "--note", "no picture teaches here; none kept").returncode == 0, "pictures: a judgement, recorded with a note")
    # the languages every new pack gets (pack_rules.json "languages"): an English pack → translations el, ru; bridges el, ru, ar
    r = P("check", d, "translate"); ok(r.returncode == 1 and "el: missing ch01" in r.stdout and "ru: missing ch01" in r.stdout and "en:" not in r.stdout, "translate: an English pack needs el and ru (never its own language)")
    for loc in ("el", "ru"):
        os.makedirs(os.path.join(d, "translations", loc), exist_ok=True); json.dump(ch, open(os.path.join(d, "translations", loc, "ch01.json"), "w"))
    ok(P("check", d, "translate").returncode == 0, "translate: every chapter in el and ru")
    r = P("check", d, "bridges"); ok(r.returncode == 1 and "no bridges/core.json" in r.stdout, "bridges: none yet → fails")
    sys.path.insert(0, sk); import bridge as BR
    pk0 = {"subject": sj, "chapters": [ch]}
    words = BR.todo(pk0, [], (), None, 5000)
    core = {"format": "noema-bridge-core", "v": 1, "pack": "demo-coulomb", "source": "en", "entries": [{"k": w["word"], "band": 1, "senses": [{"id": "1", "gloss": "g"}]} for w in words]}
    os.makedirs(os.path.join(d, "bridges"), exist_ok=True); json.dump(core, open(os.path.join(d, "bridges", "core.json"), "w"))
    loc = lambda nat, part=1.0: {"format": "noema-bridge-locale", "v": 1, "native": nat, "status": "draft", "t": {f"{w['word']}#1": {"t": "x"} for w in words[:max(1, int(len(words) * part))]}}
    for nat in ("el", "ru"): json.dump(loc(nat), open(os.path.join(d, "bridges", nat + ".json"), "w"))
    r = P("check", d, "bridges"); ok(r.returncode == 1 and "no bridge into ar" in r.stdout, "bridges: el and ru are not enough — ar too")
    json.dump(loc("ar", 0.5), open(os.path.join(d, "bridges", "ar.json"), "w"))
    r = P("check", d, "bridges"); ok(r.returncode == 1 and "ar: covers" in r.stdout and "everyday words" in r.stdout, "bridges: a bridge with half the words is below the minimum (all and everyday words)")
    json.dump(loc("ar"), open(os.path.join(d, "bridges", "ar.json"), "w"))
    r = P("check", d, "bridges"); ok(r.returncode == 0, "bridges: el, ru, ar, each covering the content and the everyday words" + ("" if r.returncode == 0 else "\n" + r.stdout))
    r = P("check", d, "checks"); ok(r.returncode == 0 and "✓" in r.stdout, "checks: make_pack.py builds the pack with every quality rule" + ("" if r.returncode == 0 else "\n" + r.stdout))
    pk = json.load(open(os.path.join(d, "build", "demo-coulomb.json"), encoding="utf-8"))
    ok(pk["chapters"][0]["map"]["format"] == "noema.map/v1" and pk["chapters"][0]["review"]["blind"]["solved"] == 40, "the pack carries chapter.map (Info window) and chapter.review")
    t_el = json.load(open(os.path.join(d, "build", "demo-coulomb.tr.el.json"), encoding="utf-8"))
    ok(pk["translations"] == {"el": {"file": True, "chapters": 1}, "ru": {"file": True, "chapters": 1}} and t_el["format"] == "noema-translation" and t_el["version"] == pk["version"] and t_el["chapters"][0]["id"] == "ch01",
       "make_pack.py: each translation in its own file (build/<id>.tr.<locale>.json), the pack only names them")
    ex = json.load(open(os.path.join(d, "chapters", "ch01.json"))); ex["exercises"][4]["q"] = "As in Q14 of the source, what happens?"; json.dump(ex, open(os.path.join(d, "chapters", "ch01.json"), "w"))
    st = P("status", d).stdout
    ok("write          stale" in st and "checks         stale" in st and "map            done" in st, "a change to the chapter makes write and every later step stale, not the map")
    r = P("check", d, "checks"); ok(r.returncode == 1 and r.stdout.startswith("first: review"), "checks: refused while an earlier step is stale")
    ok(all(P("check", d, x).returncode == 0 for x in ("write", "blind_solve", "review", "translate", "bridges")), "write, blind_solve, review, translate, bridges: checked again")
    r = P("check", d, "checks"); ok(r.returncode == 1 and "[self.contained]" in r.stdout, "checks: make_pack.py refuses the pointer to the source (self.contained)")
    ok(P("next", d).stdout.startswith("next: checks"), "next: the first step that is not done")
finally:
    shutil.rmtree(work, ignore_errors=True)
print(f"\n{n} checks passed")
