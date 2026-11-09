#!/usr/bin/env python3
"""Validate a subject folder and build its package for noema-lite.
  python3 make_pack.py SUBJECT_DIR [OUT_DIR]
    → OUT_DIR/<id>.noema.zip   THE PACKAGE: pack.json + sources/<every original file> + activities/<id>/item.h5p (each H5P
                               activity's package)  (default OUT_DIR: /mnt/user-data/outputs or .)
    → SUBJECT_DIR/build/<id>.json   the pack alone (for noema_start_upload / noema_save_pack)
Every source with "file": "sources/<name>" must have that file in SUBJECT_DIR/sources/ (exactly the files the learner
gave — or the parts of a split PDF, one source per part), and every file there must belong to a source.
Exit code 1 (and a list of errors) when anything is wrong — fix and run again. Never deliver a pack that fails."""
import os, sys, json, datetime
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from noema_lib import load_subject, load_media, content_hash, package_sources, write_bundle, load_translations, pack_i18n, translation_file, \
    load_activities, fallback_media, hash_part, ACTIVITIES_FORMAT   # interactive activities (docs/INTERACTIVE.md): activities/activities.json + activities/<id>/
import noema_core   # the content checks: the app's and the connector's own code, run in node (scripts/noema-tools.cjs)
a = sys.argv[1:]
if not a: print(__doc__); sys.exit(1)
sdir = os.path.abspath(a[0])
out_dir = a[1] if len(a) > 1 else ('/mnt/user-data/outputs' if os.path.isdir('/mnt/user-data/outputs') else '.')
meta, sources, chapters, report = load_subject(sdir)
media, mrep = load_media(sdir)
acts, arep = load_activities(sdir)   # None when the subject has no activities/ folder
translations = load_translations(sdir, chapters)   # optional: translations/<locale>/chNN.json (CONTENT_SPEC.md "Packs in several languages")
base_ids, base_chapters = (), ()
try:
    _u = json.load(open(os.path.join(sdir, '.unpacked.json'), encoding='utf-8'))
    base_ids, base_chapters = set(_u.get('sourcesWithFiles') or []), set(_u.get('chapters') or [])
except Exception: pass
sources, files, ferrs, fwarns = package_sources(sdir, sources, chapters, base_ids)
errs = [r for r in report + mrep + arep if r.startswith('ERROR')] + ferrs
try:
    requires = noema_core.requires(acts)
    # activities: the registry, the blocks and sim exercises that use it (a block naming an activity that is not there too), and the strings in every language the pack is read in
    ae, aw = noema_core.check_activities({'activities': acts, 'media': media, 'subject': meta, 'chapters': chapters, 'requires': requires}, list(translations))
except noema_core.CoreUnavailable as e: print(f'ERROR {e}'); print('\n✗ the checks could not run — pack NOT written.'); sys.exit(1)
errs += ['activities: ' + x for x in ae]
for w in aw: print('WARN activities: ' + w)
# h5p@1: each .h5p file travels BESIDE the pack (in the .noema.zip as activities/<id>/item.h5p; the connector asks for it as for the
# source files) — checked here like the app and the connector check it: sha256, bytes, the package rules (the h5p@1 checks, src/runtimes/h5p)
def _h5p_bytes(x):
    f = os.path.join(sdir, *str(x.get('entry') or '').split('/'))
    return open(f, 'rb').read() if os.path.isfile(f) else None
h5p_files = {x['entry']: _h5p_bytes(x) for x in (acts or {}).get('items') or [] if isinstance(x, dict) and x.get('runtime') == 'h5p@1' and isinstance(x.get('entry'), str) and _h5p_bytes(x) is not None}
if h5p_files:
    he, hw = noema_core.check_packages({'activities': acts}, sdir)
    errs += ['activities: ' + x for x in he]
    for w in hw: print('WARN activities: ' + w)
for w in mrep + fwarns:
    if w.startswith('WARN'): print(w)
auth = meta.get('authoring') or {}
per_pic = int(auth.get('minExercisesPerPicture', 3)); min_vis = int(auth.get('minVisualPerChapter', 3))
feats = [k for k, v in (meta.get('features') or {}).items() if v]
if int(auth.get('rules', 0)) >= 2:
    # the quality rules (CONTENT_SPEC.md Q1–Q8, docs/PIPELINES.md §4): every chapter needs its knowledge map
    # (map/chNN.json, written BEFORE the exercises) and its second-pass review (review/chNN.json); both go into the pack
    # (chapter.map for the Info window, chapter.review). Errors for packs made by Claude/Gemini, warnings for the learner's own.
    level = 'error' if auth.get('by', 'claude') in ('claude', 'gemini') else 'warn'
    for c in chapters:
        for k, sub in (('map', 'map'), ('review', 'review')):
            f = os.path.join(sdir, sub, c['id'] + '.json')
            if os.path.exists(f):
                try: c[k] = json.load(open(f, encoding='utf-8'))
                except Exception as e: errs.append(f'ERROR {sub}/{c["id"]}.json: invalid JSON ({e})')
    balance = lambda cid: {'quality': 'warn' if cid in base_chapters else level, 'features': feats}
else:
    # older subjects: every exercise type, difficulty and focus tag >= minPerKind times per chapter (CONTENT_SPEC.md, the quantity rules);
    # chapters of an older pack being extended (unpack.py) only warn
    per_kind = int(auth.get('minPerKind', 0))
    balance = lambda cid: ({'balanceWarn' if cid in base_chapters else 'balance': per_kind, 'features': feats} if per_kind else {})
used = Counter(e.get('media') for c in chapters for e in c['exercises'] if e['type'].startswith('img_'))
for m in media:   # (an activity's still picture, its fallback, needs no exercises)
    if used[m] < per_pic and m not in fallback_media(acts): errs.append(f'ERROR media {m}: used by {used[m]} exercise(s); every picture needs >= {per_pic}')
# the authoring check of every chapter, of subject.json and of every translated chapter (validate.py's own code:
# src/features/content/domain/chapter.ts), in ONE run of the bridge (noema_core.py → noema-tools.cjs)
mm = {k: {'w': v['w'], 'h': v['h'], 'regions': v.get('regions')} for k, v in media.items()}
areg = {a['id']: {k: v for k, v in a.items() if k not in ('html', 'python')} for a in (acts or {}).get('items', []) if isinstance(a, dict) and 'id' in a} if acts else None
base = {'media': mm, 'minVisual': min_vis, **({'activities': areg} if areg is not None else {})}
jobs, what = [], []
for c in chapters: jobs.append(('chapter.check', c, {**base, **balance(c['id'])})); what.append(('chapter', c['id']))
if translations or 'i18n' in meta:   # the other languages: subject.i18n, and every translated chapter against its source
    jobs.append(('subject.check', meta, list(translations))); what.append(('subject', 'subject.json'))
for loc, chs in translations.items():
    for c in chs:
        src = next((x for x in chapters if x['id'] == c.get('id')), None)
        if src is None: errs.append(f'ERROR translations/{loc}/{c.get("id")}: not a chapter of the subject'); continue
        jobs.append(('chapter.check', c, {**base, 'source': src})); what.append(('translation', f'translations/{loc}/{c["id"]}'))
try: results = noema_core.batch(jobs)
except noema_core.CoreUnavailable as e: print(f'ERROR {e}'); print('\n✗ the checks could not run — pack NOT written.'); sys.exit(1)
for (kind, w), r in zip(what, results):
    if kind != 'subject':
        S = r['summary']; print(f"{'translations/' + w.split('/')[1] + ': ' if kind == 'translation' else ''}== {w.split('/')[-1]}: {S['sections']} sections, {S['exercises']} exercises ({S['visual']} visual, {S['figures']} figures), {S['playbooks']} playbooks, {S['flashcards']} flashcards, {S['pitfalls']} pitfalls")
    for m in r['warnings']:
        if kind == 'subject' or m.startswith('['): print(f'{w}: WARN: {m}')
    errs += [f'{w}: ERROR: {m}' for m in r['errors']]
if errs:
    print('\n'.join(errs)); print(f'\n✗ {len(errs)} error(s) — pack NOT written.'); sys.exit(1)
counts = {'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'exercises': sum(len(c['exercises']) for c in chapters),
          'playbooks': sum(len(c.get('debug', [])) for c in chapters), 'flashcards': sum(len(c.get('flashcards', [])) for c in chapters),
          'visual': sum(1 for c in chapters for e in c['exercises'] if e['type'].startswith('img_')), 'media': len(media), **({'activities': len(acts['items'])} if acts else {})}
meta = dict(meta); meta['owner'] = None
pack = {'format': 'noema-pack', 'v': 3, 'subject': meta, 'sources': sources, 'chapters': chapters, 'media': media, 'counts': counts,
        'builtAt': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(), 'builtWith': 'noema-pack-builder skill'}
if acts and acts['items']: pack['activities'] = {'format': ACTIVITIES_FORMAT, 'items': acts['items'], **({'parts': acts['parts']} if acts.get('parts') else {})}; pack['requires'] = requires   # inline, like the pictures (docs/adr/001 D2); activities/_parts with them (§12.8)
tr = pack_i18n(pack, translations, external=True)   # pack format v3; each translation in its own file (docs/i18n.md §10)
pack['version'] = content_hash({'s': meta, 'src': sources, 'c': chapters, 'm': {k: v.get('sha') or v.get('url') for k, v in media.items()}, **({'t': tr} if tr else {}), **({'a': hash_part(acts)} if acts and acts['items'] else {})})
counts['sourceFiles'] = len(files)
jout = os.path.join(sdir, 'build', meta['id'] + '.json'); os.makedirs(os.path.dirname(jout), exist_ok=True)
with open(jout, 'w', encoding='utf-8') as f: json.dump(pack, f, ensure_ascii=False, separators=(',', ':'))
trfiles = {loc: translation_file(pack, loc, chs) for loc, chs in translations.items()}
for loc, t in trfiles.items():   # build/<id>.tr.<locale>.json: what noema_finish_upload asks for, one file per language
    with open(os.path.join(sdir, 'build', f"{meta['id']}.tr.{loc}.json"), 'w', encoding='utf-8') as f: json.dump(t, f, ensure_ascii=False, separators=(',', ':'))
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, meta['id'] + '.noema.zip')
write_bundle(out, pack, files, {**{f'translations/{loc}.json': t for loc, t in trfiles.items()}, **h5p_files})
mb = lambda n: f'{n / 1048576:.1f} MB' if n >= 1048576 else f'{n // 1024} KB'
print(f'\n✓ {out}  ({mb(os.path.getsize(out))}) · {counts["chapters"]} chapters · {counts["exercises"]} exercises ({counts["visual"]} visual) · {counts["media"]} pictures · {len(files)} source file(s)')
for sid, p, rel in files: print(f'   📎 {sid}: {rel} ({mb(os.path.getsize(p))})')
for rel, b in h5p_files.items(): print(f'   🧩 {rel} ({mb(len(b))}): an H5P activity, beside the pack (noema_finish_upload asks for it)')
print(f'  pack alone (for the connector upload): {jout}')
for loc in trfiles: print(f'  translation {loc}: ' + os.path.join(sdir, 'build', f"{meta['id']}.tr.{loc}.json"))
if int((meta.get('authoring') or {}).get('rules', 0)) >= 2:   # the languages every new pack gets (CONTENT_SPEC.md; pipeline steps translate + bridges)
    want_t, _want_b, pairs = noema_core.required_locales(meta.get('language')); own = (meta.get('language') or 'en').split('-')[0].lower()
    bdir = lambda src: os.path.join(sdir, 'bridges', *([] if src == own else ['from-' + src]))   # a translation's bridges: bridges/from-<locale>/
    miss_t = [l for l in want_t if l not in translations]
    miss_n = [l for l in want_t if not (((meta.get('i18n') or {}).get(l) or {}).get('title'))]   # the subject's name in each translation (subject.json "i18n")
    miss_b = [f'{a}→{b}' for a, b in pairs if not os.path.exists(os.path.join(bdir(a), b + '.json'))]
    todo = [miss_t and 'translations ' + ', '.join(miss_t) + ' (translations/<locale>/chNN.json)', miss_n and "the subject's name in " + ', '.join(miss_n) + ' (subject.json "i18n": {"<locale>": {title, description, hero, …}})',
            miss_b and '文A bridges ' + ', '.join(miss_b) + ' (bridges/<native>.json from the pack\'s language, bridges/from-<locale>/<native>.json from a translation — after it; tools/bridge.py --from)']
    if any(todo): print('  still to do before the flow ends: ' + '; '.join(x for x in todo if x))
