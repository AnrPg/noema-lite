# `law@1` — computable legal reasoning (`src/engines/law/law.ts`, `NoemaLibLaw`)

`law@1` is a general, **jurisdiction-neutral** engine of the library (`docs/INTERACTIVE_LIBRARY.md`). It provides tools:

- Every statute, threshold, calendar, sentencing grid, set of shares, voting rule and citation shape is the **author's data**.
- The engine only computes, and it holds no rule of any one country.
- Logic is never re-implemented: literals are parsed by logic@1 (`NoemaLibLogic.parse`), Dung frameworks are solved by
  `afSolve`, and obligations over time are checked by `evalNorms` (docs/library/logic.md §9).
- The research behind this chapter is in `/mnt/project-files/engine-library/research/law.md`.

There are 16 tasks (`model.task`):

| task | what it computes | main sources |
|---|---|---|
| `rules` | statutes as defeasible rules with exceptions and priorities: which rules fire, which are defeated and by whom, which are blocked | Antoniou, Billington, Governatori & Maher 2001 (ACM TOCL 2:255); Prakken & Sartor 1996, 1997; Alchourrón & Makinson 1981; Hart 1958 |
| `aspic` | structured arguments (ASPIC+), argument schemes with critical questions, solved as Dung frameworks | Modgil & Prakken 2013 (AIJ 195:361); Prakken 2010; Walton, Reed & Macagno 2008; Dung 1995 |
| `carneades` | proof standards over argument graphs | Gordon, Prakken & Walton 2007 (AIJ 171:875); van Gijzel & Nilsson 2014 (CarneadesDSL) |
| `hohfeld` | jural relations, their correlatives and opposites, contradictions and conflicts of duties | Hohfeld 1913 (23 Yale LJ 16), 1917 (26 Yale LJ 710); Kanger 1972; Lindahl 1977; Sergot 2013 |
| `proof` | burdens and standards of proof as thresholds, Bayes, Kaplan's threshold, presumptions, the conjunction paradox | McCauliff 1982; Kaplan 1968; Thayer 1898; Morgan 1933; Cohen 1977; Allen 1986 |
| `cases` | HYPO / CATO factors: on point, most on point, best cases, distinctions; a fortiori constraint, consistency, permissible decisions | Ashley 1990; Aleven 2003 (AIJ 150:183); Horty 2011; Prakken 2021 |
| `deadline` | periods, business days, month ends, rolling over weekends and holidays, tolling, long-stops | EU Reg. 1182/71 Art. 3; FRCP 6(a); BGB §§187–193 (as data); Hinnant 2013 |
| `contract` | formation in time: offer, acceptance, revocation, rejection, counter-offer, lapse; criteria; capacity | Adams v Lindsell 1818; Byrne v Van Tienhoven 1880; CISG 16, 18, 19; UCC 2-205, 2-207; Restatement (Second) §§40, 42, 70 |
| `damages` | expectation, reliance, restitution, mitigation, foreseeability, market differential, liquidated damages or penalty, interest | Restatement (Second) of Contracts §§344–356, 371; Hadley v Baxendale 1854; UCC 2-713 |
| `crime` | element checklists with MPC culpability, causation, defences, offence ladders | ALI Model Penal Code 1962 §§1.13, 2.02, 2.03, 2.05, 210.2–210.4 |
| `sentence` | sentencing as a rule table: points → category, level adjustments, statutory limits | USSG ch. 5 pt A and §5G1.1 (one data set) |
| `proportionality` | legitimate aim, suitability, necessity, balancing by Alexy's weight formula | Alexy 2003 (Ratio Juris 16:433), 2007; BVerfGE 7, 377; R v Oakes 1986; Bank Mellat (No 2) 2013 |
| `vote` | quorum, majorities, ties and casting votes, weighted and double majorities, blocking minority, Banzhaf and Shapley–Shubik power | Robert's Rules 12th ed. §44; TEU 16(4); Banzhaf 1965; Shapley & Shubik 1954; Brams & Affuso 1976; Felsenthal & Machover 1998 |
| `citation` | parsing citations: ECLI, neutral, reporter, series, provisions, the author's templates | Council conclusions 2011/C 127/01; UK Practice Direction 2001; The Bluebook 21st ed. |
| `shares` | succession (priority sums, fixed shares, ʿawl, radd, residuaries, escheat) and division (proportional, CEA, CEL, the Talmud) | Qurʾān 4:11–12, 4:176; Coulson 1971; Powers 1986; Kethuboth 93a; Aumann & Maschler 1985; Thomson 2003 |
| `obligations` | contract clauses over a dated trace in calendar or business days: violations, fulfilments, contrary-to-duty repair, penalties | logic@1 `evalNorms` (Dignum et al. 2004; Prakken & Sergot 1996); Governatori 2005 |

**Python twin.** `tools/lib_law.py` has the same tables (copied from the module as JSON). It parses literals with
`tools/lib_logic.py`, and it gives the same problems, `exprs` and `keys` as the JS on every fixture. It does not compute the
tasks.

**Tests.**
- `node tests/lib_law.js` has 182 assertions:
  - the published values and every edge code;
  - the check codes;
  - the parity on `tests/fixtures/enginelib/law.json` (46 specs: 21 good, 25 bad);
  - the JSON Schema of the author's form;
  - the adapter, the Worker and speed;
  - the reference activity.
- `node tests/enginelib.js` adds the parity once the catalogue lists `law@1`.

**Reference activity.** `tools/activities_examples/vehicles-in-the-park` works through Hart's "no vehicles in the park" with an
emergency exception and a war-memorial exception.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "law@1",
  "params": [ { "id": "ambulance", "kind": "toggle", "label": "ambulanceLabel", "default": false },
              { "id": "emergency", "kind": "toggle", "label": "emergencyLabel", "default": false },
              { "id": "memorial", "kind": "toggle", "label": "memorialLabel", "default": false } ],
  "model": { "task": "rules", "query": "forbidden",
    "rules": [ { "id": "s2", "if": ["ambulance"], "then": "vehicle", "kind": "strict" },
               { "id": "s3", "if": ["memorial"], "then": "vehicle", "kind": "strict" },
               { "id": "r1", "if": ["vehicle"], "then": "forbidden", "unless": ["memorial"], "issued": 1958, "label": "ruleNoVehicles" },
               { "id": "r2", "if": ["vehicle", "emergency"], "then": "~forbidden", "issued": 1990 } ],
    "toggles": [ { "lit": "ambulance", "on": "ambulance" }, { "lit": "emergency", "on": "emergency" }, { "lit": "memorial", "on": "memorial" } ] },
  "outputs": [ { "id": "forb", "kind": "scalar", "of": "holds" },
               { "id": "r1s", "kind": "scalar", "of": "status", "at": "r1" },
               { "id": "pic", "kind": "scene", "of": "drawing" } ],
  "plots": [ { "kind": "scene", "of": "pic", "title": "sceneTitle" } ] }
```

- **Literals** are `p` or `~p`, parsed by logic@1. Atoms are `[A-Za-z_][A-Za-z0-9_]*`, and the logic's words (`not`, `true`, …)
  are not atoms. Anything else gets the code `literal`, or the parser's own `parse-*` code with its position.
- **Formulas** appear only in `obligations` (`cond`, `act`, `deadline`, `until`). They are full propositional formulas of logic@1.
- **Numbers** written `numx` (any `on`, weight, probability, amount, date offset, vote count, share…) are a number or a NoemaExpr
  expression over the spec's names. So a slider or a toggle can drive any of them. `on` switches a part off when it is ≤ 0.5.
  `exprs(spec)` lists every one as `[source, path, []]`, in table order.
- **Keys.** The `label` fields of rules, schemes, arguments, issues, factors, cases, elements, items, offences, defences,
  voters and heirs are string-table keys. A scene shows a part's key when it has one, and otherwise its id or its own text as
  `s` (≤ 64 characters). `keys(spec)` lists them.
- **Outputs**: `{id, kind: scalar | series | scene, of, code?, at?, name?}`.
  - `at` names a part for the per-part scalars of §4.
  - `name` names a citation field (`of: "field"`).
  - `flag` takes a `code` of §5.
- **The run.** `run(spec, env)` → `{out, diag, codes, scalars, series}`. Booleans come out as 1 or 0, and what cannot be computed
  as NaN, with a code.

### 1.1 The model (`model`), by task

Each table lists only that task's fields. Every field belongs to one table, `MODEL_T`, which both twins walk.

**rules** — `rules` (≤ 200) is required.

| field | meaning |
|---|---|
| `rules[]` | `{id, if: [lit] ≤ 32, then: lit, kind: strict \| defeasible (default) \| defeater, unless: [lit] ≤ 16, rank, issued, on, label}` |
| `sup[]` | `{win, lose}`: explicit superiority, which wins over the derived ones |
| `order` | the criteria for the derived priorities: `superior` (`rank`, higher wins), `specialis` (a strictly larger body wins), `posterior` (a later `issued` wins). The default is all three in that order. |
| `facts` / `toggles[] {lit, on}` | strict facts; a toggled fact holds while `on` > 0.5 |
| `query` | the literal asked about |
| `variant` | `blocking` (default) or `propagating` (ambiguity propagation, §2.1) |
| `loops` | `undecided` (default) or `fail` (failure by looping, §2.1) |

**aspic** — one of `premises`, `rules` or `schemes` is required.

| field | meaning |
|---|---|
| `premises[]` | `{lit, kind: axiom \| ordinary (default), rank, on}` |
| `facts` / `toggles` | also axioms |
| `rules[]` | `strict` or `defeasible`. A rule that concludes `~<rule id>` undercuts that rule. An `unless e` adds the undercutter `e ⇒ ~<id>`. |
| `schemes[]` | `{id, scheme, if, then, rank, cqs: [{cq, lit?, on}], on, label}`: an instance of a scheme is a defeasible rule. A raised critical question is an ordinary premise (`lit`, default `cq_<id>_<cq>`) with an undercutter of the instance. |
| `link` | `last` (default) or `weakest` |
| `closure` | `none` (default) or `transposition`: the strict rules are closed under transposition (§2.2) |
| `semantics` | `grounded` (default), `preferred`, `stable` or `complete` |

**carneades** — `args` (≤ 100) is required.

| field | meaning |
|---|---|
| `args[]` | `{id, if: [lit], unless: [lit], then: lit, weight: 0–1 (default 1), on, label}` |
| `assume` / `toggles` | the audience's assumptions |
| `standards[]` | `{lit, ps: scintilla \| preponderance \| clear-convincing \| brd \| dv}` (default scintilla) |
| `alpha`, `beta`, `gamma` | defaults 0.4, 0.3 and 0.2 |

**hohfeld** — `positions` is required.

| field | meaning |
|---|---|
| `positions[]` | `{kind: right \| duty \| privilege \| noright \| power \| liability \| immunity \| disability, holder, other, act: lit, passive, on}`; `passive: true` makes the act "stay passive about the atom" (Pass, §2.4), and then `act` must be an atom |
| `ask` | the same shape without `on`: the position asked about |
| `lindahl` | `{agent, atom, other?}`: compute Lindahl's one-agent type of `agent` about `atom`, and with `other` the joint alternatives (§2.4) |

**proof** — `issues` (≤ 32) is required.

| field | meaning |
|---|---|
| `issues[]` | `{id, p \| prior + lr[], standard: scintilla \| preponderance (default) \| clear-convincing \| brd \| decision \| custom, threshold, burden: claimant \| defendant, presumed: issue id, mode: thayer \| morgan, rebut, label}` |
| `costs` | `{fp, fn}` for the `decision` standard |
| `claim` | the ids of the issues that make the claim |
| `aggregate` | `element` (default) or `product` |
| `query` | an issue id |

**cases** — `cases` and one of `factors` or `dimensions` are required.

| field | meaning |
|---|---|
| `factors[]` | `{id, side: p \| d, label}` |
| `dimensions[]` | `{id, side: p \| d, label}` (≤ 32): a dimension with a magnitude; `side` is the side it favours more as the value grows |
| `cases[]` | `{id, factors, values: [{dim, v}], outcome: p \| d, reason?, label}` |
| `facts` / `toggles` | the current fact situation, as factor ids |
| `values[]` | `{dim, v: expr}`: the current situation's magnitudes |
| `side` | the side argued for (default p) |
| `focus` | the case the per-case scalars read (default: the best case) |
| `reasoning` | `result` (default) or `reason` |

**deadline** — `start` and `period` are required.

| field | meaning |
|---|---|
| `start` | a date `YYYY-MM-DD`, 1600–2400 |
| `period` | `{n, unit: days \| weeks \| months \| years \| business}` |
| `excludeStart` | default true |
| `roll` | `next` (default), `previous` or `none` |
| `monthEnd` | `last` (default) or `next` (overflow) |
| `weekend` | weekday numbers 0–6 (default [0, 6]: Sunday and Saturday) |
| `holidays` | dates |
| `tolling[]` | `{from, to}` (inclusive) |
| `longstop` | `{n, unit}`, counted from `start` |
| `asOf` | days after `start` |

**contract** — `events` (≤ 64) is required.

| field | meaning |
|---|---|
| `events[]` | `{kind: offer \| counteroffer \| revocation \| rejection \| acceptance \| lapse, by, t (dispatch), arrive (receipt, default t), terms, on}` |
| `acceptRule` | `dispatch` (default) or `receipt` |
| `revokeRule` | `receipt` (default) or `dispatch` |
| `firm` | an irrevocable offer |
| `mirror` | `strict` (default) or `material` |
| `material` | the terms that count as material |
| `elements[]` | `{id, holds, label}`: the formation criteria (consideration, cause, form, …) as data |
| `parties[]` | `{id, age, minAge (18), capable}` |

**damages** — `items` or `price` is required.

| field | meaning |
|---|---|
| `items[]` | `{id, kind: loss \| incidental \| consequential \| cost-avoided \| loss-avoided \| reliance \| benefit, amount, foreseeable, avoidable, on, label}` |
| `price`, `market` | the contract price and the market price, for the market differential |
| `measure` | `expectation` (default), `reliance` or `restitution` |
| `liquidated` | `{amount, anticipated?, ratio (1)}` |
| `interest` | `{rate, years, kind: simple \| compound \| continuous, per (1), principal?}` |

**crime** — `offences` (≤ 16) is required.

| field | meaning |
|---|---|
| `offences[]` | `{id, elements: [{id, kind: conduct \| circumstance \| result, mind?, label}] 1–16, mind?, grade: felony \| misdemeanor \| violation, rank, label}` |
| `proven[]` | `{element, holds, mind: 0–4}` (4 purpose, 3 knowledge, 2 recklessness, 1 negligence, 0 none) |
| `defences[]` | `{id, kind, holds, offences?}` |
| `causation` | `{butFor, proximate}` |

**sentence** — `grid` is required.

| field | meaning |
|---|---|
| `grid` | `{first (1), cats: rising lower bounds of points, rows: [[lo, hi] per category] ≤ 100}` |
| `level` | the base offence level |
| `points` | the criminal-history points |
| `adjust[]` | `{id, delta, on}` |
| `min`, `max` | the statutory limits |

**proportionality** — `weights` is required.

| field | meaning |
|---|---|
| `weights` | `{Ii, Wi, Ri, Ij, Wj, Rj}`: i is the right the measure infringes, j the principle it serves; each defaults to 1 |
| `scale` | `triadic` (default), `double` or `continuous` |
| `extra[]` | `{side: i \| j, I, W, R}`: further principles, added on their side |
| `aim` | the legitimate aim (> 0.5 holds) |
| `effect`, `burden` | the measure's effectiveness and the burden it imposes |
| `suitable` | overrides the suitability test, which is otherwise effect > 0 |
| `alternatives[]` | `{id, effect, burden, on}` |

**vote** — `yes` or `voters` is required.

| field | meaning |
|---|---|
| `members`, `present`, `yes`, `no`, `abstain` | the counts of a simple body |
| `abstentions` | `excluded` (default) or `no` |
| `quorum` | ≤ 1 is a fraction of the members, > 1 a number present |
| `base` | `cast` (default), `present` or `members` |
| `majority` | the fraction (0.5) |
| `strict` | more than (default) or at least |
| `tie`, `chair` | `fails` or `chair`; the chair's casting vote `yes` or `no` |
| `voters[]` | `{id, weight, pop, yes, label}` ≤ 64 |
| `quota` | ≤ 1 is a fraction of the total weight; the default is more than half |
| `popQuota`, `countQuota` | the population and member-count quotas of a double majority |
| `blocking` | the size of a blocking minority |
| `voter` | the voter the scalar indices read |

**citation** — `text` (≤ 200 characters) is required.

| field | meaning |
|---|---|
| `patterns[]` | `{id, template}`: literal text and `{name:int \| word \| text \| year}`; a space matches any run of spaces |
| `kinds` | which built-in shapes are tried, in order (default all: `ecli`, `neutral`, `reporter`, `series`, `provision`) |

**shares** — `heirs` and `estate` are required.

| field | meaning |
|---|---|
| `heirs[]` | `{id, share (a fraction), first (a priority sum), weight (residuary), claim, radd (default true), on, label}` |
| `deficit` | `radd` (default) or `escheat` |
| `division` | `proportional`, `cea`, `cel` or `talmud`: with claims, divide as a bankruptcy problem |

**obligations** — `norms` and `trace` are required.

| field | meaning |
|---|---|
| `norms[]` | `{id, kind: O \| F \| P, cond, act, deadline, within (steps), until, rank, issued, penalty, on}`: logic@1's norms plus a penalty |
| `trace[]` | `{day \| date, facts, acts}` ≤ 2000 |
| `start` | the date the trace starts |
| `count` | `calendar` (default) or `business` |
| `horizon` | the number of steps (default: the last day + 1) |
| `order` | as in `rules` |
| `step` | how many steps are checked |

### 1.2 Checker codes (`checkSpec`, the same in `tools/lib_law.py`)

| code | when |
|---|---|
| `format`, `value`, `enum`, `size`, `unknown-field` (warning) | the core's walk of `MODEL_T` |
| `value` | a part the task needs is missing (`missing (rules needs rules)`); a defeater in `aspic`; an issue that presumes itself; a `custom` standard without `threshold`; `decision` without `costs`; a tolling interval that ends before it starts; `day` and `date` together; dated steps or business days without `start`; a relation between one person and themself; a bad citation field `name` |
| `literal` | a rule, premise, argument, assumption, standard or position act that is no literal |
| `parse-*` | logic@1's parse codes, with their positions |
| `duplicate` | an id listed twice (rules, schemes, arguments, issues, factors, cases, elements, parties, items, offences, defences, adjustments, alternatives, voters, patterns, heirs, norms, the elements of one offence) |
| `ref` | `sup`, `presumed`, `claim`, `query` (proof), case factors and reasons, `facts` and `toggles` (cases), `focus`, `proven.element`, `defences.offences`, `voter`, an output's `at` |
| `cq` | a critical question the scheme does not have (the message lists the scheme's own) |
| `cycle` | the Carneades arguments form a cycle (the message names a statement on it) |
| `date` | a date that does not exist or lies outside 1600–2400 |
| `grid` | a row without two numbers for each category; category bounds that do not rise |
| `pattern` | a bad citation template (an unknown placeholder, a name used twice, a lone `}`, more than 12 placeholders, none at all) |
| `output` | an `of` the task does not compute (the message lists those it does) |

## 2. Methods, step by step

### 2.1 `rules` — defeasible logic

By default the engine uses ambiguity-blocking defeasible logic with team defeat (Antoniou, Billington, Governatori & Maher 2001). It has
four tags:

- **+Δq**: q is a fact, or some strict rule for q has every body literal +Δ.
- **−Δq**: q is no fact, and every strict rule for q has a body literal −Δ.
- **+∂q**: +Δq; or −Δ∼q, some strict or defeasible rule for q is applicable (its body is +∂), and every rule s for ∼q is
  discarded (a body literal −∂) or beaten by an applicable rule t for q with t > s.
- **−∂q**: −Δq, and either +Δ∼q, or every rule for q is discarded, or some applicable s for ∼q is beaten by no applicable t.

**Exceptions.** `unless e` becomes a defeater e ⇝ ∼head that is superior to its rule (Prakken & Sartor 1996). It inherits the
rule's `rank` and `issued`.

**Priorities.** Explicit `sup` comes first. Then each conflicting pair is ordered by the criteria in `order`.

**The fixpoint** is computed over the literals of the theory in at most 4·|literals| + 10 passes.

**The status of each rule:**
- 2: it fires (applicable, and its head is +∂; for a defeater, it blocks its target);
- 1: it is applicable but defeated;
- 0: it is blocked (a body literal is −∂);
- ½: undecided.

**Ambiguity propagation** (`variant: propagating`; Antoniou, Billington, Governatori, Maher & Rock 2000). The support tags:
- **+Σq**: +Δq, or some strict or defeasible rule r for q has every body literal +Σ and every rule s for ∼q is discarded or
  not superior to r;
- **−Σq**: −Δq, and every rule for q has a body literal −Σ or is beaten by an applicable s for ∼q with s > r.

In +∂ and −∂ an attacker then counts as soon as it is *supported* (every body literal +Σ), and is discarded only when it is
unsupported. An ambiguous literal so spreads its ambiguity: with Quaker and Republican, blocking proves ¬antimilitary, and
propagating proves neither. The scalar `supported` is 1 when `query` is +Σ (NaN under blocking).

**Failure by looping** (`loops: fail`; Maier & Nute 2006, Billington 2008, the well-founded defeasible logics). After each
fixpoint the greatest unfounded set of the literals still undecided is refuted (−Δ, −∂, −Σ): those with no rule whose body
avoids both the refuted literals and the set itself. Then the fixpoint runs again, until nothing changes. A positive loop
p ⇐ q ⇐ p so gives −∂p (code `loop`), and a rule with the exception p applies.

**Codes.**
- `inconsistent`: q and ∼q are both +Δ.
- `unresolved`: two applicable rules conflict, neither is superior, and nothing is proved.
- `undecided`: some literal is neither +∂ nor −∂. This happens with positive loops, a known limit of the basic proof theory
  (Maher 2001). With `loops: fail` it is resolved instead (code `loop`).

**The scene** shows one node per rule (ok fires, bad defeated, muted blocked, warn undecided) and arrows from a superior rule to
the rule it beats.

### 2.2 `aspic` — ASPIC+ with schemes

**Building the arguments** (Modgil & Prakken 2013). The arguments are premise arguments plus rule applications over existing
arguments. They are non-circular: an argument never repeats a conclusion on a branch. There are at most 400 arguments, and
reaching that limit gives code `budget`.

**Attacks:**
- **undercut**: the conclusion is `~<rule id>` of a defeasible top rule. An undercut always defeats.
- **rebut** (restricted): on the conclusion of a defeasible top rule.
- **undermine**: on an ordinary premise.

**Defeats.** A rebut or undermine defeats unless the attacker is strictly weaker than the attacked sub-argument. The comparison
uses the elitist set ordering (∃X ∈ S1 ∀Y ∈ S2: X < Y; a strict, firm argument beats everything) over:
- the last defeasible rules (`link: last`; for a premise argument, its ordinary premises), or
- all defeasible rules and ordinary premises (`link: weakest`).

**Solving.** The defeat graph goes to logic@1 `afSolve`.
- `accepted`: some argument for `query` is in every extension of `semantics` (grounded: the grounded one). With no stable
  extension, acceptance is vacuously true and the code is `no-stable`.
- `credulous`: some argument for `query` is in some extension.
- `inconsistent`: two strict, firm arguments conclude q and ∼q.

**Schemes.** The ids of the critical questions are the scheme's own (Walton, Reed & Macagno 2008, ch. 9):

| scheme | critical questions (ids) |
|---|---|
| `expert` | expertise field opinion trustworthy consistent evidence |
| `witness` | position truthful consistent bias plausible |
| `position-to-know` | position honest asserted |
| `precedent` | onpoint distinguish overruled binding |
| `analogy` | similar difference counter |
| `rule` | applies exception valid conflict |
| `consequences` | likely evidence opposite |
| `sign` | strength other-cause |
| `cause` | correlation intervening strength |
| `commitment` | committed retracted |

**Closure under transposition** (`closure: transposition`; Caminada & Amgoud 2007, Modgil & Prakken 2013 §3.2). For every
strict rule φ1 … φn → ψ and each i, the rule φ1 … ∼ψ … φn → ∼φi is added (strict, with the rule's rank; its id is
`<id>^<i>`), once for each distinct body and head. This restores the rationality postulates of direct and indirect
consistency. In Caminada & Amgoud's example (wr ⇒ m, go ⇒ b, m → hs, b → ¬hs) the plain theory accepts m, b, hs and ¬hs
together; with the closure, none of them. One pass is the whole closure: transposing a transposed rule gives back the
rule or another of its n transpositions.

### 2.3 `carneades`

The definitions are those of van Gijzel & Nilsson 2014 (CarneadesDSL).

**An argument is applicable** when:
- every premise p is assumed, or is acceptable while ∼p is not assumed; and
- every exception e is not assumed, and either ∼e is assumed or e is not acceptable.

**A statement is acceptable** by its proof standard. Let mp be the largest weight of an applicable pro argument and mc that of
an applicable con argument (0 when there is none):

| standard | the statement is acceptable when |
|---|---|
| `scintilla` | there is an applicable pro argument |
| `preponderance` | mp > mc |
| `clear-convincing` | mp > α and mp − mc > β |
| `brd` | clear-convincing, and mc < γ |
| `dv` | there is a pro argument and no con argument |

The graph must be acyclic (check code `cycle`). A weight outside 0–1 is clamped, with code `weight`.

### 2.4 `hohfeld`

Every position reduces to one fact with a value:
- first-order positions to D(x, y, a), "x owes y that a";
- second-order positions to Pw(x, y, c).

| position | its fact |
|---|---|
| right(h, o, a) | D(o, h, a) |
| duty(h, o, a) | D(h, o, a) |
| privilege(h, o, a) | ¬D(h, o, ∼a) |
| no-right(h, o, a) | ¬D(o, h, a) |
| power(h, o, c) | Pw(h, o, c) |
| liability(h, o, c) | Pw(o, h, c) |
| immunity(h, o, c) | ¬Pw(o, h, c) |
| disability(h, o, c) | ¬Pw(h, o, c) |

- **Correlatives** are the same fact read from the other party.
- **Opposites** are the same fact with the other value: a stated pair of opposites gives `contradictions` and code
  `contradiction`.
- **SDL D** (O a → ¬O ∼a). A stated duty also gives the privilege to do it, unless something says otherwise. D(a) and D(∼a)
  both true is a conflict of duties (`conflicts`, code `conflict`).
- **The query.** `holds` is 1 when the asked position follows, 0 when its opposite does, and ½ when nothing is known or the facts
  contradict each other.
- **Counts.** `positions` is the number of descriptions (2 per fact value), and `derived` the number of those that were not
  stated.

**Lindahl's types** (Lindahl 1977, *Position and Change*; Kanger 1972; Sergot 2013). About an atom p an agent x has three
exhaustive alternatives: Do(x, p), Do(x, ¬p) and Pass(x, p) (doing neither). A duty of x (towards anyone, correlatives
included) to see to p forbids Do ¬p and Pass; to ¬p forbids Do p and Pass; a passive duty (`passive: true`) forbids both
doings. The one-agent type is the set of permitted alternatives (`lindahl`, and `lindahlOther` for `other`), numbered in this
engine's order:

| type | permitted | type | permitted |
|---|---|---|---|
| 1 | Do p, Do ¬p, Pass | 5 | Do ¬p, Pass |
| 2 | Do p, Do ¬p | 6 | Do ¬p |
| 3 | Do p, Pass | 7 | Pass |
| 4 | Do p | 0 | none: code `conflict` |

With two agents there are 7 possible joint alternatives (Do(x, p) with Do(y, ¬p), and its mirror, are impossible), in the
order (x, y) = (Do p, Do p), (Do p, Pass), (Do ¬p, Do ¬p), (Do ¬p, Pass), (Pass, Do p), (Pass, Do ¬p), (Pass, Pass). A joint
alternative is permitted when both its parts are. `joint` is their bit set (bit i for the i-th; the series `joint` lists
them) and `jointCount` how many; none gives code `conflict`. The engine reports the joint permission set, not Lindahl's
classification into his 26 two-agent types, which are a partition of these sets by symmetry.

### 2.5 `proof`

**The probability of an issue.**
- p is the issue's own; or
- p comes from the prior odds times the product of the likelihood ratios.
- A value outside 0–1 gives code `probability` and NaN.

**The threshold.**
- `threshold`, when given; else
- the standard's default (McCauliff 1982): scintilla 0, preponderance 0.5, clear-convincing 0.75, brd 0.9;
- for `decision`: Cfp / (Cfp + Cfn) (Kaplan 1968; with fp = 10 and fn = 1, Blackstone's 10/11).

An issue is established when p > the threshold.

**Presumptions.** Once the base issue is established:
- `thayer`: the presumed fact stands unless `rebut` > 0, and then it is decided on its own p.
- `morgan`: it stands unless 1 − p > its threshold, so the opponent must disprove it.
Either way the code is `shifted`.

**The claim.** The claim is element by element (`aggregate: element`) or the product of its issues' probabilities against the
largest threshold (`product`). When the two disagree the code is `conjunction` (Cohen 1977).

**The winner** of an issue: when the issue is not established, the side that bears the burden loses it (1 = claimant,
−1 = defendant).

### 2.6 `cases`

Sources: Ashley 1990, Aleven 2003, Horty 2011.

**Terms.**
- **shared(c)**: the factors c shares with the current fact situation (cfs).
- **on point**: shared(c) is not empty.
- **more on point** (the claim lattice): shared(a) ⊋ shared(b).

**What is counted.**
- `mostOnPoint`: the on-point cases that no other case is more on point than.
- `best`: the most on-point cases decided for `side`.
- `distinctions(c)`, in the CATO way: c's factors for its winner that are absent from the cfs, plus the cfs factors for c's
  loser that are absent from c.

**Precedential constraint.** A precedent c for s **forces** s in a situation F when:
- its reason R ⊆ F (in the result model, R = all of c's pro-s factors; in the reason model, its `reason`); and
- every factor of F for the other side is in c; and
- on every dimension both c and F have a value, F is at least as favourable to c's winner (Horty 2019, "Reasoning with
  dimensions and magnitudes", AI & Law 27:309; Prakken 2021): for a dimension favouring s, v(F) ≥ v(c) when c was won by s,
  else v(F) ≤ v(c).

A dimension both have counts in `shared(c)`, and one where F is weaker for c's winner counts as a distinction.

**The scalars.**
- `forced`: 1 (π), −1 (δ) or 0. Both together gives code `inconsistent`.
- `consistent`: no precedent forces the opposite outcome in another precedent's facts.
- `permissible`: deciding the cfs for `side` is forced against by no precedent, and the new case (result model) forces no
  opposite precedent.
- No on-point case gives code `no-precedent`.

### 2.7 `deadline`

The calculation goes in this order:

1. **Dates.** The proleptic Gregorian calendar, by Hinnant's days-from-civil. The output `end` is the number of days since
   1970-01-01, and `weekday` is 0 for Sunday through 6 for Saturday.
2. **The period.**
   - `days`: start + n (start + n − 1 with `excludeStart: false`).
   - `weeks`: + 7n.
   - `months` / `years`: the same date. When the month has no such date, its last day (code `month-end`), or the overflow with
     `monthEnd: next`.
   - `business`: the n-th day after the start that is neither in `weekend` nor in `holidays`.
3. **Tolling.** Each tolling interval that overlaps the running period adds its days, counted from the day after the start;
   each interval is counted once (code `tolled`).
4. **Rolling.** A last day on a weekend or a holiday moves to the next (or previous) working day (code `rolled`).
5. **The long-stop.** It caps the end (code `longstop`).
6. **asOf.** `expired` (code `expired`) and `remaining` (end − asOf, in days).

**The scene** shows the weeks as rows, up to 60 (more gives code `scene-truncated`). Each day is a point with its date: the start
`info`, the end `hi`, holidays and tolled days `warn`, weekends `muted`.

### 2.8 `contract`

**When each event takes effect.**

| event | takes effect |
|---|---|
| an offer, a counter-offer, a rejection | on receipt (Restatement §§40, 42) |
| an acceptance | on dispatch (the mailbox rule), or on receipt with `acceptRule: receipt` (CISG 18(2)) |
| a revocation | on receipt; it is ineffective once an acceptance was dispatched (CISG 16(1)) and against a `firm` offer |
| a lapse | at its time |

Events are processed in order of their effect.

**Acceptance and counter-offer.**
- An acceptance with other terms is a counter-offer (code `counteroffer`).
- With `mirror: material`, only a change to a `material` term is a counter-offer. Otherwise the acceptance stands on the offer's
  terms (code `mirror`).

**Other codes.**
- `revoked`, `rejected`, `lapsed`.
- `late`: an acceptance after the lapse.
- `in-transit`: a revocation sent before the acceptance takes effect, which arrives after it.

**Binding.**
- `formed` needs an open offer and a matching acceptance.
- `binding` also needs every `element` to hold and no party under `minAge` or `capable` ≤ 0.5 (that gives code `minor` and
  `voidable`).
- `failed` is the 1-based index of the first criterion that fails.

### 2.9 `damages`

- **Expectation** (Restatement §347) = Σ(loss + incidental + consequential − avoidable) + max(0, market − price) − Σ cost
  avoided − Σ loss avoided.
  - An unforeseeable consequential loss (`foreseeable` ≤ 0.5) is excluded (code `unforeseeable`).
  - Avoidable parts are subtracted (code `avoidable`).
  - Below 0 → 0 (code `negative`).
- **Reliance** (§349) = Σ reliance − avoidable.
- **Restitution** (§371) = Σ benefit.
- **Liquidated damages.** The stipulated sum replaces the measure unless sum / anticipated loss (default: the expectation) >
  `ratio` (default 1). Then it is a penalty and is ignored (code `penalty`).
- **Interest** on the damages (or `principal`):
  - simple P(1 + rT);
  - compound P(1 + r/m)^{mT};
  - continuous P·e^{rT}.
  The series `balance` has 101 points over 0 … T.

### 2.10 `crime` and `sentence`

**`crime`** follows the MPC.
- **Culpability levels**: purpose 4, knowledge 3, recklessness 2, negligence 1, strict 0.
- **The level an element requires**: its own, else the offence's (§2.02(4)), else recklessness (§2.02(3), code
  `default-mind`).
- **When an element is met**: when it is proven with a mind ≥ the required level (§2.02(5)). A result element also needs but-for
  and proximate cause (§2.03, code `causation`).
- **Strict liability** outside a `violation` gives code `strict-liability` (§2.05).
- **Defences**: a defence that holds bars the offences it lists, or all offences (code `defence` when an offence was otherwise
  made out).
- **`offence`**: the 1-based index of the highest-ranked offence made out (else the first listed).
- **The per-offence scalars**: `elements`, `met`, `failed` (index), `required` and `mens` (of the first failed element) for the
  first offence, or for `at`.

**`sentence`.**
- **The level**: the base level + the active adjustments, clamped to the grid (code `grid-range`).
- **The category**: the last one whose lower bound the points reach.
- **The range**: the cell [lo, hi], cut by `max` and raised by `min` (USSG §5G1.1, code `clamped`).
- `mid` is the middle of the range.

### 2.11 `proportionality`

- **The weight formula**: W = (I_i·W_i·R_i + Σ extra_i) / (I_j·W_j·R_j + Σ extra_j).
- **The scales.** Triadic I, W ∈ {1, 2, 4} and R ∈ {1, ½, ¼}. Double triadic 2⁰ … 2⁸ and 2⁰ … 2⁻⁸. Continuous: any value > 0.
  A value off the scale gives code `scale`.
- **The stages**, in order:
  1. a legitimate aim;
  2. suitability;
  3. necessity: no active alternative is at least as effective and less burdensome;
  4. balancing.
- **`balance`**: −1 when W > 1 (the right prevails), 1 when W < 1, and 0 at W = 1 (code `stalemate`; the measure stands within
  the legislature's structural discretion).
- **`proportionate`** means no stage fails. `stage` is the first failed stage (0 = none).

### 2.12 `vote`

**A simple body.**
- **The quorum**: present ≥ quorum·members, or present ≥ quorum when quorum > 1 (code `no-quorum`).
- **The base** is the votes cast (abstentions excluded, or counted as no), the members present, or all members.
- **`needed`**: ⌊m·base⌋ + 1 with `strict` (more than), else ⌈m·base⌉.
- **A tie** (yes = no at m = ½) gives code `tie`. With `tie: chair` the chair casts the deciding vote (code `casting`).

**A weighted body.**
- It passes when weight(yes) ≥ quota, count share ≥ `countQuota` and population share ≥ `popQuota`.
- When only the population quota fails and fewer than `blocking` members voted no, the majority is deemed attained (TEU 16(4),
  code `blocking`).

**Voting power.**
- By enumeration of all 2ⁿ coalitions (n ≤ 20): normalised Banzhaf and Shapley–Shubik, for any game, double majorities
  included.
- For more voters, with integer weights and no population quota: both exactly, by generating functions over (coalition size,
  weight) in BigInt (Brams & Affuso 1976; Bilbao, Fernández, Jiménez Losada & López 2000, TOP 8:191). The counts for all voters
  are built once, and each voter is removed by deconvolution, C₋ᵢ[k][s] = C[k][s] − C₋ᵢ[k−1][s−wᵢ]. A swing of i at size k
  weighs k!(n−k−1)!/n! for Shapley–Shubik. A member-count quota is carried by the coalition size. The cost is about 2n²Σw; above
  4·10⁶ (e.g. 100 voters of total weight 400) it gives NaN with code `budget`, as do non-integer weights or a population quota.

### 2.13 `citation`

The author's templates are tried first, then the built-in shapes in `kinds`. `kind` is the 1-based position of the first match
in that list; no match gives code `no-match`.

| kind | shape | fields |
|---|---|---|
| `ecli` | `ECLI:EU:C:2014:317` | country, court, year, number |
| `neutral` | `[2001] UKHL 15`, `[2019] EWCA Civ 1234` | year, court, division, number, list |
| `reporter` | `347 U.S. 483 (1954)`, `5 F.4th 123, 130 (2d Cir. 2021)` | volume, reporter, page, pin, court, year |
| `series` | `BVerfGE 86, 1`, `BGHZ 1, 1 (5)` | series, volume, page, pin |
| `provision` | `Art. 6(1)(b) GDPR`, `§ 823 Abs. 1 BGB`, `s. 14B Limitation Act 1980` | marker, number, parens, parts, act; `depth` = the levels below the article |

- Number fields are scalars (`year`, `volume`, `page`, `number`, or any of them through `of: field`, `name`).
- Text fields appear in the scene as `s`.

### 2.14 `shares`

**Succession.**
1. **Priority sums.** The `first` sums come off the estate. When they exceed it, they are paid in proportion.
2. **Fixed shares** of the rest. When they add up to more than 1, each is divided by their sum (ʿawl, code `awl`).
3. **The remainder** goes to the residuaries in proportion to `weight`. When there are none, it goes to the share-holders with
   `radd` ≠ false in proportion to their shares (code `radd`). Failing those, it escheats (code `escheat`).
4. No active heir gives code `no-heirs`.

**Division**, with claims and a `division` rule:
- `proportional`;
- `cea`: min(c_i, λ);
- `cel`: max(0, c_i − μ);
- `talmud`: CEA on half-claims while E ≤ C/2, else each half-claim plus CEL of the rest (Aumann & Maschler 1985).
- E ≥ C pays every claim in full; the rest escheats (code `claims-short`).

### 2.15 `obligations`

1. **The steps.** One step per calendar day, or per business day of the calendar (weekend, holidays), from `start`, for
   `horizon` steps. A dated event falls on the first step on or after its day. Events after the horizon give code
   `trace-truncated`.
2. **The clauses** go to logic@1 `evalNorms` with `order`. `within` therefore counts steps: business days with
   `count: business`. `viol_<id>` and `fulf_<id>` hold from the next step (contrary-to-duty repair).
3. **The results.** Violations, fulfilments, pending clauses and conflicts come from logic@1, with its codes `conflict`,
   `unresolved` and `parse`. `penalties` = Σ over the violations of the clause's `penalty`.
4. **The scene** shows one row per clause: red for a violation, green for a fulfilment, amber for a clause still pending at the
   current step.

## 3. Outputs

| task | scalars (`flag` everywhere) | `at` names | series |
|---|---|---|---|
| rules | holds definite refuted undecided supported fired defeated blocked conclusions status | status: a rule | status (per rule: 2/1/0/½) |
| aspic | accepted credulous arguments attacks defeats extensions inCount status | status: a rule or scheme (1 if an argument topped by it is in) | labels (per argument) |
| carneades | acceptable negation applicable arguments status | status: an argument | applicable |
| hohfeld | holds contradictions conflicts positions derived lindahl lindahlOther joint jointCount | — | joint (the 7 joint alternatives, 1 permitted) |
| proof | established claim posterior threshold product winner | established, posterior, threshold, winner: an issue (default `query`, else the first) | posteriors |
| cases | forced permissible consistent onPoint best mostOnPoint shared distinctions binding | shared, distinctions, binding: a case (default `focus`) | shared, binding |
| deadline | end endY endM endD weekday days businessDays extended expired remaining tolled longstopEnd | — | — |
| contract | formed formedAt binding voidable failed offers | — | — |
| damages | damages expectation reliance restitution mitigated excluded interest total liquidated | — | balance |
| crime | liable offence elements met failed required mens | elements, met, failed, required, mens: an offence | met (per element of the first offence) |
| sentence | level category lo hi mid | — | — |
| proportionality | legitimate suitable necessary weight balance proportionate stage | — | — |
| vote | quorate passes needed margin cast yesShare popShare countShare banzhaf shapley | banzhaf, shapley: a voter (default `voter`) | banzhaf, shapley |
| citation | valid kind year volume page number depth field | `name` for `field` | — |
| shares | share amount total awl radd residue escheat | share, amount: an heir (default the first) | shares, amounts |
| obligations | violations fulfilments pending conflicts penalties steps frame | — | violationsPerStep |

Every task has the scene `drawing`. The roles are:
- `ok`: holds, fires, in, fulfilled;
- `bad`: defeated, out, violated, against;
- `warn`: undecided, pending, a holiday or a tolled day;
- `hi`: the result (the end date, the binding precedent, the chosen cell);
- `muted`: the rest.

## 4. Runtime codes (`flag`)

| code | task | when |
|---|---|---|
| `inconsistent` | rules, aspic, cases | strict contradictions; precedents that force both outcomes; an inconsistent case base |
| `undecided` | rules | a literal neither +∂ nor −∂ (a positive loop) |
| `loop` | rules | `loops: fail` refuted an unfounded set (a positive loop) |
| `unresolved` | rules, obligations | a conflict that no priority settles |
| `budget` | aspic, vote | 400 arguments, or 2·10⁵ search nodes in `afSolve`; power indices beyond 20 voters over the generating-function budget |
| `no-stable` | aspic | no stable extension |
| `weight` | carneades | a weight outside 0–1 was clamped |
| `contradiction`, `conflict` | hohfeld (and `conflict` in obligations) | opposites stated together; a duty to do and not to do (or a Lindahl type with no alternative left); norms in conflict |
| `conjunction`, `shifted`, `probability` | proof | element by element ≠ the product; a presumption applied; a probability outside 0–1 |
| `no-precedent` | cases | no case on point |
| `month-end`, `rolled`, `tolled`, `longstop`, `expired` | deadline | as in §2.7 |
| `counteroffer`, `revoked`, `rejected`, `lapsed`, `late`, `in-transit`, `mirror`, `minor` | contract | as in §2.8 |
| `unforeseeable`, `avoidable`, `penalty`, `negative` | damages | as in §2.9 |
| `default-mind`, `strict-liability`, `causation`, `defence` | crime | as in §2.10 |
| `grid-range`, `clamped` | sentence | |
| `stalemate`, `scale` | proportionality | |
| `no-quorum`, `tie`, `casting`, `blocking` | vote | |
| `no-match` | citation | |
| `awl`, `radd`, `escheat`, `no-heirs`, `claims-short` | shares | |
| `parse`, `trace-truncated` | obligations | from logic@1 |
| `value` | all | a number that cannot be computed (e.g. a deadline with n < 0) |

## 5. Validity, limits and bounds

| limit | value | reported as |
|---|---|---|
| rules, sup | 200, 400 | `size` (check) |
| ASPIC+ arguments | 400; the rule combinations tried per rule ≤ 2000; 50 passes | `budget` |
| Carneades arguments | 100, acyclic | `size`, `cycle` (check) |
| issues, factors, dimensions, cases | 32, 64, 32, 100 | `size` |
| dates | 1600–2400; periods n ≤ 100 000; a business-day scan ≤ 20 000 days; a roll ≤ 400 days; ≤ 32 tolling intervals | `date` (check), `value` |
| obligations | 200 norms; 2000 steps (`horizon`) | `size`, `trace-truncated` |
| voters | 64; exact indices by enumeration for ≤ 20, by BigInt generating functions above (integer weights, n²·Σw ≤ 4·10⁶) | `budget` |
| citation | 200 characters; templates ≤ 200 characters and ≤ 12 placeholders | `size`, `pattern` |
| scenes, series | 2000 items or points | `scene-truncated`, `series-truncated` |

**What the engine does not decide.**
- **Legal meaning.** Whether something is a "vehicle" is the author's rule, not the engine's.
- **Probability thresholds** are conventions, not law (civil-law systems use the judge's conviction, §286 ZPO). They are data.
- **Lindahl's** 26 two-agent types are reported as their joint permission set, not by Lindahl's own numbering.

**Determinism.** Every loop is bounded, there is no randomness, and parts are visited in the order the spec lists them. A checked
spec never throws: a run that cannot be computed gives NaN and a code.

## 6. Reference values asserted by `tests/lib_law.js`

| value | source |
|---|---|
| murder not acceptable, nor ¬murder; arg2 applicable, arg3 not (α = 0.4) | van Gijzel & Nilsson 2014, CarneadesDSL ExampleCAES |
| Talmud: 100 → 33⅓ each; 200 → 50, 75, 75; 300 → 50, 100, 150 | Kethuboth 93a; Aumann & Maschler 1985 |
| proportional 33⅓, 66⅔, 100; CEA 66⅔ each; CEL 0, 50, 150 (estate 200) | Thomson 2003 |
| Minbariyya: the wife's ⅛ becomes 1/9 by ʿawl | Coulson 1971; Powers 1986 |
| EEC 1958 [12; 4,4,4,2,2,1]: Shapley–Shubik 14/60, 9/60, 0; Banzhaf 5/21, 3/21, 0 | Felsenthal & Machover 1998 |
| USSG level 20, category I → 33–41 months | USSG §5A (sentencing table) |
| Blackstone's 10:1 → p* = 10/11 | Kaplan 1968 |
| purpose and knowledge → murder, recklessness → manslaughter, negligence → negligent homicide | MPC §§2.02, 210.2–210.4 |
| a posted acceptance before the revocation arrives forms the contract; under receipt + CISG 16(1) too, at receipt | Byrne v Van Tienhoven 1880; CISG |
| 31 Jan 2023 + 1 month = 28 Feb (29 in 2024) | EU Reg. 1182/71 Art. 3(2)(c) |
| Wed 12 Jun 2024 + 10 days → Mon 24 Jun (rolled from Sat) | FRCP 6(a)(1)(C) |
| Tweety with r2 > r1; the vehicles in the park | Antoniou et al. 2001; Hart 1958 |
| Nixon diamond: grounded rejects, preferred credulous | Dung 1995; Modgil & Prakken 2013 |
| W = 2 (serious vs moderate); W = 1 stalemate | Alexy 2003 |
| ambiguity blocking proves ¬antimilitary; propagating proves neither, both supported | Antoniou et al. 2000 |
| a positive loop is refuted by failure by looping | Maier & Nute 2006; Billington 2008 |
| married / bachelor: m, b, hs, ¬hs all accepted without transposition, none with it | Caminada & Amgoud 2007 |
| Lindahl types T4, T6, T7, and 0 for a conflict of duties | Lindahl 1977 |
| a precedent binds a fortiori on a dimension only at an equal or stronger magnitude | Horty 2019 |
| 20 voters: generating functions = enumeration; 50 equal voters: 1/50 | Bilbao et al. 2000 |
| ECLI:EU:C:2014:317; [2001] UKHL 15; 347 U.S. 483 (1954); BVerfGE 86, 1 | Council conclusions 2011/C 127/01; Bluebook |

## 7. API for other engines and tests

`NoemaLibLaw` exports:
- the module API: `id`, `checkSpec`, `exprs`, `keys`, `run`, `engine` (with `workerSource`: NoemaExpr + core + logic@1 + law@1),
  `simEngine`, `source`;
- `table` (the author's form: `model`, `outputs`, `fields: {code, at, name}`);
- the data: `TASKS`, `TASK_OUT`, `AT_OF`, `CODES`, `REQ`, `MODEL_T`, `SCHEMES`, `STD_P`, `LEVEL`, `CITE_KINDS`;
- the helpers: `parseLit`, `dayOf`, `civilFromDays`, `daysFromCivil`, `weekdayOf`, `addMonths`, `template`, `buildTheory`,
  `defeasible` (with `{variant, loops}`), `hohCanon`, `powerIndices`, `banzhafGF`, `weightedGF` (exact Banzhaf and
  Shapley–Shubik), `cea`, `cel`, `carneadesCycle`.

The engine has no dependency besides logic@1, which must load first (47 before 48).

## 8. Sources

Adams v Lindsell (1818) 1 B & Ald 681 · Aleven 2003 (AIJ 150:183) · Alchourrón & Makinson 1981 · Alexy 2003 (Ratio Juris
16:433), 2007 · ALI Model Penal Code 1962 · Allen 1986 (Boston U L Rev 66:401) · Antoniou, Billington, Governatori & Maher 2001
(ACM TOCL 2:255) · Ashley 1990 (*Modeling Legal Argument*) · Aumann & Maschler 1985 (J Econ Theory 36:195) · Banzhaf 1965
(Rutgers L Rev 19:317) · Bilbao, Fernández, Jiménez Losada & López 2000 (TOP 8:191) · Billington 2008 (JELIA) · Bank Mellat v HM Treasury (No 2) [2013] UKSC 39 · BGB §§130, 187–193 · Brams & Affuso 1976 · Byrne v Van
Tienhoven (1880) 5 CPD 344 · Caminada & Amgoud 2007 (AIJ 171:286) · Cavendish v Makdessi [2015] UKSC 67 · CISG 1980 Arts 16, 18, 19, 74, 76 · Cohen 1977 (*The Probable
and the Provable*) · Coulson 1971 (*Succession in the Muslim Family*) · Council conclusions 2011/C 127/01 (ECLI) · Dung 1995 (AIJ
77:321) · EU Regulation 1182/71 · Felsenthal & Machover 1998 · FRCP 6(a) · Gordon, Prakken & Walton 2007 (AIJ 171:875) ·
Governatori 2005 (IJCIS 14:181) · Hadley v Baxendale (1854) 9 Exch 341 · Hart 1958 (Harvard L Rev 71:593) · Hinnant 2013
(chrono date algorithms) · Hohfeld 1913, 1917 · Horty 2011 (Legal Theory 17:1), 2019 (AI & Law 27:309) · Kaplan 1968 (Stanford L Rev 20:1065) · Kanger
1972 · Lindahl 1977 · Maher 2001 · Maier & Nute 2006 (JELIA) · McCauliff 1982 (Vanderbilt L Rev 35:1293) · McDonnell Douglas v Green, 411 U.S. 792 (1973) ·
Modgil & Prakken 2013 (AIJ 195:361) · Morgan 1933 · Nute 1994 · Powers 1986 (*Studies in Qur'an and Hadith*) · Prakken 2010 (Arg &
Comp 1:93), 2021 (AI & Law 29:559) · Prakken & Sartor 1996, 1997 · Prakken & Sergot 1996 · Qurʾān 4:11–12, 4:176 · R v Oakes
[1986] 1 SCR 103 · Restatement (Second) of Contracts §§40, 42, 70, 344–356, 371 · Robert's Rules of Order 12th ed. · Sergot 2013
(Handbook of Deontic Logic) · Shapley & Shubik 1954 (APSR 48:787) · Talmud, Kethuboth 93a, Bava Metzia 2a · TEU Art. 16(4) ·
Thayer 1898 · Thomson 2003 (Math Soc Sci 45:249) · UCC 2-205, 2-207, 2-708, 2-713 · USSG ch. 5 pt A, §5G1.1 · van Gijzel & Nilsson
2014 · Walton, Reed & Macagno 2008 (*Argumentation Schemes*).
