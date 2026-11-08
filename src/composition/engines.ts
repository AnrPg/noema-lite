/**
 * The entry of build/engines.js (tools/esbuild.mjs, kind "lazy"): the code of every engine of sim-spec@1, their Worker
 * bundles (as text) and the schema kernel, in one piece the page loads the first time an activity, a check or the author
 * needs an engine (src/engines/lazy.ts, wired in src/composition/browser.ts). It hands them over on
 * self.__noemaEnginesPiece, which the loader reads right after the script has run. The only module with a side effect on
 * import.
 */
import { ENGINE_PLUGINS } from '../engines/plugins.ts';
import type { EnginesPiece } from '../engines/lazy.ts';

const piece: EnginesPiece = Object.freeze({
  plugins: ENGINE_PLUGINS,
  schema: () => import('../engines/kernel/schema.js').then(m => m.default),
});
(globalThis as { __noemaEnginesPiece?: EnginesPiece }).__noemaEnginesPiece = piece;
