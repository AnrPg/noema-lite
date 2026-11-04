#!/usr/bin/env python3
"""Checks an H5P package (.h5p) for the h5p@1 runtime (docs/activities-dev/h5p.md, docs/adr/001 D11). Pure stdlib.

    python3 tools/h5p_check.py ITEM.h5p [MORE.h5p …] [--json]

Errors (the item cannot be used):
  * not a zip / no h5p.json / h5p.json without title, mainLibrary or preloadedDependencies; a path that leaves the package
  * the main library is not an allowed content type; a library (h5p.json's and every library.json's preloadedDependencies,
    transitively) missing from the package, not on the allow-list (tools/h5p_allow.json, machine name + major.minor) or refused
  * a preloadedJs / preloadedCss file a library names is missing
  * content/content.json missing or not JSON; an outside link in it (http://, https://, //host/, YouTube, javascript:, data:text/html)
    — except the attribution fields `source` / `link` of metadata and copyright, which are only shown as text (a warning)
  * a file of a type the runtime does not know (.php, .html, .exe …), a script outside a library folder
  * more than files.maxFiles files or files.maxBytes bytes unpacked
Warnings: a content type the allow-list marks as not yet tested, library folders no content uses (editor libraries), a content
file the content names but the package lacks, the size above files.warnBytes.
The same rules in the app: NoemaH5P.check(files) in engine/src/38_activity_h5p.js (tests/activities_h5p.js keeps them equal)."""
import json, os, re, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOW = json.load(open(os.path.join(HERE, 'h5p_allow.json'), encoding='utf-8'))
URL = re.compile(r'(?i)(\bhttps?:|\bftp:|(^|[\s"\'(=])//[a-z0-9-]+(\.[a-z0-9-]+)+|youtube\.com|youtu\.be|\bjavascript:|\bdata:text/html|\bvbscript:)')
ATTRIBUTION = {'source', 'link', 'licenseExtras', 'changes'}


def allowed(name, mm):
    c = ALLOW['content'].get(name)
    if c and mm in c['versions']: return True
    return mm in ALLOW['libraries'].get(name, [])


def walk(v, path, out):
    """every string in content.json with its key path"""
    if isinstance(v, dict):
        for k, x in v.items(): walk(x, path + [str(k)], out)
    elif isinstance(v, list):
        for i, x in enumerate(v): walk(x, path + [str(i)], out)
    elif isinstance(v, str): out.append((path, v))


def check_files(files):
    """files: {path: bytes} of the unpacked package → {errors, warnings, main, libraries, sizes}"""
    E, W = [], []
    fa = ALLOW['files']
    names = list(files)
    total = sum(len(b) for b in files.values())
    if len(names) > fa['maxFiles']: E.append(f'{len(names)} files (at most {fa["maxFiles"]})')
    if total > fa['maxBytes']: E.append(f'{total} bytes unpacked (at most {fa["maxBytes"]})')
    elif total > fa['warnBytes']: W.append(f'{total // (1024 * 1024)} MB unpacked: large for a phone')
    for n in names:
        if n.startswith('/') or '\\' in n or any(p in ('..', '') for p in n.split('/')) or ':' in n.split('/')[0]: E.append(f'{n}: a path that leaves the package'); continue
        base = n.rsplit('/', 1)[-1]
        ext = base.rsplit('.', 1)[-1].lower() if '.' in base else ''
        if not ext and base not in fa['noExtension']: E.append(f'{n}: a file without a known type')
        elif ext and ext not in fa['extensions']: E.append(f'{n}: files of type .{ext} are not allowed')
        if ext == 'js' and (n.startswith('content/') or '/' not in n): E.append(f'{n}: a script outside a library folder')
    rj = lambda p: json.loads(files[p].decode('utf-8-sig'))
    if 'h5p.json' not in files: E.append('no h5p.json'); return {'errors': E, 'warnings': W}
    try: h5p = rj('h5p.json')
    except Exception as e: E.append(f'h5p.json is not JSON ({e})'); return {'errors': E, 'warnings': W}
    main = h5p.get('mainLibrary'); deps = h5p.get('preloadedDependencies')
    if not isinstance(h5p.get('title'), str) or not h5p.get('title').strip(): E.append('h5p.json: no title')
    if not isinstance(main, str) or not isinstance(deps, list) or not deps: E.append('h5p.json: no mainLibrary or preloadedDependencies'); return {'errors': E, 'warnings': W}
    libs, order, seen = {}, [], set()

    def key(d):
        try: return d['machineName'], f"{int(d['majorVersion'])}.{int(d['minorVersion'])}"
        except Exception: return None

    def visit(d, why):
        k = key(d)
        if not k: E.append(f'{why}: a dependency without machineName / majorVersion / minorVersion'); return
        if k in seen: return
        seen.add(k)
        name, mm = k
        if name in ALLOW['refuse']: E.append(f'{name} {mm}: refused ({ALLOW["refuse"][name]})'); return
        if not allowed(name, mm): E.append(f'{name} {mm}: not on the allow-list (tools/h5p_allow.json)')
        folder = f'{name}-{mm}'
        if f'{folder}/library.json' not in files: E.append(f'{name} {mm}: missing from the package ({folder}/library.json)'); return
        try: lj = rj(f'{folder}/library.json')
        except Exception as e: E.append(f'{folder}/library.json is not JSON'); return
        if lj.get('machineName') != name or f"{lj.get('majorVersion')}.{lj.get('minorVersion')}" != mm: E.append(f'{folder}/library.json names another library')
        for d2 in lj.get('preloadedDependencies') or []: visit(d2, folder)
        for kind in ('preloadedJs', 'preloadedCss'):
            for f in lj.get(kind) or []:
                p = f'{folder}/{f.get("path", "")}'
                if p not in files: E.append(f'{p}: named in {kind} but missing')
        libs[folder] = {'name': name, 'version': f"{mm}.{lj.get('patchVersion', '?')}", 'bytes': sum(len(b) for n, b in files.items() if n.startswith(folder + '/'))}
        order.append(folder)

    for d in deps: visit(d, 'h5p.json')
    mains = [k for k in seen if k[0] == main]
    if not mains: E.append(f'mainLibrary {main} is not among the preloadedDependencies')
    elif main not in ALLOW['content']: E.append(f'{main}: not an allowed content type (tools/h5p_allow.json "content")')
    elif not ALLOW['content'][main].get('tested'): W.append(f'{main}: allowed, but not yet tested in the sandbox ({ALLOW["content"][main].get("only", "check that it plays offline and reports a score")})')
    for top in sorted({n.split('/')[0] for n in names if '/' in n} - {'content'} - set(libs)):
        W.append(f'{top}/: a library no content uses (left out when playing)')
    if 'content/content.json' not in files: E.append('no content/content.json')
    else:
        try:
            c = rj('content/content.json'); strs = []
            walk(c, [], strs)
            for path, s in strs:
                if not URL.search(s): continue
                where = '.'.join(path)
                if path and path[-1] in ATTRIBUTION and any(p in ('metadata', 'copyright') for p in path): W.append(f'content.json {where}: an outside link in the attribution (shown as text only)')
                else: E.append(f'content.json {where}: an outside link ({URL.search(s).group(0).strip()[:40]}) — everything must be inside the package')
            for path, s in strs:
                if path and path[-1] == 'path' and not URL.search(s) and f'content/{s.split("#")[0]}' not in files: W.append(f'content.json {".".join(path)}: {s} is not in the package')
        except Exception as e: E.append(f'content/content.json is not JSON ({e})')
    sizes = {'total': total, 'content': sum(len(b) for n, b in files.items() if n.startswith('content/')), 'libraries': {k: v['bytes'] for k, v in libs.items()}}
    return {'errors': E, 'warnings': W, 'main': main, 'libraries': [{'folder': f, **{k: v for k, v in libs[f].items() if k != 'bytes'}} for f in order], 'sizes': sizes}


def read_zip(path):
    with zipfile.ZipFile(path) as z:
        fa = ALLOW['files']; infos = z.infolist()
        if len(infos) > fa['maxFiles']: return None, f'{len(infos)} files (at most {fa["maxFiles"]})'
        if sum(i.file_size for i in infos) > fa['maxBytes']: return None, 'too big unpacked'
        return {i.filename: z.read(i) for i in infos if not i.is_dir()}, None


def check(path):
    try: files, err = read_zip(path)
    except (zipfile.BadZipFile, OSError) as e: return {'errors': [f'not a .h5p (zip) file: {e}'], 'warnings': []}
    if err: return {'errors': [err], 'warnings': []}
    r = check_files(files); r['bytes'] = os.path.getsize(path); return r


def main(argv):
    paths = [a for a in argv if not a.startswith('--')]
    if not paths: print(__doc__); return 2
    out, bad = {}, 0
    for p in paths:
        r = check(p); out[p] = r; bad += bool(r['errors'])
        if '--json' in argv: continue
        print(f'{"✗" if r["errors"] else "✓"} {p}' + (f'  {r["main"]}  {r["bytes"] // 1024} KB packed, {r["sizes"]["total"] // 1024} KB unpacked' if r.get('sizes') else ''))
        for e in r['errors']: print('   error:', e)
        for w in r['warnings']: print('   warning:', w)
        if r.get('sizes'):
            for f, b in sorted(r['sizes']['libraries'].items(), key=lambda x: -x[1]): print(f'     {f:<28} {b // 1024:>6} KB')
            print(f'     {"content/":<28} {r["sizes"]["content"] // 1024:>6} KB')
    if '--json' in argv: print(json.dumps(out, indent=1))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
