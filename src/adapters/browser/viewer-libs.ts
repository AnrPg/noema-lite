/**
 * The file viewer's libraries in the browser (src/ports/viewer.ts): each vendor library is loaded from
 * engine/vendor/ (window.NOEMA_VENDOR_BASE) only for the kind that needs it — pdf.js (an ES module; a page from file:// cannot
 * import it, so its PDFs open in the browser's own viewer), mammoth (Word), JSZip (ZIP, ODT, PPTX, EPUB), SheetJS
 * (spreadsheets), UTIF with pako (TIFF), heic2any (HEIC); marked and DOMPurify are the page's. Their own models stop here.
 */
import type { PdfDoc, Raster, ViewerLibs, ViewerNet, XmlDoc, Zip, ZipFile } from '../../ports/viewer.ts';

/* the vendors' shapes, as far as they are used (anti-corruption: nothing of them leaves this file) */
interface JSZipFile {
  readonly name: string;
  readonly dir: boolean;
  readonly _data?: { readonly uncompressedSize?: number };
  async(type: 'string'): Promise<string>;
  async(type: 'blob'): Promise<Blob>;
}
interface JSZipArchive {
  readonly files: Readonly<Record<string, JSZipFile>>;
  file(path: string): JSZipFile | null;
}
interface PdfJsPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: unknown; viewport: unknown; transform: number[] | null }): { promise: Promise<void> };
  getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
  cleanup?(): void;
}
interface PdfJsDoc {
  readonly numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  getOutline(): Promise<{ title?: string; dest?: unknown; items?: unknown[] }[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy?(): void;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: Readonly<Record<string, unknown>>): { promise: Promise<PdfJsDoc> };
}
interface VendorGlobals {
  NOEMA_VENDOR_BASE?: string;
  NOEMA_CONFIG?: { siteUrl?: string };
  JSZip?: { loadAsync(data: ArrayBuffer | Uint8Array): Promise<JSZipArchive> };
  mammoth?: {
    convertToHtml(i: { arrayBuffer: ArrayBuffer }, o: { convertImage: unknown }): Promise<{ value: string }>;
    extractRawText(i: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
    images: { dataUri: unknown };
  };
  XLSX?: {
    read(d: Uint8Array, o: Readonly<Record<string, unknown>>): { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_html(s: unknown, o: Readonly<Record<string, unknown>>): string };
  };
  UTIF?: {
    decode(b: ArrayBuffer): { width: number; height: number }[];
    decodeImage(b: ArrayBuffer, ifd: unknown): void;
    toRGBA8(ifd: unknown): Uint8Array;
  };
  heic2any?: (o: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>;
  marked?: { parse(s: string): string };
  DOMPurify?: { sanitize(html: string, o: Readonly<Record<string, unknown>>): string };
}

const G = (): VendorGlobals => globalThis as VendorGlobals;
const base = (): string => G().NOEMA_VENDOR_BASE ?? 'engine/vendor/';
const abs = (p: string): string => new URL(base() + p, location.href).href;

export interface ViewerAdapters {
  readonly libs: ViewerLibs;
  readonly net: ViewerNet;
  /** JSZip on the page (the package export and the source files use it too) */
  jszip(): Promise<void>;
  loadZip(data: ArrayBuffer | Uint8Array): Promise<unknown>;
}

/** couldNotLoad: the words for a library that did not load ({ file }) */
export function browserViewer(couldNotLoad: (file: string) => string): ViewerAdapters {
  const loaded = new Map<string, Promise<void>>();
  const script = (src: string): Promise<void> => {
    const had = loaded.get(src);
    if (had) return had;
    const p = new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = base() + src;
      s.onload = () => {
        res();
      };
      s.onerror = () => {
        loaded.delete(src);
        rej(new Error(couldNotLoad(src)));
      };
      document.head.append(s);
    });
    loaded.set(src, p);
    return p;
  };
  const need = <T>(v: T | undefined, file: string): T => {
    if (v === undefined) throw new Error(couldNotLoad(file));
    return v;
  };
  const jszip = (): Promise<void> => script('viewer/jszip.min.js');
  const loadZip = async (data: ArrayBuffer | Uint8Array): Promise<JSZipArchive> => {
    await jszip();
    return need(G().JSZip, 'viewer/jszip.min.js').loadAsync(data);
  };
  const zipOf = (z: JSZipArchive): Zip => {
    const wrap = (f: JSZipFile): ZipFile => ({
      name: f.name,
      dir: f.dir,
      size: f._data?.uncompressedSize ?? 0,
      text: () => f.async('string'),
      blob: () => f.async('blob'),
    });
    return {
      file: p => {
        const f = z.file(p);
        return f ? wrap(f) : null;
      },
      files: () => Object.values(z.files).map(wrap),
    };
  };
  let pdfjs: Promise<PdfJs | null> | null = null;
  const pdfLib = (): Promise<PdfJs | null> =>
    (pdfjs ??= (import(abs('pdfjs/pdf.min.mjs')) as Promise<PdfJs>)
      .then(lib => {
        lib.GlobalWorkerOptions.workerSrc = abs('pdfjs/pdf.worker.min.mjs');
        return lib;
      })
      .catch(() => {
        pdfjs = null; // file:// pages cannot import it: the browser's own viewer
        return null;
      }));
  const docOf = (doc: PdfJsDoc): PdfDoc => ({
    numPages: doc.numPages,
    async page(n) {
      const p = await doc.getPage(n);
      return {
        viewport: scale => p.getViewport({ scale }),
        render: (ctx, scale, ratio) =>
          p.render({ canvasContext: ctx, viewport: p.getViewport({ scale }), transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null })
            .promise,
        text: async () =>
          (await p.getTextContent()).items
            .map(it => (it.str ?? '') + (it.hasEOL ? '\n' : ' '))
            .join('')
            .replace(/[ \t]+/g, ' ')
            .trim(),
        cleanup: () => p.cleanup?.(),
      };
    },
    async outline() {
      const ol: { title: string; page: number | null; depth: number }[] = [];
      const walk = async (items: readonly unknown[] | null | undefined, d: number): Promise<void> => {
        for (const raw of items ?? []) {
          if (ol.length >= 150) return;
          const it = raw as { title?: string; dest?: unknown; items?: unknown[] };
          let page: number | null = null;
          try {
            let dest = it.dest;
            if (typeof dest === 'string') dest = await doc.getDestination(dest);
            if (Array.isArray(dest) && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1;
          } catch {
            page = null; // a destination pdf.js cannot place: the title without its page
          }
          ol.push({ title: (it.title ?? '').trim(), page, depth: d });
          if (d < 2) await walk(it.items, d + 1);
        }
      };
      try {
        await walk(await doc.getOutline(), 0);
      } catch {
        return ol; // a broken outline: what was read of it
      }
      return ol;
    },
    destroy: () => doc.destroy?.(),
  });
  const parser = (): DOMParser => new DOMParser();

  const libs: ViewerLibs = {
    async pdf(bytes) {
      const lib = await pdfLib();
      if (!lib) return 'unavailable';
      const root = abs('pdfjs/');
      const doc = await lib.getDocument({
        data: bytes,
        cMapUrl: root + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: root + 'standard_fonts/',
        wasmUrl: root + 'wasm/',
        isEvalSupported: false,
      }).promise;
      return docOf(doc);
    },
    zip: async data => zipOf(await loadZip(data)),
    async docxHtml(bytes) {
      await script('viewer/mammoth.browser.min.js');
      const m = need(G().mammoth, 'viewer/mammoth.browser.min.js');
      return (await m.convertToHtml({ arrayBuffer: bytes }, { convertImage: m.images.dataUri })).value;
    },
    async docxText(bytes) {
      await script('viewer/mammoth.browser.min.js');
      return (await need(G().mammoth, 'viewer/mammoth.browser.min.js').extractRawText({ arrayBuffer: bytes })).value;
    },
    async sheets(bytes) {
      await script('viewer/xlsx.full.min.js');
      const X = need(G().XLSX, 'viewer/xlsx.full.min.js'),
        wb = X.read(bytes, { type: 'array', cellDates: true });
      return { names: wb.SheetNames, html: n => X.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' }) };
    },
    async tiff(bytes) {
      await script('viewer/pako_inflate.min.js').catch(() => undefined); // UTIF reads uncompressed and LZW TIFFs without it
      await script('viewer/UTIF.js');
      const U = need(G().UTIF, 'viewer/UTIF.js');
      return U.decode(bytes)
        .slice(0, 30)
        .map((ifd): Raster => {
          U.decodeImage(bytes, ifd);
          return { width: ifd.width, height: ifd.height, rgba: U.toRGBA8(ifd) };
        });
    },
    async heicToJpeg(blob) {
      await script('viewer/heic2any.min.js');
      const out = await need(G().heic2any, 'viewer/heic2any.min.js')({ blob, toType: 'image/jpeg', quality: 0.9 });
      return Array.isArray(out) ? (out[0] ?? blob) : out;
    },
    markdown: text => G().marked?.parse(text) ?? null,
    sanitize: htmlText =>
      G().DOMPurify?.sanitize(htmlText, { ADD_ATTR: ['target'] }) ?? htmlText.replace(/<script[\s\S]*?<\/script>/gi, ''),
    parse: (text, type) => parser().parseFromString(text, type === 'xml' ? 'application/xml' : 'text/html') as unknown as XmlDoc,
    url: blob => URL.createObjectURL(blob),
    revoke: u => {
      URL.revokeObjectURL(u);
    },
  };

  const wrapResponse = (
    r: Response,
  ): { ok: boolean; blob(): Promise<Blob>; text(): Promise<string>; header(n: string): string | null } => ({
    ok: r.ok,
    blob: () => r.blob(),
    text: () => r.text(),
    header: n => r.headers.get(n),
  });
  const net: ViewerNet = {
    direct: async url => wrapResponse(await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' })),
    proxy: () => {
      const site = (G().NOEMA_CONFIG?.siteUrl || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/$/, '');
      return site
        ? async (url: string) =>
            wrapResponse(await fetch(site + '/api/file?url=' + encodeURIComponent(url), { headers: { accept: 'application/json' } }))
        : null;
    },
  };
  return { libs, net, jszip, loadZip };
}
