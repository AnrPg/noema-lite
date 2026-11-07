/* ===================== NoemaSpaceKit — the spatial part of the simulation kernel of the engine library (docs/library/space.md) =====================
   Shared by field@1 (fields on grids, cellular automata) and agents@1 (agent-based models); the time / event / randomness / output
   analysis part is NoemaSimKit (46_lib_simkit.js). Pure JS, no DOM, no clock, no randomness of its own (generators take an rng
   function), every loop bounded by its arguments; it never throws on numbers (NaN goes through). Worker-safe: source() gives the
   text that defines self.NoemaSpaceKit in a Worker (the same code, Function.toString).
     • grids: uniform 1-D / 2-D node grids with a ghost layer of width 2 (padded Float64Array), periodic or bounded per axis;
     • boundary conditions by ghost nodes: Dirichlet, Neumann (outward normal derivative), Robin (a·u + b·∂u/∂n = g), periodic
       (LeVeque 2007 §2.12, §9.1; Morton & Mayers 2005 §2.10, §3.4); insulated or fixed-value obstacles;
     • stencils: the 3/5-point Laplacian and the 9-point isotropic one (Patra & Karttunen 2006), central gradients, Thomas's
       tridiagonal solver and its periodic (Sherman–Morrison) form (for Crank–Nicolson and ADI);
     • stability: the FTCS diffusion limit, Courant numbers (Courant, Friedrichs & Lewy 1928), the von Neumann amplification factor
       of every scheme field@1 runs (Strikwerda 2004 ch. 2–3; Morton & Mayers 2005 §2.7, §4.4);
     • neighbourhoods: Moore, von Neumann and hexagonal of any radius, torus wrapping; distances (Euclid, Manhattan, Chebyshev,
       toroidal minimal image); random walks (lattice, Gaussian, correlated, Lévy) and their mean squared displacement;
       spatial statistics: Moran's I and Geary's C over lattice or distance-band weights, Ripley's K / Besag's L, Clark–Evans R; spatial bucket index for radius queries in a continuous
       2-D space (torus minimal image); networks: CSR adjacency, ring, lattice, Erdős–Rényi 1959, Watts–Strogatz 1998, Barabási–Albert 1999;
     • scenes of fields within the 2000-item budget: a coarse heat map of poly cells (value classes → roles), marching-squares
       contour segments (Lorensen & Cline 1987), a space–time diagram of a 1-D field.
   Tests: node tests/lib_space.js. */
  /* i18n-ignore-start */   // code, not text
  const MAX_N = 200, MAX_N1 = 2000, MAX_CELLS = 40000, GHOST = 2;
  const SIDES = ['left', 'right', 'bottom', 'top'];
  const BC_TYPES = ['dirichlet', 'neumann', 'robin', 'periodic'];
  const RAMP = ['muted', 'info', 'ok', 'warn', 'bad'];          // the role ramp of a heat map, low → high (roles, never colours)
  const fin = Number.isFinite;

  /* ---------- grids ----------
     grid({dim, nx, ny, x0, x1, y0, y1, periodicX, periodicY}) → G
     Nodes: bounded axis x_i = x0 + i·dx, dx = (x1 − x0)/(nx − 1) (both ends are nodes); periodic axis dx = (x1 − x0)/nx (x_nx ≡ x_0).
     Storage: a padded array with GHOST = 2 ghost nodes on every bounded or periodic side of an axis that exists (1-D: one row). */
  function grid(o) {
    const dim = o && o.dim === 2 ? 2 : 1;
    const nx = Math.max(2, Math.min(dim === 2 ? MAX_N : MAX_N1, Math.floor(o && o.nx) || 2));
    const ny = dim === 2 ? Math.max(2, Math.min(MAX_N, Math.floor(o && o.ny) || nx)) : 1;
    const x0 = fin(o && o.x0) ? o.x0 : 0, x1 = fin(o && o.x1) ? o.x1 : 1;
    const y0 = dim === 2 && fin(o.y0) ? o.y0 : 0, y1 = dim === 2 && fin(o.y1) ? o.y1 : (dim === 2 ? 1 : 0);
    const px = !!(o && o.periodicX), py = dim === 2 && !!(o && o.periodicY);
    const dx = (x1 - x0) / (px ? nx : nx - 1), dy = dim === 2 ? (y1 - y0) / (py ? ny : ny - 1) : 1;
    const g = GHOST, sx = nx + 2 * g, gy = dim === 2 ? g : 0, rows = ny + 2 * gy;
    const xs = new Float64Array(nx), ys = new Float64Array(ny);
    for (let i = 0; i < nx; i++) xs[i] = x0 + i * dx;
    for (let j = 0; j < ny; j++) ys[j] = dim === 2 ? y0 + j * dy : 0;
    const at = (i, j) => (j + gy) * sx + i + g;
    return Object.freeze({ dim, nx, ny, x0, x1, y0, y1, dx, dy, periodicX: px, periodicY: py, g, gy, sx, rows, size: sx * rows, cells: nx * ny, xs, ys, at });
  }
  const field = (G, v) => { const u = new Float64Array(G.size); if (v) u.fill(v); return u; };
  /** the interior nodes of a padded field, row by row (j outer) */
  function interior(G, u) { const r = new Float64Array(G.cells); let k = 0; for (let j = 0; j < G.ny; j++) { const b = G.at(0, j); for (let i = 0; i < G.nx; i++) r[k++] = u[b + i]; } return r; }
  /** index of the node nearest to (x, y) → [i, j] (clamped) */
  function nearest(G, x, y) {
    const i = Math.max(0, Math.min(G.nx - 1, Math.round((x - G.x0) / G.dx)));
    const j = G.dim === 2 ? Math.max(0, Math.min(G.ny - 1, Math.round((y - G.y0) / G.dy))) : 0;
    return [i, j];
  }
  /** bilinear interpolation of a padded field at (x, y) (clamped to the domain) */
  function sample(G, u, x, y) {
    const fx = Math.max(0, Math.min(G.nx - 1, (x - G.x0) / G.dx)), i = Math.min(G.nx - 2, Math.floor(fx)), a = fx - i;
    if (G.dim === 1) return u[G.at(i, 0)] * (1 - a) + u[G.at(i + 1, 0)] * a;
    const fy = Math.max(0, Math.min(G.ny - 1, (y - G.y0) / G.dy)), j = Math.min(G.ny - 2, Math.floor(fy)), b = fy - j;
    return (u[G.at(i, j)] * (1 - a) + u[G.at(i + 1, j)] * a) * (1 - b) + (u[G.at(i, j + 1)] * (1 - a) + u[G.at(i + 1, j + 1)] * a) * b;
  }

  /* ---------- boundary conditions by ghost nodes ----------
     B = {left, right, bottom, top}: {type: dirichlet | neumann | robin | periodic, g (number, or an array along the side), a, b}.
     Neumann and Robin use the OUTWARD normal derivative ∂u/∂n, mirrored about the boundary node (second order, LeVeque 2007 §2.12):
       Neumann ∂u/∂n = g:          u_{−k} = u_k + 2k·h·g
       Robin  a·u + b·∂u/∂n = g:   u_{−k} = u_k + 2k·h·(g − a·u_0)/b        (b ≠ 0; b = 0 is Dirichlet g/a)
       Dirichlet u = g:            u_0 = g, u_{−k} = 2g − u_k (odd reflection)
       periodic:                   u_{−k} = u_{n−k}, u_{n−1+k} = u_{k−1}
     The x sides are filled first on every row, then the y sides on every padded column (the corners stay consistent). */
  const gv = (s, k) => (s == null ? 0 : typeof s.g === 'number' ? s.g : s.g && fin(s.g[k]) ? s.g[k] : 0);
  function side1(u, base, stride, n, h, s, k, last) {
    // base = index of the boundary node, stride = step inwards (+1 / +sx) or outwards for the right / top side
    const t = s ? s.type : 'neumann';
    if (t === 'periodic') return;   // done by wrap
    const g = gv(s, k);
    if (t === 'dirichlet' || (t === 'robin' && !(s.b !== 0 && fin(s.b)))) {
      const val = t === 'dirichlet' ? g : g / (s.a || 1);
      u[base] = val; for (let q = 1; q <= GHOST; q++) u[base - q * stride] = 2 * val - u[base + q * stride];
    } else if (t === 'robin') {
      const d = (g - (s.a || 0) * u[base]) / s.b; for (let q = 1; q <= GHOST; q++) u[base - q * stride] = u[base + q * stride] + 2 * q * h * d;
    } else for (let q = 1; q <= GHOST; q++) u[base - q * stride] = u[base + q * stride] + 2 * q * h * g;
    return last;
  }
  function fillGhosts(G, u, B) {
    const { nx, ny, sx, g } = G;
    const L = B.left, R = B.right;
    for (let j = 0; j < ny; j++) {
      const b0 = G.at(0, j), b1 = G.at(nx - 1, j);
      if (G.periodicX) for (let q = 1; q <= g; q++) { u[b0 - q] = u[b1 + 1 - q]; u[b1 + q] = u[b0 + q - 1]; }
      else { side1(u, b0, 1, nx, G.dx, L, j); side1(u, b1, -1, nx, G.dx, R, j); }
    }
    if (G.dim === 2) {
      const Bt = B.bottom, T = B.top;
      for (let i = -g; i < nx + g; i++) {
        const b0 = G.at(i, 0), b1 = G.at(i, ny - 1), k = Math.max(0, Math.min(nx - 1, i));
        if (G.periodicY) for (let q = 1; q <= g; q++) { u[b0 - q * sx] = u[b1 + (1 - q) * sx]; u[b1 + q * sx] = u[b0 + (q - 1) * sx]; }
        else if (i >= 0 && i < nx) { side1(u, b0, sx, ny, G.dy, Bt, k); side1(u, b1, -sx, ny, G.dy, T, k); }
        else {   // corner ghosts: mirror in y only (values of the x ghosts already set)
          for (let q = 1; q <= g; q++) { u[b0 - q * sx] = u[b0 + q * sx]; u[b1 + q * sx] = u[b1 - q * sx]; }
        }
      }
    }
  }
  /** the nodes held by Dirichlet sides (1) — the schemes leave them as fillGhosts set them */
  function fixedMask(G, B) {
    const m = new Uint8Array(G.size), d = s => s && (s.type === 'dirichlet' || (s.type === 'robin' && !(s.b !== 0 && fin(s.b))));
    if (!G.periodicX) for (let j = 0; j < G.ny; j++) { if (d(B.left)) m[G.at(0, j)] = 1; if (d(B.right)) m[G.at(G.nx - 1, j)] = 1; }
    if (G.dim === 2 && !G.periodicY) for (let i = 0; i < G.nx; i++) { if (d(B.bottom)) m[G.at(i, 0)] = 1; if (d(B.top)) m[G.at(i, G.ny - 1)] = 1; }
    return m;
  }

  /* ---------- stencils ---------- */
  /** out = ∇²u on the interior (3-point in 1-D, 5-point in 2-D, or the isotropic 9-point of Patra & Karttunen 2006 when nine);
      solid (a padded Uint8Array, optional): a solid neighbour reflects the centre value (no flux through an insulated obstacle) */
  function laplacian(G, u, out, solid, nine) {
    const { nx, ny, sx } = G, ix2 = 1 / (G.dx * G.dx), iy2 = 1 / (G.dy * G.dy);
    if (G.dim === 1) {
      const k0 = G.at(0, 0);
      if (!solid) for (let k = k0; k < k0 + nx; k++) out[k] = (u[k - 1] - 2 * u[k] + u[k + 1]) * ix2;
      else for (let k = k0; k < k0 + nx; k++) { const c = u[k], w = solid[k - 1] ? c : u[k - 1], e = solid[k + 1] ? c : u[k + 1]; out[k] = (w - 2 * c + e) * ix2; }
      return out;
    }
    if (nine) {   // (4·edges + corners − 20·c) / (6h²), for dx = dy
      const f = ix2 / 6;
      for (let j = 0; j < ny; j++) { let k = G.at(0, j); for (let i = 0; i < nx; i++, k++) {
        const c = u[k], pick = q => (solid && solid[q] ? c : u[q]);
        const ed = pick(k - 1) + pick(k + 1) + pick(k - sx) + pick(k + sx), co = pick(k - 1 - sx) + pick(k + 1 - sx) + pick(k - 1 + sx) + pick(k + 1 + sx);
        out[k] = (4 * ed + co - 20 * c) * f; } }
      return out;
    }
    const cc = 2 * (ix2 + iy2);
    for (let j = 0; j < ny; j++) {
      const k0 = G.at(0, j), k1 = k0 + nx;
      if (!solid) for (let k = k0; k < k1; k++) out[k] = (u[k - 1] + u[k + 1]) * ix2 + (u[k - sx] + u[k + sx]) * iy2 - cc * u[k];
      else for (let k = k0; k < k1; k++) {
        const c = u[k], w = solid[k - 1] ? c : u[k - 1], e = solid[k + 1] ? c : u[k + 1], s = solid[k - sx] ? c : u[k - sx], n = solid[k + sx] ? c : u[k + sx];
        out[k] = (w - 2 * c + e) * ix2 + (s - 2 * c + n) * iy2;
      }
    }
    return out;
  }
  /** central gradient at node (i, j) → [∂u/∂x, ∂u/∂y] (ghosts give the boundary values) */
  function gradient(G, u, i, j) {
    const k = G.at(i, j);
    return [(u[k + 1] - u[k - 1]) / (2 * G.dx), G.dim === 2 ? (u[k + G.sx] - u[k - G.sx]) / (2 * G.dy) : 0];
  }
  /** Thomas's algorithm: a_i x_{i−1} + b_i x_i + c_i x_{i+1} = d_i, i = 0..n−1 (a_0, c_{n−1} unused); x written in d.
      Stable without pivoting for diagonally dominant systems (Golub & Van Loan 2013 §4.3). w: a scratch of n */
  function thomas(a, b, c, d, n, w) {
    let bb = b[0];
    if (bb === 0) { for (let i = 0; i < n; i++) d[i] = NaN; return d; }
    d[0] /= bb;
    for (let i = 1; i < n; i++) { w[i] = c[i - 1] / bb; bb = b[i] - a[i] * w[i]; if (bb === 0) { for (let q = 0; q < n; q++) d[q] = NaN; return d; } d[i] = (d[i] - a[i] * d[i - 1]) / bb; }
    for (let i = n - 2; i >= 0; i--) d[i] -= w[i + 1] * d[i + 1];
    return d;
  }
  /** the cyclic tridiagonal system (a_0 couples x_{n−1}, c_{n−1} couples x_0) by Sherman–Morrison (Press et al., Numerical Recipes
      2nd ed. 1992 §2.7); scratch arrays are allocated (n ≤ 200) */
  function thomasPeriodic(a, b, c, d, n) {
    if (n < 3) return thomas(a, b, c, d, n, new Float64Array(n));
    const gam = -b[0], bb = Float64Array.from(b), u = new Float64Array(n), w = new Float64Array(n);
    bb[0] = b[0] - gam; bb[n - 1] = b[n - 1] - a[0] * c[n - 1] / gam;
    thomas(a, bb, c, d, n, w);
    u[0] = gam; u[n - 1] = c[n - 1];
    thomas(a, bb, c, u, n, w);
    const fact = (d[0] + a[0] * d[n - 1] / gam) / (1 + u[0] + a[0] * u[n - 1] / gam);
    for (let i = 0; i < n; i++) d[i] -= fact * u[i];
    return d;
  }

  /* ---------- stability (Courant, Friedrichs & Lewy 1928; von Neumann: Charney, Fjørtoft & von Neumann 1950; Strikwerda 2004) ---------- */
  const inv2 = G => 1 / (G.dx * G.dx) + (G.dim === 2 ? 1 / (G.dy * G.dy) : 0);
  /** the largest stable FTCS step for u_t = D∇²u: dt ≤ 1 / (2D·Σ 1/h²) (Morton & Mayers 2005 §2.7, §3.2) */
  const ftcsLimit = (G, D) => (D > 0 ? 1 / (2 * D * inv2(G)) : Infinity);
  /** the diffusion number r = D·dt·Σ 1/h² (FTCS stable for r ≤ 1/2) */
  const diffusionNumber = (G, D, dt) => D * dt * inv2(G);
  /** Courant number of advection with velocity (vx, vy), per axis (split schemes: each ≤ 1) and summed (unsplit upwind: ≤ 1) */
  function courant(G, vx, vy, dt) { const cx = Math.abs(vx) * dt / G.dx, cy = G.dim === 2 ? Math.abs(vy || 0) * dt / G.dy : 0; return { max: Math.max(cx, cy), sum: cx + cy, x: cx, y: cy }; }
  /** Courant number of the wave equation u_tt = c²∇²u for leapfrog: c·dt·√(Σ 1/h²) ≤ 1 (CFL 1928) */
  const waveCourant = (G, c, dt) => Math.abs(c) * dt * Math.sqrt(inv2(G));
  /** |G(θ)| of a scheme at wave number θ = k·h (p: {r, C}); the formulas of Strikwerda 2004 §2.2, §3.1, Morton & Mayers §2.7, §4.4 */
  function amplification(scheme, p, th) {
    const r = p.r || 0, C = p.C || 0, s2 = Math.sin(th / 2) ** 2, cs = Math.cos(th), sn = Math.sin(th);
    switch (scheme) {
      case 'ftcs': return Math.abs(1 - 4 * r * s2);
      case 'btcs': return 1 / (1 + 4 * r * s2);
      case 'cn': return Math.abs((1 - 2 * r * s2) / (1 + 2 * r * s2));
      case 'upwind': return Math.sqrt(Math.max(0, 1 - 2 * C * (1 - C) * (1 - cs)));
      case 'laxwendroff': return Math.sqrt(Math.max(0, 1 - 4 * C * C * (1 - C * C) * s2 * s2));
      case 'laxfriedrichs': return Math.sqrt(cs * cs + C * C * sn * sn);
      case 'centred': return Math.sqrt(1 + C * C * sn * sn);
      case 'advdiff': { const re = 1 - 4 * r * s2 - C * (1 - cs), im = C * sn; return Math.hypot(re, im); }   // FTCS diffusion + upwind advection
      case 'leapfrog': { const b = 1 - 2 * C * C * s2, disc = b * b - 1; return disc <= 0 ? 1 : Math.abs(b) + Math.sqrt(disc); }   // roots of g² − 2bg + 1
      default: return NaN;
    }
  }
  /** max over θ ∈ [0, π] of |G(θ)| (721 samples and θ = π exactly) */
  function vonNeumann(scheme, p) { let m = 0; for (let q = 0; q <= 720; q++) { const a = amplification(scheme, p, Math.PI * q / 720); if (!(a <= m)) m = a; } return m; }
  const SCHEMES = ['ftcs', 'btcs', 'cn', 'upwind', 'laxwendroff', 'laxfriedrichs', 'centred', 'advdiff', 'leapfrog'];

  /* ---------- flux limiters (Sweby 1984; van Leer 1974; Roe 1986 superbee; LeVeque 2002 §6.12) ---------- */
  const LIMITERS = {
    minmod: th => Math.max(0, Math.min(1, th)),
    vanleer: th => (th + Math.abs(th)) / (1 + Math.abs(th)),
    superbee: th => Math.max(0, Math.min(2 * th, 1), Math.min(th, 2)),
    mc: th => Math.max(0, Math.min((1 + th) / 2, 2, 2 * th)),
    laxwendroff: () => 1,
    upwind: () => 0,
  };

  /* ---------- neighbourhoods ---------- */
  /** offsets [[di, dj], …] of the Moore (Chebyshev ≤ r) or von Neumann (Manhattan ≤ r) neighbourhood, without the centre */
  function offsets(kind, r) {
    r = Math.max(1, Math.min(5, Math.floor(r) || 1));
    const out = [];
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (!di && !dj) continue;
      if (kind === 'vonneumann' ? Math.abs(di) + Math.abs(dj) <= r : true) out.push([di, dj]);
    }
    return out;
  }
  /** a cell index on an nx × ny lattice after an offset, wrapped on a torus or −1 outside */
  function wrapCell(i, j, nx, ny, torus) {
    if (torus) { i = ((i % nx) + nx) % nx; j = ((j % ny) + ny) % ny; } else if (i < 0 || j < 0 || i >= nx || j >= ny) return -1;
    return j * nx + i;
  }
  /** for every cell of an nx × ny lattice, its neighbour cells: CSR {off, nbr} */
  function latticeNeighbours(nx, ny, kind, r, torus) {
    const O = kind === 'hex' ? null : offsets(kind, r), n = nx * ny, off = new Int32Array(n + 1), tmp = [];
    const tor = kind === 'hex' ? torus && ny % 2 === 0 : torus;   // a hex torus needs an even number of rows
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i, cand = O ? O.map(([di, dj]) => [i + di, j + dj]) : hexOffsets(i, j, r);
      const seen = new Set(); for (const [p, q2] of cand) { const q = wrapCell(p, q2, nx, ny, tor); if (q >= 0 && q !== c && !seen.has(q)) { seen.add(q); tmp.push(q); } } off[c + 1] = tmp.length; }
    return { off, nbr: Int32Array.from(tmp) };
  }
  /** the shortest signed difference on a periodic axis of length L (the minimal image) */
  const wrapDelta = (d, L) => (L > 0 ? d - L * Math.round(d / L) : d);

  /* ---------- a spatial bucket index for radius queries in a continuous 2-D space [0, w) × [0, h) ---------- */
  function buckets(w, h, cell, torus) {
    const cs = Math.max(cell, Math.max(w, h) / 256), bx = Math.max(1, Math.floor(w / cs)), by = Math.max(1, Math.floor(h / cs));
    const cw = w / bx, ch = h / by;
    let head = new Int32Array(bx * by), next = new Int32Array(0), X = null, Y = null, N = 0;
    const bin = (x, y) => { let i = Math.floor(x / cw), j = Math.floor(y / ch); i = Math.max(0, Math.min(bx - 1, i)); j = Math.max(0, Math.min(by - 1, j)); return j * bx + i; };
    return {
      bx, by,
      /** index n points (xs, ys; alive(k) optional) */
      build(xs, ys, n, alive) {
        X = xs; Y = ys; N = n; head.fill(-1); if (next.length < n) next = new Int32Array(Math.max(n, 16));
        for (let k = 0; k < n; k++) { if (alive && !alive(k)) continue; if (!fin(xs[k]) || !fin(ys[k])) continue; const b = bin(xs[k], ys[k]); next[k] = head[b]; head[b] = k; }
      },
      /** fn(k, dx, dy, d²) for every indexed point within r of (x, y) (dx = x_k − x, minimal image on a torus); → visits */
      query(x, y, r, fn) {
        const ri = Math.ceil(r / cw), rj = Math.ceil(r / ch), ci = Math.floor(x / cw), cj = Math.floor(y / ch), r2 = r * r;
        let visits = 0;
        const si = Math.min(ri, Math.floor((bx - 1) / 2)), sj = Math.min(rj, Math.floor((by - 1) / 2));   // never the same bucket twice on a torus
        const i0 = torus ? ci - si : Math.max(0, ci - ri), i1 = torus ? ci + (2 * si + 1 >= bx ? bx - 1 - si : si) : Math.min(bx - 1, ci + ri);
        const j0 = torus ? cj - sj : Math.max(0, cj - rj), j1 = torus ? cj + (2 * sj + 1 >= by ? by - 1 - sj : sj) : Math.min(by - 1, cj + rj);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const ii = torus ? ((i % bx) + bx) % bx : i, jj = torus ? ((j % by) + by) % by : j;
          for (let k = head[jj * bx + ii]; k >= 0; k = next[k]) {
            visits++;
            let dx = X[k] - x, dy = Y[k] - y; if (torus) { dx = wrapDelta(dx, w); dy = wrapDelta(dy, h); }
            const d2 = dx * dx + dy * dy; if (d2 <= r2) fn(k, dx, dy, d2);
          }
        }
        return visits;
      },
      size: () => N,
    };
  }

  /* ---------- networks (an edge list → CSR; generators take an rng() in (0,1)) ---------- */
  function adjacency(n, edges, directed) {
    const deg = new Int32Array(n + 1), E = [];
    for (const e of edges || []) {
      const a = e[0], b = e[1], w = fin(e[2]) ? e[2] : 1;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) continue;
      E.push([a, b, w]); deg[a + 1]++; if (!directed) deg[b + 1]++;
    }
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    const nbr = new Int32Array(deg[n]), wt = new Float64Array(deg[n]), fill = deg.slice(0, n);
    for (const [a, b, w] of E) { nbr[fill[a]] = b; wt[fill[a]++] = w; if (!directed) { nbr[fill[b]] = a; wt[fill[b]++] = w; } }
    return { n, off: deg, nbr, w: wt, m: E.length };
  }
  /** ring lattice: every node joined to its k nearest on each side */
  function ring(n, k) { const E = []; k = Math.max(1, Math.min(Math.floor((n - 1) / 2), k || 1)); for (let i = 0; i < n; i++) for (let q = 1; q <= k; q++) E.push([i, (i + q) % n]); return E; }
  /** Erdős & Rényi 1959 G(n, p) */
  function erdosRenyi(n, p, rng) { const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rng() < p) E.push([i, j]); return E; }
  /** Watts & Strogatz 1998: a ring of k neighbours a side, each edge's far end rewired with probability p (no loops, no duplicates) */
  function wattsStrogatz(n, k, p, rng) {
    const E = ring(n, k), key = (a, b) => (a < b ? a * n + b : b * n + a), S = new Set(E.map(e => key(e[0], e[1])));
    for (const e of E) if (rng() < p) {
      for (let tries = 0; tries < 32; tries++) { const c = Math.floor(rng() * n); if (c !== e[0] && !S.has(key(e[0], c))) { S.delete(key(e[0], e[1])); e[1] = c; S.add(key(e[0], c)); break; } }
    }
    return E;
  }
  /** Barabási & Albert 1999: start from a clique of m + 1, each new node joins m distinct nodes chosen by degree */
  function barabasiAlbert(n, m, rng) {
    m = Math.max(1, Math.min(n - 1, m || 1)); const E = [], ends = [];
    for (let i = 0; i <= m && i < n; i++) for (let j = 0; j < i; j++) { E.push([j, i]); ends.push(i, j); }
    for (let v = m + 1; v < n; v++) {
      const chosen = new Set();
      for (let tries = 0; chosen.size < m && tries < 64 * m; tries++) chosen.add(ends[Math.floor(rng() * ends.length)]);
      for (const u of chosen) { E.push([u, v]); ends.push(u, v); }
    }
    return E;
  }
  /** the square lattice of nx × ny nodes as edges (von Neumann neighbours), on a torus when asked */
  function latticeEdges(nx, ny, torus) {
    const E = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (i + 1 < nx || (torus && nx > 2)) E.push([c, j * nx + (i + 1) % nx]);
      if (j + 1 < ny || (torus && ny > 2)) E.push([c, ((j + 1) % ny) * nx + i]);
    }
    return E;
  }
  /** a circle layout of n nodes in [0, 1]² (for the scene) */
  function circleLayout(n) { const X = new Float64Array(n), Y = new Float64Array(n); for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; X[i] = 0.5 + 0.45 * Math.cos(a); Y[i] = 0.5 + 0.45 * Math.sin(a); } return [X, Y]; }

  /* ---------- scenes of a field (≤ the budget of items; roles only) ---------- */
  /** the class 0..nc−1 of v between lo and hi */
  const classOf = (v, lo, hi, nc) => (!fin(v) ? -1 : hi > lo ? Math.max(0, Math.min(nc - 1, Math.floor((v - lo) / (hi - lo) * nc))) : 0);
  /** a coarse heat map of a 2-D (or a 1-D: one row) set of values vals[j*nx + i] on the rectangle [x0, x1] × [y0, y1]:
      block means on at most maxCells blocks, then the cells of each row with the same class merged into one filled poly; the lowest
      class is left out (the background); → items pushed into the scene sc (C.scene). opts {lo, hi, levels ≤ 5, maxItems} */
  function heatmap(sc, vals, nx, ny, rect, opts) {
    const o = opts || {}, nc = Math.max(2, Math.min(RAMP.length, o.levels || 5)), maxItems = Math.max(8, Math.min(1800, o.maxItems || 1200));
    let lo = o.lo, hi = o.hi;
    if (!fin(lo) || !fin(hi)) { lo = Infinity; hi = -Infinity; for (const v of vals) if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!fin(lo)) return 0;
    // blocks: bx × by cells of the field per block, so that the blocks ≤ maxItems·2 (the merging leaves fewer polys)
    let b = 1; while (Math.ceil(nx / b) * Math.ceil(ny / b) > maxItems * 2) b++;
    const mx = Math.ceil(nx / b), my = Math.ceil(ny / b), [x0, x1, y0, y1] = rect, w = (x1 - x0) / mx, h = (y1 - y0) / my;
    const cls = new Int8Array(mx * my);
    for (let J = 0; J < my; J++) for (let I = 0; I < mx; I++) {
      let s = 0, c = 0; for (let j = J * b; j < Math.min(ny, (J + 1) * b); j++) for (let i = I * b; i < Math.min(nx, (I + 1) * b); i++) { const v = vals[j * nx + i]; if (fin(v)) { s += v; c++; } }
      cls[J * mx + I] = c ? classOf(s / c, lo, hi, nc) : -1;
    }
    let n = 0;
    for (let J = 0; J < my && n < maxItems; J++) {
      let I = 0;
      while (I < mx && n < maxItems) {
        const k = cls[J * mx + I]; let E = I + 1; while (E < mx && cls[J * mx + E] === k) E++;
        if (k > 0) { const xa = x0 + I * w, xb = x0 + E * w, ya = y0 + J * h, yb = ya + h; sc.poly([xa, ya, xb, ya, xb, yb, xa, yb], { c: RAMP[Math.round(k * (RAMP.length - 1) / (nc - 1))], fill: true }); n++; }
        I = E;
      }
    }
    return n;
  }
  /** marching squares (Lorensen & Cline 1987 in 2-D) of vals[j*nx + i] at level, segments in model coordinates; → segments */
  function contour(sc, vals, nx, ny, xs, ys, level, opts) {
    const o = opts || {}, maxItems = o.maxItems || 600; let n = 0;
    const V = (i, j) => vals[j * nx + i];
    const lerp = (a, b, va, vb) => a + (b - a) * ((level - va) / (vb - va));
    for (let j = 0; j + 1 < ny && n < maxItems; j++) for (let i = 0; i + 1 < nx && n < maxItems; i++) {
      const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      if (![a, b, c, d].every(fin)) continue;
      const idx = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const P = [];   // crossings on the edges bottom, right, top, left
      const xa = xs[i], xb = xs[i + 1], ya = ys[j], yb = ys[j + 1];
      if ((a >= level) !== (b >= level)) P.push([lerp(xa, xb, a, b), ya]);
      if ((b >= level) !== (c >= level)) P.push([xb, lerp(ya, yb, b, c)]);
      if ((d >= level) !== (c >= level)) P.push([lerp(xa, xb, d, c), yb]);
      if ((a >= level) !== (d >= level)) P.push([xa, lerp(ya, yb, a, d)]);
      if (P.length === 2) { sc.seg(P[0][0], P[0][1], P[1][0], P[1][1], { c: o.c || 'hi', w: o.w || 1.5 }); n++; }
      else if (P.length === 4) {   // a saddle: resolve by the centre value
        const mid = (a + b + c + d) / 4 >= level;
        const pairs = (mid === (a >= level)) ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
        for (const [p, q] of pairs) { sc.seg(P[p][0], P[p][1], P[q][0], P[q][1], { c: o.c || 'hi', w: o.w || 1.5 }); n++; }
      }
    }
    return n;
  }

  /* ---------- hexagonal lattices (offset "odd-r" storage, cube coordinates for distances; Patel, Red Blob Games 2013; Birch et al. 2007) ---------- */
  /** odd-r offset (i, j) → cube (x, y, z), x + y + z = 0 */
  const hexCube = (i, j) => { const x = i - (j - (j & 1)) / 2, z = j; return [x, -x - z, z]; };
  /** the hex distance between two cells of an odd-r lattice */
  const hexDist = (i1, j1, i2, j2) => { const a = hexCube(i1, j1), b = hexCube(i2, j2); return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); };
  /** the cells within hex distance r of (i, j) → [[i, j], …] without the centre (6 at r = 1, 3r(r+1) in all) */
  function hexOffsets(i, j, r) { r = Math.max(1, Math.min(5, Math.floor(r) || 1)); const out = []; for (let q = j - r; q <= j + r; q++) for (let p = i - r - 1; p <= i + r + 1; p++) { if (p === i && q === j) continue; if (hexDist(i, j, p, q) <= r) out.push([p, q]); } return out; }
  /** the centre of hex cell (i, j) of side 1 (pointy-top, odd rows shifted right) */
  const hexCentre = (i, j) => [Math.sqrt(3) * (i + 0.5 * (j & 1)), 1.5 * j];

  /* ---------- distances ---------- */
  /** dist(dx, dy, metric) for euclid | manhattan | chebyshev; the differences already wrapped on a torus by the caller (wrapDelta) */
  function dist(dx, dy, metric) { const a = Math.abs(dx), b = Math.abs(dy); return metric === 'manhattan' ? a + b : metric === 'chebyshev' ? Math.max(a, b) : Math.sqrt(a * a + b * b); }
  /** the distance between (x1, y1) and (x2, y2) in a w × h box, toroidal when torus (the minimal image) */
  function distance(x1, y1, x2, y2, o) { const q = o || {}; let dx = x2 - x1, dy = y2 - y1; if (q.torus) { dx = wrapDelta(dx, q.w); dy = wrapDelta(dy, q.h); } return dist(dx, dy, q.metric); }

  /* ---------- random walks (rng: a NoemaSimKit stream; Pearson 1905; Kareiva & Shigesada 1983 correlated walks; Viswanathan et al. 1999 Lévy flights) ----------
     walk(rng, steps, {kind: lattice | gauss | correlated | levy, dim 1|2, step (length; σ for gauss), kappa (correlated: the
     concentration of the turning angle, wrapped normal of sd 1/√κ), mu (levy: the Pareto exponent 1 < μ ≤ 3 of the step lengths, lmin = step),
     box: [x0, x1, y0, y1], boundary: none | reflect | periodic | absorb, x0, y0}) → {x: [...], y: [...], absorbed: step | −1} (steps + 1 points) */
  function walk(rng, steps, o) {
    const q = o || {}, kind = q.kind || 'lattice', dim = q.dim === 1 ? 1 : 2, L = fin(q.step) ? q.step : 1;
    const n = Math.max(0, Math.min(200000, Math.floor(steps) || 0)), X = [fin(q.x0) ? q.x0 : 0], Y = [fin(q.y0) ? q.y0 : 0];
    let x = X[0], y = Y[0], th = rng() * 2 * Math.PI, absorbed = -1;
    const box = Array.isArray(q.box) && q.box.length === 4 ? q.box : null, bd = box ? (q.boundary || 'reflect') : 'none';
    const gauss = () => Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng());
    for (let s = 0; s < n; s++) {
      let dx = 0, dy = 0;
      if (kind === 'lattice') { const r = Math.floor(rng() * 2 * dim); if (r === 0) dx = L; else if (r === 1) dx = -L; else if (r === 2) dy = L; else dy = -L; }
      else if (kind === 'gauss') { dx = L * gauss(); dy = dim === 2 ? L * gauss() : 0; }
      else { const len = kind === 'levy' ? L * Math.pow(rng(), -1 / ((fin(q.mu) ? q.mu : 2) - 1)) : L;
        th = kind === 'correlated' ? th + gauss() / Math.sqrt(fin(q.kappa) && q.kappa > 0 ? q.kappa : 1) : rng() * 2 * Math.PI;
        dx = len * (dim === 1 ? (Math.cos(th) >= 0 ? 1 : -1) : Math.cos(th)); dy = dim === 2 ? len * Math.sin(th) : 0; }
      x += dx; y += dy;
      if (box && bd !== 'none') {
        const [a0, a1, b0, b1] = box, w = a1 - a0, h = b1 - b0;
        if (bd === 'periodic') { x = a0 + (((x - a0) % w) + w) % w; if (dim === 2) y = b0 + (((y - b0) % h) + h) % h; }
        else if (bd === 'reflect') { for (let k = 0; k < 8 && (x < a0 || x > a1); k++) x = x < a0 ? 2 * a0 - x : 2 * a1 - x; if (dim === 2) for (let k = 0; k < 8 && (y < b0 || y > b1); k++) y = y < b0 ? 2 * b0 - y : 2 * b1 - y; }
        else if (bd === 'absorb' && (x < a0 || x > a1 || (dim === 2 && (y < b0 || y > b1)))) { X.push(x); Y.push(y); absorbed = s + 1; break; }
      }
      X.push(x); Y.push(y);
    }
    return { x: X, y: Y, absorbed };
  }
  /** the mean squared displacement over many walks at each step: paths [{x, y}] → [MSD_0 … MSD_n] (E = n·step² lattice; 2·dim·D·t Brownian) */
  function msd(paths) {
    const n = paths.reduce((m, p) => Math.max(m, p.x.length), 0), out = new Float64Array(n), cnt = new Float64Array(n);
    for (const p of paths) for (let s = 0; s < p.x.length; s++) { const dx = p.x[s] - p.x[0], dy = p.y[s] - p.y[0]; out[s] += dx * dx + dy * dy; cnt[s]++; }
    return Array.from(out, (v, s) => (cnt[s] ? v / cnt[s] : NaN));
  }

  /* ---------- spatial statistics ---------- */
  /** spatial weights of an nx × ny lattice: rook (von Neumann), queen (Moore) or hex → CSR (binary weights) */
  function latticeWeights(nx, ny, kind, torus) {
    if (kind === 'hex') { const n = nx * ny, off = new Int32Array(n + 1), tmp = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { for (const [p, q] of hexOffsets(i, j, 1)) { const c = wrapCell(p, q, nx, ny, torus && ny % 2 === 0); if (c >= 0) tmp.push(c); } off[j * nx + i + 1] = tmp.length; } return { off, nbr: Int32Array.from(tmp) }; }
    return latticeNeighbours(nx, ny, kind === 'queen' ? 'moore' : 'vonneumann', 1, torus);
  }
  /** distance-band weights of points (w_ij = 1 for 0 < d ≤ band) → CSR */
  function bandWeights(xs, ys, band, o) { const n = xs.length, off = new Int32Array(n + 1), tmp = []; for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) if (j !== i) { const d = distance(xs[i], ys[i], xs[j], ys[j], o); if (d <= band) tmp.push(j); } off[i + 1] = tmp.length; } return { off, nbr: Int32Array.from(tmp) }; }
  /** Moran's I (Moran 1950) of values z over binary weights W (CSR), with E[I] = −1/(n−1) and the variance under the normality
      assumption (Cliff & Ord 1981 eq. 1.38) → {I, E, V, z} */
  function moranI(vals, W) {
    const n = vals.length; let m = 0; for (const v of vals) m += v; m /= n;
    let num = 0, den = 0, S0 = 0, S1 = 0; const rowS = new Float64Array(n), colS = new Float64Array(n);
    for (let i = 0; i < n; i++) { den += (vals[i] - m) ** 2; for (let e = W.off[i]; e < W.off[i + 1]; e++) { const j = W.nbr[e]; num += (vals[i] - m) * (vals[j] - m); S0 += 1; rowS[i] += 1; colS[j] += 1; } }
    // S1 = ½ Σ (w_ij + w_ji)²: symmetric binary weights give 2·S0
    let sym = true; const set = new Set(); for (let i = 0; i < n; i++) for (let e = W.off[i]; e < W.off[i + 1]; e++) set.add(i * n + W.nbr[e]);
    for (const key of set) { const i = Math.floor(key / n), j = key % n; if (!set.has(j * n + i)) { sym = false; break; } }
    S1 = sym ? 2 * S0 : (() => { let s = 0; for (const key of set) { const i = Math.floor(key / n), j = key % n; s += (1 + (set.has(j * n + i) ? 1 : 0)) ** 2; } return s / 2; })();
    let S2 = 0; for (let i = 0; i < n; i++) S2 += (rowS[i] + colS[i]) ** 2;
    const I = den > 0 && S0 > 0 ? (n / S0) * num / den : NaN, E = -1 / (n - 1);
    const V = (n * n * S1 - n * S2 + 3 * S0 * S0) / ((n * n - 1) * S0 * S0) - E * E;
    return { I, E, V, z: (I - E) / Math.sqrt(V) };
  }
  /** Geary's C (Geary 1954) over binary weights: 1 under no autocorrelation, < 1 positive, > 1 negative */
  function gearyC(vals, W) {
    const n = vals.length; let m = 0; for (const v of vals) m += v; m /= n;
    let num = 0, den = 0, S0 = 0;
    for (let i = 0; i < n; i++) { den += (vals[i] - m) ** 2; for (let e = W.off[i]; e < W.off[i + 1]; e++) { num += (vals[i] - vals[W.nbr[e]]) ** 2; S0++; } }
    return den > 0 ? (n - 1) * num / (2 * S0 * den) : NaN;
  }
  /** Ripley's K (Ripley 1976, 1977) of points in a w × h box at radii rs: edge correction none | torus | border (Diggle 2003 §4.1);
      → {K: [...], L: [...] (Besag 1977: L = √(K/π), = r under complete spatial randomness)} */
  function ripleyK(xs, ys, w, h, rs, corr) {
    const n = xs.length, lam = n / (w * h), K = [], Lr = [];
    for (const r of rs) {
      let s = 0, used = 0;
      for (let i = 0; i < n; i++) {
        if (corr === 'border' && (xs[i] < r || xs[i] > w - r || ys[i] < r || ys[i] > h - r)) continue;
        used++;
        for (let j = 0; j < n; j++) if (j !== i) { let dx = xs[j] - xs[i], dy = ys[j] - ys[i]; if (corr === 'torus') { dx = wrapDelta(dx, w); dy = wrapDelta(dy, h); } if (dx * dx + dy * dy <= r * r) s++; }
      }
      const k = corr === 'border' ? (used ? s / (used * lam) : NaN) : s / (n * lam);
      K.push(k); Lr.push(Math.sqrt(k / Math.PI));
    }
    return { K, L: Lr };
  }
  /** the Clark & Evans 1954 aggregation index R = mean nearest-neighbour distance / (0.5/√λ): 1 random, < 1 clustered, > 1 regular (2 on a square lattice) */
  function clarkEvans(xs, ys, w, h, torus) {
    const n = xs.length; if (n < 2) return NaN; let s = 0;
    for (let i = 0; i < n; i++) { let b = Infinity; for (let j = 0; j < n; j++) if (j !== i) { let dx = xs[j] - xs[i], dy = ys[j] - ys[i]; if (torus) { dx = wrapDelta(dx, w); dy = wrapDelta(dy, h); } const d = dx * dx + dy * dy; if (d < b) b = d; } s += Math.sqrt(b); }
    return (s / n) / (0.5 / Math.sqrt(n / (w * h)));
  }

  const API = Object.freeze({
    MAX_N, MAX_N1, MAX_CELLS, GHOST, SIDES: Object.freeze(SIDES.slice()), BC_TYPES: Object.freeze(BC_TYPES.slice()), RAMP: Object.freeze(RAMP.slice()), SCHEMES: Object.freeze(SCHEMES.slice()),
    grid, field, interior, nearest, sample, fillGhosts, fixedMask, laplacian, gradient, thomas, thomasPeriodic,
    ftcsLimit, diffusionNumber, courant, waveCourant, amplification, vonNeumann, LIMITERS: Object.freeze(Object.assign({}, LIMITERS)),
    offsets, wrapCell, latticeNeighbours, wrapDelta, buckets, adjacency, ring, erdosRenyi, wattsStrogatz, barabasiAlbert, latticeEdges, circleLayout,
    classOf, heatmap, contour, hexCube, hexDist, hexOffsets, hexCentre, dist, distance, walk, msd, latticeWeights, bandWeights, moranI, gearyC, ripleyK, clarkEvans,
  });
  export default API;
  /* i18n-ignore-end */
