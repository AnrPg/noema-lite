#!/usr/bin/env python3
"""Create the working folder of a new subject (or of an additive update).
  python3 start_subject.py WORKDIR SUBJECT_ID "Title" [--lang en] [--emoji 📘] [--group other] [--math] [--code]
WORKDIR/<id>/ gets subject.json, sources.json, chapters/, patches/, media/media.json, sources/, coverage/."""
import os, sys, json
a = sys.argv[1:]
if len(a) < 3: print(__doc__); sys.exit(1)
work, sid, title = a[0], a[1], a[2]
opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
import re
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', sid): sys.exit('SUBJECT_ID: lowercase letters, digits and hyphens only')
d = os.path.join(work, sid)
if os.path.exists(os.path.join(d, 'subject.json')): sys.exit(f'{d} already exists')
for sub in ('chapters', 'patches', 'media', 'sources', 'coverage'): os.makedirs(os.path.join(d, sub), exist_ok=True)
json.dump({'id': sid, 'title': title, 'appTitle': f'{title} Quest', 'emoji': opt('--emoji', '📘'), 'group': opt('--group', 'other'), 'description': '', 'language': opt('--lang', 'en'),
           'features': {'math': '--math' in a, 'code': '--code' in a}, 'hero': {'headline': f'Master **{title}**, one bite at a time.', 'mantra': ''}, 'searchExamples': '',
           'authoring': {'minVisualPerChapter': 3, 'minExercisesPerPicture': 3},
           'tutor': {'name': 'Brick', 'avatar': '🦉', 'domain': title, 'prior': '', 'examples': '', 'interviewer': f'an examiner for {title}', 'simulation': '', 'terminology': '', 'examinerRole': f'{title} examiner'}},
          open(os.path.join(d, 'subject.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({'sources': [], 'chapters': {}, 'patches': {}}, open(os.path.join(d, 'sources.json'), 'w'), indent=1)
json.dump({'format': 'noema.media/v1', 'items': []}, open(os.path.join(d, 'media', 'media.json'), 'w'), indent=1)
print('created', d)
