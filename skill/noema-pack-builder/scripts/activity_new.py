#!/usr/bin/env python3
"""Start a new activity from the reference one (alias-lab: sampling and aliasing; docs/INTERACTIVE_AUTHORING.md):
  python3 activity_new.py SUBJECT_DIR NEW_ID
→ activities/<NEW_ID>/app.html, strings.en/el/ru.json, tests.json; its entry in activities/activities.json (made if missing);
media/<NEW_ID>-still.svg + its media.json entry (the fallback picture: replace it with a still of YOUR activity).
Then change everything to your own idea; keep the structure (noema.ready, noema.t, the tokens, saveState, result after a try)."""
import os, sys, json, re, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
sdir, nid = os.path.abspath(a[0]), a[1]
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', nid): sys.exit('✗ the id is lower-case letters, digits and - (2–61 characters)')
src = next((d for d in (os.path.join(HERE, 'activities_examples', 'alias-lab'), os.path.join(HERE, '..', '..', '..', 'tools', 'activities_examples', 'alias-lab')) if os.path.isdir(d)), None)
if not src: sys.exit('✗ the reference activity (activities_examples/alias-lab) is missing from the toolkit')
dst = os.path.join(sdir, 'activities', nid)
if os.path.exists(dst): sys.exit(f'✗ activities/{nid} exists already')
os.makedirs(dst)
for f in os.listdir(src):
    if f == 'app.html' or f.startswith('strings.'): shutil.copy(os.path.join(src, f), dst)
rp = os.path.join(sdir, 'activities', 'activities.json')
reg = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {'format': 'noema.activities/v1', 'items': []}
if any(x.get('id') == nid for x in reg['items']): sys.exit(f'✗ {nid} is in activities.json already')
item = json.load(open(os.path.join(src, 'activity.json'), encoding='utf-8'))
item.update(id=nid, entry=f'activities/{nid}/app.html', fallback={'media': f'{nid}-still', 'text': 'TODO: what the activity shows and teaches, in words (>= 40 characters), for a learner who cannot run it.'})
item['credit'] = 'TODO'
reg['items'].append(item); json.dump(reg, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
os.makedirs(os.path.join(sdir, 'media'), exist_ok=True)
shutil.copy(os.path.join(src, 'fallback.svg'), os.path.join(sdir, 'media', f'{nid}-still.svg'))
mp = os.path.join(sdir, 'media', 'media.json')
mm = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {'format': 'noema.media/v1', 'items': []}
if not any(m.get('id') == f'{nid}-still' for m in mm['items']):
    mm['items'].append({'id': f'{nid}-still', 'file': f'{nid}-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'TODO', 'alt': 'TODO: what the still picture shows'})
    json.dump(mm, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({'cases': [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': '#fs', 'value': '10'}], 'expect': {'passed': True}},
                     {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': '#fs', 'value': '5'}], 'expect': {'passed': False}}]},
          open(os.path.join(dst, 'tests.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'✓ activities/{nid}/ (from alias-lab), its activities.json entry, media/{nid}-still.svg. Next: change app.html and the strings, '
      f'replace every TODO, add the block / sim exercise, then activity_lint.py → activity_test.py → activity_preview.py')
