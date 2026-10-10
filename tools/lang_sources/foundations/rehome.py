#!/usr/bin/env python3
"""After the steps change (mkfoundations.py), move every word of the foundation lessons into the lesson that now owns its
first sense — per language; absent entries too. Senses are reordered so the earliest-taught comes first.
  python3 tools/lang_sources/foundations/rehome.py library/languages/polyglot-semitic-zh-de"""
import json, os, glob, sys
R = sys.argv[1]
nodes = json.load(open(f'{R}/core/nodes.json'))['nodes']; owner = {c: n['id'] for n in nodes for c in n['concepts']}; order = [n['id'] for n in nodes]
for c in json.load(open(f'{R}/course.json'))['languages']:
    files = sorted(glob.glob(f'{R}/lang/{c}/lexicon/fd.*.json')); allx, absent, home = [], [], {}
    for p in files:
        d = json.load(open(p, encoding='utf-8')); nid = os.path.basename(p)[:-5]
        for x in d['lexemes']: allx.append(x); home[x['id']] = nid
        absent += d.get('absent', [])
    out, moved = {}, []
    for x in allx:
        if x['senses']:
            best = min(x['senses'], key=lambda s: order.index(owner[s])); x['senses'] = [best] + [s for s in x['senses'] if s != best]; nid = owner[best]
        else: nid = home[x['id']]   # a word with a role only stays where its author put it
        if nid != home[x['id']]: moved.append(f"{x['lemma']} {home[x['id']]}→{nid}")
        out.setdefault(nid, {'lexemes': [], 'absent': []})['lexemes'].append(x)
    for a in absent: out.setdefault(owner[a['concept']], {'lexemes': [], 'absent': []})['absent'].append(a)
    for p in files: os.remove(p)
    for nid, d in out.items():
        with open(f'{R}/lang/{c}/lexicon/{nid}.json', 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, indent=1); f.write('\n')
    print(c, moved)
