/* ===================== philo@1 — the computable parts of philosophy: the engine library of sim-spec@1 (docs/library/philo.md) =====================
   Ethics calculi (population axiologies — total, average, critical-level, variable value, prioritarian, leximin, sufficientarian,
   egalitarian, Confucian graded concern, lexical priority — and their paradoxes; trolley-family cases under nine principles; Kant's
   universalisation tests in three readings; virtue profiles on the doctrine of the mean), social choice (17 voting methods, the
   majority relation and its cycles, Arrow's and other criteria tested on profiles, manipulation, single-peakedness), decision theory
   (expected utility, prospect theory, maxmin EU, decision under ignorance, Allais, St Petersburg, Newcomb-type problems under EDT and
   CDT), game theory (2×2 equilibria, iterated prisoner's dilemma tournaments and replicator dynamics, bargaining solutions),
   epistemology (Bayesian confirmation measures, Dutch books, Gettier cases under nine analyses, sorites by degrees and
   supervaluation, lottery and preface, Sleeping Beauty), Indian and Buddhist forms (Dignāga's wheel of reasons, the catuṣkoṭi, the
   Jain saptabhaṅgī), thought experiments as structured positions, a drawn map of thinkers and influences, and argument validity
   through logic@1 (NoemaLibLogic: parse, atomsOf, truthTable, entails — never re-implemented here).
   Added (§8): rule consequentialism at an acceptance rate (Hooker 2000; Ridge 2006), voting games' pure Nash equilibria and
   Gibbard–Satterthwaite manipulability, infinite utility streams (overtaking, catching-up, Pareto vs anonymity), Metz's ubuntu as a
   relational score (promote / honour); mixed equilibria of bimatrix games (support enumeration, Lemke–Howson) and of voting blocs
   (exact for two, replicator-approximate beyond), Poisson voting games (Myerson 1998, 2000: pivots, magnitudes, equilibria).
   Sources: beside each function and in docs/library/philo.md. Pure, bounded, deterministic; numbers, codes and keys only.
   Tests: node tests/lib_philo.js */
import NoemaLibCore from '../kernel/core.ts';
import NoemaSimKit from '../kernel/simkit.ts';
import NoemaLibLogic from '../logic/logic.js';
  /* i18n-ignore-start */   // code, not text: only codes, keys, numbers and the model's own ids leave this engine
  const C = NoemaLibCore;
  const ID = 'philo@1';
  /*T*/ const T = {"PROB":{"newcomb":{"acts":["one","two"],"states":["full","empty"],"acc":0.99,"big":1000000,"small":1000,"pCause":[0.5,0.5]},"lesion":{"acts":["smoke","abstain"],"states":["cancer","healthy"],"acc":0.8,"big":100,"small":10,"pCause":[0.5,0.5]},"psychopath":{"acts":["push","refrain"],"states":["psychopath","sane"],"acc":0.9,"big":100,"small":10,"pCause":[0.05,0.95]}},"GAMES":{"pd":{"rows":["c","d"],"TRPS":[5,3,1,0]},"stag":{"rows":["stag","hare"],"TRPS":[3,4,3,0]},"chicken":{"rows":["swerve","straight"],"TRPS":[4,3,0,1]},"hawkdove":{"rows":["dove","hawk"],"TRPS":[2,1,-1,0]},"coord":{"rows":["a","b"],"TRPS":[0,1,1,0]},"bos":{"rows":["opera","football"],"pay":[[[2,1],[0,0]],[[0,0],[1,2]]]},"pennies":{"rows":["heads","tails"],"pay":[[[1,-1],[-1,1]],[[-1,1],[1,-1]]]}},"MODEL":{"populations":{"$list":{"$obj":{"id":"id!","groups":{"$list":{"$obj":{"n":"numx!","w":"numx!","rel":"numx","levels":{"$list":"numx","max":8}}},"max":64,"min":1,"$req":true}}},"max":32},"cases":{"$list":{"$obj":{"id":"id!","preset":"enum:switch|driver|footbridge|loop|trapdoor|transplant|lazySusan|transmitter","kAct":"numx","sAct":"numx","kNot":"numx","sNot":"numx","means":"bool","redirect":"bool","personal":"bool","consent":"bool","driver":"bool"}},"max":32},"maxims":{"$list":{"$obj":{"id":"id!","preset":"enum:suicide|falsePromise|talents|beneficence|tennis|toys|deposit","conception":"bool","practical":"bool","natural":"bool","will":"bool"}},"max":16},"profiles":{"$list":{"$obj":{"id":"id!","scheme":"enum:aristotle|confucian|paramita!","traits":{"$req":true,"$map":"numx","max":16},"tol":"numx"}},"max":16},"elections":{"$list":{"$obj":{"id":"id!","candidates":{"$list":"id","max":8,"min":2,"$req":true},"ballots":{"$list":{"$obj":{"n":"numx!","rank":{"$list":"ref","max":8,"min":1,"$req":true},"approve":"numx"}},"max":64,"min":1,"$req":true},"axis":{"$list":"ref","max":8}}},"max":16},"lotteries":{"$list":{"$obj":{"id":"id!","outcomes":{"$list":{"$obj":{"p":"numx!","x":"numx!"}},"max":32,"min":1,"$req":true},"priors":{"$list":{"$list":"numx","max":32},"max":16}}},"max":32},"utility":{"$obj":{"u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"}},"problems":{"$list":{"$obj":{"id":"id!","preset":"enum:newcomb|lesion|psychopath","acts":{"$list":"id","max":6,"min":2},"states":{"$list":"id","max":6,"min":1},"u":{"$list":{"$list":"numx","max":6},"max":6},"pAct":{"$list":{"$list":"numx","max":6},"max":6},"pCause":{"$list":"numx","max":6},"acc":"numx","big":"numx","small":"numx"}},"max":8},"games":{"$list":{"$obj":{"id":"id!","preset":"enum:pd|stag|chicken|hawkdove|bos|pennies|coord","T":"numx","R":"numx","P":"numx","S":"numx","rows":{"$list":"id","max":6,"min":2},"cols":{"$list":"id","max":6,"min":2},"pay":{"$list":{"$list":{"$list":"numx","max":2,"min":2},"max":6},"max":6}}},"max":8},"tournament":{"$obj":{"game":"ref!","strategies":{"$list":"enum:allc|alld|tft|tf2t|grim|pavlov|random|gtft|alt|joss|stft","max":12,"min":1,"$req":true},"rounds":"numx","noise":"numx","reps":"numx","gens":"numx","self":"bool"}},"beliefs":{"$list":{"$obj":{"id":"id!","h":"numx!","eh":"numx!","enh":"numx!"}},"max":16},"knowledge":{"$list":{"$obj":{"id":"id!","preset":"enum:coins|ford|barns|clock|sheep|mirage|smoke|truetemp|lottery|ordinary","believed":"bool","truth":"bool","justified":"bool","falseLemma":"bool","defeater":"bool","causal":"bool","reliable":"bool","sensitive":"bool","safe":"bool","apt":"bool","intuition":"bool"}},"max":16},"sorites":{"$obj":{"n":"numx","lo":"numx","hi":"numx","shape":"enum:linear|logistic","plo":"numx","phi":"numx","cut":"numx"}},"experiments":{"$list":{"$obj":{"id":"id!","te":"enum:chineseRoom|mary|zombie|brainVat|teleporter|ship|twinEarth|experienceMachine|violinist|veil|gyges|floatingMan|butterfly|chariot|childWell|swampman|invertedSpectrum|personhood|cottonFire","options":{"$list":"id","max":8,"min":2},"positions":{"$map":"ref","max":12}}},"max":16},"thinkers":{"$list":{"$obj":{"id":"id!","label":"key","born":"numx","died":"numx","trad":"enum:greek|indian|buddhist|jain|chinese|islamic|jewish|latin|modern|analytic|continental|african","infl":{"$list":"ref","max":16}}},"max":64},"arguments":{"$list":{"$obj":{"id":"id!","premises":{"$list":"expr","max":12,"min":1,"$req":true},"conclusion":"expr!"}},"max":16},"inferences":{"$list":{"$obj":{"id":"id!","paksa":"bool!","sapaksa":"enum:all|some|none!","vipaksa":"enum:all|some|none!"}},"max":16},"bargains":{"$list":{"$obj":{"id":"id!","pts":{"$list":{"$list":"numx","max":2,"min":2},"max":32,"min":1,"$req":true},"d":{"$list":"numx","max":2,"min":2}}},"max":8},"ruleCodes":{"$list":{"$obj":{"id":"id!","rules":{"$list":{"$obj":{"id":"id!","b":"numx!","c":"numx","k":"numx","x":"numx"}},"max":32,"min":1,"$req":true}}},"max":16},"streams":{"$list":{"$obj":{"id":"id!","head":{"$list":"numx","max":2000},"cycle":{"$list":"numx","max":64,"min":1,"$req":true}}},"max":16},"ubuntu":{"$list":{"$obj":{"id":"id!","options":{"$list":{"$obj":{"id":"id!","effects":{"$list":{"$obj":{"who":"id","identity":"numx","solidarity":"numx","byAgent":"bool"}},"max":64}}},"max":12,"min":1,"$req":true},"wI":"numx","wS":"numx"}},"max":16},"poisson":{"$list":{"$obj":{"id":"id!","n":"numx!","candidates":{"$list":"id","max":6,"min":2,"$req":true},"types":{"$list":{"$obj":{"id":"id!","r":"numx!","u":{"$list":"numx","max":6,"min":2,"$req":true},"vote":"ref"}},"max":16,"min":1,"$req":true}}},"max":8}},"OUT":{"scalar":{"welfare":{"id":"expr","kind":"expr","of":"expr","population":"ref!","rule":"enum:total|average|critical|variable|prior|kolm|maximin|leximin|suff|egal|equality|graded|lexical!","gamma":"numx","c":"numx","tau":"numx","delta":"numx","k":"numx"},"compare":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","rule":"enum:total|average|critical|variable|prior|kolm|maximin|leximin|suff|egal|equality|graded|lexical!","gamma":"numx","c":"numx","tau":"numx","delta":"numx","k":"numx"},"best":{"id":"expr","kind":"expr","of":"expr","rule":"enum:total|average|critical|variable|prior|kolm|maximin|leximin|suff|egal|equality|graded|lexical!","gamma":"numx","c":"numx","tau":"numx","delta":"numx","k":"numx"},"paradox":{"id":"expr","kind":"expr","of":"expr","paradox":"enum:repugnant|mereAddition|sadistic|levellingDown!","rule":"enum:total|average|critical|variable|prior|kolm|maximin|leximin|suff|egal|equality|graded|lexical!","gamma":"numx","c":"numx","tau":"numx","delta":"numx","k":"numx"},"verdict":{"id":"expr","kind":"expr","of":"expr","case":"ref!","principle":"enum:util|dde|means|doingAllowing|redirect|personalForce|threshold|contract|taurek!","T":"numx"},"permits":{"id":"expr","kind":"expr","of":"expr","case":"ref!","T":"numx"},"ful":{"id":"expr","kind":"expr","of":"expr","maxim":"ref!","reading":"enum:logical|practical|teleological"},"trait":{"id":"expr","kind":"expr","of":"expr","profile":"ref!","trait":"expr!"},"virtue":{"id":"expr","kind":"expr","of":"expr","profile":"ref!"},"winner":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|runoff|irv|coombs|nanson|baldwin|bucklin|copeland|minimax|schulze|rankedPairs|kemeny|approval|black|condorcet!"},"score":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|copeland|minimax|approval|bucklin!","cand":"ref!"},"margin":{"id":"expr","kind":"expr","of":"expr","election":"ref!","a":"ref!","b":"ref!"},"condorcet":{"id":"expr","kind":"expr","of":"expr","election":"ref!","loser":"bool"},"cycle":{"id":"expr","kind":"expr","of":"expr","election":"ref!"},"smith":{"id":"expr","kind":"expr","of":"expr","election":"ref!"},"criterion":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|runoff|irv|coombs|nanson|baldwin|bucklin|copeland|minimax|schulze|rankedPairs|kemeny|approval|black|condorcet!","criterion":"enum:condorcet|condorcetLoser|majority|pareto|monotonic|spoiler|participation|iia!","other":"ref"},"manipulable":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|runoff|irv|coombs|nanson|baldwin|bucklin|copeland|minimax|schulze|rankedPairs|kemeny|approval|black|condorcet!"},"singlePeaked":{"id":"expr","kind":"expr","of":"expr","election":"ref!"},"ev":{"id":"expr","kind":"expr","of":"expr","lottery":"ref!"},"eu":{"id":"expr","kind":"expr","of":"expr","lottery":"ref!","u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"},"ce":{"id":"expr","kind":"expr","of":"expr","lottery":"ref!","u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"},"premium":{"id":"expr","kind":"expr","of":"expr","lottery":"ref!","u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"},"cpt":{"id":"expr","kind":"expr","of":"expr","lottery":"ref!","alpha":"numx","beta":"numx","lam":"numx","gp":"numx","gm":"numx","ref":"numx"},"meu":{"id":"expr","kind":"expr","of":"expr","lottery":"ref!","alpha":"numx","u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"},"choose":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","rule":"enum:ev|eu|cpt|meu|maxmin|maximax|regret|hurwicz|laplace|discount!","alpha":"numx","eps":"numx","u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"},"commonCons":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","c":"ref!","d":"ref!"},"stpete":{"id":"expr","kind":"expr","of":"expr","what":"enum:ev|eu|ce!","rounds":"numx","bank":"numx","u":"enum:linear|log|sqrt|power|cara|bounded","ua":"numx","w0":"numx"},"dtv":{"id":"expr","kind":"expr","of":"expr","problem":"ref!","theory":"enum:edt|cdt!","act":"ref"},"dominant":{"id":"expr","kind":"expr","of":"expr","problem":"ref!"},"nash":{"id":"expr","kind":"expr","of":"expr","game":"ref!"},"isNash":{"id":"expr","kind":"expr","of":"expr","game":"ref!","r":"numx!","c":"numx!"},"mixed":{"id":"expr","kind":"expr","of":"expr","game":"ref!","player":"int:1:2"},"dominantStrat":{"id":"expr","kind":"expr","of":"expr","game":"ref!","player":"int:1:2"},"paretoCell":{"id":"expr","kind":"expr","of":"expr","game":"ref!","r":"numx!","c":"numx!"},"grimDelta":{"id":"expr","kind":"expr","of":"expr","game":"ref!"},"ipd":{"id":"expr","kind":"expr","of":"expr","strategy":"enum:allc|alld|tft|tf2t|grim|pavlov|random|gtft|alt|joss|stft!","what":"enum:mean|rank|share!"},"confirm":{"id":"expr","kind":"expr","of":"expr","belief":"ref!","measure":"enum:d|r|l|s|k|z|c|post!"},"dutch":{"id":"expr","kind":"expr","of":"expr","cr":{"$list":"numx","max":32,"min":1,"$req":true}},"knows":{"id":"expr","kind":"expr","of":"expr","case":"ref!","analysis":"enum:jtb|noFalseLemma|defeasibility|causal|reliabilism|sensitivity|safety|virtue|intuition!"},"fits":{"id":"expr","kind":"expr","of":"expr","analysis":"enum:jtb|noFalseLemma|defeasibility|causal|reliabilism|sensitivity|safety|virtue|intuition!"},"sorites":{"id":"expr","kind":"expr","of":"expr","what":"enum:condMin|bound|superTrue|superFalse|indet|cutoff|value!","k":"numx","i":"numx"},"lottery":{"id":"expr","kind":"expr","of":"expr","n":"numx!","t":"numx!","what":"enum:believed|conj|closure!"},"preface":{"id":"expr","kind":"expr","of":"expr","n":"numx!","r":"numx!","t":"numx!","what":"enum:conj|maxClaims!"},"beauty":{"id":"expr","kind":"expr","of":"expr","theory":"enum:halfer|thirder|double!","wakes":"numx","monday":"bool"},"teAnswer":{"id":"expr","kind":"expr","of":"expr","experiment":"ref!","position":"expr!"},"teCount":{"id":"expr","kind":"expr","of":"expr","experiment":"ref!","option":"numx!"},"influence":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"overlap":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"valid":{"id":"expr","kind":"expr","of":"expr","argument":"ref!"},"counter":{"id":"expr","kind":"expr","of":"expr","argument":"ref!"},"form":{"id":"expr","kind":"expr","of":"expr","argument":"ref!"},"hetu":{"id":"expr","kind":"expr","of":"expr","inference":"ref!","what":"enum:cell|verdict!"},"koti":{"id":"expr","kind":"expr","of":"expr","t":"numx!","f":"numx!","e":"numx"},"bhanga":{"id":"expr","kind":"expr","of":"expr","asti":"numx!","nasti":"numx!","avak":"numx!"},"bargain":{"id":"expr","kind":"expr","of":"expr","bargain":"ref!","solution":"enum:nash|ks|egal|util!","coord":"int:0:1"},"codeValue":{"id":"expr","kind":"expr","of":"expr","code":"ref!","rate":"numx","reading":"enum:fixed|variable"},"ruleValue":{"id":"expr","kind":"expr","of":"expr","code":"ref!","rule":"id!","rate":"numx"},"idealCode":{"id":"expr","kind":"expr","of":"expr","rate":"numx","reading":"enum:fixed|variable"},"bestRate":{"id":"expr","kind":"expr","of":"expr","code":"ref!"},"idealShift":{"id":"expr","kind":"expr","of":"expr","rate":"numx"},"voteNash":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|copeland|minimax|irv|runoff|schulze|rankedPairs|kemeny"},"voteNashUndominated":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|copeland|minimax|irv|runoff|schulze|rankedPairs|kemeny"},"voteNashWinners":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|copeland|minimax|irv|runoff|schulze|rankedPairs|kemeny"},"sincereNash":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|copeland|minimax|irv|runoff|schulze|rankedPairs|kemeny"},"gsManipulable":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|runoff|irv|coombs|nanson|baldwin|bucklin|copeland|minimax|schulze|rankedPairs|kemeny|approval|black|condorcet!"},"manipulators":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|runoff|irv|coombs|nanson|baldwin|bucklin|copeland|minimax|schulze|rankedPairs|kemeny|approval|black|condorcet!"},"gsExists":{"id":"expr","kind":"expr","of":"expr","method":"enum:plurality|antiplurality|borda|runoff|irv|coombs|nanson|baldwin|bucklin|copeland|minimax|schulze|rankedPairs|kemeny|approval|black|condorcet!","m":"int:3:4","n":"int:2:4"},"overtaking":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"catchingUp":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"paretoDominates":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"finiteAnonymous":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"infiniteAnonymous":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"infiniteConflict":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!"},"truncCompare":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","T":"numx!"},"discounted":{"id":"expr","kind":"expr","of":"expr","stream":"ref!","delta":"numx!"},"limitAverage":{"id":"expr","kind":"expr","of":"expr","stream":"ref!"},"ubuntuScore":{"id":"expr","kind":"expr","of":"expr","case":"ref!","option":"id!"},"ubuntuPermissible":{"id":"expr","kind":"expr","of":"expr","case":"ref!","option":"id!"},"ubuntuBest":{"id":"expr","kind":"expr","of":"expr","case":"ref!","reading":"enum:promote|honour"},"equilibria":{"id":"expr","kind":"expr","of":"expr","game":"ref!","solver":"enum:support|lemke","label":"numx"},"eqProb":{"id":"expr","kind":"expr","of":"expr","game":"ref!","solver":"enum:support|lemke","label":"numx","eq":"numx","player":"int:1:2","strategy":"numx!"},"eqPayoff":{"id":"expr","kind":"expr","of":"expr","game":"ref!","solver":"enum:support|lemke","label":"numx","eq":"numx","player":"int:1:2"},"mixedVoteCount":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality","util":"enum:borda|top","solver":"enum:support|lemke"},"mixedVoteProb":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality","util":"enum:borda|top","solver":"enum:support|lemke","eq":"numx","group":"numx","candidate":"ref!"},"mixedWinProb":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality","util":"enum:borda|top","solver":"enum:support|lemke","eq":"numx","candidate":"ref!"},"expectedVotes":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!","candidate":"ref!"},"poissonWinProb":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!","candidate":"ref!"},"pivotProb":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!","a":"ref!","b":"ref!"},"pivotMagnitude":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!","a":"ref!","b":"ref!"},"voteGain":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!","type":"id!","candidate":"ref!"},"bestVote":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!","type":"id!"},"poissonEquilibrium":{"id":"expr","kind":"expr","of":"expr","poisson":"ref!"}},"series":{"scores":{"id":"expr","kind":"expr","of":"expr","election":"ref!","method":"enum:plurality|antiplurality|borda|copeland|minimax|approval|bucklin!"},"match":{"id":"expr","kind":"expr","of":"expr","a":"enum:allc|alld|tft|tf2t|grim|pavlov|random|gtft|alt|joss|stft!","b":"enum:allc|alld|tft|tf2t|grim|pavlov|random|gtft|alt|joss|stft!","player":"int:1:2"},"shares":{"id":"expr","kind":"expr","of":"expr","strategy":"enum:allc|alld|tft|tf2t|grim|pavlov|random|gtft|alt|joss|stft!"},"degree":{"id":"expr","kind":"expr","of":"expr"},"bound":{"id":"expr","kind":"expr","of":"expr"},"sorted":{"id":"expr","kind":"expr","of":"expr","population":"ref!"},"codeCurve":{"id":"expr","kind":"expr","of":"expr","code":"ref!"},"rateAxis":{"id":"expr","kind":"expr","of":"expr"},"partialSums":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","T":"numx!"}},"scene":{"majority":{"id":"expr","kind":"expr","of":"expr","election":"ref!"},"parfit":{"id":"expr","kind":"expr","of":"expr","populations":{"$list":"ref","max":8,"min":1,"$req":true}},"virtues":{"id":"expr","kind":"expr","of":"expr","profile":"ref!"},"map":{"id":"expr","kind":"expr","of":"expr","from":"numx","to":"numx","hi":"ref"},"payoffs":{"id":"expr","kind":"expr","of":"expr","game":"ref!"}}},"REFS":{"welfare":{"population":"populations"},"compare":{"a":"populations","b":"populations"},"verdict":{"case":"cases"},"permits":{"case":"cases"},"ful":{"maxim":"maxims"},"trait":{"profile":"profiles"},"virtue":{"profile":"profiles"},"winner":{"election":"elections"},"score":{"election":"elections","cand":"cand"},"margin":{"election":"elections","a":"cand","b":"cand"},"condorcet":{"election":"elections"},"cycle":{"election":"elections"},"smith":{"election":"elections"},"criterion":{"election":"elections","other":"elections"},"manipulable":{"election":"elections"},"singlePeaked":{"election":"elections"},"ev":{"lottery":"lotteries"},"eu":{"lottery":"lotteries"},"ce":{"lottery":"lotteries"},"premium":{"lottery":"lotteries"},"cpt":{"lottery":"lotteries"},"meu":{"lottery":"lotteries"},"choose":{"a":"lotteries","b":"lotteries"},"commonCons":{"a":"lotteries","b":"lotteries","c":"lotteries","d":"lotteries"},"dtv":{"problem":"problems","act":"act"},"dominant":{"problem":"problems"},"nash":{"game":"games"},"isNash":{"game":"games"},"mixed":{"game":"games"},"dominantStrat":{"game":"games"},"paretoCell":{"game":"games"},"grimDelta":{"game":"games"},"confirm":{"belief":"beliefs"},"knows":{"case":"knowledge"},"teAnswer":{"experiment":"experiments"},"teCount":{"experiment":"experiments"},"influence":{"a":"thinker","b":"thinker"},"overlap":{"a":"thinker","b":"thinker"},"valid":{"argument":"arguments"},"counter":{"argument":"arguments"},"form":{"argument":"arguments"},"hetu":{"inference":"inferences"},"bargain":{"bargain":"bargains"},"scores":{"election":"elections"},"sorted":{"population":"populations"},"majority":{"election":"elections"},"parfit":{"populations":"populations"},"virtues":{"profile":"profiles"},"map":{"hi":"thinker"},"payoffs":{"game":"games"},"codeValue":{"code":"ruleCodes"},"ruleValue":{"code":"ruleCodes"},"bestRate":{"code":"ruleCodes"},"codeCurve":{"code":"ruleCodes"},"voteNash":{"election":"elections"},"voteNashUndominated":{"election":"elections"},"voteNashWinners":{"election":"elections"},"sincereNash":{"election":"elections"},"gsManipulable":{"election":"elections"},"manipulators":{"election":"elections"},"overtaking":{"a":"streams","b":"streams"},"catchingUp":{"a":"streams","b":"streams"},"paretoDominates":{"a":"streams","b":"streams"},"finiteAnonymous":{"a":"streams","b":"streams"},"infiniteAnonymous":{"a":"streams","b":"streams"},"infiniteConflict":{"a":"streams","b":"streams"},"truncCompare":{"a":"streams","b":"streams"},"partialSums":{"a":"streams","b":"streams"},"discounted":{"stream":"streams"},"limitAverage":{"stream":"streams"},"ubuntuScore":{"case":"ubuntu"},"ubuntuPermissible":{"case":"ubuntu"},"ubuntuBest":{"case":"ubuntu"},"equilibria":{"game":"games"},"eqProb":{"game":"games"},"eqPayoff":{"game":"games"},"mixedVoteCount":{"election":"elections"},"mixedVoteProb":{"election":"elections","candidate":"cand"},"mixedWinProb":{"election":"elections","candidate":"cand"},"expectedVotes":{"poisson":"poisson","candidate":"pcand"},"poissonWinProb":{"poisson":"poisson","candidate":"pcand"},"voteGain":{"poisson":"poisson","candidate":"pcand"},"pivotProb":{"poisson":"poisson","a":"pcand","b":"pcand"},"pivotMagnitude":{"poisson":"poisson","a":"pcand","b":"pcand"},"bestVote":{"poisson":"poisson"},"poissonEquilibrium":{"poisson":"poisson"}},"PRINCIPLES":["util","dde","means","doingAllowing","redirect","personalForce","threshold","contract","taurek"],"STRATS":["allc","alld","tft","tf2t","grim","pavlov","random","gtft","alt","joss","stft"],"TRADS":["greek","indian","buddhist","jain","chinese","islamic","jewish","latin","modern","analytic","continental","african"],"CASES":{"switch":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":false,"redirect":true,"personal":false,"consent":false,"driver":false},"driver":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":false,"redirect":true,"personal":false,"consent":false,"driver":true},"footbridge":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":true,"redirect":false,"personal":true,"consent":false,"driver":false},"loop":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":true,"redirect":true,"personal":false,"consent":false,"driver":false},"trapdoor":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":true,"redirect":false,"personal":false,"consent":false,"driver":false},"transplant":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":true,"redirect":false,"personal":true,"consent":false,"driver":false},"lazySusan":{"kAct":1,"sAct":1,"kNot":5,"sNot":1,"means":false,"redirect":true,"personal":false,"consent":false,"driver":false},"transmitter":{"kAct":1000000,"sAct":0.0001,"kNot":1,"sNot":0.2,"means":false,"redirect":false,"personal":false,"consent":false,"driver":false}},"MAXIMS":{"suicide":{"conception":false,"practical":false,"natural":true,"will":false},"falsePromise":{"conception":true,"practical":true,"natural":false,"will":false},"talents":{"conception":false,"practical":false,"natural":false,"will":true},"beneficence":{"conception":false,"practical":false,"natural":false,"will":true},"tennis":{"conception":false,"practical":true,"natural":false,"will":false},"toys":{"conception":true,"practical":true,"natural":false,"will":false},"deposit":{"conception":true,"practical":true,"natural":false,"will":false}},"VIRT":{"aristotle":["courage","temperance","liberality","magnificence","magnanimity","ambition","patience","truthfulness","wit","friendliness","modesty","indignation"],"confucian":["ren","yi","li","zhi","xin"],"paramita":["dana","sila","ksanti","virya","dhyana","prajna"]},"KF":["believed","truth","justified","falseLemma","defeater","causal","reliable","sensitive","safe","apt"],"KCASES":{"coins":{"believed":true,"truth":true,"justified":true,"falseLemma":true,"defeater":true,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"ford":{"believed":true,"truth":true,"justified":true,"falseLemma":true,"defeater":true,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"barns":{"believed":true,"truth":true,"justified":true,"falseLemma":false,"defeater":true,"causal":true,"reliable":false,"sensitive":false,"safe":false,"apt":true,"intuition":false},"clock":{"believed":true,"truth":true,"justified":true,"falseLemma":true,"defeater":true,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"sheep":{"believed":true,"truth":true,"justified":true,"falseLemma":true,"defeater":true,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"mirage":{"believed":true,"truth":true,"justified":true,"falseLemma":true,"defeater":true,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"smoke":{"believed":true,"truth":true,"justified":true,"falseLemma":true,"defeater":true,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"truetemp":{"believed":true,"truth":true,"justified":false,"falseLemma":false,"defeater":false,"causal":true,"reliable":true,"sensitive":true,"safe":true,"apt":true,"intuition":false},"lottery":{"believed":true,"truth":true,"justified":true,"falseLemma":false,"defeater":false,"causal":false,"reliable":true,"sensitive":false,"safe":false,"apt":false,"intuition":false},"ordinary":{"believed":true,"truth":true,"justified":true,"falseLemma":false,"defeater":false,"causal":true,"reliable":true,"sensitive":true,"safe":true,"apt":true,"intuition":true}},"TE":{"chineseRoom":{"o":["yes","no","ifEmbodied"],"p":{"searle":"no","systemsReply":"yes","robotReply":"ifEmbodied","functionalism":"yes","biologicalNaturalism":"no"}},"mary":{"o":["newFact","newAbility","newAcquaintance","oldFactNewMode","nothing"],"p":{"jackson1982":"newFact","abilityHypothesis":"newAbility","acquaintance":"newAcquaintance","phenomenalConcepts":"oldFactNewMode","dennett":"nothing","jackson2003":"oldFactNewMode"}},"zombie":{"o":["possible","conceivableNotPossible","notConceivable"],"p":{"chalmers":"possible","typeB":"conceivableNotPossible","typeA":"notConceivable"}},"brainVat":{"o":["no","yes","ordinaryOnly","contextDependent"],"p":{"skeptic":"no","putnam":"yes","moore":"yes","nozick":"ordinaryOnly","dretske":"ordinaryOnly","contextualism":"contextDependent"}},"teleporter":{"o":["survive","die","doesNotMatter"],"p":{"psychological":"survive","animalism":"die","bodily":"die","parfit":"doesNotMatter","buddhistReductionism":"doesNotMatter"}},"ship":{"o":["repaired","reassembled","both","neither"],"p":{"continuity":"repaired","mereologicalEssentialism":"reassembled","fourDimensionalism":"both","nihilism":"neither"}},"twinEarth":{"o":["same","different","narrowSameWideDifferent"],"p":{"externalism":"different","internalism":"same","twoDimensionalism":"narrowSameWideDifferent"}},"experienceMachine":{"o":["plugIn","refuse"],"p":{"hedonism":"plugIn","nozick":"refuse","objectiveList":"refuse"}},"violinist":{"o":["mustStay","mayUnplug"],"p":{"thomson":"mayUnplug","sanctityOfLife":"mustStay"}},"veil":{"o":["maximin","averageUtility"],"p":{"rawls":"maximin","harsanyi":"averageUtility"}},"gyges":{"o":["staysJust","becomesUnjust"],"p":{"glaucon":"becomesUnjust","thrasymachus":"becomesUnjust","socrates":"staysJust"}},"floatingMan":{"o":["awareOfSelf","notAware"],"p":{"avicenna":"awareOfSelf","descartes":"awareOfSelf","physicalism":"notAware"}},"butterfly":{"o":["zhou","butterfly","transformation","undecidable"],"p":{"guoXiang":"transformation","sceptical":"undecidable","commonSense":"zhou"}},"chariot":{"o":["realSelf","conventionalOnly","inexpressible","none"],"p":{"nagasena":"conventionalOnly","pudgalavada":"inexpressible","nyaya":"realSelf","eliminativism":"none"}},"childWell":{"o":["innateGood","learned","selfInterest"],"p":{"mencius":"innateGood","xunzi":"learned","egoism":"selfInterest"}},"swampman":{"o":["hasThoughts","noThoughts"],"p":{"davidson":"noThoughts","teleosemantics":"noThoughts","functionalism":"hasThoughts","internalism":"hasThoughts"}},"invertedSpectrum":{"o":["possible","impossible"],"p":{"qualiaRealism":"possible","shoemaker":"possible","behaviourism":"impossible","dennett":"impossible"}},"personhood":{"o":["achieved","innate","both"],"p":{"menkiti":"achieved","gyekye":"both","liberalIndividualism":"innate"}},"cottonFire":{"o":["necessary","habit"],"p":{"ghazali":"habit","averroes":"necessary","hume":"habit","malebranche":"habit","aristotelian":"necessary"}}},"THINKERS":{"thales":{"b":-624,"d":-546,"tr":"greek","in":[]},"heraclitus":{"b":-535,"d":-475,"tr":"greek","in":[]},"parmenides":{"b":-515,"d":-450,"tr":"greek","in":[]},"zeno":{"b":-490,"d":-430,"tr":"greek","in":["parmenides"]},"democritus":{"b":-460,"d":-370,"tr":"greek","in":[]},"socrates":{"b":-470,"d":-399,"tr":"greek","in":[]},"plato":{"b":-428,"d":-348,"tr":"greek","in":["socrates","parmenides","heraclitus"]},"aristotle":{"b":-384,"d":-322,"tr":"greek","in":["plato"]},"pyrrho":{"b":-360,"d":-270,"tr":"greek","in":["democritus"]},"epicurus":{"b":-341,"d":-270,"tr":"greek","in":["democritus"]},"zenoCitium":{"b":-334,"d":-262,"tr":"greek","in":["socrates"]},"sextus":{"b":160,"d":210,"tr":"greek","in":["pyrrho"]},"plotinus":{"b":204,"d":270,"tr":"greek","in":["plato","aristotle"]},"mahavira":{"b":-599,"d":-527,"tr":"jain","in":[]},"umasvati":{"b":150,"d":250,"tr":"jain","in":["mahavira"]},"samantabhadra":{"b":450,"d":520,"tr":"jain","in":["umasvati"]},"gautama":{"b":150,"d":250,"tr":"indian","in":[]},"udayana":{"b":975,"d":1050,"tr":"indian","in":["gautama"]},"gangesa":{"b":1300,"d":1360,"tr":"indian","in":["udayana","gautama"]},"shankara":{"b":788,"d":820,"tr":"indian","in":["nagarjuna"]},"ramanuja":{"b":1017,"d":1137,"tr":"indian","in":["shankara"]},"buddha":{"b":-563,"d":-483,"tr":"buddhist","in":[]},"nagarjuna":{"b":150,"d":250,"tr":"buddhist","in":["buddha"]},"vasubandhu":{"b":316,"d":396,"tr":"buddhist","in":["nagarjuna"]},"dignaga":{"b":480,"d":540,"tr":"buddhist","in":["vasubandhu"]},"dharmakirti":{"b":600,"d":660,"tr":"buddhist","in":["dignaga"]},"santideva":{"b":685,"d":763,"tr":"buddhist","in":["nagarjuna"]},"dharmottara":{"b":740,"d":800,"tr":"buddhist","in":["dharmakirti"]},"laozi":{"b":-571,"d":-471,"tr":"chinese","in":[]},"confucius":{"b":-551,"d":-479,"tr":"chinese","in":[]},"mozi":{"b":-470,"d":-391,"tr":"chinese","in":["confucius"]},"mencius":{"b":-372,"d":-289,"tr":"chinese","in":["confucius"]},"zhuangzi":{"b":-369,"d":-286,"tr":"chinese","in":["laozi"]},"gongsunlong":{"b":-325,"d":-250,"tr":"chinese","in":[]},"xunzi":{"b":-310,"d":-235,"tr":"chinese","in":["confucius"]},"hanfei":{"b":-280,"d":-233,"tr":"chinese","in":["xunzi","laozi"]},"zhuxi":{"b":1130,"d":1200,"tr":"chinese","in":["mencius","confucius"]},"wangyangming":{"b":1472,"d":1529,"tr":"chinese","in":["mencius","zhuxi"]},"alkindi":{"b":801,"d":873,"tr":"islamic","in":["aristotle"]},"alfarabi":{"b":872,"d":950,"tr":"islamic","in":["aristotle","plato"]},"avicenna":{"b":980,"d":1037,"tr":"islamic","in":["alfarabi","aristotle"]},"ghazali":{"b":1058,"d":1111,"tr":"islamic","in":["avicenna"]},"averroes":{"b":1126,"d":1198,"tr":"islamic","in":["aristotle","ghazali"]},"suhrawardi":{"b":1154,"d":1191,"tr":"islamic","in":["avicenna","plato"]},"shatibi":{"b":1320,"d":1388,"tr":"islamic","in":["ghazali"]},"ibnKhaldun":{"b":1332,"d":1406,"tr":"islamic","in":["averroes"]},"mullaSadra":{"b":1572,"d":1640,"tr":"islamic","in":["avicenna","suhrawardi"]},"maimonides":{"b":1138,"d":1204,"tr":"jewish","in":["aristotle","alfarabi"]},"augustine":{"b":354,"d":430,"tr":"latin","in":["plotinus","plato"]},"boethius":{"b":477,"d":524,"tr":"latin","in":["aristotle","plato"]},"anselm":{"b":1033,"d":1109,"tr":"latin","in":["augustine"]},"aquinas":{"b":1225,"d":1274,"tr":"latin","in":["aristotle","augustine","avicenna","averroes","maimonides"]},"llull":{"b":1232,"d":1316,"tr":"latin","in":[]},"ockham":{"b":1287,"d":1347,"tr":"latin","in":["aristotle","aquinas"]},"cusanus":{"b":1401,"d":1464,"tr":"latin","in":["llull"]},"hobbes":{"b":1588,"d":1679,"tr":"modern","in":[]},"descartes":{"b":1596,"d":1650,"tr":"modern","in":["augustine"]},"spinoza":{"b":1632,"d":1677,"tr":"modern","in":["descartes","maimonides"]},"locke":{"b":1632,"d":1704,"tr":"modern","in":["descartes","hobbes"]},"leibniz":{"b":1646,"d":1716,"tr":"modern","in":["descartes","spinoza"]},"hume":{"b":1711,"d":1776,"tr":"modern","in":["locke"]},"rousseau":{"b":1712,"d":1778,"tr":"modern","in":["hobbes","locke"]},"kant":{"b":1724,"d":1804,"tr":"modern","in":["hume","rousseau","leibniz"]},"condorcet":{"b":1743,"d":1794,"tr":"modern","in":["rousseau"]},"bentham":{"b":1748,"d":1832,"tr":"modern","in":["hume"]},"wollstonecraft":{"b":1759,"d":1797,"tr":"modern","in":["rousseau"]},"hegel":{"b":1770,"d":1831,"tr":"modern","in":["kant","spinoza"]},"mill":{"b":1806,"d":1873,"tr":"modern","in":["bentham"]},"marx":{"b":1818,"d":1883,"tr":"modern","in":["hegel"]},"sidgwick":{"b":1838,"d":1900,"tr":"modern","in":["mill","kant"]},"schopenhauer":{"b":1788,"d":1860,"tr":"continental","in":["kant","plato","buddha"]},"kierkegaard":{"b":1813,"d":1855,"tr":"continental","in":["hegel"]},"nietzsche":{"b":1844,"d":1900,"tr":"continental","in":["schopenhauer"]},"husserl":{"b":1859,"d":1938,"tr":"continental","in":["descartes"]},"heidegger":{"b":1889,"d":1976,"tr":"continental","in":["husserl","aristotle","kierkegaard"]},"sartre":{"b":1905,"d":1980,"tr":"continental","in":["heidegger","husserl"]},"levinas":{"b":1906,"d":1995,"tr":"continental","in":["husserl","heidegger"]},"beauvoir":{"b":1908,"d":1986,"tr":"continental","in":["sartre","hegel"]},"fanon":{"b":1925,"d":1961,"tr":"continental","in":["sartre","hegel"]},"foucault":{"b":1926,"d":1984,"tr":"continental","in":["nietzsche","heidegger"]},"frege":{"b":1848,"d":1925,"tr":"analytic","in":["kant","leibniz"]},"russell":{"b":1872,"d":1970,"tr":"analytic","in":["frege"]},"moore":{"b":1873,"d":1958,"tr":"analytic","in":["sidgwick"]},"wittgenstein":{"b":1889,"d":1951,"tr":"analytic","in":["frege","russell","schopenhauer"]},"carnap":{"b":1891,"d":1970,"tr":"analytic","in":["frege","wittgenstein"]},"quine":{"b":1908,"d":2000,"tr":"analytic","in":["carnap","russell"]},"anscombe":{"b":1919,"d":2001,"tr":"analytic","in":["wittgenstein","aristotle","aquinas"]},"foot":{"b":1920,"d":2010,"tr":"analytic","in":["aristotle","anscombe"]},"arrow":{"b":1921,"d":2017,"tr":"analytic","in":["condorcet"]},"rawls":{"b":1921,"d":2002,"tr":"analytic","in":["kant","rousseau","locke","sidgwick"]},"gettier":{"b":1927,"d":2021,"tr":"analytic","in":["russell"]},"thomson":{"b":1929,"d":2020,"tr":"analytic","in":["foot"]},"nozick":{"b":1938,"d":2002,"tr":"analytic","in":["locke","rawls"]},"parfit":{"b":1942,"d":2017,"tr":"analytic","in":["sidgwick","buddha"]},"zeraYacob":{"b":1599,"d":1692,"tr":"african","in":[]},"amo":{"b":1703,"d":1759,"tr":"african","in":["leibniz","descartes"]},"wiredu":{"b":1931,"d":2022,"tr":"african","in":["russell"]},"gyekye":{"b":1939,"d":2019,"tr":"african","in":["wiredu","aristotle"]},"menkiti":{"b":1940,"d":2019,"tr":"african","in":[]},"oruka":{"b":1944,"d":1995,"tr":"african","in":["wiredu"]}}}; /*/T*/
  const isObj = C.isObj, has = C.has, fin = Number.isFinite;
  const arrOf = v => (Array.isArray(v) ? v : []);
  const BUDGET = 200000;   // method evaluations (social choice searches), cost-weighted

  /* ---------- the checker (the same codes, paths and messages as tools/lib_philo.py) ---------- */
  const COLL = ['populations', 'cases', 'maxims', 'profiles', 'elections', 'lotteries', 'problems', 'games', 'beliefs', 'knowledge', 'experiments', 'thinkers', 'arguments', 'inferences', 'bargains',
    'ruleCodes', 'streams', 'ubuntu', 'poisson'];
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    C.walk(m, T.MODEL, 'model', E, W);
    const M = isObj(m) ? m : {}, arr = k => arrOf(M[k]);
    const ids = {};
    for (const k of COLL) {
      ids[k] = [];
      arr(k).forEach((x, i) => {
        if (!isObj(x) || typeof x.id !== 'string' || !C.ID_RE.test(x.id)) return;
        if (ids[k].includes(x.id)) E('duplicate', `model.${k}[${i}].id`, `the id ${x.id} is used twice`); else ids[k].push(x.id);
      });
    }
    arr('cases').forEach((x, i) => { if (isObj(x) && x.preset === undefined && (x.kAct === undefined || x.kNot === undefined)) E('value', `model.cases[${i}]`, 'needs a preset, or kAct and kNot'); });
    arr('profiles').forEach((x, i) => {
      if (!isObj(x) || !isObj(x.traits) || !has(T.VIRT, x.scheme)) return;
      for (const k of Object.keys(x.traits)) if (!T.VIRT[x.scheme].includes(k)) E('value', `model.profiles[${i}].traits.${k}`, `not a trait of ${x.scheme}`);
    });
    const cands = {};
    arr('elections').forEach((x, i) => {
      if (!isObj(x)) return; const p = `model.elections[${i}]`, cs = [];
      arrOf(x.candidates).forEach((c, j) => { if (typeof c !== 'string') return; if (cs.includes(c)) E('duplicate', `${p}.candidates[${j}]`, `the candidate ${c} is listed twice`); else cs.push(c); });
      if (typeof x.id === 'string') cands[x.id] = cs;
      arrOf(x.ballots).forEach((b, j) => {
        if (!isObj(b)) return; const seen = [];
        arrOf(b.rank).forEach((c, k) => {
          if (typeof c !== 'string' || !C.ID_RE.test(c)) return;
          if (!cs.includes(c)) E('ref', `${p}.ballots[${j}].rank[${k}]`, `no candidate ${c}`);
          else if (seen.includes(c)) E('duplicate', `${p}.ballots[${j}].rank[${k}]`, `the candidate ${c} is ranked twice`);
          else seen.push(c);
        });
      });
      if (Array.isArray(x.axis)) { const ax = x.axis; if (ax.length !== cs.length || !cs.every(c => ax.includes(c))) E('value', `${p}.axis`, 'needs every candidate once'); }
    });
    arr('lotteries').forEach((x, i) => {
      if (!isObj(x) || !Array.isArray(x.outcomes)) return; const p = `model.lotteries[${i}]`, os = x.outcomes;
      const ps = os.map(o => (isObj(o) ? o.p : undefined));
      ps.forEach((v, j) => { if (typeof v === 'number' && fin(v) && (v < 0 || v > 1)) E('value', `${p}.outcomes[${j}].p`, 'needs a probability from 0 to 1'); });
      if (ps.length && ps.every(v => typeof v === 'number' && fin(v)) && Math.abs(ps.reduce((a, b) => a + b, 0) - 1) > 1e-9) E('value', `${p}.outcomes`, 'the probabilities must sum to 1');
      arrOf(x.priors).forEach((q, j) => { if (Array.isArray(q) && q.length !== os.length) E('size', `${p}.priors[${j}]`, 'needs one probability per outcome'); });
    });
    const acts = {};
    arr('problems').forEach((x, i) => {
      if (!isObj(x)) return; const p = `model.problems[${i}]`;
      if (x.preset !== undefined) { if (has(T.PROB, x.preset) && typeof x.id === 'string') acts[x.id] = T.PROB[x.preset].acts; return; }
      if (!['acts', 'states', 'u', 'pAct', 'pCause'].every(k => Array.isArray(x[k]))) { E('value', p, 'needs a preset, or acts, states, u, pAct and pCause'); return; }
      if (typeof x.id === 'string') acts[x.id] = x.acts;
      const na = x.acts.length, ns = x.states.length;
      for (const k of ['u', 'pAct']) {
        if (x[k].length !== na) E('size', `${p}.${k}`, 'needs one row per act');
        x[k].forEach((r, j) => { if (Array.isArray(r) && r.length !== ns) E('size', `${p}.${k}[${j}]`, 'needs one value per state'); });
      }
      if (x.pCause.length !== ns) E('size', `${p}.pCause`, 'needs one value per state');
    });
    arr('games').forEach((x, i) => {
      if (!isObj(x) || x.preset !== undefined) return; const p = `model.games[${i}]`;
      if (!['rows', 'cols', 'pay'].every(k => Array.isArray(x[k]))) { E('value', p, 'needs a preset, or rows, cols and pay'); return; }
      if (x.pay.length !== x.rows.length || x.pay.some(r => !Array.isArray(r) || r.length !== x.cols.length)) E('size', `${p}.pay`, 'needs a pair of payoffs for every row and column');
    });
    const tour = isObj(M.tournament) ? M.tournament : null;
    if (tour) {
      if (typeof tour.game === 'string' && C.ID_RE.test(tour.game) && !ids.games.includes(tour.game)) E('ref', 'model.tournament.game', `no game ${tour.game}`);
      const seen = []; arrOf(tour.strategies).forEach((s, j) => { if (typeof s !== 'string') return; if (seen.includes(s)) E('duplicate', `model.tournament.strategies[${j}]`, `the strategy ${s} is listed twice`); else seen.push(s); });
    }
    const expPos = {};
    arr('experiments').forEach((x, i) => {
      if (!isObj(x)) return; const p = `model.experiments[${i}]`;
      const te = has(T.TE, x.te) ? T.TE[x.te] : null;
      if (!te && x.te === undefined && !(Array.isArray(x.options) && isObj(x.positions))) { E('value', p, 'needs te, or options and positions'); return; }
      const opts = Array.isArray(x.options) ? x.options : te ? te.o : [];
      if (isObj(x.positions)) for (const [k, v] of Object.entries(x.positions)) if (typeof v === 'string' && C.ID_RE.test(v) && !opts.includes(v)) E('ref', `${p}.positions.${k}`, `no option ${v}`);
      if (typeof x.id === 'string') expPos[x.id] = [...(te ? Object.keys(te.p) : []), ...(isObj(x.positions) ? Object.keys(x.positions) : [])];
    });
    const thinkerIds = [...Object.keys(T.THINKERS), ...ids.thinkers];
    arr('thinkers').forEach((x, i) => {
      if (!isObj(x)) return; const p = `model.thinkers[${i}]`;
      if (!has(T.THINKERS, x.id) && (x.born === undefined || x.died === undefined || x.trad === undefined)) E('value', p, 'needs born, died and trad (not a built-in thinker)');
      arrOf(x.infl).forEach((r, j) => { if (typeof r === 'string' && C.ID_RE.test(r) && !thinkerIds.includes(r)) E('ref', `${p}.infl[${j}]`, `no thinker ${r}`); });
    });
    arr('ruleCodes').forEach((x, i) => { if (!isObj(x)) return; const seen = []; arrOf(x.rules).forEach((r, j) => { if (!isObj(r) || typeof r.id !== 'string') return; if (seen.includes(r.id)) E('duplicate', `model.ruleCodes[${i}].rules[${j}].id`, `the rule ${r.id} is listed twice`); else seen.push(r.id); }); });
    arr('ubuntu').forEach((x, i) => { if (!isObj(x)) return; const seen = []; arrOf(x.options).forEach((r, j) => { if (!isObj(r) || typeof r.id !== 'string') return; if (seen.includes(r.id)) E('duplicate', `model.ubuntu[${i}].options[${j}].id`, `the option ${r.id} is listed twice`); else seen.push(r.id); }); });
    const pc = {};
    arr('poisson').forEach((x, i) => {
      if (!isObj(x)) return; const p = `model.poisson[${i}]`, cs = [], seen = [];
      arrOf(x.candidates).forEach((c, j) => { if (typeof c !== 'string') return; if (cs.includes(c)) E('duplicate', `${p}.candidates[${j}]`, `the candidate ${c} is listed twice`); else cs.push(c); });
      if (typeof x.id === 'string') pc[x.id] = cs;
      arrOf(x.types).forEach((t, j) => {
        if (!isObj(t)) return;
        if (typeof t.id === 'string') { if (seen.includes(t.id)) E('duplicate', `${p}.types[${j}].id`, `the type ${t.id} is listed twice`); else seen.push(t.id); }
        if (typeof t.vote === 'string' && C.ID_RE.test(t.vote) && !cs.includes(t.vote)) E('ref', `${p}.types[${j}].vote`, `no candidate ${t.vote}`);
        if (Array.isArray(t.u) && t.u.length !== cs.length) E('value', `${p}.types[${j}].u`, 'needs one utility per candidate');
      });
    });
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at) => {
      const tb = has(T.OUT, o.kind) && has(T.OUT[o.kind], o.of) ? T.OUT[o.kind][o.of] : null;
      if (!tb) { E('output', at + '.of', `${o.of} is not a ${o.kind} output of ${ID}`); return; }
      C.walk(o, tb, at, E, W);
      const refs = T.REFS[o.of] || {};
      const okId = v => typeof v === 'string' && C.ID_RE.test(v);
      for (const [f, coll] of Object.entries(refs)) {
        const vs = Array.isArray(o[f]) ? o[f].map((v, j) => [v, `${at}.${f}[${j}]`]) : [[o[f], `${at}.${f}`]];
        for (const [v, pth] of vs) {
          if (!okId(v)) continue;
          if (coll === 'cand') { const cs = cands[o.election]; if (cs && !cs.includes(v)) E('ref', pth, `no candidate ${v}`); }
          else if (coll === 'pcand') { const cs = typeof o.poisson === 'string' && has(pc, o.poisson) ? pc[o.poisson] : null; if (cs && !cs.includes(v)) E('ref', pth, `no candidate ${v}`); }
          else if (coll === 'thinker') { if (!thinkerIds.includes(v)) E('ref', pth, `no thinker ${v}`); }
          else if (coll === 'act') { const as = acts[o.problem]; if (as && !as.includes(v)) E('ref', pth, `no act ${v}`); }
          else if (!ids[coll].includes(v)) E('ref', pth, `no ${f} ${v}`);
        }
      }
      if (o.of === 'criterion' && o.criterion === 'iia' && o.other === undefined) E('value', at, 'iia needs other');
      if (o.of === 'teAnswer' && typeof o.position === 'string' && expPos[o.experiment] && !expPos[o.experiment].includes(o.position)) E('ref', at + '.position', `no position ${o.position}`);
      if (['ipd', 'match', 'shares'].includes(o.of) && !tour) E('value', at, 'needs model.tournament');
      if (o.of === 'ipd' && tour && typeof o.strategy === 'string' && !arrOf(tour.strategies).includes(o.strategy)) E('ref', at + '.strategy', `${o.strategy} is not in model.tournament.strategies`);
      if (['sorites', 'degree', 'bound'].includes(o.of) && !isObj(M.sorites)) E('value', at, 'needs model.sorites');
      if (o.of === 'map' && !arr('thinkers').length) E('value', at, 'needs model.thinkers');
      if (o.of === 'trait' && typeof o.trait === 'string') {
        const pr = arr('profiles').find(x => isObj(x) && x.id === o.profile);
        if (pr && has(T.VIRT, pr.scheme) && !T.VIRT[pr.scheme].includes(o.trait)) E('value', at + '.trait', `not a trait of ${pr.scheme}`);
      }
    }, E, W);
    return P;
  }
  function collect(v, kd, p, out) {
    if (typeof kd === 'string') { if (kd.replace(/!$/, '') === 'numx' && typeof v === 'string' && v.trim() !== '') out.push([v, p, []]); return; }
    if (kd.$obj) { if (!isObj(v)) return; for (const k of Object.keys(kd.$obj)) if (v[k] !== undefined) collect(v[k], kd.$obj[k], p + '.' + k, out); return; }
    if (kd.$map) { if (!isObj(v)) return; for (const k of Object.keys(v)) collect(v[k], kd.$map, p + '.' + k, out); return; }
    if (kd.$list && Array.isArray(v)) v.forEach((x, i) => collect(x, kd.$list, `${p}[${i}]`, out));
  }
  /** every expression of the model and the outputs: [source, path, []] (no local names: philo@1 binds none) */
  function exprs(spec) {
    const out = []; if (!isObj(spec)) return out;
    collect(spec.model, { $obj: T.MODEL }, 'model', out);
    arrOf(spec.outputs).forEach((o, i) => { if (isObj(o) && has(T.OUT, o.kind) && has(T.OUT[o.kind], o.of)) collect(o, { $obj: T.OUT[o.kind][o.of] }, `outputs[${i}]`, out); });
    return out;
  }
  /** the string keys the model names: the labels of its thinkers (the map's names) */
  function keys(spec) {
    const out = []; if (!isObj(spec) || !isObj(spec.model)) return out;
    arrOf(spec.model.thinkers).forEach((x, i) => { if (isObj(x) && typeof x.label === 'string' && x.label.trim() !== '') out.push([x.label, `model.thinkers[${i}].label`]); });
    return out;
  }

  /* =====================================================================================================================
     1. Population axiology and distributive ethics (research §1.1). A population is a list of groups {n people at welfare w}. */
  const sum = a => a.reduce((s, v) => s + v, 0);
  /** Gini coefficient over persons (Gini 1912; Sen 1973 On Economic Inequality): Σᵢ Σⱼ nᵢnⱼ|wᵢ − wⱼ| / (2N²μ) */
  function gini(g) {
    const N = sum(g.map(x => x.n)), mu = sum(g.map(x => x.n * x.w)) / N;
    if (!(N > 0) || !(mu > 0)) return NaN;
    let s = 0; for (const a of g) for (const b of g) s += a.n * b.n * Math.abs(a.w - b.w);
    return s / (2 * N * N * mu);
  }
  const RDEF = { gamma: 0.5, c: 0, tau: 1, delta: 0.5, k: 100 };
  /** value(groups, rule, P, flag) → the value of a population under a rule; P = {gamma, c, tau, delta, k} */
  function value(g, rule, P, flag) {
    const p = { ...RDEF, ...P }, f = flag || (() => {});
    if (g.some(x => !fin(x.n) || x.n < 0 || !fin(x.w))) { f('value'); return NaN; }
    const live = g.filter(x => x.n > 0), N = sum(live.map(x => x.n)), tot = sum(live.map(x => x.n * x.w));
    const needN = () => { if (!(N > 0)) { f('empty'); return false; } return true; };
    switch (rule) {
      case 'total': return tot;                                          // Sidgwick 1874 IV.1
      case 'average': return needN() ? tot / N : NaN;                    // Mill 1861; Harsanyi 1955
      case 'critical': return tot - p.c * N;                             // Blackorby, Bossert & Donaldson 2005
      case 'variable': return needN() ? (tot / N) * p.k * (1 - Math.exp(-N / p.k)) : NaN;   // Hurka 1983; Ng 1989
      case 'prior': {                                                    // Atkinson 1970 form of prioritarianism (Parfit 1991)
        if (live.some(x => x.w <= 0)) { f('nonpositive'); return NaN; }
        const u = p.gamma === 1 ? w => Math.log(w) : w => Math.pow(w, 1 - p.gamma) / (1 - p.gamma);
        return sum(live.map(x => x.n * u(x.w)));
      }
      case 'kolm': return p.gamma === 0 ? tot : sum(live.map(x => x.n * (1 - Math.exp(-p.gamma * x.w)) / p.gamma));   // Kolm 1976
      case 'maximin': case 'leximin': return needN() ? Math.min(...live.map(x => x.w)) : NaN;   // Rawls 1971 §13; Sen 1970
      case 'suff': return sum(live.map(x => x.n * Math.min(x.w, p.tau)));   // Frankfurt 1987; Crisp 2003 (capped)
      case 'egal': { if (!needN()) return NaN; const G = gini(live); if (!fin(G)) { f('nonpositive'); return NaN; } return (tot / N) * (1 - G); }   // Sen 1973
      case 'equality': { if (!needN()) return NaN; const G = gini(live); if (!fin(G)) { f('nonpositive'); return NaN; } return -G; }   // telic egalitarianism (Parfit 1997)
      case 'graded': return sum(live.map(x => x.n * x.w * Math.pow(p.delta, fin(x.rel) ? x.rel : 0)));   // Mengzi 3A5 愛有差等 vs Mozi 兼愛 (δ = 1)
      case 'lexical': return sum(live.map(x => x.n * (x.levels && x.levels.length ? x.levels[0] : x.w)));   // Rawls 1971 §8; al-Shāṭibī's ranked maqāṣid
      default: return NaN;
    }
  }
  const sgn = (a, b) => { const d = a - b, s = Math.max(Math.abs(a), Math.abs(b), 1e-300); return Math.abs(d) <= 1e-12 * s ? 0 : d > 0 ? 1 : -1; };
  /** compare(a, b, rule, P) → 1 a better, −1 b better, 0 equally good, NaN undefined */
  function compare(a, b, rule, P, flag) {
    const f = flag || (() => {});
    if (rule === 'leximin') {     // the k-th worst-off person, k = 1, 2, … (on groups: merged by counts)
      const sa = a.filter(x => x.n > 0).sort((x, y) => x.w - y.w), sb = b.filter(x => x.n > 0).sort((x, y) => x.w - y.w);
      if (!sa.length || !sb.length) { f('empty'); return NaN; }
      let i = 0, j = 0, ra = sa[0].n, rb = sb[0].n;
      for (let it = 0; it < 256 && i < sa.length && j < sb.length; it++) {
        const s = sgn(sa[i].w, sb[j].w); if (s) return s;
        const step = Math.min(ra, rb); ra -= step; rb -= step;
        if (ra <= 0) { i++; if (i < sa.length) ra = sa[i].n; }
        if (rb <= 0) { j++; if (j < sb.length) rb = sb[j].n; }
      }
      if (i < sa.length || j < sb.length) f('different-size');
      return 0;
    }
    if (rule === 'lexical') {     // the totals of each level, compared in order of priority
      const L = Math.max(...a.concat(b).map(x => (x.levels && x.levels.length) || 1));
      for (let l = 0; l < L; l++) {
        const t = g => sum(g.map(x => x.n * (x.levels && x.levels.length ? (fin(x.levels[l]) ? x.levels[l] : 0) : (l === 0 ? x.w : 0))));
        const s = sgn(t(a), t(b)); if (s) return s;
      }
      return 0;
    }
    const va = value(a, rule, P, f), vb = value(b, rule, P, f);
    return fin(va) && fin(vb) ? sgn(va, vb) : NaN;
  }
  /* the paradoxes as fixed constructions (Parfit 1984 Part IV; Arrhenius 2000; Parfit 1997) — 1: the rule yields the conclusion */
  const PARADOX = {
    repugnant: [[{ n: 1e3, w: 100 }], [{ n: 1e7, w: 0.1 }], s => s < 0],                                   // Z ≻ A
    mereAddition: [[{ n: 1000, w: 100 }], [{ n: 1000, w: 100 }, { n: 1000, w: 50 }], s => s > 0],          // A ≻ A+
    sadistic: [[{ n: 1000, w: 50 }, { n: 10, w: -10 }], [{ n: 1000, w: 50 }, { n: 10000, w: 1 }], s => s > 0],   // negative lives ≻ many good lives
    levellingDown: [[{ n: 500, w: 100 }, { n: 500, w: 50 }], [{ n: 1000, w: 50 }], s => s < 0],              // levelled ≻ unequal
  };
  function paradox(kind, rule, P, flag) { const [a, b, yes] = PARADOX[kind]; const s = compare(a, b, rule, P, flag); return fin(s) ? +yes(s) : NaN; }

  /* =====================================================================================================================
     2. Trolley-family cases (research §1.2). Verdicts: 2 must act · 1 may act · 0 must not act. */
  function verdict(cs, principle, Tth) {
    const A = cs.kAct * cs.sAct, N = cs.kNot * cs.sNot;
    if (!fin(A) || !fin(N) || A < 0 || N < 0) return NaN;
    if (A === 0 && N > 0) return 2;          // an easy rescue: every principle requires it
    if (A === 0 && N === 0) return 1;
    if (N === 0) return 0;                   // harm for nothing
    const better = A < N ? 2 : A > N ? 0 : 1, may = A < N ? 1 : 0;
    const used = cs.means && !cs.consent;
    switch (principle) {
      case 'util': return better;                                      // Bentham 1789; Sidgwick 1874 (and the Mohist weighing 權)
      case 'dde': return cs.means ? 0 : may;                           // Aquinas ST II-II q64 a7; Mangan 1949; Foot 1967
      case 'means': return used ? 0 : 1;                               // Kant G 4:429 (consent removes "merely")
      case 'doingAllowing': return cs.driver ? better : cs.consent ? may : 0;   // Foot 1967; Quinn 1989 (negative > positive duties)
      case 'redirect': return cs.redirect || cs.driver ? may : 0;   // Thomson 1985 (deflecting an existing threat; the loop too)
      case 'personalForce': return cs.means && cs.personal ? 0 : may;  // Greene et al. 2009 (judgements, descriptive)
      case 'threshold': {                                              // Moore 1997 threshold deontology
        const constrained = used || (!cs.redirect && !cs.driver);
        if (!constrained) return better;
        const T = fin(Tth) ? Tth : 10;
        return N / A >= T ? 2 : 0;
      }
      case 'contract': {                                               // Scanlon 1998 ch. 5: no aggregation; numbers break ties
        const s = sgn(cs.sNot, cs.sAct);
        if (s > 0) return 2; if (s < 0) return 0;
        return cs.kNot > cs.kAct ? 2 : cs.kNot < cs.kAct ? 0 : 1;
      }
      case 'taurek': { const s = sgn(cs.sNot, cs.sAct); return s > 0 ? 2 : s < 0 ? 0 : 1; }   // Taurek 1977: numbers do not count
      default: return NaN;
    }
  }
  /* Kant's FUL (G 4:421–424; Korsgaard 1985): 0 a contradiction in conception, 1 in the will, 2 passes */
  function ful(mx, reading) {
    const r = reading || 'practical';
    const conc = mx.conception || (r === 'practical' && mx.practical) || (r === 'teleological' && mx.natural);
    return conc ? 0 : mx.will ? 1 : 2;
  }

  /* =====================================================================================================================
     3. Social choice (research §2). An election: m candidates, ballots {n, rank: [indices], approve}. Unranked candidates share
        the bottom of a ballot. Methods return {w: winner index or −1, rank: social rank per candidate (0 best, ties equal), s?: scores}. */
  function pairwise(E) {
    const m = E.m, P = Array.from({ length: m }, () => new Array(m).fill(0));
    for (const b of E.ballots) {
      const pos = new Array(m).fill(Infinity); b.rank.forEach((c, i) => { pos[c] = i; });
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (pos[i] < pos[j]) P[i][j] += b.n;
    }
    return P;
  }
  const condWinner = (P, m) => { for (let c = 0; c < m; c++) { let ok = true; for (let x = 0; x < m; x++) if (x !== c && !(P[c][x] > P[x][c])) { ok = false; break; } if (ok) return c; } return -1; };
  const condLoser = (P, m) => { for (let c = 0; c < m; c++) { let ok = true; for (let x = 0; x < m; x++) if (x !== c && !(P[c][x] < P[x][c])) { ok = false; break; } if (ok) return c; } return -1; };
  /** ranks from scores (higher better) and the unique top (−1 when tied) */
  function byScore(s) {
    const rank = s.map(v => s.filter(u => u > v + 1e-12).length);
    const top = s.map((v, i) => i).filter(i => rank[i] === 0);
    return { w: top.length === 1 ? top[0] : -1, rank, s };
  }
  /** first preferences among the alive candidates (exhausted ballots skipped) */
  function firsts(E, alive) { const f = new Array(E.m).fill(0); for (const b of E.ballots) { const c = b.rank.find(x => alive[x]); if (c !== undefined) f[c] += b.n; } return f; }
  function bordaScores(E, alive) {
    const s = new Array(E.m).fill(0), na = alive.filter(Boolean).length;
    for (const b of E.ballots) { let i = 0; for (const c of b.rank) if (alive[c]) { s[c] += b.n * (na - 1 - i); i++; } }
    return s;
  }
  /** elimination methods: drop(E, alive, flag) → the indices to eliminate this round, or {win} */
  function eliminate(E, flag, step) {
    const alive = new Array(E.m).fill(true), out = [];
    for (let round = 0; round < E.m; round++) {
      const left = alive.map((a, i) => (a ? i : -1)).filter(i => i >= 0);
      if (left.length === 1) break;
      const r = step(alive, left);
      if (r.win !== undefined) { out.push(...left.filter(i => i !== r.win)); alive.fill(false); alive[r.win] = true; break; }
      if (r.drop.length === left.length) { flag('tie'); return { w: -1, rank: alive.map(a => (a ? 0 : 1)) }; }
      for (const i of r.drop) { alive[i] = false; out.push(i); }
    }
    const winners = alive.map((a, i) => (a ? i : -1)).filter(i => i >= 0);
    const rank = new Array(E.m).fill(0); out.forEach((c, k) => { rank[c] = E.m - k; });
    if (winners.length !== 1) { flag('tie'); return { w: -1, rank }; }
    rank[winners[0]] = 0; return { w: winners[0], rank };
  }
  const lowest = (vals, left, flag) => { const mn = Math.min(...left.map(i => vals[i])), ties = left.filter(i => vals[i] === mn); if (ties.length > 1) flag('tie-break'); return ties[ties.length - 1]; };
  function method(E, name, flag, cost) {
    const m = E.m, all = new Array(m).fill(true), N = sum(E.ballots.map(b => b.n));
    cost.n += name === 'kemeny' ? fact(m) : 1;
    const P = () => E.P || (E.P = pairwise(E));
    switch (name) {
      case 'plurality': return byScore(firsts(E, all));
      case 'antiplurality': {           // a point to every candidate not in the bottom tier of a ballot
        const s = new Array(m).fill(0);
        for (const b of E.ballots) { const bottom = b.rank.length >= m - 1 ? (b.rank.length === m ? [b.rank[m - 1]] : all.map((_, i) => i).filter(i => !b.rank.includes(i))) : all.map((_, i) => i).filter(i => !b.rank.includes(i)); for (let i = 0; i < m; i++) if (!bottom.includes(i)) s[i] += b.n; }
        return byScore(s);
      }
      case 'borda': return byScore(bordaScores(E, all));          // Borda 1781 (Cusanus 1433): m − 1 − position; unranked 0
      case 'approval': { const s = new Array(m).fill(0); for (const b of E.ballots) b.rank.slice(0, Math.max(0, Math.floor(fin(b.approve) ? b.approve : 1))).forEach(c => { s[c] += b.n; }); return byScore(s); }   // Brams & Fishburn 1978
      case 'bucklin': {
        let s = new Array(m).fill(0);
        for (let r = 1; r <= m; r++) { s = new Array(m).fill(0); for (const b of E.ballots) b.rank.slice(0, r).forEach(c => { s[c] += b.n; }); if (Math.max(...s) > N / 2) break; }
        return byScore(s);
      }
      case 'copeland': { const p = P(); return byScore(all.map((_, a) => sum(all.map((__, b) => (a === b ? 0 : p[a][b] > p[b][a] ? 1 : p[a][b] === p[b][a] ? 0.5 : 0))))); }   // Copeland 1951; Llull 1299
      case 'minimax': { const p = P(); return byScore(all.map((_, a) => -Math.max(...all.map((__, b) => (a === b ? -Infinity : p[b][a] - p[a][b]))))); }   // Simpson 1969; Kramer 1977 (margins)
      case 'condorcet': { const p = P(), cw = condWinner(p, m), r = method(E, 'copeland', flag, cost); return { w: cw, rank: r.rank }; }
      case 'black': { const p = P(), cw = condWinner(p, m); if (cw >= 0) { const r = method(E, 'copeland', flag, cost); return { w: cw, rank: r.rank }; } return method(E, 'borda', flag, cost); }   // Black 1958
      case 'runoff': {
        const f = firsts(E, all), order = all.map((_, i) => i).sort((a, b) => f[b] - f[a] || a - b);
        const rank = new Array(m).fill(0); order.forEach((c, k) => { rank[c] = f.filter(v => v > f[c]).length; });
        if (f[order[0]] > N / 2) return { w: order[0], rank };
        if (m > 2 && f[order[1]] === f[order[2]]) flag('tie-break');
        const a = order[0], b = order[1], p = P();
        if (p[a][b] === p[b][a]) { flag('tie'); return { w: -1, rank }; }
        const w = p[a][b] > p[b][a] ? a : b, l = w === a ? b : a; rank[w] = 0; rank[l] = 1; for (const c of order.slice(2)) rank[c] = Math.max(rank[c], 2);
        return { w, rank };
      }
      case 'irv': return eliminate(E, flag, (alive, left) => {     // Ware 1871 / Hare: drop the fewest first preferences
        const f = firsts(E, alive), tot = sum(left.map(i => f[i]));
        for (const i of left) if (f[i] > tot / 2) return { win: i };
        return { drop: [lowest(f, left, flag)] };
      });
      case 'coombs': return eliminate(E, flag, (alive, left) => {  // Coombs 1964: drop the most last places
        const f = firsts(E, alive), tot = sum(left.map(i => f[i]));
        for (const i of left) if (f[i] > tot / 2) return { win: i };
        const last = new Array(m).fill(0);
        for (const b of E.ballots) { const un = left.filter(i => !b.rank.includes(i)); if (un.length) un.forEach(i => { last[i] += b.n / un.length; }); else { const r = b.rank.filter(c => alive[c]); last[r[r.length - 1]] += b.n; } }
        return { drop: [lowest(last.map(v => -v), left, flag)] };
      });
      case 'baldwin': return eliminate(E, flag, (alive, left) => ({ drop: [lowest(bordaScores(E, alive), left, flag)] }));   // Baldwin 1926
      case 'nanson': return eliminate(E, flag, (alive, left) => {  // Nanson 1882: drop every candidate at or below the mean Borda score
        const s = bordaScores(E, alive), mean = sum(left.map(i => s[i])) / left.length;
        return { drop: left.filter(i => s[i] <= mean + 1e-12) };
      });
      case 'schulze': {               // Schulze 2011: the widest beat-paths (winning votes)
        const d = P(), p = d.map((r, i) => r.map((v, j) => (i !== j && v > d[j][i] ? v : 0)));
        for (let k = 0; k < m; k++) for (let i = 0; i < m; i++) if (i !== k) for (let j = 0; j < m; j++) if (j !== i && j !== k) p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
        const rank = all.map((_, i) => all.filter((__, j) => j !== i && p[j][i] > p[i][j]).length);
        const top = rank.map((r, i) => (r === 0 ? i : -1)).filter(i => i >= 0);
        if (top.length !== 1) flag('tie');
        return { w: top.length === 1 ? top[0] : -1, rank };
      }
      case 'rankedPairs': {           // Tideman 1987: lock the largest margins unless they close a cycle
        const p = P(), pairs = [];
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (p[i][j] - p[j][i] > 0) pairs.push([i, j, p[i][j] - p[j][i]]);
        pairs.sort((x, y) => y[2] - x[2] || x[0] - y[0] || x[1] - y[1]);
        for (let k = 1; k < pairs.length; k++) if (pairs[k][2] === pairs[k - 1][2]) { flag('tie-break'); break; }
        const L = Array.from({ length: m }, () => new Array(m).fill(false));
        const reach = (a, b) => { const st = [a], seen = new Array(m).fill(false); while (st.length) { const x = st.pop(); if (x === b) return true; if (seen[x]) continue; seen[x] = true; for (let y = 0; y < m; y++) if (L[x][y]) st.push(y); } return false; };
        for (const [i, j] of pairs) if (!reach(j, i)) L[i][j] = true;
        const rank = all.map((_, i) => all.filter((__, j) => j !== i && reach(j, i)).length);
        const top = rank.map((r, i) => (r === 0 ? i : -1)).filter(i => i >= 0);
        if (top.length !== 1) flag('tie');
        return { w: top.length === 1 ? top[0] : -1, rank };
      }
      case 'kemeny': {                // Kemeny 1959: the orders that agree most with the pairwise majorities (all m! orders)
        const p = P(); let best = -Infinity, bests = [];
        permute(m, perm => { let s = 0; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) s += p[perm[i]][perm[j]]; if (s > best + 1e-12) { best = s; bests = [perm.slice()]; } else if (Math.abs(s - best) <= 1e-12) bests.push(perm.slice()); });
        const tops = [...new Set(bests.map(b => b[0]))], rank = new Array(m).fill(0); bests[0].forEach((c, k) => { rank[c] = k; });
        if (tops.length !== 1) flag('tie');
        return { w: tops.length === 1 ? tops[0] : -1, rank };
      }
      default: return { w: -1, rank: new Array(m).fill(0) };
    }
  }
  function fact(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
  /** every permutation of 0 … n−1 (Heap 1963), at most 8! = 40 320 */
  function permute(n, cb) {
    const a = Array.from({ length: n }, (_, i) => i), c = new Array(n).fill(0); cb(a);
    let i = 0; while (i < n) { if (c[i] < i) { const k = i % 2 ? c[i] : 0; [a[k], a[i]] = [a[i], a[k]]; cb(a); c[i]++; i = 0; } else { c[i] = 0; i++; } }
  }
  const withBallots = (E, ballots) => ({ m: E.m, ids: E.ids, ballots });
  const prefers = (b, x, y) => { const px = b.rank.indexOf(x), py = b.rank.indexOf(y); return (px < 0 ? Infinity : px) < (py < 0 ? Infinity : py); };
  /** the strongly connected components of the strict majority relation (Tarjan 1972) → component id per candidate */
  function scc(P, m) {
    const idx = new Array(m).fill(-1), low = new Array(m).fill(0), on = new Array(m).fill(false), st = [], comp = new Array(m).fill(-1); let k = 0, nc = 0;
    const go = v => { idx[v] = low[v] = k++; st.push(v); on[v] = true;
      for (let w = 0; w < m; w++) if (P[v][w] > P[w][v]) { if (idx[w] < 0) { go(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], idx[w]); }
      if (low[v] === idx[v]) { let w; do { w = st.pop(); on[w] = false; comp[w] = nc; } while (w !== v); nc++; } };
    for (let v = 0; v < m; v++) if (idx[v] < 0) go(v);
    return comp;
  }
  /** the Smith set (Smith 1973; Good 1971): the smallest set beating every candidate outside it */
  function smithSet(P, m) {
    const beatsOrTies = (a, b) => P[a][b] >= P[b][a];
    // a is in the Smith set iff every candidate that a cannot reach through ≥-majority paths cannot reach a either: compute reachability
    const R = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (__, j) => i === j || beatsOrTies(i, j)));
    for (let k = 0; k < m; k++) for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (R[i][k] && R[k][j]) R[i][j] = true;
    return Array.from({ length: m }, (_, i) => i).filter(i => Array.from({ length: m }, (_, j) => j).every(j => R[i][j] || !R[j][i]));
  }
  /** criterion(E, name, crit, flag, cost, E2) → 1 satisfied on this profile, 0 violated, NaN not decidable */
  function criterion(E, name, crit, flag, cost, E2) {
    const P = E.P || (E.P = pairwise(E)), m = E.m, base = method(E, name, () => {}, cost), w = base.w;
    const N = sum(E.ballots.map(b => b.n)), over = () => cost.n > BUDGET;
    switch (crit) {
      case 'condorcet': { const cw = condWinner(P, m); return cw < 0 ? 1 : +(w === cw); }
      case 'condorcetLoser': { const cl = condLoser(P, m); return cl < 0 ? 1 : +(w !== cl); }
      case 'majority': { const f = firsts(E, new Array(m).fill(true)); const maj = f.findIndex(v => v > N / 2); return maj < 0 ? 1 : +(w === maj); }
      case 'pareto': {                 // weak Pareto on the social ranking (Arrow 1951)
        for (let x = 0; x < m; x++) for (let y = 0; y < m; y++) if (x !== y && E.ballots.filter(b => b.n > 0).every(b => prefers(b, x, y)) && base.rank[y] < base.rank[x]) return 0;
        return 1;
      }
      case 'iia': {                    // Arrow's IIA between two profiles of the same candidates (anonymous rules: pairwise counts)
        if (!E2 || E2.m !== m || E2.ids.some((c, i) => c !== E.ids[i])) { flag('iia-candidates'); return NaN; }
        const P2 = E2.P || (E2.P = pairwise(E2)), r2 = method(E2, name, () => {}, cost).rank, N2 = sum(E2.ballots.map(b => b.n));
        if (Math.abs(N - N2) > 1e-9) return 1;
        for (let x = 0; x < m; x++) for (let y = x + 1; y < m; y++) if (P[x][y] === P2[x][y] && P[y][x] === P2[y][x] && Math.sign(base.rank[y] - base.rank[x]) !== Math.sign(r2[y] - r2[x])) return 0;
        return 1;
      }
      case 'spoiler': {                // Sen's α / independence of losing candidates: delete a loser, the winner stays
        if (w < 0 || m < 3) return w < 0 ? NaN : 1;
        for (let z = 0; z < m; z++) {
          if (z === w) continue;
          const map = []; for (let i = 0; i < m; i++) if (i !== z) map.push(i);
          const E1 = { m: m - 1, ids: map.map(i => E.ids[i]), ballots: E.ballots.map(b => ({ ...b, rank: b.rank.filter(c => c !== z).map(c => map.indexOf(c)) })) };
          const r = method(E1, name, () => {}, cost); if (r.w >= 0 && map[r.w] !== w) return 0;
          if (over()) { flag('budget'); return NaN; }
        }
        return 1;
      }
      case 'monotonic': {              // Smith 1973; Fishburn & Brams 1983: raising the winner never makes it lose
        if (w < 0) return NaN;
        for (let g = 0; g < E.ballots.length; g++) {
          const b = E.ballots[g], pos = b.rank.indexOf(w);
          if (pos === 0 || !(b.n > 0)) continue;
          const ks = splitCounts(b.n), places = pos < 0 ? [b.rank.length] : Array.from({ length: pos }, (_, i) => i + 1);
          for (const k of ks) for (const up of places) {
            const r = b.rank.filter(c => c !== w), at = (pos < 0 ? b.rank.length : pos) - up; r.splice(Math.max(0, at), 0, w);
            const bs = E.ballots.slice(); bs.splice(g, 1, { ...b, n: k, rank: r }, ...(b.n - k > 0 ? [{ ...b, n: b.n - k }] : []));
            const res = method(withBallots(E, bs), name, () => {}, cost); if (res.w !== w) return 0;
            if (over()) { flag('budget'); return NaN; }
          }
        }
        return 1;
      }
      case 'participation': {          // Moulin 1988: abstaining never helps (the no-show paradox)
        if (w < 0) return NaN;
        for (let g = 0; g < E.ballots.length; g++) {
          const b = E.ballots[g]; if (!(b.n > 0)) continue;
          for (const k of splitCounts(b.n)) {
            const bs = E.ballots.slice(); if (b.n - k > 0) bs.splice(g, 1, { ...b, n: b.n - k }); else bs.splice(g, 1);
            if (!bs.length) continue;
            const res = method(withBallots(E, bs), name, () => {}, cost); if (res.w >= 0 && res.w !== w && prefers(b, res.w, w)) return 0;
            if (over()) { flag('budget'); return NaN; }
          }
        }
        return 1;
      }
      default: return NaN;
    }
  }
  /** how many voters of a group move together in a search: 1 … 10 and all of them */
  function splitCounts(n) { const out = []; for (let k = 1; k <= Math.min(10, Math.floor(n)); k++) out.push(k); if (!out.includes(n) && n > 0) out.push(n); return out; }
  /** manipulability (Gibbard 1973, Satterthwaite 1975): can some voters of one group, all reporting the same false order, get a winner they prefer? */
  function manipulable(E, name, flag, cost) {
    if (E.m > 6) { flag('too-many'); return NaN; }
    const w = method(E, name, () => {}, cost).w; if (w < 0) { flag('tie'); return NaN; }
    for (let g = 0; g < E.ballots.length; g++) {
      const b = E.ballots[g]; if (!(b.n > 0) || b.rank[0] === w) continue;
      let found = false;
      for (const k of [b.n, 1, Math.floor(b.n / 2)].filter((k, i, a) => k > 0 && a.indexOf(k) === i)) {
        permute(E.m, perm => {
          if (found || cost.n > BUDGET) return;
          const bs = E.ballots.slice(); bs.splice(g, 1, { ...b, n: k, rank: perm.slice() }, ...(b.n - k > 0 ? [{ ...b, n: b.n - k }] : []));
          const r = method(withBallots(E, bs), name, () => {}, cost);
          if (r.w >= 0 && r.w !== w && prefers(b, r.w, w)) found = true;
        });
        if (found) return 1;
        if (cost.n > BUDGET) { flag('budget'); return NaN; }
      }
    }
    return 0;
  }
  /** single-peakedness (Black 1948): on the axis, or on some axis when none is given (searched) */
  function singlePeaked(E, axis) {
    const okOn = ax => { const at = new Array(E.m); ax.forEach((c, i) => { at[c] = i; });
      return E.ballots.every(b => { if (!b.rank.length) return true; let lo = at[b.rank[0]], hi = lo; for (const c of b.rank.slice(1)) { const p = at[c]; if (p === lo - 1) lo = p; else if (p === hi + 1) hi = p; else return false; } return true; }); };
    if (axis) return +okOn(axis);
    let ok = false; permute(E.m, perm => { if (!ok && perm[0] < perm[perm.length - 1] && okOn(perm)) ok = true; });
    return +ok;
  }

  /* =====================================================================================================================
     4. Decision theory (research §3). A lottery: outcomes {p, x}. A utility: {u, ua, w0}. */
  /** utility(kind, a, w0) → u(x) (NaN outside its domain): linear; log (Bernoulli 1738); sqrt (Cramer 1728); power CRRA; CARA; bounded x/(x+a) */
  function utility(kind, a, w0) {
    const W = fin(w0) ? w0 : 0;
    switch (kind) {
      case 'log': return x => (W + x > 0 ? Math.log(W + x) : NaN);
      case 'sqrt': return x => (W + x >= 0 ? Math.sqrt(W + x) : NaN);
      case 'power': { const r = fin(a) ? a : 0.5; return x => (W + x > 0 ? (r === 1 ? Math.log(W + x) : (Math.pow(W + x, 1 - r) - 1) / (1 - r)) : NaN); }
      case 'cara': { const r = fin(a) ? a : 1; return x => (r === 0 ? x : (1 - Math.exp(-r * x)) / r); }
      case 'bounded': { const s = fin(a) && a > 0 ? a : 1; return x => (W + x >= 0 ? (W + x) / (W + x + s) : NaN); }
      default: return x => W + x;
    }
  }
  const evOf = L => sum(L.map(o => o.p * o.x));
  const euOf = (L, u) => sum(L.map(o => (o.p > 0 ? o.p * u(o.x) : 0)));
  /** the certainty equivalent: u⁻¹(EU) by bisection between the smallest and the largest outcome (u increasing) */
  function ceOf(L, u) {
    const target = euOf(L, u); if (!fin(target)) return NaN;
    let lo = Math.min(...L.map(o => o.x)), hi = Math.max(...L.map(o => o.x));
    for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, Math.abs(hi)); i++) { const mid = (lo + hi) / 2; if (u(mid) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  /** cumulative prospect theory (Tversky & Kahneman 1992): α = β = 0.88, λ = 2.25, γ⁺ = 0.61, γ⁻ = 0.69 */
  function cpt(L, q) {
    const al = fin(q.alpha) ? q.alpha : 0.88, be = fin(q.beta) ? q.beta : 0.88, lam = fin(q.lam) ? q.lam : 2.25, gp = fin(q.gp) ? q.gp : 0.61, gm = fin(q.gm) ? q.gm : 0.69, ref = fin(q.ref) ? q.ref : 0;
    const w = g => p => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(p, g) / Math.pow(Math.pow(p, g) + Math.pow(1 - p, g), 1 / g));
    const gains = L.filter(o => o.x - ref > 0).sort((a, b) => b.x - a.x), losses = L.filter(o => o.x - ref < 0).sort((a, b) => a.x - b.x);
    let V = 0, cum = 0;
    for (const o of gains) { const W = w(gp); V += (W(cum + o.p) - W(cum)) * Math.pow(o.x - ref, al); cum += o.p; }
    cum = 0;
    for (const o of losses) { const W = w(gm); V += (W(cum + o.p) - W(cum)) * -lam * Math.pow(ref - o.x, be); cum += o.p; }
    return V;
  }
  /** α-maxmin expected utility over a set of priors (Gilboa & Schmeidler 1989; Ghirardato, Maccheroni & Marinacci 2004) */
  function meu(L, priors, u, alpha) {
    const ps = priors && priors.length ? priors : [L.map(o => o.p)], a = fin(alpha) ? alpha : 1;
    const vs = ps.map(q => sum(L.map((o, i) => (q[i] > 0 ? q[i] * u(o.x) : 0))));
    return a * Math.min(...vs) + (1 - a) * Math.max(...vs);
  }
  /** St Petersburg (D. Bernoulli 1738): 2^k with probability 2^−k, k = 1 … rounds, the payoff capped by the bank */
  function stPete(rounds, bank, u) {
    const L = []; for (let k = 1; k <= rounds; k++) L.push({ p: Math.pow(2, -k), x: Math.min(Math.pow(2, k), bank) });
    return L;
  }

  /* =====================================================================================================================
     5. Games (research §4). pay[r][c] = [row player's payoff, column player's payoff]. */
  function nashCells(G) {
    const out = [];
    for (let r = 0; r < G.pay.length; r++) for (let c = 0; c < G.pay[r].length; c++) {
      const a = G.pay[r][c][0], b = G.pay[r][c][1];
      if (G.pay.every(row => row[c][0] <= a) && G.pay[r].every(cell => cell[1] <= b)) out.push([r, c]);
    }
    return out;
  }
  /** the fully mixed equilibrium of a 2×2 game by indifference: player 1's probability of row 0 (makes player 2 indifferent), or player 2's of column 0 */
  function mixed(G, player) {
    if (G.pay.length !== 2 || G.pay[0].length !== 2) return NaN;
    const A = (r, c) => G.pay[r][c][0], B = (r, c) => G.pay[r][c][1];
    const p = player === 2 ? (A(1, 1) - A(0, 1)) / (A(0, 0) - A(0, 1) - A(1, 0) + A(1, 1)) : (B(1, 1) - B(1, 0)) / (B(0, 0) - B(1, 0) - B(0, 1) + B(1, 1));
    return fin(p) && p > 0 && p < 1 ? p : NaN;
  }
  function dominantStrat(G, player) {
    const nr = G.pay.length, nc = G.pay[0].length;
    if (player === 2) { for (let c = 0; c < nc; c++) if (Array.from({ length: nc }, (_, d) => d).every(d => d === c || G.pay.every(row => row[c][1] > row[d][1]))) return c; return -1; }
    for (let r = 0; r < nr; r++) if (Array.from({ length: nr }, (_, s) => s).every(s => s === r || G.pay[r].every((cell, c) => cell[0] > G.pay[s][c][0]))) return r;
    return -1;
  }
  function paretoCell(G, r, c) {
    const [a, b] = G.pay[r][c];
    for (const row of G.pay) for (const [x, y] of row) if (x >= a && y >= b && (x > a || y > b)) return 0;
    return 1;
  }
  const symmetric = G => G.pay.length === 2 && G.pay[0].length === 2 && [0, 1].every(i => [0, 1].every(j => G.pay[i][j][0] === G.pay[j][i][1]));
  /* the iterated prisoner's dilemma (Axelrod 1984): moves 0 = C, 1 = D. Strategies: Rapoport's TFT, TF2T, Friedman 1971 GRIM,
     Nowak & Sigmund 1993 Pavlov (win-stay lose-shift), Nowak & Sigmund 1992 generous TFT, Axelrod's JOSS, suspicious TFT, … */
  function move(s, me, op, r, q) {
    const n = me.length, last = n ? op[n - 1] : 0;
    switch (s) {
      case 'allc': return 0;
      case 'alld': return 1;
      case 'tft': return n ? last : 0;
      case 'stft': return n ? last : 1;
      case 'tf2t': return n >= 2 && op[n - 1] && op[n - 2] ? 1 : 0;
      case 'grim': return op.includes(1) ? 1 : 0;
      case 'pavlov': return n ? (me[n - 1] === op[n - 1] ? 0 : 1) : 0;
      case 'random': return r() < 0.5 ? 0 : 1;
      case 'gtft': return n && last ? (r() < q ? 0 : 1) : 0;
      case 'alt': return n % 2;
      case 'joss': return n && last ? 1 : r() < 0.1 ? 1 : 0;
      default: return 0;
    }
  }
  /** match(a, b, A, rounds, noise, rng) → per-round payoffs of both players. A = row payoffs [[R, S], [T, P]] */
  function match(a, b, A, rounds, noise, rng) {
    const ha = [], hb = [], pa = [], pb = [];
    const T = A[1][0], R = A[0][0], P = A[1][1], S = A[0][1];
    const q = Math.max(0, Math.min(1 - (T - R) / (R - S), (R - P) / (T - P)));   // Nowak & Sigmund 1992 generosity
    for (let t = 0; t < rounds; t++) {
      let x = move(a, ha, hb, rng, q), y = move(b, hb, ha, rng, q);
      if (noise > 0) { if (rng() < noise) x = 1 - x; if (rng() < noise) y = 1 - y; }
      ha.push(x); hb.push(y); pa.push(A[x][y]); pb.push(A[y][x]);
    }
    return { pa, pb };
  }
  /* the seeded streams: NoemaSimKit's MRG32k3a when it is loaded (src/engines/kernel/simkit.js, L'Ecuyer 1999), else the core's mulberry32
     — FALLBACK (marked): the same seed gives the same numbers on every device either way */
  function rngFor(seed, name) {
    const K = NoemaSimKit;
    if (K && typeof K.stream === 'function') return K.stream(seed, 'philo:' + name);
    return C.mulberry32(C.hash32('philo:' + name, seed));
  }
  function tournament(spec, games, X, seed, flag) {
    const tu = spec.model.tournament, G = games.get(tu.game);
    if (!G || !symmetric(G)) { flag('asymmetric'); return null; }
    const A = G.pay.map(row => row.map(c => c[0]));
    const S = tu.strategies, rounds = Math.min(2000, Math.max(1, Math.round(num(X(tu.rounds), 200)))), reps = Math.min(20, Math.max(1, Math.round(num(X(tu.reps), 1)))), noise = num(X(tu.noise), 0);
    const self = tu.self !== false, gens = Math.min(2000, Math.max(0, Math.round(num(X(tu.gens), 100))));
    if (!(noise >= 0 && noise <= 1)) { flag('range'); return null; }
    const n = S.length, Mx = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
      let si = 0, sj = 0;
      for (let k = 0; k < reps; k++) { const r = match(S[i], S[j], A, rounds, noise, rngFor(seed, `${i}|${j}|${k}`)); si += sum(r.pa) / rounds; sj += sum(r.pb) / rounds; }
      Mx[i][j] = si / reps; Mx[j][i] = sj / reps;
    }
    const mean = S.map((_, i) => { const opp = S.map((__, j) => j).filter(j => self || j !== i); return opp.length ? sum(opp.map(j => Mx[i][j])) / opp.length : NaN; });
    const rank = mean.map(v => 1 + mean.filter(u => u > v + 1e-12).length);
    // discrete replicator dynamics (Taylor & Jonker 1978), payoffs shifted to stay positive
    const fmin = Math.min(...Mx.flat()), shares = [S.map(() => 1 / n)];
    for (let g = 0; g < gens; g++) {
      const x = shares[shares.length - 1], f = S.map((_, i) => sum(x.map((xj, j) => xj * (Mx[i][j] - fmin + 1)))), fb = sum(x.map((xi, i) => xi * f[i]));
      shares.push(x.map((xi, i) => xi * f[i] / fb));
    }
    return { S, A, rounds, noise, Mx, mean, rank, shares };
  }
  /* bargaining (Nash 1950; Kalai & Smorodinsky 1975; Kalai 1977): the feasible set is the convex hull of the points */
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function bargain(pts, d, sol) {
    const H = hull(pts), edges = [];
    if (!H.length) return [NaN, NaN];
    for (let i = 0; i < H.length; i++) edges.push([H[i], H[(i + 1) % H.length]]);
    if (H.length === 1) edges.push([H[0], H[0]]);
    if (sol === 'util') { let b = null; for (const q of H) if (q[0] >= d[0] && q[1] >= d[1] && (!b || q[0] + q[1] > b[0] + b[1])) b = q; return b ? b.slice() : [NaN, NaN]; }
    if (sol === 'nash') {           // the largest product of gains over the boundary (a quadratic on each edge)
      let best = -Infinity, bp = [NaN, NaN];
      const tryP = (x, y) => { if (x >= d[0] - 1e-12 && y >= d[1] - 1e-12) { const v = (x - d[0]) * (y - d[1]); if (v > best) { best = v; bp = [x, y]; } } };
      for (const [a, b] of edges) {
        tryP(a[0], a[1]);
        const dx = b[0] - a[0], dy = b[1] - a[1], A2 = dx * dy, B1 = (a[0] - d[0]) * dy + (a[1] - d[1]) * dx;
        if (A2 < 0) { const t = -B1 / (2 * A2); if (t > 0 && t < 1) tryP(a[0] + t * dx, a[1] + t * dy); }
      }
      return bp;
    }
    // ks and egal: the farthest point of the hull along a ray from d
    let dir;
    if (sol === 'egal') dir = [1, 1];
    else { const ok = H.filter(q => q[0] >= d[0] - 1e-12 && q[1] >= d[1] - 1e-12); if (!ok.length) return [NaN, NaN];
      let ix = -Infinity, iy = -Infinity;   // the ideal point over the individually rational part: max of each coordinate on the hull boundary
      for (const [a, b] of edges) for (let s = 0; s <= 1; s += 1) { const q = s ? b : a; if (q[1] >= d[1] - 1e-12) ix = Math.max(ix, q[0]); if (q[0] >= d[0] - 1e-12) iy = Math.max(iy, q[1]); }
      for (const [a, b] of edges) { // crossings of the lines y = d1 and x = d0 with an edge can be farther than a vertex
        const dx = b[0] - a[0], dy = b[1] - a[1];
        if (dy !== 0) { const t = (d[1] - a[1]) / dy; if (t >= 0 && t <= 1) ix = Math.max(ix, a[0] + t * dx); }
        if (dx !== 0) { const t = (d[0] - a[0]) / dx; if (t >= 0 && t <= 1) iy = Math.max(iy, a[1] + t * dy); }
      }
      dir = [ix - d[0], iy - d[1]]; }
    let smax = -Infinity;
    for (const [a, b] of edges) {
      const ex = b[0] - a[0], ey = b[1] - a[1], den = dir[0] * ey - dir[1] * ex;
      if (Math.abs(den) < 1e-15) continue;
      const s = ((a[0] - d[0]) * ey - (a[1] - d[1]) * ex) / den, t = ((a[0] - d[0]) * dir[1] - (a[1] - d[1]) * dir[0]) / den;
      if (t >= -1e-12 && t <= 1 + 1e-12 && s > smax) smax = s;
    }
    return smax >= 0 ? [d[0] + smax * dir[0], d[1] + smax * dir[1]] : [NaN, NaN];
  }

  /* =====================================================================================================================
     6. Epistemology (research §5) */
  /** confirmation measures (Fitelson 1999; Crupi, Tentori & Gonzalez 2007; Crupi SEP "Confirmation") */
  function confirm(h, eh, enh, m) {
    if (!(h > 0 && h < 1) || !(eh >= 0 && eh <= 1) || !(enh >= 0 && enh <= 1)) return NaN;
    const pe = eh * h + enh * (1 - h); if (!(pe > 0 && pe < 1)) return NaN;
    const post = eh * h / pe, postN = (1 - eh) * h / (1 - pe), d = post - h;
    switch (m) {
      case 'post': return post;
      case 'd': return d;                                       // Carnap 1962 / Eells
      case 'r': return Math.log(post / h);                      // Keynes; Milne 1996
      case 'l': return Math.log(eh / enh);                      // Good 1950; Fitelson 2001
      case 's': return post - postN;                            // Christensen 1999; Joyce 1999
      case 'k': return (eh - enh) / (eh + enh);                 // Kemeny & Oppenheim 1952
      case 'z': return d >= 0 ? d / (1 - h) : d / h;            // Crupi et al. 2007
      case 'c': return h * eh - h * pe;                         // Carnap 1962 relevance: P(H∧E) − P(H)P(E)
      default: return NaN;
    }
  }
  /** the analyses of knowledge on a case (Ichikawa & Steup SEP "The Analysis of Knowledge") */
  function knows(k, a) {
    const tb = k.believed && k.truth;
    switch (a) {
      case 'jtb': return +(tb && k.justified);                          // Plato Theaetetus 201c–210b; Ayer 1956
      case 'noFalseLemma': return +(tb && k.justified && !k.falseLemma);   // Clark 1963
      case 'defeasibility': return +(tb && k.justified && !k.defeater);    // Lehrer & Paxson 1969
      case 'causal': return +(tb && k.causal);                          // Goldman 1967
      case 'reliabilism': return +(tb && k.reliable);                   // Goldman 1979
      case 'sensitivity': return +(tb && k.sensitive);                  // Nozick 1981
      case 'safety': return +(tb && k.safe);                            // Sosa 1999; Williamson 2000
      case 'virtue': return +(tb && k.apt);                             // Sosa 2007; Greco 2010
      case 'intuition': return typeof k.intuition === 'boolean' ? +k.intuition : NaN;
      default: return NaN;
    }
  }
  /** sorites by degrees (Goguen 1969; Smith 2008): v_i of "i is a heap", i = 0 … n−1 */
  function sorites(S, X) {
    const n = Math.min(2000, Math.max(2, Math.round(num(X(S.n), 100)))), lo = num(X(S.lo), 0.3 * (n - 1)), hi = num(X(S.hi), 0.7 * (n - 1));
    if (!(hi > lo)) return null;
    const mid = (lo + hi) / 2, sc = (hi - lo) / 8;
    const v = Array.from({ length: n }, (_, i) => (S.shape === 'logistic' ? 1 / (1 + Math.exp(-(i - mid) / sc)) : Math.max(0, Math.min(1, (i - lo) / (hi - lo)))));
    const cond = [], bound = [v[n - 1]];   // v(P_i → P_{i−1}) (Łukasiewicz 1920) and the modus ponens bound v(B) ≥ v(A) + v(A→B) − 1
    for (let i = n - 1; i >= 1; i--) { const c = Math.min(1, 1 - v[i] + v[i - 1]); cond.push(c); bound.push(Math.max(0, bound[bound.length - 1] + c - 1)); }
    return { n, v, cond, bound, plo: num(X(S.plo), lo), phi: num(X(S.phi), hi), cut: num(X(S.cut), mid) };
  }
  /* Dignāga's Hetucakra (research §6): s = all 0 · none 1 · some 2 for the sapakṣa; the same for the vipakṣa; cell = 3s + v + 1 */
  const HIDX = { all: 0, none: 1, some: 2 };
  function hetu(inf) { const cell = 3 * HIDX[inf.sapaksa] + HIDX[inf.vipaksa] + 1; const verdict = !inf.paksa ? -2 : cell === 2 || cell === 8 ? 1 : cell === 4 || cell === 6 ? -1 : 0; return { cell, verdict }; }
  /** the catuṣkoṭi as First Degree Entailment (Priest 2010): 1 true only, 2 false only, 3 both, 4 neither, 5 ineffable */
  const koti = (t, f, e) => (e ? 5 : t && !f ? 1 : !t && f ? 2 : t && f ? 3 : 4);
  /** the Jain saptabhaṅgī (Matilal 1981; Priest 2008): asti, nāsti, avaktavya → 1 … 7 in the traditional order (0: none) */
  const BH = { '100': 1, '010': 2, '110': 3, '001': 4, '101': 5, '011': 6, '111': 7 };
  const bhanga = (a, n, v) => BH['' + (a ? 1 : 0) + (n ? 1 : 0) + (v ? 1 : 0)] || 0;

  /* =====================================================================================================================
     7. Arguments through logic@1 (NoemaLibLogic) */
  const strip = f => (isObj(f) ? { t: f.t, n: f.n, a: strip(f.a), b: strip(f.b) } : undefined);
  const eqF = (f, g) => JSON.stringify(strip(f)) === JSON.stringify(strip(g));
  /** the argument's form (Copi, Cohen & McMahon 2014): 1 MP, 2 MT, 3 HS, 4 DS, 5 CD; −1 affirming the consequent, −2 denying the antecedent; 0 other */
  function formOf(ps, c) {
    const perms = ps.length === 2 ? [[ps[0], ps[1]], [ps[1], ps[0]]] : [];
    for (const [x, y] of perms) {
      if (x.t === 'imp') {
        if (eqF(y, x.a) && eqF(c, x.b)) return 1;
        if (y.t === 'not' && eqF(y.a, x.b) && c.t === 'not' && eqF(c.a, x.a)) return 2;
        if (y.t === 'imp' && eqF(x.b, y.a) && c.t === 'imp' && eqF(c.a, x.a) && eqF(c.b, y.b)) return 3;
        if (eqF(y, x.b) && eqF(c, x.a)) return -1;
        if (y.t === 'not' && eqF(y.a, x.a) && c.t === 'not' && eqF(c.a, x.b)) return -2;
      }
      if (x.t === 'or' && y.t === 'not' && ((eqF(y.a, x.a) && eqF(c, x.b)) || (eqF(y.a, x.b) && eqF(c, x.a)))) return 4;
    }
    if (ps.length === 3) {
      const d = ps.find(p => p.t === 'or'), is = ps.filter(p => p.t === 'imp');
      if (d && is.length === 2 && c.t === 'or') for (const [i, j] of [[is[0], is[1]], [is[1], is[0]]]) if (eqF(i.a, d.a) && eqF(j.a, d.b) && eqF(c.a, i.b) && eqF(c.b, j.b)) return 5;
    }
    return 0;
  }
  /** validity (logic@1 entails: the truth table, the first countermodel), the number of countermodels (logic@1 truthTable) and the form */
  function argument(A, flag) {
    const L = NoemaLibLogic, fs = [];
    for (const s of A.premises.concat([A.conclusion])) { const r = L.parse(s, 'prop'); if (!r || !r.ok) { flag('parse'); return null; } fs.push(r.ast); }
    const atoms = fs.reduce((o, f) => L.atomsOf(f, o), []);
    if (atoms.length > 12) { flag('too-many-atoms'); return null; }
    const ps = fs.slice(0, -1), c = fs[fs.length - 1], tt = L.truthTable(fs, atoms), k = ps.length;
    let counters = 0; for (let r = 0; r < tt.rows.length; r++) if (tt.cols.slice(0, k).every(col => col[r] === 1) && tt.cols[k][r] === 0) counters++;
    const e = L.entails(ps, c, { logic: 'prop' });
    return { valid: +!!(e && e.valid), counters, form: formOf(ps, c) };
  }

  /* ---------- the model, resolved for a run ---------- */
  const num = (v, d) => (fin(v) ? v : d);

  /* =====================================================================================================================
     8. Added: rule utilitarianism at an acceptance rate, strategic voting games, infinite ethics, Metz's ubuntu */
  /** Rule consequentialism (Hooker 2000, Ideal Code, Real World, §§ 1.5–1.7 and 3.2: the ideal code is the one whose internalisation
      by the overwhelming majority — 90 % — has the greatest expected value, counting the costs of internalising it; variable-rate
      readings: Ridge 2006, Phil. Studies 128:242 — the average over all rates). Our explicit acceptance-rate model of one rule
      at rate a ∈ [0, 1] (per head): V(a) = a·(b·a^k − c) − x·a·(1 − a), b the benefit to an accepter when everyone accepts, k ≥ 0 how much
      the benefit needs others' acceptance (coordination: k = 0 none), c the internalisation cost (Hooker's "teaching costs"), x the
      loss of an accepter exploited by the non-accepters. A code's value is the sum over its rules. */
  function ruleValue(r, a) { const b = r.b, c = r.c || 0, k = r.k || 0, x = r.x || 0; return a * (b * Math.pow(a, k) - c) - x * a * (1 - a); }
  const codeValue = (rules, a) => sum(rules.map(r => ruleValue(r, a)));
  const RIDGE = rules => { let s = 0; for (let i = 0; i <= 100; i++) s += codeValue(rules, i / 100) * (i === 0 || i === 100 ? 0.5 : 1); return s / 100; };   // ∫₀¹ V(a) da, trapezoid
  /** the winner of a profile of strict rankings under a method, ties broken by the candidate order (lexicographic, as in
      Myerson & Weber 1993's pure-strategy analyses); ranks: index lists */
  function lexWinner(m, ids, ranks, name, cost, ballots) {
    const r = method({ m, ids, ballots: ballots || ranks.map(rank => ({ n: 1, rank, approve: 1 })) }, name, () => {}, cost);
    if (r.w >= 0) return r.w;
    const rk = r.rank || []; for (let i = 0; i < m; i++) if (rk[i] === 0) return i;
    return 0;
  }
  function perms(m) { const out = []; permute(m, p => out.push(p.slice())); return out; }
  /** voters(E) → the sincere ranking of each voter (ballot groups expanded; n must be whole), or null */
  function voters(E, flag) {
    const vs = []; for (const b of E.ballots) { if (!Number.isInteger(b.n)) { flag('whole'); return null; } if (b.rank.length !== E.m) { flag('partial'); return null; } for (let i = 0; i < b.n; i++) vs.push(b.rank); }
    if (vs.length > 8) { flag('too-many'); return null; }
    return vs;
  }
  /** voting games (Farquharson 1969; Myerson & Weber 1993; Dhillon & Lockwood 2004, GEB 46:55): each voter's strategy is a ballot —
      plurality: the candidate voted for; antiplurality: the one voted against; other methods: any strict ranking. Outcomes by the method,
      ties by the candidate order. Pure Nash equilibria by exhaustive search (all S^N profiles, ≤ 2·10⁶ evaluations), the sincere
      profile, and the equilibria in strategies not weakly dominated. */
  function voteGame(E, name, flag) {
    const vs = voters(E, flag); if (!vs) return null;
    const m = E.m, N = vs.length, P = perms(m);
    const strat = name === 'plurality' ? Array.from({ length: m }, (_, c) => [c].concat(P[0].filter(x => x !== c)))
      : name === 'antiplurality' ? Array.from({ length: m }, (_, c) => P[0].filter(x => x !== c).concat([c])) : P;
    const S = strat.length, total = Math.pow(S, N);
    if (total * (1 + N) * (name === 'kemeny' ? fact(m) : 1) > 2e6) { flag('budget'); return null; }
    const cost = { n: 0 }, W = new Int8Array(total), prof = new Array(N);
    for (let p = 0; p < total; p++) { let q = p; for (let i = N - 1; i >= 0; i--) { prof[i] = strat[q % S]; q = Math.floor(q / S); } W[p] = lexWinner(m, E.ids, prof, name, cost); }
    const pw = Array.from({ length: N }, (_, i) => Math.pow(S, N - 1 - i));
    const better = (i, x, y) => vs[i].indexOf(x) < vs[i].indexOf(y);
    const digit = (p, i) => Math.floor(p / pw[i]) % S;
    const isNE = p => { for (let i = 0; i < N; i++) { const base = p - digit(p, i) * pw[i]; for (let s = 0; s < S; s++) if (better(i, W[base + s * pw[i]], W[p])) return false; } return true; };
    // weak dominance of strategy s by t for voter i over every profile of the others
    const dominated = Array.from({ length: N }, () => new Uint8Array(S)), others = total / S, domOk = N * S * S * others <= 3e7;
    if (domOk) for (let i = 0; i < N; i++) for (let s = 0; s < S; s++) for (let t = 0; t < S && !dominated[i][s]; t++) {
      if (t === s) continue; let ge = true, gt = false;
      for (let r = 0; r < others && ge; r++) { const base = Math.floor(r / pw[i]) * pw[i] * S + (r % pw[i]), ws = W[base + s * pw[i]], wt = W[base + t * pw[i]]; if (ws !== wt) { if (better(i, wt, ws)) gt = true; else ge = false; } }
      if (ge && gt) dominated[i][s] = 1;
    }
    if (!domOk) flag('budget');
    let ne = 0, und = 0; const winners = new Set();
    for (let p = 0; p < total; p++) if (isNE(p)) { ne++; winners.add(W[p]); let ok = true; for (let i = 0; i < N; i++) if (dominated[i][digit(p, i)]) ok = false; if (ok) und++; }
    if (!domOk) und = NaN;
    const sinc = vs.reduce((a, v, i) => a + strat.findIndex(s => (name === 'plurality' ? s[0] === v[0] : name === 'antiplurality' ? s[m - 1] === v[m - 1] : s.every((c, k) => c === v[k]))) * pw[i], 0);
    return { ne, und, winners: winners.size, sincereNE: isNE(sinc) ? 1 : 0, sincereWinner: W[sinc] };
  }
  /** Gibbard 1973 / Satterthwaite 1975: can one voter, misreporting a strict ranking, get a candidate they prefer? (ties by the
      candidate order). gsProfile: on the model's profile; gsExists: over every profile of n voters on m candidates (a theorem made
      visible: for m ≥ 3 every non-dictatorial onto method has one) */
  function gsProfile(m, ids, vs, name, cost) {
    const P = perms(m), w = lexWinner(m, ids, vs, name, cost); let who = 0;
    for (let i = 0; i < vs.length; i++) for (const p of P) { const ws = vs.slice(); ws[i] = p; const w2 = lexWinner(m, ids, ws, name, cost); if (vs[i].indexOf(w2) < vs[i].indexOf(w)) { who++; break; } }
    return who;
  }
  function gsExists(m, n, name, flag) {
    const P = perms(m), S = P.length, total = Math.pow(S, n), ids = Array.from({ length: m }, (_, i) => 'c' + i), cost = { n: 0 };
    if (total * n * S > 2e6) { flag('budget'); return NaN; }
    let count = 0;
    for (let p = 0; p < total; p++) { if (cost.n > 2e6) { flag('budget'); return NaN; } let q = p; const vs = []; for (let i = 0; i < n; i++) { vs.unshift(P[q % S]); q = Math.floor(q / S); } if (gsProfile(m, ids, vs, name, cost) > 0) count++; }
    return count;
  }
  /** infinite utility streams: a head and a cycle repeated forever. Comparisons on the partial sums D_t = Σ_{s≤t} (a_s − b_s):
      overtaking (Atsumi 1965; von Weizsäcker 1965: a ≻ b iff D_t > 0 from some t on), catching-up (Gale 1967: a ≽ b iff
      liminf D_t ≥ 0), discounting, the limit average; Pareto, finite anonymity (a finite permutation) and infinite anonymity (the
      same count — finite or infinite — of every value), whose joint use with Pareto is inconsistent (Van Liedekerke 1995; Lauwers
      1997; Bostrom 2011; Askell 2018): the demonstration is a pair that Pareto ranks and infinite anonymity equates. Exact for
      eventually periodic streams (decided on head + one common period, lcm ≤ 4096). */
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function streamAt(s, t) { return t < s.head.length ? s.head[t] : s.cycle[(t - s.head.length) % s.cycle.length]; }
  function streamPair(a, b, flag) {
    const L = a.cycle.length / gcd(a.cycle.length, b.cycle.length) * b.cycle.length;
    if (L > 4096) { flag('period'); return null; }
    const H = Math.max(a.head.length, b.head.length), n = H + L, D = new Float64Array(n), d = new Float64Array(n); let s = 0;
    for (let t = 0; t < n; t++) { d[t] = streamAt(a, t) - streamAt(b, t); s += d[t]; D[t] = s; }
    let per = 0; for (let t = H; t < n; t++) per += d[t];
    let mn = Infinity, mx = -Infinity; for (let t = H; t < n; t++) { mn = Math.min(mn, D[t]); mx = Math.max(mx, D[t]); }
    return { H, L, n, D, d, per, mn, mx };
  }
  const EPS = 1e-12;
  function overtake(q, flag) { if (q.per > EPS) return 1; if (q.per < -EPS) return -1; if (q.mn > EPS) return 1; if (q.mx < -EPS) return -1; if (Math.abs(q.mn) <= EPS && Math.abs(q.mx) <= EPS) return 0; flag('incomparable'); return NaN; }
  function catchUp(q, flag) { if (q.per > EPS) return 1; if (q.per < -EPS) return -1; const ge = q.mn >= -EPS, le = q.mx <= EPS; if (ge && le) return 0; if (ge) return 1; if (le) return -1; flag('incomparable'); return NaN; }
  function valueCounts(s) { const c = new Map(); for (const v of s.head) c.set(v, (c.get(v) || 0) + 1); for (const v of s.cycle) c.set(v, Infinity); return c; }
  function sameCounts(a, b) { const ca = valueCounts(a), cb = valueCounts(b); if (ca.size !== cb.size) return false; for (const [v, k] of ca) if (cb.get(v) !== k) return false; return true; }
  /** Metz 2007 (J. Political Philosophy 15:321, p. 338): "an action is right just insofar as it promotes shared identity among people
      grounded on good-will; an act is wrong to the extent that it fails to do so and tends to encourage the opposites of division and
      ill-will"; Metz 2013 (in Ubuntu: Curating the Archive) and 2022 (A Relational Moral Theory) read it as honouring (prizing)
      such relationships rather than maximising them. Our computable reading: an option changes relationships by Δidentity and
      Δsolidarity (each −1…1); "promote": score = Σ wI·ΔI·[ΔS ≥ 0 or ΔI < 0] + wS·ΔS (identity gained with ill-will is not counted —
      it is not "grounded on good-will"); "honour": an option in which the agent itself acts with division or ill-will (byAgent with
      ΔI < 0 or ΔS < 0) is impermissible whatever its total; among the permissible the promote score ranks. */
  function ubuntuScore(op, wI, wS) { let s = 0; for (const e of op.effects) { const i = e.identity, so = e.solidarity; s += wI * (so >= 0 || i < 0 ? i : 0) + wS * so; } return s; }
  const ubuntuOk = op => !op.effects.some(e => e.byAgent && (e.identity < 0 || e.solidarity < 0));

  /* ---------- mixed equilibria of two-player games, and voting blocs (von Stengel 2007, in Nisan et al., Algorithmic Game Theory
     ch. 3: support enumeration for nondegenerate games, §3.4; the Lemke–Howson algorithm, Lemke & Howson 1964, SIAM J. 12:413) ---------- */
  function solveLin(M, rhs) {   // Gaussian elimination with partial pivoting; null when singular
    const n = rhs.length, a = M.map((r, i) => r.concat([rhs[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (Math.abs(a[p][c]) < 1e-12) return null; [a[c], a[p]] = [a[p], a[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
    }
    return a.map((r, i) => r[n] / r[i]);
  }
  function subsets(n, k) { const out = []; (function go(s, i) { if (s.length === k) { out.push(s.slice()); return; } for (let j = i; j < n; j++) { s.push(j); go(s, j + 1); s.pop(); } })([], 0); return out; }
  /** the mixed strategy of the other player on support J that makes every row of I indifferent: Σ_j P[i][j] y_j = v (i ∈ I), Σ y = 1 */
  function indiff(P, I, J) {
    const k = I.length, M = [], rhs = [];
    for (const i of I) { M.push(J.map(j => P[i][j]).concat([-1])); rhs.push(0); }
    M.push(J.map(() => 1).concat([0])); rhs.push(1);
    if (M.length !== k + 1 || J.length !== k) return null;
    const s = solveLin(M, rhs); return s ? { y: s.slice(0, k), v: s[k] } : null;
  }
  /** supportEnum(A, B) → [{x, y, u, v}]: every equilibrium with equal-size supports (all of them in a nondegenerate game) */
  function supportEnum(A, B, limit) {
    const m = A.length, n = A[0].length, out = [], Bt = B[0].map((_, j) => B.map(r => r[j])), E = 1e-9;
    for (let k = 1; k <= Math.min(m, n); k++) for (const I of subsets(m, k)) for (const J of subsets(n, k)) {
      if (out.length >= (limit || 64)) return out;
      const qy = indiff(A, I, J), qx = indiff(Bt, J, I); if (!qy || !qx) continue;
      if (qy.y.some(v => v < -E) || qx.y.some(v => v < -E)) continue;
      const y = new Array(n).fill(0), x = new Array(m).fill(0); J.forEach((j, t) => { y[j] = Math.max(0, qy.y[t]); }); I.forEach((i, t) => { x[i] = Math.max(0, qx.y[t]); });
      const Ay = A.map(r => sum(r.map((a, j) => a * y[j]))), xB = Bt.map(c => sum(c.map((b, i) => b * x[i])));
      const u = Math.max(...Ay), v = Math.max(...xB);
      if (I.some(i => Ay[i] < u - 1e-7) || J.some(j => xB[j] < v - 1e-7)) continue;
      if (out.some(e => e.x.every((a, i) => Math.abs(a - x[i]) < 1e-7) && e.y.every((b, j) => Math.abs(b - y[j]) < 1e-7))) continue;
      // degenerate (von Stengel 2007 Def. 3.2): more pure best responses than the support — the list may then miss equilibria (a continuum)
      const deg = Ay.filter(a => a >= u - 1e-7).length > J.length || xB.filter(b => b >= v - 1e-7).length > I.length;
      out.push({ x, y, u, v, deg });
    }
    return out;
  }
  /** lemkeHowson(A, B, k0) → {x, y} — the equilibrium reached by dropping label k0 (0 … m+n−1), by complementary pivoting on the
      polytopes P = {x ≥ 0: Bᵀx ≤ 1}, Q = {y ≥ 0: Ay ≤ 1} after shifting the payoffs positive (von Stengel 2007 §3.5) */
  function lemkeHowson(A, B, k0) {
    const m = A.length, n = A[0].length, N = m + n;
    const lo = Math.min(...A.flat(), ...B.flat()), Ap = A.map(r => r.map(a => a - lo + 1)), Bp = B.map(r => r.map(b => b - lo + 1));
    // Q: rows i < m: Σ_j A'[i][j] y_j + r_i = 1 (r_i label i, y_j label m + j). P: rows j < n: Σ_i B'[i][j] x_i + s_j = 1 (x_i label i, s_j label m + j)
    const TQ = Array.from({ length: m }, (_, i) => { const r = new Array(N + 1).fill(0); r[i] = 1; for (let j = 0; j < n; j++) r[m + j] = Ap[i][j]; r[N] = 1; return r; });
    const TP = Array.from({ length: n }, (_, j) => { const r = new Array(N + 1).fill(0); r[m + j] = 1; for (let i = 0; i < m; i++) r[i] = Bp[i][j]; r[N] = 1; return r; });
    const bQ = Array.from({ length: m }, (_, i) => i), bP = Array.from({ length: n }, (_, j) => m + j);
    const pivot = (T, b, e) => {   // the entering variable e; the min-ratio row leaves (ties: the lowest label, a simple anti-cycling rule)
      let row = -1, best = Infinity;
      for (let r = 0; r < T.length; r++) if (T[r][e] > 1e-12) { const q = T[r][N] / T[r][e]; if (q < best - 1e-12 || (Math.abs(q - best) <= 1e-12 && b[r] < b[row])) { best = q; row = r; } }
      if (row < 0) return -1;
      const pv = T[row][e]; for (let k = 0; k <= N; k++) T[row][k] /= pv;
      for (let r = 0; r < T.length; r++) if (r !== row && Math.abs(T[r][e]) > 0) { const f = T[r][e]; for (let k = 0; k <= N; k++) T[r][k] -= f * T[row][k]; }
      const left = b[row]; b[row] = e; return left;
    };
    let e = k0, inP = k0 < m;   // label k0 < m: x_k0 enters P; else y enters Q
    for (let it = 0; it < 1000; it++) {
      const left = inP ? pivot(TP, bP, e) : pivot(TQ, bQ, e);
      if (left < 0) return null;
      if (left === k0) break;
      e = left; inP = !inP;
    }
    const x = new Array(m).fill(0), y = new Array(n).fill(0);
    bP.forEach((l, r) => { if (l < m) x[l] = TP[r][N]; }); bQ.forEach((l, r) => { if (l >= m) y[l - m] = TQ[r][N]; });
    const sx = sum(x), sy = sum(y); if (!(sx > 0 && sy > 0)) return null;
    return { x: x.map(v => v / sx), y: y.map(v => v / sy) };
  }
  /** a voting game between ballot groups as blocs (each group's ballot counts n times): a plurality ballot names a candidate, an
      antiplurality ballot the one voted against; a group's payoff is the Borda score of the winner on its own ranking (m − 1 − place)
      or, with util 'top', 1 for its first choice; ties broken by the candidate order */
  function blocGame(E, name, util) {
    const m = E.m, G = E.ballots.length, strat = Array.from({ length: m }, (_, c) => c);
    const ballotOf = (g, c) => (name === 'antiplurality' ? E.ballots[g].rank.filter(x => x !== c).concat([c]) : [c].concat(E.ballots[g].rank.filter(x => x !== c)));
    const pay = (g, w) => { const p = E.ballots[g].rank.indexOf(w); return util === 'top' ? +(p === 0) : p < 0 ? 0 : m - 1 - p; };
    const cost = { n: 0 }, win = prof => lexWinner(m, E.ids, [], name, cost, prof.map((c, g) => ({ n: E.ballots[g].n, rank: ballotOf(g, c), approve: 1 })));
    return { m, G, strat, pay, win };
  }
  /** mixedVote(E, name, solver, util, flag) → [{p: [[prob per candidate] per group], win: [P(candidate wins)]}] */
  function mixedVote(E, name, solver, util, flag) {
    const g = blocGame(E, name, util), m = g.m;
    if (g.G === 2) {
      const W = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => g.win([a, b])));
      const A = W.map(r => r.map(w => g.pay(0, w))), B = W.map(r => r.map(w => g.pay(1, w)));
      const eqs = solver === 'lemke' ? [lemkeHowson(A, B, 0)].filter(Boolean) : supportEnum(A, B);
      if (solver !== 'lemke' && eqs.some(q => q.deg)) flag('degenerate');
      return eqs.map(q => ({ p: [q.x, q.y], win: Array.from({ length: m }, (_, c) => { let s = 0; for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) if (W[a][b] === c) s += q.x[a] * q.y[b]; return s; }) }));
    }
    // more than two groups: the multi-population replicator dynamics (Taylor & Jonker 1978; Weibull 1995 ch. 5) from the uniform mix — an
    // approximation: a rest point it reaches need not be an equilibrium, and it finds at most one
    flag('approximate');
    if (Math.pow(m, g.G) * g.G * g.G * m > 25000) { flag('budget'); return []; }
    const profs = [], W = []; for (let p = 0; p < Math.pow(m, g.G); p++) { let q = p; const pr = []; for (let i = 0; i < g.G; i++) { pr.push(q % m); q = Math.floor(q / m); } profs.push(pr); W.push(g.win(pr)); }
    let X = Array.from({ length: g.G }, () => new Array(m).fill(1 / m));
    const eu = (X, i, c) => { let s = 0; profs.forEach((pr, k) => { if (pr[i] !== c) return; let pp = 1; for (let j = 0; j < g.G; j++) if (j !== i) pp *= X[j][pr[j]]; s += pp * g.pay(i, W[k]); }); return s; };
    for (let it = 0; it < 2000; it++) {
      const X2 = X.map((x, i) => { const us = x.map((_, c) => eu(X, i, c) + 1), avg = sum(x.map((v, c) => v * us[c])); return x.map((v, c) => v * us[c] / avg); });
      const d = Math.max(...X2.flat().map((v, k) => Math.abs(v - X.flat()[k]))); X = X2; if (d < 1e-10) break;
    }
    const win = new Array(m).fill(0); profs.forEach((pr, k) => { let pp = 1; for (let j = 0; j < g.G; j++) pp *= X[j][pr[j]]; win[W[k]] += pp; });
    return [{ p: X, win }];
  }

  /* ---------- Poisson voting games (Myerson 1998, IJGT 27:375 — population uncertainty; Myerson 2000, JET 94:7 — large Poisson games,
     magnitudes; Myerson & Weber 1993, APSR 87:102 — the voting equilibrium; Myerson 2002, JET 103:219). The number of voters is
     Poisson(n); a voter is of type t with probability r_t and votes for candidate vote_t; so the votes X_k of each candidate are
     independent Poisson(τ_k), τ_k = n Σ_t r_t [vote_t = k]. Plurality, ties broken with equal chances. Exact probabilities by summing
     the Poisson laws up to τ + 12√τ + 20 (the remainder < 10⁻¹²); magnitudes (log-probability rates) by Myerson 2000's formulas. ---------- */
  function poissonPmf(t, K) { const p = new Float64Array(K + 2); if (t <= 0) { p[0] = 1; return p; } let lg = -t; p[0] = Math.exp(lg); for (let x = 1; x <= K + 1; x++) { lg += Math.log(t / x); p[x] = Math.exp(lg); } return p; }
  function poissonCtx(tau) { const K = Math.ceil(Math.max(...tau) + 12 * Math.sqrt(Math.max(...tau)) + 20), P = tau.map(t => poissonPmf(t, K)); const F = P.map(p => { const f = new Float64Array(K + 2); let s = 0; for (let x = 0; x <= K + 1; x++) { s += p[x]; f[x] = s; } return f; }); return { K, P, F, m: tau.length }; }
  /** P(winner = c) for each c, with an extra vote for candidate `plus` (−1: none) */
  function poissonWinProbs(ctx, plus) {
    const { K, P, F, m } = ctx, pm = (k, x) => (x < 0 ? 0 : k === plus ? (x >= 1 ? P[k][x - 1] : 0) : P[k][x]), cdf = (k, x) => (x < 0 ? 0 : k === plus ? (x >= 1 ? F[k][x - 1] : 0) : F[k][x]);
    const win = new Array(m).fill(0);
    for (let x = 0; x <= K + 1; x++) for (let S = 1; S < (1 << m); S++) {
      let p = 1, sz = 0; for (let k = 0; k < m && p > 0; k++) { if (S >> k & 1) { p *= pm(k, x); sz++; } else p *= cdf(k, x - 1); }
      if (p > 0) for (let k = 0; k < m; k++) if (S >> k & 1) win[k] += p / sz;
    }
    return win;
  }
  /** P(a and b tie for first, every other candidate below) */
  function poissonTie(ctx, a, b) { const { K, P, F, m } = ctx; let s = 0; for (let x = 0; x <= K; x++) { let p = P[a][x] * P[b][x]; for (let k = 0; k < m; k++) if (k !== a && k !== b) p *= x > 0 ? F[k][x - 1] : 0; s += p; } return s; }
  /** the magnitude of that tie (Myerson 2000 §§ 4–5): −(√τa − √τb)² when every other τ_c ≤ √(τa τb); with three candidates and
      τ_c above it, 3(τa τb τc)^(1/3) − τa − τb − τc (the constraint binds: a three-way near-tie). In units of log-probability. */
  function tieMagnitude(tau, a, b, flag) {
    const g = Math.sqrt(tau[a] * tau[b]), others = tau.map((t, k) => k).filter(k => k !== a && k !== b);
    if (others.every(k => tau[k] <= g)) return -Math.pow(Math.sqrt(tau[a]) - Math.sqrt(tau[b]), 2);
    if (others.length === 1) { const c = others[0]; return 3 * Math.cbrt(tau[a] * tau[b] * tau[c]) - tau[a] - tau[b] - tau[c]; }
    flag('magnitude-m'); return NaN;
  }
  function poissonGame(G, X) {
    const n = X(G.n), m = arrOf(G.candidates).length, types = arrOf(G.types).filter(isObj).map(t => ({ id: t.id, r: X(t.r), u: arrOf(t.u).map(X), vote: arrOf(G.candidates).indexOf(t.vote) }));
    return { n, m, ids: arrOf(G.candidates), types };
  }
  const poissonTau = (g, votes) => { const tau = new Array(g.m).fill(0); g.types.forEach((t, i) => { const v = votes ? votes[i] : t.vote; if (v >= 0) tau[v] += g.n * t.r; }); return tau; };
  /** the expected gain of one more vote for c to a voter with utilities u, summed over the pivot events directly (Myerson 1998 §5;
      Myerson & Weber 1993): c tied at the top with a set S then wins outright (u_c − mean u_S); c one vote behind a top set S joins the
      tie (mean u_{S∪c} − mean u_S). Products of probabilities, no differences, so a gain of 10⁻⁷⁰ keeps its digits. */
  function voteGains(ctx, u) {
    const { K, P, F, m } = ctx, U = k => u[k] || 0, gs = new Array(m).fill(0);
    for (let c = 0; c < m; c++) for (let x = 0; x <= K; x++) for (let S = 1; S < (1 << m); S++) {
      const inS = S >> c & 1; if (!inS && x === 0) continue;
      let p = 1, us = 0, sz = 0;
      for (let k = 0; k < m && p > 0; k++) {
        if (S >> k & 1) { p *= P[k][x]; us += U(k); sz++; }
        else if (k === c) p *= P[k][x - 1];
        else p *= x > 0 ? F[k][x - 1] : 0;
      }
      if (p > 0) gs[c] += p * (inS ? U(c) - us / sz : (us + U(c)) / (sz + 1) - us / sz);
    }
    return gs;
  }
  const bestOf = gs => { const mx = Math.max(...gs), tol = 1e-9 * Math.max(...gs.map(Math.abs)); return { mx, tol, zero: gs.every(v => v === 0) }; };
  function poissonIsEq(g, votes, flag) {
    const ctx = poissonCtx(poissonTau(g, votes));
    let under = false;
    const ok = g.types.every((t, i) => { const gs = voteGains(ctx, t.u), v = votes[i], b = bestOf(gs); if (b.zero) under = true; return v >= 0 && (b.zero || gs[v] >= b.mx - b.tol); });
    if (ok && under) { if (flag) flag('underflow'); return NaN; }   // a type whose every pivot is below 10⁻³⁰⁸: not certified
    return +ok;
  }

  function prepare(spec) { const cache = new Map(); for (const [src] of exprs(spec)) if (!cache.has(src)) cache.set(src, C.cx(src)); return { cache }; }
  function run(spec, env, opts) {
    const M = (spec && spec.model) || {}, codes = [], out = {}, cache = (opts && opts.prepared && opts.prepared.cache) || new Map(), seed = (opts && opts.seed) >>> 0 || 1;
    const X = v => { if (typeof v === 'number') return v; if (typeof v !== 'string') return NaN; if (!cache.has(v)) cache.set(v, C.cx(v)); return cache.get(v)(env); };
    let cur = 'model';
    const flag = code => { if (!codes.some(c => c.code === code && c.of === cur)) codes.push({ code, of: cur }); };
    const byId = (k, f) => { const mp = new Map(); for (const x of arrOf(M[k])) if (isObj(x)) mp.set(x.id, f ? f(x) : x); return mp; };
    const pops = byId('populations', x => arrOf(x.groups).map(g => ({ n: X(g.n), w: X(g.w), rel: g.rel === undefined ? 0 : X(g.rel), levels: Array.isArray(g.levels) ? g.levels.map(X) : null })));
    const popIds = arrOf(M.populations).map(x => x.id);
    const cases = byId('cases', x => { const b = has(T.CASES, x.preset) ? T.CASES[x.preset] : { kAct: 0, sAct: 1, kNot: 0, sNot: 1, means: false, redirect: false, personal: false, consent: false, driver: false };
      const r = { ...b }; for (const k of ['kAct', 'sAct', 'kNot', 'sNot']) if (x[k] !== undefined) r[k] = X(x[k]); for (const k of ['means', 'redirect', 'personal', 'consent', 'driver']) if (typeof x[k] === 'boolean') r[k] = x[k]; return r; });
    const maxims = byId('maxims', x => { const b = has(T.MAXIMS, x.preset) ? T.MAXIMS[x.preset] : { conception: false, practical: false, natural: false, will: false }; const r = { ...b }; for (const k of Object.keys(b)) if (typeof x[k] === 'boolean') r[k] = x[k]; return r; });
    const profiles = byId('profiles', x => ({ scheme: x.scheme, tol: num(X(x.tol), 0.2), traits: T.VIRT[x.scheme].filter(t => isObj(x.traits) && x.traits[t] !== undefined).map(t => [t, X(x.traits[t])]) }));
    const elections = byId('elections', x => { const ids = arrOf(x.candidates); return { m: ids.length, ids, axis: Array.isArray(x.axis) ? x.axis.map(c => ids.indexOf(c)) : null,
      ballots: arrOf(x.ballots).map(b => ({ n: X(b.n), rank: arrOf(b.rank).map(c => ids.indexOf(c)), approve: b.approve === undefined ? 1 : X(b.approve) })) }; });
    const lots = byId('lotteries', x => ({ L: arrOf(x.outcomes).map(o => ({ p: X(o.p), x: X(o.x) })), priors: Array.isArray(x.priors) ? x.priors.map(q => q.map(X)) : null }));
    const probs = byId('problems', x => {
      if (has(T.PROB, x.preset)) {
        const b = T.PROB[x.preset], acc = num(X(x.acc), b.acc), big = num(X(x.big), b.big), small = num(X(x.small), b.small);
        const u = x.preset === 'newcomb' ? [[big, 0], [big + small, small]] : x.preset === 'lesion' ? [[small - big, small], [-big, 0]] : [[-big, small], [0, 0]];
        const pAct = [[acc, 1 - acc], [1 - acc, acc]];
        return { acts: b.acts, u, pAct, pCause: Array.isArray(x.pCause) ? x.pCause.map(X) : b.pCause.slice() };
      }
      return { acts: x.acts, u: x.u.map(r => r.map(X)), pAct: x.pAct.map(r => r.map(X)), pCause: x.pCause.map(X) };
    });
    const games = byId('games', x => {
      if (has(T.GAMES, x.preset)) {
        const g = T.GAMES[x.preset];
        if (g.pay) return { pay: g.pay.map(r => r.map(c => c.slice())) };
        const [t0, r0, p0, s0] = g.TRPS, Tt = num(X(x.T), t0), R = num(X(x.R), r0), Pp = num(X(x.P), p0), S = num(X(x.S), s0);
        return { pay: [[[R, R], [S, Tt]], [[Tt, S], [Pp, Pp]]] };
      }
      return { pay: x.pay.map(r => r.map(c => c.map(X))) };
    });
    const beliefs = byId('beliefs', x => ({ h: X(x.h), eh: X(x.eh), enh: X(x.enh) }));
    const know = byId('knowledge', x => { const b = has(T.KCASES, x.preset) ? T.KCASES[x.preset] : {}; const r = { ...b }; for (const k of T.KF.concat(['intuition'])) if (typeof x[k] === 'boolean') r[k] = x[k]; return r; });
    const exps = byId('experiments', x => { const te = has(T.TE, x.te) ? T.TE[x.te] : { o: [], p: {} }; return { o: Array.isArray(x.options) ? x.options : te.o, p: { ...te.p, ...(isObj(x.positions) ? x.positions : {}) } }; });
    const thinkers = new Map(Object.entries(T.THINKERS).map(([k, v]) => [k, { b: v.b, d: v.d, tr: v.tr, in: v.in.slice() }]));
    for (const x of arrOf(M.thinkers)) if (isObj(x)) { const b = thinkers.get(x.id) || { b: NaN, d: NaN, tr: x.trad, in: [] };
      thinkers.set(x.id, { b: x.born !== undefined ? X(x.born) : b.b, d: x.died !== undefined ? X(x.died) : b.d, tr: x.trad || b.tr, in: Array.isArray(x.infl) ? x.infl.slice() : b.in, label: x.label }); }
    const args = byId('arguments');
    const infs = byId('inferences');
    const bargs = byId('bargains', x => ({ pts: x.pts.map(p => p.map(X)), d: Array.isArray(x.d) ? x.d.map(X) : [0, 0] }));
    const rcodes = byId('ruleCodes', x => arrOf(x.rules).filter(isObj).map(r => ({ id: r.id, b: X(r.b), c: r.c === undefined ? 0 : X(r.c), k: r.k === undefined ? 0 : X(r.k), x: r.x === undefined ? 0 : X(r.x) })));
    const streams = byId('streams', x => ({ head: arrOf(x.head).map(X), cycle: arrOf(x.cycle).map(X) }));
    const ubu = byId('ubuntu', x => ({ wI: x.wI === undefined ? 1 : X(x.wI), wS: x.wS === undefined ? 1 : X(x.wS), options: arrOf(x.options).filter(isObj).map(op => ({ id: op.id, effects: arrOf(op.effects).filter(isObj).map(e => ({ identity: e.identity === undefined ? 0 : X(e.identity), solidarity: e.solidarity === undefined ? 0 : X(e.solidarity), byAgent: !!e.byAgent })) })) }));
    const rcOk = id => { const r = rcodes.get(id); if (!r) return null; if (r.some(q => ![q.b, q.c, q.k, q.x].every(fin))) { flag('value'); return null; } if (r.some(q => q.k < 0)) { flag('range'); return null; } return r; };
    const rate = o => { const a = o.rate === undefined ? 0.9 : X(o.rate); if (!(a >= 0 && a <= 1)) { flag('range'); return NaN; } return a; };   // Hooker 2000: 90 %
    const idealAt = a => { const ids = arrOf(M.ruleCodes).filter(isObj).map(x => x.id); let b = -1, bv = -Infinity, tie = false; ids.forEach((id, i) => { const r = rcOk(id); if (!r) return; const v = codeValue(r, a); if (v > bv + 1e-12) { b = i; bv = v; tie = false; } else if (Math.abs(v - bv) <= 1e-12) tie = true; }); if (tie) flag('tie'); return b; };
    const stOk = id => { const st = streams.get(id); if (!st) return null; if (![...st.head, ...st.cycle].every(fin)) { flag('value'); return null; } return st; };
    const pairOf = o => { const a = stOk(o.a), b = stOk(o.b); return a && b ? { a, b, q: streamPair(a, b, flag) } : null; };
    const ubOk = id => { const u = ubu.get(id); if (!u) return null; if (![u.wI, u.wS].every(fin) || u.options.some(op => op.effects.some(e => !fin(e.identity) || !fin(e.solidarity)))) { flag('value'); return null; } if (u.options.some(op => op.effects.some(e => Math.abs(e.identity) > 1 || Math.abs(e.solidarity) > 1))) flag('range'); return u; };
    const gameMethod = o => o.method || 'plurality';
    const pgames = byId('poisson', x => poissonGame(x, X));
    const pgOk = id => { const g = pgames.get(id); if (!g) return null; if (!(fin(g.n) && g.n >= 0) || g.types.some(t => !(fin(t.r) && t.r >= 0) || !t.u.every(fin))) { flag('value'); return null; }
      if (g.n > 1e5) { flag('budget'); return null; } const tau = poissonTau(g), K = Math.max(...tau) + 12 * Math.sqrt(Math.max(...tau)) + 20; if (K * (1 << g.m) * g.m * g.m * (g.types.length + 1) > 4e7) { flag('budget'); return null; } return g; };
    const pgCtx = new Map(), ctxOf = g => { const k = JSON.stringify(poissonTau(g)); if (!pgCtx.has(k)) pgCtx.set(k, poissonCtx(poissonTau(g))); return pgCtx.get(k); };
    const eqCache = new Map();
    const eqsOf = o => {   // the equilibria of a bimatrix game (support enumeration, or the one Lemke–Howson reaches from the label)
      const G = games.get(o.game); if (!G) return null; const k = o.game + '|' + (o.solver || 'support') + '|' + (o.label || 0);
      if (eqCache.has(k)) { const c = eqCache.get(k); c.cs.forEach(flag); return c.e; }
      const cs = [], fl = c => { cs.push(c); flag(c); };
      const A = G.pay.map(r => r.map(c => c[0])), B = G.pay.map(r => r.map(c => c[1]));
      if (![...A.flat(), ...B.flat()].every(fin) || G.pay.some(r => r.length !== A[0].length)) { flag('value'); return null; }
      let e; if (o.solver === 'lemke') { const L = Math.floor(X(o.label === undefined ? 0 : o.label)); if (!(L >= 0 && L < A.length + A[0].length)) { flag('range'); return null; } e = [lemkeHowson(A, B, L)].filter(Boolean); }
      else { e = supportEnum(A, B); if (e.some(q => q.deg)) fl('degenerate'); }
      if (!e.length) fl('none'); eqCache.set(k, { e, cs }); return e;
    };
    const mvCache = new Map();
    const mixedOf = o => {
      const E = elect(o.election); if (!E) return null; const nm = o.method || 'plurality', k = [o.election, nm, o.util || 'borda', o.solver || 'support'].join('|');
      if (!['plurality', 'antiplurality'].includes(nm)) { flag('method'); return null; }
      if (!mvCache.has(k)) { const cs = [], res = mixedVote(E, nm, o.solver, o.util, c => cs.push(c)); mvCache.set(k, { res, cs }); }
      const { res: r, cs } = mvCache.get(k); cs.forEach(flag); if (!r.length) flag('none'); return { E, r };
    };
    const pick = (list, o) => { const i = o.eq === undefined ? 0 : Math.floor(X(o.eq)); if (!(i >= 0 && i < list.length)) { flag('range'); return null; } return list[i]; };
    let tour, soritesR;
    const getTour = () => (tour === undefined ? (tour = isObj(M.tournament) ? tournament(spec, games, X, seed, flag) : null) : tour);
    const getSor = () => (soritesR === undefined ? (soritesR = isObj(M.sorites) ? sorites(M.sorites, X) : null) : soritesR);
    const RPof = o => { const r = {}; for (const k of ['gamma', 'c', 'tau', 'delta', 'k']) if (o[k] !== undefined) r[k] = X(o[k]); return r; };
    const uOf = o => { const U = isObj(M.utility) ? M.utility : {}; return utility(o.u || U.u, X(o.ua !== undefined ? o.ua : U.ua), X(o.w0 !== undefined ? o.w0 : U.w0)); };
    const lotOk = id => { const l = lots.get(id); if (!l) return null; if (l.L.some(o => !fin(o.p) || !fin(o.x) || o.p < 0)) { flag('value'); return null; } if (Math.abs(sum(l.L.map(o => o.p)) - 1) > 1e-9) { flag('probsum'); return null; } return l; };
    const elect = id => { const e = elections.get(id); if (!e) return null; if (e.ballots.some(b => !fin(b.n) || b.n < 0)) { flag('value'); return null; } return { ...e, ballots: e.ballots.filter(b => b.n > 0) }; };
    const cost = { n: 0 };
    const check = v => { if (typeof v === 'number' && !fin(v) && v === v) flag('infinite'); return v; };

    function scalar(o) {
      switch (o.of) {
        case 'welfare': { const g = pops.get(o.population); return g ? value(g, o.rule, RPof(o), flag) : NaN; }
        case 'compare': { const a = pops.get(o.a), b = pops.get(o.b); const s = a && b ? compare(a, b, o.rule, RPof(o), flag) : NaN; if (s === 0) flag('tie'); return s; }
        case 'best': {
          if (!popIds.length) return NaN; let b = 0, tie = false;
          for (let i = 1; i < popIds.length; i++) { const s = compare(pops.get(popIds[i]), pops.get(popIds[b]), o.rule, RPof(o), flag); if (!fin(s)) return NaN; if (s > 0) { b = i; tie = false; } else if (s === 0) tie = true; }
          if (tie) flag('tie'); return b;
        }
        case 'paradox': return paradox(o.paradox, o.rule, RPof(o), flag);
        case 'verdict': { const c = cases.get(o.case); return c ? verdict(c, o.principle, X(o.T)) : NaN; }
        case 'permits': { const c = cases.get(o.case); return c ? T.PRINCIPLES.filter(p => verdict(c, p, X(o.T)) >= 1).length : NaN; }
        case 'ful': { const mx = maxims.get(o.maxim); return mx ? ful(mx, o.reading) : NaN; }
        case 'trait': { const p = profiles.get(o.profile); if (!p) return NaN; const t = p.traits.find(x => x[0] === o.trait); if (!t) { flag('missing'); return NaN; } const x = t[1]; if (!(x >= -1 && x <= 1)) { flag('range'); return NaN; } return Math.abs(x) <= p.tol ? 0 : x < 0 ? -1 : 1; }   // NE II.6–7
        case 'virtue': { const p = profiles.get(o.profile); if (!p || !p.traits.length) return NaN; const xs = p.traits.map(t => t[1]); if (xs.some(x => !(x >= -1 && x <= 1))) { flag('range'); return NaN; } return sum(xs.map(x => 1 - Math.abs(x))) / xs.length; }
        case 'winner': { const E = elect(o.election); if (!E) return NaN; const w = method(E, o.method, flag, cost).w; if (w < 0) flag('tie'); return w; }
        case 'score': { const E = elect(o.election); if (!E) return NaN; const r = method(E, o.method, flag, cost); return r.s ? r.s[E.ids.indexOf(o.cand)] : NaN; }
        case 'margin': { const E = elect(o.election); if (!E) return NaN; const P = pairwise(E), a = E.ids.indexOf(o.a), b = E.ids.indexOf(o.b); return P[a][b] - P[b][a]; }
        case 'condorcet': { const E = elect(o.election); if (!E) return NaN; const P = pairwise(E); return o.loser ? condLoser(P, E.m) : condWinner(P, E.m); }
        case 'cycle': { const E = elect(o.election); if (!E) return NaN; const comp = scc(pairwise(E), E.m); return +comp.some((c, i) => comp.indexOf(c) !== i); }
        case 'smith': { const E = elect(o.election); return E ? smithSet(pairwise(E), E.m).length : NaN; }
        case 'criterion': { const E = elect(o.election); if (!E) return NaN; const E2 = o.other ? elect(o.other) : null; return criterion(E, o.method, o.criterion, flag, cost, E2); }
        case 'manipulable': { const E = elect(o.election); return E ? manipulable(E, o.method, flag, cost) : NaN; }
        case 'singlePeaked': { const E = elect(o.election); return E ? singlePeaked(E, E.axis) : NaN; }
        case 'ev': { const l = lotOk(o.lottery); return l ? evOf(l.L) : NaN; }
        case 'eu': { const l = lotOk(o.lottery); const v = l ? euOf(l.L, uOf(o)) : NaN; if (l && !fin(v)) flag('domain'); return v; }
        case 'ce': { const l = lotOk(o.lottery); const v = l ? ceOf(l.L, uOf(o)) : NaN; if (l && !fin(v)) flag('domain'); return v; }
        case 'premium': { const l = lotOk(o.lottery); const v = l ? evOf(l.L) - ceOf(l.L, uOf(o)) : NaN; if (l && !fin(v)) flag('domain'); return v; }
        case 'cpt': { const l = lotOk(o.lottery); return l ? cpt(l.L, { alpha: X(o.alpha), beta: X(o.beta), lam: X(o.lam), gp: X(o.gp), gm: X(o.gm), ref: X(o.ref) }) : NaN; }
        case 'meu': { const l = lotOk(o.lottery); if (!l) return NaN; if (l.priors && l.priors.some(q => Math.abs(sum(q) - 1) > 1e-9 || q.some(v => !(v >= 0)))) { flag('probsum'); return NaN; } return meu(l.L, l.priors, uOf(o), X(o.alpha)); }
        case 'choose': {
          const a = lotOk(o.a), b = lotOk(o.b); if (!a || !b) return NaN;
          const u = uOf(o), al = num(X(o.alpha), 0.5), eps = num(X(o.eps), 1e-6), xs = l => l.L.map(q => q.x);
          let va, vb;
          switch (o.rule) {
            case 'ev': va = evOf(a.L); vb = evOf(b.L); break;
            case 'eu': va = euOf(a.L, u); vb = euOf(b.L, u); break;
            case 'cpt': va = cpt(a.L, {}); vb = cpt(b.L, {}); break;
            case 'meu': va = meu(a.L, a.priors, u, num(X(o.alpha), 1)); vb = meu(b.L, b.priors, u, num(X(o.alpha), 1)); break;
            case 'maxmin': va = Math.min(...xs(a)); vb = Math.min(...xs(b)); break;                 // Wald 1950
            case 'maximax': va = Math.max(...xs(a)); vb = Math.max(...xs(b)); break;
            case 'hurwicz': va = al * Math.max(...xs(a)) + (1 - al) * Math.min(...xs(a)); vb = al * Math.max(...xs(b)) + (1 - al) * Math.min(...xs(b)); break;   // Hurwicz 1951
            case 'laplace': va = sum(xs(a)) / a.L.length; vb = sum(xs(b)) / b.L.length; break;
            case 'discount': va = sum(a.L.filter(q => q.p >= eps).map(q => q.p * q.x)); vb = sum(b.L.filter(q => q.p >= eps).map(q => q.p * q.x)); break;   // Monton 2019
            case 'regret': {             // Savage 1951: states aligned by position
              if (a.L.length !== b.L.length) { flag('states'); return NaN; }
              va = -Math.max(...a.L.map((q, i) => Math.max(q.x, b.L[i].x) - q.x)); vb = -Math.max(...b.L.map((q, i) => Math.max(q.x, a.L[i].x) - q.x)); break;
            }
            default: return NaN;
          }
          if (!fin(va) || !fin(vb)) { flag('domain'); return NaN; }
          const s = sgn(va, vb); if (s === 0) flag('tie'); return s;
        }
        case 'commonCons': {             // Allais 1953: EU ranks a vs b as c vs d when P(a) − P(b) = P(c) − P(d) outcome by outcome
          const ls = [o.a, o.b, o.c, o.d].map(lotOk); if (ls.some(l => !l)) return NaN;
          const xs = [...new Set(ls.flatMap(l => l.L.map(q => q.x)))], mass = (l, x) => sum(l.L.filter(q => q.x === x).map(q => q.p));
          return +xs.every(x => Math.abs(mass(ls[0], x) - mass(ls[1], x) - (mass(ls[2], x) - mass(ls[3], x))) < 1e-9);
        }
        case 'stpete': {
          const R = Math.round(num(X(o.rounds), 100)), bank = num(X(o.bank), Infinity); if (!(R >= 1 && R <= 1000) || !(bank > 0)) { flag('range'); return NaN; }
          const L = stPete(R, bank, null), u = uOf(o);
          if (o.what === 'ev') { if (bank === Infinity) flag('truncated'); return evOf(L); }
          if (o.what === 'eu') return euOf(L, u);
          const v = euOf(L, u); let lo = 0, hi = Math.min(bank, Math.pow(2, R));
          for (let i = 0; i < 300 && hi - lo > 1e-12 * Math.max(1, hi); i++) { const mid = (lo + hi) / 2; if (u(mid) < v) lo = mid; else hi = mid; }
          return (lo + hi) / 2;
        }
        case 'dtv': {                    // Jeffrey 1965 (evidential) · Gibbard & Harper 1978, Lewis 1981 (causal)
          const p = probs.get(o.problem); if (!p) return NaN;
          const val = i => sum(p.u[i].map((u, s) => u * (o.theory === 'edt' ? p.pAct[i][s] : p.pCause[s])));
          if (o.act) return val(p.acts.indexOf(o.act));
          const vs = p.acts.map((_, i) => val(i)), mx = Math.max(...vs), top = vs.map((v, i) => (sgn(v, mx) === 0 ? i : -1)).filter(i => i >= 0);
          if (top.length > 1) flag('tie'); return top.length === 1 ? top[0] : -1;
        }
        case 'dominant': {
          const p = probs.get(o.problem); if (!p) return NaN;
          for (let a = 0; a < p.acts.length; a++) if (p.acts.every((_, b) => b === a || (p.u[a].every((v, s) => v >= p.u[b][s]) && p.u[a].some((v, s) => v > p.u[b][s])))) return a;
          return -1;
        }
        case 'nash': { const G = games.get(o.game); return G ? nashCells(G).length : NaN; }
        case 'isNash': case 'paretoCell': {
          const G = games.get(o.game); if (!G) return NaN; const r = X(o.r), c = X(o.c);
          if (!(Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < G.pay.length && c < G.pay[0].length)) { flag('range'); return NaN; }
          return o.of === 'isNash' ? +nashCells(G).some(([a, b]) => a === r && b === c) : paretoCell(G, r, c);
        }
        case 'mixed': { const G = games.get(o.game); if (!G) return NaN; const v = mixed(G, o.player || 1); if (!fin(v)) flag('no-mixed'); return v; }
        case 'dominantStrat': { const G = games.get(o.game); return G ? dominantStrat(G, o.player || 1) : NaN; }
        case 'grimDelta': {              // Friedman 1971: cooperation by GRIM is an equilibrium iff δ ≥ (T − R)/(T − P)
          const G = games.get(o.game); if (!G || !symmetric(G)) { flag('asymmetric'); return NaN; }
          const R = G.pay[0][0][0], S = G.pay[0][1][0], Tt = G.pay[1][0][0], Pp = G.pay[1][1][0];
          if (!(Tt > R && R > Pp && Pp > S)) flag('not-pd');
          return (Tt - R) / (Tt - Pp);
        }
        case 'ipd': {
          const tr = getTour(); if (!tr) return NaN; const i = tr.S.indexOf(o.strategy);
          return o.what === 'mean' ? tr.mean[i] : o.what === 'rank' ? tr.rank[i] : tr.shares[tr.shares.length - 1][i];
        }
        case 'confirm': { const b = beliefs.get(o.belief); if (!b) return NaN; const v = confirm(b.h, b.eh, b.enh, o.measure); if (Number.isNaN(v)) flag('degenerate'); return check(v); }
        case 'dutch': { const cr = o.cr.map(X); if (cr.some(v => !fin(v))) return NaN; return sum(cr) - 1; }   // de Finetti 1937
        case 'knows': { const k = know.get(o.case); return k ? knows(k, o.analysis) : NaN; }
        case 'fits': { let n = 0; for (const k of know.values()) if (typeof k.intuition === 'boolean' && knows(k, o.analysis) === +k.intuition) n++; return n; }
        case 'sorites': {
          const S = getSor(); if (!S) { flag('range'); return NaN; }
          const n = S.n, inP = i => i >= S.plo && i <= S.phi;
          switch (o.what) {
            case 'condMin': return Math.min(...S.cond);
            case 'bound': { const k = Math.round(num(X(o.k), n - 1)); if (!(k >= 0 && k < n)) { flag('range'); return NaN; } return S.bound[k]; }
            case 'superTrue': return S.v.filter((_, i) => i > S.phi).length;     // Fine 1975
            case 'superFalse': return S.v.filter((_, i) => i < S.plo).length;
            case 'indet': return S.v.filter((_, i) => inP(i)).length;
            case 'cutoff': return Math.floor(S.cut);                            // Williamson 1994: there is one; the model names it
            case 'value': { const i = Math.round(num(X(o.i), 0)); if (!(i >= 0 && i < n)) { flag('range'); return NaN; } return S.v[i]; }
            default: return NaN;
          }
        }
        case 'lottery': {                // Kyburg 1961; a Lockean threshold t (Foley 1993)
          const n = X(o.n), t = X(o.t); if (!(n >= 2 && Number.isInteger(n) && t > 0 && t <= 1)) { flag('range'); return NaN; }
          const each = 1 - 1 / n >= t;
          return o.what === 'believed' ? (each ? n : 0) : o.what === 'conj' ? 0 : +each;
        }
        case 'preface': {                // Makinson 1965
          const n = X(o.n), r = X(o.r), t = X(o.t); if (!(n >= 1 && r > 0 && r < 1 && t > 0 && t <= 1)) { flag('range'); return NaN; }
          return o.what === 'conj' ? Math.pow(r, n) : Math.floor(Math.log(t) / Math.log(r) + 1e-12);
        }
        case 'beauty': {                 // Elga 2000 (thirder), Lewis 2001 (halfer), double halfers (Meacham 2008; Pust 2012)
          const w = num(X(o.wakes), 2); if (!(w >= 1)) { flag('range'); return NaN; }
          if (o.monday) return o.theory === 'halfer' ? w / (w + 1) : 1 / 2;   // Lewis: (1/2) / (1/2 + 1/(2w)); thirders and double halfers 1/2
          return o.theory === 'thirder' ? 1 / (1 + w) : 1 / 2;
        }
        case 'teAnswer': { const e = exps.get(o.experiment); if (!e || !has(e.p, o.position)) return NaN; return e.o.indexOf(e.p[o.position]); }
        case 'teCount': { const e = exps.get(o.experiment); if (!e) return NaN; const i = X(o.option); if (!(Number.isInteger(i) && i >= 0 && i < e.o.length)) { flag('range'); return NaN; } return Object.values(e.p).filter(v => v === e.o[i]).length; }
        case 'influence': {              // the shortest chain a → … → b along "influenced" (BFS)
          if (o.a === o.b) return 0; const dist = new Map([[o.a, 0]]), q = [o.a];
          while (q.length) { const x = q.shift(); for (const [k, v] of thinkers) if (v.in.includes(x) && !dist.has(k)) { dist.set(k, dist.get(x) + 1); if (k === o.b) return dist.get(k); q.push(k); } }
          return -1;
        }
        case 'overlap': { const a = thinkers.get(o.a), b = thinkers.get(o.b); if (!a || !b) return NaN; return Math.max(0, Math.min(a.d, b.d) - Math.max(a.b, b.b)); }
        case 'valid': case 'counter': case 'form': { const A = args.get(o.argument); const r = A ? argument(A, flag) : null; return r ? (o.of === 'valid' ? r.valid : o.of === 'counter' ? r.counters : r.form) : NaN; }
        case 'hetu': { const h = infs.get(o.inference); if (!h) return NaN; const r = hetu(h); return o.what === 'cell' ? r.cell : r.verdict; }
        case 'koti': { const t = X(o.t), f = X(o.f), e = o.e === undefined ? 0 : X(o.e); if (![t, f, e].every(fin)) return NaN; return koti(t !== 0, f !== 0, e !== 0); }
        case 'bhanga': { const a = X(o.asti), n = X(o.nasti), v = X(o.avak); if (![a, n, v].every(fin)) return NaN; return bhanga(a !== 0, n !== 0, v !== 0); }
        case 'bargain': {
          const b = bargs.get(o.bargain); if (!b || b.pts.some(p => !p.every(fin)) || !b.d.every(fin)) return NaN;
          const r = bargain(b.pts, b.d, o.solution); if (!fin(r[0])) flag('infeasible'); return r[o.coord || 0];
        }
        // ----- rule consequentialism at an acceptance rate (Hooker 2000; Ridge 2006) -----
        case 'codeValue': { const r = rcOk(o.code), a = rate(o); if (!r || !fin(a)) return NaN; return o.reading === 'variable' ? RIDGE(r) : codeValue(r, a); }
        case 'ruleValue': { const r = rcOk(o.code), a = rate(o); if (!r || !fin(a)) return NaN; const q = r.find(x => x.id === o.rule); if (!q) { flag('missing'); return NaN; } return ruleValue(q, a); }
        case 'idealCode': {
          if (o.reading === 'variable') { const ids = arrOf(M.ruleCodes).filter(isObj).map(x => x.id); let b = -1, bv = -Infinity; ids.forEach((id, i) => { const r = rcOk(id); if (r && RIDGE(r) > bv + 1e-12) { b = i; bv = RIDGE(r); } }); return b; }
          const a = rate(o); return fin(a) ? idealAt(a) : NaN;
        }
        case 'bestRate': { const r = rcOk(o.code); if (!r) return NaN; let b = 0, bv = -Infinity; for (let i = 0; i <= 100; i++) { const v = codeValue(r, i / 100); if (v > bv + 1e-12) { bv = v; b = i / 100; } } return b; }
        case 'idealShift': { const a = rate(o); if (!fin(a)) return NaN; const x = idealAt(a), y = idealAt(1); return x < 0 || y < 0 ? NaN : +(x !== y); }
        // ----- strategic voting (Farquharson 1969; Myerson & Weber 1993; Gibbard 1973; Satterthwaite 1975) -----
        case 'voteNash': case 'voteNashUndominated': case 'voteNashWinners': case 'sincereNash': {
          const E = elect(o.election); if (!E) return NaN; const g = voteGame(E, gameMethod(o), flag); if (!g) return NaN;
          return o.of === 'voteNash' ? g.ne : o.of === 'voteNashUndominated' ? g.und : o.of === 'voteNashWinners' ? g.winners : g.sincereNE;
        }
        case 'gsManipulable': case 'manipulators': {
          const E = elect(o.election); if (!E) return NaN; const vs = voters(E, flag); if (!vs) return NaN; if (E.m > 5) { flag('too-many'); return NaN; }
          const k = gsProfile(E.m, E.ids, vs, o.method, { n: 0 }); return o.of === 'gsManipulable' ? +(k > 0) : k;
        }
        case 'gsExists': return gsExists(o.m || 3, o.n || 3, o.method, flag);
        // ----- mixed equilibria (von Stengel 2007; Lemke & Howson 1964) and mixed voting equilibria between ballot groups -----
        case 'equilibria': { const e = eqsOf(o); return e ? e.length : NaN; }
        case 'eqProb': case 'eqPayoff': {
          const e = eqsOf(o); if (!e) return NaN; const q = pick(e, o); if (!q) return NaN; const pl = o.player === 2 ? 2 : 1;
          if (o.of === 'eqPayoff') { if (o.solver === 'lemke') { const G = games.get(o.game); let s = 0; q.x.forEach((a, i) => q.y.forEach((b, j) => { s += a * b * G.pay[i][j][pl - 1]; })); return s; } return pl === 1 ? q.u : q.v; }
          const v = pl === 1 ? q.x : q.y, j = Math.floor(X(o.strategy)); if (!(j >= 0 && j < v.length)) { flag('range'); return NaN; } return v[j];
        }
        case 'mixedVoteCount': { const R = mixedOf(o); return R ? R.r.length : NaN; }
        case 'mixedVoteProb': case 'mixedWinProb': {
          const R = mixedOf(o); if (!R) return NaN; const q = pick(R.r, o); if (!q) return NaN; const c = R.E.ids.indexOf(o.candidate); if (c < 0) { flag('missing'); return NaN; }
          if (o.of === 'mixedWinProb') return q.win[c];
          const g = Math.floor(X(o.group === undefined ? 0 : o.group)); if (!(g >= 0 && g < q.p.length)) { flag('range'); return NaN; } return q.p[g][c];
        }
        // ----- Poisson voting games (Myerson 1998, 2000; Myerson & Weber 1993) -----
        case 'expectedVotes': { const g = pgOk(o.poisson); if (!g) return NaN; const c = g.ids.indexOf(o.candidate); if (c < 0) { flag('missing'); return NaN; } return poissonTau(g)[c]; }
        case 'pivotProb': case 'pivotMagnitude': {
          const g = pgOk(o.poisson); if (!g) return NaN; const a = g.ids.indexOf(o.a), b = g.ids.indexOf(o.b); if (a < 0 || b < 0 || a === b) { flag('missing'); return NaN; }
          return o.of === 'pivotProb' ? poissonTie(ctxOf(g), a, b) : tieMagnitude(poissonTau(g), a, b, flag);
        }
        case 'poissonWinProb': { const g = pgOk(o.poisson); if (!g) return NaN; const c = g.ids.indexOf(o.candidate); if (c < 0) { flag('missing'); return NaN; } return poissonWinProbs(ctxOf(g), -1)[c]; }
        case 'voteGain': case 'bestVote': {
          const g = pgOk(o.poisson); if (!g) return NaN; const t = g.types.find(x => x.id === o.type); if (!t) { flag('missing'); return NaN; }
          const gs = voteGains(ctxOf(g), t.u);
          if (o.of === 'voteGain') { const c = g.ids.indexOf(o.candidate); if (c < 0) { flag('missing'); return NaN; } return gs[c]; }
          const q = bestOf(gs); if (q.zero) { flag('underflow'); return NaN; } const b = gs.findIndex(v => v >= q.mx - q.tol); if (gs.filter(v => v >= q.mx - q.tol).length > 1) flag('tie'); return b;
        }
        case 'poissonEquilibrium': { const g = pgOk(o.poisson); if (!g) return NaN; if (g.types.some(t => t.vote < 0)) { flag('missing'); return NaN; } return poissonIsEq(g, g.types.map(t => t.vote), flag); }
        // ----- infinite ethics -----
        case 'overtaking': case 'catchingUp': { const P = pairOf(o); if (!P || !P.q) return NaN; return o.of === 'overtaking' ? overtake(P.q, flag) : catchUp(P.q, flag); }
        case 'truncCompare': { const a = stOk(o.a), b = stOk(o.b), Tn = Math.floor(X(o.T)); if (!a || !b) return NaN; if (!(Tn >= 1 && Tn <= 1e6)) { flag('range'); return NaN; } let s = 0; for (let t = 0; t < Tn; t++) s += streamAt(a, t) - streamAt(b, t); return Math.sign(s); }
        case 'discounted': {
          const st = stOk(o.stream), d = X(o.delta); if (!st) return NaN; if (!(d >= 0 && d < 1)) { flag('range'); return NaN; }
          let v = 0, f = 1; for (const u of st.head) { v += f * u; f *= d; } let c = 0, g = 1; for (const u of st.cycle) { c += g * u; g *= d; } return v + f * c / (1 - g);
        }
        case 'limitAverage': { const st = stOk(o.stream); return st ? sum(st.cycle) / st.cycle.length : NaN; }
        case 'paretoDominates': { const P = pairOf(o); if (!P || !P.q) return NaN; let ge = true, gt = false; for (let t = 0; t < P.q.n; t++) { if (P.q.d[t] < -EPS) ge = false; if (P.q.d[t] > EPS) gt = true; } return +(ge && gt); }
        case 'finiteAnonymous': {
          const P = pairOf(o); if (!P || !P.q) return NaN; if (P.q.mx - P.q.mn > EPS || Math.abs(P.q.per) > EPS || P.q.d.slice(P.q.H).some(x => Math.abs(x) > EPS)) return 0;
          const A = [], B = []; for (let t = 0; t < P.q.H; t++) { A.push(streamAt(P.a, t)); B.push(streamAt(P.b, t)); } A.sort((x, y) => x - y); B.sort((x, y) => x - y); return +A.every((x, i) => Math.abs(x - B[i]) <= EPS);
        }
        case 'infiniteAnonymous': { const a = stOk(o.a), b = stOk(o.b); return a && b ? +sameCounts(a, b) : NaN; }
        case 'infiniteConflict': {
          const P = pairOf(o); if (!P || !P.q) return NaN; let ge = true, gt = false; for (let t = 0; t < P.q.n; t++) { if (P.q.d[t] < -EPS) ge = false; if (P.q.d[t] > EPS) gt = true; }
          const c = +((ge && gt) && sameCounts(P.a, P.b)); if (c) flag('impossibility'); return c;
        }
        // ----- Metz's ubuntu -----
        case 'ubuntuScore': case 'ubuntuPermissible': {
          const u = ubOk(o.case); if (!u) return NaN; const op = u.options.find(x => x.id === o.option); if (!op) { flag('missing'); return NaN; }
          return o.of === 'ubuntuPermissible' ? +ubuntuOk(op) : ubuntuScore(op, u.wI, u.wS);
        }
        case 'ubuntuBest': {
          const u = ubOk(o.case); if (!u) return NaN; let b = -1, bv = -Infinity, tie = false;
          u.options.forEach((op, i) => { if (o.reading === 'honour' && !ubuntuOk(op)) return; const v = ubuntuScore(op, u.wI, u.wS); if (v > bv + 1e-12) { b = i; bv = v; tie = false; } else if (Math.abs(v - bv) <= 1e-12) tie = true; });
          if (b < 0) flag('none-permissible'); if (tie) flag('tie'); return b;
        }
        default: return NaN;
      }
    }
    function series(o) {
      switch (o.of) {
        case 'scores': { const E = elect(o.election); if (!E) return []; return method(E, o.method, flag, cost).s || []; }
        case 'match': {
          const tr = getTour(); if (!tr) return []; const r = match(o.a, o.b, tr.A, tr.rounds, tr.noise, rngFor(seed, 'match|' + o.a + '|' + o.b));
          const pp = o.player === 2 ? r.pb : r.pa, cum = []; let s = 0; for (const v of pp) { s += v; cum.push(s); } return cum;
        }
        case 'shares': { const tr = getTour(); if (!tr) return []; const i = tr.S.indexOf(o.strategy); return i < 0 ? [] : tr.shares.map(x => x[i]); }
        case 'degree': { const S = getSor(); return S ? S.v.slice() : []; }
        case 'bound': { const S = getSor(); return S ? S.bound.slice() : []; }
        case 'sorted': { const g = pops.get(o.population); return g ? g.map(x => x.w).sort((a, b) => a - b) : []; }
        case 'codeCurve': { const r = rcOk(o.code); return r ? Array.from({ length: 101 }, (_, i) => codeValue(r, i / 100)) : []; }
        case 'rateAxis': return Array.from({ length: 101 }, (_, i) => i / 100);
        case 'partialSums': { const a = stOk(o.a), b = stOk(o.b), Tn = Math.min(2000, Math.floor(X(o.T))); if (!a || !b || !(Tn >= 1)) return []; const out = []; let s = 0; for (let t = 0; t < Tn; t++) { s += streamAt(a, t) - streamAt(b, t); out.push(s); } return out; }
        default: return [];
      }
    }
    function scene(o) {
      switch (o.of) {
        case 'majority': {               // candidates on a circle, an arrow for every strict majority; arrows inside a cycle 'bad'
          const E = elect(o.election); if (!E) return null; const P = pairwise(E), m = E.m, comp = scc(P, m), cw = condWinner(P, m), sc = C.scene([-1.4, 1.4, -1.4, 1.4]);
          const at = i => [Math.cos(Math.PI / 2 - 2 * Math.PI * i / m), Math.sin(Math.PI / 2 - 2 * Math.PI * i / m)];
          for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
            if (a === b) continue; const [x1, y1] = at(a), [x2, y2] = at(b), sh = 0.14;
            const ax = x1 + (x2 - x1) * sh, ay = y1 + (y2 - y1) * sh, bx = x2 - (x2 - x1) * sh, by = y2 - (y2 - y1) * sh;
            if (P[a][b] > P[b][a]) { const cyc = comp[a] === comp[b]; sc.seg(ax, ay, bx, by, { arrow: true, c: cyc ? 'bad' : 'base', w: 2, v: P[a][b] - P[b][a] }); }
            else if (P[a][b] === P[b][a] && a < b) sc.seg(ax, ay, bx, by, { c: 'muted', dash: true });
          }
          for (let i = 0; i < m; i++) { const [x, y] = at(i); sc.pt(x, y, { r: 8, c: i === cw ? 'hi' : 'info' }); sc.txt(x * 1.22, y * 1.22, { s: String(E.ids[i]).slice(0, 64), anchor: 'middle' }); }
          return sc.done();
        }
        case 'parfit': {                 // Parfit's diagrams (1984 ch. 19): width ∝ the number of people, height = welfare
          const ps = o.populations.map(id => pops.get(id)).filter(Boolean); if (!ps.length) return null;
          const Ns = ps.map(g => sum(g.filter(x => x.n > 0).map(x => x.n))), Nmax = Math.max(...Ns, 1e-300), wmax = Math.max(1e-300, ...ps.flat().map(x => Math.abs(x.w)));
          const H = 4, colW = 3, gap = 1, sc = C.scene([-0.5, ps.length * (colW + gap), -H * 1.15, H * 1.25]);
          ps.forEach((g, k) => {
            const x0 = k * (colW + gap), wTot = colW * Ns[k] / Nmax; let x = x0;
            for (const grp of g.filter(q => q.n > 0).sort((a, b) => b.w - a.w)) { const wd = wTot * grp.n / Ns[k], h = H * grp.w / wmax; sc.poly([x, 0, x + wd, 0, x + wd, h, x, h], { closed: true, fill: true, c: grp.w >= 0 ? 'info' : 'bad' }); x += wd; }
            sc.txt(x0 + colW / 2, H * 1.12, { s: String(o.populations[k]).slice(0, 64), anchor: 'middle' });
          });
          sc.seg(-0.5, 0, ps.length * (colW + gap), 0, { c: 'muted' });
          return sc.done();
        }
        case 'virtues': {                // the doctrine of the mean: a row per trait from deficiency (−1) to excess (+1), the mean shaded
          const p = profiles.get(o.profile); if (!p) return null; const n = p.traits.length, sc = C.scene([-1.5, 1.5, -n - 0.5, 0.8]);
          p.traits.forEach(([, x], i) => {
            const y = -i; sc.seg(-1, y, 1, y, { c: 'muted' }); sc.poly([-p.tol, y - 0.25, p.tol, y - 0.25, p.tol, y + 0.25, -p.tol, y + 0.25], { closed: true, fill: true, c: 'ok' });
            sc.txt(-1.3, y, { v: i + 1, anchor: 'middle' });
            if (fin(x)) sc.pt(Math.max(-1, Math.min(1, x)), y, { r: 6, c: Math.abs(x) <= p.tol ? 'ok' : 'bad' });
          });
          return sc.done();
        }
        case 'map': {                    // the thinkers of the model on lanes by tradition, lifelines and arrows of influence
          const list = arrOf(M.thinkers).filter(isObj).map(x => [x.id, thinkers.get(x.id)]).filter(([, v]) => v && fin(v.b) && fin(v.d));
          if (!list.length) return null;
          const from = num(X(o.from), Math.min(...list.map(([, v]) => v.b)) - 30), to = num(X(o.to), Math.max(...list.map(([, v]) => v.d)) + 30);
          if (!(to > from)) { flag('range'); return null; }
          const shown = list.filter(([, v]) => v.d >= from && v.b <= to), lanes = T.TRADS.filter(t => shown.some(([, v]) => v.tr === t));
          const h = (to - from) / 18, y = v => -lanes.indexOf(v.tr) * h - (shown.filter(([, w]) => w.tr === v.tr).indexOf(shown.find(([, w]) => w === v)) % 3) * h / 3.2;
          const sc = C.scene([from, to, -lanes.length * h, h * 0.6]);
          const hiSet = new Set(o.hi ? [o.hi, ...((thinkers.get(o.hi) || { in: [] }).in)] : []);
          for (const [id, v] of shown) for (const src of v.in) { const s = shown.find(([k]) => k === src); if (s) sc.seg((s[1].b + s[1].d) / 2, y(s[1]), v.b, y(v), { arrow: true, c: o.hi === id ? 'hi' : 'muted', dash: o.hi !== id }); }
          for (const [id, v] of shown) {
            const yy = y(v); sc.seg(Math.max(v.b, from), yy, Math.min(v.d, to), yy, { w: 5, c: hiSet.has(id) ? 'hi' : 'info' });
            const lab = arrOf(M.thinkers).find(x => isObj(x) && x.id === id);
            if (lab && lab.label) sc.txt(Math.max(v.b, from), yy + h * 0.12, { key: lab.label });
          }
          return sc.done();
        }
        case 'payoffs': {                // the matrix: each cell with both payoffs; Nash cells 'hi'
          const G = games.get(o.game); if (!G) return null; const nr = G.pay.length, nc = G.pay[0].length, ne = nashCells(G), sc = C.scene([-0.2, nc + 0.2, -nr - 0.2, 0.2]);
          for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
            const isNE = ne.some(([a, b]) => a === r && b === c);
            sc.poly([c, -r, c + 1, -r, c + 1, -r - 1, c, -r - 1], { closed: true, fill: isNE, c: isNE ? 'hi' : 'muted' });
            sc.txt(c + 0.3, -r - 0.6, { v: G.pay[r][c][0] }); sc.txt(c + 0.7, -r - 0.4, { v: G.pay[r][c][1], c: 'info' });
          }
          return sc.done();
        }
        default: return null;
      }
    }
    for (const o of arrOf(spec && spec.outputs)) {
      if (!isObj(o) || typeof o.id !== 'string') continue;
      cur = o.id;
      try {
        if (o.kind === 'series') out[o.id] = C.thin(series(o).filter(() => true), C.MAX_POINTS);
        else if (o.kind === 'scene') out[o.id] = scene(o) || { view: [-1, 1, -1, 1], items: [] };
        else { const v = scalar(o); out[o.id] = typeof v === 'number' ? v : NaN; }
      } catch (e) { flag('error'); out[o.id] = o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN; }
    }
    return { out, codes };
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  const API = Object.freeze({
    table: { model: T.MODEL, outputs: T.OUT },   // the form of the activity author (src/engines/kernel/schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine, TABLES: T,
    value, compare, paradox, gini, verdict, ful, pairwise, method, condWinner, condLoser, smithSet, criterion, manipulable, singlePeaked,
    utility, evOf, euOf, ceOf, cpt, meu, stPete, nashCells, mixed, dominantStrat, paretoCell, match, tournament, hull, bargain,
    confirm, knows, sorites, hetu, koti, bhanga, formOf, argument, permute,
    // added: rule consequentialism at a rate, voting games and Gibbard–Satterthwaite, infinite streams, ubuntu
    ruleValue, codeValue, voteGame, gsProfile, gsExists, lexWinner, streamPair, overtake, catchUp, sameCounts, ubuntuScore, ubuntuOk,
    supportEnum, lemkeHowson, mixedVote, poissonCtx, poissonWinProbs, poissonTie, tieMagnitude, voteGains, poissonIsEq,
  });
  export default API;
  /* i18n-ignore-end */
