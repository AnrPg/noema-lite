# `agents@1` — agent-based models and multi-agent systems (`src/engines/agents/agents.ts`, `NoemaLibAgents`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`). A model is described in the terms of the ODD protocol (Grimm et
al. 2006, 2020; Railsback & Grimm 2019): **entities** (breeds of agents with typed state, patches, globals), **space** (continuous,
grid, network or none), **process and scheduling** (rules in order, synchronous / random-order / fixed-order updating),
**stochasticity** (seeded NoemaSimKit streams), **observation** (reporters, histograms, a scene, replications with Student-t
intervals by the kernel). On top of the agent loop it has the multi-agent-systems layer: FIPA-ACL messages, BDI deliberation,
norms monitored by `NoemaLibLogic`, and five protocols (Contract Net, auctions, bargaining, coalitions, the iterated prisoner's
dilemma). Space comes from `NoemaSpaceKit` (`docs/library/space.md`), time/randomness/statistics from `NoemaSimKit`.

Tests: `node tests/lib_agents.js` (70 assertions, §8); the golden outputs of the former Python twin on `tests/fixtures/enginelib/agents.json`
(32 specs: 18 good, 14 bad). Reference activity: `tools/activities_examples/schelling-segregation`.

Pure, deterministic per seed, bounded (≤ 5000 agents, ≤ 2000 steps, an operation budget `maxOps` ≤ 4·10⁶ (default 2·10⁶) with
code `budget`, ≤ 200 000 messages, replications as many whole runs as fit 4·10⁶ operations), never throws.

## 1. The model

```json
"model": {
  "space": { "kind": "grid", "nx": 30, "ny": 30, "torus": true, "neighbourhood": "moore", "capacity": 1 },
  "globals": { "want": "want" },
  "breeds": [ { "id": "person", "count": 810, "place": "empty",
                "vars": { "group": { "init": "rnd < 0.5 ? 0 : 1", "type": "cat", "n": 2 } },
                "rules": [ { "do": "move", "how": "jump", "when": "nb > 0 && same/nb < want" } ] } ],
  "aggregates": [ { "id": "same", "of": "neighbours", "fn": "count", "where": "group == my_group" },
                  { "id": "nb", "of": "neighbours", "fn": "count" } ],
  "reporters": [ { "id": "similar", "fn": "mean", "expr": "same/nb", "where": "nb > 0" } ],
  "steps": 100, "stop": "similar > 0.9"
}
```

| field | meaning |
|---|---|
| `template`, `set` | one of the classic models (§4) and values (formulas over the spec's names) for its parameters |
| `space` | `{kind continuous\|grid\|network\|none, w, h, torus, nx, ny, neighbourhood moore\|vonneumann\|hex, radius, capacity, edges, nodes, directed, generate {kind ring\|er\|ws\|ba\|lattice\|complete, n, k, p, m, nx, ny}}` |
| `globals` | ≤ 16 named values (formulas over the spec's names), changed by interrupts |
| `patches` | `{nx, ny, vars, rules [{var, expr}], diffuse [{var, rate}]}`: cells of the grid (or a lattice over a continuous space) with their own variables |
| `breeds` | ≤ 6 `{id, count, vars {name: {init, type num\|int\|bool\|cat, min, max, n}}, place random\|empty\|node\|cluster, rules, bdi}` |
| `aggregates` | ≤ 12 `{id, of neighbours\|all\|here\|inbox, breed, fn, expr, where, perf}`: a value of each agent over the others |
| `schedule` | `random` (random order each step, the default), `sync` (everyone reads the states at the start of the step), `fixed` |
| `steps`, `dt`, `every`, `stop` | the run; `stop` is a formula over the reporters and globals |
| `reporters` | ≤ 16 `{id, of agents\|patches, breed, fn, expr, where}`, recorded every `every` steps |
| `hist` | ≤ 4 `{id, breed, expr, bins, min, max}` |
| `replications` | `{n, level}`: n seeded replications (NoemaSimKit substreams), Student-t intervals |
| `interrupts` | ≤ 8 `{at (a step) \| when (a condition), set {global: formula}, once}` |
| `norms` | ≤ 16 (§3) |
| `protocol` | a protocol instead of an agent model (§5) |
| `maxOps` | the operation budget |

Formulas see: an agent's own variables, `x y heading age id rnd deg intending`, the aggregates, the patch variables as `p_<var>`,
the globals and `t`. In `where` / `set` of an aggregate or an interaction, the **other** agent's variables are plain names and the
agent's own are `my_<var>`, `my_x`, `my_y`, `my_id` (in an inbox: `content`, `from`). `fn`: count, sum, mean, min, max, frac (the
share satisfying `where`), var, gini, order (|Σ heading vectors|/n, Vicsek et al. 1995).

### 1.1 Actions (`rules`, in order, each with optional `when`, `prob`, `act`)

| `do` | fields | meaning |
|---|---|---|
| `set` | `var`, `expr` | assign |
| `move` | `how` random\|heading\|gradient\|towards\|away\|empty\|jump, `speed`, `turn`, `target`, `patch`, `vision` | movement (`empty`, `jump`: a grid or network) |
| `die`, `reproduce` | `share {var: fraction}` | birth with a share of the parent's variables |
| `eat` | `patch`, `amount`, `into`, `gain` | take from a patch variable |
| `hunt` | `breed`, `into`, `gain` | eat an agent of the prey breed here |
| `contact` | `breed`, `where`, `set`, `contacts` | interactions: set the other's variables (infection, influence); `contacts` random partners in a well-mixed model |
| `adopt` | `var` | copy a random neighbour (the voter model, Holley & Liggett 1975) |
| `average` | `var`, `self`, `weights` equal\|edge | DeGroot 1974 averaging |
| `ising` | `var`, `J`, `h`, `T` | Glauber 1963 heat-bath flip of a ±1 spin |
| `flock` | `radius`, `sep`, `ali`, `coh`, `sepRadius`, `speed` | Reynolds 1987 boids (continuous space) |
| `send` | `perf` (FIPA performative), `to` neighbours\|all\|random\|breed, `breed`, `content` | a FIPA-ACL message (FIPA SC00037J 2002), delivered at the next step |

`act` names the action for the norms when it fires.

## 2. BDI agents (Rao & Georgeff 1991, 1995; Bratman 1987)

`bdi: {commitment blind|single|open, goals [{id, when, achieved, impossible, priority}], plans [{id, goal, context, body [actions]}]}`.
A goal is a desire while `when` holds; the agent deliberates (the highest priority among possible desires), commits to an
intention and executes the first applicable plan (`context`) one body action per step. Commitment: **blind** keeps the intention
until achieved; **single-minded** until achieved or impossible; **open-minded** while it is still desired. Outputs `bdi`
`adopted`, `achieved`, `dropped`, `actions`; formulas see `intending` (1 while an intention is held).

## 3. Norms (deontic monitoring)

`norms: [{id, kind O|F|P, act, cond, deadline, within, until, rank, issued, mode achieve|maintain, breed, sanction {var, add}}]`:
obligations, prohibitions and permissions over the actions agents take (`act` names) and the facts (bool variables, `breed_<id>`,
true globals). They are monitored each step by `NoemaLibLogic.normMonitor` (src/engines/logic/logic.js, `docs/library/logic.md` §9) per
agent; without it a fallback monitor with the same records runs (code `logic-fallback`; tested to give the same violations). A
violation applies its sanction to the agent's variable. Outputs `violations` (series per step, or a total / per norm),
`fulfilments`.

## 4. Templates

| template | model | parameters | source |
|---|---|---|---|
| `schelling` | segregation on a torus grid | size 30, density 0.9, want 0.3, fracA 0.5 | Schelling 1971 |
| `boids` | flocking | N 150, w 100, speed, radius, sep, ali, coh, sepRadius | Reynolds 1987 |
| `sir` | epidemic on a grid | size 50, beta, gamma, i0 | — |
| `sirnet` | epidemic on a small world | N 1000, k, p, beta, gamma, i0 | Watts & Strogatz 1998 |
| `sirwell` | well-mixed epidemic | N 2000, contacts, beta, gamma, i0 | Kermack & McKendrick 1927 |
| `sugarscape` | wealth, vision, metabolism | N 250, size 50, regrow | Epstein & Axtell 1996 |
| `wolfsheep` | predation with grass | size, sheep, wolves, gains, repro, regrowTime | Wilensky 1997 |
| `voter` | the voter model | size, p0 | Holley & Liggett 1975 |
| `ising` | the Ising model | size 32, T, J, h, m0 | Onsager 1944 |
| `degroot` | consensus on a network | N 20, k, p, selfw | DeGroot 1974 |

(The population size is `N`: `n` is a reserved name of the expression language.)

## 5. Protocols (`model.protocol`)

| kind | fields | outputs (`protocol` scalar / `protocolSeries`) |
|---|---|---|
| `contractnet` (Smith 1980) | tasks, contractors, costMin, costMax, costs, capacity, loadFactor | totalCost, optimalCost (cheapest per task; with capacity or load the Hungarian assignment, Kuhn 1955), makespan, messages, refusals, unassigned / load, winner |
| `auction` | format english\|dutch\|first\|second, bidders, rounds, strategy truthful\|shade\|bne, shade, inc, reserve, values | revenue, revenueHalf, expectedRevenue ((n−1)/(n+1)), efficiency, dominance (the share of trials no deviation beats truthful bidding), price, winner, secondValue / prices |
| `negotiation` | method rubinstein\|zeuthen, d1, d2, horizon, a1, a2, step | share1, share2, rounds, closedForm ((1−δ₂)/(1−δ₁δ₂)), nashX, agreement / offers |
| `coalition` | players, v (over s, w, k0, k1) or table (2ⁿ − 1 values by bitmask), weights, kinds | grand, coreEmpty, shapleyInCore, minCoreTotal (Bondareva–Shapley LP) / shapley |
| `ipd` | strategies (allc alld tft tf2t grim pavlov random gtft joss), rounds, noise, T R P S, generations, generosity | winner, coopRate, best / scores, shares, share |

Vickrey 1961, Myerson 1981 (revenue equivalence), Rubinstein 1982, Zeuthen 1930 and Harsanyi 1956 (→ Nash 1950), Shapley 1953,
Bondareva 1963, Shapley 1967, Axelrod 1984.

## 6. Outputs

Series: `t`, `reporter`, `hist`, `histEdges`, `replValues`, `agentVar` (the variable of every agent at the end), `messageCount`
(per step, optionally of one `perf`), `violations`, `protocolSeries`. Scalars: `final`, `stat` (min, max, mean, pp, rms of a
reporter's series), `replMean`, `replLo`, `replHi`, `replHalf`, `replSd`, `count` (of a breed), `steps`, `messages`,
`violations`, `fulfilments`, `bdi`, `protocol`, `ops`, `flag`, `ok`. Scene `space`: agents as points (continuous: arrows with
`arrows`), coloured by breed or by `colorBy` in roles, patches as a heat map (`patch`), network edges (`edges`); a full grid
becomes a heat map of the colour variable; ≤ 2000 items.

## 7. Codes

Fatal: `kernel` (NoemaSimKit missing), `nan`. Notes: `budget`, `repl-cut` (fewer replications than asked), `agent-limit`,
`message-limit`, `no-space`, `stopped`, `logic-fallback`, `norm-parse`, `extinct`, `lp` (the core LP did not solve),
`no-agreement`.

The stepper (`NoemaLibAgents.stepper`): `init` prepares the model; `step(state, inputs, t, dt)` runs the model from its seed to
step round(t + dt) with the inputs held, so stepping is deterministic and equals a run of as many steps (a replay: the cost grows
with the step count; ≤ 2000 steps). `snapshot: null`.

## 8. Reference values asserted by `tests/lib_agents.js`

| case | value | source |
|---|---|---|
| Schelling want 0.3 | similar 0.50 → 0.74, nobody unhappy | Schelling 1971 |
| Boids | order 0.07 → 0.99 | Vicsek et al. 1995 |
| SIR well mixed, R0 2.5, 8 replications | final size 0.89 ± 0.02 | z = 1 − e^(−R0 z) = 0.8926 |
| Ising 32², T 1.5 | m = 0.986 ± 0.015 | Onsager 1944: 0.9865 |
| Ising T 4 | |m| < 0.1 | T_c = 2.269 |
| DeGroot | consensus = Σ(deg+1)x₀/Σ(deg+1) to 10⁻⁹ | DeGroot 1974 |
| voter, 40 replications | E[mean] = ½ | martingale |
| two voters, sync / async | swap for ever / agree | Huberman & Glance 1993 |
| BDI blind / single / open | pos 10 / 10 / 3 | Rao & Georgeff 1991 |
| Contract Net 20 × 5 | totalCost = optimalCost, 320 messages | Smith 1980 |
| auctions, 4 bidders | revenue 0.6 in all four formats; second-price dominance 1 | Vickrey 1961; Myerson 1981 |
| Rubinstein δ 0.9, 0.8 | 0.714286 | Rubinstein 1982 |
| Zeuthen a 1, 2 | 1/3 | Nash 1950 |
| glove game | Shapley (2/3, 1/6, 1/6), core not empty, Shapley outside it | Shapley 1953 |
| majority game | core empty, LP 1.5 | Bondareva 1963 |
| [51; 40, 30, 20, 10] | Shapley–Shubik (5, 3, 3, 1)/12 | Shapley & Shubik 1954 |
| IPD TFT vs ALLD, 200 rounds | 799, 404 | Axelrod 1984 |
