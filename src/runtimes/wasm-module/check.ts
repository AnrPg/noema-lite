/* wasm-module@1 and the engine wasm@1: the rules of a module (docs/activities-dev/wasm.md, docs/INTERACTIVE_WASM.md). Pure: the
   synchronous sha256, our own reader of the binary (inspect), the item's ABI, the model of a wasm@1 spec. The content checks (the app,
   the connector, noema-tools and the activity host) and the runtime use the same code and the same messages
   (tests/fixtures/parity/activities_wasm.json: the golden reports of the former Python twin). No user-visible text: failures are codes. */

export const RUNTIME = 'wasm-module@1';
export const ENGINE = 'wasm@1';
export const MAX_BYTES = 2 * 1024 * 1024,
  PAGES_DEFAULT = 256,
  PAGES_CAP = 1024;
const ABI_MODULES: readonly string[] = ['noema', 'env'];
export const ABI_FUNCS: Readonly<Record<string, string>> = Object.freeze({
  noema_log: '(i32,i32)->()',
  noema_now: '()->(f64)',
  noema_random: '()->(f64)',
});
export const STEP_SIGS: readonly string[] = ['(i32,i32,i32,i32)->()', '(i32,i32,i32,i32)->(i32)'];
export const INIT_SIG = '(i32)->()';
const ALLOC_SIG = '(i32)->(i32)';
const KINDS = ['func', 'table', 'memory', 'global', 'tag'] as const;
const VT: Readonly<Record<number, string>> = {
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x7b: 'v128',
  0x70: 'funcref',
  0x6f: 'externref',
};
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ABI_KEYS: readonly string[] = ['version', 'step', 'init', 'maxPages', 'budgetMs', 'scratch', 'initEachStep'],
  MODEL_KEYS: readonly string[] = ['module', 'step', 'init', 'inputs', 'outputs'];
export const LIM = Object.freeze({
  inputs: 64,
  outputs: 24,
  points: 2000,
  budgetMin: 50,
  budgetMax: 5000,
  budgetDefault: 1000,
  logLine: 200,
  logLines: 100,
});
const NO_ABI = '(module "noema": noema_log, noema_now, noema_random, memory)';

type Obj = Readonly<Record<string, unknown>>;
export const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
export const isInt = (v: unknown): v is number => Number.isInteger(v);
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/* ---------- sha256 (synchronous: the spec check runs before the first frame) ---------- */
const SHA = (() => {
  const primes: number[] = [];
  for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n);
  const frac = (x: number): number => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
  return { K: Uint32Array.from(primes, p => frac(Math.cbrt(p))), H: Uint32Array.from(primes.slice(0, 8), p => frac(Math.sqrt(p))) };
})();
const at = (a: Uint32Array, i: number): number => a[i] ?? 0;
export function sha256(bytes: Uint8Array): string {
  const l = bytes.length,
    nb = ((l + 9 + 63) >> 6) << 6,
    m = new Uint8Array(nb);
  m.set(bytes);
  m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(nb - 4, (l * 8) >>> 0);
  dv.setUint32(nb - 8, Math.floor(l / 536870912));
  const H = Uint32Array.from(SHA.H),
    W = new Uint32Array(64),
    K = SHA.K;
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = at(W, i - 15),
        b = at(W, i - 2);
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3),
        s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (at(W, i - 16) + s0 + at(W, i - 7) + s1) >>> 0;
    }
    let a = at(H, 0),
      b = at(H, 1),
      c = at(H, 2),
      d = at(H, 3),
      e = at(H, 4),
      f = at(H, 5),
      g = at(H, 6),
      h = at(H, 7);
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)),
        ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + at(K, i) + at(W, i)) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)),
        mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = at(H, 0) + a;
    H[1] = at(H, 1) + b;
    H[2] = at(H, 2) + c;
    H[3] = at(H, 3) + d;
    H[4] = at(H, 4) + e;
    H[5] = at(H, 5) + f;
    H[6] = at(H, 6) + g;
    H[7] = at(H, 7) + h;
  }
  return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- the binary reader ---------- */
class Bad extends Error {
  readonly bad: string;
  constructor(bad: string) {
    super(bad);
    this.bad = bad;
  }
}
type Limits = readonly [number, number, number | null];
interface Parsed {
  readonly types: readonly (readonly [readonly string[], readonly string[]])[];
  readonly imports: readonly { module: string; name: string; kind: string; type: number | null; limits?: Limits }[];
  readonly funcs: readonly number[];
  readonly memories: readonly Limits[];
  readonly exports: readonly { name: string; kind: string; index: number }[];
  readonly start: boolean;
}
function parse(b: Uint8Array): Parsed {
  if (b.length < 8 || b[0] !== 0 || b[1] !== 0x61 || b[2] !== 0x73 || b[3] !== 0x6d || b[4] !== 1 || b[5] || b[6] || b[7])
    throw new Bad('magic');
  const td = new TextDecoder('utf-8', { fatal: true });
  const R = (start: number, end: number) => {
    const r = {
      i: start,
      end,
      byte(): number {
        if (r.i >= r.end) throw new Bad('truncated');
        return b[r.i++] ?? 0;
      },
      u32(): number {
        let v = 0,
          s = 0;
        for (;;) {
          const x = r.byte();
          v += (x & 0x7f) * Math.pow(2, s);
          s += 7;
          if (!(x & 0x80)) return v;
          if (s > 35) throw new Bad('leb');
        }
      },
      name(): string {
        const n = r.u32();
        if (r.i + n > r.end) throw new Bad('truncated');
        let v: string;
        try {
          v = td.decode(b.subarray(r.i, r.i + n));
        } catch {
          throw new Bad('utf8');
        }
        r.i += n;
        return v;
      },
      limits(): Limits {
        const f = r.byte(),
          mn = r.u32(),
          mx = f & 1 ? r.u32() : null;
        return [f, mn, mx];
      },
    };
    return r;
  };
  const r = R(8, b.length),
    types: [string[], string[]][] = [],
    imports: Parsed['imports'][number][] = [],
    mems: Limits[] = [],
    exports: Parsed['exports'][number][] = [];
  let funcs: number[] = [],
    start = false;
  while (r.i < r.end) {
    const sid = r.byte(),
      size = r.u32(),
      end = r.i + size;
    if (end > r.end) throw new Bad('section ' + String(sid));
    const s = R(r.i, end);
    if (sid === 1)
      for (let n = s.u32(); n--;) {
        if (s.byte() !== 0x60) throw new Bad('section 1');
        const ps: string[] = [];
        for (let k = s.u32(); k--;) ps.push(VT[s.byte()] ?? '?');
        const rs: string[] = [];
        for (let k = s.u32(); k--;) rs.push(VT[s.byte()] ?? '?');
        types.push([ps, rs]);
      }
    else if (sid === 2)
      for (let n = s.u32(); n--;) {
        const mod = s.name(),
          nm = s.name(),
          k = s.byte();
        if (k === 0) imports.push({ module: mod, name: nm, kind: 'func', type: s.u32() });
        else if (k === 1) {
          s.byte();
          s.limits();
          imports.push({ module: mod, name: nm, kind: 'table', type: null });
        } else if (k === 2) imports.push({ module: mod, name: nm, kind: 'memory', type: null, limits: s.limits() });
        else if (k === 3) {
          s.byte();
          s.byte();
          imports.push({ module: mod, name: nm, kind: 'global', type: null });
        } else if (k === 4) {
          s.byte();
          s.u32();
          imports.push({ module: mod, name: nm, kind: 'tag', type: null });
        } else throw new Bad('section 2');
      }
    else if (sid === 3) {
      funcs = [];
      for (let n = s.u32(); n--;) funcs.push(s.u32());
    } else if (sid === 5) for (let n = s.u32(); n--;) mems.push(s.limits());
    else if (sid === 7)
      for (let n = s.u32(); n--;) {
        const nm = s.name(),
          k = s.byte(),
          ix = s.u32();
        if (k > 4) throw new Bad('section 7');
        exports.push({ name: nm, kind: KINDS[k] ?? 'func', index: ix });
      }
    else if (sid === 8) start = true;
    else if (sid > 13) throw new Bad('section ' + String(sid));
    r.i = end;
  }
  return { types, imports, funcs, memories: mems, exports, start };
}
const sig = (t: readonly [readonly string[], readonly string[]]): string => '(' + t[0].join(',') + ')->(' + t[1].join(',') + ')';

export interface WasmExport {
  readonly name: string;
  readonly kind: string;
  readonly type: string | null;
}
export interface WasmMemory {
  readonly min: number;
  readonly max: number | null;
  readonly imported: boolean;
  readonly exported: boolean;
}
/** the report of a module (tests/fixtures/parity/activities_wasm.json: the golden reports) */
export interface WasmReport {
  ok: boolean;
  readonly errors: string[];
  readonly bytes: number;
  readonly sha256: string;
  readonly imports: { module: string; name: string; kind: string; type: string | null }[];
  readonly exports: WasmExport[];
  memory: WasmMemory | null;
  start: boolean;
}
export function inspect(
  bytes: Uint8Array | ArrayBuffer | ArrayLike<number>,
  maxPages: unknown = PAGES_DEFAULT,
  step = 'step',
  init = 'init',
): WasmReport {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayLike<number>),
    E: string[] = [];
  const rep: WasmReport = {
    ok: false,
    errors: E,
    bytes: b.length,
    sha256: sha256(b),
    imports: [],
    exports: [],
    memory: null,
    start: false,
  };
  const lim = isInt(maxPages) ? Math.max(1, Math.min(maxPages, PAGES_CAP)) : PAGES_DEFAULT;
  if (b.length > MAX_BYTES) {
    E.push(`size: the module is ${b.length} bytes (at most ${MAX_BYTES})`);
    return rep;
  }
  let m: Parsed;
  try {
    m = parse(b);
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    E.push(e.bad === 'magic' ? 'format: not a WebAssembly module (magic or version)' : `format: the module is malformed (${e.bad})`);
    return rep;
  }
  const T = m.types,
    tsig = (i: number | null): string => {
      const t = i != null && i >= 0 ? T[i] : undefined;
      return t ? sig(t) : '?';
    };
  const fsigs = [...m.imports.filter(i => i.kind === 'func').map(i => tsig(i.type)), ...m.funcs.map(tsig)];
  let mem: { min: number; max: number | null; imported: boolean; exported: boolean; flags: number } | null = null;
  for (const im of m.imports) {
    rep.imports.push({ module: im.module, name: im.name, kind: im.kind, type: im.kind === 'func' ? tsig(im.type) : null });
    const where = `${im.module}.${im.name}`;
    if (!ABI_MODULES.includes(im.module)) {
      E.push(`import: ${where} (${im.kind}) is not in the host ABI ${NO_ABI}`);
      continue;
    }
    const want = own(ABI_FUNCS, im.name) ? ABI_FUNCS[im.name] : undefined;
    if (im.kind === 'func' && want != null) {
      const got = tsig(im.type);
      if (got !== want) E.push(`import: ${where} must be ${want}, it is ${got}`);
    } else if (im.kind === 'memory' && im.name === 'memory' && im.limits) {
      const [f, mn, mx] = im.limits;
      if (mem) E.push('memory: at most one memory');
      mem = { min: mn, max: mx, imported: true, exported: false, flags: f };
    } else E.push(`import: ${where} (${im.kind}) is not in the host ABI ${NO_ABI}`);
  }
  for (const [f, mn, mx] of m.memories) {
    if (mem) {
      E.push('memory: at most one memory');
      continue;
    }
    mem = { min: mn, max: mx, imported: false, exported: false, flags: f };
  }
  const ex: Record<string, WasmExport> = {};
  for (const e of m.exports) {
    const t = e.kind === 'func' ? (fsigs[e.index] ?? '?') : null;
    const x = { name: e.name, kind: e.kind, type: t };
    rep.exports.push(x);
    ex[e.name] = x;
    if (e.kind === 'memory' && mem) mem.exported = mem.exported || e.name === 'memory';
  }
  rep.start = m.start;
  if (!mem) E.push('memory: the module has no memory (define one with a maximum and export it as "memory", or import noema.memory)');
  else {
    if (mem.flags & ~1) E.push('memory: a shared or 64-bit memory is not allowed');
    if (mem.min > lim) E.push(`memory: the initial size is ${mem.min} pages (at most ${lim})`);
    if (mem.max == null && !mem.imported) E.push(`memory: the memory has no maximum (declare one of at most ${lim} pages)`);
    else if (mem.max != null && mem.max > lim) E.push(`memory: the declared maximum is ${mem.max} pages (at most ${lim})`);
    if (!mem.imported && !mem.exported) E.push('export: the memory must be exported as "memory"');
    rep.memory = { min: mem.min, max: mem.max, imported: mem.imported, exported: mem.exported };
  }
  const st = own(ex, step) ? ex[step] : undefined;
  if (st?.kind !== 'func') E.push(`export: no function "${step}"`);
  else if (!STEP_SIGS.includes(st.type ?? '')) E.push(`export: ${step} must be (i32,i32,i32,i32)->() or ->(i32), it is ${String(st.type)}`);
  const it = own(ex, init) ? ex[init] : undefined;
  if (it && (it.kind !== 'func' || it.type !== INIT_SIG)) E.push(`export: ${init} must be a function ${INIT_SIG}`);
  const al = own(ex, 'alloc') ? ex.alloc : undefined;
  if (al && (al.kind !== 'func' || al.type !== ALLOC_SIG)) E.push(`export: alloc must be a function ${ALLOC_SIG}`);
  rep.ok = !E.length;
  return rep;
}

/* ---------- the item and the model ---------- */
export function checkAbi(abi: unknown): string[] {
  const E: string[] = [];
  if (abi == null) return E;
  if (!isObj(abi)) return ['abi: must be an object'];
  for (const k of Object.keys(abi)) if (!ABI_KEYS.includes(k)) E.push(`abi: unknown key ${k}`);
  if ('version' in abi && abi.version !== 1) E.push('abi.version: must be 1');
  for (const k of ['step', 'init']) {
    const v = abi[k];
    if (k in abi && !(typeof v === 'string' && NAME_RE.test(v))) E.push(`abi.${k}: must be the name of an exported function`);
  }
  const { maxPages, budgetMs, scratch } = abi;
  if ('maxPages' in abi && !(isInt(maxPages) && maxPages >= 1 && maxPages <= PAGES_CAP))
    E.push(`abi.maxPages: a whole number from 1 to ${PAGES_CAP}`);
  if ('budgetMs' in abi && !(isInt(budgetMs) && budgetMs >= LIM.budgetMin && budgetMs <= LIM.budgetMax))
    E.push(`abi.budgetMs: a whole number from ${LIM.budgetMin} to ${LIM.budgetMax}`);
  if ('scratch' in abi && !(isInt(scratch) && scratch >= 0 && scratch % 8 === 0)) E.push('abi.scratch: a byte offset, a multiple of 8');
  if ('initEachStep' in abi && typeof abi.initEachStep !== 'boolean') E.push('abi.initEachStep: true or false');
  return E;
}
const DECODED = new Map<string, Uint8Array>(); // sha256 → bytes (a module is decoded and hashed once per page)
export function decode(item: unknown): [Uint8Array | null, string[]] {
  const w = isObj(item) ? item.wasm : null;
  if (!isObj(item) || typeof w !== 'string' || !w) return [null, ['wasm: the module (base64) is required']];
  if (w.length > Math.floor((MAX_BYTES * 4) / 3) + 4) return [null, [`size: the module is more than ${MAX_BYTES} bytes`]];
  const sh = item.sha256;
  const hit = typeof sh === 'string' ? DECODED.get(sh + ':' + String(w.length)) : undefined;
  if (hit)
    return [hit, 'bytes' in item && item.bytes !== hit.length ? [`bytes: ${String(item.bytes)}, but the module has ${hit.length}`] : []];
  let b: Uint8Array;
  try {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(w) || w.length % 4) return [null, ['wasm: not valid base64']];
    b = fromB64(w);
  } catch {
    return [null, ['wasm: not valid base64']];
  }
  if (!(typeof sh === 'string' && /^[0-9a-f]{64}$/.test(sh))) return [b, ['sha256: the sha256 of the module (64 hex digits) is required']];
  if (sha256(b) !== sh) return [b, ['sha256: does not match the module']];
  if ('bytes' in item && item.bytes !== b.length) return [b, [`bytes: ${String(item.bytes)}, but the module has ${b.length}`]];
  if (DECODED.size > 16) DECODED.clear();
  DECODED.set(sh + ':' + String(w.length), b);
  return [b, []];
}
/** the item's ABI with its defaults */
export interface Abi {
  readonly step: string;
  readonly init: string;
  readonly maxPages: number;
  readonly budgetMs: number;
  readonly scratch: number | null;
  readonly initEachStep: boolean;
}
export const abiOf = (item: unknown): Abi => {
  const a = isObj(item) && isObj(item.abi) ? item.abi : {};
  const { step, init, maxPages, budgetMs, scratch } = a;
  return {
    step: typeof step === 'string' ? step : 'step',
    init: typeof init === 'string' ? init : 'init',
    maxPages: isInt(maxPages) && maxPages >= 1 && maxPages <= PAGES_CAP ? maxPages : PAGES_DEFAULT,
    budgetMs: isInt(budgetMs) && budgetMs >= LIM.budgetMin && budgetMs <= LIM.budgetMax ? budgetMs : LIM.budgetDefault,
    scratch: isInt(scratch) && scratch >= 0 && scratch % 8 === 0 ? scratch : null,
    initEachStep: a.initEachStep !== false,
  };
};
export interface ItemCheck {
  readonly problems: readonly string[];
  readonly report: WasmReport | null;
  readonly bytes: Uint8Array | null;
}
/** → { problems, report, bytes } of an activities item of runtime wasm-module@1 */
export function checkItem(item: unknown): ItemCheck {
  if (!isObj(item)) return { problems: ['the item must be an object'], report: null, bytes: null };
  const E: string[] = [];
  if (item.runtime !== RUNTIME) E.push('runtime: must be wasm-module@1');
  E.push(...checkAbi(item.abi));
  const [b, P] = decode(item);
  E.push(...P);
  if (!b || P.length) return { problems: E, report: null, bytes: null };
  const abi = isObj(item.abi) ? item.abi : {},
    A = abiOf(item);
  const rep = inspect(b, A.maxPages, A.step, A.init);
  E.push(...rep.errors);
  if (!rep.errors.length && !rep.exports.some(e => e.name === 'alloc' && e.kind === 'func') && !('scratch' in abi))
    E.push('abi.scratch: the module exports no alloc(bytes); give the byte offset of its input/output area');
  return { problems: E, report: rep, bytes: E.length ? null : b };
}

/** the expression language as the checks have it (src/engines: NoemaCore.engines.expr) */
export interface ExprCheck {
  check(src: string, opts?: { readonly vars?: readonly string[] }): readonly { readonly msg: string }[];
}
/** → problems of spec.model for wasm@1; items: {id: item} (the pack's); expr: the expression language, or null where it is not here */
export function checkModel(spec: unknown, items: Obj, expr: ExprCheck | null = null): string[] {
  const E: string[] = [],
    I = items;
  const m = isObj(spec) ? spec.model : null;
  if (!isObj(spec) || !isObj(m)) return ['spec.model: wasm@1 needs a model {module, inputs, outputs, step?, init?}'];
  for (const k of Object.keys(m)) if (!MODEL_KEYS.includes(k)) E.push(`spec.model: unknown key ${k}`);
  const it = typeof m.module === 'string' && own(I, m.module) ? I[m.module] : null;
  if (!isObj(it) || it.runtime !== RUNTIME)
    E.push(`spec.model.module: no wasm-module@1 item ${JSON.stringify(m.module === undefined ? null : m.module)} in the pack`);
  for (const k of ['step', 'init']) {
    const v = m[k];
    if (k in m && !(typeof v === 'string' && NAME_RE.test(v))) E.push(`spec.model.${k}: must be the name of an exported function`);
  }
  const ins = m.inputs;
  if (!(Array.isArray(ins) && ins.length >= 1 && ins.length <= LIM.inputs))
    E.push(`spec.model.inputs: a list of 1 to ${LIM.inputs} expressions`);
  else {
    const names = isObj(spec.consts) ? Object.keys(spec.consts) : [];
    for (const k of ['params', 'derived']) {
      const list = spec[k];
      for (const x of Array.isArray(list) ? (list as unknown[]) : []) if (isObj(x) && typeof x.id === 'string') names.push(x.id);
    }
    (ins as unknown[]).forEach((src, i) => {
      const w = `spec.model.inputs[${i}]`;
      if (typeof src !== 'string' || !src.trim()) {
        E.push(`${w}: an expression (a text such as “2*x + 1”) is required`);
        return;
      }
      if (expr) {
        const p = expr.check(src, { vars: names });
        const first = p[0];
        if (first) E.push(`${w}: ${first.msg} in “${src.slice(0, 60)}”`);
      }
    });
  }
  const outs = m.outputs,
    decl = new Map<unknown, unknown>();
  for (const o of Array.isArray(spec.outputs) ? (spec.outputs as unknown[]) : []) if (isObj(o)) decl.set(o.id, o.kind);
  if (!(Array.isArray(outs) && outs.length >= 1 && outs.length <= LIM.outputs))
    E.push(`spec.model.outputs: a list of 1 to ${LIM.outputs} {id, n?}`);
  else {
    const seen = new Set<string>();
    (outs as unknown[]).forEach((o, i) => {
      const w = `spec.model.outputs[${i}]`;
      if (!(isObj(o) && typeof o.id === 'string')) {
        E.push(`${w}: must be {id, n?}`);
        return;
      }
      const id = o.id;
      for (const k of Object.keys(o)) if (k !== 'id' && k !== 'n') E.push(`${w}: unknown key ${k}`);
      if (seen.has(id)) E.push(`${w}: ${id} twice`);
      seen.add(id);
      const kind = decl.has(id) ? decl.get(id) : undefined;
      if (kind == null) {
        E.push(`${w}: ${id} is not in spec.outputs`);
        return;
      }
      const n = 'n' in o ? o.n : 1;
      if (kind === 'scalar' && n !== 1) E.push(`${w}: a scalar takes one value (no n)`);
      if (kind === 'series' && !(isInt(n) && n >= 1 && n <= LIM.points)) E.push(`${w}.n: a series needs n, from 1 to ${LIM.points}`);
    });
    for (const oid of decl.keys()) if (!seen.has(oid as string)) E.push(`spec.outputs: ${String(oid)} has no place in spec.model.outputs`);
  }
  if (isObj(it) && !E.length) {
    const abi = isObj(it.abi) ? it.abi : {},
      { problems: P, report: rep } = checkItem(it);
    if (P.length) E.push(`spec.model.module: the module ${String(m.module)} is refused (${String(P[0])})`);
    else if (rep) {
      const fx: Record<string, WasmExport> = {};
      for (const e of rep.exports) if (e.kind === 'func') fx[e.name] = e;
      const st = (m.step || abi.step || 'step') as string;
      if (!own(fx, st) || !STEP_SIGS.includes(fx[st]?.type ?? '')) E.push(`spec.model.step: ${st} is not a step function of the module`);
      const ini = m.init;
      if (typeof ini === 'string' && ini && (!own(fx, ini) || fx[ini]?.type !== INIT_SIG))
        E.push(`spec.model.init: ${ini} is not an init function of the module`);
    }
  }
  return E;
}

/** where each named output of a wasm@1 spec sits in the module's f64 output array */
export interface Layout {
  readonly layout: readonly { readonly id: string; readonly off: number; readonly n: number; readonly series: boolean }[];
  readonly nOut: number;
}
export function layoutOf(spec: Obj): Layout {
  const m = spec.model as Obj,
    kinds = new Map(((spec.outputs ?? []) as readonly Obj[]).map(o => [o.id, o.kind]));
  let off = 0;
  const layout = (m.outputs as readonly Obj[]).map(o => {
    const n = 'n' in o ? (o.n as number) : 1,
      L = { id: o.id as string, off, n, series: kinds.get(o.id) === 'series' };
    off += n;
    return L;
  });
  return { layout, nOut: off };
}

/** the checks the content checks read (src/features/content/domain/env.ts WasmChecks) */
export const WASM_CHECKS = Object.freeze({
  MAX_BYTES,
  PAGES_DEFAULT,
  PAGES_CAP,
  ABI_FUNCS,
  LIM,
  sha256,
  inspect,
  checkAbi,
  checkItem,
  checkModel,
  decode,
  abiOf,
  layoutOf,
});
export type WasmChecksApi = typeof WASM_CHECKS;
