"""Databricks pictures for the visual exercises (docs/VISUAL.md). Drawn from the chapters' own diagrams.
Run via visual_v1.py (writes media/*.svg + media/media.json)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', '..', 'tools'))
from svgkit import Diagram

MEDIA = os.path.join(HERE, '..', 'media')
ITEMS = []
def save(d, mid, alt, caption, src):
    ITEMS.append(d.save(MEDIA, mid, alt=alt, caption=caption, src=src))


def ch01_stack():   # ch01-s10 "The One Diagram"
    d = Diagram(800, 560, title='The one diagram: who does what')
    d.box('you', 150, 60, 220, 56, 'YOU', sub='SQL / Python', color='gray', note='You write SQL or Python in a notebook, query or job.')
    d.box('compute', 130, 165, 260, 80, 'Compute engine', sub='Spark / Photon', color='violet', note='Runs the work. Ephemeral: it can terminate, the data stays.', q='Which layer runs your code — and may disappear tonight?')
    d.box('delta', 130, 300, 260, 90, 'Delta table', sub='Parquet data files + transaction log', color='blue', size=17, note='The table format: Parquet files + a versioned log that says which files form the table.', q='Which layer turns many files into one versioned table?')
    d.cyl('storage', 130, 440, 260, 100, 'Cloud storage', sub='S3 / ADLS / GCS', color='teal', note='Where the bytes physically live (files + log). Persists after compute is gone.', q='Where do the bytes physically live?')
    d.box('uc', 500, 300, 260, 90, 'Unity Catalog', sub='catalog.schema.orders', color='orange', note='Governance layer: the name catalog.schema.table and its permissions.', q='Which layer gives the table its three-level name and its permissions?')
    d.arrow('you', 'compute', label='SQL / Python', loff=(60, 0))
    d.arrow('compute', 'delta', label='reads / writes', loff=(60, 0))
    d.arrow('delta', 'storage', label='physically lives in', loff=(75, 0))
    d.arrow('uc', 'delta', label='registers + governs', dashed=True, loff=(0, 18))
    d.line([(390, 205), (630, 205), (630, 296)], dashed=True, label='resolves name + checks permission', loff=(20, -14))
    save(d, 'dbx-one-diagram', 'Vertical stack: you write SQL or Python; the compute engine (Spark/Photon) reads and writes a Delta table (Parquet data files plus a transaction log), which physically lives in cloud storage. Unity Catalog on the side registers and governs the table under a catalog.schema.table name.',
         'Spark computes. Storage persists. Delta gives files table semantics. Unity Catalog governs the objects.', 'part1')


def ch02_medallion():   # ch02-s10/s11
    d = Diagram(800, 600, title='Medallion architecture: the e-shop end to end')
    d.box('pg', 30, 80, 150, 46, 'PostgreSQL', color='gray', size=15)
    d.box('kafka', 30, 140, 150, 46, 'Kafka', color='gray', size=15)
    d.box('json', 30, 200, 150, 46, 'JSON files', color='gray', size=15)
    d.box('bronze', 290, 110, 220, 110, 'BRONZE', sub='raw, source-faithful', color='orange', size=20, note='Keeps what the source sent (duplicates, nulls, bad formats) — for audit, reprocessing and debugging.')
    d.box('clean', 250, 262, 300, 64, 'parse · validate · deduplicate', sub='apply CDC · cast types', color='gray', size=14, note='Silver is built by cleaning Bronze.')
    d.box('silver', 290, 362, 220, 110, 'SILVER', sub='customers · orders · products', color='blue', size=20, note='Cleaned, validated, deduplicated, CDC applied: reusable datasets for analysts and data scientists.')
    d.box('agg', 560, 395, 200, 46, 'aggregate / model', color='gray', size=14)
    d.box('gold', 560, 480, 200, 90, 'GOLD', sub='daily_sales · lifetime value', color='yellow', size=20, note='Business-shaped aggregates and models for specific consumers.')
    d.box('bi', 290, 500, 220, 60, 'CEO dashboard / BI', color='green', size=15)
    for s in ('pg', 'kafka', 'json'): d.arrow(s, 'bronze')
    d.arrow('bronze', 'clean'); d.arrow('clean', 'silver')
    d.line([(510, 418), (556, 418)]); d.arrow('agg', 'gold'); d.arrow('gold', 'bi')
    save(d, 'dbx-medallion', 'PostgreSQL, Kafka and JSON files flow into BRONZE (raw); a cleaning step (parse, validate, deduplicate, apply CDC, cast types) builds SILVER (customers, orders, products); an aggregation step builds GOLD (daily sales, lifetime value) which feeds the CEO dashboard.',
         'Bronze → Silver → Gold: progressively increasing data quality.', 'part1')


def ch03_cicd():   # ch03-s06 / s08
    d = Diagram(800, 470, title='From a git push to production')
    d.text(24, 72, 'CI — on every push / PR', size=15, weight=800, color='#7c5cff')
    x = 24
    for rid, lab in (('lint', 'lint'), ('unit', 'unit tests'), ('integ', 'integration tests'), ('config', 'config validation'), ('build', 'build')):
        w = d.pill(rid, x, 96, lab, color='violet', size=14)
        if rid != 'build': d.line([(x + w + 2, 110), (x + w + 18, 110)])
        x += w + 22
    d.text(24, 178, 'CD — controlled deployment', size=15, weight=800, color='#12a5a0')
    x = 24
    for rid, lab in (('main', 'main branch'), ('tests', 'tests'), ('depstg', 'deploy staging'), ('integ2', 'integration tests'), ('depprod', 'deploy production')):
        w = d.pill(rid, x, 202, lab, color='teal', size=14)
        if rid != 'depprod': d.line([(x + w + 2, 216), (x + w + 18, 216)])
        x += w + 22
    d.box('dev', 24, 300, 190, 120, 'DEV', sub='experiment\nsample data', color='blue', size=20, note='Developers may break things here: dev_nikos.silver.orders.')
    d.box('stg', 305, 300, 190, 120, 'TEST / STAGING', sub='close to prod\nno real users', color='orange', size=18, note='Checks permissions, dependencies, configuration, integration and data quality — without impacting real consumers.')
    d.box('prod', 586, 300, 190, 120, 'PROD', sub='real workloads\nmonitored', color='green', size=20, note='Controlled deployments and stable configs only — never manual edits + Run All.')
    d.arrow('dev', 'stg', label='code changes', loff=(0, -16)); d.arrow('stg', 'prod', label='validated', loff=(0, -16))
    save(d, 'dbx-cicd', 'Top row: the CI pipeline run on every push (lint, unit tests, integration tests, configuration validation, build). Middle row: the CD flow (main branch, tests, deploy staging, integration tests, deploy production). Bottom: three environments DEV → TEST/STAGING → PROD.',
         'If CI fails: don’t merge, don’t deploy.', 'part1')


def ch04_planes():   # ch04-s03 / s04
    d = Diagram(800, 600, title='Control plane vs compute plane')
    d.box('browser', 30, 70, 160, 56, 'Your browser', sub='notebook UI', color='gray', size=15, note='Shows the notebook. It does NOT run your groupBy.')
    d.group('acct', 220, 70, 560, 210, 'Databricks-managed', color='violet', area=False)
    d.group('cp', 240, 110, 290, 150, 'Control plane', color='violet', note='Web app, APIs, workspace + job metadata, orchestration: manages and coordinates. Your Spark work does not run here.')
    d.pill(None, 256, 140, 'web app / UI', color='violet', size=13); d.pill(None, 392, 140, 'APIs', color='violet', size=13)
    d.pill(None, 256, 180, 'job orchestration', color='violet', size=13); d.pill(None, 256, 218, 'workspace metadata', color='violet', size=13)
    d.group('sl', 550, 110, 210, 150, 'Serverless compute', color='blue', note='Serverless compute plane: Databricks allocates, scales and manages the compute for you.')
    d.box('slc', 575, 150, 160, 80, 'compute managed', sub='by Databricks', color='blue', size=14)
    d.group('cust', 20, 320, 760, 260, 'Your cloud account', color='gray', area=False)
    d.group('cl', 40, 360, 440, 200, 'Classic compute', color='orange', note='Classic compute plane: driver + worker VMs that you configure, in your own cloud account.')
    d.box('driver', 60, 400, 140, 60, 'Driver VM', sub='Spark session', color='orange', size=15, note='Coordinates: plans and schedules tasks.')
    d.box('w1', 220, 400, 115, 60, 'Worker VM', color='orange', size=14); d.box('w2', 345, 400, 115, 60, 'Worker VM', color='orange', size=14)
    d.box('w3', 220, 480, 240, 60, 'Workers run the tasks', color='orange', size=14, region=False)
    d.cyl('storage', 540, 380, 200, 160, 'Data storage', sub='S3 / ADLS / GCS', color='teal', note='Your data in your cloud storage.')
    d.arrow('browser', 'cp', label='command', loff=(-6, -16))
    d.line([(385, 262), (385, 300), (130, 300), (130, 396)], label='schedule / coordinate', loff=(0, -12))
    d.arrow('w2', 'storage', label='read / write', loff=(0, -12))
    save(d, 'dbx-planes', 'Your browser sends a command to the control plane (web app, APIs, job orchestration, workspace metadata), which is Databricks-managed together with the serverless compute plane. The classic compute plane (driver VM and worker VMs) and the data storage are in your own cloud account; the control plane schedules work on the compute, the workers read and write storage.',
         'The control plane manages and coordinates; the compute plane does the work.', 'part1')


def ch05_layout():   # ch05-s01 / s02
    d = Diagram(800, 530, title='Anatomy of a Delta table on storage')
    d.box(None, 30, 60, 170, 46, 'orders/', color='gray', size=17, region=False)
    for i, (rid, nm) in enumerate((('p0', 'part-00000-….parquet'), ('p1', 'part-00001-….parquet'), ('p2', 'part-00002-….parquet'))):
        d.doc(rid, 70, 130 + i * 62, 220, 46, nm, color='blue', size=13, note='Data file: the real rows, column by column (Parquet).', q='What kind of file holds the real rows?')
    d.doc('dv', 70, 320, 220, 46, 'deletion vector', color='pink', size=13, note='Marks deleted rows of a data file without rewriting it.', q='What marks deleted rows without rewriting the data file?')
    d.box('log', 360, 60, 190, 46, '_delta_log/', color='orange', size=17, note='The versioned table state: one commit file per version (+ checkpoints).', q='Which folder holds the versioned state of the table?')
    names = (('j000', '…00000.json', 'v0'), ('j001', '…00001.json', 'v1'), ('j100c', '…00100.checkpoint.parquet', 'v100'), ('j101', '…00101.json', 'v101'), ('j102', '…00102.json', 'v102'), ('j103', '…00103.json', 'v103'))
    for i, (rid, nm, v) in enumerate(names):
        y = 130 + i * 62 + (14 if i >= 2 else 0)
        d.doc(rid, 400, y, 260, 46, nm, color='yellow' if 'checkpoint' in nm else 'orange', size=13,
              note='Checkpoint: a Parquet summary of the table state up to v100.' if 'checkpoint' in nm else f'Commit file of version {v[1:]}: JSON actions (add / remove / metadata).')
        d.text(690, y + 23, v, size=14, weight=700, color='#5b6172')
        if i == 1: d.text(530, y + 62, '⋮', size=20, weight=700, anchor='middle', color='#868e96')
    d.line([(36, 108), (36, 345), (66, 345)], arrow=False, color='#adb5bd')
    for i in range(3): d.line([(36, 153 + i * 62), (66, 153 + i * 62)], arrow=False, color='#adb5bd')
    d.line([(200, 83), (356, 83)], arrow=False, color='#adb5bd')
    d.line([(380, 108), (380, 482), (396, 482)], arrow=False, color='#adb5bd')
    for y in (153, 215, 291, 353, 415): d.line([(380, y), (396, y)], arrow=False, color='#adb5bd')
    save(d, 'dbx-delta-layout', 'Folder orders/ with three Parquet data files and a deletion vector file, and the _delta_log/ folder with JSON commit files for version 0, 1, a checkpoint Parquet file at version 100, then JSON commits 101, 102 and 103.',
         'The table is the set of files the log says belong to the current snapshot — not every file in the folder.', 'part1')


def ch05_vacuum():   # ch05-s07
    d = Diagram(800, 400, title='Why old files pile up (and what VACUUM removes)')
    rows = (('v0', ['A', 'B']), ('v1', ['B', 'C']), ('v2', ['C', 'D']))
    for i, (v, fs) in enumerate(rows):
        y = 70 + i * 52
        d.text(40, y + 18, v, size=17, weight=800)
        d.text(90, y + 18, '→  {' + ', '.join(fs) + '}' + ('      ← current snapshot' if v == 'v2' else ''), size=17, weight=600, color='#343a40')
    d.text(40, 271, 'physically on storage:', size=15, weight=700, color='#5b6172')
    for i, f in enumerate('ABCD'):
        d.doc('f' + f.lower(), 240 + i * 130, 236, 100, 70, f, color='green' if f in 'CD' else 'gray', size=22,
              note='In the current snapshot.' if f in 'CD' else 'Not referenced by the current snapshot (only by old versions).')
    d.text(40, 345, 'Old files stay for time travel until VACUUM deletes them (after the retention period).', size=14, color='#5b6172')
    save(d, 'dbx-vacuum', 'Versions: v0 has files A and B, v1 has B and C, v2 (current) has C and D. Physically on storage there are four files: A, B, C and D.',
         'VACUUM is physical garbage collection of files no longer referenced (after retention).', 'part1')


def ch06_skipping():   # ch06-s11
    d = Diagram(800, 400, title='Data skipping with file statistics')
    stats = (('fa', 'file A', 1, 1000, 'blue'), ('fb', 'file B', 1001, 2000, 'blue'), ('fc', 'file C', 2001, 3000, 'blue'), ('fd', 'file D', 1, 3000, 'red'))
    for i, (rid, nm, lo, hi, col) in enumerate(stats):
        x = 30 + i * 192
        d.box(rid, x, 80, 170, 150, '', color=col, region=False)
        d.region(rid, x, 80, 170, 150, label=nm.title(), note=f'customer_id min={lo}, max={hi}.')
        d.text(x + 85, 112, nm, size=19, weight=800, anchor='middle')
        d.text(x + 85, 160, f'min = {lo}', size=16, weight=600, anchor='middle')
        d.text(x + 85, 192, f'max = {hi}', size=16, weight=600, anchor='middle')
    d.text(30 + 3 * 192 + 85, 252, '(written before clustering)', size=12, anchor='middle', color='#e5484d')
    d.text(30, 300, 'customer_id statistics per file, stored in the Delta log (add actions).', size=15, color='#5b6172')
    d.text(30, 330, 'A file whose [min, max] cannot contain the value is skipped — never read.', size=15, color='#5b6172')
    save(d, 'dbx-skipping', 'Four Parquet files with customer_id statistics: file A min 1 max 1000, file B min 1001 max 2000, file C min 2001 max 3000, and file D min 1 max 3000 (written before clustering).',
         'Stats help only when values are clustered into narrow ranges per file.', 'part1')


def ch07_decision():   # ch07-s12
    d = Diagram(800, 520, title='Choosing compute: the one decision diagram')
    d.box('root', 270, 60, 260, 54, 'What is my workload?', color='gray', size=17)
    wl = (('wint', 'INTERACTIVE', 30), ('wjob', 'JOB', 225), ('wpipe', 'PIPELINE', 420), ('wsql', 'SQL / BI', 615))
    for rid, lab, x in wl:
        d.box(rid, x, 160, 160, 50, lab, color='violet', size=16)
        d.arrow('root', rid)
    leaves = {
        'wint': (('lint_s', 'Serverless notebook', 'blue'), ('lint_c', 'All-purpose (classic)', 'orange')),
        'wjob': (('ljob_s', 'Serverless Jobs', 'blue'), ('ljob_c', 'Classic Jobs compute', 'orange')),
        'wpipe': (('lpipe_s', 'Serverless pipeline', 'blue'), ('lpipe_c', 'Classic pipeline', 'orange')),
        'wsql': (('lsql_s', 'Serverless SQL WH', 'blue'), ('lsql_p', 'Pro SQL WH', 'orange'), ('lsql_c', 'Classic SQL WH', 'orange')),
    }
    for rid, lab, x in wl:
        for j, (lid, ll, col) in enumerate(leaves[rid]):
            y = 270 + j * 72
            d.box(lid, x + 10, y, 140, 54, ll, color=col, size=13)
            d.line([(x + 4, 212), (x + 4, y + 27), (x + 8, y + 27)], color='#868e96')
    d.text(30, 495, 'blue = serverless (Databricks manages the infrastructure)   ·   orange = classic / you configure', size=13, color='#5b6172')
    save(d, 'dbx-compute-decision', 'Decision tree: first question "What is my workload?" with four branches — interactive, job, pipeline, SQL/BI. Each branch ends in a serverless option and a classic option: serverless notebook or all-purpose (classic); serverless jobs or classic jobs compute; serverless or classic pipeline; serverless, pro or classic SQL warehouse.',
         'First the workload, then the infrastructure.', 'part1')


def ch08_layers():   # ch08-s01
    d = Diagram(800, 520, title='The layered compute stack')
    rows = (('workload', 'YOUR WORKLOAD', 'Python · SQL · Spark · ML · pipelines', 'gray'),
            ('engine', 'EXECUTION ENGINE', 'Spark JVM and/or Photon', 'violet'),
            ('runtime', 'RUNTIME', 'Databricks Runtime: Spark + Python + JVM + libraries', 'blue'),
            ('nodes', 'COMPUTE NODES', 'one driver + worker(s), each a VM of some shape', 'orange'),
            ('infra', 'INFRASTRUCTURE', 'classic or serverless', 'teal'))
    notes = {'workload': 'What you write.', 'engine': 'What executes the plan: Spark (JVM) and/or the vectorized Photon engine.',
             'runtime': 'The versioned environment (DBR, LTS, ML) your code runs in.', 'nodes': 'Driver type and worker type = VM shapes; autoscaling changes the worker count.',
             'infra': 'Who manages the machines: you (classic) or Databricks (serverless).'}
    for i, (rid, name, content, col) in enumerate(rows):
        y = 70 + i * 86
        d.box('row-' + rid, 30, y, 740, 66, '', color=col, region=False)
        d.region('row-' + rid, 30, y, 740, 66, label=name.title(), note=notes[rid])
        d.pill('n-' + rid, 46, y + 17, name, color=col, size=14, w=200, note=notes[rid])
        d.text(270, y + 33, content, size=15, weight=600)
        if i: d.text(400, y - 10, '▼', size=14, anchor='middle', color='#868e96')
    save(d, 'dbx-layers', 'Five stacked layers from top to bottom: your workload (Python, SQL, Spark, ML, pipelines); execution engine (Spark JVM and/or Photon); runtime (Databricks Runtime: Spark, Python, JVM, libraries); compute nodes (one driver and workers, each a VM); infrastructure (classic or serverless).',
         'DBR, Photon, driver type, worker type and serverless are not alternatives on one level: each lives on its own layer.', 'part1')


def ch09_cluster():   # ch09-s02 / s03 / s06
    d = Diagram(800, 560, title='A classic cluster')
    d.box('driver', 270, 60, 260, 80, 'Driver', sub='SparkSession · plans · schedules tasks', color='violet', size=18, note='Builds the plan, splits it into stages and tasks, schedules them, tracks executors. Does not process the partitions.')
    for i in range(4):
        x = 20 + i * 196
        d.group(f'w{i + 1}', x, 200, 176, 320, f'Worker {i + 1}', color='orange', area=False, note='A worker VM. In Databricks classic: one executor per worker.')
        d.box(f'e{i + 1}', x + 12, 236, 152, 196, '', color='orange', region=False)
        d.region(f'e{i + 1}', x + 12, 236, 152, 196, label='Executor', note='The JVM process that runs tasks — one per worker.')
        d.text(x + 88, 256, f'Executor {i + 1}', size=14, weight=700, anchor='middle')
        for k in range(8):
            cx, cy = x + 24 + (k % 4) * 34, 280 + (k // 4) * 60
            d.raw(f'<rect x="{cx}" y="{cy}" width="28" height="44" rx="6" fill="#ffffff" stroke="#f08c00" stroke-width="1.5"/>')
            d.text(cx + 14, cy + 22, 'core', size=10, weight=600, anchor='middle', color='#5b6172')
        if i == 0: d.region('core1', x + 24, 280, 28, 44, label='Core = task slot', note='One active task per core.')
        d.cyl(f'disk{i + 1}', x + 30, 446, 116, 62, 'local disk', color='gray', size=13, note='Shuffle files and spill are written here — gone when the VM goes.')
        d.arrow('driver', (x + 88, 184))
    save(d, 'dbx-cluster', 'A driver (SparkSession, plans, schedules tasks) above four workers. Each worker holds one executor with 8 cores (task slots) and a local disk.',
         'Task slots = workers × cores (driver excluded). Waves ≈ tasks ÷ slots.', 'part1')


def ch10_phases():   # ch10-s02 — boxes shuffled on purpose (the order is the exercise)
    d = Diagram(800, 330, title='The 10 phases (shuffled) — what depends on what?')
    names = [('p7', 'Jobs'), ('p2', 'Delta Lake'), ('p9', 'Performance\n& Debugging'), ('p4', 'Ingestion'), ('p1', 'Compute'),
             ('p10', 'Production\nCI/CD'), ('p5', 'Structured\nStreaming'), ('p3', 'Unity Catalog'), ('p8', 'Databricks\nSQL'), ('p6', 'Declarative\nPipelines')]
    notes = {'p1': 'Phase 1: everything finally runs as Spark tasks on compute.', 'p2': 'Phase 2: Delta in practice.', 'p3': 'Phase 3: storage, namespace, governance, permissions.',
             'p4': 'Phase 4: files and external sources, incrementally.', 'p5': 'Phase 5: streaming.', 'p6': 'Phase 6: Lakeflow Spark Declarative Pipelines.', 'p7': 'Phase 7: Lakeflow Jobs and orchestration.',
             'p8': 'Phase 8: Databricks SQL.', 'p9': 'Phase 9: performance and debugging.', 'p10': 'Phase 10: production engineering, CLI and CI/CD.'}
    cols = ['violet', 'blue', 'teal', 'green', 'orange', 'pink', 'yellow', 'red', 'blue', 'violet']
    for i, (rid, nm) in enumerate(names):
        x, y = 24 + (i % 5) * 152, 80 + (i // 5) * 110
        d.box(rid, x, y, 140, 80, nm, color=cols[i], size=16, note=notes[rid])
    save(d, 'dbx-phases', 'Ten boxes in shuffled order: Jobs, Delta Lake, Performance & Debugging, Ingestion, Compute, Production CI/CD, Structured Streaming, Unity Catalog, Databricks SQL, Declarative Pipelines.',
         'Dependency order: each next layer needs the previous one.', 'part1')


def ch11_uc():   # ch11-s02
    d = Diagram(800, 600, title='Unity Catalog: the hierarchy')
    d.box('metastore', 300, 64, 220, 56, 'Metastore', sub='Europe (one per region)', color='violet', size=17, note='Top-level regional UC container for metadata and permissions.')
    for i, ws in enumerate('ABC'):
        d.box('ws' + ws.lower(), 24, 64 + i * 60, 150, 46, f'Workspace {ws}', color='gray', size=14, note='Where you WORK (notebooks, jobs, compute). Attached to the metastore — not part of catalog.schema.object.')
        d.line([(176, 87 + i * 60), (296, 92)], color='#adb5bd')
    for i, (cid, nm) in enumerate((('cdev', 'dev'), ('cprod', 'prod'), ('csand', 'sandbox'))):
        d.box(cid, 200 + i * 160, 190, 140, 50, nm, color='blue', size=16, note='Catalog: the primary unit of data isolation.')
        d.arrow('metastore', cid)
    for i, (sid, nm) in enumerate((('sbronze', 'bronze'), ('ssilver', 'silver'), ('sgold', 'gold'))):
        d.box(sid, 150 + i * 160, 300, 140, 50, nm, color='teal', size=16, note='Schema: a finer organisational / access-control layer inside a catalog.')
        d.line([(430, 242), (220 + i * 160, 296)], color='#495057')
    objs = (('otab', 'orders', 'table'), ('ovol', 'files_volume', 'volume'), ('ofn', 'normalize_email()', 'function'))
    for i, (oid, nm, kind) in enumerate(objs):
        d.box(oid, 60 + i * 240, 420, 200, 64, nm, sub=kind, color='orange', size=15, note=f'An object registered in prod.silver: a {kind}.')
        d.line([(380, 352), (160 + i * 240, 416)], color='#495057')
    d.text(400, 530, 'three-level name:  prod . silver . orders', size=17, weight=700, anchor='middle', color='#343a40')
    d.text(400, 560, 'catalog . schema . object', size=14, anchor='middle', color='#5b6172')
    save(d, 'dbx-uc-hierarchy', 'Workspaces A, B and C attach to one regional metastore. The metastore holds catalogs dev, prod and sandbox; catalog prod holds schemas bronze, silver and gold; schema silver holds the table orders, the volume files_volume and the function normalize_email(). The three-level name is prod.silver.orders.',
         'Metastore → catalog → schema → object. The workspace is not in the namespace.', 'part2')


def ch12_autoloader():   # ch12-s08 / s09
    d = Diagram(800, 520, title='Auto Loader: the bronze skeleton and its two state locations')
    d.cyl('landing', 24, 70, 180, 130, 'Landing zone', sub='orders_json/ (files)', color='teal', note='The source stays files; new files keep arriving.')
    d.box('reader', 260, 80, 240, 110, 'Auto Loader', sub='readStream.format("cloudFiles")\ncloudFiles.format = json', color='violet', size=17, note='Incremental file discovery + remembered state + schema handling, on Structured Streaming.', q='What discovers only the NEW files, on Structured Streaming?')
    d.box('writer', 560, 80, 210, 110, 'writeStream', sub='format("delta")\n.toTable(...)', color='blue', size=17, note='The Delta sink: commit the transaction, THEN advance the checkpoint.', q='Which side commits to Delta and THEN advances the progress?')
    d.box('bronze', 560, 380, 210, 100, 'Bronze table', sub='prod.bronze.orders', color='orange', size=17, note='Unity Catalog target table.')
    d.box('schemaloc', 200, 270, 280, 110, 'cloudFiles.schemaLocation', sub='_schemas/ · inferred schema\n+ how it evolved', color='yellow', size=15, note='“What SHAPE does the data have?” — set on the READ. Not progress!', q='Where does Auto Loader keep the inferred schema and its history?')
    d.box('ckpt', 200, 400, 280, 100, 'checkpointLocation', sub='files processed · offsets · batch ids', color='pink', size=15, note='“How FAR has this stream got?” — set on the WRITE. On durable storage, never /tmp.', q='Where does the stream remember which files are already processed?')
    d.arrow('landing', 'reader', label='new files', loff=(0, -12)); d.arrow('reader', 'writer', label='micro-batches', loff=(0, -16))
    d.arrow('writer', 'bronze', label='commit', loff=(32, 0))
    d.line([(330, 192), (330, 266)], dashed=True)
    d.line([(600, 192), (600, 240), (482, 450)], dashed=True)
    save(d, 'dbx-autoloader', 'Files land in orders_json/ in the landing zone; Auto Loader (readStream with format cloudFiles and cloudFiles.format json) discovers new files and passes micro-batches to writeStream (Delta), which commits into the Bronze table. The reader keeps the schema history in cloudFiles.schemaLocation (_schemas/); the writer keeps progress in checkpointLocation.',
         'schemaLocation = shape (read side). checkpointLocation = progress (write side).', 'part2')


def ch13_watermark():   # ch13-s07
    d = Diagram(800, 340, title='Watermark: max event time seen − delay')
    x0, x1, t0, t1 = 60, 760, 0, 25           # 10:00 … 10:25
    X = lambda m: x0 + (x1 - x0) * (m - t0) / (t1 - t0)
    d.line([(x0, 220), (x1 + 10, 220)], width=2.5)
    for m in range(0, 26, 5):
        d.line([(X(m), 214), (X(m), 226)], arrow=False)
        d.text(X(m), 246, f'10:{m:02d}', size=14, weight=600, anchor='middle', color='#5b6172')
    d.text(x1 - 4, 270, 'event time →', size=13, anchor='end', color='#5b6172')
    d.line([(X(20), 90), (X(20), 214)], color='#7c5cff', width=3, arrow=False)
    d.text(X(20), 76, 'max event time seen = 10:20', size=14, weight=700, anchor='middle', color='#7c5cff')
    d.region('wm', X(15) - 28, 140, 56, 100, label='Watermark (delay 5 min) = 10:15', note='10:20 − 5 min. Older events may be dropped; their window state can be finalised and evicted.')
    d.region('wm20', X(0) - 28, 140, 56, 100, label='Watermark (delay 20 min) = 10:00', note='10:20 − 20 min: events from 10:03 on are still accepted.')
    for m, col in ((3, '#4d7cfe'), (12, '#4d7cfe'), (17, '#4d7cfe'), (19, '#4d7cfe')):
        d.raw(f'<circle cx="{X(m):.1f}" cy="190" r="13" fill="{col}" stroke="#fff" stroke-width="3"/>')
        d.text(X(m), 160, f'10:{m:02d}', size=13, weight=700, anchor='middle')
    regs = [{'id': f'e{m:02d}', 'shape': 'circle', 'cx': round(X(m), 1), 'cy': 190, 'r': 18, 'label': f'event 10:{m:02d}',
             'note': ('older than the 10:15 watermark → too late, may be dropped' if m < 15 else 'newer than the watermark → still accepted')} for m in (3, 12, 17, 19)]
    d.regions.extend(regs)
    d.text(60, 300, 'Four events arriving now — the label is their EVENT time.', size=14, color='#5b6172')
    save(d, 'dbx-watermark', 'An event-time axis from 10:00 to 10:25. The maximum event time seen so far is 10:20. Four newly arriving events have event times 10:03, 10:12, 10:17 and 10:19. The watermark delay is 5 minutes.',
         'Watermark ≈ max event time seen − delay. Not a wall-clock timer, not a retention policy.', 'part2')


def ch13_checkpoint():   # ch13-s09
    d = Diagram(800, 420, title='Inside a streaming checkpoint')
    d.box(None, 30, 64, 180, 50, 'checkpoint/', color='gray', size=18, region=False)
    rows = (('offsets', 'offsets/', 'what range each micro-batch READS'), ('commits', 'commits/', 'which micro-batches were WRITTEN to the sink'),
            ('state', 'state/', 'state-store data of stateful operators'), ('metadata', 'metadata', 'the query’s identity'))
    for i, (rid, nm, what) in enumerate(rows):
        y = 140 + i * 66
        d.box(rid, 80, y, 170, 50, nm, color='pink' if rid != 'metadata' else 'violet', size=17, note=what)
        d.text(280, y + 25, what, size=16, weight=600)
        d.line([(50, y + 25), (76, y + 25)], arrow=False, color='#adb5bd')
    d.line([(50, 116), (50, 363)], arrow=False, color='#adb5bd')
    save(d, 'dbx-stream-checkpoint', 'A checkpoint folder with four entries: offsets/ (what range each micro-batch reads), commits/ (which micro-batches were written to the sink), state/ (state-store data of stateful operators) and metadata (the query identity).',
         'One checkpoint ↔ one query. Never share it, never delete it casually.', 'part2')


ALL = [ch01_stack, ch02_medallion, ch03_cicd, ch04_planes, ch05_layout, ch05_vacuum, ch06_skipping, ch07_decision, ch08_layers, ch09_cluster, ch10_phases, ch11_uc, ch12_autoloader, ch13_watermark, ch13_checkpoint]
def build():
    ITEMS.clear()
    for f in ALL: f()
    return ITEMS
