/* The engine library for the node tests: src/engines/node.ts bundled by tools/esbuild_engines.mjs (the same modules and Worker bundles
   as the app's), every engine loaded. Built once per change of src/engines or the build script (cached in the OS temp folder).
     const E = require('./engines.cjs');
     E.lib            the library (NoemaCore.engines in the app): E.lib.loaded('prob@1') → the module, its engine with workerSource
     E.mod(id)        = E.lib.loaded(id) (throws when the id is not an engine)
     E.kernel(name)   expr | core | simkit | space | schema | circuit (the netlist simulator of circuit-mna@1)
     E.core()         globalThis.NoemaCore = { engines: E.lib }: what engine/packcheck.js and the activity core read
     E.worker(id)     the global of a fresh vm context that ran the engine's Worker bundle: .noemaEngine, and .__noemaShared[key]
                      the shared pieces in it (kernel/simexpr.js, kernel/core.js, kernel/simkit.js, kernel/space.js, logic/logic.js, med/med.js) */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function stamp() {
  const h = crypto.createHash('sha256'), walk = d => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f), s = fs.statSync(p); if (s.isDirectory()) walk(p); else h.update(p + ':' + s.size + ':' + s.mtimeMs + '\n'); } };
  walk(path.join(ROOT, 'src', 'engines')); walk(path.join(ROOT, 'src', 'plugins'));
  for (const f of ['tools/esbuild_engines.mjs', 'package-lock.json']) { const p = path.join(ROOT, f); if (fs.existsSync(p)) { const s = fs.statSync(p); h.update(f + ':' + s.size + ':' + s.mtimeMs); } }
  return h.digest('hex').slice(0, 16);
}
const out = path.join(os.tmpdir(), `noema-engines-node-${stamp()}.cjs`);
if (!fs.existsSync(out)) {
  const tmp = out + '.' + process.pid + '.tmp';
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'esbuild_engines.mjs'), '--node', tmp], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  fs.renameSync(tmp, out);   // atomic: suites started together never read a half-written bundle
}
const B = require(out);
const lib = B.nodeEngines();
module.exports = {
  lib,
  mod(id) { const m = lib.loaded(id); if (!m) throw new Error('no engine ' + id); return m; },
  kernel(name) { const k = B.KERNELS[name]; if (!k) throw new Error('no kernel ' + name); return k; },
  core() { globalThis.NoemaCore = Object.assign(globalThis.NoemaCore || {}, { engines: lib }); return globalThis.NoemaCore; },
  worker(id) { const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + module.exports.mod(id).engine.workerSource, ctx); return ctx.self; },
  bundlePath: out,
};
