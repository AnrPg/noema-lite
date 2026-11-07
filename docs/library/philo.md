# `philo@1` — the computable parts of philosophy (`src/engines/philo/philo.js`, `NoemaLibPhilo`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for the parts of philosophy that have exact models and can be graded.
It covers ethics calculi, social choice, decision theory, game theory, formal epistemology, Indian and Buddhist forms of inference,
thought experiments as structured cases, a drawn map of thinkers, and argument validity. The traditions are not ranked: Greek,
Indian (Nyāya, Dignāga, Jain), Buddhist, Chinese (Mohist, Confucian, Daoist), Islamic, Jewish, medieval Latin, early modern, analytic,
continental and African thinkers and positions sit side by side. The engine never says which view is right. It says which principle
gives which verdict, which method elects whom, and which analysis counts a case as knowledge.

- Argument validity goes through **logic@1** (its module, imported: `parse`, `atomsOf`, `truthTable`, `entails`; `docs/library/logic.md`
  §9). It is never re-implemented here.
- Seeded noise in tournaments uses **NoemaSimKit**'s MRG32k3a streams (`src/engines/kernel/simkit.js`, L'Ecuyer 1999). Without it, the engine
  falls back to the core's mulberry32. This fallback is marked in the code; either way the same seed gives the same numbers.
- The Worker source is NoemaExpr, the core, NoemaSimKit, logic@1 and this module.

The Python twin is `tools/lib_philo.py`. It checks the spec and does not compute, and it embeds the same JSON tables (one source,
written into both files). The tests are:
- `node tests/lib_philo.js`: 111 assertions covering the reference values below, the edge cases and their codes, the checker, the
  JS ↔ Python parity on `tests/fixtures/enginelib/philo.json` (33 specs), the adapter, the Worker and speed.
- `node tests/enginelib.js`: the same parity once philo@1 is in the catalogue.

The reference activity is `tools/activities_examples/condorcet-cycle`. The research is in the project's
`engine-library/research/philo.md`.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "philo@1",
  "params": [ { "id": "n1", "kind": "slider", "label": "n1Label", "min": 0, "max": 20, "step": 1, "default": 8 } ],
  "model": {
    "elections": [ { "id": "vote", "candidates": ["A", "B", "C"], "ballots": [
        { "n": "n1", "rank": ["A", "B", "C"] }, { "n": 6, "rank": ["B", "C", "A"] }, { "n": 5, "rank": ["C", "A", "B"] } ] } ],
    "cases": [ { "id": "fb", "preset": "footbridge" } ],
    "lotteries": [ { "id": "b1", "outcomes": [ { "p": 0.1, "x": 5e6 }, { "p": 0.89, "x": 1e6 }, { "p": 0.01, "x": 0 } ] } ] },
  "outputs": [
    { "id": "irv", "kind": "scalar", "of": "winner", "election": "vote", "method": "irv" },
    { "id": "cyc", "kind": "scalar", "of": "cycle", "election": "vote" },
    { "id": "dde", "kind": "scalar", "of": "verdict", "case": "fb", "principle": "dde" },
    { "id": "eu", "kind": "scalar", "of": "eu", "lottery": "b1", "u": "log", "w0": 1 },
    { "id": "graph", "kind": "scene", "of": "majority", "election": "vote" } ],
  "plots": [ { "kind": "scene", "of": "graph", "title": "graphTitle" } ] }
```

Every number of the model and of an output's options may be `numx`: a number, or an expression over the spec's names (`exprs(spec)`
lists them with their paths). Ids are the core's ids. Lists are bounded as the table says. In the outputs, a winner, a candidate or an
act is returned as its **index** in the model's list (0 first), and **−1** means a tie or no winner.

### 1.1 The model (`model.*`, every part optional)

| part | fields | what |
|---|---|---|
| `populations` (≤ 32) | `id`, `groups` (1–64) `{n, w, rel?, levels?}` | n people at welfare w. `rel` is the relational distance used by `graded`; `levels` (≤ 8) are the ranked goods used by `lexical` |
| `cases` (≤ 32) | `id`, `preset?` (`switch driver footbridge loop trapdoor transplant lazySusan transmitter`), `kAct sAct kNot sNot` (numx), `means redirect personal consent driver` (bool) | a trolley-family case: k people harmed with severity s if the agent acts, k′ with s′ if not. A case needs a preset, or kAct and kNot |
| `maxims` (≤ 16) | `id`, `preset?` (`suicide falsePromise talents beneficence tennis toys deposit`), `conception practical natural will` (bool) | a maxim for the Formula of Universal Law |
| `profiles` (≤ 16) | `id`, `scheme` (`aristotle confucian paramita`), `traits` {trait: −1…1}, `tol` (default 0.2) | a virtue profile: −1 deficiency, 0 the mean, +1 excess |
| `elections` (≤ 16) | `id`, `candidates` (2–8), `ballots` (1–64) `{n, rank (1–8 candidates), approve?}`, `axis?` | strict, possibly partial rankings. Unranked candidates share the bottom of a ballot |
| `lotteries` (≤ 32) | `id`, `outcomes` (1–32) `{p, x}`, `priors?` (≤ 16 probability vectors) | the probabilities must sum to 1. The priors are used by maxmin EU |
| `utility` | `u` (`linear log sqrt power cara bounded`), `ua`, `w0` | the default utility. An output's own `u`, `ua`, `w0` override it |
| `problems` (≤ 8) | `id`, `preset?` (`newcomb lesion psychopath`) with `acc big small pCause?`, or `acts states u pAct pCause` | an act × state problem. `pAct[a][s]` = P(s given a) (evidential); `pCause[s]` = P(s) (causal) |
| `games` (≤ 8) | `id`, `preset?` (`pd stag chicken hawkdove bos pennies coord`) with `T R P S`, or `rows cols pay[r][c] = [row, column]` | a normal-form game |
| `tournament` | `game`, `strategies` (1–12 of `allc alld tft tf2t grim pavlov random gtft alt joss stft`), `rounds` (200), `noise` (0), `reps` (1), `gens` (100), `self` (true) | an iterated round robin on a symmetric 2 × 2 game |
| `beliefs` (≤ 16) | `id`, `h` = P(H), `eh` = P(E given H), `enh` = P(E given ¬H) | for the confirmation measures |
| `knowledge` (≤ 16) | `id`, `preset?` (`coins ford barns clock sheep mirage smoke truetemp lottery ordinary`), `believed truth justified falseLemma defeater causal reliable sensitive safe apt intuition` (bool) | a Gettier-type case |
| `sorites` | `n` (100, ≤ 2000), `lo`, `hi` (30 % / 70 % of the range), `shape` (`linear logistic`), `plo phi` (the penumbra: lo / hi), `cut` (the midpoint) | the degrees v_i of "i is a heap" |
| `experiments` (≤ 16) | `id`, `te?` (a built-in), `options?`, `positions?` {position: option} | a thought experiment. The model may add positions to a built-in one |
| `thinkers` (≤ 64) | `id`, `label` (a key), `born died trad infl` | a built-in thinker (its dates and influences are the engine's), or a new one (which then needs born, died and trad) |
| `arguments` (≤ 16) | `id`, `premises` (1–12 formulas), `conclusion` | propositional formulas in logic@1's language |
| `inferences` (≤ 16) | `id`, `paksa` (bool), `sapaksa`, `vipaksa` (`all some none`) | an inference for Dignāga's wheel |
| `bargains` (≤ 8) | `id`, `pts` (1–32 points [x, y]), `d` ([0, 0]) | the feasible set is the convex hull of the points; d is the disagreement point |
| `ruleCodes` (≤ 16) | `id`, `rules` (1–32) `{id, b, c?, k?, x?}` | a moral code for rule consequentialism (§2.9): b benefit, c internalisation cost, k coordination exponent, x exploitation loss |
| `streams` (≤ 16) | `id`, `head` (≤ 2000 numbers), `cycle` (1–64 numbers, repeated forever) | an infinite utility stream, eventually periodic (§2.11) |
| `ubuntu` (≤ 16) | `id`, `options` (1–12) `{id, effects (≤ 64) {who, identity, solidarity, byAgent}}`, `wI`, `wS` (1) | a choice in Metz's relational terms (§2.12): Δidentity and Δsolidarity −1…1 per relationship |
| `poisson` (≤ 8) | `id`, `n` (expected electorate), `candidates` (2–6), `types` (1–16) `{id, r, u (one per candidate), vote?}` | a Poisson voting game (§2.14): a voter is of type t with probability r, values the candidates at u and votes for `vote` |

Built-in content (`TABLES`, the same in Python):
- The trolley presets (§2.2), Kant's maxims, the trait lists, and the Gettier presets with the received intuition.
- 19 thought experiments: `chineseRoom mary zombie brainVat teleporter ship twinEarth experienceMachine violinist veil gyges
  floatingMan butterfly chariot childWell swampman invertedSpectrum personhood cottonFire`, each with options and positions.
- 100 thinkers in 12 traditions (`greek indian buddhist jain chinese islamic jewish latin modern analytic continental african`), with
  years (BCE negative; ancient dates are the conventional ones) and influences.

### 1.2 Checker codes (`checkSpec`, the same in `tools/lib_philo.py`)

| code | when |
|---|---|
| `format`, `value`, `enum`, `size`, `unknown-field` | the core's table walk |
| `duplicate` | an id used twice in a part; a candidate listed or ranked twice; a strategy listed twice; a rule twice in a code; an option twice in an ubuntu case; a Poisson candidate or type twice |
| `value` | a case without a preset or kAct and kNot; a trait outside its scheme; an axis that is not every candidate once; probabilities outside 0–1 or not summing to 1; a problem or game without a preset or its tables; an experiment without te or options and positions; a new thinker without born, died and trad; `iia` without `other`; a tournament, sorites or map output without its model part |
| `size` | a problem's or game's tables that do not fit its acts, states, rows and columns; a prior of the wrong length |
| `ref` | an unknown part, candidate (also a Poisson type's `vote`), act, option, position, thinker or tournament strategy |
| `output` | an `of` that philo@1 does not compute for that kind |

**Runtime codes** (`run(...).codes`):

| code | meaning |
|---|---|
| `tie` | −1 or 0 because of a tie |
| `tie-break` | IRV, Coombs, runoff or ranked pairs broke a tie by the candidates' order |
| `empty` | nobody is alive in a population |
| `nonpositive` | Atkinson prioritarianism with w ≤ 0, or a Gini coefficient with μ ≤ 0 |
| `different-size` | leximin over populations of different sizes, equal up to the smaller |
| `probsum` | the probabilities do not sum to 1 |
| `domain` | a utility outside its domain (log of 0) |
| `truncated` | the St Petersburg EV with no bank, which is the number of rounds |
| `degenerate` | a confirmation measure with P(H) ∈ {0, 1} or P(E) ∈ {0, 1} |
| `infinite` | l with P(E given ¬H) = 0 |
| `no-mixed` | a 2 × 2 game without a fully mixed equilibrium |
| `asymmetric` | a tournament or GRIM threshold on a game that is not a symmetric 2 × 2 game |
| `not-pd` | a GRIM threshold on a game that is not a prisoner's dilemma |
| `range` | a number outside its range |
| `iia-candidates` | the two profiles of IIA have different candidates |
| `too-many` | manipulation with more than 6 candidates |
| `budget` | a social-choice search passed 200 000 method runs; a replicator over m^G profiles × G² × m > 25 000; a Poisson game with n > 10⁵ or (τ + 12√τ + 20) · 2^m · m² · (types + 1) > 4 · 10⁷ |
| `parse` | logic@1 cannot parse a formula |
| `too-many-atoms` | an argument has more than 12 atoms |
| `states` | minimax regret on lotteries of different lengths |
| `infeasible` | no bargaining solution exists |
| `whole` · `partial` | a voting game or Gibbard–Satterthwaite check on a fractional ballot group, or on a partial ranking |
| `incomparable` | overtaking or catching-up cannot rank the two streams |
| `period` | the common period of two streams is over 4096 |
| `impossibility` | `infiniteConflict` found a pair that Pareto ranks and infinite anonymity equates |
| `missing` | a rule or ubuntu option that does not exist |
| `none-permissible` | the honouring reading of ubuntu forbids every option |
| `degenerate` (games) | support enumeration found an equilibrium with more pure best responses than its support: the game is degenerate, may have a continuum of equilibria, and the list is not complete (§2.13) |
| `none` | no equilibrium found (Lemke–Howson stopped on a ray, or a degenerate game) |
| `approximate` | a mixed voting equilibrium of more than two blocs: a rest point of the replicator dynamics, not a certified equilibrium (§2.13) |
| `method` | a mixed voting game on a rule other than plurality or antiplurality |
| `underflow` | a Poisson voter whose every pivot probability is below 10⁻³⁰⁸: its best vote is not certified, and the output is NaN (§2.14) |
| `magnitude-m` | a three-way-constrained magnitude with more than three candidates (not computed) |
| `error` | an unexpected failure. The output is NaN, and the run does not throw |

## 2. Outputs and methods

### 2.1 Population axiology (`welfare`, `compare`, `best`, `paradox`; series `sorted`; scene `parfit`)

`rule` is one of the following. Each output also takes `gamma c tau delta k`.

| rule | value | source |
|---|---|---|
| `total` | Σ n w | Sidgwick 1874, *Methods* IV.1 |
| `average` | Σ n w / N | Mill; Harsanyi 1955 |
| `critical` | Σ n (w − c), c default 0 | Blackorby, Bossert & Donaldson 2005 |
| `variable` | μ · k(1 − e^(−N/k)), k default 100 | Hurka 1983; Ng 1989 |
| `prior` | Σ n w^(1−γ)/(1−γ), ln at γ = 1, γ default ½; needs w > 0 | Atkinson 1970; Parfit 1991 |
| `kolm` | Σ n (1 − e^(−γw))/γ | Kolm 1976 |
| `maximin`, `leximin` | the worst-off; leximin compares the k-th worst-off person for k = 1, 2, … | Rawls 1971 §13; Sen 1970 |
| `suff` | Σ n · min(w, τ), τ default 1 | Frankfurt 1987; Crisp 2003 |
| `egal` | μ(1 − G), G the Gini coefficient | Sen 1973 |
| `equality` | −G | telic egalitarianism (Parfit 1997; Temkin 1993) |
| `graded` | Σ n w δ^rel, δ default ½ | Mengzi 3A5 愛有差等; δ = 1 is Mozi's 兼愛 |
| `lexical` | the totals of each level, compared in order | Rawls 1971 §8; al-Ghazālī and al-Shāṭibī's ranked maqāṣid |

- `compare` gives 1 (a better), −1 (b better) or 0 (equally good).
- `best` gives the index of the best population.
- `paradox` (`repugnant mereAddition sadistic levellingDown`) is 1 when the rule yields that conclusion on a fixed construction:
  - repugnant: A = 10³ people at 100, Z = 10⁷ at 0.1 (Z ≻ A);
  - mereAddition: A vs A + 1000 people at 50 (A ≻ A+);
  - sadistic: base 1000 at 50, adding 10 people at −10 vs adding 10⁴ at 1 (the negative lives preferred);
  - levellingDown: 500 at 100 + 500 at 50 vs 1000 at 50 (the levelled outcome preferred).
- `parfit` draws Parfit's blocks (1984 ch. 19): the width is the number of people, the height is welfare.

**Reference values** (tests §1):
- The Repugnant Conclusion is implied by total and both prioritarianisms, and avoided by average, maximin and variable value.
- Mere Addition is violated by average and maximin.
- The Sadistic Conclusion is implied by critical-level (c = 5) and by average.
- Levelling Down: pure equality prefers the levelled outcome; μ(1 − G) does not.
- The Gini coefficient of half at 100 and half at 50 is 1/6, and Sen's value is 62.5.

### 2.2 Trolley-family cases (`verdict`, `permits`)

The verdict is **2** must act, **1** may act, or **0** must not act. A = kAct·sAct, N = kNot·sNot. Two rules hold under every
principle: an easy rescue (A = 0 < N) gives 2, and harm for nothing (N = 0 < A) gives 0.

| principle | rule | source |
|---|---|---|
| `util` | A < N → 2, A > N → 0, equal → 1 | Bentham 1789; Sidgwick; the Mohist weighing 權 |
| `dde` | a means → 0; else A < N → 1 | Aquinas ST II-II q64 a7; Mangan 1949; Foot 1967 |
| `means` | used without consent → 0; else 1 | Kant G 4:429 |
| `doingAllowing` | the driver kills either way → util; with consent → may; else 0 | Foot 1967; Quinn 1989 |
| `redirect` | redirecting an existing threat (the loop too) → may; a new threat → 0 | Thomson 1985 |
| `personalForce` | a means by personal force → 0; else may | Greene et al. 2009 (descriptive) |
| `threshold` | constrained (used, or a new threat): N/A ≥ T → 2 else 0, with T default 10; unconstrained → util | Moore 1997 |
| `contract` | the larger individual severity wins; at equal severities, the numbers break the tie | Scanlon 1998 ch. 5 |
| `taurek` | equal severities → 1 (numbers do not count); else as contract | Taurek 1977 |

The presets as (kAct sAct kNot sNot | means redirect personal):
- `switch`: 1 1 5 1 | − + −
- `driver`: as switch, with the driver
- `footbridge`: 1 1 5 1 | + − +
- `loop`: + + −
- `trapdoor`: + − −
- `transplant`: + − +
- `lazySusan`: − + −
- `transmitter`: 10⁶ 10⁻⁴ 1 0.2 | − − −

Reference rows over the nine principles:
- switch `211011221`
- footbridge `200000021`
- loop: DDE 0, Thomson 1
- transmitter: util 0, contract 2

**Kant** (`ful`, `reading` `logical practical teleological`, default practical) gives 0 for a contradiction in conception (perfect
duty), 1 for a contradiction in the will (imperfect duty) and 2 when the maxim passes (G 4:421–424; Korsgaard 1985). The presets
`tennis` (a false positive of the practical reading) and `toys` (of the logical one) show where the test fails (Herman 1993; O'Neill
1975; Wood 2008).

**Virtues** (`trait`, `virtue`, scene `virtues`) use the doctrine of the mean (NE II.6–7; Analects 11.16 過猶不及; the pāramitā):
- `trait` gives −1, 0 or +1 against the tolerance.
- `virtue` gives the mean of 1 − |x|.
- The scene draws one row per trait in the scheme's order, numbered.

### 2.3 Social choice

Outputs:
- `winner` (`method`)
- `score` (`method` ∈ plurality, antiplurality, borda, copeland, minimax, approval, bucklin; `cand`)
- `margin` (`a`, `b`): the number of voters preferring a minus those preferring b
- `condorcet` (`loser?`)
- `cycle`: 1 if the strict majority relation has a cycle (Tarjan's components)
- `smith`: the size of the Smith set
- `criterion` (`method`, `criterion`, `other?`)
- `manipulable` (`method`)
- `singlePeaked`
- series `scores`
- scene `majority`: candidates on a circle, an arrow for each majority labelled with its margin, arrows of a cycle `bad`, the
  Condorcet winner `hi`, ties dashed

Methods (sources in the code):
- plurality and anti-plurality
- `borda` (Borda 1781; Cusanus 1433)
- `runoff`
- `irv` (Ware 1871)
- `coombs` (1964)
- `nanson` (1882)
- `baldwin` (1926)
- `bucklin`
- `copeland` (1951; Llull 1299)
- `minimax` (Simpson 1969 / Kramer 1977, margins)
- `schulze` (2011, winning votes)
- `rankedPairs` (Tideman 1987)
- `kemeny` (1959, all m! orders, ≤ 8 candidates)
- `approval` (the top `approve` of each ballot, default 1)
- `black` (1958)
- `condorcet`

Each method also gives a social ranking: by score, by reverse elimination order, by beat-paths, by locked pairs, or by Kemeny's
order. The ranking is what Pareto and IIA test.

Criteria, tested on the given profile or profiles: 1 = satisfied here, 0 = violated here, NaN = undecidable.

| criterion | test |
|---|---|
| `condorcet`, `condorcetLoser`, `majority` | the winner against the Condorcet winner or loser, or the majority favourite |
| `pareto` | no unanimously dispreferred candidate ranks above the one preferred (Arrow 1951) |
| `iia` | `other` has the same candidates. For every pair with the same pairwise counts in both profiles, the social order is the same. This is Arrow's IIA for anonymous rules |
| `spoiler` | deleting any loser leaves the winner (Sen's α) |
| `monotonic` | raising the winner by 1 … all places on 1 … 10 or all voters of a group never makes it lose (Smith 1973; Fishburn & Brams 1983) |
| `participation` | 1 … 10 or all voters of a group abstaining never get them a better winner (Moulin 1988) |

`manipulable` is the Gibbard 1973 / Satterthwaite 1975 search. It tries all, 1 or half of the voters of one group reporting any one
false order (≤ 6 candidates).

The search budget is 200 000 method runs, with Kemeny counted as m! runs each. Past it the result is NaN with the code `budget`.

**Reference values** (tests §3):
- Tennessee (42 M>N>C>K, 26 N>C>K>M, 15 C>K>N>M, 17 K>C>N>M):
  - plurality elects M and IRV elects K; anti-plurality ties;
  - runoff, every Condorcet method, Borda, Coombs, Nanson, Baldwin and Bucklin elect N;
  - Borda scores 126 / 194 / 173 / 107; N beats M 58–42;
  - M is the Condorcet loser;
  - the profile is single-peaked on M, N, C, K.
- The cycle 1 / 1 / 1 has no Condorcet winner and a Smith set of 3.
- IRV is not monotonic on 39 A>B>C, 35 B>C>A, 26 C>A>B.
- Plurality has a spoiler on 4 A>B>C, 3 B>A>C, 2 C>B>A.
- Borda fails IIA between 3 A>B>C + 2 B>C>A and 3 A>C>B + 2 B>A>C.
- Borda is manipulable on 3 A>B>C, 2 B>A>C.

### 2.4 Decision theory

- `ev`, `eu`, `ce`, `premium` (Pratt 1964). The utilities are:
  - `log` (Bernoulli 1738);
  - `sqrt` (Cramer 1728);
  - `power`: CRRA ((w0 + x)^(1−a) − 1)/(1 − a);
  - `cara`: (1 − e^(−ax))/a;
  - `bounded`: (w0 + x)/(w0 + x + a).
  The certainty equivalent is found by bisection.
- `cpt` (Tversky & Kahneman 1992) takes `alpha beta lam gp gm ref`. The defaults are 0.88, 0.88, 2.25, 0.61, 0.69 and 0; gains
  and losses are weighted cumulatively.
- `meu`: α-maxmin EU over the lottery's priors, α default 1 (Gilboa & Schmeidler 1989; Ghirardato et al. 2004).
- `choose` (`a`, `b`, `rule`) gives 1, −1 or 0 (a tie). The rules are:
  - `ev eu cpt meu`;
  - `maxmin` (Wald 1950) and `maximax`;
  - `hurwicz` (α, default ½);
  - `laplace`;
  - `regret` (Savage 1951; the states are aligned by position);
  - `discount`: EV without the outcomes of p < ε, ε default 10⁻⁶ (Monton 2019, against Pascal's mugging, Bostrom 2009).
- `commonCons` (`a b c d`) is 1 when P(a) − P(b) = P(c) − P(d) outcome by outcome, so that EU must choose alike (Allais 1953).
- `stpete` (`what` ev, eu or ce; `rounds` ≤ 1000, default 100; `bank`): payoff 2^k with probability 2^−k (D. Bernoulli 1738).
- `dtv` (`problem`, `theory` edt or cdt, `act?`) gives the value of the act, or the index of the act chosen. EDT follows Jeffrey 1965;
  CDT follows Gibbard & Harper 1978 and Lewis 1981.
- `dominant` gives the act that weakly dominates, or −1.

**Reference values**:
- Allais: the common consequence holds, and EV(1B) = 1.39 M.
- √-utility of ½ · 100: EU 5, CE 25, premium 25.
- St Petersburg: log EU 2 ln 2, CE 4. A bank of 2³⁰ caps the EV at 31.
- CPT: w⁺(½) = 0.421.
- Ellsberg: maxmin prefers the known urn.
- Pascal's mugging: EV pays the mugger; discounting and bounded utility do not.
- Newcomb (accuracy 0.99): EDT values 990 000 vs 11 000 and one-boxes; CDT two-boxes. EDT is indifferent at an accuracy of 0.5005.
- The smoking lesion: EDT abstains, CDT smokes.
- The psychopath button (Egan 2007): CDT pushes, EDT refrains.

### 2.5 Games

Outputs on `games`:
- `nash`: the number of pure equilibria.
- `isNash` (`r`, `c`).
- `mixed` (`player`): the 2 × 2 fully mixed equilibrium by indifference (Nash 1950).
- `dominantStrat` (`player`): strict dominance.
- `paretoCell` (`r`, `c`).
- `grimDelta`: (T − R)/(T − P) (Friedman 1971).
- scene `payoffs`: the matrix, with Nash cells `hi`.

The tournament:
- `ipd` (`strategy`, `what` mean, rank or share): the round robin of Axelrod 1984, with self-play optional.
- Strategies: TFT (Rapoport); GRIM (Friedman 1971); Pavlov (Nowak & Sigmund 1993); generous TFT, which forgives with
  q = min(1 − (T−R)/(R−S), (R−P)/(T−P)) (Nowak & Sigmund 1992); JOSS, which defects 10 % of the time after a C; suspicious TFT; ALT;
  RANDOM.
- Noise flips each move with probability `noise`, seeded.
- `share` is the last generation of discrete replicator dynamics (Taylor & Jonker 1978), with payoffs shifted to stay positive.
- series `match` (`a`, `b`, `player`): the cumulative payoff. Series `shares` (`strategy`).

`bargain` (`solution` nash, ks, egal or util; `coord` 0 or 1) works on the convex hull of the points:
- `nash`: the largest product of gains over the hull's boundary (Nash 1950);
- `ks`: the farthest point toward the ideal point (Kalai & Smorodinsky 1975; ≈ Gauthier 1986);
- `egal`: along the diagonal (Kalai 1977);
- `util`: the largest sum.

**Reference values**:
- PD: (D, D) is the only equilibrium, dominant and Pareto-inferior; GRIM's δ is ½.
- Stag hunt: 2 pure equilibria, the mixed one with p = ¾ (Skyrms 2004).
- Battle of the sexes: ⅔. Matching pennies: ½, with no pure equilibrium.
- Round robin of ALLC, ALLD and TFT over 200 rounds: 2, 2.34 and 2.332. ALLD dies out, then TFT (0.785) and ALLC drift neutrally.
- Bargaining:
  - splitting a dollar: ½ each;
  - on x/2 + y = 1: Nash = KS = (1, ½), egalitarian ⅔, utilitarian 2;
  - on a kinked frontier, Nash (1, ½) differs from KS (⅔, ⅔).

### 2.6 Epistemology

- `confirm` (`measure`): `post`, `d`, `r`, `l`, `s`, `k`, `z`, `c` (Fitelson 1999; Crupi, Tentori & Gonzalez 2007; Crupi SEP
  "Confirmation"). Reference: P(H) = ½, P(E given H) = 0.8, P(E given ¬H) = 0.4 gives d 1/6, r ln 4/3, l ln 2, s 5/12, k 1/3, z 1/3,
  c 0.1, and k = tanh(l/2).
- `dutch` (`cr`): Σ − 1, the sure loss per unit stake (de Finetti 1937).
- `knows` (`case`, `analysis`) and `fits` (`analysis`). `fits` is the number of the model's cases with an intuition that the analysis
  gets right. The analyses:
  - `jtb`;
  - `noFalseLemma` (Clark 1963);
  - `defeasibility` (Lehrer & Paxson 1969);
  - `causal` (Goldman 1967);
  - `reliabilism` (Goldman 1979);
  - `sensitivity` (Nozick 1981);
  - `safety` (Sosa 1999; Williamson 2000);
  - `virtue` (Sosa 2007);
  - `intuition`.
  On the 10 presets, fits = 2, 8, 9, 8, 2, 9, 9, 8. The presets include Dharmottara's mirage (8th c.) and Śrīharṣa's dust taken for
  smoke (12th c.) beside Gettier 1963, Goldman 1976, Russell 1948, Chisholm 1966, Lehrer 1990 and the lottery.
- `sorites` (`what`) and series `degree` and `bound`:
  - `condMin`: the least true conditional, v(P_i → P_{i−1}) = min(1, 1 − v_i + v_{i−1}) (Łukasiewicz; Goguen 1969; Smith 2008);
  - `bound` (`k`): the modus ponens bound after k steps;
  - `superTrue`, `superFalse`, `indet`: supervaluation (Fine 1975);
  - `cutoff`: epistemicism's sharp boundary, which the model names (Williamson 1994);
  - `value` (`i`).
  Reference (n = 101, 30 … 70): condMin 0.975, the conclusion 0, and 30 / 30 / 41.
- `lottery` (`n`, `t`, `what` believed, conj or closure), after Kyburg 1961.
- `preface` (`n`, `r`, `t`, `what` conj or maxClaims), after Makinson 1965. Reference: r = 0.99 and t = 0.95 allow 5 claims.
- `beauty` (`theory` halfer, thirder or double; `wakes`; `monday`). The thirder gives 1/(1 + wakes) (Elga 2000). The halfer gives ½,
  and w/(w + 1) on learning it is Monday (Lewis 2001). Double halfers give ½.

### 2.7 Indian and Buddhist forms

- `hetu` (`what` cell or verdict): Dignāga's *Hetucakra*. The cell is 3s + v + 1, with all = 0, none = 1, some = 2 for the
  sapakṣa (s) and the vipakṣa (v).
  - Cells 2 and 8 are valid (1).
  - Cells 4 and 6 are contradictory, viruddha (−1).
  - The others are inconclusive, anaikāntika (0).
  - A reason absent from the pakṣa is asiddha (−2).
  - Reference: smoke → fire is cell 8, "audible" cell 5 and "produced" cell 6.
- `koti` (`t`, `f`, `e?`): the catuṣkoṭi as First Degree Entailment (Priest 2010). 1 true only, 2 false only, 3 both, 4 neither,
  5 Priest's ineffable value.
- `bhanga` (`asti`, `nasti`, `avak`): the Jain saptabhaṅgī, 1–7 in the traditional order (Matilal 1981; Priest 2008).

### 2.8 Thought experiments, the map, arguments

- `teAnswer` (`experiment`, `position`) gives the index of that position's option.
- `teCount` (`experiment`, `option`) gives how many positions choose it. Reference: Dennett says Mary learns nothing (option 4), and
  Searle says the room does not understand.
- `influence` (`a`, `b`) gives the shortest chain a → … → b over "influenced", or −1. Reference: Socrates → Rawls is 5.
- `overlap` (`a`, `b`) gives the shared years. Reference: Kant and Hume share 52.
- scene `map` (`from`, `to`, `hi`) draws the model's thinkers:
  - lanes by tradition, a lifeline per thinker labelled with its key, and arrows of influence;
  - `hi` and its influences highlighted;
  - the y scale is (to − from)/18 per lane, because scenes are drawn to the same scale on both axes.
- `valid`, `counter` and `form` (`argument`) work through logic@1:
  - `valid`: `entails`, by truth tables;
  - `counter`: the number of countermodels (`truthTable`);
  - `form`: 1 modus ponens, 2 modus tollens, 3 hypothetical syllogism, 4 disjunctive syllogism, 5 constructive dilemma; −1 affirming
    the consequent, −2 denying the antecedent; 0 other (Copi, Cohen & McMahon 2014).

### 2.9 Rule consequentialism at an acceptance rate (`codeValue`, `ruleValue`, `idealCode`, `bestRate`, `idealShift`; series `codeCurve`, `rateAxis`)

Hooker 2000 (*Ideal Code, Real World* §§ 1.5–1.7, 3.2): the right act is the one the ideal code requires, and the ideal code is the
one whose internalisation by the overwhelming majority (Hooker: 90 %) has the greatest expected value, counting the cost of
getting it internalised. A rate is needed because the best code at full acceptance can be poor at partial acceptance (the
"collapse" and "partial compliance" objections; Mulgan 2001). Ridge 2006 (*Phil. Studies* 128:242) instead averages over every rate.

The engine's explicit model of one rule, per head, at acceptance a ∈ [0, 1]:

  V(a) = a · (b · a^k − c) − x · a · (1 − a)

- b: the benefit to each accepter when everyone accepts; k ≥ 0: how much the benefit needs others to accept (a coordination rule
  has k = 1; k = 0 none); c: the internalisation cost per accepter (Hooker's teaching cost: a longer, subtler code costs more); x:
  the loss of an accepter exploited by non-accepters (a rule of trust).
- A code's value is the sum of its rules' values. `codeValue` (`code`, `rate` = 0.9, `reading` `fixed` | `variable` — Ridge's
  mean over a = 0, 0.01, …, 1 by the trapezoid rule), `ruleValue` (`code`, `rule`, `rate`), `idealCode` (`rate`, `reading`: the
  index of the best code in `ruleCodes`, `tie`), `bestRate` (`code`: the rate in 0.01 steps where its value is highest),
  `idealShift` (`rate`: 1 when the ideal code at that rate differs from the one at full acceptance), series `codeCurve` (`code`:
  V at 101 rates) and `rateAxis`.

The functional form is ours (a transparent teaching model of Hooker's criterion, not a formula of his); every term is set by the
author.

### 2.10 Strategic voting (`voteNash`, `voteNashUndominated`, `voteNashWinners`, `sincereNash`, `gsManipulable`, `manipulators`, `gsExists`)

- **Voting games** (Farquharson 1969; Myerson & Weber 1993; Dhillon & Lockwood 2004, *GEB* 46:55). The election's ballot groups
  are expanded into single voters (whole `n`, full rankings, ≤ 8 voters; codes `whole`, `partial`, `too-many`). A voter's
  strategy is a ballot: plurality — the candidate voted for; antiplurality — the one voted against; the other methods (`borda
  copeland minimax irv runoff schulze rankedPairs kemeny`) — any strict ranking. The outcome is the method's winner with ties
  broken by the candidates' order. All Sᴺ profiles are searched (≤ 2·10⁶ evaluations, else `budget`). `voteNash`: the number of
  pure Nash equilibria (no voter gets a candidate they prefer by changing their own ballot); `voteNashUndominated`: those in which
  no voter uses a weakly dominated ballot (NaN with `budget` when the dominance search would pass 3·10⁷ comparisons);
  `voteNashWinners`: how many different candidates win in some equilibrium; `sincereNash`: 1 if sincere voting is an equilibrium.
  With unanimous voters every candidate wins in some equilibrium (all vote for it) — the classic reason for refinements.
- **Gibbard 1973 / Satterthwaite 1975.** `gsManipulable` (`election`, `method`): 1 if one voter can get a preferred winner by
  reporting another strict ranking (≤ 5 candidates); `manipulators`: how many voters can. `gsExists` (`method`, `m` 3–4, `n` 2–4):
  over every profile of n voters on m candidates, the number of profiles where some voter can manipulate — the theorem made
  visible (non-zero for every non-dictatorial method onto ≥ 3 candidates). The older `manipulable` (§2.3) searches the misreports of
  one ballot group and stays as it was.

### 2.11 Infinite ethics (`overtaking`, `catchingUp`, `truncCompare`, `discounted`, `limitAverage`, `paretoDominates`, `finiteAnonymous`, `infiniteAnonymous`, `infiniteConflict`; series `partialSums`)

A stream is `head` followed by `cycle` forever; two streams are compared on D_t = Σ_{s ≤ t} (a_s − b_s), exactly, on the heads
and one common period (lcm ≤ 4096, else `period`).

| output | rule | source |
|---|---|---|
| `overtaking` | 1 if D_t > 0 from some t on, −1 if < 0, 0 if D_t = 0 from some t on, else NaN + `incomparable` | Atsumi 1965; von Weizsäcker 1965 |
| `catchingUp` | a ≽ b iff liminf D_t ≥ 0; 1 / −1 / 0 / NaN + `incomparable` | Gale 1967 |
| `truncCompare` | the sign of D_T (a finite truncation) | — |
| `discounted` | Σ δᵗ u_t (closed form for the cycle), 0 ≤ δ < 1 | Ramsey 1928; Koopmans 1960 |
| `limitAverage` | the mean of the cycle | — |
| `paretoDominates` | a ≥ b everywhere and > somewhere | — |
| `finiteAnonymous` | a is a finite permutation of b (equal from some point, the same multiset before) | — |
| `infiniteAnonymous` | every value occurs equally often in a and b (finitely or infinitely), so a permutation of ℕ maps one onto the other | — |
| `infiniteConflict` | 1 (and `impossibility`) when Pareto ranks the pair and infinite anonymity equates it | Van Liedekerke 1995; Lauwers 1997; Bostrom 2011; Askell 2018 |

The demonstration: y = (1, 1, 0, 1, 0, …) Pareto-dominates x = (0, 1, 0, 1, …), and both have infinitely many 0s and 1s, so no
ordering can have Pareto and full anonymity; overtaking keeps Pareto and finite anonymity and gives up completeness:
(1, −1, 1, −1, …) against 0 has partial sums 1, 0, 1, 0 — incomparable by overtaking, better by catching-up. The existence of a
complete ordering with Pareto and finite anonymity needs non-constructive choice (Zame 2007; Lauwers 2010), so no engine can show
one: that limit is reported in the chapter, not computed.

### 2.12 Metz's ubuntu as a relational scoring model (`ubuntuScore`, `ubuntuPermissible`, `ubuntuBest`)

Metz 2007 (*J. Political Philosophy* 15:321, p. 338): "an action is right just insofar as it promotes shared identity among
people grounded on good-will; an act is wrong to the extent that it fails to do so and tends to encourage the opposites of division
and ill-will". Identity: thinking of oneself as part of a "we" and coordinating; solidarity (good-will): caring for the other's good
and acting for it. Metz 2013 and 2022 (*A Relational Moral Theory*) read the principle as honouring (prizing) such relationships,
not maximising them.

Computable where it is: an option lists its effects on relationships as Δidentity and Δsolidarity (−1…1, `range` outside), with
`byAgent` when it is the agent's own relationship.
- `promote` (default): score = Σ wI · ΔI + wS · ΔS, where a gain in identity that comes with ill-will (ΔS < 0) is not counted —
  identity not "grounded on good-will" (a cult, a mob); `ubuntuScore` (`case`, `option`).
- `honour`: an option in which the agent's own relationship loses identity or solidarity is impermissible whatever the total
  (`ubuntuPermissible`); among the permissible the promote score ranks. `ubuntuBest` (`case`, `reading`): the index of the best option
  (`tie`, `none-permissible`).
The weights and the numeric scale are the author's; the engine makes the structure of the two readings exact, not the size of a
relationship.

### 2.13 Mixed equilibria and mixed voting between blocs (`equilibria`, `eqProb`, `eqPayoff`; `mixedVoteCount`, `mixedVoteProb`, `mixedWinProb`)

For a game of `games` (up to 6 × 6), with `solver`:
- `support` (default) — support enumeration (von Stengel 2007, *Algorithmic Game Theory* ch. 3 §3.3): for every pair of supports of
  equal size, solve the indifference equations, keep the solutions that are probabilities and best responses. In a nondegenerate game
  this lists every equilibrium. An equilibrium with more pure best responses than its support marks the game degenerate (Def. 3.2):
  the list may then miss a continuum, and the run says `degenerate`.
- `lemke` — the Lemke–Howson algorithm (Lemke & Howson 1964, *SIAM J.* 12:413; von Stengel 2007 §3.5): complementary pivoting from
  the artificial equilibrium, dropping `label` (0 … m + n − 1, rows first). It returns one equilibrium; equilibria of index −1 are
  never reached from the artificial one (Shapley 1974).
`equilibria` is the count; `eqProb` (`eq`, `player`, `strategy`) a probability; `eqPayoff` (`eq`, `player`) the expected payoff.
Reference values (tests): von Stengel's 3 × 2 game A = [[3,3],[2,5],[0,6]], B = [[3,2],[2,6],[3,1]] has the three equilibria
((1,0,0),(1,0)), ((4/5,1/5,0),(2/3,1/3)), ((0,1/3,2/3),(1/3,2/3)) with payoffs (3,3), (3,14/5), (4,8/3); Lemke–Howson with label 2
ends at the third; battle of the sexes has (2/3, 1/3) worth 2/3; matching pennies (½, ½) worth 0.

Mixed voting: the ballot groups of an election play as blocs (a group's ballot counts n times; ties by the candidates' order). A
plurality ballot names a candidate, an antiplurality ballot the one voted against (`method`). A bloc's payoff is the Borda score of
the winner on its own ranking (`util: "borda"`, m − 1 − place) or 1 for its first choice (`util: "top"`). With **two** groups the
game is a bimatrix game and is solved exactly as above (bloc games are often degenerate: outcome ties, flagged). With **more** groups
the engine runs the multi-population replicator dynamics (Taylor & Jonker 1978; Weibull 1995 ch. 5) from the uniform mix and
returns its rest point flagged `approximate`: a rest point need not be an equilibrium, and only one is found. `mixedVoteProb`
(`eq`, `group`, `candidate`): the probability of that ballot; `mixedWinProb` (`eq`, `candidate`): the probability that it wins.

### 2.14 Poisson voting games (`expectedVotes`, `pivotProb`, `pivotMagnitude`, `poissonWinProb`, `voteGain`, `bestVote`, `poissonEquilibrium`)

Myerson 1998 (*Int. J. Game Theory* 27:375) and 2000 (*J. Economic Theory* 94:7): the number of voters is Poisson(n), so the votes
of each candidate are independent Poisson counts with means τ_k = n · Σ_t r_t [vote_t = k] (`expectedVotes`). Plurality, ties broken
with equal chances.
- `pivotProb` (`a`, `b`): the exact probability that a and b tie for first with every other candidate below, by summing the Poisson
  laws up to τ + 12√τ + 20 (the remainder is below 10⁻¹²). For two candidates it is Skellam's P(X = Y) = e^(−a−b) I₀(2√(ab))
  (Skellam 1946; a test).
- `pivotMagnitude` (`a`, `b`): Myerson's magnitude, lim (1/n) log P — here in units of log-probability: −(√τa − √τb)² when every other
  τ_c ≤ √(τa τb); with three candidates and τ_c above it, 3(τa τb τc)^(1/3) − τa − τb − τc (the third must be matched: a three-way
  near-tie). The test checks the slope of the exact log-probability against both formulas.
- `poissonWinProb` (`candidate`); `voteGain` (`type`, `candidate`): the expected utility gain of one more vote for the candidate, summed
  over the pivot events directly (tied at the top: wins outright; one behind: joins the tie), so tiny pivots keep their digits;
  `bestVote` (`type`): the index of the best vote (`tie`; `underflow` → NaN); `poissonEquilibrium`: 1 when every type's `vote` is a best
  response to the τ it generates, 0 when one is not.

The standard 3-candidate example (Myerson & Weber 1993, *APSR* 87:102; Myerson 2002, *JET* 103:219): 30 % A > B > C (u = 1, 0.9, 0),
30 % B > A > C, 40 % C. With n = 1000 the sincere split (A, B, C) is an equilibrium in which the Condorcet loser C wins (P ≈ 0.99985),
and both Duvergerian coalitions (A, A, C) and (B, B, C) are equilibria too; with 31 % / 29 % the sincere split is no longer one (B's
voters switch to A) — Duverger's law. These equilibrium verdicts are computed by the engine at n = 1000, with the published
utilities' structure; the papers' own statements are the qualitative ones (the papers prove limits as n → ∞ and give no table of
probabilities at a finite n).

## 3. Limits and speed

- Every loop is bounded: games ≤ 6 × 6 (≤ 923 support pairs), Poisson n ≤ 10⁵ and ≤ 6 candidates, ≤ 8 candidates, Kemeny ≤ 40 320 orders, manipulation ≤ 6 candidates, ≤ 2000 rounds × 20 reps, ≤ 2000
  generations, sorites ≤ 2000 items, arguments ≤ 12 atoms.
- A series has at most 2000 points, and a scene stays far below 2000 items.
- A typical run takes 0.07 ms. The worst allowed takes about 0.2 s: 6 candidates × 64 ballot groups with IRV manipulation, Kemeny and
  monotonicity, plus an 11-strategy tournament of 2000 rounds × 3 reps × 2000 generations.

## 4. What is left out, and why

- No free-text argument mapping, textual interpretation or phenomenology: they have no exact model to compute.
- Metz's ubuntu principle is modelled as a relational score in two readings (§2.12); other theories that are not calculi appear
  only as positions and on the map.
- Modal, deontic and epistemic logics and abstract and structured argumentation (ASPIC+, bipolar) belong to logic@1. Mini-apps call it directly.
- Infinite ethics covers eventually periodic streams (§2.11); a complete ordering with Pareto and anonymity cannot be computed
  (it needs non-constructive choice), so it is stated, not shown.
- Voting games search pure equilibria of ≤ 8 voters (§2.10); mixed equilibria are exact for two blocs and games up to 6 × 6
  (degenerate games are flagged, not completed), approximate (replicator) for more blocs (§2.13); Poisson games use plurality only, and
  three-way-constrained magnitudes only with three candidates (§2.14).
- Rule consequentialism uses an explicit acceptance-rate model (§2.9) whose terms the author sets.
- The thinkers' dates for ancient India and China are the conventional ones. The engine does not settle dating debates.
