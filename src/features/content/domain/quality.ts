/* noema-lite — the quality rules Q1–Q8 of a chapter (packs with subject.authoring.rules >= 2; rules.ts QUALITY, docs/PIPELINES.md
   §4, tools/CONTENT_SPEC.md) as specifications: one small rule per check id of QUALITY.checks, each with its own test
   (quality.test.ts), composed into qualitySpec. checkQuality(chapter, subject) runs them all and gives every issue with its
   level (error | warn) and its message "<chapter>: [<rule>] <what>". chapter.map = map/chNN.json, chapter.review = review/chNN.json. */
import { all, spec, type RuleIssue, type Spec } from '../../../contracts/rules/spec.ts';
import { QUALITY, type QualityCheck } from './rules.ts';
import { has, isObj, isStr, list, obj, objs, qv, s, type Obj } from './util.ts';

/** everything the rules read of one chapter, worked out once */
export interface QualityContext {
  readonly cid: string;
  readonly chapter: Obj;
  readonly exercises: readonly Obj[];
  readonly sections: readonly Obj[];
  readonly features: readonly string[];
  readonly hasMap: boolean;
  readonly map: Obj;
  readonly points: readonly Obj[];
  readonly learnables: readonly Obj[];
  readonly pointsById: ReadonlyMap<unknown, Obj>;
  readonly learnablesById: ReadonlyMap<unknown, Obj>;
  readonly fits: Obj;
  readonly unfit: Obj;
  readonly pictures: boolean;
  readonly sourceQuestions: ReadonlyMap<unknown, Obj>;
}

const V = QUALITY.vocab;
const CHECK = new Map(QUALITY.checks.map(c => [c.id, c]));
const C = (id: string): QualityCheck => {
  const c = CHECK.get(id);
  if (!c) throw new Error(`rules.ts QUALITY has no check ${id}`); // a programming error: quality.test.ts runs every rule
  return c;
};
const num = (x: number | undefined, dflt: number): number => x ?? dflt;
const pct = (x: number): string => String(Math.floor(x + 0.5));
const norm = (t: unknown): string =>
  s(t ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const sentences = (t: unknown): number =>
  s(t ?? '')
    .trim()
    .split(/[.!?;;。]+(?:\s+|$)/u)
    .filter(x => x.trim().length > 1).length;
/** the fields that hold no learner text */
export const QSKIP: ReadonlySet<string> = new Set([
  'id',
  'section',
  'src',
  'cite',
  'media',
  'lr',
  'think',
  'mode',
  'type',
  'tags',
  'regions',
  'targets',
  'kp',
  'with',
]);
/** every string of a value, except under the skipped keys */
export function* strings(x: unknown, skip: ReadonlySet<string>): Generator<string> {
  if (typeof x === 'string') yield x;
  else if (Array.isArray(x)) for (const v of x) yield* strings(v, skip);
  else if (isObj(x)) for (const [k, v] of Object.entries(x)) if (!skip.has(k)) yield* strings(v, skip);
}
const isPicType = (t: unknown): boolean => s(t ?? '').startsWith('img_');

/** the context of a chapter (its map may be missing: map.present says so, the other rules read an empty map) */
export function qualityContext(chapter: unknown, subject: unknown): QualityContext {
  const ch = obj(chapter),
    cid = ch.id == null ? '?' : s(ch.id);
  const exercises = objs(ch.exercises),
    sections = objs(ch.sections);
  const features = Object.entries(obj(obj(subject).features))
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);
  const hasMap = isObj(ch.map),
    map = obj(ch.map);
  const points = list(map.points) as Obj[],
    learnables = list(map.learnables) as Obj[];
  return {
    cid,
    chapter: ch,
    exercises,
    sections,
    features,
    hasMap,
    map,
    points,
    learnables,
    pointsById: new Map(points.filter(isObj).map(p => [p.id, p])),
    learnablesById: new Map(learnables.filter(isObj).map(l => [l.id, l])),
    fits: obj(map.fits),
    unfit: obj(map.unfit),
    pictures: exercises.some(e => isPicType(e.type)) || sections.some(x => objs(x.blocks).some(b => b.t === 'figure')),
    sourceQuestions: new Map(objs(map.sourceQuestions).map(q => [q.id, q])),
  };
}

/** a rule over the context: its issues are "<chapter> [rule] msg" with the rule's level (QUALITY.checks) */
const rule = (id: string, body: (c: QualityContext, add: (msg: string) => void) => void): Spec<QualityContext> =>
  spec(id, c => {
    const out: RuleIssue[] = [];
    body(c, message => out.push({ rule: id, at: c.cid, message }));
    return out;
  });
const pointField = (p: unknown, k: string): unknown => (isObj(p) ? p[k] : undefined);

/* ---------- the knowledge map (Q1) ---------- */
export const mapPresent = rule('map.present', (c, add) => {
  if (!c.hasMap) add(`no knowledge map (write map/${c.cid}.json before the exercises)`);
});
export const mapRefs = rule('map.refs', (c, add) => {
  let seen = new Set<unknown>();
  for (const p of c.points) {
    const pid = pointField(p, 'id');
    if (!pid || seen.has(pid)) add(`point id ${qv(pid)} missing or repeated`);
    seen.add(pid);
    if (!isStr(pointField(p, 'text'))) add(`${s(pid)}: needs its text`);
    if (!V.levels.includes(pointField(p, 'level') as string)) add(`${s(pid)}: level must be one of ${V.levels.join(', ')}`);
    for (const k of list(pointField(p, 'cats'))) if (!V.cats.includes(k as string)) add(`${s(pid)}: unknown category ${qv(k)}`);
    for (const w of list(pointField(p, 'with')))
      if (!c.pointsById.has(w) && !/^ch\d+-k/.test(s(w))) add(`${s(pid)}: with ${qv(w)} is not a knowledge point`);
    if (isObj(p) && 'taughtIn' in p && !isStr(p.taughtIn)) add(`${s(pid)}: taughtIn must name the earlier step or chapter`);
  }
  seen = new Set();
  for (const l of c.learnables) {
    const lid = pointField(l, 'id');
    if (!lid || seen.has(lid)) add(`learnable id ${qv(lid)} missing or repeated`);
    seen.add(lid);
    if (!list(pointField(l, 'kp')).length) add(`${s(lid)}: kp must list its knowledge points`);
    for (const k of list(pointField(l, 'kp'))) if (!c.pointsById.has(k)) add(`${s(lid)}: kp ${qv(k)} is not a point of the map`);
  }
});
export const mapExhaustive = rule('map.exhaustive', (c, add) => {
  const inlr = new Set(c.learnables.flatMap(l => list(pointField(l, 'kp'))));
  for (const p of c.points)
    if (!inlr.has(pointField(p, 'id')) && !pointField(p, 'taughtIn')) add(`${s(pointField(p, 'id'))}: in no learnable and no taughtIn`);
});

/* ---------- what fits the chapter (Q2) ---------- */
const KINDS = [
  { key: 'types', universe: V.types, field: 'type', rule: 'fit.types' },
  { key: 'focus', universe: V.tags, field: 'tags', rule: 'fit.focus' },
  { key: 'modes', universe: V.modes, field: 'mode', rule: 'mode.coverage' },
] as const;
const fitList = (c: QualityContext, key: string): unknown[] => [...list(c.fits[key])];
const valuesOf = (e: Obj, field: string): unknown[] => (field === 'tags' ? [...list(e.tags)] : [e[field]]);
/** the values that need no reason in unfit: what cannot fit (autoUnfit) and the opt-in values left out (optIn) */
function autoUnfit(c: QualityContext): Set<string> {
  const auto = new Set<string>();
  for (const [f, vals] of Object.entries(QUALITY.autoUnfit))
    if (!(f === 'pictures' ? c.pictures : c.features.includes(f))) for (const v of vals) auto.add(v);
  const types = fitList(c, 'types');
  for (const v of QUALITY.optIn.types ?? []) if (!types.includes(v)) auto.add(v);
  return auto;
}
export const fitDeclared = rule('fit.declared', (c, add) => {
  const auto = autoUnfit(c);
  for (const { key, universe, field } of KINDS) {
    const fv = fitList(c, key);
    for (const v of fv) if (!universe.includes(v as string)) add(`fits.${key}: unknown value ${qv(v)}`);
    for (const v of universe) {
      if (fv.includes(v) || auto.has(v)) continue;
      if (!isStr(c.unfit[v])) add(`${key} ${v}: put it in fits.${key} or give the reason in unfit.${v}`);
    }
    const used = new Set(c.exercises.flatMap(e => valuesOf(e, field)).filter(v => v != null));
    for (const v of [...used]
      .filter(v => !fv.includes(v))
      .map(s)
      .sort())
      if (universe.includes(v)) add(`${v} is used but not in fits.${key}`);
  }
});
const coverage = (id: 'fit.types' | 'fit.focus' | 'mode.coverage'): Spec<QualityContext> =>
  rule(id, (c, add) => {
    const k = KINDS.find(x => x.rule === id);
    if (!k) return;
    const chk = C(id);
    for (const v of fitList(c, k.key)) {
      const n = chk.minPerKind?.[s(v)] ?? num(chk.min, 0);
      const have = c.exercises.filter(e => (k.field === 'tags' ? list(e.tags).includes(v) : e[k.field] === v)).length;
      if (have < n) add(`${s(v)}: ${have} exercise(s), need >= ${n}`);
    }
  });
export const fitTypes = coverage('fit.types');
export const fitFocus = coverage('fit.focus');
export const modeCoverage = coverage('mode.coverage');

/* ---------- the mix (Q3) ---------- */
export const mixDifficulty = rule('mix.difficulty', (c, add) => {
  const N = c.exercises.length,
    chk = C('mix.difficulty');
  if (!N) return;
  for (const [d, p] of Object.entries(chk.target ?? {})) {
    const share = (100 * c.exercises.filter(e => String(e.difficulty) === d).length) / N;
    if (Math.abs(share - p) > num(chk.tol, 0)) add(`difficulty ${d}: ${pct(share)} %, need ${p} ± ${num(chk.tol, 0)} %`);
  }
});
export const mixThink = rule('mix.think', (c, add) => {
  const N = c.exercises.length,
    chk = C('mix.think');
  if (!N) return;
  const rec = (100 * c.exercises.filter(e => e.think === 'recall').length) / N;
  const app = (100 * c.exercises.filter(e => V.applyPlus.includes(e.think as string)).length) / N;
  const cri = c.exercises.filter(e => V.critical.includes(e.think as string)).length;
  if (rec > num(chk.recallMax, 100)) add(`recall ${pct(rec)} %, at most ${num(chk.recallMax, 100)} %`);
  if (app < num(chk.applyPlusMin, 0)) add(`apply or higher ${pct(app)} %, need >= ${num(chk.applyPlusMin, 0)} %`);
  if (cri < num(chk.criticalMin, 0))
    add(`critical thinking (analyze/evaluate/create) ${cri} exercise(s), need >= ${num(chk.criticalMin, 0)}`);
});
export const mixOrder = rule('mix.order', (c, add) => {
  const max = num(C('mix.order').maxInversions, 100);
  for (const x of c.sections) {
    const ds = c.exercises.filter(e => e.section === x.id).map(e => (typeof e.difficulty === 'number' ? e.difficulty : 0)),
      pairs = (ds.length * (ds.length - 1)) / 2;
    let inv = 0;
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if ((ds[i] ?? 0) > (ds[j] ?? 0)) inv++;
    if (pairs && (100 * inv) / pairs > max) add(`${s(x.id)}: put the easier exercises first`);
  }
});

/* ---------- every exercise: its learnable, provenance, explanation and self-contained text (Q4, Q5, Q6) ----------
   These rules are over one exercise of the chapter; eachExercise runs them exercise by exercise (the issues of one
   exercise stay together). */
export interface ExerciseContext {
  readonly c: QualityContext;
  readonly e: Obj;
}
const exRule = (id: string, body: (x: ExerciseContext, add: (msg: string) => void) => void): Spec<ExerciseContext> =>
  spec(id, x => {
    const out: RuleIssue[] = [];
    body(x, message => out.push({ rule: id, at: x.c.cid, message }));
    return out;
  });
export const lrLink = exRule('lr.link', ({ c, e }, add) => {
  if (!c.learnablesById.has(e.lr)) add(`${s(e.id)}: lr ${qv(e.lr)} is not a learnable of the map`);
  if (!V.think.includes(e.think as string)) add(`${s(e.id)}: think must be one of ${V.think.join(', ')}`);
  if (e.mode != null && !V.modes.includes(e.mode as string)) add(`${s(e.id)}: unknown mode ${qv(e.mode)}`);
});
export const citePresent = exRule('cite.present', ({ e }, add) => {
  if (!(isObj(e.cite) && isStr(e.cite.src))) add(`${s(e.id)}: cite {src, loc} missing`);
});
export const citedQuestion = exRule('source.questions', ({ c, e }, add) => {
  const ci = e.cite;
  if (isObj(ci) && isStr(ci.src) && ci.sq != null && !c.sourceQuestions.has(ci.sq))
    add(`${s(e.id)}: cite.sq ${qv(ci.sq)} is not a source question of the map`);
});
export const explainDepth = exRule('explain.depth', ({ e }, add) => {
  if (e.type === 'scenario') return;
  const chk = C('explain.depth'),
    ex = typeof e.explain === 'string' ? e.explain : '';
  if (ex.trim().length < num(chk.minChars, 0) || sentences(ex) < num(chk.minSentences, 0))
    add(`${s(e.id)}: the explanation is too short (why right, why the tempting wrong one is wrong)`);
});
const isChoice = (e: Obj): boolean => e.type === 'mcq' || e.type === 'odd';
const rightIndex = (e: Obj): number | null => {
  const opts = list(e.options);
  return Number.isInteger(e.answer) && (e.answer as number) >= 0 && (e.answer as number) < opts.length ? (e.answer as number) : null;
};
export const mcqWhy = exRule('mcq.why', ({ e }, add) => {
  if (!isChoice(e)) return;
  const why = e.why;
  if (!(Array.isArray(why) && why.length === list(e.options).length && why.every(isStr))) add(`${s(e.id)}: needs a why for every option`);
});
export const trivialAnswer = exRule('trivial.answer', ({ e }, add) => {
  const ai = rightIndex(e);
  if (ai == null || e.type !== 'mcq') return;
  const right = norm(list(e.options)[ai]);
  if (right.split(' ').filter(Boolean).length >= num(C('trivial.answer').minWords, 1) && norm(e.q).includes(right))
    add(`${s(e.id)}: the right option is written in the question`);
});
export const trivialLongest = exRule('trivial.longest', ({ e }, add) => {
  const ai = rightIndex(e),
    opts = list(e.options);
  if (ai == null || e.type !== 'mcq') return;
  const others = opts.filter((_, i) => i !== ai).map(o => String(o).length);
  if (others.length && String(opts[ai]).length >= num(C('trivial.longest').ratio, 1e9) * Math.max(...others))
    add(`${s(e.id)}: the right option is by far the longest`);
});
const patterns = (id: string): RegExp[] => (C(id).patterns ?? []).map(p => new RegExp(p, 'i'));
/** the first pointer at the source in a value's texts, as an issue message */
const pointer = (where: string, x: unknown, skip: ReadonlySet<string>): string | null => {
  const pats = patterns('self.contained');
  for (const t of strings(x, skip))
    for (const p of pats) {
      const hit = p.exec(t);
      if (hit) return `${where}: “${hit[0]}” points at the source; write the example or question out in full`;
    }
  return null;
};
export const exerciseContained = exRule('self.contained', ({ e }, add) => {
  const m = pointer(s(e.id), e, QSKIP);
  if (m) add(m);
});
/** the rules of one exercise, in the order its issues are listed */
export const EXERCISE_RULES: readonly Spec<ExerciseContext>[] = [
  lrLink,
  citePresent,
  citedQuestion,
  explainDepth,
  mcqWhy,
  trivialAnswer,
  trivialLongest,
  exerciseContained,
];
export const exerciseSpec: Spec<ExerciseContext> = all('quality.exercise', ...EXERCISE_RULES);
export const eachExercise = spec<QualityContext>('quality.exercises', c => c.exercises.flatMap(e => exerciseSpec.issues({ c, e })));

/** flashcards and theory blocks never point at the source either (Q5) */
export const selfContained = rule('self.contained', (c, add) => {
  for (const f of objs(c.chapter.flashcards)) {
    const m = pointer(f.id ? s(f.id) : 'flashcard', f, QSKIP);
    if (m) add(m);
  }
  const bskip = new Set([...QSKIP, 't', 'lang', 'code']);
  for (const x of c.sections)
    for (const b of objs(x.blocks))
      if (!['code', 'diagram', 'figure'].includes(b.t as string)) {
        const m = pointer(s(x.id), b, bskip);
        if (m) add(m);
      }
});
/** every source question of the map is complete, answered and cited (Q6) */
export const sourceQuestions = rule('source.questions', (c, add) => {
  const cited = new Set(c.exercises.filter(e => isObj(e.cite)).map(e => obj(e.cite).sq));
  for (const [qid, q] of c.sourceQuestions) {
    if (!(isStr(q.text) && isStr(q.answer))) add(`${s(qid)}: needs its full text and its checked answer`);
    if (!['source', 'claude'].includes(q.answerFrom as string))
      add(`${s(qid)}: answerFrom must be 'source' (the source's own solution) or 'claude' (solved here)`);
    else if (q.answerFrom === 'claude' && !isStr(q.check)) add(`${s(qid)}: solved here, so say in check how the answer was double-checked`);
    if (!cited.has(qid)) add(`${s(qid)}: no exercise cites it (cite.sq)`);
  }
});
export const exampleRestated = rule('example.restated', (c, add) => {
  const chk = C('example.restated'),
    xp = patterns('example.restated'),
    skip = new Set([...QSKIP, ...(chk.skip ?? [])]);
  for (const e of c.exercises) {
    let hit: RegExpExecArray | null = null;
    for (const t of strings(e, skip)) {
      for (const p of xp) {
        hit = p.exec(t);
        if (hit) break;
      }
      if (hit) break;
    }
    if (hit)
      add(
        `${s(e.id)}: “${hit[0]}” points at a lesson's example; write the example out in the exercise and ask a question that needs thinking about it`,
      );
  }
});

/* ---------- several facades of every learnable (Q4) ---------- */
const typesByLearnable = (c: QualityContext): Map<unknown, unknown[]> => {
  const m = new Map<unknown, unknown[]>();
  for (const e of c.exercises) {
    const a = m.get(e.lr) ?? [];
    a.push(e.type);
    m.set(e.lr, a);
  }
  return m;
};
export const lrFacades = rule('lr.facades', (c, add) => {
  const chk = C('lr.facades'),
    by = typesByLearnable(c),
    min = num(chk.min, 0),
    types = num(chk.types, 0);
  for (const lid of c.learnablesById.keys()) {
    const ts = by.get(lid) ?? [];
    if (ts.length < min || new Set(ts).size < types)
      add(`${s(lid)}: ${ts.length} exercise(s) in ${new Set(ts).size} type(s), need >= ${min} in >= ${types}`);
  }
});
export const catsFacades = rule('cats.facades', (c, add) => {
  const chk = C('cats.facades'),
    by = typesByLearnable(c),
    min = num(chk.min, 0),
    types = num(chk.types, 0);
  for (const p of c.points) {
    const cats = list(pointField(p, 'cats'));
    if (!cats.length || pointField(p, 'taughtIn')) continue;
    const pid = pointField(p, 'id');
    const ts = c.learnables.filter(l => list(pointField(l, 'kp')).includes(pid)).flatMap(l => by.get(pointField(l, 'id')) ?? []);
    if (ts.length < min || new Set(ts).size < types)
      add(`${s(pid)} (${cats.join(', ')}): ${ts.length} exercise(s) in ${new Set(ts).size} type(s), need >= ${min} in >= ${types}`);
  }
});

/* ---------- the theory: its tables and figures (Q7) ---------- */
export const theoryTables = rule('theory.tables', (c, add) => {
  const tabs = c.sections.flatMap(x => objs(x.blocks)).filter(b => b.t === 'table');
  for (const [k, need] of Object.entries(C('theory.tables').kinds ?? {})) {
    if (isStr(c.unfit['table.' + k])) continue;
    if (!tabs.some(b => b.kind === k && list(b.head).length >= need.cols && list(b.rows).length >= need.rows))
      add(`no ${k} table (a table block with kind '${k}', >= ${need.cols} columns and >= ${need.rows} rows): ${need.what}`);
  }
});
export const figureExplained = rule('figure.explained', (c, add) => {
  const min = num(C('figure.explained').minChars, 0);
  for (const x of c.sections) {
    const bs = objs(x.blocks);
    bs.forEach((b, i) => {
      if (!['figure', 'diagram', 'interactive'].includes(b.t as string)) return;
      const nx = bs[i + 1] ?? {};
      const txt = [
        ...strings(Object.fromEntries(Object.entries(nx).filter(([k]) => ['title', 'text', 'items'].includes(k))), new Set()),
      ].join(' ');
      if (!['p', 'list', 'callout'].includes(nx.t as string) || txt.length < min)
        add(
          `${s(x.id)}: the ${s(b.t)}${b.media ? ' ' + qv(b.media) : b.activity ? ' ' + qv(b.activity) : ''} is not explained right after it (what it shows, how to read it, what it teaches)`,
        );
    });
  }
});
export const sequenceArrows = rule('sequence.arrows', (c, add) => {
  const sw = obj(c.map.sequenceWhy);
  for (const e of c.exercises)
    if (e.type === 'img_sequence' && !isStr(has(sw, s(e.media)) ? sw[s(e.media)] : undefined))
      add(
        `${s(e.id)}: img_sequence on ${qv(e.media)}: if its arrows already show the order, use another type; else say why in map.sequenceWhy`,
      );
});

/* ---------- the second pass (Q8) ---------- */
export const reviewDone = rule('review.done', (c, add) => {
  const r = c.chapter.review,
    N = c.exercises.length;
  if (!isObj(r)) {
    add(`no second-pass review (review/${c.cid}.json)`);
    return;
  }
  const rub = new Set(
      objs(r.rubric)
        .filter(x => c.learnablesById.has(x.lr))
        .map(x => x.lr),
    ),
    need = Math.min(num(C('review.done').rubricMin, 0), c.learnablesById.size);
  if (rub.size < need) add(`the rubric covers ${rub.size} learnable(s), need ${need}`);
  const b = obj(r.blind);
  if (!Number.isInteger(b.solved) || (b.solved as number) < N)
    add(`blind re-solve: ${typeof b.solved === 'number' ? b.solved : s(b.solved ?? 0)} of ${N} exercises solved`);
  const open = list(b.mismatches)
    .filter(x => !(isObj(x) && x.fixed === true))
    .map(x => (isObj(x) ? x.id : undefined));
  if (open.length)
    add(
      `blind re-solve: mismatches not fixed: ${open
        .slice(0, 8)
        .map(x => (x == null ? '' : s(x)))
        .join(', ')}`,
    );
});

/** every rule, in the order the issues are listed */
export const QUALITY_RULES: readonly Spec<QualityContext>[] = [
  mapPresent,
  mapRefs,
  mapExhaustive,
  fitDeclared,
  fitTypes,
  fitFocus,
  modeCoverage,
  mixDifficulty,
  mixThink,
  mixOrder,
  eachExercise,
  selfContained,
  lrFacades,
  catsFacades,
  sourceQuestions,
  theoryTables,
  exampleRestated,
  figureExplained,
  sequenceArrows,
  reviewDone,
];
export const qualitySpec: Spec<QualityContext> = all('quality', ...QUALITY_RULES);

export interface QualityIssue {
  readonly level: 'error' | 'warn';
  readonly rule: string;
  readonly msg: string;
}
/** checkQuality(chapter, subject) → [{level, rule, msg}] (msg: "<chapter>: [<rule>] <what>") */
export function checkQuality(chapter: unknown, subject: unknown): QualityIssue[] {
  const c = qualityContext(chapter, subject);
  return qualitySpec.issues(c).map(i => ({ level: C(i.rule).level, rule: i.rule, msg: `${i.at}: [${i.rule}] ${i.message}` }));
}
