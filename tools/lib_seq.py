"""seq@1 — DNA, RNA and protein sequences (docs/library/seq.md): the Python twin of the checks of engine/src/48_lib_seq.js. It does not
compute; check_spec(spec) gives the same problems (code, path, msg, level) as the JS checkSpec, exprs(spec) and keys(spec) the same
lists (tests/enginelib.js runs both on tests/fixtures/enginelib/seq.json). SPEC is the same JSON as the JS module's SPEC
(tests/lib_seq.js checks that the two copies are identical)."""
import json, math, re
import enginelib as L

ID = "seq@1"
SPEC = json.loads(r'''{"modes":["translate","mutate","divergence","tm","align","dotplot","digest","protein","crispr"],"tables":{"translate":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","table":"int:1:33","frame":"numx","start":"enum:atg|alt|any","minLen":"numx","nested":"bool","partial":"bool","cds":"bool","toStop":"bool","gc":"enum:remove|ignore|weighted","window":"numx","exons":{"$list":{"$obj":{"start":"numx!","end":"numx!"}},"max":20},"refUsage":{"$list":"nonneg","min":64,"max":64}},"mutate":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","table":"int:1:33","variants":{"$req":true,"$list":{"$obj":{"kind":"enum:sub|del|ins|dup|delins!","pos":"numx!","end":"numx","altIndex":"numx"}},"min":1,"max":16},"enzymes":{"$list":"id","max":10}},"divergence":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","coding":"bool","table":"int:1:33"},"tm":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","na":"numx","k":"numx","tris":"numx","mg":"numx","dntp":"numx","c1":"numx","c2":"numx","saltCorr":"enum:none|schildkraut|santalucia|owczarzy2004|owczarzy2008","nn":"enum:santalucia1998|santalucia2004","selfComp":"enum:auto|yes|no","tMin":"numx","tMax":"numx","mismatches":"numx"},"align":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","type":"enum:global|local|semiglobal","alphabet":"enum:auto|dna|protein","matrix":"enum:BLOSUM62|BLOSUM50|PAM250|none","match":"numx","mismatch":"numx","gap":"numx","open":"numx","extend":"numx","shuffles":"numx","band":"numx"},"dotplot":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","window":"numx","stringency":"numx","revcomp":"bool"},"digest":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","enzymes":{"$req":true,"$list":"id","min":1,"max":10},"custom":{"$list":{"$obj":{"name":"id!","cut":"int:-40:60!","cut2":"int:-40:60"}},"max":6},"circular":"bool","ladder":"enum:none|1kb|100bp|lambda","agarose":"numx","dam":"bool","dcm":"bool","features":{"$list":{"$obj":{"start":"numx!","end":"numx!","key":"key!","strand":"enum:+|-"}},"max":16}},"protein":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","ph":"numx","window":"numx","wheel":"numx","pk":"enum:bjellqvist|emboss|lehninger|solomon|sillero"},"crispr":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","nuclease":"enum:SpCas9|SpCas9NG|SaCas9|Cas12a","guideLen":"numx","target":"numx","gcMin":"numx","gcMax":"numx","seedLen":"numx"}},"seqs":{"translate":[["seq","nuc",20000,1,true]],"mutate":[["cds","strict",6000,3,true]],"divergence":[["a","gap",6000,1,true],["b","gap",6000,1,true]],"tm":[["seq","nuc",120,2,true],["seq2","nuc",120,2,false],["template","nuc",20000,1,false]],"align":[["a","any",2000,1,true],["b","any",2000,1,true]],"dotplot":[["a","any",2000,1,true],["b","any",2000,1,true]],"digest":[["seq","nuc",20000,1,true]],"protein":[["seq","prot",5000,1,true]],"crispr":[["seq","nuc",20000,1,true]]},"outs":{"translate":"length:s gc:s gcSkew:s gc3:s count:s:base protLength:s nStops:s leftover:s nOrfs:s longestOrf:s orfStart:s:int orfEnd:s:int orfFrame:s:int orfCodons:s:int orfPartial:s:int mwSS:s mwOH:s codonCount:s:codon rscu:s:codon aaCount:s:aa enc:s cai:s cdsValid:s incompleteStop:s splicedLength:s nIntrons:s canonicalIntrons:s palindrome:s valid:s winPos:e gcWin:e skewWin:e cumSkew:e codonIndex:e codonCounts:e rscuAll:e translation:c orfMap:c strands:c","mutate":"effect:s:int protPos:s:int refAa:s:int altAa:s:int newLength:s:int fsStop:s:int blosum:s:int transition:s:int sitesRef:s:int sitesAlt:s:int refLength:s nVariants:s count:s:int transitions:s transversions:s valid:s effects:e hgvs:c protein:c:int","divergence":"sites:s diffs:s p:s jc:s k2p:s P:s Q:s tsTv:s S:s N:s Sd:s Nd:s pS:s pN:s dS:s dN:s omega:s valid:s diffPos:e alignment:c","tm":"length:s gc:s tmWallace:s tmMarmur:s tmSalt:s tmNN:s dH:s dS:s dG37:s selfComp:s gcClamp:s maxRun:s maxDinuc:s selfAny:s self3:s hairpin:s selfDG:s self3DG:s hairpinDG:s nIssues:s issue:s:issue tm2:s dTm:s pairAny:s pair3:s pairDG:s product:s productTm:s nProducts:s fwdPos:s revPos:s fwdMism:s revMism:s valid:s T:e theta:e duplex:c pcr:c","align":"score:s nCoOptimal:s identity:s identityShort:s similarity:s gaps:s gapOpens:s alnLength:s nIdentical:s startA:s endA:s startB:s endB:s bits:s evalue:s zScore:s pShuffle:s cells:s banded:s valid:s shuffleScores:e alignment:c dp:c","dotplot":"nHits:s nHitsRev:s longestDiag:s cells:s valid:s dots:c","digest":"length:s nSites:s nBlocked:s nFragments:s bands:s outOfRange:s sitePos:s:int cutPos:s:int siteEnzyme:s:int fragment:s:int fragmentSorted:s:int migration:s:int overhang:s:int nSitesOf:s:int valid:s fragments:e fragmentsSorted:e gel:c map:c","protein":"length:s mwAvg:s mwMono:s pI:s charge:s gravy:s eps280:s eps280ox:s abs01:s abs01ox:s aliphatic:s instability:s aromaticity:s muH:s aaCount:s:aa aaFrac:s:aa valid:s phGrid:e chargeCurve:e hydroX:e hydropathy:e wheel:c","crispr":"nGuides:s nPlus:s nMinus:s nGood:s nearestCut:s nearestDist:s nearestStrand:s nearestGc:s nearestPolyT:s nearestSeedHits:s guideCut:s:int guideStrand:s:int guideGc:s:int guideSeedHits:s:int valid:s cuts:e guides:c"},"tableIds":[1,2,3,4,5,6,9,10,11,12,13,14,15,16,21,22,23,24,25,26,27,28,29,30,31,32,33],"enzymes":["EcoRI","BamHI","HindIII","XhoI","SalI","XbaI","SpeI","NheI","NcoI","NdeI","BglII","MluI","XmaI","AvaI","ClaI","AgeI","AflII","MfeI","BsrGI","EagI","BclI","BstEII","TaqI","MspI","HpaII","HinfI","Sau3AI","MboI","DpnI","DdeI","Bsu36I","EcoRII","SmaI","EcoRV","HaeIII","AluI","PvuII","ScaI","HpaI","DraI","StuI","NruI","NaeI","SnaBI","PmeI","SwaI","XmnI","PstI","KpnI","SacI","SphI","ApaI","NsiI","AatII","SacII","PacI","NotI","AscI","SfiI","BstXI","BsaI","BsmBI","BbsI","SapI","BsmAI","PaqCI","FokI"],"issues":["length","gc","tm","clamp","run","dinuc","self3","selfAny","hairpin","pairTm","pair3"],"alpha":{"nuc":"ACGTURYSWKMBDHVN","strict":"ACGTU","gap":"ACGTURYSWKMBDHVN-","prot":"ACDEFGHIKLMNPQRSTVWYUOBZJX*","any":"ACDEFGHIKLMNPQRSTVWYUOBZJX*TRYSWKMDHVN"},"alphaMsg":{"nuc":"not a nucleotide code","strict":"not A, C, G, T or U","gap":"not a nucleotide code or -","prot":"not an amino-acid letter","any":"not a sequence letter"},"argMsg":{"int":"needs an integer from 0 to 9999","base":"needs one nucleotide letter (A, C, G, T, U or an IUPAC code)","codon":"needs a codon of three letters A, C, G, T or U","aa":"needs one amino-acid letter","issue":"needs one of length, gc, tm, clamp, run, dinuc, self3, selfAny, hairpin, pairTm, pair3"},"cellLimit":250000}''')
MODES = SPEC["modes"]
NUC, PROT = SPEC["alpha"]["nuc"], SPEC["alpha"]["prot"]
_WS = re.compile(r"[ \t\r\n\f\v0-9]")
_CODON = re.compile(r"^[ACGTU]{3}$")


def clean(s):
    """a sequence as written in the model → its letters: FASTA header lines dropped, spaces and digits removed, upper case"""
    if not isinstance(s, str): return ""
    lines = [l for l in s.split("\n") if not l.lstrip(" \t\r\f\v").startswith(">")]
    return _WS.sub("", "\n".join(lines)).upper()


def _int_ok(a): return L.is_num(a) and float(a).is_integer() and 0 <= a <= 9999


_ARG_OK = {
    "int": _int_ok,
    "base": lambda a: isinstance(a, str) and len(a) == 1 and a in NUC,
    "codon": lambda a: isinstance(a, str) and _CODON.match(a) is not None and not a.endswith("\n"),
    "aa": lambda a: isinstance(a, str) and len(a) == 1 and a in PROT[:-1],
    "issue": lambda a: isinstance(a, str) and a in SPEC["issues"],
}


def _outs(mode):
    o = {}
    for part in SPEC["outs"][mode].split(" "):
        bits = part.split(":")
        kind = {"s": "scalar", "e": "series", "c": "scene"}[bits[1]]
        o[bits[0]] = (kind, bits[2] if len(bits) > 2 else None)
    return o


OUTS = {m: _outs(m) for m in MODES}
_NESTED = {"mutate": ("variants", "alt"), "digest": ("custom", "site")}   # sequences inside a list of objects


def seq_check(v, path, alpha, mx, mn, E):
    if not isinstance(v, str): E("value", path, "needs a sequence (a text)"); return None
    if any(ord(c) > 127 for c in v): E("value", path, "only ASCII letters"); return None
    s = clean(v)
    mn = mn or 1
    if len(s) < mn: E("value", path, "empty after removing spaces, digits and FASTA headers" if mn == 1 else f"shorter than {mn} letters"); return None
    if len(s) > mx: E("size", path, f"longer than {mx} letters ({len(s)})"); return None
    A = SPEC["alpha"][alpha]
    for i, c in enumerate(s):
        if c not in A: E("alphabet", path, f"{SPEC['alphaMsg'][alpha]}: {c} at position {i + 1}"); return None
    if alpha not in ("prot", "any") and "T" in s and "U" in s: E("alphabet", path, "mixes T and U (DNA and RNA)"); return None
    return s


def _js_round(x): return math.floor(x + 0.5)


def _semantic(mode, m, E):
    got = {}
    for f, alpha, mx, mn, req in SPEC["seqs"][mode]:
        al = alpha
        if mode == "align": al = "nuc" if m.get("alphabet") == "dna" else "prot" if m.get("alphabet") == "protein" else "any"
        if f not in m:
            if req: E("value", "model." + f, "missing")
            continue
        got[f] = seq_check(m[f], "model." + f, al, mx, mn, E)
    t = m.get("table")
    if L.is_num(t) and float(t).is_integer() and t not in SPEC["tableIds"]: E("value", "model.table", "not an NCBI genetic code (1–6, 9–16, 21–33)")

    def enz_list(arr, own, msg):
        for i, x in enumerate(arr if isinstance(arr, list) else []):
            if isinstance(x, str) and L.check_kind("id", x) and x not in SPEC["enzymes"] and x not in own: E("ref", f"model.enzymes[{i}]", msg)
    if mode == "mutate":
        for i, v in enumerate(m.get("variants") if isinstance(m.get("variants"), list) else []):
            if not L.is_obj(v): continue
            at = f"model.variants[{i}]"
            if "alt" in v: seq_check(v["alt"], at + ".alt", "strict", 60, 1, E)
            if v.get("kind") == "sub" and "alt" not in v and "altIndex" not in v: E("value", at, "a substitution needs alt or altIndex")
            if v.get("kind") in ("ins", "delins") and "alt" not in v: E("value", at + ".alt", "missing (the inserted bases)")
        enz_list(m.get("enzymes"), [], "not a built-in enzyme")
    elif mode == "divergence":
        a, b = got.get("a"), got.get("b")
        if a and b and len(a) != len(b): E("value", "model.b", f"not as long as a ({len(b)} and {len(a)}): the two must be aligned")
    elif mode == "align":
        a, b = got.get("a"), got.get("b")
        if a and b and ("band" not in m or L.is_num(m["band"])):
            band = m.get("band")
            bw = min(len(b) + 1, 2 * _js_round(band) + 1) if L.is_num(band) and band >= 0 else len(b) + 1
            cells = (len(a) + 1) * bw
            if cells > SPEC["cellLimit"]:
                E("size", "model", f"{cells} cells of dynamic programming, more than {SPEC['cellLimit']}: " + ("set model.band (a banded alignment) or use shorter sequences" if "band" not in m else "a narrower band or shorter sequences"))
        if m.get("alphabet") == "dna" and isinstance(m.get("matrix"), str) and m["matrix"] != "none":
            E("value", "model.matrix", "a substitution matrix scores proteins (alphabet dna: none)")
    elif mode == "digest":
        own = []
        for i, x in enumerate(m.get("custom") if isinstance(m.get("custom"), list) else []):
            if not L.is_obj(x): continue
            if isinstance(x.get("name"), str):
                if x["name"] in own or x["name"] in SPEC["enzymes"]: E("value", f"model.custom[{i}].name", "already the name of an enzyme")
                own.append(x["name"])
            if "site" not in x: E("value", f"model.custom[{i}].site", "missing")
            else: seq_check(x["site"], f"model.custom[{i}].site", "nuc", 30, 2, E)
        enz_list(m.get("enzymes"), own, "not a built-in enzyme or a name of model.custom")
    elif mode == "protein":
        s = got.get("seq")
        if s and "*" in s[:-1]: E("value", "model.seq", "a stop * only at the end")


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    mode = m.get("mode") if L.is_obj(m) and isinstance(m.get("mode"), str) and m.get("mode") in MODES else None
    if not L.is_obj(m): E("format", "model", "not an object")
    elif not mode: E("enum", "model.mode", "one of " + ", ".join(MODES))
    else:
        sf = [x[0] for x in SPEC["seqs"][mode]]
        rest = {k: v for k, v in m.items() if k not in sf}
        nest = _NESTED.get(mode)
        if nest and isinstance(rest.get(nest[0]), list):
            rest[nest[0]] = [{k: v for k, v in x.items() if k != nest[1]} if L.is_obj(x) else x for x in rest[nest[0]]]
        L.walk(rest, SPEC["tables"][mode], "model", E, W)
        _semantic(mode, m, E)

    def out(o, at, E2, W2):
        if not mode: return
        d = OUTS[mode].get(o["of"])
        if not d: E2("output", at + ".of", f'{mode} computes no {o["kind"]} "{o["of"]}"'); return
        if d[0] != o["kind"]: E2("output", at + ".kind", f'"{o["of"]}" is a {d[0]}'); return
        if d[1] and not _ARG_OK[d[1]](o.get("arg")): E2("output", at + ".arg", f'"{o["of"]}" {SPEC["argMsg"][d[1]]}')
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P


def exprs(spec):
    m = spec.get("model") if L.is_obj(spec) else None
    out = []
    if not L.is_obj(m) or m.get("mode") not in MODES: return out

    def go(o, T, path):
        if not L.is_obj(o): return
        for k, kd in T.items():
            v, p = o.get(k), path + "." + k
            if isinstance(kd, str):
                if kd.replace("!", "") == "numx" and isinstance(v, str): out.append((v, p, []))
            elif "$obj" in kd: go(v, kd["$obj"], p)
            elif "$list" in kd and isinstance(v, list):
                for i, x in enumerate(v):
                    if isinstance(kd["$list"], str):
                        if kd["$list"].replace("!", "") == "numx" and isinstance(x, str): out.append((x, f"{p}[{i}]", []))
                    elif "$obj" in kd["$list"]: go(x, kd["$list"]["$obj"], f"{p}[{i}]")
    go(m, SPEC["tables"][m["mode"]], "model")
    return out


def keys(spec):
    """the labels of a digest map's features"""
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m) or m.get("mode") != "digest" or not isinstance(m.get("features"), list): return []
    return [(f["key"], f"model.features[{i}].key") for i, f in enumerate(m["features"]) if L.is_obj(f) and L.check_kind("key", f.get("key"))]
