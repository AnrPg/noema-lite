# `clinic@1` — clinical reasoning: differentials, thresholds, decisions, virtual patients, triage (`engine/src/48_lib_clinic.js`, `NoemaLibClinic`)

The deepest engine of the library (`docs/INTERACTIVE_LIBRARY.md`): it models **how a clinician reasons**, not one formula. A spec can
hold any of ten sections, and they work together: a differential diagnosis updated finding by finding with Bayes' theorem (with the
learner's own stated probabilities scored against it), the threshold model, test combinations, decision trees with sensitivity
analysis, Markov cohorts, cost-effectiveness, triage, script concordance and forecast scoring — and a **virtual patient**: a timed
case in which the learner's actions (history, examination, tests with a turnaround, treatments with effects) drive a small model of the
circulation, oxygenation and lactate minute by minute, the tests reveal the differential's findings when their results arrive, and the
**path of reasoning is graded** (essential actions, deadlines, harm, order, efficiency, calibration, information efficiency of the
tests chosen, premature closure). The Python twin is `tools/lib_clinic.py` (`ID`, `check_spec`, `exprs`, `keys`, `offered`): it checks
and does not compute, with the same problems (code, path, message, level) as the JS `checkSpec`. The tests are `node tests/lib_clinic.js`
(64 assertions) and `node tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/clinic.json`, 23 specs). The
reference activity is `tools/activities_examples/sepsis-case`. The research behind this chapter is in the project's
`engine-library/research/med.md` (part B).

**Educational only.** Every number is a teaching model. The virtual patient's physiology ("haemo-lite", §9) is in-house and
qualitative; the triage logic follows the published algorithms but is not a triage tool.

The body's numbers come from `med@1` (`docs/library/med.md`) through `NoemaLibMed.calc`: the Severinghaus O₂–Hb curve, oxygen
content and NEWS2. clinic@1 needs med@1 loaded (in the page: both files are in the build; `engine.workerSource` puts NoemaExpr, the
core, med@1 and clinic@1 into the Worker). Without med@1, NEWS2 and the virtual patient report `incomplete` and give NaN.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "clinic@1",
  "params": [ { "id": "pre", "kind": "slider", "label": "preLabel", "min": 0.01, "max": 0.9, "step": 0.01, "default": 0.15 },
              { "id": "dd", "kind": "toggle", "label": "ddLabel", "default": true } ],
  "model": {
    "ddx": { "hypotheses": [ { "id": "PE", "prior": "pre", "mustNotMiss": true, "act": 0.1, "key": "hPE" },
                             { "id": "pneu", "prior": "0.5 * (1 - pre)", "key": "hPneu" },
                             { "id": "other", "prior": "0.5 * (1 - pre)", "key": "hOther" } ],
             "findings": [ { "id": "ddimer", "lik": { "PE": 0.97, "pneu": 0.6, "other": 0.4 }, "present": "dd ? 1 : 0", "key": "fDd" },
                           { "id": "ctpa", "lik": { "PE": 0.83, "pneu": 0.04, "other": 0.04 }, "key": "fCt" } ] },
    "threshold": { "benefit": 0.25, "harm": 0.02, "se": 0.83, "sp": 0.96, "testRisk": 0.001, "p": "pre" } },
  "outputs": [ { "id": "pPE", "kind": "scalar", "of": "ddx.post.PE" }, { "id": "trajPE", "kind": "series", "of": "ddx.traj.PE" },
               { "id": "gainCt", "kind": "scalar", "of": "ddx.gain.ctpa" }, { "id": "zone", "kind": "scalar", "of": "threshold.zone" },
               { "id": "bars", "kind": "scene", "of": "ddx" } ],
  "plots": [ { "kind": "scene", "of": "bars", "title": "ddxTitle", "height": 260 } ] }
```

- **Sections** (`model.<section>`, at least one): `ddx`, `threshold`, `tests`, `tree`, `markov`, `cea`, `triage`, `vp`, `sct`, `calib`.
- Every number of the model is a **numx**: a number, or an expression over the spec's consts, params and derived values (compiled once
  with NoemaExpr; a toggle gives true/false, which the conditional `a ? b : c` reads). `exprs(spec)` lists every string that is not an
  id, a reference or a key, as `[source, path, []]`; `keys(spec)` lists every `key` (i18n keys of hypotheses, findings, nodes, states,
  strategies, actions: the scenes label with them or with the model's short ids as `s`).
- **Outputs**: `{id, kind, of}` with `of` one of the names of §2–§11 (`offered(model)` lists them all: `{scalar, series, scene}`);
  anything else is the checker's `output` error. Every section present also offers `<section>.flags` (how many codes) and
  `<section>.flag.<code>` (0/1) for each code of §12.
- **Runtime** (`run(spec, env, {seed})` → `{out, all, codes}`; `evaluate(model, inputs, outputs?, seed?)` for tests and tools): `all`
  holds every computed name, `codes` the codes per section. A run never throws: a section that fails internally gives `impossible`.
- **Limits**: ≤ 30 hypotheses, ≤ 60 findings, ≤ 20 dependence groups, ≤ 30 estimates; trees ≤ 60 nodes of ≤ 8 branches, a sweep
  ≤ 200 points; Markov ≤ 30 states, ≤ 1200 cycles; ≤ 12 strategies; a virtual patient ≤ 60 actions, 10–1440 minutes (a 0.1-min step,
  recorded every minute: ≤ 1441 points per series), ≤ 2000 items per scene; ≤ 200 forecasts. A differential runs in < 1 ms, a 6-hour
  virtual patient in ≈ 25 ms, a 24-hour one in ≈ 80 ms.

### 1.1 Checker codes (`checkSpec`, the same in `tools/lib_clinic.py`)

| code | level | when |
|---|---|---|
| `model` | error | no section; a finding with both or neither of `lik` and `lr`; a terminal node with children, a decision/chance node without; the tree is not a tree (two parents, a loop) |
| `value` | error | a missing required field or one of the wrong kind; `lr` without `target`; a terminal without `u`; a chance branch without `p`; sweep `min` ≥ `max` |
| `enum` | error | a node `type`, an action `kind` |
| `size` | error | a list too long or too short; Markov `P` not n × n, `start` not n |
| `id` | error | an id that is not a name, or used twice in its list |
| `ref` | error | a likelihood, `target`, `group`, estimate `hyp`/`after`, `truth`, `treatedBy`, tree `root`/`to`, sweep `name`, action `reveals`/`after` naming nothing |
| `approx` | warning | `lr` findings with more than two hypotheses (one-versus-rest approximation: give `lik` for each) |
| `unused` | warning | a tree node not reachable from the root |
| `expr`, `name` | error | from the core: an expression that does not compile or uses a name the spec does not define |
| `unknown-field` | warning | a field the section does not know |
| `output` | error | an `of` the model does not compute, or the wrong `kind` |

## 2. `ddx` — the differential, finding by finding

| field | kind | meaning |
|---|---|---|
| `hypotheses` (2–30, required) | `{id, prior, mustNotMiss?, act?, treatedBy?, key?}` | mutually exclusive diagnoses; `prior` normalised if it does not sum to 1 (code `normalised`); `act` the action threshold of a must-not-miss diagnosis; `treatedBy` the vp actions that act on it |
| `findings` (≤ 60) | `{id, lik \| lr+target, present?, group?, key?}` | `lik: {H: P(f+ \| H)}` for each hypothesis; or `lr: {pos, neg}` against one `target` (Se, Sp recovered: Sp = (LR+ − 1)/(LR+ − LR−), Se = LR+·(1 − Sp)); `present` 1 / 0 / anything else = not known (yet) |
| `groups` (≤ 20) | `{id, rho}` | conditionally dependent findings (ρ 0 independent … 1 fully redundant) |
| `estimates` (≤ 30) | `{hyp, after?, p}` | the learner's stated probability of `hyp` before any finding, or right after finding `after` |
| `other` | bool | add a hypothesis `other` holding the residual prior (its likelihood: the prior-weighted mean of the listed ones, unless given) |
| `allowCertain` | bool | allow likelihoods of exactly 0 or 1 (otherwise clamped to [10⁻⁶, 1 − 10⁻⁶]: Cromwell's rule, code `certain`) |
| `truth` | ref | the case's real diagnosis (for the Brier score of the estimates and the grade) |

**Method.** Sequential Bayes over exclusive hypotheses in log space (Sox, Higgins, Owens & Schmidler, *Medical Decision Making* 3e,
Wiley 2024, ISBN 978-1-119-62780-7, ch. 3–4): log P(H | findings) = log prior + Σ log P(fᵢ = sᵢ | H), normalised. A known finding enters in the order its result
arrives (in a vp, its time; otherwise its list order); the result does not depend on the order (tested). **Conditional dependence**:
within a group of n known findings each log-likelihood is weighted 1/(1 + ρ(n − 1)) — ρ 0 is naive Bayes, ρ 1 counts the group as one
finding (a tempered-likelihood approximation; the true joint likelihoods are rarely published). Every posterior is also computed with
ρ = 0 and ρ = 1, and `lo`/`hi` give the band between them: how much the answer depends on the independence assumption. **Expected
information gain** of each finding not yet known: the expected drop in Shannon entropy (bits) of the posterior if it were asked now;
`best` is the most informative one (1-based, 0 if none). **Calibration of the learner** (Brier 1950; conservatism and over-reaction,
Edwards 1968): `estErr` the mean |stated − Bayes| over the estimates, `updateRatio` the mean of Δlogit(stated)/Δlogit(Bayes) between
consecutive estimates of the same hypothesis (1 is Bayesian, < 1 conservative, > 1 over-reacting), `brier` against `truth`.

| output | kind | meaning |
|---|---|---|
| `ddx.post.<h>`, `ddx.prior.<h>` | scalar | posterior given everything known; the normalised prior |
| `ddx.lo.<h>`, `ddx.hi.<h>` | scalar | the band between independent (ρ 0) and fully dependent (ρ 1) evidence |
| `ddx.over.<h>` | scalar | 1 if the posterior is at or above the hypothesis's `act` threshold (NaN without one) |
| `ddx.traj.<h>` | series | the posterior after 0, 1, 2 … known findings (with `ddx.step` 0, 1, 2 … as x) |
| `ddx.top`, `ddx.topP`, `ddx.entropy`, `ddx.known` | scalar | the leading hypothesis (1-based) and its probability, the entropy (bits), how many findings are known |
| `ddx.gain.<f>`, `ddx.best` | scalar | expected information gain of each unknown finding (0 for known ones); the best next finding |
| `ddx.estErr`, `ddx.updateRatio`, `ddx.brier` | scalar | the learner's calibration (with `estimates`) |
| `ddx` | scene | a bar per hypothesis (posterior; `warn` fill for must-not-miss), the prior as a dashed line, the dependence band, the action threshold |

## 3. `threshold` — Pauker & Kassirer

Fields `benefit` (B, net benefit of treating the diseased), `harm` (H, net harm of treating the healthy), and optionally `se`, `sp`,
`testRisk` (R, the test's own harm in the same units) and `p` (the current probability). Treatment threshold p* = H/(H + B) (Pauker &
Kassirer, *NEJM* 1975;293:229). Testing threshold T_test = ((1 − Sp)H + R)/((1 − Sp)H + Se·B) and test–treatment threshold T_tt =
(Sp·H − R)/(Sp·H + (1 − Se)B) (Pauker & Kassirer, *NEJM* 1980;302:1109). Outputs `threshold.treat`, `.test`, `.testTreat`, `.zone`
(0 neither test nor treat, 1 test, 2 treat), and the expected values (as losses) `.evNone` = −pB, `.evTreat` = −(1 − p)H, `.evTest`.
When T_test ≥ T_tt the test is never worth doing: code `no-test-zone`, and the zone follows p* alone. B ≤ 0 → `impossible`. Scene: the
probability line with the three zones and p.

## 4. `tests` — two tests in series and in parallel

Fields `se1 sp1 se2 sp2` (required), `covSe`, `covSp` (conditional covariances, default 0), `prev`, `cost1`, `cost2`. Serial (positive
only if both): Se = Se₁Se₂ + covSe, Sp = 1 − (1 − Sp₁)(1 − Sp₂) − covSp; parallel (positive if either): Se = 1 − (1 − Se₁)(1 − Se₂) −
covSe, Sp = Sp₁Sp₂ + covSp (Gardner, Stryhn, Lind & Collins, *Prev Vet Med* 2000;45:107; Sox ch. 5). With `prev`: PPV and NPV of each
strategy and the expected cost of serial testing (the second test only after a positive first). Outputs `tests.serialSe`,
`.serialSp`, `.parallelSe`, `.parallelSp`, `.serialPpv`, `.serialNpv`, `.parallelPpv`, `.parallelNpv`, `.serialCost`, `.parallelCost`.
A combined value outside [0, 1] (a covariance too large) → `impossible`.

## 5. `tree` — decision trees

Fields `root` (a node id), `nodes` (2–60: `{id, type: decision|chance|terminal, children: [{to, p?, key?}], u?, key?}`), `sweep`
(`{name, min, max, points}`: a const or param varied for a one-way sensitivity analysis). Rollback (Hunink et al., *Decision Making in
Health and Medicine* 2e, 2014): a terminal's value is `u`; a chance node's the p-weighted sum (the p must sum to 1 ± 10⁻⁶, otherwise NaN +
`impossible`); a decision node's the best child. Outputs `tree.ev` (the root), `tree.ev.<node>`, `tree.choice.<decision>` (1-based),
`tree.regret.<decision>` (best − second best); with a sweep `tree.sweep` (x), `tree.line.<child of the root>` (the EV lines) and
`tree.threshold` (where the two best lines cross, linear interpolation; NaN if they do not). Scene: the tree laid out left to right,
decision squares, chance circles, terminal values, the chosen branch highlighted.

## 6. `markov` — cohort models

Fields `states` (2–30: `{id, u, cost?, alive?, key?}`; `alive: false` for death), `P` (n × n transition probabilities per cycle, rows
summing to 1 ± 10⁻⁶, otherwise `impossible`), `start` (normalised, `normalised` if needed), `cycles` (1–1200), `cycleYears` (default
1), `discount` (annual, applied at the end of each cycle), `halfCycle` (the half-cycle correction: each cycle counts the mean of its
start and end occupancy). Outputs `markov.le` (life expectancy: alive occupancy × cycle length), `markov.qaly`, `markov.cost`,
`markov.occ.<s>` (the final occupancy), `markov.trace.<s>` (series, with `markov.cycle`). Sonnenberg & Beck, *Med Decis Making*
1993;13:322; DEALE (Beck, Kassirer & Pauker, *Am J Med* 1982;73:883) as the constant-rate check; rate → probability p = 1 − e^(−rt)
(Fleurence & Hollenbeak, *Pharmacoeconomics* 2007;25:3) is the author's step (write it as an expression in `P`).

## 7. `cea` — cost-effectiveness

Fields `strategies` (2–12: `{id, cost, qaly, key?}`), `wtp` (willingness to pay per QALY). Strong dominance (costlier and no better),
then extended dominance (an ICER higher than the next strategy's on the frontier), then ICERs along the frontier in order of cost
(Drummond, Sculpher, Claxton, Stoddart & Torrance, *Methods for the Economic Evaluation of Health Care Programmes* 4e, 2015); net
monetary benefit NMB = wtp·QALY − cost. Outputs `cea.icer.<s>` (NaN for the cheapest and for dominated ones), `cea.nmb.<s>`,
`cea.dominated.<s>` (0, 1 strongly, 2 extendedly), `cea.best` (highest NMB, 1-based). A cost or QALY that is not a number →
`incomplete`. Scene: the cost-effectiveness plane, the frontier, dominated points in `bad`/`warn`, the wtp line.

`wtp` is the author's data, never an engine constant. For a UK course: NICE's range was £20 000–30 000 per QALY (health technology
evaluations manual, 2022) and is £25 000–35 000 per QALY for appraisals from April 2026 (announced 2 December 2025; *Pharmaceutical
Journal*, 2025-12-02; checked 2026-11).

## 8. `triage`

| sub-section | fields | output | method |
|---|---|---|---|
| `esi` | `lifesaving`, `highRisk`, `confused`, `pain` (0–10), `resources` (count), `hr`, `rr`, `spo2`, `age` (y) | `triage.esi` 1–5, `triage.dangerZone` | Emergency Severity Index decision points A–D (ENA, *Emergency Severity Index Handbook* 5th ed., 2023): life-saving intervention → 1; high-risk, confused or pain ≥ 7 → 2; ≥ 2 resources → 3, or 2 with high-risk vitals (v5 Figure 6-1: HR > 190 / 180 / 140 / 120 / 120 / 100 and RR > 60 / 55 / 40 / 35 / 30 / 20 under 1 month / 1 y / 3 y / 5 y / 12 y / older, SpO₂ < 92 %); one resource → 4; none → 5 |
| `news2` | `rr spo2 sbp hr temp` (required), `o2`, `cvpu`, `scale2` | `triage.news2`, `triage.news2band` | med@1's NEWS2 (RCP 2017): band 0 score 0, 1 low, 2 a single 3, 3 medium 5–6, 4 high ≥ 7 |
| `qsofa` | `rr sbp gcs` | `triage.qsofa` 0–3 | Seymour, *JAMA* 2016;315:762 (RR ≥ 22, SBP ≤ 100, GCS < 15) |
| `sirs` | `temp hr rr paco2 wbc bands` | `triage.sirs` 0–4 | Bone, *Chest* 1992;101:1644 |
| `shock` | `hr sbp` | `triage.shock` | shock index HR/SBP (Allgöwer 1967; > 1 abnormal); SBP ≤ 0 → `impossible` |

**Checked (2026-11)** against the ESI Handbook 5th edition (ENA 2023; PDF at emscimprovement.center/documents/2177): the
high-risk vitals now follow v5 Figure 6-1 (v4's bands were < 3 mo 180/50, 3 mo–3 y 160/40, 3–8 y 140/30, > 8 y 100/20); pain ≥ 7
is "considered for" ESI 2 in v5 (ch. 5), not automatic, and the v5 paediatric fever rules (1–28 days T > 38 °C → at least ESI 2) are
not modelled — give them as `highRisk`.

## 9. `vp` — the virtual patient

| field | kind | meaning |
|---|---|---|
| `tEnd` | numx | the case's length in minutes (10–1440, default 240) |
| `patient` | `{weight, hb, shunt, lung, bleed, sepsis, growth, volume}` | weight kg (70); Hb g/dL (14); intrapulmonary shunt fraction (0.05); extra shunt per unit of sepsis burden (`lung`, 0); bleeding mL/min (0); initial sepsis burden 0–1 (0) and its logistic growth per hour (0.6); initial volume as a fraction of normal (1) |
| `actions` (1–60, required) | `{id, kind, at, cost?, dur?, turnaround?, reveals?, effect?, harm?, essential?, deadline?, after?, lowYield?, key?}` | `kind` ask / exam / test / treat / dispose; `at` the minute it is done (an expression of the learner's inputs; < 0 or past `tEnd` = not done); `turnaround` minutes until a test's result; `reveals` the ddx findings it shows; `effect` below; `harm` 0–1; `essential` its weight in the grade; `deadline` the minute it should be done by; `after` actions that must come first; `lowYield` a test of little value here |
| `effect` | `{fluid, over, vaso, abx, o2, stopBleed, blood}` | crystalloid mL (40 % stays intravascular) over `over` min (30); noradrenaline in µg/kg/min (from `at` on); antibiotics (1: the burden falls after a 60-min onset); FiO₂; stop the bleeding (1); blood mL over `over` |
| `noise` | bool | seeded noise on the shown vitals (the seed of the run; the physiology itself is deterministic) |
| `budget` | numx | the cost the efficiency grade allows |
| `weights` | `{essential, timely, safety, efficiency, order, calib}` | the grade's weights (defaults 0.30, 0.25, 0.20, 0.10, 0.05, 0.10) |

A `dispose` action ends the case for the reasoning: actions after it are not done, results after it are not seen.

**"Haemo-lite"** (in-house, qualitative; Guyton-style; a 0.1-min Euler step, recorded each minute). Blood volume V (70 mL/kg normal,
unstressed 70 %), stressed volume → stroke volume through a saturating curve (Frank–Starling), CO = HR·SV, MAP = CO·SVR. A baroreflex
moves HR (time constant 1 min) and SVR (2 min) toward restoring MAP 90 mmHg; sepsis lowers SVR (vasoplegia, up to −55 %), leaks
volume (0.4 %/min of the stressed volume per unit of burden) and raises temperature (+2.2 °C), HR (+35/min) and RR; noradrenaline
raises SVR (Emax with EC50 0.15 µg/kg/min); bleeding removes volume and red cells. PaO₂ from the shunt equation and med@1's
Severinghaus curve (alveolar gas at FiO₂·713 − PaCO₂/0.8); DO₂ = CO·CaO₂·10. Lactate is produced when DO₂ falls below 1.4 × the
critical delivery (4.5 mL/kg/min), by sepsis itself (aerobic glycolysis) and by hypotension, and cleared with a time constant of about
80 min. SBP and DBP from MAP and a pulse pressure SV/C. Death when MAP < 45 mmHg for 20 min or lactate ≥ 15 mmol/L. The qualitative
behaviour is the one textbooks describe and the tests assert: in haemorrhage the heart rate rises before the pressure falls (ATLS
classes I–II), untreated sepsis turns into hypotension with a rising lactate within hours, antibiotics late are worse than early,
oxygen raises SpO₂ less the bigger the shunt. It is **not** a validated simulator (BioGears, Pulse and HumMod are; they are far too
large for a Worker and were left out).

| output | kind | meaning |
|---|---|---|
| `vp.t`; `vp.<var>` for hr, sbp, dbp, map, spo2, rr, lactate, temp, volume, burden, pao2, hb, news2 | series | the course, one value a minute |
| `vp.final.<var>` | scalar | the value at the end |
| `vp.min.map`, `vp.max.lactate`, `vp.timeHypo` | scalar | the lowest MAP, the highest lactate, minutes with MAP < 65 |
| `vp.outcome`, `vp.diedAt` | scalar | 0 stabilised (MAP ≥ 65, lactate < 2, SpO₂ ≥ 92 at the end), 1 not stabilised, 2 died; the minute of death (NaN) |
| `vp.cost`, `vp.busy` | scalar | the cost of the actions done, the minutes they took |
| `vp.done.<a>`, `vp.resultAt.<a>` | scalar | 1 if the action was done; the minute its result arrives |
| `grade.<g>` | scalar | the grade of the reasoning path (below) |
| `vp` | scene | the MAP over time with the 65 mmHg line, each action done as a point (`ok` essential, `warn` late, `bad` harmful, `muted` low-yield), its turnaround as a dashed line, the disposition |

With a `ddx` beside it, the vp decides **which findings are known**: a finding named in an action's `reveals` is known from the
minute its result arrives (`at + turnaround`) if that is before the disposition and the end; until then it is unknown, whatever its
`present`.

**The grade of the reasoning path** (`grade.*`, each 0–1 unless said):

| name | meaning |
|---|---|
| `essential` | the weighted share of essential actions done |
| `timely` | the share of actions with a deadline done by it |
| `safety` | 1 − the sum of the harm of the actions done |
| `efficiency` | 1 − 0.15 per low-yield test − the share by which the cost exceeds the budget |
| `order` | the share of actions with `after` done after all of them |
| `calib` | 1 − `ddx.estErr` (NaN without estimates) |
| `critical` | the count of critical errors: deadlines missed + actions with harm ≥ 0.5 |
| `closure` | **premature closure**: must-not-miss hypotheses still at or above their action threshold (or 2 %) at the disposition, neither ruled out nor treated by one of their `treatedBy` actions |
| `infoEff` | **information efficiency**: for each test done, its expected information gain divided by the best gain any test available at that moment offered (a low value is the signature of confirmation bias: testing what one already believes; Croskerry, *Acad Med* 2003;78:775) |
| `lowYield` | the number of low-yield tests done |
| `process` | the weighted mean of essential, timely, safety, efficiency, order and calib |
| `total` | `process`, capped at 0.5 when there is a critical error or premature closure |
| `outcome` | 1 stabilised, 0.5 not, 0 died (reported separately: a good process can meet a bad outcome, and the grade judges the process) |

## 10. `sct` and `calib`

`sct`: `panel` (2–7 counts of the expert panel's answers on a Likert scale), `answer` (1-based). Aggregate scoring (Charlin, Roy,
Brailovsky, Goulet & van der Vleuten, *Teach Learn Med* 2000;12:189): credit = panel[answer]/max(panel); an answer outside → NaN +
`impossible`. Output `sct.credit`.
`calib`: `forecasts` (1–200 `{p, o}`, o 0/1). Brier score (Brier, *Mon Weather Rev* 1950;78:1) and the mean log score (p clamped to
10⁻⁶). A p outside [0, 1] or an o not 0/1 → `impossible` (that forecast is skipped). Outputs `calib.brier`, `calib.log`, `calib.n`.

## 11. Edge cases and runtime codes

| code | when |
|---|---|
| `normalised` | priors (or Markov `start`) not summing to 1, normalised; `other` with priors above 1 |
| `certain` | a likelihood of 0 or 1 clamped (Cromwell's rule; `allowCertain` lets it rule out) |
| `approx` | `lr` findings with more than two hypotheses |
| `impossible` | LR+ ≤ 1 or LR− ≥ 1 (a "positive" finding that argues against the target), a likelihood outside [0, 1], no prior mass, B ≤ 0, p outside [0, 1], chance probabilities or a Markov row not summing to 1, a combined Se/Sp outside [0, 1], an SCT answer outside the panel, a forecast outside [0, 1], SBP ≤ 0, an internal failure |
| `incomplete` | a prior or likelihood that is not a number (0.5 used), a CEA value that is not a number, med@1 missing |
| `no-test-zone` | the testing threshold at or above the test–treatment threshold |
| `unsafe` | the virtual patient died or the MAP fell below 50 mmHg |
| `range` | reserved for bounds on inputs (not raised by this version) |

A result arriving after the case ends is not seen. The same inputs give the same course (deterministic; noise only from the seed).
Every section runs inside a guard: a model that defeats the checker still gives NaN and `impossible`, never an exception.

## 12. Reference values (asserted in `tests/lib_clinic.js`)

| # | case | expected | tol. | source |
|---|---|---|---|---|
| C1 | pre 0.20, LR 3 then LR 0.5 | 0.2727 (trajectory 0.2, 0.4286, 0.2727) | 10⁻⁴ | Sox ch. 4 (odds form) |
| C2 | three hypotheses (0.5, 0.3, 0.2), two findings | (0.741, 0.222, 0.037) → (0.504, 0.454, 0.042) | 10⁻³ | Bayes' theorem |
| C3 | two LR-4 findings, pre 0.2: independent / fully dependent | 0.80 / 0.50, band [0.50, 0.80] | 10⁻⁶ | conditional dependence |
| C4 | Brier of p 0.7, outcome 1 | 0.09 | exact | Brier 1950 |
| C5 | B 10, H 1, Se 0.9, Sp 0.8 | p* 0.0909, T_test 0.0217, T_tt 0.4444; p 0.3 → test | 10⁻⁴ | Pauker & Kassirer 1980 |
| C6 | tree at p 0.3 | EV 0.935 (treat) vs 0.850, regret 0.085; sweep threshold H/(H + B) = 0.111 | 10⁻⁶ | Pauker & Kassirer 1975 |
| C7 | two tests Se 0.9, Sp 0.8 | serial 0.81 / 0.96, parallel 0.99 / 0.64 | exact | Sox |
| C8 | DEALE: constant mortality 0.1/yr, 0.1-yr cycles | life expectancy 10 y | ±0.06 | Beck, Kassirer & Pauker 1982 |
| C9 | three-state Markov, 2 cycles | W 722.5, S 165, D 112.5 per 1000 | 10⁻¹² | Sonnenberg & Beck 1993 |
| C10 | (2000, 8.0) vs (12 000, 8.5), wtp 30 000 | ICER 20 000 per QALY, B best | exact | Drummond 4e |
| C11 | ESI: chest pain suggestive of ACS / ankle X-ray / two resources with HR 110 | 2 / 4 / 2 (danger zone) | exact | ENA ESI Handbook |
| C12 | RR 24, SpO₂ 93, air, SBP 105, HR 115, alert, T 38.5; qSOFA; shock index | NEWS2 8 (high), qSOFA 2, SI 1.2 | exact | RCP 2017; Seymour 2016 |
| C13 | SCT panel (0, 1, 2, 5, 2) | credits (0, 0.2, 0.4, 1, 0.4) | exact | Charlin 2000 |
| C14 | mammography: prevalence 1 %, Se 80 %, FPR 9.6 % | 7.8 % | 10⁻³ | Eddy 1982 |
| C15 | rate 0.1/yr over 5 y | p = 0.3935 | 10⁻⁴ | Fleurence & Hollenbeak 2007 |

And: order invariance of the findings; information gain (a finding 0.9 vs 0.1 beats 0.55 vs 0.45); extended dominance; the virtual
patient in sepsis (early antibiotics and fluids → stabilised, MAP ≈ 91, lactate ≈ 1.3; untreated → MAP ≈ 56, lactate ≈ 3.4), late
antibiotics (a critical error, grade ≤ 0.5), antibiotics before cultures (order < 1), a CT instead of sepsis care (premature closure,
information efficiency < 1), haemorrhage at 25 mL/min (controlled and transfused → stabilised; untreated → death at ≈ 71 min, the HR
rising before the MAP falls), oxygen against a 30 % shunt, seeded noise; every edge code; the checker's codes; the adapter; the Worker
source (with med@1 inside) in a fresh `vm` context; speed.

## 13. Biases an activity can expose

The engine computes the signals; the pack's words explain them. **Anchoring / conservatism**: `ddx.updateRatio` < 1 (the stated
probabilities move less than Bayes). **Over-reaction / base-rate neglect**: `updateRatio` > 1, or a first estimate far from the prior
(`estErr`). **Confirmation bias**: `grade.infoEff` < 1 (a test chosen for what it confirms, not for what it can change). **Premature
closure**: `grade.closure`. **Overconfidence**: `ddx.brier`, `calib.brier`. **Ignoring dependence** (double counting two tests of the
same thing): the `lo`–`hi` band. **Omission / commission**: `grade.essential` and `grade.safety`. **Outcome bias**: `grade.outcome`
is kept apart from `grade.total`. (Croskerry 2003; Saposnik, Redelmeier, Ruff & Tobler, *BMC Med Inform Decis Mak* 2016;16:138.)

## 14. The reference activity `sepsis-case`

`tools/activities_examples/sepsis-case`: a 68-year-old woman with fever, rigors and confusion; sepsis 40 %, a viral illness 60 %. The
learner switches on and times four actions (lactate with blood cultures, antibiotics, 2 L of fluid, a CT at 15 min) and gives two
probabilities (on arrival, once the lactate is back). The course of MAP, heart rate and lactate is plotted, the timeline is the vp
scene, and the readouts give the MAP and lactate at 6 h, the time hypotensive, the Bayesian probability, the calibration error and the
grade. `tests.json`: the good path (lactate and cultures at 10 min, antibiotics at 30, fluids at 15: stabilised, grade 100 %); nothing
done (septic shock, two critical errors, premature closure); antibiotics at 150 min (grade capped at 50 %); antibiotics before the
cultures (order 0); only a CT (cost 300, premature closure); the right care with miscalibrated estimates (error 0.55).

A graded sim exercise for it (in a pack): `grade: {"mode": "checks", "pass": 0.75, "checks": [{"expr": "grade >= 0.8", "label":
"checkGrade", "weight": 3}, {"expr": "critical == 0", "label": "checkCritical"}, {"expr": "closure == 0", "label": "checkClosure"},
{"expr": "err <= 0.15", "label": "checkCalib"}]}`.

**Check before release**: the haemo-lite constants are in-house and only qualitatively calibrated (§9). The deadline in the
reference case (antibiotics within 1 h) was checked (2026-11) against the Surviving Sepsis Campaign 2021 (Evans, *Crit Care Med*
2021;49:e1063; *Intensive Care Med* 2021;47:1181, PMC8486643), recommendation 12: for possible septic shock or a high likelihood of
sepsis, antimicrobials "immediately, ideally within 1 h of recognition"; for possible sepsis without shock the guideline allows a
rapid assessment and antimicrobials within 3 h (recommendations 13–14), so a case without shock should use a 180-min deadline.

## Uses the kernel

Since 2026-11-07: the virtual patient's vital-sign noise draws from a kernel stream (`C.rng(seed, 'vp')` = `SK.stream`, normals by inversion) and the arterial PO₂ is Brent's root (`SK.brent`) of the O₂ content; its Worker source carries the kernel. The physiology itself stays a projected explicit Euler at 0.1 min (its clamps — volume, burden — are part of the model; `SK.integrate` cannot project a state between steps), the same in `run()` and the stepper (bit for bit). Snapshot unchanged.
