/**
 * A picture's parts in picture units (docs/VISUAL.md §3): their box, centre and area, and the parts an exercise or a
 * figure works on. Whether a point is inside a part is the study domain's rule (domain/grading/regions.ts).
 */
import { hits as hitsRegion, targetsOf } from '../../../domain/grading/regions.ts';
import type { Exercise, Media, Region } from '../../../domain/pack.ts';

export const n0 = (x: number | undefined): number => x ?? 0;

function rBox(r: Region): { x: number; y: number; w: number; h: number } {
  if (r.shape === 'circle') return { x: n0(r.cx) - n0(r.r), y: n0(r.cy) - n0(r.r), w: 2 * n0(r.r), h: 2 * n0(r.r) };
  if (r.shape === 'poly') {
    const P = r.points ?? [];
    const xs = P.map(p => p[0]),
      ys = P.map(p => p[1]);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: n0(r.x), y: n0(r.y), w: n0(r.w), h: n0(r.h) };
}

/** where a part's number, pin or name sits: its anchor, else its centre */
export function rCenter(r: Region): readonly [number, number] {
  if (r.anchor) return r.anchor;
  if (r.shape === 'circle') return [n0(r.cx), n0(r.cy)];
  if (r.shape === 'poly') {
    const P = r.points ?? [];
    return [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];
  }
  return [n0(r.x) + n0(r.w) / 2, n0(r.y) + n0(r.h) / 2];
}

export const rArea = (r: Region): number => {
  const b = rBox(r);
  return b.w * b.h;
};

/** the parts holding the point, smallest first (nested parts win) */
export const hitsAt = (among: readonly Region[], x: number, y: number): Region[] =>
  among.filter(r => hitsRegion(r, x, y)).sort((a, b) => rArea(a) - rArea(b));

/** the regions of an exercise or a figure: its own, else the picture's (docs/VISUAL.md §3) */
export const vRegions = (ex: { readonly regions?: readonly Region[] }, m: Media | undefined): readonly Region[] =>
  ex.regions ?? m?.regions ?? [];

/** the parts an exercise asks about, in its order (the study domain's rule) */
export function vTargets(ex: Exercise, regs: readonly Region[]): Region[] {
  return targetsOf(ex['targets'], regs).flatMap(g => regs.filter(r => r.id === g.id).slice(0, 1));
}

export const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
