#!/usr/bin/env python3
"""Find pictures for a subject on the whole web and in open collections (docs/VISUAL.md §6).

  python3 scripts/find_images.py "DNA replication fork diagram" [--n 12] [--sources bing,commons,openverse] [--json]

Sources (one search, run in parallel by the noema-lite picture service): Bing Images and DuckDuckGo Images (the whole
web — what a Google image search shows too), Wikimedia Commons, Openverse, NASA, iNaturalist, Wellcome Collection,
Art Institute of Chicago. Without access to the service it asks Wikimedia Commons and Openverse directly.
The packs are for the learner's personal study: any licence is fine — the source is always recorded.
Then: python3 scripts/fetch_image.py work/<id> <media-id> <image url or page> --alt "…"
(or the connector tool noema_image_fetch when your sandbox cannot reach the site).
"""
import os, sys, json, urllib.request, urllib.parse
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
SITE = os.environ.get('NOEMA_SITE', 'https://noema-lite.netlify.app').rstrip('/')
UA = 'noema-lite/1.0 (https://noema-lite.netlify.app; personal study app; picture finder)'

def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read().decode('utf-8'))

def direct(q, n):
    """Wikimedia Commons + Openverse, asked directly (when the service is out of reach)."""
    out, errors = [], {}
    try:
        j = get_json('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': n, 'gsrsearch': q + ' filetype:bitmap|drawing', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 1600}))
        for p in sorted((j.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 0)):
            i = (p.get('imageinfo') or [{}])[0]; md = i.get('extmetadata', {})
            out.append({'url': i.get('thumburl') or i.get('url'), 'page': i.get('descriptionurl'), 'title': p['title'][5:], 'w': i.get('thumbwidth') or i.get('width'), 'h': i.get('thumbheight') or i.get('height'), 'source': 'commons', 'license': (md.get('LicenseShortName') or {}).get('value', ''), 'credit': ''})
    except Exception as e: errors['commons'] = str(e)
    try:
        j = get_json('https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({'q': q, 'page_size': n}))
        out += [{'url': r['url'], 'page': r.get('foreign_landing_url'), 'title': r.get('title'), 'w': r.get('width'), 'h': r.get('height'), 'source': 'openverse', 'license': f"{r.get('license', '')} {r.get('license_version', '')}".strip().upper(), 'credit': r.get('creator') or ''} for r in j.get('results', [])]
    except Exception as e: errors['openverse'] = str(e)
    return {'results': out[:n], 'errors': errors}

def main(a):
    if not a or a[0].startswith('-'): print(__doc__); sys.exit(1)
    q = a[0]; opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    n = int(opt('--n', 12)); sources = opt('--sources')
    try:
        qs = {'q': q, 'n': n, **({'sources': sources} if sources else {})}
        res = get_json(f'{SITE}/api/imgsearch?' + urllib.parse.urlencode(qs))
    except Exception as e:
        print(f'ℹ️ the noema-lite picture service is out of reach ({e}) — asking Wikimedia Commons and Openverse directly.', file=sys.stderr)
        res = direct(q, n)
    if '--json' in a: print(json.dumps(res, ensure_ascii=False, indent=1)); return
    if not res['results']: print(f'No pictures found for “{q}”. Try other words (English often works best).' + (f" Unavailable: {res['errors']}" if res.get('errors') else '')); sys.exit(1)
    for i, x in enumerate(res['results'], 1):
        size = f"{x['w']}×{x['h']} · " if x.get('w') and x.get('h') else ''
        print(f"{i}. {(x.get('title') or '')[:90]} — {size}{x.get('source')} · {x.get('license') or '?'}{' · ' + str(x.get('credit'))[:60] if x.get('credit') else ''}\n   image: {x['url']}\n   page:  {x.get('page') or '—'}")
    if res.get('errors'): print(f"(unavailable now: {', '.join(res['errors'])})")
    print('\nOpen the best candidates and check them, then: python3 scripts/fetch_image.py work/<id> <media-id> "<image url or page>" --alt "…"')

if __name__ == '__main__': main(sys.argv[1:])
