/* graph@1 (engine/src/47_lib_graph.js, docs/library/graph.md) against published values:
   1. CLRS (Cormen, Leiserson, Rivest & Stein, Introduction to Algorithms, 3rd ed. 2009 / 4th ed. 2022) figures: Dijkstra, Bellman–Ford
      (and its negative cycle), Floyd–Warshall, MST, max flow / min cut, SCC; Königsberg (Euler 1736); two triangles bridged;
   2. Zachary's karate club (Zachary 1977) against networkx 3.x: clustering, transitivity, diameter, average path, PageRank,
      betweenness, eigenvector, closeness, Louvain's modularity, local edge / vertex connectivity;
   3. classic graphs: Petersen (Biggs, Algebraic Graph Theory), K5 (Cayley 5³), K3,3, C5, the star; A* on a grid with a wall;
   4. every edge case and its code, the step trace and its scene, determinism, the sim adapter, the Worker source in a fresh
      context, check codes, speed.   Usage: node tests/lib_graph.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibGraph = ENGINES.mod('graph@1');
const G = NoemaLibGraph;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, t) => Math.abs(a - b) <= t;
const spec = (model, outputs) => ({ format: 'noema.sim-spec/v1', engine: 'graph@1', params: [{ id: 'k', kind: 'slider', label: 'k', min: 0, max: 10, default: 0 }], model, outputs: outputs || [] });
const dg = (es, directed) => { const ids = []; for (const e of es) for (const x of [e[0], e[1]]) if (!ids.includes(x)) ids.push(x); return { directed: !!directed, nodes: ids.map(id => ({ id })), edges: es.map(e => (e.length > 2 ? { u: e[0], v: e[1], w: e[2] } : { u: e[0], v: e[1] })) }; };
const R = (model, outs, env) => G.run(spec(model, outs), env || {}, { seed: 1 });
const codes = r => r.diag.map(d => d.code);
const O = (id, of, x) => Object.assign({ id, kind: 'scalar', of }, x || {});
const S = (id, of) => ({ id, kind: 'series', of });
const SC = { id: 'net', kind: 'scene', of: 'drawing' };
const val = (r, id) => r.out[id];
const byId = (r, name) => r.graph.idx.get(name);

ok(G.id === 'graph@1' && Object.isFrozen(G) && G.engine.id === 'graph@1' && G.engine.scenes === true, 'NoemaLibGraph: id graph@1, frozen, scenes');

// ---------- 1. CLRS ----------
const CLRS_DIJ = [['s', 't', 10], ['s', 'y', 5], ['t', 'x', 1], ['t', 'y', 2], ['y', 't', 3], ['y', 'x', 9], ['y', 'z', 2], ['x', 'z', 4], ['z', 'x', 6], ['z', 's', 7]];
{
  const r = R({ graph: dg(CLRS_DIJ, true), run: { alg: 'dijkstra', source: 's', target: 'x' } }, [S('v', 'values'), S('o', 'order'), S('p', 'path'), O('dx', 'dist', { node: 'x' })]);
  const d = r.out.v, ix = s => byId(r, s);
  ok(d[ix('s')] === 0 && d[ix('t')] === 8 && d[ix('x')] === 9 && d[ix('y')] === 5 && d[ix('z')] === 7, 'G1 CLRS Fig. 24.6 / 22.6 Dijkstra: d = s 0, t 8, x 9, y 5, z 7 (exact)');
  ok(r.out.o.map(i => r.graph.ids[i]).join('') === 'syztx', `G1 Dijkstra pop order s, y, z, t, x (ties by (key, index)): ${r.out.o.map(i => r.graph.ids[i]).join(', ')}`);
  ok(r.out.p.map(i => r.graph.ids[i]).join('') === 'sytx' && r.out.dx === 9, 'G1 the shortest path s → y → t → x of length 9');
}
const CLRS_BF = [['s', 't', 6], ['s', 'y', 7], ['t', 'x', 5], ['t', 'y', 8], ['t', 'z', -4], ['x', 't', -2], ['y', 'x', -3], ['y', 'z', 9], ['z', 'x', 7], ['z', 's', 2]];
{
  const r = R({ graph: dg(CLRS_BF, true), run: { alg: 'bellman-ford', source: 's' } }, [S('v', 'values')]), ix = s => byId(r, s), d = r.out.v;
  ok(d[ix('s')] === 0 && d[ix('t')] === 2 && d[ix('x')] === 4 && d[ix('y')] === 7 && d[ix('z')] === -2 && !codes(r).includes('negative-cycle'), 'G2 CLRS Fig. 24.4 / 22.4 Bellman–Ford: d = s 0, t 2, x 4, y 7, z −2, no negative cycle (exact)');
  const bad = CLRS_BF.map(e => (e[0] === 'z' && e[1] === 's' ? ['z', 's', -10] : e));
  const r3 = R({ graph: dg(bad, true), run: { alg: 'bellman-ford', source: 's' } }, [S('p', 'path'), O('f', 'flag', { code: 'negative-cycle' })]);
  const cyc = r3.out.p.map(i => r3.graph.ids[i]).sort().join('');
  ok(r3.out.f === 1 && cyc === 'stz', `G3 the cycle s → t → z → s of weight −8: negative-cycle, the cycle {${cyc}}`);
  ok(r3.out.p.length === 3 && r3.result.values.every(x => x === -Infinity), 'G3 every node reachable from the cycle has no shortest distance (−∞)');
}
{
  const es = [[1, 2, 3], [1, 3, 8], [1, 5, -4], [2, 4, 1], [2, 5, 7], [3, 2, 4], [4, 1, 2], [4, 3, -5], [5, 4, 6]].map(([u, v, w]) => ['v' + u, 'v' + v, w]);
  const g = dg(es, true); g.nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  const r = R({ graph: g, run: { alg: 'floyd-warshall', source: 'v1', target: 'v3' } }, [O('d13', 'result')]);
  const want = [[0, 1, -3, 2, -4], [3, 0, -4, 1, -1], [7, 4, 0, 5, 3], [2, -1, -5, 0, -2], [8, 5, 1, 6, 0]];
  ok(JSON.stringify(r.result.matrix.map(x => Array.from(x))) === JSON.stringify(want) && r.out.d13 === -3, 'G4 CLRS Fig. 25.1 / 23.1 Floyd–Warshall: the whole matrix D (exact)');
}
const CLRS_MST = [['a', 'b', 4], ['a', 'h', 8], ['b', 'h', 11], ['b', 'c', 8], ['c', 'i', 2], ['c', 'f', 4], ['c', 'd', 7], ['d', 'f', 14], ['d', 'e', 9], ['e', 'f', 10], ['f', 'g', 2], ['g', 'i', 6], ['g', 'h', 1], ['h', 'i', 7]];
for (const alg of ['kruskal', 'prim', 'boruvka']) {
  const r = R({ graph: dg(CLRS_MST), run: { alg } }, [O('w', 'result'), O('c', 'count'), O('u', 'flag', { code: 'non-unique-mst' })]);
  ok(r.out.w === 37 && r.out.c === 8 && r.out.u === 1, `G5 CLRS Fig. 23.1 / 21.1 MST by ${alg}: total 37, 8 edges, non-unique-mst (b–c or a–h)`);
}
const CLRS_FLOW = [['s', 'v1', 16], ['s', 'v2', 13], ['v1', 'v3', 12], ['v2', 'v1', 4], ['v2', 'v4', 14], ['v3', 'v2', 9], ['v3', 't', 20], ['v4', 'v3', 7], ['v4', 't', 4]];
for (const alg of ['maxflow', 'dinic']) {
  const r = R({ graph: dg(CLRS_FLOW, true), run: { alg, source: 's', target: 't' } }, [O('f', 'result'), O('cut', 'count'), S('side', 'values')]);
  const Sset = r.graph.ids.filter((_, i) => r.out.side[i] === 1).sort().join(',');
  ok(r.out.f === 23 && r.out.cut === 23 && Sset === 's,v1,v2,v4', `G6 CLRS Fig. 26.1 / 24.1 ${alg}: max flow 23 = the cut capacity 12 + 7 + 4, S = {${Sset}}`);
}
{
  const es = [['a', 'b'], ['b', 'c'], ['b', 'e'], ['b', 'f'], ['c', 'd'], ['c', 'g'], ['d', 'c'], ['d', 'h'], ['e', 'a'], ['e', 'f'], ['f', 'g'], ['g', 'f'], ['g', 'h'], ['h', 'h']];
  const r = R({ graph: dg(es, true), run: { alg: 'scc' } }, [O('n', 'result'), S('c', 'classes')]);
  const groups = {}; r.out.c.forEach((c, i) => { (groups[c] = groups[c] || []).push(r.graph.ids[i]); });
  const got = Object.values(groups).map(g => g.sort().join('')).sort().join(' ');
  ok(r.out.n === 4 && got === 'abe cd fg h', `G7 CLRS Fig. 22.9 / 20.9 SCC (Tarjan): {a,b,e} {c,d} {f,g} {h} → ${got}`);
}
{
  const r = R({ generate: { kind: 'konigsberg' }, run: { alg: 'euler' } }, [O('e', 'result'), O('odd', 'oddCount'), S('deg', 'degree'), O('f', 'flag', { code: 'no-euler' })]);
  ok(r.out.e === 0 && r.out.odd === 4 && r.out.deg.join() === '5,3,3,3' && r.out.f === 1, 'G8 Königsberg (Euler 1736): degrees 5, 3, 3, 3 — four odd vertices, no Euler path (no-euler)');
  const ok2 = R({ graph: dg([['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd']]), run: { alg: 'euler' } }, [O('e', 'result'), S('p', 'path')]);
  ok(ok2.out.e === 1 && ok2.out.p.length === 5, 'an Euler path exists with exactly two odd vertices (Hierholzer: all 4 edges, 5 nodes)');
}
{
  const es = [[1, 2], [2, 3], [3, 1], [3, 4], [4, 5], [5, 6], [6, 4], [6, 7]].map(([u, v]) => ['v' + u, 'v' + v]);
  const r = R({ graph: dg(es), run: { alg: 'articulation' } }, [O('a', 'result'), O('b', 'count'), S('ap', 'values')]);
  const aps = r.graph.ids.filter((_, i) => r.out.ap[i]).join(','), br = r.result.bridges.map(ei => { const e = r.graph.E[ei]; return r.graph.ids[e.u] + '–' + r.graph.ids[e.v]; }).sort().join(',');
  ok(aps === 'v3,v4,v6' && br === 'v3–v4,v6–v7', `G18 two triangles bridged: articulation points {${aps}}, bridges {${br}} (Hopcroft–Tarjan)`);
  const multi = R({ graph: dg([['a', 'b'], ['a', 'b'], ['b', 'c']]), run: { alg: 'articulation' } }, [O('b', 'count')]);
  ok(multi.out.b === 1 && codes(multi).includes('multi-edge'), 'a parallel edge is never a bridge (edge ids, not the parent node); multi-edge reported');
}

// ---------- 2. Zachary's karate club against networkx 3.x ----------
const KA = { generate: { kind: 'karate' } };
{
  const r = R(KA, ['n', 'm', 'clustering', 'transitivity', 'diameter', 'avgPath', 'assortativity', 'degeneracy'].map(x => O(x, x)));
  const o = r.out;
  ok(o.n === 34 && o.m === 78, 'karate club (Zachary 1977): 34 members, 78 ties');
  ok(near(o.clustering, 0.5706384782076823, 1e-12) && near(o.transitivity, 0.2556818181818182, 1e-12), `G9 average clustering ${o.clustering}, transitivity ${o.transitivity} (networkx, 1e-12)`);
  ok(o.diameter === 5 && near(o.avgPath, 2.408199643493761, 1e-12), `G9 diameter 5, average shortest path ${o.avgPath} (networkx 2.408199643493761)`);
  ok(near(o.assortativity, -0.47561309768461413, 1e-12) && o.degeneracy === 4, 'degree assortativity −0.4756130976846141 (Newman 2002; networkx), degeneracy 4 (core number)');
}
{
  const r = R(Object.assign({ run: { alg: 'pagerank' } }, KA), [O('a', 'value', { node: 'n33' }), O('b', 'value', { node: 'n0' }), O('c', 'value', { node: 'n32' }), O('top', 'top'), S('res', 'residual')]);
  ok(near(r.out.a, 0.10091918232295749, 1e-9) && near(r.out.b, 0.09699728539860193, 1e-9) && near(r.out.c, 0.07169322599817837, 1e-9) && r.out.top === 33, `G10 PageRank α = 0.85: n33 ${r.out.a.toFixed(12)}, n0 ${r.out.b.toFixed(12)}, n32 ${r.out.c.toFixed(12)} (networkx, 1e-9)`);
  ok(r.out.res.length < 200 && r.out.res[r.out.res.length - 1] < 1e-12, `PageRank converges in ${r.out.res.length} iterations (≤ 170 at α = 0.85: Haveliwala & Kamvar 2003)`);
  const s = r.result.values.reduce((x, y) => x + y, 0); ok(near(s, 1, 1e-12), 'PageRank sums to 1');
}
{
  const r = R(Object.assign({ run: { alg: 'betweenness' } }, KA), [O('a', 'value', { node: 'n0' }), O('b', 'value', { node: 'n33' }), O('c', 'value', { node: 'n32' })]);
  ok(near(r.out.a, 0.43763528138528146, 1e-12) && near(r.out.b, 0.30407497594997596, 1e-12) && near(r.out.c, 0.145247113997114, 1e-12), 'G11 betweenness (Brandes 2001, normalised undirected): n0 0.43763528138528146, n33 0.30407497594997596, n32 0.145247113997114 (1e-12)');
  const e = R(Object.assign({ run: { alg: 'eigenvector' } }, KA), [O('a', 'value', { node: 'n33' }), O('b', 'value', { node: 'n0' })]);
  ok(near(e.out.a, 0.3733634702914832, 1e-8) && near(e.out.b, 0.3554914445245666, 1e-8), `G12 eigenvector centrality (unit L2): n33 ${e.out.a}, n0 ${e.out.b} (networkx, 1e-8)`);
  const c = R(Object.assign({ run: { alg: 'closeness' } }, KA), [O('a', 'value', { node: 'n0' })]);
  ok(near(c.out.a, 0.5689655172413793, 1e-12), 'G12 closeness n0 0.5689655172413793 (1e-12)');
  const h = R(Object.assign({ run: { alg: 'harmonic' } }, KA), [O('a', 'value', { node: 'n0' })]);
  ok(near(h.out.a, 23.16666666666666, 1e-9), 'harmonic centrality n0 23.1667 (Boldi & Vigna 2014; networkx)');
  const kz = R(Object.assign({ run: { alg: 'katz', alpha: 0.1 } }, KA), [O('a', 'value', { node: 'n33' })]);
  ok(near(kz.out.a, 0.3314064273997822, 1e-9), 'Katz α = 0.1, β = 1: n33 0.33140642739978 (networkx, 1e-9)');
  const hi = R(Object.assign({ run: { alg: 'hits' } }, KA), [O('a', 'value', { node: 'n33' })]);
  ok(near(hi.out.a, 0.07500294215657555, 1e-9), 'HITS authority n33 0.0750029421566 (networkx, 1e-9)');
  const lv = R(Object.assign({ run: { alg: 'louvain' } }, KA), [O('q', 'modularity'), O('k', 'result')]);
  ok(near(lv.out.q, 0.41880341880341876, 1e-12) && lv.out.k === 4, `Louvain (Blondel et al. 2008): 4 communities, Q = ${lv.out.q} (networkx louvain_communities: 0.4188034188034188)`);
  const f = R(Object.assign({ run: { alg: 'maxflow', source: 'n0', target: 'n33' } }, KA), [O('f', 'result')]);
  const vc = R(Object.assign({ run: { alg: 'vertex-connectivity', source: 'n0', target: 'n33' } }, KA), [O('f', 'result')]);
  ok(f.out.f === 10 && vc.out.f === 6, 'G13 karate 0 → 33: max flow with unit capacities = edge connectivity 10; vertex connectivity 6 (Menger; networkx)');
  const col = R(Object.assign({ run: { alg: 'coloring', order: 'exact' } }, KA), [O('k', 'result'), O('lo', 'lower')]);
  ok(col.out.k === 5 && col.out.lo === 5, 'karate: χ = 5 = ω (the clique {0, 1, 2, 3, 13}), exact colouring');
}
{
  const r = R({ graph: dg([['1', '2'], ['1', '3'], ['2', '3'], ['3', '1'], ['4', '3']], true), run: { alg: 'pagerank' } }, [S('v', 'values')]);
  const want = [0.37252685132844077, 0.19582391181458733, 0.3941492368569718, 0.0375];
  ok(want.every((w, i) => near(r.out.v[i], w, 1e-10)) && near(r.out.v[3], 0.0375, 1e-15), 'G14 4-node digraph PageRank (0.3725…, 0.1958…, 0.3941…, 0.0375): node 4 = (1 − α)/n exactly (1e-10)');
  const p = R({ graph: dg([['1', '2'], ['2', '3']], true), run: { alg: 'pagerank' } }, [S('v', 'values')]);
  ok([0.18441678192715405, 0.34117104656524233, 0.4744121715076033].every((w, i) => near(p.out.v[i], w, 1e-10)), 'G15 path digraph 1 → 2 → 3, node 3 dangling (spread uniformly): (0.1844…, 0.3412…, 0.4744…) (1e-10)');
}

// ---------- 3. classic graphs ----------
{
  const PE = { generate: { kind: 'petersen' } };
  const r = R(PE, ['m', 'maxDegree', 'minDegree', 'girth', 'diameter', 'spanningTrees', 'bipartite'].map(x => O(x, x)));
  ok(r.out.m === 15 && r.out.maxDegree === 3 && r.out.minDegree === 3 && r.out.girth === 5 && r.out.diameter === 2 && r.out.bipartite === 0, 'G16 Petersen: 15 edges, 3-regular, girth 5, diameter 2');
  ok(r.out.spanningTrees === 2000, 'G16 Petersen: τ = 2000 spanning trees (Kirchhoff, Bareiss; Biggs)');
  const ch = R(Object.assign({ run: { alg: 'coloring', order: 'exact' } }, PE), [O('k', 'result')]);
  const hc = R(Object.assign({ run: { alg: 'hamilton', mode: 'cycle' } }, PE), [O('h', 'result'), O('f', 'flag', { code: 'non-hamiltonian' })]);
  const hp = R(Object.assign({ run: { alg: 'hamilton', mode: 'path' } }, PE), [O('h', 'result'), S('p', 'path')]);
  ok(ch.out.k === 3, 'G16 Petersen: χ = 3');
  ok(hc.out.h === 0 && hc.out.f === 1 && hp.out.h === 1 && new Set(hp.out.p).size === 10, 'G16 Petersen: not Hamiltonian (proved by exhaustion: non-hamiltonian), but has a Hamiltonian path');
  const k5 = R({ generate: { kind: 'complete', n: 5 }, run: { alg: 'spanning-trees' } }, [O('t', 'result')]);
  const k33 = R({ generate: { kind: 'complete-bipartite', a: 3, b: 3 }, run: { alg: 'matching' } }, [O('m', 'result')]);
  const bl = R({ generate: { kind: 'complete-bipartite', a: 3, b: 3 }, run: { alg: 'max-matching' } }, [O('m', 'result')]);
  const c5 = R({ generate: { kind: 'cycle', n: 5 }, run: { alg: 'betweenness', normalized: false } }, [S('v', 'values')]);
  ok(k5.out.t === 125 && k33.out.m === 3 && bl.out.m === 3 && c5.out.v.every(x => x === 1), 'G17 K5: 125 spanning trees (Cayley 5³); K3,3: maximum matching 3 (Hopcroft–Karp and Edmonds\' blossom); C5 raw betweenness 1.0 each');
  const st = R({ generate: { kind: 'star', n: 4 }, run: { alg: 'betweenness' } }, [O('c', 'value', { node: 'n0' })]);
  ok(st.out.c === 1, 'G19 star S4: the centre\'s normalised betweenness is 1.0');
  const pm = R({ generate: { kind: 'petersen' }, run: { alg: 'max-matching' } }, [O('m', 'result')]);
  ok(pm.out.m === 5, 'Petersen has a perfect matching (5 edges; Petersen 1891): Edmonds\' blossom on a non-bipartite graph');
  const cy5 = R({ generate: { kind: 'cycle', n: 5 }, run: { alg: 'max-matching' } }, [O('m', 'result')]);
  ok(cy5.out.m === 2, 'C5 (odd cycle): maximum matching 2');
}
{
  // G20: a 10×10 4-connected grid, a wall at column 5 with one gap at row 7
  const nodes = [], edges = [], id = (x, y) => `c${x}_${y}`, wall = (x, y) => x === 5 && y !== 7;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (!wall(x, y)) nodes.push({ id: id(x, y), x, y });
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { if (wall(x, y)) continue; if (x + 1 < 10 && !wall(x + 1, y)) edges.push({ u: id(x, y), v: id(x + 1, y) }); if (y + 1 < 10 && !wall(x, y + 1)) edges.push({ u: id(x, y), v: id(x, y + 1) }); }
  const g = { nodes, edges }, outs = [O('L', 'result'), O('ex', 'expanded'), O('exr', 'expandedRef'), O('f', 'flag', { code: 'heuristic-inadmissible' })];
  const a = R({ graph: g, run: { alg: 'astar', source: id(0, 0), target: id(9, 0), heuristic: 'manhattan' } }, outs);
  const b = R({ graph: g, run: { alg: 'bfs', source: id(0, 0), target: id(9, 0) } }, [O('L', 'result')]);
  ok(a.out.L === b.out.L && a.out.L === 23 && a.out.ex <= a.out.exr && a.out.f === 0, `G20 A* on a 10×10 grid with a walled gap: length ${a.out.L} = BFS ${b.out.L}; nodes expanded ${a.out.ex} ≤ Dijkstra's ${a.out.exr}`);
  const w = R({ graph: g, run: { alg: 'astar', source: id(0, 0), target: id(9, 0), heuristic: 'euclid', hweight: 5 } }, outs);
  ok(w.out.ex <= a.out.ex && w.out.L >= a.out.L, `weighted A* (w = 5): ${w.out.ex} nodes expanded, length ${w.out.L} (the speed/optimality trade-off)`);
  const d = R({ graph: g, run: { alg: 'astar', source: id(0, 0), target: id(9, 0), heuristic: 'zero' } }, outs);
  ok(d.out.ex === d.out.exr, 'A* with h = 0 is Dijkstra (the same expansions)');
  // an inadmissible heuristic that misleads: a short way round costs less than a straight route the heuristic favours
  const t = { nodes: [{ id: 's', x: 0, y: 0 }, { id: 'a', x: 1, y: 0 }, { id: 'b', x: 0, y: 5 }, { id: 't', x: 2, y: 0 }], edges: [{ u: 's', v: 'a', w: 10 }, { u: 'a', v: 't', w: 10 }, { u: 's', v: 'b', w: 1 }, { u: 'b', v: 't', w: 1 }] };
  const ia = R({ graph: t, run: { alg: 'astar', source: 's', target: 't', heuristic: 'euclid', hweight: 20 } }, outs);
  ok(ia.out.L === 20 && ia.out.f === 1, 'an inadmissible heuristic (w = 20) finds a longer path: heuristic-inadmissible (compared with Dijkstra)');
}
{
  const tsp = R({ generate: { kind: 'complete', n: 9, wmin: 1, wmax: 20, seed: 2 }, run: { alg: 'tsp' } }, [O('L', 'result'), S('p', 'path')]);
  const tsh = R({ generate: { kind: 'complete', n: 9, wmin: 1, wmax: 20, seed: 2 }, run: { alg: 'tsp', mode: 'heuristic' } }, [O('L', 'result')]);
  // brute force over the 8!/2 tours for the reference
  const GG = tsp.graph, W = Array.from({ length: 9 }, () => new Array(9).fill(Infinity)); for (const e of GG.E) { W[e.u][e.v] = Math.min(W[e.u][e.v], e.w); W[e.v][e.u] = W[e.u][e.v]; }
  let best = Infinity; const perm = (a, k) => { if (k === a.length) { let s = W[0][a[0]]; for (let i = 1; i < a.length; i++) s += W[a[i - 1]][a[i]]; s += W[a[a.length - 1]][0]; best = Math.min(best, s); return; } for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
  perm([1, 2, 3, 4, 5, 6, 7, 8], 0);
  ok(tsp.out.L === best && tsp.out.p.length === 10 && tsh.out.L >= best, `TSP Held–Karp (n = 9) = brute force ${best}; nearest neighbour + 2-opt ${tsh.out.L} ≥ it`);
  const as = R({ graph: { nodes: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map(id => ({ id })), edges: [[1, 1, 4], [1, 2, 1], [1, 3, 3], [2, 1, 2], [2, 2, 0], [2, 3, 5], [3, 1, 3], [3, 2, 2], [3, 3, 2]].map(([i, j, w]) => ({ u: 'a' + i, v: 'b' + j, w })) }, run: { alg: 'assignment' } }, [O('c', 'result')]);
  ok(as.out.c === 5, 'assignment (Hungarian; Kuhn 1955): the classic 3×3 cost matrix [[4,1,3],[2,0,5],[3,2,2]] → minimum 5');
  const mx = R({ graph: { nodes: ['a1', 'a2', 'b1', 'b2'].map(id => ({ id })), edges: [{ u: 'a1', v: 'b1', w: 3 }, { u: 'a1', v: 'b2', w: 5 }, { u: 'a2', v: 'b1', w: 4 }, { u: 'a2', v: 'b2', w: 1 }] }, run: { alg: 'assignment', mode: 'max' } }, [O('c', 'result')]);
  ok(mx.out.c === 9, 'assignment, maximising: 5 + 4 = 9');
  const dag = R({ graph: dg([['s', 'a', 3], ['s', 'b', 2], ['a', 'c', 4], ['b', 'c', 1], ['c', 't', 2], ['a', 't', 1]], true), run: { alg: 'dag-path', source: 's', target: 't', mode: 'longest' } }, [O('L', 'result')]);
  const dag2 = R({ graph: dg([['s', 'a', 3], ['s', 'b', 2], ['a', 'c', 4], ['b', 'c', 1], ['c', 't', 2], ['a', 't', 1]], true), run: { alg: 'dag-path', source: 's', target: 't' } }, [O('L', 'result')]);
  ok(dag.out.L === 9 && dag2.out.L === 4, 'DAG paths in topological order: the critical (longest) path s–a–c–t = 9, the shortest s–a–t = 4');
  const topo = R({ graph: dg([['c', 'a'], ['b', 'a'], ['d', 'b']], true), run: { alg: 'toposort' } }, [S('o', 'order')]);
  ok(topo.out.o.map(i => topo.graph.ids[i]).join('') === 'cdba', 'topological sort (Kahn, min-index queue): c, d, b, a — the lexicographically smallest by node index');
  const bip = R({ generate: { kind: 'cycle', n: 5 }, run: { alg: 'bipartite' } }, [O('b', 'result'), S('p', 'path'), O('f', 'flag', { code: 'not-bipartite' })]);
  ok(bip.out.b === 0 && bip.out.f === 1 && bip.out.p.length === 5, 'C5 is not bipartite: an odd cycle of 5 as the witness');
  const cl = R({ generate: { kind: 'karate' }, run: { alg: 'cliques' } }, [O('w', 'result')]);
  ok(cl.out.w === 5, 'karate: the clique number ω = 5 (Bron–Kerbosch with pivoting)');
  const kc = R({ generate: { kind: 'karate' }, run: { alg: 'kcore' } }, [O('w', 'result')]);
  ok(kc.out.w === 4, 'karate: the 4-core is the deepest (Batagelj & Zaversnik 2003)');
  const lp = R({ generate: { kind: 'karate' }, run: { alg: 'label-propagation', seed: 3 } }, [O('k', 'result'), O('q', 'modularity')]);
  const lp2 = R({ generate: { kind: 'karate' }, run: { alg: 'label-propagation', seed: 3 } }, [O('k', 'result'), O('q', 'modularity')]);
  ok(lp.out.k >= 1 && lp.out.q === lp2.out.q, `label propagation: seeded, reproducible (${lp.out.k} communities, Q = ${lp.out.q.toFixed(4)})`);
  const gn = R({ generate: { kind: 'karate' }, run: { alg: 'girvan-newman', k: 2 } }, [O('k', 'result'), S('c', 'classes')]);
  const side0 = gn.out.c[0], same = [0, 1, 3, 4, 5, 6, 7, 10, 11, 12, 13, 16, 17, 19, 21].every(i => gn.out.c[i] === side0) && gn.out.c.filter(c => c === side0).length === 15;
  ok(gn.out.k === 2 && same && gn.out.c[33] !== side0, 'Girvan & Newman 2002: the first split of the karate club separates the instructor\'s (0) and the administrator\'s (33) groups: {0, 1, 3–7, 10–13, 16, 17, 19, 21} as networkx girvan_newman');
  const dfs = R({ graph: dg([['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'd']], true), run: { alg: 'dfs', source: 'a' } }, [S('v', 'values'), O('back', 'count')]);
  ok(dfs.out.v.join() === '1,2,3,6' && dfs.out.back === 1, 'DFS (CLRS timestamps): discovery times 1, 2, 3, 6 and one back edge (the cycle a → b → c → a)');
}

// ---------- 4. edge cases, the trace, the adapter ----------
{
  const e = G.run({ model: { graph: { nodes: [] } }, outputs: [O('n', 'n')] }, {}, {});
  ok(codes(e).includes('empty') && e.out.n === 0, 'empty: a graph with no nodes runs and says so');
  const one = R({ graph: { nodes: [{ id: 'a' }] }, run: { alg: 'dijkstra', source: 'a' } }, [O('r', 'result')]);
  ok(codes(one).includes('single-node') && one.out.r === 1, 'single-node');
  const un = R({ graph: dg([['a', 'b', 1], ['c', 'd', 1]]), run: { alg: 'dijkstra', source: 'a', target: 'd' } }, [O('r', 'result'), O('re', 'reached', { node: 'd' }), O('np', 'flag', { code: 'no-path' })]);
  ok(un.out.r === Infinity && un.out.re === 0 && un.out.np === 1 && codes(un).includes('unreachable'), 'no-path / unreachable: the distance is +∞ (never a silent number)');
  const neg = R({ graph: dg([['a', 'b', 'k - 2']], true), run: { alg: 'dijkstra', source: 'a', target: 'b' } }, [O('r', 'result')], { k: 0 });
  ok(Number.isNaN(neg.out.r) && codes(neg).includes('negative-weight'), 'negative-weight at run time (an expression): Dijkstra refuses, NaN');
  const sl = R({ graph: dg([['a', 'a', 1], ['a', 'b', 1]]), run: { alg: 'components' } }, [O('r', 'result'), S('d', 'degree')]);
  ok(codes(sl).includes('self-loop') && sl.out.d[0] === 3, 'self-loop: reported, counted twice in an undirected degree');
  const dc = R({ graph: dg([['a', 'b', 1], ['c', 'd', 1]]), run: { alg: 'kruskal' } }, [O('w', 'result')]);
  ok(dc.out.w === 2 && codes(dc).includes('disconnected'), 'disconnected: a minimum spanning forest');
  const cyc = R({ graph: dg([['a', 'b'], ['b', 'c'], ['c', 'a']], true), run: { alg: 'toposort' } }, [O('r', 'result'), S('p', 'path')]);
  ok(cyc.out.r === 0 && codes(cyc).includes('cyclic') && cyc.out.p.length === 3, 'cyclic: no topological order, a cycle as the witness');
  const nc = R({ generate: { kind: 'karate' }, run: { alg: 'pagerank', maxIter: 3 } }, [O('r', 'result')]);
  ok(codes(nc).includes('not-converged'), 'not-converged: PageRank stopped at maxIter');
  const ez = R({ graph: dg([['a', 'b'], ['b', 'c']], true), run: { alg: 'eigenvector' } }, [O('r', 'result')]);
  ok(codes(ez).includes('eigen-zero') && ez.out.r === 0, 'eigen-zero: a DAG has no Perron vector (use Katz or PageRank)');
  const pa = R({ generate: { kind: 'karate' }, run: { alg: 'pagerank', alpha: 'k / 2' } }, [O('r', 'result')], { k: 3 });
  ok(Number.isNaN(pa.out.r) && codes(pa).includes('param'), 'param: α = 1.5 at run time is refused (NaN)');
  const kp = R({ generate: { kind: 'karate' }, run: { alg: 'katz', alpha: 0.5 } }, [O('r', 'result')]);
  ok(Number.isNaN(kp.out.r) && codes(kp).includes('param'), 'Katz with α ≥ 1/λmax diverges: param, NaN');
  const nw = R({ graph: dg([['a', 'b', 'nope + 1']]), run: { alg: 'dijkstra', source: 'a' } }, [O('r', 'result')]);
  ok(Number.isNaN(nw.out.r) && codes(nw).includes('nan-weight'), 'nan-weight: a weight that cannot be computed gives NaN and its code');
  const inf = R({ graph: { directed: true, nodes: [{ id: 's' }, { id: 't' }], edges: [{ u: 's', v: 't', cap: '1/0' }] }, run: { alg: 'maxflow', source: 's', target: 't' } }, [O('f', 'result')]);
  ok(inf.out.f === Infinity && codes(inf).includes('unbounded'), 'unbounded: an s–t path of infinite capacity');
  const fc = R({ graph: { directed: true, nodes: [{ id: 's' }, { id: 't' }], edges: [{ u: 's', v: 't', cap: 1.5 }] }, run: { alg: 'maxflow', source: 's', target: 't' } }, [O('f', 'result')]);
  ok(fc.out.f === 1.5 && codes(fc).includes('float-capacity'), 'float-capacity: real capacities (BFS augmenting paths always terminate)');
  const ad = R({ graph: dg([['a', 'b'], ['a', 'c'], ['c', 'b']]), run: { alg: 'vertex-connectivity', source: 'a', target: 'b' } }, [O('f', 'result')]);
  ok(ad.out.f === 2 && codes(ad).includes('adjacent'), 'adjacent: s and t joined directly — the edge counts as one path');
  const nt = R({ generate: { kind: 'path', n: 4 }, run: { alg: 'tsp' } }, [O('L', 'result')]);
  ok(Number.isNaN(nt.out.L) && codes(nt).includes('no-tour'), 'no-tour: a path graph has no Hamiltonian cycle');
  const inf2 = R({ graph: { nodes: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map(id => ({ id })), edges: [['a1', 'b1'], ['a1', 'b2'], ['a2', 'b3'], ['a3', 'b3']].map(([u, v]) => ({ u, v, w: 1 })) }, run: { alg: 'assignment' } }, [O('c', 'result')]);
  ok(Number.isNaN(inf2.out.c) && codes(inf2).includes('infeasible'), 'infeasible: no perfect assignment (b1 and b2 both need a1: Hall\'s condition fails)');
  const nb = R({ generate: { kind: 'cycle', n: 5 }, run: { alg: 'matching' } }, [O('c', 'result')]);
  ok(Number.isNaN(nb.out.c) && codes(nb).includes('not-bipartite'), 'not-bipartite: Hopcroft–Karp needs two sides (use max-matching)');
  const big = R({ generate: { kind: 'gnp', n: 2000, p: 0.01, seed: 1 }, run: { alg: 'bfs', source: 'n0' } }, [O('r', 'result'), O('s', 'steps')]);
  ok(codes(big).includes('trace-truncated') && big.out.s <= 2000 && big.out.r > 1900, `trace-truncated: ${big.out.s} frames kept (≤ 2000 frames, ≤ 40 000 events); the result is still complete (${big.out.r} reached)`);
  const bud = R({ generate: { kind: 'complete', n: 200 }, run: { alg: 'betweenness' } }, [O('r', 'result')]);
  ok(codes(bud).includes('budget-exhausted') && Number.isNaN(bud.out.r), 'budget-exhausted: Brandes on K200 (≈ 8 M steps > 200 000) gives NaN and the code, never a partial number');
  const ti = R({ graph: dg([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]), run: { alg: 'dijkstra', source: 'a', target: 'd' } }, [S('p', 'path'), O('t', 'flag', { code: 'ties' })]);
  ok(ti.out.t === 1 && ti.out.p.map(i => ti.graph.ids[i]).join('') === 'abd', 'ties: two shortest ways to d (via b and via c); the first found, through the lower index b, is kept');
  const dia = R({ graph: dg([['a', 'b'], ['c', 'd']]) }, [O('d', 'diameter'), O('L', 'avgPath')]);
  ok(Number.isNaN(dia.out.d) && Number.isNaN(dia.out.L) && codes(dia).includes('disconnected'), 'the diameter of a disconnected graph: NaN and disconnected');
}
{
  // the trace: the state after k steps
  const mk = k => R({ graph: dg(CLRS_DIJ, true), run: { alg: 'dijkstra', source: 's', step: 'k' } }, [O('st', 'steps'), O('fr', 'frame'), SC], { k });
  const r0 = mk(0), r2 = mk(2), rAll = mk(99);
  const pts = r => r.out.net.items.filter(i => i.k === 'pt'), lab = r => r.out.net.items.filter(i => i.k === 'txt' && i.y > -10 && pts(r).length);
  ok(r0.out.st === rAll.out.st && rAll.out.fr === rAll.out.st && r0.out.fr === 0, `the trace: ${rAll.out.st} frames; frame k is clamped to [0, steps]`);
  ok(pts(r0).every(p => p.c === 'base') && pts(r2).some(p => p.c === 'hi') && pts(rAll).filter(p => p.c === 'ok').length === 4 && pts(rAll).filter(p => p.c === 'hi').length === 1, 'the scene after 0 steps: all unseen; after 2: the current node and its frontier; at the end: every node done, the last one popped still current');
  ok(JSON.stringify(mk(2).out.net) === JSON.stringify(r2.out.net), 'the same step draws the same scene');
  ok(rAll.out.net.items.length <= 2000 && rAll.out.net.items.some(i => i.k === 'seg' && i.arrow), 'a directed graph draws arrows; ≤ 2000 items');
  const kr = R({ graph: dg(CLRS_MST), run: { alg: 'kruskal', step: 3 } }, [SC]);
  const hi = kr.out.net.items.filter(i => i.k === 'seg' && i.c === 'hi').length;
  ok(hi === 2, `Kruskal after 3 steps: the 2 lightest edges chosen (g–h 1, then c–i 2 or f–g 2) + one being considered (${hi} chosen)`);
  const ms = R({ generate: { kind: 'konigsberg' } }, [SC]);
  ok(ms.out.net.items.filter(i => i.k === 'poly').length === 2, 'Königsberg: the parallel bridges are drawn bent');
}
{
  const g1 = R({ generate: { kind: 'gnp', n: 300, p: 0.02, seed: 5 } }, [O('m', 'm'), SC]), g2 = R({ generate: { kind: 'gnp', n: 300, p: 0.02, seed: 5 } }, [O('m', 'm'), SC]);
  const g3 = R({ generate: { kind: 'gnp', n: 300, p: 0.02, seed: 6 } }, [O('m', 'm')]);
  ok(g1.out.m === g2.out.m && JSON.stringify(g1.out.net) === JSON.stringify(g2.out.net) && g1.out.m !== g3.out.m, `seeded generators: G(300, 0.02) seed 5 → ${g1.out.m} edges every time (seed 6: ${g3.out.m}); E[m] = 897`);
  ok(Math.abs(g1.out.m - 897) < 4 * Math.sqrt(897), 'G(n, p) by geometric skipping: m within 4σ of p·n(n−1)/2');
  const ba = R({ generate: { kind: 'ba', n: 200, m: 3, seed: 1 } }, [O('m', 'm'), O('mx', 'maxDegree')]);
  ok(ba.out.m === 3 + 3 * 196 && ba.out.mx > 20, `Barabási–Albert (n 200, m 3): ${ba.out.m} edges, hubs (max degree ${ba.out.mx})`);
  const ws0 = R({ generate: { kind: 'ws', n: 100, k: 4, p: 0 } }, [O('c', 'clustering')]), ws1 = R({ generate: { kind: 'ws', n: 100, k: 4, p: 0.1, seed: 2 } }, [O('c', 'clustering'), O('L', 'avgPath')]);
  ok(near(ws0.out.c, 0.5, 1e-12) && ws1.out.c < ws0.out.c, 'Watts–Strogatz: the ring lattice k = 4 has C = 3(k−2)/(4(k−1)) = 0.5; rewiring lowers it');
  const tr = R({ generate: { kind: 'tree', n: 50, seed: 4 } }, [O('t', 'tree'), O('m', 'm')]);
  ok(tr.out.t === 1 && tr.out.m === 49, 'a random labelled tree (Prüfer code): connected with n − 1 edges');
  const hy = R({ generate: { kind: 'hypercube', k: 4 } }, [O('n', 'n'), O('m', 'm'), O('b', 'bipartite')]);
  ok(hy.out.n === 16 && hy.out.m === 32 && hy.out.b === 1, 'the 4-cube: 16 nodes, 32 edges, bipartite');
}
{
  // the sim adapter and the Worker source
  const sp = spec({ graph: dg(CLRS_DIJ, true), run: { alg: 'dijkstra', source: 's', target: 'x', step: 'k' } }, [O('dx', 'dist', { node: 'x' }), O('st', 'steps'), S('v', 'values'), SC]);
  const a = G.engine.create(sp, { seed: 1 }).run({ k: 3 });
  ok(a.dx === 9 && a.st === 7 && a.v.length === 5 && Array.isArray(a.net.items), 'engine.create(spec).run(inputs) gives the declared outputs (scalar, series, scene)');
  ok(G.engine.check(sp).length === 0 && G.engine.check(spec({}, [])).length > 0, 'engine.check: the errors of checkSpec as messages');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + G.engine.workerSource, ctx);
  const b = ctx.self.noemaEngine.create(sp, { seed: 1 }).run({ k: 3 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'the Worker source in a fresh context gives the same outputs');
  const ka = spec({ generate: { kind: 'karate' }, run: { alg: 'betweenness' } }, [O('b', 'value', { node: 'n0' })]);
  ok(ctx.self.noemaEngine.create(ka, {}).run({}).b === G.engine.create(ka, {}).run({}).b, 'the Worker: karate betweenness bit for bit');
}
{
  // check codes (the parity with tools/lib_graph.py is tests/enginelib.js)
  const C1 = s => G.checkSpec(s).filter(p => p.level === 'error').map(p => p.code);
  ok(C1(spec({ graph: dg(CLRS_DIJ, true), generate: { kind: 'karate' } }, [])).includes('graph'), 'check: graph and generate together → graph');
  ok(C1(spec({ graph: dg(CLRS_DIJ, true), run: { alg: 'kruskal' } }, [])).includes('undirected-required'), 'check: Kruskal on a digraph → undirected-required');
  ok(C1(spec({ graph: dg(CLRS_MST), run: { alg: 'scc' } }, [])).includes('directed-required'), 'check: SCC on an undirected graph → directed-required');
  ok(C1(spec({ graph: dg(CLRS_BF, true), run: { alg: 'dijkstra', source: 's' } }, [])).includes('negative-weight'), 'check: Dijkstra with a negative number → negative-weight (use Bellman–Ford)');
  ok(C1(spec({ graph: dg(CLRS_FLOW, true), run: { alg: 'maxflow', source: 's', target: 's' } }, [])).includes('source-is-target'), 'check: a flow from s to s → source-is-target');
  ok(C1(spec({ generate: { kind: 'grid', rows: 10, cols: 10 }, run: { alg: 'floyd-warshall' } }, [])).includes('size'), 'check: Floyd–Warshall on 100 nodes → size (n ≤ 60, n³ within the budget)');
  ok(C1(spec({ graph: dg(CLRS_DIJ, true), run: { alg: 'dijkstra', source: 'q' } }, [])).includes('ref'), 'check: an unknown source → ref');
  ok(C1(spec({ generate: { kind: 'karate' } }, [O('x', 'dist')])).join() === 'output,value', 'check: an algorithm output without run, a node output without node');
  ok(C1(spec({ generate: { kind: 'karate' }, run: { alg: 'pagerank', alpha: 1 } }, [])).includes('param'), 'check: PageRank with α = 1 → param');
  ok(G.exprs(spec({ graph: { nodes: [{ id: 'a', x: 'k', y: 0 }], edges: [{ u: 'a', v: 'a', w: 'k+1' }] }, run: { alg: 'bfs', step: 'k' } }, [])).map(e => e[1]).join() === 'model.graph.nodes[0].x,model.graph.edges[0].w,model.run.step', 'exprs: every expression of the model with its path');
  ok(G.keys(spec({ graph: { nodes: [{ id: 'a', label: 'nodeA' }] } }, [])).length === 1, 'keys: the nodes\' labels');
}
{
  // speed: a typical run < 50 ms, the worst allowed < 2 s
  const t0 = Date.now(); R({ graph: dg(CLRS_DIJ, true), run: { alg: 'dijkstra', source: 's', step: 3 } }, [O('a', 'result'), SC]); R(Object.assign({ run: { alg: 'pagerank' } }, KA), [O('a', 'result'), SC]); const t1 = Date.now() - t0;
  const t2 = Date.now(); R({ generate: { kind: 'gnp', n: 2000, p: 0.01, seed: 1 }, run: { alg: 'pagerank' } }, ['diameter', 'clustering', 'components'].map(x => O(x, x)).concat([SC])); R({ generate: { kind: 'karate' }, run: { alg: 'girvan-newman' } }, [O('a', 'result'), SC]); R({ generate: { kind: 'complete', n: 200 }, run: { alg: 'betweenness' } }, [O('r', 'result')]); const t3 = Date.now() - t2;
  ok(t1 < 50, `speed: a typical run (CLRS Dijkstra + karate PageRank with scenes) ${t1} ms < 50 ms`);
  ok(t3 < 2000, `speed: the worst allowed (G(2000, 0.01) properties, Girvan–Newman on karate, Brandes cut by the budget) ${t3} ms < 2 s`);
}
// ---------- the reference activity dijkstra-steps (its exercise's checks and tests.json; packcheck and activities.py agree) ----------
{
  const AD = path.join(ROOT, 'tools', 'activities_examples', 'dijkstra-steps'), rd = f => JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
  const ex = rd('spec.json'), sim = G.engine.create(ex, { seed: 1 });
  const LOC = ['en', 'el', 'ru', 'de', 'fr'], tables = Object.fromEntries(LOC.map(l => [l, rd(`strings.${l}.json`)]));
  require(path.join(ROOT, 'engine', 'packcheck.js'));
  const js = globalThis.NoemaPackCheck.checkSimSpec(ex, tables);
  const py = JSON.parse(require('child_process').execFileSync('python3', ['-c', 'import json, sys, activities as A; d = json.loads(sys.stdin.read()); print(json.dumps(A.check_spec(d[0], tables=d[1])))'], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify([ex, tables]), encoding: 'utf8' }));
  ok(js.length === 0 && py.length === 0, `dijkstra-steps: the spec passes packcheck (JS) and activities.check_spec (Python) with its five string tables${js.length + py.length ? ': ' + js.concat(py).join('; ') : ''}`);
  ok(LOC.every(l => JSON.stringify(Object.keys(tables[l]).sort()) === JSON.stringify(Object.keys(tables.en).sort())), 'dijkstra-steps: the five string tables have the same keys');
  const act = rd('activity.json'); ok(act.id === 'dijkstra-steps' && act.runtime === 'sim-spec@1' && fs.readFileSync(path.join(AD, 'fallback.svg'), 'utf8').startsWith('<svg'), 'dijkstra-steps: activity.json and fallback.svg');
  const checks = ['dx < dOld', 'wst >= wLeast', 'frame == steps'].map(e => NoemaExpr.compile(e));
  const T = rd('tests.json');
  for (const c of T.cases) {
    const v = Object.assign({}, ex.consts || {}, { wst: 10, k: 0 }); for (const st of c.steps) v[st.set] = st.value;
    const out = sim.run(v), env = Object.assign({}, v, Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')));
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = checks.every(f => !!f(env));
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `dijkstra-steps: ${c.name}`);
  }
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
