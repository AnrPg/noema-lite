#!/usr/bin/env python3
"""reviseExercises / reviseFlashcards / reviseBlocks rewrite items in place and keep their ids (tools/noema_lib.py revise,
CONTENT_SPEC.md "Additive updates"); unknown ids are reported as errors."""
import json, os, sys, tempfile, shutil
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
from noema_lib import load_subject
fails = 0
def ok(c, m):
    global fails; print(('  ✅ ' if c else '  ❌ ') + m); fails += 0 if c else 1
FIX = os.path.join(os.path.dirname(__file__), 'fixtures', 'demo-physics')
d = tempfile.mkdtemp(); sd = os.path.join(d, 'demo-physics'); shutil.copytree(FIX, sd)
ch = json.load(open(os.path.join(sd, 'chapters', 'ch01.json'), encoding='utf-8'))
e0, f0, s0 = ch['exercises'][0], ch['flashcards'][0], ch['sections'][0]
os.makedirs(os.path.join(sd, 'patches'), exist_ok=True)
patch = {"patches": [{"chapter": "ch01",
    "reviseExercises": [dict(e0, explain="Revised: a longer explanation. It says why.")],
    "reviseFlashcards": [dict(f0, a="revised answer")],
    "reviseBlocks": [{"section": s0['id'], "index": 0, "block": {"t": "p", "text": "Revised paragraph."}}]}]}
json.dump(patch, open(os.path.join(sd, 'patches', 'p1.json'), 'w', encoding='utf-8'))
_, _, chs, rep = load_subject(sd); c = chs[0]
ok(not [r for r in rep if r.startswith('ERROR')], 'a valid revise patch applies without errors')
ok(c['exercises'][0]['id'] == e0['id'] and c['exercises'][0]['explain'].startswith('Revised'), 'reviseExercises: same id, same place, new content')
ok(len(c['exercises']) == len(ch['exercises']), 'reviseExercises adds nothing')
ok(c['flashcards'][0]['a'] == 'revised answer' and c['flashcards'][0]['id'] == f0.get('id', c['flashcards'][0]['id']), 'reviseFlashcards: in place')
ok(c['sections'][0]['blocks'][0]['text'] == 'Revised paragraph.', 'reviseBlocks: the block at that index')
patch['patches'][0]['reviseExercises'] = [dict(e0, id='ch01-e999')]; patch['patches'][0]['reviseBlocks'] = [{"section": "ch01-s99", "index": 0, "block": {"t": "p", "text": "x"}}]
json.dump(patch, open(os.path.join(sd, 'patches', 'p1.json'), 'w', encoding='utf-8'))
_, _, chs, rep = load_subject(sd)
errs = [r for r in rep if r.startswith('ERROR')]
ok(any('ch01-e999' in r for r in errs) and any('ch01-s99' in r for r in errs), 'unknown ids and sections are errors')
shutil.rmtree(d)
print('\n❌ %d failed' % fails if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
