/* noema-lite — 👁 the file viewer: a file read into what the viewer shows (a view), and the text of a file for the AI (the
   Roadmaps' and the generator's material). Each kind is read with the library it needs, loaded only then.
   Supported: PDF (pages, zoom, jump to a page) · images (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG, HEIC/HEIF, TIFF) · text
   and code (TXT, LOG, MD, JSON, XML, YAML, INI, CSV/TSV as a table, source code) · HTML (sandboxed) · Word DOCX ·
   OpenDocument ODT/ODP · RTF · spreadsheets XLSX/XLSM/XLSB/XLS/ODS/NUMBERS · PowerPoint PPTX · EPUB · Jupyter IPYNB ·
   e-mail EML · ZIP (browse and open inner files) · audio and video · legacy DOC/PPT/MSG and anything else: its readable text,
   else a hex view. */
import { chunkText, csvParse, decode, hex, htmlText, isTexty, mdOutline, strings } from '../domain/text.ts';
import { readMail, resolvePath, rtfParagraphs } from '../domain/formats.ts';
import { ext, kindOf, type FileKind } from '../domain/kinds.ts';
import type { PdfDoc, Raster, ViewerLibs, XmlNode } from '../../../ports/viewer.ts';

export type Block = { readonly h: string } | { readonly p: string } | { readonly hr: true };
export type NotebookCell =
  { readonly md: string } | { readonly code: string; readonly outputs: readonly ({ readonly text: string } | { readonly png: string })[] };
export interface ZipEntry {
  readonly name: string;
  readonly size: number;
  open(): Promise<{ blob: Blob; name: string }>;
}

/** What the viewer shows of a file. */
export type View =
  | { readonly type: 'pdf'; readonly doc: PdfDoc; readonly page: number }
  | { readonly type: 'frame'; readonly url: string }
  | { readonly type: 'image'; readonly url: string }
  | { readonly type: 'rasters'; readonly images: readonly Raster[] }
  | { readonly type: 'pre'; readonly text: string }
  | { readonly type: 'table'; readonly rows: readonly (readonly string[])[] }
  | { readonly type: 'html'; readonly html: string }
  | { readonly type: 'sandbox'; readonly html: string }
  | { readonly type: 'blocks'; readonly blocks: readonly Block[]; readonly empty: 'noText' | 'emptyBook' | null }
  | { readonly type: 'sheet'; readonly names: readonly string[]; html(name: string): string }
  | { readonly type: 'slides'; readonly slides: readonly { readonly texts: readonly string[]; readonly images: readonly string[] }[] }
  | { readonly type: 'notebook'; readonly cells: readonly NotebookCell[] }
  | {
      readonly type: 'mail';
      readonly head: readonly (readonly [string, string])[];
      readonly html: string | null;
      readonly text: string | null;
    }
  | { readonly type: 'zip'; readonly entries: readonly ZipEntry[]; readonly total: number }
  | { readonly type: 'media'; readonly kind: 'audio' | 'video'; readonly url: string }
  | { readonly type: 'legacy'; readonly text: string }
  | { readonly type: 'unknown'; readonly hex: string; readonly readable: string };

/** a reader's refusal the viewer names (loader.viewer.<key>) */
export class ViewerRefusal extends Error {
  readonly key: string;
  constructor(key: string) {
    super(key);
    this.key = key;
  }
}

export interface ReadInput {
  readonly blob: Blob;
  readonly bytes: ArrayBuffer;
  readonly name: string;
  readonly page?: number | undefined;
}

const md = (L: ViewerLibs, s: string): string => L.sanitize(L.markdown(s) ?? '<pre>' + s.replace(/</g, '&lt;') + '</pre>');
const pdfFrame = (L: ViewerLibs, bytes: ArrayBuffer, page?: number): View => ({
  type: 'frame',
  url: L.url(new Blob([bytes], { type: 'application/pdf' })) + (page ? '#page=' + String(page) : ''),
});

/** an OpenDocument's headings, paragraphs and page breaks, in order */
function walkOdt(n: XmlNode, out: Block[]): void {
  for (const c of n.childNodes) {
    if (c.nodeType !== 1) continue;
    const ln = c.localName,
      t = c.textContent ?? '';
    if (ln === 'h') out.push({ h: t });
    else if (ln === 'p') {
      if (t.trim()) out.push({ p: t });
    } else if (ln === 'page' || ln === 'frame') {
      out.push({ hr: true });
      walkOdt(c, out);
    } else walkOdt(c, out);
  }
}

const READERS: Readonly<Record<FileKind, (i: ReadInput, L: ViewerLibs) => View | Promise<View>>> = {
  async pdf({ bytes, page }, L) {
    let doc: PdfDoc | 'unavailable';
    try {
      doc = await L.pdf(new Uint8Array(bytes.slice(0)));
    } catch (e) {
      if (e instanceof Error && /password/i.test(e.name + e.message)) throw new ViewerRefusal('pdfPassword');
      doc = 'unavailable'; // a PDF pdf.js cannot read: the browser's own viewer
    }
    return doc === 'unavailable' ? pdfFrame(L, bytes, page) : { type: 'pdf', doc, page: page ?? 1 };
  },
  image: ({ blob }, L) => ({ type: 'image', url: L.url(blob) }),
  heic: async ({ blob }, L) => ({ type: 'image', url: L.url(await L.heicToJpeg(blob)) }),
  tiff: async ({ bytes }, L) => ({ type: 'rasters', images: (await L.tiff(bytes)).slice(0, 30) }),
  text: ({ bytes }) => ({ type: 'pre', text: decode(new Uint8Array(bytes)) }),
  markdown: ({ bytes }, L) => ({ type: 'html', html: md(L, decode(new Uint8Array(bytes))) }),
  csv: ({ bytes }) => ({ type: 'table', rows: csvParse(decode(new Uint8Array(bytes))).slice(0, 5000) }),
  json({ bytes, name }) {
    const t = decode(new Uint8Array(bytes));
    if (ext(name) === 'jsonl') return { type: 'pre', text: t };
    try {
      return { type: 'pre', text: JSON.stringify(JSON.parse(t), null, 2) };
    } catch {
      return { type: 'pre', text: t }; // not JSON after all: as written
    }
  },
  html: ({ bytes }, L) => ({ type: 'sandbox', html: L.sanitize(decode(new Uint8Array(bytes))) }),
  docx: async ({ bytes }, L) => ({ type: 'html', html: L.sanitize(await L.docxHtml(bytes)) }),
  async odt({ bytes }, L) {
    const z = await L.zip(bytes),
      f = z.file('content.xml');
    const blocks: Block[] = [];
    if (f) walkOdt(L.parse(await f.text(), 'xml').documentElement, blocks);
    return { type: 'blocks', blocks, empty: blocks.length ? null : 'noText' };
  },
  rtf: ({ bytes }) => ({ type: 'blocks', blocks: rtfParagraphs(new Uint8Array(bytes)).map(p => ({ p })), empty: null }),
  async sheet({ bytes }, L) {
    const s = await L.sheets(new Uint8Array(bytes));
    return { type: 'sheet', names: s.names, html: (n: string) => L.sanitize(s.html(n)) };
  },
  async pptx({ bytes }, L) {
    const z = await L.zip(bytes);
    const files = z
      .files()
      .map(f => f.name)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
    const slides: { texts: string[]; images: string[] }[] = [];
    for (const f of files) {
      const doc = L.parse((await z.file(f)?.text()) ?? '', 'xml'),
        texts: string[] = [],
        images: string[] = [];
      const relF = z.file(f.replace('slides/', 'slides/_rels/') + '.rels'),
        rels: Record<string, string> = {};
      if (relF)
        for (const r of L.parse(await relF.text(), 'xml').getElementsByTagName('Relationship'))
          rels[r.getAttribute('Id') ?? ''] = r.getAttribute('Target') ?? '';
      for (const p of doc.getElementsByTagNameNS('*', 'p')) {
        const t = [...p.getElementsByTagNameNS('*', 't')].map(x => x.textContent ?? '').join('');
        if (t.trim()) texts.push(t);
      }
      for (const b of doc.getElementsByTagNameNS('*', 'blip')) {
        const id =
            b.getAttribute('r:embed') ??
            b.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ??
            '',
          tgt = rels[id];
        if (!tgt) continue;
        const path = 'ppt/' + tgt.replace(/^\.\.\//, ''),
          zf = z.file(path);
        if (zf && /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(path)) images.push(L.url(await zf.blob()));
      }
      slides.push({ texts, images });
    }
    return { type: 'slides', slides };
  },
  async epub({ bytes }, L) {
    const z = await L.zip(bytes);
    const cont = L.parse((await z.file('META-INF/container.xml')?.text()) ?? '', 'xml'),
      opfPath = cont.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') ?? '';
    const opf = L.parse((await z.file(opfPath)?.text()) ?? '', 'xml'),
      dir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
    const items: Record<string, string> = {};
    for (const it of opf.getElementsByTagName('item')) items[it.getAttribute('id') ?? ''] = it.getAttribute('href') ?? '';
    let html = '';
    for (const ref of opf.getElementsByTagName('itemref')) {
      const href = items[ref.getAttribute('idref') ?? ''];
      if (!href) continue;
      const path = dir + href,
        f = z.file(resolvePath('', path));
      if (!f) continue;
      const doc = L.parse(await f.text(), 'html');
      for (const img of doc.querySelectorAll?.('img, image') ?? []) {
        const src = img.getAttribute('src') ?? img.getAttribute('xlink:href') ?? img.getAttribute('href'),
          zf = src ? z.file(resolvePath(path, src)) : null;
        if (zf) {
          const u = L.url(await zf.blob());
          img.setAttribute('src', u);
          img.setAttribute('href', u);
        }
      }
      html += `<section>${doc.body ? doc.body.innerHTML : ''}</section><hr>`;
    }
    return html ? { type: 'html', html: L.sanitize(html) } : { type: 'blocks', blocks: [], empty: 'emptyBook' };
  },
  ipynb({ bytes }, L) {
    const nb = JSON.parse(decode(new Uint8Array(bytes))) as {
      cells?: { cell_type?: string; source?: unknown; outputs?: { text?: unknown; data?: Record<string, unknown> }[] }[];
    };
    const src = (x: unknown): string => (Array.isArray(x) ? x.join('') : typeof x === 'string' ? x : '');
    const cells: NotebookCell[] = (nb.cells ?? []).map(c => {
      if (c.cell_type === 'markdown') return { md: L.sanitize(L.markdown(src(c.source)) ?? src(c.source)) };
      const outputs: ({ text: string } | { png: string })[] = [];
      for (const o of c.outputs ?? []) {
        if (o.text) outputs.push({ text: src(o.text) });
        if (o.data?.['image/png']) outputs.push({ png: src(o.data['image/png']).replace(/\s/g, '') });
        else if (o.data?.['text/plain']) outputs.push({ text: src(o.data['text/plain']) });
      }
      return { code: src(c.source), outputs };
    });
    return { type: 'notebook', cells };
  },
  eml({ bytes }, L) {
    const m = readMail(new Uint8Array(bytes));
    return { type: 'mail', head: m.head, html: m.html != null ? L.sanitize(m.html) : null, text: m.text };
  },
  async zip({ bytes }, L) {
    const z = await L.zip(bytes),
      files = z.files().filter(f => !f.dir);
    return {
      type: 'zip',
      total: files.length,
      entries: files.slice(0, 2000).map(f => ({
        name: f.name,
        size: f.size,
        open: async () => ({ blob: await f.blob(), name: f.name.split('/').pop() ?? f.name }),
      })),
    };
  },
  audio: ({ blob }, L) => ({ type: 'media', kind: 'audio', url: L.url(blob) }),
  video: ({ blob }, L) => ({ type: 'media', kind: 'video', url: L.url(blob) }),
  legacy: ({ bytes }) => ({ type: 'legacy', text: strings(new Uint8Array(bytes)) }),
  unknown({ bytes }) {
    const u = new Uint8Array(bytes);
    return isTexty(u) ? { type: 'pre', text: decode(u) } : { type: 'unknown', hex: hex(u), readable: strings(u) };
  },
};

/** A file read as a kind → its view. */
export async function readFile(kind: FileKind, input: ReadInput, libs: ViewerLibs): Promise<View> {
  return await READERS[kind](input, libs);
}

/** The text a view shows (the AI's material), page by page. */
export function viewText(v: View): string {
  switch (v.type) {
    case 'pre':
    case 'legacy':
      return v.text;
    case 'table':
      return v.rows.map(r => r.join('\t')).join('\n');
    case 'html':
    case 'sandbox':
      return htmlText(v.html);
    case 'blocks':
      return v.blocks.map(b => ('h' in b ? b.h : 'p' in b ? b.p : '')).join('\n');
    case 'sheet':
      return v.names.map(n => n + '\n' + htmlText(v.html(n))).join('\n\n');
    case 'slides':
      return v.slides.map(s => s.texts.join('\n')).join('\n\n');
    case 'notebook':
      return v.cells
        .map(c => ('md' in c ? htmlText(c.md) : c.code + '\n' + c.outputs.map(o => ('text' in o ? o.text : '')).join('\n')))
        .join('\n\n');
    case 'mail':
      return v.head.map(([k, x]) => k + ': ' + x).join('\n') + '\n\n' + (v.html != null ? htmlText(v.html) : (v.text ?? ''));
    default:
      return '';
  }
}

/** The text of a file, for the AI: { kind, pageCount?, pages (text per page / chunk), first?, outline: [{ title, page, depth }] } */
export interface Extracted {
  readonly kind: FileKind;
  readonly pageCount?: number;
  readonly pages: readonly string[];
  readonly first?: number;
  readonly outline: readonly { title: string; page: number | null; depth: number }[];
}
export async function extractText(
  blob: Blob,
  name: string,
  libs: ViewerLibs,
  { maxPages = 2000, outline = true, from = 1 }: { maxPages?: number; outline?: boolean; from?: number } = {},
): Promise<Extracted> {
  const kind = kindOf(name, blob.type || ''),
    bytes = await blob.arrayBuffer();
  if (kind === 'pdf') {
    const doc = await libs.pdf(new Uint8Array(bytes));
    if (doc === 'unavailable') return { kind, pages: [], outline: [] };
    const first = Math.max(1, from),
      pages: string[] = [];
    for (let i = first; i <= Math.min(doc.numPages, first + maxPages - 1); i++) {
      const pg = await doc.page(i);
      pages.push(await pg.text());
      pg.cleanup();
    }
    const ol = outline ? await doc.outline() : [];
    const n = doc.numPages;
    doc.destroy();
    return { kind, pageCount: n, pages, first, outline: ol };
  }
  if (kind === 'docx') return { kind, pages: chunkText(await libs.docxText(bytes)), outline: [] };
  if (kind === 'text' || kind === 'markdown' || kind === 'csv' || kind === 'json') {
    const t = decode(new Uint8Array(bytes));
    return { kind, pages: chunkText(t), outline: kind === 'markdown' ? mdOutline(t) : [] };
  }
  if (kind === 'html' || kind === 'eml') return { kind, pages: chunkText(htmlText(decode(new Uint8Array(bytes)))), outline: [] };
  if (kind === 'odt' || kind === 'rtf' || kind === 'sheet' || kind === 'pptx' || kind === 'epub' || kind === 'ipynb' || kind === 'legacy')
    return { kind, pages: chunkText(viewText(await readFile(kind, { blob, bytes, name }, libs))), outline: [] };
  return { kind, pages: [], outline: [] };
}
