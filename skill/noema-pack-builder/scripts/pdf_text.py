#!/usr/bin/env python3
"""Page-numbered text of a PDF without repeated headers/footers.   python3 pdf_text.py FILE.pdf [START END] > out.txt"""
import sys, re, subprocess, collections
def _pymupdf():
    try: import pymupdf as m          # PyMuPDF ≥ 1.24
    except ImportError: import fitz as m   # older PyMuPDF (raises ImportError if not installed)
    return m
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
a = sys.argv[1:]
if not a: print(__doc__); sys.exit(1)
try: pages = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-layout', a[0], '-'], capture_output=True, text=True, check=True).stdout.split('\f')
except Exception:
    try:
        fitz = _pymupdf(); pages = [p.get_text() for p in fitz.open(a[0])]
    except ImportError:
        from pypdf import PdfReader; pages = [p.extract_text() or '' for p in PdfReader(a[0]).pages]
lines = collections.Counter(l.strip() for p in pages for l in set(p.splitlines()) if l.strip())
noise = {l for l, n in lines.items() if n > max(5, len(pages) * 0.3)}
lo, hi = (int(a[1]), int(a[2])) if len(a) >= 3 else (1, len(pages))
for i in range(lo, min(hi, len(pages)) + 1):
    body = '\n'.join(l for l in pages[i - 1].splitlines() if l.strip() not in noise)
    print(f'\n##### PAGE {i} #####\n' + re.sub(r'\n{3,}', '\n\n', body).strip())
