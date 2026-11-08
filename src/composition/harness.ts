/**
 * THE ACTIVITY HOST ROOT (build/harness.js, an IIFE; tools/esbuild.mjs): the composition root of the pages that host one
 * activity without the app — the skill's activity harness (skill/noema-pack-builder/scripts/activity_harness.js, which inlines
 * the zip's activity_host/noema-core.js) and the test pages that do the same (tests/activities_wasm.js). It publishes
 * window.NoemaCore with what the activity runtimes read there: the data contracts, the engine library, the content checks
 * (src/features/content: the spec checks of sim-spec@1) and the typed activity runtimes (src/runtimes, their code inline), the
 * same modules as build/app.js gives the app. It is never loaded beside build/app.js (that page has its own NoemaCore).
 */
import * as contracts from '../contracts/index.ts';
import { createAppEngines } from '../engines/register.ts';
import { contentChecks, scopeCheckers } from '../features/content/application/index.ts';
import { RUNTIME_CHECKS } from '../runtimes/checks.ts';
import { createRuntimeLibrary } from '../runtimes/library.ts';
import { RUNTIME_PLUGINS } from '../runtimes/plugins.ts';

const page = globalThis as { NoemaCore?: unknown };
if (!page.NoemaCore) {
  const engines = createAppEngines();
  Object.defineProperty(page, 'NoemaCore', {
    value: Object.freeze({
      version: 1,
      contracts,
      engines,
      content: contentChecks(
        engines,
        scopeCheckers(() => globalThis as unknown as Readonly<Record<string, unknown>>, RUNTIME_CHECKS),
      ),
      runtimes: createRuntimeLibrary(RUNTIME_PLUGINS, () => RUNTIME_CHECKS),
    }),
    writable: false,
    enumerable: false,
    configurable: false,
  });
}
