#!/usr/bin/env python3
"""Find and extract the pictures inside a source PDF (docs/VISUAL.md §5 — step 1 of every ingestion).

  python3 tools/extract_images.py scan  SOURCE.pdf OUTDIR [--min 200]
      → OUTDIR/img-<page>-<n>.<ext>   every embedded raster image ≥ --min px on its short side (icons are skipped)
      → OUTDIR/pages/p-<page>.png     a 110-dpi render of every page that has drawings or images (vector
                                       diagrams are NOT embedded images — they only show up in page renders)
      → OUTDIR/index.html             contact sheet to review everything at a glance
  python3 tools/extract_images.py crop  SOURCE.pdf PAGE X Y W H OUT.png [--dpi 200]
      → crops a region of a page (coordinates in % of the page, 0–100) at high resolution — use it for
        vector diagrams and figures; then register the file in media/media.json with origin "source".

Works with whichever PDF library is installed (tried in this order): poppler-utils (pdfimages, pdftoppm,
pdfinfo) → PyMuPDF (pip install pymupdf) → pypdf + pypdfium2 (pip install pypdf pypdfium2; these two are
preinstalled in Claude's code-execution sandbox).
"""
import os, re, sys, shutil, subprocess, glob, html, struct
def _pymupdf():
    try: import pymupdf as m          # PyMuPDF ≥ 1.24
    except ImportError: import fitz as m   # older PyMuPDF (raises ImportError if not installed)
    return m
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

def have(cmd): return shutil.which(cmd) is not None
NEED = 'Install one PDF library: poppler-utils (brew/apt install poppler), or pip install pymupdf, or pip install pypdf pypdfium2.'
def _has_pymupdf():
    try: _pymupdf(); return True
    except ImportError: return False

def png_size(p):
    with open(p, 'rb') as f: d = f.read(24)
    return struct.unpack('>II', d[16:24]) if d[:8] == b'\x89PNG\r\n\x1a\n' else None

def size_of(p):
    try:
        from PIL import Image
        with Image.open(p) as im: return im.size
    except Exception: return png_size(p)

def scan(pdf, out, min_side=200):
    os.makedirs(out, exist_ok=True); os.makedirs(os.path.join(out, 'pages'), exist_ok=True)
    found, pages_with_figs = [], set()
    if have('pdfimages'):
        lst = subprocess.run(['pdfimages', '-list', pdf], capture_output=True, text=True).stdout.splitlines()[2:]
        keep = {}
        for ln in lst:
            c = ln.split()
            if len(c) < 5 or c[2] != 'image': continue
            page, num, w, h = int(c[0]), int(c[1]), int(c[3]), int(c[4])
            if min(w, h) >= min_side: keep.setdefault(page, []).append((num, w, h))
        for page in sorted(keep):
            tmp = os.path.join(out, f'_p{page}')
            subprocess.run(['pdfimages', '-png', '-f', str(page), '-l', str(page), pdf, tmp], check=True)
            for f in sorted(glob.glob(tmp + '-*.png')):
                w, h = size_of(f) or (0, 0)
                if min(w, h) < min_side: os.remove(f); continue
                dst = os.path.join(out, f'img-{page:04d}-{len([x for x in found if x[0] == page]) + 1}.png'); os.replace(f, dst)
                found.append((page, dst, w, h)); pages_with_figs.add(page)
    elif not _has_pymupdf():
        try: from pypdf import PdfReader
        except ImportError: sys.exit(NEED)
        for pno, pg in enumerate(PdfReader(pdf).pages, 1):
            try: imgs = list(pg.images)
            except Exception as e: print(f'p.{pno}: images not readable ({e})'); imgs = []
            for k, im in enumerate(imgs, 1):
                try: pil = im.image
                except Exception: continue
                if pil is None or min(pil.size) < min_side: continue
                if pil.mode not in ('RGB', 'RGBA', 'L'): pil = pil.convert('RGB')
                dst = os.path.join(out, f'img-{pno:04d}-{k}.png'); pil.save(dst); found.append((pno, dst, *pil.size)); pages_with_figs.add(pno)
    else:
        fitz = _pymupdf()
        doc = fitz.open(pdf)
        for pno, pg in enumerate(doc, 1):
            for k, im in enumerate(pg.get_images(full=True), 1):
                pix = fitz.Pixmap(doc, im[0])
                if min(pix.width, pix.height) < min_side: continue
                if pix.n > 4: pix = fitz.Pixmap(fitz.csRGB, pix)
                dst = os.path.join(out, f'img-{pno:04d}-{k}.png'); pix.save(dst); found.append((pno, dst, pix.width, pix.height)); pages_with_figs.add(pno)
            if pg.get_drawings(): pages_with_figs.add(pno)
    # pages that contain vector drawings: detect with pdftotext? poppler has no direct API → render pages that had images,
    # plus every page when the PDF is short; Claude reviews the renders for vector diagrams worth cropping.
    npages = page_count(pdf)
    render = sorted(pages_with_figs) if npages > 60 else list(range(1, npages + 1))
    for page in render: render_page(pdf, page, 110, os.path.join(out, 'pages', f'p-{page:04d}.png'))
    rows = ''.join(f'<figure><img src="{html.escape(os.path.relpath(p, out))}" loading="lazy"><figcaption>p.{pg} · {w}×{h}</figcaption></figure>' for pg, p, w, h in found)
    pages = ''.join(f'<figure><img src="pages/{html.escape(os.path.basename(p))}" loading="lazy"><figcaption>{html.escape(os.path.basename(p))}</figcaption></figure>' for p in sorted(glob.glob(os.path.join(out, 'pages', '*.png'))))
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><meta charset="utf-8"><title>Pictures in {html.escape(os.path.basename(pdf))}</title><style>body{{font:14px system-ui;margin:20px}}div{{display:flex;flex-wrap:wrap;gap:12px}}figure{{margin:0;width:260px}}img{{width:260px;border:1px solid #ddd}}</style>'
                f'<h2>{len(found)} embedded pictures (≥ {min_side}px)</h2><div>{rows}</div><h2>Page renders (look for vector diagrams to crop)</h2><div>{pages}</div>')
    print(f'{len(found)} pictures ≥ {min_side}px on {len(pages_with_figs)} pages; {len(render)} page renders → {out}/index.html')
    return found

def page_count(pdf):
    if have('pdfinfo'):
        m = re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout)
        if m: return int(m.group(1))
    try:
        fitz = _pymupdf(); return len(fitz.open(pdf))
    except ImportError: pass
    try:
        from pypdf import PdfReader; return len(PdfReader(pdf).pages)
    except ImportError: return 0

def render_page(pdf, page, dpi, out_png):
    """Render one page to PNG: poppler if installed (macOS: brew install poppler; Linux: apt install poppler-utils),
    else PyMuPDF, else pypdfium2 (all pip-installable, the same on Windows, macOS and Linux)."""
    if have('pdftoppm'):
        subprocess.run(['pdftoppm', '-png', '-r', str(dpi), '-f', str(page), '-l', str(page), '-singlefile', pdf, out_png[:-4]], check=True); return
    if _has_pymupdf(): _pymupdf().open(pdf)[page - 1].get_pixmap(dpi=dpi).save(out_png); return
    try: import pypdfium2 as pdfium
    except ImportError: sys.exit(NEED)
    doc = pdfium.PdfDocument(pdf)
    try: doc[page - 1].render(scale=dpi / 72).to_pil().save(out_png)
    finally: doc.close()

def crop(pdf, page, x, y, w, h, out, dpi=200):
    tmp = out + '.page.png'
    render_page(pdf, page, dpi, tmp)
    from PIL import Image
    with Image.open(tmp) as im:
        W, H = im.size
        im.crop((round(W * x / 100), round(H * y / 100), round(W * (x + w) / 100), round(H * (y + h) / 100))).save(out, optimize=True)
    os.remove(tmp); print('→', out, size_of(out))

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('scan', 'crop'): print(__doc__); sys.exit(1)
    if a[0] == 'scan': scan(a[1], a[2], int(a[a.index('--min') + 1]) if '--min' in a else 200)
    else: crop(a[1], int(a[2]), *map(float, a[3:7]), a[7], int(a[a.index('--dpi') + 1]) if '--dpi' in a else 200)
