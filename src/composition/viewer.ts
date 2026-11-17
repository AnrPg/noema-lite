/**
 * The entry of build/viewer.js (tools/esbuild.mjs, kind "lazy", on build/ui.js's shared Lit): 👁 the file viewer. NoemaCore.viewer
 * (src/composition/viewer-door.ts) runs it the first time a file is opened or read; the one-file bundle keeps it as text. The
 * only module with a side effect on import; tests import viewer-root.ts instead.
 */
import { VIEWER_PIECE_KEY } from './viewer-door.ts';
import { viewerPiece } from './viewer-root.ts';

(globalThis as Record<string, unknown>)[VIEWER_PIECE_KEY] = viewerPiece();
