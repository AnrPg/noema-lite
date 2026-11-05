#!/usr/bin/env python3
"""A tiny WAT assembler for the test modules of wasm-module@1 (no external toolchain needed; stdlib only).

It understands the subset the fixtures use — the plain (flat) instruction syntax, which `wat2wasm` accepts too:
  (module
    (import "mod" "name" (func $f (param i32 i32) (result f64)))   (import "mod" "memory" (memory 1 [max]))
    (memory [(export "memory")] min [max])   (data (i32.const N) "text")   (export "name" (func $f))
    (func [$name] [(export "name")] (param [$p] type…)… (result type) (local [$l] type…)…  instr…))
  instructions: block/loop [$label] … end, br/br_if <label|depth>, call $f, local.get/set/tee, i32.const, f64.const,
  loads/stores with offset=N, memory.grow/size, and the numeric ops listed in OPS.
Usage: python3 watasm.py in.wat out.wasm      (or: python3 watasm.py --all  → every *.wat beside this file)"""
import os, re, struct, sys

T = {'i32': 0x7f, 'i64': 0x7e, 'f32': 0x7d, 'f64': 0x7c}
OPS = {'unreachable': 0x00, 'nop': 0x01, 'return': 0x0f, 'drop': 0x1a, 'select': 0x1b,
       'i32.eqz': 0x45, 'i32.eq': 0x46, 'i32.ne': 0x47, 'i32.lt_s': 0x48, 'i32.lt_u': 0x49, 'i32.gt_s': 0x4a, 'i32.gt_u': 0x4b,
       'i32.le_s': 0x4c, 'i32.ge_s': 0x4e, 'f64.eq': 0x61, 'f64.lt': 0x63, 'f64.gt': 0x64,
       'i32.add': 0x6a, 'i32.sub': 0x6b, 'i32.mul': 0x6c, 'i32.and': 0x71, 'i32.or': 0x72, 'i32.xor': 0x73, 'i32.shl': 0x74, 'i32.shr_u': 0x76,
       'f64.abs': 0x99, 'f64.neg': 0x9a, 'f64.sqrt': 0x9f, 'f64.add': 0xa0, 'f64.sub': 0xa1, 'f64.mul': 0xa2, 'f64.div': 0xa3,
       'f64.min': 0xa4, 'f64.max': 0xa5, 'i32.trunc_f64_s': 0xaa, 'f64.convert_i32_s': 0xb7, 'f64.convert_i32_u': 0xb8}
MEM = {'i32.load': (0x28, 2), 'f64.load': (0x2b, 3), 'i32.load8_u': (0x2d, 0), 'i32.store': (0x36, 2), 'f64.store': (0x39, 3), 'i32.store8': (0x3a, 0)}


def uleb(n):
    out = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return bytes(out)


def sleb(n):
    out = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        if (n == 0 and not b & 0x40) or (n == -1 and b & 0x40): out.append(b); return bytes(out)
        out.append(b | 0x80)


def name(s):
    b = s if isinstance(s, bytes) else s.encode('utf-8'); return uleb(len(b)) + b


def vec(items): return uleb(len(items)) + b''.join(items)


def tokenize(src):
    src = re.sub(r';;[^\n]*', '', src)
    src = re.sub(r'\(;.*?;\)', '', src, flags=re.S)
    return re.findall(r'"(?:[^"\\]|\\.)*"|[()]|[^\s()"]+', src)


def parse(tokens):
    stack = [[]]
    for t in tokens:
        if t == '(': stack.append([])
        elif t == ')': x = stack.pop(); stack[-1].append(x)
        else: stack[-1].append(t)
    return stack[0][0]


def unstr(s):
    body = s[1:-1]; out = bytearray(); i = 0
    while i < len(body):
        c = body[i]
        if c == '\\':
            n = body[i + 1]
            if n in 'nt"\\\'': out += {'n': b'\n', 't': b'\t', '"': b'"', '\\': b'\\', "'": b"'"}[n]; i += 2
            else: out.append(int(body[i + 1:i + 3], 16)); i += 3
        else: out += c.encode('utf-8'); i += 1
    return bytes(out)


def assemble(src):
    mod = parse(tokenize(src))
    assert mod[0] == 'module', 'not a module'
    types, imports, funcs, exports, data, mems = [], [], [], [], [], []
    fnames = {}

    def sig(parts):
        ps, rs, pnames = [], [], []
        for p in parts:
            if isinstance(p, list) and p[0] == 'param':
                rest = p[1:]
                if rest and rest[0].startswith('$'): pnames.append(rest[0]); ps.append(T[rest[1]])
                else:
                    for x in rest: pnames.append(None); ps.append(T[x])
            elif isinstance(p, list) and p[0] == 'result': rs += [T[x] for x in p[1:]]
        key = (tuple(ps), tuple(rs))
        if key not in types: types.append(key)
        return types.index(key), pnames

    nimp = 0
    for f in mod[1:]:
        if f[0] == 'import' and f[3][0] == 'func':
            d = f[3]; nm = d[1] if len(d) > 1 and isinstance(d[1], str) and d[1].startswith('$') else None
            ti, _ = sig(d[1:]); imports.append((unstr(f[1]), unstr(f[2]), 0, uleb(ti)))
            if nm: fnames[nm] = nimp
            nimp += 1
        elif f[0] == 'import' and f[3][0] == 'memory':
            lim = [int(x) for x in f[3][1:]]
            imports.append((unstr(f[1]), unstr(f[2]), 2, (b'\x01' + uleb(lim[0]) + uleb(lim[1])) if len(lim) > 1 else (b'\x00' + uleb(lim[0]))))
    k = nimp
    for f in mod[1:]:
        if f[0] == 'func':
            if len(f) > 1 and isinstance(f[1], str) and f[1].startswith('$'): fnames[f[1]] = k
            funcs.append(f); k += 1
    for f in mod[1:]:
        if f[0] == 'memory':
            rest = [x for x in f[1:] if not isinstance(x, list)]
            for x in f[1:]:
                if isinstance(x, list) and x[0] == 'export': exports.append((unstr(x[1]), 2, 0))
            lim = [int(x) for x in rest]
            mems.append((b'\x01' + uleb(lim[0]) + uleb(lim[1])) if len(lim) > 1 else (b'\x00' + uleb(lim[0])))
        elif f[0] == 'export':
            ref = f[2]; exports.append((unstr(f[1]), {'func': 0, 'memory': 2}[ref[0]], fnames[ref[1]] if ref[0] == 'func' else int(ref[1])))
        elif f[0] == 'data':
            off = f[1]; assert off[0] == 'i32.const'
            raw = b''.join(unstr(s) for s in f[2:])
            data.append(b'\x00\x41' + sleb(int(off[1])) + b'\x0b' + uleb(len(raw)) + raw)
    ftypes, codes = [], []
    for i, f in enumerate(funcs):
        idx = nimp + i
        parts = f[1:]
        if parts and isinstance(parts[0], str) and parts[0].startswith('$'): parts = parts[1:]
        heads = [p for p in parts if isinstance(p, list)]
        for p in heads:
            if p[0] == 'export': exports.append((unstr(p[1]), 0, idx))
        ti, pnames = sig(heads); ftypes.append(uleb(ti))
        lnames, ltypes = list(pnames), []
        for p in heads:
            if p[0] == 'local':
                rest = p[1:]
                if rest[0].startswith('$'): lnames.append(rest[0]); ltypes.append(T[rest[1]])
                else:
                    for x in rest: lnames.append(None); ltypes.append(T[x])
        body = [p for p in parts if not isinstance(p, list)]
        out = bytearray(); labels = []; j = 0

        def local(tok): return lnames.index(tok) if tok.startswith('$') else int(tok)

        def label(tok): return len(labels) - 1 - labels.index(tok) if tok.startswith('$') else int(tok)
        while j < len(body):
            op = body[j]; j += 1
            if op in ('block', 'loop'):
                lab = body[j] if j < len(body) and body[j].startswith('$') else None
                if lab: j += 1
                labels.append(lab); out += bytes([0x02 if op == 'block' else 0x03, 0x40])
            elif op == 'end': labels.pop(); out.append(0x0b)
            elif op in ('br', 'br_if'): out.append(0x0c if op == 'br' else 0x0d); out += uleb(label(body[j])); j += 1
            elif op == 'call': out.append(0x10); out += uleb(fnames[body[j]] if body[j].startswith('$') else int(body[j])); j += 1
            elif op in ('local.get', 'local.set', 'local.tee'): out.append({'local.get': 0x20, 'local.set': 0x21, 'local.tee': 0x22}[op]); out += uleb(local(body[j])); j += 1
            elif op == 'i32.const': out.append(0x41); out += sleb(int(body[j], 0)); j += 1
            elif op == 'f64.const': out.append(0x44); out += struct.pack('<d', float(body[j])); j += 1
            elif op in MEM:
                code, align = MEM[op]; off = 0
                while j < len(body) and re.match(r'(offset|align)=', body[j]):
                    kk, vv = body[j].split('='); j += 1
                    if kk == 'offset': off = int(vv)
                    else: align = {1: 0, 2: 1, 4: 2, 8: 3}[int(vv)]
                out.append(code); out += uleb(align) + uleb(off)
            elif op == 'memory.grow': out += b'\x40\x00'
            elif op == 'memory.size': out += b'\x3f\x00'
            elif op in OPS: out.append(OPS[op])
            else: raise ValueError('unknown instruction ' + op)
        out.append(0x0b)
        groups = []
        for t in ltypes:
            if groups and groups[-1][1] == t: groups[-1][0] += 1
            else: groups.append([1, t])
        fb = vec([uleb(n) + bytes([t]) for n, t in groups]) + bytes(out)
        codes.append(uleb(len(fb)) + fb)

    def sec(i, payload): return bytes([i]) + uleb(len(payload)) + payload
    b = bytearray(b'\x00asm\x01\x00\x00\x00')
    b += sec(1, vec([b'\x60' + vec([bytes([x]) for x in p]) + vec([bytes([x]) for x in r]) for p, r in types]))
    if imports: b += sec(2, vec([name(m.decode()) + name(n.decode()) + bytes([kd]) + d for m, n, kd, d in imports]))
    if ftypes: b += sec(3, vec(ftypes))
    if mems: b += sec(5, vec(mems))
    if exports: b += sec(7, vec([name(n) + bytes([kd]) + uleb(ix) for n, kd, ix in exports]))
    if codes: b += sec(10, vec(codes))
    if data: b += sec(11, vec(data))
    return bytes(b)


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    if sys.argv[1:] == ['--all']:
        for f in sorted(os.listdir(here)):
            if f.endswith('.wat'):
                w = assemble(open(os.path.join(here, f), encoding='utf-8').read())
                open(os.path.join(here, f[:-4] + '.wasm'), 'wb').write(w); print(f'{f[:-4]}.wasm  {len(w)} bytes')
    else:
        w = assemble(open(sys.argv[1], encoding='utf-8').read()); open(sys.argv[2], 'wb').write(w); print(f'{sys.argv[2]}  {len(w)} bytes')
