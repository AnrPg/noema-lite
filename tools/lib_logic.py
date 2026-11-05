"""logic@1 — the Python twin of engine/src/47_lib_logic.js (docs/library/logic.md): check_spec(spec), exprs(spec), keys(spec) give the
same problems (code, path, msg, level) and lists as the JS checkSpec / exprs / keys (tests/enginelib.js and tests/lib_logic.js compare
them on tests/fixtures/enginelib/logic.json). It carries the same formula parser (parse(text, lang): the same codes, positions and
messages), and does not compute the tasks."""
import re, sys
import enginelib as L

sys.setrecursionlimit(max(sys.getrecursionlimit(), 10000))
ID = "logic@1"
MAX_LEN, MAX_DEPTH, MAX_ATOMS, MAX_WORLDS, MAX_STATES, MAX_DOMAIN, MAX_ARGS, MAX_TRACE = 2000, 100, 12, 32, 256, 8, 24, 2000
MAX_FORMULAS, MAX_NORMS, MAX_LINES = 64, 200, 200

# ---------- the formula language (the same lexer and parser as the JS) ----------
LANGS = ["prop", "fol", "modal", "deontic", "dyadic", "epistemic", "ltl", "ctl"]
WORDS = {"box": "box", "dia": "dia", "not": "not", "and": "and", "or": "or", "implies": "imp", "iff": "iff", "xor": "xor", "true": "top", "false": "bot",
         "top": "top", "bot": "bot", "forall": "all", "exists": "ex"}
SYM3 = {"<->": "iff", "<=>": "iff"}
SYM2 = {"->": "imp", "=>": "imp", "<>": "dia", "[]": "box", "/\\": "and", "\\/": "or", "!=": "neq", "&&": "and", "||": "or"}
SYM1 = {"~": "not", "!": "not", "¬": "not", "∼": "not", "&": "and", "∧": "and", "|": "or", "∨": "or", "→": "imp", "⇒": "imp", "⊃": "imp", "↔": "iff",
        "⇔": "iff", "≡": "iff", "⊕": "xor", "⊤": "top", "⊥": "bot", "∀": "all", "∃": "ex", "□": "box", "◇": "dia", "◊": "dia", "≠": "neq",
        "(": "(", ")": ")", "[": "[", "]": "]", "{": "{", "}": "}", ",": ",", ".": ".", ":": ":", "/": "/", "=": "=", "<": "<", ">": ">"}
_ALPHA = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_")
_ALNUM = _ALPHA | set("0123456789")
ATOM_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,31}")
FEAT = {"prop": {}, "fol": {"fol"}, "modal": {"modal"}, "deontic": {"modal", "deon"}, "dyadic": {"modal", "deon", "dyad"},
        "epistemic": {"epi"}, "ltl": {"ltl"}, "ctl": {"ctl"}}
TEMP1, TEMP2, CTL2 = ["X", "F", "G"], ["U", "R", "W"], ["AX", "AF", "AG", "EX", "EF", "EG"]
EPI_RE = re.compile(r"(K|B)_([A-Za-z0-9]{1,16})")
GRP_RE = re.compile(r"(C|E|D)_([A-Za-z0-9]{1,16})")


def lex(text):
    cs, toks, i = list(text), [], 0
    while i < len(cs):
        c = cs[i]
        if c in " \t\n\r": i += 1; continue
        if c in _ALPHA:
            j = i
            while j < len(cs) and cs[j] in _ALNUM: j += 1
            w = "".join(cs[i:j])
            toks.append({"k": "op", "v": WORDS[w], "raw": w, "pos": i} if w in WORDS else {"k": "id", "v": w, "raw": w, "pos": i})
            i = j; continue
        s3, s2 = "".join(cs[i:i + 3]), "".join(cs[i:i + 2])
        if s3 in SYM3: toks.append({"k": "op", "v": SYM3[s3], "raw": s3, "pos": i}); i += 3; continue
        if s2 in SYM2: toks.append({"k": "op", "v": SYM2[s2], "raw": s2, "pos": i}); i += 2; continue
        if c in SYM1: toks.append({"k": "op", "v": SYM1[c], "raw": c, "pos": i}); i += 1; continue
        return None, {"code": "parse-char", "pos": i, "msg": f'unknown character "{c}" at {i}'}
    toks.append({"k": "eof", "v": "", "raw": "", "pos": len(cs)})
    return toks, None


class _PErr(Exception):
    def __init__(self, code, pos, msg): self.e = {"code": code, "pos": pos, "msg": msg}


def parse(text, lang="prop"):
    """parse(text, lang) → {"ok": True, "ast": …} or {"ok": False, "code", "pos", "msg"} (the same as the JS parse)"""
    F = FEAT.get(lang, set())
    if not isinstance(text, str) or text.strip() == "": return {"ok": False, "code": "parse-empty", "pos": 0, "msg": "the formula is empty"}
    if len(text) > MAX_LEN: return {"ok": False, "code": "parse-long", "pos": MAX_LEN, "msg": f"longer than {MAX_LEN} characters"}
    T, err = lex(text)
    if err: return dict({"ok": False}, **err)
    st = {"p": 0, "depth": 0, "bar": False}

    def bad(code, pos, msg): raise _PErr(code, pos, msg)
    def cur(): return T[st["p"]]
    def nx(): return T[st["p"] + 1]
    def is_op(t, v): return t["k"] == "op" and t["v"] == v
    def unexpected(t):
        if t["k"] == "eof": bad("parse-eof", t["pos"], f"the formula ends too soon at {t['pos']}")
        bad("parse-token", t["pos"], f'unexpected "{t["raw"]}" at {t["pos"]}')
    def not_here(t): bad("parse-op", t["pos"], f'"{t["raw"]}" is not an operator of the {lang} language at {t["pos"]}')
    def expect(v, opn):
        t = cur()
        if is_op(t, v): st["p"] += 1; return
        bad("parse-paren", t["pos"], f'"{v}" is missing (to close "{opn["raw"]}" at {opn["pos"]}) at {t["pos"]}')
    def enter(t):
        st["depth"] += 1
        if st["depth"] > MAX_DEPTH: bad("parse-deep", t["pos"], f"nested deeper than {MAX_DEPTH} levels at {t['pos']}")

    def iff():
        a = imp()
        while is_op(cur(), "iff"):
            t = cur(); st["p"] += 1; a = {"t": "iff", "a": a, "b": imp(), "pos": t["pos"]}
        return a
    def imp():
        a = orr()
        if is_op(cur(), "imp"):
            t = cur(); st["p"] += 1; enter(t); b = imp(); st["depth"] -= 1
            return {"t": "imp", "a": a, "b": b, "pos": t["pos"]}
        return a
    def orr():
        a = andd()
        while True:
            t = cur()
            if is_op(t, "or") and not (st["bar"] and t["raw"] == "|"): st["p"] += 1; a = {"t": "or", "a": a, "b": andd(), "pos": t["pos"]}
            elif is_op(t, "xor"): st["p"] += 1; a = {"t": "xor", "a": a, "b": andd(), "pos": t["pos"]}
            else: return a
    def andd():
        a = binr()
        while is_op(cur(), "and"):
            t = cur(); st["p"] += 1; a = {"t": "and", "a": a, "b": binr(), "pos": t["pos"]}
        return a
    def binr():
        a = un(); t = cur()
        if ("ltl" in F or "ctl" in F) and t["k"] == "id" and t["v"] in TEMP2:
            st["p"] += 1; enter(t); b = binr(); st["depth"] -= 1
            return {"t": t["v"], "a": a, "b": b, "pos": t["pos"]}
        return a
    def group(opn, close):
        sv = st["bar"]; st["bar"] = False; a = iff(); st["bar"] = sv; expect(close, opn); return a
    def un():
        t = cur(); enter(t); r = un1(t); st["depth"] -= 1; return r
    def un1(t):
        if t["k"] == "op":
            v = t["v"]
            if v == "not": st["p"] += 1; return {"t": "not", "a": un(), "pos": t["pos"]}
            if v == "top": st["p"] += 1; return {"t": "top", "pos": t["pos"]}
            if v == "bot": st["p"] += 1; return {"t": "bot", "pos": t["pos"]}
            if v == "(": st["p"] += 1; return group(t, ")")
            if v in ("all", "ex"):
                if "fol" not in F: not_here(t)
                st["p"] += 1; vv = cur()
                if vv["k"] != "id": unexpected(vv)
                st["p"] += 1
                if is_op(cur(), ".") or is_op(cur(), ":"): st["p"] += 1; return {"t": v, "v": vv["v"], "a": iff(), "pos": t["pos"]}
                return {"t": v, "v": vv["v"], "a": un(), "pos": t["pos"]}
            if v in ("box", "dia"):
                if "modal" not in F: not_here(t)
                st["p"] += 1; return {"t": v, "a": un(), "pos": t["pos"]}
            if v in ("[", "<"):
                close = "]" if v == "[" else ">"
                if "epi" in F:
                    st["p"] += 1; f = group(t, close); return {"t": "ann" if v == "[" else "annd", "f": f, "a": un(), "pos": t["pos"]}
                if "modal" in F and nx()["k"] == "id" and is_op(T[st["p"] + 2], close):
                    st["p"] += 3; return {"t": "box" if v == "[" else "dia", "ag": T[st["p"] - 2]["v"], "a": un(), "pos": t["pos"]}
                if "modal" in F or v == "<": unexpected(t)
                not_here(t)
            unexpected(t)
        if t["k"] == "eof": unexpected(t)
        w = t["v"]
        if "deon" in F and w in ("O", "P", "F"):
            st["p"] += 1
            if "dyad" in F and is_op(cur(), "("):
                opn = cur(); st["p"] += 1
                sv = st["bar"]; st["bar"] = True; a = iff(); st["bar"] = sv
                c = None
                if is_op(cur(), "/") or (is_op(cur(), "or") and cur()["raw"] == "|"):
                    st["p"] += 1; sv2 = st["bar"]; st["bar"] = True; c = iff(); st["bar"] = sv2
                expect(")", opn)
                return {"t": w, "a": a, "c": c, "pos": t["pos"]}
            return {"t": w, "a": un(), "pos": t["pos"]}
        if "epi" in F:
            m = EPI_RE.fullmatch(w)
            if m: st["p"] += 1; return {"t": m.group(1), "ag": m.group(2), "a": un(), "pos": t["pos"]}
            if w in ("K", "B"): bad("parse-agent", t["pos"], f"{w} needs an agent ({w}_a) at {t['pos']}")
            m = GRP_RE.fullmatch(w)
            if m: st["p"] += 1; return {"t": m.group(1) + "K", "g": [m.group(2)], "a": un(), "pos": t["pos"]}
            if w in ("C_", "E_", "D_") and is_op(nx(), "{"):
                opn = nx(); st["p"] += 2; g = []
                while True:
                    a = cur()
                    if a["k"] != "id": unexpected(a)
                    g.append(a["v"]); st["p"] += 1
                    if is_op(cur(), ","): st["p"] += 1; continue
                    break
                expect("}", opn)
                return {"t": w[0] + "K", "g": g, "a": un(), "pos": t["pos"]}
            if w in ("C", "E", "D"): st["p"] += 1; return {"t": w + "K", "g": None, "a": un(), "pos": t["pos"]}
        if "ltl" in F and w in TEMP1: st["p"] += 1; return {"t": "Fe" if w == "F" else w, "a": un(), "pos": t["pos"]}
        if ("ltl" in F or "ctl" in F) and w in TEMP2: unexpected(t)
        if "ctl" in F:
            if w in CTL2:
                st["p"] += 1; o = w[1]
                return {"t": "A" if w[0] == "A" else "E", "p": {"t": "Fe" if o == "F" else o, "a": un(), "pos": t["pos"]}, "pos": t["pos"]}
            if w in ("A", "E"):
                st["p"] += 1; n = cur()
                if n["k"] == "id" and n["v"] in TEMP1:
                    st["p"] += 1; return {"t": w, "p": {"t": "Fe" if n["v"] == "F" else n["v"], "a": un(), "pos": n["pos"]}, "pos": t["pos"]}
                if is_op(n, "[") or is_op(n, "("):
                    st["p"] += 1; inner = group(n, "]" if n["v"] == "[" else ")")
                    if inner["t"] not in TEMP2: bad("parse-ctl", n["pos"], f"{w} needs a path formula (X, F, G, or φ U ψ, φ R ψ, φ W ψ) at {n['pos']}")
                    return {"t": w, "p": inner, "pos": t["pos"]}
                bad("parse-ctl", n["pos"], f"{w} needs a path formula (X, F, G, or φ U ψ, φ R ψ, φ W ψ) at {n['pos']}")
            if w in TEMP1: bad("parse-ctl", t["pos"], f"{w} must stand right after A or E in CTL at {t['pos']}")
        st["p"] += 1
        if "fol" in F:
            args = None
            if is_op(cur(), "("): args = term_args(cur())
            if is_op(cur(), "=") or is_op(cur(), "neq"):
                op = cur(); st["p"] += 1
                r = term()
                e = {"t": "eq", "l": {"t": "fn", "n": w, "args": args or []}, "r": r, "pos": op["pos"]}
                return {"t": "not", "a": e, "pos": op["pos"]} if op["v"] == "neq" else e
            return {"t": "pred", "n": w, "args": args or [], "pos": t["pos"]}
        return {"t": "atom", "n": w, "pos": t["pos"]}
    def term_args(opn):
        st["p"] += 1; args = []
        while True:
            args.append(term())
            if is_op(cur(), ","): st["p"] += 1; continue
            break
        expect(")", opn)
        return args
    def term():
        t = cur()
        if t["k"] != "id": unexpected(t)
        enter(t); st["p"] += 1
        r = {"t": "fn", "n": t["v"], "args": term_args(cur()) if is_op(cur(), "(") else []}
        st["depth"] -= 1
        return r
    try:
        ast = iff()
        if cur()["k"] != "eof": unexpected(cur())
        if "ctl" in F: _ctl_check(ast, bad)
        return {"ok": True, "ast": ast}
    except _PErr as e:
        return dict({"ok": False}, **e.e)


def _ctl_check(f, bad):
    if not isinstance(f, dict): return
    if f["t"] in ("X", "Fe", "G", "U", "R", "W"): bad("parse-ctl", f["pos"], f"{'F' if f['t'] == 'Fe' else f['t']} must stand right after A or E in CTL at {f['pos']}")
    if f["t"] in ("A", "E"):
        q = f["p"]; _ctl_check(q["a"], bad)
        if q.get("b"): _ctl_check(q["b"], bad)
        return
    for k in ("a", "b"):
        if f.get(k): _ctl_check(f[k], bad)


def atoms_of(f, out=None):
    out = [] if out is None else out
    def go(g):
        if not isinstance(g, dict): return
        if g["t"] == "atom":
            if g["n"] not in out: out.append(g["n"])
            return
        for k in ("a", "b", "c", "f", "p"):
            if g.get(k): go(g[k])
    go(f)
    return out


def horn_rule(f):
    if f["t"] == "atom": return True
    if f["t"] == "imp":
        ok = [True]
        def go(g):
            if g["t"] == "and": go(g["a"]); go(g["b"])
            elif g["t"] in ("atom", "top"): pass
            else: ok[0] = False
        go(f["a"])
        if not ok[0]: return False
        if f["b"]["t"] in ("atom", "bot"): return True
    if f["t"] == "not" and f["a"]["t"] == "atom": return True
    return False


def agents_of(f, out=None):
    out = [] if out is None else out
    def go(g):
        if not isinstance(g, dict): return
        if g.get("ag") and g["ag"] not in out: out.append(g["ag"])
        if g.get("g"):
            for a in g["g"]:
                if a not in out: out.append(a)
        for k in ("a", "b", "c", "f", "p"):
            if g.get(k): go(g[k])
    go(f)
    return out


def preds_of(f, out=None):
    out = [] if out is None else out
    def go(g):
        if not isinstance(g, dict): return
        if g["t"] == "pred": out.append([g["n"], len(g["args"])])
        for k in ("a", "b"):
            if g.get(k): go(g[k])
    go(f)
    return out


# ---------- the model format (the same table as the JS) ----------
ND_RULES = ["premise", "assume", "reit", "andI", "andE", "orI", "orE", "impI", "impE", "iffI", "iffE", "notI", "notE", "botE", "dne", "ip", "lem", "topI", "mt"]
MV = ["k3", "lp", "l3", "lukasiewicz", "godel", "product"]
SYSTEMS = ["K", "D", "T", "K4", "S4"]
SEMANTICS = ["grounded", "complete", "preferred", "stable"]
IO_OPS = ["out1", "out2", "out3", "out4"]
LEX = ["superior", "specialis", "posterior"]
TASKS = ["truth-table", "equivalent", "entails", "normal-form", "sat", "resolution", "proof", "horn", "many-valued", "fol-eval", "unify",
         "fol-resolution", "syllogism", "kripke", "tableau", "epistemic", "ltl", "ctl", "dyadic", "io", "norms", "af"]
FORMS = ["nnf", "cnf", "dnf", "tseitin", "prenex", "skolem", "clausal"]
FOL_FORMS = ["prenex", "skolem", "clausal"]
ATOMV_T = {"atom": "id!", "value": "numx!"}
WORLD_T = {"id": "id!", "holds": {"$list": "id", "max": 64}, "x": "numx", "y": "numx", "rank": "int:0:1000", "label": "key"}
EDGE_T = {"u": "ref!", "v": "ref!", "ag": "id", "on": "numx"}
STEP_T = {"holds": {"$list": "id", "max": 64}, "facts": {"$list": "id", "max": 64}, "acts": {"$list": "id", "max": 64}, "t": "fin"}
PRED_T = {"name": "id!", "tuples": {"$list": {"$list": "ref", "max": 4}, "max": 4096}}
FUNC_T = {"name": "id!", "map": {"$list": {"$list": "ref", "max": 5}, "max": 4096}}
CONST_T = {"name": "id!", "value": "ref!"}
LINE_T = {"f": "expr!", "rule": "enum:" + "|".join(ND_RULES) + "!", "refs": {"$list": "int:1:200", "max": 2}, "boxes": {"$list": "int:1:200", "max": 2}, "depth": "int:0:20"}
ARG_T = {"id": "id!", "label": "key", "x": "numx", "y": "numx"}
ATT_T = {"u": "ref!", "v": "ref!", "on": "numx"}
NORM_T = {"id": "id!", "kind": "enum:O|F|P", "cond": "expr", "act": "expr", "mode": "enum:achieve|maintain", "deadline": "expr", "within": "int:0:2000", "by": "fin",
          "until": "expr", "agent": "id", "scope": "enum:one|each", "rank": "int:-1000:1000", "issued": "fin", "on": "numx"}
PUZ_T = {"kind": "enum:muddy|cheryl|consecutive!", "n": "int:1:15", "muddy": "int:0:5", "a": "int:0:15", "b": "int:0:15"}
MODEL_T = {
    "task": "enum:" + "|".join(TASKS) + "!", "logic": "enum:" + "|".join(MV), "system": "enum:" + "|".join(SYSTEMS), "form": "enum:" + "|".join(FORMS),
    "solver": "enum:dpll|cdcl", "method": "enum:forward|backward", "semantics": "enum:" + "|".join(SEMANTICS), "op": "enum:" + "|".join(IO_OPS), "throughput": "bool",
    "formula": "expr", "formulas": {"$list": "expr", "max": MAX_FORMULAS}, "premises": {"$list": "expr", "max": MAX_FORMULAS}, "goal": "expr", "pick": "numx",
    "assign": {"$list": {"$obj": ATOMV_T}, "max": MAX_ATOMS}, "atoms": {"$list": "id", "max": MAX_ATOMS}, "levels": "int:2:11", "designated": "unit",
    "worlds": {"$list": {"$obj": WORLD_T}, "max": MAX_STATES}, "edges": {"$list": {"$obj": EDGE_T}, "max": 4096}, "agents": {"$list": "id", "max": 8}, "s5": "bool",
    "world": "ref", "at": "numx", "initial": "ref", "preset": "enum:mutex", "announce": {"$list": "expr", "max": MAX_FORMULAS}, "puzzle": {"$obj": PUZ_T},
    "trace": {"$list": {"$obj": STEP_T}, "max": MAX_TRACE}, "loop": "int:0:1999", "pos": "numx", "step": "numx",
    "domain": {"$list": "id", "max": MAX_DOMAIN}, "size": "int:1:8", "preds": {"$list": {"$obj": PRED_T}, "max": 32}, "funcs": {"$list": {"$obj": FUNC_T}, "max": 16},
    "consts": {"$list": {"$obj": CONST_T}, "max": 32}, "terms": {"$list": "expr", "max": 8}, "vars": {"$list": "id", "max": 32}, "bound": "int:1:2000",
    "proof": {"$list": {"$obj": LINE_T}, "max": MAX_LINES}, "mood": "id", "figure": "int:1:4", "existential": "bool",
    "args": {"$list": {"$obj": ARG_T}, "max": MAX_ARGS}, "attacks": {"$list": {"$obj": ATT_T}, "max": 600}, "arg": "ref", "ext": "numx",
    "norms": {"$list": {"$obj": NORM_T}, "max": MAX_NORMS}, "input": {"$list": "expr", "max": MAX_FORMULAS}, "order": {"$list": "enum:" + "|".join(LEX), "max": 3},
    "view": {"$list": "fin", "min": 4, "max": 4},
}
REQ = {"truth-table": ["formula|formulas"], "equivalent": ["formulas"], "entails": ["goal"], "normal-form": ["formula", "form"], "sat": ["formula|formulas"],
       "resolution": ["premises|goal"], "proof": ["proof"], "horn": ["formulas", "goal"], "many-valued": ["formula", "logic"], "fol-eval": ["formula", "domain|size"],
       "unify": ["terms"], "fol-resolution": ["premises|goal"], "syllogism": ["mood", "figure"], "kripke": ["worlds"], "tableau": ["formula|goal"],
       "epistemic": ["worlds|puzzle", "formula"], "ltl": ["trace", "formula"], "ctl": ["worlds|preset", "formula"], "dyadic": ["worlds", "formula"], "io": ["norms", "goal", "op"],
       "norms": ["norms", "trace"], "af": ["args"]}
LANG_OF = {"fol-eval": "fol", "unify": "fol", "fol-resolution": "fol", "kripke": "deontic", "tableau": "deontic", "epistemic": "epistemic", "ltl": "ltl", "ctl": "ctl", "dyadic": "dyadic"}
ATOM_TASKS = ["truth-table", "equivalent", "entails", "many-valued", "io"]
MODEL_TASKS = ["kripke", "epistemic", "ctl", "dyadic"]
COMMON_S = ["flag"]
TASK_OUT = {
    "truth-table": [["valid", "satisfiable", "models", "rows", "value", "atoms"], ["column"]],
    "equivalent": [["equivalent", "countermodels", "atoms"], ["column"]],
    "entails": [["entails", "countermodels", "consistent", "atoms"], []],
    "normal-form": [["size", "clauses", "literals", "vars", "equivalent", "skolems"], []],
    "sat": [["satisfiable", "decisions", "propagations", "conflicts", "learned", "backtracks", "clauses", "vars", "steps", "frame"], ["levels"]],
    "resolution": [["refuted", "generated", "proofLength", "clauses", "steps", "frame"], []],
    "proof": [["valid", "errors", "firstError", "lines"], ["lineCodes"]],
    "horn": [["entails", "derived", "steps", "frame"], []],
    "many-valued": [["value", "valid", "satisfiable", "min", "max"], ["column"]],
    "fol-eval": [["value", "count", "domain"], []],
    "unify": [["unifiable", "bindings", "steps"], []],
    "fol-resolution": [["refuted", "generated", "proofLength", "clauses", "steps", "frame"], []],
    "syllogism": [["valid", "validTraditional"], []],
    "kripke": [["value", "count", "worlds", "reflexive", "serial", "transitive", "symmetric", "euclidean", "axT", "axD", "ax4", "ax5", "axB"], ["truth"]],
    "tableau": [["valid", "satisfiable", "nodes", "worlds", "steps", "frame"], []],
    "epistemic": [["value", "count", "worlds", "steps", "frame"], ["truth", "worldsLeft"]],
    "ltl": [["value", "count"], ["truth"]],
    "ctl": [["value", "count", "worlds"], ["truth"]],
    "dyadic": [["value", "count", "worlds"], ["truth"]],
    "io": [["entails", "triggered"], []],
    "norms": [["violations", "fulfilments", "pending", "conflicts", "steps", "frame"], ["violationsPerStep", "activePerStep"]],
    "af": [["extensions", "credulous", "skeptical", "accepted", "inCount", "steps", "frame"], ["labels"]],
}
CODES = ["budget", "bound", "trace-truncated", "size", "vacuous", "correspondence", "deadlock", "not-serial", "not-equivalence", "inconsistent-input",
         "conflict", "unresolved", "no-stable", "occurs", "clash", "grid-only", "scene-truncated", "series-truncated", "contradiction", "nd-error", "nd-open",
         "nd-goal", "boundary", "finite", "empty", "parse", "norm"]
KINDS3 = ["scalar", "series", "scene"]


def lang_of(m):
    return "fol" if m.get("task") == "normal-form" and m.get("form") in FOL_FORMS else LANG_OF.get(m.get("task"), "prop")


def formula_fields(m):
    out = []
    def lst(k):
        if isinstance(m.get(k), list):
            for i, s in enumerate(m[k]):
                if isinstance(s, str): out.append([s, f"model.{k}[{i}]"])
    if isinstance(m.get("formula"), str): out.append([m["formula"], "model.formula"])
    lst("formulas"); lst("premises")
    if isinstance(m.get("goal"), str): out.append([m["goal"], "model.goal"])
    lst("announce"); lst("input")
    if isinstance(m.get("norms"), list):
        for i, nm in enumerate(m["norms"]):
            for f in ("cond", "act", "deadline", "until"):
                if isinstance(nm, dict) and isinstance(nm.get(f), str): out.append([nm[f], f"model.norms[{i}].{f}"])
    if isinstance(m.get("proof"), list):
        for i, ln in enumerate(m["proof"]):
            if isinstance(ln, dict) and isinstance(ln.get("f"), str): out.append([ln["f"], f"model.proof[{i}].f"])
    return out


def puz_agents(pz):
    return ["c%d" % (i + 1) for i in range(pz.get("n") or 3)] if pz.get("kind") == "muddy" else ["a", "b"]


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    noop = lambda o, at, E, W: True
    if not L.is_obj(m):
        E("format", "model", "not an object"); L.check_outputs(spec, ID, KINDS3, noop, E, W); return P
    L.walk(m, MODEL_T, "model", E, W)
    if L.has_errors(P):
        L.check_outputs(spec, ID, KINDS3, noop, E, W); return P
    task, lang = m["task"], lang_of(m)
    for r in REQ[task]:
        if not any(f in m for f in r.split("|")):
            E("value", "model." + r.split("|")[0], f"missing ({task} needs {', '.join(' or '.join(x.split('|')) for x in REQ[task])})")
    parsed = []
    for s, p in formula_fields(m):
        r = parse(s, "prop" if p.startswith("model.norms") or p.startswith("model.input") else lang)
        if not r["ok"]: E(r["code"], p, r["msg"])
        else: parsed.append([r["ast"], p])
    if isinstance(m.get("terms"), list):
        for i, s in enumerate(m["terms"]):
            r, p = parse(s, "fol"), f"model.terms[{i}]"
            if not r["ok"]: E(r["code"], p, r["msg"])
            elif r["ast"]["t"] != "pred": E("term", p, "needs a term (a name, or f(t1, …, tn))")
    if task in ATOM_TASKS:
        at = []
        for f, _ in parsed: atoms_of(f, at)
        if len(at) > MAX_ATOMS: E("size", "model", f"more than {MAX_ATOMS} atoms ({len(at)})")
    if task == "equivalent" and isinstance(m.get("formulas"), list) and len(m["formulas"]) < 2: E("value", "model.formulas", "needs two formulas")
    if task == "unify" and isinstance(m.get("terms"), list) and len(m["terms"]) < 2: E("value", "model.terms", "needs two terms or more")
    if task == "horn":
        for f, p in parsed:
            if p.startswith("model.formulas") and not horn_rule(f): E("horn", p, "not a Horn clause (p, a ∧ b → c, a ∧ b → ⊥)")
            if p == "model.goal" and f["t"] != "atom": E("horn", p, "needs an atom")
    if task == "syllogism" and "mood" in m and not re.fullmatch(r"[AEIO]{3}", m["mood"]): E("value", "model.mood", "needs three of A, E, I, O (AAA … OOO)")
    if task == "fol-eval":
        if "domain" in m and "size" in m: E("value", "model.size", "give domain or size, not both")
        dom = m["domain"] if isinstance(m.get("domain"), list) else ["d%d" % i for i in range(m.get("size") or 0)]
        if "domain" in m and not dom: E("size", "model.domain", "needs at least one element")
        in_dom, ar = set(dom), {}
        for i, pd in enumerate(m.get("preds") or []):
            a = None
            for j, tp in enumerate(pd.get("tuples") or []):
                if a is None: a = len(tp)
                elif len(tp) != a: E("arity", f"model.preds[{i}].tuples[{j}]", f"needs {a} elements like the first tuple")
                for k, x in enumerate(tp):
                    if x not in in_dom: E("ref", f"model.preds[{i}].tuples[{j}][{k}]", "not an element of the domain")
            ar[pd["name"]] = a
        for i, c in enumerate(m.get("consts") or []):
            if c["value"] not in in_dom: E("ref", f"model.consts[{i}].value", "not an element of the domain")
        for i, fn in enumerate(m.get("funcs") or []):
            for j, row in enumerate(fn.get("map") or []):
                for k, x in enumerate(row):
                    if x not in in_dom: E("ref", f"model.funcs[{i}].map[{j}][{k}]", "not an element of the domain")
        for f, p in parsed:
            for nm, k in preds_of(f):
                if nm not in ar: E("ref", p, f"the predicate {nm} is not in model.preds"); break
                if ar[nm] is not None and ar[nm] != k: E("arity", p, f"{nm} takes {ar[nm]} arguments, not {k}"); break
    ids = set()
    if task in MODEL_TASKS and isinstance(m.get("worlds"), list):
        cap = MAX_STATES if task == "ctl" else MAX_WORLDS
        if len(m["worlds"]) > cap: E("size", "model.worlds", f"more than {cap} {'states' if task == 'ctl' else 'worlds'}")
        for i, w in enumerate(m["worlds"]):
            if w["id"] in ids: E("duplicate", f"model.worlds[{i}].id", f"the world {w['id']} is listed twice")
            ids.add(w["id"])
            for j, a in enumerate(w.get("holds") or []):
                if not ATOM_RE.fullmatch(a): E("value", f"model.worlds[{i}].holds[{j}]", "needs an atom name (a letter or _, then letters, digits, _)")
        for i, e in enumerate(m.get("edges") or []):
            for f in ("u", "v"):
                if e[f] not in ids: E("ref", f"model.edges[{i}].{f}", "not a world of the model")
        for f in ("world", "initial"):
            if f in m and m[f] not in ids: E("ref", "model." + f, "not a world of the model")
    if (task == "epistemic" and "worlds" in m and "puzzle" in m) or (task == "ctl" and "worlds" in m and "preset" in m):
        E("value", "model.preset" if task == "ctl" else "model.puzzle", "give worlds or " + ("preset" if task == "ctl" else "puzzle") + ", not both")
    if task == "epistemic":
        pz = m.get("puzzle")
        if pz and pz["kind"] == "muddy" and (pz.get("n") or 3) > 5: E("size", "model.puzzle.n", "at most 5 children (32 worlds)")
        if pz and pz["kind"] == "muddy" and "muddy" in pz and pz["muddy"] > (pz.get("n") or 3): E("value", "model.puzzle.muddy", "at most n")
        ags = puz_agents(pz) if pz and "worlds" not in m else (m.get("agents") or [])
        for i, e in enumerate(m.get("edges") or []):
            if "ag" not in e or e["ag"] not in ags: E("agent", f"model.edges[{i}].ag", "needs an agent of model.agents")
        for f, p in parsed:
            for a in agents_of(f):
                if a not in ags: E("agent", p, f"the agent {a} is not in model.agents"); break
    if task == "ltl" and "loop" in m and isinstance(m.get("trace"), list) and m["loop"] >= len(m["trace"]): E("value", "model.loop", "needs a position of the trace")
    if task == "af" and isinstance(m.get("args"), list):
        aids = set()
        for i, a in enumerate(m["args"]):
            if a["id"] in aids: E("duplicate", f"model.args[{i}].id", f"the argument {a['id']} is listed twice")
            aids.add(a["id"])
        for i, e in enumerate(m.get("attacks") or []):
            for f in ("u", "v"):
                if e[f] not in aids: E("ref", f"model.attacks[{i}].{f}", "not an argument of the framework")
        if "arg" in m and m["arg"] not in aids: E("ref", "model.arg", "not an argument of the framework")
    if task in ("norms", "io") and isinstance(m.get("norms"), list):
        nids = set()
        for i, nm in enumerate(m["norms"]):
            if nm["id"] in nids: E("duplicate", f"model.norms[{i}].id", f"the norm {nm['id']} is listed twice")
            nids.add(nm["id"])
            if "act" not in nm: E("value", f"model.norms[{i}].act", "missing")
            if task == "norms" and "kind" not in nm: E("value", f"model.norms[{i}].kind", "missing (O, F or P)")
    SC, SE = TASK_OUT[task]

    def out(o, at, E, W):
        for k in o:
            if k not in ("id", "kind", "of", "code"): W("unknown-field", at + "." + k, "ignored")
        lst = SC + COMMON_S if o["kind"] == "scalar" else SE if o["kind"] == "series" else ["drawing"]
        if o["of"] not in lst:
            E("output", at + ".of", f"{o['kind']} outputs of {ID} for {task}: {', '.join(lst) or 'none'}"); return
        if o["kind"] == "scalar" and o["of"] == "flag":
            if not isinstance(o.get("code"), str) or o.get("code") not in CODES: E("enum", at + ".code", "one of " + ", ".join(CODES))
        elif "code" in o: W("unknown-field", at + ".code", "ignored")
    L.check_outputs(spec, ID, KINDS3, out, E, W)
    return P


def exprs(spec):
    out, m = [], spec.get("model") if isinstance(spec, dict) else None
    if not L.is_obj(m): return out
    def sx(v, p):
        if isinstance(v, str): out.append([v, p, []])
    for f in ("pick", "at", "pos", "step", "ext"): sx(m.get(f), "model." + f)
    def lst(k, fs):
        if isinstance(m.get(k), list):
            for i, x in enumerate(m[k]):
                if L.is_obj(x):
                    for f in fs: sx(x.get(f), f"model.{k}[{i}].{f}")
    lst("assign", ["value"]); lst("worlds", ["x", "y"]); lst("edges", ["on"]); lst("args", ["x", "y"]); lst("attacks", ["on"]); lst("norms", ["on"])
    return out


def keys(spec):
    out, m = [], spec.get("model") if isinstance(spec, dict) else None
    if not L.is_obj(m): return out
    for k in ("worlds", "args"):
        if isinstance(m.get(k), list):
            for i, x in enumerate(m[k]):
                if L.is_obj(x) and isinstance(x.get("label"), str): out.append([x["label"], f"model.{k}[{i}].label"])
    return out
