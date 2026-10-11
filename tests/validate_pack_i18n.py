"""The validator checks packs in several languages (tools/CONTENT_SPEC.md "Packs in several languages", docs/i18n.md §10):
subject.i18n (locale codes, known fields, only what the source has) and translated chapters (same ids, same structure,
same answers). Usage: python3 tests/validate_pack_i18n.py"""
import json, os, subprocess, sys, tempfile, copy
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FX = os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from noema_lib import fill_card_ids, load_subject, load_translations
J = lambda *p: json.load(open(os.path.join(FX, *p), encoding='utf-8'))
subj, src, fr = J('subject.json'), fill_card_ids(J('chapters', 'ch01.json')), fill_card_ids(J('translations', 'fr', 'ch01.json'))
fails = 0
def run(obj, args, expect, why, src_obj=None):
    global fails
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, 'x.json'); json.dump(obj, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        if src_obj is not None: sp = os.path.join(td, 'src.json'); json.dump(src_obj, open(sp, 'w', encoding='utf-8'), ensure_ascii=False); args = args + ['--source', sp]
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'validate.py'), p] + args, capture_output=True, text=True)
        hit = (expect in r.stdout) if expect else r.returncode == 0
        print(('  ✅ ' if hit else '  ❌ ') + why + ('' if hit else '\n' + r.stdout[-700:])); fails += not hit
def S(f): o = copy.deepcopy(subj); f(o); return o
def T(f): o = copy.deepcopy(fr); f(o); return o
ex = lambda c, i: next(e for e in c['exercises'] if e['id'] == i)
print('subject.json')
run(subj, ['--subject', '--translations', 'fr'], None, 'the fixture subject (el + fr metadata, fr content) is valid')
run(S(lambda o: o.pop('i18n')), ['--subject'], None, 'a subject without translations is valid (they are optional)')
run(S(lambda o: o['i18n'].update({'greek': {'title': 'x'}})), ['--subject'], "'greek' is not a locale code", 'a bad locale code')
run(S(lambda o: o['i18n'].update({'en': {'title': 'x'}})), ['--subject'], "is the pack's own language", 'a translation into the pack’s own language')
run(S(lambda o: o['i18n']['el'].update({'colour': 'x'})), ['--subject'], 'unknown field', 'an unknown field')
run(S(lambda o: o['i18n']['el'].update({'appTitle': 'x'})), ['--subject'], "the subject has no 'appTitle'", 'a field the source does not have')
run(S(lambda o: o['i18n']['el'].update({'tutor': {'voice': 'x'}})), ['--subject'], "has no 'voice'", 'a tutor key the source does not have')
run(S(lambda o: o['i18n']['el'].update({'title': ' '})), ['--subject'], 'must be a non-empty string', 'an empty title')
run(S(lambda o: o['i18n'].update({'nl': {'title': 'x'}})), ['--subject'], "'nl' is not a UI language", 'a locale no learner can have (warning)')
run(subj, ['--subject', '--translations', 'de'], 'add subject.i18n.de', 'content without translated metadata (warning)')
print('translations/fr/ch01.json')
run(fr, [], None, 'the French chapter is valid', src)
run(T(lambda c: c['exercises'].pop()), [], 'exercise(s) missing: ch01-e111', 'a missing exercise', src)
run(T(lambda c: c['exercises'].append(dict(ex(c, 'ch01-e002'), id='ch01-e999'))), [], 'not in the source: ch01-e999', 'an extra exercise', src)
run(T(lambda c: ex(c, 'ch01-e003').update(answer=1)), [], 'ch01-e003: differs from the source in answer', 'a changed answer', src)
run(T(lambda c: ex(c, 'ch01-e108')['options'].append('Un avion')), [], 'differs from the source in #options', 'a different number of options', src)
run(T(lambda c: c['sections'][0]['blocks'].pop(0)), [], 'same blocks, same order', 'a missing block', src)
run(T(lambda c: c['sections'][0].update(id='ch01-s02')), [], 'same ids, same order', 'a renamed section', src)
run(T(lambda c: c['flashcards'][0].update(id='ch01-f009')), [], 'flashcard(s) missing: ch01-f001', 'a renamed flashcard', src)
run(T(lambda c: c['pitfalls'].clear()), [], 'pitfalls, the source has', 'a missing pitfall', src)
print('loading (noema_lib)')
meta, sources, chs, rep = load_subject(FX); tr = load_translations(FX, chs)
ok = list(tr) == ['fr'] and tr['fr'][0]['src'] == 's1' and tr['fr'][0]['flashcards'][0]['id'] == 'ch01-f001'
print(('  ✅ ' if ok else '  ❌ ') + 'load_translations: one locale, the source mapping and the card ids copied'); fails += not ok
print(f'\n{fails} FAILED' if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
