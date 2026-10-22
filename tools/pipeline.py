#!/usr/bin/env python3
"""Which content flow am I in, which step comes next, and did it pass? (docs/PIPELINES.md)
  python3 pipeline.py flows                                   every flow (tools/pipelines/<id>.json) and when it applies
  python3 pipeline.py detect [--sources N] [--topics N] [--goal] [--step] [--queue] [--grow] [--extend] [--bridge] [--translate]
                             [--import] [--lang-task] [--new-language]          → the flow for what the learner gave and asked
  python3 pipeline.py start FLOW DIR [--course C] [--lang L] [--locale X]       write DIR/run.json (DIR = the subject folder,
                                                                              or the course folder of a language flow)
  python3 pipeline.py status DIR                              every step: todo / done / stale / failed / planned
  python3 pipeline.py next DIR                                the next step: what to do, the doc, how it is checked
  python3 pipeline.py check DIR STEP                          run the step's check; on success record it with the hashes of
                                                              what it produced (a later change makes it, and every step
                                                              after it, stale)
  python3 pipeline.py done DIR STEP [--note "…"]              record a connector call (mcp) or a judgement (manual)
Exit code 1 when a check fails or a strict step is missing. The steps are tools/pipelines/steps.json."""
import glob, hashlib, json, os, subprocess, sys, tempfile, datetime
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__))
PIPES = os.path.join(HERE, "pipelines")
ROOT = os.path.dirname(HERE) if os.path.basename(HERE) == "tools" else HERE
sys.path.insert(0, HERE)

def rj(p, d=None):
    try: return json.load(open(p, encoding="utf-8"))
    except Exception: return d

def steps(): return rj(os.path.join(PIPES, "steps.json"))["steps"]
def flows(): return {f["id"]: f for f in (rj(p) for p in sorted(glob.glob(os.path.join(PIPES, "*.json")))) if f and f.get("format") == "noema.pipeline/v1"}

def find(name):
    for d in (HERE, os.path.join(ROOT, "tools"), os.path.join(ROOT, "skill", "noema-pack-builder", "scripts")):
        if os.path.exists(os.path.join(d, name)): return os.path.join(d, name)
    return None

def detect(a):
    """The flow, from facts about the request (not from wording). Order matters: the most specific first."""
    n = lambda k: int(a[a.index(k) + 1]) if k in a else 0
    if "--new-language" in a: return "L2", "a whole new language for a course"
    if "--lang-task" in a: return "L1", "a task of an existing language course"
    if "--import" in a: return "8", "the learner brings a Roadmap file or a pack"
    if "--bridge" in a: return "6", "language help for an existing pack"
    if "--translate" in a: return "7", "a translation of an existing pack"
    if "--grow" in a: return "9", "new material for a Roadmap that exists: a new part, joined to its steps"
    if "--extend" in a: return "5", "new material for a subject that exists"
    if "--step" in a: return "2", "a Roadmap step handed over by noema_curriculum_task"
    if "--queue" in a: return "3", "a Roadmap whose steps need chapter plans"
    if "--goal" in a and not n("--sources"): return "1b", "a goal and no sources"
    if n("--topics") > 1: return "1", "several topics building on each other: a Roadmap"
    if n("--sources") or "--goal" in a: return "4", "material that fits one subject"
    return None, "say what the learner gave: --sources N --topics N, --goal, --step, --grow, --extend, --bridge, --translate, --import, --lang-task, --new-language"

def now(): return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()

def subject_id(d): return (rj(os.path.join(d, "subject.json")) or {}).get("id", "")

def produced(d, st, run):
    """The files a step produced (its 'produces' templates; {ch} and {locale} = every chapter / locale)."""
    out = []
    for t in st.get("produces", []):
        pat = t.replace("{ch}", "*").replace("{locale}", "*").replace("{id}", subject_id(d) or "*")
        out += sorted(glob.glob(os.path.join(d, pat)))
    return out

def hashes(files): return {os.path.basename(os.path.dirname(f)) + "/" + os.path.basename(f): hashlib.sha256(open(f, "rb").read()).hexdigest()[:16] for f in files}

def vars_(d, run):
    v = dict(run.get("vars") or {}); v.setdefault("course", d); v.setdefault("lang", ""); v.setdefault("locale", "en")
    v["lt"] = os.path.dirname(find("validate_lang.py") or os.path.join(HERE, "validate_lang.py")); v["root"] = ROOT
    return v

def chapters_of(d, sub):
    return {os.path.basename(f)[:-5]: f for f in sorted(glob.glob(os.path.join(d, sub, "ch*.json")))}

def local_check(kind, d, run):
    """→ (ok, lines). The checks pipeline.py runs itself, with the same code as make_pack.py (pack_quality.py)."""
    from pack_quality import check_quality
    L = []
    if kind == "run": return True, ["run.json is here"]
    if kind == "subject":
        s = rj(os.path.join(d, "subject.json"))
        if not s: return False, ["no subject.json: run start_subject.py"]
        if int((s.get("authoring") or {}).get("rules", 0)) < 2: return False, ["subject.json authoring.rules must be 2 (start_subject.py writes it)"]
        return True, ["subject.json with authoring.rules 2"]
    if kind == "map":
        maps = chapters_of(d, "map")
        if not maps: return False, ["no map/chNN.json yet: write the knowledge map of every chapter before its exercises"]
        ok = True
        for cid, f in maps.items():
            m = rj(f)
            if m is None: ok = False; L.append(f"{cid}: map/{cid}.json is not valid JSON"); continue
            feats = {k for k, v in ((rj(os.path.join(d, "subject.json")) or {}).get("features") or {}).items() if v}
            iss = [x for x in check_quality({"id": cid, "map": m, "exercises": [], "sections": []}, feats, set())
                   if x[1] in ("map.present", "map.refs", "map.exhaustive") or (x[1] == "fit.declared" and "unknown value" in x[2])]
            for _, _, msg in iss: L.append(msg)
            ok = ok and not iss
            L.append(f"{cid}: {len(m.get('points') or [])} knowledge points, {len(m.get('learnables') or [])} learnables, {len(m.get('sourceQuestions') or [])} source questions")
        missing = [c for c in chapters_of(d, "chapters") if c not in maps]
        if missing: ok = False; L.append("chapters without a map: " + ", ".join(missing))
        return ok, L
    if kind == "write":
        chs = chapters_of(d, "chapters")
        if not chs: return False, ["no chapters/chNN.json yet"]
        ok = True
        for cid, f in chs.items():
            r = subprocess.run([sys.executable, find("validate.py"), f], capture_output=True, text=True)
            errs = [l for l in r.stdout.splitlines() if l.startswith("ERROR")]
            ok = ok and not errs; L += [f"{cid}: {e}" for e in errs[:20]] or [f"{cid}: {r.stdout.splitlines()[0] if r.stdout else 'ok'}"]
        return ok, L
    if kind in ("blind", "review"):
        chs = chapters_of(d, "chapters"); ok = bool(chs)
        if not chs: return False, ["no chapters yet"]
        for cid, f in chs.items():
            c = rj(f) or {}; c["map"] = rj(os.path.join(d, "map", cid + ".json")); c["review"] = rj(os.path.join(d, "review", cid + ".json"))
            iss = [x for x in check_quality(c, set(), set()) if x[1] == "review.done" and (kind == "review" or "blind" in x[2] or "no second-pass" in x[2])]
            for _, _, msg in iss: L.append(msg)
            ok = ok and not iss
        return ok, L or ["every chapter: " + ("blind re-solve recorded, every mismatch fixed" if kind == "blind" else "rubric and blind re-solve done")]
    if kind == "pack":
        with tempfile.TemporaryDirectory() as td:
            r = subprocess.run([sys.executable, find("make_pack.py"), d, td], capture_output=True, text=True)
        tail = (r.stdout + r.stderr).strip().splitlines()[-25:]
        return r.returncode == 0, tail
    if kind == "translations":   # a full translation of every chapter into en, el, ru minus the pack's language (pack_rules.json "languages")
        from noema_lib import required_locales
        s = rj(os.path.join(d, "subject.json")) or {}; need, _b = required_locales(s.get("language", "en"))
        chs = sorted(chapters_of(d, "chapters")); ok = bool(chs)
        if not chs: return False, ["no chapters yet"]
        for loc in need:
            miss = [c for c in chs if not os.path.exists(os.path.join(d, "translations", loc, c + ".json"))]
            ok = ok and not miss
            L.append(f"{loc}: " + (f"missing {', '.join(miss)} (translations/{loc}/chNN.json)" if miss else f"all {len(chs)} chapters"))
            name = ((s.get("i18n") or {}).get(loc) or {})   # the subject's name in it: its card, title and tagline (subject.json "i18n")
            lack = [k for k in ("title", "appTitle", "description") if s.get(k) and not name.get(k)]
            if lack: ok = False; L.append(f"{loc}: the subject's name is not translated — {', '.join(lack)} (subject.json \"i18n\": {{\"{loc}\": {{\"title\", \"description\", \"hero\", …}}}})")
        return ok, L + ["each is checked against its chapter by make_pack.py (step checks)"]
    if kind == "bridges":   # every pair (own language and each translation → en, el, ru, ar minus the language read), with enough of the content and everyday words
        r = subprocess.run([sys.executable, find("bridge.py"), "require", d], capture_output=True, text=True)
        return r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-20:]
    return False, [f"unknown local check {kind}"]

def run_check(d, sid, run):
    st = steps()[sid]; ck = st.get("check") or {}
    if "local" in ck: return local_check(ck["local"], d, run)
    if "run" in ck:
        v = vars_(d, run)
        with tempfile.TemporaryDirectory() as td:
            v["tmp"] = td
            cmd = [x.format(**v) for x in ck["run"]]
            if cmd[0] == "python3": cmd[0] = sys.executable
            try: r = subprocess.run(cmd, capture_output=True, text=True)
            except FileNotFoundError as e: return False, [f"cannot run {' '.join(cmd)}: {e}"]
        return r.returncode == 0, [" ".join(cmd)] + (r.stdout + r.stderr).strip().splitlines()[-20:]
    if "mcp" in ck: return False, [f"a connector step: call {ck['mcp']}, then: pipeline.py done {d} {sid} --note \"…\""]
    if "manual" in ck: return False, [f"a judgement: {ck['manual']} — then: pipeline.py done {d} {sid} --note \"…\""]
    return False, ["this step has no check"]

def load_run(d):
    run = rj(os.path.join(d, "run.json"))
    if not run: sys.exit(f"no run.json in {d}: python3 pipeline.py start FLOW {d}")
    return run

def save_run(d, run): json.dump(run, open(os.path.join(d, "run.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def states(d, run):
    """Each step's state; a done step whose files changed, and every step after it, becomes stale."""
    S = steps(); out = {}; stale = False
    for sid in flows()[run["flow"]]["steps"]:
        r = run["steps"].get(sid) or {}; st = S[sid]
        if st.get("gate") == "planned" and r.get("status") != "done": out[sid] = "planned"; continue
        s = r.get("status", "todo")
        if s == "done" and r.get("hashes") is not None and hashes(produced(d, st, run)) != r["hashes"]: s = "stale"
        if s == "done" and stale: s = "stale"
        if s == "stale": stale = True
        out[sid] = s
    return out

def main(a):
    if not a or a[0] in ("-h", "--help"): print(__doc__); return 0
    cmd = a[0]
    if cmd == "flows":
        for f in flows().values(): print(f"{f['id']:>3}  {f['title']} — {f['when']}\n     {' → '.join(f['steps'])}")
        return 0
    if cmd == "detect":
        fid, why = detect(a[1:])
        if not fid: print(why); return 1
        f = flows()[fid]; print(f"flow {fid}: {f['title']} ({why})\nsteps: {' → '.join(f['steps'])}\nnext: python3 pipeline.py start {fid} <dir>"); return 0
    if len(a) < 2: print(__doc__); return 1
    d = os.path.abspath(a[1])
    if cmd == "start":
        if len(a) < 3 or a[1] not in flows(): print("start FLOW DIR — flows: " + ", ".join(flows())); return 1
        fid, d = a[1], os.path.abspath(a[2]); os.makedirs(d, exist_ok=True)
        opt = lambda k: a[a.index(k) + 1] if k in a else None
        run = {"format": "noema.run/v1", "flow": fid, "started": now(), "vars": {k: opt("--" + k) for k in ("course", "lang", "locale") if opt("--" + k)},
               "steps": {"classify": {"status": "done", "at": now(), "note": "pipeline.py start " + fid}}}
        save_run(d, run); print(f"run.json → {d}\nflow {fid}: {' → '.join(flows()[fid]['steps'])}"); return 0
    run = load_run(d); S = steps()
    if cmd == "status":
        st = states(d, run); bad = False
        for sid, s in st.items():
            mark = {"done": "✓", "stale": "↻", "failed": "✗", "planned": "·"}.get(s, "○")
            print(f"{mark} {sid:<14} {s:<8} {S[sid]['title']}"); bad = bad or (s != "done" and S[sid].get("gate") == "strict")
        return 1 if bad else 0
    if cmd == "next":
        st = states(d, run)
        for sid, s in st.items():
            if s in ("done", "planned"): continue
            x = S[sid]; ck = x.get("check") or {}
            print(f"next: {sid} — {x['title']} ({s})\n{x['what']}\ndoc: {x.get('doc', '')}\ncheck: python3 pipeline.py " + ("check" if ("local" in ck or "run" in ck) else "done") + f" {a[1]} {sid}")
            return 0
        print("every step is done"); return 0
    if cmd in ("check", "done"):
        if len(a) < 3 or a[2] not in S: print("which step? " + ", ".join(flows()[run["flow"]]["steps"])); return 1
        sid = a[2]
        if sid not in flows()[run["flow"]]["steps"]: print(f"{sid} is not a step of flow {run['flow']}"); return 1
        st = states(d, run); before = flows()[run["flow"]]["steps"][:flows()[run["flow"]]["steps"].index(sid)]
        miss = [n for n in S[sid].get("needs", []) if n in before and st.get(n) not in ("done", "planned")]
        if miss: print(f"first: {', '.join(miss)}"); return 1
        if cmd == "done":
            ck = S[sid].get("check") or {}
            if "local" in ck or "run" in ck: print(f"{sid} is checked by its command: python3 pipeline.py check {a[1]} {sid}"); return 1
            note = a[a.index("--note") + 1] if "--note" in a else ""
            if not note.strip(): print("--note: what was done (the connector's answer, or what you checked)"); return 1
            run["steps"][sid] = {"status": "done", "at": now(), "note": note}; save_run(d, run); print(f"✓ {sid}"); return 0
        ok, lines = run_check(d, sid, run)
        for l in lines: print("  " + l)
        run["steps"][sid] = {"status": "done" if ok else "failed", "at": now(), **({"hashes": hashes(produced(d, S[sid], run))} if ok else {})}
        save_run(d, run); print(("✓ " if ok else "✗ ") + sid); return 0 if ok else 1
    print(__doc__); return 1

if __name__ == "__main__": sys.exit(main(sys.argv[1:]))
