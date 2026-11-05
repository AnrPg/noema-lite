#!/usr/bin/env python3
"""Vendor the H5P player for the h5p@1 runtime (docs/INTERACTIVE_H5P.md, docs/adr/001 D11).

    python3 tools/fetch_h5p.py            download the pinned files, check each sha256, write engine/vendor/h5p/<version>/
    python3 tools/fetch_h5p.py --check    only check the committed files against SHA256SUMS (no network)

What is kept from h5p-standalone 3.8.2 (npm tarball, pinned by its sha256):
  frame.bundle.js     the webpack build of jQuery 3 + the H5P core (h5p.js, event dispatcher, xAPI, content type, confirmation
                      dialog, request queue, action bar, tooltip) — the code the runtime runs, unchanged
  styles/h5p.css      the core styles (readable: the concatenated vendor/h5p/styles/*.css)
  fonts/h5p-core-30.woff2, fonts/h5p-theme.woff2   the two icon fonts (the text fonts Inter / Open Sans are left out: the
                      frame uses the app's font)
  LICENSE             h5p-standalone's MIT licence
and, because the H5P core is GPL-3.0 (h5p/h5p-php-library), its corresponding readable source beside it:
  source/vendor/h5p/js/*.js   the unminified files of h5p-standalone v3.8.2 that frame.bundle.js is built from (each pinned by
                              its sha256), source/src/frame.ts (the order they are bundled in), source/webpack.common.js (how)
  source/COPYING              the GNU General Public License version 3 (pinned by its sha256)
  LICENSE-NOTICE.txt          who, what, where the source is, and how the core runs (written here)
and player.js, generated here: one script that defines window.NoemaH5PPlayer = {version, js, css} with the core as a string and
the css with its fonts inlined as data: URIs. The runtime (engine/src/38_activity_h5p.js) loads player.js with a <script> tag
(so it works from file:// too) and puts the core inline in the sandboxed frame, allowed there by its hash.
Pure stdlib."""
import hashlib, io, json, os, re, sys, tarfile, base64, urllib.request

VERSION = '3.8.2'
TARBALL = f'https://registry.npmjs.org/h5p-standalone/-/h5p-standalone-{VERSION}.tgz'
TARBALL_SHA256 = 'de7844ac07d5baddf5664c03738f25755914854b472f9b093251300ea1fec391'
KEEP = ['LICENSE', 'dist/frame.bundle.js', 'dist/styles/h5p.css', 'dist/fonts/h5p-core-30.woff2', 'dist/fonts/h5p-theme.woff2']
# the readable source of frame.bundle.js: h5p-standalone's repository at the tag of the same version (the npm tarball has only dist/)
SOURCE_URL = f'https://raw.githubusercontent.com/tunapanda/h5p-standalone/v{VERSION}/'
SOURCE = {   # path in the repository → sha256 (frame.ts lists them in the order the bundle has them)
    'vendor/h5p/js/jquery.js': '249b0b7542a571fc5acad79d517486f364c57fa50d61bf7942bd5ebc227c289a',
    'vendor/h5p/js/h5p.js': '8474d16ceb1377c9a0aa12961047fafd016d71ed38f349035066bc5e27994c01',
    'vendor/h5p/js/h5p-event-dispatcher.js': '8d79c33382bd60e70c44e68b86c7e59d7437daa0bc1612667b255459d7b9359b',
    'vendor/h5p/js/h5p-x-api.js': 'e13526de247d549395d0cdfcd61da02fa5234b7d9394113737bc8ebf39f04af6',
    'vendor/h5p/js/h5p-x-api-event.js': '13a582a8cf4f91f4eb33a0a6c70b58828ed2f0cb4c2392568fb692e17e623347',
    'vendor/h5p/js/h5p-content-type.js': 'c0d60b00691a0b436a83051724a38455a17b08ce4811e2bb1e9d5ea7eb8dd91d',
    'vendor/h5p/js/h5p-confirmation-dialog.js': 'd2161c7ad33dd0565b7e9cc4a83cce080291e39f2a8495164bcfcc8db1464964',
    'vendor/h5p/js/request-queue.js': '6e6c73ae318aa59347152e6c65af87ee6c960c34067e822e8bc99c15b3cb3bd8',
    'vendor/h5p/js/h5p-action-bar.js': 'e85a738e912ff010113098a0456b8a6d9063f57bbd8445557db802a4de6caacb',
    'vendor/h5p/js/h5p-tooltip.js': 'e81ec03bc0fef05fde4cf5c261210dc66c9bc1ea2f3244033e248659a217b154',
    'src/frame.ts': '1208f03c3322746ee35bf441ae1424b29763f05858a4d8d6e73ad07bd6dab8ff',
    'webpack.common.js': '98006f337991958137094225bcfa54928bb32850eb1d35e5fbff5666fb05800e',
}
GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.txt'
GPL_SHA256 = '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
GPL_LOCAL = ['/usr/share/common-licenses/GPL-3']   # the same text, when the FSF's site cannot be reached (checked by its sha256 too)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'engine', 'vendor', 'h5p', VERSION)
NOTICE = f"""H5P player for noema-lite's h5p@1 runtime (docs/INTERACTIVE_H5P.md) — vendored by tools/fetch_h5p.py.

WHAT IT IS
* frame.bundle.js: h5p-standalone {VERSION}'s webpack build of
  - the H5P core JavaScript (h5p.js, h5p-event-dispatcher.js, h5p-x-api.js, h5p-x-api-event.js, h5p-content-type.js,
    h5p-confirmation-dialog.js, request-queue.js, h5p-action-bar.js, h5p-tooltip.js), Copyright (c) Joubel AS / H5P Group
    (https://h5p.org), from h5p/h5p-php-library (https://github.com/h5p/h5p-php-library), licensed under the
    GNU General Public License version 3 (GPL-3.0, see source/COPYING);
  - jQuery 3.5.1, Copyright (c) JS Foundation and other contributors, MIT licence (https://jquery.org/license), as H5P ships it.
* styles/h5p.css, fonts/h5p-core-30.woff2, fonts/h5p-theme.woff2: the H5P core's styles and icon fonts (same terms as the core).
* the wrapper h5p-standalone {VERSION} (Copyright (c) Tunapanda, https://github.com/tunapanda/h5p-standalone): MIT, see LICENSE.
* player.js: generated by tools/fetch_h5p.py from frame.bundle.js and styles/h5p.css (the same code as a string, fonts inlined).

WHERE THE SOURCE IS
* source/: the readable (unminified) source of the code above, exactly the files of h5p-standalone v{VERSION} that
  frame.bundle.js is built from (source/vendor/h5p/js/*.js), in the order source/src/frame.ts gives, built as
  source/webpack.common.js says; each file is pinned by its sha256 in tools/fetch_h5p.py and listed in SHA256SUMS.
* upstream: {SOURCE_URL}vendor/h5p/js/ and the npm package {TARBALL}
  (sha256 {TARBALL_SHA256}).
* You may copy, change and share this code under the terms of the GPL-3.0 (source/COPYING); it comes WITHOUT ANY WARRANTY.

HOW IT RUNS
* The H5P core and the content-type libraries of an item run ONLY inside the activity's own frame: sandbox="allow-scripts"
  (an opaque origin), a Content-Security-Policy with no network at all and scripts only by hash, inside a wrapper frame that
  blocks navigation. They talk to the app only by postMessage over one MessagePort (docs/INTERACTIVE.md §7–§8). The app's own
  code does not link or include them.
* The content-type libraries (H5P.MultiChoice, H5P.Question, H5P.JoubelUI, …) are not vendored: they come inside each .h5p
  file, each with its own licence (library.json "license"; the reference items' libraries are MIT).
"""


def sha(b): return hashlib.sha256(b).hexdigest()


def player_js(files):
    css = files['dist/styles/h5p.css'].decode('utf-8')
    def url(m):
        ref = m.group(2).split('?')[0]
        p = os.path.normpath(os.path.join('dist/styles', ref)).replace(os.sep, '/')
        if p in files:
            return "url(data:font/woff2;base64," + base64.b64encode(files[p]).decode() + ")"
        return 'url(data:,)'   # a text font or picture that is not vendored: nothing to load
    css = re.sub(r"url\((['\"]?)([^)'\"]+)\1\)", url, css)
    js = files['dist/frame.bundle.js'].decode('utf-8')
    return ('/* GENERATED by tools/fetch_h5p.py from h5p-standalone ' + VERSION + ' — do not edit. The H5P core (Joubel AS / H5P Group) is GPL-3.0, '
            'jQuery and h5p-standalone are MIT: see LICENSE-NOTICE.txt; the readable source is in source/ beside this file '
            '(engine/vendor/h5p/' + VERSION + '/source/). It runs only inside the activity\'s sandboxed frame. */\n'
            'window.NoemaH5PPlayer = Object.freeze(' + json.dumps({'version': VERSION, 'js': js, 'css': css}, ensure_ascii=True) + ');\n')


def check():
    sums = os.path.join(OUT, 'SHA256SUMS')
    if not os.path.exists(sums): print('✗ no', sums); return 1
    bad = 0; names = set()
    for line in open(sums, encoding='utf-8'):
        h, name = line.split(None, 1); name = name.strip(); names.add(name)
        p = os.path.join(OUT, name)
        if not os.path.exists(p) or sha(open(p, 'rb').read()) != h: print('✗', name); bad += 1
    for rel, h in SOURCE.items():   # the readable source is there, and is the pinned one
        if 'source/' + rel not in names: print('✗ not in SHA256SUMS: source/' + rel); bad += 1
    if 'source/COPYING' not in names: print('✗ not in SHA256SUMS: source/COPYING'); bad += 1
    print('✓ vendored H5P player and its source match SHA256SUMS' if not bad else f'✗ {bad} file(s) differ'); return 1 if bad else 0


def get(url, want):
    data = urllib.request.urlopen(url, timeout=60).read()
    if sha(data) != want: raise SystemExit(f'✗ sha256 mismatch for {url}: {sha(data)}')
    return data


def main():
    if '--check' in sys.argv: return check()
    data = get(TARBALL, TARBALL_SHA256)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as t:
        for m in t.getmembers():
            n = m.name[len('package/'):] if m.name.startswith('package/') else m.name
            if n in KEEP and m.isfile(): files[n] = t.extractfile(m).read()
    missing = [k for k in KEEP if k not in files]
    if missing: print('✗ missing in the tarball:', missing); return 1
    out = {}
    for n, b in files.items():
        rel = n[len('dist/'):] if n.startswith('dist/') else n
        out[rel] = b
    for rel, h in SOURCE.items(): out['source/' + rel] = get(SOURCE_URL + rel, h)
    gpl = None
    try: gpl = get(GPL_URL, GPL_SHA256)
    except (OSError, SystemExit) as e:
        for f in GPL_LOCAL:
            if os.path.exists(f) and sha(open(f, 'rb').read()) == GPL_SHA256: gpl = open(f, 'rb').read(); break
    if gpl is None: print('✗ the GPL-3.0 text could not be had (', GPL_URL, ')'); return 1
    out['source/COPYING'] = gpl
    out['player.js'] = player_js(files).encode('utf-8')
    out['LICENSE-NOTICE.txt'] = NOTICE.encode('utf-8')
    os.makedirs(OUT, exist_ok=True)
    for rel, b in out.items():
        p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as f: f.write(b)
    with open(os.path.join(OUT, 'SHA256SUMS'), 'w', encoding='utf-8') as f:
        for rel in sorted(out): f.write(f'{sha(out[rel])}  {rel}\n')
    print(f'✓ engine/vendor/h5p/{VERSION}/: ' + ', '.join(f'{k} ({len(v) // 1024} KB)' for k, v in sorted(out.items())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
