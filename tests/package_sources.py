#!/usr/bin/env python3
"""The original source files travel INSIDE the package (docs/SOURCES.md §3):
split a PDF → one source per part → make_pack.py → <id>.noema.zip (pack.json + sources/…) → unpack.py gives them back.
Uses the skill zip (dist/noema-pack-builder.zip; built here when missing). Needs Pillow (+ pypdf, qpdf or PyMuPDF)."""
import os, sys, json, shutil, subprocess, tempfile, zipfile, hashlib
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
SKZ = os.path.join(ROOT, 'dist', 'noema-pack-builder.zip')
if not os.path.exists(SKZ): subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build.py'), 'skill'], check=True, capture_output=True)
T = tempfile.mkdtemp(); zipfile.ZipFile(SKZ).extractall(T); S = os.path.join(T, 'noema-pack-builder', 'scripts')
run = lambda *a: subprocess.run([sys.executable, *a], capture_output=True, text=True, encoding='utf-8', errors='replace')
ok = 0
def check(cond, msg, out=''):
    global ok
    if not cond: print('✗', msg, '\n', out[-3000:]); sys.exit(1)
    ok += 1; print('✓', msg)

# a 30-page "book"
from PIL import Image, ImageDraw
pages = []
for i in range(1, 31):
    im = Image.new('RGB', (300, 400), 'white'); ImageDraw.Draw(im).text((20, 20), f'Book page {i}', fill='black'); pages.append(im)
book = os.path.join(T, 'Βιβλίο κυττάρου.pdf'); pages[0].save(book, save_all=True, append_images=pages[1:])
sd = os.path.join(T, 'w', 'demo-physics'); shutil.copytree(os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics'), sd)
os.makedirs(os.path.join(sd, 'sources'), exist_ok=True)

r = run(os.path.join(S, 'split_pdf.py'), book, os.path.join(sd, 'sources'), '--ranges', '1-12,13-30', '--name', 'ecb')
check(r.returncode == 0 and sorted(os.listdir(os.path.join(sd, 'sources'))) == ['ecb_p1-12.pdf', 'ecb_p13-30.pdf'], 'split_pdf.py writes the parts', r.stdout + r.stderr)
check('"firstPage": 13' in r.stdout, 'split_pdf.py prints the sources.json entries with firstPage', r.stdout)
notes = os.path.join(sd, 'sources', 'σημειώσεις.docx'); open(notes, 'wb').write(b'PK\x03\x04 fake docx')
def sources(src, chap_refs):
    json.dump({'sources': src, 'chapters': {'ch01': src[0]['id']}, 'patches': {}}, open(os.path.join(sd, 'sources.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    c = json.load(open(os.path.join(sd, 'chapters', 'ch01.json'), encoding='utf-8')); c['sources'] = chap_refs
    json.dump(c, open(os.path.join(sd, 'chapters', 'ch01.json'), 'w', encoding='utf-8'), ensure_ascii=False)
P1 = {'id': 'ecb-1', 'title': 'ECB part 1', 'short': 'ECB 1', 'file': 'sources/ecb_p1-12.pdf', 'firstPage': 1}
P2 = {'id': 'ecb-2', 'title': 'ECB part 2', 'short': 'ECB 2', 'file': 'sources/ecb_p13-30.pdf', 'firstPage': 13}
NT = {'id': 'notes', 'title': 'My notes', 'file': 'sources/σημειώσεις.docx'}
WEB = {'id': 'web', 'title': 'Web page', 'url': 'https://example.org/page'}
mk = lambda out='out': run(os.path.join(S, 'make_pack.py'), sd, os.path.join(T, out))

# 1. a file nobody points to (e.g. the unsplit original next to its parts) → refused
shutil.copy(book, os.path.join(sd, 'sources', 'book.pdf'))
sources([P1, P2, NT, WEB], [{'id': 'ecb-1', 'pages': 'σ. 3–5'}, {'id': 'ecb-2', 'pages': 'σ. 14'}, {'id': 'notes'}])
r = mk(); check(r.returncode == 1 and 'sources/book.pdf: no source in sources.json points to this file' in r.stdout, 'a file without a source is refused', r.stdout)
os.remove(os.path.join(sd, 'sources', 'book.pdf'))
# 2. a source whose file is missing → refused
sources([P1, P2, NT, WEB, {'id': 'gone', 'title': 'x', 'file': 'sources/gone.pdf'}], [{'id': 'ecb-1', 'pages': 'σ. 3'}])
r = mk(); check(r.returncode == 1 and 'its file sources/gone.pdf is missing' in r.stdout, 'a source without its file is refused', r.stdout)
# 3. "file" outside sources/ → refused;  4. > 50 MB → refused
sources([{**P1, 'file': '../ecb_p1-12.pdf'}, P2, NT], [{'id': 'ecb-2', 'pages': 'σ. 14'}])
r = mk(); check(r.returncode == 1 and 'must be "sources/<file name>"' in r.stdout, '"file" must point inside sources/', r.stdout)
big = os.path.join(sd, 'sources', 'huge.pdf')
with open(big, 'wb') as f: f.truncate(51 * 1024 * 1024)
sources([P1, P2, NT, {'id': 'huge', 'title': 'Huge', 'file': 'sources/huge.pdf'}], [{'id': 'ecb-1', 'pages': 'σ. 3'}])
r = mk(); check(r.returncode == 1 and 'the limit is 50 MB per file' in r.stdout, 'files over 50 MB are refused (split them)', r.stdout); os.remove(big)
# 5. the good package
sources([P1, P2, NT, WEB], [{'id': 'ecb-1', 'pages': 'σ. 3–5'}, {'id': 'ecb-2', 'pages': 'σ. 40'}, {'id': 'notes'}, {'id': 'web'}])
r = mk(); check(r.returncode == 0, 'make_pack.py builds the package', r.stdout + r.stderr)
check('WARN ch01: cites ecb-2 "σ. 40" but sources/ecb_p13-30.pdf has pages 13–30' in r.stdout, 'citations outside a part\'s pages are reported', r.stdout)
zp = os.path.join(T, 'out', 'demo-physics.noema.zip'); z = zipfile.ZipFile(zp)
check(sorted(z.namelist()) == ['pack.json', 'sources/ecb_p1-12.pdf', 'sources/ecb_p13-30.pdf', 'sources/σημειώσεις.docx'], 'the package holds pack.json + every source file, exactly as split', str(z.namelist()))
p = json.loads(z.read('pack.json')); ss = {s['id']: s for s in p['sources']['sources']}
check(all(ss[i]['sha256'] == hashlib.sha256(z.read(ss[i]['file'])).hexdigest() and ss[i]['size'] == len(z.read(ss[i]['file'])) for i in ('ecb-1', 'ecb-2', 'notes')), 'each packaged source records size + sha256 of its file')
check(ss['ecb-1']['pageCount'] == 12 and ss['ecb-2']['pageCount'] == 18 and ss['ecb-2']['firstPage'] == 13 and ss['ecb-1']['mime'] == 'application/pdf' and ss['notes']['fileName'] == 'σημειώσεις.docx', 'page count, firstPage, type and original name are recorded')
check('sha256' not in ss['web'] and p['counts']['sourceFiles'] == 3, 'web sources carry no file')
jp = os.path.join(sd, 'build', 'demo-physics.json'); check(json.load(open(jp, encoding='utf-8'))['version'] == p['version'], 'the pack alone is written for the connector upload')
# 6. unpack the package → the files come back → same version
r = run(os.path.join(S, 'unpack.py'), zp, os.path.join(T, 'w2')); w2 = os.path.join(T, 'w2', 'demo-physics')
check(r.returncode == 0 and sorted(os.listdir(os.path.join(w2, 'sources'))) == ['ecb_p1-12.pdf', 'ecb_p13-30.pdf', 'σημειώσεις.docx'], 'unpack.py restores the source files', r.stdout + r.stderr)
r = run(os.path.join(S, 'make_pack.py'), w2, os.path.join(T, 'out2')); p2 = json.loads(zipfile.ZipFile(os.path.join(T, 'out2', 'demo-physics.noema.zip')).read('pack.json'))
check(r.returncode == 0 and p2['version'] == p['version'], 'rebuilding an unpacked package gives the same version', r.stdout)
# 7. unpack the plain .json (files not included): the learner already has them → kept, not required again
r = run(os.path.join(S, 'unpack.py'), jp, os.path.join(T, 'w3')); w3 = os.path.join(T, 'w3', 'demo-physics')
r = run(os.path.join(S, 'make_pack.py'), w3, os.path.join(T, 'out3'))
p3 = json.loads(zipfile.ZipFile(os.path.join(T, 'out3', 'demo-physics.noema.zip')).read('pack.json')); s3 = {s['id']: s for s in p3['sources']['sources']}
check(r.returncode == 0 and 'kept from the previous version' in r.stdout and 'sha256' not in s3['ecb-1'] and s3['ecb-1']['file'] == 'sources/ecb_p1-12.pdf', 'an update without the files keeps the existing sources (not re-required)', r.stdout)
#    …but a NEW source in that update must bring its file
s = json.load(open(os.path.join(w3, 'sources.json'), encoding='utf-8')); s['sources'].append({'id': 'new', 'title': 'New', 'file': 'sources/new.pdf'}); json.dump(s, open(os.path.join(w3, 'sources.json'), 'w', encoding='utf-8'))
r = run(os.path.join(S, 'make_pack.py'), w3, os.path.join(T, 'out3'))
check(r.returncode == 1 and 'its file sources/new.pdf is missing' in r.stdout, 'a new source in an update must bring its file', r.stdout)
# 8. --max-mb splits into parts under the limit
r = run(os.path.join(S, 'split_pdf.py'), book, os.path.join(T, 'mx'), '--max-mb', str(os.path.getsize(book) / 1048576 / 2.5))
parts = os.listdir(os.path.join(T, 'mx'))
check(r.returncode == 0 and len(parts) >= 3 and all(os.path.getsize(os.path.join(T, 'mx', f)) <= os.path.getsize(book) / 2.5 for f in parts), f'--max-mb: {len(parts)} parts under the limit', r.stdout + r.stderr)
shutil.rmtree(T, ignore_errors=True)
print(f'\npackage_sources: {ok} checks passed')
