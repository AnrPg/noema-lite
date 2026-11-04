#!/usr/bin/env python3
"""Builds the H5P test packages of tests/activities_h5p.js (docs/INTERACTIVE_H5P.md §7).

    python3 tests/fixtures/h5p/build_fixtures.py      (network: h5p.org and cdn.jsdelivr.net; the results are committed)

* mc.h5p   — H5P.MultiChoice 1.16, our own question (CC0), libraries taken unchanged from the h5p.org export below (MIT).
* drag.h5p — H5P.DragQuestion 1.14 with text draggables, our own content (CC0), libraries from the h5p.org export (MIT).
* tf.h5p   — "Hello World" H5P.TrueFalse 1.6: test/h5p-test.h5p of h5p-standalone v3.8.2 (MIT repository), unchanged.
The editor-only libraries (H5PEditor.*) and the libraries no content uses are left out; everything else is byte for byte the
upstream file. The h5p.org examples themselves are "license U" (undisclosed) and are therefore NOT committed: only their MIT
libraries are reused. Pure stdlib; the zip is deterministic (fixed dates)."""
import hashlib, io, json, os, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = {
    'mc': ('https://h5p.org/sites/default/files/h5p/exports/multiple-choice-713.h5p', '1c60785f1e9b6630b30d4e9bcc4b7ec1c8976f05bf50c41ddbb25e59fd2c8fdb'),
    'drag': ('https://h5p.org/sites/default/files/h5p/exports/drag-and-drop-712.h5p', '7d1c8879daf6f76c23fd66788ff767ac79dbab3d5bf723c8a1578630d8661f4a'),
    'tf': ('https://cdn.jsdelivr.net/gh/tunapanda/h5p-standalone@v3.8.2/test/h5p-test.h5p', 'd6bf9b62b87c2d127964d99a9ce1570bb93b8dd7c1deafff46d6282cc26b28a7'),
}


def get(name):
    url, want = SRC[name]
    cache = os.environ.get('H5P_CACHE')
    p = os.path.join(cache, os.path.basename(url)) if cache else None
    data = open(p, 'rb').read() if p and os.path.exists(p) else urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != want: sys.exit(f'✗ sha256 mismatch: {url}')
    return zipfile.ZipFile(io.BytesIO(data))


def deps_of(z, lib_dirs):
    """the main library's preloaded dependencies, transitively (library folder names)"""
    folders = {}
    for n in z.namelist():
        top = n.split('/')[0]
        if '/' in n and n.endswith('/library.json') and n.count('/') == 1:
            lj = json.loads(z.read(n)); folders[(lj['machineName'], lj['majorVersion'], lj['minorVersion'])] = (top, lj)
    out, todo = [], list(lib_dirs)
    while todo:
        key = todo.pop()
        if key not in folders: sys.exit(f'✗ missing library {key}')
        top, lj = folders[key]
        if top in [o[0] for o in out]: continue
        out.append((top, lj))
        todo += [(d['machineName'], int(d['majorVersion']), int(d['minorVersion'])) for d in lj.get('preloadedDependencies', [])]
    return out


def write(name, z, main, content, title, extra=()):
    libs = deps_of(z, [main, *extra])
    h5p = {'title': title, 'language': 'en', 'mainLibrary': main[0], 'embedTypes': ['iframe'], 'license': 'CC0 1.0', 'authors': [{'name': 'noema-lite tests', 'role': 'Author'}],
           'defaultLanguage': 'en', 'preloadedDependencies': [{'machineName': lj['machineName'], 'majorVersion': str(lj['majorVersion']), 'minorVersion': str(lj['minorVersion'])} for _, lj in reversed(libs)]}
    files = {'h5p.json': json.dumps(h5p, indent=1).encode(), 'content/content.json': json.dumps(content, ensure_ascii=False, indent=1).encode()}
    for top, _ in libs:
        for n in z.namelist():
            if n.startswith(top + '/') and not n.endswith('/'): files[n] = z.read(n)
    out = os.path.join(HERE, name + '.h5p')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as w:
        for n in sorted(files): w.writestr(zipfile.ZipInfo(n, (2026, 11, 4, 0, 0, 0)), files[n], zipfile.ZIP_DEFLATED)
    print(f'✓ {name}.h5p  {os.path.getsize(out) // 1024} KB  ' + ', '.join(f"{lj['machineName']} {lj['majorVersion']}.{lj['minorVersion']}.{lj['patchVersion']}" for _, lj in libs))


def main():
    mc = get('mc'); mcc = json.loads(mc.read('content/content.json'))
    mcc.pop('media', None)
    mcc['question'] = '<p>Which planet is the largest in the Solar System?</p>\n'
    mcc['answers'] = [{'correct': True, 'text': '<div>Jupiter</div>\n', 'tipsAndFeedback': {'tip': '', 'chosenFeedback': '', 'notChosenFeedback': ''}},
                      {'correct': False, 'text': '<div>Mars</div>\n', 'tipsAndFeedback': {'tip': '', 'chosenFeedback': '', 'notChosenFeedback': ''}},
                      {'correct': False, 'text': '<div>Venus</div>\n', 'tipsAndFeedback': {'tip': '', 'chosenFeedback': '', 'notChosenFeedback': ''}}]
    mcc['behaviour']['randomAnswers'] = False
    mcc['overallFeedback'] = [{'from': 0, 'to': 99, 'feedback': 'Not yet.'}, {'from': 100, 'to': 100, 'feedback': 'Correct!'}]
    write('mc', mc, ('H5P.MultiChoice', 1, 16), mcc, 'Largest planet')

    dq = get('drag'); dqc = json.loads(dq.read('content/content.json'))
    dqc['question']['settings'] = {'size': {'width': 620, 'height': 310}}
    txt = lambda t, sid: {'library': 'H5P.AdvancedText 1.1', 'params': {'text': f'<p>{t}</p>\n'}, 'subContentId': sid, 'metadata': {'contentType': 'Text', 'license': 'CC0 1.0', 'title': t}}
    dqc['question']['task'] = {
        'elements': [{'type': txt('Mercury', 'e0'), 'x': 2, 'y': 10, 'width': 8, 'height': 2, 'dropZones': ['0', '1'], 'backgroundOpacity': 100, 'multiple': False},
                     {'type': txt('Neptune', 'e1'), 'x': 2, 'y': 45, 'width': 8, 'height': 2, 'dropZones': ['0', '1'], 'backgroundOpacity': 100, 'multiple': False}],
        'dropZones': [{'x': 35, 'y': 5, 'width': 11, 'height': 12, 'correctElements': ['0'], 'showLabel': True, 'backgroundOpacity': 30, 'label': '<div>Inner planets</div>', 'single': False, 'autoAlign': True, 'tipsAndFeedback': {'tip': '', 'feedbackOnCorrect': '', 'feedbackOnIncorrect': ''}},
                      {'x': 67, 'y': 5, 'width': 11, 'height': 12, 'correctElements': ['1'], 'showLabel': True, 'backgroundOpacity': 30, 'label': '<div>Outer planets</div>', 'single': False, 'autoAlign': True, 'tipsAndFeedback': {'tip': '', 'feedbackOnCorrect': '', 'feedbackOnIncorrect': ''}}]}
    dqc['behaviour']['enableFullScreen'] = False
    write('drag', dq, ('H5P.DragQuestion', 1, 14), dqc, 'Inner and outer planets', extra=[('H5P.AdvancedText', 1, 1)])

    tf = get('tf')
    with open(os.path.join(HERE, 'tf.h5p'), 'wb') as f: f.write(open(os.environ['H5P_CACHE'] + '/h5p-test.h5p', 'rb').read() if os.environ.get('H5P_CACHE') and os.path.exists(os.environ['H5P_CACHE'] + '/h5p-test.h5p') else urllib.request.urlopen(SRC['tf'][0], timeout=60).read())
    print(f"✓ tf.h5p  {os.path.getsize(os.path.join(HERE, 'tf.h5p')) // 1024} KB  (h5p-standalone v3.8.2 test/h5p-test.h5p, unchanged)")


if __name__ == '__main__':
    main()
