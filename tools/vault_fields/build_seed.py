#!/usr/bin/env python3
"""Seed of the vault's field graph (docs/VAULT.md §Fields).

Top: the ten broad fields of ISCED-F 2013 (broad.json, ids b_ed … b_sv). Below: academic disciplines from Wikidata
(instances of Q11862829 with articles in at least MIN_LINKS Wikipedias) with their names in every UI locale and their parents (P279 subclass of / P361 part of),
kept only when they reach a broad field through roots.txt or extra.txt. A field may have many parents (a DAG).

  python3 tools/vault_fields/build_seed.py           # uses tools/vault_fields/.cache/ (fetches what is missing)
  python3 tools/vault_fields/build_seed.py --fetch   # fetch Wikidata again

Writes tools/vault_fields/fields.json (the seed, reviewed in git) and cloud/vault_fields_seed.sql (insert … on conflict
do nothing, so fields Claude or users changed in the database are left alone).
"""
import json, os, re, subprocess, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, '.cache')
LOCALES = ['en', 'el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT', 'tr']
WD = {'en': ['en'], 'el': ['el'], 'ru': ['ru'], 'fr': ['fr'], 'ar-EG': ['ar'], 'de': ['de'], 'hi': ['hi'],
      'zh-Hans': ['zh-hans', 'zh-cn', 'zh'], 'zh-Hant': ['zh-hant', 'zh-tw', 'zh-hk'], 'ja': ['ja'], 'it': ['it'],
      'es-ES': ['es'], 'sq': ['sq'], 'pt-PT': ['pt'], 'tr': ['tr']}
WD_LANGS = sorted({l for v in WD.values() for l in v})
BROAD = ['ED', 'AH', 'SS', 'BL', 'NS', 'IT', 'EN', 'AG', 'HW', 'SV']
MIN_LINKS = 12  # Wikipedia editions a discipline has: drops the obscure ones (named in English only)


def sparql(query):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query})
    out = subprocess.run(['curl', '-sS', '-m', '180', '-H', 'Accept: application/sparql-results+json', '-A',
                          'noema-lite-vault-fields/1.0 (https://github.com/AnrPg/noema-lite)', url],
                         check=True, capture_output=True).stdout
    return json.loads(out)['results']['bindings']


def cached(name, query, fetch):
    path = os.path.join(CACHE, name)
    if fetch or not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        rows = sparql(query)
        with open(path, 'w') as f:
            json.dump(rows, f)
    with open(path) as f:
        return json.load(f)


def lines(name):
    with open(os.path.join(HERE, name)) as f:
        return [l.split('#')[0].split() for l in f if l.split('#')[0].strip()]


def qid(v):
    return v['value'].rsplit('/', 1)[-1]


def nice(s):
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:1].upper() + s[1:] if s[:1].islower() else s


def main():
    fetch = '--fetch' in sys.argv
    langs = ','.join('"%s"' % l for l in WD_LANGS)
    extra = lines('extra.txt')
    hand = ' '.join('wd:' + r[0] for r in extra)
    labels = cached('labels.json', 'SELECT ?x ?l WHERE { { ?x wdt:P31 wd:Q11862829 } UNION { VALUES ?x { %s } } '
                    '?x rdfs:label ?l . FILTER(LANG(?l) IN (%s)) }' % (hand, langs), fetch)
    parents = cached('parents.json', 'SELECT ?x ?p WHERE { ?x wdt:P31 wd:Q11862829 . ?x wdt:P279|wdt:P361 ?p . '
                     '?p wdt:P31 wd:Q11862829 }', fetch)

    links = cached('sitelinks.json', 'SELECT ?x ?s WHERE { ?x wdt:P31 wd:Q11862829 ; wikibase:sitelinks ?s . }', fetch)
    known = {qid(b['x']) for b in links if int(b['s']['value']) >= MIN_LINKS} | {r[0] for r in extra}

    names = {}
    for b in labels:
        if qid(b['x']) in known:
            names.setdefault(qid(b['x']), {})[b['l']['xml:lang']] = b['l']['value']
    par = {}
    for b in parents:
        x, p = qid(b['x']), qid(b['p'])
        if x != p:
            par.setdefault(x, set()).add(p)

    broad = {k: v for k, v in json.load(open(os.path.join(HERE, 'broad.json'))).items() if k in BROAD}
    drop = set()
    for r in lines('roots.txt'):
        if r[1:] == ['-']:
            drop.add(r[0])
        else:
            par.setdefault(r[0], set()).update('b_' + a.lower() for a in r[1:])
    for r in extra:
        par.setdefault(r[0], set()).update(('b_' + a.lower()) if a in BROAD else a for a in r[1:])

    # keep a field when it reaches a broad field through fields that are kept
    keep = {'b_' + k.lower() for k in BROAD}
    changed = True
    while changed:
        changed = False
        for x, ps in par.items():
            if x not in keep and x not in drop and x in names and ps & keep:
                keep.add(x)
                changed = True

    fields = []
    for k in BROAD:
        fields.append({'id': 'b_' + k.lower(), 'isced': broad[k]['isced'],
                       'names': {l: broad[k][l] for l in LOCALES}, 'parents': []})
    for x in sorted((x for x in keep if x.startswith('Q')), key=lambda q: int(q[1:])):
        n = {}
        for loc in LOCALES:
            v = next((names[x][w] for w in WD[loc] if w in names[x]), None)
            if v:
                n[loc] = nice(v)
        if 'en' not in n:
            continue
        fields.append({'id': x, 'names': n, 'parents': sorted(p for p in par[x] if p in keep)})
    ids = {f['id'] for f in fields}
    for f in fields:
        f['parents'] = [p for p in f['parents'] if p in ids]
    # Wikidata has a few loops (A part of B, B subclass of A): drop the edge that closes one, so the graph stays a DAG
    byid, state = {f['id']: f for f in fields}, {}
    def walk(u):
        state[u] = 1
        for p in list(byid[u]['parents']):
            if state.get(p) == 1:
                byid[u]['parents'].remove(p)
                print('loop dropped: %s -> %s' % (byid[u]['names']['en'], byid[p]['names']['en']))
            elif p not in state:
                walk(p)
        state[u] = 2
    sys.setrecursionlimit(10000)
    for f in fields:
        if f['id'] not in state:
            walk(f['id'])

    with open(os.path.join(HERE, 'fields.json'), 'w') as f:
        f.write('[\n' + ',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in fields) + '\n]\n')

    def lit(s):
        return "'" + s.replace("'", "''") + "'"
    rows = []
    for x in fields:
        rows.append('(%s,%s::jsonb,%s::text[],\'accepted\',%s)' % (
            lit(x['id']), lit(json.dumps(x['names'], ensure_ascii=False, separators=(',', ':'))),
            lit('{' + ','.join(x['parents']) + '}'), lit('isced' if x['id'].startswith('b_') else 'wikidata')))
    sql = ['-- Generated by tools/vault_fields/build_seed.py: the seed of the vault field graph (%d fields).' % len(fields),
           '-- Run it in the Supabase SQL editor after cloud/supabase.sql. Fields already in the table are left alone.', '']
    for i in range(0, len(rows), 200):
        sql.append('insert into public.noema_vault_fields (id, names, parents, status, source) values\n' +
                   ',\n'.join(rows[i:i + 200]) + '\non conflict (id) do nothing;\n')
    with open(os.path.join(ROOT, 'cloud', 'vault_fields_seed.sql'), 'w') as f:
        f.write('\n'.join(sql))
    miss = {loc: sum(1 for x in fields if loc not in x['names']) for loc in LOCALES}
    print('%d fields; names missing per locale: %s' % (len(fields), miss))


if __name__ == '__main__':
    main()
