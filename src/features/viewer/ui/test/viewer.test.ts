/* 👁 The file viewer in a DOM (happy-dom), its libraries faked: a dialog with its title, a text file, a table, a binary file's
   hex view, YouTube at a time, ✕ and Escape close it (the addresses it made revoked), a PDF's document freed whenever the
   viewer goes (closed, replaced, or closed while the PDF still loads); and the text it reads for the AI.
   PDF pages, Office files and the site's proxy in a real browser: tests/sources.js. */
import '../../../../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { catalogI18n } from '../../../../adapters/memory/i18n.ts';
import type { PdfDoc, ViewerLibs, ViewerNet } from '../../../../ports/viewer.ts';
import { arb } from '../../../../ui/test/services.ts';
import { extractText } from '../../application/read.ts';
import { openViewer } from '../viewer.ts';

afterEach(() => {
  document.body.replaceChildren();
});

const CAT = arb(new URL('../../../../../i18n/loader/en.arb', import.meta.url).pathname);
const made: string[] = [],
  revoked: string[] = [];
const none = (): Promise<never> => Promise.reject(new Error('not in this test'));
const libs: ViewerLibs = {
  pdf: none,
  zip: none,
  docxHtml: none,
  docxText: none,
  sheets: none,
  tiff: none,
  heicToJpeg: none,
  markdown: t => `<p>${t}</p>`,
  sanitize: h => h,
  parse: () => {
    throw new Error('not in this test');
  },
  url: () => {
    made.push('blob:' + String(made.length));
    return made[made.length - 1] ?? '';
  },
  revoke: u => revoked.push(u),
};
let frameAnswer: 'yes' | 'no' | 'unknown' = 'unknown';
const net: ViewerNet = {
  direct: () => Promise.reject(new Error('offline')),
  proxy: () => null,
  frame: () => Promise.resolve(frameAnswer),
};
const port = { i18n: catalogI18n({ en: CAT }), libs, net, document };

test('a text file: a modal dialog with its title, the text; ✕ closes it', async () => {
  let closed = 0;
  const v = await openViewer(port, {
    blob: new Blob(['hello\nworld']),
    name: 'notes.txt',
    title: 'Notes',
    onClose: () => {
      closed++;
    },
  });
  assert.equal(v.kind, 'text');
  const ov = document.querySelector('.vw-ov');
  assert.ok(ov);
  assert.equal(ov.getAttribute('role'), 'dialog');
  assert.equal(ov.getAttribute('aria-modal'), 'true');
  assert.match(ov.querySelector('.vw-title')?.textContent ?? '', /Notes/);
  assert.match(ov.querySelector('.vw-body')?.textContent ?? '', /hello\s+world/);
  ov.querySelector<HTMLButtonElement>('.vw-close')?.click();
  assert.equal(document.querySelector('.vw-ov'), null);
  assert.equal(closed, 1);
});

test('a table, a binary file as hex; Escape closes and the addresses are revoked', async () => {
  await openViewer(port, { blob: new Blob(['a,b\n1,2']), name: 't.csv' });
  assert.equal(document.querySelectorAll('.vw-body table tr').length, 2);
  const v = await openViewer(port, { blob: new Blob([new Uint8Array([0, 1, 2, 3, 200, 0, 7])]), name: 'x.bin' });
  assert.equal(v.kind, 'unknown');
  assert.equal(document.querySelectorAll('.vw-ov').length, 1, 'one viewer at a time');
  assert.match(document.querySelector('.vw-body')?.textContent ?? '', /000000/);
  const img = await openViewer(port, { blob: new Blob(['x']), name: 'p.png' });
  assert.equal(img.kind, 'image');
  document.querySelector('.vw-ov')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('.vw-ov'), null);
  assert.ok(made.length > 0 && made.every(u => revoked.includes(u)));
});

test('YouTube: the privacy-friendly embed at its time', async () => {
  const v = await openViewer(port, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', start: 2220, title: 'Lecture' });
  assert.equal(v.kind, 'youtube');
  assert.match(document.querySelector('iframe.vw-yt')?.getAttribute('src') ?? '', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?start=2220/);
  v.close();
});

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 20));

test('a web page: framed when the site allows it, no note', async () => {
  frameAnswer = 'yes';
  const v = await openViewer(port, { url: 'https://openstax.org/books/x/pages/9-1', title: 'OpenStax' });
  assert.equal(v.kind, 'web');
  await settle();
  assert.equal(document.querySelector('.vw-web iframe.vw-frame')?.getAttribute('src'), 'https://openstax.org/books/x/pages/9-1');
  assert.equal(document.querySelector('.vw-hint'), null);
  v.close();
});

test('a web page whose site refuses frames: a card with ↗, no frame', async () => {
  frameAnswer = 'no';
  const v = await openViewer(port, { url: 'https://github.com/x/y', title: 'Repo' });
  await settle();
  assert.equal(document.querySelector('.vw-ov iframe'), null);
  assert.match(document.querySelector('.vw-blocked')?.textContent ?? '', /does not allow previews inside the app/);
  assert.equal(document.querySelector('.vw-blocked a')?.getAttribute('href'), 'https://github.com/x/y');
  v.close();
});

test('a web page with no answer: framed with a note above it (never over it) that ✕ hides', async () => {
  frameAnswer = 'unknown';
  const v = await openViewer(port, { url: 'https://example.org/', title: 'Page' });
  await settle();
  const hint = document.querySelector('.vw-web > .vw-hint');
  assert.ok(hint, 'the note is in the column, before the frame');
  assert.equal(hint.nextElementSibling?.tagName, 'IFRAME');
  (document.querySelector('.vw-hint .vw-x') as HTMLButtonElement).click();
  await settle();
  assert.equal(document.querySelector('.vw-hint'), null);
  assert.ok(document.querySelector('.vw-web iframe.vw-frame'), 'the frame stays');
  v.close();
});

test('the text for the AI: a text file in pages, a Markdown outline', async () => {
  const x = await extractText(new Blob(['# One\ntext\n## Two\nmore']), 'n.md', libs);
  assert.equal(x.kind, 'markdown');
  assert.deepEqual(
    x.outline.map(o => o.title),
    ['One', 'Two'],
  );
  assert.match(x.pages.join(''), /more/);
});

test('the text of an e-mail for the AI: its head and its text, never the raw MIME', async () => {
  const mail =
    'From: A <a@x>\r\nSubject: Notes\r\nContent-Type: multipart/alternative; boundary="BOUND"\r\n\r\n--BOUND\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    btoa(String.fromCharCode(...new TextEncoder().encode('Καλημέρα κόσμε'))) +
    '\r\n--BOUND--\r\n';
  const x = await extractText(new Blob([mail]), 'n.eml', libs);
  assert.equal(x.kind, 'eml');
  const t = x.pages.join('');
  assert.match(t, /subject: Notes/);
  assert.match(t, /Καλημέρα κόσμε/);
  assert.doesNotMatch(t, /BOUND|base64|Content-Type/);
});

/** a PDF of n pages whose destroy() is counted; ready: when pdf.js answers */
function fakePdf(ready: Promise<void> = Promise.resolve()): { libs: ViewerLibs; destroyed: () => number } {
  let n = 0;
  const doc: PdfDoc = {
    numPages: 2,
    page: () =>
      Promise.resolve({
        viewport: (k: number) => ({ width: 600 * k, height: 800 * k }),
        render: () => Promise.resolve(),
        text: () => Promise.resolve(''),
        cleanup: () => undefined,
      }),
    outline: () => Promise.resolve([]),
    destroy: () => {
      n++;
    },
  };
  return { libs: { ...libs, pdf: () => ready.then(() => doc) }, destroyed: () => n };
}
const pdfBlob = (): Blob => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

test('a PDF’s document is freed once when the viewer is closed, and when another file replaces it', async () => {
  const a = fakePdf();
  const v = await openViewer({ ...port, libs: a.libs }, { blob: pdfBlob(), name: 'a.pdf' });
  assert.equal(v.kind, 'pdf');
  assert.ok(document.querySelector('.vw-pdf'));
  v.close();
  assert.equal(a.destroyed(), 1);
  const b = fakePdf();
  await openViewer({ ...port, libs: b.libs }, { blob: pdfBlob(), name: 'b.pdf' });
  await openViewer(port, { blob: new Blob(['x']), name: 'next.txt' });
  assert.equal(b.destroyed(), 1, 'replaced');
});

test('a PDF closed while it still loads is freed when pdf.js answers', async () => {
  let go = (): void => undefined;
  const c = fakePdf(new Promise<void>(r => (go = r)));
  const opening = openViewer({ ...port, libs: c.libs }, { blob: pdfBlob(), name: 'c.pdf' });
  await new Promise(r => setTimeout(r, 0));
  document.querySelector<HTMLButtonElement>('.vw-close')?.click();
  go();
  await opening;
  assert.equal(c.destroyed(), 1);
  assert.equal(document.querySelector('.vw-pdf'), null);
});
