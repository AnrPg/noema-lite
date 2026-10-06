#!/usr/bin/env python3
"""Bring a picture from the web into a subject, WITH its provenance (docs/VISUAL.md §5–6).

  python3 tools/fetch_image.py SUBJECT_DIR MEDIA_ID URL --alt "…" [--license "CC BY-SA 4.0"] [--author "…"]
                               [--page URL_OF_THE_PAGE_IT_CAME_FROM] [--crop X,Y,W,H] [--scale 2] [--caption "…"] [--src part1]

* Wikimedia Commons file pages (https://commons.wikimedia.org/wiki/File:…) are resolved through the API:
  original file, author and license are filled in automatically.
* Everything else: give --license and --author yourself after checking the page (only open licenses:
  see ALLOWED in tools/noema_lib.py). The file is saved under media/ and registered in media/media.json
  with origin "web", url, author, license, retrieved date.
* --crop (pixels of the original) keeps only the informative part; --scale upsamples small crops (Lanczos).
"""
import os, sys, json, re, datetime, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import ALLOWED_LICENSES, license_ok

UA = 'noema-lite/1.0 (+https://noema-lite.netlify.app; educational)'

def get(url, binary=True):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
    return data if binary else data.decode('utf-8')

def commons(file_page):
    title = urllib.parse.unquote(file_page.split('/wiki/')[1])
    api = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'format': 'json'})
    info = next(iter(json.loads(get(api, False))['query']['pages'].values()))['imageinfo'][0]
    md = info.get('extmetadata', {})
    strip = lambda s: re.sub(r'<[^>]+>', '', (s or {}).get('value', '')).strip()
    return {'file': info['url'], 'author': strip(md.get('Artist')) or 'see source page', 'license': strip(md.get('LicenseShortName')), 'license_url': strip(md.get('LicenseUrl')), 'page': file_page}

def main(a):
    if len(a) < 3: print(__doc__); sys.exit(1)
    sdir, mid, url = a[0], a[1], a[2]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    meta = {'file': url, 'author': opt('--author'), 'license': opt('--license'), 'page': opt('--page', url)}
    if 'commons.wikimedia.org/wiki/File:' in url: meta.update(commons(url))
    if not meta['license'] or not license_ok(meta['license']): sys.exit(f'✗ license "{meta["license"]}" is not an open license we can reuse ({", ".join(ALLOWED_LICENSES)}). Pick another picture.')
    if not meta['author']: sys.exit('✗ --author is required (who made the picture / who holds the copyright).')
    raw = get(meta['file'])
    ext = os.path.splitext(urllib.parse.urlparse(meta['file']).path)[1].lower() or '.png'
    if ext == '.jpeg': ext = '.jpg'
    mdir = os.path.join(sdir, 'media'); os.makedirs(mdir, exist_ok=True)
    out = os.path.join(mdir, mid + ext)
    with open(out, 'wb') as f: f.write(raw)
    if opt('--crop') or opt('--scale'):
        from PIL import Image
        with Image.open(out) as im:
            if opt('--crop'):
                x, y, w, h = map(int, opt('--crop').split(','))
                im = im.crop((x, y, x + w, y + h))
            if opt('--scale'):
                s = float(opt('--scale')); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            im.save(out, optimize=True)
    item = {'id': mid, 'file': os.path.basename(out), 'origin': 'web', 'alt': opt('--alt', ''), 'credit': meta['author'], 'license': meta['license'],
            'url': meta['page'], 'retrieved': datetime.date.today().isoformat()}
    if opt('--caption'): item['caption'] = opt('--caption')
    if opt('--src'): item['src'] = opt('--src')
    p = os.path.join(mdir, 'media.json')
    reg = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {'format': 'noema.media/v1', 'items': []}
    old = next((x for x in reg['items'] if x['id'] == mid), None)
    if old and old.get('regions'): item['regions'] = old['regions']      # keep regions already authored
    reg['items'] = sorted([x for x in reg['items'] if x['id'] != mid] + [item], key=lambda x: x['id'])
    json.dump(reg, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'✓ {out} · {meta["license"]} · {meta["author"]}\n  now add "regions" to media.json (look at the picture first!) and write ≥ 3 exercises for it.')

if __name__ == '__main__': main(sys.argv[1:])
