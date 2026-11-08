/* The typed boundary of the vendored robust-predicates@3.0.3 (the code: ./robust-predicates.cjs). Each predicate takes the
   coordinates of its points and gives a number whose sign is exact. */
declare const RP: {
  /** > 0 when a, b, c turn clockwise, < 0 counter-clockwise, 0 when collinear (adaptive exact) */
  readonly orient2d: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => number;
  /** the same determinant in plain floating point */
  readonly orient2dfast: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => number;
  /** > 0 when d lies inside the circle through the counter-clockwise a, b, c, < 0 outside, 0 on it (adaptive exact) */
  readonly incircle: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => number;
  /** the same determinant in plain floating point */
  readonly incirclefast: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => number;
};
export = RP;
