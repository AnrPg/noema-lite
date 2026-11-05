#!/usr/bin/env python3
"""Check a subject's activities without a browser (docs/INTERACTIVE.md): the registry, each bundle (no network, no inline
handlers, no eval, no storage, no visible text, size), the string tables (same keys in every language, one for each language
the pack is read in), the fallback, and every interactive block and sim exercise that uses them; an H5P item (h5p@1): its .h5p
file (activities/<id>/item.h5p) with the rules of h5p_check.py (allowed content types and libraries, no outside links, no
scripts outside the libraries, file types, sizes), and each content.<locale>.json with the same rules. The same rules as make_pack.py.
  python3 activity_lint.py SUBJECT_DIR
Exit code 1 when there are errors."""
import os, sys, json, glob
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.append(os.path.join(HERE, '..', '..', '..', 'tools'))   # (the skill zip has activities.py beside it; the repository in tools/)
import activities as A
a = sys.argv[1:]
if not a: print(__doc__); sys.exit(1)
sdir = os.path.abspath(a[0])
reg, probs = A.load_activities(sdir)
if reg is None and not probs: print('no activities/activities.json — nothing to check'); sys.exit(0)
rj = lambda p, d: json.load(open(p, encoding='utf-8')) if os.path.exists(p) else d
meta = rj(os.path.join(sdir, 'subject.json'), {})
media = {m['id']: m for m in rj(os.path.join(sdir, 'media', 'media.json'), {'items': []}).get('items', []) if 'id' in m}
chapters = [rj(f, {}) for f in sorted(glob.glob(os.path.join(sdir, 'chapters', '*.json')))]
locs = sorted({os.path.basename(d) for d in glob.glob(os.path.join(sdir, 'translations', '*')) if os.path.isdir(d)})
E_, W_ = A.check_activities({'activities': reg, 'media': media, 'subject': meta, 'chapters': chapters, 'requires': A.requires(reg)}, locs)
def _h5p(x):   # h5p@1: the package beside the pack
    f = os.path.join(sdir, *str(x.get('entry') or '').split('/'))
    return open(f, 'rb').read() if os.path.isfile(f) else None
HE, HW = A.check_h5p_packages({'activities': reg or {}}, _h5p) if any((x or {}).get('runtime') == 'h5p@1' and _h5p(x) is not None for x in (reg or {}).get('items') or []) else ([], [])
E_ += HE; W_ += HW
E_ = [p for p in probs if p.startswith('ERROR')] + E_
for w in W_: print('WARN ' + w)
for e in E_: print('ERROR ' + e)
n = len((reg or {}).get('items') or [])
print(f'\n{"✗" if E_ else "✓"} {n} activit{"y" if n == 1 else "ies"}: {len(E_)} error(s), {len(W_)} warning(s)' + ('' if E_ else ' — next: activity_test.py, activity_preview.py'))
sys.exit(1 if E_ else 0)
