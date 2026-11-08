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
     harness.js    src/composition/harness.ts — window.NoemaCore = { contracts, engines } for a page that is not the app: the
                   skill's activity host (activity_host/noema-core.js) and the test pages that host one activity. Not in the site.
     ui.js         src/composition/ui.ts — the UI foundation of phase 3 (src/ui: the Lit component kit, the router, the frame) on its
                   demo route #/ui-kit. Development only: engine/loader.js loads it for #/ui-kit on a local host; never at start,
                   not in the site or the one-file bundle (kind "dev").
     roadmaps-node.cjs  src/composition/roadmaps-node.ts — the Roadmaps domain and the bridges' lookup, CommonJS, for the node
                   suites that run the older Roadmap files in a vm (tests/roadmaps_core.js). Not in the site.
     engines-node.cjs  src/engines/node.ts — the engine library with every engine in hand, CommonJS, for the node suites
                   (tests/engines.cjs). Not in the site.
     noema-tools.cjs  src/composition/noema-tools.ts — the Node bridge of the Python tools (tools/noema_core.py): the content
                   checks (src/features/content) as a CLI. The skill zip carries it as scripts/noema-tools.cjs. Not in the site.
     engine/tokens.css  the design tokens (src/ui/tokens, tools/tokens.mjs), written next to engine.css on every build.
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

   The engine library (src/engines) is in build/app.js: every engine is a plugin whose code esbuild wraps in a lazy initialiser
   (it runs the first time NoemaCore.engines.load() asks for it) and whose Worker bundle is a string (noemaWorkers below), so
   the page parses it but runs none of it at start (docs/ARCHITECTURE.md "Engines in the app bundle").

   Minification is whitespace and names only, never syntax (minifySyntax): it would rewrite arithmetic (constant folding,
   reordered operands), and the engines must compute every double exactly as their source writes it (the golden outputs of
   tests/fixtures/parity hold them to their numbers bit for bit).

   Every bundle has a size budget (KB, minified) and the build FAILS when one is exceeded: raise a budget only on purpose.

   Usage: node tools/esbuild.mjs [--quiet]     (npm run build; npm run dev rebuilds with watch()) */
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTokensCss } from './tokens.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'build');
const BROWSERS = ['chrome111', 'edge111', 'firefox114', 'safari16.4'];   // Baseline 2023: the oldest browsers the site supports

/** kind: page = a script of the site and the one-file bundle; worker = a Worker of the app; sw = the service worker;
    harness = a browser script for pages other than the app (not in the site); dev = a browser script the development pages load
    on demand (not in the site or the one-file bundle); node = a bundle for Node (format esm | cjs)
    @typedef {{ name: string, in: string, kind: 'page' | 'worker' | 'sw' | 'harness' | 'dev' | 'node', out: string, budgetKB: number, format?: 'esm' | 'cjs' }} Entry */
/** @type {Entry[]} the bundles (the one place that names them) */
export const ENTRIES = [
  { name: 'app', in: 'src/composition/app.ts', kind: 'page', out: 'app.js', budgetKB: 5632 },   // 1.7 MB the core (with the phase-2 domain: study, sync, roadmaps, community), the contracts + 3.6 MB the engine library (1.8 code, 1.8 Worker text)
  { name: 'pwa', in: 'src/composition/pwa.ts', kind: 'page', out: 'pwa.js', budgetKB: 16 },
  { name: 'worker', in: 'src/composition/worker.ts', kind: 'worker', out: 'worker.js', budgetKB: 600 },
  { name: 'sw', in: 'src/composition/sw.ts', kind: 'sw', out: 'sw.js', budgetKB: 24 },
  { name: 'harness', in: 'src/composition/harness.ts', kind: 'harness', out: 'harness.js', budgetKB: 5632 },   // the contracts + the engine library
  { name: 'ui', in: 'src/composition/ui.ts', kind: 'dev', out: 'ui.js', budgetKB: 256 },   // Lit + the kit + its demo; loaded only on #/ui-kit
  { name: 'engines-node', in: 'src/engines/node.ts', kind: 'node', format: 'cjs', out: 'engines-node.cjs', budgetKB: 4096 },
  { name: 'noema-tools', in: 'src/composition/noema-tools.ts', kind: 'node', format: 'cjs', out: 'noema-tools.cjs', budgetKB: 5632 },   // the engine library + the content checks + engine/src/38, 44, 45
  { name: 'roadmaps-node', in: 'src/composition/roadmaps-node.ts', kind: 'node', format: 'cjs', out: 'roadmaps-node.cjs', budgetKB: 256 },
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

/** whitespace and names only, never syntax (the engines' arithmetic stays exactly as written: see the header) */
const MINIFY = { minifyWhitespace: true, minifyIdentifiers: true, minifySyntax: false };
const ENGINES = path.join(ROOT, 'src', 'engines');
/** the modules of src/engines built once as their own piece and shared by the Worker bundles that import them */
export const SHARED_PIECES = ['kernel/simexpr.js', 'kernel/simkit.js', 'kernel/core.js', 'kernel/space.js', 'logic/logic.js', 'med/med.js'];

/** The esbuild plugin of the engines' Worker bundles (src/engines/plugins.ts, node.ts):
    `import src from 'noema-worker:./prob/prob.js#simEngine'` is the Worker bundle of that engine as TEXT — the module and what
    it imports, as one IIFE script that sets self.noemaEngine to the named export. The kernels several engines share
    (SHARED_PIECES) are built once each as a piece that sets self.__noemaShared[<path>]: a Worker's text is the pieces it needs,
    each after its own dependencies, then its own part, and a bundle holds each piece's text once. One instance per build()
    keeps the pieces for every entry of that build (the app, the harness, the node bundle and the connector). */
export function noemaWorkers() {
  const keyOf = abs => { const r = path.relative(ENGINES, abs).split(path.sep).join('/'); return SHARED_PIECES.includes(r) ? r : null; };
  const pieces = new Map();   // key → Promise<{ text, deps }>
  /** an import of a shared module (other than the piece being built) reads it from self.__noemaShared */
  const shared = (own, used) => ({
    name: 'noema-shared',
    setup(b) {
      b.onResolve({ filter: /^\.{1,2}\// }, a => {
        const k = keyOf(path.resolve(a.resolveDir, a.path));
        if (!k || k === own) return undefined;
        used.add(k);
        return { path: k, namespace: 'noema-shared' };
      });
      b.onLoad({ filter: /.*/, namespace: 'noema-shared' }, a => ({ contents: `export default self.__noemaShared[${JSON.stringify(a.path)}];`, loader: 'js' }));
    },
  });
  async function text(contents, own) {
    const used = new Set();
    const r = await esbuild.build({ ...MINIFY, bundle: true, format: 'iife', write: false, platform: 'browser', target: BROWSERS, legalComments: 'none', logLevel: 'silent',
      stdin: { contents, resolveDir: ENGINES, sourcefile: own ? 'shared-piece:' + own : 'worker-part', loader: 'js' }, plugins: [shared(own, used)] });
    return { text: r.outputFiles[0].text, deps: [...used] };
  }
  const piece = k => {
    if (!pieces.has(k)) pieces.set(k, text(`import M from ${JSON.stringify('./' + k)};\n(self.__noemaShared = self.__noemaShared || {})[${JSON.stringify(k)}] = M;\n`, k));
    return pieces.get(k);
  };
  async function order(deps, out = [], seen = new Set()) {
    for (const k of deps) {
      if (seen.has(k)) continue;
      seen.add(k);
      await order((await piece(k)).deps, out, seen);
      out.push(k);
    }
    return out;
  }
  return {
    name: 'noema-workers',
    setup(b) {
      b.onResolve({ filter: /^noema-worker:/ }, a => {
        const [mod, exp] = a.path.slice('noema-worker:'.length).split('#');
        if (!mod || !exp || !/^[A-Za-z_$][\w$]*$/.test(exp)) return { errors: [{ text: `noema-worker: "${a.path}" must be <module>#<export>` }] };
        return { path: path.resolve(a.resolveDir, mod) + '#' + exp, namespace: 'noema-worker' };
      });
      b.onLoad({ filter: /.*/, namespace: 'noema-worker' }, async a => {
        const [abs, exp] = a.path.split('#'), rel = './' + path.relative(ENGINES, abs).split(path.sep).join('/');
        const part = await text(`import M from ${JSON.stringify(rel)};\nself.noemaEngine = M[${JSON.stringify(exp)}];\n`, null);
        const ks = await order(part.deps), names = ks.map((_, i) => 's' + i);
        const contents = ks.map((k, i) => `import ${names[i]} from ${JSON.stringify('noema-shared-text:' + k)};\n`).join('')
          + `export default ${[...names, JSON.stringify(part.text)].join(' + ')};\n`;
        return { contents, loader: 'js', resolveDir: ENGINES, watchFiles: [abs] };
      });
      b.onResolve({ filter: /^noema-shared-text:/ }, a => ({ path: a.path.slice('noema-shared-text:'.length), namespace: 'noema-shared-text' }));
      b.onLoad({ filter: /.*/, namespace: 'noema-shared-text' }, async a => ({ contents: `export default ${JSON.stringify((await piece(a.path)).text)};\n`, loader: 'js' }));
    },
  };
}

/** The esbuild plugin of `legacy:<path>` imports: the TEXT of that file of the repository (one of the app's engine/*.js
    scripts, run by src/connector/engine/legacy.ts in a scope of its own: one copy, the app's own file). The connector
    (tools/connector_bundle.mjs) and the Node tools (src/composition/noema-tools.ts) use it. */
export function legacyText(root = ROOT) {
  return {
    name: 'noema-legacy',
    setup(build) {
      build.onResolve({ filter: /^legacy:/ }, a => {
        const abs = path.resolve(root, a.path.slice('legacy:'.length));
        if (!abs.startsWith(root + path.sep)) return { errors: [{ text: `legacy import outside the repository: ${a.path}` }] };
        return { path: abs, namespace: 'legacy' };
      });
      build.onLoad({ filter: /.*/, namespace: 'legacy' }, a => ({ contents: 'export default ' + JSON.stringify(readFileSync(a.path, 'utf8')) + ';\n', loader: 'js', watchFiles: [a.path] }));
    },
  };
}

/** esbuild options of one entry */
function options(e, workers) {
  const common = {
    entryPoints: [path.join(ROOT, e.in)], outfile: path.join(OUT, e.out), bundle: true, ...MINIFY, sourcemap: 'linked',
    metafile: true, legalComments: 'eof', charset: 'utf8', logLevel: 'silent', tsconfig: path.join(ROOT, 'tsconfig.json'), plugins: [workers, legacyText()],
  };
  if (e.kind === 'node') {
    const format = e.format ?? 'esm';
    return { ...common, platform: 'node', format, target: 'node22', packages: 'bundle',
      ...(format === 'esm' ? { banner: { js: "import { createRequire as __noemaRequire } from 'node:module'; const require = __noemaRequire(import.meta.url);" } } : {}) };
  }
  return { ...common, platform: 'browser', format: 'iife', target: BROWSERS };
}

const kb = n => Math.round(n / 102.4) / 10;

/** Builds every present entry. → the manifest { hash, entries: { name: { file, map, bytes, gzip, budgetKB, kind } }, skipped } */
export async function build({ quiet = false } = {}) {
  const { present, skipped } = entries();
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  const meta = { inputs: {}, outputs: {} }, manifest = { format: 'noema.build-manifest/v1', hash: '', entries: {}, skipped: skipped.map(e => e.in) };
  const over = [], h = createHash('sha256');
  const workers = noemaWorkers();
  const tokens = writeTokensCss();   // engine/tokens.css (the page links it beside engine.css)
  const results = await Promise.all(present.map(e => esbuild.build(options(e, workers)).then(r => ({ e, r }), err => ({ e, err }))));
  await tokens;
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
