/* ===================== interactive activities — law@1, computable legal reasoning (docs/library/law.md, docs/INTERACTIVE_LIBRARY.md §1) =====================
   A general, jurisdiction-neutral engine of the library: a TOOL PROVIDER. Every statute, threshold, calendar, table and data set is
   the author's data; the engine only computes. 16 tasks:
     rules          statutes as defeasible rules with exceptions and priorities (defeasible logic: Antoniou, Billington, Governatori &
                    Maher 2001, ACM TOCL 2:255; lex superior / specialis / posterior: Alchourrón & Makinson 1981, Prakken & Sartor 1997)
     aspic          structured argumentation (ASPIC+: Prakken 2010; Modgil & Prakken 2013, AIJ 195:361) with argument schemes and
                    critical questions (Walton, Reed & Macagno 2008) — the Dung frameworks are solved by logic@1 afSolve
     carneades      proof standards over argument graphs (Gordon, Prakken & Walton 2007, AIJ 171:875; van Gijzel & Nilsson 2014)
     hohfeld        jural relations, correlatives and opposites (Hohfeld 1913/1917; Kanger 1972; Lindahl 1977; Sergot 2013)
     proof          burdens and standards of proof, Bayes, Kaplan's threshold, presumptions (Thayer 1898 / Morgan 1933), conjunction paradox
     cases          case-based reasoning: HYPO / CATO factors (Ashley 1990; Aleven 2003, AIJ 150:183), a fortiori constraint (Horty 2011)
     deadline       periods, business days, month ends, rolling, tolling, long-stops (EU Reg. 1182/71; FRCP 6(a); BGB §§187–193 as data)
     contract       offer / acceptance / revocation timing (mailbox vs receipt; CISG 16, 18, 19; UCC 2-205, 2-207), criteria, capacity
     damages        expectation / reliance / restitution (Restatement (Second) of Contracts §§344–356), mitigation, foreseeability,
                    liquidated damages vs penalty, simple / compound / continuous interest
     crime          element checklists with MPC culpability (ALI Model Penal Code 1962 §2.02, §2.05), causation, defences, offence ladders
     sentence       sentencing as a rule table (any grid: e.g. USSG ch. 5 pt A), adjustments, statutory limits (USSG §5G1.1)
     proportionality the four-stage test and Alexy's weight formula (Alexy 2003, Ratio Juris 16:433)
     vote           quorum, majorities, ties, weighted and double majorities (TEU 16(4)), Banzhaf / Shapley–Shubik power
     citation       generic citation parsing (ECLI 2011/C 127/01, neutral, reporter, series, provisions, author templates)
     shares         succession and division: fixed shares with ʿawl / radd (farāʾiḍ, Qurʾān 4:11–12, 4:176), residue, the Talmud's
                    estate division (Kethuboth 93a; Aumann & Maschler 1985), proportional, CEA, CEL
     obligations    contract clauses over a dated trace in calendar or business days: logic@1 evalNorms (deadlines, contrary-to-duty)
   Logic is never re-implemented: parse, key, afSolve and evalNorms come from NoemaLibLogic (src/engines/logic/logic.ts, its §9 API).
   Pure JS, no DOM, no words for the learner: numbers, codes, keys and the model's own short texts (`s`). Deterministic, bounded,
   never throws for a checked spec. checkSpec / exprs / keys: the golden outputs of the former Python twin (tests/fixtures/parity/lib_law.json). Tests: node tests/lib_law.js. */
import NoemaLibCore from '../kernel/core.ts';
import NoemaLibLogic from '../logic/logic.ts';
import type { Env, Rec, Emit, SceneData } from '../kernel/core.ts';
import type { Problem, Spec } from '../types.ts';
/** a number or an expression over the spec's names (`numx`) */
type Numx = number | string | boolean;
/* the model as the walk of MODEL_T leaves it: each table read as a type (kind → value; "!" or $req → required) */
type Split<E extends string> = E extends `${infer A}|${infer B}` ? A | Split<B> : E;
type KindOf<K extends string> = K extends 'numx'
  ? Numx
  : K extends 'bool'
    ? boolean
    : K extends 'fin' | 'pos' | 'nonneg' | 'unit' | `int:${string}`
      ? number
      : K extends `enum:${infer E}`
        ? Split<E>
        : K extends 'any'
          ? unknown
          : string;
type Bare<K extends string> = K extends `${infer B}!` ? B : K;
type FieldOf<F> = F extends string
  ? KindOf<Bare<F>>
  : F extends { readonly $obj: infer O }
    ? ModelOf<O>
    : F extends { readonly $list: infer E }
      ? readonly FieldOf<E>[]
      : unknown;
type Required<F> = F extends `${string}!` ? true : F extends { readonly $req: true } ? true : false;
type ModelOf<T> = { readonly [K in keyof T as Required<T[K]> extends true ? K : never]: FieldOf<T[K]> } & {
  readonly [K in keyof T as Required<T[K]> extends true ? never : K]?: FieldOf<T[K]>;
};
/** a table as collect walks it */
interface TShape {
  readonly $obj?: TTable;
  readonly $list?: string | TShape;
}
type TTable = Readonly<Record<string, string | TShape>>;
/** a field kind built from a list (an enum): `enum:a|b|c`, required with "!" */
type EnumReq = `enum:${string}!`;
type EnumOpt = `enum:${string}`;
interface DiagSink {
  add: (code: string) => void;
}
interface Diag extends DiagSink {
  has: (code: string) => boolean;
  readonly list: { code: string }[];
}
/** what a literal parses to */
type LitRes = { readonly ok: true; readonly lit: string } | { readonly ok: false; readonly code: string; readonly msg: string };
type Tpl = { readonly ok: true; readonly re: string; readonly fields: [string, string][] } | { readonly ok: false; readonly msg: string };
/** the scalars of a run, with the per-id readers of `at` and `name` outputs */
interface Scal {
  [k: string]: unknown;
  $status?: (id: string) => number;
  $statusDefault?: number;
  $at?: Readonly<Record<string, (id: string) => number>>;
  $name?: (nm: string) => number;
}
type Ser = Record<string, number[]>;
interface Res {
  scene: SceneData | null;
}
type Runner = (m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res) => void;
/** a row of a text scene; a node and an edge of a graph scene */
interface Row {
  s?: string;
  key?: string | undefined;
  v?: number;
  c?: string;
}
interface GNode {
  s?: string;
  key?: string | undefined;
  c?: string;
  sub?: string;
}
interface GEdge {
  u: number;
  v: number;
  c?: string;
  dash?: boolean;
}
/** a rule of a defeasible theory (a defeater from `unless` names the rule it excepts: exc) */
interface DRule {
  id: string;
  body: string[];
  head: string;
  kind: string;
  rank: number;
  issued: number;
  label?: string | undefined;
  exc?: string;
}
interface Theory {
  R: DRule[];
  facts: Set<string>;
  sup: Set<string>;
}
/** ASPIC+: a premise, a rule, an argument */
interface APrem {
  lit: string;
  kind: string;
  rank: number;
}
interface ARule {
  id: string;
  body: string[];
  head: string;
  strict: boolean;
  rank: number;
  exc?: boolean;
  scheme?: string;
  transposed?: boolean;
  cq?: string;
}
interface AArg {
  key: string;
  conc: string;
  top: ARule | null;
  prem?: APrem;
  subs: AArg[];
  concs: Set<string>;
  def: Set<ARule>;
  last: Set<ARule>;
  ord: Set<APrem>;
  i: number;
}
/** a Carneades argument */
interface CArg {
  id: string;
  conc: string;
  prem: string[];
  exc: string[];
  w: number;
  on: boolean;
  label?: string | undefined;
}
/** a Hohfeld fact: [D | Pw, x, y, act, value] */
type Canon = [string, string, string, string, boolean];
interface HFact {
  c: Canon;
  vals: Set<boolean>;
  src: string[];
}
/** a proof issue */
interface Issue {
  id: string;
  p: number;
  t: number;
  burden: string;
  presumed: string | undefined;
  mode: string;
  rebut: number;
}
/** a precedent (cases) */
interface Precedent {
  id?: string;
  fs: Set<string>;
  vals: Map<string, number>;
  out: string;
  pro: string[];
  con?: string[];
  reason: readonly string[] | null;
}
interface Calendar {
  wk: Set<number>;
  hol: Set<number>;
  off: (z: number) => boolean;
}
interface Power {
  banzhaf: number[];
  shapley: number[];
  swings: number[];
}
interface Try {
  id: string;
  re: RegExp;
  names: readonly string[];
  types: readonly string[];
}
/* i18n-ignore-start */ // code, not text: only codes, keys, numbers and the model's own short texts leave this engine
const C = NoemaLibCore;
const LG = (): typeof NoemaLibLogic | undefined => NoemaLibLogic; // logic@1 (docs/library/logic.md §9): parse, key, afSolve, evalNorms
const ID = 'law@1';
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const MAX_RULES = 200,
  MAX_ARGS = 400,
  MAX_DAYS = 2000,
  MAX_VOTERS = 64,
  ENUM_VOTERS = 20,
  MAX_TEXT = 200;
const short = (s: unknown) => {
  const a = Array.from(String(s));
  return a.length > 64 ? a.slice(0, 63).join('') + '…' : a.join('');
};

/* =====================================================================================================================
     1. The model format: ONE table (the same as the former Python twin (tests/fixtures/parity/lib_law.json)), walked by the core; REQ names what each task needs */
const TASKS = [
  'rules',
  'aspic',
  'carneades',
  'hohfeld',
  'proof',
  'cases',
  'deadline',
  'contract',
  'damages',
  'crime',
  'sentence',
  'proportionality',
  'vote',
  'citation',
  'shares',
  'obligations',
];
/* argument schemes and their critical questions (Walton, Reed & Macagno 2008, ch. 9; ids only — the words are the author's) */
const SCHEMES: Readonly<Record<string, readonly string[]>> = {
  expert: ['expertise', 'field', 'opinion', 'trustworthy', 'consistent', 'evidence'], // argument from expert opinion (6 CQs, Walton et al. 2008 p. 310)
  witness: ['position', 'truthful', 'consistent', 'bias', 'plausible'], // witness testimony
  'position-to-know': ['position', 'honest', 'asserted'],
  precedent: ['onpoint', 'distinguish', 'overruled', 'binding'],
  analogy: ['similar', 'difference', 'counter'],
  rule: ['applies', 'exception', 'valid', 'conflict'], // argument from an established rule
  consequences: ['likely', 'evidence', 'opposite'],
  sign: ['strength', 'other-cause'],
  cause: ['correlation', 'intervening', 'strength'],
  commitment: ['committed', 'retracted'],
};
const PS = ['scintilla', 'preponderance', 'clear-convincing', 'brd', 'dv'];
const STANDARDS = ['scintilla', 'preponderance', 'clear-convincing', 'brd', 'decision', 'custom'];
const STD_P: Readonly<Record<string, number>> = { scintilla: 0, preponderance: 0.5, 'clear-convincing': 0.75, brd: 0.9 }; // McCauliff 1982 (Vanderbilt L Rev 35:1293): data defaults, overridable
const HOH = ['right', 'duty', 'privilege', 'noright', 'power', 'liability', 'immunity', 'disability'];
const MINDS = ['purpose', 'knowledge', 'recklessness', 'negligence', 'strict'];
const LEVEL: Readonly<Record<string, number>> = { purpose: 4, knowledge: 3, recklessness: 2, negligence: 1, strict: 0 }; // MPC §2.02(2), (5): a higher level satisfies a lower
const CITE_KINDS = ['ecli', 'neutral', 'reporter', 'series', 'provision'];
const L_ = 'expr';
const lits = (max: number) => ({ $list: L_, max }) as const;
const RULE_T = {
  id: 'id!',
  if: lits(32),
  then: 'expr!',
  kind: 'enum:strict|defeasible|defeater',
  unless: lits(16),
  rank: 'fin',
  issued: 'fin',
  on: 'numx',
  label: 'key',
} as const;
const SUP_T = { win: 'ref!', lose: 'ref!' } as const;
const TOG_T = { lit: 'expr!', on: 'numx' } as const;
const PREM_T = { lit: 'expr!', kind: 'enum:axiom|ordinary', rank: 'fin', on: 'numx' } as const;
const CQ_T = { cq: 'id!', lit: 'expr', on: 'numx' } as const;
const SCH_T = {
  id: 'id!',
  scheme: ('enum:' + Object.keys(SCHEMES).join('|') + '!') as EnumReq,
  if: lits(16),
  then: 'expr!',
  rank: 'fin',
  cqs: { $list: { $obj: CQ_T }, max: 12 },
  on: 'numx',
  label: 'key',
} as const;
const CARG_T = { id: 'id!', then: 'expr!', if: lits(16), unless: lits(16), weight: 'numx', on: 'numx', label: 'key' } as const;
const STD_T = { lit: 'expr!', ps: ('enum:' + PS.join('|') + '!') as EnumReq } as const;
const POS_T = {
  kind: ('enum:' + HOH.join('|') + '!') as EnumReq,
  holder: 'id!',
  other: 'id!',
  act: 'expr!',
  passive: 'bool',
  on: 'numx',
} as const;
const ASK_T = { kind: ('enum:' + HOH.join('|') + '!') as EnumReq, holder: 'id!', other: 'id!', act: 'expr!' } as const;
const ISSUE_T = {
  id: 'id!',
  p: 'numx',
  prior: 'numx',
  lr: { $list: 'numx', max: 32 },
  standard: ('enum:' + STANDARDS.join('|')) as EnumOpt,
  threshold: 'numx',
  burden: 'enum:claimant|defendant',
  presumed: 'ref',
  mode: 'enum:thayer|morgan',
  rebut: 'numx',
  label: 'key',
} as const;
const COST_T = { fp: 'numx!', fn: 'numx!' } as const;
const FACTOR_T = { id: 'id!', side: 'enum:p|d!', label: 'key' } as const;
const VAL_T = { dim: 'ref!', v: 'numx!' } as const;
const DIM_T = { id: 'id!', side: 'enum:p|d!', label: 'key' } as const;
const CASE_T = {
  id: 'id!',
  factors: { $list: 'ref', max: 64 },
  values: { $list: { $obj: VAL_T }, max: 32 },
  outcome: 'enum:p|d!',
  reason: { $list: 'ref', max: 64 },
  label: 'key',
} as const;
const PERIOD_T = { n: 'numx!', unit: 'enum:days|weeks|months|years|business!' } as const;
const TOLL_T = { from: 'expr!', to: 'expr!' } as const;
const EVENT_T = {
  kind: 'enum:offer|counteroffer|revocation|rejection|acceptance|lapse!',
  by: 'id',
  t: 'numx!',
  arrive: 'numx',
  terms: { $list: 'id', max: 32 },
  on: 'numx',
} as const;
const ELEM_T = { id: 'id!', holds: 'numx!', label: 'key' } as const;
const PARTY_T = { id: 'id!', age: 'numx', minAge: 'numx', capable: 'numx' } as const;
const ITEM_T = {
  id: 'id!',
  kind: 'enum:loss|incidental|consequential|cost-avoided|loss-avoided|reliance|benefit!',
  amount: 'numx!',
  foreseeable: 'numx',
  avoidable: 'numx',
  on: 'numx',
  label: 'key',
} as const;
const LIQ_T = { amount: 'numx!', anticipated: 'numx', ratio: 'numx' } as const;
const INT_T = { rate: 'numx!', years: 'numx!', kind: 'enum:simple|compound|continuous', per: 'int:1:366', principal: 'numx' } as const;
const OELEM_T = {
  id: 'id!',
  kind: 'enum:conduct|circumstance|result',
  mind: ('enum:' + MINDS.join('|')) as EnumOpt,
  label: 'key',
} as const;
const OFF_T = {
  id: 'id!',
  elements: { $list: { $obj: OELEM_T }, min: 1, max: 16 },
  mind: ('enum:' + MINDS.join('|')) as EnumOpt,
  grade: 'enum:felony|misdemeanor|violation',
  rank: 'fin',
  label: 'key',
} as const;
const PROVEN_T = { element: 'id!', holds: 'numx!', mind: 'numx' } as const;
const DEF_T = { id: 'id!', kind: 'enum:justification|excuse', holds: 'numx!', offences: { $list: 'ref', max: 16 }, label: 'key' } as const;
const CAUSE_T = { butFor: 'numx', proximate: 'numx' } as const;
const GRID_T = {
  first: 'int:-100:100',
  rows: { $req: true, $list: { $list: 'nonneg', max: 24 }, min: 1, max: 100 },
  cats: { $req: true, $list: 'nonneg', min: 1, max: 12 },
} as const;
const ADJ_T = { id: 'id!', delta: 'numx!', on: 'numx' } as const;
const ALT_T = { id: 'id!', effect: 'numx!', burden: 'numx!', on: 'numx' } as const;
const WF_T = { Ii: 'numx', Wi: 'numx', Ri: 'numx', Ij: 'numx', Wj: 'numx', Rj: 'numx' } as const;
const EXTRA_T = { side: 'enum:i|j!', I: 'numx!', W: 'numx', R: 'numx' } as const;
const VOTER_T = { id: 'id!', weight: 'numx!', pop: 'numx', yes: 'numx', label: 'key' } as const;
const PAT_T = { id: 'id!', template: 'expr!' } as const;
const HEIR_T = { id: 'id!', share: 'numx', first: 'numx', weight: 'numx', claim: 'numx', radd: 'bool', on: 'numx', label: 'key' } as const;
const NORM_T = {
  id: 'id!',
  kind: 'enum:O|F|P!',
  cond: 'expr',
  act: 'expr!',
  deadline: 'expr',
  within: 'int:0:2000',
  until: 'expr',
  rank: 'fin',
  issued: 'fin',
  penalty: 'numx',
  on: 'numx',
} as const;
const STEP_T = { day: 'int:0:2000', date: 'expr', facts: { $list: 'id', max: 64 }, acts: { $list: 'id', max: 64 } } as const;
const MODEL_T = {
  task: ('enum:' + TASKS.join('|') + '!') as EnumReq,
  query: 'expr',
  // rules · aspic · carneades
  rules: { $list: { $obj: RULE_T }, max: MAX_RULES },
  variant: 'enum:blocking|propagating',
  loops: 'enum:undecided|fail',
  sup: { $list: { $obj: SUP_T }, max: 400 },
  order: { $list: 'enum:superior|specialis|posterior', max: 3 },
  facts: lits(200),
  toggles: { $list: { $obj: TOG_T }, max: 64 },
  premises: { $list: { $obj: PREM_T }, max: 100 },
  schemes: { $list: { $obj: SCH_T }, max: 40 },
  link: 'enum:last|weakest',
  closure: 'enum:none|transposition',
  semantics: 'enum:grounded|preferred|stable|complete',
  args: { $list: { $obj: CARG_T }, max: 100 },
  assume: lits(200),
  standards: { $list: { $obj: STD_T }, max: 100 },
  alpha: 'numx',
  beta: 'numx',
  gamma: 'numx',
  // hohfeld · proof · cases
  positions: { $list: { $obj: POS_T }, max: 100 },
  ask: { $obj: ASK_T },
  lindahl: { $obj: { agent: 'id!', atom: 'id!', other: 'id' } },
  issues: { $list: { $obj: ISSUE_T }, max: 32 },
  claim: { $list: 'ref', max: 32 },
  costs: { $obj: COST_T },
  aggregate: 'enum:element|product',
  factors: { $list: { $obj: FACTOR_T }, max: 64 },
  dimensions: { $list: { $obj: DIM_T }, max: 32 },
  values: { $list: { $obj: VAL_T }, max: 32 },
  cases: { $list: { $obj: CASE_T }, max: 100 },
  side: 'enum:p|d',
  focus: 'ref',
  reasoning: 'enum:result|reason',
  // deadline · obligations
  start: 'expr',
  period: { $obj: PERIOD_T },
  excludeStart: 'bool',
  roll: 'enum:next|previous|none',
  monthEnd: 'enum:last|next',
  weekend: { $list: 'int:0:6', max: 7 },
  holidays: lits(400),
  tolling: { $list: { $obj: TOLL_T }, max: 32 },
  longstop: { $obj: PERIOD_T },
  asOf: 'numx',
  // contract · damages
  events: { $list: { $obj: EVENT_T }, max: 64 },
  acceptRule: 'enum:dispatch|receipt',
  revokeRule: 'enum:receipt|dispatch',
  mirror: 'enum:strict|material',
  material: { $list: 'id', max: 32 },
  firm: 'bool',
  elements: { $list: { $obj: ELEM_T }, max: 32 },
  parties: { $list: { $obj: PARTY_T }, max: 16 },
  items: { $list: { $obj: ITEM_T }, max: 64 },
  measure: 'enum:expectation|reliance|restitution',
  price: 'numx',
  market: 'numx',
  liquidated: { $obj: LIQ_T },
  interest: { $obj: INT_T },
  // crime · sentence
  offences: { $list: { $obj: OFF_T }, max: 16 },
  proven: { $list: { $obj: PROVEN_T }, max: 64 },
  defences: { $list: { $obj: DEF_T }, max: 16 },
  causation: { $obj: CAUSE_T },
  grid: { $obj: GRID_T },
  level: 'numx',
  points: 'numx',
  adjust: { $list: { $obj: ADJ_T }, max: 32 },
  min: 'numx',
  max: 'numx',
  // proportionality
  aim: 'numx',
  suitable: 'numx',
  effect: 'numx',
  burden: 'numx',
  alternatives: { $list: { $obj: ALT_T }, max: 16 },
  weights: { $obj: WF_T },
  scale: 'enum:triadic|double|continuous',
  extra: { $list: { $obj: EXTRA_T }, max: 16 },
  // vote
  members: 'numx',
  present: 'numx',
  yes: 'numx',
  no: 'numx',
  abstain: 'numx',
  abstentions: 'enum:excluded|no',
  quorum: 'numx',
  base: 'enum:cast|present|members',
  majority: 'numx',
  strict: 'bool',
  tie: 'enum:fails|chair',
  chair: 'enum:yes|no',
  voters: { $list: { $obj: VOTER_T }, max: MAX_VOTERS },
  quota: 'numx',
  popQuota: 'numx',
  countQuota: 'numx',
  blocking: 'int:0:1000',
  voter: 'ref',
  // citation · shares · obligations
  text: 'expr',
  patterns: { $list: { $obj: PAT_T }, max: 16 },
  kinds: { $list: ('enum:' + CITE_KINDS.join('|')) as EnumOpt, max: 5 },
  heirs: { $list: { $obj: HEIR_T }, max: 32 },
  estate: 'numx',
  deficit: 'enum:radd|escheat',
  division: 'enum:proportional|cea|cel|talmud',
  norms: { $list: { $obj: NORM_T }, max: 200 },
  trace: { $list: { $obj: STEP_T }, max: MAX_DAYS },
  count: 'enum:calendar|business',
  horizon: 'int:1:2000',
  step: 'numx',
} as const;
const REQ: Readonly<Record<string, readonly string[]>> = {
  rules: ['rules'],
  aspic: ['premises|rules|schemes'],
  carneades: ['args'],
  hohfeld: ['positions'],
  proof: ['issues'],
  cases: ['factors|dimensions', 'cases'],
  deadline: ['start', 'period'],
  contract: ['events'],
  damages: ['items|price'],
  crime: ['offences'],
  sentence: ['grid'],
  proportionality: ['weights'],
  vote: ['yes|voters'],
  citation: ['text'],
  shares: ['heirs', 'estate'],
  obligations: ['norms', 'trace'],
};
const TASK_OUT: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
  rules: [['holds', 'definite', 'refuted', 'undecided', 'supported', 'fired', 'defeated', 'blocked', 'conclusions', 'status'], ['status']],
  aspic: [['accepted', 'credulous', 'arguments', 'attacks', 'defeats', 'extensions', 'inCount', 'status'], ['labels']],
  carneades: [['acceptable', 'negation', 'applicable', 'arguments', 'status'], ['applicable']],
  hohfeld: [['holds', 'contradictions', 'conflicts', 'positions', 'derived', 'lindahl', 'lindahlOther', 'joint', 'jointCount'], ['joint']],
  proof: [['established', 'claim', 'posterior', 'threshold', 'product', 'winner'], ['posteriors']],
  cases: [
    ['forced', 'permissible', 'consistent', 'onPoint', 'best', 'mostOnPoint', 'shared', 'distinctions', 'binding'],
    ['shared', 'binding'],
  ],
  deadline: [
    ['end', 'endY', 'endM', 'endD', 'weekday', 'days', 'businessDays', 'extended', 'expired', 'remaining', 'tolled', 'longstopEnd'],
    [],
  ],
  contract: [['formed', 'formedAt', 'binding', 'voidable', 'failed', 'offers'], []],
  damages: [['damages', 'expectation', 'reliance', 'restitution', 'mitigated', 'excluded', 'interest', 'total', 'liquidated'], ['balance']],
  crime: [['liable', 'offence', 'elements', 'met', 'failed', 'required', 'mens'], ['met']],
  sentence: [['level', 'category', 'lo', 'hi', 'mid'], []],
  proportionality: [['legitimate', 'suitable', 'necessary', 'weight', 'balance', 'proportionate', 'stage'], []],
  vote: [
    ['quorate', 'passes', 'needed', 'margin', 'cast', 'yesShare', 'popShare', 'countShare', 'banzhaf', 'shapley'],
    ['banzhaf', 'shapley'],
  ],
  citation: [['valid', 'kind', 'year', 'volume', 'page', 'number', 'depth', 'field'], []],
  shares: [
    ['share', 'amount', 'total', 'awl', 'radd', 'residue', 'escheat'],
    ['shares', 'amounts'],
  ],
  obligations: [['violations', 'fulfilments', 'pending', 'conflicts', 'penalties', 'steps', 'frame'], ['violationsPerStep']],
};
/* which list an output's `at` names, per task and `of` */
const AT_OF: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  rules: { status: 'rules' },
  aspic: { status: 'rules|schemes' },
  carneades: { status: 'args' },
  proof: { established: 'issues', posterior: 'issues', threshold: 'issues', winner: 'issues' },
  cases: { shared: 'cases', distinctions: 'cases', binding: 'cases' },
  crime: { elements: 'offences', met: 'offences', failed: 'offences', required: 'offences', mens: 'offences' },
  vote: { banzhaf: 'voters', shapley: 'voters' },
  shares: { share: 'heirs', amount: 'heirs' },
};
/** the model of a law@1 spec, the spec */
type LawModel = ModelOf<typeof MODEL_T>;
interface OutputIn {
  readonly id: unknown;
  readonly kind?: string;
  readonly of?: string;
  readonly code?: string;
  readonly at?: unknown;
  readonly name?: unknown;
}
type LawSpec = Spec & { readonly model: LawModel; readonly outputs?: readonly (OutputIn | null)[] };
const CODES = [
  'inconsistent',
  'undecided',
  'unresolved',
  'budget',
  'no-stable',
  'contradiction',
  'conflict',
  'conjunction',
  'shifted',
  'probability',
  'no-precedent',
  'month-end',
  'rolled',
  'tolled',
  'longstop',
  'expired',
  'counteroffer',
  'revoked',
  'lapsed',
  'rejected',
  'in-transit',
  'late',
  'mirror',
  'minor',
  'unforeseeable',
  'avoidable',
  'penalty',
  'negative',
  'default-mind',
  'strict-liability',
  'causation',
  'defence',
  'grid-range',
  'clamped',
  'stalemate',
  'scale',
  'no-quorum',
  'tie',
  'casting',
  'blocking',
  'no-match',
  'awl',
  'radd',
  'escheat',
  'no-heirs',
  'claims-short',
  'parse',
  'trace-truncated',
  'weight',
  'value',
  'loop',
];

/* =====================================================================================================================
     2. Literals (through logic@1's parser), dates (proleptic Gregorian), citation templates */
/** lit(text) → 'p' | '~p' | null (a literal: an atom or a negated atom, parsed by logic@1) */
function parseLit(s: unknown): LitRes {
  const L = LG();
  if (!L || typeof s !== 'string') return { ok: false, code: 'parse', msg: 'logic@1 is not loaded' };
  const r = L.parse(s, 'prop');
  if (!r.ok) return r;
  const a = r.ast;
  if (a.t === 'atom') return { ok: true, lit: a.n! };
  if (a.t === 'not' && a.a!.t === 'atom') return { ok: true, lit: '~' + a.a!.n! };
  return { ok: false, code: 'literal', msg: 'needs a literal (p or ~p)' };
}
const lit = (s: unknown): string | null => {
  const r = parseLit(s);
  return r.ok ? r.lit : null;
};
const neg = (l: string) => (l.startsWith('~') ? l.slice(1) : '~' + l);
const atomOf = (l: string) => (l.startsWith('~') ? l.slice(1) : l);
/* days from civil (Hinnant 2013): the day number since 1970-01-01 of a proleptic Gregorian date */
function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400),
    yoe = y - era * 400,
    doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1,
    doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z: number): [number, number, number] {
  z += 719468;
  const era = Math.floor(z / 146097),
    doe = z - era * 146097,
    yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365),
    y = yoe + era * 400,
    doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)),
    mp = Math.floor((5 * doy + 2) / 153),
    d = doy - Math.floor((153 * mp + 2) / 5) + 1,
    m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
}
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthLen = (y: number, m: number): number => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** a date 'YYYY-MM-DD' between 1600 and 2400 that exists → its day number, else null */
function dayOf(s: unknown): number | null {
  const m = typeof s === 'string' ? DATE_RE.exec(s) : null;
  if (!m) return null;
  const y = +m[1]!,
    mo = +m[2]!,
    d = +m[3]!;
  if (y < 1600 || y > 2400 || mo < 1 || mo > 12 || d < 1 || d > monthLen(y, mo)) return null;
  return daysFromCivil(y, mo, d);
}
const weekdayOf = (z: number) => ((z % 7) + 7 + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sunday … 6 = Saturday (as JS Date.getUTCDay)
/** add months the way EU Reg. 1182/71 Art. 3(2)(c) and BGB §188(2)–(3) do: the same date, or the month's last day (or the next day's overflow) */
function addMonths(z: number, n: number, monthEnd?: string, D?: DiagSink | null): number {
  const [y, m, d] = civilFromDays(z),
    k = y * 12 + (m - 1) + n,
    Y = Math.floor(k / 12),
    M = k - Y * 12 + 1,
    L = monthLen(Y, M);
  if (d <= L) return daysFromCivil(Y, M, d);
  if (D) D.add('month-end');
  return monthEnd === 'next' ? daysFromCivil(Y, M, L) + (d - L) : daysFromCivil(Y, M, L);
}
/* citation templates: literal text and {name:int|word|text|year}; spaces match any run of spaces */
const PH_RE = /^\{([A-Za-z_][A-Za-z0-9_]{0,31}):(int|word|text|year)\}/;
/** template(t) → {ok, re, fields: [[name, type]]} or {ok: false, msg} */
function template(t: unknown): Tpl {
  if (typeof t !== 'string' || t.length > 200) return { ok: false, msg: 'a template of at most 200 characters' };
  let re = '^',
    i = 0;
  const fields: [string, string][] = [];
  while (i < t.length) {
    const c = t[i]!;
    if (c === '{') {
      const m = PH_RE.exec(t.slice(i));
      if (!m) return { ok: false, msg: `a placeholder is {name:int}, {name:word}, {name:text} or {name:year} (at ${i})` };
      if (fields.some(f => f[0] === m[1])) return { ok: false, msg: `the placeholder ${m[1]!} is used twice` };
      fields.push([m[1]!, m[2]!]);
      if (fields.length > 12) return { ok: false, msg: 'at most 12 placeholders' };
      re += ({ int: '([0-9]{1,9})', word: '([^\\s]{1,40}?)', text: '(.{1,64}?)', year: '([0-9]{4})' } as Readonly<Record<string, string>>)[
        m[2]!
      ]!;
      i += m[0].length;
      continue;
    }
    if (c === '}') return { ok: false, msg: `a "}" without its "{" (at ${i})` };
    if (c === ' ') {
      while (t[i] === ' ') i++;
      re += '\\s+';
      continue;
    }
    re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    i++;
  }
  if (!fields.length) return { ok: false, msg: 'needs at least one placeholder' };
  return { ok: true, re: re + '$', fields };
}

/* =====================================================================================================================
     3. checkSpec / exprs / keys (the same as the former Python twin check_spec / exprs / keys (tests/fixtures/parity/lib_law.json)) */
const ATOM_OK = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
function litFields(m: LawModel): [string, string][] {
  // every literal of the model, in a fixed order: [text, path]
  const out: [string, string][] = [],
    L = (arr: unknown, base: string, f: string) => {
      if (Array.isArray(arr))
        arr.forEach((x, i) => {
          if (isObj(x) && typeof x[f] === 'string') out.push([x[f], `${base}[${i}].${f}`]);
        });
    };
  const LL = (arr: unknown, base: string, f: string) => {
    if (Array.isArray(arr))
      arr.forEach((x, i) => {
        if (isObj(x) && Array.isArray(x[f]))
          x[f].forEach((s, j) => {
            if (typeof s === 'string') out.push([s, `${base}[${i}].${f}[${j}]`]);
          });
      });
  };
  const S = (arr: unknown, base: string) => {
    if (Array.isArray(arr))
      arr.forEach((s, i) => {
        if (typeof s === 'string') out.push([s, `${base}[${i}]`]);
      });
  };
  const t = m.task;
  if (['rules', 'aspic', 'carneades'].includes(t)) {
    if (typeof m.query === 'string') out.push([m.query, 'model.query']);
    LL(m.rules, 'model.rules', 'if');
    L(m.rules, 'model.rules', 'then');
    LL(m.rules, 'model.rules', 'unless');
    S(m.facts, 'model.facts');
    L(m.toggles, 'model.toggles', 'lit');
    L(m.premises, 'model.premises', 'lit');
    LL(m.schemes, 'model.schemes', 'if');
    L(m.schemes, 'model.schemes', 'then');
    if (Array.isArray(m.schemes))
      m.schemes.forEach((s, i) => {
        if (isObj(s) && Array.isArray(s.cqs))
          s.cqs.forEach((q, j) => {
            if (isObj(q) && typeof q.lit === 'string') out.push([q.lit, `model.schemes[${i}].cqs[${j}].lit`]);
          });
      });
    LL(m.args, 'model.args', 'if');
    L(m.args, 'model.args', 'then');
    LL(m.args, 'model.args', 'unless');
    S(m.assume, 'model.assume');
    L(m.standards, 'model.standards', 'lit');
  }
  if (t === 'hohfeld') {
    L(m.positions, 'model.positions', 'act');
    if (isObj(m.ask) && typeof m.ask.act === 'string') out.push([m.ask.act, 'model.ask.act']);
  }
  return out;
}
function dupes(arr: unknown, base: string, E: Emit, what: string): Set<string> {
  const seen = new Set<string>();
  if (Array.isArray(arr))
    arr.forEach((x: unknown, i: number) => {
      if (isObj(x) && typeof x.id === 'string') {
        if (seen.has(x.id)) E('duplicate', `${base}[${i}].id`, `the ${what} ${x.id} is listed twice`);
        seen.add(x.id);
      }
    });
  return seen;
}
const idsOf = (arr: unknown) =>
  new Set(
    (Array.isArray(arr) ? (arr as unknown[]) : []).filter((x): x is { id: string } => isObj(x) && typeof x.id === 'string').map(x => x.id),
  );
/** checkSpec(spec) → [{code, path, msg, level}] (the same as the former Python twin check_spec (tests/fixtures/parity/lib_law.json)) */
function checkSpec(spec: unknown): Problem[] {
  const { P, E, W } = C.problems();
  const m = (isObj(spec) ? spec.model : undefined) as LawModel | undefined;
  const KINDS = ['scalar', 'series', 'scene'];
  if (!isObj(m)) {
    E('format', 'model', 'not an object');
    C.checkOutputs(spec, ID, KINDS, () => true, E, W);
    return P;
  }
  C.walk(m, MODEL_T, 'model', E, W);
  if (C.hasErrors(P)) {
    C.checkOutputs(spec, ID, KINDS, () => true, E, W);
    return P;
  }
  const task = m.task;
  for (const r of REQ[task]!.filter(r => !r.split('|').some(f => (m as Rec)[f] !== undefined)))
    E('value', 'model.' + r.split('|')[0]!, `missing (${task} needs ${REQ[task]!.map(x => x.split('|').join(' or ')).join(', ')})`);
  for (const [s, p] of litFields(m)) {
    const r = parseLit(s);
    if (!r.ok) E(r.code, p, r.msg);
  }
  // ids and references
  const rules = dupes(m.rules, 'model.rules', E, 'rule'),
    schemes = dupes(m.schemes, 'model.schemes', E, 'scheme');
  for (const k of [
    'args',
    'issues',
    'factors',
    'dimensions',
    'cases',
    'elements',
    'parties',
    'items',
    'offences',
    'defences',
    'adjust',
    'alternatives',
    'voters',
    'patterns',
    'heirs',
    'norms',
  ] as const)
    dupes(m[k], 'model.' + k, E, k === 'args' ? 'argument' : k.replace(/ies$/, 'y').replace(/s$/, ''));
  if (Array.isArray(m.rules) && Array.isArray(m.schemes))
    m.schemes.forEach((s: { readonly id: string }, i: number) => {
      if (rules.has(s.id)) E('duplicate', `model.schemes[${i}].id`, `the id ${s.id} is a rule too`);
    });
  (m.sup || []).forEach((s, i) => {
    for (const f of ['win', 'lose'] as const)
      if (!rules.has(s[f]) && !schemes.has(s[f])) E('ref', `model.sup[${i}].${f}`, 'not a rule of the model');
  });
  if (task === 'aspic' || task === 'rules')
    (m.rules || []).forEach((r, i) => {
      if (task === 'aspic' && r.kind === 'defeater')
        E(
          'value',
          `model.rules[${i}].kind`,
          'aspic has strict and defeasible rules (a defeater is an undercutter: a rule that concludes ~<rule id>)',
        );
    });
  (m.schemes || []).forEach((s, i) => {
    (s.cqs || []).forEach((q, j) => {
      if (!SCHEMES[s.scheme]!.includes(q.cq))
        E('cq', `model.schemes[${i}].cqs[${j}].cq`, `not a critical question of ${s.scheme}: ${SCHEMES[s.scheme]!.join(', ')}`);
    });
  });
  if (task === 'carneades' && Array.isArray(m.args)) {
    const cyc = carneadesCycle(m.args);
    if (cyc) E('cycle', 'model.args', `the arguments form a cycle through ${cyc} (Carneades needs an acyclic graph)`);
  }
  if (task === 'proof') {
    const iss = idsOf(m.issues);
    (m.issues || []).forEach((s, i) => {
      if (s.presumed !== undefined && !iss.has(s.presumed)) E('ref', `model.issues[${i}].presumed`, 'not an issue of the model');
      if (s.presumed === s.id) E('value', `model.issues[${i}].presumed`, 'an issue cannot presume itself');
      if (s.standard === 'custom' && s.threshold === undefined)
        E('value', `model.issues[${i}].threshold`, 'missing (a custom standard needs its threshold)');
      if (s.standard === 'decision' && m.costs === undefined)
        E('value', 'model.costs', 'missing (the decision standard needs costs fp and fn)');
    });
    (m.claim || []).forEach((c, i) => {
      if (!iss.has(c)) E('ref', `model.claim[${i}]`, 'not an issue of the model');
    });
    if (typeof m.query === 'string' && !iss.has(m.query)) E('ref', 'model.query', 'not an issue of the model');
  }
  if (task === 'cases') {
    const fs = idsOf(m.factors),
      cs = idsOf(m.cases);
    (m.cases || []).forEach((c, i) => {
      for (const f of ['factors', 'reason'] as const)
        (c[f] || []).forEach((x, j) => {
          if (!fs.has(x)) E('ref', `model.cases[${i}].${f}[${j}]`, 'not a factor of the model');
        });
    });
    (m.facts || []).forEach((x, j) => {
      if (!fs.has(x)) E('ref', `model.facts[${j}]`, 'not a factor of the model');
    });
    (m.toggles || []).forEach((x, j) => {
      if (!fs.has(x.lit)) E('ref', `model.toggles[${j}].lit`, 'not a factor of the model');
    });
    if (m.focus !== undefined && !cs.has(m.focus)) E('ref', 'model.focus', 'not a case of the model');
    const ds = idsOf(m.dimensions);
    (m.cases || []).forEach((c, i) => {
      (c.values || []).forEach((x, j) => {
        if (!ds.has(x.dim)) E('ref', `model.cases[${i}].values[${j}].dim`, 'not a dimension of the model');
      });
    });
    (m.values || []).forEach((x, j) => {
      if (!ds.has(x.dim)) E('ref', `model.values[${j}].dim`, 'not a dimension of the model');
    });
  }
  if (task === 'deadline' || task === 'obligations') {
    if (m.start !== undefined && dayOf(m.start) === null) E('date', 'model.start', 'needs a date YYYY-MM-DD that exists (1600–2400)');
    (m.holidays || []).forEach((h, i) => {
      if (dayOf(h) === null) E('date', `model.holidays[${i}]`, 'needs a date YYYY-MM-DD that exists (1600–2400)');
    });
    (m.tolling || []).forEach((t, i) => {
      for (const f of ['from', 'to'] as const)
        if (dayOf(t[f]) === null) E('date', `model.tolling[${i}].${f}`, 'needs a date YYYY-MM-DD that exists (1600–2400)');
      if (dayOf(t.from) !== null && dayOf(t.to) !== null && dayOf(t.to)! < dayOf(t.from)!)
        E('value', `model.tolling[${i}].to`, 'ends before it starts');
    });
    (m.trace || []).forEach((s, i) => {
      if (s.date !== undefined && dayOf(s.date) === null)
        E('date', `model.trace[${i}].date`, 'needs a date YYYY-MM-DD that exists (1600–2400)');
      if (s.date !== undefined && s.day !== undefined) E('value', `model.trace[${i}].day`, 'give day or date, not both');
    });
    if (task === 'obligations' && m.start === undefined && (m.trace || []).some(s => s.date !== undefined))
      E('value', 'model.start', 'missing (dated steps need the start date)');
    if (task === 'obligations' && m.count === 'business' && m.start === undefined)
      E('value', 'model.start', 'missing (business days need the start date)');
  }
  if (task === 'obligations')
    (m.norms || []).forEach((nm, i) => {
      for (const f of ['cond', 'act', 'deadline', 'until'] as const)
        if (typeof nm[f] === 'string') {
          const r = LG() ? LG()!.parse(nm[f], 'prop') : { ok: false, code: 'parse', msg: 'logic@1 is not loaded' };
          if (!r.ok) E(r.code, `model.norms[${i}].${f}`, r.msg);
        }
    });
  if (task === 'crime') {
    const os = idsOf(m.offences),
      els = new Set();
    (m.offences || []).forEach((o, i) => {
      const seen = new Set();
      (o.elements || []).forEach((e, j) => {
        if (seen.has(e.id)) E('duplicate', `model.offences[${i}].elements[${j}].id`, `the element ${e.id} is listed twice`);
        seen.add(e.id);
        els.add(e.id);
      });
    });
    (m.proven || []).forEach((p, i) => {
      if (!els.has(p.element)) E('ref', `model.proven[${i}].element`, 'not an element of an offence');
    });
    (m.defences || []).forEach((d, i) => {
      (d.offences || []).forEach((x, j) => {
        if (!os.has(x)) E('ref', `model.defences[${i}].offences[${j}]`, 'not an offence of the model');
      });
    });
  }
  if (task === 'sentence' && isObj(m.grid)) {
    const k = m.grid.cats.length;
    m.grid.rows.forEach((r, i) => {
      if (r.length !== 2 * k) E('grid', `model.grid.rows[${i}]`, `needs ${2 * k} numbers (low and high for each of the ${k} categories)`);
    });
    m.grid.cats.forEach((c, i) => {
      if (i && c <= m.grid!.cats[i - 1]!) E('grid', `model.grid.cats[${i}]`, "the categories' lower bounds must rise");
    });
  }
  if (task === 'vote' && m.voter !== undefined && !idsOf(m.voters).has(m.voter)) E('ref', 'model.voter', 'not a voter of the model');
  if (task === 'citation') {
    if (typeof m.text === 'string' && m.text.length > MAX_TEXT) E('size', 'model.text', `longer than ${MAX_TEXT} characters`);
    (m.patterns || []).forEach((p, i) => {
      const r = template(p.template);
      if (!r.ok) E('pattern', `model.patterns[${i}].template`, r.msg);
    });
  }
  if (task === 'hohfeld') {
    const people = new Set();
    (m.positions || []).forEach(p => {
      people.add(p.holder);
      people.add(p.other);
    });
    (m.positions || []).forEach((p, i) => {
      if (p.holder === p.other) E('value', `model.positions[${i}].other`, 'a jural relation holds between two different persons');
    });
    if (isObj(m.ask) && m.ask.holder === m.ask.other) E('value', 'model.ask.other', 'a jural relation holds between two different persons');
    (m.positions || []).forEach((p, i) => {
      if (p.passive === true && typeof p.act === 'string' && (lit(p.act) || '').startsWith('~'))
        E('value', `model.positions[${i}].act`, 'a passive position names an atom (p, not ~p)');
    });
    if (isObj(m.lindahl) && m.lindahl.other === m.lindahl.agent) E('value', 'model.lindahl.other', 'needs a second agent');
  }
  const [SC, SE] = TASK_OUT[task]!;
  C.checkOutputs(
    spec,
    ID,
    KINDS,
    (o, at) => {
      for (const k of Object.keys(o))
        if (!['id', 'kind', 'of', 'code', 'at', 'name'].includes(k)) W('unknown-field', at + '.' + k, 'ignored');
      const list = o.kind === 'scalar' ? SC.concat(['flag']) : o.kind === 'series' ? SE : ['drawing'];
      if (!list.includes(o.of)) {
        E('output', at + '.of', `${o.kind} outputs of ${ID} for ${task}: ${list.join(', ') || 'none'}`);
        return;
      }
      if (o.kind === 'scalar' && o.of === 'flag') {
        if (!CODES.includes(o.code as string)) E('enum', at + '.code', 'one of ' + CODES.join(', '));
      } else if (o.code !== undefined) W('unknown-field', at + '.code', 'ignored');
      const lists = o.kind === 'scalar' && AT_OF[task] && AT_OF[task][o.of];
      if (o.at !== undefined) {
        if (!lists) W('unknown-field', at + '.at', 'ignored');
        else if (typeof o.at !== 'string' || !lists.split('|').some(l => idsOf((m as Rec)[l]).has(o.at as string)))
          E('ref', at + '.at', `not an id of model.${lists.split('|').join(' or model.')}`);
      }
      if (task === 'citation' && o.of === 'field') {
        if (typeof o.name !== 'string' || !ATOM_OK.test(o.name))
          E('value', at + '.name', 'needs the name of a field (e.g. year, volume, page)');
      } else if (o.name !== undefined) W('unknown-field', at + '.name', 'ignored');
    },
    E,
    W,
  );
  return P;
}
/** the Carneades dependency graph: a statement depends on the premises and exceptions of the arguments for it or its negation */
function carneadesCycle(args: readonly unknown[]): string | null {
  const dep = new Map<string, string[]>();
  for (const a of args) {
    if (!isObj(a) || typeof a.then !== 'string') continue;
    const c = atomOf(lit(a.then) || '');
    if (!c) continue;
    if (!dep.has(c)) dep.set(c, []);
    for (const f of ['if', 'unless'])
      for (const s of (a[f] || []) as readonly unknown[]) {
        const l = lit(s);
        if (l) dep.get(c)!.push(atomOf(l));
      }
  }
  const state = new Map<string, number>();
  let found = null as string | null;
  const visit = (v: string) => {
    if (found) return;
    state.set(v, 1);
    for (const w of dep.get(v) || []) {
      if (state.get(w) === 1) {
        found = w;
        return;
      }
      if (!state.has(w)) visit(w);
      if (found) return;
    }
    state.set(v, 2);
  };
  for (const v of [...dep.keys()]) if (!state.has(v)) visit(v);
  return found;
}
/** walk the table in its own order: every value of a walk kind (numx → exprs, key → keys) */
function collect(o: unknown, T: TTable, path: string, kind: string, out: [string, string][]): void {
  if (!isObj(o)) return;
  for (const k of Object.keys(T)) {
    const kd = T[k]!,
      v = o[k],
      p = path + '.' + k;
    if (v === undefined) continue;
    if (typeof kd === 'string') {
      if (kd.replace('!', '') === kind && typeof v === 'string') out.push([v, p]);
      continue;
    }
    if (kd.$obj) collect(v, kd.$obj, p, kind, out);
    else if (kd.$list && Array.isArray(v))
      v.forEach((x, i) => {
        if (typeof kd.$list === 'string') {
          if (kd.$list === kind && typeof x === 'string') out.push([x, `${p}[${i}]`]);
        } else if (kd.$list!.$obj) collect(x, kd.$list!.$obj, `${p}[${i}]`, kind, out);
      });
  }
}
/** exprs(spec) → [[source, path, local names]]: every number of the model written as an expression */
function exprs(spec: unknown): Array<[string, string, string[]]> {
  const out: [string, string][] = [];
  if (isObj(spec) && isObj(spec.model)) collect(spec.model, MODEL_T, 'model', 'numx', out);
  return out.map(([s, p]) => [s, p, []]);
}
/** keys(spec) → [[key, path]]: the labels of the model's parts */
function keys(spec: unknown): Array<[string, string]> {
  const out: [string, string][] = [];
  if (isObj(spec) && isObj(spec.model)) collect(spec.model, MODEL_T, 'model', 'key', out);
  return out;
}

/* =====================================================================================================================
     4. The run */
function diagSet(): Diag {
  const s = new Set<string>();
  return {
    add: c => s.add(c),
    has: c => s.has(c),
    get list() {
      return [...s].sort().map(code => ({ code }));
    },
  };
}
const num = (v: unknown, env: Env, d: number): number => {
  if (v === undefined) return d;
  const x = C.cx(v)(env);
  return Number.isFinite(x) ? x : d;
};
const on = (v: unknown, env: Env) => v === undefined || num(v, env, 1) > 0.5;
const b01 = (b: unknown) => (b ? 1 : 0);
/** a scene of text rows (row i at y = −i): [{s?, key?, v?, c}] with an optional mark column */
function rowsScene(rows: readonly Row[], D: DiagSink): SceneData {
  const n = Math.min(rows.length, Math.floor((C.MAX_SCENE - 1) / 2));
  if (rows.length > n) D.add('scene-truncated');
  const sc = C.scene([0, 40, -(Math.max(n, 1) + 0.5), 0.5]);
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    sc.pt(0.6, -i, { r: 5, c: r.c || 'base' });
    sc.txt(1.4, -i, {
      ...(r.key ? { key: r.key } : r.v !== undefined ? { v: r.v } : { s: short(r.s || '') }),
      c: r.c || 'base',
      anchor: 'start',
    });
  }
  return sc.done();
}
/** a graph scene: nodes on a ring (or at x, y), arrows between them */
function graphScene(nodes: readonly GNode[], edges: readonly GEdge[]): SceneData {
  const n = nodes.length,
    R = n > 1 ? 3 + n * 0.08 : 0;
  const xs = nodes.map((_, i) => Math.cos(Math.PI / 2 - (2 * Math.PI * i) / Math.max(n, 1)) * R),
    ys = nodes.map((_, i) => Math.sin(Math.PI / 2 - (2 * Math.PI * i) / Math.max(n, 1)) * R);
  const sc = C.scene(C.fitView(xs, ys, 0.3));
  for (const e of edges.slice(0, 1500)) {
    const u = e.u,
      v = e.v;
    if (u === v) continue;
    const dx = xs[v]! - xs[u]!,
      dy = ys[v]! - ys[u]!,
      L = Math.hypot(dx, dy) || 1,
      k = 0.3 / L;
    sc.seg(xs[u]! + dx * k, ys[u]! + dy * k, xs[v]! - dx * k, ys[v]! - dy * k, {
      c: e.c || 'muted',
      arrow: true,
      ...(e.dash ? { dash: true } : {}),
    });
  }
  nodes.forEach((nd, i) => {
    sc.pt(xs[i]!, ys[i]!, { r: 7, c: nd.c || 'base', ...(nd.key ? { key: nd.key } : { s: short(nd.s || '') }) });
    if (nd.sub) sc.txt(xs[i]!, ys[i]! - 0.5, { s: short(nd.sub), c: 'muted' });
  });
  return sc.done();
}

/* ---------- 4.1 rules: defeasible logic (Antoniou, Billington, Governatori & Maher 2001, ACM TOCL 2:255) ----------
     +Δq: q is a fact, or a strict rule for q has every body literal +Δ.  −Δq: q is no fact and every strict rule for q has a body literal −Δ.
     +∂q: +Δq, or −Δ∼q and some strict/defeasible rule for q is applicable (body +∂) and every rule s for ∼q is discarded (a body literal −∂)
          or beaten by an applicable strict/defeasible rule t for q with t > s (team defeat, ambiguity blocking).
     −∂q: −Δq and (+Δ∼q, or every strict/defeasible rule for q is discarded, or some rule s for ∼q is applicable and no applicable t for q beats it).
     `unless e` on a rule r is a defeater e ⇝ ∼head(r) with defeater > r (Prakken & Sartor 1996). Priorities: the explicit `sup` first, then
     for each conflicting pair the criteria in `order` (superior: rank; specialis: the strictly larger body; posterior: issued). */
function buildTheory(m: LawModel, env: Env): Theory {
  const R: DRule[] = [],
    facts = new Set<string>();
  for (const s of m.facts || []) {
    const l = lit(s);
    if (l) facts.add(l);
  }
  for (const t of m.toggles || []) {
    const l = lit(t.lit);
    if (l && on(t.on, env)) facts.add(l);
  }
  for (const r of m.rules || []) {
    if (!on(r.on, env)) continue;
    const head = lit(r.then);
    if (!head) continue;
    const body = (r.if || []).map(lit).filter(Boolean) as string[];
    R.push({
      id: r.id,
      body,
      head,
      kind: r.kind || 'defeasible',
      rank: isNum(r.rank) ? r.rank : 0,
      issued: isNum(r.issued) ? r.issued : 0,
      label: r.label,
    });
    (r.unless || []).forEach((e, k) => {
      const el = lit(e);
      if (el)
        R.push({
          id: `${r.id}~${k + 1}`,
          body: [el],
          head: neg(head),
          kind: 'defeater',
          rank: isNum(r.rank) ? r.rank : 0,
          issued: isNum(r.issued) ? r.issued : 0,
          exc: r.id,
        });
    });
  }
  const sup = new Set<string>(),
    idx = new Map(R.map((r, i) => [r.id, i]));
  for (const s of m.sup || []) if (idx.has(s.win) && idx.has(s.lose)) sup.add(s.win + '>' + s.lose);
  for (const r of R) if (r.exc) sup.add(r.id + '>' + r.exc);
  const order = Array.isArray(m.order) ? m.order : ['superior', 'specialis', 'posterior'];
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i]!,
        b = R[j]!;
      if (a.head !== neg(b.head)) continue;
      if (sup.has(a.id + '>' + b.id) || sup.has(b.id + '>' + a.id)) continue;
      let w: [DRule, DRule] | null = null;
      for (const c of order) {
        if (c === 'superior' && a.rank !== b.rank) {
          w = a.rank > b.rank ? [a, b] : [b, a];
          break;
        }
        if (c === 'specialis') {
          const A = new Set(a.body),
            B = new Set(b.body);
          if (A.size > B.size && [...B].every(x => A.has(x))) {
            w = [a, b];
            break;
          }
          if (B.size > A.size && [...A].every(x => B.has(x))) {
            w = [b, a];
            break;
          }
        }
        if (c === 'posterior' && a.issued !== b.issued) {
          w = a.issued > b.issued ? [a, b] : [b, a];
          break;
        }
      }
      if (w) sup.add(w[0].id + '>' + w[1].id);
    }
  return { R, facts, sup };
}
/* defeasible(th, D, opts): opts.variant 'blocking' (default: Antoniou et al. 2001) or 'propagating' (ambiguity propagation through the
     support tags ±Σ: Antoniou, Billington, Governatori, Maher & Rock 2000, "A family of defeasible reasoning logics and its
     implementation", ECAI; Antoniou et al. 2000 AAAI "A flexible framework"):
       +Σq: +Δq, or some strict/defeasible r for q has every body literal +Σ and every s for ∼q is discarded (a body literal −∂) or not s > r
       −Σq: −Δq, and every strict/defeasible r for q has a body literal −Σ or is beaten by an applicable (+∂ body) s for ∼q with s > r
       +∂ / −∂ as in blocking, but an attacker is discarded only when it is unsupported (a body literal −Σ) and it counts against when it
       is supported (every body literal +Σ).
     opts.loops 'undecided' (default: the basic proof theory leaves positive loops undecided) or 'fail' (failure by looping, the
     well-founded defeasible logics: Maier & Nute 2006, "Ambiguity propagating defeasible logic and the well-founded semantics", JELIA;
     Billington 2008, "Propositional clausal defeasible logic", JELIA): after each fixpoint the greatest unfounded set of the undecided
     literals (those with no rule whose body avoids both refuted literals and the set itself) is refuted (−Δ, −∂, −Σ), then the fixpoint
     runs again, until nothing changes. */
function defeasible(th: Theory, D: DiagSink, opts?: { readonly variant?: string | undefined; readonly loops?: string | undefined } | null) {
  const { R, facts, sup } = th,
    U = new Set<string>(),
    prop = opts && opts.variant === 'propagating',
    fail = opts && opts.loops === 'fail';
  for (const f of facts) {
    U.add(f);
    U.add(neg(f));
  }
  for (const r of R) {
    U.add(r.head);
    U.add(neg(r.head));
    for (const b of r.body) {
      U.add(b);
      U.add(neg(b));
    }
  }
  const pD = new Set<string>(),
    mD = new Set<string>(),
    pd = new Set<string>(),
    md = new Set<string>(),
    pS = new Set<string>(),
    mS = new Set<string>();
  const by = new Map([...U].map(q => [q, R.filter(r => r.head === q)]));
  const gt = (a: DRule, b: DRule) => sup.has(a.id + '>' + b.id);
  const sdOf = (q: string) => by.get(q)!.filter(r => r.kind !== 'defeater');
  function fix() {
    for (let pass = 0, ch = true; ch && pass < 6 * U.size + 10; pass++) {
      ch = false;
      for (const q of U) {
        const st = by.get(q)!.filter(r => r.kind === 'strict');
        if (!pD.has(q) && (facts.has(q) || st.some(r => r.body.every(b => pD.has(b))))) {
          pD.add(q);
          ch = true;
        }
        if (!mD.has(q) && !facts.has(q) && st.every(r => r.body.some(b => mD.has(b)))) {
          mD.add(q);
          ch = true;
        }
      }
      for (const q of U) {
        const nq = neg(q),
          sd = sdOf(q),
          att = by.get(nq)!;
        const appl = (r: DRule) => r.body.every(b => pd.has(b)),
          disc = (r: DRule) => r.body.some(b => md.has(b));
        if (prop) {
          if (!pS.has(q) && (pD.has(q) || sd.some(r => r.body.every(b => pS.has(b)) && att.every(s => disc(s) || !gt(s, r))))) {
            pS.add(q);
            ch = true;
          }
          if (!mS.has(q) && mD.has(q) && sd.every(r => r.body.some(b => mS.has(b)) || att.some(s => appl(s) && gt(s, r)))) {
            mS.add(q);
            ch = true;
          }
          const unsup = (s: DRule) => s.body.some(b => mS.has(b)),
            sup_ = (s: DRule) => s.body.every(b => pS.has(b));
          if (!pd.has(q) && (pD.has(q) || (mD.has(nq) && sd.some(appl) && att.every(s => unsup(s) || sd.some(t => appl(t) && gt(t, s)))))) {
            pd.add(q);
            ch = true;
          }
          if (!md.has(q) && mD.has(q) && (pD.has(nq) || sd.every(disc) || att.some(s => sup_(s) && sd.every(t => disc(t) || !gt(t, s))))) {
            md.add(q);
            ch = true;
          }
        } else {
          if (!pd.has(q) && (pD.has(q) || (mD.has(nq) && sd.some(appl) && att.every(s => disc(s) || sd.some(t => appl(t) && gt(t, s)))))) {
            pd.add(q);
            ch = true;
          }
          if (!md.has(q) && mD.has(q) && (pD.has(nq) || sd.every(disc) || att.some(s => appl(s) && sd.every(t => disc(t) || !gt(t, s))))) {
            md.add(q);
            ch = true;
          }
        }
      }
    }
  }
  /** the greatest unfounded set among the literals that are neither proved nor refuted (founded: a fact, proved, or a rule whose body
        avoids the refuted literals and the set) */
  function unfounded(pos: ReadonlySet<string>, negS: ReadonlySet<string>, rulesOf: (q: string) => DRule[], isFact: (q: string) => boolean) {
    const W = new Set([...U].filter(q => !pos.has(q) && !negS.has(q)));
    for (let ch = true, k = 0; ch && k < U.size + 2; k++) {
      ch = false;
      for (const q of [...W])
        if (isFact(q) || rulesOf(q).some(r => r.body.every(b => !negS.has(b) && !W.has(b)))) {
          W.delete(q);
          ch = true;
        }
    }
    return W;
  }
  fix();
  if (fail)
    for (let round = 0; round < U.size + 2; round++) {
      let added = 0;
      for (const q of unfounded(
        pD,
        mD,
        q => by.get(q)!.filter(r => r.kind === 'strict'),
        q => facts.has(q),
      )) {
        mD.add(q);
        added++;
      }
      for (const q of unfounded(pd, md, sdOf, q => pD.has(q))) {
        md.add(q);
        added++;
      }
      if (prop)
        for (const q of unfounded(pS, mS, sdOf, q => pD.has(q))) {
          mS.add(q);
          added++;
        }
      if (!added) break;
      D.add('loop');
      fix();
    }
  if ([...pD].some(q => pD.has(neg(q)))) D.add('inconsistent');
  return { U, pD, mD, pd, md, pS, mS, by, gt };
}
function runRules(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const th = buildTheory(m, env),
    X = defeasible(th, D, { variant: m.variant, loops: m.loops }),
    q = typeof m.query === 'string' ? lit(m.query) : null;
  const st: number[] = [],
    user = th.R.filter(r => !r.exc),
    appl = (r: DRule) => r.body.every(b => X.pd.has(b)),
    disc = (r: DRule) => r.body.some(b => X.md.has(b));
  let fired = 0,
    defeated = 0,
    blocked = 0;
  const status = new Map<string, number>();
  for (const r of th.R) {
    let s;
    if (appl(r)) {
      if (r.kind === 'defeater') s = X.pd.has(neg(r.head)) ? 1 : 2;
      else s = X.pd.has(r.head) ? 2 : 1;
    } else s = disc(r) ? 0 : 0.5;
    status.set(r.id, s);
    // an unresolved conflict: two applicable rules for q and ∼q, neither beats the other, neither conclusion proved
    if (s === 1 && r.kind !== 'defeater') {
      const others = (X.by.get(neg(r.head)) || []).filter(t => appl(t));
      if (others.some(t => !X.gt(t, r) && !X.gt(r, t)) && !X.pd.has(neg(r.head))) D.add('unresolved');
    }
  }
  for (const r of user) {
    const s = status.get(r.id)!;
    if (s === 2) fired++;
    else if (s === 1) defeated++;
    else if (s === 0) blocked++;
    st.push(s);
  }
  if ([...X.U].some(l => !X.pd.has(l) && !X.md.has(l))) D.add('undecided');
  Object.assign(S, {
    holds: q ? b01(X.pd.has(q)) : NaN,
    definite: q ? b01(X.pD.has(q)) : NaN,
    refuted: q ? b01(X.pd.has(neg(q))) : NaN,
    undecided: q ? b01(!X.pd.has(q) && !X.md.has(q)) : NaN,
    supported: q && m.variant === 'propagating' ? b01(X.pS.has(q)) : NaN,
    fired,
    defeated,
    blocked,
    conclusions: [...X.pd].length,
  });
  S.$status = id => (status.has(id) ? status.get(id)! : NaN);
  S.$statusDefault = q ? NaN : NaN;
  SE.status = st;
  const col = (s: number | undefined) => (s === 2 ? 'ok' : s === 1 ? 'bad' : s === 0 ? 'muted' : 'warn');
  const nodes = user.map(r => ({
    s: r.id + ': ' + (r.body.join(' ∧ ') || '⊤') + (r.kind === 'strict' ? ' → ' : r.kind === 'defeater' ? ' ⇝ ' : ' ⇒ ') + r.head,
    key: r.label,
    c: col(status.get(r.id)),
  }));
  const edges: GEdge[] = [];
  user.forEach((a, i) => {
    user.forEach((b, j) => {
      if (a.head === neg(b.head) && X.gt(a, b)) edges.push({ u: i, v: j, c: 'hi' });
    });
  });
  Rn.scene = nodes.length ? graphScene(nodes, edges) : null;
}

/* ---------- 4.2 aspic: ASPIC+ (Modgil & Prakken 2013, AIJ 195:361): arguments from axioms, ordinary premises, strict and defeasible
     rules; undermine / rebut (restricted) / undercut; defeat by last-link or weakest-link with the elitist set ordering; the Dung
     framework solved by logic@1 afSolve (Dung 1995). A scheme instance is a defeasible rule; a raised critical question is an ordinary
     premise cq_<instance>_<cq> (or its lit) with a defeasible rule to ∼<instance>: an undercutter (Walton et al. 2008; Prakken 2005). ---------- */
function runAspic(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const L = LG()!,
    prem: APrem[] = [],
    rules: ARule[] = [];
  for (const p of m.premises || []) {
    if (!on(p.on, env)) continue;
    const l = lit(p.lit);
    if (l) prem.push({ lit: l, kind: p.kind || 'ordinary', rank: isNum(p.rank) ? p.rank : 0 });
  }
  for (const s of m.facts || []) {
    const l = lit(s);
    if (l) prem.push({ lit: l, kind: 'axiom', rank: 0 });
  }
  for (const t of m.toggles || []) {
    const l = lit(t.lit);
    if (l && on(t.on, env)) prem.push({ lit: l, kind: 'axiom', rank: 0 });
  }
  for (const r of m.rules || []) {
    if (!on(r.on, env)) continue;
    const h = lit(r.then);
    if (!h) continue;
    rules.push({
      id: r.id,
      body: (r.if || []).map(lit).filter(Boolean) as string[],
      head: h,
      strict: r.kind === 'strict',
      rank: isNum(r.rank) ? r.rank : 0,
    });
    (r.unless || []).forEach((e, k) => {
      const el = lit(e);
      if (el) rules.push({ id: `${r.id}~${k + 1}`, body: [el], head: '~' + r.id, strict: false, rank: 0, exc: true });
    });
  }
  for (const s of m.schemes || []) {
    if (!on(s.on, env)) continue;
    const h = lit(s.then);
    if (!h) continue;
    rules.push({
      id: s.id,
      body: (s.if || []).map(lit).filter(Boolean) as string[],
      head: h,
      strict: false,
      rank: isNum(s.rank) ? s.rank : 0,
      scheme: s.scheme,
    });
    for (const q of s.cqs || [])
      if (on(q.on, env)) {
        const ql = q.lit !== undefined ? lit(q.lit) : 'cq_' + s.id + '_' + q.cq.replace(/-/g, '_');
        if (!ql) continue;
        prem.push({ lit: ql, kind: 'ordinary', rank: 0 });
        rules.push({ id: s.id + '?' + q.cq, body: [ql], head: '~' + s.id, strict: false, rank: 0, exc: true });
      }
  }
  // closure under transposition (Caminada & Amgoud 2007, AIJ 171:286; Modgil & Prakken 2013 §4): for a strict φ1 … φn → ψ add every
  // φ1 … ¬ψ … φn → ¬φi, so that the rationality postulates (closure, direct and indirect consistency) hold for well-formed theories
  if (m.closure === 'transposition') {
    const seen = new Set(rules.filter(r => r.strict).map(r => [...r.body].sort().join(',') + '>' + r.head));
    for (const r of rules.slice())
      if (r.strict)
        r.body.forEach((phi, i) => {
          const body = r.body.slice();
          body[i] = neg(r.head);
          const head = neg(phi),
            k = [...body].sort().join(',') + '>' + head;
          if (seen.has(k)) return;
          seen.add(k);
          rules.push({ id: `${r.id}^${i + 1}`, body, head, strict: true, rank: r.rank, transposed: true });
        });
  }
  // the arguments: premises, then rules over existing arguments (no conclusion twice on a branch), at most MAX_ARGS
  const A: AArg[] = [],
    keyset = new Set<string>();
  const add = (a: Omit<AArg, 'i'> & { i?: number }) => {
    if (A.length >= MAX_ARGS) {
      D.add('budget');
      return false;
    }
    const k = a.key;
    if (keyset.has(k)) return false;
    keyset.add(k);
    a.i = A.length;
    A.push(a as AArg);
    return true;
  };
  for (const p of prem)
    add({
      key: 'p:' + p.kind + ':' + p.lit,
      conc: p.lit,
      top: null,
      prem: p,
      subs: [],
      concs: new Set([p.lit]),
      def: new Set(),
      last: new Set(),
      ord: p.kind === 'ordinary' ? new Set([p]) : new Set(),
    });
  for (let ch = true, pass = 0; ch && pass < 50 && A.length < MAX_ARGS; pass++) {
    ch = false;
    for (const r of rules) {
      const opts = r.body.map(b => A.filter(a => a.conc === b));
      if (opts.some(o => !o.length)) continue;
      let combos: AArg[][] = [[]];
      for (const o of opts) {
        const nx: AArg[][] = [];
        for (const c of combos)
          for (const a of o) {
            nx.push(c.concat([a]));
            if (nx.length > 2000) break;
          }
        combos = nx;
      }
      for (const subs of combos) {
        if (subs.some(s => s.concs.has(r.head))) continue; // non-circular
        const concs = new Set([r.head]),
          def = new Set<ARule>(),
          ord = new Set<APrem>();
        for (const s of subs) {
          s.concs.forEach(x => concs.add(x));
          s.def.forEach(x => def.add(x));
          s.ord.forEach(x => ord.add(x));
        }
        if (!r.strict) def.add(r);
        const last = r.strict ? new Set(subs.flatMap(s => [...s.last])) : new Set([r]);
        if (add({ key: r.id + '(' + subs.map(s => s.i).join(',') + ')', conc: r.head, top: r, subs, concs, def, last, ord })) ch = true;
        if (A.length >= MAX_ARGS) break;
      }
    }
  }
  const subsOf = (a: AArg) => {
    const out: AArg[] = [],
      seen = new Set<number>();
    (function go(x: AArg): void {
      if (seen.has(x.i)) return;
      seen.add(x.i);
      out.push(x);
      x.subs.forEach(go);
    })(a);
    return out;
  };
  const rank = (x: { readonly rank: number }) => x.rank;
  const lessSet = (S1: ReadonlySet<APrem | ARule>, S2: ReadonlySet<APrem | ARule>) => {
    if (!S1.size) return false;
    if (!S2.size) return true;
    return [...S1].some(x => [...S2].every(y => rank(x) < rank(y)));
  }; // elitist: S1 ◁ S2
  const weakest = m.link === 'weakest';
  const setOf = (a: AArg): ReadonlySet<APrem | ARule> => (weakest ? new Set([...a.def, ...a.ord]) : a.last.size ? a.last : a.ord);
  const less = (a: AArg, b: AArg) => lessSet(setOf(a), setOf(b));
  const att: [number, number][] = [],
    defs: [number, number][] = [];
  for (const a of A)
    for (const b of A) {
      let attacks = false,
        defeats = false;
      for (const s of subsOf(b)) {
        if (s.top && !s.top.strict && a.conc === '~' + s.top.id) {
          attacks = true;
          defeats = true;
          break;
        } // undercut: always a defeat
        if (s.top && !s.top.strict && a.conc === neg(s.conc)) {
          attacks = true;
          if (!less(a, s)) {
            defeats = true;
            break;
          }
        } // rebut (restricted)
        if (!s.top && s.prem!.kind === 'ordinary' && a.conc === neg(s.conc)) {
          attacks = true;
          if (!less(a, s)) {
            defeats = true;
            break;
          }
        } // undermine
      }
      if (attacks) att.push([a.i, b.i]);
      if (defeats) defs.push([a.i, b.i]);
    }
  if (A.some(a => !a.ord.size && !a.def.size && A.some(b => !b.ord.size && !b.def.size && b.conc === neg(a.conc)))) D.add('inconsistent');
  const ld = L.diagSet(),
    r = L.afSolve(A.length, defs, ld);
  if (ld.has('budget')) D.add('budget');
  const sem = m.semantics || 'grounded';
  const exts: number[][] = sem === 'grounded' ? [r.grounded] : r[sem];
  if (sem === 'stable' && !exts.length) D.add('no-stable');
  const q = typeof m.query === 'string' ? lit(m.query) : null;
  const inExt = (l: readonly number[]) => A.some(a => a.conc === q && l[a.i] === 1);
  Object.assign(S, {
    arguments: A.length,
    attacks: att.length,
    defeats: defs.length,
    extensions: exts.length,
    inCount: exts.length ? exts[0]!.filter(v => v === 1).length : 0,
    accepted: q ? b01(exts.length ? exts.every(inExt) : sem === 'stable') : NaN,
    credulous: q ? b01(exts.some(inExt)) : NaN,
  });
  const shown = exts[0] || r.grounded;
  S.$status = id => b01(A.some(a => a.top && a.top.id === id && shown[a.i] === 1));
  SE.labels = A.map(a => shown[a.i]!);
  const nodes = A.map(a => ({
    s: (a.top ? a.top.id + ': ' : '') + a.conc.replace('~', '¬'),
    c: shown[a.i] === 1 ? 'ok' : shown[a.i] === 0 ? 'bad' : 'warn',
  }));
  Rn.scene = A.length
    ? graphScene(
        nodes,
        defs.map(([u, v]) => ({ u, v, c: 'bad' })),
      )
    : null;
}

/* ---------- 4.3 carneades (Gordon, Prakken & Walton 2007; proof standards as in van Gijzel & Nilsson 2014, CarneadesDSL):
     applicable(a): every premise p is assumed, or (∼p is not assumed and p is acceptable); every exception e is not assumed and (∼e is
     assumed or e is not acceptable). acceptable(p) by p's standard over the applicable pro (conclusion p) and con (∼p) arguments:
     scintilla ∃ pro · preponderance max pro > max con · clear-convincing max pro > α ∧ max pro − max con > β · brd: clear-convincing ∧
     max con < γ · dv: ∃ pro ∧ no con. α = 0.4, β = 0.3, γ = 0.2 by default (the DSL's globals). ---------- */
function runCarneades(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const args: CArg[] = [],
    asm = new Set<string>(),
    std = new Map<string, string>();
  for (const s of m.assume || []) {
    const l = lit(s);
    if (l) asm.add(l);
  }
  for (const t of m.toggles || []) {
    const l = lit(t.lit);
    if (l && on(t.on, env)) asm.add(l);
  }
  for (const s of m.standards || []) {
    const l = lit(s.lit);
    if (l) std.set(l, s.ps);
  }
  for (const a of m.args || []) {
    const c = lit(a.then);
    if (!c) continue;
    let w = num(a.weight, env, 1);
    if (w < 0 || w > 1) {
      D.add('weight');
      w = Math.max(0, Math.min(1, w));
    }
    args.push({
      id: a.id,
      conc: c,
      prem: (a.if || []).map(lit).filter(Boolean) as string[],
      exc: (a.unless || []).map(lit).filter(Boolean) as string[],
      w,
      on: on(a.on, env),
      label: a.label,
    });
  }
  const al = num(m.alpha, env, 0.4),
    be = num(m.beta, env, 0.3),
    ga = num(m.gamma, env, 0.2);
  const memoA = new Map<string, boolean>(),
    memoP = new Map<string, boolean>(),
    stack = new Set<string>();
  function applicable(a: CArg): boolean {
    if (!a.on) return false;
    if (memoA.has(a.id)) return memoA.get(a.id)!;
    const ok =
      a.prem.every(p => asm.has(p) || (!asm.has(neg(p)) && acceptable(p))) &&
      a.exc.every(e => !asm.has(e) && (asm.has(neg(e)) || !acceptable(e)));
    memoA.set(a.id, ok);
    return ok;
  }
  function acceptable(p: string): boolean {
    if (memoP.has(p)) return memoP.get(p)!;
    if (stack.has(atomOf(p))) return false; // a cycle (refused by checkSpec): never loop
    stack.add(atomOf(p));
    const pro = args.filter(a => a.conc === p && applicable(a)),
      con = args.filter(a => a.conc === neg(p) && applicable(a));
    stack.delete(atomOf(p));
    const mp = pro.length ? Math.max(...pro.map(a => a.w)) : 0,
      mc = con.length ? Math.max(...con.map(a => a.w)) : 0;
    const ps = std.get(p) || 'scintilla';
    const cc = mp > al && mp - mc > be;
    const v =
      ps === 'scintilla'
        ? pro.length > 0
        : ps === 'preponderance'
          ? mp > mc
          : ps === 'clear-convincing'
            ? cc
            : ps === 'brd'
              ? cc && mc < ga
              : pro.length > 0 && con.length === 0;
    memoP.set(p, v);
    return v;
  }
  const q = typeof m.query === 'string' ? lit(m.query) : null;
  const ap = args.map(applicable);
  Object.assign(S, {
    acceptable: q ? b01(acceptable(q)) : NaN,
    negation: q ? b01(acceptable(neg(q))) : NaN,
    applicable: ap.filter(Boolean).length,
    arguments: args.length,
  });
  S.$status = id => {
    const i = args.findIndex(a => a.id === id);
    return i < 0 ? NaN : b01(ap[i]!);
  };
  SE.applicable = ap.map(b01);
  const st = [...new Set(args.map(a => atomOf(a.conc)).concat(args.flatMap(a => a.prem.concat(a.exc).map(atomOf))))];
  const nodes = st.map(s => ({
    s: (asm.has(s) ? '✓ ' : asm.has('~' + s) ? '✗ ' : '') + s,
    c: acceptable(s) ? 'ok' : acceptable('~' + s) ? 'bad' : 'muted',
  }));
  const edges: GEdge[] = [];
  args.forEach((a, i) => {
    const v = st.indexOf(atomOf(a.conc));
    a.prem.forEach(p => edges.push({ u: st.indexOf(atomOf(p)), v, c: ap[i] ? (a.conc.startsWith('~') ? 'bad' : 'ok') : 'muted' }));
    a.exc.forEach(e => edges.push({ u: st.indexOf(atomOf(e)), v, c: 'warn', dash: true }));
  });
  Rn.scene = nodes.length ? graphScene(nodes, edges) : null;
}

/* ---------- 4.4 hohfeld (Hohfeld 1913, 23 Yale LJ 16; 1917, 26 Yale LJ 710): the first-order relations reduce to one directed duty
     D(x, y, a) "x owes y that a", the second-order to Pw(x, y, c) "x can change y's position by c":
       right(h, o, a) = duty(o, h, a) = D(o, h, a) true · privilege(h, o, a) = noright(o, h, ∼a) = D(h, o, ∼a) false
       power(h, o, c) = liability(o, h, c) = Pw(h, o, c) true · disability(h, o, c) = immunity(o, h, c) = Pw(h, o, c) false
     Correlatives are the same fact read from the other party; opposites the same fact with the other value (a contradiction).
     SDL's D (O a → ¬O ¬a): a duty D(x, y, a) gives the privilege D(x, y, ∼a) false unless stated otherwise; D(a) and D(∼a) both true is a conflict. ---------- */
function hohCanon(kind: string, h: string, o: string, a: string): Canon {
  switch (kind) {
    case 'right':
      return ['D', o, h, a, true];
    case 'duty':
      return ['D', h, o, a, true];
    case 'privilege':
      return ['D', h, o, neg(a), false];
    case 'noright':
      return ['D', o, h, a, false];
    case 'power':
      return ['Pw', h, o, a, true];
    case 'liability':
      return ['Pw', o, h, a, true];
    case 'immunity':
      return ['Pw', o, h, a, false];
    default:
      return ['Pw', h, o, a, false]; // disability
  }
}
function runHohfeld(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const facts = new Map<string, HFact>(),
    stated = new Set<string>();
  const put = (c: Canon, src: string) => {
    const k = c.slice(0, 4).join('|');
    if (!facts.has(k)) facts.set(k, { c, vals: new Set(), src: [] });
    const f = facts.get(k)!;
    f.vals.add(c[4]);
    f.src.push(src);
  };
  for (const p of m.positions || []) {
    if (!on(p.on, env)) continue;
    const a0 = lit(p.act);
    if (!a0) continue;
    const a = p.passive === true ? 'pass:' + atomOf(a0) : a0;
    const c = hohCanon(p.kind, p.holder, p.other, a);
    put(c, 'stated');
    stated.add(c.slice(0, 4).join('|'));
  }
  // SDL D: a stated duty gives the privilege to do it (no duty to the opposite) when nothing says otherwise
  for (const f of [...facts.values()])
    if (f.c[0] === 'D' && f.vals.has(true)) {
      const k = ['D', f.c[1], f.c[2], neg(f.c[3])].join('|');
      if (!facts.has(k)) put(['D', f.c[1], f.c[2], neg(f.c[3]), false], 'sdl');
    }
  let contra = 0,
    conflicts = 0;
  for (const f of facts.values()) if (f.vals.size > 1) contra++;
  for (const f of facts.values())
    if (f.c[0] === 'D' && f.vals.has(true) && !f.c[3].startsWith('~')) {
      const g = facts.get(['D', f.c[1], f.c[2], neg(f.c[3])].join('|'));
      if (g && g.vals.has(true)) conflicts++;
    }
  if (contra) D.add('contradiction');
  if (conflicts) D.add('conflict');
  let holds = NaN;
  if (isObj(m.ask)) {
    const a = lit(m.ask.act);
    if (a) {
      const c = hohCanon(m.ask.kind, m.ask.holder, m.ask.other, a),
        f = facts.get(c.slice(0, 4).join('|'));
      holds = !f ? 0.5 : f.vals.size > 1 ? 0.5 : f.vals.has(c[4]) ? 1 : 0;
    }
  }
  const n = [...facts.values()].reduce((s, f) => s + f.vals.size, 0);
  /* Lindahl 1977 (Position and Change), Kanger 1972; Sergot 2013: x's three exhaustive alternatives about p are Do(x, p), Do(x, ¬p) and
       Pass(x, p) (neither). A duty of x (to anyone) to see to p forbids Do ¬p and Pass; to ¬p forbids Do p and Pass; a duty to stay passive
       (passive: true) forbids both doings. The one-agent type is the set of permitted alternatives (7 non-empty sets; none = a conflict):
       T1 {Do p, Do ¬p, Pass} T2 {Do p, Do ¬p} T3 {Do p, Pass} T4 {Do p} T5 {Do ¬p, Pass} T6 {Do ¬p} T7 {Pass}. Two agents: the 7 joint
       alternatives (Do(x,p) ∧ Do(y,¬p) and its mirror are impossible) permitted when each part is permitted; `joint` is their bit set. */
  const duty = (x: string, a: string) => [...facts.values()].some(f => f.c[0] === 'D' && f.c[1] === x && f.c[3] === a && f.vals.has(true));
  const typeOf = (x: string, p: string) => {
    const dp = !duty(x, '~' + p) && !duty(x, 'pass:' + p),
      dn = !duty(x, p) && !duty(x, 'pass:' + p),
      pa = !duty(x, p) && !duty(x, '~' + p);
    return { alt: [dp, dn, pa], t: dp ? (dn ? (pa ? 1 : 2) : pa ? 3 : 4) : dn ? (pa ? 5 : 6) : pa ? 7 : 0 };
  };
  let lin = NaN,
    linO = NaN,
    joint = NaN,
    jc = NaN,
    jser: number[] = [];
  if (isObj(m.lindahl)) {
    const X1 = typeOf(m.lindahl.agent, m.lindahl.atom);
    lin = X1.t;
    if (!lin) D.add('conflict');
    if (m.lindahl.other !== undefined) {
      const Y1 = typeOf(m.lindahl.other, m.lindahl.atom);
      linO = Y1.t;
      if (!linO) D.add('conflict');
      const J: [number, number][] = [
        [0, 0],
        [0, 2],
        [1, 1],
        [1, 2],
        [2, 0],
        [2, 1],
        [2, 2],
      ]; // (x, y): 0 Do p, 1 Do ¬p, 2 Pass
      jser = J.map(([a, b]) => b01(X1.alt[a]! && Y1.alt[b]!));
      joint = jser.reduce((acc, v, i) => acc + v * (1 << i), 0);
      jc = jser.reduce((a, b) => a + b, 0);
      if (!jc) D.add('conflict');
    }
  }
  Object.assign(S, { lindahl: lin, lindahlOther: linO, joint, jointCount: jc });
  SE.joint = jser;
  Object.assign(S, {
    holds,
    contradictions: contra,
    conflicts,
    positions: 2 * n,
    derived: 2 * n - [...facts.values()].filter(f => f.src.includes('stated')).length,
  });
  const fmt = (c: Canon, v: boolean) =>
    c[0] === 'D'
      ? `${c[1]} →${c[2]} ${v ? 'O' : '¬O'} ${c[3].replace('~', '¬')}`
      : `${c[1]} →${c[2]} ${v ? 'Pw' : '¬Pw'} ${c[3].replace('~', '¬')}`;
  const rows: Row[] = [];
  for (const f of facts.values())
    for (const v of f.vals) rows.push({ s: fmt(f.c, v), c: f.vals.size > 1 ? 'bad' : f.src.includes('stated') ? 'base' : 'muted' });
  Rn.scene = rowsScene(rows, D);
}

/* ---------- 4.5 proof: standards as probability thresholds (data; defaults McCauliff 1982), Kaplan 1968 (p* = Cfp / (Cfp + Cfn)),
     Bayes (posterior odds = prior odds × Π LR), presumptions (Thayer 1898: production only, the bubble bursts on rebutting evidence;
     Morgan 1933: persuasion shifts), the conjunction paradox (Cohen 1977; Allen 1986): element by element vs the product. ---------- */
function runProof(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const kap = isObj(m.costs)
    ? (() => {
        const fp = num(m.costs.fp, env, NaN),
          fn = num(m.costs.fn, env, NaN);
        return fp >= 0 && fn >= 0 && fp + fn > 0 ? fp / (fp + fn) : NaN;
      })()
    : NaN;
  const iss = (m.issues || []).map(s => {
    let p = s.p !== undefined ? num(s.p, env, NaN) : NaN;
    if (s.p === undefined && s.prior !== undefined) {
      const pr = num(s.prior, env, NaN);
      if (pr > 0 && pr < 1) {
        let odds = pr / (1 - pr);
        for (const x of s.lr || []) {
          const l = num(x, env, NaN);
          if (l >= 0) odds *= l;
          else D.add('probability');
        }
        p = Number.isFinite(odds) ? odds / (1 + odds) : 1;
      } else D.add('probability');
    }
    if (Number.isFinite(p) && (p < 0 || p > 1)) {
      D.add('probability');
      p = NaN;
    }
    const sd = s.standard || 'preponderance';
    const t = s.threshold !== undefined ? num(s.threshold, env, NaN) : sd === 'decision' ? kap : STD_P[sd]!;
    return { id: s.id, p, t, burden: s.burden || 'claimant', presumed: s.presumed, mode: s.mode || 'thayer', rebut: num(s.rebut, env, 0) };
  });
  const byId = new Map(iss.map(x => [x.id, x]));
  const est = new Map<string, boolean>(),
    seen = new Set<string>();
  function established(x: Issue): boolean {
    if (est.has(x.id)) return est.get(x.id)!;
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    let v = Number.isFinite(x.p) && x.p > x.t;
    const base = x.presumed !== undefined ? byId.get(x.presumed) : null;
    if (base && established(base)) {
      if (x.mode === 'morgan') {
        v = !(Number.isFinite(x.p) && 1 - x.p > x.t);
        D.add('shifted');
      } // the opponent must disprove to the standard
      else if (!(x.rebut > 0)) {
        v = true;
        D.add('shifted');
      } // Thayer: stands until evidence is produced
    }
    est.set(x.id, v);
    return v;
  }
  iss.forEach(established);
  const claimIds = (Array.isArray(m.claim) && m.claim.length ? m.claim : iss.map(x => x.id)) as readonly string[];
  const cl = claimIds.map(id => byId.get(id)).filter(Boolean) as Issue[];
  const product = cl.reduce((a, x) => a * (Number.isFinite(x.p) ? x.p : 0), 1);
  const tMax = cl.reduce((a, x) => Math.max(a, Number.isFinite(x.t) ? x.t : 0), 0);
  const elementwise = cl.length > 0 && cl.every(x => est.get(x.id));
  const prodOk = product > tMax;
  if (elementwise !== prodOk) D.add('conjunction');
  const q = typeof m.query === 'string' ? byId.get(m.query) : iss[0]!;
  const winner = (x: Issue) => (est.get(x.id) ? (x.burden === 'claimant' ? 1 : -1) : x.burden === 'claimant' ? -1 : 1);
  Object.assign(S, {
    claim: b01(m.aggregate === 'product' ? prodOk : elementwise),
    product,
    established: q ? b01(est.get(q.id)) : NaN,
    posterior: q ? q.p : NaN,
    threshold: q ? q.t : NaN,
    winner: q ? winner(q) : NaN,
  });
  const at = (f: (x: Issue) => number) => (id: string) => {
    const x = byId.get(id);
    return !x ? NaN : f(x);
  };
  S.$at = { established: at(x => b01(est.get(x.id))), posterior: at(x => x.p), threshold: at(x => x.t), winner: at(winner) };
  SE.posteriors = iss.map(x => x.p);
  // the scene: each issue a bar of its probability against its threshold
  const sc = C.scene([-0.2, 1.2, -(iss.length + 0.5), 0.8]);
  iss.forEach((x, i) => {
    sc.seg(0, -i, 1, -i, { c: 'muted', w: 6 });
    if (Number.isFinite(x.p)) sc.seg(0, -i, x.p, -i, { c: est.get(x.id) ? 'ok' : 'bad', w: 6 });
    if (Number.isFinite(x.t)) sc.seg(x.t, -i - 0.3, x.t, -i + 0.3, { c: 'hi', w: 2 });
    sc.txt(0, -i + 0.35, { s: short(x.id), c: 'base', anchor: 'start' });
  });
  Rn.scene = sc.done();
}

/* ---------- 4.6 cases: HYPO (Ashley 1990) on-point cases and the claim lattice; CATO (Aleven 2003) distinctions; Horty 2011 a fortiori
     constraint (result model: all the winner's factors; reason model: the stated reason), case-base consistency, permissible decisions. ---------- */
function runCases(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const side = new Map((m.factors || []).map(f => [f.id, f.side]));
  const cfs = new Set((m.facts || []).filter(f => side.has(f)));
  for (const t of m.toggles || []) if (side.has(t.lit) && on(t.on, env)) cfs.add(t.lit);
  const other = (s: string) => (s === 'p' ? 'd' : 'p');
  // dimensions with magnitudes (Ashley 1990; Bench-Capon & Rissland 2001; Horty 2019 "Reasoning with dimensions and magnitudes",
  // AI & Law 27:309; Prakken 2021): a dimension favours `side` more as its value grows; a value is shared when both cases have one
  const dimSide = new Map((m.dimensions || []).map(d => [d.id, d.side]));
  const valsOf = (list: readonly { readonly dim: string; readonly v: Numx }[] | undefined) => {
    const v = new Map<string, number>();
    for (const x of list || [])
      if (dimSide.has(x.dim)) {
        const y = num(x.v, env, NaN);
        if (Number.isFinite(y)) v.set(x.dim, y);
      }
    return v;
  };
  const cfsV = valsOf(m.values);
  const fav = (d: string, x: number, y: number, s: string) => (dimSide.get(d) === s ? x >= y : x <= y); // x at least as good for s as y on d
  const cases = (m.cases || []).map(c => {
    const fs = new Set(c.factors || []);
    return {
      id: c.id,
      fs,
      vals: valsOf(c.values),
      out: c.outcome,
      pro: [...fs].filter(f => side.get(f) === c.outcome),
      con: [...fs].filter(f => side.get(f) !== c.outcome),
      reason: Array.isArray(c.reason) && c.reason.length ? c.reason : null,
      label: c.label,
    };
  });
  const reasonOf = (c: Precedent) => (m.reasoning === 'reason' && c.reason ? c.reason : c.pro);
  // a fortiori: the reason's factors are present, no other-side factor is new, and on every dimension both have the situation is at least as good for c's winner
  const forces = (c: Precedent, facts: ReadonlySet<string>, vals: ReadonlyMap<string, number>) =>
    reasonOf(c).every(f => facts.has(f)) &&
    [...facts].filter(f => side.get(f) === other(c.out)).every(f => c.fs.has(f)) &&
    [...c.vals].every(([d, y]) => !vals.has(d) || fav(d, vals.get(d)!, y, c.out));
  const shared = (c: Precedent) => [...c.fs].filter(f => cfs.has(f)).concat([...c.vals.keys()].filter(d => cfsV.has(d)).map(d => '@' + d));
  const mySide = m.side || 'p';
  const onp = cases.filter(c => shared(c).length > 0);
  const sup = (a: Precedent, b: Precedent) => {
    const A = new Set(shared(a)),
      B = shared(b);
    return A.size > B.length && B.every(f => A.has(f));
  };
  const most = onp.filter(c => !onp.some(d => d !== c && sup(d, c)));
  const forMe = onp.filter(c => c.out === mySide),
    best = forMe.filter(c => !forMe.some(d => d !== c && sup(d, c)));
  const fP = cases.some(c => c.out === 'p' && forces(c, cfs, cfsV)),
    fD = cases.some(c => c.out === 'd' && forces(c, cfs, cfsV));
  if (fP && fD) D.add('inconsistent');
  if (!onp.length) D.add('no-precedent');
  let consistent = true;
  for (const a of cases) for (const b of cases) if (a.out !== b.out && forces(a, b.fs, b.vals)) consistent = false;
  if (!consistent) D.add('inconsistent');
  // permissible: no precedent forces the other side, and the new decision (result model) forces no opposite precedent
  const nw: Precedent = { fs: cfs, vals: cfsV, out: mySide, pro: [...cfs].filter(f => side.get(f) === mySide), reason: null };
  const permissible =
    !cases.some(c => c.out !== mySide && forces(c, cfs, cfsV)) && !cases.some(c => c.out !== mySide && forces(nw, c.fs, c.vals));
  const distinctions = (c: Precedent) =>
    c.pro.filter(f => !cfs.has(f)).length +
    [...cfs].filter(f => side.get(f) === other(c.out) && !c.fs.has(f)).length +
    [...c.vals].filter(([d, y]) => cfsV.has(d) && !fav(d, cfsV.get(d)!, y, c.out)).length; // CATO (Aleven 2003 §3) + a weaker magnitude
  const focus = m.focus !== undefined ? cases.find(c => c.id === m.focus) : best[0] || most[0]! || cases[0]!;
  Object.assign(S, {
    forced: fP && !fD ? 1 : fD && !fP ? -1 : 0,
    permissible: b01(permissible),
    consistent: b01(consistent),
    onPoint: onp.length,
    best: best.length,
    mostOnPoint: most.length,
    shared: focus ? shared(focus).length : NaN,
    distinctions: focus ? distinctions(focus) : NaN,
    binding: focus ? b01(forces(focus, cfs, cfsV)) : NaN,
  });
  const at = (f: (c: Precedent) => number) => (id: string) => {
    const c = cases.find(x => x.id === id);
    return c ? f(c) : NaN;
  };
  S.$at = { shared: at(c => shared(c).length), distinctions: at(distinctions), binding: at(c => b01(forces(c, cfs, cfsV))) };
  SE.shared = cases.map(c => shared(c).length);
  SE.binding = cases.map(c => b01(forces(c, cfs, cfsV)));
  Rn.scene = rowsScene(
    cases.map(c => ({
      s: `${c.id} (${c.out === 'p' ? 'π' : 'δ'}): ${shared(c).join(', ') || '—'}`,
      c: forces(c, cfs, cfsV) ? 'hi' : !shared(c).length ? 'muted' : c.out === mySide ? 'ok' : 'bad',
    })),
    D,
  );
}

/* ---------- 4.7 deadline: a period from a start date (EU Reg. 1182/71 Art. 3; FRCP 6(a); BGB §§187–193: the conventions are data) ---------- */
function calendar(m: LawModel): Calendar {
  const wk = new Set((Array.isArray(m.weekend) ? m.weekend : [0, 6]) as readonly number[]),
    hol = new Set((m.holidays || []).map(dayOf).filter(z => z !== null));
  const off = (z: number) => wk.has(weekdayOf(z)) || hol.has(z);
  return { wk, hol, off };
}
function addPeriod(z: number, n: number, unit: string, m: LawModel, cal: Calendar, D: DiagSink | null): number {
  n = Math.round(n);
  if (unit === 'days') return z + (m.excludeStart === false ? n - 1 : n);
  if (unit === 'weeks') return z + 7 * n;
  if (unit === 'months') return addMonths(z, n, m.monthEnd, D);
  if (unit === 'years') return addMonths(z, 12 * n, m.monthEnd, D);
  let k = 0,
    d = z + (m.excludeStart === false ? -1 : 0); // business days: the n-th working day after the start
  for (let i = 0; i < 20000 && k < n; i++) {
    d++;
    if (!cal.off(d)) k++;
  }
  return d;
}
function runDeadline(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const z0 = dayOf(m.start),
    cal = calendar(m),
    n = num(m.period!.n, env, NaN);
  if (z0 === null || !Number.isFinite(n) || n < 0 || n > 100000) {
    D.add('value');
    return;
  }
  let end = addPeriod(z0, n, m.period!.unit, m, cal, D);
  const raw = end;
  // tolling: the clock stops on each day of a suspension interval that falls inside the running period (each interval once)
  let tolled = 0;
  const used = new Set();
  for (let pass = 0; pass < 33; pass++) {
    let more = 0;
    (m.tolling || []).forEach((t, i) => {
      if (used.has(i)) return;
      const a = Math.max(dayOf(t.from)!, z0 + 1),
        b = dayOf(t.to)!;
      if (a <= b && a <= end) {
        used.add(i);
        more += b - a + 1;
      }
    });
    if (!more) break;
    tolled += more;
    end += more;
  }
  if (tolled) D.add('tolled');
  let rolled = false;
  if ((m.roll || 'next') !== 'none')
    for (let i = 0; i < 400 && cal.off(end); i++) {
      end += m.roll === 'previous' ? -1 : 1;
      rolled = true;
    }
  if (rolled) D.add('rolled');
  let ls = NaN;
  if (isObj(m.longstop)) {
    const ln = num(m.longstop.n, env, NaN);
    if (Number.isFinite(ln) && ln >= 0) {
      ls = addPeriod(z0, ln, m.longstop.unit, m, cal, null);
      if (end > ls) {
        end = ls;
        D.add('longstop');
      }
    }
  }
  const [y, mo, d] = civilFromDays(end);
  let bd = 0;
  for (let x = z0 + 1; x <= end && x - z0 < 40000; x++) if (!cal.off(x)) bd++;
  const asOf = m.asOf !== undefined ? z0 + Math.floor(num(m.asOf, env, NaN)) : NaN;
  const expired = Number.isFinite(asOf) ? asOf > end : NaN;
  if (expired === true) D.add('expired');
  Object.assign(S, {
    end,
    endY: y,
    endM: mo,
    endD: d,
    weekday: weekdayOf(end),
    days: end - z0,
    businessDays: bd,
    extended: b01(rolled || tolled > 0),
    expired: Number.isFinite(asOf) ? b01(expired) : NaN,
    remaining: Number.isFinite(asOf) ? end - asOf : NaN,
    tolled,
    longstopEnd: ls,
  });
  // the scene: weeks as rows from the start's week to the end's (≤ 60 weeks shown)
  const w0 = z0 - weekdayOf(z0),
    weeks = Math.min(60, Math.floor((end - w0) / 7) + 1);
  if (Math.floor((end - w0) / 7) + 1 > 60) D.add('scene-truncated');
  const sc = C.scene([-0.8, 7, -(weeks + 0.2), 1]);
  const tollDays = new Set<number>();
  (m.tolling || []).forEach(t => {
    for (let x = dayOf(t.from)!; x <= dayOf(t.to)! && tollDays.size < 4000; x++) tollDays.add(x);
  });
  for (let wI = 0; wI < weeks; wI++)
    for (let k = 0; k < 7; k++) {
      const x = w0 + wI * 7 + k,
        dd = civilFromDays(x)[2];
      const c =
        x === end
          ? 'hi'
          : x === raw && raw !== end
            ? 'warn'
            : x === z0
              ? 'info'
              : x === asOf
                ? 'bad'
                : cal.hol.has(x)
                  ? 'warn'
                  : tollDays.has(x)
                    ? 'warn'
                    : cal.wk.has(k)
                      ? 'muted'
                      : x > z0 && x < end
                        ? 'base'
                        : 'muted';
      sc.pt(k + 0.5, -wI, { r: x === end || x === z0 ? 7 : 4, c, v: dd });
    }
  Rn.scene = sc.done();
}

/* ---------- 4.8 contract: formation by events in time (offer, counter-offer, revocation, rejection, acceptance, lapse) ----------
     Effect times: an offer, a rejection and a counter-offer on receipt (Restatement (Second) §§40, 42); a revocation on receipt (Byrne v Van
     Tienhoven 1880) unless revokeRule = dispatch, and never once the acceptance is dispatched (CISG 16(1)) or for a firm offer (UCC 2-205;
     CISG 16(2)); an acceptance on dispatch (Adams v Lindsell 1818) or on receipt (CISG 18(2); BGB §130). Mirror image: an acceptance whose
     terms differ is a counter-offer; with mirror = material only a different term in `material` is (CISG 19(2)–(3); UCC 2-207). A late
     acceptance is a new offer (Restatement §70). Then the criteria (`elements`, data) and capacity (`parties`, age < minAge → voidable). */
function runContract(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const ev = (m.events || [])
    .map((e, i) => ({
      ...e,
      i,
      t: num(e.t, env, NaN),
      arrive: e.arrive !== undefined ? num(e.arrive, env, NaN) : num(e.t, env, NaN),
      on: on(e.on, env),
    }))
    .filter(e => e.on && Number.isFinite(e.t));
  const accRule = m.acceptRule || 'dispatch',
    revRule = m.revokeRule || 'receipt';
  const eff = (e: (typeof ev)[number]) =>
    e.kind === 'lapse'
      ? e.t
      : e.kind === 'acceptance'
        ? accRule === 'dispatch'
          ? e.t
          : e.arrive
        : e.kind === 'revocation'
          ? revRule === 'dispatch'
            ? e.t
            : e.arrive
          : e.arrive;
  const order = ev.slice().sort((a, b) => eff(a) - eff(b) || a.i - b.i);
  let offer = null as { by: string | undefined; terms: readonly string[]; t: number } | null,
    formed = false,
    formedAt = NaN,
    offers = 0;
  const rows: Row[] = [];
  const sameTerms = (a: readonly string[] | undefined, b: readonly string[] | undefined) => {
    const A = new Set(a || []),
      B = new Set(b || []);
    return A.size === B.size && [...A].every(x => B.has(x));
  };
  for (const e of order) {
    if (formed) {
      rows.push({ s: `${e.kind} @ ${eff(e)}`, c: 'muted' });
      continue;
    }
    const k = e.kind;
    if (k === 'offer' || k === 'counteroffer') {
      if (k === 'counteroffer' && offer) D.add('counteroffer');
      offer = { by: e.by, terms: e.terms || [], t: eff(e) };
      offers++;
      rows.push({ s: `${k} ${e.by || ''} @ ${eff(e)}`, c: 'info' });
      continue;
    }
    if (!offer) {
      rows.push({ s: `${k} @ ${eff(e)}`, c: 'muted' });
      continue;
    }
    if (k === 'revocation') {
      const sent = ev.some(a => a.kind === 'acceptance' && a.t >= offer!.t && a.t < eff(e) && (a.by === undefined || a.by !== offer!.by)); // CISG 16(1): too late once the acceptance is sent
      if (m.firm === true || sent || (e.by !== undefined && e.by !== offer.by)) {
        rows.push({ s: `revocation @ ${eff(e)}`, c: 'muted' });
        continue;
      }
      offer = null;
      D.add('revoked');
      rows.push({ s: `revocation @ ${eff(e)}`, c: 'bad' });
      continue;
    }
    if (k === 'rejection' || k === 'lapse') {
      if (k === 'rejection' && e.by === offer.by) {
        rows.push({ s: `${k} @ ${eff(e)}`, c: 'muted' });
        continue;
      }
      offer = null;
      D.add(k === 'lapse' ? 'lapsed' : 'rejected');
      rows.push({ s: `${k} @ ${eff(e)}`, c: 'bad' });
      continue;
    }
    // acceptance
    if (e.by !== undefined && e.by === offer.by) {
      rows.push({ s: `acceptance @ ${eff(e)}`, c: 'muted' });
      continue;
    }
    const extra = (e.terms || []).filter(x => !offer!.terms.includes(x)).concat(offer.terms.filter(x => e.terms && !e.terms.includes(x)));
    const mirrors =
      !e.terms || sameTerms(e.terms, offer.terms) || (m.mirror === 'material' && !extra.some(x => (m.material || []).includes(x)));
    if (!mirrors) {
      D.add('counteroffer');
      offer = { by: e.by, terms: e.terms || [], t: eff(e) };
      offers++;
      rows.push({ s: `acceptance ≠ offer → counteroffer @ ${eff(e)}`, c: 'warn' });
      continue;
    }
    if (e.terms && !sameTerms(e.terms, offer.terms)) D.add('mirror');
    // a revocation already sent but not yet effective when the acceptance was sent: the two crossed in transit
    if (ev.some(r => r.kind === 'revocation' && r.t <= e.t && eff(r) > eff(e))) D.add('in-transit');
    formed = true;
    formedAt = eff(e);
    rows.push({ s: `acceptance ${e.by || ''} @ ${eff(e)}`, c: 'ok' });
  }
  // an acceptance after a lapse found nothing open: it is a late acceptance (a new offer, not counted as formation)
  if (!formed && ev.some(e => e.kind === 'acceptance') && ev.some(e => e.kind === 'lapse')) D.add('late');
  const els = (m.elements || []).map(e => num(e.holds, env, 0) > 0.5);
  const failed = els.indexOf(false) + 1;
  const voidable = (m.parties || []).some(
    p =>
      (p.age !== undefined && num(p.age, env, NaN) < num(p.minAge, env, 18)) || (p.capable !== undefined && num(p.capable, env, 1) <= 0.5),
  );
  if (voidable) D.add('minor');
  Object.assign(S, {
    formed: b01(formed),
    formedAt,
    binding: b01(formed && failed === 0 && !voidable),
    voidable: b01(voidable),
    failed,
    offers,
  });
  (m.elements || []).forEach((e, i) => rows.push({ ...(e.label ? { key: e.label } : { s: e.id }), c: els[i] ? 'ok' : 'bad' }));
  Rn.scene = rowsScene(rows, D);
}

/* ---------- 4.9 damages: Restatement (Second) of Contracts §347 expectation = loss in value + other loss − cost avoided − loss avoided;
     §349 reliance; §371 restitution; §350 avoidable loss; §351 / Hadley v Baxendale 1854 unforeseeable consequential loss; UCC 2-713 market
     differential (market − contract price); §356 liquidated damages vs penalty (sum / anticipated loss > ratio, default 1); interest simple
     P(1 + rt), compound P(1 + r/m)^(mt), continuous P·e^(rt). ---------- */
function runDamages(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  let loss = 0,
    avoided = 0,
    mitigated = 0,
    excluded = 0,
    rel = 0,
    rest = 0;
  const rows = [];
  for (const it of m.items || []) {
    if (!on(it.on, env)) continue;
    const a = num(it.amount, env, NaN);
    if (!Number.isFinite(a)) {
      D.add('value');
      continue;
    }
    const k = it.kind;
    if (k === 'cost-avoided' || k === 'loss-avoided') {
      avoided += a;
      rows.push({ s: `− ${it.id} ${a}`, c: 'info' });
      continue;
    }
    if (k === 'benefit') {
      rest += a;
      rows.push({ s: `${it.id} ${a}`, c: 'base' });
      continue;
    }
    if (k === 'consequential' && it.foreseeable !== undefined && num(it.foreseeable, env, 1) <= 0.5) {
      excluded += a;
      D.add('unforeseeable');
      rows.push({ s: `✗ ${it.id} ${a}`, c: 'bad' });
      continue;
    }
    const av = Math.max(0, Math.min(a, num(it.avoidable, env, 0)));
    if (av > 0) {
      mitigated += av;
      D.add('avoidable');
    }
    if (k === 'reliance') rel += a - av;
    else loss += a - av;
    rows.push({ s: `${it.id} ${a - av}${av ? ` (− ${av})` : ''}`, c: av ? 'warn' : 'ok' });
  }
  if (m.price !== undefined && m.market !== undefined) {
    const diff = num(m.market, env, NaN) - num(m.price, env, NaN);
    if (Number.isFinite(diff)) {
      loss += Math.max(0, diff);
      rows.push({ s: `market − price ${Math.max(0, diff)}`, c: 'ok' });
    }
  }
  let exp = loss - avoided;
  if (exp < 0) {
    D.add('negative');
    exp = 0;
  }
  const measure = m.measure || 'expectation';
  let damages = measure === 'reliance' ? rel : measure === 'restitution' ? rest : exp,
    liq = NaN;
  if (isObj(m.liquidated)) {
    const amt = num(m.liquidated.amount, env, NaN),
      ant = m.liquidated.anticipated !== undefined ? num(m.liquidated.anticipated, env, NaN) : exp,
      ratio = num(m.liquidated.ratio, env, 1);
    if (Number.isFinite(amt)) {
      if (ant > 0 ? amt / ant > ratio : amt > 0) D.add('penalty');
      else {
        damages = amt;
        liq = amt;
      }
    }
  }
  let interest = 0;
  const bal = [];
  if (isObj(m.interest)) {
    const P0 = m.interest.principal !== undefined ? num(m.interest.principal, env, damages) : damages,
      r = num(m.interest.rate, env, NaN),
      T = num(m.interest.years, env, NaN),
      per = m.interest.per || 1,
      kind = m.interest.kind || 'simple';
    const at = (t: number) =>
      kind === 'simple' ? P0 * (1 + r * t) : kind === 'continuous' ? P0 * Math.exp(r * t) : P0 * Math.pow(1 + r / per, per * t);
    if (Number.isFinite(r) && Number.isFinite(T) && T >= 0 && r > -1) {
      interest = at(T) - P0;
      for (let i = 0; i <= 100; i++) bal.push(at((T * i) / 100));
    } else D.add('value');
  }
  Object.assign(S, {
    damages,
    expectation: exp,
    reliance: rel,
    restitution: rest,
    mitigated,
    excluded,
    interest,
    total: damages + interest,
    liquidated: liq,
  });
  SE.balance = bal;
  Rn.scene = rowsScene(rows, D);
}

/* ---------- 4.10 crime: elements with MPC culpability (§2.02): purpose 4 > knowledge 3 > recklessness 2 > negligence 1 (§2.02(5));
     an element's own level, else the offence's (§2.02(4)), else recklessness (§2.02(3), code default-mind); strict liability outside
     violations is flagged (§2.05); a result element needs but-for and proximate causation (§2.03); a defence that holds bars the offence.
     The most serious satisfied offence: the highest rank (else the first listed). ---------- */
function runCrime(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const pv = new Map((m.proven || []).map(p => [p.element, { holds: num(p.holds, env, 0) > 0.5, mind: Math.floor(num(p.mind, env, 0)) }]));
  const cause = !isObj(m.causation) || (num(m.causation.butFor, env, 1) > 0.5 && num(m.causation.proximate, env, 1) > 0.5);
  const res = (m.offences || []).map((o, oi) => {
    const els = o.elements!.map(e => {
      let req = e.mind || o.mind;
      if (!req) {
        req = 'recklessness';
        D.add('default-mind');
      }
      if (req === 'strict' && o.grade !== 'violation') D.add('strict-liability');
      const p = pv.get(e.id) || { holds: false, mind: 0 },
        lv = LEVEL[req]!;
      let ok = p.holds && p.mind >= lv;
      if (ok && e.kind === 'result' && !cause) {
        ok = false;
        D.add('causation');
      }
      return { id: e.id, ok, req: lv, mind: p.mind, label: e.label };
    });
    const barred = (m.defences || []).some(d => num(d.holds, env, 0) > 0.5 && (!(d.offences || []).length || d.offences!.includes(o.id)));
    const sat = els.every(e => e.ok);
    if (sat && barred) D.add('defence');
    return { o, oi, els, liable: sat && !barred, rank: isNum(o.rank) ? o.rank : -oi };
  });
  const best = res.filter(r => r.liable).sort((a, b) => b.rank - a.rank || a.oi - b.oi)[0];
  const fo = res[0];
  const stat = (r: (typeof res)[number]) => {
    const f = r.els.findIndex(e => !e.ok);
    return {
      elements: r.els.length,
      met: r.els.filter(e => e.ok).length,
      failed: f + 1,
      required: f >= 0 ? r.els[f]!.req : Math.max(...r.els.map(e => e.req)),
      mens: f >= 0 ? r.els[f]!.mind : Math.min(...r.els.map(e => e.mind)),
    };
  };
  Object.assign(S, {
    liable: b01(!!best),
    offence: best ? best.oi + 1 : 0,
    ...(fo ? stat(fo) : { elements: NaN, met: NaN, failed: NaN, required: NaN, mens: NaN }),
  });
  const at = (k: 'elements' | 'met' | 'failed' | 'required' | 'mens') => (id: string) => {
    const r = res.find(x => x.o.id === id);
    return r ? stat(r)[k] : NaN;
  };
  S.$at = { elements: at('elements'), met: at('met'), failed: at('failed'), required: at('required'), mens: at('mens') };
  SE.met = fo ? fo.els.map(e => b01(e.ok)) : [];
  const rows = [];
  for (const r of res) {
    rows.push({ ...(r.o.label ? { key: r.o.label } : { s: r.o.id }), c: r.liable ? 'hi' : 'muted' });
    for (const e of r.els)
      rows.push({ ...(e.label ? { key: e.label } : { s: '  ' + e.id + ' ≥ ' + MINDS[4 - e.req]! }), c: e.ok ? 'ok' : 'bad' });
  }
  Rn.scene = rowsScene(rows, D);
}

/* ---------- 4.11 sentence: a grid (rows = levels from `first`, two numbers per category), points → the category whose lower bound
     is reached, adjustments to the level, the statutory limits clamp the range (USSG §5G1.1). ---------- */
function runSentence(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const G = m.grid!,
    first = G.first !== undefined ? G.first : 1,
    k = G.cats.length;
  let lv = Math.round(num(m.level, env, first));
  for (const a of m.adjust || []) if (on(a.on, env)) lv += Math.round(num(a.delta, env, 0));
  if (lv < first || lv > first + G.rows.length - 1) {
    D.add('grid-range');
    lv = Math.max(first, Math.min(first + G.rows.length - 1, lv));
  }
  const pts = num(m.points, env, 0);
  let cat = 0;
  for (let i = 0; i < k; i++) if (pts >= G.cats[i]!) cat = i;
  const row = G.rows[lv - first]!;
  let lo = row[2 * cat]!,
    hi = row[2 * cat + 1]!;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    Object.assign(S, { level: lv, category: cat + 1, lo: NaN, hi: NaN, mid: NaN });
    return;
  }
  const mn = m.min !== undefined ? num(m.min, env, NaN) : NaN,
    mx = m.max !== undefined ? num(m.max, env, NaN) : NaN;
  if (Number.isFinite(mx) && hi > mx) {
    hi = mx;
    if (lo > hi) lo = hi;
    D.add('clamped');
  }
  if (Number.isFinite(mn) && lo < mn) {
    lo = mn;
    if (hi < lo) hi = lo;
    D.add('clamped');
  }
  Object.assign(S, { level: lv, category: cat + 1, lo, hi, mid: (lo + hi) / 2 });
  // the scene: the grid around the cell (± 3 levels)
  const sc = C.scene([-0.5, k + 0.5, -8, 1]);
  for (let r = -3; r <= 3; r++) {
    const L = lv + r;
    if (L < first || L > first + G.rows.length - 1) continue;
    sc.txt(-0.2, -(r + 3), { v: L, c: 'muted' });
    for (let c = 0; c < k; c++)
      sc.txt(c + 0.6, -(r + 3), {
        s: `${G.rows[L - first]![2 * c]!}–${G.rows[L - first]![2 * c + 1]!}`,
        c: r === 0 && c === cat ? 'hi' : 'base',
      });
  }
  Rn.scene = sc.done();
}

/* ---------- 4.12 proportionality: legitimate aim, suitability, necessity (no alternative at least as effective and less burdensome),
     balancing by Alexy's weight formula W_ij = (I_i·W_i·R_i + Σ extra_i) / (I_j·W_j·R_j + Σ extra_j) (Alexy 2003; the additive extension
     Alexy 2007). i: the right the measure infringes; j: the principle it serves. W > 1: the right prevails (disproportionate); W < 1: the
     measure; W = 1: a stalemate (structural discretion: the measure stands). Triadic scale 1, 2, 4 and R 1, ½, ¼; double-triadic 2⁰…2⁸. ---------- */
function runProp(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const w = m.weights!,
    g = (k: 'Ii' | 'Wi' | 'Ri' | 'Ij' | 'Wj' | 'Rj', d: number) => num(w[k], env, d);
  const Ii = g('Ii', 1),
    Wi = g('Wi', 1),
    Ri = g('Ri', 1),
    Ij = g('Ij', 1),
    Wj = g('Wj', 1),
    Rj = g('Rj', 1);
  const sc = m.scale || 'triadic';
  const okI = (x: number) =>
    sc === 'triadic' ? [1, 2, 4].includes(x) : sc === 'double' ? [1, 2, 4, 8, 16, 32, 64, 128, 256].includes(x) : x > 0;
  const okR = (x: number) =>
    sc === 'triadic'
      ? [1, 0.5, 0.25].includes(x)
      : sc === 'double'
        ? [1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.0078125, 0.00390625].includes(x)
        : x > 0 && x <= 1;
  if (![Ii, Wi, Ij, Wj].every(okI) || ![Ri, Rj].every(okR)) D.add('scale');
  let num_ = Ii * Wi * Ri,
    den = Ij * Wj * Rj;
  for (const x of m.extra || []) {
    const v = num(x.I, env, 0) * num(x.W, env, 1) * num(x.R, env, 1);
    if (x.side === 'i') num_ += v;
    else den += v;
  }
  const W = den > 0 ? num_ / den : NaN;
  const legit = num(m.aim, env, 1) > 0.5,
    eff = num(m.effect, env, 1),
    bur = num(m.burden, env, 1);
  const suitable = m.suitable !== undefined ? num(m.suitable, env, 0) > 0.5 : eff > 0;
  const alts = (m.alternatives || []).filter(a => on(a.on, env));
  const better = alts.filter(a => num(a.effect, env, -Infinity) >= eff && num(a.burden, env, Infinity) < bur);
  const necessary = better.length === 0;
  const tie = Number.isFinite(W) && Math.abs(W - 1) < 1e-12;
  if (tie) D.add('stalemate');
  const balance = !Number.isFinite(W) ? NaN : tie ? 0 : W > 1 ? -1 : 1;
  const stage = !legit ? 1 : !suitable ? 2 : !necessary ? 3 : balance === -1 ? 4 : 0;
  Object.assign(S, {
    legitimate: b01(legit),
    suitable: b01(suitable),
    necessary: b01(necessary),
    weight: W,
    balance,
    proportionate: b01(stage === 0 && Number.isFinite(W)),
    stage,
  });
  Rn.scene = rowsScene(
    [
      { s: 'aim', c: legit ? 'ok' : 'bad' },
      { s: 'suitable', c: suitable ? 'ok' : 'bad' },
      { s: 'necessary' + (better.length ? ' ✗ ' + better.map(a => a.id).join(', ') : ''), c: necessary ? 'ok' : 'bad' },
      {
        s: `W = ${Ii}·${Wi}·${Ri} / ${Ij}·${Wj}·${Rj} = ${Number.isFinite(W) ? Math.round(W * 1000) / 1000 : '—'}`,
        c: balance === -1 ? 'bad' : balance === 0 ? 'warn' : 'ok',
      },
    ],
    D,
  );
}

/* ---------- 4.13 vote: quorum, base, threshold, ties (Robert's Rules of Order 12th ed. §44), weighted and double majorities with a
     blocking minority (TEU 16(4)); voting power: Banzhaf 1965 (normalised) and Shapley & Shubik 1954, by enumeration (n ≤ 20) or by
     generating functions on integer weights (Brams & Affuso 1976). ---------- */
function powerIndices(ws: readonly number[], win: (s: number) => boolean): Power | null {
  const n = ws.length,
    bz = new Array<number>(n).fill(0),
    ss = new Array<number>(n).fill(0);
  if (n <= ENUM_VOTERS) {
    const N = 1 << n,
      W = new Uint8Array(N),
      fact = [1];
    for (let i = 1; i <= n; i++) fact[i] = fact[i - 1]! * i;
    for (let s = 0; s < N; s++) W[s] = win(s) ? 1 : 0;
    for (let s = 0; s < N; s++)
      if (W[s]) {
        let k = 0;
        for (let i = 0; i < n; i++) if ((s >> i) & 1) k++;
        for (let i = 0; i < n; i++)
          if ((s >> i) & 1 && !W[s ^ (1 << i)]) {
            bz[i]!++;
            ss[i]! += (fact[k - 1]! * fact[n - k]!) / fact[n]!;
          }
      }
  } else return null;
  const tb = bz.reduce((a, b) => a + b, 0);
  return { banzhaf: bz.map(x => (tb ? x / tb : 0)), shapley: ss, swings: bz };
}
/** exact Banzhaf and Shapley–Shubik for a weighted game [q; w1 … wn] (integer weights), optionally with a member-count quota kmin, by
      generating functions over (coalition size, weight) in BigInt (Brams & Affuso 1976; Bilbao, Fernández, Jiménez Losada & López 2000,
      "Generating functions for computing power indices efficiently", TOP 8:191): the counts of all voters once, then each voter removed by
      deconvolution. Cost ≈ 2 n² Σw; above 4·10⁶ it returns null (code budget). */
function weightedGF(ws: readonly number[], q: number, kmin?: number | null): Power | null {
  const n = ws.length,
    T = ws.reduce((a, b) => a + b, 0),
    W = T + 1;
  if (n * n * W > 4e6) return null;
  kmin = kmin || 0;
  const Cn = Array.from({ length: n + 1 }, () => new Array<bigint>(W).fill(0n));
  Cn[0]![0] = 1n;
  for (let j = 0; j < n; j++)
    for (let k = j; k >= 0; k--) {
      const a = Cn[k]!,
        b = Cn[k + 1]!,
        w = ws[j]!;
      for (let s = T - w; s >= 0; s--) if (a[s]) b[s + w]! += a[s]!;
    }
  const fact = [1n];
  for (let i = 1; i <= n; i++) fact[i] = fact[i - 1]! * BigInt(i);
  const win = (k: number, s: number) => s >= q && k >= kmin;
  const bz: bigint[] = [],
    ss: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = ws[i]!,
      Ci = Array.from({ length: n }, () => new Array<bigint>(W).fill(0n));
    for (let k = 0; k < n; k++) for (let s = 0; s < W; s++) Ci[k]![s] = Cn[k]![s]! - (k > 0 && s >= w ? Ci[k - 1]![s - w]! : 0n);
    let sw = 0n,
      num = 0n;
    for (let k = 0; k < n; k++) {
      let c = 0n;
      for (let s = 0; s + w < W; s++) if (Ci[k]![s] && win(k + 1, s + w) && !win(k, s)) c += Ci[k]![s]!;
      sw += c;
      num += c * fact[k]! * fact[n - k - 1]!;
    }
    bz.push(sw);
    ss.push(Number((num * 10n ** 18n) / fact[n]!) / 1e18);
  }
  const tb = bz.reduce((a, b) => a + b, 0n);
  return { banzhaf: bz.map(x => (tb ? Number((x * 10n ** 18n) / tb) / 1e18 : 0)), shapley: ss, swings: bz.map(Number) };
}
const banzhafGF = (ws: readonly number[], q: number) => {
  const r = weightedGF(ws, q, 0);
  return r ? r.banzhaf : null;
};
function runVote(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const rows: Row[] = [];
  if (Array.isArray(m.voters) && m.voters.length) {
    const V = m.voters.map((v: NonNullable<LawModel['voters']>[number]) => ({
      id: v.id,
      w: num(v.weight, env, NaN),
      pop: num(v.pop, env, 0),
      yes: num(v.yes, env, 0) > 0.5,
      label: v.label,
    }));
    const TW = V.reduce((a, v) => a + v.w, 0),
      TP = V.reduce((a, v) => a + v.pop, 0),
      n = V.length;
    const qa = num(m.quota, env, NaN),
      quota = Number.isFinite(qa) ? (qa <= 1 ? qa * TW : qa) : TW / 2 + 1e-9;
    const pq = num(m.popQuota, env, NaN),
      cq = num(m.countQuota, env, NaN),
      blk = m.blocking || 0;
    const winSet = (members: readonly number[]) => {
      let w = 0,
        p = 0,
        k = 0;
      for (const i of members) {
        w += V[i]!.w;
        p += V[i]!.pop;
        k++;
      }
      const byW = w >= quota - 1e-9,
        byC = !Number.isFinite(cq) || k / n >= cq - 1e-12,
        byP = !Number.isFinite(pq) || (TP > 0 && p / TP >= pq - 1e-12);
      if (byW && byC && byP) return 1;
      if (byW && byC && !byP && blk > 0 && n - k < blk) return 2; // TEU 16(4): fewer than `blocking` members against: deemed attained
      return 0;
    };
    const yesI = V.map((v, i) => (v.yes ? i : -1)).filter(i => i >= 0);
    const r = winSet(yesI);
    if (r === 2) D.add('blocking');
    const yw = yesI.reduce((a, i) => a + V[i]!.w, 0);
    let pw: Power | null = null;
    if (V.every(v => Number.isFinite(v.w) && v.w >= 0)) {
      pw = powerIndices(
        V.map(v => v.w),
        s => {
          const mem: number[] = [];
          for (let i = 0; i < n; i++) if ((s >> i) & 1) mem.push(i);
          return winSet(mem) > 0;
        },
      );
      if (!pw && !Number.isFinite(pq) && V.every(v => Number.isInteger(v.w)))
        pw = weightedGF(
          V.map(v => v.w),
          Math.ceil(quota - 1e-9),
          Number.isFinite(cq) ? Math.ceil(cq * n - 1e-9) : 0,
        );
      if (!pw) D.add('budget');
    }
    const vi = m.voter !== undefined ? V.findIndex(v => v.id === m.voter) : 0;
    Object.assign(S, {
      passes: b01(r > 0),
      quorate: 1,
      cast: yesI.length,
      needed: quota,
      margin: yw - quota,
      yesShare: TW ? yw / TW : NaN,
      popShare: TP ? yesI.reduce((a, i) => a + V[i]!.pop, 0) / TP : NaN,
      countShare: n ? yesI.length / n : NaN,
      banzhaf: pw ? pw.banzhaf[vi]! : NaN,
      shapley: pw ? pw.shapley[vi]! : NaN,
    });
    S.$at = {
      banzhaf: id => {
        const i = V.findIndex(v => v.id === id);
        return pw && i >= 0 ? pw.banzhaf[i]! : NaN;
      },
      shapley: id => {
        const i = V.findIndex(v => v.id === id);
        return pw && i >= 0 ? pw.shapley[i]! : NaN;
      },
    };
    SE.banzhaf = pw ? pw.banzhaf.slice() : [];
    SE.shapley = pw ? pw.shapley.slice() : [];
    V.forEach(v => rows.push({ ...(v.label ? { key: v.label } : { s: `${v.id} ${v.w}` }), c: v.yes ? 'ok' : 'bad' }));
    Rn.scene = rowsScene(rows, D);
    return;
  }
  const M = num(m.members, env, NaN),
    Y = num(m.yes, env, 0),
    N = num(m.no, env, 0),
    A = num(m.abstain, env, 0);
  const P = m.present !== undefined ? num(m.present, env, NaN) : Number.isFinite(M) ? M : Y + N + A;
  const qv = num(m.quorum, env, 0),
    quorate = qv <= 1 ? (Number.isFinite(M) ? P >= qv * M - 1e-9 : qv === 0) : P >= qv;
  if (!quorate) D.add('no-quorum');
  const asNo = m.abstentions === 'no';
  const base = m.base === 'present' ? P : m.base === 'members' ? M : Y + N + (asNo ? A : 0);
  const frac = num(m.majority, env, 0.5),
    strictMore = m.strict !== false;
  const needed = strictMore ? Math.floor(frac * base + 1e-9) + 1 : Math.ceil(frac * base - 1e-9);
  let passes = quorate && Number.isFinite(base) && base > 0 && Y >= needed;
  const noSide = N + (asNo ? A : 0);
  if (quorate && Y === noSide && Y > 0 && frac === 0.5) {
    D.add('tie');
    if (m.tie === 'chair') {
      D.add('casting');
      passes = m.chair === 'yes';
    }
  }
  Object.assign(S, {
    quorate: b01(quorate),
    passes: b01(passes),
    needed,
    margin: Y - needed,
    cast: Y + N,
    yesShare: base > 0 ? Y / base : NaN,
    popShare: NaN,
    countShare: NaN,
    banzhaf: NaN,
    shapley: NaN,
  });
  Rn.scene = rowsScene(
    [
      { v: Y, c: 'ok' },
      { v: N, c: 'bad' },
      { v: A, c: 'muted' },
      { v: needed, c: passes ? 'hi' : 'warn' },
    ],
    D,
  );
}

/* ---------- 4.14 citation: the author's templates first, then the built-in shapes in `kinds` (ECLI: Council conclusions 2011/C 127/01;
     UK neutral citations: Practice Direction 2001; US reporters: The Bluebook 21st ed.; series citations such as BVerfGE 86, 1; provisions
     Art. / § / s. with (1)(b) and Abs. / S. / Nr. parts). Fields are numbers (int, year) or the citation's own text (s). ---------- */
const BUILTIN: Readonly<Record<string, readonly [RegExp, readonly string[], readonly string[]]>> = {
  ecli: [
    /^ECLI:([A-Z]{2}|EU):([A-Z0-9.]{1,7}):([0-9]{4}):([A-Za-z0-9.]{1,25})$/,
    ['country', 'court', 'year', 'number'],
    ['s', 's', 'n', 'n'],
  ],
  neutral: [
    /^\[([0-9]{4})\]\s+([A-Z][A-Za-z]{1,9})(?:\s+(Civ|Crim|Admin|Ch|QB|KB|Fam|Comm|Pat|TCC|IPEC|Costs))?\s+([0-9]{1,6})(?:\s+\(([A-Za-z]{1,10})\))?$/,
    ['year', 'court', 'division', 'number', 'list'],
    ['n', 's', 's', 'n', 's'],
  ],
  reporter: [
    /^([0-9]{1,4})\s+([A-Z][A-Za-z0-9.' ]{0,24}?)\s+([0-9]{1,6})(?:,\s*([0-9]{1,6}))?(?:\s+\(([^()]{0,40}?)\s*([0-9]{4})\))?$/,
    ['volume', 'reporter', 'page', 'pin', 'court', 'year'],
    ['n', 's', 'n', 'n', 's', 'n'],
  ],
  series: [
    /^([A-Z][A-Za-zÄÖÜäöü]{1,11})\s+([0-9]{1,4}),\s*([0-9]{1,6})(?:\s*\(([0-9]{1,6})\)|,\s*([0-9]{1,6}))?$/,
    ['series', 'volume', 'page', 'pin', 'pin2'],
    ['s', 'n', 'n', 'n', 'n'],
  ],
  provision: [
    /^(Art\.|Article|Artikel|Arts\.|§§?|Section|Sec\.|s\.|ss\.|r\.)\s*([0-9]{1,5}[A-Za-z]{0,3})((?:\s*\(\s*[0-9a-zA-Z]{1,5}\s*\))*)((?:\s+(?:Abs\.|S\.|Satz|Nr\.|para\.|al\.|lit\.|sub)\s*[0-9a-z]{1,5})*)(?:\s+(.{1,60}))?$/,
    ['marker', 'number', 'parens', 'parts', 'act'],
    ['s', 'n', 's', 's', 's'],
  ],
};
function runCitation(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const text = String(m.text).trim(),
    tries: Try[] = [];
  for (const p of m.patterns || []) {
    const t = template(p.template);
    if (t.ok)
      tries.push({
        id: p.id,
        re: new RegExp(t.re),
        names: t.fields.map(f => f[0]),
        types: t.fields.map(f => (f[1] === 'int' || f[1] === 'year' ? 'n' : 's')),
      });
  }
  for (const k of (Array.isArray(m.kinds) && m.kinds.length ? m.kinds : CITE_KINDS) as readonly string[])
    tries.push({ id: k, re: BUILTIN[k]![0], names: BUILTIN[k]![1], types: BUILTIN[k]![2] });
  let hit = null as { t: Try; r: RegExpExecArray } | null,
    kind = 0;
  for (let i = 0; i < tries.length && !hit; i++) {
    const r = tries[i]!.re.exec(text);
    if (r) {
      hit = { t: tries[i]!, r };
      kind = i + 1;
    }
  }
  const F: Record<string, string | number> = {};
  if (hit)
    hit.t.names.forEach((nm, i) => {
      const v = hit.r[i + 1];
      if (v !== undefined && v !== '') F[nm] = hit.t.types[i] === 'n' ? parseInt(v, 10) : v.trim();
    });
  if (hit && hit.t.id === 'provision')
    F.depth = (String(F.parens || '').match(/\(/g) || []).length + (String(F.parts || '').match(/\S+\s*[0-9a-z]+/g) || []).length;
  if (!hit) D.add('no-match');
  const nv = (k: string) => (typeof F[k] === 'number' ? F[k] : NaN);
  Object.assign(S, {
    valid: b01(!!hit),
    kind,
    year: nv('year'),
    volume: nv('volume'),
    page: nv('page'),
    number: nv('number'),
    depth: hit ? (isNum(F.depth!) ? F.depth : 0) : NaN,
  });
  S.$name = nm => nv(nm);
  const rows: Row[] = [{ s: text, c: hit ? 'ok' : 'bad' }];
  if (hit) {
    rows.push({ s: hit.t.id, c: 'info' });
    Object.keys(F).forEach(k => {
      rows.push({ s: `${k}: ${F[k]!}`, c: 'base' });
    });
  }
  Rn.scene = rowsScene(rows, D);
}

/* ---------- 4.15 shares: succession and division. Priority sums (`first`) come off the estate; fractional shares (`share`) next; if
     they exceed the whole, ʿawl reduces them in proportion (the Minbariyya case: wife ⅛ → 1/9); a remainder goes to the residuaries by
     `weight` (ʿaṣaba, 2 : 1), else by radd to the share-holders whose radd is not false (spouses excluded by the majority view), else to
     the state (escheat). With claims and a `division` rule the estate is divided as a bankruptcy problem: proportional, constrained
     equal awards, constrained equal losses, or the Talmud rule (Aumann & Maschler 1985: CEA on half-claims up to half the total, then
     each half-claim plus CEL on the rest). ---------- */
function cea(E: number, c: readonly number[]): number[] {
  // constrained equal awards: min(c_i, λ) with Σ = E (exact: the claims in rising order)
  const n = c.length,
    idx = c.map((x, i) => i).sort((a, b) => c[a]! - c[b]! || a - b),
    out = new Array<number>(n).fill(0);
  let left = E,
    k = n;
  for (let p = 0; p < n; p++) {
    const i = idx[p]!,
      lam = left / k;
    if (c[i]! <= lam) {
      out[i] = c[i]!;
      left -= c[i]!;
      k--;
      continue;
    }
    for (let q = p; q < n; q++) out[idx[q]!] = lam;
    return out;
  }
  return out;
}
const cel = (E: number, c: readonly number[]) => {
  const L = c.reduce((a, b) => a + b, 0) - E,
    a = cea(L, c);
  return c.map((x, i) => x - a[i]!);
}; // losses shared equally (the dual)
function runShares(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const H = (m.heirs || [])
    .filter(h => on(h.on, env))
    .map(h => ({
      id: h.id,
      share: num(h.share, env, 0),
      first: num(h.first, env, 0),
      weight: num(h.weight, env, 0),
      claim: num(h.claim, env, NaN),
      radd: h.radd !== false,
      label: h.label,
    }));
  const E = num(m.estate, env, NaN);
  if (!Number.isFinite(E) || E < 0) {
    D.add('value');
    return;
  }
  if (!H.length) {
    D.add('no-heirs');
    D.add('escheat');
    Object.assign(S, { total: 0, awl: 0, radd: 0, residue: 0, escheat: E, share: NaN, amount: NaN });
    return;
  }
  let amt = new Array<number>(H.length).fill(0),
    awl = 0,
    radd = 0,
    residue = 0,
    esc = 0;
  if (m.division && H.some(h => Number.isFinite(h.claim))) {
    const c = H.map(h => (Number.isFinite(h.claim) && h.claim > 0 ? h.claim : 0)),
      Ct = c.reduce((a, b) => a + b, 0);
    if (E >= Ct) {
      D.add('claims-short');
      amt = c.slice();
      esc = E - Ct;
    } else if (m.division === 'proportional') amt = c.map(x => (Ct ? (E * x) / Ct : 0));
    else if (m.division === 'cea') amt = cea(E, c);
    else if (m.division === 'cel') amt = cel(E, c);
    else {
      const h = c.map(x => x / 2);
      amt = E <= Ct / 2 ? cea(E, h) : h.map((x, i) => x + cel(E - Ct / 2, h)[i]!);
    }
  } else {
    const F = H.reduce((a, h) => a + Math.max(0, h.first), 0);
    let rest = E;
    if (F > E) {
      H.forEach((h, i) => {
        amt[i] = (E * Math.max(0, h.first)) / F;
      });
      rest = 0;
    } else {
      H.forEach((h, i) => {
        amt[i] = Math.max(0, h.first);
      });
      rest = E - F;
    }
    const Sh = H.reduce((a, h) => a + Math.max(0, h.share), 0),
      Wt = H.reduce((a, h) => a + Math.max(0, h.weight), 0);
    if (Sh > 1 + 1e-12) {
      awl = 1;
      D.add('awl');
      H.forEach((h, i) => {
        amt[i]! += (rest * Math.max(0, h.share)) / Sh;
      });
    } else {
      H.forEach((h, i) => {
        amt[i]! += rest * Math.max(0, h.share);
      });
      const R = rest * (1 - Sh);
      if (R > 1e-12) {
        if (Wt > 0) {
          residue = 1 - Sh;
          H.forEach((h, i) => {
            amt[i]! += (R * Math.max(0, h.weight)) / Wt;
          });
        } else {
          const el = H.map((h, i) => (h.radd && h.share > 0 ? i : -1)).filter(i => i >= 0),
            Se = el.reduce((a, i) => a + H[i]!.share, 0);
          if ((m.deficit || 'radd') === 'radd' && Se > 0) {
            radd = 1;
            D.add('radd');
            el.forEach(i => {
              amt[i]! += (R * H[i]!.share) / Se;
            });
          } else {
            esc = R;
            D.add('escheat');
          }
        }
      }
    }
  }
  const tot = amt.reduce((a, b) => a + b, 0);
  const vi = 0;
  Object.assign(S, { share: E ? amt[vi]! / E : NaN, amount: amt[vi], total: tot, awl, radd, residue, escheat: esc });
  S.$at = {
    share: id => {
      const i = H.findIndex(h => h.id === id);
      return i >= 0 && E ? amt[i]! / E : NaN;
    },
    amount: id => {
      const i = H.findIndex(h => h.id === id);
      return i >= 0 ? amt[i]! : NaN;
    },
  };
  SE.amounts = amt.slice();
  SE.shares = amt.map(a => (E ? a / E : NaN));
  // the scene: one bar of the estate split by heir
  const sc = C.scene([-0.05, 1.05, -1.5, 1]);
  let x = 0;
  H.forEach((h, i) => {
    const w = E ? amt[i]! / E : 0;
    sc.poly([x, 0, x + w, 0, x + w, 0.5, x, 0.5], { c: ['ok', 'info', 'hi', 'warn', 'base'][i % 5]!, fill: true, closed: true });
    sc.txt(x + w / 2, -0.3 - (i % 2) * 0.4, { ...(h.label ? { key: h.label } : { s: h.id }), c: 'base' });
    x += w;
  });
  if (esc > 0 && E) sc.poly([x, 0, x + esc / E, 0, x + esc / E, 0.5, x, 0.5], { c: 'muted', fill: true, closed: true });
  Rn.scene = sc.done();
}

/* ---------- 4.16 obligations: clauses over a day-by-day trace (calendar days, or business days of the author's calendar), checked by
     logic@1 evalNorms (Dignum et al. 2004 deadlines; Prakken & Sergot 1996 contrary-to-duty; lex superior / posterior); a violated
     clause adds its penalty (Governatori 2005, contracts in RuleML). `within` counts the trace's steps: business days when count = business. ---------- */
function runObligations(m: LawModel, env: Env, D: Diag, S: Scal, SE: Ser, Rn: Res): void {
  const L = LG()!,
    z0 = (m.start !== undefined ? dayOf(m.start) : 0)!,
    cal = calendar(m),
    business = m.count === 'business';
  const evs = (m.trace || []).map(s => ({
    day: s.date !== undefined ? dayOf(s.date)! - z0 : s.day || 0,
    facts: s.facts || [],
    acts: s.acts || [],
  }));
  const lastDay = evs.reduce((a, e) => Math.max(a, e.day), 0),
    horizon = Math.min(MAX_DAYS, m.horizon || lastDay + 1);
  const days: number[] = [];
  for (let d = 0; d < horizon * 3 + 14 && days.length < horizon; d++) if (!business || !cal.off(z0 + d)) days.push(d);
  if (lastDay >= (days[days.length - 1] || 0) + 1 && evs.some(e => e.day > days[days.length - 1]!)) D.add('trace-truncated');
  const steps = days.map((d, i) => ({ t: i, facts: [] as string[], acts: [] as string[], day: d }));
  for (const e of evs) {
    const i = days.findIndex(d => d >= e.day);
    if (i < 0) continue;
    steps[i]!.facts.push(...e.facts);
    steps[i]!.acts.push(...e.acts);
  }
  const total = steps.length,
    k = m.step === undefined ? total : Math.max(0, Math.min(total, Math.floor(num(m.step, env, total))));
  const norms = (m.norms || []).map(n => ({
    id: n.id,
    kind: n.kind,
    act: n.act,
    ...(n.cond !== undefined ? { cond: n.cond } : {}),
    ...(n.deadline !== undefined ? { deadline: n.deadline } : {}),
    ...(n.within !== undefined ? { within: n.within } : {}),
    ...(n.until !== undefined ? { until: n.until } : {}),
    rank: isNum(n.rank) ? n.rank : 0,
    issued: isNum(n.issued) ? n.issued : 0,
    on: on(n.on, env),
  }));
  const r = L.evalNorms(
    norms,
    steps.slice(0, k).map(s => ({ t: s.t, facts: s.facts, acts: s.acts })),
    { order: m.order },
  );
  for (const c of r.codes) if (['conflict', 'unresolved', 'parse', 'trace-truncated'].includes(c)) D.add(c);
  const pen = new Map((m.norms || []).map(n => [n.id, num(n.penalty, env, 0)]));
  const penalties = r.violations.reduce((a, v) => a + (pen.get(v.norm) || 0), 0);
  Object.assign(S, {
    violations: r.counts.violations,
    fulfilments: r.counts.fulfilments,
    pending: r.counts.pending,
    conflicts: r.counts.conflicts,
    penalties,
    steps: total,
    frame: k,
  });
  SE.violationsPerStep = r.perStep.slice();
  // the scene: one row per clause along the steps: red violation, green fulfilment, amber pending; the current step dashed
  const n = norms.length,
    W = Math.max(total, 1),
    sc = C.scene([-W * 0.25, W + 0.5, -(n + 0.5), 0.8]);
  norms.forEach((nm, i) => {
    sc.txt(-W * 0.12, -i, { s: short(nm.id), c: 'info' });
    sc.seg(0, -i, W, -i, { c: 'muted' });
  });
  const row = (id: unknown) => norms.findIndex(x => x.id === id);
  for (const v of r.violations) sc.pt((v.step as number) + 0.5, -row(v.norm), { r: 5, c: 'bad' });
  for (const f of r.fulfilments) sc.pt((f.step as number) + 0.5, -row(f.norm), { r: 5, c: 'ok' });
  for (const p of r.pending) sc.pt(k, -row(p.norm), { r: 4, c: 'warn' });
  sc.seg(k, 0.6, k, -(n - 0.4), { c: 'hi', dash: true });
  Rn.scene = sc.done();
}

const TASK: Readonly<Record<string, Runner>> = {
  rules: runRules,
  aspic: runAspic,
  carneades: runCarneades,
  hohfeld: runHohfeld,
  proof: runProof,
  cases: runCases,
  deadline: runDeadline,
  contract: runContract,
  damages: runDamages,
  crime: runCrime,
  sentence: runSentence,
  proportionality: runProp,
  vote: runVote,
  citation: runCitation,
  shares: runShares,
  obligations: runObligations,
};
/** run(spec, env, opts) → {out, diag, scalars, series} */
function run(spec: LawSpec, env?: Env | null) {
  env = env || {};
  const D = diagSet(),
    m = spec.model,
    S: Scal = {},
    SE: Ser = {},
    Rn: Res = { scene: null };
  try {
    if (!LG()) D.add('parse');
    else TASK[m.task]!(m, env, D, S, SE, Rn);
  } catch {
    D.add('value');
  }
  const out: Record<string, unknown> = {};
  const at = (o: OutputIn) => {
    if (o.of === 'field') return S.$name ? S.$name(o.name as string) : NaN;
    if (o.at !== undefined) {
      if (o.of === 'status' && S.$status) return S.$status(o.at as string);
      if (S.$at && S.$at[o.of!]) return S.$at[o.of!]!(o.at as string);
    }
    return S[o.of!];
  };
  for (const o of (Array.isArray(spec.outputs) ? spec.outputs : []) as readonly (OutputIn | null)[]) {
    if (!o || typeof o.id !== 'string') continue;
    if (o.kind === 'scalar' && o.of !== 'flag') {
      const v = at(o);
      out[o.id] = typeof v === 'boolean' ? +v : isNum(v) ? v : NaN;
    } else if (o.kind === 'series') {
      const v = SE[o.of!] || [];
      if (v.length > C.MAX_POINTS) D.add('series-truncated');
      out[o.id] = Array.from(v).slice(0, C.MAX_POINTS);
    } else if (o.kind === 'scene') out[o.id] = Rn.scene || { view: [-1, 1, -1, 1], items: [] };
  }
  for (const o of (Array.isArray(spec.outputs) ? spec.outputs : []) as readonly (OutputIn | null)[])
    if (o && o.kind === 'scalar' && o.of === 'flag') out[o.id as string] = D.has(o.code!) ? 1 : 0;
  const scalars: Record<string, unknown> = {};
  for (const k of Object.keys(S)) if (!k.startsWith('$')) scalars[k] = S[k];
  return { out, diag: D.list, codes: D.list.map(x => x.code), scalars, series: SE };
}

const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, scenes: true });
const API = Object.freeze({
  table: {
    model: MODEL_T,
    outputs: {
      scalar: [
        ...new Set(
          Object.values(TASK_OUT)
            .flatMap(x => x[0])
            .concat(['flag']),
        ),
      ],
      series: [...new Set(Object.values(TASK_OUT).flatMap(x => x[1]))],
      scene: ['drawing'],
    },
    fields: { code: 'enum:' + CODES.join('|'), at: 'id', name: 'name' },
  },
  id: ID,
  checkSpec,
  exprs,
  keys,
  run,
  engine: Object.freeze(engine),
  simEngine,
  TASKS,
  TASK_OUT,
  AT_OF,
  CODES,
  REQ,
  MODEL_T,
  SCHEMES,
  STD_P,
  LEVEL,
  CITE_KINDS,
  // the engine's own functions (for tests and other engines)
  parseLit,
  dayOf,
  civilFromDays,
  daysFromCivil,
  weekdayOf,
  addMonths,
  template,
  buildTheory,
  defeasible,
  hohCanon,
  powerIndices,
  banzhafGF,
  weightedGF,
  cea,
  cel,
  carneadesCycle,
});
export default API;
/* i18n-ignore-end */
