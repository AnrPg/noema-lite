/* The expression language of sim-spec@1 without a browser (docs/activities-dev/simexpr.md, docs/adr/001 D5):
   1. the shared corpus (tests/fixtures/simexpr/corpus.json): every case in JS, against its expected value / error / check / print;
   2. the same corpus, a seeded fuzz of random trees (printed to source and evaluated) and a fuzz of every function, all run
      by the Python twin (tools/simexpr.py, one python3 process for everything): the trees, errors, printed sources and the
      doubles must be identical (Object.is after the JSON round trip; NaN equals NaN; -0 is kept);
   3. parse → print → parse is stable, and a tree from outside (JSON) is checked node by node in both twins;
   4. the fdlibm ports stay within 1 ulp of this platform's Math; the safety refusals; the public API.
   Usage: node tests/simexpr.js [seed] */
const path = require('path'), fs = require('fs'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const quiet = (c, m) => { n++; if (!c) { fails++; if (fails < 60) console.log('✗ ' + m); } return c; };   // one of many: only failures are printed

require(path.join(ROOT, 'engine', 'src', '35_simexpr.js'));
const X = globalThis.NoemaExpr;
const PY = path.join(ROOT, 'tools', 'simexpr.py');

// ---- values across JSON: NaN, ±Infinity and -0 as strings
const enc = v => (typeof v === 'boolean' ? v : v !== v ? 'NaN' : v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : Object.is(v, -0) ? '-0' : v);
const dec = v => (v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v === '-0' ? -0 : v);
const decEnv = env => { const o = {}; for (const k of Object.keys(env || {})) o[k] = dec(env[k]); return o; };
const same = (a, b) => Object.is(a, b) || (typeof a === 'number' && typeof b === 'number' && a !== a && b !== b);
function deepEq(a, b) {   // JSON values, numbers compared as doubles (after decoding the special strings)
  if (typeof a === 'number' || typeof b === 'number' || typeof a === 'string' || typeof b === 'string') return same(dec(a), dec(b));
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEq(a[k], b[k]));
}
const show = v => JSON.stringify(v, (k, x) => (typeof x === 'number' ? enc(x) : x));
const errObj = e => { if (!e || !e.code) throw e; return { code: e.code, pos: e.pos, msg: e.message }; };
const stripPos = t => JSON.parse(JSON.stringify(t, (k, v) => (k === 'pos' ? undefined : v)));

// ---- one job, the JS side (tools/simexpr.py _job is the Python side)
function jsJob(j) {
  if (j.k === 'fn') return { value: enc(X.FUNCS[j.fn].fn(...j.args.map(dec))) };
  const out = {}, env = decEnv(j.env);
  let target;
  if (j.k === 'ast') {
    try { out.print = X.print(j.ast); } catch (e) { out.print = { error: errObj(e) }; }
    target = j.ast;
  } else {
    try { const ast = X.parse(j.src); out.ast = ast; out.print = X.print(ast); } catch (e) { out.ast = { error: errObj(e) }; }
    out.check = X.check(j.src, { vars: j.vars });
    target = j.src;
  }
  try { out.value = enc(X.evaluate(target, env)); } catch (e) { out.value = { error: errObj(e) }; }
  return out;
}
const jobs = [], jsOut = [], labels = [];
const addJob = (j, label) => { jobs.push(j); jsOut.push(jsJob(j)); labels.push(label); return jsOut[jsOut.length - 1]; };

// ================================================================ 1. the corpus in JS
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'simexpr', 'corpus.json'), 'utf8')).cases;
const codes = new Set();
let corpusFails = 0;
for (const c of corpus) {
  const src = c.gen ? c.gen.map(([s, k]) => s.repeat(k)).join('') : c.src;
  const label = 'corpus ' + (c.gen ? 'gen ' + JSON.stringify(c.gen) : JSON.stringify(src));
  const o = addJob({ k: 'run', src, env: c.env || {}, vars: c.vars === undefined ? null : c.vars }, label);
  let good = true;
  if ('value' in c) good = good && !(o.value && o.value.error) && deepEq(o.value, c.value);
  if ('error' in c) { codes.add(c.error); good = good && !!(o.value && o.value.error) && o.value.error.code === c.error && (c.pos === undefined || o.value.error.pos === c.pos); }
  if ('check' in c) { good = good && deepEq(o.check.map(e => [e.code, e.pos]), c.check); for (const [code] of c.check) codes.add(code); }
  if ('print' in c) good = good && o.print === c.print;
  if (!quiet(good, label + ' → ' + show({ value: o.value, check: o.check, print: o.print }) + ' expected ' + show({ value: c.value, error: c.error, pos: c.pos, check: c.check, print: c.print }))) corpusFails++;
}
ok(corpus.length >= 150, 'the corpus has ' + corpus.length + ' cases (≥ 150)');
ok(corpusFails === 0, 'every corpus case gives its expected value / error / check / print in JS (' + (corpus.length - corpusFails) + '/' + corpus.length + ')');
const allCodes = ['E_NUMBER', 'E_CHAR', 'E_FORBIDDEN', 'E_SYNTAX', 'E_EMPTY', 'E_TOO_LONG', 'E_DEPTH', 'E_UNKNOWN_FN', 'E_ARITY', 'E_UNKNOWN_VAR', 'E_VALUE'];
ok(allCodes.every(c => codes.has(c)), 'the corpus covers every source error code: ' + allCodes.join(' '));
ok(Object.keys(X.FUNCS).every(f => corpus.some(c => c.src && new RegExp('\\b' + f + '\\s*\\(').test(c.src))), 'the corpus calls every function of the allow-list');

// ================================================================ 2. the seeded fuzz
const seed = Number(process.argv[2]) || 20261104;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(seed);
const pick = a => a[Math.floor(rng() * a.length)];
const NUMS = [0, 1, 2, 3, 0.5, 0.25, 10, 0.1, 1e-7, 1e21, 1e22, 1e300, 5e-324, 123.456, 7, 2.5, 709.78, 0.75, 1e-300, 1e15, 4503599627370495.5, 3.141592653589793, 1.5707963267948966, 6.283185307179586];
const randNum = () => {
  const r = rng();
  if (r < 0.45) return pick(NUMS);
  if (r < 0.65) return Math.floor(rng() * 20);
  if (r < 0.85) return Number((rng() * 100).toPrecision(1 + Math.floor(rng() * 17)));
  return rng() * Math.pow(10, Math.floor(rng() * 60 - 30));
};
const randVal = () => {
  const r = rng();
  if (r < 0.1) return pick([0, -0, 1, -1, Infinity, -Infinity, NaN, 0.5, -0.5, 1e22, -1e300, 5e-324, 710, -745.2, 1e-310, 2 ** 31, 2 ** 64 + 2 ** 12]);
  if (r < 0.15) return rng() < 0.5;
  if (r < 0.55) return (rng() - 0.5) * 20;
  if (r < 0.75) return (rng() - 0.5) * 4;
  if (r < 0.9) return (rng() - 0.5) * Math.pow(10, Math.floor(rng() * 40 - 20));
  return (rng() - 0.5) * Math.pow(2, Math.floor(rng() * 2100 - 1050));
};
const VARS = ['x', 'y', 'z', 'k', 'n', 'flag', 'theta', 'v0'];
const BIN = ['+', '-', '*', '/', '%', '^', '<', '<=', '>', '>=', '==', '!=', '&&', '||'];
const FN_NAMES = Object.keys(X.FUNCS);
function genAst(d) {
  const r = rng();
  if (d <= 0 || r < 0.22) {
    const q = rng();
    if (q < 0.45) return { t: 'num', v: randNum() };
    if (q < 0.85) return { t: 'var', name: pick(VARS) };
    if (q < 0.93) return { t: 'const', name: pick(['pi', 'e']) };
    return { t: 'bool', v: rng() < 0.5 };
  }
  if (r < 0.34) return { t: 'un', op: pick(['-', '-', '+', '!']), a: genAst(d - 1) };
  if (r < 0.7) return { t: 'bin', op: pick(BIN), a: genAst(d - 1), b: genAst(d - 1) };
  if (r < 0.78) return { t: 'cond', c: genAst(d - 1), a: genAst(d - 1), b: genAst(d - 1) };
  const fn = pick(FN_NAMES), def = X.FUNCS[fn];
  const k = def.min + Math.floor(rng() * (Math.min(def.max, def.min + 3) - def.min + 1));
  return { t: 'call', fn, args: Array.from({ length: k }, () => genAst(d - 1)) };
}
const N_FUZZ = 2500;
let fuzzRoundTrip = 0, fuzzReprint = 0;
for (let i = 0; i < N_FUZZ; i++) {
  const ast = genAst(1 + Math.floor(rng() * 7));
  const env = {};
  for (const v of VARS) if (rng() < 0.93) env[v] = enc(randVal());
  const src = X.print(ast);
  let parsed = null;
  try { parsed = X.parse(src); } catch (e) { quiet(false, 'fuzz #' + i + ' the printed tree parses: ' + src + ' → ' + e.code); }
  if (parsed && quiet(deepEq(stripPos(parsed), ast), 'fuzz #' + i + ' parse(print(tree)) is the tree: ' + src)) fuzzRoundTrip++;
  if (parsed && quiet(X.print(parsed) === src, 'fuzz #' + i + ' print(parse(src)) is src: ' + src)) fuzzReprint++;
  addJob({ k: 'run', src, env, vars: rng() < 0.5 ? null : VARS.filter(() => rng() < 0.8) }, 'fuzz #' + i + ' ' + src + ' env ' + JSON.stringify(env));
  if (i % 8 === 0) addJob({ k: 'ast', ast, env }, 'fuzz tree #' + i + ' ' + src);
}
ok(fuzzRoundTrip === N_FUZZ, 'fuzz: parse(print(tree)) gives back the same tree for ' + fuzzRoundTrip + '/' + N_FUZZ + ' random trees (seed ' + seed + ')');
ok(fuzzReprint === N_FUZZ, 'fuzz: print(parse(src)) is the same text for ' + fuzzReprint + '/' + N_FUZZ);

// every function on its own, many arguments (the function ports must agree bit for bit)
const N_FN = 800;
for (const fn of FN_NAMES) {
  const def = X.FUNCS[fn];
  for (let i = 0; i < N_FN; i++) {
    const k = def.min + Math.floor(rng() * (Math.min(def.max, def.min + 3) - def.min + 1));
    const args = Array.from({ length: k }, () => {
      const v = randVal();
      if (typeof v === 'boolean') return v ? 1 : 0;
      if ((fn === 'asin' || fn === 'acos') && rng() < 0.7) return rng() * 2 - 1;
      if ((fn === 'sin' || fn === 'cos' || fn === 'tan') && rng() < 0.15) return (rng() - 0.5) * Math.pow(2, Math.floor(rng() * 1000));
      return v;
    });
    addJob({ k: 'fn', fn, args: args.map(enc) }, 'fn ' + fn + '(' + args.map(a => show(a)).join(', ') + ')');
  }
}

// trees from outside (JSON): the node-by-node checks give the same errors in both twins
const deep = d => (d === 0 ? { t: 'num', v: 1 } : { t: 'un', op: '-', a: deep(d - 1) });
const wide = d => (d === 0 ? { t: 'var', name: 'x' } : { t: 'bin', op: '+', a: wide(d - 1), b: wide(d - 1) });
const AST_CASES = [
  [{ t: 'bin', op: '+', a: { t: 'num', v: 1 }, b: { t: 'var', name: 'x' } }, { x: 2 }, 3],
  [{ t: 'call', fn: 'max', args: [{ t: 'num', v: 1, pos: 4 }, { t: 'const', name: 'pi' }] }, {}, 3.141592653589793],
  [{ t: 'num', v: -1 }, {}, 'E_AST'],
  [{ t: 'num', v: '1' }, {}, 'E_AST'],
  [{ t: 'num', v: 1, pos: -1 }, {}, 'E_AST'],
  [{ t: 'un', op: '-', a: { t: 'num', v: 1 }, pos: 1.5 }, {}, 'E_AST'],
  [{ t: 'var', name: '__proto__' }, {}, 'E_AST'],
  [{ t: 'var', name: 'a.b' }, {}, 'E_AST'],
  [{ t: 'var', name: 'pi' }, {}, 'E_AST'],
  [{ t: 'var', name: 'constructor' }, {}, 'E_AST'],
  [{ t: 'call', fn: 'constructor', args: [] }, {}, 'E_AST'],
  [{ t: 'call', fn: 'sin', args: 'x' }, {}, 'E_AST'],
  [{ t: 'call', fn: 'f', args: [] }, {}, 'E_UNKNOWN_FN'],
  [{ t: 'call', fn: 'sin', args: [] }, {}, 'E_ARITY'],
  [{ t: 'bin', op: '**', a: { t: 'num', v: 1 }, b: { t: 'num', v: 1 } }, {}, 'E_AST'],
  [{ t: 'bin', op: '+', a: { t: 'num', v: 1 } }, {}, 'E_AST'],
  [{ t: 'eval', code: '1' }, {}, 'E_AST'],
  [null, {}, 'E_AST'],
  [[1, 2], {}, 'E_AST'],
  [deep(63), {}, -1],
  [deep(64), {}, 'E_DEPTH'],
  [wide(9), { x: 1 }, 512],
  [wide(10), { x: 1 }, 'E_TOO_BIG'],
];
for (const [ast, env, want] of AST_CASES) {
  const o = addJob({ k: 'ast', ast, env: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, enc(v)])) }, 'tree ' + JSON.stringify(ast).slice(0, 80));
  const got = o.value && o.value.error ? o.value.error.code : dec(o.value);
  quiet(same(got, want) || got === want, 'tree ' + JSON.stringify(ast).slice(0, 80) + ' → ' + show(got) + ' (expected ' + show(want) + ')');
}
ok(true, 'trees from outside: ' + AST_CASES.length + ' cases (malformed nodes → E_AST, depth → E_DEPTH, size → E_TOO_BIG)');

// ================================================================ 3. the Python twin, once, with every job
const t0 = Date.now();
const py = cp.spawnSync('python3', [PY, '--batch'], { input: JSON.stringify(jobs), maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' });
if (py.status !== 0) { ok(false, 'python3 tools/simexpr.py --batch ran: ' + (py.stderr || py.error)); }
else {
  const pyOut = JSON.parse(py.stdout);
  ok(pyOut.length === jobs.length, 'Python answered all ' + jobs.length + ' jobs in ' + (Date.now() - t0) + ' ms');
  const tally = { corpus: [0, 0], fuzz: [0, 0], fn: [0, 0], tree: [0, 0] };
  for (let i = 0; i < jobs.length; i++) {
    const kind = labels[i].startsWith('corpus') ? 'corpus' : labels[i].startsWith('fuzz tree') || labels[i].startsWith('tree') ? 'tree' : labels[i].startsWith('fuzz') ? 'fuzz' : 'fn';
    tally[kind][1]++;
    if (quiet(deepEq(jsOut[i], pyOut[i]), 'JS and Python differ on ' + labels[i] + '\n    JS ' + show(jsOut[i]).slice(0, 600) + '\n    PY ' + show(pyOut[i]).slice(0, 600))) tally[kind][0]++;
  }
  ok(tally.corpus[0] === tally.corpus[1], 'the twins agree on every corpus case — tree, check, print, value / error with msg (' + tally.corpus.join('/') + ')');
  ok(tally.fuzz[0] === tally.fuzz[1], 'the twins agree on every random expression — tree, check, print, value (' + tally.fuzz.join('/') + ')');
  ok(tally.tree[0] === tally.tree[1], 'the twins agree on every tree given as JSON (' + tally.tree.join('/') + ')');
  ok(tally.fn[0] === tally.fn[1], 'the twins agree bit for bit on every function call (' + tally.fn.join('/') + ', ' + FN_NAMES.length + ' functions)');
  const vals = jsOut.filter((o, i) => labels[i].startsWith('fuzz #') && o.value && !o.value.error);
  ok(vals.length > N_FUZZ / 2, 'the fuzz mostly evaluates (' + vals.length + ' values; the rest are errors such as an unset variable)');
}
// a Python-only path: host functions, check with fns, the error object
{
  const r = cp.spawnSync('python3', ['-c', [
    'import sys; sys.path.insert(0, ' + JSON.stringify(path.join(ROOT, 'tools')) + '); import simexpr as S',
    "assert S.evaluate('noise(x) + 1', {'x': 2}, fns={'noise': lambda v: v * 10}) == 21.0",
    "assert S.check('noise(x)', vars=['x'], fns=['noise']) == []",
    "assert S.check('noise(x)', vars=['x'])[0]['code'] == 'E_UNKNOWN_FN'",
    "e = None\ntry: S.parse('a.b')\nexcept S.ExprError as x: e = x\nassert e.code == 'E_CHAR' and e.pos == 1",
    "e = None\ntry: S.evaluate('x', {'x': 10**400})\nexcept S.ExprError as x: e = x\nassert e.code == 'E_VALUE'",
    "assert S.print_ast(S.parse('2^(3^2)')) == '2^3^2'",
    "print('ok')"].join('\n')], { encoding: 'utf8' });
  ok(r.status === 0 && r.stdout.trim() === 'ok', 'Python: host functions, check(fns=…), ExprError(code, pos), a too-large int is E_VALUE' + (r.status ? ' — ' + r.stderr : ''));
}

// ================================================================ 4. the ports, safety, the API
{
  const r = mulberry32(seed + 1);
  let worst = 0, exact = 0, total = 0;
  const ulps = (a, b) => (same(a, b) ? 0 : !isFinite(a) || !isFinite(b) ? Infinity : Math.abs(a - b) / Math.max(Math.abs(b) * 2 ** -52, 5e-324));
  for (const fn of ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'log2', 'cbrt']) {
    for (let i = 0; i < 3000; i++) {
      const x = fn === 'asin' || fn === 'acos' ? r() * 2 - 1 : (r() - 0.5) * Math.pow(10, Math.floor(r() * 12 - 4));
      const a = X.FUNCS[fn].fn(x), b = Math[fn](x); total++;
      if (same(a, b)) exact++; else worst = Math.max(worst, ulps(a, b));
    }
  }
  for (let i = 0; i < 3000; i++) { const x = r() * 10, y = (r() - 0.5) * 20; const a = X.FUNCS.pow.fn(x, y), b = x ** y; total++; if (same(a, b)) exact++; else worst = Math.max(worst, ulps(a, b)); }
  ok(worst <= 1, 'the fdlibm ports are within 1 ulp of this platform\'s Math (' + exact + '/' + total + ' identical, worst ' + worst.toFixed(2) + ' ulp)');
}
{
  const js = fs.readFileSync(path.join(ROOT, 'engine', 'src', '35_simexpr.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const pysrc = fs.readFileSync(PY, 'utf8');
  ok(!/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|\bsetTimeout\s*\(|\bimport\s*\(|\brequire\s*\(/.test(js), 'the JS twin has no eval, no new Function, no dynamic import');
  ok(!/\b(eval|exec)\s*\(|__import__|\bimportlib\b|\bbuiltins\b/.test(pysrc.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, '')), 'the Python twin has no eval / exec / __import__');
}
{
  Object.prototype.polluted = 7; Object.prototype.evil = () => 1;   // eslint-disable-line no-extend-native
  let e1, e2, e3;
  try { X.evaluate('polluted', {}); } catch (e) { e1 = e.code; }
  try { X.evaluate('evil(1)', {}); } catch (e) { e2 = e.code; }
  try { X.evaluate('x', Object.create({ x: 1 })); } catch (e) { e3 = e.code; }
  delete Object.prototype.polluted; delete Object.prototype.evil;
  ok(e1 === 'E_UNKNOWN_VAR' && e2 === 'E_UNKNOWN_FN' && e3 === 'E_UNKNOWN_VAR', 'only own keys of the env and only the allow-list are reached (a polluted Object.prototype changes nothing)');
}
{
  let code;
  try { X.evaluate('x', 'x=1'); } catch (e) { code = e.code; }
  ok(code === 'E_ENV', 'an env that is not an object is refused (E_ENV)');
  try { X.parse(42); } catch (e) { code = e.code; }
  ok(code === 'E_SOURCE', 'a source that is not a string is refused (E_SOURCE)');
}
{
  const f = X.compile('noise(x) + 1', { fns: { noise: v => v * 10 } });
  ok(f({ x: 2 }) === 21, 'compile(src, {fns}) calls a host function');
  ok(X.check('noise(x)', { vars: ['x'], fns: ['noise'] }).length === 0 && X.check('noise(x)', { vars: ['x'] })[0].code === 'E_UNKNOWN_FN', 'check(src, {fns}) accepts the host functions it is told about');
  let code; try { X.compile('bad(1)', { fns: { bad: () => 'str' } })({}); } catch (e) { code = e.code; }
  ok(code === 'E_VALUE', 'a host function that returns a non-number is E_VALUE');
  code = null; try { X.compile('1', { fns: { __proto__x: () => 1 } }); } catch (e) { code = e.code; }
  ok(code === 'E_FORBIDDEN', 'a host function cannot take a forbidden name');
  const g = X.compile('sin(t) * a');
  ok(same(g({ t: 1, a: 2 }), 2 * X.FUNCS.sin.fn(1)) && same(g({ t: 0, a: 5 }), 0), 'a compiled expression is reusable with new envs');
}
ok(Object.isFrozen(X) && Object.isFrozen(X.FUNCS) && Object.isFrozen(X.FUNCS.sin) && Object.isFrozen(X.LIMITS), 'NoemaExpr, FUNCS and LIMITS are frozen');
ok(X.LIMITS.src === 2000 && X.LIMITS.nodes === 2000 && X.LIMITS.depth === 64 && X.LIMITS.args === 16, 'LIMITS: source 2000, nodes 2000, depth 64, args 16');
ok(FN_NAMES.length === 29 && ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'log2', 'sqrt', 'cbrt', 'abs', 'sign', 'min', 'max', 'floor', 'ceil', 'round', 'trunc', 'pow', 'hypot', 'clamp', 'lerp', 'step'].every(f => FN_NAMES.includes(f)), 'FUNCS is exactly the allow-list (29 functions)');
{
  const big = 'max(' + Array.from({ length: 16 }, () => 'sin(x) * cos(y) + x / (y + 1) - y % 3').join(', ') + ')';
  const f = X.compile(big); const t = Date.now(); for (let i = 0; i < 2000; i++) f({ x: i, y: 2 });
  ok(Date.now() - t < 2000, 'evaluation is bounded and quick (' + big.length + ' chars × 2000 runs in ' + (Date.now() - t) + ' ms)');
}

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
