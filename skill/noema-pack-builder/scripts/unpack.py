#!/usr/bin/env python3
"""Turn an existing pack back into a subject folder, for ADDITIVE updates.
  python3 unpack.py PACK.noema.zip|PACK.json WORKDIR   → WORKDIR/<id>/ (subject.json, sources.json, chapters/, media/, sources/, translations/)
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
print(f'unpacked {sid}: {len(p["chapters"])} chapters, {len(items)} pictures, {len(restored)} source file(s) → {d}' + (f'  ({len(kept)} source file(s) stay in the learner\'s account: {", ".join(kept)})' if kept else ''))
