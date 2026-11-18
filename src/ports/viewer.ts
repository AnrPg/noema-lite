/* noema-lite — 👁 the file viewer's ports: the readers' libraries (each loaded only for the kind that needs it: engine/vendor/
   pdfjs, engine/vendor/viewer — see engine/vendor/viewer/README.md), the page's parsers and addresses, and the network. */

/** an XML or HTML document, as far as the readers read it */
export interface XmlDoc {
  readonly documentElement: XmlNode;
  getElementsByTagName(name: string): ArrayLike<XmlNode> & Iterable<XmlNode>;
  getElementsByTagNameNS(ns: string, name: string): ArrayLike<XmlNode> & Iterable<XmlNode>;
  querySelectorAll?(sel: string): Iterable<XmlNode>;
  readonly body?: { readonly innerHTML: string } | null;
}
export interface XmlNode {
  readonly nodeType: number;
  readonly localName: string;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<XmlNode> & Iterable<XmlNode>;
  getAttribute(name: string): string | null;
  getAttributeNS(ns: string, name: string): string | null;
  setAttribute(name: string, value: string): void;
  getElementsByTagNameNS(ns: string, name: string): ArrayLike<XmlNode> & Iterable<XmlNode>;
}

/** a ZIP archive (JSZip) */
export interface ZipFile {
  readonly name: string;
  readonly dir: boolean;
  readonly size: number;
  text(): Promise<string>;
  blob(): Promise<Blob>;
}
export interface Zip {
  file(path: string): ZipFile | null;
  files(): readonly ZipFile[];
}

/** one page of a PDF (pdf.js) */
export interface PdfPage {
  viewport(scale: number): { readonly width: number; readonly height: number };
  /** draws the page on a canvas context at this scale (ratio: the device's pixel ratio) */
  render(ctx: unknown, scale: number, ratio: number): Promise<void>;
  text(): Promise<string>;
  cleanup(): void;
}
export interface PdfDoc {
  readonly numPages: number;
  page(n: number): Promise<PdfPage>;
  /** the outline: [{ title, page, depth }] (at most 150, three levels) */
  outline(): Promise<{ title: string; page: number | null; depth: number }[]>;
  destroy(): void;
}

/** one decoded TIFF image */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface ViewerLibs {
  /** pdf.js, when it loads (a page opened from file:// cannot import it) */
  pdf(bytes: Uint8Array): Promise<PdfDoc | 'unavailable'>;
  zip(bytes: ArrayBuffer | Uint8Array): Promise<Zip>;
  /** Word → HTML (its pictures inline) and its raw text (mammoth) */
  docxHtml(bytes: ArrayBuffer): Promise<string>;
  docxText(bytes: ArrayBuffer): Promise<string>;
  /** a spreadsheet's sheets, each as an HTML table (SheetJS) */
  sheets(bytes: Uint8Array): Promise<{ names: readonly string[]; html(name: string): string }>;
  tiff(bytes: ArrayBuffer): Promise<Raster[]>;
  heicToJpeg(blob: Blob): Promise<Blob>;
  /** Markdown → HTML (marked), or null without it */
  markdown(text: string): string | null;
  /** HTML made safe (DOMPurify) */
  sanitize(html: string): string;
  parse(text: string, type: 'xml' | 'html'): XmlDoc;
  /** an address for a blob (the viewer revokes it when it closes) */
  url(blob: Blob): string;
  revoke(url: string): void;
}

/** a response of the network, as far as the viewer reads it */
export interface FetchedFile {
  readonly ok: boolean;
  blob(): Promise<Blob>;
  text(): Promise<string>;
  header(name: string): string | null;
}
export interface ViewerNet {
  /** the address straight (CORS, no referrer) */
  direct(url: string): Promise<FetchedFile>;
  /** the site's /api/file, when there is a site (null: none) */
  proxy(): ((url: string) => Promise<FetchedFile>) | null;
}
