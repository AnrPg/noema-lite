#!/usr/bin/env python3
"""Print the brief of one content batch for one language (docs/NEW_LANGUAGE_PLAYBOOK.md).

  python3 tools/lang_sources/mkbrief.py foundations|core|field --course polyglot-semitic-zh-de --lang fa \\
          --batch F1 --nodes fd.00,fd.01,fd.02,fd.03,fd.04 [--notes notes.txt] > /tmp/brief.txt

The language's name and type come from library/languages/<course>/lang/<code>/language.json; the titles from core/nodes.json.
"""
import argparse, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
a = argparse.ArgumentParser(); a.add_argument('kind', choices=['foundations', 'core', 'field'])
a.add_argument('--course', required=True); a.add_argument('--lang', required=True); a.add_argument('--batch', required=True)
a.add_argument('--nodes', required=True); a.add_argument('--notes', default=None)
o = a.parse_args()
C = os.path.join(ROOT, 'library', 'languages', o.course)
lj = json.load(open(os.path.join(C, 'lang', o.lang, 'language.json'), encoding='utf-8'))
nodes = {n['id']: n for n in json.load(open(os.path.join(C, 'core', 'nodes.json'), encoding='utf-8'))['nodes']}
ids = o.nodes.split(',')
for i in ids:
    if i not in nodes: sys.exit(f'unknown node {i}')
titles = '; '.join(f"{i} {nodes[i]['title']}" for i in ids)
bankid = (o.batch.lower() + '_' + ids[0].replace('.', '') + '_' + ids[-1].replace('.', ''))
typ = lj.get('typology') if isinstance(lj.get('typology'), str) else (lj.get('typology') or {}).get('type', '?')
t = open(os.path.join(ROOT, 'tools', 'lang_sources', 'briefs', o.kind + '.txt'), encoding='utf-8').read()
notes = open(o.notes, encoding='utf-8').read() if o.notes else ''
rep = {'{BATCH}': o.batch, '{STEPS}': ', '.join(ids) + ' (' + titles + ')', '{NODES}': ', '.join(ids), '{TITLES}': titles, '{LANG}': lj.get('name', o.lang),
       '{CODE}': o.lang, '{TYPE}': typ, '{COURSE}': o.course, '{BANKFILE}': bankid + '.json', '{BANKID}': bankid, '{BATCHNODES}': ','.join(ids), '{NOTES}': notes}
for k, v in rep.items(): t = t.replace(k, v)
pre = open(os.path.join(ROOT, 'tools', 'lang_sources', 'AGENT_BRIEF.md'), encoding='utf-8').read()
print(pre.split('\n', 2)[2] + '\n---\n\n' + t)
