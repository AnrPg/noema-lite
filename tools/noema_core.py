"""The content checks for the Python tools: the SAME code as the app and the connector (src/features/content, the data
contracts of src/contracts and the engine library of src/engines), run in node through ONE bridge, build/noema-tools.cjs
(src/composition/noema-tools.ts, `npm run build`; the skill carries it as scripts/noema-tools.cjs). A file gets the same
verdict and the same words in tools/build.py, tools/pipeline.py, the skill's scripts, the app and the connector.

    import noema_core as core
    core.problems('noema.chapter.v1', chapter)            → ['sections[0].title: missing', …]
    core.check_activities(pack, ['el'])                   → (errors, warnings)
    core.batch([('pack.check', pack, None, {}), …])       → [value, …]   (one node run for many checks)

The operations are those of src/composition/noema-tools.ts (OPS). Without node or without the bridge this raises
CoreUnavailable: a file is never left unchecked."""
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
# the repository's build/noema-tools.cjs, or the copy beside this file (the skill's scripts/)
CANDIDATES = (os.path.join(HERE, '..', 'build', 'noema-tools.cjs'), os.path.join(HERE, 'noema-tools.cjs'))

class CoreUnavailable(RuntimeError):
    pass

class CoreError(RuntimeError):
    pass

def tool():
    """the path of the bridge (build/noema-tools.cjs in the repository, scripts/noema-tools.cjs in the skill)"""
    for p in CANDIDATES:
        if os.path.isfile(p): return os.path.abspath(p)
    raise CoreUnavailable('build/noema-tools.cjs is missing: build it with `npm ci && npm run build` (tools/esbuild.mjs)')

def node():
    n = shutil.which('node')
    if not n: raise CoreUnavailable('node is not installed: the content checks run in node (build/noema-tools.cjs)')
    return n

def run(*args, **kw):
    """runs one command of the bridge (validate, check-pack, rules) → subprocess.CompletedProcess (text)"""
    return subprocess.run([node(), tool(), *args], capture_output=True, text=True, encoding='utf-8', **kw)

def batch(jobs):
    """[(op, *args), …] → the value of each, in order (one node run). A failed operation raises CoreError."""
    jobs = [list(j) for j in jobs]
    if not jobs: return []
    r = subprocess.run([node(), tool(), 'batch'], input=json.dumps(jobs, ensure_ascii=False), capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0: raise CoreUnavailable('the content checks failed to run: ' + (r.stderr.strip().splitlines() or ['?'])[-1])
    out = []
    for j, x in zip(jobs, json.loads(r.stdout)):
        if not x.get('ok'): raise CoreError(f'{j[0]}: {x.get("error")}')
        out.append(x.get('value'))
    return out

def call(op, *args):
    return batch([(op, *args)])[0]

# ---- the data contracts (src/contracts): an issue is {path, pointer, keyword, message, text} ----
def check_many(jobs):
    """[(contract id, document), …] → the issues of each, in order. The ids: a schema ("noema.pack.v3") or one of its
    $defs ("noema.chapter.v1#exercise")."""
    return batch([('contracts.check', cid, doc) for cid, doc in jobs])

def check(contract, doc):
    return check_many([(contract, doc)])[0]

def problems(contract, doc, where=''):
    """The issues' texts, each prefixed with where ("ch03-e001: q: missing")."""
    return [(f'{where}: ' if where else '') + i['text'] for i in check(contract, doc)]

# ---- the content checks (src/features/content) ----
def rules():
    """the pack rules: {rules, notes, quality, languages} (src/features/content/domain/rules.ts)"""
    return call('rules')

def required_locales(own):
    """→ (translations, bridges, bridge pairs) every new pack in language OWN gets (rules.ts LANGUAGES minus its own language);
    a pair is (the language the learner reads, their native language): from the pack's own language and from each translation"""
    r = call('locales.required', own)
    return r['translations'], r['bridges'], [(p['source'], p['native']) for p in r['bridgePairs']]

def check_activities(pack, translations=None):
    """the activity rules of a pack (its registry, the runtimes, the specs) → (errors, warnings)"""
    r = call('activities.check', pack, list(translations) if translations is not None else None)
    return r['errors'], r['warnings']

def check_packages(pack, base):
    """the .h5p packages of the pack's h5p@1 items, each read from base/<entry> → (errors, warnings)"""
    r = call('activities.packages', pack, base)
    return r['errors'], r['warnings']

def requires(reg):
    """pack.requires for a registry: the core + each runtime and engine it uses"""
    return call('activities.requires', (reg or {}).get('items') or [], (reg or {}).get('parts')) if reg and reg.get('items') else []

def check_quality(chapter, subject):
    """the quality rules Q1–Q8 of one chapter → [{level, rule, msg}]"""
    return call('quality.check', chapter, subject)

def h5p_file(path):
    """the checks of one .h5p file → {errors, warnings, main} (main: its main library, or None)"""
    return call('h5p.file', os.path.abspath(path))
