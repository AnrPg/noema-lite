/**
 * The parts of a picture (docs/VISUAL.md §3): rectangles, circles and polygons in the picture's own coordinates.
 */

export interface Region {
  readonly id: string;
  readonly shape?: 'rect' | 'circle' | 'poly' | undefined;
  readonly label?: string | undefined;
  readonly accept?: readonly string[] | undefined;
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly w?: number | undefined;
  readonly h?: number | undefined;
  readonly cx?: number | undefined;
  readonly cy?: number | undefined;
  readonly r?: number | undefined;
  readonly points?: readonly (readonly [number, number])[] | undefined;
}

const n = (x: number | undefined): number => x ?? 0;

/** Is the point (x, y) inside the region? (A polygon by the even–odd rule.) */
export function hits(r: Region, x: number, y: number): boolean {
  if (r.shape === 'circle') return (x - n(r.cx)) ** 2 + (y - n(r.cy)) ** 2 <= n(r.r) ** 2;
  if (r.shape === 'poly') {
    const P = r.points ?? [];
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i] ?? [0, 0],
        [xj, yj] = P[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return x >= n(r.x) && x <= n(r.x) + n(r.w) && y >= n(r.y) && y <= n(r.y) + n(r.h);
}

/** The parts an exercise asks about: its `targets` (in that order), else every region of the picture. */
export const targetsOf = (targets: unknown, regions: readonly Region[]): Region[] =>
  Array.isArray(targets) ? targets.map(id => regions.find(r => r.id === id)).filter((r): r is Region => r !== undefined) : regions.slice();
