"""The data contracts for the Python tools: the SAME compiled validators as the app and the connector
(src/contracts/schemas → engine/contracts.js, `npm run contracts`), run in node, so a file gets the same verdict and the
same words everywhere (tools/validate.py, tools/build.py, the skill's make_pack.py).

    import contracts
    contracts.problems('noema.chapter.v1', chapter)            → ['sections[0].title: missing', …]
    contracts.check_many([('noema.subject.v1', subj), …])        → [[issue, …], …]   (one node run for many documents)

An issue is {path, pointer, keyword, message, text} (src/contracts/messages.ts). The contract ids: a schema
("noema.pack.v3") or one of its $defs ("noema.chapter.v1#exercise"). Without node or without engine/contracts.js this
raises ContractsUnavailable: the shape of a file is never left unchecked."""
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
# the repository's engine/contracts.js, or the copy beside this file (the skill's scripts/)
CANDIDATES = (os.path.join(HERE, '..', 'engine', 'contracts.js'), os.path.join(HERE, 'contracts.js'))

class ContractsUnavailable(RuntimeError):
    pass

_RUN = r"""
const fs = require('fs');
require(process.argv[1]);
const C = globalThis.NoemaCore.contracts;
const jobs = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(jobs.map(([id, doc]) => C.check(id, doc).issues)));
"""

def _script():
    for p in CANDIDATES:
        if os.path.isfile(p): return os.path.abspath(p)
    raise ContractsUnavailable('engine/contracts.js is missing: build it with `npm ci && npm run contracts` (tools/contracts.mjs)')

def check_many(jobs):
    """[(contract id, document), …] → the issues of each, in order."""
    jobs = list(jobs)
    if not jobs: return []
    node = shutil.which('node')
    if not node: raise ContractsUnavailable('node is not installed: the data contracts run in node (engine/contracts.js)')
    r = subprocess.run([node, '-e', _RUN, _script()], input=json.dumps(jobs, ensure_ascii=False), capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0: raise ContractsUnavailable('the data contracts failed to run: ' + (r.stderr.strip().splitlines() or ['?'])[-1])
    return json.loads(r.stdout)

def check(contract, doc):
    return check_many([(contract, doc)])[0]

def problems(contract, doc, where=''):
    """The issues' texts, each prefixed with where ("ch03-e001: q: missing")."""
    return [(f'{where}: ' if where else '') + i['text'] for i in check(contract, doc)]
