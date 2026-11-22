#!/usr/bin/env python3
"""The deep quality audit of a pack: every rule at today's strictness (Q0–Q8, whatever the pack's authoring.rules or age),
plus a learning report per chapter — depth, gradual introduction, retention, interactivity, variety — each with its numbers,
what to add (the engines of the library that fit, too) and the questions only a reader can answer.
  python3 audit.py work/<id>          a subject folder (chapters/, map/, review/, media/, activities/, translations/)
  python3 audit.py PACK.json          a built, downloaded (noema_get_pack_url) or uploaded pack
  --json                              the audit as JSON instead of text
Exit code 0 when the pack is high quality (no rule error, score >= 85), 1 otherwise. The same code as the connector's
noema_quality_audit. It saves nothing: fix in place (docs/PIPELINES.md §1c), then make_pack.py and upload again."""
import json, os, sys
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import noema_core
from noema_lib import load_subject, load_media, load_activities, load_translations, pack_i18n, fallback_media

def from_dir(d):
    meta, sources, chapters, _ = load_subject(d)
    for c in chapters:
        for k in ('map', 'review'):
            f = os.path.join(d, k, c['id'] + '.json')
            if os.path.exists(f): c[k] = json.load(open(f, encoding='utf-8'))
    acts, _ = load_activities(d)
    media, _ = load_media(d, stills=fallback_media(acts))   # embedded, as make_pack.py packs them (a local picture needs its data)
    p = {'format': 'noema-pack', 'v': 3, 'subject': meta, 'sources': sources, 'chapters': chapters, 'media': media}
    if acts and acts.get('items'):   # the registry as make_pack.py writes it: its parts and what it requires
        p['activities'] = {'format': 'noema.activities/v1', 'items': acts['items'], **({'parts': acts['parts']} if acts.get('parts') else {})}
        p['requires'] = noema_core.requires(acts)
    tr = load_translations(d, chapters)
    if tr: pack_i18n(p, tr, external=False)
    return p

def main(a):
    if not a or a[0] in ('-h', '--help'): print(__doc__); return 1
    src = a[0]
    p = from_dir(src) if os.path.isdir(src) else json.load(open(src, encoding='utf-8'))
    r = noema_core.audit_pack(p)
    if '--json' in a: print(json.dumps(r['audit'], ensure_ascii=False, indent=1))
    else: print(r['report'])
    au = r['audit']
    return 0 if au['verdict'] == 'high' else 1

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
