/* noema-lite — a step's chapter plan and how two copies of a Roadmap agree on plans (docs/CURRICULUM.md §2b, §9, §10).
   Whole records sync last-writer-wins, so without mergePlans an older copy saved anywhere would drop plans accepted
   meanwhile; plans, re-plan requests, attachments and translations carry stamps (stampAfter) and the later one wins. */
import type { Roadmap, Step } from './model.ts';
import { clone, ms } from './model.ts';
import { planLocked } from './work.ts';

/** 👥 What a step's plan is (a shared Roadmap keeps the group's plan aside while the learner's own subject teaches the step). */
export const PLAN_KEYS = ['chapters', 'learningGoals', 'plannedAt', 'replanAt'] as const;
export type Plan = Partial<Pick<Step, (typeof PLAN_KEYS)[number]>>;

export function planOf(n: Partial<Step> | null | undefined): Plan {
  const r: Record<string, unknown> = {};
  for (const k of PLAN_KEYS) if (n?.[k] !== undefined) r[k] = clone(n[k]);
  return r;
}
/** Put a plan on a step (mutates it): every plan key the plan has, and none it has not. */
export function setPlan(n: Step, p: Plan | null | undefined): void {
  for (const k of PLAN_KEYS) {
    const v = p?.[k];
    if (v !== undefined) (n as Record<string, unknown>)[k] = clone(v);
    else Reflect.deleteProperty(n, k);
  }
}

/** Bring into `c` the plans, attachments and translations that are newer in `other` (mutates c) → true when c changed. */
export function mergePlans(c: Roadmap | null | undefined, other: Roadmap | null | undefined): boolean {
  if (!c?.nodes || !other?.nodes || c.id !== other.id) return false;
  let changed = false;
  for (const [id, o] of Object.entries(other.nodes)) {
    const n = c.nodes[id];
    if (!n) continue;
    // 📦 a pack attached to (or taken off) the step on the other copy, later than anything here (assignedAt marks both)
    if (ms(o.assignedAt as string | undefined) > ms(n.assignedAt as string | undefined) && n.pack?.status !== 'generating') {
      n.assignedAt = o.assignedAt;
      n.pack = o.pack ? clone(o.pack) : null;
      if (o.planFrom) n.planFrom = o.planFrom;
      else Reflect.deleteProperty(n, 'planFrom');
      if (o.groupPlan || n.groupPlan) {
        setPlan(n, o);
        if (o.groupPlan) n.groupPlan = planOf(o.groupPlan);
        else Reflect.deleteProperty(n, 'groupPlan');
      }
      if (o.replan) {
        n.replan = true;
        if (o.replanAt !== undefined) n.replanAt = o.replanAt;
        if (c.stage === 'done') c.stage = 'plan';
      }
      if (!o.reviewed) Reflect.deleteProperty(n, 'reviewed');
      changed = true;
    }
    if (planLocked(n)) continue;
    // 📦 the other copy's plan followed a subject this copy has taken off since: it never comes back over the plan here
    if ((o.pack?.assigned || o.groupPlan) && ms(n.assignedAt as string | undefined) > ms(o.assignedAt as string | undefined)) continue;
    if (o.replan && ms(o.replanAt) > Math.max(ms(n.plannedAt), ms(n.replanAt))) {
      n.replan = true;
      if (o.replanAt !== undefined) n.replanAt = o.replanAt;
      if (o.planWish) n.planWish = o.planWish;
      else Reflect.deleteProperty(n, 'planWish');
      if (c.stage === 'done') c.stage = 'plan';
      changed = true;
      continue;
    }
    if (!o.chapters?.length) continue;
    const newer = o.plannedAt
      ? ms(o.plannedAt) > Math.max(ms(n.plannedAt), ms(n.replanAt))
      : !n.chapters?.length && !n.replan && !n.plannedAt;
    if (!newer) continue;
    if (o.learningGoals !== undefined) n.learningGoals = o.learningGoals;
    n.chapters = o.chapters;
    if (o.plannedAt) n.plannedAt = o.plannedAt;
    else Reflect.deleteProperty(n, 'plannedAt');
    if (!n.replanAt || ms(o.plannedAt) > ms(n.replanAt)) {
      Reflect.deleteProperty(n, 'replan');
      Reflect.deleteProperty(n, 'planWish');
    }
    changed = true;
  }
  for (const [loc, L] of Object.entries(other.i18n ?? {})) {
    // 🌐 a Roadmap translation saved or changed later on the other copy
    if (ms(L.at) > ms(c.i18n?.[loc]?.at)) {
      (c.i18n ??= {})[loc] = clone(L);
      changed = true;
    }
  }
  // 🪜 the ladder and the proposals: the copy that decided later wins (a proposal is decided once, on one device)
  if (mergeProposals(c, other)) changed = true;
  if (
    changed &&
    c.provider === 'claudeapp' &&
    c.stage === 'plan' &&
    !Object.values(c.nodes).some(n => !planLocked(n) && (!n.chapters?.length || n.replan))
  )
    c.stage = 'done';
  return changed;
}

/** Proposals of restructuring on two copies: a proposal decided on the other copy (applied or declined) is decided here too;
    one this copy does not have yet is added. A proposal applied on the other copy brings that copy's levels and map with it
    (a restructuring changes the map as a whole: the copy that applied it holds the result). */
function mergeProposals(c: Roadmap, other: Roadmap): boolean {
  let changed = false;
  const mine = (c.proposals ??= []);
  for (const p of other.proposals ?? []) {
    const here = mine.find(x => x.id === p.id);
    if (!here) {
      mine.push(clone(p));
      changed = true;
      if (p.status === 'applied') adoptRestructured(c, other);
      continue;
    }
    if (here.status === 'pending' && p.status !== 'pending') {
      Object.assign(here, clone(p));
      changed = true;
      if (p.status === 'applied') adoptRestructured(c, other);
    }
  }
  if (!mine.length) Reflect.deleteProperty(c, 'proposals');
  return changed;
}
/** The map as the copy that applied a restructuring has it: levels, steps (with their progress-carrying ids) and links. */
function adoptRestructured(c: Roadmap, other: Roadmap): void {
  if (other.levels) c.levels = clone(other.levels);
  else Reflect.deleteProperty(c, 'levels');
  c.nodes = clone(other.nodes);
  c.edges = clone(other.edges);
  if (other.paths) c.paths = clone(other.paths);
  if (other.i18n) c.i18n = clone(other.i18n);
}
