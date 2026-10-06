"""The validator must catch broken visual content (docs/VISUAL.md). Usage: python3 tests/validate_visual.py"""
import json, os, subprocess, sys, tempfile, copy
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FX = os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics')
ch = json.load(open(os.path.join(FX, 'chapters', 'ch01.json')))
media = {it['id']: {'w': 800, 'h': 420, 'regions': it['regions']} for it in json.load(open(os.path.join(FX, 'media', 'media.json')))['items']}
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
print('\n' + (f'{fails} FAILED' if fails else 'ALL PASSED')); sys.exit(1 if fails else 0)
