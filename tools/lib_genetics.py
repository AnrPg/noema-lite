"""genetics@1 — the Python twin of src/engines/genetics/genetics.js (docs/library/genetics.md): check_spec(spec), exprs(spec) and
keys(spec) give the same problems (code, path, msg, level) and the same lists as the JS checkSpec / exprs / keys. It does not
simulate. Parity: node tests/enginelib.js (tests/fixtures/enginelib/genetics.json)."""
import re
import enginelib as L

ID = "genetics@1"
BUDGET = 200000
MODES = ["cross", "pedigree", "hw", "selection", "drift", "map", "coalescent", "ld", "quant"]

LOCUS = {"id": "name!", "alleles": {"$req": True, "$list": "id", "min": 1, "max": 6}, "dominance": "enum:complete|incomplete|codominant",
         "codominant": {"$list": {"$list": "id", "min": 2, "max": 2}, "max": 6}, "chrom": "enum:auto|X|Z",
         "lethal": {"$list": {"$obj": {"genotype": {"$req": True, "$list": "id", "min": 1, "max": 2}, "viability": "numx"}}, "max": 8}}
PARENT = {"$req": True, "$map": {"$list": "id", "min": 1, "max": 2}, "max": 6}
TABLES = {
    "cross": {"mode": "enum:cross!", "loci": {"$req": True, "$list": {"$obj": LOCUS}, "min": 1, "max": 6}, "p1": PARENT, "p2": PARENT,
              "linkage": {"$list": {"$obj": {"a": "ref!", "b": "ref!", "r": "numx!"}}, "max": 5}, "coincidence": "numx",
              "epistasis": {"$obj": {"a": "ref!", "b": "ref!", "type": "enum:none|recessive|dominant|duplicateRecessive|duplicateDominant|dominantSuppression|cumulative|custom!", "classes": {"$list": "int:0:3", "min": 4, "max": 4}}},
              "observed": {"$list": "numx", "max": 64}, "classLabels": {"$list": "key", "max": 16}},
    "pedigree": {"mode": "enum:pedigree!", "inheritance": "enum:AD|AR|XD|XR|Y|mt!", "q": "numx", "penetrance": "numx", "phenocopy": "numx", "showRisk": "bool",
                 "people": {"$req": True, "$list": {"$obj": {"id": "id!", "sex": "enum:f|m|u!", "mother": "ref", "father": "ref", "affected": "bool"}}, "min": 1, "max": 24}},
    "hw": {"mode": "enum:hw!", "freqs": {"$req": True, "$list": "numx", "min": 2, "max": 8}, "F": "numx", "chrom": "enum:auto|X", "counts": {"$list": "numx", "min": 3, "max": 3}},
    "selection": {"mode": "enum:selection!", "p0": "numx!", "w11": "numx", "w12": "numx", "w22": "numx", "mu": "numx", "nu": "numx", "m": "numx", "pm": "numx", "drive": "numx", "gens": "numx"},
    "drift": {"mode": "enum:drift!", "process": "enum:wf|moran", "N": "numx!", "p0": "numx!", "s": "numx", "h": "numx", "mu": "numx", "nu": "numx", "reps": "numx", "gens": "numx"},
    "map": {"mode": "enum:map!", "r": "numx", "d": "numx",
            "threePoint": {"$obj": {"loci": {"$req": True, "$list": "id", "min": 3, "max": 3}, "classes": {"$req": True, "$list": {"$obj": {"alleles": {"$req": True, "$list": "int:0:1", "min": 3, "max": 3}, "n": "numx!"}}, "min": 2, "max": 8}}}},
    "coalescent": {"mode": "enum:coalescent!", "n": "numx!", "Ne": "numx!", "mu": "numx", "reps": "numx"},
    "ld": {"mode": "enum:ld!", "pAB": "numx", "pAb": "numx", "paB": "numx", "pab": "numx", "pA": "numx", "pB": "numx", "D": "numx", "c": "numx!", "gens": "numx", "Ne": "numx"},
    "quant": {"mode": "enum:quant!", "h2": "numx", "sigmaP": "numx", "S": "numx", "sel": "numx", "gens": "numx", "mean0": "numx", "a": "numx", "d": "numx", "p": "numx", "K": "numx", "Kr": "numx", "rel": "numx",
              "sim": {"$obj": {"N": "numx!", "L": "numx!", "gens": "numx!", "sel": "numx!", "h2": "numx!"}}},
}
S, SE, SC = "scalar", "series", "scene"
def _o(spec):
    out = {}
    for item in spec.split():
        name, _, rest = item.partition(":")
        kind, _, arg = rest.partition(":")
        out[name] = [{"s": S, "se": SE, "sc": SC}[kind]] + ([arg] if arg else [])
    return out
OUTS = {
    "cross": _o("frac:s:pattern classFrac:s:int ratio:s:int nClasses:s nGenotypes:s nGametes1:s nGametes2:s survival:s chi2:s df:s pValue:s minExpected:s valid:s "
                "classIndex:se classFracs:se ratios:se expected:se observed:se punnett:sc"),
    "pedigree": _o("carrier:s:id het:s:id affectedProb:s:id likelihood:s logL10:s consistent:s combos:s valid:s pedigree:sc"),
    "hw": _o("geno:s:pair het:s homo:s male:s:int xRatio:s:int n:s pHat:s Fhat:s expAA:s expAa:s expaa:s chi2:s df:s pChi2:s pExact:s valid:s "
             "pGrid:se fAA:se fAa:se faa:se deFinetti:sc"),
    "selection": _o("pFinal:s qFinal:s wbarFinal:s pEq:s eqStable:s deltaP0:s gens:s valid:s t:se p:se q:se wbar:se fAA:se fAa:se faa:se pGrid:se deltaPGrid:se wbarGrid:se"),
    "drift": _o("fixed:s lost:s segregating:s meanP:s meanH:s hTheory:s uTheory:s uNeutral:s tFix:s tLoss:s tAbs:s meanTfix:s valid:s "
                "t:se meanPs:se meanHs:se hTheoryS:se rep:se:int histX:se hist:se"),
    "map": _o("haldane:s kosambi:s rHaldane:s rKosambi:s middle:s d12:s d23:s dSum:s dOuter:s coincidence:s interference:s nTotal:s valid:s "
              "mapR:se mapMorgan:se mapHaldane:se mapKosambi:se geneMap:sc"),
    "coalescent": _o("tmrca:s totalLength:s S:s pi:s thetaW:s tajimaD:s eTmrca:s eTotal:s eS:s aN:s meanTmrca:s meanTotal:s meanS:s meanD:s valid:s "
                     "sfsI:se sfs:se sfsTheory:se tree:sc"),
    "ld": _o("D:s Dprime:s r2:s pA:s pB:s Dmax:s halfLife:s Dfinal:s r2Sved:s sigma2:s valid:s t:se Dt:se r2t:se"),
    "quant": _o("R:s i:s Sel:s meanFinal:s M:s alpha:s VA:s VD:s VG:s bvAA:s bvAa:s bvaa:s h2Liab:s xg:s xr:s "
                "simMean:s simVA:s simH2:s simP:s valid:s t:se mean:se simT:se simMeans:se simVAs:se simPs:se"),
}
ARG_MSG = {"pattern": "needs a genotype pattern (one token per locus: _, A_, A/a or A/)", "int": "needs an integer from 0 to 4095",
           "id": "needs the id of a person of the pedigree", "pair": "needs two allele indices i/j (0-based, i <= j)"}

is_obj = L.is_obj
def _isnum(v): return isinstance(v, (int, float)) and not isinstance(v, bool)
def _is_int(v): return _isnum(v) and float(v).is_integer()
def _has_list(v): return isinstance(v, list)
def _incl(lst, x):
    """JS Array.includes (SameValueZero): no bool/number confusion"""
    for y in lst:
        if type(y) is bool or type(x) is bool:
            if type(y) is bool and type(x) is bool and y == x: return True
        elif _isnum(y) and _isnum(x):
            if y == x: return True
        elif isinstance(y, str) and isinstance(x, str):
            if y == x: return True
        elif y is None and x is None: return True
    return False
def _uniq_count(a):
    keys = set()
    for i, x in enumerate(a):
        if isinstance(x, bool): keys.add("b" + ("true" if x else "false"))
        elif _isnum(x): keys.add("n" + repr(float(x)))
        elif isinstance(x, str): keys.add("s" + x)
        elif x is None: keys.add("z")
        else: keys.add("o" + str(i))
    return len(keys)
def _split_ws(s): return [t for t in re.split(r"[ \t\n\r]+", s) if t]
def _js_trim(s): return s.strip(" \t\n\r\x0b\x0c ﻿                　")
def _chrom(Lc): v = Lc.get("chrom"); return v if v else "auto"

def _pattern_ok(arg, loci):
    if not isinstance(arg, str): return False
    s = _js_trim(arg)
    if s.startswith("f:") or s.startswith("m:"): s = s[2:]
    tk = _split_ws(s)
    if len(tk) != len(loci): return False
    for i, t in enumerate(tk):
        Lc = loci[i]; al = Lc["alleles"] if isinstance(Lc.get("alleles"), list) else []
        if t == "_": continue
        if t.endswith("_"):
            if not _incl(al, t[:-1]): return False
            continue
        parts = t.split("/")
        if len(parts) != 2: return False
        if parts[1] == "":
            if not ((Lc.get("chrom") in ("X", "Z")) and _incl(al, parts[0])): return False
            continue
        if not (_incl(al, parts[0]) and _incl(al, parts[1])): return False
    return True

def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if is_obj(spec) else None
    mode = m["mode"] if is_obj(m) and isinstance(m.get("mode"), str) and m.get("mode") in MODES else None
    if not is_obj(m): E("format", "model", "not an object")
    elif not mode: E("enum", "model.mode", "one of " + ", ".join(MODES))
    else:
        L.walk(m, TABLES[mode], "model", E, W); _semantic(mode, m, E, W)
    def out(o, at, E2, W2):
        for k in o:
            if k not in ("id", "kind", "of", "arg"): W("unknown-field", at + "." + k, "ignored")
        if not mode: return
        d = OUTS[mode].get(o["of"])
        if not d or d[0] != o["kind"]:
            E("output", at + ".of", "one of " + ", ".join(k for k, v in OUTS[mode].items() if v[0] == o["kind"]) + f" (a {o['kind']} of mode {mode})"); return
        ak = d[1] if len(d) > 1 else None
        if not ak:
            if "arg" in o: W("unknown-field", at + ".arg", "ignored")
            return
        if "arg" not in o: E("output", at + ".arg", "missing"); return
        a = o["arg"]
        if ak == "int": good = _is_int(a) and 0 <= a <= 4095
        elif ak == "id": good = isinstance(a, str) and isinstance(m.get("people"), list) and any(is_obj(p) and p.get("id") == a for p in m["people"])
        elif ak == "pair":
            x = [int(v) for v in a.split("/")] if isinstance(a, str) and re.fullmatch(r"[0-7]/[0-7]", a) else None
            good = x is not None and x[0] <= x[1] and isinstance(m.get("freqs"), list) and x[1] < len(m["freqs"])
        else: good = isinstance(m.get("loci"), list) and all(is_obj(x) for x in m["loci"]) and _pattern_ok(a, m["loci"])
        if not good: E("output", at + ".arg", ARG_MSG[ak])
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P

def _n_geno(inh, sex):
    if inh == "mt": return 2
    if inh == "Y": return 2 if sex == "m" else 1
    return 2 if inh in ("XD", "XR") and sex == "m" else 3

def chain_of(edges):
    adj, order = {}, []
    for a, b in edges:
        for u, v in ((a, b), (b, a)):
            if u not in adj: adj[u] = []; order.append(u)
            adj[u].append(v)
    done, chains = set(), []
    for s in order:
        if s in done or len(adj[s]) != 1: continue
        ch = [s]; done.add(s); prev, cur = None, s
        while True:
            nx = next((x for x in adj[cur] if x != prev and x not in done), None)
            if nx is None: break
            ch.append(nx); done.add(nx); prev, cur = cur, nx
        chains.append(ch)
    return {"chains": chains, "cycle": any(k not in done for k in order)}

def _semantic(mode, m, E, W):
    if mode == "cross":
        raw = m["loci"] if isinstance(m.get("loci"), list) else []
        loci = [x for x in raw if is_obj(x)]
        ids = []
        for i, Lc in enumerate(raw):
            if not is_obj(Lc): continue
            at = f"model.loci[{i}]"
            if isinstance(Lc.get("id"), str):
                if Lc["id"] in ids: E("value", at + ".id", "duplicate id")
                ids.append(Lc["id"])
            al = Lc["alleles"] if isinstance(Lc.get("alleles"), list) else []
            if _uniq_count(al) != len(al): E("value", at + ".alleles", "duplicate allele")
            if any(isinstance(a, str) and "_" in a for a in al): E("value", at + ".alleles", "allele names cannot contain _")
            for j, pr in enumerate(Lc["codominant"] if isinstance(Lc.get("codominant"), list) else []):
                if isinstance(pr, list) and not all(_incl(al, a) for a in pr): E("ref", f"{at}.codominant[{j}]", "not an allele of this locus")
            for j, x in enumerate(Lc["lethal"] if isinstance(Lc.get("lethal"), list) else []):
                g = x["genotype"] if is_obj(x) and isinstance(x.get("genotype"), list) else None
                if g is None: continue
                if not all(_incl(al, a) for a in g): E("ref", f"{at}.lethal[{j}].genotype", "not an allele of this locus")
                elif len(g) == 1 and Lc.get("chrom") not in ("X", "Z"): E("value", f"{at}.lethal[{j}].genotype", "one allele only on an X- or Z-linked locus")
        chroms = [_chrom(x) for x in loci]
        if _incl(chroms, "X") and _incl(chroms, "Z"): E("value", "model.loci", "X- and Z-linked loci cannot be mixed")
        sysz = "Z" if _incl(chroms, "Z") else "X"
        for pk in ("p1", "p2"):
            G = m.get(pk)
            if not is_obj(G): continue
            for k in G:
                if k not in ids: E("ref", f"model.{pk}.{k}", "not a locus")
            for Lc in loci:
                if not isinstance(Lc.get("id"), str): continue
                if Lc["id"] not in G: E("value", f"model.{pk}.{Lc['id']}", "missing"); continue
                g = G[Lc["id"]]
                if not isinstance(g, list): continue
                al = Lc["alleles"] if isinstance(Lc.get("alleles"), list) else []
                if not all(_incl(al, a) for a in g): E("ref", f"model.{pk}.{Lc['id']}", "not an allele of this locus"); continue
                ch = _chrom(Lc)
                hemi = (ch == "X" and pk == "p2") or (ch == "Z" and pk == "p1")
                need = 2 if ch == "auto" or not hemi else 1
                if len(g) != need:
                    E("value", f"model.{pk}.{Lc['id']}", "needs 2 alleles" if need == 2 else f"needs 1 allele (the {'mother' if pk == 'p1' else 'father'} is hemizygous: {'ZW' if sysz == 'Z' else 'XY'})")
        deg, edges = {}, []
        for j, x in enumerate(m["linkage"] if isinstance(m.get("linkage"), list) else []):
            if not is_obj(x): continue
            at = f"model.linkage[{j}]"
            for f in ("a", "b"):
                if isinstance(x.get(f), str) and x[f] not in ids: E("ref", f"{at}.{f}", "not a locus")
            if not (isinstance(x.get("a"), str) and x["a"] in ids and isinstance(x.get("b"), str) and x["b"] in ids): continue
            if x["a"] == x["b"]: E("value", at, "a locus cannot be linked to itself"); continue
            ca = _chrom(next(Lc for Lc in loci if Lc.get("id") == x["a"])); cb = _chrom(next(Lc for Lc in loci if Lc.get("id") == x["b"]))
            if ca != cb: E("value", at, "linked loci must be on the same kind of chromosome"); continue
            deg[x["a"]] = deg.get(x["a"], 0) + 1; deg[x["b"]] = deg.get(x["b"], 0) + 1; edges.append([x["a"], x["b"]])
            if deg[x["a"]] > 2 or deg[x["b"]] > 2 or chain_of(edges)["cycle"]:
                E("value", at, "linkage must form chains of loci (each locus between at most two others, no loop)")
        ep = m.get("epistasis")
        if is_obj(ep) and isinstance(ep.get("a"), str) and isinstance(ep.get("b"), str):
            for f in ("a", "b"):
                if ep[f] not in ids: E("ref", f"model.epistasis.{f}", "not a locus")
            if ep["a"] in ids and ep["b"] in ids:
                if ep["a"] == ep["b"]: E("value", "model.epistasis", "needs two different loci")
                else:
                    for f in ("a", "b"):
                        Lc = next(x for x in loci if x.get("id") == ep[f])
                        al = Lc.get("alleles")
                        if not (isinstance(al, list) and len(al) == 2 and (Lc.get("dominance") or "complete") == "complete" and _chrom(Lc) == "auto"):
                            E("value", f"model.epistasis.{f}", "needs an autosomal locus with 2 alleles and complete dominance")
            if ep.get("type") == "custom" and not isinstance(ep.get("classes"), list):
                E("value", "model.epistasis.classes", "missing (custom: the class of A_B_, A_bb, aaB_, aabb)")
    elif mode == "pedigree":
        ps = m["people"] if isinstance(m.get("people"), list) else []
        ids = []
        for i, p in enumerate(ps):
            if is_obj(p) and isinstance(p.get("id"), str):
                if p["id"] in ids: E("value", f"model.people[{i}].id", "duplicate id")
                ids.append(p["id"])
        by = {}
        for p in ps:
            if is_obj(p) and isinstance(p.get("id"), str) and p["id"] not in by: by[p["id"]] = p
        sexed = m.get("inheritance") in ("XD", "XR", "Y")
        for i, p in enumerate(ps):
            if not is_obj(p): continue
            at = f"model.people[{i}]"
            if sexed and p.get("sex") == "u": E("value", at + ".sex", "f or m (this inheritance depends on sex)")
            if ("mother" in p) != ("father" in p): E("value", at, "needs both parents or none"); continue
            if "mother" not in p: continue
            for f, sx in (("mother", "f"), ("father", "m")):
                if not isinstance(p.get(f), str): continue
                if p[f] not in by: E("ref", f"{at}.{f}", "not a person of the pedigree")
                elif p[f] == p.get("id"): E("value", f"{at}.{f}", "a person cannot be their own parent")
                elif by[p[f]].get("sex") != sx: E("value", f"{at}.{f}", "the mother must have sex f" if f == "mother" else "the father must have sex m")
        seen = {}
        def cyc(i):
            if seen.get(i) == 1: return True
            if seen.get(i) == 2: return False
            seen[i] = 1; p = by.get(i); r = False
            if p and isinstance(p.get("mother"), str) and isinstance(p.get("father"), str) and p["mother"] in by and p["father"] in by:
                r = cyc(p["mother"]) or cyc(p["father"])
            seen[i] = 2; return r
        if any(cyc(i) for i in ids): E("value", "model.people", "a person is their own ancestor")
        else:
            combos = 1
            for p in ps:
                if is_obj(p): combos *= _n_geno(m.get("inheritance"), p.get("sex"))
            if combos > BUDGET: E("size", "model.people", f"more than {BUDGET} genotype combinations ({combos}): fewer people")
    elif mode == "hw":
        if m.get("chrom") == "X" and isinstance(m.get("counts"), list): E("value", "model.counts", "the tests are for an autosomal locus")
        elif isinstance(m.get("counts"), list) and isinstance(m.get("freqs"), list) and len(m["freqs"]) != 2: E("value", "model.counts", "the tests need 2 alleles")
    elif mode == "map":
        tp = m.get("threePoint")
        if is_obj(tp) and isinstance(tp.get("classes"), list):
            ks = []
            for i, c in enumerate(tp["classes"]):
                al = c.get("alleles") if is_obj(c) else None
                if isinstance(al, list) and len(al) == 3 and all(_isnum(x) and not isinstance(x, bool) and x in (0, 1) for x in al):
                    k = "".join(str(int(x)) for x in al)
                    if k in ks: E("value", f"model.threePoint.classes[{i}].alleles", "the same class twice")
                    ks.append(k)
            if isinstance(tp.get("loci"), list) and _uniq_count(tp["loci"]) != len(tp["loci"]): E("value", "model.threePoint.loci", "duplicate locus")
    elif mode == "ld":
        four = sum(1 for k in ("pAB", "pAb", "paB", "pab") if k in m); three = sum(1 for k in ("pA", "pB", "D") if k in m)
        if not ((four == 4 and three == 0) or (four == 0 and three == 3)):
            E("value", "model", "needs the four haplotype frequencies pAB, pAb, paB, pab or pA, pB and D")

def exprs(spec):
    out = []
    m = spec["model"] if is_obj(spec) and is_obj(spec.get("model")) else {}
    def add(v, p):
        if isinstance(v, str): out.append([v, p, []])
    def walk_t(o, T, p):
        if not is_obj(o): return
        for k, kd in T.items():
            if k not in o: continue
            v, q = o[k], p + "." + k
            if isinstance(kd, str):
                if kd.replace("!", "", 1) == "numx": add(v, q)
            elif "$obj" in kd: walk_t(v, kd["$obj"], q)
            elif "$list" in kd and isinstance(v, list):
                for i, x in enumerate(v):
                    if isinstance(kd["$list"], str):
                        if kd["$list"] == "numx": add(x, f"{q}[{i}]")
                    elif "$obj" in kd["$list"]: walk_t(x, kd["$list"]["$obj"], f"{q}[{i}]")
    if isinstance(m.get("mode"), str) and m["mode"] in MODES: walk_t(m, TABLES[m["mode"]], "model")
    return out

def keys(spec):
    m = spec["model"] if is_obj(spec) and is_obj(spec.get("model")) else {}
    if m.get("mode") == "cross" and isinstance(m.get("classLabels"), list):
        return [[k, f"model.classLabels[{i}]"] for i, k in enumerate(m["classLabels"])]
    return []
