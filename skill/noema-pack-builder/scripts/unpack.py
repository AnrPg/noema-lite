#!/usr/bin/env python3
"""Turn an existing pack back into a subject folder: to REPAIR it (--repair) or for additive updates.
  python3 unpack.py PACK.noema.zip|PACK.json WORKDIR [--repair] [--languages JSON]
      → WORKDIR/<id>/ (subject.json, sources.json, chapters/, map/, review/, media/, activities/, sources/, translations/)
--repair: a pack the upload refused, or one whose work folder is gone (noema_get_pack_url → curl): every chapter is yours to
fix in place and is held to every rule again. Fix only what the errors name (chapters/chNN.json, map/chNN.json …), then
pipeline.py start + check (each step passes at once where nothing is wrong; status names what changed), make_pack.py, upload.
It gives every flashcard without a valid id a stable one (<chapter>-fNNN by its place; the app moves its progress) and lists
the fields the current schema requires that are missing (the chapter check of make_pack.py).
--languages JSON: the languages of the pack's Roadmap as noema_get_pack_url gives them ('{"translations": []}' for a Roadmap in its
own language only) → subject.json authoring.languages, so the pipeline and make_pack.py ask only for those.
A .noema.zip package also gives back the original source files (sources/). From a plain .json the files are not there:
the learner already has them, so make_pack.py keeps those sources as they are.
Existing chapters become the base files: never renumber or delete their ids — add new chapters (next chNN)
or patches/*.json (appendBlocks / appendExercises …) so the learner keeps all progress."""
import os, sys, json, base64, re
for _s in (sys.stdout, sys.stderr):   # UTF-8 output on Windows / macOS / Linux alike
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
a = sys.argv[1:]
repair = '--repair' in a; a = [x for x in a if x != '--repair']
langs = None   # --languages JSON: the Roadmap's languages (noema_get_pack_url names them) → subject.json authoring.languages
if '--languages' in a:
    i = a.index('--languages'); raw = a[i + 1] if i + 1 < len(a) else ''; a = a[:i] + a[i + 2:]
    try: langs = json.loads(raw)
    except Exception: sys.exit('--languages: ONE JSON object such as \'{"translations": []}\' (the Roadmap\'s languages, as noema_get_pack_url gives them)')
    if not isinstance(langs, dict) or not isinstance(langs.get('translations'), list): sys.exit('--languages: {"translations": [...], "bridges": [...] (optional)}')
if len(a) < 2: print(__doc__); sys.exit(1)
import zipfile
bundle = None
if zipfile.is_zipfile(a[0]):
    bundle = zipfile.ZipFile(a[0])
    if 'pack.json' not in bundle.namelist(): sys.exit('not a noema-lite package (no pack.json inside)')
    p = json.loads(bundle.read('pack.json').decode('utf-8'))
else: p = json.load(open(a[0], encoding='utf-8'))
if p.get('format') != 'noema-pack': sys.exit('not a noema-pack file')
sid = p['subject']['id']; d = os.path.join(a[1], sid)
for sub in ('chapters', 'patches', 'media', 'sources', 'coverage', 'map', 'review'): os.makedirs(os.path.join(d, sub), exist_ok=True)
subj = {k: v for k, v in p['subject'].items() if k not in ('owner',)}
subj.setdefault('authoring', {'minVisualPerChapter': 3, 'minExercisesPerPicture': 3})
if langs is not None: subj['authoring']['languages'] = langs
json.dump(subj, open(os.path.join(d, 'subject.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
SRC = p.get('sources') or {'sources': [], 'chapters': {}, 'patches': {}}
restored, kept = [], []
for s in SRC.get('sources', []):
    f = str(s.get('file') or '')
    if not f or f.startswith(('http://', 'https://')): continue
    if bundle and f in bundle.namelist() and f.startswith('sources/') and '..' not in f.split('/'):
        dst = os.path.join(d, *f.split('/')); os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(bundle.read(f)); restored.append(f)
    else: kept.append(s['id'])
json.dump(SRC, open(os.path.join(d, 'sources.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# the chapters of an additive update are its base (make_pack.py keeps their checks as warnings); a repair has no base: every
# chapter is checked as new
json.dump({'from': os.path.basename(a[0]), 'sourcesWithFiles': kept, 'chapters': [] if repair else [c['id'] for c in p['chapters']], 'repair': repair}, open(os.path.join(d, '.unpacked.json'), 'w', encoding='utf-8'))
CARD = re.compile(r'^ch\d\d-f\d{3}$')
def card_ids(cid, cards):
    """--repair: every flashcard gets a stable id <chapter>-fNNN (progress is keyed by it): a card that has a valid one keeps it;
    the others get the number of their place (the first card f001…), or the next free one — the same ids on every download of
    the same pack, so the app moves each card's progress from its place (chNN#k) to its id. → [(place, id)] given"""
    have = {f.get('id') for f in cards if isinstance(f, dict) and isinstance(f.get('id'), str) and f['id'].startswith(cid + '-f') and CARD.match(f['id'])}
    seen, out = set(), []
    nxt = lambda: next(n for n in range(1, 10000) if f'{cid}-f{n:03d}' not in have | seen)
    for k, f in enumerate(cards):
        if not isinstance(f, dict): continue
        fid = f.get('id')
        if isinstance(fid, str) and fid in have and fid not in seen: seen.add(fid); continue
        want = f'{cid}-f{k + 1:03d}'
        new = want if want not in have and want not in seen else f'{cid}-f{nxt():03d}'
        f['id'] = new; seen.add(new); out.append((k, new))
    return out
fixed_cards = {}
for c in p['chapters']:
    c = {k: v for k, v in c.items() if not k.startswith('_')}
    if repair and isinstance(c.get('flashcards'), list) and re.fullmatch(r'ch\d\d', str(c.get('id') or '')):
        given = card_ids(c['id'], c['flashcards'])
        if given: fixed_cards[c['id']] = given
    for k in ('map', 'review'):   # the knowledge map and the review go back to their own files (map/chNN.json, review/chNN.json; make_pack.py reads them with the quality rules, rules >= 2)
        if isinstance(c.get(k), dict) and int((subj.get('authoring') or {}).get('rules', 0) or 0) >= 2: json.dump(c.pop(k), open(os.path.join(d, k, c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(c, open(os.path.join(d, 'chapters', c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
def tr_chapters(loc, t):   # inline, or in its own file: translations/<locale>.json in the package, or <id>.tr.<locale>.json beside the .json
    if isinstance(t.get('chapters'), list): return t['chapters']
    if bundle and f'translations/{loc}.json' in bundle.namelist(): return json.loads(bundle.read(f'translations/{loc}.json').decode('utf-8')).get('chapters') or []
    here = os.path.dirname(os.path.abspath(a[0])); f = os.path.join(here, f'{sid}.tr.{loc}.json')
    for g in (f, os.path.join(here, f'tr.{loc}.json')):   # (tr.<locale>.json: a library subject's, beside its pack.json)
        if os.path.exists(g): return json.load(open(g, encoding='utf-8')).get('chapters') or []
    print(f'⚠️ translation {loc}: its file is not here ({os.path.basename(f)}) — translate the chapters again or get the file'); return []
for loc, t in (p.get('translations') or {}).items():   # a pack in several languages: translations/<locale>/chNN.json
    for c in tr_chapters(loc, t):
        c = {k: v for k, v in c.items() if not k.startswith('_')}
        for k, fid in fixed_cards.get(c.get('id'), []):   # the translation's card at the same place gets the same id
            cards = c.get('flashcards') if isinstance(c.get('flashcards'), list) else []
            if k < len(cards) and isinstance(cards[k], dict): cards[k]['id'] = fid
        os.makedirs(os.path.join(d, 'translations', loc), exist_ok=True)
        if isinstance(c.get('map'), dict):   # its knowledge map in that language: translations/<locale>/map/chNN.json (make_pack.py reads it back)
            os.makedirs(os.path.join(d, 'translations', loc, 'map'), exist_ok=True)
            json.dump(c.pop('map'), open(os.path.join(d, 'translations', loc, 'map', c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        json.dump(c, open(os.path.join(d, 'translations', loc, c['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
EXT = {'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp'}
items = []
for mid, m in (p.get('media') or {}).items():
    if not m.get('data'):    # a "fetch": "app" web picture (the app downloads it): keep url + size, no file
        items.append({k: v for k, v in m.items() if k not in ('mime', 'sha')} | {'id': mid, 'fetch': 'app'}); continue
    mt = re.match(r'data:([^;,]+)(;base64)?,(.*)', m['data'], re.S)
    raw = base64.b64decode(mt.group(3)) if mt.group(2) else mt.group(3).encode()
    fn = mid + EXT.get(mt.group(1), '.bin'); open(os.path.join(d, 'media', fn), 'wb').write(raw)
    loc_i18n = {}
    for loc, L in (m.get('i18n') or {}).items():   # the picture in another language: media/<id>.<locale>.<ext> (i18n.<locale>.file)
        L = dict(L) if isinstance(L, dict) else {}
        lm = re.match(r'data:([^;,]+)(;base64)?,(.*)', L.pop('data', '') or '', re.S); L.pop('sha', None)
        if lm:
            lfn = f'{mid}.{loc}' + EXT.get(lm.group(1), '.bin')
            open(os.path.join(d, 'media', lfn), 'wb').write(base64.b64decode(lm.group(3)) if lm.group(2) else lm.group(3).encode())
            L['file'] = lfn
        loc_i18n[loc] = L
    items.append({k: v for k, v in m.items() if k not in ('data', 'mime', 'sha', 'w', 'h') or (k in ('w', 'h') and not fn.endswith('.svg'))} | {'id': mid, 'file': fn} | ({'i18n': loc_i18n} if loc_i18n else {}))
json.dump({'format': 'noema.media/v1', 'items': items}, open(os.path.join(d, 'media', 'media.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
acts = (p.get('activities') or {}).get('items') or []   # interactive activities (docs/INTERACTIVE.md): back to activities/activities.json + activities/<id>/
if acts:
    reg = []
    for x in acts:
        aid = str(x.get('id') or '')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', aid): print(f'⚠️ activity {aid!r}: not a valid id, skipped'); continue
        ad = os.path.join(d, 'activities', aid); os.makedirs(ad, exist_ok=True)
        e = {k: v for k, v in x.items() if k not in ('html', 'python', 'sha256', 'bytes', 'strings', 'spec', 'h5p', 'h5pByLocale', 'wasm')}   # (external-embed@1: no file, no entry — its url, provider, credit stay in the registry)
        if x.get('runtime') == 'h5p@1':   # the .h5p file travels beside the pack: in the .noema.zip, inline (one-file copies), or next to a pack.json
            # the file is looked for under the item's own entry (checked: activities/….h5p, no ..); only the unpacked folder's name is item.h5p
            e['entry'] = f'activities/{aid}/item.h5p'; ent = str(x.get('entry') or ''); raw = None
            if not re.fullmatch(r'activities/[^\\:]+\.h5p', ent) or '..' in ent.split('/') or '' in ent.split('/'): ent = e['entry']
            if bundle and ent in bundle.namelist(): raw = bundle.read(ent)
            elif isinstance(x.get('h5p'), str): raw = base64.b64decode(re.sub(r'^data:[^,]*;base64,', '', x['h5p']))
            else:
                here = os.path.dirname(os.path.abspath(a[0]))
                for g in dict.fromkeys((os.path.join(here, *ent.split('/')), os.path.join(here, *e['entry'].split('/')), os.path.join(here, f'{sid}.act.{aid}.h5p'))):
                    if os.path.isfile(g): raw = open(g, 'rb').read(); break
            if raw is None: print(f'⚠️ activity {aid}: its .h5p file is not here ({ent}) — get the file (it is inside {sid}.noema.zip) and put it there')
            else: open(os.path.join(ad, 'item.h5p'), 'wb').write(raw)
            rest = {}
            for loc, v in (x.get('h5pByLocale') if isinstance(x.get('h5pByLocale'), dict) else {}).items():   # content.<locale>.json / l10n.<locale>.json
                if not re.fullmatch(r'[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4}){0,2}', str(loc)) or not isinstance(v, dict): continue
                for kind in ('content', 'l10n'):
                    if isinstance(v.get(kind), dict): json.dump(v[kind], open(os.path.join(ad, f'{kind}.{loc}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                left = {k: w for k, w in v.items() if k not in ('content', 'l10n')}   # another package for this language stays in the registry
                if left: rest[loc] = left
            if rest: e['h5pByLocale'] = rest
        if isinstance(x.get('html'), str):
            e['entry'] = f'activities/{aid}/app.html'; open(os.path.join(ad, 'app.html'), 'w', encoding='utf-8', newline='').write(x['html'])
        if 'spec' in x:   # sim-spec@1: the spec is data (activities/<id>/spec.json); wasm-module@1: its own spec, beside module.wasm
            e['entry'] = f'activities/{aid}/spec.json'; json.dump(x['spec'], open(os.path.join(ad, 'spec.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if isinstance(x.get('wasm'), str):   # wasm-module@1: the module back as bytes (activities/<id>/module.wasm; make_pack.py writes base64 + sha256 + bytes again)
            try: raw = base64.b64decode(x['wasm'], validate=True)
            except Exception: print(f'⚠️ activity {aid}: the module is not valid base64, skipped'); continue
            e['entry'] = f'activities/{aid}/module.wasm'; open(os.path.join(ad, 'module.wasm'), 'wb').write(raw)
        if isinstance(x.get('python'), str):   # py-module@1: the Python file is the entry (activities/<id>/main.py), its spec beside it
            e['entry'] = f'activities/{aid}/main.py'; open(os.path.join(ad, 'main.py'), 'w', encoding='utf-8', newline='').write(x['python'])
        for loc, tab in (x.get('strings') or {}).items():
            if re.fullmatch(r'[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4}){0,2}', str(loc)): json.dump(tab, open(os.path.join(ad, f'strings.{loc}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        reg.append(e)
    json.dump({'format': (p.get('activities') or {}).get('format') or 'noema.activities/v1', 'items': reg}, open(os.path.join(d, 'activities', 'activities.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for pn, pd in ((p.get('activities') or {}).get('parts') or {}).items():   # activities/_parts/<name>.json: the parts the specs reuse ("use", docs/INTERACTIVE.md §12.8)
        if re.fullmatch(r'[a-z0-9][a-z0-9-]{0,60}', str(pn)) and isinstance(pd, dict):
            os.makedirs(os.path.join(d, 'activities', '_parts'), exist_ok=True); json.dump(pd, open(os.path.join(d, 'activities', '_parts', pn + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if repair:
    if fixed_cards:
        print(f'repair: {sum(len(v) for v in fixed_cards.values())} flashcard(s) had no valid id — given <chapter>-fNNN by their place '
              f'({", ".join(f"{c}: {len(v)}" for c, v in fixed_cards.items())}); the app moves their progress to the new ids')
    # what today's rules still refuse: the same chapter check as make_pack.py and the audit (fields a fix needs a person for:
    # a spotbug's fix, a model answer's keywords, an unknown tag…) — listed by kind, so nothing waits until make_pack.py
    try:
        HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
        import noema_core
        chs = [json.load(open(os.path.join(d, 'chapters', c['id'] + '.json'), encoding='utf-8')) for c in p['chapters']]
        res = noema_core.batch([('chapter.check', c, {}) for c in chs])
        from collections import Counter
        kinds = Counter(); first = {}
        for c, r in zip(chs, res):
            for e in r['errors']:
                k = re.sub(r"\b(ch\d\d-[a-z]\d{3}|ch\d\d-s\d\d|\d+)\b", '#', e)[:90]; kinds[k] += 1; first.setdefault(k, f"{c['id']}: {e}")
        if kinds:
            print(f'repair: {sum(kinds.values())} field(s) the current schema requires are missing or wrong — fix them first (python3 audit.py {d} lists every rule):')
            for k, n in kinds.most_common(12): print(f'  {n}× {first[k]}')
    except Exception as e: print(f'(the schema check could not run here: {e} — python3 audit.py {d} lists it)')
    print(f'repair: fix only what the errors name, in place (chapters/chNN.json, map/chNN.json, translations/<locale>/chNN.json …); then\n'
          f'  python3 pipeline.py start 4 {d}   (once) and python3 pipeline.py next {d} → check each step (the parts that are right pass at once)\n'
          f'  python3 make_pack.py {d} <out> → upload again (noema_start_upload → curl → noema_finish_upload, same subject id)')
print(f'unpacked {sid}: {len(p["chapters"])} chapters, {len(items)} pictures, {len(acts)} activities, {len(restored)} source file(s) → {d}' + (f'  ({len(kept)} source file(s) stay in the learner\'s account: {", ".join(kept)})' if kept else ''))
