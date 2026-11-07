"""timeline@1 — the Python twin of src/engines/timeline/timeline.js (docs/library/timeline.md): the same check_spec (codes, paths,
messages), exprs and keys. It does not compute dates (the engine does, in the app). The tables are the engine's own, as JSON."""
import json
import enginelib as L

ID = "timeline@1"
T = json.loads(r'''{"CALS":["gregorian","julian","civil","jdn","hebrew","islamic","umalqura","persian","coptic","ethiopic","bahai","french","saka","hindusolar","vikram","chinese","dangi","japanese","roc","thai","buddhist","dangun","juche","holocene","bp","b2k","maya","olympiad","auc","byzantine","nabonassar","seleucid","spanish"],"OUTCALS":["gregorian","julian","civil","jdn","hebrew","islamic","umalqura","persian","coptic","ethiopic","bahai","french","saka","hindusolar","vikram","chinese","dangi","japanese","roc","thai","buddhist","dangun","juche","holocene","bp","b2k","maya","olympiad","auc","byzantine","nabonassar","seleucid","spanish","roman"],"FIELDS":{"gregorian":["y","m","d","eraYear","era","weekday","isoWeekday","leap","yearLength","monthLength","dayOfYear","century"],"julian":["y","m","d","eraYear","era","weekday","isoWeekday","leap","yearLength","monthLength","dayOfYear","century"],"civil":["y","m","d","eraYear","era","weekday","isoWeekday","leap","yearLength","monthLength","dayOfYear","century","gregorian"],"jdn":["j","mjd","rd","weekday"],"roman":["ref","count","month","bis"],"hebrew":["y","m","d","leap","yearLength","monthLength","weekday"],"islamic":["y","m","d","leap","yearLength","monthLength","weekday"],"umalqura":["y","m","d","leap","yearLength","monthLength","weekday"],"persian":["y","m","d","leap","yearLength","monthLength","weekday"],"coptic":["y","m","d","leap","yearLength","monthLength","weekday"],"ethiopic":["y","m","d","leap","yearLength","monthLength","weekday","aa"],"bahai":["y","m","d","leap","yearLength","monthLength","weekday","vahid","kull","yearInVahid"],"french":["y","m","d","leap","yearLength","monthLength","weekday","decade","dayOfDecade"],"saka":["y","m","d","leap","yearLength","monthLength","weekday"],"hindusolar":["y","m","d","weekday"],"nabonassar":["y","m","d","weekday"],"vikram":["y"],"seleucid":["y"],"spanish":["y","m","d"],"bp":["y"],"b2k":["y"],"chinese":["y","m","d","leap","monthLength","yearLength","stem","branch","cycle","dayStem","dayBranch","dayCycle"],"japanese":["era","y","m","d"],"roc":["y","m","d"],"thai":["y","m","d"],"buddhist":["y","m","d"],"dangun":["y","m","d"],"juche":["y","m","d"],"holocene":["y","m","d"],"maya":["b","k","tun","w","kin","days","tzNum","tzName","haabMonth","haabDay","lord","round"],"olympiad":["ol","oy"],"auc":["y","m","d"],"byzantine":["y","m","d","indiction"],"dangi":["y","m","d","leap","monthLength","yearLength","stem","branch","cycle","dayStem","dayBranch","dayCycle"]},"IN":{"gregorian":{"req":["y"],"opt":["m","d","era"]},"julian":{"req":["y"],"opt":["m","d","era"]},"civil":{"req":["y"],"opt":["m","d","era"]},"jdn":{"req":["j"],"opt":[]},"hebrew":{"req":["y","m","d"],"opt":[]},"islamic":{"req":["y","m","d"],"opt":[]},"umalqura":{"req":["y","m","d"],"opt":[]},"persian":{"req":["y","m","d"],"opt":[]},"coptic":{"req":["y","m","d"],"opt":[]},"ethiopic":{"req":["y","m","d"],"opt":[]},"bahai":{"req":["y","m","d"],"opt":[]},"french":{"req":["y","m","d"],"opt":[]},"saka":{"req":["y","m","d"],"opt":[]},"hindusolar":{"req":["y","m","d"],"opt":[]},"nabonassar":{"req":["y","m","d"],"opt":[]},"vikram":{"req":["y"],"opt":[]},"seleucid":{"req":["y"],"opt":[]},"bp":{"req":["y"],"opt":[]},"b2k":{"req":["y"],"opt":[]},"spanish":{"req":["y"],"opt":["m","d"]},"roc":{"req":["y"],"opt":["m","d"]},"thai":{"req":["y"],"opt":["m","d"]},"buddhist":{"req":["y"],"opt":["m","d"]},"dangun":{"req":["y"],"opt":["m","d"]},"juche":{"req":["y"],"opt":["m","d"]},"holocene":{"req":["y"],"opt":["m","d"]},"auc":{"req":["y"],"opt":["m","d"]},"byzantine":{"req":["y"],"opt":["m","d"]},"chinese":{"req":["y","m","d"],"opt":["leap"]},"dangi":{"req":["y","m","d"],"opt":["leap"]},"japanese":{"req":["era","y"],"opt":["m","d"]},"maya":{"req":["lc"],"opt":[]},"olympiad":{"req":["ol","oy"],"opt":[]}},"DATEF":["y","m","d","era","leap","lc","ol","oy","j"],"REGIONS":["rome","france","austria","hungary","prussia","protestant","britain","sweden","alaska","bulgaria","russia","romania","greece"],"ALLEN":["before","after","meets","metBy","overlaps","overlappedBy","starts","startedBy","during","contains","finishes","finishedBy","equals"],"MODEL":{"options":{"$obj":{"maya":"numx","auc":"enum:varro|cato|polybius|fabius","islamic":"enum:I|II|III|IV","islamicEpoch":"enum:civil|astronomical","region":"enum:rome|france|austria|hungary|prussia|protestant|britain|sweden|alaska|bulgaria|russia|romania|greece","olympiadMonth":"int:1:12","seleucid":"enum:macedonian|babylonian"}},"events":{"$list":{"$obj":{"id":"id!","date":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"sd":"numx","sdYears":"numx","pm":"numx","pmYears":"numx","between":{"$list":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"min":2,"max":2},"after":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"before":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"horizonYears":"numx","c14":{"$obj":{"age":"numx!","sd":"numx!","curve":"enum:linear|model","reservoir":"numx","reservoirSd":"numx"}},"label":"key","lane":"int:0:9"}},"max":200},"periods":{"$list":{"$obj":{"id":"id!","start":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"end":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"label":"key","lane":"int:0:9"}},"max":100},"reigns":{"$list":{"$obj":{"id":"id!","start":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"mode":"enum:anniversary|accession|nonaccession","newYearM":"int:1:12","newYearD":"int:1:31"}},"max":50},"c14curve":{"$obj":{"calBP":{"$req":true,"$list":"fin","min":2,"max":2000},"age":{"$req":true,"$list":"fin","min":2,"max":2000},"sd":{"$req":true,"$list":"nonneg","min":2,"max":2000}}},"dendro":{"$obj":{"master":{"$list":"fin","min":10,"max":3000},"sample":{"$list":"fin","min":10,"max":3000},"masterStart":"numx","minOverlap":"int:10:3000","synthetic":{"$obj":{"n":"int:30:3000","len":"int:10:3000","offset":"numx","noise":"nonneg"}}}},"axis":{"$obj":{"era":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish","from":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"to":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"bceKey":"key","ceKey":"key"}},"mc":"int:500:50000"},"OUT":{"scalar":{"convert":{"id":"expr","kind":"expr","of":"expr","event":"ref!","to":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish|roman!","field":"expr!","at":"enum:median|mean|lo95|hi95"},"duration":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","unit":"enum:days|years|calendarYears","inclusive":"bool"},"relation":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","rel":"enum:before|after|meets|metBy|overlaps|overlappedBy|starts|startedBy|during|contains|finishes|finishedBy|equals!"},"within":{"id":"expr","kind":"expr","of":"expr","event":"ref!","from":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"to":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true}},"stat":{"id":"expr","kind":"expr","of":"expr","event":"ref!","stat":"enum:mean|median|sd|lo68|hi68|lo95|hi95!","unit":"enum:year|bp|jdn"},"c14age":{"id":"expr","kind":"expr","of":"expr","F":"numx!","Fsd":"numx","year":"numx","field":"enum:age|sd|age5730|d14c|F"},"easter":{"id":"expr","kind":"expr","of":"expr","year":"numx!","rite":"enum:western|orthodox","field":"enum:month|day|jdn|julianMonth|julianDay!"},"gap":{"id":"expr","kind":"expr","of":"expr","year":"numx!"},"crossdate":{"id":"expr","kind":"expr","of":"expr","field":"enum:lag|year|t|r|glk|n!"},"regnal":{"id":"expr","kind":"expr","of":"expr","reign":"ref!","event":"ref!"},"flag":{"id":"expr","kind":"expr","of":"expr","event":"ref!","flag":"enum:proleptic|nonexistent|out-of-range|approx|julian-error|invalid!"}},"series":{"density":{"id":"expr","kind":"expr","of":"expr","event":"ref!","part":"enum:x|y!","unit":"enum:year|bp"},"crossdate":{"id":"expr","kind":"expr","of":"expr","part":"enum:x|y!"},"c14curve":{"id":"expr","kind":"expr","of":"expr","part":"enum:x|y|sd!"}},"scene":{"timeline":{"id":"expr","kind":"expr","of":"expr","era":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish","from":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"to":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}}}}}}''')
JP = ["meiji", "taisho", "showa", "heisei", "reiwa"]


def _check_date(d, p, E, W):
    if not isinstance(d, dict) or not isinstance(d.get("cal"), str) or d["cal"] not in T["IN"]: return
    S = T["IN"][d["cal"]]
    for f in S["req"]:
        if f not in d: E("value", p + "." + f, "missing")
    for f in T["DATEF"]:
        if f in d and f not in S["req"] and f not in S["opt"]: W("unused", p + "." + f, f"not used by the {d['cal']} calendar")
    era = d.get("era")
    if isinstance(era, str) and ("era" in S["req"] or "era" in S["opt"]):
        jp = d["cal"] == "japanese"
        if not (era in JP if jp else era in ("bce", "ce")):
            E("enum", p + ".era", "one of meiji, taisho, showa, heisei, reiwa" if jp else "one of bce, ce")
    y = d.get("y")
    if era in ("bce", "ce") and L.is_num(y) and y == 0 and d["cal"] in ("gregorian", "julian", "civil"):
        E("year-zero", p + ".y", "there is no year 0 in BCE/CE counting (1 BCE is followed by 1 CE)")


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if isinstance(spec, dict) else None
    L.walk(m, T["MODEL"], "model", E, W)
    M = m if isinstance(m, dict) else {}
    def arr(k): return M[k] if isinstance(M.get(k), list) else []
    seen, ev, pe, re_ = [], [], [], []
    for k, store in (("events", ev), ("periods", pe), ("reigns", re_)):
        for i, x in enumerate(arr(k)):
            if not isinstance(x, dict) or not isinstance(x.get("id"), str): continue
            if x["id"] in seen: E("duplicate", f"model.{k}[{i}].id", f"the id {x['id']} is used twice")
            else: seen.append(x["id"]); store.append(x["id"])
    for i, x in enumerate(arr("events")):
        if not isinstance(x, dict): continue
        p = f"model.events[{i}]"
        kinds = [k for k in ("date", "between", "after", "before", "c14") if k in x]
        if len(kinds) != 1: E("value", p, "needs exactly one of date, between, after, before, c14")
        if "date" not in x:
            for k in ("sd", "sdYears", "pm", "pmYears"):
                if k in x: W("unused", p + "." + k, "only with date")
        if "after" not in x and "before" not in x and "horizonYears" in x: W("unused", p + ".horizonYears", "only with after or before")
        if isinstance(x.get("c14"), dict) and x["c14"].get("curve") == "model" and not isinstance(M.get("c14curve"), dict):
            E("ref", p + ".c14.curve", "needs model.c14curve")
        _check_date(x.get("date"), p + ".date", E, W)
        if isinstance(x.get("between"), list):
            for j, d in enumerate(x["between"]): _check_date(d, f"{p}.between[{j}]", E, W)
        _check_date(x.get("after"), p + ".after", E, W); _check_date(x.get("before"), p + ".before", E, W)
    for i, x in enumerate(arr("periods")):
        if isinstance(x, dict):
            _check_date(x.get("start"), f"model.periods[{i}].start", E, W); _check_date(x.get("end"), f"model.periods[{i}].end", E, W)
    for i, x in enumerate(arr("reigns")):
        if isinstance(x, dict): _check_date(x.get("start"), f"model.reigns[{i}].start", E, W)
    if isinstance(M.get("axis"), dict):
        _check_date(M["axis"].get("from"), "model.axis.from", E, W); _check_date(M["axis"].get("to"), "model.axis.to", E, W)
    cc = M.get("c14curve")
    if isinstance(cc, dict) and all(isinstance(cc.get(k), list) for k in ("calBP", "age", "sd")):
        if len(cc["calBP"]) != len(cc["age"]) or len(cc["calBP"]) != len(cc["sd"]): E("size", "model.c14curve", "calBP, age and sd need the same length")
        elif all(L.is_num(v) for v in cc["calBP"]) and any(i > 0 and not (v > cc["calBP"][i - 1]) for i, v in enumerate(cc["calBP"])):
            E("value", "model.c14curve.calBP", "must increase")
    dd = M.get("dendro")
    if isinstance(dd, dict) and not (isinstance(dd.get("master"), list) and isinstance(dd.get("sample"), list)) and "synthetic" not in dd:
        E("value", "model.dendro", "needs master and sample, or synthetic")

    def out(o, at, E, W):
        tb = T["OUT"].get(o.get("kind"), {}).get(o.get("of"))
        if tb is None: E("output", at + ".of", f"{o.get('of')} is not a {o.get('kind')} output of {ID}"); return
        L.walk(o, tb, at, E, W)
        for k, kd in tb.items():
            v = o.get(k)
            if not isinstance(kd, str) or not kd.startswith("ref") or not isinstance(v, str) or not L._full(L.ID_RE, v): continue
            if k == "event" and v not in ev: E("ref", f"{at}.{k}", f"no event {v}")
            if k in ("a", "b") and v not in ev and v not in pe: E("ref", f"{at}.{k}", f"no event or period {v}")
            if k == "reign" and v not in re_: E("ref", f"{at}.{k}", f"no reign {v}")
        for k in ("from", "to"):
            if isinstance(o.get(k), dict): _check_date(o[k], f"{at}.{k}", E, W)
        if o.get("of") == "convert" and isinstance(o.get("to"), str) and o["to"] in T["FIELDS"] and isinstance(o.get("field"), str) and o["field"] not in T["FIELDS"][o["to"]]:
            E("enum", at + ".field", "one of " + ", ".join(T["FIELDS"][o["to"]]))
        if o.get("of") == "crossdate" and not isinstance(M.get("dendro"), dict): E("ref", at + ".of", "needs model.dendro")
        if o.get("of") == "c14curve" and not isinstance(M.get("c14curve"), dict): E("ref", at + ".of", "needs model.c14curve")
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P


def _collect(v, kd, p, kind, out):
    if isinstance(kd, str):
        if kd.rstrip("!") == kind and isinstance(v, str) and v.strip() != "":
            out.append((v, p, []) if kind == "numx" else (v, p))
        return
    if "$obj" in kd:
        if not isinstance(v, dict): return
        for k, sub in kd["$obj"].items():
            if k in v: _collect(v[k], sub, p + "." + k, kind, out)
        return
    if "$list" in kd and isinstance(v, list):
        for i, x in enumerate(v): _collect(x, kd["$list"], f"{p}[{i}]", kind, out)


def _gather(spec, kind):
    out = []
    if not isinstance(spec, dict): return out
    _collect(spec.get("model"), {"$obj": T["MODEL"]}, "model", kind, out)
    outs = spec.get("outputs") if isinstance(spec.get("outputs"), list) else []
    for i, o in enumerate(outs):
        if isinstance(o, dict) and o.get("kind") in T["OUT"] and o.get("of") in T["OUT"][o["kind"]]:
            _collect(o, {"$obj": T["OUT"][o["kind"]][o["of"]]}, f"outputs[{i}]", kind, out)
    return out


def exprs(spec): return _gather(spec, "numx")
def keys(spec): return _gather(spec, "key")
