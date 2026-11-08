/* ===================== agents@1 — agent-based models and multi-agent systems (docs/library/agents.md) =====================
   A GENERAL engine of the library (docs/INTERACTIVE_LIBRARY.md §1), described in the ODD protocol's terms (Grimm et al. 2006, 2020;
   Railsback & Grimm 2019): entities (breeds of agents with typed state, patches, globals), spaces (continuous 2-D on a torus or within
   walls, a grid with Moore / von Neumann / hexagonal neighbourhoods, a network from an edge list or a generator, or none: well
   mixed), process overview and scheduling (synchronous, random-order asynchronous, fixed order — their effect is documented and
   tested), stochasticity by seeded NoemaSimKit streams, observation (reporters over time, histograms, a scene, replications with
   Student-t confidence intervals by the kernel).
   Rules are actions with NoemaExpr formulas over the agent's own state, aggregates of its neighbours, its patch and the globals:
   set, move (random walk, heading, gradient following, towards / away, to an empty cell, a jump), die, reproduce, eat, hunt,
   contact (infection, influence), adopt (voter model), average (DeGroot 1974), ising (Glauber 1963 heat bath), flock (Reynolds
   1987), send (FIPA-ACL messages, FIPA 2002 SC00037J), and BDI deliberation (Rao & Georgeff 1995; Bratman 1987: goals, a plan
   library with context conditions, commitment blind / single-minded / open-minded). Norms (obligations, prohibitions,
   permissions with deadlines, violations and sanctions) are monitored by NoemaLibLogic.normMonitor (src/engines/logic/logic.ts) when it is
   loaded, otherwise by a documented fallback (code logic-fallback).
   Multi-agent protocols (model.protocol): Contract Net (Smith 1980), auctions English / Dutch / first- and second-price sealed
   (Vickrey 1961; revenue equivalence, Myerson 1981), bilateral negotiation (Rubinstein 1982 alternating offers; Zeuthen 1930
   monotonic concession → the Nash 1950 bargaining solution), coalitional games (Shapley 1953 value, the core by the Bondareva 1963 –
   Shapley 1967 linear programme), the iterated prisoner's dilemma tournament and its ecological simulation (Axelrod 1984).
   Templates reproduce the classics: Schelling 1971, Boids, SIR on a grid / network / well mixed (against Kermack–McKendrick 1927),
   Sugarscape (Epstein & Axtell 1996), wolf–sheep predation (Wilensky 1997), the voter model (Holley & Liggett 1975), the Ising model
   (Onsager 1944), DeGroot consensus.
   Pure, deterministic per seed, bounded (≤ 5000 agents, ≤ 2000 steps, an operation budget with the code budget), never throws.
   Tests: node tests/lib_agents.js. */
import NoemaLibCore from '../kernel/core.ts';
import NoemaExpr from '../kernel/simexpr.ts';
import NoemaSimKit from '../kernel/simkit.ts';
import NoemaSpaceKit from '../kernel/space.ts';
import NoemaLibLogic from '../logic/logic.ts';
import type { CoreStepper, Emit, NumFn, Stats } from '../kernel/core.ts';
import type { Codes, StepperDef } from '../kernel/simkit.ts';
import type { Spec } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes and numbers leave this module
type Rec = Readonly<Record<string, unknown>>;
/** a view of the expressions: the inputs, an agent's variables, its built-ins and aggregates (prototype-free maps) */
type Env = Record<string, number | boolean>;
/** an expression of the model compiled: a number, or a NoemaExpr formula and the names it uses */
interface Cmp {
  readonly num: boolean;
  readonly val: number /* (a number's own value: read only when num) */;
  readonly f: NumFn;
  readonly uses: Set<string>;
  readonly src?: unknown;
}
/* ---------- the model (as checkSpec leaves it) ---------- */
type Numx = number | string;
interface ActionM {
  readonly [field: string]: unknown;
  readonly do: string;
  readonly when?: unknown;
  readonly prob?: unknown;
  readonly act?: string;
  readonly var?: string;
  readonly expr?: unknown;
  readonly how?: string;
  readonly target?: string;
  readonly patch?: string;
  readonly into?: string;
  readonly breed?: string;
  readonly where?: unknown;
  readonly set?: Rec;
  readonly weights?: string;
  readonly perf?: string;
  readonly to?: string;
  readonly content?: unknown;
  readonly share?: Readonly<Record<string, number>>;
}
interface VarM {
  readonly init?: unknown;
  readonly type?: string;
  readonly min?: number;
  readonly max?: number;
  readonly n?: number;
}
interface GoalM {
  readonly id: string;
  readonly when?: unknown;
  readonly achieved?: unknown;
  readonly impossible?: unknown;
  readonly priority?: unknown;
}
interface PlanM {
  readonly id: string;
  readonly goal: string;
  readonly context?: unknown;
  readonly body?: readonly ActionM[];
}
interface BreedM {
  readonly id: string;
  readonly count?: unknown;
  readonly vars?: Readonly<Record<string, VarM>>;
  readonly place?: string;
  readonly rules?: readonly ActionM[];
  readonly bdi?: { readonly commitment?: string; readonly goals?: readonly GoalM[]; readonly plans?: readonly PlanM[] };
}
/** an aggregate or a reporter */
interface AggM {
  readonly id: string;
  readonly of?: string;
  readonly breed?: string;
  readonly fn: string;
  readonly expr?: unknown;
  readonly where?: unknown;
  readonly perf?: string;
}
interface HistM {
  readonly id: string;
  readonly breed?: string;
  readonly expr?: unknown;
  readonly bins?: number;
  readonly min?: unknown;
  readonly max?: unknown;
}
interface InterruptM {
  readonly at?: number;
  readonly when?: unknown;
  readonly set?: Rec;
  readonly once?: boolean;
}
interface NormM {
  readonly id: string;
  readonly kind: string;
  readonly act: string;
  readonly cond?: string;
  readonly deadline?: string;
  readonly within?: number;
  readonly until?: string;
  readonly mode?: string;
  readonly breed?: string;
  readonly sanction?: { readonly var: string; readonly add?: unknown };
}
interface GenerateM {
  readonly kind: string;
  readonly n?: unknown;
  readonly k?: unknown;
  readonly p?: unknown;
  readonly m?: unknown;
  readonly nx?: number;
  readonly ny?: number;
}
interface SpaceM {
  readonly [field: string]: unknown;
  readonly kind?: string;
  readonly w?: unknown;
  readonly h?: unknown;
  readonly nx?: unknown;
  readonly ny?: unknown;
  readonly torus?: boolean;
  readonly neighbourhood?: string;
  readonly radius?: unknown;
  readonly capacity?: number;
  readonly edges?: readonly (readonly number[])[];
  readonly nodes?: number;
  readonly directed?: boolean;
  readonly generate?: GenerateM;
}
interface PatchesM {
  readonly nx?: number;
  readonly ny?: number;
  readonly vars?: Rec;
  readonly rules?: readonly { readonly var: string; readonly expr?: unknown }[];
  readonly diffuse?: readonly { readonly var: string; readonly rate?: unknown }[];
}
interface ProtoM {
  readonly kind: string;
  readonly tasks?: number;
  readonly contractors?: number;
  readonly costMin?: Numx;
  readonly costMax?: Numx;
  readonly capacity?: number;
  readonly loadFactor?: Numx;
  readonly costs?: readonly (readonly number[])[];
  readonly format?: string;
  readonly bidders?: number;
  readonly rounds?: number;
  readonly strategy?: string;
  readonly shade?: number;
  readonly inc?: Numx;
  readonly reserve?: Numx;
  readonly values?: readonly number[];
  readonly method?: string;
  readonly d1?: number;
  readonly d2?: number;
  readonly horizon?: number;
  readonly a1?: Numx;
  readonly a2?: Numx;
  readonly step?: Numx;
  readonly players?: number;
  readonly v?: unknown;
  readonly weights?: readonly number[];
  readonly kinds?: readonly number[];
  readonly table?: readonly number[];
  readonly strategies?: readonly string[];
  readonly noise?: number;
  readonly T?: number;
  readonly R?: number;
  readonly P?: number;
  readonly S?: number;
  readonly generations?: number;
  readonly generosity?: number;
}
interface ModelM {
  [field: string]: unknown;
  template?: string;
  set?: Rec;
  space?: SpaceM;
  globals?: Rec;
  patches?: PatchesM;
  breeds?: readonly BreedM[];
  aggregates?: readonly AggM[];
  schedule?: string;
  steps?: number;
  dt?: unknown;
  every?: number;
  stop?: unknown;
  reporters?: readonly AggM[];
  hist?: readonly HistM[];
  replications?: { readonly n: number; readonly level?: number };
  interrupts?: readonly InterruptM[];
  norms?: readonly NormM[];
  protocol?: ProtoM;
  maxOps?: number;
}
interface OutM {
  readonly id: string;
  readonly kind: string;
  readonly of: string;
  readonly reporter?: string;
  readonly stat?: string;
  readonly hist?: string;
  readonly breed?: string;
  readonly var?: string;
  readonly perf?: string;
  readonly norm?: string;
  readonly name?: string;
  readonly index?: number;
  readonly code?: string;
  readonly colorBy?: string;
  readonly patch?: string;
  readonly arrows?: boolean;
  readonly edges?: boolean;
}
/* ---------- the prepared model ---------- */
type Act = ActionM & {
  readonly whenC: Cmp | null;
  readonly probC: Cmp | null;
  readonly exprC: Cmp | null;
  readonly whereC: Cmp | null;
  readonly contentC: Cmp | null;
  readonly setC: [string, Cmp | null][];
  readonly P: Record<string, Cmp | null>;
  rnd?: boolean;
  ornd?: boolean;
};
interface VarP {
  name: string;
  init: Cmp | null;
  type: string;
  min: number | undefined;
  max: number | undefined;
  n: number | undefined;
}
interface GoalP {
  id: string;
  when: Cmp | null;
  achieved: Cmp | null;
  impossible: Cmp | null;
  priority: Cmp | null;
}
interface PlanP {
  id: string;
  goal: string;
  context: Cmp | null;
  body: Act[];
}
interface BreedP {
  id: string;
  bi: number;
  count: Cmp | null;
  place: string;
  vars: VarP[];
  rules: Act[];
  bdi: { commitment: string; goals: GoalP[]; plans: PlanP[] } | null;
  aggUse: string[];
  aggObjs: (AggP | undefined)[];
}
type AggP = AggM & { readonly exprC: Cmp | null; readonly whereC: Cmp | null; ornd?: boolean };
type HistP = HistM & { readonly exprC: Cmp | null; readonly minC: Cmp | null; readonly maxC: Cmp | null };
interface InterruptP {
  at: number | undefined;
  when: Cmp | null;
  once: boolean;
  set: [string, Cmp | null][];
}
interface Prep {
  readonly proto?: undefined;
  m: ModelM;
  tpl: string | null;
  outs: OutM[];
  sp: SpaceM;
  globals: [string, Cmp | null][];
  pvars: [string, Cmp | null][];
  prules: { var: string; f: Cmp | null; rnd: boolean }[];
  diffuse: { var: string; rate: Cmp | null }[];
  breeds: BreedP[];
  aggs: AggP[];
  reps: AggP[];
  hist: HistP[];
  interrupts: InterruptP[];
  stop: Cmp | null;
  norms: readonly NormM[];
  repAggUse: string[];
  repAggObjs: (AggP | undefined)[];
  repRnd: boolean;
}
interface ProtoPrep {
  readonly proto: ProtoM;
  readonly m: ModelM;
  readonly outs: OutM[];
}
type Prepared = Prep | ProtoPrep;
/* ---------- the simulation ---------- */
interface Msg {
  perf: string | undefined;
  from: number;
  to: Agent;
  content: number;
}
interface Agent {
  id: number;
  b: number;
  B: BreedP;
  x: number;
  y: number;
  heading: number;
  age: number;
  alive: boolean;
  v: Record<string, number>;
  cell: number;
  node: number;
  inbox: Msg[];
  acts: string[] | null;
  int: { goal: string; plan: string; pc: number } | null;
  pv?: Record<string, number> | null;
  nv?: Record<string, number> | null;
  px?: number | null;
  py?: number | null;
  ph?: number | null;
  nh?: number | null;
  speed?: number;
}
interface NormRecord {
  readonly norm: string;
  readonly agent: unknown;
  readonly step: number;
  readonly t: number;
  readonly since: number;
  readonly kind?: string;
}
interface NormStepIn {
  readonly t?: number;
  readonly facts?: Readonly<Record<string, readonly string[]>>;
  readonly acts?: Readonly<Record<string, readonly string[]>>;
}
interface Monitor {
  step(st: NormStepIn): { readonly violations?: readonly NormRecord[]; readonly fulfilments?: readonly NormRecord[] };
  result(): unknown;
}
/** a formula of the fallback's propositional logic */
type Prop = { t: 'top' | 'bot' } | { t: 'atom'; n: string } | { t: 'not'; a: Prop } | { t: 'and' | 'or' | 'imp' | 'iff'; a: Prop; b: Prop };
/** what a protocol gives */
interface ProtoResult {
  scalar: Record<string, number>;
  series: Record<string, number[] | number[][]>;
  msgs: Record<string, number>;
}
type SimRes = ReturnType<typeof simulate>;
type Names = ReturnType<typeof names>;
interface AggCache {
  readonly all: Map<string, number>;
}
/** the stepper's state */
type StepSt = { readonly bad: true } | { readonly bad?: undefined; spec: Rec; M: Prep; inputs: Rec; seed: number; done: number };

const C = NoemaLibCore,
  S = NoemaSpaceKit;
const LG = NoemaLibLogic as unknown as {
  readonly normMonitor?: (norms: readonly object[], opts: { readonly perAgent: boolean }) => Monitor;
};

const ID = 'agents@1';
const MAX_AGENTS = 5000,
  MAX_STEPS = 2000,
  DEF_OPS = 2e6,
  MAX_OPS = 4e6,
  MAX_TOTAL = 4e6,
  MAX_MSG = 200000;
const SPACES = ['continuous', 'grid', 'network', 'none'];
const ACTIONS = ['set', 'move', 'die', 'reproduce', 'eat', 'hunt', 'contact', 'adopt', 'average', 'ising', 'send', 'flock'];
const MOVES = ['random', 'heading', 'gradient', 'towards', 'away', 'empty', 'jump'];
const PERFS = ['inform', 'request', 'propose', 'accept-proposal', 'reject-proposal', 'cfp', 'query-if', 'agree', 'refuse', 'failure'];
const FNS = ['count', 'sum', 'mean', 'min', 'max', 'frac', 'var', 'gini', 'order'];
const PROTOCOLS = ['contractnet', 'auction', 'negotiation', 'coalition', 'ipd'];
const IPD = ['allc', 'alld', 'tft', 'tf2t', 'grim', 'pavlov', 'random', 'gtft', 'joss'];
const PROTO_NAMES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  contractnet: { scalar: ['totalCost', 'optimalCost', 'makespan', 'messages', 'refusals', 'unassigned'], series: ['load', 'winner'] },
  auction: {
    scalar: ['revenue', 'revenueHalf', 'expectedRevenue', 'efficiency', 'dominance', 'price', 'winner', 'secondValue'],
    series: ['prices'],
  },
  negotiation: { scalar: ['share1', 'share2', 'rounds', 'closedForm', 'nashX', 'agreement'], series: ['offers'] },
  coalition: { scalar: ['grand', 'coreEmpty', 'shapleyInCore', 'minCoreTotal'], series: ['shapley'] },
  ipd: { scalar: ['winner', 'coopRate', 'best'], series: ['scores', 'shares', 'share'] },
};
const CODES = [
  'budget',
  'repl-cut',
  'agent-limit',
  'message-limit',
  'no-space',
  'stopped',
  'logic-fallback',
  'norm-parse',
  'kernel',
  'nan',
  'extinct',
  'lp',
  'no-agreement',
];
const FATAL = ['kernel', 'nan'];
const TEMPLATES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  schelling: { size: 30, density: 0.9, want: 0.3, fracA: 0.5 },
  boids: { N: 150, w: 100, speed: 1, radius: 10, sep: 0.05, ali: 0.1, coh: 0.01, sepRadius: 2 },
  sir: { size: 50, beta: 0.25, gamma: 0.1, i0: 0.01 },
  sirnet: { N: 1000, k: 4, p: 0.1, beta: 0.1, gamma: 0.1, i0: 0.01 },
  sirwell: { N: 2000, contacts: 1, beta: 0.25, gamma: 0.1, i0: 0.005 },
  sugarscape: { N: 250, size: 50, regrow: 1 },
  wolfsheep: { size: 40, sheep: 200, wolves: 30, sheepGain: 4, wolfGain: 20, sheepRepro: 0.04, wolfRepro: 0.05, regrowTime: 30 },
  voter: { size: 30, p0: 0.5 },
  ising: { size: 32, T: 1.5, J: 1, h: 0, m0: 1 },
  degroot: { N: 20, k: 2, p: 0.2, selfw: 1 },
};

/* ---------- the model checker (the same table and messages as tools/lib_agents.py) ---------- */
const SPACE_T = {
  kind: 'enum:' + SPACES.join('|') + '!',
  w: 'numx',
  h: 'numx',
  nx: 'int:2:200',
  ny: 'int:2:200',
  torus: 'bool',
  neighbourhood: 'enum:moore|vonneumann|hex',
  radius: 'numx',
  capacity: 'int:1:1000',
  edges: { $list: { $list: 'fin', min: 2, max: 3 }, max: 20000 },
  nodes: 'int:1:5000',
  directed: 'bool',
  generate: {
    $obj: {
      kind: 'enum:ring|er|ws|ba|lattice|complete!',
      n: 'int:2:5000',
      k: 'int:1:50',
      p: 'unit',
      m: 'int:1:50',
      nx: 'int:2:200',
      ny: 'int:2:200',
    },
  },
};
const VAR_T = { init: 'numx!', type: 'enum:num|int|bool|cat', min: 'fin', max: 'fin', n: 'int:2:16' };
const ACTION_T = {
  do: 'enum:' + ACTIONS.join('|') + '!',
  when: 'expr',
  prob: 'numx',
  act: 'name',
  var: 'name',
  expr: 'numx',
  how: 'enum:' + MOVES.join('|'),
  speed: 'numx',
  turn: 'numx',
  target: 'id',
  patch: 'name',
  amount: 'numx',
  into: 'name',
  gain: 'numx',
  breed: 'id',
  where: 'expr',
  set: { $map: 'numx', max: 8 },
  weights: 'enum:equal|edge',
  self: 'numx',
  J: 'numx',
  h: 'numx',
  T: 'numx',
  perf: 'enum:' + PERFS.join('|'),
  to: 'enum:neighbours|all|random|breed',
  content: 'numx',
  contacts: 'numx',
  share: { $map: 'unit', max: 8 },
  radius: 'numx',
  sep: 'numx',
  ali: 'numx',
  coh: 'numx',
  sepRadius: 'numx',
  vision: 'numx',
};
const BDI_T = {
  commitment: 'enum:blind|single|open',
  goals: { $list: { $obj: { id: 'id!', when: 'expr!', achieved: 'expr!', impossible: 'expr', priority: 'numx' } }, min: 1, max: 8 },
  plans: {
    $list: { $obj: { id: 'id!', goal: 'id!', context: 'expr', body: { $list: { $obj: ACTION_T }, min: 1, max: 8 } } },
    min: 1,
    max: 16,
  },
};
const BREED_T = {
  id: 'id!',
  count: 'numx!',
  vars: { $map: { $obj: VAR_T }, max: 12 },
  place: 'enum:random|empty|node|cluster',
  rules: { $list: { $obj: ACTION_T }, max: 12 },
  bdi: { $obj: BDI_T },
};
const AGG_T = {
  id: 'name!',
  of: 'enum:neighbours|all|here|inbox!',
  breed: 'id',
  fn: 'enum:' + FNS.join('|') + '!',
  expr: 'expr',
  where: 'expr',
  perf: 'enum:' + PERFS.join('|'),
};
const REP_T = { id: 'name!', of: 'enum:agents|patches', breed: 'id', fn: 'enum:' + FNS.join('|') + '!', expr: 'expr', where: 'expr' };
const PATCH_T = {
  nx: 'int:2:200',
  ny: 'int:2:200',
  vars: { $map: 'numx', max: 8 },
  rules: { $list: { $obj: { var: 'name!', expr: 'numx!' } }, max: 8 },
  diffuse: { $list: { $obj: { var: 'name!', rate: 'numx!' } }, max: 4 },
};
const NORM_T = {
  id: 'id!',
  kind: 'enum:O|F|P!',
  act: 'expr!',
  cond: 'expr',
  deadline: 'expr',
  within: 'int:1:2000',
  until: 'expr',
  rank: 'int:0:100',
  issued: 'int:0:100000',
  mode: 'enum:achieve|maintain',
  breed: 'id',
  sanction: { $obj: { var: 'name!', add: 'numx!' } },
};
const PROTO_T = {
  kind: 'enum:' + PROTOCOLS.join('|') + '!',
  tasks: 'int:1:200',
  contractors: 'int:1:50',
  costMin: 'numx',
  costMax: 'numx',
  capacity: 'int:1:200',
  loadFactor: 'numx',
  costs: { $list: { $list: 'fin', min: 1, max: 50 }, max: 200 },
  format: 'enum:english|dutch|first|second',
  bidders: 'int:2:50',
  rounds: 'int:1:2000',
  strategy: 'enum:truthful|shade|bne',
  shade: 'unit',
  inc: 'numx',
  reserve: 'numx',
  values: { $list: 'fin', max: 50 },
  method: 'enum:rubinstein|zeuthen',
  d1: 'unit',
  d2: 'unit',
  horizon: 'int:1:2000',
  a1: 'numx',
  a2: 'numx',
  step: 'numx',
  players: 'int:1:10',
  v: 'expr',
  weights: { $list: 'fin', max: 10 },
  kinds: { $list: 'int:0:1', max: 10 },
  table: { $list: 'fin', max: 1023 },
  strategies: { $list: 'enum:' + IPD.join('|'), min: 2, max: 9 },
  noise: 'unit',
  T: 'fin',
  R: 'fin',
  P: 'fin',
  S: 'fin',
  generations: 'int:0:2000',
  generosity: 'unit',
};
const TABLE = {
  template: 'enum:' + Object.keys(TEMPLATES).join('|'),
  set: { $map: 'numx', max: 24 },
  space: { $obj: SPACE_T },
  globals: { $map: 'numx', max: 16 },
  patches: { $obj: PATCH_T },
  breeds: { $list: { $obj: BREED_T }, max: 6 },
  aggregates: { $list: { $obj: AGG_T }, max: 12 },
  schedule: 'enum:random|sync|fixed',
  steps: 'int:1:2000',
  dt: 'numx',
  every: 'int:1:2000',
  stop: 'expr',
  reporters: { $list: { $obj: REP_T }, max: 16 },
  hist: { $list: { $obj: { id: 'id!', breed: 'id', expr: 'expr!', bins: 'int:1:100', min: 'numx!', max: 'numx!' } }, max: 4 },
  replications: { $obj: { n: 'int:2:100!', level: 'unit' } },
  interrupts: { $list: { $obj: { at: 'int:0:2000', when: 'expr', set: { $req: true, $map: 'numx', max: 8 }, once: 'bool' } }, max: 8 },
  norms: { $list: { $obj: NORM_T }, max: 16 },
  protocol: { $obj: PROTO_T },
  maxOps: 'int:1000:4000000',
};
const SERIES = ['t', 'reporter', 'hist', 'histEdges', 'replValues', 'agentVar', 'messageCount', 'violations', 'protocolSeries'];
const SCALARS = [
  'final',
  'stat',
  'replMean',
  'replLo',
  'replHi',
  'replHalf',
  'replSd',
  'count',
  'steps',
  'messages',
  'violations',
  'fulfilments',
  'bdi',
  'protocol',
  'ops',
  'flag',
  'ok',
];
const SCENES = ['space'];
const BDI_NAMES = ['adopted', 'achieved', 'dropped', 'actions'];
const OUT_FIELDS = {
  reporter: 'name',
  stat: 'enum:' + C.STATS.join('|'),
  hist: 'id',
  breed: 'id',
  var: 'name',
  perf: 'enum:' + PERFS.join('|'),
  norm: 'id',
  name: 'name',
  index: 'int:0:9',
  code: 'enum:' + CODES.join('|'),
  colorBy: 'name',
  patch: 'name',
  arrows: 'bool',
  edges: 'bool',
};
const BUILTIN = ['x', 'y', 'heading', 'age', 'id', 'rnd', 'deg', 'intending'];
/** a plain object (not an array): a typed field keeps its type, an unknown value becomes a record */
const isObj = ((v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)) as {
  <T extends object>(v: T | null | undefined): v is T;
  (v: unknown): v is Rec;
};
const list: { <T>(v: readonly T[] | undefined): readonly T[]; (v: unknown): readonly unknown[] } = (v: unknown) =>
  Array.isArray(v) ? (v as unknown[]) : [];
const objs: { <T>(v: readonly T[] | undefined): (T & Rec)[]; (v: unknown): Rec[] } = (v: unknown) => list(v).filter(isObj);
const okName = (v: unknown): v is string => C.checkKind('name', v);
function specNames(spec: Rec) {
  const s: string[] = [];
  if (isObj(spec.consts)) for (const k of Object.keys(spec.consts)) s.push(k);
  for (const p of objs(spec.params)) if (typeof p.id === 'string') s.push(p.id);
  for (const d of objs(spec.derived)) if (typeof d.id === 'string') s.push(d.id);
  return s;
}
/** the names of a (non-template) model: breeds, their vars, patch vars, globals, aggregates, reporters */
function names(m: Rec) {
  const breeds = objs(m.breeds),
    bid = breeds.map(b => b.id).filter((x): x is string => typeof x === 'string');
  const vars: Record<string, string[]> = {};
  for (const b of breeds) vars[b.id as string] = isObj(b.vars) ? Object.keys(b.vars).filter(okName) : [];
  const allVars = [...new Set(([] as string[]).concat(...Object.values(vars)))];
  const pvars = isObj(m.patches) && isObj(m.patches.vars) ? Object.keys(m.patches.vars).filter(okName) : [];
  const globals = isObj(m.globals) ? Object.keys(m.globals).filter(okName) : [];
  const aggs = objs(m.aggregates)
      .map(a => a.id)
      .filter(okName),
    reps = objs(m.reporters)
      .map(r => r.id)
      .filter(okName);
  return { bid, vars, allVars, pvars, globals, aggs, reps };
}

function checkAction(a: Rec, w: string, N: Names, m: Rec, E: Emit, inBody: boolean) {
  const d = a.do,
    sp = isObj(m.space) ? m.space.kind : 'none';
  const needVar = (f: string) => {
    if (a[f] == null) E('value', `${w}.${f}`, `missing (${d as string} needs ${f})`);
    else if (okName(a[f]) && !N.allVars.includes(a[f])) E('value', `${w}.${f}`, 'not a variable of a breed');
  };
  const needBreed = (f: string) => {
    if (a[f] != null && !N.bid.includes(a[f] as string)) E('value', `${w}.${f}`, 'not a breed');
  };
  if (d === 'set') {
    needVar('var');
    if (a.expr == null) E('value', w + '.expr', 'missing (set needs expr)');
  }
  if (d === 'move') {
    if (a.how == null) E('value', w + '.how', 'missing (' + MOVES.join(', ') + ')');
    if (a.how === 'gradient') {
      if (a.patch == null) E('value', w + '.patch', 'missing (gradient follows a patch variable)');
      else if (okName(a.patch) && !N.pvars.includes(a.patch)) E('value', w + '.patch', 'not a patch variable');
    }
    if ((a.how === 'towards' || a.how === 'away') && !N.bid.includes(a.target as string)) E('value', w + '.target', 'a breed');
    if ((a.how === 'empty' || a.how === 'jump') && sp !== 'grid' && sp !== 'network')
      E('value', w + '.how', `${a.how} is for a grid or a network`);
    if (sp === 'none') E('value', w + '.how', 'a model without space has no movement');
  }
  if (d === 'eat') {
    if (a.patch == null) E('value', w + '.patch', 'missing (eat takes from a patch variable)');
    else if (okName(a.patch) && !N.pvars.includes(a.patch)) E('value', w + '.patch', 'not a patch variable');
    needVar('into');
  }
  if (d === 'hunt') {
    if (!N.bid.includes(a.breed as string)) E('value', w + '.breed', 'the prey: a breed');
    needVar('into');
  }
  if (d === 'contact') {
    if (!isObj(a.set)) E('value', w + '.set', "missing (contact sets the other agent's variables)");
    needBreed('breed');
  }
  if (d === 'contact' || d === 'average' || d === 'adopt' || d === 'ising') {
    if (isObj(a.set))
      for (const k of Object.keys(a.set)) if (okName(k) && !N.allVars.includes(k)) E('value', `${w}.set.${k}`, 'not a variable of a breed');
  }
  if (d === 'adopt' || d === 'average' || d === 'ising') needVar('var');
  if (d === 'send' && a.perf == null) E('value', w + '.perf', 'missing (a FIPA-ACL performative)');
  if (d === 'send' && a.to === 'breed' && !N.bid.includes(a.breed as string)) E('value', w + '.breed', 'a breed');
  if (d === 'flock' && sp !== 'continuous') E('value', w + '.do', 'flocking is for a continuous space');
  if (d === 'reproduce' && isObj(a.share))
    for (const k of Object.keys(a.share))
      if (okName(k) && !N.allVars.includes(k)) E('value', `${w}.share.${k}`, 'not a variable of a breed');
  if (inBody && (d === 'die' || d === 'reproduce')) E('value', w + '.do', 'a plan body does not ' + d);
}
function checkSpec(spec: unknown) {
  const { P, E, W } = C.problems();
  if (!isObj(spec)) {
    E('format', '', 'not an object');
    return P;
  }
  const m = spec.model,
    kinds = ['scalar', 'series', 'scene'];
  C.walk(m, TABLE, 'model', E, W);
  if (!isObj(m)) {
    C.checkOutputs(spec, ID, kinds, () => {}, E, W);
    return P;
  }
  const tpl = typeof m.template === 'string' && TEMPLATES[m.template] ? m.template : null,
    proto = isObj(m.protocol) ? m.protocol : null;
  if (tpl) {
    for (const k of ['space', 'breeds', 'patches', 'aggregates', 'reporters', 'protocol'])
      if (m[k] != null) E('value', 'model.' + k, `comes from the template ${tpl}`);
    if (isObj(m.set))
      for (const k of Object.keys(m.set))
        if (okName(k) && !Object.prototype.hasOwnProperty.call(TEMPLATES[tpl], k))
          E(
            'value',
            'model.set.' + k,
            `not a parameter of the template ${tpl} (its parameters: ${Object.keys(TEMPLATES[tpl]!).join(', ')})`,
          );
  } else if (m.set != null) E('value', 'model.set', 'needs a template');
  if (proto) {
    for (const k of ['space', 'breeds', 'patches', 'aggregates', 'reporters', 'norms', 'hist'])
      if (m[k] != null) E('value', 'model.' + k, 'a protocol runs on its own (no ' + k + ')');
    const pk = proto.kind;
    if (pk === 'coalition') {
      const n = Number.isInteger(proto.players) ? proto.players : 3;
      if ((proto.v == null) === (proto.table == null))
        E(
          'value',
          'model.protocol.v',
          'a coalitional game needs v (an expression over s, w, k0, k1) or table (2^n − 1 values), one of them',
        );
      if (Array.isArray(proto.table) && proto.table.length !== Math.pow(2, n as number) - 1)
        E('value', 'model.protocol.table', `needs 2^players − 1 = ${Math.pow(2, n as number) - 1} values (coalitions by bitmask 1…)`);
      for (const k of ['weights', 'kinds'])
        if (Array.isArray(proto[k]) && proto[k].length !== n)
          E('value', 'model.protocol.' + k, `needs one value per player (${n as number})`);
    }
    if (pk === 'contractnet' && Array.isArray(proto.costs)) {
      const T = (proto.tasks as number) || proto.costs.length,
        Cn = (proto.contractors as number) || ((proto.costs as unknown[][])[0] || []).length;
      if (proto.costs.length !== T || (proto.costs as unknown[]).some(r => !Array.isArray(r) || r.length !== Cn))
        E('value', 'model.protocol.costs', `needs tasks × contractors (${T} × ${Cn}) costs`);
    }
    if (pk === 'auction' && Array.isArray(proto.values) && Number.isInteger(proto.bidders) && proto.values.length !== proto.bidders)
      E('value', 'model.protocol.values', 'needs one value per bidder');
    if (pk === 'auction' && proto.strategy === 'bne' && (proto.format === 'english' || proto.format === 'second'))
      W('value', 'model.protocol.strategy', 'in English and second-price auctions the equilibrium bid is the value itself (truthful)');
  }
  const N = names(m),
    sn = specNames(spec);
  if (!tpl && !proto) {
    if (!Array.isArray(m.breeds) || !m.breeds.length) E('value', 'model.breeds', 'missing (at least one breed of agents)');
    if (!isObj(m.space)) E('value', 'model.space', 'missing (kind: continuous, grid, network or none)');
    if (m.steps == null) E('value', 'model.steps', 'missing');
  }
  // names: each once, none shared with the spec or the built-ins
  // (a variable may be shared by several breeds — energy of sheep and wolves — but no other name twice)
  const seen = new Set<string>();
  const own: [string, string[]][] = [
    ['globals', N.globals],
    ['aggregates', N.aggs],
    ['reporters', N.reps],
    ['patches.vars', N.pvars],
    ['breeds.vars', N.allVars],
  ];
  for (const [w, a] of own)
    for (const x of a) {
      if (BUILTIN.includes(x) || x.startsWith('my_') || x.startsWith('p_'))
        E('dup-name', 'model.' + w, `the name ${x} is a built-in name of agents@1 (${BUILTIN.join(', ')}, my_…, p_…)`);
      else if (sn.includes(x)) E('dup-name', 'model.' + w, `the name ${x} is also a name of the spec (consts, params, derived)`);
      else if (seen.has(x)) E('dup-name', 'model.' + w, `the name ${x} is used twice in the model`);
      seen.add(x);
    }
  N.bid.forEach((x, i) => {
    if (N.bid.indexOf(x) !== i) E('dup-name', 'model.breeds', `the breed ${x} is listed twice`);
  });
  const sp = isObj(m.space) ? m.space : {};
  if (sp.kind === 'network' && sp.edges == null && sp.generate == null) E('value', 'model.space', 'a network needs edges or generate');
  if (sp.kind !== 'network')
    for (const k of ['edges', 'generate', 'nodes', 'directed'])
      if (sp[k] != null) E('value', 'model.space.' + k, 'only a network has ' + k);
  if (sp.kind !== 'grid' && sp.kind != null)
    for (const k of ['neighbourhood', 'capacity'])
      if (sp[k] != null && !(k === 'capacity' && sp.kind === 'network')) E('value', 'model.space.' + k, `only a grid has ${k}`);
  if (sp.kind === 'grid' && (sp.w != null || sp.h != null)) E('value', 'model.space.w', 'a grid has nx and ny');
  if (sp.kind === 'continuous' && (sp.nx != null || sp.ny != null)) E('value', 'model.space.nx', 'a continuous space has w and h');
  if (isObj(m.patches)) {
    if (sp.kind !== 'grid' && sp.kind !== 'continuous') E('value', 'model.patches', 'patches lie on a grid or a continuous space');
    if (sp.kind === 'grid' && (m.patches.nx != null || m.patches.ny != null))
      E('value', 'model.patches.nx', 'on a grid the patches are its cells');
    objs(m.patches.rules)
      .concat(objs(m.patches.diffuse))
      .forEach((r, i) => {
        if (okName(r.var) && !N.pvars.includes(r.var))
          E(
            'value',
            `model.patches.${i < objs((m.patches as Rec).rules).length ? 'rules' : 'diffuse'}[${i < objs((m.patches as Rec).rules).length ? i : i - objs((m.patches as Rec).rules).length}].var`,
            'not a patch variable',
          );
      });
  }
  objs(m.breeds).forEach((b, bi) => {
    const w = `model.breeds[${bi}]`;
    objs(b.rules).forEach((a, i) => {
      checkAction(a, `${w}.rules[${i}]`, N, m, E, false);
    });
    if (b.place === 'node' && sp.kind !== 'network') E('value', w + '.place', 'node placement is for a network');
    if (b.place === 'empty' && sp.kind !== 'grid') E('value', w + '.place', 'empty placement is for a grid');
    if (isObj(b.vars))
      for (const [k, v] of Object.entries(b.vars))
        if (isObj(v) && v.type === 'cat' && v.n == null)
          E('value', `${w}.vars.${k}.n`, 'missing (a category variable needs n, the number of categories)');
    if (isObj(b.bdi)) {
      const gid = objs(b.bdi.goals).map(g => g.id);
      objs(b.bdi.plans).forEach((p, i) => {
        if (typeof p.goal === 'string' && !gid.includes(p.goal)) E('value', `${w}.bdi.plans[${i}].goal`, 'not a goal of this breed');
        objs(p.body).forEach((a, j) => {
          checkAction(a, `${w}.bdi.plans[${i}].body[${j}]`, N, m, E, true);
        });
      });
      for (const g of gid)
        if (!objs(b.bdi.plans).some(p => p.goal === g)) E('value', `${w}.bdi.goals`, `the goal ${g as string} has no plan`);
    }
  });
  objs(m.aggregates)
    .concat(objs(m.reporters))
    .forEach((a, i) => {
      const w = i < objs(m.aggregates).length ? `model.aggregates[${i}]` : `model.reporters[${i - objs(m.aggregates).length}]`;
      if (a.breed != null && !N.bid.includes(a.breed as string)) E('value', w + '.breed', 'not a breed');
      if (['sum', 'mean', 'min', 'max', 'var', 'gini'].includes(a.fn as string) && a.expr == null)
        E('value', w + '.expr', `missing (${a.fn as string} needs expr)`);
      if (a.fn === 'frac' && a.where == null && a.expr == null) E('value', w + '.where', 'missing (frac needs where or expr)');
      if (a.fn === 'order' && sp.kind !== 'continuous')
        E('value', w + '.fn', 'order (the alignment of headings) is for a continuous space');
      if (a.of === 'patches' && !N.pvars.length) E('value', w + '.of', 'the model has no patches');
      if (a.perf != null && a.of !== 'inbox') E('value', w + '.perf', 'goes with of: inbox');
    });
  objs(m.hist).forEach((h, i) => {
    if (h.breed != null && !N.bid.includes(h.breed as string)) E('value', `model.hist[${i}].breed`, 'not a breed');
  });
  objs(m.interrupts).forEach((it, i) => {
    const w = `model.interrupts[${i}]`;
    if ((it.at == null) === (it.when == null)) E('event', w, 'needs at (a step) or when (a condition), not both');
    if (isObj(it.set))
      for (const k of Object.keys(it.set))
        if (okName(k) && !N.globals.includes(k) && !(tpl && Object.prototype.hasOwnProperty.call(TEMPLATES[tpl], k)))
          E('value', `${w}.set.${k}`, 'not a global of the model');
  });
  objs(m.norms).forEach((nm, i) => {
    const w = `model.norms[${i}]`;
    if (nm.breed != null && !N.bid.includes(nm.breed as string)) E('value', w + '.breed', 'not a breed');
    if (isObj(nm.sanction) && okName(nm.sanction.var) && !N.allVars.includes(nm.sanction.var))
      E('value', w + '.sanction.var', 'not a variable of a breed');
    if (nm.kind === 'P' && nm.sanction != null) E('value', w + '.sanction', 'a permission is never violated');
  });
  if (m.replications != null && proto) E('value', 'model.replications', 'a protocol repeats by its own rounds');
  // outputs
  const need = (cond: unknown, at: string, f: string, msg: string) => {
    if (!cond) E('output', at + '.' + f, msg);
    return cond;
  };
  const reps = tpl ? templateReporters(tpl) : N.reps;
  C.checkOutputs(
    spec,
    ID,
    kinds,
    (o, at) => {
      const of = o.of,
        kd = o.kind,
        known = kd === 'series' ? SERIES : kd === 'scalar' ? SCALARS : SCENES;
      if (!known.includes(of as string)) {
        E('output', at + '.of', `${ID} computes as a ${kd as string}: ${known.join(', ')}`);
        return;
      }
      for (const [f, k] of Object.entries(OUT_FIELDS)) if (o[f] != null && !C.checkKind(k, o[f])) E('output', at + '.' + f, C.kindMsg(k)!);
      if (['reporter', 'final', 'stat', 'replMean', 'replLo', 'replHi', 'replHalf', 'replSd', 'replValues'].includes(of as string))
        need(
          typeof o.reporter === 'string' && reps.includes(o.reporter),
          at,
          'reporter',
          'a reporter of the model' + (reps.length ? ': ' + reps.join(', ') : ''),
        );
      if (of === 'stat') need(C.STATS.includes(o.stat as string), at, 'stat', 'one of ' + C.STATS.join(', '));
      if (/^repl/.test(of as string)) need(isObj(m.replications), at, 'of', 'needs model.replications');
      if (of === 'hist' || of === 'histEdges')
        need(
          objs(m.hist).some(h => h.id === o.hist) || (tpl && objs(template(tpl)!.hist).some(h => h.id === o.hist)),
          at,
          'hist',
          'a histogram of model.hist',
        );
      if (of === 'agentVar') {
        need(
          typeof o.var === 'string' && (N.allVars.includes(o.var) || BUILTIN.includes(o.var) || (tpl && templateVars(tpl).includes(o.var))),
          at,
          'var',
          'a variable of a breed (or x, y, heading, age)',
        );
      }
      if (of === 'count' && o.breed != null)
        need(N.bid.includes(o.breed as string) || (tpl && templateBreeds(tpl).includes(o.breed as string)), at, 'breed', 'a breed');
      if (of === 'violations' || of === 'fulfilments') {
        need(objs(m.norms).length > 0, at, 'of', 'needs model.norms');
        if (o.norm != null)
          need(
            objs(m.norms).some(n => n.id === o.norm),
            at,
            'norm',
            'a norm of model.norms',
          );
      }
      if (of === 'bdi') {
        need(
          objs(m.breeds).some(b => isObj(b.bdi)),
          at,
          'of',
          'needs a breed with bdi',
        );
        need(BDI_NAMES.includes(o.name as string), at, 'name', 'one of ' + BDI_NAMES.join(', '));
      }
      if (of === 'protocol' || of === 'protocolSeries') {
        if (need(!!proto && PROTOCOLS.includes(proto.kind as string), at, 'of', 'needs model.protocol')) {
          const nm = PROTO_NAMES[proto!.kind as string]![kd as string]!;
          need(nm.includes(o.name as string), at, 'name', `${proto!.kind as string} gives as a ${kd as string}: ${nm.join(', ')}`);
        }
      }
      if (of === 'space') need(!proto, at, 'of', 'a protocol has no space');
      if (of === 'flag') need(CODES.includes(o.code as string), at, 'code', 'one of ' + CODES.join(', '));
    },
    E,
    W,
  );
  return P;
}
/** every expression of the model: [source, path, local names] */
function exprs(spec: unknown) {
  const out: Array<[string, string, string[]]> = [],
    m = isObj(spec) && isObj(spec.model) ? spec.model : null;
  if (!m) return out;
  const add = (v: unknown, p: string, l: string[]) => {
    if (typeof v === 'string') out.push([v, p, l]);
  };
  if (isObj(m.set)) for (const [k, v] of Object.entries(m.set)) add(v, 'model.set.' + k, []);
  const N = names(m),
    G = N.globals.concat(m.template && TEMPLATES[m.template as string] ? Object.keys(TEMPLATES[m.template as string]!) : []);
  const P = N.pvars.map(v => 'p_' + v);
  const agentL = (vars: string[]) => vars.concat(BUILTIN, N.aggs, P, G, ['t']);
  const otherL = (vars: string[]) =>
    vars.concat(
      BUILTIN,
      vars.map(v => 'my_' + v),
      ['my_x', 'my_y', 'my_id', 'content', 'from'],
      G,
      ['t'],
    );
  if (isObj(m.globals)) for (const [k, v] of Object.entries(m.globals)) add(v, 'model.globals.' + k, []);
  const sp = isObj(m.space) ? m.space : null;
  if (sp) for (const k of ['w', 'h', 'radius']) add(sp[k], 'model.space.' + k, G);
  if (isObj(m.patches)) {
    const pl = N.pvars.concat(['px', 'py', 't'], G);
    if (isObj(m.patches.vars))
      for (const [k, v] of Object.entries(m.patches.vars)) add(v, 'model.patches.vars.' + k, ['px', 'py'].concat(G));
    objs(m.patches.rules).forEach((r, i) => {
      add(r.expr, `model.patches.rules[${i}].expr`, pl);
    });
    objs(m.patches.diffuse).forEach((r, i) => {
      add(r.rate, `model.patches.diffuse[${i}].rate`, G.concat(['t']));
    });
  }
  const actionExprs = (a: Rec, w: string, own: string[]) => {
    const L = agentL(own),
      O = otherL(N.allVars);
    add(a.when, w + '.when', L);
    add(a.prob, w + '.prob', L);
    add(a.expr, w + '.expr', L);
    for (const k of [
      'speed',
      'turn',
      'amount',
      'gain',
      'self',
      'J',
      'h',
      'T',
      'content',
      'contacts',
      'radius',
      'sep',
      'ali',
      'coh',
      'sepRadius',
      'vision',
    ])
      add(a[k], `${w}.${k}`, L);
    add(a.where, w + '.where', O);
    if (isObj(a.set)) for (const [k, v] of Object.entries(a.set)) add(v, `${w}.set.${k}`, O);
  };
  objs(m.breeds).forEach((b, bi) => {
    const w = `model.breeds[${bi}]`,
      own = N.vars[b.id as string] || [];
    add(b.count, w + '.count', G);
    if (isObj(b.vars))
      for (const [k, v] of Object.entries(b.vars))
        if (isObj(v)) add(v.init, `${w}.vars.${k}.init`, ['x', 'y', 'id', 'rnd', 'deg'].concat(G));
    objs(b.rules).forEach((a, i) => {
      actionExprs(a, `${w}.rules[${i}]`, own);
    });
    if (isObj(b.bdi)) {
      const L = agentL(own);
      objs(b.bdi.goals).forEach((g, i) => {
        for (const k of ['when', 'achieved', 'impossible', 'priority']) add(g[k], `${w}.bdi.goals[${i}].${k}`, L);
      });
      objs(b.bdi.plans).forEach((p, i) => {
        add(p.context, `${w}.bdi.plans[${i}].context`, L);
        objs(p.body).forEach((a, j) => {
          actionExprs(a, `${w}.bdi.plans[${i}].body[${j}]`, own);
        });
      });
    }
  });
  objs(m.aggregates).forEach((a, i) => {
    add(a.expr, `model.aggregates[${i}].expr`, otherL(N.allVars));
    add(a.where, `model.aggregates[${i}].where`, otherL(N.allVars));
  });
  objs(m.reporters).forEach((r, i) => {
    const L = r.of === 'patches' ? N.pvars.concat(['px', 'py', 't'], G) : N.allVars.concat(BUILTIN, N.aggs, P, G, ['t']);
    add(r.expr, `model.reporters[${i}].expr`, L);
    add(r.where, `model.reporters[${i}].where`, L);
  });
  objs(m.hist).forEach((h, i) => {
    add(h.expr, `model.hist[${i}].expr`, N.allVars.concat(BUILTIN, N.aggs, P, G, ['t']));
    add(h.min, `model.hist[${i}].min`, []);
    add(h.max, `model.hist[${i}].max`, []);
  });
  const R = (m.template && TEMPLATES[m.template as string] ? templateReporters(m.template as string) : N.reps).concat(G, ['t']);
  add(m.dt, 'model.dt', []);
  add(m.stop, 'model.stop', R);
  objs(m.interrupts).forEach((it, i) => {
    add(it.when, `model.interrupts[${i}].when`, R);
    if (isObj(it.set)) for (const [k, v] of Object.entries(it.set)) add(v, `model.interrupts[${i}].set.${k}`, R);
  });
  objs(m.norms).forEach((n, i) => {
    if (isObj(n.sanction)) add(n.sanction.add, `model.norms[${i}].sanction.add`, N.allVars.concat(BUILTIN, G, ['t']));
  });
  if (isObj(m.protocol)) {
    const p = m.protocol;
    for (const k of ['costMin', 'costMax', 'loadFactor', 'inc', 'reserve', 'a1', 'a2', 'step']) add(p[k], 'model.protocol.' + k, []);
    add(p.v, 'model.protocol.v', ['s', 'w', 'k0', 'k1']);
  }
  return out;
}
function keys() {
  return [];
}

/* ======================================================================================================================
     Templates: the classic models written in the engine's own model language (so they run through the same machinery)
     ====================================================================================================================== */
function template(name: unknown): ModelM | null {
  switch (name) {
    case 'schelling':
      return {
        // Schelling 1971: two groups, an agent moves when fewer than `want` of its neighbours are like it
        space: { kind: 'grid', nx: 'size', ny: 'size', torus: true, neighbourhood: 'moore', capacity: 1 },
        breeds: [
          {
            id: 'person',
            count: 'round(density*size*size)',
            place: 'empty',
            vars: { group: { init: 'rnd < fracA ? 0 : 1', type: 'cat', n: 2 } },
            rules: [{ do: 'move', how: 'jump', when: 'nb > 0 && same/nb < want', act: 'moved' }],
          },
        ],
        aggregates: [
          { id: 'same', of: 'neighbours', fn: 'count', where: 'group == my_group' },
          { id: 'nb', of: 'neighbours', fn: 'count' },
        ],
        reporters: [
          { id: 'similar', fn: 'mean', expr: 'same/nb', where: 'nb > 0' },
          { id: 'unhappy', fn: 'frac', where: 'nb > 0 && same/nb < want' },
          { id: 'agents', fn: 'count' },
        ],
        steps: 100,
        stop: 'unhappy == 0',
      };
    case 'boids':
      return {
        // Reynolds 1987; the order parameter of Vicsek et al. 1995
        space: { kind: 'continuous', w: 'w', h: 'w', torus: true },
        breeds: [
          {
            id: 'boid',
            count: 'N',
            vars: {},
            rules: [{ do: 'flock', radius: 'radius', sep: 'sep', ali: 'ali', coh: 'coh', sepRadius: 'sepRadius', speed: 'speed' }],
          },
        ],
        reporters: [
          { id: 'order', fn: 'order' },
          { id: 'agents', fn: 'count' },
        ],
        steps: 300,
      };
    case 'sir':
      return {
        // a grid epidemic, one person a cell, Moore contacts
        space: { kind: 'grid', nx: 'size', ny: 'size', torus: true, neighbourhood: 'moore', capacity: 1 },
        breeds: [
          {
            id: 'person',
            count: 'size*size',
            place: 'empty',
            vars: { state: { init: 'rnd < i0 ? 1 : 0', type: 'cat', n: 3 } },
            rules: [
              { do: 'contact', when: 'state == 1', where: 'state == 0', prob: 'beta', set: { state: 1 } },
              { do: 'set', var: 'state', expr: '2', when: 'state == 1', prob: 'gamma' },
            ],
          },
        ],
        reporters: [
          { id: 'S', fn: 'frac', where: 'state == 0' },
          { id: 'I', fn: 'frac', where: 'state == 1' },
          { id: 'R', fn: 'frac', where: 'state == 2' },
        ],
        schedule: 'sync',
        steps: 300,
        stop: 'I == 0',
      };
    case 'sirnet':
      return {
        space: { kind: 'network', generate: { kind: 'ws', n: 'N', k: 'k', p: 'p' } },
        breeds: [
          {
            id: 'person',
            count: 'N',
            place: 'node',
            vars: { state: { init: 'rnd < i0 ? 1 : 0', type: 'cat', n: 3 } },
            rules: [
              { do: 'contact', when: 'state == 1', where: 'state == 0', prob: 'beta', set: { state: 1 } },
              { do: 'set', var: 'state', expr: '2', when: 'state == 1', prob: 'gamma' },
            ],
          },
        ],
        reporters: [
          { id: 'S', fn: 'frac', where: 'state == 0' },
          { id: 'I', fn: 'frac', where: 'state == 1' },
          { id: 'R', fn: 'frac', where: 'state == 2' },
        ],
        schedule: 'sync',
        steps: 500,
        stop: 'I == 0',
      };
    case 'sirwell':
      return {
        // well mixed: `contacts` random contacts a step → the ODE with β' = contacts·β (Kermack & McKendrick 1927)
        space: { kind: 'none' },
        breeds: [
          {
            id: 'person',
            count: 'N',
            vars: { state: { init: 'id < max(1, round(i0*N)) ? 1 : 0', type: 'cat', n: 3 } },
            rules: [
              { do: 'contact', when: 'state == 1', where: 'state == 0', prob: 'beta', contacts: 'contacts', set: { state: 1 } },
              { do: 'set', var: 'state', expr: '2', when: 'state == 1', prob: 'gamma' },
            ],
          },
        ],
        reporters: [
          { id: 'S', fn: 'frac', where: 'state == 0' },
          { id: 'I', fn: 'frac', where: 'state == 1' },
          { id: 'R', fn: 'frac', where: 'state == 2' },
        ],
        schedule: 'sync',
        steps: 2000,
        stop: 'I == 0',
      };
    case 'sugarscape':
      return {
        // Epstein & Axtell 1996 ch. II (rule G1, M): two sugar hills, vision, metabolism, death by starvation
        space: { kind: 'grid', nx: 'size', ny: 'size', torus: true, neighbourhood: 'vonneumann', capacity: 1 },
        patches: {
          vars: {
            cap: 'min(4, round(4*exp(-((px-0.3*size)^2+(py-0.3*size)^2)/(0.06*size*size)) + 4*exp(-((px-0.7*size)^2+(py-0.7*size)^2)/(0.06*size*size))))',
            sugar:
              'min(4, round(4*exp(-((px-0.3*size)^2+(py-0.3*size)^2)/(0.06*size*size)) + 4*exp(-((px-0.7*size)^2+(py-0.7*size)^2)/(0.06*size*size))))',
          },
          rules: [{ var: 'sugar', expr: 'min(cap, sugar + regrow)' }],
        },
        breeds: [
          {
            id: 'ant',
            count: 'N',
            place: 'empty',
            vars: {
              vision: { init: '1 + floor(rnd*6)', type: 'int' },
              metab: { init: '1 + floor(rnd*4)', type: 'int' },
              wealth: { init: '5 + floor(rnd*21)' },
            },
            rules: [
              { do: 'move', how: 'gradient', patch: 'sugar', vision: 'vision' },
              { do: 'eat', patch: 'sugar', amount: '1e9', into: 'wealth' },
              { do: 'set', var: 'wealth', expr: 'wealth - metab' },
              { do: 'die', when: 'wealth < 0' },
            ],
          },
        ],
        reporters: [
          { id: 'agents', fn: 'count' },
          { id: 'meanWealth', fn: 'mean', expr: 'wealth' },
          { id: 'gini', fn: 'gini', expr: 'wealth' },
          { id: 'meanVision', fn: 'mean', expr: 'vision' },
        ],
        hist: [{ id: 'wealth', expr: 'wealth', bins: 20, min: 0, max: 200 }],
        steps: 200,
      };
    case 'wolfsheep':
      return {
        // NetLogo Wolf Sheep Predation (Wilensky 1997), the grass version
        space: { kind: 'grid', nx: 'size', ny: 'size', torus: true, neighbourhood: 'moore', capacity: 1000 },
        patches: {
          vars: { grass: 'rnd < 0.5 ? 1 : 0', clock: 'floor(rnd*regrowTime)' },
          rules: [
            { var: 'clock', expr: 'grass > 0 ? 0 : clock + 1' },
            { var: 'grass', expr: 'grass > 0 || clock >= regrowTime ? 1 : 0' },
          ],
        },
        breeds: [
          {
            id: 'sheep',
            count: 'sheep',
            vars: { energy: { init: '1 + floor(rnd*2*sheepGain)' } },
            rules: [
              { do: 'move', how: 'random' },
              { do: 'set', var: 'energy', expr: 'energy - 1' },
              { do: 'eat', patch: 'grass', amount: '1', into: 'energy', gain: 'sheepGain' },
              { do: 'die', when: 'energy < 0' },
              { do: 'reproduce', prob: 'sheepRepro', share: { energy: 0.5 } },
            ],
          },
          {
            id: 'wolf',
            count: 'wolves',
            vars: { energy: { init: '1 + floor(rnd*2*wolfGain)' } },
            rules: [
              { do: 'move', how: 'random' },
              { do: 'set', var: 'energy', expr: 'energy - 1' },
              { do: 'hunt', breed: 'sheep', into: 'energy', gain: 'wolfGain' },
              { do: 'die', when: 'energy < 0' },
              { do: 'reproduce', prob: 'wolfRepro', share: { energy: 0.5 } },
            ],
          },
        ],
        reporters: [
          { id: 'nSheep', breed: 'sheep', fn: 'count' },
          { id: 'nWolves', breed: 'wolf', fn: 'count' },
          { id: 'grass', of: 'patches', fn: 'sum', expr: 'grass' },
        ],
        steps: 500,
        stop: 'nSheep == 0',
      };
    case 'voter':
      return {
        // Clifford & Sudbury 1973, Holley & Liggett 1975: copy a random neighbour's opinion
        space: { kind: 'grid', nx: 'size', ny: 'size', torus: true, neighbourhood: 'vonneumann', capacity: 1 },
        breeds: [
          {
            id: 'voter',
            count: 'size*size',
            place: 'empty',
            vars: { op: { init: 'rnd < p0 ? 1 : 0', type: 'bool' } },
            rules: [{ do: 'adopt', var: 'op' }],
          },
        ],
        reporters: [{ id: 'mean', fn: 'mean', expr: 'op' }],
        steps: 200,
        stop: 'mean == 0 || mean == 1',
      };
    case 'ising':
      return {
        // Glauber 1963 heat bath on the square lattice; Onsager 1944: m = (1 − sinh(2J/T)^−4)^(1/8) below T_c = 2.269
        space: { kind: 'grid', nx: 'size', ny: 'size', torus: true, neighbourhood: 'vonneumann', capacity: 1 },
        breeds: [
          {
            id: 'spin',
            count: 'size*size',
            place: 'empty',
            vars: { s: { init: 'rnd < (1 + m0)/2 ? 1 : -1', type: 'int', min: -1, max: 1 } },
            rules: [{ do: 'ising', var: 's', J: 'J', h: 'h', T: 'T' }],
          },
        ],
        reporters: [
          { id: 'm', fn: 'mean', expr: 's' },
          { id: 'absm', fn: 'mean', expr: 's' },
        ],
        steps: 300,
      };
    case 'degroot':
      return {
        // DeGroot 1974: x ← W x with W row-stochastic (self weight + equal weights on the neighbours)
        space: { kind: 'network', generate: { kind: 'ws', n: 'N', k: 'k', p: 'p' } },
        breeds: [
          { id: 'node', count: 'N', place: 'node', vars: { x: { init: 'rnd' } }, rules: [{ do: 'average', var: 'x', self: 'selfw' }] },
        ],
        reporters: [
          { id: 'mean', fn: 'mean', expr: 'x' },
          { id: 'spread', fn: 'var', expr: 'x' },
          { id: 'weighted', fn: 'sum', expr: 'x*(deg + selfw)' },
          { id: 'wsum', fn: 'sum', expr: 'deg + selfw' },
        ],
        schedule: 'sync',
        steps: 200,
      };
    default:
      return null;
  }
}
function templateReporters(t: string) {
  const x = template(t);
  return x ? x.reporters!.map(r => r.id) : [];
}
function templateVars(t: string) {
  const x = template(t);
  return x ? ([] as string[]).concat(...x.breeds!.map(b => Object.keys(b.vars || {}))) : [];
}
function templateBreeds(t: string) {
  const x = template(t);
  return x ? x.breeds!.map(b => b.id) : [];
}

/* ======================================================================================================================
     Compilation
     ====================================================================================================================== */
function usesOf(src: unknown) {
  const s = new Set<string>();
  if (typeof src !== 'string') return s;
  let ast;
  try {
    ast = NoemaExpr.parse(src);
  } catch {
    return s;
  }
  (function walk(n) {
    if (n.t === 'var') s.add(n.name);
    else if (n.t === 'un') walk(n.a);
    else if (n.t === 'bin') {
      walk(n.a);
      walk(n.b);
    } else if (n.t === 'cond') {
      walk(n.c);
      walk(n.a);
      walk(n.b);
    } else if (n.t === 'call') n.args.forEach(walk);
  })(ast);
  return s;
}
const cmp = (v: unknown): Cmp | null =>
  v == null
    ? null
    : typeof v === 'number'
      ? { num: true, val: v, f: () => v, uses: new Set<string>() }
      : ({ num: false, f: C.cx(v), uses: usesOf(v), src: v } as Cmp);
function prepare(spec: Spec | null | undefined): Prepared | null {
  try {
    if (C.hasErrors(checkSpec(spec))) return null;
    const m0 = spec!.model as ModelM;
    if (isObj(m0.protocol)) return { proto: m0.protocol, m: m0, outs: objs(spec!.outputs) as unknown as OutM[] };
    const tpl = m0.template ? template(m0.template) : null;
    const m: ModelM = tpl ? Object.assign({}, tpl, { globals: Object.assign({}, TEMPLATES[m0.template!], m0.set || {}) }) : m0;
    for (const k of ['steps', 'schedule', 'stop', 'interrupts', 'replications', 'every', 'maxOps', 'hist', 'norms', 'dt'])
      if (m0[k] != null) m[k] = m0[k];
    const M = {
      m,
      tpl: m0.template || null,
      outs: objs(spec!.outputs) as unknown as OutM[],
      sp: Object.assign({ kind: 'none' }, m.space || {}),
    } as Prep;
    M.globals = Object.entries(m.globals || {}).map(([k, v]): [string, Cmp | null] => [k, cmp(v)]);
    M.pvars =
      isObj(m.patches) && isObj(m.patches.vars) ? Object.entries(m.patches.vars).map(([k, v]): [string, Cmp | null] => [k, cmp(v)]) : [];
    M.prules = isObj(m.patches)
      ? objs(m.patches.rules).map(r => {
          const f = cmp(r.expr);
          return { var: r.var, f, rnd: f!.uses.has('rnd') };
        })
      : [];
    M.diffuse = isObj(m.patches) ? objs(m.patches.diffuse).map(r => ({ var: r.var, rate: cmp(r.rate) })) : [];
    const act = (a: ActionM): Act =>
      Object.assign({}, a, {
        whenC: cmp(a.when),
        probC: cmp(a.prob),
        exprC: cmp(a.expr),
        whereC: cmp(a.where),
        contentC: cmp(a.content),
        setC: isObj(a.set) ? Object.entries(a.set).map(([k, v]): [string, Cmp | null] => [k, cmp(v)]) : [],
        P: Object.fromEntries(
          ['speed', 'turn', 'amount', 'gain', 'self', 'J', 'h', 'T', 'contacts', 'radius', 'sep', 'ali', 'coh', 'sepRadius', 'vision']
            .filter(k => a[k] != null)
            .map(k => [k, cmp(a[k])]),
        ),
      });
    M.breeds = objs(m.breeds).map(
      (b, bi) =>
        ({
          id: b.id,
          bi,
          count: cmp(b.count),
          place: b.place || 'random',
          vars: Object.entries(b.vars || {}).map(([k, v]) => ({
            name: k,
            init: cmp(v.init),
            type: v.type || 'num',
            min: v.min,
            max: v.max,
            n: v.n,
          })),
          rules: objs(b.rules).map(act),
          bdi: isObj(b.bdi)
            ? {
                commitment: b.bdi.commitment || 'single',
                goals: objs(b.bdi.goals).map(g => ({
                  id: g.id,
                  when: cmp(g.when),
                  achieved: cmp(g.achieved),
                  impossible: cmp(g.impossible),
                  priority: cmp(g.priority != null ? g.priority : 0),
                })),
                plans: objs(b.bdi.plans).map(p => ({ id: p.id, goal: p.goal, context: cmp(p.context), body: objs(p.body).map(act) })),
              }
            : null,
        }) as BreedP,
    );
    M.aggs = objs(m.aggregates).map(a => Object.assign({}, a, { exprC: cmp(a.expr), whereC: cmp(a.where) }));
    M.reps = objs(m.reporters).map(r => Object.assign({}, r, { exprC: cmp(r.expr), whereC: cmp(r.where) }));
    M.hist = objs(m.hist).map(h => Object.assign({}, h, { exprC: cmp(h.expr), minC: cmp(h.min), maxC: cmp(h.max) }));
    M.interrupts = objs(m.interrupts).map(it => ({
      at: it.at,
      when: cmp(it.when),
      once: it.once !== false,
      set: Object.entries(it.set || {}).map(([k, v]): [string, Cmp | null] => [k, cmp(v)]),
    }));
    M.stop = cmp(m.stop);
    M.norms = objs(m.norms);
    // which aggregates each breed's expressions (and the reporters) use
    const aggIds = M.aggs.map(a => a.id);
    const usedBy = (cs: readonly (Cmp | null)[]) => {
      const u = new Set<string>();
      for (const c of cs) if (c) for (const n of c.uses) if (aggIds.includes(n)) u.add(n);
      return [...u];
    };
    for (const b of M.breeds) {
      const cs: (Cmp | null)[] = [];
      const addA = (a: Act) => {
        cs.push(a.whenC, a.probC, a.exprC);
        for (const v of Object.values(a.P)) cs.push(v);
      };
      b.rules.forEach(addA);
      if (b.bdi) {
        b.bdi.goals.forEach(g => cs.push(g.when, g.achieved, g.impossible, g.priority));
        b.bdi.plans.forEach(p => {
          cs.push(p.context);
          p.body.forEach(addA);
        });
      }
      b.aggUse = usedBy(cs);
    }
    M.repAggUse = usedBy(
      M.reps
        .map(r => r.exprC)
        .concat(
          M.reps.map(r => r.whereC),
          M.hist.map(h => h.exprC),
        ),
    );
    const byId = (id: string) => M.aggs.find(x => x.id === id);
    for (const b of M.breeds) b.aggObjs = b.aggUse.map(byId);
    M.repAggObjs = M.repAggUse.map(byId);
    // which expressions draw a random number (rnd): only those get a fresh draw (the draws stay deterministic per seed)
    const R = (c: Cmp | null) => !!(c && c.uses.has('rnd'));
    for (const b of M.breeds)
      for (const a of b.rules.concat(...(b.bdi ? b.bdi.plans.map(p => p.body) : []))) {
        a.rnd = [a.whenC, a.probC, a.exprC, ...Object.values(a.P)].some(R);
        a.ornd = [a.whereC, ...a.setC.map(x => x[1])].some(R);
      }
    for (const a of M.aggs) a.ornd = R(a.exprC) || R(a.whereC);
    M.repRnd = M.reps.some(r => R(r.exprC) || R(r.whereC));
    return M;
  } catch {
    return null;
  }
}

/* ======================================================================================================================
     The fallback norm monitor (logic@1 is imported, so it runs only without its normMonitor; code logic-fallback stays valid in specs): the same input and records as NoemaLibLogic.normMonitor
     (achieve with deadline / within, maintain, prohibitions, permissions ignored, viol_/fulf_ atoms), without conflict resolution
     ====================================================================================================================== */
function propParse(src: unknown) {
  const toks =
    String(src)
      .replace(/¬|~/g, '!')
      .replace(/∧/g, '&')
      .replace(/∨/g, '|')
      .replace(/↔/g, '<->')
      .replace(/→/g, '->')
      .replace(/⊤/g, 'true')
      .replace(/⊥/g, 'false')
      .match(/<->|->|[!&|()]|[A-Za-z_][A-Za-z0-9_]*|\S/g) || [];
  let i = 0;
  const peek = () => toks[i],
    eat = () => toks[i++];
  const prim = (): Prop => {
    const t = eat();
    if (t === '!') return { t: 'not', a: prim() };
    if (t === '(') {
      const e = iff();
      if (eat() !== ')') throw new Error('syntax');
      return e;
    }
    if (t === 'true') return { t: 'top' };
    if (t === 'false') return { t: 'bot' };
    if (t && /^[A-Za-z_]/.test(t)) return { t: 'atom', n: t };
    throw new Error('syntax');
  };
  const and = (): Prop => {
    let a = prim();
    while (peek() === '&') {
      eat();
      a = { t: 'and', a, b: prim() };
    }
    return a;
  };
  const or = (): Prop => {
    let a = and();
    while (peek() === '|') {
      eat();
      a = { t: 'or', a, b: and() };
    }
    return a;
  };
  const imp = (): Prop => {
    const a = or();
    if (peek() === '->') {
      eat();
      return { t: 'imp', a, b: imp() };
    }
    return a;
  };
  const iff = (): Prop => {
    let a = imp();
    while (peek() === '<->') {
      eat();
      a = { t: 'iff', a, b: imp() };
    }
    return a;
  };
  try {
    const e = iff();
    if (i !== toks.length) return null;
    return e;
  } catch {
    return null;
  }
}
function propEval(f: Prop, has: (atom: string) => boolean): boolean {
  switch (f.t) {
    case 'top':
      return true;
    case 'bot':
      return false;
    case 'atom':
      return has(f.n);
    case 'not':
      return !propEval(f.a, has);
    case 'and':
      return propEval(f.a, has) && propEval(f.b, has);
    case 'or':
      return propEval(f.a, has) || propEval(f.b, has);
    case 'imp':
      return !propEval(f.a, has) || propEval(f.b, has);
    case 'iff':
      return propEval(f.a, has) === propEval(f.b, has);
    default:
      return false;
  }
}
function fallbackMonitor(norms: readonly NormM[]) {
  const P: { id: string; kind: string; mode: string; act: Prop; cond: Prop; dl: Prop | null; un: Prop | null; within: number | null }[] =
      [],
    codes = new Set<string>();
  for (const n of norms) {
    const act = propParse(n.act),
      cond: Prop | null = n.cond ? propParse(n.cond) : { t: 'top' },
      dl = n.deadline ? propParse(n.deadline) : null,
      un = n.until ? propParse(n.until) : null;
    if (!act || !cond || (n.deadline && !dl) || (n.until && !un)) {
      codes.add('parse');
      continue;
    }
    const hasDl = !!dl || Number.isInteger(n.within);
    P.push({
      id: n.id,
      kind: n.kind,
      mode: n.kind === 'O' ? n.mode || (hasDl ? 'achieve' : 'maintain') : 'maintain',
      act,
      cond,
      dl,
      un,
      within: Number.isInteger(n.within) ? (n.within as number) : null,
    });
  }
  const live = new Map<string, { since: number; violated: boolean }>(),
    prev = new Map<string, boolean>(),
    viol = new Set<string>(),
    fulf = new Set<string>(),
    seen: string[] = [],
    pendV: string[] = [],
    pendF: string[] = [];
  const V: NormRecord[] = [],
    F: NormRecord[] = [];
  let step = 0;
  return {
    step(st: NormStepIn) {
      const fm = st.facts || {},
        am = st.acts || {},
        newV: NormRecord[] = [],
        newF: NormRecord[] = [];
      for (const a of Object.keys(am)) if (!seen.includes(a)) seen.push(a);
      const shared = new Set(fm['*'] || []);
      for (const n of P)
        for (const ag of seen) {
          const set = new Set(shared);
          (fm[ag] || []).forEach(x => set.add(x));
          (am[ag] || []).forEach(x => set.add(x));
          const has = (nm: string) =>
            nm.startsWith('viol_')
              ? viol.has(nm.slice(5) + '|' + ag)
              : nm.startsWith('fulf_')
                ? fulf.has(nm.slice(5) + '|' + ag)
                : set.has(nm);
          const k = n.id + '|' + ag,
            c = propEval(n.cond, has),
            was = prev.get(k) || false;
          prev.set(k, c);
          let inst: { since: number; violated: boolean } | null | undefined = live.get(k);
          if (!inst && c && !was) {
            inst = { since: step, violated: false };
            live.set(k, inst);
          }
          if (inst && n.mode === 'maintain' && !c && inst.since !== step) {
            if (!inst.violated && n.kind !== 'P') {
              newF.push({ norm: n.id, agent: ag, step, t: step, since: inst.since });
              pendF.push(k);
            }
            live.delete(k);
            inst = null;
          }
          if (!inst || n.kind === 'P') continue;
          const holds = propEval(n.act, has),
            dlNow = (n.dl && propEval(n.dl, has)) || (n.within !== null && step - inst.since >= n.within);
          if (n.mode === 'achieve') {
            if (holds) {
              newF.push({ norm: n.id, agent: ag, step, t: step, since: inst.since });
              pendF.push(k);
              live.delete(k);
            } else if (dlNow) {
              newV.push({ norm: n.id, agent: ag, step, t: step, kind: 'deadline', since: inst.since });
              pendV.push(k);
              live.delete(k);
            } else if (n.un && propEval(n.un, has)) live.delete(k);
          } else {
            const bad = n.kind === 'F' ? holds : !holds;
            if (bad) {
              newV.push({ norm: n.id, agent: ag, step, t: step, kind: n.kind === 'F' ? 'forbidden' : 'maintain', since: inst.since });
              pendV.push(k);
              inst.violated = true;
            }
            if ((n.un && propEval(n.un, has)) || dlNow) {
              if (!inst.violated) {
                newF.push({ norm: n.id, agent: ag, step, t: step, since: inst.since });
                pendF.push(k);
              }
              live.delete(k);
            }
          }
        }
      V.push(...newV);
      F.push(...newF);
      step++;
      for (const k of pendV) viol.add(k);
      for (const k of pendF) fulf.add(k);
      pendV.length = 0;
      pendF.length = 0;
      return { violations: newV, fulfilments: newF };
    },
    result: () => ({
      violations: V.slice(),
      fulfilments: F.slice(),
      pending: [],
      conflicts: [],
      codes: [...codes],
      counts: { violations: V.length, fulfilments: F.length, pending: 0, conflicts: 0 },
    }),
  };
}

/* ======================================================================================================================
     The simulation of an agent-based model
     ====================================================================================================================== */
const ROLE_BREED = ['hi', 'info', 'ok', 'warn', 'bad', 'muted'];
function coerce(V: VarP, val: number | boolean) {
  let v = typeof val === 'boolean' ? +val : val;
  if (V.type === 'bool') v = v !== 0 && v === v ? 1 : 0;
  else if (V.type === 'int') v = Math.round(v);
  else if (V.type === 'cat') v = Math.max(0, Math.min((V.n || 2) - 1, Math.round(v)));
  if (Number.isFinite(V.min) && v < V.min!) v = V.min!;
  if (Number.isFinite(V.max) && v > V.max!) v = V.max!;
  return v;
}
function simulate(M: Prep, env0: Rec | null | undefined, seed: number, opsCap: number) {
  const SKk = NoemaSimKit,
    m = M.m,
    sp = M.sp,
    codes = SKk.codes(FATAL),
    rng = SKk.stream(seed, 'agents.rules'),
    rngPlace = SKk.stream(seed, 'agents.place'),
    rngSched = SKk.stream(seed, 'agents.schedule'),
    rngNet = SKk.stream(seed, 'agents.network');
  let ops = 0;
  const budget = () => ops <= opsCap;
  const base = Object.assign(Object.create(null) as Env, env0 || {});
  for (const [k, c] of M.globals) base[k] = c!.f(base);
  const ev = (c: Cmp) => {
    ops++;
    return c.num ? c.val : c.f(E);
  };
  const E = Object.assign(Object.create(null) as Env, base); // the agent's view (its own vars, built-ins, aggregates, patch values)
  const O = Object.assign(Object.create(null) as Env, base); // the other agent's view (its vars; the focal agent's as my_…)
  // ---- space ----
  const kind = sp.kind,
    torus = !!sp.torus;
  const numS = (v: unknown) => (v == null ? NaN : typeof v === 'number' ? v : C.cx(v)(base));
  const W = kind === 'continuous' ? numS(sp.w != null ? sp.w : 100) : kind === 'grid' ? numS(sp.nx != null ? sp.nx : 20) : 1;
  const H =
    kind === 'continuous'
      ? numS(sp.h != null ? sp.h : sp.w != null ? sp.w : 100)
      : kind === 'grid'
        ? numS(sp.ny != null ? sp.ny : sp.nx != null ? sp.nx : 20)
        : 1;
  const nx = kind === 'grid' ? Math.max(2, Math.min(200, Math.round(W))) : 0,
    ny = kind === 'grid' ? Math.max(2, Math.min(200, Math.round(H))) : 0;
  const radius = sp.radius != null ? numS(sp.radius) : kind === 'continuous' ? 0.1 * W : 1;
  const cap = sp.capacity || (kind === 'grid' ? 1 : 1e9);
  const cellNb =
    kind === 'grid' ? S.latticeNeighbours(nx, ny, sp.neighbourhood || 'moore', Math.max(1, Math.round(radius) || 1), torus) : null;
  // network
  let net = null as ReturnType<typeof S.adjacency> | null,
    nNodes = 0,
    layout = null as Float64Array[] | null;
  if (kind === 'network') {
    let edges = null as (readonly number[])[] | null;
    if (Array.isArray(sp.edges)) {
      edges = (sp.edges as readonly (readonly number[])[]).map(e => [Math.round(e[0]!), Math.round(e[1]!), e[2]!]);
      nNodes = sp.nodes || edges.reduce((a, e) => Math.max(a, e[0]! + 1, e[1]! + 1), 0);
    } else {
      const g = sp.generate,
        n = Math.round(numS(g!.n != null ? g!.n : 100)),
        k = Math.round(numS(g!.k != null ? g!.k : 2)),
        p = numS(g!.p != null ? g!.p : 0.1),
        mm = Math.round(numS(g!.m != null ? g!.m : 2));
      nNodes = g!.kind === 'lattice' ? (g!.nx || 10) * (g!.ny || g!.nx || 10) : Math.max(2, Math.min(MAX_AGENTS, n));
      edges =
        g!.kind === 'ring'
          ? S.ring(nNodes, k)
          : g!.kind === 'er'
            ? S.erdosRenyi(nNodes, p, rngNet)
            : g!.kind === 'ws'
              ? S.wattsStrogatz(nNodes, k, p, rngNet)
              : g!.kind === 'ba'
                ? S.barabasiAlbert(nNodes, mm, rngNet)
                : g!.kind === 'lattice'
                  ? S.latticeEdges(g!.nx || 10, g!.ny || g!.nx || 10, false)
                  : (() => {
                      const E2: [number, number][] = [];
                      for (let i = 0; i < nNodes; i++) for (let j = i + 1; j < nNodes; j++) E2.push([i, j]);
                      return E2;
                    })();
      if (g!.kind === 'lattice') {
        const lx = g!.nx || 10;
        layout = [new Float64Array(nNodes), new Float64Array(nNodes)];
        for (let i = 0; i < nNodes; i++) {
          layout[0]![i] = ((i % lx) + 0.5) / lx;
          layout[1]![i] = (Math.floor(i / lx) + 0.5) / lx;
        }
      }
    }
    nNodes = Math.min(MAX_AGENTS, nNodes);
    net = S.adjacency(nNodes, edges, !!sp.directed);
    if (!layout) layout = S.circleLayout(nNodes);
  }
  // patches
  const pnx = kind === 'grid' ? nx : isObj(m.patches) ? m.patches.nx || 20 : 0,
    pny = kind === 'grid' ? ny : isObj(m.patches) ? m.patches.ny || m.patches.nx || 20 : 0;
  const patch: Record<string, Float64Array> = {};
  for (const [k] of M.pvars) patch[k] = new Float64Array(pnx * pny);
  if (M.pvars.length) {
    const pe = Object.assign(Object.create(null) as Env, base);
    for (let j = 0; j < pny; j++)
      for (let i = 0; i < pnx; i++) {
        pe.px = i;
        pe.py = j;
        for (const [k, c] of M.pvars) {
          pe.rnd = rngPlace();
          patch[k]![j * pnx + i] = c!.f(pe);
          ops++;
        }
      }
  }
  const patchOf = (a: Agent) =>
    kind === 'grid'
      ? a.cell
      : pnx
        ? Math.min(pny - 1, Math.max(0, Math.floor((a.y / H) * pny))) * pnx + Math.min(pnx - 1, Math.max(0, Math.floor((a.x / W) * pnx)))
        : -1;
  // ---- agents ----
  const agents: Agent[] = [],
    byCell = kind === 'grid' ? Array.from({ length: nx * ny }, (): Agent[] => []) : null,
    byNode = kind === 'network' ? Array.from({ length: nNodes }, (): Agent[] => []) : null;
  let nextId = 0;
  const occupy = (a: Agent, c: number) => {
    if (byCell) {
      if (a.cell >= 0) {
        const L = byCell[a.cell];
        const q = L!.indexOf(a);
        if (q >= 0) L!.splice(q, 1);
      }
      a.cell = c;
      if (c >= 0) byCell[c]!.push(a);
      a.x = (c % nx) + 0.5;
      a.y = Math.floor(c / nx) + 0.5;
    }
  };
  const occupyNode = (a: Agent, nd: number) => {
    if (byNode) {
      if (a.node >= 0) {
        const L = byNode[a.node];
        const q = L!.indexOf(a);
        if (q >= 0) L!.splice(q, 1);
      }
      a.node = nd;
      if (nd >= 0) byNode[nd]!.push(a);
      a.x = layout![0]![nd]!;
      a.y = layout![1]![nd]!;
    }
  };
  const emptyCells = () => {
    const out: number[] = [];
    for (let c = 0; c < nx * ny; c++) if (byCell![c]!.length < cap) out.push(c);
    return out;
  };
  const randomEmpty = () => {
    for (let k = 0; k < 64; k++) {
      const c = rngPlace.int(nx * ny);
      if (byCell![c]!.length < cap) return c;
    }
    const e = emptyCells();
    return e.length ? e[rngPlace.int(e.length)]! : -1;
  };
  const setEnvAgent = (a: Agent) => {
    E.x = a.x;
    E.y = a.y;
    E.heading = a.heading;
    E.age = a.age;
    E.id = a.id;
    E.deg = a.node >= 0 && net ? net.off[a.node + 1]! - net.off[a.node]! : 0;
    E.intending = a.int ? 1 : 0;
    for (const k in a.v) E[k] = a.v[k]!;
    if (M.pvars.length) {
      const p = patchOf(a);
      for (const [k] of M.pvars) E['p_' + k] = p >= 0 ? patch[k]![p]! : NaN;
    }
  };
  function addAgent(B: BreedP, x: number, y: number, parent: Agent | null, nodeHint?: number | null) {
    if (agents.length >= MAX_AGENTS) {
      codes.code('agent-limit');
      return null;
    }
    const a: Agent = {
      id: nextId++,
      b: B.bi,
      B,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      heading: rngPlace() * 2 * Math.PI,
      age: 0,
      alive: true,
      v: {},
      cell: -1,
      node: -1,
      inbox: [],
      acts: null,
      int: null,
    };
    if (kind === 'grid') {
      let c = -1;
      if (parent) {
        if (byCell![parent.cell]!.length < cap) c = parent.cell;
        else {
          const nb: number[] = [];
          for (let e = cellNb!.off[parent.cell]; e! < cellNb!.off[parent.cell + 1]!; e!++)
            if (byCell![cellNb!.nbr[e!]!]!.length < cap) nb.push(cellNb!.nbr[e!]!);
          c = nb.length ? nb[rngPlace.int(nb.length)]! : -1;
        }
      } else c = B.place === 'empty' || cap === 1 ? randomEmpty() : rngPlace.int(nx * ny);
      if (c < 0) {
        codes.code('no-space');
        return null;
      }
      occupy(a, c);
    } else if (kind === 'network') {
      const nd = parent ? parent.node : nodeHint != null ? nodeHint : rngPlace.int(nNodes);
      if (nd < 0 || nd >= nNodes) {
        codes.code('no-space');
        return null;
      }
      occupyNode(a, nd);
    } else if (kind === 'continuous' && !parent && !Number.isFinite(x)) {
      a.x = rngPlace() * W;
      a.y = rngPlace() * H;
    }
    if (parent) {
      a.heading = parent.heading;
      for (const k in parent.v) a.v[k] = parent.v[k]!;
    } else {
      E.x = a.x;
      E.y = a.y;
      E.id = a.id;
      E.deg = a.node >= 0 && net ? net.off[a.node + 1]! - net.off[a.node]! : 0;
      for (const V of B.vars) {
        E.rnd = rngPlace();
        a.v[V.name] = coerce(V, ev(V.init!));
        E[V.name] = a.v[V.name]!;
      }
    }
    agents.push(a);
    return a;
  }
  for (const B of M.breeds) {
    const n = Math.max(0, Math.round(ev(B.count!)));
    for (let q = 0; q < n; q++) {
      if (B.place === 'node' && kind === 'network' && q >= nNodes) {
        codes.code('no-space');
        break;
      }
      if (!addAgent(B, NaN, NaN, null, B.place === 'node' ? q : null)) break;
    }
  }
  const steps = Math.min(MAX_STEPS, m.steps || 100),
    every = m.every || 1,
    dt = m.dt != null ? numS(m.dt) : 1,
    schedule = m.schedule || 'random';
  // ---- neighbours ----
  let bucket = null as ReturnType<typeof S.buckets> | null;
  const rebuild = () => {
    if (kind !== 'continuous') return;
    const xs = agents.map(a => a.x),
      ys = agents.map(a => a.y);
    bucket = bucket || S.buckets(W, H, Math.max(radius, 1e-9), torus);
    bucket.build(xs, ys, agents.length, k => agents[k]!.alive);
  };
  const neighbours = (a: Agent, r?: number | null) => {
    const out: Agent[] = [];
    if (kind === 'grid') {
      if (a.cell < 0) return out;
      for (const o of byCell![a.cell]!) if (o !== a && o.alive) out.push(o);
      for (let e = cellNb!.off[a.cell]; e! < cellNb!.off[a.cell + 1]!; e!++)
        for (const o of byCell![cellNb!.nbr[e!]!]!) if (o.alive) out.push(o);
      ops += out.length / 2;
    } else if (kind === 'network') {
      if (a.node < 0) return out;
      for (const o of byNode![a.node]!) if (o !== a && o.alive) out.push(o);
      for (let e = net!.off[a.node]; e! < net!.off[a.node + 1]!; e!++) for (const o of byNode![net!.nbr[e!]!]!) if (o.alive) out.push(o);
      ops += out.length / 2;
    } else if (kind === 'continuous') {
      const rr = r != null ? r : radius;
      const vis = bucket!.query(a.x, a.y, rr, k => {
        const o = agents[k];
        if (o !== a && o!.alive) out.push(o!);
      });
      ops += vis / 2;
    } else {
      for (const o of agents) if (o !== a && o.alive) out.push(o);
      ops += out.length / 2;
    }
    return out;
  };
  const here = (a: Agent) =>
    kind === 'grid'
      ? byCell![a.cell]!.filter(o => o !== a && o.alive)
      : kind === 'network'
        ? byNode![a.node]!.filter(o => o !== a && o.alive)
        : kind === 'continuous'
          ? neighbours(a, 1e-9 + 0.5)
          : [];
  // sync: the states at the start of the step
  const sync = schedule === 'sync';
  const stateOf = (o: Agent) => (sync && o.pv ? o.pv : o.v);
  const MYK = Object.create(null) as Record<string, string>,
    myKey = (k: string) => MYK[k] || (MYK[k] = 'my_' + k);
  const setMine = (a: Agent) => {
    const av = stateOf(a);
    for (const k in av) O[myKey(k)] = av[k]!;
    O.my_x = a.x;
    O.my_y = a.y;
    O.my_id = a.id;
    O.t = E.t!;
  };
  const setOnly = (o: Agent, rnd: boolean | undefined) => {
    const v = stateOf(o);
    for (const k in v) O[k] = v[k]!;
    O.x = o.x;
    O.y = o.y;
    O.heading = o.heading;
    O.age = o.age;
    O.id = o.id;
    O.deg = o.node >= 0 && net ? net.off[o.node + 1]! - net.off[o.node]! : 0;
    if (rnd) O.rnd = rng();
  };
  const setOther = (o: Agent, a: Agent | null, rnd: boolean | undefined) => {
    setOnly(o, rnd);
    if (a) setMine(a);
    O.t = E.t!;
  };
  const evO = (c: Cmp) => {
    ops++;
    return c.num ? c.val : c.f(O);
  };
  function aggregate(A: AggP, a: Agent, cache: AggCache) {
    if (A.of === 'all' && cache.all.has(A.id)) return cache.all.get(A.id)!;
    const pool = A.of === 'neighbours' ? neighbours(a) : A.of === 'here' ? here(a) : A.of === 'all' ? agents : null;
    const vals: number[] = [];
    let cnt = 0,
      tot = 0;
    if (A.of === 'inbox') {
      for (const msg of a.inbox) {
        if (A.perf && msg.perf !== A.perf) continue;
        tot++;
        setOther(a, a, A.ornd);
        O.content = msg.content;
        O.from = msg.from;
        if (A.whereC && !evO(A.whereC)) continue;
        cnt++;
        if (A.exprC) vals.push(evO(A.exprC));
      }
    } else {
      const env = !!(A.whereC || A.exprC); // a bare count needs no environment
      if (env) setMine(a);
      for (const o of pool!) {
        if (!o.alive || (A.breed != null && o.B.id !== A.breed)) continue;
        tot++;
        if (!env) {
          cnt++;
          continue;
        }
        setOnly(o, A.ornd);
        if (A.whereC && !evO(A.whereC)) continue;
        cnt++;
        if (A.exprC) vals.push(evO(A.exprC));
      }
    }
    const r = reduce(A.fn, vals, cnt, tot, pool);
    if (A.of === 'all') cache.all.set(A.id, r);
    return r;
  }
  function reduce(fn: string, vals: number[], cnt: number, tot: number, pool: readonly Agent[] | null) {
    if (fn === 'count') return cnt;
    if (fn === 'frac') return tot ? (vals.length ? vals.filter(v => v && v === v).length : cnt) / tot : NaN;
    if (fn === 'order') {
      let sx = 0,
        sy = 0,
        n = 0;
      for (const o of pool || []) {
        sx += Math.cos(o.heading);
        sy += Math.sin(o.heading);
        n++;
      }
      return n ? Math.hypot(sx, sy) / n : NaN;
    }
    if (!vals.length) return fn === 'sum' ? 0 : NaN;
    if (fn === 'sum') return vals.reduce((s, v) => s + v, 0);
    if (fn === 'mean') return vals.reduce((s, v) => s + v, 0) / vals.length;
    if (fn === 'min') return Math.min(...vals);
    if (fn === 'max') return Math.max(...vals);
    if (fn === 'var') {
      const mu = vals.reduce((s, v) => s + v, 0) / vals.length;
      return vals.reduce((s, v) => s + (v - mu) * (v - mu), 0) / vals.length;
    }
    if (fn === 'gini') {
      const x = vals.slice().sort((p, q) => p - q),
        n = x.length,
        s = x.reduce((p, v) => p + v, 0);
      if (!(s > 0)) return 0;
      let acc = 0;
      x.forEach((v, i) => {
        acc += (2 * (i + 1) - n - 1) * v;
      });
      return acc / (n * s);
    } // Gini 1912 by the sorted formula
    return NaN;
  }
  // ---- messages (FIPA-ACL: {perf, from, to, content, t}; delivered at the next step) ----
  const outbox: Msg[] = [],
    msgCount: Record<string, number> = {};
  let msgTotal = 0;
  const msgSeries: number[] = [];
  const send = (a: Agent, A: Act) => {
    const content = A.contentC ? ev(A.contentC) : 0,
      to = A.to || 'neighbours';
    let targets =
      to === 'all'
        ? agents.filter(o => o.alive && o !== a)
        : to === 'breed'
          ? agents.filter(o => o.alive && o !== a && o.B.id === A.breed)
          : neighbours(a);
    if (to === 'random') targets = targets.length ? [targets[rng.int(targets.length)]!] : [];
    for (const o of targets) {
      if (msgTotal >= MAX_MSG) {
        codes.code('message-limit');
        return;
      }
      outbox.push({ perf: A.perf, from: a.id, to: o, content });
      msgTotal++;
      msgCount[A.perf!] = (msgCount[A.perf!] || 0) + 1;
    }
  };
  // ---- actions ----
  const P = ((A: Act, k: string, def?: number) => (A.P[k] ? ev(A.P[k]) : def)) as {
    (A: Act, k: string, def: number): number;
    (A: Act, k: string): number | undefined;
  };

  const births: Agent[] = [];
  const moveCont = (a: Agent, speed: number) => {
    a.x += speed * dt * Math.cos(a.heading);
    a.y += speed * dt * Math.sin(a.heading);
    if (torus) {
      a.x = ((a.x % W) + W) % W;
      a.y = ((a.y % H) + H) % H;
    } else {
      if (a.x < 0 || a.x > W) {
        a.x = Math.max(0, Math.min(W, a.x < 0 ? -a.x : 2 * W - a.x));
        a.heading = Math.PI - a.heading;
      }
      if (a.y < 0 || a.y > H) {
        a.y = Math.max(0, Math.min(H, a.y < 0 ? -a.y : 2 * H - a.y));
        a.heading = -a.heading;
      }
    }
  };
  const nearestOf = (a: Agent, breed: string | undefined, r: number | null) => {
    let best = null as [number, number, Agent] | null,
      bd = Infinity;
    const pool = r != null ? neighbours(a, r) : agents;
    for (const o of pool) {
      if (!o.alive || o === a || o.B.id !== breed) continue;
      let dx = o.x - a.x,
        dy = o.y - a.y;
      if (torus && kind === 'continuous') {
        dx = S.wrapDelta(dx, W);
        dy = S.wrapDelta(dy, H);
      }
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = [dx, dy, o];
      }
    }
    ops += pool.length / 8;
    return best;
  };
  function doAction(a: Agent, A: Act) {
    if (A.whenC && !ev(A.whenC)) return false;
    if (A.probC) {
      const p = ev(A.probC);
      if (A.do !== 'contact' && !(rng() < p)) return false;
    }
    switch (A.do) {
      case 'set': {
        const V = a.B.vars.find(x => x.name === A.var);
        const val = ev(A.exprC!);
        if (V) {
          (a.nv || a.v)[A.var!] = coerce(V, val);
          E[A.var!] = (a.nv || a.v)[A.var!]!;
        }
        break;
      }
      case 'die':
        a.alive = false;
        break;
      case 'move': {
        const how = A.how;
        if (kind === 'continuous') {
          const speed = P(A, 'speed', 1);
          if (how === 'random') {
            const turn = P(A, 'turn', Math.PI);
            a.heading += (2 * rng() - 1) * turn;
          } else if (how === 'towards' || how === 'away') {
            const nb = nearestOf(a, A.target, A.P.radius ? P(A, 'radius')! : null);
            if (nb) a.heading = Math.atan2(nb[1], nb[0]) + (how === 'away' ? Math.PI : 0);
          } else if (how === 'gradient' && pnx) {
            const vis = P(A, 'vision', W / pnx);
            let best = -Infinity,
              bh = a.heading;
            for (let q = 0; q < 8; q++) {
              const th = (q * Math.PI) / 4;
              let x = a.x + vis * Math.cos(th),
                y = a.y + vis * Math.sin(th);
              if (torus) {
                x = ((x % W) + W) % W;
                y = ((y % H) + H) % H;
              }
              const c =
                Math.min(pny - 1, Math.max(0, Math.floor((y / H) * pny))) * pnx + Math.min(pnx - 1, Math.max(0, Math.floor((x / W) * pnx)));
              const v = patch[A.patch!]![c];
              if (v! > best) {
                best = v!;
                bh = th;
              }
            }
            a.heading = bh;
          }
          moveCont(a, speed);
        } else if (kind === 'grid') {
          let target = -1;
          if (how === 'jump') target = randomEmpty()!;
          else if (how === 'gradient') {
            // Sugarscape rule M: look along the four lattice directions up to `vision`, the best free cell, nearest first, ties at random
            const vis = Math.max(1, Math.round(P(A, 'vision', 1))),
              i0 = a.cell % nx,
              j0 = Math.floor(a.cell / nx);
            let best = patch[A.patch!]![a.cell],
              cand = [a.cell],
              bestD = 0;
            const dirs = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ];
            for (let d = 1; d <= vis; d++)
              for (const [di, dj] of dirs) {
                const c = S.wrapCell(i0 + d * di!, j0 + d * dj!, nx, ny, torus);
                if (c < 0 || byCell![c]!.length >= cap) continue;
                const v = patch[A.patch!]![c];
                if (v! > best! || (v === best && d < bestD)) {
                  best = v;
                  cand = [c];
                  bestD = d;
                } else if (v === best && d === bestD) cand.push(c);
              }
            target = cand[rng.int(cand.length)]!;
            ops += (4 * vis) / 8;
          } else if (how === 'towards' || how === 'away') {
            const nb = nearestOf(a, A.target, null);
            if (nb) {
              let best = null as number | null,
                bd = how === 'towards' ? Infinity : -Infinity;
              for (let e = cellNb!.off[a.cell]; e! < cellNb!.off[a.cell + 1]!; e!++) {
                const c = cellNb!.nbr[e!];
                if (byCell![c!]!.length >= cap) continue;
                const dx = (c! % nx) + 0.5 - nb[2].x,
                  dy = Math.floor(c! / nx) + 0.5 - nb[2].y,
                  d = dx * dx + dy * dy;
                if (how === 'towards' ? d < bd : d > bd) {
                  bd = d;
                  best = c!;
                }
              }
              if (best != null) target = best;
            }
          } else {
            const nb: number[] = [];
            for (let e = cellNb!.off[a.cell]; e! < cellNb!.off[a.cell + 1]!; e!++) {
              const c = cellNb!.nbr[e!];
              if (byCell![c!]!.length < cap) nb.push(c!);
            }
            if (how === 'heading') {
              const di = Math.round(Math.cos(a.heading)),
                dj = Math.round(Math.sin(a.heading));
              const c = S.wrapCell((a.cell % nx) + di, Math.floor(a.cell / nx) + dj, nx, ny, torus);
              target = c >= 0 && byCell![c]!.length < cap ? c : -1;
            } else target = nb.length ? nb[rng.int(nb.length)]! : -1;
          }
          if (target >= 0 && target !== a.cell) occupy(a, target);
        } else if (kind === 'network') {
          const nb: number[] = [];
          for (let e = net!.off[a.node]; e! < net!.off[a.node + 1]!; e!++) {
            const nd = net!.nbr[e!];
            if (byNode![nd!]!.length < (sp.capacity || 1e9)) nb.push(nd!);
          }
          if (how === 'jump') {
            const free: number[] = [];
            for (let nd = 0; nd < nNodes; nd++) if (byNode![nd]!.length < (sp.capacity || 1)) free.push(nd);
            if (free.length) occupyNode(a, free[rng.int(free.length)]!);
          } else if (nb.length) occupyNode(a, nb[rng.int(nb.length)]!);
        }
        break;
      }
      case 'reproduce': {
        const c = addAgent(a.B, a.x, a.y, a);
        if (!c) break;
        if (isObj(A.share))
          for (const [k, f] of Object.entries(A.share)) {
            if (k in a.v) {
              const tot = a.v[k];
              c.v[k] = tot! * f;
              a.v[k] = tot! * (1 - f);
            }
          }
        if (kind === 'continuous') {
          c.x += (rng() - 0.5) * 1e-3 * W;
          c.y += (rng() - 0.5) * 1e-3 * H;
        }
        births.push(c);
        break;
      }
      case 'eat': {
        const p = patchOf(a);
        if (p < 0) break;
        const amt = Math.min(patch[A.patch!]![p]!, P(A, 'amount', 1));
        patch[A.patch!]![p]! -= amt;
        const V = a.B.vars.find(x => x.name === A.into);
        if (V && amt > 0) {
          a.v[A.into!] = coerce(V, a.v[A.into!]! + amt * P(A, 'gain', 1));
          E[A.into!] = a.v[A.into!]!;
        }
        break;
      }
      case 'hunt': {
        const pool = kind === 'grid' || kind === 'network' ? here(a) : neighbours(a, A.P.radius ? P(A, 'radius') : radius);
        const prey = pool.filter(o => o.alive && o.B.id === A.breed);
        if (prey.length) {
          const o = prey[rng.int(prey.length)]!;
          o.alive = false;
          const V = a.B.vars.find(x => x.name === A.into);
          if (V) {
            a.v[A.into!] = coerce(V, a.v[A.into!]! + P(A, 'gain', 1));
            E[A.into!] = a.v[A.into!]!;
          }
        }
        break;
      }
      case 'contact': {
        // each contact (a neighbour, or `contacts` random agents in a space without neighbours) is affected with probability prob
        let pool;
        if (A.P.contacts) {
          const k = Math.round(P(A, 'contacts', 1)),
            all = agents;
          pool = [];
          for (let q = 0; q < k && all.length > 1; q++) {
            let o;
            do {
              o = all[rng.int(all.length)]!;
            } while (o === a);
            if (o.alive) pool.push(o);
          }
        } else pool = neighbours(a);
        const p = A.probC ? ev(A.probC) : 1;
        for (const o of pool) {
          if (A.breed != null && o.B.id !== A.breed) continue;
          setOther(o, a, A.ornd);
          if (A.whereC && !evO(A.whereC)) continue;
          if (!(rng() < p)) continue;
          for (const [k, c] of A.setC) {
            const V = o.B.vars.find(x => x.name === k);
            if (V) {
              const val = coerce(V, evO(c!));
              (o.nv || o.v)[k] = val;
            }
          }
        }
        break;
      }
      case 'adopt': {
        // the voter model: copy the opinion of one random neighbour
        const nb = neighbours(a);
        if (!nb.length) break;
        const o = nb[rng.int(nb.length)]!;
        const V = a.B.vars.find(x => x.name === A.var);
        if (V && A.var! in stateOf(o)) {
          (a.nv || a.v)[A.var!] = coerce(V, stateOf(o)[A.var!]!);
          E[A.var!] = (a.nv || a.v)[A.var!]!;
        }
        break;
      }
      case 'average': {
        // DeGroot 1974: the self weight plus equal (or edge) weights on the neighbours, row-normalised
        const nb = neighbours(a),
          self = P(A, 'self', 1);
        let s = self * stateOf(a)[A.var!]!,
          w = self;
        if (A.weights === 'edge' && net && a.node >= 0) {
          for (let e = net.off[a.node]; e! < net.off[a.node + 1]!; e!++)
            for (const o of byNode![net.nbr[e!]!]!)
              if (o.alive && A.var! in stateOf(o)) {
                s += net.w[e!]! * stateOf(o)[A.var!]!;
                w += net.w[e!]!;
              }
        } else
          for (const o of nb)
            if (A.var! in stateOf(o)) {
              s += stateOf(o)[A.var!]!;
              w++;
            }
        const V = a.B.vars.find(x => x.name === A.var);
        if (V && w > 0) {
          (a.nv || a.v)[A.var!] = coerce(V, s / w);
          E[A.var!] = (a.nv || a.v)[A.var!]!;
        }
        break;
      }
      case 'ising': {
        // Glauber 1963 heat bath: flip with probability 1 / (1 + exp(ΔE/T)), ΔE = 2s(J Σ s_j + h)
        const nb = neighbours(a),
          J = P(A, 'J', 1),
          hh = P(A, 'h', 0),
          T = P(A, 'T', 1),
          s0 = stateOf(a)[A.var!];
        let f = 0;
        for (const o of nb) if (A.var! in stateOf(o)) f += stateOf(o)[A.var!]!;
        const dE = 2 * s0! * (J * f + hh),
          pf = T > 0 ? 1 / (1 + Math.exp(dE / T)) : dE < 0 ? 1 : dE === 0 ? 0.5 : 0;
        if (rng() < pf) {
          (a.nv || a.v)[A.var!] = -s0!;
          E[A.var!] = -s0!;
        }
        break;
      }
      case 'flock': {
        // Reynolds 1987: separation, alignment, cohesion within the radius; constant speed
        const r = P(A, 'radius', radius),
          sr = P(A, 'sepRadius', r / 4),
          speed = P(A, 'speed', 1),
          ws = P(A, 'sep', 0.05),
          wa = P(A, 'ali', 0.1),
          wc = P(A, 'coh', 0.01);
        const nb = neighbours(a, r);
        let vx = Math.cos(a.heading) * speed,
          vy = Math.sin(a.heading) * speed;
        if (nb.length) {
          let ax = 0,
            ay = 0,
            cx = 0,
            cy = 0,
            sx = 0,
            sy = 0;
          for (const o of nb) {
            const h0 = sync && o.ph != null ? o.ph : o.heading;
            ax += Math.cos(h0);
            ay += Math.sin(h0);
            let dx = (sync && o.px != null ? o.px : o.x) - a.x,
              dy = (sync && o.py != null ? o.py : o.y) - a.y;
            if (torus) {
              dx = S.wrapDelta(dx, W);
              dy = S.wrapDelta(dy, H);
            }
            cx += dx;
            cy += dy;
            const d2 = dx * dx + dy * dy;
            if (d2 < sr * sr && d2 > 0) {
              sx -= dx / d2;
              sy -= dy / d2;
            }
          }
          const k = nb.length;
          vx += wa * ((ax / k) * speed - vx) + (wc * cx) / k + ws * sx * speed;
          vy += wa * ((ay / k) * speed - vy) + (wc * cy) / k + ws * sy * speed;
        }
        a.nh = Math.atan2(vy, vx);
        a.speed = speed;
        break;
      }
      case 'send':
        send(a, A);
        break;
      default:
        break;
    }
    if (A.act) (a.acts || (a.acts = [])).push(A.act);
    return true;
  }
  // ---- BDI deliberation (Rao & Georgeff 1995: the practical reasoning loop; Bratman 1987; commitment strategies, Rao & Georgeff 1991) ----
  const bdiStats = { adopted: 0, achieved: 0, dropped: 0, actions: 0 };
  function deliberate(a: Agent) {
    const bd = a.B.bdi;
    if (!bd) return;
    const cm = bd.commitment;
    if (a.int) {
      const g = bd.goals.find(x => x.id === a.int!.goal),
        pl = bd.plans.find(x => x.id === a.int!.plan);
      if (ev(g!.achieved!)) {
        bdiStats.achieved++;
        a.int = null;
      } else if (cm !== 'blind' && ((g!.impossible && ev(g!.impossible)) || (pl!.context && !ev(pl!.context)))) {
        bdiStats.dropped++;
        a.int = null;
      } else if (cm === 'open' && !ev(g!.when!)) {
        bdiStats.dropped++;
        a.int = null;
      }
    }
    if (!a.int) {
      const opts = bd.goals
        .filter(g => ev(g.when!) && !ev(g.achieved!) && !(cm !== 'blind' && g.impossible && ev(g.impossible)))
        .map((g): [GoalP, number] => [g, ev(g.priority!)])
        .sort((p, q) => q[1] - p[1]);
      for (const [g] of opts) {
        const pl = bd.plans.find(p => p.goal === g.id && (!p.context || ev(p.context)));
        if (pl) {
          a.int = { goal: g.id, plan: pl.id, pc: 0 };
          bdiStats.adopted++;
          break;
        }
      }
    }
    E.intending = a.int ? 1 : 0;
    if (a.int) {
      const pl = bd.plans.find(x => x.id === a.int!.plan);
      const A = pl!.body[a.int.pc % pl!.body.length];
      a.int.pc++;
      doAction(a, A!);
      bdiStats.actions++;
    }
  }
  // ---- norms ----
  const normsOn = M.norms.length > 0;
  const monitor = normsOn
    ? typeof LG.normMonitor === 'function'
      ? LG.normMonitor(
          M.norms.map(n => Object.assign({}, n, { scope: 'each' })),
          { perAgent: true },
        )
      : (codes.code('logic-fallback'), fallbackMonitor(M.norms.map(n => Object.assign({}, n, { scope: 'each' }))))
    : null;
  const viol: Record<string, number> = {},
    fulf: Record<string, number> = {},
    violSeries: number[] = [];
  let violTotal = 0,
    fulfTotal = 0;
  const sanction: Record<string, { var: string; add: Cmp | null }> = {};
  for (const n of M.norms) if (n.sanction) sanction[n.id] = { var: n.sanction.var, add: cmp(n.sanction.add) };
  const normStep = (t: number) => {
    const acts: Record<string, string[]> = {},
      facts: Record<string, string[]> = { '*': [] };
    for (const [k] of M.globals) if (base[k] && base[k] === base[k]) facts['*']!.push(k);
    for (const a of agents) {
      if (!a.alive) continue;
      const id = String(a.id);
      acts[id] = a.acts ? a.acts.slice() : [];
      const f: string[] = [];
      for (const V of a.B.vars) if (V.type === 'bool' && a.v[V.name]) f.push(V.name);
      f.push('breed_' + a.B.id);
      facts[id] = f;
    }
    const r = monitor!.step({ t, facts, acts });
    let nv = 0;
    for (const v of r.violations || []) {
      const nm = M.norms.find(n => n.id === v.norm),
        ag = agents.find(a => String(a.id) === String(v.agent));
      if (nm && nm.breed && ag && ag.B.id !== nm.breed) continue;
      nv++;
      viol[v.norm] = (viol[v.norm] || 0) + 1;
      violTotal++;
      const sc = sanction[v.norm];
      if (sc && ag && ag.alive) {
        setEnvAgent(ag);
        const Vd = ag.B.vars.find(x => x.name === sc.var);
        if (Vd) ag.v[sc.var] = coerce(Vd, ag.v[sc.var]! + ev(sc.add!));
      }
    }
    for (const f of r.fulfilments || []) {
      const nm = M.norms.find(n => n.id === f.norm),
        ag = agents.find(a => String(a.id) === String(f.agent));
      if (nm && nm.breed && ag && ag.B.id !== nm.breed) continue;
      fulf[f.norm] = (fulf[f.norm] || 0) + 1;
      fulfTotal++;
    }
    violSeries.push(nv);
  };
  // ---- reporters ----
  const rec: Record<string, number[]> = { t: [] };
  for (const r of M.reps) rec[r.id] = [];
  const last: Record<string, number> = {};
  const report = (t: number) => {
    const cache = { all: new Map() };
    rec.t!.push(t);
    // every agent's reporters in one pass over the agents
    const AR = M.reps.map(r => (r.of === 'patches' ? null : { r, vals: [] as number[], pool: [] as Agent[], cnt: 0, tot: 0 }));
    if (AR.some(x => x))
      for (const a of agents) {
        if (!a.alive) continue;
        let set = false;
        for (const x of AR) {
          if (!x || (x.r.breed != null && a.B.id !== x.r.breed)) continue;
          x.pool.push(a);
          x.tot++;
          if (!x.r.whereC && !x.r.exprC) {
            x.cnt++;
            continue;
          }
          if (!set) {
            setEnvAgent(a);
            E.t = t;
            if (M.repRnd) E.rnd = rng();
            for (const A of M.repAggObjs) E[A!.id] = aggregate(A!, a, cache);
            set = true;
          }
          if (x.r.whereC && !ev(x.r.whereC)) continue;
          x.cnt++;
          if (x.r.exprC) x.vals.push(ev(x.r.exprC));
        }
      }
    const agentRep = AR.map(x => () => reduce(x!.r.fn, x!.vals, x!.cnt, x!.tot, x!.pool));
    for (const r of M.reps) {
      let v: number;
      if (r.of === 'patches') {
        const pe = Object.assign(Object.create(null) as Env, base),
          vals: number[] = [];
        let cnt = 0,
          tot = 0;
        for (let j = 0; j < pny; j++)
          for (let i = 0; i < pnx; i++) {
            pe.px = i;
            pe.py = j;
            pe.t = t;
            for (const [k] of M.pvars) pe[k] = patch[k]![j * pnx + i]!;
            tot++;
            if (r.whereC && !(r.whereC.num ? r.whereC.val : r.whereC.f(pe))) continue;
            cnt++;
            if (r.exprC) vals.push(r.exprC.num ? r.exprC.val : r.exprC.f(pe));
            ops++;
          }
        v = reduce(r.fn, vals, cnt, tot, []);
      } else v = agentRep[M.reps.indexOf(r)]!();
      rec[r.id]!.push(v);
      last[r.id] = v;
    }
  };
  const stopEnv = () => {
    const se = Object.assign(Object.create(null) as Env, base);
    for (const r of M.reps) se[r.id] = last[r.id]!;
    return se;
  };
  // ---- the schedule ----
  let t = 0,
    stopped = false;
  E.t = 0;
  report(0);
  const fired = new Set<number>();
  for (let step = 1; step <= steps && !stopped; step++) {
    t = step;
    E.t = t;
    rebuild();
    const cache = { all: new Map() };
    if (sync)
      for (const a of agents) {
        a.pv = Object.assign({}, a.v);
        a.nv = a.v;
        a.px = a.x;
        a.py = a.y;
        a.ph = a.heading;
      }
    for (const a of agents) {
      a.acts = null;
    }
    const order = agents.slice();
    if (schedule === 'random') rngSched.shuffle(order);
    const inboxes = new Map<Agent, Msg[]>();
    for (const msg of outbox) {
      const L = inboxes.get(msg.to) || [];
      L.push(msg);
      inboxes.set(msg.to, L);
    }
    outbox.length = 0;
    for (const a of agents) a.inbox = inboxes.get(a) || [];
    for (const a of order) {
      if (!a.alive || a.age < 0) continue;
      setEnvAgent(a);
      E.t = t;
      for (const A of a.B.aggObjs) E[A!.id] = aggregate(A!, a, cache);
      for (const A of a.B.rules) {
        if (!(a.alive as boolean)) break;
        if (A.rnd) E.rnd = rng();
        doAction(a, A);
      }
      if ((a.alive as boolean) && a.B.bdi) {
        E.rnd = rng();
        deliberate(a);
      }
      a.age++;
      ops += 2;
      if (!budget()) {
        codes.code('budget', t);
        stopped = true;
        break;
      }
    }
    for (const a of agents)
      if (a.nh != null) {
        a.heading = a.nh;
        a.nh = null;
        moveCont(a, a.speed || 1);
      }
    if (sync)
      for (const a of agents) {
        a.pv = null;
        a.nv = null;
        a.px = null;
        a.py = null;
        a.ph = null;
      }
    for (const c of births) c.age = 0;
    births.length = 0;
    // the dead leave
    if (agents.some(a => !a.alive)) {
      for (const a of agents)
        if (!a.alive) {
          if (byCell && a.cell >= 0) occupy(a, -1);
          if (byNode && a.node >= 0) occupyNode(a, -1);
        }
      for (let q = agents.length - 1; q >= 0; q--) if (!agents[q]!.alive) agents.splice(q, 1);
    }
    // patches: rules, diffusion (NetLogo `diffuse`: a share `rate` given equally to the 8 neighbours)
    if (M.prules.length || M.diffuse.length) {
      const pe = Object.assign(Object.create(null) as Env, base);
      pe.t = t;
      for (const r of M.prules) {
        const out = new Float64Array(pnx * pny);
        for (let j = 0; j < pny; j++)
          for (let i = 0; i < pnx; i++) {
            const c = j * pnx + i;
            pe.px = i;
            pe.py = j;
            for (const [k] of M.pvars) pe[k] = patch[k]![c]!;
            if (r.rnd) pe.rnd = rng();
            out[c] = r.f!.num ? r.f!.val : r.f!.f(pe);
            ops++;
          }
        patch[r.var] = out;
      }
      for (const d of M.diffuse) {
        const rate = d.rate!.num ? d.rate!.val : d.rate!.f(base),
          src = patch[d.var]!,
          out = Float64Array.from(src, v => v * (1 - rate));
        for (let j = 0; j < pny; j++)
          for (let i = 0; i < pnx; i++) {
            const share = (src[j * pnx + i]! * rate) / 8;
            for (let dj = -1; dj <= 1; dj++)
              for (let di = -1; di <= 1; di++) {
                if (!di && !dj) continue;
                const c = S.wrapCell(i + di, j + dj, pnx, pny, true);
                out[c]! += share;
              }
          }
        patch[d.var] = out;
      }
    }
    if (normsOn) normStep(t);
    msgSeries.push(msgTotal);
    if (step % every === 0 || step === steps) report(t);
    // interrupts and the stop condition (over the reporters and the globals)
    const se = stopEnv();
    se.t = t;
    M.interrupts.forEach((it, q) => {
      if (it.once && fired.has(q)) return;
      const go = it.at != null ? it.at === step : !!(it.when!.num ? it.when!.val : it.when!.f(se));
      if (go) {
        fired.add(q);
        for (const [k, c] of it.set) {
          base[k] = c!.num ? c!.val : c!.f(se);
          E[k] = base[k];
          O[k] = base[k];
        }
      }
    });
    if (M.stop && (M.stop.num ? M.stop.val : M.stop.f(stopEnv()))) {
      stopped = true;
      codes.code('stopped', t);
      if (rec.t![rec.t!.length - 1] !== t) report(t);
    }
    if (!agents.length && M.breeds.length) {
      codes.code('extinct', t);
      stopped = true;
      if (rec.t![rec.t!.length - 1] !== t) report(t);
    }
  }
  return {
    rec,
    last,
    agents,
    codes,
    ops,
    steps: t,
    kind,
    W,
    H,
    nx,
    ny,
    net,
    layout,
    patch,
    pnx,
    pny,
    msgCount,
    msgTotal,
    msgSeries,
    viol,
    fulf,
    violTotal,
    fulfTotal,
    violSeries,
    bdiStats,
    M,
    base,
    setEnvAgent,
    ev,
    E,
    aggregate,
    monitorResult: monitor ? monitor.result() : null,
    rng,
  };
}

/* ======================================================================================================================
     Multi-agent protocols
     ====================================================================================================================== */
const numP = (v: Numx | undefined, d: number) => (v == null ? d : typeof v === 'number' ? v : C.cx(v)({}));
/** the min-cost assignment of n rows to distinct columns among m ≥ n (Kuhn 1955, Munkres 1957; potentials, O(n²m)) → its cost */
function hungarian(n: number, m: number, cost: (i: number, j: number) => number) {
  const u = new Float64Array(n + 1),
    v = new Float64Array(m + 1),
    p = new Int32Array(m + 1),
    way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity),
      used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const cur = cost(i0! - 1, j - 1) - u[i0!]! - v[j]!;
          if (cur < minv[j]!) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j]! < delta) {
            delta = minv[j]!;
            j1 = j;
          }
        }
      for (let j = 0; j <= m; j++)
        if (used[j]) {
          u[p[j]!]! += delta;
          v[j]! -= delta;
        } else minv[j]! -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1!]!;
      j0 = j1!;
    } while (j0);
  }
  let total = 0;
  for (let j = 1; j <= m; j++) if (p[j]) total += cost(p[j]! - 1, j - 1);
  return total;
}
function contractNet(p: ProtoM, seed: number, env: Env, codes: Codes | null) {
  // Smith 1980: cfp → propose / refuse → accept-proposal / reject-proposal → inform (done)
  const r = NoemaSimKit.stream(seed, 'mas.contractnet'),
    T = p.tasks || (p.costs ? p.costs.length : 10),
    Cn = p.contractors || (p.costs ? p.costs[0]!.length : 5);
  const lo = typeof p.costMin === 'string' ? C.cx(p.costMin)(env) : p.costMin != null ? p.costMin : 1,
    hi = typeof p.costMax === 'string' ? C.cx(p.costMax)(env) : p.costMax != null ? p.costMax : 10;
  const lf = typeof p.loadFactor === 'string' ? C.cx(p.loadFactor)(env) : p.loadFactor || 0,
    capC = p.capacity || Infinity;
  const cost = p.costs ? p.costs : Array.from({ length: T }, () => Array.from({ length: Cn }, () => lo + (hi - lo) * r()));
  const load = new Array<number>(Cn).fill(0),
    winner: number[] = [],
    msgs = { cfp: 0, propose: 0, refuse: 0, 'accept-proposal': 0, 'reject-proposal': 0, inform: 0 };
  let total = 0,
    unassigned = 0;
  for (let t = 0; t < T; t++) {
    msgs.cfp += Cn;
    const bids: [number, number][] = [];
    for (let c = 0; c < Cn; c++) {
      if (load[c]! >= capC) {
        msgs.refuse++;
        continue;
      }
      msgs.propose++;
      bids.push([cost[t]![c]! * (1 + lf * load[c]!), c]);
    }
    if (!bids.length) {
      unassigned++;
      winner.push(-1);
      continue;
    }
    bids.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [bc, c] = bids[0]!;
    msgs['accept-proposal']++;
    msgs['reject-proposal'] += bids.length - 1;
    msgs.inform++;
    load[c]!++;
    total += bc;
    winner.push(c);
  }
  // the optimum: without capacity or load effects every task goes to its cheapest contractor (separable costs); otherwise the
  // min-cost assignment of tasks to contractor slots (slot k of contractor c costs cost·(1 + lf·k), increasing, so the slots fill
  // in order) by the Hungarian algorithm (Kuhn 1955; O(n²m), within a work bound, else NaN and code budget)
  let optimal;
  if (!Number.isFinite(capC) && !lf) optimal = cost.reduce((s, row) => s + Math.min(...row), 0);
  else {
    const slots = Math.min(Number.isFinite(capC) ? capC : T, T),
      m = Cn * slots;
    if (m < T)
      optimal = NaN; // not every task can be placed
    else if (T * T * m > 4e7) {
      optimal = NaN;
      if (codes) codes.code('budget');
    } else optimal = hungarian(T, m, (t, j) => cost[t]![j % Cn]! * (1 + lf * Math.floor(j / Cn)));
  }
  const messages = Object.values(msgs).reduce((a, b) => a + b, 0);
  return {
    scalar: { totalCost: total, optimalCost: optimal, makespan: Math.max(...load), messages, refusals: msgs.refuse, unassigned },
    series: { load, winner },
    msgs,
  };
}
function auction(p: ProtoM, seed: number) {
  const r = NoemaSimKit.stream(seed, 'mas.auction'),
    n = p.bidders || (p.values ? p.values.length : 5),
    rounds = p.values ? 1 : p.rounds || 200,
    fmt = p.format || 'second';
  const strat = p.strategy || 'truthful',
    shade = p.shade != null ? p.shade : 0.8,
    inc = numP(p.inc, 0.01),
    reserve = numP(p.reserve, 0);
  const bidOf = (v: number) =>
    strat === 'truthful' ? v : strat === 'shade' ? shade * v : fmt === 'first' || fmt === 'dutch' ? ((n - 1) / n) * v : v; // Vickrey 1961: (n−1)/n·v is the symmetric BNE of the first-price auction with U(0,1) values
  const revs: number[] = [],
    prices: number[] = [];
  const msgs = { cfp: 0, propose: 0, 'accept-proposal': 0, 'reject-proposal': 0, inform: 0 };
  let eff = 0,
    lastW = -1,
    lastP = NaN,
    secondV = NaN;
  let domOk = 0,
    domN = 0;
  for (let k = 0; k < rounds; k++) {
    const vals = p.values ? p.values.slice() : Array.from({ length: n }, () => r());
    const sorted = vals.map((v, i): [number, number] => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let w = -1,
      price = NaN;
    if (fmt === 'english') {
      // an ascending clock: bidders stay in while the price is below their value; the last one pays the clock
      let pr = reserve,
        active = vals.map((v, i) => i).filter(i => vals[i]! >= reserve);
      for (let it = 0; it < 1e6 && active.length > 1; it++) {
        pr += inc;
        msgs.cfp += active.length;
        active = active.filter(i => vals[i]! >= pr);
      }
      if (active.length === 1) {
        w = active[0]!;
        price = pr;
      } else if (active.length > 1) {
        w = active[0]!;
        price = pr;
      } else {
        w = sorted[0]![1]!;
        price = pr - inc;
      }
    } else if (fmt === 'dutch') {
      // a descending clock: the first bidder whose bid reaches the price takes it (strategically = first price)
      const bids = vals.map(bidOf);
      let pr = Math.max(1, ...vals) + inc;
      for (let it = 0; it < 1e6 && pr > reserve; it++) {
        pr -= inc;
        msgs.cfp++;
        const takers = bids.map((b, i): [number, number] => [b, i]).filter(x => x[0] >= pr);
        if (takers.length) {
          takers.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
          w = takers[0]![1]!;
          price = pr;
          break;
        }
      }
    } else {
      const bids = vals
        .map(bidOf)
        .map((b, i): [number, number] => [b, i])
        .filter(x => x[0] >= reserve)
        .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      msgs.cfp += n;
      msgs.propose += bids.length;
      if (bids.length) {
        w = bids[0]![1]!;
        price = fmt === 'first' ? bids[0]![0] : Math.max(reserve, bids.length > 1 ? bids[1]![0] : reserve);
      }
    }
    if (w >= 0) {
      msgs['accept-proposal']++;
      msgs['reject-proposal'] += n - 1;
      msgs.inform++;
      revs.push(price);
      if (vals[w] === sorted[0]![0]) eff++;
    } else revs.push(0);
    prices.push(price);
    lastW = w;
    lastP = price;
    secondV = sorted.length > 1 ? sorted[1]![0] : NaN;
    // the truthfulness check (Vickrey 1961): bidder 0's utility from bidding its value against every deviation on a grid
    if (k < 200 && (fmt === 'second' || fmt === 'first')) {
      const others = vals.slice(1).map(bidOf),
        v0 = vals[0];
      const util = (b: number) => {
        const top = Math.max(-Infinity, ...others);
        if (b > top) return v0! - (fmt === 'second' ? Math.max(reserve, top) : b);
        return 0;
      };
      const ut = util(v0!);
      let best = -Infinity;
      for (let q = 0; q <= 40; q++) best = Math.max(best, util((q / 40) * 1.5));
      domN++;
      if (ut >= best - 1e-12) domOk++;
    }
  }
  const ci = NoemaSimKit.ci(revs, 0.95);
  return {
    scalar: {
      revenue: ci.mean,
      revenueHalf: ci.half,
      expectedRevenue: p.values ? NaN : (n - 1) / (n + 1),
      efficiency: eff / rounds,
      dominance: domN ? domOk / domN : NaN,
      price: lastP,
      winner: lastW,
      secondValue: secondV,
    },
    series: { prices },
    msgs,
  };
}
function negotiation(p: ProtoM, seed: number, env: Env, codes: Codes) {
  const d1 = p.d1 != null ? p.d1 : 0.9,
    d2 = p.d2 != null ? p.d2 : 0.9,
    Hn = p.horizon || 200;
  const closed = (1 - d2) / (1 - d1 * d2); // Rubinstein 1982: the subgame-perfect share of the first proposer
  const a1 = numP(p.a1, 1),
    a2 = numP(p.a2, 1),
    nash = a1 / (a1 + a2); // Nash 1950: argmax x^a1 (1 − x)^a2
  const offers: number[] = [],
    msgs = { propose: 0, 'accept-proposal': 0, 'reject-proposal': 0 };
  if ((p.method || 'rubinstein') === 'rubinstein') {
    // backward induction over a finite horizon (Ståhl 1972): in the last round the proposer takes all; x_k = 1 − δ_other · x_{k+1}
    let x = 1;
    for (let k = Hn - 1; k >= 1; k--) {
      const responderDelta = k % 2 === 1 ? d2 : d1;
      x = 1 - responderDelta * x;
      if (offers.length < 2000) offers.unshift(x);
    }
    msgs.propose = 1;
    msgs['accept-proposal'] = 1;
    return {
      scalar: { share1: x, share2: 1 - x, rounds: 1, closedForm: closed, nashX: nash, agreement: 1 },
      series: { offers: offers.slice(0, 2000) },
      msgs,
    };
  }
  // Zeuthen 1930 (Harsanyi 1956): each proposes; the one with the smaller willingness to risk conflict concedes by `step`
  const step = numP(p.step, 0.01),
    u1 = (x: number) => Math.pow(Math.max(0, x), a1),
    u2 = (x: number) => Math.pow(Math.max(0, 1 - x), a2);
  let o1 = 1,
    o2 = 0,
    rounds = 0;
  for (; rounds < Math.min(2000, Hn * 10); rounds++) {
    msgs.propose += 2;
    offers.push(o1);
    if (u1(o2) >= u1(o1) || u2(o1) >= u2(o2)) break;
    const r1 = u1(o1) > 0 ? (u1(o1) - u1(o2)) / u1(o1) : 0,
      r2 = u2(o2) > 0 ? (u2(o2) - u2(o1)) / u2(o2) : 0;
    msgs['reject-proposal'] += 2;
    if (r1 <= r2) o1 = Math.max(o2, o1 - step);
    if (r2 <= r1) o2 = Math.min(o1, o2 + step);
  }
  const agreed = Math.abs(o1 - o2) <= step + 1e-12 || u1(o2) >= u1(o1) || u2(o1) >= u2(o2);
  if (!agreed) codes.code('no-agreement');
  msgs['accept-proposal'] = agreed ? 1 : 0;
  const x = (o1 + o2) / 2;
  return {
    scalar: { share1: x, share2: 1 - x, rounds, closedForm: closed, nashX: nash, agreement: agreed ? 1 : 0 },
    series: { offers },
    msgs,
  };
}
/** dense simplex (Bland's rule) for max c·y, A y = b, y ≥ 0, b ≥ 0, by the two-phase method → {status, value} */
function simplexEq(A: readonly (readonly number[])[], b: readonly number[], c: ArrayLike<number>) {
  const m = A.length,
    n = c.length,
    cols = n + m + 1,
    T: Float64Array[] = [];
  for (let i = 0; i < m; i++) {
    const row = new Float64Array(cols);
    for (let j = 0; j < n; j++) row[j] = A[i]![j]!;
    row[n + i] = 1;
    row[cols - 1] = b[i]!;
    T.push(row);
  }
  const basis = Array.from({ length: m }, (_, i) => n + i);
  const pivot = (r: number, q: number) => {
    const pr = T[r],
      pv = pr![q];
    for (let j = 0; j < cols; j++) pr![j]! /= pv!;
    for (let i = 0; i < m; i++)
      if (i !== r) {
        const f = T[i]![q];
        if (f) for (let j = 0; j < cols; j++) T[i]![j]! -= f * pr![j]!;
      }
    basis[r] = q;
  };
  const solve = (obj: ArrayLike<number>, allow: (j: number) => boolean) => {
    for (let it = 0; it < 5000; it++) {
      // reduced costs: obj_j − Σ obj_basis · T_ij (maximisation)
      let q = -1;
      for (let j = 0; j < cols - 1; j++) {
        if (!allow(j) || basis.includes(j)) continue;
        let rc = obj[j] || 0;
        for (let i = 0; i < m; i++) rc -= (obj[basis[i]!] || 0) * T[i]![j]!;
        if (rc > 1e-10) {
          q = j;
          break;
        }
      }
      if (q < 0) return 'optimal';
      let r = -1,
        best = Infinity;
      for (let i = 0; i < m; i++)
        if (T[i]![q]! > 1e-12) {
          const ratio = T[i]![cols - 1]! / T[i]![q]!;
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i]! < basis[r]!)) {
            best = ratio;
            r = i;
          }
        }
      if (r < 0) return 'unbounded';
      pivot(r, q);
    }
    return 'limit';
  };
  const ph1 = new Float64Array(cols);
  for (let i = 0; i < m; i++) ph1[n + i] = -1;
  solve(ph1, () => true);
  let art = 0;
  for (let i = 0; i < m; i++) if (basis[i]! >= n) art += T[i]![cols - 1]!;
  if (art > 1e-9) return { status: 'infeasible', value: NaN };
  for (let i = 0; i < m; i++)
    if (basis[i]! >= n) {
      const q = Array.from({ length: n }, (_, j) => j).find(j => Math.abs(T[i]![j]!) > 1e-12);
      if (q != null) pivot(i, q);
    }
  const st = solve(
    Float64Array.from({ length: cols }, (_, j) => (j < n ? c[j]! : 0)),
    j => j < n,
  );
  let val = 0;
  for (let i = 0; i < m; i++) if (basis[i]! < n) val += c[basis[i]!]! * T[i]![cols - 1]!;
  return { status: st, value: val };
}
function coalition(p: ProtoM, codes: Codes) {
  const n = p.players || 3,
    full = (1 << n) - 1,
    w = p.weights || new Array<number>(n).fill(1),
    kd = p.kinds || new Array<number>(n).fill(0);
  const f = p.v != null ? C.cx(p.v) : null,
    vS = new Float64Array(full + 1);
  for (let S0 = 1; S0 <= full; S0++) {
    if (p.table) {
      vS[S0] = p.table[S0 - 1]!;
      continue;
    }
    let s = 0,
      ws = 0,
      k0 = 0,
      k1 = 0;
    for (let i = 0; i < n; i++)
      if (S0 & (1 << i)) {
        s++;
        ws += w[i]!;
        if (kd[i]) k1++;
        else k0++;
      }
    vS[S0] = f!({ s, w: ws, k0, k1 });
  }
  // Shapley 1953: φ_i = Σ_{S ∌ i} |S|!(n−|S|−1)!/n! · (v(S ∪ i) − v(S))
  const fact = [1];
  for (let i = 1; i <= n; i++) fact[i] = fact[i - 1]! * i;
  const phi = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let S0 = 0; S0 <= full; S0++) {
      if (S0 & (1 << i)) continue;
      let s = 0;
      for (let q = S0; q; q &= q - 1) s++;
      phi[i]! += ((fact[s]! * fact[n - s - 1]!) / fact[n]!) * (vS[S0 | (1 << i)]! - vS[S0]!);
    }
  // the core (Bondareva 1963, Shapley 1967): non-empty iff max Σ_S y_S v(S) s.t. Σ_{S ∋ i} y_S = 1, y ≥ 0 is ≤ v(N)
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: full }, (_, q) => ((q + 1) & (1 << i) ? 1 : 0)));
  const lp = simplexEq(
    A,
    new Array<number>(n).fill(1),
    Array.from({ length: full }, (_, q) => vS[q + 1]!),
  );
  if (lp.status !== 'optimal') codes.code('lp');
  const coreEmpty = lp.status === 'optimal' ? (lp.value > vS[full]! + 1e-9 * (1 + Math.abs(vS[full]!)) ? 1 : 0) : NaN;
  let inCore = 1;
  for (let S0 = 1; S0 <= full; S0++) {
    let x = 0;
    for (let i = 0; i < n; i++) if (S0 & (1 << i)) x += phi[i]!;
    if (x < vS[S0]! - 1e-9) {
      inCore = 0;
      break;
    }
  }
  return { scalar: { grand: vS[full]!, coreEmpty, shapleyInCore: inCore, minCoreTotal: lp.value }, series: { shapley: phi }, msgs: {} };
}
function ipd(p: ProtoM, seed: number) {
  // Axelrod 1984: a round robin of the iterated prisoner's dilemma, then the ecological simulation
  const r = NoemaSimKit.stream(seed, 'mas.ipd'),
    strats = p.strategies || ['allc', 'alld', 'tft', 'grim'],
    R0 = p.rounds || 200,
    eps = p.noise || 0;
  const Tp = p.T != null ? p.T : 5,
    Rp = p.R != null ? p.R : 3,
    Pp = p.P != null ? p.P : 1,
    Sp = p.S != null ? p.S : 0,
    gen = p.generosity != null ? p.generosity : 1 / 3;
  const move = (s: string | undefined, mine: readonly number[], theirs: readonly number[], k: number) => {
    // 1 = cooperate
    switch (s) {
      case 'allc':
        return 1;
      case 'alld':
        return 0;
      case 'random':
        return r() < 0.5 ? 1 : 0;
      case 'tft':
        return k ? theirs[k - 1] : 1;
      case 'tf2t':
        return k >= 2 && !theirs[k - 1] && !theirs[k - 2] ? 0 : 1;
      case 'grim':
        return theirs.slice(0, k).some(x => !x) ? 0 : 1;
      case 'pavlov':
        return !k ? 1 : mine[k - 1] === theirs[k - 1] ? 1 : 0; // win–stay, lose–shift (Nowak & Sigmund 1993)
      case 'gtft':
        return !k ? 1 : theirs[k - 1] ? 1 : r() < gen ? 1 : 0;
      case 'joss':
        return !k ? 1 : theirs[k - 1] ? (r() < 0.9 ? 1 : 0) : 0;
      default:
        return 1;
    }
  };
  const pay = (a: number, b: number) => (a && b ? Rp : a && !b ? Sp : !a && b ? Tp : Pp);
  const n = strats.length,
    M2 = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let coop = 0,
    moves = 0;
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      const A: number[] = [],
        B: number[] = [];
      let sa = 0,
        sb = 0;
      for (let k = 0; k < R0; k++) {
        let x = move(strats[i], A, B, k),
          y = move(strats[j], B, A, k);
        if (eps && r() < eps) x = 1 - x!;
        if (eps && r() < eps) y = 1 - y!;
        A.push(x!);
        B.push(y!);
        sa += pay(x!, y!);
        sb += pay(y!, x!);
        coop += x! + y!;
        moves += 2;
      }
      M2[i]![j] = sa;
      M2[j]![i] = i === j ? sa : sb;
    }
  const scores = M2.map(row => row.reduce((a, b) => a + b, 0) - 0); // against every strategy (itself included)
  // the ecological simulation: shares x_i ← x_i · f_i / f̄ with f_i = Σ_j x_j M_ij (Axelrod 1984 ch. 3; discrete replicator dynamics)
  let x = new Array<number>(n).fill(1 / n);
  const shareHist = strats.map((): number[] => []);
  for (let g = 0; g < (p.generations || 0); g++) {
    const fit = x.map((_, i) => x.reduce((s, xj, j) => s + xj * M2[i]![j]!, 0)),
      mean = fit.reduce((s, fi, i) => s + x[i]! * fi, 0);
    x = x.map((xi, i) => (mean > 0 ? (xi * fit[i]!) / mean : xi));
    strats.forEach((_, i) => shareHist[i]!.push(x[i]!));
  }
  const best = scores.indexOf(Math.max(...scores));
  return {
    scalar: { winner: best, coopRate: coop / moves, best: scores[best]! },
    series: { scores, shares: x, share: shareHist },
    msgs: {},
  };
}

/* ======================================================================================================================
     Scenes
     ====================================================================================================================== */
function spaceScene(res: SimRes & { cmin?: number; cmax?: number }, o: OutM) {
  const { kind, W, H, agents } = res;
  const sc = C.scene(kind === 'continuous' ? [0, W, 0, H] : kind === 'grid' ? [0, res.nx, 0, res.ny] : [0, 1, 0, 1]);
  const colorVar = o.colorBy,
    roleOf = (a: Agent) => {
      if (colorVar && colorVar in a.v) {
        const V = a.B.vars.find(x => x.name === colorVar);
        const lo = V && V.type === 'cat' ? 0 : V && V.type === 'bool' ? 0 : Number.isFinite(V && V.min) ? V!.min : res.cmin,
          hi = V && V.type === 'cat' ? (V.n || 2) - 1 : V && V.type === 'bool' ? 1 : Number.isFinite(V && V.max) ? V!.max : res.cmax;
        const k = S.classOf(a.v[colorVar], lo!, hi! + (hi! > lo! ? 1e-9 : 1), Math.min(5, V && V.type === 'cat' ? V.n! : 5));
        return S.RAMP[Math.max(0, k)];
      }
      return ROLE_BREED[a.b % ROLE_BREED.length];
    };
  if (colorVar) {
    let lo = Infinity,
      hi = -Infinity;
    for (const a of agents) {
      const v = a.v[colorVar];
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v!);
        hi = Math.max(hi, v!);
      }
    }
    res.cmin = lo;
    res.cmax = hi;
  }
  if (o.patch && res.patch[o.patch]) {
    const vals = res.patch[o.patch],
      rect = kind === 'grid' ? [0, res.nx, 0, res.ny] : [0, W, 0, H];
    S.heatmap(sc, vals!, res.pnx, res.pny, rect, { levels: 4, maxItems: 600 });
  }
  if (kind === 'network' && o.edges !== false && res.net) {
    let k = 0;
    const L = res.layout;
    for (let i = 0; i < res.net.n && k < 700; i++)
      for (let e = res.net.off[i]; e! < res.net.off[i + 1]! && k < 700; e!++) {
        const j = res.net.nbr[e!];
        if (j! > i || (res.net.m && sp_directed(res))) {
          sc.seg(L![0]![i]!, L![1]![i]!, L![0]![j!]!, L![1]![j!]!, { c: 'muted', w: 0.5 });
          k++;
        }
      }
  }
  const budget = 2000 - sc.items.length - 4;
  if (kind === 'grid' && agents.length > budget) {
    // one agent a cell, too many points: a heat map of the colour variable per cell
    const vals = new Float64Array(res.nx * res.ny).fill(NaN);
    for (const a of agents) if (a.cell >= 0) vals[a.cell] = colorVar ? a.v[colorVar]! : a.b + 1;
    S.heatmap(sc, vals, res.nx, res.ny, [0, res.nx, 0, res.ny], { levels: 5, maxItems: Math.min(1500, budget) });
  } else {
    const step = Math.max(1, Math.ceil(agents.length / Math.max(1, o.arrows ? budget / 2 : budget)));
    for (let q = 0; q < agents.length; q += step) {
      const a = agents[q],
        c = roleOf(a!);
      sc.pt(a!.x, a!.y, { r: 2.5, c });
      if (o.arrows && kind === 'continuous') {
        const L = 0.02 * W;
        sc.seg(a!.x, a!.y, a!.x + L * Math.cos(a!.heading), a!.y + L * Math.sin(a!.heading), { c, w: 1 });
      }
    }
  }
  return sc.done();
}
const sp_directed = (res: SimRes) => !!res.M.sp.directed;

/* ======================================================================================================================
     run(spec, env, {seed, prepared}) → {out, codes}
     ====================================================================================================================== */
const empty = (o: { readonly kind?: unknown }) =>
  o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN;
function run(
  spec: Spec | null | undefined,
  env0: Rec | null | undefined,
  opts?: { readonly prepared?: Prepared | null | undefined; readonly seed?: number | undefined } | null,
) {
  const M = (opts && opts.prepared) || prepare(spec),
    out: Record<string, unknown> = {};
  if (!M) {
    for (const o of list(spec && spec.outputs)) if (isObj(o)) out[o.id as string] = empty(o);
    return { out, codes: [{ code: 'model', level: 'error' }] };
  }

  const seed = (opts && opts.seed)! >>> 0 || 1,
    env = Object.assign(Object.create(null) as Env, env0 || {});
  if (M.proto) return runProtocol(M, env, seed);
  const cap = Math.min(MAX_OPS, M.m.maxOps || DEF_OPS);
  let res;
  try {
    res = simulate(M, env, seed, cap);
  } catch {
    res = null;
  }
  if (!res) {
    for (const o of M.outs) out[o.id] = empty(o);
    return { out, codes: [{ code: 'nan', level: 'error' }] };
  }
  // replications: the same model with the kernel's sub-seeds; the final value of every reporter, with a Student-t interval
  let repl = null as Record<string, ReturnType<typeof NoemaSimKit.ci> & { values: number[] }> | null;
  if (isObj(M.m.replications)) {
    // each replication runs whole (with the first one's budget); as many as the total budget allows (code repl-cut when fewer)
    const R0 = M.m.replications.n,
      fit = Math.max(1, Math.floor(MAX_TOTAL / Math.max(1, res.ops))),
      R = Math.min(R0, fit);
    if (R < R0) res.codes.code('repl-cut');
    const finals = M.reps.map((): number[] => []);
    M.reps.forEach((r, q) => finals[q]!.push(res.last[r.id]!));
    for (let i = 1; i < R; i++) {
      const rr = simulate(M, env, NoemaSimKit.subseed(seed, i), cap);
      if (rr.codes.has('budget')) res.codes.code('budget');
      M.reps.forEach((r, q) => finals[q]!.push(rr.last[r.id]!));
    }
    repl = {};
    M.reps.forEach((r, q) => {
      repl![r.id] = Object.assign(NoemaSimKit.ci(finals[q], M.m.replications!.level || 0.95), { values: finals[q]! });
    });
  }
  const codes = res.codes;
  for (const o of M.outs) {
    let v: unknown;
    try {
      const of = o.of;
      if (of === 't') v = res.rec.t!.slice();
      else if (of === 'reporter') v = (res.rec[o.reporter!] || []).slice();
      else if (of === 'final') v = res.last[o.reporter!];
      else if (of === 'stat') v = C.stats(res.rec[o.reporter!] || [])[o.stat as keyof Stats];
      else if (/^repl/.test(of)) {
        const c = repl && repl[o.reporter!];
        v = !c
          ? NaN
          : of === 'replMean'
            ? c.mean
            : of === 'replLo'
              ? c.lo
              : of === 'replHi'
                ? c.hi
                : of === 'replHalf'
                  ? c.half
                  : of === 'replSd'
                    ? c.sd
                    : c.values.slice();
      } else if (of === 'count') v = res.agents.filter(a => a.alive && (o.breed == null || a.B.id === o.breed)).length;
      else if (of === 'steps') v = res.steps;
      else if (of === 'ops') v = Math.round(res.ops);
      else if (of === 'messages') v = o.perf ? res.msgCount[o.perf] || 0 : res.msgTotal;
      else if (of === 'messageCount') v = res.msgSeries.slice();
      else if (of === 'violations') v = o.kind === 'series' ? res.violSeries.slice() : o.norm ? res.viol[o.norm] || 0 : res.violTotal;
      else if (of === 'fulfilments') v = o.norm ? res.fulf[o.norm] || 0 : res.fulfTotal;
      else if (of === 'bdi') v = res.bdiStats[o.name as keyof typeof res.bdiStats];
      else if (of === 'agentVar')
        v = res.agents
          .filter(a => o.breed == null || a.B.id === o.breed)
          .map(a => (o.var! in a.v ? a.v[o.var!] : (a as unknown as Rec)[o.var!]));
      else if (of === 'hist' || of === 'histEdges') {
        const h = M.hist.find(x => x.id === o.hist),
          lo = h!.minC!.f(res.base),
          hi = h!.maxC!.f(res.base),
          nb = h!.bins || 10;
        if (of === 'histEdges') v = Array.from({ length: nb + 1 }, (_, q) => lo + ((hi - lo) * q) / nb);
        else {
          const cnt = new Array<number>(nb).fill(0);
          for (const a of res.agents) {
            if (!a.alive || (h!.breed != null && a.B.id !== h!.breed)) continue;
            res.setEnvAgent(a);
            const x = res.ev(h!.exprC!);
            if (Number.isFinite(x)) {
              const k = Math.max(0, Math.min(nb - 1, Math.floor(((x - lo) / (hi - lo)) * nb)));
              cnt[k]!++;
            }
          }
          v = cnt;
        }
      } else if (of === 'space') v = spaceScene(res, o);
    } catch {
      v = undefined;
    }
    if (v === undefined || v === null) v = empty(o);
    if (o.kind === 'series') v = C.thin(Array.from(v as ArrayLike<number>), 2000);
    out[o.id] = v;
  }
  for (const o of M.outs)
    if (o.of === 'flag') out[o.id] = codes.has(o.code!) ? 1 : 0;
    else if (o.of === 'ok') out[o.id] = codes.fatal() || codes.has('budget') ? 0 : 1;
  return { out, codes: codes.list.slice(), ops: res.ops };
}
function runProtocol(M: ProtoPrep, env: Env, seed: number) {
  const p = M.proto,
    codes = NoemaSimKit.codes(FATAL),
    out: Record<string, unknown> = {};
  let r = null as ProtoResult | null;
  try {
    if (p.kind === 'contractnet') r = contractNet(p, seed, env, codes);
    else if (p.kind === 'auction') r = auction(p, seed);
    else if (p.kind === 'negotiation') r = negotiation(p, seed, env, codes);
    else if (p.kind === 'coalition') r = coalition(p, codes);
    else if (p.kind === 'ipd') r = ipd(p, seed);
  } catch {
    r = null;
    codes.code('nan');
  }
  for (const o of M.outs) {
    let v: unknown;
    if (!r) v = undefined;
    else if (o.of === 'protocol') v = r.scalar[o.name!];
    else if (o.of === 'protocolSeries') {
      const s = r.series[o.name!];
      v = o.name === 'share' ? (Array.isArray(s) ? s[o.index || 0] : []) : s;
    } else if (o.of === 'messages') v = o.perf ? r.msgs[o.perf] || 0 : Object.values(r.msgs).reduce((a, b) => a + b, 0);
    else if (o.of === 'steps') v = 1;
    if (v === undefined || v === null) v = empty(o);
    if (o.kind === 'series') v = C.thin(Array.from(v as ArrayLike<number>), 2000);
    out[o.id] = v;
  }
  for (const o of M.outs)
    if (o.of === 'flag') out[o.id] = codes.has(o.code!) ? 1 : 0;
    else if (o.of === 'ok') out[o.id] = codes.fatal() ? 0 : 1;
  return { out, codes: codes.list.slice() };
}

/* ---------- the stepper (co-simulation): init builds the model and its agents, step advances whole steps ---------- */
const stepDef: StepperDef<StepSt> = {
  id: ID,
  init(model: unknown, inputs: Rec | null | undefined, ctx: unknown) {
    const sctx = ctx as { readonly spec?: unknown; readonly seed?: number } | null | undefined; // makeEngine passes the model and the whole spec in ctx

    const spec =
      isObj(model) && isObj(model.model)
        ? model
        : sctx && isObj(sctx.spec) && sctx.spec.model === model
          ? sctx.spec
          : { format: 'noema.sim-spec/v1', engine: ID, model, outputs: [] }; // makeEngine passes the model and the whole spec in ctx
    const M = prepare(spec);
    if (!M || M.proto) return { bad: true };
    return { spec, M, inputs: Object.assign({}, inputs || {}), seed: (sctx && sctx.seed)! >>> 0 || 1, done: 0 };
  },
  step(st: StepSt | null, inputs: Rec | null | undefined, t: number, dt: number) {
    if (!st || st.bad) return { state: st, out: {}, dt: 0, fail: 'model' };
    Object.assign(st.inputs, inputs || {});
    const want = Math.min(MAX_STEPS, Math.max(0, Math.round((t || 0) + dt)));
    // agents@1 is replayed from its seed up to the new step count: deterministic, and the inputs of each macro step apply from the start
    const m2 = Object.assign({}, st.M.m, { steps: Math.max(1, want) }),
      M2 = Object.assign({}, st.M, { m: m2 });
    const r = run(st.spec, st.inputs, { seed: st.seed, prepared: M2 });
    st.done = want;
    return { state: st, out: r.out, dt, events: [] };
  },
  snapshot: null,
};
const stepper = NoemaSimKit.stepper(stepDef)! as unknown as CoreStepper<unknown, Prepared | null>;

const { engine, simEngine } = C.makeEngine<Prepared | null>({ id: ID, checkSpec, run, prepare, scenes: true, stepper });
const API = Object.freeze({
  table: { model: TABLE, outputs: { scalar: SCALARS, series: SERIES, scene: SCENES }, fields: OUT_FIELDS },
  id: ID,
  checkSpec,
  exprs,
  keys,
  run,
  prepare,
  engine: Object.freeze(engine),
  simEngine,
  stepper,
  TEMPLATES: Object.freeze(Object.keys(TEMPLATES)),
  templateParams: (): unknown => JSON.parse(JSON.stringify(TEMPLATES)),
  template,
  ACTIONS: Object.freeze(ACTIONS.slice()),
  PROTOCOLS: Object.freeze(PROTOCOLS.slice()),
  PROTO_NAMES,
  CODES: Object.freeze(CODES.slice()),
  SERIES: Object.freeze(SERIES.slice()),
  SCALARS: Object.freeze(SCALARS.slice()),
  SCENES: Object.freeze(SCENES.slice()),
  IPD: Object.freeze(IPD.slice()),
  simplexEq,
  propParse,
  propEval,
  fallbackMonitor,
  MAX_AGENTS,
  MAX_STEPS,
});
export default API;
/* i18n-ignore-end */
