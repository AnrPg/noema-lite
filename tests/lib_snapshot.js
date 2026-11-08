/* The regression net of the engine library (docs/INTERACTIVE_LIBRARY.md): every engine's outputs on every good spec of its fixtures
   (tests/fixtures/enginelib/<name>.json) and on its reference activities (tools/activities_examples/*), at the defaults and at a few
   seeds, are recorded in tests/fixtures/enginelib/snapshots/<name>.json. When an engine is changed (e.g. to call the simulation kernel
   kernel/simkit.js instead of its own integrator) the outputs must stay the same: bit for bit, or — where an engine documents a better
   method — within the tolerance named in the snapshot's "tol" (relative), changed only on purpose with --update and a reason.
   Usage: node tests/lib_snapshot.js [--update [engine…]] [engine…]   (with no names: every engine whose module and fixtures exist) */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), FIX = path.join(ROOT, 'tests', 'fixtures', 'enginelib'), SNAP = path.join(FIX, 'snapshots');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaEngineCatalog = ENGINES.lib.catalog;
const K = NoemaEngineCatalog, PC = ENGINES.content(), X = NoemaExpr;
const args = process.argv.slice(2), UPDATE = args.includes('--update'), only = args.filter(a => !a.startsWith('--'));
const SEEDS = [1, 7, 20251105];
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };

/** the inputs at the defaults: consts, params' defaults, then the derived values in order (as the app computes them) */
function inputs(spec) {
  const env = {};
  for (const [k, v] of Object.entries(spec.consts || {})) env[k] = v;
  for (const p of spec.params || []) env[p.id] = p.kind === 'toggle' ? !!p.default : p.default;
  for (const d of spec.derived || []) { try { env[d.id] = X.compile(d.expr)(env); } catch (e) { env[d.id] = NaN; } }
  return env;
}
/** a value made comparable: numbers kept exactly (NaN, ±Infinity spelled out), arrays and objects walked */
const canon = v => typeof v === 'number' ? (Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : Object.is(v, -0) ? 0 : v)
  : Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
function close(a, b, tol, where, diffs) {
  if (typeof a === 'number' && typeof b === 'number') { if (a === b || (tol > 0 && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)))) return; diffs.push(`${where}: ${a} → ${b}`); return; }
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) { diffs.push(`${where}: length ${a.length} → ${b.length}`); return; } a.forEach((x, i) => close(x, b[i], tol, `${where}[${i}]`, diffs)); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) close(a[k], b[k], tol, `${where}.${k}`, diffs); return; }
  if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${where}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}

const EX = path.join(ROOT, 'tools', 'activities_examples');
const refs = fs.readdirSync(EX).filter(d => fs.existsSync(path.join(EX, d, 'spec.json'))).map(d => ({ name: 'example:' + d, spec: JSON.parse(fs.readFileSync(path.join(EX, d, 'spec.json'), 'utf8')) }));
fs.mkdirSync(SNAP, { recursive: true });
for (const e of K.CATALOG.filter(x => x.layer === 'library' && x.plugin)) {
  const slug = e.slug;
  if (only.length && !only.includes(slug) && !only.includes(e.id)) continue;
  const M = ENGINES.lib.loaded(e.id);
  if (!M || !M.simEngine || !fs.existsSync(path.join(FIX, slug + '.json'))) { console.log(`· ${e.id}: not built yet`); continue; }
  const fx = JSON.parse(fs.readFileSync(path.join(FIX, slug + '.json'), 'utf8')).specs || [];
  const cases = [...fx.map((s, i) => ({ name: 'fixture:' + i, spec: s })), ...refs.filter(r => r.spec.engine === e.id)]
    .filter(c => c.spec && c.spec.engine === e.id && !PC.checkSimSpec(c.spec, null).length);
  const now = {};
  for (const c of cases) for (const seed of SEEDS) {
    let out; try { out = canon(M.simEngine.create(c.spec, { seed }).run(inputs(c.spec))); } catch (err) { out = { thrown: String(err && err.message || err).slice(0, 200) }; }
    now[`${c.name}#${seed}`] = out;
  }
  const file = path.join(SNAP, slug + '.json');
  if (UPDATE || !fs.existsSync(file)) {
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    fs.writeFileSync(file, JSON.stringify({ engine: e.id, tol: old.tol || 0, note: old.note || 'outputs at the defaults and seeds 1, 7, 20251105 (tests/lib_snapshot.js)', runs: now }) + '\n');
    console.log(`↻ ${e.id}: ${Object.keys(now).length} runs recorded in tests/fixtures/enginelib/snapshots/${slug}.json`);
    continue;
  }
  const snap = JSON.parse(fs.readFileSync(file, 'utf8')), diffs = [];
  for (const k of new Set([...Object.keys(snap.runs), ...Object.keys(now)])) {
    if (!(k in now)) { diffs.push(`${k}: gone`); continue; }
    if (!(k in snap.runs)) continue;   // a new fixture or example: recorded with --update
    close(snap.runs[k], now[k], snap.tol || 0, k, diffs);
  }
  ok(!diffs.length, `${e.id}: ${Object.keys(now).length} runs give the recorded outputs${snap.tol ? ` (within ${snap.tol})` : ' (bit for bit)'}` + (diffs.length ? `\n    ${diffs.slice(0, 6).join('\n    ')}${diffs.length > 6 ? `\n    … ${diffs.length - 6} more` : ''}` : ''));
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
