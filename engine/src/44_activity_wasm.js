/* ===================== interactive activities — runtime wasm-module@1 and the sim-spec engine wasm@1 (docs/activities-dev/wasm.md) =====================
   A pack may carry a precompiled WebAssembly module (a C / Rust / AssemblyScript simulation core) as an activities item:
     { id, runtime: 'wasm-module@1', wasm: <base64, at most 2 MiB>, sha256: <hex of the bytes>, bytes?, abi?: { version: 1, step?, init?,
       maxPages?, budgetMs?, scratch?, initEachStep? }, spec?: <a sim-spec@1 spec whose model is this module>, fallback, strings }
   The pack ships ONLY the .wasm, never JS. The module may import nothing but the host ABI (module "noema" or "env"):
     memory (one memory "memory", capped at abi.maxPages) · noema_log(ptr, len) (UTF-8, capped) · noema_now() → f64 ms ·
     noema_random() → f64 in [0, 1), seeded by the activity's seed. Anything else (WASI, JS glue, a table or global) → refused before
     instantiation (inspect(): our own reader of the binary, which the content checks use too; WebAssembly.Module.imports again in the worker).
   It runs in a dedicated blob: Worker whose network globals are removed before anything else (fetch, XHR, WebSocket, EventSource,
   WebTransport, importScripts, Worker, BroadcastChannel, IndexedDB, caches); the page reads and sha256-checks the bytes and hands them
   over — the worker never asks for anything. Every call has a time budget: over it, the worker is terminated (code 'runaway', restartable).
   Two ways in:
     · the engine wasm@1 of sim-spec@1 (ACT.registerEngine): spec.engine 'wasm@1', spec.model { module: <item id>, inputs: [expr…],
       outputs: [{id, n?}…], step?, init? }: step(ptr_in, n_in, ptr_out, n_out) over f64 arrays, mapped to the spec's named outputs, so
       the sim-spec renderer, its plots and the checks grader work unchanged (the sim runtime's 5 s per run is the budget there);
     · the runtime wasm-module@1 (ACT.registerRuntime): an item with its own `spec` is shown by the sim-spec renderer with this engine;
       and window.NoemaWasm.load(item) → a handle { call(fn, inputs, nOut), raw(fn, …ints), restart(), close() } for host code.
   No user-visible text here: failures are codes (spec, unsupported, runaway, abi, import, memory, step, worker). */
(() => {
  /* i18n-ignore-start */   // code, limits and protocol names — no UI text
  const root = typeof window !== 'undefined' ? window : globalThis;
  const MAX_BYTES = 2 * 1024 * 1024, PAGES_DEFAULT = 256, PAGES_CAP = 1024;
  const ABI_MODULES = ['noema', 'env'];
  const ABI_FUNCS = { noema_log: '(i32,i32)->()', noema_now: '()->(f64)', noema_random: '()->(f64)' };
  const STEP_SIGS = ['(i32,i32,i32,i32)->()', '(i32,i32,i32,i32)->(i32)'], INIT_SIG = '(i32)->()', ALLOC_SIG = '(i32)->(i32)';
  const KINDS = ['func', 'table', 'memory', 'global', 'tag'];
  const VT = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128', 0x70: 'funcref', 0x6f: 'externref' };
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
  const ABI_KEYS = ['version', 'step', 'init', 'maxPages', 'budgetMs', 'scratch', 'initEachStep'], MODEL_KEYS = ['module', 'step', 'init', 'inputs', 'outputs'];
  const LIM = { inputs: 64, outputs: 24, points: 2000, budgetMin: 50, budgetMax: 5000, budgetDefault: 1000, logLine: 200, logLines: 100 };
  const NO_ABI = '(module "noema": noema_log, noema_now, noema_random, memory)';
  const isInt = v => Number.isInteger(v);
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /* ---------- sha256 (synchronous: the spec check runs before the first frame) ---------- */
  const SHA = (() => {
    const primes = []; for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n);
    const frac = x => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
    return { K: Uint32Array.from(primes, p => frac(Math.cbrt(p))), H: Uint32Array.from(primes.slice(0, 8), p => frac(Math.sqrt(p))) };
  })();
  function sha256(bytes) {
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 536870912));
    const H = Uint32Array.from(SHA.H), W = new Uint32Array(64), K = SHA.K;
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
  }
  function fromB64(s) { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

  /* ---------- the binary reader (the content checks and build/noema-tools.cjs use it: one set of rules and messages) ---------- */
  function parse(b) {
    const bad = w => Object.assign(new Error(w), { bad: w });
    if (b.length < 8 || b[0] !== 0 || b[1] !== 0x61 || b[2] !== 0x73 || b[3] !== 0x6d || b[4] !== 1 || b[5] || b[6] || b[7]) throw bad('magic');
    const td = new TextDecoder('utf-8', { fatal: true });
    const R = (i, end) => ({ i, end,
      byte() { if (this.i >= this.end) throw bad('truncated'); return b[this.i++]; },
      u32() { let r = 0, s = 0; for (;;) { const x = this.byte(); r += (x & 0x7f) * Math.pow(2, s); s += 7; if (!(x & 0x80)) return r; if (s > 35) throw bad('leb'); } },
      name() { const n = this.u32(); if (this.i + n > this.end) throw bad('truncated'); let v; try { v = td.decode(b.subarray(this.i, this.i + n)); } catch (e) { throw bad('utf8'); } this.i += n; return v; },
      limits() { const f = this.byte(), mn = this.u32(), mx = f & 1 ? this.u32() : null; return [f, mn, mx]; } });
    const r = R(8, b.length), types = [], imports = [], mems = [], exports = []; let funcs = [], start = false;
    while (r.i < r.end) {
      const sid = r.byte(), size = r.u32(), end = r.i + size;
      if (end > r.end) throw bad('section ' + sid);
      const s = R(r.i, end);
      if (sid === 1) for (let n = s.u32(); n--;) { if (s.byte() !== 0x60) throw bad('section 1'); const ps = []; for (let k = s.u32(); k--;) ps.push(VT[s.byte()] || '?'); const rs = []; for (let k = s.u32(); k--;) rs.push(VT[s.byte()] || '?'); types.push([ps, rs]); }
      else if (sid === 2) for (let n = s.u32(); n--;) {
        const mod = s.name(), nm = s.name(), k = s.byte();
        if (k === 0) imports.push({ module: mod, name: nm, kind: 'func', type: s.u32() });
        else if (k === 1) { s.byte(); s.limits(); imports.push({ module: mod, name: nm, kind: 'table', type: null }); }
        else if (k === 2) imports.push({ module: mod, name: nm, kind: 'memory', type: null, limits: s.limits() });
        else if (k === 3) { s.byte(); s.byte(); imports.push({ module: mod, name: nm, kind: 'global', type: null }); }
        else if (k === 4) { s.byte(); s.u32(); imports.push({ module: mod, name: nm, kind: 'tag', type: null }); }
        else throw bad('section 2');
      }
      else if (sid === 3) { funcs = []; for (let n = s.u32(); n--;) funcs.push(s.u32()); }
      else if (sid === 5) for (let n = s.u32(); n--;) mems.push(s.limits());
      else if (sid === 7) for (let n = s.u32(); n--;) { const nm = s.name(), k = s.byte(), ix = s.u32(); if (k > 4) throw bad('section 7'); exports.push({ name: nm, kind: KINDS[k], index: ix }); }
      else if (sid === 8) start = true;
      else if (sid > 13) throw bad('section ' + sid);
      r.i = end;
    }
    return { types, imports, funcs, memories: mems, exports, start };
  }
  const sig = t => '(' + t[0].join(',') + ')->(' + t[1].join(',') + ')';
  /** → { ok, errors, bytes, sha256, imports, exports, memory, start } (tests/fixtures/parity/activities_wasm.json: the golden reports) */
  function inspect(bytes, maxPages = PAGES_DEFAULT, step = 'step', init = 'init') {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), E = [];
    const rep = { ok: false, errors: E, bytes: b.length, sha256: sha256(b), imports: [], exports: [], memory: null, start: false };
    const lim = isInt(maxPages) ? Math.max(1, Math.min(maxPages, PAGES_CAP)) : PAGES_DEFAULT;
    if (b.length > MAX_BYTES) { E.push(`size: the module is ${b.length} bytes (at most ${MAX_BYTES})`); return rep; }
    let m; try { m = parse(b); } catch (e) { if (!e.bad) throw e; E.push(e.bad === 'magic' ? 'format: not a WebAssembly module (magic or version)' : `format: the module is malformed (${e.bad})`); return rep; }
    const T = m.types, tsig = i => i >= 0 && i < T.length ? sig(T[i]) : '?';
    const fsigs = [...m.imports.filter(i => i.kind === 'func').map(i => tsig(i.type)), ...m.funcs.map(tsig)];
    let mem = null;
    for (const im of m.imports) {
      rep.imports.push({ module: im.module, name: im.name, kind: im.kind, type: im.kind === 'func' ? tsig(im.type) : null });
      const where = `${im.module}.${im.name}`;
      if (!ABI_MODULES.includes(im.module)) { E.push(`import: ${where} (${im.kind}) is not in the host ABI ${NO_ABI}`); continue; }
      if (im.kind === 'func' && own(ABI_FUNCS, im.name)) { const got = tsig(im.type); if (got !== ABI_FUNCS[im.name]) E.push(`import: ${where} must be ${ABI_FUNCS[im.name]}, it is ${got}`); }
      else if (im.kind === 'memory' && im.name === 'memory') { const [f, mn, mx] = im.limits; if (mem) E.push('memory: at most one memory'); mem = { min: mn, max: mx, imported: true, exported: false, flags: f }; }
      else E.push(`import: ${where} (${im.kind}) is not in the host ABI ${NO_ABI}`);
    }
    for (const [f, mn, mx] of m.memories) { if (mem) { E.push('memory: at most one memory'); continue; } mem = { min: mn, max: mx, imported: false, exported: false, flags: f }; }
    const ex = {};
    for (const e of m.exports) {
      const t = e.kind === 'func' ? (e.index < fsigs.length ? fsigs[e.index] : '?') : null;
      const x = { name: e.name, kind: e.kind, type: t }; rep.exports.push(x); ex[e.name] = x;
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
    const st = own(ex, step) ? ex[step] : null;
    if (!st || st.kind !== 'func') E.push(`export: no function "${step}"`);
    else if (!STEP_SIGS.includes(st.type)) E.push(`export: ${step} must be (i32,i32,i32,i32)->() or ->(i32), it is ${st.type}`);
    const it = own(ex, init) ? ex[init] : null;
    if (it && (it.kind !== 'func' || it.type !== INIT_SIG)) E.push(`export: ${init} must be a function ${INIT_SIG}`);
    const al = own(ex, 'alloc') ? ex.alloc : null;
    if (al && (al.kind !== 'func' || al.type !== ALLOC_SIG)) E.push(`export: alloc must be a function ${ALLOC_SIG}`);
    rep.ok = !E.length;
    return rep;
  }

  /* ---------- the item and the model (the twins of check_abi / decode / check_item / check_model) ---------- */
  function checkAbi(abi) {
    const E = [];
    if (abi == null) return E;
    if (!isObj(abi)) return ['abi: must be an object'];
    for (const k of Object.keys(abi)) if (!ABI_KEYS.includes(k)) E.push(`abi: unknown key ${k}`);
    if ('version' in abi && abi.version !== 1) E.push('abi.version: must be 1');
    for (const k of ['step', 'init']) if (k in abi && !(typeof abi[k] === 'string' && NAME_RE.test(abi[k]))) E.push(`abi.${k}: must be the name of an exported function`);
    if ('maxPages' in abi && !(isInt(abi.maxPages) && abi.maxPages >= 1 && abi.maxPages <= PAGES_CAP)) E.push(`abi.maxPages: a whole number from 1 to ${PAGES_CAP}`);
    if ('budgetMs' in abi && !(isInt(abi.budgetMs) && abi.budgetMs >= LIM.budgetMin && abi.budgetMs <= LIM.budgetMax)) E.push(`abi.budgetMs: a whole number from ${LIM.budgetMin} to ${LIM.budgetMax}`);
    if ('scratch' in abi && !(isInt(abi.scratch) && abi.scratch >= 0 && abi.scratch % 8 === 0)) E.push('abi.scratch: a byte offset, a multiple of 8');
    if ('initEachStep' in abi && typeof abi.initEachStep !== 'boolean') E.push('abi.initEachStep: true or false');
    return E;
  }
  const DECODED = new Map();   // sha256 → bytes (a module is decoded and hashed once per page)
  function decode(item) {
    const w = isObj(item) ? item.wasm : null;
    if (typeof w !== 'string' || !w) return [null, ['wasm: the module (base64) is required']];
    if (w.length > Math.floor(MAX_BYTES * 4 / 3) + 4) return [null, [`size: the module is more than ${MAX_BYTES} bytes`]];
    if (typeof item.sha256 === 'string' && DECODED.has(item.sha256 + ':' + w.length)) { const b = DECODED.get(item.sha256 + ':' + w.length); return [b, 'bytes' in item && item.bytes !== b.length ? [`bytes: ${item.bytes}, but the module has ${b.length}`] : []]; }
    let b; try { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(w) || w.length % 4) throw 0; b = fromB64(w); } catch (e) { return [null, ['wasm: not valid base64']]; }
    const sh = item.sha256;
    if (!(typeof sh === 'string' && /^[0-9a-f]{64}$/.test(sh))) return [b, ['sha256: the sha256 of the module (64 hex digits) is required']];
    if (sha256(b) !== sh) return [b, ['sha256: does not match the module']];
    if ('bytes' in item && item.bytes !== b.length) return [b, [`bytes: ${item.bytes}, but the module has ${b.length}`]];
    if (DECODED.size > 16) DECODED.clear();
    DECODED.set(sh + ':' + w.length, b);
    return [b, []];
  }
  const abiOf = item => {
    const a = isObj(item?.abi) ? item.abi : {};
    return { step: typeof a.step === 'string' ? a.step : 'step', init: typeof a.init === 'string' ? a.init : 'init',
      maxPages: isInt(a.maxPages) && a.maxPages >= 1 && a.maxPages <= PAGES_CAP ? a.maxPages : PAGES_DEFAULT,
      budgetMs: isInt(a.budgetMs) && a.budgetMs >= LIM.budgetMin && a.budgetMs <= LIM.budgetMax ? a.budgetMs : LIM.budgetDefault,
      scratch: isInt(a.scratch) && a.scratch >= 0 && a.scratch % 8 === 0 ? a.scratch : null, initEachStep: a.initEachStep !== false };
  };
  /** → { problems, report, bytes } of an activities item of runtime wasm-module@1 */
  function checkItem(item) {
    if (!isObj(item)) return { problems: ['the item must be an object'], report: null, bytes: null };
    const E = [];
    if (item.runtime !== 'wasm-module@1') E.push('runtime: must be wasm-module@1');
    E.push(...checkAbi(item.abi));
    const [b, P] = decode(item); E.push(...P);
    if (!b || P.length) return { problems: E, report: null, bytes: null };
    const abi = isObj(item.abi) ? item.abi : {}, A = abiOf(item);
    const rep = inspect(b, A.maxPages, A.step, A.init); E.push(...rep.errors);
    if (!rep.errors.length && !rep.exports.some(e => e.name === 'alloc' && e.kind === 'func') && !('scratch' in abi))
      E.push('abi.scratch: the module exports no alloc(bytes); give the byte offset of its input/output area');
    return { problems: E, report: rep, bytes: E.length ? null : b };
  }
  const REG = {};   // items the page registered (NoemaWasm.register), besides ACT.ITEMS of the open pack
  // the open pack's items: engine.js declares ACT with const (a global binding, not a property of window), the harness with var
  const packItems = () => { const A = typeof ACT !== 'undefined' ? ACT : root.ACT; return A && isObj(A.ITEMS) ? A.ITEMS : null; };
  const itemOf = id => { if (typeof id !== 'string') return null; const I = packItems(); return I && own(I, id) ? I[id] : own(REG, id) ? REG[id] : null; };
  const allItems = () => Object.assign({}, REG, packItems() || {});
  /** → problems of spec.model for wasm@1; items: {id: item} (default: the open pack's) */
  function checkModel(spec, items) {
    const E = [], I = items || allItems();
    const m = isObj(spec) ? spec.model : null;
    if (!isObj(m)) return ['spec.model: wasm@1 needs a model {module, inputs, outputs, step?, init?}'];
    for (const k of Object.keys(m)) if (!MODEL_KEYS.includes(k)) E.push(`spec.model: unknown key ${k}`);
    const it = typeof m.module === 'string' && own(I, m.module) ? I[m.module] : null;
    if (!isObj(it) || it.runtime !== 'wasm-module@1') E.push(`spec.model.module: no wasm-module@1 item ${JSON.stringify(m.module === undefined ? null : m.module)} in the pack`);
    for (const k of ['step', 'init']) if (k in m && !(typeof m[k] === 'string' && NAME_RE.test(m[k]))) E.push(`spec.model.${k}: must be the name of an exported function`);
    const ins = m.inputs;
    if (!(Array.isArray(ins) && ins.length >= 1 && ins.length <= LIM.inputs)) E.push(`spec.model.inputs: a list of 1 to ${LIM.inputs} expressions`);
    else {
      const names = isObj(spec.consts) ? Object.keys(spec.consts) : [];
      for (const k of ['params', 'derived']) for (const x of Array.isArray(spec[k]) ? spec[k] : []) if (isObj(x) && typeof x.id === 'string') names.push(x.id);
      ins.forEach((src, i) => {
        const w = `spec.model.inputs[${i}]`;
        if (typeof src !== 'string' || !src.trim()) { E.push(`${w}: an expression (a text such as “2*x + 1”) is required`); return; }
        const X = root.NoemaCore?.engines?.expr; if (X) { const p = X.check(src, { vars: names }); if (p.length) E.push(`${w}: ${p[0].msg} in “${src.slice(0, 60)}”`); }
      });
    }
    const outs = m.outputs, decl = new Map();
    for (const o of Array.isArray(spec.outputs) ? spec.outputs : []) if (isObj(o)) decl.set(o.id, o.kind);
    if (!(Array.isArray(outs) && outs.length >= 1 && outs.length <= LIM.outputs)) E.push(`spec.model.outputs: a list of 1 to ${LIM.outputs} {id, n?}`);
    else {
      const seen = new Set();
      outs.forEach((o, i) => {
        const w = `spec.model.outputs[${i}]`;
        if (!(isObj(o) && typeof o.id === 'string')) { E.push(`${w}: must be {id, n?}`); return; }
        for (const k of Object.keys(o)) if (k !== 'id' && k !== 'n') E.push(`${w}: unknown key ${k}`);
        if (seen.has(o.id)) E.push(`${w}: ${o.id} twice`);
        seen.add(o.id);
        const kind = decl.has(o.id) ? decl.get(o.id) : undefined;
        if (kind == null) { E.push(`${w}: ${o.id} is not in spec.outputs`); return; }
        const n = 'n' in o ? o.n : 1;
        if (kind === 'scalar' && n !== 1) E.push(`${w}: a scalar takes one value (no n)`);
        if (kind === 'series' && !(isInt(n) && n >= 1 && n <= LIM.points)) E.push(`${w}.n: a series needs n, from 1 to ${LIM.points}`);
      });
      for (const oid of decl.keys()) if (!seen.has(oid)) E.push(`spec.outputs: ${oid} has no place in spec.model.outputs`);
    }
    if (isObj(it) && !E.length) {
      const abi = isObj(it.abi) ? it.abi : {}, { problems: P, report: rep } = checkItem(it);
      if (P.length) E.push(`spec.model.module: the module ${m.module} is refused (${P[0]})`);
      else if (rep) {
        const fx = {}; for (const e of rep.exports) if (e.kind === 'func') fx[e.name] = e;
        const st = m.step || abi.step || 'step';
        if (!own(fx, st) || !STEP_SIGS.includes(fx[st].type)) E.push(`spec.model.step: ${st} is not a step function of the module`);
        const ini = m.init;
        if (ini && (!own(fx, ini) || fx[ini].type !== INIT_SIG)) E.push(`spec.model.init: ${ini} is not an init function of the module`);
      }
    }
    return E;
  }

  /* ---------- the worker: no network, the host ABI, the engine adapter (one source, also run in node by the tests) ---------- */
  /** removes every way to the network from a worker's global scope (and its prototypes) before any other code runs there */
  function neutralise(g) {
    const K = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'importScripts', 'Worker', 'SharedWorker',
      'BroadcastChannel', 'indexedDB', 'caches', 'Request', 'navigator', 'RTCPeerConnection'];
    for (const k of K) for (let o = g; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      try { Object.defineProperty(o, k, { value: undefined, writable: false, configurable: false, enumerable: false }); } catch (e) { try { delete o[k]; } catch (e2) { } }
    }
  }
  /** defines g.noemaWasmCore (instantiate + call) and g.noemaEngine (the wasm@1 adapter of sim-spec@1) */
  function wasmWorker(g) {
    const ABI = { noema_log: 1, noema_now: 1, noema_random: 1 }, LOG_LINE = 200, LOG_LINES = 100;
    function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
    /** bytes (or a WebAssembly.Module) + abi → an instance { call(fn, Float64Array, nOut) → Float64Array, raw(fn, args), reseed(), log } */
    function instantiate(src, abi, seed) {
      const mod = src instanceof WebAssembly.Module ? src : new WebAssembly.Module(src);
      for (const im of WebAssembly.Module.imports(mod)) {   // the second line of the import check (the first: inspect on the page)
        const okm = im.module === 'noema' || im.module === 'env';
        if (!okm || !((im.kind === 'function' && ABI[im.name]) || (im.kind === 'memory' && im.name === 'memory'))) throw fail('import', im.module + '.' + im.name);
      }
      const log = [], t0 = (g.performance || Date).now(); let rand = rng(seed), mem = null, dropped = 0;
      const env = {
        noema_log(p, n) {
          if (log.length >= LOG_LINES) { dropped++; return; }
          try { const len = Math.max(0, Math.min(n >>> 0, LOG_LINE)), u = new Uint8Array(mem.buffer, p >>> 0, len); log.push(new TextDecoder().decode(u.slice())); } catch (e) { log.push('?'); }
        },
        noema_now: () => Math.round(((g.performance || Date).now() - t0) * 10) / 10,
        noema_random: () => rand(),
      };
      const imp = { noema: env, env };
      const memImp = WebAssembly.Module.imports(mod).find(i => i.kind === 'memory');
      if (memImp) { const m0 = Math.max(1, abi.memMin || 1); mem = new WebAssembly.Memory({ initial: m0, maximum: Math.max(m0, Math.min(abi.memMax == null ? abi.maxPages : abi.memMax, abi.maxPages)) }); imp[memImp.module] = Object.assign({}, env, { memory: mem }); }
      const inst = new WebAssembly.Instance(mod, imp), X = inst.exports;
      if (!mem) { mem = X.memory; if (!(mem instanceof WebAssembly.Memory)) throw fail('memory', 'no exported memory'); }
      if (typeof X[abi.step] !== 'function') throw fail('abi', 'no step ' + abi.step);
      let area = null;
      function io(nIn, nOut) {
        const need = 8 * (nIn + nOut);
        if (!area || area.need < need) {
          let base = abi.scratch;
          if (typeof X.alloc === 'function') base = X.alloc(need) >>> 0;
          if (!(base >= 0)) throw fail('abi', 'no input/output area');
          area = { need, pin: base, pout: base + 8 * nIn };
        }
        if (area.pout - area.pin !== 8 * nIn) area = Object.assign({}, area, { pout: area.pin + 8 * nIn });
        if (area.pin + need > mem.buffer.byteLength) throw fail('abi', 'the input/output area is outside the memory');
        return area;
      }
      function call(fn, input, nOut) {
        const f = X[fn]; if (typeof f !== 'function') throw fail('abi', 'no function ' + fn);
        const a = io(input.length, nOut); let dv = new DataView(mem.buffer);
        for (let i = 0; i < input.length; i++) dv.setFloat64(a.pin + 8 * i, +input[i], true);
        const r = f(a.pin, input.length, a.pout, nOut);
        if (typeof r === 'number' && r !== 0) throw fail('step', 'status ' + r);
        dv = new DataView(mem.buffer);   // (the memory may have grown)
        if (a.pout + 8 * nOut > mem.buffer.byteLength) throw fail('abi', 'outputs outside the memory');
        const out = new Float64Array(nOut); for (let i = 0; i < nOut; i++) out[i] = dv.getFloat64(a.pout + 8 * i, true);
        return out;
      }
      const self_ = {
        call, log, exports: Object.keys(X),
        init() { if (typeof X[abi.init] === 'function') X[abi.init](seed | 0); },
        reseed() { rand = rng(seed); },
        raw(fn, args) { const f = X[fn]; if (typeof f !== 'function') throw fail('abi', 'no function ' + fn); const r = f(...(args || []).map(v => v | 0)); return typeof r === 'number' ? r : null; },
        pages: () => mem.buffer.byteLength / 65536,
        takeLog() { const l = log.splice(0); if (dropped) { l.push('… ' + dropped + ' more'); dropped = 0; } return l; },
      };
      self_.init();
      return self_;
    }
    g.noemaWasmCore = { instantiate };
    /** wasm@1 in sim-spec@1: create(spec, {seed}) → { run(inputs) } — inputs come from prepare: { $in: [numbers], $mod: {key, bytes, abi, layout} } */
    g.noemaEngine = { create(spec, opts) {
      const seed = (opts && opts.seed) >>> 0; let inst = null, key = null;
      return { run(inp) {
        const M = inp && inp.$mod; if (!M) throw fail('abi', 'no module');
        if (!inst || key !== M.key) { inst = instantiate(M.bytes, M.abi, seed); key = M.key; }
        else if (M.abi.initEachStep) { inst.reseed(); inst.init(); }
        const out = inst.call(M.abi.step, inp.$in, M.nOut), r = {};
        for (const L of M.layout) r[L.id] = L.series ? Array.from(out.subarray(L.off, L.off + L.n)) : out[L.off];
        const lg = inst.takeLog(); if (lg.length && g.console) g.console.log('[noema] wasm', lg.slice(0, 10).join(' | '));
        return r;
      } };
    } };
  }
  /** the direct protocol of NoemaWasm.load (appended after the core in its own worker; the sim runtime appends its own bridge instead) */
  function directTail(g) {
    let inst = null;
    g.onmessage = e => {
      const m = e.data || {};
      try {
        if (m.t === 'w:load') { inst = g.noemaWasmCore.instantiate(m.bytes, m.abi, m.seed >>> 0); g.postMessage({ t: 'w:ready', id: m.id, exports: inst.exports, log: inst.takeLog(), pages: inst.pages() }); return; }
        if (!inst) throw Object.assign(new Error('not loaded'), { code: 'abi' });
        const t0 = (g.performance || Date).now();
        if (m.t === 'w:call') { if (m.reinit) { inst.reseed(); inst.init(); } const out = inst.call(m.fn, m.input, m.nOut); g.postMessage({ t: 'w:out', id: m.id, out, log: inst.takeLog(), ms: (g.performance || Date).now() - t0, pages: inst.pages() }, [out.buffer]); return; }
        if (m.t === 'w:raw') { const v = inst.raw(m.fn, m.args); g.postMessage({ t: 'w:out', id: m.id, value: v, log: inst.takeLog(), pages: inst.pages() }); return; }
      } catch (x) { g.postMessage({ t: 'w:err', id: m.id, code: (x && x.code) || (x instanceof WebAssembly.RuntimeError ? 'trap' : x instanceof WebAssembly.LinkError ? 'import' : 'error'), msg: String((x && x.message) || x).slice(0, 300) }); }
    };
  }
  const workerSource = () => '"use strict";(' + neutralise.toString() + ')(self);\n(' + wasmWorker.toString() + ')(self);\n';

  /* ---------- the host side: NoemaWasm.load(item) → a handle in its own worker, each call within the budget ---------- */
  function load(item, o = {}) {
    const { problems, report, bytes } = checkItem(item);
    if (problems.length) return Promise.reject(Object.assign(new Error(problems[0]), { code: /^import/.test(problems[0]) ? 'import' : /^memory/.test(problems[0]) ? 'memory' : 'spec', problems }));
    if (typeof Worker !== 'function' || typeof Blob !== 'function') return Promise.reject(Object.assign(new Error('no worker here'), { code: 'worker' }));
    const A = abiOf(item), budget = isInt(o.budgetMs) ? Math.max(LIM.budgetMin, Math.min(o.budgetMs, LIM.budgetMax)) : A.budgetMs;
    const abi = { step: A.step, init: A.init, maxPages: A.maxPages, scratch: A.scratch, memMin: report.memory ? report.memory.min : 1, memMax: report.memory ? report.memory.max : null };
    const seed = (isInt(o.seed) ? o.seed : 1) >>> 0;
    const url = URL.createObjectURL(new Blob([workerSource() + '(' + directTail.toString() + ')(self);'], { type: 'text/javascript' }));
    let w = null, seq = 0, state = 'stopped';
    const pending = new Map();
    const killAll = code => { for (const [, p] of pending) { clearTimeout(p.timer); p.reject(Object.assign(new Error(code), { code })); } pending.clear(); };
    function stop(code) { try { w?.terminate(); } catch (e) { } w = null; state = 'stopped'; killAll(code); }
    function send(msg, transfer) {
      if (!w) return Promise.reject(Object.assign(new Error('stopped'), { code: 'stopped' }));
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { if (!pending.has(id)) return; pending.delete(id); stop('runaway'); reject(Object.assign(new Error('runaway'), { code: 'runaway' })); h.onRunaway?.(); }, msg.t === 'w:load' ? Math.max(1000, budget) : budget);
        pending.set(id, { resolve, reject, timer });
        w.postMessage({ ...msg, id }, transfer || []);
      });
    }
    function start() {
      stop('restart');
      w = new Worker(url); state = 'loading';
      w.onmessage = e => {
        const m = e.data || {}, key = m.id, p = pending.get(key);
        if (!p) return; pending.delete(key); clearTimeout(p.timer);
        if (m.t === 'w:err') p.reject(Object.assign(new Error(m.msg), { code: m.code })); else p.resolve(m);
      };
      w.onerror = e => { e.preventDefault?.(); stop('error'); };
      return send({ t: 'w:load', bytes: bytes.slice(), abi, seed }).then(m => { state = 'ready'; h.exports = m.exports; return h; });
    }
    const h = {
      budgetMs: budget, exports: [], report,
      state: () => state,
      /** fn(ptr_in, n_in, ptr_out, n_out) over f64: → { out: Float64Array, log, ms, pages } */
      call(fn, inputs, nOut, opt = {}) { const input = Float64Array.from(inputs || [], v => +v); return send({ t: 'w:call', fn: fn || A.step, input, nOut: Math.max(0, Math.min(nOut | 0, LIM.outputs * LIM.points)), reinit: opt.reinit ?? A.initEachStep }); },
      /** an exported function with i32 arguments (the tests' grow, a module's own setters) → { value, log, pages } */
      raw: (fn, ...args) => send({ t: 'w:raw', fn, args }),
      restart: () => start(),
      close() { stop('closed'); URL.revokeObjectURL(url); },
      onRunaway: null,
    };
    return start();
  }

  /* ---------- the engine wasm@1 of sim-spec@1, the runtime wasm-module@1 ---------- */
  function layoutOf(spec) {
    const m = spec.model, kinds = new Map((spec.outputs || []).map(o => [o.id, o.kind])); let off = 0;
    const layout = m.outputs.map(o => { const n = 'n' in o ? o.n : 1, L = { id: o.id, off, n, series: kinds.get(o.id) === 'series' }; off += n; return L; });
    return { layout, nOut: off };
  }
  const api = { MAX_BYTES, PAGES_DEFAULT, PAGES_CAP, ABI_FUNCS, LIM, sha256, inspect, checkAbi, checkItem, checkModel, decode, abiOf, layoutOf, load, workerSource,
    register(item) { if (isObj(item) && typeof item.id === 'string') REG[item.id] = item; }, _neutralise: neutralise, _wasmWorker: wasmWorker, _directTail: directTail };
  root.NoemaWasm = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;

  /** join the app's activity core: at load when it is there already (the activity harness), else engine.js calls it (43_page_runtimes.js) */
  api.registerWith = function registerWith(ACTREF) {
  if (!ACTREF || typeof ACTREF.registerEngine !== 'function') return;
  ACTREF.registerEngine({
    id: 'wasm@1',
    /** after the common checks: the model, the item, its sha256, its imports and memory — refused here means the fallback, never instantiation */
    check: spec => checkModel(spec),
    /** on the main thread: the inputs' expressions become numbers; the checked bytes travel with each run (the worker keeps one instance per module) */
    prepare(spec, compile) {
      const m = spec.model, it = itemOf(m.module), A = abiOf(it), { problems, bytes, report } = checkItem(it);
      if (problems.length || !bytes) throw Object.assign(new Error('wasm module refused'), { code: 'spec' });
      const ins = m.inputs.map(s => compile(s)), { layout, nOut } = layoutOf(spec);
      const M = { key: report.sha256, bytes, nOut, layout, abi: { step: m.step || A.step, init: m.init || A.init, maxPages: A.maxPages, scratch: A.scratch, initEachStep: A.initEachStep, memMin: report.memory ? report.memory.min : 1, memMax: report.memory ? report.memory.max : null } };
      const ev = (f, env) => { try { return +f(env); } catch (e) { return NaN; } };
      return env => ({ $in: ins.map(f => ev(f, env)), $mod: M });
    },
    /** the sim runtime calls create here only when it cannot start a worker: a module never runs on the page's own thread */
    create() { throw Object.assign(new Error('wasm@1 runs only in a worker'), { code: 'worker' }); },
    workerSource: workerSource(),
  });
  if (typeof ACTREF.registerRuntime === 'function') ACTREF.registerRuntime({
    id: 'wasm-module@1', version: 1, autoHeight: true,
    /** an item with its own spec: the sim-spec renderer with this module as the engine; without one there is nothing to show */
    mount(box, ctx) {
      const a = ctx.act, sim = ACTREF.runtime?.('sim-spec@1');
      api.register(a);
      if (!sim || !isObj(a.spec)) { Promise.resolve().then(() => ctx.onFail(sim ? 'spec' : 'unsupported')); return { send() { }, close() { }, values: () => null }; }
      const spec = Object.assign({}, a.spec, { engine: 'wasm@1', model: Object.assign({}, a.spec.model, { module: a.id }) });
      return sim.mount(box, Object.assign({}, ctx, { act: Object.assign({}, a, { spec }) }));
    },
  });
  };
  api.registerWith(typeof ACT !== 'undefined' ? ACT : root.ACT);
  /* i18n-ignore-end */
})();
