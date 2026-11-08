# `graph@1` — graphs and their algorithms, step by step (`src/engines/graph/graph.js`, `NoemaLibGraph`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`). It takes any graph, written out node by node or generated with a
seed (17 generators, from G(n, p) to Zachary's karate club and the bridges of Königsberg). It runs any of 40 classic algorithms on
it: searches and shortest paths, spanning trees, flows and cuts, matchings, Euler and Hamilton paths, the travelling salesman,
colouring, centralities and communities. It gives the result as scalars and series, plus 27 properties of the graph itself, and
draws the network as a scene **in the algorithm's state after k steps**. A slider bound to `model.run.step` walks through the
run: the frontier, each relaxation, each augmenting path, each union.

The tests are `node tests/lib_graph.js` (119
assertions: published values, every edge case, the trace, the adapter, the Worker, speed, the reference activity) and
`node tests/enginelib.js` (the golden outputs of the former Python twin on `tests/fixtures/enginelib/graph.json`, 36 specs: 11 good, 25 bad). The reference
activity is `tools/activities_examples/dijkstra-steps`. The research behind this chapter is in the project's
`engine-library/research/math.md` (§3, table G1–G20).

The engine is pure JS with no dependency. Every algorithm is written out by hand so that each step can be recorded, and every
DFS-like algorithm is iterative (no recursion, no stack overflow at 2000 nodes). It is deterministic: neighbours are visited in
(node index, edge index) order, heap ties are broken by (key, node index), random generators and label propagation use the
core's seeded `mulberry32`, and the transcendental functions are NoemaExpr's fdlibm ports. It is bounded: at most 2000 nodes,
20 000 edges, 200 000 algorithm steps, 2000 recorded frames (40 000 events), and 2000 scene items. It never throws.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "graph@1",
  "consts": { "dOld": 9, "wLeast": 7 },
  "params": [ { "id": "wst", "kind": "slider", "label": "wLabel", "min": 1, "max": 15, "step": 1, "default": 10 },
              { "id": "k", "kind": "slider", "label": "kLabel", "min": 0, "max": 7, "step": 1, "default": 0 } ],
  "model": {
    "graph": { "directed": true,
      "nodes": [ { "id": "s", "x": 0, "y": 1 }, { "id": "t", "x": 1.4, "y": 2 }, { "id": "x", "x": 3.2, "y": 2 },
                 { "id": "y", "x": 1.4, "y": 0 }, { "id": "z", "x": 3.2, "y": 0 } ],
      "edges": [ { "u": "s", "v": "t", "w": "wst" }, { "u": "s", "v": "y", "w": 5 }, { "u": "t", "v": "x", "w": 1 },
                 { "u": "t", "v": "y", "w": 2 }, { "u": "y", "v": "t", "w": 3 }, { "u": "y", "v": "x", "w": 9 },
                 { "u": "y", "v": "z", "w": 2 }, { "u": "x", "v": "z", "w": 4 }, { "u": "z", "v": "x", "w": 6 },
                 { "u": "z", "v": "s", "w": 7 } ] },
    "run": { "alg": "dijkstra", "source": "s", "target": "x", "step": "k" } },
  "outputs": [ { "id": "dx", "kind": "scalar", "of": "dist", "node": "x" },
               { "id": "dt", "kind": "scalar", "of": "dist", "node": "t" },
               { "id": "hops", "kind": "scalar", "of": "pathEdges" },
               { "id": "steps", "kind": "scalar", "of": "steps" },
               { "id": "frame", "kind": "scalar", "of": "frame" },
               { "id": "net", "kind": "scene", "of": "drawing", "labels": "both" } ],
  "plots": [ { "kind": "scene", "title": "sceneTitle", "of": "net", "height": 300 } ] }
```

This is the reference activity, shortened: the digraph of CLRS Fig. 24.6 (22.6 in the 4th edition) with the cost of the road
s → t on a slider. Its exercise (ch01-e921) checks `dx < dOld` (weight 2), `wst >= wLeast` and `frame == steps`: lower the road
s → t only as far as needed for the route to x to cost less than 9, and step the algorithm to the end. Only `wst = 7` passes.
The values `dx`, `dt`, `hops` are those of the whole run; the step changes only the scene and `frame`.

- **Numbers.** Node coordinates, weights and capacities, `generate.p`, and `run.step`, `hweight`, `alpha`, `beta` are **numx**:
  a number, or an expression over the spec's names. `exprs(spec)` lists them as `[source, path, []]` (the engine has no local
  names). `keys(spec)` lists the nodes' `label` keys (a node's label is a key of the activity's string tables, never text).
- **Outputs**: `{id, kind, of, node?, code?, labels?}`. `of` must be something the engine computes (§4) and `kind` its kind.
- **Runtime.** `run(spec, env, {seed})` returns `{out, diag, graph, frames, result}`. The adapter `engine.create(spec).run(inputs)`
  gives the declared outputs by id. A run never throws; what cannot be computed is NaN (or +∞ for a distance that does not exist).

### 1.1 The model

| field | type | meaning |
|---|---|---|
| `graph` | object | `{directed?, nodes, edges?}`: written out (one of `graph`, `generate`) |
| `graph.nodes[]` | `{id, x?, y?, label?}` | ≤ 2000; `id` is the node's name (letters, digits, `_ - .`), x and y numx (both or neither), `label` a string key |
| `graph.edges[]` | `{u, v, w?, cap?, id?}` | ≤ 20 000; `w` the weight (1), `cap` the capacity (= w); parallel edges and self-loops are allowed and reported |
| `generate` | object | `{kind, …}`: §3 (one of `graph`, `generate`) |
| `layout` | `auto` \| `given` \| `circle` \| `grid` \| `spring` \| `layered` \| `bipartite` \| `random` | where the nodes are drawn (`auto`: the coordinates if given, else by generator) |
| `run` | object | `{alg, …}`: the algorithm (§2); without it only the properties and the drawing |
| `view` | `[x0, x1, y0, y1]` | the scene's window (default: fitted) |

### 1.2 `run`

| field | type | meaning |
|---|---|---|
| `alg` | one of §2, required | the algorithm (`none`: nothing) |
| `source`, `target` | node id | the start and the goal (needed by the algorithms marked s, t in §2) |
| `step` | numx | the frame the scene shows, clamped to [0, steps] (default: the end) |
| `heuristic` | `zero` \| `euclid` \| `manhattan` \| `octile` \| `chebyshev` | A*'s h, from the coordinates (`euclid` default) |
| `hweight` | numx ≥ 0 | weighted A*: f = g + w·h (1) |
| `alpha`, `beta` | numx | PageRank damping (0.85); Katz α (0.1) and β (1) |
| `order` | `given` \| `largest-first` \| `smallest-last` \| `dsatur` \| `exact` | the colouring order (`dsatur`) |
| `mode` | `shortest` \| `longest` (dag-path) · `min` \| `max` (assignment) · `path` \| `cycle` (hamilton, euler) · `exact` \| `heuristic` (tsp) · `hubs` \| `authorities` (hits) | |
| `maxIter`, `tol` | 1–10 000, > 0 | power iterations (1000) and their L1 tolerance (1e-12) |
| `k` | 1–2000 | Girvan–Newman: the number of communities to stop at (default: the best modularity) |
| `seed` | 0–2³²−1 | label propagation's order (else the run's seed) |
| `normalized`, `weighted` | bool | betweenness normalised (true, networkx's); weights in centralities and modularity (false) |

### 1.3 Checker codes (`checkSpec`)

| code | when |
|---|---|
| `format` | `model` is not an object |
| `value` | a missing required field (a generator's parameters, `source`/`target` an algorithm needs, a node output's `node`); a wrong kind; `p` outside [0, 1]; `gnm` with more edges than pairs; `ba` without 1 ≤ m < n; `ws` without k < n; a node with x and no y; `layout: given` without coordinates or on a generated graph |
| `enum` | `alg`, `kind`, `layout`, `heuristic`, `order`, `mode`, an output's `labels` or a flag's `code` |
| `graph` | neither or both of `graph` and `generate` |
| `empty` | a written graph with no nodes |
| `duplicate` | a node id or an edge id twice |
| `ref` | an edge end, `source`, `target` or an output's `node` that is not a node |
| `negative-weight` | Dijkstra or A* with a negative number as a weight (or `wmin` < 0): use Bellman–Ford |
| `source-is-target` | a flow or connectivity from a node to itself |
| `directed-required` | toposort, scc, dag-path on an undirected graph |
| `undirected-required` | MSTs, articulation, colouring, cliques, communities, spanning-trees, matchings, assignment, clustering, kcore, tsp on a digraph |
| `size` | more than 2000 nodes; a hypercube k > 10; complete n > 200; an algorithm's node cap (floyd-warshall, tsp, girvan-newman 60; hamilton 20; spanning-trees 30; cliques, assignment 100; max-matching, betweenness, closeness, harmonic, louvain, vertex-connectivity 500; exact colouring 40) |
| `param` | PageRank α outside (0, 1), Katz α ≤ 0 (numbers; expressions are checked at run time) |
| `output` | an `of` the engine does not compute, or an algorithm output without `run` |
| `unknown-field` (warning) | a field the engine does not know, or an output argument it ignores |
| `heuristic` (warning) | A* with a heuristic on nodes without coordinates (it measures the layout) |

## 2. Algorithms

`result` is the algorithm's main number; `values` is one number per node (in node order); `order`, `path` list node indices.
Each step the scene can show is one **frame**.

| `alg` | needs | `result` · `values` · other outputs | a frame | source |
|---|---|---|---|---|
| `bfs` | s | nodes reached, or the hops to t · the hop distance · `order`, `path`, `frontier` | a node dequeued | Moore 1959; CLRS 4th ed. §20.2 |
| `dfs` | (s) | nodes reached · discovery times (CLRS timestamps) · `count` back edges, edge classes in the scene | a discovery or a finish | Tarjan 1972; CLRS §20.3 |
| `dijkstra` | s, weights ≥ 0 | the distance to t (else nodes reached) · distances · `order` (pop order), `path`, `expanded` | a node settled | Dijkstra 1959 (Numer. Math. 1:269); binary heap |
| `astar` | s, t | the distance to t · g · `expanded`, `expandedRef` (Dijkstra's count), `path` | a node expanded | Hart, Nilsson & Raphael 1968 (IEEE Trans. SSC 4:100) |
| `bellman-ford` | s | the distance to t · distances (−∞ behind a negative cycle) · `path` (the cycle, if any) | a round | Bellman 1958, Ford 1956; CLRS §22.1 |
| `floyd-warshall` | n ≤ 60 | d(s, t) · d(s, ·) · the whole matrix in `result.matrix` | a pivot | Floyd 1962, Warshall 1962; CLRS §23.2 |
| `dag-path` | s, a DAG | the shortest (or `longest`: the critical path) to t · distances · `path` | a node | CLRS §22.2; PERT (Malcolm et al. 1959) |
| `toposort` | digraph | 1, or 0 with a cycle · position · `order` (the smallest by index), `path` (a cycle) | a node output | Kahn 1962 |
| `scc` | digraph | the number of components · component · `classes`, `componentSizes` | a component closed | Tarjan 1972 (SIAM J. Comput. 1:146), iterative |
| `components` | — | the number of components · component · `classes`, `componentSizes` | a union | union–find (Tarjan 1975) |
| `bipartite` | — | 1 or 0 · side · `classes`, `path` (an odd cycle) | a node coloured | BFS 2-colouring (König 1936) |
| `kruskal`, `prim`, `boruvka` | undirected | the total weight · — · `count` edges, `order` (the tree's edge indices) | an edge considered / a node added / a round | Kruskal 1956; Prim 1957 (Jarník 1930); Borůvka 1926; CLRS §21 |
| `maxflow`, `dinic` | s, t | the maximum flow · the min-cut side (1 = with s) · `count` the cut capacity, `classes` | an augmenting path / a blocking flow | Edmonds & Karp 1972 (J. ACM 19:248); Dinic 1970; Ford & Fulkerson 1956 |
| `vertex-connectivity` | s, t | κ(s, t), the internally disjoint paths | an augmenting path | Menger 1927; node splitting (Even 1975) |
| `matching` | bipartite | the matching's size · the partner · `iterations` (phases) | a phase | Hopcroft & Karp 1973 (SIAM J. Comput. 2:225) |
| `max-matching` | undirected | the matching's size · the partner | an augmentation | Edmonds 1965 (Can. J. Math. 17:449), blossoms |
| `assignment` | bipartite | the minimum (`max`: maximum) total cost of the smaller side matched · the partner | the result | Kuhn 1955, Munkres 1957 (O(n³) with potentials) |
| `euler` | — | 0 none, 1 path, 2 circuit · position · `path`, `count` odd vertices | an edge walked | Euler 1736; Hierholzer 1873, iterative |
| `hamilton` | n ≤ 20 | 1 found, 0 none (proved), NaN undecided · position · `path` (`mode` path \| cycle) | a node tried | backtracking with pruning |
| `tsp` | undirected, n ≤ 60 | the tour's length · position · `path` (closed) | a tour improved | Held & Karp 1962 (n ≤ 11, exact); nearest neighbour + 2-opt (Croes 1958) on the shortest-path metric |
| `coloring` | undirected | the colours used · colour · `classes`, `lower` (a clique's size) | a node coloured | Welsh & Powell 1967; Matula & Beck 1983; DSATUR (Brélaz 1979); exact: DSATUR branch and bound |
| `articulation` | undirected | the articulation points · 1 for each · `count` bridges | a node finished | Hopcroft & Tarjan 1973 (Commun. ACM 16:372), iterative, parallel edges by edge id |
| `pagerank` | — | the largest · the scores (sum 1) · `top`, `order`, `residual`, `iterations` | an iteration | Brin & Page 1998; dangling nodes spread uniformly |
| `betweenness` | n ≤ 500 | the largest · the scores · `top`, `order` | a source | Brandes 2001 (J. Math. Sociol. 25:163); networkx normalisation |
| `closeness`, `harmonic` | n ≤ 500 | the largest · the scores · `top`, `order` | a source | Wasserman & Faust 1994 (networkx `wf_improved`); Boldi & Vigna 2014 |
| `eigenvector` | — | the largest · the scores (unit L2) · `top`, `residual` | an iteration | power iteration on A + I (networkx) |
| `katz` | — | the largest · the scores (unit L2) | an iteration | Katz 1953 (Psychometrika 18:39) |
| `hits` | — | the largest · authorities (`mode: hubs`: hubs), each sum 1 | an iteration | Kleinberg 1999 (J. ACM 46:604) |
| `degree`, `clustering` | — | the largest · degree/(n−1) · local clustering | the result | Watts & Strogatz 1998; networkx |
| `kcore` | undirected | the degeneracy · the core number · `classes` | the result | Batagelj & Zaversnik 2003 |
| `cliques` | n ≤ 100 | ω, the clique number · 1 in a largest clique · `count` maximal cliques, `order` | a clique | Bron & Kerbosch 1973 with Tomita's pivot (2006) |
| `label-propagation` | undirected | communities · community · `classes`, `modularity` | a sweep | Raghavan, Albert & Kumara 2007 (seeded) |
| `louvain` | n ≤ 500 | communities · community · `classes`, `modularity` | a level | Blondel et al. 2008 (J. Stat. Mech. P10008) |
| `girvan-newman` | n ≤ 60 | communities · community · `classes`, `modularity` | an edge removed | Girvan & Newman 2002 (PNAS 99:7821) |
| `spanning-trees` | n ≤ 30 | τ(G) | — | Kirchhoff 1847; exact by Bareiss 1968 elimination |

Modularity is Q = Σ_c [L_c/m − (d_c/2m)²] (Newman & Girvan 2004). The layouts are a circle, a grid, longest-path layers, two
columns for a bipartite graph, seeded random points, or Fruchterman & Reingold 1991 springs from the circle (bounded by the budget).

## 3. Generators (`generate`)

All are seeded (`generate.seed`, else the run's seed) and follow networkx's definitions; nodes are named `n0`, `n1`, … (Königsberg:
A–D). `wmin`/`wmax` draw whole weights (= capacities) uniformly; otherwise every weight is 1.

| `kind` | needs | the graph | source |
|---|---|---|---|
| `gnp` | n, p (numx) | Erdős–Rényi G(n, p), by geometric skipping, O(n + m) | Batagelj & Brandes 2005 (Phys. Rev. E 71:036113) |
| `gnm` | n, m | m distinct pairs uniformly | Erdős & Rényi 1959 |
| `ba` | n, m | preferential attachment, m edges per new node | Barabási & Albert 1999 (Science 286:509) |
| `ws` | n, k, p | a ring of k neighbours, each edge rewired with probability p | Watts & Strogatz 1998 (Nature 393:440) |
| `grid` | rows, cols | the 4-neighbour grid | |
| `complete`, `cycle`, `path`, `star`, `wheel` | n (star: n leaves) | | |
| `hypercube` | k ≤ 10 | Q_k, 2^k nodes | |
| `complete-bipartite` | a, b | K_{a,b} | |
| `tree` | n | a uniform random labelled tree (a Prüfer code) | Prüfer 1918 |
| `binary-tree` | n | the complete binary tree in heap order | |
| `petersen` | — | the Petersen graph | Petersen 1898 |
| `karate` | — | Zachary's karate club, 34 members and 78 ties | Zachary 1977 (J. Anthropol. Res. 33:452) |
| `konigsberg` | — | the multigraph of the 7 bridges, A the Kneiphof island | Euler 1736 |

## 4. Outputs

### 4.1 Scalars (`kind: scalar`)

- **Properties** of the graph (no `run` needed; hop distances; networkx conventions): `n`, `m`, `components`, `connected`,
  `bipartite`, `density`, `diameter`, `radius`, `girth` (+∞ for a forest), `avgPath`, `clustering` (the average local),
  `transitivity`, `maxDegree`, `minDegree`, `avgDegree`, `oddCount`, `eulerian` (0/1/2), `acyclic`, `tree`, `spanningTrees`
  (undirected, n ≤ 30), `triangles`, `assortativity` (Newman 2002), `degeneracy`, `selfLoops`, `multiEdges`,
  `largestComponent`, `planarBound` (1 when m ≤ 3n − 6, or 2n − 4 for a bipartite graph: necessary for planarity, not sufficient). `diameter`, `radius`, `avgPath` are NaN on a
  disconnected graph (`disconnected`).
- **The algorithm's**: `result`, `steps` (frames recorded), `frame` (the step shown), `dist` / `value` / `reached` (with `node`),
  `pathEdges`, `expanded`, `expandedRef`, `top` (the index of the highest score), `count`, `lower`, `modularity`, `iterations`.
- `flag` with `code`: 1 when the run reported that code (§5), else 0.

### 4.2 Series (`kind: series`, at most 2000 values)

`values` (per node), `degree` (per node), `degreeHist` (the number of nodes of degree 0, 1, …), `order`, `path`, `nodeIndex`
(0 … n−1, an x axis), `residual` (per iteration), `frontier` (its size per frame), `componentSizes` (descending), `classes`.

### 4.3 The scene (`kind: scene`, `of: drawing`)

The network in the state after `step` frames. Nodes: `base` unseen, `warn` on the frontier, `ok` done, `hi` (and larger) the
current one; when the algorithm gives classes (components, sides, colours, cores, communities) the nodes take the roles `hi`,
`ok`, `warn`, `info`, `bad`, `muted` in turn. Edges: `muted` by default, `hi` (bold) in the tree or the chosen set, `ok` (bolder)
on the path, `warn` being considered in this frame, `bad` cut (bold) or a back edge (dashed), `info` a forward edge or one
carrying flow, `muted` dashed rejected or cross. Directed edges have arrows; opposite or parallel edges are drawn bent, and a
self-loop is a small circle. `labels`: `id` puts each node's id in its circle (`s`; a labelled node carries its `key` instead),
`value` its value under it, `both` (default) both, `none` neither; weights (or the frame's edge values) sit beside the edges.
The core keeps the first 2000 items: edges are drawn before nodes, so a graph of more than about 1000 edges loses nodes from the
picture (draw it without labels, or a subgraph).

## 5. Runtime codes

Every code is also a `flag`. None stops the run: what cannot be computed is NaN.

| code | when |
|---|---|
| `empty`, `single-node` | no nodes; one node |
| `self-loop`, `multi-edge` | the graph has them (a self-loop counts twice in an undirected degree) |
| `disconnected` | the graph is disconnected (an MST is a forest; the diameter is NaN) |
| `unreachable`, `no-path` | a node, or the target, cannot be reached: its distance is +∞ |
| `negative-weight` | a weight < 0 at run time (an expression) for Dijkstra or A*: NaN |
| `negative-cycle` | Bellman–Ford or Floyd–Warshall found one: the cycle is the `path`, distances behind it −∞ |
| `unbounded` | an s–t path of infinite capacity |
| `ties` | Dijkstra found a second shortest way to a node: the first found (by node index) is kept, so the path is one of several |
| `cyclic` | toposort or dag-path on a graph with a cycle |
| `not-bipartite` | bipartite (with an odd cycle), matching or assignment on a non-bipartite graph |
| `no-euler`, `non-hamiltonian`, `no-tour` | none exists (proved) |
| `undecided` | hamilton or exact colouring stopped by the budget |
| `bounds-only` | exact colouring cut: `result` an upper bound, `lower` a lower one |
| `budget-exhausted` | more than 200 000 steps: the result is NaN, never a partial number |
| `float-capacity` | real capacities (Edmonds–Karp still terminates) |
| `heuristic-inadmissible` | A* returned a longer path than Dijkstra |
| `non-unique-mst` | two edges of equal weight could swap: another tree has the same weight |
| `not-converged`, `eigen-zero` | an iteration stopped at `maxIter`; no Perron vector (a DAG: use Katz or PageRank) |
| `param` | a parameter out of range at run time (α ≥ 1 for PageRank, α ≥ 1/λmax for Katz, p ∉ [0, 1]) |
| `nan-weight` | a weight or a capacity that cannot be computed |
| `infeasible` | the assignment cannot match the smaller side |
| `adjacent` | vertex connectivity of adjacent s and t: the edge counts as one path |
| `trace-truncated` | more than 2000 frames or 40 000 events: the rest is not drawn, the result is complete |
| `size` | a generator hit 20 000 edges |

## 6. Validity and limits

- Up to 2000 nodes and 20 000 edges; the per-algorithm caps of §1.3 keep every run within 200 000 steps (a cubic algorithm on
  60 nodes, Brandes on 500 sparse nodes). On a dense graph near a cap the budget can still run out (`budget-exhausted`; Brandes on
  K200 does).
- Shortest paths count hops in `bfs` and the properties, weights everywhere else. Undirected edges are two arcs for flows.
- `tsp` is exact for n ≤ 11 (Held–Karp, 11·2¹¹ states); above that it is a heuristic with no guarantee (`mode: heuristic` forces
  it). `hamilton` and exact colouring are exponential: the budget decides (`undecided`).
- Label propagation depends on its seed; Louvain on the node order (fixed); Girvan–Newman is exact but O(m²n).
- The layouts are for reading, not for measuring: A*'s heuristic uses the coordinates (the `heuristic` warning when there are none).

## 7. Reference values asserted by `tests/lib_graph.js`

| | check | value | tolerance | source |
|---|---|---|---|---|
| G1 | Dijkstra on CLRS Fig. 24.6 (22.6) | d = s 0, t 8, x 9, y 5, z 7; pop order s, y, z, t, x; path s–y–t–x | exact | CLRS |
| G2 | Bellman–Ford on CLRS Fig. 24.4 (22.4) | d = s 0, t 2, x 4, y 7, z −2 | exact | CLRS |
| G3 | the same with w(z, s) = −10 | `negative-cycle`, the cycle {s, t, z} | exact | constructed |
| G4 | Floyd–Warshall on CLRS Fig. 25.1 (23.1) | the whole matrix D | exact | CLRS |
| G5 | MST on CLRS Fig. 23.1 (21.1), Kruskal, Prim, Borůvka | 37, 8 edges, `non-unique-mst` | exact | CLRS |
| G6 | max flow on CLRS Fig. 26.1 (24.1), Edmonds–Karp and Dinic | 23; the cut S = {s, v1, v2, v4} | exact | CLRS |
| G7 | SCC on CLRS Fig. 22.9 (20.9) | {a, b, e} {c, d} {f, g} {h} | exact | CLRS |
| G8 | Königsberg | degrees 5, 3, 3, 3; `no-euler` | exact | Euler 1736 |
| G9 | karate: clustering, transitivity, diameter, average path | 0.5706384782076823, 0.2556818181818182, 5, 2.408199643493761 | 1e-12 | networkx 3.x |
| G10 | karate PageRank α 0.85 | n33 0.1009191823, n0 0.0969972854, n32 0.0716932260 | 1e-9 | networkx |
| G11 | karate betweenness (normalised) | n0 0.43763528138528146, n33 0.30407497594997596 | 1e-12 | Brandes 2001; networkx |
| G12 | karate eigenvector, closeness | n33 0.3733634703; n0 0.5689655172413793 | 1e-8; 1e-12 | networkx |
| G13 | karate n0 → n33: edge and vertex connectivity | 10, 6 | exact | Menger; networkx |
| G14 | 4-node digraph PageRank | 0.3725…, 0.1958…, 0.3941…, 0.0375 = (1 − α)/n | 1e-10 | networkx |
| G15 | path 1 → 2 → 3, node 3 dangling | 0.1844…, 0.3412…, 0.4744… | 1e-10 | networkx |
| G16 | Petersen | 15 edges, girth 5, diameter 2, τ = 2000, χ = 3, not Hamiltonian, a Hamiltonian path | exact | Biggs, *Algebraic Graph Theory* |
| G17 | K5; K3,3; C5 | τ = 125 (Cayley 5³); matching 3; raw betweenness 1 each | exact | Cayley 1889 |
| G18 | two triangles bridged | articulation points {v3, v4, v6}, bridges {v3–v4, v6–v7} | exact | constructed |
| G19 | the star S4 | the centre's betweenness 1 | exact | definition |
| G20 | A* on a 10 × 10 grid with a walled gap | length 23 = BFS's; expanded ≤ Dijkstra's | exact | Hart et al. 1968 |

Also: karate assortativity −0.47561309768461413, Louvain Q = 0.41880341880341876 with 4 communities, Girvan–Newman's first split
= networkx's, χ = ω = 5, Katz and HITS against networkx; Held–Karp against brute force on 9 cities; the classic 3 × 3 assignment
(5); the critical path of a small DAG (9); the Petersen graph's perfect matching (blossoms); Watts–Strogatz's ring C = 0.5; the
step trace and its scene; seeded generators; the Worker source in a fresh context, bit for bit; a typical run under 50 ms (about
5) and the heaviest allowed under 2 s (about 170 ms).

## Uses the kernel

Since 2026-11-07 the random generators, label propagation and the layouts draw from kernel streams (`C.rng(seed, 'graph:…')` = `SK.stream`); the Worker source carries the kernel. Snapshot unchanged (its fixtures use no random graph).
