#!/usr/bin/env python3
"""Interactive activities travel inside the pack (docs/INTERACTIVE.md, docs/adr/001 D2): a subject folder with activities/ →
make_pack.py → pack.activities (bundle inline, sha256, strings per locale) + pack.requires → unpack.py gives the folder back →
make_pack.py again gives the same pack.version. And what make_pack.py refuses (missing strings, a network link, an unknown
activity, a runtime of a later version). Uses the skill zip (dist/noema-pack-builder.zip; built here when missing).
With $NOEMA_ACT_SUBJECT set it also writes the subject folder there (as "Demo Activities", for tests/activities_app.js)."""
import os, sys, json, shutil, subprocess, tempfile, zipfile
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
SKZ = os.path.join(ROOT, 'dist', 'noema-pack-builder.zip')
if not os.path.exists(SKZ) or os.environ.get('NOEMA_REBUILD_SKILL'): subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build.py'), 'skill'], check=True, capture_output=True)
T = tempfile.mkdtemp(); zipfile.ZipFile(SKZ).extractall(T); S = os.path.join(T, 'noema-pack-builder', 'scripts')
run = lambda *a: subprocess.run([sys.executable, *a], capture_output=True, text=True, encoding='utf-8', errors='replace')
ok = 0
def check(cond, msg, out=''):
    global ok
    if not cond: print('✗', msg, '\n', out[-3000:]); sys.exit(1)
    ok += 1; print('✓', msg)
rj = lambda p: json.load(open(p, encoding='utf-8'))
def wj(p, o): os.makedirs(os.path.dirname(p), exist_ok=True); json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

EX = os.path.join(ROOT, 'tools', 'activities_examples', 'alias-lab')
sd = os.path.join(T, 'w', 'demo-physics'); shutil.copytree(os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics'), sd)
ad = os.path.join(sd, 'activities', 'alias-lab'); os.makedirs(ad)
for f in os.listdir(EX):
    if f.startswith('strings.') or f == 'app.html': shutil.copy(os.path.join(EX, f), ad)
wj(os.path.join(sd, 'activities', 'activities.json'), {'format': 'noema.activities/v1', 'items': [rj(os.path.join(EX, 'activity.json'))]})
shutil.copy(os.path.join(EX, 'fallback.svg'), os.path.join(sd, 'media', 'alias-lab-still.svg'))
mm = rj(os.path.join(sd, 'media', 'media.json'))
mm['items'].append({'id': 'alias-lab-still', 'file': 'alias-lab-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'A 7 Hz sine (grey) sampled at 10 Hz (blue dots); the dots lie on a 3 Hz sine (red, dashed).'})
wj(os.path.join(sd, 'media', 'media.json'), mm)
BLOCK = {'t': 'interactive', 'activity': 'alias-lab', 'caption': 'Sampling and aliasing: move the sliders.'}
SIM = {'id': 'ch01-e900', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['concept'], 'think': 'apply', 'activity': 'alias-lab',
       'q': 'A 7 Hz signal is sampled. Find a sampling rate at which the samples look like a 3 Hz wave.',
       'task': {'seed': 'auto', 'params': {'f': 7, 'target': 3}}, 'grade': {'mode': 'reported'},
       'hints': ['The samples cannot tell f apart from f − n·fs.', 'Try a rate between 7 and 14 Hz.'],
       'reveal': 'At 10 Hz, 7 − 10 = −3: the samples are those of a 3 Hz wave (mirrored).', 'explain': 'Aliasing: |f − n·fs| with the nearest whole n.'}
def put(ch):
    c = rj(ch); c['sections'][0]['blocks'].append(dict(BLOCK)); c['exercises'].append(dict(SIM)); wj(ch, c)
put(os.path.join(sd, 'chapters', 'ch01.json')); put(os.path.join(sd, 'translations', 'fr', 'ch01.json'))
if os.environ.get('NOEMA_ACT_SUBJECT'):   # run_e2e.sh: the same subject as a library subject "Demo Activities" (tests/activities_app.js opens it)
    dst = os.environ['NOEMA_ACT_SUBJECT']; shutil.rmtree(dst, ignore_errors=True); shutil.copytree(sd, dst)
    sj = rj(os.path.join(dst, 'subject.json')); sj.update(id='demo-activities', title='Demo Activities'); wj(os.path.join(dst, 'subject.json'), sj)
mk = lambda src, out: run(os.path.join(S, 'make_pack.py'), src, os.path.join(T, out))
pk = lambda out: zipfile.ZipFile(os.path.join(T, out, 'demo-physics.noema.zip'))

r = mk(sd, 'o1'); check(r.returncode == 0, 'make_pack.py builds a pack with an activity', r.stdout + r.stderr)
p = json.loads(pk('o1').read('pack.json'))
a = (p.get('activities') or {}).get('items', [{}])[0]
html = open(os.path.join(EX, 'app.html'), encoding='utf-8').read()
check(p['activities']['format'] == 'noema.activities/v1' and a.get('html') == html, 'the bundle is inline in the pack, as written')
import hashlib
check(a.get('sha256') == hashlib.sha256(html.encode()).hexdigest() and a.get('bytes') == len(html.encode()), 'sha256 and bytes name the bundle')
check(sorted(a.get('strings') or {}) == ['el', 'en', 'fr', 'ru'] and a['strings']['el']['signal'] == 'Σήμα', 'the strings of every locale are in the pack')
check(p.get('requires') == ['activities/v1', 'runtime:html-app@1'], 'pack.requires names the core and the runtime', str(p.get('requires')))
check(p['counts'].get('activities') == 1 and 'alias-lab-still' in p['media'], 'counts.activities; the fallback picture is a pack picture (and needs no exercises)')

# the round trip
w2 = os.path.join(T, 'w2'); r = run(os.path.join(S, 'unpack.py'), os.path.join(T, 'o1', 'demo-physics.noema.zip'), w2)
u = os.path.join(w2, 'demo-physics')
check(r.returncode == 0 and '1 activities' in r.stdout, 'unpack.py gives the activities back', r.stdout + r.stderr)
check(open(os.path.join(u, 'activities', 'alias-lab', 'app.html'), encoding='utf-8', newline='').read() == html, 'app.html comes back byte for byte')
check(rj(os.path.join(u, 'activities', 'alias-lab', 'strings.ru.json')) == rj(os.path.join(EX, 'strings.ru.json')), 'the string tables come back')
reg = rj(os.path.join(u, 'activities', 'activities.json'))
check(reg['items'][0].get('entry') == 'activities/alias-lab/app.html' and 'html' not in reg['items'][0], 'activities.json names the entry file (no bundle inside)')
r = mk(u, 'o2'); check(r.returncode == 0, 'the unpacked folder builds again', r.stdout + r.stderr)
p2 = json.loads(pk('o2').read('pack.json'))
check(p2['activities'] == p['activities'] and p2['version'] == p['version'], 'same activities, same pack.version after the round trip')

# a changed bundle → a new version
open(os.path.join(u, 'activities', 'alias-lab', 'app.html'), 'a', encoding='utf-8').write('\n<!-- v2 -->\n')
r = mk(u, 'o3'); p3 = json.loads(pk('o3').read('pack.json'))
check(r.returncode == 0 and p3['version'] != p['version'], 'a changed bundle changes pack.version')

# what is refused
def refused(name, change, want):
    w = os.path.join(T, 'bad-' + name); shutil.copytree(sd, w); shutil.rmtree(os.path.join(w, 'build'), ignore_errors=True); change(w)
    r = mk(w, 'ob-' + name); check(r.returncode == 1 and want in r.stdout, 'refused: ' + name, r.stdout + r.stderr)
refused('missing locale', lambda w: os.remove(os.path.join(w, 'activities', 'alias-lab', 'strings.fr.json')), 'strings for fr are missing')
refused('network link', lambda w: open(os.path.join(w, 'activities', 'alias-lab', 'app.html'), 'a').write('<img src="https://x.example/p.png">'), 'a link to the network')
refused('same-origin', lambda w: open(os.path.join(w, 'activities', 'alias-lab', 'app.html'), 'a').write('<!-- allow-same-origin -->'), 'allow-same-origin')
def unknown(w):
    c = rj(os.path.join(w, 'chapters', 'ch01.json')); c['sections'][0]['blocks'][-1]['activity'] = 'nope'; wj(os.path.join(w, 'chapters', 'ch01.json'), c)
refused('unknown activity', unknown, "activity 'nope' is not in pack.activities")
def later(w):
    r_ = rj(os.path.join(w, 'activities', 'activities.json')); r_['items'][0]['runtime'] = 'py-module@1'; wj(os.path.join(w, 'activities', 'activities.json'), r_)
refused('later runtime', later, 'arrives in a later version')
def nofb(w):
    r_ = rj(os.path.join(w, 'activities', 'activities.json')); r_['items'][0]['fallback'] = {'media': 'alias-lab-still', 'text': 'short'}; wj(os.path.join(w, 'activities', 'activities.json'), r_)
refused('no fallback text', nofb, 'fallback.text')
def badgrade(w):
    c = rj(os.path.join(w, 'chapters', 'ch01.json')); c['exercises'][-1]['grade'] = {'mode': 'checks'}; wj(os.path.join(w, 'chapters', 'ch01.json'), c)
refused('checks grading (P2)', badgrade, 'arrives with sim-spec@1')
def noacts(w):
    shutil.rmtree(os.path.join(w, 'activities'))
refused('a block without activities/', noacts, "activity 'alias-lab' is not in pack.activities")
print(f'\nactivities_pack: {ok} checks passed')
