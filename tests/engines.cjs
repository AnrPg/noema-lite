/* The engine library for the node tests: build/engines-node.cjs (src/engines/node.ts, an entry of tools/esbuild.mjs: the same modules
   and Worker bundles as the app's), every engine loaded. Built first like every generated file (tests/built.js: python3 tools/build.py
   engine, once per process; nothing when tests/run_e2e.sh has built everything, NOEMA_BUILT=1).
     const E = require('./engines.cjs');
     E.lib            the library (NoemaCore.engines in the app): E.lib.loaded('prob@1') → the module, its engine with workerSource
     E.mod(id)        = E.lib.loaded(id) (throws when the id is not an engine)
     E.kernel(name)   expr | core | simkit | space | schema | circuit (the netlist simulator of circuit-mna@1)
     E.core()         globalThis.NoemaCore = { engines: E.lib, content }: what the activity core and the page's scripts read
     E.content()      the content checks (src/features/content: checkPack, checkActivities, checkSimSpec, the rules…), as the app's
                      NoemaCore.content: build/noema-tools.cjs required as a module (with engine/src/38, 44, 45 run in its own scope)
     E.worker(id)     the global of a fresh vm context that ran the engine's Worker bundle: .noemaEngine, and .__noemaShared[key]
                      the shared pieces in it (kernel/simexpr, kernel/core, kernel/simkit, kernel/space, logic/logic, med/med: tools/esbuild.mjs SHARED_PIECES) */
'use strict';
const path = require('path'), vm = require('vm');
const { ensureBuilt } = require('./built');
const ROOT = path.join(__dirname, '..');
ensureBuilt(ROOT, 'engine');
const out = path.join(ROOT, 'build', 'engines-node.cjs');
const B = require(out);
const lib = B.nodeEngines();
let tools = null;
const content = () => (tools = tools || require(path.join(ROOT, 'build', 'noema-tools.cjs'))).checks;
module.exports = {
  lib,
  mod(id) { const m = lib.loaded(id); if (!m) throw new Error('no engine ' + id); return m; },
  kernel(name) { const k = B.KERNELS[name]; if (!k) throw new Error('no kernel ' + name); return k; },
  core() { globalThis.NoemaCore = Object.assign(globalThis.NoemaCore || {}, { engines: lib, content: content() }); return globalThis.NoemaCore; },
  content,
  worker(id) { const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + module.exports.mod(id).engine.workerSource, ctx); return ctx.self; },
  bundlePath: out,
};
