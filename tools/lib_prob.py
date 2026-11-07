"""prob@1 — probability and statistics (docs/library/prob.md): the Python twin of the checks of src/engines/prob/prob.js. It does not
compute; check_spec(spec) gives the same problems (code, path, msg, level) as the JS checkSpec, exprs(spec) and keys(spec) the same
lists (tests/enginelib.js runs both on tests/fixtures/enginelib/prob.json). DATA is the same JSON as the JS module's
(tests/lib_prob.js checks that the two copies are identical)."""
import json, re
import enginelib as L

ID = "prob@1"
DATA = json.loads(r'''{"modes":["dist","mc","sampling","test","ci","power","bayes","screen","simpson","multi","markov","walk","queue","bootstrap","combin","gof","mcmc","multivar","rand"],"families":{"bernoulli":{"disc":1,"p":{"p":"unit!"}},"binomial":{"disc":1,"p":{"n":"int:0:1000000000!","p":"unit!"}},"geometric":{"disc":1,"p":{"p":"unit!","trials":"bool"}},"negbinomial":{"disc":1,"p":{"r":"pos!","p":"unit!"}},"poisson":{"disc":1,"p":{"lambda":"nonneg!"}},"hypergeometric":{"disc":1,"p":{"N":"int:0:1000000000!","K":"int:0:1000000000!","n":"int:0:1000000000!"}},"dunif":{"disc":1,"p":{"a":"int:-1000000000:1000000000!","b":"int:-1000000000:1000000000!"}},"categorical":{"disc":1,"p":{"probs":"list!","values":"flist"}},"uniform":{"disc":0,"p":{"a":"fin!","b":"fin!"}},"normal":{"disc":0,"p":{"mu":"fin","sigma":"pos"}},"lognormal":{"disc":0,"p":{"mu":"fin","sigma":"pos"}},"exponential":{"disc":0,"p":{"rate":"pos"}},"gamma":{"disc":0,"p":{"shape":"pos!","rate":"pos","scale":"pos"}},"beta":{"disc":0,"p":{"a":"pos!","b":"pos!"}},"chi2":{"disc":0,"p":{"df":"pos!"}},"t":{"disc":0,"p":{"df":"pos!"}},"f":{"disc":0,"p":{"d1":"pos!","d2":"pos!"}},"cauchy":{"disc":0,"p":{"x0":"fin","gamma":"pos"}},"weibull":{"disc":0,"p":{"shape":"pos!","scale":"pos"}},"laplace":{"disc":0,"p":{"mu":"fin","b":"pos"}},"logistic":{"disc":0,"p":{"mu":"fin","s":"pos"}},"pareto":{"disc":0,"p":{"xm":"pos","alpha":"pos!"}},"gumbel":{"disc":0,"p":{"mu":"fin","beta":"pos"}},"triangular":{"disc":0,"p":{"a":"fin!","b":"fin!","c":"fin!"}},"rayleigh":{"disc":0,"p":{"sigma":"pos"}}},"schema":{"dist":{"x":"numx","lo":"numx","hi":"numx","p":"numx","pu":"numx","from":"numx","to":"numx","points":"int:2:2000"},"mc":{"expr":"expr!","n":"numx","seed":"int:0:4294967295","conf":"numx","bins":"int:2:200","exact":"numx"},"sampling":{"size":"numx!","reps":"numx","stat":"enum:mean|sum|median|var|sd|min|max","seed":"int:0:4294967295","bins":"int:2:200"},"test":{"kind":"enum:z-one|t-one|t-paired|t-welch|t-pooled|prop-one|prop-two|binom-exact|sign|chi2-gof|chi2-indep|g-test|fisher|mcnemar|f-var|anova|pearson|regression|mann-whitney|wilcoxon!","x":{"$list":"numx","max":2000},"y":{"$list":"numx","max":2000},"groups":{"$list":{"$list":"numx","max":2000},"max":20},"table":{"$list":{"$list":"numx","max":20},"max":20},"observed":{"$list":"numx","max":100},"probs":{"$list":"numx","max":100},"summary":{"$obj":{"mean":"numx!","sd":"numx!","n":"numx!","mean2":"numx","sd2":"numx","n2":"numx"}},"k":"numx","n":"numx","k2":"numx","n2":"numx","mu0":"numx","p0":"numx","sigma":"numx","ratio0":"numx","alpha":"numx","alt":"enum:two-sided|less|greater","correct":"bool","exact":"bool","ddof":"numx","points":"int:2:2000"},"ci":{"kind":"enum:prop|poisson|mean|variance!","k":"numx","n":"numx","t":"numx","x":{"$list":"numx","max":2000},"summary":{"$obj":{"mean":"numx!","sd":"numx!","n":"numx!"}},"sigma":"numx","conf":"numx","method":"enum:wald|wilson|agresti-coull|clopper-pearson|jeffreys|exact|t|z|chi2","p":"numx","points":"int:2:2000"},"power":{"kind":"enum:z-one|t-one|t-paired|t-two|prop-two|binom-exact!","effect":"numx","p0":"numx","p1":"numx","p2":"numx","n":"numx","alpha":"numx","alt":"enum:two-sided|less|greater","target":"numx","nMax":"int:2:2000","dMax":"numx","points":"int:2:2000"},"bayes":{"kind":"enum:beta-binomial|gamma-poisson|normal-normal!","prior":{"$obj":{"a":"numx","b":"numx","mu":"numx","sd":"numx"}},"k":"numx","n":"numx","sum":"numx","t":"numx","xbar":"numx","sigma":"numx","theta0":"numx","conf":"numx","points":"int:2:2000","from":"numx","to":"numx"},"screen":{"prev":"numx!","sens":"numx!","spec":"numx!","pop":"numx","tests":"numx"},"simpson":{"strata":{"$req":true,"$list":{"$obj":{"k1":"numx!","n1":"numx!","k2":"numx!","n2":"numx!"}},"max":20,"min":1}},"multi":{"p":{"$list":"numx","max":2000},"method":"enum:bonferroni|holm|hochberg|bh|by","alpha":"numx","sim":{"$obj":{"m":"numx!","m0":"numx!","effect":"numx!","reps":"numx","seed":"int:0:4294967295"}}},"markov":{"states":{"$req":true,"$list":"id","max":100,"min":1},"labels":{"$list":"key","max":100},"P":{"$req":true,"$list":{"$list":"numx","max":100},"max":100,"min":1},"init":{"$list":"numx","max":100},"start":"ref","steps":"numx","normalize":"bool"},"walk":{"kind":"enum:srw|ruin|galton-watson!","p":"numx","N":"numx","i":"numx","steps":"numx","paths":"numx","reps":"numx","seed":"int:0:4294967295","a":"numx","dim":"int:1:3","offspring":{"$list":"numx","max":64},"m":"numx","gens":"numx"},"queue":{"lambda":"numx!","mu":"numx!","c":"numx","nMax":"int:1:2000"},"bootstrap":{"x":{"$req":true,"$list":"numx","max":2000,"min":2},"y":{"$list":"numx","max":2000},"stat":"enum:mean|median|sd|var|trimmed|diff-means|corr","B":"numx","conf":"numx","seed":"int:0:4294967295","trim":"numx","perm":"bool","alt":"enum:two-sided|less|greater"},"combin":{"kind":"enum:multinomial|coupon|birthday!","n":"numx","probs":{"$list":"numx","max":400},"x":{"$list":"numx","max":64},"i":"numx","j":"numx","types":"numx","copies":"numx","want":"numx","m":"numx","mMax":"int:1:2000","days":"numx","people":"numx","k":"numx","target":"numx","nMax":"int:1:2000"},"gof":{"kind":"enum:ks-one|ks-two|shapiro-wilk|anderson-darling|chi2-fit!","x":{"$list":"numx","max":2000},"y":{"$list":"numx","max":2000},"estimate":"bool","alt":"enum:two-sided|less|greater","exact":"bool","bins":"int:2:100","ddof":"int:0:10","alpha":"numx","points":"int:2:2000"},"mcmc":{"kind":"enum:metropolis|gibbs-bivnormal|gibbs-normal!","logdens":"expr","params":{"$list":"name","max":6,"min":1},"init":{"$list":"numx","max":6},"scale":{"$list":"numx","max":6},"iters":"numx","burn":"numx","thin":"numx","chains":"int:1:8","seed":"int:0:4294967295","spread":"numx","rho":"numx","x":{"$list":"numx","max":2000},"prior":{"$obj":{"mu0":"numx","sd0":"numx","a":"numx","b":"numx"}},"lags":"int:1:200","bins":"int:2:200"},"multivar":{"kind":"enum:mvnormal|corr|ols|logistic|pca|dirichlet!","mu":{"$list":"numx","max":10,"min":1},"cov":{"$list":{"$list":"numx","max":10},"max":10},"x":{"$list":"numx","max":10},"data":{"$list":{"$list":"numx","max":10,"min":1},"max":2000,"min":1},"y":{"$list":"numx","max":2000},"w":{"$list":"numx","max":2000},"intercept":"bool","scale":"bool","conc":{"$list":"numx","max":10,"min":2},"conf":"numx","i":"int:0:9","j":"int:0:9","n":"numx","seed":"int:0:4294967295","maxIter":"int:1:200"},"rand":{"kind":"enum:amplify|quicksort|quickselect|karger|freivalds|primality|rounding|balls|bloom|countmin|hll|reservoir|cover|twosat|bounds|skiplist|treap|mcpi!","err":"numx","sided":"enum:one|two","k":"numx","delta":"numx","p":"numx","n":"numx","r":"numx","m":"numx","d":"numx","L":"numx","N":"numx","T":"numx","w":"numx","s":"numx","t":"numx","i":"numx","a":"numx","b":"numx","bits":"numx","eps":"numx","target":"numx","kMax":"int:1:2000","x":{"$list":"numx","max":2000},"edges":{"$list":{"$list":"numx","max":2,"min":2},"max":400},"A":{"$list":{"$list":"numx","max":16},"max":16},"B":{"$list":{"$list":"numx","max":16},"max":16},"Cm":{"$list":{"$list":"numx","max":16},"max":16},"graph":"enum:path|cycle|complete|star|lollipop|hypercube","start":"numx","reps":"numx","seed":"int:0:4294967295","expr":"expr","exact":"numx","points":"int:2:2000"}},"custom":{"dist":["dist"],"sampling":["parent"],"mc":["draws"],"gof":["dist"],"rand":["dist"]},"ranges":{"dist":{"p":"unit","pu":"unit"},"mc":{"n":"int:1:200000","conf":"unit"},"sampling":{"size":"int:1:10000","reps":"int:1:10000"},"test":{"alpha":"unit","p0":"unit","sigma":"pos","ddof":"int:0:100","k":"nonneg","n":"nonneg","k2":"nonneg","n2":"nonneg","ratio0":"pos"},"ci":{"conf":"unit","k":"nonneg","n":"nonneg","t":"pos","p":"unit","sigma":"pos"},"power":{"alpha":"unit","target":"unit","n":"pos","p0":"unit","p1":"unit","p2":"unit","dMax":"pos"},"bayes":{"prior.a":"nonneg","prior.b":"nonneg","prior.sd":"pos","k":"nonneg","n":"nonneg","sum":"nonneg","t":"pos","sigma":"pos","conf":"unit"},"screen":{"prev":"unit","sens":"unit","spec":"unit","pop":"int:1:2000","tests":"int:1:20"},"simpson":{},"multi":{"alpha":"unit","sim.m":"int:1:1000","sim.m0":"int:0:1000","sim.reps":"int:1:2000"},"markov":{"steps":"int:0:1000000"},"walk":{"p":"unit","N":"int:1:2000","i":"int:0:2000","steps":"int:1:10000","paths":"int:0:50","reps":"int:0:20000","a":"int:1:10000","m":"nonneg","gens":"int:1:200"},"queue":{"lambda":"pos","mu":"pos","c":"int:1:1000"},"bootstrap":{"B":"int:10:20000","conf":"unit","trim":"unit"},"combin":{"n":"int:0:100000","i":"int:0:63","j":"int:0:63","types":"int:1:2000","copies":"int:1:20","want":"int:1:2000","m":"int:0:1000000","days":"int:1:100000","people":"int:0:100000","k":"int:2:100","target":"unit"},"gof":{"alpha":"unit"},"mcmc":{"iters":"int:10:200000","burn":"int:0:200000","thin":"int:1:100","spread":"nonneg","prior.sd0":"pos","prior.a":"pos","prior.b":"pos"},"multivar":{"conf":"unit","n":"int:0:2000"},"rand":{"err":"unit","delta":"unit","p":"unit","eps":"unit","target":"unit","k":"int:0:100000","n":"int:0:1000000","r":"int:1:1000000","m":"int:1:100000000","d":"int:1:64","L":"int:0:100000","N":"int:0:9007199254740991","T":"int:0:100000000","w":"int:1:1000000","s":"nonneg","t":"int:0:1000","i":"int:0:1000000","bits":"int:4:16","start":"int:0:1000","reps":"int:0:100000"}},"kindField":{"test":"kind","ci":"kind","power":"kind","bayes":"kind","walk":"kind","bootstrap":"stat","multi":"*","combin":"kind","gof":"kind","mcmc":"kind","multivar":"kind","rand":"kind"},"needs":{"test":{"z-one":[["x","sigma"],["summary","sigma"]],"t-one":[["x"],["summary"]],"t-paired":[["x","y"]],"t-welch":[["x","y"],["summary"]],"t-pooled":[["x","y"],["summary"]],"prop-one":[["k","n"]],"prop-two":[["k","n","k2","n2"]],"binom-exact":[["k","n"]],"sign":[["x"]],"chi2-gof":[["observed","probs"]],"chi2-indep":[["table"]],"g-test":[["table"],["observed","probs"]],"fisher":[["table"]],"mcnemar":[["table"]],"f-var":[["x","y"],["summary"]],"anova":[["groups"]],"pearson":[["x","y"]],"regression":[["x","y"]],"mann-whitney":[["x","y"]],"wilcoxon":[["x"]]},"ci":{"prop":[["k","n"]],"poisson":[["k"]],"mean":[["x"],["summary"]],"variance":[["x"],["summary"]]},"power":{"z-one":[["effect"]],"t-one":[["effect"]],"t-paired":[["effect"]],"t-two":[["effect"]],"prop-two":[["p1","p2"]],"binom-exact":[["p0","p1"]]},"bayes":{"beta-binomial":[["prior.a","prior.b","k","n"]],"gamma-poisson":[["prior.a","prior.b","sum","t"]],"normal-normal":[["prior.mu","prior.sd","xbar","n","sigma"]]},"walk":{"srw":[["steps"]],"ruin":[["p","N","i"]],"galton-watson":[["offspring"],["m"]]},"bootstrap":{"diff-means":[["y"]],"corr":[["y"]]},"multi":{"*":[["p"],["sim"]]},"combin":{"multinomial":[["n","probs"]],"coupon":[["types"],["probs"]]},"gof":{"ks-one":[["x","dist"]],"ks-two":[["x","y"]],"shapiro-wilk":[["x"]],"anderson-darling":[["x","dist"],["x","estimate"]],"chi2-fit":[["x","dist"]]},"mcmc":{"metropolis":[["logdens","params","init"]],"gibbs-normal":[["x"]]},"multivar":{"mvnormal":[["mu","cov"]],"corr":[["data"]],"ols":[["data","y"]],"logistic":[["data","y"]],"pca":[["data"]],"dirichlet":[["conc"]]},"rand":{"amplify":[["err"],["p"]],"quicksort":[["n"]],"quickselect":[["n","r"]],"karger":[["n"],["edges"]],"freivalds":[["n"],["A","B","Cm"]],"primality":[["N"]],"rounding":[["x"]],"balls":[["n"]],"bloom":[["m","n"]],"countmin":[["w","d"]],"hll":[["bits"]],"reservoir":[["n","k"]],"cover":[["graph","n"],["edges"]],"twosat":[["n"]],"bounds":[["dist","a"]],"skiplist":[["n"]],"treap":[["n"]],"mcpi":[["n"]]}},"ciMethods":{"prop":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"poisson":["exact","wald"],"mean":["t","z"],"variance":["chi2"]},"outs":{"dist":{"scalar":["mean","var","sd","skew","kurt","median","mode","pdf","logpdf","cdf","sf","logcdf","logsf","prob","quantile","isf","normApprox","poissonApprox","supportLo","supportHi"],"series":["x","pdf","cdf","area","normal"],"scene":[],"issues":["param","degenerate","moment-undefined","moment-infinite","underflow","no-convergence","approx","pdf-infinite","normalized"]},"mc":{"scalar":["estimate","se","ciLo","ciHi","sd","n","nanFrac","err","covered","indicator"],"series":["runN","runMean","runLo","runHi","histX","histDensity","exactDensity"],"scene":[],"issues":["few-samples","infinite-variance","rare-event","nan-draws","param","budget","normalized"]},"sampling":{"scalar":["statMean","statSd","theoMean","theoSe","ratio","ks","skewStat"],"series":["histX","histDensity","normalDensity","runN","runMean"],"scene":[],"issues":["infinite-variance","no-mean","param","budget","normalized"]},"test":{"scalar":["stat","df","df2","p","reject","crit","ciLo","ciHi","estimate","se","effect","n","intercept","r2"],"series":["nullX","nullPdf","dataX","dataY","fitY"],"scene":[],"issues":["zero-variance","low-expected","ties-approx","zero-cell","zero-diffs","few-data","bad-data","param"]},"ci":{"scalar":["lo","hi","width","est","coverAt","meanCover","minCover"],"prefix":{"lo.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"hi.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"coverAt.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"meanCover.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"],"minCover.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"]},"series":["covP","cover"],"sprefix":{"cover.":["wald","wilson","agresti-coull","clopper-pearson","jeffreys"]},"scene":[],"issues":["param","few-data"]},"power":{"scalar":["power","nNeeded","nExact","crit","ncp","effectH"],"series":["powerN","powerByN","powerD","powerByD"],"scene":[],"issues":["param","approx","not-reached"]},"bayes":{"scalar":["postA","postB","postMean","postMode","postSd","ciLo","ciHi","hpdLo","hpdHi","pAbove","bf01","predNext","priorMean","mle"],"series":["theta","prior","like","post"],"scene":[],"issues":["improper-posterior","hpd-not-interval","mode-boundary","param"]},"screen":{"scalar":["ppv","npv","lrPos","lrNeg","tp","fp","fn","tn","posRate","accuracy","youden","dor","preOdds","postOdds","ppvRepeat"],"series":[],"scene":["icons"],"issues":["param"]},"simpson":{"scalar":["pooled1","pooled2","pooledDiff","std1","std2","stdDiff","paradox","mhOR","strata"],"prefix":{"rate1.":"$strata","rate2.":"$strata","diff.":"$strata"},"series":["stratum","rates1","rates2"],"scene":[],"issues":["param","zero-cell"]},"multi":{"scalar":["m","rejected","rejectedRaw","minAdj","fwerIndep","threshold","simFwer","simFdr","simPower","simFwerRaw","simFdrRaw"],"prefix":{"adj.":"$p"},"series":["rank","sortedP","bhLine","adjSorted"],"scene":[],"issues":["param","budget"]},"markov":{"scalar":["classes","closed","transient","period","irreducible","absorbing","tAbsorb","tAbsorbVar","tv","mixTime"],"prefix":{"pi.":"$states","p.":"$states","ret.":"$states","absorb.":"$states","hit.":"$states"},"series":["n","tv"],"sprefix":{"dist.":"$states"},"scene":["diagram"],"issues":["not-stochastic","reducible","periodic","not-reached","param"]},"walk":{"scalar":["pWin","pRuin","duration","simWin","simDuration","pZero","pReturn","mean","var","pMax","returnFrac","extinct","m","simExtinct"],"series":["k","pmf","iGrid","pWinByI","gen","qByGen"],"scene":["paths"],"issues":["param","critical-slow","capped","budget","normalized"]},"queue":{"scalar":["rho","a","p0","erlangB","erlangC","lq","l","wq","w"],"series":["qn","qProb"],"scene":[],"issues":["unstable","param"]},"bootstrap":{"scalar":["estimate","se","bias","pctLo","pctHi","basicLo","basicHi","bcaLo","bcaHi","normLo","normHi","permP","B"],"series":["histX","histCount","histDensity"],"scene":[],"issues":["param","few-data","budget","bca-undefined"]},"combin":{"scalar":["pmf","logpmf","outcomes","chi2","pChi2","pExact","cov","corr","eT","varT","sdT","pDone","median","eTApprox","pMatch","pNone","nFor","pApprox","expPairs"],"prefix":{"mean.":"$probs","var.":"$probs"},"series":["m","pmfT","cdfT","nGrid","pByN","approxByN","k","marg"],"scene":[],"issues":["param","budget","approx","normalized","underflow"]},"gof":{"scalar":["stat","p","pAsym","n","n2","df","reject","dPlus","dMinus","w","statAdj","minExpected"],"series":["ecdfX","ecdfY","cdfY","qqX","qqY","binLo","observed","expected"],"scene":[],"issues":["param","ties","few-data","approx","low-expected","estimated","zero-range","discrete","budget"]},"mcmc":{"scalar":["accept","draws","rhatMax","essMin"],"prefix":{"mean.":"$params","sd.":"$params","q05.":"$params","q50.":"$params","q95.":"$params","ess.":"$params","essTail.":"$params","rhat.":"$params","mcse.":"$params"},"series":["iter","lag"],"sprefix":{"trace.":"$params","trace2.":"$params","acf.":"$params","histX.":"$params","histDensity.":"$params"},"scene":[],"issues":["param","budget","no-kit","not-converged","low-ess","accept-extreme","nan-density"]},"multivar":{"scalar":["logpdf","pdf","maha","cdf","pEllipse","logdet","dim","r","rho","tau","pR","pRho","pTau","r2","adjR2","sigma","fStat","fP","df","dfModel","logLik","aic","bic","deviance","nullDeviance","iter","totalVar","entropy","n"],"prefix":{"mean.":"$dim","var.":"$dim","sd.":"$dim","eig.":"$dim","prop.":"$dim","cumProp.":"$dim","coef.":"$coef","se.":"$coef","stat.":"$coef","p.":"$coef","ciLo.":"$coef","ciHi.":"$coef","load.":"$dim2","cov.":"$dim2","corr.":"$dim2","chol.":"$dim2"},"series":["fitted","resid","lev","cook","pc1","pc2","scree","drawX","drawY","ellX","ellY"],"scene":[],"issues":["param","not-pd","singular","separation","no-convergence","few-data","ties","dim","budget"]},"rand":{"scalar":["errK","kNeeded","kHoeffding","lvExpected","lvTail","eComp","varComp","approxComp","simMean","simSd","pSuccess","pFailK","kRuns","minCut","simSuccess","pKS","errBound","errExact","pDetect","equal","isPrime","fermatLiars","mrLiars","fracFermat","fracMR","carmichael","witness","mu","pAbove","chernoffUpper","pBelow","chernoffLower","uncovered","uncoveredBound","eMax","pMaxLe","approxMax","simMax","eCollisions","pCollision","pCollisionBound","fpExact","fpApprox","fpClassic","kOpt","kOptInt","mFor","simFp","eps","delta","errAbs","wFor","dFor","simMaxErr","simMeanErr","simFracOver","stdErr","simRelSd","simRelBias","inclusion","chi2","pChi2","coverExact","hitMax","matthews","aleliunas","simCover","eSteps","worstSteps","pFailT","markovT","rounds","exact","markov","chebyshev","cantelli","chernoff","hoeffding","tightest","eHeight","searchCost","pointers","approxHeight","eDepth","eDepthAvg","heightApprox","estimate","se","err","seExact","errRootN"],"series":["kGrid","errByK","histX","histDensity","loadGrid","pMax","fpByK","pos","freq","aGrid","exactBy","markovBy","chebyshevBy","cantelliBy","chernoffBy","hoeffdingBy","runN","runEst","runLo","runHi","tGrid","pFailByT"],"scene":[],"issues":["param","budget","no-kit","not-applicable","approx","big-number","disconnected"]}}}''')

_MISSING = object()
_IDX = re.compile(r"^(0|[1-9][0-9]{0,5})$")
_KINDS = ["scalar", "series", "scene"]


def _dig(o, path):
    v = o
    for k in path.split("."):
        if not L.is_obj(v) or k not in v: return _MISSING
        v = v[k]
    return v


def _num(v): return L.is_num(v)


def _js(v):
    """a number as JS prints it in a template (an integral float without .0)"""
    return str(int(v)) if isinstance(v, float) and v.is_integer() and abs(v) < 1e21 else str(v)


def _spec_names(spec):
    out = []
    if L.is_obj(spec.get("consts")): out.extend(spec["consts"].keys())
    for k in ("params", "derived"):
        if isinstance(spec.get(k), list):
            for p in spec[k]:
                if L.is_obj(p) and isinstance(p.get("id"), str): out.append(p["id"])
    return out


def _dist_table(F):
    T = {"family": "enum:" + "|".join(DATA["families"].keys()) + "!"}
    if not F: return T
    for k, kd in F["p"].items():
        req = kd.endswith("!"); b = kd[:-1] if req else kd
        if b == "bool": T[k] = "bool"
        elif b == "list": T[k] = {"$req": True, "$list": "numx", "max": 64, "min": 1}
        elif b == "flist": T[k] = {"$list": "fin", "max": 64}
        else: T[k] = "numx!" if req else "numx"
    return T


def _check_dist(o, p, E, W):
    if not L.is_obj(o): E("format", p, "not an object"); return
    fam = o.get("family")
    F = DATA["families"][fam] if isinstance(fam, str) and fam in DATA["families"] else None
    L.walk(o, _dist_table(F), p, E, W)
    if not F: return
    for k, kd in F["p"].items():
        b = kd.replace("!", ""); v = o.get(k, _MISSING)
        if b in ("bool", "flist"): continue
        if b == "list":
            if isinstance(v, list):
                for i, x in enumerate(v):
                    if _num(x) and x < 0: E("value", f"{p}.{k}[{i}]", L.kind_msg("nonneg"))
            continue
        if _num(v) and not L.check_kind(b, v): E("value", f"{p}.{k}", L.kind_msg(b))
    n = lambda k: _num(o.get(k, _MISSING))
    if fam == "uniform" and n("a") and n("b") and not (o["b"] > o["a"]): E("value", p + ".b", "needs b > a")
    if fam == "dunif" and n("a") and n("b") and not (o["b"] >= o["a"]): E("value", p + ".b", "needs b >= a")
    if fam == "triangular" and n("a") and n("b") and n("c") and not (o["a"] <= o["c"] <= o["b"] and o["a"] < o["b"]): E("value", p + ".c", "needs a <= c <= b and a < b")
    if fam == "hypergeometric" and n("N") and n("K") and o["K"] > o["N"]: E("value", p + ".K", "needs K <= N")
    if fam == "hypergeometric" and n("N") and n("n") and o["n"] > o["N"]: E("value", p + ".n", "needs n <= N")
    if fam == "gamma" and "rate" in o and "scale" in o: E("value", p + ".scale", "give rate or scale, not both")
    if fam == "categorical" and isinstance(o.get("values"), list) and isinstance(o.get("probs"), list) and len(o["values"]) != len(o["probs"]):
        E("value", p + ".values", "needs one value per probability")


def _pref_ok(pref, of, m):
    if not pref: return False
    for pf, vals in pref.items():
        if not of.startswith(pf): continue
        rest = of[len(pf):]
        if isinstance(vals, list):
            if rest in vals: return True
            continue
        if vals == "$states":
            if isinstance(m.get("states"), list) and rest in m["states"]: return True
            continue
        if vals == "$params":
            if rest in _param_names(m): return True
            continue
        if vals == "$dim2":
            g = _DIM2.match(rest); K = _dim_of(m)
            if g and not rest.endswith("\n") and int(g.group(1)) < K and int(g.group(2)) < K: return True
            continue
        if vals in ("$dim", "$coef"):
            K = _dim_of(m) if vals == "$dim" else _dim_of(m) + (0 if m.get("intercept") is False else 1)
            if _IDX.match(rest) and not rest.endswith("\n") and int(rest) < K: return True
            continue
        arr = m.get("strata") if vals == "$strata" else m.get("probs") if vals == "$probs" else m.get("p")
        if _IDX.match(rest) and not rest.endswith("\n") and isinstance(arr, list) and int(rest) < len(arr): return True
    return False


_DIM2 = re.compile(r"^(0|[1-9][0-9]?)_(0|[1-9][0-9]?)$")


def _param_names(m):
    if m.get("kind") == "gibbs-bivnormal": return ["x", "y"]
    if m.get("kind") == "gibbs-normal": return ["mu", "sigma"]
    return [v for v in m["params"] if isinstance(v, str)] if isinstance(m.get("params"), list) else []


def _dim_of(m):
    if m.get("kind") == "mvnormal": return len(m["mu"]) if isinstance(m.get("mu"), list) else 0
    if m.get("kind") == "dirichlet": return len(m["conc"]) if isinstance(m.get("conc"), list) else 0
    d = m.get("data")
    return len(d[0]) if isinstance(d, list) and d and isinstance(d[0], list) else 0


def _out_ok(mode, m, kind, of):
    O = DATA["outs"][mode]
    if kind == "scalar":
        return of in O["scalar"] or (of.startswith("issue.") and of[6:] in O["issues"]) or _pref_ok(O.get("prefix"), of, m)
    if kind == "series": return of in O["series"] or _pref_ok(O.get("sprefix"), of, m)
    return of in O["scene"]


def _extra(mode, m, spec, E, W):
    if mode in ("dist", "sampling"):
        f = "dist" if mode == "dist" else "parent"
        if f not in m: E("value", "model." + f, "missing")
        else: _check_dist(m[f], "model." + f, E, W)
    if mode in ("gof", "rand") and "dist" in m: _check_dist(m["dist"], "model.dist", E, W)
    if mode == "mc":
        if "draws" not in m: E("value", "model.draws", "missing")
        elif not L.is_obj(m["draws"]): E("format", "model.draws", "not an object")
        else:
            d = m["draws"]; ks = list(d.keys())
            if not ks: E("size", "model.draws", "fewer than 1 items")
            elif len(ks) > 16: E("size", "model.draws", "more than 16 items")
            else:
                taken = _spec_names(spec)
                for k in ks:
                    p = "model.draws." + k
                    if not L.check_kind("name", k): E("value", p, L.kind_msg("name"))
                    elif k in taken: E("value", p, "is already a name of the spec")
                    else: _check_dist(d[k], p, E, W)
    for f, kd in DATA["ranges"][mode].items():
        v = _dig(m, f)
        if v is not _MISSING and _num(v) and not L.check_kind(kd, v): E("value", "model." + f, L.kind_msg(kd))
    kf = DATA["kindField"].get(mode)
    if kf and mode in DATA["needs"]:
        kind = "*" if kf == "*" else m.get(kf)
        alts = DATA["needs"][mode][kind] if isinstance(kind, str) and kind in DATA["needs"][mode] else None
        if alts and not any(all(_dig(m, f) is not _MISSING for f in a) for a in alts):
            E("value", "model", f"{mode if kind == '*' else kind} needs " + " or ".join(" and ".join(a) for a in alts))
    k = m.get("kind"); A = lambda v: isinstance(v, list)
    if mode == "test":
        if A(m.get("table")):
            rows = m["table"]
            rect = len(rows) > 0 and all(A(r) and A(rows[0]) and len(r) == len(rows[0]) for r in rows)
            if not rect: E("value", "model.table", "needs rows of the same length")
            elif k in ("fisher", "mcnemar") and not (len(rows) == 2 and len(rows[0]) == 2): E("value", "model.table", "needs a 2 × 2 table")
            elif k in ("chi2-indep", "g-test") and (len(rows) < 2 or len(rows[0]) < 2): E("size", "model.table", "needs at least 2 rows and 2 columns")
        if k in ("t-paired", "pearson", "regression") and A(m.get("x")) and A(m.get("y")) and len(m["x"]) != len(m["y"]):
            E("value", "model.y", "needs as many values as model.x")
        if k in ("chi2-gof", "g-test") and A(m.get("observed")) and A(m.get("probs")) and len(m["observed"]) != len(m["probs"]):
            E("value", "model.probs", "needs one probability per observed count")
        if k == "anova" and A(m.get("groups")) and len(m["groups"]) < 2: E("size", "model.groups", "needs at least 2 groups")
    elif mode == "ci":
        meth = m.get("method")
        if isinstance(meth, str) and isinstance(k, str) and k in DATA["ciMethods"] and meth not in DATA["ciMethods"][k]:
            E("value", "model.method", f"not a method for {k} ({', '.join(DATA['ciMethods'][k])})")
    elif mode == "bootstrap":
        if m.get("stat") == "corr" and A(m.get("x")) and A(m.get("y")) and len(m["x"]) != len(m["y"]): E("value", "model.y", "needs as many values as model.x")
        if m.get("perm") is True and "y" not in m: E("value", "model.perm", "needs model.y")
    elif mode == "markov":
        S = m["states"] if A(m.get("states")) else None
        if S is not None:
            K = len(S)
            for i, s in enumerate(S):
                if isinstance(s, str) and S.index(s) < i: E("value", f"model.states[{i}]", f"the state {s} is listed twice")
            if A(m.get("P")) and (len(m["P"]) != K or any(not A(r) or len(r) != K for r in m["P"])): E("value", "model.P", f"needs {K} rows of {K} numbers")
            if A(m.get("init")) and len(m["init"]) != K: E("value", "model.init", f"needs {K} numbers")
            if A(m.get("labels")) and len(m["labels"]) != K: E("value", "model.labels", f"needs {K} keys")
            if isinstance(m.get("start"), str) and m["start"] not in S: E("value", "model.start", "not one of model.states")
        if "init" in m and "start" in m: E("value", "model.start", "give init or start, not both")
    elif mode == "simpson":
        if A(m.get("strata")):
            for i, s in enumerate(m["strata"]):
                if not L.is_obj(s): continue
                if _num(s.get("k1", _MISSING)) and _num(s.get("n1", _MISSING)) and s["k1"] > s["n1"]: E("value", f"model.strata[{i}].k1", "needs k1 <= n1")
                if _num(s.get("k2", _MISSING)) and _num(s.get("n2", _MISSING)) and s["k2"] > s["n2"]: E("value", f"model.strata[{i}].k2", "needs k2 <= n2")
    elif mode == "walk":
        if k == "ruin" and _num(m.get("i", _MISSING)) and _num(m.get("N", _MISSING)) and m["i"] > m["N"]: E("value", "model.i", "needs i <= N")
    elif mode == "multi":
        sim = m.get("sim")
        if L.is_obj(sim) and _num(sim.get("m", _MISSING)) and _num(sim.get("m0", _MISSING)) and sim["m0"] > sim["m"]: E("value", "model.sim.m0", "needs m0 <= m")
    elif mode == "combin":
        if A(m.get("probs")):
            for i, x in enumerate(m["probs"]):
                if _num(x) and x < 0: E("value", f"model.probs[{i}]", L.kind_msg("nonneg"))
        if k == "multinomial" and A(m.get("probs")) and len(m["probs"]) > 64: E("size", "model.probs", "more than 64 items")
        if k == "multinomial" and A(m.get("probs")) and A(m.get("x")) and len(m["x"]) != len(m["probs"]): E("value", "model.x", "needs one count per probability")
        if k == "coupon" and A(m.get("probs")) and _num(m.get("types", _MISSING)) and len(m["probs"]) != m["types"]: E("value", "model.probs", f"needs {_js(m['types'])} numbers")
        if k == "coupon" and _num(m.get("want", _MISSING)) and _num(m.get("types", _MISSING)) and m["want"] > m["types"]: E("value", "model.want", "needs want <= types")
        if k == "birthday" and A(m.get("probs")) and _num(m.get("days", _MISSING)) and len(m["probs"]) != m["days"]: E("value", "model.probs", f"needs {_js(m['days'])} numbers")
    elif mode == "gof":
        if m.get("estimate") is True and k != "anderson-darling": E("value", "model.estimate", "only for anderson-darling")
        elif m.get("estimate") is True and "dist" in m: E("value", "model.estimate", "give dist or estimate, not both")
    elif mode == "mcmc":
        if k == "metropolis" and A(m.get("params")):
            Pn = m["params"]; taken = _spec_names(spec); K = len(Pn)
            for i, v in enumerate(Pn):
                if not isinstance(v, str): continue
                if Pn.index(v) < i: E("value", f"model.params[{i}]", f"the parameter {v} is listed twice")
                elif v in taken: E("value", f"model.params[{i}]", "is already a name of the spec")
            if A(m.get("init")) and len(m["init"]) != K: E("value", "model.init", f"needs {K} numbers")
            if A(m.get("scale")) and len(m["scale"]) != K: E("value", "model.scale", f"needs {K} numbers")
        if _num(m.get("burn", _MISSING)) and _num(m.get("iters", _MISSING)) and m["burn"] >= m["iters"]: E("value", "model.burn", "needs burn < iters")
    elif mode == "multivar":
        if k == "mvnormal" and A(m.get("mu")):
            K = len(m["mu"])
            if A(m.get("cov")) and (len(m["cov"]) != K or any(not A(r) or len(r) != K for r in m["cov"])): E("value", "model.cov", f"needs {K} rows of {K} numbers")
            if A(m.get("x")) and len(m["x"]) != K: E("value", "model.x", f"needs {K} numbers")
        if k == "dirichlet" and A(m.get("conc")) and A(m.get("x")) and len(m["x"]) != len(m["conc"]): E("value", "model.x", f"needs {len(m['conc'])} numbers")
        d = m.get("data")
        if A(d) and d and not all(A(r) and A(d[0]) and len(r) == len(d[0]) for r in d): E("value", "model.data", "needs rows of the same length")
        if A(d) and A(m.get("y")) and len(m["y"]) != len(d): E("value", "model.y", "needs one value per row of model.data")
        if A(d) and A(m.get("w")) and len(m["w"]) != len(d): E("value", "model.w", "needs one value per row of model.data")
    elif mode == "rand":
        g = lambda f: _num(m.get(f, _MISSING))
        if k == "quickselect" and g("r") and g("n") and m["r"] > m["n"]: E("value", "model.r", "needs r <= n")
        if k == "reservoir" and g("k") and g("n") and m["k"] > m["n"]: E("value", "model.k", "needs k <= n")
        if k == "twosat" and g("i") and g("n") and m["i"] > m["n"]: E("value", "model.i", "needs i <= n")
        if k == "freivalds" and A(m.get("A")) and A(m.get("B")) and A(m.get("Cm")):
            K = len(m["A"]); sq = lambda Q: A(Q) and len(Q) == K and all(A(r) and len(r) == K for r in Q)
            if not K or not sq(m["A"]) or not sq(m["B"]) or not sq(m["Cm"]): E("value", "model.A", "needs square matrices of one size")
        if k == "mcpi" and "expr" in m and "x" in _spec_names(spec): E("value", "model.expr", "x is already a name of the spec")


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m):
        E("format", "model", "not an object")
        L.check_outputs(spec, ID, _KINDS, lambda o, at, E, W: None, E, W)
        return P
    mode = m.get("mode") if isinstance(m.get("mode"), str) and m.get("mode") in DATA["modes"] else None
    T = {"mode": "enum:" + "|".join(DATA["modes"]) + "!"}
    if mode: T.update(DATA["schema"][mode])
    own = DATA["custom"].get(mode, []) if mode else []
    L.walk({k: v for k, v in m.items() if k not in own}, T, "model", E, W)
    if mode: _extra(mode, m, spec, E, W)

    def out(o, at, E, W):
        if mode and not _out_ok(mode, m, o["kind"], o["of"]): E("output", at + ".of", f'{mode} computes no {o["kind"]} "{o["of"]}"')
    L.check_outputs(spec, ID, _KINDS, out, E, W)
    return P


def exprs(spec):
    out = []
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m) or m.get("mode") not in DATA["modes"]: return out
    local = list(m["draws"].keys()) if m["mode"] == "mc" and L.is_obj(m.get("draws")) else _param_names(m) if m["mode"] == "mcmc" else ["x"] if m["mode"] == "rand" else []

    def visit_dist(o, p):
        if not L.is_obj(o) or not isinstance(o.get("family"), str) or o["family"] not in DATA["families"]: return
        for k, kd in DATA["families"][o["family"]]["p"].items():
            v = o.get(k, _MISSING)
            if kd.startswith("list"):
                if isinstance(v, list):
                    for i, x in enumerate(v):
                        if isinstance(x, str): out.append((x, f"{p}.{k}[{i}]", []))
            elif not kd.startswith("bool") and not kd.startswith("flist") and isinstance(v, str): out.append((v, p + "." + k, []))
    if m["mode"] == "dist": visit_dist(m.get("dist"), "model.dist")
    if m["mode"] == "sampling": visit_dist(m.get("parent"), "model.parent")
    if m["mode"] == "mc" and L.is_obj(m.get("draws")):
        for k in m["draws"]: visit_dist(m["draws"][k], "model.draws." + k)
    if m["mode"] in ("gof", "rand"): visit_dist(m.get("dist"), "model.dist")

    def visit(v, kd, p):
        if v is _MISSING or kd is None: return
        if isinstance(kd, str):
            b = kd.replace("!", "")
            if b in ("numx", "expr") and isinstance(v, str): out.append((v, p, local if b == "expr" else []))
            return
        if "$obj" in kd:
            if L.is_obj(v):
                for k, sub in kd["$obj"].items(): visit(v.get(k, _MISSING), sub, p + "." + k)
            return
        if "$list" in kd and isinstance(v, list):
            for i, x in enumerate(v): visit(x, kd["$list"], f"{p}[{i}]")
    for k, kd in DATA["schema"][m["mode"]].items(): visit(m.get(k, _MISSING), kd, "model." + k)
    return out


def keys(spec):
    """the labels of a Markov chain's states"""
    m = spec.get("model") if L.is_obj(spec) else None
    if not L.is_obj(m) or m.get("mode") != "markov" or not isinstance(m.get("labels"), list): return []
    return [(k, f"model.labels[{i}]") for i, k in enumerate(m["labels"]) if isinstance(k, str)]
