/* noema-lite — the content checks of a composition root: createContentChecks (src/features/content) with the engine library
   and the activity runtimes' own checkers of that root. Every root hands them in its own way: the app and the activity host
   read the runtimes from the page (engine/src/38_activity_h5p.js, 44_activity_wasm.js, 45_activity_embed.js load after the
   core, so they are looked up when a check runs), the connector and the Node tools from the scope that ran those files. */
import { createContentChecks, type ContentChecks } from '../features/content/application/index.ts';
import type { CheckEnv, EmbedChecks, EngineChecks, H5PChecks, WasmChecks } from '../features/content/domain/env.ts';
import type { EngineLibrary } from '../engines/library.ts';

/** where the activity runtimes publish their checkers (NoemaWasm, NoemaEmbed, NoemaH5P) */
export type RuntimeHost = () => Readonly<Record<string, unknown>>;

const pick = (host: RuntimeHost, name: string): unknown => host()[name] ?? null;

/** the CheckEnv of a root: the library's expression language and loaded engines, the runtimes' checkers as they are now */
export function contentEnv(engines: EngineLibrary, host: RuntimeHost): CheckEnv {
  return {
    expr: engines.expr,
    engine: (id: string): EngineChecks | null => engines.loaded(id),
    get wasm() {
      return pick(host, 'NoemaWasm') as WasmChecks | null;
    },
    get embed() {
      return pick(host, 'NoemaEmbed') as EmbedChecks | null;
    },
    get h5p() {
      return pick(host, 'NoemaH5P') as H5PChecks | null;
    },
  };
}

export const contentChecks = (engines: EngineLibrary, host: RuntimeHost): ContentChecks => createContentChecks(contentEnv(engines, host));
