/* med@1 (src/engines/med/med.ts, docs/library/med.md): published reference values (the source in each message, with its tolerance),
   the edge cases and their codes, the checker's codes, the sim adapter, the Worker source in a fresh global, speed, and the SIG table
   being the golden one of the former Python twin (tools/lib_med.py).  Run: node tests/lib_med.js */
'use strict';
const path = require('path'), vm = require('vm');
const want = require('./golden.cjs')('lib_med');   // the golden outputs of the former Python twin (tests/golden.cjs)
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibMed = ENGINES.mod('med@1');
const M = NoemaLibMed;
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const R = (fn, inp, opts, units) => M.compute(fn, inp, opts, units);
const V = (fn, inp, k, opts, units) => R(fn, inp, opts, units).v[k];

// ---- 1. reference values (docs/library/med.md §reference values) ----
ok(near(V('resp.alveolar', { fio2: 0.21, paco2: 40 }, 'pAO2'), 99.7, 0.2), 'M1 alveolar gas equation FiO2 0.21, PaCO2 40, R 0.8 → PAO2 ≈ 99.7 mmHg (West, Respiratory Physiology 11e) ±0.2');
for (const [p, s] of [[26.8, 0.4986], [40, 0.7495], [60, 0.9058], [100, 0.9775]]) ok(near(V('resp.sat', { po2: p }, 'so2'), s, 0.001), `M2 Severinghaus 1979: SO2(${p} mmHg) = ${s} ±0.001`);
ok(near(V('resp.sat', { po2: 40 }, 'so2', { model: 'hill' }), 0.7467, 0.0005) && near(V('resp.sat', { po2: 100 }, 'so2', { model: 'hill' }), 0.9722, 0.0005), 'M3 Hill n 2.7, P50 26.8: SO2 0.7467 at 40, 0.9722 at 100 mmHg ±0.0005');
ok(near(V('resp.content', { hb: 15, sao2: 0.98, pao2: 100 }, 'cao2'), 20.0, 0.05), 'M4 CaO2 = 1.34·Hb·SaO2 + 0.003·PaO2: Hb 15, 0.98, 100 → 20.0 mL/dL (West) ±0.05');
ok(near(V('renal.ckdepi', { scr: 0.9, age: 54, female: 0 }, 'egfr'), 101.5, 0.5) && near(V('renal.ckdepi', { scr: 1.0, age: 50, female: 1 }, 'egfr'), 68.6, 0.5) && near(V('renal.ckdepi', { scr: 1.5, age: 60, female: 0 }, 'egfr'), 53.0, 0.5), 'M5 CKD-EPI 2021 (Inker NEJM 2021): M54 0.9 → 101.5; F50 1.0 → 68.6; M60 1.5 → 53.0 mL/min/1.73 m² ±0.5');
ok(near(V('renal.ekfc', { scr: 1.2, age: 60, female: 0 }, 'egfr'), 63.4, 0.5), 'M6 EKFC (Pottel Ann Intern Med 2021): M60 Scr 1.2 → 63.4 ±0.5');
ok(near(V('renal.cg', { age: 60, weight: 72, scr: 1.0, female: 0 }, 'crcl'), 80.0, 0.1) && near(V('renal.cg', { age: 60, weight: 60, scr: 1.2, female: 1 }, 'crcl'), 47.2, 0.1), 'M7 Cockcroft–Gault 1976: 80.0 and 47.2 mL/min ±0.1');
{ const r = R('acid.ag', { na: 140, cl: 104, hco3: 24, alb: 2.0 }).v; ok(r.ag === 12 && r.agc === 17, 'M8 anion gap 12, albumin-corrected (Figge 1998) 17'); }
{ const r = R('acid.winters', { hco3: 12 }).v; ok(r.paco2 === 26 && r.lo === 24 && r.hi === 28, 'M9 Winters (Albert, Dell & Winters 1967): HCO3 12 → PaCO2 26 (24–28)'); }
ok(near(V('acid.hh', { hco3: 24, paco2: 40 }, 'phCalc'), 7.401, 0.002), 'M10 Henderson–Hasselbalch HCO3 24, PaCO2 40 → pH 7.401 ±0.002');
ok(near(V('acid.osm', { na: 140, glucose: 90, bun: 14 }, 'calc'), 290, 0.5), 'M11 osmolality 2·Na + glucose/18 + BUN/2.8 = 290 mOsm/kg ±0.5');
ok(near(V('fluid.am', { na: 110, tbw: 42, infna: 154 }, 'perL'), 1.02, 0.01) && near(V('fluid.am', { na: 110, tbw: 42, infna: 513 }, 'perL'), 9.37, 0.01), 'M12 Adrogué–Madias (NEJM 2000): +1.02 (0.9 %) and +9.37 (3 %) mmol/L per litre ±0.01');
ok(near(V('fluid.fwd', { na: 160, tbw: 42 }, 'deficit'), 6.0, 0.01), 'M13 free-water deficit 70 kg man, Na 160 → 6.0 L ±0.01');
{ const r = R('ecg.qtc', { qt: 400, hr: 75 }).v; ok(near(r.bazett, 447.2, 0.2) && near(r.fridericia, 430.9, 0.2) && near(r.framingham, 430.8, 0.2) && near(r.hodges, 426.3, 0.2), 'M14 QTc QT 400 HR 75: Bazett 447.2, Fridericia 430.9, Framingham 430.8, Hodges 426.3 ms ±0.2 (Rautaharju 2009)'); }
{ const r = R('body.bsa', { weight: 70, height: 170 }).v; ok(near(r.mosteller, 1.818, 0.002) && near(r.dubois, 1.810, 0.002) && near(r.haycock, 1.826, 0.002), 'M15 BSA 170 cm 70 kg: Mosteller 1.818, DuBois 1.810, Haycock 1.826 m² ±0.002'); }
{ const iv = R('pk.iv', { dose: 500, v: 50, clear: 5 }).v, or = R('pk.oral', { dose: 500, v: 50, clear: 5, ka: 1 }).v, rp = R('pk.iv', { dose: 500, v: 50, clear: 5, tau: Math.LN2 / 0.1, doses: 10 }).v, ts = R('pk.iv', { dose: 500, v: 50, clear: 5 }).s;
  const c6 = M.calc.pkConc(6, { route: 'iv', dose: 500, v: 50, k: 0.1, n: 1, tau: 0 });
  ok(near(iv.t12, 6.931, 0.007) && near(c6, 5.488, 0.006) && near(rp.r, 2.0, 1e-9) && near(or.tmax, 2.558, 0.003) && near(or.cmax, 7.743, 0.008) && ts.t.length === 601, 'M16 PK V 50 L, CL 5 L/h: t½ 6.93 h; C(6 h) 5.488 mg/L; R = 2 at τ = t½; oral ka 1: tmax 2.558 h, Cmax 7.743 mg/L (Rowland & Tozer) ±0.1 %'); }
ok(near(V('epi.diag', { se: 0.8, sp: 0.904, prev: 0.01 }, 'ppv'), 0.078, 0.001), 'M17 mammography (Eddy 1982; Gigerenzer & Hoffrage 1995): PPV 7.8 % ±0.1 %');
{ const r = R('epi.effect', { cer: 0.20, eer: 0.15 }).v; ok(near(r.arr, 0.05, 1e-12) && near(r.nnt, 20, 1e-9) && near(r.rr, 0.75, 1e-12) && near(r.or, 0.706, 0.001), 'M18 CER 0.20, EER 0.15: ARR 0.05, NNT 20, RR 0.75, OR 0.706'); }
{ const r = R('epi.km', {}, { times: [1, 2, 2, 3, 4, 5], events: [1, 1, 0, 1, 0, 1] }); const s = r.s.s; ok(near(s[1], 0.8333, 0.001) && near(s[2], 0.6667, 0.001) && near(s[3], 0.4444, 0.001) && s[4] === 0 && r.v.median === 3, 'M19 Kaplan–Meier {1, 2, 2+, 3, 4+, 5}: 0.833, 0.667, 0.444, 0; median 3 (Kaplan & Meier 1958)'); }
ok(near(V('epi.roc', { a: 1 }, 'auc'), 0.760, 0.001) && near(V('epi.roc', { a: 2 }, 'auc'), 0.921, 0.001), 'M20 binormal ROC, equal variances (a = d′): d′ = 1 → AUC 0.760, d′ = 2 → 0.921 (Hanley & McNeil 1982) ±0.001');
ok(V('score.cha2ds2vasc', { age: 76, htn: 1, female: 1 }, 'score') === 4 && V('score.cha2ds2va', { age: 76, htn: 1 }, 'score') === 3, 'M21 76-year-old woman with hypertension: CHA2DS2-VASc 4 (Lip 2010), CHA2DS2-VA 3 (ESC 2024)');
{ const r = R('score.gcs', { eye: 2, verbal: 2, motor: 4, pupils: 2 }).v; ok(r.gcs === 8 && r.gcsp === 6 && r.severe === 1, 'M22 GCS E2V2M4 = 8, both pupils unreactive → GCS-P 6 (Brennan 2018)'); }
ok(V('fluid.holliday', { weight: 10 }, 'mlh') === 40 && V('fluid.holliday', { weight: 20 }, 'mlh') === 60 && V('fluid.holliday', { weight: 70 }, 'mlh') === 110 && V('fluid.holliday', { weight: 70 }, 'mlday') === 2500, 'M23 Holliday–Segar (Pediatrics 1957): 4-2-1 rule 40 / 60 / 110 mL/h; 100/50/20 rule 2500 mL/day at 70 kg');
ok(near(V('cardio.map', { sbp: 120, dbp: 80 }, 'map'), 93.33, 0.01), 'M24 MAP 120/80 → 93.3 mmHg');
{ const w = R('cardio.windkessel', { r: 1, c: 1.5, hr: 60, sv: 70 }); const p0 = 120, tau = 1.5; ok(near(p0 * Math.exp(-0.6 / tau), 80.44, 0.01) && near(w.v.tau, 1.5, 1e-12) && near(w.v.map, 70, 2.5), 'M25 2-element Windkessel: τ = RC = 1.5 s, diastolic decay 120 → 80.4 mmHg in 0.6 s; MAP ≈ R·CO = 70 mmHg (Westerhof 2009)'); }
ok(near(V('cardio.coupling', { edv: 120, v0: 10, ees: 2, ea: 2 }, 'sv'), 55, 1e-9), 'M26 ventricular–arterial coupling EDV 120, V0 10, Ees = Ea = 2 → SV 55 mL (Sunagawa 1983)');
ok(near(V('resp.ventilation', { vco2: 200, va: 4.3 }, 'paco2'), 40.1, 0.1), 'M27 alveolar ventilation equation 0.863·200/4.3 → 40.1 mmHg (West)');
ok(near(V('resp.pb', { alt: 8848 }, 'pb'), 253, 2), 'M28 barometric pressure at the Everest summit (West 1996 model; measured 253 mmHg, West 1983) ±2');
{ const r = R('ecg.axis', { i: 1, avf: 1 }).v; ok(near(r.axis, 49.1, 0.1) && near(r.naive, 45, 1e-9) && r.cls === 0, 'M29 axis from I = aVF: 49.1° (the quick atan2(aVF, I) gives 45°), normal'); }
{ const r = R('score.meld3', { bili: 2.0, inr: 1.5, cr: 1.2, na: 130, alb: 3.0 }).v; ok(near(r.raw, 20.21, 0.05) && r.meld === 20, 'M30 MELD 3.0 (Kim 2021): bili 2, INR 1.5, Cr 1.2, Na 130, alb 3.0 → 20.2 → 20'); }
ok(V('score.news2', { rr: 24, spo2: 93, o2: 0, sbp: 105, hr: 115, cvpu: 0, temp: 38.5 }, 'score') === 8 && V('score.news2', { rr: 24, spo2: 93, o2: 0, sbp: 105, hr: 115, cvpu: 0, temp: 38.5 }, 'band') === 4, 'NEWS2 (RCP 2017): RR 24, SpO2 93 air, SBP 105, HR 115, alert, 38.5 °C → 8, high band');
ok(V('score.news2', { rr: 16, spo2: 98, o2: 0, sbp: 120, hr: 70, cvpu: 1, temp: 37 }, 'band') === 2, 'NEWS2: a single red parameter (new confusion) → low–medium band');
{ const lv = R('cardio.pvloop', { ees: 2.5, hr: 70, pla: 10 }).v, hi = R('cardio.pvloop', { ees: 4, hr: 70, pla: 10 }).v, pre = R('cardio.pvloop', { ees: 2.5, hr: 70, pla: 16 }).v;
  ok(lv.ef > 0.5 && lv.ef < 0.7 && lv.map > 80 && lv.map < 110 && lv.sw > 0, `PV loop (time-varying elastance): EF ${lv.ef.toFixed(2)}, MAP ${lv.map.toFixed(0)} mmHg in the physiological range`);
  ok(hi.ef > lv.ef && hi.esv < lv.esv && pre.sv > lv.sv && pre.edv > lv.edv, 'PV loop: more contractility → higher EF, lower ESV; more preload → bigger EDV and SV (Frank–Starling)'); }
{ const s = R('cardio.starling', { ees: 2, ea: 2 }); ok(s.s.sv.every((v, i, a) => i === 0 || v > a[i - 1]), 'Starling curve: SV rises with filling pressure'); }
{ const a = R('resp.sat', { po2: 40, ph: 7.2 }).v, b = R('resp.sat', { po2: 40, ph: 7.6 }).v; ok(a.so2 < 0.7495 && b.so2 > 0.7495 && a.p50 > 26.86 && b.p50 < 26.86, 'Bohr effect: acidosis shifts the curve right (P50 up), alkalosis left (Severinghaus virtual PO2)'); }
{ const lo = V('resp.isoshunt', { shunt: 0.1, fio2: 1 }, 'pao2'), hi = V('resp.isoshunt', { shunt: 0.4, fio2: 1 }, 'pao2'); ok(lo > 300 && hi < 100, `iso-shunt: on FiO2 1, PaO2 ${lo.toFixed(0)} with a 10 % shunt but ${hi.toFixed(0)} with 40 % (refractory to oxygen; Benatar 1973)`); }
{ const r = R('acid.abg', { ph: 7.25, paco2: 40, hco3: 17 }).v; ok(r.primary === 1 && r.verdict === 1, 'ABG: metabolic acidosis with PaCO2 above Winters → a concomitant respiratory acidosis'); }
{ const r = R('acid.abg', { ph: 7.40, paco2: 25, hco3: 15 }).v; ok(r.primary === 5, 'ABG: a normal pH with abnormal PaCO2 and HCO3 is a mixed disorder (code 5)'); }
{ const r = R('acid.abg', { ph: 7.30, paco2: 60, hco3: 26, chronic: 0 }).v; ok(r.primary === 3 && r.verdict === 0, 'ABG: acute respiratory acidosis with HCO3 +1 per 10 mmHg is appropriate'); }
ok(near(V('acid.stewart', { na: 140, cl: 102, alb: 4, ph: 7.4, hco3: 24 }, 'albAnion'), 11.17, 0.01), 'Stewart/Figge: albumin 40 g/L at pH 7.40 carries 11.17 mEq/L');
{ const r = R('renal.kdigo', { egfr: 50, acr: 120 }); ok(r.v.g === 3 && r.v.a === 2 && r.v.risk === 3 && r.sc.items.length > 18, 'KDIGO 2024 heat map: G3a A2 → high risk; the scene draws the grid'); }
ok(V('renal.aki', { scr: 2.1, base: 1.0 }, 'stage') === 2 && V('renal.aki', { scr: 1.2, base: 1.0, rise48: 0.3 }, 'stage') === 1 && V('renal.aki', { scr: 1.0, base: 1.0, uo: 0.2, uoh: 24 }, 'stage') === 3, 'KDIGO AKI 2012 staging by creatinine, rise and urine output');

// ---- 2. edge cases and their codes ----
const F = (fn, inp, flag, opts, units) => R(fn, inp, opts, units).v['flag.' + flag] === 1;
ok(F('renal.ckdepi', { scr: 88, age: 50, female: 0 }, 'impossible') || F('renal.ckdepi', { scr: 35, age: 50, female: 0 }, 'units'), 'creatinine in µmol/L given to an mg/dL input → units or impossible');
ok(F('renal.ckdepi', { scr: 35, age: 50, female: 0 }, 'units'), 'creatinine 35 "mg/dL": flagged as a probable unit mix-up (units)');
ok(near(V('renal.ckdepi', { scr: 79.6, age: 54, female: 0 }, 'egfr', {}, { scr: 'umol/L' }), 101.5, 0.6), 'units: µmol/L converted (÷ 88.42) gives the same eGFR');
ok(F('fluid.am', { na: 110, tbw: 30, infna: 513, vol: 1, hours: 6 }, 'unsafe'), 'sodium correction > 10 mmol/L in 24 h → unsafe (Spasovski 2014)');
ok(!F('fluid.am', { na: 120, tbw: 42, infna: 154, vol: 1, hours: 24 }, 'unsafe'), 'a slow correction is not flagged');
ok(Number.isFinite(V('pk.oral', { dose: 500, v: 50, clear: 5, ka: 0.1 }, 'cmax')), 'ka = k: the Bateman limit formula, no NaN');
ok(F('renal.ckdepi', { scr: 0.5, age: 12, female: 0 }, 'validity'), 'CKD-EPI in a 12-year-old → validity (adults only)');
ok(F('score.cha2ds2vasc', { age: 17 }, 'validity'), 'CHA2DS2-VASc for a 17-year-old → validity');
ok(F('ecg.qtc', { qt: 900, hr: 120 }, 'impossible'), 'QT longer than the RR interval → impossible');
ok(Number.isNaN(V('acid.ag', { na: 140, cl: 100, hco3: 30 }, 'delta')) && F('acid.ag', { na: 140, cl: 100, hco3: 30 }, 'validity'), 'delta ratio undefined when HCO3 ≥ 24 → NaN + validity');
ok(F('acid.ag', { na: 140, cl: 104, hco3: 24, alb: 35 }, 'units'), 'albumin 35 into a g/dL input → units');
ok(V('epi.effect', { cer: 0.1, eer: 0.2 }, 'nnt') === -10, 'negative ARR → negative NNT (a number needed to harm, NNH 10)');
ok(F('epi.effect', { cer: 0.1, eer: 0.1 }, 'impossible') && Number.isNaN(V('epi.effect', { cer: 0.1, eer: 0.1 }, 'nnt')), 'ARR 0 → NNT undefined: NaN + impossible');
ok(R('score.gcs', { eye: 4, verbal: 0, motor: 6 }).v['flag.incomplete'] === 1 && Number.isNaN(V('score.gcs', { eye: 4, verbal: 0, motor: 6 }, 'gcs')), 'GCS with the verbal part not testable (0) → no total, incomplete');
ok(F('body.bmi', { weight: 30, height: 130, age: 10 }, 'validity'), 'adult BMI classes in a child → validity');
ok(F('resp.alveolar', { fio2: 0.21, paco2: 40, pao2: 130 }, 'impossible'), 'PaO2 above PAO2 → impossible');
ok(F('resp.mechanics', { vt: 450, pplat: 32, peep: 10 }, 'unsafe'), 'plateau 32 / driving pressure 22 cmH2O → unsafe (Amato 2015)');
ok(F('pk.mm', { rate: 500, vmax: 400, km: 4, v: 50 }, 'unsafe') && Number.isNaN(V('pk.mm', { rate: 500, vmax: 400, km: 4, v: 50 }, 'css')), 'Michaelis–Menten: dosing rate ≥ Vmax → no steady state (unsafe)');
ok(F('renal.mdrd', { scr: 1, age: 50, female: 0 }, 'deprecated') && !F('renal.ckid', { scr: 0.6, height: 140, age: 10, female: 0 }, 'verify') && F('renal.ckid', { scr: 0.6, height: 140, age: 30, female: 0 }, 'validity'), 'MDRD → deprecated; CKiD U25 (constants checked) no longer verify; outside 1–25 y → validity');
ok(near(V('renal.ckid', { scr: 0.6, height: 140, age: 10, female: 0 }, 'egfr'), 89.56, 0.01) && near(V('renal.ckid', { scr: 0.8, height: 160, age: 14, female: 1 }, 'egfr'), 75.56, 0.01) && near(V('renal.ckid', { scr: 1.0, height: 175, age: 20, female: 0 }, 'egfr'), 88.9, 0.01), 'CKiD U25 (Pierce Kidney Int 2021;99:948, Table 2): K = 39.0·1.008^(a−12) (M < 12), 36.1·1.023^(a−12) (F 12–18), 50.8 (M ≥ 18) × height(m)/Scr');
ok(near(V('renal.ekfc', { scr: 0.5, age: 10, female: 0 }, 'egfr'), 109.64, 0.01) && near(V('renal.ekfc', { scr: 0.9, age: 16, female: 1 }, 'egfr'), 74.06, 0.01) && !F('renal.ekfc', { scr: 0.9, age: 16, female: 1 }, 'verify') && F('renal.ekfc', { scr: 0.3, age: 1, female: 0 }, 'validity'), 'EKFC 2–25 y (Pottel Ann Intern Med 2021;174:183, Q polynomial in age, µmol/L): M 10 y Scr 0.5 → Q 0.535 mg/dL, 109.6; F 16 y Scr 0.9 → 74.1; under 2 y → validity');
ok(near(V('pk.phenytoin', { c: 10, alb: 2 }, 'sheiner'), 20, 1e-9) && near(V('pk.phenytoin', { c: 10, alb: 2 }, 'wt'), 16.667, 0.001) && !F('pk.phenytoin', { c: 10, alb: 2 }, 'verify'), 'phenytoin 10 mg/L, albumin 2 g/dL: Sheiner–Tozer C/(0.2·alb + 0.1) = 20; revised Winter–Tozer C/(0.25·alb + 0.1) = 16.7 (Anderson Ann Pharmacother 1997;31:279)');
// SOFA-2 (Ranzani, JAMA 2025;334:2090, Table 2): each band edge of the table and the footnotes
{ const S2 = (inp, k) => V('score.sofa2', inp, k || 'score');
  ok(S2({}) === 0 && S2({ gcs: 15, delirium: 1 }, 'brain') === 1 && [15, 14, 12, 8, 5].map(g => S2({ gcs: g }, 'brain')).join() === '0,1,2,3,4', 'SOFA-2 brain: GCS 15 / 13–14 / 9–12 / 6–8 / 3–5 → 0–4; delirium drugs at GCS 15 → 1; nothing given → 0 (footnote b)');
  ok([301, 300, 225, 150, 75].map(p => S2({ pf: p, adv: 1 }, 'resp')).join() === '0,1,2,3,4' && S2({ pf: 70 }, 'resp') === 2 && S2({ pf: 70, novent: 1 }, 'resp') === 4 && S2({ pf: 400, ecmo: 1 }, 'resp') === 4, 'SOFA-2 respiratory: P/F > 300 / ≤ 300 / ≤ 225 / ≤ 150 + support / ≤ 75 + support; no support caps at 2 unless precluded (h); ECMO → 4 (i)');
  ok([301, 300, 250, 200, 120].map(v => S2({ sf: v, spo2: 95, adv: 1 }, 'resp')).join() === '0,1,2,3,4' && S2({ sf: 120, spo2: 98, adv: 1 }, 'resp') === 0 && F('score.sofa2', { sf: 120, spo2: 98 }, 'validity'), 'SOFA-2 SpO2:FiO2 (footnote f): ≤ 300 / 250 / 200 / 120; not used when SpO2 ≥ 98 % (validity)');
  ok(S2({ map: 70 }, 'cardio') === 0 && S2({ map: 69 }, 'cardio') === 1 && S2({ nepi: 0.2 }, 'cardio') === 2 && S2({ othervaso: 1 }, 'cardio') === 2 && S2({ nepi: 0.3 }, 'cardio') === 3 && S2({ nepi: 0.1, othervaso: 1 }, 'cardio') === 3 && S2({ nepi: 0.41 }, 'cardio') === 4 && S2({ nepi: 0.3, othervaso: 1 }, 'cardio') === 4 && S2({ mcs: 1 }, 'cardio') === 4, 'SOFA-2 cardiovascular: MAP ≥ 70 / < 70; NE+E ≤ 0.2 or other → 2; > 0.2–0.4 or low + other → 3; > 0.4, medium + other or mechanical support → 4');
  ok([20, 40, 41].map(d => S2({ dopa: d }, 'cardio')).join() === '2,3,4' && [70, 65, 55, 45, 39].map(m => S2({ map: m, novaso: 1 }, 'cardio')).join() === '0,1,2,3,4', 'SOFA-2 dopamine alone ≤ 20 / > 20–40 / > 40 µg/kg/min (footnote l); MAP 70 / 60–69 / 50–59 / 40–49 / < 40 when vasoactives are precluded (m)');
  ok([1.2, 3.0, 6.0, 12.0, 12.1].map(b => S2({ bili: b }, 'liver')).join() === '0,1,2,3,4' && [150.5, 150, 100, 80, 50].map(p => S2({ plt: p }, 'coag')).join() === '0,1,2,3,4', 'SOFA-2 liver: bilirubin ≤ 1.2 / ≤ 3.0 / ≤ 6.0 / ≤ 12.0 / > 12 mg/dL; haemostasis: platelets > 150 / ≤ 150 / ≤ 100 / ≤ 80 / ≤ 50 ×10³/µL');
  ok([1.2, 2.0, 3.5, 3.6].map(c => S2({ scr: c }, 'kidney')).join() === '0,1,2,3' && S2({ uo: 0.4, uoh: 6 }, 'kidney') === 1 && S2({ uo: 0.4, uoh: 12 }, 'kidney') === 2 && S2({ uo: 0.2, uoh: 24 }, 'kidney') === 3 && S2({ uo: 0, uoh: 12 }, 'kidney') === 3 && S2({ rrt: 1 }, 'kidney') === 4, 'SOFA-2 kidney: creatinine ≤ 1.2 / ≤ 2.0 / ≤ 3.5 / > 3.5 mg/dL; urine output < 0.5 for 6–12 h / ≥ 12 h, < 0.3 for ≥ 24 h or anuria ≥ 12 h; RRT → 4');
  ok(S2({ scr: 1.5, k: 6.2 }, 'kidney') === 4 && S2({ scr: 1.5, ph: 7.15, hco3: 11 }, 'kidney') === 4 && S2({ scr: 1.5, ph: 7.15, hco3: 14 }, 'kidney') === 1, 'SOFA-2 footnote p: creatinine > 1.2 plus K ≥ 6.0 or pH ≤ 7.20 with HCO3 ≤ 12 meets RRT criteria → 4');
  ok(S2({ gcs: 13, pf: 140, adv: 1, nepi: 0.25, bili: 2.1, scr: 2.4, plt: 90 }) === 1 + 3 + 3 + 1 + 2 + 2 && near(V('score.sofa2', { bili: 205.2 }, 'liver', {}, { bili: 'umol/L' }), 3, 0), 'SOFA-2 total = the sum of the six systems (here 12); bilirubin 205 µmol/L → 3 (≤ 205 µmol/L)'); }
// Phoenix Sepsis Score (Schlapbach, JAMA 2024;331:665, Table; edges as in the authors' R package phoenix 1.1.3)
{ const P = (inp, k) => V('score.phoenix', Object.assign({ age: 5 }, inp), k || 'score');
  ok(P({}) === 0 && P({ pf: 350 }, 'resp') === 0 && P({ pf: 350, rsupport: 1 }, 'resp') === 1 && P({ pf: 150, rsupport: 1 }, 'resp') === 1 && P({ pf: 150, imv: 1 }, 'resp') === 2 && P({ pf: 90, imv: 1 }, 'resp') === 3 && P({ sf: 140, spo2: 92, imv: 1 }, 'resp') === 3 && P({ sf: 140, spo2: 98, imv: 1 }, 'resp') === 0, 'Phoenix respiratory: P/F < 400 or S/F < 292 on any support → 1; < 200 / < 220 on IMV → 2; < 100 / < 148 on IMV → 3; S/F only with SpO2 ≤ 97 %');
  ok(P({ vaso: 1 }, 'cardio') === 1 && P({ vaso: 2 }, 'cardio') === 2 && P({ lactate: 5 }, 'cardio') === 1 && P({ lactate: 11 }, 'cardio') === 2 && P({ vaso: 2, lactate: 12, map: 30 }, 'cardio') === 6, 'Phoenix cardiovascular 0–6: 1 / ≥ 2 vasoactives, lactate 5–10.9 / ≥ 11 mmol/L, MAP by age');
  ok([[0.02, 30, 1], [0.02, 16, 2], [0.5, 38, 1], [0.5, 24, 2], [1.5, 43, 1], [1.5, 30, 2], [3, 44, 1], [3, 31, 2], [8, 48, 1], [8, 35, 2], [15, 51, 1], [15, 37, 2], [15, 52, 0]].every(([a, m, p]) => V('score.phoenix', { age: a, map: m }, 'cardio') === p), 'Phoenix MAP bands: < 1 mo 17–30 / < 17; 1–11 mo 25–38 / < 25; 1–< 2 y 31–43 / < 31; 2–< 5 y 32–44 / < 32; 5–< 12 y 36–48 / < 36; 12–17 y 38–51 / < 38 mm Hg');
  ok(P({ plt: 90 }, 'coag') === 1 && P({ plt: 90, inr: 1.4, ddimer: 3, fib: 90 }, 'coag') === 2 && P({ gcs: 10 }, 'neuro') === 1 && P({ gcs: 11 }, 'neuro') === 0 && P({ fixedpupils: 1, gcs: 14 }, 'neuro') === 2, 'Phoenix coagulation (platelets < 100, INR > 1.3, D-dimer > 2 mg/L FEU, fibrinogen < 100 mg/dL; max 2); neurological GCS ≤ 10 → 1, fixed pupils → 2');
  ok(P({ pf: 150, imv: 1 }, 'sepsis') === 1 && P({ pf: 150, imv: 1 }, 'shock') === 0 && P({ pf: 150, imv: 1, lactate: 6 }, 'shock') === 1 && P({ pf: 150, imv: 1, infection: 0 }, 'sepsis') === 0 && P({ vaso: 1 }, 'sepsis') === 0 && F('score.phoenix', { age: 19 }, 'validity'), 'Phoenix sepsis = suspected infection + score ≥ 2; septic shock = sepsis + ≥ 1 cardiovascular point; ≥ 18 y → validity'); }
ok(F('cardio.ef', { edv: 50, esv: 80 }, 'impossible'), 'ESV > EDV → impossible');
ok(F('resp.sat', { po2: 900 }, 'impossible') && F('resp.ards', { pf: 150, peep: 3 }, 'validity'), 'PO2 900 mmHg → impossible; Berlin with PEEP < 5 → validity');
ok(F('score.wellspe', { dvt: 2 }, 'impossible'), 'a yes/no item given 2 → impossible');
ok(F('epi.bayes', { pre: 0, lr: 5 }, 'validity'), 'pre-test probability 0 → validity (no evidence moves it)');
ok(R('renal.ckdepi', { scr: 1 }, {}).v['flag.incomplete'] === 1, 'missing required inputs → incomplete, NaN');

// ---- 3. the checker's codes (the golden outputs: tests/enginelib.js) ----
const FX = require(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'med.json')).specs;
const codes = new Set(FX.flatMap(s => M.checkSpec(s).map(p => p.code)));
for (const c of ['fn', 'input', 'unknown-input', 'units', 'output', 'id', 'enum', 'unknown-field', 'value', 'size', 'format']) ok(codes.has(c), `checker code ${c} appears in the fixtures`);

// ---- 4. the sim adapter, the Worker source, speed ----
const sim = M.engine.create(FX[0], { seed: 1 }), o1 = sim.run({ scr: 0.9, age: 54, female: false });
ok(near(o1.egfr, 101.5, 0.5) && o1.stage === 1 && o1.bad === 0, 'engine.create(spec).run(inputs) gives the declared outputs (eGFR 101.5, G1, no validity flag)');
const s3 = M.engine.create(FX[2]).run({ ees: 2.5 });
ok(s3.loop && s3.loop.items.length > 3 && s3.v.length > 100 && s3.v.length <= 2000 && s3.ef > 0.5, 'PV loop spec: a scene and series (≤ 2000 points)');
const s5 = M.engine.create(FX[4]).run({ pre: 0.2, lr: 4 });
ok(near(s5.post, 0.5, 1e-9) && s5.fag.items.length > 30, 'Fagan spec: pre 0.2 × LR 4 → post 0.5; the nomogram scene');
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + M.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(FX[1]).run({ dose: 500 }), m = M.engine.create(FX[1]).run({ dose: 500 });
  ok(w && JSON.stringify(w) === JSON.stringify(m), 'the Worker source in a fresh global gives the same outputs as the page'); }
{ let t0 = Date.now(); for (let i = 0; i < 20; i++) M.engine.create(FX[0]).run({ scr: 1 + i / 10, age: 50, female: false }); const tA = (Date.now() - t0) / 20;
  t0 = Date.now(); M.engine.create(FX[2]).run({ ees: 0.5 }); const tB = Date.now() - t0;
  t0 = Date.now(); R('pk.mm', { rate: 300, vmax: 400, km: 4, v: 50, days: 365 }); const tC = Date.now() - t0;
  ok(tA < 50 && tB < 2000 && tC < 2000, `speed: a calculator run ${tA.toFixed(2)} ms (< 50), the PV loop ${tB} ms and a year of Michaelis–Menten ${tC} ms (< 2000)`); }
ok(Object.keys(M.SIG.fns).every(f => typeof f === 'string') && Object.keys(M.SIG.fns).length >= 100, `the table holds ${Object.keys(M.SIG.fns).length} functions`);
{ const bad = []; for (const f of Object.keys(M.SIG.fns)) { const ins = {}; for (const t of M.SIG.fns[f].in.split(' ').filter(Boolean)) ins[t.replace('!', '')] = 1; let r; try { r = M.compute(f, ins, f === 'epi.km' ? { times: [1], events: [1] } : {}); } catch (e) { bad.push(f); } if (!r) bad.push(f); }
  ok(!bad.length, 'every function runs on arbitrary inputs without throwing' + (bad.length ? ': ' + bad.join(', ') : '')); }
const py = want('sig', undefined, M.SIG);
ok(JSON.stringify(py) === JSON.stringify(M.SIG), 'SIG is the same table as the golden one of the former twin tools/lib_med.py');
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
