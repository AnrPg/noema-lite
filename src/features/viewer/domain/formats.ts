/* noema-lite — 👁 the file viewer: the formats read without a library (RTF, e-mail, the paths inside an EPUB) and the refusal
   of the site's file proxy. Pure. */

const fromLatin1 = (s: string): Uint8Array => Uint8Array.from(s, c => c.charCodeAt(0));
const decodeAs = (bytes: Uint8Array, charset: string): string => {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes); // a charset the platform does not know: UTF-8
  }
};

/** The paragraphs of an RTF document (its code page, \uN escapes, groups of fonts, colours, pictures left out). */
export function rtfParagraphs(bytes: Uint8Array): string[] {
  let s = new TextDecoder('latin1').decode(bytes);
  const cp = Number(/\\ansicpg(\d+)/.exec(s)?.[1]) || 1252;
  let dec: TextDecoder;
  try {
    dec = new TextDecoder('windows-' + String(cp));
  } catch {
    dec = new TextDecoder('windows-1252'); // a code page the platform does not know: Western
  }
  s = s.replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*\}/g, '');
  s = s
    .replace(/\\u(-?\d+)\??/g, (_m, n: string) => String.fromCharCode(Number(n) < 0 ? 65536 + Number(n) : Number(n)))
    .replace(/\\'([0-9a-f]{2})/gi, (_m, x: string) => dec.decode(new Uint8Array([parseInt(x, 16)])));
  s = s
    .replace(/\\(par|line)\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return s
    .trim()
    .split(/\n+/)
    .filter(x => x.trim());
}

/* ---------- e-mail (EML / MHT) ---------- */

interface Part {
  readonly H: Readonly<Record<string, string>>;
  readonly body: string;
}
function split(s: string): Part {
  const i = s.search(/\r?\n\r?\n/);
  const head = i < 0 ? s : s.slice(0, i),
    body = i < 0 ? '' : s.slice(i).replace(/^\r?\n\r?\n/, '');
  const H: Record<string, string> = {};
  for (const l of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(l);
    if (m?.[1]) H[m[1].toLowerCase()] = m[2] ?? '';
  }
  return { H, body };
}
const qp = (s: string): string => s.replace(/=([0-9a-f]{2})/gi, (_x, hh: string) => String.fromCharCode(parseInt(hh, 16)));
/** a header's encoded words (=?utf-8?B?…?=) read */
export function mailWords(s: string | null | undefined): string {
  return (s ?? '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (m, cs: string, enc: string, t: string) => {
    try {
      const bytes = enc.toLowerCase() === 'b' ? fromLatin1(atob(t)) : fromLatin1(qp(t.replace(/_/g, ' ')));
      return new TextDecoder(cs).decode(bytes);
    } catch {
      return t || m; // a broken encoded word: as written
    }
  });
}
function bodyText(p: Part): string {
  const cte = (p.H['content-transfer-encoding'] ?? '').toLowerCase(),
    cs = /charset="?([\w-]+)/i.exec(p.H['content-type'] ?? '')?.[1] ?? 'utf-8';
  let bytes: Uint8Array;
  try {
    bytes =
      cte === 'base64'
        ? fromLatin1(atob(p.body.replace(/\s/g, '')))
        : cte === 'quoted-printable'
          ? fromLatin1(qp(p.body.replace(/=\r?\n/g, '')))
          : fromLatin1(p.body);
  } catch {
    bytes = fromLatin1(p.body); // broken base64: the raw text
  }
  return decodeAs(bytes, cs);
}

/** An e-mail: its head (from, to, date, subject; read), its HTML part and its text part (the first of each). */
export interface Mail {
  readonly head: readonly (readonly ['from' | 'to' | 'date' | 'subject', string])[];
  readonly html: string | null;
  readonly text: string | null;
}
export function readMail(bytes: Uint8Array): Mail {
  const top = split(new TextDecoder('latin1').decode(bytes));
  let html: string | null = null,
    text: string | null = null;
  const visit = (part: Part): void => {
    const raw = part.H['content-type'] ?? 'text/plain',
      ct = raw.toLowerCase(),
      b = /boundary="?([^";]+)"?/i.exec(raw); // the boundary is case-sensitive
    if (ct.startsWith('multipart/') && b?.[1]) {
      for (const s of part.body.split('--' + b[1]).slice(1)) if (!s.startsWith('--')) visit(split(s.replace(/^\r?\n/, '')));
    } else if (ct.startsWith('text/html') && html == null) html = bodyText(part);
    else if (ct.startsWith('text/plain') && text == null) text = bodyText(part);
  };
  visit(top);
  const head = (['from', 'to', 'date', 'subject'] as const).filter(k => top.H[k]).map(k => [k, mailWords(top.H[k])] as const);
  return { head, html, text };
}

/** A path inside a book: rel from the file at base ("OEBPS/ch1.xhtml" + "../img/a.png" → "img/a.png"). */
export function resolvePath(base: string, rel: string): string {
  const out: string[] = [];
  for (const p of (base.replace(/[^/]+$/, '') + rel).split('/')) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  try {
    return decodeURIComponent(out.join('/'));
  } catch {
    return out.join('/'); // a broken escape: the path as written
  }
}

/** The refusal of the site's /api/file (JSON to a client that accepts it, else plain text with x-error-code / x-error-params;
    docs/i18n.md §6.1) → { code, params, message }, or null when it carries no code (a static server's 404). */
export interface FileRefusal {
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message: string;
}
export function fileRefusal(text: string, header: (name: string) => string | null): FileRefusal | null {
  let j: { error?: { code?: unknown; params?: unknown; message?: unknown } } | null;
  try {
    j = JSON.parse(text) as typeof j;
  } catch {
    j = null; // not JSON: the headers may say it
  }
  const e = j?.error;
  if (e && typeof e === 'object' && typeof e.code === 'string' && e.code)
    return {
      code: e.code,
      params: (e.params && typeof e.params === 'object' ? e.params : {}) as Record<string, unknown>,
      message: typeof e.message === 'string' ? e.message : '',
    };
  const code = header('x-error-code');
  if (!code) return null;
  try {
    return {
      code,
      params: JSON.parse(decodeURIComponent(header('x-error-params') ?? '') || '{}') as Record<string, unknown>,
      message: text.slice(0, 160),
    };
  } catch {
    return { code, params: {}, message: text.slice(0, 160) }; // broken params: the code alone
  }
}
