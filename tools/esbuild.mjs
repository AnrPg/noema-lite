/* noema-lite — the TypeScript build (npm run build): every bundle of src/ with esbuild, into build/ (git-ignored).

   THE ENTRY LIST lives here and only here (ENTRIES below, plus every src/**\/*.worker.ts found on disk). An entry whose source
   file does not exist yet is skipped with a notice, never an error: helpers add their composition roots over time.

   Output (build/):
     app.js        src/composition/app.ts — the page's core. A classic IIFE script: it runs synchronously, in order, before the
                   older engine/*.js scripts, and sets window.NoemaCore (the phase bridge, deleted in phase 3).
     pwa.js        src/composition/pwa.ts — registers the service worker and shows "update ready" (the site only).
     worker.js     src/composition/worker.ts and every <name>.worker.ts — one self-contained IIFE per Worker.
     sw.js         src/composition/sw.ts — the ONE service worker (app shell + Python files). tools/build.py writes the site's
                   /sw.js from it, with the precache list and the build hash in front.
     (the Claude connector, src/composition/connector.ts, is bundled by tools/connector_bundle.mjs: it needs the data
      tools/build.py collects, so build.py runs it → dist/functions/mcp.mjs)
     *.map         source maps (linked); meta.json (esbuild's metafile); manifest.json (what was built, sizes, the build hash).

   Why IIFE and no code splitting for the browser bundles: the app bundle must run synchronously before the older scripts
   (a module script is deferred, so window.NoemaCore would not exist yet when engine/loader.js starts), and the one-file
   offline bundle (dist/noema-lite.html, opened from file://) cannot fetch chunk files: module scripts and import() of
   files do not load from file://. esbuild bundles every import() of a string literal INTO the IIFE (it resolves to a
   promise of the module, as with splitting), so engine code may already use import() for lazy parts: the day the app
   becomes an ES module (phase 3, no bridge, no file://), turning on `splitting` here makes those imports real chunks
   without a change in src/. Workers are IIFEs for the same reason: the one-file bundle starts them from a Blob of their
   text (<script type="text/plain" id="noema-worker:<name>">).
   (The connector stays one ESM file: Netlify treats every top-level file of the functions directory as a function.)

   Every bundle has a size budget (KB, minified) and the build FAILS when one is exceeded: raise a budget only on purpose.

   Usage: node tools/esbuild.mjs [--quiet]     (npm run build; npm run dev rebuilds with watch()) */
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'build');
const BROWSERS = ['chrome111', 'edge111', 'firefox114', 'safari16.4'];   // Baseline 2023: the oldest browsers the site supports

/** @typedef {{ name: string, in: string, kind: 'page' | 'worker' | 'sw' | 'node', out: string, budgetKB: number }} Entry */
/** @type {Entry[]} the bundles (the one place that names them) */
export const ENTRIES = [
  { name: 'app', in: 'src/composition/app.ts', kind: 'page', out: 'app.js', budgetKB: 900 },
  { name: 'pwa', in: 'src/composition/pwa.ts', kind: 'page', out: 'pwa.js', budgetKB: 16 },
  { name: 'worker', in: 'src/composition/worker.ts', kind: 'worker', out: 'worker.js', budgetKB: 600 },
  { name: 'sw', in: 'src/composition/sw.ts', kind: 'sw', out: 'sw.js', budgetKB: 24 },
];
const WORKER_BUDGET_KB = 600;   // each src/**/<name>.worker.ts

/** every <name>.worker.ts under src/ (a Worker entry of its own: build/<name>.worker.js) */
function workerEntries() {
  const out = [], walk = dir => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith('.worker.ts')) out.push(p);
    }
  };
  if (existsSync(path.join(ROOT, 'src'))) walk(path.join(ROOT, 'src'));
  return out.sort().map(p => {
    const name = path.basename(p, '.ts');
    return /** @type {Entry} */ ({ name, in: path.relative(ROOT, p).split(path.sep).join('/'), kind: 'worker', out: name + '.js', budgetKB: WORKER_BUDGET_KB });
  });
}

/** the entries whose source exists now; the others are listed as skipped */
export function entries() {
  const all = [...ENTRIES, ...workerEntries()];
  const names = new Set();
  for (const e of all) { if (names.has(e.name)) throw new Error(`two bundles are named ${e.name}`); names.add(e.name); }
  return { present: all.filter(e => existsSync(path.join(ROOT, e.in))), skipped: all.filter(e => !existsSync(path.join(ROOT, e.in))) };
}

/** esbuild options of one entry */
function options(e) {
  const common = {
    entryPoints: [path.join(ROOT, e.in)], outfile: path.join(OUT, e.out), bundle: true, minify: true, sourcemap: 'linked',
    metafile: true, legalComments: 'eof', charset: 'utf8', logLevel: 'silent', tsconfig: path.join(ROOT, 'tsconfig.json'),
  };
  if (e.kind === 'node') return { ...common, platform: 'node', format: 'esm', target: 'node22', packages: 'bundle',
    banner: { js: "import { createRequire as __noemaRequire } from 'node:module'; const require = __noemaRequire(import.meta.url);" } };
  return { ...common, platform: 'browser', format: 'iife', target: BROWSERS };
}

const kb = n => Math.round(n / 102.4) / 10;

/** Builds every present entry. → the manifest { hash, entries: { name: { file, map, bytes, gzip, budgetKB, kind } }, skipped } */
export async function build({ quiet = false } = {}) {
  const { present, skipped } = entries();
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  const meta = { inputs: {}, outputs: {} }, manifest = { format: 'noema.build-manifest/v1', hash: '', entries: {}, skipped: skipped.map(e => e.in) };
  const over = [], h = createHash('sha256');
  const results = await Promise.all(present.map(e => esbuild.build(options(e)).then(r => ({ e, r }), err => ({ e, err }))));
  const failed = results.filter(x => x.err);
  if (failed.length) throw new Error(failed.map(x => `${x.e.in}:\n${(x.err.errors || []).map(m => '  ' + (m.location ? `${m.location.file}:${m.location.line}: ` : '') + m.text).join('\n') || x.err.message}`).join('\n'));
  for (const { e, r } of results) {
    Object.assign(meta.inputs, r.metafile.inputs); Object.assign(meta.outputs, r.metafile.outputs);
    const body = readFileSync(path.join(OUT, e.out)), gz = gzipSync(body).length;
    h.update(e.name).update(body);
    manifest.entries[e.name] = { file: e.out, map: e.out + '.map', kind: e.kind, source: e.in, bytes: body.length, gzip: gz, budgetKB: e.budgetKB };
    if (body.length > e.budgetKB * 1024) over.push(`${e.out}: ${kb(body.length)} KB > budget ${e.budgetKB} KB (tools/esbuild.mjs ENTRIES)`);
    if (r.warnings.length && !quiet) for (const w of r.warnings) console.warn(`  ⚠ ${e.in}: ${w.text}`);
  }
  manifest.hash = h.digest('hex').slice(0, 16);
  writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  if (!quiet) {
    for (const [n, x] of Object.entries(manifest.entries)) console.log(`esbuild: ${x.file.padEnd(16)} ${String(kb(x.bytes)).padStart(7)} KB (gzip ${kb(x.gzip)} KB, budget ${x.budgetKB} KB)  ← ${x.source}${n === 'app' ? ' · window.NoemaCore' : ''}`);
    for (const s of skipped) console.log(`esbuild: (not yet in the tree, skipped) ${s.in}`);
  }
  if (over.length) throw new Error('size budget exceeded:\n  ' + over.join('\n  '));
  return manifest;
}

/** watch mode for npm run dev: rebuilds on every change, calls onBuild(manifest | null, error | null) */
export async function watch(onBuild) {
  let timer = null;
  const run = () => build({ quiet: true }).then(m => onBuild(m, null), err => onBuild(null, err));
  const { watch: fsWatch } = await import('node:fs');
  fsWatch(path.join(ROOT, 'src'), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  await run();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quiet = process.argv.includes('--quiet');
  build({ quiet }).catch(err => { console.error('✗ esbuild: ' + (err && err.message ? err.message : String(err))); process.exit(1); });
}
