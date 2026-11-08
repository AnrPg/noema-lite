/* noema-lite — the Roadmap's graph: a directed acyclic graph of steps, an edge from a prerequisite to the step that needs it
   (docs/CURRICULUM.md §1, §2, §6b). Pure functions over ids and edges. */
import type { Edge, Roadmap } from './model.ts';

export interface TopoOrder {
  readonly order: string[] | null;
  /** the steps on (or behind) a cycle when there is one */
  readonly cycle: string[];
}

/** Kahn's topological order of `ids` (edges naming other ids are ignored): `order` null when there is a cycle. */
export function topo(ids: readonly string[], edges: readonly { from: string; to: string }[]): TopoOrder {
  const indeg = new Map<string, number>(ids.map(i => [i, 0])),
    out = new Map<string, string[]>(ids.map(i => [i, []]));
  for (const e of edges) {
    const d = indeg.get(e.to);
    if (d === undefined || !indeg.has(e.from)) continue;
    indeg.set(e.to, d + 1);
    out.get(e.from)?.push(e.to);
  }
  const q = ids.filter(i => indeg.get(i) === 0),
    order: string[] = [];
  for (let n = q.shift(); n !== undefined; n = q.shift()) {
    order.push(n);
    for (const m of out.get(n) ?? []) {
      const d = (indeg.get(m) ?? 1) - 1;
      indeg.set(m, d);
      if (!d) q.push(m);
    }
  }
  return order.length === ids.length ? { order, cycle: [] } : { order: null, cycle: ids.filter(i => (indeg.get(i) ?? 0) > 0) };
}

/** Is the graph acyclic? */
export const acyclic = (ids: readonly string[], edges: readonly { from: string; to: string }[]): boolean => topo(ids, edges).order !== null;

/** Every id reachable from `start` (not itself): down = what it opens, up = what it needs. */
export function reach(start: string, edges: readonly { from: string; to: string }[], dir: 'down' | 'up' = 'down'): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
    const l = adj.get(a) ?? [];
    l.push(b);
    adj.set(a, l);
  }
  const seen = new Set<string>(),
    st = [start];
  for (let n = st.pop(); n !== undefined; n = st.pop())
    for (const m of adj.get(n) ?? [])
      if (!seen.has(m)) {
        seen.add(m);
        st.push(m);
      }
  return seen;
}

/** The study order of a Roadmap (topological; the record's own order when it has a cycle). */
export const order = (c: Pick<Roadmap, 'nodes' | 'edges'>): string[] => topo(Object.keys(c.nodes), c.edges).order ?? Object.keys(c.nodes);

/** The prerequisites of a step. */
export const parentsOf = (c: Pick<Roadmap, 'edges'>, id: string): string[] => c.edges.filter(e => e.to === id).map(e => e.from);
/** The steps that need a step. */
export const childrenOf = (c: Pick<Roadmap, 'edges'>, id: string): string[] => c.edges.filter(e => e.from === id).map(e => e.to);

export const hasEdge = (list: readonly { from: string; to: string }[], x: { from: string; to: string }): boolean =>
  list.some(y => y.from === x.from && y.to === x.to);

export interface Layout {
  cols: string[][];
  layer: Record<string, number>;
  parts: { prereq: [number, number]; core: [number, number]; apps: [number, number] };
}

/** The layered drawing of the map: three parts (prerequisites · the goal · applications) left → right, each step in the column
    after its last prerequisite, then a few barycentre sweeps to untangle the columns. */
export function layout(c: Pick<Roadmap, 'nodes' | 'edges'>): Layout {
  const ord = order(c),
    layer: Record<string, number> = {},
    parents = (id: string): string[] => parentsOf(c, id),
    at = (id: string): number => layer[id] ?? 0;
  for (const id of ord) layer[id] = Math.max(0, ...parents(id).map(p => at(p) + 1));
  const ids = Object.keys(c.nodes),
    part = (id: string): string | undefined => c.nodes[id]?.part;
  const maxPre = Math.max(0, ...ids.filter(i => part(i) === 'prereq').map(at));
  const shift = (filter: (id: string) => boolean, min: number): void => {
    for (const id of ord) if (filter(id)) layer[id] = Math.max(at(id), min, ...parents(id).map(p => at(p) + 1));
  };
  shift(i => part(i) === 'core', maxPre + 1);
  const maxCore = Math.max(maxPre + 1, ...ids.filter(i => part(i) === 'core').map(at));
  shift(i => part(i) === 'apps', maxCore + 1);
  for (const id of ord) layer[id] = Math.max(at(id), ...parents(id).map(p => at(p) + 1));
  const cols: string[][] = [];
  for (const id of ord) (cols[at(id)] ??= []).push(id);
  for (let i = 0; i < cols.length; i++) cols[i] ??= [];
  const pos: Record<string, number> = {};
  cols.forEach(col => {
    col.forEach((id, i) => (pos[id] = i));
  });
  const mean = (id: string): number => {
    const b = parents(id).map(p => pos[p] ?? 0);
    return b.length ? b.reduce((x, y) => x + y, 0) / b.length : (pos[id] ?? 0);
  };
  for (let sweep = 0; sweep < 4; sweep++)
    for (let l = 1; l < cols.length; l++) {
      const col = cols[l];
      if (!col) continue;
      col.sort((a, b) => mean(a) - mean(b));
      col.forEach((id, i) => (pos[id] = i));
    }
  return { cols, layer, parts: { prereq: [0, maxPre], core: [maxPre + 1, maxCore], apps: [maxCore + 1, cols.length - 1] } };
}

/** The subject id of a step's pack: stable for the Roadmap and the step (a shared Roadmap has the same ids for everybody). */
export function packId(c: Pick<Roadmap, 'id'>, nodeId: string): string {
  const slug =
    nodeId
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 38) || 'node';
  let h = 0;
  for (const ch of c.id + nodeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `cur-${c.id.slice(1, 7)}-${slug}-${h.toString(36).slice(0, 4)}`;
}

/** The store of a Roadmap's own files (each stored once, a textbook may serve several steps). */
export const curStore = (cid: string): string => 'curfiles-' + cid;

/** The steps of a Roadmap a link list leaves dangling (an edge to a step it does not have). */
export const danglingEdges = (c: Pick<Roadmap, 'nodes'>, edges: readonly Edge[]): Edge[] =>
  edges.filter(e => !Object.prototype.hasOwnProperty.call(c.nodes, e.from) || !Object.prototype.hasOwnProperty.call(c.nodes, e.to));
