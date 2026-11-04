#!/usr/bin/env python3
"""The rules of external-embed@1 (docs/activities-dev/embed.md): an activity that is an allow-listed third-party page in a frame.
The same rules as engine/src/45_activity_embed.js (NoemaEmbed.check / checkPack); tests/activities_embed.js keeps them equal.

  python3 tools/embed_check.py <pack.json | activities/activities.json>     → the errors (exit 1) and warnings

  check_item(item, providers=None) -> (errors, warnings)   each message "code: what"
  check_pack(pack, providers=None) -> (errors, warnings)   every embed item + the sim exercises that would grade one (refused)
  parse(url) / match(url, provider)                         the URL grammar and the exact allow-list match
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOW = os.path.join(HERE, "embed_allow.json")
RUNTIME, MAX_URL, FALLBACK_MIN = "external-embed@1", 2048, 40
SANDBOX_OK = ["allow-scripts", "allow-same-origin", "allow-forms", "allow-pointer-lock", "allow-popups"]
SAFE = re.compile(r"^[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#]+$")
URL_RE = re.compile(r"^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(:[0-9]{1,5})?(/[^?#]*)?(\?[^#]*)?(#.*)?$", re.S)
BAD_PATH = re.compile(r"//|/\.\.?(/|$)|%2e|%2f|%5c|%00", re.I)


def providers():
    with open(ALLOW, encoding="utf-8") as f:
        return json.load(f)["providers"]


def _s(v):
    return isinstance(v, str) and v.strip() != ""


def _full(pattern, s):
    try:
        return re.fullmatch("(?:" + pattern + ")", s) is not None
    except (re.error, TypeError):
        return False


def _provider(pid, plist):
    return next((p for p in plist or [] if isinstance(p, dict) and p.get("id") == pid), None)


def parse(u):
    if not isinstance(u, str) or not u: return {"code": "url-missing"}
    if len(u) > MAX_URL: return {"code": "url-long"}
    if not u.startswith("https://"): return {"code": "url-scheme"}
    if not SAFE.match(u) or "\n" in u: return {"code": "url-chars"}
    if "@" in re.split(r"[/?#]", u[8:])[0]: return {"code": "url-userinfo"}
    m = URL_RE.match(u)
    if not m: return {"code": "url-host"}
    path = m.group(3) or "/"
    if BAD_PATH.search(path): return {"code": "url-path"}
    q, h = m.group(4), m.group(5)
    return {"origin": "https://" + m.group(1) + (m.group(2) or ""), "path": path, "query": None if q is None else q[1:], "hash": None if h is None else h[1:]}


def match(url, p):
    u = parse(url)
    if "code" in u: return u
    if not p or not isinstance(p.get("origins"), list) or u["origin"] not in p["origins"]: return {"code": "url-origin"}
    if not _full(p.get("path"), u["path"]): return {"code": "url-path"}
    if u["query"] is not None and (p.get("query") is None or not _full(p["query"], u["query"])): return {"code": "url-query"}
    if u["query"] is None and p.get("query") is not None and not _full(p["query"], ""): return {"code": "url-query"}
    if u["hash"] is not None and (p.get("hash") is None or not _full(p["hash"], u["hash"])): return {"code": "url-hash"}
    return {"ok": True, "provider": p, "origin": u["origin"]}


def check_item(a, plist=None):
    plist = providers() if plist is None else plist
    E, W = [], []
    e = lambda code, what: E.append(code + ": " + what)
    if not isinstance(a, dict): return ["item: not an object"], W
    if a.get("runtime") != RUNTIME: e("runtime", "runtime must be " + RUNTIME)
    p = _provider(a.get("provider"), plist) if isinstance(a.get("provider"), str) else None
    if not p:
        e("provider-unknown", "provider must be one of the allow-list (tools/embed_allow.json)")
    else:
        if p.get("status") != "allowed": e("provider-pending", "provider " + p["id"] + " is not allowed yet (its embedding terms are not confirmed)")
        sb = p.get("sandbox")
        if not isinstance(sb, list) or any(t not in SANDBOX_OK for t in sb) or "allow-scripts" not in sb: e("provider-sandbox", "the provider asks for sandbox tokens outside " + " ".join(SANDBOX_OK))
        m = match(a.get("url"), p)
        if not m.get("ok"): e(m["code"], "url does not match provider " + p["id"] + " exactly")
        if not _s(a.get("credit")): e("credit-missing", "credit is required")
        elif _s(p.get("creditMust")) and p["creditMust"] not in a["credit"]: e("credit-provider", 'credit must name "' + p["creditMust"] + '"')
        if not _s(a.get("license")): e("license-missing", "license is required")
        elif not isinstance(p.get("licenses"), list) or a["license"] not in p["licenses"]: e("license-provider", "license must be one of " + ", ".join(p.get("licenses") or []))
    if p is None and isinstance(a.get("url"), str):
        u = parse(a["url"])
        if "code" in u: e(u["code"], "url")
    fb = a.get("fallback") if isinstance(a.get("fallback"), dict) else {}
    if not (_s(fb.get("text")) and len(fb["text"].strip()) >= FALLBACK_MIN) or not _s(fb.get("media")):
        e("fallback-missing", f"fallback {{media, text >= {FALLBACK_MIN} characters}} is required (offline, refused, not chosen)")
    caps = a.get("capabilities")
    if caps is not None and not (isinstance(caps, list) and len(caps) == 0): e("capabilities", "an embed has no capabilities (it does not speak the activity protocol)")
    if any(k in a for k in ("html", "spec", "entry")): e("not-embed", "an embed carries no bundle, spec or entry")
    st = a.get("strings")
    if not isinstance(st, dict) or not st or any(not isinstance(t, dict) or not _s(t.get("title")) for t in st.values()):
        e("strings-title", "strings.<locale>.title (what opens, in each language) is required")
    h = a.get("height")
    if h is not None and not (isinstance(h, (int, float)) and not isinstance(h, bool) and 120 <= h <= 2000): e("height", "height must be 120–2000")
    if p and p.get("status") == "allowed" and "NC" in str(a.get("license") or ""):
        W.append("license-nc: " + str(a.get("license")) + " is non-commercial: fine for a free study app, not for a paid one")
    return E, W


def check_pack(pack, plist=None):
    plist = providers() if plist is None else plist
    E, W, items = [], [], {}
    reg = (pack or {}).get("activities") if isinstance(pack, dict) else None
    for a in (reg.get("items") if isinstance(reg, dict) and isinstance(reg.get("items"), list) else []):
        if not isinstance(a, dict) or a.get("runtime") != RUNTIME: continue
        items[a.get("id")] = a
        ee, ww = check_item(a, plist)
        E += [f"activity {a.get('id')}: {m}" for m in ee]; W += [f"activity {a.get('id')}: {m}" for m in ww]
    for c in (pack.get("chapters") if isinstance(pack, dict) and isinstance(pack.get("chapters"), list) else []):
        for ex in c.get("exercises") or []:
            if isinstance(ex, dict) and ex.get("type") == "sim" and ex.get("activity") in items:
                p = _provider(items[ex["activity"]].get("provider"), plist)
                if not (p and p.get("supportsResult") is True):
                    E.append(f"{ex.get('id')}: sim-embed: activity {ex['activity']} is an outside page (explore only): use it in a theory block")
    return E, W


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 2
    with open(argv[1], encoding="utf-8") as f:
        doc = json.load(f)
    pack = doc if "activities" in doc or "chapters" in doc else {"activities": doc}
    E, W = check_pack(pack)
    for m in E: print("✗ " + m)
    for m in W: print("⚠ " + m)
    if not E: print(f"✓ external-embed@1: no errors ({len(W)} warning(s))")
    return 1 if E else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
