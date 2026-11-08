/**
 * THE ACTIVITY HOST ROOT (build/harness.js, an IIFE; tools/esbuild.mjs): the composition root of the pages that host one
 * activity without the app — the skill's activity harness (skill/noema-pack-builder/scripts/activity_harness.js, which inlines
 * the zip's activity_host/noema-core.js) and the test pages that do the same (tests/activities_wasm.js). It publishes
 * window.NoemaCore with what the activity runtimes and engine/packcheck.js read there: the data contracts and the engine library,
 * the same modules as build/app.js gives the app. It is never loaded beside build/app.js (that page has its own NoemaCore).
 */
import * as contracts from '../contracts/index.ts';
import { createAppEngines } from '../engines/register.ts';

const page = globalThis as { NoemaCore?: unknown };
if (!page.NoemaCore) {
  Object.defineProperty(page, 'NoemaCore', {
    value: Object.freeze({ version: 1, contracts, engines: createAppEngines() }),
    writable: false,
    enumerable: false,
    configurable: false,
  });
}
