# `genetics@1` — heredity and population genetics (`src/engines/genetics/genetics.ts`, `NoemaLibGenetics`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for genetics, from Mendel's crosses to population and quantitative
genetics. There is one engine with 9 **modes** (`model.mode`): `cross`, `pedigree`, `hw`, `selection`, `drift`, `map`, `coalescent`,
`ld`, `quant`. The tests are `node tests/lib_genetics.js`
(93 assertions) and `node tests/enginelib.js` (the golden outputs of the former Python twin on `tests/fixtures/enginelib/genetics.json`, 29 specs). The
reference activity is `tools/activities_examples/wf-drift` (Wright–Fisher drift: 200 seeded populations, N, p₀ and s as
sliders, fixation against Kimura's u, heterozygosity against its decay). The research behind this chapter is in the project's
`engine-library/research/life.md` (§ genetics).

Pure JS, no dependency. The numerical pieces are written here and tested: log-factorial (table to 1023, then Lanczos), the
regularized upper incomplete gamma (series / continued fraction, Numerical Recipes) for χ² p-values, erfc, Acklam's inverse normal
(refined by one Halley step), a binomial sampler (inversion for n·min(p, 1−p) < 10, otherwise BTRS, Hörmann 1993), a Poisson
sampler (inversion in chunks), all seeded from the core's `mulberry32(hash32(name, seed))`.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "genetics@1",
  "params": [ { "id": "k", "kind": "slider", "label": "kLabel", "min": 0, "max": 0.5, "step": 0.01, "default": 0.2 } ],
  "model": { "mode": "cross",
    "loci": [ { "id": "A", "alleles": ["A", "a"] }, { "id": "B", "alleles": ["B", "b"] } ],
    "p1": { "A": ["A", "a"], "B": ["B", "b"] }, "p2": { "A": ["a", "a"], "B": ["b", "b"] },
    "linkage": [ { "a": "A", "b": "B", "r": "k" } ],
    "observed": [ 412, 396, 94, 98 ] },
  "outputs": [ { "id": "rec", "kind": "scalar", "of": "frac", "arg": "A/a b/b" },
               { "id": "chi", "kind": "scalar", "of": "chi2" }, { "id": "p", "kind": "scalar", "of": "pValue" },
               { "id": "fr", "kind": "series", "of": "classFracs" }, { "id": "ix", "kind": "series", "of": "classIndex" },
               { "id": "sq", "kind": "scene", "of": "punnett" } ],
  "plots": [ { "kind": "series", "title": "classesTitle", "x": { "series": "ix", "label": "classAxis" },
               "y": { "min": 0, "label": "fracAxis" }, "series": [ { "y": "fr", "label": "fracLine" } ] },
             { "kind": "scene", "of": "sq", "title": "punnettTitle", "height": 320 } ] }
```

- Every number of the model is a **numx**: a number, or an expression over the spec's names (consts, params, derived), compiled once
  with NoemaExpr. `exprs(spec)` lists them as `[source, path, []]` (the engine has no local names). `keys(spec)` lists
  `model.classLabels` (i18n keys of the cross's class names, used on the Punnett square); everything else is labelled with the
  model's own short texts (allele names, person ids) as `s`, or with numbers.
- **Outputs**: `{id, kind, of, arg?}`. `of` must be something the mode computes (§3–§11) and `kind` its kind; otherwise the error is
  `output`. Some outputs take an `arg` (a genotype pattern, a class number, a person id, an allele pair); a missing or malformed
  `arg` is an `output` error too.
- **Runtime codes** (`run(spec, env, {seed})` returns `{out, codes}`): a value outside the method's range is never a silent wrong
  number. What cannot be computed is NaN (an empty series, an empty scene), the code says why, and the scalar `valid` is 0. A run
  never throws; an internal failure gives the code `error`.
- **Limits** (the shared budget is 200 000 elementary steps): ≤ 6 loci of ≤ 6 alleles; ≤ 24 people and ≤ 200 000 genotype
  combinations in a pedigree; drift replicates × generations (× N for Moran) ≤ 200 000; ≤ 50 genes in the coalescent and replicates
  × n ≤ 200 000; the polygenic simulation N·L·generations ≤ 200 000; every series ≤ 2000 values; every scene ≤ 2000 items.

### 1.1 Checker codes (`checkSpec`)

| code | when |
|---|---|
| `format` | `model` is not an object; a shape is not an object or an array |
| `value` | a missing required field, a value of the wrong kind; the cross-checks below |
| `enum` | `mode`, `dominance`, `chrom`, `inheritance`, `sex`, `process`, `epistasis.type` |
| `size` | a list too long or too short; a pedigree of more than 200 000 genotype combinations |
| `ref` | a parent genotype, codominant pair, lethal genotype, linkage, epistasis or pedigree parent naming something that does not exist |
| `unknown-field` (warning) | a field the mode does not know |
| `output` | an `of` the mode does not compute, a kind it does not give, a missing or malformed `arg` |

Cross-checks. **cross**: locus ids and the alleles of a locus are unique, and allele names contain no `_`. Each parent gives every
locus 2 alleles, or 1 where it is hemizygous (in XY the father `p2` on an X locus, in ZW the mother `p1` on a Z locus). X and Z loci
are not mixed. Linkage joins loci of the same kind of chromosome into chains (no locus with three neighbours, no loop). Epistasis
needs two different autosomal loci with 2 alleles and complete dominance, and `classes` when `type` is `custom`. A one-allele
lethal genotype only on an X or Z locus. **pedigree**: unique ids, both parents or none, mother `f`, father `m`, nobody their own
parent or ancestor, sex `u` not allowed for X- or Y-linked inheritance. **hw**: `counts` only for an autosomal locus with 2 alleles.
**map**: three unique loci, no class twice. **ld**: either the four haplotype frequencies or `pA`, `pB` and `D`.

## 2. Conventions

- **p1 is the mother, p2 the father** (it matters only for X/Z linkage). In XY the father is hemizygous on X; in ZW the mother is
  hemizygous on Z. Sons and daughters are counted separately (`f:` / `m:` patterns).
- **Phase** comes from the order of the alleles: `p1: {A: ["A","a"], B: ["B","b"]}` is the coupling haplotypes AB / ab;
  `{A: ["A","a"], B: ["b","B"]}` is repulsion Ab / aB.
- **Dominance**: `complete` (default) — the alleles dominate in their listed order (A > a; IA > i); `incomplete` — every genotype its
  own phenotype; `codominant` pairs (`[["IA","IB"]]`) show both alleles, each still dominant over the rest (ABO).
- **Genotype patterns** (`arg` of `frac`): one token per locus, separated by spaces, optionally prefixed `f:` or `m:`. `_` any;
  `A_` carries A; `A/a` exactly A and a (unordered); `A/` hemizygous A. `"A_ b/b"` is P(A_bb).
- **Class order** of a cross: the epistasis class (when there is epistasis), then the most frequent first, then the label.
  `ratios` is the smallest whole-number ratio (≤ 4096 parts each, otherwise NaN): `9:3:4`, `2:1`; incomplete dominance lists
  1 RR : 2 Rr : 1 rr by size as `2:1:1`, and a custom 10:6 reads `5:3`.

## 3. `cross` — Mendelian crosses

| field | type | meaning |
|---|---|---|
| `loci` | list 1–6, required | `{id, alleles (1–6), dominance?, codominant?, chrom?: auto \| X \| Z, lethal?: [{genotype, viability?}]}` |
| `p1`, `p2` | map locus → alleles, required | the mother and the father |
| `linkage` | list ≤ 5 | `{a, b, r}`: recombination fraction 0–0.5 between adjacent loci of a chain |
| `coincidence` | numx (1) | coefficient of coincidence for a three-locus chain: P(DCO) = c·r₁·r₂ |
| `epistasis` | object | `{a, b, type, classes?}` (presets below) |
| `observed` | list ≤ 64 numx | observed counts in class order, for χ² |
| `classLabels` | list ≤ 16 keys | i18n keys naming the classes in class order (the Punnett square shows them) |

Epistasis presets: the phenotype class of A_B_, A_bb, aaB_, aabb (Bateson; Griffiths et al., *Introduction to Genetic Analysis*, ch. 6).

| type | classes | F2 | test cross |
|---|---|---|---|
| `none` | 0 1 2 3 | 9:3:3:1 | 1:1:1:1 |
| `recessive` (aa masks B) | 0 1 2 2 | 9:3:4 | 1:1:2 |
| `dominant` (A masks B) | 0 0 1 2 | 12:3:1 | 2:1:1 |
| `duplicateRecessive` (complementary) | 0 1 1 1 | 9:7 | 1:3 |
| `duplicateDominant` | 0 0 0 1 | 15:1 | 3:1 |
| `dominantSuppression` | 0 0 1 0 | 13:3 | 3:1 |
| `cumulative` | 0 1 1 2 | 9:6:1 | 1:2:1 |
| `custom` | `classes` (4 ints 0–3) | — | — |

Method: exact enumeration. Each parent's gametes are built per linkage chain (using the recombination fractions as given and the
coincidence for a triple), unlinked chains independently; zygotes are the product; lethal genotypes are removed by their
viability (default 0) and the rest renormalized. The χ² test is Pearson's, df = classes − 1, p from the regularized gamma.

| output | kind | meaning |
|---|---|---|
| `frac` (arg pattern) | scalar | the surviving fraction matching the pattern (in a sex, of that sex) |
| `classFrac`, `ratio` (arg int) | scalar | the fraction / ratio part of class i |
| `nClasses`, `nGenotypes`, `nGametes1`, `nGametes2`, `survival` | scalar | counts; survival = viable fraction |
| `chi2`, `df`, `pValue`, `minExpected` | scalar | the goodness-of-fit test against `observed` |
| `classIndex`, `classFracs`, `ratios`, `expected`, `observed` | series | per class |
| `punnett` | scene | the gametes of p1 down, of p2 across, each cell coloured by class; ≤ 8 × 8 gametes |
| `valid` | scalar | 0 when the χ² inputs are wrong |

Runtime codes: `r-range` (r outside 0–½), `coincidence-range` (c < 0, or a class probability negative), `all-lethal` (survival 0),
`observed-classes` (count list ≠ number of classes), `observed-range`, `expected-below-5` (Cochran's rule — computed, flagged),
`punnett-large` (more than 8 gametes a side: empty scene, everything else computed).

## 4. `pedigree` — Bayesian risks

| field | type | meaning |
|---|---|---|
| `inheritance` | `AD AR XD XR Y mt`, required | the mode of inheritance |
| `q` | numx (0.01) | the disease allele frequency (founders in Hardy–Weinberg) |
| `penetrance` | numx (1) | P(affected \| genotype at risk) |
| `phenocopy` | numx (0) | P(affected \| genotype not at risk) |
| `people` | list 1–24, required | `{id, sex: f \| m \| u, mother?, father?, affected?}`; `affected` absent = unknown |
| `showRisk` | bool | write the carrier probability under each symbol |

Method: exact enumeration of every joint genotype (0–2 disease alleles; 0–1 in hemizygous males and for mt), founders from HW,
children by Mendelian, X, Y or maternal transmission; the likelihood is the sum (Elston & Stewart 1971 in spirit, without peeling,
hence the 200 000 bound). `carrier(id)` = P(≥ 1 disease allele | all phenotypes); `het(id)` = P(exactly 1); `affectedProb(id)` =
P(affected | everyone else's phenotypes) — the person's own phenotype is left out, so it answers "what is the risk for this child".

Outputs: `carrier`, `het`, `affectedProb` (arg person id); `likelihood`, `logL10`, `consistent` (1 when L > 0), `combos`, `valid`;
`pedigree` (scene: squares, circles and diamonds by generation, filled when affected, dashed when unknown, mating and sibship
lines, the id above, the carrier probability when `showRisk`; Bennett et al. 2008). Codes: `prob-range`, `budget`, `inconsistent` (L = 0: e.g. an affected child of unaffected
parents under full-penetrance AD with q = 0 — the probabilities are NaN).

## 5. `hw` — Hardy–Weinberg

| field | type | meaning |
|---|---|---|
| `freqs` | 2–8 numx, required | allele frequencies (sum 1 ± 10⁻⁶) |
| `F` | numx (0) | inbreeding coefficient: P(ii) = pᵢ² + F·pᵢ(1−pᵢ), P(ij) = 2pᵢpⱼ(1−F) (Wright 1922) |
| `chrom` | `auto \| X` | X: males pᵢ, females as autosomal |
| `counts` | 3 numx | observed AA, Aa, aa (2 alleles, autosomal) for the tests |

Outputs: `geno` (arg `"i/j"`, 0-based allele indices), `het`, `homo`, `male` and `xRatio` (arg allele index; X only: male frequency
and male : female ratio = 1/q for a recessive); from counts `n`, `pHat`, `Fhat` = 1 − Hobs/Hexp, `expAA`, `expAa`, `expaa`,
`chi2`, `df` (1), `pChi2`, `pExact` (Wigginton, Cutler & Abecasis 2005: the two-sided exact test by their recurrence);
`pGrid`, `fAA`, `fAa`, `faa` (series over p, the classic HW curves at the given F); `deFinetti` (scene: the triangle, the HW
parabola, the population's point). Codes: `freq-sum`, `F-range` (|F| > 1, or a negative genotype frequency), `counts-range`
(negative or non-integer), `monomorphic` (χ² NaN, exact p = 1), `expected-below-5`.

## 6. `selection` — deterministic one-locus dynamics

Fields (all numx): `p0` (required, frequency of A), `w11`, `w12`, `w22` (fitnesses of AA, Aa, aa; 1), `mu` (A → a), `nu` (a → A),
`m` and `pm` (one-way migration rate and the migrants' frequency), `drive` (P(Aa transmits A), ½), `gens` (100, ≤ 200 000).
One generation: selection with drive → mutation → migration. Outputs: `pFinal`, `qFinal`, `wbarFinal`, `gens`, `deltaP0`, `pEq`
(the interior equilibrium of selection alone, (w22 − w12)/(w11 − 2w12 + w22), NaN when none), `eqStable` (1 when the heterozygote
is fittest), `valid`; series `t`, `p`, `q`, `wbar`, `fAA`, `fAa`, `faa` and over a grid `pGrid`, `deltaPGrid`, `wbarGrid`
(Δp and w̄ as functions of p). Codes: `prob-range`, `fitness-range`, `budget`, `extinct` (w̄ = 0).

## 7. `drift` — Wright–Fisher and Moran

Fields: `process` (`wf` diploid 2N copies, default; `moran` haploid N), `N` (required, 1–10⁶), `p0` (required; rounded to whole
copies, code `p0-rounded`), `s` (AA 1 + s, Aa 1 + h·s; Moran: fitness 1 + s), `h` (½), `mu`, `nu`, `reps` (20), `gens` (100).
WF: selection and mutation, then Binomial(2N, p′). Moran: N birth–death steps per generation. Seeded: the same seed gives the
same replicates.

| output | meaning |
|---|---|
| `fixed`, `lost`, `segregating`, `meanP`, `meanH`, `meanTfix` | over the replicates, at the last generation |
| `hTheory`, `hTheoryS` | E[2pq] = H₀(1 − 1/2N)ᵗ (WF); H₀(1 − 2/N²)^(Nt) (Moran) |
| `uTheory` | WF: Kimura (1962) u(p) = ∫₀ᵖG/∫₀¹G, G = exp(−4Nshx − 2Ns(1−2h)x²) (closed form at h = ½, Simpson otherwise); Moran: ρ = (1 − r⁻ⁱ)/(1 − r⁻ᴺ), r = 1 + s |
| `uNeutral` | p₀ (after rounding) |
| `tFix`, `tLoss`, `tAbs` | Kimura & Ohta (1969) neutral conditional mean times, 4N generations scale (Moran: N) |
| `t`, `meanPs`, `meanHs`, `rep` (arg i < 20), `histX`, `hist` | series: means, one replicate's path, the final-frequency histogram (21 bins) |

Codes: `N-range`, `prob-range`, `fitness-range` (s ≤ −1), `budget`, `p0-rounded`.

## 8. `map` — map functions and three-point crosses

Fields: `r` (0–½), `d` (cM), `threePoint` `{loci: [3 ids], classes: [{alleles: [0/1 × 3], n}]}` — the test-cross progeny classes
(0 = the first parent's allele). Outputs: `haldane`, `kosambi` (cM from r: −50 ln(1 − 2r), 25 ln((1 + 2r)/(1 − 2r)); Haldane
1919, Kosambi 1944; r = ½ → ∞), `rHaldane`, `rKosambi` (r from d); `mapR`, `mapMorgan`, `mapHaldane`, `mapKosambi` (series of
the three map functions). From a three-point cross: `middle` (index of the middle locus, from the rarest pair = double crossovers),
`d12`, `d23` (cM, counting double crossovers in both), `dSum`, `dOuter` (the outer pair alone, missing the DCOs), `coincidence`
(observed / expected DCO), `interference` (1 − c), `nTotal`, `geneMap` (scene). Codes: `r-range`, `d-range`, `counts-range`,
`ambiguous-parentals` (the two largest pairs tie), `ambiguous-order` (the two smallest tie).

## 9. `coalescent` — Kingman's coalescent

Fields: `n` (required, 2–50), `Ne` (required), `mu` (per locus per generation, infinite sites, θ = 4Neμ ≤ 1000), `reps` (1).
With k lineages the waiting time is exponential with rate C(k,2) in units of 2Ne generations; mutations are Poisson on each branch. Outputs of the first tree:
`tmrca`, `totalLength`, `S`, `pi`, `thetaW` = S/aₙ (Watterson 1975), `tajimaD` (Tajima 1989; NaN when S = 0), `tree` (scene);
expectations `eTmrca` = 4Ne(1 − 1/n), `eTotal` = 4Ne·aₙ, `eS` = θaₙ, `aN`; means over replicates `meanTmrca`, `meanTotal`,
`meanS`, `meanD`; series `sfsI`, `sfs` (mean unfolded site frequency spectrum), `sfsTheory` (θ/i, Fu 1995). Codes: `n-range`,
`param-range`, `budget`.

## 10. `ld` — linkage disequilibrium

Fields: either `pAB`, `pAb`, `paB`, `pab` or `pA`, `pB`, `D`; `c` (required, recombination fraction), `gens` (10), `Ne`.
Outputs: `D`, `Dmax`, `Dprime` = D/Dmax (Lewontin 1964), `r2` = D²/(pA qA pB qB) (Hill & Robertson 1968), `pA`, `pB`, `halfLife`
= ln ½ / ln(1 − c), `Dfinal`, series `t`, `Dt` = D(1 − c)ᵗ, `r2t`; with `Ne`: `r2Sved` = 1/(1 + 4Ne·c) (Sved 1971), `sigma2` =
(10 + ρ)/((2 + ρ)(11 + ρ)), ρ = 4Ne·c (Ohta & Kimura 1969). Codes: `freq-sum`, `D-range` (|D| > Dmax), `r-range`, `budget`,
`monomorphic`.

## 11. `quant` — quantitative genetics

Fields (all numx, each group optional): breeder's equation `h2`, `sigmaP`, `S` or `sel` (the selected fraction, truncation),
`gens` (10), `mean0`; one locus `a`, `d`, `p`; liability `K` (population prevalence), `Kr` (in relatives), `rel` (relationship,
½ = first degree); simulation `sim: {N 4–2000, L 1–200, gens, sel, h2}`.

| output | meaning |
|---|---|
| `R`, `Sel`, `i`, `meanFinal`; `t`, `mean` | R = h²S (Lush 1937); S = i·σP with i = φ(x)/sel (truncation) |
| `M`, `alpha`, `VA`, `VD`, `VG`, `bvAA`, `bvAa`, `bvaa` | Falconer & Mackay (1996) ch. 7–8: M = a(p − q) + 2dpq, α = a + d(q − p), VA = 2pqα², VD = (2pqd)² |
| `xg`, `xr`, `h2Liab` | Falconer (1965): h² = (x_g − x_r)/(φ(x_g)/K)/rel |
| `simMean`, `simVA`, `simH2`, `simP`; `simT`, `simMeans`, `simVAs`, `simPs` | seeded: N diploids, L additive loci (±½), truncation selection, free recombination; VE set from h² at p = ½ |

Codes: `h2-range`, `prob-range`, `Kr-not-above-K` (no familial excess: h² ≤ 0, computed, not invalid), `sim-range`, `budget`.

## 12. Validity, limits and what is left out

- Crosses assume diploid Mendelian segregation; no polyploidy (tetraploid 35:1 is not modelled), no maternal effect, no
  imprinting, no gene conversion. Linkage is given by r; map distances are converted only in `map`. Coincidence applies to a
  three-locus chain; longer chains multiply adjacent intervals (no interference beyond the triple).
- Pedigrees are single-locus, biallelic, without loops beyond what exact enumeration handles (loops are fine, only the size is
  bounded); no linkage analysis (LOD), no de novo mutation rate.
- Drift uses discrete generations (WF) or N steps per generation (Moran); no population structure (F_ST, Ne from census numbers are
  formulas in the reference values of the research notes, not outputs). Perkins' tetrad analysis is not implemented.
- The coalescent is neutral, panmictic, constant size, without recombination.

## 13. Reference values (asserted in `tests/lib_genetics.js`)

| # | case | value | source |
|---|---|---|---|
| G1 | AaBbCc × AaBbCc | 27:9:9:9:3:3:3:1, 27 genotypes, 8 gametes | product rule |
| G2 | epistasis presets | 9:3:4, 12:3:1, 9:7, 15:1, 13:3, 9:6:1 and test crosses | Griffiths et al. ch. 6 |
| G3 | 315:108:101:32 vs 9:3:3:1 | χ² 0.4700, p 0.925 | Mendel 1866 |
| G4 | 5474:1850 vs 3:1 | χ² 0.2629, p 0.608 | Mendel 1866 |
| G5 | Ay a × Ay a, Ay Ay lethal | 2:1, survival ¾ | Castle & Little 1910 |
| — | X⁺Xʷ × XʷY | ½ sons, ½ daughters white | Morgan 1910 |
| — | coupling AB/ab × ab/ab, r 0.2 | Aabb 0.1; repulsion 0.4 | definition |
| — | three loci, r 0.1, 0.2, c 0.5 | each DCO class 0.005 | definition |
| — | AR sib of an affected child | carrier 2/3 | Bayes |
| — | AD, penetrance 0.8, unaffected child | 1/6 | Bayes |
| G8 | ABO p 0.3, q 0.1, r 0.6 | A 0.45, B 0.13, AB 0.06, O 0.36 | Bernstein 1925 |
| — | 30:40:30 | χ² 4, F̂ 0.2, exact p 0.0469 = enumeration | Levene 1949; Wigginton 2005 |
| G10 | recessive lethal from q 0.5 | q₁₀ = 1/12; 98 generations to 0.01 | Haldane 1924 |
| G11 | fitnesses 0.9, 1, 0.2 | p̂ 8/9, stable | Fisher 1922 |
| — | mutation–selection, μ 10⁻⁵, s 0.1 | q̂ ≈ 0.0100 | Haldane 1927 |
| G12 | N 100, s 0.02, h ½, p 1/200 | u 0.020171 | Kimura 1962 |
| G13 | Moran N 10, r 1.1, one mutant | ρ 0.147950 | Moran 1958 |
| G14 | N 50, t 100 | H_t/H₀ 0.366032 | Wright 1931 |
| — | neutral new mutant | t_fix ≈ 4N | Kimura & Ohta 1969 |
| G6 | r 0.2 | Haldane 25.541 cM, Kosambi 21.182 cM | Haldane 1919; Kosambi 1944 |
| G7 | 710 / 90 + 190 / 10 of 1000 | 10 and 20 cM, c = I = 0.5 | Sturtevant 1913 |
| G17 | n 10, Ne 1000 | E[T_MRCA] 3600, a₁₀ 2.828968 | Kingman 1982 |
| G18 | D₀, c ½, t 5 | D₀/32; D′ = r² = 1 | definition |
| — | haplotypes .4/.1/.1/.4 | D 0.15, D′ 0.6, r² 0.36 | Lewontin 1964 |
| G19 | h² 0.4, σP 5, top 10 % | i 1.7550, R 3.510 | Falconer & Mackay table A |
| — | a 1, d ½, p 0.3 | M −0.19, α 1.2, VA 0.6048, VD 0.0441 | Falconer & Mackay ch. 7–8 |

Statistical checks (seeded, ±3 SE): the binomial sampler against the exact pmf (χ² fit), WF mean H and mean p, the neutral fixation
probability p₀, the coalescent's mean T_MRCA and S. Speed: a dihybrid cross runs in about 1 ms; the worst allowed runs (200 000 WF
generations, a pedigree of 3¹¹ genotypes, a six-locus cross) together in about 0.25 s.

## Uses the kernel

Since 2026-11-07 the seeded modes draw from kernel streams (`SK.stream`: `genetics-drift`, `genetics-coalescent`, `genetics-quant`): Wright–Fisher binomial sampling, Poisson mutations and exponential coalescence times by the kernel's inversion variates (one uniform each: common random numbers work), the quantitative normals by AS241; the drift stepper keeps its stream's six numbers in its state (`r.state()`, so a snapshot is a copy). Since the second round the χ² tail is `SK.chi2Sf` (the kernel's upper tail from Q, no cancellation) and Φ⁻¹ is `SK.normInv` (AS 241, instead of Acklam + one Halley step); the own lgamma, Q and erfc remain only as the marked FALLBACK. Snapshot re-recorded (other seeded numbers, the same laws; the selection threshold moved by ≤ 1e-15 relative; `tests/lib_genetics.js` passes).
