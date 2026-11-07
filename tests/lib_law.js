/* law@1 (engine/src/48_lib_law.js, docs/library/law.md): published reference values (Carneades DSL's murder example, van Gijzel &
   Nilsson 2014; the Talmud's estate division, Aumann & Maschler 1985; the Minbariyya ʿawl case; the EEC 1958 Council's voting power,
   Felsenthal & Machover 1998; USSG level 20 / category I; Kaplan's threshold with Blackstone's ratio; the MPC homicide ladder; Byrne v
   Van Tienhoven vs CISG 16(1); EU Reg. 1182/71 month ends; Hart's vehicles in the park; the Nixon diamond in ASPIC+), every edge case
   and its code, the check codes, JS ↔ Python parity on tests/fixtures/enginelib/law.json, the schema of the author's form, the sim
   adapter, the Worker source, speed, and the reference activity vehicles-in-the-park.  Run: node tests/lib_law.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol, `${m}: ${a} ≈ ${b} (± ${tol})`);
globalThis.window = globalThis;
for (const f of ['35_simexpr.js', '46_lib_core.js', '46_lib_schema.js', '47_lib_logic.js', '48_lib_law.js']) require(path.join(SRC, f));
const X = globalThis.NoemaLibLaw;
const sc = (id, of, f) => Object.assign({ id, kind: 'scalar', of }, f || {});
const R = (model, outputs, env) => X.run({ model, outputs }, env || {}, {});
const has = (r, c) => r.codes.includes(c);
const flag = c => sc('f_' + c, 'flag', { code: c });

// ---- 1. statutes as defeasible rules (Antoniou et al. 2001; Hart 1958) ----
{ const tw = { task: 'rules', query: 'flies', rules: [{ id: 'r1', if: ['bird'], then: 'flies' }, { id: 'r2', if: ['penguin'], then: '~flies' }, { id: 's1', if: ['penguin'], then: 'bird', kind: 'strict' }] };
  let r = R({ ...tw, facts: ['bird'] }, [sc('h', 'holds')]); ok(r.out.h === 1, 'Tweety: a bird flies (+∂ flies)');
  r = R({ ...tw, facts: ['penguin'], sup: [{ win: 'r2', lose: 'r1' }] }, [sc('h', 'holds'), sc('rf', 'refuted'), sc('s', 'status', { at: 'r1' })]);
  ok(r.out.h === 0 && r.out.rf === 1 && r.out.s === 1, 'Tweety (Antoniou et al. 2001): with r2 > r1 a penguin does not fly; r1 is applicable but defeated (status 1)');
  r = R({ ...tw, facts: ['penguin'], order: ['posterior'] }, [sc('h', 'holds'), sc('u', 'undecided'), flag('unresolved')]);
  ok(r.out.h === 0 && r.out.u === 0 && r.out.f_unresolved === 1, 'with no priority between r1 and r2 the conflict is unresolved: neither flies nor ¬flies (ambiguity blocking), code unresolved'); }
{ const th = { task: 'rules', query: 'p', facts: ['a'], rules: [{ id: 'old', if: ['a'], then: 'p', issued: 1990 }, { id: 'new', if: ['a'], then: '~p', issued: 2020 }, { id: 'top', if: ['a'], then: 'p', rank: 2, on: 'k' }] };
  ok(R(th, [sc('h', 'refuted')], { k: 0 }).out.h === 1, 'lex posterior: the later rule wins');
  ok(R(th, [sc('h', 'holds')], { k: 1 }).out.h === 1, 'lex superior: a higher-ranked rule beats the later one (and its team carries p)');
  ok(R({ ...th, sup: [{ win: 'old', lose: 'new' }] }, [sc('h', 'holds')], { k: 0 }).out.h === 1, 'an explicit superiority wins over the derived ones'); }
{ const r = R({ task: 'rules', query: 'p', rules: [{ id: 'a', if: ['q'], then: 'p' }, { id: 'b', if: ['p'], then: 'q' }] }, [sc('u', 'undecided'), flag('undecided')]);
  ok(r.out.u === 1 && r.out.f_undecided === 1, 'a positive loop p ⇐ q ⇐ p with no facts: neither +∂ nor −∂ in the basic proof theory, code undecided (Maher 2001 notes the loop)');
  const r2 = R({ task: 'rules', query: 'p', facts: ['x'], rules: [{ id: 'a', if: ['q'], then: 'p' }, { id: 'b', if: ['p'], then: 'q' }, { id: 'c', if: ['x'], then: '~q' }, { id: 'd', if: ['p'], then: 'q' }] }, [sc('h', 'holds')]);
  ok(r2.out.h === 0, 'positive loops do not prove anything');
  const r3 = R({ task: 'rules', query: 'p', facts: ['p', '~p'], rules: [] }, [sc('d', 'definite'), flag('inconsistent')]);
  ok(r3.out.d === 1 && r3.out.f_inconsistent === 1, 'contradictory strict facts: code inconsistent'); }
{ const sp = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/activities_examples/vehicles-in-the-park/spec.json'), 'utf8'));
  const run = v => X.engine.create(sp).run(Object.assign({ car: false, ambulance: false, emergency: false, memorial: false, bicycle: false }, v));
  ok(run({ car: true }).forb === 1 && run({ car: true }).r1s === 2, 'Hart: a car is forbidden (the ban fires)');
  ok(run({ ambulance: true, emergency: true }).forb === 0 && run({ ambulance: true, emergency: true }).r1s === 1, 'Hart: an ambulance on call: the specific emergency rule defeats the ban');
  ok(run({ memorial: true }).forb === 0 && run({ memorial: true }).r1s === 1, 'Hart: the war memorial: the exception (a defeater) defeats the ban');
  ok(run({ bicycle: true }).r1s === 0, 'Hart: a bicycle is not a vehicle under the by-law (the ranked definition beats ordinary speech): the ban does not apply');
  ok(run({ car: true, bicycle: true }).defeated === 1, 'a car and a bicycle: vehicle is strict (+Δ), so the definition rule r5 is defeated'); }

// ---- 2. ASPIC+ and schemes (Modgil & Prakken 2013; Walton et al. 2008) ----
{ const nix = { task: 'aspic', query: 'pacifist', premises: [{ lit: 'quaker', kind: 'axiom' }, { lit: 'republican', kind: 'axiom' }], rules: [{ id: 'q', if: ['quaker'], then: 'pacifist' }, { id: 'rp', if: ['republican'], then: '~pacifist' }] };
  let r = R(nix, [sc('a', 'accepted'), sc('c', 'credulous'), sc('n', 'arguments'), sc('d', 'defeats')]);
  ok(r.out.a === 0 && r.out.c === 0 && r.out.n === 4 && r.out.d === 2, 'Nixon diamond (grounded): 4 arguments, two mutual rebuttals, pacifist not justified');
  r = R({ ...nix, semantics: 'preferred' }, [sc('a', 'accepted'), sc('c', 'credulous'), sc('e', 'extensions')]);
  ok(r.out.a === 0 && r.out.c === 1 && r.out.e === 2, 'Nixon diamond (preferred): two extensions, pacifist credulously but not skeptically accepted');
  r = R({ ...nix, rules: [{ id: 'q', if: ['quaker'], then: 'pacifist', rank: 1 }, { id: 'rp', if: ['republican'], then: '~pacifist', rank: 2 }] }, [sc('a', 'accepted'), sc('s', 'status', { at: 'rp' }), sc('d', 'defeats')]);
  ok(r.out.a === 0 && r.out.s === 1 && r.out.d === 1, 'last-link preference: the stronger rule\'s argument is not defeated by the weaker rebuttal');
  const ex = { task: 'aspic', query: 'claim', premises: [{ lit: 'said' }], schemes: [{ id: 'ex', scheme: 'expert', if: ['said'], then: 'claim', cqs: [{ cq: 'trustworthy', on: 'k' }] }] };
  ok(R(ex, [sc('a', 'accepted')], { k: 0 }).out.a === 1 && R(ex, [sc('a', 'accepted')], { k: 1 }).out.a === 0, 'argument from expert opinion: accepted; a raised critical question (trustworthy) undercuts it');
  r = R({ task: 'aspic', query: 'p', premises: [{ lit: 'x', kind: 'axiom' }], rules: [{ id: 'r1', if: ['x'], then: '~r2' }, { id: 'r2', if: ['x'], then: '~r3' }, { id: 'r3', if: ['x'], then: '~r1' }], semantics: 'stable' }, [sc('e', 'extensions'), flag('no-stable')]);
  ok(r.out.e === 0 && r.out['f_no-stable'] === 1 && has(r, 'no-stable'), 'an odd cycle of undercutters has no stable extension: code no-stable');
  r = R({ task: 'aspic', query: 'b', premises: [{ lit: 'a', kind: 'ordinary', rank: 0 }, { lit: '~a', kind: 'ordinary', rank: 1 }], rules: [{ id: 'r', if: ['a'], then: 'b' }] }, [sc('a', 'accepted')]);
  ok(r.out.a === 0, 'undermining: a stronger ordinary premise ¬a defeats the argument for b on its premise a');
  const big = { task: 'aspic', premises: Array.from({ length: 30 }, (_, i) => ({ lit: 'p' + i })), rules: Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, if: ['p' + i], then: 'q' })).concat(Array.from({ length: 30 }, (_, i) => ({ id: 'z' + i, if: ['q', 'p' + i], then: 'w' + i }))) };
  const t0 = Date.now(); r = R(big, [sc('n', 'arguments')]); ok(r.out.n === 400 && has(r, 'budget') && Date.now() - t0 < 2000, `ASPIC+ stops at 400 arguments with code budget (${Date.now() - t0} ms)`); }

// ---- 3. Carneades (Gordon, Prakken & Walton 2007; CarneadesDSL, van Gijzel & Nilsson 2014) ----
{ const mur = { task: 'carneades', query: 'murder', args: [{ id: 'arg1', if: ['kill', 'intent'], then: 'murder', weight: 0.8 }, { id: 'arg2', if: ['witness'], unless: ['unreliable'], then: 'intent', weight: 'w' }, { id: 'arg3', if: ['witness2'], unless: ['unreliable2'], then: '~intent', weight: 0.8 }], assume: ['kill', 'witness', 'witness2', 'unreliable2'], standards: [{ lit: 'intent', ps: 'brd' }] };
  let r = R(mur, [sc('a', 'acceptable'), sc('n', 'negation'), sc('s2', 'status', { at: 'arg2' }), sc('s3', 'status', { at: 'arg3' }), sc('s1', 'status', { at: 'arg1' })], { w: 0.3 });
  ok(r.out.a === 0 && r.out.n === 0 && r.out.s2 === 1 && r.out.s3 === 0 && r.out.s1 === 0, 'CarneadesDSL murder example: arg2 applicable, arg3 not (exception assumed); intent fails BRD (0.3 < α = 0.4), so neither murder nor ¬murder');
  r = R(mur, [sc('a', 'acceptable')], { w: 0.75 }); ok(r.out.a === 1, '… with arg2 weighing 0.75 (> α, margin > β, no con < γ) intent is proved beyond reasonable doubt and murder is acceptable');
  const one = (ps, pro, con) => R({ task: 'carneades', query: 'p', args: [{ id: 'a', if: ['x'], then: 'p', weight: pro }, { id: 'b', if: ['y'], then: '~p', weight: con }], assume: ['x', 'y'], standards: [{ lit: 'p', ps }] }, [sc('a', 'acceptable')]).out.a;
  ok(one('scintilla', 0.1, 0.9) === 1 && one('preponderance', 0.6, 0.5) === 1 && one('preponderance', 0.5, 0.5) === 0 && one('clear-convincing', 0.8, 0.45) === 1 && one('clear-convincing', 0.8, 0.55) === 0 && one('brd', 0.9, 0.1) === 1 && one('brd', 0.9, 0.25) === 0 && one('dv', 0.9, 0.1) === 0,
    'the five proof standards: scintilla, preponderance (strict), clear and convincing (α, β), beyond reasonable doubt (γ), dialectical validity');
  r = R({ task: 'carneades', query: 'p', args: [{ id: 'a', then: 'p', weight: 1.5 }] }, [sc('a', 'acceptable')]); ok(r.out.a === 1 && has(r, 'weight'), 'a weight outside 0–1 is clamped: code weight'); }

// ---- 4. Hohfeld (1913, 1917) ----
{ const H = X.hohCanon, k = c => c.slice(0, 4).join('|');
  const corr = [['right', 'duty'], ['privilege', 'noright'], ['power', 'liability'], ['immunity', 'disability']];
  ok(corr.every(([a, b]) => { const x = H(a, 'A', 'B', 'p'), y = H(b, 'B', 'A', b === 'noright' ? '~p' : 'p'); return k(x) === k(y) && x[4] === y[4]; }), 'the four correlatives are one fact read from the other party (right–duty, privilege–no-right, power–liability, immunity–disability)');
  const opp = [['right', 'noright'], ['privilege', 'duty'], ['power', 'disability'], ['immunity', 'liability']];
  ok(opp.every(([a, b]) => { const x = H(a, 'A', 'B', 'p'), y = H(b, 'A', 'B', a === 'privilege' ? '~p' : 'p'); return k(x) === k(y) && x[4] !== y[4]; }), 'the four opposites are one fact with the other value (right–no-right, privilege–duty, power–disability, immunity–liability)');
  let r = R({ task: 'hohfeld', positions: [{ kind: 'right', holder: 'A', other: 'B', act: 'pay' }], ask: { kind: 'duty', holder: 'B', other: 'A', act: 'pay' } }, [sc('h', 'holds'), sc('p', 'positions'), sc('d', 'derived')]);
  ok(r.out.h === 1 && r.out.p === 4 && r.out.d === 3, 'A\'s right that B pay: 4 descriptions (right, duty, and by SDL D B\'s privilege to pay with A\'s no-right that B not pay), 3 of them derived');
  r = R({ task: 'hohfeld', positions: [{ kind: 'right', holder: 'A', other: 'B', act: 'pay' }, { kind: 'privilege', holder: 'B', other: 'A', act: '~pay' }] }, [sc('c', 'contradictions')]);
  ok(r.out.c === 1 && has(r, 'contradiction'), 'a duty and the opposite privilege: code contradiction');
  r = R({ task: 'hohfeld', positions: [{ kind: 'duty', holder: 'B', other: 'A', act: 'go' }, { kind: 'duty', holder: 'B', other: 'A', act: '~go' }] }, [sc('c', 'conflicts')]);
  ok(r.out.c === 1 && has(r, 'conflict'), 'a duty to do and a duty not to do: a conflict of duties (inconsistent in SDL), code conflict');
  r = R({ task: 'hohfeld', positions: [{ kind: 'power', holder: 'A', other: 'B', act: 'assign' }], ask: { kind: 'immunity', holder: 'B', other: 'A', act: 'assign' } }, [sc('h', 'holds')]);
  ok(r.out.h === 0, 'a power of A over B excludes B\'s immunity against A');
  ok(R({ task: 'hohfeld', positions: [{ kind: 'power', holder: 'A', other: 'B', act: 'assign' }], ask: { kind: 'right', holder: 'B', other: 'A', act: 'x' } }, [sc('h', 'holds')]).out.h === 0.5, 'nothing said: 0.5 (undetermined)'); }

// ---- 5. burdens and standards of proof ----
{ let r = R({ task: 'proof', issues: [{ id: 'g', p: 0.9, standard: 'decision' }], costs: { fp: 10, fn: 1 } }, [sc('t', 'threshold'), sc('e', 'established')]);
  near(r.out.t, 10 / 11, 1e-12, 'Kaplan 1968 with Blackstone\'s 10:1: convict iff p > 10/11'); ok(r.out.e === 0, '… so p = 0.9 is not enough');
  r = R({ task: 'proof', issues: [{ id: 'c', prior: 0.01, lr: [100, 10], standard: 'brd' }] }, [sc('p', 'posterior'), sc('e', 'established')]);
  near(r.out.p, 1000 / 1099, 1e-12, 'Bayes: prior 1 % (odds 1/99), likelihood ratios 100 and 10 → posterior odds 1000/99'); ok(r.out.e === 1, '… above 0.9 (BRD)');
  r = R({ task: 'proof', issues: [{ id: 'a', p: 0.6 }, { id: 'b', p: 0.6 }], aggregate: 'element' }, [sc('c', 'claim'), sc('pr', 'product')]);
  ok(r.out.c === 1 && Math.abs(r.out.pr - 0.36) < 1e-12 && has(r, 'conjunction'), 'the conjunction paradox (Cohen 1977): each element > ½, the product 0.36 < ½; decided element by element, code conjunction');
  ok(R({ task: 'proof', issues: [{ id: 'a', p: 0.6 }, { id: 'b', p: 0.6 }], aggregate: 'product' }, [sc('c', 'claim')]).out.c === 0, '… decided on the product, the claim fails');
  const pres = mode => ({ task: 'proof', issues: [{ id: 'base', p: 0.9 }, { id: 'x', presumed: 'base', mode, p: 0.4, rebut: 'k' }], query: 'x' });
  ok(R(pres('thayer'), [sc('e', 'established')], { k: 0 }).out.e === 1 && R(pres('thayer'), [sc('e', 'established')], { k: 1 }).out.e === 0, 'Thayer (FRE 301): the presumption stands until rebutting evidence is produced, then the bubble bursts (p 0.4 decides)');
  ok(R(pres('morgan'), [sc('e', 'established')], { k: 0 }).out.e === 0, 'Morgan: the persuasion shifts; the opponent shows 1 − 0.4 = 0.6 > ½ against, which disproves the presumed fact');
  ok(R({ ...pres('morgan'), issues: [{ id: 'base', p: 0.9 }, { id: 'x', presumed: 'base', mode: 'morgan', p: 0.55 }] }, [sc('e', 'established')]).out.e === 1, 'Morgan: the opponent shows only 0.45 against: the presumed fact stands');
  r = R({ task: 'proof', issues: [{ id: 'a', p: 1.2, burden: 'defendant' }] }, [sc('e', 'established'), sc('w', 'winner')]);
  ok(r.out.e === 0 && r.out.w === 1 && has(r, 'probability'), 'a probability over 1: code probability; the burden-bearing defendant loses the issue (winner 1 = claimant)'); }

// ---- 6. cases: HYPO / CATO / Horty ----
{ const base = { task: 'cases', factors: [{ id: 'F6', side: 'p' }, { id: 'F15', side: 'p' }, { id: 'F16', side: 'd' }, { id: 'F1', side: 'd' }, { id: 'F21', side: 'p' }],
    cases: [{ id: 'A', factors: ['F6', 'F16'], outcome: 'p' }, { id: 'B', factors: ['F15', 'F1', 'F16'], outcome: 'd' }, { id: 'C', factors: ['F6', 'F15', 'F16', 'F1'], outcome: 'p', reason: ['F6'] }] };
  let r = R({ ...base, facts: ['F6', 'F15', 'F16'], side: 'p' }, [sc('f', 'forced'), sc('o', 'onPoint'), sc('m', 'mostOnPoint'), sc('b', 'best'), sc('d', 'distinctions', { at: 'B' }), sc('s', 'shared', { at: 'C' })]);
  ok(r.out.f === 1, 'a fortiori (result model): A for π with {F6} vs {F16} binds a situation with F6, F15 against F16');
  ok(r.out.o === 3 && r.out.m === 1 && r.out.b === 1 && r.out.s === 3, 'HYPO: 3 on-point cases; C shares all three factors, the most on point and the best for π');
  ok(r.out.d === 2, 'CATO distinctions of B (δ): its pro-δ factor F1 is absent, and the situation\'s pro-π F6 is not in B');
  r = R({ ...base, facts: ['F15', 'F16', 'F1'], side: 'd', reasoning: 'reason' }, [sc('f', 'forced'), sc('c', 'consistent'), sc('p', 'permissible')]);
  ok(r.out.f === -1 && r.out.c === 1 && r.out.p === 1, 'reason model: B forces δ in {F15, F16, F1}; C (π) with its narrow reason {F6} binds neither B nor this case; the base is consistent and deciding for δ is permissible');
  const inc = R({ task: 'cases', factors: base.factors, cases: [{ id: 'X', factors: ['F6', 'F16'], outcome: 'p' }, { id: 'Y', factors: ['F6', 'F15', 'F16'], outcome: 'd' }], facts: ['F6'], side: 'd' }, [sc('c', 'consistent'), sc('p', 'permissible')]);
  ok(inc.out.c === 0 && has(inc, 'inconsistent'), 'Horty 2011: Y (δ) has more for π than X (π) and no more for δ: an inconsistent case base');
  const pm = R({ task: 'cases', factors: base.factors, cases: [{ id: 'X', factors: ['F6', 'F16'], outcome: 'p' }], facts: ['F6', 'F15', 'F16'] }, [sc('p', 'permissible')]);
  const pm2 = R({ task: 'cases', factors: base.factors, cases: [{ id: 'X', factors: ['F6', 'F16'], outcome: 'p' }], facts: ['F6', 'F15', 'F16'], side: 'd' }, [sc('p', 'permissible')]);
  ok(pm.out.p === 1 && pm2.out.p === 0, 'a decision for π is permissible, for δ it is not (the precedent forces π)');
  ok(has(R({ ...base, facts: ['F21'] }, [sc('o', 'onPoint')]), 'no-precedent'), 'no on-point case: code no-precedent'); }

// ---- 7. time (EU Reg. 1182/71; FRCP 6(a); BGB §§187–193) ----
{ const D = (m, o) => R(Object.assign({ task: 'deadline' }, m), o || [sc('y', 'endY'), sc('m', 'endM'), sc('d', 'endD'), sc('w', 'weekday')]);
  let r = D({ start: '2023-01-31', period: { n: 1, unit: 'months' }, roll: 'none' }); ok(r.out.y === 2023 && r.out.m === 2 && r.out.d === 28 && has(r, 'month-end'), '31 Jan 2023 + 1 month = 28 Feb 2023 (the month\'s last day, EU 1182/71 Art. 3(2)(c)), code month-end');
  r = D({ start: '2024-01-31', period: { n: 1, unit: 'months' }, roll: 'none' }); ok(r.out.d === 29, '… 29 Feb in a leap year');
  r = D({ start: '2024-01-31', period: { n: 1, unit: 'months' }, roll: 'none', monthEnd: 'next' }); ok(r.out.m === 3 && r.out.d === 2, '… or the overflow (monthEnd next): 2 Mar 2024');
  r = D({ start: '2024-02-29', period: { n: 1, unit: 'years' }, roll: 'none' }); ok(r.out.m === 2 && r.out.d === 28, '29 Feb 2024 + 1 year = 28 Feb 2025');
  r = D({ start: '2024-06-12', period: { n: 10, unit: 'days' } }); ok(r.out.m === 6 && r.out.d === 24 && has(r, 'rolled') && r.out.w === 1, '10 days from Wed 12 Jun 2024 end Sat 22 Jun → rolled to Mon 24 Jun (FRCP 6(a)(1)(C)), code rolled');
  r = D({ start: '2024-06-12', period: { n: 10, unit: 'days' }, excludeStart: false, roll: 'none' }); ok(r.out.d === 21, 'counting the start day (excludeStart false): 21 Jun');
  r = D({ start: '2024-03-01', period: { n: 10, unit: 'business' }, holidays: ['2024-03-08'] }, [sc('d', 'endD'), sc('b', 'businessDays')]); ok(r.out.d === 18 && r.out.b === 10, '10 business days from Fri 1 Mar 2024 with a holiday on 8 Mar: Mon 18 Mar');
  r = D({ start: '2024-03-01', period: { n: 2, unit: 'business' }, weekend: [5, 6] }, [sc('d', 'endD')]); ok(r.out.d === 4, 'a Friday–Saturday weekend (as data): 2 business days from Fri 1 Mar = Mon 4 Mar');
  r = D({ start: '2020-01-01', period: { n: 3, unit: 'years' }, tolling: [{ from: '2020-03-16', to: '2020-06-30' }], roll: 'none' }, [sc('y', 'endY'), sc('m', 'endM'), sc('d', 'endD'), sc('t', 'tolled')]);
  ok(r.out.t === 107 && r.out.y === 2023 && r.out.m === 4 && r.out.d === 18 && has(r, 'tolled'), 'a 3-year limitation from 1 Jan 2020 tolled 16 Mar – 30 Jun 2020 (107 days) ends 18 Apr 2023, code tolled');
  r = D({ start: '2020-01-01', period: { n: 6, unit: 'years' }, tolling: [{ from: '2020-02-01', to: '2025-12-31' }], longstop: { n: 10, unit: 'years' }, asOf: 4000 }, [sc('y', 'endY'), sc('x', 'expired'), sc('l', 'longstopEnd')]);
  ok(r.out.y === 2030 && r.out.x === 1 && has(r, 'longstop') && Number.isFinite(r.out.l), 'tolling past the long-stop: the period ends at the long-stop (1 Jan 2030), so a claim on day 4000 is expired, code longstop');
  r = D({ start: '2024-01-01', period: { n: 30, unit: 'days' }, asOf: 'k' }, [sc('x', 'expired'), sc('rm', 'remaining')]);
  ok(X.run({ model: { task: 'deadline', start: '2024-01-01', period: { n: 30, unit: 'days' }, asOf: 'k' }, outputs: [sc('x', 'expired'), sc('rm', 'remaining')] }, { k: 40 }, {}).out.x === 1, 'a claim brought on day 40 of a 30-day period is expired (code expired)');
  ok(X.dayOf('2023-02-29') === null && X.dayOf('2000-02-29') !== null && X.dayOf('1900-02-29') === null && X.weekdayOf(X.dayOf('2024-11-07')) === 4, 'dates: 2023-02-29 and 1900-02-29 do not exist, 2000-02-29 does; 7 Nov 2024 is a Thursday'); }

// ---- 8. contracts ----
{ const ev = [{ kind: 'offer', by: 'A', t: 0, arrive: 1 }, { kind: 'revocation', by: 'A', t: 2, arrive: 5 }, { kind: 'acceptance', by: 'B', t: 3, arrive: 6 }];
  let r = R({ task: 'contract', events: ev }, [sc('f', 'formed'), sc('t', 'formedAt')]);
  ok(r.out.f === 1 && r.out.t === 3 && has(r, 'in-transit'), 'Byrne v Van Tienhoven (1880): the acceptance posted before the revocation arrived forms the contract on dispatch (mailbox rule), code in-transit');
  r = R({ task: 'contract', events: ev, acceptRule: 'receipt' }, [sc('f', 'formed'), sc('t', 'formedAt')]);
  ok(r.out.f === 1 && r.out.t === 6, 'CISG 18(2) + 16(1): effective on receipt (6), and the revocation came too late (after dispatch)');
  r = R({ task: 'contract', events: [{ kind: 'offer', by: 'A', t: 0, arrive: 1 }, { kind: 'revocation', by: 'A', t: 1, arrive: 2 }, { kind: 'acceptance', by: 'B', t: 3 }] }, [sc('f', 'formed')]);
  ok(r.out.f === 0 && has(r, 'revoked'), 'a revocation received before the acceptance is sent: no contract, code revoked');
  ok(R({ task: 'contract', firm: true, events: [{ kind: 'offer', by: 'A', t: 0, arrive: 1 }, { kind: 'revocation', by: 'A', t: 1, arrive: 2 }, { kind: 'acceptance', by: 'B', t: 3 }] }, [sc('f', 'formed')]).out.f === 1, 'a firm offer (UCC 2-205; CISG 16(2)) cannot be revoked');
  const terms = (mirror, t) => R({ task: 'contract', mirror, material: ['price', 'qty'], events: [{ kind: 'offer', by: 'A', t: 0, terms: ['price', 'qty'] }, { kind: 'acceptance', by: 'B', t: 1, terms: t }] }, [sc('f', 'formed'), sc('o', 'offers')]);
  r = terms('strict', ['price', 'qty', 'arbitration']); ok(r.out.f === 0 && r.out.o === 2 && has(r, 'counteroffer'), 'mirror-image rule: an acceptance adding a term is a counter-offer');
  r = terms('material', ['price', 'qty', 'arbitration']); ok(r.out.f === 1 && has(r, 'mirror'), 'CISG 19(2): an immaterial addition still accepts, code mirror');
  ok(terms('material', ['qty']).out.f === 0, 'CISG 19(3): a change of price is material: counter-offer');
  r = R({ task: 'contract', events: [{ kind: 'offer', by: 'A', t: 0 }, { kind: 'lapse', t: 5 }, { kind: 'acceptance', by: 'B', t: 6 }] }, [sc('f', 'formed')]); ok(r.out.f === 0 && has(r, 'lapsed') && has(r, 'late'), 'a lapsed offer: a late acceptance forms nothing, codes lapsed and late');
  r = R({ task: 'contract', events: [{ kind: 'offer', by: 'A', t: 0 }, { kind: 'rejection', by: 'B', t: 1 }, { kind: 'acceptance', by: 'B', t: 2 }] }, [sc('f', 'formed')]); ok(r.out.f === 0 && has(r, 'rejected'), 'a rejection ends the offer');
  r = R({ task: 'contract', events: [{ kind: 'offer', by: 'A', t: 0 }, { kind: 'acceptance', by: 'B', t: 1 }], elements: [{ id: 'consideration', holds: 1 }, { id: 'form', holds: 0 }], parties: [{ id: 'B', age: 16 }] }, [sc('f', 'formed'), sc('b', 'binding'), sc('x', 'failed'), sc('v', 'voidable')]);
  ok(r.out.f === 1 && r.out.b === 0 && r.out.x === 2 && r.out.v === 1 && has(r, 'minor'), 'formed but not binding: the 2nd criterion (form) fails; a 16-year-old party (minAge 18 by default) makes it voidable, code minor'); }

// ---- 9. damages ----
{ let r = R({ task: 'damages', items: [{ id: 'lv', kind: 'loss', amount: 1000, avoidable: 200 }, { id: 'lp', kind: 'consequential', amount: 5000, foreseeable: 0 }, { id: 'ca', kind: 'cost-avoided', amount: 100 }] }, [sc('d', 'damages'), sc('m', 'mitigated'), sc('e', 'excluded')]);
  ok(r.out.d === 700 && r.out.m === 200 && r.out.e === 5000 && has(r, 'avoidable') && has(r, 'unforeseeable'), 'Restatement §347: 1000 − 200 avoidable (§350) − 100 cost avoided = 700; the unforeseeable 5000 is excluded (Hadley v Baxendale)');
  r = R({ task: 'damages', price: 100, market: 130, items: [] }, [sc('d', 'damages')]); ok(r.out.d === 30, 'UCC 2-713: market 130 − contract 100 = 30');
  r = R({ task: 'damages', price: 100, market: 130, items: [], liquidated: { amount: 200, ratio: 1.5 } }, [sc('d', 'damages'), sc('l', 'liquidated')]); ok(r.out.d === 30 && has(r, 'penalty') && Number.isNaN(r.out.l), 'a stipulated 200 against an anticipated 30: a penalty, unenforceable (§356)');
  r = R({ task: 'damages', price: 100, market: 130, items: [], liquidated: { amount: 40, ratio: 1.5 } }, [sc('d', 'damages')]); ok(r.out.d === 40, 'a reasonable 40 (≤ 1.5 × 30) is enforced as liquidated damages');
  r = R({ task: 'damages', items: [{ id: 'c', kind: 'cost-avoided', amount: 50 }] }, [sc('d', 'damages')]); ok(r.out.d === 0 && has(r, 'negative'), 'more saved than lost: 0, code negative');
  r = R({ task: 'damages', items: [{ id: 'r', kind: 'reliance', amount: 300 }, { id: 'b', kind: 'benefit', amount: 120 }], measure: 'reliance' }, [sc('d', 'damages'), sc('s', 'restitution')]); ok(r.out.d === 300 && r.out.s === 120, 'reliance (§349) and restitution (§371) measures');
  const I = kind => R({ task: 'damages', items: [{ id: 'l', kind: 'loss', amount: 1000 }], interest: { rate: 0.05, years: 10, kind, per: 1 } }, [sc('i', 'interest')]).out.i;
  near(I('simple'), 500, 1e-9, 'simple interest 5 % × 10 years on 1000'); near(I('compound'), 628.894627, 1e-6, 'compound yearly (1.05¹⁰ − 1)'); near(I('continuous'), 1000 * (Math.E ** 0.5 - 1), 1e-9, 'continuous e^{0.5} − 1'); }

// ---- 10. criminal law (MPC 1962) and sentencing ----
{ const L = { task: 'crime', offences: [{ id: 'murder', mind: 'knowledge', rank: 3, elements: [{ id: 'kill', kind: 'result' }] }, { id: 'manslaughter', mind: 'recklessness', rank: 2, elements: [{ id: 'kill', kind: 'result' }] }, { id: 'negligent', mind: 'negligence', rank: 1, elements: [{ id: 'kill', kind: 'result' }] }], proven: [{ element: 'kill', holds: 1, mind: 'm' }] };
  const lad = [4, 3, 2, 1, 0].map(k => R(L, [sc('o', 'offence')], { m: k }).out.o);
  ok(JSON.stringify(lad) === '[1,1,2,3,0]', 'the homicide ladder (§§210.2–210.4): purpose or knowledge → murder, recklessness → manslaughter, negligence → negligent homicide, none → nothing (§2.02(5): higher satisfies lower)');
  let r = R({ ...L, causation: { butFor: 1, proximate: 0 } }, [sc('l', 'liable')], { m: 4 }); ok(r.out.l === 0 && has(r, 'causation'), 'a result element without proximate cause (§2.03): not liable, code causation');
  r = R({ ...L, defences: [{ id: 'self', kind: 'justification', holds: 1 }] }, [sc('l', 'liable')], { m: 4 }); ok(r.out.l === 0 && has(r, 'defence'), 'self-defence (a justification) bars every offence, code defence');
  r = R({ task: 'crime', offences: [{ id: 'theft', elements: [{ id: 'take', kind: 'conduct' }, { id: 'other', kind: 'circumstance' }] }], proven: [{ element: 'take', holds: 1, mind: 2 }, { element: 'other', holds: 1, mind: 1 }] }, [sc('l', 'liable'), sc('f', 'failed'), sc('q', 'required'), sc('me', 'mens')]);
  ok(r.out.l === 0 && r.out.f === 2 && r.out.q === 2 && r.out.me === 1 && has(r, 'default-mind'), 'no culpability stated: recklessness by default (§2.02(3)); negligence about the circumstance is not enough');
  ok(has(R({ task: 'crime', offences: [{ id: 'sale', grade: 'misdemeanor', elements: [{ id: 's', mind: 'strict' }] }], proven: [{ element: 's', holds: 1 }] }, [sc('l', 'liable')]), 'strict-liability'), 'strict liability outside a violation: code strict-liability (§2.05)');
  const G = { first: 19, cats: [0, 2, 4, 7, 10, 13], rows: [[30, 37, 33, 41, 37, 46, 46, 57, 57, 71, 63, 78], [33, 41, 37, 46, 41, 51, 51, 63, 63, 78, 70, 87]] };
  r = R({ task: 'sentence', grid: G, level: 20, points: 1 }, [sc('lo', 'lo'), sc('hi', 'hi'), sc('c', 'category')]); ok(r.out.lo === 33 && r.out.hi === 41 && r.out.c === 1, 'USSG sentencing table: level 20, 1 point (category I) → 33–41 months');
  r = R({ task: 'sentence', grid: G, level: 19, points: 5, adjust: [{ id: 'role', delta: 1 }] }, [sc('lo', 'lo'), sc('c', 'category')]); ok(r.out.lo === 41 && r.out.c === 3, 'points 5 → category III; a +1 adjustment → level 20: 41–51');
  r = R({ task: 'sentence', grid: G, level: 20, points: 0, max: 36 }, [sc('lo', 'lo'), sc('hi', 'hi')]); ok(r.out.lo === 33 && r.out.hi === 36 && has(r, 'clamped'), 'a statutory maximum of 36 cuts the range (§5G1.1), code clamped');
  r = R({ task: 'sentence', grid: G, level: 25 }, [sc('l', 'level')]); ok(r.out.l === 20 && has(r, 'grid-range'), 'a level beyond the grid: clamped to it, code grid-range'); }

// ---- 11. proportionality (Alexy 2003) ----
{ const P = (w, extra) => R(Object.assign({ task: 'proportionality', weights: w }, extra || {}), [sc('w', 'weight'), sc('b', 'balance'), sc('p', 'proportionate'), sc('s', 'stage')]);
  let r = P({ Ii: 4, Wi: 1, Ri: 1, Ij: 2, Wj: 1, Rj: 1 }); ok(r.out.w === 2 && r.out.b === -1 && r.out.p === 0 && r.out.s === 4, 'a serious interference (4) against a moderate benefit (2): W = 2 > 1, the right prevails (fails at stage 4)');
  r = P({ Ii: 2, Ij: 4, Rj: 0.5 }); ok(r.out.w === 1 && r.out.b === 0 && r.out.p === 1 && has(r, 'stalemate'), 'W = 2 / (4 · ½) = 1: a stalemate, the legislature\'s discretion (code stalemate)');
  r = P({ Ii: 1, Ij: 4 }, { alternatives: [{ id: 'softer', effect: 1, burden: 0.5 }] }); ok(r.out.s === 3 && r.out.p === 0, 'an equally effective, milder alternative: the measure is not necessary (stage 3)');
  r = P({ Ii: 3, Ij: 4 }); ok(has(r, 'scale'), '3 is not on the triadic scale: code scale');
  r = P({ Ii: 64, Ij: 16, Ri: 0.25, scale: undefined }, { scale: 'double' }); ok(r.out.w === 1, 'the double-triadic scale (2⁰…2⁸): 64 · ¼ / 16 = 1');
  r = P({ Ii: 2, Ij: 1 }, { extra: [{ side: 'j', I: 2 }] }); ok(r.out.w === 2 / 3, 'the additive extension: 2 / (1 + 2)'); }

// ---- 12. voting ----
{ const eec = { task: 'vote', voters: [{ id: 'F', weight: 4 }, { id: 'G', weight: 4 }, { id: 'I', weight: 4 }, { id: 'B', weight: 2 }, { id: 'N', weight: 2 }, { id: 'L', weight: 1 }], quota: 12 };
  const r = R(eec, [{ id: 's', kind: 'series', of: 'shapley' }, { id: 'b', kind: 'series', of: 'banzhaf' }, sc('l', 'banzhaf', { at: 'L' })]);
  ok(r.out.s.every((x, i) => Math.abs(x - [14, 14, 14, 9, 9, 0][i] / 60) < 1e-12), 'EEC 1958 Council [12; 4,4,4,2,2,1]: Shapley–Shubik 14/60 and 9/60, Luxembourg 0 (Felsenthal & Machover 1998)');
  ok(r.out.b.every((x, i) => Math.abs(x - [5, 5, 5, 3, 3, 0][i] / 21) < 1e-12) && r.out.l === 0, '… normalised Banzhaf 5/21 and 3/21, Luxembourg a dummy');
  ok(X.banzhafGF([4, 4, 4, 2, 2, 1], 12).every((x, i) => Math.abs(x - r.out.b[i]) < 1e-12), 'generating functions (Brams & Affuso 1976) give the same Banzhaf indices');
  const big = { task: 'vote', voters: Array.from({ length: 30 }, (_, i) => ({ id: 'v' + i, weight: (i % 5) + 1 })), quota: 46 };
  const rb = R(big, [{ id: 'b', kind: 'series', of: 'banzhaf' }]); ok(rb.out.b.length === 30 && Math.abs(rb.out.b.reduce((a, x) => a + x, 0) - 1) < 1e-9 && has(rb, 'budget'), '30 voters: Banzhaf by generating functions; Shapley–Shubik over budget (code)');
  const s = (o, e) => R(Object.assign({ task: 'vote' }, o), [sc('p', 'passes'), sc('q', 'quorate'), sc('n', 'needed')], e);
  ok(s({ members: 100, present: 60, yes: 31, no: 29 }).out.p === 1 && s({ members: 100, present: 60, yes: 30, no: 30 }).out.p === 0, 'simple majority of the votes cast: 31–29 passes, 30–30 fails (a tie)');
  ok(s({ members: 100, present: 60, yes: 30, no: 30, tie: 'chair', chair: 'yes' }).out.p === 1, 'a casting vote breaks the tie');
  ok(s({ members: 100, present: 40, yes: 30, no: 10, quorum: 0.5 }).out.p === 0 && s({ members: 100, present: 40, yes: 30, no: 10, quorum: 0.5 }).out.q === 0, 'below the quorum (40 of 100 < ½): nothing passes, code no-quorum');
  ok(s({ members: 100, present: 70, yes: 40, no: 20, abstain: 10, base: 'members' }).out.p === 0 && s({ members: 100, present: 70, yes: 40, no: 20, abstain: 10, base: 'members' }).out.n === 51, 'an absolute majority of the members needs 51');
  ok(s({ members: 30, yes: 20, no: 10, majority: 2 / 3, strict: false }).out.p === 1 && s({ members: 30, yes: 19, no: 11, majority: 2 / 3, strict: false }).out.p === 0, 'two thirds of the votes cast (≥): 20 of 30 passes, 19 fails');
  ok(s({ members: 10, yes: 5, no: 3, abstain: 2, abstentions: 'no' }).out.p === 0, 'abstentions counted as no: 5 of 10 is not more than half');
  const qmv = (yes) => R({ task: 'vote', voters: Array.from({ length: 27 }, (_, i) => ({ id: 'm' + i, weight: 1, pop: i < 4 ? 15 : 1, yes: yes(i) ? 1 : 0 })), quota: 0, countQuota: 0.55, popQuota: 0.65, blocking: 4 }, [sc('p', 'passes'), flag('blocking')]);
  ok(qmv(i => i >= 3).out.p === 1 && qmv(i => i >= 3).out.f_blocking === 1, 'TEU 16(4): 3 large states block 65 % of the population but are fewer than 4: the qualified majority is deemed attained (code blocking)');
  ok(qmv(i => i >= 4).out.p === 0, '… four large states against do block'); }

// ---- 13. citations ----
{ const c = (text, extra) => R(Object.assign({ task: 'citation', text }, extra || {}), [sc('v', 'valid'), sc('k', 'kind'), sc('y', 'year'), sc('vol', 'volume'), sc('p', 'page'), sc('n', 'number'), sc('d', 'depth')]).out;
  let o = c('ECLI:EU:C:2014:317'); ok(o.v && o.k === 1 && o.y === 2014 && o.n === 317, 'ECLI:EU:C:2014:317 (Google Spain): EU, court C, 2014, 317');
  o = c('[2001] UKHL 15'); ok(o.k === 2 && o.y === 2001 && o.n === 15, '[2001] UKHL 15: a neutral citation');
  o = c('[2019] EWCA Civ 1234'); ok(o.k === 2 && o.n === 1234, '[2019] EWCA Civ 1234: with its division');
  o = c('347 U.S. 483 (1954)'); ok(o.k === 3 && o.vol === 347 && o.p === 483 && o.y === 1954, '347 U.S. 483 (1954): volume, reporter, page, year');
  o = c('5 F.4th 123, 130 (2d Cir. 2021)'); ok(o.k === 3 && o.vol === 5 && o.p === 123 && o.y === 2021, '5 F.4th 123, 130 (2d Cir. 2021): with a pinpoint and the court');
  o = c('BVerfGE 86, 1'); ok(o.k === 4 && o.vol === 86 && o.p === 1, 'BVerfGE 86, 1: a series citation');
  o = c('Art. 6(1)(b) GDPR'); ok(o.k === 5 && o.n === 6 && o.d === 2, 'Art. 6(1)(b) GDPR: article 6, two levels below');
  o = c('§ 823 Abs. 1 BGB'); ok(o.k === 5 && o.n === 823 && o.d === 1, '§ 823 Abs. 1 BGB');
  o = c('s. 14B Limitation Act 1980'); ok(o.k === 5 && o.n === 14, 's. 14B Limitation Act 1980');
  o = c('Smith v Jones, 12 Law Rep 345', { patterns: [{ id: 'own', template: '{a:word} v {b:word}, {volume:int} Law Rep {page:int}' }] }); ok(o.k === 1 && o.vol === 12 && o.p === 345, 'an author template is tried first');
  ok(!c('see the judgment of last week').v && has(R({ task: 'citation', text: 'xx' }, []), 'no-match'), 'a text that is no citation: code no-match');
  ok(!X.template('{a:float}').ok && !X.template('plain').ok && X.template('{y:year}/{n:int}').ok, 'templates: placeholders checked'); }

// ---- 14. succession and division ----
{ const S = (m, o) => R(Object.assign({ task: 'shares' }, m), o);
  let r = S({ estate: 24, heirs: [{ id: 'wife', share: '1/8' }, { id: 'daughters', share: '2/3' }, { id: 'father', share: '1/6' }, { id: 'mother', share: '1/6' }] }, [sc('w', 'share', { at: 'wife' }), sc('a', 'awl'), sc('t', 'total')]);
  near(r.out.w, 1 / 9, 1e-12, 'the Minbariyya case: wife ⅛ + daughters ⅔ + father ⅙ + mother ⅙ = 27/24; by ʿawl the wife\'s eighth becomes a ninth'); ok(r.out.a === 1 && Math.abs(r.out.t - 24) < 1e-9, '… code awl, the whole estate distributed');
  r = S({ estate: 120, heirs: [{ id: 'wife', share: 0.25, radd: false }, { id: 'sister', share: 0.5 }] }, [sc('w', 'amount', { at: 'wife' }), sc('s', 'amount', { at: 'sister' }), sc('r', 'radd')]);
  ok(r.out.w === 30 && r.out.s === 90 && r.out.r === 1, 'radd: the remaining quarter returns to the sister, not the wife (majority view): 30 / 90');
  r = S({ estate: 120, heirs: [{ id: 'wife', share: 0.125 }, { id: 'son', weight: 2 }, { id: 'daughter', weight: 1 }] }, [sc('s', 'amount', { at: 'son' }), sc('d', 'amount', { at: 'daughter' })]);
  ok(Math.abs(r.out.s - 70) < 1e-9 && Math.abs(r.out.d - 35) < 1e-9, 'residuaries 2 : 1 after the wife\'s eighth: son 70, daughter 35');
  r = S({ estate: 100, heirs: [{ id: 'spouse', first: 40, share: 0.5 }, { id: 'child', share: 0.5 }] }, [sc('s', 'amount', { at: 'spouse' })]); ok(r.out.s === 70, 'a statutory legacy first (40), then halves of the rest: 70');
  r = S({ estate: 100, heirs: [{ id: 'w', share: 0.25, radd: false }] }, [sc('e', 'escheat')]); ok(r.out.e === 75 && has(r, 'escheat'), 'nobody to take the rest: escheat 75');
  ok(has(S({ estate: 100, heirs: [{ id: 'x', on: 0 }] }, []), 'no-heirs'), 'no heirs: code no-heirs');
  const T = E => S({ estate: E, division: 'talmud', heirs: [{ id: 'a', claim: 100 }, { id: 'b', claim: 200 }, { id: 'c', claim: 300 }] }, [{ id: 'x', kind: 'series', of: 'amounts' }]).out.x.map(v => Math.round(v * 1000) / 1000);
  ok(JSON.stringify([T(100), T(200), T(300)]) === JSON.stringify([[33.333, 33.333, 33.333], [50, 75, 75], [50, 100, 150]]), 'Kethuboth 93a (Aumann & Maschler 1985): estates 100, 200, 300 on claims 100, 200, 300');
  const Dv = d => S({ estate: 200, division: d, heirs: [{ id: 'a', claim: 100 }, { id: 'b', claim: 200 }, { id: 'c', claim: 300 }] }, [{ id: 'x', kind: 'series', of: 'amounts' }]).out.x.map(v => Math.round(v * 1000) / 1000);
  ok(JSON.stringify(Dv('proportional')) === '[33.333,66.667,100]' && JSON.stringify(Dv('cea')) === '[66.667,66.667,66.667]' && JSON.stringify(Dv('cel')) === '[0,50,150]', 'proportional, constrained equal awards and losses on 200 (Thomson 2003)');
  ok(has(S({ estate: 700, division: 'cea', heirs: [{ id: 'a', claim: 100 }, { id: 'b', claim: 200 }] }, []), 'claims-short'), 'an estate above the claims: each paid in full, code claims-short'); }

// ---- 15. obligations through logic@1 evalNorms ----
{ const ob = { task: 'obligations', start: '2024-03-01', count: 'business', norms: [{ id: 'deliver', kind: 'O', cond: 'order', act: 'delivered', within: 3, penalty: 500 }, { id: 'refund', kind: 'O', cond: 'viol_deliver', act: 'refunded', within: 2, penalty: 100 }], trace: [{ date: '2024-03-01', facts: ['order'] }, { date: '2024-03-08', acts: ['delivered'] }, { date: '2024-03-11', acts: ['refunded'] }] };
  let r = R(ob, [sc('v', 'violations'), sc('f', 'fulfilments'), sc('p', 'penalties'), sc('s', 'steps')]);
  ok(r.out.v === 1 && r.out.f === 1 && r.out.p === 500 && r.out.s === 11, 'delivery due in 3 business days (Wed 6 Mar) is broken; the contrary-to-duty refund within 2 more is met on Mon 11 Mar; penalty 500');
  r = R({ ...ob, count: 'calendar' }, [sc('v', 'violations'), sc('p', 'penalties')]); ok(r.out.v === 2 && r.out.p === 600, 'counted in calendar days the refund (due Thu 7 Mar) is broken too: penalties 600');
  r = R({ task: 'obligations', norms: [{ id: 'a', kind: 'O', cond: 'c', act: 'x' }, { id: 'b', kind: 'F', cond: 'c', act: 'x' }], trace: [{ day: 0, facts: ['c'] }] }, [sc('c', 'conflicts')]);
  ok(r.out.c === 1 && has(r, 'conflict') && has(r, 'unresolved'), 'an obligation and a prohibition of the same act: a conflict (logic@1), unresolved'); }

// ---- 16. checks, parity with Python, the schema ----
const codes = s => X.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
const mk = (model, outputs) => ({ format: 'noema.sim-spec/v1', engine: 'law@1', model, outputs: outputs || [] });
ok(codes(mk({ task: 'rules', rules: [{ id: 'a', then: 'p & q' }] })).includes('literal@model.rules[0].then'), 'check: a rule head that is no literal (code literal)');
ok(codes(mk({ task: 'rules', rules: [{ id: 'a', then: 'p' }], sup: [{ win: 'a', lose: 'b' }] })).includes('ref@model.sup[0].lose'), 'check: a superiority naming no rule (ref)');
ok(codes(mk({ task: 'carneades', args: [{ id: 'x', if: ['b'], then: 'a' }, { id: 'y', if: ['a'], then: 'b' }] })).includes('cycle@model.args'), 'check: a Carneades cycle (cycle)');
ok(codes(mk({ task: 'aspic', schemes: [{ id: 's', scheme: 'expert', then: 'c', cqs: [{ cq: 'nope' }] }] })).includes('cq@model.schemes[0].cqs[0].cq'), 'check: a critical question the scheme does not have (cq)');
ok(codes(mk({ task: 'deadline', start: '2023-02-29', period: { n: 1, unit: 'days' } })).includes('date@model.start'), 'check: a date that does not exist (date)');
ok(codes(mk({ task: 'sentence', grid: { cats: [0, 2], rows: [[1, 2, 3]] } })).includes('grid@model.grid.rows[0]'), 'check: a grid row of the wrong length (grid)');
ok(codes(mk({ task: 'citation', text: 'x', patterns: [{ id: 'p', template: '{a:float}' }] })).includes('pattern@model.patterns[0].template'), 'check: a broken template (pattern)');
ok(codes(mk({ task: 'rules', rules: [{ id: 'a', then: 'p' }] }, [sc('x', 'status', { at: 'zz' })])).includes('ref@outputs[0].at'), 'check: an output at an id the model lacks');
ok(codes(mk({ task: 'rules', rules: [{ id: 'a', then: 'p' }] }, [sc('x', 'weight')])).includes('output@outputs[0].of'), 'check: an output the task does not compute');
{ const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/enginelib/law.json'), 'utf8')).specs;
  const js = fx.map(s => { const p = X.checkSpec(s), bad = p.some(q => q.level === 'error'); return { p, x: bad ? null : X.exprs(s), k: bad ? null : X.keys(s) }; });
  const py = JSON.parse(execFileSync('python3', ['-c', `import json,sys,lib_law as M
out=[]
for s in json.loads(sys.stdin.read()):
    p=M.check_spec(s); bad=any(q['level']=='error' for q in p)
    out.append({'p':p,'x':None if bad else [list(t) for t in M.exprs(s)],'k':None if bad else [list(t) for t in M.keys(s)]})
print(json.dumps(out))`], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify(fx), encoding: 'utf8' }));
  let same = 0; js.forEach((r, i) => { if (JSON.stringify(r) === JSON.stringify(py[i])) same++; else console.log('  spec', i, '\n  JS', JSON.stringify(r), '\n  PY', JSON.stringify(py[i])); });
  const good = js.filter(r => !r.p.some(q => q.level === 'error')).length;
  ok(same === fx.length && good >= 10 && fx.length - good >= 10, `tools/lib_law.py = the JS checkSpec / exprs / keys on ${same}/${fx.length} fixtures (${good} good, ${fx.length - good} bad)`);
  const allCodes = new Set(js.flatMap(r => r.p.map(q => q.code)));
  ok(['format', 'value', 'enum', 'size', 'unknown-field', 'literal', 'duplicate', 'ref', 'cq', 'cycle', 'date', 'grid', 'pattern', 'output', 'parse-token', 'parse-paren', 'parse-eof'].every(c => allCodes.has(c)), 'the fixtures cover every check code: ' + [...allCodes].sort().join(' '));
  ok(X.exprs(fx[0]).some(e => e[1] === 'model.toggles[0].on') && X.keys(fx[0]).some(k => k[0] === 'ruleNoVehicles'), 'exprs lists the numx of the model, keys its labels');
  const SF = require(path.join(ROOT, 'engine', 'schemaform.js')), LS = globalThis.NoemaLibSchema, sim = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/schemas/noema.sim-spec.v1.schema.json'), 'utf8'));
  const sch = LS.specSchema(X.id, X.table, sim), Rg = SF.registry([sim, sch]), sid = LS.schemaId(X.id);
  const bad = []; fx.forEach((sp, i) => { if (!sp || X.checkSpec(sp).some(q => q.level === 'error')) return; const er = SF.validate(Rg, sch, sp, sid).filter(x => ['engine', 'model', 'outputs'].includes(x.path[0])); if (er.length) bad.push(i + ' ' + JSON.stringify(er[0])); });
  ok(!bad.length, 'the author\'s form (table → JSON Schema) accepts every fixture checkSpec accepts ' + bad.slice(0, 2).join(' | ')); }

// ---- 17. the adapter, the Worker source, speed, the reference activity ----
{ const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/activities_examples/vehicles-in-the-park/spec.json'), 'utf8'));
  const o = X.engine.create(spec, { seed: 1 }).run({ car: false, ambulance: true, emergency: true, memorial: false, bicycle: false });
  ok(o.forb === 0 && o.r1s === 1 && o.pic.items.length > 0 && X.engine.check(spec).length === 0, 'adapter: engine.create(spec).run(inputs) gives the declared outputs and a scene');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + X.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(spec, { seed: 1 }).run({ car: false, ambulance: true, emergency: true, memorial: false, bicycle: false });
  ok(JSON.stringify(w) === JSON.stringify(o), 'the Worker source (NoemaExpr + core + logic@1 + law@1) gives the same outputs in a fresh global');
  const t0 = Date.now(); for (let i = 0; i < 20; i++) X.engine.create(spec).run({ car: i % 2 === 0, ambulance: true, emergency: i % 3 === 0, memorial: false, bicycle: true });
  const typ = (Date.now() - t0) / 20; ok(typ < 50, `a typical run < 50 ms (${typ} ms)`);
  const t1 = Date.now();
  R({ task: 'vote', voters: Array.from({ length: 20 }, (_, i) => ({ id: 'v' + i, weight: i + 1, pop: 20 - i })), quota: 0.6, popQuota: 0.6 }, [sc('b', 'banzhaf'), sc('s', 'shapley')]);
  R({ task: 'rules', query: 'q199', facts: ['q0'], rules: Array.from({ length: 199 }, (_, i) => ({ id: 'r' + i, if: ['q' + i], then: 'q' + (i + 1) })).concat([{ id: 'x', if: ['q0'], then: '~q199' }]) }, [sc('h', 'holds')]);
  R({ task: 'deadline', start: '2000-01-01', period: { n: 2000, unit: 'business' }, holidays: Array.from({ length: 300 }, (_, i) => X.civilFromDays(X.dayOf('2000-01-03') + 7 * i).map((v, j) => String(v).padStart(j ? 2 : 4, '0')).join('-')) }, [sc('e', 'end'), pic()]);
  R({ task: 'obligations', norms: Array.from({ length: 50 }, (_, i) => ({ id: 'n' + i, kind: 'O', cond: 'c' + (i % 5), act: 'a' + i, within: 3 })), trace: Array.from({ length: 2000 }, (_, i) => ({ day: i, facts: ['c' + (i % 5)], acts: ['a' + (i % 50)] })), horizon: 2000 }, [sc('v', 'violations'), pic()]);
  const worst = Date.now() - t1; ok(worst < 2000, `the worst allowed (20 voters with a double majority, a chain of 200 rules, 2000 business days with 300 holidays, 50 clauses over 2000 days) ${worst} ms < 2 s`);
  function pic() { return { id: 'pic', kind: 'scene', of: 'drawing' }; }
  // the reference activity: strings, tests.json against the exercise's checks
  const AD = path.join(ROOT, 'tools/activities_examples/vehicles-in-the-park'), rd = f => JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
  const LOC = ['en', 'el', 'ru', 'de', 'fr'], tables = Object.fromEntries(LOC.map(l => [l, rd(`strings.${l}.json`)]));
  const used = [spec.title, spec.intro, ...spec.params.map(p => p.label), ...spec.readouts.map(r => r.label), ...spec.plots.map(p => p.title), ...X.keys(spec).map(k => k[0])];
  ok(X.checkSpec(spec).length === 0 && LOC.every(l => JSON.stringify(Object.keys(tables[l]).sort()) === JSON.stringify(Object.keys(tables.en).sort())) && used.every(k => LOC.every(l => tables[l][k])), 'vehicles-in-the-park: the spec passes checkSpec; the five string tables have the same keys and every key the spec names');
  const act = rd('activity.json'); ok(act.id === 'vehicles-in-the-park' && act.runtime === 'sim-spec@1' && fs.readFileSync(path.join(AD, 'fallback.svg'), 'utf8').startsWith('<svg'), 'vehicles-in-the-park: activity.json and fallback.svg');
  const cf = ['r1s == 1', 'forb == 0'].map(e => NoemaExpr.compile(e)), sim = X.engine.create(spec, { seed: 1 });
  for (const c of rd('tests.json').cases) {
    const v = Object.fromEntries(spec.params.map(p => [p.id, p.default])); for (const st of c.steps) v[st.set] = st.value;
    const out = sim.run(v), env = Object.assign({}, v, Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')));
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = cf.every(f => { try { return !!f(env); } catch (e) { return false; } });
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `vehicles-in-the-park: ${c.name}`);
  }
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
