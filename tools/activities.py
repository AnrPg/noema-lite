"""Interactive activities in packs (docs/INTERACTIVE.md, docs/adr/001-interactive-activities.md): the Python half of the checks.
The SAME rules as engine/packcheck.js checkActivities (tests/activities.js runs both on the same fixtures).

  load_activities(subject_dir) → (registry | None, problems)   activities/activities.json + every bundle and string table
  check_activities(pack) → (errors, warnings)                   the registry, its references from blocks / sim exercises, pack.requires
  lint_html(html) → (errors, warnings)                         what a mini-app (html-app@1) may not contain

In the subject folder:
  activities/activities.json            {"format": "noema.activities/v1", "items": [{id, runtime, entry, stateVersion, fallback, …}]}
  activities/<id>/app.html              the bundle of an html-app@1 activity (entry)
  activities/<id>/strings.<locale>.json the activity's words, one file per language, the same keys in each
In the pack (make_pack.py): pack.activities = {"format", "items": [{…, "html": <the bundle>, "sha256", "bytes", "strings": {locale: {key: text}}}]}
and pack.requires = ["activities/v1", "runtime:<id>", …]. Every bundle is inline, like the pictures (ADR D2)."""
import glob, hashlib, json, os, re

FORMAT = "noema.activities/v1"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,60}$")
KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9_.-]{0,63}$")
LOCALE_RE = re.compile(r"^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$")
RUNTIMES = {"html-app@1"}                                   # runtimes this version runs
LATER = {"sim-spec@1": "P2", "py-module@1": "P4"}           # known, arriving in a later version (docs/adr/001 §7)
CAPS = {"state", "events", "resize", "result", "hints", "announce"}
GRADE_MODES = {"reported"}                                  # "checks" arrives with sim-spec@1 (the expression language)
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

def requires(reg):
    """pack.requires for a registry: the core + each runtime it uses (the app reloads to a newer build, or falls back, when it lacks one)"""
    return ["activities/v1"] + sorted({"runtime:" + a["runtime"] for a in (reg or {}).get("items") or [] if isinstance(a, dict) and isinstance(a.get("runtime"), str)}) if reg and reg.get("items") else []

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
            if rt in LATER: E.append(f"{w}: runtime {rt} arrives in a later version of the app ({LATER[rt]}); use html-app@1 for now")
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
        need = ["activities/v1"] + sorted({"runtime:" + a.get("runtime") for a in items.values() if isinstance(a.get("runtime"), str)})
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
    g = e.get("grade")
    if not isinstance(g, dict) or g.get("mode") not in GRADE_MODES | {"checks"}: E.append('grade must be {"mode": "reported"} (the activity reports its result)')
    elif g.get("mode") == "checks": E.append('grade.mode "checks" arrives with sim-spec@1 (the expression language, P2); use "reported"')
    elif g.get("pass") is not None and not (isinstance(g["pass"], (int, float)) and 0 < g["pass"] <= 1): E.append("grade.pass must be a number in (0, 1]")
    t = e.get("task")
    if t is not None:
        if not isinstance(t, dict): E.append("task must be an object {seed, params}")
        else:
            sd = t.get("seed", "auto")
            if not (sd == "auto" or (isinstance(sd, int) and sd >= 0)): E.append('task.seed is "auto" (a new one each attempt) or a whole number')
            if t.get("params") is not None and not isinstance(t["params"], dict): E.append("task.params must be an object")
    h = e.get("hints")
    if h is not None and not (isinstance(h, list) and len(h) <= HINTS_MAX and all(_s(x) for x in h)): E.append(f"hints must be a list of at most {HINTS_MAX} texts")
    if e.get("reveal") is not None and not _s(e.get("reveal")): E.append("reveal must be a text")
    return E
