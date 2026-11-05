"""graph@1 — the Python twin of engine/src/47_lib_graph.js (docs/library/graph.md): check_spec(spec), exprs(spec), keys(spec) give the
same problems (code, path, msg, level) and lists as the JS checkSpec / exprs / keys (tests/enginelib.js compares them on
tests/fixtures/enginelib/graph.json). It does not run the algorithms."""
import enginelib as L

ID = "graph@1"
MAX_N, MAX_M = 2000, 20000
ALGS = ["none", "bfs", "dfs", "dijkstra", "bellman-ford", "astar", "floyd-warshall", "dag-path", "toposort", "scc", "components", "bipartite",
        "kruskal", "prim", "boruvka", "maxflow", "dinic", "vertex-connectivity", "matching", "max-matching", "assignment", "euler", "hamilton", "tsp",
        "coloring", "articulation", "pagerank", "betweenness", "closeness", "harmonic", "eigenvector", "katz", "hits", "degree", "clustering",
        "kcore", "cliques", "label-propagation", "louvain", "girvan-newman", "spanning-trees"]
GENS = ["gnp", "gnm", "ba", "ws", "grid", "complete", "cycle", "path", "star", "wheel", "hypercube", "complete-bipartite", "tree",
        "binary-tree", "petersen", "karate", "konigsberg"]
LAYOUTS = ["auto", "given", "circle", "grid", "spring", "layered", "bipartite", "random"]
HEUR = ["zero", "euclid", "manhattan", "octile", "chebyshev"]
ORDERS = ["given", "largest-first", "smallest-last", "dsatur", "exact"]
MODES = ["shortest", "longest", "min", "max", "path", "cycle", "exact", "heuristic", "hubs", "authorities"]
NODE_T = {"id": "id!", "x": "numx", "y": "numx", "label": "key"}
EDGE_T = {"u": "ref!", "v": "ref!", "w": "numx", "cap": "numx", "id": "id"}
GRAPH_T = {"directed": "bool", "nodes": {"$req": True, "$list": {"$obj": NODE_T}, "max": MAX_N}, "edges": {"$list": {"$obj": EDGE_T}, "max": MAX_M}}
GEN_T = {"kind": "enum:" + "|".join(GENS) + "!", "n": "int:1:2000", "m": "int:0:20000", "p": "numx", "k": "int:0:2000", "rows": "int:1:100", "cols": "int:1:100",
         "a": "int:1:1000", "b": "int:1:1000", "seed": "int:0:4294967295", "directed": "bool", "wmin": "int:-1000000:1000000", "wmax": "int:-1000000:1000000"}
RUN_T = {"alg": "enum:" + "|".join(ALGS) + "!", "source": "ref", "target": "ref", "step": "numx", "heuristic": "enum:" + "|".join(HEUR), "hweight": "numx",
         "alpha": "numx", "beta": "numx", "order": "enum:" + "|".join(ORDERS), "mode": "enum:" + "|".join(MODES), "maxIter": "int:1:10000", "tol": "pos", "k": "int:1:2000",
         "seed": "int:0:4294967295", "normalized": "bool", "weighted": "bool"}
MODEL_T = {"graph": {"$obj": GRAPH_T}, "generate": {"$obj": GEN_T}, "layout": "enum:" + "|".join(LAYOUTS), "run": {"$obj": RUN_T}, "view": {"$list": "fin", "min": 4, "max": 4}}
GEN_NEEDS = {"gnp": ["n", "p"], "gnm": ["n", "m"], "ba": ["n", "m"], "ws": ["n", "k", "p"], "grid": ["rows", "cols"], "complete": ["n"], "cycle": ["n"], "path": ["n"],
             "star": ["n"], "wheel": ["n"], "hypercube": ["k"], "complete-bipartite": ["a", "b"], "tree": ["n"], "binary-tree": ["n"], "petersen": [], "karate": [], "konigsberg": []}
NEEDS_SOURCE = ["dijkstra", "bellman-ford", "astar", "dag-path", "maxflow", "dinic", "vertex-connectivity"]
NEEDS_TARGET = ["astar", "maxflow", "dinic", "vertex-connectivity"]
DIRECTED_ONLY = ["toposort", "scc", "dag-path"]
UNDIRECTED_ONLY = ["kruskal", "prim", "boruvka", "articulation", "coloring", "cliques", "label-propagation", "louvain", "girvan-newman",
                   "spanning-trees", "matching", "max-matching", "assignment", "clustering", "kcore", "tsp"]
CAPS = {"floyd-warshall": 60, "tsp": 60, "hamilton": 20, "girvan-newman": 60, "spanning-trees": 30, "cliques": 100, "assignment": 100, "max-matching": 500,
        "betweenness": 500, "closeness": 500, "harmonic": 500, "louvain": 500, "vertex-connectivity": 500}
EXACT_COLOURING_CAP = 40
PROPS = ["n", "m", "components", "connected", "bipartite", "density", "diameter", "radius", "girth", "avgPath", "clustering", "transitivity",
         "maxDegree", "minDegree", "avgDegree", "oddCount", "eulerian", "acyclic", "tree", "spanningTrees", "triangles", "assortativity", "degeneracy",
         "selfLoops", "multiEdges", "largestComponent", "planarBound"]
ALG_SCALARS = ["result", "steps", "frame", "dist", "value", "reached", "pathEdges", "expanded", "expandedRef", "top", "count", "lower", "modularity", "iterations", "flag"]
SCALARS = PROPS + ALG_SCALARS
NODE_SCALARS = ["dist", "value", "reached"]
SERIES = ["values", "degree", "degreeHist", "order", "path", "nodeIndex", "residual", "frontier", "componentSizes", "classes"]
CODES = ["empty", "single-node", "self-loop", "multi-edge", "disconnected", "unreachable", "negative-weight", "negative-cycle",
         "no-path", "unbounded", "ties", "cyclic", "not-bipartite", "no-euler", "non-hamiltonian", "undecided", "budget-exhausted", "float-capacity",
         "heuristic-inadmissible", "non-unique-mst", "not-converged", "eigen-zero", "bounds-only", "trace-truncated", "nan-weight", "param", "no-tour",
         "infeasible", "adjacent", "size"]
LABELS = ["id", "value", "both", "none"]
KINDS3 = ["scalar", "series", "scene"]


def gen_count(g):
    k = g.get("kind")
    if k == "grid": return (g.get("rows") or 0) * (g.get("cols") or 0)
    if k == "star": return (g.get("n") or 0) + 1
    if k == "hypercube": return 2 ** (g.get("k") or 0)
    if k == "complete-bipartite": return (g.get("a") or 0) + (g.get("b") or 0)
    if k == "petersen": return 10
    if k == "karate": return 34
    if k == "konigsberg": return 4
    return g.get("n") or 0


def gen_ids(g, N):
    return ["A", "B", "C", "D"] if g.get("kind") == "konigsberg" else ["n%d" % i for i in range(N)]


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    noop = lambda o, at, E, W: True
    if not L.is_obj(m):
        E("format", "model", "not an object"); L.check_outputs(spec, ID, KINDS3, noop, E, W); return P
    L.walk(m, MODEL_T, "model", E, W)
    if L.has_errors(P):
        L.check_outputs(spec, ID, KINDS3, noop, E, W); return P
    gr, gen = m.get("graph"), m.get("generate")
    run = m["run"] if L.is_obj(m.get("run")) else None
    alg = run["alg"] if run else "none"
    ids, N, directed = [], 0, False
    if ("graph" in m) == ("generate" in m):
        E("graph", "model", "needs graph or generate (one of them)")
    elif "graph" in m:
        directed = gr.get("directed") is True
        seen = []
        for i, nd in enumerate(gr["nodes"]):
            if nd["id"] in seen: E("duplicate", f"model.graph.nodes[{i}].id", f"the node {nd['id']} is listed twice")
            else: seen.append(nd["id"])
            if ("x" in nd) != ("y" in nd): E("value", f"model.graph.nodes[{i}].{'y' if 'x' in nd else 'x'}", "missing (a node has both x and y or neither)")
            elif m.get("layout") == "given" and "x" not in nd: E("value", f"model.graph.nodes[{i}].x", "missing (layout given)")
        ids = list(seen); N = len(ids)
        if not N: E("empty", "model.graph.nodes", "the graph has no nodes")
        eids = set()
        for i, ed in enumerate(gr.get("edges") or []):
            for f in ["u", "v"]:
                if ed[f] not in seen: E("ref", f"model.graph.edges[{i}].{f}", "not a node of the graph")
            if "id" in ed:
                if ed["id"] in eids: E("duplicate", f"model.graph.edges[{i}].id", f"the edge {ed['id']} is listed twice")
                eids.add(ed["id"])
            if alg in ("dijkstra", "astar") and L.is_num(ed.get("w")) and ed["w"] < 0:
                E("negative-weight", f"model.graph.edges[{i}].w", alg + " needs weights >= 0 (use bellman-ford)")
    else:
        directed = gen.get("directed") is True
        need = [f for f in GEN_NEEDS[gen["kind"]] if f not in gen]
        if need:
            for f in need: E("value", "model.generate." + f, f"missing ({gen['kind']} needs {', '.join(GEN_NEEDS[gen['kind']])})")
        else:
            N = gen_count(gen); k = gen["kind"]
            if L.is_num(gen.get("p")) and not (0 <= gen["p"] <= 1): E("value", "model.generate.p", "needs a number from 0 to 1")
            if k == "hypercube" and gen["k"] > 10: E("size", "model.generate.k", "at most 10 (2^k nodes, at most 2000)")
            elif N > MAX_N: E("size", "model.generate", f"more than {MAX_N} nodes")
            if k == "gnm" and gen["m"] > gen["n"] * (gen["n"] - 1) / 2: E("value", "model.generate.m", "more edges than node pairs")
            if k == "ba" and not (1 <= gen["m"] < gen["n"]): E("value", "model.generate.m", "needs 1 <= m < n")
            if k == "ws" and not (gen["k"] < gen["n"]): E("value", "model.generate.k", "needs k < n")
            if k == "complete" and gen["n"] > 200: E("size", "model.generate.n", "at most 200 (the edges, at most 20000)")
            if (k == "cycle" and gen["n"] < 3) or (k == "wheel" and gen["n"] < 4): E("value", "model.generate.n", f"needs n >= {3 if k == 'cycle' else 4}")
            if "wmin" in gen and "wmax" in gen and gen["wmin"] > gen["wmax"]: E("value", "model.generate.wmax", "needs wmin <= wmax")
            if alg in ("dijkstra", "astar") and "wmin" in gen and gen["wmin"] < 0: E("negative-weight", "model.generate.wmin", alg + " needs weights >= 0 (use bellman-ford)")
            ids = gen_ids(gen, min(N, MAX_N))
        if m.get("layout") == "given": E("value", "model.layout", "a generated graph has no coordinates (use auto, circle, grid, spring, layered, bipartite or random)")
    known = set(ids)
    if run:
        for f in ["source", "target"]:
            if f in run and N and run[f] not in known: E("ref", "model.run." + f, "not a node of the graph")
        if alg in NEEDS_SOURCE and "source" not in run: E("value", "model.run.source", f"missing ({alg} starts from a source node)")
        if alg in NEEDS_TARGET and "target" not in run: E("value", "model.run.target", f"missing ({alg} needs a target node)")
        if alg in ("maxflow", "dinic", "vertex-connectivity") and "source" in run and run.get("source") == run.get("target"):
            E("source-is-target", "model.run.target", "the source and the target are the same node")
        if alg in DIRECTED_ONLY and not directed: E("directed-required", "model.run.alg", alg + " needs a directed graph")
        if alg in UNDIRECTED_ONLY and directed: E("undirected-required", "model.run.alg", alg + " needs an undirected graph")
        if alg in CAPS and N > CAPS[alg]: E("size", "model.run.alg", f"{alg} handles at most {CAPS[alg]} nodes (this graph has {N})")
        if alg == "coloring" and run.get("order") == "exact" and N > EXACT_COLOURING_CAP:
            E("size", "model.run.order", f"exact colouring handles at most {EXACT_COLOURING_CAP} nodes (this graph has {N})")
        if alg == "pagerank" and L.is_num(run.get("alpha")) and not (0 < run["alpha"] < 1): E("param", "model.run.alpha", "pagerank needs 0 < alpha < 1")
        if alg == "katz" and L.is_num(run.get("alpha")) and not (run["alpha"] > 0): E("param", "model.run.alpha", "katz needs alpha > 0")
        if L.is_num(run.get("hweight")) and run["hweight"] < 0: E("value", "model.run.hweight", "needs a number >= 0")
        if alg == "astar" and "heuristic" in run and run["heuristic"] != "zero" and "graph" in m and any("x" not in nd for nd in gr["nodes"]):
            W("heuristic", "model.run.heuristic", "the nodes have no coordinates: the heuristic measures the layout")

    def out(o, at, E, W):
        for k in o:
            if k not in ("id", "kind", "of", "node", "code", "labels"): W("unknown-field", at + "." + k, "ignored")
        lst = SCALARS if o["kind"] == "scalar" else SERIES if o["kind"] == "series" else ["drawing"]
        if o["of"] not in lst:
            E("output", at + ".of", f"{o['kind']} outputs of {ID}: {', '.join(lst)}"); return
        if o["kind"] == "scalar" and o["of"] in ALG_SCALARS and alg == "none": E("output", at + ".of", "needs model.run (an algorithm)")
        if o["kind"] == "series" and o["of"] in ("values", "order", "path", "residual", "frontier", "classes") and alg == "none": E("output", at + ".of", "needs model.run (an algorithm)")
        if o["kind"] == "scalar" and o["of"] in NODE_SCALARS:
            if "node" not in o: E("value", at + ".node", "missing (the node it is about)")
            elif not L.check_kind("ref", o["node"]): E("value", at + ".node", L.kind_msg("ref"))
            elif N and o["node"] not in known: E("ref", at + ".node", "not a node of the graph")
        elif "node" in o: W("unknown-field", at + ".node", "ignored")
        if o["kind"] == "scalar" and o["of"] == "flag":
            if o.get("code") not in CODES or not isinstance(o.get("code"), str): E("enum", at + ".code", "one of " + ", ".join(CODES))
        elif "code" in o: W("unknown-field", at + ".code", "ignored")
        if o["kind"] == "scene":
            if "labels" in o and o["labels"] not in LABELS: E("enum", at + ".labels", "one of " + ", ".join(LABELS))
        elif "labels" in o: W("unknown-field", at + ".labels", "ignored")
    L.check_outputs(spec, ID, KINDS3, out, E, W)
    return P


def exprs(spec):
    out, m = [], spec.get("model") if isinstance(spec, dict) else None
    if not L.is_obj(m): return out
    def sx(v, p):
        if isinstance(v, str): out.append([v, p, []])
    if L.is_obj(m.get("graph")):
        g = m["graph"]
        for i, nd in enumerate(g["nodes"] if isinstance(g.get("nodes"), list) else []):
            if L.is_obj(nd): sx(nd.get("x"), f"model.graph.nodes[{i}].x"); sx(nd.get("y"), f"model.graph.nodes[{i}].y")
        for i, ed in enumerate(g["edges"] if isinstance(g.get("edges"), list) else []):
            if L.is_obj(ed): sx(ed.get("w"), f"model.graph.edges[{i}].w"); sx(ed.get("cap"), f"model.graph.edges[{i}].cap")
    if L.is_obj(m.get("generate")): sx(m["generate"].get("p"), "model.generate.p")
    if L.is_obj(m.get("run")):
        for f in ["step", "hweight", "alpha", "beta"]: sx(m["run"].get(f), "model.run." + f)
    return out


def keys(spec):
    out, m = [], spec.get("model") if isinstance(spec, dict) else None
    if L.is_obj(m) and L.is_obj(m.get("graph")) and isinstance(m["graph"].get("nodes"), list):
        for i, nd in enumerate(m["graph"]["nodes"]):
            if L.is_obj(nd) and isinstance(nd.get("label"), str): out.append([nd["label"], f"model.graph.nodes[{i}].label"])
    return out
