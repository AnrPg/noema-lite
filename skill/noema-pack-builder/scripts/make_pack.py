#!/usr/bin/env python3
"""Validate a subject folder and build its package for noema-lite.
  python3 make_pack.py SUBJECT_DIR [OUT_DIR]
    → OUT_DIR/<id>.noema.zip   THE PACKAGE: pack.json + sources/<every original file>  (default OUT_DIR: /mnt/user-data/outputs or .)
    → SUBJECT_DIR/build/<id>.json   the pack alone (for noema_start_upload / noema_save_pack)
Every source with "file": "sources/<name>" must have that file in SUBJECT_DIR/sources/ (exactly the files the learner
gave — or the parts of a split PDF, one source per part), and every file there must belong to a source.
Exit code 1 (and a list of errors) when anything is wrong — fix and run again. Never deliver a pack that fails."""
import os, sys, json, subprocess, tempfile, datetime
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from noema_lib import load_subject, load_media, content_hash, package_sources, write_bundle, load_translations, pack_i18n
a = sys.argv[1:]
if not a: print(__doc__); sys.exit(1)
sdir = os.path.abspath(a[0])
out_dir = a[1] if len(a) > 1 else ('/mnt/user-data/outputs' if os.path.isdir('/mnt/user-data/outputs') else '.')
meta, sources, chapters, report = load_subject(sdir)
media, mrep = load_media(sdir)
translations = load_translations(sdir, chapters)   # optional: translations/<locale>/chNN.json (CONTENT_SPEC.md "Packs in several languages")
base_ids, base_chapters = (), ()
try:
    _u = json.load(open(os.path.join(sdir, '.unpacked.json'), encoding='utf-8'))
    base_ids, base_chapters = set(_u.get('sourcesWithFiles') or []), set(_u.get('chapters') or [])
except Exception: pass
sources, files, ferrs, fwarns = package_sources(sdir, sources, chapters, base_ids)
errs = [r for r in report + mrep if r.startswith('ERROR')] + ferrs
for w in mrep + fwarns:
    if w.startswith('WARN'): print(w)
auth = meta.get('authoring') or {}
per_pic = int(auth.get('minExercisesPerPicture', 3)); min_vis = int(auth.get('minVisualPerChapter', 3))
# every exercise type, difficulty and focus tag >= minPerKind times per chapter (pack_rules.json); chapters of an older pack
# being extended (unpack.py) only warn, new chapters must pass
per_kind = int(auth.get('minPerKind', 3)); feats = ','.join(k for k, v in (meta.get('features') or {}).items() if v)
balance = lambda cid: (['--balance-warn' if cid in base_chapters else '--balance', str(per_kind), '--features', feats] if per_kind else [])
used = Counter(e.get('media') for c in chapters for e in c['exercises'] if e['type'].startswith('img_'))
for m in media:
    if used[m] < per_pic: errs.append(f'ERROR media {m}: used by {used[m]} exercise(s); every picture needs >= {per_pic}')
with tempfile.TemporaryDirectory() as td:
    mp = os.path.join(td, 'media.json'); json.dump({k: {'w': v['w'], 'h': v['h'], 'regions': v.get('regions')} for k, v in media.items()}, open(mp, 'w', encoding='utf-8'))
    for c in chapters:
        p = os.path.join(td, c['id'] + '.json'); json.dump(c, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        r = subprocess.run([sys.executable, os.path.join(HERE, 'validate.py'), p, '--media', mp, '--min-visual', str(min_vis), *balance(c['id'])], capture_output=True, text=True)
        print(r.stdout.splitlines()[0] if r.stdout else c['id'])
        for l in r.stdout.splitlines():
            if l.startswith('WARN: [balance'): print(f'{c["id"]}: ' + l)
        errs += [f'{c["id"]}: ' + l for l in r.stdout.splitlines() if l.startswith('ERROR')]
    if translations or 'i18n' in meta:   # the other languages: subject.i18n, and every translated chapter against its source
        r = subprocess.run([sys.executable, os.path.join(HERE, 'validate.py'), os.path.join(sdir, 'subject.json'), '--subject', '--translations', ','.join(translations)], capture_output=True, text=True)
        for l in r.stdout.splitlines():
            if l.startswith('WARN'): print('subject.json: ' + l)
        errs += ['subject.json: ' + l for l in r.stdout.splitlines() if l.startswith('ERROR')]
    for loc, chs in translations.items():
        for c in chs:
            if not any(x['id'] == c.get('id') for x in chapters): errs.append(f'ERROR translations/{loc}/{c.get("id")}: not a chapter of the subject'); continue
            p = os.path.join(td, f'{loc}.{c["id"]}.json'); json.dump(c, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
            r = subprocess.run([sys.executable, os.path.join(HERE, 'validate.py'), p, '--media', mp, '--min-visual', str(min_vis), '--source', os.path.join(td, c['id'] + '.json')], capture_output=True, text=True)
            print(f'translations/{loc}: ' + (r.stdout.splitlines()[0] if r.stdout else c['id']))
            errs += [f'translations/{loc}/{c["id"]}: ' + l for l in r.stdout.splitlines() if l.startswith('ERROR')]
if errs:
    print('\n'.join(errs)); print(f'\n✗ {len(errs)} error(s) — pack NOT written.'); sys.exit(1)
counts = {'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'exercises': sum(len(c['exercises']) for c in chapters),
          'playbooks': sum(len(c.get('debug', [])) for c in chapters), 'flashcards': sum(len(c.get('flashcards', [])) for c in chapters),
          'visual': sum(1 for c in chapters for e in c['exercises'] if e['type'].startswith('img_')), 'media': len(media)}
meta = dict(meta); meta['owner'] = None
pack = {'format': 'noema-pack', 'v': 1, 'subject': meta, 'sources': sources, 'chapters': chapters, 'media': media, 'counts': counts,
        'builtAt': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(), 'builtWith': 'noema-pack-builder skill'}
tr = pack_i18n(pack, translations)   # pack schema v2 when the pack offers other languages
pack['version'] = content_hash({'s': meta, 'src': sources, 'c': chapters, 'm': {k: v.get('sha') or v.get('url') for k, v in media.items()}, **({'t': tr} if tr else {})})
counts['sourceFiles'] = len(files)
jout = os.path.join(sdir, 'build', meta['id'] + '.json'); os.makedirs(os.path.dirname(jout), exist_ok=True)
with open(jout, 'w', encoding='utf-8') as f: json.dump(pack, f, ensure_ascii=False, separators=(',', ':'))
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, meta['id'] + '.noema.zip')
write_bundle(out, pack, files)
mb = lambda n: f'{n / 1048576:.1f} MB' if n >= 1048576 else f'{n // 1024} KB'
print(f'\n✓ {out}  ({mb(os.path.getsize(out))}) · {counts["chapters"]} chapters · {counts["exercises"]} exercises ({counts["visual"]} visual) · {counts["media"]} pictures · {len(files)} source file(s)')
for sid, p, rel in files: print(f'   📎 {sid}: {rel} ({mb(os.path.getsize(p))})')
print(f'  pack alone (for the connector upload): {jout}')
