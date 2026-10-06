#!/usr/bin/env python3
"""Turn an existing pack (.json) back into a subject folder, for ADDITIVE updates.
  python3 unpack.py PACK.json WORKDIR      → WORKDIR/<id>/ (subject.json, sources.json, chapters/, media/)
Existing chapters become the base files: never renumber or delete their ids — add new chapters (next chNN)
or patches/*.json (appendBlocks / appendExercises …) so the learner keeps all progress."""
import os, sys, json, base64, re
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
p = json.load(open(a[0], encoding='utf-8'))
if p.get('format') != 'noema-pack': sys.exit('not a noema-pack file')
sid = p['subject']['id']; d = os.path.join(a[1], sid)
for sub in ('chapters', 'patches', 'media', 'sources', 'coverage'): os.makedirs(os.path.join(d, sub), exist_ok=True)
subj = {k: v for k, v in p['subject'].items() if k not in ('owner',)}
subj.setdefault('authoring', {'minVisualPerChapter': 3, 'minExercisesPerPicture': 3})
json.dump(subj, open(os.path.join(d, 'subject.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(p.get('sources') or {'sources': [], 'chapters': {}, 'patches': {}}, open(os.path.join(d, 'sources.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for c in p['chapters']:
    c = {k: v for k, v in c.items() if not k.startswith('_')}
    json.dump(c, open(os.path.join(d, 'chapters', c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
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
print(f'unpacked {sid}: {len(p["chapters"])} chapters, {len(items)} pictures → {d}')
