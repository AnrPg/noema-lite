/* 👁 The file viewer in a DOM (happy-dom), its libraries faked: a dialog with its title, a text file, a table, a binary file's
   hex view, YouTube at a time, ✕ and Escape close it (the addresses it made revoked); and the text it reads for the AI.
   PDF pages, Office files and the site's proxy in a real browser: tests/sources.js. */
import '../../../../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { catalogI18n } from '../../../../adapters/memory/i18n.ts';
import type { ViewerLibs, ViewerNet } from '../../../../ports/viewer.ts';
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
const net: ViewerNet = { direct: () => Promise.reject(new Error('offline')), proxy: () => null };
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

test('the text for the AI: a text file in pages, a Markdown outline', async () => {
  const x = await extractText(new Blob(['# One\ntext\n## Two\nmore']), 'n.md', libs);
  assert.equal(x.kind, 'markdown');
  assert.deepEqual(
    x.outline.map(o => o.title),
    ['One', 'Two'],
  );
  assert.match(x.pages.join(''), /more/);
});
