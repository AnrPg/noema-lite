/* 👁 The file viewer's pure parts: what kind a file is, YouTube addresses, names of addresses, CSV, the readable text of a
   binary file, the hex view, RTF, e-mail, paths inside a book, the file proxy's refusal, sizes and outlines. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMail, resolvePath, rtfParagraphs, fileRefusal, mailWords } from './formats.ts';
import { ext, kindOf, nameOfUrl, youtube } from './kinds.ts';
import { chunkText, csvParse, fmtSize, hex, htmlText, isTexty, mdOutline, strings } from './text.ts';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

test('the kind: from the name first, else the type', () => {
  assert.equal(ext('Book.PDF?x=1'), 'pdf');
  assert.equal(kindOf('notes.md'), 'markdown');
  assert.equal(kindOf('photo.HEIC'), 'heic');
  assert.equal(kindOf('table.tsv'), 'csv');
  assert.equal(kindOf('blob', 'application/pdf'), 'pdf');
  assert.equal(kindOf('blob', 'image/png'), 'image');
  assert.equal(kindOf('blob', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.equal(kindOf('blob', 'message/rfc822'), 'eml');
  assert.equal(kindOf('blob', 'application/x-thing'), 'unknown');
});

test('YouTube: the privacy-friendly embed, at a start; names of addresses', () => {
  assert.equal(
    youtube('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 2220),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=2220',
  );
  assert.equal(youtube('https://youtu.be/dQw4w9WgXcQ?t=42'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42');
  assert.equal(youtube('https://example.com/video'), null);
  assert.equal(nameOfUrl('https://x/a/Book%201.pdf?x'), 'Book 1.pdf');
  assert.equal(nameOfUrl('https://x/a/%E0%A4%A.pdf'), '%E0%A4%A.pdf', 'a broken escape: as written');
  assert.equal(nameOfUrl('https://x/'), 'file');
});

test('CSV: quotes, doubled quotes, tabs, line ends', () => {
  assert.deepEqual(csvParse('a,"b, c","say ""hi"""\r\n1,2,3\n'), [
    ['a', 'b, c', 'say "hi"'],
    ['1', '2', '3'],
  ]);
  assert.deepEqual(csvParse('a\tb\n1\t2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('binary files: their readable text once, the hex view, text or not', () => {
  const u = new Uint8Array([0, 1, 2, ...bytes('Readable words here'), 0, 0, ...bytes('Readable words here'), 3]);
  assert.equal(strings(u), 'Readable words here');
  assert.match(hex(bytes('ABC')), /^000000 {2}41 42 43 +ABC$/);
  assert.ok(isTexty(bytes('plain text\n')));
  assert.ok(!isTexty(new Uint8Array([0, 1, 2, 3, 65])));
});

test('RTF: paragraphs, its code page and \\u escapes, the font table left out', () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1253{\fonttbl{\f0 Arial;}}\f0 \'cb\'dc\'e8\'ef\'f2 \u915?\par Second line\par}`;
  assert.deepEqual(rtfParagraphs(new TextEncoder().encode(rtf)), ['Λάθος Γ', 'Second line']);
});

test('e-mail: its head (encoded words read), the HTML and the text of a multipart message', () => {
  assert.equal(mailWords('=?UTF-8?B?zprOsc67zrfOvM6tz4HOsQ==?='), 'Καλημέρα');
  const m = readMail(
    bytes(
      'From: A <a@x>\r\nSubject: =?utf-8?Q?Caf=C3=A9?=\r\nContent-Type: multipart/alternative; boundary="B"\r\n\r\n--B\r\nContent-Type: text/plain\r\n\r\nhello\r\n--B\r\nContent-Type: text/html\r\n\r\n<p>hello</p>\r\n--B--\r\n',
    ),
  );
  assert.deepEqual(m.head, [
    ['from', 'A <a@x>'],
    ['subject', 'Café'],
  ]);
  assert.match(m.text ?? '', /hello/);
  assert.match(m.html ?? '', /<p>hello<\/p>/);
});

test('paths inside a book, the file proxy’s refusal', () => {
  assert.equal(resolvePath('OEBPS/text/ch1.xhtml', '../img/a%20b.png'), 'OEBPS/img/a b.png');
  assert.deepEqual(
    fileRefusal('{"error":{"code":"file.too_big","params":{"max":5},"message":"Too big"}}', () => null),
    {
      code: 'file.too_big',
      params: { max: 5 },
      message: 'Too big',
    },
  );
  const h: Record<string, string> = { 'x-error-code': 'file.blocked', 'x-error-params': encodeURIComponent('{"host":"x"}') };
  assert.deepEqual(
    fileRefusal('blocked', n => h[n] ?? null),
    { code: 'file.blocked', params: { host: 'x' }, message: 'blocked' },
  );
  assert.equal(
    fileRefusal('Not found', () => null),
    null,
  );
});

test('text for the AI, HTML as text, sizes, a Markdown outline', () => {
  assert.deepEqual(chunkText('a  b\n\n\n\nc', 3), ['a b', '\n\nc']);
  assert.equal(htmlText('<style>x</style><p>a &amp; b</p><td>1</td>').trim(), 'a & b\n 1');
  const num = (x: number): string => String(x);
  assert.equal(fmtSize(12, num), '12 B');
  assert.equal(fmtSize(4096, num), '4 KB');
  assert.deepEqual(
    mdOutline('# A\ntext\n## B\n#### too deep').map(x => [x.title, x.depth]),
    [
      ['A', 0],
      ['B', 1],
    ],
  );
});
