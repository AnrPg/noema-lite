# `med@1` — physiology, pharmacology, laboratory medicine and validated scores (`src/engines/med/med.js`, `NoemaLibMed`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for the numbers of medicine: the circulation (from cardiac output to a
time-varying-elastance pressure–volume loop), respiration and oxygen transport, acid–base (Henderson–Hasselbalch, compensation rules,
Stewart), the kidney (CKD-EPI 2021, EKFC, Cockcroft–Gault, KDIGO), fluids and sodium, pharmacodynamics and pharmacokinetics, the
glucose–insulin minimal model, body size, the ECG, 20 validated scores (each with its version and year) and clinical epidemiology (2×2
tables, Bayes, the Fagan nomogram, effect measures, ROC, Kaplan–Meier). **108 functions.** The Python twin is `tools/lib_med.py`
(`ID`, `check_spec`, `exprs`, `keys`; the same function table `SIG`, byte for byte). It checks and does not compute, and it gives the
same problems (code, path, message, level) as the JS `checkSpec`. The tests are `node tests/lib_med.js` (106 assertions) and
`node tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/med.json`, 25 specs). The reference activity is
`tools/activities_examples/pv-loop` (the left ventricle's pressure–volume loop: contractility, filling pressure and resistance as
sliders). The research behind this chapter is in the project's `engine-library/research/med.md` (part A).

**Educational only.** The engine never gives clinical advice. An input outside physiological bounds, a formula used outside the
population it was derived in, a unit that looks wrong, or a rate that would harm a real patient is reported as a code (§3), never as a
silent number. `clinic@1` (`docs/library/clinic.md`) reuses these calculators through `NoemaLibMed.calc` (NEWS2, the Severinghaus
curve, oxygen content) for its virtual patients.

Pure JS, no dependency, no clock, no randomness. The numerics written here and tested: erf (Abramowitz & Stegun 7.1.26, |error|
< 1.5 × 10⁻⁷) for Φ, Acklam's inverse normal (relative error < 1.15 × 10⁻⁹), RK4 for the Windkessel, the PV loop and the minimal model,
closed-form superposition for the PK models, a bisection for the iso-shunt curve.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "med@1",
  "params": [ { "id": "scr", "kind": "slider", "label": "scrLabel", "min": 0.4, "max": 6, "step": 0.1, "default": 1.0, "unit": "mg/dL" },
              { "id": "age", "kind": "slider", "label": "ageLabel", "min": 18, "max": 95, "step": 1, "default": 60 },
              { "id": "fem", "kind": "toggle", "label": "femLabel", "default": false },
              { "id": "acr", "kind": "slider", "label": "acrLabel", "min": 1, "max": 600, "step": 1, "default": 20 } ],
  "model": { "items": [
    { "id": "gfr", "fn": "renal.ckdepi", "in": { "scr": "scr", "age": "age", "female": "fem" } },
    { "id": "gfrSI", "fn": "renal.ckdepi", "in": { "scr": "scr * 88.42", "age": "age", "female": "fem" }, "units": { "scr": "umol/L" } },
    { "id": "cg", "fn": "renal.cg", "in": { "age": "age", "weight": 72, "scr": "scr", "female": "fem" }, "opts": { "weight": "actual" } },
    { "id": "heat", "fn": "renal.kdigo", "in": { "egfr": "140 * min(scr / 0.9, 1)^-0.302 * max(scr / 0.9, 1)^-1.2 * 0.9938^age", "acr": "acr" } } ] },
  "outputs": [ { "id": "egfr", "kind": "scalar", "of": "gfr.egfr" }, { "id": "stage", "kind": "scalar", "of": "gfr.stage" },
               { "id": "crcl", "kind": "scalar", "of": "cg.crcl" }, { "id": "young", "kind": "scalar", "of": "gfr.flag.validity" },
               { "id": "grid", "kind": "scene", "of": "heat" } ],
  "readouts": [ { "label": "egfrLabel", "expr": "egfr", "unit": "mL/min/1.73 m²", "format": "fixed", "digits": 0 } ],
  "plots": [ { "kind": "scene", "of": "grid", "title": "kdigoTitle", "height": 300 } ] }
```

- **`model.items`** (1–48): `{id, fn, in, units?, opts?, key?}`. `id` is a name, unique. `fn` is a function of the table in §2.
  `in` maps each input name of the function to a **numx** (a number, or an expression over the spec's consts, params and derived
  values, compiled once with NoemaExpr); a boolean parameter (a toggle) gives 0/1. `units` (optional) names the unit an input is given
  in, for the inputs that have two (§3.2). `opts` holds a function's options (an enum, or Kaplan–Meier's lists). `key` is an i18n
  key for the item's name, used by authoring tools only.
- An item's inputs are the spec's names only: one item cannot read another item's output (chain through `derived` instead).
- **Outputs**: `{id, kind, of}`. `of` is `"<item>"` (its first scalar), `"<item>.<field>"` (a scalar or a series of the function),
  `"<item>.flag.<code>"` (0/1), `"<item>.flags"` (how many codes the item raised), or `"<item>"` with `kind: "scene"` for the functions
  that draw one. Anything else is the checker's `output` error.
- `exprs(spec)` lists every string input as `[source, "model.items[i].in.<name>", []]`; `keys(spec)` lists the items' `key`s.
- **Runtime** (`run(spec, env)` → `{out, codes}`): `codes` maps each item id to the list of codes it raised. A value that cannot be
  computed is NaN (an empty series, an empty scene `{view, items: []}`); a run never throws.
- **Limits**: ≤ 48 items, ≤ 24 inputs per item, every series ≤ 2000 points (thinned by the core), every scene ≤ 2000 items, the PV loop
  ≤ 200 000 RK4 steps (8 beats at 0.5 ms), Kaplan–Meier ≤ 500 subjects. A typical run takes well under 1 ms; the PV loop about 20 ms.

### 1.1 Checker codes (`checkSpec`, the same in `tools/lib_med.py`)

| code | level | when |
|---|---|---|
| `format` | error | `model` is not an object |
| `value` | error | a missing required field, a value of the wrong kind; `opts` missing where the function needs it (`epi.km`); `events` not as long as `times` |
| `size` | error | more than 48 items, more than 24 inputs, a list too long |
| `id` | error | an item id that is not a name, or used twice |
| `fn` | error | not a function of med@1 |
| `input` | error | a required input (`!` in §2) missing |
| `unknown-input` | warning | an input the function does not have (ignored) |
| `units` | error | a unit on an input that is not the function's, on an input with only one unit, or a unit not in §3.2 |
| `enum` | error | an option outside its list (`scheme`, `shape`, `model`, `cutoffs`, `weight`) |
| `expr`, `name` | error | from the core: an input expression that does not compile, a name the spec does not define |
| `unknown-field` | warning | a field of an item or output the engine does not know |
| `output` | error | an `of` naming no item, or a field / series / scene the function does not give |

## 2. The functions

The input list marks required inputs with `!`; the others have the defaults written in the code (and in the research file). Units are
the canonical ones of §3.2 unless a row says otherwise: pressures mmHg, volumes mL, flows L/min, creatinine mg/dL, glucose mg/dL,
albumin g/dL, haemoglobin g/dL, ages in years, weights kg, heights cm, saturations as fractions 0–1 (but `spo2` in %), times ms in the
ECG and hours in PK. The source column is the comment written beside the formula in the code; the per-domain sources follow the table.

| fn | inputs (`!` required) | scalar outputs | series | scene | source (code comment) |
|---|---|---|---|---|---|
| `cardio.co` | `hr!` `sv!` `bsa` | `co` `ci` | — | — |  |
| `cardio.map` | `sbp!` `dbp!` | `map` `mapMeaney` `pp` | — | — | Meaney Blood Press Monit 2000;5:39 |
| `cardio.svr` | `map!` `co!` `cvp` | `svr` `wood` | — | — |  |
| `cardio.pvr` | `mpap!` `pawp!` `co!` | `pvr` `precap` | — | — | ESC/ERS PH 2022 |
| `cardio.ef` | `edv!` `esv!` | `sv` `ef` `hfClass` | — | — | ESC HF 2021 |
| `cardio.poiseuille` | `r!` `l!` `dp!` `eta` `rho` | `q` `res` `re` `vel` | — | — | Q = π r⁴ ΔP/(8 η L): r mm, L cm, ΔP mmHg, η mPa·s → Q mL/s |
| `cardio.laplace` | `p!` `r!` `h!` · opts `shape` | `stress` | — | — | kPa (P mmHg → kPa) |
| `cardio.bp` | `sbp!` `dbp!` · opts `scheme` | `cls` `crisis` | — | — | ESC 2024 (McEvoy EHJ 2024;45:3912) / ACC-AHA 2025 (Jones, Hypertension 2025) |
| `cardio.coupling` | `edv!` `ees!` `ea!` `v0` | `sv` `esv` `ef` `pes` `ratio` | — | — | Sunagawa Am J Physiol 1983 |
| `cardio.starling` | `ees!` `ea!` `v0` `a` `b` `pla` | `edv` `sv` `ef` | `p` `edv` `sv` | — | EDPVR P = A(e^{β(V−V0)} − 1) (Klotz 2006) + coupling |
| `cardio.fick` | `vo2!` `cao2!` `cvo2!` | `co` | — | — |  |
| `cardio.windkessel` | `r!` `c!` `hr!` `sv!` `zc` `ts` `beats` | `sbp` `dbp` `map` `pp` `tau` | `t` `p` `q` | — | 2-/3-element Windkessel, half-sine ejection (Westerhof 2009) |
| `cardio.pvloop` | `ees!` `hr!` `pla!` `emin` `v0` `r` `c` `zc` | `edv` `esv` `sv` `ef` `sw` `pes` `map` `sbp` `dbp` `co` | `t` `v` `p` `pao` | yes |  |
| `resp.pb` | `alt!` | `pb` `pio2` | — | — |  |
| `resp.alveolar` | `fio2!` `paco2!` `pb` `rq` `temp` `pao2` `age` | `pAO2` `pAO2full` `aa` `aaNormal` `pf` `ph2o` | — | — |  |
| `resp.sat` | `po2!` `ph` `temp` `pco2` `p50` `hill` · opts `model` | `so2` `p50` `po2v` | — | — |  |
| `resp.odc` | `ph` `temp` `pco2` `hb` | `p50` | `po2` `so2` `so2ref` `content` | — |  |
| `resp.content` | `hb!` `sao2!` `pao2` `svo2` `pvo2` `co` | `cao2` `cvo2` `avd` `do2` `vo2` `o2er` | — | — |  |
| `resp.shunt` | `hb!` `fio2!` `pao2!` `paco2` `pb` `avd` | `qsqt` `pAO2` `cco2` `cao2` | — | — | Qs/Qt = (CcO2 − CaO2)/(CcO2 − CvO2), CvO2 = CaO2 − a–v difference |
| `resp.isoshunt` | `shunt!` `hb` `avd` `paco2` `pb` `fio2` | `pao2` | `fio2s` `pao2s` | — | iso-shunt lines (Benatar, Br J Anaesth 1973) |
| `resp.deadspace` | `paco2!` `peco2!` `vt` `rr` | `vdvt` `vd` `va` | — | — | Bohr/Enghoff: VD/VT = (PaCO2 − PE̅CO2)/PaCO2 |
| `resp.mechanics` | `vt!` `pplat!` `peep!` `ppeak` | `cstat` `cdyn` `dp` | — | — | Amato NEJM 2015;372:747 (driving pressure ≤ 15), plateau ≤ 30 cmH2O |
| `resp.pbw` | `height!` `female!` | `pbw` `vt6` `vt8` | — | — |  |
| `resp.ventilation` | `vco2!` `va!` | `paco2` | — | — |  |
| `resp.ards` | `peep` `pf` `spo2` `fio2` | `berlin` `sf` `global` | — | — | Berlin (ARDS Definition Task Force, JAMA 2012) + global definition (Matthay AJRCCM 2024;209:37) |
| `acid.hh` | `hco3!` `paco2!` `ph` | `phCalc` `h` `diff` | — | — |  |
| `acid.abg` | `ph!` `paco2!` `hco3!` `na` `cl` `alb` `chronic` | `primary` `expLo` `expHi` `verdict` `ag` `agc` `delta` `hhDiff` | — | — | Winters (Albert, Dell & Winters 1967) |
| `acid.ag` | `na!` `cl!` `hco3!` `alb` `k` `agNormal` | `ag` `agc` `delta` `deltaClass` | — | — | albumin correction Figge Crit Care Med 1998;26:1807; delta ratio (Rastegar JASN 2007) |
| `acid.winters` | `hco3!` | `paco2` `lo` `hi` | — | — |  |
| `acid.osm` | `na!` `glucose!` `bun!` `etoh` `measured` | `calc` `gap` `eff` | — | — |  |
| `acid.stewart` | `na!` `cl!` `alb!` `ph!` `hco3!` `k` `ca` `mg` `lactate` `phos` | `sida` `side` `sig` `albAnion` `phosAnion` | — | — | Stewart 1983; Figge–Fencl: [Alb⁻] = alb(g/L)(0.123 pH − 0.631), [Pi⁻] = Pi(mmol/L)(0.309 pH − 0.469) |
| `acid.sbe` | `ph!` `hco3!` | `sbe` | — | — | Van Slyke equation (CLSI C46-A2) |
| `acid.uag` | `una!` `uk!` `ucl!` | `uag` | — | — | ---- renal (KDIGO 2024 CKD, Kidney Int 2024;105(4S):S117; NKF-ASN Task Force 2021) ---- |
| `renal.ckdepi` | `scr!` `age!` `female!` | `egfr` `stage` | — | — |  |
| `renal.ckdepiCys` | `scr!` `cys!` `age!` `female!` | `egfr` `stage` | — | — | CKD-EPI 2021 creatinine–cystatin C (Inker NEJM 2021) |
| `renal.cys2012` | `cys!` `age!` `female!` | `egfr` `stage` | — | — | Inker NEJM 2012 |
| `renal.ekfc` | `scr!` `age!` `female!` | `egfr` `stage` | — | — | EKFC (Pottel Ann Intern Med 2021;174:183): adult Q 0.70 / 0.90 mg/dL (62 / 80 µmol/L); 2–25 y the paper's Q polynomial in age; under 2 y `validity` |
| `renal.cg` | `age!` `weight!` `scr!` `female!` `height` · opts `weight` | `crcl` `wt` | — | — | Cockcroft & Gault, Nephron 1976;16:31 |
| `renal.schwartz` | `height!` `scr!` | `egfr` | — | — | bedside Schwartz, JASN 2009;20:629 (1–16 y) |
| `renal.ckid` | `height!` `scr!` `age!` `female!` | `egfr` | — | — | CKiD U25 (Pierce Kidney Int 2021;99:948): eGFR = K·height(m)/Scr; K M 39.0·1.008^(a−12) (< 12), 39.0·1.045^(a−12) (12–18), 50.8; F 36.1·1.008^(a−12), 36.1·1.023^(a−12), 41.4 — checked against Table 2 (PMC9083470) |
| `renal.mdrd` | `scr!` `age!` `female!` | `egfr` | — | — | Levey 2006 (IDMS), no race coefficient |
| `renal.fena` | `una!` `pna!` `ucr!` `pcr!` `diuretic` | `fena` `cls` | — | — |  |
| `renal.feurea` | `uurea!` `purea!` `ucr!` `pcr!` | `feurea` | — | — |  |
| `renal.clearance` | `u!` `v!` `p!` | `cl` | — | — |  |
| `renal.kdigo` | `egfr!` `acr!` | `g` `a` `risk` | — | yes |  |
| `renal.aki` | `scr!` `base!` `rise48` `uo` `uoh` `rrt` | `stage` | — | — | KDIGO AKI 2012 |
| `renal.deindex` | `egfr!` `bsa!` | `abs` | — | — | ---- fluids and electrolytes ---- |
| `fluid.tbw` | `weight!` `age!` `female!` | `tbw` `frac` | — | — |  |
| `fluid.nacorr` | `na!` `glucose!` | `katz` `hillier` | — | — | Katz NEJM 1973; Hillier Am J Med 1999;106:399 |
| `fluid.am` | `na!` `tbw!` `infna!` `infk` `vol` `hours` | `perL` `after` `per24` | — | — | Adrogué & Madias NEJM 2000;342:1493/1581 |
| `fluid.fwd` | `na!` `tbw!` `target` | `deficit` | — | — |  |
| `fluid.efwc` | `v!` `una!` `uk!` `pna!` | `efwc` | — | — |  |
| `fluid.ca` | `ca!` `alb!` | `corr` | — | — | Payne BMJ 1973 — poorly accurate: measure ionised Ca (KDIGO-MBD 2017) |
| `fluid.holliday` | `weight!` | `mlh` `mlday` | — | — | 100/50/20 mL/kg/day and the hourly 4-2-1 rule   // Holliday & Segar Pediatrics 1957;19:823 |
| `fluid.parkland` | `weight!` `tbsa!` | `total` `first8` `rate8` `brooke` | — | — | ---- pharmacodynamics (Rang & Dale 10e 2023; Neubig, IUPHAR, Pharmacol Rev 2003;55:597) ---- |
| `pd.emax` | `c!` `emax!` `ec50!` `e0` `hill` | `e` `frac` | `cs` `es` | — |  |
| `pd.occupancy` | `a!` `ka!` | `p` | — | — |  |
| `pd.schild` | `b!` `kb!` `ec50` | `dr` `ec50b` `pa2` | — | — | Gaddum/Schild |
| `pd.ti` | `td50!` `ed50!` `td1` `ed99` | `ti` `msf` | — | — |  |
| `pd.quantal` | `ed50!` `td50!` `sd` `dose` | `pEff` `pTox` | `doses` `eff` `tox` | — | ---- pharmacokinetics (Rowland & Tozer 5e 2019) ---- |
| `pk.iv` | `dose!` `v!` `clear!` `tau` `doses` `tend` | `k` `t12` `c0` `cmax` `cmin` `auc` `cssavg` `r` | `t` `c` | — |  |
| `pk.infusion` | `rate!` `v!` `clear!` `dur` `tend` | `k` `t12` `css` `cend` `frac` `auc` | `t` `c` | — |  |
| `pk.oral` | `dose!` `v!` `clear!` `ka!` `f` `tau` `doses` `tlag` `tend` | `k` `t12` `tmax` `cmax` `cmin` `auc` `cssavg` `r` | `t` `c` | — |  |
| `pk.twocpt` | `dose!` `v1!` `k10!` `k12!` `k21!` `tend` | `alpha` `beta` `ca` `cb` `vss` `t12a` `t12b` `auc` | `t` `c` | — |  |
| `pk.mm` | `rate!` `vmax!` `km!` `v!` `c0` `days` | `css` `cend` | `t` `c` | — | Michaelis–Menten elimination (phenytoin): dC/dt = (R − Vmax C/(Km + C))/V, t in days |
| `pk.loading` | `ctarget!` `v!` `clear` `f` `tau` | `ld` `md` | — | — |  |
| `pk.renal` | `dose!` `fe!` `crcl!` `normal` | `adj` `kf` | — | — | Giusti–Hayton / Dettli |
| `pk.phenytoin` | `c!` `alb!` | `sheiner` `wt` | — | — | Sheiner–Tozer 1978 (0.2·alb + 0.1); `wt` the revised Winter–Tozer 0.25·alb + 0.1 (Anderson Ann Pharmacother 1997;31:279) |
| `endo.minimal` | `gb!` `ib!` `sg` `si` `p2` `gdose` `vg` `imax` `ni` `tend` | `gmax` `gmin` `gend` `kg` | `t` `g` `x` `i` | — | Bergman minimal model, Am J Physiol 1979;236:E667 (G mg/dL, I µU/mL, t min) |
| `endo.homa` | `glucose!` `insulin!` | `ir` `beta` | — | — | Matthews Diabetologia 1985 |
| `endo.a1c` | `a1c!` | `eag` `ifcc` `cls` | — | — | Nathan Diabetes Care 2008; ADA Standards of Care |
| `endo.dm` | `fpg` `ogtt` `a1c` | `cls` | — | — | ---- body size ---- |
| `body.bmi` | `weight!` `height!` `age` · opts `cutoffs` | `bmi` `cls` | — | — | WHO 2000/2004 |
| `body.bsa` | `weight!` `height!` | `mosteller` `dubois` `haycock` | — | — |  |
| `body.ibw` | `height!` `female!` | `ibw` `pbw` | — | — |  |
| `body.lbw` | `weight!` `height!` `female!` | `lbw` | — | — | Janmahasatian Clin Pharmacokinet 2005;44:1051 |
| `body.adjbw` | `weight!` `height!` `female!` | `adjbw` `ibw` | — | — | ---- ECG (AHA/ACCF/HRS, Rautaharju Circulation 2009;119:e241) ---- |
| `ecg.qtc` | `qt!` `hr!` `female` `qrs` | `bazett` `fridericia` `framingham` `hodges` `spread` `cls` | — | — |  |
| `ecg.axis` | `i!` `avf!` | `axis` `naive` `cls` | — | — |  |
| `ecg.dipole` | `axis!` `mag` | `leadI` `leadII` `leadIII` `aVR` `aVL` `aVF` | — | yes |  |
| `ecg.rate` | `small` `rri` | `hr` | — | — | ---- validated scores (each documented with its version and year in docs/library/med.md) ---- |
| `score.cha2ds2vasc` | `age!` `chf` `htn` `dm` `stroke` `vasc` `female` | `score` | — | — | Lip Chest 2010 |
| `score.cha2ds2va` | `age!` `chf` `htn` `dm` `stroke` `vasc` | `score` | — | — | ESC 2024 AF (Van Gelder EHJ 2024) |
| `score.hasbled` | `htn` `renal` `liver` `stroke` `bleed` `labile` `age` `drugs` `alcohol` | `score` `high` | — | — | Pisters Chest 2010 |
| `score.wellspe` | `dvt` `altdx` `tachy` `immob` `prior` `hemopt` `cancer` | `score` `likely` `tier3` | — | — | Wells Thromb Haemost 2000 |
| `score.wellsdvt` | `cancer` `paralysis` `bedridden` `tender` `leg` `calf` `pitting` `collat` `prior` `altdx` | `score` `likely` | — | — | Wells NEJM 2003 |
| `score.perc` | `age` `hr` `spo2` `leg` `hemopt` `surgery` `prior` `hormone` | `count` `negative` | — | — | Kline 2004 |
| `score.curb65` | `confusion` `urea` `rr` `sbp` `dbp` `age` | `score` `cls` | — | — | Lim Thorax 2003 |
| `score.qsofa` | `rr!` `sbp!` `gcs!` | `score` `positive` | — | — |  |
| `score.sofa2` | `gcs` `delirium` `pf` `sf` `spo2` `adv` `novent` `ecmo` `map` `nepi` `dopa` `othervaso` `mcs` `novaso` `bili` `scr` `uo` `uoh` `rrt` `k` `ph` `hco3` `plt` | `score` `brain` `resp` `cardio` `liver` `kidney` `coag` | — | — | SOFA-2 (Ranzani JAMA 2025;334:2090, Table 2) |
| `score.phoenix` | `age!` `pf` `sf` `spo2` `imv` `rsupport` `vaso` `lactate` `map` `plt` `inr` `ddimer` `fib` `gcs` `fixedpupils` `infection` | `score` `resp` `cardio` `coag` `neuro` `sepsis` `shock` | — | — | Phoenix (Schlapbach JAMA 2024;331:665) |
| `score.sirs` | `temp` `hr` `rr` `paco2` `wbc` `bands` | `count` `positive` | — | — | Bone Chest 1992 |
| `score.gcs` | `eye!` `verbal!` `motor!` `pupils` | `gcs` `gcsp` `severe` | — | — | Teasdale & Jennett 1974; GCS-P Brennan J Neurosurg 2018 (v = 0: not testable) |
| `score.apgar` | `a!` `p!` `g!` `ac!` `r!` | `score` | — | — | Apgar 1953; AAP/ACOG 2015 |
| `score.news2` | `rr!` `spo2!` `o2!` `sbp!` `hr!` `cvpu!` `temp!` `scale2` | `score` `band` `red` | — | — |  |
| `score.heart` | `hist!` `ecgp!` `age!` `risk!` `trop!` | `score` `band` | — | — | Six Neth Heart J 2008 |
| `score.centor` | `exudate` `nodes` `fever` `nocough` `age` | `centor` `mcisaac` | — | — | McIsaac CMAJ 1998 |
| `score.childpugh` | `bili!` `alb!` `inr!` `ascites!` `enceph!` | `points` `cls` | — | — | Pugh Br J Surg 1973 |
| `score.meld3` | `bili!` `inr!` `cr!` `na!` `alb!` `female` `dialysis` | `meld` `raw` | — | — | MELD 3.0 (Kim WR Gastroenterology 2021;161:1887), OPTN 2023 bounds |
| `epi.diag` | `se!` `sp!` `prev!` `cohort` | `ppv` `npv` `lrp` `lrn` `dor` `youden` `acc` `tp` `fp` `fn` `tn` | — | — |  |
| `epi.table` | `a!` `b!` `c!` `d!` | `se` `sp` `ppv` `npv` `lrp` `lrn` `prev` | — | — |  |
| `epi.bayes` | `pre!` `lr!` | `post` `preOdds` `postOdds` | — | — |  |
| `epi.effect` | `cer!` `eer!` | `arr` `rrr` `rr` `or` `nnt` | — | — |  |
| `epi.or2rr` | `or!` `p0!` | `rr` | — | — | Zhang & Yu JAMA 1998;280:1690 |
| `epi.roc` | `a!` `b` | `auc` | `fpr` `tpr` | — | binormal ROC (Swets; Hanley & McNeil 1982) |
| `epi.km` | — · opts `times` `events` | `median` `n` `events` | `t` `s` | — | Kaplan & Meier JASA 1958 (a censoring at an event time stays at risk at that event) |
| `epi.fagan` | `pre!` `lr!` | `post` | — | yes |  |
| `epi.wilson` | `x!` `total!` `z` | `p` `lo` `hi` | — | — | ---------- scenes ---------- |

**Sources by domain** (all in the code beside the formulas):
- **Cardiovascular** — Guyton & Hall, *Textbook of Medical Physiology* 14e (2021); Klabunde, *Cardiovascular Physiology Concepts* 3e
  (2021). Fick (1870). Poiseuille; Fåhræus–Lindqvist (1931) for the validity limit. Laplace. MAP: Meaney, *Blood Press Monit* 2000;5:39.
  SVR (Wood units × 80). PVR and pre-capillary PH: ESC/ERS PH guidelines 2022 (mPAP > 20, PAWP ≤ 15, PVR > 2 WU). EF classes: ESC HF
  2021 (≤ 40 % reduced, 41–49 % mildly reduced, ≥ 50 % preserved). BP classes: ESC 2024 (McEvoy, *Eur Heart J* 2024;45:3912: < 120/70
  non-elevated, 120–139/70–89 elevated, ≥ 140/90 hypertension) or ACC/AHA 2025 (normal, elevated, stage 1, stage 2); crisis ≥ 180/120.
  Ventricular–arterial coupling: Sunagawa, *Am J Physiol* 1983 (SV = (EDV − V0)·Ees/(Ees + Ea)). EDPVR: Klotz, *Am J Physiol* 2006.
  Windkessel (2- and 3-element, half-sine ejection): Westerhof, Lankhaar & Westerhof, *Med Biol Eng Comput* 2009;47:131. **PV loop**:
  time-varying elastance (Suga & Sagawa, *Circ Res* 1974), the double-Hill activation of Stergiopulos, *Am J Physiol* 1996, ideal-diode
  valves, a 3-element Windkessel aorta, constant left-atrial pressure; RK4 0.5 ms, the 8th beat reported.
- **Respiratory** — West, *Respiratory Physiology* 11e (2020). Barometric pressure with altitude: West, *J Appl Physiol* 1996;81:1850
  (253 mmHg on Everest). Alveolar gas equation (simple and full form with R); A–a gradient and its age-normal (age/4 + 4); P/F.
  O₂–Hb curve: Severinghaus, *J Appl Physiol* 1979;46:599, with the Kelman/Severinghaus virtual-PO₂ correction for pH, temperature and
  PCO₂, or a Hill curve (n 2.7, P50 26.8). Content 1.34·Hb·S + 0.003·PO₂. Shunt equation, Riley's iso-shunt diagram (bisection).
  Bohr–Enghoff dead space. Ventilation PaCO₂ = 0.863·VCO₂/VA. Static and dynamic compliance, driving pressure (> 15 cmH₂O or plateau
  > 30 → `unsafe`: Amato, *NEJM* 2015;372:747; ARDSNet, *NEJM* 2000;342:1301). Predicted body weight (ARDSNet). ARDS: Berlin
  definition (*JAMA* 2012;307:2526) and the 2023 global definition (Matthay, *AJRCCM* 2024;209:37: S/F ≤ 315 with SpO₂ ≤ 97 %).
- **Acid–base** — Berend, de Vries & Gans, *NEJM* 2014;371:1434; Henderson–Hasselbalch (pK 6.1, 0.03); Winters (Albert, Dell & Winters,
  *Ann Intern Med* 1967;66:312); the expected compensations (respiratory acute/chronic: 1/3.5 and 4/5 per 10 mmHg; metabolic alkalosis
  0.7); anion gap and its albumin correction (Figge, *Crit Care Med* 1998;26:1807: +2.5 per g/dL); delta ratio (classes < 0.4, 0.4–0.8,
  0.8–2, > 2); osmolal gap; standard base excess (Van Slyke, CLSI C46-A2 2009); urine anion gap; Stewart (Stewart 1983; Figge–Fencl;
  Kellum, *Crit Care* 2000;4:6): SIDa, SIDe, SIG.
- **Renal** — KDIGO 2024 CKD (*Kidney Int* 2024;105(4S):S117): G and A categories, the heat map. **CKD-EPI 2021** creatinine (Inker,
  *NEJM* 2021;385:1737, race-free), CKD-EPI 2021 creatinine–cystatin, CKD-EPI 2012 cystatin (Inker, *NEJM* 2012;367:20). **EKFC**
  (Pottel, *Ann Intern Med* 2021;174:183) with Q 0.70/0.90 mg/dL for women/men ≥ 25 y. Cockcroft & Gault, *Nephron* 1976;16:31 (actual,
  ideal or adjusted weight). Bedside Schwartz (Schwartz, *JASN* 2009;20:629: 0.413·height/Scr). CKiD U25 (Pierce, *Kidney Int*
  2021;99:948). MDRD (Levey 2006, IDMS, no race coefficient) → `deprecated`. FENa (< 1 % prerenal, > 2 % intrinsic; invalid on
  diuretics), FEurea, clearance UV/P. AKI staging: KDIGO 2012 (creatinine × 1.5/2/3 or ≥ 4.0, +0.3 in 48 h, urine output, RRT).
  De-indexing eGFR by BSA.
- **Fluids** — Watson-like TBW fractions (0.6/0.5 adults, 0.5/0.45 elderly); sodium correction for glucose (Katz 1973: 1.6; Hillier,
  *Am J Med* 1999;106:399: 2.4); Adrogué–Madias (*NEJM* 2000;342:1493 and 1581) with the `unsafe` limit of Spasovski, *Eur J
  Endocrinol* 2014;170:G1 (≤ 10 mmol/L in 24 h); free-water deficit; electrolyte-free water clearance; Payne's corrected calcium (BMJ
  1973; always flagged `validity`: measure ionised calcium, KDIGO-MBD 2017); Holliday & Segar, *Pediatrics* 1957;19:823 (100/50/20 per
  day and 4-2-1 per hour); Parkland (4 mL·kg⁻¹·%TBSA⁻¹, half in 8 h) and modified Brooke (2 mL).
- **Pharmacodynamics** — Rang & Dale 10e (2023); Neubig, IUPHAR terms, *Pharmacol Rev* 2003;55:597: Emax/Hill, Clark occupancy,
  Schild (dose ratio, pA₂), therapeutic index and margin of safety (TD1/ED99), quantal log-normal dose–response.
- **Pharmacokinetics** — Rowland & Tozer, *Clinical Pharmacokinetics and Pharmacodynamics* 5e (2019): one-compartment IV bolus with
  repeated doses (accumulation R = 1/(1 − e^(−kτ))), infusion, oral Bateman with lag (ka = k by its limit), two-compartment (α, β,
  Vss), Michaelis–Menten (rate ≥ Vmax → no steady state, `unsafe`), loading and maintenance dose, renal dose adjustment (Dettli),
  phenytoin corrected for albumin (Sheiner–Tozer 1978; the revised Winter–Tozer coefficient 0.25 of Anderson, *Ann Pharmacother*
  1997;31:279 — the 0.275 found in some sources is Cheng et al., *Can J Hosp Pharm* 2016;69:269, fitted to one hospital's patients).
- **Endocrine** — Bergman's minimal model (*Am J Physiol* 1979; Bergman, *Diabetes* 1989) with an IVGTT bolus; HOMA1 (Matthews,
  *Diabetologia* 1985;28:412); A1c → eAG (Nathan, *Diabetes Care* 2008;31:1473: 28.7·A1c − 46.7) and IFCC mmol/mol; ADA Standards of
  Care 2025 diagnostic classes (FPG 100/126, OGTT 140/200, A1c 5.7/6.5).
- **Body size** — BMI (WHO 2000; WHO expert consultation 2004 for Asian cut-offs); BSA by Mosteller (*NEJM* 1987;317:1098), DuBois
  (1916), Haycock (1978); ideal weight by Devine (1974); predicted body weight (ARDSNet); lean body weight (Janmahasatian, *Clin
  Pharmacokinet* 2005;44:1051); adjusted weight (IBW + 0.4·excess).
- **ECG** — AHA/ACCF/HRS, Rautaharju, *Circulation* 2009;119:e241: QTc by Bazett, Fridericia, Framingham, Hodges (classes > 450/470,
  > 500 ms); the frontal axis from leads I and aVF (atan2 with Einthoven/Goldberger geometry, not the naive 45°), the dipole projected
  on the six limb leads (a scene); rate from small squares or RR.
- **Scores** — see §4.
- **Clinical epidemiology** — Sackett, *Evidence-Based Medicine*; Sox et al., *Medical Decision Making* 3e (2024): 2×2 tables,
  predictive values from Se/Sp/prevalence, LR±, DOR, Youden; odds-form Bayes; Fagan's nomogram (*NEJM* 1975;293:257, a scene);
  ARR/RRR/RR/OR/NNT (NNT rounded up; negative ARR → NNH as a negative NNT); OR → RR (Zhang & Yu, *JAMA* 1998;280:1690); the binormal ROC
  (AUC = Φ(a/√(1 + b²)), Hanley & McNeil 1982); Kaplan–Meier product-limit (1958; censored at an event time stay at risk); Wilson's
  interval for a proportion.

## 3. Runtime codes

Each item reports its own codes (`<item>.flag.<code>` 0/1, `<item>.flags` their count; `run().codes[<item>]` the list).

| code | meaning | examples |
|---|---|---|
| `range` | an input outside the physiological "soft" range (§3.1): computed, but suspicious | Na 118, HR 230 |
| `impossible` | an input outside the hard range, a boolean that is not 0/1, a result that cannot exist: **the item gives NaN** | pH 8.2, QT > RR, EF with ESV > EDV, A–a gradient < −5, Fick with CaO₂ ≤ CvO₂ |
| `units` | an input that looks given in the other unit (§3.2) | creatinine 88 (µmol/L into mg/dL), albumin 35 (g/L into g/dL), glucose 5.5 (mmol/L), Hb 140 (g/L) |
| `validity` | the formula is used outside the population or conditions it was derived in | CKD-EPI or CURB-65 under 18 y, QTc at HR < 50 or > 120 or QRS ≥ 120 ms, FENa on diuretics, Parkland < 20 % TBSA, A–a on FiO₂ > 0.21, delta ratio with HCO₃ ≥ 24, Poiseuille with Re > 2000, Holliday > 80 kg, corrected calcium (always) |
| `unsafe` | a plan that would harm a real patient | Na correction > 10 mmol/L in 24 h (hyponatraemia) or > 12 (hypernatraemia), driving pressure > 15 or plateau > 30 cmH₂O, Michaelis–Menten rate ≥ Vmax |
| `deprecated` | superseded by a newer method | MDRD (→ CKD-EPI 2021) |
| `verify` | a constant transcribed through secondary sources: **check before release** | none at present (EKFC under 25 y, the CKiD U25 constants and the phenytoin coefficient were checked in 2026-11) |
| `incomplete` | a required input is not a number (NaN), or an optional one given but NaN | |

### 3.1 Bounds (`RANGE`: hard low, hard high, soft low, soft high)

age 0–130 (soft 0–110) y · weight 0.3–400 (2–250) kg · height 20–260 (45–220) cm · HR 1–400 (30–220) · SV 0–300 (15–160) mL · SBP 20–350
(60–250) · DBP 5–250 (30–140) · MAP 5–300 (40–180) · CO 0.05–40 (1.5–20) L/min · Scr 0.05–40 (0.2–15) mg/dL · cystatin 0.1–15 (0.4–8)
mg/L · Na 80–220 (115–165) · K 0.5–15 (2.5–7) · Cl 40–180 (80–130) · HCO₃ 0.5–80 (8–45) · pH 6.3–8.0 (6.8–7.8) · PaCO₂ 5–200 (15–100) ·
PaO₂ 5–760 (30–600) · PO₂ 0–800 (5–650) · FiO₂ 0.05–1 (0.21–1) · glucose 5–3000 (40–600) mg/dL · albumin 0.3–7 (1.5–5.5) g/dL · Hb 1–30
(5–20) g/dL · SaO₂ 0–1 (0.5–1) · SvO₂ 0–1 (0.2–0.95) · temperature 15–45 (32–42) °C · QT 100–900 (250–600) ms · SpO₂ 0–100 (70–100) % ·
RR 0–120 (6–50) · GCS 3–15 · Se, Sp, prevalence, pre-test probability, CER, EER, p₀ 0–1 · LR 0–10⁹ · bilirubin 0.05–80 (0.1–40) mg/dL ·
INR 0.5–20 (0.8–8) · TBSA 0–100 % · A1c 2–25 (4–16) % · EDV 1–1000 (40–400) · ESV 0–1000 (10–350) mL · VT 10–3000 (150–1200) mL · TBW
0.1–300 (2–80) L. Inputs named like a boolean (`female`, `htn`, `o2`, `cvpu`, `diuretic`, … 41 names) must be 0 or 1.

### 3.2 Units

Each item computes in one canonical unit per dimension. An input given in the other unit is declared in `units` and converted first:

| dimension | canonical | other | inputs |
|---|---|---|---|
| creatinine | mg/dL | µmol/L (÷ 88.42) | `scr`, `cr`, `ucr`, `pcr`, `base` |
| glucose | mg/dL | mmol/L (× 18.016) | `glucose`, `fpg`, `ogtt`, `gb` |
| albumin | g/dL | g/L (÷ 10) | `alb` |
| BUN | mg/dL | mmol/L urea (× 2.801) | `bun`, `purea`, `uurea` |
| urea (CURB-65) | mmol/L | mg/dL BUN (× 0.357) | `urea` |
| haemoglobin | g/dL | g/L (÷ 10) | `hb` |
| gas pressures | mmHg | kPa (× 7.50062) | `pao2`, `paco2`, `po2`, `pco2`, `peco2`, `pvo2`, `pb` |
| bilirubin | mg/dL | µmol/L (÷ 17.1) | `bili` |
| calcium | mg/dL | mmol/L (× 4.008) | `ca` |
| phosphate | mmol/L | mg/dL (÷ 3.097) | `phos` |
| lactate | mmol/L | mg/dL (÷ 9.01) | `lactate` |

Without a declared unit, a value typical of the other unit raises `units` (creatinine > 30, glucose < 30, albumin > 7, Hb > 25), and
the number is still computed as given.

## 4. Validated scores (version and year)

| fn | score (version, year) | items → points | output | source |
|---|---|---|---|---|
| `score.cha2ds2vasc` | CHA₂DS₂-VASc (2010) | CHF, HTN, DM, vascular, female 1; age 65–74 1, ≥ 75 2; stroke/TIA 2 | `score` 0–9 | Lip, *Chest* 2010;137:263 |
| `score.cha2ds2va` | CHA₂DS₂-VA (ESC 2024) | the same without sex | `score` 0–8 | Van Gelder, *Eur Heart J* 2024;45:3314 |
| `score.hasbled` | HAS-BLED (2010) | HTN, renal, liver, stroke, bleeding, labile INR, age > 65, drugs, alcohol | `score`, `high` ≥ 3 | Pisters, *Chest* 2010;138:1093 |
| `score.wellspe` | Wells PE (2000) | DVT signs 3, PE most likely 3, HR > 100 1.5, immobilisation 1.5, prior 1.5, haemoptysis 1, cancer 1 | `score`, `likely` > 4, `tier3` | Wells, *Thromb Haemost* 2000;83:416 |
| `score.wellsdvt` | Wells DVT (2003) | 9 items 1 each, alternative diagnosis −2 | `score`, `likely` ≥ 2 | Wells, *NEJM* 2003;349:1227 |
| `score.perc` | PERC (2004) | 8 criteria | `count`, `negative` | Kline, *J Thromb Haemost* 2004;2:1247 |
| `score.curb65` | CURB-65 (2003) | confusion, urea > 7, RR ≥ 30, SBP < 90 or DBP ≤ 60, age ≥ 65 | `score`, `cls` | Lim, *Thorax* 2003;58:377 |
| `score.qsofa` | qSOFA (2016) | RR ≥ 22, SBP ≤ 100, GCS < 15 | `score`, `positive` ≥ 2 | Seymour, *JAMA* 2016;315:762 (SSC 2021 advises against it as a sole screen) |
| `score.sofa2` | SOFA-2 (2025) | per system 0–4 (missing → 0, footnote b): brain GCS 15 / 13–14 (or delirium drugs) / 9–12 / 6–8 / 3–5; respiratory PaO₂:FiO₂ > 300 / ≤ 300 / ≤ 225 / ≤ 150 / ≤ 75 mm Hg (3–4 need advanced support `adv`, or `novent` when it is unavailable or precluded; `ecmo` → 4), SpO₂:FiO₂ only with SpO₂ < 98 % (≤ 300 / 250 / 200 / 120); cardiovascular MAP ≥ 70 / < 70, norepinephrine + epinephrine (base, µg/kg/min) ≤ 0.2 or any other agent → 2, > 0.2–0.4 or low + other → 3, > 0.4, medium + other or mechanical support (`mcs`) → 4; dopamine alone ≤ 20 / > 20–40 / > 40; `novaso` → MAP bands 70 / 60–69 / 50–59 / 40–49 / < 40; liver bilirubin ≤ 1.2 / 3.0 / 6.0 / 12.0 / > 12 mg/dL; kidney creatinine ≤ 1.2 / 2.0 / 3.5 / > 3.5 mg/dL or urine output (`uo` mL/kg/h over `uoh` h) < 0.5 for 6–12 h / ≥ 12 h, < 0.3 for ≥ 24 h or anuria ≥ 12 h, RRT or its criteria (creatinine > 1.2 or oliguria < 0.3 > 6 h, plus K ≥ 6.0 or pH ≤ 7.20 with HCO₃ ≤ 12) → 4; platelets > 150 / ≤ 150 / ≤ 100 / ≤ 80 / ≤ 50 ×10³/µL | `score` 0–24 and the six parts | Ranzani, *JAMA* 2025;334:2090 (Table 2 and footnotes, transcribed from the article 2026-11) |
| `score.phoenix` | Phoenix Sepsis Score (2024) | respiratory P/F < 400 or S/F < 292 on any support 1, < 200 / < 220 on IMV 2, < 100 / < 148 on IMV 3 (S/F with SpO₂ ≤ 97 %); cardiovascular 1 / ≥ 2 vasoactives 1 / 2, lactate 5–< 11 / ≥ 11 mmol/L 1 / 2, MAP by age (< 1 mo 17–30 / < 17; 1–11 mo 25–38 / < 25; 1–< 2 y 31–43 / < 31; 2–< 5 y 32–44 / < 32; 5–< 12 y 36–48 / < 36; 12–17 y 38–51 / < 38 mm Hg) 1 / 2; coagulation platelets < 100, INR > 1.3, D-dimer > 2 mg/L FEU, fibrinogen < 100 mg/dL, 1 each, max 2; neurological GCS ≤ 10 1, fixed pupils 2 | `score`, `sepsis` (suspected infection — assumed unless `infection` 0 — and ≥ 2), `shock` (sepsis with ≥ 1 cardiovascular point); ≥ 18 y → `validity` | Schlapbach, *JAMA* 2024;331:665 (PMC10900966); Sanchez-Pinto, *JAMA* 2024;331:675; the edges as in the authors' R package `phoenix` 1.1.3 (< 200 where the clinical table prints 100–200) |
| `score.sirs` | SIRS (1992) | T > 38 or < 36, HR > 90, RR > 20 or PaCO₂ < 32, WBC > 12 or < 4 or bands > 10 % | `count`, `positive` ≥ 2 | Bone, *Chest* 1992;101:1644 |
| `score.gcs` | GCS (1974/2014), GCS-P (2018) | E 1–4, V 1–5, M 1–6; pupils unreactive 0–2 | `gcs`, `gcsp`, `severe` ≤ 8 | Teasdale, *Lancet Neurol* 2014;13:844; Brennan, *J Neurosurg* 2018;128:1612 |
| `score.apgar` | APGAR (1953) | five signs 0–2 | `score` | Apgar 1953; AAP/ACOG 644 (2015) |
| `score.news2` | NEWS2 (2017) | RR, SpO₂ (scale 1 or 2), air/O₂, SBP, HR, consciousness (CVPU), temperature | `score`, `band` (0 score 0, 1 low 1–4, 2 a single parameter of 3, 3 medium 5–6, 4 high ≥ 7), `red` | Royal College of Physicians, London 2017 |
| `score.heart` | HEART (2008) | history, ECG, age, risk factors, troponin, 0–2 each | `score`, `band` | Six, *Neth Heart J* 2008;16:191 |
| `score.centor` | Centor / McIsaac (1998) | exudate, nodes, fever, no cough; age 3–14 +1, ≥ 45 −1 | `centor`, `mcisaac` | McIsaac, *CMAJ* 1998;158:75 |
| `score.childpugh` | Child–Pugh (1973) | bilirubin, albumin, INR, ascites, encephalopathy 1–3 | `points`, `cls` A/B/C | Pugh, *Br J Surg* 1973;60:646 |
| `score.meld3` | MELD 3.0 (OPTN 2023) | sex, bilirubin, Na, INR, creatinine, albumin with the published bounds | `meld` (rounded), `raw` | Kim, *Gastroenterology* 2021;161:1887 |
| `renal.kdigo` | KDIGO 2024 heat map | G1–G5 × A1–A3 | `g`, `a`, `risk` 1–4, a scene | KDIGO 2024 |
| `renal.aki` | KDIGO AKI (2012) | creatinine ratio / rise, urine output, RRT | `stage` 0–3 | KDIGO AKI 2012 |
| `cardio.bp` | ESC 2024 / ACC-AHA 2025 BP classes | SBP, DBP | `cls`, `crisis` | as §2 |
| `endo.dm` | ADA 2025 | FPG, OGTT, A1c | `cls` 0 normal, 1 prediabetes, 2 diabetes | ADA Standards of Care 2025 |

**Check before release** (not implemented, or transcribed through secondary sources): the thresholds of the AMA/NICE-derived score
bands are flagged here. **SOFA-2** (Ranzani, *JAMA* 2025) and the **Phoenix** paediatric sepsis score (Schlapbach, *JAMA* 2024) were
added in 2026-11 (`score.sofa2`, `score.phoenix`), their cut-offs transcribed from the articles' tables and Phoenix's edges checked
against the authors' R package `phoenix` 1.1.3. (The EKFC Q values below 25 y, the CKiD U25 constants and the
phenytoin coefficient were checked in 2026-11 — the coefficient corrected from 0.275 to Anderson's 0.25 — and no longer raise `verify`.) PREVENT (2024) and SCORE2 (2021) are left out (their coefficient tables, ≈ 2–3 KB each,
would need transcription and a check against the published calculators).

## 5. Scenes

- `cardio.pvloop` — the loop (P against V of the 8th beat), the end-systolic line (slope Ees from V0, dashed `info`), the end-diastolic
  line (Emin, `muted`), EDV and ESV marked on the volume axis.
- `renal.kdigo` — the 6 × 3 heat map (green, yellow, orange, red), G and A labels, a circle on the patient's cell.
- `ecg.dipole` — the hexaxial reference (six lead axes, dashed), the heart's vector (an arrow, its angle clockwise from lead I so that
  +90° is aVF), its projections on I and aVF.
- `epi.fagan` — Fagan's nomogram: pre-test probability (left, 0.1–99.9 %), LR (middle, 0.001–1000), post-test probability (right); the
  straight line through the three points (logit(post) = logit(pre) + ln LR).

## 6. Edge cases (each one is a test)

Creatinine 88 without a unit → `units`; the same in µmol/L with `units` → the right eGFR. Glucose given as 5.5 → `units`. pH 8.2 →
`impossible`, NaN. QT longer than the RR interval → `impossible`. HR 40 in QTc → `validity`. CKD-EPI at 16 y → `validity`. EKFC at 1 y
→ `validity`. MDRD → `deprecated`. Na 110 + 3 % saline at a rate that raises Na > 10 in 24 h → `unsafe`. Driving pressure 18 → `unsafe`.
Michaelis–Menten rate ≥ Vmax → no steady state (NaN) + `unsafe`. Oral PK with ka = k → the limit formula, no NaN. Delta ratio with
HCO₃ 26 → `validity`. NNT with ARR 0 → ∞ is NaN + `impossible`; negative ARR → a negative NNT (NNH). Se 1 and Sp 1 → LR+ and DOR are NaN (undefined, not ∞). Kaplan–Meier
without `opts` → the checker's `value`. A boolean input of 2 → `impossible`. Every one of the 108 functions run with its required inputs
at mid-range, and with all inputs missing, never throws.

## 7. Reference values (asserted in `tests/lib_med.js`)

| # | case | expected | tol. | source |
|---|---|---|---|---|
| M1 | alveolar gas, FiO₂ 0.21, PB 760, PaCO₂ 40, R 0.8 | PAO₂ 99.7 mmHg | ±0.1 | West 11e ch. 5 |
| M2 | Severinghaus SO₂ at PO₂ 26.8 / 40 / 60 / 100 | 0.4986 / 0.7495 / 0.9058 / 0.9775 | ±0.001 | Severinghaus 1979 |
| M3 | Hill n 2.7, P50 26.8 at PO₂ 40 / 100 | 0.7467 / 0.9722 | ±0.0005 | formula |
| M4 | CaO₂ Hb 15, SaO₂ 0.98, PaO₂ 100 | 20.0 mL/dL | ±0.05 | West |
| M5 | CKD-EPI 2021: M 54 y Scr 0.9 / F 50 y 1.0 / M 60 y 1.5 | 101.5 / 68.6 / 53.0 | ±0.5 | Inker 2021 |
| M6 | EKFC M 60 y Scr 1.2 | 63.4 | ±0.5 | Pottel 2021 |
| M7 | Cockcroft–Gault M 60 y 72 kg Scr 1.0 / F 60 y 60 kg 1.2 | 80.0 / 47.2 mL/min | ±0.1 | Cockcroft & Gault 1976 |
| M8 | anion gap Na 140 Cl 104 HCO₃ 24, albumin 2.0 | AG 12, corrected 17 | exact | Figge 1998 |
| M9 | Winters, HCO₃ 12 | PaCO₂ 26 (24–28) | exact | Albert 1967 |
| M10 | Henderson–Hasselbalch HCO₃ 24, PaCO₂ 40 | pH 7.401 | ±0.002 | Guyton ch. 31 |
| M11 | osmolality Na 140, glucose 90, BUN 14 | 290 mOsm/kg | ±0.5 | standard |
| M12 | Adrogué–Madias Na 110, TBW 42 L, 1 L 0.9 % / 3 % | +1.02 / +9.37 mmol/L | ±0.01 | Adrogué & Madias 2000 |
| M13 | free-water deficit 70 kg M, Na 160 | 6.0 L | ±0.01 | Adrogué & Madias 2000 |
| M14 | QTc QT 400 HR 75: Bazett / Fridericia / Framingham / Hodges | 447.2 / 430.9 / 430.8 / 426.3 | ±0.2 | Rautaharju 2009 |
| M15 | BSA 170 cm 70 kg: Mosteller / DuBois / Haycock | 1.818 / 1.810 / 1.826 m² | ±0.002 | Mosteller 1987 etc. |
| M16 | PK V 50 L, CL 5 L/h: t½; C(6 h) after 500 mg IV; R at τ = t½; oral ka 1: tmax, Cmax | 6.93 h; 5.488 mg/L; 2.00; 2.558 h, 7.743 mg/L | ±0.1 % | Rowland & Tozer |
| M17 | mammography: prevalence 1 %, Se 80 %, FPR 9.6 % | PPV 7.8 % | ±0.1 % | Eddy 1982 |
| M18 | CER 0.20, EER 0.15 | ARR 0.05, NNT 20, RR 0.75, OR 0.706 | ±0.001 | Sackett |
| M19 | Kaplan–Meier {1, 2, 2⁺, 3, 4⁺, 5} | S 0.833, 0.667, 0.444, 0 | ±0.001 | Kaplan & Meier 1958 |
| M20 | binormal AUC d′ 1 / 2 | 0.760 / 0.921 | ±0.001 | Hanley & McNeil 1982 |
| M21 | 76-year-old woman with hypertension | CHA₂DS₂-VASc 4, CHA₂DS₂-VA 3 | exact | Lip 2010; ESC 2024 |
| M22 | GCS E2 V2 M4, both pupils unreactive | GCS 8, GCS-P 6 | exact | Brennan 2018 |
| M23 | Holliday–Segar 10 / 20 / 70 kg | 40 / 60 / 110 mL/h | exact | Holliday & Segar 1957 |
| M24 | MAP of 120/80 | 93.3 mmHg | ±0.1 | standard |
| M25 | 2-element Windkessel decay, P 120, τ 1.5 s, 0.6 s | 80.4 mmHg | ±0.1 | Westerhof 2009 |
| M26 | coupling EDV 120, V0 10, Ees = Ea = 2 | SV 55 mL | ±0.01 | Sunagawa 1983 |
| M27 | VCO₂ 200, VA 4.3 L/min | PaCO₂ 40.1 | ±0.1 | West ch. 2 |
| M28 | barometric pressure on the summit of Everest | 253 mmHg | ±2 | West 1996 |
| M29 | axis with equal net amplitudes in I and aVF | 49.1° (naive 45°) | ±0.1 | Einthoven/Goldberger geometry |
| M30 | MELD 3.0 M, bilirubin 2.0, INR 1.5, Cr 1.2, Na 130, albumin 3.0 | 20 | ±0.05 | Kim 2021 |

Beyond these: NEWS2 of the RCP's worked example, the PV loop's behaviour (a higher Ees → a higher EF and a lower ESV; a higher
resistance → a higher pressure and a smaller SV; a higher filling pressure → a bigger SV, Frank–Starling), Bohr dead space, the iso-shunt
curve flattening above 30 % shunt, the ABG interpreter on textbook gases, Stewart's SIG, KDIGO cells, AKI stages, the checker's codes,
the sim adapter (`engine.create(spec).run(inputs)`), the Worker source in a fresh `vm` context (identical outputs), speed, and the
equality of the function table in JS and Python.

## 8. The reference activity `pv-loop`

`tools/activities_examples/pv-loop`: one item `cardio.pvloop` at HR 70, three sliders — contractility Ees (0.5–4 mmHg/mL), filling
pressure (4–20 mmHg), peripheral resistance (0.5–2 mmHg·s/mL). The loop is a scene; one beat of LV and aortic pressure is a series plot;
readouts give SV, EF, EDV, ESV, MAP, CO and stroke work (in J: mmHg·mL ÷ 7500). Its `tests.json` asserts: the normal ventricle (EDV
135, SV 79, EF 59 %, MAP 97); systolic failure at Ees 1 (SV 49, EF 37 %, MAP 60); Frank–Starling at a filling pressure of 16 (SV 79
again, EDV 210, EF still 38 %); a doubled afterload (MAP 144, SV 61); afterload reduction in failure (SV 62 instead of 49). There are no
reflexes in the model: the activity shows the ventricle on its own, which its intro says.

**Shared change needed to ship it**: `pv-loop` (and `sepsis-case`, `docs/library/clinic.md`) must be added wherever the reference
activities are registered (the pack builder's example list and `tests/activities.js`, if each engine's example is to be run there), and
the catalogue (`src/engines/catalog.js`) must list `med@1` and `clinic@1` with their labels in the five languages.

## Uses the kernel

Since 2026-11-07: Φ and Φ⁻¹ by the kernel (`SK.normCdf`, `SK.normInv`: Wichura's AS241, about 16 digits, instead of A&S 7.1.26 and Acklam), roots by `SK.brent` (P50, the PaO₂ inversions) instead of bisection, and the pharmacokinetic stepper's compartments integrated by the kernel's RK4 (`SK.integrate`, the AUC one more state, exact for the scheme instead of the trapezoid). Each keeps a marked FALLBACK for a context without the kernel. Snapshot re-recorded (P50 differs in the last digit).
