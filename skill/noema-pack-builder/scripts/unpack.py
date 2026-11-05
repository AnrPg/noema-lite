#!/usr/bin/env python3
"""Turn an existing pack back into a subject folder, for ADDITIVE updates.
  python3 unpack.py PACK.noema.zip|PACK.json WORKDIR   → WORKDIR/<id>/ (subject.json, sources.json, chapters/, media/, activities/, sources/, translations/)
A .noema.zip package also gives back the original source files (sources/). From a plain .json the files are not there:
the learner already has them, so make_pack.py keeps those sources as they are.
Existing chapters become the base files: never renumber or delete their ids — add new chapters (next chNN)
or patches/*.json (appendBlocks / appendExercises …) so the learner keeps all progress."""
import os, sys, json, base64, re
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
import zipfile
bundle = None
if zipfile.is_zipfile(a[0]):
    bundle = zipfile.ZipFile(a[0])
    if 'pack.json' not in bundle.namelist(): sys.exit('not a noema-lite package (no pack.json inside)')
    p = json.loads(bundle.read('pack.json').decode('utf-8'))
else: p = json.load(open(a[0], encoding='utf-8'))
if p.get('format') != 'noema-pack': sys.exit('not a noema-pack file')
sid = p['subject']['id']; d = os.path.join(a[1], sid)
for sub in ('chapters', 'patches', 'media', 'sources', 'coverage'): os.makedirs(os.path.join(d, sub), exist_ok=True)
subj = {k: v for k, v in p['subject'].items() if k not in ('owner',)}
subj.setdefault('authoring', {'minVisualPerChapter': 3, 'minExercisesPerPicture': 3})
json.dump(subj, open(os.path.join(d, 'subject.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
SRC = p.get('sources') or {'sources': [], 'chapters': {}, 'patches': {}}
restored, kept = [], []
for s in SRC.get('sources', []):
    f = str(s.get('file') or '')
    if not f or f.startswith(('http://', 'https://')): continue
    if bundle and f in bundle.namelist() and f.startswith('sources/') and '..' not in f.split('/'):
        dst = os.path.join(d, *f.split('/')); os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(bundle.read(f)); restored.append(f)
    else: kept.append(s['id'])
json.dump(SRC, open(os.path.join(d, 'sources.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({'from': os.path.basename(a[0]), 'sourcesWithFiles': kept, 'chapters': [c['id'] for c in p['chapters']]}, open(os.path.join(d, '.unpacked.json'), 'w', encoding='utf-8'))
for c in p['chapters']:
    c = {k: v for k, v in c.items() if not k.startswith('_')}
    json.dump(c, open(os.path.join(d, 'chapters', c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
def tr_chapters(loc, t):   # inline, or in its own file: translations/<locale>.json in the package, or <id>.tr.<locale>.json beside the .json
    if isinstance(t.get('chapters'), list): return t['chapters']
    if bundle and f'translations/{loc}.json' in bundle.namelist(): return json.loads(bundle.read(f'translations/{loc}.json').decode('utf-8')).get('chapters') or []
    here = os.path.dirname(os.path.abspath(a[0])); f = os.path.join(here, f'{sid}.tr.{loc}.json')
    for g in (f, os.path.join(here, f'tr.{loc}.json')):   # (tr.<locale>.json: a library subject's, beside its pack.json)
        if os.path.exists(g): return json.load(open(g, encoding='utf-8')).get('chapters') or []
    print(f'⚠️ translation {loc}: its file is not here ({os.path.basename(f)}) — translate the chapters again or get the file'); return []
for loc, t in (p.get('translations') or {}).items():   # a pack in several languages: translations/<locale>/chNN.json
    for c in tr_chapters(loc, t):
        c = {k: v for k, v in c.items() if not k.startswith('_')}
        os.makedirs(os.path.join(d, 'translations', loc), exist_ok=True)
        json.dump(c, open(os.path.join(d, 'translations', loc, c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
EXT = {'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp'}
items = []
for mid, m in (p.get('media') or {}).items():
    if not m.get('data'):    # a "fetch": "app" web picture (the app downloads it): keep url + size, no file
        items.append({k: v for k, v in m.items() if k not in ('mime', 'sha')} | {'id': mid, 'fetch': 'app'}); continue
    mt = re.match(r'data:([^;,]+)(;base64)?,(.*)', m['data'], re.S)
    raw = base64.b64decode(mt.group(3)) if mt.group(2) else mt.group(3).encode()
    fn = mid + EXT.get(mt.group(1), '.bin'); open(os.path.join(d, 'media', fn), 'wb').write(raw)
    items.append({k: v for k, v in m.items() if k not in ('data', 'mime', 'sha', 'w', 'h') or (k in ('w', 'h') and not fn.endswith('.svg'))} | {'id': mid, 'file': fn})
json.dump({'format': 'noema.media/v1', 'items': items}, open(os.path.join(d, 'media', 'media.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
acts = (p.get('activities') or {}).get('items') or []   # interactive activities (docs/INTERACTIVE.md): back to activities/activities.json + activities/<id>/
if acts:
    reg = []
    for x in acts:
        aid = str(x.get('id') or '')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', aid): print(f'⚠️ activity {aid!r}: not a valid id, skipped'); continue
        ad = os.path.join(d, 'activities', aid); os.makedirs(ad, exist_ok=True)
        e = {k: v for k, v in x.items() if k not in ('html', 'python', 'sha256', 'bytes', 'strings', 'spec', 'h5p', 'h5pByLocale', 'wasm')}   # (external-embed@1: no file, no entry — its url, provider, credit stay in the registry)
        if x.get('runtime') == 'h5p@1':   # the .h5p file travels beside the pack: in the .noema.zip, inline (one-file copies), or next to a pack.json
            # the file is looked for under the item's own entry (checked: activities/….h5p, no ..); only the unpacked folder's name is item.h5p
            e['entry'] = f'activities/{aid}/item.h5p'; ent = str(x.get('entry') or ''); raw = None
            if not re.fullmatch(r'activities/[^\\:]+\.h5p', ent) or '..' in ent.split('/') or '' in ent.split('/'): ent = e['entry']
            if bundle and ent in bundle.namelist(): raw = bundle.read(ent)
            elif isinstance(x.get('h5p'), str): raw = base64.b64decode(re.sub(r'^data:[^,]*;base64,', '', x['h5p']))
            else:
                here = os.path.dirname(os.path.abspath(a[0]))
                for g in dict.fromkeys((os.path.join(here, *ent.split('/')), os.path.join(here, *e['entry'].split('/')), os.path.join(here, f'{sid}.act.{aid}.h5p'))):
                    if os.path.isfile(g): raw = open(g, 'rb').read(); break
            if raw is None: print(f'⚠️ activity {aid}: its .h5p file is not here ({ent}) — get the file (it is inside {sid}.noema.zip) and put it there')
            else: open(os.path.join(ad, 'item.h5p'), 'wb').write(raw)
            rest = {}
            for loc, v in (x.get('h5pByLocale') if isinstance(x.get('h5pByLocale'), dict) else {}).items():   # content.<locale>.json / l10n.<locale>.json
                if not re.fullmatch(r'[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4}){0,2}', str(loc)) or not isinstance(v, dict): continue
                for kind in ('content', 'l10n'):
                    if isinstance(v.get(kind), dict): json.dump(v[kind], open(os.path.join(ad, f'{kind}.{loc}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                left = {k: w for k, w in v.items() if k not in ('content', 'l10n')}   # another package for this language stays in the registry
                if left: rest[loc] = left
            if rest: e['h5pByLocale'] = rest
        if isinstance(x.get('html'), str):
            e['entry'] = f'activities/{aid}/app.html'; open(os.path.join(ad, 'app.html'), 'w', encoding='utf-8', newline='').write(x['html'])
        if 'spec' in x:   # sim-spec@1: the spec is data (activities/<id>/spec.json); wasm-module@1: its own spec, beside module.wasm
            e['entry'] = f'activities/{aid}/spec.json'; json.dump(x['spec'], open(os.path.join(ad, 'spec.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if isinstance(x.get('wasm'), str):   # wasm-module@1: the module back as bytes (activities/<id>/module.wasm; make_pack.py writes base64 + sha256 + bytes again)
            try: raw = base64.b64decode(x['wasm'], validate=True)
            except Exception: print(f'⚠️ activity {aid}: the module is not valid base64, skipped'); continue
            e['entry'] = f'activities/{aid}/module.wasm'; open(os.path.join(ad, 'module.wasm'), 'wb').write(raw)
        if isinstance(x.get('python'), str):   # py-module@1: the Python file is the entry (activities/<id>/main.py), its spec beside it
            e['entry'] = f'activities/{aid}/main.py'; open(os.path.join(ad, 'main.py'), 'w', encoding='utf-8', newline='').write(x['python'])
        for loc, tab in (x.get('strings') or {}).items():
            if re.fullmatch(r'[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4}){0,2}', str(loc)): json.dump(tab, open(os.path.join(ad, f'strings.{loc}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        reg.append(e)
    json.dump({'format': (p.get('activities') or {}).get('format') or 'noema.activities/v1', 'items': reg}, open(os.path.join(d, 'activities', 'activities.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'unpacked {sid}: {len(p["chapters"])} chapters, {len(items)} pictures, {len(acts)} activities, {len(restored)} source file(s) → {d}' + (f'  ({len(kept)} source file(s) stay in the learner\'s account: {", ".join(kept)})' if kept else ''))
