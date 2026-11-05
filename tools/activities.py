"""Interactive activities in packs (docs/INTERACTIVE.md, docs/adr/001-interactive-activities.md): the Python half of the checks.
The SAME rules as engine/packcheck.js checkActivities (tests/activities.js runs both on the same fixtures).

  load_activities(subject_dir) → (registry | None, problems)   activities/activities.json + every bundle and string table
  check_activities(pack) → (errors, warnings)                   the registry, its references from blocks / sim exercises, pack.requires
  lint_html(html) → (errors, warnings)                         what a mini-app (html-app@1) may not contain
  lint_python(src, packages) → (errors, warnings)              what the Python of a py-module@1 activity may not do (docs/INTERACTIVE_PYTHON.md)

In the subject folder:
  activities/activities.json            {"format": "noema.activities/v1", "items": [{id, runtime, entry, stateVersion, fallback, …}]}
  activities/<id>/app.html              the bundle of an html-app@1 activity (entry)
  activities/<id>/spec.json             the spec of a sim-spec@1 activity (entry): data the app's own engines run, no code
  activities/<id>/main.py               the Python of a py-module@1 activity (entry), with its spec.json beside it (no engine: step() computes)
  activities/<id>/strings.<locale>.json the activity's words, one file per language, the same keys in each
  activities/<id>/item.h5p              the package of an h5p@1 activity (entry): it travels BESIDE the pack (docs/INTERACTIVE_H5P.md),
                                        the registry keeps its sha256 and bytes
  activities/<id>/content.<locale>.json its content.json in another language (inline in the pack: h5pByLocale.<locale>.content)
In the pack (make_pack.py): pack.activities = {"format", "items": [{…, "html": <the bundle>, "sha256", "bytes" | "spec": {…} | "python": <main.py>, "sha256", "bytes", "spec", "strings": {locale: {key: text}}}]}
and pack.requires = ["activities/v1", "runtime:<id>", "engine:<id>" (an engine other than formula@1), …]. Everything is inline, like the
pictures (ADR D2).
  check_spec(spec, tables) → errors                           a sim-spec@1 spec (docs/INTERACTIVE.md §12): shape, limits, names,
                                                               every expression (simexpr.check), the engine, the string keys
  check_h5p_packages(pack, bytes_of) → (errors, warnings)     the .h5p files of the h5p@1 items (sha256, bytes, tools/h5p_check.py),
                                                               twin of NoemaPackCheck.checkActivityPackages"""
import base64, glob, hashlib, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simexpr as SX   # the expression language of sim-spec@1 (docs/INTERACTIVE_SIMEXPR.md), twin of engine/src/35_simexpr.js
import circuit as CK   # the netlist checks of circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md), twin of engine/src/36_engine_circuit.js
import thermal, pid, rf, twin   # the model checks of the P6 engines (docs/INTERACTIVE_ENGINES.md), twins of engine/src/39–42_engine_*.js
import wasm_check as WK   # wasm-module@1 (docs/INTERACTIVE_WASM.md), twin of engine/src/44_activity_wasm.js
import embed_check as EK   # external-embed@1 (docs/INTERACTIVE_EMBED.md), twin of engine/src/45_activity_embed.js
import h5p_check as H5   # the package rules of h5p@1 (tools/h5p_allow.json), twin of NoemaH5P.check (engine/src/38_activity_h5p.js)

FORMAT = "noema.activities/v1"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,60}$")
KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9_.-]{0,63}$")
LOCALE_RE = re.compile(r"^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$")
RUNTIMES = {"html-app@1", "sim-spec@1", "py-module@1", "h5p@1"}  # runtimes this version runs
LATER = {}                                                  # known, arriving in a later version (docs/adr/001 §7)
CAPS = {"state", "events", "resize", "result", "hints", "announce"}
GRADE_MODES = {"reported", "checks"}
CHECKS_RUNTIMES = {"sim-spec@1", "py-module@1"}             # runtimes whose values the app can see (the checks grader needs them)
SPEC_RUNTIMES = {"sim-spec@1", "py-module@1"}               # runtimes the app draws from a spec (py-module@1: its outputs come from Python's step())
H5P = "h5p@1"                                               # an ordinary .h5p package played by the app's own H5P player (docs/INTERACTIVE_H5P.md)
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
H5P_MAX = 100 * 1024 * 1024                                 # the .h5p file (tools/h5p_allow.json files.maxBytes is the unpacked limit)
# py-module@1 (docs/INTERACTIVE_PYTHON.md): Python with numpy, scipy and the allow-listed extras — the same lists in engine/packcheck.js;
# PY_EXTRAS = the names of tools/pywheels_allow.json (tests/activities.js checks that they agree)
PY = "py-module@1"
PY_BASE = ["numpy", "scipy"]
PY_EXTRAS = ["quantiphy"]
PY_MAX = 256 * 1024
PY_STEP = (100, 10000)
PY_PACKAGES_MAX = 12
PY_BANNED = [
    (r"^\s*(?:import\s+js\b|from\s+js\s+import\b|import\s+pyodide_js\b|from\s+pyodide_js\b)", "the browser (js, pyodide_js): Python has no page and no network here; return values from step()"),
    (r"\bpyodide\.http\b|\bpyfetch\b|\bopen_url\b|^\s*(?:import|from)\s+(?:urllib|requests|http\.client|socket|ssl)\b", "a network call: a Python activity has no network"),
    (r"^\s*(?:import|from)\s+micropip\b", 'micropip: list the package in "packages" instead (only the allow-listed ones)'),
    (r"(?:^|[^A-Za-z0-9_.])input\s*\(", "input(): there is no console; the learner uses the controls of the spec"),
]
PY_WARN = [
    (r"^\s*while\s+True\s*:", "while True: each step() has a budget (stepMs, 3 s by default) and is stopped after it"),
    (r"\btime\.sleep\s*\(", "time.sleep(): a step blocks the learner while it sleeps; return at once"),
]
# sim-spec@1 (docs/INTERACTIVE.md §12): the SAME rules as engine/packcheck.js checkSimSpec
SPEC_FORMAT = "noema.sim-spec/v1"
DEFAULT_ENGINE = "formula@1"
ENGINES = {"formula@1", "circuit-mna@1", "thermal@1", "pid@1", "rf@1", "twin@1"}   # the engines this version knows (the same list in engine/packcheck.js)
SPEC_KEYS = {"format", "engine", "model", "title", "intro", "consts", "params", "derived", "outputs", "readouts", "plots", "bench"}
# circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md): the model, the outputs it can compute, the fault-finding bench (docs/INTERACTIVE.md §12.7)
CIRCUIT = "circuit-mna@1"
BENCH_ENGINES = {"circuit-mna@1", "twin@1"}
# the P6 engines (docs/INTERACTIVE_ENGINES.md): each checks its model with its own check_spec (the twin of its JS checkSpec)
P6 = {"thermal@1": thermal, "pid@1": pid, "rf@1": rf, "twin@1": twin}
P6_TIMED = ["thermal@1", "pid@1"]   # engines whose model.transient times and outputs' at may be expressions
# twin@1's bench: the probe points of the device and its instruments (the event log and the radio's RSSI besides V, I, scope)
TWIN = "twin@1"
TWIN_POINTS = ["vbat", "vload", "i", "gnd"]
TWIN_INSTRUMENTS = ["V", "I", "scope", "log", "rssi", "T", "clock"]
WHOLE = ["log", "rssi", "T", "clock"]
BENCH_NAMES = ["diagnosis", "measurements", "correct"]
MODEL_KEYS = ["netlist", "bindings", "transient", "noise", "ac"]
OUT_KEYS = ["id", "kind", "node", "branch", "time", "probe", "at", "stat", "power", "ac", "ref"]
# the AC analysis (docs/INTERACTIVE_CIRCUIT.md §9.6) and the meters' modes (§9.5)
AC_CURVES = ["f", "db", "phase", "mag"]; AC_POINT = ["db", "phase", "mag"]; AC_STATS = ["dcDb", "peakDb", "fPeak", "f3db", "fLow3db", "fUnity", "pm"]
MODES = ["dc", "ac", "rms", "avg"]
STATS = ["final", "min", "max", "mean", "pp", "rms"]
WAVES = {"pulse": ["v1", "v2", "delay", "rise", "fall", "width", "period"], "sine": ["offset", "amp", "freq", "phase", "delay"], "pwm": ["v", "freq", "duty", "low", "delay"]}
BENCH_KEYS = ["faults", "points", "instruments", "diagnosis", "budget"]
INSTRUMENTS = ["V", "I", "R", "scope", "logic", "bode"]
INST_KEYS = ["kind", "points", "parts", "tEnd", "dt", "tStart", "threshold", "modes", "zin", "leads", "source", "fStart", "fStop", "fPoints"]
BENCH_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,31}$")
BENCH_LIM = {"faults": 16, "apply": 4, "points": 24, "instruments": 7, "parts": 24, "options": 12, "budget": 100, "bindings": 24, "steps": 200000, "leads": 4, "acPoints": 1000}
SPEC_LIM = {"params": 24, "consts": 24, "derived": 48, "outputs": 24, "readouts": 24, "plots": 6, "series": 6, "marks": 8,
            "points": 2000, "options": 12, "checks": 16, "bytes": 64 * 1024, "unit": 16, "digits": 8}
NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,31}$")
PARAM_KINDS = ("slider", "number", "toggle", "choice")
NUM_FORMATS = ("auto", "si", "fixed")
HTML_MAX, HTML_WARN = 512 * 1024, 256 * 1024
FALLBACK_MIN = 40
HINTS_MAX = 6
# P6 (docs/adr/001 D12): a precompiled WebAssembly module (its own spec, or the model of a sim-spec@1 spec) and an allow-listed outside page
WASM, WASM_ENGINE, EMBED = "wasm-module@1", "wasm@1", "external-embed@1"
RUNTIMES |= {WASM, EMBED}
CHECKS_RUNTIMES |= {WASM}   # a module with its own spec shows its values like sim-spec@1
ENGINES |= {WASM_ENGINE}

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

def lint_python(src, packages=None):
    """→ (errors, warnings) of a py-module@1 activity's Python file (the same list as engine/packcheck.js lintPython)"""
    E, W = [], []
    if not isinstance(src, str) or not src.strip(): return ["the Python file is empty"], W
    n = len(src.encode("utf-8"))
    if n > PY_MAX: E.append(f"the Python file is {n // 1024} KB (at most {PY_MAX // 1024} KB)")
    if not re.search(r"^def\s+step\s*\(", src, re.M): E.append("the Python file defines no step(inputs, state) at the top level")
    for pat, why in PY_BANNED:
        m = re.search(pat, src, re.M)
        if m: E.append(f"{why} — found “{m.group(0).strip()[:40]}”")
    for pat, why in PY_WARN:
        if re.search(pat, src, re.M): W.append(why)
    decl = set(packages if isinstance(packages, list) else [])
    for name in PY_BASE + PY_EXTRAS:
        if name not in decl and re.search(r"^\s*(?:import|from)\s+" + name + r"\b", src, re.M): E.append(f'the Python file imports {name}: list it in "packages"')
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
        elif a.get("runtime") == PY:   # Python (activities/<id>/main.py) + the spec the app draws (activities/<id>/spec.json)
            if not _s(entry): entry = a["entry"] = f"activities/{aid}/main.py"
            f = os.path.join(sdir, entry)
            if not os.path.exists(f): probs.append(f"ERROR activity {aid}: entry {entry!r} not found"); a["python"] = ""
            else: a["python"] = open(f, encoding="utf-8", newline="").read()
            a["sha256"] = sha256(a["python"]); a["bytes"] = len(a["python"].encode("utf-8"))
            f = os.path.join(sdir, "activities", aid, "spec.json")
            if not os.path.exists(f): probs.append(f"ERROR activity {aid}: activities/{aid}/spec.json not found")
            else:
                try: a["spec"] = json.load(open(f, encoding="utf-8"))
                except Exception as e: probs.append(f"ERROR activity {aid}: activities/{aid}/spec.json: {e}")
        elif a.get("runtime") == "sim-spec@1":
            if not _s(entry): entry = a["entry"] = f"activities/{aid}/spec.json"
            f = os.path.join(sdir, entry)
            if not os.path.exists(f): probs.append(f"ERROR activity {aid}: entry {entry!r} not found")
            else:
                try: a["spec"] = json.load(open(f, encoding="utf-8"))
                except Exception as e: probs.append(f"ERROR activity {aid}: {entry}: {e}")
        elif a.get("runtime") == WASM:   # the module: activities/<id>/module.wasm → base64 + sha256 + bytes; its own spec (optional): spec.json
            if not _s(entry): entry = a["entry"] = f"activities/{aid}/module.wasm"
            f = os.path.join(sdir, entry)
            if not os.path.exists(f): probs.append(f"ERROR activity {aid}: entry {entry!r} not found")
            else:
                b = open(f, "rb").read(); a["wasm"] = base64.b64encode(b).decode("ascii"); a["sha256"] = hashlib.sha256(b).hexdigest(); a["bytes"] = len(b)
            f = os.path.join(sdir, "activities", aid, "spec.json")
            if os.path.exists(f):
                try: a["spec"] = json.load(open(f, encoding="utf-8"))
                except Exception as e: probs.append(f"ERROR activity {aid}: activities/{aid}/spec.json: {e}")
        elif a.get("runtime") == H5P:
            if not _s(entry): entry = a["entry"] = f"activities/{aid}/item.h5p"
            f = os.path.join(sdir, entry)
            if not os.path.isfile(f): probs.append(f"ERROR activity {aid}: entry {entry!r} not found")
            else:
                b = open(f, "rb").read(); a["sha256"] = hashlib.sha256(b).hexdigest(); a["bytes"] = len(b)
            by = dict(a.get("h5pByLocale") or {}) if isinstance(a.get("h5pByLocale"), (dict, type(None))) else a.get("h5pByLocale")
            for kind in ("content", "l10n"):   # activities/<id>/content.<locale>.json (+ l10n.<locale>.json: H5P's own strings) → inline
                for f2 in sorted(glob.glob(os.path.join(sdir, "activities", aid, kind + ".*.json"))):
                    loc = os.path.basename(f2)[len(kind) + 1:-5]
                    if not isinstance(by, dict): continue
                    try: by[loc] = {**(by.get(loc) or {}), kind: json.load(open(f2, encoding="utf-8"))}
                    except Exception as e: probs.append(f"ERROR activity {aid}: {os.path.relpath(f2, sdir)}: {e}")
            if by: a["h5pByLocale"] = by
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

def own_spec(a):
    """the spec a wasm-module@1 item shows: its own spec, run by wasm@1 on the item itself (as the runtime completes it)"""
    s = a.get("spec") if isinstance(a, dict) else None
    if not isinstance(s, dict): return s
    m = s.get("model") if isinstance(s.get("model"), dict) else {}
    return {**s, "engine": WASM_ENGINE, "model": {**m, "module": a.get("id")}}

def _spec_of(a):
    """the spec an activity shows (sim-spec@1, py-module@1: its spec; wasm-module@1: its own spec, completed) or None"""
    if not isinstance(a, dict): return None
    if a.get("runtime") in SPEC_RUNTIMES: return a.get("spec") if isinstance(a.get("spec"), dict) else None
    if a.get("runtime") == WASM: return own_spec(a) if isinstance(a.get("spec"), dict) else None
    return None

def _engine_of(a):
    """the engine a sim-spec@1 activity (or a wasm-module@1 item with its own spec) names (None for other runtimes, or a spec that names none that is a text)"""
    if isinstance(a, dict) and a.get("runtime") == WASM: return WASM_ENGINE if isinstance(a.get("spec"), dict) else None
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
    return {a.get("id"): {k: v for k, v in a.items() if k not in ("html", "wasm", "python", "h5p")} for a in (reg or {}).get("items") or [] if isinstance(a, dict)}

def check_activities(pack, translations=None):
    """→ (errors, warnings) of pack.activities, the blocks and sim exercises that use them, and pack.requires.
    translations: the locales the pack has (default: pack.translations); each activity needs its words in each."""
    E, W = [], []
    reg = pack.get("activities"); media = pack.get("media") or {}
    subject = pack.get("subject") or {}; own = subject.get("language") or "en"
    locs = sorted(set([own] + list(translations if translations is not None else (pack.get("translations") or {}).keys())))
    items = {}
    every = {x.get("id"): x for x in ((reg.get("items") if isinstance(reg, dict) else None) or []) if isinstance(x, dict) and isinstance(x.get("id"), str)}   # (a wasm@1 spec names a module item)
    if reg is not None:
        if not isinstance(reg, dict) or reg.get("format") != FORMAT: E.append(f'activities: format must be "{FORMAT}"')
        for a in (reg.get("items") if isinstance(reg, dict) else None) or []:
            aid = a.get("id") if isinstance(a, dict) else None
            if not isinstance(aid, str) or not ID_RE.match(aid): E.append(f"activity {aid!r}: id must be lower-case letters, digits and - (2–61)"); continue
            if aid in items: E.append(f"activity {aid}: duplicate id"); continue
            items[aid] = a; w = f"activity {aid}"
            rt = a.get("runtime")
            if rt in LATER: E.append(f"{w}: runtime {rt} arrives in a later version of the app ({LATER[rt]}); use html-app@1, sim-spec@1, py-module@1 or h5p@1 for now")
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
                else: E += [f"{w}: {m}" for m in check_spec(a["spec"], a.get("strings") if isinstance(a.get("strings"), dict) else None, items=every)]
            elif rt == PY:
                pk = [] if a.get("packages") is None else a.get("packages"); allowed = PY_BASE + PY_EXTRAS
                if not (isinstance(pk, list) and len(pk) <= PY_PACKAGES_MAX and all(isinstance(x, str) for x in pk)): E.append(f"{w}: packages must be a list of names ({', '.join(allowed)})")
                else:
                    for x in pk:
                        if x not in allowed: E.append(f"{w}: package {x!r} is not available (numpy, scipy and the allow-listed extras: {', '.join(PY_EXTRAS)})")
                    if len(set(pk)) != len(pk): E.append(f"{w}: packages lists a name twice")
                    ex = [x for x in pk if x in PY_EXTRAS]
                    if ex and a.get("requiresNetwork") is not True: E.append(f'{w}: an extra package ({", ".join(ex)}) is downloaded the first time: set "requiresNetwork": true')
                if a.get("requiresNetwork") is not None and not isinstance(a.get("requiresNetwork"), bool): E.append(f"{w}: requiresNetwork must be true or false")
                sm = a.get("stepMs")
                if sm is not None and not (isinstance(sm, int) and not isinstance(sm, bool) and PY_STEP[0] <= sm <= PY_STEP[1]): E.append(f"{w}: stepMs is a whole number {PY_STEP[0]}–{PY_STEP[1]} (the budget of one step(), in ms)")
                src = a.get("python")
                if not isinstance(src, str): E.append(f"{w}: the Python file (activities/{aid}/main.py) is missing")
                else:
                    le, lw = lint_python(src, pk if isinstance(pk, list) else []); E += [f"{w}: {m}" for m in le]; W += [f"{w}: {m}" for m in lw]
                    if a.get("sha256") is not None and a.get("sha256") != sha256(src): E.append(f"{w}: sha256 does not match the Python file")
                    if a.get("bytes") is not None and a.get("bytes") != len(src.encode("utf-8")): E.append(f"{w}: bytes does not match the Python file")
                if "spec" not in a: E.append(f"{w}: the spec (activities/{aid}/spec.json: the controls, readouts and plots the app draws) is missing")
                else: E += [f"{w}: {m}" for m in check_spec(a["spec"], a.get("strings") if isinstance(a.get("strings"), dict) else None, python=True)]
            elif rt == H5P: E += [f"{w}: {m}" for m in check_h5p_item(a, aid, locs, own)]
            elif rt == WASM:   # the module (size, sha256, imports, memory, exports) and its own spec, if it has one
                E += [f"{w}: {m}" for m in WK.check_item(a)[0]]
                sp = a.get("spec")
                if sp is not None:
                    if isinstance(sp, dict) and sp.get("engine", WASM_ENGINE) != WASM_ENGINE: E.append(f"{w}: spec.engine: the own spec of a {WASM} item runs on {WASM_ENGINE} (leave engine out)")
                    if isinstance(sp, dict) and isinstance(sp.get("model"), dict) and sp["model"].get("module", aid) != aid: E.append(f"{w}: spec.model.module: the own spec of a {WASM} item runs this item (leave module out)")
                    E += [f"{w}: {m}" for m in check_spec(own_spec(a), a.get("strings") if isinstance(a.get("strings"), dict) else None, items=every)]
            elif rt == EMBED:   # an allow-listed outside page: the provider, the exact URL, credit and licence (tools/embed_allow.json)
                ee, ww = EK.check_item(a); E += [f"{w}: {m}" for m in ee]; W += [f"{w}: {m}" for m in ww]
            st = a.get("strings")
            if rt == H5P and st in (None, {}): pass   # an H5P item keeps its words in content.json (h5pByLocale for the other languages)
            elif not isinstance(st, dict) or not st: E.append(f"{w}: strings {{locale: {{key: text}}}} are required (an activity shows no words of its own)")
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
    for a in items.values():   # a module item that a wasm@1 spec runs is used by that spec's blocks and exercises
        sp = a.get("spec") if isinstance(a, dict) and a.get("runtime") == "sim-spec@1" else None
        if isinstance(sp, dict) and sp.get("engine") == WASM_ENGINE and isinstance(sp.get("model"), dict) and sp["model"].get("module") in items: used.add(sp["model"]["module"])
    for aid in items:
        if aid not in used: W.append(f"activity {aid}: not used by any interactive block or sim exercise")
    if items:
        req = pack.get("requires") or []
        need = need_requires(list(items.values()))
        miss = [x for x in need if x not in req]
        if miss: E.append(f"pack.requires must list {', '.join(miss)} (make_pack.py writes it)")
    return E, W

def _shows_nothing(a):
    """a wasm-module@1 item without its own spec: a module for a sim-spec@1 spec, nothing a block or an exercise can show"""
    return isinstance(a, dict) and a.get("runtime") == WASM and not isinstance(a.get("spec"), dict)
SHOWS_NOTHING = f"is a {WASM} module without its own spec: show it through a sim-spec@1 spec (engine {WASM_ENGINE}, model.module) or give it a spec"

def check_h5p_item(a, aid, locs, own):
    """the registry fields of an h5p@1 item (the package itself: check_h5p_packages)"""
    E = []
    entry = a.get("entry")
    if entry is not None and not (isinstance(entry, str) and entry.startswith("activities/") and entry.endswith(".h5p") and ".." not in entry.split("/")): E.append(f"entry must be the .h5p file beside the pack (activities/{aid}/item.h5p)")
    if not (isinstance(a.get("sha256"), str) and SHA_RE.match(a["sha256"])): E.append("sha256 (of the .h5p file) is required")
    if not (isinstance(a.get("bytes"), int) and not isinstance(a.get("bytes"), bool) and 0 < a["bytes"] <= H5P_MAX): E.append(f"bytes (the size of the .h5p file, at most {H5P_MAX // 1048576} MB) is required")
    if "html" in a: E.append("an h5p@1 item has no html (its .h5p file travels beside the pack)")
    if a.get("h5p") is not None and not isinstance(a.get("h5p"), str): E.append("h5p (inline) must be the .h5p file in base64")
    by = a.get("h5pByLocale")
    if by is not None:
        if not isinstance(by, dict): E.append("h5pByLocale must be {locale: {content} | {h5p, sha256}}")
        else:
            for loc, v in by.items():
                if loc not in locs: E.append(f"h5pByLocale.{loc}: the pack is not read in {loc} ({', '.join(locs)})"); continue
                if not isinstance(v, dict) or not (isinstance(v.get("content"), dict) or (isinstance(v.get("h5p"), str) and isinstance(v.get("sha256"), str) and SHA_RE.match(v["sha256"]))):
                    E.append(f"h5pByLocale.{loc} must be {{content}} (its content.json) or {{h5p, sha256}} (another package in base64)")
                elif v.get("l10n") is not None and not isinstance(v.get("l10n"), dict): E.append(f"h5pByLocale.{loc}.l10n must be an object (H5P's own strings)")
    for loc in locs:
        if loc != own and not (isinstance(by, dict) and loc in by): E.append(f"h5pByLocale.{loc} is missing: the item's words in {loc} (activities/{aid}/content.{loc}.json)")
    return E

def _unzip(b):
    import io, zipfile
    try:
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            fa = H5.ALLOW["files"]; infos = [i for i in z.infolist() if not i.is_dir()]
            if len(infos) > fa["maxFiles"] or sum(i.file_size for i in infos) > fa["maxBytes"]: return None
            return {i.filename: z.read(i) for i in infos}
    except Exception: return None

def _b64(s):
    import base64
    try: return base64.b64decode(re.sub(r"^data:[^,]*;base64,", "", s).strip())
    except Exception: return b""

def check_h5p_packages(pack, bytes_of=None):
    """→ (errors, warnings) of the .h5p files of the pack's h5p@1 items: sha256 and bytes as the registry says, the package rules
    (tools/h5p_check.py), and each h5pByLocale translation with the same rules. bytes_of(item) → the file's bytes or None
    (an inline "h5p" in base64 is used first). The SAME messages as NoemaPackCheck.checkActivityPackages (tests/activities.js)."""
    E, W = [], []
    for a in ((pack.get("activities") or {}).get("items") or []):
        if not isinstance(a, dict) or a.get("runtime") != H5P or not isinstance(a.get("id"), str): continue
        w = f"activity {a['id']}"
        b = _b64(a["h5p"]) if isinstance(a.get("h5p"), str) else (bytes_of(a) if bytes_of else None)
        if b is None: E.append(f"{w}: the .h5p file {a.get('entry') or ''} is missing"); continue
        if a.get("sha256") != hashlib.sha256(b).hexdigest(): E.append(f"{w}: sha256 does not match the .h5p file")
        if a.get("bytes") != len(b): E.append(f"{w}: bytes does not match the .h5p file")
        files = _unzip(b)
        if files is None: E.append(f"{w}: not a .h5p (zip) file"); continue
        r = H5.check_files(files); E += [f"{w}: {m}" for m in r["errors"]]; W += [f"{w}: {m}" for m in r["warnings"]]
        by = a.get("h5pByLocale") if isinstance(a.get("h5pByLocale"), dict) else {}
        for loc in sorted(by):
            v = by[loc]
            if not isinstance(v, dict): continue
            if isinstance(v.get("h5p"), str):
                b2 = _b64(v["h5p"]); f2 = _unzip(b2)
                if f2 is None: E.append(f"{w}: h5pByLocale.{loc}: not a .h5p (zip) file"); continue
                if v.get("sha256") != hashlib.sha256(b2).hexdigest(): E.append(f"{w}: h5pByLocale.{loc}: sha256 does not match the .h5p file")
            elif isinstance(v.get("content"), dict): f2 = {**files, "content/content.json": json.dumps(v["content"], ensure_ascii=False).encode("utf-8")}
            else: continue
            E += [f"{w}: h5pByLocale.{loc}: {m}" for m in H5.check_files(f2)["errors"]]
    return E, W

def check_block(b, items):
    E = []
    if b.get("activity") not in items: E.append(f"interactive: activity {b.get('activity')!r} is not in pack.activities")
    elif _shows_nothing(items[b["activity"]]): E.append(f"interactive: activity {b['activity']} {SHOWS_NOTHING}")
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
    spec = _spec_of(a)
    if _shows_nothing(a): E.append(f"activity {e.get('activity')} {SHOWS_NOTHING}")
    if rt == EMBED:   # no provider has a result channel (tools/embed_allow.json supportsResult): an outside page is explore only
        p = next((x for x in EK.providers() if x.get("id") == a.get("provider")), None)
        if not (p and p.get("supportsResult") is True): E.append(f"sim-embed: activity {e.get('activity')} is an outside page (explore only): use it in a theory block")
    g = e.get("grade")
    if not isinstance(g, dict) or g.get("mode") not in GRADE_MODES: E.append('grade must be {"mode": "reported"} (the activity reports its result) or {"mode": "checks", "checks": [{"expr": …}]} (sim-spec@1)')
    else:
        if g.get("pass") is not None and not (_num(g["pass"]) and 0 < g["pass"] <= 1): E.append("grade.pass must be a number in (0, 1]")
        if g["mode"] == "reported" and rt in CHECKS_RUNTIMES and rt != PY: E.append(f'a {rt} activity reports nothing itself: grade it with {{"mode": "checks", "checks": […]}}')
        if g["mode"] == "checks":
            if rt is not None and not (isinstance(rt, str) and rt in CHECKS_RUNTIMES): E.append(f'grade.mode "checks" needs an activity whose values the app can see (sim-spec@1, py-module@1, wasm-module@1); {rt} reports its own result: use "reported"')
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
                fids = [f.get("id") for f in _list(spec["bench"].get("faults")) if isinstance(f, dict)] if isinstance(spec.get("bench"), dict) else None
                for k, v in t["params"].items():
                    if k == "fault" and fids is not None:   # a bench: the fault of this task (one id), or the ones the seed draws from (a list)
                        if not ((v in fids) if isinstance(v, str) else (isinstance(v, list) and len(v) >= 1 and all(isinstance(x, str) and x in fids for x in v))):
                            E.append("task.params.fault must be the id of a fault of the bench, or a list of them (the seed draws one)")
                    elif k not in consts:
                        if rt != PY: E.append(f"task.params.{k}: not a constant of the spec (a sim-spec@1 task sets only the spec's consts)")   # py-module@1: Python's init(task, seed) reads the others
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
    if isinstance(spec.get("bench"), dict): out += BENCH_NAMES   # a bench's values: for the checks of a sim exercise only (never shown)
    return out

def check_spec(spec, tables=None, engines=None, items=None, python=False):
    """→ errors of a sim-spec@1 spec. tables: {locale: {key: text}} (every label key must be in each); engines: the known engine ids;
    items: {id: item} of the pack (a wasm@1 model names its module there; None = the model is not checked here).
    python: the spec of a py-module@1 activity (its outputs come from Python's step(): no engine, no model, no bench, at least one output)."""
    E = []
    if not isinstance(spec, dict): return ["spec: a JSON object is required (activities/<id>/spec.json)"]
    if len(json.dumps(spec, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > SPEC_LIM["bytes"]: E.append(f"spec: at most {SPEC_LIM['bytes'] // 1024} KB")
    if spec.get("format") != SPEC_FORMAT: E.append(f'spec: format must be "{SPEC_FORMAT}"')
    for k in sorted(set(spec) - SPEC_KEYS): E.append(f"spec: unknown field {k!r}")
    eng = PY if python else spec.get("engine", DEFAULT_ENGINE); known = ENGINES if engines is None else set(engines)
    if python:
        if "engine" in spec: E.append("spec.engine: the outputs of a py-module@1 activity come from its Python step(); leave engine out")
        if "model" in spec: E.append("spec.model: a py-module@1 activity has no engine model (its Python code is the model)")
    elif not isinstance(eng, str) or eng not in known: E.append(f"spec: unknown engine {eng!r} (this version knows {', '.join(sorted(known))})")
    if eng == DEFAULT_ENGINE and "model" in spec: E.append("spec: model configures another engine; formula@1 has none")
    if spec.get("model") is not None and not isinstance(spec["model"], dict): E.append("spec: model must be an object")
    keys = set(); seen = set()
    def key(k, where, need=False):
        if k is None and not need: return
        if not (isinstance(k, str) and KEY_RE.match(k)): E.append(f"{where} must be a key of the activity's string tables"); return
        keys.add(k)
    def name(n, where):
        if not (isinstance(n, str) and NAME_RE.match(n)) or n in SX.CONSTS or n in ('true', 'false') or SX.check(n):
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
    in_names = list(names)   # what an engine's inputs may use: consts, params, derived
    os_ = spec.get("outputs"); series = []
    if python and not (isinstance(os_, list) and os_): E.append("spec.outputs: list what step() returns, at least one {id, kind: scalar | series}")
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
            if not (isinstance(xv, str) and NAME_RE.match(xv)) or xv in SX.CONSTS or xv in ('true', 'false') or SX.check(xv) or xv in seen: E.append(f"{w}.x.var: {xv!r} must be a new name for the x axis (not one of the spec's names)")
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
    if eng == CIRCUIT: check_circuit(spec, in_names, E)
    elif isinstance(eng, str) and eng in P6: check_engine(spec, eng, in_names, E)
    if eng == WASM_ENGINE and items is not None: E += WK.check_model(spec, items)
    if spec.get("bench") is not None:
        if eng not in BENCH_ENGINES: E.append(f"spec.bench needs an engine that can take measurements ({', '.join(sorted(BENCH_ENGINES))})")
        else: check_bench(spec, in_names, seen, E, key, eng)
    if tables:
        for k in sorted(keys):
            miss = sorted(l for l, t in tables.items() if isinstance(t, dict) and k not in t)
            if miss: E.append(f"spec: the string {k} is missing in strings.{', strings.'.join(miss)}")
    return E

# ---------------------------------------------------------------- circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md): the SAME rules as packcheck.js checkCircuit / checkBench
def _gnd(x): return x == "gnd" or x == "0"

def _circuit_of(spec):
    """{nl, els: id → element, nodes: node and test-point names} of a spec's netlist without errors, or None"""
    m = spec.get("model") if isinstance(spec, dict) else None
    nl = m.get("netlist") if isinstance(m, dict) else None
    if not isinstance(nl, dict) or any(p["level"] == "error" for p in CK.check(nl)): return None
    return {"nl": nl, "els": {e["id"]: e for e in nl["elements"]}, "nodes": {x if isinstance(x, str) else x["name"] for x in nl["nodes"]}}

def _endpoint_ok(c, x):
    """a measuring point: a node, a test-point label, gnd, or a pin "@R1.0" """
    if not isinstance(x, str): return False
    if x[:1] == "@":
        m = re.match(r"^@(.*)\.(\d+)$", x); e = c["els"].get(m.group(1)) if m else None
        return bool(e) and int(m.group(2)) < len(e["n"]) and not x.endswith("\n")
    return x in c["nodes"] or _gnd(x)

def _int(v): return isinstance(v, int) and not isinstance(v, bool)

def _probe_ok(c, p):
    if not isinstance(p, dict): return False
    meter = p.get("kind") in ("V", "I")   # a meter's mode, input resistance (V) and averaging window (§9.5)
    if "mode" in p and not (meter and isinstance(p["mode"], str) and p["mode"] in MODES): return False
    if "zin" in p and not (p.get("kind") == "V" and _num(p["zin"]) and p["zin"] >= 0): return False
    for k in ("tEnd", "dt", "tStart"):
        if k in p and not (meter and _num(p[k]) and (p[k] >= 0 if k == "tStart" else p[k] > 0)): return False
    if ("dt" in p or "tStart" in p) and ("tEnd" not in p or ("tStart" in p and not p["tStart"] < p["tEnd"])): return False   # a window: tEnd, and tStart below it
    if p.get("kind") in ("V", "R"): return _endpoint_ok(c, p.get("a")) and ("b" not in p or _endpoint_ok(c, p["b"]))
    if p.get("kind") == "I":
        e = c["els"].get(p.get("element")) if isinstance(p.get("element"), str) else None
        return bool(e) and ("pin" not in p or (_int(p["pin"]) and 0 <= p["pin"] < len(e["n"])))
    return False

def _ac_source_ok(c, x):
    """a source the AC analysis can excite: a V or I part"""
    return isinstance(x, str) and x in c["els"] and c["els"][x]["type"] in ("V", "I")

def _num_or_expr(v, names, where, E, pos):
    """a number (> 0 when pos) or an expression of names → the number, or None (an expression, or a problem added to E)"""
    if isinstance(v, str):
        m = _expr_problem(v, names, where)
        if m: E.append(m)
        return None
    if not (_num(v) and (not pos or v > 0)): E.append(f"{where} must be a number{' > 0' if pos else ''} or an expression"); return None
    return v

def _steps_over(t_end, dt): return _num(t_end) and _num(dt) and math.ceil(t_end / dt - 1e-9) > BENCH_LIM["steps"]

def _unknown(o, allowed, w, E):
    for k in sorted(k for k in o if k not in allowed): E.append(f"{w}: unknown field {k!r}")

def check_circuit(spec, names, E):
    m = spec.get("model"); L = BENCH_LIM
    if not isinstance(m, dict): E.append(f"spec.model: {CIRCUIT} needs a model {{netlist, bindings?, transient?, noise?}}"); return
    _unknown(m, MODEL_KEYS, "spec.model", E)
    if not isinstance(m.get("netlist"), dict): E.append('spec.model.netlist must be a netlist {format: "noema.circuit/v1", nodes, elements}'); return
    probs = [p for p in CK.check(m["netlist"]) if p["level"] == "error"]
    for p in probs: E.append(f"spec.model.netlist{'.' + p['path'] if p['path'] else ''}: {p['msg']}")
    if probs: return
    c = _circuit_of(spec); bs = m.get("bindings")
    if bs is not None and not (isinstance(bs, list) and len(bs) <= L["bindings"]): E.append(f"spec.model.bindings must be a list of at most {L['bindings']} {{element, prop?, expr}}")
    for i, b in enumerate(_list(bs)[:L["bindings"]]):
        w = f"spec.model.bindings[{i}]"
        if not isinstance(b, dict): E.append(f"{w} must be an object {{element, prop?, expr}}"); continue
        _unknown(b, ["element", "prop", "expr"], w, E)
        e = c["els"].get(b.get("element")) if isinstance(b.get("element"), str) else None
        if not e: E.append(f"{w}.element is not a part of the netlist")
        else:
            prop = b.get("prop", "value") if "prop" in b else "value"
            wave = next(iter(e["value"]), None) if isinstance(e.get("value"), dict) else None
            t = e["type"]
            if not isinstance(prop, str): okp = False
            elif t in ("R", "C", "L"): okp = prop == "value"
            elif t == "SW": okp = prop == "on"
            elif t in ("V", "I"): okp = (wave is None or wave == "dc") if prop == "value" else (wave in WAVES and any(wave + "." + f == prop for f in WAVES[wave]))
            else: okp = False
            if not okp: E.append(f"{w}.prop cannot be set on this part (value of R, C, L and a DC source; on of a switch; pulse.v2, sine.freq, pwm.duty … of a source with that waveform)")
        mm = _expr_problem(b.get("expr"), names, w + ".expr")
        if mm: E.append(mm)
    tr = m.get("transient")
    if tr is not None:
        if not isinstance(tr, dict): E.append("spec.model.transient must be an object {tEnd, dt?}")
        else:
            _unknown(tr, ["tEnd", "dt"], "spec.model.transient", E)
            te = None
            if "tEnd" not in tr: E.append("spec.model.transient.tEnd is required")
            else: te = _num_or_expr(tr["tEnd"], names, "spec.model.transient.tEnd", E, True)
            dt = None if "dt" not in tr else _num_or_expr(tr["dt"], names, "spec.model.transient.dt", E, True)
            if _steps_over(te, dt): E.append(f"spec.model.transient: tEnd / dt is more than {L['steps']} steps")
    nz = m.get("noise")
    if nz is not None and not (isinstance(nz, dict) and all(k in ("rel", "abs") for k in nz) and all(k not in nz or (_num(nz[k]) and 0 <= nz[k] <= 1) for k in ("rel", "abs"))):
        E.append("spec.model.noise is {rel?, abs?}: numbers from 0 to 1 (the meter's relative and absolute error)")
    ac = m.get("ac")
    if ac is not None:
        if not isinstance(ac, dict): E.append("spec.model.ac must be an object {source, fStart, fStop, points?}")
        else:
            _unknown(ac, ["source", "fStart", "fStop", "points"], "spec.model.ac", E)
            if not _ac_source_ok(c, ac.get("source")): E.append("spec.model.ac.source must be a V or I part of the netlist (the source the analysis excites)")
            for k in ("fStart", "fStop"):
                if k not in ac: E.append(f"spec.model.ac.{k} is required (Hz)")
                else: _num_or_expr(ac[k], names, "spec.model.ac." + k, E, True)
            if _num(ac.get("fStart")) and _num(ac.get("fStop")) and not ac["fStop"] > ac["fStart"]: E.append("spec.model.ac: fStop must be above fStart")
            if "points" in ac and not (_int(ac["points"]) and 2 <= ac["points"] <= L["acPoints"]): E.append(f"spec.model.ac.points is a whole number 2–{L['acPoints']}")
    node_ok = lambda x: isinstance(x, str) and (x in c["nodes"] or _gnd(x))
    for i, o in enumerate(_list(spec.get("outputs"))):
        w = f"spec.outputs[{i}]"
        if not (isinstance(o, dict) and o.get("kind") in ("scalar", "series")): continue   # (reported with the outputs)
        _unknown(o, OUT_KEYS, w, E)
        if "ac" in o:   # a point or a curve of the AC analysis
            if any(k in o for k in ("branch", "time", "probe", "power", "stat")): E.append(f"{w}: an ac output reads only ac, node, ref and (a gain or phase at one frequency) at")
            curve = o["kind"] == "series"; v = o["ac"]
            okv = isinstance(v, str) and (v in AC_CURVES if curve else (v in AC_POINT or v in AC_STATS))
            if not okv: E.append(f"{w}.ac is one of {', '.join(AC_CURVES if curve else AC_POINT + AC_STATS)} on a {o['kind']} output")
            if v != "f" and not node_ok(o.get("node")): E.append(f"{w}.node is not a node of the netlist (where the response is read)")
            if v == "f" and "node" in o: E.append(f"{w}: the frequency axis (ac: f) reads no node")
            if "ref" in o and not node_ok(o["ref"]): E.append(f"{w}.ref is not a node of the netlist")
            if not curve and isinstance(v, str) and v in AC_POINT:
                if "at" not in o: E.append(f"{w}.at is required: the frequency (Hz) of this {v}")
                else: _num_or_expr(o["at"], names, w + ".at", E, True)
            elif "at" in o: E.append(f"{w}: at belongs to a gain or phase at one frequency (ac: db, phase, mag on a scalar)")
            if not isinstance(m.get("ac"), dict): E.append(f"{w} needs model.ac {{source, fStart, fStop, points?}}")
            continue
        if "ref" in o: E.append(f"{w}: ref belongs to an ac output")
        src = [k for k in ("node", "branch", "time", "probe", "power") if k in o]
        if len(src) != 1: E.append(f"{w} must name what it reads: one of node, branch, time, probe, power, ac"); continue
        s_ = src[0]
        if s_ == "time" and not (o["time"] is True and o["kind"] == "series"): E.append(f"{w}.time is true on a series output (the time axis of the transient)")
        if s_ == "node" and not (isinstance(o["node"], str) and (o["node"] in c["nodes"] or _gnd(o["node"]))): E.append(f"{w}.node is not a node of the netlist")
        if s_ == "branch" and not (isinstance(o["branch"], str) and o["branch"] in c["els"]): E.append(f"{w}.branch is not a part of the netlist")
        if s_ == "power" and not (isinstance(o["power"], str) and o["power"] in c["els"]): E.append(f"{w}.power is not a part of the netlist (the part whose power is read)")
        if s_ == "probe" and not (o["kind"] == "scalar" and _probe_ok(c, o["probe"])): E.append(f"{w}.probe must be a reading {{kind: V | I | R, a, b? | element, pin?, mode?, zin?, tEnd?, dt?, tStart?}} on a scalar output")
        at, st = "at" in o, "stat" in o
        if (at or st) and not (o["kind"] == "scalar" and s_ in ("node", "branch", "power")): E.append(f"{w}: at and stat belong to a scalar output of a node, a branch or a power")
        if s_ == "power" and o["kind"] == "scalar" and not at and not st: E.append(f"{w}: a power is read over the transient: give at or stat")
        if at and st: E.append(f"{w}: at or stat, not both")
        if at: _num_or_expr(o["at"], names, w + ".at", E, False)
        if st and o["stat"] not in STATS: E.append(f"{w}.stat is one of {', '.join(STATS)}")
        if (o["kind"] == "series" or at or st) and not isinstance(m.get("transient"), dict): E.append(f"{w} needs model.transient {{tEnd, dt?}}")

# ---------------------------------------------------------------- the P6 engines (docs/INTERACTIVE_ENGINES.md): the SAME rules as packcheck.js checkEngine
def _engine_exprs(spec, eng):
    """[(source, where)] of each expression of a P6 model: the bindings; for thermal@1 and pid@1 also the transient's times and the outputs' at"""
    m = spec.get("model") if isinstance(spec.get("model"), dict) else {}; out = []; timed = eng in P6_TIMED
    def add(v, w):
        if isinstance(v, str) and v.strip(): out.append((v, w))   # (an empty one is the engine's own message)
    for i, b in enumerate(_list(m.get("bindings"))):
        if isinstance(b, dict): add(b.get("expr"), f"spec.model.bindings[{i}].expr")
    if timed and isinstance(m.get("transient"), dict):
        for k in ("tEnd", "dt"): add(m["transient"].get(k), f"spec.model.transient.{k}")
    if timed:
        for i, o in enumerate(_list(spec.get("outputs"))):
            if isinstance(o, dict): add(o.get("at"), f"spec.outputs[{i}].at")
    return out

def check_engine(spec, eng, names, E):
    for p in P6[eng].check_spec(spec):
        if p["level"] == "error": E.append(f"spec{'.' + p['path'] if p['path'] else ''}: {p['msg']}")
    for src, w in _engine_exprs(spec, eng):
        m = _expr_problem(src, names, w)
        if m: E.append(m)

def _twin_of(spec):
    """twin@1: the device of a spec without errors, or None"""
    m = spec.get("model") if isinstance(spec, dict) else None
    d = m.get("device") if isinstance(m, dict) else None
    return d if isinstance(d, dict) and not any(p["level"] == "error" for p in twin.check(d)) else None

def check_bench(spec, names, seen, E, key, eng=CIRCUIT):
    b = spec.get("bench"); L = BENCH_LIM; tw = eng == TWIN; c = None if tw else _circuit_of(spec); dev = _twin_of(spec) if tw else None
    KINDS = TWIN_INSTRUMENTS if tw else INSTRUMENTS
    if not isinstance(b, dict): E.append("spec.bench must be an object {faults, points, instruments, diagnosis, budget?}"); return
    _unknown(b, BENCH_KEYS, "spec.bench", E)
    for n in BENCH_NAMES:
        if n in seen: E.append(f"spec: the name {n} belongs to the bench (its values: {', '.join(BENCH_NAMES)})")
    def ids(arr, w, what):
        out = []
        for i, x in enumerate(_list(arr)):
            if not isinstance(x, dict): continue
            xid = x.get("id")
            if not (isinstance(xid, str) and BENCH_ID_RE.match(xid) and not xid.endswith("\n")): E.append(f"{w}[{i}].id must be a name (a letter, then letters, digits, _ or -; at most 32)")
            elif xid in out: E.append(f"{w}[{i}].id: the {what} {xid} is listed twice")
            else: out.append(xid)
        return out
    fs = b.get("faults")
    if not (isinstance(fs, list) and 1 <= len(fs) <= L["faults"]): E.append(f"spec.bench.faults must be a list of 1–{L['faults']} faults {{id, apply}}")
    fids = ids(fs, "spec.bench.faults", "fault")
    for i, f in enumerate(_list(fs)):
        w = f"spec.bench.faults[{i}]"
        if not isinstance(f, dict): E.append(f"{w} must be an object {{id, apply}}"); continue
        _unknown(f, ["id", "apply"], w, E)
        if not (isinstance(f.get("apply"), list) and len(f["apply"]) <= L["apply"]): E.append(f"{w}.apply must be a list of at most {L['apply']} changes to the {'device' if tw else 'circuit'} ([] = a healthy device)"); continue
        if c:
            for p in CK.check_faults(c["nl"], f["apply"]): E.append(f"{w}.{re.sub(r'^faults', 'apply', p['path'])}: {p['msg']}")
        if dev is not None:
            for p in twin.check_faults(dev, f["apply"]): E.append(f"{w}.{re.sub(r'^faults', 'apply', p['path'])}: {p['msg']}")
    ps = b.get("points")
    if not (isinstance(ps, list) and 1 <= len(ps) <= L["points"]): E.append(f"spec.bench.points must be a list of 1–{L['points']} probe points {{id, at, label}}")
    pids = ids(ps, "spec.bench.points", "point"); at_of = {}
    for i, p in enumerate(_list(ps)):
        w = f"spec.bench.points[{i}]"
        if not isinstance(p, dict): E.append(f"{w} must be an object {{id, at, label}}"); continue
        _unknown(p, ["id", "at", "label"], w, E)
        if isinstance(p.get("id"), str) and p["id"] not in at_of: at_of[p["id"]] = p.get("at")
        if c and not _endpoint_ok(c, p.get("at")): E.append(f"{w}.at must be a node, a test point, gnd or a pin such as @R1.0 of the netlist")
        if tw and not (isinstance(p.get("at"), str) and p["at"] in TWIN_POINTS): E.append(f"{w}.at is one of {', '.join(TWIN_POINTS)} (the battery, the battery under load, the supply current, the ground)")
        key(p.get("label"), w + ".label", True)
    is_ = b.get("instruments"); kinds = []
    if not (isinstance(is_, list) and 1 <= len(is_) <= L["instruments"]): E.append(f"spec.bench.instruments must be a list of 1–{L['instruments']} instruments {{kind, …}}")
    for i, x in enumerate(_list(is_)):
        w = f"spec.bench.instruments[{i}]"
        if not (isinstance(x, dict) and isinstance(x.get("kind"), str) and x["kind"] in KINDS): E.append(f"{w}.kind is one of {', '.join(KINDS)}"); continue
        if x["kind"] in kinds: E.append(f"{w}: the instrument {x['kind']} is listed twice")
        kinds.append(x["kind"])
        _unknown(x, INST_KEYS, w, E)
        if x["kind"] in WHOLE:   # twin@1: the event log, the radio's RSSI, the thermometer and the clock check read the device, not a point
            if any(k != "kind" and k in INST_KEYS for k in x): E.append(f"{w}: the {({'log': 'event log', 'rssi': 'RSSI reading', 'T': 'thermometer', 'clock': 'clock check'})[x['kind']]} has only a kind")
            continue
        scope = x["kind"] in ("scope", "logic"); meter = not tw and x["kind"] in ("V", "I")
        if x["kind"] == "I":
            if "points" in x: E.append(f"{w}: the ammeter reads parts (parts), not points")
            pa = x.get("parts")
            if not (isinstance(pa, list) and 1 <= len(pa) <= L["parts"]): E.append(f"{w}.parts must be a list of 1–{L['parts']} parts {{element, label, pin?}}")
            else:
                for j, q in enumerate(pa):
                    wq = f"{w}.parts[{j}]"
                    if not isinstance(q, dict): E.append(f"{wq} must be an object {{element, label, pin?}}"); continue
                    _unknown(q, ["element", "label", "pin"], wq, E)
                    pq = {"kind": "I", "element": q.get("element")}
                    if "pin" in q: pq["pin"] = q["pin"]
                    if c and not _probe_ok(c, pq): E.append(f"{wq}: element must be a part of the netlist (and pin one of its pins)")
                    if tw and not (q.get("element") == "battery" and "pin" not in q): E.append(f"{wq}: element must be battery (the twin's ammeter reads the supply current), without pin")
                    key(q.get("label"), wq + ".label", True)
        else:
            if "parts" in x: E.append(f"{w}: only the ammeter (I) reads parts")
            pts = x.get("points") if "points" in x else None
            if "points" in x and not (isinstance(pts, list) and len(pts) >= 1 and all(isinstance(q, str) and q in pids for q in pts)): E.append(f"{w}.points must be ids of spec.bench.points")
            if x["kind"] in ("V", "R") and (len(pts) if isinstance(pts, list) else len(pids)) < 2: E.append(f"{w}: a meter needs two points to put its leads on")
            if tw:
                on = [at_of.get(q) for q in (pts if isinstance(pts, list) else pids) if isinstance(q, str) and q in pids]
                if x["kind"] == "V" and any(a == "i" for a in on): E.append(f"{w}: the twin's voltmeter reads vbat or vload against gnd (list its points: not the current i)")
                if x["kind"] == "scope" and any(a != "i" for a in on): E.append(f"{w}: the twin's oscilloscope shows the supply current (list its points: only points at i)")
        for k in ("tEnd", "dt", "tStart", "threshold"):
            if k in x and not ((scope or meter) and (k != "threshold" or x["kind"] == "logic")):
                E.append(f"{w}.{k} belongs to {'the logic analyser' if k == 'threshold' else 'the oscilloscope, the logic analyser and (its averaging window) the multimeter'}")
        # the circuit's instruments (§9.5): the meter's modes, an input resistance, the scope probe's ground leads, the frequency response analyser
        if "modes" in x:
            ms = x["modes"]
            if not (meter and isinstance(ms, list) and len(ms) >= 1 and all(isinstance(q, str) and q in MODES and ms.index(q) == j for j, q in enumerate(ms))):
                E.append(f"{w}.modes belongs to the multimeter (V, I): a list of {', '.join(MODES)}, each once")
        if "zin" in x and not (not tw and x["kind"] in ("V", "scope", "logic") and _num(x["zin"]) and x["zin"] >= 0):
            E.append(f"{w}.zin belongs to the voltmeter, the oscilloscope and the logic analyser: their input resistance in Ω (0 = ideal)")
        if "leads" in x:
            ld = x["leads"]
            if not (not tw and x["kind"] == "scope" and isinstance(ld, list) and 1 <= len(ld) <= L["leads"]): E.append(f"{w}.leads belongs to the oscilloscope: a list of 1–{L['leads']} ground leads {{label, lead, cin?}}")
            else:
                for j, q in enumerate(ld):
                    wq = f"{w}.leads[{j}]"
                    if not isinstance(q, dict): E.append(f"{wq} must be an object {{label, lead, cin?}}"); continue
                    _unknown(q, ["label", "lead", "cin"], wq, E)
                    if not (_num(q.get("lead")) and q["lead"] >= 0): E.append(f"{wq}.lead is the ground lead's inductance in H (0 = none; about 1 nH per mm of wire)")
                    if "cin" in q and not (_num(q["cin"]) and q["cin"] >= 0): E.append(f"{wq}.cin is the probe's capacitance in F")
                    key(q.get("label"), wq + ".label", True)
        bode = x["kind"] == "bode"
        for k in ("source", "fStart", "fStop", "fPoints"):
            if k in x and not bode: E.append(f"{w}.{k} belongs to the frequency response analyser (bode)")
        if bode:
            if c and not _ac_source_ok(c, x.get("source")): E.append(f"{w}.source must be a V or I part of the netlist (the source the analyser sweeps)")
            for k in ("fStart", "fStop"):
                if k not in x: E.append(f"{w}.{k} is required (Hz)")
                else: _num_or_expr(x[k], names, f"{w}.{k}", E, True)
            if "fPoints" in x and not (_int(x["fPoints"]) and 2 <= x["fPoints"] <= L["acPoints"]): E.append(f"{w}.fPoints is a whole number 2–{L['acPoints']}")
        if meter:
            te = None if "tEnd" not in x else _num_or_expr(x["tEnd"], names, w + ".tEnd", E, True)
            dt = None if "dt" not in x else _num_or_expr(x["dt"], names, w + ".dt", E, True)
            if "tStart" in x: _num_or_expr(x["tStart"], names, w + ".tStart", E, False)
            if ("dt" in x or "tStart" in x) and "tEnd" not in x: E.append(f"{w}: the multimeter's averaging window needs tEnd")
            if _num(x.get("tStart")) and _num(te) and not x["tStart"] < te: E.append(f"{w}: the multimeter's averaging window needs tStart below tEnd")
            if _steps_over(te, dt): E.append(f"{w}: tEnd / dt is more than {L['steps']} steps")
        if scope:
            te = None
            if "tEnd" not in x: E.append(f"{w}.tEnd is required (how long the trace is, in s)")
            else: te = _num_or_expr(x["tEnd"], names, w + ".tEnd", E, True)
            dt = None if "dt" not in x else _num_or_expr(x["dt"], names, w + ".dt", E, True)
            if "tStart" in x: _num_or_expr(x["tStart"], names, w + ".tStart", E, False)
            if "threshold" in x and x["kind"] == "logic": _num_or_expr(x["threshold"], names, w + ".threshold", E, False)
            if _steps_over(te, dt): E.append(f"{w}: tEnd / dt is more than {L['steps']} steps")
    d = b.get("diagnosis")
    if not isinstance(d, dict): E.append("spec.bench.diagnosis must be an object {options: [{label, fault?}]}")
    else:
        _unknown(d, ["label", "options"], "spec.bench.diagnosis", E)
        key(d.get("label"), "spec.bench.diagnosis.label")
        os_ = d.get("options"); named = []
        if not (isinstance(os_, list) and 2 <= len(os_) <= L["options"]): E.append(f"spec.bench.diagnosis.options must be a list of 2–{L['options']} options {{label, fault?}}")
        else:
            for i, o in enumerate(os_):
                w = f"spec.bench.diagnosis.options[{i}]"
                if not isinstance(o, dict): E.append(f"{w} must be an object {{label, fault?}}"); continue
                _unknown(o, ["label", "fault"], w, E)
                key(o.get("label"), w + ".label", True)
                if "fault" in o:
                    if not (isinstance(o["fault"], str) and o["fault"] in fids): E.append(f"{w}.fault must be the id of one of spec.bench.faults")
                    elif o["fault"] in named: E.append(f"{w}.fault: two options name the fault {o['fault']}")
                    else: named.append(o["fault"])
            for f in fids:
                if f not in named: E.append(f"spec.bench.diagnosis: no option names the fault {f} (the learner could not diagnose it)")
    if "budget" in b and not (_int(b["budget"]) and 1 <= b["budget"] <= L["budget"]): E.append(f"spec.bench.budget is a whole number 1–{L['budget']} (the measurements allowed)")
