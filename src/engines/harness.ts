/* The composition root of the pages that load the engines as one script: the site and the one-file bundle (engine/engines.js, until
   src/composition/app.ts calls registerEngines itself), the skill's activity harness (skill/noema-pack-builder/scripts/
   activity_harness.js, its page built from the zip's activity_host/noema-engines.js) and the browser tests' own hosts. It puts the
   engine library on the bridge object, window.NoemaCore.engines, beside what is there already. One IIFE file
   (tools/esbuild_engines.mjs buildHarness): an engine's code runs the first time it is loaded. */
import { registerEngines } from './register.ts';

declare global { interface Window { NoemaCore?: object } }
window.NoemaCore = registerEngines(window.NoemaCore ?? {});
