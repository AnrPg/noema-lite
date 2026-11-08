/**
 * The entry of build/runtimes.js (tools/esbuild.mjs, kind "lazy"): the code of every activity runtime (src/runtimes), in one
 * piece the page loads the first time an activity needs a runtime (ACT.runtime(id), src/runtimes/library.ts, wired in
 * src/composition/browser.ts). It hands them over on self.__noemaRuntimesPiece, which the loader reads right after the
 * script has run.
 */
import { RUNTIME_PLUGINS } from '../runtimes/plugins.ts';
import type { RuntimesPiece } from '../runtimes/library.ts';

const piece: RuntimesPiece = Object.freeze({ plugins: RUNTIME_PLUGINS });
(globalThis as { __noemaRuntimesPiece?: RuntimesPiece }).__noemaRuntimesPiece = piece;
