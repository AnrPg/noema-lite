"""med@1 — the Python twin of engine/src/48_lib_med.js (docs/library/med.md): check_spec(spec), exprs(spec), keys(spec) give the same
problems (code, path, msg, level) and lists as the JS checkSpec / exprs / keys. It does not compute; SIG (the table of functions, their
inputs, outputs, series, scenes, options and units) is the same JSON as the engine's (tests/lib_med.js compares them)."""
import json
import enginelib as L

ID = "med@1"
SIG = json.loads(r'''{"fns":{"cardio.co":{"in":"hr! sv! bsa","out":"co ci","series":"","scene":0},"cardio.map":{"in":"sbp! dbp!","out":"map mapMeaney pp","series":"","scene":0},"cardio.svr":{"in":"map! co! cvp","out":"svr wood","series":"","scene":0},"cardio.pvr":{"in":"mpap! pawp! co!","out":"pvr precap","series":"","scene":0},"cardio.ef":{"in":"edv! esv!","out":"sv ef hfClass","series":"","scene":0},"cardio.poiseuille":{"in":"r! l! dp! eta rho","out":"q res re vel","series":"","scene":0},"cardio.laplace":{"in":"p! r! h!","out":"stress","series":"","scene":0,"opts":{"shape":"enum:sphere|cylinder"}},"cardio.bp":{"in":"sbp! dbp!","out":"cls crisis","series":"","scene":0,"opts":{"scheme":"enum:esc2024|accaha2025"}},"cardio.coupling":{"in":"edv! ees! ea! v0","out":"sv esv ef pes ratio","series":"","scene":0},"cardio.starling":{"in":"ees! ea! v0 a b pla","out":"edv sv ef","series":"p edv sv","scene":0},"cardio.fick":{"in":"vo2! cao2! cvo2!","out":"co","series":"","scene":0},"cardio.windkessel":{"in":"r! c! hr! sv! zc ts beats","out":"sbp dbp map pp tau","series":"t p q","scene":0},"cardio.pvloop":{"in":"ees! hr! pla! emin v0 r c zc","out":"edv esv sv ef sw pes map sbp dbp co","series":"t v p pao","scene":1},"resp.pb":{"in":"alt!","out":"pb pio2","series":"","scene":0},"resp.alveolar":{"in":"fio2! paco2! pb rq temp pao2 age","out":"pAO2 pAO2full aa aaNormal pf ph2o","series":"","scene":0},"resp.sat":{"in":"po2! ph temp pco2 p50 hill","out":"so2 p50 po2v","series":"","scene":0,"opts":{"model":"enum:severinghaus|hill"}},"resp.odc":{"in":"ph temp pco2 hb","out":"p50","series":"po2 so2 so2ref content","scene":0},"resp.content":{"in":"hb! sao2! pao2 svo2 pvo2 co","out":"cao2 cvo2 avd do2 vo2 o2er","series":"","scene":0},"resp.shunt":{"in":"hb! fio2! pao2! paco2 pb avd","out":"qsqt pAO2 cco2 cao2","series":"","scene":0},"resp.isoshunt":{"in":"shunt! hb avd paco2 pb fio2","out":"pao2","series":"fio2s pao2s","scene":0},"resp.deadspace":{"in":"paco2! peco2! vt rr","out":"vdvt vd va","series":"","scene":0},"resp.mechanics":{"in":"vt! pplat! peep! ppeak","out":"cstat cdyn dp","series":"","scene":0},"resp.pbw":{"in":"height! female!","out":"pbw vt6 vt8","series":"","scene":0},"resp.ventilation":{"in":"vco2! va!","out":"paco2","series":"","scene":0},"resp.ards":{"in":"peep pf spo2 fio2","out":"berlin sf global","series":"","scene":0},"acid.hh":{"in":"hco3! paco2! ph","out":"phCalc h diff","series":"","scene":0},"acid.abg":{"in":"ph! paco2! hco3! na cl alb chronic","out":"primary expLo expHi verdict ag agc delta hhDiff","series":"","scene":0},"acid.ag":{"in":"na! cl! hco3! alb k agNormal","out":"ag agc delta deltaClass","series":"","scene":0},"acid.winters":{"in":"hco3!","out":"paco2 lo hi","series":"","scene":0},"acid.osm":{"in":"na! glucose! bun! etoh measured","out":"calc gap eff","series":"","scene":0},"acid.stewart":{"in":"na! cl! alb! ph! hco3! k ca mg lactate phos","out":"sida side sig albAnion phosAnion","series":"","scene":0},"acid.sbe":{"in":"ph! hco3!","out":"sbe","series":"","scene":0},"acid.uag":{"in":"una! uk! ucl!","out":"uag","series":"","scene":0},"renal.ckdepi":{"in":"scr! age! female!","out":"egfr stage","series":"","scene":0},"renal.ckdepiCys":{"in":"scr! cys! age! female!","out":"egfr stage","series":"","scene":0},"renal.cys2012":{"in":"cys! age! female!","out":"egfr stage","series":"","scene":0},"renal.ekfc":{"in":"scr! age! female!","out":"egfr stage","series":"","scene":0},"renal.cg":{"in":"age! weight! scr! female! height","out":"crcl wt","series":"","scene":0,"opts":{"weight":"enum:actual|ideal|adjusted"}},"renal.schwartz":{"in":"height! scr!","out":"egfr","series":"","scene":0},"renal.ckid":{"in":"height! scr! age! female!","out":"egfr","series":"","scene":0},"renal.mdrd":{"in":"scr! age! female!","out":"egfr","series":"","scene":0},"renal.fena":{"in":"una! pna! ucr! pcr! diuretic","out":"fena cls","series":"","scene":0},"renal.feurea":{"in":"uurea! purea! ucr! pcr!","out":"feurea","series":"","scene":0},"renal.clearance":{"in":"u! v! p!","out":"cl","series":"","scene":0},"renal.kdigo":{"in":"egfr! acr!","out":"g a risk","series":"","scene":1},"renal.aki":{"in":"scr! base! rise48 uo uoh rrt","out":"stage","series":"","scene":0},"renal.deindex":{"in":"egfr! bsa!","out":"abs","series":"","scene":0},"fluid.tbw":{"in":"weight! age! female!","out":"tbw frac","series":"","scene":0},"fluid.nacorr":{"in":"na! glucose!","out":"katz hillier","series":"","scene":0},"fluid.am":{"in":"na! tbw! infna! infk vol hours","out":"perL after per24","series":"","scene":0},"fluid.fwd":{"in":"na! tbw! target","out":"deficit","series":"","scene":0},"fluid.efwc":{"in":"v! una! uk! pna!","out":"efwc","series":"","scene":0},"fluid.ca":{"in":"ca! alb!","out":"corr","series":"","scene":0},"fluid.holliday":{"in":"weight!","out":"mlh mlday","series":"","scene":0},"fluid.parkland":{"in":"weight! tbsa!","out":"total first8 rate8 brooke","series":"","scene":0},"pd.emax":{"in":"c! emax! ec50! e0 hill","out":"e frac","series":"cs es","scene":0},"pd.occupancy":{"in":"a! ka!","out":"p","series":"","scene":0},"pd.schild":{"in":"b! kb! ec50","out":"dr ec50b pa2","series":"","scene":0},"pd.ti":{"in":"td50! ed50! td1 ed99","out":"ti msf","series":"","scene":0},"pd.quantal":{"in":"ed50! td50! sd dose","out":"pEff pTox","series":"doses eff tox","scene":0},"pk.iv":{"in":"dose! v! clear! tau doses tend","out":"k t12 c0 cmax cmin auc cssavg r","series":"t c","scene":0},"pk.infusion":{"in":"rate! v! clear! dur tend","out":"k t12 css cend frac auc","series":"t c","scene":0},"pk.oral":{"in":"dose! v! clear! ka! f tau doses tlag tend","out":"k t12 tmax cmax cmin auc cssavg r","series":"t c","scene":0},"pk.twocpt":{"in":"dose! v1! k10! k12! k21! tend","out":"alpha beta ca cb vss t12a t12b auc","series":"t c","scene":0},"pk.mm":{"in":"rate! vmax! km! v! c0 days","out":"css cend","series":"t c","scene":0},"pk.loading":{"in":"ctarget! v! clear f tau","out":"ld md","series":"","scene":0},"pk.renal":{"in":"dose! fe! crcl! normal","out":"adj kf","series":"","scene":0},"pk.phenytoin":{"in":"c! alb!","out":"sheiner wt","series":"","scene":0},"endo.minimal":{"in":"gb! ib! sg si p2 gdose vg imax ni tend","out":"gmax gmin gend kg","series":"t g x i","scene":0},"endo.homa":{"in":"glucose! insulin!","out":"ir beta","series":"","scene":0},"endo.a1c":{"in":"a1c!","out":"eag ifcc cls","series":"","scene":0},"endo.dm":{"in":"fpg ogtt a1c","out":"cls","series":"","scene":0},"body.bmi":{"in":"weight! height! age","out":"bmi cls","series":"","scene":0,"opts":{"cutoffs":"enum:who|asian"}},"body.bsa":{"in":"weight! height!","out":"mosteller dubois haycock","series":"","scene":0},"body.ibw":{"in":"height! female!","out":"ibw pbw","series":"","scene":0},"body.lbw":{"in":"weight! height! female!","out":"lbw","series":"","scene":0},"body.adjbw":{"in":"weight! height! female!","out":"adjbw ibw","series":"","scene":0},"ecg.qtc":{"in":"qt! hr! female qrs","out":"bazett fridericia framingham hodges spread cls","series":"","scene":0},"ecg.axis":{"in":"i! avf!","out":"axis naive cls","series":"","scene":0},"ecg.dipole":{"in":"axis! mag","out":"leadI leadII leadIII aVR aVL aVF","series":"","scene":1},"ecg.rate":{"in":"small rri","out":"hr","series":"","scene":0},"score.cha2ds2vasc":{"in":"age! chf htn dm stroke vasc female","out":"score","series":"","scene":0},"score.cha2ds2va":{"in":"age! chf htn dm stroke vasc","out":"score","series":"","scene":0},"score.hasbled":{"in":"htn renal liver stroke bleed labile age drugs alcohol","out":"score high","series":"","scene":0},"score.wellspe":{"in":"dvt altdx tachy immob prior hemopt cancer","out":"score likely tier3","series":"","scene":0},"score.wellsdvt":{"in":"cancer paralysis bedridden tender leg calf pitting collat prior altdx","out":"score likely","series":"","scene":0},"score.perc":{"in":"age hr spo2 leg hemopt surgery prior hormone","out":"count negative","series":"","scene":0},"score.curb65":{"in":"confusion urea rr sbp dbp age","out":"score cls","series":"","scene":0},"score.qsofa":{"in":"rr! sbp! gcs!","out":"score positive","series":"","scene":0},"score.sirs":{"in":"temp hr rr paco2 wbc bands","out":"count positive","series":"","scene":0},"score.gcs":{"in":"eye! verbal! motor! pupils","out":"gcs gcsp severe","series":"","scene":0},"score.apgar":{"in":"a! p! g! ac! r!","out":"score","series":"","scene":0},"score.news2":{"in":"rr! spo2! o2! sbp! hr! cvpu! temp! scale2","out":"score band red","series":"","scene":0},"score.heart":{"in":"hist! ecgp! age! risk! trop!","out":"score band","series":"","scene":0},"score.centor":{"in":"exudate nodes fever nocough age","out":"centor mcisaac","series":"","scene":0},"score.childpugh":{"in":"bili! alb! inr! ascites! enceph!","out":"points cls","series":"","scene":0},"score.meld3":{"in":"bili! inr! cr! na! alb! female dialysis","out":"meld raw","series":"","scene":0},"epi.diag":{"in":"se! sp! prev! cohort","out":"ppv npv lrp lrn dor youden acc tp fp fn tn","series":"","scene":0},"epi.table":{"in":"a! b! c! d!","out":"se sp ppv npv lrp lrn prev","series":"","scene":0},"epi.bayes":{"in":"pre! lr!","out":"post preOdds postOdds","series":"","scene":0},"epi.effect":{"in":"cer! eer!","out":"arr rrr rr or nnt","series":"","scene":0},"epi.or2rr":{"in":"or! p0!","out":"rr","series":"","scene":0},"epi.roc":{"in":"a! b","out":"auc","series":"fpr tpr","scene":0},"epi.km":{"in":"","out":"median n events","series":"t s","scene":0,"opts":{"times":{"$req":true,"$list":"nonneg","max":500,"min":1},"events":{"$req":true,"$list":"int:0:1","max":500,"min":1}}},"epi.fagan":{"in":"pre! lr!","out":"post","series":"","scene":1},"epi.wilson":{"in":"x! total! z","out":"p lo hi","series":"","scene":0}},"units":{"cr":["mg/dL","umol/L"],"glu":["mg/dL","mmol/L"],"alb":["g/dL","g/L"],"bun":["mg/dL","mmol/L"],"urea":["mmol/L","mg/dL"],"hb":["g/dL","g/L"],"p":["mmHg","kPa"],"bili":["mg/dL","umol/L"],"ca":["mg/dL","mmol/L"],"phos":["mmol/L","mg/dL"],"lac":["mmol/L","mg/dL"]},"udim":{"scr":"cr","cr":"cr","ucr":"cr","pcr":"cr","base":"cr","glucose":"glu","fpg":"glu","ogtt":"glu","gb":"glu","alb":"alb","bun":"bun","purea":"bun","uurea":"bun","urea":"urea","hb":"hb","pao2":"p","paco2":"p","po2":"p","pco2":"p","peco2":"p","pvo2":"p","pb":"p","bili":"bili","ca":"ca","phos":"phos","lactate":"lac"},"flags":["range","validity","unsafe","units","impossible","deprecated","verify","incomplete"]}''')
FLAGS = SIG["flags"]

ITEM = {"id": "id!", "fn": "expr!", "in": {"$map": "numx", "max": 24}, "units": {"$map": "expr", "max": 12}, "key": "key"}
TABLE = {"items": {"$req": True, "$list": {"$obj": ITEM}, "min": 1, "max": 48}}

def _words(s): return [w for w in s.split(" ") if w]
def sig_in(fn): return [{"name": t.replace("!", ""), "req": t.endswith("!")} for t in _words(SIG["fns"][fn]["in"])]

def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m):
        E("format", "model", "not an object"); L.check_outputs(spec, ID, ["scalar", "series", "scene"], lambda o, at, E2, W2: None, E, W); return P
    items = m["items"] if isinstance(m.get("items"), list) else []
    def strip(it):
        if not L.is_obj(it): return it
        return {k: v for k, v in it.items() if k != "opts"}
    mm = dict(m)
    if isinstance(m.get("items"), list): mm["items"] = [strip(it) for it in m["items"]]
    L.walk(mm, TABLE, "model", E, W)
    by_id = {}
    for i, it in enumerate(items):
        p = f"model.items[{i}]"
        if not L.is_obj(it): continue
        iid = it.get("id")
        if isinstance(iid, str) and L._full(L.ID_RE, iid):
            if iid in by_id: E("id", p + ".id", "used twice")
            else: by_id[iid] = it
        fn = it.get("fn")
        if not isinstance(fn, str) or not fn.strip(): continue
        S = SIG["fns"].get(fn)
        if S is None: E("fn", p + ".fn", "not a function of med@1 (docs/library/med.md lists them)"); continue
        ins = sig_in(fn); names = [x["name"] for x in ins]; given = it["in"] if L.is_obj(it.get("in")) else {}
        for x in ins:
            if x["req"] and x["name"] not in given: E("input", f"{p}.in.{x['name']}", f"missing (an input {fn} needs)")
        for k in given:
            if k not in names: W("unknown-input", f"{p}.in.{k}", f"ignored (not an input of {fn})")
        if L.is_obj(it.get("units")):
            for k, u in it["units"].items():
                dim = SIG["udim"].get(k)
                if k not in names: E("units", f"{p}.units.{k}", f"not an input of {fn}")
                elif not dim: E("units", f"{p}.units.{k}", "this input has one unit only (docs/library/med.md)")
                elif u not in SIG["units"][dim]: E("units", f"{p}.units.{k}", "one of " + ", ".join(SIG["units"][dim]))
        if "opts" in it: L.walk(it["opts"], S.get("opts", {}), p + ".opts", E, W)
        elif S.get("opts") and any(L.is_obj(k) and k.get("$req") for k in S["opts"].values()): E("value", p + ".opts", "missing")
        o = it.get("opts")
        if fn == "epi.km" and L.is_obj(o) and isinstance(o.get("times"), list) and isinstance(o.get("events"), list) and len(o["times"]) != len(o["events"]):
            E("value", p + ".opts.events", "needs as many items as times")
    def out(o, at, E2, W2):
        for k in o:
            if k not in ("id", "kind", "of"): W2("unknown-field", f"{at}.{k}", "ignored")
        of = o["of"]; dot = of.find(".")
        iid, field = (of, "") if dot < 0 else (of[:dot], of[dot + 1:])
        it = by_id.get(iid)
        if it is None: E2("output", at + ".of", "names no item of the model"); return
        S = SIG["fns"].get(it["fn"])
        if S is None: return
        if o["kind"] == "scalar":
            ok = field == "" or field in _words(S["out"]) or field == "flags" or (field.startswith("flag.") and field[5:] in FLAGS)
            if not ok: E2("output", at + ".of", f"{iid} ({it['fn']}) has no scalar {field}")
        elif o["kind"] == "series":
            if field not in _words(S["series"]): E2("output", at + ".of", f"{iid} ({it['fn']}) has no series {field or '(name one: ' + (S['series'] or 'none') + ')'}")
        elif not S["scene"] or field not in ("", "scene"): E2("output", at + ".of", f"{iid} ({it['fn']}) draws no scene")
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P

def _items(spec):
    m = spec.get("model") if L.is_obj(spec) else None
    return m["items"] if L.is_obj(m) and isinstance(m.get("items"), list) else []

def exprs(spec):
    out = []
    for i, it in enumerate(_items(spec)):
        if L.is_obj(it) and L.is_obj(it.get("in")):
            for k, v in it["in"].items():
                if isinstance(v, str): out.append([v, f"model.items[{i}].in.{k}", []])
    return out

def keys(spec):
    return [[it["key"], f"model.items[{i}].key"] for i, it in enumerate(_items(spec)) if L.is_obj(it) and isinstance(it.get("key"), str)]
