#!/usr/bin/env python3
"""The language courses' explanation facades ⇄ Weblate (docs/i18n.md §9.4, docs/language-packs.md §3). No network.

  python3 tools/i18n/weblate_facades.py export <course> --out <dir> [--locales el,ru] [--master DIR] [--draft-by claude]
  python3 tools/i18n/weblate_facades.py import <course> --from <dir> [--locales el] [--master DIR | --no-master]
                                               [--write] [--no-manifest] [--by weblate]
  python3 tools/i18n/weblate_facades.py check  <dir>

Weblate cannot translate facades/<locale>/*.json as they are ({address: {t, src, by}}: three values per text, and the
addresses contain dots, so "JSON nested" would split them). This tool converts them to Weblate's "JSON file" format
(flat, monolingual) and back, one directory per facade file:

  <dir>/INDEX.json                                   the components (one per facade file) and where each one lives
  <dir>/<course>/<file>/en.json                      the English master   {"<address>#<hash>": "<master text>"}
  <dir>/<course>/<file>/<locale>.json                REVIEWED translations {"<address>#<hash>": "<text>"}
  <dir>/<course>/<file>/drafts/<locale>.json         Claude's drafts (and reviewed texts whose master changed since):
                                                     uploaded as "needs editing" by weblate_import_drafts.py --facades
  <dir>/_phenomena/<L>/…, <dir>/_typology/…          the texts shared by every course

The key carries the hash of the master text (`src`, the first 12 hex digits of its SHA-256 — tools/lang_facade.py
text_hash). A changed master text is therefore a NEW key in Weblate (the old translation is offered by its translation
memory) and every translation Weblate writes is bound to the exact master text it was approved against: `import`
writes it with src = that hash, so `lang_facade.py parity` still tells stale from done.

export  needs the master: it runs `tools/lang_facade.py extract <course> --out <tmp>` unless --master gives such a
        directory. A facade entry goes to <locale>.json when it was reviewed (its `by` is not a draft marker, default
        `claude`) and its src is the master's hash; otherwise to drafts/<locale>.json. Entries whose address is no
        longer in the master are left out (counted as orphans). Every locale gets a <locale>.json, even an empty one,
        so the language exists in Weblate.
import  reads the files Weblate wrote (the merged pull request on the exchange branch) and writes the changed
        entries into the course's facades with by = "weblate" (dry run without --write). It never deletes an entry.
        With the current master (default: extracted; --master DIR; --no-master skips this guard) it skips a translation
        made for an older master text when the facade already has one for the current text ("superseded"), and
        addresses no longer in the master ("orphan"). Then it refreshes facades/<locale>/facade.json (coverage) unless
        --no-manifest. The Weblate project MUST use the commit policy "Only include approved translations": every
        string in a Weblate-written file is taken as approved.
check   the exchange tree is well formed: keys "<address>#<12 hex>", the hash of every en.json key is its text's hash,
        no translation key that en.json lacks (warning: Weblate's cleanup add-on removes those).

Exit 0 when nothing is wrong, 1 otherwise.
"""
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LANG_FACADE = os.path.join(REPO, 'tools', 'lang_facade.py')
FORMAT = 'noema.weblate-facades/v1'
KEY_RE = re.compile(r'^(?P<addr>.+)#(?P<h>[0-9a-f]{12})$', re.S)
DRAFT_BY = ('claude',)


def text_hash(text):
    """The same hash as tools/lang_facade.py text_hash (src of a facade entry)."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:12]


def key_of(addr, h):
    return f'{addr}#{h}'


def split_key(key):
    m = KEY_RE.match(key)
    return (m.group('addr'), m.group('h')) if m else (None, None)


def rjson(p):
    with open(p, encoding='utf-8') as f: return json.load(f, object_pairs_hook=OrderedDict)


def wjson(p, obj, indent=1):
    """The facades' own style (tools/lang_facade.py wjson): UTF-8, indent 1, a final newline."""
    os.makedirs(os.path.dirname(p), exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, indent=indent) + '\n'
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            if f.read() == data: return False
    with open(p, 'w', encoding='utf-8', newline='\n') as f: f.write(data)
    return True


# ------------------------------------------------------------------------------------------------ the master
def master_files(master_dir, cid):
    """[(scope, name, {addr: text})] of a master directory written by `lang_facade.py extract <course> --out DIR`."""
    out = []
    cdir = os.path.join(master_dir, cid, 'facades', 'en')
    for p in sorted(glob.glob(os.path.join(cdir, '*.json'))):
        if os.path.basename(p) != 'facade.json': out.append(('course', os.path.basename(p)[:-5], p))
    for p in sorted(glob.glob(os.path.join(master_dir, '_phenomena', 'facades', 'en', '*.json'))):
        out.append(('phenomena', os.path.basename(p)[:-5], p))
    p = os.path.join(master_dir, '_typology', 'facades', 'en.json')
    if os.path.exists(p): out.append(('typology', 'typology', p))
    res = []
    for scope, name, p in out:
        d = rjson(p)
        res.append((scope, name, OrderedDict((a, (e.get('t') if isinstance(e, dict) else e)) for a, e in d.items())))
    if not res: raise SystemExit(f'{master_dir}: no master facade files for {cid} (run tools/lang_facade.py extract {cid} --out DIR)')
    return res


def extract_master(course):
    """Run the repository's extractor into a temporary directory → its path (the caller removes it)."""
    tmp = tempfile.mkdtemp(prefix='noema-master-')
    r = subprocess.run([sys.executable, LANG_FACADE, 'extract', course, '--out', tmp], capture_output=True, text=True)
    if r.returncode:
        shutil.rmtree(tmp, ignore_errors=True)
        raise SystemExit(f'lang_facade.py extract failed:\n{r.stdout}{r.stderr}')
    return tmp


def component_of(cid, scope, name):
    """(exchange dir, Weblate slug, display name, facade path relative to the library with {locale})."""
    if scope == 'course':
        return f'{cid}/{name}', slug(f'{cid}-{name}'), f'{cid} · {name}', f'{cid}/facades/{{locale}}/{name}.json'
    if scope == 'phenomena':
        return f'_phenomena/{name}', slug(f'phenomena-{name}'), f'phenomena · {name}', f'_phenomena/facades/{{locale}}/{name}.json'
    return '_typology', 'typology', 'typology', '_typology/facades/{locale}.json'


def slug(s):
    return re.sub(r'[^a-z0-9_-]+', '-', s.lower()).strip('-')


def discover_locales(lib, cid):
    locs = set()
    for base in (os.path.join(lib, cid, 'facades'), os.path.join(lib, '_phenomena', 'facades')):
        if os.path.isdir(base): locs |= {d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))}
    typ = os.path.join(lib, '_typology', 'facades')
    if os.path.isdir(typ): locs |= {f[:-5] for f in os.listdir(typ) if f.endswith('.json')}
    locs.discard('en')
    return sorted(locs)


# ------------------------------------------------------------------------------------------------ export
def split_entries(master, facade, draft_by=DRAFT_BY):
    """master {addr: text}, facade {addr: {t, src, by}} → (reviewed {key: t}, drafts {key: t}, stats)."""
    reviewed, drafts = OrderedDict(), OrderedDict()
    st = {'reviewed': 0, 'drafts': 0, 'stale': 0, 'missing': 0, 'orphans': 0}
    for addr, text in master.items():
        h = text_hash(text); e = facade.get(addr); k = key_of(addr, h)
        t = e.get('t') if isinstance(e, dict) else (e if isinstance(e, str) else None)
        if not isinstance(t, str) or not t.strip(): st['missing'] += 1; continue
        if isinstance(e, dict) and e.get('by') not in draft_by and e.get('src') == h:
            reviewed[k] = t; st['reviewed'] += 1
        else:
            drafts[k] = t
            st['stale' if isinstance(e, dict) and e.get('by') not in draft_by else 'drafts'] += 1
    st['orphans'] = sum(1 for a in facade if a not in master)
    return reviewed, drafts, st


def export(course, out, locales=None, master_dir=None, draft_by=DRAFT_BY, log=print):
    course = os.path.abspath(course); lib = os.path.dirname(course); cid = os.path.basename(course)
    tmp = None
    if not master_dir: master_dir = tmp = extract_master(course)
    try:
        files = master_files(master_dir, cid)
    finally:
        if tmp: shutil.rmtree(tmp, ignore_errors=True)
    locales = locales or discover_locales(lib, cid)
    index = OrderedDict([('format', FORMAT), ('course', cid),
                         ('keys', '<address>#<first 12 hex digits of the SHA-256 of the English master text>'),
                         ('locales', locales), ('components', [])])
    total = {}
    for scope, name, master in files:
        d, sl, nm, fpath = component_of(cid, scope, name)
        cdir = os.path.join(out, d)
        wjson(os.path.join(cdir, 'en.json'), OrderedDict((key_of(a, text_hash(t)), t) for a, t in master.items()))
        for loc in locales:
            fp = os.path.join(lib, fpath.format(locale=loc))
            facade = rjson(fp) if os.path.exists(fp) else {}
            reviewed, drafts, st = split_entries(master, facade, draft_by)
            wjson(os.path.join(cdir, loc + '.json'), reviewed)
            dp = os.path.join(cdir, 'drafts', loc + '.json')
            if drafts: wjson(dp, drafts)
            elif os.path.exists(dp): os.remove(dp)
            for k, v in st.items(): total.setdefault(loc, {}).setdefault(k, 0); total[loc][k] += v
        index['components'].append(OrderedDict([('dir', d), ('slug', sl), ('name', nm), ('scope', scope), ('file', name),
                                                ('facade', fpath), ('strings', len(master))]))
    wjson(os.path.join(out, 'INDEX.json'), index, indent=2)
    for loc, st in total.items():
        log(f'{loc}: {st["reviewed"]} reviewed → <locale>.json · {st["drafts"]} drafts + {st["stale"]} stale reviewed → drafts/ · '
            f'{st["missing"]} untranslated · {st["orphans"]} orphan entries left out')
    log(f'export: {len(files)} component(s) → {out}')
    return index, total


# ------------------------------------------------------------------------------------------------ import
def load_index(src):
    p = os.path.join(src, 'INDEX.json')
    if not os.path.exists(p): raise SystemExit(f'{src}: no INDEX.json (made by weblate_facades.py export)')
    idx = rjson(p)
    if idx.get('format') != FORMAT: raise SystemExit(f'{p}: format {idx.get("format")!r}, expected {FORMAT}')
    return idx


def plan_file(flat, current, master=None, draft_by=DRAFT_BY, by='weblate'):
    """flat {key: t} (written by Weblate), current facade {addr: entry}, master {addr: text} or None →
    (changes {addr: entry}, stats)."""
    st = {'new': 0, 'changed': 0, 'approved_drafts': 0, 'unchanged': 0, 'superseded': 0, 'orphan': 0, 'empty': 0, 'bad_key': 0}
    changes = OrderedDict()
    mh = {a: text_hash(t) for a, t in master.items()} if master is not None else None
    for key, t in flat.items():
        addr, h = split_key(key)
        if addr is None: st['bad_key'] += 1; continue
        if not isinstance(t, str) or not t.strip(): st['empty'] += 1; continue
        e = current.get(addr)
        if mh is not None:
            if addr not in mh: st['orphan'] += 1; continue
            if h != mh[addr] and isinstance(e, dict) and e.get('src') == mh[addr]: st['superseded'] += 1; continue
        if isinstance(e, dict) and e.get('t') == t and e.get('src') == h:
            if e.get('by') not in draft_by: st['unchanged'] += 1; continue
            st['approved_drafts'] += 1
        elif isinstance(e, dict): st['changed'] += 1
        else: st['new'] += 1
        n = OrderedDict(e) if isinstance(e, dict) else OrderedDict()
        n['t'] = t; n['src'] = h; n['by'] = by
        changes[addr] = n
    return changes, st


def apply_changes(current, changes, order):
    """The facade with the changes and the smallest diff: entries stay where they are; new addresses go in sorted
    when the file is sorted by address (as the shipped facades are), else after the others in master order."""
    merged = OrderedDict(current)
    keys = list(current)
    was_sorted = keys == sorted(keys)
    pos = {a: i for i, a in enumerate(order)}
    for a in sorted((a for a in changes if a not in merged), key=lambda a: pos.get(a, 1 << 30)): merged[a] = changes[a]
    for a, e in changes.items(): merged[a] = e
    if was_sorted: merged = OrderedDict(sorted(merged.items()))
    return merged


def import_(course, src, locales=None, master_dir=None, use_master=True, write=False, manifest=True,
            draft_by=DRAFT_BY, by='weblate', log=print):
    course = os.path.abspath(course); lib = os.path.dirname(course); cid = os.path.basename(course)
    idx = load_index(src)
    if idx.get('course') != cid: raise SystemExit(f'{src}: exported for {idx.get("course")!r}, not {cid!r}')
    masters = None; tmp = None
    if use_master:
        if not master_dir: master_dir = tmp = extract_master(course)
        try:
            masters = {component_of(cid, s, n)[0]: m for s, n, m in master_files(master_dir, cid)}
        finally:
            if tmp: shutil.rmtree(tmp, ignore_errors=True)
    totals, touched = {}, set()
    for comp in idx['components']:
        cdir = os.path.join(src, comp['dir'])
        en = rjson(os.path.join(cdir, 'en.json')) if os.path.exists(os.path.join(cdir, 'en.json')) else {}
        master = masters.get(comp['dir'], OrderedDict()) if masters is not None else None
        order = list(master) if master is not None else [split_key(k)[0] for k in en]
        for p in sorted(glob.glob(os.path.join(cdir, '*.json'))):
            loc = os.path.basename(p)[:-5]
            if loc == 'en' or (locales and loc not in locales): continue
            fp = os.path.join(lib, comp['facade'].format(locale=loc))
            current = rjson(fp) if os.path.exists(fp) else OrderedDict()
            changes, st = plan_file(rjson(p), current, master, draft_by, by)
            for k, v in st.items(): totals.setdefault(loc, {}).setdefault(k, 0); totals[loc][k] += v
            if changes:
                log(f'  {comp["dir"]} {loc}: {len(changes)} to write ({st["new"]} new, {st["changed"]} changed, '
                    f'{st["approved_drafts"]} approved drafts)')
                if write:
                    wjson(fp, apply_changes(current, changes, order)); touched.add(loc)
    for loc, st in sorted(totals.items()):
        log(f'{loc}: ' + ' · '.join(f'{v} {k.replace("_", " ")}' for k, v in st.items() if v))
    if write and manifest and touched: refresh_manifests(course, sorted(touched), log)
    if not write: log('dry run: nothing written (add --write)')
    return totals


def refresh_manifests(course, locs, log=print):
    """facades/<locale>/facade.json: coverage again, the status kept (what tools/lang_facade.py merge does at its end)."""
    sys.path.insert(0, os.path.dirname(LANG_FACADE))
    import lang_facade as lf
    texts, _unreg, _dup = lf.collect(course, None)
    for loc in locs:
        entries, man = lf.load_facade(course, loc, texts)
        m = lf.write_manifest(course, loc, lf.for_locale(texts, loc), entries, (man or {}).get('status', 'draft'), ['*'])
        log(f'{loc}: facade.json coverage ' + ', '.join(f'tier {t}: {c["done"]}/{c["total"]} done, {c["stale"]} stale'
                                                       for t, c in m['coverage'].items()))


# ------------------------------------------------------------------------------------------------ check
def check(src, log=print):
    idx = load_index(src); bad = 0; warn = 0
    for comp in idx['components']:
        cdir = os.path.join(src, comp['dir']); enp = os.path.join(cdir, 'en.json')
        if not os.path.exists(enp): log(f'ERROR {comp["dir"]}: no en.json'); bad += 1; continue
        en = rjson(enp)
        for k, t in en.items():
            a, h = split_key(k)
            if a is None: log(f'ERROR {enp}: bad key {k!r}'); bad += 1
            elif h != text_hash(t): log(f'ERROR {enp}: {a}: the key hash is not the hash of its text'); bad += 1
        for p in sorted(glob.glob(os.path.join(cdir, '*.json')) + glob.glob(os.path.join(cdir, 'drafts', '*.json'))):
            if p == enp: continue
            for k, t in rjson(p).items():
                if split_key(k)[0] is None: log(f'ERROR {p}: bad key {k!r}'); bad += 1
                elif k not in en: warn += 1
                if not isinstance(t, str): log(f'ERROR {p}: {k}: not a string'); bad += 1
    log(f'check: {len(idx["components"])} component(s), {bad} error(s), {warn} key(s) not in en.json (superseded master texts)')
    return bad == 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    e = sub.add_parser('export'); e.add_argument('course'); e.add_argument('--out', required=True)
    i = sub.add_parser('import'); i.add_argument('course'); i.add_argument('--from', dest='src', required=True)
    for p in (e, i):
        p.add_argument('--locales', help='comma-separated (default: every locale facade / every file)')
        p.add_argument('--master', help='a directory written by `lang_facade.py extract <course> --out DIR`')
        p.add_argument('--draft-by', default=','.join(DRAFT_BY), help='`by` values that mark a draft (default: claude)')
    i.add_argument('--no-master', action='store_true', help='do not extract the master (no superseded / orphan guard)')
    i.add_argument('--write', action='store_true'); i.add_argument('--no-manifest', action='store_true')
    i.add_argument('--by', default='weblate')
    c = sub.add_parser('check'); c.add_argument('dir')
    a = ap.parse_args(argv)
    if a.cmd == 'check': return 0 if check(a.dir) else 1
    locs = [x.strip() for x in a.locales.split(',')] if a.locales else None
    draft_by = tuple(x.strip() for x in a.draft_by.split(',') if x.strip())
    if a.cmd == 'export':
        export(a.course, a.out, locs, a.master, draft_by)
        return 0 if check(a.out, log=lambda s: None) else 1
    import_(a.course, a.src, locs, a.master, not a.no_master, a.write, not a.no_manifest, draft_by, a.by)
    return 0


if __name__ == '__main__':
    sys.exit(main())
