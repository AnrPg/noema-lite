#!/usr/bin/env python3
"""A language course as one file ↔ as a folder, for the tasks Claude answers (docs/LANGUAGES.md §10.1).

  python3 tools/lang_course.py unpack <course.json | course.pack.js> <out-dir> [--patch <patch.json>]
        → <out-dir>/<course id>/ in the layout of §4.1 (course.json, core/…, lang/<code>/…), ready for
          tools/validate_lang.py and tools/lang_refcheck.py. A built library course (course.pack.js) takes its word
          profiles from course.profiles.js next to it; --patch lays the learner's private patch over it.
  python3 tools/lang_course.py apply <course-dir> <answer.json> <task id>
        → writes an answer into the folder (to validate it there)
  python3 tools/lang_course.py answer <course-dir> <task id>
        → prints the answer of the task, read back from the folder (what changed since unpack)

Task ids: core · node:<node>:<code> · function:<fn>:<code> · compare:<fn> · refill:<fn>:<code>:<n>
"""
import hashlib, json, os, re, sys

MANIFEST = '.unpacked.json'


def rj(p):
    with open(p, encoding='utf-8') as f: return json.load(f)


def wj(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, indent=1); f.write('\n')


def h(obj): return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:16]


def read_course_file(path):
    """course.json (noema.langdata/v1, an account course) or course.pack.js (a built library course) → data"""
    raw = open(path, encoding='utf-8').read()
    if path.endswith('.js'):
        body = raw[raw.index('] = ') + 4:].rstrip().rstrip(';')
        data = json.loads(body)
        prof = os.path.join(os.path.dirname(os.path.abspath(path)), 'course.profiles.js')
        if os.path.exists(prof):
            praw = open(prof, encoding='utf-8').read()
            profiles = json.loads(praw[praw.index('] = ') + 4:].rstrip().rstrip(';'))
            for L in data.get('langs', {}).values():
                for lx in L.get('lexicon', {}).values():
                    for x in lx.get('lexemes', []):
                        if x['id'] in profiles: x['profile'] = profiles[x['id']]
        return data
    return json.loads(raw)


def safe(s): return re.sub(r'[^A-Za-z0-9._-]+', '_', s)


def unpack(src, out, patch=None):
    data = read_course_file(src)
    course = dict(data['course']); cid = course['id']
    root = os.path.join(out, cid)
    wj(os.path.join(root, 'course.json'), course)
    if data.get('typology'): wj(os.path.join(root, 'core', 'typology.json'), data['typology'])
    for f in data.get('fields') or []: wj(os.path.join(root, 'core', 'fields', safe(f['field']) + '.json'), f)
    wj(os.path.join(root, 'core', 'nodes.json'), {'nodes': data.get('nodes') or []})
    for f in data.get('functions') or []: wj(os.path.join(root, 'core', 'functions', f['id'] + '.json'), f)
    wj(os.path.join(root, 'core', 'frames.json'), {'frames': data.get('frames') or []})
    for fid, c in (data.get('compare') or {}).items(): wj(os.path.join(root, 'compare', fid + '.json'), c)
    if data.get('media'): wj(os.path.join(root, 'core', 'media', 'media.json'), {'items': [{'id': k, **v} for k, v in data['media'].items()]})   # the pictures' provenance (the files stay on the website)
    if patch:
        for code, P in (rj(patch).get('langs') or {}).items():
            L = data['langs'].get(code)
            if L is None: continue
            have = {s['id'] for s in L.get('bank') or []}
            L['bank'] = (L.get('bank') or []) + [s for s in P.get('bank') or [] if s['id'] not in have]
    man = {'course': cid, 'bank': {}, 'grammar': {}, 'language': {}, 'lexicon': {}, 'compare': {k: h(v) for k, v in (data.get('compare') or {}).items()}}
    for code, L in (data.get('langs') or {}).items():
        b = os.path.join(root, 'lang', code)
        if L.get('language'): wj(os.path.join(b, 'language.json'), L['language']); man['language'][code] = h(L['language'])
        for nid, lx in (L.get('lexicon') or {}).items(): wj(os.path.join(b, 'lexicon', nid + '.json'), lx); man['lexicon'][f'{code}/{nid}'] = h(lx)
        for fid, g in (L.get('grammar') or {}).items(): wj(os.path.join(b, 'grammar', fid + '.json'), g); man['grammar'][f'{code}/{fid}'] = h(g)
        if L.get('bank'): wj(os.path.join(b, 'bank', 'course.json'), {'sentences': L['bank']})
        man['bank'][code] = [s['id'] for s in L.get('bank') or []]
    wj(os.path.join(root, MANIFEST), man)
    print(root)
    return root


def task_parts(tid):
    p = tid.split(':')
    if p[0] == 'core': return {'kind': 'core'}
    if p[0] == 'node' and len(p) == 3: return {'kind': 'node', 'node': p[1], 'lang': p[2]}
    if p[0] == 'function' and len(p) == 3: return {'kind': 'function', 'fn': p[1], 'lang': p[2]}
    if p[0] == 'compare' and len(p) == 2: return {'kind': 'compare', 'fn': p[1]}
    if p[0] == 'refill' and len(p) == 4: return {'kind': 'refill', 'fn': p[1], 'lang': p[2]}
    sys.exit(f'unknown task id “{tid}” (core · node:<node>:<code> · function:<fn>:<code> · compare:<fn> · refill:<fn>:<code>:<n>)')


def apply(root, answer, tid):
    t = task_parts(tid); a = rj(answer)
    tag = safe(tid.replace(':', '.'))
    if t['kind'] == 'core':
        for f in a.get('fields') or []: wj(os.path.join(root, 'core', 'fields', safe(f['field']) + '.json'), f)
        wj(os.path.join(root, 'core', 'nodes.json'), {'nodes': a.get('nodes') or []})
        for f in a.get('functions') or []: wj(os.path.join(root, 'core', 'functions', f['id'] + '.json'), f)
        wj(os.path.join(root, 'core', 'frames.json'), {'frames': a.get('frames') or []})
        if a.get('typology'): wj(os.path.join(root, 'core', 'typology.json'), a['typology'])
        for code, lj in (a.get('languages') or {}).items(): wj(os.path.join(root, 'lang', code, 'language.json'), lj)
    elif t['kind'] == 'compare':
        wj(os.path.join(root, 'compare', t['fn'] + '.json'), a['compare'])
    else:
        b = os.path.join(root, 'lang', t['lang'])
        if t['kind'] == 'node': wj(os.path.join(b, 'lexicon', t['node'] + '.json'), a['lexicon'])
        if t['kind'] == 'function': wj(os.path.join(b, 'grammar', t['fn'] + '.json'), a['grammar'])
        for fid, g in (a.get('grammar') or {}).items() if t['kind'] == 'node' else []: wj(os.path.join(b, 'grammar', fid + '.json'), g)
        if a.get('bank'): wj(os.path.join(b, 'bank', tag + '.json'), {'sentences': a['bank']})
    print(f'{tid} written into {root}')


def new_sentences(root, code, man):
    old = set(man['bank'].get(code) or []); out = []
    d = os.path.join(root, 'lang', code, 'bank')
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f.endswith('.json'): out += [s for s in rj(os.path.join(d, f)).get('sentences') or [] if s.get('id') not in old]
    return out


def answer(root, tid):
    t = task_parts(tid); man = rj(os.path.join(root, MANIFEST))
    J = lambda *p: rj(os.path.join(root, *p)) if os.path.exists(os.path.join(root, *p)) else None
    if t['kind'] == 'core':
        ls = lambda d: sorted(f for f in os.listdir(os.path.join(root, d)) if f.endswith('.json')) if os.path.isdir(os.path.join(root, d)) else []
        a = {'fields': [J('core', 'fields', f) for f in ls('core/fields')], 'nodes': (J('core', 'nodes.json') or {}).get('nodes', []),
             'functions': [J('core', 'functions', f) for f in ls('core/functions')], 'frames': (J('core', 'frames.json') or {}).get('frames', [])}
        if J('core', 'typology.json'): a['typology'] = J('core', 'typology.json')
        langs = {}
        for code in (J('course.json') or {}).get('languages') or []:
            lj = J('lang', code, 'language.json')
            if lj and man['language'].get(code) != h(lj): langs[code] = lj
        if langs: a['languages'] = langs
    elif t['kind'] == 'compare':
        a = {'compare': J('compare', t['fn'] + '.json')}
    elif t['kind'] == 'node':
        code = t['lang']; a = {'lexicon': J('lang', code, 'lexicon', t['node'] + '.json') or {'lexemes': []}}
        node = next((n for n in (J('core', 'nodes.json') or {}).get('nodes', []) if n['id'] == t['node']), {})
        typ = (J('lang', code, 'language.json') or {}).get('typology')
        f = node.get('functions') or []
        fns = list(f) if isinstance(f, list) else [x for k in ('*', typ, code) for x in f.get(k) or []]
        gram = {}
        for fid in fns:
            g = J('lang', code, 'grammar', fid + '.json')
            if g and man['grammar'].get(f'{code}/{fid}') != h(g): gram[fid] = g
        if gram: a['grammar'] = gram
        b = new_sentences(root, code, man)
        if b: a['bank'] = b
    elif t['kind'] == 'function':
        a = {'grammar': J('lang', t['lang'], 'grammar', t['fn'] + '.json')}
        b = new_sentences(root, t['lang'], man)
        if b: a['bank'] = b
    else:
        a = {'bank': new_sentences(root, t['lang'], man)}
    print(json.dumps(a, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) >= 3 and a[0] == 'unpack': unpack(a[1], a[2], a[a.index('--patch') + 1] if '--patch' in a else None)
    elif len(a) == 4 and a[0] == 'apply': apply(a[1], a[2], a[3])
    elif len(a) == 3 and a[0] == 'answer': answer(a[1], a[2])
    else: print(__doc__); sys.exit(2)
