#!/usr/bin/env python3
"""Interactive activities travel inside the pack (html-app@1 alias-lab, sim-spec@1 rc-lowpass, the circuits, py-module@1 py-filter with its main.py) (docs/INTERACTIVE.md, docs/adr/001 D2): a subject folder with activities/ →
make_pack.py → pack.activities (bundle inline, sha256, strings per locale) + pack.requires → unpack.py gives the folder back →
make_pack.py again gives the same pack.version. And what make_pack.py refuses (missing strings, a network link, an unknown
activity, a runtime of a later version). Uses the skill zip (dist/noema-pack-builder.zip; built here when missing).
With $NOEMA_ACT_PACK set it also writes the built pack there (tests/activities_app.js imports it)."""
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
RC = os.path.join(ROOT, 'tools', 'activities_examples', 'rc-lowpass')   # sim-spec@1: a spec (data), no code
rd_ = os.path.join(sd, 'activities', 'rc-lowpass'); os.makedirs(rd_)
for f in os.listdir(RC):
    if f.startswith('strings.') or f == 'spec.json': shutil.copy(os.path.join(RC, f), rd_)
CIRC = {'rc-transient': 'A 5 V square wave and the voltage of the capacitor of an RC circuit: it rises to 63 % of the step after one time constant RC = 1 ms.',
        'led-bench': 'A 5 V supply, a switch SW1, a 330 Ω resistor R1 and a red LED D1 in series, with the test points TP1, TP2, TP3 and GND.'}
for cid in CIRC:   # circuit-mna@1: a netlist in the spec; led-bench is a fault-finding bench
    cs, cd = os.path.join(ROOT, 'tools', 'activities_examples', cid), os.path.join(sd, 'activities', cid); os.makedirs(cd)
    for f in os.listdir(cs):
        if f.startswith('strings.') or f == 'spec.json': shutil.copy(os.path.join(cs, f), cd)
PF = os.path.join(ROOT, 'tools', 'activities_examples', 'py-filter')   # py-module@1: Python (main.py) + the spec the app draws
pd_ = os.path.join(sd, 'activities', 'py-filter'); os.makedirs(pd_)
for f in os.listdir(PF):
    if f.startswith('strings.') or f in ('spec.json', 'main.py'): shutil.copy(os.path.join(PF, f), pd_)
wj(os.path.join(sd, 'activities', 'activities.json'), {'format': 'noema.activities/v1', 'items': [rj(os.path.join(EX, 'activity.json')), rj(os.path.join(RC, 'activity.json'))]
   + [rj(os.path.join(ROOT, 'tools', 'activities_examples', cid, 'activity.json')) for cid in CIRC] + [rj(os.path.join(PF, 'activity.json'))]})
shutil.copy(os.path.join(EX, 'fallback.svg'), os.path.join(sd, 'media', 'alias-lab-still.svg'))
shutil.copy(os.path.join(RC, 'fallback.svg'), os.path.join(sd, 'media', 'rc-lowpass-still.svg'))
mm = rj(os.path.join(sd, 'media', 'media.json'))
mm['items'].append({'id': 'alias-lab-still', 'file': 'alias-lab-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'A 7 Hz sine (grey) sampled at 10 Hz (blue dots); the dots lie on a 3 Hz sine (red, dashed).'})
mm['items'].append({'id': 'rc-lowpass-still', 'file': 'rc-lowpass-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'The gain of an RC low-pass filter against frequency on a log scale: flat at 0 dB, −3 dB at about 1 kHz, then falling.'})
shutil.copy(os.path.join(PF, 'fallback.svg'), os.path.join(sd, 'media', 'py-filter-still.svg'))
mm['items'].append({'id': 'py-filter-still', 'file': 'py-filter-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'The gain of an 8-sample moving-average filter at 8 kHz against frequency on a log scale: near 0 dB at low frequencies, a deep notch at 1 kHz.'})
for cid, alt in CIRC.items():
    shutil.copy(os.path.join(ROOT, 'tools', 'activities_examples', cid, 'fallback.svg'), os.path.join(sd, 'media', cid + '-still.svg'))
    mm['items'].append({'id': cid + '-still', 'file': cid + '-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite', 'alt': alt})
wj(os.path.join(sd, 'media', 'media.json'), mm)
BLOCK = {'t': 'interactive', 'activity': 'alias-lab', 'caption': 'Sampling and aliasing: move the sliders.'}
SIM = {'id': 'ch01-e900', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['concept'], 'think': 'apply', 'activity': 'alias-lab',
       'q': 'A 7 Hz signal is sampled. Find a sampling rate at which the samples look like a 3 Hz wave.',
       'task': {'seed': 'auto', 'params': {'f': 7, 'target': 3}}, 'grade': {'mode': 'reported'},
       'hints': ['The samples cannot tell f apart from f − n·fs.', 'Try a rate between 7 and 14 Hz.'],
       'reveal': 'At 10 Hz, 7 − 10 = −3: the samples are those of a 3 Hz wave (mirrored).', 'explain': 'Aliasing: |f − n·fs| with the nearest whole n.'}
BLOCK2 = {'t': 'interactive', 'activity': 'rc-lowpass', 'caption': 'An RC low-pass filter: move R and C.'}
SIM2 = {'id': 'ch01-e901', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'rc-lowpass',
        'q': 'An RC low-pass filter has C = 100 nF. Choose R so that its cutoff frequency is within 5 % of 1 kHz.',
        'task': {'seed': 'auto', 'params': {'target': 1000, 'tol': 0.05}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'err <= tol', 'label': 'checkFc', 'weight': 3}, {'expr': 'abs(C / 1e-7 - 1) < 0.001', 'label': 'checkC'}]},
        'hints': ['fc = 1/(2πRC): with C fixed, a larger R gives a lower fc.', 'Solve the formula for R: R = 1/(2π · fc · C).'],
        'reveal': 'R ≈ 1.6 kΩ: 1/(2π · 1.6 kΩ · 100 nF) ≈ 995 Hz, within 5 % of 1 kHz.',
        'explain': 'The cutoff frequency is where the gain is 3 dB down: fc = 1/(2πRC). Halving R doubles fc; changing C instead would also move fc, but the task fixes C.'}
BLOCK3 = {'t': 'interactive', 'activity': 'rc-transient', 'caption': 'An RC circuit charging from a square wave: move R and C.'}
SIM3 = {'id': 'ch01-e902', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'rc-transient',
        'q': 'A 5 V step charges a capacitor through a resistor. Choose R and C so that the capacitor reaches 63 % of the step (within 3 points) 1 ms after the step.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'abs(vAt / Vs - frac) <= tol', 'label': 'checkPct'}]},
        'hints': ['After one time constant τ = RC the capacitor has covered 1 − 1/e ≈ 63 % of the step.', 'So you need R · C = 1 ms, for example 1 kΩ and 1 µF.'],
        'reveal': 'Any R and C with R · C ≈ 1 ms: 1 kΩ with 1 µF, or 2 kΩ with 500 nF, give 3.16 V (63 %) at 1 ms.',
        'explain': 'The capacitor voltage follows 1 − e^(−t/RC): at t = RC it is 1 − e^(−1) ≈ 63 % of the step. Only the product RC sets the speed of the curve.'}
BLOCK4 = {'t': 'interactive', 'activity': 'led-bench', 'caption': 'A fault-finding bench: the LED stays dark.'}
SIM4 = {'id': 'ch01-e903', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 3, 'tags': ['debug'], 'think': 'analyze', 'activity': 'led-bench',
        'q': 'A 5 V supply, a switch, a 330 Ω resistor and a red LED are in series; the switch is closed but the LED stays dark. Find the faulty part with as few measurements as you can.',
        'task': {'seed': 7, 'params': {'fault': 'ledReversed'}},
        'grade': {'mode': 'checks', 'pass': 0.75, 'checks': [{'expr': 'correct', 'label': 'checkDx', 'weight': 3}, {'expr': 'measurements <= 6', 'label': 'checkEff'}]},
        'hints': ['Measure from the supply towards the LED: each voltage to GND clears or blames the part before it.', 'With no current, the voltage on both sides of a healthy part is the same: compare the two legs of the LED.'],
        'reveal': 'The LED is soldered the wrong way round: TP3 is at 5 V and so is the cathode leg, while the anode leg reads 0 V.',
        'explain': 'With no current through the series circuit, every healthy part passes the full 5 V on: the voltage is lost only across the open or blocking part. A reversed LED blocks like an open one, but its legs are swapped, so the 5 V appears on the cathode leg.'}
BLOCK5 = {'t': 'interactive', 'activity': 'py-filter', 'caption': 'Two digital low-pass filters computed in Python: change the window and the cutoff.'}
SIM5 = {'id': 'ch01-e904', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'py-filter',
        'q': 'A signal is sampled at 8 kHz. Choose a moving-average filter that removes a 1 kHz tone (at least 20 dB down) while 300 Hz loses less than 3 dB.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'att1k <= -20', 'label': 'checkTone', 'weight': 2}, {'expr': 'pass300 >= -3', 'label': 'checkPass'}]},
        'hints': ['A moving average of N samples has zeros at every multiple of fs/N.', 'Put the first zero on the tone: fs/N = 1 kHz.'],
        'reveal': 'N = 8: fs/N = 8000/8 = 1 kHz, so the tone falls on the first zero, and 300 Hz loses only about 1.3 dB.',
        'explain': 'The mean of N samples cancels any sine whose period fits N samples a whole number of times: its zeros are at k·fs/N. A longer window removes the tone too (N = 16 also has a zero at 1 kHz) but its gain falls sooner, so 300 Hz loses about 6 dB.'}
def put(ch):
    c = rj(ch); c['sections'][0]['blocks'] += [dict(BLOCK), dict(BLOCK2), dict(BLOCK3), dict(BLOCK4), dict(BLOCK5)]; c['exercises'] += [json.loads(json.dumps(x)) for x in (SIM, SIM2, SIM3, SIM4, SIM5)]; wj(ch, c)
put(os.path.join(sd, 'chapters', 'ch01.json')); put(os.path.join(sd, 'translations', 'fr', 'ch01.json'))
mk = lambda src, out: run(os.path.join(S, 'make_pack.py'), src, os.path.join(T, out))
pk = lambda out: zipfile.ZipFile(os.path.join(T, out, 'demo-physics.noema.zip'))

r = mk(sd, 'o1'); check(r.returncode == 0, 'make_pack.py builds a pack with an activity', r.stdout + r.stderr)
p = json.loads(pk('o1').read('pack.json'))
a = (p.get('activities') or {}).get('items', [{}])[0]
b = next((x for x in p['activities']['items'] if x.get('id') == 'rc-lowpass'), {})
import hashlib
html = open(os.path.join(EX, 'app.html'), encoding='utf-8').read()
check(p['activities']['format'] == 'noema.activities/v1' and a.get('html') == html, 'the bundle is inline in the pack, as written')
check(a.get('sha256') == hashlib.sha256(html.encode()).hexdigest() and a.get('bytes') == len(html.encode()), 'sha256 and bytes name the bundle')
check(sorted(a.get('strings') or {}) == ['el', 'en', 'fr', 'ru'] and a['strings']['el']['signal'] == 'Σήμα', 'the strings of every locale are in the pack')
check(sorted(p.get('requires') or []) == ['activities/v1', 'engine:circuit-mna@1', 'runtime:html-app@1', 'runtime:py-module@1', 'runtime:sim-spec@1'], 'pack.requires names the core, the three runtimes and the circuit engine', str(p.get('requires')))
pyf = next((x for x in p['activities']['items'] if x.get('id') == 'py-filter'), {})
pysrc = open(os.path.join(PF, 'main.py'), encoding='utf-8', newline='').read()
check(pyf.get('python') == pysrc and pyf.get('sha256') == hashlib.sha256(pysrc.encode()).hexdigest() and pyf.get('bytes') == len(pysrc.encode()) and pyf.get('spec') == rj(os.path.join(PF, 'spec.json')) and pyf.get('packages') == ['numpy'] and sorted(pyf.get('strings') or {}) == ['el', 'en', 'fr', 'ru'],
      'py-module@1: main.py is inline in the pack (python, with sha256 and bytes), its spec and packages beside it', str({k: v for k, v in pyf.items() if k != 'python'})[:400])
check(p['counts'].get('activities') == 5 and 'alias-lab-still' in p['media'] and 'rc-lowpass-still' in p['media'], 'counts.activities; the fallback pictures are pack pictures (and need no exercises)')
check(b.get('spec') == rj(os.path.join(RC, 'spec.json')) and 'html' not in b and sorted(b.get('strings') or {}) == ['el', 'en', 'fr', 'ru'], 'sim-spec@1: the spec is inline in the pack (data, no bundle), with its strings')
lb = next((x for x in p['activities']['items'] if x.get('id') == 'led-bench'), {})
check(lb.get('spec') == rj(os.path.join(ROOT, 'tools', 'activities_examples', 'led-bench', 'spec.json')) and lb['spec']['bench']['diagnosis']['options'][6]['fault'] == 'ledReversed', 'circuit-mna@1: the bench spec is inline, its faults and diagnosis with it')
if os.environ.get('NOEMA_ACT_PACK'):   # run_e2e.sh: tests/activities_app.js imports this pack into the app
    shutil.copy(os.path.join(sd, 'build', 'demo-physics.json'), os.environ['NOEMA_ACT_PACK'])

# the round trip
w2 = os.path.join(T, 'w2'); r = run(os.path.join(S, 'unpack.py'), os.path.join(T, 'o1', 'demo-physics.noema.zip'), w2)
u = os.path.join(w2, 'demo-physics')
check(r.returncode == 0 and '5 activities' in r.stdout, 'unpack.py gives the activities back', r.stdout + r.stderr)
check(open(os.path.join(u, 'activities', 'alias-lab', 'app.html'), encoding='utf-8', newline='').read() == html, 'app.html comes back byte for byte')
check(rj(os.path.join(u, 'activities', 'alias-lab', 'strings.ru.json')) == rj(os.path.join(EX, 'strings.ru.json')), 'the string tables come back')
check(rj(os.path.join(u, 'activities', 'rc-lowpass', 'spec.json')) == rj(os.path.join(RC, 'spec.json')), 'spec.json comes back')
reg = rj(os.path.join(u, 'activities', 'activities.json'))
check(reg['items'][0].get('entry') == 'activities/alias-lab/app.html' and 'html' not in reg['items'][0], 'activities.json names the entry file (no bundle inside)')
check(reg['items'][1].get('entry') == 'activities/rc-lowpass/spec.json' and 'spec' not in reg['items'][1], 'activities.json names spec.json (no spec inside)')
check(rj(os.path.join(u, 'activities', 'led-bench', 'spec.json')) == rj(os.path.join(ROOT, 'tools', 'activities_examples', 'led-bench', 'spec.json')) and rj(os.path.join(u, 'activities', 'rc-transient', 'strings.el.json')) == rj(os.path.join(ROOT, 'tools', 'activities_examples', 'rc-transient', 'strings.el.json')), 'the circuit specs and their strings come back')
check(open(os.path.join(u, 'activities', 'py-filter', 'main.py'), encoding='utf-8', newline='').read() == pysrc and rj(os.path.join(u, 'activities', 'py-filter', 'spec.json')) == rj(os.path.join(PF, 'spec.json')), 'main.py comes back byte for byte, with its spec.json')
pr = next(x for x in reg['items'] if x['id'] == 'py-filter')
check(pr.get('entry') == 'activities/py-filter/main.py' and 'python' not in pr and 'spec' not in pr and pr.get('packages') == ['numpy'], 'activities.json names main.py as the entry (no source, no spec inside), the packages stay', str(pr))
r = mk(u, 'o2'); check(r.returncode == 0, 'the unpacked folder builds again', r.stdout + r.stderr)
p2 = json.loads(pk('o2').read('pack.json'))
check(p2['activities'] == p['activities'] and p2['version'] == p['version'], 'same activities, same pack.version after the round trip')

# a changed spec → a new version; a changed bundle → a new version
sp = rj(os.path.join(u, 'activities', 'rc-lowpass', 'spec.json')); sp['params'][0]['default'] = 4600; wj(os.path.join(u, 'activities', 'rc-lowpass', 'spec.json'), sp)
r = mk(u, 'o2b'); check(r.returncode == 0 and json.loads(pk('o2b').read('pack.json'))['version'] != p['version'], 'a changed spec changes pack.version', r.stdout + r.stderr)
open(os.path.join(u, 'activities', 'alias-lab', 'app.html'), 'a', encoding='utf-8').write('\n<!-- v2 -->\n')
r = mk(u, 'o3'); p3 = json.loads(pk('o3').read('pack.json'))
check(r.returncode == 0 and p3['version'] != p['version'], 'a changed bundle changes pack.version')
open(os.path.join(u, 'activities', 'py-filter', 'main.py'), 'a', encoding='utf-8').write('\n# v2\n')
r = mk(u, 'o3b'); check(r.returncode == 0 and json.loads(pk('o3b').read('pack.json'))['version'] != p3['version'], 'a changed main.py changes pack.version', r.stdout + r.stderr)

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
    r_ = rj(os.path.join(w, 'activities', 'activities.json')); r_['items'][0]['runtime'] = 'h5p@1'; wj(os.path.join(w, 'activities', 'activities.json'), r_)
refused('later runtime', later, 'arrives in a later version')
def py_of(w, f):
    q = os.path.join(w, 'activities', 'activities.json'); r_ = rj(q); f(next(x for x in r_['items'] if x['id'] == 'py-filter')); wj(q, r_)
refused('a Python package not on the allow-list', lambda w: py_of(w, lambda x: x.update(packages=['numpy', 'pandas'])), "package 'pandas' is not available")
refused('an extra package without requiresNetwork', lambda w: py_of(w, lambda x: x.update(packages=['numpy', 'quantiphy'])), 'set "requiresNetwork": true')
refused('Python that imports what it does not declare', lambda w: open(os.path.join(w, 'activities', 'py-filter', 'main.py'), 'a', encoding='utf-8').write('\nimport scipy.signal\n'), 'imports scipy: list it in "packages"')
refused('Python that reaches for the network', lambda w: open(os.path.join(w, 'activities', 'py-filter', 'main.py'), 'a', encoding='utf-8').write('\nfrom pyodide.http import pyfetch\n'), 'a Python activity has no network')
refused('a Python activity without main.py', lambda w: os.remove(os.path.join(w, 'activities', 'py-filter', 'main.py')), "entry 'activities/py-filter/main.py' not found")
refused('a Python spec that names an engine', lambda w: wj(os.path.join(w, 'activities', 'py-filter', 'spec.json'), {**rj(os.path.join(PF, 'spec.json')), 'engine': 'formula@1'}), 'leave engine out')
def nofb(w):
    r_ = rj(os.path.join(w, 'activities', 'activities.json')); r_['items'][0]['fallback'] = {'media': 'alias-lab-still', 'text': 'short'}; wj(os.path.join(w, 'activities', 'activities.json'), r_)
refused('no fallback text', nofb, 'fallback.text')
def ex_of(w, eid, f):
    c = rj(os.path.join(w, 'chapters', 'ch01.json')); f(next(e for e in c['exercises'] if e['id'] == eid)); wj(os.path.join(w, 'chapters', 'ch01.json'), c)
def spec_of(w, f):
    q = os.path.join(w, 'activities', 'rc-lowpass', 'spec.json'); s_ = rj(q); f(s_); wj(q, s_)
refused('checks grading on an html-app', lambda w: ex_of(w, 'ch01-e900', lambda e: e.update(grade={'mode': 'checks', 'checks': [{'expr': 'fs == 10'}]})), 'needs an activity whose values the app can see')
refused('a sim-spec graded "reported"', lambda w: ex_of(w, 'ch01-e901', lambda e: e.update(grade={'mode': 'reported'})), 'reports nothing itself')
refused('a check with an unknown name', lambda w: ex_of(w, 'ch01-e901', lambda e: e['grade']['checks'].append({'expr': 'fcut < 2'})), "unknown variable 'fcut'")
refused('a task param that is not a const', lambda w: ex_of(w, 'ch01-e901', lambda e: e['task']['params'].update(R=1000)), 'not a constant of the spec')
refused('a bad formula in the spec', lambda w: spec_of(w, lambda s_: s_['derived'].append({'id': 'bad', 'expr': 'R * L'})), "unknown variable 'L'")
refused('a formula that is not the language', lambda w: spec_of(w, lambda s_: s_['readouts'].append({'label': 'fcLabel', 'expr': 'Math.sqrt(R)'})), 'spec.readouts[3].expr')
refused('an unknown engine', lambda w: spec_of(w, lambda s_: s_.update(engine='warp@9')), "unknown engine 'warp@9'")
refused('a label missing from a string table', lambda w: spec_of(w, lambda s_: s_['params'][0].update(label='nope')), 'the string nope is missing')
refused('too many points', lambda w: spec_of(w, lambda s_: s_['plots'][0].update(points=5000)), 'points is a whole number 2–2000')
def bench_of(w, f):
    q = os.path.join(w, 'activities', 'led-bench', 'spec.json'); s_ = rj(q); f(s_); wj(q, s_)
refused('a fault the bench does not declare', lambda w: ex_of(w, 'ch01-e903', lambda e: e['task']['params'].update(fault='ledShort')), 'task.params.fault must be the id of a fault')
refused('a binding to a part not in the netlist', lambda w: bench_of(w, lambda s_: s_['model']['bindings'][0].update(element='SW9')), 'bindings[0].element is not a part of the netlist')
refused('a probe point not in the netlist', lambda w: bench_of(w, lambda s_: s_['bench']['points'][0].update(at='TP9')), 'points[0].at must be a node')
refused('a diagnosis label missing from a string table', lambda w: os.remove(os.path.join(w, 'activities', 'led-bench', 'strings.ru.json')) or wj(os.path.join(w, 'activities', 'led-bench', 'strings.ru.json'), {k: v for k, v in rj(os.path.join(ROOT, 'tools', 'activities_examples', 'led-bench', 'strings.ru.json')).items() if k != 'dxTrace'}), 'dxTrace')
refused('a bench name in a readout', lambda w: bench_of(w, lambda s_: s_.setdefault('readouts', []).append({'label': 'checkDx', 'expr': 'diagnosis'})), "'diagnosis'")
def noacts(w):
    shutil.rmtree(os.path.join(w, 'activities'))
refused('a block without activities/', noacts, "activity 'alias-lab' is not in pack.activities")
print(f'\nactivities_pack: {ok} checks passed')
