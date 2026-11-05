# `prob@1` — probability and statistics (`engine/src/47_lib_prob.js`, `NoemaLibProb`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for probability and statistics. It runs from the basics (a
distribution's pmf, a die, a coin) through the classic tests and intervals to the things a modern course has: exact coverage of
binomial intervals, power by the noncentral t, conjugate Bayes with HPD intervals, false discovery rates, Markov chains, branching
processes, queues and the bootstrap with BCa. There is one engine with 14 **modes** (`model.mode`). They share a checker, the
distribution library (25 families), the special functions and a seeded random stream. The Python twin is `tools/lib_prob.py`. It
checks and does not compute, and it embeds **the same JSON** (`DATA`: the families, every mode's schema, its outputs and the name
lists; the test checks that the two copies are identical). The tests are `node tests/lib_prob.js` (141 assertions) and `node
tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/prob.json`, 40 specs). The reference activity is
`tools/activities_examples/ci-coverage` (the coverage of Wald and Wilson intervals). The plan and the reference values P1–P29 are in
the project's `engine-library/research/math.md` §2.

The engine is pure and deterministic. Every elementary function comes from NoemaExpr's fdlibm ports (`exp`, `log`, `pow`, `sin`,
`cos`, `tan`, `atan`, …), so a result is the same bit for bit in every browser and in the Worker. `Math` is used only for the
correctly rounded operations (`sqrt`, `floor`, `abs`). The random numbers are `mulberry32`, seeded by `hash32('prob:<mode>', seed)`.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "prob@1",
  "params": [ { "id": "n", "kind": "slider", "label": "sampleSize", "min": 5, "max": 200, "step": 1, "default": 30 },
              { "id": "p", "kind": "slider", "label": "trueP", "min": 0.01, "max": 0.99, "step": 0.01, "default": 0.1 } ],
  "model": { "mode": "ci", "kind": "prop", "k": "round(p * n)", "n": "n", "p": "p", "conf": 0.95, "method": "wilson" },
  "outputs": [ { "id": "waldAt", "kind": "scalar", "of": "coverAt.wald" }, { "id": "wilsonAt", "kind": "scalar", "of": "coverAt.wilson" },
               { "id": "ps", "kind": "series", "of": "covP" }, { "id": "waldCover", "kind": "series", "of": "cover.wald" },
               { "id": "bad", "kind": "scalar", "of": "issue.param" } ],
  "plots": [ { "kind": "series", "x": { "series": "ps" }, "series": [ { "y": "waldCover" } ],
               "marks": [ { "axis": "y", "expr": "0.95" } ] } ] }
```

- Every number of the model may be a **numx**: a number, or an expression over the spec's names (consts, params, derived),
  compiled once with NoemaExpr. `exprs(spec)` lists them with their paths, so the validators check each name. The one local name
  is in `mc`: its `expr` sees the names of its `draws` (`["X + Y > 7", "model.expr", ["X", "Y"]]`).
- `keys(spec)` gives the Markov chain's `labels` (`[label, "model.labels[i]"]`): the state names shown in its diagram, which the
  string tables translate. The state ids themselves are names (`id`), not text.
- **Outputs**: `{id, kind: scalar | series | scene, of}`. `of` must be something the mode computes (§3–§16). Otherwise the error is
  `output`, `outputs[i].of: <mode> computes no <kind> "<of>"`. Some names carry a suffix: `lo.wilson`, `cover.wald`,
  `pi.<state>`, `rate1.<i>` (strata counted from 0), `adj.<i>` (one per p value). The checker knows the lists, so `pi.C` of a
  chain without a state `C` is an error. Every mode counts its **runtime issues** as scalars `issue.<code>`.
- **Laziness.** A run computes only what the outputs ask for. An issue is counted by the computation that meets it, so
  `issue.moment-infinite` counts only if a moment is asked. `run` fills the other outputs first and the issue counts last.
- **Runtime issues** are never a silent wrong number. A value outside the method's validity is computed if it can be and the issue
  is counted. A value that cannot be computed is NaN. A run never throws.
- **Limits**: data lists ≤ 2000 values; tables ≤ 20 × 20; ≤ 20 groups or strata; chains ≤ 100 states; series ≤ 2000 values (thinned);
  Monte Carlo ≤ 2·10⁵ draws, sampling size × reps ≤ 10⁶, bootstrap B × n ≤ 4·10⁶, ruin walks ≤ 2·10⁶ steps, branching
  ≤ 5·10⁶ offspring draws. Work over a budget is refused up front, or stopped where it is, with the code `budget`.

### 1.1 Checker codes (`checkSpec`, the same in `tools/lib_prob.py`)

| code | when |
|---|---|
| `format` | `model` is not an object |
| `value` | a missing required field, a value of the wrong kind, out of its range (`p` in [0, 1], `conf` in (0, 1), integer counts); the cross-checks below |
| `enum` | `mode`, `family`, `kind`, `method`, `alt`, `stat` |
| `size` | a list too long or too short (`groups` needs 2) |
| `output` | an `of` the mode does not compute |
| `unknown-field` (warning) | a field the mode does not know (it is ignored) |

Cross-checks (all `value`, with their messages): a distribution's own constraints (`needs b > a` for uniform, `needs b >= a` for
dunif, `needs a <= c <= b and a < b` for triangular, `needs K <= N`, `needs n <= N`, `give rate or scale, not both`, `needs one
value per probability`); `<kind> needs x and y` (each kind's required fields, with alternatives: `t-one` takes `x` or `summary`);
`needs a 2 × 2 table` (Fisher, McNemar), `needs at least 2 rows and 2 columns`, `needs rows of the same length`, `needs one
probability per observed count`, `needs as many values as model.x`; `not a method for <kind> (…)`; for chains `the state X is
listed twice`, `needs K rows of K numbers`, `needs K numbers` (init), `not one of model.states` (start), `give init or start, not
both`; `needs k1 <= n1`; `needs i <= N`; `needs m0 <= m`; a draw named like a spec name (`is already a name of the spec`).

## 2. Modes at a glance

| mode | what it computes |
|---|---|
| `dist` | one distribution: moments, pmf/pdf, cdf, sf, their logs, P(lo ≤ X ≤ hi), quantiles, curves, the normal and Poisson approximations |
| `mc` | a Monte Carlo estimate of E[expr] or P(event) over named draws, with its interval and running mean |
| `sampling` | the sampling distribution of a statistic (the CLT, and where it fails) |
| `test` | 20 hypothesis tests: statistic, df, p value, decision, interval, effect size, the null curve |
| `ci` | intervals for a proportion (five methods, their exact coverage), a Poisson rate, a mean, a variance |
| `power` | power and sample size (z, t by the noncentral t, two proportions, exact binomial) |
| `bayes` | conjugate updating: beta-binomial, gamma-Poisson, normal-normal; equal-tail and HPD intervals, Bayes factor |
| `screen` | base rates: PPV, NPV, likelihood ratios, natural frequencies, an icon array |
| `simpson` | stratified rates, Simpson's paradox, the Mantel–Haenszel odds ratio, direct standardisation |
| `multi` | multiple testing: Bonferroni, Holm, Hochberg, BH, BY; simulated FWER, FDR and power |
| `markov` | finite chains: classes, period, stationary law, return and hitting times, absorption, mixing |
| `walk` | simple random walks, gambler's ruin, Galton–Watson branching |
| `queue` | M/M/c: utilisation, Erlang B and C, L, Lq, W, Wq, the queue-length law |
| `bootstrap` | the nonparametric bootstrap: SE, bias, percentile, basic, normal and BCa intervals, a permutation test |

## 3. Distributions (shared by `dist`, `mc`, `sampling`)

A distribution is `{family, …parameters}`; a parameter may be an expression. Defaults are the standard forms.

| family | parameters | notes |
|---|---|---|
| `bernoulli` | `p` | |
| `binomial` | `n` (≤ 10⁹), `p` | pmf by Loader's saddle point (`ldbinom`); cdf by the incomplete beta |
| `geometric` | `p`, `trials` | failures before the first success (0, 1, …), or with `trials: true` the trial of the first success (1, 2, …) |
| `negbinomial` | `r` (real > 0), `p` | failures before the r-th success |
| `poisson` | `lambda` | pmf by `ldpois`; cdf by the incomplete gamma |
| `hypergeometric` | `N`, `K`, `n` (≤ 10⁹) | pmf as three `ldbinom` terms (exact to ~1e-15 where scipy loses 1e-11) |
| `dunif` | `a`, `b` (integers) | |
| `categorical` | `probs`, `values` | weights not summing to 1 are normalised and counted (`normalized`) |
| `uniform` | `a`, `b` | |
| `normal`, `lognormal` | `mu`, `sigma` | |
| `exponential` | `rate` | |
| `gamma` | `shape`, `rate` or `scale` | |
| `beta` | `a`, `b` | |
| `chi2`, `t` | `df` (real > 0) | |
| `f` | `d1`, `d2` | |
| `cauchy` | `x0`, `gamma` | |
| `weibull` | `shape`, `scale` | |
| `laplace` | `mu`, `b` | |
| `logistic` | `mu`, `s` | |
| `pareto` | `xm`, `alpha` | |
| `gumbel` | `mu`, `beta` | |
| `triangular` | `a`, `b`, `c` | |
| `rayleigh` | `sigma` | |

**Quantiles.** Continuous: closed forms where they exist; otherwise Newton on the cdf (or the sf above the median, so an upper
quantile like 1 − 1e-12 is found in the upper tail), kept inside a bracket and falling back to bisection. Normal: AS241 (Wichura
1988). t: closed forms for ν = 1, 2, Hill's start and Newton otherwise. Discrete: the smallest x with F(x) ≥ p, found by galloping
from the normal-approximation guess, then exact search.

**Sampling.** Normal by inversion of AS241 (one uniform per draw, so seeds line up); gamma by Marsaglia & Tsang (2000) with the
`u^{1/a}` boost for a < 1; beta, χ², t, F from gammas; binomial and Poisson by inversion from the mode outward (a chop-down
search, exact for every n and λ in range); the rest by inversion.

### 3.1 `dist`

Model: `dist`, and `x` (the point), `lo`/`hi` (a range), `p` (a lower-tail probability), `pu` (an upper-tail probability),
`from`/`to`/`points` (the curve; default the 0.001–0.999 quantile range, 201 points or every integer of a discrete range).

Scalars: `mean var sd skew kurt` (excess kurtosis) `median mode pdf logpdf cdf sf logcdf logsf prob quantile isf normApprox
poissonApprox supportLo supportHi`. Series: `x pdf cdf area` (the pdf inside [lo, hi], else 0, to shade) `normal` (the normal of the
same mean and variance). `prob` is P(lo ≤ X ≤ hi) (discrete: both ends included); `normApprox` its continuity-corrected normal
approximation, `poissonApprox` the Poisson one with λ = np (binomial only).

Issues: `param` (an impossible parameter: geometric p = 0, σ ≤ 0), `degenerate` (a point mass: binomial p ∈ {0, 1}, Poisson λ = 0),
`moment-undefined` (the Cauchy mean; the moment is NaN), `moment-infinite` (Pareto α ≤ 1 mean, t ν ≤ 2 variance; the moment is
Infinity), `underflow` (a pmf or tail below 1e-308: the value is 0 and its log is still given), `pdf-infinite` (beta a < 1 at 0,
gamma shape < 1 at 0), `no-convergence`, `approx` (a fallback method was used: Temme's uniform expansion for the incomplete gamma,
the normal limit of the noncentral t), `normalized`.

## 4. `mc` — Monte Carlo

Model: `draws` (`{Name: distribution}`, the names must not clash with the spec's names), `expr` (over the draws and the spec's
names), `n` (default 10⁴, ≤ 2·10⁵), `seed`, `conf` (0.95), `bins`, `exact` (a known answer to compare with).

Scalars: `estimate se ciLo ciHi sd n nanFrac err covered indicator`. Series: `runN runMean runLo runHi` (the running estimate and its
band), `histX histDensity exactDensity`. If `expr` only takes the values 0 and 1 (an event), `indicator` is 1 and the interval is
**Wilson's** (Wilson 1927), whose coverage stays near nominal where the Wald interval fails; otherwise the interval is the normal
one, mean ± z·s/√n. `err` and `covered` compare with `exact`.

Issues: `few-samples` (n < 30), `infinite-variance` (a draw comes from a law with infinite variance: Cauchy, t with ν ≤ 2,
Pareto with α ≤ 2; the normal interval is then meaningless), `rare-event` (an indicator never or always true, or fewer
than 10 successes or failures), `nan-draws` (`nanFrac` > 0), `param`, `budget`, `normalized`.

## 5. `sampling` — sampling distributions and the CLT

Model: `parent` (a distribution), `size` (n), `reps` (1000), `stat` (`mean sum median var sd min max`), `seed`, `bins`.

Scalars: `statMean statSd theoMean theoSe` (μ and σ/√n for the mean, or the sum's) `ratio` (statSd/theoSe) `ks` (the
Kolmogorov–Smirnov distance between the standardised statistic and N(0, 1)) `skewStat`. Series: `histX histDensity normalDensity
runN runMean`. Issues: `no-mean` (Cauchy: the mean of n Cauchy draws is Cauchy again), `infinite-variance` (the CLT does not hold at
the √n rate: Pareto α ≤ 2, t ν ≤ 2), `param`, `budget` (size × reps > 10⁶), `normalized`.

## 6. `test` — hypothesis tests

Model: `kind`, the data (`x`, `y`, `groups`, `table`, `observed`/`probs`, `k`/`n`/`k2`/`n2`, or `summary: {mean, sd, n, mean2,
sd2, n2}`), `mu0` (0), `p0` (0.5), `sigma` (z tests), `ratio0` (1, the F test), `alpha` (0.05), `alt` (`two-sided`, `less`,
`greater`), `correct`, `exact`, `ddof`, `points` (the null curve).

Scalars: `stat df df2 p reject crit ciLo ciHi estimate se effect n intercept r2`. Series: `nullX nullPdf` (the statistic's null
density), `dataX dataY fitY` (regression). `effect` is Cohen's d (t tests), φ or Cramér's V (χ²), r (correlation), the odds ratio
(Fisher), η² (ANOVA). `crit` is the critical value at `alpha` for the chosen side.

| kind | method (source) | conventions |
|---|---|---|
| `z-one` | z with known σ | |
| `t-one`, `t-paired` | Student (1908) | paired = one-sample on x − y |
| `t-welch` | Welch (1947), Satterthwaite df | as R `t.test` |
| `t-pooled` | pooled variance | `var.equal = TRUE` |
| `prop-one`, `prop-two` | score z (pooled for two) | `correct` default **false** (R's `prop.test` uses true) |
| `binom-exact`, `sign` | exact binomial; two-sided p sums the outcomes no more likely than the observed (R's rule, relative tolerance 1e-7) | CI Clopper–Pearson |
| `chi2-gof` | Pearson χ² against `probs` (normalised) | |
| `chi2-indep` | Pearson χ² of an r × c table | `correct` (Yates 1934, 2 × 2 only) default **false** |
| `g-test` | likelihood ratio G = 2 Σ O ln(O/E) | table or goodness of fit |
| `fisher` | Fisher (1935) exact, 2 × 2 | two-sided as R (sum of tables ≤ the observed's probability × (1 + 1e-7)); `estimate` is the **sample** odds ratio (R reports the conditional MLE) |
| `mcnemar` | McNemar (1947): exact binomial on the discordant pair by default; `exact: false` gives χ² with continuity correction (`correct` default **true**) | |
| `f-var` | F of two variances | R `var.test` |
| `anova` | one-way ANOVA F | |
| `pearson` | r, t test, Fisher z interval | |
| `regression` | least squares slope, SE, t test, R² | |
| `mann-whitney` | U = W − n₁(n₁+1)/2 of x; exact null (Mann & Whitney 1947, by the recursion of the counts) for n₁, n₂ ≤ 50 without ties; else normal with tie correction and continuity (`correct` default **true**) | `ties-approx` |
| `wilcoxon` | signed rank V = W⁺ (as R, not scipy's min(W⁺, W⁻)); exact for n ≤ 50 without ties or zeros, else normal | zeros dropped (`zero-diffs`) |

Issues: `zero-variance` (no spread: the statistic is undefined, NaN), `low-expected` (counted per cell with E < 5: the χ² approximation
is doubtful; consider `fisher`), `ties-approx`, `zero-cell` (a zero in a G test or odds ratio), `zero-diffs`, `few-data`, `bad-data`
(negative counts, non-finite values), `param`.

## 7. `ci` — confidence intervals

Model: `kind` (`prop`, `poisson`, `mean`, `variance`), `k`, `n`, `t` (exposure), `x` or `summary`, `sigma`, `conf` (0.95),
`method`, `p` (the true p where coverage is evaluated), `points` (199, the coverage grid).

Scalars: `lo hi width est`, and for proportions `coverAt meanCover minCover` (of `method`), and every method's own
`lo.<m> hi.<m> coverAt.<m> meanCover.<m> minCover.<m>`. Series: `covP` (the grid of p), `cover`, `cover.<m>`.

| kind | methods (default first) |
|---|---|
| `prop` | `wilson` (Wilson 1927), `wald`, `agresti-coull` (Agresti & Coull 1998), `clopper-pearson` (1934), `jeffreys` (Beta(k + ½, n − k + ½) quantiles; 0 at k = 0 and 1 at k = n as Brown, Cai & DasGupta) |
| `poisson` | `exact` (Garwood 1936, gamma quantiles), `wald` |
| `mean` | `t`, `z` (needs `sigma`) |
| `variance` | `chi2` |

**Coverage** is exact, not simulated: C(p) = Σₖ P(X = k | n, p)·1[lo(k) ≤ p ≤ hi(k)], the pmf by the ratio recursion from the mode
(Brown, Cai & DasGupta 2001, *Interval estimation for a binomial proportion*). It is computed for n ≤ 2000. Wald and Agresti–Coull
bounds are **clipped to [0, 1]**; Wilson's are exactly 0 at k = 0 and 1 at k = n.

## 8. `power` — power and sample size

Model: `kind` (`z-one t-one t-paired t-two prop-two binom-exact`), `effect` (Cohen's d), `p0 p1 p2`, `n` (per group), `alpha`
(0.05), `alt`, `target` (0.8), `nMax` (curve range), `dMax`, `points`.

Scalars: `power nNeeded` (the smallest integer n reaching `target`) `nExact` (the real n by root finding) `crit ncp effectH`
(Cohen's h for proportions). Series: `powerN powerByN powerD powerByD`. The t power uses the noncentral t (AS243, Lenth 1989), not
the normal approximation, so P20 matches statsmodels to 1e-9. `binom-exact` power is the exact sum over the rejection region (it
saw-tooths in n, which the curve shows). Issues: `param`, `approx`, `not-reached` (target not reached by `nMax`).

## 9. `bayes` — conjugate updating

Model: `kind` (`beta-binomial gamma-poisson normal-normal`), `prior` (`a b` or `mu sd`), data (`k n`, `sum t`, `xbar n sigma`),
`theta0` (for P(θ > θ₀) and the Bayes factor), `conf`, `points`, `from`/`to`.

Scalars: `postA postB postMean postMode postSd ciLo ciHi` (equal-tail) `hpdLo hpdHi` (the highest-density interval, by golden-section
search over the lower tail probability) `pAbove bf01` (Savage–Dickey density ratio at θ₀) `predNext` (the posterior predictive of
one more trial or event) `priorMean mle`. Series: `theta prior like post` (the likelihood scaled to integrate to 1).
Issues: `improper-posterior` (Haldane's Beta(0, 0) with k = 0 or k = n: no posterior), `hpd-not-interval` (a U-shaped posterior,
both parameters < 1: the HPD set is two pieces, so `hpdLo`/`hpdHi` are NaN and the equal-tail interval stands), `mode-boundary`, `param`.

## 10. `screen` — base rates

Model: `prev sens spec`, `pop` (1000, the natural-frequency population), `tests` (repeat positives).

Scalars: `ppv npv lrPos lrNeg tp fp fn tn` (natural frequencies: **expected** counts out of `pop`, not rounded) `posRate accuracy
youden dor preOdds postOdds ppvRepeat` (after `tests` positive results in a row, assumed independent given the condition). Scene:
`icons` (an icon array of `pop` people, Gigerenzer & Hoffrage 1995). Issues: `param`.

## 11. `simpson` — stratified rates

Model: `strata: [{k1, n1, k2, n2}, …]` (treatment 1 and 2 in each stratum). Scalars: `pooled1 pooled2 pooledDiff std1 std2 stdDiff`
(directly standardised to the pooled stratum sizes) `paradox` (1 when every stratum favours one arm and the pooled rate the
other) `mhOR` (Mantel & Haenszel 1959) `strata`, and `rate1.<i> rate2.<i> diff.<i>`. Series: `stratum rates1 rates2`. Issues:
`param`, `zero-cell`.

## 12. `multi` — multiple testing

Model: `p` (a list of p values), `method` (`bonferroni holm hochberg bh by`, default `holm`), `alpha`; or `sim: {m, m0, effect, reps,
seed}` (m tests, m0 true nulls, the others with a z shift of `effect`). Scalars: `m rejected rejectedRaw minAdj fwerIndep` (1 −
(1 − α)^m) `threshold simFwer simFdr simPower simFwerRaw simFdrRaw`, and `adj.<i>`. Series: `rank sortedP bhLine adjSorted`. The
adjusted p values follow R's `p.adjust` (Holm 1979, Hochberg 1988, Benjamini & Hochberg 1995, Benjamini & Yekutieli 2001).

## 13. `markov` — finite chains

Model: `states` (ids), `labels` (texts, translated), `P` (rows), `init` or `start`, `steps` (50), `normalize` (rescale rows that do
not sum to 1 instead of failing).

Scalars: `classes closed transient period irreducible absorbing tAbsorb tAbsorbVar tv mixTime` (the first n with TV distance ≤ ¼),
`pi.<s>` (stationary law, by the GTH algorithm: Grassmann, Taksar & Heyman 1985, subtraction-free and accurate), `p.<s>` (the law
after `steps`), `ret.<s>` (mean return time 1/π), `absorb.<s>` (probability of absorption in s from the start), `hit.<s>` (mean
hitting time). Series: `n tv dist.<s>`. Scene: `diagram`. Classes by Tarjan's strongly connected components; period by the gcd of
cycle lengths in each class. Issues: `not-stochastic` (a row not summing to 1 within 1e-9, or a negative entry), `reducible`
(more than one closed class: π is not unique; the one given is for the start's class), `periodic` (no limit; π is still the
stationary law), `not-reached`, `param`.

## 14. `walk` — random walks and branching

`srw`: `steps`, `p`, `a`, `dim` → `pZero` (P(S_n = 0)), `pReturn` (P(return by n)), `mean var pMax` (P(max ≥ a)), `returnFrac`;
series `k pmf`; scene `paths`. `ruin`: `p N i paths reps seed` → `pWin pRuin duration` (closed forms, Feller 1968 §XIV) `simWin
simDuration`; series `iGrid pWinByI`; scene `paths`. `galton-watson`: `offspring` (a pmf on 0, 1, …) or `m` (Poisson mean),
`gens` (20), `reps` → `m extinct` (the smallest root of G(s) = s, by Newton from 0) `simExtinct` (the fraction extinct **by
generation `gens`**); series `gen qByGen` (P(extinct by n) = Gⁿ(0)). Issues: `param`, `critical-slow` (|m − 1| < 1e-3: extinction is
certain but slow), `capped` (a line of ≥ 1000 is counted as surviving; counted when q^1000 is not negligible), `budget`,
`normalized`.

## 15. `queue` — M/M/c

Model: `lambda mu c` (1) `nMax`. Scalars: `rho a p0 erlangB erlangC lq l wq w` (Erlang B by its stable recursion, C from B; Little's
law L = λW). Series: `qn qProb`. Issues: `unstable` (ρ = λ/(cμ) ≥ 1: no steady state; `erlangC` is 1, `p0` 0 and L, Lq, W, Wq are Infinity), `param`.

## 16. `bootstrap`

Model: `x`, `y` (for `diff-means` and `corr`), `stat` (`mean median sd var trimmed diff-means corr`), `B` (2000), `conf`, `seed`,
`trim` (0.1), `perm` (a permutation test of no difference / no correlation), `alt`. Scalars: `estimate se bias pctLo pctHi basicLo
basicHi normLo normHi bcaLo bcaHi` (Efron 1987: bias correction z₀ from the share below the estimate, acceleration from the
jackknife) `permP B`. Series: `histX histCount histDensity`. Issues: `param`, `few-data` (n < 5), `budget`, `bca-undefined` (every replicate
on one side, so z₀ is infinite: the BCa ends are NaN).

## 17. Numerical methods and their accuracy

| function | method (source) | accuracy (tested) |
|---|---|---|
| `log1p`, `expm1` | compensated forms (Goldberg 1991; Kahan) | full precision near 0 |
| `lgamma` | Euler–Maclaurin ζ(k) − 1, the `lgamma1p` series near 1 and 2, recurrence, Stirling series, reflection | ≤ 1e-14 relative |
| `stirlerr`, `bd0`, `ldbinom`, `ldpois` | Loader (2000), *Fast and accurate computation of binomial probabilities* | binomial n = 10⁹ log pmf to 7e-16 |
| P(a, x), Q(a, x) | series and Lentz continued fraction (Numerical Recipes §6.2) with Loader's prefactor for large a; Temme's uniform expansion as fallback (`approx`) | 1e-12 at a = 10⁷ |
| erf, erfc | P(½, x²) | erfc(5) to 1e-14 |
| Φ⁻¹ | AS241 (Wichura 1988) | 1e-15 |
| I_x(a, b) | Lentz continued fraction (NR §6.4) on the convergent side, Loader prefactor for a, b ≥ 10, the gamma limit for a ≥ 10⁷, b ≤ 1 | 1e-11 at a = b = 10⁵ |
| t cdf | I_x(ν/2, ½); the normal above ν = 10¹⁴; log tail kept | 1e-14 to ν = 10⁶; 2.5e-12 at t = 10, ν = 10⁶ |
| noncentral t | AS243 (Lenth 1989); the normal approximation for ν > 4·10⁵ (`approx`) | 5e-12 |
| quantiles | Newton in the tail that holds the probability, bracketed, bisection fallback | 1e-10 to 1e-14 |
| sums | Neumaier compensation | |

## 18. Reference values the tests assert (`tests/lib_prob.js`)

P1–P29 of `math.md` §2 (except P25's coupon and birthday parts and P26, see §19) and more: Φ(1.96), Φ⁻¹(0.975), Φ⁻¹(1e-10), Q(10),
ln Φ(−40) = −804.6084420137538; t, χ² and F quantiles; lgamma at 0.5, 100, 1e-8, 171.5, 1e-300, 1e10, −0.5; P(3, 2), P(100, 100),
Q(½, 1e-3), P at a = 10⁵ and 10⁷; I₀.₄(2, 3) = 0.5248; I at a = b = 10⁵; erfc(5), erfcinv(1e-20); the noncentral t (scipy `nct`);
Binomial(10, ½), Binomial(100, ½), Binomial(10⁶, ½), Binomial(10⁹, 10⁻⁸) (mpmath); Poisson(10), Poisson(1000), Poisson(10⁶); 2 aces
in 5 cards; the hypergeometric at N = 10⁶; NB, geometric, Weibull moments, Gumbel skewness; Student's sleep data (t = 4.0621,
p = 0.002833); Welch, pooled, F, ANOVA on PlantGrowth (F = 4.846); Pearson and regression; χ² and G of tables; Mendel's peas
(χ² = 0.470); Fisher's tea (17/70); McNemar; Mann–Whitney exact and with ties; Wilcoxon (V = 40, p = 0.039); the five
proportion intervals for 7/20 (statsmodels); Garwood; Wald 80.9 % vs Wilson 97.4 % coverage at n = 30, p = 0.1; power 0.8038,
n = 63.77, 0.5645; Beta(8, 14), Gamma(12, 5); kidney stones (Simpson); PPV 9.2 %; p.adjust; GTH (5/6, 1/6); ruin 32/275 and
19.18; P(S₂₀ = 0); extinction ½; M/M/1 and Erlang C; the bootstrap of a mean. The seeded Monte Carlo coverage meta-test runs 1000
seeds and checks the hit rate is within 3 binomial SE of the interval's exact coverage (94.96 % at n = 1000, p = 15/36).
Where scipy itself is off (binomial log pmf at n = 10⁹, the hypergeometric at N = 10⁶, `gammaln` just above 1) the tests use
mpmath at 40 digits.

## 19. Left out, and why

- **Multinomial, coupon collector, birthday problem** (P25 parts, P26): they need a vector-valued law or a combinatorial mode that
  the univariate distribution interface does not have. The birthday and coupon answers can be shown with `mc` (`expr` over a fixed
  number of draws) or as a formula in the spec's derived values. A `combinatorics` mode is the natural next step.
- **Multivariate normal, regression with several predictors, GLMs, mixed models**: beyond one engine's bounded run; they belong
  in a future `stats@2`.
- **Kolmogorov–Smirnov and Shapiro–Wilk tests**: `sampling` reports the KS distance, but the exact Kolmogorov distribution and the
  Royston (1995) Shapiro–Wilk coefficients were left for a later version.
- **MCMC**: conjugate Bayes covers the teaching cases exactly; a sampler would make results seed-dependent with no gain for these.
- **The t and F tails at ν > 10⁵ far out** are accurate to ~1e-12 relative, not 1e-15; beyond 1e-308 they underflow to 0 with the
  log kept (`logsf`), and `underflow` is counted.
