#!/usr/bin/env python3
"""Writes one small file of every type the 👁 viewer supports (tests/viewer.js).   python3 make_viewer_files.py OUTDIR
Office files need python-docx, openpyxl, python-pptx, reportlab (only for the test fixtures)."""
import os, sys, io, json, zipfile, wave, struct, base64
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
P = lambda n: os.path.join(out, n)
GR = 'Η δομή του DNA — διπλή έλικα'
# PDF: 3 pages with text
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
c = canvas.Canvas(P('book.pdf'), pagesize=A4)
for i in range(1, 4): c.setFont('Helvetica', 28); c.drawString(72, 700, f'Page {i} of the source'); c.showPage()
c.save()
# images
from PIL import Image, ImageDraw
im = Image.new('RGB', (640, 400), '#dbeafe'); d = ImageDraw.Draw(im); d.rectangle([40, 40, 600, 360], outline='#1d4ed8', width=8); im.save(P('figure.png')); im.save(P('scan.tiff')); im.save(P('photo.jpg'), quality=85); im.save(P('anim.gif'))
open(P('diagram.svg'), 'w', encoding='utf-8').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fde68a"/><text x="20" y="60" font-size="24">SVG ok</text></svg>')
# text family
open(P('notes.md'), 'w', encoding='utf-8').write(f'# {GR}\n\n- **bold** item\n- second\n')
open(P('table.csv'), 'w', encoding='utf-8').write('name;value\n"A; quoted";1\nΒήτα;2\n')
open(P('data.json'), 'w', encoding='utf-8').write(json.dumps({'gene': 'TP53', 'ok': True}))
open(P('page.html'), 'w', encoding='utf-8').write('<h1>HTML ok</h1><script>parent.HACKED=1</script><p>safe</p>')
open(P('script.py'), 'w', encoding='utf-8').write('def f(x):\n    return x * 2  # python ok\n')
open(P('greek-1253.txt'), 'wb').write('Ελληνικά σε windows-1253 κωδικοποίηση και αρκετό κείμενο για να φανεί'.encode('cp1253'))
# DOCX
import docx; doc = docx.Document(); doc.add_heading('Word heading', 1); doc.add_paragraph(GR); doc.save(P('chapter.docx'))
# XLSX + ODS-like via openpyxl (xlsx only)
import openpyxl; wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Genes'; ws.append(['gene', 'length']); ws.append(['BRCA1', 81189]); wb.create_sheet('Second').append(['x']); wb.save(P('sheet.xlsx'))
# PPTX with an image
from pptx import Presentation; from pptx.util import Inches
pr = Presentation(); s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = 'Slide title ok'; s.placeholders[1].text = 'Bullet about histones'
s2 = pr.slides.add_slide(pr.slide_layouts[6]); s2.shapes.add_picture(P('figure.png'), Inches(1), Inches(1)); pr.save(P('slides.pptx'))
# ODT (minimal valid package)
def odf(name, mime, body):
    with zipfile.ZipFile(P(name), 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), mime)
        z.writestr('content.xml', f'<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>{body}</office:text></office:body></office:document-content>')
        z.writestr('META-INF/manifest.xml', '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>')
odf('essay.odt', 'application/vnd.oasis.opendocument.text', '<text:h>ODT heading ok</text:h><text:p>ODT paragraph</text:p>')
# RTF (Greek via \u escapes)
open(P('letter.rtf'), 'w').write(r'{\rtf1\ansi\ansicpg1253{\fonttbl{\f0 Arial;}}\f0 RTF ok \u917?\u955?\u955?\u951?\u957?\u953?\u954?\u940?\par Second line}')
# EPUB
with zipfile.ZipFile(P('book.epub'), 'w') as z:
    z.writestr('mimetype', 'application/epub+zip')
    z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    z.writestr('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="i1" href="img/fig.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/></spine></package>')
    z.writestr('OEBPS/text/ch1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>EPUB chapter ok</h1><img src="../img/fig.png"/></body></html>')
    z.write(P('figure.png'), 'OEBPS/img/fig.png')
# IPYNB
json.dump({'cells': [{'cell_type': 'markdown', 'source': ['# Notebook ok']}, {'cell_type': 'code', 'source': ['print(1+1)'], 'outputs': [{'output_type': 'stream', 'text': ['2\n']}]}], 'nbformat': 4, 'nbformat_minor': 5, 'metadata': {}}, open(P('analysis.ipynb'), 'w'))
# EML (multipart, quoted-printable Greek subject)
open(P('mail.eml'), 'w', encoding='utf-8').write('From: Prof <prof@example.org>\nTo: me@example.org\nSubject: =?UTF-8?B?' + base64.b64encode('Θέμα μαθήματος'.encode()).decode() + '?=\nMIME-Version: 1.0\nContent-Type: multipart/alternative; boundary="XX"\n\n--XX\nContent-Type: text/plain; charset=utf-8\n\nPlain body\n--XX\nContent-Type: text/html; charset=utf-8\nContent-Transfer-Encoding: quoted-printable\n\n<p>HTML mail body ok</p>\n--XX--\n')
# ZIP containing a markdown file
with zipfile.ZipFile(P('bundle.zip'), 'w') as z: z.writestr('inside/readme.md', '# Inner file ok'); z.writestr('inside/other.txt', 'x')
# WAV (0.3 s tone)
with wave.open(P('tone.wav'), 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(b''.join(struct.pack('<h', int(8000 * (1 if (i // 10) % 2 else -1))) for i in range(2400)))
# legacy binary with UTF-16 text inside (like an old .doc)
open(P('old.doc'), 'wb').write(b'\xd0\xcf\x11\xe0' + b'\x00' * 200 + 'Legacy document text ok'.encode('utf-16le') + b'\x00' * 100)
open(P('mystery.bin'), 'wb').write(bytes(range(256)) * 4)
print('viewer fixtures →', out, len(os.listdir(out)), 'files')
