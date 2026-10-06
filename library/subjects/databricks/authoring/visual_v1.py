"""Visual layer v1 for Databricks (docs/VISUAL.md): pictures + figures + visual exercises, as an ADDITIVE patch.
    python3 library/subjects/databricks/authoring/visual_v1.py
Writes media/*.svg, media/media.json and patches/visual_v1.json (exercise ids chNN-e6NN)."""
import os, sys, json, copy
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', '..', '..', '..', 'tools'))
import visual_v1_diagrams as V
from svgkit import write_registry

items = {it['id']: it for it in V.build()}
write_registry(V.MEDIA, list(items.values()))
SRC = json.load(open(os.path.join(HERE, '..', 'sources.json'), encoding='utf-8'))['chapters']

def regs(mid, relabel=None, accept=None):
    """Copy a picture's regions with exercise-specific labels (geometry stays identical)."""
    out = []
    for r in items[mid]['regions']:
        if relabel and r['id'] not in relabel: continue
        r = copy.deepcopy(r)
        if relabel: r['label'] = relabel[r['id']]
        if accept and r['id'] in accept: r['accept'] = accept[r['id']]
        out.append(r)
    return out

PATCH = []          # [{chapter, section, appendBlocks, appendExercises}]
def chapter(cid, figures, exercises):
    src = SRC[cid]
    n = 600   # visual_v1 reserves chNN-e6NN (e7NN–e9NN are used by the links patches)
    for sec, mid in figures:
        PATCH.append({'chapter': cid, 'section': sec, 'appendBlocks': [{'t': 'figure', 'media': mid, 'src': src}], 'appendExercises': []})
    for i, e in enumerate(exercises):
        n += 1
        e = dict({'id': f'{cid}-e{n}', 'difficulty': 2, 'tags': ['concept'], 'quick': i == 0, 'src': src}, **e)
        for k in [k for k, v in e.items() if v is None]: e.pop(k)
        PATCH.append({'chapter': cid, 'appendExercises': [e]})

# ---------------------------------------------------------------- ch01
chapter('ch01', [('ch01-s10', 'dbx-one-diagram')], [
    dict(type='img_drag', section='ch01-s10', media='dbx-one-diagram', targets=['compute', 'delta', 'storage', 'uc'], distractors=['Control plane', 'Workspace'], difficulty=1,
         q='Rebuild **the one diagram**: drag each name onto its layer.',
         explain='**Spark computes. Storage persists. Delta gives stored files table semantics. Unity Catalog governs the objects.** The compute engine (Spark/Photon) reads and writes the Delta table; the Delta table (Parquet files + transaction log) physically lives in cloud storage; Unity Catalog registers it under `catalog.schema.table` and checks permissions. The control plane and the workspace are real things — but not layers of this picture.'),
    dict(type='img_hotspot', section='ch01-s10', media='dbx-one-diagram', answer=['storage'], difficulty=1,
         why={'compute': 'Compute is ephemeral: when the cluster terminates, nothing of the table lives there.', 'delta': 'Delta is the *format* (files + log). Those files are stored in cloud storage — that is what persists.', 'uc': 'Unity Catalog stores the name and permissions (metadata), not the table’s bytes.'},
         q='The cluster terminates tonight. Tap the layer that still holds the table’s **bytes** tomorrow.',
         explain='**Cloud storage** (S3 / ADLS / GCS) keeps the Parquet data files and the `_delta_log`. Compute and storage have **independent lifetimes**: compute can stop, the data stays.'),
    dict(type='img_sequence', section='ch01-s10', media='dbx-one-diagram', targets=['you', 'compute', 'uc', 'delta', 'storage'], answer=['you', 'compute', 'uc', 'delta', 'storage'], tags=['concept', 'debug'],
         q='`SELECT * FROM main.sales.orders` — trace who gets involved, in order.',
         explain='You send SQL → the **compute engine** runs it → it resolves the name `main.sales.orders` and checks your permission in **Unity Catalog** → reads the **Delta** log to learn which files form the current snapshot → reads those Parquet files from **cloud storage**. Debugging tip: a PERMISSION_DENIED fails at the UC step; a missing file fails at the storage step.'),
    dict(type='img_occlusion', section='ch01-s10', media='dbx-one-diagram', targets=['compute', 'delta', 'storage', 'uc'],
         q='Cover & recall the four layers. Answer each question in your head, then reveal.',
         explain='If you can name all four layers and say what each one is responsible for, you can place almost any Databricks feature or error on the right layer.'),
])
# ---------------------------------------------------------------- ch02
chapter('ch02', [('ch02-s11', 'dbx-medallion')], [
    dict(type='img_drag', section='ch02-s10', media='dbx-medallion', targets=['bronze', 'silver', 'gold', 'agg'], distractors=['PLATINUM', 'STAGING'], difficulty=1,
         q='Drag the medallion layers (and the step that builds Gold) into place.',
         explain='**Bronze** = raw, source-faithful. **Silver** = cleaned, validated, deduplicated, CDC applied. **Gold** = business-shaped aggregates for a specific audience, built by an **aggregate / model** step. Medallion is a recommended *pattern* of progressively increasing quality — not a law.'),
    dict(type='img_hotspot', section='ch02-s10', media='dbx-medallion', answer=['bronze'], tags=['pitfall'],
         why={'silver': 'Silver is exactly what the buggy rule produced — rebuilding from it keeps the bug.', 'gold': 'Gold is derived from Silver: it inherited the bug.', 'pg': 'The source may no longer have the old data — that is why we keep Bronze.', 'kafka': 'Kafka retention may already have dropped those events — that is why we keep Bronze.'},
         q='Your Silver rule was wrong (`amount = amount * 100`). Tap the layer you rebuild Silver **from**.',
         explain='From **Bronze**: Bronze → corrected code → rebuild Silver. That is the reason to keep raw, “dirty” data: without it you may have to re-request it from the source — and the source may not have it any more.'),
    dict(type='img_hotspot', section='ch02-s11', media='dbx-medallion', answer=['clean'], maskLabels=True,
         why={'agg': 'This step builds Gold (aggregates) — the data is already clean by then.', 'bronze': 'Bronze keeps duplicates on purpose (source-faithful).'},
         q='All labels are hidden. Tap the step where **duplicates are removed and CDC is applied**.',
         explain='The step between **Bronze and Silver**: parse, validate, deduplicate, apply CDC, cast types. Bronze stays source-faithful; Gold only aggregates already-clean Silver data.'),
    dict(type='img_sequence', section='ch02-s11', media='dbx-medallion', targets=['pg', 'kafka', 'json', 'bronze', 'clean', 'silver', 'agg', 'gold', 'bi'], answer=['pg', 'bronze', 'clean', 'silver', 'agg', 'gold', 'bi'],
         q='Trace one order change from **PostgreSQL** to the **CEO dashboard**.',
         explain='PostgreSQL → **Bronze** (raw change) → clean/dedup/CDC → **Silver** `orders` → aggregate → **Gold** `daily_sales` → dashboard. Each hop has one responsibility, which is what makes failures easy to localise.'),
])
# ---------------------------------------------------------------- ch03
chapter('ch03', [('ch03-s08', 'dbx-cicd')], [
    dict(type='img_drag', section='ch03-s08', media='dbx-cicd', targets=['lint', 'unit', 'integ', 'config', 'build'], distractors=['deploy production'],
         q='The CI pipeline is covered. Drag its five steps into the right boxes (left → right).',
         explain='CI on every push / PR: **lint → unit tests → integration tests → configuration validation → build**. If anything fails: don’t merge, don’t deploy. Deploying to production is CD, never part of CI.'),
    dict(type='img_select', section='ch03-s08', media='dbx-cicd', targets=['main', 'tests', 'depstg', 'integ2', 'depprod'],
         q='Now the CD flow: pick each step.',
         explain='CD: **main branch → tests → deploy staging → integration tests → deploy production**. Continuous *Delivery* may keep a manual approval before prod; continuous *Deployment* goes automatically. Either way: validated code → automated, controlled deployment.'),
    dict(type='img_hotspot', section='ch03-s06', media='dbx-cicd', answer=['stg'], difficulty=1,
         why={'dev': 'DEV is for experimenting with sample data — it does not prove prod-like permissions or configuration.', 'prod': 'In PROD real consumers would be hit if the check fails.'},
         q='Where are permissions, dependencies and configuration checked **without** impacting real consumers?',
         explain='**TEST / STAGING**: close to production, but no real users. That is where “works in dev, fails in prod” problems (missing grants, different config) should surface.'),
    dict(type='img_hotspot', section='ch03-s08', media='dbx-cicd', answer=['depstg'], tags=['concept', 'exam'],
         why={'depprod': 'Production comes only after staging and the integration tests there pass.', 'build': 'Build produces the artifact; it deploys nothing.', 'main': 'Merging to main deploys nothing by itself.'},
         q='CI is green and the PR is merged. Tap the **first** step that touches a real, non-dev environment.',
         explain='**deploy staging**. Validated code goes to staging first, integration tests run there, and only then **deploy production**.'),
])
# ---------------------------------------------------------------- ch04
chapter('ch04', [('ch04-s03', 'dbx-planes')], [
    dict(type='img_hotspot', section='ch04-s03', media='dbx-planes', answer=['cl-area'], tags=['concept', 'exam'],
         why={'cp-area': 'The control plane schedules and coordinates — your Spark workload does not run there.', 'cp': 'The control plane schedules and coordinates — your Spark workload does not run there.', 'browser': 'Your browser only shows the notebook; it does not run the groupBy.', 'storage': 'Storage holds the data; it computes nothing.', 'sl-area': 'That is the serverless plane — this notebook is attached to CLASSIC compute.'},
         q='Your notebook runs on **classic** compute. Tap where the `groupBy` actually executes.',
         explain='In the **classic compute plane**: the driver and worker VMs in **your** cloud account. The control plane (Databricks-managed) only manages and coordinates.'),
    dict(type='img_hotspot', section='ch04-s04', media='dbx-planes', answer=['sl-area'],
         why={'cp-area': 'Serverless compute is Databricks-managed too — but it is a compute plane, not the control plane.', 'cl-area': 'Classic compute lives in your account; on serverless you do not configure VMs.'},
         q='The same notebook on **serverless** compute: tap where it runs now.',
         explain='In the **serverless compute plane**, managed by Databricks: it allocates, scales and manages the compute. The control/compute separation stays the same — only *who manages the machines* moved.'),
    dict(type='img_sequence', section='ch04-s03', media='dbx-planes', targets=['browser', 'cp', 'driver', 'w1', 'w2', 'storage'], answer=['browser', 'cp', 'driver', 'w2', 'storage'],
         q='Follow one notebook command on classic compute (any worker will do for the 4th step — use the one next to storage).',
         explain='Browser → **control plane** (schedules / coordinates) → **driver** (plans the job, splits it into tasks) → **workers** (run the tasks) → **data storage** (read / write).'),
    dict(type='img_drag', section='ch04-s03', media='dbx-planes', targets=['cp', 'sl', 'cl'], distractors=['Data plane', 'Metastore'], difficulty=1,
         q='Which plane is which? Drag the names.',
         explain='**Control plane** (web app, APIs, orchestration, metadata) and **serverless compute** are Databricks-managed; **classic compute** (driver + worker VMs) runs in your cloud account.'),
])
# ---------------------------------------------------------------- ch05
chapter('ch05', [('ch05-s01', 'dbx-delta-layout'), ('ch05-s07', 'dbx-vacuum')], [
    dict(type='img_select', section='ch05-s01', media='dbx-delta-layout',
         regions=regs('dbx-delta-layout', {'p0': 'Data file (Parquet)', 'dv': 'Deletion vector', 'log': 'Transaction log folder', 'j001': 'Commit file (JSON)', 'j100c': 'Checkpoint'}),
         distractors=['Statistics file', 'Partition folder'],
         q='Name the parts of a Delta table.',
         explain='**Data files** (Parquet) hold the rows; **deletion vectors** mark deleted rows without rewriting a file; `_delta_log/` holds the versioned state: one **JSON commit** per version and periodic **checkpoints** (Parquet summaries). File statistics live *inside* the add actions of the log, not in a separate file.'),
    dict(type='img_hotspot', section='ch05-s02', media='dbx-delta-layout', answer=['j100c', 'j101', 'j102', 'j103'], difficulty=3, tags=['concept', 'exam'],
         why={'j000': 'Replaying from v0 is exactly what the checkpoint avoids.', 'j001': 'Replaying from v1 is exactly what the checkpoint avoids.', 'p0': 'Data files are read for the query — the question is which LOG files rebuild the snapshot.', 'dv': 'Not a log file.'},
         q='A reader needs **snapshot v103**. Tap every log file it loads to compute it.',
         explain='**checkpoint v100 + replay 101, 102, 103** — not v0 → v103. The checkpoint summarises the state up to v100. (The exact checkpoint interval is an implementation detail: never rely on it.)'),
    dict(type='img_hotspot', section='ch05-s07', media='dbx-vacuum', answer=['fa', 'fb'], tags=['concept', 'pitfall'],
         why={'fc': 'C is in the current snapshot {C, D} — VACUUM never deletes it.', 'fd': 'D is in the current snapshot {C, D} — VACUUM never deletes it.'},
         q='After the retention period, which files can **VACUUM** physically delete?',
         explain='**A and B**: no longer referenced by the current snapshot, only by old versions. After VACUUM, time travel to those old versions stops working — that is why time travel is not a backup.'),
    dict(type='img_occlusion', section='ch05-s01', media='dbx-delta-layout', targets=['p0', 'log', 'j100c', 'dv'],
         q='Cover & recall: what is each covered part of a Delta table?',
         explain='Data files + deletion vectors + `_delta_log` commits + checkpoints = the Delta table state.'),
])
# ---------------------------------------------------------------- ch06
chapter('ch06', [('ch06-s11', 'dbx-skipping')], [
    dict(type='img_hotspot', section='ch06-s11', media='dbx-skipping', answer=['fc', 'fd'], tags=['concept', 'exam'],
         why={'fa': 'max = 1000 < 2500 → cannot contain it → skipped.', 'fb': 'max = 2000 < 2500 → cannot contain it → skipped.'},
         q='`WHERE customer_id = 2500` — tap **every** file Delta must actually read.',
         explain='**C** (2001–3000) may contain 2500 and **D** (1–3000) may too. A and B are skipped by their min/max statistics. File D shows the pitfall: a file with a wide range can never be skipped.'),
    dict(type='img_hotspot', section='ch06-s11', media='dbx-skipping', answer=['fb', 'fd'],
         why={'fa': 'max = 1000 < 1500 → skipped.', 'fc': 'min = 2001 > 1500 → skipped.'},
         q='`WHERE customer_id = 1500` — tap every file that must be read.',
         explain='**B** (1001–2000) and **D** (1–3000). Data skipping only reads files whose [min, max] range could contain the value.'),
    dict(type='img_hotspot', section='ch06-s11', media='dbx-skipping', answer=['fa', 'fb', 'fd'], difficulty=3, tags=['concept', 'pitfall'],
         why={'fc': 'min = 2001 > 1100 → skipped.'},
         q='`WHERE customer_id BETWEEN 900 AND 1100` — tap every file that must be read.',
         explain='The range overlaps **A** (…–1000), **B** (1001–…) and **D** (1–3000). Only C is skipped. Range filters across file boundaries read several files; liquid clustering keeps ranges narrow so fewer files overlap.'),
    dict(type='img_reveal', section='ch06-s11', media='dbx-skipping', grid=[4, 2], difficulty=1,
         options=['Data skipping with file statistics', 'Partition pruning by folder', 'Result caching', 'Broadcast join'], answer=0,
         q='Uncover as few tiles as you can: what mechanism does this picture show?',
         explain='**Data skipping**: per-file min/max statistics in the Delta log let the engine skip files that cannot contain matching rows. Partition pruning works on folders/partition values — a different mechanism.'),
])
# ---------------------------------------------------------------- ch07
chapter('ch07', [('ch07-s12', 'dbx-compute-decision')], [
    dict(type='img_hotspot', section='ch07-s12', media='dbx-compute-decision', answer=['ljob_c'], tags=['concept', 'exam'],
         why={'ljob_s': 'Serverless doesn’t support the custom JAR / low-level Spark this job needs.', 'lint_c': 'All-purpose is for interactive work; a scheduled job belongs on job compute.', 'lint_s': 'This is a scheduled job, not interactive work.'},
         q='Example C: nightly ETL that needs a **custom Spark JAR** and low-level Spark not supported on serverless. Tap the right compute.',
         explain='Automated + classic required → **Classic Jobs compute** — then you choose DBR, workers, autoscaling, access mode, Photon.'),
    dict(type='img_hotspot', section='ch07-s12', media='dbx-compute-decision', answer=['lsql_s'], tags=['concept', 'exam'],
         why={'lint_c': 'Not an all-purpose cluster: BI/SQL traffic belongs on a SQL warehouse.', 'lsql_p': 'Possible — but serverless is the recommended default for BI today.', 'lsql_c': 'Possible — but serverless is the recommended default for BI today.'},
         q='Example D: **100 analysts** query from **Power BI**. Tap the best default.',
         explain='SQL / BI → SQL warehouse → usually **Serverless SQL warehouse** (recommended today for BI, SQL ETL and exploratory analytics).'),
    dict(type='img_hotspot', section='ch07-s12', media='dbx-compute-decision', answer=['lint_c'], tags=['pitfall'],
         why={'lint_s': 'Serverless notebooks don’t support **R** (nor Scala/RDD APIs per the source).', 'ljob_c': 'You want a notebook to work in interactively, not a scheduled job.'},
         q='Example E: you need an **R notebook**.',
         explain='Interactive + a feature serverless doesn’t support → **classic all-purpose** compute (possibly Dedicated access mode).'),
    dict(type='img_drag', section='ch07-s12', media='dbx-compute-decision', targets=['wint', 'wjob', 'wpipe', 'wsql'], distractors=['STREAMING'], difficulty=1,
         q='The first question is “what is my workload?”. Drag the four workload types onto the branches.',
         explain='**Interactive**, **Job**, **Pipeline**, **SQL/BI** — then choose serverless or classic. Streaming is not a separate branch: it runs as a job or a pipeline.'),
])
# ---------------------------------------------------------------- ch08
chapter('ch08', [('ch08-s01', 'dbx-layers')], [
    dict(type='img_drag', section='ch08-s01', media='dbx-layers', targets=['n-workload', 'n-engine', 'n-runtime', 'n-nodes', 'n-infra'], distractors=['GOVERNANCE'],
         q='Name the five layers of the compute stack.',
         explain='Top to bottom: **your workload → execution engine (Spark JVM / Photon) → runtime (DBR) → compute nodes (driver + workers, VM shapes) → infrastructure (classic / serverless)**. Governance (Unity Catalog) is not a compute layer.'),
    dict(type='img_hotspot', section='ch08-s01', media='dbx-layers', answer=['row-nodes'], tags=['concept', 'exam'],
         why={'row-infra': 'Classic vs serverless is about who manages the machines, not their shape.', 'row-runtime': 'The runtime is the software environment, not the VM.'},
         q='You choose `r5d.4xlarge` for the workers. Tap the layer that choice lives on.',
         explain='**Compute nodes**: driver type and worker type are VM shapes. DBR, Photon, node types and serverless are not alternatives on one level — each has its own layer.'),
    dict(type='img_hotspot', section='ch08-s01', media='dbx-layers', answer=['row-runtime'],
         why={'row-engine': 'Photon/Spark is the engine; the DBR version is the environment it ships in.', 'row-nodes': 'The VM stays the same — the software on it changes.'},
         q='You upgrade **DBR 15.4 LTS → 16.4 LTS**. Tap the layer that changes.',
         explain='The **runtime**: the versioned environment (Spark + Python + JVM + libraries). The same code in a different runtime can behave differently — that is why versions and LTS matter.'),
    dict(type='img_label', section='ch08-s01', media='dbx-layers',
         regions=regs('dbx-layers', {'n-workload': 'Workload', 'n-engine': 'Execution engine', 'n-runtime': 'Runtime', 'n-nodes': 'Compute nodes', 'n-infra': 'Infrastructure'},
                      accept={'n-workload': ['your workload', 'code'], 'n-engine': ['engine', 'execution', 'spark', 'photon'], 'n-runtime': ['dbr', 'databricks runtime'], 'n-nodes': ['nodes', 'driver and workers', 'vms'], 'n-infra': ['infra', 'classic or serverless']}),
         difficulty=3, q='Hard mode: type the name of each layer.',
         explain='Workload → Execution engine → Runtime → Compute nodes → Infrastructure. Place every new term (Photon, LTS, pools, autoscaling…) on one of these layers.'),
])
# ---------------------------------------------------------------- ch09
chapter('ch09', [('ch09-s02', 'dbx-cluster')], [
    dict(type='img_drag', section='ch09-s02', media='dbx-cluster',
         regions=regs('dbx-cluster', {'driver': 'Driver', 'w1': 'Worker node (VM)', 'e1': 'Executor', 'core1': 'Core = task slot', 'disk1': 'Local disk'}),
         distractors=['Metastore'], q='Drag the names onto the cluster.',
         explain='The **driver** plans and schedules; each **worker** VM runs **one executor** (Databricks classic); each **core** is one task slot; the **local disk** holds shuffle files and spill.'),
    dict(type='img_hotspot', section='ch09-s02', media='dbx-cluster', answer=['driver'], maskLabels=True, difficulty=1,
         why={'e1': 'Executors run tasks; they don’t build the plan.', 'e2': 'Executors run tasks; they don’t build the plan.', 'e3': 'Executors run tasks; they don’t build the plan.', 'e4': 'Executors run tasks; they don’t build the plan.'},
         q='Labels hidden. Who builds the plan and schedules the tasks?',
         explain='The **driver**: SparkSession, logical → optimized → physical plan, stages and tasks, scheduling, tracking executors. It does not process the partitions itself.'),
    dict(type='img_hotspot', section='ch09-s06', media='dbx-cluster', answer=['disk1', 'disk2', 'disk3', 'disk4'], any=True, maskLabels=True, tags=['concept', 'debug'],
         why={'driver': 'Spill happens on the workers that run the tasks, not on the driver.'},
         q='A big sort **spills**. Labels hidden — tap where the spilled data goes.',
         explain='To the **local disk of the worker** running the task (as are shuffle files). Spill is not a failure, but heavy spill is slow; and local disk content vanishes with the VM.'),
    dict(type='img_reveal', section='ch09-s03', media='dbx-cluster', grid=[4, 3],
         options=['4', '8', '32', '100'], answer=2, tags=['calc', 'exam'],
         q='Uncover as few tiles as you can: how many tasks can this cluster run **at the same time**?',
         explain='4 workers × 8 cores = **32 task slots** (the driver is excluded). A stage of 100 tasks therefore needs ≈ ⌈100 ÷ 32⌉ = **4 waves**.'),
])
# ---------------------------------------------------------------- ch10
chapter('ch10', [('ch10-s02', 'dbx-phases')], [
    dict(type='img_sequence', section='ch10-s02', media='dbx-phases', answer=['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
         q='The boxes are shuffled. Tap the **first six** phases in dependency order.',
         explain='**Compute → Delta Lake → Unity Catalog → Ingestion → Structured Streaming → Declarative Pipelines.** Each layer needs the previous one — unlike the workspace menu order.'),
    dict(type='img_sequence', section='ch10-s02', media='dbx-phases', answer=['p6', 'p7', 'p8', 'p9', 'p10'],
         q='Now the end of the road: tap phases **6 → 10** in order.',
         explain='**Declarative Pipelines → Jobs → Databricks SQL → Performance & Debugging → Production CI/CD.**'),
    dict(type='img_hotspot', section='ch10-s02', media='dbx-phases', answer=['p1'], difficulty=1,
         why={'p2': 'Delta commands themselves run as Spark tasks on compute — so compute comes first.'},
         q='Every MERGE, OPTIMIZE or streaming write finally runs as tasks on … tap it.',
         explain='**Compute**: to reason about why a MERGE is slow or why a write creates small files you first need cores, task slots, partitions, shuffle and memory.'),
    dict(type='img_hotspot', section='ch10-s02', media='dbx-phases', answer=['p3'],
         q='Which phase treats storage, namespace, governance, identities and permissions as **one system**?',
         explain='**Unity Catalog** (phase 3).'),
])
# ---------------------------------------------------------------- ch11
chapter('ch11', [('ch11-s02', 'dbx-uc-hierarchy')], [
    dict(type='img_drag', section='ch11-s02', media='dbx-uc-hierarchy',
         regions=regs('dbx-uc-hierarchy', {'metastore': 'Metastore', 'cprod': 'Catalog', 'ssilver': 'Schema', 'otab': 'Table', 'ovol': 'Volume', 'ofn': 'Function'}),
         distractors=['Workspace'], q='What kind of thing is each covered box?',
         explain='**Metastore** (regional top container) → **catalog** → **schema** → objects (**table**, **volume**, **function**…). The workspace is not a level of this hierarchy.'),
    dict(type='img_hotspot', section='ch11-s02', media='dbx-uc-hierarchy', answer=['cdev', 'cprod', 'csand'], any=True, tags=['concept', 'exam'],
         why={'metastore': 'The metastore is the regional top container — you don’t create one per project.', 'sbronze': 'Schemas are a finer organisational / access-control layer.', 'ssilver': 'Schemas are a finer organisational / access-control layer.', 'sgold': 'Schemas are a finer organisational / access-control layer.'},
         q='Tap the **primary unit of data isolation**.',
         explain='The **catalog**. Isolation usually starts at catalog level (dev / prod / sandbox); the schema is a finer layer; the metastore is regional.'),
    dict(type='img_hotspot', section='ch11-s02', media='dbx-uc-hierarchy', answer=['wsa', 'wsb', 'wsc'], any=True, tags=['pitfall'],
         q='Which of these is **not** part of the namespace `catalog.schema.object`?',
         explain='The **workspace**. A notebook *lives in* a workspace; `prod.silver.orders` is *registered in* the metastore. “Workspace above catalog” is wrong.'),
    dict(type='img_sequence', section='ch11-s02', media='dbx-uc-hierarchy', answer=['metastore', 'cprod', 'ssilver', 'otab'],
         q='Resolve `prod.silver.orders`: tap from the top container down to the object.',
         explain='Metastore → catalog **prod** → schema **silver** → table **orders**. To read it you need USE CATALOG + USE SCHEMA + SELECT along this same path.'),
])
# ---------------------------------------------------------------- ch12
chapter('ch12', [('ch12-s09', 'dbx-autoloader')], [
    dict(type='img_hotspot', section='ch12-s09', media='dbx-autoloader', answer=['ckpt'], tags=['concept', 'exam'],
         why={'schemaloc': 'schemaLocation keeps the schema history — not progress. Exam questions swap them on purpose.', 'bronze': 'The table has the rows, but not the stream’s progress.'},
         q='The cluster died after files A and B. Where does the restarted stream learn that A and B are done?',
         explain='The **checkpointLocation** stores progress (files processed, offsets, batch ids). On restart it reads the checkpoint and processes only C.'),
    dict(type='img_hotspot', section='ch12-s09', media='dbx-autoloader', answer=['schemaloc'],
         why={'ckpt': 'The checkpoint stores progress, not the inferred schema.'},
         q='Where are the inferred schema and its evolution (`_schemas/`) kept?',
         explain='Under **cloudFiles.schemaLocation** (set on the read). Pointing both options at one directory is allowed — the two *roles* stay different.'),
    dict(type='img_select', section='ch12-s08', media='dbx-autoloader', targets=['landing', 'reader', 'writer', 'schemaloc', 'ckpt', 'bronze'],
         distractors=['spark.read', 'COPY INTO'],
         q='Pick the name of every piece of the Auto Loader skeleton.',
         explain='Landing zone → **Auto Loader** (`readStream.format("cloudFiles")`) → **writeStream** (Delta) → **Bronze table**; state: **schemaLocation** (shape) and **checkpointLocation** (progress).'),
    dict(type='img_occlusion', section='ch12-s09', media='dbx-autoloader', targets=['reader', 'writer', 'schemaloc', 'ckpt'],
         q='Cover & recall the moving parts.',
         explain='Read side: Auto Loader + schemaLocation. Write side: writeStream + checkpointLocation. Commit to Delta first, then advance the checkpoint.'),
])
# ---------------------------------------------------------------- ch13
chapter('ch13', [('ch13-s07', 'dbx-watermark'), ('ch13-s09', 'dbx-stream-checkpoint')], [
    dict(type='img_hotspot', section='ch13-s07', media='dbx-watermark', answer=['wm'], tags=['calc', 'exam'],
         why={'wm20': 'That would be a 20-minute delay.'},
         q='Max event time seen = 10:20, watermark delay **5 min**. Tap the point on the axis where the watermark is.',
         explain='Watermark ≈ max event time seen − delay = 10:20 − 5 min = **10:15**. It follows event-time progress, not the wall clock.'),
    dict(type='img_hotspot', section='ch13-s07', media='dbx-watermark', answer=['e03', 'e12'], difficulty=3, tags=['concept', 'exam'],
         why={'e17': '10:17 is newer than the 10:15 watermark → still accepted.', 'e19': '10:19 is newer than the 10:15 watermark → still accepted.'},
         q='Delay **5 min**. Tap every arriving event that **may be dropped** as too late.',
         explain='Watermark = 10:15. **10:03 and 10:12** are older → may be dropped (“may”, not “will”). 10:17 and 10:19 are accepted and update their windows.'),
    dict(type='img_hotspot', section='ch13-s07', media='dbx-watermark', answer=['wm20'], tags=['calc'],
         why={'wm': 'That is the 5-minute watermark.'},
         q='Same stream, but the delay is **20 minutes**. Tap the watermark now.',
         explain='10:20 − 20 min = **10:00**: all four events are accepted — at the price of more state, bigger checkpoints and higher latency.'),
    dict(type='img_drag', section='ch13-s09', media='dbx-stream-checkpoint', targets=['offsets', 'commits', 'state', 'metadata'], distractors=['_schemas/', 'last_timestamp'],
         q='Fill in the checkpoint folder.',
         explain='**offsets/** (what each micro-batch reads), **commits/** (which batches were written), **state/** (stateful operators) and **metadata** (query identity). A checkpoint is not just a “last timestamp”.'),
    dict(type='img_hotspot', section='ch13-s09', media='dbx-stream-checkpoint', answer=['commits'], tags=['concept', 'exam'],
         why={'offsets': 'offsets/ = what each batch READS — not whether it was written.', 'state': 'state/ holds operator state (counts, windows…).'},
         q='Spark must know whether micro-batch 42 was **written to the sink**. Which entry tells it?',
         explain='**commits/** — the record of micro-batches successfully committed to the sink, a key part of exactly-once.'),
])

out = {'_doc': 'GENERATED by authoring/visual_v1.py — visual layer v1 (docs/VISUAL.md). Additive: figures + exercises chNN-e6NN.', 'patches': PATCH}
p = os.path.join(HERE, '..', 'patches', 'visual_v1.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(items)} pictures, {sum(len(x["appendExercises"]) for x in PATCH)} exercises, {sum(len(x.get("appendBlocks", [])) for x in PATCH)} figures → {os.path.relpath(p)}')
