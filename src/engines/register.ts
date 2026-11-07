/* The engines in a composition root (src/composition/app.ts, the activity harness): one call puts the engine library on the bridge
   object, window.NoemaCore.engines, where the old UI (engine/src/*.js, engine/packcheck.js, engine/activity_author.js) reaches it. */
import { createEngineLibrary, type EngineLibrary } from './library.ts';
import { ENGINE_PLUGINS } from './plugins.ts';

/** the library of the app: every engine of plugins.ts, each loaded the first time it is needed (the schema kernel too) */
export function createAppEngines(): EngineLibrary {
  return createEngineLibrary({ plugins: ENGINE_PLUGINS, schema: () => import('./kernel/schema.js').then(m => m.default) });
}

/** container.engines = the library; → the container (the composition root keeps building it) */
export function registerEngines<T extends object>(container: T): T & { readonly engines: EngineLibrary } {
  return Object.assign(container, { engines: createAppEngines() });
}

export type { EngineLibrary, LoadReport, LoadFailure } from './library.ts';
