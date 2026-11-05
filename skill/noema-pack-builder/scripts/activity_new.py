#!/usr/bin/env python3
"""Start a new activity from a reference one (docs/INTERACTIVE_AUTHORING.md):
  python3 activity_new.py SUBJECT_DIR NEW_ID [--runtime html-app@1 | sim-spec@1 | py-module@1 | h5p@1 | wasm-module@1] [--from alias-lab | rc-lowpass | rc-transient | led-bench | heatsink | pid-tune | lora-link | sensor-node | wasm-oscillator | py-filter | planets-quiz | a library engine's reference (LIB_REFS: satin-move, calendar-synchronism, …) | FILE.h5p]
html-app@1 (default) copies alias-lab (sampling and aliasing, a mini-app): activities/<NEW_ID>/app.html, strings.<locale>.json, tests.json.
sim-spec@1 copies rc-lowpass (an RC low-pass filter, a declarative simulation): activities/<NEW_ID>/spec.json, strings.<locale>.json, tests.json.
h5p@1 copies planets-quiz (an ordinary H5P MultiChoice item): activities/<NEW_ID>/item.h5p, content.<locale>.json (its words in
the other languages), tests.json; --from FILE.h5p takes your own .h5p file instead (checked at once with h5p_check.py; then write
content.<locale>.json for every other language the pack is read in: a copy of its content/content.json, translated).
--from picks the reference: rc-transient (circuit-mna@1: a netlist, sliders bound to its parts, a scope trace) or led-bench
(circuit-mna@1: a fault-finding bench with hidden faults, instruments, test points and a diagnosis; docs/INTERACTIVE_CIRCUIT.md),
heatsink (thermal@1: a lumped thermal network, heat flow and temperatures), pid-tune (pid@1: a control loop to tune), lora-link
(rf@1: a radio link budget) or sensor-node (twin@1: the digital twin of a battery-powered IoT node) — docs/INTERACTIVE_ENGINES.md;
their tests.json starts from two of the reference's own cases.
wasm-module@1 copies wasm-oscillator (a precompiled WebAssembly core with its own spec; docs/INTERACTIVE_WASM.md): module.wasm, spec.json,
the strings and tests.json — replace module.wasm with YOUR module (check it with wasm_check.py) and keep abi in the registry entry.
py-module@1 copies py-filter (numpy: two digital low-pass filters; docs/INTERACTIVE_PYTHON.md): activities/<NEW_ID>/main.py (step(inputs, state)),
spec.json (the controls, readouts and plots the app draws from Python's outputs), strings.<locale>.json, tests.json.
Each: its entry in activities/activities.json (made if missing); media/<NEW_ID>-still.svg + its media.json entry (the fallback
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
REF = {'html-app@1': 'alias-lab', 'sim-spec@1': 'rc-lowpass', 'py-module@1': 'py-filter', 'h5p@1': 'planets-quiz', 'wasm-module@1': 'wasm-oscillator'}
FROM = {'alias-lab': 'html-app@1', 'rc-lowpass': 'sim-spec@1', 'rc-transient': 'sim-spec@1', 'led-bench': 'sim-spec@1', 'heatsink': 'sim-spec@1',
        'pid-tune': 'sim-spec@1', 'lora-link': 'sim-spec@1', 'sensor-node': 'sim-spec@1', 'wasm-oscillator': 'wasm-module@1',
        'py-filter': 'py-module@1', 'planets-quiz': 'h5p@1'}
# the engine library (docs/INTERACTIVE_LIBRARY.md): one reference activity per engine, each a sim-spec@1 spec; --from <name> starts from it
LIB_REFS = {'satin-move': 'craft@1', 'calendar-synchronism': 'timeline@1'}
FROM.update({k: 'sim-spec@1' for k in LIB_REFS})
P6_REFS = ('heatsink', 'pid-tune', 'lora-link', 'sensor-node')   # the P6 engines thermal@1, pid@1, rf@1, twin@1 (docs/INTERACTIVE_ENGINES.md)
ref = None; h5p_file = None
if '--from' in a:
    i = a.index('--from'); ref = a[i + 1] if i + 1 < len(a) else ''; del a[i:i + 2]
    if ref.lower().endswith('.h5p'):   # your own H5P item
        if not os.path.isfile(ref): sys.exit(f'✗ {ref}: no such file')
        if '--runtime' in sys.argv and runtime != 'h5p@1': sys.exit(f'✗ {ref} is an H5P file (h5p@1)')
        h5p_file = os.path.abspath(ref); ref = 'planets-quiz'
    if ref not in FROM: sys.exit(f'✗ --from is one of {", ".join(FROM)}')
    if '--runtime' in sys.argv and FROM[ref] != runtime: sys.exit(f'✗ {ref} is a {FROM[ref]} activity')
    runtime = FROM[ref]
if runtime not in REF: sys.exit(f'✗ --runtime is one of {", ".join(REF)}')
sdir, nid = os.path.abspath(a[0]), a[1]
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', nid): sys.exit('✗ the id is lower-case letters, digits and - (2–61 characters)')
ref = ref or REF[runtime]
_ez = os.path.join(HERE, 'activities_examples.zip')   # the skill ships the references as one zip (claude.ai's 200-file limit)
if not os.path.isdir(os.path.join(HERE, 'activities_examples')) and os.path.isfile(_ez):
    import zipfile; zipfile.ZipFile(_ez).extractall(os.path.join(HERE, 'activities_examples'))
src = next((d for d in (os.path.join(HERE, 'activities_examples', ref), os.path.join(HERE, '..', '..', '..', 'tools', 'activities_examples', ref)) if os.path.isdir(d)), None)
if not src: sys.exit(f'✗ the reference activity (activities_examples/{ref}) is missing from the toolkit')
dst = os.path.join(sdir, 'activities', nid)
if os.path.exists(dst): sys.exit(f'✗ activities/{nid} exists already')
rp = os.path.join(sdir, 'activities', 'activities.json')
reg = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {'format': 'noema.activities/v1', 'items': []}
if any(x.get('id') == nid for x in reg['items']): sys.exit(f'✗ {nid} is in activities.json already')
os.makedirs(dst)
main = {'html-app@1': 'app.html', 'py-module@1': 'main.py', 'h5p@1': 'item.h5p', 'wasm-module@1': 'module.wasm'}.get(runtime, 'spec.json')
for f in os.listdir(src):
    if (f == main and not h5p_file) or f.startswith('strings.') or (f.startswith('content.') and not h5p_file) or (runtime in ('py-module@1', 'wasm-module@1') and f == 'spec.json'): shutil.copy(os.path.join(src, f), dst)
if h5p_file: shutil.copy(h5p_file, os.path.join(dst, 'item.h5p'))
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
if runtime == 'h5p@1':   # "click" / "set" act inside the H5P item; "passed" is H5P's own score (xAPI answered, reported)
    cases = json.load(open(os.path.join(src, 'tests.json'), encoding='utf-8'))['cases'] if not h5p_file else [
        {'name': 'TODO the right answer', 'exercise': 'chNN-eNNN', 'steps': [{'click': 'TODO a selector inside the item'}, {'click': '.h5p-question-check-answer'}], 'expect': {'passed': True}},
        {'name': 'TODO a tempting wrong answer', 'exercise': 'chNN-eNNN', 'steps': [{'click': 'TODO'}, {'click': '.h5p-question-check-answer'}], 'expect': {'passed': False}}]
    for c in cases:
        if c.get('exercise'): c['exercise'] = 'chNN-eNNN'
elif runtime == 'html-app@1':
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': '#fs', 'value': '10'}], 'expect': {'passed': True}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': '#fs', 'value': '5'}], 'expect': {'passed': False}}]
elif ref == 'led-bench':   # a bench: "task" picks the hidden fault, "measure" takes a reading, "diagnose" picks an option (from 0)
    cases = [{'name': 'TODO the fault found with the readings that show it', 'exercise': 'chNN-eNNN', 'task': {'fault': 'rOpen'},
              'steps': [{'measure': {'instrument': 'V', 'a': 'TP3', 'b': 'GND'}}, {'diagnose': 2}], 'expect': {'passed': True, 'log': 1, 'readings': [[0, -0.05, 0.05]]}},
             {'name': 'TODO a tempting wrong diagnosis', 'exercise': 'chNN-eNNN', 'task': {'fault': 'ledReversed'},
              'steps': [{'measure': {'instrument': 'V', 'a': 'TP3', 'b': 'GND'}}, {'diagnose': 5}], 'expect': {'passed': False}}]
elif ref == 'wasm-oscillator':   # its own spec: "set" names a param, "values" the module's outputs and the derived values
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'c', 'value': 1.6}], 'expect': {'passed': True, 'values': {'E': [0.04, 0.05]}}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'c', 'value': 1}], 'expect': {'passed': False}}]
elif ref in P6_REFS or ref in LIB_REFS:   # the reference's first passing and first failing graded case, to be made your own
    own = json.load(open(os.path.join(src, 'tests.json'), encoding='utf-8')).get('cases', [])
    pick = [next((c for c in own if c.get('exercise') and c.get('expect', {}).get('passed') is want), None) for want in (True, False)]
    cases = [{**c, 'name': 'TODO ' + c['name'], 'exercise': 'chNN-eNNN'} for c in pick if c]
    if not cases and ref in LIB_REFS:   # a library reference with value cases only (an explorer): its first two, to be made your own
        cases = [{**c, 'name': 'TODO ' + c['name']} for c in own[:2]]
elif runtime == 'py-module@1':   # Python: "set" names a param of the spec; "values" are ranges of Python's scalar outputs
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'N', 'value': 8}], 'expect': {'passed': True, 'values': {'att1k': [-130, -60]}}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'N', 'value': 16}], 'expect': {'passed': False}}]
elif ref == 'rc-transient':
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'R', 'value': 1000}], 'expect': {'passed': True, 'values': {'vAt': [3.05, 3.27]}}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'R', 'value': 470}], 'expect': {'passed': False}}]
else:   # sim-spec@1: "set" names a param of the spec; "values" are ranges of the computed values
    cases = [{'name': 'TODO the right solution', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'R', 'value': 1600}], 'expect': {'passed': True, 'values': {'fc': [950, 1050]}}},
             {'name': 'TODO a tempting wrong one', 'exercise': 'chNN-eNNN', 'steps': [{'set': 'R', 'value': 4710}], 'expect': {'passed': False}}]
json.dump({'cases': cases}, open(os.path.join(dst, 'tests.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'✓ activities/{nid}/ (from {ref}, {runtime}), its activities.json entry, media/{nid}-still.svg. Next: change {main} and the strings, '
      f'replace every TODO, add the block / sim exercise' + (' (grade: {"mode": "checks", "checks": [...]})' if runtime in ('sim-spec@1', 'py-module@1', 'wasm-module@1') else '')
      + ', then activity_lint.py → activity_test.py → activity_preview.py')
if h5p_file:   # the package rules at once (the same as make_pack.py and the app)
    sys.path.insert(0, HERE); sys.path.append(os.path.join(HERE, '..', '..', '..', 'tools'))
    import h5p_check
    r = h5p_check.check(os.path.join(dst, 'item.h5p'))
    print(('✗ ' if r['errors'] else '✓ ') + f'{os.path.basename(h5p_file)}: ' + (r.get('main') or '?') + ''.join('\n   error: ' + e for e in r['errors']) + ''.join('\n   warning: ' + w for w in r['warnings']))
    if r['errors']: sys.exit(1)
