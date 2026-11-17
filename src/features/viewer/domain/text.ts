/* noema-lite — 👁 the file viewer: the text inside a file's bytes. Pure (TextDecoder and atob are the language's). */

/** The text of bytes: a byte-order mark, else UTF-8, else Windows Greek (many Greek letters) or Western. */
export function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    let greek = 0;
    for (let i = 0; i < Math.min(bytes.length, 4000); i++) {
      const c = bytes[i] ?? 0;
      if (c >= 0xc1 && c <= 0xfe) greek++;
    }
    try {
      return new TextDecoder(greek > 30 ? 'windows-1253' : 'windows-1252').decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes); // a platform without the legacy encodings: UTF-8 with replacements
    }
  }
}

/** The rows of a CSV / TSV text (the delimiter of its first line: , ; tab or |), at most 5000. */
export function csvParse(text: string): string[][] {
  const first = text.split('\n')[0] ?? '';
  const d = [',', ';', '\t', '|'].map(c => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
  const rows: string[][] = [];
  let row: string[] = [],
    f = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) {
      row.push(f);
      f = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
      if (rows.length > 5000) break;
    } else f += ch;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

/** The readable text inside a binary file (legacy DOC / PPT / MSG …): runs of UTF-16 and of ASCII, each once. */
export function strings(bytes: Uint8Array): string {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const c = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8);
    if ((c >= 32 && c < 0xd800 && c !== 0xfffd) || c === 10 || c === 13 || c === 9) cur += String.fromCharCode(c);
    else {
      if (cur.trim().length >= 6) out.push(cur);
      cur = '';
    }
  }
  if (cur.trim().length >= 6) out.push(cur);
  cur = '';
  for (const c of bytes) {
    if ((c >= 32 && c < 127) || c === 10 || c === 13) cur += String.fromCharCode(c);
    else {
      if (cur.trim().length >= 8) out.push(cur);
      cur = '';
    }
  }
  const seen = new Set<string>();
  return out
    .map(s => s.replace(/\r/g, '\n').trim())
    .filter(s => {
      if (!/[A-Za-zΑ-ωА-я]{3}/.test(s) || seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    .join('\n\n');
}

/** The first 4 KB as a hex view: offset, 16 bytes, their ASCII. */
export function hex(bytes: Uint8Array): string {
  const u = bytes.subarray(0, 4096),
    lines: string[] = [];
  for (let i = 0; i < u.length; i += 16) {
    const b = [...u.subarray(i, i + 16)];
    lines.push(
      i.toString(16).padStart(6, '0') +
        '  ' +
        b
          .map(x => x.toString(16).padStart(2, '0'))
          .join(' ')
          .padEnd(48) +
        '  ' +
        b.map(x => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join(''),
    );
  }
  return lines.join('\n');
}

/** Is it text? (under 2 % control bytes in the first 2000) */
export function isTexty(bytes: Uint8Array): boolean {
  const u = bytes.subarray(0, 2000);
  let bad = 0;
  for (const c of u) if (c < 9 || (c > 13 && c < 32)) bad++;
  return u.length > 0 && bad / u.length < 0.02;
}

/** A text cut into pages of n characters, its runs of spaces and blank lines squeezed (the AI's material). */
export function chunkText(t: string | null | undefined, n = 3000): string[] {
  const s = (t ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

/** HTML as plain text: scripts and styles out, cells by tabs, blocks by lines, the common entities read. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<(br|hr)\b[^>]*>|<\/(p|div|tr|li|h[1-6]|section|pre|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A size in words: "3.2 MB", "41 KB", "12 B" (num: the interface's number format). */
export function fmtSize(n: number, num: (x: number, o?: Intl.NumberFormatOptions) => string): string {
  return n > 1048576
    ? num(n / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB'
    : n > 1024
      ? num(Math.round(n / 1024)) + ' KB'
      : num(n) + ' B';
}

/** The outline of a Markdown text: its headings # ## ### (at most 150). */
export function mdOutline(text: string): { title: string; page: null; depth: number }[] {
  return text
    .split('\n')
    .filter(l => /^#{1,3}\s/.test(l))
    .slice(0, 150)
    .map(l => ({ title: l.replace(/^#+\s*/, ''), page: null, depth: (/^#+/.exec(l)?.[0].length ?? 1) - 1 }));
}
