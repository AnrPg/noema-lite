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

A whole language as ONE file — the language package (noema.langpack/v1, docs/LANGUAGES.md §10.2):
  python3 tools/lang_course.py package <course-dir> <code> [-o <file>]
        → the language <code> of the course folder as a package (language.json, lexicon, grammar, bank, script modules,
          its catalogue of phenomena, its typological profile when the library has none, the other languages' seeAlso
          entries that point to it, and the checks). Refused while validate_lang.py --strict --lang <code> has errors
          or the reference check (from the cache, offline) disagrees.
  python3 tools/lang_course.py unpack <course file> <out-dir> --package <pkg.json> [--patch <patch.json>]
        → the course as a folder WITH the package's language added (to check it again or extend it)
  unpack … --world  also puts the shared typology and catalogues next to the course (<out-dir>/_typology, _phenomena),
        where a new language's profile and catalogue are written
  python3 tools/lang_course.py plan <course-dir> <code>
        → the playbook's batches for this course and language (F1…, V1…, K1… with their node ids)

Task ids: core · node:<node>:<code> · function:<fn>:<code> · compare:<fn> · refill:<fn>:<code>:<n>
"""
import hashlib, json, os, re, shutil, sys, glob
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MANIFEST = '.unpacked.json'
PACK = 'noema.langpack/v1'
TOOLS = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(os.path.dirname(TOOLS), 'library', 'languages')   # the repository's (or the toolkit's) _typology and _phenomena


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


def unpack(src, out, patch=None, package=None, world=False):
    data = read_course_file(src)
    if package:
        pkg = rj(package)
        if pkg.get('format') != PACK: sys.exit(f'{package}: not a language package ({PACK})')
        if pkg.get('course') != data['course']['id']: sys.exit(f'{package}: made for the course “{pkg.get("course")}”, not “{data["course"]["id"]}”')
        add_package(data, pkg)
        world = True
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
        if L.get('bank'): wj(os.path.join(b, 'bank', 'course.json'), {'sentences': L['bank'], **({'fieldExemptions': L['fieldExemptions']} if L.get('fieldExemptions') else {})})
        for k in ('script', 'chars'):   # the script modules (§4.9)
            if L.get(k): wj(os.path.join(b, k + '.json'), L[k])
        man['bank'][code] = [s['id'] for s in L.get('bank') or []]
    wj(os.path.join(root, MANIFEST), man)
    if world: put_world(out, data.get('_package'))
    print(root)
    return root


def add_package(data, pkg):
    """The language of a package into a loaded course (the Python twin of langcore.langApplyPackage)."""
    code = pkg['code']; c = data['course']
    if code in c.get('languages', []): sys.exit(f'{code} is already a language of the course')
    c['languages'] = list(c.get('languages', [])) + [code]
    c.setdefault('defaults', {}).setdefault('depth', {})[code] = 3
    data.setdefault('langs', {})[code] = {'language': pkg['language'], 'lexicon': pkg.get('lexicon') or {}, 'grammar': pkg.get('grammar') or {}, 'bank': pkg.get('bank') or [],
                                         **({'script': pkg['script']} if pkg.get('script') else {}), **({'chars': pkg['chars']} if pkg.get('chars') else {}),
                                         **({'fieldExemptions': pkg['fieldExemptions']} if pkg.get('fieldExemptions') else {})}
    for L, fns in (pkg.get('seeAlso') or {}).items():
        G = (data['langs'].get(L) or {}).get('grammar') or {}
        for fid, adds in fns.items():
            g = G.get(fid)
            if not g: continue
            have = {(x.get('lang'), x.get('fn')) for x in g.get('seeAlso') or []}
            g['seeAlso'] = (g.get('seeAlso') or []) + [x for x in adds if (x.get('lang'), x.get('fn')) not in have]
    data['_package'] = pkg


def put_world(out, pkg=None):
    """The shared typology and catalogues next to the unpacked course (out/_typology, out/_phenomena): validate_lang.py and
    lang_phenomena.py --root read them there; a new language's profile and catalogue are written there."""
    for d in ('_typology', '_phenomena'):
        os.makedirs(os.path.join(out, d), exist_ok=True)
        for f in sorted(glob.glob(os.path.join(SHARED, d, '*.json'))):
            dst = os.path.join(out, d, os.path.basename(f))
            if not os.path.exists(dst): shutil.copy(f, dst)
    if pkg:
        code = pkg['code']
        if pkg.get('phenomena'): wj(os.path.join(out, '_phenomena', code + '.json'), pkg['phenomena'])
        tl = os.path.join(out, '_typology', 'languages.json'); t = rj(tl)
        if pkg.get('typology') and not any(x.get('code') == code for x in t.get('languages', [])):
            t['languages'].append(pkg['typology']); wj(tl, t)


def plan(root, code):
    """The playbook's batches for this course and language (the Python twin of langcore.langPackagePlan)."""
    J = lambda rel: rj(os.path.join(root, rel)) if os.path.exists(os.path.join(root, rel)) else None
    course = J('course.json'); nodes = J('core/nodes.json')['nodes']; by = {n['id']: n for n in nodes}
    lj = J(f'lang/{code}/language.json') or {}; typ = lj.get('typology') if isinstance(lj.get('typology'), str) else None
    if not typ:
        for d in (os.path.join(os.path.dirname(os.path.abspath(root)), '_typology'), os.path.join(SHARED, '_typology')):
            if os.path.exists(os.path.join(d, 'languages.json')):
                typ = next((x.get('typology') for x in rj(os.path.join(d, 'languages.json')).get('languages', []) if x.get('code') == code), None)
                if typ: break
    order, seen = [], set()
    def visit(x):
        if x in seen or x not in by: return
        seen.add(x)
        for q in by[x].get('prereqs') or []: visit(q)
        order.append(x)
    for n in nodes: visit(n['id'])
    draft = set(course.get('draft') or [])
    ok = lambda n: (not n.get('langs') or code in n['langs']) and (not n.get('path') or not typ or n['path'] == typ)
    live = [by[i] for i in order if ok(by[i]) and i not in draft]
    F = [('F1', ['fd.00', 'fd.01', 'fd.02', 'fd.03', 'fd.04']), ('F2', ['fd.05', 'fd.06']), ('F3', ['fd.07', 'fd.08', 'fd.09']), ('F4', ['fd.10', 'fd.11', 'fd.12']), ('F5', ['fd.13', 'fd.14', 'fd.15']), ('F6', ['fd.16', 'fd.17', 'fd.18'])]
    found = lambda n: n.get('kind') == 'lesson' and n.get('stage') not in ('core', 'advanced')
    lessons = [n['id'] for n in live if found(n)]; used = set(); out = []
    for b, ids in F:
        got = [i for i in ids if i in lessons]
        if got: out.append((b, 'foundations', got)); used |= set(got)
    rest = [i for i in lessons if i not in used]; used |= set(rest)
    for i in range(0, len(rest), 3): out.append((f'F{sum(1 for x in out if x[1] == "foundations") + 1}', 'foundations', rest[i:i + 3]))
    fields = {}
    for n in live:
        if n.get('kind') == 'field': fields.setdefault(n.get('field'), {}).setdefault(n.get('tier') or 1, []).append(n['id'])
    v = 0
    for f, tiers in fields.items():
        for t in sorted(tiers): v += 1; out.append((f'V{v}', 'field', tiers[t]))
    core = [n['id'] for n in live if n['id'] not in used and n.get('kind') != 'field' and not found(n)]
    for i in range(0, len(core), 4): out.append((f'K{i // 4 + 1}', 'core', core[i:i + 4]))
    print(f'# {course["id"]} · {code}' + (f' ({typ})' if typ else ' (type not known yet: nodes of one type\'s path are listed)'))
    for b, kind, ids in out: print(f'{b:<4} {kind:<12} {",".join(ids):<40} {"; ".join(by[i]["title"] for i in ids)}')
    if draft: print('draft (written later, when the other languages have them): ' + ', '.join(i for i in order if i in draft))
    return out


def package(root, code, out_file=None):
    """The language <code> of a course folder → one file (noema.langpack/v1)."""
    root = root.rstrip('/'); J = lambda rel: rj(os.path.join(root, rel)) if os.path.exists(os.path.join(root, rel)) else None
    course = J('course.json')
    if not course or code not in (course.get('languages') or []): sys.exit(f'{code} is not a language of the course in {root}')
    from validate_lang import validate, phenomena_path, world
    v = validate(root, code, strict=True)
    if v.errors:
        print('\n'.join('❌ ' + e for e in v.errors[:60]) + (f'\n… and {len(v.errors) - 60} more' if len(v.errors) > 60 else ''))
        sys.exit(f'\n❌ not packaged: validate_lang.py --strict --lang {code} has {len(v.errors)} error(s) — fix them first')
    import lang_refcheck
    rep = lang_refcheck.run(root, code, offline=True)
    bad = {k: r['problems'] for k, r in rep.items() if r['problems']}
    if bad:
        for k, ps in list(bad.items())[:30]: print(f'❌ {k}: ' + '; '.join(ps))
        sys.exit(f'\n❌ not packaged: {len(bad)} word(s) disagree with Wiktionary (lang_refcheck.py) — fix them or explain them in ref.override')
    b = os.path.join(root, 'lang', code)
    lj = J(f'lang/{code}/language.json'); nodes = J('core/nodes.json')['nodes']
    fns = [os.path.basename(f)[:-5] for f in sorted(glob.glob(os.path.join(root, 'core', 'functions', '*.json')))]
    lexicon = {n['id']: J(f'lang/{code}/lexicon/{n["id"]}.json') for n in nodes if J(f'lang/{code}/lexicon/{n["id"]}.json')}
    grammar = {f: J(f'lang/{code}/grammar/{f}.json') for f in fns if J(f'lang/{code}/grammar/{f}.json')}
    bank = [x for f in sorted(glob.glob(os.path.join(b, 'bank', '*.json'))) for x in rj(f).get('sentences') or []]
    exempt = [x for f in sorted(glob.glob(os.path.join(b, 'bank', '*.json'))) for x in rj(f).get('fieldExemptions') or []]   # D19: a field that cannot show a node says why
    pp = phenomena_path(root, code); phen = rj(pp) if pp else None
    _, profiles, _, _ = world(root)
    lib = rj(os.path.join(SHARED, '_typology', 'languages.json')) if os.path.exists(os.path.join(SHARED, '_typology', 'languages.json')) else {'languages': []}
    in_lib = any(x.get('code') == code for x in lib.get('languages') or [])
    see = {}
    for L in course['languages']:
        if L == code: continue
        for f in fns:
            g = J(f'lang/{L}/grammar/{f}.json')
            adds = [x for x in (g or {}).get('seeAlso') or [] if x.get('lang') == code]
            if adds: see.setdefault(L, {})[f] = adds
    import subprocess
    here = os.path.dirname(os.path.abspath(root))   # the catalogue next to the course (the skill's work/lang), else the repository's
    pr = subprocess.run([sys.executable, os.path.join(TOOLS, 'lang_phenomena.py'), *(['--root', here] if os.path.exists(os.path.join(here, '_phenomena', code + '.json')) else []), '--lang', code, '--json'], capture_output=True, text=True)
    try: ph = json.loads(pr.stdout[pr.stdout.index('{'):]).get(code) or {}
    except (ValueError, KeyError): ph = {}
    st = ph.get('status') or {}
    pkg = {'format': PACK, 'course': course['id'], 'code': code, 'name': lj.get('name') or code, **({'nativeName': lj['nativeName']} if lj.get('nativeName') else {}),
           **({'flag': lj['flag']} if lj.get('flag') else {}), 'built': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'language': lj, 'lexicon': lexicon, 'grammar': grammar, 'bank': bank, **({'fieldExemptions': exempt} if exempt else {}),
           **({'script': J(f'lang/{code}/script.json')} if J(f'lang/{code}/script.json') else {}), **({'chars': J(f'lang/{code}/chars.json')} if J(f'lang/{code}/chars.json') else {}),
           'phenomena': phen, **({'typology': profiles[code]} if code in profiles and not in_lib else {}), **({'seeAlso': see} if see else {}),
           'checks': {'validator': {'errors': 0, 'warnings': len(v.warns), 'strict': True},
                      'refcheck': {'words': len(rep), 'problems': 0, 'unverified': sum(1 for r in rep.values() if r['unverified']), 'offline': True},
                      'phenomena': {'phenomena': ph.get('phenomena', 0), 'covered': st.get('covered', 0), 'partial': st.get('partial', 0), 'missing': st.get('missing', 0), 'errors': len(ph.get('errors') or [])}}}
    if not phen: sys.exit(f'❌ not packaged: no catalogue of phenomena for {code} (_phenomena/{code}.json next to the course)')
    out_file = out_file or f'{course["id"]}.lang-{code}.json'
    with open(out_file, 'w', encoding='utf-8') as f: json.dump(pkg, f, ensure_ascii=False, separators=(',', ':'))
    words = sum(len(x.get('lexemes') or []) for x in lexicon.values())
    print(f'✅ {out_file}: {pkg["name"]} ({code}) for {course["id"]} — {words} words in {len(lexicon)} nodes, {len(grammar)} grammar pages, {len(bank)} sentences, '
          f'{len(phen.get("phenomena") or [])} phenomena{", its typological profile" if "typology" in pkg else ""}{f", seeAlso on {sum(len(x) for x in see.values())} pages of other languages" if see else ""} · {os.path.getsize(out_file) // 1024} KB')
    return out_file


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
    opt = lambda k: a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else None
    if len(a) >= 3 and a[0] == 'unpack': unpack(a[1], a[2], opt('--patch'), opt('--package'), '--world' in a)
    elif len(a) >= 3 and a[0] == 'package': package(a[1], a[2], opt('-o'))
    elif len(a) == 3 and a[0] == 'plan': plan(a[1], a[2])
    elif len(a) == 4 and a[0] == 'apply': apply(a[1], a[2], a[3])
    elif len(a) == 3 and a[0] == 'answer': answer(a[1], a[2])
    else: print(__doc__); sys.exit(2)
