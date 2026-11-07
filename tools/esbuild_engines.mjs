/* The esbuild side of the engine library (src/engines, docs/ARCHITECTURE.md "Microkernel"):

   • noemaWorkers(): the plugin that turns `import src from 'noema-worker:./prob/prob.js#simEngine'` into the Worker bundle of that
     engine as text — the module and what it imports, as one IIFE script that sets self.noemaEngine to the named export. The kernels
     every engine shares (the expression language, the core, the simulation and spatial kernels, logic@1 and med@1, which other
     engines build on) are built once each as their own pieces: a Worker gets the pieces it needs, in order, then its own part, and
     the app's bundle holds each piece's text once. Worker text is minified (whitespace and names only: no syntax rewrites, so every
     operation, and so every double, is the one the source writes — the Python twins agree bit for bit).
   • the bundles of this area: the page's engines (src/engines/harness.ts → one IIFE file: engine/engines.js of the site and the
     one-file bundle, the skill's activity_host/noema-engines.js) and the node bundle of the tests (src/engines/node.ts → CommonJS, tests/engines.cjs loads it).

   • the connector's engines (src/engines/server.ts → one IIFE script for node, every engine in hand: tools/build.py puts it in the
     connector's bundle before engine/packcheck.js).

   CLI (what tools/build.py and the tests call):  node tools/esbuild_engines.mjs --harness <out.js> | --server <out.js> | --node <out.cjs>
   The app's own bundle (src/composition/app.ts, tools/esbuild.mjs) adds noemaWorkers() to its plugins. */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'src', 'engines');
/** the modules built once and shared by the Workers that import them (key = path under src/engines) */
export const SHARED = ['kernel/simexpr.js', 'kernel/simkit.js', 'kernel/core.js', 'kernel/space.js', 'logic/logic.js', 'med/med.js'];
export const TARGET = 'es2022';
const WORKER_OPTS = { bundle: true, format: 'iife', write: false, platform: 'browser', target: TARGET, minifyWhitespace: true, minifyIdentifiers: true, legalComments: 'none', logLevel: 'silent' };

export function noemaWorkers() {
  const keyOf = abs => { const r = path.relative(ENGINES, abs).split(path.sep).join('/'); return SHARED.includes(r) ? r : null; };
  const pieces = new Map();   // key → Promise<{ text, deps }>
  /** a plugin for the inner builds: an import of a shared module (other than `own`) reads it from self.__noemaShared */
  const shim = (own, used) => ({
    name: 'noema-shared-shim',
    setup(b) {
      b.onResolve({ filter: /^\.{1,2}\// }, a => {
        const abs = path.resolve(a.resolveDir, a.path), k = keyOf(abs);
        if (!k || k === own) return undefined;
        used.add(k);
        return { path: k, namespace: 'noema-shared-shim' };
      });
      b.onLoad({ filter: /.*/, namespace: 'noema-shared-shim' }, a => ({ contents: `export default self.__noemaShared[${JSON.stringify(a.path)}];`, loader: 'js' }));
    },
  });
  async function build(contents, own) {
    const used = new Set();
    const r = await esbuild.build({ ...WORKER_OPTS, stdin: { contents, resolveDir: ENGINES, sourcefile: own ? 'shared-piece:' + own : 'worker-part', loader: 'js' }, plugins: [shim(own, used)] });
    return { text: r.outputFiles[0].text, deps: [...used] };
  }
  function piece(k) {
    if (!pieces.has(k)) pieces.set(k, build(`import M from ${JSON.stringify('./' + k)};\n(self.__noemaShared = self.__noemaShared || {})[${JSON.stringify(k)}] = M;\n`, k));
    return pieces.get(k);
  }
  /** the shared pieces a part needs, each after its own dependencies */
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
        const part = await build(`import M from ${JSON.stringify(rel)};\nself.noemaEngine = M[${JSON.stringify(exp)}];\n`, null);
        const ks = await order(part.deps);
        const names = ks.map((_, i) => 's' + i);
        const contents = ks.map((k, i) => `import ${names[i]} from ${JSON.stringify('noema-shared-text:' + k)};\n`).join('')
          + `export default ${[...names, JSON.stringify(part.text)].join(' + ')};\n`;
        return { contents, loader: 'js', resolveDir: ENGINES, watchFiles: [abs] };
      });
      b.onResolve({ filter: /^noema-shared-text:/ }, a => ({ path: a.path.slice('noema-shared-text:'.length), namespace: 'noema-shared-text' }));
      b.onLoad({ filter: /.*/, namespace: 'noema-shared-text' }, async a => ({ contents: `export default ${JSON.stringify((await piece(a.path)).text)};\n`, loader: 'js' }));
    },
  };
}

/** the page's engine bundle: one IIFE file that sets window.NoemaCore.engines (src/engines/harness.ts) — engine/engines.js of the site
    and the one-file bundle, the skill's activity_host/noema-engines.js. Minified like the Worker text: whitespace and names only */
export async function buildHarness(outfile) {
  await esbuild.build({ entryPoints: [path.join(ENGINES, 'harness.ts')], outfile, bundle: true, format: 'iife', platform: 'browser', target: TARGET, plugins: [noemaWorkers()], minifyWhitespace: true, minifyIdentifiers: true, legalComments: 'none', logLevel: 'warning', charset: 'utf8' });
}
/** the connector's engines: one IIFE script (node) that sets globalThis.NoemaCore.engines with every engine in hand (src/engines/server.ts) */
export async function buildServer(outfile) {
  await esbuild.build({ entryPoints: [path.join(ENGINES, 'server.ts')], outfile, bundle: true, format: 'iife', platform: 'node', target: TARGET, plugins: [noemaWorkers()], minifyWhitespace: true, minifyIdentifiers: true, legalComments: 'none', logLevel: 'warning', charset: 'utf8' });
}
/** the node bundle (tests, tools): CommonJS exporting nodeEngines(), KERNELS, IN_HAND (src/engines/node.ts) */
export async function buildNode(outfile) {
  await esbuild.build({ entryPoints: [path.join(ENGINES, 'node.ts')], outfile, bundle: true, format: 'cjs', platform: 'node', target: TARGET, plugins: [noemaWorkers()], legalComments: 'none', logLevel: 'warning', charset: 'utf8' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, out] = process.argv.slice(2);
  const B = { '--harness': buildHarness, '--server': buildServer, '--node': buildNode };
  if (!out || !B[flag]) { console.error('usage: node tools/esbuild_engines.mjs --harness <out.js> | --server <out.js> | --node <out.cjs>'); process.exit(2); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await B[flag](path.resolve(out));
}
