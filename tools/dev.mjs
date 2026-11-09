/* noema-lite — npm run dev: the app on http://localhost:8080, rebuilt and reloaded while you edit.

   1. python3 tools/build.py --no-validate: the generated files the page loads (engine.js, the UI catalogs, the packs, the registry …);
   2. the TypeScript bundles (tools/esbuild.mjs) in watch mode;
   3. a change in engine/src, engine/lang or i18n rebuilds the engine (build.py engine), a change in library/ or accounts/ the
      packs (build.py --no-validate); every rebuild reloads the open page;
   4. serves the repo the way the website is served (tools/serve.mjs).
   Usage: npm run dev [-- --port 8080 --host 127.0.0.1] */
import { spawn } from 'node:child_process';
import { watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { ROOT, watch as esWatch } from './esbuild.mjs';
import { serve } from './serve.mjs';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const py = (...args) => new Promise(resolve => {
  const p = spawn(PY, [path.join(ROOT, 'tools', 'build.py'), ...args, '--no-esbuild'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; p.stdout.on('data', d => { out += d; });
  p.on('close', code => { if (code !== 0) console.error(out.split('\n').slice(-20).join('\n') + `\n✗ tools/build.py ${args.join(' ')} failed (exit ${code})`); resolve(code === 0); });
});

console.log('dev: building the generated files (python3 tools/build.py --no-validate) …');
if (!(await py('--no-validate'))) console.error('dev: the first build failed: the page may miss files (see above)');
const server = await serve(ROOT, { port: Number(arg('port', process.env.PORT || 8080)), host: arg('host', '127.0.0.1'), live: true });

let first = true;
await esWatch((manifest, err) => {
  if (err) { console.error('✗ esbuild: ' + err.message); return; }
  const n = Object.keys(manifest.entries).length;
  if (first) { first = false; console.log(`dev: ${n} TypeScript bundle(s) in build/ (watching src/)`); return; }
  console.log(`dev: rebuilt ${n} bundle(s) · reload`); server.reload();
});

/** the files tools/build.py writes next to the sources (a change there must not start another build) */
const GENERATED = /^(pack\.js|pack\.json|registry\.js|tr\..+\.(js|json)|bridge\..+\.js|course\.(pack|profiles|expl\..+)\.js)$/;

/** a debounced rebuild when files under these folders change */
function rebuildOn(dirs, args, label) {
  let timer = null, running = false, again = false;
  const run = async () => {
    if (running) { again = true; return; }
    running = true; const ok = await py(...args); running = false;
    if (ok) { console.log(`dev: ${label} rebuilt · reload`); server.reload(); }
    if (again) { again = false; void run(); }
  };
  for (const d of dirs) {
    try { fsWatch(path.join(ROOT, d), { recursive: true }, (ev, f) => { if (f && GENERATED.test(path.basename(f))) return; clearTimeout(timer); timer = setTimeout(run, 200); }); }
    catch (e) { console.warn(`dev: not watching ${d} (${e.message})`); }
  }
}
rebuildOn(['engine/src', 'engine/lang', 'i18n'], ['engine'], 'engine');
rebuildOn(['library/subjects', 'library/languages', 'accounts'], ['--no-validate'], 'packs');
console.log(`dev: ${server.url}/  (Ctrl+C to stop)`);
