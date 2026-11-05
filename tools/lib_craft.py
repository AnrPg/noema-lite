"""craft@1 — handcrafts (docs/library/craft.md): the Python twin of the checks of engine/src/48_lib_craft.js. It does not compute;
check_spec(spec) gives the same problems (code, path, msg, level) as the JS checkSpec, exprs(spec) and keys(spec) the same lists
(tests/enginelib.js runs both on tests/fixtures/enginelib/craft.json). DATA is the same JSON as the JS module's (tests/lib_craft.js
checks that the two copies are identical)."""
import json, re
import enginelib as L

ID = "craft@1"
DATA = json.loads(r'''{"custom":{"chart":["rows"],"symmetry":["orbifold"]},"modes":["fiber","chart","weave","stitch","quilt","symmetry","sew","wood","ceramic","metal","book","leather","dye"],"schema":{"fiber":{"craft":"enum:knit|crochet","unit":"enum:cm|in","sts":"numx!","rows":"numx","over":"numx","width":"numx","length":"numx","mult":"numx","plus":"numx","round":"enum:nearest|up|down|even","patternSts":"numx","category":"int:0:7","distribute":{"$obj":{"from":"numx!","change":"numx!","kind":"enum:inc|dec|dec2","work":"enum:flat|round"}},"shape":{"$obj":{"fromSts":"numx!","toSts":"numx!","overRows":"numx!","perEvent":"numx","rsOnly":"bool"}},"yarn":{"$obj":{"swatchGrams":"numx!","swatchArea":"numx!","projectArea":"numx!","metersPerGram":"numx","skeinMeters":"numx","safety":"numx"}},"circle":{"$obj":{"start":"numx","rounds":"numx!"}}},"chart":{"kind":"enum:stitch|color","work":"enum:flat|round","castOn":"numx","maxFloat":"numx","gauge":"numx","maxFloatCm":"numx","repeat":"numx"},"weave":{"shafts":"numx","treadles":"numx","threading":{"$list":"int:1:32","max":2000},"tieup":{"$list":{"$list":"int:1:32","max":32},"max":64},"treadling":{"$list":{"$list":"int:1:64","max":64},"max":2000},"liftplan":{"$list":{"$list":"int:1:32","max":32},"max":2000},"structure":{"$obj":{"type":"enum:plain|twill|satin!","up":"numx","down":"numx","shafts":"numx","move":"numx","face":"enum:warp|weft","ends":"numx","picks":"numx"}},"shed":"enum:rising|sinking","repeat":"bool","maxFloat":"numx","wpi":"numx","colors":{"$obj":{"warp":{"$list":"int:0:7","max":2000},"weft":{"$list":"int:0:7","max":2000}}},"warp":{"$obj":{"unit":"enum:in|cm","width":"numx!","length":"numx!","epi":"numx!","drawIn":"numx","shrink":"numx","takeUp":"numx","waste":"numx","pieces":"numx","ppi":"numx"}},"basket":{"$obj":{"stakes":"numx","diameter":"numx","spacing":"numx"}}},"stitch":{"w":"numx!","h":"numx!","count":"numx!","over":"numx","unit":"enum:in|cm","margin":"numx","fabricW":"numx","fabricH":"numx","strands":"numx","skein":"numx","waste":"numx","stitches":"numx"},"quilt":{"finished":"numx","sa":"numx","cols":"numx","rows":"numx","block":"numx","sashing":"numx","border":"numx","binding":{"$obj":{"extra":"numx","strip":"numx","wof":"numx"}},"cut":{"$obj":{"count":"numx!","w":"numx!","h":"numx!","wof":"numx"}},"backing":{"$obj":{"margin":"numx","wof":"numx"}},"bias":{"$obj":{"square":"numx!","strip":"numx!"}},"geese":"numx"},"symmetry":{"group":"enum:p1|p2|pm|pg|cm|pmm|pmg|pgg|cmm|p4|p4m|p4g|p3|p3m1|p31m|p6|p6m|hop|step|sidle|spinning-hop|spinning-sidle|jump|spinning-jump","groupIndex":"numx","motif":{"$list":"fin","max":128},"cells":"numx","b":"numx","angle":"numx","classify":{"$obj":{"rot":"numx!","mirrors":"numx","twoDirs":"numx","onMirrors":"numx","glide":"numx"}},"classifyFrieze":{"$obj":{"vmirror":"numx","hmirror":"numx","turn":"numx","glide":"numx"}},"vertex":{"$list":"int:3:42","max":8}},"sew":{"skirt":{"$obj":{"waist":"numx!","length":"numx!","fraction":"numx"}},"gather":{"$obj":{"finished":"numx!","ratio":"numx!"}},"pleats":{"$obj":{"finished":"numx!","depth":"numx!","count":"numx!"}},"ease":{"$obj":{"body":"numx!","ease":"numx!","stretch":"numx"}},"piece":{"$obj":{"pts":{"$req":true,"$list":"fin","max":128,"min":6},"sa":"numx!"}},"grade":{"$obj":{"rule":{"$req":true,"$list":"fin","max":128},"steps":"numx"}},"pack":{"$obj":{"width":"numx!","rects":{"$req":true,"$list":{"$list":"fin","max":2,"min":2},"max":60,"min":1}}}},"wood":{"species":"enum:ash-white|basswood|beech|birch-yellow|cherry-black|hickory-shagbark|maple-sugar|maple-red|oak-red|oak-white|walnut-black|yellow-poplar|douglas-fir|pine-white|pine-ponderosa|redwood|cedar-western-red|spruce-sitka|mahogany|teak","width":"numx","mcFrom":"numx","mcTo":"numx","cut":"enum:flat|quarter","board":{"$obj":{"t":"numx!","w":"numx!","l":"numx!"}},"emc":{"$obj":{"tempF":"numx!","rh":"numx!"}},"shelf":{"$obj":{"t":"numx!","w":"numx!","span":"numx!","load":"numx!","e":"numx","creep":"numx"}},"cutlist":{"$obj":{"stock":"numx!","kerf":"numx","pieces":{"$req":true,"$list":"numx","max":60,"min":1}}},"dovetail":"numx"},"ceramic":{"fired":"numx","shrink":"numx","dry":"numx","fire":"numx","cone":"enum:022|021|020|019|018|017|016|015|014|013|012|011|010|09|08|07|06|05.5|05|04|03|02|01|1|2|3|4|5|5.5|6|7|8|9|10|11|12|13|14","coneIndex":"numx","rate":"numx","type":"enum:ss|ssfe|large|largefe|small","tempC":"numx","recipe":{"$list":{"$obj":{"mat":"id!","w":"numx!"}},"max":16},"materials":{"$map":{"$map":"fin","max":20},"max":16},"target":{"$map":"numx","max":20},"batch":{"$list":"id","max":8},"expansion":"enum:et|appen","bodyCoe":"numx"},"metal":{"size":"numx","scale":"enum:us|uk|iso|jp|ch|mm","thickness":"numx","width":"numx","metal":"enum:fine-gold|22k|18k|14k|9k|fine-silver|britannia|sterling|platinum950|palladium950|copper|brass|bronze|titanium|steel","density":"numx","awg":"numx","swg":"numx","wireLength":"numx","karat":"numx","alloy":{"$obj":{"mass":"numx!","from":"numx!","to":"numx!","add":"numx"}}},"book":{"pages":"numx!","folds":"numx","sheetsPerSig":"numx","caliper":"numx","swell":"numx","grain":"enum:long|short","sheet":"numx"},"leather":{"oz":"numx","seam":"numx","pitch":"numx","thickness":"numx","tail":"numx"},"dye":{"wof":"numx!","dos":"numx","stock":"numx","mordant":"numx","liquor":"numx"}},"outs":{"fiber":{"scalar":["castOnRaw","castOn","achievedWidth","widthError","rowCount","gauge10","cycMin","cycMax","gaugeInRange","sizeFactor","distResult","distGapMin","distGapMax","shapeEvents","shapeEveryA","shapeTimesA","shapeEveryB","shapeTimesB","grams","meters","skeins","circleSts","circleTotal"],"series":["gaps","positions","shapeRows","shapeSts","circleRounds"],"scene":["distribution","shaping"],"issues":["consumes-too-many","impossible","non-integer","range","rounded"]},"chart":{"scalar":["rowsCount","width","stitchesStart","stitchesEnd","unbalancedRows","firstUnbalanced","maxFloat","longFloats","colorsMax","floatLimit"],"series":["rowNo","rowIn","rowOut","rowFloat"],"scene":["chart"],"issues":["unbalanced-row","float-too-long","consumes-too-many"]},"weave":{"scalar":["ends","picks","warpFloat","weftFloat","warpFaced","noInterlace","longFloats","regular","satins","interlace","sett","widthInReed","warpEnds","wovenLength","warpLength","warpTotal","warpTotalLong","weftTotal","stakesNeeded","parityOk"],"series":[],"scene":["drawdown"],"issues":["float-too-long","no-interlace","impossible","parity"]},"stitch":{"scalar":["effCount","widthIn","heightIn","widthCm","heightCm","cutW","cutH","fits","perStitchMm","stitchesPerSkein","skeins"],"series":[],"scene":["layout"],"issues":["impossible","range"]},"quilt":{"scalar":["square","hst2","hst2Exact","hst4","hst4Exact","hst8","qst","qstExact","diagonal","sideSetting","sideSettingExact","corner","cornerExact","geeseLarge","geeseSmall","quiltW","quiltH","bindingLength","bindingStrips","bindingYards","perStrip","strips","cutYards","backingYards","backingPanels","biasLength"],"series":[],"scene":["hst","layout"],"issues":["impossible","range"]},"symmetry":{"scalar":["groupIdx","copies","cost","isPlane","classified","frieze","vertexSum","angleOk","tiles","chiral"],"series":[],"scene":["pattern"],"issues":["not-a-group"]},"sew":{"scalar":["skirtRadius","skirtW","skirtH","hem","gather","pleats","garment","easeOk","area","saArea","perimeter","concave","packLength","packEfficiency","packLower"],"series":[],"scene":["piece","pack"],"issues":["concave","impossible","range"]},"wood":{"scalar":["boardFeet","cubicMeters","cR","cT","movement","movementFull","shrinkAt","emc","sag","sagLimit","sagOk","boards","boardsOpt","lowerBound","utilisation","dovetailDeg"],"series":["emcRh","emcCurve"],"scene":["cutlist","movement"],"issues":["beyond-fsp","extrapolated","impossible","range","out-of-table"]},"ceramic":{"scalar":["wet","totalShrink","volShrink","coneTemp","coneAt","coneFrac","fluxSum","siAl","firedYield","expansion","glazeMinusBody","batchResidual"],"prefix":{"umf.":["SiO2","Al2O3","B2O3","Li2O","Na2O","K2O","MgO","CaO","SrO","BaO","ZnO","PbO","TiO2","ZrO2","Fe2O3"],"wt.":["SiO2","Al2O3","B2O3","Li2O","Na2O","K2O","MgO","CaO","SrO","BaO","ZnO","PbO","TiO2","ZrO2","Fe2O3"],"batch.":["0","1","2","3","4","5","6","7"]},"series":["coneNo","coneTemps"],"scene":["stull"],"issues":["unity-off","negative-batch","out-of-table","extrapolated","impossible"]},"metal":{"scalar":["diameter","circumference","us","uk","iso","jp","ch","blank","bandVolume","bandMass","density","awgMm","swgMm","wireMass","fineness","alloyAdd"],"series":[],"scene":["ring"],"issues":["out-of-table","impossible","rounded"]},"book":{"scalar":["pagesPerSig","signatures","blanks","leaves","sheets","spine","creep","needGrain","grainOk"],"series":[],"scene":["imposition"],"issues":["grain-wrong","range"]},"leather":{"scalar":["mm","holes","adjustedPitch","thread","ruleOfThumb","spi"],"series":[],"scene":[],"issues":["non-integer","range"]},"dye":{"scalar":["dyeGrams","stockMl","mordantGrams","bathLitres"],"series":[],"scene":[],"issues":["range"]}},"cones":["022","021","020","019","018","017","016","015","014","013","012","011","010","09","08","07","06","05.5","05","04","03","02","01","1","2","3","4","5","5.5","6","7","8","9","10","11","12","13","14"],"wallpaper":["p1","p2","pm","pg","cm","pmm","pmg","pgg","cmm","p4","p4m","p4g","p3","p3m1","p31m","p6","p6m"],"frieze":["hop","step","sidle","spinning-hop","spinning-sidle","jump","spinning-jump"],"species":["ash-white","basswood","beech","birch-yellow","cherry-black","hickory-shagbark","maple-sugar","maple-red","oak-red","oak-white","walnut-black","yellow-poplar","douglas-fir","pine-white","pine-ponderosa","redwood","cedar-western-red","spruce-sitka","mahogany","teak"],"metals":["fine-gold","22k","18k","14k","9k","fine-silver","britannia","sterling","platinum950","palladium950","copper","brass","bronze","titanium","steel"],"materials":["silica","whiting","wollastonite","kaolin","potash_feldspar","soda_feldspar","talc","dolomite","zinc_oxide","magnesium_carbonate","strontium_carbonate","barium_carbonate","lithium_carbonate","spodumene"],"oxides":["SiO2","Al2O3","B2O3","Li2O","Na2O","K2O","MgO","CaO","SrO","BaO","ZnO","PbO","TiO2","ZrO2","Fe2O3"]}''')

_SYM = {"k", "p", "yo", "k2tog", "ssk", "skp", "p2tog", "k3tog", "sssk", "sk2p", "s2kp", "cdd", "m1", "m1l", "m1r", "kfb", "sl", "ns",
        "bobble", "ch", "slst", "sc", "hdc", "dc", "tr", "sc2tog", "dc2tog", "inc"}
_CABLE = re.compile(r"^c([1-6])/([1-6])(l|r)$")
_TOK = re.compile(r"^([a-z0-9/]+)(?:\*([1-9][0-9]?))?$")
_ORB = re.compile(r"^[ox*1-9∞]{1,16}$")


def _token(t):
    m = _TOK.match(t)
    if not m or t.endswith("\n"): return None
    n = int(m.group(2)) if m.group(2) else 1
    s = m.group(1)
    if s in _SYM: return {"w": 1, "n": n}
    c = _CABLE.match(s)
    if c: return {"w": int(c.group(1)) + int(c.group(2)), "n": n}
    return None


def _fmt(v):
    """a number as JS String() writes it (integers without .0)"""
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e21: return str(int(v))
    return str(v) if not isinstance(v, float) else repr(v)


def _num(v): return L.is_num(v)


def _extra(mode, m, E):
    if mode == "chart":
        rs = m.get("rows")
        if not isinstance(rs, list) or len(rs) < 1 or len(rs) > 60:
            E("value", "model.rows", "needs a list of 1–60 rows (texts)"); return
        color = m.get("kind") == "color"
        for i, r in enumerate(rs):
            p = f"model.rows[{i}]"
            if not isinstance(r, str) or not r.strip():
                E("value", p, "needs a text"); continue
            if color:
                if not re.fullmatch(r"[A-H.]+", r): E("value", p, "colours are the letters A–H (or . for none)")
                elif len(r) > 120: E("size", p, "more than 120 cells")
                continue
            cells, bad = 0, False
            for t in r.strip().split():
                k = _token(t)
                if not k:
                    E("unknown-symbol", p, f'unknown stitch "{t[:16]}"'); bad = True; break
                cells += k["w"] * k["n"]
            if not bad and cells > 120: E("size", p, "more than 120 cells")
    elif mode == "weave":
        has_s = L.is_obj(m.get("structure"))
        th = isinstance(m.get("threading"), list) and len(m["threading"]) > 0
        has_t = isinstance(m.get("tieup"), list) and isinstance(m.get("treadling"), list)
        has_l = isinstance(m.get("liftplan"), list)
        if not has_s and not (th and (has_t or has_l)):
            E("value", "model", "needs a structure, a threading with a tie-up and a treadling, or a threading with a liftplan")
        if _num(m.get("shafts")):
            sh = m["shafts"]
            def beyond(arr, p):
                if not isinstance(arr, list): return
                for i, v in enumerate(arr):
                    if _num(v) and v > sh:
                        E("value", f"{p}[{i}]", f"shaft {_fmt(v)} is beyond the {_fmt(sh)} shafts"); return
            beyond(m.get("threading"), "model.threading")
            if isinstance(m.get("tieup"), list):
                for i, t in enumerate(m["tieup"]): beyond(t, f"model.tieup[{i}]")
            if isinstance(m.get("liftplan"), list):
                for i, t in enumerate(m["liftplan"]): beyond(t, f"model.liftplan[{i}]")
        if isinstance(m.get("treadling"), list):
            nt = m["treadles"] if _num(m.get("treadles")) else len(m["tieup"]) if isinstance(m.get("tieup"), list) else float("inf")
            for i, t in enumerate(m["treadling"]):
                if not isinstance(t, list): continue
                bad = next((v for v in t if _num(v) and v > nt), None)
                if bad is not None:
                    E("value", f"model.treadling[{i}]", f"treadle {_fmt(bad)} is not in the tie-up"); break
    elif mode == "ceramic":
        own = m["materials"] if L.is_obj(m.get("materials")) else {}
        def known(n): return isinstance(n, str) and (n in DATA["materials"] or n in own)
        if isinstance(m.get("recipe"), list):
            for i, r in enumerate(m["recipe"]):
                if L.is_obj(r) and isinstance(r.get("mat"), str) and L.check_kind("id", r["mat"]) and not known(r["mat"]):
                    E("unknown-material", f"model.recipe[{i}].mat", "not a built-in material or one of model.materials")
        if isinstance(m.get("batch"), list):
            for i, b in enumerate(m["batch"]):
                if isinstance(b, str) and L.check_kind("id", b) and not known(b):
                    E("unknown-material", f"model.batch[{i}]", "not a built-in material or one of model.materials")
        for mn, an in own.items():
            if L.is_obj(an):
                for ox in an:
                    if ox not in DATA["oxides"] and ox != "LOI": E("unknown-oxide", f"model.materials.{mn}.{ox}", "not a known oxide")
        if L.is_obj(m.get("target")):
            for ox in m["target"]:
                if ox not in DATA["oxides"]: E("unknown-oxide", f"model.target.{ox}", "not a known oxide")
        if L.is_obj(m.get("target")) and not isinstance(m.get("batch"), list):
            E("value", "model.batch", "needs the materials of the batch (model.target is set)")
    elif mode == "sew":
        pc = m["piece"] if L.is_obj(m.get("piece")) else None
        if pc and isinstance(pc.get("pts"), list) and len(pc["pts"]) % 2: E("value", "model.piece.pts", "needs x, y pairs")
        if L.is_obj(m.get("grade")):
            if not pc: E("value", "model.grade", "needs model.piece")
            elif isinstance(m["grade"].get("rule"), list) and isinstance(pc.get("pts"), list) and len(m["grade"]["rule"]) != len(pc["pts"]):
                E("value", "model.grade.rule", "needs one dx, dy pair per point of model.piece.pts")
    elif mode == "symmetry":
        if "orbifold" in m and not (isinstance(m["orbifold"], str) and _ORB.match(m["orbifold"]) and not m["orbifold"].endswith("\n")):
            E("value", "model.orbifold", "needs an orbifold signature such as *632 or 22x")
        if isinstance(m.get("motif"), list) and (len(m["motif"]) < 6 or len(m["motif"]) % 2):
            E("value", "model.motif", "needs at least 3 x, y pairs")


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m):
        E("format", "model", "not an object")
        L.check_outputs(spec, ID, ["scalar", "series", "scene"], lambda o, at, E, W: None, E, W)
        return P
    mode = m.get("mode") if isinstance(m.get("mode"), str) and m.get("mode") in DATA["modes"] else None
    T = {"mode": "enum:" + "|".join(DATA["modes"]) + "!"}
    if mode: T.update(DATA["schema"][mode])
    own = DATA["custom"].get(mode, []) if mode else []
    L.walk({k: v for k, v in m.items() if k not in own}, T, "model", E, W)
    if mode: _extra(mode, m, E)

    def out(o, at, E, W):
        if not mode: return
        O, of, kind = DATA["outs"][mode], o["of"], o["kind"]
        if kind == "scalar":
            ok = of in O["scalar"] or (of.startswith("issue.") and of[6:] in O["issues"]) or \
                any(of.startswith(pf) and of[len(pf):] in vals for pf, vals in (O.get("prefix") or {}).items())
        else:
            ok = of in O[kind]
        if not ok: E("output", at + ".of", f'{mode} computes no {kind} "{of}"')
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P


def exprs(spec):
    out = []
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m) or m.get("mode") not in DATA["modes"]: return out

    def visit(v, kd, p):
        if v is None or kd is None: return
        if isinstance(kd, str):
            if kd.replace("!", "") == "numx" and isinstance(v, str): out.append((v, p, []))
            return
        if "$obj" in kd:
            if L.is_obj(v):
                for k, sub in kd["$obj"].items(): visit(v.get(k), sub, p + "." + k)
            return
        if "$map" in kd:
            if L.is_obj(v):
                for k in v: visit(v[k], kd["$map"], p + "." + k)
            return
        if "$list" in kd and isinstance(v, list):
            for i, x in enumerate(v): visit(x, kd["$list"], f"{p}[{i}]")
    T = DATA["schema"][m["mode"]]
    for k, kd in T.items(): visit(m.get(k), kd, "model." + k)
    return out


def keys(spec):
    """craft@1 names no string keys: its labels are numbers (v) or the model's own symbols (s)"""
    return []
