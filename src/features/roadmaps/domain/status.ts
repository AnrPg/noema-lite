/* noema-lite — mastery and unlocking (docs/CURRICULUM.md §3): a step is mastered when every section of its subject is read and
   ≥ 80 % of its exercises are solved, or when "I already know this" was passed; a step opens when all its prerequisites are
   mastered. The numbers come from the learner's progress (the app reads them; helper 3's read models in phase 2): the domain
   gets them as functions. */
import type { Roadmap, Step } from './model.ts';
import { order, parentsOf } from './graph.ts';

export const PASS = 0.8;

export interface PackMastery {
  readonly score: number;
  readonly read: number;
  readonly mastered: boolean;
}
/** The step's subject: share of sections read and of exercises solved → its mastery. */
export function masteryOf(n: Step | undefined, readSections: (id: string) => boolean, solvedCount: number): PackMastery {
  if (!n?.pack || n.pack.status !== 'ready') return { score: 0, read: 0, mastered: false };
  const secs = n.pack.sections ?? [],
    total = n.pack.exercises ?? 0;
  const read = secs.length ? secs.filter(readSections).length / secs.length : 0;
  const solved = total ? solvedCount / total : 0;
  return { score: Math.min(1, solved), read, mastered: read >= 0.999 && solved >= PASS };
}

/** "I already know this" (KV a:curprog:<id>): a step passed by its test, or marked by the learner. */
export interface Override {
  readonly mastered?: boolean;
  readonly how?: string;
  readonly at?: string;
  readonly score?: number;
}

export interface StepStatus {
  readonly mastered: boolean;
  readonly open: boolean;
  readonly how: string | null;
  readonly score: number;
  readonly read: number;
  readonly parents: string[];
  readonly locked: boolean;
  /** 📦 a subject was attached: the step is closed until its new plan is here */
  readonly replanning: boolean;
}

/** Every step's status. pack(id): the mastery of the step's subject; overrides: the "I already know this" results. */
export function statuses(
  c: Pick<Roadmap, 'nodes' | 'edges'>,
  pack: (id: string) => PackMastery,
  overrides: Readonly<Record<string, Override>> = {},
): Record<string, StepStatus> {
  const memo: Record<string, StepStatus> = {};
  const visit = (id: string, path: Set<string>): StepStatus => {
    const done = memo[id];
    if (done) return done;
    const n = c.nodes[id],
      pm = pack(id),
      ov = overrides[id];
    const mastered = ov?.mastered || pm.mastered;
    const parents = parentsOf(c, id);
    path.add(id);
    // a cycle (a broken record) never recurses forever: a step on it counts as not mastered for its successor
    const open = parents.every(p => !path.has(p) && visit(p, path).mastered);
    path.delete(id);
    const replanning = !!(n?.pack?.assigned && (n.replan || !n.chapters?.length));
    return (memo[id] = {
      mastered,
      open,
      how: ov?.mastered ? (ov.how ?? null) : pm.mastered ? 'auto' : null,
      score: pm.score,
      read: pm.read,
      parents,
      locked: !open && !mastered,
      replanning,
    });
  };
  for (const id of Object.keys(c.nodes)) visit(id, new Set());
  return memo;
}

export interface Summary {
  total: number;
  mastered: number;
  open: number;
  ready: number;
  pct: number;
}
export function summary(c: Pick<Roadmap, 'nodes'>, st: Readonly<Record<string, StepStatus>>): Summary {
  const ids = Object.keys(c.nodes),
    m = ids.filter(i => st[i]?.mastered).length;
  return {
    total: ids.length,
    mastered: m,
    open: ids.filter(i => st[i]?.open && !st[i].mastered).length,
    ready: ids.filter(i => c.nodes[i]?.pack?.status === 'ready').length,
    pct: ids.length ? m / ids.length : 0,
  };
}

/** Open, not-yet-mastered steps in a good study order (the deep path first, then the topological order). */
export function nextUp(c: Pick<Roadmap, 'nodes' | 'edges' | 'paths'>, st: Readonly<Record<string, StepStatus>>): string[] {
  const ord = [...new Set([...(c.paths?.deep ?? []), ...order(c)])].filter(id => !!c.nodes[id]);
  return ord.filter(id => st[id]?.open && !st[id].mastered);
}
