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

/** The measures of the treasure map (px at zoom 1). A station: its dot (radius DOT) on the layer's line, under it its label
    (the station code, then the title in up to MAX_LINES lines of LINE px). */
export const TMAP = {
  /** the dot's radius, border included */
  DOT: 22,
  /** from the dot to the label */
  LAB_GAP: 4,
  /** the code's line, the title's lines and the label's padding (top + bottom) */
  CODE: 15,
  LINE: 15,
  PAD: 6,
  MAX_LINES: 5,
  /** the label's width: at least, at most */
  LW_MIN: 108,
  LW_MAX: 220,
  /** the room between two labels, between a label and a path that passes by, between two passing paths */
  GAP: 18,
  WAY_GAP: 14,
  WAY_WAY: 14,
  /** the empty band between two layers (only paths there), the margins */
  LAYER_GAP: 46,
  MARGIN: 24,
  TOP: 76,
  FOOT: 44,
  /** a map narrower than its room is stretched across it, up to this factor */
  STRETCH: 2,
} as const;

export const TREASURE = '⚑treasure';

export interface TreasureOptions {
  /** the room across (px at zoom 1): the map fills it when it can (default: as narrow as it can be) */
  readonly width?: number;
  /** how many lines a step's title takes at this width (px); default: an estimate from its length */
  readonly lines?: (id: string, width: number) => number;
}

export interface TreasureLayout {
  readonly X: Record<string, number>;
  readonly Y: (id: string) => number;
  readonly W: number;
  readonly H: number;
  /** each link as a chain of ids (from, its waypoints, to); the last steps lead to the treasure */
  readonly E: readonly string[][];
  /** each link's drawing (an SVG path, same order as E): it leaves a station from the top of its dot and reaches the next
      one at the bottom of its label, so no path ever runs through a title or a code */
  readonly D: readonly string[];
  readonly L: Record<string, number>;
  readonly layers: readonly string[][];
  readonly way: Readonly<Record<string, true>>;
  /** a step's short station code: 1, 2, 3 … from the start upwards, left to right */
  readonly code: Readonly<Record<string, string>>;
  /** each level band: its lowest and highest layer */
  readonly bands: readonly LevelBand[];
  /** the labels' width, each step's number of title lines, a layer's extent above and below its line */
  readonly lw: number;
  readonly lines: Readonly<Record<string, number>>;
  readonly above: (layer: number) => number;
  readonly below: (layer: number) => number;
  /** how many times two links cross (what the ordering left) */
  readonly crossings: number;
}

/** A label's height for a title of n lines. */
export const labelHeight = (n: number): number => TMAP.CODE + n * TMAP.LINE + TMAP.PAD;

const estimateLines = (title: string, width: number): number => Math.max(1, Math.ceil((title.length * 6.6) / Math.max(40, width - 8)));

/** A small seeded random generator (mulberry32): the same numbers for the same seed. */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crossings between two neighbouring layers (positions P, links down from the lower layer). */
function crossBetween(lower: readonly string[], dn: Record<string, string[]>, P: Record<string, number>, meter?: { work: number }): number {
  const seg: [number, number][] = [];
  for (const a of lower) for (const b of dn[a] ?? []) seg.push([P[a] ?? 0, P[b] ?? 0]);
  if (meter) meter.work += seg.length * seg.length;
  let n = 0;
  for (let i = 0; i < seg.length; i++)
    for (let j = i + 1; j < seg.length; j++) {
      const s = seg[i],
        t = seg[j];
      if (s && t && (s[0] - t[0]) * (s[1] - t[1]) < 0) n++;
    }
  return n;
}

/** The treasure map: the layers from the start up (a step pulled up next to the steps it opens when that shortens its
    links, inside its level band); a path that skips layers gets waypoints; each layer is ordered to cut crossings
    (barycentre and median sweeps, then swaps of neighbours); the labels get the width the room allows, x relaxes towards
    the neighbours and the map is spread across its room; the layers are as tall as their longest title. */
export function treasureLayout(c: Pick<Roadmap, 'nodes' | 'edges' | 'levels'>, opt: TreasureOptions = {}): TreasureLayout {
  const MC = mapColumns(c),
    T = TREASURE,
    ids = Object.keys(c.nodes);
  const L: Record<string, number> = {};
  MC.cols.forEach((l, i) => {
    for (const id of l) L[id] = i;
  });
  const links = c.edges.filter(e => L[e.from] !== undefined && (L[e.to] ?? -1) > (L[e.from] ?? 0));
  const kids: Record<string, string[]> = {},
    parents: Record<string, string[]> = {};
  ids.forEach(id => {
    kids[id] = [];
    parents[id] = [];
  });
  links.forEach(e => {
    kids[e.from]?.push(e.to);
    parents[e.to]?.push(e.from);
  });
  const sinks = ids.filter(id => !kids[id]?.length && L[id] !== undefined);
  const top = MC.cols.length;
  // pull a step up next to the steps it opens when it has more links up than down (not a starting step: the start is at
  // the bottom), never out of its level band
  const bandOf = (l: number): LevelBand | undefined => MC.bands.find(b => l >= b.from && l <= b.to);
  for (const id of [...order(c)].reverse()) {
    const ps = parents[id] ?? [],
      ks = kids[id] ?? [];
    if (!ps.length || L[id] === undefined) continue;
    const ups = ks.length || 1; // a last step leads to the treasure
    if (ups <= ps.length) continue;
    const cur = L[id] ?? 0,
      lim = (ks.length ? Math.min(...ks.map(k => L[k] ?? top)) : top) - 1,
      b = bandOf(cur),
      to = b ? Math.min(lim, b.to) : lim;
    if (to > cur) L[id] = to;
  }
  // the layers that hold a step, in order (an empty column of the domain's layout, e.g. no prerequisites part, is dropped)
  const used = [...new Set(Object.values(L))].sort((a, b) => a - b),
    renum: Record<number, number> = {};
  used.forEach((l, i) => (renum[l] = i));
  for (const id of Object.keys(L)) L[id] = renum[L[id] ?? 0] ?? 0;
  const bands = MC.bands
    .map(b => {
      const inside = used.filter(l => l >= b.from && l <= b.to);
      return inside.length ? { level: b.level, from: renum[inside[0] ?? 0] ?? 0, to: renum[inside[inside.length - 1] ?? 0] ?? 0 } : null;
    })
    .filter((b): b is LevelBand => !!b);
  const layers: string[][] = Array.from({ length: used.length }, () => []);
  for (const l of MC.cols) for (const id of l) layers[L[id] ?? 0]?.push(id);
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

  /* ---- the order inside each layer: fewer crossings ---- */
  const pos = (): Record<string, number> => {
    const P: Record<string, number> = {};
    layers.forEach(l => {
      l.forEach((id, i) => (P[id] = i));
    });
    return P;
  };
  // the ordering's work is bounded (pairs of links compared), so a Roadmap of hundreds of steps is drawn at once too;
  // the same budget every time: the same drawing
  const meter = { work: 0 },
    BUDGET = 4e6,
    spent = (): boolean => meter.work > BUDGET;
  const crossings = (): number => {
    const P = pos();
    let n = 0;
    for (let l = 0; l < nl - 1; l++) n += crossBetween(layers[l] ?? [], dn, P, meter);
    return n;
  };
  const key = (id: string, nb: Record<string, string[]>, Q: Record<string, number>, median: boolean): number => {
    const xs = (nb[id] ?? []).map(x => Q[x] ?? 0).sort((a, b) => a - b);
    if (!xs.length) return Q[id] ?? 0;
    if (!median) return xs.reduce((s, x) => s + x, 0) / xs.length;
    const m = xs.length >> 1;
    return xs.length % 2 ? (xs[m] ?? 0) : ((xs[m - 1] ?? 0) + (xs[m] ?? 0)) / 2;
  };
  /** swap neighbours in a layer while that cuts the crossings with the layers below and above (positions kept up to date
      for those three layers only) */
  const transpose = (): void => {
    const P = pos();
    const local = (l: number): number =>
      (l > 0 ? crossBetween(layers[l - 1] ?? [], dn, P, meter) : 0) + (l < nl - 1 ? crossBetween(layers[l] ?? [], dn, P, meter) : 0);
    for (let improved = true, guard = 0; improved && guard < 8 && !spent(); guard++) {
      improved = false;
      for (let l = 0; l < nl && !spent(); l++) {
        const row = layers[l];
        if (!row) continue;
        for (let i = 0; i + 1 < row.length && !spent(); i++) {
          const a = row[i] ?? '',
            b = row[i + 1] ?? '',
            before = local(l);
          row[i] = b;
          row[i + 1] = a;
          P[a] = i + 1;
          P[b] = i;
          if (local(l) < before) improved = true;
          else {
            row[i] = a;
            row[i + 1] = b;
            P[a] = i;
            P[b] = i + 1;
          }
        }
      }
    }
  };
  const sweeps = (rounds: number): void => {
    for (let it = 0; it < rounds; it++) {
      const down = it % 2 === 0,
        median = it % 4 >= 2,
        P0 = pos(),
        idx = [...Array(nl).keys()],
        sweep = down ? idx.slice(1) : idx.reverse().slice(1);
      sweep.forEach(l => {
        const nb = down ? up : dn,
          Q = pos();
        layers[l]?.sort((a, b) => key(a, nb, Q, median) - key(b, nb, Q, median) || (P0[a] ?? 0) - (P0[b] ?? 0));
      });
      if (!spent()) transpose();
      const n = crossings();
      if (n < bestN) {
        bestN = n;
        best = layers.map(l => [...l]);
      }
      if (!bestN) return;
    }
  };
  let best = layers.map(l => [...l]),
    bestN = crossings();
  sweeps(24);
  meter.work = Math.min(meter.work, BUDGET * 0.6); // the first ordering always runs; the fresh starts share what is left
  // the sweeps settle in a local minimum: a few fresh starts (every layer shuffled, the same shuffles every time — the map
  // never moves by itself), as many as a small budget allows for the map's size
  const rand = seeded(0x5eed);
  const size = layers.reduce((s, l) => s + l.length, 0),
    starts = Math.max(2, Math.min(40, Math.floor(6000 / Math.max(1, size))));
  for (let r = 0; r < starts && bestN && !spent(); r++) {
    layers.forEach(l => {
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [l[i], l[j]] = [l[j] ?? '', l[i] ?? ''];
      }
    });
    sweeps(8);
  }
  best.forEach((l, i) => (layers[i] = l));

  /* ---- across: the labels' width, the separations, x ---- */
  const { DOT, LAB_GAP, GAP, WAY_GAP, WAY_WAY, LW_MIN, LW_MAX, MARGIN, LAYER_GAP, TOP, FOOT, STRETCH, MAX_LINES } = TMAP;
  const isStation = (id: string): boolean => !way[id];
  // a layer's span for a label width w: a·w + b (the labels at both ends included)
  const spanOf = (l: readonly string[]): [number, number] => {
    let a = 0,
      b = 0;
    l.forEach((id, i) => {
      const prev = l[i - 1];
      if (prev !== undefined) {
        const s1 = isStation(prev),
          s2 = isStation(id);
        if (s1 && s2) {
          a += 1;
          b += GAP;
        } else if (s1 || s2) {
          a += 0.5;
          b += WAY_GAP;
        } else b += WAY_WAY;
      }
    });
    if (l.length && isStation(l[0] ?? '')) a += 0.5;
    if (l.length && isStation(l[l.length - 1] ?? '')) a += 0.5;
    return [a, b];
  };
  const room = Math.max(0, (opt.width ?? 0) - 2 * MARGIN);
  let lw: number = LW_MAX;
  for (const l of layers) {
    const [a, b] = spanOf(l);
    if (a > 0) lw = Math.min(lw, (room - b) / a);
  }
  lw = Math.floor(Math.max(LW_MIN, Math.min(LW_MAX, lw)));
  const sep = (p: string, q: string): number => {
    const s1 = isStation(p),
      s2 = isStation(q);
    return s1 && s2 ? lw + GAP : s1 || s2 ? lw / 2 + WAY_GAP : WAY_WAY;
  };
  const need = (l: readonly string[]): number => l.slice(1).reduce((s, id, i) => s + sep(l[i] ?? '', id), 0);
  const edgeIn = (id: string | undefined): number => (id !== undefined && isStation(id) ? lw / 2 : 0);
  const inner = Math.max(...layers.map(l => need(l) + edgeIn(l[0]) + edgeIn(l[l.length - 1])));
  const W = Math.ceil(Math.max(inner + 2 * MARGIN, opt.width ?? 0, 2 * MARGIN + lw)),
    X: Record<string, number> = {};
  layers.forEach(l => {
    let x = W / 2 - need(l) / 2;
    l.forEach((id, i) => {
      if (i) x += sep(l[i - 1] ?? '', id);
      X[id] = x;
    });
  });
  const lo = (id: string): number => MARGIN + edgeIn(id),
    hi = (id: string): number => W - MARGIN - edgeIn(id);
  const fit = (l: readonly string[]): void => {
    const xs = l.map(id => X[id] ?? 0),
      n = l.length;
    for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i] ?? 0, (xs[i - 1] ?? 0) + sep(l[i - 1] ?? '', l[i] ?? ''));
    if ((xs[n - 1] ?? 0) > hi(l[n - 1] ?? '')) xs[n - 1] = hi(l[n - 1] ?? '');
    for (let i = n - 2; i >= 0; i--) xs[i] = Math.min(xs[i] ?? 0, (xs[i + 1] ?? 0) - sep(l[i] ?? '', l[i + 1] ?? ''));
    if ((xs[0] ?? 0) < lo(l[0] ?? '')) {
      xs[0] = lo(l[0] ?? '');
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
  // a long link straightened: its waypoints on the line between its two ends (as far as the separations allow)
  for (let it = 0; it < 4; it++)
    for (const ch of E) {
      if (ch.length < 3) continue;
      const a = ch[0] ?? '',
        z = ch[ch.length - 1] ?? '',
        la = L[a] ?? 0,
        lz = L[z] ?? 0;
      ch.slice(1, -1).forEach(w => {
        const t = ((L[w] ?? 0) - la) / Math.max(1, lz - la);
        X[w] = ((X[w] ?? 0) + (X[a] ?? 0) + t * ((X[z] ?? 0) - (X[a] ?? 0))) / 2;
      });
      ch.slice(1, -1).forEach(w => {
        fit(layers[L[w] ?? 0] ?? []);
      });
    }
  // centred, then spread across the room (the order and every separation kept: a uniform stretch about the middle; the
  // labels at both ends keep their own width)
  const all = layers.flat(),
    xs = all.map(k => X[k] ?? 0),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    left = Math.min(...all.map(k => (X[k] ?? 0) - edgeIn(k))),
    right = Math.max(...all.map(k => (X[k] ?? 0) + edgeIn(k))),
    cspan = Math.max(1, maxX - minX),
    usable = W - 2 * MARGIN,
    // the stretch scales the distances between centres; what the labels stick out beyond the outermost centres stays
    k = Math.max(1, Math.min(STRETCH, (usable - (minX - left) - (right - maxX)) / cspan));
  all.forEach(id => (X[id] = minX + ((X[id] ?? 0) - minX) * k));
  const shift = W / 2 - (Math.min(...all.map(i => (X[i] ?? 0) - edgeIn(i))) + Math.max(...all.map(i => (X[i] ?? 0) + edgeIn(i)))) / 2;
  all.forEach(id => (X[id] = (X[id] ?? 0) + shift));

  /* ---- down: each layer as tall as its longest title ---- */
  const lines: Record<string, number> = {};
  for (const id of ids) {
    const n = c.nodes[id];
    if (!n || L[id] === undefined) continue;
    const got = opt.lines ? opt.lines(id, lw) : estimateLines(n.title, lw);
    lines[id] = Math.max(1, Math.min(MAX_LINES, Math.round(got) || 1));
  }
  const below = (l: number): number =>
    l === nl - 1 ? 16 : DOT + LAB_GAP + Math.max(0, ...(layers[l] ?? []).filter(isStation).map(id => labelHeight(lines[id] ?? 1)));
  const above = (l: number): number => (l === nl - 1 ? 16 : DOT);
  const YL: number[] = [];
  YL[nl - 1] = TOP;
  for (let l = nl - 2; l >= 0; l--) YL[l] = (YL[l + 1] ?? 0) + below(l + 1) + LAYER_GAP + above(l);
  const H = Math.ceil((YL[0] ?? 0) + below(0) + FOOT),
    Y = (id: string): number => YL[L[id] ?? 0] ?? 0;

  /* ---- the paths: up from the top of a dot, into the bottom of the next label. Across a layer a long link runs in its
     own lane: straight, slanted along its course as far as the lane is free (never into a label), so it reads as one line */
  const f1 = (v: number): number => +v.toFixed(1);
  const half = (id: string): number => (way[id] ? 2 : id === T ? 24 : lw / 2);
  /** a waypoint's slope (x per px upwards) inside its layer, and where it enters (bottom) and leaves (top) */
  const lane = (ch: readonly string[], i: number): { s: number; xin: number; xout: number } => {
    const id = ch[i] ?? '',
      x = X[id] ?? 0;
    if (!way[id]) return { s: 0, xin: x, xout: x };
    const l = L[id] ?? 0,
      row = layers[l] ?? [],
      j = row.indexOf(id),
      room = (nb: string | undefined): number => {
        if (nb === undefined) return Infinity;
        const gap = Math.abs((X[nb] ?? 0) - x);
        return way[nb] ? (gap - 4) / 2 : gap - half(nb) - 8;
      },
      // at the end of a row: up to the map's margin
      freeL = Math.max(0, Math.min(room(row[j - 1]), x - MARGIN / 2)),
      freeR = Math.max(0, Math.min(room(row[j + 1]), W - MARGIN / 2 - x)),
      p = ch[i - 1] ?? '',
      q = ch[i + 1] ?? '',
      rise = Math.max(1, Y(p) - Y(q));
    let s = ((X[q] ?? 0) - (X[p] ?? 0)) / rise;
    const b = below(l),
      a = above(l);
    // entering at x − s·b, leaving at x + s·a: both inside the lane
    if (s > 0) s = Math.min(s, freeL / b, freeR / a);
    else if (s < 0) s = Math.max(s, -freeR / b, -freeL / a);
    return { s, xin: x - s * b, xout: x + s * a };
  };
  const D = E.map(ch => {
    let d = '',
      prev = { s: 0, xin: 0, xout: 0 },
      prevTop = 0;
    ch.forEach((id, i) => {
      const y = Y(id),
        l = L[id] ?? 0,
        ln = lane(ch, i);
      // where the path reaches this point from below, and where it leaves it upwards
      const inY = id === T ? y + 16 : way[id] ? y + below(l) : y + DOT + LAB_GAP + labelHeight(lines[id] ?? 1),
        outY = y - above(l);
      if (i) {
        // a step's label is shorter than the layer's tallest: the path reaches the layer's lower edge first, then rises
        // straight (under no other label) to this label
        const floor = y + below(l),
          k = (prevTop - floor) * 0.42;
        d += ` C${f1(prev.xout + prev.s * k)} ${f1(prevTop - k)} ${f1(ln.xin - ln.s * k)} ${f1(floor + k)} ${f1(ln.xin)} ${f1(floor)}`;
        if (floor > inY) d += ` L${f1(ln.xin)} ${f1(inY)}`;
      } else d = `M${f1(ln.xout)} ${f1(outY)}`;
      if (i && way[id]) d += ` L${f1(ln.xout)} ${f1(outY)}`;
      prev = ln;
      prevTop = outY;
    });
    return d;
  });
  const code: Record<string, string> = {};
  let n = 0;
  for (const l of layers)
    [...l]
      .filter(id => c.nodes[id])
      .sort((x, y) => (X[x] ?? 0) - (X[y] ?? 0))
      .forEach(id => (code[id] = String(++n)));
  return { X, Y, W, H, E, D, L, layers, way, code, bands, lw, lines, above, below, crossings: bestN };
}

/** The steps lit up when one is selected: itself, its prerequisites and the steps it opens (null: nothing selected). */
export function related(c: Pick<Roadmap, 'edges'>, sel: string | null): Set<string> | null {
  return sel
    ? new Set([sel, ...c.edges.filter(e => e.to === sel).map(e => e.from), ...c.edges.filter(e => e.from === sel).map(e => e.to)])
    : null;
}
