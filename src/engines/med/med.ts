/* ===================== med@1 — physiology, pharmacology, laboratory medicine and validated scores (docs/library/med.md) =====================
   A GENERAL engine of the library (docs/INTERACTIVE_LIBRARY.md): the model lists calculations `items: [{id, fn, in, units?, opts?}]`, each a
   function of the table SIG (106 functions: cardiovascular, respiratory, acid–base, renal, fluids, pharmacology, endocrine, body size, ECG,
   scores, clinical epidemiology). Inputs are numbers or expressions over the spec's names; outputs pick `<item>.<field>` (a scalar, a series
   or a scene) and `<item>.flag.<code>` / `<item>.flags` (the codes of the run: range, validity, unsafe, units, impossible, deprecated,
   verify, incomplete). EDUCATIONAL ONLY: an input outside physiological bounds, a formula used outside the population it was derived in,
   or a rate that would harm a real patient is reported as a code — never a silent number.
   Every formula names its source beside it (paper/guideline + year); the chapter lists them all. Pure, deterministic, bounded.
   clinic@1 (src/engines/clinic/clinic.ts) reuses these calculators through NoemaLibMed.calc. */
import NoemaLibCore from '../kernel/core.ts';
import type { CheckedOutput, Env, Obj, Scene, StepContext, Table } from '../kernel/core.ts';
import type { Problem, Spec } from '../types.ts';
/* i18n-ignore-start */
/** a function of the table SIG: its inputs ("!" = required), scalar outputs, series and whether it draws a scene */
interface SigFn {
  readonly in: string;
  readonly out: string;
  readonly series: string;
  readonly scene: number;
  readonly opts?: Table;
}
interface SigTable {
  readonly fns: Readonly<Record<string, SigFn>>;
  readonly units: Readonly<Record<string, readonly string[]>>;
  readonly udim: Readonly<Record<string, string>>;
  readonly flags: readonly string[];
}
/** every input name of SIG (the calculators read their inputs by these names) */
type InName =
  | 'a'
  | 'a1c'
  | 'ac'
  | 'acr'
  | 'adv'
  | 'agNormal'
  | 'age'
  | 'alb'
  | 'alcohol'
  | 'alt'
  | 'altdx'
  | 'ascites'
  | 'avd'
  | 'avf'
  | 'axis'
  | 'b'
  | 'bands'
  | 'base'
  | 'beats'
  | 'bedridden'
  | 'bili'
  | 'bleed'
  | 'bsa'
  | 'bun'
  | 'c'
  | 'c0'
  | 'ca'
  | 'calf'
  | 'cancer'
  | 'cao2'
  | 'cer'
  | 'chf'
  | 'chronic'
  | 'cl'
  | 'clear'
  | 'co'
  | 'cohort'
  | 'collat'
  | 'confusion'
  | 'cr'
  | 'crcl'
  | 'ctarget'
  | 'cvo2'
  | 'cvp'
  | 'cvpu'
  | 'cys'
  | 'd'
  | 'days'
  | 'dbp'
  | 'ddimer'
  | 'delirium'
  | 'dialysis'
  | 'diuretic'
  | 'dm'
  | 'dopa'
  | 'dose'
  | 'doses'
  | 'dp'
  | 'drugs'
  | 'dur'
  | 'dvt'
  | 'e0'
  | 'ea'
  | 'ec50'
  | 'ecgp'
  | 'ecmo'
  | 'ed50'
  | 'ed99'
  | 'edv'
  | 'eer'
  | 'ees'
  | 'egfr'
  | 'emax'
  | 'emin'
  | 'enceph'
  | 'esv'
  | 'eta'
  | 'etoh'
  | 'exudate'
  | 'eye'
  | 'f'
  | 'fe'
  | 'female'
  | 'fever'
  | 'fib'
  | 'fio2'
  | 'fixedpupils'
  | 'fpg'
  | 'g'
  | 'gb'
  | 'gcs'
  | 'gdose'
  | 'glucose'
  | 'h'
  | 'hb'
  | 'hco3'
  | 'height'
  | 'hemopt'
  | 'hill'
  | 'hist'
  | 'hormone'
  | 'hours'
  | 'hr'
  | 'htn'
  | 'i'
  | 'ib'
  | 'imax'
  | 'immob'
  | 'imv'
  | 'infection'
  | 'infk'
  | 'infna'
  | 'inr'
  | 'insulin'
  | 'k'
  | 'k10'
  | 'k12'
  | 'k21'
  | 'ka'
  | 'kb'
  | 'km'
  | 'l'
  | 'labile'
  | 'lactate'
  | 'leg'
  | 'liver'
  | 'lr'
  | 'mag'
  | 'map'
  | 'mcs'
  | 'measured'
  | 'mg'
  | 'motor'
  | 'mpap'
  | 'na'
  | 'nepi'
  | 'ni'
  | 'nocough'
  | 'nodes'
  | 'normal'
  | 'novaso'
  | 'novent'
  | 'o2'
  | 'ogtt'
  | 'or'
  | 'othervaso'
  | 'p'
  | 'p0'
  | 'p2'
  | 'p50'
  | 'paco2'
  | 'pao2'
  | 'paralysis'
  | 'pawp'
  | 'pb'
  | 'pco2'
  | 'pcr'
  | 'peco2'
  | 'peep'
  | 'pf'
  | 'ph'
  | 'phos'
  | 'pitting'
  | 'pla'
  | 'plt'
  | 'pna'
  | 'po2'
  | 'ppeak'
  | 'pplat'
  | 'pre'
  | 'prev'
  | 'prior'
  | 'pupils'
  | 'purea'
  | 'pvo2'
  | 'qrs'
  | 'qt'
  | 'r'
  | 'rate'
  | 'renal'
  | 'rho'
  | 'rise48'
  | 'risk'
  | 'rq'
  | 'rr'
  | 'rri'
  | 'rrt'
  | 'rsupport'
  | 'sao2'
  | 'sbp'
  | 'scale2'
  | 'scr'
  | 'sd'
  | 'se'
  | 'sf'
  | 'sg'
  | 'shunt'
  | 'si'
  | 'small'
  | 'sp'
  | 'spo2'
  | 'stroke'
  | 'surgery'
  | 'sv'
  | 'svo2'
  | 'tachy'
  | 'target'
  | 'tau'
  | 'tbsa'
  | 'tbw'
  | 'td1'
  | 'td50'
  | 'temp'
  | 'tend'
  | 'tender'
  | 'tlag'
  | 'total'
  | 'trop'
  | 'ts'
  | 'u'
  | 'ucl'
  | 'ucr'
  | 'uk'
  | 'una'
  | 'uo'
  | 'uoh'
  | 'urea'
  | 'uurea'
  | 'v'
  | 'v0'
  | 'v1'
  | 'va'
  | 'vasc'
  | 'vaso'
  | 'vco2'
  | 'verbal'
  | 'vg'
  | 'vmax'
  | 'vo2'
  | 'vol'
  | 'vt'
  | 'wbc'
  | 'weight'
  | 'x'
  | 'z'
  | 'zc';
/** the inputs of a calculator in canonical units (NaN = absent) */
type X = Readonly<Record<InName, number>>;
/** the options of an item (each function reads its own; epi.km's times and events are required by its table) */
interface Opts {
  readonly shape?: string;
  readonly scheme?: string;
  readonly weight?: string;
  readonly model?: string;
  readonly cutoffs?: string;
  readonly times?: readonly number[];
  readonly events?: readonly number[];
}
type Code = (c: string) => void;
type Num = Record<string, number>;
type Series = Readonly<Record<string, number[]>>;
/** the PV loop a scene draws */
interface Loop {
  readonly V: number[];
  readonly P: number[];
  readonly Ees: number;
  readonly V0: number;
  readonly Emin: number;
}
/** what a calculator gives: its numbers by field, $s its series, $loop the PV loop */
interface Res {
  readonly [field: string]: unknown;
  readonly $s?: Series;
  readonly $loop?: Loop | undefined;
}
/** a calculator of the table: inputs, options, the writer of codes → its numbers (nothing when it has none) */
type Impl = (x: X, o: Opts, code: Code) => Res | null | undefined;
/** an item of a checked model */
interface Item {
  readonly id: string;
  readonly fn: string;
  readonly in?: Readonly<Record<string, unknown>>;
  readonly units?: Readonly<Record<string, string>> | undefined;
  readonly opts?: unknown;
  readonly key?: string;
}
/** the compiled inputs of an item: name → its value at the run's numbers */
type Cin = Record<string, (env: Env) => number | boolean>;
/** a run of one item: its numbers (with flag.<code> and flags), series, scene and codes */
interface ItemRun {
  readonly v: Num;
  readonly s: Record<string, number[]>;
  readonly sc: Scene | null;
  readonly codes: string[];
}
/** a spec whose model checkSpec passed */
type MedSpec = Spec & { readonly model: { readonly items: readonly Item[] }; readonly outputs?: readonly CheckedOutput[] };
const C = NoemaLibCore;
const ID = 'med@1';
const SIG: SigTable = {
  fns: {
    'cardio.co': { in: 'hr! sv! bsa', out: 'co ci', series: '', scene: 0 },
    'cardio.map': { in: 'sbp! dbp!', out: 'map mapMeaney pp', series: '', scene: 0 },
    'cardio.svr': { in: 'map! co! cvp', out: 'svr wood', series: '', scene: 0 },
    'cardio.pvr': { in: 'mpap! pawp! co!', out: 'pvr precap', series: '', scene: 0 },
    'cardio.ef': { in: 'edv! esv!', out: 'sv ef hfClass', series: '', scene: 0 },
    'cardio.poiseuille': { in: 'r! l! dp! eta rho', out: 'q res re vel', series: '', scene: 0 },
    'cardio.laplace': { in: 'p! r! h!', out: 'stress', series: '', scene: 0, opts: { shape: 'enum:sphere|cylinder' } },
    'cardio.bp': { in: 'sbp! dbp!', out: 'cls crisis', series: '', scene: 0, opts: { scheme: 'enum:esc2024|accaha2025' } },
    'cardio.coupling': { in: 'edv! ees! ea! v0', out: 'sv esv ef pes ratio', series: '', scene: 0 },
    'cardio.starling': { in: 'ees! ea! v0 a b pla', out: 'edv sv ef', series: 'p edv sv', scene: 0 },
    'cardio.fick': { in: 'vo2! cao2! cvo2!', out: 'co', series: '', scene: 0 },
    'cardio.windkessel': { in: 'r! c! hr! sv! zc ts beats', out: 'sbp dbp map pp tau', series: 't p q', scene: 0 },
    'cardio.pvloop': { in: 'ees! hr! pla! emin v0 r c zc', out: 'edv esv sv ef sw pes map sbp dbp co', series: 't v p pao', scene: 1 },
    'resp.pb': { in: 'alt!', out: 'pb pio2', series: '', scene: 0 },
    'resp.alveolar': { in: 'fio2! paco2! pb rq temp pao2 age', out: 'pAO2 pAO2full aa aaNormal pf ph2o', series: '', scene: 0 },
    'resp.sat': { in: 'po2! ph temp pco2 p50 hill', out: 'so2 p50 po2v', series: '', scene: 0, opts: { model: 'enum:severinghaus|hill' } },
    'resp.odc': { in: 'ph temp pco2 hb', out: 'p50', series: 'po2 so2 so2ref content', scene: 0 },
    'resp.content': { in: 'hb! sao2! pao2 svo2 pvo2 co', out: 'cao2 cvo2 avd do2 vo2 o2er', series: '', scene: 0 },
    'resp.shunt': { in: 'hb! fio2! pao2! paco2 pb avd', out: 'qsqt pAO2 cco2 cao2', series: '', scene: 0 },
    'resp.isoshunt': { in: 'shunt! hb avd paco2 pb fio2', out: 'pao2', series: 'fio2s pao2s', scene: 0 },
    'resp.deadspace': { in: 'paco2! peco2! vt rr', out: 'vdvt vd va', series: '', scene: 0 },
    'resp.mechanics': { in: 'vt! pplat! peep! ppeak', out: 'cstat cdyn dp', series: '', scene: 0 },
    'resp.pbw': { in: 'height! female!', out: 'pbw vt6 vt8', series: '', scene: 0 },
    'resp.ventilation': { in: 'vco2! va!', out: 'paco2', series: '', scene: 0 },
    'resp.ards': { in: 'peep pf spo2 fio2', out: 'berlin sf global', series: '', scene: 0 },
    'acid.hh': { in: 'hco3! paco2! ph', out: 'phCalc h diff', series: '', scene: 0 },
    'acid.abg': { in: 'ph! paco2! hco3! na cl alb chronic', out: 'primary expLo expHi verdict ag agc delta hhDiff', series: '', scene: 0 },
    'acid.ag': { in: 'na! cl! hco3! alb k agNormal', out: 'ag agc delta deltaClass', series: '', scene: 0 },
    'acid.winters': { in: 'hco3!', out: 'paco2 lo hi', series: '', scene: 0 },
    'acid.osm': { in: 'na! glucose! bun! etoh measured', out: 'calc gap eff', series: '', scene: 0 },
    'acid.stewart': { in: 'na! cl! alb! ph! hco3! k ca mg lactate phos', out: 'sida side sig albAnion phosAnion', series: '', scene: 0 },
    'acid.sbe': { in: 'ph! hco3!', out: 'sbe', series: '', scene: 0 },
    'acid.uag': { in: 'una! uk! ucl!', out: 'uag', series: '', scene: 0 },
    'renal.ckdepi': { in: 'scr! age! female!', out: 'egfr stage', series: '', scene: 0 },
    'renal.ckdepiCys': { in: 'scr! cys! age! female!', out: 'egfr stage', series: '', scene: 0 },
    'renal.cys2012': { in: 'cys! age! female!', out: 'egfr stage', series: '', scene: 0 },
    'renal.ekfc': { in: 'scr! age! female!', out: 'egfr stage', series: '', scene: 0 },
    'renal.cg': {
      in: 'age! weight! scr! female! height',
      out: 'crcl wt',
      series: '',
      scene: 0,
      opts: { weight: 'enum:actual|ideal|adjusted' },
    },
    'renal.schwartz': { in: 'height! scr!', out: 'egfr', series: '', scene: 0 },
    'renal.ckid': { in: 'height! scr! age! female!', out: 'egfr', series: '', scene: 0 },
    'renal.mdrd': { in: 'scr! age! female!', out: 'egfr', series: '', scene: 0 },
    'renal.fena': { in: 'una! pna! ucr! pcr! diuretic', out: 'fena cls', series: '', scene: 0 },
    'renal.feurea': { in: 'uurea! purea! ucr! pcr!', out: 'feurea', series: '', scene: 0 },
    'renal.clearance': { in: 'u! v! p!', out: 'cl', series: '', scene: 0 },
    'renal.kdigo': { in: 'egfr! acr!', out: 'g a risk', series: '', scene: 1 },
    'renal.aki': { in: 'scr! base! rise48 uo uoh rrt', out: 'stage', series: '', scene: 0 },
    'renal.deindex': { in: 'egfr! bsa!', out: 'abs', series: '', scene: 0 },
    'fluid.tbw': { in: 'weight! age! female!', out: 'tbw frac', series: '', scene: 0 },
    'fluid.nacorr': { in: 'na! glucose!', out: 'katz hillier', series: '', scene: 0 },
    'fluid.am': { in: 'na! tbw! infna! infk vol hours', out: 'perL after per24', series: '', scene: 0 },
    'fluid.fwd': { in: 'na! tbw! target', out: 'deficit', series: '', scene: 0 },
    'fluid.efwc': { in: 'v! una! uk! pna!', out: 'efwc', series: '', scene: 0 },
    'fluid.ca': { in: 'ca! alb!', out: 'corr', series: '', scene: 0 },
    'fluid.holliday': { in: 'weight!', out: 'mlh mlday', series: '', scene: 0 },
    'fluid.parkland': { in: 'weight! tbsa!', out: 'total first8 rate8 brooke', series: '', scene: 0 },
    'pd.emax': { in: 'c! emax! ec50! e0 hill', out: 'e frac', series: 'cs es', scene: 0 },
    'pd.occupancy': { in: 'a! ka!', out: 'p', series: '', scene: 0 },
    'pd.schild': { in: 'b! kb! ec50', out: 'dr ec50b pa2', series: '', scene: 0 },
    'pd.ti': { in: 'td50! ed50! td1 ed99', out: 'ti msf', series: '', scene: 0 },
    'pd.quantal': { in: 'ed50! td50! sd dose', out: 'pEff pTox', series: 'doses eff tox', scene: 0 },
    'pk.iv': { in: 'dose! v! clear! tau doses tend', out: 'k t12 c0 cmax cmin auc cssavg r', series: 't c', scene: 0 },
    'pk.infusion': { in: 'rate! v! clear! dur tend', out: 'k t12 css cend frac auc', series: 't c', scene: 0 },
    'pk.oral': { in: 'dose! v! clear! ka! f tau doses tlag tend', out: 'k t12 tmax cmax cmin auc cssavg r', series: 't c', scene: 0 },
    'pk.twocpt': { in: 'dose! v1! k10! k12! k21! tend', out: 'alpha beta ca cb vss t12a t12b auc', series: 't c', scene: 0 },
    'pk.mm': { in: 'rate! vmax! km! v! c0 days', out: 'css cend', series: 't c', scene: 0 },
    'pk.loading': { in: 'ctarget! v! clear f tau', out: 'ld md', series: '', scene: 0 },
    'pk.renal': { in: 'dose! fe! crcl! normal', out: 'adj kf', series: '', scene: 0 },
    'pk.phenytoin': { in: 'c! alb!', out: 'sheiner wt', series: '', scene: 0 },
    'endo.minimal': { in: 'gb! ib! sg si p2 gdose vg imax ni tend', out: 'gmax gmin gend kg', series: 't g x i', scene: 0 },
    'endo.homa': { in: 'glucose! insulin!', out: 'ir beta', series: '', scene: 0 },
    'endo.a1c': { in: 'a1c!', out: 'eag ifcc cls', series: '', scene: 0 },
    'endo.dm': { in: 'fpg ogtt a1c', out: 'cls', series: '', scene: 0 },
    'body.bmi': { in: 'weight! height! age', out: 'bmi cls', series: '', scene: 0, opts: { cutoffs: 'enum:who|asian' } },
    'body.bsa': { in: 'weight! height!', out: 'mosteller dubois haycock', series: '', scene: 0 },
    'body.ibw': { in: 'height! female!', out: 'ibw pbw', series: '', scene: 0 },
    'body.lbw': { in: 'weight! height! female!', out: 'lbw', series: '', scene: 0 },
    'body.adjbw': { in: 'weight! height! female!', out: 'adjbw ibw', series: '', scene: 0 },
    'ecg.qtc': { in: 'qt! hr! female qrs', out: 'bazett fridericia framingham hodges spread cls', series: '', scene: 0 },
    'ecg.axis': { in: 'i! avf!', out: 'axis naive cls', series: '', scene: 0 },
    'ecg.dipole': { in: 'axis! mag', out: 'leadI leadII leadIII aVR aVL aVF', series: '', scene: 1 },
    'ecg.rate': { in: 'small rri', out: 'hr', series: '', scene: 0 },
    'score.cha2ds2vasc': { in: 'age! chf htn dm stroke vasc female', out: 'score', series: '', scene: 0 },
    'score.cha2ds2va': { in: 'age! chf htn dm stroke vasc', out: 'score', series: '', scene: 0 },
    'score.hasbled': { in: 'htn renal liver stroke bleed labile age drugs alcohol', out: 'score high', series: '', scene: 0 },
    'score.wellspe': { in: 'dvt altdx tachy immob prior hemopt cancer', out: 'score likely tier3', series: '', scene: 0 },
    'score.wellsdvt': {
      in: 'cancer paralysis bedridden tender leg calf pitting collat prior altdx',
      out: 'score likely',
      series: '',
      scene: 0,
    },
    'score.perc': { in: 'age hr spo2 leg hemopt surgery prior hormone', out: 'count negative', series: '', scene: 0 },
    'score.curb65': { in: 'confusion urea rr sbp dbp age', out: 'score cls', series: '', scene: 0 },
    'score.qsofa': { in: 'rr! sbp! gcs!', out: 'score positive', series: '', scene: 0 },
    'score.sofa2': {
      in: 'gcs delirium pf sf spo2 adv novent ecmo map nepi dopa othervaso mcs novaso bili scr uo uoh rrt k ph hco3 plt',
      out: 'score brain resp cardio liver kidney coag',
      series: '',
      scene: 0,
    },
    'score.phoenix': {
      in: 'age! pf sf spo2 imv rsupport vaso lactate map plt inr ddimer fib gcs fixedpupils infection',
      out: 'score resp cardio coag neuro sepsis shock',
      series: '',
      scene: 0,
    },
    'score.sirs': { in: 'temp hr rr paco2 wbc bands', out: 'count positive', series: '', scene: 0 },
    'score.gcs': { in: 'eye! verbal! motor! pupils', out: 'gcs gcsp severe', series: '', scene: 0 },
    'score.apgar': { in: 'a! p! g! ac! r!', out: 'score', series: '', scene: 0 },
    'score.news2': { in: 'rr! spo2! o2! sbp! hr! cvpu! temp! scale2', out: 'score band red', series: '', scene: 0 },
    'score.heart': { in: 'hist! ecgp! age! risk! trop!', out: 'score band', series: '', scene: 0 },
    'score.centor': { in: 'exudate nodes fever nocough age', out: 'centor mcisaac', series: '', scene: 0 },
    'score.childpugh': { in: 'bili! alb! inr! ascites! enceph!', out: 'points cls', series: '', scene: 0 },
    'score.meld3': { in: 'bili! inr! cr! na! alb! female dialysis', out: 'meld raw', series: '', scene: 0 },
    'epi.diag': { in: 'se! sp! prev! cohort', out: 'ppv npv lrp lrn dor youden acc tp fp fn tn', series: '', scene: 0 },
    'epi.table': { in: 'a! b! c! d!', out: 'se sp ppv npv lrp lrn prev', series: '', scene: 0 },
    'epi.bayes': { in: 'pre! lr!', out: 'post preOdds postOdds', series: '', scene: 0 },
    'epi.effect': { in: 'cer! eer!', out: 'arr rrr rr or nnt', series: '', scene: 0 },
    'epi.or2rr': { in: 'or! p0!', out: 'rr', series: '', scene: 0 },
    'epi.roc': { in: 'a! b', out: 'auc', series: 'fpr tpr', scene: 0 },
    'epi.km': {
      in: '',
      out: 'median n events',
      series: 't s',
      scene: 0,
      opts: { times: { $req: true, $list: 'nonneg', max: 500, min: 1 }, events: { $req: true, $list: 'int:0:1', max: 500, min: 1 } },
    },
    'epi.fagan': { in: 'pre! lr!', out: 'post', series: '', scene: 1 },
    'epi.wilson': { in: 'x! total! z', out: 'p lo hi', series: '', scene: 0 },
  },
  units: {
    cr: ['mg/dL', 'umol/L'],
    glu: ['mg/dL', 'mmol/L'],
    alb: ['g/dL', 'g/L'],
    bun: ['mg/dL', 'mmol/L'],
    urea: ['mmol/L', 'mg/dL'],
    hb: ['g/dL', 'g/L'],
    p: ['mmHg', 'kPa'],
    bili: ['mg/dL', 'umol/L'],
    ca: ['mg/dL', 'mmol/L'],
    phos: ['mmol/L', 'mg/dL'],
    lac: ['mmol/L', 'mg/dL'],
  },
  udim: {
    scr: 'cr',
    cr: 'cr',
    ucr: 'cr',
    pcr: 'cr',
    base: 'cr',
    glucose: 'glu',
    fpg: 'glu',
    ogtt: 'glu',
    gb: 'glu',
    alb: 'alb',
    bun: 'bun',
    purea: 'bun',
    uurea: 'bun',
    urea: 'urea',
    hb: 'hb',
    pao2: 'p',
    paco2: 'p',
    po2: 'p',
    pco2: 'p',
    peco2: 'p',
    pvo2: 'p',
    pb: 'p',
    bili: 'bili',
    ca: 'ca',
    phos: 'phos',
    lactate: 'lac',
  },
  flags: ['range', 'validity', 'unsafe', 'units', 'impossible', 'deprecated', 'verify', 'incomplete'],
};
const FLAGS = SIG.flags;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = Number.isFinite as (v: unknown) => v is number;
const sigIn = (fn: string) =>
  SIG.fns[fn]!.in.split(' ')
    .filter(Boolean)
    .map(t => ({ name: t.replace('!', '') as InName, req: t.endsWith('!') }));
const words = (s: string) => s.split(' ').filter(Boolean);

/* ---------- the model checker (the same codes, paths and messages as tools/lib_med.py) ---------- */
const ITEM = { id: 'id!', fn: 'expr!', in: { $map: 'numx', max: 24 }, units: { $map: 'expr', max: 12 }, key: 'key' };
const TABLE: Table = { items: { $req: true, $list: { $obj: ITEM }, min: 1, max: 48 } };
function checkSpec(spec: unknown): Problem[] {
  const { P, E, W } = C.problems();
  const m = isObj(spec) ? spec.model : undefined;
  if (!isObj(m)) {
    E('format', 'model', 'not an object');
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], () => {}, E, W);
    return P;
  }
  const items: unknown[] = Array.isArray(m.items) ? m.items : [];
  const strip = (it: unknown) => {
    if (!isObj(it)) return it;
    const o: Obj = {};
    for (const k of Object.keys(it)) if (k !== 'opts') o[k] = it[k];
    return o;
  };
  C.walk({ ...m, items: Array.isArray(m.items) ? (m.items as unknown[]).map(strip) : m.items }, TABLE, 'model', E, W);
  const byId: Record<string, Obj> = {};
  items.forEach((it, i) => {
    const p = `model.items[${i}]`;
    if (!isObj(it)) return;
    if (typeof it.id === 'string' && C.ID_RE.test(it.id)) {
      if (byId[it.id]) E('id', p + '.id', 'used twice');
      else byId[it.id] = it;
    }
    if (typeof it.fn !== 'string' || !it.fn.trim()) return;
    const S = SIG.fns[it.fn];
    if (!S) {
      E('fn', p + '.fn', 'not a function of med@1 (docs/library/med.md lists them)');
      return;
    }
    const ins = sigIn(it.fn),
      names: string[] = ins.map(x => x.name),
      given = isObj(it.in) ? it.in : {};
    for (const x of ins) if (x.req && given[x.name] === undefined) E('input', `${p}.in.${x.name}`, `missing (an input ${it.fn} needs)`);
    for (const k of Object.keys(given)) if (!names.includes(k)) W('unknown-input', `${p}.in.${k}`, `ignored (not an input of ${it.fn})`);
    if (isObj(it.units))
      for (const [k, u] of Object.entries(it.units)) {
        const dim = SIG.udim[k];
        if (!names.includes(k)) E('units', `${p}.units.${k}`, `not an input of ${it.fn}`);
        else if (!dim) E('units', `${p}.units.${k}`, 'this input has one unit only (docs/library/med.md)');
        else if (!SIG.units[dim]!.includes(u as string)) E('units', `${p}.units.${k}`, 'one of ' + SIG.units[dim]!.join(', '));
      }
    if (it.opts !== undefined) C.walk(it.opts, S.opts || {}, p + '.opts', E, W);
    else if (S.opts && Object.values(S.opts).some(k => isObj(k) && k.$req)) E('value', p + '.opts', 'missing');
    if (
      it.fn === 'epi.km' &&
      isObj(it.opts) &&
      Array.isArray(it.opts.times) &&
      Array.isArray(it.opts.events) &&
      (it.opts.times as unknown[]).length !== (it.opts.events as unknown[]).length
    )
      E('value', p + '.opts.events', 'needs as many items as times');
  });
  C.checkOutputs(
    spec,
    ID,
    ['scalar', 'series', 'scene'],
    (o, at, E2, W2) => {
      for (const k of Object.keys(o)) if (!['id', 'kind', 'of'].includes(k)) W2('unknown-field', `${at}.${k}`, 'ignored');
      const dot = o.of.indexOf('.'),
        iid = dot < 0 ? o.of : o.of.slice(0, dot),
        field = dot < 0 ? '' : o.of.slice(dot + 1);
      const it = byId[iid];
      if (!it) {
        E2('output', at + '.of', 'names no item of the model');
        return;
      }
      const S = SIG.fns[it.fn as string];
      if (!S) return;
      if (o.kind === 'scalar') {
        const ok =
          field === '' ||
          words(S.out).includes(field) ||
          field === 'flags' ||
          (field.startsWith('flag.') && FLAGS.includes(field.slice(5)));
        if (!ok) E2('output', at + '.of', `${iid} (${it.fn as string}) has no scalar ${field}`);
      } else if (o.kind === 'series') {
        if (!words(S.series).includes(field))
          E2('output', at + '.of', `${iid} (${it.fn as string}) has no series ${field || '(name one: ' + (S.series || 'none') + ')'}`);
      } else if (!S.scene || !(field === '' || field === 'scene')) E2('output', at + '.of', `${iid} (${it.fn as string}) draws no scene`);
    },
    E,
    W,
  );
  return P;
}
function exprs(spec: Spec | null | undefined) {
  const out: Array<[string, string, string[]]> = [],
    items: unknown[] =
      isObj(spec && spec.model) && Array.isArray((spec!.model as Obj).items) ? ((spec!.model as Obj).items as unknown[]) : [];
  items.forEach((it, i) => {
    if (isObj(it) && isObj(it.in))
      for (const [k, v] of Object.entries(it.in)) if (typeof v === 'string') out.push([v, `model.items[${i}].in.${k}`, []]);
  });
  return out;
}
function keys(spec: Spec | null | undefined) {
  const out: Array<[string, string]> = [],
    items: unknown[] =
      isObj(spec && spec.model) && Array.isArray((spec!.model as Obj).items) ? ((spec!.model as Obj).items as unknown[]) : [];
  items.forEach((it, i) => {
    if (isObj(it) && typeof it.key === 'string') out.push([it.key, `model.items[${i}].key`]);
  });
  return out;
}

/* ---------- units (to the canonical unit of each dimension) and physiological bounds ---------- */
const TO: Readonly<Record<string, Readonly<Record<string, (v: number) => number>>>> = {
  // value in the other unit → canonical
  cr: { 'umol/L': v => v / 88.42 },
  glu: { 'mmol/L': v => v * 18.016 },
  alb: { 'g/L': v => v / 10 },
  bun: { 'mmol/L': v => v * 2.801 },
  urea: { 'mg/dL': v => v * 0.357 },
  hb: { 'g/L': v => v / 10 },
  p: { kPa: v => v * 7.50062 },
  bili: { 'umol/L': v => v / 17.1 },
  ca: { 'mmol/L': v => v * 4.008 },
  phos: { 'mg/dL': v => v / 3.097 },
  lac: { 'mg/dL': v => v / 9.01 },
};
/* [hardLo, hardHi, softLo, softHi]: outside hard → `impossible` (the item gives NaN); outside soft → `range` (computed, flagged) */
const RANGE: Readonly<Record<string, readonly [number, number, number, number]>> = {
  age: [0, 130, 0, 110],
  weight: [0.3, 400, 2, 250],
  height: [20, 260, 45, 220],
  hr: [1, 400, 30, 220],
  sv: [0, 300, 15, 160],
  sbp: [20, 350, 60, 250],
  dbp: [5, 250, 30, 140],
  map: [5, 300, 40, 180],
  co: [0.05, 40, 1.5, 20],
  scr: [0.05, 40, 0.2, 15],
  cys: [0.1, 15, 0.4, 8],
  na: [80, 220, 115, 165],
  k: [0.5, 15, 2.5, 7],
  cl: [40, 180, 80, 130],
  hco3: [0.5, 80, 8, 45],
  ph: [6.3, 8.0, 6.8, 7.8],
  paco2: [5, 200, 15, 100],
  pao2: [5, 760, 30, 600],
  po2: [0, 800, 5, 650],
  pco2: [5, 200, 15, 100],
  fio2: [0.05, 1, 0.21, 1],
  glucose: [5, 3000, 40, 600],
  gb: [20, 600, 50, 300],
  alb: [0.3, 7, 1.5, 5.5],
  hb: [1, 30, 5, 20],
  sao2: [0, 1, 0.5, 1],
  svo2: [0, 1, 0.2, 0.95],
  temp: [15, 45, 32, 42],
  qt: [100, 900, 250, 600],
  spo2: [0, 100, 70, 100],
  rr: [0, 120, 6, 50],
  gcs: [3, 15, 3, 15],
  se: [0, 1, 0, 1],
  sp: [0, 1, 0, 1],
  prev: [0, 1, 0, 1],
  pre: [0, 1, 0, 1],
  cer: [0, 1, 0, 1],
  eer: [0, 1, 0, 1],
  p0: [0, 1, 0, 1],
  lr: [0, 1e9, 0, 1e9],
  bili: [0.05, 80, 0.1, 40],
  inr: [0.5, 20, 0.8, 8],
  tbsa: [0, 100, 0, 100],
  a1c: [2, 25, 4, 16],
  edv: [1, 1000, 40, 400],
  esv: [0, 1000, 10, 350],
  vt: [10, 3000, 150, 1200],
  tbw: [0.1, 300, 2, 80],
  pf: [10, 800, 30, 650],
  sf: [10, 500, 50, 476],
  nepi: [0, 20, 0, 3],
  dopa: [0, 200, 0, 50],
  uo: [0, 50, 0, 10],
  uoh: [0, 168, 0, 72],
  plt: [0, 5000, 1, 1500],
  vaso: [0, 10, 0, 6],
  ddimer: [0, 200, 0, 50],
  fib: [5, 2000, 50, 1000],
};
const BOOL = new Set([
  'female',
  'chf',
  'htn',
  'dm',
  'stroke',
  'vasc',
  'renal',
  'liver',
  'bleed',
  'inr01',
  'drugs',
  'alcohol',
  'dvt',
  'altdx',
  'tachy',
  'immob',
  'prior',
  'hemopt',
  'cancer',
  'paralysis',
  'bedridden',
  'tender',
  'leg',
  'calf',
  'pitting',
  'collat',
  'surgery',
  'hormone',
  'confusion',
  'o2',
  'scale2',
  'diuretic',
  'rrt',
  'chronic',
  'exudate',
  'nodes',
  'fever',
  'nocough',
  'dialysis',
  'cvpu',
  'delirium',
  'adv',
  'novent',
  'ecmo',
  'othervaso',
  'mcs',
  'novaso',
  'imv',
  'rsupport',
  'fixedpupils',
  'infection',
]);
function plausible(name: string, v: number, code: Code) {
  // values that look like the other unit (docs/library/med.md §units)
  if (name === 'scr' && v > 30) code('units');
  if ((name === 'glucose' || name === 'fpg') && v < 30) code('units');
  if (name === 'alb' && v > 7) code('units');
  if (name === 'hb' && v > 25) code('units');
}

/* ---------- small numerics ---------- */
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lg = Math.log10;
function erf(x: number) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
/* Φ, Φ⁻¹ and roots by the simulation kernel (NoemaSimKit, docs/library/simkit.md): Φ by the incomplete gamma, Φ⁻¹ by Wichura's AS241
     (about 16 digits), roots by Brent 1973; FALLBACK without the kernel (marked): A&S 7.1.26 (|error| < 1.5e-7), Acklam, bisection */
const Phi = (x: number) => {
  const K = C.kit();
  return K ? K.normCdf(x) : 0.5 * (1 + erf(x / Math.SQRT2));
};
const PhiInv = (p: number) => {
  const K = C.kit();
  return K ? K.normInv(p) : PhiInvAcklam(p);
};
function PhiInvAcklam(p: number) {
  // Acklam's rational approximation (rel. error < 1.15e-9)
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}
function bisect(f: (x: number) => number, a: number, b: number, n?: number) {
  const K = C.kit();
  if (K) {
    const fa = f(a),
      fb = f(b);
    if (fa * fb <= 0) {
      const r = K.brent(f, a, b, 1e-13 * Math.max(1, Math.abs(a), Math.abs(b)), fa, fb);
      if (Number.isFinite(r)) return r;
    }
  }
  return bisectOwn(f, a, b, n);
}
function bisectOwn(f: (x: number) => number, a: number, b: number, n?: number) {
  let fa = f(a);
  for (let i = 0; i < (n || 100); i++) {
    const m = (a + b) / 2,
      fm = f(m);
    if (fm < 0 === fa < 0) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}
const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));

/* ---------- the calculators (each: x = inputs, canonical units, NaN = absent; code(c) records a code) ---------- */
/** the calculators other code reuses (clinic@1 through NoemaLibMed.calc, the tests) */
interface Calc {
  sev: (po2: number) => number;
  hill: (po2: number, p50: number, n: number) => number;
  shiftLog: (ph: number, t: number, pco2: number) => number;
  ph2o: (t: number) => number;
  content: (hb: number, s: number, po2: number) => number;
  pbAlt: (h: number) => number;
  ckdepi2021: (scr: number, age: number, f: number) => number;
  gStage: (g: number) => number;
  devine: (h: number, f: number) => number;
  pbw: (h: number, f: number) => number;
  bsaMosteller: (w: number, h: number) => number;
  Phi: (x: number) => number;
  PhiInv: (p: number) => number;
  logit: (p: number) => number;
  news2: (x: X) => { score: number; band: number; red: number };
  qsofa: (x: X) => { score: number; positive: number };
  pkConc: (t: number, d: Dosing) => number;
}
/** a dosing regimen of the closed-form PK */
interface Dosing {
  readonly route: string;
  readonly dose: number;
  readonly v: number;
  readonly k: number;
  readonly ka: number;
  readonly f: number;
  readonly n: number;
  readonly tau: number;
  readonly tlag: number;
}
const calc = {} as Calc;
/* oxygen: Severinghaus JW. J Appl Physiol 1979;46:599 — S = 1/(1 + 23400/(P³ + 150 P)); virtual PO2 for pH, T, PCO2 (the same paper) */
calc.sev = po2 => (po2 <= 0 ? 0 : 1 / (1 + 23400 / (po2 * po2 * po2 + 150 * po2)));
calc.hill = (po2, p50, n) => (po2 <= 0 ? 0 : Math.pow(po2, n) / (Math.pow(po2, n) + Math.pow(p50, n)));
calc.shiftLog = (ph, t, pco2) => 0.024 * (37 - t) + 0.4 * (ph - 7.4) + 0.06 * lg(40 / pco2);
const SEV_P50 = bisect(p => calc.sev(p) - 0.5, 10, 50, 80); // ≈ 26.86 mmHg
calc.ph2o = t => Math.pow(10, 8.07131 - 1730.63 / (233.426 + t)); // Antoine equation for water (mmHg, °C): 47.1 at 37 °C
calc.content = (hb, s, po2) => 1.34 * hb * s + 0.003 * po2; // mL O2/dL (1.34 mL/g; 0.003 mL/dL/mmHg) — West 11e
calc.pbAlt = h => Math.exp(6.63268 - 0.1112 * (h / 1000) - 0.00149 * Math.pow(h / 1000, 2)); // West JB J Appl Physiol 1996;81:1850
calc.ckdepi2021 = (scr, age, f) => {
  const k = f ? 0.7 : 0.9,
    a = f ? -0.241 : -0.302;
  return 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age) * (f ? 1.012 : 1);
}; // Inker NEJM 2021;385:1737
calc.gStage = g => (!fin(g) ? NaN : g >= 90 ? 1 : g >= 60 ? 2 : g >= 45 ? 3 : g >= 30 ? 4 : g >= 15 ? 5 : 6); // KDIGO 2024: G1 G2 G3a G3b G4 G5 → 1–6
calc.devine = (h, f) => (f ? 45.5 : 50) + 2.3 * (h / 2.54 - 60); // Devine 1974
calc.pbw = (h, f) => (f ? 45.5 : 50) + 0.91 * (h - 152.4); // ARDSNet NEJM 2000;342:1301
calc.bsaMosteller = (w, h) => Math.sqrt((w * h) / 3600); // Mosteller NEJM 1987;317:1098
calc.Phi = Phi;
calc.PhiInv = PhiInv;
calc.logit = p => Math.log(p / (1 - p));
calc.news2 = x => {
  // Royal College of Physicians, NEWS2 (2017)
  const rr = x.rr <= 8 ? 3 : x.rr <= 11 ? 1 : x.rr <= 20 ? 0 : x.rr <= 24 ? 2 : 3;
  let sp;
  if (x.scale2)
    sp = x.spo2 <= 83 ? 3 : x.spo2 <= 85 ? 2 : x.spo2 <= 87 ? 1 : x.spo2 <= 92 ? 0 : !x.o2 ? 0 : x.spo2 <= 94 ? 1 : x.spo2 <= 96 ? 2 : 3;
  else sp = x.spo2 <= 91 ? 3 : x.spo2 <= 93 ? 2 : x.spo2 <= 95 ? 1 : 0;
  const o2 = x.o2 ? 2 : 0;
  const sbp = x.sbp <= 90 ? 3 : x.sbp <= 100 ? 2 : x.sbp <= 110 ? 1 : x.sbp <= 219 ? 0 : 3;
  const hr = x.hr <= 40 ? 3 : x.hr <= 50 ? 1 : x.hr <= 90 ? 0 : x.hr <= 110 ? 1 : x.hr <= 130 ? 2 : 3;
  const cv = x.cvpu ? 3 : 0;
  const t = x.temp <= 35.0 ? 3 : x.temp <= 36.0 ? 1 : x.temp <= 38.0 ? 0 : x.temp <= 39.0 ? 1 : 2;
  const parts = [rr, sp, o2, sbp, hr, cv, t],
    score = parts.reduce((a, b) => a + b, 0),
    red = parts.some(v => v === 3) ? 1 : 0;
  const band = score === 0 ? 0 : score >= 7 ? 4 : score >= 5 ? 3 : red ? 2 : 1;
  return { score, band, red };
};
calc.qsofa = x => {
  const s = (x.rr >= 22 ? 1 : 0) + (x.sbp <= 100 ? 1 : 0) + (x.gcs < 15 ? 1 : 0);
  return { score: s, positive: s >= 2 ? 1 : 0 };
}; // Seymour JAMA 2016

/* PK: closed-form superposition (Rowland & Tozer, Clinical Pharmacokinetics and Pharmacodynamics, 5th ed. 2019) */
function pkConc(t: number, d: Dosing) {
  let c = 0;
  for (let j = 0; j < d.n; j++) {
    const dt = t - j * d.tau - (d.tlag || 0);
    if (dt < 0) break;
    if (d.route === 'oral')
      c +=
        Math.abs(d.ka - d.k) < 1e-9 * d.k
          ? (d.f * d.dose * d.k * dt * Math.exp(-d.k * dt)) / d.v
          : ((d.f * d.dose * d.ka) / (d.v * (d.ka - d.k))) * (Math.exp(-d.k * dt) - Math.exp(-d.ka * dt));
    else c += (d.dose / d.v) * Math.exp(-d.k * dt);
  }
  return c;
}
calc.pkConc = pkConc;
function pkRun(x: X, route: string, code: Code) {
  const k = x.clear / x.v,
    t12 = Math.LN2 / k,
    n = fin(x.doses) ? Math.max(1, Math.round(x.doses)) : 1,
    tau = fin(x.tau) ? x.tau : n > 1 ? NaN : 0;
  if (n > 1 && !(tau > 0)) {
    code('incomplete');
    return null;
  }
  if (n > 200) {
    code('range');
    return null;
  }
  const f = route === 'oral' ? (fin(x.f) ? x.f : 1) : 1;
  if (f > 1) code('impossible');
  const d = { route, dose: x.dose, v: x.v, k, ka: x.ka, f, n, tau, tlag: route === 'oral' && fin(x.tlag) ? x.tlag : 0 };
  const tend = fin(x.tend) ? x.tend : Math.min((n - 1) * (tau || 0) + 6 * t12, 1e6);
  const ts = linspace(0, tend, 601),
    cs = ts.map(t => pkConc(t, d));
  const out: Num = {
    k,
    t12,
    c0: route === 'oral' ? 0 : x.dose / x.v,
    auc: (n * f * x.dose) / x.clear,
    cssavg: tau > 0 ? (f * x.dose) / (x.clear * tau) : NaN,
    r: tau > 0 ? 1 / (1 - Math.exp(-k * tau)) : NaN,
  };
  if (route === 'oral' && n === 1) {
    const tm = Math.abs(x.ka - k) < 1e-9 * k ? 1 / k : Math.log(x.ka / k) / (x.ka - k);
    out.tmax = tm + d.tlag;
    out.cmax = pkConc(out.tmax, d);
    out.cmin = NaN;
  } else {
    // peak and trough of the last dosing interval (dense sampling)
    const t0 = (n - 1) * (tau || 0),
      w = tau > 0 ? tau : 6 * t12;
    let mx = -Infinity,
      mn = Infinity,
      tm = t0;
    for (let i = 0; i <= 2000; i++) {
      const t = t0 + (w * i) / 2000 + (i === 0 ? 1e-12 : 0),
        c = pkConc(t, d);
      if (c > mx) {
        mx = c;
        tm = t;
      }
      if (c < mn) mn = c;
    }
    out.cmax = mx;
    out.cmin = tau > 0 ? pkConc(t0 + tau - 1e-12, d) : NaN;
    out.tmax = tm - t0;
  }
  if (out.r! > 50) code('range');
  return { v: out, s: { t: ts, c: cs } };
}

/* PV loop: time-varying elastance (Suga & Sagawa Circ Res 1974), double-Hill activation (Stergiopulos Am J Physiol 1996), valves as
     ideal diodes, aortic 3-element Windkessel (Westerhof Med Biol Eng Comput 2009); constant left-atrial (filling) pressure */
function pvloop(x: X) {
  const Ees = x.ees,
    Emin = fin(x.emin) ? x.emin : 0.08,
    V0 = fin(x.v0) ? x.v0 : 10,
    Tc = 60 / x.hr,
    Pla = x.pla;
  const R = fin(x.r) ? x.r : 1.0,
    Cc = fin(x.c) ? x.c : 1.3,
    Zc = fin(x.zc) ? x.zc : 0.05,
    Rmv = 0.005,
    Rav = 0.005;
  const Tmax = 0.2 + 0.15 * Tc;
  const act = (tn: number) => {
    const a = Math.pow(tn / 0.7, 1.9),
      b = Math.pow(tn / 1.17, 21.9);
    return (a / (1 + a)) * (1 / (1 + b));
  };
  let kmax = 0;
  for (let i = 0; i <= 400; i++) kmax = Math.max(kmax, act(i / 200));
  const E = (t: number) => Emin + ((Ees - Emin) * act((t % Tc) / Tmax)) / kmax;
  const deriv = (t: number, V: number, Pc: number): [number, number, number, number] => {
    const Plv = E(t) * (V - V0);
    const Qm = Plv < Pla ? (Pla - Plv) / Rmv : 0;
    const Qa = Plv > Pc ? (Plv - Pc) / (Rav + Zc) : 0;
    return [Qm - Qa, (Qa - Pc / R) / Cc, Plv, Pc + Zc * Qa];
  };
  const dt = 0.0005,
    beats = 8,
    N = Math.min(200000, Math.ceil((beats * Tc) / dt));
  let V = 130,
    Pc = 80,
    t = 0;
  const T: number[] = [],
    Vs: number[] = [],
    Ps: number[] = [],
    Ao: number[] = [];
  const t0 = (beats - 1) * Tc;
  for (let i = 0; i < N; i++) {
    const k1 = deriv(t, V, Pc),
      k2 = deriv(t + dt / 2, V + (dt / 2) * k1[0], Pc + (dt / 2) * k1[1]),
      k3 = deriv(t + dt / 2, V + (dt / 2) * k2[0], Pc + (dt / 2) * k2[1]),
      k4 = deriv(t + dt, V + dt * k3[0], Pc + dt * k3[1]);
    if (t >= t0) {
      T.push(t - t0);
      Vs.push(V);
      Ps.push(k1[2]);
      Ao.push(k1[3]);
    }
    V += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    Pc += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    t += dt;
    if (!fin(V) || !fin(Pc)) return null;
  }
  let edv = -Infinity,
    esv = Infinity,
    iesv = 0;
  Vs.forEach((v, i) => {
    if (v > edv) edv = v;
    if (v < esv) {
      esv = v;
      iesv = i;
    }
  });
  let area = 0;
  for (let i = 0; i < Vs.length; i++) {
    const j = (i + 1) % Vs.length;
    area += Vs[i]! * Ps[j]! - Vs[j]! * Ps[i]!;
  }
  const sv = edv - esv,
    st = C.stats(Ao);
  return {
    v: {
      edv,
      esv,
      sv,
      ef: sv / edv,
      sw: Math.abs(area) / 2,
      pes: Ps[iesv],
      map: st.mean,
      sbp: st.max,
      dbp: st.min,
      co: (sv * x.hr) / 1000,
    },
    s: { t: T, v: Vs, p: Ps, pao: Ao },
    loop: { V: Vs, P: Ps, Ees, V0, Emin },
  };
}

const IMPL: Readonly<Record<string, Impl>> = {
  /* ---- cardiovascular (Guyton & Hall 14e; Klabunde 3e) ---- */
  'cardio.co': x => ({ co: (x.hr * x.sv) / 1000, ci: (x.hr * x.sv) / 1000 / x.bsa }),
  'cardio.map': x => ({ map: x.dbp + (x.sbp - x.dbp) / 3, mapMeaney: x.dbp + 0.412 * (x.sbp - x.dbp), pp: x.sbp - x.dbp }), // Meaney Blood Press Monit 2000;5:39
  'cardio.svr': (x, o, code) => {
    const cvp = fin(x.cvp) ? x.cvp : 0;
    if (x.map <= cvp) code('impossible');
    const w = (x.map - cvp) / x.co;
    return { svr: 80 * w, wood: w };
  },
  'cardio.pvr': x => {
    const p = (x.mpap - x.pawp) / x.co;
    return { pvr: p, precap: x.mpap > 20 && x.pawp <= 15 && p > 2 ? 1 : 0 };
  }, // ESC/ERS PH 2022
  'cardio.ef': (x, o, code) => {
    if (x.esv > x.edv) {
      code('impossible');
      return {};
    }
    const ef = (x.edv - x.esv) / x.edv;
    if (ef > 0.85 || ef < 0.1) code('range');
    return { sv: x.edv - x.esv, ef, hfClass: ef <= 0.4 ? 1 : ef < 0.5 ? 2 : 3 };
  }, // ESC HF 2021
  'cardio.poiseuille': (x, o, code) => {
    // Q = π r⁴ ΔP/(8 η L): r mm, L cm, ΔP mmHg, η mPa·s → Q mL/s
    const r = x.r / 1000,
      L = x.l / 100,
      eta = (fin(x.eta) ? x.eta : 3.5) / 1000,
      dp = x.dp * 133.322,
      rho = fin(x.rho) ? x.rho : 1060;
    const q = (Math.PI * Math.pow(r, 4) * dp) / (8 * eta * L),
      vel = q / (Math.PI * r * r),
      re = (rho * vel * 2 * r) / eta;
    if (re > 2000 || x.r < 0.15) code('validity'); // turbulence; Fåhræus–Lindqvist (non-Newtonian) below ~0.3 mm diameter
    return { q: q * 1e6, res: x.dp / (q * 1e6), re, vel: vel * 100 };
  },
  'cardio.laplace': (x, o) => ({ stress: (x.p * 0.133322 * x.r) / ((o.shape === 'cylinder' ? 1 : 2) * x.h) }), // kPa (P mmHg → kPa)
  'cardio.bp': (x, o) => {
    // ESC 2024 (McEvoy EHJ 2024;45:3912) / ACC-AHA 2025 (Jones, Hypertension 2025)
    const s = x.sbp,
      d = x.dbp;
    let cls;
    if (o.scheme === 'accaha2025') cls = s >= 140 || d >= 90 ? 3 : s >= 130 || d >= 80 ? 2 : s >= 120 ? 1 : 0;
    else cls = s >= 140 || d >= 90 ? 2 : s >= 120 || d >= 70 ? 1 : 0;
    return { cls, crisis: s >= 180 || d >= 120 ? 1 : 0 };
  },
  'cardio.coupling': x => {
    const v0 = fin(x.v0) ? x.v0 : 10,
      sv = ((x.edv - v0) * x.ees) / (x.ees + x.ea);
    return { sv, esv: x.edv - sv, ef: sv / x.edv, pes: x.ea * sv, ratio: x.ea / x.ees };
  }, // Sunagawa Am J Physiol 1983
  'cardio.starling': x => {
    // EDPVR P = A(e^{β(V−V0)} − 1) (Klotz 2006) + coupling
    const A = fin(x.a) ? x.a : 0.6,
      B = fin(x.b) ? x.b : 0.03,
      v0 = fin(x.v0) ? x.v0 : 10;
    const edvOf = (p: number) => v0 + Math.log(p / A + 1) / B,
      svOf = (p: number) => ((edvOf(p) - v0) * x.ees) / (x.ees + x.ea);
    const ps = linspace(1, 30, 59),
      pla = fin(x.pla) ? x.pla : 10;
    return { edv: edvOf(pla), sv: svOf(pla), ef: svOf(pla) / edvOf(pla), $s: { p: ps, edv: ps.map(edvOf), sv: ps.map(svOf) } };
  },
  'cardio.fick': (x, o, code) => {
    if (x.cao2 <= x.cvo2) {
      code('impossible');
      return {};
    }
    return { co: x.vo2 / ((x.cao2 - x.cvo2) * 10) };
  },
  'cardio.windkessel': (x, o, code) => {
    // 2-/3-element Windkessel, half-sine ejection (Westerhof 2009)
    const R = x.r,
      Cc = x.c,
      Zc = fin(x.zc) ? x.zc : 0,
      Tc = 60 / x.hr,
      Ts = (fin(x.ts) ? x.ts : 0.3) * Tc,
      beats = fin(x.beats) ? clamp(Math.round(x.beats), 3, 40) : 12;
    const Qm = (Math.PI * x.sv) / (2 * Ts),
      Q = (t: number) => {
        const u = t % Tc;
        return u < Ts ? Qm * Math.sin((Math.PI * u) / Ts) : 0;
      };
    const dt = 0.001,
      N = Math.ceil((beats * Tc) / dt);
    let Pc = (R * x.sv * x.hr) / 60,
      t = 0;
    const T = [],
      Pp = [],
      Qs = [],
      keep = (beats - 3) * Tc;
    const f = (tt: number, p: number) => (Q(tt) - p / R) / Cc;
    for (let i = 0; i < N; i++) {
      if (t >= keep) {
        T.push(t - keep);
        Pp.push(Pc + Zc * Q(t));
        Qs.push(Q(t));
      }
      const k1 = f(t, Pc),
        k2 = f(t + dt / 2, Pc + (dt / 2) * k1),
        k3 = f(t + dt / 2, Pc + (dt / 2) * k2),
        k4 = f(t + dt, Pc + dt * k3);
      Pc += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      t += dt;
    }
    const st = C.stats(Pp);
    if (st.max > 300 || st.min < 10) code('range');
    return { sbp: st.max, dbp: st.min, map: st.mean, pp: st.pp, tau: R * Cc, $s: { t: T, p: Pp, q: Qs } };
  },
  'cardio.pvloop': (x, o, code) => {
    const r = pvloop(x);
    if (!r) {
      code('impossible');
      return {};
    }
    if (r.v.sbp > 250 || r.v.ef < 0.1) code('range');
    return { ...r.v, $s: r.s, $loop: r.loop };
  },
  /* ---- respiratory (West's Respiratory Physiology 11e 2020) ---- */
  'resp.pb': x => {
    const pb = calc.pbAlt(x.alt);
    return { pb, pio2: 0.2093 * (pb - 47) };
  },
  'resp.alveolar': (x, o, code) => {
    const pb = fin(x.pb) ? x.pb : 760,
      R = fin(x.rq) ? x.rq : 0.8,
      ph2o = calc.ph2o(fin(x.temp) ? x.temp : 37);
    const pA = x.fio2 * (pb - ph2o) - x.paco2 / R,
      pAf = x.fio2 * (pb - ph2o) - x.paco2 * (x.fio2 + (1 - x.fio2) / R);
    const out: Num = { pAO2: pA, pAO2full: pAf, ph2o, aaNormal: fin(x.age) ? x.age / 4 + 4 : NaN };
    if (fin(x.pao2)) {
      out.aa = pA - x.pao2;
      out.pf = x.pao2 / x.fio2;
      if (out.aa < -5) code('impossible');
      if (x.fio2 > 0.21 + 1e-9) code('validity');
    }
    if (pA < 0) code('impossible');
    return out;
  },
  'resp.sat': (x, o) => {
    const ph = fin(x.ph) ? x.ph : 7.4,
      t = fin(x.temp) ? x.temp : 37,
      pco2 = fin(x.pco2) ? x.pco2 : 40,
      s = calc.shiftLog(ph, t, pco2),
      po2v = x.po2 * Math.pow(10, s);
    if (o.model === 'hill') {
      const p50r = fin(x.p50) ? x.p50 : 26.8,
        n = fin(x.hill) ? x.hill : 2.7;
      return { so2: calc.hill(po2v, p50r, n), p50: p50r / Math.pow(10, s), po2v };
    }
    return { so2: calc.sev(po2v), p50: SEV_P50 / Math.pow(10, s), po2v };
  },
  'resp.odc': x => {
    const ph = fin(x.ph) ? x.ph : 7.4,
      t = fin(x.temp) ? x.temp : 37,
      pco2 = fin(x.pco2) ? x.pco2 : 40,
      hb = fin(x.hb) ? x.hb : 15,
      f = Math.pow(10, calc.shiftLog(ph, t, pco2));
    const po2 = linspace(0, 150, 151);
    return {
      p50: SEV_P50 / f,
      $s: {
        po2,
        so2: po2.map(p => calc.sev(p * f)),
        so2ref: po2.map(calc.sev),
        content: po2.map(p => calc.content(hb, calc.sev(p * f), p)),
      },
    };
  },
  'resp.content': (x, o, code) => {
    const ca = calc.content(x.hb, x.sao2, fin(x.pao2) ? x.pao2 : 0),
      out: Num = { cao2: ca };
    if (fin(x.svo2)) {
      out.cvo2 = calc.content(x.hb, x.svo2, fin(x.pvo2) ? x.pvo2 : 40);
      out.avd = ca - out.cvo2;
      if (out.avd < 0) code('impossible');
    }
    if (fin(x.co)) {
      out.do2 = x.co * ca * 10;
      if (fin(out.avd)) {
        out.vo2 = x.co * out.avd * 10;
        out.o2er = out.vo2 / out.do2;
      }
    }
    return out;
  },
  'resp.shunt': (x, o, code) => {
    // Qs/Qt = (CcO2 − CaO2)/(CcO2 − CvO2), CvO2 = CaO2 − a–v difference
    const pb = fin(x.pb) ? x.pb : 760,
      pc = fin(x.paco2) ? x.paco2 : 40,
      avd = fin(x.avd) ? x.avd : 5;
    const pA = x.fio2 * (pb - 47) - pc / 0.8,
      cc = calc.content(x.hb, calc.sev(pA), pA),
      ca = calc.content(x.hb, calc.sev(x.pao2), x.pao2);
    if (x.pao2 > pA + 5) code('impossible');
    return { qsqt: (cc - ca) / (cc - (ca - avd)), pAO2: pA, cco2: cc, cao2: ca };
  },
  'resp.isoshunt': (x, o, code) => {
    // iso-shunt lines (Benatar, Br J Anaesth 1973)
    const hb = fin(x.hb) ? x.hb : 14,
      avd = fin(x.avd) ? x.avd : 5,
      pc = fin(x.paco2) ? x.paco2 : 40,
      pb = fin(x.pb) ? x.pb : 760,
      s = x.shunt;
    if (!(s >= 0 && s < 1)) {
      code('impossible');
      return {};
    }
    const pao2 = (fio2: number) => {
      const pA = fio2 * (pb - 47) - pc / 0.8;
      if (pA <= 0) return NaN;
      const cc = calc.content(hb, calc.sev(pA), pA),
        ca = cc - (avd * s) / (1 - s);
      if (ca <= 0) return 0;
      return bisect(p => calc.content(hb, calc.sev(p), p) - ca, 0, pA, 80);
    };
    const f = linspace(0.21, 1, 80);
    return { pao2: pao2(fin(x.fio2) ? x.fio2 : 0.21), $s: { fio2s: f, pao2s: f.map(pao2) } };
  },
  'resp.deadspace': (x, o, code) => {
    // Bohr/Enghoff: VD/VT = (PaCO2 − PE̅CO2)/PaCO2
    if (x.peco2 > x.paco2) {
      code('impossible');
      return {};
    }
    const r = (x.paco2 - x.peco2) / x.paco2,
      out: Num = { vdvt: r };
    if (fin(x.vt)) {
      out.vd = r * x.vt;
      if (fin(x.rr)) out.va = ((x.vt - out.vd) * x.rr) / 1000;
    }
    return out;
  },
  'resp.mechanics': (x, o, code) => {
    // Amato NEJM 2015;372:747 (driving pressure ≤ 15), plateau ≤ 30 cmH2O
    if (x.pplat <= x.peep) {
      code('impossible');
      return {};
    }
    const dp = x.pplat - x.peep;
    if (dp > 15 || x.pplat > 30) code('unsafe');
    return { cstat: x.vt / dp, cdyn: fin(x.ppeak) ? x.vt / (x.ppeak - x.peep) : NaN, dp };
  },
  'resp.pbw': (x, o, code) => {
    if (x.height < 130) code('validity');
    const p = calc.pbw(x.height, x.female);
    return { pbw: p, vt6: 6 * p, vt8: 8 * p };
  },
  'resp.ventilation': x => ({ paco2: (0.863 * x.vco2) / x.va }),
  'resp.ards': (x, o, code) => {
    // Berlin (ARDS Definition Task Force, JAMA 2012) + global definition (Matthay AJRCCM 2024;209:37)
    const out: Num = {};
    if (fin(x.pf)) {
      out.berlin = x.pf <= 100 ? 3 : x.pf <= 200 ? 2 : x.pf <= 300 ? 1 : 0;
      if (fin(x.peep) && x.peep < 5) code('validity');
    }
    if (fin(x.spo2) && fin(x.fio2)) {
      out.sf = x.spo2 / x.fio2;
      if (x.spo2 > 97) code('validity');
      out.global = (out.sf <= 315 && x.spo2 <= 97) || (fin(x.pf) && x.pf <= 300) ? 1 : 0;
    } else if (fin(x.pf)) out.global = x.pf <= 300 ? 1 : 0;
    if (!fin(x.pf) && !fin(x.spo2)) code('incomplete');
    return out;
  },
  /* ---- acid–base (Berend, de Vries, Gans NEJM 2014;371:1434) ---- */
  'acid.hh': (x, o, code) => {
    const ph = 6.1 + lg(x.hco3 / (0.03 * x.paco2));
    const out: Num = { phCalc: ph, h: Math.pow(10, 9 - ph) };
    if (fin(x.ph)) {
      out.diff = ph - x.ph;
      if (Math.abs(out.diff) > 0.03) code('validity');
    }
    return out;
  },
  'acid.abg': (x, o, code) => {
    const ph = x.ph,
      pc = x.paco2,
      h = x.hco3;
    let primary = 0,
      lo = NaN,
      hi = NaN,
      verdict = 0;
    if (ph < 7.35) primary = h < 22 ? 1 : pc > 45 ? 3 : 0;
    else if (ph > 7.45) primary = h > 26 ? 2 : pc < 35 ? 4 : 0;
    else if ((pc > 45 || pc < 35) && (h > 26 || h < 22)) primary = 5;
    if (primary === 1) {
      lo = 1.5 * h + 6;
      hi = 1.5 * h + 10;
      verdict = pc > hi ? 1 : pc < lo ? 2 : 0;
    } // Winters (Albert, Dell & Winters 1967)
    else if (primary === 2) {
      const e = 40 + 0.7 * (h - 24);
      lo = e - 5;
      hi = e + 5;
      verdict = pc > hi ? 1 : pc < lo ? 2 : 0;
    } else if (primary === 3) {
      const d = (pc - 40) / 10,
        a = 24 + d,
        c = 24 + 3.5 * d;
      lo = x.chronic === 1 ? c - 2 : a - 2;
      hi = x.chronic === 0 ? a + 2 : c + 2;
      verdict = h > hi ? 3 : h < lo ? 4 : 0;
    } else if (primary === 4) {
      const d = (40 - pc) / 10,
        a = 24 - 2 * d,
        c = 24 - 4.5 * d;
      lo = x.chronic === 0 ? a - 2 : c - 2;
      hi = x.chronic === 1 ? c + 2 : a + 2;
      verdict = h > hi ? 3 : h < lo ? 4 : 0;
    }
    const out: Num = { primary, expLo: lo, expHi: hi, verdict, hhDiff: 6.1 + lg(h / (0.03 * pc)) - ph };
    if (Math.abs(out.hhDiff!) > 0.03) code('validity');
    if (fin(x.na) && fin(x.cl)) {
      out.ag = x.na - x.cl - h;
      out.agc = fin(x.alb) ? out.ag + 2.5 * (4 - x.alb) : NaN;
      out.delta = h < 24 ? ((fin(out.agc) ? out.agc : out.ag) - 12) / (24 - h) : NaN;
    }
    return out;
  },
  'acid.ag': (x, o, code) => {
    // albumin correction Figge Crit Care Med 1998;26:1807; delta ratio (Rastegar JASN 2007)
    const ag = x.na - x.cl - x.hco3 + (fin(x.k) ? x.k : 0),
      agc = fin(x.alb) ? ag + 2.5 * (4 - x.alb) : ag,
      n = fin(x.agNormal) ? x.agNormal : 12;
    let delta = NaN,
      cls = NaN;
    if (x.hco3 < 24) {
      delta = (agc - n) / (24 - x.hco3);
      cls = delta < 0.4 ? 1 : delta < 0.8 ? 2 : delta <= 2 ? 3 : 4;
    } else code('validity');
    if (ag < 0) code('range');
    return { ag, agc, delta, deltaClass: cls };
  },
  'acid.winters': x => ({ paco2: 1.5 * x.hco3 + 8, lo: 1.5 * x.hco3 + 6, hi: 1.5 * x.hco3 + 10 }),
  'acid.osm': x => {
    const c = 2 * x.na + x.glucose / 18 + x.bun / 2.8 + (fin(x.etoh) ? x.etoh / 3.7 : 0);
    return { calc: c, gap: fin(x.measured) ? x.measured - c : NaN, eff: 2 * x.na + x.glucose / 18 };
  },
  'acid.stewart': x => {
    // Stewart 1983; Figge–Fencl: [Alb⁻] = alb(g/L)(0.123 pH − 0.631), [Pi⁻] = Pi(mmol/L)(0.309 pH − 0.469)
    const ca = fin(x.ca) ? (x.ca / 4.008) * 2 : 2.3,
      mg = fin(x.mg) ? x.mg * 2 : 1.6,
      k = fin(x.k) ? x.k : 4,
      lac = fin(x.lactate) ? x.lactate : 1,
      pi = fin(x.phos) ? x.phos : 1.1;
    const sida = x.na + k + ca + mg - x.cl - lac,
      albA = x.alb * 10 * (0.123 * x.ph - 0.631),
      phA = pi * (0.309 * x.ph - 0.469),
      side = x.hco3 + albA + phA;
    return { sida, side, sig: sida - side, albAnion: albA, phosAnion: phA };
  },
  'acid.sbe': x => ({ sbe: 0.93 * (x.hco3 - 24.4 + 14.83 * (x.ph - 7.4)) }), // Van Slyke equation (CLSI C46-A2)
  'acid.uag': x => ({ uag: x.una + x.uk - x.ucl }),
  /* ---- renal (KDIGO 2024 CKD, Kidney Int 2024;105(4S):S117; NKF-ASN Task Force 2021) ---- */
  'renal.ckdepi': (x, o, code) => {
    if (x.age < 18) code('validity');
    const g = calc.ckdepi2021(x.scr, x.age, x.female);
    return { egfr: g, stage: calc.gStage(g) };
  },
  'renal.ckdepiCys': (x, o, code) => {
    // CKD-EPI 2021 creatinine–cystatin C (Inker NEJM 2021)
    if (x.age < 18) code('validity');
    const k = x.female ? 0.7 : 0.9,
      a = x.female ? -0.219 : -0.144;
    const g =
      135 *
      Math.pow(Math.min(x.scr / k, 1), a) *
      Math.pow(Math.max(x.scr / k, 1), -0.544) *
      Math.pow(Math.min(x.cys / 0.8, 1), -0.323) *
      Math.pow(Math.max(x.cys / 0.8, 1), -0.778) *
      Math.pow(0.9961, x.age) *
      (x.female ? 0.963 : 1);
    return { egfr: g, stage: calc.gStage(g) };
  },
  'renal.cys2012': (x, o, code) => {
    if (x.age < 18) code('validity');
    const g =
      133 *
      Math.pow(Math.min(x.cys / 0.8, 1), -0.499) *
      Math.pow(Math.max(x.cys / 0.8, 1), -1.328) *
      Math.pow(0.996, x.age) *
      (x.female ? 0.932 : 1);
    return { egfr: g, stage: calc.gStage(g) };
  }, // Inker NEJM 2012
  'renal.ekfc': (x, o, code) => {
    // EKFC (Pottel Ann Intern Med 2021;174:183): adult Q 0.70 / 0.90 mg/dL (62 / 80 µmol/L)
    if (x.age < 2) {
      code('validity');
      return {};
    } // developed for 2–100 y
    // 2–25 y: ln Q (µmol/L) = 3.200 + 0.259·a − 0.543·ln a − 0.00763·a² + 0.0000790·a³ (males), 3.080 + 0.177·a − 0.223·ln a −
    // 0.00596·a² + 0.0000686·a³ (females) — Pottel 2021 Table 2; checked 2026-11 against the R package kidney.epi 1.4.0 (egfr_ekfc.R)
    const a = x.age,
      Q =
        a <= 25
          ? Math.exp(
              x.female
                ? 3.08 + 0.177 * a - 0.223 * Math.log(a) - 0.00596 * a * a + 0.0000686 * a * a * a
                : 3.2 + 0.259 * a - 0.543 * Math.log(a) - 0.00763 * a * a + 0.000079 * a * a * a,
            ) / 88.4
          : x.female
            ? 0.7
            : 0.9;
    const r = x.scr / Q,
      g = (107.3 / Math.pow(r, r < 1 ? 0.322 : 1.132)) * (x.age > 40 ? Math.pow(0.99, x.age - 40) : 1);
    return { egfr: g, stage: calc.gStage(g) };
  },
  'renal.cg': (x, o, code) => {
    // Cockcroft & Gault, Nephron 1976;16:31
    if (x.age < 18) code('validity');
    let w = x.weight;
    const basis = o.weight || 'actual';
    if (basis !== 'actual') {
      if (!fin(x.height)) {
        code('incomplete');
        return {};
      }
      const ibw = calc.devine(x.height, x.female);
      w = basis === 'ideal' ? ibw : ibw + 0.4 * (x.weight - ibw);
    } else if (fin(x.height) && x.weight / Math.pow(x.height / 100, 2) >= 30) code('validity');
    return { crcl: (((140 - x.age) * w) / (72 * x.scr)) * (x.female ? 0.85 : 1), wt: w };
  },
  'renal.schwartz': x => ({ egfr: (0.413 * x.height) / x.scr }), // bedside Schwartz, JASN 2009;20:629 (1–16 y)
  'renal.ckid': (x, o, code) => {
    // CKiD U25 (Pierce Kidney Int 2021;99:948) — K constants checked 2026-11 against the paper's Table 2 (PMC9083470)
    if (x.age < 1 || x.age > 25) code('validity');
    const a = x.age,
      K = x.female
        ? a < 12
          ? 36.1 * Math.pow(1.008, a - 12)
          : a < 18
            ? 36.1 * Math.pow(1.023, a - 12)
            : 41.4
        : a < 12
          ? 39.0 * Math.pow(1.008, a - 12)
          : a < 18
            ? 39.0 * Math.pow(1.045, a - 12)
            : 50.8;
    return { egfr: (K * (x.height / 100)) / x.scr };
  },
  'renal.mdrd': (x, o, code) => {
    code('deprecated');
    return { egfr: 175 * Math.pow(x.scr, -1.154) * Math.pow(x.age, -0.203) * (x.female ? 0.742 : 1) };
  }, // Levey 2006 (IDMS), no race coefficient
  'renal.fena': (x, o, code) => {
    if (x.diuretic) code('validity');
    const f = ((x.una * x.pcr) / (x.pna * x.ucr)) * 100;
    return { fena: f, cls: f < 1 ? 1 : f <= 2 ? 2 : 3 };
  },
  'renal.feurea': x => ({ feurea: ((x.uurea * x.pcr) / (x.purea * x.ucr)) * 100 }),
  'renal.clearance': x => ({ cl: (x.u * x.v) / x.p }),
  'renal.kdigo': x => {
    const g = calc.gStage(x.egfr),
      a = x.acr < 30 ? 1 : x.acr <= 300 ? 2 : 3;
    const GRID = [
      [1, 2, 3],
      [1, 2, 3],
      [2, 3, 4],
      [3, 4, 4],
      [4, 4, 4],
      [4, 4, 4],
    ];
    return { g, a, risk: GRID[g - 1]![a - 1] };
  },
  'renal.aki': x => {
    // KDIGO AKI 2012
    const r = x.scr / x.base;
    let s = r >= 3 || x.scr >= 4.0 || x.rrt ? 3 : r >= 2 ? 2 : r >= 1.5 || (fin(x.rise48) && x.rise48 >= 0.3) ? 1 : 0;
    if (fin(x.uo) && fin(x.uoh)) {
      const u =
        (x.uo === 0 && x.uoh >= 12) || (x.uo < 0.3 && x.uoh >= 24) ? 3 : x.uo < 0.5 && x.uoh >= 12 ? 2 : x.uo < 0.5 && x.uoh >= 6 ? 1 : 0;
      s = Math.max(s, u);
    }
    return { stage: s };
  },
  'renal.deindex': x => ({ abs: (x.egfr * x.bsa) / 1.73 }),
  /* ---- fluids and electrolytes ---- */
  'fluid.tbw': x => {
    const frac = x.age < 18 ? 0.6 : x.age >= 65 ? (x.female ? 0.45 : 0.5) : x.female ? 0.5 : 0.6;
    return { tbw: frac * x.weight, frac };
  },
  'fluid.nacorr': x => ({ katz: x.na + (1.6 * (x.glucose - 100)) / 100, hillier: x.na + (2.4 * (x.glucose - 100)) / 100 }), // Katz NEJM 1973; Hillier Am J Med 1999;106:399
  'fluid.am': (x, o, code) => {
    // Adrogué & Madias NEJM 2000;342:1493/1581
    const inf = x.infna + (fin(x.infk) ? x.infk : 0),
      vol = fin(x.vol) ? x.vol : 1,
      perL = (inf - x.na) / (x.tbw + 1),
      after = (x.na * x.tbw + inf * vol) / (x.tbw + vol);
    const per24 = fin(x.hours) && x.hours > 0 ? ((after - x.na) * 24) / x.hours : NaN;
    if (x.na < 135 && per24 > 10) code('unsafe'); // Spasovski EJE 2014;170:G1: ≤ 10 mmol/L in the first 24 h (8 if high ODS risk)
    if (x.na > 145 && per24 < -12) code('unsafe'); // chronic hypernatraemia: traditional limit 10–12 mmol/L/24 h
    return { perL, after, per24 };
  },
  'fluid.fwd': x => ({ deficit: x.tbw * (x.na / (fin(x.target) ? x.target : 140) - 1) }),
  'fluid.efwc': x => ({ efwc: x.v * (1 - (x.una + x.uk) / x.pna) }),
  'fluid.ca': (x, o, code) => {
    code('validity');
    return { corr: x.ca + 0.8 * (4 - x.alb) };
  }, // Payne BMJ 1973 — poorly accurate: measure ionised Ca (KDIGO-MBD 2017)
  'fluid.holliday': (x, o, code) => {
    const w = x.weight,
      d = w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20),
      h = w <= 10 ? 4 * w : w <= 20 ? 40 + 2 * (w - 10) : 60 + (w - 20);
    if (w > 80) code('validity');
    return { mlday: d, mlh: h };
  }, // 100/50/20 mL/kg/day and the hourly 4-2-1 rule   // Holliday & Segar Pediatrics 1957;19:823
  'fluid.parkland': (x, o, code) => {
    if (x.tbsa < 20) code('validity');
    const t = 4 * x.weight * x.tbsa;
    return { total: t, first8: t / 2, rate8: t / 16, brooke: 2 * x.weight * x.tbsa };
  },
  /* ---- pharmacodynamics (Rang & Dale 10e 2023; Neubig, IUPHAR, Pharmacol Rev 2003;55:597) ---- */
  'pd.emax': x => {
    const n = fin(x.hill) ? x.hill : 1,
      e0 = fin(x.e0) ? x.e0 : 0,
      f = (c: number) => Math.pow(c, n) / (Math.pow(x.ec50, n) + Math.pow(c, n)),
      cs = logspace(x.ec50 / 1000, x.ec50 * 1000, 121);
    return { e: e0 + x.emax * f(x.c), frac: f(x.c), $s: { cs, es: cs.map(c => e0 + x.emax * f(c)) } };
  },
  'pd.occupancy': x => ({ p: x.a / (x.a + x.ka) }),
  'pd.schild': x => {
    const dr = 1 + x.b / x.kb;
    return { dr, ec50b: fin(x.ec50) ? x.ec50 * dr : NaN, pa2: -lg(x.kb) };
  }, // Gaddum/Schild
  'pd.ti': x => ({ ti: x.td50 / x.ed50, msf: fin(x.td1) && fin(x.ed99) ? x.td1 / x.ed99 : NaN }),
  'pd.quantal': x => {
    const sd = fin(x.sd) ? x.sd : 0.2,
      pe = (d: number) => Phi((lg(d) - lg(x.ed50)) / sd),
      pt = (d: number) => Phi((lg(d) - lg(x.td50)) / sd),
      ds = logspace(Math.min(x.ed50, x.td50) / 20, Math.max(x.ed50, x.td50) * 20, 121);
    return {
      pEff: fin(x.dose) ? pe(x.dose) : NaN,
      pTox: fin(x.dose) ? pt(x.dose) : NaN,
      $s: { doses: ds, eff: ds.map(pe), tox: ds.map(pt) },
    };
  },
  /* ---- pharmacokinetics (Rowland & Tozer 5e 2019) ---- */
  'pk.iv': (x, o, code) => {
    const r = pkRun(x, 'iv', code);
    return r ? { ...r.v, $s: r.s } : {};
  },
  'pk.oral': (x, o, code) => {
    const r = pkRun(x, 'oral', code);
    return r ? { ...r.v, $s: r.s } : {};
  },
  'pk.infusion': x => {
    const k = x.clear / x.v,
      dur = fin(x.dur) ? x.dur : fin(x.tend) ? x.tend : (5 * Math.LN2) / k,
      tend = fin(x.tend) ? x.tend : dur + (4 * Math.LN2) / k;
    const c = (t: number) =>
      t <= dur ? (x.rate / x.clear) * (1 - Math.exp(-k * t)) : (x.rate / x.clear) * (1 - Math.exp(-k * dur)) * Math.exp(-k * (t - dur));
    const ts = linspace(0, tend, 601);
    return {
      k,
      t12: Math.LN2 / k,
      css: x.rate / x.clear,
      cend: c(dur),
      frac: 1 - Math.exp(-k * dur),
      auc: (x.rate * dur) / x.clear,
      $s: { t: ts, c: ts.map(c) },
    };
  },
  'pk.twocpt': x => {
    const s = x.k10 + x.k12 + x.k21,
      p = x.k10 * x.k21,
      q = Math.sqrt(s * s - 4 * p),
      al = (s + q) / 2,
      be = (s - q) / 2;
    const A = ((x.dose / x.v1) * (al - x.k21)) / (al - be),
      B = ((x.dose / x.v1) * (x.k21 - be)) / (al - be);
    const tend = fin(x.tend) ? x.tend : (6 * Math.LN2) / be,
      ts = linspace(0, tend, 601);
    return {
      alpha: al,
      beta: be,
      ca: A,
      cb: B,
      vss: x.v1 * (1 + x.k12 / x.k21),
      t12a: Math.LN2 / al,
      t12b: Math.LN2 / be,
      auc: x.dose / (x.v1 * x.k10),
      $s: { t: ts, c: ts.map(t => A * Math.exp(-al * t) + B * Math.exp(-be * t)) },
    };
  },
  'pk.mm': (x, o, code) => {
    // Michaelis–Menten elimination (phenytoin): dC/dt = (R − Vmax C/(Km + C))/V, t in days
    const days = fin(x.days) ? clamp(x.days, 1, 365) : 30,
      dt = 0.01,
      N = Math.ceil(days / dt);
    let c = fin(x.c0) ? x.c0 : 0;
    const f = (cc: number) => (x.rate - (x.vmax * cc) / (x.km + cc)) / x.v;
    const T = [0],
      Cs = [c];
    for (let i = 1; i <= N; i++) {
      const k1 = f(c),
        k2 = f(c + (dt / 2) * k1),
        k3 = f(c + (dt / 2) * k2),
        k4 = f(c + dt * k3);
      c = Math.max(0, c + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
      if (i % Math.max(1, Math.floor(N / 600)) === 0) {
        T.push(i * dt);
        Cs.push(c);
      }
    }
    let css = NaN;
    if (x.rate >= x.vmax) code('unsafe');
    else css = (x.km * x.rate) / (x.vmax - x.rate);
    return { css, cend: c, $s: { t: T, c: Cs } };
  },
  'pk.loading': x => {
    const f = fin(x.f) ? x.f : 1;
    return { ld: (x.ctarget * x.v) / f, md: fin(x.clear) && fin(x.tau) ? (x.ctarget * x.clear * x.tau) / f : NaN };
  },
  'pk.renal': x => {
    const kf = x.crcl / (fin(x.normal) ? x.normal : 120);
    return { kf, adj: x.dose * (1 - x.fe * (1 - kf)) };
  }, // Giusti–Hayton / Dettli
  'pk.phenytoin': x => ({ sheiner: x.c / (0.2 * x.alb + 0.1), wt: x.c / (0.25 * x.alb + 0.1) }), // Sheiner–Tozer 1978; wt: the revised Winter–Tozer 0.25 (Anderson, Ann Pharmacother 1997;31:279; 0.275 is Cheng, Can J Hosp Pharm 2016;69:269, one hospital's population)
  /* ---- endocrine ---- */
  'endo.minimal': x => {
    // Bergman minimal model, Am J Physiol 1979;236:E667 (G mg/dL, I µU/mL, t min)
    const sg = fin(x.sg) ? x.sg : 0.025,
      si = fin(x.si) ? x.si : 5e-4,
      p2 = fin(x.p2) ? x.p2 : 0.025,
      vg = fin(x.vg) ? x.vg : 1.6,
      gd = fin(x.gdose) ? x.gdose : 0.3;
    const imax = fin(x.imax) ? x.imax : 100,
      ni = fin(x.ni) ? x.ni : 0.1,
      tend = fin(x.tend) ? clamp(x.tend, 10, 1440) : 180;
    const I = (t: number) => x.ib + (imax - x.ib) * Math.exp(-ni * t);
    const f = (t: number, G: number, X: number): [number, number] => [-(sg + X) * G + sg * x.gb, -p2 * X + p2 * si * (I(t) - x.ib)];
    let G = x.gb + (gd * 1000) / vg,
      X = 0;
    const dt = 0.1,
      N = Math.ceil(tend / dt),
      T = [0],
      Gs = [G],
      Xs = [0],
      Is = [I(0)];
    for (let i = 1; i <= N; i++) {
      const t = (i - 1) * dt,
        k1 = f(t, G, X),
        k2 = f(t + dt / 2, G + (dt / 2) * k1[0], X + (dt / 2) * k1[1]),
        k3 = f(t + dt / 2, G + (dt / 2) * k2[0], X + (dt / 2) * k2[1]),
        k4 = f(t + dt, G + dt * k3[0], X + dt * k3[1]);
      G += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      X += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      if (i % 10 === 0) {
        T.push(i * dt);
        Gs.push(G);
        Xs.push(X);
        Is.push(I(i * dt));
      }
    }
    const sel = T.map((t, i): [number, number] => [t, Gs[i]!]).filter(([t]) => t >= 10 && t <= 40);
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    for (const [t, g] of sel) {
      const y = Math.log(g);
      sx += t;
      sy += y;
      sxx += t * t;
      sxy += t * y;
    }
    const n = sel.length,
      slope = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : NaN;
    const st = C.stats(Gs);
    return { gmax: st.max, gmin: st.min, gend: G, kg: -slope * 100, $s: { t: T, g: Gs, x: Xs, i: Is } };
  },
  'endo.homa': x => {
    const g = x.glucose / 18.016;
    return { ir: (g * x.insulin) / 22.5, beta: g > 3.5 ? (20 * x.insulin) / (g - 3.5) : NaN };
  }, // Matthews Diabetologia 1985
  'endo.a1c': x => ({ eag: 28.7 * x.a1c - 46.7, ifcc: 10.929 * (x.a1c - 2.15), cls: x.a1c >= 6.5 ? 2 : x.a1c >= 5.7 ? 1 : 0 }), // Nathan Diabetes Care 2008; ADA Standards of Care
  'endo.dm': (x, o, code) => {
    if (!fin(x.fpg) && !fin(x.ogtt) && !fin(x.a1c)) {
      code('incomplete');
      return {};
    }
    const d = x.fpg >= 126 || x.ogtt >= 200 || x.a1c >= 6.5,
      p = x.fpg >= 100 || x.ogtt >= 140 || x.a1c >= 5.7;
    return { cls: d ? 2 : p ? 1 : 0 };
  },
  /* ---- body size ---- */
  'body.bmi': (x, o, code) => {
    if (fin(x.age) && x.age < 18) code('validity');
    const b = x.weight / Math.pow(x.height / 100, 2);
    const cls =
      o.cutoffs === 'asian'
        ? b < 18.5
          ? 0
          : b < 23
            ? 1
            : b < 27.5
              ? 2
              : 3
        : b < 18.5
          ? 0
          : b < 25
            ? 1
            : b < 30
              ? 2
              : b < 35
                ? 3
                : b < 40
                  ? 4
                  : 5;
    return { bmi: b, cls };
  }, // WHO 2000/2004
  'body.bsa': x => ({
    mosteller: calc.bsaMosteller(x.weight, x.height),
    dubois: 0.007184 * Math.pow(x.weight, 0.425) * Math.pow(x.height, 0.725),
    haycock: 0.024265 * Math.pow(x.weight, 0.5378) * Math.pow(x.height, 0.3964),
  }),
  'body.ibw': (x, o, code) => {
    if (x.height < 152.4) code('validity');
    return { ibw: calc.devine(x.height, x.female), pbw: calc.pbw(x.height, x.female) };
  },
  'body.lbw': x => {
    const b = x.weight / Math.pow(x.height / 100, 2);
    return { lbw: x.female ? (9270 * x.weight) / (8780 + 244 * b) : (9270 * x.weight) / (6680 + 216 * b) };
  }, // Janmahasatian Clin Pharmacokinet 2005;44:1051
  'body.adjbw': x => {
    const i = calc.devine(x.height, x.female);
    return { ibw: i, adjbw: i + 0.4 * (x.weight - i) };
  },
  /* ---- ECG (AHA/ACCF/HRS, Rautaharju Circulation 2009;119:e241) ---- */
  'ecg.qtc': (x, o, code) => {
    const rr = 60 / x.hr;
    if (x.qt / 1000 > rr) {
      code('impossible');
      return {};
    }
    const b = x.qt / Math.sqrt(rr),
      f = x.qt / Math.cbrt(rr),
      fr = x.qt + 154 * (1 - rr),
      h = x.qt + 1.75 * (x.hr - 60);
    const all = [b, f, fr, h],
      spread = Math.max(...all) - Math.min(...all);
    if (x.hr < 50 || x.hr > 120 || (fin(x.qrs) && x.qrs >= 120)) code('validity');
    const lim = x.female ? 460 : 450,
      cls = b > 500 ? 2 : b >= lim ? 1 : b <= 390 ? -1 : 0;
    return { bazett: b, fridericia: f, framingham: fr, hodges: h, spread, cls };
  },
  'ecg.axis': (x, o, code) => {
    if (x.i === 0 && x.avf === 0) {
      code('impossible');
      return {};
    }
    const a = (Math.atan2((2 / Math.sqrt(3)) * x.avf, x.i) * 180) / Math.PI,
      nv = (Math.atan2(x.avf, x.i) * 180) / Math.PI;
    return { axis: a, naive: nv, cls: a >= -30 && a <= 90 ? 0 : a < -30 && a >= -90 ? 1 : a > 90 ? 2 : 3 };
  },
  'ecg.dipole': x => {
    const m = fin(x.mag) ? x.mag : 1,
      th = (x.axis * Math.PI) / 180,
      I = m * Math.cos(th),
      II = m * Math.cos(th - Math.PI / 3),
      III = m * Math.cos(th - (2 * Math.PI) / 3);
    return { leadI: I, leadII: II, leadIII: III, aVR: -(I + II) / 2, aVL: (I - III) / 2, aVF: (II + III) / 2 };
  },
  'ecg.rate': (x, o, code) => (fin(x.small) ? { hr: 1500 / x.small } : fin(x.rri) ? { hr: 60 / x.rri } : (code('incomplete'), {})),
  /* ---- validated scores (each documented with its version and year in docs/library/med.md) ---- */
  'score.cha2ds2vasc': (x, o, code) => {
    if (x.age < 18) code('validity');
    return { score: (x.age >= 75 ? 2 : x.age >= 65 ? 1 : 0) + b(x.chf) + b(x.htn) + b(x.dm) + 2 * b(x.stroke) + b(x.vasc) + b(x.female) };
  }, // Lip Chest 2010
  'score.cha2ds2va': (x, o, code) => {
    if (x.age < 18) code('validity');
    return { score: (x.age >= 75 ? 2 : x.age >= 65 ? 1 : 0) + b(x.chf) + b(x.htn) + b(x.dm) + 2 * b(x.stroke) + b(x.vasc) };
  }, // ESC 2024 AF (Van Gelder EHJ 2024)
  'score.hasbled': x => {
    const s =
      b(x.htn) + b(x.renal) + b(x.liver) + b(x.stroke) + b(x.bleed) + b(x.labile) + (x.age > 65 ? 1 : 0) + b(x.drugs) + b(x.alcohol);
    return { score: s, high: s >= 3 ? 1 : 0 };
  }, // Pisters Chest 2010
  'score.wellspe': x => {
    const s = 3 * b(x.dvt) + 3 * b(x.altdx) + 1.5 * b(x.tachy) + 1.5 * b(x.immob) + 1.5 * b(x.prior) + b(x.hemopt) + b(x.cancer);
    return { score: s, likely: s > 4 ? 1 : 0, tier3: s < 2 ? 0 : s <= 6 ? 1 : 2 };
  }, // Wells Thromb Haemost 2000
  'score.wellsdvt': x => {
    const s =
      b(x.cancer) +
      b(x.paralysis) +
      b(x.bedridden) +
      b(x.tender) +
      b(x.leg) +
      b(x.calf) +
      b(x.pitting) +
      b(x.collat) +
      b(x.prior) -
      2 * b(x.altdx);
    return { score: s, likely: s >= 2 ? 1 : 0 };
  }, // Wells NEJM 2003
  'score.perc': x => {
    const c =
      (x.age >= 50 ? 1 : 0) +
      (x.hr >= 100 ? 1 : 0) +
      (x.spo2 < 95 ? 1 : 0) +
      b(x.leg) +
      b(x.hemopt) +
      b(x.surgery) +
      b(x.prior) +
      b(x.hormone);
    return { count: c, negative: c === 0 ? 1 : 0 };
  }, // Kline 2004
  'score.curb65': (x, o, code) => {
    if (x.age < 18) code('validity');
    const s = b(x.confusion) + (x.urea > 7 ? 1 : 0) + (x.rr >= 30 ? 1 : 0) + (x.sbp < 90 || x.dbp <= 60 ? 1 : 0) + (x.age >= 65 ? 1 : 0);
    return { score: s, cls: s <= 1 ? 0 : s === 2 ? 1 : 2 };
  }, // Lim Thorax 2003
  'score.qsofa': x => calc.qsofa(x),
  'score.sofa2': (x, o, code) => {
    // SOFA-2 (Ranzani, JAMA 2025;334:2090, Table 2 and its footnotes); a missing value scores 0 (footnote b)
    const f = fin,
      B = (v: number) => v === 1;
    const brain = !f(x.gcs)
      ? B(x.delirium)
        ? 1
        : 0
      : x.gcs >= 15
        ? B(x.delirium)
          ? 1
          : 0
        : x.gcs >= 13
          ? 1
          : x.gcs >= 9
            ? 2
            : x.gcs >= 6
              ? 3
              : 4;
    // respiratory: PaO2:FiO2 (mm Hg); SpO2:FiO2 only without it and with SpO2 < 98 % (footnote f); 3–4 need advanced support or its absence by ceiling/availability (g, h)
    let resp = 0;
    const sup = B(x.adv) || B(x.novent);
    if (f(x.pf)) resp = x.pf <= 75 ? 4 : x.pf <= 150 ? 3 : x.pf <= 225 ? 2 : x.pf <= 300 ? 1 : 0;
    else if (f(x.sf)) {
      if (f(x.spo2) && x.spo2 >= 98) code('validity');
      else resp = x.sf <= 120 ? 4 : x.sf <= 200 ? 3 : x.sf <= 250 ? 2 : x.sf <= 300 ? 1 : 0;
    }
    if (resp > 2 && !sup) resp = 2;
    if (B(x.ecmo)) resp = 4; // ECMO for respiratory failure (footnote i)
    // cardiovascular: the sum of norepinephrine (base) and epinephrine, µg/kg/min; dopamine alone by its own cut-offs (l); MAP bands under a ceiling (m)
    const ne = f(x.nepi) ? x.nepi : 0,
      dp = f(x.dopa) ? x.dopa : 0,
      other = B(x.othervaso) || (dp > 0 && ne > 0);
    let cardio;
    if (B(x.mcs)) cardio = 4;
    else if (ne > 0) cardio = ne > 0.4 ? 4 : ne > 0.2 ? (other ? 4 : 3) : other ? 3 : 2;
    else if (dp > 0 && !B(x.othervaso)) cardio = dp > 40 ? 4 : dp > 20 ? 3 : 2;
    else if (other) cardio = 2;
    else if (B(x.novaso) && f(x.map)) cardio = x.map >= 70 ? 0 : x.map >= 60 ? 1 : x.map >= 50 ? 2 : x.map >= 40 ? 3 : 4;
    else cardio = f(x.map) && x.map < 70 ? 1 : 0;
    const liver = !f(x.bili) ? 0 : x.bili <= 1.2 ? 0 : x.bili <= 3.0 ? 1 : x.bili <= 6.0 ? 2 : x.bili <= 12.0 ? 3 : 4;
    // kidney: creatinine (mg/dL) or urine output (mL/kg/h over uoh hours); 4 = receiving RRT or meeting its criteria (footnote p)
    let kidney = !f(x.scr) ? 0 : x.scr <= 1.2 ? 0 : x.scr <= 2.0 ? 1 : x.scr <= 3.5 ? 2 : 3;
    if (f(x.uo) && f(x.uoh))
      kidney = Math.max(
        kidney,
        (x.uo === 0 && x.uoh >= 12) || (x.uo < 0.3 && x.uoh >= 24) ? 3 : x.uo < 0.5 && x.uoh >= 12 ? 2 : x.uo < 0.5 && x.uoh >= 6 ? 1 : 0,
      );
    const meets =
      ((f(x.scr) && x.scr > 1.2) || (f(x.uo) && f(x.uoh) && x.uo < 0.3 && x.uoh > 6)) &&
      ((f(x.k) && x.k >= 6.0) || (f(x.ph) && f(x.hco3) && x.ph <= 7.2 && x.hco3 <= 12));
    if (B(x.rrt) || meets) kidney = 4;
    const coag = !f(x.plt) ? 0 : x.plt > 150 ? 0 : x.plt > 100 ? 1 : x.plt > 80 ? 2 : x.plt > 50 ? 3 : 4;
    return { score: brain + resp + cardio + liver + kidney + coag, brain, resp, cardio, liver, kidney, coag };
  },
  'score.phoenix': (x, o, code) => {
    // Phoenix Sepsis Score (Schlapbach, JAMA 2024;331:665; Sanchez-Pinto, JAMA 2024;331:675); the edges as the R package phoenix 1.1.3 codes them
    const f = fin,
      B = (v: number) => v === 1;
    if (x.age >= 18) code('validity'); // not for ≥ 18 y, birth hospitalisations or postconceptional age < 37 weeks
    // respiratory: SpO2:FiO2 only with SpO2 ≤ 97 %; 1 point on any support (IMV counts), 2–3 only on invasive ventilation
    let sf = f(x.sf) ? x.sf : NaN;
    if (f(sf) && f(x.spo2) && x.spo2 > 97) {
      code('validity');
      sf = NaN;
    }
    const pf = f(x.pf) ? x.pf : NaN,
      lt = (a: number, b: number) => (f(pf) && pf < a) || (f(sf) && sf < b),
      imv = B(x.imv),
      sup = imv || B(x.rsupport);
    const resp = (sup && lt(400, 292) ? 1 : 0) + (imv && lt(200, 220) ? 1 : 0) + (imv && lt(100, 148) ? 1 : 0);
    // cardiovascular 0–6: vasoactive medications (1 → 1, ≥ 2 → 2), lactate (5–< 11 → 1, ≥ 11 → 2), MAP by age (mm Hg)
    const nv = f(x.vaso) ? x.vaso : 0,
      lac = f(x.lactate) ? x.lactate : 0,
      a = x.age;
    const M: [number, number] =
      a < 1 / 12 ? [17, 31] : a < 1 ? [25, 39] : a < 2 ? [31, 44] : a < 5 ? [32, 45] : a < 12 ? [36, 49] : [38, 52];
    const mapPts = f(x.map) && a < 18 ? (x.map < M[0] ? 2 : x.map < M[1] ? 1 : 0) : 0;
    const cardio = (nv >= 2 ? 2 : nv >= 1 ? 1 : 0) + (lac >= 11 ? 2 : lac >= 5 ? 1 : 0) + mapPts;
    // coagulation 0–2: platelets < 100 ×10³/µL, INR > 1.3, D-dimer > 2 mg/L FEU, fibrinogen < 100 mg/dL, 1 each
    const coag = Math.min(
      2,
      (f(x.plt) && x.plt < 100 ? 1 : 0) +
        (f(x.inr) && x.inr > 1.3 ? 1 : 0) +
        (f(x.ddimer) && x.ddimer > 2 ? 1 : 0) +
        (f(x.fib) && x.fib < 100 ? 1 : 0),
    );
    const neuro = B(x.fixedpupils) ? 2 : f(x.gcs) && x.gcs <= 10 ? 1 : 0; // fixed pupils bilaterally → 2; GCS ≤ 10 → 1
    const score = resp + cardio + coag + neuro,
      inf = !f(x.infection) || B(x.infection); // the score applies to suspected infection
    return { score, resp, cardio, coag, neuro, sepsis: inf && score >= 2 ? 1 : 0, shock: inf && score >= 2 && cardio >= 1 ? 1 : 0 };
  },
  'score.sirs': x => {
    const c =
      (x.temp > 38 || x.temp < 36 ? 1 : 0) +
      (x.hr > 90 ? 1 : 0) +
      (x.rr > 20 || x.paco2 < 32 ? 1 : 0) +
      (x.wbc > 12 || x.wbc < 4 || x.bands > 10 ? 1 : 0);
    return { count: c, positive: c >= 2 ? 1 : 0 };
  }, // Bone Chest 1992
  'score.gcs': (x, o, code) => {
    // Teasdale & Jennett 1974; GCS-P Brennan J Neurosurg 2018 (v = 0: not testable)
    if (!(x.eye >= 1 && x.eye <= 4 && x.motor >= 1 && x.motor <= 6 && x.verbal >= 0 && x.verbal <= 5)) {
      code('impossible');
      return {};
    }
    if (x.verbal === 0) {
      code('incomplete');
      return {};
    }
    const g = x.eye + x.verbal + x.motor,
      pr = fin(x.pupils) ? clamp(Math.round(x.pupils), 0, 2) : NaN;
    return { gcs: g, gcsp: g - pr, severe: g <= 8 ? 1 : 0 };
  },
  'score.apgar': (x, o, code) => {
    const v = [x.a, x.p, x.g, x.ac, x.r];
    if (v.some(u => !(u >= 0 && u <= 2))) {
      code('impossible');
      return {};
    }
    return { score: v.reduce((s, u) => s + Math.round(u), 0) };
  }, // Apgar 1953; AAP/ACOG 2015
  'score.news2': x => calc.news2(x),
  'score.heart': (x, o, code) => {
    const it = [x.hist, x.ecgp, x.risk, x.trop];
    if (it.some(u => !(u >= 0 && u <= 2))) {
      code('impossible');
      return {};
    }
    const s = it.reduce((a, u) => a + Math.round(u), 0) + (x.age >= 65 ? 2 : x.age >= 45 ? 1 : 0);
    return { score: s, band: s <= 3 ? 0 : s <= 6 ? 1 : 2 };
  }, // Six Neth Heart J 2008
  'score.centor': x => {
    const c = b(x.exudate) + b(x.nodes) + b(x.fever) + b(x.nocough);
    return { centor: c, mcisaac: c + (fin(x.age) ? (x.age >= 3 && x.age <= 14 ? 1 : x.age >= 45 ? -1 : 0) : 0) };
  }, // McIsaac CMAJ 1998
  'score.childpugh': (x, o, code) => {
    // Pugh Br J Surg 1973
    if (!(x.ascites >= 1 && x.ascites <= 3 && x.enceph >= 1 && x.enceph <= 3)) {
      code('impossible');
      return {};
    }
    const p =
      (x.bili < 2 ? 1 : x.bili <= 3 ? 2 : 3) +
      (x.alb > 3.5 ? 1 : x.alb >= 2.8 ? 2 : 3) +
      (x.inr < 1.7 ? 1 : x.inr <= 2.3 ? 2 : 3) +
      Math.round(x.ascites) +
      Math.round(x.enceph);
    return { points: p, cls: p <= 6 ? 1 : p <= 9 ? 2 : 3 };
  },
  'score.meld3': x => {
    // MELD 3.0 (Kim WR Gastroenterology 2021;161:1887), OPTN 2023 bounds
    const bi = Math.max(1, x.bili),
      inr = Math.max(1, x.inr),
      cr = x.dialysis ? 3 : clamp(x.cr, 1, 3),
      na = clamp(x.na, 125, 137),
      al = clamp(x.alb, 1.5, 3.5),
      L = Math.log;
    const m =
      1.33 * b(x.female) +
      4.56 * L(bi) +
      0.82 * (137 - na) -
      0.24 * (137 - na) * L(bi) +
      9.09 * L(inr) +
      11.14 * L(cr) +
      1.85 * (3.5 - al) -
      1.83 * (3.5 - al) * L(cr) +
      6;
    return { raw: m, meld: clamp(Math.round(m), 6, 40) };
  },
  /* ---- clinical epidemiology (Sackett EBM; Sox, Medical Decision Making) ---- */
  'epi.diag': x => {
    const se = x.se,
      sp = x.sp,
      p = x.prev,
      ppv = (se * p) / (se * p + (1 - sp) * (1 - p)),
      npv = (sp * (1 - p)) / (sp * (1 - p) + (1 - se) * p);
    const lrp = se / (1 - sp),
      lrn = (1 - se) / sp,
      out = { ppv, npv, lrp, lrn, dor: lrp / lrn, youden: se + sp - 1, acc: se * p + sp * (1 - p) };
    if (fin(x.cohort)) {
      const N = x.cohort;
      Object.assign(out, { tp: N * p * se, fn: N * p * (1 - se), fp: N * (1 - p) * (1 - sp), tn: N * (1 - p) * sp });
    }
    return out;
  },
  'epi.table': x => {
    const se = x.a / (x.a + x.c),
      sp = x.d / (x.b + x.d);
    return {
      se,
      sp,
      ppv: x.a / (x.a + x.b),
      npv: x.d / (x.c + x.d),
      lrp: se / (1 - sp),
      lrn: (1 - se) / sp,
      prev: (x.a + x.c) / (x.a + x.b + x.c + x.d),
    };
  },
  'epi.bayes': (x, o, code) => {
    if (x.pre === 0 || x.pre === 1) code('validity');
    const po = x.pre / (1 - x.pre),
      q = po * x.lr;
    return { post: q / (1 + q), preOdds: po, postOdds: q };
  },
  'epi.effect': (x, o, code) => {
    const arr = x.cer - x.eer;
    if (arr === 0) code('impossible');
    return { arr, rrr: arr / x.cer, rr: x.eer / x.cer, or: x.eer / (1 - x.eer) / (x.cer / (1 - x.cer)), nnt: arr === 0 ? NaN : 1 / arr };
  },
  'epi.or2rr': x => ({ rr: x.or / (1 - x.p0 + x.p0 * x.or) }), // Zhang & Yu JAMA 1998;280:1690
  'epi.roc': x => {
    const bb = fin(x.b) ? x.b : 1,
      f = linspace(0, 1, 101);
    return {
      auc: Phi(x.a / Math.sqrt(1 + bb * bb)),
      $s: { fpr: f, tpr: f.map(v => (v <= 0 ? 0 : v >= 1 ? 1 : Phi(x.a + bb * PhiInv(v)))) },
    };
  }, // binormal ROC (Swets; Hanley & McNeil 1982)
  'epi.km': (x, o) => {
    // Kaplan & Meier JASA 1958 (a censoring at an event time stays at risk at that event)
    const d = o.times!.map((t, i): [number, number] => [t, o.events![i]!]).sort((p, q) => p[0] - q[0] || q[1] - p[1]);
    let n = d.length,
      s = 1,
      med = NaN;
    const T = [0],
      S = [1];
    let i = 0,
      ev = 0;
    while (i < d.length) {
      const t = d[i]![0];
      let de = 0,
        cs = 0;
      while (i < d.length && d[i]![0] === t) {
        if (d[i]![1]) de++;
        else cs++;
        i++;
      }
      if (de) {
        s *= 1 - de / n;
        T.push(t);
        S.push(s);
        ev += de;
        if (!fin(med) && s <= 0.5) med = t;
      }
      n -= de + cs;
    }
    return { median: med, n: d.length, events: ev, $s: { t: T, s: S } };
  },
  'epi.fagan': x => {
    const po = (x.pre / (1 - x.pre)) * x.lr;
    return { post: po / (1 + po) };
  },
  'epi.wilson': x => {
    const z = fin(x.z) ? x.z : 1.959964,
      N = x.total,
      p = x.x / N,
      d = 1 + (z * z) / N,
      c = (p + (z * z) / (2 * N)) / d,
      h = (z * Math.sqrt((p * (1 - p)) / N + (z * z) / (4 * N * N))) / d;
    return { p, lo: c - h, hi: c + h };
  },
};
function b(v: number) {
  return v ? 1 : 0;
}

/* ---------- scenes ---------- */
/** the scene of an item: its numbers (and its PV loop), its inputs → the drawing */
const SCENE: Readonly<Record<string, (r: Res, x: X) => Scene | null>> = {
  'cardio.pvloop': r => {
    const L = r.$loop;
    if (!L) return null;
    const vmax = Math.max(...L.V) * 1.15,
      pmax = Math.max(...L.P) * 1.15,
      sx = 100 / vmax,
      sy = 100 / pmax,
      sc = C.scene([-12, 108, -12, 108]);
    sc.seg(0, 0, 104, 0, { c: 'muted', arrow: true });
    sc.seg(0, 0, 0, 104, { c: 'muted', arrow: true });
    sc.txt(104, -6, { s: 'V', c: 'muted' });
    sc.txt(-6, 104, { s: 'P', c: 'muted' });
    const pts = [];
    const step = Math.max(1, Math.floor(L.V.length / 400));
    for (let i = 0; i < L.V.length; i += step) pts.push(L.V[i]! * sx, L.P[i]! * sy);
    sc.poly(pts, { c: 'hi', closed: true });
    const pe = L.Ees * (vmax - L.V0);
    sc.seg(L.V0 * sx, 0, vmax * sx, Math.min(pe, pmax) * sy, { c: 'info', dash: true });
    sc.seg(L.V0 * sx, 0, vmax * sx, L.Emin * (vmax - L.V0) * sy, { c: 'muted', dash: true });
    sc.pt((r.edv as number) * sx, 0, { c: 'base', v: Math.round(r.edv as number) });
    sc.pt((r.esv as number) * sx, 0, { c: 'base', v: Math.round(r.esv as number) });
    return sc.done();
  },
  'renal.kdigo': r => {
    const sc = C.scene([0, 3.6, 0, 6.6]),
      roles = ['ok', 'info', 'warn', 'bad'];
    for (let g = 0; g < 6; g++)
      for (let a = 0; a < 3; a++) {
        const GRID = [
            [1, 2, 3],
            [1, 2, 3],
            [2, 3, 4],
            [3, 4, 4],
            [4, 4, 4],
            [4, 4, 4],
          ],
          y = 5.5 - g;
        sc.poly([0.5 + a, y, 1.5 + a, y, 1.5 + a, y + 1, 0.5 + a, y + 1], { closed: true, fill: roles[GRID[g]![a]! - 1], c: 'muted' });
      }
    ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5'].forEach((s, g) => {
      sc.txt(0.25, 6 - g, { s, c: 'base' });
    });
    ['A1', 'A2', 'A3'].forEach((s, a) => {
      sc.txt(1 + a, 6.55, { s, c: 'base' });
    });
    if (fin(r.g) && fin(r.a)) sc.circ(r.a, 7 - r.g, 0.3, { c: 'hi' });
    return sc.done();
  },
  'ecg.dipole': (r, x) => {
    const sc = C.scene([-1.5, 1.5, -1.5, 1.5]),
      L: Array<[string, number]> = [
        ['I', 0],
        ['II', 60],
        ['III', 120],
        ['aVR', -150],
        ['aVL', -30],
        ['aVF', 90],
      ];
    sc.circ(0, 0, 1, { c: 'muted' });
    for (const [s, a] of L) {
      const t = (-a * Math.PI) / 180;
      sc.seg(-Math.cos(t), -Math.sin(t), Math.cos(t), Math.sin(t), { c: 'muted', dash: true });
      sc.txt(1.25 * Math.cos(t), 1.25 * Math.sin(t), { s, c: 'base' });
    }
    const t = (-x.axis * Math.PI) / 180,
      m = Math.min(1, fin(x.mag) ? Math.abs(x.mag) : 1); // y up on screen: angles clockwise (ECG convention: +90° = aVF, downwards)
    sc.seg(0, 0, m * Math.cos(t), m * Math.sin(t), { c: 'hi', arrow: true, w: 3 });
    sc.seg(0, 0, r.leadI as number, 0, { c: 'ok', w: 2 });
    sc.seg(0, 0, 0, (-(r.aVF as number) * 2) / Math.sqrt(3), { c: 'warn', w: 2 });
    return sc.done();
  },
  'epi.fagan': (r, x) => {
    const sc = C.scene([-0.6, 2.6, -4.2, 4.2]),
      Y = 3.5 / 6.9; // y = logit / scale
    for (const xx of [0, 1, 2]) sc.seg(xx, -3.6, xx, 3.6, { c: 'muted' });
    for (const p of [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 0.999]) {
      const l = calc.logit(p) * Y;
      sc.seg(-0.05, -l, 0.05, -l, { c: 'muted' });
      sc.txt(-0.3, -l, { v: p * 100, c: 'muted' });
      sc.seg(1.95, l, 2.05, l, { c: 'muted' });
      sc.txt(2.3, l, { v: p * 100, c: 'muted' });
    }
    for (const lr of [0.001, 0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100, 1000]) {
      const y = (Math.log(lr) / 2) * Y;
      sc.seg(0.95, y, 1.05, y, { c: 'muted' });
      sc.txt(1.2, y, { v: lr, c: 'muted' });
    }
    const a = -calc.logit(x.pre) * Y,
      c = calc.logit(r.post as number) * Y;
    sc.seg(0, a, 2, c, { c: 'hi', w: 2 });
    sc.pt(0, a, { c: 'hi' });
    sc.pt(1, (Math.log(x.lr) / 2) * Y, { c: 'hi' });
    sc.pt(2, c, { c: 'hi', v: (r.post as number) * 100 });
    return sc.done();
  },
};

/* ---------- running an item ---------- */
function runItem(it: Item, env: Env, cin: Cin): ItemRun {
  const codes: string[] = [],
    code = (c: string) => {
      if (!codes.includes(c)) codes.push(c);
    };
  const S = SIG.fns[it.fn]!,
    x = {} as Record<InName, number>;
  let bad = false;
  for (const { name, req } of sigIn(it.fn)) {
    let v = cin[name] ? cin[name](env) : NaN;
    if (cin[name] && typeof v === 'boolean') v = +v;
    if (!fin(v)) {
      if (cin[name] || req) {
        if (req) bad = true;
        code('incomplete');
      }
      x[name] = NaN;
      continue;
    }
    const u = it.units && it.units[name],
      dim = SIG.udim[name];
    if (u && dim && TO[dim]![u]) v = TO[dim]![u](v);
    else if (!u) plausible(name, v, code);
    const R = RANGE[name];
    if (BOOL.has(name) && !(v === 0 || v === 1)) {
      code('impossible');
      bad = true;
    } else if (R) {
      if (v < R[0] || v > R[1]) {
        code('impossible');
        bad = true;
      } else if (v < R[2] || v > R[3]) code('range');
    }
    x[name] = v;
  }
  let res: Res = {};
  if (!bad) {
    try {
      res = IMPL[it.fn]!(x, isObj(it.opts) ? it.opts : {}, code) || {};
    } catch {
      res = {};
      code('impossible');
    }
  }
  const v: Num = {},
    s: Record<string, number[]> = {};
  for (const k of words(S.out)) v[k] = fin(res[k]) ? res[k] : NaN;
  for (const k of words(S.series)) s[k] = res.$s && Array.isArray(res.$s[k]) ? C.thin(res.$s[k], C.MAX_POINTS) : [];
  let sc: Scene | null = null;
  if (S.scene && !bad && SCENE[it.fn]) {
    try {
      sc = SCENE[it.fn]!({ ...res, $loop: res.$loop }, x);
    } catch {
      sc = null;
    }
  }
  for (const f of FLAGS) v['flag.' + f] = codes.includes(f) ? 1 : 0;
  v.flags = codes.length;
  return { v, s, sc, codes };
}
function prepare(spec: Spec | null | undefined): Cin[] {
  const items: unknown[] =
    isObj(spec && spec.model) && Array.isArray((spec!.model as Obj).items) ? ((spec!.model as Obj).items as unknown[]) : [];
  return items.map(it => {
    const cin: Cin = {};
    if (isObj(it) && isObj(it.in)) for (const [k, v] of Object.entries(it.in)) cin[k] = C.cx(v);
    return cin;
  });
}
function run(spec: MedSpec, env: Env, opt?: { readonly prepared?: unknown } | null) {
  const items = spec.model.items,
    cins = (opt && (opt.prepared as Cin[] | null)) || prepare(spec),
    R: Record<string, ItemRun> = {};
  items.forEach((it, i) => {
    R[it.id] = runItem(it, env, cins[i]!);
  });
  const out: Record<string, unknown> = {};
  for (const o of spec.outputs || []) {
    const dot = o.of.indexOf('.'),
      iid = dot < 0 ? o.of : o.of.slice(0, dot),
      field = dot < 0 ? '' : o.of.slice(dot + 1),
      r = R[iid];
    if (!r) continue;
    if (o.kind === 'scalar') out[o.id as string] = field ? r.v[field] : r.v[words(SIG.fns[items.find(it => it.id === iid)!.fn]!.out)[0]!];
    else if (o.kind === 'series') out[o.id as string] = r.s[field] || [];
    else out[o.id as string] = r.sc || { view: [-1, 1, -1, 1], items: [] };
  }
  return { out, codes: Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.codes])) };
}
/** compute(fn, inputs, opts) → {v, s, sc, codes}: one calculation outside a spec (tests, clinic@1) */
function compute(
  fn: string,
  inputs?: Readonly<Record<string, number | boolean>> | null,
  opts?: unknown,
  units?: Readonly<Record<string, string>>,
) {
  if (!SIG.fns[fn]) return null;
  const cin: Cin = {};
  for (const [k, v] of Object.entries(inputs || {})) cin[k] = () => v;
  return runItem({ id: 'x', fn, opts, units }, {}, cin);
}

/* ---------- the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): med@1 in a co-simulation ----------
     The PK items become compartment models stepped in time (the same pharmacokinetics as above, Rowland & Tozer 2019; integrated with
     classical RK4 of NoemaSimKit.integrate, ≤ 0.05/k per substep, split exactly at each dose; the AUC integrated as one more state): pk.iv (central), pk.oral (gut → central, F, tlag), pk.infusion
     (a zero-order rate for dur), pk.twocpt (central ⇄ peripheral, a bolus at the start), pk.mm (Michaelis–Menten elimination). Their
     inputs are read at each step (a clearance another part computes, a dose a controller changes). Fields per step: c (the concentration
     now; a series output collects one sample a step), t, cmax / cmin / auc (so far), the item's other numbers at the current inputs.
     Every other item is recomputed at each step from the current inputs (a score of a vital sign that changes). Time: the co-simulation's. */
const PK_STATE: Readonly<Record<string, number>> = { 'pk.iv': 1, 'pk.oral': 2, 'pk.infusion': 1, 'pk.twocpt': 2, 'pk.mm': 1 };
function pkX(it: Item, env: Env, cin: Cin) {
  const x = {} as Record<InName, number>;
  for (const { name } of sigIn(it.fn)) {
    let v = cin[name] ? cin[name](env) : NaN;
    if (typeof v === 'boolean') v = +v;
    x[name] = v;
  }
  return x;
}
/** the derivative of the compartments' amounts (pk.mm: the concentration) at time t */
type Deriv = (a: readonly number[], t: number) => number[];
function pkDeriv(fn: string, x: X, tt: number, t0: number): Deriv {
  const k = x.clear / x.v;
  if (fn === 'pk.iv') return a => [-k * a[0]!];
  if (fn === 'pk.oral') {
    const f = fin(x.f) ? x.f : 1;
    return a => [-x.ka * a[0]!, x.ka * f * a[0]! - k * a[1]!];
  }
  if (fn === 'pk.infusion') {
    const dur = fin(x.dur) ? x.dur : Infinity;
    return (a, t) => [(t - t0 < dur ? x.rate : 0) - k * a[0]!];
  }
  if (fn === 'pk.twocpt') return a => [-(x.k10 + x.k12) * a[0]! + x.k21 * a[1]!, x.k12 * a[0]! - x.k21 * a[1]!];
  return a => [(x.rate - (x.vmax * a[0]!) / (x.km + a[0]!)) / x.v]; // pk.mm: a[0] is the concentration
}
const pkRate = (fn: string, x: X) =>
  fn === 'pk.oral'
    ? Math.max(x.clear / x.v, x.ka)
    : fn === 'pk.twocpt'
      ? x.k10 + x.k12 + x.k21
      : fn === 'pk.mm'
        ? x.vmax / (x.v * Math.max(x.km, 1e-12))
        : x.clear / x.v;
const pkConcOf = (fn: string, x: X, a: readonly number[]) =>
  fn === 'pk.oral' ? a[1]! / x.v : fn === 'pk.twocpt' ? a[0]! / x.v1 : fn === 'pk.mm' ? a[0]! : a[0]! / x.v;
/** the doses (time, compartment, amount) of an item in [t, t + dt) */
function pkDoses(fn: string, x: X, t0: number, t: number, dt: number) {
  const out: Array<[number, number, number]> = [],
    eps = 1e-12 * Math.max(1, Math.abs(t));
  if (fn === 'pk.iv' || fn === 'pk.oral') {
    const n = fin(x.doses) ? Math.max(1, Math.min(200, Math.round(x.doses))) : 1,
      tau = fin(x.tau) && x.tau > 0 ? x.tau : 0,
      lag = fn === 'pk.oral' && fin(x.tlag) ? x.tlag : 0;
    for (let j = 0; j < (tau > 0 ? n : 1); j++) {
      const td = t0 + lag + j * tau;
      if (td >= t - eps && td < t + dt - eps) out.push([td, 0, x.dose]);
    }
  } else if (fn === 'pk.twocpt' && t0 >= t - eps && t0 < t + dt - eps) out.push([t0, 0, x.dose]);
  return out;
}
/** a PK item in a co-simulation: the compartments' amounts, the peak, trough and AUC so far, the concentration now */
interface PkState {
  readonly a: number[];
  readonly cmax: number;
  readonly cmin: number;
  readonly auc: number;
  readonly c: number;
}
interface MedState {
  readonly t: number;
  readonly t0: number;
  readonly pk: Record<string, PkState>;
}
const stepper = {
  init(model: unknown, inputs: Env, sc: StepContext): MedState {
    const items: readonly Item[] = isObj(model) && Array.isArray(model.items) ? (model.items as Item[]) : [],
      cins = (sc.prepared as Cin[] | null) || prepare(sc.spec),
      st: MedState = { t: sc.t0 || 0, t0: sc.t0 || 0, pk: {} };
    items.forEach((it, i) => {
      if (PK_STATE[it.fn]) {
        const x = pkX(it, inputs, cins[i] || {});
        st.pk[it.id] = {
          a: it.fn === 'pk.mm' ? [fin(x.c0) ? x.c0 : 0] : new Array<number>(PK_STATE[it.fn]!).fill(0),
          cmax: -Infinity,
          cmin: Infinity,
          auc: 0,
          c: 0,
        };
      }
    });
    return st;
  },
  step(st: MedState, inputs: Env, t: number, dt: number, sc: StepContext) {
    const items = (sc.spec as MedSpec).model.items,
      cins = (sc.prepared as Cin[] | null) || prepare(sc.spec),
      env = inputs,
      ns: MedState = { t: t + dt, t0: st.t0, pk: {} },
      R: Record<string, ItemRun> = {};
    let fail = null as string | null;
    items.forEach((it, i) => {
      const cin = cins[i] || {};
      if (!PK_STATE[it.fn]) {
        R[it.id] = runItem(it, env, cin);
        return;
      }
      const x = pkX(it, env, cin),
        prev = st.pk[it.id]!,
        a = prev.a.slice(),
        f = pkDeriv(it.fn, x, t, st.t0);
      const r = runItem(it, env, cin); // the item's own numbers and codes at the current inputs
      let cmax = prev.cmax,
        cmin = prev.cmin,
        auc = prev.auc,
        c = pkConcOf(it.fn, x, a);
      const rate = pkRate(it.fn, x);
      if (!(rate > 0) || !fin(rate)) {
        fail = fail || 'model';
        R[it.id] = { ...r, v: { ...r.v, c: NaN, cmax: NaN, cmin: NaN, auc: NaN } };
        ns.pk[it.id] = prev;
        return;
      }
      const doses = pkDoses(it.fn, x, st.t0, t, dt),
        cuts = [t, ...doses.map(d => d[0]), t + dt].sort((p, q) => p - q);
      let di = 0;
      for (let s = 0; s + 1 < cuts.length; s++) {
        while (di < doses.length && doses[di]![0] <= cuts[s]! + 1e-12 * Math.max(1, Math.abs(cuts[s]!))) {
          a[doses[di]![1]]! += doses[di]![2];
          di++;
          c = pkConcOf(it.fn, x, a);
          cmax = Math.max(cmax, c);
        }
        const span = cuts[s + 1]! - cuts[s]!;
        if (!(span > 0)) continue;
        const m = Math.min(20000, Math.max(1, Math.ceil((span * rate) / 0.05))),
          h = span / m,
          K = C.kit();
        if (K) {
          // the kernel's RK4 (NoemaSimKit.integrate, fixed step h); the AUC is one more state, c' = conc: exact for the scheme
          const na = a.length,
            yy = new Array<number>(na),
            grid: number[] = [];
          for (let j = 1; j <= m; j++) grid.push(j === m ? cuts[s + 1]! : cuts[s]! + j * h);
          const R = K.integrate({
            f: (tt, y, dy) => {
              for (let q = 0; q < na; q++) yy[q] = y[q]!;
              const d = f(yy, tt);
              for (let q = 0; q < na; q++) dy[q] = d[q]!;
              dy[na] = pkConcOf(it.fn, x, yy);
            },
            y0: [...a, 0],
            t0: cuts[s]!,
            tEnd: cuts[s + 1]!,
            method: 'rk4',
            dt: h,
            maxSteps: m + 2,
            samples: grid,
            onSample: (tt, y) => {
              const c2 = pkConcOf(it.fn, x, Array.from(y).slice(0, na));
              cmax = Math.max(cmax, c2);
              cmin = Math.min(cmin, c2);
            },
          });
          for (let q = 0; q < na; q++) a[q] = Math.max(0, R.y[q]!);
          auc += R.y[na]!;
          c = pkConcOf(it.fn, x, a);
          if (R.stop !== 'end') fail = fail || 'nan';
          continue;
        }
        for (let j = 0; j < m; j++) {
          // FALLBACK without the kernel: the classical RK4 here
          const tt = cuts[s]! + j * h,
            k1 = f(a, tt),
            k2 = f(
              a.map((v, q) => v + (h / 2) * k1[q]!),
              tt + h / 2,
            ),
            k3 = f(
              a.map((v, q) => v + (h / 2) * k2[q]!),
              tt + h / 2,
            ),
            k4 = f(
              a.map((v, q) => v + h * k3[q]!),
              tt + h,
            );
          for (let q = 0; q < a.length; q++) a[q] = Math.max(0, a[q]! + (h / 6) * (k1[q]! + 2 * k2[q]! + 2 * k3[q]! + k4[q]!));
          const c2 = pkConcOf(it.fn, x, a);
          auc += (h * (c + c2)) / 2;
          c = c2;
          cmax = Math.max(cmax, c);
          cmin = Math.min(cmin, c);
        }
      }
      if (!a.every(fin)) fail = fail || 'nan';
      ns.pk[it.id] = { a, cmax, cmin, auc, c };
      R[it.id] = { ...r, v: { ...r.v, c, cmax: fin(cmax) ? cmax : NaN, cmin: fin(cmin) ? cmin : NaN, auc } };
    });
    const out: Record<string, unknown> = {};
    for (const o of (sc.spec as MedSpec).outputs || []) {
      const dot = o.of.indexOf('.'),
        iid = dot < 0 ? o.of : o.of.slice(0, dot),
        field = dot < 0 ? '' : o.of.slice(dot + 1),
        r = R[iid];
      if (!r) continue;
      const pk = !!ns.pk[iid];
      if (o.kind === 'scalar') out[o.id as string] = field ? r.v[field] : r.v[words(SIG.fns[items.find(it => it.id === iid)!.fn]!.out)[0]!];
      else if (o.kind === 'series') out[o.id as string] = pk && field === 't' ? t + dt : pk && field === 'c' ? r.v.c : r.s[field] || [];
      else out[o.id as string] = r.sc || { view: [-1, 1, -1, 1], items: [] };
    }
    return { state: ns, out, dt, ...(fail ? { fail } : {}) };
  },
};
const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true, stepper });
const API = Object.freeze({
  id: ID,
  table: {
    model: {
      items: {
        $req: true,
        $list: { $obj: Object.assign({}, ITEM, { fn: 'enum:' + Object.keys(SIG.fns).join('|') + '!', opts: 'any' }) },
        min: 1,
        max: 48,
      },
    },
    outputs: { scalar: [], series: [], scene: [] },
    offered: (m: unknown) => {
      const o: Record<'scalar' | 'series' | 'scene', string[]> = { scalar: [], series: [], scene: [] };
      for (const it of isObj(m) && Array.isArray(m.items) ? (m.items as unknown[]) : []) {
        const S = isObj(it) && typeof it.id === 'string' ? SIG.fns[it.fn as string] : null;
        if (!S) continue;
        o.scalar.push(
          ...S.out
            .split(' ')
            .filter(Boolean)
            .map(f => (it as Item).id + '.' + f),
        );
        o.series.push(
          ...S.series
            .split(' ')
            .filter(Boolean)
            .map(f => (it as Item).id + '.' + f),
        );
        if (S.scene) o.scene.push((it as Item).id);
      }
      return o;
    },
  },
  SIG,
  RANGE,
  checkSpec,
  exprs,
  keys,
  run,
  compute,
  calc,
  engine: Object.freeze(engine),
  simEngine,
  stepper,
  prepare,
});
export default API;
/* i18n-ignore-end */
