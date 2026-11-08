/* noema-lite — bytes without the platform: UTF-8, base64 and SHA-256 (FIPS 180-4), synchronous and pure, so the same code
   gives the same digest in a page, a Worker, the connector and the Node tools (the content checks compare a bundle's sha256
   with its registry entry everywhere, never only where crypto.subtle happens to exist). */

// made on first use: loading the module needs nothing of the platform (build/app.js also starts in a bare context)
let ENC: TextEncoder | null = null;
let DEC: TextDecoder | null = null;

/** the UTF-8 bytes of a text */
export const utf8Bytes = (text: string): Uint8Array => (ENC ??= new TextEncoder()).encode(text);
/** the length of a text in UTF-8 bytes */
export const utf8Length = (text: string): number => utf8Bytes(text).length;
/** a text from UTF-8 bytes (malformed sequences become U+FFFD) */
export const utf8Text = (bytes: Uint8Array): string => (DEC ??= new TextDecoder('utf-8')).decode(bytes);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map(Array.from({ length: B64.length }, (_, i) => [B64.charAt(i), i]));

/** base64 (a data: URI prefix and white space are skipped) → bytes, or null when it is not base64 */
export function fromBase64(text: string): Uint8Array | null {
  const s = text.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
  if (s.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  const body = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let acc = 0,
    bits = 0,
    n = 0;
  for (let i = 0; i < body.length; i++) {
    acc = (acc << 6) | (B64_INDEX.get(body.charAt(i)) ?? 0);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

/** bytes → base64 (with padding) */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0,
      b = bytes[i + 1],
      c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63);
    out += b === undefined ? '=' : B64.charAt((n >> 6) & 63);
    out += c === undefined ? '=' : B64.charAt(n & 63);
  }
  return out;
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** the SHA-256 of bytes (or of a text's UTF-8 bytes), as 64 lower-case hex digits */
export function sha256Hex(data: Uint8Array | string): string {
  const msg = typeof data === 'string' ? utf8Bytes(data) : data;
  const total = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bitsHi = Math.floor((msg.length * 8) / 0x100000000),
    bitsLo = (msg.length * 8) >>> 0;
  view.setUint32(total - 8, bitsHi);
  view.setUint32(total - 4, bitsLo);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const w15 = W[t - 15] ?? 0,
        w2 = W[t - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3),
        s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[t] = ((W[t - 16] ?? 0) + s0 + (W[t - 7] ?? 0) + s1) >>> 0;
    }
    let a = H[0] ?? 0,
      b = H[1] ?? 0,
      c = H[2] ?? 0,
      d = H[3] ?? 0,
      e = H[4] ?? 0,
      f = H[5] ?? 0,
      g = H[6] ?? 0,
      h = H[7] ?? 0;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25),
        ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + (K[t] ?? 0) + (W[t] ?? 0)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22),
        maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const add = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) H[i] = ((H[i] ?? 0) + (add[i] ?? 0)) >>> 0;
  }
  return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}
