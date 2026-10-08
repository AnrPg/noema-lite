"""The validator must catch broken visual content (docs/VISUAL.md). Usage: python3 tests/validate_visual.py"""
import json, os, subprocess, sys, tempfile, copy
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FX = os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from noema_lib import image_size, fill_card_ids
ch = fill_card_ids(json.load(open(os.path.join(FX, 'chapters', 'ch01.json'), encoding='utf-8')))   # as tools/build.py does (load_subject)
media = {it['id']: dict(zip(('w', 'h'), image_size(os.path.join(FX, 'media', it['file']))), regions=it['regions']) for it in json.load(open(os.path.join(FX, 'media', 'media.json'), encoding='utf-8'))['items']}
fails = 0
def run(c, expect, why, minv=3):
    global fails
    with tempfile.TemporaryDirectory() as td:
        p, m = os.path.join(td, 'ch01.json'), os.path.join(td, 'm.json')
        json.dump(c, open(p, 'w', encoding='utf-8')); json.dump(media, open(m, 'w', encoding='utf-8'))
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

# ---- flashcard ids (progress is keyed by them) ----
run(mut(lambda c: c['flashcards'][0].pop('id')), 'flashcard needs an id like ch01-f001', 'flashcard without id is rejected')
run(mut(lambda c: c['flashcards'].append(dict(c['flashcards'][0]))), 'duplicate flashcard id', 'duplicate flashcard id is rejected')
run(mut(lambda c: c['flashcards'][0].update(id='ch02-f001')), 'flashcard needs an id like ch01-f001', "another chapter's card id is rejected")
def ids_case(cards, expect, why):
    global fails
    got = [f['id'] for f in fill_card_ids({'id': 'ch03', 'flashcards': cards})['flashcards']]
    print(('  ✅ ' if got == expect else '  ❌ ') + why + ('' if got == expect else f': {got}')); fails += got != expect
ids_case([{}, {}, {}], ['ch03-f001', 'ch03-f002', 'ch03-f003'], 'cards without ids get the id of their position')
ids_case([{}, {'id': 'ch03-f001'}, {}], ['ch03-f002', 'ch03-f001', 'ch03-f003'], 'a taken id moves the card to the next free one')
ids_case([{'id': 'ch03-f710'}, {}], ['ch03-f710', 'ch03-f002'], 'existing ids are kept')

# ---- media provenance & quality (tools/noema_lib.load_media) ----
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from noema_lib import load_media
from PIL import Image
def media_case(items, expect, why, sizes={}):
    global fails
    with tempfile.TemporaryDirectory() as td:
        os.makedirs(os.path.join(td, 'media'))
        for it in [x for x in items if x.get('file')]:
            w, h = sizes.get(it['id'], (1200, 800)); Image.new('RGB', (w, h), 'white').save(os.path.join(td, 'media', it['file']))
        json.dump({'format': 'noema.media/v1', 'items': items}, open(os.path.join(td, 'media', 'media.json'), 'w', encoding='utf-8'))
        _, rep = load_media(td)
        hit = any(expect in r for r in rep) if expect else not [r for r in rep if r.startswith('ERROR')]
        print(('  ✅ ' if hit else '  ❌ ') + why + ('' if hit else '  ' + str(rep))); fails += not hit
web = lambda **k: dict({'id': 'p', 'file': 'p.png', 'origin': 'web', 'alt': 'A photo of something useful', 'credit': 'Jane Doe', 'license': 'CC BY-SA 4.0', 'url': 'https://commons.wikimedia.org/wiki/File:X.jpg', 'retrieved': '2026-10-06'}, **k)
media_case([web()], None, 'web photo with url + open licence + 1200 px is accepted')
media_case([web(license='CC BY-NC 4.0')], None, 'NonCommercial picture is accepted for personal study (source recorded)')
media_case([web(license='All rights reserved')], None, '“All rights reserved” picture is accepted with its source')
def restricted_flag(lic):
    with tempfile.TemporaryDirectory() as td:
        os.makedirs(os.path.join(td, 'media')); Image.new('RGB', (1200, 800)).save(os.path.join(td, 'media', 'p.png'))
        json.dump({'format': 'noema.media/v1', 'items': [web(license=lic)]}, open(os.path.join(td, 'media', 'media.json'), 'w', encoding='utf-8')); return load_media(td)[0]['p'].get('restricted', False)
ok_ = restricted_flag('CC BY-NC 4.0') and not restricted_flag('CC BY-SA 4.0'); print(('  ✅ ' if ok_ else '  ❌ ') + 'non-open licences are flagged “restricted” (the app warns before sharing)'); fails += not ok_
media_case([web(url='')], 'needs "url"', 'web picture without its source page is rejected')
media_case([web()], 'too small', 'low-resolution picture is rejected', sizes={'p': (500, 300)})
media_case([web(lowResOk='flat diagram, large text')], None, 'lowResOk with a reason lets a small sharp diagram through', sizes={'p': (500, 300)})
media_case([web(origin=None)], 'origin', 'raster without an origin is rejected')
# "fetch": "app" web pictures (the app downloads them; used when the builder's sandbox has no internet)
app = lambda **k: {kk: v for kk, v in {**web(), 'file': None, 'fetch': 'app', 'url': 'https://upload.wikimedia.org/x/Heart.jpg', 'w': 1600, 'h': 1200, **k}.items() if v is not None}
media_case([app()], None, '"fetch": "app" web picture with url + size is accepted without a file')
media_case([app(w=None)], 'w and h', '"fetch": "app" picture without its pixel size is rejected')
media_case([app(url=None)], 'url', '"fetch": "app" picture without its image url is rejected')
media_case([app(w=600, h=400)], 'too small', '"fetch": "app" picture below 800 px is rejected')
print('\n' + (f'{fails} FAILED' if fails else 'ALL PASSED')); sys.exit(1 if fails else 0)
