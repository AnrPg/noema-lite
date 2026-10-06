"""The validator must catch broken visual content (docs/VISUAL.md). Usage: python3 tests/validate_visual.py"""
import json, os, subprocess, sys, tempfile, copy
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FX = os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics')
ch = json.load(open(os.path.join(FX, 'chapters', 'ch01.json')))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from noema_lib import image_size
media = {it['id']: dict(zip(('w', 'h'), image_size(os.path.join(FX, 'media', it['file']))), regions=it['regions']) for it in json.load(open(os.path.join(FX, 'media', 'media.json')))['items']}
fails = 0
def run(c, expect, why, minv=3):
    global fails
    with tempfile.TemporaryDirectory() as td:
        p, m = os.path.join(td, 'ch01.json'), os.path.join(td, 'm.json')
        json.dump(c, open(p, 'w')); json.dump(media, open(m, 'w'))
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'validate.py'), p, '--media', m, '--min-visual', str(minv)], capture_output=True, text=True)
        hit = expect in r.stdout if expect else r.returncode == 0
        print(('  ✅ ' if hit else '  ❌ ') + why + ('' if hit else '\n' + r.stdout[-600:])); fails += not hit
def mut(f):
    c = copy.deepcopy(ch); f(c); return c
ex = lambda c, i: next(e for e in c['exercises'] if e['id'] == i)
run(ch, None, 'fixture chapter is valid')
run(mut(lambda c: ex(c, 'ch01-e101').update(answer=['nope'])), "answer 'nope' is not a region", 'unknown answer region')
run(mut(lambda c: ex(c, 'ch01-e104').update(media='ghost')), "media 'ghost' not in", 'unknown picture')
run(mut(lambda c: ex(c, 'ch01-e105').update(regions=[{'id': 'a', 'shape': 'rect', 'x': 700, 'y': 10, 'w': 200, 'h': 20, 'label': 'A'}])), 'outside the 800x420 picture', 'region outside the picture')
run(mut(lambda c: ex(c, 'ch01-e103').update(answer=['fuel', 'fuel'])), 'sequence repeats a region', 'sequence repeating a step')
run(mut(lambda c: ex(c, 'ch01-e108').update(answer=7)), 'bad answer index', 'reveal answer out of range')
run(mut(lambda c: ex(c, 'ch01-e106').update(targets=None, regions=[{'id': 'a', 'shape': 'circle', 'cx': 50, 'cy': 50, 'r': 20}, {'id': 'b', 'shape': 'circle', 'cx': 150, 'cy': 50, 'r': 20, 'label': 'B'}])), 'every target needs a label', 'select target without label')
run(mut(lambda c: c.update(exercises=[e for e in c['exercises'] if not e['type'].startswith('img_')])), 'visual exercises (subject requires >= 3', 'chapter without visual exercises is rejected')
run(mut(lambda c: c['sections'][0].update(blocks=[b for b in c['sections'][0]['blocks'] if b['t'] != 'figure'])), "no 'figure' block", 'chapter without a figure is rejected')

# ---- media provenance & quality (tools/noema_lib.load_media) ----
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from noema_lib import load_media
from PIL import Image
def media_case(items, expect, why, sizes={}):
    global fails
    with tempfile.TemporaryDirectory() as td:
        os.makedirs(os.path.join(td, 'media'))
        for it in items:
            w, h = sizes.get(it['id'], (1200, 800)); Image.new('RGB', (w, h), 'white').save(os.path.join(td, 'media', it['file']))
        json.dump({'format': 'noema.media/v1', 'items': items}, open(os.path.join(td, 'media', 'media.json'), 'w'))
        _, rep = load_media(td)
        hit = any(expect in r for r in rep) if expect else not [r for r in rep if r.startswith('ERROR')]
        print(('  ✅ ' if hit else '  ❌ ') + why + ('' if hit else '  ' + str(rep))); fails += not hit
web = lambda **k: dict({'id': 'p', 'file': 'p.png', 'origin': 'web', 'alt': 'A photo of something useful', 'credit': 'Jane Doe', 'license': 'CC BY-SA 4.0', 'url': 'https://commons.wikimedia.org/wiki/File:X.jpg', 'retrieved': '2026-10-06'}, **k)
media_case([web()], None, 'web photo with url + open licence + 1200 px is accepted')
media_case([web(license='CC BY-NC 4.0')], 'is not reusable', 'NonCommercial licence is rejected')
media_case([web(license='All rights reserved')], 'is not reusable', 'unlicensed picture is rejected')
media_case([web(url='')], 'needs "url"', 'web picture without its source page is rejected')
media_case([web()], 'too small', 'low-resolution picture is rejected', sizes={'p': (500, 300)})
media_case([web(lowResOk='flat diagram, large text')], None, 'lowResOk with a reason lets a small sharp diagram through', sizes={'p': (500, 300)})
media_case([web(origin=None)], 'origin', 'raster without an origin is rejected')
print('\n' + (f'{fails} FAILED' if fails else 'ALL PASSED')); sys.exit(1 if fails else 0)
