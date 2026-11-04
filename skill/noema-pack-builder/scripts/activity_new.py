#!/usr/bin/env python3
"""Start a new activity from a reference one (docs/INTERACTIVE_AUTHORING.md):
  python3 activity_new.py SUBJECT_DIR NEW_ID [--runtime html-app@1 | sim-spec@1]
html-app@1 (default) copies alias-lab (sampling and aliasing, a mini-app): activities/<NEW_ID>/app.html, strings.<locale>.json, tests.json.
sim-spec@1 copies rc-lowpass (an RC low-pass filter, a declarative simulation): activities/<NEW_ID>/spec.json, strings.<locale>.json, tests.json.
Both: its entry in activities/activities.json (made if missing); media/<NEW_ID>-still.svg + its media.json entry (the fallback
picture: replace it with a still of YOUR activity). Then change everything to your own idea; keep the structure
(html-app: noema.ready, noema.t, the tokens, saveState, result after a try; sim-spec: every label a key of the string tables,
every formula in the expression language, a sim exercise graded by checks)."""
import os, sys, json, re, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[1:]
runtime = 'html-app@1'
if '--runtime' in a:
    i = a.index('--runtime'); runtime = a[i + 1] if i + 1 < len(a) else ''; del a[i:i + 2]
if len(a) < 2: print(__doc__); sys.exit(1)
REF = {'html-app@1': 'alias-lab', 'sim-spec@1': 'rc-lowpass'}
if runtime not in REF: sys.exit(f'✗ --runtime is one of {", ".join(REF)}')
sdir, nid = os.path.abspath(a[0]), a[1]
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', nid): sys.exit('✗ the id is lower-case letters, digits and - (2–61 characters)')
ref = REF[runtime]
src = next((d for d in (os.path.join(HERE, 'activities_examples', ref), os.path.join(HERE, '..', '..', '..', 'tools', 'activities_examples', ref)) if os.path.isdir(d)), None)
if not src: sys.exit(f'✗ the reference activity (activities_examples/{ref}) is missing from the toolkit')
dst = os.path.join(sdir, 'activities', nid)
if os.path.exists(dst): sys.exit(f'✗ activities/{nid} exists already')
rp = os.path.join(sdir, 'activities', 'activities.json')
reg = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {'format': 'noema.activities/v1', 'items': []}
if any(x.get('id') == nid for x in reg['items']): sys.exit(f'✗ {nid} is in activities.json already')
os.makedirs(dst)
main = 'app.html' if runtime == 'html-app@1' else 'spec.json'
for f in os.listdir(src):
    if f == main or f.startswith('strings.'): shutil.copy(os.path.join(src, f), dst)
item = json.load(open(os.path.join(src, 'activity.json'), encoding='utf-8'))
item.update(id=nid, entry=f'activities/{nid}/{main}', fallback={'media': f'{nid}-still', 'text': 'TODO: what the activity shows and teaches, in words (>= 40 characters), for a learner who cannot run it.'})
item['credit'] = 'TODO'
reg['items'].append(item); json.dump(reg, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
os.makedirs(os.path.join(sdir, 'media'), exist_ok=True)
shutil.copy(os.path.join(src, 'fallback.svg'), os.path.join(sdir, 'media', f'{nid}-still.svg'))
mp = os.path.join(sdir, 'media', 'media.json')
mm = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {'format': 'noema.media/v1', 'items': []}
if not any(m.get('id') == f'{nid}-still' for m in mm['items']):
    mm['items'].append({'id': f'{nid}-still', 'file': f'{nid}-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'TODO', 'alt': 'TODO: what the still picture shows'})
    json.dump(mm, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if runtime == 'html-app@1':
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': '#fs', 'value': '10'}], 'expect': {'passed': True}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': '#fs', 'value': '5'}], 'expect': {'passed': False}}]
else:   # sim-spec@1: "set" names a param of the spec; "values" are ranges of the computed values
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'R', 'value': 1600}], 'expect': {'passed': True, 'values': {'fc': [950, 1050]}}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'R', 'value': 4710}], 'expect': {'passed': False}}]
json.dump({'cases': cases}, open(os.path.join(dst, 'tests.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'✓ activities/{nid}/ (from {ref}, {runtime}), its activities.json entry, media/{nid}-still.svg. Next: change {main} and the strings, '
      f'replace every TODO, add the block / sim exercise' + (' (grade: {"mode": "checks", "checks": [...]})' if runtime == 'sim-spec@1' else '')
      + ', then activity_lint.py → activity_test.py → activity_preview.py')
