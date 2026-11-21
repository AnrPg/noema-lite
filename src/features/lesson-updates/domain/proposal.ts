/* noema-lite — a proposal of several lessons (docs/LESSON_UPDATES.md §3): what a chat brings may belong in more than one
   chapter of the subject, so an answer carries one PART per chapter (each a LessonUpdate of that chapter). The parts are
   prepared, checked and applied one after the other in the order of the chapters, each on the lesson as the parts before
   it left it — so an addition may use what an earlier part teaches, and Q0 still holds across the whole subject. An answer
   of one chapter (the older shape: "chapter" + "ops") is a proposal of one part. Pure. */
import { isObj, list, objs, s, type Obj } from '../../content/domain/util.ts';
import { chapterOf, effectivePicks } from './apply.ts';
import { applyAll, prepare, verify, type Base, type Checks, type Result } from './evaluate.ts';
import { UPDATE_FORMAT, type BridgeAdds, type LessonUpdate, type Picks } from './model.ts';

export interface Proposal {
  readonly format: typeof UPDATE_FORMAT;
  readonly v: 1;
  readonly request?: string;
  readonly pack: string;
  /** two or three lines for the learner: what it adds, where and why */
  readonly summary: string;
  /** one per chapter, in the order of the chapters */
  readonly parts: readonly LessonUpdate[];
}

/** the parts of an answer as it came (each with the answer's format, pack, request and summary), unsorted */
export function partsOf(raw: unknown): unknown[] {
  if (!isObj(raw)) return [raw];
  const top = { format: raw.format, v: raw.v, pack: raw.pack, ...(raw.request !== undefined ? { request: raw.request } : {}) };
  if (!Array.isArray(raw.parts)) return [raw];
  return (raw.parts as unknown[]).map((p: unknown) => (isObj(p) ? { ...top, summary: raw.summary, ...p } : p));
}

/** a base the parts before have changed: their pack and translations, every bridge they grew */
const advance = (b: Base, r: Result): Base => ({
  pack: r.pack,
  translations: r.translations,
  bridges: { ...(b.bridges ?? {}), ...r.bridges },
});

export interface PreparedProposal {
  readonly proposal: Proposal | null;
  readonly problems: readonly string[];
  readonly fixed: readonly string[];
}

/** The answer as it came against the lesson as it is → the proposal the learner reviews, or every problem (all parts). */
export function prepareProposal(checks: Checks, b: Base, raw: unknown): PreparedProposal {
  const parts = partsOf(raw);
  const P: string[] = [];
  if (isObj(raw) && Array.isArray(raw.parts) && !raw.parts.length) P.push('parts is empty: one part per chapter that gets something');
  if (isObj(raw) && Array.isArray(raw.parts) && !s(raw.summary).trim())
    P.push('summary is missing (for the learner: what it adds, where and why)');
  const order = objs(b.pack.chapters).map(c => s(c.id));
  const chOf = (p: unknown): string => (isObj(p) ? s(p.chapter) : '');
  const seen = new Set<string>();
  for (const p of parts) {
    const c = chOf(p);
    if (seen.has(c)) P.push(`two parts for chapter "${c}": one part per chapter (put all its ops in that one)`);
    seen.add(c);
  }
  const choiceIds = parts.flatMap(p => (isObj(p) ? objs(p.choices).map(c => s(c.id)) : []));
  const dup = choiceIds.filter((x, i) => choiceIds.indexOf(x) !== i);
  if (dup.length) P.push(`choice ids must be unique across the parts: ${[...new Set(dup)].join(', ')}`);
  if (P.length) return { proposal: null, problems: P, fixed: [] };
  const sorted = [...parts].sort((x, y) => order.indexOf(chOf(x)) - order.indexOf(chOf(y)));
  const multi = sorted.length > 1;
  const tag = (c: string, e: string): string => (multi ? `[part ${c}] ${e}` : e);
  let cur = b;
  const out: LessonUpdate[] = [];
  const fixed: string[] = [];
  for (const raw1 of sorted) {
    const c = chOf(raw1);
    const r = prepare(checks, cur, raw1);
    fixed.push(...r.fixed.map(e => tag(c, e)));
    if (!r.update) {
      P.push(...r.problems.map(e => tag(c, e)));
      continue; // the next parts are still checked (on the lesson without this one): every problem at once
    }
    out.push(r.update);
    cur = advance(cur, applyAll(cur, r.update, {}));
  }
  if (P.length) return { proposal: null, problems: P, fixed };
  const first = out[0];
  if (!first) return { proposal: null, problems: ['the update has no part'], fixed };
  return {
    proposal: {
      format: UPDATE_FORMAT,
      v: 1,
      ...(first.request ? { request: first.request } : {}),
      pack: first.pack,
      summary: isObj(raw) && s(raw.summary).trim() ? s(raw.summary) : first.summary,
      parts: out,
    },
    problems: [],
    fixed,
  };
}

/** a proposal as stored or pasted: the shape of several parts, or one LessonUpdate (one part) */
export function asProposal(v: unknown): Proposal | null {
  if (!isObj(v) || v.format !== UPDATE_FORMAT) return null;
  if (Array.isArray(v.parts)) return v as unknown as Proposal;
  if (typeof v.chapter === 'string' && Array.isArray(v.ops)) {
    const u = v as unknown as LessonUpdate;
    return { format: UPDATE_FORMAT, v: 1, ...(u.request ? { request: u.request } : {}), pack: u.pack, summary: u.summary, parts: [u] };
  }
  return null;
}

/** every part on the lesson the parts before it left, with the learner's picks → the new errors, or 'changed' */
export function verifyProposal(checks: Checks, b: Base, p: Proposal, picks: Picks): { errors: string[]; changed: boolean } {
  let cur = b;
  const errors: string[] = [];
  for (const u of p.parts) {
    const v = verify(checks, cur, u, picks);
    if (v.changed) return { errors: [], changed: true };
    errors.push(...(p.parts.length > 1 ? v.errors.map(e => `[part ${u.chapter}] ${e}`) : v.errors));
    cur = advance(cur, applyAll(cur, u, picks));
  }
  return { errors, changed: false };
}

/** the lesson with every part applied (the bridges: each one any part grew) */
export function applyProposal(b: Base, p: Proposal, picks: Picks = {}): Result {
  let cur = b;
  const bridges: Record<string, Obj> = {};
  for (const u of p.parts) {
    const r = applyAll(cur, u, picks);
    Object.assign(bridges, r.bridges);
    cur = advance(cur, r);
  }
  return {
    pack: cur.pack,
    translations: cur.translations,
    bridges: bridges,
  };
}

/** every choice of the proposal (ids are unique across its parts) */
export const choicesOf = (p: Proposal) => p.parts.flatMap(u => u.choices ?? []);
/** the picks that apply: the learner's, else each choice's recommended option */
export const proposalPicks = (p: Proposal, picks: Picks): Picks =>
  Object.assign({}, ...p.parts.map(u => effectivePicks(u, picks))) as Picks;
/** the chapters it changes, in order (id and title in the pack's language) */
export const chaptersOf = (b: Base, p: Proposal): { id: string; title: string }[] =>
  p.parts.map(u => ({ id: u.chapter, title: s(chapterOf(b.pack, u.chapter)?.title ?? u.chapter) }));
/** the bridges' new entries of every part (one map) */
export const bridgesOf = (p: Proposal): BridgeAdds => {
  const out: Record<string, Obj[]> = {};
  for (const u of p.parts) for (const [k, v] of Object.entries(u.bridges ?? {})) (out[k] ??= []).push(...(list(v) as Obj[]));
  return out;
};
