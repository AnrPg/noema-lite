/* The typed boundary of the spatial kernel (the code: ./space.js), for the parts the engines typed before its strict TypeScript
   port lands use (the port replaces this file). */
import type { Scene } from './core.js';

/** a numeric field as the kernel reads it: an array or a typed array */
export type Nums = ArrayLike<number>;
/** a side of a grid */
export type SideName = 'left' | 'right' | 'bottom' | 'top';
/** a uniform 1-D or 2-D grid with GHOST ghost nodes per side; at(i, j) → the index of node (i, j) in a padded field */
export interface Grid {
  readonly dim: 1 | 2;
  readonly nx: number;
  readonly ny: number;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly dx: number;
  readonly dy: number;
  readonly periodicX: boolean;
  readonly periodicY: boolean;
  readonly g: number;
  readonly gy: number;
  readonly sx: number;
  readonly rows: number;
  readonly size: number;
  readonly cells: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  at(i: number, j: number): number;
}
/** the options of grid() (missing or non-finite values take the defaults) */
export interface GridOpts {
  readonly dim?: unknown;
  readonly nx?: unknown;
  readonly ny?: unknown;
  readonly x0?: unknown;
  readonly x1?: unknown;
  readonly y0?: unknown;
  readonly y1?: unknown;
  readonly periodicX?: unknown;
  readonly periodicY?: unknown;
}
/** a boundary condition of a side: g a number or one value per node along the side; Robin a·u + b·∂u/∂n = g */
export interface Side {
  readonly type: string;
  readonly g?: number | Nums | null | undefined;
  readonly a?: number | undefined;
  readonly b?: number | undefined;
}
/** the boundary conditions of the sides (a missing side is Neumann 0) */
export type Bounds = Readonly<Partial<Record<SideName, Side | null | undefined>>>;
/** the parameters of a scheme's amplification factor: the diffusion number r, the Courant number C */
export interface SchemeParams {
  readonly r?: number | undefined;
  readonly C?: number | undefined;
}

declare const api: {
  readonly [name: string]: unknown;
  readonly SIDES: readonly SideName[];
  readonly BC_TYPES: readonly string[];
  readonly LIMITERS: Readonly<Record<string, (th: number) => number>>;
  readonly grid: (o: GridOpts | null | undefined) => Grid;
  readonly field: (G: Grid, v?: number) => Float64Array;
  readonly interior: (G: Grid, u: Nums) => Float64Array;
  readonly nearest: (G: Grid, x: number, y: number) => [number, number];
  readonly sample: (G: Grid, u: Nums, x: number, y: number) => number;
  readonly fillGhosts: (G: Grid, u: Float64Array, B: Bounds) => void;
  readonly fixedMask: (G: Grid, B: Bounds) => Uint8Array;
  readonly laplacian: (G: Grid, u: Nums, out: Float64Array, solid?: Uint8Array | null, nine?: boolean) => Float64Array;
  readonly thomas: (a: Nums, b: Nums, c: Nums, d: Float64Array, n: number, w: Float64Array) => Float64Array;
  readonly thomasPeriodic: (a: Nums, b: Nums, c: Nums, d: Float64Array, n: number) => Float64Array;
  readonly ftcsLimit: (G: Grid, D: number) => number;
  readonly waveCourant: (G: Grid, c: number, dt: number) => number;
  readonly amplification: (scheme: string, p: SchemeParams, th: number) => number;
  readonly vonNeumann: (scheme: string, p: SchemeParams) => number;
  readonly latticeNeighbours: (nx: number, ny: number, kind: string, r: number, torus: boolean) => { off: Int32Array; nbr: Int32Array };
  readonly heatmap: (
    sc: Scene,
    vals: Nums,
    nx: number,
    ny: number,
    rect: readonly number[],
    opts?: { readonly lo?: number; readonly hi?: number; readonly levels?: number; readonly maxItems?: number } | null,
  ) => number;
  readonly contour: (
    sc: Scene,
    vals: Nums,
    nx: number,
    ny: number,
    xs: Nums,
    ys: Nums,
    level: number,
    opts?: { readonly maxItems?: number; readonly c?: string; readonly w?: number } | null,
  ) => number;
};
export default api;
