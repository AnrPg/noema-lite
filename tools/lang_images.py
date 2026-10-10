#!/usr/bin/env python3
"""Pictures for the concepts of a language course (docs/LANGUAGES.md §4.3, §11).

  python3 tools/lang_images.py COURSE_DIR [--field food.vegetables] [--limit N] [--width 330]
                               [--set CONCEPT=File:Name.jpg …] [--drop CONCEPT …]

* Every concept with a Wikidata id and no picture yet gets the Wikidata picture (P18) — or the Commons file given
  with --set (when P18 is missing or shows the wrong thing: a field, a dish, a botanical plate of the plant only).
* The picture is a small thumbnail (WebP, ≤ --width px) in core/media/, with its provenance in core/media/media.json
  (noema.media/v1, docs/VISUAL.md): the Commons file page, author, licence, retrieval date.
* Re-runnable: concepts that already have a picture are skipped, so an interrupted run just continues.
* --drop removes a concept's picture (file, media.json entry and the concept's "media").
"""
import os, sys, io, json, re, time, datetime, hashlib, urllib.request, urllib.parse, urllib.error, html as htmllib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import license_open

UA = 'noema-lite/1.0 (https://noema-lite.netlify.app; personal study app; picture finder)'

def get(url, data=None, accept='application/json'):
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=60) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 5:
                ra = e.headers.get('Retry-After'); time.sleep(int(ra) if ra and ra.isdigit() else 2 ** attempt * 10); continue
            raise
        except urllib.error.URLError:
            if attempt < 5: time.sleep(2 ** attempt); continue
            raise

def p18(qids):
    """Wikidata id → Commons file name of its picture (P18)."""
    out = {}
    for i in range(0, len(qids), 80):
        q = 'SELECT ?i ?img WHERE { VALUES ?i { %s } ?i wdt:P18 ?img }' % ' '.join('wd:' + x for x in qids[i:i + 80])
        r = json.loads(get('https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'}), accept='application/sparql-results+json'))
        for b in r['results']['bindings']:
            qid = b['i']['value'].rsplit('/', 1)[1]
            name = urllib.parse.unquote(b['img']['value'].rsplit('/', 1)[1])
            out.setdefault(qid, name)   # the first picture when there are several
    return out

def plain(s):
    s = re.sub(r'<[^>]+>', '', htmllib.unescape(s or '')); return re.sub(r'\s+', ' ', s).strip()

CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'refcache', 'commons_meta.json')

def thumb_url(name, width):
    """The Commons thumbnail of a file, computed (no API call): …/thumb/a/ab/Name.jpg/330px-Name.jpg."""
    n = name.replace(' ', '_'); h = hashlib.md5(n.encode('utf-8')).hexdigest(); q = urllib.parse.quote(n)
    if n.lower().endswith(('.svg', '.tif', '.tiff')): q2 = q + ('.png' if n.lower().endswith('.svg') else '.jpg')
    else: q2 = q
    return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{width}px-{q2}'

def commons_info(names):
    """Commons file name → {page, author, license}; cached in data/refcache (the API is rate-limited)."""
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    todo = [n for n in names if n.replace('_', ' ') not in cache]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'titles': '|'.join('File:' + n for n in chunk)})
        r = json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))
        for p in r['query']['pages'].values():
            if 'imageinfo' not in p: continue
            ii = p['imageinfo'][0]; md = ii.get('extmetadata', {})
            cache[p['title'][5:]] = {'page': ii.get('descriptionurl') or ('https://commons.wikimedia.org/wiki/' + urllib.parse.quote(p['title'].replace(' ', '_'))),
                'author': plain(md.get('Artist', {}).get('value')) or plain(md.get('Credit', {}).get('value')) or 'unknown (see the file page)',
                'license': plain(md.get('LicenseShortName', {}).get('value')) or 'see the file page'}
        os.makedirs(os.path.dirname(CACHE), exist_ok=True); json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        time.sleep(5)
    return {n: cache.get(n.replace('_', ' ')) for n in names}

def to_webp(data, width):
    from PIL import Image
    im = Image.open(io.BytesIO(data)); im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    if im.height > width * 1.4:   # very tall pictures: keep the middle, so tiles stay tidy
        top = (im.height - round(width * 1.4)) // 2; im = im.crop((0, top, im.width, top + round(width * 1.4)))
    b = io.BytesIO(); im.save(b, 'WEBP', quality=72, method=6); return b.getvalue(), im.width, im.height

def main(a):
    if not a or a[0].startswith('-'): print(__doc__); return 2
    root = a[0]; opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    width = int(opt('--width', 330)); limit = int(opt('--limit', 10 ** 6)); only = opt('--field')
    sets = dict(x.split('=', 1) for x in a[a.index('--set') + 1:] if '=' in x) if '--set' in a else {}
    drops = [x for x in a[a.index('--drop') + 1:] if not x.startswith('-')] if '--drop' in a else []
    if '--set' in a: drops = []   # --set and --drop are not combined in one run
    mdir = os.path.join(root, 'core', 'media'); os.makedirs(mdir, exist_ok=True)
    mpath = os.path.join(mdir, 'media.json')
    media = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {'format': 'noema.media/v1', 'items': []}
    byid = {m['id']: m for m in media['items']}
    fdir = os.path.join(root, 'core', 'fields'); files = {}
    for f in sorted(os.listdir(fdir)):
        d = json.load(open(os.path.join(fdir, f), encoding='utf-8'))
        if not only or d['field'] == only: files[f] = d
    concepts = {c['id']: c for d in files.values() for c in d['concepts']}
    mid = lambda cid: re.sub(r'[^a-z0-9-]+', '-', cid.lower())
    changed = set()
    for cid in drops:
        c = concepts.get(cid)
        if not c or not c.get('media'): print('  (no picture)', cid); continue
        m = byid.pop(c['media'], None)
        if m and os.path.exists(os.path.join(mdir, m['file'])): os.remove(os.path.join(mdir, m['file']))
        del c['media']; changed.add(cid); print('  dropped', cid)
    for cid in sets:
        c = concepts[cid]
        if c.get('media'):
            m = byid.pop(c['media'], None)
            if m and os.path.exists(os.path.join(mdir, m['file'])): os.remove(os.path.join(mdir, m['file']))
            del c['media']
    todo = [c for c in concepts.values() if not c.get('media') and (c['id'] in sets or (c.get('wikidata') and not sets))][:limit]
    if not todo: print('nothing to do'); return 0
    names = {c['id']: sets[c['id']].removeprefix('File:') for c in todo if c['id'] in sets}
    need = [c['wikidata'] for c in todo if c['id'] not in names]
    if need:
        pic = p18(need)
        for c in todo:
            if c['id'] not in names and c['wikidata'] in pic: names[c['id']] = pic[c['wikidata']]
    info = commons_info(sorted(set(names.values())))
    today = datetime.date.today().isoformat(); n = 0
    for c in todo:
        cid = c['id']; name = names.get(cid)
        if not name: print('  – no picture on Wikidata:', cid, c.get('wikidata')); continue
        i = info.get(name)
        if not i: print('  – not on Commons:', cid, name); continue
        try: data, w, h = to_webp(get(thumb_url(name, width), accept='image/*'), width)
        except Exception as e: print('  ✗', cid, name, e); continue
        m = {'id': mid(cid), 'file': mid(cid) + '.webp', 'origin': 'web', 'url': i['page'], 'retrieved': today,
             'lowResOk': 'a small picture-dictionary thumbnail', 'alt': c['gloss'], 'credit': i['author'][:200], 'license': i['license'], 'w': w, 'h': h}
        if not license_open(m['license']): m['restricted'] = True
        open(os.path.join(mdir, m['file']), 'wb').write(data)
        byid[m['id']] = m; c['media'] = m['id']; changed.add(cid); n += 1
        print(f'  ✓ {cid:28} {len(data) // 1024:3} KB  {m["license"]:16} {name}')
        time.sleep(0.3)
    media['items'] = sorted(byid.values(), key=lambda m: m['id'])
    json.dump(media, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); open(mpath, 'a').write('\n')
    for f, d in files.items():
        if any(c['id'] in changed for c in d['concepts']):
            json.dump(d, open(os.path.join(fdir, f), 'w', encoding='utf-8'), ensure_ascii=False, indent=1); open(os.path.join(fdir, f), 'a').write('\n')
    print(f'{n} picture(s) added; {len(media["items"])} in all')
    return 0

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
