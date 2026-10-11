#!/usr/bin/env python3
"""Print the brief of one content batch for one language (docs/NEW_LANGUAGE_PLAYBOOK.md).

  python3 tools/lang_sources/mkbrief.py foundations|core|field --course polyglot-semitic-zh-de --lang fa \\
          --batch F1 --nodes fd.00,fd.01,fd.02,fd.03,fd.04 [--notes notes.txt] > /tmp/brief.txt

The language's name and type come from library/languages/<course>/lang/<code>/language.json; the titles from core/nodes.json.

In the skill noema-language-builder (docs/LANGUAGES.md §10.2: no repository, the course unpacked in a sandbox):
  python3 scripts/mkbrief.py foundations --course-dir work/lang/<course> --lang fa --batch F1 --nodes … --sandbox
--course-dir reads the course from that folder; --sandbox writes the brief with the sandbox's paths (the course folder,
work/lang/_phenomena and _typology next to it, the toolkit's scripts/ and references/) instead of the repository's.
"""
import argparse, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
a = argparse.ArgumentParser(); a.add_argument('kind', choices=['foundations', 'core', 'field'])
a.add_argument('--course', default=None); a.add_argument('--course-dir', default=None); a.add_argument('--lang', required=True); a.add_argument('--batch', required=True)
a.add_argument('--nodes', required=True); a.add_argument('--notes', default=None); a.add_argument('--sandbox', action='store_true')
o = a.parse_args()
if not (o.course or o.course_dir): sys.exit('--course <id> (in the repository) or --course-dir <folder> is required')
C = os.path.abspath(o.course_dir) if o.course_dir else os.path.join(ROOT, 'library', 'languages', o.course)
course_id = o.course or json.load(open(os.path.join(C, 'course.json'), encoding='utf-8'))['id']
lj = json.load(open(os.path.join(C, 'lang', o.lang, 'language.json'), encoding='utf-8'))
nodes = {n['id']: n for n in json.load(open(os.path.join(C, 'core', 'nodes.json'), encoding='utf-8'))['nodes']}
ids = o.nodes.split(',')
for i in ids:
    if i not in nodes: sys.exit(f'unknown node {i}')
titles = '; '.join(f"{i} {nodes[i]['title']}" for i in ids)
bankid = (o.batch.lower() + '_' + ids[0].replace('.', '') + '_' + ids[-1].replace('.', ''))
typ = lj.get('typology') if isinstance(lj.get('typology'), str) else (lj.get('typology') or {}).get('type', '?')


def find(*rels):
    """A template next to this script (the repository: tools/lang_sources/) or in the toolkit's references/."""
    for base in (HERE, os.path.join(os.path.dirname(HERE), 'references')):
        p = os.path.join(base, *rels)
        if os.path.exists(p): return p
    sys.exit('not found: ' + '/'.join(rels))


t = open(find('briefs', o.kind + '.txt'), encoding='utf-8').read()
notes = open(o.notes, encoding='utf-8').read() if o.notes else ''
rep = {'{BATCH}': o.batch, '{STEPS}': ', '.join(ids) + ' (' + titles + ')', '{NODES}': ', '.join(ids), '{TITLES}': titles, '{LANG}': lj.get('name', o.lang),
       '{CODE}': o.lang, '{TYPE}': typ, '{COURSE}': course_id, '{BANKFILE}': bankid + '.json', '{BANKID}': bankid, '{BATCHNODES}': ','.join(ids), '{NOTES}': notes}
for k, v in rep.items(): t = t.replace(k, v)
pre = open(find('AGENT_BRIEF.md'), encoding='utf-8').read()
brief = pre.split('\n', 2)[2] + '\n---\n\n' + t


def sandbox(text):
    """The repository's paths → the sandbox's (the skill noema-language-builder)."""
    T = os.path.dirname(HERE)                         # the toolkit: scripts/ and references/
    work = os.path.dirname(C)                         # work/lang: the course, _phenomena, _typology
    rel = lambda p: os.path.relpath(p) if not os.path.relpath(p).startswith('../..') else p
    course, wk, S, R = rel(C), rel(work), os.path.join(T, 'scripts'), os.path.join(T, 'references')
    subs = [
        (r'REPO \(work only here\): the repository root \(your current directory\)', f'WORK FOLDER (work only here): {course} — the course unpacked in the sandbox'),
        (r'REPO: the repository root \(your current directory\)', f'WORK FOLDER: {course} (the course unpacked in the sandbox)'),
        (r'library/languages/' + re.escape(course_id), course),
        (r'library/languages/<course>', course),
        (r'library/languages/(_phenomena|_typology)', wk + r'/\1'),
        (r'python3 tools/lang_phenomena\.py', f'python3 {S}/lang_phenomena.py --root {wk}'),
        (r'node tests/lang_courses\.js', f'node {S}/lang_readback.js {course} --lang {o.lang}'),
        (r"sys\.path\.insert\(0,\s*'tools'\)", f"sys.path.insert(0,'{S}')"),
        (r'tools/lang_sources/AGENT_BRIEF\.md', f'{R}/AGENT_BRIEF.md'),
        (r'tools/CONTENT_SPEC\.md', f'{R}/CONTENT_SPEC.md'),
        (r'(?<![\w/.])tools/', S + '/'),
        (r'(?<![\w/.])docs/', R + '/'),
        (r'the hand-checked mini course tests/fixtures/lang-mini \(its lang/\{?\w+\}?/grammar/fn\.overview\.json is a SHORT model of the overview\)', 'the other languages of the course (their lang/<code>/grammar/fn.overview.json are models of the overview)'),
        (r'tests/fixtures/lang-mini', 'the other languages of the course'),
        (r'Keep generator scripts outside the repo', 'Keep generator scripts outside the work folder'),
    ]
    for a_, b_ in subs: text = re.sub(a_, b_, text)
    return text + f'\n\n(Sandbox: the repository is not here. The course is {course}; its shared typology and catalogues are {wk}/_typology and {wk}/_phenomena; the scripts are {S}; the contract is {R}. The app\'s engine (engine/, tests/) cannot be changed here: report what {lj.get("name", o.lang)} would need there.)\n'


print(sandbox(brief) if o.sandbox else brief)
