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

Needs poppler-utils (pdfimages, pdftoppm, pdfinfo) — or PyMuPDF (pip install pymupdf) as a fallback.
"""
import os, re, sys, shutil, subprocess, glob, html, struct

def have(cmd): return shutil.which(cmd) is not None

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
    else:
        try: import fitz
        except ImportError: sys.exit('Install poppler-utils (pdfimages/pdftoppm) or PyMuPDF (pip install pymupdf).')
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
    npages = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1)) if have('pdfinfo') else 0
    render = sorted(pages_with_figs) if npages > 60 else list(range(1, npages + 1))
    for page in render:
        if have('pdftoppm'): subprocess.run(['pdftoppm', '-png', '-r', '110', '-f', str(page), '-l', str(page), '-singlefile', pdf, os.path.join(out, 'pages', f'p-{page:04d}')], check=True)
    rows = ''.join(f'<figure><img src="{html.escape(os.path.relpath(p, out))}" loading="lazy"><figcaption>p.{pg} · {w}×{h}</figcaption></figure>' for pg, p, w, h in found)
    pages = ''.join(f'<figure><img src="pages/{html.escape(os.path.basename(p))}" loading="lazy"><figcaption>{html.escape(os.path.basename(p))}</figcaption></figure>' for p in sorted(glob.glob(os.path.join(out, 'pages', '*.png'))))
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><meta charset="utf-8"><title>Pictures in {html.escape(os.path.basename(pdf))}</title><style>body{{font:14px system-ui;margin:20px}}div{{display:flex;flex-wrap:wrap;gap:12px}}figure{{margin:0;width:260px}}img{{width:260px;border:1px solid #ddd}}</style>'
                f'<h2>{len(found)} embedded pictures (≥ {min_side}px)</h2><div>{rows}</div><h2>Page renders (look for vector diagrams to crop)</h2><div>{pages}</div>')
    print(f'{len(found)} pictures ≥ {min_side}px on {len(pages_with_figs)} pages; {len(render)} page renders → {out}/index.html')
    return found

def crop(pdf, page, x, y, w, h, out, dpi=200):
    tmp = out + '.page'
    subprocess.run(['pdftoppm', '-png', '-r', str(dpi), '-f', str(page), '-l', str(page), '-singlefile', pdf, tmp], check=True)
    from PIL import Image
    with Image.open(tmp + '.png') as im:
        W, H = im.size
        im.crop((round(W * x / 100), round(H * y / 100), round(W * (x + w) / 100), round(H * (y + h) / 100))).save(out, optimize=True)
    os.remove(tmp + '.png'); print('→', out, size_of(out))

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('scan', 'crop'): print(__doc__); sys.exit(1)
    if a[0] == 'scan': scan(a[1], a[2], int(a[a.index('--min') + 1]) if '--min' in a else 200)
    else: crop(a[1], int(a[2]), *map(float, a[3:7]), a[7], int(a[a.index('--dpi') + 1]) if '--dpi' in a else 200)
