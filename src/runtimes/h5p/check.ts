/* h5p@1: the package rules (docs/INTERACTIVE_H5P.md §5, docs/adr/001 D11). Pure: the zip reader (DecompressionStream, no zip
   library) and the rules of a .h5p file against the one allow-list, tools/h5p_allow.json (imported as it is: the one copy). The
   content checks (src/features/content: checkActivityPackages), the connector, the Node tools (build/noema-tools.cjs) and the
   runtime itself (before an item mounts) use them alike. */
import ALLOW_JSON from '../../../tools/h5p_allow.json' with { type: 'json' };

export const RUNTIME = 'h5p@1';
/** the player the runtime loads (engine/vendor/h5p/<version>/player.js, tools/fetch_h5p.py) */
export const PLAYER_VERSION = '3.8.2';

type Obj = Readonly<Record<string, unknown>>;
export const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
/** the files of a package by path */
export type Files = Readonly<Record<string, Uint8Array>>;

interface AllowJson {
  readonly content: Readonly<Record<string, { readonly versions: readonly string[]; readonly tested?: boolean }>>;
  readonly libraries: Readonly<Record<string, readonly string[]>>;
  readonly refuse: Readonly<Record<string, string>>;
  readonly files: {
    readonly extensions: readonly string[];
    readonly noExtension: readonly string[];
    readonly maxFiles: number;
    readonly maxBytes: number;
    readonly warnBytes: number;
  };
}
const J = ALLOW_JSON as unknown as AllowJson;

/** the allow-list in the shape the rules read: content types (name → major.minor), the untested ones, the other libraries,
    the refused ones (name → why) and the file types */
export const ALLOW = Object.freeze({
  content: Object.freeze(Object.fromEntries(Object.entries(J.content).map(([k, v]) => [k, Object.freeze([...v.versions])]))),
  untested: Object.freeze(Object.keys(J.content).filter(k => !J.content[k]?.tested)),
  libraries: J.libraries,
  refuse: J.refuse,
  extensions: Object.freeze([...J.files.extensions]),
  noExtension: Object.freeze([...J.files.noExtension]),
});
export const LIM = Object.freeze({
  files: J.files.maxFiles,
  bytes: J.files.maxBytes,
  warnBytes: J.files.warnBytes,
  media: 64 * 1024 * 1024,
});

/* i18n-ignore-start */ // code and the rules' messages (authoring diagnostics, English like the other content checks)

/** an Error with the failure code the activity core shows the fallback for */
export class H5PError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code; // (a field, not a parameter property: node runs this file with its types stripped)
  }
}
const fail = (code: string, msg?: string): H5PError => new H5PError(code, msg);
export const extOf = (n: string): string => {
  const b = n.split('/').pop() ?? '';
  return b.includes('.') ? (b.split('.').pop() ?? '').toLowerCase() : '';
};
export const utf8 = (u8: Uint8Array): string => new TextDecoder('utf-8').decode(u8);
const URL_RE =
  /(\bhttps?:|\bftp:|(^|[\s"'(=])\/\/[a-z0-9-]+(\.[a-z0-9-]+)+|youtube\.com|youtu\.be|\bjavascript:|\bdata:text\/html|\bvbscript:)/i;
const ATTRIBUTION = new Set(['source', 'link', 'licenseExtras', 'changes']);
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/* ---------- the package: bytes → {path: Uint8Array} ---------- */
async function inflate(raw: Uint8Array, size: number): Promise<Uint8Array> {
  // a stream made from the bytes, not Blob.stream(): WebKit's offline mode fails blob reads ("The I/O read operation failed")
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(raw);
      c.close();
    },
  });
  const rd = src.pipeThrough(new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
  const out = new Uint8Array(size);
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    if (n + value.length > size) {
      await rd.cancel().catch(() => undefined);
      throw fail('zip', 'an entry is bigger than it says'); // a zip bomb stops here
    }
    out.set(value, n);
    n += value.length;
  }
  if (n !== size) throw fail('zip', 'an entry is shorter than it says');
  return out;
}

/** unzip(bytes) → { path: Uint8Array } (stored and deflated entries; no zip64, no encryption) */
export async function unzip(u8: Uint8Array): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  if (e < 0) throw fail('zip', 'not a zip file');
  const count = dv.getUint16(e + 10, true),
    cdOff = dv.getUint32(e + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw fail('zip', 'zip64 is not supported');
  if (count > LIM.files) throw fail('size', String(count) + ' files');
  const out: Record<string, Uint8Array> = {},
    dec = new TextDecoder();
  let p = cdOff,
    total = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw fail('zip', 'a broken central directory');
    const flags = dv.getUint16(p + 8, true),
      method = dv.getUint16(p + 10, true),
      csize = dv.getUint32(p + 20, true),
      usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true),
      xlen = dv.getUint16(p + 30, true),
      clen = dv.getUint16(p + 32, true),
      loff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw fail('zip', 'an encrypted entry');
    total += usize;
    if (total > LIM.bytes) throw fail('size', 'more than ' + String(LIM.bytes) + ' bytes unpacked');
    if (loff + 30 > u8.length || dv.getUint32(loff, true) !== 0x04034b50) throw fail('zip', 'a broken entry');
    const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true),
      raw = u8.subarray(start, start + csize);
    if (method === 0) {
      if (csize !== usize) throw fail('zip', 'a broken stored entry');
      out[name] = raw.slice();
    } else if (method === 8) out[name] = await inflate(raw, usize);
    else throw fail('zip', 'compression method ' + String(method));
  }
  return out;
}

/* ---------- the rules ---------- */
const allowed = (name: string, mm: string): boolean =>
  (own(ALLOW.content, name) && (ALLOW.content[name] ?? []).includes(mm)) ||
  (own(ALLOW.libraries, name) && (ALLOW.libraries[name] ?? []).includes(mm));
function walk(v: unknown, path: readonly string[], out: [readonly string[], string][]): void {
  if (Array.isArray(v))
    (v as unknown[]).forEach((x, i) => {
      walk(x, [...path, String(i)], out);
    });
  else if (isObj(v)) for (const k of Object.keys(v)) walk(v[k], [...path, k], out);
  else if (typeof v === 'string') out.push([path, v]);
}
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** a library of the package (its library.json) */
export interface LibraryJson {
  readonly machineName?: unknown;
  readonly majorVersion?: unknown;
  readonly minorVersion?: unknown;
  readonly preloadedDependencies?: unknown;
  readonly preloadedJs?: unknown;
  readonly preloadedCss?: unknown;
}
/** what check() finds: the problems, and for a package that can play its main library, h5p.json, the library folders in load
    order (dependencies first) with their library.json, content.json and the unpacked size */
export interface H5PReport {
  readonly errors: string[];
  readonly warnings: string[];
  readonly main?: string;
  readonly h5p?: Obj;
  readonly order?: readonly string[];
  readonly libs?: Readonly<Record<string, LibraryJson>>;
  readonly content?: unknown;
  readonly bytes?: number;
}
/** the paths of a library's preloadedJs / preloadedCss list */
export const assetPaths = (v: unknown): string[] =>
  (Array.isArray(v) ? (v as unknown[]) : []).map(f => (isObj(f) && typeof f.path === 'string' ? f.path : ''));

/** check(files) → { errors, warnings, main, order (library folders, dependencies first), libs { folder: library.json } } */
export function check(files: Files): H5PReport {
  const E: string[] = [],
    W: string[] = [],
    names = Object.keys(files);
  const total = names.reduce((s, n) => s + (files[n]?.length ?? 0), 0);
  if (names.length > LIM.files) E.push(`${String(names.length)} files (at most ${String(LIM.files)})`);
  if (total > LIM.bytes) E.push(`${String(total)} bytes unpacked (at most ${String(LIM.bytes)})`);
  else if (total > LIM.warnBytes) W.push(`${String(Math.floor(total / (1024 * 1024)))} MB unpacked: large for a phone`);
  for (const n of names) {
    const parts = n.split('/');
    if (n.startsWith('/') || n.includes('\\') || parts.some(x => x === '..' || x === '') || (parts[0] ?? '').includes(':')) {
      E.push(`${n}: a path that leaves the package`);
      continue;
    }
    const base = parts[parts.length - 1] ?? '',
      ext = base.includes('.') ? (base.split('.').pop() ?? '').toLowerCase() : '';
    if (!ext && !ALLOW.noExtension.includes(base)) E.push(`${n}: a file without a known type`);
    else if (ext && !ALLOW.extensions.includes(ext)) E.push(`${n}: files of type .${ext} are not allowed`);
    if (ext === 'js' && (n.startsWith('content/') || !n.includes('/'))) E.push(`${n}: a script outside a library folder`);
  }
  const rj = (p: string): unknown => JSON.parse(utf8(files[p] ?? new Uint8Array(0)));
  if (!files['h5p.json']) {
    E.push('no h5p.json');
    return { errors: E, warnings: W };
  }
  let h5p: unknown;
  try {
    h5p = rj('h5p.json');
  } catch (e) {
    E.push(`h5p.json is not JSON (${errMsg(e)})`);
    return { errors: E, warnings: W };
  }
  const H: Obj = isObj(h5p) ? h5p : {};
  const main = H.mainLibrary,
    deps = H.preloadedDependencies;
  if (typeof H.title !== 'string' || !H.title.trim()) E.push('h5p.json: no title');
  if (typeof main !== 'string' || !Array.isArray(deps) || !deps.length) {
    E.push('h5p.json: no mainLibrary or preloadedDependencies');
    return { errors: E, warnings: W };
  }
  const libs: Record<string, LibraryJson> = {},
    order: string[] = [],
    seen = new Set<string>(),
    seenNames = new Set<string>();
  const key = (d: unknown): [string, string] | null => {
    if (!isObj(d) || typeof d.machineName !== 'string' || !d.machineName) return null;
    const a = parseInt(String(d.majorVersion), 10),
      b = parseInt(String(d.minorVersion), 10);
    return String(a) === String(d.majorVersion).trim() && String(b) === String(d.minorVersion).trim()
      ? [d.machineName, String(a) + '.' + String(b)]
      : null;
  };
  function visit(d: unknown, why: string): void {
    const k = key(d);
    if (!k) {
      E.push(`${why}: a dependency without machineName / majorVersion / minorVersion`);
      return;
    }
    const [name, mm] = k,
      id = name + ' ' + mm;
    if (seen.has(id)) return;
    seen.add(id);
    seenNames.add(name);
    if (own(ALLOW.refuse, name)) {
      E.push(`${name} ${mm}: refused (${ALLOW.refuse[name] ?? ''})`);
      return;
    }
    if (!allowed(name, mm)) E.push(`${name} ${mm}: not on the allow-list (tools/h5p_allow.json)`);
    const folder = `${name}-${mm}`;
    if (!files[folder + '/library.json']) {
      E.push(`${name} ${mm}: missing from the package (${folder}/library.json)`);
      return;
    }
    let lj: LibraryJson;
    try {
      const v = rj(folder + '/library.json');
      lj = isObj(v) ? v : {};
    } catch {
      E.push(`${folder}/library.json is not JSON`);
      return;
    }
    if (lj.machineName !== name || `${String(lj.majorVersion)}.${String(lj.minorVersion)}` !== mm)
      E.push(`${folder}/library.json names another library`);
    for (const d2 of Array.isArray(lj.preloadedDependencies) ? (lj.preloadedDependencies as unknown[]) : []) visit(d2, folder);
    for (const kind of ['preloadedJs', 'preloadedCss'] as const)
      for (const f of assetPaths(lj[kind])) {
        const p = `${folder}/${f}`;
        if (!files[p]) E.push(`${p}: named in ${kind} but missing`);
      }
    libs[folder] = lj;
    order.push(folder);
  }
  for (const d of deps as unknown[]) visit(d, 'h5p.json');
  if (!seenNames.has(main)) E.push(`mainLibrary ${main} is not among the preloadedDependencies`);
  else if (!own(ALLOW.content, main)) E.push(`${main}: not an allowed content type (tools/h5p_allow.json "content")`);
  else if (ALLOW.untested.includes(main)) W.push(`${main}: allowed, but not yet tested in the sandbox`);
  const tops = [...new Set(names.filter(n => n.includes('/')).map(n => n.split('/')[0] ?? ''))]
    .filter(t => t !== 'content' && !own(libs, t))
    .sort();
  for (const t of tops) W.push(`${t}/: a library no content uses (left out when playing)`);
  let content: unknown = null;
  if (!files['content/content.json']) E.push('no content/content.json');
  else {
    try {
      content = rj('content/content.json');
      const strs: [readonly string[], string][] = [];
      walk(content, [], strs);
      for (const [path, s] of strs) {
        const m = URL_RE.exec(s);
        if (!m) continue;
        const where = path.join('.');
        if (path.length && ATTRIBUTION.has(path[path.length - 1] ?? '') && path.some(x => x === 'metadata' || x === 'copyright'))
          W.push(`content.json ${where}: an outside link in the attribution (shown as text only)`);
        else E.push(`content.json ${where}: an outside link (${m[0].trim().slice(0, 40)}) — everything must be inside the package`);
      }
      for (const [path, s] of strs)
        if (path[path.length - 1] === 'path' && !URL_RE.test(s) && !files['content/' + (s.split('#')[0] ?? '')])
          W.push(`content.json ${path.join('.')}: ${s} is not in the package`);
    } catch (e) {
      E.push(`content/content.json is not JSON (${errMsg(e)})`);
    }
  }
  return { errors: E, warnings: W, main, h5p: H, order, libs, content, bytes: total };
}

/* i18n-ignore-end */

/** the checks the content checks read (src/features/content/domain/env.ts H5PChecks) */
export const H5P_CHECKS = Object.freeze({ PLAYER_VERSION, ALLOW, LIM, unzip, check });
export type H5PChecksApi = typeof H5P_CHECKS;
