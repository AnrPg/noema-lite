"""Interactive activities in packs (docs/INTERACTIVE.md, docs/adr/001-interactive-activities.md): the Python half of the checks.
The SAME rules as engine/packcheck.js checkActivities (tests/activities.js runs both on the same fixtures).

  load_activities(subject_dir) → (registry | None, problems)   activities/activities.json + every bundle and string table
  check_activities(pack) → (errors, warnings)                   the registry, its references from blocks / sim exercises, pack.requires
  lint_html(html) → (errors, warnings)                         what a mini-app (html-app@1) may not contain

In the subject folder:
  activities/activities.json            {"format": "noema.activities/v1", "items": [{id, runtime, entry, stateVersion, fallback, …}]}
  activities/<id>/app.html              the bundle of an html-app@1 activity (entry)
  activities/<id>/spec.json             the spec of a sim-spec@1 activity (entry): data the app's own engines run, no code
  activities/<id>/strings.<locale>.json the activity's words, one file per language, the same keys in each
In the pack (make_pack.py): pack.activities = {"format", "items": [{…, "html": <the bundle>, "sha256", "bytes" | "spec": {…}, "strings": {locale: {key: text}}}]}
and pack.requires = ["activities/v1", "runtime:<id>", "engine:<id>" (an engine other than formula@1), …]. Everything is inline, like the
pictures (ADR D2).
  check_spec(spec, tables) → errors                           a sim-spec@1 spec (docs/INTERACTIVE.md §12): shape, limits, names,
                                                               every expression (simexpr.check), the engine, the string keys"""
import glob, hashlib, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simexpr as SX   # the expression language of sim-spec@1 (docs/INTERACTIVE_SIMEXPR.md), twin of engine/src/35_simexpr.js

FORMAT = "noema.activities/v1"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,60}$")
KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9_.-]{0,63}$")
LOCALE_RE = re.compile(r"^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$")
RUNTIMES = {"html-app@1", "sim-spec@1"}                     # runtimes this version runs
LATER = {"py-module@1": "P4", "h5p@1": "P4b"}               # known, arriving in a later version (docs/adr/001 §7)
CAPS = {"state", "events", "resize", "result", "hints", "announce"}
GRADE_MODES = {"reported", "checks"}
CHECKS_RUNTIMES = {"sim-spec@1"}                            # runtimes whose values the app can see (the checks grader needs them)
# sim-spec@1 (docs/INTERACTIVE.md §12): the SAME rules as engine/packcheck.js checkSimSpec
SPEC_FORMAT = "noema.sim-spec/v1"
DEFAULT_ENGINE = "formula@1"
ENGINES = {"formula@1"}                                     # the engines this version knows (P3 adds circuit-mna@1, in both twins)
SPEC_KEYS = {"format", "engine", "model", "title", "intro", "consts", "params", "derived", "outputs", "readouts", "plots"}
SPEC_LIM = {"params": 24, "consts": 24, "derived": 48, "outputs": 24, "readouts": 24, "plots": 6, "series": 6, "marks": 8,
            "points": 2000, "options": 12, "checks": 16, "bytes": 64 * 1024, "unit": 16, "digits": 8}
NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,31}$")
PARAM_KINDS = ("slider", "number", "toggle", "choice")
NUM_FORMATS = ("auto", "si", "fixed")
HTML_MAX, HTML_WARN = 512 * 1024, 256 * 1024
FALLBACK_MIN = 40
HINTS_MAX = 6

# what a mini-app may not contain (it would not work anyway: the frame's CSP and sandbox block it) — the same list as packcheck.js
HTML_BANNED = [
    (r"<script[^>]*\bsrc\s*=", "an external script (<script src>): put every script inline"),
    (r"""(?:\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?//)""", "a link to the network (src/href to http(s):// or //): put everything inline (data: URIs)"),
    (r"""url\(\s*["']?\s*(?:https?:)?//""", "a CSS url() to the network: use data: URIs"),
    (r"@import\b", "a CSS @import: put every style inline"),
    (r"""<[a-z][^>]*\son[a-z]+\s*=""", "an inline event handler (onclick=…): use addEventListener in a script"),
    (r"javascript:", "a javascript: URL"),
    (r"\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b", "a network call (fetch, XHR, WebSocket, EventSource, sendBeacon): an activity has no network"),
    (r"\bimportScripts\b|\bnew\s+(?:Shared)?Worker\b", "a worker: an html-app has none (numerical work goes to a later runtime)"),
    (r"\beval\s*\(|\bnew\s+Function\b|\bsetTimeout\s*\(\s*['\"`]|\bsetInterval\s*\(\s*['\"`]", "code made from text (eval, new Function, setTimeout(\"…\"))"),
    (r"\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b", "browser storage: save with noema.saveState(…)"),
    (r"\bwindow\.open\b|\bwindow\.top\b|\btop\.location\b|\bparent\.|\bopener\b", "a popup or the page around the frame: an activity stays in its frame"),
    (r"\bpostMessage\s*\(", "raw postMessage: talk to the app through window.noema"),
    (r"allow-same-origin", "allow-same-origin: never"),
    (r"<meta[^>]+http-equiv", "a <meta http-equiv>: the app sets the policy"),
    (r"<base\b", "a <base> element"),
    (r"<(?:iframe|frame|object|embed|form)\b", "a frame, object, embed or form: not available in an activity"),
]
HTML_WARNINGS = [
    (r"while\s*\(\s*(?:true|1|!0)\s*\)", "while (true): every loop is stopped after 1.5 s without a pause; use requestAnimationFrame or setTimeout for a loop that never ends"),
    (r"setInterval\s*\([^,]+,\s*0\s*\)", "setInterval(…, 0): use requestAnimationFrame"),
    (r"new\s+Array\s*\(\s*\d{7,}", "a huge array"),
]
_TAGS = re.compile(r"<(script|style)[^>]*>.*?</\1\s*>", re.S | re.I)

def _s(x): return isinstance(x, str) and x.strip() != ""

def visible_text(html):
    """the words of the body outside scripts and styles (an activity's words belong in its string tables)"""
    body = html.split("<body", 1)[1] if "<body" in html else html
    t = re.sub(r"<[^>]+>", " ", _TAGS.sub(" ", body))
    t = re.sub(r"&[a-z#0-9]+;", " ", t)
    return [w for w in re.findall(r"[^\W\d_]{2,}", t)]

def lint_html(html):
    E, W = [], []
    if not isinstance(html, str) or not html.strip(): return ["the bundle is empty"], W
    n = len(html.encode("utf-8"))
    if n > HTML_MAX: E.append(f"the bundle is {n // 1024} KB (at most {HTML_MAX // 1024} KB)")
    elif n > HTML_WARN: W.append(f"the bundle is {n // 1024} KB (aim for <= {HTML_WARN // 1024} KB)")
    for pat, why in HTML_BANNED:
        m = re.search(pat, html, re.I)
        if m: E.append(f"{why} — found “{m.group(0)[:40]}”")
    for pat, why in HTML_WARNINGS:
        if re.search(pat, html, re.I): W.append(why)
    words = visible_text(html)
    if len(words) >= 3: W.append(f"visible text in the HTML (“{' '.join(words[:6])}…”): put every word in the string tables and show it with noema.t(key)")
    return E, W

def sha256(text): return hashlib.sha256(text.encode("utf-8")).hexdigest()

def load_activities(sdir):
    """activities/ of a subject folder → (registry for the pack, problems). Bundles and string tables are read in."""
    p = os.path.join(sdir, "activities", "activities.json")
    if not os.path.exists(p): return None, []
    probs = []
    try: reg = json.load(open(p, encoding="utf-8"))
    except Exception as e: return None, [f"ERROR activities/activities.json: {e}"]
    items = []
    for a in reg.get("items") or []:
        a = dict(a); aid = a.get("id", "?")
        entry = a.get("entry")
        if a.get("runtime") == "html-app@1":
            f = os.path.join(sdir, entry) if _s(entry) else None
            if not f or not os.path.exists(f): probs.append(f"ERROR activity {aid}: entry {entry!r} not found"); a["html"] = ""
            else: a["html"] = open(f, encoding="utf-8", newline="").read()
            a["sha256"] = sha256(a["html"]); a["bytes"] = len(a["html"].encode("utf-8"))
        elif a.get("runtime") == "sim-spec@1":
            if not _s(entry): entry = a["entry"] = f"activities/{aid}/spec.json"
            f = os.path.join(sdir, entry)
            if not os.path.exists(f): probs.append(f"ERROR activity {aid}: entry {entry!r} not found")
            else:
                try: a["spec"] = json.load(open(f, encoding="utf-8"))
                except Exception as e: probs.append(f"ERROR activity {aid}: {entry}: {e}")
        tables = {}
        pat = ((a.get("strings") or {}).get("file") if isinstance(a.get("strings"), dict) else None) or f"activities/{aid}/strings.{{locale}}.json"
        pre, suf = os.path.basename(pat).split("{locale}", 1) if "{locale}" in pat else (os.path.basename(pat), "")
        for f in sorted(glob.glob(os.path.join(sdir, pat.replace("{locale}", "*")))):
            name = os.path.basename(f); loc = name[len(pre):len(name) - len(suf)]
            try: tables[loc] = json.load(open(f, encoding="utf-8"))
            except Exception as e: probs.append(f"ERROR activity {aid}: {os.path.relpath(f, sdir)}: {e}")
        a["strings"] = tables
        items.append(a)
    return {"format": reg.get("format"), "items": items}, probs

def _engine_of(a):
    """the engine a sim-spec@1 activity names (None for other runtimes, or a spec that names none that is a text)"""
    if not isinstance(a, dict) or a.get("runtime") != "sim-spec@1" or not isinstance(a.get("spec"), dict): return None
    e = a["spec"].get("engine", DEFAULT_ENGINE)
    return e if isinstance(e, str) else None

def need_requires(items):
    """what pack.requires must list for these activities: the core, each runtime, each engine other than formula@1 (the built-in one)"""
    items = [a for a in items if isinstance(a, dict)]
    if not items: return []
    rts = sorted({"runtime:" + a["runtime"] for a in items if isinstance(a.get("runtime"), str)})
    engs = sorted({"engine:" + e for e in (_engine_of(a) for a in items) if e and e != DEFAULT_ENGINE})
    return ["activities/v1"] + rts + engs

def requires(reg):
    """pack.requires for a registry: the core + each runtime and engine it uses (the app reloads to a newer build, or falls back, when it lacks one)"""
    return need_requires((reg or {}).get("items") or []) if reg and reg.get("items") else []

def fallback_media(reg):
    """the pictures the activities show when they cannot run (they need no exercises of their own)"""
    return {(a.get("fallback") or {}).get("media") for a in (reg or {}).get("items") or [] if isinstance(a, dict) and isinstance(a.get("fallback"), dict)} - {None}

def hash_part(reg):
    """what of the activities goes into pack.version: each bundle's sha256, its strings and its settings"""
    return {a.get("id"): {k: v for k, v in a.items() if k != "html"} for a in (reg or {}).get("items") or [] if isinstance(a, dict)}

def check_activities(pack, translations=None):
    """→ (errors, warnings) of pack.activities, the blocks and sim exercises that use them, and pack.requires.
    translations: the locales the pack has (default: pack.translations); each activity needs its words in each."""
    E, W = [], []
    reg = pack.get("activities"); media = pack.get("media") or {}
    subject = pack.get("subject") or {}; own = subject.get("language") or "en"
    locs = sorted(set([own] + list(translations if translations is not None else (pack.get("translations") or {}).keys())))
    items = {}
    if reg is not None:
        if not isinstance(reg, dict) or reg.get("format") != FORMAT: E.append(f'activities: format must be "{FORMAT}"')
        for a in (reg.get("items") if isinstance(reg, dict) else None) or []:
            aid = a.get("id") if isinstance(a, dict) else None
            if not isinstance(aid, str) or not ID_RE.match(aid): E.append(f"activity {aid!r}: id must be lower-case letters, digits and - (2–61)"); continue
            if aid in items: E.append(f"activity {aid}: duplicate id"); continue
            items[aid] = a; w = f"activity {aid}"
            rt = a.get("runtime")
            if rt in LATER: E.append(f"{w}: runtime {rt} arrives in a later version of the app ({LATER[rt]}); use html-app@1 or sim-spec@1 for now")
            elif rt not in RUNTIMES: E.append(f"{w}: unknown runtime {rt!r} (one of {', '.join(sorted(RUNTIMES))})")
            if not (isinstance(a.get("stateVersion"), int) and a["stateVersion"] >= 1): E.append(f"{w}: stateVersion must be a whole number >= 1")
            caps = a.get("capabilities") or []
            if not isinstance(caps, list) or any(c not in CAPS for c in caps): E.append(f"{w}: capabilities must be some of {', '.join(sorted(CAPS))}")
            fb = a.get("fallback") if isinstance(a.get("fallback"), dict) else {}
            if not (_s(fb.get("text")) and len(fb["text"].strip()) >= FALLBACK_MIN): E.append(f"{w}: fallback.text (>= {FALLBACK_MIN} characters: what the activity shows and teaches) is required")
            if not _s(fb.get("media")): E.append(f"{w}: fallback.media (a still picture in media/) is required")
            elif fb["media"] not in media: E.append(f"{w}: fallback.media {fb['media']!r} is not a picture of the pack")
            if rt == "html-app@1":
                html = a.get("html")
                if not isinstance(html, str): E.append(f"{w}: the bundle (html) is missing")
                else:
                    le, lw = lint_html(html); E += [f"{w}: {m}" for m in le]; W += [f"{w}: {m}" for m in lw]
                    if a.get("sha256") is not None and a.get("sha256") != sha256(html): E.append(f"{w}: sha256 does not match the bundle")
                    if a.get("bytes") is not None and a.get("bytes") != len(html.encode("utf-8")): E.append(f"{w}: bytes does not match the bundle")
            elif rt == "sim-spec@1":
                if "spec" not in a: E.append(f"{w}: the spec (activities/{aid}/spec.json) is missing")
                else: E += [f"{w}: {m}" for m in check_spec(a["spec"], a.get("strings") if isinstance(a.get("strings"), dict) else None)]
            st = a.get("strings")
            if not isinstance(st, dict) or not st: E.append(f"{w}: strings {{locale: {{key: text}}}} are required (an activity shows no words of its own)")
            else:
                keys = None
                for loc, tab in st.items():
                    if not LOCALE_RE.match(str(loc)): E.append(f"{w}: strings: {loc!r} is not a locale"); continue
                    if not isinstance(tab, dict) or not all(isinstance(k, str) and KEY_RE.match(k) and _s(v) for k, v in tab.items()): E.append(f"{w}: strings.{loc} must map keys (a-z, digits, . _ -) to non-empty texts"); continue
                    if keys is None: keys = (loc, set(tab))
                    elif set(tab) != keys[1]:
                        d = sorted(keys[1] ^ set(tab))[:5]; E.append(f"{w}: strings.{loc} and strings.{keys[0]} have different keys ({', '.join(d)})")
                for loc in locs:
                    if loc not in st: E.append(f"{w}: strings for {loc} are missing (the pack is read in {', '.join(locs)})")
            for k in ("origin", "credit", "license"):
                if k in a and not isinstance(a[k], str): E.append(f"{w}: {k} must be a text")
    used = set()
    for c in pack.get("chapters") or []:
        for sec in c.get("sections") or []:
            for i, b in enumerate(sec.get("blocks") or []):
                if b.get("t") != "interactive": continue
                used.add(b.get("activity")); E += [f"{sec.get('id')} block {i}: {m}" for m in check_block(b, items)]
        for e in c.get("exercises") or []:
            if e.get("type") != "sim": continue
            used.add(e.get("activity")); E += [f"{e.get('id')}: {m}" for m in check_sim(e, items)]
    for aid in items:
        if aid not in used: W.append(f"activity {aid}: not used by any interactive block or sim exercise")
    if items:
        req = pack.get("requires") or []
        need = need_requires(list(items.values()))
        miss = [x for x in need if x not in req]
        if miss: E.append(f"pack.requires must list {', '.join(miss)} (make_pack.py writes it)")
    return E, W

def check_block(b, items):
    E = []
    if b.get("activity") not in items: E.append(f"interactive: activity {b.get('activity')!r} is not in pack.activities")
    hgt = b.get("height")
    if hgt is not None and hgt != "auto" and not (isinstance(hgt, int) and 120 <= hgt <= 2000): E.append('interactive: height is "auto" or 120–2000 (px)')
    if b.get("aspect") is not None and not (isinstance(b["aspect"], str) and re.fullmatch(r"\d{1,2}:\d{1,2}", b["aspect"])): E.append('interactive: aspect is like "16:9"')
    if b.get("caption") is not None and not isinstance(b["caption"], str): E.append("interactive: caption must be a text")
    return E

def check_sim(e, items):
    """a sim exercise's own fields (q, explain, difficulty … are checked with every exercise)"""
    E = []
    if e.get("activity") not in items: E.append(f"activity {e.get('activity')!r} is not in pack.activities")
    a = items.get(e.get("activity")) if isinstance(e.get("activity"), str) else None
    a = a if isinstance(a, dict) else None
    rt = a.get("runtime") if a else None
    spec = a.get("spec") if a and rt == "sim-spec@1" and isinstance(a.get("spec"), dict) else None
    g = e.get("grade")
    if not isinstance(g, dict) or g.get("mode") not in GRADE_MODES: E.append('grade must be {"mode": "reported"} (the activity reports its result) or {"mode": "checks", "checks": [{"expr": …}]} (sim-spec@1)')
    else:
        if g.get("pass") is not None and not (_num(g["pass"]) and 0 < g["pass"] <= 1): E.append("grade.pass must be a number in (0, 1]")
        if g["mode"] == "reported" and rt == "sim-spec@1": E.append('a sim-spec@1 activity reports nothing itself: grade it with {"mode": "checks", "checks": […]}')
        if g["mode"] == "checks":
            if rt is not None and not (isinstance(rt, str) and rt in CHECKS_RUNTIMES): E.append(f'grade.mode "checks" needs an activity whose values the app can see (sim-spec@1); {rt} reports its own result: use "reported"')
            cs = g.get("checks")
            if not (isinstance(cs, list) and 1 <= len(cs) <= SPEC_LIM["checks"]): E.append(f"grade.checks must be a list of 1–{SPEC_LIM['checks']} checks {{expr, label?, weight?}}")
            else:
                names = spec_names(spec) if spec is not None else None
                tables = a.get("strings") if a and isinstance(a.get("strings"), dict) else {}
                for i, c in enumerate(cs):
                    w = f"grade.checks[{i}]"
                    if not isinstance(c, dict): E.append(f"{w} must be an object {{expr, label?, weight?}}"); continue
                    m = _expr_problem(c.get("expr"), names, w + ".expr")
                    if m: E.append(m)
                    if c.get("weight") is not None and not (_num(c["weight"]) and c["weight"] > 0): E.append(f"{w}.weight must be a number > 0")
                    if c.get("label") is not None:
                        if not (isinstance(c["label"], str) and KEY_RE.match(c["label"])): E.append(f"{w}.label must be a key of the activity's string tables")
                        else:
                            miss = sorted(l for l, t in tables.items() if isinstance(t, dict) and c["label"] not in t)
                            if miss: E.append(f"{w}.label: the string {c['label']} is missing in strings.{', strings.'.join(miss)}")
    t = e.get("task")
    if t is not None:
        if not isinstance(t, dict): E.append("task must be an object {seed, params}")
        else:
            sd = t.get("seed", "auto")
            if not (sd == "auto" or (isinstance(sd, int) and not isinstance(sd, bool) and sd >= 0)): E.append('task.seed is "auto" (a new one each attempt) or a whole number')
            if t.get("params") is not None and not isinstance(t["params"], dict): E.append("task.params must be an object")
            elif spec is not None and t.get("params"):
                consts = spec.get("consts") if isinstance(spec.get("consts"), dict) else {}
                for k, v in t["params"].items():
                    if k not in consts: E.append(f"task.params.{k}: not a constant of the spec (a sim-spec@1 task sets only the spec's consts)")
                    elif not _num(v): E.append(f"task.params.{k} must be a number")
    h = e.get("hints")
    if h is not None and not (isinstance(h, list) and len(h) <= HINTS_MAX and all(_s(x) for x in h)): E.append(f"hints must be a list of at most {HINTS_MAX} texts")
    if e.get("reveal") is not None and not _s(e.get("reveal")): E.append("reveal must be a text")
    return E

# ---------------------------------------------------------------- sim-spec@1 (docs/INTERACTIVE.md §12)
def _num(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
def _list(v): return v if isinstance(v, list) else []

def _expr_problem(src, names, where):
    """None, or the first problem of an expression (simexpr.check; names None = not checked)"""
    if not isinstance(src, str) or not src.strip(): return f"{where}: an expression (a text such as “2*x + 1”) is required"
    p = SX.check(src, vars=names)
    return f"{where}: {p[0]['msg']} in “{src[:60]}”" if p else None

def spec_names(spec):
    """the scalar names an expression of the spec may use, in order: consts, params, derived, the engine's scalar outputs"""
    if not isinstance(spec, dict): return []
    out = [k for k in spec["consts"]] if isinstance(spec.get("consts"), dict) else []
    for k in ("params", "derived"): out += [x["id"] for x in _list(spec.get(k)) if isinstance(x, dict) and isinstance(x.get("id"), str)]
    out += [x["id"] for x in _list(spec.get("outputs")) if isinstance(x, dict) and isinstance(x.get("id"), str) and x.get("kind") == "scalar"]
    return out

def check_spec(spec, tables=None, engines=None):
    """→ errors of a sim-spec@1 spec. tables: {locale: {key: text}} (every label key must be in each); engines: the known engine ids."""
    E = []
    if not isinstance(spec, dict): return ["spec: a JSON object is required (activities/<id>/spec.json)"]
    if len(json.dumps(spec, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > SPEC_LIM["bytes"]: E.append(f"spec: at most {SPEC_LIM['bytes'] // 1024} KB")
    if spec.get("format") != SPEC_FORMAT: E.append(f'spec: format must be "{SPEC_FORMAT}"')
    for k in sorted(set(spec) - SPEC_KEYS): E.append(f"spec: unknown field {k!r}")
    eng = spec.get("engine", DEFAULT_ENGINE); known = ENGINES if engines is None else set(engines)
    if not isinstance(eng, str) or eng not in known: E.append(f"spec: unknown engine {eng!r} (this version knows {', '.join(sorted(known))})")
    if eng == DEFAULT_ENGINE and "model" in spec: E.append("spec: model configures another engine; formula@1 has none")
    if spec.get("model") is not None and not isinstance(spec["model"], dict): E.append("spec: model must be an object")
    keys = set(); seen = set()
    def key(k, where, need=False):
        if k is None and not need: return
        if not (isinstance(k, str) and KEY_RE.match(k)): E.append(f"{where} must be a key of the activity's string tables"); return
        keys.add(k)
    def name(n, where):
        if not (isinstance(n, str) and NAME_RE.match(n)) or n in SX.CONSTS or SX.check(n):
            E.append(f"{where}: {n!r} is not a usable name (a letter or _, then letters, digits, _; not pi, e or a reserved word)"); return False
        if n in seen: E.append(f"{where}: the name {n} is used twice"); return False
        seen.add(n); return True
    def expr(src, names, where):
        m = _expr_problem(src, names, where)
        if m: E.append(m)
    def numfmt(o, where):
        if o.get("unit") is not None and not (isinstance(o["unit"], str) and len(o["unit"]) <= SPEC_LIM["unit"]): E.append(f"{where}.unit must be a text of at most {SPEC_LIM['unit']} characters")
        if o.get("format") is not None and o["format"] not in NUM_FORMATS: E.append(f"{where}.format is one of {', '.join(NUM_FORMATS)}")
        if o.get("digits") is not None and not (isinstance(o["digits"], int) and not isinstance(o["digits"], bool) and 1 <= o["digits"] <= SPEC_LIM["digits"]): E.append(f"{where}.digits is a whole number 1–{SPEC_LIM['digits']}")
    key(spec.get("title"), "spec.title"); key(spec.get("intro"), "spec.intro")
    c = spec.get("consts")
    if c is not None:
        if not (isinstance(c, dict) and len(c) <= SPEC_LIM["consts"]): E.append(f"spec.consts must be an object of at most {SPEC_LIM['consts']} numbers")
        else:
            for k, v in c.items():
                if name(k, "spec.consts") and not _num(v): E.append(f"spec.consts.{k} must be a number")
    ps = spec.get("params")
    if not (isinstance(ps, list) and 1 <= len(ps) <= SPEC_LIM["params"]): E.append(f"spec.params must be a list of 1–{SPEC_LIM['params']} controls")
    for i, p in enumerate(_list(ps)[:SPEC_LIM["params"]]):
        w = f"spec.params[{i}]"
        if not isinstance(p, dict): E.append(f"{w} must be an object"); continue
        name(p.get("id"), w + ".id"); key(p.get("label"), w + ".label", True)
        kd = p.get("kind")
        if kd not in PARAM_KINDS: E.append(f"{w}.kind is one of {', '.join(PARAM_KINDS)}"); continue
        if kd in ("slider", "number"):
            lo, hi, df = p.get("min"), p.get("max"), p.get("default")
            if not (_num(lo) and _num(hi) and lo < hi): E.append(f"{w}: min and max must be numbers, min < max"); continue
            if p.get("step") is not None and not (_num(p["step"]) and p["step"] > 0): E.append(f"{w}.step must be a number > 0")
            if not (_num(df) and lo <= df <= hi): E.append(f"{w}.default must be a number from min to max")
            if p.get("scale") is not None and p["scale"] not in ("lin", "log"): E.append(f"{w}.scale is lin or log")
            elif p.get("scale") == "log" and lo <= 0: E.append(f"{w}: a log scale needs min > 0")
            numfmt(p, w)
        elif kd == "toggle":
            if p.get("default") is not None and not isinstance(p["default"], bool): E.append(f"{w}.default must be true or false")
        else:
            ops = p.get("options")
            if not (isinstance(ops, list) and 2 <= len(ops) <= SPEC_LIM["options"]): E.append(f"{w}.options must be a list of 2–{SPEC_LIM['options']} {{value, label}}"); continue
            vals = []
            for j, o in enumerate(ops):
                if not (isinstance(o, dict) and _num(o.get("value"))): E.append(f"{w}.options[{j}] needs a number value"); continue
                key(o.get("label"), f"{w}.options[{j}].label", True); vals.append(o["value"])
            if len(set(vals)) != len(vals): E.append(f"{w}.options: two options have the same value")
            if p.get("default") is not None and p["default"] not in vals: E.append(f"{w}.default must be the value of one of the options")
    names = sorted(seen)   # consts and params (the order does not matter to a check)
    ds = spec.get("derived")
    if ds is not None and not (isinstance(ds, list) and len(ds) <= SPEC_LIM["derived"]): E.append(f"spec.derived must be a list of at most {SPEC_LIM['derived']} {{id, expr}}")
    for i, d in enumerate(_list(ds)[:SPEC_LIM["derived"]]):
        w = f"spec.derived[{i}]"
        if not isinstance(d, dict): E.append(f"{w} must be an object {{id, expr}}"); continue
        expr(d.get("expr"), list(names), w + ".expr")
        if name(d.get("id"), w + ".id"): names.append(d["id"])
    os_ = spec.get("outputs"); series = []
    if os_ is not None:
        if eng == DEFAULT_ENGINE: E.append("spec.outputs come from an engine; formula@1 has none (use derived)")
        elif not (isinstance(os_, list) and len(os_) <= SPEC_LIM["outputs"]): E.append(f"spec.outputs must be a list of at most {SPEC_LIM['outputs']} {{id, kind}}")
        else:
            for i, o in enumerate(os_):
                w = f"spec.outputs[{i}]"
                if not (isinstance(o, dict) and o.get("kind") in ("scalar", "series")): E.append(f"{w} must be {{id, kind: scalar | series}}"); continue
                if name(o.get("id"), w + ".id"): (names if o["kind"] == "scalar" else series).append(o["id"])
    rs = spec.get("readouts")
    if rs is not None and not (isinstance(rs, list) and len(rs) <= SPEC_LIM["readouts"]): E.append(f"spec.readouts must be a list of at most {SPEC_LIM['readouts']} {{label, expr}}")
    for i, r in enumerate(_list(rs)[:SPEC_LIM["readouts"]]):
        w = f"spec.readouts[{i}]"
        if not isinstance(r, dict): E.append(f"{w} must be an object {{label, expr}}"); continue
        key(r.get("label"), w + ".label", True); expr(r.get("expr"), names, w + ".expr"); numfmt(r, w)
    pl = spec.get("plots")
    if pl is not None and not (isinstance(pl, list) and len(pl) <= SPEC_LIM["plots"]): E.append(f"spec.plots must be a list of at most {SPEC_LIM['plots']} plots")
    for i, p in enumerate(_list(pl)[:SPEC_LIM["plots"]]):
        w = f"spec.plots[{i}]"
        if not isinstance(p, dict) or p.get("kind") not in ("function", "series"): E.append(f"{w} must be a plot {{kind: function | series, x, y, series}}"); continue
        key(p.get("title"), w + ".title")
        x = p.get("x") if isinstance(p.get("x"), dict) else None
        y = p.get("y") if p.get("y") is not None else {}
        if x is None: E.append(f"{w}.x must be an object"); continue
        if not isinstance(y, dict): E.append(f"{w}.y must be an object"); continue
        for ax, o in (("x", x), ("y", y)):
            key(o.get("label"), f"{w}.{ax}.label"); numfmt(o, f"{w}.{ax}")
            if o.get("scale") is not None and o["scale"] not in ("lin", "log"): E.append(f"{w}.{ax}.scale is lin or log")
            for b in ("min", "max"):
                v = o.get(b)
                if v is None: continue
                if isinstance(v, str): expr(v, names, f"{w}.{ax}.{b}")
                elif not _num(v): E.append(f"{w}.{ax}.{b} must be a number or an expression")
            if _num(o.get("min")) and _num(o.get("max")) and not o["min"] < o["max"]: E.append(f"{w}.{ax}: min must be below max")
            if o.get("scale") == "log" and _num(o.get("min")) and o["min"] <= 0: E.append(f"{w}.{ax}: a log scale needs min > 0")
        local = list(names)
        if p["kind"] == "function":
            xv = x.get("var")
            if not (isinstance(xv, str) and NAME_RE.match(xv)) or xv in SX.CONSTS or SX.check(xv) or xv in seen: E.append(f"{w}.x.var: {xv!r} must be a new name for the x axis (not one of the spec's names)")
            else: local.append(xv)
            if x.get("min") is None or x.get("max") is None: E.append(f"{w}.x needs min and max")
            pts = p.get("points")
            if pts is not None and not (isinstance(pts, int) and not isinstance(pts, bool) and 2 <= pts <= SPEC_LIM["points"]): E.append(f"{w}.points is a whole number 2–{SPEC_LIM['points']}")
        elif x.get("series") not in series: E.append(f"{w}.x.series must name a series output of the engine")
        ss = p.get("series")
        if not (isinstance(ss, list) and 1 <= len(ss) <= SPEC_LIM["series"]): E.append(f"{w}.series must be a list of 1–{SPEC_LIM['series']} lines"); ss = []
        for j, s in enumerate(ss):
            ws = f"{w}.series[{j}]"
            if not isinstance(s, dict): E.append(f"{ws} must be an object"); continue
            key(s.get("label"), ws + ".label")
            if p["kind"] == "function": expr(s.get("expr"), local, ws + ".expr")
            elif s.get("y") not in series: E.append(f"{ws}.y must name a series output of the engine")
        mk = p.get("marks")
        if mk is not None and not (isinstance(mk, list) and len(mk) <= SPEC_LIM["marks"]): E.append(f"{w}.marks must be a list of at most {SPEC_LIM['marks']} {{axis, expr}}"); mk = []
        for j, m in enumerate(_list(mk)):
            wm = f"{w}.marks[{j}]"
            if not (isinstance(m, dict) and m.get("axis") in ("x", "y")): E.append(f"{wm} must be {{axis: x | y, expr, label?}}"); continue
            key(m.get("label"), wm + ".label"); expr(m.get("expr"), names, wm + ".expr")
    if tables:
        for k in sorted(keys):
            miss = sorted(l for l, t in tables.items() if isinstance(t, dict) and k not in t)
            if miss: E.append(f"spec: the string {k} is missing in strings.{', strings.'.join(miss)}")
    return E
