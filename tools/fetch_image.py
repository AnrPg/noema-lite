#!/usr/bin/env python3
"""Bring a picture from the web into a subject, WITH its provenance (docs/VISUAL.md §5–6).

  python3 tools/fetch_image.py SUBJECT_DIR MEDIA_ID URL --alt "…" [--license "CC BY-SA 4.0"] [--author "…"]
                               [--page URL_OF_THE_PAGE_IT_CAME_FROM] [--crop X,Y,W,H] [--scale 2] [--caption "…"] [--src part1]

URL may be the image file OR a page:
* Wikimedia: Commons / any Wikipedia file page (any language: File:, Αρχείο:, Datei:…), “…/wiki/Article#/media/File:…”,
  thumbnails — resolved to the file; author and licence are filled in from the Wikimedia API.
* Any other web page: its main picture (og:image / twitter:image / the largest <img>) is taken; the page is recorded.
* Any licence is fine for the learner's personal study (non-open ones are flagged "restricted" for sharing);
  give --license / --author when you know them, otherwise the page is recorded as the source.
* Retries on busy servers. If your sandbox cannot reach the site at all, the script says so: then use the connector tool
  noema_image_fetch (it shows you the picture and gives a ready "fetch": "app" entry the app downloads).
* --crop (pixels of the original) keeps only the informative part; --scale upsamples small crops (Lanczos).
"""
import os, sys, json, re, time, datetime, urllib.request, urllib.parse, urllib.error, html as htmllib
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import license_open

UA = 'noema-lite/1.0 (https://noema-lite.netlify.app; personal study app; picture finder)'
BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
IMG_EXT = re.compile(r'\.(png|jpe?g|gif|webp|svg|tiff?|bmp|avif)$', re.I)
WIKI = re.compile(r'(^|\.)(wikipedia|wikimedia|wikibooks|wikiversity|wikivoyage|wiktionary)\.org$', re.I)

def open_url(url, accept='*/*'):
    """GET with retries → (bytes, content_type, final_url)."""
    host = urllib.parse.urlparse(url).hostname or ''
    ua = UA if WIKI.search(host) else BROWSER_UA
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': ua, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.9'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read(), (r.headers.get('Content-Type') or '').split(';')[0].strip().lower(), r.geturl()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504): time.sleep(1.5 * (attempt + 1)); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e; time.sleep(1.0 * (attempt + 1))
    raise last

def get(url, binary=True):
    data, _, _ = open_url(url)
    return data if binary else data.decode('utf-8', 'replace')

def wiki_title(url):
    """A Wikimedia file page / #/media link → (api host, 'File:Name.ext') or None."""
    u = urllib.parse.urlparse(url)
    if not WIKI.search(u.hostname or '') or u.hostname == 'upload.wikimedia.org': return None
    m = re.search(r'#/media/([^/]+)$', url)
    title = urllib.parse.unquote(m.group(1)) if m else urllib.parse.unquote(u.path[6:]) if u.path.startswith('/wiki/') else urllib.parse.parse_qs(u.query).get('title', [''])[0]
    mm = re.match(r'^[^:]{2,40}:(.+)$', title or '')
    if not mm or not IMG_EXT.search(mm.group(1)): return None
    return ('commons.wikimedia.org' if m or 'commons' in u.hostname else u.hostname), 'File:' + mm.group(1).replace('_', ' ')

def bigger_thumb(url):
    """upload.wikimedia.org …/thumb/…/220px-Name.png → a 1600 px rendering."""
    m = re.match(r'^(https://upload\.wikimedia\.org/[^/]+/[^/]+/thumb/[0-9a-f]/[0-9a-f]{2}/[^/]+)/(\d+)px-([^/?#]+)', url)
    return f'{m.group(1)}/1600px-{m.group(3)}' if m and int(m.group(2)) < 1600 else url

def commons(host, title, page):
    api = f'https://{host}/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': 2400, 'format': 'json'})
    pages = json.loads(get(api, False))['query']['pages']
    p = next(iter(pages.values()))
    if 'imageinfo' not in p and host != 'commons.wikimedia.org': return commons('commons.wikimedia.org', title, page)   # a wiki's page about a Commons file
    info = p['imageinfo'][0]; md = info.get('extmetadata', {})
    strip = lambda s: re.sub(r'<[^>]+>', '', (s or {}).get('value', '')).strip()
    big = info.get('thumburl') if info.get('width', 0) > 2400 and info.get('thumburl') else info['url']
    return {'file': big, 'author': strip(md.get('Artist')) or 'see source page', 'license': strip(md.get('LicenseShortName')), 'license_url': strip(md.get('LicenseUrl')), 'page': info.get('descriptionurl') or page}

def page_image(html, base):
    """The main picture of an HTML page (absolute url) or None (same rules as engine/imglib.js pageImage)."""
    s = html[:2_000_000]
    generic = lambda x: re.search(r'logo|favicon|sprite|default|placeholder|share|social|stumbleupon|facebook|twitter|banner|brand|avatar|icon', x.split('?')[0].rsplit('/', 1)[-1], re.I)
    for key in ('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'):
        for tag in re.findall(r'<meta[^>]+(?:property|name)=["\']' + re.escape(key) + r'["\'][^>]*>', s, re.I):
            c = re.search(r'content=["\']([^"\']+)["\']', tag, re.I)
            if c and not generic(c.group(1)): return urllib.parse.urljoin(base, htmllib.unescape(c.group(1)))
    best, area = None, 0
    for tag in re.findall(r'<img\b[^>]*>', s, re.I):
        src = re.search(r'\s(?:data-src|data-original|src)=["\']([^"\']+)["\']', tag, re.I)
        if not src or re.search(r'^data:|sprite|logo|icon|avatar|pixel|spacer|\.gif($|\?)', src.group(1), re.I): continue
        w = re.search(r'\swidth=["\']?(\d+)', tag, re.I); h = re.search(r'\sheight=["\']?(\d+)', tag, re.I)
        a = (int(w.group(1)) if w else 300) * (int(h.group(1)) if h else 200)
        if a > area: area, best = a, urllib.parse.urljoin(base, htmllib.unescape(src.group(1)))
    return best

def wikimedia_file(url):
    """upload. / thumb.wikimedia.org …/commons/[thumb/]a/ab/Name.png[/1280px-…] → 'File:Name.png' (for author + licence) or None"""
    m = re.match(r'^https?://(?:upload|thumb)\.wikimedia\.org/[^/]+/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?#]+)', url)
    return 'File:' + urllib.parse.unquote(m.group(1)).replace('_', ' ') if m else None

def resolve(url, author=None, license=None, page=None):
    """Any url → {'file', 'author', 'license', 'page', 'raw'(bytes, when already downloaded)}"""
    wt = wiki_title(url)
    if wt: return commons(wt[0], wt[1], url)
    wf = wikimedia_file(url)
    if wf and not (author and license):
        try: return commons('commons.wikimedia.org', wf, page or url)
        except Exception: pass
    url = bigger_thumb(url)
    for _ in range(3):
        data, ctype, final = open_url(url, accept='image/avif,image/webp,image/*,text/html;q=0.8,*/*;q=0.5')
        if ctype.startswith('text/html') or data[:200].lstrip().lower().startswith((b'<!doctype html', b'<html')):
            pic = page_image(data.decode('utf-8', 'replace'), final)
            if not pic: raise SystemExit(f'❌ {url}: this page has no main picture — give the image file url (or another candidate)')
            page = page or final; wt = wiki_title(pic); wf = wikimedia_file(pic)
            if wt: return commons(wt[0], wt[1], page)
            if wf:   # a page whose picture is on Wikimedia (e.g. a Wikipedia article): its author + licence from there
                try: m = commons('commons.wikimedia.org', wf, page); m['page'] = page; return m
                except Exception: pass
            url = bigger_thumb(pic); continue
        return {'file': final, 'author': author, 'license': license, 'page': page or url, 'raw': data}
    raise SystemExit(f'❌ {url}: no picture found')

def main(a):
    if len(a) < 3: print(__doc__); sys.exit(1)
    sdir, mid, url = a[0], a[1], a[2]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    try:
        meta = resolve(url, opt('--author'), opt('--license'), opt('--page'))
        if opt('--author'): meta['author'] = opt('--author')
        if opt('--license'): meta['license'] = opt('--license')
        raw = meta.pop('raw', None) or get(meta['file'])
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        host = urllib.parse.urlparse(url).hostname
        print(f'❌ Could not download {url} ({e}).\n   Your sandbox may have no network access to {host}. With the noema-lite connector: call noema_image_fetch with this url —'
              f' it shows you the picture and gives a ready media.json entry ("fetch": "app": the app downloads it). Otherwise take another candidate.')
        sys.exit(2)
    meta['license'] = meta.get('license') or 'All rights reserved (personal study use)'
    meta['author'] = meta.get('author') or 'see the source page'
    if not license_open(meta['license']): print(f'ℹ️ licence "{meta["license"]}" is not open: fine for personal study, flagged "restricted" for sharing.')
    sig = raw[:12]
    ext = '.png' if sig.startswith(b'\x89PNG') else '.jpg' if sig.startswith(b'\xff\xd8') else '.gif' if sig.startswith(b'GIF8') else '.webp' if sig[:4] == b'RIFF' and sig[8:12] == b'WEBP' else '.svg' if b'<svg' in raw[:4096].lower() else ''
    if not ext: print(f'❌ {meta["file"]} is not a picture (png / jpg / gif / webp / svg) — take another candidate.'); sys.exit(1)
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

if __name__ == '__main__': main([x.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace') for x in sys.argv[1:]])
