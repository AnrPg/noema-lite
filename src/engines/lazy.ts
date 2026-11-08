/* The engine library of the app's page without the engines' code (src/composition/browser.ts): the expression language,
   the catalogue and every engine's manifest are there at once; the code of all engines, their Worker bundles and the schema
   kernel come in one piece (build/engines.js, src/composition/engines.ts) the first time anything asks for one of them, so
   the start of the app never downloads or parses them. */
import { createEngineLibrary, type EngineLibrary } from './library.ts';
import { ENGINE_MANIFESTS } from './manifests.ts';
import type { EnginePlugin, SchemaApi } from './types.ts';

/** what the piece of the engines' code hands the page */
export interface EnginesPiece {
  readonly plugins: readonly EnginePlugin[];
  schema(): Promise<SchemaApi>;
}

/** Every engine as a plugin whose entry and Worker bundle load the piece (once) and then take the real plugin's. */
export function lazyPlugins(load: () => Promise<EnginesPiece>): readonly EnginePlugin[] {
  let piece: Promise<EnginesPiece> | null = null;
  const once = (): Promise<EnginesPiece> =>
    (piece ??= load().catch((e: unknown) => {
      piece = null; // a failed load may be tried again
      throw e;
    }));
  const real = async (id: string): Promise<EnginePlugin> => {
    const p = (await once()).plugins.find(x => x.manifest.id === id);
    if (!p) throw new Error(`build/engines.js has no engine ${id}`);
    return p;
  };
  return Object.freeze(
    ENGINE_MANIFESTS.map(m =>
      Object.freeze({
        manifest: m,
        entry: async () => (await real(m.id)).entry(),
        worker: async () => (await real(m.id)).worker(),
      }),
    ),
  );
}

/** the library of the app's page, its engines' code loaded by `load` when first needed */
export function createLazyEngines(load: () => Promise<EnginesPiece>): EngineLibrary {
  const plugins = lazyPlugins(load);
  return createEngineLibrary({ plugins, schema: () => load().then(p => p.schema()) });
}
