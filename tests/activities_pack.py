#!/usr/bin/env python3
"""Interactive activities travel inside the pack (html-app@1 alias-lab, sim-spec@1 rc-lowpass, the circuits and P6 engine references, py-module@1 py-filter with its main.py, h5p@1 planets-quiz with its .h5p beside the pack, wasm-module@1 wasm-oscillator;
external-embed@1 in a copy of its own) (docs/INTERACTIVE.md, docs/adr/001 D2): a subject folder with activities/ →
make_pack.py → pack.activities (bundle inline, sha256, strings per locale) + pack.requires → unpack.py gives the folder back →
make_pack.py again gives the same pack.version. And what make_pack.py refuses (missing strings, a network link, an unknown
activity, a runtime this version does not know). Uses the skill zip (dist/noema-pack-builder.zip; built here when missing).
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
CIRC.update({   # the P6 engines (docs/INTERACTIVE_ENGINES.md): thermal@1, pid@1, rf@1, twin@1
    'heatsink': 'The junction and heatsink temperatures of a 20 W MOSFET warming up after switch-on with a 3.5 K/W heatsink: the junction levels off at 124 °C, under the 125 °C limit.',
    'pid-tune': 'Step responses of a lightly damped plant: P control alone overshoots by half and stops at 0.5; PID with Kp 2, Ki 3, Kd 0.4 reaches 1 without overshoot in about 1.5 s.',
    'lora-link': 'The margin of a LoRa link against distance on a log scale: SF7 with a chip antenna falls below 10 dB well before 2 km; SF9 with a 5 dBi antenna keeps 11.9 dB at 2 km.',
    'sensor-node': 'The charge of a 600 mAh cell over 30 days: waking every 60 s it falls steeply, waking every 15 minutes it hardly moves.'})
P6 = ['heatsink', 'pid-tune', 'lora-link', 'sensor-node']
for cid in CIRC:   # circuit-mna@1: a netlist in the spec; led-bench is a fault-finding bench (and the P6 references)
    cs, cd = os.path.join(ROOT, 'tools', 'activities_examples', cid), os.path.join(sd, 'activities', cid); os.makedirs(cd)
    for f in os.listdir(cs):
        if f.startswith('strings.') or f == 'spec.json': shutil.copy(os.path.join(cs, f), cd)
WO = os.path.join(ROOT, 'tools', 'activities_examples', 'wasm-oscillator')   # wasm-module@1 (P6): a precompiled module + its own spec
wd_ = os.path.join(sd, 'activities', 'wasm-oscillator'); os.makedirs(wd_)
for f in os.listdir(WO):
    if f.startswith('strings.') or f in ('spec.json', 'module.wasm'): shutil.copy(os.path.join(WO, f), wd_)
PF = os.path.join(ROOT, 'tools', 'activities_examples', 'py-filter')   # py-module@1: Python (main.py) + the spec the app draws
pd_ = os.path.join(sd, 'activities', 'py-filter'); os.makedirs(pd_)
for f in os.listdir(PF):
    if f.startswith('strings.') or f in ('spec.json', 'main.py'): shutil.copy(os.path.join(PF, f), pd_)
PQ = os.path.join(ROOT, 'tools', 'activities_examples', 'planets-quiz')   # h5p@1: an ordinary .h5p package, beside the pack
pqd = os.path.join(sd, 'activities', 'planets-quiz'); os.makedirs(pqd); shutil.copy(os.path.join(PQ, 'item.h5p'), pqd)
PQ_FR = rj(os.path.join(PQ, 'content.el.json')); PQ_FR.update(question='<p>Quelle est la plus grande planète du Système solaire ?</p>\n')   # (the pack is read in fr: its words in fr)
for x_, t_ in zip(PQ_FR['answers'], ('Jupiter', 'Mars', 'Vénus')): x_['text'] = f'<div>{t_}</div>\n'
wj(os.path.join(pqd, 'content.fr.json'), PQ_FR)
wj(os.path.join(sd, 'activities', 'activities.json'), {'format': 'noema.activities/v1', 'items': [rj(os.path.join(EX, 'activity.json')), rj(os.path.join(RC, 'activity.json'))]
   + [rj(os.path.join(ROOT, 'tools', 'activities_examples', cid, 'activity.json')) for cid in CIRC] + [rj(os.path.join(WO, 'activity.json'))] + [rj(os.path.join(PF, 'activity.json')), rj(os.path.join(PQ, 'activity.json'))]})
shutil.copy(os.path.join(PQ, 'fallback.svg'), os.path.join(sd, 'media', 'planets-quiz-still.svg'))
shutil.copy(os.path.join(EX, 'fallback.svg'), os.path.join(sd, 'media', 'alias-lab-still.svg'))
shutil.copy(os.path.join(RC, 'fallback.svg'), os.path.join(sd, 'media', 'rc-lowpass-still.svg'))
mm = rj(os.path.join(sd, 'media', 'media.json'))
mm['items'].append({'id': 'alias-lab-still', 'file': 'alias-lab-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'A 7 Hz sine (grey) sampled at 10 Hz (blue dots); the dots lie on a 3 Hz sine (red, dashed).'})
mm['items'].append({'id': 'rc-lowpass-still', 'file': 'rc-lowpass-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'The gain of an RC low-pass filter against frequency on a log scale: flat at 0 dB, −3 dB at about 1 kHz, then falling.'})
CIRC['wasm-oscillator'] = 'A damped mass on a spring: the displacement against time, a slowly dying swing (c = 0.2) and a quickly dying one (c = 1.6).'
shutil.copy(os.path.join(PF, 'fallback.svg'), os.path.join(sd, 'media', 'py-filter-still.svg'))
mm['items'].append({'id': 'py-filter-still', 'file': 'py-filter-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'The gain of an 8-sample moving-average filter at 8 kHz against frequency on a log scale: near 0 dB at low frequencies, a deep notch at 1 kHz.'})
for cid, alt in CIRC.items():
    shutil.copy(os.path.join(ROOT, 'tools', 'activities_examples', cid, 'fallback.svg'), os.path.join(sd, 'media', cid + '-still.svg'))
    mm['items'].append({'id': cid + '-still', 'file': cid + '-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite', 'alt': alt})
mm['items'].append({'id': 'planets-quiz-still', 'file': 'planets-quiz-still.svg', 'origin': 'plot', 'license': 'own', 'credit': 'noema-lite',
                    'alt': 'Jupiter drawn much larger than the Earth, Mars and Venus, which are drawn to the same scale beside it.'})
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
SIM5 = {'id': 'ch01-e904', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'heatsink',
        'q': 'A MOSFET dissipates 20 W at 40 °C ambient; junction to case is 0.5 K/W and the thermal pad 0.2 K/W. Choose the heatsink (its resistance to air, Rsa) so that the junction stays at or below 125 °C, without a heatsink bigger than needed (Rsa at least 3 K/W).',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'tjSS <= TjMax', 'label': 'checkTj', 'weight': 2}, {'expr': 'Rsa >= RsaMin', 'label': 'checkCheap'}]},
        'hints': ['In the steady state the thermal resistances add up like resistors in series: Tj = Tamb + P · (Rjc + Rcs + Rsa).', 'The junction may rise 85 K above the air, so the whole path may have at most 85 K / 20 W = 4.25 K/W.'],
        'reveal': 'Rsa = 3.5 K/W: Tj = 40 + 20 · (0.5 + 0.2 + 3.5) = 124 °C. Anything from 3 to 3.55 K/W passes both checks.',
        'explain': 'Heat flows through the junction-to-case, the pad and the heatsink-to-air resistances one after the other, so their sum times the power is the temperature rise above the air. The heat capacities only set how fast the steady state is reached (here a few minutes), not where it ends.'}
SIM6 = {'id': 'ch01-e905', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 3, 'tags': ['concept'], 'think': 'apply', 'activity': 'pid-tune',
        'q': 'A lightly damped plant with a short dead time must follow a step of its setpoint. Tune Kp, Ki and Kd so that the overshoot is below 10 %, the output settles within 2 % in less than 2 s and no steady-state error is left.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'os < osMax', 'label': 'checkOs'}, {'expr': 'ts < tsMax', 'label': 'checkTs'}, {'expr': 'abs(ess) < essMax', 'label': 'checkEss'}]},
        'hints': ['Proportional control alone always leaves an error; the integral term removes it.', 'The derivative term damps the ringing: raise Kd until the overshoot falls, then add integral gain slowly.'],
        'reveal': 'For example Kp = 2, Ki = 3, Kd = 0.4: no overshoot and settled in about 1.5 s.',
        'explain': 'Kp sets how hard the controller pushes against the error, Ki keeps pushing until the error is gone (but too much of it causes overshoot), and Kd reacts to how fast the output moves, which damps the oscillation of a lightly damped plant.'}
SIM7 = {'id': 'ch01-e906', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'lora-link',
        'q': 'A LoRa sensor 2 km from its gateway sends 20-byte packets at 868 MHz with 14 dBm through suburban clutter. Pick the spreading factor and the sensor antenna so that the link keeps at least 10 dB of margin while one packet is on air for at most 0.5 s.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'margin >= marginMin', 'label': 'checkMargin', 'weight': 2}, {'expr': 'air <= airMax', 'label': 'checkAir'}]},
        'hints': ['Each step up in SF buys about 2.5 dB of sensitivity but doubles the time on air.', 'Antenna gain adds to the margin without costing airtime.'],
        'reveal': 'SF9 with the 5 dBi antenna gives 11.9 dB of margin with 185 ms on air; SF10 with the dipole (11.5 dB, 371 ms) works too.',
        'explain': 'The margin is the received power minus the receiver sensitivity. A higher spreading factor lowers the sensitivity (the receiver can decode below the noise) at the price of a slower, longer packet, so the cheapest decibels come from the antenna.'}
SIM8 = {'id': 'ch01-e907', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'sensor-node',
        'q': 'A LoRa temperature sensor on a 600 mAh cell wakes up, measures, sends a packet and waits for its acknowledgement, then sleeps. Choose the wake period so that the battery lasts at least a year and the server still gets at least 24 readings a day.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'life / 86400 >= daysMin', 'label': 'checkLife', 'weight': 2}, {'expr': 'perDay >= perDayMin', 'label': 'checkRate'}]},
        'hints': ['Most of the charge goes into the wake-ups (sending, waiting for the acknowledgement), so fewer wake-ups means a longer life.', '24 readings a day means a period of at most 3600 s.'],
        'reveal': 'Any period from about 390 s to 3600 s: every 15 minutes the cell lasts about 600 days with 96 readings a day.',
        'explain': 'The average current is the charge of one wake-up divided by the period, plus the sleep current and the self-discharge; the life is the capacity divided by it. Lengthening the period helps until the sleep current and the self-discharge dominate.'}
BLOCK5 = {'t': 'interactive', 'activity': 'wasm-oscillator', 'caption': 'A damped oscillator computed by a WebAssembly module: move k, c and x₀.'}
SIM9 = {'id': 'ch01-e908', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'wasm-oscillator',
        'q': 'A 1 kg mass on a spring with k = 4 N/m is pulled 1 m aside and let go. Choose the damping c so that at most 5 % of its starting energy is left after 2.5 s.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'E <= share * E0', 'label': 'checkLeft', 'weight': 3}, {'expr': 'abs(k - 4) < 0.01', 'label': 'checkK'}]},
        'hints': ['The damping force −c·v turns the energy into heat; the spring only trades it between motion and stretch.', 'The energy falls roughly like e^(−c·t): you need e^(−2.5·c) ≤ 0.05, so c of about 1.2 or more.'],
        'reveal': 'c = 1.6 N·s/m leaves about 2 % of the energy after 2.5 s (c = 1 still leaves about 8 %).',
        'explain': 'For light damping the energy of a damped oscillator falls about like e^(−c·t/m): with m = 1 kg, 5 % after 2.5 s needs c ≥ ln(20)/2.5 ≈ 1.2 N·s/m. The spring constant changes how fast it swings, not how fast the energy goes.'}
BLOCK_PY = {'t': 'interactive', 'activity': 'py-filter', 'caption': 'Two digital low-pass filters computed in Python: change the window and the cutoff.'}
SIM_PY = {'id': 'ch01-e911', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 2, 'tags': ['calc'], 'think': 'apply', 'activity': 'py-filter',
        'q': 'A signal is sampled at 8 kHz. Choose a moving-average filter that removes a 1 kHz tone (at least 20 dB down) while 300 Hz loses less than 3 dB.',
        'task': {'seed': 'auto', 'params': {}},
        'grade': {'mode': 'checks', 'checks': [{'expr': 'att1k <= -20', 'label': 'checkTone', 'weight': 2}, {'expr': 'pass300 >= -3', 'label': 'checkPass'}]},
        'hints': ['A moving average of N samples has zeros at every multiple of fs/N.', 'Put the first zero on the tone: fs/N = 1 kHz.'],
        'reveal': 'N = 8: fs/N = 8000/8 = 1 kHz, so the tone falls on the first zero, and 300 Hz loses only about 1.3 dB.',
        'explain': 'The mean of N samples cancels any sine whose period fits N samples a whole number of times: its zeros are at k·fs/N. A longer window removes the tone too (N = 16 also has a zero at 1 kHz) but its gain falls sooner, so 300 Hz loses about 6 dB.'}
BLOCK_H5 = {'t': 'interactive', 'activity': 'planets-quiz', 'caption': 'An H5P quiz: the largest planet.'}
SIM_H5 = {'id': 'ch01-e910', 'type': 'sim', 'section': 'ch01-s01', 'difficulty': 1, 'tags': ['concept'], 'think': 'remember', 'activity': 'planets-quiz',
        'q': 'Which planet of the Solar System is the largest? Choose it in the quiz and press Check.', 'grade': {'mode': 'reported'},
        'reveal': 'Jupiter: about 11 times as wide as the Earth.', 'explain': 'Mars and Venus are both smaller than the Earth; Jupiter is the largest of all the planets.'}
def put(ch):
    c = rj(ch); c['sections'][0]['blocks'] += [dict(BLOCK), dict(BLOCK2), dict(BLOCK3), dict(BLOCK4), dict(BLOCK5)] + [{'t': 'interactive', 'activity': a} for a in P6] + [dict(BLOCK_PY), dict(BLOCK_H5)]; c['exercises'] += [json.loads(json.dumps(x)) for x in (SIM, SIM2, SIM3, SIM4, SIM5, SIM6, SIM7, SIM8, SIM9, SIM_PY, SIM_H5)]; wj(ch, c)
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
check(sorted(p.get('requires') or []) == ['activities/v1', 'engine:circuit-mna@1', 'engine:pid@1', 'engine:rf@1', 'engine:thermal@1', 'engine:twin@1', 'engine:wasm@1', 'runtime:h5p@1', 'runtime:html-app@1', 'runtime:py-module@1', 'runtime:sim-spec@1', 'runtime:wasm-module@1'], 'pack.requires names the core, the six runtimes, the circuit engine, the four P6 engines and wasm@1', str(p.get('requires')))
check(p['counts'].get('activities') == 11 and 'alias-lab-still' in p['media'] and 'rc-lowpass-still' in p['media'], 'counts.activities; the fallback pictures are pack pictures (and need no exercises)')
check(b.get('spec') == rj(os.path.join(RC, 'spec.json')) and 'html' not in b and sorted(b.get('strings') or {}) == ['de', 'el', 'en', 'fr', 'ru'], 'sim-spec@1: the spec is inline in the pack (data, no bundle), with its strings')
lb = next((x for x in p['activities']['items'] if x.get('id') == 'led-bench'), {})
check(lb.get('spec') == rj(os.path.join(ROOT, 'tools', 'activities_examples', 'led-bench', 'spec.json')) and lb['spec']['bench']['diagnosis']['options'][6]['fault'] == 'ledReversed', 'circuit-mna@1: the bench spec is inline, its faults and diagnosis with it')
check(all(next((x for x in p['activities']['items'] if x.get('id') == a), {}).get('spec') == rj(os.path.join(ROOT, 'tools', 'activities_examples', a, 'spec.json')) for a in P6), 'thermal@1, pid@1, rf@1, twin@1: the specs of heatsink, pid-tune, lora-link and sensor-node are inline')
wo = next((x for x in p['activities']['items'] if x.get('id') == 'wasm-oscillator'), {})
wbytes = open(os.path.join(WO, 'module.wasm'), 'rb').read()
import base64
check(base64.b64decode(wo.get('wasm') or '') == wbytes and wo.get('sha256') == hashlib.sha256(wbytes).hexdigest() and wo.get('bytes') == len(wbytes) and wo.get('abi') == {'version': 1, 'scratch': 1024, 'maxPages': 16}
      and wo.get('spec') == rj(os.path.join(WO, 'spec.json')) and sorted(wo.get('strings') or {}) == ['el', 'en', 'fr', 'ru'], 'wasm-module@1: the module is inline (base64, sha256, bytes), with its abi, its own spec and its strings')
pyf = next((x for x in p['activities']['items'] if x.get('id') == 'py-filter'), {})
pysrc = open(os.path.join(PF, 'main.py'), encoding='utf-8', newline='').read()
check(pyf.get('python') == pysrc and pyf.get('sha256') == hashlib.sha256(pysrc.encode()).hexdigest() and pyf.get('bytes') == len(pysrc.encode()) and pyf.get('spec') == rj(os.path.join(PF, 'spec.json')) and pyf.get('packages') == ['numpy'] and sorted(pyf.get('strings') or {}) == ['el', 'en', 'fr', 'ru'],
      'py-module@1: main.py is inline in the pack (python, with sha256 and bytes), its spec and packages beside it', str({k: v for k, v in pyf.items() if k != 'python'})[:400])
hq = next((x for x in p['activities']['items'] if x.get('id') == 'planets-quiz'), {})
H5B = open(os.path.join(PQ, 'item.h5p'), 'rb').read()
check(hq.get('runtime') == 'h5p@1' and 'h5p' not in hq and 'html' not in hq and hq.get('sha256') == hashlib.sha256(H5B).hexdigest() and hq.get('bytes') == len(H5B) and hq.get('entry') == 'activities/planets-quiz/item.h5p',
      'h5p@1: the registry names the .h5p file (entry, sha256, bytes); the package itself is not inside pack.json')
check(sorted(hq.get('h5pByLocale') or {}) == ['fr'] and hq['h5pByLocale']['fr']['content']['question'].startswith('<p>Quelle'), 'h5p@1: content.fr.json is inline as h5pByLocale.fr.content (small)')
zl = pk('o1')
check('activities/planets-quiz/item.h5p' in zl.namelist() and zl.read('activities/planets-quiz/item.h5p') == H5B and zl.getinfo('activities/planets-quiz/item.h5p').compress_type == zipfile.ZIP_STORED,
      'h5p@1: the .h5p file travels beside the pack in the .noema.zip, byte for byte (stored)')
check('🧩 activities/planets-quiz/item.h5p' in r.stdout and not os.path.exists(os.path.join(sd, 'build', 'planets-quiz.h5p')), 'make_pack.py names the H5P file beside the pack', r.stdout)
if os.environ.get('NOEMA_ACT_PACK'):   # run_e2e.sh: tests/activities_app.js imports this pack into the app (and the .noema.zip, which carries the .h5p)
    shutil.copy(os.path.join(sd, 'build', 'demo-physics.json'), os.environ['NOEMA_ACT_PACK'])
    shutil.copy(os.path.join(T, 'o1', 'demo-physics.noema.zip'), os.environ['NOEMA_ACT_PACK'] + '.noema.zip')
    sub = os.environ['NOEMA_ACT_PACK'] + '.subject'   # the subject folder itself (run_e2e.sh builds a one-file bundle from it: h5p@1 inline / too big)
    if os.path.exists(sub): shutil.rmtree(sub)
    shutil.copytree(sd, sub, ignore=shutil.ignore_patterns('build'))
if os.environ.get('NOEMA_ACT_SUBJECT'):   # the subject folder with every reference activity and its sim exercise (for activity_test.py / activity_preview.py)
    shutil.rmtree(os.environ['NOEMA_ACT_SUBJECT'], ignore_errors=True); shutil.copytree(sd, os.environ['NOEMA_ACT_SUBJECT'])

# py-filter's own numbers (numpy, as Pyodide runs them): f3 is the first −3 dB point, and none when the filter never gets there by fs/2
try:
    import importlib.util, math
    _sp = importlib.util.spec_from_file_location('pyfilter', os.path.join(PF, 'main.py')); _pf = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(_pf)
    _f3 = lambda **i: _pf.step(i, {})['f3']
    check(250 <= _f3(kind=0, N=12) <= 350 and not math.isfinite(_f3(kind=0, N=1)) and not math.isfinite(_f3(kind=1, N=4, fc=3000.0)) and 400 <= _f3(kind=1, N=4, fc=500.0) <= 600,
          'py-filter: f3 is the −3 dB point (N = 12 → ~300 Hz), and not a number when there is none (N = 1; a first-order filter at 3 kHz): the readout shows "—", never 4 kHz',
          str([_f3(kind=0, N=12), _f3(kind=0, N=1), _f3(kind=1, N=4, fc=3000.0), _f3(kind=1, N=4, fc=500.0)]))
except ImportError as e: print(f'(py-filter numbers not checked here: {e})')

# the round trip
w2 = os.path.join(T, 'w2'); r = run(os.path.join(S, 'unpack.py'), os.path.join(T, 'o1', 'demo-physics.noema.zip'), w2)
u = os.path.join(w2, 'demo-physics')
check(r.returncode == 0 and '11 activities' in r.stdout, 'unpack.py gives the activities back', r.stdout + r.stderr)
check(open(os.path.join(u, 'activities', 'alias-lab', 'app.html'), encoding='utf-8', newline='').read() == html, 'app.html comes back byte for byte')
check(rj(os.path.join(u, 'activities', 'alias-lab', 'strings.ru.json')) == rj(os.path.join(EX, 'strings.ru.json')), 'the string tables come back')
check(rj(os.path.join(u, 'activities', 'rc-lowpass', 'spec.json')) == rj(os.path.join(RC, 'spec.json')), 'spec.json comes back')
reg = rj(os.path.join(u, 'activities', 'activities.json'))
check(reg['items'][0].get('entry') == 'activities/alias-lab/app.html' and 'html' not in reg['items'][0], 'activities.json names the entry file (no bundle inside)')
check(reg['items'][1].get('entry') == 'activities/rc-lowpass/spec.json' and 'spec' not in reg['items'][1], 'activities.json names spec.json (no spec inside)')
check(rj(os.path.join(u, 'activities', 'led-bench', 'spec.json')) == rj(os.path.join(ROOT, 'tools', 'activities_examples', 'led-bench', 'spec.json')) and rj(os.path.join(u, 'activities', 'rc-transient', 'strings.el.json')) == rj(os.path.join(ROOT, 'tools', 'activities_examples', 'rc-transient', 'strings.el.json')), 'the circuit specs and their strings come back')
wreg = next(x for x in reg['items'] if x['id'] == 'wasm-oscillator')
check(open(os.path.join(u, 'activities', 'wasm-oscillator', 'module.wasm'), 'rb').read() == wbytes and rj(os.path.join(u, 'activities', 'wasm-oscillator', 'spec.json')) == rj(os.path.join(WO, 'spec.json'))
      and wreg.get('entry') == 'activities/wasm-oscillator/module.wasm' and not ({'wasm', 'sha256', 'bytes', 'spec'} & set(wreg)) and wreg.get('abi'), 'module.wasm comes back byte for byte, with its spec.json; activities.json names module.wasm and keeps abi (no base64 inside)')
check(open(os.path.join(u, 'activities', 'py-filter', 'main.py'), encoding='utf-8', newline='').read() == pysrc and rj(os.path.join(u, 'activities', 'py-filter', 'spec.json')) == rj(os.path.join(PF, 'spec.json')), 'main.py comes back byte for byte, with its spec.json')
pr = next(x for x in reg['items'] if x['id'] == 'py-filter')
check(pr.get('entry') == 'activities/py-filter/main.py' and 'python' not in pr and 'spec' not in pr and pr.get('packages') == ['numpy'], 'activities.json names main.py as the entry (no source, no spec inside), the packages stay', str(pr))
check(open(os.path.join(u, 'activities', 'planets-quiz', 'item.h5p'), 'rb').read() == H5B and rj(os.path.join(u, 'activities', 'planets-quiz', 'content.fr.json')) == PQ_FR
      and next(x for x in reg['items'] if x['id'] == 'planets-quiz').get('entry') == 'activities/planets-quiz/item.h5p' and 'h5pByLocale' not in next(x for x in reg['items'] if x['id'] == 'planets-quiz'),
      'h5p@1: item.h5p comes back byte for byte, content.fr.json too; the registry names the entry (no sha256, no inline content)')
pj = json.loads(pk('o1').read('pack.json')); pq = next(x for x in pj['activities']['items'] if x['id'] == 'planets-quiz'); pq['entry'] = 'activities/planets-quiz/quiz.h5p'
w3 = os.path.join(T, 'plain'); os.makedirs(os.path.join(w3, 'activities', 'planets-quiz')); wj(os.path.join(w3, 'demo-physics.json'), pj)   # a plain pack.json, its .h5p beside it under its own (not the default) entry
open(os.path.join(w3, 'activities', 'planets-quiz', 'quiz.h5p'), 'wb').write(H5B)
r = run(os.path.join(S, 'unpack.py'), os.path.join(w3, 'demo-physics.json'), os.path.join(w3, 'out')); q3 = os.path.join(w3, 'out', 'demo-physics', 'activities', 'planets-quiz', 'item.h5p')
check(r.returncode == 0 and 'its .h5p file is not here' not in r.stdout and os.path.isfile(q3) and open(q3, 'rb').read() == H5B
      and next(x for x in rj(os.path.join(w3, 'out', 'demo-physics', 'activities', 'activities.json'))['items'] if x['id'] == 'planets-quiz')['entry'] == 'activities/planets-quiz/item.h5p',
      'h5p@1: a plain pack.json whose item names another entry (activities/planets-quiz/quiz.h5p): the file is found there, unpacked as item.h5p', r.stdout + r.stderr)
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
def later(w):   # every runtime of the plan runs now (ACT.LATER is empty): a runtime this version does not know is refused
    r_ = rj(os.path.join(w, 'activities', 'activities.json')); r_['items'][0]['runtime'] = 'py-module@2'; wj(os.path.join(w, 'activities', 'activities.json'), r_)
refused('unknown runtime', later, "unknown runtime 'py-module@2'")
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
def p6spec(w, a, f):
    q = os.path.join(w, 'activities', a, 'spec.json'); s_ = rj(q); f(s_); wj(q, s_)
refused('a thermal binding with an unknown name', lambda w: p6spec(w, 'heatsink', lambda s_: s_['model']['bindings'][0].update(expr='Rsa * k')), "unknown variable 'k'")
refused('a pid plant the engine does not know', lambda w: p6spec(w, 'pid-tune', lambda s_: s_['model']['plant'].update(type='quantum')), 'spec.model.plant.type: one of fopdt')
refused('an rf binding to no field of the link', lambda w: p6spec(w, 'lora-link', lambda s_: s_['model']['bindings'][1].update(field='radio.colour')), 'not a numeric field of the link')
refused('a twin device that senses longer than it sleeps', lambda w: p6spec(w, 'sensor-node', lambda s_: s_['model']['device']['schedule'].update(sense=100)), 'must be shorter than the period')
def wasm_of(w, fixture):
    shutil.copy(os.path.join(ROOT, 'tests', 'fixtures', 'wasm', fixture + '.wasm'), os.path.join(w, 'activities', 'wasm-oscillator', 'module.wasm'))
refused('a module that imports something outside the host ABI', lambda w: wasm_of(w, 'forbidden'), 'import: env.fetch_url (func) is not in the host ABI')
refused('a module whose memory is over the limit', lambda w: wasm_of(w, 'bigmem'), 'memory: the declared maximum is 65536 pages')
def nospec(w): os.remove(os.path.join(w, 'activities', 'wasm-oscillator', 'spec.json'))
refused('a module without its own spec in a block', nospec, 'module without its own spec')
refused('a wasm exercise graded "reported"', lambda w: ex_of(w, 'ch01-e908', lambda e: e.update(grade={'mode': 'reported'})), 'a wasm-module@1 activity reports nothing itself')

# external-embed@1 (P6): an allow-listed outside page — no file, no entry; explore only
EMB = {'id': 'ohm-phet', 'runtime': 'external-embed@1', 'stateVersion': 1, 'provider': 'phet', 'url': 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html',
       'credit': 'PhET Interactive Simulations, University of Colorado Boulder · Ohm’s Law · CC-BY-4.0 · https://phet.colorado.edu', 'license': 'CC-BY-4.0', 'height': 480,
       'fallback': {'media': 'alias-lab-still', 'text': 'Ohm’s law: the current through a resistor grows with the voltage and falls with the resistance, I = V / R.'}}
ew = os.path.join(T, 'w-embed', 'demo-physics'); shutil.copytree(sd, ew); shutil.rmtree(os.path.join(ew, 'build'), ignore_errors=True)
er = rj(os.path.join(ew, 'activities', 'activities.json')); er['items'].append(dict(EMB)); wj(os.path.join(ew, 'activities', 'activities.json'), er)
for loc, title in (('en', 'Ohm’s law simulation (PhET)'), ('el', 'Προσομοίωση του νόμου του Ohm (PhET)'), ('ru', 'Симуляция закона Ома (PhET)'), ('fr', 'Simulation de la loi d’Ohm (PhET)')):
    wj(os.path.join(ew, 'activities', 'ohm-phet', f'strings.{loc}.json'), {'title': title})
for ch in (os.path.join(ew, 'chapters', 'ch01.json'), os.path.join(ew, 'translations', 'fr', 'ch01.json')):
    c = rj(ch); c['sections'][0]['blocks'].append({'t': 'interactive', 'activity': 'ohm-phet', 'caption': 'PhET: Ohm’s law.'}); wj(ch, c)
r = mk(ew, 'oe1'); check(r.returncode == 0, 'make_pack.py builds a pack with an outside page (external-embed@1)', r.stdout + r.stderr)
pe = json.loads(zipfile.ZipFile(os.path.join(T, 'oe1', 'demo-physics.noema.zip')).read('pack.json'))
ei = next((x for x in pe['activities']['items'] if x.get('id') == 'ohm-phet'), {})
check(ei.get('url') == EMB['url'] and 'entry' not in ei and 'html' not in ei and sorted(ei.get('strings') or {}) == ['el', 'en', 'fr', 'ru'] and 'runtime:external-embed@1' in pe.get('requires', []),
      'external-embed@1: the item travels with its url, credit and licence, no entry and no file; pack.requires names the runtime')
we = os.path.join(T, 'w-embed2'); r = run(os.path.join(S, 'unpack.py'), os.path.join(T, 'oe1', 'demo-physics.noema.zip'), we)
ue = os.path.join(we, 'demo-physics'); ere = next(x for x in rj(os.path.join(ue, 'activities', 'activities.json'))['items'] if x['id'] == 'ohm-phet')
check(r.returncode == 0 and 'entry' not in ere and ere.get('url') == EMB['url'] and rj(os.path.join(ue, 'activities', 'ohm-phet', 'strings.el.json'))['title'].startswith('Προσομοίωση'), 'unpack.py gives the outside page back without an entry (its strings beside it)', r.stdout + r.stderr)
r = mk(ue, 'oe2'); check(r.returncode == 0 and json.loads(zipfile.ZipFile(os.path.join(T, 'oe2', 'demo-physics.noema.zip')).read('pack.json'))['version'] == pe['version'], 'the outside page round-trips: same pack.version', r.stdout + r.stderr)
def refused_e(name, change, want):
    w = os.path.join(T, 'bad-e-' + name); shutil.copytree(ew, w); change(w)
    r = mk(w, 'obe-' + name); check(r.returncode == 1 and want in r.stdout, 'refused: ' + name, r.stdout + r.stderr)
def emb(w, **kw):
    q = os.path.join(w, 'activities', 'activities.json'); r_ = rj(q); next(x for x in r_['items'] if x['id'] == 'ohm-phet').update(kw); wj(q, r_)
refused_e('a provider whose terms are pending (Falstad)', lambda w: emb(w, provider='falstad', url='https://www.falstad.com/circuit/circuitjs.html?ctz=abc', credit='Circuit simulator by Paul Falstad', license='GPL-2.0-or-later'), 'provider-pending')
refused_e('a URL off the allow-list', lambda w: emb(w, url='https://phet.colorado.edu/en/simulations/ohms-law'), 'url-path')
def emb_sim(w):
    c = rj(os.path.join(w, 'chapters', 'ch01.json')); c['exercises'].append({**SIM, 'id': 'ch01-e909', 'activity': 'ohm-phet'}); wj(os.path.join(w, 'chapters', 'ch01.json'), c)
refused_e('an outside page graded as a sim', emb_sim, 'sim-embed')
def h5p_with(extra):   # the reference .h5p with one more file in it
    def f(w):
        q = os.path.join(w, 'activities', 'planets-quiz', 'item.h5p'); src = zipfile.ZipFile(q); ent = [(i.filename, src.read(i)) for i in src.infolist()]; src.close()
        with zipfile.ZipFile(q, 'w', zipfile.ZIP_DEFLATED) as z:
            for n_, b_ in ent + list(extra.items()): z.writestr(n_, b_)
    return f
refused('an H5P package with a .php file', h5p_with({'content/shell.php': b'<?php ?>'}), 'files of type .php are not allowed')
def h5p_link(w):
    q = os.path.join(w, 'activities', 'planets-quiz', 'content.fr.json'); c_ = rj(q); c_['question'] = '<img src="https://x.example/p.png">'; wj(q, c_)
refused('an H5P translation with an outside link', h5p_link, 'h5pByLocale.fr: content.json question: an outside link')
refused('an H5P item without its words in fr', lambda w: os.remove(os.path.join(w, 'activities', 'planets-quiz', 'content.fr.json')), 'h5pByLocale.fr is missing')
refused('an H5P translation for a language the pack is not read in', lambda w: shutil.copy(os.path.join(PQ, 'content.el.json'), os.path.join(w, 'activities', 'planets-quiz')), 'h5pByLocale.el: the pack is not read in el')
refused('an H5P item without its file', lambda w: os.remove(os.path.join(w, 'activities', 'planets-quiz', 'item.h5p')), "entry 'activities/planets-quiz/item.h5p' not found")
def noacts(w):
    shutil.rmtree(os.path.join(w, 'activities'))
refused('a block without activities/', noacts, "activity 'alias-lab' is not in pack.activities")
print(f'\nactivities_pack: {ok} checks passed')
