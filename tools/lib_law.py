"""law@1 — the Python twin of engine/src/48_lib_law.js (docs/library/law.md): check_spec(spec), exprs(spec), keys(spec) give the same
problems (code, path, msg, level) and lists as the JS checkSpec / exprs / keys (tests/enginelib.js and tests/lib_law.js compare them on
tests/fixtures/enginelib/law.json). Literals are parsed by logic@1's parser (tools/lib_logic.py parse), as the JS does with
NoemaLibLogic.parse. It does not compute the tasks. The tables below are the JS module's own (MODEL_T, REQ, TASK_OUT, AT_OF, CODES,
SCHEMES), copied as JSON so that both twins walk the same data."""
import json, re
import enginelib as L
import lib_logic as LOGIC

ID = "law@1"
MAX_TEXT = 200
MODEL_T = json.loads(r'''{"task":"enum:rules|aspic|carneades|hohfeld|proof|cases|deadline|contract|damages|crime|sentence|proportionality|vote|citation|shares|obligations!","query":"expr","rules":{"$list":{"$obj":{"id":"id!","if":{"$list":"expr","max":32},"then":"expr!","kind":"enum:strict|defeasible|defeater","unless":{"$list":"expr","max":16},"rank":"fin","issued":"fin","on":"numx","label":"key"}},"max":200},"sup":{"$list":{"$obj":{"win":"ref!","lose":"ref!"}},"max":400},"order":{"$list":"enum:superior|specialis|posterior","max":3},"facts":{"$list":"expr","max":200},"toggles":{"$list":{"$obj":{"lit":"expr!","on":"numx"}},"max":64},"premises":{"$list":{"$obj":{"lit":"expr!","kind":"enum:axiom|ordinary","rank":"fin","on":"numx"}},"max":100},"schemes":{"$list":{"$obj":{"id":"id!","scheme":"enum:expert|witness|position-to-know|precedent|analogy|rule|consequences|sign|cause|commitment!","if":{"$list":"expr","max":16},"then":"expr!","rank":"fin","cqs":{"$list":{"$obj":{"cq":"id!","lit":"expr","on":"numx"}},"max":12},"on":"numx","label":"key"}},"max":40},"link":"enum:last|weakest","semantics":"enum:grounded|preferred|stable|complete","args":{"$list":{"$obj":{"id":"id!","then":"expr!","if":{"$list":"expr","max":16},"unless":{"$list":"expr","max":16},"weight":"numx","on":"numx","label":"key"}},"max":100},"assume":{"$list":"expr","max":200},"standards":{"$list":{"$obj":{"lit":"expr!","ps":"enum:scintilla|preponderance|clear-convincing|brd|dv!"}},"max":100},"alpha":"numx","beta":"numx","gamma":"numx","positions":{"$list":{"$obj":{"kind":"enum:right|duty|privilege|noright|power|liability|immunity|disability!","holder":"id!","other":"id!","act":"expr!","on":"numx"}},"max":100},"ask":{"$obj":{"kind":"enum:right|duty|privilege|noright|power|liability|immunity|disability!","holder":"id!","other":"id!","act":"expr!"}},"issues":{"$list":{"$obj":{"id":"id!","p":"numx","prior":"numx","lr":{"$list":"numx","max":32},"standard":"enum:scintilla|preponderance|clear-convincing|brd|decision|custom","threshold":"numx","burden":"enum:claimant|defendant","presumed":"ref","mode":"enum:thayer|morgan","rebut":"numx","label":"key"}},"max":32},"claim":{"$list":"ref","max":32},"costs":{"$obj":{"fp":"numx!","fn":"numx!"}},"aggregate":"enum:element|product","factors":{"$list":{"$obj":{"id":"id!","side":"enum:p|d!","label":"key"}},"max":64},"cases":{"$list":{"$obj":{"id":"id!","factors":{"$list":"ref","max":64},"outcome":"enum:p|d!","reason":{"$list":"ref","max":64},"label":"key"}},"max":100},"side":"enum:p|d","focus":"ref","reasoning":"enum:result|reason","start":"expr","period":{"$obj":{"n":"numx!","unit":"enum:days|weeks|months|years|business!"}},"excludeStart":"bool","roll":"enum:next|previous|none","monthEnd":"enum:last|next","weekend":{"$list":"int:0:6","max":7},"holidays":{"$list":"expr","max":400},"tolling":{"$list":{"$obj":{"from":"expr!","to":"expr!"}},"max":32},"longstop":{"$obj":{"n":"numx!","unit":"enum:days|weeks|months|years|business!"}},"asOf":"numx","events":{"$list":{"$obj":{"kind":"enum:offer|counteroffer|revocation|rejection|acceptance|lapse!","by":"id","t":"numx!","arrive":"numx","terms":{"$list":"id","max":32},"on":"numx"}},"max":64},"acceptRule":"enum:dispatch|receipt","revokeRule":"enum:receipt|dispatch","mirror":"enum:strict|material","material":{"$list":"id","max":32},"firm":"bool","elements":{"$list":{"$obj":{"id":"id!","holds":"numx!","label":"key"}},"max":32},"parties":{"$list":{"$obj":{"id":"id!","age":"numx","minAge":"numx","capable":"numx"}},"max":16},"items":{"$list":{"$obj":{"id":"id!","kind":"enum:loss|incidental|consequential|cost-avoided|loss-avoided|reliance|benefit!","amount":"numx!","foreseeable":"numx","avoidable":"numx","on":"numx","label":"key"}},"max":64},"measure":"enum:expectation|reliance|restitution","price":"numx","market":"numx","liquidated":{"$obj":{"amount":"numx!","anticipated":"numx","ratio":"numx"}},"interest":{"$obj":{"rate":"numx!","years":"numx!","kind":"enum:simple|compound|continuous","per":"int:1:366","principal":"numx"}},"offences":{"$list":{"$obj":{"id":"id!","elements":{"$list":{"$obj":{"id":"id!","kind":"enum:conduct|circumstance|result","mind":"enum:purpose|knowledge|recklessness|negligence|strict","label":"key"}},"min":1,"max":16},"mind":"enum:purpose|knowledge|recklessness|negligence|strict","grade":"enum:felony|misdemeanor|violation","rank":"fin","label":"key"}},"max":16},"proven":{"$list":{"$obj":{"element":"id!","holds":"numx!","mind":"numx"}},"max":64},"defences":{"$list":{"$obj":{"id":"id!","kind":"enum:justification|excuse","holds":"numx!","offences":{"$list":"ref","max":16},"label":"key"}},"max":16},"causation":{"$obj":{"butFor":"numx","proximate":"numx"}},"grid":{"$obj":{"first":"int:-100:100","rows":{"$req":true,"$list":{"$list":"nonneg","max":24},"min":1,"max":100},"cats":{"$req":true,"$list":"nonneg","min":1,"max":12}}},"level":"numx","points":"numx","adjust":{"$list":{"$obj":{"id":"id!","delta":"numx!","on":"numx"}},"max":32},"min":"numx","max":"numx","aim":"numx","suitable":"numx","effect":"numx","burden":"numx","alternatives":{"$list":{"$obj":{"id":"id!","effect":"numx!","burden":"numx!","on":"numx"}},"max":16},"weights":{"$obj":{"Ii":"numx","Wi":"numx","Ri":"numx","Ij":"numx","Wj":"numx","Rj":"numx"}},"scale":"enum:triadic|double|continuous","extra":{"$list":{"$obj":{"side":"enum:i|j!","I":"numx!","W":"numx","R":"numx"}},"max":16},"members":"numx","present":"numx","yes":"numx","no":"numx","abstain":"numx","abstentions":"enum:excluded|no","quorum":"numx","base":"enum:cast|present|members","majority":"numx","strict":"bool","tie":"enum:fails|chair","chair":"enum:yes|no","voters":{"$list":{"$obj":{"id":"id!","weight":"numx!","pop":"numx","yes":"numx","label":"key"}},"max":64},"quota":"numx","popQuota":"numx","countQuota":"numx","blocking":"int:0:1000","voter":"ref","text":"expr","patterns":{"$list":{"$obj":{"id":"id!","template":"expr!"}},"max":16},"kinds":{"$list":"enum:ecli|neutral|reporter|series|provision","max":5},"heirs":{"$list":{"$obj":{"id":"id!","share":"numx","first":"numx","weight":"numx","claim":"numx","radd":"bool","on":"numx","label":"key"}},"max":32},"estate":"numx","deficit":"enum:radd|escheat","division":"enum:proportional|cea|cel|talmud","norms":{"$list":{"$obj":{"id":"id!","kind":"enum:O|F|P!","cond":"expr","act":"expr!","deadline":"expr","within":"int:0:2000","until":"expr","rank":"fin","issued":"fin","penalty":"numx","on":"numx"}},"max":200},"trace":{"$list":{"$obj":{"day":"int:0:2000","date":"expr","facts":{"$list":"id","max":64},"acts":{"$list":"id","max":64}}},"max":2000},"count":"enum:calendar|business","horizon":"int:1:2000","step":"numx"}''')
REQ = json.loads(r'''{"rules":["rules"],"aspic":["premises|rules|schemes"],"carneades":["args"],"hohfeld":["positions"],"proof":["issues"],"cases":["factors","cases"],"deadline":["start","period"],"contract":["events"],"damages":["items|price"],"crime":["offences"],"sentence":["grid"],"proportionality":["weights"],"vote":["yes|voters"],"citation":["text"],"shares":["heirs","estate"],"obligations":["norms","trace"]}''')
TASK_OUT = json.loads(r'''{"rules":[["holds","definite","refuted","undecided","fired","defeated","blocked","conclusions","status"],["status"]],"aspic":[["accepted","credulous","arguments","attacks","defeats","extensions","inCount","status"],["labels"]],"carneades":[["acceptable","negation","applicable","arguments","status"],["applicable"]],"hohfeld":[["holds","contradictions","conflicts","positions","derived"],[]],"proof":[["established","claim","posterior","threshold","product","winner"],["posteriors"]],"cases":[["forced","permissible","consistent","onPoint","best","mostOnPoint","shared","distinctions","binding"],["shared","binding"]],"deadline":[["end","endY","endM","endD","weekday","days","businessDays","extended","expired","remaining","tolled","longstopEnd"],[]],"contract":[["formed","formedAt","binding","voidable","failed","offers"],[]],"damages":[["damages","expectation","reliance","restitution","mitigated","excluded","interest","total","liquidated"],["balance"]],"crime":[["liable","offence","elements","met","failed","required","mens"],["met"]],"sentence":[["level","category","lo","hi","mid"],[]],"proportionality":[["legitimate","suitable","necessary","weight","balance","proportionate","stage"],[]],"vote":[["quorate","passes","needed","margin","cast","yesShare","popShare","countShare","banzhaf","shapley"],["banzhaf","shapley"]],"citation":[["valid","kind","year","volume","page","number","depth","field"],[]],"shares":[["share","amount","total","awl","radd","residue","escheat"],["shares","amounts"]],"obligations":[["violations","fulfilments","pending","conflicts","penalties","steps","frame"],["violationsPerStep"]]}''')
AT_OF = json.loads(r'''{"rules":{"status":"rules"},"aspic":{"status":"rules|schemes"},"carneades":{"status":"args"},"proof":{"established":"issues","posterior":"issues","threshold":"issues","winner":"issues"},"cases":{"shared":"cases","distinctions":"cases","binding":"cases"},"crime":{"elements":"offences","met":"offences","failed":"offences","required":"offences","mens":"offences"},"vote":{"banzhaf":"voters","shapley":"voters"},"shares":{"share":"heirs","amount":"heirs"}}''')
CODES = json.loads(r'''["inconsistent","undecided","unresolved","budget","no-stable","contradiction","conflict","conjunction","shifted","probability","no-precedent","month-end","rolled","tolled","longstop","expired","counteroffer","revoked","lapsed","rejected","in-transit","late","mirror","minor","unforeseeable","avoidable","penalty","negative","default-mind","strict-liability","causation","defence","grid-range","clamped","stalemate","scale","no-quorum","tie","casting","blocking","no-match","awl","radd","escheat","no-heirs","claims-short","parse","trace-truncated","weight","value"]''')
SCHEMES = json.loads(r'''{"expert":["expertise","field","opinion","trustworthy","consistent","evidence"],"witness":["position","truthful","consistent","bias","plausible"],"position-to-know":["position","honest","asserted"],"precedent":["onpoint","distinguish","overruled","binding"],"analogy":["similar","difference","counter"],"rule":["applies","exception","valid","conflict"],"consequences":["likely","evidence","opposite"],"sign":["strength","other-cause"],"cause":["correlation","intervening","strength"],"commitment":["committed","retracted"]}''')

ATOM_OK = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,31}")
DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
PH_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]{0,31}):(int|word|text|year)\}")


def is_obj(v): return isinstance(v, dict)
def is_str(v): return isinstance(v, str)


def parse_lit(s):
    if not is_str(s): return {"ok": False, "code": "parse", "msg": "logic@1 is not loaded"}
    r = LOGIC.parse(s, "prop")
    if not r["ok"]: return r
    a = r["ast"]
    if a["t"] == "atom": return {"ok": True, "lit": a["n"]}
    if a["t"] == "not" and a["a"]["t"] == "atom": return {"ok": True, "lit": "~" + a["a"]["n"]}
    return {"ok": False, "code": "literal", "msg": "needs a literal (p or ~p)"}


def lit(s):
    r = parse_lit(s)
    return r["lit"] if r["ok"] else None


def atom_of(l): return l[1:] if l.startswith("~") else l


def _leap(y): return (y % 4 == 0 and y % 100 != 0) or y % 400 == 0


def _month_len(y, m): return [31, 29 if _leap(y) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


def days_from_civil(y, m, d):
    y -= 1 if m <= 2 else 0
    era = y // 400; yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def day_of(s):
    m = DATE_RE.fullmatch(s) if is_str(s) else None
    if not m: return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 1600 or y > 2400 or mo < 1 or mo > 12 or d < 1 or d > _month_len(y, mo): return None
    return days_from_civil(y, mo, d)


def template(t):
    if not is_str(t) or len(t) > 200: return {"ok": False, "msg": "a template of at most 200 characters"}
    i, fields = 0, []
    while i < len(t):
        c = t[i]
        if c == "{":
            m = PH_RE.match(t, i)
            if not m: return {"ok": False, "msg": f"a placeholder is {{name:int}}, {{name:word}}, {{name:text}} or {{name:year}} (at {i})"}
            if any(f[0] == m.group(1) for f in fields): return {"ok": False, "msg": f"the placeholder {m.group(1)} is used twice"}
            fields.append([m.group(1), m.group(2)])
            if len(fields) > 12: return {"ok": False, "msg": "at most 12 placeholders"}
            i = m.end(); continue
        if c == "}": return {"ok": False, "msg": f'a "}}" without its "{{" (at {i})'}
        if c == " ":
            while i < len(t) and t[i] == " ": i += 1
            continue
        i += 1
    if not fields: return {"ok": False, "msg": "needs at least one placeholder"}
    return {"ok": True, "fields": fields}


def lit_fields(m):
    out = []
    def Lf(arr, base, f):
        if isinstance(arr, list):
            for i, x in enumerate(arr):
                if is_obj(x) and is_str(x.get(f)): out.append([x[f], f"{base}[{i}].{f}"])
    def LL(arr, base, f):
        if isinstance(arr, list):
            for i, x in enumerate(arr):
                if is_obj(x) and isinstance(x.get(f), list):
                    for j, s in enumerate(x[f]):
                        if is_str(s): out.append([s, f"{base}[{i}].{f}[{j}]"])
    def S(arr, base):
        if isinstance(arr, list):
            for i, s in enumerate(arr):
                if is_str(s): out.append([s, f"{base}[{i}]"])
    t = m.get("task")
    if t in ("rules", "aspic", "carneades"):
        if is_str(m.get("query")): out.append([m["query"], "model.query"])
        LL(m.get("rules"), "model.rules", "if"); Lf(m.get("rules"), "model.rules", "then"); LL(m.get("rules"), "model.rules", "unless")
        S(m.get("facts"), "model.facts"); Lf(m.get("toggles"), "model.toggles", "lit")
        Lf(m.get("premises"), "model.premises", "lit")
        LL(m.get("schemes"), "model.schemes", "if"); Lf(m.get("schemes"), "model.schemes", "then")
        if isinstance(m.get("schemes"), list):
            for i, s in enumerate(m["schemes"]):
                if is_obj(s) and isinstance(s.get("cqs"), list):
                    for j, q in enumerate(s["cqs"]):
                        if is_obj(q) and is_str(q.get("lit")): out.append([q["lit"], f"model.schemes[{i}].cqs[{j}].lit"])
        LL(m.get("args"), "model.args", "if"); Lf(m.get("args"), "model.args", "then"); LL(m.get("args"), "model.args", "unless")
        S(m.get("assume"), "model.assume"); Lf(m.get("standards"), "model.standards", "lit")
    if t == "hohfeld":
        Lf(m.get("positions"), "model.positions", "act")
        if is_obj(m.get("ask")) and is_str(m["ask"].get("act")): out.append([m["ask"]["act"], "model.ask.act"])
    return out


def dupes(arr, base, E, what):
    seen = set()
    if isinstance(arr, list):
        for i, x in enumerate(arr):
            if is_obj(x) and is_str(x.get("id")):
                if x["id"] in seen: E("duplicate", f"{base}[{i}].id", f"the {what} {x['id']} is listed twice")
                seen.add(x["id"])
    return seen


def ids_of(arr): return {x["id"] for x in (arr if isinstance(arr, list) else []) if is_obj(x) and is_str(x.get("id"))}


def carneades_cycle(args):
    dep = {}
    for a in args:
        if not is_obj(a) or not is_str(a.get("then")): continue
        c = atom_of(lit(a["then"]) or "")
        if not c: continue
        dep.setdefault(c, [])
        for f in ("if", "unless"):
            for s in a.get(f) or []:
                l = lit(s)
                if l: dep[c].append(atom_of(l))
    state, found = {}, [None]
    def visit(v):
        if found[0]: return
        state[v] = 1
        for w in dep.get(v, []):
            if state.get(w) == 1: found[0] = w; return
            if w not in state: visit(w)
            if found[0]: return
        state[v] = 2
    for v in list(dep.keys()):
        if v not in state: visit(v)
    return found[0]


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if is_obj(spec) else None
    KINDS = ["scalar", "series", "scene"]
    if not is_obj(m):
        E("format", "model", "not an object"); L.check_outputs(spec, ID, KINDS, lambda o, at, E, W: True, E, W); return P
    L.walk(m, MODEL_T, "model", E, W)
    if L.has_errors(P):
        L.check_outputs(spec, ID, KINDS, lambda o, at, E, W: True, E, W); return P
    task = m["task"]
    for r in [r for r in REQ[task] if not any(f in m for f in r.split("|"))]:
        E("value", "model." + r.split("|")[0], f"missing ({task} needs {', '.join(' or '.join(x.split('|')) for x in REQ[task])})")
    for s, p in lit_fields(m):
        r = parse_lit(s)
        if not r["ok"]: E(r["code"], p, r["msg"])
    rules = dupes(m.get("rules"), "model.rules", E, "rule"); schemes = dupes(m.get("schemes"), "model.schemes", E, "scheme")
    for k in ["args", "issues", "factors", "cases", "elements", "parties", "items", "offences", "defences", "adjust", "alternatives", "voters", "patterns", "heirs", "norms"]:
        dupes(m.get(k), "model." + k, E, "argument" if k == "args" else re.sub(r"s$", "", re.sub(r"ies$", "y", k)))
    if isinstance(m.get("rules"), list) and isinstance(m.get("schemes"), list):
        for i, s in enumerate(m["schemes"]):
            if s["id"] in rules: E("duplicate", f"model.schemes[{i}].id", f"the id {s['id']} is a rule too")
    for i, s in enumerate(m.get("sup") or []):
        for f in ("win", "lose"):
            if s[f] not in rules and s[f] not in schemes: E("ref", f"model.sup[{i}].{f}", "not a rule of the model")
    if task in ("aspic", "rules"):
        for i, r in enumerate(m.get("rules") or []):
            if task == "aspic" and r.get("kind") == "defeater": E("value", f"model.rules[{i}].kind", "aspic has strict and defeasible rules (a defeater is an undercutter: a rule that concludes ~<rule id>)")
    for i, s in enumerate(m.get("schemes") or []):
        for j, q in enumerate(s.get("cqs") or []):
            if q["cq"] not in SCHEMES[s["scheme"]]: E("cq", f"model.schemes[{i}].cqs[{j}].cq", f"not a critical question of {s['scheme']}: {', '.join(SCHEMES[s['scheme']])}")
    if task == "carneades" and isinstance(m.get("args"), list):
        cyc = carneades_cycle(m["args"])
        if cyc: E("cycle", "model.args", f"the arguments form a cycle through {cyc} (Carneades needs an acyclic graph)")
    if task == "proof":
        iss = ids_of(m.get("issues"))
        for i, s in enumerate(m.get("issues") or []):
            if "presumed" in s and s["presumed"] not in iss: E("ref", f"model.issues[{i}].presumed", "not an issue of the model")
            if s.get("presumed") == s["id"]: E("value", f"model.issues[{i}].presumed", "an issue cannot presume itself")
            if s.get("standard") == "custom" and "threshold" not in s: E("value", f"model.issues[{i}].threshold", "missing (a custom standard needs its threshold)")
            if s.get("standard") == "decision" and "costs" not in m: E("value", "model.costs", "missing (the decision standard needs costs fp and fn)")
        for i, c in enumerate(m.get("claim") or []):
            if c not in iss: E("ref", f"model.claim[{i}]", "not an issue of the model")
        if is_str(m.get("query")) and m["query"] not in iss: E("ref", "model.query", "not an issue of the model")
    if task == "cases":
        fs, cs = ids_of(m.get("factors")), ids_of(m.get("cases"))
        for i, c in enumerate(m.get("cases") or []):
            for f in ("factors", "reason"):
                for j, x in enumerate(c.get(f) or []):
                    if x not in fs: E("ref", f"model.cases[{i}].{f}[{j}]", "not a factor of the model")
        for j, x in enumerate(m.get("facts") or []):
            if x not in fs: E("ref", f"model.facts[{j}]", "not a factor of the model")
        for j, x in enumerate(m.get("toggles") or []):
            if x["lit"] not in fs: E("ref", f"model.toggles[{j}].lit", "not a factor of the model")
        if "focus" in m and m["focus"] not in cs: E("ref", "model.focus", "not a case of the model")
    DMSG = "needs a date YYYY-MM-DD that exists (1600–2400)"
    if task in ("deadline", "obligations"):
        if "start" in m and day_of(m["start"]) is None: E("date", "model.start", DMSG)
        for i, h in enumerate(m.get("holidays") or []):
            if day_of(h) is None: E("date", f"model.holidays[{i}]", DMSG)
        for i, t in enumerate(m.get("tolling") or []):
            for f in ("from", "to"):
                if day_of(t[f]) is None: E("date", f"model.tolling[{i}].{f}", DMSG)
            if day_of(t["from"]) is not None and day_of(t["to"]) is not None and day_of(t["to"]) < day_of(t["from"]): E("value", f"model.tolling[{i}].to", "ends before it starts")
        for i, s in enumerate(m.get("trace") or []):
            if "date" in s and day_of(s["date"]) is None: E("date", f"model.trace[{i}].date", DMSG)
            if "date" in s and "day" in s: E("value", f"model.trace[{i}].day", "give day or date, not both")
        if task == "obligations" and "start" not in m and any("date" in s for s in m.get("trace") or []): E("value", "model.start", "missing (dated steps need the start date)")
        if task == "obligations" and m.get("count") == "business" and "start" not in m: E("value", "model.start", "missing (business days need the start date)")
    if task == "obligations":
        for i, nm in enumerate(m.get("norms") or []):
            for f in ("cond", "act", "deadline", "until"):
                if is_str(nm.get(f)):
                    r = LOGIC.parse(nm[f], "prop")
                    if not r["ok"]: E(r["code"], f"model.norms[{i}].{f}", r["msg"])
    if task == "crime":
        os_, els = ids_of(m.get("offences")), set()
        for i, o in enumerate(m.get("offences") or []):
            seen = set()
            for j, e in enumerate(o.get("elements") or []):
                if e["id"] in seen: E("duplicate", f"model.offences[{i}].elements[{j}].id", f"the element {e['id']} is listed twice")
                seen.add(e["id"]); els.add(e["id"])
        for i, p in enumerate(m.get("proven") or []):
            if p["element"] not in els: E("ref", f"model.proven[{i}].element", "not an element of an offence")
        for i, d in enumerate(m.get("defences") or []):
            for j, x in enumerate(d.get("offences") or []):
                if x not in os_: E("ref", f"model.defences[{i}].offences[{j}]", "not an offence of the model")
    if task == "sentence" and is_obj(m.get("grid")):
        k = len(m["grid"]["cats"])
        for i, r in enumerate(m["grid"]["rows"]):
            if len(r) != 2 * k: E("grid", f"model.grid.rows[{i}]", f"needs {2 * k} numbers (low and high for each of the {k} categories)")
        for i, c in enumerate(m["grid"]["cats"]):
            if i and c <= m["grid"]["cats"][i - 1]: E("grid", f"model.grid.cats[{i}]", "the categories' lower bounds must rise")
    if task == "vote" and "voter" in m and m["voter"] not in ids_of(m.get("voters")): E("ref", "model.voter", "not a voter of the model")
    if task == "citation":
        if is_str(m.get("text")) and len(m["text"]) > MAX_TEXT: E("size", "model.text", f"longer than {MAX_TEXT} characters")
        for i, p in enumerate(m.get("patterns") or []):
            r = template(p["template"])
            if not r["ok"]: E("pattern", f"model.patterns[{i}].template", r["msg"])
    if task == "hohfeld":
        for i, p in enumerate(m.get("positions") or []):
            if p["holder"] == p["other"]: E("value", f"model.positions[{i}].other", "a jural relation holds between two different persons")
        if is_obj(m.get("ask")) and m["ask"]["holder"] == m["ask"]["other"]: E("value", "model.ask.other", "a jural relation holds between two different persons")
    SC, SE = TASK_OUT[task]

    def out(o, at, E, W):
        for k in o:
            if k not in ("id", "kind", "of", "code", "at", "name"): W("unknown-field", at + "." + k, "ignored")
        lst = SC + ["flag"] if o["kind"] == "scalar" else SE if o["kind"] == "series" else ["drawing"]
        if o["of"] not in lst:
            E("output", at + ".of", f"{o['kind']} outputs of {ID} for {task}: {', '.join(lst) or 'none'}"); return
        if o["kind"] == "scalar" and o["of"] == "flag":
            if o.get("code") not in CODES: E("enum", at + ".code", "one of " + ", ".join(CODES))
        elif "code" in o: W("unknown-field", at + ".code", "ignored")
        lists = AT_OF.get(task, {}).get(o["of"]) if o["kind"] == "scalar" else None
        if "at" in o:
            if not lists: W("unknown-field", at + ".at", "ignored")
            elif not is_str(o["at"]) or not any(o["at"] in ids_of(m.get(l)) for l in lists.split("|")):
                E("ref", at + ".at", "not an id of model." + " or model.".join(lists.split("|")))
        if task == "citation" and o["of"] == "field":
            if not is_str(o.get("name")) or not ATOM_OK.fullmatch(o["name"]): E("value", at + ".name", "needs the name of a field (e.g. year, volume, page)")
        elif "name" in o: W("unknown-field", at + ".name", "ignored")
    L.check_outputs(spec, ID, KINDS, out, E, W)
    return P


def _collect(o, T, path, kind, out):
    if not is_obj(o): return
    for k, kd in T.items():
        if k not in o: continue
        v, p = o[k], path + "." + k
        if isinstance(kd, str):
            if kd.replace("!", "", 1) == kind and is_str(v): out.append([v, p])
            continue
        if "$obj" in kd: _collect(v, kd["$obj"], p, kind, out)
        elif "$list" in kd and isinstance(v, list):
            for i, x in enumerate(v):
                if isinstance(kd["$list"], str):
                    if kd["$list"] == kind and is_str(x): out.append([x, f"{p}[{i}]"])
                elif "$obj" in kd["$list"]: _collect(x, kd["$list"]["$obj"], f"{p}[{i}]", kind, out)


def exprs(spec):
    out = []
    if is_obj(spec) and is_obj(spec.get("model")): _collect(spec["model"], MODEL_T, "model", "numx", out)
    return [(s, p, []) for s, p in out]


def keys(spec):
    out = []
    if is_obj(spec) and is_obj(spec.get("model")): _collect(spec["model"], MODEL_T, "model", "key", out)
    return [tuple(x) for x in out]
