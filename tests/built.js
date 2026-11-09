/* The generated files (engine.js, the UI catalogs, the packs, the registry, build/ …) are never committed: a suite that reads
   them builds them first. ensureBuilt(dir, what) runs, once per process and folder,
     what = 'engine'  python3 tools/build.py engine          the TypeScript bundles + the engine files (about a second)
     what = 'all'     python3 tools/build.py --no-validate   + every pack, language course and the registry (a few seconds)
   tests/run_e2e.sh builds everything once and sets NOEMA_BUILT=1: then nothing runs again.
   linkNodeModules(src, dst): a copy of the repo without node_modules still builds (tools/esbuild.mjs needs esbuild). */
const path = require('path'), cp = require('child_process');
const done = new Set();
function ensureBuilt(dir = path.join(__dirname, '..'), what = 'all') {
  const root = path.resolve(dir), key = root + '|' + what;
  if (process.env.NOEMA_BUILT === '1' || done.has(key) || done.has(root + '|all')) return;
  const args = what === 'engine' ? ['engine'] : ['--no-validate'];
  const r = cp.spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [path.join(root, 'tools', 'build.py'), ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tools/build.py ${args.join(' ')} failed in ${root}:\n${(r.stdout || '').slice(-2000)}${(r.stderr || '').slice(-2000)}`);
  done.add(key);
}
/** a copy of the repo made without node_modules (too big to copy) builds with the original's tools: a link to them */
function linkNodeModules(src, dst) {
  const fs = require('fs'), from = path.join(path.resolve(src), 'node_modules'), to = path.join(dst, 'node_modules');
  if (fs.existsSync(from) && !fs.existsSync(to)) fs.symlinkSync(fs.realpathSync(from), to, 'junction');
}
module.exports = { ensureBuilt, linkNodeModules };
