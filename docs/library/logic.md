# `logic@1` — logic from truth tables to norms (`engine/src/47_lib_logic.js`, `NoemaLibLogic`)

`logic@1` is a general engine of the library (`docs/INTERACTIVE_LIBRARY.md`). It has **one formula language**, written in ASCII or
Unicode. Its parser gives precise error codes and positions. Over that language it runs **24 tasks**:

- **Propositional logic.** Truth tables, equivalence, entailment, NNF/CNF/DNF/Tseitin, SAT by DPLL or CDCL with a trace, resolution
  refutation, Fitch natural deduction checked line by line, Horn clauses with forward and backward chaining.
- **Many-valued logics.** K3, LP, Ł3, Łukasiewicz, Gödel and product logic.
- **First-order logic.** Finite models, unification, prenex and Skolem forms, clausal form, resolution, and the categorical
  syllogisms.
- **Modal logic.** Kripke models, frame correspondence for T, D, 4, 5 and B, and tableaux for K, D, T, K4, S4, B and S5.
- **Epistemic logic.** Multi-agent S5, public announcements, common and distributed knowledge, and three puzzles: the muddy
  children, Cheryl's birthday and the consecutive numbers.
- **Temporal logic.** LTL on lasso and finite traces, and CTL by fixpoints, including the mutual-exclusion protocol.
- **Deontic logic.** SDL (KD) with its paradoxes, dyadic deontic logic on preference models, input/output logic out1–out4, and
  norms with deadlines over agent traces. Norms can conflict; the conflicts are resolved by lex superior, specialis and posterior.
- **Abstract argumentation.** Dung frameworks with the grounded, complete, preferred and stable semantics; semi-stable and ideal
  are in the API.
- **Structured and bipolar argumentation.** ASPIC+ (strict and defeasible rules, axioms and ordinary premises, undercut / rebut /
  undermine, last-link and weakest-link with elitist or democratic comparison, the rationality postulates checked) producing a
  Dung framework; bipolar frameworks with supported, secondary, mediated and extended attacks (general, deductive, necessary support).

Each task gives scalars, series, a scene and a trace. A slider bound to `model.step` walks through the trace: the SAT decisions,
the resolvents, the tableau's worlds, the announcements, the grounded iterations, or the days of a norm trace.

The Python twin is `tools/lib_logic.py`. It has the same tables and the same parser, with the same codes, positions and messages.
It gives the same problems as the JS `checkSpec`, and it does not compute the tasks.

The tests:
- `node tests/lib_logic.js` has 148 assertions: published values, every code, the API, the adapter, the Worker, speed and the
  reference activities.
- `tests/fixtures/enginelib/logic.json` has 60 specs (28 good, 32 bad). `node tests/enginelib.js` runs the JS ↔ Python parity on
  it once the catalogue lists `logic@1`; until then `tests/lib_logic.js` runs that parity itself.

The reference activities are `tools/activities_examples/muddy-children` (epistemic) and `tools/activities_examples/duty-repair`
(contrary-to-duty norms over a week).

The engine is pure JS with no dependency. It is deterministic: decisions take the lowest-numbered variable first, and labellings and
tableau branches are tried in a fixed order. It is bounded (§7) and never throws for a checked spec.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "logic@1",
  "params": [ { "id": "k", "kind": "slider", "label": "kLabel", "min": 0, "max": 3, "step": 1, "default": 0 } ],
  "model": { "task": "epistemic", "puzzle": { "kind": "muddy", "n": 3, "muddy": 2 },
             "formula": "K_c1 m1 | K_c1 ~m1", "step": "k" },
  "outputs": [ { "id": "knows", "kind": "scalar", "of": "value" },
               { "id": "left", "kind": "scalar", "of": "worlds" },
               { "id": "frame", "kind": "scalar", "of": "frame" },
               { "id": "lie", "kind": "scalar", "of": "flag", "code": "empty" },
               { "id": "pic", "kind": "scene", "of": "drawing" } ],
  "plots": [ { "kind": "scene", "title": "sceneTitle", "of": "pic", "height": 320 } ] }
```

This is the reference activity `muddy-children`. With `k = 2` (the father's announcement, then one round of "nobody knows"), child 1
knows: `knows = 1` and 4 worlds are left. With `k = 3`, the next "nobody knows" would be false at the actual world. No world is left
that matches the facts, so `value` is NaN and the flag `empty` is set. Its exercise checks `knows == 1` and `frame <= 2`.

- **Numbers.** `pick`, `at`, `pos`, `step` and `ext`, the values of `assign`, `x`/`y` of worlds and arguments, and `on` of edges,
  attacks and norms are **numx**: a number or an expression over the spec's names. `on` switches its part off when it is ≤ 0.5.
  `exprs(spec)` lists them as `[source, path, []]`.
- **Formulas** are texts in the language of §2. They are never NoemaExpr expressions. `checkSpec` parses each one in the task's
  language and reports parse errors with their path.
- **Keys.** `keys(spec)` lists the `label` keys of worlds and arguments. In a scene, a world or an argument with a label shows the
  key's text; without one it shows its own id as `s`.
- **Outputs**: `{id, kind, of, code?}`. `of` must be something the task computes (§4); `flag` takes a `code` of §5.
- **Runtime.** `run(spec, env, {seed})` returns `{out, diag, scalars, series, trace}`. The adapter
  `engine.create(spec).run(inputs)` gives the declared outputs by id. Booleans come out as 1 or 0, and what cannot be computed
  as NaN.

### 1.1 The model (`model`)

| field | kind | for | meaning |
|---|---|---|---|
| `task` | enum, required | all | one of the 24 tasks of §3 (22 + `aspic`, `bipolar`) |
| `formula` / `formulas` / `premises` / `goal` | formula / list ≤ 64 | most | the formulas of the task; `pick` (numx) chooses one of `formulas` |
| `assign` | list ≤ 12 of `{atom, value: numx}` | truth-table, many-valued | the valuation of the readout `value` (0/1, or a degree 0–1) |
| `atoms` | list ≤ 12 | truth-table, many-valued | the order of the columns (others follow in order of appearance) |
| `form` | `nnf cnf dnf tseitin prenex skolem clausal` | normal-form | the last three are first-order |
| `solver` | `dpll` · `cdcl` (default) | sat | |
| `method` | `forward` (default) · `backward` | horn | |
| `proof` | list ≤ 200 of `{f, rule, refs ≤ 2, boxes ≤ 2, depth 0–20}` | proof | Fitch lines (§3.3) |
| `logic`, `levels` 2–11, `designated` 0–1 | | many-valued | the logic, the grid of a continuous logic (default 5 levels), the least designated value (default 1; LP designates ½ and 1) |
| `domain` (≤ 8 ids) or `size` 1–8, `preds`, `funcs`, `consts` | | fol-eval | a finite structure: `preds: [{name, tuples: [[e…]]}]`, `funcs: [{name, map: [[args…, value]]}]`, `consts: [{name, value}]`; each element also names itself |
| `terms` (2–8), `vars` | | unify | the terms to unify; the variables (default: the names starting with u–z) |
| `bound` 1–2000 | | resolution, fol-resolution | the most clauses kept |
| `mood` (`AAA`…`OOO`), `figure` 1–4, `existential` | | syllogism | `existential` picks which reading the Venn scene shows |
| `worlds` (≤ 32; ≤ 256 states for ctl) | `{id, holds: [atom], x?, y?, rank?, label?}` | kripke, epistemic, ctl, dyadic | `rank` (0 = best) orders worlds for dyadic deontic logic |
| `edges` | `{u, v, ag?, on?}` | same | the accessibility relation; `ag` names an agent's relation (epistemic: required) |
| `agents` (≤ 8), `s5` (default true) | | epistemic | each agent's relation is closed to an equivalence unless `s5` is false |
| `world` / `initial` / `at` | ref / ref / numx | model tasks | the world a scalar `value` is read at (`at`: an index, wins) |
| `system` | `K D T K4 S4 B S5` (default K) | tableau | |
| `announce` (≤ 64), `puzzle` | | epistemic | public announcements in order (after a puzzle's own); `puzzle: {kind: muddy | cheryl | consecutive, n, muddy, a, b}` |
| `trace` (≤ 2000) | `{holds?, facts?, acts?, t?}` | ltl, norms | the states (ltl: `holds`, `facts` and `acts` all count) |
| `loop`, `pos` | int / numx | ltl | the lasso's loop position (none: a finite trace); the position read |
| `preset` | `mutex` | ctl | Huth & Ryan's mutual exclusion (8 states) |
| `norms` (≤ 200) | `{id, kind O|F|P, cond?, act, mode?, deadline?, within?, by?, until?, agent?, scope?, rank?, issued?, on?}` | io, norms | io reads (cond, act) as the pair (a, x) |
| `input` (≤ 64), `op`, `throughput` | | io | the input set A, `out1`–`out4`, out⁺ |
| `order` | list of `superior specialis posterior` | norms | the order in which conflicts are resolved (default all three in that order) |
| `args` (≤ 24) `{id, label?, x?, y?}`, `attacks` `{u, v, on?}`, `semantics`, `arg`, `ext` | | af | `arg`: the argument asked about; `ext` (numx): which extension the scene shows |
| `kb` (≤ 64) `{f, kind: axiom | ordinary (default), rank?, on?}` | | aspic | the knowledge base: axioms cannot be attacked; `rank` (−1000…1000, default 0, higher = preferred) orders the ordinary premises |
| `rules` (≤ 64) `{id, body: [literal] ≤ 8, head, kind: strict | defeasible (default), rank?, on?}` | | aspic | the rules; a defeasible rule's `id` is its name n(r): a conclusion ¬id undercuts it |
| `contraries` (≤ 64) `{u, v}` | | aspic | u is a contrary of v (u attacks v one way); ¬ is the contradictory both ways |
| `link` `last` (default) · `weakest`; `ordering` `elitist` (default) · `democratic`; `transpose` | | aspic | the argument ordering (§3.11); `transpose: true` closes the strict rules under transposition first |
| `goal` | literal | aspic | the conclusion asked about (credulous, skeptical, accepted) |
| `supports` `{u, v, on?}`, `support` `general` (default) · `deductive` · `necessary` | | bipolar | the support relation and how it is read (§3.12); `args`, `attacks`, `semantics`, `arg`, `ext` as for af |
| `step` | numx | traces | how far the trace is shown (default: all); for epistemic, the number of announcements applied; for norms, the number of trace steps checked |
| `view` | 4 numbers | scenes | the scene's view |

### 1.2 Checker codes (`checkSpec`, the same in `tools/lib_logic.py`)

| code | when |
|---|---|
| `format`, `value`, `enum`, `size`, `unknown-field` (warning) | the core's table walk (`46_lib_core.js`) |
| `value` | a part the task needs is missing (`missing (kripke needs worlds)`), two formulas for `equivalent`, two terms for `unify`, a mood that is not three of A E I O, `domain` and `size` together, `worlds` with `puzzle` or `preset`, a `loop` outside the trace, a world's atom that is not an atom name, a norm without `act` (and, for `norms`, without `kind`), `puzzle.muddy` > n |
| `parse-empty` `parse-long` `parse-char` `parse-token` `parse-eof` `parse-paren` `parse-op` `parse-agent` `parse-ctl` `parse-deep` | a formula does not parse (§2.2); the message gives the place |
| `term` | a unification term is a formula, not a term |
| `size` | more than 12 atoms (truth-table, equivalent, entails, many-valued, io), more than 32 worlds (256 states), more than 5 muddy children |
| `horn` | a rule that is not a Horn clause, a goal that is not an atom |
| `ref` | an edge, `world`, `initial`, an attack or `arg` names nothing; a tuple, constant or function value outside the domain; a predicate the structure lacks |
| `arity` | tuples of different lengths; a predicate used with another number of arguments |
| `duplicate` | a world, argument, norm or ASPIC+ rule listed twice |
| `literal` | aspic: a premise, rule body or head, contrary or goal that is not a literal (an atom or ¬atom; ¬¬p is p) |
| `agent` | an epistemic edge without a declared agent; a formula naming an agent not in `agents` |
| `output` | an `of` the task does not compute (the message lists those it does) |

## 2. The formula language

### 2.1 Operators

| | ASCII | Unicode / words | language |
|---|---|---|---|
| not, and, or, xor | `~ !` · `& && /\` · `\| \|\| \/` · | `¬ ∼` · `∧` · `∨` · `⊕` · `not and or xor` | all |
| implies, iff | `-> =>` · `<-> <=>` | `→ ⇒ ⊃` · `↔ ⇔ ≡` · `implies iff` | all |
| true, false | `true top` · `false bot` | `⊤` · `⊥` | all |
| quantifiers, equality | `forall x`, `exists x` (`.` or `:` after the variable: the widest scope) · `=` `!=` | `∀x ∃x` · `≠` | fol |
| box, diamond | `[]` `<>` · `[a]` `<a>` (an agent's relation) | `□ ◇ ◊` · `box dia` | modal, deontic, dyadic |
| obligation, permission, prohibition | `O p` `P p` `F p` | | deontic (F = O¬; SDL: O = □, P = ◇) |
| dyadic | `O(b / a)` `P(b / a)` `F(b / a)` (`O(b \| a)` too) | | dyadic; `O b` = `O(b / ⊤)` |
| knowledge, belief, groups | `K_a p` `B_a p` · `E_{a,b} p` `C_{a,b} p` `D_{a,b} p` (`C p`: all agents) | | epistemic |
| announcements | `[φ]ψ` `<φ>ψ` | | epistemic |
| temporal | `X F G` (unary) · `U R W` (binary) | | ltl |
| CTL | `AX AF AG EX EF EG` · `A[φ U ψ]` `E[φ R ψ]` … | | ctl (a temporal operator only right after A or E) |

Precedence, loosest first: `↔` (left), `→` (right), `∨ ⊕`, `∧`, `U R W` (right), then the unary operators. Atoms (and predicates,
functions, variables) are `[A-Za-z_][A-Za-z0-9_]*`. The words of the table cannot be atoms. Within a language, its operator letters
are not atoms either: `O P F` in deontic, `X F G U R W` in ltl, `A E` with a path in ctl, `K_x B_x C E D` in epistemic. `show(ast)`
prints a formula back in Unicode with as few parentheses as possible; the scenes use it for their `s` texts (cut at 64 characters).

### 2.2 Parse errors

`parse(text, lang)` → `{ok: true, ast}` or `{ok: false, code, pos, msg}`. `pos` counts characters (code points) from 0.

| code | example | message |
|---|---|---|
| `parse-empty` | `""` | the formula is empty |
| `parse-long` | > 2000 characters | longer than 2000 characters |
| `parse-char` | `p $ q` | unknown character "$" at 2 |
| `parse-token` | `p q` | unexpected "q" at 2 |
| `parse-eof` | `p &` | the formula ends too soon at 3 |
| `parse-paren` | `(p & q` | ")" is missing (to close "(" at 0) at 6 |
| `parse-op` | `[]p` in prop | "[]" is not an operator of the prop language at 0 |
| `parse-agent` | `K p` | K needs an agent (K_a) at 0 |
| `parse-ctl` | `p U q` in ctl | U must stand right after A or E in CTL at 2 |
| `parse-deep` | 101 nested levels | nested deeper than 100 levels at 100 |

## 3. Tasks and their methods

### 3.1 Propositional

| task | method and source | outputs |
|---|---|---|
| `truth-table` | evaluation on every row, rows from TT…T down to FF…F (Enderton 2001 §1.2) | `valid satisfiable models rows value atoms`; series `column`; scene: the grid |
| `equivalent` | two formulas on the same rows | `equivalent countermodels atoms`; series `column` (1 where they differ) |
| `entails` | premises ⊨ goal: no row with every premise true and the goal false | `entails countermodels consistent atoms` |
| `normal-form` | NNF; CNF and DNF by distribution with tautology and duplicate removal (≤ 2000 clauses, else `size`); Tseitin 1968 (one new variable `_tk` per connective, equisatisfiable); first-order: prenex (rename apart, NNF, pull out), Skolem 1920 (`skN(…)` of the ∀ before it), clausal form | `size clauses literals vars equivalent skolems`; scene: the lines |
| `sat` | DPLL (Davis, Logemann & Loveland 1962) with chronological backtracking; CDCL (Marques-Silva & Sakallah 1999; first-UIP learning as in Chaff, Moskewicz et al. 2001), no restarts; the formula's CNF, or Tseitin when the CNF is too big | `satisfiable decisions propagations conflicts learned backtracks clauses vars steps frame`; series `levels`; trace: decide / unit / conflict / learn / backtrack / flip, then SAT with the model or UNSAT |
| `resolution` | propositional saturation (Robinson 1965; Davis & Putnam 1960) of premises ∪ {¬goal}, tautology and subsumption deletion; the proof of □ is taken from the parents | `refuted generated proofLength clauses steps frame`; trace: the proof (or all clauses) |
| `proof` | Fitch natural deduction, §3.3 | `valid errors firstError lines`; series `lineCodes` |
| `horn` | forward chaining (PL-FC-ENTAILS, Russell & Norvig 2020 §7.5.4; linear, Dowling & Gallier 1984); backward chaining (depth first, loop check) | `entails derived steps frame`; flag `contradiction` when a constraint a ∧ b → ⊥ fires |

### 3.2 Many-valued (`many-valued`)

∧ = min and ∨ = max in all of these logics. ↔ = (x→y) ∧ (y→x) and ⊕ = |x − y|.

| logic | ¬x | x → y | designated | source |
|---|---|---|---|---|
| `k3` | 1 − x | max(1 − x, y) | {1} | Kleene 1938, 1952 §64 |
| `lp` | 1 − x | max(1 − x, y) | {½, 1} | Priest 1979 |
| `l3` / `lukasiewicz` | 1 − x | min(1, 1 − x + y) | ≥ `designated` | Łukasiewicz 1920 |
| `godel` | 1 if x = 0, else 0 | 1 if x ≤ y, else y | ≥ `designated` | Gödel 1932, Dummett 1959 |
| `product` | as Gödel | 1 if x ≤ y, else y / x | ≥ `designated` | Hájek 1998 |

K3, LP and Ł3 are exact on {0, ½, 1}. The continuous logics are checked on a grid of `levels` values, so `valid` holds only on that
grid (code `grid-only`). Outputs: `value` (under `assign`), `valid`, `satisfiable`, `min` and `max` over the grid; series `column`;
scene: the table.

### 3.3 Natural deduction (`proof`)

Each line is `{f, rule, refs, boxes, depth}`. A line at depth d is inside d open subproofs. `assume` opens one: at depth ≤ the
previous depth + 1, and a new assumption at the same depth closes the sibling subproof before it. A line may cite an earlier line
whose subproofs all still hold it. It cites a subproof by its assumption's line number; the subproof must be closed, and it ends at
its last line.

The rules follow Barwise & Etchemendy 1999 and *forall x: Calgary* 2019:

| rule | refs | boxes | the line is |
|---|---|---|---|
| `premise` | — | — | only at the start, at depth 0 |
| `assume` | — | — | any formula (opens a subproof) |
| `reit` | 1 | — | the same formula |
| `andI` / `andE` | 2 / 1 | — | A ∧ B / A or B of A ∧ B |
| `orI` / `orE` | 1 / 1 | — / 2 | A ∨ B from A or B / C from A ∨ B and subproofs A…C, B…C |
| `impI` / `impE` | — / 2 | 1 / — | A → B from a subproof A…B / B from A → B and A |
| `iffI` / `iffE` | — / 2 | 2 / — | A ↔ B from A…B and B…A / one side from the other |
| `notI` / `notE` | — / 2 | 1 / — | ¬A from A…⊥ / ⊥ from A and ¬A |
| `botE` | 1 | — | anything from ⊥ |
| `dne` | 1 | — | A from ¬¬A |
| `ip` | — | 1 | A from ¬A…⊥ (indirect proof) |
| `lem` | — | — | A ∨ ¬A |
| `topI` | — | — | ⊤ |
| `mt` | 2 | — | ¬A from A → B and ¬B |

Each line gets a code, in `ND_CODES` order (the series `lineCodes` gives the index):

| code | meaning |
|---|---|
| `nd-ok` | the line is correct |
| `nd-premise` | a premise after the first step or inside a subproof |
| `nd-depth` | a jump in depth |
| `nd-refs` | the wrong number of refs or boxes |
| `nd-ref-later` | a ref to the line itself or a later one |
| `nd-ref-closed` | a ref into a closed subproof |
| `nd-box` | a box that is not a subproof |
| `nd-box-open` | the line cites a subproof it is still in |
| `nd-rule` | the formula does not follow by the rule |
| `nd-parse` | the line's formula does not parse |

The proof as a whole is valid when every line is `nd-ok`, the last line is at depth 0 (else `nd-open`) and the last line is the
goal (else `nd-goal`). Formulas are compared structurally, after parsing.

### 3.4 First-order

| task | method and source | outputs |
|---|---|---|
| `fol-eval` | Tarski satisfaction over a finite domain (≤ 8). Free variables range over the domain: `value` is 1 when every assignment satisfies the formula, and `count` gives how many do | `value count domain`; trace: the structure and the assignments |
| `unify` | Robinson 1965 in the rule form of Martelli & Montanari 1982 (delete, decompose, bind, swap) with the occurs check; three or more terms are unified with the first | `unifiable bindings steps`; codes `occurs`, `clash`; trace: each rule, then the mgu |
| `fol-resolution` | Skolem form, clausal form, binary resolution with factoring by merging (Robinson 1965), all pairs in order, term depth ≤ 4, `bound` clauses (default 500) | `refuted` (1, or NaN with code `bound`: semi-decidable) `generated proofLength clauses` |
| `syllogism` | the 2⁸ cases of non-empty regions of the Venn diagram of S, M, P (Venn 1880). Boolean reading, and the traditional reading with existential import (each term non-empty). Figures: 1 M-P S-M · 2 P-M S-M · 3 M-P M-S · 4 P-M M-S | `valid validTraditional`; scene: three circles, ∅ in regions every model leaves empty, × where every model puts something |

### 3.5 Modal and deontic

| task | method and source | outputs |
|---|---|---|
| `kripke` | model checking by subformulas (Blackburn, de Rijke & Venema 2001 §1.3). The plain relation serves □ ◇ and SDL's O P F (von Wright 1951; O = □, P = ◇, F = □¬); `[a]` `<a>` use agent a's edges. Frame properties, and the axioms T □p→p, D □p→◇p, 4 □p→□□p, 5 ◇p→□◇p, B p→□◇p checked on the frame by every valuation of p (≤ 14 worlds; beyond that by the correspondence, code `correspondence`: Sahlqvist 1975, BdRV Thm 3.54) | `value count worlds reflexive serial transitive symmetric euclidean axT axD ax4 ax5 axB`; series `truth`; scene; code `not-serial` when deontic operators are read on a frame that is not serial |
| `tableau` | labelled tableaux for K, D, T, K4, S4 (Fitting 1983; Goré 1999); B and S5 in a global form (below). NNF; the α rule (∧), β (∨ by backtracking), T (□φ ⇒ φ), π (each ◇ψ opens a world with ψ and every φ of □φ; K4 and S4 carry □φ too), D (a successor even without ◇), ancestor-subset blocking for K4 and S4. `formula`: valid = ¬φ has no model, satisfiable = φ has one. `premises` + `goal`: local consequence | `valid satisfiable nodes worlds steps frame`; trace: worlds, branches, clashes, blocks |
| `dyadic` | preference models (Hansson 1969; Åqvist 1987, system E): O(b / a) holds when every best a-world (the lowest `rank`) is a b-world. It holds at every world or at none. P(b / a) = ¬O(¬b / a); F(b / a) = O(¬b / a); O b = O(b / ⊤); □ and ◇ are universal. An a no world satisfies makes O(b / a) vacuously true (code `vacuous`) | `value count worlds`; series `truth`; scene: the worlds by rank |

**B and S5** (Fitting 1983 ch. 3; Hughes & Cresswell 1996 ch. 6) are expanded globally: all the worlds at once, a β choice
copies every world. In **B** the worlds form a tree whose edges count both ways, and each world sees itself: □φ at w puts φ at w,
at its children and at its parent; ◇ψ at w is met by ψ at w or at a neighbour, otherwise a child is opened. The tree is no deeper
than the modal depth, so no blocking is needed. In **S5** all worlds see each other: □φ anywhere puts φ and □φ everywhere; ◇ψ is
met when any world holds ψ, otherwise one world is opened (at most one per ◇-subformula). An open state is a model (the Hintikka
conditions hold by construction); a satisfiable set always has an open state (choose β and witnesses as the model does).

**The paradoxes of SDL** are tableau tasks (system D). The engine gives:

- Ross 1941: `O p → O(p ∨ q)` is valid.
- Chisholm 1963: `O h`, `O(h → t)`, `¬h → O ¬t` and `¬h` together entail ⊥.
- The good Samaritan (Prior 1958): `O(help ∧ robbed) → O robbed` is valid.
- Free choice permission (von Wright 1968; Kamp 1973): `P(p ∨ q) → P p ∧ P q` is not valid.

The same Chisholm set has a model in dyadic deontic logic (`dyadic`, tests §5).

### 3.6 Epistemic (`epistemic`)

Multi-agent S5 (Fagin, Halpern, Moses & Vardi 1995):

- K_a reads agent a's relation; edges are closed to an equivalence unless `s5` is false (code `not-equivalence` when the closure
  added pairs).
- E_G reads the union of the group's relations, C_G its transitive closure, and D_G their intersection.
- [φ]ψ holds at w when φ fails at w or ψ holds at w in the model restricted to the φ-worlds; ⟨φ⟩ψ is its dual (Plaza 1989; van
  Ditmarsch, van der Hoek & Kooi 2007).

The announcements of `puzzle` and `announce` are applied one by one, up to `step`. An announcement false at the actual world
removes it (NaN, code `empty`).

**Puzzles:**
- `muddy` (Littlewood 1953; FHMV §1.1): `n` ≤ 5 children, the first `muddy` of them muddy. The worlds are bit strings, the atoms
  `m1…mn`, the agents `c1…cn`. The announcements are the father's "m1 ∨ … ∨ mn", then n rounds of "nobody knows whether they are
  muddy". With k muddy, the muddy children know after the father and k − 1 rounds.
- `cheryl` (SASMO 2015 Q24): the ten dates as worlds, with atoms `may…august`, `d14…d19` and `july16`-style dates. Albert `a` is
  told the month, Bernard `b` the day. The three statements leave 10 → 5 → 3 → 1 worlds: July 16.
- `consecutive` (Littlewood 1953; van Ditmarsch et al. 2007): Anne and Bill hold numbers that differ by 1, up to `n` ≤ 15. The
  atoms are `aN` and `bN`; the actual pair is (`a`, `b`), by default (2, 3). The announcements alternate "Anne does not know",
  "Bill does not know". The cut at n is flagged `boundary`.

Outputs: `value` (at the actual world after the announcements), `count`, `worlds`, `steps`, `frame`; series `truth` and
`worldsLeft`; scene: the remaining worlds, with each agent's relation (agent id as the arrow's `s`).

### 3.7 Temporal

- **`ltl`** (Pnueli 1977). The trace is a lasso s0…s(n−1) → s(`loop`), or, without `loop`, a finite trace under LTLf (De Giacomo
  & Vardi 2013): X is strong (false at the end), G and R hold at the end (code `finite`). U and F are least fixpoints over the
  positions; G, R and W are greatest fixpoints. Outputs: `value` at `pos`, `count`; series `truth` per position; scene: the
  positions and the loop.
- **`ctl`** (Clarke, Emerson & Sistla 1986; Huth & Ryan 2004 §3.6). Labelling with EX, E[φ U ψ] as a least fixpoint and EG as a
  greatest; the rest by duality: AX = ¬EX¬, AF = ¬EG¬, AG = ¬EF¬, A[φ U ψ] = ¬E[¬ψ U (¬φ ∧ ¬ψ)] ∧ ¬EG¬ψ,
  E[φ R ψ] = E[ψ U (φ ∧ ψ)] ∨ EG ψ, φ W ψ = ψ R (φ ∨ ψ). A state without successors gets a self-loop (code `deadlock`).
  `preset: mutex` is the first-attempt protocol of Huth & Ryan §3.3.4: two processes n → t → c → n, interleaved, never both in c,
  with states `s<p1><p2>` and atoms `n1 t1 c1 n2 t2 c2`. Safety `AG ¬(c1 ∧ c2)` holds, liveness `AG(t1 → AF c1)` fails,
  non-blocking `AG(n1 → EX t1)` holds, and no strict sequencing holds.

### 3.8 Input/output logic (`io`)

Makinson & van der Torre 2000. Norms (a, x) are written as `{id, cond: a, act: x}`; the input is A; the query is `goal`.

| op | definition |
|---|---|
| out1 | Cn(G(Cn A)) |
| out2 | ∩ Cn G(V) over complete V ⊇ A (reasoning by cases) |
| out3 | Cn G(B) for the least B ⊇ A with B = Cn B ⊇ G(B) (reusable: the output is fed back) |
| out4 | ∩ Cn G(V) over complete V ⊇ A with G(V) ⊆ V |

With `throughput` the identity pairs are added (out⁺). It is decided exactly over the valuations of the atoms (≤ 12): a complete
set is a valuation, or the whole language when none fits. An A no valuation satisfies gives `inconsistent-input`; an out4 with no
fitting valuation gives `vacuous`. Outputs: `entails` (goal ∈ out) and `triggered`; the trace lists each norm, highlighted when
it is triggered.

### 3.9 Norms over traces (`norms`; the API `evalNorms` / `normMonitor`)

The sources are conditional obligations with deadlines (Dignum, Broersen, Dignum & Meyer 2004; Governatori 2015), maintenance
obligations and prohibitions (Governatori & Rotolo 2010), and permissions as exceptions.

**A norm** is `{id, kind: O | F | P, act, cond?, mode?, deadline?, within?, by?, until?, agent?, scope?, rank?, issued?, on?}`.
Its formulas are propositional.

**A step** is `{t?, facts?, acts?}`. An atom holds at a step when it is in `facts` or in `acts`.

**Activation.** An instance starts when `cond` becomes true (a rising edge; at most one live instance per norm and agent).

**Modes.**
- An O with a deadline (`deadline` holds, or `within` steps have passed, or t ≥ `by`) is an **achievement**. It is fulfilled at the
  first step where `act` holds, and violated (`deadline`) when the deadline comes first. `act` at the deadline step counts as
  fulfilled. `until` cancels it.
- An O without a deadline, and every F, is a **maintenance** norm. Each step it is in force and `act` fails (O; kind `maintain`)
  or holds (F; kind `forbidden`) is a violation. The instance ends when `cond` turns false, `until` holds or the deadline comes,
  and it counts as fulfilled when it ended without a violation.
- A P is never violated.

**Contrary-to-duty.** A condition may name `viol_<id>` or `fulf_<id>` (Prakken & Sergot 1996). They become true **from the step
after** that norm's violation or fulfilment: within one step, every norm is activated before any is checked.

**Conflicts** at a step, in the same context:
- O p against F p;
- O p against O ¬p;
- P p against F p.

Acts are compared in NNF. They are resolved in `order`:
- lex **superior**: the higher `rank` wins;
- lex **specialis**: the condition whose conjuncts strictly include the other's wins;
- lex **posterior**: the later `issued` wins (Alchourrón & Makinson 1981; Sartor 2005 ch. 7).

The losing norm is not enforced at that step; a losing achievement is cancelled. A conflict nothing resolves keeps both norms
(code `unresolved`). Each conflict is recorded once, when it starts.

Outputs: `violations fulfilments pending conflicts steps frame`; series `violationsPerStep` and `activePerStep`; scene: one row per
norm, red at a violation, green at a fulfilment, amber where it is still in force, and the current step dashed.

### 3.10 Argumentation (`af`)

Dung 1995:

- **grounded**: the least fixpoint of the characteristic function. Each iteration is a step, so the slider shows it growing.
- **complete**: every complete labelling (Caminada 2006), found by a search over in / out / undec with the grounded labels fixed
  and the legality of each argument checked as its attackers are labelled (Modgil & Caminada 2009).
- **preferred**: the ⊆-maximal complete extensions.
- **stable**: the complete labellings with nothing undecided. When there are none the code is `no-stable`, and skeptical
  acceptance is then vacuously true.

Outputs: `extensions`, `credulous` and `skeptical` (for `arg`), `accepted` (`arg` in the shown extension `ext`), `inCount`, `steps`,
`frame`; series `labels` (1 in, 0 out, ½ undec); scene: the graph, in ok, out bad, undec warn. Semi-stable and ideal semantics are
in the API (§9).

### 3.11 Structured argumentation: ASPIC+ (`aspic`)

Modgil & Prakken 2014 (the tutorial, Argument & Computation 5:31; definitions numbered as there), Modgil & Prakken 2013
(AIJ 195:361), Prakken 2010. Literals only: an atom p or ¬p.

- **Arguments** (Def. 3.6), built bottom-up: each premise of `kb` is an argument; a rule whose body literals are all conclusions of
  arguments A1…An gives A1…An → / ⇒ head. Every combination of sub-arguments is built (≤ 200 arguments, code `budget`). A rule is
  not applied when its head is already a conclusion inside the sub-arguments (no circular arguments).
- **Attacks** (Def. 3.10): A *undercuts* B on B′ when B′ ∈ Sub(B) has a defeasible top rule r and Conc(A) ∈ ¬n(r) (n(r) = the
  rule's `id`); A *rebuts* B on B′ when B′ has a defeasible top rule and Conc(A) ∈ ¬Conc(B′) (restricted rebut: a strict top rule
  cannot be rebutted); A *undermines* B on an ordinary premise φ of B when Conc(A) ∈ ¬φ. Axioms cannot be undermined.
- **Defeats** (Def. 3.12): an undercut always succeeds; a rebut or undermine succeeds when it is by a contrary (one-way) or
  A ⊀ B′.
- **The ordering** (Defs. 3.19–3.21). Ranks order the defeasible rules and the ordinary premises (higher = preferred). The set
  comparison Γ ◁ Γ′: Γ = ∅ is never below; a non-empty Γ is below ∅; *elitist*: some X ∈ Γ is below every Y ∈ Γ′; *democratic*: every
  X ∈ Γ is below some Y ∈ Γ′. *Last-link*: A ≺ B iff LastDefRules(A) ◁ LastDefRules(B), or both are empty and Prem_p(A) ◁ Prem_p(B).
  *Weakest-link*: both strict → Prem_p ◁; both firm → DefRules ◁; otherwise both. (So under last-link a premise argument with no
  defeasible rule is never below an argument that has one: undermining it fails unless by a contrary.)
- The defeats form a Dung AF solved by `afSolve` (§3.10) with `semantics`.
- **Rationality postulates** (Caminada & Amgoud 2007, AIJ 171:286), checked on every extension of the semantics: `subClosed`
  (closed under sub-arguments), `strictClosed` (the conclusions are closed under the strict rules), `directConsistent`,
  `indirectConsistent` (the strict closure is consistent). A failure raises code `postulate`. The conditions that guarantee them
  (Modgil & Prakken 2013 Thms 6.10–6.14) are reported too: `transposed` (strict rules closed under transposition, Caminada & Amgoud
  2007 Def. 21; code `not-transposed`; `transpose: true` adds the transposed rules, id `r'i`), `axiomsConsistent` (code
  `axioms-inconsistent`), `wellFormed` (no contrary-only target is an axiom or the head of a strict rule; code `not-well-formed`).

Outputs: `args attacks defeats extensions credulous skeptical accepted inCount subClosed strictClosed directConsistent
indirectConsistent transposed wellFormed axiomsConsistent steps frame`; series `labels` (per argument, in build order: premises
first); scene: the defeat graph (A1, A2 … with the conclusion under each; ≤ 60 arguments, else the trace as text); trace: each
argument's structure, then each attack with its kind and ✓ when it is a defeat.

### 3.12 Bipolar argumentation (`bipolar`)

Cayrol & Lagasquie-Schiex 2005 (ECSQARU, LNAI 3571:378), 2013 (IJAR 54:876); necessary support: Nouioua & Risch 2010. Attacks →
and supports ⇒ between arguments (⇒+ is a support path). The complex attacks are added until nothing changes:

| `support` | adds | rule |
|---|---|---|
| `general` (2005) | supported, secondary (indirect) | a ⇒+ x → b gives a → b; a → x ⇒+ b gives a → b |
| `deductive` (2013 §3) | supported, mediated | a ⇒+ x → b gives a → b; a → b with x ⇒+ b gives a → x |
| `necessary` (2013 §4) | secondary, extended | a → x ⇒+ b gives a → b; x ⇒+ a with x → b gives a → b |

Dung's semantics then run on the result. Outputs: as af, plus `attacks` (all after closure) and the counts `direct supported
secondary mediated extended` (each added attack counted under the first rule that found it), `safe` (the shown extension attacks
none of its members nor anything it supports; 2005 Def. 7) and `closed` (it holds whatever a member supports). Scene: direct
attacks bad, complex ones warn, supports ok.

## 4. Outputs

| task | scalars (`flag` everywhere) | series |
|---|---|---|
| truth-table | valid satisfiable models rows value atoms | column |
| equivalent | equivalent countermodels atoms | column |
| entails | entails countermodels consistent atoms | — |
| normal-form | size clauses literals vars equivalent skolems | — |
| sat | satisfiable decisions propagations conflicts learned backtracks clauses vars steps frame | levels |
| resolution, fol-resolution | refuted generated proofLength clauses steps frame | — |
| proof | valid errors firstError lines | lineCodes |
| horn | entails derived steps frame | — |
| many-valued | value valid satisfiable min max | column |
| fol-eval | value count domain | — |
| unify | unifiable bindings steps | — |
| syllogism | valid validTraditional | — |
| kripke | value count worlds reflexive serial transitive symmetric euclidean axT axD ax4 ax5 axB | truth |
| tableau | valid satisfiable nodes worlds steps frame | — |
| epistemic | value count worlds steps frame | truth worldsLeft |
| ltl | value count | truth |
| ctl, dyadic | value count worlds | truth |
| io | entails triggered | — |
| norms | violations fulfilments pending conflicts steps frame | violationsPerStep activePerStep |
| af | extensions credulous skeptical accepted inCount steps frame | labels |
| aspic | args attacks defeats extensions credulous skeptical accepted inCount subClosed strictClosed directConsistent indirectConsistent transposed wellFormed axiomsConsistent steps frame | labels |
| bipolar | extensions credulous skeptical accepted inCount attacks direct supported secondary mediated extended safe closed steps frame | labels |

Every task has the scene `drawing`. A task with a trace and no picture of its own shows the trace as text lines (y = −i, `anchor:
start`), up to `frame`. The roles are: `hi` for a decision or the selected world, `ok` for true, fulfilled or in, `bad` for false,
violated, a clash or out, `warn` for undecided or pending, and `muted` for the rest.

## 5. Runtime codes (`flag`)

| code | when |
|---|---|
| `budget` | a bound was reached (§7); the result is NaN |
| `bound` | resolution stopped at `bound` clauses without □ |
| `trace-truncated`, `scene-truncated`, `series-truncated` | more than 2000 events, scene items or values |
| `size` | a CNF passed 2000 clauses |
| `vacuous` | a dyadic condition with no world, or out4 with no fitting valuation |
| `correspondence` | a frame axiom was read from its frame condition (> 14 worlds) |
| `deadlock` | CTL: a state got a self-loop |
| `not-serial` | O/P/F read on a frame that is not serial |
| `not-equivalence` | S5 closure changed an agent's relation |
| `inconsistent-input` | io: A has no model |
| `conflict`, `unresolved` | norm conflicts; one not resolved |
| `no-stable` | no stable extension |
| `occurs`, `clash` | unification failed |
| `grid-only` | a continuous logic checked on a grid |
| `contradiction` | a Horn constraint fired |
| `nd-error`, `nd-open`, `nd-goal` | proof diagnostics |
| `boundary` | the consecutive-numbers model is cut at n |
| `finite` | LTL read as a finite trace |
| `empty` | an announcement removed the actual world |
| `parse`, `norm` | (API) a norm with a broken formula or shape was skipped |
| `not-transposed`, `axioms-inconsistent`, `not-well-formed` | aspic: a condition of the rationality postulates does not hold (§3.11) |
| `postulate` | aspic: a postulate fails on an extension |

## 6. Validity and limits

| limit | value | reported as |
|---|---|---|
| formula length / depth | 2000 characters / 100 levels | `parse-long` / `parse-deep` |
| atoms for tables, io | 12 (4096 rows; the scene shows ≤ 1900 cells) | `size` (check), `scene-truncated` |
| SAT | 10⁵ decisions, 2·10⁵ clause visits | `budget` |
| resolution | 2000 clauses (propositional) / `bound` ≤ 2000 (500 by default), term depth 4 | `bound`, `budget` |
| tableau | 20 000 nodes | `budget` |
| worlds / CTL states | 32 / 256 | `size` (check) |
| domain | 8; the API's countermodel search ≤ 3 elements, 2¹⁶ predicate bits | `bounded`, `budget` |
| argumentation | 24 arguments, 600 attacks, 4096 labellings, 2·10⁵ search nodes | `budget` |
| ASPIC+ | 64 premises, 64 rules (256 with transposition), 200 arguments, 2·10⁵ combinations | `budget` |
| tableau B / S5 | 20 000 nodes, 256 worlds, 2·10⁶ rule applications | `budget` |
| norms / trace | 200 norms, 2000 steps (the API: 20 000 steps, 1000 agents) | `size`, `trace-truncated` |
| proof | 200 lines | `size` (check) |

Model checking is exact on the given model. Tableaux and truth tables are decision procedures. First-order resolution is
semi-decidable: no □ within the bound means "not shown", never "invalid". The modal tableaux decide **local** consequence.

## 7. Bounds and determinism

Every loop has a bound (§6), and the same spec gives the same output on every device: decisions take the lowest variable first,
the tableau tries the left disjunct first, the labellings try in → out → undec, and the clauses are visited in order. There is no
randomness.

## 8. Reference values asserted by `tests/lib_logic.js`

| value | source |
|---|---|
| De Morgan and Peirce's law are tautologies; p → q has 3 models of 4 | Enderton 2001 |
| PHP(3,2) unsatisfiable by DPLL and CDCL; DPLL = CDCL = truth table on 60 random 3-CNF | Cook & Reckhow 1979; Mitchell, Selman & Levesque 1992 |
| CDCL learns the unit a on (a∨b)(¬a∨b)(a∨¬b)(¬a∨¬b) | first-UIP, Zhang et al. 2001 |
| CNF/DNF/NNF equivalent, Tseitin equisatisfiable on 6 formulas; (p∧q)∨(r∧s) has 4 clauses | Tseitin 1968 |
| Fitch: hypothetical syllogism, excluded middle from nothing, ∨ commutes; every line code | Barwise & Etchemendy 1999 |
| AIMA Horn KB: forward chaining infers a, b, l, m, p, q | Russell & Norvig 2020 Fig. 7.16 |
| K3 has no tautologies; LP keeps them; Łukasiewicz loses contraction, Gödel keeps it; prelinearity in Ł, G, Π | Kleene 1952; Priest 1979; Hájek 1998 |
| ∀∃ vs ∃∀ on a 3-cycle; mgu {x ↦ g(z), y ↦ z}; occurs check; Skolem ∀x∀z R(x, sk1(x), z, sk2(x, z)) | Martelli & Montanari 1982; Skolem 1920 |
| Socrates; the drinker paradox is valid | Smullyan 1978 |
| 15 Boolean-valid / 24 traditionally valid syllogisms; Barbara, Darapti, Fresison | Venn 1880; Łukasiewicz 1951 |
| correspondence T D 4 5 B on 300 random frames | Sahlqvist 1975 |
| K valid in K; T, D, 4 by their systems; 5 not in S4 | Hughes & Cresswell 1996 |
| Ross, Chisholm (inconsistent in KD, consistent in DDL), good Samaritan, free choice | Ross 1941; Chisholm 1963; Prior 1958; Kamp 1973; Hansson 1969 |
| muddy children: k muddy know after k − 1 rounds; E vs C; D | Fagin et al. 1995 |
| Cheryl: 10 → 5 → 3 → 1, July 16 | SASMO 2015 |
| consecutive numbers (2, 3): Anne knows after two "I don't know" | van Ditmarsch, van der Hoek & Kooi 2007 |
| mutual exclusion: safety ✓, liveness ✗, non-blocking ✓, no strict sequencing ✓ | Huth & Ryan 2004 §3.3.4 |
| out1/out2/out3/out4 and throughput on the standard examples | Makinson & van der Torre 2000 |
| Nixon diamond, odd cycle, reinstatement; ideal ∅ with d skeptically preferred | Dung 1995; Dung, Mancarella & Toni 2007 |
| B: p → □◇p, ◇□p → p, ◇(p ∧ □q) ⊨ q; not 4. S5: 5, ◇□p → □p; □(p ∨ q) → □p ∨ □q fails | Hughes & Cresswell 1996 |
| snores / professor: 5 arguments, 2 rebuts, 1 defeat; last-link justifies AccessDenied, weakest-link ¬AccessDenied | Modgil & Prakken 2014 Ex. 3.23 |
| ring / party animal: without transposition direct consistency fails; with it all four postulates hold (8 arguments) | Caminada & Amgoud 2007 Ex. 4 |
| undercut always defeats; an axiom is never undermined; a contrary-rebut ignores preferences; elitist ≠ democratic | Modgil & Prakken 2013 Defs. 3.10–3.19 |
| supported, secondary, mediated and extended attacks on 3–4 arguments; support chains | Cayrol & Lagasquie-Schiex 2005, 2013 |

## 9. API for other engines (philo@1, rhetoric@1, law@1, agents@1)

These names on `window.NoemaLibLogic` are stable. `source()` returns `'(' + module + ')(self);'`. The module needs
`NoemaLibCore` first (`NoemaLibCore.source()`); NoemaExpr is needed only for numx expressions. `engine.workerSource` is a string
that holds NoemaExpr, the core and this module. ASTs are plain objects `{t, …}`: `atom n`, `top`, `bot`, `not a`, `and/or/xor/imp/iff a b`,
`all/ex v a`, `pred n args`, `eq l r`, `box/dia a ag?`, `O/P/F a c?`, `K/B ag a`, `EK/CK/DK g a`, `ann/annd f a`, `X/Fe/G a`,
`U/R/W a b`, `A/E p`; terms `{t: 'fn', n, args}`.

| function | returns |
|---|---|
| `parse(text, lang)` | `{ok, ast}` or `{ok: false, code, pos, msg}`; lang one of `LANGS` |
| `show(ast)`, `key(ast)`, `atomsOf(ast, out?)` | Unicode text; a canonical key; atoms in order |
| `evalProp(ast, valuation)` | boolean (missing atoms are false) |
| `evalMV(ast, valuation, logic)` | a degree 0–1 |
| `rowsOf(atoms)`, `truthTable(asts, atoms?)` | the rows TT…T first; `{atoms, rows, cols}` |
| `entails(premises, conclusion, opts)` | `{valid, counter, codes}`. `opts.logic`: `prop` (the first countermodel in row order, ≤ 20 atoms); `k3 lp l3 lukasiewicz godel product`; `K D T K4 S4 B S5` (tableau, no counter); `fol` (a countermodel among the structures of ≤ `maxSize` ≤ 3 elements, else valid with code `bounded`) |
| `nnf`, `cnfClauses(ast, limit, dual)`, `tseitin`, `sat(clauses, solver, D)`, `resolution`, `hornRule`, `forwardChain`, `backwardChain`, `checkProof(lines, goal)` | the propositional machinery (`D = diagSet()`) |
| `structure(m)`, `evalFol(ast, S, env, {ops: 0})`, `freeVars`, `unify(pairs, isVar, ev)`, `prenex`, `skolem`, `folClauses`, `folResolution`, `syllogism(mood, figure, existential)` | first-order |
| `kmodel(worlds, edges, opts)`, `satK(ast, M, ctx)`, `restrict(M, keep)`, `equivClose`, `frameProps`, `axiomValid`, `tableau(asts, system, D)`, `puzzle(pz)` | modal, deontic, epistemic, dyadic (ctx `{ops: 0, D, dyadic?}`) |
| `ctlSat(ast, M, {ops: 0})`, `ltlVals(ast, n, succ, val)`, `MUTEX()` | temporal |
| `ioLogic(G, A, x, op, throughput, atoms)` | `{entails, triggered, codes}` |
| `evalNorms(norms, trace, opts)` | `{violations, fulfilments, pending, conflicts, codes, counts, perStep, activePerStep}` |
| `normMonitor(norms, opts)` | `{step(st) → {violations, fulfilments}, result()}` |
| `afSolve(n, attacks, D)` | `{grounded, iters, complete, preferred, stable, atk}` |
| `aspic(theory, opts)` | theory `{kb: [{f, kind, rank}], rules: [{id, body, head, kind, rank}], contraries: [[u, v]]}` (literals as text `p` `¬p` `~p` or `-p`), opts `{link, ordering, transpose}` → `{args: [{conc, rule, kb, subs, sub, prem, defRules, lastDefRules, strict, firm}], rules, kb, attacks: [[a, b, kind]], defeats, n, att, less(i, j), postulates(labellings), transposed, axiomsConsistent, wellFormed, codes}`; `afSolve(r.n, r.att, D)` gives the extensions |
| `bipolar(n, attacks, supports, mode)` | `{att, kind: {'a,b': direct | supported | secondary | mediated | extended}, reach, safe(l), closed(l), mode}`; `SUPPORTS` lists the modes |
| `litOf(text | ast)` | `'p'`, `'-p'` or null |
| `tableauGlobal(asts, 'B' | 'S5', D)` | the B / S5 tableau (`tableau` and `entails` call it for those systems) |
| `AF.grounded / complete / preferred / stable / semiStable / ideal (n, attacks)` | labellings (1 in, 0 out, ½ undec) |
| `AF.accept(n, attacks, semantics, arg)` | `{credulous, skeptical}` |

**`evalNorms` for agents@1.**
- `opts.order` sets the conflict order.
- `opts.perAgent: true`, or `norm.scope: 'each'`, makes one instance per agent seen in `acts` or `facts` maps.
- `step.acts` and `step.facts` may be maps `{agentId: [atoms]}`; facts may also have `'*'` for shared facts. An agent's instance
  sees its own acts and facts plus the shared ones. A norm with `agent` sees only that agent's; a global norm sees the union.
- Records: violation `{norm, agent?, step, t, act, kind: deadline | maintain | forbidden, since}`, fulfilment
  `{norm, agent?, step, t, since}`, pending `{norm, agent?, since}`, conflict `{step, t, a, b, agent?, winner | null, by}`.
- `evalNorms(norms, trace)` is exactly a monitor fed every step, then `result()`.

ASPIC+ arguments are built by `aspic` (§3.11): an engine passes its theory and solves `r.att` with `afSolve`.

## 10. Sources

Caminada & Amgoud 2007 (AIJ 171:286, rationality postulates) · Cayrol & Lagasquie-Schiex 2005 (ECSQARU LNAI 3571:378), 2013
(IJAR 54:876) · Modgil & Prakken 2013 (AIJ 195:361), 2014 (Argument & Computation 5:31) · Nouioua & Risch 2010 (SUM, LNCS 6379) ·
Prakken 2010 (Argument & Computation 1:93) · Alchourrón & Makinson 1981 (hierarchies of regulations) · Åqvist 1987 (*Introduction to Deontic Logic and the Theory of Normative
Systems*) · Barwise & Etchemendy 1999 (*Language, Proof and Logic*) · Blackburn, de Rijke & Venema 2001 (*Modal Logic*) · Caminada
2006 (labellings, semi-stable) · Chisholm 1963 (Analysis 24:33) · Clarke, Emerson & Sistla 1986 (ACM TOPLAS 8:244) · Davis &
Putnam 1960; Davis, Logemann & Loveland 1962 · De Giacomo & Vardi 2013 (IJCAI, LTLf) · Dignum, Broersen, Dignum & Meyer 2004
(deadlines) · Dowling & Gallier 1984 · Dung 1995 (AIJ 77:321) · Dung, Mancarella & Toni 2007 (AIJ 171:642) · Enderton 2001 (*A
Mathematical Introduction to Logic*) · Fagin, Halpern, Moses & Vardi 1995 (*Reasoning About Knowledge*) · Fitch 1952 · Fitting
1983 · Gödel 1932 · Goré 1999 (*Handbook of Tableau Methods*) · Governatori 2015 (ICAIL); Governatori & Rotolo 2010 · Hájek 1998 ·
Hansson 1969 · Huth & Ryan 2004 (*Logic in Computer Science*) · Kamp 1973 · Kleene 1938, 1952 · Łukasiewicz 1920 · Makinson & van
der Torre 2000 (J. Phil. Logic 29:383) · Marques-Silva & Sakallah 1999 · Martelli & Montanari 1982 · Modgil & Caminada 2009 ·
Moskewicz et al. 2001 (Chaff) · Plaza 1989 · Pnueli 1977 · Prakken & Sergot 1996 · Priest 1979 · Prior 1958 · Robinson 1965 (J. ACM
12:23) · Ross 1941 · Russell & Norvig 2020 (AIMA 4th ed.) · Sahlqvist 1975 · Sartor 2005 · Skolem 1920 · Smullyan 1978 · Tarski 1933 ·
Tseitin 1968 · van Ditmarsch, van der Hoek & Kooi 2007 (*Dynamic Epistemic Logic*) · Venn 1880 · von Wright 1951, 1968.
