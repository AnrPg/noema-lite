/* noema-lite — the inbox (docs/CURRICULUM.md §7): the connector never writes a Roadmap record (the app may be changing it).
   Each thing Claude does is a KV row a:curin:<cid>:<seq> (contract noema.curriculum.v1#inboxEntry); the app checks it again,
   applies it, syncs the Roadmap and only then deletes the row, and the connector works on the Roadmap "as it will be" (the
   record + its inbox, in key order: `merged`). Kinds this build knows (KINDS): an agent's answer ({ task, data }), a prepared
   step, a subject attached to a step, a translation, a new part, links between steps, a restructuring proposal. A kind it does
   not know stays in the inbox for a newer app — never deleted unread. */
import { ladder as ladderSpec, roadmapLevels } from '../../../contracts/rules/levels.ts';
import type { Edge, KvRow, Level, Proposal, Roadmap, Step } from './model.ts';
import { clone, own, PART } from './model.ts';
import { hasEdge, order, topo } from './graph.ts';
import { GRAPH, isApp, needsPlan, prepared, queued } from './work.ts';
import { checkI18n, setI18n } from './i18n.ts';
import { checkRestructure, type RestructurePlan } from './restructure.ts';

export const IN = 'a:curin:';
export const KINDS = ['step', 'assign', 'i18n', 'extend', 'link', 'restructure'] as const;
export type Kind = (typeof KINDS)[number];

/** The key of an inbox entry: seq orders the entries (a time in base 36, then something unique). */
export const inboxKey = (cid: string, seq: string): string => `${IN}${cid}:${seq}`;
export const inboxSeq = (now: number, unique: string): string => now.toString(36).padStart(9, '0') + '-' + unique;

export interface ExtendEntry {
  v: 1;
  kind: 'extend';
  /** optional in a row (an entry is data from the KV, read as it comes): without part or nodes it is refused */
  part?: { id: string; title: string; summary?: string; at?: string };
  nodes?: Record<string, Step>;
  edges?: Edge[];
  prepare?: boolean;
  /** levels the new part brings: the Roadmap's ladder when it has none yet, else levels added to it */
  levels?: Level[];
}
export interface LinkEntry {
  v: 1;
  kind: 'link';
  id?: string;
  /** both optional in a row: an entry is data from the KV, read as it comes */
  links?: Edge[];
  remove?: Edge[];
  at?: string;
}
export interface RestructureEntry {
  v: 1;
  kind: 'restructure';
  id: string;
  plan: RestructurePlan;
  at: string;
  via?: string;
}
export type Entry = Record<string, unknown> & { kind?: string; task?: string };

/** The entries of KV rows in the order they are applied (by key), each parsed; unreadable rows are left out. */
export function entriesOf(rows: readonly KvRow[]): { row: KvRow; entry: Entry }[] {
  const out: { row: KvRow; entry: Entry }[] = [];
  for (const r of [...rows].sort((a, b) => a.key.localeCompare(b.key))) {
    let e: unknown = r.value;
    if (typeof e === 'string')
      try {
        e = JSON.parse(e);
      } catch {
        continue; // an unreadable row is not an entry (the app deletes it; the connector skips it)
      }
    if (e && typeof e === 'object' && !Array.isArray(e)) out.push({ row: r, entry: e as Entry });
  }
  return out;
}
/** Does this build know the entry (a task's answer names its task)? */
export const known = (e: Entry): boolean => typeof e.task === 'string' || (KINDS as readonly string[]).includes(e.kind ?? '');

/* ---------- 🌱 a new part (noema_extend_roadmap) ---------- */

/** Can the part still be added to this copy? [] when it can, ['applied'] when it is here already, else the problems. */
export function extendProblems(c: Roadmap, e: ExtendEntry): string[] {
  if ((c.parts ?? []).some(p => p.id === e.part?.id)) return ['applied'];
  const p: string[] = [],
    nodes = e.nodes ?? {},
    edges = e.edges ?? [],
    ids = new Set([...Object.keys(c.nodes), ...Object.keys(nodes)]);
  if (!e.part?.id || !Object.keys(nodes).length) p.push('an empty part');
  for (const id of Object.keys(nodes)) if (own(c.nodes, id)) p.push(`step id "${id}" is taken`);
  for (const x of edges) {
    if (!ids.has(x.from) || !ids.has(x.to)) p.push(`a link to a step this copy does not have (${x.from} → ${x.to})`);
    else if (!nodes[x.to] && (c.nodes[x.to]?.pack?.assigned || prepared(c.nodes[x.to])))
      p.push(`“${c.nodes[x.to]?.title ?? x.to}” is prepared already: it gets no new prerequisite`);
  }
  if (!p.length && !topo([...ids], [...c.edges, ...edges]).order) p.push('the links form a cycle');
  if (!p.length && (e.levels?.length || Object.values(nodes).some(n => n.level !== undefined))) {
    const after = withLevels(c, e.levels);
    for (const x of ladderSpec.issues(after)) p.push(x.message);
    if (!p.length)
      for (const x of roadmapLevels.issues({ levels: after, nodes: { ...c.nodes, ...nodes }, edges: [...c.edges, ...edges] }))
        p.push(x.message);
  }
  return p;
}
/** The ladder with the levels a part brings (the ones it does not have yet, by id). */
const withLevels = (c: Roadmap, add: readonly Level[] | undefined): Level[] => [
  ...(c.levels ?? []),
  ...(add ?? []).filter(l => !(c.levels ?? []).some(x => x.id === l.id)),
];

/** Add the part (mutates the draft; check extendProblems first): its steps, links and levels, and the part itself in c.parts —
    the first part being the map as it was. → the ids of the new steps. */
export function extend(c: Roadmap, e: ExtendEntry, now: number): string[] {
  const part = e.part ?? { id: '', title: '' },
    nodes = e.nodes ?? {},
    at = part.at ?? new Date(now).toISOString();
  if (!c.parts?.length)
    c.parts = [
      {
        id: 'p1',
        title: c.title ?? c.goal ?? '',
        at: (c.fromSources as { at?: string } | undefined)?.at ?? c.created ?? at,
        steps: Object.keys(c.nodes),
      },
    ];
  for (const [id, n] of Object.entries(nodes))
    c.nodes[id] = { chapters: [], learningGoals: [], ...clone(n), id, part: PART[n.role ?? ''] ?? 'core', addedIn: part.id };
  for (const x of e.edges ?? []) if (!hasEdge(c.edges, x)) c.edges.push({ from: x.from, to: x.to, why: x.why ?? '' });
  if (e.levels?.length) c.levels = withLevels(c, e.levels);
  c.parts.push({
    id: part.id,
    title: part.title,
    ...(part.summary ? { summary: part.summary } : {}),
    at,
    steps: Object.keys(nodes),
  });
  c.paths = { minimal: c.paths?.minimal ?? [], deep: order(c) };
  if (e.prepare) {
    const t0 = Date.parse(at) || now;
    order(c)
      .filter(id => own(nodes, id))
      .forEach((id, i) => {
        const n = c.nodes[id];
        if (!n) return;
        n.pack = queued(c, id, t0 + i);
        n.reviewed = at;
      });
  }
  if (c.stage === 'done' && Object.keys(nodes).some(id => needsPlan(c.nodes[id]))) c.stage = 'plan';
  readyForApp(c);
  return Object.keys(nodes);
}

/** A Roadmap of the Claude app whose map is built is ready (no error) once something arrives for it. */
export function readyForApp(c: Roadmap): void {
  if (isApp(c) && !(GRAPH as readonly string[]).includes(c.stage ?? '')) {
    c.status = 'ready';
    c.error = null;
    c.errorInfo = null;
  }
}

/* ---------- 🔗 links between steps already on the map (noema_link_roadmap_steps) ---------- */

/** Can the links still be applied to this copy? [] when they can, ['applied'] when it has them already, else the problems.
    Prepared steps may get a new prerequisite: only the map changes. */
export function linkProblems(c: Roadmap, e: LinkEntry): string[] {
  const add = e.links ?? [],
    rem = e.remove ?? [],
    p: string[] = [];
  if (!add.length && !rem.length) return ['nothing to change'];
  if (e.id && (c.linksApplied ?? []).includes(e.id)) return ['applied']; // its receipt: never replayed
  for (const x of [...add, ...rem])
    if (!own(c.nodes, x.from) || !own(c.nodes, x.to)) p.push(`a link to a step this copy does not have (${x.from} → ${x.to})`);
  if (p.length) return p;
  if (add.every(x => hasEdge(c.edges, x)) && !rem.some(x => hasEdge(c.edges, x))) return ['applied'];
  const after = [...c.edges.filter(x => !hasEdge(rem, x)), ...add.filter(x => !hasEdge(c.edges, x))];
  if (!topo(Object.keys(c.nodes), after).order) p.push('the links form a cycle');
  if (!p.length && c.levels?.length)
    for (const x of roadmapLevels.issues({ levels: c.levels, nodes: c.nodes, edges: after })) p.push(x.message);
  return p;
}
/** Apply the links (mutates the draft; check linkProblems first): edges added (with their why) and removed, the study order
    recomputed. Nothing else changes — no step is re-planned and no subject or progress is touched. */
export function link(c: Roadmap, e: LinkEntry): { added: number; removed: number } {
  const rem = (e.remove ?? []).filter(x => hasEdge(c.edges, x)),
    add = (e.links ?? []).filter(x => !hasEdge(c.edges, x) && own(c.nodes, x.from) && own(c.nodes, x.to));
  c.edges = [...c.edges.filter(x => !hasEdge(rem, x)), ...add.map(x => ({ from: x.from, to: x.to, why: x.why ?? '' }))];
  c.paths = { minimal: c.paths?.minimal ?? [], deep: order(c) };
  if (e.id) c.linksApplied = [...(c.linksApplied ?? []), e.id].slice(-200);
  return { added: add.length, removed: rem.length };
}

/* ---------- 🪜 a restructuring proposal (noema_restructure_levels) ---------- */

/** Can the proposal be kept on this copy (for the learner to decide)? [] when it can, ['applied'] when this copy has it already,
    else the problems (e.g. a step it names this copy does not have yet: the entry waits). */
export function proposeProblems(c: Roadmap, e: RestructureEntry): string[] {
  const x = e as Partial<RestructureEntry>; // an entry is data from the KV, read as it comes
  if (typeof x.id !== 'string' || !x.id || !x.plan || typeof x.plan !== 'object') return ['not a restructuring plan'];
  if ((c.proposals ?? []).some(p => p.id === e.id)) return ['applied'];
  return checkRestructure(c, e.plan);
}
/** Keep the proposal on the draft, pending (an older pending proposal is replaced: the newest plan is the one to decide on). */
export function propose(c: Roadmap, e: RestructureEntry): Proposal {
  const p: Proposal = { id: e.id, kind: 'restructure', at: e.at, via: e.via ?? 'claude-app', plan: clone(e.plan), status: 'pending' };
  c.proposals = [...(c.proposals ?? []).filter(x => x.status !== 'pending'), p].slice(-20);
  return p;
}
/** The proposal waiting for the learner's decision, if any. */
export const pendingProposal = (c: Pick<Roadmap, 'proposals'>): Proposal | null =>
  (c.proposals ?? []).find(p => p.status === 'pending') ?? null;

/* ---------- the Roadmap as it will be ---------- */

export interface MergeHooks {
  now: number;
  /** a task's answer ({ task, data }): checked and applied by the agents' code (engine/curjobs.js) */
  answer?: (c: Roadmap, e: Entry) => void;
  /** 📦 a subject attached to a step: applied when the step can take it (engine/curjobs.js attachTo) */
  assign?: (c: Roadmap, e: Entry) => void;
}
/** The Roadmap once the inbox is applied (a copy; the record is never changed): what the connector works on. */
export function merged(c: Roadmap, rows: readonly KvRow[], hooks: MergeHooks): Roadmap {
  const cc = clone(c);
  for (const { entry: e } of entriesOf(rows)) {
    if (e.kind === 'step') {
      const n = typeof e.nid === 'string' ? cc.nodes[e.nid] : undefined;
      if (n && !n.pack?.assigned) n.pack = { ...(n.pack ?? {}), id: String(e.packId), status: 'ready' };
      continue;
    }
    if (e.kind === 'assign') {
      hooks.assign?.(cc, e);
      continue;
    }
    if (e.kind === 'i18n') {
      const loc = typeof e.locale === 'string' ? e.locale : '';
      if (!checkI18n(cc, loc, e.data).length) setI18n(cc, loc, e.data as Record<string, unknown>, hooks.now);
      continue;
    }
    if (e.kind === 'extend') {
      const x = e as unknown as ExtendEntry;
      if (!extendProblems(cc, x).length) extend(cc, x, hooks.now);
      continue;
    }
    if (e.kind === 'link') {
      const x = e as unknown as LinkEntry;
      if (!linkProblems(cc, x).length) link(cc, x);
      continue;
    }
    if (e.kind === 'restructure') {
      const x = e as unknown as RestructureEntry;
      if (!proposeProblems(cc, x).length) propose(cc, x);
      continue;
    }
    if (typeof e.task === 'string') hooks.answer?.(cc, e);
  }
  return cc;
}
