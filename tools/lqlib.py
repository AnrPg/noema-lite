"""Shared helpers for noema-lite tools (stdlib only — runs anywhere Python 3.8+ runs)."""
import json, os, glob, hashlib, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
LIB = os.path.join(ROOT, 'library')
ACC = os.path.join(ROOT, 'accounts')

def rj(p, default=None):
    if default is not None and not os.path.exists(p): return default
    with open(p, encoding='utf-8') as f: return json.load(f)

def wj(p, obj, compact=False):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        if compact: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        else: json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)

def wt(p, text):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: f.write(text)
    os.replace(tmp, p)

def now_iso(): return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()

def subject_dirs():
    """Yield (subject_dir, owner) for shared subjects and every account's private subjects."""
    for d in sorted(glob.glob(os.path.join(LIB, 'subjects', '*', 'subject.json'))):
        yield os.path.dirname(d), None
    for d in sorted(glob.glob(os.path.join(ACC, '*', 'packs', '*', 'subject.json'))):
        yield os.path.dirname(d), os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(d))))

def find_subject(sid):
    for d, owner in subject_dirs():
        if os.path.basename(d) == sid: return d, owner
    raise SystemExit(f'subject "{sid}" not found')

def load_subject(sdir):
    """Return (meta, sources, chapters, report): base chapters + additive patches, every item tagged with its source."""
    meta = rj(os.path.join(sdir, 'subject.json'))
    SRC = rj(os.path.join(sdir, 'sources.json'), {'sources': [], 'chapters': {}, 'patches': {}})
    chs = {}
    for f in sorted(glob.glob(os.path.join(sdir, 'chapters', 'ch*.json'))):
        c = rj(f); chs[c['id']] = c
        c.setdefault('src', SRC.get('chapters', {}).get(c['id']) or (SRC['sources'][0]['id'] if SRC.get('sources') else None))
    report = []
    for pf in sorted(glob.glob(os.path.join(sdir, 'patches', '*.json'))):
        P = rj(pf); psrc = SRC.get('patches', {}).get(os.path.basename(pf))
        for p in P['patches']:
            if psrc:
                for k in ('appendBlocks', 'appendExercises', 'appendFlashcards', 'appendPitfalls', 'appendDebug'):
                    for it in p.get(k, []): it.setdefault('src', psrc)
            c = chs.get(p['chapter'])
            if not c: report.append(f'ERROR {pf}: unknown chapter {p["chapter"]}'); continue
            if p.get('appendBlocks'):
                sec = next((s for s in c['sections'] if s['id'] == p.get('section')), None)
                if not sec: report.append(f'ERROR {pf}: unknown section {p.get("section")}'); continue
                sec['blocks'].extend(p['appendBlocks'])
            c['exercises'].extend(p.get('appendExercises', []))
            c['flashcards'].extend(p.get('appendFlashcards', []))
            c['pitfalls'].extend(p.get('appendPitfalls', []))
            c['debug'].extend(p.get('appendDebug', []))
            report.append(f'{os.path.basename(pf)} -> {p["chapter"]}/{p.get("section")}')
    return meta, SRC, [chs[k] for k in sorted(chs)], report

def content_hash(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()[:16]
