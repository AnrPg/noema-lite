/**
 * A conversation as a tree (docs/CONVERSATIONS.md "Branches"): editing an earlier message of the learner, or asking for
 * another answer, never throws the old turns away — they become a branch, and the learner can go back to them (‹ 2/3 ›).
 *
 * The shape keeps every older reader working: `msgs` (the record's `messages`) is the ACTIVE path, from the first message
 * to the newest one shown, in order — so the export, the search, the SQLite copy and an older version of the app read the
 * conversation the learner sees. Every other turn is in `branches`, each with its `parent` (the id of the turn before it;
 * null at the start). A path turn's parent is the turn before it on the path. Nodes are never deleted, so two copies of
 * one conversation merge by the union of their nodes (engine/convos.js mergeNodes).
 *
 * Pure. The functions change the arrays they are given IN PLACE: the session keeps one array per conversation
 * (cv.msgs === hist[key]).
 */
import { applyControl, newThreadState, noteLearnerTurn, type Directive, type ThreadState } from './threads.ts';
import type { Turn } from './conversation.ts';

/** a turn with the id of the turn before it */
export interface TreeNode {
  readonly turn: Turn;
  readonly parent: string | null;
}

/** ids every turn of a tree needs (older records always have them; a turn made before this version may not) */
export function ensureIds(path: Turn[], branches: Turn[], newId: () => string): void {
  for (const list of [path, branches])
    list.forEach((m, i) => {
      if (!m.id) list[i] = { ...m, id: newId() };
    });
}

const idOf = (m: Turn): string => m.id ?? '';
/** the path turn's parent: the turn before it */
const pathParent = (path: readonly Turn[], i: number): string | null => (i > 0 ? idOf(path[i - 1] as Turn) : null);
const strip = (m: Turn): Turn => {
  if (!('parent' in m)) return m;
  const rest = { ...m };
  Reflect.deleteProperty(rest, 'parent');
  return rest;
};

/** every node of the tree: the path, then the branches */
export function nodes(path: readonly Turn[], branches: readonly Turn[]): TreeNode[] {
  const seen = new Set<string>();
  const out: TreeNode[] = [];
  path.forEach((m, i) => {
    seen.add(idOf(m));
    out.push({ turn: m, parent: pathParent(path, i) });
  });
  for (const m of branches)
    if (!seen.has(idOf(m))) {
      seen.add(idOf(m));
      out.push({ turn: m, parent: m.parent ?? null });
    }
  return out;
}

const older = (a: Turn, b: Turn): number => (a.t || 0) - (b.t || 0) || (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0);

/** the versions of the path's turn i (the same speaker after the same turn), oldest first, and which one it is */
export function versions(path: readonly Turn[], branches: readonly Turn[], i: number): { readonly list: Turn[]; readonly index: number } {
  const m = path[i];
  if (!m) return { list: [], index: -1 };
  const p = pathParent(path, i);
  const list = nodes(path, branches)
    .filter(n => n.parent === p && n.turn.role === m.role)
    .map(n => n.turn)
    .sort(older);
  return { list, index: list.findIndex(x => idOf(x) === idOf(m)) };
}

/** Moves the path from turn i on into the branches (the path ends before it). → the turns moved. */
export function branchOff(path: Turn[], branches: Turn[], i: number): Turn[] {
  if (i < 0 || i >= path.length) return [];
  const moved = path.slice(i).map((m, k) => ({ ...m, parent: pathParent(path, i + k) }));
  path.splice(i);
  const have = new Set(branches.map(idOf));
  for (const m of moved) if (!have.has(idOf(m))) branches.push(m);
  return moved;
}

/** Shows the branch of a node: its turns back to the start, then on from it along the newest answers. → false when unknown. */
export function switchTo(path: Turn[], branches: Turn[], id: string): boolean {
  const all = nodes(path, branches);
  const by = new Map(all.map(n => [idOf(n.turn), n]));
  if (!by.has(id)) return false;
  const chain: Turn[] = [];
  const back = new Set<string>();
  for (let n = by.get(id); n && !back.has(idOf(n.turn)); n = n.parent ? by.get(n.parent) : undefined) {
    back.add(idOf(n.turn));
    chain.unshift(n.turn);
  }
  const kids = new Map<string, Turn[]>();
  for (const n of all)
    if (n.parent) {
      const k = kids.get(n.parent) ?? [];
      k.push(n.turn);
      kids.set(n.parent, k);
    }
  for (let cur = id; ;) {
    const next = (kids.get(cur) ?? [])
      .filter(k => !back.has(idOf(k)))
      .sort(older)
      .at(-1);
    if (!next) break;
    back.add(idOf(next));
    chain.push(next);
    cur = idOf(next);
  }
  const onPath = new Set(chain.map(idOf));
  const rest = all.filter(n => !onPath.has(idOf(n.turn))).map(n => ({ ...n.turn, parent: n.parent }));
  path.splice(0, path.length, ...chain.map(strip));
  branches.splice(0, branches.length, ...rest);
  return true;
}

/** How many turns the tree has off the path (0: a plain conversation). */
export const branchCount = (branches: readonly Turn[] | undefined): number => branches?.length ?? 0;

/**
 * The Socratic thread state of a path, worked out again turn by turn exactly as the turns made it (the learner's message
 * counts an attempt or asks for the answer; the reply's control line opens and resolves threads): after a branch switch
 * or an edit the tracker shows the branch the learner is on, never another one's lessons.
 */
export function replayThreadState(path: readonly Turn[]): { state: ThreadState; directive: Directive | null } {
  const ts = newThreadState();
  let directive: Directive | null = null;
  path.forEach((m, i) => {
    if (m.role === 'user') {
      const d = m.meta?.directive;
      directive = noteLearnerTurn(ts, m.text, d === 'tellme' || d === 'wrapup' ? d : null);
    } else {
      applyControl(ts, m.meta?.noemaState ?? null, i, m.text);
      directive = null;
    }
  });
  return { state: ts, directive };
}

/**
 * The conversation the learner sees, from a stored record (noema.conversation/v1): its `messages` ARE the active path.
 * The one way other features read a conversation (an export, a lesson source …), so they never depend on the tree.
 */
export function activePath<M>(record: { readonly messages?: readonly M[] | null }): readonly M[] {
  return record.messages ?? [];
}
/** every file on the active path, in order (each once) */
export function pathAttachments<A extends { readonly id: string }>(record: {
  readonly messages?: readonly { readonly attachments?: readonly A[] }[] | null;
}): A[] {
  const seen = new Set<string>();
  return activePath(record).flatMap(m => (m.attachments ?? []).filter(a => !seen.has(a.id) && (seen.add(a.id), true)));
}
