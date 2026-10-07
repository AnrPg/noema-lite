#!/usr/bin/env python3
"""Split a PDF into parts — each part becomes ITS OWN source (sources.json) and is packaged as it is.
  python3 split_pdf.py BOOK.pdf work/<id>/sources --ranges 1-24,25-60,61-120 [--name ecb]
  python3 split_pdf.py BOOK.pdf work/<id>/sources --max-mb 45 [--name ecb]       (equal parts under the limit)
Writes <name>_p<from>-<to>.pdf and prints a sources.json entry for every part, with "firstPage" = the page number of
the ORIGINAL book where the part starts: keep citing the original page numbers ("σ. 403") and the app opens the part
at the right page. Do NOT keep the unsplit original in sources/ (make_pack.py refuses files no source points to)."""
import os, sys, json, re, math, shutil, subprocess
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
src, out = a[0], a[1]
opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from noema_lib import pdf_page_count
n = pdf_page_count(src)
if not n: sys.exit('could not read the number of pages (install pypdf: pip install pypdf)')
name = re.sub(r'[^a-z0-9-]+', '-', (opt('--name') or os.path.splitext(os.path.basename(src))[0]).lower()).strip('-') or 'part'
os.makedirs(out, exist_ok=True)

def ranges_from_arg(txt):
    rs = []
    for part in txt.split(','):
        m = re.fullmatch(r'\s*(\d+)\s*-\s*(\d+)\s*', part) or re.fullmatch(r'\s*(\d+)\s*', part)
        if not m: sys.exit(f'bad range "{part}"')
        lo = int(m.group(1)); hi = int(m.group(2)) if m.lastindex == 2 else lo
        if not (1 <= lo <= hi <= n): sys.exit(f'range {lo}-{hi} outside 1-{n}')
        rs.append((lo, hi))
    return rs

def write(lo, hi, dst):
    try:
        from pypdf import PdfReader, PdfWriter
        r = PdfReader(src); w = PdfWriter()
        for i in range(lo - 1, hi): w.add_page(r.pages[i])
        with open(dst, 'wb') as f: w.write(f)
        return
    except ImportError: pass
    if shutil.which('qpdf'):
        subprocess.run(['qpdf', '--empty', '--pages', src, f'{lo}-{hi}', '--', dst], check=True); return
    try: import pymupdf as fitz
    except ImportError: import fitz
    d = fitz.open(); d.insert_pdf(fitz.open(src), from_page=lo - 1, to_page=hi - 1); d.save(dst, garbage=3, deflate=True)

if opt('--ranges'): rs = ranges_from_arg(opt('--ranges'))
else:
    limit = float(opt('--max-mb', '45')) * 1048576
    k = max(1, math.ceil(os.path.getsize(src) / limit))
    while True:
        step = math.ceil(n / k); rs = [(i, min(n, i + step - 1)) for i in range(1, n + 1, step)]
        sizes = []
        for lo, hi in rs:
            dst = os.path.join(out, f'{name}_p{lo}-{hi}.pdf'); write(lo, hi, dst); sizes.append((dst, os.path.getsize(dst)))
        if all(sz <= limit for _, sz in sizes) or k >= n: break
        for dst, _ in sizes: os.remove(dst)
        k += 1
entries = []
for i, (lo, hi) in enumerate(rs, 1):
    fn = f'{name}_p{lo}-{hi}.pdf'; dst = os.path.join(out, fn)
    if not os.path.exists(dst): write(lo, hi, dst)
    entries.append({'id': f'{name}-{i}' if len(rs) > 1 else name, 'file': f'sources/{fn}', 'firstPage': lo, 'pages': f'{lo}–{hi}', 'size_mb': round(os.path.getsize(dst) / 1048576, 1)})
print(f'{len(rs)} part(s) of {n} pages → {out}')
print('sources.json entries (add title, short, subtitle, added, emoji; remove size_mb):')
print(json.dumps(entries, ensure_ascii=False, indent=1))
