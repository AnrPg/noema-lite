/* ===================== interactive activities — graph@1, graph algorithms step by step (docs/library/graph.md, docs/INTERACTIVE_LIBRARY.md §1) =====================
   A general engine of the library: any graph (written out or generated with a seed), any of ~40 classic algorithms from BFS to
   Louvain, its result as scalars and series, and a scene of the network with the algorithm's state after k steps (a slider drives
   model.run.step). Every algorithm is hand-written so that each step can be shown (frontier, relaxations, augmenting paths, unions);
   every DFS-like algorithm is iterative (no recursion). Deterministic: neighbours in index order, ties broken by (key, node index),
   seeded randomness from the core. Sources of each method: in the comment beside it and in docs/library/graph.md.
   Pure JS, no DOM, no words for the learner: numbers, codes and the model's own node ids (`s`). Python twin of checkSpec / exprs /
   keys: tools/lib_graph.py. Tests: node tests/lib_graph.js, node tests/enginelib.js. */
(function noemaLibGraphModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, keys and numbers leave this engine
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'graph@1';
  const MAX_N = 2000, MAX_M = 20000, BUDGET = 200000, MAX_FRAMES = 2000, MAX_EVENTS = 40000;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  // the transcendental functions are NoemaExpr's fdlibm ports (the same bits in every browser; research §0.1), Math as a fallback
  const FN = n => (root.NoemaExpr && root.NoemaExpr.FUNCS && root.NoemaExpr.FUNCS[n] ? root.NoemaExpr.FUNCS[n].fn : Math[n]);
  const sin = FN('sin'), cos = FN('cos'), log = FN('log'), sqrt = Math.sqrt, abs = Math.abs;
  const PI = 3.141592653589793;

  /* ---------- the model format (the same table in tools/lib_graph.py) ---------- */
  const ALGS = ['none', 'bfs', 'dfs', 'dijkstra', 'bellman-ford', 'astar', 'floyd-warshall', 'dag-path', 'toposort', 'scc', 'components', 'bipartite',
    'kruskal', 'prim', 'boruvka', 'maxflow', 'dinic', 'vertex-connectivity', 'matching', 'max-matching', 'assignment', 'euler', 'hamilton', 'tsp',
    'coloring', 'articulation', 'pagerank', 'betweenness', 'closeness', 'harmonic', 'eigenvector', 'katz', 'hits', 'degree', 'clustering',
    'kcore', 'cliques', 'label-propagation', 'louvain', 'girvan-newman', 'spanning-trees'];
  const GENS = ['gnp', 'gnm', 'ba', 'ws', 'grid', 'complete', 'cycle', 'path', 'star', 'wheel', 'hypercube', 'complete-bipartite', 'tree',
    'binary-tree', 'petersen', 'karate', 'konigsberg'];
  const LAYOUTS = ['auto', 'given', 'circle', 'grid', 'spring', 'layered', 'bipartite', 'random'];
  const HEUR = ['zero', 'euclid', 'manhattan', 'octile', 'chebyshev'];
  const ORDERS = ['given', 'largest-first', 'smallest-last', 'dsatur', 'exact'];
  const MODES = ['shortest', 'longest', 'min', 'max', 'path', 'cycle', 'exact', 'heuristic', 'hubs', 'authorities'];
  const NODE_T = { id: 'id!', x: 'numx', y: 'numx', label: 'key' };
  const EDGE_T = { u: 'ref!', v: 'ref!', w: 'numx', cap: 'numx', id: 'id' };
  const GRAPH_T = { directed: 'bool', nodes: { $req: true, $list: { $obj: NODE_T }, max: MAX_N }, edges: { $list: { $obj: EDGE_T }, max: MAX_M } };
  const GEN_T = { kind: 'enum:' + GENS.join('|') + '!', n: 'int:1:2000', m: 'int:0:20000', p: 'numx', k: 'int:0:2000', rows: 'int:1:100', cols: 'int:1:100',
    a: 'int:1:1000', b: 'int:1:1000', seed: 'int:0:4294967295', directed: 'bool', wmin: 'int:-1000000:1000000', wmax: 'int:-1000000:1000000' };
  const RUN_T = { alg: 'enum:' + ALGS.join('|') + '!', source: 'ref', target: 'ref', step: 'numx', heuristic: 'enum:' + HEUR.join('|'), hweight: 'numx',
    alpha: 'numx', beta: 'numx', order: 'enum:' + ORDERS.join('|'), mode: 'enum:' + MODES.join('|'), maxIter: 'int:1:10000', tol: 'pos', k: 'int:1:2000',
    seed: 'int:0:4294967295', normalized: 'bool', weighted: 'bool' };
  const MODEL_T = { graph: { $obj: GRAPH_T }, generate: { $obj: GEN_T }, layout: 'enum:' + LAYOUTS.join('|'), run: { $obj: RUN_T }, view: { $list: 'fin', min: 4, max: 4 } };
  const GEN_NEEDS = { gnp: ['n', 'p'], gnm: ['n', 'm'], ba: ['n', 'm'], ws: ['n', 'k', 'p'], grid: ['rows', 'cols'], complete: ['n'], cycle: ['n'], path: ['n'],
    star: ['n'], wheel: ['n'], hypercube: ['k'], 'complete-bipartite': ['a', 'b'], tree: ['n'], 'binary-tree': ['n'], petersen: [], karate: [], konigsberg: [] };
  const NEEDS_SOURCE = ['dijkstra', 'bellman-ford', 'astar', 'dag-path', 'maxflow', 'dinic', 'vertex-connectivity'];
  const NEEDS_TARGET = ['astar', 'maxflow', 'dinic', 'vertex-connectivity'];
  const DIRECTED_ONLY = ['toposort', 'scc', 'dag-path'];
  const UNDIRECTED_ONLY = ['kruskal', 'prim', 'boruvka', 'articulation', 'coloring', 'cliques', 'label-propagation', 'louvain', 'girvan-newman',
    'spanning-trees', 'matching', 'max-matching', 'assignment', 'clustering', 'kcore', 'tsp'];
  const CAPS = { 'floyd-warshall': 60, tsp: 60, hamilton: 20, 'girvan-newman': 60, 'spanning-trees': 30, cliques: 100, assignment: 100, 'max-matching': 500,
    betweenness: 500, closeness: 500, harmonic: 500, louvain: 500, 'vertex-connectivity': 500 };
  const EXACT_COLOURING_CAP = 40;
  // what a spec may name (of)
  const PROPS = ['n', 'm', 'components', 'connected', 'bipartite', 'density', 'diameter', 'radius', 'girth', 'avgPath', 'clustering', 'transitivity',
    'maxDegree', 'minDegree', 'avgDegree', 'oddCount', 'eulerian', 'acyclic', 'tree', 'spanningTrees', 'triangles', 'assortativity', 'degeneracy',
    'selfLoops', 'multiEdges', 'largestComponent', 'planarBound'];
  const ALG_SCALARS = ['result', 'steps', 'frame', 'dist', 'value', 'reached', 'pathEdges', 'expanded', 'expandedRef', 'top', 'count', 'lower', 'modularity', 'iterations', 'flag'];
  const SCALARS = PROPS.concat(ALG_SCALARS);
  const NODE_SCALARS = ['dist', 'value', 'reached'];
  const SERIES = ['values', 'degree', 'degreeHist', 'order', 'path', 'nodeIndex', 'residual', 'frontier', 'componentSizes', 'classes'];
  const CODES = ['empty', 'single-node', 'self-loop', 'multi-edge', 'disconnected', 'unreachable', 'negative-weight', 'negative-cycle', 'zero-cycle',
    'no-path', 'unbounded', 'ties', 'cyclic', 'not-bipartite', 'no-euler', 'non-hamiltonian', 'undecided', 'budget-exhausted', 'float-capacity',
    'heuristic-inadmissible', 'non-unique-mst', 'not-converged', 'eigen-zero', 'bounds-only', 'trace-truncated', 'nan-weight', 'param', 'no-tour',
    'infeasible', 'adjacent', 'size'];
  const LABELS = ['id', 'value', 'both', 'none'];

  /* ---------- the generators' node counts (the static size a check knows; the same in Python) ---------- */
  function genCount(g) {
    const k = g.kind;
    if (k === 'grid') return (g.rows || 0) * (g.cols || 0);
    if (k === 'star') return (g.n || 0) + 1;
    if (k === 'hypercube') return Math.pow(2, g.k || 0);
    if (k === 'complete-bipartite') return (g.a || 0) + (g.b || 0);
    if (k === 'petersen') return 10;
    if (k === 'karate') return 34;
    if (k === 'konigsberg') return 4;
    return g.n || 0;
  }
  const genIds = (g, N) => (g.kind === 'konigsberg' ? ['A', 'B', 'C', 'D'] : Array.from({ length: N }, (_, i) => 'n' + i));

  /** checkSpec(spec) → [{code, path, msg, level}] (the same as tools/lib_graph.py check_spec) */
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    if (!isObj(m)) { E('format', 'model', 'not an object'); C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], () => true, E, W); return P; }
    C.walk(m, MODEL_T, 'model', E, W);
    if (C.hasErrors(P)) { C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], () => true, E, W); return P; }
    const gr = m.graph, gen = m.generate, run = isObj(m.run) ? m.run : null, alg = run ? run.alg : 'none';
    let ids = [], N = 0, directed = false;
    if ((gr === undefined) === (gen === undefined)) E('graph', 'model', 'needs graph or generate (one of them)');
    else if (gr !== undefined) {
      directed = gr.directed === true;
      const seen = new Set();
      gr.nodes.forEach((nd, i) => {
        if (seen.has(nd.id)) E('duplicate', `model.graph.nodes[${i}].id`, `the node ${nd.id} is listed twice`);
        seen.add(nd.id);
        if ((nd.x === undefined) !== (nd.y === undefined)) E('value', `model.graph.nodes[${i}].${nd.x === undefined ? 'x' : 'y'}`, 'missing (a node has both x and y or neither)');
        else if (m.layout === 'given' && nd.x === undefined) E('value', `model.graph.nodes[${i}].x`, 'missing (layout given)');
      });
      ids = [...seen]; N = ids.length;
      if (!N) E('empty', 'model.graph.nodes', 'the graph has no nodes');
      const eids = new Set();
      (gr.edges || []).forEach((ed, i) => {
        for (const f of ['u', 'v']) if (!seen.has(ed[f])) E('ref', `model.graph.edges[${i}].${f}`, 'not a node of the graph');
        if (ed.id !== undefined) { if (eids.has(ed.id)) E('duplicate', `model.graph.edges[${i}].id`, `the edge ${ed.id} is listed twice`); eids.add(ed.id); }
        if ((alg === 'dijkstra' || alg === 'astar') && isNum(ed.w) && ed.w < 0) E('negative-weight', `model.graph.edges[${i}].w`, alg + ' needs weights >= 0 (use bellman-ford)');
      });
    } else {
      directed = gen.directed === true;
      const need = GEN_NEEDS[gen.kind].filter(f => gen[f] === undefined);
      if (need.length) for (const f of need) E('value', 'model.generate.' + f, `missing (${gen.kind} needs ${GEN_NEEDS[gen.kind].join(', ')})`);
      else {
        N = genCount(gen);
        if (isNum(gen.p) && !(gen.p >= 0 && gen.p <= 1)) E('value', 'model.generate.p', 'needs a number from 0 to 1');
        if (gen.kind === 'hypercube' && gen.k > 10) E('size', 'model.generate.k', 'at most 10 (2^k nodes, at most 2000)');
        else if (N > MAX_N) E('size', 'model.generate', `more than ${MAX_N} nodes`);
        if (gen.kind === 'gnm' && gen.m > gen.n * (gen.n - 1) / 2) E('value', 'model.generate.m', 'more edges than node pairs');
        if (gen.kind === 'ba' && !(gen.m >= 1 && gen.m < gen.n)) E('value', 'model.generate.m', 'needs 1 <= m < n');
        if (gen.kind === 'ws' && !(gen.k < gen.n)) E('value', 'model.generate.k', 'needs k < n');
        if (gen.kind === 'complete' && gen.n > 200) E('size', 'model.generate.n', 'at most 200 (the edges, at most 20000)');
        if ((gen.kind === 'cycle' && gen.n < 3) || (gen.kind === 'wheel' && gen.n < 4)) E('value', 'model.generate.n', `needs n >= ${gen.kind === 'cycle' ? 3 : 4}`);
        if (gen.wmin !== undefined && gen.wmax !== undefined && gen.wmin > gen.wmax) E('value', 'model.generate.wmax', 'needs wmin <= wmax');
        if ((alg === 'dijkstra' || alg === 'astar') && gen.wmin !== undefined && gen.wmin < 0) E('negative-weight', 'model.generate.wmin', alg + ' needs weights >= 0 (use bellman-ford)');
        ids = genIds(gen, Math.min(N, MAX_N));
      }
      if (m.layout === 'given') E('value', 'model.layout', 'a generated graph has no coordinates (use auto, circle, grid, spring, layered, bipartite or random)');
    }
    const known = new Set(ids);
    if (run) {
      for (const f of ['source', 'target']) if (run[f] !== undefined && N && !known.has(run[f])) E('ref', 'model.run.' + f, 'not a node of the graph');
      if (NEEDS_SOURCE.includes(alg) && run.source === undefined) E('value', 'model.run.source', `missing (${alg} starts from a source node)`);
      if (NEEDS_TARGET.includes(alg) && run.target === undefined) E('value', 'model.run.target', `missing (${alg} needs a target node)`);
      if (['maxflow', 'dinic', 'vertex-connectivity'].includes(alg) && run.source !== undefined && run.source === run.target) E('source-is-target', 'model.run.target', 'the source and the target are the same node');
      if (DIRECTED_ONLY.includes(alg) && !directed) E('directed-required', 'model.run.alg', alg + ' needs a directed graph');
      if (UNDIRECTED_ONLY.includes(alg) && directed) E('undirected-required', 'model.run.alg', alg + ' needs an undirected graph');
      if (CAPS[alg] && N > CAPS[alg]) E('size', 'model.run.alg', `${alg} handles at most ${CAPS[alg]} nodes (this graph has ${N})`);
      if (alg === 'coloring' && run.order === 'exact' && N > EXACT_COLOURING_CAP) E('size', 'model.run.order', `exact colouring handles at most ${EXACT_COLOURING_CAP} nodes (this graph has ${N})`);
      if (alg === 'pagerank' && isNum(run.alpha) && !(run.alpha > 0 && run.alpha < 1)) E('param', 'model.run.alpha', 'pagerank needs 0 < alpha < 1');
      if (alg === 'katz' && isNum(run.alpha) && !(run.alpha > 0)) E('param', 'model.run.alpha', 'katz needs alpha > 0');
      if (isNum(run.hweight) && run.hweight < 0) E('value', 'model.run.hweight', 'needs a number >= 0');
      if (alg === 'astar' && run.heuristic !== undefined && run.heuristic !== 'zero' && gr !== undefined && gr.nodes.some(nd => nd.x === undefined)) W('heuristic', 'model.run.heuristic', 'the nodes have no coordinates: the heuristic measures the layout');
    }
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at) => {
      for (const k of Object.keys(o)) if (!['id', 'kind', 'of', 'node', 'code', 'labels'].includes(k)) W('unknown-field', at + '.' + k, 'ignored');
      const list = o.kind === 'scalar' ? SCALARS : o.kind === 'series' ? SERIES : ['drawing'];
      if (!list.includes(o.of)) { E('output', at + '.of', `${o.kind} outputs of ${ID}: ${list.join(', ')}`); return; }
      if (o.kind === 'scalar' && ALG_SCALARS.includes(o.of) && alg === 'none') E('output', at + '.of', 'needs model.run (an algorithm)');
      if (o.kind === 'series' && ['values', 'order', 'path', 'residual', 'frontier', 'classes'].includes(o.of) && alg === 'none') E('output', at + '.of', 'needs model.run (an algorithm)');
      if (o.kind === 'scalar' && NODE_SCALARS.includes(o.of)) {
        if (o.node === undefined) E('value', at + '.node', 'missing (the node it is about)');
        else if (!C.checkKind('ref', o.node)) E('value', at + '.node', C.kindMsg('ref'));
        else if (N && !known.has(o.node)) E('ref', at + '.node', 'not a node of the graph');
      } else if (o.node !== undefined) W('unknown-field', at + '.node', 'ignored');
      if (o.kind === 'scalar' && o.of === 'flag') {
        if (!CODES.includes(o.code)) E('enum', at + '.code', 'one of ' + CODES.join(', '));
      } else if (o.code !== undefined) W('unknown-field', at + '.code', 'ignored');
      if (o.kind === 'scene') { if (o.labels !== undefined && !LABELS.includes(o.labels)) E('enum', at + '.labels', 'one of ' + LABELS.join(', ')); }
      else if (o.labels !== undefined) W('unknown-field', at + '.labels', 'ignored');
    }, E, W);
    return P;
  }
  /** exprs(spec) → [[source, path, local names]]: every expression of the model */
  function exprs(spec) {
    const out = [], m = spec && spec.model;
    if (!isObj(m)) return out;
    const sx = (v, p) => { if (typeof v === 'string') out.push([v, p, []]); };
    if (isObj(m.graph)) {
      (Array.isArray(m.graph.nodes) ? m.graph.nodes : []).forEach((nd, i) => { if (isObj(nd)) { sx(nd.x, `model.graph.nodes[${i}].x`); sx(nd.y, `model.graph.nodes[${i}].y`); } });
      (Array.isArray(m.graph.edges) ? m.graph.edges : []).forEach((ed, i) => { if (isObj(ed)) { sx(ed.w, `model.graph.edges[${i}].w`); sx(ed.cap, `model.graph.edges[${i}].cap`); } });
    }
    if (isObj(m.generate)) sx(m.generate.p, 'model.generate.p');
    if (isObj(m.run)) for (const f of ['step', 'hweight', 'alpha', 'beta']) sx(m.run[f], 'model.run.' + f);
    return out;
  }
  /** keys(spec) → [[key, path]]: every string key the model names */
  function keys(spec) {
    const out = [], m = spec && spec.model;
    if (isObj(m) && isObj(m.graph) && Array.isArray(m.graph.nodes)) m.graph.nodes.forEach((nd, i) => { if (isObj(nd) && typeof nd.label === 'string') out.push([nd.label, `model.graph.nodes[${i}].label`]); });
    return out;
  }

  /* ---------- the graph: nodes in insertion order, edges with their index; neighbours sorted by (node index, edge index) ---------- */
  function makeGraph(ids, edges, directed) {
    const n = ids.length, idx = new Map(ids.map((s, i) => [s, i]));
    const out = Array.from({ length: n }, () => []), inn = Array.from({ length: n }, () => []);
    edges.forEach((e, i) => {
      e.i = i;
      out[e.u].push([e.v, i]);
      if (directed) inn[e.v].push([e.u, i]);
      else if (e.u !== e.v) out[e.v].push([e.u, i]);
    });
    const srt = (a, b) => a[0] - b[0] || a[1] - b[1];
    out.forEach(l => l.sort(srt)); inn.forEach(l => l.sort(srt));
    return { n, ids, idx, directed, E: edges, out, inn: directed ? inn : out, X: new Float64Array(n).fill(NaN), Y: new Float64Array(n).fill(NaN), lab: new Array(n).fill(null) };
  }
  const other = (e, u) => (e.u === u ? e.v : e.u);
  function degree(G, u) { if (G.directed) return G.out[u].length + G.inn[u].length; let d = 0; for (const [v] of G.out[u]) d += v === u ? 2 : 1; return d; }

  /* Zachary 1977, J. Anthropol. Res. 33:452 — the karate club, 34 members and 78 ties (networkx karate_club_graph, 0-based) */
  const KARATE = '0-1 0-2 0-3 0-4 0-5 0-6 0-7 0-8 0-10 0-11 0-12 0-13 0-17 0-19 0-21 0-31 1-2 1-3 1-7 1-13 1-17 1-19 1-21 1-30 2-3 2-7 2-8 2-9 2-13 2-27 2-28 2-32 3-7 3-12 3-13 4-6 4-10 5-6 5-10 5-16 6-16 8-30 8-32 8-33 9-33 13-33 14-32 14-33 15-32 15-33 18-32 18-33 19-33 20-32 20-33 22-32 22-33 23-25 23-27 23-29 23-32 23-33 24-25 24-27 24-31 25-31 26-29 26-33 27-33 28-31 28-33 29-32 29-33 30-32 30-33 31-32 31-33 32-33';

  /** generate(g, env, seed, D) → {ids, edges, directed, xy?} — seeded generators that follow networkx's definitions */
  function generate(g, env, seed, D) {
    const rnd = C.mulberry32(C.hash32('graph:' + g.kind, g.seed !== undefined ? g.seed : seed));
    const N = Math.min(genCount(g), MAX_N), ids = genIds(g, N), E = [], xy = null;
    const add = (u, v) => { if (E.length < MAX_M) E.push({ u, v }); else D.add('size'); };
    let p = g.p === undefined ? 0 : C.cx(g.p)(env);
    if (!(p >= 0 && p <= 1)) { if (g.p !== undefined) D.add('param'); p = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0; }
    const k = g.kind, n = N;
    if (k === 'gnp') {   // Erdős–Rényi G(n, p) by geometric skipping (Batagelj & Brandes 2005, Phys. Rev. E 71:036113), O(n + m)
      if (p >= 1) { for (let v = 1; v < n; v++) for (let w = 0; w < v; w++) add(w, v); }
      else if (p > 0) {
        const lp = log(1 - p); let v = 1, w = -1;
        while (v < n) {
          const r = 1 - rnd(); w += 1 + Math.floor(log(r) / lp);
          while (w >= v && v < n) { w -= v; v++; }
          if (v < n) add(w, v);
        }
      }
    } else if (k === 'gnm') {   // G(n, m): m distinct pairs drawn uniformly (rejection; m ≤ n(n−1)/2 checked)
      const seen = new Set(); let tries = 0;
      while (E.length < g.m && tries++ < BUDGET) { const u = Math.floor(rnd() * n), v = Math.floor(rnd() * n); if (u === v) continue; const a = Math.min(u, v), b = Math.max(u, v), key = a * n + b; if (seen.has(key)) continue; seen.add(key); add(a, b); }
    } else if (k === 'ba') {   // Barabási & Albert 1999 (Science 286:509): each new node attaches to m distinct nodes ∝ degree (networkx's star seed)
      const mm = g.m, rep = [];
      for (let v = 1; v <= mm && v < n; v++) { add(0, v); rep.push(0, v); }
      for (let v = mm + 1; v < n; v++) {
        const tg = new Set(); let guard = 0;
        while (tg.size < mm && guard++ < 100000) tg.add(rep[Math.floor(rnd() * rep.length)]);
        for (const t of [...tg].sort((a, b) => a - b)) { add(t, v); rep.push(t, v); }
      }
    } else if (k === 'ws') {   // Watts & Strogatz 1998 (Nature 393:440): ring of k nearest neighbours, each edge rewired with probability p
      const half = Math.floor(g.k / 2), has = new Set(), key = (a, b) => Math.min(a, b) * n + Math.max(a, b), list = [];
      for (let j = 1; j <= half; j++) for (let u = 0; u < n; u++) { const v = (u + j) % n; if (u !== v && !has.has(key(u, v))) { has.add(key(u, v)); list.push([u, v]); } }
      for (const e of list) {
        if (rnd() < p) {
          let w = -1, guard = 0;
          while (guard++ < 1000) { const c = Math.floor(rnd() * n); if (c !== e[0] && !has.has(key(e[0], c))) { w = c; break; } }
          if (w >= 0) { has.delete(key(e[0], e[1])); has.add(key(e[0], w)); e[1] = w; }
        }
      }
      for (const e of list) add(e[0], e[1]);
    } else if (k === 'grid') { const R = g.rows, Cc = g.cols; for (let r = 0; r < R; r++) for (let c = 0; c < Cc; c++) { const u = r * Cc + c; if (c + 1 < Cc) add(u, u + 1); if (r + 1 < R) add(u, u + Cc); } }
    else if (k === 'complete') { for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) add(u, v); }
    else if (k === 'cycle') { for (let u = 0; u < n; u++) add(u, (u + 1) % n); }
    else if (k === 'path') { for (let u = 0; u + 1 < n; u++) add(u, u + 1); }
    else if (k === 'star') { for (let v = 1; v < n; v++) add(0, v); }
    else if (k === 'wheel') { for (let v = 1; v < n; v++) add(0, v); for (let v = 1; v < n; v++) add(v, v + 1 < n ? v + 1 : 1); }
    else if (k === 'hypercube') { for (let u = 0; u < n; u++) for (let b = 0; b < g.k; b++) { const v = u ^ (1 << b); if (u < v) add(u, v); } }
    else if (k === 'complete-bipartite') { for (let u = 0; u < g.a; u++) for (let v = g.a; v < n; v++) add(u, v); }
    else if (k === 'tree') {   // a uniform random labelled tree: a random Prüfer code decoded (Prüfer 1918; Cayley n^(n−2))
      if (n === 2) add(0, 1);
      else if (n > 2) {
        const code = Array.from({ length: n - 2 }, () => Math.floor(rnd() * n)), deg = new Array(n).fill(1);
        for (const c of code) deg[c]++;
        for (const c of code) { let leaf = 0; while (deg[leaf] !== 1) leaf++; add(Math.min(leaf, c), Math.max(leaf, c)); deg[leaf]--; deg[c]--; }
        const last = []; for (let u = 0; u < n; u++) if (deg[u] === 1) last.push(u);
        add(last[0], last[1]);
      }
    } else if (k === 'binary-tree') { for (let v = 1; v < n; v++) add((v - 1) >> 1, v); }
    else if (k === 'petersen') { for (let i = 0; i < 5; i++) { add(i, (i + 1) % 5); add(i, i + 5); add(5 + i, 5 + (i + 2) % 5); } }
    else if (k === 'karate') { for (const t of KARATE.split(' ')) { const [a, b] = t.split('-').map(Number); add(a, b); } }
    else if (k === 'konigsberg') {   // Euler 1736: the island A (Kneiphof), the banks B, C and the east island D; 7 bridges
      for (const [a, b] of [[0, 1], [0, 1], [0, 2], [0, 2], [0, 3], [1, 3], [2, 3]]) add(a, b);
    }
    const wmin = g.wmin, wmax = g.wmax;
    for (const e of E) { e.w = wmin !== undefined || wmax !== undefined ? (() => { const lo = wmin !== undefined ? wmin : 1, hi = wmax !== undefined ? wmax : Math.max(lo, 10); return lo + Math.floor(rnd() * (hi - lo + 1)); })() : 1; e.cap = e.w; }
    return { ids, edges: E, directed: g.directed === true, xy };
  }

  /* ---------- layouts (deterministic): circle, grid, layered (Sugiyama, simplified), bipartite, spring (Fruchterman & Reingold 1991, Softw. Pract. Exp. 21:1129) ---------- */
  function layout(G, kind, spec, rnd, gen) {
    const n = G.n, X = G.X, Y = G.Y;
    if (kind === 'auto') kind = G.hasXY ? 'given' : gen && gen.kind === 'grid' ? 'grid' : gen && ['petersen', 'konigsberg'].includes(gen.kind) ? 'fixed' : gen && ['karate', 'gnp', 'gnm', 'ba', 'ws', 'tree'].includes(gen.kind) && n <= 300 ? 'spring' : gen && gen.kind === 'binary-tree' ? 'layered' : gen && gen.kind === 'complete-bipartite' ? 'bipartite' : 'circle';
    if (kind === 'given' && G.hasXY) return;
    if (kind === 'fixed' && gen.kind === 'petersen') { for (let i = 0; i < 5; i++) { const a = PI / 2 + 2 * PI * i / 5; X[i] = 2 * cos(a); Y[i] = 2 * sin(a); X[i + 5] = cos(a); Y[i + 5] = sin(a); } return; }
    if (kind === 'fixed' && gen.kind === 'konigsberg') { [[0, 0], [0, 1.6], [0, -1.6], [2.2, 0]].forEach(([x, y], i) => { X[i] = x; Y[i] = y; }); return; }
    if (kind === 'grid') { const cols = gen && gen.kind === 'grid' ? gen.cols : Math.ceil(sqrt(n)); for (let u = 0; u < n; u++) { X[u] = u % cols; Y[u] = -Math.floor(u / cols); } return; }
    if (kind === 'layered') {
      const lev = new Array(n).fill(0), indeg = new Array(n).fill(0);
      if (G.directed) {   // longest-path layering of a DAG (cycles: the nodes left keep layer 0)
        for (const e of G.E) if (e.u !== e.v) indeg[e.v]++;
        const q = []; for (let u = 0; u < n; u++) if (!indeg[u]) q.push(u);
        for (let h = 0; h < q.length; h++) { const u = q[h]; for (const [v, ei] of G.out[u]) if (v !== u) { lev[v] = Math.max(lev[v], lev[u] + 1); if (--indeg[v] === 0) q.push(v); } }
      } else { const d = bfsDist(G, 0, null); for (let u = 0; u < n; u++) lev[u] = d[u] >= 0 ? d[u] : 0; }
      const cnt = {}; for (let u = 0; u < n; u++) { const l = lev[u]; cnt[l] = (cnt[l] || 0) + 1; }
      const pos = {}; for (let u = 0; u < n; u++) { const l = lev[u]; pos[l] = (pos[l] || 0) + 1; X[u] = pos[l] - (cnt[l] + 1) / 2; Y[u] = -l; }
      return;
    }
    if (kind === 'bipartite') { const col = twoColour(G).col; let a = 0, b = 0; for (let u = 0; u < n; u++) { if (col[u] === 1) { X[u] = 2; Y[u] = -(b++); } else { X[u] = 0; Y[u] = -(a++); } } return; }
    if (kind === 'random') { for (let u = 0; u < n; u++) { X[u] = rnd(); Y[u] = rnd(); } return; }
    for (let u = 0; u < n; u++) { const a = PI / 2 - 2 * PI * u / Math.max(1, n); X[u] = n === 1 ? 0 : cos(a); Y[u] = n === 1 ? 0 : sin(a); }   // circle
    if (kind !== 'spring' || n < 2) return;
    // Fruchterman–Reingold from the circle, k = √(area/n), linear cooling, iterations bounded by the budget (≤ 300·… ≤ 200 000 pair steps)
    const it = Math.max(1, Math.min(300, Math.floor(BUDGET / (n * n + G.E.length)))), kk = sqrt(4 / n), dx = new Float64Array(n), dy = new Float64Array(n);
    let tmp = 0.2;
    for (let s = 0; s < it; s++) {
      dx.fill(0); dy.fill(0);
      for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) {
        let ex = X[u] - X[v], ey = Y[u] - Y[v], d2 = ex * ex + ey * ey;
        if (d2 < 1e-12) { ex = 1e-3 * (u - v); ey = 1e-3; d2 = ex * ex + ey * ey; }
        const f = kk * kk / d2; dx[u] += ex * f; dy[u] += ey * f; dx[v] -= ex * f; dy[v] -= ey * f;
      }
      for (const e of G.E) { if (e.u === e.v) continue; const ex = X[e.u] - X[e.v], ey = Y[e.u] - Y[e.v], d = sqrt(ex * ex + ey * ey), f = d / kk; dx[e.u] -= ex * f; dy[e.u] -= ey * f; dx[e.v] += ex * f; dy[e.v] += ey * f; }
      for (let u = 0; u < n; u++) { const d = sqrt(dx[u] * dx[u] + dy[u] * dy[u]); if (d > 0) { const l = Math.min(d, tmp); X[u] += dx[u] / d * l; Y[u] += dy[u] / d * l; } }
      tmp = Math.max(0.005, tmp * 0.98);
    }
  }

  /* ---------- the trace: frames of events; the state after k frames is what the scene draws ---------- */
  // node state ns: 0 unseen · 1 frontier (grey) · 2 done (black); node class nc (colour, component, community, side) ≥ 0; node value nv
  // edge state es: 0 · 1 tree/chosen · 3 rejected · 4 back · 5 forward · 6 cross · 7 cut · 8 path · 9 carries flow; edge value ev
  function newState(n, m) { return { ns: new Int8Array(n), nc: new Int32Array(n).fill(-1), nv: new Float64Array(n).fill(NaN), es: new Int8Array(m), ev: new Float64Array(m).fill(NaN), pr: new Int32Array(n).fill(-1), cn: -1, ce: [] }; }
  function apply(S, e) {
    const t = e[0], a = e[1], b = e[2];
    if (t === 'ns') S.ns[a] = b; else if (t === 'nv') S.nv[a] = b; else if (t === 'nc') S.nc[a] = b;
    else if (t === 'es') S.es[a] = b; else if (t === 'ev') S.ev[a] = b; else if (t === 'cur') S.cn = a; else if (t === 'ce') S.ce.push(a);
    else if (t === 'pred') { const o = S.pr[a]; if (o >= 0 && S.es[o] === 1) S.es[o] = 0; S.pr[a] = b; if (b >= 0) S.es[b] = 1; }
  }
  function tracer(G, D) {
    const T = { frames: [], cur: null, events: 0, ops: 0, S: newState(G.n, G.E.length), over: false };
    T.frame = () => { T.S.cn = -1; T.S.ce = []; if (T.frames.length < MAX_FRAMES && T.events < MAX_EVENTS) { T.cur = []; T.frames.push(T.cur); } else { if (T.cur !== null || !T.frames.length) D.add('trace-truncated'); T.cur = null; } };
    T.ev = (t, a, b) => { const e = [t, a, b]; apply(T.S, e); if (T.cur) { T.cur.push(e); T.events++; } };
    T.tick = k => { T.ops += k || 1; if (T.ops > BUDGET) { if (!T.over) D.add('budget-exhausted'); T.over = true; return false; } return true; };
    return T;
  }
  function replay(G, T, k) {
    if (k >= T.frames.length) return T.S;
    const S = newState(G.n, G.E.length);
    for (let i = 0; i < k; i++) { S.cn = -1; S.ce = []; for (const e of T.frames[i]) apply(S, e); }
    return S;
  }

  /* ---------- a binary heap ordered by (key, second key, node index): reproducible ties (research §3.3) ---------- */
  function heap() {
    const h = [];
    const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
    return {
      size: () => h.length,
      push(x) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(h[i], h[p])) break; [h[i], h[p]] = [h[p], h[i]]; i = p; } },
      pop() { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < h.length && less(h[l], h[s])) s = l; if (r < h.length && less(h[r], h[s])) s = r; if (s === i) break; [h[i], h[s]] = [h[s], h[i]]; i = s; } } return top; },
    };
  }
  function uf(n) {   // union–find with path compression (halving) and union by rank (Tarjan 1975, J. ACM 22:215)
    const p = Int32Array.from({ length: n }, (_, i) => i), r = new Int8Array(n);
    const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    return { find, union(a, b) { a = find(a); b = find(b); if (a === b) return false; if (r[a] < r[b]) [a, b] = [b, a]; p[b] = a; if (r[a] === r[b]) r[a]++; return true; } };
  }
  /** BFS hop distances from s (−1 = unreachable); undirected view when und */
  function bfsDist(G, s, T, und) {
    const d = new Int32Array(G.n).fill(-1), q = [s]; d[s] = 0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      const lists = und && G.directed ? [G.out[u], G.inn[u]] : [G.out[u]];
      for (const L of lists) for (const [v] of L) { if (T && !T.tick()) return d; if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } }
    }
    return d;
  }
  function twoColour(G) {   // BFS 2-colouring on the undirected view; an odd cycle as the witness (König 1936)
    const col = new Int8Array(G.n).fill(-1), par = new Int32Array(G.n).fill(-1), pe = new Int32Array(G.n).fill(-1);
    let odd = null;
    for (let s = 0; s < G.n; s++) {
      if (col[s] >= 0) continue; col[s] = 0; const q = [s];
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        for (const L of G.directed ? [G.out[u], G.inn[u]] : [G.out[u]]) for (const [v, ei] of L) {
          if (col[v] < 0) { col[v] = 1 - col[u]; par[v] = u; pe[v] = ei; q.push(v); }
          else if (col[v] === col[u] && !odd) {   // the odd cycle: u … lca … v plus the edge
            const pu = [u], pv = [v]; const anc = new Set([u]); let x = u; while (par[x] >= 0) { x = par[x]; pu.push(x); anc.add(x); }
            let y = v; while (!anc.has(y)) { y = par[y]; pv.push(y); }
            odd = { nodes: pu.slice(0, pu.indexOf(y) + 1).concat(pv.slice(0, -1).reverse()), edge: ei, par, pe };
          }
        }
      }
    }
    return { col, odd, ok: !odd };
  }

  /* ================= the algorithms: each returns {result, values?, order?, path?, …} and writes the trace ================= */
  const INF = Infinity;
  function pathTo(pr, G, t) { const p = []; let x = t, guard = 0; while (x >= 0 && guard++ <= G.n) { p.push(x); const e = pr[x]; x = e >= 0 ? other(G.E[e], x) : -1; } return p.reverse(); }
  function markPath(G, T, pr, t) { const p = pathTo(pr, G, t); T.frame(); for (let i = 1; i < p.length; i++) T.ev('es', pr[p[i]], 8); return p; }
  function shortestOut(G, T, dist, pr, s, t, extra) {
    const values = Float64Array.from(dist), r = { values, order: extra.order || [], path: [], expanded: extra.expanded };
    let reached = 0; for (let u = 0; u < G.n; u++) if (dist[u] < INF) reached++;
    if (reached < G.n) T.D.add('unreachable');
    if (t >= 0) { if (dist[t] < INF && dist[t] > -INF) r.path = markPath(G, T, pr, t); else T.D.add('no-path'); r.result = dist[t]; }
    else r.result = reached;
    return r;
  }

  // BFS (Moore 1959; CLRS 4th ed. §20.2): levels, a shortest-path tree in hops
  function algBfs(G, T, o) {
    const s = o.s >= 0 ? o.s : 0, d = new Float64Array(G.n).fill(INF), pr = new Int32Array(G.n).fill(-1), q = [s], order = [], fr = [];
    d[s] = 0; T.frame(); T.ev('ns', s, 1); T.ev('nv', s, 0);
    for (let h = 0; h < q.length; h++) {
      const u = q[h]; order.push(u); T.frame(); T.ev('cur', u);
      for (const [v, ei] of G.out[u]) { if (!T.tick()) break; T.ev('ce', ei); if (d[v] === INF) { d[v] = d[u] + 1; pr[v] = ei; q.push(v); T.ev('ns', v, 1); T.ev('nv', v, d[v]); T.ev('pred', v, ei); } }
      T.ev('ns', u, 2); fr.push(q.length - h - 1);
      if (T.over) break;
    }
    const r = shortestOut(G, T, d, pr, s, o.t, { order }); r.frontier = fr; return r;
  }
  // DFS (Tarjan 1972; CLRS §20.3): discovery/finish times, edge classes tree / back / forward / cross — iterative
  function algDfs(G, T, o) {
    const n = G.n, disc = new Float64Array(n).fill(NaN), fin = new Float64Array(n).fill(NaN), pr = new Int32Array(n).fill(-1), order = [];
    const seenE = new Uint8Array(G.E.length); let time = 0;
    const roots = o.s >= 0 ? [o.s].concat([...Array(n).keys()].filter(u => u !== o.s)) : [...Array(n).keys()];
    for (const r0 of roots) {
      if (!Number.isNaN(disc[r0])) continue;
      const st = [[r0, 0]]; disc[r0] = ++time; order.push(r0); T.frame(); T.ev('cur', r0); T.ev('ns', r0, 1); T.ev('nv', r0, time);
      while (st.length) {
        if (!T.tick()) return { result: order.length, values: disc, order, fin };
        const top = st[st.length - 1], u = top[0], L = G.out[u];
        if (top[1] < L.length) {
          const [v, ei] = L[top[1]++];
          if (!G.directed && seenE[ei]) continue;
          seenE[ei] = 1;
          if (Number.isNaN(disc[v])) { disc[v] = ++time; pr[v] = ei; order.push(v); st.push([v, 0]); T.frame(); T.ev('cur', v); T.ev('ce', ei); T.ev('ns', v, 1); T.ev('nv', v, time); T.ev('pred', v, ei); }
          else { const cls = Number.isNaN(fin[v]) ? 4 : !G.directed ? 4 : disc[u] < disc[v] ? 5 : 6; T.frame(); T.ev('cur', u); T.ev('ce', ei); T.ev('es', ei, cls); }
        } else { st.pop(); fin[u] = ++time; T.frame(); T.ev('cur', u); T.ev('ns', u, 2); }
      }
      if (o.s >= 0 && o.only) break;
    }
    let back = 0; for (let i = 0; i < G.E.length; i++) if (T.S.es[i] === 4) back++;
    return { result: order.length, values: disc, order, fin, count: back };
  }
  // Dijkstra 1959 (Numer. Math. 1:269) with a binary heap, ties by (distance, node index) — CLRS §22.3 Fig. 22.6: pop order s, y, z, t, x
  function algDijkstra(G, T, o, hfun, hw) {
    const n = G.n, s = o.s, t = o.t, d = new Float64Array(n).fill(INF), pr = new Int32Array(n).fill(-1), done = new Uint8Array(n), order = [], H = heap();
    for (const e of G.E) if (e.w < 0) { T.D.add('negative-weight'); return { result: NaN, values: new Float64Array(n).fill(NaN), order: [], path: [] }; }
    const h = u => (hfun ? hw * hfun(u) : 0);
    d[s] = 0; H.push([h(s), -0, s]); T.frame(); T.ev('ns', s, 1); T.ev('nv', s, 0);
    let expanded = 0;
    while (H.size()) {
      if (!T.tick()) break;
      const [, , u] = H.pop();
      if (done[u]) continue;
      done[u] = 1; expanded++; order.push(u); T.frame(); T.ev('cur', u); T.ev('ns', u, 2);
      if (u === t && hfun) break;   // A* stops when the target is closed
      for (const [v, ei] of G.out[u]) {
        if (!T.tick()) break;
        const w = G.E[ei].w; if (v === u) continue;
        T.ev('ce', ei);
        if (d[u] + w < d[v]) {
          if (done[v]) { if (!hfun) continue; done[v] = 0; }   // reopening: only with an inconsistent heuristic
          d[v] = d[u] + w; pr[v] = ei; H.push([d[v] + h(v), -d[v], v]); T.ev('ns', v, 1); T.ev('nv', v, d[v]); T.ev('pred', v, ei);
        }
      }
      if (T.over) break;
    }
    return shortestOut(G, T, d, pr, s, t, { order, expanded });
  }
  // A* (Hart, Nilsson & Raphael 1968, IEEE Trans. SSC 4:100): f = g + w·h, ties on larger g then node index; h from the coordinates
  function algAstar(G, T, o, run, env) {
    const t = o.t, kind = run.heuristic || 'euclid', hw = run.hweight === undefined ? 1 : C.cx(run.hweight)(env);
    if (!(hw >= 0)) { T.D.add('param'); return { result: NaN, values: new Float64Array(G.n).fill(NaN) }; }
    const hf = u => { const dx = abs(G.X[u] - G.X[t]), dy = abs(G.Y[u] - G.Y[t]); return kind === 'zero' ? 0 : kind === 'manhattan' ? dx + dy : kind === 'chebyshev' ? Math.max(dx, dy) : kind === 'octile' ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) : sqrt(dx * dx + dy * dy); };
    const r = algDijkstra(G, T, o, hf, hw);
    const ref = algDijkstra(G, tracer(G, { add() { } }), { s: o.s, t: o.t }, null, 0);   // Dijkstra on the side: the optimum and its expansions
    r.expandedRef = ref.expanded;
    if (Number.isFinite(ref.result) && r.result > ref.result * (1 + 1e-12) + 1e-12) T.D.add('heuristic-inadmissible');
    return r;
  }
  // Bellman 1958 / Ford 1956 (CLRS §22.1): n−1 rounds with early exit; a relaxation in round n ⇒ a negative cycle, extracted by walking predecessors
  function algBellmanFord(G, T, o) {
    const n = G.n, s = o.s, d = new Float64Array(n).fill(INF), pr = new Int32Array(n).fill(-1); d[s] = 0;
    T.frame(); T.ev('ns', s, 1); T.ev('nv', s, 0);
    const arcs = []; for (const e of G.E) { arcs.push([e.u, e.v, e.i]); if (!G.directed && e.u !== e.v) arcs.push([e.v, e.u, e.i]); }
    let changed = true, rounds = 0;
    for (let r = 0; r < n - 1 && changed; r++) {
      changed = false; rounds++; T.frame();
      for (const [u, v, ei] of arcs) { if (!T.tick()) break; const w = G.E[ei].w; if (d[u] + w < d[v]) { d[v] = d[u] + w; pr[v] = ei; changed = true; T.ev('ce', ei); T.ev('nv', v, d[v]); T.ev('ns', v, 1); T.ev('pred', v, ei); } }
      if (T.over) break;
    }
    let bad = -1;
    if (changed) for (const [u, v, ei] of arcs) { const w = G.E[ei].w; if (d[u] + w < d[v]) { pr[v] = ei; bad = v; break; } }
    let cycle = [];
    if (bad >= 0) {
      T.D.add('negative-cycle');
      let x = bad; for (let i = 0; i < n; i++) x = other(G.E[pr[x]], x);
      const start = x; cycle = [x]; let guard = 0;
      do { x = other(G.E[pr[x]], x); cycle.push(x); } while (x !== start && guard++ < n);
      cycle.reverse(); cycle.pop();
      T.frame(); for (const u of cycle) { T.ev('es', pr[u], 7); T.ev('nc', u, 3); }
      // every node reachable from the cycle has no shortest distance: −∞
      const q = cycle.slice(), seen = new Uint8Array(n); for (const u of q) seen[u] = 1;
      for (let h = 0; h < q.length; h++) for (const [v] of G.out[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
      for (const u of q) { d[u] = -INF; T.ev('nv', u, -INF); }
    } else for (let u = 0; u < n; u++) if (d[u] < INF) T.ev('ns', u, 2);
    const r = shortestOut(G, T, d, pr, s, bad >= 0 ? -1 : o.t, { order: [] });
    if (bad >= 0) { r.path = cycle; r.result = o.t >= 0 ? d[o.t] : NaN; }
    r.iterations = rounds; r.count = cycle.length;
    return r;
  }
  // Floyd 1962 / Warshall 1962 (CLRS §23.2): one frame per pivot k; dist[i][i] < 0 ⇒ negative cycle (and −∞ through it)
  function floydWarshall(G, T) {
    const n = G.n, D = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n).fill(INF); r[i] = 0; return r; }), nx = Array.from({ length: n }, () => new Int32Array(n).fill(-1));
    for (const e of G.E) { const put = (a, b) => { if (e.w < D[a][b]) { D[a][b] = e.w; nx[a][b] = b; } }; put(e.u, e.v); if (!G.directed) put(e.v, e.u); }
    for (let i = 0; i < n; i++) if (D[i][i] === 0) nx[i][i] = i;
    for (let k = 0; k < n; k++) {
      if (T) { T.frame(); T.ev('cur', k); T.ev('ns', k, 2); if (!T.tick(n * n)) break; }
      const Dk = D[k];
      for (let i = 0; i < n; i++) { const dik = D[i][k]; if (dik === INF) continue; const Di = D[i]; for (let j = 0; j < n; j++) { const v = dik + Dk[j]; if (v < Di[j]) { Di[j] = v; nx[i][j] = nx[i][k]; } } }
    }
    let neg = false; for (let i = 0; i < n; i++) if (D[i][i] < 0) neg = true;
    if (neg) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (D[k][k] < 0 && D[i][k] < INF && D[k][j] < INF) { D[i][j] = -INF; break; }
    return { D, next: nx, neg };
  }
  function algFloyd(G, T, o) {
    const F = floydWarshall(G, T); if (F.neg) T.D.add('negative-cycle');
    const s = o.s >= 0 ? o.s : 0, values = Float64Array.from(F.D[s]), path = [];
    T.frame(); for (let u = 0; u < G.n; u++) T.ev('nv', u, values[u]);
    if (o.t >= 0 && Number.isFinite(F.D[s][o.t]) && F.D[s][o.t] < INF) { let x = s, g = 0; path.push(x); while (x !== o.t && g++ < G.n) { x = F.next[x][o.t]; path.push(x); } }
    for (let i = 1; i < path.length; i++) { const e = G.out[path[i - 1]].find(([v]) => v === path[i]); if (e) T.ev('es', e[1], 8); }
    return { result: o.t >= 0 ? F.D[s][o.t] : NaN, values, path, matrix: F.D };
  }
  // topological order: Kahn 1962 with a min-index queue (the lexicographically smallest order); a cycle ⇒ a witness from DFS
  function topo(G, T) {
    const n = G.n, indeg = new Int32Array(n); for (const e of G.E) indeg[e.v]++;
    const H = heap(); for (let u = 0; u < n; u++) if (!indeg[u]) H.push([u, 0, u]);
    const order = [];
    while (H.size()) { const [, , u] = H.pop(); order.push(u); if (T) { T.frame(); T.ev('cur', u); T.ev('ns', u, 2); T.ev('nv', u, order.length - 1); } for (const [v, ei] of G.out[u]) { if (T && !T.tick()) break; if (T) T.ev('ce', ei); if (--indeg[v] === 0) H.push([v, 0, v]); } }
    return order;
  }
  function findCycle(G) {   // a directed cycle (white/grey/black DFS, iterative)
    const n = G.n, c = new Int8Array(n), par = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s++) {
      if (c[s]) continue; const st = [[s, 0]]; c[s] = 1;
      while (st.length) {
        const top = st[st.length - 1], u = top[0];
        if (top[1] < G.out[u].length) {
          const [v, ei] = G.out[u][top[1]++];
          if (c[v] === 0) { c[v] = 1; par[v] = u; pe[v] = ei; st.push([v, 0]); }
          else if (c[v] === 1) { const cyc = [v], es = [ei]; let x = u; while (x !== v) { cyc.push(x); es.push(pe[x]); x = par[x]; } return { nodes: cyc.reverse(), edges: es }; }
        } else { c[u] = 2; st.pop(); }
      }
    }
    return null;
  }
  function algToposort(G, T) {
    const order = topo(G, T), values = new Float64Array(G.n).fill(NaN); order.forEach((u, i) => { values[u] = i; });
    if (order.length < G.n) { T.D.add('cyclic'); const cy = findCycle(G); T.frame(); if (cy) for (const e of cy.edges) T.ev('es', e, 7); return { result: 0, values, order, path: cy ? cy.nodes : [] }; }
    return { result: 1, values, order };
  }
  // DAG shortest / longest paths in topological order (CLRS §22.2); longest = the critical path (PERT, Malcolm et al. 1959)
  function algDagPath(G, T, o, run) {
    const longest = run.mode === 'longest', n = G.n, order = topo(G, null);
    if (order.length < n) { T.D.add('cyclic'); return { result: NaN, values: new Float64Array(n).fill(NaN) }; }
    const d = new Float64Array(n).fill(longest ? -INF : INF), pr = new Int32Array(n).fill(-1); d[o.s] = 0;
    for (const u of order) {
      T.frame(); T.ev('cur', u); T.ev('ns', u, 2);
      if (Math.abs(d[u]) === INF) continue;
      for (const [v, ei] of G.out[u]) { if (!T.tick()) break; const w = G.E[ei].w; T.ev('ce', ei); if (longest ? d[u] + w > d[v] : d[u] + w < d[v]) { d[v] = d[u] + w; pr[v] = ei; T.ev('nv', v, d[v]); T.ev('pred', v, ei); } }
    }
    for (let u = 0; u < n; u++) if (d[u] === -INF) d[u] = INF;   // unreachable
    return shortestOut(G, T, d, pr, o.s, o.t, { order });
  }
  // strongly connected components: Tarjan 1972 (SIAM J. Comput. 1:146), iterative; classes = the component in the order found
  function sccTarjan(G, T) {
    const n = G.n, idx = new Int32Array(n).fill(-1), low = new Int32Array(n), on = new Uint8Array(n), st = [], comp = new Int32Array(n).fill(-1);
    let index = 0, nc = 0;
    for (let s = 0; s < n; s++) {
      if (idx[s] >= 0) continue;
      const cs = [[s, 0]]; idx[s] = low[s] = index++; st.push(s); on[s] = 1;
      while (cs.length) {
        const top = cs[cs.length - 1], u = top[0];
        if (top[1] < G.out[u].length) {
          const [v] = G.out[u][top[1]++]; if (T && !T.tick()) return { comp, count: nc };
          if (idx[v] < 0) { idx[v] = low[v] = index++; st.push(v); on[v] = 1; cs.push([v, 0]); }
          else if (on[v]) low[u] = Math.min(low[u], idx[v]);
        } else {
          cs.pop(); if (cs.length) { const p = cs[cs.length - 1][0]; low[p] = Math.min(low[p], low[u]); }
          if (low[u] === idx[u]) { if (T) T.frame(); let w; do { w = st.pop(); on[w] = 0; comp[w] = nc; if (T) { T.ev('nc', w, nc); T.ev('ns', w, 2); T.ev('nv', w, nc); } } while (w !== u); nc++; }
        }
      }
    }
    return { comp, count: nc };
  }
  function algScc(G, T) { const r = sccTarjan(G, T); const sizes = new Array(r.count).fill(0); for (const c of r.comp) if (c >= 0) sizes[c]++; return { result: r.count, values: Float64Array.from(r.comp), classes: Array.from(r.comp), componentSizes: sizes.sort((a, b) => b - a) }; }
  function components(G) { const c = new Int32Array(G.n).fill(-1); let k = 0; for (let s = 0; s < G.n; s++) if (c[s] < 0) { const d = bfsDist(G, s, null, true); for (let u = 0; u < G.n; u++) if (d[u] >= 0) c[u] = k; k++; } return { comp: c, count: k }; }
  function algComponents(G, T) {
    const r = components(G); for (let k = 0; k < r.count; k++) { T.frame(); for (let u = 0; u < G.n; u++) if (r.comp[u] === k) { T.ev('nc', u, k); T.ev('nv', u, k); } }
    const sizes = new Array(r.count).fill(0); for (const c of r.comp) sizes[c]++;
    if (r.count > 1) T.D.add('disconnected');
    return { result: r.count, values: Float64Array.from(r.comp), classes: Array.from(r.comp), componentSizes: sizes.sort((a, b) => b - a) };
  }
  function algBipartite(G, T) {
    const r = twoColour(G); T.frame(); for (let u = 0; u < G.n; u++) { T.ev('nc', u, r.col[u]); T.ev('nv', u, r.col[u]); }
    let path = [];
    if (!r.ok) { T.D.add('not-bipartite'); path = r.odd.nodes; T.frame(); for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; const e = G.out[a].find(([v]) => v === b) || G.inn[a].find(([v]) => v === b); if (e) T.ev('es', e[1], 7); } }
    return { result: r.ok ? 1 : 0, values: Float64Array.from(r.col), classes: Array.from(r.col), path };
  }
  // minimum spanning trees: Kruskal 1956 (stable sort on (w, edge index)), Prim 1957 / Jarník 1930, Borůvka 1926 — CLRS §21; a forest if disconnected
  function mstUnique(G, tree) {   // unique iff no non-tree edge ties the maximum on its tree path (the cycle property)
    const n = G.n, adj = Array.from({ length: n }, () => []);
    for (const ei of tree) { const e = G.E[ei]; adj[e.u].push([e.v, e.w]); adj[e.v].push([e.u, e.w]); }
    const inT = new Set(tree);
    for (const e of G.E) {
      if (inT.has(e.i) || e.u === e.v) continue;
      const best = new Float64Array(n).fill(NaN), q = [e.u]; best[e.u] = -INF;
      for (let h = 0; h < q.length; h++) { const u = q[h]; for (const [v, w] of adj[u]) if (Number.isNaN(best[v])) { best[v] = Math.max(best[u], w); q.push(v); } }
      if (best[e.v] === e.w) return false;
    }
    return true;
  }
  function mstOut(G, T, tree) {
    let total = 0; for (const ei of tree) total += G.E[ei].w;
    if (tree.length < G.n - 1) T.D.add('disconnected');
    if (!mstUnique(G, tree)) T.D.add('non-unique-mst');
    return { result: total, count: tree.length, order: tree.slice() };   // order: the tree edges (edge indices) in the order chosen
  }
  function algKruskal(G, T) {
    const es = G.E.filter(e => e.u !== e.v).slice().sort((a, b) => a.w - b.w || a.i - b.i), U = uf(G.n), tree = [];
    for (const e of es) { if (!T.tick()) break; T.frame(); T.ev('ce', e.i); if (U.union(e.u, e.v)) { tree.push(e.i); T.ev('es', e.i, 1); T.ev('ns', e.u, 2); T.ev('ns', e.v, 2); } else T.ev('es', e.i, 3); if (tree.length === G.n - 1) break; }
    return mstOut(G, T, tree);
  }
  function algPrim(G, T, o) {
    const n = G.n, key = new Float64Array(n).fill(INF), pe = new Int32Array(n).fill(-1), inT = new Uint8Array(n), tree = [];
    const roots = [o.s >= 0 ? o.s : 0].concat([...Array(n).keys()]);
    for (const r of roots) {
      if (inT[r]) continue; const H = heap(); key[r] = 0; H.push([0, 0, r]);
      while (H.size()) {
        if (!T.tick()) break;
        const [k, , u] = H.pop(); if (inT[u] || k > key[u]) continue;
        inT[u] = 1; T.frame(); T.ev('cur', u); T.ev('ns', u, 2); if (pe[u] >= 0) { tree.push(pe[u]); T.ev('es', pe[u], 1); }
        for (const [v, ei] of G.out[u]) { const w = G.E[ei].w; if (v === u || inT[v]) continue; T.ev('ce', ei); if (w < key[v]) { key[v] = w; pe[v] = ei; T.ev('nv', v, w); T.ev('ns', v, 1); H.push([w, ei, v]); } }
      }
    }
    return mstOut(G, T, tree);
  }
  function algBoruvka(G, T) {
    const n = G.n, U = uf(n), tree = []; let rounds = 0, comps = n;
    while (comps > 1 && rounds < 64) {
      const best = new Int32Array(n).fill(-1); let any = false;
      for (const e of G.E) { if (!T.tick()) break; const a = U.find(e.u), b = U.find(e.v); if (a === b) continue; for (const c of [a, b]) { const f = best[c] >= 0 ? G.E[best[c]] : null; if (!f || e.w < f.w || (e.w === f.w && e.i < f.i)) best[c] = e.i; } }
      T.frame(); rounds++;
      for (let c = 0; c < n; c++) if (best[c] >= 0) { const e = G.E[best[c]]; if (U.union(e.u, e.v)) { tree.push(e.i); comps--; any = true; T.ev('es', e.i, 1); T.ev('ns', e.u, 2); T.ev('ns', e.v, 2); } }
      if (!any || T.over) break;
    }
    const r = mstOut(G, T, tree); r.iterations = rounds; return r;
  }
  // maximum flow: Edmonds & Karp 1972 (J. ACM 19:248, BFS augmenting paths, one frame each) and Dinic 1970 (level graph + blocking flow);
  // min cut = the nodes reachable from s in the residual graph (Ford & Fulkerson 1956); undirected edges = two opposite arcs
  function residual(G, o) {
    const head = [], cap = [], to = [], adj = Array.from({ length: G.n }, () => []), eOf = [];
    const arc = (u, v, c, ei) => { to.push(v); cap.push(c); eOf.push(ei); adj[u].push(to.length - 1); };
    for (const e of G.E) { if (e.u === e.v) continue; const c = e.cap; arc(e.u, e.v, c, e.i); arc(e.v, e.u, G.directed ? 0 : c, e.i); }
    return { to, cap, adj, eOf, flow: new Float64Array(to.length), head };
  }
  function flowOut(G, T, R, s, t, value) {
    const n = G.n, seen = new Uint8Array(n), q = [s]; seen[s] = 1;
    let maxc = 0; for (const c of R.cap) if (c < INF) maxc = Math.max(maxc, c); const tol = 1e-12 * Math.max(1, maxc);
    for (let h = 0; h < q.length; h++) for (const a of R.adj[q[h]]) if (!seen[R.to[a]] && R.cap[a] - R.flow[a] > tol) { seen[R.to[a]] = 1; q.push(R.to[a]); }
    T.frame(); let cutCap = 0;
    for (let u = 0; u < n; u++) { T.ev('nc', u, seen[u] ? 1 : 0); T.ev('nv', u, seen[u] ? 1 : 0); }
    const ef = new Float64Array(G.E.length);
    for (let a = 0; a < R.to.length; a += 2) { const ei = R.eOf[a]; ef[ei] = R.flow[a]; }
    for (const e of G.E) { if (e.u === e.v) continue; const fwd = seen[e.u] && !seen[e.v], bwd = !G.directed && seen[e.v] && !seen[e.u]; if (fwd || bwd) { cutCap += e.cap; T.ev('es', e.i, 7); } }
    if (G.E.some(e => e.cap % 1 !== 0 && Number.isFinite(e.cap))) T.D.add('float-capacity');
    return { result: value, values: Float64Array.from(seen), edgeFlow: ef, count: cutCap, classes: Array.from(seen) };
  }
  function algEdmondsKarp(G, T, o) {
    const R = residual(G, o), s = o.s, t = o.t; let value = 0;
    for (const c of R.cap) if (Number.isNaN(c)) { T.D.add('nan-weight'); return { result: NaN, values: new Float64Array(G.n).fill(NaN) }; }
    for (let it = 0; it < 10000; it++) {
      const pa = new Int32Array(G.n).fill(-1), q = [s]; pa[s] = -2;
      for (let h = 0; h < q.length && pa[t] === -1; h++) { const u = q[h]; for (const a of R.adj[u]) { if (!T.tick()) break; const v = R.to[a]; if (pa[v] === -1 && R.cap[a] - R.flow[a] > 1e-12) { pa[v] = a; q.push(v); } } }
      if (pa[t] === -1 || T.over) break;
      let df = INF; for (let v = t; v !== s; v = R.to[pa[v] ^ 1]) df = Math.min(df, R.cap[pa[v]] - R.flow[pa[v]]);
      if (df === INF) { T.D.add('unbounded'); return { result: INF, values: new Float64Array(G.n).fill(NaN) }; }
      T.frame();
      for (let v = t; v !== s; v = R.to[pa[v] ^ 1]) { const a = pa[v]; R.flow[a] += df; R.flow[a ^ 1] -= df; const ei = R.eOf[a], f = R.flow[a & ~1]; T.ev('ce', ei); T.ev('ev', ei, Math.abs(f)); T.ev('es', ei, Math.abs(f) > 0 ? 9 : 0); }
      value += df;
    }
    return flowOut(G, T, R, s, t, value);
  }
  function algDinic(G, T, o) {
    const R = residual(G, o), s = o.s, t = o.t, n = G.n; let value = 0, phases = 0;
    for (const c of R.cap) if (Number.isNaN(c)) { T.D.add('nan-weight'); return { result: NaN, values: new Float64Array(n).fill(NaN) }; }
    while (phases < 1000) {
      const lev = new Int32Array(n).fill(-1), q = [s]; lev[s] = 0;
      for (let h = 0; h < q.length; h++) for (const a of R.adj[q[h]]) { const v = R.to[a]; if (lev[v] < 0 && R.cap[a] - R.flow[a] > 1e-12) { lev[v] = lev[q[h]] + 1; q.push(v); } }
      if (lev[t] < 0) break;
      phases++; T.frame(); for (let u = 0; u < n; u++) T.ev('nv', u, lev[u] >= 0 ? lev[u] : NaN);
      const it = new Int32Array(n);
      for (;;) {   // one augmenting path of the level graph at a time (iterative DFS with current-arc pointers)
        const stack = [s], arcs = [];
        while (stack.length && stack[stack.length - 1] !== t) {
          if (!T.tick()) break;
          const u = stack[stack.length - 1]; let moved = false;
          while (it[u] < R.adj[u].length) { const a = R.adj[u][it[u]], v = R.to[a]; if (lev[v] === lev[u] + 1 && R.cap[a] - R.flow[a] > 1e-12) { stack.push(v); arcs.push(a); moved = true; break; } it[u]++; }
          if (!moved) { lev[u] = -1; stack.pop(); if (arcs.length) { const a = arcs.pop(); it[R.to[a ^ 1]]++; } }
        }
        if (T.over || !stack.length) break;
        let df = INF; for (const a of arcs) df = Math.min(df, R.cap[a] - R.flow[a]);
        if (df === INF) { T.D.add('unbounded'); return { result: INF, values: new Float64Array(n).fill(NaN) }; }
        T.frame(); for (const a of arcs) { R.flow[a] += df; R.flow[a ^ 1] -= df; const ei = R.eOf[a], f = R.flow[a & ~1]; T.ev('ce', ei); T.ev('ev', ei, Math.abs(f)); T.ev('es', ei, f !== 0 ? 9 : 0); }
        value += df;
      }
      if (T.over) break;
    }
    const r = flowOut(G, T, R, s, t, value); r.iterations = phases; return r;
  }
  // vertex connectivity κ(s, t) by node splitting (Menger 1927; Even 1975): the number of internally vertex-disjoint s–t paths
  function algVertexConn(G, T, o) {
    const n = G.n, s = o.s, t = o.t, E2 = [], ids = [];
    for (let u = 0; u < n; u++) { ids.push(G.ids[u] + '_in'); }
    for (let u = 0; u < n; u++) { ids.push(G.ids[u] + '_out'); E2.push({ u, v: n + u, w: 1, cap: u === s || u === t ? INF : 1 }); }
    let adj = false;
    for (const e of G.E) { if (e.u === e.v) continue; if ((e.u === s && e.v === t) || (e.v === s && e.u === t)) { adj = true; continue; } E2.push({ u: n + e.u, v: e.v, w: 1, cap: n }); if (!G.directed) E2.push({ u: n + e.v, v: e.u, w: 1, cap: n }); }
    const H = makeGraph(ids, E2, true), T2 = tracer(H, T.D); T2.ops = T.ops;
    const r = algEdmondsKarp(H, T2, { s: n + s, t });
    T.ops = T2.ops; if (adj) T.D.add('adjacent');
    const val = r.result + (adj ? 1 : 0);
    T.frame(); T.ev('ns', s, 2); T.ev('ns', t, 2);
    return { result: val, values: new Float64Array(n).fill(NaN) };
  }
  // bipartite matching: Hopcroft & Karp 1973 (SIAM J. Comput. 2:225), O(E√V); sides from the 2-colouring (side 0 = left)
  function algMatching(G, T) {
    const tc = twoColour(G); if (!tc.ok) { T.D.add('not-bipartite'); return { result: NaN, values: new Float64Array(G.n).fill(NaN) }; }
    const n = G.n, mate = new Int32Array(n).fill(-1), me = new Int32Array(n).fill(-1), L = []; for (let u = 0; u < n; u++) if (tc.col[u] === 0) L.push(u);
    let size = 0, phases = 0;
    for (;;) {
      const dist = new Float64Array(n).fill(INF), q = [];
      for (const u of L) if (mate[u] < 0) { dist[u] = 0; q.push(u); }
      let found = false;
      for (let h = 0; h < q.length; h++) { const u = q[h]; for (const [v] of G.out[u]) { if (!T.tick()) break; const w = mate[v]; if (w < 0) found = true; else if (dist[w] === INF) { dist[w] = dist[u] + 1; q.push(w); } } }
      if (!found || T.over) break;
      phases++;
      for (const u0 of L) {
        if (mate[u0] >= 0) continue;
        const st = [[u0, 0]], path = []; let ok = false;   // iterative DFS along the layers
        while (st.length) {
          if (!T.tick()) break;
          const top = st[st.length - 1], u = top[0];
          if (top[1] >= G.out[u].length) { dist[u] = INF; st.pop(); path.pop(); continue; }
          const [v, ei] = G.out[u][top[1]++], w = mate[v];
          if (w < 0) { path.push([u, v, ei]); ok = true; break; }
          if (dist[w] === dist[u] + 1) { path.push([u, v, ei]); st.push([w, 0]); }
        }
        if (!ok) continue;
        T.frame();
        for (const [u, v, ei] of path) { if (me[u] >= 0) T.ev('es', me[u], 0); if (me[v] >= 0 && me[v] !== me[u]) T.ev('es', me[v], 0); }
        for (const [u, v, ei] of path) { mate[u] = v; mate[v] = u; me[u] = ei; me[v] = ei; }
        for (const [u, v, ei] of path) { T.ev('es', ei, 1); T.ev('ns', u, 2); T.ev('ns', v, 2); }
        size++;
      }
    }
    const values = Float64Array.from(mate);
    return { result: size, values, iterations: phases, classes: Array.from(tc.col) };
  }
  // maximum matching in a general graph: Edmonds 1965 (Can. J. Math. 17:449), blossoms contracted through a base array — O(V³)
  function algBlossom(G, T) {
    const n = G.n, adj = G.out.map(l => l.filter(([v, ]) => true)), mate = new Int32Array(n).fill(-1), me = new Int32Array(n).fill(-1);
    let size = 0;
    const lca = (a, b, base, par) => { const used = new Uint8Array(n); for (;;) { a = base[a]; used[a] = 1; if (mate[a] < 0) break; a = par[mate[a]]; } for (;;) { b = base[b]; if (used[b]) return b; b = par[mate[b]]; } };
    for (let root0 = 0; root0 < n; root0++) {
      if (mate[root0] >= 0) continue;
      const used = new Uint8Array(n), par = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1), base = Int32Array.from({ length: n }, (_, i) => i), q = [root0];
      used[root0] = 1; let end = -1;
      const markPath2 = (v, b, child, blossom) => { while (base[v] !== b) { blossom[base[v]] = blossom[base[mate[v]]] = 1; par[v] = child; child = mate[v]; v = par[mate[v]]; } };
      for (let h = 0; h < q.length && end < 0; h++) {
        const v = q[h];
        for (const [to, ei] of adj[v]) {
          if (!T.tick()) break;
          if (to === v || base[v] === base[to] || mate[v] === to) continue;
          if (to === root0 || (mate[to] >= 0 && par[mate[to]] >= 0)) {
            const cb = lca(v, to, base, par), blossom = new Uint8Array(n);
            markPath2(v, cb, to, blossom); markPath2(to, cb, v, blossom);
            for (let i = 0; i < n; i++) if (blossom[base[i]]) { base[i] = cb; if (!used[i]) { used[i] = 1; q.push(i); } }
          } else if (par[to] < 0) {
            par[to] = v; pe[to] = ei;
            if (mate[to] < 0) { end = to; break; }
            used[mate[to]] = 1; q.push(mate[to]);
          }
        }
        if (T.over) break;
      }
      if (end < 0) continue;
      T.frame();
      let v = end;
      while (v >= 0) { const pv = par[v], ppv = mate[pv]; const ei = (G.out[v].find(([x]) => x === pv) || [0, -1])[1]; if (me[pv] >= 0) T.ev('es', me[pv], 0); mate[v] = pv; mate[pv] = v; me[v] = me[pv] = ei; v = ppv; }
      for (let u = 0; u < n; u++) if (mate[u] >= 0 && me[u] >= 0) { T.ev('es', me[u], 1); T.ev('ns', u, 2); }
      size++;
    }
    return { result: size, values: Float64Array.from(mate) };
  }
  // the assignment problem: Kuhn 1955 / Munkres 1957, the O(n³) shortest-augmenting-path form with potentials; sides from the 2-colouring
  function algAssignment(G, T, run) {
    const tc = twoColour(G); if (!tc.ok) { T.D.add('not-bipartite'); return { result: NaN, values: new Float64Array(G.n).fill(NaN) }; }
    const L = [], R = []; for (let u = 0; u < G.n; u++) (tc.col[u] === 0 ? L : R).push(u);
    const maxim = run.mode === 'max', swap = L.length > R.length, A = swap ? R : L, B = swap ? L : R, na = A.length, nb = B.length;
    const BIG = 1e15, cost = Array.from({ length: na }, () => new Float64Array(nb).fill(BIG)), ce = Array.from({ length: na }, () => new Int32Array(nb).fill(-1));
    const pos = new Map(); A.forEach((u, i) => pos.set(u, i)); const posB = new Map(); B.forEach((u, j) => posB.set(u, j));
    for (const e of G.E) { let a = e.u, b = e.v; if (!pos.has(a)) [a, b] = [b, a]; if (!pos.has(a) || !posB.has(b)) continue; const c = maxim ? -e.w : e.w, i = pos.get(a), j = posB.get(b); if (c < cost[i][j]) { cost[i][j] = c; ce[i][j] = e.i; } }
    const u = new Float64Array(na + 1), v = new Float64Array(nb + 1), p = new Int32Array(nb + 1), way = new Int32Array(nb + 1);
    for (let i = 1; i <= na; i++) {
      p[0] = i; let j0 = 0; const minv = new Float64Array(nb + 1).fill(INF), used = new Uint8Array(nb + 1);
      do {
        if (!T.tick(nb)) break;
        used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
        for (let j = 1; j <= nb; j++) if (!used[j]) { const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
        for (let j = 0; j <= nb; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        j0 = j1;
      } while (p[j0] !== 0);
      if (T.over) break;
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    let total = 0, bad = false; const values = new Float64Array(G.n).fill(-1);
    T.frame();
    for (let j = 1; j <= nb; j++) if (p[j]) { const i = p[j] - 1, c = cost[i][j - 1]; if (c >= BIG / 2) { bad = true; continue; } total += maxim ? -c : c; T.ev('es', ce[i][j - 1], 1); values[A[i]] = B[j - 1]; values[B[j - 1]] = A[i]; }
    if (bad) { T.D.add('infeasible'); }
    return { result: bad ? NaN : total, values, classes: Array.from(tc.col) };
  }
  // Euler paths and circuits: the degree conditions (Euler 1736; Hierholzer 1873), Hierholzer's algorithm, iterative O(E)
  function eulerKind(G) {
    const n = G.n; let odd = [], start = -1;
    const nz = []; for (let u = 0; u < n; u++) if (G.out[u].length || G.inn[u].length) nz.push(u);
    if (!nz.length) return { kind: 2, start: 0, odd };
    const c = components(G); const cs = new Set(nz.map(u => c.comp[u])); if (cs.size > 1) return { kind: 0, odd, start: -1, split: true };
    if (G.directed) {
      let plus = 0, minus = 0;
      for (let u = 0; u < n; u++) { const d = G.out[u].length - G.inn[u].length; if (d === 1) { plus++; start = u; odd.push(u); } else if (d === -1) { minus++; odd.push(u); } else if (d !== 0) return { kind: 0, odd: odd.concat([u]), start: -1 }; }
      if (plus === 0 && minus === 0) return { kind: 2, start: nz[0], odd };
      return plus === 1 && minus === 1 ? { kind: 1, start, odd } : { kind: 0, odd, start: -1 };
    }
    for (let u = 0; u < n; u++) if (degree(G, u) % 2) odd.push(u);
    return odd.length === 0 ? { kind: 2, start: nz[0], odd } : odd.length === 2 ? { kind: 1, start: odd[0], odd } : { kind: 0, odd, start: -1 };
  }
  function algEuler(G, T) {
    const k = eulerKind(G), values = new Float64Array(G.n).fill(0); for (const u of k.odd) values[u] = 1;
    T.frame(); for (const u of k.odd) T.ev('nc', u, 3);
    if (!k.kind) { T.D.add('no-euler'); return { result: 0, values, path: [], count: k.odd.length }; }
    const used = new Uint8Array(G.E.length), ptr = new Int32Array(G.n), st = [[k.start, -1]], path = [], pe = [];
    while (st.length) {
      if (!T.tick()) break;
      const [u] = st[st.length - 1]; let moved = false;
      while (ptr[u] < G.out[u].length) { const [v, ei] = G.out[u][ptr[u]++]; if (!used[ei]) { used[ei] = 1; st.push([v, ei]); moved = true; break; } }
      if (!moved) { const [x, ei] = st.pop(); path.push(x); if (ei >= 0) pe.push(ei); }
    }
    path.reverse(); pe.reverse();
    pe.forEach((ei, i) => { T.frame(); T.ev('cur', path[i + 1]); T.ev('ce', ei); T.ev('es', ei, 1); T.ev('ev', ei, i + 1); });
    return { result: k.kind, values, path, count: k.odd.length };
  }
  // Hamiltonian path / cycle by backtracking with pruning (n ≤ 20; the budget bounds it, else `undecided`)
  function algHamilton(G, T, o, run) {
    const n = G.n, cycle = run.mode !== 'path', inP = new Uint8Array(n), path = [], pes = [];
    const starts = cycle ? [0] : [...Array(n).keys()];
    let found = false;
    for (const s of (o.s >= 0 ? [o.s] : starts)) {
      path.length = 0; pes.length = 0; inP.fill(0); path.push(s); inP[s] = 1;
      const it = [0];
      T.frame(); T.ev('ns', s, 2);
      while (path.length && !found) {
        if (!T.tick()) break;
        const u = path[path.length - 1], L = G.out[u];
        if (path.length === n) {
          if (!cycle) { found = true; break; }
          const back = L.find(([v]) => v === path[0]); if (back) { pes.push(back[1]); found = true; break; }
        }
        let moved = false;
        while (it[it.length - 1] < L.length) { const [v, ei] = L[it[it.length - 1]++]; if (!inP[v]) { inP[v] = 1; path.push(v); pes.push(ei); it.push(0); moved = true; T.frame(); T.ev('ns', v, 2); T.ev('es', ei, 1); break; } }
        if (!moved) { const x = path.pop(); inP[x] = 0; it.pop(); if (pes.length >= path.length && pes.length) { const ei = pes.pop(); T.frame(); T.ev('ns', x, 0); T.ev('es', ei, 3); } }
      }
      if (found || T.over) break;
    }
    if (found) { T.frame(); pes.forEach((ei, i) => { T.ev('es', ei, 8); T.ev('ev', ei, i + 1); }); return { result: 1, path: path.slice(), values: Float64Array.from({ length: n }, (_, u) => path.indexOf(u)) }; }
    if (T.over) { T.D.add('undecided'); return { result: NaN, path: [], values: new Float64Array(n).fill(NaN) }; }
    T.D.add('non-hamiltonian'); return { result: 0, path: [], values: new Float64Array(n).fill(NaN) };
  }
  // the travelling salesman: Held & Karp 1962 bitmask DP for n ≤ 11 (exact), else nearest neighbour + 2-opt (Croes 1958) on the shortest-path metric
  function algTsp(G, T, o, run) {
    const n = G.n, Dm = floydWarshall(G, null).D, s = o.s >= 0 ? o.s : 0;
    const direct = Array.from({ length: n }, () => new Float64Array(n).fill(INF));
    for (const e of G.E) { if (e.w < direct[e.u][e.v]) { direct[e.u][e.v] = e.w; direct[e.v][e.u] = e.w; } }
    const exact = run.mode !== 'heuristic' && n <= 11;
    const W = exact ? direct : Dm;
    let tour = [];
    if (n === 1) tour = [s];
    else if (exact) {
      const others = [...Array(n).keys()].filter(u => u !== s), k = others.length, F = new Float64Array((1 << k) * k).fill(INF), Pp = new Int32Array((1 << k) * k).fill(-1);
      for (let j = 0; j < k; j++) F[(1 << j) * k + j] = W[s][others[j]];
      for (let S = 1; S < (1 << k); S++) for (let j = 0; j < k; j++) {
        if (!(S & (1 << j))) continue; const f = F[S * k + j]; if (f === INF) continue;
        T.tick(k);
        for (let m2 = 0; m2 < k; m2++) { if (S & (1 << m2)) continue; const S2 = S | (1 << m2), v = f + W[others[j]][others[m2]]; if (v < F[S2 * k + m2]) { F[S2 * k + m2] = v; Pp[S2 * k + m2] = j; } }
      }
      const full = (1 << k) - 1; let best = INF, bj = -1;
      for (let j = 0; j < k; j++) { const v = F[full * k + j] + W[others[j]][s]; if (v < best) { best = v; bj = j; } }
      if (bj >= 0) { let S = full, j = bj; const seq = []; while (j >= 0) { seq.push(others[j]); const pj = Pp[S * k + j]; S &= ~(1 << j); j = pj; } tour = [s].concat(seq.reverse()); }
    } else {
      const seen = new Uint8Array(n); tour = [s]; seen[s] = 1;
      for (let i = 1; i < n; i++) { const u = tour[tour.length - 1]; let b = -1; for (let v = 0; v < n; v++) if (!seen[v] && (b < 0 || W[u][v] < W[u][b])) b = v; seen[b] = 1; tour.push(b); }
      for (let pass = 0, imp = true; imp && pass < 100; pass++) {   // 2-opt: reverse a stretch while it shortens the tour
        imp = false;
        for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
          if (!T.tick()) break;
          const a = tour[i - 1], b = tour[i], c = tour[j], d = tour[(j + 1) % n];
          if (W[a][c] + W[b][d] < W[a][b] + W[c][d] - 1e-12) { tour = tour.slice(0, i).concat(tour.slice(i, j + 1).reverse(), tour.slice(j + 1)); imp = true; T.frame(); }
        }
      }
    }
    if (tour.length !== n) { T.D.add('no-tour'); return { result: NaN, path: [], values: new Float64Array(n).fill(NaN) }; }
    let len = 0; for (let i = 0; i < n; i++) len += W[tour[i]][tour[(i + 1) % n]];
    if (!(len < INF)) { T.D.add('no-tour'); return { result: NaN, path: [], values: new Float64Array(n).fill(NaN) }; }
    T.frame();
    for (let i = 0; i < n && n > 1; i++) { const a = tour[i], b = tour[(i + 1) % n]; const e = G.out[a].filter(([v]) => v === b).sort((x, y) => G.E[x[1]].w - G.E[y[1]].w)[0]; if (e) { T.ev('es', e[1], 8); T.ev('ev', e[1], i + 1); } T.ev('nv', a, i); }
    return { result: len, path: tour.concat(n > 1 ? [tour[0]] : []), values: Float64Array.from({ length: n }, (_, u) => tour.indexOf(u)) };
  }
  // colouring: greedy in an order (given, largest-first = Welsh & Powell 1967, smallest-last = Matula & Beck 1983), DSATUR (Brélaz 1979,
  // Commun. ACM 22:251) and exact (DSATUR branch and bound with the budget; lower bound = a greedy clique ⇒ `bounds-only` when cut)
  function greedyColour(G, order) { const col = new Int32Array(G.n).fill(-1); for (const u of order) { const used = new Set(); for (const [v] of G.out[u]) if (col[v] >= 0) used.add(col[v]); let c = 0; while (used.has(c)) c++; col[u] = c; } return col; }
  function smallestLast(G) {
    const n = G.n, deg = Int32Array.from({ length: n }, (_, u) => G.out[u].filter(([v]) => v !== u).length), gone = new Uint8Array(n), seq = [];
    for (let i = 0; i < n; i++) { let b = -1; for (let u = 0; u < n; u++) if (!gone[u] && (b < 0 || deg[u] < deg[b])) b = u; gone[b] = 1; seq.push(b); for (const [v] of G.out[b]) if (!gone[v]) deg[v]--; }
    return { order: seq.reverse(), degen: Math.max(0, ...seq.map(() => 0)) };
  }
  function dsatur(G, T, record) {
    const n = G.n, col = new Int32Array(n).fill(-1), sat = Array.from({ length: n }, () => new Set()), deg = Int32Array.from({ length: n }, (_, u) => G.out[u].length);
    for (let i = 0; i < n; i++) {
      let b = -1; for (let u = 0; u < n; u++) if (col[u] < 0 && (b < 0 || sat[u].size > sat[b].size || (sat[u].size === sat[b].size && deg[u] > deg[b]))) b = u;
      let c = 0; while (sat[b].has(c)) c++; col[b] = c;
      if (record) { T.frame(); T.ev('cur', b); T.ev('nc', b, c); T.ev('nv', b, c); }
      for (const [v] of G.out[b]) sat[v].add(c);
    }
    return col;
  }
  function greedyClique(G) { let best = []; for (let s = 0; s < G.n; s++) { const cl = [s]; const nb = u => new Set(G.out[u].map(([v]) => v)); let cand = [...nb(s)].filter(v => v !== s).sort((a, b) => G.out[b].length - G.out[a].length || a - b); while (cand.length) { const v = cand.shift(); cl.push(v); const nv = nb(v); cand = cand.filter(x => nv.has(x)); } if (cl.length > best.length) best = cl; } return best; }
  function algColoring(G, T, run) {
    const n = G.n, ord = run.order || 'dsatur';
    if (G.E.some(e => e.u === e.v)) { T.D.add('self-loop'); return { result: NaN, values: new Float64Array(n).fill(NaN) }; }
    let col;
    if (ord === 'dsatur' || ord === 'exact') col = dsatur(G, T, ord === 'dsatur');
    else {
      const order = ord === 'given' ? [...Array(n).keys()] : ord === 'largest-first' ? [...Array(n).keys()].sort((a, b) => degree(G, b) - degree(G, a) || a - b) : smallestLast(G).order;
      col = greedyColour(G, order);
      for (const u of order) { T.frame(); T.ev('cur', u); T.ev('nc', u, col[u]); T.ev('nv', u, col[u]); }
    }
    let k = n ? Math.max(...col) + 1 : 0;
    const lower = greedyClique(G).length;
    if (ord === 'exact' && k > lower) {   // branch and bound: try to colour with k − 1 colours, DSATUR order, until proved or the budget ends
      let best = Array.from(col), bestK = k, cut = false;
      const tryK = K => {
        const c = new Int32Array(n).fill(-1), stack = []; let count = 0;
        const pick = () => { let b = -1, bs = -1; for (let u = 0; u < n; u++) if (c[u] < 0) { const s = new Set(); for (const [v] of G.out[u]) if (c[v] >= 0) s.add(c[v]); if (s.size > bs || (s.size === bs && G.out[u].length > G.out[b].length)) { b = u; bs = s.size; } } return b; };
        let u = pick(); stack.push([u, -1]);
        while (stack.length) {
          if (!T.tick()) { cut = true; return null; }
          const top = stack[stack.length - 1]; const x = top[0]; c[x] = -1;
          let nxt = top[1] + 1; const used = new Set(); for (const [v] of G.out[x]) if (c[v] >= 0) used.add(c[v]);
          const maxc = Math.min(K - 1, count + 0 >= 0 ? K - 1 : K - 1);
          while (nxt <= maxc && used.has(nxt)) nxt++;
          if (nxt > maxc) { stack.pop(); continue; }
          top[1] = nxt; c[x] = nxt;
          if (stack.length === n) return Array.from(c);
          const y = pick(); stack.push([y, -1]);
        }
        return null;
      };
      while (bestK > lower) { const r = tryK(bestK - 1); if (!r) break; best = r; bestK = Math.max(...r) + 1; }
      col = Int32Array.from(best); k = bestK;
      if (cut) T.D.add('bounds-only');
      T.frame(); for (let u = 0; u < n; u++) { T.ev('nc', u, col[u]); T.ev('nv', u, col[u]); }
    }
    return { result: k, values: Float64Array.from(col), classes: Array.from(col), lower };
  }
  // articulation points and bridges: Hopcroft & Tarjan 1973 (Commun. ACM 16:372) low-link, iterative; parallel edges by edge id
  function algArticulation(G, T) {
    const n = G.n, disc = new Int32Array(n).fill(-1), low = new Int32Array(n), ap = new Uint8Array(n), bridges = []; let time = 0;
    for (let s = 0; s < n; s++) {
      if (disc[s] >= 0) continue; disc[s] = low[s] = time++; let kids = 0;
      const st = [[s, -1, 0]];
      while (st.length) {
        if (!T.tick()) break;
        const top = st[st.length - 1], u = top[0];
        if (top[2] < G.out[u].length) {
          const [v, ei] = G.out[u][top[2]++]; if (ei === top[1]) continue;
          if (disc[v] < 0) { disc[v] = low[v] = time++; st.push([v, ei, 0]); if (u === s) kids++; T.frame(); T.ev('cur', v); T.ev('nv', v, disc[v]); T.ev('pred', v, ei); }
          else low[u] = Math.min(low[u], disc[v]);
        } else {
          st.pop();
          if (st.length) { const p = st[st.length - 1][0]; low[p] = Math.min(low[p], low[u]); if (low[u] > disc[p]) bridges.push(top[1]); if (p !== s && low[u] >= disc[p]) ap[p] = 1; }
        }
      }
      if (kids > 1) ap[s] = 1;
    }
    T.frame(); for (let u = 0; u < n; u++) if (ap[u]) T.ev('nc', u, 3); for (const ei of bridges) T.ev('es', ei, 7);
    let c = 0; for (const a of ap) c += a;
    return { result: c, values: Float64Array.from(ap), count: bridges.length, bridges: bridges.slice().sort((a, b) => a - b) };
  }
  /* ---------- centralities and network measures (Newman, Networks, 2nd ed. 2018; the networkx 3.x conventions, stated) ---------- */
  function rankFrame(T, vals) { T.frame(); const n = vals.length, order = [...Array(n).keys()].sort((a, b) => vals[b] - vals[a] || a - b); order.forEach((u, i) => { T.ev('nv', u, vals[u]); T.ev('nc', u, i < Math.max(1, Math.ceil(n / 10)) ? 0 : i < Math.ceil(n / 3) ? 1 : -1); }); return order; }
  function centralOut(T, vals, extra) { const order = rankFrame(T, vals); let mx = -INF; for (const v of vals) if (v > mx) mx = v; return Object.assign({ result: mx, values: vals, top: order.length ? order[0] : NaN, order }, extra || {}); }
  // PageRank (Brin & Page 1998): power iteration, damping α (0.85), dangling nodes spread uniformly, L1 tolerance, ≤ maxIter
  function algPagerank(G, T, o, run, env) {
    const n = G.n, a = run.alpha === undefined ? 0.85 : C.cx(run.alpha)(env), tol = run.tol || 1e-12, maxIt = run.maxIter || 1000;
    if (!(a > 0 && a < 1)) { T.D.add('param'); return { result: NaN, values: new Float64Array(n).fill(NaN) }; }
    const wsum = new Float64Array(n), wt = e => (run.weighted ? e.w : 1);
    const arcs = []; for (const e of G.E) { arcs.push([e.u, e.v, wt(e)]); if (!G.directed && e.u !== e.v) arcs.push([e.v, e.u, wt(e)]); }
    for (const [u, , w] of arcs) wsum[u] += w;
    const pers = new Float64Array(n).fill(1 / n); if (o.s >= 0) { pers.fill(0); pers[o.s] = 1; }
    let x = new Float64Array(n).fill(1 / n); const res = []; let it = 0, conv = false;
    for (; it < maxIt; it++) {
      if (!T.tick(arcs.length + n)) break;
      const y = new Float64Array(n); let dang = 0;
      for (let u = 0; u < n; u++) if (wsum[u] === 0) dang += x[u];
      for (const [u, v, w] of arcs) y[v] += a * x[u] * w / wsum[u];
      for (let u = 0; u < n; u++) y[u] += a * dang * pers[u] + (1 - a) * pers[u];
      let err = 0; for (let u = 0; u < n; u++) err += abs(y[u] - x[u]);
      x = y; res.push(err);
      if (it < 60) { T.frame(); for (let u = 0; u < n; u++) T.ev('nv', u, x[u]); }
      if (err < tol) { conv = true; it++; break; }
    }
    if (!conv) T.D.add('not-converged');
    return centralOut(T, x, { residual: res, iterations: it });
  }
  // betweenness: Brandes 2001 (J. Math. Sociol. 25:163); weighted with Dijkstra (ties within a relative 1e-12); normalised as networkx
  function brandes(G, T, weighted, edgeB) {
    const n = G.n, CB = new Float64Array(n), EB = edgeB ? new Float64Array(G.E.length) : null;
    for (let s = 0; s < n; s++) {
      const S = [], P = Array.from({ length: n }, () => []), sig = new Float64Array(n), d = new Float64Array(n).fill(INF);
      sig[s] = 1; d[s] = 0;
      if (!weighted) { const q = [s]; for (let h = 0; h < q.length; h++) { const v = q[h]; S.push(v); for (const [w, ei] of G.out[v]) { if (!T.tick()) return null; if (w === v) continue; if (d[w] === INF) { d[w] = d[v] + 1; q.push(w); } if (d[w] === d[v] + 1) { sig[w] += sig[v]; P[w].push([v, ei]); } } } }
      else {
        const H = heap(), done = new Uint8Array(n); H.push([0, 0, s]);
        while (H.size()) {
          const [dv, , v] = H.pop(); if (done[v]) continue; done[v] = 1; S.push(v);
          for (const [w, ei] of G.out[v]) {
            if (!T.tick()) return null; if (w === v) continue;
            const nd = dv + G.E[ei].w, tolr = 1e-12 * Math.max(1, abs(nd));
            if (nd < d[w] - tolr) { d[w] = nd; sig[w] = sig[v]; P[w] = [[v, ei]]; H.push([nd, 0, w]); }
            else if (abs(nd - d[w]) <= tolr && !done[w]) { sig[w] += sig[v]; P[w].push([v, ei]); }
          }
        }
      }
      const del = new Float64Array(n);
      for (let i = S.length - 1; i >= 0; i--) { const w = S[i]; for (const [v, ei] of P[w]) { const c = sig[v] / sig[w] * (1 + del[w]); del[v] += c; if (EB) EB[ei] += c; } if (w !== s) CB[w] += del[w]; }
    }
    if (!G.directed) { for (let u = 0; u < n; u++) CB[u] /= 2; if (EB) for (let i = 0; i < EB.length; i++) EB[i] /= 2; }
    return { CB, EB };
  }
  function algBetweenness(G, T, run) {
    const n = G.n, r = brandes(G, T, run.weighted === true, false);
    if (!r) return { result: NaN, values: new Float64Array(n).fill(NaN) };
    const v = r.CB; if (run.normalized !== false && n > 2) { const s = G.directed ? 1 / ((n - 1) * (n - 2)) : 2 / ((n - 1) * (n - 2)); for (let u = 0; u < n; u++) v[u] *= s; }
    return centralOut(T, v);
  }
  function distRows(G, T, weighted, s) {   // hop or weighted distances from s
    if (!weighted) { const d = bfsDist(G, s, T); return Float64Array.from(d, x => (x < 0 ? INF : x)); }
    return algDijkstra(G, tracer(G, { add() { } }), { s, t: -1 }, null, 0).values;
  }
  // closeness: (r−1)/Σd scaled by (r−1)/(n−1) for disconnected graphs (Wasserman & Faust 1994; networkx wf_improved); harmonic: Σ 1/d (Boldi & Vigna 2014)
  function algCloseness(G, T, run, harmonic) {
    const n = G.n, v = new Float64Array(n); let disc = false;
    const Gr = G.directed ? makeGraph(G.ids, G.E.map(e => ({ u: e.v, v: e.u, w: e.w })), true) : G;   // networkx: incoming distances for digraphs
    for (let u = 0; u < n; u++) {
      const d = distRows(Gr, T, run.weighted === true, u); let s = 0, r = 0, h = 0;
      for (let x = 0; x < n; x++) if (x !== u && d[x] < INF) { s += d[x]; r++; h += 1 / d[x]; }
      if (r < n - 1) disc = true;
      v[u] = harmonic ? h : s > 0 && n > 1 ? (r / s) * (r / (n - 1)) : 0;
      if (T.over) break;
    }
    if (disc) T.D.add('disconnected');
    return centralOut(T, v);
  }
  // eigenvector centrality: power iteration on A + I (the shift: no oscillation on bipartite graphs), unit L2 norm, positive (networkx)
  function algEigen(G, T, run) {
    const n = G.n, maxIt = run.maxIter || 1000, tol = run.tol || 1e-12; let x = new Float64Array(n).fill(1 / n), it = 0, conv = false; const res = [];
    for (; it < maxIt; it++) {
      if (!T.tick(G.E.length + n)) break;
      const y = Float64Array.from(x);
      for (const e of G.E) { const w = run.weighted ? e.w : 1; y[e.v] += x[e.u] * w; if (!G.directed && e.u !== e.v) y[e.u] += x[e.v] * w; }
      let nr = 0; for (const t of y) nr += t * t; nr = sqrt(nr);
      if (nr === 0) break;
      let err = 0; for (let u = 0; u < n; u++) { y[u] /= nr; err += abs(y[u] - x[u]); }
      x = y; res.push(err); if (err < n * tol) { conv = true; it++; break; }
    }
    const comps = components(G).count; if (comps > 1) T.D.add('disconnected');
    if (G.directed && !findCycle(G)) { T.D.add('eigen-zero'); x = new Float64Array(n); }
    else if (!conv) T.D.add('not-converged');
    return centralOut(T, x, { residual: res, iterations: it });
  }
  // Katz 1953 (Psychometrika 18:39): x = α·Aᵀx + β, needs α < 1/λmax (else `param`), unit L2 norm (networkx)
  function algKatz(G, T, run, env) {
    const n = G.n, a = run.alpha === undefined ? 0.1 : C.cx(run.alpha)(env), b = run.beta === undefined ? 1 : C.cx(run.beta)(env), maxIt = run.maxIter || 1000, tol = run.tol || 1e-12;
    if (!(a > 0) || !Number.isFinite(b)) { T.D.add('param'); return { result: NaN, values: new Float64Array(n).fill(NaN) }; }
    let x = new Float64Array(n), conv = false, it = 0; const res = [];
    for (; it < maxIt; it++) {
      if (!T.tick(G.E.length + n)) break;
      const y = new Float64Array(n).fill(b);
      for (const e of G.E) { const w = run.weighted ? e.w : 1; y[e.v] += a * x[e.u] * w; if (!G.directed && e.u !== e.v) y[e.u] += a * x[e.v] * w; }
      let err = 0; for (let u = 0; u < n; u++) err += abs(y[u] - x[u]);
      x = y; res.push(err); if (!Number.isFinite(err) || err > 1e200) break; if (err < n * tol) { conv = true; it++; break; }
    }
    if (!conv) { T.D.add('param'); T.D.add('not-converged'); return { result: NaN, values: new Float64Array(n).fill(NaN), residual: res }; }
    let nr = 0; for (const t of x) nr += t * t; nr = sqrt(nr); for (let u = 0; u < n; u++) x[u] /= nr;
    return centralOut(T, x, { residual: res, iterations: it });
  }
  // HITS (Kleinberg 1999, J. ACM 46:604): hubs and authorities by power iteration, each normalised to sum 1 (networkx)
  function algHits(G, T, run) {
    const n = G.n, maxIt = run.maxIter || 1000, tol = run.tol || 1e-12; let h = new Float64Array(n).fill(1 / n), au = new Float64Array(n), it = 0, conv = false;
    const arcs = []; for (const e of G.E) { arcs.push([e.u, e.v]); if (!G.directed && e.u !== e.v) arcs.push([e.v, e.u]); }
    for (; it < maxIt; it++) {
      if (!T.tick(2 * arcs.length)) break;
      const a2 = new Float64Array(n), h2 = new Float64Array(n);
      for (const [u, v] of arcs) a2[v] += h[u];
      for (const [u, v] of arcs) h2[u] += a2[v];
      let sh = 0, sa = 0; for (let u = 0; u < n; u++) { sh += h2[u]; sa += a2[u]; }
      if (sh === 0) break;
      let err = 0; for (let u = 0; u < n; u++) { h2[u] /= sh; a2[u] /= sa; err += abs(h2[u] - h[u]); }
      h = h2; au = a2; if (err < n * tol) { conv = true; it++; break; }
    }
    if (!conv) T.D.add('not-converged');
    return centralOut(T, run.mode === 'hubs' ? h : au, { iterations: it });
  }
  function algDegree(G, T) { const n = G.n, v = Float64Array.from({ length: n }, (_, u) => (n > 1 ? degree(G, u) / (n - 1) : 0)); return centralOut(T, v); }
  // clustering: local C_i = 2T_i / (k_i(k_i − 1)), 0 for k_i < 2 (Watts & Strogatz 1998; networkx); transitivity = 3·triangles / connected triples
  function nbrSets(G) { return G.out.map((l, u) => { const s = new Set(); for (const [v] of l) if (v !== u) s.add(v); if (G.directed) for (const [v] of G.inn[u]) if (v !== u) s.add(v); return s; }); }
  function triangleCounts(G) { const N = nbrSets(G), t = new Float64Array(G.n); for (let u = 0; u < G.n; u++) { const a = [...N[u]]; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (N[a[i]].has(a[j])) t[u]++; } return { t, N }; }
  function algClustering(G, T) { const { t, N } = triangleCounts(G), v = Float64Array.from({ length: G.n }, (_, u) => { const k = N[u].size; return k < 2 ? 0 : 2 * t[u] / (k * (k - 1)); }); const r = centralOut(T, v); let s = 0; for (const x of v) s += x; r.result = G.n ? s / G.n : NaN; return r; }
  // k-cores: Batagelj & Zaversnik 2003 (bucket peeling); result = the degeneracy (the largest k with a non-empty k-core)
  function coreNumbers(G) {
    const n = G.n, N = nbrSets(G), deg = Int32Array.from(N, s => s.size), core = new Int32Array(n), gone = new Uint8Array(n);
    for (let i = 0; i < n; i++) { let b = -1; for (let u = 0; u < n; u++) if (!gone[u] && (b < 0 || deg[u] < deg[b])) b = u; gone[b] = 1; core[b] = deg[b]; for (const v of N[b]) if (!gone[v] && deg[v] > deg[b]) deg[v]--; }
    return core;
  }
  function algKcore(G, T) { const c = coreNumbers(G), v = Float64Array.from(c); const r = centralOut(T, v); T.frame(); for (let u = 0; u < G.n; u++) T.ev('nc', u, c[u]); r.classes = Array.from(c); return r; }
  // maximal cliques: Bron & Kerbosch 1973 (Commun. ACM 16:575) with Tomita's pivot (2006); result = the clique number ω
  function algCliques(G, T) {
    const N = nbrSets(G), n = G.n; let best = [], count = 0;
    const st = [[[], [...Array(n).keys()], []]];
    while (st.length) {
      if (!T.tick()) break;
      const [R, Pn, X] = st.pop();
      if (!Pn.length && !X.length) { count++; if (R.length > best.length || (R.length === best.length && R.join() < best.join())) best = R.slice().sort((a, b) => a - b); continue; }
      let piv = -1, pc = -1; for (const u of Pn.concat(X)) { let c = 0; for (const v of Pn) if (N[u].has(v)) c++; if (c > pc) { pc = c; piv = u; } }
      const cand = Pn.filter(v => !N[piv].has(v)); let P2 = Pn.slice(), X2 = X.slice();
      const kids = [];
      for (const v of cand) { kids.push([R.concat([v]), P2.filter(x => N[v].has(x)), X2.filter(x => N[v].has(x))]); P2 = P2.filter(x => x !== v); X2.push(v); }
      for (let i = kids.length - 1; i >= 0; i--) st.push(kids[i]);
    }
    if (T.over) T.D.add('bounds-only');
    const values = new Float64Array(n); for (const u of best) values[u] = 1;
    T.frame(); for (const u of best) T.ev('nc', u, 0);
    for (const e of G.E) if (values[e.u] && values[e.v] && e.u !== e.v) T.ev('es', e.i, 1);
    return { result: best.length, values, count, order: best };
  }
  // modularity Q = Σ_c [L_c/m − (d_c/2m)²] (Newman & Girvan 2004, Phys. Rev. E 69:026113); undirected, weights when run.weighted
  function modularity(G, cls, weighted) {
    let m2 = 0; const dc = new Map(), lc = new Map();
    for (const e of G.E) { const w = weighted ? e.w : 1; m2 += 2 * w; dc.set(cls[e.u], (dc.get(cls[e.u]) || 0) + w); dc.set(cls[e.v], (dc.get(cls[e.v]) || 0) + w); if (cls[e.u] === cls[e.v]) lc.set(cls[e.u], (lc.get(cls[e.u]) || 0) + w); }
    if (!m2) return NaN;
    let q = 0; for (const [c, d] of dc) q += 2 * (lc.get(c) || 0) / m2 - (d / m2) * (d / m2);
    return q;
  }
  const relabel = cls => { const m = new Map(); return cls.map(c => { if (!m.has(c)) m.set(c, m.size); return m.get(c); }); };
  function commOut(G, T, cls, run, extra) {
    cls = relabel(Array.from(cls)); T.frame(); cls.forEach((c, u) => { T.ev('nc', u, c); T.ev('nv', u, c); });
    for (const e of G.E) if (cls[e.u] !== cls[e.v]) T.ev('es', e.i, 3);
    const k = new Set(cls).size, q = modularity(G, cls, run.weighted === true);
    const sizes = new Array(k).fill(0); for (const c of cls) sizes[c]++;
    return Object.assign({ result: k, values: Float64Array.from(cls), classes: cls, modularity: q, componentSizes: sizes.sort((a, b) => b - a) }, extra || {});
  }
  // label propagation (Raghavan, Albert & Kumara 2007, Phys. Rev. E 76:036106): asynchronous, seeded order, ties by the seeded draw
  function algLabelProp(G, T, run, seed) {
    const n = G.n, rnd = C.mulberry32(C.hash32('graph:lpa', run.seed !== undefined ? run.seed : seed)), lab = Int32Array.from({ length: n }, (_, i) => i);
    let it = 0;
    for (; it < 100; it++) {
      const ord = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
      let changed = false; T.frame();
      for (const u of ord) {
        if (!T.tick(G.out[u].length + 1)) break;
        const cnt = new Map(); for (const [v, ei] of G.out[u]) if (v !== u) cnt.set(lab[v], (cnt.get(lab[v]) || 0) + (run.weighted ? G.E[ei].w : 1));
        if (!cnt.size) continue;
        let mx = -INF; for (const c of cnt.values()) mx = Math.max(mx, c);
        const best = [...cnt.keys()].filter(c => cnt.get(c) === mx).sort((a, b) => a - b);
        if (best.includes(lab[u])) continue;
        lab[u] = best[Math.floor(rnd() * best.length)]; changed = true; T.ev('nc', u, lab[u]);
      }
      if (!changed || T.over) { it++; break; }
    }
    return commOut(G, T, lab, run, { iterations: it });
  }
  // Louvain (Blondel, Guillaume, Lambiotte & Lefebvre 2008, J. Stat. Mech. P10008): local moves in node order, then aggregation, until Q stops rising
  function algLouvain(G, T, run) {
    const n = G.n; let node2c = Int32Array.from({ length: n }, (_, i) => i);
    let adj = Array.from({ length: n }, () => new Map()), m2 = 0;
    for (const e of G.E) { const w = run.weighted ? e.w : 1; m2 += 2 * w; adj[e.u].set(e.v, (adj[e.u].get(e.v) || 0) + w); adj[e.v].set(e.u, (adj[e.v].get(e.u) || 0) + w); }
    if (!m2) return commOut(G, T, node2c, run);
    let level = 0, member = Array.from({ length: n }, (_, i) => [i]);
    while (level < 20) {
      const N = adj.length, k = Float64Array.from(adj, a => { let s = 0; for (const [, w] of a) s += w; return s; }), com = Int32Array.from({ length: N }, (_, i) => i), tot = Float64Array.from(k);
      let moved = true, any = false, passes = 0;
      while (moved && passes++ < 100) {
        moved = false;
        for (let u = 0; u < N; u++) {
          if (!T.tick(adj[u].size + 1)) break;
          const cu = com[u], wc = new Map(); for (const [v, w] of adj[u]) if (v !== u) wc.set(com[v], (wc.get(com[v]) || 0) + w);
          tot[cu] -= k[u];
          let best = cu, gain = (wc.get(cu) || 0) - tot[cu] * k[u] / m2;
          for (const [c, w] of [...wc].sort((a, b) => a[0] - b[0])) { const g = w - tot[c] * k[u] / m2; if (g > gain + 1e-12) { gain = g; best = c; } }
          tot[best] += k[u]; if (best !== cu) { com[u] = best; moved = true; any = true; }
        }
        if (T.over) break;
      }
      const ren = relabel(Array.from(com)), K = Math.max(-1, ...ren) + 1;
      const mem2 = Array.from({ length: K }, () => []); member.forEach((ms, u) => { for (const x of ms) mem2[ren[u]].push(x); });
      for (let c = 0; c < K; c++) for (const x of mem2[c]) node2c[x] = c;
      T.frame(); for (let x = 0; x < n; x++) T.ev('nc', x, node2c[x]);
      if (!any || K === N || T.over) break;
      const adj2 = Array.from({ length: K }, () => new Map());
      for (let u = 0; u < N; u++) for (const [v, w] of adj[u]) adj2[ren[u]].set(ren[v], (adj2[ren[u]].get(ren[v]) || 0) + w);
      adj = adj2; member = mem2; level++;
    }
    return commOut(G, T, node2c, run, { iterations: level + 1 });
  }
  // Girvan & Newman 2002 (PNAS 99:7821): remove the edge of highest betweenness (smallest index on ties); keep the partition of best Q
  function algGirvanNewman(G, T, run) {
    const n = G.n, alive = new Uint8Array(G.E.length).fill(1); let best = components(G).comp, bestQ = modularity(G, best, run.weighted === true), removed = 0;
    const target = run.k;
    while (removed < G.E.length) {
      const H = makeGraph(G.ids, G.E.filter(e => alive[e.i]).map(e => ({ u: e.u, v: e.v, w: e.w, orig: e.i })), false);
      const r = brandes(H, T, run.weighted === true, true); if (!r) break;
      let bi = -1; for (let i = 0; i < H.E.length; i++) if (bi < 0 || r.EB[i] > r.EB[bi] * (1 + 1e-12)) bi = i;
      if (bi < 0) break;
      const ei = H.E[bi].orig; alive[ei] = 0; removed++; T.frame(); T.ev('es', ei, 3);
      const H2 = makeGraph(G.ids, G.E.filter(e => alive[e.i]).map(e => ({ u: e.u, v: e.v, w: e.w })), false), c = components(H2);
      const q = modularity(G, c.comp, run.weighted === true);
      if (target ? c.count === target : q > bestQ + 1e-12) { best = c.comp; bestQ = q; if (target) break; }
    }
    return commOut(G, T, best, run, { iterations: removed });
  }
  // the matrix-tree theorem (Kirchhoff 1847): τ = det of the reduced Laplacian, exact by Bareiss 1968 fraction-free elimination
  function spanningTrees(G) {
    const n = G.n; if (n <= 1) return 1;
    const L = Array.from({ length: n - 1 }, () => new Float64Array(n - 1));
    for (const e of G.E) { if (e.u === e.v) continue; const a = e.u - 1, b = e.v - 1; if (a >= 0) L[a][a] += 1; if (b >= 0) L[b][b] += 1; if (a >= 0 && b >= 0) { L[a][b] -= 1; L[b][a] -= 1; } }
    const m = n - 1; let prev = 1, sign = 1;
    for (let k = 0; k < m - 1; k++) {
      if (L[k][k] === 0) { let r = k + 1; while (r < m && L[r][k] === 0) r++; if (r === m) return 0; [L[k], L[r]] = [L[r], L[k]]; sign = -sign; }
      for (let i = k + 1; i < m; i++) for (let j = k + 1; j < m; j++) L[i][j] = (L[i][j] * L[k][k] - L[i][k] * L[k][j]) / prev;
      prev = L[k][k];
    }
    return sign * L[m - 1][m - 1];
  }
  function algSpanning(G, T) { const t = spanningTrees(G); T.frame(); return { result: t, values: new Float64Array(G.n).fill(NaN) }; }

  /* ---------- the graph properties a spec may ask for (hop distances unless said; networkx conventions) ---------- */
  function props(G, which, T) {
    const n = G.n, out = {};
    const need = k => which.has(k);
    let degs = null; const deg = () => degs || (degs = Array.from({ length: n }, (_, u) => degree(G, u)));
    let comp = null; const comps = () => comp || (comp = components(G));
    let ecc = null;
    const eccs = () => {
      if (ecc) return ecc; ecc = { e: new Float64Array(n), sum: 0, pairs: 0, girth: INF };
      for (let s = 0; s < n; s++) { const d = bfsDist(G, s, T); let mx = 0; for (let u = 0; u < n; u++) { if (u === s) continue; if (d[u] < 0) mx = INF; else { mx = Math.max(mx, d[u]); ecc.sum += d[u]; ecc.pairs++; } } ecc.e[s] = mx; if (T.over) { ecc.cut = true; break; } }
      return ecc;
    };
    if (need('n')) out.n = n;
    if (need('m')) out.m = G.E.length;
    if (need('components')) out.components = comps().count;
    if (need('connected')) out.connected = n > 0 && comps().count === 1 ? 1 : 0;
    if (need('bipartite')) out.bipartite = twoColour(G).ok ? 1 : 0;
    if (need('density')) out.density = n > 1 ? G.E.length / (G.directed ? n * (n - 1) : n * (n - 1) / 2) : 0;
    if (need('diameter') || need('radius') || need('avgPath')) {
      const e = eccs(), fin = !e.cut;
      let mx = 0, mn = INF; for (const x of e.e) { mx = Math.max(mx, x); mn = Math.min(mn, x); }
      const conn = n > 0 && mx < INF;
      if (!conn && n > 1) T.D.add('disconnected');
      out.diameter = fin && conn ? mx : NaN; out.radius = fin && conn ? mn : NaN; out.avgPath = fin && conn && n > 1 ? e.sum / (G.directed ? n * (n - 1) : n * (n - 1)) : NaN;
    }
    if (need('girth')) {   // the shortest cycle (BFS from each node; undirected: a non-tree edge closes a cycle d[u] + d[v] + 1)
      let g = INF;
      for (let s = 0; s < n && !T.over; s++) {
        const d = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1), q = [s]; d[s] = 0;
        for (let h = 0; h < q.length; h++) { const u = q[h]; for (const [v, ei] of G.out[u]) { if (!T.tick()) break; if (v === u) { g = Math.min(g, 1); continue; } if (d[v] < 0) { d[v] = d[u] + 1; pe[v] = ei; q.push(v); } else if (G.directed ? v === s : ei !== pe[u]) g = Math.min(g, G.directed ? d[u] + 1 : d[u] + d[v] + 1); } }
      }
      out.girth = T.over ? NaN : g;
    }
    if (need('clustering') || need('transitivity') || need('triangles')) {
      const { t, N } = triangleCounts(G); let s = 0, tri = 0, trip = 0;
      for (let u = 0; u < n; u++) { const k = N[u].size; s += k < 2 ? 0 : 2 * t[u] / (k * (k - 1)); tri += t[u]; trip += k * (k - 1) / 2; }
      out.clustering = n ? s / n : NaN; out.transitivity = trip ? tri / trip : 0; out.triangles = tri / 3;
    }
    if (need('maxDegree') || need('minDegree') || need('avgDegree')) { const d = deg(); out.maxDegree = n ? Math.max(...d) : NaN; out.minDegree = n ? Math.min(...d) : NaN; out.avgDegree = n ? d.reduce((a, b) => a + b, 0) / n : NaN; }
    if (need('oddCount')) out.oddCount = G.directed ? NaN : deg().filter(x => x % 2).length;
    if (need('eulerian')) out.eulerian = eulerKind(G).kind;
    if (need('acyclic')) out.acyclic = G.directed ? (findCycle(G) ? 0 : 1) : (G.E.length <= n - comps().count && !G.E.some(e => e.u === e.v) ? 1 : 0);
    if (need('tree')) out.tree = !G.directed && n > 0 && comps().count === 1 && G.E.length === n - 1 ? 1 : 0;
    if (need('spanningTrees')) out.spanningTrees = !G.directed && n <= 30 ? spanningTrees(G) : NaN;
    if (need('assortativity')) {   // degree assortativity (Newman 2002, PRL 89:208701): Pearson over the edge ends
      const d = deg(); let s1 = 0, s2 = 0, s3 = 0, m = 0;
      for (const e of G.E) { if (e.u === e.v) continue; const a = d[e.u], b = d[e.v]; s1 += a * b; s2 += (a + b) / 2; s3 += (a * a + b * b) / 2; m++; }
      const num = s1 / m - (s2 / m) * (s2 / m), den = s3 / m - (s2 / m) * (s2 / m);
      out.assortativity = m && den !== 0 ? num / den : NaN;
    }
    if (need('degeneracy')) out.degeneracy = n ? Math.max(...coreNumbers(G)) : 0;
    if (need('selfLoops')) out.selfLoops = G.E.filter(e => e.u === e.v).length;
    if (need('multiEdges')) { const s = new Set(); let c = 0; for (const e of G.E) { const k = G.directed ? e.u + ':' + e.v : Math.min(e.u, e.v) + ':' + Math.max(e.u, e.v); if (s.has(k)) c++; s.add(k); } out.multiEdges = c; }
    if (need('largestComponent')) { const c = comps(), sz = new Array(c.count).fill(0); for (const x of c.comp) sz[x]++; out.largestComponent = n ? Math.max(...sz) : 0; }
    if (need('planarBound')) { const m = G.E.length; out.planarBound = n < 3 ? 1 : m <= (twoColour(G).ok ? 2 * n - 4 : 3 * n - 6) ? 1 : 0; }
    return out;
  }

  /* ---------- the scene: the network in the state after k frames (docs/INTERACTIVE_LIBRARY.md §1.4) ---------- */
  const NODE_ROLE = ['base', 'warn', 'ok'];
  const CLASS_ROLE = ['hi', 'ok', 'warn', 'info', 'bad', 'muted'];
  const EDGE_STYLE = { 0: ['muted', 1.5], 1: ['hi', 3.5], 3: ['muted', 1, true], 4: ['bad', 2, true], 5: ['info', 2], 6: ['muted', 1.5, true], 7: ['bad', 3.5], 8: ['ok', 4], 9: ['info', 3] };
  function drawing(G, S, o, viewIn, weighted) {
    const view = viewIn || C.fitView(Array.from(G.X), Array.from(G.Y), 0.15), sc = C.scene(view), W = view[1] - view[0], rr = 0.035 * W, labels = o.labels || 'both';
    const pairs = new Map(), cur = new Set(S.ce);
    for (const e of G.E) {
      const x1 = G.X[e.u], y1 = G.Y[e.u], x2 = G.X[e.v], y2 = G.Y[e.v];
      let [c, w, dash] = EDGE_STYLE[S.es[e.i]] || EDGE_STYLE[0]; if (cur.has(e.i)) { c = 'warn'; w = Math.max(w, 3); dash = false; }
      const opt = { c, w }; if (dash) opt.dash = true;
      const lab = !Number.isNaN(S.ev[e.i]) ? S.ev[e.i] : weighted ? e.w : NaN;
      if (e.u === e.v) { sc.circ(x1 + rr * 1.2, y1 + rr * 1.2, rr, { c, dash: !!dash }); continue; }
      const key = Math.min(e.u, e.v) + ':' + Math.max(e.u, e.v), k = pairs.get(key) || 0; pairs.set(key, k + 1);
      const dx = x2 - x1, dy = y2 - y1, L = sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
      const sh = G.directed ? rr * 1.1 : 0, ax = x1 + ux * sh * 0.2, ay = y1 + uy * sh * 0.2, bx = x2 - ux * sh, by = y2 - uy * sh;
      if (k === 0 && !(G.directed && pairs.has(Math.max(e.u, e.v) + '>' + Math.min(e.u, e.v)))) {
        sc.seg(ax, ay, bx, by, Object.assign(opt, G.directed ? { arrow: true } : {}));
        if (!Number.isNaN(lab)) sc.txt((x1 + x2) / 2 - uy * rr * 0.9, (y1 + y2) / 2 + ux * rr * 0.9, { v: lab, c: c === 'muted' ? 'base' : c });
      } else {   // a parallel or opposite edge: a bent polyline (k-th bend on alternating sides)
        const off = rr * 1.6 * Math.ceil((k || 1) / 2) * ((k || 1) % 2 ? 1 : -1) * (e.u < e.v ? 1 : -1), mx = (x1 + x2) / 2 - uy * off, my = (y1 + y2) / 2 + ux * off;
        if (G.directed) { sc.seg(x1, y1, mx, my, { c, w, dash: !!dash }); const ex = x2 - mx, ey = y2 - my, l2 = sqrt(ex * ex + ey * ey) || 1; sc.seg(mx, my, x2 - ex / l2 * sh, y2 - ey / l2 * sh, { c, w, arrow: true, dash: !!dash }); }
        else sc.poly([x1, y1, mx, my, x2, y2], Object.assign({ closed: false }, opt));
        if (!Number.isNaN(lab)) sc.txt(mx - uy * rr * 0.6, my + ux * rr * 0.6, { v: lab, c: c === 'muted' ? 'base' : c });
      }
      if (G.directed) pairs.set(e.u + '>' + e.v, 1);
    }
    for (let u = 0; u < G.n; u++) {
      let c = S.nc[u] >= 0 ? CLASS_ROLE[S.nc[u] % CLASS_ROLE.length] : NODE_ROLE[S.ns[u]] || 'base';
      if (S.cn === u) c = 'hi';
      const opt = { c, r: S.cn === u ? 9 : 7 };
      if (labels === 'id' || labels === 'both') { if (G.lab[u]) opt.key = G.lab[u]; else opt.s = G.ids[u]; }
      sc.pt(G.X[u], G.Y[u], opt);
      if ((labels === 'value' || labels === 'both') && !Number.isNaN(S.nv[u])) sc.txt(G.X[u], G.Y[u] - rr * 1.9, { v: S.nv[u], c });
    }
    return sc.done();
  }

  /* ---------- the run ---------- */
  function diagSet() { const L = [], set = new Set(); return { list: L, set, add(code, at) { if (!set.has(code)) { set.add(code); L.push(at === undefined ? { code } : { code, at }); } }, has: c => set.has(c) }; }
  function build(spec, env, seed, D) {
    const m = spec.model;
    let ids, edges, directed, g = null, given = false;
    if (isObj(m.graph)) {
      ids = m.graph.nodes.map(nd => nd.id); directed = m.graph.directed === true;
      const idx = new Map(ids.map((s, i) => [s, i]));
      edges = (m.graph.edges || []).map(ed => {
        const w = ed.w === undefined ? 1 : C.cx(ed.w)(env), cap = ed.cap === undefined ? (ed.w === undefined ? 1 : w) : C.cx(ed.cap)(env);
        if (Number.isNaN(w) || Number.isNaN(cap)) D.add('nan-weight');
        return { u: idx.get(ed.u), v: idx.get(ed.v), w, cap, id: ed.id };
      });
    } else { g = m.generate; const r = generate(g, env, seed, D); ids = r.ids; edges = r.edges; directed = r.directed; }
    const G = makeGraph(ids, edges, directed);
    if (isObj(m.graph)) m.graph.nodes.forEach((nd, i) => { if (nd.x !== undefined) { G.X[i] = C.cx(nd.x)(env); G.Y[i] = C.cx(nd.y)(env); given = true; } if (nd.label) G.lab[i] = nd.label; });
    G.hasXY = given && m.graph.nodes.every(nd => nd.x !== undefined);
    layout(G, m.layout || 'auto', spec, C.mulberry32(C.hash32('graph:layout', seed)), g);
    for (let u = 0; u < G.n; u++) if (!Number.isFinite(G.X[u]) || !Number.isFinite(G.Y[u])) { const a = PI / 2 - 2 * PI * u / Math.max(1, G.n); G.X[u] = cos(a); G.Y[u] = sin(a); }
    if (!G.n) D.add('empty'); else if (G.n === 1) D.add('single-node');
    if (G.E.some(e => e.u === e.v)) D.add('self-loop');
    { const s = new Set(); for (const e of G.E) { const k = directed ? e.u + ':' + e.v : Math.min(e.u, e.v) + ':' + Math.max(e.u, e.v); if (s.has(k)) { D.add('multi-edge'); break; } s.add(k); } }
    if (G.E.some(e => e.w < 0)) D.add('negative-weight', 'w');
    return G;
  }
  function runAlg(G, T, run, env, seed) {
    const alg = run.alg, o = { s: run.source !== undefined ? G.idx.get(run.source) : -1, t: run.target !== undefined ? G.idx.get(run.target) : -1 };
    if (o.s === undefined) o.s = -1; if (o.t === undefined) o.t = -1;
    if (NEEDS_SOURCE.includes(alg) && o.s < 0) { T.D.add('param'); return { result: NaN }; }
    if (G.E.some(e => Number.isNaN(e.w))) { T.D.add('nan-weight'); return { result: NaN }; }
    switch (alg) {
      case 'bfs': return algBfs(G, T, o);
      case 'dfs': return algDfs(G, T, o);
      case 'dijkstra': return algDijkstra(G, T, o, null, 0);
      case 'astar': return algAstar(G, T, o, run, env);
      case 'bellman-ford': return algBellmanFord(G, T, o);
      case 'floyd-warshall': return algFloyd(G, T, o);
      case 'dag-path': return algDagPath(G, T, o, run);
      case 'toposort': return algToposort(G, T);
      case 'scc': return algScc(G, T);
      case 'components': return algComponents(G, T);
      case 'bipartite': return algBipartite(G, T);
      case 'kruskal': return algKruskal(G, T);
      case 'prim': return algPrim(G, T, o);
      case 'boruvka': return algBoruvka(G, T);
      case 'maxflow': return algEdmondsKarp(G, T, o);
      case 'dinic': return algDinic(G, T, o);
      case 'vertex-connectivity': return algVertexConn(G, T, o);
      case 'matching': return algMatching(G, T);
      case 'max-matching': return algBlossom(G, T);
      case 'assignment': return algAssignment(G, T, run);
      case 'euler': return algEuler(G, T);
      case 'hamilton': return algHamilton(G, T, o, run);
      case 'tsp': return algTsp(G, T, o, run);
      case 'coloring': return algColoring(G, T, run);
      case 'articulation': return algArticulation(G, T);
      case 'pagerank': return algPagerank(G, T, o, run, env);
      case 'betweenness': return algBetweenness(G, T, run);
      case 'closeness': return algCloseness(G, T, run, false);
      case 'harmonic': return algCloseness(G, T, run, true);
      case 'eigenvector': return algEigen(G, T, run);
      case 'katz': return algKatz(G, T, run, env);
      case 'hits': return algHits(G, T, run);
      case 'degree': return algDegree(G, T);
      case 'clustering': return algClustering(G, T);
      case 'kcore': return algKcore(G, T);
      case 'cliques': return algCliques(G, T);
      case 'label-propagation': return algLabelProp(G, T, run, seed);
      case 'louvain': return algLouvain(G, T, run);
      case 'girvan-newman': return algGirvanNewman(G, T, run);
      case 'spanning-trees': return algSpanning(G, T);
      default: return { result: NaN };
    }
  }
  /** run(spec, env, {seed}) → {out: {<output id>: value}, diag: [{code}], frames, result} — never throws for a checked spec */
  function run(spec, env, opts) {
    const seed = (opts && opts.seed) || 1, D = diagSet(), out = {};
    const m = spec.model, rs = isObj(m.run) ? m.run : { alg: 'none' };
    const G = build(spec, env || {}, seed, D);
    const T = tracer(G, D); T.D = D;
    const R = rs.alg !== 'none' && G.n ? runAlg(G, T, rs, env || {}, seed) : { result: NaN };
    const nf = T.frames.length;
    let k = nf;
    if (rs.step !== undefined) { const v = C.cx(rs.step)(env || {}); k = Number.isFinite(v) ? Math.max(0, Math.min(nf, Math.floor(v))) : nf; }
    const outs = Array.isArray(spec.outputs) ? spec.outputs : [];
    const need = new Set(outs.filter(o => o && o.kind === 'scalar' && PROPS.includes(o.of)).map(o => o.of));
    const PT = tracer(G, D); PT.ops = Math.max(0, T.ops - BUDGET / 2);   // the properties share what is left of the budget (≥ half of it)
    const pr = need.size ? props(G, need, PT) : {};
    const vals = R.values || new Float64Array(G.n).fill(NaN);
    const deg = () => Array.from({ length: G.n }, (_, u) => degree(G, u));
    for (const o of outs) {
      if (!o || typeof o.id !== 'string') continue;
      let v;
      if (o.kind === 'scalar') {
        const u = o.node !== undefined ? G.idx.get(o.node) : undefined;
        switch (o.of) {
          case 'result': v = R.result; break;
          case 'steps': v = nf; break;
          case 'frame': v = k; break;
          case 'dist': case 'value': v = u !== undefined ? vals[u] : NaN; break;
          case 'reached': v = u !== undefined ? (Number.isFinite(vals[u]) ? 1 : 0) : NaN; break;
          case 'pathEdges': v = R.path ? Math.max(0, R.path.length - 1) : NaN; break;
          case 'expanded': v = R.expanded !== undefined ? R.expanded : (R.order ? R.order.length : NaN); break;
          case 'expandedRef': v = R.expandedRef !== undefined ? R.expandedRef : NaN; break;
          case 'top': v = R.top !== undefined ? R.top : NaN; break;
          case 'count': v = R.count !== undefined ? R.count : NaN; break;
          case 'lower': v = R.lower !== undefined ? R.lower : NaN; break;
          case 'modularity': v = R.modularity !== undefined ? R.modularity : (R.classes ? modularity(G, R.classes, rs.weighted === true) : NaN); break;
          case 'iterations': v = R.iterations !== undefined ? R.iterations : NaN; break;
          case 'flag': v = D.has(o.code) ? 1 : 0; break;
          default: v = pr[o.of] !== undefined ? pr[o.of] : NaN;
        }
      } else if (o.kind === 'series') {
        switch (o.of) {
          case 'values': v = Array.from(vals); break;
          case 'degree': v = deg(); break;
          case 'degreeHist': { const d = deg(), h = new Array((d.length ? Math.max(...d) : 0) + 1).fill(0); for (const x of d) h[x]++; v = h; break; }
          case 'order': v = (R.order || []).slice(); break;
          case 'path': v = (R.path || []).slice(); break;
          case 'nodeIndex': v = Array.from({ length: G.n }, (_, i) => i); break;
          case 'residual': v = (R.residual || []).slice(); break;
          case 'frontier': v = (R.frontier || []).slice(); break;
          case 'componentSizes': { if (R.componentSizes) v = R.componentSizes.slice(); else { const c = components(G), sz = new Array(c.count).fill(0); for (const x of c.comp) sz[x]++; v = sz.sort((a, b) => b - a); } break; }
          case 'classes': v = R.classes ? R.classes.slice() : []; break;
          default: v = [];
        }
        v = v.slice(0, C.MAX_POINTS);
      } else if (o.kind === 'scene') {
        const S = replay(G, T, k), weighted = G.E.some(e => e.w !== 1);
        v = drawing(G, S, o, Array.isArray(m.view) ? m.view : null, weighted);
      }
      out[o.id] = v;
    }
    return { out, diag: D.list, frames: nf, result: R, graph: G };
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, scenes: true });
  engine.workerSource = C.workerSource(noemaLibGraphModule, 'NoemaLibGraph');
  root.NoemaLibGraph = Object.freeze({
    id: ID, checkSpec, exprs, keys, run, engine: Object.freeze(engine), simEngine,
    ALGS, GENS, SCALARS, SERIES, CODES, PROPS,
    // the algorithms themselves, for the tests
    makeGraph, generate, floydWarshall, spanningTrees, brandes, twoColour, components, eulerKind, coreNumbers, modularity, tracer, diagSet,
    build: (spec, env, seed) => build(spec, env || {}, seed || 1, diagSet()),
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
