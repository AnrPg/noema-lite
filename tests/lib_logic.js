/* logic@1 (src/engines/logic/logic.js, docs/library/logic.md) against published values:
   1. the parser: every error code with its position, ASCII = Unicode, printing round trips, each language's operators;
   2. propositional: De Morgan, Peirce's law (Enderton 2001), PHP(3,2) unsatisfiable (Cook & Reckhow 1979), DPLL = CDCL = truth tables
      on 60 seeded random 3-CNF, Tseitin equisatisfiable, CNF/DNF equivalent, resolution, Fitch proofs and every line code, Horn
      chaining on AIMA's example (Russell & Norvig 2020 Fig. 7.15–7.16);
   3. many-valued: K3 has no tautologies (Kleene 1952), LP's are the classical ones (Priest 1979), contraction fails in Łukasiewicz,
      prelinearity holds in Gödel and Łukasiewicz (Hájek 1998);
   4. first-order: finite models, unification (Martelli & Montanari 1982), the occurs check, Skolem form, resolution (Socrates, the
      drinker), the 15 / 24 valid syllogisms;
   5. modal: the correspondence T/D/4/5/B ↔ frame conditions on 300 random frames (Sahlqvist 1975), tableaux K/D/T/K4/S4, SDL's
      paradoxes (Ross 1941, Chisholm 1963, the good Samaritan — Prior 1958, free choice — von Wright 1968, Kamp 1973), dyadic
      deontic logic (Hansson 1969);
   6. epistemic: muddy children (Fagin et al. 1995), Cheryl's birthday (SASMO 2015), consecutive numbers (van Ditmarsch et al. 2007),
      E vs C knowledge, distributed knowledge;
   7. temporal: LTL on lasso and finite traces, CTL on Huth & Ryan's mutual exclusion (2004 §3.3.4);
   8. deontic: input/output logic out1–out4 (Makinson & van der Torre 2000), norms with deadlines, contrary-to-duty, conflicts by lex
      superior / specialis / posterior, the agents@1 API (evalNorms, normMonitor, perAgent);
   9. argumentation (Dung 1995): Nixon diamond, odd cycle, ideal and semi-stable; the API for other engines; the adapter, the Worker
      source, check codes and the Python twin, speed, the reference activities.   Usage: node tests/lib_logic.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibCore = ENGINES.kernel('core'), NoemaLibLogic = ENGINES.mod('logic@1');
const L = NoemaLibLogic;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const spec = (model, outputs) => ({ format: 'noema.sim-spec/v1', engine: 'logic@1', params: [{ id: 'k', kind: 'slider', label: 'k', min: 0, max: 10, default: 0 }], model, outputs: outputs || [] });
const O = (id, of, x) => Object.assign({ id, kind: 'scalar', of }, x || {}), S = (id, of) => ({ id, kind: 'series', of }), SC = { id: 'pic', kind: 'scene', of: 'drawing' };
const R = (model, outs, env) => L.run(spec(model, outs), env || {}, { seed: 1 });
const V = (model, of, env, x) => R(model, [O('v', of, x)], env).out.v;
const pa = (s, lang) => L.parse(s, lang);
const ast = (s, lang) => pa(s, lang).ast;

ok(L.id === 'logic@1' && Object.isFrozen(L) && L.engine.id === 'logic@1' && L.engine.scenes === true && typeof L.engine.workerSource === 'string', 'NoemaLibLogic: id logic@1, frozen, scenes, a Worker source');

// ---------- 1. the parser ----------
{
  const e = (s, lang) => { const r = pa(s, lang); return r.ok ? 'ok' : r.code + '@' + r.pos; };
  ok(e('(p & q') === 'parse-paren@6' && e('p q') === 'parse-token@2' && e('p &') === 'parse-eof@3' && e('p $ q') === 'parse-char@2' && e('') === 'parse-empty@0' && e('   ') === 'parse-empty@0',
    'parse codes: a missing ")" at its place, an extra token, an early end, an unknown character, an empty formula');
  ok(e('[]p') === 'parse-op@0' && e('forall x P(x)') === 'parse-op@0' && e('K p', 'epistemic') === 'parse-agent@0' && e('p U q', 'ctl') === 'parse-ctl@2' && e('A p', 'ctl') === 'parse-ctl@2' && e('F p', 'ctl') === 'parse-ctl@0',
    'parse codes: an operator of another language (parse-op), K without an agent (parse-agent), CTL path formulas outside A / E (parse-ctl)');
  ok(e('('.repeat(150) + 'p' + ')'.repeat(150)) === 'parse-deep@100' && e('p'.repeat(2001)) === 'parse-long@2000', 'parse codes: nesting deeper than 100 (parse-deep), longer than 2000 characters (parse-long)');
  ok(e('¬p ∧ q → r') === 'ok' && pa('★ p').pos === 0 && pa('p ∧ ★').pos === 4, 'positions count characters (code points), Unicode operators are one character');
  const same = (a, b, lang) => L.key(ast(a, lang)) === L.key(ast(b, lang));
  ok(same('~(p & q) <-> ~p | ~q', '¬(p ∧ q) ↔ ¬p ∨ ¬q') && same('p -> q -> r', 'p → (q → r)') && same('p /\\ q \\/ r', '(p ∧ q) ∨ r') && same('not p and q or r implies s iff t', '((¬p ∧ q) ∨ r → s) ↔ t') && same('p => q', 'p ⊃ q') && same('p xor q', 'p ⊕ q'),
    'ASCII = Unicode = words; precedence ¬ > ∧ > ∨ > → (right) > ↔');
  for (const [s, lang] of [['∀x (P(x) → ∃y R(x,y))', 'fol'], ['□(p → q) → (□p → □q)', 'modal'], ['O(p / q) ∧ P(r / ⊤)', 'dyadic'], ['K_a p ∧ C_{a,b} q ∧ [p]K_b q ∧ <q>p', 'epistemic'], ['G(req → F grant) ∧ (p U q)', 'ltl'], ['AG(t1 → AF c1) ∧ E[p U q]', 'ctl'], ['O p → P p ∧ F q', 'deontic'], ['[a]p ∧ <b>q', 'modal'], ['x ≠ f(y) ∧ x = c', 'fol']]) {
    const a = ast(s, lang), b = a && ast(L.show(a), lang);
    ok(a && b && L.key(a) === L.key(b), `show() round trips in ${lang}: ${s} → ${a ? L.show(a) : '✗'}`);
  }
  ok(ast('forall x. P(x) -> Q(x)', 'fol').t === 'all' && ast('forall x P(x) -> Q(x)', 'fol').t === 'imp', 'a quantifier with "." reaches as far as it can; without it binds the next formula only');
  ok(ast('O(b | a)', 'dyadic').c && ast('O(b | a)', 'dyadic').c.n === 'a' && ast('O(b ∨ c / a)', 'dyadic').a.t === 'or', 'dyadic O(b / a) and O(b | a); ∨ still works inside');
  ok(JSON.stringify(L.atomsOf(ast('q ∧ (p → q) ∨ r'))) === '["q","p","r"]', 'atomsOf: in order of first appearance');
}

// ---------- 2. propositional logic ----------
{
  ok(V({ task: 'truth-table', formula: '~(p & q) <-> (~p | ~q)' }, 'valid') === 1 && V({ task: 'truth-table', formula: '((p -> q) -> p) -> p' }, 'valid') === 1 && V({ task: 'truth-table', formula: 'p -> q' }, 'models') === 3,
    'truth tables: De Morgan and Peirce\'s law are tautologies (Enderton 2001 §1.2), p → q has 3 models of 4');
  const tt = R({ task: 'truth-table', formula: 'p & q', assign: [{ atom: 'p', value: 'k' }, { atom: 'q', value: 1 }] }, [O('v', 'value'), S('c', 'column'), O('r', 'rows'), SC], { k: 1 });
  ok(tt.out.v === 1 && tt.out.c.join('') === '1000' && tt.out.r === 4 && tt.out.pic.items.length === 3 + 1 + 12, 'truth table rows from TT first (column 1000), the value under the sliders, the grid scene');
  ok(V({ task: 'equivalent', formulas: ['p -> q', '~q -> ~p'] }, 'equivalent') === 1 && V({ task: 'equivalent', formulas: ['p -> q', 'q -> p'] }, 'countermodels') === 2, 'equivalence: contraposition yes; converse no (2 countermodels)');
  ok(V({ task: 'entails', premises: ['p -> q', 'p'], goal: 'q' }, 'entails') === 1 && V({ task: 'entails', premises: ['p -> q', 'q'], goal: 'p' }, 'countermodels') === 1 && V({ task: 'entails', premises: ['p', '~p'], goal: 'q' }, 'consistent') === 0,
    'entailment: modus ponens; affirming the consequent has 1 countermodel; inconsistent premises');
  // SAT
  const php = []; for (let i = 1; i <= 3; i++) php.push(`p${i}1 | p${i}2`); for (let h = 1; h <= 2; h++) for (let i = 1; i <= 3; i++) for (let j = i + 1; j <= 3; j++) php.push(`~p${i}${h} | ~p${j}${h}`);
  for (const solver of ['dpll', 'cdcl']) {
    const r = R({ task: 'sat', solver, formulas: php }, [O('s', 'satisfiable'), O('c', 'conflicts'), O('d', 'decisions'), O('st', 'steps')]);
    ok(r.out.s === 0 && r.out.c >= 2 && r.out.st > 0, `SAT ${solver}: the pigeonhole formula PHP(3,2) is unsatisfiable (${r.out.d} decisions, ${r.out.c} conflicts)`);
  }
  const rnd = NoemaLibCore.mulberry32(NoemaLibCore.hash32('3cnf', 7)); let agree = 0;
  for (let t = 0; t < 60; t++) {
    const nv = 4 + Math.floor(rnd() * 5), m = Math.round(nv * 4.26), cls = [];
    for (let i = 0; i < m; i++) { const c = []; for (let j = 0; j < 3; j++) c.push((rnd() < 0.5 ? '~' : '') + 'x' + Math.floor(rnd() * nv)); cls.push('(' + c.join(' | ') + ')'); }
    const f = cls.join(' & '), a = V({ task: 'sat', solver: 'dpll', formula: f }, 'satisfiable'), b = V({ task: 'sat', solver: 'cdcl', formula: f }, 'satisfiable'), c = V({ task: 'truth-table', formula: f }, 'satisfiable');
    if (a === b && b === c) agree++;
  }
  ok(agree === 60, `DPLL = CDCL = the truth table on 60 seeded random 3-CNF at the threshold m/n = 4.26 (${agree}/60)`);
  const cd = R({ task: 'sat', solver: 'cdcl', formula: '(a|b)&(~a|b)&(a|~b)&(~a|~b)', step: 3 }, [O('l', 'learned'), O('fr', 'frame'), S('lv', 'levels'), SC]);
  ok(cd.out.l === 1 && cd.trace[3].s === 'learn a' && cd.out.fr === 3 && cd.out.pic.items.length === 3 && cd.out.lv[0] === 1, 'CDCL learns the unit clause a by first-UIP after the first conflict; the step slider shows the trace line by line');
  // normal forms
  let nfOk = 0, tsOk = 0;
  const fs6 = ['(p & q) | (r & s)', '(p <-> q) -> r', '~(p -> (q & ~r))', 'p xor q xor r', '(a -> b) & (b -> c) -> (a -> c)', '~(p | q) & r'];
  for (const f of fs6) {
    for (const form of ['cnf', 'dnf', 'nnf']) {
      const tr = R({ task: 'normal-form', form, formula: f }, [O('c', 'clauses')]).trace.map(l => l.s);
      const g = form === 'cnf' ? tr.map(x => '(' + x + ')').join(' & ') || 'true' : form === 'dnf' ? tr.map(x => '(' + x + ')').join(' | ') || 'false' : tr[0];
      if (V({ task: 'equivalent', formulas: [f, g] }, 'equivalent') === 1) nfOk++;
    }
    const ts = R({ task: 'normal-form', form: 'tseitin', formula: f }, [O('c', 'clauses')]).trace.map(l => '(' + l.s + ')').join(' & ');
    if (V({ task: 'sat', formula: ts }, 'satisfiable') === V({ task: 'truth-table', formula: f }, 'satisfiable')) tsOk++;
  }
  ok(nfOk === 18 && tsOk === 6, `CNF, DNF and NNF are equivalent to the formula (${nfOk}/18); Tseitin's clauses are equisatisfiable (${tsOk}/6)`);
  ok(V({ task: 'normal-form', form: 'cnf', formula: '(p & q) | (r & s)' }, 'clauses') === 4 && V({ task: 'normal-form', form: 'tseitin', formula: '(p & q) | r' }, 'vars') === 2, 'CNF of (p∧q)∨(r∧s) has 4 clauses; Tseitin adds one variable per connective');
  const big = Array.from({ length: 12 }, (_, i) => `(a${i} & b${i})`).join(' | ');
  ok(R({ task: 'normal-form', form: 'cnf', formula: big }, [O('f', 'flag', { code: 'size' })]).out.f === 1, 'CNF by distribution that would pass 2000 clauses → code size (use Tseitin)');
  // resolution
  const rs = R({ task: 'resolution', premises: ['p -> q', 'q -> r', 'p'], goal: 'r' }, [O('r', 'refuted'), O('n', 'proofLength')]);
  ok(rs.out.r === 1 && rs.trace[rs.trace.length - 1].s.startsWith(rs.out.n + '') === false && /⊥/.test(rs.trace[rs.trace.length - 1].s), 'resolution refutes {p→q, q→r, p, ¬r} and the proof ends in □ (⊥)');
  ok(V({ task: 'resolution', premises: ['p -> q', 'q'], goal: 'p' }, 'refuted') === 0, 'resolution saturates without □ when the goal does not follow');
  // natural deduction
  const HS = [{ f: 'p -> q', rule: 'premise' }, { f: 'q -> r', rule: 'premise' }, { f: 'p', rule: 'assume', depth: 1 }, { f: 'q', rule: 'impE', refs: [1, 3], depth: 1 }, { f: 'r', rule: 'impE', refs: [2, 4], depth: 1 }, { f: 'p -> r', rule: 'impI', boxes: [3] }];
  const nd = (proof, goal) => R({ task: 'proof', proof, goal }, [O('v', 'valid'), O('e', 'errors'), O('f', 'firstError'), S('c', 'lineCodes')]).out;
  ok(nd(HS, 'p -> r').v === 1, 'Fitch: the hypothetical syllogism p→q, q→r ⊢ p→r (→E twice in a subproof, →I)');
  const lem = [{ f: '~(p | ~p)', rule: 'assume', depth: 1 }, { f: 'p', rule: 'assume', depth: 2 }, { f: 'p | ~p', rule: 'orI', refs: [2], depth: 2 }, { f: 'false', rule: 'notE', refs: [3, 1], depth: 2 },
    { f: '~p', rule: 'notI', boxes: [2], depth: 1 }, { f: 'p | ~p', rule: 'orI', refs: [5], depth: 1 }, { f: 'false', rule: 'notE', refs: [6, 1], depth: 1 }, { f: 'p | ~p', rule: 'ip', boxes: [1] }];
  ok(nd(lem, 'p ∨ ¬p').v === 1, 'Fitch: excluded middle proved from no premises (nested subproofs, ¬I, ¬E, IP)');
  const orE = [{ f: 'p | q', rule: 'premise' }, { f: 'p', rule: 'assume', depth: 1 }, { f: 'q | p', rule: 'orI', refs: [2], depth: 1 }, { f: 'q', rule: 'assume', depth: 1 }, { f: 'q | p', rule: 'orI', refs: [4], depth: 1 }, { f: 'q | p', rule: 'orE', refs: [1], boxes: [2, 4] }];
  ok(nd(orE, 'q | p').v === 1, 'Fitch: ∨ commutes (∨E with two sibling subproofs at the same depth)');
  const codeOf = (proof, goal) => { const o = nd(proof, goal); return o.c.map(i => L.ND_CODES[i]); };
  ok(codeOf(HS.slice(0, 5).concat([{ f: 'r', rule: 'reit', refs: [5] }]))[5] === 'nd-ref-closed', 'nd-ref-closed: a line inside a closed subproof cannot be cited');
  ok(codeOf([{ f: 'p', rule: 'premise' }, { f: 'q', rule: 'reit', refs: [1] }])[1] === 'nd-rule' && codeOf([{ f: 'p', rule: 'premise' }, { f: 'p & p', rule: 'andI', refs: [1] }])[1] === 'nd-refs', 'nd-rule (the formula does not follow), nd-refs (wrong number of citations)');
  ok(codeOf([{ f: 'p', rule: 'premise' }, { f: 'p', rule: 'reit', refs: [3] }, { f: 'p', rule: 'reit', refs: [1] }])[1] === 'nd-ref-later' && codeOf([{ f: 'p', rule: 'assume', depth: 1 }, { f: 'q', rule: 'premise' }])[1] === 'nd-premise' && codeOf([{ f: 'p', rule: 'premise', depth: 2 }])[0] === 'nd-depth',
    'nd-ref-later, nd-premise (after the first step), nd-depth (a jump in depth)');
  ok(codeOf([{ f: 'p', rule: 'assume', depth: 1 }, { f: 'p -> p', rule: 'impI', boxes: [1], depth: 1 }])[1] === 'nd-box-open' && codeOf([{ f: 'p', rule: 'premise' }, { f: 'p -> p', rule: 'impI', boxes: [1] }])[1] === 'nd-box', 'nd-box-open (citing the subproof one is in), nd-box (not a subproof)');
  const g1 = nd(HS, 'q -> p'), g2 = R({ task: 'proof', proof: HS.slice(0, 4) }, [O('v', 'valid'), O('f', 'flag', { code: 'nd-open' })]).out;
  ok(g1.v === 0 && g1.e === 1 && g2.v === 0 && g2.f === 1, 'a correct proof of another goal (nd-goal), a proof ending inside a subproof (nd-open)');
  // Horn
  const AIMA = ['p -> q', 'l & m -> p', 'b & l -> m', 'a & p -> l', 'a & b -> l', 'a', 'b'];
  const fc = R({ task: 'horn', formulas: AIMA, goal: 'q' }, [O('e', 'entails'), O('d', 'derived')]), bc = R({ task: 'horn', method: 'backward', formulas: AIMA, goal: 'q' }, [O('e', 'entails')]);
  ok(fc.out.e === 1 && fc.out.d === 6 && fc.trace.map(l => l.s.split(' ')[1]).join('') === 'ablmpq' && bc.out.e === 1, 'Horn: AIMA Fig. 7.16 — forward chaining infers a, b, l, m, p, q; backward chaining proves q');
  ok(V({ task: 'horn', formulas: ['a', 'a -> b', 'b -> false'], goal: 'b' }, 'flag', {}, { code: 'contradiction' }) === 1, 'a Horn constraint (a ∧ b → ⊥) that fires → contradiction');
}

// ---------- 3. many-valued ----------
{
  const mv = (logic, f, of) => V({ task: 'many-valued', logic, formula: f }, of || 'valid');
  ok(mv('k3', 'p | ~p') === 0 && mv('k3', 'p -> p') === 0 && mv('lp', 'p | ~p') === 1 && mv('lp', 'p -> p') === 1, 'K3 has no tautologies (Kleene 1952); LP keeps excluded middle (Priest 1979)');
  ok(mv('l3', 'p -> p') === 1 && mv('lukasiewicz', '(p -> (p -> q)) -> (p -> q)') === 0 && mv('godel', '(p -> (p -> q)) -> (p -> q)') === 1, 'Łukasiewicz: p → p valid, contraction fails; Gödel: contraction holds (Hájek 1998)');
  ok(mv('godel', '(p -> q) | (q -> p)') === 1 && mv('lukasiewicz', '(p -> q) | (q -> p)') === 1 && mv('product', '(p -> q) | (q -> p)') === 1 && mv('godel', '~~p -> p') === 0, 'prelinearity (p→q)∨(q→p) holds in Gödel, Łukasiewicz and product logic; ¬¬p → p fails in Gödel');
  ok(V({ task: 'many-valued', logic: 'k3', formula: 'p & ~p', assign: [{ atom: 'p', value: 0.5 }] }, 'value') === 0.5 && V({ task: 'many-valued', logic: 'lukasiewicz', formula: 'p -> q', assign: [{ atom: 'p', value: 0.75 }, { atom: 'q', value: 0.25 }] }, 'value') === 0.5,
    'values: K3 p ∧ ¬p at ½ is ½; Łukasiewicz 0.75 → 0.25 = 0.5');
  ok(V({ task: 'many-valued', logic: 'godel', formula: 'p' }, 'flag', {}, { code: 'grid-only' }) === 1, 'infinite-valued logics are checked on a grid of levels (grid-only)');
}

// ---------- 4. first-order ----------
{
  const cyc = { domain: ['a', 'b', 'c'], preds: [{ name: 'L', tuples: [['a', 'b'], ['b', 'c'], ['c', 'a']] }] };
  ok(V({ task: 'fol-eval', ...cyc, formula: 'forall x exists y L(x,y)' }, 'value') === 1 && V({ task: 'fol-eval', ...cyc, formula: 'exists y forall x L(x,y)' }, 'value') === 0 && V({ task: 'fol-eval', ...cyc, formula: 'L(x,y)' }, 'count') === 3,
    'finite models: ∀∃ holds and ∃∀ fails on a 3-cycle (the order of quantifiers); a formula with free variables counts its 3 satisfying pairs');
  ok(V({ task: 'fol-eval', size: 2, preds: [{ name: 'P', tuples: [['d0']] }], funcs: [{ name: 's', map: [['d0', 'd1'], ['d1', 'd0']] }], formula: 'forall x (P(x) <-> ~P(s(x))) & s(s(d0)) = d0' }, 'value') === 1, 'functions and equality in a finite structure');
  const un = R({ task: 'unify', terms: ['f(x, g(y))', 'f(g(z), x)'] }, [O('u', 'unifiable'), O('b', 'bindings')]);
  ok(un.out.u === 1 && un.out.b === 2 && un.trace[un.trace.length - 1].s === 'mgu {x↦g(z), y↦z}', 'unification: f(x, g(y)) = f(g(z), x) has mgu {x ↦ g(z), y ↦ z} (Martelli & Montanari 1982)');
  ok(V({ task: 'unify', terms: ['x', 'f(x)'] }, 'flag', {}, { code: 'occurs' }) === 1 && V({ task: 'unify', terms: ['f(a)', 'g(x)'] }, 'flag', {}, { code: 'clash' }) === 1 && V({ task: 'unify', terms: ['p(X)', 'p(a)'], vars: ['X'] }, 'unifiable') === 1,
    'unification: x = f(x) fails the occurs check, f(a) = g(x) clashes; variables may be listed (vars)');
  const sk = R({ task: 'normal-form', form: 'skolem', formula: 'forall x exists y forall z exists w R(x,y,z,w)' }, [O('s', 'skolems')]);
  ok(sk.out.s === 2 && sk.trace[0].s === '∀x1 ∀z3 R(x1,sk1(x1),z3,sk2(x1,z3))', 'Skolem form: ∀x∃y∀z∃w R → ∀x∀z R(x, sk1(x), z, sk2(x, z))');
  ok(R({ task: 'normal-form', form: 'prenex', formula: '(forall x P(x)) -> exists y Q(y)' }, []).trace[0].s === '∃x1 ∃y2 (¬P(x1) ∨ Q(y2))', 'prenex: (∀x P(x)) → ∃y Q(y) ≡ ∃x∃y (¬P(x) ∨ Q(y))');
  ok(V({ task: 'fol-resolution', premises: ['forall x (Man(x) -> Mortal(x))', 'Man(socrates)'], goal: 'Mortal(socrates)' }, 'refuted') === 1, 'first-order resolution: all men are mortal, Socrates is a man ⊢ Socrates is mortal');
  ok(V({ task: 'fol-resolution', goal: 'exists x (D(x) -> forall y D(y))' }, 'refuted') === 1, 'the drinker paradox ∃x (D(x) → ∀y D(y)) is valid (Smullyan 1978): its negation is refuted');
  ok(V({ task: 'fol-resolution', premises: ['forall x (P(x) -> P(f(x)))', 'P(a)'], goal: 'Q(a)', bound: 60 }, 'flag', {}, { code: 'bound' }) === 1, 'resolution with a bound: P(a), P(f(a)), … never reach Q(a) → bound (first-order logic is only semi-decidable)');
  let b = 0, t = 0; for (const a of 'AEIO') for (const c of 'AEIO') for (const d of 'AEIO') for (let f = 1; f <= 4; f++) { if (L.syllogism(a + c + d, f, false).valid) b++; if (L.syllogism(a + c + d, f, true).valid) t++; }
  ok(b === 15 && t === 24, `syllogisms: 15 of the 256 forms are valid on the Boolean reading, 24 with existential import (${b}, ${t})`);
  const sy = m => [V({ task: 'syllogism', ...m }, 'valid'), V({ task: 'syllogism', ...m }, 'validTraditional')].join();
  ok(sy({ mood: 'AAA', figure: 1 }) === '1,1' && sy({ mood: 'AAI', figure: 3 }) === '0,1' && sy({ mood: 'AAA', figure: 2 }) === '0,0' && sy({ mood: 'EIO', figure: 4 }) === '1,1', 'Barbara valid; Darapti only with import; AAA-2 (undistributed middle) invalid; Fresison valid');
}

// ---------- 5. modal and deontic ----------
{
  const rnd = NoemaLibCore.mulberry32(5); let bad = 0;
  for (let t = 0; t < 300; t++) {
    const k = 1 + Math.floor(rnd() * 5), rel = new Uint8Array(k * k); for (let i = 0; i < k * k; i++) rel[i] = rnd() < 0.45 ? 1 : 0;
    const fp = L.frameProps(rel, k), D = L.diagSet();
    for (const [a, p] of [['axT', 'reflexive'], ['axD', 'serial'], ['ax4', 'transitive'], ['ax5', 'euclidean'], ['axB', 'symmetric']]) if (L.axiomValid(a, rel, k, D) !== fp[p]) bad++;
  }
  ok(bad === 0, 'correspondence on 300 random frames: T ↔ reflexive, D ↔ serial, 4 ↔ transitive, 5 ↔ euclidean, B ↔ symmetric (every valuation of p checked)');
  const km = R({ task: 'kripke', worlds: [{ id: 'w1', holds: ['p'] }, { id: 'w2' }, { id: 'w3', holds: ['p'] }], edges: [{ u: 'w1', v: 'w2', on: 'k' }, { u: 'w2', v: 'w3' }, { u: 'w1', v: 'w1' }], formula: '<>p', world: 'w1' },
    [O('v', 'value'), O('c', 'count'), O('s', 'serial'), S('t', 'truth'), SC], { k: 1 });
  ok(km.out.v === 1 && km.out.c === 2 && km.out.s === 0 && km.out.t.join() === '1,1,0' && km.out.pic.items.some(i => i.k === 'seg' && i.arrow), 'Kripke model checking: ◇p at w1, w2 (not w3: no successor); the frame is not serial; the drawing');
  ok(V({ task: 'kripke', worlds: [{ id: 'w1', holds: ['p'] }, { id: 'w2' }, { id: 'w3', holds: ['p'] }], edges: [{ u: 'w1', v: 'w2', on: 'k' }, { u: 'w2', v: 'w3' }, { u: 'w1', v: 'w1' }], formula: '<>p', world: 'w2', at: 2 }, 'value', { k: 0 }) === 0, 'an edge switched off by a slider (on), a world picked by index (at)');
  const tab = (system, formula) => V({ task: 'tableau', system, formula }, 'valid');
  ok(tab('K', '[](p -> q) -> ([]p -> []q)') === 1 && tab('K', '[]p -> p') === 0 && tab('T', '[]p -> p') === 1 && tab('D', '[]p -> <>p') === 1 && tab('K', '[]p -> <>p') === 0, 'tableaux: K valid in K; T needs reflexivity; D needs seriality');
  ok(tab('K4', '[]p -> [][]p') === 1 && tab('S4', '[]p -> [][]p') === 1 && tab('T', '[]p -> [][]p') === 0 && tab('S4', '<>p -> []<>p') === 0 && tab('S4', '<>[]<>p -> <>p') === 1, 'tableaux with blocking: 4 in K4 and S4, not in T; 5 not in S4; ◇□◇p → ◇p in S4');
  ok(tab('D', 'O p -> O(p | q)') === 1, 'SDL (KD): Ross\'s paradox — "you ought to post the letter" entails "you ought to post it or burn it" (Ross 1941)');
  ok(V({ task: 'tableau', system: 'D', premises: ['O h', 'O(h -> t)', '~h -> O ~t', '~h'], goal: 'false' }, 'valid') === 1, 'SDL: Chisholm\'s four sentences (1963) are inconsistent in KD (they entail ⊥)');
  ok(tab('D', 'O(help & robbed) -> O robbed') === 1 && tab('D', 'P(p | q) -> P p & P q') === 0 && tab('D', '~(O p & O ~p)') === 1 && tab('D', 'F p <-> O ~p') === 1, 'SDL: the good Samaritan (Prior 1958), free choice permission fails (Kamp 1973), no O p ∧ O ¬p (D), F = O¬');
  const ch = { task: 'dyadic', worlds: [{ id: 'w1', holds: ['h', 't'], rank: 0 }, { id: 'w2', rank: 1 }, { id: 'w3', holds: ['t'], rank: 2 }, { id: 'w4', holds: ['h'], rank: 2 }] };
  ok(V({ ...ch, formula: 'O(h / true) & O(t / h) & O(~t / ~h)' }, 'value') === 1 && V({ ...ch, formula: 'O(t)' }, 'value') === 1 && V({ ...ch, formula: 'O(t / ~h)' }, 'value') === 0, 'dyadic deontic logic (Hansson 1969): Chisholm\'s set has a preference model; given ¬h the best is ¬t');
  ok(V({ ...ch, formula: 'O(p / x)' }, 'flag', {}, { code: 'vacuous' }) === 1 && V({ ...ch, formula: '[](h -> O(t / h))' }, 'value') === 1, 'a condition no world satisfies → vacuous; □ is the universal modality there');
  ok(V({ task: 'kripke', worlds: [{ id: 'w1' }, { id: 'w2' }], edges: [{ u: 'w1', v: 'w2' }], formula: 'O p -> P p' }, 'flag', {}, { code: 'not-serial' }) === 1, 'deontic operators on a frame that is not serial → not-serial (SDL needs D)');
}

// ---------- 6. epistemic ----------
{
  const mud = (n, k, step, f) => V({ task: 'epistemic', puzzle: { kind: 'muddy', n, muddy: k }, formula: f || 'K_c1 m1', step }, 'value');
  ok(mud(3, 2, 1) === 0 && mud(3, 2, 2) === 1 && mud(4, 3, 2) === 0 && mud(4, 3, 3) === 1 && mud(5, 1, 1) === 1, 'muddy children (Fagin et al. 1995): with k muddy, they know after the father and k − 1 rounds of "nobody knows"');
  ok(mud(3, 2, 0, 'E (m1 | m2 | m3)') === 1 && mud(3, 2, 0, 'C (m1 | m2 | m3)') === 0 && mud(3, 2, 1, 'C (m1 | m2 | m3)') === 1, 'before the father speaks everyone knows someone is muddy (E) but it is not common knowledge (C); after it is');
  ok(mud(3, 2, 0, 'D_{c1,c2} m1') === 1 && mud(3, 2, 0, 'K_c1 m1') === 0, 'distributed knowledge: c1 and c2 together know m1 (c2 sees it)');
  const ch = k => R({ task: 'epistemic', puzzle: { kind: 'cheryl' }, formula: 'july16', step: k }, [O('w', 'worlds'), O('c', 'count'), S('l', 'worldsLeft')]).out;
  ok(ch(3).w === 1 && ch(3).c === 1 && ch(3).l.join() === '10,5,3,1', 'Cheryl\'s birthday (SASMO 2015): 10 → 5 → 3 → 1 dates, July 16');
  const cn = k => V({ task: 'epistemic', puzzle: { kind: 'consecutive', n: 8, a: 2, b: 3 }, formula: 'K_a b3', step: k }, 'value');
  ok(cn(0) === 0 && cn(1) === 0 && cn(2) === 1, 'consecutive numbers (van Ditmarsch et al. 2007): Anne 2, Bill 3 — "I don\'t know", "I don\'t know", then Anne knows');
  ok(mud(3, 2, 3, 'm1') !== mud(3, 2, 3, 'm1') && V({ task: 'epistemic', puzzle: { kind: 'muddy', n: 3, muddy: 2 }, formula: 'm1', step: 3 }, 'flag', {}, { code: 'empty' }) === 1, 'announcing a falsehood: the actual world is gone (NaN and code empty)');
  const w = [{ id: 'u', holds: ['p'] }, { id: 'v' }], e = [{ u: 'u', v: 'v', ag: 'a' }];
  ok(V({ task: 'epistemic', worlds: w, edges: e, agents: ['a', 'b'], formula: 'K_b p & ~K_a p & [p]K_a p & <p>K_a p', world: 'u' }, 'value') === 1 && V({ task: 'epistemic', worlds: w, edges: e, agents: ['a'], formula: 'p', world: 'u' }, 'flag', {}, { code: 'not-equivalence' }) === 1,
    'S5 with announcements: b knows p, a does not, after [p] a knows (Plaza 1989); relations are closed to equivalences (not-equivalence)');
}

// ---------- 7. temporal ----------
{
  const lt = (trace, formula, loop, pos) => V({ task: 'ltl', trace: trace.map(h => ({ holds: h })), formula, loop, pos }, 'value');
  ok(lt([['p'], [], ['q']], 'G F q', 1) === 1 && lt([['p'], ['q'], []], 'G F q', 2) === 0 && lt([['p'], ['p'], ['q']], 'p U q') === 1 && lt([['p'], [], ['q']], 'p U q') === 0, 'LTL on lassos: G F q holds when q is on the loop; U needs p until q');
  ok(lt([['p'], ['p']], 'X X p') === 0 && lt([['p'], ['p']], 'G p') === 1 && lt([['p'], ['p']], 'p R q') === 0 && lt([['q'], ['q']], 'p R q') === 1, 'LTLf (De Giacomo & Vardi 2013): X is strong at the end, G and R hold at the end');
  ok(lt([['p'], ['q']], 'q', undefined, 1) === 1 && V({ task: 'ltl', trace: [{ holds: ['p'] }], formula: 'p' }, 'flag', {}, { code: 'finite' }) === 1, 'the position slider (pos); a trace without a loop is read as finite (code finite)');
  const ctl = f => V({ task: 'ctl', preset: 'mutex', formula: f, initial: 'snn' }, 'value');
  ok(ctl('AG ~(c1 & c2)') === 1 && ctl('AG (t1 -> AF c1)') === 0 && ctl('AG (n1 -> EX t1)') === 1 && ctl('EF (c1 & E[c1 U (~c1 & E[~c2 U c1])])') === 1,
    'CTL, Huth & Ryan §3.3.4 mutual exclusion: safety holds, liveness fails, non-blocking holds, no strict sequencing holds');
  ok(V({ task: 'ctl', preset: 'mutex', formula: 'true' }, 'worlds') === 8 && ctl('A[n1 U t1]') === 0 && ctl('E[n1 U t1]') === 1 && ctl('AG EF n1') === 1 && ctl('E[t1 R n1]') === 1, 'the 8 states; A/E U, AG EF (resettable), E R');
  ok(V({ task: 'ctl', worlds: [{ id: 'a', holds: ['p'] }, { id: 'b' }], edges: [{ u: 'a', v: 'b' }], formula: 'EG ~p', initial: 'b' }, 'flag', {}, { code: 'deadlock' }) === 1, 'a state without successors gets a loop (deadlock)');
}

// ---------- 8. deontic: input/output logic and norms ----------
{
  const G = [{ id: 'n1', cond: 'a', act: 'x' }, { id: 'n2', cond: 'x', act: 'y' }, { id: 'n3', cond: 'b', act: 'x' }];
  const io = (op, input, goal, th) => V({ task: 'io', op, norms: G, input, goal, throughput: !!th }, 'entails');
  ok(io('out1', ['a'], 'x') === 1 && io('out1', ['a'], 'y') === 0 && io('out3', ['a'], 'y') === 1, 'input/output logic (Makinson & van der Torre 2000): out1 gives x from a, not y; out3 (reusable) gives y');
  ok(io('out1', ['a | b'], 'x') === 0 && io('out2', ['a | b'], 'x') === 1 && io('out4', ['a | b'], 'y') === 1 && io('out3', ['a | b'], 'x') === 0, 'reasoning by cases: out2 and out4 give x from a ∨ b; out1 and out3 do not');
  ok(io('out1', ['a'], 'a') === 0 && io('out1', ['a'], 'a', true) === 1 && io('out2', ['a'], 'a & x', true) === 1, 'throughput (out⁺): the input itself is in the output');
  // norms with deadlines, contrary-to-duty and conflicts
  const norms = [{ id: 'pay', kind: 'O', cond: 'order', act: 'paid', within: 2 }, { id: 'fine', kind: 'O', cond: 'viol_pay', act: 'paidFine', within: 3 },
    { id: 'park', kind: 'F', act: 'parked', cond: 'zone' }, { id: 'emerg', kind: 'P', act: 'parked', cond: 'zone & emergency', rank: 1 }];
  const tr = [{ facts: ['order'] }, {}, {}, { acts: ['paidFine'] }, { facts: ['zone'], acts: ['parked'] }, { facts: ['zone', 'emergency'], acts: ['parked'] }];
  const r = L.evalNorms(norms, tr);
  ok(r.violations.length === 2 && r.violations[0].norm === 'pay' && r.violations[0].step === 2 && r.violations[0].kind === 'deadline' && r.violations[1].kind === 'forbidden' && r.fulfilments[0].norm === 'fine',
    'evalNorms: pay within 2 steps is violated at step 2 (deadline); the contrary-to-duty fine is then paid (fulfilled); parking in the zone is forbidden');
  ok(r.conflicts.length === 1 && r.conflicts[0].winner === 'emerg' && r.conflicts[0].by === 'superior' && r.counts.violations === 2, 'a permission of higher rank defeats the prohibition (lex superior): no violation at step 5');
  const spec2 = [{ id: 'gen', kind: 'F', act: 'smoke', cond: 'inside' }, { id: 'spec', kind: 'P', act: 'smoke', cond: 'inside & balcony' }];
  const r2 = L.evalNorms(spec2, [{ facts: ['inside', 'balcony'], acts: ['smoke'] }]);
  ok(r2.conflicts[0].winner === 'spec' && r2.conflicts[0].by === 'specialis' && r2.violations.length === 0, 'lex specialis: the more specific permission wins');
  const r3 = L.evalNorms([{ id: 'old', kind: 'O', act: 'x', issued: 1990 }, { id: 'new', kind: 'O', act: '~x', issued: 2020 }], [{ acts: ['x'] }], { order: ['posterior'] });
  ok(r3.conflicts[0].winner === 'new' && r3.violations[0].norm === 'new', 'lex posterior: the later O ¬x defeats the earlier O x; doing x violates it');
  const r4 = L.evalNorms([{ id: 'a', kind: 'O', act: 'x' }, { id: 'b', kind: 'F', act: 'x' }], [{}]);
  ok(r4.codes.includes('unresolved') && r4.conflicts[0].winner === null && r4.violations.length === 1, 'a conflict nothing resolves: code unresolved, both norms enforced');
  const r5 = L.evalNorms([{ id: 'q', kind: 'O', cond: 'task', act: 'done', deadline: 'bell' }], [{ facts: ['task'] }, {}, { facts: ['bell'] }]);
  ok(r5.violations[0].step === 2 && L.evalNorms([{ id: 'q', kind: 'O', act: 'done', by: 5 }], [{ t: 0 }, { t: 3 }]).pending.length === 1, 'deadlines as a condition (deadline) and as a time (by); unfinished → pending');
  const mo = L.normMonitor([{ id: 'q', kind: 'O', cond: 'task', act: 'done', within: 1 }], { perAgent: true });
  const s1 = mo.step({ facts: { '*': ['task'] }, acts: { a1: [], a2: ['done'] } }), s2 = mo.step({ acts: { a1: [], a2: [] } });
  ok(s1.fulfilments[0].agent === 'a2' && s2.violations[0].agent === 'a1' && mo.result().counts.violations === 1, 'normMonitor (agents@1): one instance per agent (perAgent), the new records of each step, result() so far');
  const trA = [{ facts: ['order'] }, {}, { acts: ['paid'] }], mo2 = L.normMonitor(norms); trA.forEach(s => mo2.step(s));
  ok(JSON.stringify(mo2.result()) === JSON.stringify(L.evalNorms(norms, trA)), 'evalNorms = a monitor fed every step, then result()');
  ok(L.evalNorms([{ id: 'x', kind: 'O', act: '(p' }], [{}]).codes.includes('parse') && L.evalNorms('nope', null).counts.violations === 0, 'a broken norm is skipped with code parse; nonsense never throws');
  const ns = R({ task: 'norms', norms: norms.slice(0, 2), trace: tr.slice(0, 4), step: 'k' }, [O('v', 'violations'), O('f', 'fulfilments'), S('ps', 'violationsPerStep'), SC], { k: 2 });
  ok(ns.out.v === 0 && R({ task: 'norms', norms: norms.slice(0, 2), trace: tr.slice(0, 4), step: 'k' }, [O('v', 'violations')], { k: 3 }).out.v === 1 && ns.out.pic.items.length > 0, 'the task norms: the step slider shows the trace day by day (no violation before step 2 is checked)');
}

// ---------- 9. argumentation ----------
{
  const af = (args, attacks, sem, arg) => R({ task: 'af', args: args.map(id => ({ id })), attacks: attacks.map(([u, v]) => ({ u, v })), semantics: sem, arg }, [O('n', 'extensions'), O('c', 'credulous'), O('s', 'skeptical'), S('l', 'labels'), SC]).out;
  const nx = af(['a', 'b'], [['a', 'b'], ['b', 'a']], 'preferred', 'a');
  ok(nx.n === 2 && nx.c === 1 && nx.s === 0 && af(['a', 'b'], [['a', 'b'], ['b', 'a']], 'grounded').l.join() === '0.5,0.5' && af(['a', 'b'], [['a', 'b'], ['b', 'a']], 'complete').n === 3, 'Nixon diamond (Dung 1995): grounded ∅, two preferred, a credulously but not skeptically accepted, 3 complete');
  ok(af(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']], 'stable').n === 0 && af(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']], 'preferred').l.join() === '0.5,0.5,0.5', 'an odd cycle: no stable extension; the only preferred is ∅');
  ok(af(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], 'grounded', 'c').s === 1 && af(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], 'grounded').l.join() === '1,0,1', 'reinstatement: a defends c (grounded {a, c})');
  const att = [[0, 1], [1, 0], [0, 2], [1, 2], [2, 3]];
  ok(L.AF.ideal(4, att).join() === '0.5,0.5,0.5,0.5' && L.AF.accept(4, att, 'preferred', 3).skeptical === true, 'ideal semantics (Dung, Mancarella & Toni 2007): d is skeptically preferred, but the ideal extension is ∅');
  ok(L.AF.semiStable(3, [[0, 1], [1, 2], [2, 0]]).length === 1 && L.AF.semiStable(4, [[0, 1], [1, 0], [2, 3], [3, 2], [2, 2]]).length === 2, 'semi-stable labellings (Caminada 2006)');
  const st = R({ task: 'af', args: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], attacks: [{ u: 'a', v: 'b' }, { u: 'b', v: 'c' }, { u: 'c', v: 'd' }], step: 'k' }, [O('s', 'steps'), O('i', 'inCount')], { k: 1 }).out;
  ok(st.s >= 2 && st.i === 1, 'the grounded extension computed step by step: after one iteration only a is in');
}

// ---------- 9b. tableaux for B and S5, ASPIC+ structured argumentation, bipolar argumentation ----------
{
  const tv = (f, sys) => V({ task: 'tableau', system: sys, formula: f }, 'valid');
  ok(tv('p -> []<>p', 'B') === 1 && tv('p -> []<>p', 'S4') === 0 && tv('[]p -> [][]p', 'B') === 0 && tv('[]p -> [][]p', 'S5') === 1,
    'tableau B (Hughes & Cresswell 1996 ch. 3): the Brouwer axiom p → □◇p holds in B, not in S4; 4 (□p → □□p) fails in B, holds in S5');
  ok(tv('<>p -> []<>p', 'S5') === 1 && tv('<>p -> []<>p', 'B') === 0 && tv('<>[]p -> []p', 'S5') === 1 && tv('<>[]p -> p', 'B') === 1 && tv('[](p | q) -> []p | []q', 'S5') === 0 && tv('[]p -> p', 'B') === 1,
    'tableau S5: axiom 5 (◇p → □◇p) holds in S5 not in B; ◇□p → □p in S5; ◇□p → p in B; □ does not distribute over ∨; T holds in B');
  const ent = L.entails([ast('<>(p & []q)', 'modal')], ast('q', 'modal'), { logic: 'B' });
  ok(ent.valid === true && L.entails([ast('<>p', 'modal')], ast('[]<>p', 'modal'), { logic: 'S5' }).valid === true && L.SYSTEMS.join() === 'K,D,T,K4,S4,B,S5', 'entails (the API) with logic B and S5');
  // ASPIC+: Modgil & Prakken 2014 (Argument & Computation 5:31) Example 3.23/3.24 "snores / professor": last-link accepts AccessDenied, weakest-link rejects it
  const snore = link => ({ task: 'aspic', link, kb: [{ f: 'snores', rank: 0 }, { f: 'professor', rank: 1 }], rules: [{ id: 'd1', body: ['snores'], head: 'misbehaves', rank: 0 },
    { id: 'd2', body: ['misbehaves'], head: 'accessDenied', rank: 2 }, { id: 'd3', body: ['professor'], head: '¬accessDenied', rank: 1 }], goal: 'accessDenied' });
  const sl = R(snore('last'), [O('a', 'args'), O('t', 'attacks'), O('d', 'defeats'), O('j', 'skeptical'), SC]).out, sw = R(snore('weakest'), [O('j', 'skeptical'), O('c', 'credulous')]).out;
  ok(sl.a === 5 && sl.t === 2 && sl.d === 1 && sl.j === 1 && sw.j === 0 && sw.c === 0 && sl.pic.items.length > 0,
    'ASPIC+ (Modgil & Prakken 2014 Ex. 3.23): 5 arguments, 2 rebuts, 1 defeat; last-link: AccessDenied justified; weakest-link: not');
  const swd = R(Object.assign(snore('weakest'), { goal: '~accessDenied' }), [O('j', 'skeptical')]).out;
  ok(swd.j === 1, 'ASPIC+: weakest-link: ¬AccessDenied justified instead');
  // Caminada & Amgoud 2007 (AIJ 171:286) Example 4 (ring / party animal): without transposition the grounded extension is inconsistent
  const mar = t => ({ task: 'aspic', transpose: t, kb: [{ f: 'wr', kind: 'axiom' }, { f: 'go', kind: 'axiom' }], rules: [{ id: 'd1', body: ['wr'], head: 'm' }, { id: 'd2', body: ['go'], head: 'b' },
    { id: 's1', body: ['m'], head: 'hw', kind: 'strict' }, { id: 's2', body: ['b'], head: '¬hw', kind: 'strict' }] });
  const outsM = ['args', 'attacks', 'directConsistent', 'indirectConsistent', 'transposed'].map(x => O(x, x)).concat([O('fp', 'flag', { code: 'postulate' }), O('ft', 'flag', { code: 'not-transposed' })]);
  const m0 = R(mar(false), outsM).out, m1 = R(mar(true), outsM).out;
  ok(m0.args === 6 && m0.attacks === 0 && m0.directConsistent === 0 && m0.fp === 1 && m0.ft === 1 && m1.args === 8 && m1.directConsistent === 1 && m1.indirectConsistent === 1 && m1.fp === 0 && m1.transposed === 1,
    'ASPIC+ (Caminada & Amgoud 2007 Ex. 4): without transposition direct consistency fails (code postulate, not-transposed); closed under transposition all postulates hold');
  const uc = R({ task: 'aspic', kb: [{ f: 'p' }, { f: '~d1' }], rules: [{ id: 'd1', body: ['p'], head: 'q' }], goal: 'q' }, [O('c', 'credulous'), O('d', 'defeats')]).out;
  const um = R({ task: 'aspic', kb: [{ f: 'p', rank: 0 }, { f: 'r', rank: 5 }], rules: [{ id: 's1', body: ['r'], head: '¬p', kind: 'strict' }], goal: 'p' }, [O('c', 'credulous'), O('d', 'defeats')]).out;
  const um2 = R({ task: 'aspic', kb: [{ f: 'p', kind: 'axiom' }, { f: 'r' }], rules: [{ id: 'd1', body: ['r'], head: '¬p' }], goal: 'p' }, [O('c', 'skeptical'), O('a', 'attacks')]).out;
  ok(uc.c === 0 && uc.d === 1 && um.c === 0 && um.d === 1 && um2.c === 1 && um2.a === 1, 'ASPIC+: an undercut (¬d1) always defeats; undermining an ordinary premise (rank 5 over rank 0, by a strict rule); an axiom cannot be undermined (Def. 3.10)');
  const ct = R({ task: 'aspic', kb: [{ f: 'a', rank: 0 }, { f: 'b', rank: 9 }], rules: [{ id: 'd1', body: ['a'], head: 'x', rank: 0 }, { id: 'd2', body: ['b'], head: 'y', rank: 9 }], contraries: [{ u: 'x', v: 'y' }], goal: 'x' }, [O('d', 'defeats'), O('j', 'skeptical'), O('w', 'wellFormed')]).out;
  ok(ct.d === 1 && ct.j === 1 && ct.w === 1, 'ASPIC+: a contrary-rebut succeeds whatever the preference (Def. 3.12), and is one-way');
  const dm = (o) => L.aspic({ kb: [{ f: 'p', rank: 1 }, { f: 'q', rank: 3 }, { f: 's', rank: 2 }], rules: [{ id: 'd1', body: ['p', 'q'], head: 'x', rank: 0 }, { id: 'd2', body: ['s'], head: '¬x', rank: 1 }] }, { link: 'weakest', ordering: o });
  const de = dm('elitist'), dd = dm('democratic'), xi = A => A.args.findIndex(a => a.conc === 'x'), ni = A => A.args.findIndex(a => a.conc === '-x');
  ok(de.less(xi(de), ni(de)) === true && dd.less(xi(dd), ni(dd)) === false && dd.less(ni(dd), xi(dd)) === false,
    'ASPIC+ set comparison (Modgil & Prakken 2013 Def. 3.19): weakest-link with d1 < d2: premises {p:1, q:3} ◁Eli {s:2} (some element below all) but not ◁Dem (q is above s)');
  ok(R({ task: 'aspic', kb: [{ f: 'p', kind: 'axiom' }, { f: '¬q', kind: 'axiom' }], rules: [{ id: 's', body: ['p'], head: 'q', kind: 'strict' }] }, [O('f', 'flag', { code: 'axioms-inconsistent' })]).out.f === 1
    && R({ task: 'aspic', kb: [{ f: 'y', kind: 'axiom' }, { f: 'a' }], rules: [{ id: 'd', body: ['a'], head: 'x' }], contraries: [{ u: 'x', v: 'y' }] }, [O('w', 'wellFormed'), O('f', 'flag', { code: 'not-well-formed' })]).out.f === 1,
    'ASPIC+: inconsistent axioms (axioms-inconsistent) and a contrary of an axiom (not-well-formed) are reported');
  // bipolar: Cayrol & Lagasquie-Schiex 2005 / 2013
  const bp = (mode, att, sup, extra) => R(Object.assign({ task: 'bipolar', support: mode, args: ['a', 'b', 'c', 'd'].map(id => ({ id })), attacks: att.map(([u, v]) => ({ u, v })), supports: sup.map(([u, v]) => ({ u, v })) }, extra || {}),
    ['attacks', 'direct', 'supported', 'secondary', 'mediated', 'extended', 'safe', 'closed', 'inCount', 'skeptical'].map(x => O(x, x))).out;
  const g1 = bp('general', [['b', 'c']], [['a', 'b']], { arg: 'c' }), g2 = bp('general', [['a', 'b']], [['b', 'c']], { arg: 'c' });
  ok(g1.supported === 1 && g1.attacks === 2 && g1.skeptical === 0 && g2.secondary === 1 && g2.skeptical === 0, 'bipolar (Cayrol & Lagasquie-Schiex 2005): a supported attack (a ⇒ b → c gives a → c) and a secondary attack (a → b ⇒ c gives a → c)');
  const d1 = bp('deductive', [['a', 'b']], [['c', 'b']], { arg: 'c' }), n1 = bp('necessary', [['b', 'c']], [['b', 'a']], { arg: 'c' });
  ok(d1.mediated === 1 && d1.skeptical === 0 && n1.extended === 1 && n1.attacks === 2, 'bipolar (Cayrol & Lagasquie-Schiex 2013 IJAR 54:876): deductive support gives mediated attacks (a → b, c ⇒ b: a → c); necessary support extended ones (b ⇒n a, b → c: a → c)');
  const ch = bp('general', [['c', 'd']], [['a', 'b'], ['b', 'c']]);
  ok(ch.supported === 2 && ch.attacks === 3 && ch.closed === 1 && ch.safe === 1, 'bipolar: support chains (a ⇒ b ⇒ c → d gives a → d and b → d); the grounded extension is safe and closed under support');
  const bb = L.bipolar(3, [[0, 1]], [[1, 2]], 'necessary');
  ok(bb.att.length === 2 && bb.kind['0,2'] === 'secondary' && L.SUPPORTS.join() === 'general,deductive,necessary', 'bipolar(n, att, sup, mode) is exported (the API)');
  const C2 = s => L.checkSpec(s).filter(p => p.level === 'error').map(p => p.code).join();
  ok(C2(spec({ task: 'aspic', kb: [{ f: 'p & q' }] }, [])) === 'literal' && C2(spec({ task: 'aspic', rules: [{ id: 'r', head: 'x' }, { id: 'r', head: 'y' }] }, [])) === 'duplicate'
    && C2(spec({ task: 'bipolar', args: [{ id: 'a' }], supports: [{ u: 'a', v: 'z' }] }, [])) === 'ref' && C2(spec({ task: 'aspic' }, [])) === 'value' && C2(spec({ task: 'aspic', kb: [{ f: 'p' }], goal: 'p -> q' }, [])) === 'literal',
    'check codes: aspic needs literals (literal), unique rule ids (duplicate), kb or rules (value); bipolar supports name arguments (ref)');
  const t0 = Date.now();
  R({ task: 'aspic', transpose: true, kb: Array.from({ length: 8 }, (_, i) => ({ f: 'p' + i, rank: i })), rules: Array.from({ length: 12 }, (_, i) => ({ id: 'd' + i, body: ['p' + (i % 8)], head: (i % 2 ? '¬' : '') + 'q' + (i % 4), rank: i })), semantics: 'preferred' }, [O('a', 'args'), SC]);
  ok(Date.now() - t0 < 2000, `speed: an ASPIC+ theory with 8 premises, 12 rules, preferred semantics ${Date.now() - t0} ms < 2 s`);
}

// ---------- 10. the API for other engines ----------
{
  const E = (p, c, o) => L.entails(p.map(s => ast(s, (o && o.lang) || 'prop')), ast(c, (o && o.lang) || 'prop'), o);
  const a = E(['p -> q', 'q'], 'p');
  ok(a.valid === false && JSON.stringify(a.counter) === '{"p":false,"q":true}' && E(['p -> q', 'p'], 'q').valid === true, 'entails (prop): the first countermodel in row order');
  ok(E([], 'p | ~p', { logic: 'k3' }).valid === false && E([], 'p | ~p', { logic: 'k3' }).counter.p === 0.5 && E(['p', 'p -> q'], 'q', { logic: 'lp' }).valid === false, 'entails in K3 (a countermodel at ½) and LP (modus ponens fails)');
  ok(E(['[]p'], 'p', { logic: 'T', lang: 'modal' }).valid === true && E(['[]p'], 'p', { logic: 'K', lang: 'modal' }).valid === false, 'entails in modal systems by tableau');
  const f = E(['forall x exists y R(x,y)'], 'exists y forall x R(x,y)', { logic: 'fol', lang: 'fol', maxSize: 2 }), g = E(['forall x P(x)'], 'exists x P(x)', { logic: 'fol', lang: 'fol' });
  ok(f.valid === false && f.counter.domain.length === 2 && g.valid === true && g.codes.includes('bounded'), 'entails in first-order logic: a 2-element countermodel to ∀∃ ⊢ ∃∀; ∀x P ⊢ ∃x P with no countermodel up to the bound');
  ok(L.truthTable([ast('p & q')]).cols[0].join('') === '1000' && L.rowsOf(['p', 'q']).length === 4 && L.syllogism('AAA', 1, false).valid && L.afSolve(2, [[0, 1]], L.diagSet()).grounded.join() === '1,0', 'truthTable, rowsOf, syllogism, afSolve are exported');
  const W = ENGINES.worker('logic@1').__noemaShared['logic/logic'];
  ok(W && W.evalNorms(norms0(), trace0()).counts.violations === 1 && W.parse('p ∧', 'prop').code === 'parse-eof', 'the Worker bundle: logic@1 runs in a fresh global (parse and evalNorms)');
}
function norms0() { return [{ id: 'pay', kind: 'O', cond: 'order', act: 'paid', within: 1 }]; }
function trace0() { return [{ facts: ['order'] }, {}]; }

// ---------- 11. the adapter, the Worker, the checks and the Python twin, speed ----------
{
  const sp = spec({ task: 'epistemic', puzzle: { kind: 'muddy', n: 3, muddy: 2 }, formula: 'K_c1 m1', step: 'k' }, [O('v', 'value'), O('w', 'worlds'), S('l', 'worldsLeft'), SC]);
  const a = L.engine.create(sp, { seed: 1 }).run({ k: 2 });
  ok(a.v === 1 && a.w === 4 && a.l.join() === '8,7,4' && Array.isArray(a.pic.items), 'engine.create(spec).run(inputs) gives the declared outputs (scalar, series, scene)');
  ok(L.engine.check(sp).length === 0 && L.engine.check(spec({ task: 'kripke' }, [])).length > 0, 'engine.check: the errors of checkSpec as messages');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + L.engine.workerSource, ctx);
  const b = ctx.self.noemaEngine.create(sp, { seed: 1 }).run({ k: 2 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'the Worker source in a fresh context gives the same outputs');
  const C1 = s => L.checkSpec(s).filter(p => p.level === 'error').map(p => p.code);
  ok(C1(spec({ task: 'truth-table', formula: '(p' }, [])).join() === 'parse-paren' && C1(spec({ task: 'epistemic', worlds: [{ id: 'w' }], agents: ['a'], formula: 'K_b p' }, [])).join() === 'agent' && C1(spec({ task: 'horn', formulas: ['p | q'], goal: 'q' }, [])).join() === 'horn',
    'check codes: parse errors at their path, an agent that is not declared, a clause that is not Horn');
  ok(C1(spec({ task: 'truth-table', formula: Array.from({ length: 13 }, (_, i) => 'a' + i).join(' & ') }, [])).join() === 'size' && C1(spec({ task: 'kripke' }, [O('x', 'valid')])).join() === 'value,output', 'check codes: more than 12 atoms (size), a missing model part and an output of another task');
  ok(JSON.stringify(L.exprs(spec({ task: 'af', args: [{ id: 'a', x: 'k', y: 0 }], attacks: [{ u: 'a', v: 'a', on: 'k > 1' }], step: 'k' }, []))) === '[["k","model.step",[]],["k","model.args[0].x",[]],["k > 1","model.attacks[0].on",[]]]' && L.keys(spec({ task: 'kripke', worlds: [{ id: 'w', label: 'wl' }] }, [])).length === 1,
    'exprs: every number written as an expression with its path; keys: the labels of worlds and arguments');
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'logic.json'), 'utf8')).specs;
  const js = fx.map(s => { const p = L.checkSpec(s), bad = p.some(q => q.level === 'error'); return { p, x: bad ? null : L.exprs(s), k: bad ? null : L.keys(s) }; });
  const py = JSON.parse(execFileSync('python3', ['-c', `import json,sys,lib_logic as M
out=[]
for s in json.loads(sys.stdin.read()):
    p=M.check_spec(s); bad=any(q['level']=='error' for q in p)
    out.append({'p':p,'x':None if bad else M.exprs(s),'k':None if bad else M.keys(s)})
print(json.dumps(out))`], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify(fx), encoding: 'utf8' }));
  let same = 0; js.forEach((r, i) => { if (JSON.stringify(r) === JSON.stringify(py[i])) same++; else console.log('  spec', i, '\n  JS', JSON.stringify(r), '\n  PY', JSON.stringify(py[i])); });
  const good = js.filter(r => !r.p.some(q => q.level === 'error')).length;
  ok(same === fx.length && good >= 10 && fx.length - good >= 10, `tools/lib_logic.py = the JS checkSpec / exprs / keys on ${same}/${fx.length} fixtures (${good} good, ${fx.length - good} bad)`);
  const texts = ['p ∧ (q', '[p]K_a q', 'O(p / q', 'AG(p → AF q)', 'p U q', '∀x. P(x) → ∃y R(x, y)', 'x ≠ f(y)', 'K p', 'C_{a,b} p ∧ E_a q', '◇p ★', '((p))', 'G(p U q) R r', 'O(b | a) ∧ F c'];
  const langs = ['prop', 'epistemic', 'dyadic', 'ctl', 'ltl', 'fol', 'fol', 'epistemic', 'epistemic', 'modal', 'prop', 'ltl', 'dyadic'];
  const pj = texts.map((t, i) => { const r = L.parse(t, langs[i]); return r.ok ? 'ok' : [r.code, r.pos, r.msg]; });
  const pp = JSON.parse(execFileSync('python3', ['-c', 'import json,sys,lib_logic as M\nd=json.loads(sys.stdin.read())\nprint(json.dumps([(lambda r: "ok" if r["ok"] else [r["code"], r["pos"], r["msg"]])(M.parse(t, l)) for t, l in zip(d[0], d[1])]))'], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify([texts, langs]), encoding: 'utf8' }));
  ok(JSON.stringify(pj) === JSON.stringify(pp), 'the parser in Python gives the same codes, positions and messages');
  const t0 = Date.now(); R({ task: 'truth-table', formula: '(p -> q) & (q -> r) -> (p -> r)' }, [O('v', 'valid'), SC]); R({ task: 'epistemic', puzzle: { kind: 'muddy', n: 3, muddy: 2 }, formula: 'K_c1 m1' }, [O('v', 'value'), SC]); R({ task: 'ctl', preset: 'mutex', formula: 'AG (t1 -> AF c1)' }, [O('v', 'value'), SC]); const t1 = Date.now() - t0;
  const t2 = Date.now();
  R({ task: 'truth-table', formula: Array.from({ length: 12 }, (_, i) => 'a' + i).join(' | ') }, [O('v', 'valid'), SC]);
  R({ task: 'epistemic', puzzle: { kind: 'muddy', n: 5, muddy: 4 }, formula: 'C (m1 | m2)' }, [O('v', 'value'), SC]);
  const php = []; for (let i = 1; i <= 6; i++) php.push(Array.from({ length: 5 }, (_, h) => `p${i}_${h}`).join(' | ')); for (let h = 0; h < 5; h++) for (let i = 1; i <= 6; i++) for (let j = i + 1; j <= 6; j++) php.push(`~p${i}_${h} | ~p${j}_${h}`);
  R({ task: 'sat', solver: 'cdcl', formulas: php }, [O('s', 'satisfiable')]);
  R({ task: 'tableau', system: 'S4', formula: '[](p -> <>q) & <>[]p & [](q -> []r) -> <>[]<>r' }, [O('v', 'valid')]);
  R({ task: 'af', args: Array.from({ length: 24 }, (_, i) => ({ id: 'a' + i })), attacks: Array.from({ length: 24 }, (_, i) => ({ u: 'a' + i, v: 'a' + ((i + 1) % 24) })), semantics: 'preferred' }, [O('n', 'extensions')]);
  const t3 = Date.now() - t2;
  ok(t1 < 50, `speed: a typical run (a truth table, the muddy children, CTL mutex, with scenes) ${t1} ms < 50 ms`);
  ok(t3 < 2000, `speed: the worst allowed (12 atoms, 32 worlds with C, PHP(6,5) by CDCL, an S4 tableau, 24 arguments) ${t3} ms < 2 s`);
}

// ---------- 12. the reference activities muddy-children and duty-repair (their exercises' checks and tests.json) ----------
for (const [d, checks] of [['muddy-children', ['knows == 1', 'frame <= 2']], ['duty-repair', ['v >= 1', 'frame <= 3']]]) {
  const AD = path.join(ROOT, 'tools', 'activities_examples', d), rd = f => JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
  const ex = rd('spec.json'), sim = L.engine.create(ex, { seed: 1 });
  const LOC = ['en', 'el', 'ru', 'de', 'fr'], tables = Object.fromEntries(LOC.map(l => [l, rd(`strings.${l}.json`)]));
  ok(L.checkSpec(ex).length === 0, `${d}: the spec passes checkSpec`);
  const used = [ex.title, ex.intro, ...ex.params.map(p => p.label), ...ex.readouts.map(r => r.label), ...ex.plots.map(p => p.title)];
  ok(LOC.every(l => JSON.stringify(Object.keys(tables[l]).sort()) === JSON.stringify(Object.keys(tables.en).sort())) && used.every(k => tables.en[k]), `${d}: the five string tables have the same keys, and every key the spec names`);
  const act = rd('activity.json'); ok(act.id === d && act.runtime === 'sim-spec@1' && fs.readFileSync(path.join(AD, 'fallback.svg'), 'utf8').startsWith('<svg'), `${d}: activity.json and fallback.svg`);
  const cf = checks.map(e => NoemaExpr.compile(e));
  for (const c of rd('tests.json').cases) {
    const v = Object.fromEntries(ex.params.map(p => [p.id, p.default])); for (const st of c.steps) v[st.set] = st.value;
    const out = sim.run(v), env = Object.assign({}, v, Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')));
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = cf.every(f => { try { return !!f(env); } catch (e) { return false; } });
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `${d}: ${c.name}`);
  }
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
