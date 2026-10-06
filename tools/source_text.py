#!/usr/bin/env python3
"""Extract clean, page-numbered text from a subject's source PDFs (for authoring).
  python3 tools/source_text.py <subject-id> <source-id> [START END]
Uses `pdftotext` (poppler) when available, else pypdf. Strips repeated running headers/footers."""
import os, sys, re, subprocess, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lqlib import find_subject, rj
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
sdir, _ = find_subject(a[0]); src = next(s for s in rj(os.path.join(sdir, 'sources.json'))['sources'] if s['id'] == a[1])
pdf = os.path.join(sdir, src['file'])
try: pages = subprocess.run(['pdftotext', '-enc', 'UTF-8', pdf, '-'], capture_output=True, text=True, check=True).stdout.split('\f')
except Exception:
    from pypdf import PdfReader; pages = [p.extract_text() or '' for p in PdfReader(pdf).pages]
lines = collections.Counter(l.strip() for p in pages for l in set(p.splitlines()) if l.strip())
noise = {l for l, n in lines.items() if n > max(5, len(pages) * 0.3)}
lo, hi = (int(a[2]), int(a[3])) if len(a) >= 4 else (1, len(pages))
for i in range(lo, min(hi, len(pages)) + 1):
    body = '\n'.join(l for l in pages[i - 1].splitlines() if l.strip() not in noise and not re.match(r'^(https?://\S+|Page \d+ of .*)$', l.strip()))
    print(f'\n##### PAGE {i} #####\n' + re.sub(r'\n{3,}', '\n\n', body).strip())
