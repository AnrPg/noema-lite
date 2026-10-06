#!/usr/bin/env python3
"""Validate a subject folder and build its single-file pack for noema-lite.
  python3 make_pack.py SUBJECT_DIR [OUT_DIR]        → OUT_DIR/<id>.json   (default OUT_DIR: /mnt/user-data/outputs or .)
Exit code 1 (and a list of errors) when anything is wrong — fix and run again. Never deliver a pack that fails."""
import os, sys, json, subprocess, tempfile, datetime
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from noema_lib import load_subject, load_media, content_hash
a = sys.argv[1:]
if not a: print(__doc__); sys.exit(1)
sdir = os.path.abspath(a[0])
out_dir = a[1] if len(a) > 1 else ('/mnt/user-data/outputs' if os.path.isdir('/mnt/user-data/outputs') else '.')
meta, sources, chapters, report = load_subject(sdir)
media, mrep = load_media(sdir)
errs = [r for r in report + mrep if r.startswith('ERROR')]
for w in mrep:
    if w.startswith('WARN'): print(w)
auth = meta.get('authoring') or {}
per_pic = int(auth.get('minExercisesPerPicture', 3)); min_vis = int(auth.get('minVisualPerChapter', 3))
used = Counter(e.get('media') for c in chapters for e in c['exercises'] if e['type'].startswith('img_'))
for m in media:
    if used[m] < per_pic: errs.append(f'ERROR media {m}: used by {used[m]} exercise(s); every picture needs >= {per_pic}')
with tempfile.TemporaryDirectory() as td:
    mp = os.path.join(td, 'media.json'); json.dump({k: {'w': v['w'], 'h': v['h'], 'regions': v.get('regions')} for k, v in media.items()}, open(mp, 'w'))
    for c in chapters:
        p = os.path.join(td, c['id'] + '.json'); json.dump(c, open(p, 'w'), ensure_ascii=False)
        r = subprocess.run([sys.executable, os.path.join(HERE, 'validate.py'), p, '--media', mp, '--min-visual', str(min_vis)], capture_output=True, text=True)
        print(r.stdout.splitlines()[0] if r.stdout else c['id'])
        errs += [f'{c["id"]}: ' + l for l in r.stdout.splitlines() if l.startswith('ERROR')]
if errs:
    print('\n'.join(errs)); print(f'\n✗ {len(errs)} error(s) — pack NOT written.'); sys.exit(1)
counts = {'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'exercises': sum(len(c['exercises']) for c in chapters),
          'playbooks': sum(len(c.get('debug', [])) for c in chapters), 'flashcards': sum(len(c.get('flashcards', [])) for c in chapters),
          'visual': sum(1 for c in chapters for e in c['exercises'] if e['type'].startswith('img_')), 'media': len(media)}
meta = dict(meta); meta['owner'] = None
pack = {'format': 'noema-pack', 'v': 1, 'subject': meta, 'sources': sources, 'chapters': chapters, 'media': media, 'counts': counts,
        'builtAt': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(), 'builtWith': 'noema-pack-builder skill'}
pack['version'] = content_hash({'s': meta, 'src': sources, 'c': chapters, 'm': {k: v['sha'] for k, v in media.items()}})
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, meta['id'] + '.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(pack, f, ensure_ascii=False, separators=(',', ':'))
print(f'\n✓ {out}  ({os.path.getsize(out) // 1024} KB) · {counts["chapters"]} chapters · {counts["exercises"]} exercises ({counts["visual"]} visual) · {counts["media"]} pictures')
