/**
 * The activity folder as one .zip (docs/activities-dev/authoring_ui.md): written with stored entries (no compression, UTF-8
 * names); read with stored and deflated entries (deflate through the platform's DecompressionStream). Pure byte work.
 */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = (CRC[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const u16 = (n: number): number[] => [n & 255, (n >>> 8) & 255];
const u32 = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

/** files {name: text} → the bytes of a .zip */
export function zip(fs: Readonly<Record<string, string>>): Uint8Array {
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(fs)) {
    const nb = enc(name),
      data = enc(text),
      c = crc32(data);
    const head = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0x21),
      ...u32(c),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nb.length),
      ...u16(0),
    ];
    parts.push(new Uint8Array(head), nb, data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(c),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(nb.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(off),
      ]),
      nb,
    );
    off += head.length + nb.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0),
    n = Object.keys(fs).length;
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(csize), ...u32(off), ...u16(0)]);
  const all = [...parts, ...central, end],
    out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

async function inflate(raw: Uint8Array): Promise<string> {
  const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
/** the bytes of a .zip → its files {name: text} (folders skipped) */
export async function unzip(bytes: Uint8Array | ArrayBuffer): Promise<Record<string, string>> {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    dv = new DataView(b.buffer, b.byteOffset, b.byteLength),
    out: Record<string, string> = {};
  let e = b.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file');
  let p = dv.getUint32(e + 16, true);
  const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip directory');
    const method = dv.getUint16(p + 10, true),
      csz = dv.getUint32(p + 20, true),
      nl = dv.getUint16(p + 28, true),
      xl = dv.getUint16(p + 30, true),
      cl = dv.getUint16(p + 32, true),
      lo = dv.getUint32(p + 42, true);
    const name = dec(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true),
      raw = b.subarray(ds, ds + csz);
    if (name.endsWith('/')) continue;
    if (method === 0) out[name] = dec(raw);
    else if (method === 8 && typeof DecompressionStream === 'function') out[name] = await inflate(raw);
    else throw new Error('unsupported zip compression in ' + name);
  }
  return out;
}
