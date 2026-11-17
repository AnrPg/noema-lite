/**
 * NoemaCore.viewer — 👁 the file viewer for the older pages (src/features/viewer). What it knows of a file's kind is here at
 * once; opening and reading a file run the lazy piece build/viewer.js (its readers, its libraries' loader and its screen, on
 * build/ui.js's Lit) the first time:
 *
 *   NoemaCore.viewer.open({ blob | url, name, type, kind, page, start, title, subtitle, onClose }) → Promise<{ close, kind }>
 *   NoemaCore.viewer.extract(blob, name, { maxPages, outline, from }) → Promise<{ kind, pageCount?, pages, first?, outline }>
 *   NoemaCore.viewer.kindOf(name, type) · KINDS · youtube(url, start)
 *   NoemaCore.viewer.jszip() → Promise (JSZip on the page) · loadZip(data) → Promise<JSZip archive>
 */
import { KINDS, kindOf, youtube } from '../features/viewer/domain/kinds.ts';
import type { BridgeExtension } from './bridge.ts';
import { token } from './container.ts';
import type { ViewerPiece } from './viewer-root.ts';

/** Where build/viewer.js leaves its module (src/composition/viewer.ts). */
export const VIEWER_PIECE_KEY = '__noemaViewerPiece';
/** the load of build/viewer.js (registered by the browser root, next to build/app.js) */
export const VIEWER_PIECE = token<() => Promise<ViewerPiece>>('viewer.piece', 'the load of build/viewer.js');

export const viewerBridge: BridgeExtension = {
  name: 'viewer',
  build: r => {
    const load = (): Promise<ViewerPiece> => r.get(VIEWER_PIECE)();
    return Object.freeze({
      KINDS,
      kindOf,
      youtube,
      open: async (o: Parameters<ViewerPiece['open']>[0]) => (await load()).open(o),
      extract: async (...a: Parameters<ViewerPiece['extract']>) => (await load()).extract(...a),
      jszip: async () => (await load()).jszip(),
      loadZip: async (data: ArrayBuffer | Uint8Array) => (await load()).loadZip(data),
    });
  },
};
