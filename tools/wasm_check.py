#!/usr/bin/env python3
"""wasm-module@1: check a precompiled WebAssembly module of a pack (docs/activities-dev/wasm.md). Stdlib only.

The twin of NoemaWasm.inspect / checkItem / checkModel in engine/src/44_activity_wasm.js: the SAME rules and the SAME messages
(tests/activities_wasm.js compares them on tests/fixtures/wasm/). A small reader of the binary format: the type, import, function,
memory, export and start sections (every other section is skipped by its size).

  python3 tools/wasm_check.py MODULE.wasm [--max-pages N] [--step NAME] [--init NAME] [--json]
  python3 tools/wasm_check.py --item ITEM.json [--json]          an activities.json item {runtime: wasm-module@1, wasm (base64), sha256, abi}

Rules: at most 2 MiB; imports only from the host ABI (module "noema" or "env"): noema_log (i32,i32)->(), noema_now ()->(f64),
noema_random ()->(f64) and one memory "memory"; no table, global or tag imports; exactly one memory, not shared, not 64-bit, with a
maximum (a memory the module defines must declare one) of at most --max-pages (default 256 = 16 MiB, never above 1024); a memory the
module defines is exported as "memory"; an exported function "step" (i32,i32,i32,i32)->() or ->(i32); "init" if exported (i32)->();
"alloc" if exported (i32)->(i32). Exit status 0 = fine, 1 = refused."""
import base64, hashlib, json, re, sys

MAX_BYTES = 2 * 1024 * 1024
PAGES_DEFAULT, PAGES_CAP = 256, 1024
ABI_MODULES = ('noema', 'env')
ABI_FUNCS = {'noema_log': '(i32,i32)->()', 'noema_now': '()->(f64)', 'noema_random': '()->(f64)'}
STEP_SIGS = ('(i32,i32,i32,i32)->()', '(i32,i32,i32,i32)->(i32)')
INIT_SIG, ALLOC_SIG = '(i32)->()', '(i32)->(i32)'
KINDS = ['func', 'table', 'memory', 'global', 'tag']
VT = {0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128', 0x70: 'funcref', 0x6f: 'externref'}
NAME_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')
ABI_KEYS = ('version', 'step', 'init', 'maxPages', 'budgetMs', 'scratch', 'initEachStep')
MODEL_KEYS = ('module', 'step', 'init', 'inputs', 'outputs')
LIM = {'inputs': 64, 'outputs': 24, 'points': 2000, 'budgetMin': 50, 'budgetMax': 5000}


class Bad(Exception): pass


class R:
    def __init__(self, b, i=0, end=None): self.b, self.i, self.end = b, i, len(b) if end is None else end

    def byte(self):
        if self.i >= self.end: raise Bad('truncated')
        v = self.b[self.i]; self.i += 1; return v

    def u32(self):
        r = s = 0
        while True:
            x = self.byte(); r |= (x & 0x7f) << s; s += 7
            if not x & 0x80: return r
            if s > 35: raise Bad('leb')

    def name(self):
        n = self.u32()
        if self.i + n > self.end: raise Bad('truncated')
        v = bytes(self.b[self.i:self.i + n]); self.i += n
        try: return v.decode('utf-8')
        except UnicodeDecodeError: raise Bad('utf8')

    def limits(self):
        f = self.byte(); mn = self.u32(); mx = self.u32() if f & 1 else None
        return f, mn, mx


def sig(t): return '(' + ','.join(t[0]) + ')->(' + ','.join(t[1]) + ')'


def parse(b):
    """→ the module's shape {types, imports, funcs, memories, exports, start}; raises Bad on a malformed binary"""
    if len(b) < 8 or bytes(b[:4]) != b'\x00asm' or bytes(b[4:8]) != b'\x01\x00\x00\x00': raise Bad('magic')
    r = R(b, 8); types, imports, funcs, mems, exports, start = [], [], [], [], [], False
    while r.i < r.end:
        sid = r.byte(); size = r.u32(); end = r.i + size
        if end > r.end: raise Bad('section %d' % sid)
        s = R(b, r.i, end)
        if sid == 1:
            for _ in range(s.u32()):
                if s.byte() != 0x60: raise Bad('section 1')
                ps = [VT.get(s.byte(), '?') for _ in range(s.u32())]; rs = [VT.get(s.byte(), '?') for _ in range(s.u32())]
                types.append((ps, rs))
        elif sid == 2:
            for _ in range(s.u32()):
                mod, nm, k = s.name(), s.name(), s.byte()
                if k == 0: imports.append({'module': mod, 'name': nm, 'kind': 'func', 'type': s.u32()})
                elif k == 1: s.byte(); s.limits(); imports.append({'module': mod, 'name': nm, 'kind': 'table', 'type': None})
                elif k == 2: f, mn, mx = s.limits(); imports.append({'module': mod, 'name': nm, 'kind': 'memory', 'type': None, 'limits': (f, mn, mx)})
                elif k == 3: s.byte(); s.byte(); imports.append({'module': mod, 'name': nm, 'kind': 'global', 'type': None})
                elif k == 4: s.byte(); s.u32(); imports.append({'module': mod, 'name': nm, 'kind': 'tag', 'type': None})
                else: raise Bad('section 2')
        elif sid == 3: funcs = [s.u32() for _ in range(s.u32())]
        elif sid == 5: mems = [s.limits() for _ in range(s.u32())]
        elif sid == 7:
            for _ in range(s.u32()):
                nm, k, ix = s.name(), s.byte(), s.u32()
                if k > 4: raise Bad('section 7')
                exports.append({'name': nm, 'kind': KINDS[k], 'index': ix})
        elif sid == 8: start = True
        elif sid > 13: raise Bad('section %d' % sid)
        r.i = end
    return {'types': types, 'imports': imports, 'funcs': funcs, 'memories': mems, 'exports': exports, 'start': start}


def inspect(b, max_pages=PAGES_DEFAULT, step='step', init='init'):
    """→ {ok, errors, bytes, sha256, imports, exports, memory, start} — the same object as NoemaWasm.inspect"""
    b = bytes(b); E = []
    rep = {'ok': False, 'errors': E, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'imports': [], 'exports': [], 'memory': None, 'start': False}
    lim = max(1, min(int(max_pages), PAGES_CAP)) if isinstance(max_pages, int) and not isinstance(max_pages, bool) else PAGES_DEFAULT
    if len(b) > MAX_BYTES: E.append(f'size: the module is {len(b)} bytes (at most {MAX_BYTES})'); return rep
    try: m = parse(b)
    except Bad as e:
        E.append('format: not a WebAssembly module (magic or version)' if str(e) == 'magic' else f'format: the module is malformed ({e})'); return rep
    T = m['types']
    tsig = lambda i: sig(T[i]) if 0 <= i < len(T) else '?'
    fsigs = [tsig(i['type']) for i in m['imports'] if i['kind'] == 'func'] + [tsig(t) for t in m['funcs']]
    mem = None
    for im in m['imports']:
        rep['imports'].append({'module': im['module'], 'name': im['name'], 'kind': im['kind'], 'type': tsig(im['type']) if im['kind'] == 'func' else None})
        where = f"{im['module']}.{im['name']}"
        if im['module'] not in ABI_MODULES: E.append(f'import: {where} ({im["kind"]}) is not in the host ABI (module "noema": noema_log, noema_now, noema_random, memory)'); continue
        if im['kind'] == 'func' and im['name'] in ABI_FUNCS:
            got = tsig(im['type'])
            if got != ABI_FUNCS[im['name']]: E.append(f'import: {where} must be {ABI_FUNCS[im["name"]]}, it is {got}')
        elif im['kind'] == 'memory' and im['name'] == 'memory':
            f, mn, mx = im['limits']
            if mem is not None: E.append('memory: at most one memory')
            mem = {'min': mn, 'max': mx, 'imported': True, 'exported': False, 'flags': f}
        else: E.append(f'import: {where} ({im["kind"]}) is not in the host ABI (module "noema": noema_log, noema_now, noema_random, memory)')
    for f, mn, mx in m['memories']:
        if mem is not None: E.append('memory: at most one memory'); continue
        mem = {'min': mn, 'max': mx, 'imported': False, 'exported': False, 'flags': f}
    ex = {}
    for e in m['exports']:
        t = (fsigs[e['index']] if e['index'] < len(fsigs) else '?') if e['kind'] == 'func' else None
        rep['exports'].append({'name': e['name'], 'kind': e['kind'], 'type': t}); ex[e['name']] = rep['exports'][-1]
        if e['kind'] == 'memory' and mem is not None: mem['exported'] = mem['exported'] or (e['name'] == 'memory')
    rep['start'] = m['start']
    if mem is None: E.append('memory: the module has no memory (define one with a maximum and export it as "memory", or import noema.memory)')
    else:
        if mem['flags'] & ~1: E.append('memory: a shared or 64-bit memory is not allowed')
        if mem['min'] > lim: E.append(f'memory: the initial size is {mem["min"]} pages (at most {lim})')
        if mem['max'] is None and not mem['imported']: E.append(f'memory: the memory has no maximum (declare one of at most {lim} pages)')
        elif mem['max'] is not None and mem['max'] > lim: E.append(f'memory: the declared maximum is {mem["max"]} pages (at most {lim})')
        if not mem['imported'] and not mem['exported']: E.append('export: the memory must be exported as "memory"')
        rep['memory'] = {'min': mem['min'], 'max': mem['max'], 'imported': mem['imported'], 'exported': mem['exported']}
    st = ex.get(step)
    if not st or st['kind'] != 'func': E.append(f'export: no function "{step}"')
    elif st['type'] not in STEP_SIGS: E.append(f'export: {step} must be (i32,i32,i32,i32)->() or ->(i32), it is {st["type"]}')
    it = ex.get(init)
    if it and (it['kind'] != 'func' or it['type'] != INIT_SIG): E.append(f'export: {init} must be a function {INIT_SIG}')
    al = ex.get('alloc')
    if al and (al['kind'] != 'func' or al['type'] != ALLOC_SIG): E.append(f'export: alloc must be a function {ALLOC_SIG}')
    rep['ok'] = not E
    return rep


def _int(v): return isinstance(v, int) and not isinstance(v, bool)


def check_abi(abi):
    """→ problems of item.abi"""
    E = []
    if abi is None: return E
    if not isinstance(abi, dict): return ['abi: must be an object']
    for k in abi:
        if k not in ABI_KEYS: E.append(f'abi: unknown key {k}')
    if 'version' in abi and abi['version'] != 1: E.append('abi.version: must be 1')
    for k in ('step', 'init'):
        if k in abi and not (isinstance(abi[k], str) and NAME_RE.fullmatch(abi[k])): E.append(f'abi.{k}: must be the name of an exported function')
    if 'maxPages' in abi and not (_int(abi['maxPages']) and 1 <= abi['maxPages'] <= PAGES_CAP): E.append(f'abi.maxPages: a whole number from 1 to {PAGES_CAP}')
    if 'budgetMs' in abi and not (_int(abi['budgetMs']) and LIM['budgetMin'] <= abi['budgetMs'] <= LIM['budgetMax']): E.append(f'abi.budgetMs: a whole number from {LIM["budgetMin"]} to {LIM["budgetMax"]}')
    if 'scratch' in abi and not (_int(abi['scratch']) and abi['scratch'] >= 0 and abi['scratch'] % 8 == 0): E.append('abi.scratch: a byte offset, a multiple of 8')
    if 'initEachStep' in abi and not isinstance(abi['initEachStep'], bool): E.append('abi.initEachStep: true or false')
    return E


def decode(item):
    """→ (bytes | None, problems): the module of an item, its base64 and sha256 checked"""
    w = item.get('wasm') if isinstance(item, dict) else None
    if not isinstance(w, str) or not w: return None, ['wasm: the module (base64) is required']
    if len(w) > (MAX_BYTES * 4) // 3 + 4: return None, [f'size: the module is more than {MAX_BYTES} bytes']
    try: b = base64.b64decode(w, validate=True)
    except Exception: return None, ['wasm: not valid base64']
    sh = item.get('sha256')
    if not (isinstance(sh, str) and re.fullmatch(r'[0-9a-f]{64}', sh)): return b, ['sha256: the sha256 of the module (64 hex digits) is required']
    if hashlib.sha256(b).hexdigest() != sh: return b, ['sha256: does not match the module']
    if 'bytes' in item and item['bytes'] != len(b): return b, [f'bytes: {item["bytes"]}, but the module has {len(b)}']
    return b, []


def check_item(item):
    """→ (problems, report | None) of an activities.json item of runtime wasm-module@1"""
    if not isinstance(item, dict): return ['the item must be an object'], None
    E = []
    if item.get('runtime') != 'wasm-module@1': E.append('runtime: must be wasm-module@1')
    E += check_abi(item.get('abi'))
    b, P = decode(item); E += P
    if b is None or P: return E, None
    abi = item.get('abi') if isinstance(item.get('abi'), dict) else {}
    mp = abi.get('maxPages') if _int(abi.get('maxPages')) and 1 <= abi['maxPages'] <= PAGES_CAP else PAGES_DEFAULT
    st = abi.get('step') if isinstance(abi.get('step'), str) else 'step'
    ini = abi.get('init') if isinstance(abi.get('init'), str) else 'init'
    rep = inspect(b, mp, st, ini); E += rep['errors']
    if not rep['errors'] and not any(e['name'] == 'alloc' and e['kind'] == 'func' for e in rep['exports']) and 'scratch' not in abi:
        E.append('abi.scratch: the module exports no alloc(bytes); give the byte offset of its input/output area')
    return E, rep


def check_model(spec, items):
    """→ problems of the model of a sim-spec@1 spec with engine wasm@1. items: {id: item} of the pack (activities.json)"""
    E = []
    m = spec.get('model') if isinstance(spec, dict) else None
    if not isinstance(m, dict): return ['spec.model: wasm@1 needs a model {module, inputs, outputs, step?, init?}']
    for k in m:
        if k not in MODEL_KEYS: E.append(f'spec.model: unknown key {k}')
    it = items.get(m.get('module')) if isinstance(m.get('module'), str) else None
    if not isinstance(it, dict) or it.get('runtime') != 'wasm-module@1': E.append(f'spec.model.module: no wasm-module@1 item {json.dumps(m.get("module"), ensure_ascii=False)} in the pack')
    for k in ('step', 'init'):
        if k in m and not (isinstance(m[k], str) and NAME_RE.fullmatch(m[k])): E.append(f'spec.model.{k}: must be the name of an exported function')
    ins = m.get('inputs')
    if not (isinstance(ins, list) and 1 <= len(ins) <= LIM['inputs']): E.append(f'spec.model.inputs: a list of 1 to {LIM["inputs"]} expressions')
    else:
        names = list(spec['consts']) if isinstance(spec.get('consts'), dict) else []
        for k in ('params', 'derived'):
            for x in spec.get(k) or []:
                if isinstance(x, dict) and isinstance(x.get('id'), str): names.append(x['id'])
        try:
            import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import simexpr as SX
        except Exception: SX = None
        for i, src in enumerate(ins):
            w = f'spec.model.inputs[{i}]'
            if not isinstance(src, str) or not src.strip(): E.append(f'{w}: an expression (a text such as “2*x + 1”) is required'); continue
            if SX:
                p = SX.check(src, vars=names)
                if p: E.append(f"{w}: {p[0]['msg']} in “{src[:60]}”")
    outs, decl = m.get('outputs'), {o.get('id'): o.get('kind') for o in (spec.get('outputs') or []) if isinstance(o, dict)}
    if not (isinstance(outs, list) and 1 <= len(outs) <= LIM['outputs']): E.append(f'spec.model.outputs: a list of 1 to {LIM["outputs"]} {{id, n?}}')
    else:
        seen = set()
        for i, o in enumerate(outs):
            w = f'spec.model.outputs[{i}]'
            if not (isinstance(o, dict) and isinstance(o.get('id'), str)): E.append(f'{w}: must be {{id, n?}}'); continue
            for k in o:
                if k not in ('id', 'n'): E.append(f'{w}: unknown key {k}')
            if o['id'] in seen: E.append(f'{w}: {o["id"]} twice')
            seen.add(o['id'])
            kind = decl.get(o['id'])
            if kind is None: E.append(f'{w}: {o["id"]} is not in spec.outputs'); continue
            n = o.get('n', 1)
            if kind == 'scalar' and n != 1: E.append(f'{w}: a scalar takes one value (no n)')
            if kind == 'series' and not (_int(n) and 1 <= n <= LIM['points']): E.append(f'{w}.n: a series needs n, from 1 to {LIM["points"]}')
        for oid, kind in decl.items():
            if oid not in seen: E.append(f'spec.outputs: {oid} has no place in spec.model.outputs')
    if isinstance(it, dict) and not E:
        abi = it.get('abi') if isinstance(it.get('abi'), dict) else {}
        P, rep = check_item(it)
        if P: E.append(f'spec.model.module: the module {m["module"]} is refused ({P[0]})')
        elif rep:
            fx = {e['name']: e for e in rep['exports'] if e['kind'] == 'func'}
            st = m.get('step') or abi.get('step') or 'step'
            if st not in fx or fx[st]['type'] not in STEP_SIGS: E.append(f'spec.model.step: {st} is not a step function of the module')
            ini = m.get('init')
            if ini and (ini not in fx or fx[ini]['type'] != INIT_SIG): E.append(f'spec.model.init: {ini} is not an init function of the module')
    return E


def main(argv):
    js = '--json' in argv; args = [a for a in argv if a != '--json']
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    if '--item' in args:
        item = json.load(open(opt('--item', None), encoding='utf-8')); P, rep = check_item(item)
        out = {'ok': not P, 'errors': P, 'report': rep}
    else:
        files = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or not args[i - 1].startswith('--'))]
        if not files: print(__doc__); return 2
        out = inspect(open(files[0], 'rb').read(), int(opt('--max-pages', PAGES_DEFAULT)), opt('--step', 'step'), opt('--init', 'init'))
    if js: print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    else:
        rep = out.get('report', out) or {}
        print(('✓ fine' if out['ok'] else '✗ refused') + (f" — {rep.get('bytes')} bytes, sha256 {rep.get('sha256')}" if rep else ''))
        for e in out['errors']: print('  ✗ ' + e)
        for i in rep.get('imports', []): print(f"  import {i['module']}.{i['name']} ({i['kind']}{' ' + i['type'] if i['type'] else ''})")
        for e in rep.get('exports', []): print(f"  export {e['name']} ({e['kind']}{' ' + e['type'] if e['type'] else ''})")
        if rep.get('memory'): mm = rep['memory']; print(f"  memory {mm['min']}..{mm['max'] if mm['max'] is not None else '∞'} pages{' (imported)' if mm['imported'] else ''}")
    return 0 if out['ok'] else 1


if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
