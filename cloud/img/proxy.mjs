/* noema-lite picture & document fetcher — GET /api/img?url=<image url>   GET /api/file?url=<document url>
   /api/file (for 👁 previews of web sources): PDFs, office documents, e-books, text, audio/video, archives — ≤ 25 MB.
   Used only when a browser cannot download a web picture itself (the image host sends no CORS header):
   "Create with Claude" inside the app, and importing packs whose web pictures are fetched by the app.
   Holds no secrets. Safety limits: http(s) only, no private / local addresses, images only, ≤ 15 MB,
   10 s timeout, at most 3 redirects (each re-checked), called from this site's pages only. */
const MAX = 15 * 1024 * 1024, MAX_FILE = 25 * 1024 * 1024;
const TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/;
const FILE_TYPES = /^(image\/[\w.+-]+|audio\/[\w.+-]+|video\/[\w.+-]+|text\/(plain|csv|markdown|x-markdown|xml|tab-separated-values|calendar|rtf)|application\/(pdf|json|xml|zip|epub\+zip|rtf|msword|vnd\.ms-[\w.-]+|vnd\.openxmlformats-officedocument\.[\w.-]+|vnd\.oasis\.opendocument\.[\w.-]+|x-ipynb\+json|octet-stream|x-zip-compressed))$/;

export function blockedHost(h) {
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^(fc|fd|fe8|fe9|fea|feb)/.test(h) || h.startsWith('::ffff:');
  return /^\d+$/.test(h);   // decimal IP tricks like http://2130706433/
}

/** Some hosts send pictures as application/octet-stream: recognise PNG, JPEG, GIF, WebP and SVG by their first bytes. */
export function sniff(b) {
  const t = new TextDecoder().decode(b.slice(0, 1024)).trim().toLowerCase();
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (t.startsWith('gif8')) return 'image/gif';
  if (t.slice(0, 4) === 'riff' && t.slice(8, 12) === 'webp') return 'image/webp';
  if (t.startsWith('<svg') || (t.startsWith('<?xml') && t.includes('<svg'))) return 'image/svg+xml';
  return null;
}

const out = (status, msg, extra = {}) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', ...extra } });

export default async function handler(req) {
  const me = new URL(req.url);
  const fileMode = me.pathname.endsWith('/api/file'); const LIMIT = fileMode ? MAX_FILE : MAX;
  if (req.method === 'OPTIONS') return out(204, '', { 'access-control-allow-methods': 'GET' });
  if (req.method !== 'GET') return out(405, 'GET only');
  // only this site's own pages (browsers always send Origin or Referer for these requests)
  const from = req.headers.get('origin') || req.headers.get('referer') || '';
  try { if (from && new URL(from).host !== me.host) return out(403, 'only for noema-lite pages'); } catch (e) { return out(403, 'bad origin'); }
  let target;
  try { target = new URL(me.searchParams.get('url') || ''); } catch (e) { return out(400, 'url parameter missing or invalid'); }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(target.protocol) || target.username || target.password) return out(400, 'only plain http(s) urls');
    if (blockedHost(target.hostname) && !globalThis.NOEMA_IMG_ALLOW_LOCAL) return out(400, 'this address is not allowed');   // (the flag exists only in the test emulator)
    let r;
    try {
      r = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'noema-lite-picture-fetcher/1.0 (personal study app)', accept: 'image/*' } });
    } catch (e) { return out(502, 'could not reach the picture: ' + e.message); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { target = new URL(r.headers.get('location'), target); continue; }
    if (!r.ok) return out(502, `the picture host answered ${r.status}`);
    let type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const generic = !type || /octet-stream/.test(type);
    if (fileMode ? !FILE_TYPES.test(type) && !generic : !TYPES.test(type) && !generic) return out(415, fileMode ? `this kind of file cannot be previewed (${type})` : `not a picture (${type}) — use the direct image url, not the page`);
    if (+r.headers.get('content-length') > LIMIT) return out(413, `larger than ${LIMIT / 1048576} MB`);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > LIMIT) return out(413, `larger than ${LIMIT / 1048576} MB`);
    if (generic && !fileMode) { type = sniff(buf); if (!type) return out(415, 'not a picture — use the direct image url, not the page'); }
    if (generic && fileMode) type = sniff(buf) || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 ? 'application/pdf' : 'application/octet-stream');
    return new Response(buf, { status: 200, headers: { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400', 'x-final-url': target.href, 'access-control-expose-headers': 'x-final-url' } });
  }
  return out(508, 'too many redirects');
}
