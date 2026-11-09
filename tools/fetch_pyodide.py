#!/usr/bin/env python3
"""Fetch the pinned Python runtime of py-module@1 (docs/INTERACTIVE_PYTHON.md) into the website.

    python3 tools/fetch_pyodide.py [--site dist/site] [--cache DIR] [--include numpy,scipy,micropip] [--allow tools/pywheels_allow.json]
    python3 tools/fetch_pyodide.py --pin        # maintainers only: download once and write the hashes into tools/pyodide_manifest.json

Writes (after `python3 tools/build.py site`, which empties dist/site):
    <site>/vendor/pyodide/0.27.7/…        the Pyodide core files and the wheels of numpy, scipy, micropip (+ their dependencies)
    <site>/vendor/pywheels/…              the allow-listed extra wheels (tools/pywheels_allow.json)
    <site>/vendor/pyodide/manifest.json   what the app and the site's service worker (/sw.js, written by build.py site) check every file against (sha256 + bytes)
Every file is checked against the pinned sha256 before it is written; a mismatch stops the run (nothing half-written stays).
Downloads come from cdn.jsdelivr.net (Pyodide) and files.pythonhosted.org (extras), never from anything not pinned here.
"""
import argparse, hashlib, json, os, shutil, sys, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIN = os.path.join(ROOT, 'tools', 'pyodide_manifest.json')
ALLOW = os.path.join(ROOT, 'tools', 'pywheels_allow.json')
VERSION = '0.27.7'
CDN = f'https://cdn.jsdelivr.net/pyodide/v{VERSION}/full/'
CORE = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
PACKAGES = ['numpy', 'scipy', 'micropip']   # the owner's choice (docs/adr/001 D7); scipy and micropip load only when an activity asks
NAME_OK = set('abcdefghijklmnopqrstuvwxyz0123456789_-.')


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def download(url, cache=None, want=None):
    """the bytes of url (from the cache folder when it holds a copy with the wanted hash)"""
    name = url.rsplit('/', 1)[1]
    if cache and want:
        p = os.path.join(cache, want[:16] + '-' + name)
        if os.path.exists(p):
            b = open(p, 'rb').read()
            if sha256(b) == want: return b
    req = urllib.request.Request(url, headers={'User-Agent': 'noema-lite fetch_pyodide'})
    with urllib.request.urlopen(req, timeout=120) as r:
        b = r.read()
    if cache and want and sha256(b) == want:
        os.makedirs(cache, exist_ok=True)
        with open(os.path.join(cache, want[:16] + '-' + name), 'wb') as f: f.write(b)
    return b


def closure(lock, names):
    """the package names with all their dependencies (pyodide-lock.json), dependencies first"""
    out, seen = [], set()
    def visit(n):
        if n in seen: return
        seen.add(n)
        p = lock['packages'].get(n)
        if not p: sys.exit(f'✗ {n} is not in pyodide-lock.json')
        for d in p.get('depends', []): visit(d)
        out.append(n)
    for n in names: visit(n)
    return out


def pin(cache):
    files, packages = {}, {}
    for f in CORE:
        b = download(CDN + f)
        files[f] = {'sha256': sha256(b), 'bytes': len(b)}
        if f == 'pyodide-lock.json': lock = json.loads(b)
    if lock['info']['version'] != VERSION: sys.exit('✗ the lock file is of ' + lock['info']['version'])
    for name in PACKAGES:
        packages[name] = []
        for n in closure(lock, [name]):
            p = lock['packages'][n]; fn = p['file_name']
            if fn not in files:
                b = download(CDN + fn, cache, p['sha256'])
                if sha256(b) != p['sha256']: sys.exit(f'✗ {fn}: the CDN file does not match pyodide-lock.json')
                files[fn] = {'sha256': p['sha256'], 'bytes': len(b)}
            packages[name].append(fn)
    man = {'format': 'noema.pyodide-pin/v1', 'version': VERSION, 'source': CDN, 'core': CORE, 'packages': packages, 'files': files}
    with open(PIN, 'w', encoding='utf-8') as f: json.dump(man, f, indent=1); f.write('\n')
    total = sum(v['bytes'] for v in files.values())
    print(f'pinned {len(files)} files, {total / 1e6:.1f} MB → {os.path.relpath(PIN, ROOT)}')


def check_allow(allow):
    """the allow-list index: every extra is a pure-Python wheel with a pinned hash, from PyPI's file host only"""
    wheels = allow.get('wheels') or {}
    for name, w in wheels.items():
        bad = []
        if not name or set(name) - NAME_OK: bad.append('name')
        if not str(w.get('file', '')).endswith('-py3-none-any.whl') or '/' in w.get('file', ''): bad.append('file (a pure-Python wheel)')
        if not str(w.get('url', '')).startswith('https://files.pythonhosted.org/') or not w['url'].endswith('/' + w.get('file', '')): bad.append('url')
        if len(str(w.get('sha256', ''))) != 64: bad.append('sha256')
        if not isinstance(w.get('bytes'), int): bad.append('bytes')
        if w.get('deps'): bad.append('deps (extras have no dependencies here: list each one itself)')
        if bad: sys.exit(f'✗ pywheels_allow.json: {name}: bad ' + ', '.join(bad))
    return wheels


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--site', default=os.path.join(ROOT, 'dist', 'site'))
    ap.add_argument('--cache', default=os.environ.get('NOEMA_PYODIDE_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'noema-pyodide'))
    ap.add_argument('--include', default=','.join(PACKAGES))
    ap.add_argument('--allow', default=ALLOW)
    ap.add_argument('--pin', action='store_true')
    a = ap.parse_args()
    if a.pin: return pin(a.cache)
    man = json.load(open(PIN, encoding='utf-8'))
    allow = check_allow(json.load(open(a.allow, encoding='utf-8')))
    include = [p for p in a.include.split(',') if p]
    for p in include:
        if p not in man['packages']: sys.exit(f'✗ {p} is not pinned (pinned: {", ".join(man["packages"])})')
    want = list(man['core']) + [f for p in include for f in man['packages'][p]]
    site = os.path.abspath(a.site)
    vdir = os.path.join(site, 'vendor', 'pyodide', man['version'])
    wdir = os.path.join(site, 'vendor', 'pywheels')
    stage = tempfile.mkdtemp(prefix='noema-pyodide-')
    try:
        got = {}
        for fn in dict.fromkeys(want):
            pinf = man['files'][fn]
            b = download(man['source'] + fn, a.cache, pinf['sha256'])
            if sha256(b) != pinf['sha256'] or len(b) != pinf['bytes']: sys.exit(f'✗ {fn}: sha256 does not match the pin — nothing was written')
            with open(os.path.join(stage, fn), 'wb') as f: f.write(b)
            got[fn] = pinf
        lock = json.load(open(os.path.join(stage, 'pyodide-lock.json'), encoding='utf-8'))
        for fn in got:   # the lock file Pyodide checks (checkIntegrity) must agree with our pin
            p = next((p for p in lock['packages'].values() if p['file_name'] == fn), None)
            if p and p['sha256'] != got[fn]['sha256']: sys.exit(f'✗ {fn}: the pin and pyodide-lock.json disagree')
        wstage = os.path.join(stage, '_wheels'); os.makedirs(wstage)
        for name, w in allow.items():
            b = download(w['url'], a.cache, w['sha256'])
            if sha256(b) != w['sha256'] or len(b) != w['bytes']: sys.exit(f'✗ {w["file"]}: sha256 does not match the allow-list — nothing was written')
            with open(os.path.join(wstage, w['file']), 'wb') as f: f.write(b)
        os.makedirs(vdir, exist_ok=True); os.makedirs(wdir, exist_ok=True)
        for fn in got: shutil.copy(os.path.join(stage, fn), os.path.join(vdir, fn))
        for w in allow.values(): shutil.copy(os.path.join(wstage, w['file']), os.path.join(wdir, w['file']))
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    runtime = {
        'format': 'noema.pyodide-manifest/v1', 'version': man['version'],
        'base': f'/vendor/pyodide/{man["version"]}/', 'wheelsBase': '/vendor/pywheels/',
        'core': man['core'], 'packages': {p: man['packages'][p] for p in include},
        'files': got,
        'wheels': {n: {'file': w['file'], 'sha256': w['sha256'], 'bytes': w['bytes'], 'license': w.get('license', '')} for n, w in allow.items()},
    }
    with open(os.path.join(site, 'vendor', 'pyodide', 'manifest.json'), 'w', encoding='utf-8') as f: json.dump(runtime, f, indent=1); f.write('\n')
    total = sum(v['bytes'] for v in got.values()) + sum(w['bytes'] for w in allow.values())
    print(f'pyodide {man["version"]}: {len(got)} files + {len(allow)} extra wheel(s), {total / 1e6:.1f} MB → {os.path.relpath(site, os.getcwd())}/vendor/')


if __name__ == '__main__':
    main()
