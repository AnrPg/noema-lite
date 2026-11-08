/**
 * Where the steps of a map go (pure: no DOM). The domain's layered layout (graph.ts) gives the columns; a Roadmap with a
 * ladder (docs/CURRICULUM.md §11) is drawn in level bands: each level's steps in columns of their own, the levels in
 * order, so a band is one stretch of the map (a prerequisite never sits above the step that needs it, so every link
 * still runs forwards). Two drawings use the columns: the classic map (left → right, the three parts) and the treasure
 * map (from the start at the bottom up to the treasure).
 */
import { layout, order, parentsOf } from '../domain/graph.ts';
import { ladder, stepSpan } from '../domain/levels.ts';
import type { Roadmap } from '../domain/model.ts';

export interface LevelBand {
  /** the level's id ('' for the steps without a level) */
  readonly level: string;
  /** its first and last column */
  readonly from: number;
  readonly to: number;
}

export interface MapColumns {
  readonly cols: string[][];
  /** the three parts (prerequisites · the goal · applications), columns from–to */
  readonly parts: { readonly prereq: [number, number]; readonly core: [number, number]; readonly apps: [number, number] };
  /** the level bands, lowest level first (none without a ladder) */
  readonly bands: readonly LevelBand[];
}

/** The columns of the map: the domain's layout, or level bands when the Roadmap has a ladder. */
export function mapColumns(c: Pick<Roadmap, 'nodes' | 'edges' | 'levels'>): MapColumns {
  const base = layout(c);
  const L = ladder(c);
  if (!L.length) return { cols: base.cols, parts: base.parts, bands: [] };
  // a step's band: the first level of its range; a step without one sits with its latest prerequisite (the lowest level when none)
  const ord = order(c),
    band: Record<string, number> = {},
    lowest = L[0]?.order ?? 0;
  for (const id of ord) {
    const s = stepSpan(c, c.nodes[id]);
    band[id] = s ? s.from : Math.max(lowest, ...parentsOf(c, id).map(p => band[p] ?? lowest));
  }
  const orders = [...new Set(Object.values(band))].sort((a, b) => a - b);
  const col: Record<string, number> = {};
  let start = 0;
  const bands: LevelBand[] = [];
  for (const o of orders) {
    let end = start - 1;
    for (const id of ord) {
      if (band[id] !== o) continue;
      col[id] = Math.max(start, ...parentsOf(c, id).map(p => (col[p] ?? -1) + 1));
      end = Math.max(end, col[id]);
    }
    if (end < start) continue;
    const lv = L.find(l => l.order === o);
    bands.push({ level: lv?.id ?? '', from: start, to: end });
    start = end + 1;
  }
  const cols: string[][] = Array.from({ length: start }, () => []);
  // inside a column: the order of the domain's layout (it untangled the links already)
  const rank: Record<string, number> = {};
  base.cols.forEach(cl => {
    cl.forEach((id, i) => (rank[id] = i));
  });
  for (const id of ord) cols[col[id] ?? 0]?.push(id);
  cols.forEach(cl => cl.sort((a, b) => (rank[a] ?? 0) - (rank[b] ?? 0)));
  const partOf = (k: string): [number, number] => {
    const xs = Object.keys(c.nodes)
      .filter(id => (c.nodes[id]?.part ?? 'core') === k)
      .map(id => col[id] ?? 0);
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, -1];
  };
  return { cols, parts: { prereq: partOf('prereq'), core: partOf('core'), apps: partOf('apps') }, bands };
}

/* ---------------- the classic map: left → right ---------------- */

export const NODE = { w: 196, h: 76, gx: 74, gy: 18, top: 64 } as const;

export interface Placed {
  readonly x: number;
  readonly y: number;
}

/** Every step's top-left corner, and the canvas size. */
export function classicPlaces(cols: readonly (readonly string[])[]): { P: Record<string, Placed>; W: number; H: number } {
  const { w, h, gx, gy, top } = NODE;
  const rows = Math.max(1, ...cols.map(cl => cl.length)),
    P: Record<string, Placed> = {};
  cols.forEach((cl, x) => {
    const off = ((rows - cl.length) * (h + gy)) / 2;
    cl.forEach((id, y) => (P[id] = { x: gx / 2 + x * (w + gx), y: top + off + y * (h + gy) }));
  });
  return { P, W: cols.length * (w + gx) + gx, H: top + rows * (h + gy) + 30 };
}

/** A band of columns a–b on the classic map: its left edge and width. */
export const columnSpan = (a: number, b: number): { left: number; width: number } => ({
  left: a * (NODE.w + NODE.gx) + 8,
  width: (b - a + 1) * (NODE.w + NODE.gx) - 16,
});

/** The curve of a link on the classic map (from the right side of a step to the left side of the next). */
export function classicEdge(a: Placed, b: Placed): string {
  const x1 = a.x + NODE.w,
    y1 = a.y + NODE.h / 2,
    x2 = b.x,
    y2 = b.y + NODE.h / 2,
    mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

/* ---------------- the treasure map: from the start (bottom) up to the treasure (top) ---------------- */

const TSEP = 118,
  TWAY = 60,
  TWW = 22,
  TM = 64,
  TLH = 124,
  TTOP = 118,
  TFOOT = 96;

export const TREASURE = '⚑treasure';

export interface TreasureLayout {
  readonly X: Record<string, number>;
  readonly Y: (id: string) => number;
  readonly W: number;
  readonly H: number;
  /** each link as a chain of ids (from, its waypoints, to); the last steps lead to the treasure */
  readonly E: readonly string[][];
  readonly L: Record<string, number>;
  readonly layers: readonly string[][];
  readonly way: Readonly<Record<string, true>>;
  /** a step's short station code: 1, 2, 3 … from the start upwards, left to right */
  readonly code: Readonly<Record<string, string>>;
  /** each level band: its lowest and highest layer */
  readonly bands: readonly LevelBand[];
}

/** The treasure map: the layers from the start up; a path that skips layers gets waypoints, each layer is ordered to cut
    crossings, then x relaxes towards the neighbours. */
export function treasureLayout(c: Pick<Roadmap, 'nodes' | 'edges' | 'levels'>): TreasureLayout {
  const MC = mapColumns(c),
    T = TREASURE,
    ids = Object.keys(c.nodes);
  const layers = MC.cols.map(cl => [...cl]),
    L: Record<string, number> = {};
  layers.forEach((l, i) => {
    for (const id of l) L[id] = i;
  });
  const kids: Record<string, number> = {};
  ids.forEach(id => (kids[id] = 0));
  const links = c.edges.filter(e => L[e.from] !== undefined && (L[e.to] ?? -1) > (L[e.from] ?? 0));
  links.forEach(e => (kids[e.from] = (kids[e.from] ?? 0) + 1));
  const sinks = ids.filter(id => !kids[id] && L[id] !== undefined);
  layers.push([T]);
  L[T] = layers.length - 1;
  const way: Record<string, true> = {},
    E: string[][] = [],
    up: Record<string, string[]> = {},
    dn: Record<string, string[]> = {};
  const node = (id: string): void => {
    up[id] ??= [];
    dn[id] ??= [];
  };
  [...links, ...sinks.map(s => ({ from: s, to: T }))].forEach((e, k) => {
    const chain = [e.from];
    for (let l = (L[e.from] ?? 0) + 1; l < (L[e.to] ?? 0); l++) {
      const w = `⚑w${k}_${l}`;
      way[w] = true;
      L[w] = l;
      layers[l]?.push(w);
      chain.push(w);
    }
    chain.push(e.to);
    E.push(chain);
    chain.forEach(node);
    chain.slice(1).forEach((b, i) => {
      const a = chain[i] ?? '';
      up[b]?.push(a);
      dn[a]?.push(b);
    });
  });
  layers.flat().forEach(node);
  const nl = layers.length;
  const pos = (): Record<string, number> => {
    const P: Record<string, number> = {};
    layers.forEach(l => {
      l.forEach((id, i) => (P[id] = i));
    });
    return P;
  };
  const crossings = (): number => {
    const P = pos();
    let n = 0;
    for (let l = 0; l < nl - 1; l++) {
      const seg: [number, number][] = [];
      layers[l]?.forEach(a => dn[a]?.forEach(b => seg.push([P[a] ?? 0, P[b] ?? 0])));
      for (let i = 0; i < seg.length; i++)
        for (let j = i + 1; j < seg.length; j++) {
          const s = seg[i],
            t = seg[j];
          if (s && t && (s[0] - t[0]) * (s[1] - t[1]) < 0) n++;
        }
    }
    return n;
  };
  let best = layers.map(l => [...l]),
    bestN = crossings();
  for (let it = 0; it < 16 && bestN; it++) {
    const down = it % 2 === 0,
      P0 = pos(),
      idx = [...Array(nl).keys()],
      sweep = down ? idx.slice(1) : idx.reverse().slice(1);
    sweep.forEach(l => {
      const nb = down ? up : dn,
        Q = pos();
      const bc = (id: string): number => {
        const ns = nb[id] ?? [];
        return ns.length ? ns.reduce((s, x) => s + (Q[x] ?? 0), 0) / ns.length : (Q[id] ?? 0);
      };
      layers[l]?.sort((a, b) => bc(a) - bc(b) || (P0[a] ?? 0) - (P0[b] ?? 0));
    });
    const n = crossings();
    if (n < bestN) {
      bestN = n;
      best = layers.map(l => [...l]);
    }
  }
  best.forEach((l, i) => (layers[i] = l));
  const sep = (a: string, b: string): number => (way[a] && way[b] ? TWW : way[a] || way[b] ? TWAY : TSEP);
  const need = (l: readonly string[]): number => l.slice(1).reduce((s, id, i) => s + sep(l[i] ?? '', id), 0);
  const W = Math.max(380, Math.ceil(Math.max(...layers.map(need)) + 2 * TM)),
    X: Record<string, number> = {};
  layers.forEach(l => {
    let x = W / 2 - need(l) / 2;
    l.forEach((id, i) => {
      if (i) x += sep(l[i - 1] ?? '', id);
      X[id] = x;
    });
  });
  const fit = (l: readonly string[]): void => {
    const xs = l.map(id => X[id] ?? 0),
      n = l.length;
    for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i] ?? 0, (xs[i - 1] ?? 0) + sep(l[i - 1] ?? '', l[i] ?? ''));
    if ((xs[n - 1] ?? 0) > W - TM) xs[n - 1] = W - TM;
    for (let i = n - 2; i >= 0; i--) xs[i] = Math.min(xs[i] ?? 0, (xs[i + 1] ?? 0) - sep(l[i] ?? '', l[i + 1] ?? ''));
    if ((xs[0] ?? 0) < TM) {
      xs[0] = TM;
      for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i] ?? 0, (xs[i - 1] ?? 0) + sep(l[i - 1] ?? '', l[i] ?? ''));
    }
    l.forEach((id, i) => (X[id] = xs[i] ?? 0));
  };
  layers.forEach(fit);
  for (let it = 0; it < 24; it++)
    (it % 2 ? [...layers].reverse() : layers).forEach(l => {
      l.forEach(id => {
        const nb = [...(up[id] ?? []), ...(dn[id] ?? [])];
        if (nb.length) X[id] = ((X[id] ?? 0) + (2 * nb.reduce((s, x) => s + (X[x] ?? 0), 0)) / nb.length) / 3;
      });
      fit(l);
    });
  const real = layers
      .flat()
      .filter(k => !way[k])
      .map(k => X[k] ?? 0),
    shift = W / 2 - (Math.min(...real) + Math.max(...real)) / 2;
  const all = Object.values(X),
    lo = Math.min(...all),
    hi = Math.max(...all),
    sh = Math.max(16 - lo, Math.min(W - 16 - hi, shift)); // the stations centred; paths may run near the border
  Object.keys(X).forEach(k => (X[k] = (X[k] ?? 0) + sh));
  const H = TTOP + (nl - 1) * TLH + TFOOT,
    Y = (id: string): number => H - TFOOT - (L[id] ?? 0) * TLH;
  const code: Record<string, string> = {};
  let k = 0;
  for (const l of layers)
    [...l]
      .filter(id => c.nodes[id])
      .sort((x, y) => (X[x] ?? 0) - (X[y] ?? 0))
      .forEach(id => (code[id] = String(++k)));
  return { X, Y, W, H, E, L, layers, way, code, bands: MC.bands };
}

/** The curve along a chain of the treasure map. */
export function treasureCurve(ch: readonly string[], X: Readonly<Record<string, number>>, Y: (id: string) => number): string {
  const f1 = (v: number): number => +v.toFixed(1);
  return ch
    .map((id): [number, number] => [X[id] ?? 0, Y(id)])
    .reduce((d, [x, y], i, a) => {
      const p = a[i - 1];
      if (!i || !p) return `M${f1(x)} ${y}`;
      const my = f1((p[1] + y) / 2);
      return d + ` C${f1(p[0])} ${my} ${f1(x)} ${my} ${f1(x)} ${y}`;
    }, '');
}

/** The steps lit up when one is selected: itself, its prerequisites and the steps it opens (null: nothing selected). */
export function related(c: Pick<Roadmap, 'edges'>, sel: string | null): Set<string> | null {
  return sel
    ? new Set([sel, ...c.edges.filter(e => e.to === sel).map(e => e.from), ...c.edges.filter(e => e.from === sel).map(e => e.to)])
    : null;
}
