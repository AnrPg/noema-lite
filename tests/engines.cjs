/* The engine library for the node tests: build/engines-node.cjs (src/engines/node.ts, an entry of tools/esbuild.mjs: the same modules
   and Worker bundles as the app's), every engine loaded. Built first like every generated file (tests/built.js: python3 tools/build.py
   engine, once per process; nothing when tests/run_e2e.sh has built everything, NOEMA_BUILT=1).
     const E = require('./engines.cjs');
     E.lib            the library (NoemaCore.engines in the app): E.lib.loaded('prob@1') → the module, its engine with workerSource
     E.mod(id)        = E.lib.loaded(id) (throws when the id is not an engine)
     E.kernel(name)   expr | core | simkit | space | schema | circuit (the netlist simulator of circuit-mna@1)
     E.core()         globalThis.NoemaCore = { engines: E.lib }: what engine/packcheck.js and the activity core read
     E.worker(id)     the global of a fresh vm context that ran the engine's Worker bundle: .noemaEngine, and .__noemaShared[key]
                      the shared pieces in it (kernel/simexpr.js, kernel/core.js, kernel/simkit.js, kernel/space.js, logic/logic.js, med/med.js) */
'use strict';
const path = require('path'), vm = require('vm');
const { ensureBuilt } = require('./built');
const ROOT = path.join(__dirname, '..');
ensureBuilt(ROOT, 'engine');
const out = path.join(ROOT, 'build', 'engines-node.cjs');
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
