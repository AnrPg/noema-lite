#!/usr/bin/env python3
"""Scaffold a new subject.
  python3 tools/new_subject.py cell-biology "Cell Biology" --group life-sciences --emoji 🧬 [--math] [--code] [--lang en] [--private anr]
Creates library/subjects/<id>/ (or accounts/<profile>/packs/<id>/ with --private) with subject.json, sources.json, media/media.json and empty folders.
Every chapter must then carry >= 3 visual exercises + a figure (docs/VISUAL.md)."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import LIB, ACC, wj, rj
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
sid, title = a[0], a[1]
opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
groups = [g['id'] for g in rj(os.path.join(LIB, 'groups.json'))['groups']]
grp = opt('--group', 'other')
if grp not in groups: sys.exit(f'unknown group {grp}; choose one of {groups} (or add it to library/groups.json)')
d = os.path.join(ACC, opt('--private'), 'packs', sid) if '--private' in a else os.path.join(LIB, 'subjects', sid)
if os.path.exists(d): sys.exit(f'{d} exists')
for sub in ('chapters', 'patches', 'sources', 'coverage', 'authoring', 'media'): os.makedirs(os.path.join(d, sub))
wj(os.path.join(d, 'subject.json'), {'id': sid, 'title': title, 'appTitle': f'{title} Quest', 'emoji': opt('--emoji', '📘'), 'group': grp, 'description': '', 'language': opt('--lang', 'en'),
   'features': {'math': '--math' in a, 'code': '--code' in a}, 'hero': {'headline': f'Master **{title}**, one bite at a time.', 'mantra': ''}, 'searchExamples': '',
   'authoring': {'minVisualPerChapter': 3, 'minExercisesPerPicture': 3},
   'tutor': {'name': 'Brick', 'avatar': '🦉', 'domain': title, 'prior': '', 'examples': '', 'interviewer': f'an examiner for {title}', 'simulation': '', 'terminology': '', 'examinerRole': f'{title} examiner'}})
wj(os.path.join(d, 'media', 'media.json'), {'format': 'noema.media/v1', 'items': []})
wj(os.path.join(d, 'sources.json'), {'sources': [], 'chapters': {}, 'patches': {}})
print('created', d)
