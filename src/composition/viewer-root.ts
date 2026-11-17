/**
 * The root of the lazy piece build/viewer.js (src/composition/viewer.ts is its entry): 👁 the file viewer (src/features/viewer)
 * over the browser's libraries (src/adapters/browser/viewer-libs.ts) and the app's words, on build/ui.js's Lit.
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { browserViewer } from '../adapters/browser/viewer-libs.ts';
import { extractText, type Extracted } from '../features/viewer/application/read.ts';
import { openViewer, type OpenOptions, type Opened } from '../features/viewer/ui/viewer.ts';

export interface ViewerPiece {
  open(o: OpenOptions): Promise<Opened>;
  extract(blob: Blob, name: string, o?: { maxPages?: number; outline?: boolean; from?: number }): Promise<Extracted>;
  jszip(): Promise<void>;
  loadZip(data: ArrayBuffer | Uint8Array): Promise<unknown>;
}

export function viewerPiece(): ViewerPiece {
  const i18n = noemaI18n();
  const a = browserViewer(file => i18n.t('loader.viewer.couldNotLoad', { file }));
  return Object.freeze({
    open: (o: OpenOptions) => openViewer({ i18n, libs: a.libs, net: a.net, document }, o),
    async extract(blob: Blob, name: string, o: { maxPages?: number; outline?: boolean; from?: number } = {}): Promise<Extracted> {
      const urls: string[] = []; // the pictures a reader made addresses for: the text needs none of them
      try {
        return await extractText(blob, name, { ...a.libs, url: b => (urls.push(a.libs.url(b)), urls[urls.length - 1] ?? '') }, o);
      } finally {
        for (const u of urls) a.libs.revoke(u);
      }
    },
    jszip: () => a.jszip(),
    loadZip: (data: ArrayBuffer | Uint8Array) => a.loadZip(data),
  });
}
