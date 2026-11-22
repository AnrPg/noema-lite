/* noema-lite — the deep audit of a pack: every rule at today's strictness, plus a learning report per chapter.
   The rules (checkPack) say what is wrong; the audit also says how well each chapter teaches, on five measures, each with
   its numbers and what to add:
     depth          teaching words per section and per new concept, think-first reveals and questions, defined concepts
     gradual        the concept ladder (Q0): concepts, known, focus, nothing used before it is taught (the rules' count)
     retention      retrieval and spacing: exercises per learnable, in more than one type; flashcards; pitfalls; self-explanation
     interactivity  activities and simulations (interactive blocks, sim exercises), picture exercises, the engines that fit
     variety        exercise types, kinds of thinking, paradigms, focus tags, block kinds
   and the questions a program cannot answer, which the agent answers by reading (judgement).
   Used by the connector (noema_quality_audit) and the toolkit (audit.py), the same code. */
import { teachingWords } from './gradual.ts';
import { ENGINE_PURPOSE } from './engine_purpose.ts';
import { QUALITY } from './rules.ts';
import { isObj, isStr, list, obj, objs, s, type Obj } from './util.ts';

export interface EngineHint {
  readonly id: string;
  readonly score: number;
  readonly hits: readonly string[];
}
/** the engine catalogue's suggest(text) (src/engines/catalog.ts), or nothing where no catalogue is loaded */
export type SuggestEngines = (text: string) => readonly EngineHint[];

export interface Measure {
  readonly score: number; // 0–100
  readonly facts: readonly string[];
  readonly todo: readonly string[];
}
export interface ChapterAudit {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly measures: Readonly<Record<MeasureName, Measure>>;
  readonly engines: readonly EngineHint[];
}
export type MeasureName = 'depth' | 'gradual' | 'retention' | 'interactivity' | 'variety';
export interface PackAudit {
  readonly score: number;
  readonly verdict: 'high' | 'needs work' | 'poor';
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly chapters: readonly ChapterAudit[];
  readonly judgement: readonly string[];
}

/** the measures' bars (what a high-quality chapter reaches) */
export const AUDIT_BARS = Object.freeze({
  wordsPerSection: 400,
  wordsPerConcept: 150,
  exercisesPerLearnable: 2,
  flashcardsPerSection: 3,
  interactivePerChapter: 1,
  picturesPerChapter: 3,
  typesPerChapter: 8,
  modesPerChapter: 6,
  high: 85,
  poor: 60,
});

/** the questions only a reader can answer: the agent reads every section and exercise with them (record the answers and the
    fixes in review/chNN.json) */
export const JUDGEMENT: readonly string[] = Object.freeze([
  'Correct: every statement, number, formula and answer agrees with the sources and the field (check each one, not a sample).',
  'From zero: a newcomer could follow each section with nothing but the sections before it — every step of the reasoning is written out, nothing is "obvious".',
  'One idea per page: the section teaches its focus and only that; a second idea gets its own section.',
  'Why before how: each concept comes with the problem it solves, its mechanism and its limits, not only its definition.',
  'Examples: at least one worked example per new concept, with real sizes; a non-example or the case where it fails.',
  'Misconceptions: the usual wrong ideas and confusable pairs are named and taken apart (pitfalls, distinguish exercises, compare tables).',
  'Pictures and activities teach: each figure, diagram and simulation is explained right after it and asks the learner to do or predict something.',
  'Exercises need thinking: plausible distractors, every option explained, feedback that teaches; application and transfer to new cases, not recall of the page.',
  'Retention: each idea comes back later (spaced exercises, flashcards, a later chapter building on it); the chapter ends with a summary and a self-test.',
  'Engagement: hooks, questions before answers, real-world stakes; short blocks; varied ways in (text, table, picture, activity, story, debate).',
]);

const pct = (a: number, b: number): number => (b ? Math.round((100 * a) / b) : 0);
const clamp = (x: number): number => Math.max(0, Math.min(100, Math.round(x)));
/** 0–100 for having `have` of `want` (full marks at want) */
const part = (have: number, want: number): number => clamp(want <= 0 ? 100 : (100 * have) / want);
const avg = (xs: readonly number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

const textOfChapter = (c: Obj): string =>
  [c.title, c.subtitle, ...list(c.objectives), ...objs(c.sections).flatMap(x => [x.title, x.focus, x.hook])].filter(isStr).join(' · ');

/** auditChapter(chapter, issues of the rules for it, suggest) → the chapter's measures */
export function auditChapter(
  c: Obj,
  issues: { errors: readonly string[]; warnings: readonly string[] },
  suggest: SuggestEngines | null,
): ChapterAudit {
  const B = AUDIT_BARS;
  const id = s(c.id);
  const map = obj(c.map);
  const secs = objs(c.sections),
    exs = objs(c.exercises),
    cards = objs(c.flashcards);
  const concepts = objs(map.concepts);
  const blocks = secs.flatMap(x => objs(x.blocks));
  const mine = (xs: readonly string[]): string[] => xs.filter(x => x.startsWith(id + ':') || x.startsWith(id + '-'));
  const errs = mine(issues.errors),
    warns = mine(issues.warnings);

  // depth
  const dFacts: string[] = [],
    dTodo: string[] = [],
    dScores: number[] = [];
  for (const x of secs) {
    const bs = objs(x.blocks),
      n = concepts.filter(k => k.in === x.id).length,
      need = B.wordsPerSection + B.wordsPerConcept * Math.max(0, n - 1),
      w = bs.reduce((a, b) => a + teachingWords(b), 0),
      think = bs.filter(b => b.t === 'reveal' || b.t === 'ask').length;
    dScores.push(avg([part(w, need), part(think, 2), x.focus ? 100 : 0]));
    dFacts.push(`${s(x.id)}: ${w} words for ${n} new concept(s), ${think} think-first block(s)${x.focus ? '' : ', no focus'}`);
    if (w < need)
      dTodo.push(
        `${s(x.id)}: ${need - w} more words of teaching on its one idea (mechanism, worked example, limits, what it is confused with)`,
      );
    if (think < 2) dTodo.push(`${s(x.id)}: a question before the answer (reveal / ask) — ${2 - think} more`);
  }

  // gradual (Q0)
  const q0 = errs
    .concat(warns)
    .filter(m => /\[(concept\.|theory\.focus|theory\.depth)/.test(m) || /introduced|before it is introduced|not in map\.concepts/.test(m));
  const gScore = concepts.length ? clamp(100 - 8 * q0.length) : 0;
  const gTodo = concepts.length
    ? q0.slice(0, 12)
    : ['write the concept ladder first: map.concepts (terms, units, symbols, in, def, needs) and map.known'];

  // retention
  const lrs = objs(map.learnables).map(l => s(l.id));
  const byLr = new Map<string, Obj[]>();
  for (const e of exs) if (isStr(e.lr)) byLr.set(e.lr, [...(byLr.get(e.lr) ?? []), e]);
  const thin = lrs.filter(l => (byLr.get(l)?.length ?? 0) < B.exercisesPerLearnable);
  const oneType = lrs.filter(l => new Set((byLr.get(l) ?? []).map(e => e.type)).size < 2); // none or one: retrieve it in two ways at least
  const selfx = exs.filter(e => e.type === 'free' || e.type === 'write' || e.mode === 'feynman').length;
  const rScore = avg([
    lrs.length ? clamp(100 - pct(thin.length, lrs.length)) : 0,
    lrs.length ? clamp(100 - pct(oneType.length, lrs.length)) : 0,
    part(cards.length, B.flashcardsPerSection * Math.max(1, secs.length)),
    part(objs(c.pitfalls).length, 2),
    part(selfx, 2),
  ]);
  const rTodo = [
    ...(thin.length ? [`learnables with fewer than ${B.exercisesPerLearnable} exercises: ${thin.slice(0, 10).join(', ')}`] : []),
    ...(oneType.length
      ? [`learnables practised in fewer than 2 exercise types (retrieve each in two ways at least): ${oneType.slice(0, 10).join(', ')}`]
      : []),
    ...(cards.length < B.flashcardsPerSection * secs.length
      ? [
          `${B.flashcardsPerSection * secs.length - cards.length} more flashcards (${B.flashcardsPerSection} per section, for spaced review)`,
        ]
      : []),
    ...(objs(c.pitfalls).length < 2 ? ['pitfalls: the usual mistakes, each with its fix'] : []),
    ...(selfx < 2 ? ['self-explanation: free / write exercises or the feynman paradigm (explain it in your own words)'] : []),
  ];

  // interactivity
  const inter = blocks.filter(b => b.t === 'interactive').length + exs.filter(e => e.type === 'sim').length;
  const pics = exs.filter(e => s(e.type).startsWith('img_')).length;
  const used = new Set(blocks.filter(b => b.t === 'interactive').map(b => s(b.activity ?? b.id)));
  const all = suggest ? suggest(textOfChapter(c)) : [],
    top = all[0]?.score ?? 0,
    hints = all.filter(h => h.score >= Math.max(1.5, top / 3)); // the engines that clearly fit, not a stray word
  const iScore = avg([part(inter, B.interactivePerChapter * Math.max(1, Math.ceil(secs.length / 3))), part(pics, B.picturesPerChapter)]);
  const iTodo = [
    ...(inter < Math.max(1, Math.ceil(secs.length / 3))
      ? [
          hints.length
            ? `an activity or simulation where trying teaches (one per ~3 sections), from the engine library: ${hints
                .slice(0, 3)
                .map(h => `${h.id}${ENGINE_PURPOSE[h.id] ? ` — ${ENGINE_PURPOSE[h.id]}` : ''} (fits: ${h.hits.slice(0, 3).join(', ')})`)
                .join('; ')} — or noema_request_engine when none fits`
            : 'an activity or simulation where trying teaches (one per ~3 sections): the engine library (docs/INTERACTIVE_LIBRARY.md), H5P, a mini-app — or noema_request_engine when none fits',
        ]
      : []),
    ...(pics < B.picturesPerChapter
      ? [`${B.picturesPerChapter - pics} more picture exercises (label, hotspot, occlusion…) where a picture teaches`]
      : []),
  ];

  // variety
  const types = new Set(exs.map(e => s(e.type))),
    modes = new Set(exs.map(e => e.mode).filter(isStr)),
    think = new Set(exs.map(e => e.think).filter(isStr)),
    tags = new Set(exs.flatMap(e => list(e.tags)).filter(isStr)),
    kinds = new Set(blocks.map(b => s(b.t)));
  const recall = pct(exs.filter(e => e.think === 'recall').length, exs.length),
    applyPlus = pct(exs.filter(e => QUALITY.vocab.applyPlus.includes(s(e.think))).length, exs.length);
  const vScore = avg([
    part(types.size, B.typesPerChapter),
    part(modes.size, B.modesPerChapter),
    part(think.size, QUALITY.vocab.think.length - 1),
    part(tags.size, 5),
    part(kinds.size, 7),
    recall <= 25 ? 100 : clamp(100 - 3 * (recall - 25)),
    applyPlus >= 40 ? 100 : part(applyPlus, 40),
  ]);
  const missing = (have: Set<string>, all: readonly string[]): string => all.filter(x => !have.has(x)).join(', ');
  const vTodo = [
    ...(types.size < B.typesPerChapter
      ? [`more exercise types (${types.size} now); not used yet: ${missing(types, QUALITY.vocab.types)}`]
      : []),
    ...(modes.size < B.modesPerChapter
      ? [`more learning paradigms (${modes.size} now); not used yet: ${missing(modes, QUALITY.vocab.modes)}`]
      : []),
    ...(think.size < QUALITY.vocab.think.length - 1 ? [`kinds of thinking not asked yet: ${missing(think, QUALITY.vocab.think)}`] : []),
    ...(recall > 25 ? [`recall is ${recall} % of the exercises (≤ 25 %)`] : []),
    ...(applyPlus < 40 ? [`application and higher is ${applyPlus} % (≥ 40 %)`] : []),
    ...(kinds.size < 7
      ? [
          `more ways to show it in the theory (block kinds now: ${[...kinds].join(', ')}): diagram, flow, compare, figure, table, terms, reveal`,
        ]
      : []),
  ];

  const measures = {
    depth: { score: avg(dScores), facts: dFacts, todo: dTodo },
    gradual: {
      score: gScore,
      facts: [`${concepts.length} concepts, ${objs(map.known).length} known, ${q0.length} Q0 issue(s)`],
      todo: gTodo,
    },
    retention: {
      score: rScore,
      facts: [
        `${lrs.length} learnables, ${exs.length} exercises, ${cards.length} flashcards, ${objs(c.pitfalls).length} pitfalls, ${selfx} self-explanation`,
      ],
      todo: rTodo,
    },
    interactivity: {
      score: iScore,
      facts: [`${inter} activities/simulations, ${pics} picture exercises${used.size ? ` (activities: ${[...used].join(', ')})` : ''}`],
      todo: iTodo,
    },
    variety: {
      score: vScore,
      facts: [
        `${types.size} types, ${modes.size} paradigms, ${think.size} kinds of thinking (recall ${recall} %, apply+ ${applyPlus} %), ${tags.size} focus tags, ${kinds.size} block kinds`,
      ],
      todo: vTodo,
    },
  } satisfies Record<MeasureName, Measure>;
  const score = errs.length
    ? Math.min(avg(Object.values(measures).map(m => m.score)), AUDIT_BARS.poor)
    : avg(Object.values(measures).map(m => m.score));
  return { id, title: s(c.title), score, measures, engines: hints.slice(0, 4) };
}

/** auditPack(pack, rules, suggest) → the audit; rules: the pack's check at today's strictness (errors and warnings) */
export function auditPack(
  p: unknown,
  rules: { errors: readonly string[]; warnings: readonly string[] },
  suggest: SuggestEngines | null,
): PackAudit {
  const chapters = isObj(p) ? objs(p.chapters).map(c => auditChapter(c, rules, suggest)) : [];
  const score = rules.errors.length ? Math.min(avg(chapters.map(c => c.score)), AUDIT_BARS.poor - 1) : avg(chapters.map(c => c.score));
  return {
    score,
    verdict: score >= AUDIT_BARS.high && !rules.errors.length ? 'high' : score >= AUDIT_BARS.poor ? 'needs work' : 'poor',
    errors: rules.errors,
    warnings: rules.warnings,
    chapters,
    judgement: JUDGEMENT,
  };
}

/** the audit as text, for an agent: the verdict, the rule errors, then each chapter's measures with what to add */
export function auditReport(a: PackAudit, opts: { limit?: number } = {}): string {
  const lim = opts.limit ?? 400,
    out: string[] = [];
  out.push(
    `Quality audit: ${a.score}/100 — ${a.verdict}. ${a.errors.length} rule error(s), ${a.warnings.length} warning(s) at today's rules (Q0–Q8: the upload refuses a pack with errors).`,
  );
  if (a.errors.length)
    out.push(
      '\n# Rule errors (fix first)',
      ...a.errors.slice(0, lim).map(e => `- ${e}`),
      ...(a.errors.length > lim ? [`… +${a.errors.length - lim}`] : []),
    );
  for (const c of a.chapters) {
    out.push(`\n# ${c.id} ${c.title} — ${c.score}/100`);
    for (const [k, m] of Object.entries(c.measures)) {
      out.push(
        `## ${k} ${m.score}/100: ${m.facts.slice(0, 3).join(' · ')}${m.facts.length > 3 ? ` · … (${m.facts.length} sections)` : ''}`,
      );
      for (const t of m.todo.slice(0, 15)) out.push(`- ${t}`);
    }
  }
  out.push(
    '\n# Judgement (read every section and exercise with these; write the answers and fixes in review/chNN.json)',
    ...a.judgement.map((q, i) => `${i + 1}. ${q}`),
  );
  return out.join('\n');
}
