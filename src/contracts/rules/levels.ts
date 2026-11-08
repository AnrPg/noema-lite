/* noema-lite — the levels model's rules (tools/CONTENT_SPEC.md "Levels", docs/CURRICULUM.md §11).

   A ladder (Roadmap.levels, or a pack's own subject.levels) is a list of levels {id, kind, order, names}; a step has a
   level (one id, or {from, to}); a pack names the level(s) it teaches; a chapter, section, exercise or card may name its
   own (default: its parent's). The rules:
     • ladder           — the ids and the orders of one ladder are unique, every level of one ladder has the same kind
     • known            — every level a step or a pack's content names is a level of its ladder
     • prerequisite     — a prerequisite never sits at a higher level than the step that needs it: it starts at the
                          step's first level or lower (its from ≤ the step's from)
     • difficultyMix    — the difficulty mix (tools/pack_rules.json quality "mix.difficulty": 20 / 25 / 55 % ± 5)
                          holds within each level of a pack, not only over the whole pack */
import { spec, all, type RuleIssue, type Spec } from './spec.ts';

export type LevelKind = 'grade' | 'semester' | 'year' | 'difficulty' | 'custom';
export interface Level {
  readonly id: string;
  readonly kind: LevelKind;
  readonly order: number;
  readonly names: Readonly<Record<string, string>>;
}
export interface LevelRange {
  readonly from: string;
  readonly to: string;
}
export type LevelRef = string | LevelRange;

export interface RoadmapLike {
  readonly levels?: readonly Level[] | undefined;
  readonly nodes: Readonly<Record<string, { readonly title?: string | undefined; readonly level?: LevelRef | undefined }>>;
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}
export interface ExerciseLike {
  readonly id: string;
  readonly section?: string | undefined;
  readonly difficulty?: number | undefined;
  readonly level?: string | undefined;
}
export interface ChapterLike {
  readonly id: string;
  readonly level?: string | undefined;
  readonly sections?: readonly { readonly id: string; readonly level?: string | undefined }[] | undefined;
  readonly exercises?: readonly ExerciseLike[] | undefined;
  readonly flashcards?:
    readonly { readonly id?: string | undefined; readonly section?: string | undefined; readonly level?: string | undefined }[] | undefined;
}
export interface PackLike {
  readonly subject: { readonly levels?: readonly (string | Level)[] | undefined };
  readonly chapters: readonly ChapterLike[];
}

/** The difficulty mix of tools/pack_rules.json (quality, "mix.difficulty"): percent per difficulty, and the tolerance. */
export interface DifficultyMix {
  readonly target: Readonly<Record<string, number>>;
  readonly tol: number;
}
export const DIFFICULTY_MIX: DifficultyMix = { target: { '1': 20, '2': 25, '3': 55 }, tol: 5 };

const issue = (rule: string, at: string, message: string): RuleIssue => ({ rule, at, message });

/** The order span of a level reference on a ladder: {from, to}, or null when a level id is not on it. */
export function span(ladder: readonly Level[], ref: LevelRef): { from: number; to: number } | null {
  const order = (id: string): number | undefined => ladder.find(l => l.id === id)?.order;
  const [a, b] = typeof ref === 'string' ? [ref, ref] : [ref.from, ref.to];
  const from = order(a),
    to = order(b);
  return from === undefined || to === undefined ? null : { from: Math.min(from, to), to: Math.max(from, to) };
}

/** One ladder: unique ids, unique orders, one kind. */
export const ladder: Spec<readonly Level[]> = spec('levels.ladder', L => {
  const out: RuleIssue[] = [],
    ids = new Set<string>(),
    orders = new Map<number, string>();
  for (const l of L) {
    if (ids.has(l.id)) out.push(issue('levels.ladder', l.id, `level "${l.id}" appears twice`));
    ids.add(l.id);
    const o = orders.get(l.order);
    if (o !== undefined) out.push(issue('levels.ladder', l.id, `levels "${o}" and "${l.id}" have the same order ${l.order}`));
    orders.set(l.order, l.id);
  }
  const kinds = [...new Set(L.map(l => l.kind))];
  if (kinds.length > 1) out.push(issue('levels.ladder', '', `one ladder has one kind (found ${kinds.join(', ')})`));
  return out;
});

/** Every step's level is a level of the Roadmap's ladder (a step without one is fine; levels are optional). */
export const knownStepLevels: Spec<RoadmapLike> = spec('levels.known', r => {
  const L = r.levels ?? [];
  return Object.entries(r.nodes).flatMap(([id, n]) =>
    n.level !== undefined && span(L, n.level) === null
      ? [
          issue(
            'levels.known',
            id,
            `step "${id}": level ${JSON.stringify(n.level)} is not a level of the Roadmap (${L.map(l => l.id).join(', ') || 'it has none'})`,
          ),
        ]
      : [],
  );
});

/** A prerequisite never sits at a higher level than the step that needs it. Steps without a level are not compared. */
export const prerequisiteLevel: Spec<RoadmapLike> = spec('levels.prerequisite', r => {
  const L = r.levels ?? [],
    out: RuleIssue[] = [];
  for (const e of r.edges) {
    const pre = r.nodes[e.from],
      step = r.nodes[e.to];
    if (pre?.level === undefined || step?.level === undefined) continue;
    const a = span(L, pre.level),
      b = span(L, step.level);
    if (!a || !b) continue; // an unknown level: levels.known says so
    if (a.from > b.from)
      out.push(
        issue(
          'levels.prerequisite',
          e.to,
          `step "${e.to}" (${show(L, step.level)}) needs "${e.from}", which starts at a higher level (${show(L, pre.level)}): a prerequisite never sits above the step that needs it`,
        ),
      );
  }
  return out;
});
const show = (L: readonly Level[], ref: LevelRef): string => {
  const name = (id: string): string => {
    const l = L.find(x => x.id === id);
    return l ? (l.names.en ?? Object.values(l.names)[0] ?? id) : id;
  };
  return typeof ref === 'string' ? name(ref) : `${name(ref.from)}–${name(ref.to)}`;
};

/** The Roadmap's level rules together. */
export const roadmapLevels: Spec<RoadmapLike> = all(
  'levels.roadmap',
  spec('levels.ladder', r => ladder.issues(r.levels ?? [])),
  knownStepLevels,
  prerequisiteLevel,
);

/** The level ids a pack teaches (its own ladder's ids, or the ids of its Roadmap's ladder it names). */
export const packLevelIds = (p: PackLike): string[] => (p.subject.levels ?? []).map(x => (typeof x === 'string' ? x : x.id));

/** The level of every exercise (its own, else its section's, else its chapter's, else the pack's when it has one level). */
export function exerciseLevels(p: PackLike): Map<string | null, ExerciseLike[]> {
  const ids = packLevelIds(p),
    packLevel = ids.length === 1 ? (ids[0] ?? null) : null,
    out = new Map<string | null, ExerciseLike[]>();
  for (const c of p.chapters) {
    const secs = new Map((c.sections ?? []).map(s => [s.id, s.level]));
    for (const e of c.exercises ?? []) {
      const lv = e.level ?? (e.section !== undefined ? secs.get(e.section) : undefined) ?? c.level ?? packLevel;
      const list = out.get(lv) ?? [];
      list.push(e);
      out.set(lv, list);
    }
  }
  return out;
}

/** Every level a chapter, section, exercise or card names is one the pack teaches. */
export const knownContentLevels: Spec<PackLike> = spec('levels.known', p => {
  const ids = new Set(packLevelIds(p)),
    out: RuleIssue[] = [];
  const check = (at: string, lv: string | undefined): void => {
    if (lv !== undefined && !ids.has(lv))
      out.push(issue('levels.known', at, `${at}: level "${lv}" is not a level of the pack (${[...ids].join(', ') || 'it names none'})`));
  };
  for (const c of p.chapters) {
    check(c.id, c.level);
    for (const s of c.sections ?? []) check(s.id, s.level);
    for (const e of c.exercises ?? []) check(e.id, e.level);
    for (const f of c.flashcards ?? []) check(f.id ?? `${c.id} card`, f.level);
  }
  return out;
});

/** The difficulty mix holds within each level the pack teaches (exercises without a level are not counted). */
export const difficultyMixPerLevel = (mix: DifficultyMix = DIFFICULTY_MIX): Spec<PackLike> =>
  spec('levels.difficultyMix', p => {
    if (!packLevelIds(p).length) return [];
    const out: RuleIssue[] = [];
    for (const [lv, exs] of exerciseLevels(p)) {
      if (lv === null || !exs.length) continue;
      for (const [d, want] of Object.entries(mix.target)) {
        const share = (100 * exs.filter(e => String(e.difficulty) === d).length) / exs.length;
        if (Math.abs(share - want) > mix.tol)
          out.push(
            issue(
              'levels.difficultyMix',
              lv,
              `level "${lv}": difficulty ${d} is ${Math.round(share)} % of its ${exs.length} exercise(s), need ${want} ± ${mix.tol} %`,
            ),
          );
      }
    }
    return out;
  });

/** Language courses keep their own stages (docs/LANGUAGES.md §4.4, docs/LANGUAGE_RULES.md D17: foundations S00–S18 →
    the core C01–C48 → the open-ended advanced modules; a node's `stage`). The common model only maps to them: one
    custom ladder with those three levels, the node's stage as its level. Names are the English master (the app shows a
    level's name through its i18n catalog). */
export const LANGUAGE_LADDER: readonly Level[] = [
  { id: 'foundations', kind: 'custom', order: 0, names: { en: 'Foundations' } },
  { id: 'core', kind: 'custom', order: 1, names: { en: 'Core' } },
  { id: 'advanced', kind: 'custom', order: 2, names: { en: 'Advanced' } },
];
/** A language course node's level on LANGUAGE_LADDER (null for a node without a stage, e.g. a frame or a field step). */
export const languageNodeLevel = (node: { readonly stage?: unknown }): string | null =>
  typeof node.stage === 'string' && LANGUAGE_LADDER.some(l => l.id === node.stage) ? node.stage : null;

/** The pack's level rules together. */
export const packLevels = (mix: DifficultyMix = DIFFICULTY_MIX): Spec<PackLike> =>
  all(
    'levels.pack',
    spec('levels.ladder', p => ladder.issues((p.subject.levels ?? []).filter((x): x is Level => typeof x !== 'string'))),
    knownContentLevels,
    difficultyMixPerLevel(mix),
  );
