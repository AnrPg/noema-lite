#!/usr/bin/env python3
"""noema-lite build tool (Python stdlib + Node: `npm ci` once).

Every file it writes is GENERATED and never committed (.gitignore, "generated"): build before you use the repo (npm run dev does).

  python3 tools/build.py                 # the TypeScript bundles (npm run build → build/), validate + build engine, every subject pack and the registry
  python3 tools/build.py engine          # only the bundles and the engine files (engine.js/.css, langui, UI catalogs, authoring.js, the author's schemas)
  python3 tools/build.py site            # + dist/site/  (what the website serves: no PDFs, no private packs, no backups)
  python3 tools/build.py skill           # + dist/noema-pack-builder.zip  (the Claude skill users add to their own Claude)
                                         #   + dist/noema-language-builder.zip  (a whole language in one prompt, docs/LANGUAGES.md §10.2)
  python3 tools/build.py bundle [--subjects a,b] [--with-local-config]
                                         # + dist/noema-lite.html  (one self-contained file, e.g. for phone/offline)
  python3 tools/build.py --no-validate   # skip validation (faster)
  python3 tools/build.py --no-esbuild    # keep build/ as it is (npm run dev rebuilds it in watch mode)
"""
import os, sys, glob, json, subprocess, tempfile, shutil, re, zipfile, base64, io, hashlib
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import ROOT, LIB, ACC, rj, wj, wt, now_iso, subject_dirs, load_subject, load_media, content_hash, load_translations, pack_i18n, translation_file
from bridge import build_library as build_bridges
import activities as ACTS   # interactive activities (docs/INTERACTIVE.md)

ENGINE = os.path.join(ROOT, 'engine')
args = sys.argv[1:]
VALIDATE = '--no-validate' not in args
BUILD = os.path.join(ROOT, 'build')   # the TypeScript bundles (tools/esbuild.mjs; src/composition/*.ts)
BUILD_MANIFEST = {'entries': {}, 'hash': ''}

def run_esbuild():
    """npm run build: every bundle of src/ into build/ (tools/esbuild.mjs: the entries, their size budgets) → its manifest"""
    global BUILD_MANIFEST
    if '--no-esbuild' not in args:
        if not os.path.isdir(os.path.join(ROOT, 'node_modules', 'esbuild')): sys.exit('✗ the TypeScript build needs its tools: run  npm ci  once (Node 22)')
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'esbuild.mjs')], cwd=ROOT)
        if r.returncode != 0: sys.exit('✗ npm run build (tools/esbuild.mjs) failed')
    mp = os.path.join(BUILD, 'manifest.json')
    if not os.path.exists(mp): sys.exit('✗ build/manifest.json is missing: run  npm run build')
    BUILD_MANIFEST = rj(mp)

def bundle_file(name):
    """the built file of one bundle (build/<file>), or None when that entry's source is not in the tree yet"""
    e = BUILD_MANIFEST['entries'].get(name)
    return os.path.join(BUILD, e['file']) if e else None

def bundle_text(name):
    """a bundle's code for an inline <script> (its source-map comment dropped: the one file has no maps beside it)"""
    return re.sub(r'\n//# sourceMappingURL=\S+\s*$', '\n', open(bundle_file(name), encoding='utf-8').read())

# index.html's <script src="build/<name>.js"> of a bundle that is not built (its source is not in the tree yet) is left out of the site
BUNDLE_TAG = re.compile(r'[ \t]*<script src="build/([\w.-]+)\.js"[^>]*></script>[^\n]*\n?')
def drop_missing_bundles(html):
    return BUNDLE_TAG.sub(lambda m: m.group(0) if m.group(1) in BUILD_MANIFEST['entries'] else '', html)

AUTHOR_SCHEMAS = ['noema.sim-spec.v1.schema.json', 'noema.circuit.v1.schema.json', 'noema.activities.v1.schema.json']
def author_schemas_js():
    # the activity author's copy of the JSON Schemas (a file:// page cannot fetch them): engine/activity_author_schemas.js
    sch = {f: rj(os.path.join(ROOT, 'src', 'contracts', 'schemas', f)) for f in AUTHOR_SCHEMAS}
    # and the reference activity of every engine of the library (tools/activities_examples/<ref>/: its entry, spec and words): the author's
    # "Start from the reference activity" (docs/activities-dev/authoring_ui.md)
    refs, ex = {}, os.path.join(ROOT, 'tools', 'activities_examples')
    for d in sorted(os.listdir(ex)):
        p = os.path.join(ex, d)
        if not (os.path.isfile(os.path.join(p, 'spec.json')) and os.path.isfile(os.path.join(p, 'activity.json'))): continue
        spec = rj(os.path.join(p, 'spec.json'))
        parts = spec.get('parts') if isinstance(spec, dict) else None   # a spec with parts (docs/INTERACTIVE.md §12.8): the author's kind "Several engines"
        if not (isinstance(spec, dict) and (spec.get('engine') in ACTS.LIB or (isinstance(parts, list) and parts))): continue
        refs[d] = {'item': rj(os.path.join(p, 'activity.json')), 'spec': spec,
                   'strings': {f.split('.')[1]: rj(os.path.join(p, f)) for f in sorted(os.listdir(p)) if re.fullmatch(r'strings\.[\w-]+\.json', f)}}
    return ('/* noema-lite — the JSON Schemas of the activity author (engine/activity_author.js). GENERATED from src/contracts/schemas/ by\n'
            '   tools/build.py (tests/activity_author.js checks that it is up to date). Do not edit. Schema data, not words a learner reads: */\n/* i18n-ignore-start */\n'
            '(function (root) { root.NoemaActivitySchemas = ' + json.dumps(sch, ensure_ascii=False, separators=(',', ':')) + ';\n'
            '  root.NoemaActivityRefs = ' + json.dumps(refs, ensure_ascii=False, separators=(',', ':')) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n/* i18n-ignore-end */\n')

_CONTRACTS_BUILT = False
def build_contracts():
    """The data contracts (src/contracts/schemas → engine/contracts.js, src/contracts/validate.ts and the types): generated,
    never committed (npm run contracts; it needs the packages of package.json: npm ci). Everything below checks with them."""
    global _CONTRACTS_BUILT
    if _CONTRACTS_BUILT: return   # once per run
    if not os.path.isdir(os.path.join(ROOT, 'node_modules', 'ajv')): sys.exit('build: the data contracts need the node packages first: npm ci')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'contracts.mjs')], check=True)
    _CONTRACTS_BUILT = True

def build_engine():
    wt(os.path.join(ENGINE, 'activity_author_schemas.js'), author_schemas_js())
    # the UI catalogs: i18n/<component>/<locale>.arb → engine/i18n/<locale>.js (docs/i18n.md)
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'i18n', 'build.js')], check=True)
    # the files the page loads on its own (PAGE_SRC: index.html and the bundle, before any subject) are NOT in engine.js again
    check_page_src()
    js = ''.join(f'\n/* ---- {os.path.basename(f)} ---- */\n' + open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(ENGINE, 'src', '*.js'))) if os.path.basename(f) not in PAGE_SRC)
    css = ''.join(f'\n/* ---- {os.path.basename(f)} ---- */\n' + open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(ENGINE, 'src', '*.css'))))
    wt(os.path.join(ENGINE, 'engine.js'), '/* noema-lite engine — GENERATED by tools/build.py from engine/src/*.js. Do not edit. */\n' + js)
    wt(os.path.join(ENGINE, 'engine.css'), '/* noema-lite engine styles — GENERATED from engine/src/*.css. Do not edit. */\n' + css)
    # the content contract for packs generated in the browser (engine/packgen.js)
    rd = lambda q: open(os.path.join(ROOT, q), encoding='utf-8').read()
    wt(os.path.join(ENGINE, 'authoring.js'), '/* GENERATED by tools/build.py from tools/CONTENT_SPEC.md + docs/VISUAL.md — do not edit */\nwindow.NOEMA_AUTHORING = '
       + json.dumps({'content': rd('tools/CONTENT_SPEC.md'), 'visual': rd('docs/VISUAL.md')}, ensure_ascii=False) + ';\n')
    print(f'engine: {len(js)//1024} KB js, {len(css)//1024} KB css')
    # the language courses' UI (docs/LANGUAGES.md §8): loaded instead of engine.js when a language course is open
    ljs = ''.join(f'\n/* ---- {os.path.basename(f)} ---- */\n' + open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(ENGINE, 'lang', '*.js'))))
    lcss = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(ENGINE, 'lang', '*.css'))))
    if ljs:
        wt(os.path.join(ENGINE, 'langui.js'), '/* noema-lite language-course UI — GENERATED by tools/build.py from engine/lang/*.js. Do not edit. */\n(function () {\n' + ljs + '\n})();\n')
        wt(os.path.join(ENGINE, 'langui.css'), '/* GENERATED from engine/lang/*.css. Do not edit. */\n' + lcss)

def validate(chapters, label, media=None, min_visual=0, sdir=None, translations=None, balance=()):
    if not VALIDATE: return True
    ok = True
    V = lambda *a: subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'validate.py'), *a], capture_output=True, text=True)
    def bad(what, r):
        nonlocal ok
        if r.returncode != 0: ok = False; print(f'  ✗ {label}/{what}:\n' + '\n'.join('    ' + l for l in r.stdout.splitlines() if l.startswith('ERROR')))
    with tempfile.TemporaryDirectory() as td:
        mp = os.path.join(td, '_media.json'); wj(mp, {k: {'w': v['w'], 'h': v['h'], 'regions': v.get('regions')} for k, v in (media or {}).items()})
        for c in chapters:
            p = os.path.join(td, c['id'] + '.json'); wj(p, c)
            bad(c['id'], V(p, '--media', mp, '--min-visual', str(min_visual), *balance))
        # a pack in several languages (CONTENT_SPEC.md): the metadata of subject.i18n, every translated chapter against its source
        if sdir and (translations or 'i18n' in rj(os.path.join(sdir, 'subject.json'))):
            bad('subject.json', V(os.path.join(sdir, 'subject.json'), '--subject', '--translations', ','.join(translations or {})))
        for loc, chs in (translations or {}).items():
            for c in chs:
                if not any(x['id'] == c.get('id') for x in chapters): ok = False; print(f'  ✗ {label}/translations/{loc}: {c.get("id")} is not a chapter of the subject'); continue
                p = os.path.join(td, f'{loc}.{c["id"]}.json'); wj(p, c)
                bad(f'translations/{loc}/{c["id"]}', V(p, '--media', mp, '--min-visual', str(min_visual), '--source', os.path.join(td, c['id'] + '.json')))
    return ok

def build_packs():
    metas = []; failed = []
    for sdir, owner in subject_dirs():
        meta, sources, chapters, report = load_subject(sdir)
        media, mrep = load_media(sdir)
        acts, arep = ACTS.load_activities(sdir); mrep += arep
        for m in mrep:
            if m.startswith('WARN'): print('  ' + m)
        per_pic = int((meta.get('authoring') or {}).get('minExercisesPerPicture', 0))
        if per_pic:   # docs/VISUAL.md §5: every picture carries several exercises
            from collections import Counter
            used = Counter(e.get('media') for c in chapters for e in c['exercises'] if e['type'].startswith('img_'))
            for m in media:   # (an activity's still picture, its fallback, needs no exercises)
                if used[m] < per_pic and m not in ACTS.fallback_media(acts): mrep.append(f'ERROR media {m}: used by {used[m]} exercise(s); every picture needs >= {per_pic} (authoring.minExercisesPerPicture)')
        errs = [r for r in report + mrep if r.startswith('ERROR')]
        if errs: print('\n'.join(errs)); failed.append(meta['id']); continue
        translations = load_translations(sdir, chapters)   # translations/<locale>/chNN.json (CONTENT_SPEC.md "Packs in several languages")
        auth = meta.get('authoring') or {}
        feats = ','.join(k for k, v in (meta.get('features') or {}).items() if v)
        if int(auth.get('rules', 0)) >= 2:   # the quality rules (tools/pack_rules.json "quality"): map/chNN.json + review/chNN.json go into the chapter
            for c in chapters:
                for k in ('map', 'review'):
                    f = os.path.join(sdir, k, c['id'] + '.json')
                    if os.path.exists(f): c[k] = rj(f)
            balance = ('--quality', 'error' if auth.get('by', 'claude') in ('claude', 'gemini') else 'warn', '--features', feats)
        else:   # older subjects: every exercise type, difficulty and focus tag >= minPerKind per chapter (pack_rules.json "rules")
            balance = ('--balance', str(auth['minPerKind']), '--features', feats) if auth.get('minPerKind') else ()
        if not validate(chapters, meta['id'], media, int(auth.get('minVisualPerChapter', 0)), sdir, translations, balance): failed.append(meta['id']); continue
        meta = dict(meta); meta['owner'] = owner
        counts = {'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'exercises': sum(len(c['exercises']) for c in chapters),
                  'playbooks': sum(len(c['debug']) for c in chapters), 'flashcards': sum(len(c['flashcards']) for c in chapters)}
        counts['visual'] = sum(1 for c in chapters for e in c['exercises'] if e['type'].startswith('img_')); counts['media'] = len(media)
        pack = {'format': 'noema-pack', 'v': 3, 'subject': meta, 'sources': sources, 'chapters': chapters, 'media': media, 'counts': counts, 'builtAt': now_iso()}
        if acts and acts['items']: pack['activities'] = {'format': ACTS.FORMAT, 'items': acts['items']}; pack['requires'] = ACTS.requires(acts); counts['activities'] = len(acts['items'])
        ae, aw = ACTS.check_activities(pack, list(translations))
        for w in aw: print(f'  WARN {meta["id"]}: activities: {w}')
        he, hw = ACTS.check_h5p_packages(pack, lambda a: open(os.path.join(sdir, *a['entry'].split('/')), 'rb').read() if os.path.isfile(os.path.join(sdir, *str(a.get('entry') or '').split('/'))) else None)   # h5p@1: the .h5p files beside the pack
        for w in hw: print(f'  WARN {meta["id"]}: activities: {w}')
        ae += he
        if ae: print('\n'.join(f'ERROR {meta["id"]}: activities: {x}' for x in ae)); failed.append(meta['id']); continue
        tr = pack_i18n(pack, translations, external=True)   # each translation in its own file: tr.<locale>.js / .json (docs/i18n.md §10)
        pack['version'] = content_hash({'s': meta, 'src': sources, 'c': chapters, 'm': {k: v.get('sha') or v.get('url') for k, v in media.items()}, 'mm': {k: {x: y for x, y in v.items() if x != 'data'} for k, v in media.items()}, **({'t': tr} if tr else {}), **({'a': ACTS.hash_part(acts)} if acts and acts['items'] else {})})
        try:   # unchanged content → keep the previous build time so git sees no change
            prev = rj(os.path.join(sdir, 'pack.json'))
            if prev.get('version') == pack['version']: pack['builtAt'] = prev.get('builtAt', pack['builtAt'])
        except Exception: pass
        body = json.dumps(pack, ensure_ascii=False, separators=(',', ':'))
        wt(os.path.join(sdir, 'pack.json'), body)
        wt(os.path.join(sdir, 'pack.js'), f'/* GENERATED subject pack: {meta["id"]} — do not edit; edit chapters/*.json and run tools/build.py */\n(window.NOEMA_PACKS = window.NOEMA_PACKS || {{}})[{json.dumps(meta["id"])}] = ' + body.replace('</', '<\\/') + ';\n')
        rel = os.path.relpath(os.path.join(sdir, 'pack.js'), ROOT).replace(os.sep, '/')
        tr_locs = {}
        for f in glob.glob(os.path.join(sdir, 'tr.*.js')) + glob.glob(os.path.join(sdir, 'tr.*.json')):   # translations that are gone
            if f.split('.')[-2] not in translations: os.remove(f)
        for loc, chs in sorted(translations.items()):
            tb = json.dumps(translation_file(pack, loc, chs), ensure_ascii=False, separators=(',', ':'))
            wt(os.path.join(sdir, f'tr.{loc}.json'), tb)
            wt(os.path.join(sdir, f'tr.{loc}.js'), f'/* GENERATED translation of {meta["id"]} into {loc} — edit translations/{loc}/*.json and run tools/build.py */\n(window.NOEMA_TRANSLATIONS = window.NOEMA_TRANSLATIONS || {{}})[{json.dumps(meta["id"] + "|" + loc)}] = ' + tb.replace('</', '<\\/') + ';\n')
            tr_locs[loc] = {'path': os.path.relpath(os.path.join(sdir, f'tr.{loc}.js'), ROOT).replace(os.sep, '/'), 'chapters': len(chs)}
        info = {'chapters': [{'num': c.get('num'), 'title': c['title'], 'emoji': c.get('emoji', ''), 'sections': len(c['sections']), 'exercises': len(c['exercises'])} for c in chapters],
                'sources': [{'title': x.get('title', ''), 'subtitle': x.get('subtitle', ''), 'pages': x.get('pages', ''), 'url': x.get('url', '') if str(x.get('url', '')).startswith('http') else ''} for x in (sources or {}).get('sources', [])]}
        if meta.get('i18n'): info['i18n'] = meta['i18n']                   # the picker shows the title in the learner's language
        if translations: info['contentLocales'] = sorted(translations)      # … and knows which languages the content is in
        if tr_locs: info['trLocales'] = tr_locs                             # … and where each translation's file is (loaded only when read)
        bridges = build_bridges(sdir, {'subject': meta, 'chapters': chapters}, ROOT)   # 文A language help: bridges/ → bridge.<native>.js (docs/BRIDGE.md)
        if bridges: info['bridgeLocales'] = bridges
        metas.append(dict({k: meta.get(k) for k in ('id', 'title', 'appTitle', 'emoji', 'group', 'description', 'language', 'features', 'owner')}, path=rel, counts=dict(counts, pictures=len(media)), version=pack['version'], **info))
        print(f'pack: {meta["id"]:<20} {"(private:" + owner + ")" if owner else "":<18} {counts["chapters"]} ch · {counts["sections"]} sec · {counts["exercises"]} ex ({counts["visual"]} visual) · {counts["media"]} img · {len(body)//1024} KB')
    return metas, failed

def build_registry(metas, public=False):
    groups = rj(os.path.join(LIB, 'groups.json'), {'groups': []})['groups']
    accounts = []
    if not public:
        for f in sorted(glob.glob(os.path.join(ACC, '*', 'account.json'))):
            a = rj(f); accounts.append({k: a.get(k) for k in ('id', 'name', 'emoji', 'learner', 'subjects')})
    subs = [m for m in metas if not (public and m.get('owner'))]
    reg = {'format': 'noema-registry', 'v': 1, 'builtAt': now_iso(), 'groups': groups, 'subjects': subs, 'accounts': accounts}
    if LANG_METAS: reg['languages'] = LANG_METAS   # language courses (docs/LANGUAGES.md); absent when there are none
    return '/* GENERATED by tools/build.py — subject & profile registry */\nwindow.NOEMA_REGISTRY = ' + json.dumps(reg, ensure_ascii=False, indent=1).replace('</', '<\\/') + ';\n'

LANGS = os.path.join(LIB, 'languages')
LANG_METAS = []
def build_lang_courses():
    """Every language course in library/languages → course.pack.js (+ .json) and its registry entry (docs/LANGUAGES.md §4.1)."""
    out, failed = [], []
    if not os.path.isdir(LANGS): return out, failed
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    from validate_lang import validate as vlang
    for d in sorted(os.listdir(LANGS)):
        root = os.path.join(LANGS, d)
        if not os.path.exists(os.path.join(root, 'course.json')): continue
        if VALIDATE:
            v = vlang(root, None, strict=False)
            if v.errors: print(f'  ✗ language course {d}: {len(v.errors)} problem(s), e.g. {v.errors[0]}'); failed.append(d); continue
        J = lambda rel: rj(os.path.join(root, rel)) if os.path.exists(os.path.join(root, rel)) else None
        ls = lambda rel: sorted(f for f in os.listdir(os.path.join(root, rel)) if f.endswith('.json')) if os.path.isdir(os.path.join(root, rel)) else []
        course = J('course.json'); nodes = J('core/nodes.json')['nodes']
        data = {'course': course, 'typology': J('core/typology.json'), 'fields': [J('core/fields/' + f) for f in ls('core/fields')], 'nodes': nodes,
                'functions': [J('core/functions/' + f) for f in ls('core/functions')], 'frames': (J('core/frames.json') or {}).get('frames', []), 'langs': {}}
        # D16: the shared typological vocabulary, the world's language profiles, the catalogues of the course languages (trimmed)
        tdir = os.path.join(LANGS, '_typology'); pdir = os.path.join(LANGS, '_phenomena')
        if os.path.exists(os.path.join(tdir, 'features.json')) and os.path.exists(os.path.join(tdir, 'languages.json')):
            trim = lambda p: {'id': p['id'], 'title': p.get('title'), 'area': p.get('area'), 'kind': p.get('kind', 'has'), 'typology': p.get('typology') or [], 'what': p.get('what'), 'examples': (p.get('examples') or [])[:2], 'when': p.get('when') or '', 'notes': p.get('notes') or [], **({'specific': True, 'alsoIn': p.get('alsoIn') or [], 'alsoNote': p.get('alsoNote') or ''} if p.get('specific') else {})}
            data['world'] = {'features': rj(os.path.join(tdir, 'features.json'))['features'], 'languages': rj(os.path.join(tdir, 'languages.json'))['languages'],
                             'phenomena': {c: [trim(p) for p in rj(os.path.join(pdir, c + '.json')).get('phenomena', [])] if os.path.exists(os.path.join(pdir, c + '.json')) else [] for c in course['languages']}}
        mj = J('core/media/media.json') or {}   # pictures of the concepts (docs/LANGUAGES.md §4.3): files next to the pack, provenance here
        data['media'] = {m['id']: {k: m.get(k) for k in ('file', 'alt', 'credit', 'license', 'url', 'w', 'h') if m.get(k) is not None} for m in mj.get('items', []) if os.path.exists(os.path.join(root, 'core', 'media', m.get('file', '')))}
        data['mediaBase'] = os.path.relpath(os.path.join(root, 'core', 'media'), ROOT).replace(os.sep, '/') + '/'
        for code in course['languages']:
            b = f'lang/{code}/'
            data['langs'][code] = {'language': J(b + 'language.json'), 'lexicon': {n['id']: J(f'{b}lexicon/{n["id"]}.json') for n in nodes if J(f'{b}lexicon/{n["id"]}.json')},
                                   'grammar': {f['id']: J(f'{b}grammar/{f["id"]}.json') for f in data['functions'] if J(f'{b}grammar/{f["id"]}.json')},
                                   'bank': [s for f in ls(b + 'bank') for s in J(b + 'bank/' + f).get('sentences', [])],
                                   'script': J(b + 'script.json'), 'chars': J(b + 'chars.json')}   # script modules (§4.9, P4): ar/he letters, zh characters
        # the word profiles (half of the course) go into a second file that the app loads after the course has opened
        profiles = {}
        for L in data['langs'].values():
            for lx in L['lexicon'].values():
                for x in lx.get('lexemes', []):
                    if 'profile' in x: profiles[x['id']] = x.pop('profile')
        # D19 (docs/language-packs.md §3): what the runtime needs besides the texts, computed from the master — the meaning key, the time and
        # the date of every bank sentence — so that a locale facade can never change what the exercises check (tools/lang_stamp.js)
        try:
            r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'lang_stamp.js')], input=json.dumps(data, ensure_ascii=False), capture_output=True, text=True, encoding='utf-8')
            stamps = json.loads(r.stdout) if r.returncode == 0 else None
            if stamps is None: print(f'  ⚠️ {d}: no sentence keys ({r.stderr.strip()[:200]}) — the app computes them')
        except Exception as e:
            stamps = None; print(f'  ⚠️ {d}: no sentence keys ({e}) — the app computes them')
        for L in data['langs'].values():
            for s in L['bank']:
                if stamps and s.get('id') in stamps: s.update(stamps[s['id']])
        expl = build_lang_facades(root, course, data)
        pbody = json.dumps(profiles, ensure_ascii=False, separators=(',', ':'))
        wt(os.path.join(root, 'course.profiles.js'), f'/* GENERATED word profiles of the language course {course["id"]} — do not edit */\n(window.NOEMA_LANGPROFILES = window.NOEMA_LANGPROFILES || {{}})[{json.dumps(course["id"])}] = ' + pbody.replace('</', '<\\/') + ';\n')
        body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        wt(os.path.join(root, 'course.pack.js'), f'/* GENERATED language course: {course["id"]} — do not edit; edit the JSON files and run tools/build.py */\n(window.NOEMA_LANGPACKS = window.NOEMA_LANGPACKS || {{}})[{json.dumps(course["id"])}] = ' + body.replace('</', '<\\/') + ';\n')
        words = {c: sum(len(v['lexemes']) for v in data['langs'][c]['lexicon'].values()) for c in course['languages']}
        out.append({'id': course['id'], 'title': course['title'], 'emoji': course.get('emoji', '🌍'), 'languages': course['languages'], 'explainLang': course.get('explainLang', 'en'),
                    'path': os.path.relpath(os.path.join(root, 'course.pack.js'), ROOT).replace(os.sep, '/'),
                    'profiles': os.path.relpath(os.path.join(root, 'course.profiles.js'), ROOT).replace(os.sep, '/'), 'media': [data['mediaBase'] + m['file'] for m in data['media'].values()], 'words': words,
                    **({'expl': expl} if expl else {})})
        print(f'language course: {course["id"]} · ' + ' · '.join(f'{c} {n} words' for c, n in words.items()) + f' · {len(body)//1024} KB + profiles {len(pbody)//1024} KB')
    return out, failed

def build_lang_facades(root, course, data):
    """D19 (docs/language-packs.md §3): every locale facade of a course (facades/<locale>/*.json, plus the shared texts of
    _phenomena/facades/<locale>/<L>.json and _typology/facades/<locale>.json) → course.expl.<locale>.js, loaded by the app when the
    learner's explanation locale is that locale. → {locale: {path, status, coverage}} for the registry (empty without facades)."""
    out = {}
    fdir = os.path.join(root, 'facades')
    for f in glob.glob(os.path.join(root, 'course.expl.*.js')): os.remove(f)   # a facade removed since the last build
    if not os.path.isdir(fdir): return out
    for loc in sorted(os.listdir(fdir)):
        ldir = os.path.join(fdir, loc)
        if not os.path.isdir(ldir) or not os.path.exists(os.path.join(ldir, 'facade.json')): continue
        head = rj(os.path.join(ldir, 'facade.json'))
        files = [os.path.join(ldir, f) for f in sorted(os.listdir(ldir)) if f.endswith('.json') and f != 'facade.json']
        files += [os.path.join(LANGS, '_phenomena', 'facades', loc, c + '.json') for c in course['languages']] + [os.path.join(LANGS, '_typology', 'facades', loc + '.json')]
        texts = {}
        for fp in files:
            if not os.path.exists(fp): continue
            for k, v in (rj(fp) or {}).items():
                t = v.get('t') if isinstance(v, dict) else v if isinstance(v, str) else None
                if isinstance(t, str) and ':' in k: texts[k] = t
        status = head.get('status', 'draft') if head.get('status') in ('draft', 'preview', 'on') else 'draft'
        fac = {'locale': head.get('locale', loc), 'master': head.get('master', course.get('explainLang', 'en')), 'status': status, 'coverage': head.get('coverage') or {}, 'texts': texts}
        name = f'course.expl.{loc}.js'
        wt(os.path.join(root, name), f'/* GENERATED explanation facade ({loc}) of the language course {course["id"]} — do not edit; edit facades/{loc}/ */\n'
           + f'(function (E, c) {{ E[c] = E[c] || {{}}; E[c][{json.dumps(loc)}] = ' + json.dumps(fac, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
           + f'; }})(window.NOEMA_LANGEXPL = window.NOEMA_LANGEXPL || {{}}, {json.dumps(course["id"])});\n')
        out[loc] = {'path': os.path.relpath(os.path.join(root, name), ROOT).replace(os.sep, '/'), 'status': status, 'coverage': fac['coverage']}
        print(f'  explanation facade {course["id"]} · {loc} ({status}): {len(texts)} texts')
    return out

def h5p_entries(m):
    """the .h5p files (entry, relative to the subject folder) of a library subject's h5p@1 activities (docs/INTERACTIVE_H5P.md)"""
    try: items = (rj(os.path.join(ROOT, os.path.dirname(m['path']), 'pack.json')).get('activities') or {}).get('items') or []
    except Exception: return []
    return [a['entry'] for a in items if isinstance(a, dict) and a.get('runtime') == ACTS.H5P and isinstance(a.get('entry'), str) and '..' not in a['entry'].split('/')
            and os.path.isfile(os.path.join(ROOT, os.path.dirname(m['path']), *a['entry'].split('/')))]

H5P_INLINE_MAX = int(os.environ.get('NOEMA_H5P_INLINE_MAX', str(2 * 1024 * 1024)))   # the one-file bundle: a .h5p file up to this size goes inline (base64), a bigger one shows its fallback there

def bundle_h5p(metas, sel):
    """the one-file bundle: each library activity's .h5p file inline as base64 when it is small enough, else h5p: null (its fallback shows)"""
    out = ''
    for m in metas:
        if m.get('owner') or (sel and m['id'] not in sel): continue
        for rel in h5p_entries(m):
            b = open(os.path.join(ROOT, os.path.dirname(m['path']), *rel.split('/')), 'rb').read()
            val = json.dumps(base64.b64encode(b).decode('ascii')) if len(b) <= H5P_INLINE_MAX else 'null'
            out += f'<script>(function(p){{var a=p&&p.activities&&(p.activities.items||[]).find(function(x){{return x.entry==={json.dumps(rel)};}});if(a)Object.defineProperty(a,"h5p",{{value:{val},enumerable:false,configurable:true,writable:true}});}})((window.NOEMA_PACKS||{{}})[{json.dumps(m["id"])}]);</script>\n'
            print(f'  bundle: {m["id"]}/{rel} ' + (f'inline ({len(b) // 1024} KB)' if val != 'null' else f'too big for the one file ({len(b) // 1024} KB > {H5P_INLINE_MAX // 1024} KB): its fallback shows'))
    return out

def build_site(metas):
    out = os.path.join(ROOT, 'dist', 'site')
    if os.path.exists(out): shutil.rmtree(out)
    os.makedirs(out)
    shutil.copy(os.path.join(ROOT, 'config.js'), out)
    # the website never has a config.local.js → drop its <script> tag (avoids a 404 + MIME error in the console)
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    html = drop_missing_bundles('\n'.join(l for l in html.split('\n') if 'config.local.js' not in l))
    stamp = build_stamp()
    html = html.replace('<script src="config.js"></script>', '<script src="config.js"></script>\n' + stamp, 1)   # ⚑ reports say which build they come from
    wt(os.path.join(out, 'index.html'), html)
    # 🛡 the same stamp alone: an open tab of an older build sees it is old (engine/curjobs.js App.stale) and reloads
    wt(os.path.join(out, 'build.json'), stamp.split(' = ', 1)[1].rsplit(';</script>', 1)[0])
    os.makedirs(os.path.join(out, 'engine'))
    for f in ('langcore.js', 'langui.js', 'langui.css'):
        if os.path.exists(os.path.join(ENGINE, f)): shutil.copy(os.path.join(ENGINE, f), os.path.join(out, 'engine', f))
    for m in LANG_METAS:
        for k in ('path', 'profiles'):
            if not m.get(k): continue
            dst = os.path.join(out, m[k]); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(os.path.join(ROOT, m[k]), dst)
        for f in (m.get('expl') or {}).values():   # D19: the locale facades of the explanations
            dst = os.path.join(out, f['path']); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(os.path.join(ROOT, f['path']), dst)
        for f in m.get('media') or []:
            dst = os.path.join(out, f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(os.path.join(ROOT, f), dst)
    for f in ('engine.js', 'engine.css', 'tokens.css', 'loader.js', 'i18n.js', 'themes.js', 'art.js', 'shell.js', 'react.js', 'convos.js', 'cloud.js', 'claude.js', 'packcheck.js', 'llm.js', 'mt.js', 'wordlink.js', 'bridge.js', 'curriculum.js', 'curjobs.js', 'curshare.js', 'imglib.js', 'curimport.js', 'sourceplan.js', 'vault.js', 'social.js', 'packgen.js', 'curmap.js', 'search.js', 'catalog.js', 'report.js', 'enginereq.js', 'authoring.js', 'srcfiles.js', 'viewer.js', 'schemaform.js', 'activity_author_schemas.js', 'activity_author.js', 'activity_author.css'): shutil.copy(os.path.join(ENGINE, f), os.path.join(out, 'engine', f))   # (the activity author's four load on #/author)
    os.makedirs(os.path.join(out, 'engine', 'src'), exist_ok=True)
    for f in PAGE_SRC: shutil.copy(os.path.join(ENGINE, 'src', f), os.path.join(out, 'engine', 'src', f))   # NoemaXAPI for the shell's ⋮; NoemaWasm and NoemaEmbed beside packcheck.js (wasm-module@1, external-embed@1)
    # the TypeScript bundles of the page (build/: npm run build) with their source maps — build/app.js holds the engine library
    # too (NoemaCore.engines); the connector is a function, the harness and the node bundles are not the site's
    os.makedirs(os.path.join(out, 'build'))
    for e in BUILD_MANIFEST['entries'].values():
        if e['kind'] in ('page', 'lazy', 'worker'):
            for f in (e['file'], e['map']): shutil.copy(os.path.join(BUILD, f), os.path.join(out, 'build', f))
    # the installable app (PWA): the web manifest and its icons
    shutil.copy(os.path.join(ROOT, 'manifest.webmanifest'), out)
    shutil.copytree(os.path.join(ROOT, 'icons'), os.path.join(out, 'icons'))
    shutil.copytree(os.path.join(ENGINE, 'vendor'), os.path.join(out, 'engine', 'vendor'))
    for f in ENGINES_LICENSES: shutil.copy(os.path.join(ROOT, f), os.path.join(out, 'engine', 'vendor', os.path.basename(f)))   # the licences of the vendored code inside build/app.js (map@1)
    shutil.copytree(os.path.join(ENGINE, 'i18n'), os.path.join(out, 'engine', 'i18n'))   # the UI catalogs (docs/i18n.md), loaded per locale
    shutil.copytree(os.path.join(ROOT, 'fonts'), os.path.join(out, 'fonts'), ignore=shutil.ignore_patterns('*.md', '*.json'))   # the characters' self-hosted fonts
    for m in metas:
        if m.get('owner'): continue
        dst = os.path.join(out, m['path']); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(os.path.join(ROOT, m['path']), dst)
    for m in metas:   # 文A language bridges and translations of the library's subjects (docs/BRIDGE.md, docs/i18n.md §10)
        if m.get('owner'): continue
        for b in [*(m.get('bridgeLocales') or {}).values(), *(m.get('trLocales') or {}).values(), *({'path': t['path'][:-3] + '.json'} for t in (m.get('trLocales') or {}).values())]:
            dst = os.path.join(out, b['path']); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(os.path.join(ROOT, b['path']), dst)
    for m in metas:   # the plain JSON too, so Claude (connector: noema_get_pack_url) can extend a library subject
        if not m.get('owner'): shutil.copy(os.path.join(ROOT, os.path.dirname(m['path']), 'pack.json'), os.path.join(out, os.path.dirname(m['path']), 'pack.json'))
    for m in metas:   # h5p@1: each activity's .h5p file beside the library pack (the app fetches it by URL and checks its sha256)
        if m.get('owner'): continue
        for rel in h5p_entries(m):
            dst = os.path.join(out, os.path.dirname(m['path']), *rel.split('/')); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(os.path.join(ROOT, os.path.dirname(m['path']), *rel.split('/')), dst)
    wt(os.path.join(out, 'library', 'registry.js'), build_registry(metas, public=True))
    # OAuth consent page for the Claude connector (Supabase → <site>/oauth/consent?authorization_id=…) → the app
    wt(os.path.join(out, 'oauth', 'consent', 'index.html'), '<!doctype html><meta charset="utf-8"><title>noema-lite</title><script>location.replace("/" + location.search + "#/connect-claude")</script>')
    build_skill(os.path.join(out, 'downloads', 'noema-pack-builder.zip'))
    build_lang_skill(os.path.join(out, 'downloads', 'noema-language-builder.zip'))
    build_mcp_function(metas, os.path.join(ROOT, 'dist', 'functions'))
    build_img_function(os.path.join(ROOT, 'dist', 'functions'))
    wt(os.path.join(out, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/engine/*\n  Cache-Control: public, max-age=300\n/build/*\n  Cache-Control: public, max-age=300\n/engine/vendor/pdfjs/*.mjs\n  Content-Type: text/javascript; charset=utf-8\n/engine/vendor/pdfjs/wasm/*.wasm\n  Content-Type: application/wasm\n/library/*\n  Cache-Control: public, max-age=300\n  Access-Control-Allow-Origin: *\n/build.json\n  Cache-Control: no-store\n/fonts/*\n  Cache-Control: public, max-age=604800\n'
       + '/sw.js\n  Cache-Control: no-cache\n  Content-Type: text/javascript; charset=utf-8\n/manifest.webmanifest\n  Content-Type: application/manifest+json; charset=utf-8\n  Cache-Control: no-cache\n' + PY_HEADERS)
    write_service_worker(out)
    print('site →', os.path.relpath(out, ROOT))

# the app shell the service worker precaches besides what index.html loads: the study engine (loaded when a subject opens),
# the UI catalogs (any locale offline; not the test pseudo-locales), the language-course UI, the activity author's files
# (#/author), the web manifest and its icons. Packs and data are not in it (network first, the last copy offline).
SHELL_EXTRA = ('engine/engine.js', 'engine/i18n/*.js', 'engine/langcore.js', 'engine/langui.js', 'engine/langui.css', 'engine/schemaform.js', 'engine/activity_author*.js', 'engine/activity_author.css',
               'build/*.js', 'manifest.webmanifest', 'icons/*.png', 'icons/*.svg', 'fonts/*.css')   # build/*.js: the page bundles and every Worker bundle (offline on first use)
def write_service_worker(out):
    """dist/site/sw.js: { version, shell } + the service worker bundle (src/composition/sw.ts). The version is a hash of every
    precached file, so a deploy that changes any of them installs a new worker (and a new cache); one that changes nothing keeps it."""
    sw = bundle_file('sw')
    if not sw: sys.exit('✗ the site needs its service worker: src/composition/sw.ts is not in the tree')
    html = open(os.path.join(out, 'index.html'), encoding='utf-8').read()
    refs = {u.split('?')[0].split('#')[0] for u in re.findall(r'(?:src|href)="([^":]+)"', html)}   # local files only (no scheme)
    refs |= {os.path.relpath(f, out).replace(os.sep, '/') for g in SHELL_EXTRA for f in glob.glob(os.path.join(out, *g.split('/')))}
    shell = sorted(r for r in refs if not r.startswith(('library/', 'data/', '/')) and not re.search(r'/i18n/(en-XA|ar-XB)\.js$', r) and os.path.isfile(os.path.join(out, *r.split('/'))))
    missing = sorted(r for r in refs if not r.startswith(('library/', 'data/')) and not os.path.isfile(os.path.join(out, *r.split('/'))))
    if missing: sys.exit('✗ index.html loads files the site does not have: ' + ', '.join(missing))
    h = hashlib.sha256()
    for r in shell: h.update(r.encode()); h.update(open(os.path.join(out, *r.split('/')), 'rb').read())
    cfg = {'version': h.hexdigest()[:16], 'shell': ['index.html', *shell]}
    wt(os.path.join(out, 'sw.js'), '/* GENERATED by tools/build.py: the precache list + build/sw.js (src/composition/sw.ts) */\nself.NOEMA_SW = '
       + json.dumps(cfg, separators=(',', ':')) + ';\n' + open(sw, encoding='utf-8').read().replace('//# sourceMappingURL=sw.js.map', ''))
    print(f'service worker: {len(cfg["shell"])} files precached · version {cfg["version"]}')

# the engine library (src/engines, docs/INTERACTIVE_LIBRARY.md): every engine of sim-spec@1 is an ES module and a plugin of the
# microkernel, bundled by tools/esbuild.mjs into build/app.js (NoemaCore.engines; the site, the one-file bundle), build/harness.js
# (the skill's activity_host/noema-core.js) and build/engines-node.cjs (the node suites); the connector imports it
# (src/composition/connector.ts). Their Python twins: tools/enginelib.py + tools/lib_<name>.py, tools/{circuit,thermal,pid,rf,twin}.py.
ENGINES_LICENSES = ('src/engines/map/vendor/LICENSE-geographiclib-geodesic.txt', 'src/engines/map/vendor/LICENSE-world-atlas')   # map@1's vendored code, inside the bundles

# engine/src files the page loads by themselves, before engine.js (the shell checks packs with them and the ⋮ exports with
# NoemaXAPI before any subject is open). They run once: engine.js leaves them out, and every page that starts the engine
# (index.html, the one-file bundle) must load each of them — check_page_src() stops the build when one is missing.
PAGE_SRC = ('43_xapi.js', '44_activity_wasm.js', '45_activity_embed.js')
def check_page_src():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    miss = [f for f in ('engine/src/' + f for f in PAGE_SRC) if f'<script src="{f}"></script>' not in html]
    if miss: sys.exit('index.html must load these files itself (engine.js leaves them out): ' + ', '.join(miss))
LIB_DOCS = sorted(os.path.basename(f) for f in glob.glob(os.path.join(ROOT, 'docs', 'library', '*.md')))   # the chapters of the engine library (skill references/library/, the connector's guide part "interactive")
LIB_TOOLS = ['enginelib.py', *sorted(os.path.basename(f) for f in glob.glob(os.path.join(ROOT, 'tools', 'lib_*.py')))]
# py-module@1 (docs/INTERACTIVE_PYTHON.md §Deployment): the site's one service worker (/sw.js) keeps the Python files; the
# versioned Pyodide folder and the wheels never change (immutable), the manifest is checked every time; ACAO/CORP only for a direct load
PY_VERSION = json.load(open(os.path.join(ROOT, 'tools', 'pyodide_manifest.json'), encoding='utf-8'))['version']   # the pinned Pyodide (tools/fetch_pyodide.py)
PY_HEADERS = ('/vendor/pyodide/manifest.json\n  Cache-Control: no-cache\n  Access-Control-Allow-Origin: *\n'
              f'/vendor/pyodide/{PY_VERSION}/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n'
              f'/vendor/pyodide/{PY_VERSION}/*.wasm\n  Content-Type: application/wasm\n'
              '/vendor/pywheels/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n')

SKILL_TOOLS = ['noema_lib.py', 'activities.py', 'simexpr.py', 'circuit.py', 'thermal.py', 'pid.py', 'rf.py', 'twin.py', 'wasm_check.py', 'embed_check.py', 'embed_allow.json', 'h5p_import.py', 'h5p_check.py', 'h5p_allow.json', 'bridge.py', 'validate.py', 'contracts.py', 'pack_rules.json', 'pack_quality.py', 'pipeline.py', 'svgkit.py', 'extract_images.py', 'fetch_image.py', 'find_images.py']
LANG_SKILL_TOOLS = ['validate_lang.py', 'lang_refcheck.py', 'langlib.py', 'lang_course.py', 'lang_script.py', 'lang_phenomena.py', 'lang_readback.js', 'lang_facade.py']
# P6 runtimes and exports (docs/adr/001 D12): in the skill's references and the connector's guide part "interactive"
INTERACTIVE_P6 = ('INTERACTIVE_WASM.md', 'INTERACTIVE_EMBED.md', 'INTERACTIVE_XAPI.md')
def lang_builder_files():
    """The skill noema-language-builder (docs/LANGUAGES.md §10.2): (source, path inside the skill folder). The playbook, the brief
    templates and mkbrief.py travel with it, and langcore.js for the read-back and the package check, so it works without the repo."""
    src = os.path.join(ROOT, 'skill', 'noema-language-builder'); out = []
    for f in sorted(glob.glob(os.path.join(src, '**', '*'), recursive=True)):
        if os.path.isfile(f) and '__pycache__' not in f: out.append((f, os.path.relpath(f, src).replace(os.sep, '/')))
    for t in LANG_SKILL_TOOLS: out.append((os.path.join(ROOT, 'tools', t), 'scripts/' + t))
    out += [(os.path.join(ROOT, 'tools', 'lang_sources', 'mkbrief.py'), 'scripts/mkbrief.py'), (os.path.join(ENGINE, 'langcore.js'), 'scripts/langcore.js'),
            # langcore's words for learners come from the UI catalog: in Node it reads the English one through scripts/i18n/node.js (docs/i18n.md)
            (os.path.join(ROOT, 'tools', 'i18n', 'node.js'), 'scripts/i18n/node.js'), (os.path.join(ENGINE, 'vendor', 'intl-messageformat.iife.js'), 'scripts/i18n/intl-messageformat.iife.js'),
            (os.path.join(ENGINE, 'i18n', 'en.js'), 'scripts/i18n/en.js'), (os.path.join(ENGINE, 'i18n.js'), 'scripts/i18n/i18n.js'),
            (os.path.join(ROOT, 'docs', 'LANGUAGES.md'), 'references/LANGUAGES.md'), (os.path.join(ROOT, 'docs', 'LANGUAGE_RULES.md'), 'references/LANGUAGE_RULES.md'),
            (os.path.join(ROOT, 'docs', 'NEW_LANGUAGE_PLAYBOOK.md'), 'references/NEW_LANGUAGE_PLAYBOOK.md'), (os.path.join(ROOT, 'tools', 'CONTENT_SPEC.md'), 'references/CONTENT_SPEC.md'),
            (os.path.join(ROOT, 'tools', 'lang_sources', 'AGENT_BRIEF.md'), 'references/AGENT_BRIEF.md')]
    out += [(f, 'references/briefs/' + os.path.basename(f)) for f in sorted(glob.glob(os.path.join(ROOT, 'tools', 'lang_sources', 'briefs', '*.txt')))]
    out += [(f, 'schemas/' + os.path.basename(f)) for f in sorted(glob.glob(os.path.join(ROOT, 'src', 'contracts', 'schemas', 'noema.lang*.schema.json')))]
    # D19: the field registry and the CLDR language names the facade lint (lang_facade.py, run by validate_lang.py) reads
    out += [(os.path.join(ROOT, 'src', 'contracts', 'schemas', 'noema.langfacade.fields.json'), 'schemas/noema.langfacade.fields.json'), (os.path.join(ROOT, 'docs', 'language-packs.md'), 'references/language-packs.md')]
    out += [(f, 'scripts/i18n/langnames/' + os.path.basename(f)) for f in sorted(glob.glob(os.path.join(ROOT, 'tools', 'i18n', 'langnames', '*.json')))]
    for d in ('_typology', '_phenomena'): out += [(f, f'library/languages/{d}/{os.path.basename(f)}') for f in sorted(glob.glob(os.path.join(LANGS, d, '*.json')))]
    return [(a, b) for a, b in out if os.path.exists(a)]
def build_lang_skill(out_zip):
    """dist/noema-language-builder.zip (and downloads/ on the website): one prompt → a whole language as a package."""
    os.makedirs(os.path.dirname(out_zip), exist_ok=True)
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for a, b in lang_builder_files(): z.write(a, 'noema-language-builder/' + b)
    print('skill →', os.path.relpath(out_zip, ROOT))
SKILL_MAX_FILES = 200   # claude.ai › Settings › Skills refuses a bigger zip

def build_skill(out_zip):
    """The Claude skill (skill/noema-pack-builder) + the shared tools and the content contract, as one zip."""
    src = os.path.join(ROOT, 'skill', 'noema-pack-builder')
    os.makedirs(os.path.dirname(out_zip), exist_ok=True)
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(glob.glob(os.path.join(src, '**', '*'), recursive=True)):
            if os.path.isfile(f) and '__pycache__' not in f: z.write(f, os.path.join('noema-pack-builder', os.path.relpath(f, src)))
        for t in SKILL_TOOLS + LIB_TOOLS: z.write(os.path.join(ROOT, 'tools', t), f'noema-pack-builder/scripts/{t}')
        z.write(os.path.join(ENGINE, 'contracts.js'), 'noema-pack-builder/scripts/contracts.js')   # the data contracts validate.py checks shapes with (contracts.py)
        for f in sorted(glob.glob(os.path.join(ROOT, 'tools', 'pipelines', '*.json'))): z.write(f, f'noema-pack-builder/scripts/pipelines/{os.path.basename(f)}')   # docs/PIPELINES.md
        # interactive activities (docs/INTERACTIVE.md): the reference activity, the app's runtime for the harness, the contract
        # the reference activities travel as ONE inner zip (claude.ai takes a skill zip of at most 200 files);
        # activity_new.py unpacks it beside itself on first use
        ex_root, ex_buf = os.path.join(ROOT, 'tools', 'activities_examples'), io.BytesIO()
        with zipfile.ZipFile(ex_buf, 'w', zipfile.ZIP_DEFLATED) as ez:
            for f in sorted(glob.glob(os.path.join(ex_root, '**', '*'), recursive=True)):
                if os.path.isfile(f) and '__pycache__' not in f: ez.write(f, os.path.relpath(f, ex_root).replace(os.sep, '/'))
        z.writestr('noema-pack-builder/scripts/activities_examples.zip', ex_buf.getvalue())
        z.writestr('noema-pack-builder/scripts/activity_host/noema-core.js', bundle_text('harness'))   # NoemaCore of the harness (build/harness.js): the data contracts and the engine library
        for f in ('32_activities.js', '33_activity_guard.js', '34_activity_html.js', '35_activity_sim.js', '37_activity_py.js', '37_activity_py_ui.js', '38_activity_h5p.js', '32_activities.css', '44_activity_wasm.js'): z.write(os.path.join(ENGINE, 'src', f), f'noema-pack-builder/scripts/activity_host/{f}')
        h5pv = os.path.join(ENGINE, 'vendor', 'h5p', '3.8.2')   # h5p@1: the app's own H5P player for the harness, with its licences and readable source (GPL-3.0)
        for f in ['player.js', 'LICENSE', 'LICENSE-NOTICE.txt'] + sorted(os.path.relpath(g, h5pv).replace(os.sep, '/') for g in glob.glob(os.path.join(h5pv, 'source', '**', '*'), recursive=True) if os.path.isfile(g)):
            z.write(os.path.join(h5pv, f), 'noema-pack-builder/scripts/activity_host/h5p/' + f)
        for f in ENGINES_LICENSES: z.write(os.path.join(ROOT, f), 'noema-pack-builder/scripts/activity_host/vendor/' + os.path.basename(f))   # the licences of the vendored code inside noema-core.js (map@1)
        z.write(os.path.join(ENGINE, 'packcheck.js'), 'noema-pack-builder/scripts/activity_host/packcheck.js')   # sim-spec@1: the spec check the runtime runs
        for f in ('INTERACTIVE.md', 'INTERACTIVE_AUTHORING.md', 'INTERACTIVE_LIBRARY.md', 'INTERACTIVE_SIMEXPR.md', 'INTERACTIVE_CIRCUIT.md', 'INTERACTIVE_ENGINES.md', 'INTERACTIVE_PYTHON.md', 'INTERACTIVE_H5P.md') + INTERACTIVE_P6:
            if os.path.exists(os.path.join(ROOT, 'docs', f)): z.write(os.path.join(ROOT, 'docs', f), f'noema-pack-builder/references/{f}')
        z.writestr('noema-pack-builder/references/LIBRARY_ENGINES.md', '# The chapters of the engine library (docs/library/*.md), one per engine\n\n' + ''.join(f'\n\n---\n\n<!-- docs/library/{f} -->\n\n' + open(os.path.join(ROOT, 'docs', 'library', f), encoding='utf-8').read() for f in LIB_DOCS))   # the engine library: every engine's chapter in ONE file (claude.ai accepts at most 200 files in a skill)
        if os.path.exists(os.path.join(ROOT, 'docs', 'PIPELINES.md')): z.write(os.path.join(ROOT, 'docs', 'PIPELINES.md'), 'noema-pack-builder/references/PIPELINES.md')
        z.write(os.path.join(ROOT, 'tools', 'CONTENT_SPEC.md'), 'noema-pack-builder/references/CONTENT_SPEC.md')
        z.write(os.path.join(ROOT, 'docs', 'VISUAL.md'), 'noema-pack-builder/references/VISUAL.md')
        if os.path.exists(os.path.join(ROOT, 'docs', 'BRIDGE.md')): z.write(os.path.join(ROOT, 'docs', 'BRIDGE.md'), 'noema-pack-builder/references/BRIDGE.md')
        if os.path.exists(os.path.join(ROOT, 'docs', 'LANGUAGES.md')): z.write(os.path.join(ROOT, 'docs', 'LANGUAGES.md'), 'noema-pack-builder/references/LANGUAGES.md')
        if os.path.exists(os.path.join(ROOT, 'docs', 'LANGUAGE_RULES.md')): z.write(os.path.join(ROOT, 'docs', 'LANGUAGE_RULES.md'), 'noema-pack-builder/references/LANGUAGE_RULES.md')
        # language courses (docs/LANGUAGES.md §10.1): the checks Claude runs in its sandbox, with the shared typology and catalogues they read
        for t in LANG_SKILL_TOOLS:
            if os.path.exists(os.path.join(ROOT, 'tools', t)): z.write(os.path.join(ROOT, 'tools', t), f'noema-pack-builder/scripts/{t}')
        if os.path.exists(os.path.join(ROOT, 'src', 'contracts', 'schemas', 'noema.lang.v1.schema.json')): z.write(os.path.join(ROOT, 'src', 'contracts', 'schemas', 'noema.lang.v1.schema.json'), 'noema-pack-builder/schemas/noema.lang.v1.schema.json')
        for d in ('_typology', '_phenomena'):
            for f in sorted(glob.glob(os.path.join(LANGS, d, '*.json'))): z.write(f, f'noema-pack-builder/library/languages/{d}/{os.path.basename(f)}')
        # a whole language in one prompt (docs/LANGUAGES.md §10.2): the skill noema-language-builder as LANGUAGE_BUILDER.md + its files
        have = set(z.namelist())
        for a, b in lang_builder_files():
            name = 'noema-pack-builder/' + ('LANGUAGE_BUILDER.md' if b == 'SKILL.md' else b)
            if name not in have: z.write(a, name); have.add(name)
        n = len(z.namelist())
    if n > SKILL_MAX_FILES: sys.exit(f'✗ the skill zip has {n} files; claude.ai accepts at most {SKILL_MAX_FILES}')
    print('skill →', os.path.relpath(out_zip, ROOT), f'({n} files)')

def public_config():
    txt = open(os.path.join(ROOT, 'config.js'), encoding='utf-8').read()
    g = lambda k: (re.search(k + r"\s*:\s*'([^']*)'", txt) or [None, ''])[1]
    return {'siteUrl': g('siteUrl'), 'supabaseUrl': g('supabaseUrl'), 'supabaseKey': g('supabaseKey')}

# the app's own code the connector runs, in load order (pack checks; curriculum tasks, checks and how answers change a
# curriculum; pictures; language courses): src/connector/engine/sources.ts lists them and tools/connector_bundle.mjs bundles
# each as its text. The data contracts and the engine library are ES modules the connector's composition root hands them.
CONNECTOR_ENGINE = ('engine/report.js', 'engine/enginereq.js', 'engine/src/38_activity_h5p.js', 'engine/packcheck.js', 'engine/src/44_activity_wasm.js', 'engine/src/45_activity_embed.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js', 'engine/langcore.js', 'engine/curimport.js', 'engine/sourceplan.js')

def connector_engine_files():
    """The engine files src/connector/engine/sources.ts loads (LEGACY_SOURCES, in order)."""
    txt = open(os.path.join(ROOT, 'src', 'connector', 'engine', 'sources.ts'), encoding='utf-8').read()
    return tuple(re.findall(r"S\('([^']+)'", txt[txt.index('LEGACY_SOURCES'):]))

def build_stamp():
    """<script>window.NOEMA_BUILD = {commit, builtAt}</script>: which build a ⚑ problem report comes from (docs/REPORTS.md).
    The commit is Netlify's COMMIT_REF, else the checkout's HEAD; none when neither is known."""
    commit = os.environ.get('COMMIT_REF') or ''
    if not commit:
        try: commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception: commit = ''
    return '<script>window.NOEMA_BUILD = ' + json.dumps({'commit': commit[:40] or None, 'builtAt': now_iso()}) + ';</script>'

def build_mcp_function(metas, out_dir):
    """dist/functions/mcp.mjs — the Claude connector: src/composition/connector.ts bundled by esbuild with the public config and the content contract."""
    cfg = public_config()
    if not (cfg['siteUrl'] and cfg['supabaseUrl'] and cfg['supabaseKey']): print('mcp: skipped (config.js needs siteUrl, supabaseUrl, supabaseKey)'); return
    cfg['library'] = [{**{k: m.get(k) for k in ('id', 'title', 'counts', 'version')}, **({'bridgeLocales': m['bridgeLocales']} if m.get('bridgeLocales') else {})} for m in metas if not m.get('owner')]
    cfg['languages'] = [{k: m.get(k) for k in ('id', 'title', 'languages', 'path', 'profiles')} for m in LANG_METAS]   # language courses (D13 peers, refills)
    rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
    docs = {'workflow': rd('skill/noema-pack-builder/SKILL.md'), 'content': rd('tools/CONTENT_SPEC.md'), 'visual': rd('docs/VISUAL.md')}
    if os.path.exists(os.path.join(ROOT, 'docs', 'INTERACTIVE.md')): docs['interactive'] = rd('docs/INTERACTIVE.md') + ''.join('\n\n---\n\n' + rd('docs/' + f) for f in ('INTERACTIVE_AUTHORING.md', 'INTERACTIVE_LIBRARY.md', *('library/' + g for g in LIB_DOCS), 'INTERACTIVE_SIMEXPR.md', 'INTERACTIVE_CIRCUIT.md', 'INTERACTIVE_ENGINES.md', 'INTERACTIVE_PYTHON.md', 'INTERACTIVE_H5P.md') + INTERACTIVE_P6 if os.path.exists(os.path.join(ROOT, 'docs', f)))   # interactive activities: the contract + the playbook + the expression language
    if os.path.exists(os.path.join(ROOT, 'docs', 'BRIDGE.md')): docs['bridge'] = rd('docs/BRIDGE.md')   # 文A language bridges (noema_bridge_guide)
    # the content flows (noema_pipeline, docs/PIPELINES.md): the doc, the step library and every flow
    if os.path.exists(os.path.join(ROOT, 'docs', 'PIPELINES.md')): docs['pipelines'] = rd('docs/PIPELINES.md')
    docs['pipelineSteps'] = rj(os.path.join(ROOT, 'tools', 'pipelines', 'steps.json'))['steps']
    docs['pipelineFlows'] = {f['id']: f for f in (rj(x) for x in sorted(glob.glob(os.path.join(ROOT, 'tools', 'pipelines', '*.json')))) if f.get('format') == 'noema.pipeline/v1'}
    if os.path.exists(os.path.join(ROOT, 'docs', 'LANGUAGE_RULES.md')): docs['languages'] = rd('docs/LANGUAGE_RULES.md') + ('\n\n---\n\n' + rd('skill/noema-pack-builder/LANGUAGES.md') if os.path.exists(os.path.join(ROOT, 'skill', 'noema-pack-builder', 'LANGUAGES.md')) else '') + ('\n\n---\n\n' + rd('docs/language-packs.md') if os.path.exists(os.path.join(ROOT, 'docs', 'language-packs.md')) else '')   # D19: the contract of the explanation layers   # language courses: the binding rules + how to answer a task
    have = connector_engine_files()
    if have != CONNECTOR_ENGINE:
        sys.exit('✗ src/connector/engine/sources.ts does not load the engine files the connector needs, in order:\n  missing: '
                 + (', '.join(f for f in CONNECTOR_ENGINE if f not in have) or '-') + '\n  extra: ' + (', '.join(f for f in have if f not in CONNECTOR_ENGINE) or '-') + '\n  (or the order differs)')
    out = os.path.join(out_dir, 'mcp.mjs')
    with tempfile.TemporaryDirectory() as td:
        data = os.path.join(td, 'connector-data.json')
        wt(data, json.dumps({'config': cfg, 'docs': docs}, ensure_ascii=False))
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'connector_bundle.mjs'), '--data', data, '--out', out], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if r.returncode: sys.exit('✗ the connector bundle failed (tools/connector_bundle.mjs, esbuild):\n' + (r.stderr or r.stdout).strip())
    print('mcp →', os.path.relpath(out, ROOT))

def build_img_function(out_dir):
    """dist/functions/img.mjs — /api/img, the picture fetcher for web pictures whose host blocks browsers (cloud/img/proxy.mjs)."""
    code = open(os.path.join(ROOT, 'cloud', 'img', 'proxy.mjs'), encoding='utf-8').read()
    lib = open(os.path.join(ROOT, 'engine', 'imglib.js'), encoding='utf-8').read()   # the picture library (resolve, page → picture, search)
    wt(os.path.join(out_dir, 'img.mjs'), '/* GENERATED by tools/build.py from engine/imglib.js + cloud/img/proxy.mjs — do not edit */\n' + lib + '\n' + code + '\nexport const config = { path: ["/api/img", "/api/file", "/api/imgsearch"] };\n')
    print('img →', os.path.relpath(os.path.join(out_dir, 'img.mjs'), ROOT))

def google_fonts_url():
    """The one-file bundle cannot carry fonts/ (several MB): it asks Google Fonts for the same families, the scripts' Noto ones included (offline: system fonts)."""
    fams = json.load(open(os.path.join(ROOT, 'fonts', 'fonts.json'), encoding='utf-8'))
    q = []
    for name, f in fams.items():
        w, st = f['weights'], f.get('styles')
        if st: spec = 'ital,wght@' + ';'.join(f'{i},{x}' for i, k in ((0, 'normal'), (1, 'italic')) for x in sorted(st.get(k, []), key=lambda v: int(v.split()[0])))
        elif f.get('italic'): spec = 'ital,wght@0,' + ';0,'.join(map(str, w)) + ';1,' + ';1,'.join(map(str, w))
        elif f.get('variable'): spec = f'wght@{min(w)}..{max(w)}'
        else: spec = 'wght@' + ';'.join(map(str, w))
        q.append('family=' + name.replace(' ', '+') + ':' + spec)
    # the scripts' Noto families (fonts/scripts.css, made by tools/fonts_subset.py): Google serves them in unicode-range slices too
    for name in json.load(open(os.path.join(ROOT, 'fonts', 'scripts.json'), encoding='utf-8')): q.append('family=' + name.replace(' ', '+') + ':wght@400..700')
    return 'https://fonts.googleapis.com/css2?' + '&'.join(q) + '&display=swap'

def build_bundle(metas):
    sel = None
    if '--subjects' in args: sel = set(args[args.index('--subjects') + 1].split(','))
    rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
    # a source inlined in a <script>: '</script' would end it, and '<!--' followed later by '<script' (the Python runner's srcdoc,
    # 37_activity_py.js) puts the HTML parser in the 'double escaped' state, where '</script>' no longer ends the element (the
    # engine then swallowed the loader and the bundle stayed blank). Both are written as JS escapes that mean the same text.
    esc = lambda s: s.replace('</script', '<\\/script').replace('<!--', '<\\x21--')
    packs = ''.join(f'<script>{esc(rd(m["path"]))}</script>\n' for m in metas if (not sel or m['id'] in sel))
    packs += ''.join(f'<script>{esc(rd(b["path"]))}</script>\n' for m in metas if (not sel or m['id'] in sel) for b in (m.get('bridgeLocales') or {}).values())   # 文A language bridges
    packs += ''.join(f'<script>{esc(rd(t["path"]))}</script>\n' for m in metas if (not sel or m['id'] in sel) for t in (m.get('trLocales') or {}).values())   # translations (docs/i18n.md §10)
    packs += bundle_h5p(metas, sel)   # h5p@1: small .h5p files inline, bigger ones show their fallback
    reg_metas = [dict(m, path=None) for m in metas if (not sel or m['id'] in sel)]
    local = ''
    if '--with-local-config' in args and os.path.exists(os.path.join(ROOT, 'config.local.js')): local = f'<script>{esc(rd("config.local.js"))}</script>'
    css = rd('engine/engine.css') + '\n' + rd('engine/activity_author.css')
    # every UI catalog inline (the single file works offline in any locale; pseudo-locales only for tests)
    i18n_cats = ''.join(f'<script>{esc(rd("engine/i18n/" + f))}</script>\n' for f in sorted(os.listdir(os.path.join(ENGINE, 'i18n'))) if f.endswith('.js') and f[:-3] not in ('en-XA', 'ar-XB'))
    # the TypeScript core (build/app.js: window.NoemaCore) before every older script, and each Worker's code as text: the one
    # file cannot load build/<worker>.js from file://, so the app starts a Worker from a Blob of <script id="noema-worker:<name>">
    core_scripts = (f'<script>{esc(bundle_text("app"))}</script>\n' if bundle_file('app') else '') + ''.join(
        f'<script type="text/plain" id="noema-worker:{n}">{esc(bundle_text(n))}</script>\n' for n, e in sorted(BUILD_MANIFEST['entries'].items()) if e['kind'] == 'worker') + ''.join(
        f'<script type="text/plain" id="noema-lazy:{n}">{esc(bundle_text(n))}</script>\n' for n, e in sorted(BUILD_MANIFEST['entries'].items()) if e['kind'] == 'lazy')   # build/engines.js: run when first needed
    html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>noema-lite</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235f8d5a' stroke-width='2.4' stroke-linecap='round'><circle cx='5' cy='19' r='2'/><circle cx='19' cy='5' r='2'/><path d='M7 19h7a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h7'/></svg>">
<link href="{google_fonts_url()}" rel="stylesheet">
<style>{css}</style>
<style>{rd('engine/tokens.css')}</style></head>
<body><div id="noema-splash"><div class="logo"></div></div>
<script>{esc(rd("config.js"))}</script>{local}
<script>window.NOEMA_BUNDLE = true;</script>
{build_stamp()}
{core_scripts}
<script>{esc(build_registry(reg_metas))}</script>
{packs}<script>{esc(rd("engine/vendor/marked.umd.js"))}</script>
<script>{esc(rd("engine/vendor/purify.min.js"))}</script>
<script>{esc(rd("engine/vendor/intl-messageformat.iife.js"))}</script>
{i18n_cats}<script>{esc(rd("engine/i18n.js"))}</script>
<script>{esc(rd("engine/themes.js"))}</script>
<script>{esc(rd("engine/art.js"))}</script>
<script>{esc(rd("engine/convos.js"))}</script>
<script>{esc(rd("engine/cloud.js"))}</script>
<script>{esc(rd("engine/imglib.js"))}</script>
<script>{esc(rd("engine/claude.js"))}</script>
<script>{esc(rd("engine/srcfiles.js"))}</script>
<script>{esc(rd("engine/viewer.js"))}</script>
<script>{esc(rd("engine/packcheck.js"))}</script>
<script>{esc(rd("engine/src/43_xapi.js"))}</script>
<script>{esc(rd("engine/src/44_activity_wasm.js"))}</script>
<script>{esc(rd("engine/src/45_activity_embed.js"))}</script>
<script>{esc(rd("engine/schemaform.js"))}</script>
<script>{esc(rd("engine/activity_author_schemas.js"))}</script>
<script>{esc(rd("engine/activity_author.js"))}</script>
<script>{esc(rd("engine/llm.js"))}</script>
<script>{esc(rd("engine/mt.js"))}</script>
<script>{esc(rd("engine/wordlink.js"))}</script>
<script>{esc(rd("engine/bridge.js"))}</script>
<script>{esc(rd("engine/packgen.js"))}</script>
<script>{esc(rd("engine/curriculum.js"))}</script>
<script>{esc(rd("engine/curjobs.js"))}</script>
<script>{esc(rd("engine/curshare.js"))}</script>
<script>{esc(rd("engine/curimport.js"))}</script>
<script>{esc(rd("engine/sourceplan.js"))}</script>
<script>{esc(rd("engine/vault.js"))}</script>
<script>{esc(rd("engine/social.js"))}</script>
<script>{esc(rd("engine/curmap.js"))}</script>
<script>{esc(rd("engine/catalog.js"))}</script>
<script>{esc(rd("engine/search.js"))}</script>
<script>{esc(rd("engine/vendor/modern-screenshot.umd.js"))}</script>
<script>{esc(rd("engine/report.js"))}</script>
<script>{esc(rd("engine/enginereq.js"))}</script>
<script>{esc(rd("engine/shell.js"))}</script>
<script>{esc(rd("engine/react.js"))}</script>
<script>{esc(rd("engine/authoring.js"))}</script>
<script>{esc(rd("engine/vendor/h5p/3.8.2/player.js"))}</script>
<script type="text/plain" id="noema-engine-src">{esc(rd("engine/engine.js"))}</script>
<script>{esc(rd("engine/loader.js"))}</script>
</body></html>'''
    out = os.path.join(ROOT, 'dist', 'noema-lite.html'); wt(out, html)
    print(f'bundle → dist/noema-lite.html ({len(html)/1e6:.1f} MB, {len(reg_metas)} subjects{", with local config" if local else ""})')

if __name__ == '__main__':
    if '--author-schemas' in args: sys.stdout.write(author_schemas_js()); sys.exit(0)   # (tests/activity_author.js: is the copy current?)
    build_contracts()   # first: src/contracts/validate.ts and the types are generated, and the TypeScript bundles import them
    run_esbuild()
    build_engine()
    if 'engine' in args: sys.exit(0)
    metas, failed = build_packs()
    LANG_METAS, lfailed = build_lang_courses(); failed += lfailed
    wt(os.path.join(LIB, 'registry.js'), build_registry(metas))
    print(f'registry: {len(metas)} subjects')
    if 'site' in args: build_site(metas)
    if 'skill' in args: build_skill(os.path.join(ROOT, 'dist', 'noema-pack-builder.zip')); build_lang_skill(os.path.join(ROOT, 'dist', 'noema-language-builder.zip'))
    if 'bundle' in args: build_bundle(metas)
    if failed: print('FAILED:', ', '.join(failed)); sys.exit(1)
