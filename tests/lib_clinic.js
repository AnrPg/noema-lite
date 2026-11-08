/* clinic@1 (src/engines/clinic/clinic.js, docs/library/clinic.md): reference values (the source in each message, with its tolerance),
   the edge cases and their codes, the checker's codes, the virtual patient's physiology and the grade of a reasoning path, the sim
   adapter, the Worker source (with med@1 inside) in a fresh global, speed.  Run: node tests/lib_clinic.js */
'use strict';
const path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibClinic = ENGINES.mod('clinic@1');
const K = NoemaLibClinic;
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const ev = (model, inp, seed) => K.evaluate(model, inp, [], seed).all;
const close = (a, b, tol) => a.length === b.length && a.every((x, i) => near(x, b[i], tol));
const FX = require(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'clinic.json')).specs;

// ---- 1. reference values ----
const two = (pre, f) => ({ ddx: { hypotheses: [{ id: 'D', prior: pre }, { id: 'N', prior: 1 - pre }], findings: f } });
const lrF = (id, lp, ln, present, group) => ({ id, lr: { pos: lp, neg: ln }, target: 'D', present, ...(group ? { group } : {}) });
{ const r = ev(two(0.2, [{ id: 'a', lik: { D: 0.75, N: 0.25 }, present: 1 }, { id: 'b', lik: { D: 0.5, N: 1 }, present: 1 }])); ok(near(r['ddx.post.D'], 0.2727, 1e-4) && close(r['ddx.traj.D'], [0.2, 0.4286, 0.2727], 1e-4), 'C1 pre 0.20, LR 3 then LR 0.5 → 0.2727 (odds form of Bayes; Sox, Medical Decision Making ch. 4) ±1e-4'); }
{ const m = { ddx: { hypotheses: [{ id: 'A', prior: 0.5 }, { id: 'B', prior: 0.3 }, { id: 'X', prior: 0.2 }], findings: [{ id: 'f1', lik: { A: 0.8, B: 0.4, X: 0.1 }, present: 1 }, { id: 'f2', lik: { A: 0.3, B: 0.9, X: 0.5 }, present: 1 }] } }, r = ev(m);
  ok(close(r['ddx.traj.A'], [0.5, 0.741, 0.504], 1e-3) && close(r['ddx.traj.B'], [0.3, 0.222, 0.454], 1e-3) && near(r['ddx.post.X'], 0.042, 1e-3), 'C2 three hypotheses, two findings: (0.741, 0.222, 0.037) → (0.504, 0.454, 0.042) (Bayes theorem) ±1e-3');
  const sw = { ddx: { ...m.ddx, findings: m.ddx.findings.slice().reverse() } }; ok(near(ev(sw)['ddx.post.A'], r['ddx.post.A'], 1e-12), 'order invariance: the same findings in the other order give the same posterior (1e-12)'); }
{ const ind = ev(two(0.2, [lrF('a', 4, 0.5, 1), lrF('b', 4, 0.5, 1)])), dep = ev({ ddx: { ...two(0.2, [lrF('a', 4, 0.5, 1, 'g'), lrF('b', 4, 0.5, 1, 'g')]).ddx, groups: [{ id: 'g', rho: 1 }] } });
  ok(near(ind['ddx.post.D'], 0.80, 1e-6) && near(dep['ddx.post.D'], 0.50, 1e-6) && near(dep['ddx.lo.D'], 0.5, 1e-6) && near(dep['ddx.hi.D'], 0.8, 1e-6), 'C3 two LR-4 findings, pre 0.2: independent 0.80, fully dependent 0.50; the band [0.50, 0.80] (conditional dependence)'); }
ok(near(ev({ calib: { forecasts: [{ p: 0.7, o: 1 }] } })['calib.brier'], 0.09, 1e-12), 'C4 Brier score of a 0.7 forecast that happens: 0.09 (Brier, Mon Weather Rev 1950)');
{ const r = ev({ threshold: { benefit: 10, harm: 1, se: 0.9, sp: 0.8, testRisk: 0, p: 0.3 } }); ok(near(r['threshold.treat'], 0.0909, 1e-4) && near(r['threshold.test'], 0.0217, 1e-4) && near(r['threshold.testTreat'], 0.4444, 1e-4) && r['threshold.zone'] === 1, 'C5 B 10, H 1, Se 0.9, Sp 0.8: treatment threshold 0.0909, testing 0.0217, test–treatment 0.4444; p 0.3 → test (Pauker & Kassirer NEJM 1980) ±1e-4'); }
{ const T = JSON.parse(JSON.stringify(FX[3].model.tree)); delete T.sweep; const r = ev({ tree: T }, { pre: 0.3 }); const ts = ev({ tree: FX[3].model.tree }, { pre: 0.3 });
  ok(near(r['tree.ev.tx'], 0.935, 1e-9) && near(r['tree.ev.no'], 0.850, 1e-9) && r['tree.choice.d'] === 1 && near(r['tree.regret.d'], 0.085, 1e-9), 'C6 tree p 0.3: EV(treat) 0.935, EV(no treatment) 0.850 → treat, regret 0.085 (rollback)');
  ok(near(ts['tree.threshold'], 0.05 / 0.45, 1e-6), 'C6 the sweep finds the treatment threshold H/(H + B) = 0.111 where the two EVs meet (Pauker & Kassirer NEJM 1975) ±1e-6'); }
{ const r = ev({ tests: { se1: 0.9, sp1: 0.8, se2: 0.9, sp2: 0.8 } }); ok(near(r['tests.serialSe'], 0.81, 1e-12) && near(r['tests.serialSp'], 0.96, 1e-12) && near(r['tests.parallelSe'], 0.99, 1e-12) && near(r['tests.parallelSp'], 0.64, 1e-12), 'C7 two tests Se 0.9 Sp 0.8: serial 0.81/0.96, parallel 0.99/0.64 (Sox)'); }
{ const r = ev({ markov: { states: [{ id: 'A', u: 1 }, { id: 'D', u: 0, alive: false }], P: [[Math.exp(-0.01), 1 - Math.exp(-0.01)], [0, 1]], start: [1, 0], cycles: 1200, cycleYears: 0.1 } });
  ok(near(r['markov.le'], 10, 0.06), 'C8 DEALE: constant mortality 0.05 + 0.05 /yr → life expectancy 1/μ = 10 y (Beck, Kassirer & Pauker 1982; Markov with 0.1-y cycles, end-of-cycle counting) ±0.06'); }
{ const r = ev({ markov: { states: [{ id: 'W', u: 1 }, { id: 'S', u: 0.6 }, { id: 'D', u: 0, alive: false }], P: [[0.85, 0.1, 0.05], [0, 0.8, 0.2], [0, 0, 1]], start: [1, 0, 0], cycles: 2 } });
  ok(close(r['markov.trace.W'], [1, 0.85, 0.7225], 1e-12) && close(r['markov.trace.S'], [0, 0.1, 0.165], 1e-12) && close(r['markov.trace.D'], [0, 0.05, 0.1125], 1e-12), 'C9 Markov cohort 2 cycles: W 722.5, S 165, D 112.5 per 1000 (Sonnenberg & Beck 1993)'); }
{ const r = ev({ cea: { strategies: [{ id: 'A', cost: 2000, qaly: 8.0 }, { id: 'B', cost: 12000, qaly: 8.5 }], wtp: 30000 } }); ok(near(r['cea.icer.B'], 20000, 1e-9) && r['cea.best'] === 2, 'C10 ICER (12 000 − 2000)/(8.5 − 8.0) = 20 000 per QALY; at 30 000/QALY B has the higher net benefit (Drummond 4e)'); }
{ const a = ev({ triage: { esi: { highRisk: 1 } } })['triage.esi'], b = ev({ triage: { esi: { resources: 1, hr: 80, rr: 16, spo2: 98 } } })['triage.esi'], c = ev({ triage: { esi: { resources: 2, hr: 110, rr: 18, spo2: 97 } } });
  ok(a === 2 && b === 4 && c['triage.esi'] === 2 && c['triage.dangerZone'] === 1, 'C11 ESI: chest pain suggestive of ACS → 2; ankle sprain needing one X-ray → 4; two resources with HR 110 → danger zone → 2 (ENA ESI Handbook)');
  ok(ev({ triage: { esi: { lifesaving: 1 } } })['triage.esi'] === 1 && ev({ triage: { esi: {} } })['triage.esi'] === 5 && ev({ triage: { esi: { resources: 2, hr: 135, age: 2 } } })['triage.esi'] === 3, 'ESI: life-saving intervention → 1; no resources → 5; a 2-year-old with HR 135 is under the age danger zone (140) → 3'); }
ok(ev({ triage: { esi: { resources: 2, hr: 150, age: 2 } } })['triage.esi'] === 2 && ev({ triage: { esi: { resources: 2, hr: 185, age: 0.02 } } })['triage.esi'] === 3 && ev({ triage: { esi: { resources: 2, hr: 185, age: 0.5 } } })['triage.esi'] === 2 && ev({ triage: { esi: { resources: 2, rr: 32, age: 4 } } })['triage.esi'] === 3 && ev({ triage: { esi: { resources: 2, rr: 36, age: 4 } } })['triage.esi'] === 2 && ev({ triage: { esi: { resources: 2, rr: 32, age: 8 } } })['triage.esi'] === 2, 'ESI v5 high-risk vitals (ENA ESI Handbook 5th ed. 2023, Fig. 6-1): 1–3 y HR > 140; < 1 mo HR > 190, 1–12 mo > 180; 3–5 y RR > 35, 5–12 y RR > 30');
{ const r = ev({ triage: { news2: { rr: 24, spo2: 93, o2: 0, sbp: 105, hr: 115, cvpu: 0, temp: 38.5 }, qsofa: { rr: 24, sbp: 95, gcs: 15 }, shock: { hr: 120, sbp: 100 } } });
  ok(r['triage.news2'] === 8 && r['triage.news2band'] === 4 && r['triage.qsofa'] === 2 && near(r['triage.shock'], 1.2, 1e-12), 'C12 NEWS2 8 (high; RCP 2017), qSOFA 2 (Seymour 2016), shock index 1.2'); }
ok(close([1, 2, 3, 4, 5].map(a => ev({ sct: { panel: [0, 1, 2, 5, 2], answer: a } })['sct.credit']), [0, 0.2, 0.4, 1, 0.4], 1e-12), 'C13 script concordance aggregate scoring (0,1,2,5,2) → credits (0, .2, .4, 1, .4) (Charlin, Teach Learn Med 2000)');
ok(near(ev(two(0.01, [{ id: 'm', lik: { D: 0.8, N: 0.096 }, present: 1 }]))['ddx.post.D'], 0.078, 1e-3), 'C14 mammography: prevalence 1 %, Se 80 %, false positives 9.6 % → 7.8 % (Eddy 1982)');
{ const r = ev({ markov: { states: [{ id: 'A', u: 1 }, { id: 'D', u: 0, alive: false }], P: [[Math.exp(-0.5), 1 - Math.exp(-0.5)], [0, 1]], start: [1, 0], cycles: 1 } }); ok(near(r['markov.occ.D'], 0.3935, 1e-4), 'C15 rate → probability: r 0.1/yr over 5 y → p = 1 − e^(−0.5) = 0.3935 (Fleurence & Hollenbeak 2007)'); }
{ const r = ev(two(0.3, [{ id: 'a', lik: { D: 0.9, N: 0.1 } }, { id: 'b', lik: { D: 0.55, N: 0.45 } }])); ok(r['ddx.best'] === 1 && r['ddx.gain.a'] > r['ddx.gain.b'] && r['ddx.gain.a'] > 0.3, 'expected information gain: a discriminating finding (0.9 vs 0.1) is worth more than a weak one (0.55 vs 0.45); best next = it'); }
{ const r = ev({ cea: { strategies: [{ id: 'A', cost: 0, qaly: 1 }, { id: 'B', cost: 100, qaly: 1.1 }, { id: 'X', cost: 300, qaly: 1.4 }, { id: 'Y', cost: 200, qaly: 1.0 }], wtp: 1000 } });
  ok(r['cea.dominated.Y'] === 1 && r['cea.dominated.B'] === 2 && near(r['cea.icer.X'], 750, 1e-9), 'CEA: Y strongly dominated, B extendedly dominated (ICER 1000 > 750), X on the frontier at 750 per QALY'); }

// ---- 2. the virtual patient and the grade of the reasoning path ----
const VP = FX[7];
const good = { tLab: 5, tAbx: 30, tFl: 10, tCt: -1, est0: 0.4, est1: 0.8 }, late = { tLab: 5, tAbx: 180, tFl: 10, tCt: -1, est0: 0.4, est1: 0.8 }, none = { tLab: -1, tAbx: -1, tFl: -1, tCt: 20, est0: 0.4, est1: 0.4 };
const g = ev(VP.model, good), l = ev(VP.model, late), z = ev(VP.model, none);
ok(g['vp.outcome'] === 0 && g['vp.final.map'] > 65 && g['vp.final.lactate'] < 2, `virtual patient (sepsis): early antibiotics and fluids → stabilised (MAP ${g['vp.final.map'].toFixed(0)}, lactate ${g['vp.final.lactate'].toFixed(1)})`);
ok(z['vp.outcome'] >= 1 && z['vp.final.map'] < g['vp.final.map'] && z['vp.final.hr'] > g['vp.final.hr'] && z['vp.final.temp'] > 38 && z['vp.final.lactate'] > 2, `untreated: hypotension (MAP ${z['vp.final.map'].toFixed(0)}), tachycardia, fever, lactate ${z['vp.final.lactate'].toFixed(1)} mmol/L`);
ok(g['vp.min.map'] > z['vp.min.map'] && l['vp.timeHypo'] >= g['vp.timeHypo'], 'later antibiotics: at least as long hypotensive as early ones (time-dependence of sepsis care)');
ok(g['grade.total'] > 0.9 && g['grade.critical'] === 0 && g['grade.closure'] === 0 && g['grade.timely'] === 1, `a good path: grade ${g['grade.total'].toFixed(2)}, no critical errors, no premature closure`);
ok(l['grade.timely'] < 1 && l['grade.critical'] >= 1 && l['grade.total'] <= 0.5, 'antibiotics after the 60-min deadline: a critical error caps the grade at 0.5');
ok(z['grade.closure'] === 1 && z['grade.essential'] === 0 && z['grade.efficiency'] < 1 && z['grade.total'] <= 0.5, 'no sepsis care, a low-yield CT instead: premature closure counted, essential 0, efficiency down');
ok(z['grade.infoEff'] < 1 && g['ddx.post.sepsis'] > 0.8, 'information efficiency: the CT (low discrimination) gains less than the lactate available at the same moment (confirmation bias signal)');
ok(near(g['ddx.estErr'], (Math.abs(0.4 - 0.4) + Math.abs(0.8 - 0.8421)) / 2, 1e-3) && Number.isFinite(g['ddx.updateRatio']), 'calibration: the stated probabilities against Bayes (mean error, update ratio)');
{ const a = ev(VP.model, { ...good, tAbx: 30 }), b = ev(VP.model, { ...good, tAbx: 30 }); ok(JSON.stringify(a) === JSON.stringify(b), 'the virtual patient is deterministic (the same inputs, the same course)'); }
{ const m = JSON.parse(JSON.stringify(VP.model)); m.vp.actions[2].after = ['cultures']; const r = ev(m, { ...good, tLab: 40, tAbx: 30 }); ok(r['grade.order'] < 1, 'order constraint: antibiotics before blood cultures → order < 1'); }
{ const m = { vp: { tEnd: 240, patient: { bleed: 25 }, actions: [{ id: 'stop', kind: 'treat', at: 'ts', effect: { stopBleed: 1 } }, { id: 'blood', kind: 'treat', at: 'tb', effect: { blood: 1000, over: 30 } }] } };
  const a = ev(m, { ts: 20, tb: 25 }), b = ev(m, { ts: -1, tb: -1 });
  ok(a['vp.outcome'] === 0 && b['vp.outcome'] === 2 && Number.isFinite(b['vp.diedAt']) && b['vp.flag.unsafe'] === 1, `haemorrhage 25 mL/min: controlled + transfused → stabilised; untreated → death at ${b['vp.diedAt'].toFixed(0)} min (flag unsafe)`);
  const t = a['vp.t'], hr = a['vp.hr'], mp = b['vp.map'], hrB = b['vp.hr']; ok(hrB[30] > hrB[0] + 10 && mp[30] > 0.9 * mp[0] - 20, 'compensated phase: the heart rate rises before the pressure falls (ATLS class I–II pattern)'); }
{ const m = { vp: { tEnd: 60, patient: { shunt: 0.3 }, actions: [{ id: 'o2', kind: 'treat', at: 'to', effect: { o2: 0.6 } }] } }; const a = ev(m, { to: 0 }), b = ev(m, { to: -1 });
  ok(a['vp.final.spo2'] > b['vp.final.spo2'] && b['vp.final.spo2'] < 92, `oxygen: shunt 30 % — SpO2 ${b['vp.final.spo2'].toFixed(0)} % on air, ${a['vp.final.spo2'].toFixed(0)} % on FiO2 0.6 (med@1 Severinghaus curve)`); }
{ const a = ev({ ...VP.model, vp: { ...VP.model.vp, noise: true } }, good, 7), b = ev({ ...VP.model, vp: { ...VP.model.vp, noise: true } }, good, 7), c = ev({ ...VP.model, vp: { ...VP.model.vp, noise: true } }, good, 8);
  ok(JSON.stringify(a['vp.hr']) === JSON.stringify(b['vp.hr']) && JSON.stringify(a['vp.hr']) !== JSON.stringify(c['vp.hr']), 'seeded noise: the same seed gives the same vitals, another seed other ones'); }

// ---- 3. edge cases and their codes ----
{ const r = ev({ ddx: { hypotheses: [{ id: 'D', prior: 0.6 }, { id: 'N', prior: 0.6 }] } }); ok(r['ddx.flag.normalised'] === 1 && near(r['ddx.post.D'], 0.5, 1e-12), 'priors summing to 1.2 → normalised, code normalised'); }
{ const r = ev(two(0.5, [{ id: 'a', lik: { D: 0, N: 0.5 }, present: 1 }])); ok(r['ddx.flag.certain'] === 1 && r['ddx.post.D'] > 0, 'a likelihood of exactly 0 → clamped (Cromwell\'s rule), code certain, the hypothesis is not killed'); }
{ const r = ev({ ddx: { ...two(0.5, [{ id: 'a', lik: { D: 0, N: 0.5 }, present: 1 }]).ddx, allowCertain: true } }); ok(r['ddx.post.D'] === 0, 'allowCertain: an exact 0 rules the hypothesis out'); }
{ const r = ev({ ddx: { hypotheses: [{ id: 'A', prior: 0.3 }, { id: 'B', prior: 0.3 }, { id: 'X', prior: 0.4 }], findings: [{ id: 'f', lr: { pos: 3, neg: 0.4 }, target: 'A', present: 1 }] } }); ok(r['ddx.flag.approx'] === 1, 'LR findings with three hypotheses → approx (one-versus-rest)'); }
{ const r = ev(two(0.2, [lrF('a', 0.5, 2, 1)])); ok(r['ddx.flag.impossible'] === 1, 'LR+ < 1 with LR− > 1 (a "positive" test against the target) → impossible'); }
{ const r = ev({ ddx: { hypotheses: [{ id: 'D', prior: 0.3 }, { id: 'N', prior: 0.5 }], other: true, findings: [{ id: 'f', lik: { D: 0.9, N: 0.1 }, present: 1 }] } }); ok(near(r['ddx.prior.other'], 0.2, 1e-12) && r['ddx.post.other'] > 0, 'the "other" bucket takes the residual prior and the prior-weighted mean likelihood'); }
{ const r = ev({ threshold: { benefit: 1, harm: 1, se: 0.6, sp: 0.6, testRisk: 0.3, p: 0.4 } }); ok(r['threshold.flag.no-test-zone'] === 1 && r['threshold.zone'] === 0, 'a risky, weak test: the testing threshold passes the test–treatment one → no-test-zone, zone by the treatment threshold'); }
ok(ev({ threshold: { benefit: 0, harm: 1 } })['threshold.flag.impossible'] === 1, 'no benefit from treatment → impossible');
{ const t = JSON.parse(JSON.stringify(FX[3].model.tree)); delete t.sweep; t.nodes[1].children[0].p = 0.5; const r = ev({ tree: t }, { pre: 0.3 }); ok(r['tree.flag.impossible'] === 1 && Number.isNaN(r['tree.ev.tx']), 'chance probabilities not summing to 1 → NaN + impossible'); }
ok(ev({ markov: { states: [{ id: 'A', u: 1 }, { id: 'B', u: 0 }], P: [[0.5, 0.6], [0, 1]], start: [1, 0], cycles: 3 } })['markov.flag.impossible'] === 1, 'a Markov row summing to 1.1 → impossible');
ok(ev({ cea: { strategies: [{ id: 'A', cost: 'zz', qaly: 1 }, { id: 'B', cost: 1, qaly: 2 }], wtp: 1 } })['cea.flag.incomplete'] === 1, 'a cost that is not a number → incomplete');
ok(Number.isNaN(ev({ sct: { panel: [0, 1, 2], answer: 7 } })['sct.credit']), 'an SCT answer outside the options → NaN');
ok(ev({ calib: { forecasts: [{ p: 1.2, o: 1 }] } })['calib.flag.impossible'] === 1, 'a forecast above 1 → impossible');
{ const r = ev({ ddx: { hypotheses: [{ id: 'D', prior: 0.2 }, { id: 'N', prior: 0.8 }], findings: [{ id: 'f', lik: { D: 0.9, N: 0.1 }, present: 1 }] }, vp: { tEnd: 30, actions: [{ id: 'lab', kind: 'test', at: 10, turnaround: 60, reveals: ['f'] }] } });
  ok(r['ddx.known'] === 0 && near(r['ddx.post.D'], 0.2, 1e-12), 'a result that arrives after the case ends is not seen (turnaround 60 min, case 30 min)'); }

// ---- 4. the checker, the adapter, the Worker, speed ----
const codes = new Set(FX.flatMap(s => K.checkSpec(s).map(p => p.code)));
for (const c of ['model', 'id', 'ref', 'value', 'enum', 'size', 'output', 'approx', 'unknown-field']) ok(codes.has(c), `checker code ${c} appears in the fixtures`);
ok(K.checkSpec(FX[0]).length === 0 && K.checkSpec(FX[7]).length === 0, 'the reference specs have no problems');
const s0 = K.engine.create(FX[0]).run({ pre: 0.15, dd: true }), s0b = K.engine.create(FX[0]).run({ pre: 0.15, dd: false });
ok(s0.pPE > 0.15 && s0b.pPE < 0.02 && s0.bars.items.length > 5 && s0.trajPE.length === 3, `engine.create(spec).run(): a positive D-dimer raises P(PE) to ${s0.pPE.toFixed(3)}, a negative one lowers it to ${s0b.pPE.toFixed(4)}; the bar scene`);
const s7 = K.engine.create(FX[7]).run(good);
ok(s7.outcome === 0 && s7.map.length === 361 && s7.line.items.length > 5, 'the virtual-patient spec: outcome, a 361-point MAP series, the timeline scene');
const s3 = K.engine.create(FX[3]).run({ pre: 0.3 }); ok(s3.ch === 1 && near(s3.th, 0.1111, 1e-3) && s3.pic.items.length >= 13, 'the tree spec: choice, threshold, the tree scene');
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + K.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(FX[7]).run(good), mm = K.engine.create(FX[7]).run(good);
  ok(!!(ctx.self.__noemaShared || {})['med/med.js'] && JSON.stringify(w) === JSON.stringify(mm), 'the Worker source (NoemaExpr + core + med@1 + clinic@1) in a fresh global gives the same outputs'); }
{ let t0 = Date.now(); for (let i = 0; i < 20; i++) K.engine.create(FX[0]).run({ pre: 0.1 + i / 100, dd: true }); const tA = (Date.now() - t0) / 20;
  t0 = Date.now(); K.engine.create(FX[7]).run(good); const tB = Date.now() - t0;
  const big = JSON.parse(JSON.stringify(FX[7])); big.model.vp.tEnd = 1440; t0 = Date.now(); K.engine.create(big).run(good); const tC = Date.now() - t0;
  ok(tA < 50 && tB < 200 && tC < 2000, `speed: a differential ${tA.toFixed(2)} ms (< 50), a 6-h virtual patient ${tB} ms, a 24-h one ${tC} ms (< 2000)`); }
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
