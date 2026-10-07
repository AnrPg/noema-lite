#!/usr/bin/env python3
"""A real package, built with the skill's own scripts (tests/sources.js):
  python3 make_package.py SKILL_ZIP REPO_ROOT OUTDIR
→ OUTDIR/pkg-physics.noema.zip   pack + 3 source files: a 30-page book split into 2 parts (firstPage 13) and a note
→ OUTDIR/pkg-physics.json        the pack alone
→ OUTDIR/pkg-bad.noema.zip       the same package with one damaged file (its SHA-256 no longer matches)"""
import os, sys, json, shutil, subprocess, tempfile, zipfile
from PIL import Image, ImageDraw
skz, root, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
T = tempfile.mkdtemp(); zipfile.ZipFile(skz).extractall(T); S = os.path.join(T, 'noema-pack-builder', 'scripts')
pages = []
for i in range(1, 31):
    im = Image.new('RGB', (420, 595), 'white'); d = ImageDraw.Draw(im); d.rectangle([10, 10, 410, 585], outline='#1d4ed8', width=3); d.text((40, 60), f'BOOK PAGE {i}', fill='black'); pages.append(im)
book = os.path.join(T, 'book.pdf'); pages[0].save(book, save_all=True, append_images=pages[1:])
sd = os.path.join(T, 'w', 'pkg-physics'); shutil.copytree(os.path.join(root, 'tests', 'fixtures', 'demo-physics'), sd)
os.makedirs(os.path.join(sd, 'sources'), exist_ok=True)
subprocess.run([sys.executable, os.path.join(S, 'split_pdf.py'), book, os.path.join(sd, 'sources'), '--ranges', '1-12,13-30', '--name', 'ecb'], check=True, capture_output=True)
open(os.path.join(sd, 'sources', 'σημειώσεις.md'), 'w', encoding='utf-8').write('# Σημειώσεις μαθήματος\n\nNotes travel with the package.\n')
subj = json.load(open(os.path.join(sd, 'subject.json'), encoding='utf-8')); subj.update(id='pkg-physics', title='Πακέτο φυσικής', language='el')
json.dump(subj, open(os.path.join(sd, 'subject.json'), 'w', encoding='utf-8'), ensure_ascii=False)
json.dump({'sources': [
    {'id': 'ecb-1', 'title': 'Βιβλίο — μέρος 1', 'short': 'ECB 1', 'file': 'sources/ecb_p1-12.pdf', 'firstPage': 1, 'pages': '1–12', 'emoji': '📘', 'added': '2026-10-07'},
    {'id': 'ecb-2', 'title': 'Βιβλίο — μέρος 2', 'short': 'ECB 2', 'file': 'sources/ecb_p13-30.pdf', 'firstPage': 13, 'pages': '13–30', 'emoji': '📗', 'added': '2026-10-07'},
    {'id': 'notes', 'title': 'Σημειώσεις', 'short': 'Σημ.', 'file': 'sources/σημειώσεις.md', 'emoji': '📝', 'added': '2026-10-07'}],
    'chapters': {'ch01': 'ecb-1'}, 'patches': {}}, open(os.path.join(sd, 'sources.json'), 'w', encoding='utf-8'), ensure_ascii=False)
c = json.load(open(os.path.join(sd, 'chapters', 'ch01.json'), encoding='utf-8'))
c['sources'] = [{'id': 'ecb-1', 'pages': 'σ. 3–5'}, {'id': 'ecb-2', 'pages': 'σ. 14–16'}, {'id': 'notes'}]; c['sourcePages'] = 'ECB 1 σ. 3–5 · ECB 2 σ. 14–16 · Σημ.'
json.dump(c, open(os.path.join(sd, 'chapters', 'ch01.json'), 'w', encoding='utf-8'), ensure_ascii=False)
r = subprocess.run([sys.executable, os.path.join(S, 'make_pack.py'), sd, out], capture_output=True, text=True)
if r.returncode: sys.exit(r.stdout + r.stderr)
shutil.copy(os.path.join(sd, 'build', 'pkg-physics.json'), os.path.join(out, 'pkg-physics.json'))
src = zipfile.ZipFile(os.path.join(out, 'pkg-physics.noema.zip'))
with zipfile.ZipFile(os.path.join(out, 'pkg-bad.noema.zip'), 'w') as z:
    for n in src.namelist():
        data = src.read(n)
        if n == 'pack.json': p = json.loads(data); p['subject']['id'] = 'pkg-bad'; p['subject']['title'] = 'Χαλασμένο πακέτο'; data = json.dumps(p, ensure_ascii=False).encode()
        if n == 'sources/ecb_p1-12.pdf': data = data[:-10] + b'0123456789'   # same size, different content
        z.writestr(n, data)
shutil.rmtree(T, ignore_errors=True)
print('package →', out)
