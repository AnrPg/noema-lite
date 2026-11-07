/* ===================== prob@1 — probability and statistics: the engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md, chapter docs/library/prob.md) =====================
   One general engine with 19 modes (model.mode):
     dist       25 families (pmf/pdf, cdf, sf, logs, quantiles, moments, P(a ≤ X ≤ b), normal and Poisson approximations, plots)
     mc         Monte Carlo of an expression over seeded draws (Welford, Wilson for events, running mean with its band, histogram)
     sampling   sampling distributions: CLT and LLN for any parent (and its failure for heavy tails)
     test       20 tests: z, t (one, paired, Welch, pooled), proportions, exact binomial, sign, χ² (fit, independence), G, Fisher,
                McNemar, F, one-way ANOVA, Pearson, regression slope, Mann–Whitney U, Wilcoxon signed rank
     ci         intervals for a proportion (Wald, Wilson, Agresti–Coull, Clopper–Pearson, Jeffreys) with their exact coverage,
                a Poisson rate (Garwood), a mean (t, z), a variance (χ²)
     power      power and sample size (z, t via the noncentral t of AS 243, two proportions by Cohen's h, the exact binomial test)
     bayes      conjugate updating (beta–binomial, gamma–Poisson, normal–normal): posteriors, equal-tail and HPD intervals, Bayes factors
     screen     the base-rate fallacy: PPV/NPV, likelihood ratios, natural frequencies and their icon array
     simpson    Simpson's paradox over strata: pooled vs stratified rates, direct standardisation, Mantel–Haenszel
     multi      multiple testing (Bonferroni, Holm, Hochberg, Benjamini–Hochberg, Benjamini–Yekutieli) and its seeded simulation
     markov     finite Markov chains: classes, periods, stationary law (GTH), absorption (fundamental matrix), hitting times, mixing
     walk       random walks (exact law of S_n, reflection, returns, Pólya), gambler's ruin, Galton–Watson extinction
     queue      M/M/c queues (Erlang B and C, Little's law)
     bootstrap  the bootstrap (percentile, basic, normal, BCa) and permutation tests
     combin     the multinomial law (moments, pmf, its exact test), the coupon collector (unequal probabilities, several copies,
                partial collections) and the birthday problem (k-coincidences, unequal days), exactly
     gof        goodness of fit: Kolmogorov–Smirnov one and two samples (exact laws, Durbin/MTW, Hodges, ties), Shapiro–Wilk
                (Royston 1995), Anderson–Darling (Marsaglia 2004; D'Agostino & Stephens with estimates), χ² of binned data
     mcmc       Metropolis–Hastings on any log density, Gibbs samplers; split rank-normalised R̂, bulk/tail ESS (Vehtari et al. 2021)
     multivar   the multivariate normal (Cholesky, rectangle cdf in 2-D), correlations, OLS with inference (QR), logistic
                regression (IRLS), PCA (Jacobi), the Dirichlet law
     rand       randomized algorithms (Motwani–Raghavan; Mitzenmacher–Upfal): amplification, quicksort/quickselect, Karger,
                Freivalds, Fermat/Miller–Rabin, rounding, balls in bins, Bloom, Count-Min, HyperLogLog, reservoir sampling, cover
                times, 2-SAT walks, tail bounds vs exact tails, skip lists, treaps, Monte Carlo integration
   The later modes draw their randomness from NoemaSimKit streams (46_lib_simkit.js, MRG32k3a), the earlier ones from the core's
   mulberry32 (unchanged, so their seeded results stay as they were).
   The special functions are written here with their sources beside them (lgamma, Loader's saddle point, the regularised incomplete
   gamma and beta functions, AS 241, AS 243). Pure, bounded, deterministic JS: no DOM, no network, no clock; the transcendental
   functions are NoemaExpr's fdlibm ports (never the platform's Math.* except sqrt, floor and the IEEE-exact operations); seeded
   randomness only (the core's mulberry32). A value outside a method's validity range is never a silent wrong number: it is NaN or
   Infinity with an issue counted (outputs issue.<code>). */
(function noemaLibProbModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, numbers and the model's own state names leave this module
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'prob@1';
  /* the schema of every mode, the families, the outputs each mode computes — the SAME JSON is embedded in tools/lib_prob.py
     (tests/lib_prob.js checks that the two copies are identical) */
  const DATA = {"modes":["dist","mc","sampling","test","ci","power","bayes","screen","simpson","multi","markov","walk","queue","bootstrap","combin","gof","mcmc","multivar","rand"],"families":{"bernoulli":{"disc":1,"p":{"p":"unit!"}},"binomial":{"disc":1,"p":{"n":"int:0:1000000000!","p":"unit!"}},"geometric":{"disc":1,"p":{"p":"unit!","trials":"bool"}},"negbinomial":{"disc":1,"p":{"r":"pos!","p":"unit!"}},"poisson":{"disc":1,"p":{"lambda":"nonneg!"}},"hypergeometric":{"disc":1,"p":{"N":"int:0:1000000000!","K":"int:0:1000000000!","n":"int:0:1000000000!"}},"dunif":{"disc":1,"p":{"a":"int:-1000000000:1000000000!","b":"int:-1000000000:1000000000!"}},"categorical":{"disc":1,"p":{"probs":"list!","values":"flist"}},"uniform":{"disc":0,"p":{"a":"fin!","b":"fin!"}},"normal":{"disc":0,"p":{"mu":"fin","sigma":"pos"}},"lognormal":{"disc":0,"p":{"mu":"fin","sigma":"pos"}},"exponential":{"disc":0,"p":{"rate":"pos"}},"gamma":{"disc":0,"p":{"shape":"pos!","rate":"pos","scale":"pos"}},"beta":{"disc":0,"p":{"a":"pos!","b":"pos!"}},"chi2":{"disc":0,"p":{"df":"pos!"}},"t":{"disc":0,"p":{"df":"pos!"}},"f":{"disc":0,"p":{"d1":"pos!","d2":"pos!"}},"cauchy":{"disc":0,"p":{"x0":"fin","gamma":"pos"}},"weibull":{"disc":0,"p":{"shape":"pos!","scale":"pos"}},"laplace":{"disc":0,"p":{"mu":"fin","b":"pos"}},"logistic":{"disc":0,"p":{"mu":"fin","s":"pos"}},"pareto":{"disc":0,"p":{"xm":"pos","alpha":"pos!"}},"gumbel":{"disc":0,"p":{"mu":"fin","beta":"pos"}},"triangular":{"disc":0,"p":{"a":"fin!","b":"fin!","c":"fin!"}},"rayleigh":{"disc":0,"p":{"sigma":"pos"}}},"schema":{"dist":{"x":"numx","lo":"numx","hi":"numx","p":"numx","pu":"numx","from":"numx","to":"numx","points":"int:2:2000"},"mc":{"expr":"expr!","n":"numx","seed":"int:0:4294967295","conf":"numx","bins":"int:2:200","exact":"numx"},"sampling":{"size":"numx!","reps":"numx","stat":"enum:mean|sum|median|var|sd|min|max","seed":"int:0:4294967295","bins":"int:2:200"},"test":{"kind":"enum:z-one|t-one|t-paired|t-welch|t-pooled|prop-one|prop-two|binom-exact|sign|chi2-gof|chi2-indep|g-test|fisher|mcnemar|f-var|anova|pearson|regression|mann-whitney|wilcoxon!","x":{"$list":"numx","max":2000},"y":{"$list":"numx","max":2000},"groups":{"$list":{"$list":"numx","max":2000},"max":20},"table":{"$list":{"$list":"numx","max":20},"max":20},"observed":{"$list":"numx","max":100},"probs":{"$list":"numx","max":100},"summary":{"$obj":{"mean":"numx!","sd":"numx!","n":"numx!","mean2":"numx","sd2":"numx","n2":"numx"}},"k":"numx","n":"numx","k2":"numx","n2":"numx","mu0":"numx","p0":"numx","sigma":"numx","ratio0":"numx","alpha":"numx","alt":"enum:two-sided|less|greater","correct":"bool","exact":"bool","ddof":"numx","points":"int:2:2000"},"ci":{"kind":"enum:prop|poisson|mean|variance!","k":"numx","n":"numx","t":"numx","x":{"$list":"numx","max":2000},"summary":{"$obj":{"mean":"numx!","sd":"numx!","n":"numx!"}},"sigma":"numx","conf":"numx","method":"enum:wald|wilson|agresti-coull|clopper-pearson|jeffreys|exact|t|z|chi2","p":"numx","points":"int:2:2000"},"power":{"kind":"enum:z-one|t-one|t-paired|t-two|prop-two|binom-exact!","effect":"numx","p0":"numx","p1":"numx","p2":"numx","n":"numx","alpha":"numx","alt":"enum:two-sided|less|greater","target":"numx","nMax":"int:2:2000","dMax":"numx","points":"int:2:2000"},"bayes":{"kind":"enum:beta-binomial|gamma-poisson|normal-normal!","prior":{"$obj":{"a":"numx","b":"numx","mu":"numx","sd":"numx"}},"k":"numx","n":"numx","sum":"numx","t":"numx","xbar":"numx","sigma":"numx","theta0":"numx","conf":"numx","points":"int:2:2000","from":"numx","to":"numx"},"screen":{"prev":"numx!","sens":"numx!","spec":"numx!","pop":"numx","tests":"numx"},"simpson":{"strata":{"$req":true,"$list":{"$obj":{"k1":"numx!","n1":"numx!","k2":"numx!","n2":"numx!"}},"max":20,"min":1}},"multi":{"p":{"$list":"numx","max":2000},"method":"enum:bonferroni|holm|hochberg|bh|by","alpha":"numx","sim":{"$obj":{"m":"numx!","m0":"numx!","effect":"numx!","reps":"numx","seed":"int:0:4294967295"}}},"markov":{"states":{"$req":true,"$list":"id","max":100,"min":1},"labels":{"$list":"key","max":100},"P":{"$req":true,"$list":{"$list":"numx","max":100},"max":100,"min":1},"init":{"$list":"numx","max":100},"start":"ref","steps":"numx","normalize":"bool"},"walk":{"kind":"enum:srw|ruin|galton-watson!","p":"numx","N":"numx","i":"numx","steps":"numx","paths":"numx","reps":"numx","seed":"int:0:4294967295","a":"numx","dim":"int:1:3","offspring":{"$list":"numx","max":64},"m":"numx","gens":"numx"},"queue":{"lambda":"numx!","mu":"numx!","c":"numx","nMax":"int:1:2000"},"bootstrap":{"x":{"$req":true,"$list":"numx","max":2000,"min":2},"y":{"$list":"numx","max":2000},"stat":"enum:mean|median|sd|var|trimmed|diff-means|corr","B":"numx","conf":"numx","seed":"int:0:4294967295","trim":"numx","perm":"bool","alt":"enum:two-sided|less|greater"},"combin":{"kind":"enum:multinomial|coupon|birthday!","n":"numx","probs":{"$list":"numx","max":400},"x":{"$list":"numx","max":64},"i":"numx","j":"numx","types":"numx","copies":"numx","want":"numx","m":"numx","mMax":"int:1:2000","days":"numx","people":"numx","k":"numx","target":"numx","nMax":"int:1:2000"},"gof":{"kind":"enum:ks-one|ks-two|shapiro-wilk|anderson-darling|chi2-fit!","x":{"$list":"numx","max":2000},"y":{"$list":"numx","max":2000},"estimate":"bool","alt":"enum:two-sided|less|greater","exact":"bool","bins":"int:2:100","ddof":"int:0:10","alpha":"numx","points":"int:2:2000"},"mcmc":{"kind":"enum:metropolis|gibbs-bivnormal|gibbs-normal!","logdens":"expr","params":{"$list":"name","max":6,"min":1},"init":{"$list":"numx","max":6},"scale":{"$list":"numx","max":6},"iters":"numx","burn":"numx","thin":"numx","chains":"int:1:8","seed":"int:0:4294967295","spread":"numx","rho":"numx","x":{"$list":"numx","max":2000},"prior":{"$obj":{"mu0":"numx","sd0":"numx","a":"numx","b":"numx"}},"lags":"int:1:200","bins":"int:2:200"},"multivar":{"kind":"enum:mvnormal|corr|ols|logistic|pca|dirichlet!","mu":{"$list":"numx","max":10,"min":1},"cov":{"$list":{"$list":"numx","max":10},"max":10},"x":{"$list":"numx","max":10},"data":{"$list":{"$list":"numx","max":10,"min":1},"max":2000,"min":1},"y":{"$list":"numx","max":2000},"w":{"$list":"numx","max":2000},"intercept":"bool","scale":"bool","conc":{"$list":"numx","max":10,"min":2},"conf":"numx","i":"int:0:9","j":"int:0:9","n":"numx","seed":"int:0:4294967295","maxIter":"int:1:200"},"rand":{"kind":"enum:amplify|quicksort|quickselect|karger|freivalds|primality|rounding|balls|bloom|countmin|hll|reservoir|cover|twosat|bounds|skiplist|treap|mcpi!","err":"numx","sided":"enum:one|two","k":"numx","delta":"numx","p":"numx","n":"numx","r":"numx","m":"numx","d":"numx","L":"numx","N":"numx","T":"numx","w":"numx","s":"numx","t":"numx","i":"numx","a":"numx","b":"numx","bits":"numx","eps":"numx","target":"numx","kMax":"int:1:2000","x":{"$list":"numx","max":2000},"edges":{"$list":{"$list":"numx","max":2,"min":2},"max":400},"A":{"$list":{"$list":"numx","max":16},"max":16},"B":{"$list":{"$list":"numx","max":16},"max":16},"Cm":{"$list":{"$list":"numx","max":16},"max":16},"graph":"enum:path|cycle|complete|star|lollipop|hypercube","start":"numx","reps":"numx","seed":"int:0:4294967295","expr":"expr","exact":"numx","points":"int:2:2000"}},"custom":{"dist":["dist"],"sampling":["parent"],"mc":["draws"],"gof":["dist"],"rand":["dist"]},"ranges":{"dist":{"p":"unit","pu":"unit"},"mc":{"n":"int:1:200000","conf":"unit"},"sampling":{"size":"int:1:10000","reps":"int:1:10000"},"test":{"alpha":"unit","p0":"unit","sigma":"pos","ddof":"int:0:100","k":"nonneg","n":"nonneg","k2":"nonneg","n2":"nonneg","ratio0":"pos"},"ci":{"conf":"unit","k":"nonneg","n":"nonneg","t":"pos","p":"unit","sigma":"pos"},"power":{"alpha":"unit","target":"unit","n":"pos","p0":"unit","p1":"unit","p2":"unit","dMax":"pos"},"bayes":{"prior.a":"nonneg","prior.b":"nonneg","prior.sd":"pos","k":"nonneg","n":"nonneg","sum":"nonneg","t":"pos","sigma":"pos","conf":"unit"},"screen":{"prev":"unit","sens":"unit","spec":"unit","pop":"int:1:2000","tests":"int:1:20"},"simpson":{},"multi":{"alpha":"unit","sim.m":"int:1:1000","sim.m0":"int:0:1000","sim.reps":"int:1:2000"},"markov":{"steps":"int:0:1000000"},"walk":{"p":"unit","N":"int:1:2000","i":"int:0:2000","steps":"int:1:10000","paths":"int:0:50","reps":"int:0:20000","a":"int:1:10000","m":"nonneg","gens":"int:1:200"},"queue":{"lambda":"pos","mu":"pos","c":"int:1:1000"},"bootstrap":{"B":"int:10:20000","conf":"unit","trim":"unit"},"combin":{"n":"int:0:100000","i":"int:0:63","j":"int:0:63","types":"int:1:2000","copies":"int:1:20","want":"int:1:2000","m":"int:0:1000000","days":"int:1:100000","people":"int:0:100000","k":"int:2:100","target":"unit"},"gof":{"alpha":"unit"},"mcmc":{"iters":"int:10:200000","burn":"int:0:200000","thin":"int:1:100","spread":"nonneg","prior.sd0":"pos","prior.a":"pos","prior.b":"pos"},"multivar":{"conf":"unit","n":"int:0:2000"},"rand":{"err":"unit","delta":"unit","p":"unit","eps":"unit","target":"unit","k":"int:0:100000","n":"int:0:1000000","r":"int:1:1000000","m":"int:1:100000000","d":"int:1:64","L":"int:0:100000","N":"int:0:9007199254740991","T":"int:0:100000000","w":"int:1:1000000","s":"nonneg","t":"int:0:1000","i":"int:0:1000000","bits":"int:4:16","start":"int:0:1000","reps":"int:0:100000"}},"kindField":{"test":"kind","ci":"kind","power":"kind","bayes":"kind","walk":"kind","bootstrap":"stat","multi":"*","combin":"kind","gof":"kind","mcmc":"kind","multivar":"kind","rand":"kind"},"needs":{"test":{"z-one":[["x","sigma"],["summary","sigma"]],"t-one":[["x"],["summary"]],"t-paired":[["x","y"]],"t-welch":[["x","y"],["summary"]],"t-pooled":[["x","y"],["summary"]],"prop-one":[["k","n"]],"prop-two":[["k","n","k2","n2"]],"binom-exact":[["k","n"]],"sign":[["x"]],"chi2-gof":[["observed","probs"]],"chi2-indep":[["table"]],"g-test":[["table"],["observed","probs"]],"fisher":[["table"]],"mcnemar":[["table"]],"f-var":[["x","y"],["summary"]],"anova":[["groups"]],"pearson":[["x","y"]],"regression":[["x","y"]],"mann-whitney":[["x","y"]],"wilcoxon":[["x"]]},"ci":{"prop":[["k","n"]],"poisson":[["k"]],"mean":[["x"],["summary"]],"variance":[["x"],["summary"]]},"power":{"z-one":[["effect"]],"t-one":[["effect"]],"t-paired":[["effect"]],"t-two":[["effect"]],"prop-two":[["p1","p2"]],"binom-exact":[["p0","p1"]]},"bayes":{"beta-binomial":[["prior.a","prior.b","k","n"]],"gamma-poisson":[["prior.a","prior.b","sum","t"]],"normal-normal":[["prior.mu","prior.sd","xbar","n","sigma"]]},"walk":{"srw":[["steps"]],"ruin":[["p","N","i"]],"galton-watson":[["offspring"],["m"]]},"bootstrap":{"diff-means":[["y"]],"corr":[["y"]]},"multi":{"*":[["p"],["sim"]]},"combin":{"multinomial":[["n","probs"]],"coupon":[["types"],["probs"]]},"gof":{"ks-one":[["x","dist"]],"ks-two":[["x","y"]],"shapiro-wilk":[["x"]],"anderson-darling":[["x","dist"],["x","estimate"]],"chi2-fit":[["x","dist"]]},"mcmc":{"metropolis":[["logdens","params","init"]],"gibbs-normal":[["x"]]},"multivar":{"mvnormal":[["mu","cov"]],"corr":[["data"]],"ols":[["data","y"]],"logistic":[["data","y"]],"pca":[["data"]],"dirichlet":[["conc"]]},"rand":{"amplify":[["err"],["p"]],"quicksort":[["n"]],"quickselect":[["n","r"]],"karger":[["n"],["edges"]],"freivalds":[["n"],["A","B","Cm"]],"primality":[["N"]],"rounding":[["x"]],"balls":[["n"]],"bloom":[["m","n"]],"countmin":[["w","d"]],"hll":[["bits"]],"reservoir":[["n","k"]],"cover":[["graph","n"],["edges"]],"twosat":[["n"]],"bounds":[["dist","a"]],"skiplist":[["n"]],"treap":[["n"]],"mcpi":[["n"]]}},"ciMethods":{"prop":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"poisson":["exact","wald"],"mean":["t","z"],"variance":["chi2"]},"outs":{"dist":{"scalar":["mean","var","sd","skew","kurt","median","mode","pdf","logpdf","cdf","sf","logcdf","logsf","prob","quantile","isf","normApprox","poissonApprox","supportLo","supportHi"],"series":["x","pdf","cdf","area","normal"],"scene":[],"issues":["param","degenerate","moment-undefined","moment-infinite","underflow","no-convergence","approx","pdf-infinite","normalized"]},"mc":{"scalar":["estimate","se","ciLo","ciHi","sd","n","nanFrac","err","covered","indicator"],"series":["runN","runMean","runLo","runHi","histX","histDensity","exactDensity"],"scene":[],"issues":["few-samples","infinite-variance","rare-event","nan-draws","param","budget","normalized"]},"sampling":{"scalar":["statMean","statSd","theoMean","theoSe","ratio","ks","skewStat"],"series":["histX","histDensity","normalDensity","runN","runMean"],"scene":[],"issues":["infinite-variance","no-mean","param","budget","normalized"]},"test":{"scalar":["stat","df","df2","p","reject","crit","ciLo","ciHi","estimate","se","effect","n","intercept","r2"],"series":["nullX","nullPdf","dataX","dataY","fitY"],"scene":[],"issues":["zero-variance","low-expected","ties-approx","zero-cell","zero-diffs","few-data","bad-data","param"]},"ci":{"scalar":["lo","hi","width","est","coverAt","meanCover","minCover"],"prefix":{"lo.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"hi.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"coverAt.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"meanCover.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"minCover.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"]},"series":["covP","cover"],"sprefix":{"cover.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"]},"scene":[],"issues":["param","few-data"]},"power":{"scalar":["power","nNeeded","nExact","crit","ncp","effectH"],"series":["powerN","powerByN","powerD","powerByD"],"scene":[],"issues":["param","approx","not-reached"]},"bayes":{"scalar":["postA","postB","postMean","postMode","postSd","ciLo","ciHi","hpdLo","hpdHi","pAbove","bf01","predNext","priorMean","mle"],"series":["theta","prior","like","post"],"scene":[],"issues":["improper-posterior","hpd-not-interval","mode-boundary","param"]},"screen":{"scalar":["ppv","npv","lrPos","lrNeg","tp","fp","fn","tn","posRate","accuracy","youden","dor","preOdds","postOdds","ppvRepeat"],"series":[],"scene":["icons"],"issues":["param"]},"simpson":{"scalar":["pooled1","pooled2","pooledDiff","std1","std2","stdDiff","paradox","mhOR","strata"],"prefix":{"rate1.":"$strata","rate2.":"$strata","diff.":"$strata"},"series":["stratum","rates1","rates2"],"scene":[],"issues":["param","zero-cell"]},"multi":{"scalar":["m","rejected","rejectedRaw","minAdj","fwerIndep","threshold","simFwer","simFdr","simPower","simFwerRaw","simFdrRaw"],"prefix":{"adj.":"$p"},"series":["rank","sortedP","bhLine","adjSorted"],"scene":[],"issues":["param","budget"]},"markov":{"scalar":["classes","closed","transient","period","irreducible","absorbing","tAbsorb","tAbsorbVar","tv","mixTime"],"prefix":{"pi.":"$states","p.":"$states","ret.":"$states","absorb.":"$states","hit.":"$states"},"series":["n","tv"],"sprefix":{"dist.":"$states"},"scene":["diagram"],"issues":["not-stochastic","reducible","periodic","not-reached","param"]},"walk":{"scalar":["pWin","pRuin","duration","simWin","simDuration","pZero","pReturn","mean","var","pMax","returnFrac","extinct","m","simExtinct"],"series":["k","pmf","iGrid","pWinByI","gen","qByGen"],"scene":["paths"],"issues":["param","critical-slow","capped","budget","normalized"]},"queue":{"scalar":["rho","a","p0","erlangB","erlangC","lq","l","wq","w"],"series":["qn","qProb"],"scene":[],"issues":["unstable","param"]},"bootstrap":{"scalar":["estimate","se","bias","pctLo","pctHi","basicLo","basicHi","bcaLo","bcaHi","normLo","normHi","permP","B"],"series":["histX","histCount","histDensity"],"scene":[],"issues":["param","few-data","budget","bca-undefined"]},"combin":{"scalar":["pmf","logpmf","outcomes","chi2","pChi2","pExact","cov","corr","eT","varT","sdT","pDone","median","eTApprox","pMatch","pNone","nFor","pApprox","expPairs"],"prefix":{"mean.":"$probs","var.":"$probs"},"series":["m","pmfT","cdfT","nGrid","pByN","approxByN","k","marg"],"scene":[],"issues":["param","budget","approx","normalized","underflow"]},"gof":{"scalar":["stat","p","pAsym","n","n2","df","reject","dPlus","dMinus","w","statAdj","minExpected"],"series":["ecdfX","ecdfY","cdfY","qqX","qqY","binLo","observed","expected"],"scene":[],"issues":["param","ties","few-data","approx","low-expected","estimated","zero-range","discrete","budget"]},"mcmc":{"scalar":["accept","draws","rhatMax","essMin"],"prefix":{"mean.":"$params","sd.":"$params","q05.":"$params","q50.":"$params","q95.":"$params","ess.":"$params","essTail.":"$params","rhat.":"$params","mcse.":"$params"},"series":["iter","lag"],"sprefix":{"trace.":"$params","trace2.":"$params","acf.":"$params","histX.":"$params","histDensity.":"$params"},"scene":[],"issues":["param","budget","no-kit","not-converged","low-ess","accept-extreme","nan-density"]},"multivar":{"scalar":["logpdf","pdf","maha","cdf","pEllipse","logdet","dim","r","rho","tau","pR","pRho","pTau","r2","adjR2","sigma","fStat","fP","df","dfModel","logLik","aic","bic","deviance","nullDeviance","iter","totalVar","entropy","n"],"prefix":{"mean.":"$dim","var.":"$dim","sd.":"$dim","eig.":"$dim","prop.":"$dim","cumProp.":"$dim","coef.":"$coef","se.":"$coef","stat.":"$coef","p.":"$coef","ciLo.":"$coef","ciHi.":"$coef","load.":"$dim2","cov.":"$dim2","corr.":"$dim2","chol.":"$dim2"},"series":["fitted","resid","lev","cook","pc1","pc2","scree","drawX","drawY","ellX","ellY"],"scene":[],"issues":["param","not-pd","singular","separation","no-convergence","few-data","ties","dim","budget"]},"rand":{"scalar":["errK","kNeeded","kHoeffding","lvExpected","lvTail","eComp","varComp","approxComp","simMean","simSd","pSuccess","pFailK","kRuns","minCut","simSuccess","pKS","errBound","errExact","pDetect","equal","isPrime","fermatLiars","mrLiars","fracFermat","fracMR","carmichael","witness","mu","pAbove","chernoffUpper","pBelow","chernoffLower","uncovered","uncoveredBound","eMax","pMaxLe","approxMax","simMax","eCollisions","pCollision","pCollisionBound","fpExact","fpApprox","fpClassic","kOpt","kOptInt","mFor","simFp","eps","delta","errAbs","wFor","dFor","simMaxErr","simMeanErr","simFracOver","stdErr","simRelSd","simRelBias","inclusion","chi2","pChi2","coverExact","hitMax","matthews","aleliunas","simCover","eSteps","worstSteps","pFailT","markovT","rounds","exact","markov","chebyshev","cantelli","chernoff","hoeffding","tightest","eHeight","searchCost","pointers","approxHeight","eDepth","eDepthAvg","heightApprox","estimate","se","err","seExact","errRootN"],"series":["kGrid","errByK","histX","histDensity","loadGrid","pMax","fpByK","pos","freq","aGrid","exactBy","markovBy","chebyshevBy","cantelliBy","chernoffBy","hoeffdingBy","runN","runEst","runLo","runHi","tGrid","pFailByT"],"scene":[],"issues":["param","budget","no-kit","not-applicable","approx","big-number","disconnected"]}}};
  const isObj = C.isObj, isNum = C.isNum, has = C.has;
  const fin = Number.isFinite;

  /* ===================================================================================================================== */
  /* the model checker (the same codes, paths, messages and order as tools/lib_prob.py)                                    */
  /* ===================================================================================================================== */
  const MISSING = undefined;
  function dig(o, path) { let v = o; for (const k of path.split('.')) { if (!isObj(v) || !has(v, k)) return MISSING; v = v[k]; } return v; }
  function specNames(spec) {
    const out = [];
    if (isObj(spec.consts)) out.push(...Object.keys(spec.consts));
    for (const k of ['params', 'derived']) if (Array.isArray(spec[k])) for (const p of spec[k]) if (isObj(p) && typeof p.id === 'string') out.push(p.id);
    return out;
  }
  /** the table of one distribution object: {family!, …its parameters} */
  function distTable(F) {
    const T = { family: 'enum:' + Object.keys(DATA.families).join('|') + '!' };
    if (!F) return T;
    for (const [k, kd] of Object.entries(F.p)) {
      const req = kd.endsWith('!'), b = req ? kd.slice(0, -1) : kd;
      if (b === 'bool') T[k] = 'bool';
      else if (b === 'list') T[k] = { $req: true, $list: 'numx', max: 64, min: 1 };
      else if (b === 'flist') T[k] = { $list: 'fin', max: 64 };
      else T[k] = req ? 'numx!' : 'numx';
    }
    return T;
  }
  function checkDist(o, p, E, W) {
    if (!isObj(o)) { E('format', p, 'not an object'); return; }
    const F = has(DATA.families, o.family) ? DATA.families[o.family] : null;
    C.walk(o, distTable(F), p, E, W);
    if (!F) return;
    for (const [k, kd] of Object.entries(F.p)) {
      const b = kd.replace('!', ''), v = o[k];
      if (b === 'bool' || b === 'flist') continue;
      if (b === 'list') { if (Array.isArray(v)) v.forEach((x, i) => { if (isNum(x) && x < 0) E('value', `${p}.${k}[${i}]`, C.kindMsg('nonneg')); }); continue; }
      if (isNum(v) && !C.checkKind(b, v)) E('value', `${p}.${k}`, C.kindMsg(b));
    }
    const f = o.family, n = k => isNum(o[k]);
    if (f === 'uniform' && n('a') && n('b') && !(o.b > o.a)) E('value', p + '.b', 'needs b > a');
    if (f === 'dunif' && n('a') && n('b') && !(o.b >= o.a)) E('value', p + '.b', 'needs b >= a');
    if (f === 'triangular' && n('a') && n('b') && n('c') && !(o.a <= o.c && o.c <= o.b && o.a < o.b)) E('value', p + '.c', 'needs a <= c <= b and a < b');
    if (f === 'hypergeometric' && n('N') && n('K') && o.K > o.N) E('value', p + '.K', 'needs K <= N');
    if (f === 'hypergeometric' && n('N') && n('n') && o.n > o.N) E('value', p + '.n', 'needs n <= N');
    if (f === 'gamma' && o.rate !== undefined && o.scale !== undefined) E('value', p + '.scale', 'give rate or scale, not both');
    if (f === 'categorical' && Array.isArray(o.values) && Array.isArray(o.probs) && o.values.length !== o.probs.length) E('value', p + '.values', 'needs one value per probability');
  }
  const IDX_RE = /^(0|[1-9][0-9]{0,5})$/;
  function prefOk(pref, of, m) {
    if (!pref) return false;
    for (const pf of Object.keys(pref)) {
      if (!of.startsWith(pf)) continue;
      const rest = of.slice(pf.length), vals = pref[pf];
      if (Array.isArray(vals)) { if (vals.includes(rest)) return true; continue; }
      if (vals === '$states') { if (Array.isArray(m.states) && m.states.includes(rest)) return true; continue; }
      if (vals === '$params') { if (paramNames(m).includes(rest)) return true; continue; }
      if (vals === '$dim2') { const g = /^(0|[1-9][0-9]?)_(0|[1-9][0-9]?)$/.exec(rest), K = dimOf(m); if (g && +g[1] < K && +g[2] < K) return true; continue; }
      if (vals === '$dim' || vals === '$coef') { const K = vals === '$dim' ? dimOf(m) : dimOf(m) + (m.intercept === false ? 0 : 1); if (IDX_RE.test(rest) && +rest < K) return true; continue; }
      const arr = vals === '$strata' ? m.strata : vals === '$probs' ? m.probs : m.p;
      if (IDX_RE.test(rest) && Array.isArray(arr) && +rest < arr.length) return true;
    }
    return false;
  }
  /** the parameter names of an MCMC model (its own for metropolis, fixed for the Gibbs samplers) */
  function paramNames(m) {
    if (m.kind === 'gibbs-bivnormal') return ['x', 'y'];
    if (m.kind === 'gibbs-normal') return ['mu', 'sigma'];
    return Array.isArray(m.params) ? m.params.filter(v => typeof v === 'string') : [];
  }
  /** the dimension of a multivariate model: its mean vector, its concentrations, or the columns of its data */
  function dimOf(m) {
    if (m.kind === 'mvnormal') return Array.isArray(m.mu) ? m.mu.length : 0;
    if (m.kind === 'dirichlet') return Array.isArray(m.conc) ? m.conc.length : 0;
    return Array.isArray(m.data) && Array.isArray(m.data[0]) ? m.data[0].length : 0;
  }
  function outOk(mode, m, kind, of) {
    const O = DATA.outs[mode];
    if (kind === 'scalar') return O.scalar.includes(of) || (of.startsWith('issue.') && O.issues.includes(of.slice(6))) || prefOk(O.prefix, of, m);
    if (kind === 'series') return O.series.includes(of) || prefOk(O.sprefix, of, m);
    return O.scene.includes(of);
  }
  const KINDS = ['scalar', 'series', 'scene'];
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    if (!isObj(m)) { E('format', 'model', 'not an object'); C.checkOutputs(spec, ID, KINDS, () => { }, E, W); return P; }
    const mode = DATA.modes.includes(m.mode) ? m.mode : null;
    const T = Object.assign({ mode: 'enum:' + DATA.modes.join('|') + '!' }, mode ? DATA.schema[mode] : {});
    const own = (mode && DATA.custom[mode]) || [];   // fields checked by extra(), not by the table
    const mm = {}; for (const k of Object.keys(m)) if (!own.includes(k)) mm[k] = m[k];
    C.walk(mm, T, 'model', E, W);
    if (mode) extra(mode, m, spec, E, W);
    C.checkOutputs(spec, ID, KINDS, (o, at) => {
      if (mode && !outOk(mode, m, o.kind, o.of)) E('output', at + '.of', `${mode} computes no ${o.kind} "${o.of}"`);
    }, E, W);
    return P;
  }
  /** the checks a table cannot say (the same order and messages as tools/lib_prob.py extra) */
  function extra(mode, m, spec, E, W) {
    if (mode === 'dist' || mode === 'sampling') {
      const f = mode === 'dist' ? 'dist' : 'parent';
      if (m[f] === undefined) E('value', 'model.' + f, 'missing'); else checkDist(m[f], 'model.' + f, E, W);
    }
    if ((mode === 'gof' || mode === 'rand') && m.dist !== undefined) checkDist(m.dist, 'model.dist', E, W);
    if (mode === 'mc') {
      const d = m.draws;
      if (d === undefined) E('value', 'model.draws', 'missing');
      else if (!isObj(d)) E('format', 'model.draws', 'not an object');
      else {
        const ks = Object.keys(d);
        if (!ks.length) E('size', 'model.draws', 'fewer than 1 items');
        else if (ks.length > 16) E('size', 'model.draws', 'more than 16 items');
        else {
          const taken = specNames(spec);
          for (const k of ks) {
            const p = 'model.draws.' + k;
            if (!C.checkKind('name', k)) E('value', p, C.kindMsg('name'));
            else if (taken.includes(k)) E('value', p, 'is already a name of the spec');
            else checkDist(d[k], p, E, W);
          }
        }
      }
    }
    for (const [f, kd] of Object.entries(DATA.ranges[mode])) { const v = dig(m, f); if (isNum(v) && !C.checkKind(kd, v)) E('value', 'model.' + f, C.kindMsg(kd)); }
    const kf = DATA.kindField[mode];
    if (kf && DATA.needs[mode]) {
      const kind = kf === '*' ? '*' : m[kf];
      const alts = typeof kind === 'string' && has(DATA.needs[mode], kind) ? DATA.needs[mode][kind] : null;
      if (alts && !alts.some(a => a.every(f => dig(m, f) !== MISSING))) E('value', 'model', `${kind === '*' ? mode : kind} needs ${alts.map(a => a.join(' and ')).join(' or ')}`);
    }
    const k = m.kind, A = Array.isArray;
    if (mode === 'test') {
      if (A(m.table)) {
        const rows = m.table, rect = rows.length > 0 && rows.every(r => A(r) && A(rows[0]) && r.length === rows[0].length);
        if (!rect) E('value', 'model.table', 'needs rows of the same length');
        else if ((k === 'fisher' || k === 'mcnemar') && !(rows.length === 2 && rows[0].length === 2)) E('value', 'model.table', 'needs a 2 × 2 table');
        else if ((k === 'chi2-indep' || k === 'g-test') && (rows.length < 2 || rows[0].length < 2)) E('size', 'model.table', 'needs at least 2 rows and 2 columns');
      }
      if ((k === 't-paired' || k === 'pearson' || k === 'regression') && A(m.x) && A(m.y) && m.x.length !== m.y.length) E('value', 'model.y', 'needs as many values as model.x');
      if ((k === 'chi2-gof' || k === 'g-test') && A(m.observed) && A(m.probs) && m.observed.length !== m.probs.length) E('value', 'model.probs', 'needs one probability per observed count');
      if (k === 'anova' && A(m.groups) && m.groups.length < 2) E('size', 'model.groups', 'needs at least 2 groups');
    } else if (mode === 'ci') {
      if (typeof m.method === 'string' && has(DATA.ciMethods, k) && DATA.ciMethods[k].indexOf(m.method) < 0) E('value', 'model.method', `not a method for ${k} (${DATA.ciMethods[k].join(', ')})`);
    } else if (mode === 'bootstrap') {
      if (m.stat === 'corr' && A(m.x) && A(m.y) && m.x.length !== m.y.length) E('value', 'model.y', 'needs as many values as model.x');
      if (m.perm === true && m.y === undefined) E('value', 'model.perm', 'needs model.y');
    } else if (mode === 'markov') {
      const S = A(m.states) ? m.states : null;
      if (S) {
        const K = S.length;
        S.forEach((s, i) => { if (typeof s === 'string' && S.indexOf(s) < i) E('value', `model.states[${i}]`, `the state ${s} is listed twice`); });
        if (A(m.P) && (m.P.length !== K || m.P.some(r => !A(r) || r.length !== K))) E('value', 'model.P', `needs ${K} rows of ${K} numbers`);
        if (A(m.init) && m.init.length !== K) E('value', 'model.init', `needs ${K} numbers`);
        if (A(m.labels) && m.labels.length !== K) E('value', 'model.labels', `needs ${K} keys`);
        if (typeof m.start === 'string' && !S.includes(m.start)) E('value', 'model.start', 'not one of model.states');
      }
      if (m.init !== undefined && m.start !== undefined) E('value', 'model.start', 'give init or start, not both');
    } else if (mode === 'simpson') {
      if (A(m.strata)) m.strata.forEach((s, i) => {
        if (!isObj(s)) return;
        if (isNum(s.k1) && isNum(s.n1) && s.k1 > s.n1) E('value', `model.strata[${i}].k1`, 'needs k1 <= n1');
        if (isNum(s.k2) && isNum(s.n2) && s.k2 > s.n2) E('value', `model.strata[${i}].k2`, 'needs k2 <= n2');
      });
    } else if (mode === 'walk') {
      if (k === 'ruin' && isNum(m.i) && isNum(m.N) && m.i > m.N) E('value', 'model.i', 'needs i <= N');
    } else if (mode === 'multi') {
      if (isObj(m.sim) && isNum(m.sim.m) && isNum(m.sim.m0) && m.sim.m0 > m.sim.m) E('value', 'model.sim.m0', 'needs m0 <= m');
    } else if (mode === 'combin') {
      if (A(m.probs)) m.probs.forEach((x, i) => { if (isNum(x) && x < 0) E('value', `model.probs[${i}]`, C.kindMsg('nonneg')); });
      if (k === 'multinomial' && A(m.probs) && m.probs.length > 64) E('size', 'model.probs', 'more than 64 items');
      if (k === 'multinomial' && A(m.probs) && A(m.x) && m.x.length !== m.probs.length) E('value', 'model.x', 'needs one count per probability');
      if (k === 'coupon' && A(m.probs) && isNum(m.types) && m.probs.length !== m.types) E('value', 'model.probs', `needs ${m.types} numbers`);
      if (k === 'coupon' && isNum(m.want) && isNum(m.types) && m.want > m.types) E('value', 'model.want', 'needs want <= types');
      if (k === 'birthday' && A(m.probs) && isNum(m.days) && m.probs.length !== m.days) E('value', 'model.probs', `needs ${m.days} numbers`);
    } else if (mode === 'gof') {
      if (m.estimate === true && k !== 'anderson-darling') E('value', 'model.estimate', 'only for anderson-darling');
      else if (m.estimate === true && m.dist !== undefined) E('value', 'model.estimate', 'give dist or estimate, not both');
    } else if (mode === 'mcmc') {
      if (k === 'metropolis' && A(m.params)) {
        const Pn = m.params, taken = specNames(spec), K = Pn.length;
        Pn.forEach((v, i) => { if (typeof v !== 'string') return; if (Pn.indexOf(v) < i) E('value', `model.params[${i}]`, `the parameter ${v} is listed twice`); else if (taken.includes(v)) E('value', `model.params[${i}]`, 'is already a name of the spec'); });
        if (A(m.init) && m.init.length !== K) E('value', 'model.init', `needs ${K} numbers`);
        if (A(m.scale) && m.scale.length !== K) E('value', 'model.scale', `needs ${K} numbers`);
      }
      if (isNum(m.burn) && isNum(m.iters) && m.burn >= m.iters) E('value', 'model.burn', 'needs burn < iters');
    } else if (mode === 'multivar') {
      if (k === 'mvnormal' && A(m.mu)) {
        const K = m.mu.length;
        if (A(m.cov) && (m.cov.length !== K || m.cov.some(r => !A(r) || r.length !== K))) E('value', 'model.cov', `needs ${K} rows of ${K} numbers`);
        if (A(m.x) && m.x.length !== K) E('value', 'model.x', `needs ${K} numbers`);
      }
      if (k === 'dirichlet' && A(m.conc) && A(m.x) && m.x.length !== m.conc.length) E('value', 'model.x', `needs ${m.conc.length} numbers`);
      if (A(m.data) && m.data.length && !m.data.every(r => A(r) && A(m.data[0]) && r.length === m.data[0].length)) E('value', 'model.data', 'needs rows of the same length');
      if (A(m.data) && A(m.y) && m.y.length !== m.data.length) E('value', 'model.y', 'needs one value per row of model.data');
      if (A(m.data) && A(m.w) && m.w.length !== m.data.length) E('value', 'model.w', 'needs one value per row of model.data');
    } else if (mode === 'rand') {
      if (k === 'quickselect' && isNum(m.r) && isNum(m.n) && m.r > m.n) E('value', 'model.r', 'needs r <= n');
      if (k === 'reservoir' && isNum(m.k) && isNum(m.n) && m.k > m.n) E('value', 'model.k', 'needs k <= n');
      if (k === 'twosat' && isNum(m.i) && isNum(m.n) && m.i > m.n) E('value', 'model.i', 'needs i <= n');
      if (k === 'freivalds' && A(m.A) && A(m.B) && A(m.Cm)) {
        const K = m.A.length, sq = Q => A(Q) && Q.length === K && Q.every(r => A(r) && r.length === K);
        if (!K || !sq(m.A) || !sq(m.B) || !sq(m.Cm)) E('value', 'model.A', 'needs square matrices of one size');
      }
      if (k === 'mcpi' && m.expr !== undefined && specNames(spec).includes('x')) E('value', 'model.expr', 'x is already a name of the spec');
    }
  }

  /** every expression of the model: [source, path, local names] (the same order as tools/lib_prob.py exprs): the distributions
      first, then the fields in the schema's order; model.expr of mc may use the names of its draws */
  function exprs(spec) {
    const out = [], m = isObj(spec) ? spec.model : null;
    if (!isObj(m) || !DATA.modes.includes(m.mode)) return out;
    const local = m.mode === 'mc' && isObj(m.draws) ? Object.keys(m.draws) : m.mode === 'mcmc' ? paramNames(m) : m.mode === 'rand' ? ['x'] : [];
    const visitDist = (o, p) => {
      if (!isObj(o) || !has(DATA.families, o.family)) return;
      for (const [k, kd] of Object.entries(DATA.families[o.family].p)) {
        const v = o[k];
        if (kd.startsWith('list')) { if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'string') out.push([x, `${p}.${k}[${i}]`, []]); }); }
        else if (!kd.startsWith('bool') && !kd.startsWith('flist') && typeof v === 'string') out.push([v, p + '.' + k, []]);
      }
    };
    if (m.mode === 'dist') visitDist(m.dist, 'model.dist');
    if (m.mode === 'sampling') visitDist(m.parent, 'model.parent');
    if (m.mode === 'mc' && isObj(m.draws)) for (const k of Object.keys(m.draws)) visitDist(m.draws[k], 'model.draws.' + k);
    if (m.mode === 'gof' || m.mode === 'rand') visitDist(m.dist, 'model.dist');
    const visit = (v, kd, p) => {
      if (v === undefined || kd === undefined) return;
      if (typeof kd === 'string') {
        const b = kd.replace('!', '');
        if ((b === 'numx' || b === 'expr') && typeof v === 'string') out.push([v, p, b === 'expr' ? local : []]);
        return;
      }
      if (kd.$obj) { if (isObj(v)) for (const k of Object.keys(kd.$obj)) visit(v[k], kd.$obj[k], p + '.' + k); return; }
      if (kd.$list !== undefined && Array.isArray(v)) v.forEach((x, i) => visit(x, kd.$list, `${p}[${i}]`));
    };
    const T = DATA.schema[m.mode];
    for (const k of Object.keys(T)) visit(m[k], T[k], 'model.' + k);
    return out;
  }
  /** the string keys the model names: the labels of a Markov chain's states */
  function keys(spec) {
    const m = isObj(spec) ? spec.model : null;
    if (!isObj(m) || m.mode !== 'markov' || !Array.isArray(m.labels)) return [];
    return m.labels.map((k, i) => [k, `model.labels[${i}]`]).filter(r => typeof r[0] === 'string');
  }

  /* ---------- the model's numbers: compiled once (prepare), evaluated per run ---------- */
  function prepare(spec) {
    const fns = new Map();
    for (const [src] of exprs(spec)) if (!fns.has(src)) fns.set(src, C.cx(src));
    return { fns };
  }
  function resolver(prepared, env) {
    const fns = prepared ? prepared.fns : new Map();
    return v => typeof v === 'number' ? v : typeof v === 'boolean' ? +v : typeof v === 'string' ? (fns.get(v) || C.cx(v))(env) : NaN;
  }
  /** g(o, key, dflt): the number of a field (dflt when absent; NaN when it does not compute) */
  const getter = R => (o, k, d) => (isObj(o) && o[k] !== undefined ? R(o[k]) : d === undefined ? NaN : d);
  function issueBag() { const b = {}; return { add(c, k) { b[c] = (b[c] || 0) + (k || 1); }, out: b }; }

  /* ===================================================================================================================== */
  /* special functions                                                                                                      */
  /* ===================================================================================================================== */
  const FX = root.NoemaExpr ? root.NoemaExpr.FUNCS : null;
  const fx = (n, alt) => (FX && FX[n] ? FX[n].fn : alt);
  const exp = fx('exp', Math.exp), log = fx('log', Math.log), pow = fx('pow', Math.pow), sin = fx('sin', Math.sin), cos = fx('cos', Math.cos);
  const tan = fx('tan', Math.tan), atan = fx('atan', Math.atan), atan2 = fx('atan2', Math.atan2), asin = fx('asin', Math.asin), tanh = fx('tanh', Math.tanh);
  const sqrt = Math.sqrt, floor = Math.floor, ceil = Math.ceil, abs = Math.abs, min = Math.min, max = Math.max;   // IEEE-exact everywhere
  const PI = 3.141592653589793, LN2 = 0.6931471805599453, LN_2PI = 1.8378770664093453, LN_SQRT_2PI = 0.9189385332046728;
  const LN_SQRT_PI = 0.5723649429247001, EULER = 0.5772156649015329, EPS = 2.220446049250313e-16;
  /* issues raised inside the numerics (no convergence, underflow, an approximation) go to the bag of the current run */
  let NOTE = null;
  const note = c => { if (NOTE) NOTE.add(c); };

  /* log1p and expm1 from the fdlibm log/exp by Kahan's compensations (Goldberg 1991, "What every computer scientist should know
     about floating-point arithmetic", Theorem 4; Kahan 2004): a few ulp */
  function log1p(x) {
    if (!(x > -1)) return x === -1 ? -Infinity : NaN;
    if (abs(x) > 0.5) return log(1 + x);
    const u = 1 + x;
    return u === 1 ? x : log(u) * x / (u - 1);
  }
  function expm1(x) {
    if (abs(x) > 0.5) return exp(x) - 1;
    const u = exp(x);
    if (u === 1) return x;
    const um = u - 1;
    return um === -1 ? -1 : um * x / log(u);
  }
  /** log(1 + t) − t without cancellation for small t (the series −t²/2 + t³/3 − …) */
  function log1pmx(t) {
    if (abs(t) > 0.25) return log1p(t) - t;
    let s = 0, tk = t * t, k = 2, sg = -1;
    for (; k < 200; k++) { const d = sg * tk / k; s += d; if (abs(d) < 1e-17 * abs(s)) break; tk *= t; sg = -sg; }
    return s;
  }
  /** sin(πx) with an exact argument reduction (no π·x rounding at large x) */
  function sinpi(x) {
    let r = x % 2; if (r < -1) r += 2; else if (r > 1) r -= 2;
    if (r === 0 || r === 1 || r === -1) return 0;
    if (r > 0.5) r = 1 - r; else if (r < -0.5) r = -1 - r;
    return sin(PI * r);
  }

  /* ---------- log Γ: Riemann ζ(k) − 1 by Euler–Maclaurin (N = 12, six Bernoulli terms; DLMF 25.2.9), the Taylor series of
     ln Γ(1 + ε) around 1 and 2 (DLMF 5.7.3, |ε| ≤ ½), downward recurrence into [1.5, 2.5) below 12, Stirling's series with the
     Bernoulli numbers above (DLMF 5.11.1), reflection Γ(x)Γ(1 − x) = π / sin(πx) for x ≤ 0 (DLMF 5.5.3) ---------- */
  const ZM1 = (() => {
    const z = [NaN, NaN], N = 12, BC = [1 / 12, -1 / 720, 1 / 30240, -1 / 1209600, 1 / 47900160, -691 / 1307674368000];
    for (let k = 2; k <= 64; k++) {
      let s = 0;
      for (let n = 2; n < N; n++) { let t = 1; for (let j = 0; j < k; j++) t /= n; s += t; }
      let Nk = 1; for (let j = 0; j < k; j++) Nk /= N;   // N^−k
      s += Nk * N / (k - 1) + Nk / 2;
      let rise = k, Np = Nk / N;   // k(k+1)…(k+2j−2) · N^(−k−2j+1)
      for (let j = 0; j < BC.length; j++) { s += BC[j] * rise * Np; rise *= (k + 2 * j + 1) * (k + 2 * j + 2); Np /= N * N; }
      z.push(s);
    }
    return z;
  })();
  /** ln Γ(1 + e) for |e| ≤ ½: −γe + e − ln(1 + e) + Σ_{k≥2} (−1)^k (ζ(k) − 1) e^k / k */
  function lgamma1p(e) {
    let s = 0, ek = e * e, sg = 1;
    for (let k = 2; k <= 64; k++) { const d = sg * ZM1[k] * ek / k; s += d; if (abs(d) < 1e-18) break; ek *= e; sg = -sg; }
    return -EULER * e + (e - log1p(e)) + s;
  }
  const ST = [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188, -691 / 360360, 1 / 156];
  function lgamma(x) {
    if (Number.isNaN(x)) return NaN;
    if (x === Infinity) return Infinity;
    if (x <= 0) { if (x === floor(x)) return Infinity; return log(PI / abs(sinpi(x))) - lgamma(1 - x); }
    if (x < 0.5) return lgamma1p(x) - log(x);
    if (x <= 1.5) return lgamma1p(x - 1);
    if (x <= 2.5) return log1p(x - 2) + lgamma1p(x - 2);
    if (x < 12) { let y = x, pr = 1; while (y > 2.5) { y -= 1; pr *= y; } return log(pr) + lgamma(y); }
    const r = 1 / x, r2 = r * r;
    let s = 0; for (let j = ST.length - 1; j >= 0; j--) s = s * r2 + ST[j];
    return (x - 0.5) * log(x) - x + LN_SQRT_2PI + s * r;
  }
  /** Loader's Stirling error δ(n) = ln Γ(n+1) − (n+½) ln n + n − ln √(2π) (C. Loader 2000, "Fast and accurate computation of
      binomial probabilities"; R nmath stirlerr.c): the series above 15, the definition below */
  function stirlerr(n) {
    if (n > 15) { const r = 1 / n, r2 = r * r; return (ST[0] + (ST[1] + (ST[2] + (ST[3] + ST[4] * r2) * r2) * r2) * r2) * r; }
    return lgamma(n + 1) - (n + 0.5) * log(n) + n - LN_SQRT_2PI;
  }
  /** Loader's deviance term bd0(x, np) = x ln(x/np) + np − x, by its series when x ≈ np */
  function bd0(x, np) {
    if (!fin(x) || !fin(np) || np === 0) return NaN;
    if (x === 0) return np;
    if (abs(x - np) < 0.1 * (x + np)) {
      let v = (x - np) / (x + np), s = (x - np) * v, ej = 2 * x * v;
      v *= v;
      for (let j = 1; j < 1000; j++) { ej *= v; const s1 = s + ej / (2 * j + 1); if (s1 === s) return s1; s = s1; }
      return s;
    }
    return x * log(x / np) + np - x;
  }
  /** ln Γ(b) − ln Γ(a + b) for b ≥ 10 without cancellation (Stirling with δ) */
  function lgammaRatio(b, a) { return -(b - 0.5) * log1p(a / b) - a * log(a + b) + a + stirlerr(b) - stirlerr(a + b); }
  /** ln B(a, b): symmetric Stirling form when both ≥ 10, the ratio form when one is, ln Γ sums otherwise (cf. TOMS 708 betaln) */
  function lbeta(a, b) {
    if (a > b) { const t = a; a = b; b = t; }
    if (!(a > 0)) return a === 0 ? Infinity : NaN;
    if (a >= 10) { const s = a + b; return a * log(a / s) + b * log(b / s) + 0.5 * log(s / (a * b)) + LN_SQRT_2PI + stirlerr(a) + stirlerr(b) - stirlerr(s); }
    if (b >= 10) return lgamma(a) + lgammaRatio(b, a);
    return lgamma(a) + lgamma(b) - lgamma(a + b);
  }
  /** ln of the binomial pmf for real x, n (Loader 2000 dbinom_raw); q = 1 − p given separately */
  function ldbinom(x, n, p, q) {
    if (q === undefined) q = 1 - p;
    if (p === 0) return x === 0 ? 0 : -Infinity;
    if (q === 0) return x === n ? 0 : -Infinity;
    if (x < 0 || x > n) return -Infinity;
    if (x === 0) { if (n === 0) return 0; return p < 0.1 ? -bd0(n, n * q) - n * p : n * log(q); }
    if (x === n) return q < 0.1 ? -bd0(n, n * p) - n * q : n * log(p);
    const lc = stirlerr(n) - stirlerr(x) - stirlerr(n - x) - bd0(x, n * p) - bd0(n - x, n * q);
    return lc - 0.5 * (LN_2PI + log(x) + log1p(-x / n));
  }
  /** ln of the Poisson pmf for real x (Loader 2000 dpois_raw) */
  function ldpois(x, lam) {
    if (lam === 0) return x === 0 ? 0 : -Infinity;
    if (x < 0) return -Infinity;
    if (x === 0) return -lam;
    if (!fin(lam)) return -Infinity;
    return -stirlerr(x) - bd0(x, lam) - 0.5 * (LN_2PI + log(x));
  }

  /* ---------- the regularised incomplete gamma functions P(a, x), Q(a, x): the series for x < a + 1 (NR 3rd ed. §6.2 gser), the
     continued fraction by the modified Lentz method otherwise (Lentz 1976; Thompson & Barnett 1986, J. Comput. Phys. 64:490;
     NR §5.2, §6.2 gcf); the prefactor x^a e^−x / Γ(a+1) by Loader's saddle point for a ≥ 1; the smaller of P, Q is computed and
     the other is its complement. Beyond 100 000 terms (a > ~10^8 near x = a): Temme's uniform asymptotic expansion (DLMF 8.12.3,
     Temme 1979), with the issue "approx" ---------- */
  const FPMIN = 1e-300, ITMAX = 100000;
  function gammaPQ(a, x) {   // → [P, Q, ln P, ln Q]
    if (!(a > 0) || !(x >= 0)) return [NaN, NaN, NaN, NaN];
    if (x === 0) return [0, 1, -Infinity, 0];
    if (x === Infinity) return [1, 0, 0, -Infinity];
    if (x > 1e10 * max(1, a)) {   // far beyond the mode: Q = x^{a−1}e^{−x}/Γ(a)·(1 + (a−1)/x + (a−1)(a−2)/x² + …), the rest < (a/x)³
      const lQ = (a - 1) * log(x) - x - lgamma(a) + log1p((a - 1) / x + (a - 1) * (a - 2) / (x * x)), Q = exp(lQ);
      return [-expm1(lQ), Q, log1p(-Q), lQ];
    }
    const lD = a >= 1 ? -stirlerr(a) - bd0(a, x) - 0.5 * (LN_2PI + log(a)) : a * log(x) - x - lgamma(a + 1);
    if (x < a + 1) {
      let sum = 1, term = 1, ap = a, i = 0;
      for (; i < ITMAX; i++) { ap += 1; term *= x / ap; sum += term; if (term < sum * 1e-17) break; }
      if (i >= ITMAX) return temme(a, x);
      const lP = lD + log(sum), P = exp(lP), Q = -expm1(lP);
      return [P, Q, lP, log1p(-P)];
    }
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d, i = 1;
    for (; i <= ITMAX; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (abs(del - 1) < 1e-16) break;
    }
    if (i > ITMAX) return temme(a, x);
    const lQ = lD + log(a * h), Q = exp(lQ);
    return [-expm1(lQ), Q, log1p(-Q), lQ];
  }
  /** Temme's leading terms: Q ≈ ½ erfc(η √(a/2)) + e^(−aη²/2) / √(2πa) · (1/(λ−1) − 1/η), λ = x/a */
  function temme(a, x) {
    note('approx');
    const lam = x / a, t = lam - 1, eta2 = -2 * log1pmx(t), eta = (t < 0 ? -1 : 1) * sqrt(max(eta2, 0));
    const c0 = abs(t) < 1e-4 ? -1 / 3 + eta / 12 : 1 / t - 1 / eta;
    const z = eta * sqrt(a / 2);
    let Q = 0.5 * erfc(z) + exp(-0.5 * a * eta2) / sqrt(2 * PI * a) * c0;
    Q = min(1, max(0, Q));
    return [1 - Q, Q, log1p(-Q), log(Q)];
  }
  /* erf, erfc through P(½, x²) (DLMF 7.11.1, 7.11.2) */
  function erfc(x) { if (Number.isNaN(x)) return NaN; const r = gammaPQ(0.5, x * x); return x >= 0 ? r[1] : 1 + r[0]; }
  function erf(x) { const r = gammaPQ(0.5, x * x); return x >= 0 ? r[0] : -r[0]; }
  /* the standard normal: Φ(z) = ½ erfc(−z/√2), the tail computed directly (never 1 − Φ); ln Φ for the underflow region */
  function ncdf(z) { if (Number.isNaN(z)) return NaN; const r = gammaPQ(0.5, z * z / 2); return z < 0 ? 0.5 * r[1] : 0.5 + 0.5 * r[0]; }
  function lncdf(z) { if (Number.isNaN(z)) return NaN; const r = gammaPQ(0.5, z * z / 2); return z < 0 ? r[3] - LN2 : log1p(-0.5 * r[1]); }
  const npdf = z => exp(-0.5 * z * z) / 2.5066282746310002;
  /** Φ⁻¹(p): Wichura's AS 241 PPND16 (Appl. Stat. 37:477, 1988; relative accuracy ~1e-16), three rational approximations */
  function qnorm(p) {
    if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    const q = p - 0.5;
    if (abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r +
        13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608) /
        (((((((5226.495278852545461 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r +
          5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    }
    let r = q < 0 ? p : 1 - p;
    r = sqrt(-log(r));
    let v;
    if (r <= 5) {
      r -= 1.6;
      v = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r +
        3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r +
          0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      v = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r +
        0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r +
          0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -v : v;
  }
  /** erfc⁻¹(y) = −Φ⁻¹(y/2)/√2 */
  const erfcinv = y => -qnorm(y / 2) / Math.SQRT2;

  /* ---------- the regularised incomplete beta function I_x(a, b): the continued fraction (NR 3rd ed. §6.4 betacf, modified
     Lentz) after the symmetry swap I_x(a, b) = 1 − I_{1−x}(b, a) when x > (a+1)/(a+b+2); the prefactor x^a (1−x)^b / B(a, b)
     by Loader's saddle point when a, b ≥ 10 (the binomial deviance form — what keeps I_0.4(200, 300) to 1e-14), by logs
     otherwise; y = 1 − x may be given exactly to keep the far tails. Returns [I, 1 − I] ---------- */
  function ibeta(x, a, b, y) {
    if (y === undefined) y = 1 - x;
    if (!(a > 0 && b > 0) || Number.isNaN(x) || Number.isNaN(y)) return [NaN, NaN, NaN, NaN];
    if (x <= 0) return [0, 1, -Infinity, 0];
    if (y <= 0) return [1, 0, 0, -Infinity];
    /* the fraction runs at its small argument: NR's swap at (a+1)/(a+b+2), but an argument near 1 loses the relative precision
       of 1 − x to its rounding (ε/(1 − x)), so a small argument up to 4× the threshold is kept (it still converges fast) */
    let swap = x > (a + 1) / (a + b + 2);
    if (swap && x < 0.01 && x <= 4 * (a + 1) / (a + b + 2)) swap = false;
    if (!swap && x > 0.99 && y <= 4 * (b + 1) / (a + b + 2)) swap = true;
    const r = swap ? ibetaCF(y, b, a, x) : ibetaCF(x, a, b, y);
    return swap ? [r[1], r[0], r[3], r[2]] : r;
  }
  /** I_x(a, b) without the swap; a huge a (≥ 1e7) with b ≤ 1 at x near 1: the gamma limit I ≈ Q(b, −(a + (b−1)/2) ln x)
      (−a ln X → Gamma(b) for X ~ Beta(a, b); the scaling of DiDonato & Morris 1992 bgrat; relative error O(a⁻²) < 1e-13) */
  function ibetaCF(x, a, b, y) {
    if (x > 0.99 && a >= 1e7 && b <= 1) { const g = gammaPQ(b, -(a + (b - 1) / 2) * log1p(-y)); return [g[1], g[0], g[3], g[2]]; }
    let lpre;
    if (a >= 10 && b >= 10) {
      const s = a + b;
      lpre = -bd0(a, s * x) - bd0(b, s * y) + 0.5 * log(a * b / s) - LN_SQRT_2PI - stirlerr(a) - stirlerr(b) + stirlerr(s);
    } else {
      const lx = y < 0.5 ? log1p(-y) : log(x), ly = x < 0.5 ? log1p(-x) : log(y);
      lpre = a * lx + b * ly - lbeta(a, b);
    }
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d, m = 1;
    for (; m <= ITMAX; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (abs(del - 1) < 1e-16) break;
    }
    if (m > ITMAX) { note('no-convergence'); return [NaN, NaN, NaN, NaN]; }
    const lI = lpre + log(h / a), I = exp(lI);
    return [I, -expm1(lI), lI, log1p(-I)];
  }

  /* ---------- the Student t distribution: tails as ½ I_{ν/(ν+t²)}(ν/2, ½) — the form whose argument keeps the tail (NR §6.14;
     Abramowitz & Stegun 26.7.1); ν above 1e14: the normal limit (the difference is below the double precision) ---------- */
  /* ---------- the far tails at huge degrees of freedom (prob@1 addition): the incomplete beta at a ≥ 5e4 with b = ½ (or an F with
     d2 > 1e5) runs its continued fraction near the turning point and loses ~ν·ε (2.5e-12 at ν = 1e6). There the tail is the integral
     of the density itself, ∫_x^∞ f = f(x)·∫_0^∞ e^{ln f(x + σw) − ln f(x)} σ dw with σ = 1/|d ln f/dx| (the tail's own scale), by the
     double-exponential (exp-sinh) rule of Takahasi & Mori (1974; Mori & Sugihara 2001): the trapezoid rule after
     w = exp(π/2·sinh τ), the step halved until two levels agree to 1e-15 (≤ 4609 points). tests/lib_prob.js: ≤ 2e-15 relative to
     mpmath at ν = 1e5 … 1e12 (the condition number t² of the tail itself aside) ---------- */
  function expsinh(g) {
    const HP = PI / 2, T0 = -4.5, SPAN = 9;
    const term = t => { const e = exp(t), sh = 0.5 * (e - 1 / e), ch = 0.5 * (e + 1 / e), w = exp(HP * sh), v = g(w) * w * HP * ch; return fin(v) ? v : 0; };
    let N = 18, h = SPAN / N, all = 0;
    for (let i = 0; i <= N; i++) all += term(T0 + i * h);
    let S = all * h;
    for (let lev = 1; lev <= 8; lev++) {
      N *= 2; h = SPAN / N; let add = 0;
      for (let i = 1; i < N; i += 2) add += term(T0 + i * h);
      all += add; const Sn = all * h;
      if (lev >= 3 && abs(Sn - S) <= 1e-15 * abs(Sn)) return Sn;
      S = Sn;
    }
    return S;
  }
  /** ln ∫_x^∞ e^{lf(s)} ds with the tail scale sig (see above) */
  function lnTailQuad(lf, x, sig) {
    const l0 = lf(x);
    if (!fin(l0)) return l0;
    return l0 + log(expsinh(w => exp(lf(x + sig * w) - l0) * sig));
  }
  const tTailQ = (t, df) => lnTailQuad(s => lntpdf(s, df), t, min(1, (df + t * t) / ((df + 1) * t)));   // t > 0
  function tsf(t, df) {   // P(T > t)
    if (Number.isNaN(t) || !(df > 0)) return NaN;
    if (df > 1e14) return ncdf(-t);
    if (t === Infinity) return 0;
    if (t === -Infinity) return 1;
    if (df > 2e4 && t !== 0) { const q = exp(tTailQ(abs(t), df)); return t > 0 ? q : 1 - q; }
    const t2 = t * t, x = df / (df + t2), y = t2 / (df + t2);
    const tail = 0.5 * (t2 > df ? ibeta(x, df / 2, 0.5, y)[0] : ibeta(y, 0.5, df / 2, x)[1]);
    return t > 0 ? tail : 1 - tail;
  }
  const tcdf = (t, df) => tsf(-t, df);
  function tlsf(t, df) {   // ln P(T > t), kept in the far right tail
    if (!(t > 0) || df > 1e14) return t > 0 ? lncdf(-t) : log(tsf(t, df));
    if (df > 2e4) return tTailQ(t, df);
    const t2 = t * t, x = df / (df + t2), y = t2 / (df + t2);
    return -LN2 + (t2 > df ? ibeta(x, df / 2, 0.5, y)[2] : ibeta(y, 0.5, df / 2, x)[3]);
  }
  function lntpdf(t, df) {
    if (df > 1e14) return -0.5 * t * t - LN_SQRT_2PI;
    const lr = df / 2 >= 10 ? -lgammaRatio(df / 2, 0.5) : lgamma((df + 1) / 2) - lgamma(df / 2);
    return lr - 0.5 * log(df * PI) - (df + 1) / 2 * log1p(t * t / df);
  }
  /** t quantile: closed forms for ν = 1 (Cauchy) and 2; else Newton–bisection on the cdf from a Cornish–Fisher start
      (Abramowitz & Stegun 26.7.5) */
  function qt(p, df) {   // the lower-tail quantile; the upper one is −qt(p) by symmetry
    if (Number.isNaN(p) || p < 0 || p > 1 || !(df > 0)) return NaN;
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    if (p === 0.5) return 0;
    if (df === 1) return p < 0.5 ? -1 / tan(PI * p) : 1 / tan(PI * (1 - p));   // tan(π(p − ½)) without the rounding near π/2
    if (df === 2) return (2 * p - 1) / sqrt(2 * p * (1 - p));
    if (df > 1e14) return qnorm(p);
    const z = qnorm(p), z2 = z * z;
    let x0 = z + (z2 + 1) * z / (4 * df) + ((5 * z2 + 16) * z2 + 3) * z / (96 * df * df);
    if (!fin(x0) || df < 3) x0 = z;
    return p < 0.5 ? invertC(p, false, t => tcdf(t, df), t => tsf(t, df), t => exp(lntpdf(t, df)), -Infinity, Infinity, x0)
      : -invertC(1 - p, false, t => tcdf(t, df), t => tsf(t, df), t => exp(lntpdf(t, df)), -Infinity, Infinity, -x0);
  }

  /** the generic quantile of a continuous law: the root of F(x) = p (or S(x) = p when upper) by Newton steps kept inside a
      bracket, bisection (geometric for wide positive brackets) when a step leaves it; ≤ 400 iterations */
  function invertC(p, upper, F, S, f, lo, hi, x0) {
    const g = x => (upper ? S(x) - p : F(x) - p);   // increasing in x when !upper
    const sgn = upper ? -1 : 1;
    let a = lo, b = hi, x = fin(x0) ? min(max(x0, lo), hi) : 0;
    if (!fin(x)) x = 0;
    let gx = g(x);
    if (Number.isNaN(gx)) return NaN;
    // make the bracket finite
    if (!fin(a) || !fin(b)) {
      let step = max(1, abs(x));
      for (let i = 0; i < 2000; i++) {
        if (sgn * gx > 0) { b = x; if (fin(a)) break; x -= step; }
        else if (sgn * gx < 0) { a = x; if (fin(b)) break; x += step; }
        else return x;
        step *= 2; gx = g(x);
        if (Number.isNaN(gx)) return NaN;
      }
      if (!fin(a) || !fin(b)) { note('no-convergence'); return NaN; }
      x = 0.5 * (a + b); gx = g(x);
    }
    for (let it = 0; it < 400; it++) {
      if (gx === 0) return x;
      if (sgn * gx > 0) b = x; else a = x;
      const fx0 = f(x);
      let xn = x - sgn * gx / fx0;
      if (!(xn > a && xn < b) || !fin(xn)) xn = (a > 0 && b / a > 4) ? sqrt(a * b) : (b < 0 && a / b > 4) ? -sqrt(a * b) : 0.5 * (a + b);
      if (abs(xn - x) <= 4 * EPS * abs(x) + 1e-300 || b - a <= 4 * EPS * max(abs(a), abs(b))) return xn;
      x = xn; gx = g(x);
      if (Number.isNaN(gx)) return NaN;
    }
    note('no-convergence');
    return x;
  }

  /* ---------- the noncentral t cdf: Lenth's AS 243 (Appl. Stat. 38:185, 1989; R nmath pnt.c): Poisson-weighted incomplete beta
     series, ≤ 1000 terms, error bound 1e-12; |δ| > 37.62: the normal approximation of Abramowitz & Stegun 26.7.10 ("approx") ---------- */
  function pnt(t, df, delta) {
    if (Number.isNaN(t) || !(df > 0) || Number.isNaN(delta)) return NaN;
    if (delta === 0) return tcdf(t, df);
    if (t === Infinity) return 1;
    if (t === -Infinity) return 0;
    let negdel = false, tt = t, del = delta;
    if (t < 0) { negdel = true; tt = -t; del = -delta; }
    if (df > 4e5 || del * del > 2 * LN2 * 1021) {   // AS 243 notes: the series underflows; A&S 26.7.10
      note('approx');
      const s = 1 / (4 * df), z = (tt * (1 - s) - del) / sqrt(1 + tt * tt * 2 * s);
      const r = ncdf(z);
      return negdel ? 1 - r : r;
    }
    const x = tt * tt / (tt * tt + df);
    let tnc = 0;
    if (x > 0) {
      const lambda = del * del;
      let p = 0.5 * exp(-0.5 * lambda), q = 0.7978845608028654 * p * del, s = 0.5 - p;
      if (s < 1e-7) s = -0.5 * expm1(-0.5 * lambda);
      let a = 0.5;
      const b = 0.5 * df, rxb = pow(1 - x, b), albeta = LN_SQRT_PI + lgamma(b) - lgamma(0.5 + b);
      let xodd = ibeta(x, a, b, 1 - x)[0], godd = 2 * rxb * exp(a * log(x) - albeta);
      tnc = b * x;
      let xeven = tnc < EPS ? tnc : 1 - rxb, geven = tnc * rxb;
      tnc = p * xodd + q * xeven;
      for (let it = 1; it <= 1000; it++) {
        a += 1; xodd -= godd; xeven -= geven;
        godd *= x * (a + b - 1) / a; geven *= x * (a + b - 0.5) / (a + 0.5);
        p *= lambda / (2 * it); q *= lambda / (2 * it + 1);
        tnc += p * xodd + q * xeven; s -= p;
        if (s < -1e-10) { note('no-convergence'); break; }
        if (s <= 0 && it > 1) break;
        if (abs(2 * s * (xodd - godd)) < 1e-12) break;
        if (it === 1000) note('no-convergence');
      }
    }
    tnc += ncdf(-del);
    tnc = min(1, max(0, tnc));
    return negdel ? 1 - tnc : tnc;
  }

  /* ===================================================================================================================== */
  /* the distributions: every family as {disc, lo, hi, pdf, lpdf, cdf, sf, lcdf, lsf, q, isf, mean, var, skew, kurt, mode,   */
  /* median, sample}; mi names the moments that are undefined (NaN) or infinite (Infinity)                                   */
  /* ===================================================================================================================== */
  let BUDGET = 2e7;   // the walking steps of the discrete samplers in one run
  const uOpen = r => r() + 1.1641532182693481e-10;   // (0, 1): never 0 or 1
  /** Marsaglia & Tsang (2000, ACM TOMS 26:363) for shape ≥ 1; U^(1/k) boost below 1 (their §6); scale 1 */
  function rgamma(r, k) {
    if (k < 1) { const u = uOpen(r); return rgamma(r, k + 1) * exp(log(u) / k); }
    const d = k - 1 / 3, c = 1 / sqrt(9 * d);
    for (let i = 0; i < 1000; i++) {
      let x = 0, v = -1;
      for (let j = 0; j < 100 && v <= 0; j++) { x = qnorm(uOpen(r)); v = 1 + c * x; }
      if (v <= 0) continue;
      v = v * v * v;
      const u = uOpen(r), x2 = x * x;
      if (u < 1 - 0.0331 * x2 * x2) return d * v;
      if (log(u) < 0.5 * x2 + d * (1 - v + log(v))) return d * v;
    }
    return NaN;
  }
  const clampI = (k, lo, hi) => max(lo, min(hi, k));
  /** the smallest k of [lo, hi] for which cond(k) holds (cond monotone: false … false true … true); galloping then bisection */
  function searchInt(cond, k0, lo, hi) {
    let k = clampI(k0, lo, hi);
    if (cond(k)) {
      let s = 1, j = k - s;
      while (j >= lo && cond(j)) { k = j; s *= 2; j = k - s; if (s > 2 ** 62) break; }
      let a = max(j, lo - 1), b = k;
      while (b - a > 1) { const mid = floor((a + b) / 2); if (cond(mid)) b = mid; else a = mid; }
      return b;
    }
    let s = 1, j = k + s;
    while (j <= hi && !cond(j)) { k = j; s *= 2; j = k + s; if (s > 2 ** 62) { note('no-convergence'); return NaN; } }
    if (j > hi) { j = hi; if (!fin(j)) { note('no-convergence'); return NaN; } }
    let a = k, b = j;
    while (b - a > 1) { const mid = floor((a + b) / 2); if (cond(mid)) b = mid; else a = mid; }
    return b;
  }
  /** an integer-valued law from its log pmf, cdf and sf on integers, its pmf ratios (for the mode walk) and its moments */
  function discrete(d) {
    const D = Object.assign({ disc: true, mi: {} }, d);
    const isInt = x => x === floor(x);
    D.lpdf = x => (isInt(x) && x >= D.lo && x <= D.hi ? d.lpmf(x) : -Infinity);
    D.pdf = x => exp(D.lpdf(x));
    D.cdf = x => (x < D.lo ? 0 : x >= D.hi ? 1 : d.cdfI(floor(x)));
    D.sf = x => (x < D.lo ? 1 : x >= D.hi ? 0 : d.sfI(floor(x)));
    D.lcdf = x => (d.lcdfI && x >= D.lo && x < D.hi ? d.lcdfI(floor(x)) : log(D.cdf(x)));
    D.lsf = x => (d.lsfI && x >= D.lo && x < D.hi ? d.lsfI(floor(x)) : log(D.sf(x)));
    const start = (z) => { const g = D.mean + sqrt(D.var) * z; return fin(g) ? Math.round(g) : D.lo; };
    D.q = p => {   // the smallest k with F(k) ≥ p (F(k) ≥ p(1 − 64ε) against rounding)
      if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
      if (p === 0) return D.lo;
      const t = p * (1 - 64 * EPS);
      return searchInt(k => D.cdf(k) >= t, start(qnorm(p)), D.lo, D.hi);
    };
    D.isf = pu => {   // the smallest k with P(X > k) ≤ pu
      if (Number.isNaN(pu) || pu < 0 || pu > 1) return NaN;
      if (pu === 1) return D.lo;
      const t = pu * (1 + 64 * EPS);
      return searchInt(k => D.sf(k) <= t, start(-qnorm(pu)), D.lo, D.hi);
    };
    if (!D.sample) {   // inversion by a walk from the mode: coherent in u (common random numbers), O(σ) per draw
      let init = null;
      D.sample = r => {
        if (!init) { const m0 = clampI(D.mode0, D.lo, D.hi); init = { m: m0, pm: exp(d.lpmf(m0)), Fm: D.cdf(m0) }; }
        const u = r();
        let k = init.m, F = init.Fm, pk = init.pm, st = 0;
        if (u <= F) { while (k > D.lo) { const Fp = F - pk; if (Fp < u || pk === 0) break; pk *= d.down(k); k--; F = Fp; st++; } }
        else { while (k < D.hi && F < u) { pk *= d.up(k); k++; F += pk; st++; if (pk === 0) break; } }
        BUDGET -= st + 1;
        if (BUDGET < 0) { note('budget'); return NaN; }
        return k;
      };
    }
    return D;
  }
  /** a continuous law; q and isf by invertC unless closed forms are given */
  function continuous(d) {
    const D = Object.assign({ disc: false, mi: {} }, d);
    D.pdf = x => exp(D.lpdf(x));
    if (!D.lcdf) D.lcdf = x => log(D.cdf(x));
    if (!D.lsf) D.lsf = x => log(D.sf(x));
    const x0 = p => (d.start ? d.start(p) : fin(D.mean) ? D.mean : 0);
    if (!D.q) D.q = p => (Number.isNaN(p) || p < 0 || p > 1 ? NaN : p === 0 ? D.lo : p === 1 ? D.hi : invertC(p, false, D.cdf, D.sf, D.pdf, D.lo, D.hi, x0(p)));
    if (!D.isf) D.isf = p => (Number.isNaN(p) || p < 0 || p > 1 ? NaN : p === 1 ? D.lo : p === 0 ? D.hi : invertC(p, true, D.cdf, D.sf, D.pdf, D.lo, D.hi, x0(1 - p)));
    return D;
  }
  const qok = p => !(Number.isNaN(p) || p < 0 || p > 1);

  function binomialD(n, p) {
    const q = 1 - p, npq = n * p * q;
    const D = discrete({
      lo: 0, hi: n, lpmf: k => ldbinom(k, n, p, q),
      cdfI: k => ibeta(q, n - k, k + 1, p)[0], sfI: k => ibeta(q, n - k, k + 1, p)[1],
      lcdfI: k => ibeta(q, n - k, k + 1, p)[2], lsfI: k => ibeta(q, n - k, k + 1, p)[3],
      up: k => (n - k) / (k + 1) * p / q, down: k => k / (n - k + 1) * q / p,
      mean: n * p, var: npq, skew: (q - p) / sqrt(npq), kurt: (1 - 6 * p * q) / npq,
      mode0: min(n, floor((n + 1) * p)), degenerate: p === 0 || p === 1 || n === 0,
    });
    if (n * min(p, q) < 30) {   // chop-down inversion from 0 (Kachitvichyanukul & Schmeiser 1988, "BINV"), by symmetry for p > ½
      const pp = min(p, q), flip = p > 0.5, base = exp(n * log1p(-pp)), rr = pp / (1 - pp);
      D.sample = r => {
        const u = r();
        let k = 0, pk = base, F = pk;
        while (u > F && k < n) { pk *= (n - k) / (k + 1) * rr; k++; F += pk; if (pk === 0) break; }
        return flip ? n - k : k;
      };
    }
    return D;
  }
  function poissonD(lam) {
    const D = discrete({
      lo: 0, hi: Infinity, lpmf: k => ldpois(k, lam),
      cdfI: k => gammaPQ(k + 1, lam)[1], sfI: k => gammaPQ(k + 1, lam)[0], lcdfI: k => gammaPQ(k + 1, lam)[3], lsfI: k => gammaPQ(k + 1, lam)[2],
      up: k => lam / (k + 1), down: k => k / lam,
      mean: lam, var: lam, skew: 1 / sqrt(lam), kurt: 1 / lam, mode0: floor(lam), degenerate: lam === 0,
    });
    if (lam === 0) D.hi = 0;
    if (lam < 30) {   // sequential search from 0 (Devroye 1986, §X.3.3)
      const base = exp(-lam);
      D.sample = r => { const u = r(); let k = 0, pk = base, F = pk; while (u > F && k < 1000) { k++; pk *= lam / k; F += pk; } return k; };
    }
    return D;
  }
  function geometricD(p, trials) {
    const s = trials ? 1 : 0, l1p = log1p(-p);
    return discrete({
      lo: s, hi: p === 1 ? s : Infinity,
      lpmf: k => (p === 1 ? (k === s ? 0 : -Infinity) : log(p) + (k - s) * l1p),
      cdfI: k => -expm1((k - s + 1) * l1p), sfI: k => exp((k - s + 1) * l1p), lsfI: k => (k - s + 1) * l1p,
      up: () => 1 - p, down: () => 1 / (1 - p),
      mean: (1 - p) / p + s, var: (1 - p) / (p * p), skew: (2 - p) / sqrt(1 - p), kurt: 6 + p * p / (1 - p), mode0: s, degenerate: p === 1,
      sample: r => (p === 1 ? s : s + floor(log(uOpen(r)) / l1p)),   // inversion: P(J ≥ j) = (1 − p)^j
    });
  }
  function negbinomialD(rr, p) {
    return discrete({
      lo: 0, hi: p === 1 ? 0 : Infinity,
      lpmf: k => (p === 1 ? (k === 0 ? 0 : -Infinity) : ldbinom(rr, k + rr, p, 1 - p) + log(rr / (rr + k))),   // R nmath dnbinom.c
      cdfI: k => ibeta(p, rr, k + 1, 1 - p)[0], sfI: k => ibeta(p, rr, k + 1, 1 - p)[1], lcdfI: k => ibeta(p, rr, k + 1, 1 - p)[2], lsfI: k => ibeta(p, rr, k + 1, 1 - p)[3],
      up: k => (k + rr) / (k + 1) * (1 - p), down: k => k / ((k - 1 + rr) * (1 - p)),
      mean: rr * (1 - p) / p, var: rr * (1 - p) / (p * p), skew: (2 - p) / sqrt((1 - p) * rr), kurt: 6 / rr + p * p / ((1 - p) * rr),
      mode0: rr > 1 ? floor((rr - 1) * (1 - p) / p) : 0, degenerate: p === 1,
    });
  }
  function hyperD(N, K, n) {
    const lo = max(0, n + K - N), hi = min(n, K), pp = N > 0 ? n / N : 0, qq = N > 0 ? (N - n) / N : 1;
    const lpmf = x => (N === 0 ? (x === 0 ? 0 : -Infinity) : ldbinom(x, K, pp, qq) + ldbinom(n - x, N - K, pp, qq) - ldbinom(n, N, pp, qq));   // R nmath dhyper.c
    const up = k => (K - k) * (n - k) / ((k + 1) * (N - K - n + k + 1)), down = k => k * (N - K - n + k) / ((K - k + 1) * (n - k + 1));
    const mean = N > 0 ? n * K / N : 0;
    function tail(x, upper) {   // Σ_{j ≤ x} or Σ_{j > x}, summed away from the mode until the terms vanish (R nmath phyper.c)
      let j = upper ? x + 1 : x, t = exp(lpmf(j)), s = t, it = 0;
      if (!upper) while (j > lo && it++ < 2e6) { t *= down(j); j--; s += t; if (t < s * 1e-17) break; }
      else while (j < hi && it++ < 2e6) { t *= up(j); j++; s += t; if (t < s * 1e-17) break; }
      if (it >= 2e6) note('no-convergence');
      return min(1, s);
    }
    const NN = N, v = N > 1 ? n * (K / N) * ((N - K) / N) * ((N - n) / (N - 1)) : 0;
    const sk = (NN - 2 * K) * sqrt(NN - 1) * (NN - 2 * n) / (sqrt(n * K * (NN - K) * (NN - n)) * (NN - 2));
    const ku = ((NN - 1) * NN * NN * (NN * (NN + 1) - 6 * K * (NN - K) - 6 * n * (NN - n)) + 6 * n * K * (NN - K) * (NN - n) * (5 * NN - 6)) / (n * K * (NN - K) * (NN - n) * (NN - 2) * (NN - 3));
    return discrete({
      lo, hi, lpmf, up, down,
      cdfI: x => (x < mean ? tail(x, false) : 1 - tail(x, true)), sfI: x => (x < mean ? 1 - tail(x, false) : tail(x, true)),
      mean, var: v, skew: sk, kurt: ku, mode0: floor((n + 1) * (K + 1) / (N + 2)), degenerate: lo === hi,
    });
  }
  function dunifD(a, b) {
    const m = b - a + 1;
    return discrete({
      lo: a, hi: b, lpmf: () => -log(m), cdfI: k => (k - a + 1) / m, sfI: k => (b - k) / m, up: () => 1, down: () => 1,
      mean: (a + b) / 2, var: (m * m - 1) / 12, skew: 0, kurt: -6 * (m * m + 1) / (5 * (m * m - 1)), mode0: a, nomode: m > 1, degenerate: m === 1,
      sample: r => a + floor(r() * m),
    });
  }
  /** a categorical law on given values (default 0, 1, …): probabilities normalised ("normalized" when they did not sum to 1) */
  function categoricalD(probs, values) {
    const tot = probs.reduce((s, x) => s + x, 0);
    if (!(tot > 0) || probs.some(x => !(x >= 0))) return null;
    if (abs(tot - 1) > 1e-9) note('normalized');
    const vs = values || probs.map((_, i) => i);
    const idx = vs.map((_, i) => i).sort((i, j) => vs[i] - vs[j] || i - j);
    const V = [], Pm = [];
    for (const i of idx) { if (V.length && V[V.length - 1] === vs[i]) Pm[Pm.length - 1] += probs[i] / tot; else { V.push(vs[i]); Pm.push(probs[i] / tot); } }
    const cum = []; let c = 0; for (const x of Pm) { c += x; cum.push(c); }
    const tailS = []; let s = 0; for (let i = Pm.length - 1; i >= 0; i--) { tailS[i] = s; s += Pm[i]; }   // P(X > V[i])
    let mu = 0; V.forEach((v, i) => { mu += v * Pm[i]; });
    let m2 = 0, m3 = 0, m4 = 0; V.forEach((v, i) => { const dd = v - mu; m2 += dd * dd * Pm[i]; m3 += dd * dd * dd * Pm[i]; m4 += dd * dd * dd * dd * Pm[i]; });
    const at = x => { let lo = 0, hi = V.length - 1, r = -1; while (lo <= hi) { const md = (lo + hi) >> 1; if (V[md] <= x) { r = md; lo = md + 1; } else hi = md - 1; } return r; };   // last index with V ≤ x
    let im = 0; Pm.forEach((x, i) => { if (x > Pm[im]) im = i; });
    const D = {
      disc: true, cat: true, mi: {}, lo: V[0], hi: V[V.length - 1], values: V,
      pdf: x => { const i = at(x); return i >= 0 && V[i] === x ? Pm[i] : 0; },
      cdf: x => { const i = at(x); return i < 0 ? 0 : min(1, cum[i]); },
      sf: x => { const i = at(x); return i < 0 ? 1 : tailS[i]; },
      q: p => { if (!qok(p)) return NaN; const t = p * (1 - 64 * EPS); for (let i = 0; i < V.length; i++) if (cum[i] >= t) return V[i]; return V[V.length - 1]; },
      isf: p => { if (!qok(p)) return NaN; const t = p * (1 + 64 * EPS); for (let i = 0; i < V.length; i++) if (tailS[i] <= t) return V[i]; return V[V.length - 1]; },
      mean: mu, var: m2, skew: m3 / pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3, mode0: V[im], degenerate: V.length === 1,
      sample: r => { const u = r(); for (let i = 0; i < V.length; i++) if (u < cum[i]) return V[i]; return V[V.length - 1]; },
    };
    D.lpdf = x => log(D.pdf(x)); D.lcdf = x => log(D.cdf(x)); D.lsf = x => log(D.sf(x));
    return D;
  }

  const normalD = (mu, s) => continuous({
    lo: -Infinity, hi: Infinity, lpdf: x => { const z = (x - mu) / s; return -0.5 * z * z - log(s) - LN_SQRT_2PI; },
    cdf: x => ncdf((x - mu) / s), sf: x => ncdf((mu - x) / s), lcdf: x => lncdf((x - mu) / s), lsf: x => lncdf((mu - x) / s),
    q: p => mu + s * qnorm(p), isf: p => mu - s * qnorm(p), mean: mu, var: s * s, skew: 0, kurt: 0, mode0: mu, median: mu,
    sample: r => mu + s * qnorm(uOpen(r)),
  });
  function gammaD(k, th) {
    const D = continuous({
      lo: 0, hi: Infinity,
      lpdf: x => (x < 0 ? -Infinity : x === 0 ? (k < 1 ? Infinity : k === 1 ? -log(th) : -Infinity)
        : k < 1 ? ldpois(k, x / th) + log(k / x) : ldpois(k - 1, x / th) - log(th)),   // R nmath dgamma.c (Loader)
      cdf: x => (x <= 0 ? 0 : gammaPQ(k, x / th)[0]), sf: x => (x <= 0 ? 1 : gammaPQ(k, x / th)[1]),
      lcdf: x => (x <= 0 ? -Infinity : gammaPQ(k, x / th)[2]), lsf: x => (x <= 0 ? 0 : gammaPQ(k, x / th)[3]),
      start: p => {   // Wilson & Hilferty (1931); the series P(a, x) ≈ x^a / Γ(a+1) for small shapes
        if (k < 1) return th * min(k, exp((log(p) + lgamma(k + 1)) / k));
        const z = qnorm(p), w = 1 - 1 / (9 * k) + z / (3 * sqrt(k));
        return th * k * max(0.001, w * w * w);
      },
      mean: k * th, var: k * th * th, skew: 2 / sqrt(k), kurt: 6 / k, mode0: k >= 1 ? (k - 1) * th : 0,
      sample: r => th * rgamma(r, k),
    });
    return D;
  }
  function betaD(a, b) {
    const lb = lbeta(a, b);
    return continuous({
      lo: 0, hi: 1,
      lpdf: x => {
        if (x < 0 || x > 1) return -Infinity;
        if (x === 0) return a < 1 ? Infinity : a === 1 ? -lb : -Infinity;
        if (x === 1) return b < 1 ? Infinity : b === 1 ? -lb : -Infinity;
        if (a <= 2 || b <= 2) return (a - 1) * log(x) + (b - 1) * log1p(-x) - lb;
        return log(a + b - 1) + ldbinom(a - 1, a + b - 2, x, 1 - x);   // R nmath dbeta.c (Loader)
      },
      cdf: x => (x <= 0 ? 0 : x >= 1 ? 1 : ibeta(x, a, b)[0]), sf: x => (x <= 0 ? 1 : x >= 1 ? 0 : ibeta(x, a, b)[1]),
      lcdf: x => (x <= 0 ? -Infinity : x >= 1 ? 0 : ibeta(x, a, b)[2]), lsf: x => (x <= 0 ? 0 : x >= 1 ? -Infinity : ibeta(x, a, b)[3]),
      start: p => { const mu = a / (a + b); return p < 0.5 ? min(mu, exp((log(p) + log(a) + lb) / a)) : max(mu, 1 - exp((log1p(-p) + log(b) + lb) / b)); },
      mean: a / (a + b), var: a * b / ((a + b) * (a + b) * (a + b + 1)), skew: 2 * (b - a) * sqrt(a + b + 1) / ((a + b + 2) * sqrt(a * b)),
      kurt: 6 * ((a - b) * (a - b) * (a + b + 1) - a * b * (a + b + 2)) / (a * b * (a + b + 2) * (a + b + 3)),
      mode0: a > 1 && b > 1 ? (a - 1) / (a + b - 2) : a <= 1 && b > 1 ? 0 : a > 1 && b <= 1 ? 1 : NaN,
      sample: r => { const x = rgamma(r, a), y = rgamma(r, b); return x / (x + y); },
    });
  }
  function tD(df) {
    const D = continuous({
      lo: -Infinity, hi: Infinity, lpdf: x => lntpdf(x, df), cdf: x => tcdf(x, df), sf: x => tsf(x, df), lsf: x => tlsf(x, df), lcdf: x => tlsf(-x, df),
      q: p => qt(p, df), isf: p => -qt(p, df), median: 0, mode0: 0,
      mean: df > 1 ? 0 : NaN, var: df > 2 ? df / (df - 2) : df > 1 ? Infinity : NaN, skew: df > 3 ? 0 : NaN, kurt: df > 4 ? 6 / (df - 4) : df > 2 ? Infinity : NaN,
      sample: r => { const z = qnorm(uOpen(r)); return df > 1e14 ? z : z / sqrt(2 * rgamma(r, df / 2) / df); },
      heavy: df <= 2,
    });
    return D;
  }
  function fD(d1, d2) {
    const B = betaD(d1 / 2, d2 / 2);
    const u = x => d1 * x / (d1 * x + d2), y = x => d2 / (d1 * x + d2);
    const mean = d2 > 2 ? d2 / (d2 - 2) : NaN;
    const lf = x => B.lpdf(u(x)) + log(d1 * d2) - 2 * log(d1 * x + d2);
    /* d2 > 1e5, above the mode: the upper tail by the density's integral (the t's case above; null = the incomplete beta) */
    const fq = x => {
      if (!(d2 > 1e5) || !(x > 0) || !fin(x)) return null;
      const dl = (d1 / 2 - 1) / x - (d1 + d2) / 2 * d1 / (d1 * x + d2);
      if (!(dl < 0)) return null;
      return lnTailQuad(lf, x, min(1 / -dl, x + 10));
    };
    return continuous({
      lo: 0, hi: Infinity,
      lpdf: x => (x < 0 ? -Infinity : B.lpdf(u(x)) + log(d1 * d2) - 2 * log(d1 * x + d2)),
      cdf: x => (x <= 0 ? 0 : ibeta(u(x), d1 / 2, d2 / 2, y(x))[0]), sf: x => (x <= 0 ? 1 : fq(x) !== null ? exp(fq(x)) : ibeta(u(x), d1 / 2, d2 / 2, y(x))[1]),
      lsf: x => (x <= 0 ? 0 : fq(x) !== null ? fq(x) : ibeta(u(x), d1 / 2, d2 / 2, y(x))[3]),
      start: () => (fin(mean) ? mean : 1),
      mean: d2 > 2 ? mean : d2 > 0 ? NaN : NaN,
      var: d2 > 4 ? 2 * d2 * d2 * (d1 + d2 - 2) / (d1 * (d2 - 2) * (d2 - 2) * (d2 - 4)) : d2 > 2 ? Infinity : NaN,
      skew: d2 > 6 ? (2 * d1 + d2 - 2) * sqrt(8 * (d2 - 4)) / ((d2 - 6) * sqrt(d1 * (d1 + d2 - 2))) : NaN,
      kurt: d2 > 8 ? 12 * (d1 * (5 * d2 - 22) * (d1 + d2 - 2) + (d2 - 4) * (d2 - 2) * (d2 - 2)) / (d1 * (d2 - 6) * (d2 - 8) * (d1 + d2 - 2)) : NaN,
      mode0: d1 > 2 ? (d1 - 2) / d1 * d2 / (d2 + 2) : 0,
      sample: r => (rgamma(r, d1 / 2) / d1) / (rgamma(r, d2 / 2) / d2),
    });
  }
  const gam = x => exp(lgamma(x));
  /** build the law of a distribution object, or null (issue "param") when its parameters are outside their ranges */
  function mkDist(o, R, I) {
    if (!isObj(o) || !has(DATA.families, o.family)) return null;
    const g = getter(R), P = k => g(o, k), bad = () => { I.add('param'); return null; }, isI = v => Number.isInteger(v);
    const D = mkDist0(o.family, P, isI, bad, o, R);
    if (D && D.degenerate) I.add('degenerate');
    return D;
  }
  function mkDist0(f, P, isI, bad, o, R) {
    const pos = v => v > 0 && v < Infinity, finv = v => fin(v), unit = v => v >= 0 && v <= 1;
    const dflt = (v, d) => (o[v] === undefined ? d : P(v));
    switch (f) {
      case 'bernoulli': { const p = P('p'); return unit(p) ? binomialD(1, p) : bad(); }
      case 'binomial': { const n = P('n'), p = P('p'); return isI(n) && n >= 0 && n <= 1e9 && unit(p) ? binomialD(n, p) : bad(); }
      case 'geometric': { const p = P('p'); return p > 0 && p <= 1 ? geometricD(p, o.trials === true) : bad(); }
      case 'negbinomial': { const r = P('r'), p = P('p'); return pos(r) && p > 0 && p <= 1 ? negbinomialD(r, p) : bad(); }
      case 'poisson': { const l = P('lambda'); return l >= 0 && l <= 1e9 ? poissonD(l) : bad(); }
      case 'hypergeometric': { const N = P('N'), K = P('K'), n = P('n'); return [N, K, n].every(v => isI(v) && v >= 0 && v <= 1e9) && K <= N && n <= N ? hyperD(N, K, n) : bad(); }
      case 'dunif': { const a = P('a'), b = P('b'); return isI(a) && isI(b) && b >= a && b - a <= 1e9 ? dunifD(a, b) : bad(); }
      case 'categorical': {
        const ps = Array.isArray(o.probs) ? o.probs.map(R) : null;
        const vs = Array.isArray(o.values) ? o.values : null;
        if (!ps || ps.some(v => !(v >= 0)) || (vs && vs.length !== ps.length)) return bad();
        return categoricalD(ps, vs) || bad();
      }
      case 'uniform': { const a = P('a'), b = P('b'); if (!(finv(a) && finv(b) && b > a)) return bad();
        return continuous({ lo: a, hi: b, lpdf: x => (x < a || x > b ? -Infinity : -log(b - a)), cdf: x => min(1, max(0, (x - a) / (b - a))), sf: x => min(1, max(0, (b - x) / (b - a))),
          q: p => (qok(p) ? a + p * (b - a) : NaN), isf: p => (qok(p) ? b - p * (b - a) : NaN), mean: (a + b) / 2, var: (b - a) * (b - a) / 12, skew: 0, kurt: -1.2, mode0: NaN, median: (a + b) / 2,
          sample: r => a + r() * (b - a) }); }
      case 'normal': { const mu = dflt('mu', 0), s = dflt('sigma', 1); return finv(mu) && pos(s) ? normalD(mu, s) : bad(); }
      case 'lognormal': { const mu = dflt('mu', 0), s = dflt('sigma', 1); if (!(finv(mu) && pos(s))) return bad();
        const N = normalD(mu, s), e2 = exp(s * s);
        return continuous({ lo: 0, hi: Infinity, lpdf: x => (x <= 0 ? -Infinity : N.lpdf(log(x)) - log(x)), cdf: x => (x <= 0 ? 0 : N.cdf(log(x))), sf: x => (x <= 0 ? 1 : N.sf(log(x))),
          lcdf: x => (x <= 0 ? -Infinity : N.lcdf(log(x))), lsf: x => (x <= 0 ? 0 : N.lsf(log(x))), q: p => exp(N.q(p)), isf: p => exp(N.isf(p)),
          mean: exp(mu + s * s / 2), var: (e2 - 1) * exp(2 * mu + s * s), skew: (e2 + 2) * sqrt(e2 - 1), kurt: e2 * e2 * e2 * e2 + 2 * e2 * e2 * e2 + 3 * e2 * e2 - 6,
          mode0: exp(mu - s * s), median: exp(mu), sample: r => exp(N.sample(r)) }); }
      case 'exponential': { const l = dflt('rate', 1); if (!pos(l)) return bad();
        return continuous({ lo: 0, hi: Infinity, lpdf: x => (x < 0 ? -Infinity : log(l) - l * x), cdf: x => (x <= 0 ? 0 : -expm1(-l * x)), sf: x => (x <= 0 ? 1 : exp(-l * x)),
          lsf: x => (x <= 0 ? 0 : -l * x), q: p => (qok(p) ? -log1p(-p) / l : NaN), isf: p => (qok(p) ? -log(p) / l : NaN),
          mean: 1 / l, var: 1 / (l * l), skew: 2, kurt: 6, mode0: 0, median: LN2 / l, sample: r => -log(uOpen(r)) / l }); }
      case 'gamma': { const k = P('shape'), th = o.scale !== undefined ? P('scale') : o.rate !== undefined ? 1 / P('rate') : 1; return pos(k) && pos(th) ? gammaD(k, th) : bad(); }
      case 'chi2': { const nu = P('df'); return pos(nu) ? gammaD(nu / 2, 2) : bad(); }
      case 'beta': { const a = P('a'), b = P('b'); return pos(a) && pos(b) ? betaD(a, b) : bad(); }
      case 't': { const nu = P('df'); return nu > 0 ? tD(nu) : bad(); }
      case 'f': { const d1 = P('d1'), d2 = P('d2'); return pos(d1) && pos(d2) ? fD(d1, d2) : bad(); }
      case 'cauchy': { const x0 = dflt('x0', 0), gm = dflt('gamma', 1); if (!(finv(x0) && pos(gm))) return bad();
        return continuous({ lo: -Infinity, hi: Infinity, lpdf: x => { const z = (x - x0) / gm; return -log(PI * gm) - log1p(z * z); },
          cdf: x => atan2(1, -(x - x0) / gm) / PI, sf: x => atan2(1, (x - x0) / gm) / PI,
          q: p => (!qok(p) ? NaN : p === 0.5 ? x0 : p < 0.5 ? x0 - gm / tan(PI * p) : x0 + gm / tan(PI * (1 - p))),
          isf: p => (!qok(p) ? NaN : p === 0.5 ? x0 : p < 0.5 ? x0 + gm / tan(PI * p) : x0 - gm / tan(PI * (1 - p))),
          mean: NaN, var: NaN, skew: NaN, kurt: NaN, mode0: x0, median: x0, heavy: true,
          sample: r => { const u = uOpen(r); return u === 0.5 ? x0 : u < 0.5 ? x0 - gm / tan(PI * u) : x0 + gm / tan(PI * (1 - u)); } }); }
      case 'weibull': { const k = P('shape'), l = dflt('scale', 1); if (!(pos(k) && pos(l))) return bad();
        const g1 = gam(1 + 1 / k), g2 = gam(1 + 2 / k), g3 = gam(1 + 3 / k), g4 = gam(1 + 4 / k);
        const mu = l * g1, v = l * l * (g2 - g1 * g1), sd = sqrt(v);
        return continuous({ lo: 0, hi: Infinity,
          lpdf: x => (x < 0 ? -Infinity : x === 0 ? (k < 1 ? Infinity : k === 1 ? -log(l) : -Infinity) : log(k / l) + (k - 1) * log(x / l) - pow(x / l, k)),
          cdf: x => (x <= 0 ? 0 : -expm1(-pow(x / l, k))), sf: x => (x <= 0 ? 1 : exp(-pow(x / l, k))), lsf: x => (x <= 0 ? 0 : -pow(x / l, k)),
          q: p => (qok(p) ? l * pow(-log1p(-p), 1 / k) : NaN), isf: p => (qok(p) ? l * pow(-log(p), 1 / k) : NaN),
          mean: mu, var: v, skew: (g3 * l * l * l - 3 * mu * v - mu * mu * mu) / (v * sd),
          kurt: (l * l * l * l * g4 - 4 * (g3 * l * l * l - 3 * mu * v - mu * mu * mu) * mu - 6 * mu * mu * v - mu * mu * mu * mu) / (v * v) - 3,
          mode0: k > 1 ? l * pow((k - 1) / k, 1 / k) : 0, median: l * pow(LN2, 1 / k), sample: r => l * pow(-log(uOpen(r)), 1 / k) }); }
      case 'laplace': { const mu = dflt('mu', 0), b = dflt('b', 1); if (!(finv(mu) && pos(b))) return bad();
        return continuous({ lo: -Infinity, hi: Infinity, lpdf: x => -log(2 * b) - abs(x - mu) / b,
          cdf: x => (x < mu ? 0.5 * exp((x - mu) / b) : 1 - 0.5 * exp(-(x - mu) / b)), sf: x => (x > mu ? 0.5 * exp(-(x - mu) / b) : 1 - 0.5 * exp((x - mu) / b)),
          q: p => (!qok(p) ? NaN : p < 0.5 ? mu + b * log(2 * p) : mu - b * log(2 * (1 - p))), isf: p => (!qok(p) ? NaN : p < 0.5 ? mu - b * log(2 * p) : mu + b * log(2 * (1 - p))),
          mean: mu, var: 2 * b * b, skew: 0, kurt: 3, mode0: mu, median: mu, sample: r => { const u = uOpen(r); return u < 0.5 ? mu + b * log(2 * u) : mu - b * log(2 * (1 - u)); } }); }
      case 'logistic': { const mu = dflt('mu', 0), s = dflt('s', 1); if (!(finv(mu) && pos(s))) return bad();
        const cdf = z => (z >= 0 ? 1 / (1 + exp(-z)) : exp(z) / (1 + exp(z)));
        return continuous({ lo: -Infinity, hi: Infinity, lpdf: x => { const z = abs((x - mu) / s); return -z - log(s) - 2 * log1p(exp(-z)); },
          cdf: x => cdf((x - mu) / s), sf: x => cdf((mu - x) / s),
          q: p => (qok(p) ? mu + s * (log(p) - log1p(-p)) : NaN), isf: p => (qok(p) ? mu + s * (log1p(-p) - log(p)) : NaN),
          mean: mu, var: s * s * PI * PI / 3, skew: 0, kurt: 1.2, mode0: mu, median: mu, sample: r => { const u = uOpen(r); return mu + s * (log(u) - log1p(-u)); } }); }
      case 'pareto': { const xm = dflt('xm', 1), al = P('alpha'); if (!(pos(xm) && pos(al))) return bad();
        return continuous({ lo: xm, hi: Infinity, lpdf: x => (x < xm ? -Infinity : log(al) + al * log(xm) - (al + 1) * log(x)),
          cdf: x => (x <= xm ? 0 : -expm1(al * log(xm / x))), sf: x => (x <= xm ? 1 : exp(al * log(xm / x))), lsf: x => (x <= xm ? 0 : al * log(xm / x)),
          q: p => (qok(p) ? xm * exp(-log1p(-p) / al) : NaN), isf: p => (qok(p) ? xm * exp(-log(p) / al) : NaN),
          mean: al > 1 ? al * xm / (al - 1) : Infinity, var: al > 2 ? xm * xm * al / ((al - 1) * (al - 1) * (al - 2)) : Infinity,
          skew: al > 3 ? 2 * (1 + al) / (al - 3) * sqrt((al - 2) / al) : NaN, kurt: al > 4 ? 6 * (al * al * al + al * al - 6 * al - 2) / (al * (al - 3) * (al - 4)) : NaN,
          mode0: xm, median: xm * pow(2, 1 / al), heavy: al <= 2, sample: r => xm * exp(-log(uOpen(r)) / al) }); }
      case 'gumbel': { const mu = dflt('mu', 0), be = dflt('beta', 1); if (!(finv(mu) && pos(be))) return bad();
        return continuous({ lo: -Infinity, hi: Infinity, lpdf: x => { const z = (x - mu) / be; return -log(be) - (z + exp(-z)); },
          cdf: x => exp(-exp(-(x - mu) / be)), sf: x => -expm1(-exp(-(x - mu) / be)), lcdf: x => -exp(-(x - mu) / be),
          q: p => (qok(p) ? mu - be * log(-log(p)) : NaN), isf: p => (qok(p) ? mu - be * log(-log1p(-p)) : NaN),
          mean: mu + be * EULER, var: PI * PI * be * be / 6, skew: 1.1395470994046487, kurt: 2.4, mode0: mu, median: mu - be * log(LN2),
          sample: r => mu - be * log(-log(uOpen(r))) }); }
      case 'triangular': { const a = P('a'), b = P('b'), c = P('c'); if (!(finv(a) && finv(b) && finv(c) && a <= c && c <= b && a < b)) return bad();
        const w = b - a, Fc = (c - a) / w, S2 = a * a + b * b + c * c - a * b - a * c - b * c;
        return continuous({ lo: a, hi: b,
          lpdf: x => log(x < a || x > b ? 0 : x < c ? 2 * (x - a) / (w * (c - a)) : x === c ? 2 / w : 2 * (b - x) / (w * (b - c))),
          cdf: x => (x <= a ? 0 : x >= b ? 1 : x <= c ? (x - a) * (x - a) / (w * (c - a)) : 1 - (b - x) * (b - x) / (w * (b - c))),
          sf: x => (x <= a ? 1 : x >= b ? 0 : x <= c ? 1 - (x - a) * (x - a) / (w * (c - a)) : (b - x) * (b - x) / (w * (b - c))),
          q: p => (!qok(p) ? NaN : p < Fc ? a + sqrt(p * w * (c - a)) : b - sqrt((1 - p) * w * (b - c))),
          isf: p => (!qok(p) ? NaN : p < 1 - Fc ? b - sqrt(p * w * (b - c)) : a + sqrt((1 - p) * w * (c - a))),
          mean: (a + b + c) / 3, var: S2 / 18, skew: Math.SQRT2 * (a + b - 2 * c) * (2 * a - b - c) * (a - 2 * b + c) / (5 * pow(S2, 1.5)), kurt: -0.6, mode0: c,
          sample: r => { const u = r(); return u < Fc ? a + sqrt(u * w * (c - a)) : b - sqrt((1 - u) * w * (b - c)); } }); }
      case 'rayleigh': { const s = dflt('sigma', 1); if (!pos(s)) return bad();
        return continuous({ lo: 0, hi: Infinity, lpdf: x => (x <= 0 ? -Infinity : log(x) - 2 * log(s) - x * x / (2 * s * s)),
          cdf: x => (x <= 0 ? 0 : -expm1(-x * x / (2 * s * s))), sf: x => (x <= 0 ? 1 : exp(-x * x / (2 * s * s))), lsf: x => (x <= 0 ? 0 : -x * x / (2 * s * s)),
          q: p => (qok(p) ? s * sqrt(-2 * log1p(-p)) : NaN), isf: p => (qok(p) ? s * sqrt(-2 * log(p)) : NaN),
          mean: s * sqrt(PI / 2), var: (4 - PI) / 2 * s * s, skew: 2 * sqrt(PI) * (PI - 3) / pow(4 - PI, 1.5), kurt: -(6 * PI * PI - 24 * PI + 16) / ((4 - PI) * (4 - PI)),
          mode0: s, median: s * sqrt(2 * LN2), sample: r => s * sqrt(-2 * log(uOpen(r))) }); }
    }
    return bad();
  }
  /** the moments with their issues: an undefined moment is NaN ("moment-undefined"), an infinite one Infinity ("moment-infinite") */
  function moment(D, k, I) {
    let v = D[k];
    if (k === 'mode' ) { v = D.nomode ? NaN : D.mode0; if (Number.isNaN(v)) I.add('moment-undefined'); return v; }
    if (k === 'median') return D.median !== undefined ? D.median : D.q(0.5);
    if (k === 'sd') { v = sqrt(D.var); k = 'var'; }
    if (D.degenerate && (k === 'skew' || k === 'kurt')) { I.add('moment-undefined'); return NaN; }
    if (Number.isNaN(v)) I.add('moment-undefined'); else if (v === Infinity) I.add('moment-infinite');
    return v;
  }

  /* ===================================================================================================================== */
  /* helpers of the modes                                                                                                   */
  /* ===================================================================================================================== */
  function sum(a) { let s = 0, c = 0; for (const v of a) { const t = s + v; c += abs(s) >= abs(v) ? (s - t) + v : (v - t) + s; s = t; } return s + c; }   // Neumaier (1974)
  function meanVar(a) {   // two passes
    const n = a.length; if (!n) return { n, mean: NaN, var: NaN };
    const mu = sum(a) / n; let ss = 0; for (const v of a) ss += (v - mu) * (v - mu);
    return { n, mean: mu, var: n > 1 ? ss / (n - 1) : NaN };
  }
  const sorted = a => Float64Array.from(a).sort();
  /** the sample quantile of sorted values, R type 7 (Hyndman & Fan 1996) */
  function quant(s, p) { const n = s.length; if (!n) return NaN; const h = (n - 1) * p, lo = floor(h), hi = min(n - 1, lo + 1); return s[lo] + (h - lo) * (s[hi] - s[lo]); }
  /** midranks (ties share the mean of their ranks) and the tie sizes */
  function ranks(a) {
    const idx = a.map((_, i) => i).sort((i, j) => a[i] - a[j] || i - j), r = new Array(a.length), ties = [];
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++;
      const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = rk;
      if (j > i) ties.push(j - i + 1);
      i = j + 1;
    }
    return { r, ties };
  }
  /** ≤ cap checkpoints 1 … n spaced evenly in log n (the convergence plots) */
  function checkpoints(n, cap) {
    const out = []; cap = cap || 2000;
    if (n <= cap) { for (let i = 1; i <= n; i++) out.push(i); return out; }
    let last = 0; for (let j = 0; j < cap; j++) { const v = Math.round(exp(log(n) * j / (cap - 1))); if (v > last) { out.push(v); last = v; } }
    if (last < n) out.push(n);
    return out;
  }
  /** a histogram of values on [lo, hi] with nb bins: centres, counts, densities (count / (n · width)) */
  function hist(vals, nb, lo, hi, nTot) {
    const w = (hi - lo) / nb, cnt = new Array(nb).fill(0);
    for (const v of vals) { if (!(v >= lo && v <= hi)) continue; let b = floor((v - lo) / w); if (b >= nb) b = nb - 1; cnt[b]++; }
    const n = nTot || vals.length;
    return { x: cnt.map((_, i) => lo + (i + 0.5) * w), count: cnt, dens: cnt.map(c => c / (n * w)) };
  }
  /** an automatic histogram: one bin per integer when the values are integers over ≤ 200 values; Freedman–Diaconis (1981) width
      2·IQR·n^(−1/3) otherwise (5–200 bins); heavy tails: the range of the central 99 % */
  function autoHist(vals, bins, heavy) {
    const s = sorted(vals), n = s.length;
    if (!n) return { x: [], count: [], dens: [] };
    let lo = s[0], hi = s[n - 1];
    if (!bins && s.every(v => v === floor(v)) && hi - lo <= 200) return hist(vals, hi - lo + 1, lo - 0.5, hi + 0.5, n);
    if (heavy) { lo = quant(s, 0.005); hi = quant(s, 0.995); }
    if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
    let nb = bins;
    if (!nb) { const iqr = quant(s, 0.75) - quant(s, 0.25), h = 2 * iqr * pow(n, -1 / 3); nb = h > 0 ? min(200, max(5, ceil((hi - lo) / h))) : 40; }
    return hist(vals, nb, lo, hi, n);
  }
  /** a p-value from the two tails of a statistic: two-sided = 2·min (capped at 1) */
  const pAlt = (alt, lo, up) => (alt === 'less' ? lo : alt === 'greater' ? up : min(1, 2 * min(lo, up)));
  const wilson = (k, n, z) => { const ph = k / n, z2 = z * z, d = 1 + z2 / n, c = (ph + z2 / (2 * n)) / d, h = z * sqrt(ph * (1 - ph) / n + z2 / (4 * n * n)) / d; return [k <= 0 ? 0 : max(0, c - h), k >= n ? 1 : min(1, c + h)]; };   // the ends exact at k = 0 and k = n
  function grid(a, b, n) { const out = []; for (let i = 0; i < n; i++) out.push(n === 1 ? a : a + (b - a) * i / (n - 1)); return out; }

  /* ===================================================================================================================== */
  /* dist — one distribution: values at x, P(lo ≤ X ≤ hi), quantiles, moments, approximations, plots                        */
  /* ===================================================================================================================== */
  function probIn(D, a, b) {   // P(a ≤ X ≤ b), from the tail that keeps the accuracy
    if (D.disc && !D.cat) { a = ceil(a); b = floor(b); if (a > b) return 0; const Fa = D.cdf(a - 1); return Fa > 0.5 ? max(0, D.sf(a - 1) - D.sf(b)) : max(0, D.cdf(b) - Fa); }
    if (D.cat) { let s = 0; for (const v of D.values) if (v >= a && v <= b) s += D.pdf(v); return min(1, s); }
    if (a > b) return 0;
    const Fa = D.cdf(a); return Fa > 0.5 ? max(0, D.sf(a) - D.sf(b)) : max(0, D.cdf(b) - Fa);
  }
  function runDist(m, R, I) {
    const g = getter(R), o = {}, sr = {};
    const D = mkDist(m.dist, R, I);
    if (!D) return { o, sr, sc: {} };
    for (const k of ['mean', 'var', 'sd', 'skew', 'kurt', 'median', 'mode']) o[k] = null;   // lazily (each may count an issue)
    const lazy = { mean: () => moment(D, 'mean', I), var: () => moment(D, 'var', I), sd: () => moment(D, 'sd', I), skew: () => moment(D, 'skew', I),
      kurt: () => moment(D, 'kurt', I), median: () => moment(D, 'median', I), mode: () => moment(D, 'mode', I) };
    o.supportLo = D.lo; o.supportHi = D.hi;
    const x = g(m, 'x');
    if (m.x !== undefined) {
      lazy.pdf = () => { const v = D.pdf(x); if (v === Infinity) I.add('pdf-infinite'); if (v === 0 && D.lpdf(x) > -Infinity) I.add('underflow'); return v; };
      lazy.logpdf = () => D.lpdf(x);
      lazy.cdf = () => { const v = D.cdf(x); if (v === 0 && D.lcdf(x) > -Infinity) I.add('underflow'); return v; };
      lazy.sf = () => { const v = D.sf(x); if (v === 0 && D.lsf(x) > -Infinity) I.add('underflow'); return v; };
      lazy.logcdf = () => D.lcdf(x); lazy.logsf = () => D.lsf(x);
    }
    const hasI = m.lo !== undefined || m.hi !== undefined;
    const a = m.lo !== undefined ? g(m, 'lo') : -Infinity, b = m.hi !== undefined ? g(m, 'hi') : hasI ? Infinity : x;
    if (hasI || m.x !== undefined) {
      lazy.prob = () => probIn(D, a, b);
      lazy.normApprox = () => {   // de Moivre–Laplace with the continuity correction for integer laws
        const mu = D.mean, s = sqrt(D.var), cc = D.disc && !D.cat ? 0.5 : 0;
        const aa = D.disc && !D.cat ? ceil(a) : a, bb = D.disc && !D.cat ? floor(b) : b;
        if (!(s > 0)) return NaN;
        return max(0, ncdf((bb + cc - mu) / s) - ncdf((aa - cc - mu) / s));
      };
      lazy.poissonApprox = () => (m.dist.family === 'binomial' || m.dist.family === 'bernoulli' ? probIn(poissonD(D.mean), a, b) : NaN);
    }
    if (m.p !== undefined) lazy.quantile = () => D.q(g(m, 'p'));
    if (m.pu !== undefined) lazy.isf = () => D.isf(g(m, 'pu'));
    /* the plotted grid: every integer (≤ 2000) for integer laws, `points` values (default 201) otherwise */
    sr.lazy = () => {
      let xs;
      const lo = m.from !== undefined ? g(m, 'from') : NaN, hi = m.to !== undefined ? g(m, 'to') : NaN;
      if (D.cat) xs = D.values.slice();
      else if (D.disc) {
        const a0 = fin(lo) ? ceil(lo) : D.q(0.0005), b0 = fin(hi) ? floor(hi) : D.isf(0.0005);
        xs = []; if (fin(a0) && fin(b0)) { const st = max(1, ceil((b0 - a0 + 1) / 2000)); for (let k = a0; k <= b0 && xs.length < 2000; k += st) xs.push(k); }
      } else {
        const a0 = fin(lo) ? lo : D.q(0.001), b0 = fin(hi) ? hi : D.isf(0.001), np = m.points || 201;
        xs = fin(a0) && fin(b0) && b0 > a0 ? grid(a0, b0, np) : [];
      }
      const pdf = xs.map(v => { const y = D.pdf(v); if (y === Infinity) { I.add('pdf-infinite'); return NaN; } return y; });
      const mu = D.mean, s = sqrt(D.var);
      return { x: xs, pdf, cdf: xs.map(v => D.cdf(v)), area: xs.map((v, i) => (v >= a && v <= b ? pdf[i] : 0)), normal: xs.map(v => (s > 0 && fin(mu) ? npdf((v - mu) / s) / s : NaN)) };
    };
    return { o, sr, sc: {}, lazy };
  }

  /* ===================================================================================================================== */
  /* mc — Monte Carlo of an expression over seeded draws (Welford 1962 running moments; Wilson's interval for an event —     */
  /* never Wald, whose interval collapses at 0 hits; Brown, Cai & DasGupta 2001)                                            */
  /* ===================================================================================================================== */
  function runMC(m, R, I, env, prepared, seed, want) {
    const g = getter(R), o = {}, sr = {};
    const names = Object.keys(m.draws), Ds = names.map(k => mkDist(m.draws[k], R, I));
    const n = g(m, 'n', 10000), conf = g(m, 'conf', 0.95);
    if (Ds.some(d => !d) || !(Number.isInteger(n) && n >= 1 && n <= 200000) || !(conf > 0 && conf < 1)) { I.add('param'); return { o, sr, sc: {} }; }
    const f = (prepared && prepared.fns.get(m.expr)) || C.cx(m.expr), E = Object.assign({}, env);
    const r = C.mulberry32(C.hash32('prob:mc', seed)), z = qnorm(0.5 + conf / 2);
    const vals = new Float64Array(n); let cnt = 0, nan = 0, M = 0, S = 0, ind = true;
    const ck = checkpoints(n), runN = [], runMean = [], runLo = [], runHi = []; let ci = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < names.length; j++) E[names[j]] = Ds[j].sample(r);
      const v = f(E);
      if (!fin(v)) nan++;
      else { vals[cnt++] = v; const d = v - M; M += d / cnt; S += d * (v - M); if (v !== 0 && v !== 1) ind = false; }
      if (i === ck[ci]) { ci++; if (cnt) { runN.push(i); runMean.push(M); const h = cnt > 1 ? z * sqrt(S / (cnt - 1) / cnt) : NaN; runLo.push(M - h); runHi.push(M + h); } }
    }
    if (BUDGET < 0) { return { o, sr, sc: {} }; }
    const V = vals.subarray(0, cnt);
    o.n = cnt; o.nanFrac = nan / n; if (nan) I.add('nan-draws', nan);
    if (cnt < 30) I.add('few-samples');
    o.indicator = ind && cnt > 0 ? 1 : 0;
    if (ind && cnt) {
      const k = Math.round(M * cnt); o.estimate = k / cnt; o.sd = sqrt(o.estimate * (1 - o.estimate)); o.se = o.sd / sqrt(cnt);
      [o.ciLo, o.ciHi] = wilson(k, cnt, z);
      if (k < 10 || cnt - k < 10) I.add('rare-event');   // the rule of three: 0 hits in n → p < 3/n at 95 %
    } else {
      o.estimate = M; o.sd = cnt > 1 ? sqrt(S / (cnt - 1)) : NaN; o.se = o.sd / sqrt(cnt); o.ciLo = M - z * o.se; o.ciHi = M + z * o.se;
      if (Ds.some(d => d.heavy)) I.add('infinite-variance');
    }
    if (m.exact !== undefined) { const ex = g(m, 'exact'); o.err = o.estimate - ex; o.covered = ex >= o.ciLo && ex <= o.ciHi ? 1 : 0; }
    Object.assign(sr, { runN, runMean, runLo, runHi });
    if (!want || want.has('histX') || want.has('histDensity') || want.has('exactDensity')) {
      const h = autoHist(V, m.bins, Ds.some(d => d.heavy));
      sr.histX = h.x; sr.histDensity = h.dens;
      const single = names.indexOf(m.expr.trim());
      sr.exactDensity = single >= 0 ? h.x.map(x => Ds[single].pdf(Ds[single].disc ? Math.round(x) : x)) : [];
    }
    return { o, sr, sc: {} };
  }

  /* ===================================================================================================================== */
  /* sampling — the sampling distribution of a statistic: CLT (de Moivre 1733, Laplace 1810, Lindeberg 1922; Berry–Esseen    */
  /* rate n^−½) and LLN; Cauchy and Pareto α ≤ 2 show their failure (no mean / infinite variance)                           */
  /* ===================================================================================================================== */
  function runSampling(m, R, I, seed) {
    const g = getter(R), o = {}, sr = {};
    const D = mkDist(m.parent, R, I), n = g(m, 'size'), reps = g(m, 'reps', 1000), stat = m.stat || 'mean';
    if (!D || !(Number.isInteger(n) && n >= 1 && n <= 10000) || !(Number.isInteger(reps) && reps >= 1 && reps <= 10000)) { I.add('param'); return { o, sr, sc: {} }; }
    if (n * reps > 1e6) { I.add('budget'); return { o, sr, sc: {} }; }
    const r = C.mulberry32(C.hash32('prob:sampling', seed)), buf = new Float64Array(n), st = new Float64Array(reps);
    const ck = checkpoints(n * reps); let ci = 0, tot = 0, run = 0; const runN = [], runMean = [];
    for (let k = 0; k < reps; k++) {
      for (let i = 0; i < n; i++) {
        const v = D.sample(r); buf[i] = v; tot++; run += (v - run) / tot;
        if (tot === ck[ci]) { ci++; runN.push(tot); runMean.push(run); }
      }
      let v;
      if (stat === 'mean' || stat === 'sum') { v = sum(buf); if (stat === 'mean') v /= n; }
      else if (stat === 'var' || stat === 'sd') { v = meanVar(buf).var; if (stat === 'sd') v = sqrt(v); }
      else if (stat === 'median') v = quant(sorted(buf), 0.5);
      else if (stat === 'min') { v = Infinity; for (const x of buf) v = min(v, x); }
      else { v = -Infinity; for (const x of buf) v = max(v, x); }
      st[k] = v;
    }
    if (BUDGET < 0) return { o, sr, sc: {} };
    const mu = D.mean, s2 = D.var, s = sqrt(s2), ku = D.kurt;
    if (Number.isNaN(mu)) I.add('no-mean');
    if (!(s2 < Infinity)) I.add('infinite-variance');
    let tm = NaN, ts = NaN;
    if (stat === 'mean') { tm = mu; ts = s / sqrt(n); }
    else if (stat === 'sum') { tm = n * mu; ts = s * sqrt(n); }
    else if (stat === 'var') { tm = s2; ts = n > 1 ? s2 * sqrt(2 / (n - 1) + ku / n) : NaN; }   // Var(s²) = σ⁴ (2/(n−1) + κ/n)
    else if (stat === 'sd') { tm = s; ts = n > 1 ? s / 2 * sqrt(2 / (n - 1) + ku / n) : NaN; }   // the delta method
    else if (stat === 'median') { const md = D.median !== undefined ? D.median : D.q(0.5); tm = md; ts = 1 / (2 * D.pdf(md) * sqrt(n)); }   // Laplace's asymptotic
    const mv = meanVar(st);
    o.statMean = mv.mean; o.statSd = sqrt(mv.var); o.theoMean = tm; o.theoSe = ts; o.ratio = o.statSd / ts;
    let m3 = 0; for (const v of st) m3 += pow((v - mv.mean) / o.statSd, 3); o.skewStat = m3 / reps;
    const ss = sorted(st); let ks = NaN;
    if (fin(tm) && ts > 0 && ts < Infinity) { ks = 0; for (let i = 0; i < reps; i++) { const F = ncdf((ss[i] - tm) / ts); ks = max(ks, abs((i + 1) / reps - F), abs(F - i / reps)); } }
    o.ks = ks;   // sup |F_reps − Φ|: the distance of the standardised statistic to the normal
    const h = autoHist(st, m.bins || 40, !(s2 < Infinity));
    sr.histX = h.x; sr.histDensity = h.dens;
    sr.normalDensity = h.x.map(x => (fin(tm) && ts > 0 && ts < Infinity ? npdf((x - tm) / ts) / ts : NaN));
    sr.runN = runN; sr.runMean = runMean;
    return { o, sr, sc: {} };
  }

  /* ===================================================================================================================== */
  /* test — hypothesis tests (alternatives two-sided, less, greater; α default 0.05; reject when p ≤ α)                     */
  /* ===================================================================================================================== */
  /** a location test with a z (df = ∞) or t reference: statistic, p, critical value, the interval at 1 − α (one-sided bounds for one-sided alternatives) */
  function locTest(o, sr, est, se, df, alt, alpha, null0, I) {
    const z = df === Infinity, cdf = x => (z ? ncdf(x) : tcdf(x, df)), sf = x => (z ? ncdf(-x) : tsf(x, df)), qu = p => (z ? -qnorm(p) : -qt(p, df));   // qu(p): upper-p point
    if (!(se > 0)) I.add('zero-variance');
    const t = (est - null0) / se;
    o.stat = t; o.df = z ? NaN : df; o.se = se; o.estimate = est;
    o.p = Number.isNaN(t) ? NaN : pAlt(alt, cdf(t), sf(t));
    if (alt === 'two-sided') { const c = qu(alpha / 2); o.crit = c; o.ciLo = est - c * se; o.ciHi = est + c * se; }
    else if (alt === 'less') { const c = qu(alpha); o.crit = -c; o.ciLo = -Infinity; o.ciHi = est + c * se; }
    else { const c = qu(alpha); o.crit = c; o.ciLo = est - c * se; o.ciHi = Infinity; }
    sr.lazy = () => { const L = min(60, max(4, 1.2 * abs(t) || 4)), xs = grid(-L, L, 201); return { nullX: xs, nullPdf: xs.map(x => (z ? npdf(x) : exp(lntpdf(x, df)))) }; };
  }
  /** the exact two-sided binomial p-value by the likelihood rule: Σ over k with pmf ≤ pmf(x)(1 + 10⁻⁷) (R binom.test) */
  function binomP(x, n, p0, alt) {
    const B = binomialD(n, p0);
    if (alt === 'less') return B.cdf(x);
    if (alt === 'greater') return B.sf(x - 1);
    const d = B.pdf(x), m = n * p0, rel = 1 + 1e-7;
    if (x === m) return 1;
    let y = 0;
    if (x < m) { for (let i = ceil(m); i <= n; i++) if (B.pdf(i) <= d * rel) y++; return min(1, B.cdf(x) + B.sf(n - y)); }
    for (let i = 0; i <= floor(m); i++) if (B.pdf(i) <= d * rel) y++;
    return min(1, B.cdf(y - 1) + B.sf(x - 1));
  }
  /** Clopper & Pearson (1934): [B(α/2; k, n−k+1), B(1−α/2; k+1, n−k)]; k = 0 → 0, k = n → 1; one-sided bounds at α */
  function clopper(k, n, alpha, alt) {
    const lo = a => (k === 0 ? 0 : betaD(k, n - k + 1).q(a)), hi = a => (k === n ? 1 : betaD(k + 1, n - k).isf(a));
    if (alt === 'less') return [0, hi(alpha)];
    if (alt === 'greater') return [lo(alpha), 1];
    return [lo(alpha / 2), hi(alpha / 2)];
  }
  function exactU(n1, n2) {   // P(U = u) for the Mann–Whitney U without ties: f_{i,j}(u) = f_{i−1,j}(u − j) + f_{i,j−1}(u) (Mann & Whitney 1947)
    const U = n1 * n2, f = []; for (let i = 0; i <= n1; i++) { f.push(new Float64Array(U + 1)); f[i][0] = 1; }
    for (let j = 1; j <= n2; j++) for (let i = 1; i <= n1; i++) { const fi = f[i], fp = f[i - 1]; for (let u = U; u >= j; u--) fi[u] += fp[u - j]; }
    const t = f[n1]; let s = 0; for (const v of t) s += v; return t.map(v => v / s);
  }
  function exactW(n) {   // P(V = v) for the Wilcoxon signed-rank V without ties: the coefficients of Π (1 + q^i)
    const S = n * (n + 1) / 2, c = new Float64Array(S + 1); c[0] = 1;
    for (let i = 1; i <= n; i++) for (let s = S; s >= i; s--) c[s] += c[s - i];
    const tot = pow(2, n); return c.map(v => v / tot);
  }
  const tails = (P, v) => { let lo = 0, up = 0; for (let i = 0; i < P.length; i++) { if (i <= v + 1e-9) lo += P[i]; if (i >= v - 1e-9) up += P[i]; } return [min(1, lo), min(1, up)]; };
  function runTest(m, R, I) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} };
    const kind = m.kind, alpha = g(m, 'alpha', 0.05), alt = m.alt || 'two-sided', mu0 = g(m, 'mu0', 0);
    if (!(alpha > 0 && alpha < 1)) { I.add('param'); return out; }
    const L = a => (Array.isArray(a) ? a.map(R) : null);
    const X = L(m.x), Y = L(m.y);
    if ((X && X.some(v => !fin(v))) || (Y && Y.some(v => !fin(v)))) { I.add('bad-data'); return out; }
    const S = isObj(m.summary) ? { mean: g(m.summary, 'mean'), sd: g(m.summary, 'sd'), n: g(m.summary, 'n'), mean2: g(m.summary, 'mean2'), sd2: g(m.summary, 'sd2'), n2: g(m.summary, 'n2') } : null;
    const one = () => { if (X) { const v = meanVar(X); return { mean: v.mean, sd: sqrt(v.var), n: v.n }; } return S; };
    const two = () => { if (X && Y) { const a = meanVar(X), b = meanVar(Y); return [{ mean: a.mean, sd: sqrt(a.var), n: a.n }, { mean: b.mean, sd: sqrt(b.var), n: b.n }]; } return S ? [{ mean: S.mean, sd: S.sd, n: S.n }, { mean: S.mean2, sd: S.sd2, n: S.n2 }] : null; };
    const done = () => { if (fin(o.p)) o.reject = o.p <= alpha ? 1 : 0; return out; };
    const intOk = v => Number.isInteger(v) && v >= 0;
    switch (kind) {
      case 'z-one': case 't-one': case 't-paired': {
        let s = kind === 't-paired' ? null : one();
        if (kind === 't-paired') { const d = X.map((v, i) => v - Y[i]), v = meanVar(d); s = { mean: v.mean, sd: sqrt(v.var), n: v.n }; }
        if (!s || !(s.n >= 1)) { I.add('param'); return out; }
        o.n = s.n;
        if (kind === 'z-one') { const sg = g(m, 'sigma'); if (!(sg > 0)) { I.add('param'); return out; } locTest(o, sr, s.mean, sg / sqrt(s.n), Infinity, alt, alpha, mu0, I); o.effect = (s.mean - mu0) / sg; }
        else { if (s.n < 2) { I.add('few-data'); return out; } locTest(o, sr, s.mean, s.sd / sqrt(s.n), s.n - 1, alt, alpha, mu0, I); o.effect = (s.mean - mu0) / s.sd; }
        return done();
      }
      case 't-welch': case 't-pooled': {
        const s = two(); if (!s || !(s[0].n >= 2 && s[1].n >= 2)) { I.add(s ? 'few-data' : 'param'); return out; }
        const [a, b] = s, v1 = a.sd * a.sd / a.n, v2 = b.sd * b.sd / b.n;
        o.n = a.n + b.n;
        if (kind === 't-welch') {   // Welch (1947), Satterthwaite (1946) degrees of freedom
          const se = sqrt(v1 + v2), df = (v1 + v2) * (v1 + v2) / (v1 * v1 / (a.n - 1) + v2 * v2 / (b.n - 1));
          locTest(o, sr, a.mean - b.mean, se, df, alt, alpha, mu0, I); o.effect = (a.mean - b.mean) / sqrt((a.sd * a.sd + b.sd * b.sd) / 2);
        } else {
          const sp = sqrt(((a.n - 1) * a.sd * a.sd + (b.n - 1) * b.sd * b.sd) / (a.n + b.n - 2));
          locTest(o, sr, a.mean - b.mean, sp * sqrt(1 / a.n + 1 / b.n), a.n + b.n - 2, alt, alpha, mu0, I); o.effect = (a.mean - b.mean) / sp;   // Cohen's d
        }
        return done();
      }
      case 'prop-one': {   // the score test (R prop.test); Yates' correction min(½, |k − n p0|) when correct
        const k = g(m, 'k'), n = g(m, 'n'), p0 = g(m, 'p0', 0.5);
        if (!(intOk(k) && intOk(n) && k <= n && n > 0 && p0 > 0 && p0 < 1)) { I.add('param'); return out; }
        const d = k - n * p0, yc = m.correct ? min(0.5, abs(d)) : 0, se = sqrt(n * p0 * (1 - p0));
        const zz = Math.sign(d) * (abs(d) - yc) / se;
        o.stat = zz; o.estimate = k / n; o.se = se / n; o.n = n; o.p = pAlt(alt, ncdf(zz), ncdf(-zz));
        const zc = -qnorm(alt === 'two-sided' ? alpha / 2 : alpha); o.crit = alt === 'less' ? -zc : zc;
        const w = wilson(k, n, zc); o.ciLo = alt === 'less' ? 0 : w[0]; o.ciHi = alt === 'greater' ? 1 : w[1];
        o.effect = 2 * asin(sqrt(k / n)) - 2 * asin(sqrt(p0));   // Cohen's h
        sr.lazy = () => { const xs = grid(-4, 4, 201); return { nullX: xs, nullPdf: xs.map(npdf) }; };
        return done();
      }
      case 'prop-two': {   // pooled z for the test, unpooled Wald for the interval (with R's Yates term when correct)
        const k1 = g(m, 'k'), n1 = g(m, 'n'), k2 = g(m, 'k2'), n2 = g(m, 'n2');
        if (![k1, n1, k2, n2].every(intOk) || k1 > n1 || k2 > n2 || !(n1 > 0 && n2 > 0)) { I.add('param'); return out; }
        const p1 = k1 / n1, p2 = k2 / n2, pp = (k1 + k2) / (n1 + n2), dd = p1 - p2, h = 1 / n1 + 1 / n2;
        const yc = m.correct ? min(0.5, abs(dd) / h) : 0, se0 = sqrt(pp * (1 - pp) * h);
        if (!(se0 > 0)) I.add('zero-variance');
        const zz = Math.sign(dd) * max(0, abs(dd) - yc * h) / se0;
        o.stat = zz; o.estimate = dd; o.n = n1 + n2; o.p = pAlt(alt, ncdf(zz), ncdf(-zz)); o.se = sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
        const zc = -qnorm(alt === 'two-sided' ? alpha / 2 : alpha), w = zc * o.se + yc * h; o.crit = alt === 'less' ? -zc : zc;
        o.ciLo = alt === 'less' ? -1 : max(-1, dd - w); o.ciHi = alt === 'greater' ? 1 : min(1, dd + w);
        o.effect = 2 * asin(sqrt(p1)) - 2 * asin(sqrt(p2));
        sr.lazy = () => { const xs = grid(-4, 4, 201); return { nullX: xs, nullPdf: xs.map(npdf) }; };
        return done();
      }
      case 'binom-exact': case 'sign': {
        let k, n, p0 = g(m, 'p0', 0.5);
        if (kind === 'sign') {
          const d = X.map(v => v - mu0).filter(v => v !== 0); if (d.length < X.length) I.add('zero-diffs');
          k = d.filter(v => v > 0).length; n = d.length; p0 = 0.5; o.estimate = quant(sorted(X), 0.5);
        } else { k = g(m, 'k'); n = g(m, 'n'); }
        if (!(intOk(k) && intOk(n) && k <= n && n <= 1e7 && p0 > 0 && p0 < 1)) { I.add('param'); return out; }
        if (n === 0) { I.add('few-data'); return out; }
        o.stat = k; o.n = n; if (kind !== 'sign') o.estimate = k / n;
        o.p = binomP(k, n, p0, alt);
        [o.ciLo, o.ciHi] = clopper(k, n, alpha, alt);
        if (n <= 2000) sr.lazy = () => { const B = binomialD(n, p0), xs = grid(0, n, n + 1); return { nullX: xs, nullPdf: xs.map(B.pdf) }; };
        return done();
      }
      case 'chi2-gof': case 'chi2-indep': case 'g-test': {
        let O, E, df;
        if (Array.isArray(m.table)) {
          const T = m.table.map(r => r.map(R)), rs = T.map(r => sum(r)), cs = T[0].map((_, j) => sum(T.map(r => r[j]))), N = sum(rs);
          if (T.some(r => r.some(v => !(v >= 0))) || !(N > 0) || rs.some(v => !(v > 0)) || cs.some(v => !(v > 0))) { I.add('bad-data'); return out; }
          O = []; E = []; T.forEach((r, i) => r.forEach((v, j) => { O.push(v); E.push(rs[i] * cs[j] / N); }));
          df = (T.length - 1) * (T[0].length - 1);
          o.n = N;
          const cv = () => sqrt(o.stat / (N * (min(T.length, T[0].length) - 1)));   // Cramér's V
          o._v = cv;
        } else {
          O = m.observed.map(R); const pr = m.probs.map(R), tp = sum(pr), N = sum(O);
          if (O.some(v => !(v >= 0)) || pr.some(v => !(v > 0)) || !(N > 0)) { I.add('bad-data'); return out; }
          E = pr.map(p => N * p / tp); df = O.length - 1 - (m.ddof !== undefined ? g(m, 'ddof') : 0); o.n = N;
          o._v = () => sqrt(o.stat / N);   // Cohen's w
        }
        const low = E.filter(e => e < 5).length; if (low) I.add('low-expected', low);   // Cochran (1954)
        let st = 0;
        if (kind === 'g-test') for (let i = 0; i < O.length; i++) st += O[i] > 0 ? 2 * O[i] * log(O[i] / E[i]) : 0;   // Woolf (1957), Sokal & Rohlf
        else {
          const yc = m.correct && df === 1 && Array.isArray(m.table) ? min(0.5, ...O.map((v, i) => abs(v - E[i]))) : 0;   // Yates (1934), as R chisq.test
          for (let i = 0; i < O.length; i++) { const d = abs(O[i] - E[i]) - yc; st += d * d / E[i]; }
        }
        if (!(df >= 1)) { I.add('few-data'); return out; }
        o.stat = st; o.df = df; o.p = gammaPQ(df / 2, st / 2)[1]; o.crit = gammaD(df / 2, 2).isf(alpha); o.effect = o._v(); delete o._v;
        sr.lazy = () => { const C2 = gammaD(df / 2, 2), xs = grid(0, max(C2.isf(0.001), 1.2 * st), 201); return { nullX: xs, nullPdf: xs.map(x => { const y = C2.pdf(x); return fin(y) ? y : NaN; }) }; };
        return done();
      }
      case 'fisher': {   // Fisher (1935): the hypergeometric law of a given the margins; two-sided by the likelihood rule (R fisher.test)
        const T = m.table.map(r => r.map(R)), [[a, b], [c, d]] = T;
        if (!T.every(r => r.every(intOk))) { I.add('bad-data'); return out; }
        const N = a + b + c + d, H = hyperD(N, a + c, a + b);
        if (H.hi - H.lo > 1e6) { I.add('param'); return out; }
        o.stat = a; o.n = N;
        if (alt === 'less') o.p = H.cdf(a); else if (alt === 'greater') o.p = H.sf(a - 1);
        else { const pa = H.pdf(a) * (1 + 1e-7); let s = 0; for (let j = H.lo; j <= H.hi; j++) { const pj = H.pdf(j); if (pj <= pa) s += pj; } o.p = min(1, s); }
        const z0 = [a, b, c, d].some(v => v === 0); if (z0) I.add('zero-cell');
        const h = z0 ? 0.5 : 0, A = a + h, Bb = b + h, Cc = c + h, Dd = d + h;   // Haldane (1956) – Anscombe (1956) for the interval
        o.estimate = (a * d) / (b * c); o.se = sqrt(1 / A + 1 / Bb + 1 / Cc + 1 / Dd);   // Woolf (1955)
        const lor = log(A * Dd / (Bb * Cc)), zc = -qnorm(alt === 'two-sided' ? alpha / 2 : alpha);
        o.ciLo = alt === 'less' ? 0 : exp(lor - zc * o.se); o.ciHi = alt === 'greater' ? Infinity : exp(lor + zc * o.se); o.effect = lor;
        sr.lazy = () => { const xs = grid(H.lo, H.hi, min(2001, H.hi - H.lo + 1)).map(Math.round); return { nullX: xs, nullPdf: xs.map(H.pdf) }; };
        return done();
      }
      case 'mcnemar': {   // McNemar (1947): the discordant pairs b, c; exact binomial (default) or χ² with the continuity correction
        const T = m.table.map(r => r.map(R)), b = T[0][1], c = T[1][0];
        if (!T.every(r => r.every(intOk))) { I.add('bad-data'); return out; }
        const n = b + c; o.n = T[0][0] + b + c + T[1][1]; o.estimate = b / c; o.df = 1;
        if (n === 0) { I.add('few-data'); return out; }
        const cc = m.correct === false ? 0 : 1, dd = max(0, abs(b - c) - cc); o.stat = dd * dd / n;
        o.p = m.exact === false ? gammaPQ(0.5, o.stat / 2)[1] : binomP(b, n, 0.5, alt);
        o.crit = gammaD(0.5, 2).isf(alpha);
        return done();
      }
      case 'f-var': {
        const s = two(); if (!s || !(s[0].n >= 2 && s[1].n >= 2)) { I.add(s ? 'few-data' : 'param'); return out; }
        const r0 = g(m, 'ratio0', 1), d1 = s[0].n - 1, d2 = s[1].n - 1, est = s[0].sd * s[0].sd / (s[1].sd * s[1].sd), F = est / r0, FD = fD(d1, d2);
        if (!(s[1].sd > 0)) I.add('zero-variance');
        o.stat = F; o.df = d1; o.df2 = d2; o.estimate = est; o.n = s[0].n + s[1].n;
        o.p = pAlt(alt, FD.cdf(F), FD.sf(F));
        if (alt === 'two-sided') { o.crit = FD.isf(alpha / 2); o.ciLo = est / FD.isf(alpha / 2); o.ciHi = est / FD.q(alpha / 2); }
        else if (alt === 'less') { o.crit = FD.q(alpha); o.ciLo = 0; o.ciHi = est / FD.q(alpha); }
        else { o.crit = FD.isf(alpha); o.ciLo = est / FD.isf(alpha); o.ciHi = Infinity; }
        sr.lazy = () => { const xs = grid(0, max(FD.isf(0.002), 1.2 * F), 201); return { nullX: xs, nullPdf: xs.map(x => { const y = FD.pdf(x); return fin(y) ? y : NaN; }) }; };
        return done();
      }
      case 'anova': {   // one-way ANOVA (Fisher 1925): F = MSB / MSW, η² = SSB / SST
        const G = m.groups.map(L); if (G.some(a => a.some(v => !fin(v)))) { I.add('bad-data'); return out; }
        const k = G.length, N = G.reduce((s, a) => s + a.length, 0), all = [].concat(...G), gm = sum(all) / N;
        if (G.some(a => !a.length) || N <= k) { I.add('few-data'); return out; }
        let ssb = 0, ssw = 0; for (const a of G) { const v = meanVar(a); ssb += a.length * (v.mean - gm) * (v.mean - gm); for (const x of a) ssw += (x - v.mean) * (x - v.mean); }
        if (!(ssw > 0)) I.add('zero-variance');
        const d1 = k - 1, d2 = N - k, F = (ssb / d1) / (ssw / d2), FD = fD(d1, d2);
        o.stat = F; o.df = d1; o.df2 = d2; o.p = FD.sf(F); o.crit = FD.isf(alpha); o.effect = ssb / (ssb + ssw); o.n = N;
        sr.lazy = () => { const xs = grid(0, max(FD.isf(0.002), 1.2 * (fin(F) ? F : 0)), 201); return { nullX: xs, nullPdf: xs.map(x => { const y = FD.pdf(x); return fin(y) ? y : NaN; }) }; };
        return done();
      }
      case 'pearson': case 'regression': {
        const n = X.length; if (n < 3) { I.add('few-data'); return out; }
        const mx = sum(X) / n, my = sum(Y) / n; let sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < n; i++) { const dx = X[i] - mx, dy = Y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        if (!(sxx > 0)) { I.add('zero-variance'); return out; }
        const r = sxy / sqrt(sxx * syy); o.n = n; o.r2 = r * r;
        if (kind === 'pearson') {   // t with n − 2 df; Fisher's z interval (Fisher 1915, 1921)
          if (!(syy > 0)) { I.add('zero-variance'); return out; }
          const t = r * sqrt((n - 2) / (1 - r * r)); o.stat = t; o.df = n - 2; o.estimate = r; o.effect = r;
          o.p = pAlt(alt, tcdf(t, n - 2), tsf(t, n - 2)); o.crit = -qt(alt === 'two-sided' ? alpha / 2 : alpha, n - 2);
          if (n > 3) { const zr = 0.5 * log((1 + r) / (1 - r)), se = 1 / sqrt(n - 3), zc = -qnorm(alt === 'two-sided' ? alpha / 2 : alpha); o.se = se;
            o.ciLo = alt === 'less' ? -1 : tanh(zr - zc * se); o.ciHi = alt === 'greater' ? 1 : tanh(zr + zc * se); }
        } else {   // least squares: slope b = Sxy / Sxx, se = s / √Sxx, s² = SSE / (n − 2)
          const b = sxy / sxx, a0 = my - b * mx; let sse = 0; for (let i = 0; i < n; i++) { const e = Y[i] - a0 - b * X[i]; sse += e * e; }
          const se = sqrt(sse / (n - 2) / sxx); o.intercept = a0; o.effect = r;
          locTest(o, sr, b, se, n - 2, alt, alpha, mu0, I); o.n = n;
          const idx = X.map((_, i) => i).sort((i, j) => X[i] - X[j] || i - j);
          const prev = sr.lazy; sr.lazy = () => Object.assign(prev(), { dataX: idx.map(i => X[i]), dataY: idx.map(i => Y[i]), fitY: idx.map(i => a0 + b * X[i]) });
        }
        return done();
      }
      case 'mann-whitney': {   // Mann & Whitney (1947), Wilcoxon (1945) rank sum: exact without ties for n1, n2 ≤ 50; normal with tie and continuity corrections otherwise
        const n1 = X.length, n2 = Y.length; if (!n1 || !n2) { I.add('few-data'); return out; }
        const { r, ties } = ranks(X.concat(Y)); let R1 = 0; for (let i = 0; i < n1; i++) R1 += r[i];
        const U = R1 - n1 * (n1 + 1) / 2, N = n1 + n2; o.stat = U; o.n = N; o.effect = U / (n1 * n2); o.estimate = U / (n1 * n2);
        if (!ties.length && n1 <= 50 && n2 <= 50 && m.exact !== false) { const [lo, up] = tails(exactU(n1, n2), U); o.p = pAlt(alt, lo, up); }
        else {
          if (ties.length) I.add('ties-approx');
          const mu = n1 * n2 / 2, tc = ties.reduce((s, t) => s + t * t * t - t, 0), sd = sqrt(n1 * n2 / 12 * ((N + 1) - tc / (N * (N - 1))));
          if (!(sd > 0)) { I.add('zero-variance'); return out; }
          const cc = m.correct === false ? 0 : 0.5;
          const zl = (U - mu + cc) / sd, zu = (U - mu - cc) / sd;
          o.p = alt === 'less' ? ncdf(zl) : alt === 'greater' ? ncdf(-zu) : min(1, 2 * ncdf(-max(0, abs(U - mu) - cc) / sd));
        }
        return done();
      }
      case 'wilcoxon': {   // the signed-rank test (Wilcoxon 1945): zeros dropped, midranks, exact without ties for n ≤ 50
        const d0 = Y ? X.map((v, i) => v - Y[i]) : X.map(v => v - mu0), d = d0.filter(v => v !== 0);
        if (d.length < d0.length) I.add('zero-diffs');
        const n = d.length; if (!n) { I.add('few-data'); return out; }
        const { r, ties } = ranks(d.map(abs)); let V = 0; for (let i = 0; i < n; i++) if (d[i] > 0) V += r[i];
        const S = n * (n + 1) / 2; o.stat = V; o.n = n; o.effect = (2 * V - S) / S; o.estimate = quant(sorted(d), 0.5);   // matched-pairs rank-biserial r
        if (!ties.length && n <= 50 && m.exact !== false) { const [lo, up] = tails(exactW(n), V); o.p = pAlt(alt, lo, up); }
        else {
          if (ties.length) I.add('ties-approx');
          const mu = S / 2, sd = sqrt(n * (n + 1) * (2 * n + 1) / 24 - ties.reduce((s, t) => s + t * t * t - t, 0) / 48), cc = m.correct === false ? 0 : 0.5;
          if (!(sd > 0)) { I.add('zero-variance'); return out; }
          o.p = alt === 'less' ? ncdf((V - mu + cc) / sd) : alt === 'greater' ? ncdf(-(V - mu - cc) / sd) : min(1, 2 * ncdf(-max(0, abs(V - mu) - cc) / sd));
        }
        return done();
      }
    }
    return out;
  }

  /* ===================================================================================================================== */
  /* ci — confidence intervals. A proportion: Wald, Wilson (1927), Agresti & Coull (1998), Clopper & Pearson (1934),         */
  /* Jeffreys (with the k = 0, n modification) — compared by Brown, Cai & DasGupta (2001, Stat. Sci. 16:101), with their     */
  /* exact coverage Σ_k pmf(k; n, p)·1[lo_k ≤ p ≤ hi_k]; a Poisson rate: Garwood (1936) exact, Wald; a mean: t, z; a          */
  /* variance: χ²                                                                                                           */
  /* ===================================================================================================================== */
  function propCI(method, k, n, conf) {
    const al = 1 - conf, z = -qnorm(al / 2), ph = k / n;
    if (method === 'wald') { const h = z * sqrt(ph * (1 - ph) / n); return [max(0, ph - h), min(1, ph + h)]; }
    if (method === 'wilson') return wilson(k, n, z);
    if (method === 'agresti-coull') { const nt = n + z * z, pt = (k + z * z / 2) / nt, h = z * sqrt(pt * (1 - pt) / nt); return [max(0, pt - h), min(1, pt + h)]; }
    if (method === 'clopper-pearson') return clopper(k, n, al, 'two-sided');
    const B = betaD(k + 0.5, n - k + 0.5);   // Jeffreys
    return [k === 0 ? 0 : B.q(al / 2), k === n ? 1 : B.isf(al / 2)];
  }
  /** the exact coverage of a method at p: the binomial pmf by the ratio recursion from the mode (O(n) per p) */
  function coverage(LO, HI, n, p) {
    if (p <= 0 || p >= 1) return NaN;
    const md = min(n, floor((n + 1) * p)), q = 1 - p; let s = 0;
    const pm = exp(ldbinom(md, n, p, q));
    let pk = pm; for (let k = md; k <= n && pk > 0; k++) { if (LO[k] <= p && p <= HI[k]) s += pk; pk *= (n - k) / (k + 1) * p / q; }
    pk = pm; for (let k = md - 1; k >= 0; k--) { pk *= (k + 1) / (n - k) * q / p; if (pk === 0) break; if (LO[k] <= p && p <= HI[k]) s += pk; }
    return min(1, s);
  }
  function runCI(m, R, I, want) {
    const g = getter(R), o = {}, sr = {}, lazy = {}, out = { o, sr, sc: {}, lazy };
    const conf = g(m, 'conf', 0.95), al = 1 - conf, kind = m.kind;
    if (!(conf > 0 && conf < 1)) { I.add('param'); return out; }
    if (kind === 'prop') {
      const k = g(m, 'k'), n = g(m, 'n');
      if (!(Number.isInteger(k) && Number.isInteger(n) && k >= 0 && k <= n && n >= 1 && n <= 1e7)) { I.add('param'); return out; }
      const meth = m.method || 'wilson', memo = {};
      const one = mt => (memo[mt] || (memo[mt] = propCI(mt, k, n, conf)));
      const bounds = mt => {   // every k's interval, for the coverage (n ≤ 2000)
        const key = 'B' + mt; if (memo[key]) return memo[key];
        const LO = [], HI = []; for (let j = 0; j <= n; j++) { const c = propCI(mt, j, n, conf); LO.push(c[0]); HI.push(c[1]); }
        return (memo[key] = [LO, HI]);
      };
      const np = m.points || 199, ps = grid(1 / (np + 1), np / (np + 1), np);
      const curve = mt => { const key = 'C' + mt; if (memo[key]) return memo[key]; if (n > 2000) { I.add('param'); return (memo[key] = []); } const [LO, HI] = bounds(mt); return (memo[key] = ps.map(p => coverage(LO, HI, n, p))); };
      const at = mt => { const p = g(m, 'p'); if (m.p === undefined || n > 2000) return NaN; const [LO, HI] = bounds(mt); return coverage(LO, HI, n, p); };
      const mean = a => (a.length ? sum(a) / a.length : NaN), mn = a => (a.length ? min(...a) : NaN);
      for (const mt of DATA.ciMethods.prop) {
        lazy['lo.' + mt] = () => one(mt)[0]; lazy['hi.' + mt] = () => one(mt)[1]; lazy['coverAt.' + mt] = () => at(mt);
        lazy['meanCover.' + mt] = () => mean(curve(mt)); lazy['minCover.' + mt] = () => mn(curve(mt));
        sr['cover.' + mt] = null;
      }
      lazy.lo = () => one(meth)[0]; lazy.hi = () => one(meth)[1]; lazy.width = () => one(meth)[1] - one(meth)[0]; lazy.est = () => k / n;
      lazy.coverAt = () => at(meth); lazy.meanCover = () => mean(curve(meth)); lazy.minCover = () => mn(curve(meth));
      sr.lazy = () => { const s = { covP: n > 2000 ? [] : ps, cover: curve(meth) }; for (const mt of DATA.ciMethods.prop) if (!want || want.has('cover.' + mt)) s['cover.' + mt] = curve(mt); return s; };
      for (const mt of DATA.ciMethods.prop) delete sr['cover.' + mt];
      return out;
    }
    let lo = NaN, hi = NaN, est = NaN;
    if (kind === 'poisson') {
      const k = g(m, 'k'), t = g(m, 't', 1);
      if (!(Number.isInteger(k) && k >= 0 && t > 0)) { I.add('param'); return out; }
      est = k / t;
      if ((m.method || 'exact') === 'exact') { lo = k === 0 ? 0 : gammaD(k, 1).q(al / 2) / t; hi = gammaD(k + 1, 1).isf(al / 2) / t; }   // χ²_{2k}/2 = Gamma(k)
      else { const h = -qnorm(al / 2) * sqrt(k) / t; lo = max(0, est - h); hi = est + h; }
    } else {
      let s = null;
      if (Array.isArray(m.x)) { const X = m.x.map(R); if (X.some(v => !fin(v))) { I.add('param'); return out; } const v = meanVar(X); s = { mean: v.mean, sd: sqrt(v.var), n: v.n }; }
      else s = { mean: g(m.summary, 'mean'), sd: g(m.summary, 'sd'), n: g(m.summary, 'n') };
      if (!(s.n >= 2 && s.sd >= 0)) { I.add(s.n < 2 ? 'few-data' : 'param'); return out; }
      if (kind === 'mean') {
        est = s.mean;
        const meth = m.method || 't', sg = meth === 'z' ? g(m, 'sigma') : s.sd;
        if (!(sg >= 0)) { I.add('param'); return out; }
        const c = meth === 'z' ? -qnorm(al / 2) : -qt(al / 2, s.n - 1), h = c * sg / sqrt(s.n); lo = est - h; hi = est + h;
      } else {
        est = s.sd * s.sd; const G = gammaD((s.n - 1) / 2, 2), ss = (s.n - 1) * est;
        lo = ss / G.isf(al / 2); hi = ss / G.q(al / 2);
      }
    }
    Object.assign(o, { lo, hi, width: hi - lo, est });
    return out;
  }

  /* ===================================================================================================================== */
  /* power — the probability of rejecting H0 under an effect, and the sample size for a target power (Cohen 1988, Statistical  */
  /* Power Analysis): z exact; t by the noncentral t (AS 243); two proportions by Cohen's h = 2 asin √p1 − 2 asin √p2; the    */
  /* exact binomial test by summing the pmf over its rejection region (its power saw-tooths in n)                          */
  /* ===================================================================================================================== */
  function powerFn(kind, alt, alpha) {
    const za2 = -qnorm(alpha / 2), za = -qnorm(alpha);
    const zpow = dl => (alt === 'two-sided' ? ncdf(dl - za2) + ncdf(-dl - za2) : alt === 'greater' ? ncdf(dl - za) : ncdf(-dl - za));
    if (kind === 'z-one') return (n, d) => zpow(d * sqrt(n));
    if (kind === 't-one' || kind === 't-paired' || kind === 't-two') return (n, d) => {
      const df = kind === 't-two' ? 2 * n - 2 : n - 1, ncp = kind === 't-two' ? d * sqrt(n / 2) : d * sqrt(n);
      if (!(df > 0)) return NaN;
      if (alt === 'two-sided') { const tc = -qt(alpha / 2, df); return 1 - pnt(tc, df, ncp) + pnt(-tc, df, ncp); }
      const tc = -qt(alpha, df);
      return alt === 'greater' ? 1 - pnt(tc, df, ncp) : pnt(-tc, df, ncp);
    };
    if (kind === 'prop-two') return (n, h) => zpow(h * sqrt(n / 2));
    return (n, p1, p0) => {   // binom-exact: n integer
      n = Math.round(n); const B0 = binomialD(n, p0), B1 = binomialD(n, p1);
      if (alt === 'greater') { const kc = B0.isf(alpha) + 1; return kc > n ? 0 : B1.sf(kc - 1); }   // the smallest k with P0(X ≥ k) ≤ α
      if (alt === 'less') { const kc = B0.q(alpha); const k2 = B0.cdf(kc) <= alpha ? kc : kc - 1; return k2 < 0 ? 0 : B1.cdf(k2); }
      const pm = []; for (let k = 0; k <= n; k++) pm.push(B0.pdf(k));
      const srt = pm.slice().sort((x, y) => x - y), cs = []; let c = 0; for (const v of srt) { c += v; cs.push(c); }
      let pw = 0;
      for (let k = 0; k <= n; k++) {   // p(k) = Σ pmf0(j) over pmf0(j) ≤ pmf0(k)(1 + 1e-7): a binary search in the sorted pmf
        const t = pm[k] * (1 + 1e-7); let lo = 0, hi = n, r = -1; while (lo <= hi) { const md = (lo + hi) >> 1; if (srt[md] <= t) { r = md; lo = md + 1; } else hi = md - 1; }
        if (r >= 0 && cs[r] <= alpha * (1 + 1e-12)) pw += B1.pdf(k);
      }
      return min(1, pw);
    };
  }
  function runPower(m, R, I) {
    const g = getter(R), o = {}, sr = {}, lazy = {}, out = { o, sr, sc: {}, lazy };
    const kind = m.kind, alt = m.alt || 'two-sided', alpha = g(m, 'alpha', 0.05), target = g(m, 'target', 0.8), n = g(m, 'n', NaN);
    if (!(alpha > 0 && alpha < 1) || !(target > 0 && target < 1)) { I.add('param'); return out; }
    const f = powerFn(kind, alt, alpha), bin = kind === 'binom-exact', prop2 = kind === 'prop-two';
    let eff, p0 = NaN;
    if (prop2) { const p1 = g(m, 'p1'), p2 = g(m, 'p2'); if (!(p1 >= 0 && p1 <= 1 && p2 >= 0 && p2 <= 1)) { I.add('param'); return out; } eff = 2 * asin(sqrt(p1)) - 2 * asin(sqrt(p2)); o.effectH = eff; }
    else if (bin) { p0 = g(m, 'p0'); eff = g(m, 'p1'); if (!(p0 > 0 && p0 < 1 && eff >= 0 && eff <= 1)) { I.add('param'); return out; } }
    else { eff = g(m, 'effect'); if (!fin(eff)) { I.add('param'); return out; } }
    const P = (nn, e) => (bin ? f(nn, e, p0) : f(nn, e));
    const nmin = kind === 'z-one' || bin ? 1 : 2;
    if (fin(n)) {
      if (n < nmin || (bin && !Number.isInteger(n))) I.add('param');
      else {
        lazy.power = () => P(n, eff);
        if (kind.startsWith('t-')) { const df = kind === 't-two' ? 2 * n - 2 : n - 1; o.ncp = kind === 't-two' ? eff * sqrt(n / 2) : eff * sqrt(n); lazy.crit = () => -qt(alt === 'two-sided' ? alpha / 2 : alpha, df); }
        else if (!bin) { o.ncp = prop2 ? eff * sqrt(n / 2) : eff * sqrt(n); o.crit = -qnorm(alt === 'two-sided' ? alpha / 2 : alpha); }
        else lazy.crit = () => (alt === 'less' ? binomialD(n, p0).q(alpha) : binomialD(n, p0).isf(alpha) + 1);
      }
    }
    const nMax = m.nMax || 200;
    lazy.nNeeded = () => {
      if (bin) { for (let k = 1; k <= nMax; k++) if (P(k, eff) >= target) return k; I.add('not-reached'); return NaN; }
      let hi = nmin; while (P(hi, eff) < target) { hi *= 2; if (hi > 1e7) { I.add('not-reached'); return NaN; } }
      let lo = max(nmin - 1, floor(hi / 2)); if (P(lo, eff) >= target && lo >= nmin) return lo;
      while (hi - lo > 1) { const md = floor((lo + hi) / 2); if (P(md, eff) >= target) hi = md; else lo = md; }
      return hi;
    };
    lazy.nExact = () => {   // the real n with power(n) = target (what statsmodels' solve_power gives)
      if (bin) return NaN;
      let lo = nmin, hi = nmin; if (P(lo, eff) >= target) return NaN;
      while (P(hi, eff) < target) { lo = hi; hi *= 2; if (hi > 1e7) { I.add('not-reached'); return NaN; } }
      for (let i = 0; i < 80; i++) { const md = 0.5 * (lo + hi); if (P(md, eff) >= target) hi = md; else lo = md; }
      return 0.5 * (lo + hi);
    };
    sr.lazy = () => {
      const ns = []; for (let k = nmin; k <= nMax && ns.length < 2000; k++) ns.push(k);
      const np = m.points || 101, dmax = m.dMax !== undefined ? g(m, 'dMax') : max(1, 2 * abs(eff));
      const ds = prop2 || bin ? grid(0, 1, np) : grid(0, dmax, np), p2 = prop2 ? g(m, 'p2') : NaN;
      const nn = fin(n) ? n : 20;
      return { powerN: ns, powerByN: ns.map(k => P(k, eff)), powerD: ds,
        powerByD: ds.map(d => (prop2 ? f(nn, 2 * asin(sqrt(d)) - 2 * asin(sqrt(p2))) : P(nn, d))) };
    };
    return out;
  }

  /* ===================================================================================================================== */
  /* bayes — conjugate updating (Raiffa & Schlaifer 1961; Gelman et al., Bayesian Data Analysis, 3rd ed. 2013, ch. 2):        */
  /* Beta(a, b) + k of n → Beta(a + k, b + n − k); Gamma(a, rate b) + Σx over exposure t → Gamma(a + Σx, b + t);               */
  /* Normal(μ0, τ0²) + x̄ of n with known σ → precision-weighted normal. Equal-tail and HPD intervals (golden section on the   */
  /* width q(u + c) − q(u)); P(θ > θ0); the Savage–Dickey Bayes factor BF01 = posterior / prior density at θ0 (Dickey 1971)    */
  /* ===================================================================================================================== */
  function hpd(D, c) {
    const w = u => D.q(u + c) - D.q(u);
    let a = 0, b = 1 - c; const gr = 0.6180339887498949;
    let x1 = b - gr * (b - a), x2 = a + gr * (b - a), f1 = w(x1), f2 = w(x2);
    for (let i = 0; i < 80; i++) { if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - gr * (b - a); f1 = w(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + gr * (b - a); f2 = w(x2); } }
    let u = 0.5 * (a + b), best = w(u);
    for (const e of [0, 1 - c]) { const we = w(e); if (we < best) { best = we; u = e; } }   // monotone densities touch a boundary
    return [D.q(u), D.q(u + c)];
  }
  function runBayes(m, R, I) {
    const g = getter(R), o = {}, sr = {}, lazy = {}, out = { o, sr, sc: {}, lazy };
    const conf = g(m, 'conf', 0.95), kind = m.kind, pr = m.prior || {};
    if (!(conf > 0 && conf < 1)) { I.add('param'); return out; }
    let prior = null, post = null, lo = 0, hi = 1;
    if (kind === 'beta-binomial') {
      const a = g(pr, 'a'), b = g(pr, 'b'), k = g(m, 'k'), n = g(m, 'n');
      if (!(a >= 0 && b >= 0 && Number.isInteger(k) && Number.isInteger(n) && k >= 0 && k <= n)) { I.add('param'); return out; }
      const A = a + k, B = b + n - k; o.postA = A; o.postB = B; o.mle = n > 0 ? k / n : NaN; o.priorMean = a + b > 0 ? a / (a + b) : NaN;
      if (!(A > 0 && B > 0)) { I.add('improper-posterior'); return out; }   // Haldane's Beta(0, 0) needs 0 < k < n
      if (a > 0 && b > 0) prior = betaD(a, b);
      post = betaD(A, B); o.predNext = A / (A + B);
      if (!(A > 1 && B > 1)) I.add('mode-boundary');
      o.postMode = A > 1 && B > 1 ? (A - 1) / (A + B - 2) : A <= 1 && B > 1 ? 0 : A > 1 && B <= 1 ? 1 : NaN;
      if (A < 1 && B < 1) I.add('hpd-not-interval');
    } else if (kind === 'gamma-poisson') {
      const a = g(pr, 'a'), b = g(pr, 'b'), s = g(m, 'sum'), t = g(m, 't');
      if (!(a >= 0 && b >= 0 && s >= 0 && t > 0)) { I.add('param'); return out; }
      const A = a + s, B = b + t; o.postA = A; o.postB = B; o.mle = s / t; o.priorMean = b > 0 ? a / b : NaN;
      if (!(A > 0 && B > 0)) { I.add('improper-posterior'); return out; }
      if (a > 0 && b > 0) prior = gammaD(a, 1 / b);
      post = gammaD(A, 1 / B); o.predNext = A / B; o.postMode = A >= 1 ? (A - 1) / B : 0; if (A < 1) I.add('mode-boundary');
      hi = NaN;
    } else {
      const mu0 = g(pr, 'mu'), t0 = g(pr, 'sd'), xb = g(m, 'xbar'), n = g(m, 'n'), sg = g(m, 'sigma');
      if (!(fin(mu0) && t0 > 0 && fin(xb) && n >= 0 && sg > 0)) { I.add('param'); return out; }
      const prec = 1 / (t0 * t0) + n / (sg * sg), mu = (mu0 / (t0 * t0) + n * xb / (sg * sg)) / prec, sd = 1 / sqrt(prec);
      prior = normalD(mu0, t0); post = normalD(mu, sd); o.postA = mu; o.postB = sd; o.mle = n > 0 ? xb : NaN; o.priorMean = mu0; o.predNext = mu; o.postMode = mu;
      lo = NaN; hi = NaN;
    }
    o.postMean = post.mean; o.postSd = sqrt(post.var);
    const al = 1 - conf; o.ciLo = post.q(al / 2); o.ciHi = post.isf(al / 2);
    lazy.hpdLo = () => (o.hpd || (o.hpd = (I.out['hpd-not-interval'] ? [NaN, NaN] : hpd(post, conf))))[0];
    lazy.hpdHi = () => (o.hpd || (o.hpd = (I.out['hpd-not-interval'] ? [NaN, NaN] : hpd(post, conf))))[1];
    if (m.theta0 !== undefined) {
      const th = g(m, 'theta0'); o.pAbove = post.sf(th);
      o.bf01 = prior ? post.pdf(th) / prior.pdf(th) : NaN;
    }
    sr.lazy = () => {
      const np = m.points || 201;
      let a = m.from !== undefined ? g(m, 'from') : lo, b = m.to !== undefined ? g(m, 'to') : hi;
      if (!fin(a)) a = min(post.q(0.0005), prior ? prior.q(0.0005) : Infinity);
      if (!fin(b)) b = max(post.isf(0.0005), prior ? prior.isf(0.0005) : -Infinity);
      if (kind === 'gamma-poisson' && m.from === undefined) a = 0;
      const xs = kind === 'beta-binomial' && m.from === undefined && m.to === undefined ? grid(0.5 / np, 1 - 0.5 / np, np) : grid(a, b, np);
      const cl = v => (fin(v) ? v : NaN);
      let like;
      if (kind === 'beta-binomial') { const L = betaD(g(m, 'k') + 1, g(m, 'n') - g(m, 'k') + 1); like = xs.map(x => cl(L.pdf(x))); }   // the likelihood scaled to a density
      else if (kind === 'gamma-poisson') { const L = g(m, 'sum') + 1 > 0 ? gammaD(g(m, 'sum') + 1, 1 / g(m, 't')) : null; like = xs.map(x => (L ? cl(L.pdf(x)) : NaN)); }
      else { const L = normalD(g(m, 'xbar'), g(m, 'sigma') / sqrt(max(g(m, 'n'), 1e-300))); like = xs.map(x => cl(L.pdf(x))); }
      return { theta: xs, prior: xs.map(x => (prior ? cl(prior.pdf(x)) : NaN)), like, post: xs.map(x => cl(post.pdf(x))) };
    };
    return out;
  }

  /* ===================================================================================================================== */
  /* screen — a diagnostic test and the base rate (Kahneman & Tversky 1973; Eddy 1982; Gigerenzer & Hoffrage 1995 natural    */
  /* frequencies): PPV = sens·prev / (sens·prev + (1 − spec)(1 − prev)), LR± , post-test odds = pre-test odds × LR+^k         */
  /* ===================================================================================================================== */
  function runScreen(m, R, I) {
    const g = getter(R), o = {}, sc = {};
    const pv = g(m, 'prev'), se = g(m, 'sens'), sp = g(m, 'spec'), N = g(m, 'pop', 1000), k = g(m, 'tests', 1);
    if (![pv, se, sp].every(v => v >= 0 && v <= 1) || !(Number.isInteger(N) && N >= 1 && N <= 2000) || !(Number.isInteger(k) && k >= 1 && k <= 20)) { I.add('param'); return { o, sr: {}, sc }; }
    const tp = se * pv, fp = (1 - sp) * (1 - pv), fn = (1 - se) * pv, tn = sp * (1 - pv);
    Object.assign(o, { ppv: tp / (tp + fp), npv: tn / (tn + fn), lrPos: se / (1 - sp), lrNeg: (1 - se) / sp, tp: tp * N, fp: fp * N, fn: fn * N, tn: tn * N,
      posRate: tp + fp, accuracy: tp + tn, youden: se + sp - 1, dor: (se / (1 - se)) / ((1 - sp) / sp), preOdds: pv / (1 - pv) });
    o.postOdds = o.preOdds * o.lrPos;
    const ok = o.preOdds * pow(o.lrPos, k); o.ppvRepeat = ok === Infinity ? 1 : ok / (1 + ok);   // k independent positive results
    /* the icon array: N people, sick first (TP then FN), then the healthy (FP then TN) */
    const D = Math.round(pv * N), TP = Math.round(se * D), FP = Math.round((1 - sp) * (N - D));
    const cols = ceil(sqrt(N * 1.6)), rows = ceil(N / cols), s = C.scene([-1, cols, -rows, 1]);
    for (let i = 0; i < N; i++) {
      const c = i < TP ? 'bad' : i < D ? 'warn' : i < D + FP ? 'hi' : 'muted';
      s.pt(i % cols, -floor(i / cols), { c, r: 3 });
    }
    sc.icons = s.done();
    return { o, sr: {}, sc };
  }

  /* ===================================================================================================================== */
  /* simpson — Simpson's paradox (Simpson 1951; Yule 1903): the stratum rates against the pooled ones; direct standardisation */
  /* to the pooled stratum sizes; the Mantel–Haenszel odds ratio (1959). Charig et al. (1986) kidney stones are the test.     */
  /* ===================================================================================================================== */
  function runSimpson(m, R, I) {
    const g = getter(R), o = {}, sr = {}, lazy = {};
    const S = m.strata.map(s => [g(s, 'k1'), g(s, 'n1'), g(s, 'k2'), g(s, 'n2')]);
    if (S.some(([a, b, c, d]) => !(a >= 0 && b > 0 && a <= b && c >= 0 && d > 0 && c <= d))) { I.add('param'); return { o, sr, sc: {} }; }
    let K1 = 0, N1 = 0, K2 = 0, N2 = 0, NT = 0, num = 0, den = 0;
    for (const [k1, n1, k2, n2] of S) { K1 += k1; N1 += n1; K2 += k2; N2 += n2; NT += n1 + n2; const t = n1 + n2; num += k1 * (n2 - k2) / t; den += (n1 - k1) * k2 / t; }
    const r1 = S.map(s => s[0] / s[1]), r2 = S.map(s => s[2] / s[3]), w = S.map(s => (s[1] + s[3]) / NT);
    o.pooled1 = K1 / N1; o.pooled2 = K2 / N2; o.pooledDiff = o.pooled1 - o.pooled2; o.strata = S.length;
    o.std1 = sum(r1.map((r, i) => r * w[i])); o.std2 = sum(r2.map((r, i) => r * w[i])); o.stdDiff = o.std1 - o.std2;
    if (S.some(([a, b, c, d]) => a === 0 || a === b || c === 0 || c === d)) I.add('zero-cell');
    o.mhOR = num / den;
    const dif = r1.map((r, i) => r - r2[i]);
    o.paradox = (dif.every(d => d > 0) && o.pooledDiff < 0) || (dif.every(d => d < 0) && o.pooledDiff > 0) ? 1 : 0;
    S.forEach((_, i) => { o['rate1.' + i] = r1[i]; o['rate2.' + i] = r2[i]; o['diff.' + i] = dif[i]; });
    sr.stratum = S.map((_, i) => i + 1); sr.rates1 = r1; sr.rates2 = r2;
    return { o, sr, sc: {}, lazy };
  }

  /* ===================================================================================================================== */
  /* multi — multiple testing, the adjusted p-values of R p.adjust: Bonferroni; Holm (1979); Hochberg (1988); Benjamini &     */
  /* Hochberg (1995) FDR; Benjamini & Yekutieli (2001); and a seeded simulation of m z-tests (m0 true nulls) for FWER and FDR  */
  /* ===================================================================================================================== */
  function adjust(p, method) {
    const n = p.length, o = p.map((_, i) => i), out = new Array(n);
    if (method === 'bonferroni') return p.map(v => min(1, n * v));
    if (method === 'holm') { o.sort((i, j) => p[i] - p[j] || i - j); let c = 0; o.forEach((i, r) => { c = max(c, (n - r) * p[i]); out[i] = min(1, c); }); return out; }
    o.sort((i, j) => p[j] - p[i] || j - i);   // decreasing
    const q = method === 'by' ? sum(Array.from({ length: n }, (_, i) => 1 / (i + 1))) : 1;
    let c = Infinity;
    o.forEach((i, r) => { const rank = n - r; c = min(c, method === 'hochberg' ? (n - rank + 1) * p[i] : q * n / rank * p[i]); out[i] = min(1, c); });
    return out;
  }
  function runMulti(m, R, I, seed) {
    const g = getter(R), o = {}, sr = {};
    const alpha = g(m, 'alpha', 0.05), meth = m.method || 'holm';
    if (!(alpha > 0 && alpha < 1)) { I.add('param'); return { o, sr, sc: {} }; }
    if (Array.isArray(m.p)) {
      const p = m.p.map(R);
      if (p.some(v => !(v >= 0 && v <= 1))) I.add('param');
      else {
        const a = adjust(p, meth), n = p.length;
        o.m = n; o.rejected = a.filter(v => v <= alpha).length; o.rejectedRaw = p.filter(v => v <= alpha).length; o.minAdj = n ? min(...a) : NaN;
        o.fwerIndep = 1 - pow(1 - alpha, n);   // the chance of ≥ 1 false rejection among n independent true nulls, uncorrected
        const rej = p.filter((v, i) => a[i] <= alpha); o.threshold = rej.length ? max(...rej) : NaN;
        a.forEach((v, i) => { o['adj.' + i] = v; });
        const idx = p.map((_, i) => i).sort((i, j) => p[i] - p[j] || i - j);
        sr.rank = idx.map((_, r) => r + 1); sr.sortedP = idx.map(i => p[i]); sr.bhLine = idx.map((_, r) => (r + 1) * alpha / n); sr.adjSorted = idx.map(i => a[i]);
      }
    }
    if (isObj(m.sim)) {
      const M = g(m.sim, 'm'), M0 = g(m.sim, 'm0'), ef = g(m.sim, 'effect'), reps = g(m.sim, 'reps', 1000);
      if (!(Number.isInteger(M) && M >= 1 && M <= 1000 && Number.isInteger(M0) && M0 >= 0 && M0 <= M && fin(ef) && Number.isInteger(reps) && reps >= 1 && reps <= 2000)) I.add('param');
      else if (M * reps > 2e6) I.add('budget');
      else {
        const r = C.mulberry32(C.hash32('prob:multi', m.sim.seed !== undefined ? m.sim.seed : seed));
        let fw = 0, fd = 0, pw = 0, fwr = 0, fdr = 0;
        const p = new Array(M);
        for (let k = 0; k < reps; k++) {
          for (let i = 0; i < M; i++) { const z = qnorm(uOpen(r)) + (i < M0 ? 0 : ef); p[i] = 2 * ncdf(-abs(z)); }
          const a = adjust(p, meth); let V = 0, Rr = 0, Vr = 0, Rr0 = 0;
          for (let i = 0; i < M; i++) { if (a[i] <= alpha) { Rr++; if (i < M0) V++; } if (p[i] <= alpha) { Rr0++; if (i < M0) Vr++; } }
          if (V) fw++; fd += Rr ? V / Rr : 0; pw += M > M0 ? (Rr - V) / (M - M0) : 0; if (Vr) fwr++; fdr += Rr0 ? Vr / Rr0 : 0;
        }
        Object.assign(o, { simFwer: fw / reps, simFdr: fd / reps, simPower: M > M0 ? pw / reps : NaN, simFwerRaw: fwr / reps, simFdrRaw: fdr / reps });
      }
    }
    return { o, sr, sc: {} };
  }

  /* ===================================================================================================================== */
  /* markov — finite discrete-time chains (Kemeny & Snell, Finite Markov Chains, 1960/1976; Grinstead & Snell, Introduction to */
  /* Probability, 1997, ch. 11; Norris, Markov Chains, 1997): classes = strongly connected components (Tarjan 1972), closed vs */
  /* transient, the period by BFS levels (Denardo 1977), the stationary law of each closed class by GTH (Grassmann, Taksar &   */
  /* Heyman 1985, Oper. Res. 33:1107 — elimination without subtractions), absorption by the fundamental matrix N = (I − Q)⁻¹    */
  /* (solved, never inverted), hitting times, the return time 1/π (Kac 1947), total variation to π                         */
  /* ===================================================================================================================== */
  /** solve A x = b by Gaussian elimination with partial pivoting (A copied); null when singular */
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (abs(M[r][c]) > abs(M[p][c])) p = r;
      if (!(abs(M[p][c]) > 1e-300)) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
    return x;
  }
  function gth(P) {   // the stationary law of an irreducible stochastic matrix
    const n = P.length, A = P.map(r => r.slice());
    for (let k = n - 1; k >= 1; k--) {
      let s = 0; for (let j = 0; j < k; j++) s += A[k][j];
      if (!(s > 0)) return null;
      for (let i = 0; i < k; i++) A[i][k] /= s;
      for (let i = 0; i < k; i++) { const a = A[i][k]; if (a) for (let j = 0; j < k; j++) A[i][j] += a * A[k][j]; }
    }
    const x = [1]; for (let k = 1; k < n; k++) { let s = 0; for (let i = 0; i < k; i++) s += x[i] * A[i][k]; x.push(s); }
    const t = sum(x); return x.map(v => v / t);
  }
  function sccs(P) {   // Tarjan's strongly connected components
    const n = P.length, idx = new Array(n).fill(-1), low = new Array(n), on = new Array(n).fill(false), st = [], comp = new Array(n).fill(-1), out = [];
    let c = 0;
    const visit = v => {
      idx[v] = low[v] = c++; st.push(v); on[v] = true;
      for (let w = 0; w < n; w++) if (P[v][w] > 0) { if (idx[w] < 0) { visit(w); low[v] = min(low[v], low[w]); } else if (on[w]) low[v] = min(low[v], idx[w]); }
      if (low[v] === idx[v]) { const cc = []; let w; do { w = st.pop(); on[w] = false; comp[w] = out.length; cc.push(w); } while (w !== v); out.push(cc.sort((a, b) => a - b)); }
    };
    for (let v = 0; v < n; v++) if (idx[v] < 0) visit(v);
    return { comps: out, comp };
  }
  function period(P, cls) {
    const lv = new Map([[cls[0], 0]]), q = [cls[0]], inC = new Set(cls); let gg = 0;
    const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
    while (q.length) { const u = q.shift(); for (const v of cls) if (P[u][v] > 0) { if (!lv.has(v)) { lv.set(v, lv.get(u) + 1); q.push(v); } } }
    for (const u of cls) for (const v of cls) if (inC.has(v) && P[u][v] > 0) gg = gcd(gg, lv.get(u) + 1 - lv.get(v));
    return gg;
  }
  function runMarkov(m, R, I) {
    const g = getter(R), o = {}, sr = {}, sc = {}, out = { o, sr, sc };
    const S = m.states, K = S.length;
    let P = m.P.map(r => r.map(R));
    const steps = g(m, 'steps', 50);
    if (!(Number.isInteger(steps) && steps >= 0 && steps <= 1e6)) { I.add('param'); return out; }
    if (m.normalize) P = P.map(r => { const s = sum(r); return s > 0 ? r.map(v => v / s) : r; });
    if (P.some(r => r.some(v => !(v >= 0)) || abs(sum(r) - 1) > 1e-9)) { I.add('not-stochastic'); return out; }
    let p0;
    if (Array.isArray(m.init)) { p0 = m.init.map(R); const s = sum(p0); if (p0.some(v => !(v >= 0)) || !(s > 0)) { I.add('param'); return out; } p0 = p0.map(v => v / s); }
    else { const i0 = typeof m.start === 'string' ? S.indexOf(m.start) : 0; p0 = S.map((_, i) => (i === i0 ? 1 : 0)); }
    const { comps, comp } = sccs(P);
    const closed = comps.filter(cc => cc.every(u => P[u].every((v, w) => v === 0 || comp[w] === comp[u])));
    const isClosed = new Array(K).fill(false); closed.forEach(cc => cc.forEach(u => { isClosed[u] = true; }));
    const T = S.map((_, i) => i).filter(i => !isClosed[i]);
    o.classes = comps.length; o.closed = closed.length; o.transient = T.length; o.irreducible = comps.length === 1 ? 1 : 0;
    o.absorbing = S.filter((_, i) => P[i][i] === 1).length;
    const pers = closed.map(cc => period(P, cc)); o.period = comps.length === 1 ? pers[0] : max(...pers);
    if (comps.length > 1) I.add('reducible');
    if (pers.some(d => d > 1)) I.add('periodic');
    /* the stationary law of each closed class (GTH) */
    const piC = closed.map(cc => { const sub = cc.map(i => cc.map(j => P[i][j])), x = gth(sub); return x || cc.map(() => 1 / cc.length); });
    /* absorption into the closed classes from the transient states: (I − Q) b = R_C */
    const IQ = T.map(i => T.map(j => (i === j ? 1 : 0) - P[i][j]));
    const absorbC = closed.map(cc => { if (!T.length) return []; const rc = T.map(i => sum(cc.map(j => P[i][j]))); return solve(IQ, rc) || T.map(() => NaN); });
    const intoC = closed.map((cc, c) => sum(cc.map(i => p0[i])) + (T.length ? sum(T.map((i, t) => p0[i] * absorbC[c][t])) : 0));
    const pi = new Array(K).fill(0); closed.forEach((cc, c) => cc.forEach((i, j) => { pi[i] += intoC[c] * piC[c][j]; }));   // the limit from p0 (Cesàro when periodic)
    S.forEach((s, i) => {
      o['pi.' + s] = pi[i];
      const c = closed.findIndex(cc => cc.includes(i));
      o['ret.' + s] = c < 0 ? Infinity : 1 / piC[c][closed[c].indexOf(i)];
      o['absorb.' + s] = c < 0 ? 0 : intoC[c];
    });
    if (T.length) {
      const one = T.map(() => 1), t = solve(IQ, one), w = t && solve(IQ, t);
      if (t) {
        const Et = sum(T.map((i, k) => p0[i] * t[k])), Et2 = sum(T.map((i, k) => p0[i] * (2 * w[k] - t[k])));
        o.tAbsorb = Et; o.tAbsorbVar = Et2 - Et * Et;   // E[T²] = ((2N − I) t)
      }
    } else { o.tAbsorb = 0; o.tAbsorbVar = 0; }
    /* hitting times of every state: infinite from where a closed class without s is reachable avoiding s */
    for (let s = 0; s < K; s++) {
      const bad = new Array(K).fill(false), q = [];
      closed.forEach(cc => { if (!cc.includes(s)) cc.forEach(u => { bad[u] = true; q.push(u); }); });
      while (q.length) { const v = q.pop(); for (let u = 0; u < K; u++) if (!bad[u] && u !== s && P[u][v] > 0) { bad[u] = true; q.push(u); } }
      const F = S.map((_, i) => i).filter(i => i !== s && !bad[i]);
      const h = new Array(K).fill(Infinity); h[s] = 0;
      if (F.length) { const x = solve(F.map(i => F.map(j => (i === j ? 1 : 0) - P[i][j])), F.map(() => 1)); if (x) F.forEach((i, k) => { h[i] = x[k]; }); }
      let e = 0; for (let i = 0; i < K; i++) if (p0[i] > 0) e += p0[i] * h[i];
      o['hit.' + S[s]] = e;
    }
    /* the law over time: vector steps up to 2000 for the series, squaring for a far step */
    const unique = closed.length === 1, nS = min(steps, 2000);
    const ns = [0], tv = [], dist = S.map(() => []); let v = p0.slice(); o.mixTime = NaN;
    const tvd = x => 0.5 * sum(x.map((a, i) => abs(a - pi[i])));
    const rec = (x, n) => { x.forEach((a, i) => dist[i].push(a)); const d = unique ? tvd(x) : NaN; tv.push(d); if (unique && !fin(o.mixTime) && d <= 0.25) o.mixTime = n; };
    rec(v, 0);
    for (let n = 1; n <= nS; n++) { const nv = new Array(K).fill(0); for (let i = 0; i < K; i++) if (v[i]) for (let j = 0; j < K; j++) nv[j] += v[i] * P[i][j]; v = nv; ns.push(n); rec(v, n); }
    if (steps > nS) {   // v P^(steps − 2000) by repeated squaring
      let e = steps - nS, A = P.map(r => r.slice());
      const mul = (X, Y) => X.map(r => Y[0].map((_, j) => { let s = 0; for (let k = 0; k < K; k++) s += r[k] * Y[k][j]; return s; }));
      while (e > 0) { if (e & 1) v = v.map((_, j) => { let s = 0; for (let k = 0; k < K; k++) s += v[k] * A[k][j]; return s; }); e = floor(e / 2); if (e) A = mul(A, A); }
    }
    if (unique && !fin(o.mixTime)) I.add('not-reached');
    S.forEach((s, i) => { o['p.' + s] = v[i]; sr['dist.' + s] = dist[i]; });
    o.tv = unique ? tvd(v) : NaN;
    sr.n = ns; sr.tv = tv;
    /* the diagram: the states on a circle, an arrow for each p_ij > 0 labelled with its value */
    const s = C.scene([-1.5, 1.5, -1.5, 1.5]), pos = S.map((_, i) => [cos(PI / 2 - 2 * PI * i / K), sin(PI / 2 - 2 * PI * i / K)]);
    const lab = Array.isArray(m.labels) ? m.labels : null;
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
      const p = P[i][j]; if (!(p > 0)) continue;
      const [x1, y1] = pos[i], [x2, y2] = pos[j];
      if (i === j) { s.circ(x1 * 1.18, y1 * 1.18, 0.12, { c: 'muted' }); s.txt(x1 * 1.38, y1 * 1.38, { v: Math.round(p * 1000) / 1000, c: 'muted' }); continue; }
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ox = -dy / L * 0.06, oy = dx / L * 0.06, sh = 0.14 / L;
      s.seg(x1 + dx * sh + ox, y1 + dy * sh + oy, x2 - dx * sh + ox, y2 - dy * sh + oy, { c: isClosed[i] ? 'base' : 'info', arrow: true });
      s.txt(x1 + dx * 0.5 + ox * 2.2, y1 + dy * 0.5 + oy * 2.2, { v: Math.round(p * 1000) / 1000, c: 'muted' });
    }
    S.forEach((st, i) => { s.circ(pos[i][0], pos[i][1], 0.12, { c: isClosed[i] ? 'hi' : 'warn', fill: true }); s.txt(pos[i][0], pos[i][1], lab ? { key: lab[i], c: 'base' } : { s: st.slice(0, 64), c: 'base' }); });
    sc.diagram = s.done();
    return out;
  }

  /* ===================================================================================================================== */
  /* walk — random walks (Feller, An Introduction to Probability Theory, vol. 1, 1968, ch. III, XIV): the exact law of S_n,  */
  /* the maximum by dynamic programming (the reflection principle when p = ½), returns (Pólya 1921), the gambler's ruin       */
  /* P(win) = (1 − r^i)/(1 − r^N), r = q/p, duration i/(q − p) − N/(q − p)·P(win) (i(N − i) when p = ½); Galton–Watson          */
  /* extinction q = the smallest root of G(s) = s (Watson & Galton 1875; Harris 1963), by Newton from 0                     */
  /* ===================================================================================================================== */
  function runWalk(m, R, I, seed) {
    const g = getter(R), o = {}, sr = {}, sc = {}, out = { o, sr, sc };
    const r = C.mulberry32(C.hash32('prob:walk', seed)), kind = m.kind;
    const isI = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    if (kind === 'galton-watson') {
      let G, dG, mean, pk = null;
      if (Array.isArray(m.offspring)) {
        pk = m.offspring.map(R); const s = sum(pk);
        if (pk.some(v => !(v >= 0)) || !(s > 0)) { I.add('param'); return out; }
        if (abs(s - 1) > 1e-9) I.add('normalized');
        pk = pk.map(v => v / s);
        G = x => { let y = 0; for (let k = pk.length - 1; k >= 0; k--) y = y * x + pk[k]; return y; };
        dG = x => { let y = 0; for (let k = pk.length - 1; k >= 1; k--) y = y * x + k * pk[k]; return y; };
        mean = pk.reduce((a, p, k) => a + k * p, 0);
      } else {
        const lam = g(m, 'm'); if (!(lam >= 0 && lam < 1e3)) { I.add('param'); return out; }
        G = x => exp(lam * (x - 1)); dG = x => lam * exp(lam * (x - 1)); mean = lam;
      }
      o.m = mean;
      if (mean <= 1) { o.extinct = pk && pk[1] === 1 ? 0 : 1; if (abs(mean - 1) < 1e-3) I.add('critical-slow'); }   // q = 1 iff m ≤ 1 (unless p1 = 1)
      else { let s = 0; for (let i = 0; i < 200; i++) { const d = (G(s) - s) / (dG(s) - 1); const ns = s - d; if (!(ns >= s) || abs(ns - s) < 1e-16) { s = max(s, ns); break; } s = ns; } o.extinct = s; }
      const gens = g(m, 'gens', 20);
      if (!isI(gens, 1, 200)) { I.add('param'); return out; }
      const gn = [0], qn = [0]; let q = 0; for (let n = 1; n <= gens; n++) { q = G(q); gn.push(n); qn.push(q); }   // P(extinct by n) = G∘…∘G(0)
      sr.gen = gn; sr.qByGen = qn;
      const reps = g(m, 'reps', 0);
      if (reps > 0) {
        if (!isI(reps, 1, 20000)) { I.add('param'); return out; }
        const off = pk ? categoricalD(pk, null) : poissonD(mean); let ext = 0, work = 0;
        for (let k = 0; k < reps && work < 5e6; k++) {
          let z = 1;
          for (let n = 0; n < gens && z > 0; n++) {
            if (z >= 1000) { if (pow(o.extinct, z) > 1e-6) I.add('capped'); break; }   // a line of ≥ 1000 survives but for q^1000 (counted when that is not negligible)
            if (!pk) { const Pz = poissonD(mean * z); z = Pz.sample(r); work += 1; }
            else { let t = 0; for (let j = 0; j < z; j++) t += off.sample(r); work += z; z = t; }
          }
          if (z === 0) ext++;
          if (work >= 5e6) { I.add('budget'); o.simExtinct = ext / (k + 1); return out; }
        }
        o.simExtinct = ext / reps;
      }
      return out;
    }
    const p = g(m, 'p', 0.5), q = 1 - p;
    if (!(p >= 0 && p <= 1)) { I.add('param'); return out; }
    if (kind === 'ruin') {
      const N = g(m, 'N'), i0 = g(m, 'i');
      if (!(isI(N, 1, 2000) && isI(i0, 0, N) && p > 0 && p < 1)) { I.add('param'); return out; }
      const win = i => { if (abs(p - 0.5) < 1e-15) return i / N; const rr = q / p; if (rr > 1) return (pow(rr, i - N) - pow(rr, -N)) / (1 - pow(rr, -N)); return (1 - pow(rr, i)) / (1 - pow(rr, N)); };
      const dur = i => (abs(p - 0.5) < 1e-15 ? i * (N - i) : i / (q - p) - N / (q - p) * win(i));
      o.pWin = win(i0); o.pRuin = 1 - o.pWin; o.duration = dur(i0);
      sr.iGrid = grid(0, N, N + 1); sr.pWinByI = sr.iGrid.map(win);
      const reps = g(m, 'reps', 0), paths = g(m, 'paths', 0);
      if (!isI(reps, 0, 20000) || !isI(paths, 0, 50)) { I.add('param'); return out; }
      const nw = max(reps, paths); let wins = 0, tsum = 0, done = 0, work = 0;
      const s = C.scene([0, 1, -0.05 * N, 1.05 * N]); let tmax = 1; const polys = [];
      for (let k = 0; k < nw; k++) {
        let x = i0, t = 0; const pts = k < paths ? [0, x] : null;
        while (x > 0 && x < N && work < 2e6) { x += r() < p ? 1 : -1; t++; work++; if (pts && pts.length < 4000) pts.push(t, x); }
        if (work >= 2e6) { I.add('budget'); break; }
        done++; if (x === N) wins++; tsum += t; if (pts) { polys.push(pts); tmax = max(tmax, t); }
      }
      if (reps > 0 && done) { o.simWin = wins / done; o.simDuration = tsum / done; }
      const sx = 1 / tmax; s.seg(0, 0, 1, 0, { c: 'bad' }); s.seg(0, N, 1, N, { c: 'ok' });
      polys.forEach((pts, k) => s.poly(pts.map((v, j) => (j % 2 ? v : v * sx)), { c: k % 2 ? 'info' : 'hi' }));
      sc.paths = s.done();
      return out;
    }
    /* srw: the free walk S_n = X_1 + … + X_n, X = ±1 */
    const n = g(m, 'steps'), dim = m.dim || 1, a = g(m, 'a', NaN);
    if (!isI(n, 1, 10000)) { I.add('param'); return out; }
    o.mean = n * (p - q); o.var = 4 * n * p * q;
    if (dim === 1) {
      const B = binomialD(n, p), ks = [], pm = [];
      for (let j = 0; j <= n && n <= 2000; j++) { ks.push(2 * j - n); pm.push(B.pdf(j)); }
      sr.k = ks; sr.pmf = pm;
      o.pZero = n % 2 ? 0 : B.pdf(n / 2);
      o.pReturn = abs(p - 0.5) < 1e-15 ? 1 - binomialD(2 * floor(n / 2), 0.5).pdf(floor(n / 2)) : NaN;   // P(a return by 2m) = 1 − C(2m, m)/4^m (Feller III.3)
      if (fin(a) && a >= 1) {
        if (n > 2000) I.add('budget');
        else {   // P(max_{j ≤ n} S_j ≥ a): a walk absorbed at a (exact; = 2P(S_n ≥ a) − P(S_n = a) when p = ½)
          let v = new Float64Array(2 * n + 2); const off = n; v[off] = 1; let hit = 0;
          for (let t = 0; t < n; t++) { const nv = new Float64Array(v.length); for (let x = 0; x < v.length; x++) if (v[x]) { const pos = x - off; if (pos + 1 >= a) hit += v[x] * p; else nv[x + 1] += v[x] * p; if (x - 1 >= 0) nv[x - 1] += v[x] * q; } v = nv; }
          o.pMax = a <= 0 ? 1 : hit;
        }
      }
    } else if (dim === 2) o.pZero = n % 2 ? 0 : pow(binomialD(n, 0.5).pdf(n / 2), 2);   // (C(2m, m)/4^m)² (Feller XIV.7)
    const reps = g(m, 'reps', 0), paths = g(m, 'paths', 0);
    if (!isI(reps, 0, 20000) || !isI(paths, 0, 50)) { I.add('param'); return out; }
    const nw = max(reps, paths);
    if (nw * n > 2e6) { I.add('budget'); return out; }
    let ret = 0; const polys = [];
    for (let k = 0; k < nw; k++) {
      const x = [0, 0, 0]; let back = false; const pts = k < paths ? [0, 0] : null;
      for (let t = 1; t <= n; t++) {
        if (dim === 1) x[0] += r() < p ? 1 : -1;
        else { const u = r() * 2 * dim, ax = floor(u / 2); x[ax] += u - 2 * ax < 1 ? 1 : -1; }
        if (!back && x[0] === 0 && x[1] === 0 && x[2] === 0) back = true;
        if (pts) { if (dim === 1) pts.push(t, x[0]); else pts.push(x[0], x[1]); }
      }
      if (back) ret++;
      if (pts) polys.push(pts);
    }
    if (reps > 0) o.returnFrac = ret / nw;
    const xs = [], ys = []; polys.forEach(pp => { for (let j = 0; j < pp.length; j += 2) { xs.push(pp[j]); ys.push(pp[j + 1]); } });
    const s = C.scene(dim === 1 ? [0, n, -1.1 * max(1, ...ys.map(abs)), 1.1 * max(1, ...ys.map(abs))] : C.fitView(xs, ys));
    if (dim === 1) s.seg(0, 0, n, 0, { c: 'muted', dash: true });
    polys.forEach((pp, k) => { const th = pp.length > 4000 ? C.thin(Array.from({ length: pp.length / 2 }, (_, j) => j), 2000).flatMap(j => [pp[2 * j], pp[2 * j + 1]]) : pp; s.poly(th, { c: ['hi', 'info', 'ok', 'warn'][k % 4] }); });
    sc.paths = s.done();
    return out;
  }

  /* ===================================================================================================================== */
  /* queue — M/M/c (Erlang 1917; Kleinrock, Queueing Systems, 1975): ρ = λ/(cμ); Erlang B by its stable recursion            */
  /* B(k) = aB(k−1)/(k + aB(k−1)); Erlang C = B / (1 − ρ(1 − B)); Lq = C ρ/(1 − ρ); Little's law L = λW (Little 1961)         */
  /* ===================================================================================================================== */
  function runQueue(m, R, I) {
    const g = getter(R), o = {}, sr = {};
    const lam = g(m, 'lambda'), mu = g(m, 'mu'), c = g(m, 'c', 1);
    if (!(lam > 0 && mu > 0 && Number.isInteger(c) && c >= 1 && c <= 1000)) { I.add('param'); return { o, sr, sc: {} }; }
    const a = lam / mu, rho = a / c; o.a = a; o.rho = rho;
    let B = 1; for (let k = 1; k <= c; k++) B = a * B / (k + a * B);
    o.erlangB = B;
    if (rho >= 1) { I.add('unstable'); Object.assign(o, { erlangC: 1, p0: 0, lq: Infinity, l: Infinity, wq: Infinity, w: Infinity }); return { o, sr, sc: {} }; }
    const Cc = B / (1 - rho * (1 - B)); o.erlangC = Cc;
    o.lq = Cc * rho / (1 - rho); o.wq = o.lq / lam; o.w = o.wq + 1 / mu; o.l = lam * o.w;
    const lT = c * log(a) - lgamma(c + 1);   // ln(a^c / c!)
    o.p0 = exp(-lT) / (1 / B - 1 + 1 / (1 - rho));
    const nM = m.nMax || 30, qn = [], qp = [];
    for (let n = 0; n <= nM; n++) { qn.push(n); qp.push(n < c ? o.p0 * exp(n * log(a) - lgamma(n + 1)) : o.p0 * exp(lT) * pow(rho, n - c)); }
    sr.qn = qn; sr.qProb = qp;
    return { o, sr, sc: {} };
  }

  /* ===================================================================================================================== */
  /* bootstrap — Efron (1979); Efron & Tibshirani, An Introduction to the Bootstrap (1993): percentile, basic, normal and BCa  */
  /* intervals (bias z0 and the jackknife acceleration a); the permutation test p = (1 + #{|d*| ≥ |d|}) / (B + 1)            */
  /* (Phipson & Smyth 2010)                                                                                                */
  /* ===================================================================================================================== */
  function runBoot(m, R, I, seed) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} };
    const X = m.x.map(R), Y = Array.isArray(m.y) ? m.y.map(R) : null, stat = m.stat || 'mean';
    const B = g(m, 'B', 2000), conf = g(m, 'conf', 0.95), trim = g(m, 'trim', 0.1), alt = m.alt || 'two-sided';
    if (X.some(v => !fin(v)) || (Y && Y.some(v => !fin(v))) || !(Number.isInteger(B) && B >= 10 && B <= 20000) || !(conf > 0 && conf < 1) || !(trim >= 0 && trim < 0.5)) { I.add('param'); return out; }
    const nT = X.length + (Y ? Y.length : 0);
    if (B * nT > 4e6) { I.add('budget'); return out; }
    if (X.length < 5) I.add('few-data');
    const two = stat === 'diff-means', pair = stat === 'corr';
    const S1 = a => {
      if (stat === 'mean') return sum(a) / a.length;
      if (stat === 'median') return quant(sorted(a), 0.5);
      if (stat === 'var' || stat === 'sd') { const v = meanVar(a).var; return stat === 'sd' ? sqrt(v) : v; }
      const s = sorted(a), k = floor(trim * s.length); let t = 0; for (let i = k; i < s.length - k; i++) t += s[i]; return t / (s.length - 2 * k);
    };
    const corr = (a, b) => { const n = a.length, ma = sum(a) / n, mb = sum(b) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) * (a[i] - ma); sbb += (b[i] - mb) * (b[i] - mb); } return sab / sqrt(saa * sbb); };
    const T = (a, b) => (two ? sum(a) / a.length - sum(b) / b.length : pair ? corr(a, b) : S1(a));
    const est = T(X, Y); o.estimate = est; o.B = B;
    const r = C.mulberry32(C.hash32('prob:bootstrap', seed)), n1 = X.length, n2 = Y ? Y.length : 0;
    const bs = new Float64Array(B), xa = new Array(n1), ya = new Array(two ? n2 : pair ? n1 : 0);
    for (let k = 0; k < B; k++) {
      if (pair) { for (let i = 0; i < n1; i++) { const j = floor(r() * n1); xa[i] = X[j]; ya[i] = Y[j]; } }
      else { for (let i = 0; i < n1; i++) xa[i] = X[floor(r() * n1)]; if (two) for (let i = 0; i < n2; i++) ya[i] = Y[floor(r() * n2)]; }
      bs[k] = T(xa, ya);
    }
    const sb = sorted(bs), mv = meanVar(bs), al = 1 - conf, z = -qnorm(al / 2);
    o.se = sqrt(mv.var); o.bias = mv.mean - est;
    o.pctLo = quant(sb, al / 2); o.pctHi = quant(sb, 1 - al / 2);
    o.basicLo = 2 * est - o.pctHi; o.basicHi = 2 * est - o.pctLo;
    o.normLo = est - o.bias - z * o.se; o.normHi = est - o.bias + z * o.se;
    let lt = 0, eq = 0; for (const v of bs) { if (v < est) lt++; else if (v === est) eq++; }
    const z0 = qnorm((lt + 0.5 * eq) / B);
    const jk = [];   // the jackknife (leave one out; for two samples from either)
    if (pair) for (let i = 0; i < n1; i++) jk.push(T(X.filter((_, j) => j !== i), Y.filter((_, j) => j !== i)));
    else { for (let i = 0; i < n1; i++) jk.push(T(X.filter((_, j) => j !== i), Y)); if (two) for (let i = 0; i < n2; i++) jk.push(T(X, Y.filter((_, j) => j !== i))); }
    const jm = sum(jk) / jk.length; let n3 = 0, d2 = 0; for (const v of jk) { const d = jm - v; n3 += d * d * d; d2 += d * d; }
    const acc = d2 > 0 ? n3 / (6 * pow(d2, 1.5)) : 0;
    if (!fin(z0)) { I.add('bca-undefined'); o.bcaLo = NaN; o.bcaHi = NaN; }
    else {
      const adj = zz => ncdf(z0 + (z0 + zz) / (1 - acc * (z0 + zz)));
      o.bcaLo = quant(sb, adj(-z)); o.bcaHi = quant(sb, adj(z));
    }
    if (m.perm && Y) {   // the permutation test of the statistic (two samples: the labels; corr: the pairing)
      const all = X.concat(Y), w = all.slice(), yy = Y.slice(); let c = 0;
      for (let k = 0; k < B; k++) {
        let d;
        if (pair) { for (let i = yy.length - 1; i > 0; i--) { const j = floor(r() * (i + 1)); [yy[i], yy[j]] = [yy[j], yy[i]]; } d = corr(X, yy); }
        else { for (let i = w.length - 1; i > 0; i--) { const j = floor(r() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; } d = T(w.slice(0, n1), w.slice(n1)); }
        if (alt === 'greater' ? d >= est - 1e-12 : alt === 'less' ? d <= est + 1e-12 : abs(d) >= abs(est) - 1e-12) c++;
      }
      o.permP = (1 + c) / (B + 1);
    }
    const h = autoHist(bs, 40, false); sr.histX = h.x; sr.histCount = h.count; sr.histDensity = h.dens;
    return out;
  }


  /* ===================================================================================================================== */
  /* shared tools of the later modes (combin, gof, mcmc, multivar, rand)                                                    */
  /* ===================================================================================================================== */
  /** a named NoemaSimKit stream (L'Ecuyer's MRG32k3a, 46_lib_simkit.js) — the randomness of the later modes; null and the code
      no-kit when the kit is not loaded (the result is then NaN, never another generator's numbers) */
  function kitStream(seed, name, I) {
    const K = root.NoemaSimKit;
    if (!K || typeof K.stream !== 'function') { I.add('no-kit'); return null; }
    return K.stream(seed >>> 0, 'prob.' + name);
  }
  /** H_n = Σ 1/i (summed to 1e4, else the asymptotic series ln n + γ + 1/2n − 1/12n² + 1/120n⁴ − 1/252n⁶, error < 1e-25) */
  function harm(n) {
    if (!(n >= 0)) return NaN;
    if (n <= 1e4) { let s = 0; for (let i = floor(n); i >= 1; i--) s += 1 / i; return s; }
    const r = 1 / n, r2 = r * r; return log(n) + EULER + 0.5 * r - r2 / 12 + r2 * r2 / 120 - r2 * r2 * r2 / 252;
  }
  /** H⁽²⁾_n = Σ 1/i² (to 1e4, else π²/6 − 1/n + 1/2n² − 1/6n³ + 1/30n⁵) */
  function harm2(n) {
    if (n <= 1e4) { let s = 0; for (let i = floor(n); i >= 1; i--) s += 1 / (i * i); return s; }
    const r = 1 / n; return PI * PI / 6 - r + r * r / 2 - r * r * r / 6 + r * r * r * r * r / 30;
  }
  /** ψ(x): recurrence to x ≥ 6 and the asymptotic series (Abramowitz & Stegun 6.3.18) */
  function digamma(x) {
    if (!(x > 0)) return NaN;
    let r = 0; while (x < 15) { r -= 1 / x; x += 1; }
    const f = 1 / (x * x);
    return r + log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
  }
  /** the binomial probabilities B(k, i; w), i = 0 … k, from the mode outward by their ratios (no underflow of (1 − w)^k) */
  function binomRow(k, w, out) {
    for (let i = 0; i <= k; i++) out[i] = 0;
    if (w <= 0) { out[0] = 1; return out; }
    if (w >= 1) { out[k] = 1; return out; }
    const mo = min(k, floor((k + 1) * w)), rr = w / (1 - w);
    out[mo] = exp(ldbinom(mo, k, w, 1 - w));
    for (let i = mo; i > 0 && out[i] > 0; i--) out[i - 1] = out[i] * i / ((k - i + 1) * rr);
    for (let i = mo; i < k && out[i] > 0; i++) out[i + 1] = out[i] * (k - i) / (i + 1) * rr;
    return out;
  }
  /** the law of a sum of independent Bernoulli(q_i) (the Poisson-binomial), by the exact convolution; capped at index cap */
  function poisBinom(q, cap) {
    const K = cap === undefined ? q.length : min(cap, q.length), d = new Float64Array(K + 1); d[0] = 1;
    for (const p of q) { for (let j = K; j >= 1; j--) d[j] = j === K ? d[j] + d[j - 1] * p : d[j] * (1 - p) + d[j - 1] * p; d[0] *= 1 - p; }
    return d;   // with a cap, d[K] holds P(≥ K)
  }
  /** normalised weights (the code normalized when they do not sum to 1 within 1e-12; null when they cannot be) */
  function normW(raw, I) {
    if (!raw.every(v => fin(v) && v >= 0)) return null;
    const s = sum(raw); if (!(s > 0)) return null;
    if (abs(s - 1) > 1e-12) I.add('normalized');
    return raw.map(v => v / s);
  }
  const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  /** the Kolmogorov limit Q_K(x) = P(sup|B| > x) = 2 Σ (−1)^{k−1} e^{−2k²x²}; for x < 1 from the theta form of the cdf
      √(2π)/x Σ e^{−(2k−1)²π²/8x²} (Kolmogorov 1933; both series converge in a few terms) */
  function kolmQ(x) {
    if (!(x > 0)) return 1;
    if (x < 1) { let s = 0; for (let k = 1; k <= 20; k++) s += exp(-(2 * k - 1) * (2 * k - 1) * PI * PI / (8 * x * x)); return 1 - sqrt(2 * PI) / x * s; }
    let s = 0; for (let k = 1; k <= 100; k++) { const t = exp(-2 * k * k * x * x); s += (k % 2 ? 1 : -1) * t; if (t < 1e-300) break; }
    return min(1, 2 * s);
  }
  /** P(D⁺_n ≥ d), the one-sided Smirnov statistic exactly (Birnbaum & Tingey 1951): d Σ_{j ≤ n(1−d)} C(n, j)(1 − d − j/n)^{n−j}
      (d + j/n)^{j−1}, every term positive, summed in logs */
  function smirnovSf(n, d) {
    if (!(d > 0)) return 1;
    if (d >= 1) return 0;
    const J = floor(n * (1 - d) + 1e-12); let mx = -Infinity; const L = [];
    for (let j = 0; j <= J; j++) {
      const a = 1 - d - j / n; if (a <= 0 && n - j > 0) continue;
      const v = lchoose(n, j) + (n - j > 0 ? (n - j) * log(a) : 0) + (j - 1) * log(d + j / n);
      L.push(v); if (v > mx) mx = v;
    }
    let s = 0; for (const v of L) s += exp(v - mx);
    return min(1, d * exp(mx) * s);
  }
  /** P(D_n < d) exactly: Durbin's matrix (Durbin 1973) as Marsaglia, Tsang & Wang (2003, J. Stat. Softw. 8:18) build it,
      k = ⌊nd⌋ + 1, m = 2k − 1, h = k − nd; n!/n^n·(H^n)_{kk} by n products H·v (each step scaled by i/n, the n!/n^n factor;
      a lower Hessenberg H, ~m²/2 work per step) */
  function kolmCdfExact(n, d) {
    const k = floor(n * d) + 1, m = 2 * k - 1, h = k - n * d;
    const H = new Float64Array(m * m), fct = [1]; for (let i = 1; i <= m + 1; i++) fct.push(fct[i - 1] * i);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i - j + 1 >= 0) H[i * m + j] = 1 / fct[i - j + 1];
    for (let i = 0; i < m; i++) { H[i * m] -= pow(h, i + 1) / fct[i + 1]; H[(m - 1) * m + i] -= pow(h, m - i) / fct[m - i]; }
    H[(m - 1) * m] += (2 * h - 1 > 0 ? pow(2 * h - 1, m) : 0) / fct[m];
    let v = new Float64Array(m), w = new Float64Array(m), e10 = 0; v[k - 1] = 1;
    for (let step = 1; step <= n; step++) {
      const f = step / n;
      for (let i = 0; i < m; i++) { let s = 0; const jm = min(m - 1, i + 1); for (let j = 0; j <= jm; j++) s += H[i * m + j] * v[j]; w[i] = s * f; }
      const t = v; v = w; w = t;
      const big = abs(v[k - 1]) > 1e140 || v.some(x => abs(x) > 1e140);
      if (big) { for (let i = 0; i < m; i++) v[i] *= 1e-140; e10 += 140; }
    }
    return v[k - 1] * pow(10, e10);
  }
  /** P(D_n ≥ d), two-sided: exact (Durbin–MTW) where n d² < 7, with the one-sided bound 2·P(D⁺ ≥ d) in the far tail (exact for
      d ≥ ½; below a tail of 1e-4 its error P(D⁺ ≥ d, D⁻ ≥ d) is < 1e-13 relative) — the split of Simard & L'Ecuyer (2011, J.
      Stat. Softw. 39:11) */
  function kolmSf(n, d) {
    if (!(d > 0)) return 1;
    if (d >= 1) return 0;
    if (d <= 0.5 / n) return 1;
    if (d >= 0.5 || n * d * d >= 7) return min(1, 2 * smirnovSf(n, d));
    const s = 1 - kolmCdfExact(n, d);
    return s < 1e-4 ? min(1, 2 * smirnovSf(n, d)) : min(1, max(0, s));
  }
  /* ---------- matrices (row arrays) ---------- */
  /** Cholesky A = L Lᵀ (null when A is not positive definite) */
  function chol(A) {
    const K = A.length, L = A.map(() => new Array(K).fill(0));
    for (let j = 0; j < K; j++) {
      let s = A[j][j]; for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
      if (!(s > 1e-14 * abs(A[j][j])) || !(s > 0)) return null;
      L[j][j] = sqrt(s);
      for (let i = j + 1; i < K; i++) { let t = A[i][j]; for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k]; L[i][j] = t / L[j][j]; }
    }
    return L;
  }
  /** least squares by Householder QR (Golub & Van Loan, Matrix Computations 4th ed. 2013, §5.3): X (N rows of p), y →
      {beta, R⁻¹, fitted, lev (the diagonal of the hat matrix), rank}; rank < p when a column is (numerically) dependent */
  function qrLS(X, y) {
    const N = X.length, p = X[0].length, Acol = [];
    for (let j = 0; j < p; j++) { const c = new Float64Array(N); for (let i = 0; i < N; i++) c[i] = X[i][j]; Acol.push(c); }
    const b = Float64Array.from(y), V = [], beta_ = [], diag = [];
    let scale = 0; for (const c of Acol) for (const v of c) scale = max(scale, abs(v));
    for (let j = 0; j < p; j++) {
      const c = Acol[j]; let nr = 0; for (let i = j; i < N; i++) nr += c[i] * c[i]; nr = sqrt(nr);
      if (!(nr > 1e-11 * max(scale, 1e-300) * sqrt(N))) return { rank: j };
      const alpha = c[j] > 0 ? -nr : nr, v = new Float64Array(N);
      for (let i = j; i < N; i++) v[i] = c[i]; v[j] -= alpha;
      let vv = 0; for (let i = j; i < N; i++) vv += v[i] * v[i];
      const ap = Q => { let s = 0; for (let i = j; i < N; i++) s += v[i] * Q[i]; s = 2 * s / vv; for (let i = j; i < N; i++) Q[i] -= s * v[i]; };
      for (let k = j; k < p; k++) ap(Acol[k]);
      ap(b); V.push({ v, vv, j }); diag.push(Acol[j][j]);
    }
    const R = []; for (let i = 0; i < p; i++) { R.push(new Array(p).fill(0)); for (let j = i; j < p; j++) R[i][j] = Acol[j][i]; }
    const beta = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < p; j++) s -= R[i][j] * beta[j]; beta[i] = s / R[i][i]; }
    const Ri = []; for (let i = 0; i < p; i++) Ri.push(new Array(p).fill(0));
    for (let c = 0; c < p; c++) for (let i = c; i >= 0; i--) { let s = i === c ? 1 : 0; for (let j = i + 1; j <= c; j++) s -= R[i][j] * Ri[j][c]; Ri[i][c] = s / R[i][i]; }
    const lev = new Float64Array(N);   // h_ii = Σ_j Q_ij² for the thin Q = H_1 ⋯ H_p [I; 0]
    for (let c = 0; c < p; c++) {
      const q = new Float64Array(N); q[c] = 1;
      for (let t = V.length - 1; t >= 0; t--) { const { v, vv, j } = V[t]; let s = 0; for (let i = j; i < N; i++) s += v[i] * q[i]; s = 2 * s / vv; for (let i = j; i < N; i++) q[i] -= s * v[i]; }
      for (let i = 0; i < N; i++) lev[i] += q[i] * q[i];
    }
    const fitted = X.map(r => { let s = 0; for (let j = 0; j < p; j++) s += r[j] * beta[j]; return s; });
    return { beta, Ri, fitted, lev, rank: p };
  }
  /** the eigen decomposition of a symmetric matrix by cyclic Jacobi rotations (Jacobi 1846; Golub & Van Loan §8.5; NR §11.1),
      sorted by decreasing eigenvalue; each eigenvector's largest component made positive */
  function symEig(S) {
    const K = S.length, A = S.map(r => r.slice()), Vm = S.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0, tot = 0; for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { tot += A[i][j] * A[i][j]; if (i !== j) off += A[i][j] * A[i][j]; }
      if (off <= 1e-32 * tot || off === 0) break;
      for (let p = 0; p < K - 1; p++) for (let q = p + 1; q < K; q++) {
        if (A[p][q] === 0) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (abs(th) + sqrt(th * th + 1)), c = 1 / sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < K; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < K; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < K; k++) { const vkp = Vm[k][p], vkq = Vm[k][q]; Vm[k][p] = c * vkp - s * vkq; Vm[k][q] = s * vkp + c * vkq; }
      }
    }
    const idx = Array.from({ length: K }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
    const vals = idx.map(i => A[i][i]), vecs = idx.map(i => { const v = Vm.map(r => r[i]); let bi = 0; for (let k = 1; k < K; k++) if (abs(v[k]) > abs(v[bi]) + 1e-12) bi = k; return v[bi] < 0 ? v.map(x => -x) : v; });
    return { vals, vecs };   // vecs[j] = the j-th eigenvector (component k = variable k)
  }

  /* ===================================================================================================================== */
  /* combin — the multinomial law (its exact test), the coupon collector, the birthday problem (exact and generalised)       */
  /* ===================================================================================================================== */
  /** h[m] = P(m balls thrown with the weights w leave no cell with ≥ k balls), m = 0 … M: the exponential generating function
      Π_j Σ_{i<k} (w_j z)^i/i! built cell by cell in its normalised form (each step a binomial split of the balls between the
      cells so far and the new one; every term positive, so no cancellation) — the method of the generalised birthday problem
      (Diaconis & Mosteller 1989; Mase 1992 for unequal probabilities) and of the maximum load of balls in bins */
  function noCoincide(w, M, k) {
    const ws = w.filter(v => v > 0), h = new Float64Array(M + 1);
    if (!ws.length) return h;
    for (let m = 0; m <= M; m++) h[m] = m < k ? 1 : 0;
    let s = ws[0];
    for (let j = 1; j < ws.length; j++) {
      const s2 = s + ws[j], u = ws[j] / s2, lq = log1p(-u), rr = u / (1 - u);
      for (let m = M; m >= 1; m--) {
        let b = exp(m * lq), acc = b * h[m];
        for (let i = 1; i < k && i <= m; i++) { b *= (m - i + 1) / i * rr; acc += b * h[m - i]; }
        h[m] = acc;
      }
      s = s2;
    }
    return h;
  }
  /** the coupon collector's P(T ≤ m), m = 0 … M: T = the draws until `want` of the types have each been drawn `copies` times;
      the types added one by one with a binomial split of the draws (Flajolet, Gardy & Thimonier 1992, the exponential
      generating function Π_i (e^{p_i z} − S_r(p_i z)), here in its positive normalised form); equal probabilities with one copy:
      the chain of the number collected (Feller 1968 §II.11) */
  function couponCdf(p, M, r, c) {
    const n = p.length, eq = p.every(v => abs(v - p[0]) < 1e-15);
    const out = new Float64Array(M + 1);
    if (eq && r === 1) {
      let v = new Float64Array(c + 1); v[0] = 1; out[0] = c === 0 ? 1 : 0;
      for (let k = 1; k <= M; k++) { for (let j = c; j >= 1; j--) v[j] = (j === c ? v[j] : v[j] * j / n) + v[j - 1] * (n - j + 1) / n; v[0] = 0; out[k] = v[c]; }
      return out;
    }
    const ps = p.filter(v => v > 0).sort((a, b) => b - a), full = c === n, J = full ? 1 : c + 1, row = new Float64Array(M + 1);
    let G = []; for (let j = 0; j < J; j++) G.push(new Float64Array(M + 1));
    for (let k = 0; k <= M; k++) { if (full) G[0][k] = k >= r ? 1 : 0; else G[min(c, k >= r ? 1 : 0)][k] = 1; }
    let s = ps[0];
    for (let t = 1; t < ps.length; t++) {
      const s2 = s + ps[t], u = ps[t] / s2, N = []; for (let j = 0; j < J; j++) N.push(new Float64Array(M + 1));
      for (let k = 0; k <= M; k++) {
        binomRow(k, u, row);
        for (let i = 0; i <= k; i++) {
          const b = row[i]; if (b === 0) continue;
          if (full) { if (i >= r) N[0][k] += b * G[0][k - i]; }
          else { const add = i >= r ? 1 : 0; for (let j = 0; j < J; j++) { const g = G[j][k - i]; if (g) N[min(c, j + add)][k] += b * g; } }
        }
      }
      G = N; s = s2;
    }
    for (let k = 0; k <= M; k++) out[k] = full ? (ps.length === n ? G[0][k] : 0) : G[c][k];
    return out;
  }
  function runCombin(m, R, I) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} }, kind = m.kind, A = Array.isArray;
    if (kind === 'multinomial') {
      const n = g(m, 'n'), P = normW(m.probs.map(R), I);
      if (!(Number.isInteger(n) && n >= 0) || !P) { I.add('param'); return out; }
      const K = P.length, iI = g(m, 'i', 0), jI = g(m, 'j', 1);
      P.forEach((p, i) => { o['mean.' + i] = n * p; o['var.' + i] = n * p * (1 - p); });
      if (iI < K && jI < K) { o.cov = iI === jI ? n * P[iI] * (1 - P[iI]) : -n * P[iI] * P[jI]; o.corr = iI === jI ? 1 : -sqrt(P[iI] * P[jI] / ((1 - P[iI]) * (1 - P[jI]))); }
      o.outcomes = exp(lchoose(n + K - 1, K - 1));
      /* ln P(x) as a chain of binomials (Loader's saddle point in each: no factorial overflow): x_1 ~ B(n, p_1), x_2 | x_1 ~
         B(n − x_1, p_2/(1 − p_1)), … */
      const lp = x => { let rem = n, remP = 1, l = 0; for (let i = 0; i < K - 1; i++) { const q = remP > 0 ? min(1, P[i] / remP) : 0; l += ldbinom(x[i], rem, q, 1 - q); rem -= x[i]; remP -= P[i]; } return rem === x[K - 1] ? l : -Infinity; };
      const ii = (iI < K ? iI : 0), M2 = min(n, 2000), kk = [], mg = [];
      for (let x = 0; x <= M2; x++) { kk.push(x); mg.push(exp(ldbinom(x, n, P[ii], 1 - P[ii]))); }
      sr.k = kk; sr.marg = mg;
      if (A(m.x)) {
        const x = m.x.map(R);
        if (!x.every(v => Number.isInteger(v) && v >= 0) || sum(x) !== n) { I.add('param'); return out; }
        const L = lp(x); o.logpmf = L; o.pmf = exp(L); if (o.pmf === 0 && L > -Infinity) I.add('underflow');
        let X2 = 0, df = -1; P.forEach((p, i) => { if (p > 0) { X2 += (x[i] - n * p) * (x[i] - n * p) / (n * p); df++; } });
        o.chi2 = X2; o.pChi2 = df > 0 ? gammaPQ(df / 2, X2 / 2)[1] : NaN;
        /* the exact multinomial test: Σ P(y) over the outcomes no more likely than x (R's rule: within 1e-7 relative), by
           enumeration of every composition of n (≤ 2·10⁶ of them) */
        if (o.outcomes > 2e6) I.add('budget');
        else {
          const lim = L + log1p(1e-7), y = new Array(K); let tot = 0, c = 0;
          const rec = (i, rem, remP, l) => {
            if (i === K - 1) { if (remP <= 1e-15 && rem > 0) return; const ll = l; if (ll <= lim) tot += exp(ll); c++; return; }
            const q = remP > 0 ? min(1, P[i] / remP) : 0;
            for (let v = 0; v <= rem; v++) { y[i] = v; const t = ldbinom(v, rem, q, 1 - q); if (t === -Infinity) continue; rec(i + 1, rem - v, remP - P[i], l + t); }
          };
          rec(0, n, 1, 0); o.pExact = min(1, tot);
        }
      }
      return out;
    }
    if (kind === 'coupon') {
      const raw = A(m.probs) ? m.probs.map(R) : null, n = raw ? raw.length : g(m, 'types');
      const P = raw ? normW(raw, I) : (Number.isInteger(n) && n >= 1 ? new Array(n).fill(1 / n) : null);
      const r = g(m, 'copies', 1), c = g(m, 'want', n);
      if (!P || !(Number.isInteger(r) && r >= 1) || !(Number.isInteger(c) && c >= 1 && c <= n)) { I.add('param'); return out; }
      const pos = P.filter(v => v > 0).length, eq = P.every(v => abs(v - P[0]) < 1e-15);
      if (c > pos) { I.add('param'); Object.assign(o, { eT: Infinity, varT: Infinity, sdT: Infinity }); return out; }
      if (eq && r === 1) {   // Σ_{i<c} n/(n − i) and Σ_{i<c} n·i/(n − i)² (the geometric waiting times; Feller 1968 §IX.3)
        let e = 0, v = 0; for (let i = 0; i < c; i++) { e += n / (n - i); v += n * i / ((n - i) * (n - i)); }
        o.eT = e; o.varT = v;
      } else {
        /* Poissonisation (Flajolet, Gardy & Thimonier 1992, Thm 2.1; Holst 1986): E T = ∫₀^∞ P(fewer than c types complete at
           time t) dt, each type complete with P(r, p_i t) independently; E T² = 2∫ t·(…) dt − E T; exp-sinh quadrature */
        if (P.length * (c + 1) * 4609 > 4e7) { I.add('budget'); return out; }
        const S = t => {
          if (c === n) { let l = 0; for (const p of P) { const q = gammaPQ(r, p * t); l += q[2]; } return -expm1(l); }
          const d = poisBinom(P.map(p => gammaPQ(r, p * t)[0]), c); let s = 0; for (let j = 0; j < c; j++) s += d[j]; return s;
        };
        const sc = (log(n) + r) / min(...P.filter(v => v > 0));
        const e = expsinh(w => S(sc * w) * sc), e2 = 2 * expsinh(w => sc * w * S(sc * w) * sc) - e;
        o.eT = e; o.varT = max(0, e2 - e * e);
      }
      o.sdT = sqrt(o.varT);
      o.eTApprox = c === n ? n * (log(n) + (r - 1) * (n > 1 ? log(log(n)) : 0) + EULER - lgamma(r)) : r === 1 ? n * log(n / (n - c + 0.5)) : NaN;   // Newman & Shepp 1960
      const mq = g(m, 'm', NaN), Mser = m.mMax !== undefined ? m.mMax : min(2000, max(c * r, Math.ceil(o.eT + 6 * o.sdT)));
      const M = max(Mser, fin(mq) ? mq : 0), eqFast = eq && r === 1;
      const cost = eqFast ? M * c : P.length * (c === n ? 1 : c + 1) * M * M / 2;
      if (cost > 4e7) { I.add('budget'); return out; }
      const F = couponCdf(P, M, r, c);
      if (fin(mq)) o.pDone = F[mq];
      const mm = [], pm = [], cm = []; for (let k = 0; k <= Mser; k++) { mm.push(k); cm.push(F[k]); pm.push(k ? max(0, F[k] - F[k - 1]) : F[0]); }
      sr.m = mm; sr.pmfT = pm; sr.cdfT = cm;
      let med = NaN; for (let k = 0; k <= M; k++) if (F[k] >= 0.5) { med = k; break; }
      o.median = med;
      return out;
    }
    // birthday: P(some day is shared by ≥ k of n people), equal or unequal day weights (Diaconis & Mosteller 1989; Mase 1992)
    const raw = A(m.probs) ? m.probs.map(R) : null, d = raw ? raw.length : g(m, 'days', 365);
    const P = raw ? normW(raw, I) : (Number.isInteger(d) && d >= 1 ? null : undefined);
    const k = g(m, 'k', 2), n = g(m, 'people', NaN), tgt = g(m, 'target', 0.5);
    if (P === undefined || (raw && !P) || !(Number.isInteger(k) && k >= 2) || !(tgt > 0 && tgt <= 1) || (m.people !== undefined && !(Number.isInteger(n) && n >= 0))) { I.add('param'); return out; }
    const W = P || new Array(d).fill(1 / d), dPos = W.filter(v => v > 0).length, cap = (k - 1) * dPos + 1;   // pigeonhole: cap people always share
    const lam = nn => exp(lchoose(nn, k)) * sum(W.map(v => pow(v, k)));   // the expected number of k-sets on one day
    o.expPairs = fin(n) ? n * (n - 1) / 2 * sum(W.map(v => v * v)) : NaN;
    if (fin(n)) o.pApprox = -expm1(-lam(n));   // the Poisson approximation 1 − e^{−λ}
    const closed = !P && k === 2;   // 1 − Π (1 − i/d): exact in logs
    const noneClosed = nn => (nn > d ? 0 : exp(Array.from({ length: nn }, (_, i) => log1p(-i / d)).reduce((a, b) => a + b, 0)));
    const matchClosed = nn => (nn > d ? 1 : -expm1(Array.from({ length: nn }, (_, i) => log1p(-i / d)).reduce((a, b) => a + b, 0)));
    let M = max(fin(n) ? n : 0, m.nMax || 0, 64), H = null;
    for (let it = 0; it < 30; it++) {
      M = min(M, cap);
      if (!closed) { if (dPos * M * k > 4e7) { I.add('budget'); break; } H = noCoincide(W, M, k); }
      const pm = nn => (closed ? matchClosed(nn) : 1 - H[nn]);
      if (pm(M) >= tgt || M >= cap) { let f = NaN; for (let x = 0; x <= M; x++) if (pm(x) >= tgt) { f = x; break; } o.nFor = f; break; }
      M *= 2;
    }
    const Pm = nn => (nn >= cap ? 1 : closed ? matchClosed(nn) : H && nn < H.length ? 1 - H[nn] : NaN);
    if (fin(n)) { o.pMatch = Pm(n); o.pNone = n >= cap ? 0 : closed ? noneClosed(n) : H && n < H.length ? H[n] : NaN; }
    const nMax = m.nMax || min(2000, max(fin(n) ? n : 0, fin(o.nFor) ? 3 * o.nFor : 100)), ng = [], pb = [], ab = [];
    if (!closed && (!H || H.length <= min(nMax, cap - 1))) { if (dPos * nMax * k <= 4e7) H = noCoincide(W, min(nMax, cap), k); }
    for (let x = 0; x <= nMax; x++) { ng.push(x); pb.push(Pm(x)); ab.push(-expm1(-lam(x))); }
    sr.nGrid = ng; sr.pByN = pb; sr.approxByN = ab;
    return out;
  }

  /* ===================================================================================================================== */
  /* gof — goodness of fit: Kolmogorov–Smirnov (one and two samples, exact), Shapiro–Wilk (Royston 1995), Anderson–Darling   */
  /* (Marsaglia & Marsaglia 2004; D'Agostino & Stephens 1986 with estimated parameters), χ² of binned data                    */
  /* ===================================================================================================================== */
  const polyv = (c, x) => { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * x + c[i]; return r; };
  /** Shapiro–Wilk W and its p value: Royston's AS R94 (Appl. Stat. 44:547, 1995; R swilk.c): the coefficients from the normal
      scores m_i = Φ⁻¹((i − 3/8)/(n + 1/4)) with Royston's polynomial corrections of the two extreme ones, W as the squared
      correlation (1 − W kept for W near 1), p by the normalising transformations (n = 3 exact; 4 ≤ n ≤ 11; n ≥ 12) */
  function shapiroWilk(xs) {
    const x = Array.from(xs).sort((a, b) => a - b), n = x.length, nn2 = floor(n / 2), a = new Array(nn2 + 1).fill(0);
    if (n < 3) return { w: NaN, p: NaN, code: 'few-data' };
    const small = 1e-19, c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
    if (n === 3) a[1] = Math.SQRT1_2;
    else {
      const an25 = n + 0.25, mm = [0]; let summ2 = 0;
      for (let i = 1; i <= nn2; i++) { const v = qnorm((i - 0.375) / an25); mm.push(v); summ2 += v * v; }
      summ2 *= 2; const ssumm2 = sqrt(summ2), rsn = 1 / sqrt(n), a1 = polyv(c1, rsn) - mm[1] / ssumm2;
      let i1, fac;
      if (n > 5) { i1 = 3; const a2 = -mm[2] / ssumm2 + polyv(c2, rsn); fac = sqrt((summ2 - 2 * mm[1] * mm[1] - 2 * mm[2] * mm[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2)); a[2] = a2; }
      else { i1 = 2; fac = sqrt((summ2 - 2 * mm[1] * mm[1]) / (1 - 2 * a1 * a1)); }
      a[1] = a1; for (let i = i1; i <= nn2; i++) a[i] = -mm[i] / fac;
    }
    const range = x[n - 1] - x[0];
    if (range < small) return { w: NaN, p: NaN, code: 'zero-range' };
    let sx = x[0] / range, sa = -a[1];
    for (let i = 1, j = n - 1; i < n; j--) { const xi = x[i] / range; sx += xi; i++; if (i !== j) sa += Math.sign(i - j) * a[min(i, j)]; }
    sa /= n; sx /= n;
    let ssa = 0, ssx = 0, sax = 0;
    for (let i = 0, j = n - 1; i < n; i++, j--) {
      const asa = i !== j ? Math.sign(i - j) * a[1 + min(i, j)] - sa : -sa, xsx = x[i] / range - sx;
      ssa += asa * asa; ssx += xsx * xsx; sax += asa * xsx;
    }
    const ssassx = sqrt(ssa * ssx), w1 = (ssassx - sax) * (ssassx + sax) / (ssa * ssx), w = 1 - w1;
    if (n === 3) { const p = 1.90985931710274 * (asin(sqrt(w)) - 1.0471975511966); return { w, p: max(0, p) }; }
    const y0 = log(w1), xx = log(n);
    let y = y0, mu, s;
    if (n <= 11) { const gm = polyv([-2.273, 0.459], n); if (y >= gm) return { w, p: 1e-99 }; y = -log(gm - y); mu = polyv([0.544, -0.39978, 0.025054, -6.714e-4], n); s = exp(polyv([1.3822, -0.77857, 0.062767, -0.0020322], n)); }
    else { mu = polyv([-1.5861, -0.31082, -0.083751, 0.0038915], xx); s = exp(polyv([-0.4803, -0.082676, 0.0030302], xx)); }
    return { w, p: ncdf(-(y - mu) / s) };
  }
  /** the limiting Anderson–Darling cdf and its finite-n correction (Marsaglia & Marsaglia 2004, J. Stat. Softw. 9:2, ADinf and
      errfix; |error| < 2e-6 for every n ≥ 1 by their check) */
  function adInf(z) {
    if (!(z > 0)) return 0;
    if (z < 2) return exp(-1.2337141 / z) / sqrt(z) * (2.00012 + (0.247105 - (0.0649821 - (0.0347962 - (0.011672 - 0.00168691 * z) * z) * z) * z) * z);
    return exp(-exp(1.0776 - (2.30695 - (0.43424 - (0.082433 - (0.008056 - 0.0003146 * z) * z) * z) * z) * z));
  }
  function adCdf(n, z) {
    const x = adInf(z);
    let e;
    if (x > 0.8) e = (-130.2137 + (745.2337 - (1705.091 - (1950.646 - (1116.36 - 255.7844 * x) * x) * x) * x) * x) / n;
    else {
      const c = 0.01265 + 0.1757 / n;
      if (x < c) { let t = x / c; t = sqrt(t) * (1 - t) * (49 * t - 102); e = t * (0.0037 / (n * n) + 0.00078 / n + 0.00006) / n; }
      else { let t = (x - c) / (0.8 - c); t = -0.00022633 + (6.54034 - (14.6538 - (14.458 - (8.259 - 1.91864 * t) * t) * t) * t) * t; e = t * (0.04213 / n + 0.01365 / (n * n)); }
    }
    return min(1, max(0, x + e));
  }
  function runGof(m, R, I) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} }, kind = m.kind, alpha = g(m, 'alpha', 0.05);
    const X = Array.isArray(m.x) ? m.x.map(R) : [], Y = Array.isArray(m.y) ? m.y.map(R) : null;
    if (!X.length || !X.every(fin) || (Y && !Y.every(fin)) || !(alpha > 0 && alpha < 1)) { I.add('param'); return out; }
    const xs = Array.from(X).sort((a, b) => a - b), n = xs.length; o.n = n;
    const hasTies = a => { for (let i = 1; i < a.length; i++) if (a[i] === a[i - 1]) return true; return false; };
    const done = () => { if (fin(o.p)) o.reject = o.p < alpha ? 1 : 0; return out; };
    const ecdf = (F) => { const ex = [], ey = [], cy = []; for (let i = 0; i < n; i++) { ex.push(xs[i]); ey.push((i + 1) / n); if (F) cy.push(F(xs[i])); } sr.ecdfX = ex; sr.ecdfY = ey; if (F) sr.cdfY = cy; };
    const qq = () => { const a = [], b = []; for (let i = 0; i < n; i++) { a.push(qnorm((i + 1 - 0.375) / (n + 0.25))); b.push(xs[i]); } sr.qqX = a; sr.qqY = b; };
    if (kind === 'ks-one') {
      const D = mkDist(m.dist, R, I); if (!D) { I.add('param'); return out; }
      if (D.disc) I.add('discrete');
      if (hasTies(xs)) I.add('ties');
      let dp = 0, dm = 0; for (let i = 0; i < n; i++) { const F = D.cdf(xs[i]); dp = max(dp, (i + 1) / n - F); dm = max(dm, F - i / n); }
      const alt = m.alt || 'two-sided', Dn = alt === 'greater' ? dp : alt === 'less' ? dm : max(dp, dm);
      o.dPlus = dp; o.dMinus = dm; o.stat = Dn;
      o.pAsym = alt === 'two-sided' ? kolmQ(sqrt(n) * Dn) : exp(-2 * n * Dn * Dn);
      o.p = m.exact === false ? o.pAsym : alt === 'two-sided' ? kolmSf(n, Dn) : smirnovSf(n, Dn);
      if (m.exact === false) I.add('approx');
      ecdf(x => D.cdf(x)); qq();
      return done();
    }
    if (kind === 'ks-two') {
      const ys = Array.from(Y).sort((a, b) => a - b), n2 = ys.length; o.n2 = n2;
      if (n < 1 || n2 < 1) { I.add('few-data'); return out; }
      /* the checkpoints: the ends of the blocks of equal values in the pooled sample (ties: the exact law conditional on the
         tie pattern, Schröer & Trenkler 1995 — what R ≥ 4.3 psmirnov does); D as an integer max |i·n2 − j·n1| */
      const all = xs.concat(ys).sort((a, b) => a - b), ends = new Set(); let ties = false;
      for (let t = 0; t < all.length; t++) { if (t + 1 < all.length && all[t + 1] === all[t]) { ties = true; continue; } ends.add(t + 1); }
      if (ties) I.add('ties');
      let i = 0, j = 0, qmax = 0, qp = 0, qm = 0;
      for (const e of Array.from(ends).sort((a, b) => a - b)) {
        const v = all[e - 1]; while (i < n && xs[i] <= v) i++; while (j < n2 && ys[j] <= v) j++;
        const df = i * n2 - j * n; qmax = max(qmax, abs(df)); qp = max(qp, df); qm = max(qm, -df);
      }
      const alt = m.alt || 'two-sided', q = alt === 'greater' ? qp : alt === 'less' ? qm : qmax, Dn = q / (n * n2);
      o.dPlus = qp / (n * n2); o.dMinus = qm / (n * n2); o.stat = Dn;
      const en = n * n2 / (n + n2);
      o.pAsym = alt === 'two-sided' ? kolmQ(sqrt(en) * Dn) : exp(-2 * en * Dn * Dn);
      if (m.exact === false) { I.add('approx'); o.p = o.pAsym; }
      else {
        /* the lattice-path recursion (Hodges 1957): X(i, j) = the share of the paths to (i, j) that already reached |i·n2 − j·n1| ≥ q at
           a checkpoint; X(i, j) = i/(i+j)·X(i−1, j) + j/(i+j)·X(i, j−1), every term positive (a tiny p keeps its digits) */
        const hit = (a, b) => { const df = a * n2 - b * n; return alt === 'greater' ? df >= q : alt === 'less' ? -df >= q : abs(df) >= q; };
        let prev = new Float64Array(n2 + 1), cur = new Float64Array(n2 + 1);
        for (let a = 0; a <= n; a++) {
          for (let b = 0; b <= n2; b++) {
            let v;
            if (a === 0 && b === 0) v = 0;
            else v = (a > 0 ? a / (a + b) * prev[b] : 0) + (b > 0 ? b / (a + b) * cur[b - 1] : 0);
            if ((a + b) > 0 && ends.has(a + b) && hit(a, b)) v = 1;
            cur[b] = v;
          }
          const t = prev; prev = cur; cur = t;
        }
        o.p = min(1, prev[n2]);
        if (q === 0) o.p = 1;
      }
      return done();
    }
    if (kind === 'shapiro-wilk') {
      const r = shapiroWilk(xs); if (r.code) I.add(r.code);
      o.w = r.w; o.stat = r.w; o.p = r.p; qq(); return done();
    }
    if (kind === 'anderson-darling') {
      let F, lF, lS;
      if (m.estimate === true) {
        if (n < 8) I.add('few-data');
        const mv = meanVar(xs), mu = mv.mean, sd = sqrt(mv.var);
        if (!(sd > 0)) { I.add('zero-range'); return out; }
        F = x => ncdf((x - mu) / sd); lF = x => lncdf((x - mu) / sd); lS = x => lncdf(-(x - mu) / sd);
      } else {
        const D = mkDist(m.dist, R, I); if (!D) { I.add('param'); return out; }
        if (D.disc) I.add('discrete');
        F = x => D.cdf(x); lF = x => D.lcdf(x); lS = x => D.lsf(x);
      }
      let s = 0; for (let i = 0; i < n; i++) s += (2 * i + 1) * (lF(xs[i]) + lS(xs[n - 1 - i]));
      const A2 = -n - s / n; o.stat = A2;
      if (m.estimate === true) {   // case 3 (μ, σ estimated): A*² = A²(1 + 0.75/n + 2.25/n²), p by D'Agostino & Stephens 1986 Table 4.9
        const a = A2 * (1 + 0.75 / n + 2.25 / (n * n)); o.statAdj = a;
        o.p = a < 0.2 ? 1 - exp(-13.436 + 101.14 * a - 223.73 * a * a) : a < 0.34 ? 1 - exp(-8.318 + 42.796 * a - 59.938 * a * a)
          : a < 0.6 ? exp(0.9177 - 4.279 * a - 1.38 * a * a) : a < 10 ? exp(1.2937 - 5.709 * a + 0.0186 * a * a) : 3.7e-24;
        I.add('approx');
      } else { o.p = 1 - adCdf(n, A2); o.pAsym = 1 - adInf(A2); }
      ecdf(F); qq();
      return done();
    }
    // chi2-fit: equiprobable cells of the law (Mann & Wald 1942; default k = ⌈2 n^{2/5}⌉, Moore 1986), or the integers of a discrete law
    const D = mkDist(m.dist, R, I); if (!D) { I.add('param'); return out; }
    const ddof = m.ddof || 0, lo = [], E = [], O = [];
    if (D.disc) {
      const a = D.q(0.0005), b = D.q(0.9995);
      if (!(fin(a) && fin(b)) || b - a > 2000) { I.add('param'); return out; }
      for (let v = a; v <= b; v++) { lo.push(v); E.push(n * (v === a ? D.cdf(v) : v === b ? D.sf(v - 1) : D.pdf(v))); }
      for (let t = 0; t < lo.length; t++) O.push(0);
      for (const v of xs) { const t = v <= a ? 0 : v >= b ? lo.length - 1 : Math.round(v) - a; O[t]++; }
    } else {
      const k = m.bins || max(2, Math.ceil(2 * pow(n, 0.4))), edges = [-Infinity];
      for (let t = 1; t < k; t++) edges.push(D.q(t / k)); edges.push(Infinity);
      for (let t = 0; t < k; t++) { lo.push(edges[t]); E.push(n / k); O.push(0); }
      for (const v of xs) { let t = 0; while (t < k - 1 && v > edges[t + 1]) t++; O[t]++; }
    }
    let X2 = 0, mn = Infinity, low = 0; for (let t = 0; t < E.length; t++) { if (E[t] > 0) X2 += (O[t] - E[t]) * (O[t] - E[t]) / E[t]; mn = min(mn, E[t]); if (E[t] < 5) low++; }
    if (low) I.add('low-expected', low);
    const df = E.length - 1 - ddof; o.stat = X2; o.df = df; o.minExpected = mn;
    if (df < 1) { I.add('param'); return out; }
    o.p = gammaPQ(df / 2, X2 / 2)[1];
    sr.binLo = lo; sr.observed = O; sr.expected = E;
    return done();
  }

  /* ===================================================================================================================== */
  /* mcmc — Metropolis–Hastings (random walk) on any log density, Gibbs on a bivariate normal and on the normal model with  */
  /* semi-conjugate priors; diagnostics of Vehtari, Gelman, Simpson, Carpenter & Bürkner (2021, Bayesian Analysis 16:667):  */
  /* rank-normalised split R̂ (bulk and folded), bulk and tail ESS by Geyer's initial monotone sequence, the MCSE of the mean */
  /* ===================================================================================================================== */
  /** the effective sample size of chains (arrays of equal length): posterior's ess_basic — the biased autocovariances of each chain,
      ρ̂_t = 1 − (W − mean acov_t)/var⁺, Geyer's (1992) initial positive then monotone sequence, τ = −1 + 2Σρ̂ + ρ̂_last,
      τ ≥ 1/log10(S) (Vehtari et al. 2021 eq. 10–11; Stan's reference) */
  function essBasic(ch) {
    const M = ch.length, N = ch[0].length; if (N < 4) return NaN;
    const means = ch.map(c => sum(c) / N), acov = t => { let s = 0; for (let c = 0; c < M; c++) { const x = ch[c], mu = means[c]; let a = 0; for (let i = 0; i + t < N; i++) a += (x[i] - mu) * (x[i + t] - mu); s += a / N; } return s / M; };
    const a0 = acov(0); if (!(a0 > 0)) return NaN;
    const meanVar = a0 * N / (N - 1);
    let varPlus = meanVar * (N - 1) / N;
    if (M > 1) { const mm = sum(means) / M; let b = 0; for (const v of means) b += (v - mm) * (v - mm); varPlus += b / (M - 1); }
    const rho = new Float64Array(N); rho[0] = 1;
    let t = 0, re = 1, ro = 1 - (meanVar - acov(1)) / varPlus; rho[1] = ro;
    while (t < N - 5 && re + ro > 0) {
      t += 2; re = 1 - (meanVar - acov(t)) / varPlus; ro = 1 - (meanVar - acov(t + 1)) / varPlus;
      if (re + ro >= 0) { rho[t] = re; rho[t + 1] = ro; }
    }
    const maxT = t; if (re > 0) rho[maxT] = re;
    for (t = 0; t <= maxT - 4;) { t += 2; if (rho[t] + rho[t + 1] > rho[t - 2] + rho[t - 1]) { rho[t] = (rho[t - 2] + rho[t - 1]) / 2; rho[t + 1] = rho[t]; } }
    let s = 0; for (let i = 0; i < maxT; i++) s += rho[i];
    const S = M * N; let tau = -1 + 2 * s + rho[maxT]; tau = max(tau, 1 / (log(S) / Math.LN10));
    return S / tau;
  }
  /** R̂ of chains: sqrt(((N−1)/N·W + B/N)/W) (Gelman & Rubin 1992; BDA3 §11.4) */
  function rhatBasic(ch) {
    const M = ch.length, N = ch[0].length; if (N < 2 || M < 1) return NaN;
    const mv = ch.map(c => meanVar(c)), W = sum(mv.map(x => x.var)) / M, mm = sum(mv.map(x => x.mean)) / M;
    let B = 0; if (M > 1) { for (const x of mv) B += (x.mean - mm) * (x.mean - mm); B = B * N / (M - 1); }
    if (!(W > 0)) return NaN;
    return sqrt(((N - 1) / N * W + B / N) / W);
  }
  /** split each chain in two halves (the middle draw dropped when odd) */
  const splitCh = ch => { const N = ch[0].length, h = floor(N / 2), out = []; for (const c of ch) { out.push(c.slice(0, h)); out.push(c.slice(N - h)); } return out; };
  /** rank normalisation z = Φ⁻¹((r − 3/8)/(S + 1/4)) over the pooled draws (average ranks for ties; Blom 1958) */
  function rankNorm(ch) {
    const all = [].concat(...ch.map(c => Array.from(c))), rk = ranks(all).r, S = all.length, out = []; let k = 0;
    for (const c of ch) { const z = new Float64Array(c.length); for (let i = 0; i < c.length; i++) z[i] = qnorm((rk[k++] - 0.375) / (S + 0.25)); out.push(z); }
    return out;
  }
  function diagnose(ch) {
    const all = [].concat(...ch.map(c => Array.from(c))), s = sorted(all), med = quant(s, 0.5), sp = splitCh(ch);
    const rb = rhatBasic(rankNorm(sp)), rf = rhatBasic(rankNorm(sp.map(c => c.map(v => abs(v - med)))));
    const q05 = quant(s, 0.05), q95 = quant(s, 0.95), ind = q => sp.map(c => c.map(v => (v <= q ? 1 : 0)));
    const mv = meanVar(all), essM = essBasic(sp);
    return { mean: mv.mean, sd: sqrt(mv.var), q05, q50: med, q95, rhat: max(rb, rf), ess: essBasic(rankNorm(sp)), essTail: min(essBasic(ind(q05)), essBasic(ind(q95))), mcse: sqrt(mv.var / essM) };
  }
  function runMcmc(m, R, I, env, prepared, seed) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} }, kind = m.kind, names = paramNames(m), K = names.length;
    const iters = g(m, 'iters', 2000), burn = g(m, 'burn', floor(iters / 2)), thin = g(m, 'thin', 1), C = m.chains || 4, spread = g(m, 'spread', 2);
    if (!(Number.isInteger(iters) && iters >= 10 && Number.isInteger(burn) && burn >= 0 && burn < iters && Number.isInteger(thin) && thin >= 1 && spread >= 0)) { I.add('param'); return out; }
    if (iters * C * (kind === 'metropolis' ? 1 : 0.2) > 2e5) { I.add('budget'); return out; }
    const r0 = kitStream(seed, 'mcmc.init', I); if (!r0) return out;
    const draws = names.map(() => []), tr = []; let acc = 0, prop = 0;
    if (kind === 'metropolis') {
      const init = m.init.map(R), scale = Array.isArray(m.scale) ? m.scale.map(R) : new Array(K).fill(1);
      if (!init.every(fin) || !scale.every(v => v > 0)) { I.add('param'); return out; }
      const src = m.logdens, f = (prepared && prepared.fns.get(src)) || C_cx(src), e = Object.assign({}, env);
      let nanC = 0;
      const ld = x => { for (let i = 0; i < K; i++) e[names[i]] = x[i]; const v = f(e); if (Number.isNaN(v) || typeof v !== 'number') { nanC++; return -Infinity; } return v; };
      for (let c = 0; c < C; c++) {
        const r = kitStream(seed, 'mcmc.chain' + c, I);
        let x = init.map((v, i) => v + (c ? spread * scale[i] * r0.normal(0, 1) : 0)), lx = ld(x);
        const ch = names.map(() => new Float64Array(floor((iters - burn) / thin))); let kept = 0;
        for (let t = 0; t < iters; t++) {
          const y = x.map((v, i) => v + scale[i] * r.normal(0, 1)), ly = ld(y), lu = log(r());
          if (t >= burn) prop++;
          if (lu < ly - lx || (lx === -Infinity && ly > -Infinity)) { x = y; lx = ly; if (t >= burn) acc++; }
          if (t >= burn && (t - burn) % thin === 0 && kept < ch[0].length) { for (let i = 0; i < K; i++) ch[i][kept] = x[i]; kept++; }
        }
        for (let i = 0; i < K; i++) draws[i].push(ch[i]);
      }
      if (nanC) I.add('nan-density', nanC);
      o.accept = prop ? acc / prop : NaN;
      if (o.accept < 0.1 || o.accept > 0.9) I.add('accept-extreme');
    } else if (kind === 'gibbs-bivnormal') {   // x | y ~ N(ρy, 1 − ρ²), y | x ~ N(ρx, 1 − ρ²) (Geman & Geman 1984; Gelfand & Smith 1990)
      const rho = g(m, 'rho', 0.9), init = Array.isArray(m.init) ? m.init.map(R) : [0, 0];
      if (!(rho > -1 && rho < 1) || init.length !== 2 || !init.every(fin)) { I.add('param'); return out; }
      const sd = sqrt(1 - rho * rho);
      for (let c = 0; c < C; c++) {
        const r = kitStream(seed, 'mcmc.chain' + c, I); let x = init[0] + (c ? spread * r0.normal(0, 1) : 0), y = init[1] + (c ? spread * r0.normal(0, 1) : 0);
        const L = floor((iters - burn) / thin), cx = new Float64Array(L), cy = new Float64Array(L); let kept = 0;
        for (let t = 0; t < iters; t++) { x = r.normal(rho * y, sd); y = r.normal(rho * x, sd); if (t >= burn && (t - burn) % thin === 0 && kept < L) { cx[kept] = x; cy[kept] = y; kept++; } }
        draws[0].push(cx); draws[1].push(cy);
      }
      o.accept = 1;
    } else {   // gibbs-normal: μ | τ normal, τ | μ gamma (the semi-conjugate normal model, BDA3 §11.6 / Gelfand & Smith 1990)
      const x = m.x.map(R), n = x.length, pr = isObj(m.prior) ? m.prior : {};
      const mu0 = g(pr, 'mu0', 0), sd0 = g(pr, 'sd0', 100), a = g(pr, 'a', 0.001), b = g(pr, 'b', 0.001);
      if (n < 2 || !x.every(fin) || !(sd0 > 0 && a > 0 && b > 0) || !fin(mu0)) { I.add('param'); return out; }
      const sx = sum(x), p0 = 1 / (sd0 * sd0), xm = sx / n, s2 = meanVar(x).var;
      for (let c = 0; c < C; c++) {
        const r = kitStream(seed, 'mcmc.chain' + c, I); let mu = xm + (c ? spread * sqrt(s2 / n) * r0.normal(0, 1) : 0), tau = 1 / s2;
        const L = floor((iters - burn) / thin), cm = new Float64Array(L), cs = new Float64Array(L); let kept = 0;
        for (let t = 0; t < iters; t++) {
          const pp = p0 + n * tau; mu = r.normal((p0 * mu0 + tau * sx) / pp, 1 / sqrt(pp));
          let ss = 0; for (const v of x) ss += (v - mu) * (v - mu);
          tau = r.gamma(a + n / 2, 1 / (b + ss / 2));
          if (t >= burn && (t - burn) % thin === 0 && kept < L) { cm[kept] = mu; cs[kept] = 1 / sqrt(tau); kept++; }
        }
        draws[0].push(cm); draws[1].push(cs);
      }
      o.accept = 1;
    }
    const L = draws[0][0].length; o.draws = L * C;
    if (L < 8) { I.add('param'); return out; }
    let rmx = -Infinity, emn = Infinity;
    names.forEach((nm, i) => {
      const d = diagnose(draws[i]);
      for (const k of ['mean', 'sd', 'q05', 'q50', 'q95', 'rhat', 'ess', 'essTail', 'mcse']) o[k + '.' + nm] = d[k];
      rmx = max(rmx, d.rhat); emn = min(emn, d.ess, d.essTail);
      sr['trace.' + nm] = Array.from(draws[i][0]); if (C > 1) sr['trace2.' + nm] = Array.from(draws[i][1]);
      const lags = m.lags || 40, ac = [];
      for (let t = 0; t <= lags; t++) { let s = 0; for (const c of draws[i]) s += acfOf(c, t); ac.push(s / C); }
      sr['acf.' + nm] = ac;
      const h = autoHist([].concat(...draws[i].map(c => Array.from(c))), m.bins || 40, false); sr['histX.' + nm] = h.x; sr['histDensity.' + nm] = h.dens;
    });
    o.rhatMax = rmx; o.essMin = emn;
    if (rmx > 1.01) I.add('not-converged');
    if (emn < 100 * C) I.add('low-ess');
    sr.iter = Array.from({ length: L }, (_, t) => burn + t * thin); sr.lag = Array.from({ length: (m.lags || 40) + 1 }, (_, t) => t);
    return out;
  }
  const C_cx = src => C.cx(src);
  function acfOf(x, t) { const n = x.length; if (t >= n) return NaN; let mu = 0; for (const v of x) mu += v; mu /= n; let c0 = 0, ct = 0; for (let i = 0; i < n; i++) c0 += (x[i] - mu) * (x[i] - mu); for (let i = 0; i + t < n; i++) ct += (x[i] - mu) * (x[i + t] - mu); return c0 > 0 ? ct / c0 : NaN; }

  /* ===================================================================================================================== */
  /* multivar — the multivariate normal (Cholesky), correlation (Pearson, Spearman, Kendall τ_b), linear regression with its */
  /* inference (Householder QR), logistic regression (IRLS), principal components (Jacobi), the Dirichlet law               */
  /* ===================================================================================================================== */
  /** P(X ≤ a, Y ≤ b) of a standard bivariate normal with correlation ρ: ∫_{−∞}^{a} φ(x) Φ((b − ρx)/√(1−ρ²)) dx (Owen 1956 form),
      by the exp-sinh rule after x = a − w */
  function bvn(a, b, rho) {
    if (rho >= 1 - 1e-15) return ncdf(min(a, b));
    if (rho <= -1 + 1e-15) return max(0, ncdf(a) - ncdf(-b));
    const s = sqrt(1 - rho * rho);
    if (a === Infinity) return ncdf(b);
    if (b === Infinity) return ncdf(a);
    return expsinh(w => { const x = a - w; return npdf(x) * ncdf((b - rho * x) / s); });
  }
  function runMultivar(m, R, I, seed) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} }, kind = m.kind, conf = g(m, 'conf', 0.95);
    const mat = M => M.map(r => r.map(R)), A = Array.isArray;
    const pairs = (K, f, pre) => { for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) o[pre + i + '_' + j] = f(i, j); };
    if (kind === 'mvnormal') {
      const mu = m.mu.map(R), K = mu.length, S = A(m.cov) ? mat(m.cov) : null;
      if (!S || !mu.every(fin) || !S.every(r => r.every(fin))) { I.add('param'); return out; }
      for (let i = 0; i < K; i++) for (let j = 0; j < i; j++) if (abs(S[i][j] - S[j][i]) > 1e-12 * max(abs(S[i][j]), 1e-300)) { I.add('param'); return out; }
      o.dim = K; mu.forEach((v, i) => { o['mean.' + i] = v; o['var.' + i] = S[i][i]; o['sd.' + i] = sqrt(S[i][i]); });
      pairs(K, (i, j) => S[i][j], 'cov.'); pairs(K, (i, j) => S[i][j] / sqrt(S[i][i] * S[j][j]), 'corr.');
      const L = chol(S); if (!L) { I.add('not-pd'); return out; }
      pairs(K, (i, j) => L[i][j], 'chol.');
      let ld = 0; for (let i = 0; i < K; i++) ld += 2 * log(L[i][i]); o.logdet = ld;
      if (A(m.x)) {
        const x = m.x.map(R), z = new Array(K);
        for (let i = 0; i < K; i++) { let s = x[i] - mu[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
        const q = z.reduce((a, v) => a + v * v, 0); o.maha = q; o.logpdf = -0.5 * (K * LN_2PI + ld + q); o.pdf = exp(o.logpdf);
        o.pEllipse = gammaPQ(K / 2, q / 2)[0];
        if (K === 1) o.cdf = ncdf((x[0] - mu[0]) / L[0][0]);
        else if (K === 2) o.cdf = bvn((x[0] - mu[0]) / sqrt(S[0][0]), (x[1] - mu[1]) / sqrt(S[1][1]), S[0][1] / sqrt(S[0][0] * S[1][1]));
        else { I.add('dim'); o.cdf = NaN; }
      }
      const nd = g(m, 'n', 0);
      if (nd > 0) {
        const r = kitStream(seed, 'multivar.mvn', I);
        if (r) { const dx = [], dy = []; for (let t = 0; t < nd; t++) { const z = mu.map(() => r.normal(0, 1)), v = mu.map((u, i) => { let s = u; for (let k = 0; k <= i; k++) s += L[i][k] * z[k]; return s; }); dx.push(v[0]); dy.push(K > 1 ? v[1] : 0); } sr.drawX = dx; sr.drawY = dy; }
      }
      if (K >= 2) {   // the conf ellipse of the first two coordinates: μ + √χ²₂(conf)·L₂(cos θ, sin θ)
        const L2 = chol([[S[0][0], S[0][1]], [S[1][0], S[1][1]]]), c = sqrt(-2 * log1p(-conf)), ex = [], ey = [];
        if (L2) for (let t = 0; t <= 200; t++) { const th = 2 * PI * t / 200, u = c * cos(th), v = c * sin(th); ex.push(mu[0] + L2[0][0] * u); ey.push(mu[1] + L2[1][0] * u + L2[1][1] * v); }
        sr.ellX = ex; sr.ellY = ey;
      }
      return out;
    }
    if (kind === 'dirichlet') {   // Dirichlet(α): moments, density, entropy (Kotz, Balakrishnan & Johnson 2000 ch. 49)
      const al = m.conc.map(R), K = al.length, a0 = sum(al);
      if (!al.every(v => v > 0 && fin(v))) { I.add('param'); return out; }
      o.dim = K;
      al.forEach((a, i) => { o['mean.' + i] = a / a0; o['var.' + i] = a * (a0 - a) / (a0 * a0 * (a0 + 1)); o['sd.' + i] = sqrt(o['var.' + i]); });
      pairs(K, (i, j) => (i === j ? o['var.' + i] : -al[i] * al[j] / (a0 * a0 * (a0 + 1))), 'cov.');
      pairs(K, (i, j) => o['cov.' + i + '_' + j] / sqrt(o['var.' + i] * o['var.' + j]), 'corr.');
      const lB = sum(al.map(lgamma)) - lgamma(a0);
      o.entropy = lB + (a0 - K) * digamma(a0) - sum(al.map(a => (a - 1) * digamma(a)));
      if (A(m.x)) {
        const x = m.x.map(R);
        if (!x.every(v => v >= 0 && v <= 1) || abs(sum(x) - 1) > 1e-9) { I.add('param'); o.logpdf = -Infinity; o.pdf = 0; }
        else { o.logpdf = -lB + sum(al.map((a, i) => (a === 1 ? 0 : (a - 1) * log(x[i])))); o.pdf = exp(o.logpdf); }
      }
      const nd = g(m, 'n', 0);
      if (nd > 0) { const r = kitStream(seed, 'multivar.dir', I); if (r) { const dx = [], dy = []; for (let t = 0; t < nd; t++) { const gs = al.map(a => r.gamma(a, 1)), s = sum(gs); dx.push(gs[0] / s); dy.push(gs[1] / s); } sr.drawX = dx; sr.drawY = dy; } }
      return out;
    }
    const X = mat(m.data), N = X.length, K = X[0].length;
    if (!X.every(r => r.every(fin))) { I.add('param'); return out; }
    o.n = N; o.dim = K;
    const colMV = j => meanVar(X.map(r => r[j]));
    if (kind === 'corr' || kind === 'pca') {
      if (N < 3) { I.add('few-data'); return out; }
      const mv = []; for (let j = 0; j < K; j++) mv.push(colMV(j));
      mv.forEach((v, j) => { o['mean.' + j] = v.mean; o['var.' + j] = v.var; o['sd.' + j] = sqrt(v.var); });
      const cov = (i, j) => { let s = 0; for (const r of X) s += (r[i] - mv[i].mean) * (r[j] - mv[j].mean); return s / (N - 1); };
      const S = []; for (let i = 0; i < K; i++) { S.push([]); for (let j = 0; j < K; j++) S[i].push(i === j ? mv[i].var : cov(i, j)); }
      pairs(K, (i, j) => S[i][j], 'cov.'); pairs(K, (i, j) => S[i][j] / sqrt(S[i][i] * S[j][j]), 'corr.');
      if (kind === 'corr') {
        const i = m.i || 0, j = m.j !== undefined ? m.j : min(1, K - 1); if (i >= K || j >= K) { I.add('param'); return out; }
        const xi = X.map(r => r[i]), xj = X.map(r => r[j]);
        const pear = (a, b) => { const ma = sum(a) / a.length, mb = sum(b) / b.length; let sab = 0, saa = 0, sbb = 0; for (let t = 0; t < a.length; t++) { sab += (a[t] - ma) * (b[t] - mb); saa += (a[t] - ma) ** 2; sbb += (b[t] - mb) ** 2; } return sab / sqrt(saa * sbb); };
        const tp = rr => { const t = rr * sqrt((N - 2) / (1 - rr * rr)); return 2 * tsf(abs(t), N - 2); };
        o.r = pear(xi, xj); o.pR = tp(o.r);
        const ri = ranks(xi).r, rj = ranks(xj).r; o.rho = pear(ri, rj); o.pRho = tp(o.rho);   // Spearman: Pearson on ranks, t approximation (R exact = FALSE)
        // Kendall τ_b with the tie-corrected variance of S (Kendall 1970 §4; R cor.test exact = FALSE, no continuity correction)
        let S2 = 0, n1 = 0, n2 = 0;
        for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { const dx = Math.sign(xi[a] - xi[b]), dy = Math.sign(xj[a] - xj[b]); S2 += dx * dy; if (dx === 0) n1++; if (dy === 0) n2++; }
        const n0 = N * (N - 1) / 2; o.tau = S2 / sqrt((n0 - n1) * (n0 - n2));
        const tg = a => { const s = sorted(a), t = []; let c = 1; for (let u = 1; u <= s.length; u++) { if (u < s.length && s[u] === s[u - 1]) c++; else { if (c > 1) t.push(c); c = 1; } } return t; };
        const ti = tg(xi), tj = tg(xj); if (ti.length || tj.length) I.add('ties');
        const v0 = N * (N - 1) * (2 * N + 5), vt = sum(ti.map(t => t * (t - 1) * (2 * t + 5))), vu = sum(tj.map(t => t * (t - 1) * (2 * t + 5)));
        const v1 = sum(ti.map(t => t * (t - 1))) * sum(tj.map(t => t * (t - 1))) / (2 * N * (N - 1)), v2 = sum(ti.map(t => t * (t - 1) * (t - 2))) * sum(tj.map(t => t * (t - 1) * (t - 2))) / (9 * N * (N - 1) * (N - 2));
        const vS = (v0 - vt - vu) / 18 + v1 + v2; o.pTau = 2 * ncdf(-abs(S2) / sqrt(vS));
        return out;
      }
      // pca: the eigen decomposition of the covariance (or, scale: true, the correlation) matrix — prcomp's conventions
      const M2 = m.scale ? S.map((r, i) => r.map((v, j) => v / sqrt(S[i][i] * S[j][j]))) : S, E = symEig(M2), tot = sum(E.vals);
      o.totalVar = tot; let cp = 0;
      E.vals.forEach((v, j) => { o['eig.' + j] = v; o['prop.' + j] = v / tot; cp += v / tot; o['cumProp.' + j] = cp; });
      pairs(K, (i, j) => E.vecs[j][i], 'load.');
      sr.scree = E.vals.slice();
      const z = r => r.map((v, j) => (v - mv[j].mean) / (m.scale ? sqrt(mv[j].var) : 1));
      sr.pc1 = X.map(r => { const u = z(r); return u.reduce((a, v, k) => a + v * E.vecs[0][k], 0); });
      sr.pc2 = K > 1 ? X.map(r => { const u = z(r); return u.reduce((a, v, k) => a + v * E.vecs[1][k], 0); }) : [];
      return out;
    }
    const y = m.y.map(R), ic = m.intercept !== false, D = X.map(r => (ic ? [1].concat(r) : r.slice())), p = D[0].length;
    if (!y.every(fin)) { I.add('param'); return out; }
    if (N <= p) { I.add('few-data'); return out; }
    const tq = -qt((1 - conf) / 2, N - p), zq = -qnorm((1 - conf) / 2);
    if (kind === 'ols') {   // ordinary least squares (Gauss 1809), its exact normal-theory inference (Seber & Lee 2003)
      const f = qrLS(D, y); if (f.rank < p) { I.add('singular'); return out; }
      const res = y.map((v, i) => v - f.fitted[i]), rss = sum(res.map(v => v * v)), df = N - p, s2 = rss / df;
      const ym = sum(y) / N, tss = ic ? sum(y.map(v => (v - ym) * (v - ym))) : sum(y.map(v => v * v));
      o.df = df; o.dfModel = p - (ic ? 1 : 0); o.sigma = sqrt(s2); o.r2 = 1 - rss / tss; o.adjR2 = 1 - (1 - o.r2) * (N - (ic ? 1 : 0)) / df;
      o.fStat = ((tss - rss) / o.dfModel) / s2; o.fP = o.dfModel > 0 ? fD(o.dfModel, df).sf(o.fStat) : NaN;
      o.logLik = -N / 2 * (LN_2PI + log(rss / N) + 1); o.aic = -2 * o.logLik + 2 * (p + 1); o.bic = -2 * o.logLik + log(N) * (p + 1);
      f.beta.forEach((b, j) => {
        let v = 0; for (let k = 0; k < p; k++) v += f.Ri[j][k] * f.Ri[j][k];
        const se = sqrt(s2 * v); o['coef.' + j] = b; o['se.' + j] = se; o['stat.' + j] = b / se; o['p.' + j] = 2 * tsf(abs(b / se), df);
        o['ciLo.' + j] = b - tq * se; o['ciHi.' + j] = b + tq * se;
      });
      sr.fitted = f.fitted; sr.resid = res; sr.lev = Array.from(f.lev);
      sr.cook = res.map((e, i) => e * e * f.lev[i] / (p * s2 * (1 - f.lev[i]) * (1 - f.lev[i])));   // Cook 1977
      return out;
    }
    // logistic: Fisher scoring = IRLS (Nelder & Wedderburn 1972; McCullagh & Nelder 1989 §4.4), R glm's start μ = (y + ½)/(w + 1)
    const w = A(m.w) ? m.w.map(R) : new Array(N).fill(1);
    if (!w.every(v => v > 0 && fin(v)) || y.some((v, i) => v < 0 || v > w[i])) { I.add('param'); return out; }
    const prop = y.map((v, i) => v / w[i]), maxIt = m.maxIter || 50;
    let mu = y.map((v, i) => (v + 0.5) / (w[i] + 1)), eta = mu.map(v => log(v / (1 - v))), beta = null, dev = Infinity, it = 0, conv = false, fit = null;
    const devOf = mm => 2 * sum(y.map((v, i) => (v > 0 ? v * log(v / (w[i] * mm[i])) : 0) + (w[i] - v > 0 ? (w[i] - v) * log((w[i] - v) / (w[i] * (1 - mm[i]))) : 0)));
    for (it = 1; it <= maxIt; it++) {
      const W = mu.map((u, i) => w[i] * u * (1 - u)), z = eta.map((e, i) => e + (prop[i] - mu[i]) / (mu[i] * (1 - mu[i])));
      const sw = W.map(sqrt); fit = qrLS(D.map((r, i) => r.map(v => v * sw[i])), z.map((v, i) => v * sw[i]));
      if (fit.rank < p) { I.add('singular'); return out; }
      beta = fit.beta; eta = D.map(r => r.reduce((a, v, k) => a + v * beta[k], 0)); mu = eta.map(e => 1 / (1 + exp(-e)));
      mu = mu.map(u => min(1 - 1e-15, max(1e-15, u)));
      const d2 = devOf(mu);
      if (abs(d2 - dev) / (abs(d2) + 0.1) < 1e-12) { dev = d2; conv = true; break; }
      dev = d2;
    }
    if (!conv) I.add('no-convergence');
    if (mu.some(u => u < 1e-10 || u > 1 - 1e-10) && beta.some(b => abs(b) > 15)) I.add('separation');   // as R: fitted probabilities 0 or 1
    o.iter = min(it, maxIt); o.deviance = dev; o.df = N - p; o.dfModel = p - (ic ? 1 : 0);
    const pbar = sum(y) / sum(w); o.nullDeviance = devOf(y.map(() => (ic ? pbar : 0.5)));
    o.logLik = sum(y.map((v, i) => ldbinom(v, w[i], mu[i], 1 - mu[i]))); o.aic = -2 * o.logLik + 2 * p; o.bic = -2 * o.logLik + log(N) * p;
    const sw2 = mu.map((u, i) => sqrt(w[i] * u * (1 - u))), f2 = qrLS(D.map((r, i) => r.map(v => v * sw2[i])), D.map(() => 0));
    if (f2.rank < p) { I.add('singular'); return out; }
    beta.forEach((b, j) => {   // Wald inference from the inverse Fisher information (X'WX)⁻¹ = R⁻¹R⁻ᵀ at the fit
      let v = 0; for (let k = 0; k < p; k++) v += f2.Ri[j][k] * f2.Ri[j][k];
      const se = sqrt(v); o['coef.' + j] = b; o['se.' + j] = se; o['stat.' + j] = b / se; o['p.' + j] = 2 * ncdf(-abs(b / se));
      o['ciLo.' + j] = b - zq * se; o['ciHi.' + j] = b + zq * se;
    });
    sr.fitted = mu; sr.resid = y.map((v, i) => prop[i] - mu[i]);
    return out;
  }

  /* ===================================================================================================================== */
  /* rand — randomized algorithms (Motwani & Raghavan, Randomized Algorithms, 1995 = MR; Mitzenmacher & Upfal, Probability  */
  /* and Computing, 2nd ed. 2017 = MU): general, parameterised computations — exact values beside their bounds and seeded   */
  /* simulations (NoemaSimKit streams 'prob.rand.<kind>')                                                                   */
  /* ===================================================================================================================== */
  /** the binomial upper tail P(X ≥ j), X ~ B(n, p) = I_p(j, n − j + 1) */
  const binomGe = (j, n, p) => (j <= 0 ? 1 : j > n ? 0 : ibeta(p, j, n - j + 1, 1 - p)[0]);
  function modpowB(a, e, n) { let r = 1n, b = a % n; while (e > 0n) { if (e & 1n) r = r * b % n; b = b * b % n; e >>= 1n; } return r; }
  /** is a a Miller–Rabin witness of the compositeness of the odd n > 2 (Miller 1976; Rabin 1980)? (BigInt: exact for n < 2^53) */
  function mrWitness(a, n) {
    const N = BigInt(n), A = BigInt(a) % N; if (A === 0n) return false;
    let d = N - 1n, s = 0; while ((d & 1n) === 0n) { d >>= 1n; s++; }
    let x = modpowB(A, d, N); if (x === 1n || x === N - 1n) return false;
    for (let i = 1; i < s; i++) { x = x * x % N; if (x === N - 1n) return false; }
    return true;
  }
  /** deterministic for n < 3.3·10²⁴ with the first 12 primes as bases (Sorenson & Webster 2017) */
  function isPrimeN(n) {
    if (n < 2) return false;
    for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) { if (n === p) return true; if (n % p === 0) return false; }
    for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) if (mrWitness(p, n)) return false;
    return true;
  }
  /** the graph of a cover/hitting-time model: adjacency lists of n vertices */
  function graphOf(m, R, I) {
    const g = getter(R); let n = g(m, 'n'), E = [];
    if (Array.isArray(m.edges)) { E = m.edges.map(e => e.map(R)); if (!fin(n)) n = 1 + max(-1, ...E.map(e => max(e[0], e[1]))); }
    else {
      const G = m.graph;
      if (G === 'hypercube') { if (!(Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0)) return null; for (let u = 0; u < n; u++) for (let b = 1; b < n; b <<= 1) if (u < (u ^ b)) E.push([u, u ^ b]); }
      else {
        if (!(Number.isInteger(n) && n >= 2)) return null;
        if (G === 'path') for (let u = 0; u + 1 < n; u++) E.push([u, u + 1]);
        if (G === 'cycle') for (let u = 0; u < n; u++) E.push([u, (u + 1) % n]);
        if (G === 'complete') for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) E.push([u, v]);
        if (G === 'star') for (let u = 1; u < n; u++) E.push([0, u]);
        if (G === 'lollipop') { const k = Math.ceil(n / 2); for (let u = 0; u < k; u++) for (let v = u + 1; v < k; v++) E.push([u, v]); for (let u = k - 1; u + 1 < n; u++) E.push([u, u + 1]); }
      }
    }
    if (!(Number.isInteger(n) && n >= 1) || !E.every(e => Number.isInteger(e[0]) && Number.isInteger(e[1]) && e[0] >= 0 && e[1] >= 0 && e[0] < n && e[1] < n && e[0] !== e[1])) return null;
    const adj = Array.from({ length: n }, () => []); for (const [u, v] of E) { adj[u].push(v); adj[v].push(u); }
    return { n, E, adj };
  }
  const connected = (G) => { const seen = new Uint8Array(G.n), st = [0]; seen[0] = 1; let c = 1; while (st.length) { const u = st.pop(); for (const v of G.adj[u]) if (!seen[v]) { seen[v] = 1; c++; st.push(v); } } return c === G.n; };
  function runRand(m, R, I, seed, env, prepared) {
    const g = getter(R), o = {}, sr = {}, out = { o, sr, sc: {} }, kind = m.kind, reps = g(m, 'reps', 0), delta = g(m, 'delta', 1e-6);
    const bad = () => { I.add('param'); return out; };
    const rng = () => kitStream(seed, 'rand.' + kind, I);
    const simStats = (v, intBins) => { const mv = meanVar(v); o.simMean = mv.mean; o.simSd = sqrt(mv.var); const h = autoHist(v, intBins ? 0 : 40, false); sr.histX = h.x; sr.histDensity = h.dens; };
    const budget = w => { if (w > 2e7) { I.add('budget'); return false; } return true; };
    switch (kind) {
      case 'amplify': {   // Las Vegas vs Monte Carlo; amplification by independent repetition (MR §1.2, MU §1.2–1.3)
        const k = g(m, 'k', 10), kMax = m.kMax || 50, sided = m.sided || 'one';
        if (m.p !== undefined) { const p = g(m, 'p'); if (!(p > 0 && p <= 1)) return bad(); o.lvExpected = 1 / p; o.lvTail = pow(1 - p, k); }
        if (m.err === undefined) return out;
        const e = g(m, 'err'); if (!(e >= 0 && e <= 1) || !(delta > 0 && delta < 1)) return bad();
        let err;
        if (sided === 'one') {   // one-sided error: wrong only if every run errs — ε^k
          err = kk => pow(e, kk);
          o.kNeeded = e === 0 ? 1 : e === 1 ? Infinity : Math.ceil(log(delta) / log(e) - 1e-12);
          if (e === 1) I.add('not-applicable');
        } else {   // two-sided: the majority of k runs (a tie counts as an error) — P(B(k, ε) ≥ k/2) exactly
          if (!(e < 0.5)) { I.add('not-applicable'); o.errK = NaN; o.kNeeded = Infinity; return out; }
          err = kk => binomGe(Math.ceil(kk / 2), kk, e);
          o.kHoeffding = Math.ceil(log(1 / delta) / (2 * (0.5 - e) * (0.5 - e)));   // Hoeffding: e^{−2k(½−ε)²} ≤ δ
          let lo = 0, hi = 1; while (err(2 * hi + 1) > delta && hi < 1e7) hi *= 2;   // the smallest odd k = 2j + 1
          while (hi - lo > 1) { const mid = floor((lo + hi) / 2); if (err(2 * mid + 1) <= delta) hi = mid; else lo = mid; }
          o.kNeeded = err(1) <= delta ? 1 : 2 * hi + 1;
        }
        o.errK = err(k);
        const kg = [], eb = []; for (let kk = 1; kk <= kMax; kk++) { kg.push(kk); eb.push(err(kk)); } sr.kGrid = kg; sr.errByK = eb;
        return out;
      }
      case 'quicksort': {   // randomized quicksort: E C_n = 2(n+1)H_n − 4n; Var C_n = 7n² − 4(n+1)²H⁽²⁾_n − 2(n+1)H_n + 13n (Knuth, TAOCP 3 §5.2.2, ex. 5.2.2–8; MR §1.1)
        const n = g(m, 'n'); if (!(Number.isInteger(n) && n >= 0)) return bad();
        const H = harm(n);
        o.eComp = 2 * (n + 1) * H - 4 * n; o.varComp = max(0, 7 * n * n - 4 * (n + 1) * (n + 1) * harm2(n) - 2 * (n + 1) * H + 13 * n); o.approxComp = n > 0 ? 2 * n * log(n) : 0;
        if (reps > 0 && budget(reps * n * 2)) {   // the comparisons only depend on the subproblem sizes: C = n − 1 + C(U − 1) + C(n − U)
          const r = rng(); if (!r) return out; const v = [];
          for (let t = 0; t < reps; t++) { const st = [n]; let c = 0; while (st.length) { const s = st.pop(); if (s < 2) continue; c += s - 1; const u = 1 + r.int(s); st.push(u - 1, s - u); } v.push(c); }
          simStats(v);
        }
        return out;
      }
      case 'quickselect': {   // Hoare's FIND with random pivots: E C_{n,r} = 2(n + (n+1)H_n − (n+3−r)H_{n+1−r} − (r+2)H_r + 3) (Knuth 1971; MU ex. 3.23)
        const n = g(m, 'n'), rk = g(m, 'r'); if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(rk) && rk >= 1 && rk <= n)) return bad();
        o.eComp = 2 * (n + (n + 1) * harm(n) - (n + 3 - rk) * harm(n + 1 - rk) - (rk + 2) * harm(rk) + 3);
        const a = rk / n; o.approxComp = 2 * n * (1 - (a > 0 ? a * log(a) : 0) - (a < 1 ? (1 - a) * log(1 - a) : 0));   // 2n(1 + H(α)), H the entropy in nats
        if (reps > 0 && budget(reps * n * 2)) {
          const r = rng(); if (!r) return out; const v = [];
          for (let t = 0; t < reps; t++) { let s = n, q = rk, c = 0; while (s > 1) { c += s - 1; const u = 1 + r.int(s); if (u === q) break; if (q < u) s = u - 1; else { q -= u; s -= u; } } v.push(c); }
          simStats(v);
        }
        return out;
      }
      case 'karger': {   // Karger's contraction: a fixed min cut survives with probability ≥ 1/C(n,2) (Karger 1993; MR §1.1, MU §1.5)
        let n = g(m, 'n'), Gr = null;
        if (Array.isArray(m.edges)) { Gr = graphOf(m, R, I); if (!Gr) return bad(); n = Gr.n; }
        if (!(Number.isInteger(n) && n >= 2)) return bad();
        const p = 2 / (n * (n - 1)), k = g(m, 'k', Math.ceil(n * (n - 1) / 2 * log(n)));
        o.pSuccess = p; o.kRuns = p >= 1 ? 1 : Math.ceil(log(delta) / log1p(-p) - 1e-12); o.pFailK = exp(k * log1p(-p));
        let q = 1; const depth = Math.ceil(2 * log(n) / LN2); for (let t = 0; t < depth; t++) q = q - q * q / 4; o.pKS = q;   // Karger & Stein 1996: P(t+1) = P(t) − P(t)²/4 ≥ 1/(t+1)
        if (Gr) {
          if (!connected(Gr)) { I.add('disconnected'); o.minCut = 0; }
          else if (n <= 20 && budget((1 << (n - 1)) * Gr.E.length)) {   // the exact min cut over the 2^(n−1) bipartitions
            let best = Infinity; for (let s = 1; s < (1 << (n - 1)); s++) { let c = 0; for (const [u, v] of Gr.E) if (((s >> u) & 1) !== ((s >> v) & 1)) c++; if (c < best) best = c; } o.minCut = best;
          }
          if (reps > 0 && budget(reps * Gr.E.length * 4)) {   // contraction = Kruskal on a uniformly random edge order (MR §1.1)
            const r = rng(); if (!r) return out; let ok = 0; const E = Gr.E.slice(), cuts = [];
            for (let t = 0; t < reps; t++) {
              for (let i = E.length - 1; i > 0; i--) { const j = r.int(i + 1); const tt = E[i]; E[i] = E[j]; E[j] = tt; }
              const par = Array.from({ length: n }, (_, i) => i), f = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
              let comp = n; for (const [u, v] of E) { if (comp <= 2) break; const a = f(u), b = f(v); if (a !== b) { par[a] = b; comp--; } }
              let c = 0; for (const [u, v] of E) if (f(u) !== f(v)) c++;
              cuts.push(c); if (c === o.minCut) ok++;
            }
            o.simSuccess = ok / reps; simStats(cuts, true);
          }
        }
        return out;
      }
      case 'freivalds': {   // Freivalds 1977: AB ≠ C is detected by a random r ∈ {0,1}^n with probability ≥ ½ (MR §7.1, MU §1.3)
        const k = g(m, 'k', 10); o.errBound = pow(2, -k); o.kNeeded = Math.ceil(log(1 / delta) / LN2 - 1e-12);
        if (!Array.isArray(m.A)) return out;
        const Am = m.A.map(r => r.map(R)), Bm = m.B.map(r => r.map(R)), Cm = m.Cm.map(r => r.map(R)), n = Am.length;
        if (![Am, Bm, Cm].every(M => M.every(r => r.every(fin)))) return bad();
        const D = Am.map((r, i) => Bm[0].map((_, j) => { let s = 0; for (let k2 = 0; k2 < n; k2++) s += r[k2] * Bm[k2][j]; return s - Cm[i][j]; }));
        const tol = 1e-9 * max(1, ...Cm.map(r => max(...r.map(abs))));
        o.equal = D.every(r => r.every(v => abs(v) <= tol)) ? 1 : 0;
        if (o.equal) { o.pDetect = 0; o.errExact = 0; return out; }
        if (!budget((1 << n) * n * n)) return out;
        let det = 0; for (let s = 0; s < (1 << n); s++) { let hit = false; for (let i = 0; i < n && !hit; i++) { let v = 0; for (let j = 0; j < n; j++) if ((s >> j) & 1) v += D[i][j]; if (abs(v) > tol) hit = true; } if (hit) det++; }
        o.pDetect = det / (1 << n); o.errExact = pow(1 - o.pDetect, k);
        return out;
      }
      case 'primality': {   // Fermat and Miller–Rabin; the strong liars of a composite are ≤ ¼ of the bases (Monier 1980; Rabin 1980; MR §14.6, MU §… )
        const N = g(m, 'N'), a = g(m, 'a', 2), k = g(m, 'k', 10);
        if (!(Number.isInteger(N) && N >= 2 && N <= 9007199254740991)) return bad();
        const pr = isPrimeN(N); o.isPrime = pr ? 1 : 0; o.errBound = pow(4, -k); o.kNeeded = Math.ceil(log(1 / delta) / log(4) - 1e-12);
        o.witness = N > 2 && N % 2 === 1 && Number.isInteger(a) && a >= 1 && a < N ? (mrWitness(a, N) ? 1 : 0) : N % 2 === 0 && N > 2 ? 1 : 0;
        if (N <= 1e5) {
          let fl = 0, ml = 0; const odd = N % 2 === 1;
          const pw = (b, e) => { let r2 = 1, x = b % N; while (e > 0) { if (e & 1) r2 = r2 * x % N; x = x * x % N; e = floor(e / 2); } return r2; };
          for (let b = 1; b < N; b++) { if (pw(b, N - 1) === 1) fl++; if (odd && N > 2 && !mrWitness(b, N)) ml++; }
          if (N === 2) ml = 1;
          o.fermatLiars = fl; o.mrLiars = ml; o.fracFermat = fl / (N - 1); o.fracMR = ml / (N - 1); o.errExact = pr ? 0 : pow(o.fracMR, k);
        } else I.add('big-number');
        if (N <= 1e12) {   // Korselt's criterion: composite, squarefree, p − 1 | N − 1 for every prime p | N
          let x = N, sqf = true, ok = !pr && N > 2; const fs = [];
          for (let p = 2; p * p <= x; p++) { if (x % p) continue; let e = 0; while (x % p === 0) { x /= p; e++; } if (e > 1) sqf = false; fs.push(p); }
          if (x > 1) fs.push(x);
          o.carmichael = ok && sqf && fs.length >= 2 && fs.every(p => (N - 1) % (p - 1) === 0) ? 1 : 0;
        } else I.add('big-number');
        return out;
      }
      case 'rounding': {   // randomized rounding (Raghavan & Thompson 1987; MR §4.3, MU §4.2): Chernoff vs the exact Poisson-binomial tail
        const x = m.x.map(R), dl = g(m, 'delta', 0.5), t = g(m, 't', 1);
        if (!x.every(v => v >= 0 && v <= 1) || !(dl > 0)) return bad();
        const mu = sum(x), d = poisBinom(x); o.mu = mu;
        const up = (1 + dl) * mu, lo = (1 - dl) * mu; let pa = 0, pb = 0;
        for (let j = 0; j < d.length; j++) { if (j >= up - 1e-9) pa += d[j]; if (j <= lo + 1e-9) pb += d[j]; }
        o.pAbove = min(1, pa); o.pBelow = min(1, pb);
        o.chernoffUpper = min(1, exp(mu * (dl - (1 + dl) * log1p(dl))));   // (e^δ/(1+δ)^{1+δ})^μ (MU Thm 4.4)
        o.chernoffLower = dl < 1 ? min(1, exp(-mu * dl * dl / 2)) : NaN;   // e^{−μδ²/2} (MU Thm 4.5)
        o.uncovered = exp(t * sum(x.map(v => log1p(-min(v, 1 - 1e-300) ))));
        if (x.some(v => v === 1)) o.uncovered = 0;
        o.uncoveredBound = exp(-t * mu);
        return out;
      }
      case 'balls': {   // n balls in m bins: max load Θ(ln n/ln ln n); d choices: ln ln n/ln d + O(1) (Azar, Broder, Karlin & Upfal 1999; MU §5.2, §17.1)
        const n = g(m, 'n'), mb = g(m, 'm', n), d = g(m, 'd', 1), Lq = g(m, 'L', NaN);
        if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(mb) && mb >= 1 && Number.isInteger(d) && d >= 1)) return bad();
        o.eCollisions = n * (n - 1) / 2 / mb; o.pCollisionBound = min(1, o.eCollisions);   // a 2-universal family (Carter & Wegman 1979)
        let lc = 0; for (let i = 0; i < n && i < mb; i++) lc += log1p(-i / mb); o.pCollision = n > mb ? 1 : -expm1(lc);
        o.approxMax = d === 1 ? (n > 2 ? log(n) / log(log(n)) : 1) : (n > 2 ? log(log(n)) / log(d) : 1);
        if (d === 1 && mb * n <= 2e7) {   // the exact law of the max load: P(max ≤ L) = noCoincide(uniform, n, L + 1)[n]
          const W = new Array(mb).fill(1 / mb), lg = [], pm = []; let e = 0, prevF = 0;
          for (let L = 0; L <= n; L++) {
            if (!budget(mb * n * (L + 1))) break;
            const F = L >= n ? 1 : noCoincide(W, n, L + 1)[n]; lg.push(L); pm.push(max(0, F - prevF)); e += 1 - F; prevF = F;
            if (L === Lq) o.pMaxLe = F;
            if (1 - F < 1e-17 && (!fin(Lq) || L >= Lq)) break;
          }
          o.eMax = e; sr.loadGrid = lg; sr.pMax = pm;
          if (fin(Lq) && o.pMaxLe === undefined) o.pMaxLe = Lq >= lg[lg.length - 1] ? 1 : NaN;
        }
        if (reps > 0 && budget(reps * (n * d + mb))) {
          const r = rng(); if (!r) return out; const load = new Int32Array(mb), v = [];
          for (let t = 0; t < reps; t++) { load.fill(0); let mx = 0; for (let b = 0; b < n; b++) { let best = r.int(mb); for (let c = 1; c < d; c++) { const j = r.int(mb); if (load[j] < load[best]) best = j; } load[best]++; if (load[best] > mx) mx = load[best]; } v.push(mx); }
          o.simMax = sum(v) / reps; const h = autoHist(v, 0, false); sr.histX = h.x; sr.histDensity = h.dens;
        }
        return out;
      }
      case 'bloom': {   // Bloom 1970; the exact false-positive rate (Bose et al. 2008, corrected by Christensen, Roginsky & Jimeno 2010; MU §5.5.3)
        const mb = g(m, 'm'), n = g(m, 'n'), kOpt = mb / n * LN2, tgt = g(m, 'target', 0.01);
        if (!(Number.isInteger(mb) && mb >= 1 && Number.isInteger(n) && n >= 0)) return bad();
        const cl = k => (n === 0 ? 0 : pow(-expm1(k * n * log1p(-1 / mb)), k)), ap = k => pow(-expm1(-k * n / mb), k);
        o.kOpt = kOpt;
        let kb = max(1, floor(kOpt)); if (cl(kb + 1) < cl(kb)) kb++; o.kOptInt = n === 0 ? 1 : kb;
        const k = g(m, 'k', o.kOptInt); if (!(Number.isInteger(k) && k >= 1)) return bad();
        o.fpClassic = cl(k); o.fpApprox = ap(k); o.mFor = tgt > 0 && tgt < 1 ? Math.ceil(-n * log(tgt) / (LN2 * LN2)) : NaN;
        /* the occupancy law of the set bits after kn uniform throws (a chain i → i + 1 with probability (m − i)/m), kept on the band
           where it is above 1e-40 (≈ ±13 sd, the mass dropped < 1e-36); FP = Σ P(X = i)(i/m)^k */
        const T = k * n, top = min(mb, T);
        if (n === 0) o.fpExact = 0;
        else {
          const v = new Float64Array(top + 2); let lo = 0, hi = 0, work = 0; v[0] = 1;
          for (let s = 0; s < T && work <= 4e7; s++) {
            const nh = min(top, hi + 1);
            for (let i = nh; i >= max(1, lo); i--) v[i] = v[i] * i / mb + v[i - 1] * (mb - i + 1) / mb;
            if (lo === 0) { v[0] = 0; lo = 1; }
            hi = nh; work += hi - lo + 1;
            while (v[lo] < 1e-40 && lo < hi) { v[lo] = 0; lo++; }
            while (v[hi] < 1e-40 && hi > lo) { v[hi] = 0; hi--; }
          }
          if (work > 4e7) I.add('budget');
          else { let fp = 0; for (let i = lo; i <= hi; i++) fp += v[i] * pow(i / mb, k); o.fpExact = fp; }
        }
        const kMax = m.kMax || 20, kg = [], fb = []; for (let kk = 1; kk <= kMax; kk++) { kg.push(kk); fb.push(cl(kk)); } sr.kGrid = kg; sr.fpByK = fb;
        if (reps > 0 && budget(reps * (T + k + mb / 32))) {
          const r = rng(); if (!r) return out; const bits = new Uint8Array(mb); let fpC = 0;
          for (let t = 0; t < reps; t++) { bits.fill(0); for (let s = 0; s < T; s++) bits[r.int(mb)] = 1; let all = true; for (let j = 0; j < k; j++) if (!bits[r.int(mb)]) all = false; if (all) fpC++; }
          o.simFp = fpC / reps;
        }
        return out;
      }
      case 'countmin': {   // Count-Min sketch (Cormode & Muthukrishnan 2005): estimate ≤ f + εN with probability ≥ 1 − δ, ε = e/w, δ = e^{−d}
        const w = g(m, 'w'), d = g(m, 'd'), n = g(m, 'n', 1000), Nt = g(m, 'N', 100000), s = g(m, 's', 1);
        if (!(Number.isInteger(w) && w >= 1 && Number.isInteger(d) && d >= 1 && Number.isInteger(n) && n >= 1 && Nt >= 0 && s >= 0)) return bad();
        o.eps = Math.E / w; o.delta = exp(-d); o.errBound = o.eps * Nt;
        if (m.eps !== undefined) { const e = g(m, 'eps'); o.wFor = e > 0 ? Math.ceil(Math.E / e) : NaN; }
        if (m.delta !== undefined) { const dd = g(m, 'delta'); o.dFor = dd > 0 && dd < 1 ? Math.ceil(log(1 / dd)) : NaN; }
        if (reps > 0 && budget(reps * n * d)) {   // Zipf(s) frequencies over n items, ideal hashing
          const Hs = sum(Array.from({ length: n }, (_, i) => pow(i + 1, -s))), f = Array.from({ length: n }, (_, i) => Math.round(Nt * pow(i + 1, -s) / Hs)), Ntot = sum(f);
          const r = rng(); if (!r) return out; let mxS = 0, meS = 0, over = 0; const tab = new Float64Array(w * d), h = new Int32Array(n * d);
          for (let t = 0; t < reps; t++) {
            tab.fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) { const c = r.int(w); h[i * d + j] = c; tab[j * w + c] += f[i]; }
            let mx = 0, me = 0; for (let i = 0; i < n; i++) { let est = Infinity; for (let j = 0; j < d; j++) est = min(est, tab[j * w + h[i * d + j]]); const er = est - f[i]; mx = max(mx, er); me += er; if (er > o.eps * Ntot) over++; }
            mxS += mx; meS += me / n;
          }
          o.simMaxErr = mxS / reps; o.simMeanErr = meS / reps; o.simFracOver = over / (reps * n);
        }
        return out;
      }
      case 'hll': {   // HyperLogLog (Flajolet, Fusy, Gandouet & Meunier 2007): standard error 1.04/√m, with the small- and large-range corrections
        const b = g(m, 'bits'), n = g(m, 'n', 10000); if (!(Number.isInteger(b) && b >= 4 && b <= 16 && Number.isInteger(n) && n >= 0)) return bad();
        const M = 1 << b; o.stdErr = 1.04 / sqrt(M);
        if (reps > 0 && budget(reps * (n + M))) {
          const am = M === 16 ? 0.673 : M === 32 ? 0.697 : M === 64 ? 0.709 : 0.7213 / (1 + 1.079 / M), reg = new Uint8Array(M), r = rng(); if (!r) return out; const est = [];
          for (let t = 0; t < reps; t++) {
            reg.fill(0);
            for (let i = 0; i < n; i++) { const hv = floor(r() * 4294967296) >>> 0, j = hv >>> (32 - b), rest = (hv << b) >>> 0; const rho = rest === 0 ? 32 - b + 1 : Math.clz32(rest) + 1; if (rho > reg[j]) reg[j] = rho; }
            let Z = 0, V = 0; for (let j = 0; j < M; j++) { Z += pow(2, -reg[j]); if (!reg[j]) V++; }
            let E = am * M * M / Z;
            if (E <= 2.5 * M && V > 0) E = M * log(M / V); else if (E > 4294967296 / 30) E = -4294967296 * log1p(-E / 4294967296);
            est.push(E);
          }
          const mv = meanVar(est); o.simMean = mv.mean; o.simRelSd = n > 0 ? sqrt(mv.var) / n : NaN; o.simRelBias = n > 0 ? mv.mean / n - 1 : NaN;
          const h = autoHist(est, 40, false); sr.histX = h.x; sr.histDensity = h.dens;
        }
        return out;
      }
      case 'reservoir': {   // Algorithm R (Vitter 1985): every item ends in the reservoir with probability k/n
        const n = g(m, 'n'), k = g(m, 'k'); if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(k) && k >= 1 && k <= n)) return bad();
        const pi = k / n; o.inclusion = pi;
        if (reps > 0 && budget(reps * n)) {
          const r = rng(); if (!r) return out; const cnt = new Float64Array(n), res = new Int32Array(k);
          for (let t = 0; t < reps; t++) { for (let i = 0; i < k; i++) res[i] = i; for (let i = k; i < n; i++) { const j = r.int(i + 1); if (j < k) res[j] = i; } for (let i = 0; i < k; i++) cnt[res[i]]++; }
          // the counts have covariance reps·π(1−π)·n/(n−1)·(I − J/n): Σ(c − e)²/(that scale) ~ χ²_{n−1} under uniformity
          if (n > 1 && pi < 1) { const e = reps * pi, sc = reps * pi * (1 - pi) * n / (n - 1); let X2 = 0; for (const c of cnt) X2 += (c - e) * (c - e) / sc; o.chi2 = X2; o.pChi2 = gammaPQ((n - 1) / 2, X2 / 2)[1]; }
          sr.pos = Array.from({ length: n }, (_, i) => i + 1); sr.freq = Array.from(cnt, c => c / reps);
        }
        return out;
      }
      case 'cover': {   // random walks on graphs: hitting and cover times (Aleliunas et al. 1979; Matthews 1988; MU ch. 7, MR ch. 6)
        const G = graphOf(m, R, I); if (!G) return bad();
        const n = G.n, st = g(m, 'start', 0); if (!(Number.isInteger(st) && st >= 0 && st < n)) return bad();
        o.aleliunas = 2 * G.E.length * (n - 1);
        if (!connected(G)) { I.add('disconnected'); o.coverExact = Infinity; return out; }
        if (n <= 50 && budget(n * n * n * n)) {   // H(u, v) for every target v: (I − P without v) h = 1 by Gaussian elimination
          let hm = 0;
          for (let v = 0; v < n; v++) {
            const idx = []; for (let u = 0; u < n; u++) if (u !== v) idx.push(u);
            const pos = new Map(idx.map((u, i) => [u, i])), A2 = idx.map(u => { const r = new Array(idx.length).fill(0); r[pos.get(u)] = 1; for (const w of G.adj[u]) if (w !== v) r[pos.get(w)] -= 1 / G.adj[u].length; return r; });
            const h = solve(A2, new Array(idx.length).fill(1)); if (h) for (const x of h) hm = max(hm, x);
          }
          o.hitMax = hm; o.matthews = harm(n - 1) * hm;
        }
        if (n <= 12) {   // the exact expected cover time: E(S, v) over visited sets S ∋ v, solved within each S (largest first)
          const full = (1 << n) - 1, E = new Map();
          E.set(full, new Float64Array(n));
          const sizes = []; for (let S = 1; S <= full; S++) sizes.push(S);
          sizes.sort((a, b) => popc(b) - popc(a));
          for (const S of sizes) {
            if (S === full) continue;
            const mem = []; for (let u = 0; u < n; u++) if ((S >> u) & 1) mem.push(u);
            const pos = new Map(mem.map((u, i) => [u, i])), A2 = [], b = [];
            for (const u of mem) {
              const r = new Array(mem.length).fill(0); r[pos.get(u)] = 1; let rhs = 1; const dg = G.adj[u].length;
              for (const w of G.adj[u]) { if ((S >> w) & 1) r[pos.get(w)] -= 1 / dg; else { const nx = E.get(S | (1 << w)); rhs += (nx ? nx[w] : NaN) / dg; } }
              A2.push(r); b.push(rhs);
            }
            const sol = solve(A2, b), arr = new Float64Array(n); if (sol) mem.forEach((u, i) => { arr[u] = sol[i]; });
            E.set(S, arr);
          }
          o.coverExact = E.get(1 << st)[st];
        }
        if (reps > 0) {
          const r = rng(); if (!r) return out; const v = []; let steps = 0;
          for (let t = 0; t < reps && steps < 2e7; t++) { const seen = new Uint8Array(n); seen[st] = 1; let c = 1, u = st, k = 0; while (c < n && steps < 2e7) { const a2 = G.adj[u]; u = a2[r.int(a2.length)]; k++; steps++; if (!seen[u]) { seen[u] = 1; c++; } } if (c === n) v.push(k); }
          if (steps >= 2e7) I.add('budget');
          if (v.length) { o.simCover = sum(v) / v.length; simStats(v); }
        }
        return out;
      }
      case 'twosat': {   // the random-walk 2-SAT algorithm (Papadimitriou 1991; MU §7.1.1): the worst case is the walk on 0 … n
        const n = g(m, 'n'), i = g(m, 'i', n), T = g(m, 'T', 2 * n * n);
        if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(i) && i >= 0 && i <= n && Number.isInteger(T) && T >= 0)) return bad();
        o.eSteps = i * (2 * n - i); o.worstSteps = n * n; o.markovT = T > 0 ? min(1, n * n / T) : 1;
        o.rounds = Math.ceil(log(1 / delta) / LN2 - 1e-12);   // each run of 2n² steps fails with probability ≤ ½ (Markov)
        if (budget(n * T)) {
          let v = new Float64Array(n + 1), w = new Float64Array(n + 1); v[i] = 1; const tg = [], pf = [], every = max(1, Math.ceil(T / 1999));
          const alive = () => { let s = 0; for (let j = 1; j <= n; j++) s += v[j]; return s; };
          for (let t = 0; t <= T; t++) {
            if (t % every === 0 || t === T) { tg.push(t); pf.push(alive()); }
            if (t === T) break;
            w.fill(0); w[0] = v[0];
            for (let j = 1; j <= n; j++) { if (!v[j]) continue; if (j === n) w[n - 1] += v[j]; else { w[j - 1] += 0.5 * v[j]; w[j + 1] += 0.5 * v[j]; } }
            const tt = v; v = w; w = tt;
          }
          o.pFailT = alive(); sr.tGrid = tg; sr.pFailByT = pf;
        }
        return out;
      }
      case 'bounds': {   // Markov, Chebyshev, Cantelli, Chernoff (the optimised MGF bound), Hoeffding vs the exact upper tail P(X ≥ a) (MU ch. 3–4)
        const D = mkDist(m.dist, R, I); if (!D) return bad();
        const a0 = g(m, 'a'), fam = m.dist.family, P = k => g(m.dist, k), mu = D.mean, va = D.var;
        if (!fin(a0)) return bad();
        const exact = a => (D.disc ? (a <= D.lo ? 1 : D.sf(Math.ceil(a - 1e-12) - 1)) : D.sf(a));
        const mk = a => (D.lo >= 0 && fin(mu) && a > 0 ? min(1, mu / a) : NaN);
        const cb = a => (fin(va) ? (a > mu ? min(1, va / ((a - mu) * (a - mu))) : 1) : NaN);
        const ct = a => (fin(va) ? (a > mu ? va / (va + (a - mu) * (a - mu)) : 1) : NaN);
        const kl = (q, p) => (q > 0 ? q * log(q / p) : 0) + (q < 1 ? (1 - q) * log((1 - q) / (1 - p)) : 0);
        const chern = a => {
          if (!(a > mu)) return 1;
          if (fam === 'binomial' || fam === 'bernoulli') { const nn = fam === 'binomial' ? P('n') : 1, p = P('p'); return a > nn ? 0 : exp(-nn * kl(a / nn, p)); }
          if (fam === 'poisson') { const l = P('lambda'); return exp(-l + a - a * log(a / l)); }
          if (fam === 'normal') { const s = m.dist.sigma !== undefined ? P('sigma') : 1; return exp(-(a - mu) * (a - mu) / (2 * s * s)); }
          if (fam === 'exponential') { const l = m.dist.rate !== undefined ? P('rate') : 1; return a * l * exp(1 - a * l); }
          if (fam === 'gamma') { const k = P('shape'), th = m.dist.scale !== undefined ? P('scale') : 1 / (m.dist.rate !== undefined ? P('rate') : 1); return pow(a / (k * th), k) * exp(k - a / th); }
          return NaN;
        };
        const hoef = a => {
          if (fam !== 'binomial' && fam !== 'bernoulli') return NaN;
          const nn = fam === 'binomial' ? P('n') : 1; return a > mu ? exp(-2 * (a - mu) * (a - mu) / nn) : 1;
        };
        o.exact = exact(a0); o.markov = mk(a0); o.chebyshev = cb(a0); o.cantelli = ct(a0); o.chernoff = chern(a0); o.hoeffding = hoef(a0);
        const L = [o.markov, o.chebyshev, o.cantelli, o.chernoff, o.hoeffding];
        if (L.some(v => !fin(v))) I.add('not-applicable');
        let best = NaN, bv = Infinity; L.forEach((v, i) => { if (fin(v) && v < bv - 1e-15) { bv = v; best = i + 1; } }); o.tightest = best;
        const sd = sqrt(va), hiA = fin(sd) ? mu + 6 * sd : D.q(0.999999), loA = fin(mu) ? mu : D.q(0.5), np = m.points || 101, ag = grid(loA, min(hiA, D.hi), np);
        sr.aGrid = ag; sr.exactBy = ag.map(exact); sr.markovBy = ag.map(mk); sr.chebyshevBy = ag.map(cb); sr.cantelliBy = ag.map(ct); sr.chernoffBy = ag.map(chern); sr.hoeffdingBy = ag.map(hoef);
        return out;
      }
      case 'skiplist': {   // skip lists (Pugh 1990; MR §8.3, MU ex.): E H = Σ_{h≥0} 1 − (1 − p^h)^n
        const n = g(m, 'n'), p = g(m, 'p', 0.5); if (!(Number.isInteger(n) && n >= 1 && p > 0 && p < 1)) return bad();
        let e = 0; for (let h = 0; h < 5000; h++) { const t = -expm1(n * log1p(-pow(p, h))); e += t; if (t < 1e-17) break; }
        o.eHeight = e; o.approxHeight = log(n) / log(1 / p); o.searchCost = o.approxHeight / p + 1 / (1 - p); o.pointers = n / (1 - p);
        if (reps > 0 && budget(reps * n * 2)) { const r = rng(); if (!r) return out; const v = []; for (let t = 0; t < reps; t++) { let mx = 0; for (let i = 0; i < n; i++) { let h = 1; while (r() < p && h < 64) h++; if (h > mx) mx = h; } v.push(mx); } simStats(v, true); }
        return out;
      }
      case 'treap': {   // treaps = random BSTs (Seidel & Aragon 1996; MR §8.2): E depth(k) = H_k + H_{n−k+1} − 2; height ≈ 4.311 ln n − 1.953 ln ln n (Reed 2003)
        const n = g(m, 'n'), rk = g(m, 'r', 1); if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(rk) && rk >= 1 && rk <= n)) return bad();
        o.eDepth = harm(rk) + harm(n - rk + 1) - 2; o.eDepthAvg = 2 * (1 + 1 / n) * harm(n) - 4; o.heightApprox = n > 2 ? 4.311 * log(n) - 1.953 * log(log(n)) : NaN;
        if (reps > 0 && budget(reps * n * 30)) {   // the height of the BST of a random insertion order
          const r = rng(); if (!r) return out; const v = [], L = new Int32Array(n), Rr = new Int32Array(n), perm = new Int32Array(n);
          for (let t = 0; t < reps; t++) {
            for (let i = 0; i < n; i++) perm[i] = i; for (let i = n - 1; i > 0; i--) { const j = r.int(i + 1); const x = perm[i]; perm[i] = perm[j]; perm[j] = x; }
            L.fill(-1); Rr.fill(-1); const root = perm[0]; let hmax = 0;
            for (let i = 1; i < n; i++) { const key = perm[i]; let u = root, dpt = 1; for (;;) { if (key < u) { if (L[u] < 0) { L[u] = key; break; } u = L[u]; } else { if (Rr[u] < 0) { Rr[u] = key; break; } u = Rr[u]; } dpt++; } if (dpt > hmax) hmax = dpt; }
            v.push(hmax);
          }
          simStats(v, true);
        }
        return out;
      }
      case 'mcpi': {   // Monte Carlo integration: error ~ σ/√n (MU §11.1): π from the quarter disc, or ∫_a^b f(x) dx of an expression over x
        const n = g(m, 'n'), a = g(m, 'a', 0), b = g(m, 'b', 1);
        if (!(Number.isInteger(n) && n >= 1 && fin(a) && fin(b) && b > a)) return bad();
        const useExpr = typeof m.expr === 'string';
        if (n > (useExpr ? 2e5 : 2e6)) { I.add('budget'); return out; }
        const r = rng(); if (!r) return out;
        let f;
        if (useExpr) { const fn = (prepared && prepared.fns.get(m.expr)) || C.cx(m.expr), e = Object.assign({}, env); f = () => { e.x = a + (b - a) * r(); return (b - a) * fn(e); }; }
        else f = () => { const u = r(), v = r(); return u * u + v * v <= 1 ? 4 : 0; };
        const ex = m.exact !== undefined ? g(m, 'exact') : useExpr ? NaN : PI;
        const cps = checkpoints(n, 400), rn = [], re = [], rl = [], rh = []; let mean = 0, M2 = 0, ci = 0;
        for (let t = 1; t <= n; t++) { const y = f(); const d1 = y - mean; mean += d1 / t; M2 += d1 * (y - mean); if (t === cps[ci]) { const se = t > 1 ? sqrt(M2 / (t - 1) / t) : NaN; rn.push(t); re.push(mean); rl.push(mean - 1.96 * se); rh.push(mean + 1.96 * se); ci++; } }
        o.estimate = mean; o.se = sqrt(M2 / (n - 1) / n); o.err = fin(ex) ? abs(mean - ex) : NaN; o.errRootN = o.err * sqrt(n);
        if (!useExpr) o.seExact = 4 * sqrt(PI / 4 * (1 - PI / 4) / n);
        sr.runN = rn; sr.runEst = re; sr.runLo = rl; sr.runHi = rh;
        return out;
      }
    }
    return out;
  }
  const popc = x => { let c = 0; while (x) { x &= x - 1; c++; } return c; };

  /* ===================================================================================================================== */
  /* the run                                                                                                                */
  /* ===================================================================================================================== */
  /** compute a model (numbers resolved with env) → {scalars, series, scenes, issues}; want: the output names needed (null: all) */
  function compute(model, env, prepared, opts) {
    const R = resolver(prepared, env || {}), I = issueBag();
    NOTE = I; BUDGET = 2e7;
    const seed = (model.seed !== undefined ? model.seed : (opts && opts.seed)) >>> 0 || 1, want = (opts && opts.want) || null;
    let res = { o: {}, sr: {}, sc: {} };
    try {
      switch (model.mode) {
        case 'dist': res = runDist(model, R, I); break;
        case 'mc': res = runMC(model, R, I, env || {}, prepared, seed, want); break;
        case 'sampling': res = runSampling(model, R, I, seed); break;
        case 'test': res = runTest(model, R, I); break;
        case 'ci': res = runCI(model, R, I, want); break;
        case 'power': res = runPower(model, R, I); break;
        case 'bayes': res = runBayes(model, R, I); break;
        case 'screen': res = runScreen(model, R, I); break;
        case 'simpson': res = runSimpson(model, R, I); break;
        case 'multi': res = runMulti(model, R, I, seed); break;
        case 'markov': res = runMarkov(model, R, I); break;
        case 'walk': res = runWalk(model, R, I, seed); break;
        case 'queue': res = runQueue(model, R, I); break;
        case 'bootstrap': res = runBoot(model, R, I, seed); break;
        case 'combin': res = runCombin(model, R, I); break;
        case 'gof': res = runGof(model, R, I); break;
        case 'mcmc': res = runMcmc(model, R, I, env || {}, prepared, seed); break;
        case 'multivar': res = runMultivar(model, R, I, seed); break;
        case 'rand': res = runRand(model, R, I, seed, env || {}, prepared); break;
      }
    } finally { /* NOTE stays for the lazy values; reset by the next compute */ }
    const cache = {}, lz = res.lazy || {};
    let srl = null;
    const scalar = k => { if (has(lz, k)) { if (!has(cache, k)) { NOTE = I; cache[k] = lz[k](); } return cache[k]; } return res.o[k]; };
    const series = k => { if (Array.isArray(res.sr[k])) return res.sr[k]; if (res.sr.lazy) { if (!srl) { NOTE = I; srl = res.sr.lazy(); } return srl[k]; } return undefined; };
    return { scalar, series, scene: k => res.sc[k], issues: I.out,
      get scalars() { const o = {}; for (const k of new Set(Object.keys(res.o).concat(Object.keys(lz)))) o[k] = scalar(k); return o; } };
  }
  /** run(spec, env, {seed, prepared}) → {out: {<output id>: value}} */
  function run(spec, env, opts) {
    const P = checkSpec(spec);
    if (C.hasErrors(P)) return { out: {} };
    const want = new Set(spec.outputs.map(o => o.of));
    const res = compute(spec.model, env, opts && opts.prepared, { seed: opts && opts.seed, want });
    const out = {}, num = v => (typeof v === 'number' ? v : NaN);
    for (const o of spec.outputs) {   // issues last: the values above may count some
      if (o.kind === 'scalar' && !o.of.startsWith('issue.')) out[o.id] = num(res.scalar(o.of));
      else if (o.kind === 'series') { const v = res.series(o.of); out[o.id] = Array.isArray(v) ? C.thin(v.map(x => (typeof x === 'number' && fin(x) ? x : NaN)), C.MAX_POINTS) : []; }
      else if (o.kind === 'scene') out[o.id] = res.scene(o.of) || { view: [-1, 1, -1, 1], items: [] };
    }
    for (const o of spec.outputs) if (o.kind === 'scalar' && o.of.startsWith('issue.')) out[o.id] = res.issues[o.of.slice(6)] || 0;
    NOTE = null;
    return { out };
  }
  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  /** the Worker source: NoemaExpr, the core, NoemaSimKit (when loaded: the streams of the later modes), then this module */
  Object.defineProperty(engine, 'workerSource', { enumerable: true, get() {
    const NX = root.NoemaExpr, nx = NX && typeof NX.source === 'function' ? NX.source() : '';
    const sk = root.NoemaSimKit && typeof root.NoemaSimKit.source === 'function' ? root.NoemaSimKit.source() : '';
    return nx + '\n;' + C.source() + '\n;' + sk + '\n;(' + noemaLibProbModule.toString() + ')(self);\nself.noemaEngine = self.NoemaLibProb.simEngine;';
  } });
  const lawOf = (o, env) => { const I = issueBag(); NOTE = I; const D = mkDist(o, resolver(null, env || {}), I); return D; };
  root.NoemaLibProb = Object.freeze({
    id: ID, DATA, checkSpec, exprs, keys, run, compute, engine: Object.freeze(engine), simEngine,
    table: { model: { $by: 'mode', $cases: Object.fromEntries(DATA.modes.map(m => [m, Object.assign({}, DATA.schema[m], ...(DATA.custom[m] || []).map(f => ({ [f]: 'any' })))])) }, outputs: { $by: 'mode', $cases: Object.fromEntries(DATA.modes.map(m => { const O = DATA.outs[m], pre = x => Object.entries(x || {}).flatMap(([p, l]) => Array.isArray(l) ? l.map(v => p + v) : []); return [m, { scalar: O.scalar.concat(O.issues.map(i => 'issue.' + i), pre(O.prefix)), series: O.series.concat(pre(O.sprefix)), scene: O.scene }]; })) } },   // the form of the activity author (46_lib_schema.js)
    // the special functions and the engine's own methods, for the tests
    lgamma, log1p, expm1, stirlerr, bd0, lbeta, ldbinom, ldpois, gammaPQ, ibeta, erf, erfc, erfcinv, ncdf, lncdf, qnorm, tcdf, tsf, qt, pnt,
    lawOf, propCI, coverage, binomP, clopper, adjust, gth, hpd, exactU, exactW, powerFn,
    expsinh, kolmQ, kolmSf, kolmCdfExact, smirnovSf, shapiroWilk, adInf, adCdf, chol, qrLS, symEig, bvn, essBasic, rhatBasic, digamma, harm, harm2,
    noCoincide, couponCdf, isPrimeN, mrWitness, diagnose,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
