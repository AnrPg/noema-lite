#!/usr/bin/env python3
"""H5P → noema-lite exercises (tools/h5p_import.py, docs/activities-dev/h5p_import.md).
The three fixtures (tests/fixtures/h5p: mc, drag, tf) and small packages built here (Blanks, DragText as cloze and as bucket,
MarkTheWords, QuestionSet with a picture, Summary, Dialogcards, DragQuestion on a picture and as bucket, SingleChoiceSet):
the chapter validates (tools/validate.py with the pack's media, the content checks' checkExercise in build/noema-tools.cjs), the answers are right,
the pictures are in media/media.json, and an unsupported package is reported, never a crash.
Usage: python3 tests/h5p_import.py"""
import io, json, os, shutil, struct, subprocess, sys, tempfile, zipfile, zlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import h5p_import as H
import noema_lib

n = fails = 0
def ok(c, m):
    global n, fails
    n += 1
    if not c: fails += 1
    print(('✓ ' if c else '✗ ') + m)

def png(w, h, rgb=(40, 120, 200)):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def pkg(path, lib, content, title='Item', files=None, license='CC BY', version='4.0', authors=('Jo Author',)):
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('h5p.json', json.dumps({'title': title, 'mainLibrary': lib, 'language': 'en', 'license': license, 'licenseVersion': version,
                                            'authors': [{'name': a, 'role': 'Author'} for a in authors], 'preloadedDependencies': [{'machineName': lib, 'majorVersion': 1, 'minorVersion': 0}]}))
        z.writestr('content/content.json', json.dumps(content))
        for k, v in (files or {}).items(): z.writestr('content/' + k, v)
        z.writestr(lib + '-1.0/library.json', '{}')   # the libraries are never read
    return path

TMP = tempfile.mkdtemp(prefix='h5p-')
P = lambda name: os.path.join(TMP, name)
IMG = png(1000, 600)
img = lambda p, alt=None: {'library': 'H5P.Image 1.1', 'params': {'file': {'path': p, 'mime': 'image/png', 'width': 1000, 'height': 600}, 'alt': alt}}
mc_params = lambda q, opts, right, **kw: {'question': q, 'answers': [{'text': f'<div>{o}</div>', 'correct': i in right, 'tipsAndFeedback': {'tip': '', 'chosenFeedback': kw.get('fb', {}).get(i, ''), 'notChosenFeedback': ''}} for i, o in enumerate(opts)], 'behaviour': {'type': 'auto'}, **({'media': kw['media']} if 'media' in kw else {})}

built = [
    pkg(P('blanks.h5p'), 'H5P.Blanks', {'text': '<p>Fill in the temperatures.</p>', 'questions': ['<p>Water boils at *100/one hundred* &deg;C at sea level.</p>', '<p>Ice melts at <strong>*0:Think of freezing*</strong> °C.</p>'], 'behaviour': {'caseSensitive': True}}, 'Water temperatures'),
    pkg(P('dragtext.h5p'), 'H5P.DragText', {'taskDescription': 'Drag the words into the text.', 'textField': 'The *Sun* is a star; *Mars:a red one* is a planet.', 'distractors': '*Moon* *Sun*'}, 'Sun and Mars'),
    pkg(P('dragtext_bucket.h5p'), 'H5P.DragText', {'taskDescription': 'Inner or outer planet?', 'textField': 'Mercury: *inner*\nVenus: *inner*\nJupiter: *outer*\nNeptune: *outer*'}, 'Inner or outer'),
    pkg(P('mark.h5p'), 'H5P.MarkTheWords', {'taskDescription': '<p>Mark the nouns.</p>', 'textField': '<p>The *cat* sat on the *mat*.</p>'}, 'Nouns'),
    pkg(P('qset.h5p'), 'H5P.QuestionSet', {'introPage': {'showIntroPage': True, 'introduction': '<p>Three questions on the planets.</p>'}, 'questions': [
        {'library': 'H5P.MultiChoice 1.16', 'params': mc_params('<p>Which of these planets are <em>gas giants</em>?</p>', ['Jupiter', 'Saturn', 'Mars', 'Venus'], {0, 1}, media={'type': img('images/planets.png', 'Four planets side by side')}, fb={2: 'Mars is a rocky planet.'})},
        {'library': 'H5P.TrueFalse 1.6', 'params': {'question': '<p>Venus is closer to the Sun than Earth.</p>', 'correct': 'true', 'behaviour': {'feedbackOnCorrect': 'Venus is the second planet.', 'feedbackOnWrong': 'Count the planets from the Sun.'}}},
        {'library': 'H5P.InteractiveVideo 1.22', 'params': {}}]}, 'Planet quiz', {'images/planets.png': IMG}),
    pkg(P('summary.h5p'), 'H5P.Summary', {'intro': '<p>Choose the right statement.</p>', 'summaries': [
        {'summary': ['<p>Plants make sugar from light.</p>', '<p>Plants eat soil.</p>'], 'tip': 'Think of photosynthesis.'},
        {'summary': ['<p>The sugar stores energy.</p>', '<p>The sugar is waste.</p>', '<p>The sugar is light.</p>']},
        {'summary': ['<p>Animals eat the plants.</p>', '<p>Animals make light.</p>']}]}, 'Food chain'),
    pkg(P('cards.h5p'), 'H5P.Dialogcards', {'title': 'Capitals', 'dialogs': [
        {'text': '<p>Capital of France?</p>', 'answer': '<p><strong>Paris</strong></p>', 'tips': {'front': 'City of light', 'back': ''}},
        {'text': '<p>Capital of Japan?</p>', 'answer': '<p>Tokyo</p>', 'image': {'path': 'images/tokyo.png', 'mime': 'image/png'}, 'imageAltText': 'Tokyo at night'}]}, 'Capitals', {'images/tokyo.png': png(900, 500, (10, 10, 30))}),
    pkg(P('dragimg.h5p'), 'H5P.DragQuestion', {'question': {'settings': {'size': {'width': 620, 'height': 310}, 'background': {'path': 'images/map.png', 'mime': 'image/png', 'width': 1000, 'height': 600}},
        'task': {'elements': [
            {'type': {'library': 'H5P.AdvancedText 1.1', 'params': {'text': '<p>Place the labels on the map.</p>'}}, 'x': 0, 'y': 0, 'width': 10, 'height': 2, 'dropZones': []},
            *[{'type': {'library': 'H5P.AdvancedText 1.1', 'params': {'text': f'<p>{w}</p>'}}, 'x': 2, 'y': 10 * i, 'width': 8, 'height': 2, 'dropZones': ['0', '1', '2']} for i, w in enumerate(['North', 'South', 'East', 'Nowhere'])]],
            'dropZones': [{'x': 10, 'y': 5, 'width': 20, 'height': 10, 'correctElements': ['1'], 'label': 'Top'}, {'x': 10, 'y': 80, 'width': 20, 'height': 10, 'correctElements': ['2'], 'label': 'Bottom'}, {'x': 75, 'y': 40, 'width': 20, 'height': 10, 'correctElements': ['3'], 'label': 'Right'}]}}}, 'Compass map', {'images/map.png': IMG}),
    pkg(P('dragbucket.h5p'), 'H5P.DragQuestion', {'question': {'task': {'elements': [{'type': {'library': 'H5P.AdvancedText 1.1', 'params': {'text': f'<p>{w}</p>'}}, 'dropZones': ['0', '1']} for w in ['Iron', 'Oxygen', 'Copper', 'Neon']],
        'dropZones': [{'label': '<div>Metals</div>', 'correctElements': ['0', '2']}, {'label': '<div>Gases</div>', 'correctElements': ['1', '3']}]}}}, 'Metals and gases'),
    pkg(P('scs.h5p'), 'H5P.SingleChoiceSet', {'choices': [{'question': '<p>2 + 2 = ?</p>', 'answers': ['<p>4</p>', '<p>5</p>', '<p>3</p>']}, {'question': '<p>Red + blue = ?</p>', 'answers': ['<p>Purple</p>', '<p>Green</p>']}]}, 'Quick set'),
]
bad = [
    pkg(P('cp.h5p'), 'H5P.CoursePresentation', {'presentation': {}}, 'Slides'),
    pkg(P('imgdrag.h5p'), 'H5P.DragQuestion', {'question': {'task': {'elements': [{'type': {'library': 'H5P.Image 1.1', 'params': {}}, 'dropZones': ['0']}], 'dropZones': [{'label': 'A', 'correctElements': ['0']}]}}}, 'Image drag'),
]
with open(P('broken.h5p'), 'wb') as f: f.write(b'not a zip')
with zipfile.ZipFile(P('nocontent.h5p'), 'w') as z: z.writestr('h5p.json', '{"title": "x", "mainLibrary": "H5P.TrueFalse"}')
bad += [P('broken.h5p'), P('nocontent.h5p')]
FIX = [os.path.join(ROOT, 'tests', 'fixtures', 'h5p', f) for f in ('mc.h5p', 'drag.h5p', 'tf.h5p')]

# 0. the text format
ok(H.text('<p>A <strong> bold </strong>word, <em>it</em> &amp; <code>x=1</code></p><p>next</p>') == 'A **bold** word, *it* & `x=1`\nnext', 'HTML → inline format: bold / italic / code kept, entities decoded, paragraphs → lines')
ok(H.text('<p>2*3 <script>alert(1)</script><iframe src="x">y</iframe>[[a]]</p>') == '2∗3 [ [a] ]', 'scripts and frames are dropped; a literal * and [[ ]] cannot become marks or blanks')
ok(H.text('<em> </em>x<b></b>') == 'x', 'empty emphasis leaves nothing behind')

# 1. the import
ch, media, rep = H.convert(FIX + built + bad, 'ch05', src='h5p-src')
by = {r['package']: r for r in rep['imported']}
EX = {e['id']: e for e in ch['exercises']}
exs = lambda name: [EX[i] for i in by[name]['exercises']]
ok(len(rep['imported']) == len(FIX) + len(built), f'every supported package is imported ({len(rep["imported"])})')
unsup = {r['package']: r['reason'] for r in rep['unsupported']}
ok(set(unsup) == {'cp.h5p', 'imgdrag.h5p', 'broken.h5p', 'nocontent.h5p'}, 'the unsupported packages are reported: ' + '; '.join(f'{k}: {v}' for k, v in sorted(unsup.items())))
ok('not supported' in unsup.get('cp.h5p', '') and 'text draggables' in unsup.get('imgdrag.h5p', '') and 'not a zip' in unsup.get('broken.h5p', '') and 'missing' in unsup.get('nocontent.h5p', ''), 'each with a reason a person can act on')
ok(any('InteractiveVideo' in x for x in rep['notes']), 'a QuestionSet part that cannot be imported is a note, the rest comes in')

m = exs('mc.h5p')[0]
ok(m['type'] == 'mcq' and m['options'][m['answer']] == 'Jupiter' and m['q'] == 'Which planet is the largest in the Solar System?', 'mc.h5p → mcq, the right answer Jupiter')
t = exs('tf.h5p')[0]
ok(t['type'] == 'tf' and t['answer'] is False, 'tf.h5p → tf, answer false')
d = exs('drag.h5p')
ok([x['type'] for x in d] == ['mcq', 'mcq'] and [x['options'][x['answer']] for x in d] == ['Inner planets', 'Outer planets'] and '**Mercury**' in d[0]['q'], 'drag.h5p (2 zones, 2 words: too few for bucket/match) → one mcq per word, right zones')
ok(all(x['cite'] == {'title': 'Inner and outer planets', 'license': 'CC0', 'h5p': 'drag.h5p', 'author': 'noema-lite tests', 'src': 'h5p-src'} for x in d), 'cite: the H5P title, author, licence (and the source id)')
ok(exs('tf.h5p')[0]['cite']['license'].startswith('unknown'), 'licence "U" → unknown (undisclosed)')
b = exs('blanks.h5p')[0]
ok(b['type'] == 'cloze' and b['text'] == 'Water boils at [[100|one hundred]] °C at sea level.\nIce melts at [[0]] °C.' and 'bank' not in b, 'Blanks → typed cloze with the alternatives, entities decoded, bold around a blank dropped')
ok('Tip 2: Think of freezing' in b['explain'] and any('case-sensitive' in x for x in rep['notes']), 'Blanks: the tip goes to the explanation; case sensitivity is noted')
c = exs('dragtext.h5p')[0]
ok(c['type'] == 'cloze' and c['text'] == 'The [[Sun]] is a star; [[Mars]] is a planet.' and c['bank'] == ['Moon'], 'DragText → cloze with a bank; a distractor equal to an answer is left out')
k = exs('dragtext_bucket.h5p')[0]
ok(k['type'] == 'bucket' and k['buckets'] == ['inner', 'outer'] and [(i['text'], k['buckets'][i['bucket']]) for i in k['items']] == [('Mercury', 'inner'), ('Venus', 'inner'), ('Jupiter', 'outer'), ('Neptune', 'outer')], 'DragText of one word per line into a few groups → bucket')
s = exs('mark.h5p')[0]
ok(s['type'] == 'spotbug' and s['lines'] == ['The', 'cat', 'sat', 'on', 'the', 'mat.'] and s['bugs'] == [1, 5] and s['fix'] == 'The **cat** sat on the **mat.**', 'MarkTheWords → spotbug, a word a line, the marked words are the "bugs"')
q = exs('qset.h5p')
ok([x['type'] for x in q] == ['img_reveal', 'tf'], 'QuestionSet → its questions (a MultiChoice with a picture → img_reveal, a TrueFalse → tf)')
ok(q[0]['multi'] is True and sorted(q[0]['options'][i] for i in q[0]['answer']) == ['Jupiter', 'Saturn'] and q[0]['why'][2] == 'Mars is a rocky planet.' and q[0]['media'] in media, 'MultiChoice with two right answers → multi, the feedback per option → why, the picture → pack media')
ok(q[1]['answer'] is True and q[1]['explain'].startswith('Venus is the second planet.') and 'Count the planets' in q[1]['explain'], 'TrueFalse feedback → explain')
ok(any(bl == {'t': 'p', 'text': 'Three questions on the planets.'} for bl in ch['sections'][[x['id'] for x in ch['sections']].index(by['qset.h5p']['section'])]['blocks']), 'the QuestionSet introduction becomes theory text')
sm = exs('summary.h5p')
ok([x['type'] for x in sm] == ['mcq'] * 3 and [x['options'][x['answer']] for x in sm] == ['Plants make sugar from light.', 'The sugar stores energy.', 'Animals eat the plants.'] and 'Tip: Think of photosynthesis.' in sm[0]['explain'], 'Summary → an mcq per statement set (the first statement is right), tips → explain')
_, _, rep2 = H.convert([P('summary.h5p')], 'ch05', summary_order=True)
ch2, _, _ = H.convert([P('summary.h5p')], 'ch05', summary_order=True)
ok(ch2['exercises'][-1]['type'] == 'order' and ch2['exercises'][-1]['items'] == ['Plants make sugar from light.', 'The sugar stores energy.', 'Animals eat the plants.'], '--summary-order: + an order exercise of the right statements')
fc = [f for f in ch['flashcards'] if f['section'] == by['cards.h5p']['section']]
ok([(f['q'], f['a']) for f in fc] == [('Capital of France?\n*Hint: City of light*', '**Paris**'), ('Capital of Japan?', 'Tokyo')] and all(f['id'].startswith('ch05-f') for f in fc), 'Dialogcards → flashcards (front tip as a hint)')
sec_cards = next(x for x in ch['sections'] if x['id'] == by['cards.h5p']['section'])
ok(any(bl['t'] == 'figure' for bl in sec_cards['blocks']) and any('Tokyo at night' in bl.get('text', '') for bl in sec_cards['blocks']), 'a card picture → a figure in the section, explained right after it')
g = exs('dragimg.h5p')[0]
regs = {r['label']: r for r in g['regions']}
ok(g['type'] == 'img_drag' and set(regs) == {'North', 'South', 'East'} and g['distractors'] == ['Nowhere'] and g['q'].startswith('Place the labels on the map.'), 'DragQuestion on a picture, one word per zone → img_drag; the word right nowhere → distractor')
ok(regs['North'] == {'id': 'z0', 'shape': 'rect', 'x': 100.0, 'y': 30.0, 'w': 200.0, 'h': 60.0, 'label': 'North', 'note': 'Top'} and regs['East']['x'] == 750.0, 'the zones become regions in picture units (percent × picture size)')
bk = exs('dragbucket.h5p')[0]
ok(bk['type'] == 'bucket' and bk['buckets'] == ['Metals', 'Gases'] and [(i['text'], i['bucket']) for i in bk['items']] == [('Iron', 0), ('Oxygen', 1), ('Copper', 0), ('Neon', 1)], 'DragQuestion of words into 2 labelled zones → bucket')
sc = exs('scs.h5p')
ok([x['options'][x['answer']] for x in sc] == ['4', 'Purple'], 'SingleChoiceSet → an mcq each (the first answer is right)')
ok(len(media) == 3 and all(it['license'] == 'CC BY 4.0' and it['origin'] == 'source' and it['alt'] for it, _ in media.values()), 'three pictures → pack media with licence, origin and alt')
ok(len({e['id'] for e in ch['exercises']}) == len(ch['exercises']) and [e['id'] for e in ch['exercises']] == [f'ch05-e{i + 1:03d}' for i in range(len(ch['exercises']))], 'exercise ids are sequential chNN-eNNN')
ok(json.dumps(H.convert(FIX + built + bad, 'ch05', src='h5p-src')[0], sort_keys=True) == json.dumps(ch, sort_keys=True), 'the import is deterministic')
ok(not any(w in json.dumps(ch).lower() for w in ('<p>', '<div', '&deg;', '&amp;', 'see the video')), 'no HTML or entities are left in the texts')

# 2. it validates in a subject skeleton (tools/validate.py with the media registry, as build.py runs it)
SUBJ = os.path.join(TMP, 'subject')
os.makedirs(SUBJ)
shutil.copy(os.path.join(ROOT, 'tests', 'fixtures', 'demo-physics', 'subject.json'), SUBJ)
H.write(SUBJ, ch, media)
H.write(SUBJ, ch, media)   # twice: media.json is merged, not duplicated
loaded, mrep = noema_lib.load_media(SUBJ, embed=False)
ok(len(loaded) == 3 and not [x for x in mrep if x.startswith('ERROR')], 'media/media.json loads as the build loads it (no errors): ' + '; '.join(mrep[:3]))
mp = os.path.join(TMP, '_media.json')
json.dump({k: {'w': v['w'], 'h': v['h'], 'regions': v.get('regions')} for k, v in loaded.items()}, open(mp, 'w'))
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'validate.py'), os.path.join(SUBJ, 'chapters', 'ch05.json'), '--media', mp], capture_output=True, text=True)
ok(r.returncode == 0 and r.stdout.strip().endswith('OK'), 'tools/validate.py accepts the chapter' + ('' if r.returncode == 0 else ': ' + ' | '.join(l for l in r.stdout.splitlines() if l.startswith('ERROR'))[:600]))
# the app's own check (checkExercise of the content checks, build/noema-tools.cjs) agrees
js = ("const C = require(process.argv[1]).checks; const ch = require(process.argv[2]); const m = require(process.argv[3]);"
      "const out = []; for (const e of ch.exercises) out.push(...C.checkExercise(e, m)); console.log(JSON.stringify(out));")
try:
    r = subprocess.run(['node', '-e', js, os.path.join(ROOT, 'build', 'noema-tools.cjs'), os.path.join(SUBJ, 'chapters', 'ch05.json'), mp], capture_output=True, text=True, timeout=60)
    probs = json.loads(r.stdout or 'null')
    ok(probs == [], 'checkExercise (the content checks) accepts every exercise' + ('' if probs == [] else f': {probs or r.stderr[:300]}'))
except FileNotFoundError: print('  ⏭  node not installed: the content checks skipped')

# 3. the command line
out = os.path.join(TMP, 'cli')
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'h5p_import.py'), *FIX, P('cp.h5p'), '--out', out, '--chapter', 'ch02', '--report', os.path.join(TMP, 'rep.json')], capture_output=True, text=True)
ok(r.returncode == 0 and os.path.isfile(os.path.join(out, 'chapters', 'ch02.json')) and '✗ cp.h5p' in r.stdout, 'the CLI writes the chapter and prints what it could not import')
ok(json.load(open(os.path.join(TMP, 'rep.json')))['unsupported'][0]['library'] == 'H5P.CoursePresentation', '--report writes the report as JSON')
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'h5p_import.py'), P('broken.h5p'), '--out', os.path.join(TMP, 'none')], capture_output=True, text=True)
ok(r.returncode == 2 and 'Traceback' not in r.stderr and not os.path.exists(os.path.join(TMP, 'none')), 'nothing importable → exit 2, no crash, nothing written')

shutil.rmtree(TMP, ignore_errors=True)
print(f'\n{n - fails}/{n} passed')
sys.exit(1 if fails else 0)
