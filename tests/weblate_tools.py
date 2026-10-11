#!/usr/bin/env python3
"""The Weblate tools without Weblate and without network (docs/i18n.md §9): the facade converter's round trip
(tools/i18n/weblate_facades.py), prune_drafts.js, the draft-import plan and its multipart upload (a fake transport),
the setup plan and init-locale, and the safety rules (no secrets, the CLA stays a draft, never main)."""
import io, json, os, shutil, subprocess, sys, tempfile
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'i18n')); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import weblate_facades as WF            # noqa: E402
import weblate_import_drafts as WD      # noqa: E402
import weblate_setup as WS              # noqa: E402

fails = 0
def ok(c, m):
    global fails
    print(('  ✅ ' if c else '  ❌ ') + m)
    if not c: fails += 1

def wj(p, o, indent=1):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: f.write(json.dumps(o, ensure_ascii=False, indent=indent) + '\n')

def rj(p):
    with open(p, encoding='utf-8') as f: return json.load(f, object_pairs_hook=OrderedDict)

def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()

H = WF.text_hash
quiet = lambda *a: None
tmp = tempfile.mkdtemp(prefix='noema-weblate-test-')
try:
    # ------------------------------------------------------------------------------------------------ facades
    print('facades ⇄ Weblate (weblate_facades.py)')
    import lang_facade
    ok(H('Ünïcode “text”') == lang_facade.text_hash('Ünïcode “text”'), 'the key hash is lang_facade.text_hash (src)')
    lib = os.path.join(tmp, 'lib'); course = os.path.join(lib, 'demo-course'); master = os.path.join(tmp, 'master')
    M_core = OrderedDict([('k:course/title', 'Arabic · German'), ('c:a.b/gloss', 'accent'), ('c:a.c/gloss', 'accident'),
                          ('g:de:fn.x/blocks/3/text', 'A *wrong* form {not ICU} — “quoted”\n- item'), ('c:a.d/gloss', 'new text')])
    M_ph = OrderedDict([('p:ar.root/what', 'A root of three consonants.')])
    M_ty = OrderedDict([('t:order/learnerNote', 'Word order.')])
    for p, m in ((f'{master}/demo-course/facades/en/core.json', M_core), (f'{master}/_phenomena/facades/en/ar.json', M_ph),
                 (f'{master}/_typology/facades/en.json', M_ty)):
        wj(p, OrderedDict((a, {'t': t, 'src': H(t), 'by': 'extract'}) for a, t in m.items()))
    wj(f'{master}/demo-course/facades/en/facade.json', {'format': 'noema.langfacade/v1'})
    core_el = OrderedDict(sorted({
        'c:a.b/gloss': {'t': 'προφορά', 'src': H('accent'), 'by': 'owner'},                     # reviewed, current
        'c:a.c/gloss': {'t': 'ατύχημα', 'src': H('accident'), 'by': 'claude'},                   # Claude's draft
        'g:de:fn.x/blocks/3/text': {'t': 'Μια *λάθος* μορφή {όχι ICU}', 'src': 'aaaaaaaaaaaa', 'by': 'owner'},  # reviewed, stale
        'k:course/title': {'t': 'Αραβικά · Γερμανικά', 'src': H('Arabic · German'), 'by': 'weblate'},
        'x:gone/profile/0': {'t': 'παλιό', 'src': 'bbbbbbbbbbbb', 'by': 'owner'},                # orphan (not in the master)
    }.items()))
    fp_core = f'{course}/facades/el/core.json'; wj(fp_core, core_el)
    wj(f'{lib}/_phenomena/facades/el/ar.json', {'p:ar.root/what': {'t': 'Μια ρίζα τριών συμφώνων.', 'src': H('A root of three consonants.'), 'by': 'claude'}})
    wj(f'{lib}/_typology/facades/el.json', {})
    os.makedirs(f'{course}/facades/en', exist_ok=True)   # en is never a target locale
    before = {p: rd(p) for p in (fp_core, f'{lib}/_phenomena/facades/el/ar.json', f'{lib}/_typology/facades/el.json')}

    out = os.path.join(tmp, 'xch', 'weblate-facades')
    idx, totals = WF.export(course, out, None, master, log=quiet)
    ok([c['dir'] for c in idx['components']] == ['demo-course/core', '_phenomena/ar', '_typology'] and idx['locales'] == ['el'],
       'one component per facade file (course, phenomena, typology); locales discovered (en excluded)')
    en = rj(f'{out}/demo-course/core/en.json')
    ok(list(en) == [f'{a}#{H(t)}' for a, t in M_core.items()] and list(en.values()) == list(M_core.values()),
       'en.json: "<address>#<hash>" → master text, in master order')
    el = rj(f'{out}/demo-course/core/el.json'); dr = rj(f'{out}/demo-course/core/drafts/el.json')
    ok(set(el) == {f'c:a.b/gloss#{H("accent")}', f'k:course/title#{H("Arabic · German")}'},
       'el.json holds only reviewed texts made for the current master')
    ok(set(dr) == {f'c:a.c/gloss#{H("accident")}', f'g:de:fn.x/blocks/3/text#{H(M_core["g:de:fn.x/blocks/3/text"])}'},
       'drafts/el.json: Claude’s drafts and reviewed texts whose master changed (stale) — to be re-reviewed')
    ok(totals['el']['orphans'] == 1 and totals['el']['missing'] == 2, 'counts: the orphan left out, untranslated texts counted')
    ok(rj(f'{out}/_typology/el.json') == {} and not os.path.exists(f'{out}/_typology/drafts/el.json'),
       'an empty <locale>.json still exists (the language exists in Weblate)')
    ok(WF.check(out, log=quiet), 'check: the exchange tree is well formed')
    ok(WF.split_key('g:de:fn.x/blocks/3/text#0123456789ab') == ('g:de:fn.x/blocks/3/text', '0123456789ab')
       and WF.split_key('no-hash') == (None, None), 'split_key')

    # round trip: Weblate wrote the files back unchanged → nothing changes in the facades
    WF.import_(course, out, master_dir=master, write=True, manifest=False, log=quiet)
    ok(all(rd(p) == s for p, s in before.items()), 'round trip without changes: the facades are byte-identical (src kept)')

    # Weblate approved: Claude's draft as it was, the stale one corrected, a missing one translated; plus a superseded key
    flat = rj(f'{out}/demo-course/core/el.json')
    flat[f'c:a.c/gloss#{H("accident")}'] = 'ατύχημα'
    flat[f'g:de:fn.x/blocks/3/text#{H(M_core["g:de:fn.x/blocks/3/text"])}'] = 'Μια *λάθος* μορφή {όχι ICU} — «σε εισαγωγικά»\n- στοιχείο'
    flat[f'c:a.d/gloss#{H("new text")}'] = 'νέο κείμενο'
    flat[f'c:a.b/gloss#{H("old accent")}'] = 'παλιά προφορά'          # made for an older master text
    flat[f'c:none/gloss#{H("x")}'] = 'ορφανό'                          # address no longer in the master
    flat[f'k:course/title#{H("Arabic · German")}'] = ''                 # untranslated in Weblate's file
    wj(f'{out}/demo-course/core/el.json', flat)
    tot = WF.import_(course, out, master_dir=master, write=False, manifest=False, log=quiet)
    ok(rd(fp_core) == before[fp_core], 'import is a dry run without --write')
    st = tot['el']
    ok((st['approved_drafts'], st['changed'], st['new'], st['superseded'], st['orphan'], st['empty']) == (1, 1, 1, 1, 1, 1),
       f'import plan: 1 approved draft, 1 changed, 1 new, 1 superseded, 1 orphan, 1 empty ({st})')
    WF.import_(course, out, master_dir=master, write=True, manifest=False, log=quiet)
    f = rj(fp_core)
    ok(f['c:a.c/gloss'] == {'t': 'ατύχημα', 'src': H('accident'), 'by': 'weblate'}, 'an approved draft: by "weblate", src = its master hash')
    ok(f['g:de:fn.x/blocks/3/text']['src'] == H(M_core['g:de:fn.x/blocks/3/text']) and f['g:de:fn.x/blocks/3/text']['t'].endswith('- στοιχείο'),
       'a corrected stale text: src refreshed, Markdown line breaks kept')
    ok(f['c:a.d/gloss'] == {'t': 'νέο κείμενο', 'src': H('new text'), 'by': 'weblate'}, 'a new translation is added')
    ok(f['c:a.b/gloss'] == core_el['c:a.b/gloss'], 'a translation of an older master text never replaces the current one (superseded)')
    ok(f['x:gone/profile/0'] == core_el['x:gone/profile/0'] and 'c:none/gloss' not in f, 'import never deletes, never adds orphans')
    ok(f['k:course/title'] == core_el['k:course/title'], 'an empty string in Weblate’s file is not an approval')
    ok(list(f) == sorted(f), 'a facade sorted by address stays sorted (smallest diff)')
    WF.import_(course, out, master_dir=master, write=True, manifest=False, log=quiet)
    ok(rj(fp_core) == f, 'importing twice changes nothing (idempotent)')
    # without the master: no superseded guard, but still exact src from the key
    t2 = WF.import_(course, out, use_master=False, write=False, manifest=False, log=quiet)['el']
    ok(t2['superseded'] == 0 and t2['changed'] >= 1, '--no-master: the key’s hash is still the src (the superseded guard needs the master)')

    # ------------------------------------------------------------------------------------------------ prune_drafts
    print('prune_drafts.js')
    repo = os.path.join(tmp, 'repo'); i18n = os.path.join(repo, 'i18n')
    wj(f'{i18n}/engine/en.arb', {'@@locale': 'en', 'a': 'A', '@a': {'description': 'd'}, 'b': 'B {n}', 'c': 'C',
                                 'd': 'Legal', '@d': {'description': 'terms', 'x-sensitive': True}}, 2)
    wj(f'{i18n}/engine/el.arb', {'@@locale': 'el', 'a': 'Α', 'c': ''}, 2)
    wj(f'{i18n}/engine/drafts/el.arb', {'@@locale': 'el', 'a': 'α (draft)', 'b': 'Β {n}', 'c': 'Γ', 'd': 'Νομικό', 'z': 'gone'}, 2)
    wj(f'{i18n}/engine/fr.arb', {'@@locale': 'fr', 'a': 'A fr', 'b': 'B {n} fr'}, 2)
    wj(f'{i18n}/engine/drafts/fr.arb', {'@@locale': 'fr', 'a': 'a?', 'b': 'b?'}, 2)
    os.makedirs(f'{i18n}/glossary/drafts', exist_ok=True)
    with open(f'{i18n}/glossary/el.csv', 'w', encoding='utf-8') as fh: fh.write('source,target,description\n"step","σταθμός","One stop"\n"map","","x"\n')
    gd = 'source,target,description\n"step","βήμα","One stop, on a ""Roadmap"""\n"map","χάρτης","multi\nline"\n'
    with open(f'{i18n}/glossary/drafts/el.csv', 'w', encoding='utf-8') as fh: fh.write(gd)
    node = lambda *a: subprocess.run(['node', os.path.join(ROOT, 'tools', 'i18n', 'prune_drafts.js'), '--root', repo, *a], capture_output=True, text=True)
    r = node()
    ok(r.returncode == 0 and 'would prune' in r.stdout and rj(f'{i18n}/engine/drafts/el.arb')['a'] == 'α (draft)', 'dry run by default: nothing written')
    ok(node('--check').returncode == 1, '--check fails while approved drafts remain (CI warning)')
    r = node('--write')
    d = rj(f'{i18n}/engine/drafts/el.arb')
    ok(list(d) == ['@@locale', 'b', 'c', 'd', 'z'], 'approved keys removed; drafts of untranslated / empty-approved keys kept; order kept')
    ok(not os.path.exists(f'{i18n}/engine/drafts/fr.arb'), 'a draft file with nothing left is deleted')
    ok(rd(f'{i18n}/glossary/drafts/el.csv') == 'source,target,description\n"map","χάρτης","multi\nline"\n',
       'glossary drafts: the approved term removed, the other row kept byte for byte (quotes, newline in a field)')
    ok(rd(f'{i18n}/engine/el.arb').startswith('{\n  "@@locale": "el"'), 'approved catalogs untouched')
    ok(node('--check').returncode == 0, 'nothing left to prune')
    node('--write', '--not-in-english')
    ok('z' not in rj(f'{i18n}/engine/drafts/el.arb'), '--not-in-english drops keys en.arb no longer has')

    # ------------------------------------------------------------------------------------------------ draft import
    print('weblate_import_drafts.py (no network)')
    wj(f'{i18n}/engine/drafts/el.arb', {'@@locale': 'el', 'a': 'α', 'b': 'Β {n}', 'd': 'Νομικό', 'z': 'x', 'c': ''}, 2)
    ups = WD.plan_arb(repo)
    u = next(x for x in ups if (x.component, x.locale) == ('engine', 'el'))
    body = json.loads(u.content)
    ok(list(body) == ['@@locale', 'b', 'd'] and u.repo_file == 'i18n/engine/el.arb' and u.name == 'el.arb',
       'ARB plan: only keys in English and not yet approved; empty drafts skipped; the translation found by its file')
    ok(u.info['approved_already'] == 1 and u.info['not_in_english'] == 1 and u.info['sensitive'] == 1, 'the plan counts what it skips; sensitive keys flagged')
    ok('d' not in json.loads(next(x for x in WD.plan_arb(repo, skip_sensitive=True) if x.locale == 'el').content), '--skip-sensitive')
    g = WD.plan_glossary(repo)
    ok(len(g) == 1 and g[0].content.decode().splitlines()[0] == '"source","target"' and g[0].keys == 1, 'glossary plan: the not yet approved rows')
    fu = WD.plan_facades(out)
    ok(not any(x.component == 'demo-course-core' for x in fu), 'facade plan: drafts Weblate already approved (in <locale>.json) are not sent again')
    ph = [x for x in fu if x.component == 'phenomena-ar']
    ok(len(ph) == 1 and ph[0].keys == 1 and ph[0].project == 'noema-lite-courses' and ph[0].repo_file == 'weblate-facades/_phenomena/ar/el.json',
       'facade plan: project noema-lite-courses, slug from INDEX.json, the translation found by its file')
    sent = []

    class FakeApi(WD.Api):
        def _req(self, method, url, data=None, headers=None):
            sent.append((method, url, data, headers))
            if method == 'GET': return {'results': [{'filename': 'i18n/engine/el.arb', 'url': 'https://w.example/api/translations/noema-lite/engine/el/'}], 'next': None}
            return {'accepted': 2, 'skipped': 0, 'not_found': 0, 'total': 2}
    fa = FakeApi('https://w.example', 'wlu_SECRET')
    logs = []
    res = WD.run_uploads(fa, [u, next(x for x in ups if x.locale == 'ru')] if any(x.locale == 'ru' for x in ups) else [u], log=logs.append)
    post = [s for s in sent if s[0] == 'POST'][0]
    ok(post[1] == 'https://w.example/api/translations/noema-lite/engine/el/file/', 'POST /api/translations/<project>/<component>/<language>/file/')
    ok(b'name="method"\r\n\r\nfuzzy' in post[2] and b'name="conflicts"\r\n\r\nignore' in post[2] and b'filename="el.arb"' in post[2] and u.content in post[2],
       'multipart: method=fuzzy ("needs editing"), conflicts=ignore (never overwrite a translation), the ARB file')
    ok(not any('wlu_SECRET' in line for line in logs), 'the token is never printed')
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'i18n', 'weblate_import_drafts.py'), '--repo', repo, '--apply'],
                       capture_output=True, text=True, env={k: v for k, v in os.environ.items() if not k.startswith('WEBLATE_')})
    ok(r.returncode == 1 and 'must be set' in r.stdout, '--apply without WEBLATE_URL / WEBLATE_API_TOKEN refuses (no network)')

    # ------------------------------------------------------------------------------------------------ setup
    print('weblate_setup.py and the configuration')
    made = WS.init_locale('es-ES', repo, write=False, log=quiet)
    ok(made and not os.path.exists(f'{i18n}/engine/es-ES.arb'), 'init-locale: dry run by default')
    WS.init_locale('es-ES', repo, write=True, log=quiet)
    ok(rj(f'{i18n}/engine/es-ES.arb') == {'@@locale': 'es-ES'} and rd(f'{i18n}/glossary/es-ES.csv') == 'source,target,description\n',
       'init-locale --write: {"@@locale": tag} stubs (BCP 47 file names), a header-only glossary file')
    try: WS.init_locale('xx', repo, log=quiet); ok(False, 'unknown locale refused')
    except SystemExit: ok(True, 'init-locale refuses a tag that is not a UI locale')
    ok(WS.cla_text(os.path.join(ROOT, 'weblate', 'CLA.md')) is None, 'CLA.md is still the DRAFT: never installed as the agreement')
    try:
        import yaml  # noqa: F401
        cfg = WS.load_config(os.path.join(ROOT, 'weblate', 'components.yaml'))
        plan = WS.desired(cfg, ROOT, os.path.dirname(out + '/'))
        ui = plan[0]; names = [c['slug'] for c in ui['components']]
        dirs = sorted(d for d in os.listdir(os.path.join(ROOT, 'i18n')) if os.path.exists(os.path.join(ROOT, 'i18n', d, 'en.arb')))
        ok(sorted(n for n in names if n != 'glossary') == dirs and names[0] == 'core', 'one ARB component per i18n/<component>/en.arb; core first')
        ok(all(c['repo'] == 'weblate://noema-lite/core' for c in ui['components'][1:]), 'the others link to core (one clone, one pull request)')
        c0 = ui['components'][0]
        ok(c0['push_branch'] == 'weblate-translations' and c0['branch'] == 'main' and c0['push_branch'] != c0['branch'] and c0['vcs'] == 'github',
           'GitHub pull requests from weblate-translations — never a push to main')
        ok(c0['filemask'] == 'i18n/core/*.arb' and c0['template'] == 'i18n/core/en.arb' and c0['file_format'] == 'arb'
           and c0['language_code_style'] == 'bcp' and 'icu_message_format' in c0['enforced_checks'], 'monolingual ARB, BCP 47 file names, ICU check enforced')
        ok('agreement' not in c0, 'no contributor agreement while the CLA is a draft')
        ok(cfg['ui']['project']['commit_policy'] == 30 and cfg['courses']['project']['commit_policy'] == 30, 'both projects: only approved translations are committed')
        ok('glossary' not in names and any('glossary' in n for n in ui['notes']), 'the glossary is held back while its CSV has the column "description"')
        co = plan[1]
        ok([c['slug'] for c in co['components']] == [c['slug'] for c in idx['components']] and co['components'][0]['branch'] == 'weblate-facades'
           and co['components'][0]['file_format'] == 'json', 'the courses project: one flat-JSON component per facade file, on the exchange branch')
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'i18n', 'weblate_setup.py'), 'apply', '--apply'], capture_output=True, text=True,
                           env={k: v for k, v in os.environ.items() if not k.startswith('WEBLATE_')})
        ok(r.returncode != 0 and 'OWNER' in (r.stdout + r.stderr), 'apply --apply refuses while the GitHub owner is the placeholder')
    except ImportError:
        print('  (PyYAML not installed: the configuration checks are skipped)')
    env = rd(os.path.join(ROOT, 'weblate', '.env.example'))
    secrets = [l for l in env.splitlines() if l and not l.startswith('#') and l.split('=', 1)[0].endswith(('PASSWORD', 'TOKEN', 'SECRET')) and l.split('=', 1)[1].strip()]
    ok(not secrets, '.env.example carries no secret values')
    dc = rd(os.path.join(ROOT, 'weblate', 'docker-compose.yml'))
    ok('weblate/weblate:2026.' in dc and ':latest' not in dc and 'image: weblate/weblate\n' not in dc, 'docker-compose: the Weblate image is pinned')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f'weblate tools: {"all passed" if not fails else f"{fails} FAILED"}')
sys.exit(1 if fails else 0)
