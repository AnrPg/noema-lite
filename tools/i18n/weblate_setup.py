#!/usr/bin/env python3
"""Weblate projects, components and add-ons for noema-lite from weblate/components.yaml (docs/i18n.md §9.2).

  python3 tools/i18n/weblate_setup.py plan  [--facades DIR]            what the instance should have (no network)
  python3 tools/i18n/weblate_setup.py apply [--facades DIR] [--apply]  compare with the instance and fix it
                                                                       (a dry run that only READS unless --apply)
  python3 tools/i18n/weblate_setup.py init-locale <tag> [--write]      the stub files that put a locale into Weblate
  python3 tools/i18n/weblate_setup.py webhook                          how to connect GitHub → Weblate

apply   idempotent: creates a missing project / component / add-on, PATCHes the fields that differ, never deletes.
        The first UI component (`main_component`, core) holds the Git repository; the others and the glossary link to it
        (weblate://noema-lite/core), so the instance keeps ONE clone, ONE push branch and ONE pull request.
        The language-course project is planned from the exchange tree's INDEX.json (--facades DIR: the folder
        `weblate-facades` of a checkout of the exchange branch; tools/i18n/weblate_facades.py export) and skipped without it.
        Refuses --apply while the GitHub owner is the placeholder OWNER. Sets the contributor agreement only from a
        weblate/CLA.md that is no longer marked DRAFT (the owner's rule: no unreviewed legal text goes live). Leaves out
        the glossary while i18n/glossary/<locale>.csv still has the column "description" (Weblate writes it back empty).
init-locale  writes i18n/<component>/<tag>.arb = {"@@locale": "<tag>"} for every component (and an empty glossary
        file) where it is missing — the "template for new translations": Weblate finds the new file on its next pull
        and names nothing itself (BCP 47 file names stay exactly as the app expects). Dry run unless --write.

Environment (apply only): WEBLATE_URL, WEBLATE_API_TOKEN (never printed). PyYAML is needed to read the configuration.
"""
import argparse, csv, glob, json, os, re, sys, urllib.parse
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CONFIG = os.path.join(REPO, 'weblate', 'components.yaml')
CLA = os.path.join(REPO, 'weblate', 'CLA.md')
DRAFT_MARK = 'DRAFT — must be reviewed by a lawyer before use'
# fields Weblate reports with the real repository even for a linked component: never compared for those
REPO_FIELDS = ('repo', 'push', 'branch', 'push_branch', 'vcs')
NOT_COMPARED = ('name', 'slug', 'required_header')


def load_config(path=CONFIG):
    try:
        import yaml
    except ImportError:
        raise SystemExit('PyYAML is needed to read weblate/components.yaml: python3 -m pip install pyyaml')
    with open(path, encoding='utf-8') as f: return yaml.safe_load(f)


def ui_locales(repo=REPO):
    """The UI locales of docs/i18n.md, as tools/i18n/icu.js lists them (one list for every tool)."""
    p = os.path.join(repo, 'tools', 'i18n', 'icu.js')
    with open(p if os.path.exists(p) else os.path.join(HERE, 'icu.js'), encoding='utf-8') as f:
        m = re.search(r'const LOCALES = \[([^\]]*)\]', f.read())
    return re.findall(r"'([^']+)'", m.group(1)) if m else []


def fill(v, **kw):
    if isinstance(v, str):
        for k, x in kw.items(): v = v.replace('{' + k + '}', x)
        return v
    if isinstance(v, dict): return {k: fill(x, **kw) for k, x in v.items()}
    if isinstance(v, list): return [fill(x, **kw) for x in v]
    return v


def cla_text(path=CLA):
    """The agreement for Weblate, or None while the file is still the unreviewed draft."""
    if not os.path.exists(path): return None
    with open(path, encoding='utf-8') as f: text = f.read()
    if DRAFT_MARK in text: return None
    return text.strip()


def glossary_header_ok(repo, required):
    bad = []
    for p in sorted(glob.glob(os.path.join(repo, 'i18n', 'glossary', '*.csv')) + glob.glob(os.path.join(repo, 'i18n', 'glossary', 'drafts', '*.csv'))):
        if os.path.basename(p) == 'terms.csv': continue
        with open(p, encoding='utf-8', newline='') as f: head = next(csv.reader(f), [])
        if head[:len(required)] != list(required): bad.append(f'{os.path.relpath(p, repo)}: {",".join(head)}')
    return bad


# ------------------------------------------------------------------------------------------------ the desired state
def desired(cfg, repo=REPO, facades=None):
    """→ [{project: {...}, components: [{...}], addons_on: slug, addons: [...], notes: [...]}] — no network."""
    gh = cfg['github']; out = []
    ui = cfg['ui']; p = dict(ui['project']); notes = []
    comps = sorted(os.path.basename(os.path.dirname(x)) for x in glob.glob(os.path.join(repo, ui['discover'])))
    comps = [c for c in comps if c != 'glossary']
    main = ui['main_component'] if ui['main_component'] in comps else (comps[0] if comps else None)
    agreement = cla_text(os.path.join(repo, 'weblate', 'CLA.md'))
    if agreement is None: notes.append('contributor agreement NOT set: weblate/CLA.md is still the unreviewed DRAFT')
    cl = []
    for c in [main] + [c for c in comps if c != main]:
        d = fill(dict(ui['component_defaults']), component=c)
        d.update(ui.get('component_overrides', {}).get(c, {}) or {})
        if c == main: d.update(repo=gh['repo'], push=gh['repo'], branch=gh['branch'], push_branch=gh['push_branch'])
        else: d['repo'] = f'weblate://{p["slug"]}/{main}'
        if agreement: d['agreement'] = agreement
        d['_linked'] = c != main
        cl.append(d)
    g = dict(ui['glossary']); bad = glossary_header_ok(repo, g.get('required_header') or [])
    if bad:
        notes.append('glossary component LEFT OUT: rename the CSV column "description" → "developer_comments" first '
                     '(Weblate would write it back empty): ' + '; '.join(bad[:4]) + (' …' if len(bad) > 4 else ''))
    elif main:
        g['repo'] = f'weblate://{p["slug"]}/{main}'
        if agreement: g['agreement'] = agreement
        g['_linked'] = True
        cl.append(g)
    out.append({'project': p, 'components': cl, 'addons_on': main, 'addons': ui.get('addons', []), 'notes': notes})

    co = cfg['courses']; cp = dict(co['project']); cnotes = []
    idx = None
    if facades:
        ip = os.path.join(facades, 'INDEX.json')
        if os.path.exists(ip):
            with open(ip, encoding='utf-8') as f: idx = json.load(f)
        else: cnotes.append(f'{ip} not found')
    if not idx:
        cnotes.append('language-course project: components need the exchange tree (--facades DIR, made by weblate_facades.py export)')
        out.append({'project': cp, 'components': [], 'addons_on': None, 'addons': [], 'notes': cnotes}); return out
    cc = []
    for i, comp in enumerate(idx['components']):
        d = fill(dict(co['component_defaults']), dir=comp['dir'])
        d.update(name=comp['name'], slug=comp['slug'])
        if i == 0: d.update(repo=gh['repo'], push=gh['repo'], branch=co['exchange_branch'], push_branch=co['push_branch'])
        else: d['repo'] = f'weblate://{cp["slug"]}/{idx["components"][0]["slug"]}'
        if agreement: d['agreement'] = agreement
        d['_linked'] = i > 0
        cc.append(d)
    out.append({'project': cp, 'components': cc, 'addons_on': cc[0]['slug'] if cc else None, 'addons': co.get('addons', []),
                'notes': cnotes})
    return out


def payload(d):
    return {k: v for k, v in d.items() if not k.startswith('_') and k != 'required_header'}


# ------------------------------------------------------------------------------------------------ the instance
def differs(want, have):
    if isinstance(want, dict): return not isinstance(have, dict) or any(differs(v, have.get(k)) for k, v in want.items())
    if isinstance(want, list): return sorted(map(str, want)) != sorted(map(str, have or []))
    if want in ('', None): return have not in ('', None)
    return want != have


def run_apply(plan, api, really, log=print):
    ok = True
    for block in plan:
        p = block['project']; ps = p['slug']
        for n in block['notes']: log('note  ' + n)
        proj = get_or_none(api, f'/api/projects/{ps}/')
        fields = {k: v for k, v in p.items() if k not in ('slug',)}
        if proj is None:
            log(f'create project {ps}')
            if really:
                api.post_json('/api/projects/', {k: p[k] for k in ('name', 'slug', 'web', 'access_control') if k in p})
                proj = get_or_none(api, f'/api/projects/{ps}/') or {}
        diff = {k: v for k, v in fields.items() if proj is None or differs(v, (proj or {}).get(k))}
        if proj is not None and diff:
            log(f'patch project {ps}: {", ".join(sorted(diff))}')
            if really: api.patch_json(f'/api/projects/{ps}/', diff)
        if really and 'commit_policy' in p:
            now = get_or_none(api, f'/api/projects/{ps}/') or {}
            if now.get('commit_policy') != p['commit_policy']:
                log(f'ACTION project {ps}: the API did not take commit_policy — set it in Weblate: Project → Settings → '
                    f'Workflow → "Translation quality filter" = "Only include approved translations"'); ok = False
        for d in block['components']:
            cs = d['slug']; have = get_or_none(api, f'/api/components/{ps}/{cs}/')
            want = payload(d)
            if have is None:
                log(f'create component {ps}/{cs}' + (f' (linked to {d["repo"]})' if d.get('_linked') else f' ({d["repo"]})'))
                if really:
                    r = api.post_json(f'/api/projects/{ps}/components/', want)
                    if r.get('task_url'): log(f'      background task: {r["task_url"]}')
                continue
            skip = set(NOT_COMPARED) | (set(REPO_FIELDS) if d.get('_linked') else set())
            diff = {k: v for k, v in want.items() if k not in skip and differs(v, have.get(k))}
            if diff:
                log(f'patch component {ps}/{cs}: {", ".join(sorted(diff))}')
                if really: api.patch_json(f'/api/components/{ps}/{cs}/', diff)
        if block['addons_on'] and block['addons']:
            have = [a for a in all_pages(api, '/api/addons/') if (a.get('component') or '').rstrip('/').endswith(f'/components/{ps}/{block["addons_on"]}')]
            names = {a.get('name') for a in have}
            for a in block['addons']:
                if a['name'] in names: continue
                log(f'install add-on {a["name"]} on {ps}/{block["addons_on"]}')
                if really: api.post_json(f'/api/components/{ps}/{block["addons_on"]}/addons/',
                                         {'name': a['name'], 'configuration': a.get('configuration') or {}})
    if not really: log('dry run: nothing was changed (add --apply)')
    return ok


def get_or_none(api, path):
    try: return api.get(path)
    except RuntimeError as e:
        if 'HTTP 404' in str(e): return None
        raise


def all_pages(api, path):
    url, out = path, []
    while url:
        page = api.get(url); out += page.get('results', []); url = page.get('next')
    return out


def make_api():
    sys.path.insert(0, HERE)
    from weblate_import_drafts import Api
    url, token = os.environ.get('WEBLATE_URL'), os.environ.get('WEBLATE_API_TOKEN')
    if not url or not token: raise SystemExit('WEBLATE_URL and WEBLATE_API_TOKEN must be set in the environment')
    if not url.startswith('https://') and urllib.parse.urlparse(url).hostname not in ('localhost', '127.0.0.1'):
        raise SystemExit('WEBLATE_URL must be https://')
    api = Api(url, token)

    def send(method, path, body):
        return api._req(method, api.base + path, json.dumps(body).encode('utf-8'), {'Content-Type': 'application/json'})
    api.post_json = lambda path, body: send('POST', path, body)
    api.patch_json = lambda path, body: send('PATCH', path, body)
    return api


# ------------------------------------------------------------------------------------------------ init-locale
def init_locale(tag, repo=REPO, write=False, log=print):
    locs = ui_locales(repo)
    if tag not in locs: raise SystemExit(f'{tag}: not a UI locale of docs/i18n.md ({", ".join(locs)})')
    if tag == 'en': raise SystemExit('en is the source language')
    made = []
    for en in sorted(glob.glob(os.path.join(repo, 'i18n', '*', 'en.arb'))):
        p = os.path.join(os.path.dirname(en), tag + '.arb')
        if not os.path.exists(p):
            made.append(p)
            if write:
                with open(p, 'w', encoding='utf-8', newline='\n') as f: f.write(json.dumps({'@@locale': tag}, indent=2) + '\n')
    gdir = os.path.join(repo, 'i18n', 'glossary')
    gp = os.path.join(gdir, tag + '.csv')
    if os.path.isdir(gdir) and not os.path.exists(gp):
        head = None
        for x in sorted(glob.glob(os.path.join(gdir, '*.csv'))):
            if os.path.basename(x) != 'terms.csv':
                with open(x, encoding='utf-8', newline='') as f: head = next(csv.reader(f), None)
                break
        made.append(gp)
        if write:
            with open(gp, 'w', encoding='utf-8', newline='') as f: f.write(','.join(head or ['source', 'target', 'developer_comments']) + '\n')
    for p in made: log(('wrote ' if write else 'would write ') + os.path.relpath(p, repo))
    if not made: log(f'{tag}: every component already has its file')
    if made and not write: log('dry run: add --write, commit, merge; Weblate picks the files up on its next pull')
    return made


WEBHOOK = """GitHub → Weblate (so Weblate pulls as soon as main or the exchange branch changes):
  GitHub → the repository → Settings → Webhooks → Add webhook
    Payload URL   {url}/hooks/github/
    Content type  application/json
    Secret        (leave empty: Weblate's generic GitHub hook does not verify it)
    Events        Just the push event
  Weblate matches the delivery to components whose repository URL is EXACTLY the one in the payload: keep the components'
  repository as the SSH URL git@github.com:OWNER/noema-lite.git (weblate/components.yaml), and keep the project setting
  "Enable hooks" on. Check: Settings → Webhooks → Recent deliveries shows 200/202 with "match_status".
  Weblate → GitHub needs no webhook: it pushes the branch weblate-translations with its SSH key (a deploy key with write
  access) and opens / updates the pull request with WEBLATE_GITHUB_TOKEN."""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--repo', default=REPO, help=argparse.SUPPRESS)
    ap.add_argument('--config', default=None)
    sub = ap.add_subparsers(dest='cmd', required=True)
    for n in ('plan', 'apply'):
        s = sub.add_parser(n); s.add_argument('--facades', metavar='DIR')
        if n == 'apply': s.add_argument('--apply', action='store_true')
    s = sub.add_parser('init-locale'); s.add_argument('tag'); s.add_argument('--write', action='store_true')
    sub.add_parser('webhook')
    a = ap.parse_args(argv)
    if a.cmd == 'init-locale': init_locale(a.tag, a.repo, a.write); return 0
    if a.cmd == 'webhook': print(WEBHOOK.format(url=os.environ.get('WEBLATE_URL', 'https://translate.example.com'))); return 0
    cfg = load_config(a.config or os.path.join(a.repo, 'weblate', 'components.yaml'))
    plan = desired(cfg, a.repo, a.facades)
    if a.cmd == 'plan':
        for b in plan:
            print(f'project {b["project"]["slug"]}: {len(b["components"])} component(s)')
            for d in b['components']:
                print(f'  {d["slug"]:<32} {d["file_format"]:<5} {d["filemask"]:<48} ' + ('linked' if d.get('_linked') else d.get('repo', '')))
            for x in b['addons']: print(f'  add-on {x["name"]} on {b["addons_on"]}')
            for n in b['notes']: print('  note: ' + n)
        return 0
    if a.apply and 'OWNER' in cfg['github']['repo']:
        raise SystemExit('weblate/components.yaml: replace the placeholder OWNER in github.repo first')
    return 0 if run_apply(plan, make_api(), a.apply) else 1


if __name__ == '__main__':
    sys.exit(main())
