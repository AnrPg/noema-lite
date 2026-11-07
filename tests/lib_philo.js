/* philo@1 (engine/src/48_lib_philo.js, docs/library/philo.md): published reference values (the source in each message), the edge cases
   and their codes, the checker's codes and the JS ↔ Python parity on the fixtures, the sim adapter, the Worker source in a fresh
   global, speed. Run: node tests/lib_philo.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
globalThis.window = globalThis;
for (const f of ['35_simexpr.js', '46_lib_core.js', '46_lib_simkit.js', '47_lib_logic.js', '48_lib_philo.js']) require(path.join(SRC, f));
const L = globalThis.NoemaLibPhilo;
const spec = (model, outputs, params) => ({ format: 'noema.sim-spec/v1', engine: 'philo@1', params: params || [], model: model || {}, outputs: outputs || [] });
const runAll = (model, outs, env) => L.run(spec(model, outs.map((o, i) => Object.assign({ id: 'o' + i, kind: 'scalar' }, o))), env || {}, { seed: 7 });
const one = (model, o, env) => runAll(model, [o], env).out.o0;
const codes = (model, o) => runAll(model, [o]).codes.map(c => c.code);
const errs = s => L.checkSpec(s).filter(p => p.level === 'error');
const hasErr = (s, code, pathRe) => errs(s).some(p => p.code === code && (!pathRe || pathRe.test(p.path)));

// ---- 1. population axiology (Parfit 1984 Part IV; Arrhenius 2000; Sen 1973) ----
const POP = { populations: [
  { id: 'A', groups: [{ n: 1000, w: 100 }] }, { id: 'Z', groups: [{ n: 1e7, w: 0.1 }] },
  { id: 'U', groups: [{ n: 500, w: 100 }, { n: 500, w: 50 }] }, { id: 'Lv', groups: [{ n: 1000, w: 50 }] },
  { id: 'Q', groups: [{ n: 10, w: 5 }, { n: 10, w: 1 }] }, { id: 'R', groups: [{ n: 20, w: 2 }] },
  { id: 'K', groups: [{ n: 10, w: 10, rel: 0 }, { n: 100, w: 10, rel: 2 }] },
  { id: 'Lx1', groups: [{ n: 1, w: 0, levels: [5, 1] }] }, { id: 'Lx2', groups: [{ n: 1, w: 0, levels: [5, 9] }] },
  { id: 'Neg', groups: [{ n: 5, w: -1 }] }, { id: 'Empty', groups: [{ n: 0, w: 3 }] } ] };
ok(one(POP, { of: 'welfare', population: 'A', rule: 'total' }) === 1e5 && near(one(POP, { of: 'welfare', population: 'Z', rule: 'total' }), 1e6, 1e-6), 'total: A = 1000 × 100 = 10⁵, Z = 10⁷ × 0.1 = 10⁶ (Sidgwick 1874)');
ok(near(L.gini([{ n: 500, w: 100 }, { n: 500, w: 50 }]), 1 / 6, 1e-12) && near(one(POP, { of: 'welfare', population: 'U', rule: 'egal' }), 62.5, 1e-9), 'Gini of half at 100 and half at 50 = 1/6; Sen 1973 μ(1 − G) = 75 · 5/6 = 62.5');
ok(near(one(POP, { of: 'welfare', population: 'U', rule: 'prior', gamma: 1 }), 500 * Math.log(100) + 500 * Math.log(50), 1e-9) && near(one(POP, { of: 'welfare', population: 'A', rule: 'prior', gamma: 0.5 }), 1000 * 2 * 10, 1e-9), 'prioritarian (Atkinson 1970): γ = 1 is Σ n ln w; γ = ½ is Σ n 2√w');
ok(near(one(POP, { of: 'welfare', population: 'K', rule: 'graded', delta: 0.5 }), 100 + 1000 * 0.25, 1e-9) && near(one(POP, { of: 'welfare', population: 'K', rule: 'graded', delta: 1 }), one(POP, { of: 'welfare', population: 'K', rule: 'total' }), 1e-9), 'graded concern (Mengzi 3A5): 10·10 + 100·10·0.5² = 350; δ = 1 is Mozi\'s impartial care = total');
ok(near(one(POP, { of: 'welfare', population: 'A', rule: 'critical', c: 5 }), 95000, 1e-9) && near(one(POP, { of: 'welfare', population: 'A', rule: 'variable', k: 100 }), 100 * 100 * (1 - Math.exp(-10)), 1e-6), 'critical level Σ(w − c) (Blackorby, Bossert & Donaldson 2005); variable value μ·k(1 − e^(−N/k)) (Hurka 1983, Ng 1989)');
const P = (paradox, rule, x) => one({}, Object.assign({ of: 'paradox', paradox, rule }, x || {}));
ok(P('repugnant', 'total') === 1 && P('repugnant', 'prior') === 1 && P('repugnant', 'kolm') === 1 && P('repugnant', 'average') === 0 && P('repugnant', 'maximin') === 0 && P('repugnant', 'variable') === 0, 'the Repugnant Conclusion: total and both prioritarianisms imply it; average, maximin and variable value avoid it (Parfit 1984 ch. 17; Arrhenius SEP)');
ok(P('mereAddition', 'average') === 1 && P('mereAddition', 'maximin') === 1 && P('mereAddition', 'total') === 0, 'Mere Addition: average and maximin rank A+ below A, total does not (Parfit 1984 ch. 19)');
ok(P('sadistic', 'critical', { c: 5 }) === 1 && P('sadistic', 'average') === 1 && P('sadistic', 'total') === 0, 'the Sadistic Conclusion: critical-level (c = 5) and average imply it, total does not (Arrhenius 2000)');
ok(P('levellingDown', 'equality') === 1 && P('levellingDown', 'egal') === 0 && P('levellingDown', 'maximin') === 0, 'Levelling Down: pure equality ranks the levelled outcome higher; Sen\'s μ(1 − G) and maximin do not (Parfit 1997; Temkin 1993)');
ok(one(POP, { of: 'compare', a: 'Q', b: 'R', rule: 'leximin' }) === -1 && one(POP, { of: 'compare', a: 'Q', b: 'R', rule: 'total' }) === 1, 'leximin prefers 20 at 2 to 10 at 5 + 10 at 1 (the worst-off first; Sen 1970), total the other way');
ok(one(POP, { of: 'compare', a: 'Lx1', b: 'Lx2', rule: 'lexical' }) === -1 && one(POP, { of: 'compare', a: 'Lx2', b: 'Lx1', rule: 'lexical' }) === 1, 'lexical priority: equal on the first level, the second decides (Rawls 1971 §8; al-Shāṭibī\'s ranked maqāṣid)');
{ const AZ = { populations: POP.populations.slice(0, 4) }; ok(one(AZ, { of: 'best', rule: 'total' }) === 1 && one(AZ, { of: 'best', rule: 'average' }) === 0 && Number.isNaN(one(POP, { of: 'best', rule: 'average' })), 'best: Z under total, A under average; NaN when one population has no value (the average of nobody)'); }
ok(Number.isNaN(one(POP, { of: 'welfare', population: 'Neg', rule: 'prior' })) && codes(POP, { of: 'welfare', population: 'Neg', rule: 'prior' }).includes('nonpositive') && codes(POP, { of: 'welfare', population: 'Empty', rule: 'average' }).includes('empty'), 'edge cases: Atkinson prioritarianism of w ≤ 0 → NaN + nonpositive; the average of nobody → NaN + empty');
ok(one(POP, { of: 'compare', a: 'A', b: 'A', rule: 'total' }) === 0 && codes(POP, { of: 'compare', a: 'A', b: 'A', rule: 'total' }).includes('tie'), 'a tie gives 0 and the code tie');

// ---- 2. trolley-family cases (Foot 1967; Thomson 1976, 1985; Greene et al. 2009; Scanlon 1998; Moore 1997; Taurek 1977) ----
const CASES = { cases: ['switch', 'driver', 'footbridge', 'loop', 'trapdoor', 'transplant', 'transmitter'].map(p => ({ id: p, preset: p })).concat([{ id: 'easy', kAct: 0, kNot: 1 }, { id: 'fbc', preset: 'footbridge', consent: true }]) };
const V = (c, p, x) => one(CASES, Object.assign({ of: 'verdict', case: c, principle: p }, x || {}));
const row = c => L.TABLES.PRINCIPLES.map(p => V(c, p)).join('');
ok(row('switch') === '211011221', 'switch (bystander): util must, DDE may, means may, doing/allowing must not (Foot), Thomson may, personal force may, threshold must, Scanlon must, Taurek may');
ok(row('footbridge') === '200000021', 'footbridge: only act utilitarianism and Scanlon\'s tie-breaking require pushing; every constraint forbids it; Taurek may');
ok(V('loop', 'dde') === 0 && V('loop', 'redirect') === 1 && V('loop', 'means') === 0, 'the loop splits the DDE (forbids: the one is a means) from Thomson 1985 (permits: a redirection)');
ok(V('trapdoor', 'personalForce') === 1 && V('footbridge', 'personalForce') === 0, 'Greene et al. 2009: harm as a means without personal force (trapdoor) is judged permissible, with it (footbridge) not');
ok(V('driver', 'doingAllowing') === 2 && V('switch', 'doingAllowing') === 0, 'Foot 1967: the driver must steer (killing one vs five), the bystander may not (killing vs letting die)');
ok(V('footbridge', 'threshold', { T: 10 }) === 0 && V('footbridge', 'threshold', { T: 5 }) === 2, 'threshold deontology: 5 saved / 1 used is below a threshold of 10, at a threshold of 5 the constraint gives way (Moore 1997)');
ok(V('transmitter', 'util') === 0 && V('transmitter', 'contract') === 2 && V('transmitter', 'taurek') === 2, 'the Transmitter Room: aggregation says keep broadcasting, Scanlon\'s contractualism says save Jones (Scanlon 1998 p. 235)');
ok(L.TABLES.PRINCIPLES.every(p => V('easy', p) === 2) && V('fbc', 'means') === 1, 'an easy rescue is required by every principle; consent removes the "merely as a means" (Kant G 4:429)');
ok(one(CASES, { of: 'permits', case: 'switch' }) === 8 && one(CASES, { of: 'permits', case: 'footbridge' }) === 3, 'permits: 8 of 9 principles permit turning the trolley, 3 pushing');
// Kant's FUL (G 4:421–424; Korsgaard 1985)
const MX = { maxims: ['suicide', 'falsePromise', 'talents', 'beneficence', 'tennis', 'toys'].map(p => ({ id: p, preset: p })) };
const F = (m, r) => one(MX, { of: 'ful', maxim: m, reading: r });
ok(F('falsePromise', 'logical') === 0 && F('suicide', 'logical') === 2 && F('suicide', 'teleological') === 0 && F('talents', 'practical') === 1 && F('beneficence', 'logical') === 1, 'FUL: the false promise fails in conception, suicide only on the teleological reading, talents and beneficence in the will (G 4:422–423; Korsgaard 1985)');
ok(F('tennis', 'practical') === 0 && F('tennis', 'logical') === 2 && F('toys', 'logical') === 0, 'the known false positives: the timing maxim fails the practical reading, "buy but never sell" the logical one (Herman 1993; O\'Neill 1975)');
// virtue profiles (NE II.6–7)
const VP = { profiles: [{ id: 'p', scheme: 'aristotle', tol: 0.2, traits: { courage: 0.5, temperance: -0.1, liberality: -0.6 } }] };
ok(one(VP, { of: 'trait', profile: 'p', trait: 'courage' }) === 1 && one(VP, { of: 'trait', profile: 'p', trait: 'temperance' }) === 0 && one(VP, { of: 'trait', profile: 'p', trait: 'liberality' }) === -1 && near(one(VP, { of: 'virtue', profile: 'p' }), (0.5 + 0.9 + 0.4) / 3, 1e-12), 'the doctrine of the mean: courage +0.5 is rashness, temperance −0.1 the mean, liberality −0.6 meanness; score mean(1 − |x|)');

// ---- 3. social choice (Condorcet 1785; Borda 1781; Arrow 1951; the Tennessee example of the Condorcet-method literature) ----
const TN = { id: 'tn', candidates: ['M', 'N', 'C', 'K'], axis: ['M', 'N', 'C', 'K'], ballots: [{ n: 42, rank: ['M', 'N', 'C', 'K'] }, { n: 26, rank: ['N', 'C', 'K', 'M'] }, { n: 15, rank: ['C', 'K', 'N', 'M'] }, { n: 17, rank: ['K', 'C', 'N', 'M'] }] };
const CYC = { id: 'cyc', candidates: ['a', 'b', 'c'], ballots: [{ n: 1, rank: ['a', 'b', 'c'] }, { n: 1, rank: ['b', 'c', 'a'] }, { n: 1, rank: ['c', 'a', 'b'] }] };
const MONO = { id: 'mono', candidates: ['A', 'B', 'C'], ballots: [{ n: 39, rank: ['A', 'B', 'C'] }, { n: 35, rank: ['B', 'C', 'A'] }, { n: 26, rank: ['C', 'A', 'B'] }] };
const SPO = { id: 'spo', candidates: ['A', 'B', 'C'], ballots: [{ n: 4, rank: ['A', 'B', 'C'] }, { n: 3, rank: ['B', 'A', 'C'] }, { n: 2, rank: ['C', 'B', 'A'] }] };
const MAN = { id: 'man', candidates: ['A', 'B', 'C'], ballots: [{ n: 3, rank: ['A', 'B', 'C'] }, { n: 2, rank: ['B', 'A', 'C'] }] };
const I1 = { id: 'i1', candidates: ['A', 'B', 'C'], ballots: [{ n: 3, rank: ['A', 'B', 'C'] }, { n: 2, rank: ['B', 'C', 'A'] }] };
const I2 = { id: 'i2', candidates: ['A', 'B', 'C'], ballots: [{ n: 3, rank: ['A', 'C', 'B'] }, { n: 2, rank: ['B', 'A', 'C'] }] };
const EL = { elections: [TN, CYC, MONO, SPO, MAN, I1, I2] };
const W = (e, m) => one(EL, { of: 'winner', election: e, method: m });
const tnW = ['plurality', 'runoff', 'irv', 'borda', 'condorcet', 'copeland', 'minimax', 'schulze', 'rankedPairs', 'kemeny', 'coombs', 'nanson', 'baldwin', 'bucklin', 'black', 'approval'].map(m => 'MNCK'[W('tn', m)] || '-').join('');
ok(tnW === 'MNKNNNNNNNNNNNNM', 'Tennessee: plurality Memphis, IRV Knoxville, runoff and every Condorcet method, Borda, Coombs, Nanson, Baldwin, Bucklin Nashville (got ' + tnW + ')');
ok(one(EL, { of: 'score', election: 'tn', method: 'borda', cand: 'N' }) === 194 && one(EL, { of: 'score', election: 'tn', method: 'borda', cand: 'M' }) === 126 && one(EL, { of: 'margin', election: 'tn', a: 'N', b: 'M' }) === 16, 'Tennessee Borda scores N 194, M 126; N beats M 58–42');
ok(W('tn', 'antiplurality') === -1 && codes(EL, { of: 'winner', election: 'tn', method: 'antiplurality' }).includes('tie'), 'anti-plurality ties Nashville and Chattanooga at 100: −1 and the code tie');
ok(one(EL, { of: 'cycle', election: 'cyc' }) === 1 && one(EL, { of: 'condorcet', election: 'cyc' }) === -1 && one(EL, { of: 'smith', election: 'cyc' }) === 3 && one(EL, { of: 'cycle', election: 'tn' }) === 0 && one(EL, { of: 'smith', election: 'tn' }) === 1, 'Condorcet\'s paradox: a ≻ b ≻ c ≻ a, no Condorcet winner, the Smith set has all three (Condorcet 1785)');
ok(one(EL, { of: 'condorcet', election: 'tn', loser: true }) === 0 && one(EL, { of: 'criterion', election: 'tn', method: 'plurality', criterion: 'condorcetLoser' }) === 0 && one(EL, { of: 'criterion', election: 'tn', method: 'irv', criterion: 'condorcet' }) === 0 && one(EL, { of: 'criterion', election: 'tn', method: 'irv', criterion: 'condorcetLoser' }) === 1, 'Memphis is the Condorcet loser and the plurality winner; IRV fails the Condorcet criterion here');
ok(W('mono', 'irv') === 0 && one(EL, { of: 'criterion', election: 'mono', method: 'irv', criterion: 'monotonic' }) === 0 && one(EL, { of: 'criterion', election: 'mono', method: 'plurality', criterion: 'monotonic' }) === 1, 'IRV is not monotonic: raising A on 10 B>C>A ballots makes C win (Smith 1973; Fishburn & Brams 1983)');
ok(one(EL, { of: 'criterion', election: 'spo', method: 'plurality', criterion: 'spoiler' }) === 0 && one(EL, { of: 'criterion', election: 'spo', method: 'condorcet', criterion: 'spoiler' }) === 1, 'the spoiler: removing C turns plurality\'s A into B; the Condorcet winner B is stable');
ok(one(EL, { of: 'criterion', election: 'i1', method: 'borda', criterion: 'iia', other: 'i2' }) === 0 && one(EL, { of: 'criterion', election: 'i1', method: 'condorcet', criterion: 'iia', other: 'i2' }) === 1, 'Arrow\'s IIA: the same A–B preferences, Borda reverses A and B as C moves (Arrow 1951)');
ok(one(EL, { of: 'criterion', election: 'tn', method: 'borda', criterion: 'pareto' }) === 1 && one(EL, { of: 'criterion', election: 'tn', method: 'borda', criterion: 'participation' }) === 1, 'Borda satisfies weak Pareto and participation on Tennessee');
ok(one(EL, { of: 'manipulable', election: 'man', method: 'borda' }) === 1 && one(EL, { of: 'manipulable', election: 'man', method: 'condorcet' }) === 0, 'Gibbard–Satterthwaite: the two B voters bury A under C and B wins Borda; the Condorcet winner is safe here');
ok(one(EL, { of: 'singlePeaked', election: 'tn' }) === 1 && one(EL, { of: 'singlePeaked', election: 'cyc' }) === 0, 'Black 1948: Tennessee is single-peaked on the west–east axis, the cyclic profile on no axis');
{ const sc = runAll(EL, [{ kind: 'scene', of: 'majority', election: 'cyc' }]).out.o0; ok(sc.items.filter(i => i.k === 'seg' && i.c === 'bad').length === 3, 'the majority scene draws the three arrows of the cycle as bad'); }

// ---- 4. decision theory ----
const LOT = { lotteries: [
  { id: 'a1', outcomes: [{ p: 1, x: 1e6 }] }, { id: 'b1', outcomes: [{ p: 0.1, x: 5e6 }, { p: 0.89, x: 1e6 }, { p: 0.01, x: 0 }] },
  { id: 'a2', outcomes: [{ p: 0.11, x: 1e6 }, { p: 0.89, x: 0 }] }, { id: 'b2', outcomes: [{ p: 0.1, x: 5e6 }, { p: 0.9, x: 0 }] },
  { id: 'red', outcomes: [{ p: 1 / 3, x: 100 }, { p: 2 / 3, x: 0 }] }, { id: 'black', outcomes: [{ p: 1 / 3, x: 100 }, { p: 2 / 3, x: 0 }], priors: [[0, 1], [2 / 3, 1 / 3]] },
  { id: 'coin', outcomes: [{ p: 0.5, x: 100 }, { p: 0.5, x: 0 }] }, { id: 'mixd', outcomes: [{ p: 0.5, x: 100 }, { p: 0.5, x: -100 }] },
  { id: 'mug', outcomes: [{ p: 1e-20, x: 1e30 }, { p: 1 - 1e-20, x: -10 }] }, { id: 'quo', outcomes: [{ p: 1, x: 0 }] },
  { id: 'bad', outcomes: [{ p: 0.5, x: 1 }, { p: 0.4, x: 0 }] } ] };
ok(one(LOT, { of: 'commonCons', a: 'a1', b: 'b1', c: 'a2', d: 'b2' }) === 1 && near(one(LOT, { of: 'ev', lottery: 'b1' }), 1.39e6, 1e-6), 'Allais 1953: 1A–1B and 2A–2B differ by the same common consequence, so EU must choose alike; EV(1B) = 1.39 M');
ok(near(one(LOT, { of: 'eu', lottery: 'coin', u: 'sqrt' }), 5, 1e-12) && near(one(LOT, { of: 'ce', lottery: 'coin', u: 'sqrt' }), 25, 1e-9) && near(one(LOT, { of: 'premium', lottery: 'coin', u: 'sqrt' }), 25, 1e-9), 'EU of ½·100 with √: 5, certainty equivalent 25, risk premium 25 (Pratt 1964)');
const SP = x => one({}, Object.assign({ of: 'stpete' }, x));
ok(near(SP({ what: 'eu', u: 'log' }), 2 * Math.LN2, 1e-12) && near(SP({ what: 'ce', u: 'log' }), 4, 1e-9), 'St Petersburg with log utility: EU = 2 ln 2, certainty equivalent 4 (D. Bernoulli 1738)');
ok(near(SP({ what: 'ev', bank: Math.pow(2, 30) }), 31, 1e-9) && SP({ what: 'ev', rounds: 50 }) === 50 && codes({}, { of: 'stpete', what: 'ev', rounds: 50 }).includes('truncated'), 'St Petersburg: a bank of 2³⁰ caps the EV at 31; without one EV = the number of rounds, flagged truncated');
{ const w5 = one(LOT, { of: 'cpt', lottery: 'coin' }) / Math.pow(100, 0.88); ok(near(w5, 0.421, 0.002) && one(LOT, { of: 'cpt', lottery: 'mixd' }) < 0, 'CPT (Tversky & Kahneman 1992): w⁺(0.5) = 0.421; a 50–50 ±100 gamble has negative value (λ = 2.25)'); }
ok(near(one(LOT, { of: 'meu', lottery: 'black' }), 0, 1e-12) && one(LOT, { of: 'choose', a: 'red', b: 'black', rule: 'meu' }) === 1 && one(LOT, { of: 'choose', a: 'red', b: 'black', rule: 'ev' }) === 0, 'Ellsberg 1961: maxmin EU (Gilboa & Schmeidler 1989) prefers the known urn; EV is indifferent');
ok(one(LOT, { of: 'choose', a: 'mug', b: 'quo', rule: 'ev' }) === 1 && one(LOT, { of: 'choose', a: 'mug', b: 'quo', rule: 'discount' }) === -1 && one(LOT, { of: 'choose', a: 'mug', b: 'quo', rule: 'eu', u: 'bounded', ua: 100, w0: 10 }) === -1, 'Pascal\'s mugging (Bostrom 2009): EV pays the mugger; probability discounting (Monton 2019) and bounded utility do not');
ok(one(LOT, { of: 'choose', a: 'coin', b: 'quo', rule: 'maxmin' }) === 0 && one(LOT, { of: 'choose', a: 'coin', b: 'quo', rule: 'maximax' }) === 1 && one(LOT, { of: 'choose', a: 'coin', b: 'quo', rule: 'hurwicz', alpha: 0.5 }) === 1, 'under ignorance: maxmin ties (0 vs 0), maximax and Hurwicz ½ take the coin (Wald 1950; Hurwicz 1951)');
ok(Number.isNaN(one(LOT, { of: 'ev', lottery: 'bad' })) && codes(LOT, { of: 'ev', lottery: 'bad' }).includes('probsum') && hasErr(spec(LOT, []), 'value', /lotteries\[10\]\.outcomes$/), 'probabilities that do not sum to 1: the checker refuses them, a run gives NaN + probsum');
const NP = { problems: [{ id: 'nc', preset: 'newcomb' }, { id: 'nh', preset: 'newcomb', acc: 0.5005 }, { id: 'ls', preset: 'lesion' }, { id: 'pb', preset: 'psychopath' }] };
const D = (p, t, act) => one(NP, Object.assign({ of: 'dtv', problem: p, theory: t }, act ? { act } : {}));
ok(near(D('nc', 'edt', 'one'), 990000, 1e-6) && near(D('nc', 'edt', 'two'), 11000, 1e-6) && D('nc', 'edt') === 0 && D('nc', 'cdt') === 1 && one(NP, { of: 'dominant', problem: 'nc' }) === 1, 'Newcomb (Nozick 1969): EDT one-boxes (990 000 vs 11 000), CDT two-boxes, two-boxing dominates');
ok(D('nh', 'edt') === -1 && codes(NP, { of: 'dtv', problem: 'nh', theory: 'edt' }).includes('tie'), 'at accuracy 0.5005 EDT is indifferent (p·10⁶ = (1 − p)·10⁶ + 1000)');
ok(D('ls', 'edt') === 1 && D('ls', 'cdt') === 0 && D('pb', 'cdt') === 0 && D('pb', 'edt') === 1, 'the smoking lesion: EDT abstains, CDT smokes; the psychopath button (Egan 2007): CDT pushes, EDT refrains');

// ---- 5. games (Nash 1950; Skyrms 2004; Axelrod 1984) ----
const G = { games: [{ id: 'pd', preset: 'pd' }, { id: 'st', preset: 'stag' }, { id: 'bos', preset: 'bos' }, { id: 'mp', preset: 'pennies' }, { id: 'ch', preset: 'chicken' }],
  tournament: { game: 'pd', strategies: ['allc', 'alld', 'tft'], rounds: 200, gens: 500 } };
ok(one(G, { of: 'nash', game: 'pd' }) === 1 && one(G, { of: 'isNash', game: 'pd', r: 1, c: 1 }) === 1 && one(G, { of: 'dominantStrat', game: 'pd' }) === 1 && one(G, { of: 'paretoCell', game: 'pd', r: 1, c: 1 }) === 0 && one(G, { of: 'paretoCell', game: 'pd', r: 0, c: 0 }) === 1, 'PD: the only equilibrium (D, D) is dominant and Pareto-inferior to (C, C)');
ok(near(one(G, { of: 'grimDelta', game: 'pd' }), 0.5, 1e-12), 'GRIM sustains cooperation iff δ ≥ (T − R)/(T − P) = 0.5 (Friedman 1971)');
ok(one(G, { of: 'nash', game: 'st' }) === 2 && near(one(G, { of: 'mixed', game: 'st' }), 0.75, 1e-12) && one(G, { of: 'nash', game: 'ch' }) === 2, 'stag hunt: two pure equilibria, the mixed one hunts stag with p = 3/4 (Skyrms 2004); chicken: two');
ok(near(one(G, { of: 'mixed', game: 'bos' }), 2 / 3, 1e-12) && near(one(G, { of: 'mixed', game: 'mp', player: 2 }), 0.5, 1e-12) && one(G, { of: 'nash', game: 'mp' }) === 0 && Number.isNaN(one(G, { of: 'mixed', game: 'pd' })), 'battle of the sexes p = 2/3; matching pennies ½ and no pure equilibrium; PD has no mixed one (no-mixed)');
const IP = s => one(G, { of: 'ipd', strategy: s, what: 'mean' });
ok(near(IP('allc'), 2, 1e-12) && near(IP('alld'), (5 + 1 + 204 / 200) / 3, 1e-12) && near(IP('tft'), (3 + 199 / 200 + 3) / 3, 1e-12) && one(G, { of: 'ipd', strategy: 'alld', what: 'rank' }) === 1, 'round robin (Axelrod 1984), 200 rounds, self-play: ALLC 2, ALLD 2.34, TFT 2.332 — ALLD first among these three');
{ const sh = s => one(G, { of: 'ipd', strategy: s, what: 'share' }); ok(sh('alld') < 1e-6 && near(sh('tft'), 0.785, 0.001) && near(sh('allc') + sh('tft'), 1, 1e-6), 'replicator dynamics (Taylor & Jonker 1978): ALLD dies out; TFT (0.785) and ALLC then drift neutrally (both earn R = 3)'); }
{ const G2 = Object.assign({}, G, { tournament: { game: 'pd', strategies: ['tft', 'pavlov', 'gtft', 'random'], rounds: 100, noise: 0.05 } });
  const a = runAll(G2, [{ of: 'ipd', strategy: 'pavlov', what: 'mean' }]).out.o0, b = L.run(spec(G2, [{ id: 'x', kind: 'scalar', of: 'ipd', strategy: 'pavlov', what: 'mean' }]), {}, { seed: 7 }).out.x, c = L.run(spec(G2, [{ id: 'x', kind: 'scalar', of: 'ipd', strategy: 'pavlov', what: 'mean' }]), {}, { seed: 8 }).out.x;
  ok(a === b && a !== c && a > 1 && a < 5, 'noise is seeded (NoemaSimKit MRG32k3a): the same seed the same score, another seed another'); }
{ const m = runAll(G, [{ kind: 'series', of: 'match', a: 'tft', b: 'alld' }]).out.o0; ok(m.length === 200 && m[0] === 0 && m[199] === 199, 'a match series: TFT against ALLD, cumulative 0 then +1 a round'); }
const BG = { bargains: [{ id: 'd1', pts: [[0, 0], [1, 0], [0, 1]] }, { id: 'd2', pts: [[0, 0], [2, 0], [0, 1]] }, { id: 'd3', pts: [[0, 0], [1, 0], [1, 0.5], [0, 1]] }] };
const B = (b, s, k) => one(BG, { of: 'bargain', bargain: b, solution: s, coord: k || 0 });
ok(near(B('d1', 'nash'), 0.5, 1e-12) && near(B('d2', 'nash'), 1, 1e-12) && near(B('d2', 'nash', 1), 0.5, 1e-12) && near(B('d2', 'ks'), 1, 1e-12) && near(B('d2', 'egal'), 2 / 3, 1e-12) && B('d2', 'util') === 2, 'bargaining: splitting a dollar ½–½; on x/2 + y = 1 Nash = KS = (1, ½), egalitarian 2/3, utilitarian 2 (Nash 1950; Kalai–Smorodinsky 1975)');
ok(near(B('d3', 'nash'), 1, 1e-12) && near(B('d3', 'ks'), 2 / 3, 1e-12) && near(B('d3', 'ks', 1), 2 / 3, 1e-12), 'Nash (1, ½) and Kalai–Smorodinsky (⅔, ⅔) differ on a kinked frontier');

// ---- 6. epistemology ----
const BE = { beliefs: [{ id: 'b', h: 0.5, eh: 0.8, enh: 0.4 }, { id: 'z', h: 0, eh: 0.5, enh: 0.5 }] };
const CF = m => one(BE, { of: 'confirm', belief: 'b', measure: m });
ok(near(CF('post'), 2 / 3, 1e-12) && near(CF('d'), 1 / 6, 1e-12) && near(CF('r'), Math.log(4 / 3), 1e-12) && near(CF('l'), Math.LN2, 1e-12) && near(CF('s'), 2 / 3 - 0.25, 1e-12) && near(CF('k'), 1 / 3, 1e-12) && near(CF('z'), 1 / 3, 1e-12) && near(CF('c'), 0.1, 1e-12), 'confirmation of P(H) = ½, P(E|H) = 0.8, P(E|¬H) = 0.4: d 1/6, r ln 4/3, l ln 2, s 5/12, k 1/3, z 1/3, c 0.1 (Fitelson 1999; Crupi et al. 2007)');
ok(near(CF('k'), Math.tanh(CF('l') / 2), 1e-12), 'k is ordinally l: k = tanh(l/2) (Kemeny & Oppenheim 1952; Fitelson 2001)');
ok(Number.isNaN(one(BE, { of: 'confirm', belief: 'z', measure: 'd' })) && codes(BE, { of: 'confirm', belief: 'z', measure: 'd' }).includes('degenerate'), 'a prior of 0: NaN + degenerate');
ok(near(one({}, { of: 'dutch', cr: [0.5, 0.4, 0.3] }), 0.2, 1e-12), 'Dutch book (de Finetti 1937): credences 0.5 + 0.4 + 0.3 over a partition lose 0.2 per unit stake');
const KN = { knowledge: ['coins', 'ford', 'barns', 'clock', 'sheep', 'mirage', 'smoke', 'truetemp', 'lottery', 'ordinary'].map(p => ({ id: p, preset: p })) };
const K = (c, a) => one(KN, { of: 'knows', case: c, analysis: a });
ok(K('coins', 'jtb') === 1 && K('coins', 'noFalseLemma') === 0 && K('coins', 'reliabilism') === 1 && K('coins', 'intuition') === 0, 'Gettier 1963: justified true belief without knowledge; no false lemmas (Clark 1963) fixes it, reliabilism does not');
ok(K('barns', 'noFalseLemma') === 1 && K('barns', 'safety') === 0 && K('barns', 'virtue') === 1 && K('mirage', 'jtb') === 1 && K('mirage', 'causal') === 0, 'fake barns defeat no-false-lemmas but not safety; Sosa 2007 grants animal knowledge; Dharmottara\'s mirage is a Gettier case seven centuries early');
ok(K('truetemp', 'reliabilism') === 1 && K('truetemp', 'jtb') === 0 && K('lottery', 'sensitivity') === 0 && K('ordinary', 'safety') === 1, 'Truetemp (Lehrer 1990) is a counterexample to reliabilism; the lottery belief is insensitive');
{ const fits = ['jtb', 'noFalseLemma', 'defeasibility', 'causal', 'reliabilism', 'sensitivity', 'safety', 'virtue'].map(a => one(KN, { of: 'fits', analysis: a })); ok(fits.join() === '2,8,9,8,2,9,9,8', 'fits: how many of the 10 preset cases each analysis gets right: ' + fits.join()); }
const SR = { sorites: { n: 101, lo: 30, hi: 70 } };
const SO = (what, x) => one(SR, Object.assign({ of: 'sorites', what }, x || {}));
ok(near(SO('condMin'), 0.975, 1e-12) && near(SO('bound'), 0, 1e-12) && SO('superTrue') === 30 && SO('superFalse') === 30 && SO('indet') === 41 && near(SO('value', { i: 50 }), 0.5, 1e-12), 'sorites by degrees: every conditional at least 0.975 true, the conclusion 0 (Goguen 1969; Smith 2008); supervaluation 30 / 30 / 41 (Fine 1975)');
ok(one({}, { of: 'lottery', n: 1000, t: 0.99, what: 'believed' }) === 1000 && one({}, { of: 'lottery', n: 1000, t: 0.99, what: 'closure' }) === 1 && one({}, { of: 'lottery', n: 1000, t: 0.9995, what: 'believed' }) === 0, 'lottery (Kyburg 1961): at t = 0.99 each of 1000 "ticket i loses" is believed, their conjunction has probability 0');
ok(one({}, { of: 'preface', n: 1, r: 0.99, t: 0.95, what: 'maxClaims' }) === 5 && near(one({}, { of: 'preface', n: 100, r: 0.99, t: 0.95, what: 'conj' }), Math.pow(0.99, 100), 1e-12), 'preface (Makinson 1965): with 99 % reliable claims and t = 0.95, at most 5 can be believed together; 100 claims: 0.366');
ok(near(one({}, { of: 'beauty', theory: 'thirder' }), 1 / 3, 1e-12) && one({}, { of: 'beauty', theory: 'halfer' }) === 0.5 && near(one({}, { of: 'beauty', theory: 'halfer', monday: true }), 2 / 3, 1e-12) && one({}, { of: 'beauty', theory: 'thirder', monday: true }) === 0.5 && near(one({}, { of: 'beauty', theory: 'thirder', wakes: 9 }), 0.1, 1e-12), 'Sleeping Beauty: thirder 1/3 (Elga 2000), halfer 1/2 and 2/3 on learning Monday (Lewis 2001)');

// ---- 7. Indian and Buddhist forms, thought experiments, the map, arguments ----
const IN = { inferences: [{ id: 'smoke', paksa: true, sapaksa: 'some', vipaksa: 'none' }, { id: 'audible', paksa: true, sapaksa: 'none', vipaksa: 'none' }, { id: 'produced', paksa: true, sapaksa: 'none', vipaksa: 'some' }, { id: 'unest', paksa: false, sapaksa: 'all', vipaksa: 'none' }] };
const H = (i, w) => one(IN, { of: 'hetu', inference: i, what: w });
ok(H('smoke', 'cell') === 8 && H('smoke', 'verdict') === 1 && H('audible', 'cell') === 5 && H('audible', 'verdict') === 0 && H('produced', 'cell') === 6 && H('produced', 'verdict') === -1 && H('unest', 'verdict') === -2, 'Dignāga\'s wheel of reasons: smoke → fire is cell 8 (valid), "audible" cell 5 (uncommon, inconclusive), "produced" cell 6 (contradictory); a reason absent from the subject is asiddha');
ok([[1, 0], [0, 1], [1, 1], [0, 0]].map(([t, f]) => one({}, { of: 'koti', t, f })).join('') === '1234' && one({}, { of: 'koti', t: 0, f: 0, e: 1 }) === 5, 'the catuṣkoṭi as FDE: true, false, both, neither; Priest\'s fifth corner (Priest 2010)');
ok(one({}, { of: 'bhanga', asti: 1, nasti: 1, avak: 1 }) === 7 && one({}, { of: 'bhanga', asti: 0, nasti: 0, avak: 1 }) === 4 && one({}, { of: 'bhanga', asti: 1, nasti: 1, avak: 0 }) === 3, 'the Jain saptabhaṅgī: 7 = is, is not, inexpressible; 4 = inexpressible alone (Matilal 1981)');
const EX = { experiments: [{ id: 'm', te: 'mary' }, { id: 'cr', te: 'chineseRoom' }, { id: 'own', options: ['yes', 'no'], positions: { kant: 'no', mill: 'yes', ross: 'no' } }] };
ok(one(EX, { of: 'teAnswer', experiment: 'm', position: 'dennett' }) === 4 && one(EX, { of: 'teAnswer', experiment: 'cr', position: 'searle' }) === 1 && one(EX, { of: 'teCount', experiment: 'cr', option: 0 }) === 2 && one(EX, { of: 'teCount', experiment: 'own', option: 1 }) === 2, 'thought experiments: Dennett says Mary learns nothing; Searle says the room does not understand; two positions say it does');
const TH = { thinkers: [{ id: 'aristotle', label: 'th.aristotle' }, { id: 'avicenna', label: 'th.avicenna' }, { id: 'aquinas', label: 'th.aquinas' }, { id: 'ubu', label: 'th.ubu', born: 1950, died: 2010, trad: 'african', infl: ['menkiti'] }] };
ok(one(TH, { of: 'influence', a: 'aristotle', b: 'aquinas' }) === 1 && one(TH, { of: 'influence', a: 'socrates', b: 'rawls' }) === 5 && one(TH, { of: 'influence', a: 'rawls', b: 'plato' }) === -1 && one(TH, { of: 'influence', a: 'menkiti', b: 'ubu' }) === 1, 'influence chains: Aristotle → Aquinas 1; Socrates → Plato → Augustine → Descartes → Locke → Rawls 5; none backwards; a model thinker joins the map');
ok(one(TH, { of: 'overlap', a: 'kant', b: 'hume' }) === 52 && one(TH, { of: 'overlap', a: 'avicenna', b: 'alfarabi' }) === 0, 'lifetimes: Kant and Hume overlap 52 years; al-Fārābī died before Ibn Sīnā was born');
{ const sc = runAll(TH, [{ kind: 'scene', of: 'map', hi: 'aquinas' }]).out.o0; ok(sc.items.filter(i => i.k === 'txt' && i.key).length === 4 && sc.items.some(i => i.k === 'seg' && i.arrow && i.c === 'hi'), 'the map draws a labelled lifeline per model thinker and highlights the influences on Aquinas'); }
ok(JSON.stringify(L.keys(spec(TH, []))) === JSON.stringify([['th.aristotle', 'model.thinkers[0].label'], ['th.avicenna', 'model.thinkers[1].label'], ['th.aquinas', 'model.thinkers[2].label'], ['th.ubu', 'model.thinkers[3].label']]), 'keys(): the thinkers\' labels');
const AR = { arguments: [{ id: 'mp', premises: ['p -> q', 'p'], conclusion: 'q' }, { id: 'ac', premises: ['p -> q', 'q'], conclusion: 'p' }, { id: 'ds', premises: ['p | q', '~p'], conclusion: 'q' },
  { id: 'cd', premises: ['p | r', 'p -> q', 'r -> s'], conclusion: 'q | s' }, { id: 'da', premises: ['p -> q', '~p'], conclusion: '~q' }, { id: 'bad', premises: ['p ->'], conclusion: 'q' }] };
const A = (a, w) => one(AR, { of: w, argument: a });
ok(A('mp', 'valid') === 1 && A('mp', 'form') === 1 && A('ac', 'valid') === 0 && A('ac', 'counter') === 1 && A('ac', 'form') === -1 && A('ds', 'form') === 4 && A('cd', 'form') === 5 && A('cd', 'valid') === 1 && A('da', 'form') === -2, 'arguments through logic@1: modus ponens valid; affirming the consequent invalid with one countermodel; disjunctive syllogism, constructive dilemma, denying the antecedent recognised');
ok(Number.isNaN(A('bad', 'valid')) && codes(AR, { of: 'valid', argument: 'bad' }).includes('parse'), 'a premise logic@1 cannot parse: NaN + parse');

// ---- 8. the checker: codes, and JS ↔ Python parity on the fixtures ----
ok(hasErr(spec({ cases: [{ id: 'x' }] }, []), 'value', /cases\[0\]$/) && hasErr(spec({ cases: [{ id: 'x', preset: 'switch' }, { id: 'x', preset: 'loop' }] }, []), 'duplicate'), 'a case needs a preset or kAct and kNot; ids are unique');
ok(hasErr(spec({ elections: [{ id: 'e', candidates: ['a', 'b'], ballots: [{ n: 1, rank: ['a', 'z'] }] }] }, []), 'ref') && hasErr(spec({ elections: [{ id: 'e', candidates: ['a', 'b'], ballots: [{ n: 1, rank: ['a', 'a'] }] }] }, []), 'duplicate') && hasErr(spec({ elections: [{ id: 'e', candidates: ['a', 'b'], axis: ['a'], ballots: [{ n: 1, rank: ['a'] }] }] }, []), 'value', /axis/), 'ballots name known candidates once; an axis has every candidate');
ok(hasErr(spec({}, [{ id: 'x', kind: 'scalar', of: 'nope' }]), 'output') && hasErr(spec(EL, [{ id: 'x', kind: 'scalar', of: 'margin', election: 'tn', a: 'M', b: 'Q' }]), 'ref') && hasErr(spec(EL, [{ id: 'x', kind: 'scalar', of: 'criterion', election: 'tn', method: 'borda', criterion: 'iia' }]), 'value'), 'unknown outputs, unknown candidates, iia without other');
ok(hasErr(spec({ profiles: [{ id: 'p', scheme: 'confucian', traits: { courage: 0 } }] }, []), 'value', /traits\.courage/) && hasErr(spec(EX, [{ id: 'x', kind: 'scalar', of: 'teAnswer', experiment: 'm', position: 'kant' }]), 'ref'), 'traits belong to the scheme; positions to the experiment');
ok(hasErr(spec({}, [{ id: 'x', kind: 'scalar', of: 'ipd', strategy: 'tft', what: 'mean' }]), 'value') && hasErr(spec({ thinkers: [{ id: 'nobody' }] }, []), 'value') && hasErr(spec({ problems: [{ id: 'p', acts: ['a', 'b'], states: ['s'], u: [[1]], pAct: [[1], [1]], pCause: [1] }] }, []), 'size'), 'a tournament output needs the tournament; a new thinker needs dates; a problem\'s tables fit its acts and states');
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'philo.json'), 'utf8')).specs;
{
  const js = FIX.map(s => { const p = L.checkSpec(s), bad = p.some(q => q.level === 'error'); return { p, x: bad ? null : L.exprs(s), k: bad ? null : L.keys(s) }; });
  const pr = JSON.parse(execFileSync('python3', ['-c', `import json,sys,lib_philo as M
out=[]
for s in json.loads(sys.stdin.read()):
    p=M.check_spec(s); bad=any(q['level']=='error' for q in p)
    out.append({'p':p,'x':None if bad else [list(t) for t in M.exprs(s)],'k':None if bad else [list(t) for t in M.keys(s)]})
print(json.dumps(out))`], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify(FIX), encoding: 'utf8', maxBuffer: 1 << 26 }));
  let same = 0; js.forEach((r, i) => { if (JSON.stringify(r) === JSON.stringify(pr[i])) same++; else console.log(`  spec ${i}\n  JS ${JSON.stringify(r).slice(0, 500)}\n  PY ${JSON.stringify(pr[i]).slice(0, 500)}`); });
  ok(FIX.length >= 20 && same === FIX.length, `JS and Python agree on ${same}/${FIX.length} fixture specs (checkSpec, exprs, keys)`);
  const good = FIX.filter(s => !L.checkSpec(s).some(q => q.level === 'error')).length;
  ok(good >= 8 && FIX.length - good >= 8, `the fixtures hold good (${good}) and bad (${FIX.length - good}) specs`);
  const pyT = JSON.parse(execFileSync('python3', ['-c', 'import json,lib_philo as M; print(json.dumps(M.T))'], { cwd: path.join(ROOT, 'tools'), encoding: 'utf8', maxBuffer: 1 << 26 }));
  ok(JSON.stringify(pyT) === JSON.stringify(L.TABLES), 'the Python twin carries the same tables as the engine');
  // every code of the checker appears in the fixtures
  const seen = new Set(js.flatMap(r => r.p.map(q => q.code)));
  ok(['format', 'value', 'enum', 'size', 'unknown-field', 'output', 'ref', 'duplicate'].every(c => seen.has(c)), 'the fixtures cover every checker code: ' + [...seen].sort().join(', '));
}

// ---- 9. the sim adapter, the Worker, speed ----
{
  const s = spec(EL, [{ id: 'w', kind: 'scalar', of: 'winner', election: 'tn', method: 'irv' }, { id: 'sc', kind: 'series', of: 'scores', election: 'tn', method: 'borda' }, { id: 'g', kind: 'scene', of: 'majority', election: 'tn' }]);
  const r = L.engine.create(s, { seed: 3 }).run({});
  ok(r.w === 3 && JSON.stringify(r.sc) === '[126,194,173,107]' && r.g.items.length > 0 && L.engine.check(s).length === 0, 'engine.create(spec).run(inputs) gives the declared outputs (IRV Knoxville, Borda series, a scene)');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + L.engine.workerSource, ctx);
  const wr = ctx.self.noemaEngine.create(s, { seed: 3 }).run({});
  ok(JSON.stringify(wr) === JSON.stringify(r), 'the Worker source in a fresh global gives the same outputs');
  const sa = spec(Object.assign({}, AR, G), [{ id: 'v', kind: 'scalar', of: 'valid', argument: 'cd' }, { id: 'i', kind: 'scalar', of: 'ipd', strategy: 'tft', what: 'share' }]);
  const wa = ctx.self.noemaEngine.create(sa, { seed: 3 }).run({}), pa = L.engine.create(sa, { seed: 3 }).run({});
  ok(!!ctx.self.NoemaLibLogic && !!ctx.self.NoemaSimKit && wa.v === 1 && wa.i === pa.i, 'the Worker carries logic@1 and NoemaSimKit: arguments and seeded tournaments agree');
  const param = spec({ populations: [{ id: 'A', groups: [{ n: 'na', w: 100 }] }, { id: 'Z', groups: [{ n: 1e7, w: 'wz' }] }] }, [{ id: 'c', kind: 'scalar', of: 'compare', a: 'A', b: 'Z', rule: 'total' }]);
  const en = L.engine.create(param, {});
  ok(en.run({ na: 1000, wz: 0.1 }).c === -1 && en.run({ na: 1e5, wz: 0.1 }).c === 1, 'numbers of the model may be expressions over the spec\'s names');
  ok(JSON.stringify(L.exprs(param)) === JSON.stringify([['na', 'model.populations[0].groups[0].n', []], ['wz', 'model.populations[1].groups[0].w', []]]), 'exprs() lists them with their paths');
  let t0 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) L.run(s, {}, {}); const typ = Number(process.hrtime.bigint() - t0) / 20 / 1e6;
  const worst = spec({ elections: [{ id: 'e', candidates: ['a', 'b', 'c', 'd', 'e', 'f'], ballots: Array.from({ length: 64 }, (_, i) => ({ n: 1 + (i % 7), rank: ['a', 'b', 'c', 'd', 'e', 'f'].sort((x, y) => ((x.charCodeAt(0) * (i + 3)) % 11) - ((y.charCodeAt(0) * (i + 3)) % 11)) })) }],
    games: [{ id: 'pd', preset: 'pd' }], tournament: { game: 'pd', strategies: L.TABLES.STRATS, rounds: 2000, reps: 3, gens: 2000, noise: 0.01 } },
    [{ id: 'm', kind: 'scalar', of: 'manipulable', election: 'e', method: 'irv' }, { id: 'k', kind: 'scalar', of: 'winner', election: 'e', method: 'kemeny' }, { id: 'mo', kind: 'scalar', of: 'criterion', election: 'e', method: 'irv', criterion: 'monotonic' }, { id: 't', kind: 'scalar', of: 'ipd', strategy: 'tft', what: 'share' }]);
  t0 = process.hrtime.bigint(); const wres = L.run(worst, {}, { seed: 1 }); const wt = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(typ < 50 && wt < 2000, `speed: a typical run ${typ.toFixed(2)} ms (< 50), the worst allowed ${wt.toFixed(0)} ms (< 2000)`);
  ok(Object.values(wres.out).every(v => typeof v === 'number'), 'the worst case still returns numbers (or NaN with a budget code): ' + JSON.stringify(wres.out) + ' ' + JSON.stringify(wres.codes));
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
