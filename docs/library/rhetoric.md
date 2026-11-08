# `rhetoric@1` — debate and oratory (`src/engines/rhetoric/rhetoric.js`, `NoemaLibRhetoric`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for debating, argumentation, classical rhetoric and public speaking,
built as a **computation engine over structured inputs**: a debate round (speeches, timings, points of information, ballots), an
argument map, logical forms, a speech text with optional word timings, an outline, and small persuasion models. The outputs are
numbers (for readouts and the checks grader), series and scenes (a Toulmin diagram, an argument map, a flow sheet, the text with its
figures, a timing bar). Tests: `node tests/lib_rhetoric.js` (172
assertions, including the golden outputs of the former Python twin on the fixtures) and `node tests/enginelib.js` (`tests/fixtures/enginelib/rhetoric.json`, 35
specs) once the engine is registered. The reference activity is `tools/activities_examples/bp-adjudication` (a British Parliamentary
round with a three-judge panel: the learner predicts the panel's ranking). The research behind this chapter is the project's
`engine-library/research/rhetoric.md`.

**Logic is not re-implemented here.** Dung semantics, truth tables and syllogisms come from `logic@1` (its module, imported:
`afSolve`, `parse`, `atomsOf`, `evalProp`, `rowsOf`, `syllogism`; `docs/library/logic.md` §9). `src/engines/logic/logic.js` loads before this
file, and the Worker source of `rhetoric@1` is `NoemaExpr + core + logic@1 (source()) + rhetoric@1`, so the page and the Worker run
the same code. Pure JS, no vendored dependency, deterministic, bounded; numbers, codes, keys and the model's own short texts (`s`, ≤ 64
characters) leave the engine. No learner words: figure and fallacy names are indices into fixed lists (§5, §6), which the activity
labels in its own string tables.

## 1. The spec (excerpt of the reference activity)

```json
{ "format": "noema.sim-spec/v1", "engine": "rhetoric@1",
  "params": [ { "id": "gCG", "kind": "slider", "label": "gCGLabel", "min": 1, "max": 4, "step": 1, "default": 1 } ],
  "model": {
    "speeches": [ { "id": "pm", "role": "PM", "team": "OG", "dur": 418, "label": "spPM",
                    "pois": [ { "at": 45, "by": "OO" }, { "at": 150, "by": "CO", "accepted": true } ] },
                  { "id": "lo", "role": "LO", "team": "OO", "dur": 425, "label": "spLO" } ],
    "debate": { "format": "bp", "grace": 15, "panel": "majority",
                "teams": [ { "id": "OG", "side": "gov", "label": "teamOG" }, { "id": "OO", "side": "opp" }, { "id": "CG", "side": "gov" }, { "id": "CO", "side": "opp" } ],
                "ballots": [ { "id": "j1", "chair": true,
                               "ranks": [ { "team": "OG", "rank": 2 }, { "team": "OO", "rank": 4 }, { "team": "CG", "rank": 1 }, { "team": "CO", "rank": 3 } ],
                               "scores": [ { "speech": "pm", "pts": 77 }, { "speech": "lo", "pts": 73 } ] } ] },
    "map": { "nodes": [ { "id": "a1", "side": "gov", "speech": "pm", "label": "argA1" }, { "id": "a2", "side": "opp", "speech": "lo", "label": "argA2" } ],
             "edges": [ { "from": "a2", "to": "a1", "kind": "attack" } ] } },
  "outputs": [ { "id": "rCG", "kind": "scalar", "of": "rank", "team": "CG" }, { "id": "viol", "kind": "scalar", "of": "violations" },
               { "id": "dur", "kind": "series", "of": "durations" }, { "id": "flow", "kind": "scene", "of": "flow" } ],
  "plots": [ { "kind": "scene", "of": "flow", "title": "flowTitle", "height": 260 } ] }
```

- **numx** fields (numbers or expressions over the spec's names) are listed by `exprs(spec)` as `[source, path, []]`: first every
  numx of the model, walked in the table's order (speech `dur`, POI `at`, ballot `rank` and `pts`, oxford votes, node `impact`, `prob`,
  `time`, `steps`, outline `pos`, `stasis`, `elm`, `inoculation`, `audience`, `delivery`), then the outputs' `sentence`, `tau`, `at`.
  `keys(spec)` lists every `label` of the model (speeches, teams, nodes, outline parts).
- **Raw content**: a speech's `text` (≤ 20 000 characters each, ≤ 40 000 in all), its `timing` (≤ 8000 `[start, end]` pairs in
  seconds, one per token of the text), a node's `s` (≤ 64), a syllogism's `mood`, extra fillers (≤ 50, ≤ 32 characters each).
- **Runtime**: `run(spec, env, {prepared})` → `{out, codes: [{id, code}]}`; texts and figures are cached per run (and across runs via
  `prepare`). What cannot be computed is NaN, an empty series or an empty scene with a code (§10); a run never throws.

### 1.1 The model

| field | kind | meaning |
|---|---|---|
| `lang` | en · el · de · fr · ru · es · it · other | the default language of the texts |
| `speeches` | ≤ 40 `{id!, text, timing, lang, team, role, speaker, side, dur (numx, s), pois, label}` | `role` is a slot of the format (§2); `pois` ≤ 30 `{at! (s into the speech), by (team), accepted}` |
| `debate` | `{format! bp·wsdc·ld·policy·popper·oxford·custom, grace (s), panel chair·borda·majority, teams ≤ 8 {id!, side!, label}, slots (custom), ballots ≤ 60, pre, post, score [lo, hi]}` | a ballot `{id!, round 1–20, judge, chair, winner, ranks [{team!, rank!}], scores [{speech!, pts!}]}`; `pre`/`post` `{for!, against!, undecided}` |
| `map` | `{nodes! ≤ 120, edges ≤ 400}` | node `{id!, kind claim·premise·data·warrant·backing·qualifier·rebuttal·objection·person, side, speech, s, scheme, cq [1 answered · 0 failed · −1 open], impact, prob, time, stock harms·inherency·solvency·topicality, misrepresents (node), offTopic, options, alternatives, steps [p], appeal ethos·pathos·logos, topos, label}`; edge `{from!, to!, kind support (default)·attack·undercut·except}` |
| `forms` | ≤ 20 `{id!, premises [≤ 8], conclusion}` or `{id!, mood (AEIO³), figure 1–4, existential}` | propositional forms in logic@1's language (`p -> q`, `~p`, `p & q`, `p | q`) or categorical syllogisms |
| `outline` | `{scheme! monroe·oration·canons·stasis, parts [2–12 {id!, part!, pos!, label}]}` | `pos` is where the learner put the part (a param) |
| `stasis` | `{conjecture, definition, quality, translation}` | 1 agreed, 0 disputed |
| `elm` | `{motivation!, ability!, quality!, cue!}` | §8 |
| `inoculation` | `{r0, tau (days), attack, boosters [days], horizon}` | §8 |
| `audience` | `{grade, formula, wpmLo, wpmHi, tol}` | §7 |
| `delivery` | `{pause (s, default 0.25), window (s, default 30), fillers [extra words or phrases]}` | §7 |
| `synizesis` | bool (default false) | Greek syllables with synizesis (§7) |
| `theory` | `{kb ≤ 64 [{f!, kind axiom·ordinary, rank}], rules ≤ 64 [{id!, body [≤ 8], head!, kind strict·defeasible, rank}], contraries ≤ 64 [{u!, v!}], link last·weakest, ordering elitist·democratic, transpose}` | an ASPIC+ theory (§3.1); literals `p`, `¬p` (also `~p`, `!p`, `-p`) |

### 1.2 Checker codes (`checkSpec`)

| code | when |
|---|---|
| `format` / `value` / `size` / `enum` / `unknown-field` (warning) | the shared walker: shapes, required fields, lengths, enumerations |
| `dup` | two speeches, teams, ballots, nodes, forms, outline parts or theory rules with the same id |
| `literal` | a theory premise, rule body or head, contrary, or the `concl` of `justified`, that is not a literal |
| `value` | a text that is not a string; a timing pair not `[start, end]` with 0 ≤ start ≤ end, or timings without a text; a form with neither (or both) premises + conclusion and mood + figure; a mood not of A, E, I, O; a custom format without `slots`; an Oxford vote with only one of pre/post; a node `s` not 1–64 characters; a filler not 1–32; `fallacy` without node or form; `speaks` without team or speech |
| `size` | a text over 20 000 characters, all texts over 40 000, timings over 8000; more CQ answers than the scheme has |
| `ref` | a team, role, speech, node, form or ballot that does not exist (a role not of the format, with the format's list); an outline part not of its scheme; an output whose model section is missing (`needs model.debate`); `swing` outside the oxford format |
| `output` | an `of` that does not exist for that `kind` |

## 2. Debate formats (presets; `custom` overrides everything)

Minutes per slot; "POI" = point of information; protected = the first and last minute (no POI may be offered).

| format | slots (role, side, minutes) | POIs | speaker scale | source |
|---|---|---|---|---|
| `bp` | PM, LO, DPM, DLO, MG, MO, GW, OW (gov/opp alternating), 7 each | yes, protected 60 s | 50–100 | WUDC Debating & Judging Manual (2015/16; WUDC 2020) |
| `wsdc` | P1, O1, P2, O2, P3, O3 8 each; OR, PR 4 (Opposition replies first, by speaker 1 or 2) | substantive only, protected 60 s | 60–80, replies 30–40 (style 40 · content 40 · strategy 20) | WSDC rules; TWSDC 2018 adjudicator notes |
| `ld` | AC 6, CXN 3, NC 7, CXA 3, AR1 4, NR 6, AR2 3; prep 4 | — | 20–30 | NSDA Lincoln–Douglas guide and ballot |
| `policy` | AC1 8, CX1 3, NC1 8, CX2 3, AC2 8, CX3 3, NC2 8, CX4 3, NR1 5, AR1 5, NR2 5, AR2 5; prep 8 | — | 20–30 | NSDA policy (high school); college NDT/CEDA uses 9/3/6 — write it as `custom` |
| `popper` | A1 6, CX1 3, N1 6, CX2 3, A2 5, CX3 3, N2 5, CX4 3, A3 5, N3 5; prep 8 | — | 20–30 | IDEA Karl Popper rules (tournaments vary) |
| `oxford` | OF1, OA1, OF2, OA2 7; CF, CA 2 | — | — | Intelligence Squared US (Open to Debate) conventions; the audience decides |
| `custom` | `slots` [{role!, side!, min!, poi, protect (s), reply, cx}] | as given | `debate.score` | — |

Rule checks per speech (each a **violation**, counted by `violations`, with its code): over the limit + `grace` (`overtime`; the
grace is a tournament convention, often 15 s, default 0), a POI where none is allowed (`poi_not_allowed`: LD, policy, replies), a POI
in protected time (`poi_protected`), a POI from one's own side (`poi_own_side`), a WSDC reply by the third speaker (`reply_speaker`),
a team on the wrong side of its slot (`side_mismatch`). A speech without a slot gets `no_slot`.

### 2.1 Ballots and the panel

- **A ballot**: `ranks` (BP: 1–4, all different — else `ranks` and the ballot is ignored), or `winner`, or neither (then the higher
  speaker total wins; equal totals: `tie`). Speaker points outside the format's range: `score_range`.
- **Consistency** (`consistent`): BP — a higher-ranked team must have the strictly higher total of speaker points (WUDC: no
  low-point wins; equal totals for different ranks is `tie`); WSDC — the winner must have the higher total, no draws. In LD, policy,
  Popper and custom formats a **low-point win** is allowed: `consistent` stays 1, `lpw` is 1 and the code `low_point_win` is given.
- **The panel** of a round (`debate.panel`): `majority` (default) — for each pair of teams the one ranked higher by more judges
  (Copeland scores), ties and cycles broken by the chair's ranking (code `cycle`; two teams split evenly: `split`); `borda` — team
  points 3-2-1-0 summed over the judges, ties by the chair; `chair` — the chair's ballot. Real BP panels deliberate to consensus and vote
  only when it fails (WUDC manual); `majority` is the computable model of a split panel.
- **Team points** (`points`): BP 3, 2, 1, 0 (WUDC); two-team formats 1 for a win. Without `round`, summed over all rounds. **Tab**
  (`tab`): the position after all rounds by team points, then the sum of the panel's mean speaker totals (the Tabbycat default).
- **Oxford vote** (`swing`): the change of a side's share in percentage points between `pre` and `post` (counts are turned into
  percentages: `vote_sum`); the side with the larger rise wins (IQ2US rule — it favours the side that starts lower).

| output (scalar) | fields | value |
|---|---|---|
| `limit` · `overtime` | `speech!` | the slot's limit (s) · duration − limit (s; negative when under) |
| `poiOffered` · `poiAccepted` · `poiProtected` · `violations` | `speech` (else the round) | counts |
| `rank` · `points` · `ballotsFor` | `team!`, `round`, `ballot` | the panel's (or one ballot's) rank, team points, ballots ranking it first |
| `speaks` | `team` or `speech`, `round`, `ballot` | speaker points (the mean over the round's ballots) |
| `winner` · `winnerSide` · `margin` | `round`, `ballot` | 1-based index of the winning team in `teams` · +1 gov/prop/aff/for, −1 opp/neg/against · winner's minus last team's total |
| `consistent` · `lpw` | `ballot` (`lpw`: `ballot!`) | 1/0 |
| `tab` | `team!` | 1-based tab position |
| `swing` | `side!` for·against | percentage points |
| series `durations`, `limits`, `speechAxis` | — | per speech in the model's order |

## 3. Argument structure (the `map`)

- **Toulmin 1958** (*The Uses of Argument*): a claim with data (`data`/`premise` nodes supporting it), a warrant (supporting it),
  backing (supporting the warrant), a qualifier, and a rebuttal — an exception condition linked by an `except` edge (or a node of kind
  `rebuttal`), which is **not** a Dung attack: an exception does not defeat the claim until it is shown to hold. `toulmin` (scalar,
  `node!`) counts the parts present (1–6); the scene `toulmin` draws D → C with W, B below, Q on the arrow and R beside the claim.
- **Attacks and survival**: `attack` (rebut/undermine) and `undercut` (Pollock 1987; drawn dashed, treated as an attack on the node it
  targets) form a Dung framework; `support` edges do not (they enter the bipolar outputs below). logic@1 `afSolve` gives the grounded
  labelling (in 1, out 0, undecided ½), the preferred and the stable extensions (Dung 1995, AI 77:321; Caminada 2006 labellings).

| output | fields | value |
|---|---|---|
| `label` | `node!`, `semantics` grounded·preferred·stable, `ext` | 1 / 0 / 0.5 in the grounded labelling, or in the `ext`-th extension (no extension: NaN, `no_extension`) |
| `accepted` | `node!`, `semantics`, `mode` credulous·sceptical | 1 if in some / every extension (grounded: in) |
| `extensions` · `inCount` | `semantics`; `side` | how many extensions; arguments IN (of a side) |
| `clash` | — | attacks between opposite sides |
| `dropped` | `side` | arguments made in speech k that no node of the other side made in a later speech attacks, when such a later speech exists (the flow-sheet sense of "dropped": conceded) |
| `netBenefit` · `weighedWinner` | `tau` | Σ over IN arguments with an `impact` of side sign × impact × prob × e^(−time/τ) (impact calculus: magnitude, probability, timeframe; Edwards 2008 *Competitive Debate*) · its sign; a tie gives −1 with `presumption` (the negative holds presumption in policy debate) |
| `stockMet` · `primaFacie` | — | stock issues (harms, inherency, solvency, topicality) with an IN affirmative node · 1 if all four (the affirmative's burden of a prima facie case) |
| scenes `map` (`semantics`), `flow` | — | the layered map coloured by label (ok in, bad out, warn undecided); the flow sheet: one column per speech, arguments in rows, attack arrows, dropped arguments in `warn` |

### 3.1 Bipolar maps and ASPIC+ theories (through logic@1)

- **Bipolar** (Cayrol & Lagasquie-Schiex 2005, 2013; logic@1 `bipolar`, `docs/library/logic.md` §3.12): the map's `support` edges
  with its attacks and undercuts; `support` (output field) `general` (supported + secondary attacks, default), `deductive` (supported +
  mediated), `necessary` (secondary + extended). Outputs: `complexAttacks` (the attacks added), `bipolarLabel` (`node!`, `semantics`,
  `ext`: 1 / 0 / ½ in the framework with the complex attacks), `bipolarAccepted` (`node!`, `semantics`, `mode`).
- **ASPIC+** (Modgil & Prakken 2014; logic@1 `aspic`, `docs/library/logic.md` §3.11): `model.theory` gives premises, strict and
  defeasible rules, contraries and the ordering. Outputs: `aspicArgs`, `aspicDefeats`, `justified` (`concl!` a literal, `semantics`,
  `mode`: credulous or sceptical (default) — 1 when an argument for it is in every / some extension), `postulates` (1 when the four
  rationality postulates of Caminada & Amgoud 2007 hold on every extension, else 0 and code `postulate`), scene `aspic` (the
  arguments on a circle with their conclusions, defeats as arrows, in ok · out bad · undecided warn). logic@1's codes
  (`not-transposed`, `axioms-inconsistent`, `not-well-formed`, `budget`) pass through.

## 4. Argumentation schemes and informal fallacies

Schemes and their critical questions after Walton, Reed & Macagno 2008 (*Argumentation Schemes*, CUP, ch. 9); a fallacy is a defective
use of a scheme (Walton 1995): a failed CQ (`cq[k] = 0`) that the table maps to a fallacy makes the node fallacious.

| scheme | CQs | a failed CQ → fallacy |
|---|---|---|
| `expert` | 6 (expertise, field, opinion, trustworthiness, consistency, backup) | 1–2 → ad verecundiam |
| `position` 3 · `cause` 3 · `practical` 5 · `sign` 2 · `classification` 2 · `commitment` 2 · `precedent` 2 | | — |
| `popular` | 2 | ad populum |
| `analogy` | 3 (similar, differences, counter-analogy) | 1–2 → false analogy |
| `correlation` | 3 (correlation, chance, third factor) | 2–3 → post hoc / cum hoc |
| `consequences` | 3 (likelihood, evidence, opposite) | 1 → appeal to consequences |
| `example` | 4 (true, supports, typical, enough) | 3–4 → hasty generalisation |
| `adHominem` · `circumstantial` | 3 (… relevant …) | 2 → ad hominem · tu quoque |
| `slope` | 3 (each step, bounded, end bad) | 1 → slippery slope; also when the product of `steps` < 0.5 (Hahn & Oaksford 2007: a chain is as strong as its links; five 0.8 steps give 0.33) |
| `ignorance` | 2 (search thorough, would be known) | 1 → ad ignorantiam |

Structural fallacies, from the map the author gives (detecting them in free text is beyond a bounded engine; Jin et al. 2022 reach
~0.58 F1 with large models), checked in this order: a support cycle through the node → **begging the question**; the node
`misrepresents` another → **straw man** (the distorted restatement); `offTopic` with an edge → **red herring**; an attack on a `person`
node → **ad hominem** (circumstantial scheme: **tu quoque**); `options` < `alternatives` → **false dilemma**; then the schemes.

| output | fields | value |
|---|---|---|
| `fallacy` | `node` or `form` | the index in the catalogue below (0 none) |
| `fallacies` | — | fallacious nodes + invalid forms |
| `cqOpen` · `cqFailed` | `node!` | CQs not asked (−1 or missing) · failed (no scheme: `no_scheme`) |
| `schemeCQs` | `scheme!` | the scheme's number of CQs |
| `slope` | `node!` | the product of `steps` (`no_steps`) |

**The fallacy catalogue** (`NoemaLibRhetoric.FALLACIES`, fixed order): 0 none, 1 affirming the consequent, 2 denying the antecedent,
3 undistributed middle, 4 illicit major, 5 illicit minor, 6 exclusive premises, 7 negative mismatch (a negative conclusion from
affirmative premises or the reverse), 8 existential fallacy, 9 invalid form (other), 10 begging the question, 11 straw man, 12 red
herring, 13 ad hominem, 14 tu quoque, 15 ad verecundiam, 16 ad populum, 17 ad ignorantiam, 18 post hoc, 19 slippery slope, 20 false
analogy, 21 hasty generalisation, 22 false dilemma, 23 appeal to consequences. A "find the fallacy" task gives a `choice` param with
these values and checks `pick == f`.

## 5. Formal fallacies (logic@1)

- **Propositional** (`premises`, `conclusion`): parsed by logic@1 (`parse`, its error codes passed through with `parse`), valid iff no
  row of the truth table (`rowsOf`, ≤ 12 atoms: else `too_many_atoms`) makes the premises true and the conclusion false. An invalid form
  with a premise A → B, the premise B and the conclusion A is **affirming the consequent**; with ¬A ⊢ ¬B **denying the antecedent**;
  any other invalid form is `invalid_form`. `counter` (`form!`, `atom!`) gives the atom's value in the first counterexample row (rows
  from all-true down; a valid form: NaN, `valid`; an unknown atom: `no_atom`).
- **Categorical syllogisms** (`mood`, `figure`, `existential`): validity from logic@1 `syllogism` (Venn regions; 15 valid forms without
  existential import, 24 with it). The rule broken, after the medieval rules of distribution (A distributes the subject, E both, I none,
  O the predicate; Copi & Cohen, *Introduction to Logic*, ch. 6), in this order: undistributed middle, illicit major, illicit minor,
  exclusive premises (two negatives), negative mismatch, existential fallacy (valid only with import: Darapti AAI-3).

| output | fields | value |
|---|---|---|
| `valid` | `form!` | 1 / 0 |
| `counter` | `form!`, `atom!` | 1 / 0 |
| `fallacy` | `form` | §4 index |

## 6. Figures of speech over a text

Tokens are maximal runs of letters, marks and digits with inner apostrophes (every script); comparison folds case, strips
diacritics, maps Greek ς → σ and Russian ё → е. Sentences end at `. ! ? …` (Greek also `;` / U+037E; an abbreviation such as Mr. or a
decimal number does not end one); clauses split at `, ; : — – ( ) " « » „ “ ”`, a spaced hyphen and line breaks. Fillers (§7) are left
out. Definitions after Lanham 1991 (*A Handlist of Rhetorical Terms*) and Lausberg 1998; the detection rules are deliberately simple
and explainable — they find the classic examples and can also fire on ordinary prose (a tricolon of three short clauses), which is
the point of a "detect the figure" exercise.

| type (index) | rule |
|---|---|
| anaphora (0) | the first word of ≥ 2 successive clauses is the same; a run of clauses counts once |
| epistrophe (1) | the last word of ≥ 2 successive clauses (of ≥ 2 words) is the same; a run counts once |
| symploce (2) | both on the same pair of clauses (≥ 3 words each) |
| anadiplosis (3) | the last word of a clause is the first of the next (a content word) |
| climax (4) | two anadiploses in a row (gradatio) |
| epanalepsis (5) | a clause of ≥ 3 words begins and ends with the same word |
| epizeuxis (6) | a content word repeated at once |
| antimetabole (7) | a … b … b … a within a clause and the next clause of the same sentence, a ≠ b, words other than articles, conjunctions, prepositions and auxiliaries; inflected forms match on their first five letters (Mensch/Menschen, человек/человека); the widest pair with the most content words is kept (Dubremetz & Nivre 2015, 2018 rank chiasmus candidates similarly) |
| polyptoton (8) | two different content words of a sentence sharing a prefix of ≥ 60 % of the longer (≥ 4 letters) |
| alliteration (9) | ≥ 3 different content words starting with the same consonant letter within a short window (orthographic: a proxy for sound) |
| tricolon (10) | three successive clauses of ≤ 8 words differing by ≤ 1, or sharing their first or last word; or a list "A, B and C" |
| isocolon (11) | two successive clauses of the same length (≥ 3 words) |
| asyndeton (12) | ≥ 3 short clauses without a coordinating conjunction |
| polysyndeton (13) | ≥ 2 coordinating conjunctions close together in a sentence |
| question (14) | a sentence ending in ? (Greek ;) — whether it is rhetorical is the author's call |
| antithesis (15) | the language's "not X but Y": en not/never/no … but · el δεν/όχι/μη … αλλά · de nicht/kein … sondern · fr pas/non/jamais … mais · ru не/нет … а/но · es no … sino · it non … ma/bensì |

Function words, conjunctions and fillers are built in for en, el, de, fr, ru, es, it; `other` has none (every word is a content word).

| output | fields | value |
|---|---|---|
| `figure` | `type!`, `speech` | occurrences |
| `figureAt` | `type!`, `sentence!` (numx), `speech` | 1 if a figure of that type starts in sentence n (no such sentence: NaN, `no_sentence`) |
| series `figuresBySentence` | `type!` | occurrences per sentence |
| scene `figures` | `type` | the text in lines of ≤ 64 characters, sentence numbers, the words of the figure in role `hi`, fillers `muted` |

### 6.2 Sound figures (by phonetic keys)

A word's **phonetic key** (`phon(word, lang)`) is its spelling turned into a rough phoneme string by the language's main grapheme
rules: en the usual digraphs (ph, sh, ch, th, ck, gh before t or at the end, wr-, kn-), c/s, ee/ea/ie → i, oo → u, ou/ow → au, the
silent final e (Carney 1994, *A Survey of English Spelling*); el the digraphs (ου, αι, ει/οι/υι), αυ/ευ/ηυ as av/af by the next sound,
μπ ντ γκ, synizesis (an unaccented ι, υ, ει, οι before a vowel is the glide j; Holton, Mackridge & Philippaki-Warburton 1997 §1.1–1.4);
de sch, ch, ie, ei, eu/äu, umlauts, v/w/z, final devoicing (Wiese 1996); fr eau/au, oi, ou, the nasal vowels, mute final e and
consonants (Tranel 1987); ru transliteration with final devoicing (Timberlake 2004); es seseo, yeísmo, silent h (Hualde 2005); it
ch/gh, c/g before e/i, gn, gli, sc, geminates (Krämer 2009). It is a key for comparing words, not a transcription; stress is not
marked, so a rhyme is matched from the last vowel group.

| type | rule (definitions: Lanham 1991; rhyme: Brogan 2012, *Princeton Encyclopedia of Poetry and Poetics*) |
|---|---|
| rhyme | the last words of two clauses at most two apart have the same rime (the key from its last vowel group on, ≥ 2 sounds or open), and are different words |
| assonance | ≥ 3 different content words within 6 tokens of a clause share a vowel sound, and not all one rime |
| consonance | ≥ 3 different content words within 6 tokens of a clause end in the same consonant sound and do not all start with the same sound (that is alliteration) |
| paronomasia | two different content words of a sentence (≥ 4 letters, not one stem: that is polyptoton) whose keys differ by exactly one edit |

Outputs: `sound` (`type!`, `speech`: occurrences), `soundAt` (`type!`, `sentence!`), series `soundsBySentence` (`type!`), scene
`sounds` (`type`: the text with the words highlighted). The orthographic `alliteration` of §6 stays as it was.

### 6.3 Trope candidates (by explicit cues)

The engine does not read meaning. It reports **candidates** — places where a cue says a trope may be — with the cue; every
non-zero `trope` carries the code `candidate`, and the scene `tropes` writes `type: cue` beside each sentence.

| type | cues (per language) | source |
|---|---|---|
| simile | a comparison marker between two content words: en like (not after I, you, we, they, would, feel, look), as if, as though, as … as · el σαν, σα, όπως, λες και, σάμπως, καθώς · de wie, als ob, gleichsam · fr comme, tel(le)(s), pareil à, ainsi que, semblable à · ru как, словно, будто, точно, подобно, как будто · es como, cual, igual que, tal como · it come, quasi, simile a, come se | Lanham 1991; Israel, Harding & Tobin 2004 |
| metaphor | a signalling expression: en so to speak, metaphorically, figuratively, literally, as it were, a kind of, a sort of, in a sense · el μεταφορικά, κατά κάποιον τρόπο, ας πούμε, κυριολεκτικά, ένα είδος · de sozusagen, gewissermaßen, bildlich gesprochen, buchstäblich, eine Art · fr pour ainsi dire, au sens figuré, littéralement, une sorte de · ru так сказать, образно говоря, буквально, своего рода · es por así decirlo, literalmente, una especie de · it per così dire, letteralmente, una specie di; or the genitive metaphor "copula DET N of" (en, fr, es, it: *Life is the art of …*) | Goatly 1997 ch. 6; Brooke-Rose 1958 |
| irony | a marker: en so-called, yeah right, oh great, just great, what a surprise, how convenient, thanks a lot · el δήθεν, τάχα, μπράβο σου, τι ωραία · de sogenannt-, na toll, na super, wie schön · fr soi-disant, prétendu(e), quelle surprise, merci bien · ru так называемый, ну конечно, ну спасибо, да уж · es el llamado, supuesto, qué bien, sí, claro · it cosiddetto, che bello, grazie tante; scare quotes around 1–3 words; ?! or ‽ | Attardo 2000; Burgers, van Mulken & Schellens 2012; Kreuz 1996 |

Outputs: `trope` (`type!`), `tropeAt` (`type!`, `sentence!`), series `tropesBySentence`, scene `tropes`. A sentence such as "I like
tea" is not a simile; "as if" in an irony ("as if he cared") is counted as a simile cue — that is why these are candidates.

## 7. Delivery and readability

| output | value | source / norm |
|---|---|---|
| `words` · `sentences` · `clauses` · `syllables` · `questions` | counts (words without fillers) | — |
| `duration` | from the timings (last end − first start), else `dur` | — |
| `wpm` | words / minutes | Tauroza & Allison 1990: radio ~160, lectures ~140, conversation ~210 wpm; Yuan, Liberman & Cieri 2006 ~173 |
| `articulation` | words / minutes of speech without pauses | needs timings (`no_timing`) |
| `pauses` · `pauseRate` · `meanPause` · `longestPause` | gaps ≥ `delivery.pause` (default 0.25 s) between a word's end and the next start; per minute; mean; longest | Goldman-Eisler 1968 (250 ms); Campione & Véronis 2002 (brief < 0.2, long > 1 s) |
| `fillers` · `fillerRate` | filler tokens; per 100 words | built in: en um uh er erm uhm hmm mm · el εε εεε μμ μμμ ε · de äh ähm öh öhm hm · fr euh heu hum · ru э ээ эээ эм мм хм · es eh em este · it ehm eh mmm; the author adds words or phrases ("like", "you know", "ну", "ben"); Bortfeld et al. 2001: ~6 disfluencies per 100 words |
| `meanSentence` · `sdSentence` · `cvSentence` | words per sentence: mean, sample sd, sd/mean | — |
| `npvi` | 100 · mean of \|a − b\| / ((a + b)/2) over successive sentence lengths | Grabe & Low 2002 (a variety index here, not a phonetic rhythm class) |
| series `sentenceLengths`, `sentenceAxis`, `rateCurve` + `timeAxis` (words in the last `window` s, ≤ 200 points), `pauseLengths` | | |
| scene `timing` | the words as bars on a time axis (fillers `warn`), pauses `muted` | |

**Readability** (`readability`, `formula!`; ASL words per sentence, ASW syllables per word; syllables by vowel groups of the alphabet:
English with silent e, -es, -ed, -le rules and exceptions; French mute final e; Spanish hiatus with í ú; Russian one per vowel letter;
Greek one per vowel except the digraphs αι ει οι υι ου αυ ευ ηυ, split by a diaeresis or an accent on the first vowel; with
`model.synizesis: true` an unaccented ι, υ, ει or οι before a vowel is a glide and makes no syllable — παιδιά 2, ποιος 1, ήλιος 2,
αλήθεια 3, νοιάζομαι 3, while Μαρία, προϊόν keep 3 (Holton, Mackridge & Philippaki-Warburton 1997 §1.4.2; Triantafyllidis § 20); learned
words that keep the hiatus in careful speech (διάλογος) are then counted one short. Off by default, so earlier outputs are unchanged. A formula on another language gives its value with `formula_lang`; a Flesch-type value outside 0–100 or a
Wiener Sachtextformel outside 4–15 is returned as computed with `off_scale`; a text without sentence punctuation counts as one sentence
(`no_sentences`).

| `formula` | language | expression | source |
|---|---|---|---|
| `flesch` | en | 206.835 − 1.015 ASL − 84.6 ASW | Flesch 1948 |
| `fk` | en | 0.39 ASL + 11.8 ASW − 15.59 | Kincaid, Fishburne, Rogers & Chissom 1975 |
| `fog` | en | 0.4 (ASL + 100 · words ≥ 3 syllables / words) | Gunning 1952 |
| `amstad` | de | 180 − ASL − 58.5 ASW | Amstad 1978 |
| `wstf` | de | 0.1935 MS + 0.1672 ASL + 0.1297 IW − 0.0327 ES − 0.875 (MS % ≥ 3 syllables, IW % > 6 letters, ES % 1 syllable) | Bamberger & Vanecek 1984 (1st Wiener Sachtextformel) |
| `kandel` | fr | 207 − 1.015 ASL − 73.6 ASW | Kandel & Moles 1958 |
| `oborneva` | ru | 206.835 − 1.3 ASL − 60.1 ASW | Oborneva 2006 |
| `lix` | any | ASL + 100 · words > 6 letters / words | Björnsson 1968 |
| `rix` | any | words > 6 letters / sentences | Anderson 1983 |

Greek has no validated Flesch adaptation: use `lix` / `rix`. `text@1` has more readability formulas (Coleman–Liau, ARI, SMOG, the
Spanish ones) and finer English syllables; rhetoric@1 keeps its own small counter so its Worker does not carry a second engine.

**Audience fit** (`model.audience`): `gradeGap` = readability(`formula`, default `fk`) − `grade`; `rateGap` = how far `wpm` is outside
[`wpmLo`, `wpmHi`] (default 140–170; 0 inside); `fit` = 1 when |gradeGap| ≤ `tol` (default 1) and rateGap = 0 (without `grade`: the
rate alone).

## 8. Orders and persuasion models

- **Orders** (`outline`): `monroe` attention · need · satisfaction · visualization · action (Monroe 1935); `oration` exordium · narratio ·
  partitio · confirmatio · refutatio · peroratio (Cicero, *De Inv.* I.19; *Ad Herennium* I.4); `canons` inventio · dispositio · elocutio
  · memoria · actio (*Ad Herennium* I.3); `stasis` conjecture · definition · quality · translation. `orderOk` 1 when the parts sorted
  by `pos` are in the canonical order with no two in the same place (`tie`); `kendall` τ-a between the positions and the canonical ranks
  (Kendall 1938; ties count neither); `misplaced` the parts whose place differs from the canonical one.
- **Stasis** (`stasis`): the first question not agreed (1 conjecture, 2 definition, 3 quality, 4 translation; 0 none disputed) —
  Hermagoras via Cicero (*De Inv.* I.10) and Quintilian (III.6).
- **Elaboration Likelihood** (Petty & Cacioppo 1986), a *teaching form* made numeric for exploration, not a fitted model: E =
  motivation × ability (each 0–1, clamped with `range`); `central` = E · quality, `peripheral` = (1 − E) · cue (quality and cue −1…1),
  `attitude` their sum, `route` 1 when E ≥ 0.5; series over motivation 0…1 (`elmAxis`, `elmCentral`, `elmPeripheral`, `elmTotal`, 51
  points).
- **Inoculation** (McGuire 1961; Banas & Rains 2010 meta-analysis, d ≈ 0.43, weaker after about two weeks), also a teaching form:
  resistance r(t) = r0 · e^(−(t − last booster)/τ) (defaults r0 0.5, τ 14 days), 0 before t = 0; `attitudeAfter` = attack × (1 − r);
  series `inocT`, `inocR` (200 points over `horizon`, default 60 days).

## 9. Limits

≤ 40 speeches, ≤ 20 000 characters each and 40 000 in all, ≤ 8000 timing pairs; ≤ 8 teams, ≤ 60 ballots, ≤ 30 POIs a speech; ≤ 120
nodes and ≤ 400 edges (logic@1 bounds its labelling search; `large_map` beyond 24 nodes, logic@1's `budget` passed through); ≤ 20 forms
of ≤ 8 premises and ≤ 12 atoms; ≤ 2000 values per series, ≤ 40 lines in the figures scene, ≤ 1500 words in the timing scene; the
antimetabole window ≤ 60 words, ≤ 20 repeated words. Measured in node: a typical run of the reference activity < 1 ms; the heaviest
test (20 000 characters with every figure, readability and timings, a 24-argument framework with preferred extensions, the map scene)
~180 ms.

## 10. Runtime codes

| code | meaning |
|---|---|
| `empty` · `no_sentences` · `few_sentences` · `no_sentence` | no tokens · no sentence punctuation · sd / CV / nPVI of < 2 sentences · figureAt of a sentence that does not exist |
| `no_speech` · `no_duration` · `no_timing` · `timing_mismatch` · `timing_order` | no speech · no duration known · an output that needs timings · timings ≠ tokens · overlapping timings |
| `formula_lang` · `off_scale` | a readability formula for another language · a value outside the formula's scale |
| `overtime` · `poi_protected` · `poi_not_allowed` · `poi_own_side` · `reply_speaker` · `side_mismatch` · `no_slot` | §2 |
| `ranks` · `tie` · `score_range` · `low_point_win` · `cycle` · `split` · `no_ballots` | §2.1 |
| `vote_sum` · `no_vote` | Oxford votes |
| `no_extension` · `large_map` · `budget` · `presumption` · `no_impacts` · `weigh_value` · `range` | §3, §8 |
| `no_scheme` · `no_steps` | §4 |
| `parse` (+ logic@1's own parse code) · `too_many_atoms` · `valid` · `no_atom` | §5 |
| `no_position` · `tie` | an outline position that is not a number · two parts in one place |
| `candidate` | a trope count above 0: candidates by cues, not judgements (§6.3) |
| `postulate` · `not-transposed` · `axioms-inconsistent` · `not-well-formed` | ASPIC+ (§3.1, from logic@1) |
| `output` · `error` | an output the engine does not know · an internal failure (NaN) |

## 11. Reference values asserted by `tests/lib_rhetoric.js`

| what | value | source |
|---|---|---|
| "The cat sat on the mat." | Flesch 116.145 (`off_scale`), FK −1.45, Fog 2.4, LIX 6 | the formulas (Flesch 1948; Kincaid 1975; Gunning 1952; Björnsson 1968) |
| German, French, Russian words | Amstad, WSTF, Kandel–Moles, Oborneva from their coefficients; syllables Bundesverfassungsgericht 7, сражаться 3, προϊόν 3, ρολόι 3 | Amstad 1978; Bamberger & Vanecek 1984; Kandel & Moles 1958; Oborneva 2006 |
| Churchill, 4 June 1940 | one anaphora over five clauses | — |
| Lincoln, Gettysburg | epistrophe "people", tricolon | — |
| Kennedy 1961 | antimetabole country … you — you … country | — |
| Caesar "Veni, vidi, vici" | tricolon, asyndeton, alliteration | — |
| Dickens 1859 | anaphora + epistrophe = symploce, isocolon | — |
| Molière, *L'Avare* III.1 | antimetabole manger … vivre … vivre … manger | — |
| Mark 2:27 (de, ru) | antimetabole over inflected forms, antithesis nicht … sondern / не … а, polyptoton | — |
| Kazantzakis' epitaph | epistrophe τίποτα | — |
| 150 words in 60 s | 150 wpm | — |
| nPVI [2, 4] | 66.67 | Grabe & Low 2002 |
| BP formats | 8 × 7 min, protected 60 s; WSDC 8 / 4, Opposition replies first; LD 6-3-7-3-4-6-3, prep 4; policy 8/3/5; Popper 6/3/5 | WUDC manual; WSDC; NSDA; IDEA |
| a three-judge BP panel | CG 1 (3 pts), OG 2, OO 3, CO 4; a 2–1 cycle broken by the chair | WUDC 3-2-1-0 |
| WSDC ballots | Proposition 3 ballots of 4 valid; a draw is no ballot; 85 / 45 out of range; reply by the third speaker | WSDC rules |
| LD | a low-point win allowed and flagged | NSDA |
| Oxford 30/45/25 → 46/50/4 | For +16, Against +5: For wins | IQ2US rule |
| c → b → a; a ↔ b; a → a | reinstatement (a in); Nixon diamond (undecided, 2 preferred, 2 stable); no stable extension | Dung 1995 |
| Toulmin's Harry | 6 parts, the exception is not a defeat | Toulmin 1958 |
| schemes | expert opinion 6 CQs; five 0.8 slope steps 0.33 | Walton et al. 2008; Hahn & Oaksford 2007 |
| forms | MP, MT, DS valid; AC, DA named; Barbara, Celarent valid; Darapti existential fallacy (valid with import); AAA-2 undistributed middle; AEE-1 illicit major; AAA-3 illicit minor; EEE-1 exclusive premises; EAA-1 negative mismatch | Copi & Cohen; logic@1 |
| Monroe reversed / one swap | τ = −1 / 0.8 | Kendall 1938 |
| ELM 0.9, 0.9, 0.8, −0.5 | E 0.81, attitude 0.5530 | the teaching form |
| inoculation r0 0.6, τ 14 | r(14) = 0.6/e; a booster at day 20 restores 0.6 | the teaching form |
| phonetic keys | light / night rhyme, knight = night; παιδιά peDja, αύριο avrjo, ευχή efxi; chanson SAsO; хлеб xlep; Tag tak | Carney 1994; Holton et al. 1997; Tranel 1987; Timberlake 2004; Wiese 1996 |
| sound figures | Twinkle … star / are: rhyme; the rain in Spain …: assonance; traduttore, traditore: paronomasia; take, bike, cake, lake: consonance | Taylor 1806; Lerner & Loewe 1956 |
| trope candidates | "My love is like a red, red rose" simile (not "I like tea"); "Life is the art of …", "so to speak" metaphor cues; scare quotes, "oh great", ?! irony cues; σαν / δήθεν; wie / sogenannte | Burns 1794; Goatly 1997; Attardo 2000 |
| Greek synizesis | παιδιά 2, ποιος 1, ήλιος 2, αλήθεια 3; Μαρία, προϊόν 3; off: παιδιά 3 | Holton et al. 1997 §1.4.2 |
| bipolar map a ⇒ b → c | one supported attack a → c; c out | Cayrol & Lagasquie-Schiex 2005 |
| ASPIC+ snores / professor | 5 arguments, 1 defeat; last-link justifies accessDenied, weakest-link not; postulates hold | Modgil & Prakken 2014 Ex. 3.23 |

Also asserted: every runtime code of §10 that a model can reach, the checker codes, the golden outputs of the former Python twin on the 27 fixture specs,
the adapter, the Worker source (with logic@1) giving identical outputs in a fresh `vm` context, a typical run < 50 ms and the heaviest
< 2 s.

## 12. Not covered (and why)

Free-text argument mining and fallacy detection (needs language models; the engine works on the map the author gives); tropes are
**candidates by explicit cues** only (§6.3) — a metaphor or an irony without a cue, and hyperbole, need meaning; sound figures use
phonetic keys from spelling (§6.2), not a pronouncing dictionary, so stress-based rhyme and English spelling exceptions beyond the
rules are approximate; prosody from audio (pitch, loudness: the engine reads a transcript and its timings, not sound); weighted
argumentation frameworks; judge adaptation paradigms beyond net benefits and stock issues (kritiks, theory); prep-time accounting;
stress-based syllables; validated readability for Greek (none exists to our knowledge); the ELM and inoculation forms are qualitative
models made numeric, not predictions.
