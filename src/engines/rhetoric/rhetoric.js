/* ===================== rhetoric@1 — debate and oratory (the engine library of sim-spec@1, docs/library/rhetoric.md) =====================
   A general engine for debate, argumentation and public speaking, built as a computation engine over structured inputs:
     • a debate round: the format's speech slots (BP: WUDC manual 2015/2020; WSDC rules; NSDA Lincoln–Douglas and policy; IDEA Karl
       Popper; Oxford-style / Intelligence Squared), the speeches with their durations and points of information, the judges' ballots
       → time and POI violations, the decision by the format's rule (BP ranks 3-2-1-0 and their consistency with speaker points; WSDC
       60–80 / 30–40 marks, no draws; LD and policy low-point wins), the panel's decision, the tab, the Oxford vote swing;
     • an argument map (Toulmin 1958 parts, support / attack / undercut, Walton, Reed & Macagno 2008 schemes with their critical
       questions) → which arguments survive (Dung 1995 semantics, computed by logic@1), the fallacy of a move, dropped arguments, clash,
       weighing (magnitude × probability, discounted), stock issues and the prima facie burden, a Toulmin diagram, a map, a flow sheet;
     • propositional and syllogistic forms → valid or the formal fallacy (truth tables and Venn regions of logic@1) with a counterexample;
     • a speech text (en, el, de, fr, ru, es, it) with optional word timings → words, rate, articulation rate, pauses (Goldman-Eisler
       1968), fillers, sentence lengths, nPVI (Grabe & Low 2002), readability by each language's own formula, figures of repetition
       and parallelism detected over tokens (anaphora, epistrophe, symploce, anadiplosis, climax, epanalepsis, epizeuxis,
       antimetabole, polyptoton, alliteration, tricolon, isocolon, asyndeton, polysyndeton, questions, antithesis);
       sound figures over phonetic keys per language (rhyme, assonance, consonance, paronomasia), trope CANDIDATES by explicit cues
       (simile markers, metaphor signals and "A is the B of C", irony markers and scare quotes, each with its cue), Greek synizesis;
     • bipolar maps (support edges) and ASPIC+ theories, both through logic@1 (bipolar, aspic, afSolve);
     • orders and models: Monroe's motivated sequence (1935), the parts of an oration (Cicero, De Inv. I.19), the canons, stasis
       (Hermagoras via Cicero / Quintilian), the Elaboration Likelihood Model (Petty & Cacioppo 1986) and inoculation (McGuire 1961;
       Banas & Rains 2010) as teaching models, audience fit.
   Logic (Dung semantics, validity, syllogisms) is NOT re-implemented here: it is called from NoemaLibLogic (47_lib_logic.js);
   (47_lib_logic.js loads first; its source travels to the Worker in front of this module). Pure JS, deterministic, bounded; numbers, codes, keys
   and the model's own short texts (`s`, ≤ 64 characters) only. Python twin of the checks: tools/lib_rhetoric.py. */
import NoemaLibCore from '../kernel/core.js';
import NoemaLibLogic from '../logic/logic.js';
  /* i18n-ignore-start */   // code, not text: only codes, keys, numbers and the model's own words leave this module
  const C = NoemaLibCore;
  const ID = 'rhetoric@1';
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const RAW_MAX = 64;
  const LIM = { speeches: 40, text: 20000, textAll: 40000, timing: 8000, pois: 30, teams: 8, ballots: 60, nodes: 120, edges: 400, forms: 20, fillers: 50 };
  const LANGS = ['en', 'el', 'de', 'fr', 'ru', 'es', 'it', 'other'];
  const SIDES = ['gov', 'opp', 'prop', 'aff', 'neg', 'for', 'against', 'none'];
  const PLUS = ['gov', 'prop', 'aff', 'for'], MINUS = ['opp', 'neg', 'against'];
  const sideSign = s => (PLUS.includes(s) ? 1 : MINUS.includes(s) ? -1 : 0);
  const FORMATS = ['bp', 'wsdc', 'ld', 'policy', 'popper', 'oxford', 'custom'];
  const NODE_KINDS = ['claim', 'premise', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal', 'objection', 'person'];
  const EDGE_KINDS = ['support', 'attack', 'undercut', 'except'];
  const STOCK = ['harms', 'inherency', 'solvency', 'topicality'];
  const APPEALS = ['ethos', 'pathos', 'logos'];
  const TOPOI = ['definition', 'division', 'comparison', 'cause', 'contraries', 'circumstance', 'testimony', 'precedent'];

  /* ---------- the format presets (min = minutes; protect = seconds at each end in which no POI may be offered) ----------
     BP: WUDC Debating & Judging Manual (2015/16; WUDC 2020): 7 min, POIs outside the first and last minute.
     WSDC: WSDC rules / TWSDC 2018 notes: 8 min substantive, 4 min replies (Opposition replies first, by speaker 1 or 2), no POIs in replies.
     LD: NSDA (6-3-7-3-4-6-3, prep 4). Policy: NSDA high school (8 / 3 / 5, prep 8). Popper: IDEA (6 / 3 / 5). Oxford: IQ2US conventions
     (7-minute openings, 2-minute closings; the audience vote decides). Tournaments differ: `custom` slots override everything. */
  const S = (role, side, min, o) => Object.assign({ role, side, min, poi: false, protect: 0, reply: false, cx: false }, o || {});
  const P = { poi: true, protect: 60 };
  const FORMAT = {
    bp: { sides: ['gov', 'opp'], teams: 4, score: [50, 100], slots: [S('PM', 'gov', 7, P), S('LO', 'opp', 7, P), S('DPM', 'gov', 7, P), S('DLO', 'opp', 7, P), S('MG', 'gov', 7, P), S('MO', 'opp', 7, P), S('GW', 'gov', 7, P), S('OW', 'opp', 7, P)] },
    wsdc: { sides: ['prop', 'opp'], teams: 2, score: [60, 80], reply: [30, 40], slots: [S('P1', 'prop', 8, P), S('O1', 'opp', 8, P), S('P2', 'prop', 8, P), S('O2', 'opp', 8, P), S('P3', 'prop', 8, P), S('O3', 'opp', 8, P), S('OR', 'opp', 4, { reply: true }), S('PR', 'prop', 4, { reply: true })] },
    ld: { sides: ['aff', 'neg'], teams: 2, score: [20, 30], prep: 4, slots: [S('AC', 'aff', 6), S('CXN', 'neg', 3, { cx: true }), S('NC', 'neg', 7), S('CXA', 'aff', 3, { cx: true }), S('AR1', 'aff', 4), S('NR', 'neg', 6), S('AR2', 'aff', 3)] },
    policy: { sides: ['aff', 'neg'], teams: 2, score: [20, 30], prep: 8, slots: [S('AC1', 'aff', 8), S('CX1', 'neg', 3, { cx: true }), S('NC1', 'neg', 8), S('CX2', 'aff', 3, { cx: true }), S('AC2', 'aff', 8), S('CX3', 'neg', 3, { cx: true }), S('NC2', 'neg', 8), S('CX4', 'aff', 3, { cx: true }), S('NR1', 'neg', 5), S('AR1', 'aff', 5), S('NR2', 'neg', 5), S('AR2', 'aff', 5)] },
    popper: { sides: ['aff', 'neg'], teams: 2, score: [20, 30], prep: 8, slots: [S('A1', 'aff', 6), S('CX1', 'neg', 3, { cx: true }), S('N1', 'neg', 6), S('CX2', 'aff', 3, { cx: true }), S('A2', 'aff', 5), S('CX3', 'neg', 3, { cx: true }), S('N2', 'neg', 5), S('CX4', 'aff', 3, { cx: true }), S('A3', 'aff', 5), S('N3', 'neg', 5)] },
    oxford: { sides: ['for', 'against'], teams: 2, score: [0, 100], slots: [S('OF1', 'for', 7), S('OA1', 'against', 7), S('OF2', 'for', 7), S('OA2', 'against', 7), S('CF', 'for', 2), S('CA', 'against', 2)] },
  };
  const ROLES_ALL = [...new Set(Object.values(FORMAT).flatMap(f => f.slots.map(s => s.role)))];

  /* ---------- argumentation schemes (Walton, Reed & Macagno 2008, Argumentation Schemes, ch. 9 compendium): the number of critical
     questions, and which failed CQ (0-based) makes which fallacy (Walton 1995, A Pragmatic Theory of Fallacy) ---------- */
  const SCHEMES = {
    expert: { cq: 6, fail: { 0: 'ad_verecundiam', 1: 'ad_verecundiam' } },          // expertise, field, opinion, trustworthiness, consistency, backup
    position: { cq: 3, fail: {} },                                                   // in a position to know, honest, asserted
    popular: { cq: 2, fail: { 0: 'ad_populum', 1: 'ad_populum' } },                  // widely accepted, reason to doubt it
    analogy: { cq: 3, fail: { 0: 'false_analogy', 1: 'false_analogy' } },            // relevantly similar, relevant differences, counter-analogy
    cause: { cq: 3, fail: {} },                                                      // strength of the link, other factors, evidence
    correlation: { cq: 3, fail: { 1: 'post_hoc', 2: 'post_hoc' } },                  // a real correlation, not chance, no third factor
    consequences: { cq: 3, fail: { 0: 'appeal_consequences' } },                     // likelihood, evidence, opposite consequences
    practical: { cq: 5, fail: {} },                                                  // other goals, alternatives, best, possible, side effects
    sign: { cq: 2, fail: {} },
    example: { cq: 4, fail: { 2: 'hasty_generalisation', 3: 'hasty_generalisation' } },   // true, supports, typical, enough examples
    classification: { cq: 2, fail: {} },
    commitment: { cq: 2, fail: {} },
    adHominem: { cq: 3, fail: { 1: 'ad_hominem' } },                                 // premises justified, relevant, conclusion follows
    circumstantial: { cq: 3, fail: { 1: 'tu_quoque' } },                             // a real inconsistency, relevant, conclusion follows
    slope: { cq: 3, fail: { 0: 'slippery_slope' } },                                 // each step plausible, chain bounded, end really bad
    ignorance: { cq: 2, fail: { 0: 'ad_ignorantiam' } },                             // search thorough, would it be known
    precedent: { cq: 2, fail: {} },
  };
  const SCHEME_IDS = Object.keys(SCHEMES);
  /** the fallacy catalogue: an output `fallacy` is the 0-based index in this list (0 = none); docs/library/rhetoric.md §5 */
  const FALLACIES = ['none', 'affirming_consequent', 'denying_antecedent', 'undistributed_middle', 'illicit_major', 'illicit_minor',
    'exclusive_premises', 'negative_mismatch', 'existential_fallacy', 'invalid_form', 'begging_question', 'straw_man', 'red_herring',
    'ad_hominem', 'tu_quoque', 'ad_verecundiam', 'ad_populum', 'ad_ignorantiam', 'post_hoc', 'slippery_slope', 'false_analogy',
    'hasty_generalisation', 'false_dilemma', 'appeal_consequences'];
  const FIDX = Object.fromEntries(FALLACIES.map((f, i) => [f, i]));

  /* ---------- orders (Monroe 1935; Cicero, De Inv. I.19 / Ad Herennium I.4; Ad Herennium I.3; Hermagoras via Cicero, De Inv. I.10) */
  const ORDERS = {
    monroe: ['attention', 'need', 'satisfaction', 'visualization', 'action'],
    oration: ['exordium', 'narratio', 'partitio', 'confirmatio', 'refutatio', 'peroratio'],
    canons: ['inventio', 'dispositio', 'elocutio', 'memoria', 'actio'],
    stasis: ['conjecture', 'definition', 'quality', 'translation'],
  };
  const PARTS_ALL = [...new Set(Object.values(ORDERS).flat())];
  const FIGURES = ['anaphora', 'epistrophe', 'symploce', 'anadiplosis', 'climax', 'epanalepsis', 'epizeuxis', 'antimetabole', 'polyptoton',
    'alliteration', 'tricolon', 'isocolon', 'asyndeton', 'polysyndeton', 'question', 'antithesis'];
  const FORMULAS = ['flesch', 'fk', 'fog', 'amstad', 'wstf', 'kandel', 'oborneva', 'lix', 'rix'];
  const FORMULA_LANG = { flesch: ['en'], fk: ['en'], fog: ['en'], amstad: ['de'], wstf: ['de'], kandel: ['fr'], oborneva: ['ru'], lix: null, rix: null };
  const SEMS = 'enum:grounded|preferred|stable';
  const SOUND_T = 'enum:assonance|consonance|rhyme|paronomasia', TROPE_T = 'enum:simile|metaphor|irony', SUPPORT_T = 'enum:general|deductive|necessary';
  /** an ASPIC+ literal: an atom or its negation (¬ ~ ! -), checked the same way in tools/lib_rhetoric.py; logic@1 builds the arguments */
  const LIT_RE = /^\s*(?:[¬~!-]\s*)*[A-Za-z_][A-Za-z0-9_]{0,31}\s*$/;

  /* ---------- the model table (the same codes and messages as tools/lib_rhetoric.py) ---------- */
  const L_ = (t, max, min, req) => Object.assign(req ? { $req: true } : {}, { $list: t, max }, min ? { min } : {});
  const O_ = t => ({ $obj: t });
  const SPEECH = { id: 'id!', team: 'ref', role: 'id', speaker: 'id', side: `enum:${SIDES.join('|')}`, lang: `enum:${LANGS.join('|')}`, dur: 'numx', label: 'key',
    pois: L_(O_({ at: 'numx!', by: 'ref', accepted: 'bool' }), LIM.pois) };
  const TEAM = { id: 'id!', side: `enum:${SIDES.join('|')}!`, label: 'key' };
  const BALLOT = { id: 'id!', round: 'int:1:20', judge: 'id', chair: 'bool', winner: 'ref',
    ranks: L_(O_({ team: 'ref!', rank: 'numx!' }), 8), scores: L_(O_({ speech: 'ref!', pts: 'numx!' }), LIM.speeches) };
  const VOTE = { for: 'numx!', against: 'numx!', undecided: 'numx' };
  const DEBATE = { format: `enum:${FORMATS.join('|')}!`, grace: 'nonneg', panel: 'enum:chair|borda|majority', teams: L_(O_(TEAM), LIM.teams),
    slots: L_(O_({ role: 'id!', side: `enum:${SIDES.join('|')}!`, min: 'pos!', poi: 'bool', protect: 'nonneg', reply: 'bool', cx: 'bool' }), LIM.speeches),
    ballots: L_(O_(BALLOT), LIM.ballots), pre: O_(VOTE), post: O_(VOTE), score: L_('fin', 2, 2) };
  const NODE = { id: 'id!', kind: `enum:${NODE_KINDS.join('|')}`, side: `enum:${SIDES.join('|')}`, speech: 'ref', scheme: `enum:${SCHEME_IDS.join('|')}`,
    cq: L_('int:-1:1', 8), impact: 'numx', prob: 'numx', time: 'numx', stock: `enum:${STOCK.join('|')}`, misrepresents: 'ref', offTopic: 'bool',
    options: 'int:1:20', alternatives: 'int:1:20', steps: L_('numx', 20), appeal: `enum:${APPEALS.join('|')}`, topos: `enum:${TOPOI.join('|')}`, label: 'key' };
  const MAP = { nodes: L_(O_(NODE), LIM.nodes, 1, true), edges: L_(O_({ from: 'ref!', to: 'ref!', kind: `enum:${EDGE_KINDS.join('|')}` }), LIM.edges) };
  const FORM = { id: 'id!', premises: L_('expr', 8), conclusion: 'expr', figure: 'int:1:4', existential: 'bool' };
  const TABLE = {
    lang: `enum:${LANGS.join('|')}`,
    speeches: L_(O_(SPEECH), LIM.speeches),
    debate: O_(DEBATE),
    map: O_(MAP),
    forms: L_(O_(FORM), LIM.forms),
    outline: O_({ scheme: 'enum:monroe|oration|canons|stasis!', parts: L_(O_({ id: 'id!', part: `enum:${PARTS_ALL.join('|')}!`, pos: 'numx!', label: 'key' }), 12, 2, true) }),
    stasis: O_({ conjecture: 'numx', definition: 'numx', quality: 'numx', translation: 'numx' }),
    elm: O_({ motivation: 'numx!', ability: 'numx!', quality: 'numx!', cue: 'numx!' }),
    inoculation: O_({ r0: 'numx', tau: 'numx', attack: 'numx', boosters: L_('numx', 10), horizon: 'numx' }),
    audience: O_({ grade: 'numx', formula: `enum:${FORMULAS.join('|')}`, wpmLo: 'numx', wpmHi: 'numx', tol: 'numx' }),
    delivery: O_({ pause: 'numx', window: 'numx' }),
    synizesis: 'bool',
    theory: O_({ kb: L_(O_({ f: 'expr!', kind: 'enum:axiom|ordinary', rank: 'int:-1000:1000' }), 64), rules: L_(O_({ id: 'id!', body: L_('expr', 8), head: 'expr!', kind: 'enum:strict|defeasible', rank: 'int:-1000:1000' }), 64),
      contraries: L_(O_({ u: 'expr!', v: 'expr!' }), 64), link: 'enum:last|weakest', ordering: 'enum:elitist|democratic', transpose: 'bool' }),
  };
  const SP = 'ref', TM = 'ref!', ND = 'ref!', RD = 'int:1:20';
  const OUT = {
    scalar: {
      words: { speech: SP }, sentences: { speech: SP }, clauses: { speech: SP }, syllables: { speech: SP }, duration: { speech: SP },
      wpm: { speech: SP }, articulation: { speech: SP }, pauses: { speech: SP }, pauseRate: { speech: SP }, meanPause: { speech: SP }, longestPause: { speech: SP },
      fillers: { speech: SP }, fillerRate: { speech: SP }, meanSentence: { speech: SP }, sdSentence: { speech: SP }, cvSentence: { speech: SP }, npvi: { speech: SP },
      questions: { speech: SP }, readability: { speech: SP, formula: `enum:${FORMULAS.join('|')}!` },
      figure: { speech: SP, type: `enum:${FIGURES.join('|')}!` }, figureAt: { speech: SP, type: `enum:${FIGURES.join('|')}!`, sentence: 'numx!' },
      limit: { speech: 'ref!' }, overtime: { speech: 'ref!' }, poiOffered: { speech: SP }, poiAccepted: { speech: SP }, poiProtected: { speech: SP }, violations: { speech: SP },
      rank: { team: TM, round: RD, ballot: 'ref' }, points: { team: TM, round: RD }, speaks: { team: 'ref', speech: 'ref', round: RD, ballot: 'ref' },
      winner: { round: RD, ballot: 'ref' }, winnerSide: { round: RD, ballot: 'ref' }, consistent: { ballot: 'ref' }, lpw: { ballot: 'ref!' },
      ballotsFor: { team: TM, round: RD }, margin: { round: RD }, tab: { team: TM }, swing: { side: 'enum:for|against!' },
      label: { node: ND, semantics: SEMS, ext: 'int:1:64' }, accepted: { node: ND, semantics: SEMS, mode: 'enum:credulous|sceptical' }, extensions: { semantics: SEMS },
      inCount: { semantics: SEMS, side: `enum:${SIDES.join('|')}` }, netBenefit: { tau: 'numx' }, weighedWinner: { tau: 'numx' },
      dropped: { side: `enum:${SIDES.join('|')}` }, clash: {}, toulmin: { node: ND }, stockMet: {}, primaFacie: {},
      cqOpen: { node: ND }, cqFailed: { node: ND }, schemeCQs: { scheme: `enum:${SCHEME_IDS.join('|')}!` }, fallacy: { node: 'ref', form: 'ref' }, fallacies: {}, slope: { node: ND },
      valid: { form: 'ref!' }, counter: { form: 'ref!', atom: 'name!' },
      orderOk: {}, kendall: {}, misplaced: {}, stasis: {},
      elaboration: {}, attitude: {}, central: {}, peripheral: {}, route: {},
      resistance: { at: 'numx!' }, attitudeAfter: { at: 'numx!' },
      gradeGap: { speech: SP }, rateGap: { speech: SP }, fit: { speech: SP },
      sound: { speech: SP, type: SOUND_T + '!' }, soundAt: { speech: SP, type: SOUND_T + '!', sentence: 'numx!' },
      trope: { speech: SP, type: TROPE_T + '!' }, tropeAt: { speech: SP, type: TROPE_T + '!', sentence: 'numx!' },
      bipolarLabel: { node: ND, support: SUPPORT_T, semantics: SEMS, ext: 'int:1:64' }, bipolarAccepted: { node: ND, support: SUPPORT_T, semantics: SEMS, mode: 'enum:credulous|sceptical' },
      complexAttacks: { support: SUPPORT_T }, aspicArgs: {}, aspicDefeats: {}, justified: { concl: 'expr!', semantics: SEMS, mode: 'enum:credulous|sceptical' }, postulates: { semantics: SEMS },
    },
    series: {
      sentenceLengths: { speech: SP }, sentenceAxis: { speech: SP }, figuresBySentence: { speech: SP, type: `enum:${FIGURES.join('|')}!` },
      rateCurve: { speech: SP }, timeAxis: { speech: SP }, pauseLengths: { speech: SP },
      durations: {}, limits: {}, speechAxis: {},
      elmAxis: {}, elmCentral: {}, elmPeripheral: {}, elmTotal: {}, inocT: {}, inocR: {},
      soundsBySentence: { speech: SP, type: SOUND_T + '!' }, tropesBySentence: { speech: SP, type: TROPE_T + '!' },
    },
    scene: {
      toulmin: { node: ND }, map: { semantics: SEMS }, flow: {}, figures: { speech: SP, type: `enum:${FIGURES.join('|')}` }, timing: { speech: SP },
      sounds: { speech: SP, type: SOUND_T }, tropes: { speech: SP, type: TROPE_T }, aspic: { semantics: SEMS },
    },
  };
  const NUMX_ORDER = ['sentence', 'tau', 'at'];
  const NEEDS = {   // the model section each output needs
    speeches: ['words', 'sentences', 'clauses', 'syllables', 'duration', 'wpm', 'articulation', 'pauses', 'pauseRate', 'meanPause', 'longestPause', 'fillers', 'fillerRate',
      'meanSentence', 'sdSentence', 'cvSentence', 'npvi', 'questions', 'readability', 'figure', 'figureAt', 'sentenceLengths', 'sentenceAxis', 'figuresBySentence',
      'rateCurve', 'timeAxis', 'pauseLengths', 'figures', 'timing', 'gradeGap', 'rateGap', 'fit', 'sound', 'soundAt', 'trope', 'tropeAt', 'soundsBySentence', 'tropesBySentence',
      'sounds', 'tropes'],
    debate: ['limit', 'overtime', 'poiOffered', 'poiAccepted', 'poiProtected', 'violations', 'rank', 'points', 'speaks', 'winner', 'winnerSide', 'consistent', 'lpw',
      'ballotsFor', 'margin', 'tab', 'swing', 'durations', 'limits', 'speechAxis'],
    map: ['label', 'accepted', 'extensions', 'inCount', 'netBenefit', 'weighedWinner', 'dropped', 'clash', 'toulmin', 'stockMet', 'primaFacie', 'cqOpen', 'cqFailed', 'slope', 'map', 'flow',
      'bipolarLabel', 'bipolarAccepted', 'complexAttacks'],
    forms: ['valid', 'counter'],
    outline: ['orderOk', 'kendall', 'misplaced'],
    stasis: ['stasis'],
    elm: ['elaboration', 'attitude', 'central', 'peripheral', 'route', 'elmAxis', 'elmCentral', 'elmPeripheral', 'elmTotal'],
    inoculation: ['resistance', 'attitudeAfter', 'inocT', 'inocR'],
    audience: ['gradeGap', 'rateGap', 'fit'],
    theory: ['aspicArgs', 'aspicDefeats', 'justified', 'postulates', 'aspic'],
  };
  const rawOk = v => typeof v === 'string' && v.trim() !== '' && v.length <= RAW_MAX;
  const arr = v => (Array.isArray(v) ? v : []);
  const idsOf = l => arr(l).filter(x => isObj(x) && typeof x.id === 'string').map(x => x.id);

  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m0 = isObj(spec) ? spec.model : undefined;
    // the raw content (speech texts and timings, node texts, extra fillers, syllogism moods) is checked here, not by the table
    let m = m0;
    if (isObj(m0)) {
      m = Object.assign({}, m0);
      if (Array.isArray(m0.speeches)) m.speeches = m0.speeches.map(s => { if (!isObj(s)) return s; const c = Object.assign({}, s); delete c.text; delete c.timing; return c; });
      if (isObj(m0.map) && Array.isArray(m0.map.nodes)) m.map = Object.assign({}, m0.map, { nodes: m0.map.nodes.map(x => { if (!isObj(x)) return x; const c = Object.assign({}, x); delete c.s; return c; }) });
      if (Array.isArray(m0.forms)) m.forms = m0.forms.map(x => { if (!isObj(x)) return x; const c = Object.assign({}, x); delete c.mood; return c; });
      if (isObj(m0.delivery)) { m.delivery = Object.assign({}, m0.delivery); delete m.delivery.fillers; }
    }
    C.walk(m, TABLE, 'model', E, W);
    const M = isObj(m0) ? m0 : {};
    const dups = (l, path) => { const seen = []; arr(l).forEach((x, i) => { if (isObj(x) && typeof x.id === 'string') { if (seen.includes(x.id)) E('dup', `${path}[${i}].id`, `the id ${x.id} is used twice`); seen.push(x.id); } }); };
    const D = isObj(M.debate) ? M.debate : null, MP = isObj(M.map) ? M.map : null;
    dups(M.speeches, 'model.speeches'); if (D) { dups(D.teams, 'model.debate.teams'); dups(D.ballots, 'model.debate.ballots'); }
    if (MP) dups(MP.nodes, 'model.map.nodes'); dups(M.forms, 'model.forms'); if (isObj(M.outline)) dups(M.outline.parts, 'model.outline.parts');
    const sIds = idsOf(M.speeches), tIds = D ? idsOf(D.teams) : [], nIds = MP ? idsOf(MP.nodes) : [], fIds = idsOf(M.forms), bIds = D ? idsOf(D.ballots) : [];
    const refOk = (v, ids) => !(typeof v === 'string' && C.ID_RE.test(v)) || ids.includes(v);
    let total = 0;
    arr(M.speeches).forEach((s, i) => {
      if (!isObj(s)) return;
      const at = `model.speeches[${i}]`;
      if (s.text !== undefined) {
        if (typeof s.text !== 'string') E('value', at + '.text', 'needs a text (a string)');
        else { total += s.text.length; if (s.text.length > LIM.text) E('size', at + '.text', `more than ${LIM.text} characters`); }
      }
      if (s.timing !== undefined) {
        if (!Array.isArray(s.timing)) E('format', at + '.timing', 'not an array');
        else if (s.timing.length > LIM.timing) E('size', at + '.timing', `more than ${LIM.timing} items`);
        else { const k = s.timing.findIndex(p => !(Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]) && p[0] >= 0 && p[1] >= p[0])); if (k >= 0) E('value', `${at}.timing[${k}]`, 'needs [start, end] in seconds, 0 <= start <= end'); }
        if (typeof s.text !== 'string') E('value', at + '.timing', 'needs the text the timings belong to');
      }
      if (!refOk(s.team, tIds)) E('ref', at + '.team', 'not a team of model.debate');
      arr(s.pois).forEach((p, k) => { if (isObj(p) && !refOk(p.by, tIds)) E('ref', `${at}.pois[${k}].by`, 'not a team of model.debate'); });
      if (D && typeof s.role === 'string' && C.ID_RE.test(s.role)) {
        const roles = D.format === 'custom' ? arr(D.slots).filter(x => isObj(x) && typeof x.role === 'string').map(x => x.role) : typeof D.format === 'string' && Object.prototype.hasOwnProperty.call(FORMAT, D.format) ? FORMAT[D.format].slots.map(x => x.role) : null;
        if (roles && !roles.includes(s.role)) E('ref', at + '.role', `not a speech of the format: ${roles.join(', ')}`);
      }
    });
    if (total > LIM.textAll) E('size', 'model.speeches', `more than ${LIM.textAll} characters of text in all`);
    if (D) {
      if (D.format === 'custom' && !Array.isArray(D.slots)) E('value', 'model.debate.slots', 'missing (a custom format lists its speeches)');
      arr(D.ballots).forEach((b, i) => {
        if (!isObj(b)) return;
        const at = `model.debate.ballots[${i}]`;
        if (!refOk(b.winner, tIds)) E('ref', at + '.winner', 'not a team of model.debate');
        arr(b.ranks).forEach((r, k) => { if (isObj(r) && !refOk(r.team, tIds)) E('ref', `${at}.ranks[${k}].team`, 'not a team of model.debate'); });
        arr(b.scores).forEach((r, k) => { if (isObj(r) && !refOk(r.speech, sIds)) E('ref', `${at}.scores[${k}].speech`, 'not a speech of the model'); });
      });
      if (D.format === 'oxford' && !(isObj(D.pre) && isObj(D.post)) && (D.pre !== undefined || D.post !== undefined)) E('value', 'model.debate', 'an Oxford vote needs both pre and post');
    }
    if (MP) {
      arr(MP.nodes).forEach((x, i) => {
        if (!isObj(x)) return;
        const at = `model.map.nodes[${i}]`;
        if (x.s !== undefined && !rawOk(x.s)) E('value', at + '.s', `needs a short text (1-${RAW_MAX} characters)`);
        if (!refOk(x.speech, sIds)) E('ref', at + '.speech', 'not a speech of the model');
        if (!refOk(x.misrepresents, nIds)) E('ref', at + '.misrepresents', 'not a node of the map');
        if (Array.isArray(x.cq) && typeof x.scheme === 'string' && SCHEMES[x.scheme] && x.cq.length > SCHEMES[x.scheme].cq) E('size', at + '.cq', `the scheme ${x.scheme} has ${SCHEMES[x.scheme].cq} critical questions`);
      });
      arr(MP.edges).forEach((e, i) => { if (!isObj(e)) return; for (const k of ['from', 'to']) if (!refOk(e[k], nIds)) E('ref', `model.map.edges[${i}].${k}`, 'not a node of the map'); });
    }
    arr(M.forms).forEach((f, i) => {
      if (!isObj(f)) return;
      const at = `model.forms[${i}]`;
      const prop = f.conclusion !== undefined || f.premises !== undefined, syl = f.mood !== undefined || f.figure !== undefined;
      if (prop === syl) E('value', at, 'needs premises and a conclusion, or a mood and a figure');
      else if (prop && !(Array.isArray(f.premises) && f.premises.length && f.conclusion !== undefined)) E('value', at, 'needs premises (1-8) and a conclusion');
      else if (syl && !(typeof f.mood === 'string' && /^[AEIO]{3}$/.test(f.mood) && f.figure !== undefined)) E('value', at + '.mood', 'needs a mood of three letters A, E, I, O and a figure 1-4');
    });
    if (isObj(M.outline) && typeof M.outline.scheme === 'string' && ORDERS[M.outline.scheme])
      arr(M.outline.parts).forEach((p, i) => { if (isObj(p) && typeof p.part === 'string' && PARTS_ALL.includes(p.part) && !ORDERS[M.outline.scheme].includes(p.part)) E('ref', `model.outline.parts[${i}].part`, `not a part of ${M.outline.scheme}: ${ORDERS[M.outline.scheme].join(', ')}`); });
    if (isObj(M.delivery) && M.delivery.fillers !== undefined) {
      const f = M.delivery.fillers;
      if (!Array.isArray(f)) E('format', 'model.delivery.fillers', 'not an array');
      else if (f.length > LIM.fillers) E('size', 'model.delivery.fillers', `more than ${LIM.fillers} items`);
      else f.forEach((x, i) => { if (!(typeof x === 'string' && x.trim() !== '' && x.length <= 32)) E('value', `model.delivery.fillers[${i}]`, 'needs a filler word or phrase (1-32 characters)'); });
    }
    if (isObj(M.theory)) {
      const Th = M.theory, lit = (v, p) => { if (typeof v === 'string' && !LIT_RE.test(v)) E('literal', p, 'needs a literal (an atom or ¬atom)'); };
      arr(Th.kb).forEach((k, i) => { if (isObj(k)) lit(k.f, `model.theory.kb[${i}].f`); });
      arr(Th.rules).forEach((r, i) => { if (!isObj(r)) return; arr(r.body).forEach((b, j) => lit(b, `model.theory.rules[${i}].body[${j}]`)); lit(r.head, `model.theory.rules[${i}].head`); });
      arr(Th.contraries).forEach((c, i) => { if (isObj(c)) { lit(c.u, `model.theory.contraries[${i}].u`); lit(c.v, `model.theory.contraries[${i}].v`); } });
      dups(Th.rules, 'model.theory.rules');
    }
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at, E2, W2) => {
      const T = OUT[o.kind][o.of];
      if (!T) { E2('output', at + '.of', `${o.kind} outputs of ${ID} are: ${Object.keys(OUT[o.kind]).join(', ')}`); return; }
      C.walk(o, Object.assign({ id: 'expr', kind: 'expr', of: 'expr' }, T), at, E2, W2);
      for (const [sec, ofs] of Object.entries(NEEDS)) if (ofs.includes(o.of) && !isObj(M[sec]) && !(sec === 'speeches' && Array.isArray(M.speeches) && M.speeches.length) && !(sec === 'forms' && Array.isArray(M.forms) && M.forms.length)) E2('ref', at + '.of', `needs model.${sec}`);
      if (o.of === 'swing' && !(D && D.format === 'oxford')) E2('ref', at + '.of', 'the vote swing is for the oxford format');
      if (o.of === 'justified' && typeof o.concl === 'string' && !LIT_RE.test(o.concl)) E2('literal', at + '.concl', 'needs a literal (an atom or ¬atom)');
      if (o.of === 'fallacy' && o.node === undefined && o.form === undefined) E2('value', at, 'needs node or form');
      if (o.of === 'speaks' && o.team === undefined && o.speech === undefined) E2('value', at, 'needs team or speech');
      if (['fallacies', 'fallacy'].includes(o.of) && !MP && !(Array.isArray(M.forms) && M.forms.length)) E2('ref', at + '.of', 'needs model.map or model.forms');
      const R = [['speech', sIds, 'not a speech of the model'], ['team', tIds, 'not a team of model.debate'], ['node', nIds, 'not a node of the map'], ['form', fIds, 'not a form of the model'], ['ballot', bIds, 'not a ballot of model.debate']];
      for (const [k, ids, msg] of R) if (T[k] && typeof o[k] === 'string' && C.ID_RE.test(o[k]) && !ids.includes(o[k])) E2('ref', `${at}.${k}`, msg);
    }, E, W);
    return P;
  }
  /** every numx string of the model (walked in the table's order) and of the outputs: [source, path, []] */
  function collect(o, T, path, out, kind) {
    if (!isObj(o)) return;
    for (const k of Object.keys(T)) {
      const kd = T[k], v = o[k], p = path + '.' + k;
      if (v === undefined) continue;
      if (typeof kd === 'string') { const kk = kd.replace(/!$/, ''); if (kk === kind && typeof v === 'string') out.push(kind === 'numx' ? [v, p, []] : [v, p]); }
      else if (kd.$obj) collect(v, kd.$obj, p, out, kind);
      else if (kd.$list && Array.isArray(v)) v.forEach((x, i) => { if (typeof kd.$list === 'string') { if (kd.$list.replace(/!$/, '') === kind && typeof x === 'string') out.push(kind === 'numx' ? [x, `${p}[${i}]`, []] : [x, `${p}[${i}]`]); } else if (kd.$list.$obj) collect(x, kd.$list.$obj, `${p}[${i}]`, out, kind); });
    }
  }
  function exprs(spec) {
    const out = [];
    if (isObj(spec) && isObj(spec.model)) collect(spec.model, TABLE, 'model', out, 'numx');
    arr(isObj(spec) ? spec.outputs : null).forEach((o, i) => {
      if (!isObj(o) || !OUT[o.kind] || !OUT[o.kind][o.of]) return;
      const T = OUT[o.kind][o.of];
      for (const k of NUMX_ORDER) if (T[k] && T[k].startsWith('numx') && typeof o[k] === 'string') out.push([o[k], `outputs[${i}].${k}`, []]);
    });
    return out;
  }
  function keys(spec) { const out = []; if (isObj(spec) && isObj(spec.model)) collect(spec.model, TABLE, 'model', out, 'key'); return out; }

  /* =====================================================================================================================
     1. Text: tokens, sentences, clauses in every alphabet (Unicode letters and marks), folding for comparison */
  const TOK = /[\p{L}\p{M}\p{N}]+(?:['’ʼ][\p{L}\p{M}]+)*/gu;
  const fold = w => w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').replace(/ς/g, 'σ').replace(/ё/g, 'е').replace(/[’ʼ]/g, "'");
  /** function words (closed classes) per language: they may start an anaphora but are not content words for chiasmus, alliteration,
      polyptoton, epizeuxis; CONJ are the coordinating conjunctions (asyndeton, polysyndeton, tricolon lists) */
  const STOP = {
    en: 'a an the and or but nor so yet for of to in on at by with from as is are was were be been being am it its this that these those i you he she we they me him her us them my your his our their not no do does did have has had shall will would should can could may might must there here what which who whom whose when where why how if then than all any each',
    el: 'ο η το οι τα του της των τον την στο στη στην στον στα στους και κι ή αλλά όμως ότι πως να θα δεν μη μην με σε για από ως είναι ήταν εγώ εσύ αυτός αυτή αυτό εμείς εσείς αυτοί μας σας τους μου σου του της ένα ένας μια μία που τι ποιος όταν αν',
    de: 'der die das den dem des ein eine einer einem einen eines und oder aber doch sondern denn nicht kein keine ist sind war waren sein bin bist es er sie wir ihr ich du mich dich sich uns euch zu in im an am auf aus bei mit nach von vor für über unter um als wie wenn dass ob so auch nur noch',
    fr: 'le la les l un une des du de d et ou mais donc or ni car ne pas plus est sont était être ai as a avons avez ont je tu il elle nous vous ils elles me te se lui leur y en à au aux dans par pour sur avec sans sous que qui quoi dont où si ce cet cette ces son sa ses mon ma mes ton ta tes notre nos votre vos',
    ru: 'и а но или да ни не же ли бы в во на с со к ко по о об от до из у за под над при для без через что как это так он она оно они мы вы я ты его ее её их мне меня тебя нас вас был была было были есть быть который которая которые то тот та те',
    es: 'el la los las un una unos unas y o pero sino ni que de del a al en con por para sin sobre es son era ser no se lo le les me te nos su sus mi mis tu',
    it: 'il lo la i gli le un uno una e o ma però né che di del della a al in con per su da non è sono era essere si mi ti ci vi lo suo sua miei',
    other: '',
  };
  const CONJ = { en: ['and', 'or', 'nor'], el: ['και', 'κι', 'η'], de: ['und', 'oder'], fr: ['et', 'ou', 'ni'], ru: ['и', 'или', 'да'], es: ['y', 'e', 'o', 'u', 'ni'], it: ['e', 'ed', 'o', 'né'], other: [] };
  const NOISE_W = {
    en: 'a an the and or but nor of to for in on at by with from as is are was were be been am can could do does did will would shall should may might must not',
    el: 'ο η το οι τα του της των τον την και κι ή αλλά να θα δεν με σε για από είναι ήταν',
    de: 'der die das den dem des ein eine einer einem einen und oder aber nicht ist sind war zu in im an am auf mit von für',
    fr: 'le la les l un une des du de d et ou mais ne pas est sont à au aux dans par pour sur avec',
    ru: 'и а но или да не в во на с со к по о от до из у за для это',
    es: 'el la los las un una y o pero de del a al en con por para no es',
    it: 'il lo la i gli le un una e o ma di del a al in con per non è',
    other: '' };
  const NOISE = {}; for (const [l, s] of Object.entries(NOISE_W)) NOISE[l] = new Set(s.split(' ').filter(Boolean).map(w => w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')));
  const STOPSET = {}; for (const [l, s] of Object.entries(STOP)) STOPSET[l] = new Set(s.split(' ').filter(Boolean).map(fold));
  /** fillers that are never words (Bortfeld et al. 2001 for English; the languages' common hesitation sounds); the author adds more */
  const FILLERS = { en: ['um', 'uh', 'er', 'erm', 'uhm', 'hmm', 'mm'], el: ['εε', 'εεε', 'μμ', 'μμμ', 'ε'], de: ['äh', 'ähm', 'öh', 'öhm', 'hm'], fr: ['euh', 'heu', 'hum'], ru: ['э', 'ээ', 'эээ', 'эм', 'мм', 'хм'], es: ['eh', 'em', 'este'], it: ['ehm', 'eh', 'mmm'], other: [] };
  /** "not X but Y" — the antithesis construction: [negator words, contrast words] per language */
  const ANTI = { en: [['not', 'never', 'no'], ['but']], el: [['όχι', 'δεν', 'μη', 'μην'], ['αλλά', 'αλλ']], de: [['nicht', 'kein', 'keine', 'nie'], ['sondern']], fr: [['pas', 'non', 'jamais'], ['mais']], ru: [['не', 'нет'], ['а', 'но']], es: [['no'], ['sino']], it: [['non'], ['ma', 'bensì']], other: [[], []] };
  const ABBR = /^(mr|mrs|ms|dr|st|vs|cf|etc|prof|jr|sr|no|vol|fig|hr|fr|frau|m|mme|dr|бг|т|д)$/i;

  /** analyse(text, lang, extraFillers) → {toks: [{s, f (folded), sent, clause, filler}], sents: [{toks: [i], clauses: [[i]], end}], …} */
  function analyse(text, lang, extra) {
    const t = String(text || '').normalize('NFC');
    const toks = [], sents = [];
    const sentEnd = lang === 'el' ? /[.!?;;…]/ : /[.!?…]/;
    let cur = { toks: [], clauses: [[]], end: '' }, last = 0;
    const closeSent = gap => { if (cur.toks.length) { cur.end = /[?;;]/.test(gap) && (lang === 'el' || /\?/.test(gap)) ? '?' : /!/.test(gap) ? '!' : /[.…]/.test(gap) ? '.' : ''; cur.clauses = cur.clauses.filter(c => c.length); sents.push(cur); } cur = { toks: [], clauses: [[]], end: '' }; };
    for (const m of t.matchAll(TOK)) {
      const gap = t.slice(last, m.index);
      if (toks.length) {
        const prev = toks[toks.length - 1].s;
        const decimal = /^[.,]$/.test(gap) && /^\p{N}+$/u.test(prev) && /^\p{N}/u.test(m[0]);
        const abbr = /^\.\s+$/.test(gap) && ABBR.test(prev);
        const end = sentEnd.test(lang === 'el' ? gap : gap.replace(/;/g, ',')) && !decimal && !abbr;
        if (end || /\n\s*\n/.test(gap)) closeSent(gap);
        else if (/[,;:—–()"«»„“”\n]|\s-\s/.test(gap) && !decimal) { if (cur.clauses[cur.clauses.length - 1].length) cur.clauses.push([]); }
      }
      const i = toks.length;
      toks.push({ s: m[0], f: fold(m[0]), i: m.index, sent: sents.length, filler: false });
      cur.toks.push(i); cur.clauses[cur.clauses.length - 1].push(i);
      last = m.index + m[0].length;
    }
    closeSent(t.slice(last));
    // fillers: the language's own, then the author's (phrases of several words too)
    const fl = new Set((FILLERS[lang] || []).map(fold));
    for (const x of toks) if (fl.has(x.f)) x.filler = true;
    for (const e of extra || []) {
      const ws = [...String(e).normalize('NFC').matchAll(TOK)].map(q => fold(q[0])); if (!ws.length) continue;
      for (let i = 0; i + ws.length <= toks.length; i++) if (ws.every((w, k) => toks[i + k].f === w)) for (let k = 0; k < ws.length; k++) toks[i + k].filler = true;
    }
    sents.forEach((s, si) => { s.toks.forEach(i => { toks[i].sent = si; }); s.clauses.forEach(c => c.forEach(i => { toks[i].clause = c; })); s.words = s.toks.filter(i => !toks[i].filler).length; });
    return { toks, sents, hasEnd: sentEnd.test(t) };
  }

  /* ---------- syllables by vowel groups of each alphabet (the usual counting rules of the readability formulas) ---------- */
  const EN_EXC = { every: 2, business: 2, fire: 1, hour: 1, our: 1, poem: 2, people: 2, heaven: 2, being: 2, area: 3, idea: 3, real: 1, the: 1, are: 1, were: 1, there: 1, where: 1, here: 1, one: 1, once: 1, some: 1, come: 1, done: 1, gone: 1, love: 1, give: 1, live: 1, have: 1, above: 2, whose: 1, those: 1, these: 1, shall: 1, nation: 2, science: 2, quiet: 2, created: 3, dedicated: 4 };
  function sylEn(w0) {
    const w = w0.toLowerCase().replace(/['’]/g, '').replace(/[^a-z]/g, ''); if (!w) return 0;
    if (EN_EXC[w]) return EN_EXC[w];
    if (w.length <= 3) return 1;
    let x = w;
    if (/[^aeiouy]le$/.test(x)) x = x.slice(0, -2) + 'el';                   // table, people: -le stays a syllable
    else if (/(?:[sxz]|ch|sh|ge|ce)es$/.test(x)) x = x;                       // boxes, places: -es is a syllable
    else if (/[td]ed$/.test(x)) x = x;                                       // wanted: -ed is a syllable
    else x = x.replace(/(?:[^aeiouy]es|[^aeiouy]ed|[^aeiouy]e)$/, m => m[0]); // silent final e, -es, -ed
    x = x.replace(/^y/, '');
    let n = (x.match(/[aeiouy]+/g) || []).length;
    if (/[^aeiou]ia/.test(w) && !/(cia|tia|sia)/.test(w)) n++;               // media, via: i-a is two
    return Math.max(1, n);
  }
  const VOW = { de: /[aeiouyäöü]+/g, fr: /[aeiouyàâäéèêëîïôöùûüÿœæ]+/g, es: /[aeiouyáéíóúü]+/g, it: /[aeiouàèéìíòóùú]+/g, ru: /[аеёиоуыэюя]/g, el: /[αεηιουω]+/g, other: /[aeiouy]+/g };
  function syllables(w, lang, syn) {
    if (lang === 'en') return sylEn(w);
    let x = w.toLowerCase();
    if (lang === 'fr') x = x.length > 3 ? x.replace(/(?:e|es|ent)$/, '') || x : x;   // the mute final e (prose reading)
    if (lang === 'es') x = x.replace(/([aeo])([íú])/g, '$1-$2').replace(/([íú])([aeo])/g, '$1-$2');   // hiatus with an accented í, ú
    if (lang === 'el') return sylEl(x, syn);
    const re = VOW[lang] || VOW.other;
    return Math.max(1, (x.match(re) || []).length);
  }
  /** Greek: one syllable per vowel, except the digraphs αι ει οι υι ου αυ ευ ηυ — unless the second vowel has a diaeresis (προϊόν) or the
      first carries the accent (ρολόι) (Triantafyllidis, Νεοελληνική Γραμματική §§ 15–20). With syn (model.synizesis): synizesis — an
      unaccented ι, υ (alone, not the second letter of a digraph) or ει / οι before a vowel is a glide and makes no syllable (παιδιά 2,
      ποιος 1, ήλιος 2, αλήθεια 3; Holton, Mackridge & Philippaki-Warburton 1997 §1.4.2; Triantafyllidis § 20). It is the everyday
      pronunciation; learned words that keep the hiatus (διάλογος, ιδιαίτερος in careful speech) are then counted one short. */
  const EL_DI = new Set(['αι', 'ει', 'οι', 'υι', 'ου', 'αυ', 'ευ', 'ηυ']);
  function sylEl(w, syn) {
    const d = w.normalize('NFD'); let n = 0, prev = null, glide = false;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (/\p{M}/u.test(c)) continue;
      if (!'αεηιουω'.includes(c)) { prev = null; glide = false; continue; }
      let acc = false, dia = false; for (let k = i + 1; k < d.length && /\p{M}/u.test(d[k]); k++) { if (d[k] === '\u0308') dia = true; else acc = true; }
      if (prev && EL_DI.has(prev.c + c) && !dia && !prev.acc) {
        // a digraph ει / οι (sound i) without accent before a vowel: synizesis takes its syllable back
        if (syn && (prev.c + c === 'ει' || prev.c + c === 'οι') && !acc && nextVowel(d, i)) { n--; glide = true; }
        prev = null; continue;
      }
      if (syn && (c === 'ι' || c === 'υ') && !acc && !dia && nextVowel(d, i)) { prev = null; glide = true; continue; }   // παιδιά, ποιος: a glide
      if (glide && prev === null) glide = false;
      n++; prev = { c, acc };
    }
    return Math.max(1, n);
  }
  function nextVowel(d, i) { let k = i + 1; while (k < d.length && /\p{M}/u.test(d[k])) k++; return k < d.length && 'αεηιουω'.includes(d[k]); }
  const letters = s => (s.match(/\p{L}/gu) || []).length;
  /** readability(words, nSent, lang, formula, codes): the formula of its own language; sources in the chapter §4 */
  function readability(words, nSent, lang, formula, codes, syn) {
    const W = words.length; if (!W) { codes.push('empty'); return NaN; }
    const S = Math.max(1, nSent), syl = words.map(w => syllables(w, lang, syn)), SY = syl.reduce((a, b) => a + b, 0);
    const asl = W / S, asw = SY / W, poly = syl.filter(x => x >= 3).length, mono = syl.filter(x => x === 1).length, long = words.filter(w => letters(w) > 6).length;
    const L = FORMULA_LANG[formula]; if (L && !L.includes(lang)) codes.push('formula_lang');
    let v = NaN;
    switch (formula) {
      case 'flesch': v = 206.835 - 1.015 * asl - 84.6 * asw; break;                 // Flesch 1948, J. Appl. Psych. 32:221
      case 'fk': v = 0.39 * asl + 11.8 * asw - 15.59; break;                        // Kincaid, Fishburne, Rogers & Chissom 1975 (US Navy)
      case 'fog': v = 0.4 * (asl + 100 * poly / W); break;                          // Gunning 1952
      case 'amstad': v = 180 - asl - 58.5 * asw; break;                             // Amstad 1978 (German Flesch)
      case 'wstf': v = 0.1935 * (100 * poly / W) + 0.1672 * asl + 0.1297 * (100 * long / W) - 0.0327 * (100 * mono / W) - 0.875; break;   // Bamberger & Vanecek 1984, 1st Wiener Sachtextformel
      case 'kandel': v = 207 - 1.015 * asl - 73.6 * asw; break;                     // Kandel & Moles 1958 (French Flesch)
      case 'oborneva': v = 206.835 - 1.3 * asl - 60.1 * asw; break;                 // Oborneva 2006 (Russian Flesch)
      case 'lix': v = asl + 100 * long / W; break;                                  // Björnsson 1968
      case 'rix': v = long / S; break;                                              // Anderson 1983
    }
    if (['flesch', 'amstad', 'kandel', 'oborneva'].includes(formula) && (v < 0 || v > 100)) codes.push('off_scale');
    if (formula === 'wstf' && (v < 4 || v > 15)) codes.push('off_scale');
    return v;
  }

  /* ---------- figures over tokens (definitions: Lanham 1991; detection rules: docs/library/rhetoric.md §6; chiasmus as Dubremetz & Nivre
     2015/2018 rank it: content words a b … b a within two clauses) ----------
     Each hit: {type, sent (first sentence), toks: [token indices involved]} */
  const lem = f => (f.length >= 6 ? f.slice(0, 5) : f);   // a crude stem for inflected repetitions (человек / человека, Mensch / Menschen)
  const prefix = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };   // polyptoton: a shared stem of ≥ 60 % of the longer form
  function figures(A, lang) {
    const { toks, sents } = A, hits = [], stop = STOPSET[lang] || STOPSET.other, conj = new Set((CONJ[lang] || []).map(fold));
    const content = i => !toks[i].filler && !stop.has(toks[i].f) && /\p{L}/u.test(toks[i].f);
    const add = (type, toksI) => { if (hits.length < 4000) hits.push({ type, sent: toks[toksI[0]].sent, toks: toksI }); };
    const clauses = []; sents.forEach(s => s.clauses.forEach(c => { const w = c.filter(i => !toks[i].filler); if (w.length) clauses.push(w); }));
    // anaphora / epistrophe / symploce / anadiplosis / epanalepsis on successive clauses (a run of clauses counts once)
    let runA = -2, runE = -2, lastA = null, lastE = null;
    for (let k = 0; k + 1 < clauses.length; k++) {
      const a = clauses[k], b = clauses[k + 1];
      const head = toks[a[0]].f === toks[b[0]].f && (a.length > 1 || b.length > 1), tail = toks[a[a.length - 1]].f === toks[b[b.length - 1]].f && a.length > 1 && b.length > 1;
      if (head) { if (runA === k - 1 && hits.length && lastA) lastA.toks.push(b[0]); else { add('anaphora', [a[0], b[0]]); lastA = hits[hits.length - 1]; } runA = k; }   // a run of clauses is one anaphora
      if (tail) { if (runE === k - 1 && hits.length && lastE) lastE.toks.push(b[b.length - 1]); else { add('epistrophe', [a[a.length - 1], b[b.length - 1]]); lastE = hits[hits.length - 1]; } runE = k; }
      if (head && tail && a.length > 2 && b.length > 2) add('symploce', [a[0], a[a.length - 1], b[0], b[b.length - 1]]);
      if (toks[a[a.length - 1]].f === toks[b[0]].f && content(b[0])) {
        add('anadiplosis', [a[a.length - 1], b[0]]);
        if (k + 2 < clauses.length) { const c = clauses[k + 2]; if (toks[b[b.length - 1]].f === toks[c[0]].f && content(c[0])) add('climax', [a[a.length - 1], b[0], b[b.length - 1], c[0]]); }
      }
    }
    for (const c of clauses) if (c.length >= 3 && toks[c[0]].f === toks[c[c.length - 1]].f) add('epanalepsis', [c[0], c[c.length - 1]]);
    // epizeuxis: a content word said twice in a row
    for (let i = 0; i + 1 < toks.length; i++) if (toks[i].f === toks[i + 1].f && content(i) && toks[i].sent === toks[i + 1].sent) add('epizeuxis', [i, i + 1]);
    // antimetabole: a … b … b … a over a window of two successive clauses of one sentence; words other than articles, conjunctions,
    // prepositions and auxiliaries (NOISE); of several candidates the widest, then the one with more content words (Dubremetz & Nivre 2018 rank similarly)
    const noise = NOISE[lang] || NOISE.other;
    for (let k = 0; k < clauses.length; k++) {
      const nx = k + 1 < clauses.length && toks[clauses[k + 1][0]].sent === toks[clauses[k][0]].sent ? clauses[k + 1] : [];
      const win = clauses[k].concat(nx).filter(i => !noise.has(toks[i].f) && /\p{L}/u.test(toks[i].f)).slice(0, 60);
      const pos = new Map(); for (const i of win) { const f = lem(toks[i].f); if (!pos.has(f)) pos.set(f, []); pos.get(f).push(i); }
      const rep2 = [...pos.entries()].filter(e => e[1].length >= 2).slice(0, 20);
      let best = null;
      for (const [fa, pa] of rep2) for (const [fb, pb] of rep2) {
        if (fa === fb) continue;
        const a1 = pa[0], a2 = pa[pa.length - 1], inner = pb.filter(i => i > a1 && i < a2);
        if (inner.length < 2 || a2 - a1 < 3 || (nx.length && !clauses[k].includes(a1))) continue;
        const b1 = inner[0], b2 = inner[inner.length - 1];
        const score = (a2 - a1) + 100 * ((content(a1) ? 1 : 0) + (content(b1) ? 1 : 0));
        if (!best || score > best.score) best = { score, t: [a1, b1, b2, a2] };
      }
      if (best && !hits.some(h => h.type === 'antimetabole' && h.toks.includes(best.t[0]) && h.toks.includes(best.t[3]))) add('antimetabole', best.t);
    }
    // per sentence: polyptoton, alliteration, tricolon, isocolon, asyndeton, polysyndeton, question, antithesis
    const [neg, contra] = ANTI[lang] || ANTI.other, negS = new Set(neg.map(fold)), conS = new Set(contra.map(fold));
    sents.forEach(s => {
      const cw = s.toks.filter(content);
      polyp: for (let p = 0; p < cw.length; p++) for (let q = p + 1; q < cw.length; q++) {
        const a = toks[cw[p]].f, b = toks[cw[q]].f;
        if (a !== b && Math.min(a.length, b.length) >= 4 && prefix(a, b) >= Math.max(4, Math.ceil(0.6 * Math.max(a.length, b.length)))) { add('polyptoton', [cw[p], cw[q]]); break polyp; }
      }
      for (let p = 0; p + 2 < cw.length; p++) {
        const ini = i => toks[i].f.normalize('NFD').charAt(0);
        const c0 = ini(cw[p]); if (/[aeiouyαεηιουωаеиоуыэюя\p{N}]/u.test(c0)) continue;
        const run = [cw[p]]; for (let q = p + 1; q < cw.length && cw[q] - cw[p] <= 4 + run.length; q++) if (ini(cw[q]) === c0) run.push(cw[q]);
        if (run.length >= 3 && new Set(run.map(i => toks[i].f)).size >= 3) { add('alliteration', run); break; }
      }
      const cl = s.clauses.map(c => c.filter(i => !toks[i].filler)).filter(c => c.length);
      let tri = false;
      for (let k = 0; k + 2 < cl.length; k++) {
        const L3 = [cl[k].length, cl[k + 1].length, cl[k + 2].length];
        const f3 = j => toks[cl[k + j][0]].f, l3 = j => toks[cl[k + j][cl[k + j].length - 1]].f;
        if ((Math.max(...L3) - Math.min(...L3) <= 1 && Math.max(...L3) <= 8) || (f3(0) === f3(1) && f3(1) === f3(2)) || (l3(0) === l3(1) && l3(1) === l3(2))) { add('tricolon', [cl[k][0], cl[k + 1][0], cl[k + 2][0]]); tri = true; break; }
      }
      if (!tri) {   // a list A, B and C inside one clause sequence: three members separated by commas and a final conjunction
        for (let k = 0; k + 2 < cl.length; k++) { const c3 = cl[k + 2]; if (conj.has(toks[c3[0]].f) && cl[k + 1].length <= 4 && cl[k].length >= 1) { add('tricolon', [cl[k][cl[k].length - 1], cl[k + 1][0], c3[0]]); break; } }
      }
      for (let k = 0; k + 1 < cl.length; k++) if (cl[k].length >= 3 && cl[k].length === cl[k + 1].length) { add('isocolon', [cl[k][0], cl[k + 1][0]]); break; }
      const hasConj = s.toks.some(i => conj.has(toks[i].f));
      if (cl.length >= 3 && !hasConj && cl.every(c => c.length <= 6)) add('asyndeton', cl.map(c => c[0]));
      const cj = s.toks.filter(i => conj.has(toks[i].f));
      if (cj.length >= 2 && cj.some((i, k) => k && cj[k] - cj[k - 1] <= 8)) add('polysyndeton', cj);
      if (s.end === '?') add('question', [s.toks[0]]);
      const ni = s.toks.findIndex(i => negS.has(toks[i].f));
      if (ni >= 0) { const ci = s.toks.findIndex((i, k) => k > ni && conS.has(toks[i].f)); if (ci > ni) add('antithesis', [s.toks[ni], s.toks[ci]]); }
    });
    return hits;
  }

  /* ---------- sound figures over phonetic keys (rhyme, assonance, consonance, paronomasia) ----------
     phon(word, lang) → a phonetic key: the spelling turned into a rough phoneme string by each language's main grapheme rules (en: the
     usual digraphs and the silent final e, Carney 1994 A Survey of English Spelling; el: Holton, Mackridge & Philippaki-Warburton 1997
     §1.1–1.4, digraphs and synizesis; de: Wiese 1996, final devoicing; fr: Tranel 1987, nasal vowels and mute finals; ru: Timberlake
     2004 ch. 2, final devoicing, ё; es: seseo and yeísmo as in most speakers, Hualde 2005; it: Krämer 2009). Vowels in a key:
     a e i o u y ø A E O (A E O: the French nasals). It is a key for comparing words, not a transcription: stress is not marked, so a
     rhyme is matched from the last vowel. Definitions: Lanham 1991 (assonance, consonance, paronomasia), Brogan in the Princeton
     Encyclopedia of Poetry and Poetics 2012 (rhyme). Detection rules: docs/library/rhetoric.md §6.2. */
  const SOUNDS = ['assonance', 'consonance', 'rhyme', 'paronomasia'];
  const KV = 'aeiouyøAEO';
  const PHON = {
    en: [[/ph/g, 'f'], [/gh(?=t|$)/g, ''], [/^wr/, 'r'], [/^kn/, 'n'], [/ck/g, 'k'], [/sh/g, 'S'], [/tch/g, 'C'], [/ch/g, 'C'], [/th/g, 'T'], [/wh/g, 'w'], [/qu/g, 'kw'],
      [/c(?=[eiy])/g, 's'], [/c/g, 'k'], [/x/g, 'ks'], [/(ee|ea|ie)/g, 'i'], [/oo/g, 'u'], [/(ou|ow)/g, 'au'], [/(ai|ay|ei|ey)/g, 'ei'], [/(oa|oe)/g, 'o'],
      [/([^aeiou])e$/, '$1'], [/([^aeiou])y$/, '$1i'], [/y(?=[^aeiou]|$)/g, 'i'], [/([a-z])\1/g, '$1']],
    el: [[/αυ(?=[θκξπσςτφχψ]|$)/g, 'af'], [/ευ(?=[θκξπσςτφχψ]|$)/g, 'ef'], [/ηυ(?=[θκξπσςτφχψ]|$)/g, 'if'], [/αυ/g, 'av'], [/ευ/g, 'ev'], [/ηυ/g, 'iv'], [/ου/g, 'u'], [/(αι)/g, 'e'], [/(ει|οι|υι)/g, 'i'], [/[ηιυ]/g, 'i'], [/ω/g, 'o'], [/ε/g, 'e'], [/α/g, 'a'], [/ο/g, 'o'], [/μπ/g, 'b'], [/ντ/g, 'd'], [/(γκ|γγ)/g, 'g'],
      [/τσ/g, 'ts'], [/τζ/g, 'dz'], [/ψ/g, 'ps'], [/ξ/g, 'ks'], [/θ/g, 'T'], [/δ/g, 'D'], [/χ/g, 'x'], [/γ/g, 'G'], [/φ/g, 'f'], [/β/g, 'v'], [/[σς]/g, 's'], [/κ/g, 'k'],
      [/λ/g, 'l'], [/μ/g, 'm'], [/ν/g, 'n'], [/π/g, 'p'], [/ρ/g, 'r'], [/τ/g, 't'], [/ζ/g, 'z'], [/([a-zA-Z])\1/g, '$1']],
    de: [[/sch/g, 'S'], [/ch/g, 'x'], [/ck/g, 'k'], [/ph/g, 'f'], [/th/g, 't'], [/ie/g, 'i'], [/(ei|ai)/g, 'ai'], [/(eu|äu)/g, 'oi'], [/ä/g, 'e'], [/ö/g, 'ø'], [/ü/g, 'y'],
      [/ß/g, 's'], [/qu/g, 'kv'], [/v/g, 'f'], [/w/g, 'v'], [/z/g, 'ts'], [/h(?![aeiouäöüy])/g, ''], [/([a-z])\1/g, '$1'], [/b$/, 'p'], [/d$/, 't'], [/g$/, 'k']],
    fr: [[/eaux?$/, 'o'], [/eau/g, 'o'], [/au/g, 'o'], [/oi/g, 'wa'], [/ou/g, 'U'], [/(ai|ei)/g, 'e'], [/[éèêë]/g, 'e'], [/[àâ]/g, 'a'], [/[îï]/g, 'i'], [/[ôö]/g, 'o'], [/[ùûü]/g, 'y'],
      [/qu/g, 'k'], [/ph/g, 'f'], [/ch/g, 'S'], [/gn/g, 'N'], [/ç/g, 's'], [/c(?=[ei])/g, 's'], [/c/g, 'k'], [/g(?=[ei])/g, 'Z'], [/j/g, 'Z'], [/h/g, ''],
      [/(ain|ein|in|im|un)(?![aeiouy])/g, 'E'], [/(an|am|en|em)(?![aeiouy])/g, 'A'], [/(on|om)(?![aeiouy])/g, 'O'], [/(es|ent|e)$/, ''], [/[stdxzp]$/, ''], [/u/g, 'y'], [/U/g, 'u'], [/([a-z])\1/g, '$1']],
    ru: [[/щ/g, 'S'], [/ш/g, 'S'], [/ж$/, 'S'], [/ж/g, 'Z'], [/ч/g, 'C'], [/ц/g, 'ts'], [/х/g, 'x'], [/[ьъ]/g, ''], [/ё/g, 'o'], [/ю/g, 'u'], [/я/g, 'a'], [/[иы]/g, 'i'], [/[эе]/g, 'e'],
      [/а/g, 'a'], [/о/g, 'o'], [/у/g, 'u'], [/й/g, 'j'], [/б$/, 'p'], [/в$/, 'f'], [/г$/, 'k'], [/д$/, 't'], [/з$/, 's'], [/б/g, 'b'], [/в/g, 'v'], [/г/g, 'g'], [/д/g, 'd'], [/з/g, 'z'],
      [/к/g, 'k'], [/л/g, 'l'], [/м/g, 'm'], [/н/g, 'n'], [/п/g, 'p'], [/р/g, 'r'], [/с/g, 's'], [/т/g, 't'], [/ф/g, 'f'], [/([a-zA-Z])\1/g, '$1']],
    es: [[/ll/g, 'j'], [/y(?=[aeiou])/g, 'j'], [/y$/, 'i'], [/ch/g, 'C'], [/qu/g, 'k'], [/gu(?=[ei])/g, 'g'], [/g(?=[ei])/g, 'x'], [/c(?=[ei])/g, 's'], [/c/g, 'k'], [/z/g, 's'],
      [/h/g, ''], [/v/g, 'b'], [/j/g, 'x'], [/ñ/g, 'N'], [/[á]/g, 'a'], [/[é]/g, 'e'], [/[í]/g, 'i'], [/[óö]/g, 'o'], [/[úü]/g, 'u'], [/rr/g, 'R'], [/([a-z])\1/g, '$1']],
    it: [[/ch/g, 'k'], [/gh/g, 'g'], [/sc(?=[ei])/g, 'S'], [/gli/g, 'L'], [/gn/g, 'N'], [/c(?=[ei])/g, 'C'], [/g(?=[ei])/g, 'J'], [/qu/g, 'kw'], [/h/g, ''], [/[àá]/g, 'a'], [/[èé]/g, 'e'],
      [/[ìí]/g, 'i'], [/[òó]/g, 'o'], [/[ùú]/g, 'u'], [/([a-z])\1/g, '$1']],
    other: [],
  };
  /** phon(word, lang) → the phonetic key (lower case input; Greek: an unaccented ι/υ/ει/οι before a vowel is the glide j — synizesis) */
  function phon(w, lang) {
    let x = String(w || '').toLowerCase().normalize('NFC');
    if (lang === 'el') {
      const d = x.normalize('NFD');
      // synizesis: [ι υ ει οι] without accent or diaeresis, before a vowel → j (Holton et al. 1997 §1.4.2); then drop the accents
      x = d.replace(/(ει|οι|ι|υ)(?![́̈])(?=[αεηιουω])/g, (m, g, off) => (off > 0 && 'αεο'.includes(d[off - 1]) && g.length === 1 ? m : 'J')).replace(/\p{M}/gu, '').replace(/ς/g, 'σ');
      for (const [re, r] of PHON.el) x = x.replace(re, r);
      return x.replace(/J/g, 'j');
    }
    if (lang !== 'fr' && lang !== 'de' && lang !== 'es' && lang !== 'it') x = x.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
    if (lang === 'de') x = x.normalize('NFC');
    for (const [re, r] of PHON[lang] || PHON.other) x = x.replace(re, r);
    return x.normalize('NFD').replace(/\p{M}/gu, '').replace(/['’ʼ-]/g, '');
  }
  const isV = c => KV.includes(c);
  /** the rime of a key: from its last vowel group to the end ('nation' → 'Sion' … 'ion'); null without a vowel */
  function rimeOf(k) { let i = k.length - 1; while (i >= 0 && !isV(k[i])) i--; if (i < 0) return null; while (i > 0 && isV(k[i - 1])) i--; return k.slice(i); }
  const vowelsOf = k => (k.match(new RegExp('[' + KV + ']+', 'g')) || []);
  const codaOf = k => { const m = k.match(new RegExp('[^' + KV + ']+$')); return m ? m[0] : ''; };
  function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 3; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
  /** soundFigures(A, lang) → hits {type, sent, toks}: rhyme (the last words of two clauses ≤ 2 apart share the rime, words differ);
      assonance (≥ 3 content words within 6 tokens of a clause share a stressed-or-not vowel sound and not one rime); consonance (≥ 3
      content words within 6 tokens share a final consonant sound and not their first letter: that is alliteration); paronomasia (two
      different content words of a sentence, ≥ 4 letters, not one stem, whose keys differ by one edit) */
  function soundFigures(A, lang) {
    const { toks, sents } = A, hits = [], stop = STOPSET[lang] || STOPSET.other, key = new Map();
    const K = i => { if (!key.has(i)) key.set(i, phon(toks[i].s, lang)); return key.get(i); };
    const content = i => !toks[i].filler && !stop.has(toks[i].f) && /\p{L}/u.test(toks[i].f);
    const add = (type, ti) => { if (hits.length < 4000) hits.push({ type, sent: toks[ti[0]].sent, toks: ti }); };
    const clauses = []; sents.forEach(s => s.clauses.forEach(c => { const w = c.filter(i => !toks[i].filler); if (w.length) clauses.push(w); }));
    const used = new Set();
    for (let k = 0; k < clauses.length; k++) for (let j = k + 1; j <= k + 2 && j < clauses.length; j++) {
      const a = clauses[k][clauses[k].length - 1], b = clauses[j][clauses[j].length - 1];
      if (used.has(b) || toks[a].f === toks[b].f) continue;
      const ra = rimeOf(K(a)), rb = rimeOf(K(b));
      if (ra && rb && ra === rb && (ra.length >= 2 || codaOf(ra) === '')) { add('rhyme', [a, b]); used.add(b); break; }
    }
    for (const c of clauses) {
      const cw = c.filter(content);
      let doneA = false, doneC = false;
      for (let p = 0; p + 2 < cw.length && !(doneA && doneC); p++) {
        const win = cw.filter(i => i >= cw[p] && i - cw[p] <= 6);
        if (win.length < 3) continue;
        if (!doneA) {
          const cnt = new Map(); for (const i of win) for (const v of new Set(vowelsOf(K(i)))) cnt.set(v, (cnt.get(v) || []).concat([i]));
          for (const [, is] of cnt) if (is.length >= 3 && new Set(is.map(i => toks[i].f)).size >= 3 && new Set(is.map(i => rimeOf(K(i)))).size > 1) { add('assonance', is.slice(0, 6)); doneA = true; break; }
        }
        if (!doneC) {
          const cnt = new Map(); for (const i of win) { const co = codaOf(K(i)); if (co) cnt.set(co, (cnt.get(co) || []).concat([i])); }
          for (const [, is] of cnt) if (is.length >= 3 && new Set(is.map(i => toks[i].f)).size >= 3 && new Set(is.map(i => K(i)[0])).size > 1) { add('consonance', is.slice(0, 6)); doneC = true; break; }
        }
      }
    }
    sents.forEach(s => {
      const cw = s.toks.filter(i => content(i) && toks[i].f.length >= 4);
      outer: for (let p = 0; p < cw.length; p++) for (let q = p + 1; q < cw.length && q < p + 12; q++) {
        const a = toks[cw[p]].f, b = toks[cw[q]].f;
        if (a === b || prefix(a, b) >= Math.max(4, Math.ceil(0.6 * Math.max(a.length, b.length)))) continue;
        const ka = K(cw[p]), kb = K(cw[q]);
        if (ka !== kb && Math.min(ka.length, kb.length) >= 3 && lev(ka, kb) === 1) { add('paronomasia', [cw[p], cw[q]]); break outer; }
      }
    });
    return hits;
  }

  /* ---------- trope CANDIDATES by explicit cues (never a judgement of meaning: each hit names its cue, docs/library/rhetoric.md §6.3)
     simile: a comparison marker between two content words (like, as … as, as if; σαν, όπως, λες και; wie, als ob; comme, tel;
     как, словно, будто; como, cual; come, quasi) — Lanham 1991; Israel, Harding & Tobin 2004 on simile markers;
     metaphor: a signalling expression (so to speak, metaphorically, figuratively, literally, as it were, a kind of … — Goatly 1997,
     The Language of Metaphors ch. 6) or the structure "X copula DET N of" (the genitive metaphor "A is the B of C", Brooke-Rose 1958);
     irony: an irony marker (so-called, yeah right, oh great …; δήθεν, τάχα; sogenannt, na toll; soi-disant; так называемый, ну конечно;
     el llamado; cosiddetto — Attardo 2000 on irony markers; Burgers, van Mulken & Schellens 2012) or scare quotes around 1–3 words
     or "?!" (Kreuz 1996). A candidate is a place to look, never a proof. */
  const TROPES = ['simile', 'metaphor', 'irony'];
  const TROPE_CUES = {
    en: { simile: ['like', 'as if', 'as though', 'as * as'], metaphor: ['so to speak', 'metaphorically', 'figuratively', 'literally', 'as it were', 'a kind of', 'a sort of', 'in a sense', 'in a way'], irony: ['so-called', 'so called', 'yeah right', 'oh great', 'oh wonderful', 'just great', 'what a surprise', 'how convenient', 'thanks a lot'], copula: ['is', 'are', 'was', 'were'], det: ['a', 'an', 'the'], of: ['of'], pron: ['i', 'you', 'we', 'they', "don't", 'would', 'feel', 'looks', 'look'] },
    el: { simile: ['σαν', 'σα', 'όπως', 'λες και', 'σάμπως', 'καθώς'], metaphor: ['μεταφορικά', 'κατά κάποιον τρόπο', 'ας πούμε', 'κυριολεκτικά', 'ένα είδος', 'που λέμε'], irony: ['δήθεν', 'τάχα', 'τάχατες', 'μπράβο σου', 'τι ωραία', 'πολύ ωραία'], copula: ['είναι', 'ήταν'], det: ['ο', 'η', 'το', 'οι', 'τα', 'ένας', 'μια', 'μία', 'ένα'], of: [], pron: [] },
    de: { simile: ['wie', 'als ob', 'gleich wie', 'gleichsam'], metaphor: ['sozusagen', 'gewissermaßen', 'bildlich gesprochen', 'im übertragenen sinn', 'buchstäblich', 'eine art'], irony: ['sogenannte', 'sogenannter', 'sogenannten', 'sogenanntes', 'na toll', 'na super', 'wie schön', 'vielen dank auch'], copula: ['ist', 'sind', 'war', 'waren'], det: ['der', 'die', 'das', 'ein', 'eine'], of: [], pron: [] },
    fr: { simile: ['comme', 'tel', 'telle', 'tels', 'telles', 'pareil à', 'ainsi que', 'semblable à'], metaphor: ['pour ainsi dire', 'au sens figuré', 'métaphoriquement', 'littéralement', 'une sorte de', 'une espèce de'], irony: ['soi-disant', 'prétendu', 'prétendue', 'quelle surprise', 'merci bien', 'bravo'], copula: ['est', 'sont', 'était', 'étaient'], det: ['le', 'la', 'les', 'un', 'une', 'l'], of: ['de', 'du', 'des'], pron: [] },
    ru: { simile: ['как', 'словно', 'будто', 'точно', 'подобно', 'как будто', 'как бы'], metaphor: ['так сказать', 'в переносном смысле', 'образно говоря', 'буквально', 'своего рода', 'в некотором смысле'], irony: ['так называемый', 'так называемая', 'так называемое', 'так называемые', 'ну конечно', 'ну спасибо', 'да уж'], copula: ['есть', 'это'], det: [], of: [], pron: [] },
    es: { simile: ['como', 'cual', 'igual que', 'tal como', 'como si'], metaphor: ['por así decirlo', 'en sentido figurado', 'metafóricamente', 'literalmente', 'una especie de', 'una suerte de'], irony: ['el llamado', 'la llamada', 'supuesto', 'supuesta', 'qué bien', 'sí, claro', 'qué sorpresa'], copula: ['es', 'son', 'era', 'eran'], det: ['el', 'la', 'los', 'las', 'un', 'una'], of: ['de', 'del'], pron: [] },
    it: { simile: ['come', 'quasi', 'simile a', 'pari a', 'come se'], metaphor: ['per così dire', 'in senso figurato', 'metaforicamente', 'letteralmente', 'una specie di', 'una sorta di'], irony: ['cosiddetto', 'cosiddetta', 'cosiddetti', 'cosiddette', 'che bello', 'sì, certo', 'grazie tante'], copula: ['è', 'sono', 'era', 'erano'], det: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una'], of: ['di', 'del', 'della'], pron: [] },
    other: { simile: [], metaphor: [], irony: [], copula: [], det: [], of: [], pron: [] },
  };
  /** tropes(A, lang, text) → candidate hits {type, sent, toks, cue} */
  function tropes(A, lang, text) {
    const { toks, sents } = A, hits = [], T = TROPE_CUES[lang] || TROPE_CUES.other, stop = STOPSET[lang] || STOPSET.other;
    const content = i => i >= 0 && i < toks.length && !toks[i].filler && !stop.has(toks[i].f) && /\p{L}/u.test(toks[i].f);
    const add = (type, ti, cue) => { if (hits.length < 4000) hits.push({ type, sent: toks[ti[0]].sent, toks: ti, cue }); };
    const words = s => [...String(s).normalize('NFC').matchAll(TOK)].map(q => fold(q[0]));
    const F = new Set();
    const match = (s, phrase) => {   // the token positions where a cue phrase (words, '*' = any one word) starts inside sentence s
      const ws = words(phrase), out = [];
      for (let k = 0; k + ws.length <= s.toks.length; k++) if (ws.every((w, j) => w === '*' || toks[s.toks[k + j]].f === w)) out.push(k);
      return { ws, out };
    };
    const cs = new Set((T.copula || []).map(fold)), ds = new Set((T.det || []).map(fold)), ofs = new Set((T.of || []).map(fold)), pr = new Set((T.pron || []).map(fold));
    sents.forEach(s => {
      for (const type of TROPES) for (const cue of T[type]) {
        const { ws, out } = match(s, cue);
        for (const k of out) {
          const at = s.toks.slice(k, k + ws.length);
          if (F.has(type + at[0])) continue;
          if (type === 'simile') {
            const before = s.toks.slice(0, k).filter(content), after = s.toks.slice(k + ws.length).filter(content);
            if (!before.length || !after.length) continue;
            if (lang === 'en' && cue === 'like' && k > 0 && pr.has(toks[s.toks[k - 1]].f)) continue;   // "I like", "would like", "looks like" are not similes
          }
          F.add(type + at[0]); add(type, at, cue); break;
        }
      }
      // the genitive metaphor: copula DET content-word OF
      for (let k = 0; k + 3 < s.toks.length; k++) {
        const t = j => toks[s.toks[k + j]].f;
        if (cs.has(t(0)) && (ds.has(t(1)) || !ds.size) && content(s.toks[k + (ds.size ? 2 : 1)]) && ofs.size && ofs.has(t(ds.size ? 3 : 2)) && !F.has('metaphor' + s.toks[k])) { F.add('metaphor' + s.toks[k]); add('metaphor', s.toks.slice(k, k + 4), 'X is the Y of Z'); }
      }
    });
    // scare quotes around 1–3 words and "?!" (irony markers), found in the raw text and mapped to their tokens
    const t = String(text || '').normalize('NFC');
    for (const q of t.matchAll(/["“«„]([^"”»“\n]{1,60})["”»“]/gu)) {
      const n = [...q[1].matchAll(TOK)].length; if (n < 1 || n > 3) continue;
      const i0 = toks.findIndex(x => x.i >= q.index); if (i0 < 0) continue;
      add('irony', [i0], 'scare quotes');
    }
    for (const q of t.matchAll(/(\?!|!\?|‽)/gu)) { let i0 = -1; for (let i = 0; i < toks.length; i++) if (toks[i].i < q.index) i0 = i; if (i0 >= 0) add('irony', [i0], q[0]); }
    return hits;
  }

  /* =====================================================================================================================
     2. Delivery from timings: [[start, end] per token] (a forced aligner's output), pauses ≥ threshold (Goldman-Eisler 1968: 250 ms) */
  function delivery(A, sp, thr, codes) {
    const toks = A.toks, words = toks.filter(x => !x.filler).length, fill = toks.length - words;
    const T = Array.isArray(sp.timing) ? sp.timing : null;
    let dur = NaN, speak = NaN; const pauses = [];
    if (T) {
      if (T.length !== toks.length) codes.push('timing_mismatch');
      else {
        let mono = true; for (let i = 1; i < T.length; i++) if (T[i][0] < T[i - 1][1] - 1e-9) mono = false;
        if (!mono) codes.push('timing_order');
        if (T.length) {
          dur = T[T.length - 1][1] - T[0][0];
          for (let i = 1; i < T.length; i++) { const g = T[i][0] - T[i - 1][1]; if (g >= thr) pauses.push(g); }
          speak = dur - pauses.reduce((a, b) => a + b, 0);
        }
      }
    }
    return { words, fill, T: T && T.length === toks.length ? T : null, dur, speak, pauses };
  }
  function nPVI(xs) { if (xs.length < 2) return NaN; let s = 0; for (let i = 1; i < xs.length; i++) { const a = xs[i - 1], b = xs[i]; s += a + b > 0 ? Math.abs(a - b) / ((a + b) / 2) : 0; } return 100 * s / (xs.length - 1); }   // Grabe & Low 2002
  function meanSd(xs) { const n = xs.length; if (!n) return [NaN, NaN]; const m = xs.reduce((a, b) => a + b, 0) / n; if (n < 2) return [m, NaN]; return [m, Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1))]; }
  /** Kendall's τ-a between two rankings (Kendall 1938): (concordant − discordant) / (n(n−1)/2); ties count neither */
  function kendall(a, b) { const n = a.length; if (n < 2) return NaN; let c = 0, d = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = Math.sign(a[i] - a[j]) * Math.sign(b[i] - b[j]); if (s > 0) c++; else if (s < 0) d++; } return (c - d) / (n * (n - 1) / 2); }

  /* =====================================================================================================================
     3. Logic, from logic@1 (never re-implemented here) */
  const LG = () => NoemaLibLogic;   // logic@1: afSolve, parse, atomsOf, evalProp, rowsOf, syllogism, source (docs/library/logic.md §9)
  const strip = a => JSON.stringify(a, (k, v) => (k === 'pos' ? undefined : v));
  /** a propositional form: valid by truth table (logic@1 parse / atomsOf / rowsOf / evalProp); the first counterexample row; the named
      formal fallacy when the form is affirming the consequent or denying the antecedent (a premise p→q with q, resp. ¬p, ⊢ p, resp. ¬q) */
  function propForm(f, codes) {
    const L = LG();
    const ps = [], all = [...f.premises, f.conclusion];
    for (const x of all) { const r = L.parse(String(x), 'prop'); if (!r || !r.ok) { codes.push('parse'); if (r && r.code) codes.push(r.code); return null; } ps.push(r.ast); }
    const atoms = ps.reduce((o, a) => L.atomsOf(a, o), []);
    if (atoms.length > 12) { codes.push('too_many_atoms'); return null; }
    const prem = ps.slice(0, -1), concl = ps[ps.length - 1];
    let counter = null;
    for (const v of L.rowsOf(atoms)) if (prem.every(p => L.evalProp(p, v)) && !L.evalProp(concl, v)) { counter = v; break; }
    let fal = counter ? 'invalid_form' : 'none';
    if (counter) {
      const S = strip;
      for (const p of prem) if (p.t === 'imp') {
        const others = prem.filter(q => q !== p).map(S);
        if (others.includes(S(p.b)) && S(concl) === S(p.a)) { fal = 'affirming_consequent'; break; }
        if (others.includes(S({ t: 'not', a: p.a })) && S(concl) === S({ t: 'not', a: p.b })) { fal = 'denying_antecedent'; break; }
      }
    }
    return { valid: counter ? 0 : 1, counter, atoms, fal };
  }
  /** a categorical syllogism: valid by Venn regions (logic@1 syllogism), and the medieval rule it breaks (distribution: A distributes the
      subject, E both, I none, O the predicate; Copi & Cohen, Introduction to Logic, ch. 6) */
  const FIG = { 1: [['M', 'P'], ['S', 'M']], 2: [['P', 'M'], ['S', 'M']], 3: [['M', 'P'], ['M', 'S']], 4: [['P', 'M'], ['M', 'S']] };
  const DIST = { A: [1, 0], E: [1, 1], I: [0, 0], O: [0, 1] };
  function sylForm(f, codes) {
    const L = LG();
    const m = f.mood.split(''), ex = !!f.existential, r = L.syllogism(f.mood, f.figure, ex), pr = FIG[f.figure];
    if (r.valid) return { valid: 1, fal: 'none' };
    const dist = (k, term) => { const [x, y] = k === 2 ? ['S', 'P'] : pr[k]; return (x === term && DIST[m[k]][0]) || (y === term && DIST[m[k]][1]) ? 1 : 0; };
    const neg = t => t === 'E' || t === 'O';
    let fal = 'invalid_form';
    if (!dist(0, 'M') && !dist(1, 'M')) fal = 'undistributed_middle';
    else if (dist(2, 'P') && !dist(0, 'P')) fal = 'illicit_major';
    else if (dist(2, 'S') && !dist(1, 'S')) fal = 'illicit_minor';
    else if (neg(m[0]) && neg(m[1])) fal = 'exclusive_premises';
    else if ((neg(m[0]) || neg(m[1])) !== neg(m[2])) fal = 'negative_mismatch';
    else if (!ex && L.syllogism(f.mood, f.figure, true).valid) fal = 'existential_fallacy';
    return { valid: 0, fal };
  }

  /* =====================================================================================================================
     4. The argument map: Dung semantics over attack + undercut edges (logic@1 afSolve), weighing, fallacies of moves */
  function mapInfo(MP, ev, codes) {
    const nodes = arr(MP.nodes).filter(isObj), idx = new Map(nodes.map((n, i) => [n.id, i])), n = nodes.length;
    const edges = arr(MP.edges).filter(e => isObj(e) && idx.has(e.from) && idx.has(e.to)).map(e => ({ a: idx.get(e.from), b: idx.get(e.to), k: e.kind || 'support' }));
    const att = edges.filter(e => e.k === 'attack' || e.k === 'undercut').map(e => [e.a, e.b]);
    let af = null;
    const solve = () => {
      if (af) return af;
      const L = LG();
      if (n > 24) codes.push('large_map');
      const D = new Set(); af = L.afSolve(n, att, D); for (const c of D) codes.push(c); return af;
    };
    return { nodes, idx, n, edges, att, solve };
  }
  function supportCycle(I, i) {   // is node i on a cycle of support edges (begging the question)?
    const seen = new Set(), stack = [i];
    while (stack.length) { const x = stack.pop(); for (const e of I.edges) if (e.k === 'support' && e.a === x) { if (e.b === i) return true; if (!seen.has(e.b)) { seen.add(e.b); stack.push(e.b); } } }
    return false;
  }
  function nodeFallacy(I, i, ev) {
    const x = I.nodes[i];
    if (supportCycle(I, i)) return 'begging_question';
    if (typeof x.misrepresents === 'string') return 'straw_man';
    const out = I.edges.filter(e => e.a === i && e.k !== 'support');
    if (x.offTopic && I.edges.some(e => e.a === i)) return 'red_herring';
    if (out.some(e => I.nodes[e.b].kind === 'person')) return x.scheme === 'circumstantial' ? 'tu_quoque' : 'ad_hominem';
    if (isNum(x.options) && isNum(x.alternatives) && x.options < x.alternatives) return 'false_dilemma';
    if (x.scheme === 'slope' && arr(x.steps).length) { const p = slopeP(x, ev); if (p < 0.5) return 'slippery_slope'; }
    const sc = SCHEMES[x.scheme];
    if (sc) { const cq = arr(x.cq); for (let k = 0; k < cq.length; k++) if (cq[k] === 0 && sc.fail[k]) return sc.fail[k]; }
    return 'none';
  }
  const slopeP = (x, ev) => arr(x.steps).reduce((p, s) => p * Math.min(1, Math.max(0, ev(s, NaN))), 1);   // Hahn & Oaksford 2007: a chain is as strong as the product of its links

  /* =====================================================================================================================
     5. The debate round */
  function slotsOf(D) {
    if (D.format === 'custom') return arr(D.slots).filter(isObj).map(s => S(s.role, s.side, s.min, { poi: !!s.poi, protect: isNum(s.protect) ? s.protect : 0, reply: !!s.reply, cx: !!s.cx }));
    return (FORMAT[D.format] || FORMAT.bp).slots;
  }
  function round(spec, ev, codes) {
    const m = spec.model || {}, D = m.debate || {}, F = FORMAT[D.format] || null, slots = slotsOf(D);
    const teams = arr(D.teams).filter(isObj), tIdx = new Map(teams.map((t, i) => [t.id, i]));
    const speeches = arr(m.speeches).filter(isObj);
    const grace = isNum(D.grace) ? D.grace : 0;
    const sp = speeches.map((s, i) => {
      const slot = slots.find(x => x.role === s.role) || null, T = Array.isArray(s.timing) && s.timing.length && Array.isArray(s.timing[0]) ? s.timing : null, dur = s.dur !== undefined ? ev(s.dur, NaN) : T ? T[T.length - 1][1] - T[0][0] : NaN, lim = slot ? slot.min * 60 : NaN, c = [];
      const team = tIdx.has(s.team) ? teams[tIdx.get(s.team)] : null, side = s.side || (team && team.side) || (slot && slot.side) || 'none';
      let viol = 0;
      if (!slot) c.push('no_slot');
      if (slot && team && team.side !== slot.side) { c.push('side_mismatch'); viol++; }
      if (isNum(dur) && isNum(lim) && dur > lim + grace) { c.push('overtime'); viol++; }
      const pois = arr(s.pois).filter(isObj).map(p => ({ at: ev(p.at, NaN), by: p.by, ok: !!p.accepted }));
      let prot = 0;
      for (const p of pois) {
        if (slot && !slot.poi) { c.push('poi_not_allowed'); viol++; continue; }
        if (slot && isNum(p.at) && isNum(lim) && (p.at < slot.protect || p.at > lim - slot.protect)) { prot++; c.push('poi_protected'); viol++; }
        const bt = tIdx.has(p.by) ? teams[tIdx.get(p.by)] : null;
        if (bt && sideSign(bt.side) === sideSign(side) && sideSign(side) !== 0) { c.push('poi_own_side'); viol++; }
      }
      if (slot && slot.reply && D.format === 'wsdc') {   // WSDC: the reply is given by the side's first or second speaker
        const firsts = speeches.filter(q => q.team === s.team && ['P1', 'P2', 'O1', 'O2'].includes(q.role)).map(q => q.speaker);
        if (typeof s.speaker === 'string' && firsts.length && !firsts.includes(s.speaker)) { c.push('reply_speaker'); viol++; }
      }
      return { s, i, slot, dur, lim, side, team, pois, prot, viol, codes: c };
    });
    // ballots
    const [lo, hi] = Array.isArray(D.score) && D.score.length === 2 ? D.score : F ? F.score : [0, 100];
    const rlo = F && F.reply ? F.reply[0] : lo / 2, rhi = F && F.reply ? F.reply[1] : hi / 2;
    const ballots = arr(D.ballots).filter(isObj).map(b => {
      const c = [], tot = new Array(teams.length).fill(0), has = new Array(teams.length).fill(false);
      const scoreOf = new Map();
      for (const x of arr(b.scores).filter(isObj)) {
        const q = sp.find(z => z.s.id === x.speech), v = ev(x.pts, NaN); if (!q || !isNum(v)) continue;
        scoreOf.set(x.speech, v);
        const reply = q.slot && q.slot.reply;
        if (reply ? v < rlo || v > rhi : v < lo || v > hi) c.push('score_range');
        if (q.team && tIdx.has(q.team.id)) { tot[tIdx.get(q.team.id)] += v; has[tIdx.get(q.team.id)] = true; }
      }
      let rank = null;   // rank[i] of team i (1 best)
      const rk = arr(b.ranks).filter(isObj);
      if (rk.length) {
        rank = new Array(teams.length).fill(NaN);
        for (const r of rk) if (tIdx.has(r.team)) rank[tIdx.get(r.team)] = Math.round(ev(r.rank, NaN));
        const vals = rank.filter(isNum), okR = vals.length === teams.length && new Set(vals).size === vals.length && vals.every(v => v >= 1 && v <= teams.length);
        if (!okR) { c.push('ranks'); rank = null; }
      } else if (typeof b.winner === 'string' && tIdx.has(b.winner)) {
        rank = teams.map((t, i) => (i === tIdx.get(b.winner) ? 1 : 2));
        if (teams.length > 2) rank = null;
      } else if (has.some(Boolean)) {   // from the totals (a WSDC or LD ballot without a stated winner)
        const order = teams.map((t, i) => i).sort((a, z) => tot[z] - tot[a]);
        if (order.length >= 2 && tot[order[0]] === tot[order[1]]) c.push('tie');
        else { rank = new Array(teams.length); order.forEach((t, k) => { rank[t] = k + 1; }); }
      }
      // consistency with the speaker points: BP (no low-point wins, totals strictly ordered) and WSDC (the higher total wins, no draws)
      let consistent = 1, lpw = 0;
      if (rank && has.every(Boolean)) {
        for (let a = 0; a < teams.length; a++) for (let z = 0; z < teams.length; z++) if (rank[a] < rank[z] && tot[a] <= tot[z]) { if (tot[a] < tot[z]) lpw = 1; consistent = 0; }
        if (!consistent && !['bp', 'wsdc'].includes(D.format)) { consistent = 1; }   // LD / policy / Popper / custom: a low-point win is allowed (but shown)
        if (!consistent) c.push(lpw ? 'low_point_win' : 'tie');
        else if (lpw) c.push('low_point_win');
      }
      return { b, round: b.round || 1, rank, tot, has, consistent, lpw, scoreOf, codes: c };
    });
    return { D, F, slots, teams, tIdx, sp, ballots };
  }
  /** the panel's decision for a round: chair (the chair's ballot), borda (3-2-1-0 summed; ties by the chair), majority (pairwise majority
      of the judges, Copeland scores, ties and cycles broken by the chair: code cycle). Two-team formats: the majority of ballots. */
  function panel(R, rd, codes) {
    const bs = R.ballots.filter(x => x.round === rd && x.rank);
    const nT = R.teams.length;
    if (!bs.length) { codes.push('no_ballots'); return null; }
    const chair = bs.find(x => x.b.chair) || bs[0];
    const method = R.D.panel || (nT > 2 ? 'majority' : 'majority');
    let score;
    if (method === 'chair') score = chair.rank.map(r => -r);
    else if (method === 'borda') score = R.teams.map((t, i) => bs.reduce((a, x) => a + (nT - x.rank[i]), 0));
    else {
      score = new Array(nT).fill(0);
      for (let a = 0; a < nT; a++) for (let z = 0; z < nT; z++) if (a !== z) { const w = bs.filter(x => x.rank[a] < x.rank[z]).length, l = bs.filter(x => x.rank[a] > x.rank[z]).length; if (w > l) score[a] += 1; else if (w === l) { score[a] += chair.rank[a] < chair.rank[z] ? 0.5 : 0; if (nT === 2) codes.push('split'); } }
      if (nT > 2 && new Set(score).size < nT) codes.push('cycle');
    }
    const order = R.teams.map((t, i) => i).sort((a, z) => score[z] - score[a] || chair.rank[a] - chair.rank[z]);
    const rank = new Array(nT); order.forEach((t, k) => { rank[t] = k + 1; });
    const speaks = R.teams.map((t, i) => { const v = bs.filter(x => x.has[i]).map(x => x.tot[i]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; });
    const ballotsFor = R.teams.map((t, i) => bs.filter(x => x.rank[i] === 1).length);
    return { rank, speaks, ballotsFor, n: bs.length };
  }
  const teamPoints = (nT, rank) => (nT === 4 ? 4 - rank : rank === 1 ? 1 : 0);   // BP: 3-2-1-0 (WUDC); two teams: a win is 1

  /* =====================================================================================================================
     6. run */
  function prepare(spec) { return { cache: new Map(), text: new Map(), figs: new Map() }; }
  function run(spec, env, opts) {
    const prep = (opts && opts.prepared) || prepare(spec), cache = prep.cache;
    const ev = (v, d) => { if (v === undefined || v === null) return d; if (typeof v === 'number') return v; let f = cache.get(v); if (!f) { f = C.cx(v); cache.set(v, f); } return f(env); };
    const m = (spec && spec.model) || {}, codes = [], code = (id, c) => { if (!codes.some(x => x.id === id && x.code === c)) codes.push({ id, code: c }); };
    const speeches = arr(m.speeches).filter(isObj);
    const spOf = id => speeches.find(s => s.id === id) || speeches[0] || null;
    const lang0 = m.lang || 'en';
    const extra = isObj(m.delivery) ? arr(m.delivery.fillers) : [];
    const thr = () => ev(isObj(m.delivery) ? m.delivery.pause : undefined, 0.25);
    const textOf = s => { let r = prep.text.get(s.id); if (!r) { r = analyse(typeof s.text === 'string' ? s.text : '', s.lang || lang0, extra); prep.text.set(s.id, r); } return r; };
    const figsOf = s => { let r = prep.figs.get(s.id); if (!r) { r = figures(textOf(s), s.lang || lang0); prep.figs.set(s.id, r); } return r; };
    const soundsOf = s => { let r = prep.figs.get('♪' + s.id); if (!r) { r = soundFigures(textOf(s), s.lang || lang0); prep.figs.set('♪' + s.id, r); } return r; };
    const tropesOf = s => { let r = prep.figs.get('τ' + s.id); if (!r) { r = tropes(textOf(s), s.lang || lang0, typeof s.text === 'string' ? s.text : ''); prep.figs.set('τ' + s.id, r); } return r; };
    const syn = m.synizesis === true;
    let R = null; const RD = () => { if (!R) { const cs = []; R = round(spec, ev, cs); } return R; };
    let MI = null; const mapCodes = []; const MAPI = () => { if (!MI) MI = mapInfo(m.map || {}, ev, mapCodes); return MI; };
    const solveMap = id => { const af = MAPI().solve(); for (const c of mapCodes) code(id, c); return af; };
    const out = {};
    const NaNs = o => (o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN);
    for (const o of arr(spec && spec.outputs)) {
      if (!isObj(o)) continue;
      try { out[o.id] = one(o); } catch (e) { out[o.id] = NaNs(o); code(o.id, 'error'); }
    }
    return { out, codes };

    function speechStats(o, s) {
      const A = textOf(s), lang = s.lang || lang0, cs = [], d = delivery(A, s, thr(), cs); cs.forEach(c => code(o.id, c));
      if (!A.toks.length) code(o.id, 'empty');
      if (A.toks.length && !A.hasEnd) code(o.id, 'no_sentences');
      const dur = isNum(d.dur) ? d.dur : ev(s.dur, NaN);
      return { A, lang, d, dur };
    }
    function one(o) {
      const of = o.of;
      // ----- speech texts -----
      if (NEEDS.speeches.includes(of) && !NEEDS.audience.includes(of)) {
        const s = spOf(o.speech); if (!s) { code(o.id, 'no_speech'); return NaNs(o); }
        const { A, lang, d, dur } = speechStats(o, s), words = A.toks.filter(x => !x.filler);
        const sl = A.sents.map(x => x.words);
        const needT = () => { if (!d.T) { code(o.id, 'no_timing'); return false; } return true; };
        switch (of) {
          case 'words': return d.words;
          case 'sentences': return A.sents.length;
          case 'clauses': return A.sents.reduce((a, x) => a + x.clauses.length, 0);
          case 'syllables': return words.reduce((a, x) => a + syllables(x.s, lang, syn), 0);
          case 'duration': if (!isNum(dur)) code(o.id, 'no_duration'); return dur;
          case 'wpm': if (!(dur > 0)) { code(o.id, 'no_duration'); return NaN; } return d.words / (dur / 60);
          case 'articulation': if (!needT()) return NaN; return d.speak > 0 ? d.words / (d.speak / 60) : NaN;
          case 'pauses': if (!needT()) return NaN; return d.pauses.length;
          case 'pauseRate': if (!needT()) return NaN; return d.dur > 0 ? d.pauses.length / (d.dur / 60) : NaN;
          case 'meanPause': if (!needT()) return NaN; return d.pauses.length ? d.pauses.reduce((a, b) => a + b, 0) / d.pauses.length : 0;
          case 'longestPause': if (!needT()) return NaN; return d.pauses.length ? Math.max(...d.pauses) : 0;
          case 'fillers': return d.fill;
          case 'fillerRate': return d.words ? 100 * d.fill / d.words : NaN;
          case 'meanSentence': return meanSd(sl)[0];
          case 'sdSentence': { const v = meanSd(sl)[1]; if (!isNum(v)) code(o.id, 'few_sentences'); return v; }
          case 'cvSentence': { const [mu, sd] = meanSd(sl); if (!isNum(sd)) code(o.id, 'few_sentences'); return sd / mu; }
          case 'npvi': { const v = nPVI(sl); if (!isNum(v)) code(o.id, 'few_sentences'); return v; }
          case 'questions': return A.sents.filter(x => x.end === '?').length;
          case 'readability': { const cs = []; const v = readability(words.map(x => x.s), A.sents.length, lang, o.formula, cs, syn); cs.forEach(c => code(o.id, c)); return v; }
          case 'sound': case 'trope': { const hs = (of === 'sound' ? soundsOf : tropesOf)(s).filter(h => h.type === o.type); if (of === 'trope' && hs.length) code(o.id, 'candidate'); return hs.length; }
          case 'soundAt': case 'tropeAt': { const n = Math.round(ev(o.sentence, NaN)); if (!(n >= 1 && n <= A.sents.length)) { code(o.id, 'no_sentence'); return NaN; } return (of === 'soundAt' ? soundsOf : tropesOf)(s).some(h => h.type === o.type && h.sent === n - 1) ? 1 : 0; }
          case 'soundsBySentence': case 'tropesBySentence': { const c = new Array(Math.min(2000, A.sents.length)).fill(0); for (const h of (of === 'soundsBySentence' ? soundsOf : tropesOf)(s)) if (h.type === o.type && h.sent < c.length) c[h.sent]++; return c; }
          case 'sounds': return figScene(A, soundsOf(s), o.type);
          case 'tropes': return figScene(A, tropesOf(s), o.type, true);
          case 'figure': return figsOf(s).filter(h => h.type === o.type).length;
          case 'figureAt': { const n = Math.round(ev(o.sentence, NaN)); if (!(n >= 1 && n <= A.sents.length)) { code(o.id, 'no_sentence'); return NaN; } return figsOf(s).some(h => h.type === o.type && h.sent === n - 1) ? 1 : 0; }
          case 'sentenceLengths': return sl.slice(0, 2000);
          case 'sentenceAxis': return sl.slice(0, 2000).map((_, i) => i + 1);
          case 'figuresBySentence': { const c = new Array(Math.min(2000, A.sents.length)).fill(0); for (const h of figsOf(s)) if (h.type === o.type && h.sent < c.length) c[h.sent]++; return c; }
          case 'rateCurve': case 'timeAxis': {
            if (!needT()) return [];
            const W = Math.max(1, ev(isObj(m.delivery) ? m.delivery.window : undefined, 30)), T = d.T, t0 = T[0][0], t1 = T[T.length - 1][1];
            const K = Math.min(200, Math.max(2, Math.ceil((t1 - t0) / (W / 4)) + 1)), xs = [], ys = [];
            const starts = T.map(p => p[0]), lex = A.toks.map(x => !x.filler);
            for (let k = 0; k < K; k++) { const t = t0 + (t1 - t0) * k / (K - 1), a = Math.max(t0, t - W), span = Math.max(1e-9, t - a); let n = 0; for (let i = 0; i < starts.length; i++) if (lex[i] && starts[i] >= a && starts[i] <= t) n++; xs.push(t); ys.push(k === 0 ? NaN : n / (span / 60)); }
            return of === 'timeAxis' ? xs : ys;
          }
          case 'pauseLengths': if (!needT()) return []; return d.pauses.slice(0, 2000);
          case 'figures': return figScene(A, figsOf(s), o.type);
          case 'timing': return timingScene(s, A, d, dur, o);
        }
      }
      if (NEEDS.audience.includes(of)) {
        const s = spOf(o.speech), Au = m.audience || {}; if (!s) { code(o.id, 'no_speech'); return NaN; }
        const { A, lang, d, dur } = speechStats(o, s), words = A.toks.filter(x => !x.filler).map(x => x.s);
        const cs = [], g = readability(words, A.sents.length, lang, Au.formula || 'fk', cs, syn); cs.forEach(c => code(o.id, c));
        const gap = g - ev(Au.grade, NaN), wpm = dur > 0 ? d.words / (dur / 60) : NaN, lo = ev(Au.wpmLo, 140), hi = ev(Au.wpmHi, 170);
        const rg = !isNum(wpm) ? NaN : wpm < lo ? wpm - lo : wpm > hi ? wpm - hi : 0;
        if (!isNum(wpm)) code(o.id, 'no_duration');
        if (of === 'gradeGap') return gap;
        if (of === 'rateGap') return rg;
        const tol = ev(Au.tol, 1);
        if (!isNum(rg)) return NaN;
        if (Au.grade === undefined) return rg === 0 ? 1 : 0;
        return isNum(gap) ? (Math.abs(gap) <= tol && rg === 0 ? 1 : 0) : NaN;
      }
      // ----- the debate round -----
      if (NEEDS.debate.includes(of)) {
        const R = RD();
        if (['limit', 'overtime', 'poiOffered', 'poiAccepted', 'poiProtected', 'violations'].includes(of)) {
          const sel = o.speech ? R.sp.filter(q => q.s.id === o.speech) : R.sp;
          for (const q of sel) for (const c of q.codes) if (of === 'violations' || c === 'no_slot' || (of === 'overtime' && c === 'overtime') || (of === 'poiProtected' && c === 'poi_protected')) code(o.id, c);
          if (of === 'limit') return sel.length ? sel[0].lim : NaN;
          if (of === 'overtime') { const q = sel[0]; if (!q) return NaN; if (!isNum(q.dur)) code(o.id, 'no_duration'); return q.dur - q.lim; }
          if (of === 'poiOffered') return sel.reduce((a, q) => a + q.pois.length, 0);
          if (of === 'poiAccepted') return sel.reduce((a, q) => a + q.pois.filter(p => p.ok).length, 0);
          if (of === 'poiProtected') return sel.reduce((a, q) => a + q.prot, 0);
          return sel.reduce((a, q) => a + q.viol, 0);
        }
        if (of === 'durations') return R.sp.map(q => q.dur);
        if (of === 'limits') return R.sp.map(q => q.lim);
        if (of === 'speechAxis') return R.sp.map((q, i) => i + 1);
        if (of === 'swing') {
          const pc = v => { const a = ev(v.for, NaN), b = ev(v.against, NaN), u = ev(v.undecided, 0), t = a + b + u; if (!(t > 0)) return null; if (Math.abs(t - 100) > 1e-6) code(o.id, 'vote_sum'); return { for: 100 * a / t, against: 100 * b / t }; };
          const D = R.D; if (!isObj(D.pre) || !isObj(D.post)) { code(o.id, 'no_vote'); return NaN; }
          const p0 = pc(D.pre), p1 = pc(D.post); if (!p0 || !p1) { code(o.id, 'no_vote'); return NaN; }
          return p1[o.side] - p0[o.side];
        }
        if (of === 'consistent') { const bs = o.ballot ? R.ballots.filter(x => x.b.id === o.ballot) : R.ballots; for (const x of bs) x.codes.forEach(c => code(o.id, c)); return bs.length ? (bs.every(x => x.consistent) ? 1 : 0) : NaN; }
        if (of === 'lpw') { const x = R.ballots.find(z => z.b.id === o.ballot); if (!x) return NaN; x.codes.forEach(c => code(o.id, c)); return x.lpw; }
        if (of === 'tab') {
          const rounds = [...new Set(R.ballots.map(x => x.round))].sort((a, b) => a - b), pts = R.teams.map(() => 0), spk = R.teams.map(() => 0);
          for (const rd of rounds) { const cs = []; const pn = panel(R, rd, cs); if (!pn) continue; R.teams.forEach((t, i) => { pts[i] += teamPoints(R.teams.length, pn.rank[i]); spk[i] += isNum(pn.speaks[i]) ? pn.speaks[i] : 0; }); }
          const order = R.teams.map((t, i) => i).sort((a, b) => pts[b] - pts[a] || spk[b] - spk[a] || a - b);
          const i = R.tIdx.get(o.team); return i === undefined ? NaN : order.indexOf(i) + 1;
        }
        if (of === 'speaks' && o.speech) {
          const bs = (o.ballot ? R.ballots.filter(x => x.b.id === o.ballot) : R.ballots.filter(x => x.round === (o.round || 1))).filter(x => x.scoreOf.has(o.speech));
          return bs.length ? bs.reduce((a, x) => a + x.scoreOf.get(o.speech), 0) / bs.length : NaN;
        }
        if (of === 'points' && !o.round) {
          const rounds = [...new Set(R.ballots.map(x => x.round))]; let p = 0; const i = R.tIdx.get(o.team);
          for (const rd of rounds) { const cs = []; const pn = panel(R, rd, cs); cs.forEach(c => code(o.id, c)); if (pn && i !== undefined) p += teamPoints(R.teams.length, pn.rank[i]); }
          return i === undefined ? NaN : p;
        }
        // a ballot or the panel of a round
        let rank, speaks, bfor;
        if (o.ballot) { const x = R.ballots.find(z => z.b.id === o.ballot); if (!x) return NaN; x.codes.forEach(c => code(o.id, c)); if (!x.rank) return NaN; rank = x.rank; speaks = x.tot.map((v, i) => (x.has[i] ? v : NaN)); bfor = rank.map(r => (r === 1 ? 1 : 0)); }
        else { const cs = []; const pn = panel(R, o.round || 1, cs); cs.forEach(c => code(o.id, c)); if (!pn) return NaN; rank = pn.rank; speaks = pn.speaks; bfor = pn.ballotsFor; }
        const i = R.tIdx.get(o.team);
        switch (of) {
          case 'rank': return i === undefined ? NaN : rank[i];
          case 'points': return i === undefined ? NaN : teamPoints(R.teams.length, rank[i]);
          case 'speaks': return i === undefined ? NaN : speaks[i];
          case 'ballotsFor': return i === undefined ? NaN : bfor[i];
          case 'winner': { const w = rank.indexOf(1); return w >= 0 ? w + 1 : NaN; }
          case 'winnerSide': { const w = rank.indexOf(1); return w >= 0 ? sideSign(R.teams[w].side) : NaN; }
          case 'margin': { const w = rank.indexOf(1), l = rank.indexOf(R.teams.length); return w >= 0 && l >= 0 ? speaks[w] - speaks[l] : NaN; }
        }
      }
      // ----- the argument map -----
      if (NEEDS.map.includes(of) || ((of === 'fallacy' || of === 'fallacies') && m.map && (o.node || of === 'fallacies'))) {
        const I = MAPI(), ni = o.node !== undefined ? I.idx.get(o.node) : undefined;
        const semLab = (sem, k) => { const af = solveMap(o.id); if (!af) return null; if (sem === 'grounded' || !sem) return af.grounded; const L = af[sem] || []; if (!L.length) { code(o.id, 'no_extension'); return null; } return L[Math.min(L.length, Math.max(1, k || 1)) - 1]; };
        switch (of) {
          case 'label': { const l = semLab(o.semantics, o.ext); return l && ni !== undefined ? l[ni] : NaN; }
          case 'accepted': {
            const af = solveMap(o.id); if (!af || ni === undefined) return NaN;
            const sem = o.semantics || 'grounded'; if (sem === 'grounded') return af.grounded[ni] === 1 ? 1 : 0;
            const L = af[sem] || []; if (!L.length) { code(o.id, 'no_extension'); return 0; }
            return (o.mode === 'credulous' ? L.some(l => l[ni] === 1) : L.every(l => l[ni] === 1)) ? 1 : 0;
          }
          case 'extensions': { const af = solveMap(o.id); if (!af) return NaN; return (o.semantics || 'grounded') === 'grounded' ? 1 : (af[o.semantics] || []).length; }
          case 'inCount': { const l = semLab(o.semantics, 1); if (!l) return NaN; return I.nodes.filter((x, k) => l[k] === 1 && (!o.side || x.side === o.side)).length; }
          case 'netBenefit': case 'weighedWinner': {
            const af = solveMap(o.id); if (!af) return NaN;
            const tau = ev(o.tau, Infinity); let sum = 0, any = false;
            I.nodes.forEach((x, k) => { if (af.grounded[k] !== 1 || x.impact === undefined) return; const g = sideSign(x.side); if (!g) return; const mag = ev(x.impact, NaN), p = ev(x.prob, 1), t = ev(x.time, 0); if (![mag, p, t].every(isNum)) { code(o.id, 'weigh_value'); return; } if (p < 0 || p > 1) code(o.id, 'range'); any = true; sum += g * mag * Math.min(1, Math.max(0, p)) * (isFinite(tau) && tau > 0 ? Math.exp(-t / tau) : 1); });
            if (!any) code(o.id, 'no_impacts');
            if (of === 'netBenefit') return sum;
            if (sum === 0) { code(o.id, 'presumption'); return -1; }   // presumption: the negative (status quo) wins a tie (policy debate)
            return Math.sign(sum);
          }
          case 'dropped': {   // an argument of one side made in speech k, not attacked by a node of the other side made in a later speech
            const order = new Map(speeches.map((s, k) => [s.id, k]));
            let n = 0;
            I.nodes.forEach((x, k) => {
              if (o.side && x.side !== o.side) return;
              if (!order.has(x.speech) || !sideSign(x.side) || x.kind === 'person') return;
              const at = order.get(x.speech);
              const later = speeches.some((s, j) => j > at && sideSign(nodeSideOfSpeech(s)) === -sideSign(x.side));
              if (!later) return;
              const answered = I.edges.some(e => e.b === k && e.k !== 'support' && e.k !== 'except' && sideSign(I.nodes[e.a].side) === -sideSign(x.side) && (!order.has(I.nodes[e.a].speech) || order.get(I.nodes[e.a].speech) > at));
              if (!answered) n++;
            });
            return n;
          }
          case 'clash': return I.edges.filter(e => (e.k === 'attack' || e.k === 'undercut') && sideSign(I.nodes[e.a].side) * sideSign(I.nodes[e.b].side) < 0).length;
          case 'toulmin': if (o.kind === 'scene') return toulminScene(I, ni); if (ni === undefined) return NaN; return toulminParts(I, ni).count;
          case 'stockMet': case 'primaFacie': {
            const af = solveMap(o.id); if (!af) return NaN;
            const met = STOCK.filter(st => I.nodes.some((x, k) => x.stock === st && sideSign(x.side) > 0 && af.grounded[k] === 1)).length;
            return of === 'stockMet' ? met : met === STOCK.length ? 1 : 0;
          }
          case 'cqOpen': case 'cqFailed': {
            if (ni === undefined) return NaN; const x = I.nodes[ni], sc = SCHEMES[x.scheme]; if (!sc) { code(o.id, 'no_scheme'); return NaN; }
            const cq = arr(x.cq); let open = 0, failed = 0; for (let k = 0; k < sc.cq; k++) { const v = k < cq.length ? cq[k] : -1; if (v === -1) open++; if (v === 0) failed++; }
            return of === 'cqOpen' ? open : failed;
          }
          case 'slope': { if (ni === undefined) return NaN; const x = I.nodes[ni]; if (!arr(x.steps).length) { code(o.id, 'no_steps'); return NaN; } return slopeP(x, ev); }
          case 'fallacy': return ni === undefined ? NaN : FIDX[nodeFallacy(I, ni, ev)];
          case 'fallacies': {
            let n = I.nodes.filter((x, k) => nodeFallacy(I, k, ev) !== 'none').length;
            for (const f of arr(m.forms).filter(isObj)) { const cs = []; const r = formOf(f, cs); cs.forEach(c => code(o.id, c)); if (r && r.fal !== 'none') n++; }
            return n;
          }
          case 'map': return mapScene(I, o);
          case 'flow': return flowScene(I, o);
          case 'bipolarLabel': case 'bipolarAccepted': case 'complexAttacks': {
            // bipolar argumentation through logic@1 (Cayrol & Lagasquie-Schiex 2005, 2013): support edges with attack + undercut edges
            const L = LG(), sup = I.edges.filter(e => e.k === 'support').map(e => [e.a, e.b]), B = L.bipolar(I.n, I.att, sup, o.support || 'general');
            if (of === 'complexAttacks') return B.att.length - Object.values(B.kind).filter(k => k === 'direct').length;
            if (I.n > 24) code(o.id, 'large_map');
            const D = new Set(), af = L.afSolve(I.n, B.att, D); for (const c of D) code(o.id, c);
            if (ni === undefined) return NaN;
            const sem = o.semantics || 'grounded', Ls = sem === 'grounded' ? [af.grounded] : af[sem] || [];
            if (!Ls.length) { code(o.id, 'no_extension'); return of === 'bipolarAccepted' ? 0 : NaN; }
            if (of === 'bipolarLabel') return Ls[Math.min(Ls.length, Math.max(1, o.ext || 1)) - 1][ni];
            return (o.mode === 'credulous' ? Ls.some(l => l[ni] === 1) : Ls.every(l => l[ni] === 1)) ? 1 : 0;
          }
        }
      }
      if (of === 'schemeCQs') return SCHEMES[o.scheme] ? SCHEMES[o.scheme].cq : NaN;
      // ----- ASPIC+ structured argumentation through logic@1 (Modgil & Prakken 2014): the theory's arguments, defeats, justified conclusions -----
      if (NEEDS.theory.includes(of)) {
        const L = LG(), Th = m.theory, A = L.aspic({ kb: arr(Th.kb).filter(isObj), rules: arr(Th.rules).filter(isObj), contraries: arr(Th.contraries).filter(isObj).map(c => [c.u, c.v]) }, { link: Th.link, ordering: Th.ordering, transpose: Th.transpose });
        A.codes.forEach(c => code(o.id, c));
        if (of === 'aspicArgs') return A.n;
        if (of === 'aspicDefeats') return A.defeats.length;
        const D = new Set(), af = L.afSolve(A.n, A.att, D); for (const c of D) code(o.id, c);
        const sem = o.semantics || 'grounded', Ls = sem === 'grounded' ? [af.grounded] : af[sem] || [];
        if (!Ls.length) code(o.id, 'no_extension');
        if (of === 'postulates') { const p = A.postulates(Ls); const okAll = p.subClosed && p.strictClosed && p.directConsistent && p.indirectConsistent; if (!okAll) code(o.id, 'postulate'); return okAll ? 1 : 0; }
        if (of === 'justified') {
          const g = L.litOf(String(o.concl)), has = l => A.args.some((a, i) => l[i] === 1 && a.conc === g);
          if (!Ls.length) return 0;
          return (o.mode === 'credulous' ? Ls.some(has) : Ls.every(has)) ? 1 : 0;
        }
        if (of === 'aspic') {
          const lab = Ls[0] || A.args.map(() => 0.5), n = A.n, sc = C.scene([-4.5, 4.5, -4.5, 4.5]);
          const xy = i => [3.5 * Math.cos(Math.PI / 2 - 2 * Math.PI * i / Math.max(1, n)), 3.5 * Math.sin(Math.PI / 2 - 2 * Math.PI * i / Math.max(1, n))];
          for (const [u, v] of A.att.slice(0, 600)) { const [x1, y1] = xy(u), [x2, y2] = xy(v); sc.seg(x1, y1, x2, y2, { c: 'muted', arrow: true }); }
          A.args.slice(0, 200).forEach((a, i) => { const [x, y] = xy(i); sc.pt(x, y, { r: 6, c: lab[i] === 1 ? 'ok' : lab[i] === 0 ? 'bad' : 'warn', s: (a.conc[0] === '-' ? '¬' + a.conc.slice(1) : a.conc).slice(0, RAW_MAX) }); });
          return sc.done();
        }
      }
      // ----- forms -----
      if (of === 'valid' || of === 'counter' || of === 'fallacy' || of === 'fallacies') {
        if (of === 'fallacies') { let n = 0; for (const f of arr(m.forms).filter(isObj)) { const cs = []; const r = formOf(f, cs); cs.forEach(c => code(o.id, c)); if (r && r.fal !== 'none') n++; } return n; }
        const f = arr(m.forms).find(x => isObj(x) && x.id === o.form); if (!f) return NaN;
        const cs = []; const r = formOf(f, cs); cs.forEach(c => code(o.id, c)); if (!r) return NaN;
        if (of === 'valid') return r.valid;
        if (of === 'fallacy') return FIDX[r.fal];
        if (!r.counter) { if (r.valid) code(o.id, 'valid'); return NaN; }
        return Object.prototype.hasOwnProperty.call(r.counter, o.atom) ? (r.counter[o.atom] ? 1 : 0) : (code(o.id, 'no_atom'), NaN);
      }
      // ----- orders -----
      if (NEEDS.outline.includes(of)) {
        const Ol = m.outline, canon = ORDERS[Ol.scheme] || [], parts = arr(Ol.parts).filter(isObj);
        const pos = parts.map(p => ev(p.pos, NaN)), can = parts.map(p => canon.indexOf(p.part));
        if (!pos.every(isNum)) { code(o.id, 'no_position'); return NaN; }
        if (new Set(pos).size < pos.length) code(o.id, 'tie');
        if (of === 'kendall') return kendall(pos, can);
        const byPos = parts.map((p, i) => i).sort((a, b) => pos[a] - pos[b] || a - b), byCan = parts.map((p, i) => i).sort((a, b) => can[a] - can[b] || a - b);
        const mis = byPos.filter((x, k) => can[x] !== can[byCan[k]]).length;
        if (of === 'misplaced') return mis;
        return mis === 0 && new Set(pos).size === pos.length ? 1 : 0;
      }
      if (of === 'stasis') { const St = m.stasis; for (let k = 0; k < ORDERS.stasis.length; k++) { const v = ev(St[ORDERS.stasis[k]], 1); if (!(v >= 0.5)) return k + 1; } return 0; }
      // ----- ELM (Petty & Cacioppo 1986), as a teaching model: E = motivation × ability; Δ = E · quality + (1 − E) · cue -----
      if (NEEDS.elm.includes(of)) {
        const El = m.elm, cl = (v, a, b) => { if (!(v >= a && v <= b)) code(o.id, 'range'); return Math.min(b, Math.max(a, v)); };
        const mo = cl(ev(El.motivation, NaN), 0, 1), ab = cl(ev(El.ability, NaN), 0, 1), q = cl(ev(El.quality, NaN), -1, 1), cu = cl(ev(El.cue, NaN), -1, 1), E = mo * ab;
        if (![mo, ab, q, cu].every(isNum)) return o.kind === 'series' ? [] : NaN;
        if (o.kind === 'series') { const xs = C.thin(Array.from({ length: 51 }, (_, k) => k / 50), 51); return xs.map(x => (of === 'elmAxis' ? x : of === 'elmCentral' ? x * ab * q : of === 'elmPeripheral' ? (1 - x * ab) * cu : x * ab * q + (1 - x * ab) * cu)); }
        switch (of) { case 'elaboration': return E; case 'central': return E * q; case 'peripheral': return (1 - E) * cu; case 'attitude': return E * q + (1 - E) * cu; case 'route': return E >= 0.5 ? 1 : 0; }
      }
      // ----- inoculation (McGuire 1961; Banas & Rains 2010): r(t) = r0 e^(−(t − last booster)/τ); attitude after an attack A·(1 − r) -----
      if (NEEDS.inoculation.includes(of)) {
        const In = m.inoculation, r0 = ev(In.r0, 0.5), tau = ev(In.tau, 14), A = ev(In.attack, 1), bo = arr(In.boosters).map(b => ev(b, NaN)).filter(isNum).sort((a, b) => a - b);
        if (!(r0 >= 0 && r0 <= 1)) code(o.id, 'range');
        if (!(tau > 0)) { code(o.id, 'range'); return o.kind === 'series' ? [] : NaN; }
        const r = t => { if (t < 0) return 0; let last = 0; for (const b of bo) if (b <= t && b >= 0) last = b; return Math.min(1, Math.max(0, r0)) * Math.exp(-(t - last) / tau); };
        if (o.kind === 'series') { const H = ev(In.horizon, 60), K = 200, xs = Array.from({ length: K }, (_, k) => H * k / (K - 1)); return of === 'inocT' ? xs : xs.map(r); }
        const t = ev(o.at, NaN); if (!isNum(t)) return NaN;
        return of === 'resistance' ? r(t) : A * (1 - r(t));
      }
      code(o.id, 'output'); return NaNs(o);
    }
    function nodeSideOfSpeech(s) { const R0 = m.debate ? RD() : null; const q = R0 ? R0.sp.find(z => z.s.id === s.id) : null; return q ? q.side : s.side || 'none'; }
    function formOf(f, cs) { if (f.mood !== undefined) return sylForm(f, cs); return propForm(f, cs); }

    /* ---------- scenes ---------- */
    function mapScene(I, o) {
      const n = I.n; if (!n) return { view: [-1, 1, -1, 1], items: [] };
      // layers: a node's level = 1 + the level of what it supports / attacks (roots: nodes with no outgoing edge), bounded for cycles
      const lvl = new Array(n).fill(0);
      for (let it = 0; it < n; it++) { let ch = false; for (const e of I.edges) if (lvl[e.a] < lvl[e.b] + 1 && lvl[e.b] + 1 <= n) { lvl[e.a] = lvl[e.b] + 1; ch = true; } if (!ch) break; }
      const rows = new Map(); lvl.forEach((l, i) => { if (!rows.has(l)) rows.set(l, []); rows.get(l).push(i); });
      const X = new Array(n), Y = new Array(n), wMax = Math.max(...[...rows.values()].map(r => r.length));
      for (const [l, r] of rows) r.forEach((i, k) => { X[i] = (k - (r.length - 1) / 2) * 22; Y[i] = -l * 14; });
      const af = solveMap(o.id);
      const lab = af ? (o.semantics && o.semantics !== 'grounded' ? ((af[o.semantics] || [])[0] || null) : af.grounded) : null;
      const sc = C.scene([-wMax * 11 - 12, wMax * 11 + 12, -Math.max(...lvl) * 14 - 8, 8]);
      for (const e of I.edges) sc.seg(X[e.a], Y[e.a] + 3, X[e.b], Y[e.b] - 3, { arrow: true, c: e.k === 'support' ? 'ok' : e.k === 'except' ? 'muted' : 'bad', dash: e.k === 'undercut' || e.k === 'except' ? true : undefined });
      I.nodes.forEach((x, i) => {
        const c = lab ? (lab[i] === 1 ? 'ok' : lab[i] === 0 ? 'bad' : 'warn') : 'base';
        sc.poly([X[i] - 10, Y[i] - 3, X[i] + 10, Y[i] - 3, X[i] + 10, Y[i] + 3, X[i] - 10, Y[i] + 3], { closed: true, c, fill: false });
        sc.txt(X[i], Y[i], x.s ? { s: String(x.s).slice(0, RAW_MAX), anchor: 'middle' } : x.label ? { key: x.label, anchor: 'middle' } : { s: x.id, anchor: 'middle' });
      });
      return sc.done();
    }
    function flowScene(I, o) {
      const order = speeches.map(s => s.id), cols = Math.max(1, order.length);
      const sc = C.scene([-2, cols * 24 + 2, -Math.min(40, I.n + 2) * 8 - 4, 10]);
      order.forEach((id, k) => { const s = speeches[k]; sc.txt(k * 24 + 11, 6, s.label ? { key: s.label, anchor: 'middle' } : { s: s.role || id, anchor: 'middle' }); sc.seg(k * 24 + 23, 8, k * 24 + 23, -Math.min(40, I.n + 2) * 8, { c: 'muted' }); });
      const row = new Map(), pos = new Map(); let r = 0;
      const answered = new Set(I.edges.filter(e => e.k !== 'support' && e.k !== 'except').map(e => e.b));
      I.nodes.forEach((x, i) => {
        const k = order.indexOf(x.speech); if (k < 0 || r >= 40) return;
        const tgt = I.edges.find(e => e.a === i && e.k !== 'support'); const y = tgt && row.has(tgt.b) ? row.get(tgt.b) : -(++r) * 8;
        row.set(i, y); pos.set(i, [k * 24 + 11, y]);
        const later = speeches.some((s, j) => j > k && sideSign(nodeSideOfSpeech(s)) === -sideSign(x.side));
        sc.txt(k * 24 + 11, y, Object.assign(x.s ? { s: String(x.s).slice(0, RAW_MAX) } : x.label ? { key: x.label } : { s: x.id }, { anchor: 'middle', c: !answered.has(i) && later && sideSign(x.side) ? 'warn' : sideSign(x.side) > 0 ? 'info' : 'base' }));
      });
      for (const e of I.edges) if (e.k !== 'support' && pos.has(e.a) && pos.has(e.b)) { const [x1, y1] = pos.get(e.a), [x2, y2] = pos.get(e.b); sc.seg(x1 - 10, y1 + 1.5, x2 + 10, y2 + 1.5, { arrow: true, c: 'bad' }); }
      return sc.done();
    }
  }
  function toulminParts(I, ci) {
    const into = (i, kinds) => I.edges.filter(e => e.b === i && kinds.includes(I.nodes[e.a].kind) && e.k !== 'attack' && e.k !== 'undercut').map(e => e.a);
    const data = into(ci, ['data', 'premise']), warrant = into(ci, ['warrant']), qual = into(ci, ['qualifier']);
    const rebut = I.edges.filter(e => e.b === ci && (e.k === 'except' || I.nodes[e.a].kind === 'rebuttal')).map(e => e.a);
    const backing = warrant.flatMap(w => into(w, ['backing']));
    const count = 1 + [data, warrant, backing, qual, rebut].filter(a => a.length).length;
    return { data, warrant, qual, rebut, backing, count };
  }
  /** Toulmin 1958 layout: D → (so, Q) C; "since W" under the arrow, "on account of B" under W; "unless R" under Q */
  function toulminScene(I, ci) {
    const sc = C.scene([-6, 106, -62, 14]);
    if (ci === undefined) return sc.done();
    const T = toulminParts(I, ci), lab = i => { const x = I.nodes[i]; return x.s ? { s: String(x.s).slice(0, RAW_MAX) } : x.label ? { key: x.label } : { s: x.id }; };
    const box = (x, y, w, i, c) => { sc.poly([x, y - 4, x + w, y - 4, x + w, y + 4, x, y + 4], { closed: true, c }); if (i !== undefined) sc.txt(x + w / 2, y, Object.assign(lab(i), { anchor: 'middle' })); };
    box(0, 0, 30, T.data[0], T.data.length ? 'base' : 'muted'); box(70, 0, 30, ci, 'hi');
    sc.seg(30, 0, 70, 0, { arrow: true });
    if (T.qual.length) box(38, 8, 24, T.qual[0], 'info');
    box(35, -18, 30, T.warrant[0], T.warrant.length ? 'base' : 'muted'); sc.seg(50, -14, 50, 0, { c: 'muted' });
    box(35, -36, 30, T.backing[0], T.backing.length ? 'base' : 'muted'); sc.seg(50, -32, 50, -22, { c: 'muted' });
    box(70, -18, 30, T.rebut[0], T.rebut.length ? 'warn' : 'muted'); sc.seg(85, -14, 85, -4, { c: 'warn', dash: true });
    for (let k = 1; k < Math.min(T.data.length, 4); k++) box(0, -18 * k, 30, T.data[k], 'base');
    sc.txt(50, -50, { v: T.count });
    return sc.done();
  }
  function figScene(A, hits, type, cues) {
    const lines = [], hl = new Set(hits.filter(h => !type || h.type === type).flatMap(h => h.toks));
    for (let si = 0; si < A.sents.length && lines.length < 40; si++) {
      let line = [], len = 0, first = true;
      for (const i of A.sents[si].toks) {
        const w = A.toks[i].s.slice(0, RAW_MAX);
        if (len + w.length > RAW_MAX && line.length) { lines.push({ n: first ? si + 1 : 0, line }); first = false; line = []; len = 0; }
        line.push([i, len]); len += w.length + 1;
      }
      if (line.length) lines.push({ n: first ? si + 1 : 0, line });
    }
    const L = lines.slice(0, 40), sc = C.scene([-6, RAW_MAX + 2, -L.length * 4 - 2, 3]);
    L.forEach((ln, k) => {
      const y = -k * 4;
      if (ln.n) sc.txt(-2, y, { v: ln.n, c: 'muted', anchor: 'end' });
      for (const [i, x] of ln.line) sc.txt(x, y, { s: A.toks[i].s.slice(0, RAW_MAX), c: hl.has(i) ? 'hi' : A.toks[i].filler ? 'muted' : 'base', anchor: 'start' });
      if (cues && ln.n) { const cs = [...new Set(hits.filter(h => (!type || h.type === type) && h.sent === ln.n - 1).map(h => h.type + ': ' + h.cue))].join(' · '); if (cs) sc.txt(RAW_MAX + 1, y, { s: cs.slice(0, RAW_MAX), c: 'warn', anchor: 'start' }); }
    });
    return sc.done();
  }
  function timingScene(s, A, d, dur, o) {
    const T = d.T, end = T ? T[T.length - 1][1] : isNum(dur) ? dur : NaN;
    const sc = C.scene([-2, (isNum(end) ? end : 60) * 1.05 + 2, -12, 12]);
    if (!isNum(end)) return sc.done();
    if (T) { for (let i = 0; i < T.length && i < 1500; i++) sc.seg(T[i][0], 0, T[i][1], 0, { c: A.toks[i].filler ? 'warn' : 'base', w: 6 }); for (let i = 1; i < T.length && i < 1500; i++) if (T[i][0] - T[i - 1][1] >= 0.25) sc.seg(T[i - 1][1], -4, T[i][0], -4, { c: 'muted', w: 2 }); }
    else sc.seg(0, 0, end, 0, { c: 'base', w: 6 });
    return sc.done();
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  const API = Object.freeze({
    table: { model: TABLE, outputs: OUT },
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine,
    FORMAT, SCHEMES, FALLACIES, ORDERS, FIGURES, FORMULAS,
    analyse, figures, syllables, sylEn, readability, nPVI, kendall, propForm, sylForm, panel, round,
    // added: sound figures by phonetic keys, trope candidates by cues, Greek synizesis (syllables(w, 'el', true)); ASPIC+ / bipolar via logic@1
    SOUNDS, TROPES, TROPE_CUES, phon, rimeOf, soundFigures, tropes, sylEl,
  });
  export default API;
  /* i18n-ignore-end */
