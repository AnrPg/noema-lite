# `NoemaSpaceKit` — space for the engine library (`src/engines/kernel/space.ts`)

A kit, not an engine: grids with boundary conditions, finite-difference operators and their stability analysis, neighbourhoods,
graphs used as space, continuous-space neighbour search, toroidal distances, random walks, spatial statistics and two scene
builders. `field@1` (`docs/library/field.md`) and `agents@1` (`docs/library/agents.md`) are built on it; any engine may use it.
Time, events, randomness and output analysis are **not** here: they are NoemaSimKit's (`docs/library/simkit.md`). Functions that
draw take a uniform generator `rng()` — in the engines a `NoemaSimKit.stream(seed, name)`.

Pure, Worker-safe (an ES module the engines import; their Worker bundles carry it), deterministic,
bounded (grids ≤ 200 × 200 in 2-D, ≤ 2000 nodes in 1-D, walks ≤ 200 000 steps, scene builders ≤ their item budget), and it never
throws: bad input gives NaN, −1 or an empty result. Tests: `node tests/lib_space.js` (68 assertions, §8).

## 1. Grids and fields

`grid({dim, nx, ny, x0, x1, y0, y1, periodicX, periodicY})` → a frozen grid `{dim, nx, ny, dx, dy, xs, ys, at(i, j), size, cells, sx,
g, …}`. A bounded axis has nodes on both ends (dx = L/(n − 1)); a periodic axis does not repeat its end (dx = L/n). Every field is a
`Float64Array(G.size)` (`field(G, v)`) with **2 ghost layers** on each side (`GHOST`), so stencils of width 2 (flux limiters) read
ghosts and never test bounds. `at(i, j)` is the storage index of node (i, j); `interior(G, u)` copies the nodes out row by row;
`nearest(G, x, y)` → [i, j]; `sample(G, u, x, y)` is bilinear.

## 2. Boundary conditions (ghost nodes)

`fillGhosts(G, u, B)` with `B = {left, right, bottom, top}`, each `{type, g, a, b}` (`g` a number or an array along the side):

| type | condition | ghost | order |
|---|---|---|---|
| `dirichlet` | u = g | u₀ = g, u₋ₖ = 2g − uₖ (odd reflection) | exact at the node |
| `neumann` | ∂u/∂n = g (outward) | u₋ₖ = uₖ + 2k·h·g | 2 (centred, LeVeque 2007 §2.12) |
| `robin` | a·u + b·∂u/∂n = g | u₋ₖ = uₖ + 2k·h·(g − a·u₀)/b (b = 0: Dirichlet g/a) | 2 |
| `periodic` | wrap | u₋ₖ = u_{n−k} | — |

The x sides are filled on every row first, then the y sides on every padded column, so corners are consistent. `fixedMask(G, B)`
marks the Dirichlet nodes.

## 3. Operators and implicit solves

- `laplacian(G, u, out, solid, nine)`: the 3-point (1-D) and 5-point (2-D) Laplacian; `nine` = the isotropic 9-point stencil
  (Patra & Karttunen 2006; (4·Σedges + Σcorners − 20u)/(6h²), square cells). Specialised loops (no per-node branching).
- `gradient(G, u, i, j)` → [∂u/∂x, ∂u/∂y] centred.
- `thomas(a, b, c, d, n, w)`: the tridiagonal (Thomas) algorithm, in place in d; a zero pivot gives NaN.
- `thomasPeriodic(a, b, c, d, n)`: the cyclic tridiagonal system by Sherman–Morrison (Press et al. 1992 §2.7), for periodic
  implicit steps (BTCS, Crank–Nicolson, ADI).

## 4. Stability (Courant, Friedrichs & Lewy 1928; von Neumann — Charney, Fjørtoft & von Neumann 1950)

| function | value |
|---|---|
| `ftcsLimit(G, D)` | the largest stable FTCS step 1/(2D Σ h⁻²): h²/2D on a line, h²/4D on a square grid |
| `diffusionNumber(G, D, dt)` | r = D Δt Σ h⁻² |
| `courant(G, vx, vy, dt)` | {x, y, max, sum} of |v|Δt/h |
| `waveCourant(G, c, dt)` | c Δt √Σh⁻² |
| `amplification(scheme, {r, C}, θ)` | |G(θ)| of one Fourier mode |
| `vonNeumann(scheme, p)` | max over θ ∈ [0, π] (721 samples, θ = π exactly) |

Amplification factors (Morton & Mayers 2005; Strikwerda 2004): `ftcs` |1 − 4r sin²(θ/2)| (stable r ≤ ½), `btcs`
1/(1 + 4r sin²), `cn` |(1 − 2r s²)/(1 + 2r s²)| (unconditional; |G(π)| → 1 as r grows: slow oscillating decay), `upwind`
√(1 − 2C(1 − C)(1 − cos θ)) (C ≤ 1), `laxwendroff` √(1 − 4C²(1 − C²) s⁴) (C ≤ 1), `laxfriedrichs` √(cos² θ + C² sin² θ),
`centred` √(1 + C² sin² θ) (never stable), `advdiff` FTCS diffusion + upwind (2r + C ≤ 1), `leapfrog` (wave) the larger root of
g² − 2bg + 1 = 0, b = 1 − 2C² s² (|g| = 1 for C ≤ 1: no numerical damping).

Flux limiters φ(θ) (`LIMITERS`; Sweby 1984; LeVeque 2002 §6.12): `minmod` max(0, min(1, θ)), `vanleer` (θ + |θ|)/(1 + |θ|),
`superbee` max(0, min(2θ, 1), min(θ, 2)) (Roe 1986), `mc` max(0, min((1 + θ)/2, 2, 2θ)) (van Leer 1977), and `laxwendroff` (1),
`upwind` (0). All four TVD limiters lie in Sweby's region 0 ≤ φ ≤ min(2θ, 2) with φ(1) = 1.

## 5. Neighbourhoods and lattices

- `offsets(kind, r)`: Moore (Chebyshev ≤ r; (2r + 1)² − 1 cells) or von Neumann (Manhattan ≤ r; 2r(r + 1) cells), r ≤ 5.
- Hexagonal grids in odd-r offset coordinates (Amit Patel, *Hexagonal grids*, Red Blob Games): `hexOffsets(i, j, r)` (3r(r + 1)
  cells), `hexCube`, `hexDist`, `hexCentre` (pointy-top, side 1: neighbours at √3).
- `wrapCell(i, j, nx, ny, torus)` → cell index or −1; `latticeNeighbours(nx, ny, kind, r, torus)` → CSR `{off, nbr}` for every cell
  (`kind` moore | vonneumann | hex; a hex torus needs an even number of rows, otherwise it falls back to walls).

## 6. Continuous space and graphs

- `wrapDelta(d, L)` (the minimal image), `dist(dx, dy, metric)` (euclidean, manhattan, chebyshev), `distance(x1, y1, x2, y2,
  {torus, w, h, metric})`.
- `buckets(w, h, cell, torus)` → `{build(xs, ys, n, alive?), query(x, y, r, fn(k, dx, dy, d²)) → visits}`: a uniform bucket grid
  (≤ 256 × 256) for radius queries, exact (tested against brute force on a torus and within walls), visiting only the buckets the
  circle touches.
- Graphs as space: `adjacency(n, edges, directed)` → CSR `{n, off, nbr, w, m}` (self-loops, out-of-range and non-integer ends
  dropped; weights from `[a, b, w]`), and generators `ring(n, k)`, `erdosRenyi(n, p, rng)` (Erdős & Rényi 1959),
  `wattsStrogatz(n, k, p, rng)` (1998; rewiring keeps n·k edges, no duplicates), `barabasiAlbert(n, m, rng)` (1999, preferential
  attachment), `latticeEdges(nx, ny, torus)`, and `circleLayout(n)`.

## 7. Random walks, spatial statistics, scenes

- `walk(rng, steps, {kind, dim, step, kappa, mu, box, boundary, x0, y0})` → `{x, y, absorbed}`: `lattice` (±step on one axis),
  `gauss` (N(0, step²) per axis), `correlated` (heading + N(0, 1/κ)), `levy` (lengths step·U^(−1/(μ−1)), P(ℓ > L) = L^−(μ−1)); a box
  `[x0, x1, y0, y1]` with `reflect`, `periodic` or `absorb` (the step of absorption in `absorbed`). `msd(paths)` → the mean squared
  displacement at each step (n·ℓ² on a lattice; 2·d·D·t for Brownian steps with 2D = σ²).
- Weights: `latticeWeights(nx, ny, rook | queen | hex, torus)`, `bandWeights(xs, ys, band, {torus, w, h})` (CSR, binary).
- `moranI(vals, W)` → {I, E = −1/(n − 1), V, z} (Moran 1950; the variance under normality, Cliff & Ord 1981 eq. 1.38);
  `gearyC(vals, W)` (Geary 1954: 1 random, < 1 positive, > 1 negative autocorrelation).
- `ripleyK(xs, ys, w, h, rs, corr)` → {K, L = √(K/π)} (Ripley 1976, 1977; Besag 1977) with edge correction `none`, `torus` or
  `border` (Diggle 2003 §4.1); `clarkEvans(xs, ys, w, h, torus)` (Clark & Evans 1954: 1 random, 2 on a square lattice).
- Scenes (roles only, `RAMP = muted, info, ok, warn, bad`): `classOf(v, lo, hi, nc)`; `heatmap(sc, vals, nx, ny, rect, {lo, hi,
  levels, maxItems})` (block means when the field is larger than the budget, runs of a row in one class merged, the lowest class
  left blank; ≤ 1200 polygons by default); `contour(sc, vals, nx, ny, xs, ys, level, {maxItems})` (marching squares, the saddle
  resolved by the cell's centre value; ≤ 600 segments).

## 8. Reference values asserted by `tests/lib_space.js`

| check | value | source |
|---|---|---|
| Laplacian of x², x² + 3y² (5- and 9-point) | 2, 8 to 1e-9 | exact on quadratics |
| discrete Laplacian of sin 2πx (periodic) | −(2/h²)(1 − cos kh)·u | symbol |
| Thomas, cyclic Thomas | round-off | — |
| FTCS r = 0.6 | max |G| = 1.4 | 1 − 4r |
| CN r = 50, θ = π | 99/101 | formula |
| centred advection C = 0.5 | √1.25 | formula |
| Moore / von Neumann / hex counts | 8, 24 / 4, 12 / 6, 18, 36 | — |
| bucket queries | identical to brute force | — |
| G(400, 0.02) mean degree | 7.98 ± 0.8 | p(n − 1) |
| lattice walk MSD(100), 2000 walks | 100 ± 6 % | n ℓ² |
| gambler's ruin from 10 in (−1, 21) | 121 ± 12 % | a·b |
| Moran's I, checkerboard 8 × 8 rook | −1 exactly; E = −1/63 | — |
| Geary's C, checkerboard | 63/32 | — |
| Moran's I, two halves | 6/7 | (n/S₀)Σwzz/Σz² |
| Ripley's L under CSR (400 points, torus) | r ± 0.012 | Besag 1977 |
| Clark–Evans, square lattice / random | 2 / 1 ± 0.08 | Clark & Evans 1954 |
