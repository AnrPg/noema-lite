/* The engine library of a browser page: what the composition roots wire (src/composition/browser.ts puts it on the phase
   bridge as NoemaCore.engines, under the ENGINES token; src/composition/harness.ts does the same for the skill's activity host).
   Every engine of plugins.ts is loaded the first time something needs it (the schema kernel too). Node, where everything is
   needed at once, uses node.ts instead. */
import { createEngineLibrary, type EngineLibrary } from './library.ts';
import { ENGINE_PLUGINS } from './plugins.ts';

/** the library of a page: every engine of plugins.ts, each loaded the first time it is needed */
export function createAppEngines(): EngineLibrary {
  return createEngineLibrary({ plugins: ENGINE_PLUGINS, schema: () => import('./kernel/schema.js').then(m => m.default) });
}

export type { EngineLibrary, LoadReport, LoadFailure } from './library.ts';
