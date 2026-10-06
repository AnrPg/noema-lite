"""Visual layer v2 for Databricks — web augmentation (docs/VISUAL.md §5–6).

The source PDFs contain no pictures (only 20 px icons — checked with tools/extract_images.py), so real
pictures come from the web: screenshots and diagrams of the Apache Spark documentation (Apache-2.0,
https://github.com/apache/spark/tree/master/docs/img). They show the real Spark UI the exam asks about.
Also tops up every v1 picture to >= 3 exercises.
    python3 library/subjects/databricks/authoring/visual_v2.py
Writes media/*.png, updates media/media.json, writes patches/visual_v2.json (ids chNN-e64N…e69N)."""
import os, sys, json, io, datetime, urllib.request
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, '..', 'media')
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', '..', 'tools'))
from svgkit import write_registry
SRC = json.load(open(os.path.join(HERE, '..', 'sources.json'), encoding='utf-8'))['chapters']
UA = 'noema-lite/1.0 (+https://noema-lite.netlify.app; educational)'
SPARK = 'https://raw.githubusercontent.com/apache/spark/master/docs/img/'
CREDIT = 'Apache Spark documentation, The Apache Software Foundation'
TODAY = datetime.date.today().isoformat()

def fetch(name):
    cache = os.path.join('/tmp', 'noema-web-' + name)
    if not os.path.exists(cache):
        req = urllib.request.Request(SPARK + name, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(cache, 'wb') as f: f.write(r.read())
    return Image.open(cache).convert('RGB')

def R(rid, x, y, w, h, label=None, s=1.0, ox=0, oy=0, pad=0, **kw):
    """Region from ORIGINAL screenshot pixels → saved-image units (crop offset ox/oy, scale s, padding)."""
    r = {'id': rid, 'shape': 'rect', 'x': round((x - ox - pad) * s, 1), 'y': round((y - oy - pad) * s, 1), 'w': round((w + 2 * pad) * s, 1), 'h': round((h + 2 * pad) * s, 1), 'rx': 4}
    if label: r['label'] = label
    r.update({k: v for k, v in kw.items() if v is not None})
    return r

ITEMS = []
def save(mid, im, alt, caption, regions, name, src):
    p = os.path.join(MEDIA, mid + '.png'); im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)   # screenshots: 256 colours are lossless enough, ~3× smaller
    ITEMS.append({'id': mid, 'file': mid + '.png', 'origin': 'web', 'alt': alt, 'caption': caption, 'credit': CREDIT, 'license': 'Apache-2.0',
                  'url': 'https://github.com/apache/spark/blob/master/docs/img/' + name, 'retrieved': TODAY, 'src': src, 'regions': regions})

# ---------- 1. cluster overview (596×286 flat diagram → ×2 Lanczos so it fills the card) ----------
s = 2
im = fetch('cluster-overview.png'); im = im.resize((im.width * s, im.height * s), Image.LANCZOS)
save('spark-cluster-overview', im,
     'Apache Spark cluster overview: a driver program containing the SparkContext talks to a cluster manager and to two worker nodes; each worker node runs an executor with a cache and tasks.',
     'Spark’s own picture of a cluster: the driver’s SparkContext, the cluster manager and executors on worker nodes.', [
    R('driver', 14, 91, 142, 89, 'Driver program', s, note='Your main program; it holds the SparkContext and schedules the tasks.'),
    R('lbl-driver', 18, 93, 104, 18, 'Driver program', s, note='Your main program (the driver).', q='Which process holds the SparkContext and schedules tasks?'),
    R('sc', 24, 127, 122, 43, 'SparkContext', s, note='Coordinates the application: connects to the cluster manager, acquires executors, sends them code and tasks.', q='Which object coordinates the whole application?'),
    R('cm', 219, 119, 143, 59, 'Cluster manager', s, note='Allocates resources across applications (standalone, YARN, Kubernetes — in Databricks: managed by the platform).', q='Who allocates the resources (the executors) to the application?'),
    R('worker1', 423, 13, 156, 118, 'Worker node', s, note='A machine (in Databricks classic: a worker VM).'),
    R('lbl-worker1', 427, 14, 84, 19, 'Worker node', s, note='A machine (in Databricks classic: a worker VM).'),
    R('exec1', 433, 46, 137, 77, 'Executor', s, note='A process on a worker that runs tasks and stores data (cache) for the application.'),
    R('lbl-exec1', 436, 48, 66, 18, 'Executor', s, note='A process on a worker that runs tasks and stores data.', q='Which process on a worker runs the tasks?'),
    R('cache1', 510, 47, 59, 29, 'Cache', s, note='Data the application persisted in executor memory (df.cache()).', q='Where does df.cache() keep data?'),
    R('task1', 442, 85, 55, 29, 'Task', s, note='The smallest unit of work: one task per partition of a stage.'),
    R('task1b', 507, 85, 55, 29, 'Task', s),
    R('worker2', 423, 154, 156, 119, 'Worker node', s),
    R('exec2', 433, 187, 137, 77, 'Executor', s),
    R('cache2', 510, 188, 59, 30, 'Cache', s),
    R('task2a', 442, 226, 55, 30, 'Task', s), R('task2b', 507, 226, 55, 30, 'Task', s),
], 'cluster-overview.png', 'part1')

# ---------- 2. SQL tab: physical plan DAG (crop of the plan, ×2) ----------
s, ox, oy = 2, 470, 355
im = fetch('webui-sql-dag.png').crop((ox, oy, 810, 905)); im = im.resize((im.width * s, im.height * s), Image.LANCZOS)
nodes = [('scan', 537, 380, 83, 11, 'Scan ExistingRDD'), ('range', 697, 380, 32, 11, 'Range'), ('filter', 565, 451, 27, 11, 'Filter'),
         ('bexch', 667, 451, 92, 11, 'BroadcastExchange'), ('bhj', 545, 508, 88, 12, 'BroadcastHashJoin'), ('project', 571, 565, 36, 12, 'Project'),
         ('agg1', 552, 606, 74, 12, 'HashAggregate (partial)'), ('exchange', 566, 678, 46, 11, 'Exchange'), ('aqe', 551, 719, 76, 12, 'AQEShuffleRead'),
         ('agg2', 552, 774, 74, 12, 'HashAggregate (final)'), ('take', 534, 845, 110, 12, 'TakeOrderedAndProject'), ('asp', 544, 887, 90, 11, 'AdaptiveSparkPlan')]
notes = {'exchange': 'Exchange = the shuffle boundary: rows are redistributed by key across the network.', 'bexch': 'The small side (Range, 100,000 rows) is broadcast to every executor.',
         'bhj': 'Broadcast hash join: the big side is joined locally against the broadcast copy — no shuffle of the big side.', 'aqe': 'Adaptive Query Execution reads the shuffle output and can coalesce/split partitions at runtime.',
         'agg1': 'Partial aggregate: per partition, BEFORE the shuffle.', 'agg2': 'Final aggregate: combines the partial results AFTER the shuffle.', 'scan': 'Reads the input partitions.', 'filter': 'Applied inside each partition — no shuffle needed.'}
save('spark-sql-plan', im,
     'Spark UI, SQL tab, plan visualization: Scan ExistingRDD → Filter → BroadcastHashJoin (with Range → BroadcastExchange as the other side) → Project → HashAggregate → Exchange → AQEShuffleRead → HashAggregate → TakeOrderedAndProject → AdaptiveSparkPlan.',
     'A real physical plan in the Spark UI (SQL / DataFrame tab).',
     [R(i, x, y, w, h, lab, s, ox, oy, pad=5, note=notes.get(i)) for i, x, y, w, h, lab in nodes], 'webui-sql-dag.png', 'part1')

# ---------- 3. Stage page (full screenshot) ----------
im = fetch('StagePage.png')
cols = [('c-locality', 306, 'Locality level'), ('c-executor', 433, 'Executor ID'), ('c-host', 525, 'Host'), ('c-duration', 786, 'Duration'), ('c-gc', 877, 'GC Time'),
        ('c-fetchwait', 938, 'Shuffle Read Fetch Wait Time'), ('c-remote', 1021, 'Shuffle Remote Reads'), ('c-swrite', 1107, 'Shuffle Write Time')]
edges = [21, 87, 144, 231, 306, 433, 525, 645, 704, 786, 877, 938, 1021, 1107, 1188, 1258]
regs = [R('summary', 21, 373, 1237, 92, 'Summary Metrics', note='Min / 25th / median / 75th / max per metric: the quickest skew check (median vs max).'),
        R('tasks', 21, 614, 1237, 480, 'Tasks table', note='One row per task — fine for 5 tasks, unreadable for 2,000.'),
        R('dag-link', 10, 263, 145, 20, 'DAG Visualization'), R('agg-exec', 12, 481, 340, 24, 'Aggregated Metrics by Executor'),
        R('header', 8, 82, 440, 30, 'Stage title')]
for rid, x0, lab in cols:
    x1 = edges[edges.index(x0) + 1]
    regs.append(R(rid, x0, 614, x1 - x0, 480, lab, note={'c-executor': 'Where each task ran. Here: “driver” — no separate executors.', 'c-locality': 'How close the task ran to its data (PROCESS_LOCAL = in the same process).',
                                                           'c-remote': 'Bytes this task fetched from OTHER executors during the shuffle.', 'c-duration': 'How long each task took — compare across tasks for skew.'}.get(rid)))
save('spark-stage-page', im,
     'Spark UI stage detail page for Stage 0: header with duration, links for DAG visualization and additional metrics, a Summary Metrics table (min, 25th percentile, median, 75th percentile, max of duration and GC time), and a Tasks table with columns such as locality level, executor ID, host, duration, GC time and shuffle metrics. All five tasks ran on executor "driver".',
     'The stage page: summary distributions first, task rows second.', regs, 'StagePage.png', 'part1')

# ---------- 4. Structured Streaming statistics (top four rows) ----------
im = fetch('webui-structured-streaming-detail.png').crop((0, 0, 1693, 1325))
save('spark-streaming-stats', im,
     'Spark UI Structured Streaming query statistics: timelines and histograms of Input Rate (records/sec, about 2), Process Rate (records/sec, about 2), Input Rows per batch and Batch Duration (about 3,000 ms), for a query that has completed 505 batches.',
     'The streaming tab: is the query keeping up?', [
    R('r-input', 18, 323, 1573, 250, 'Input Rate', note='How fast data ARRIVES (records/sec).'),
    R('r-process', 18, 573, 1573, 250, 'Process Rate', note='How fast the query PROCESSES it (records/sec).'),
    R('r-rows', 18, 823, 1573, 250, 'Input Rows', note='Rows per micro-batch.'),
    R('r-duration', 18, 1073, 1573, 250, 'Batch Duration', note='How long each micro-batch takes — rising durations with stable input point at state growth.'),
    R('summary-line', 18, 78, 920, 26, 'Running time & completed batches'),
], 'webui-structured-streaming-detail.png', 'part2')

write_registry(MEDIA, ITEMS)
media = {it['id']: it for it in json.load(open(os.path.join(MEDIA, 'media.json'), encoding='utf-8'))['items']}
def regs_of(mid, relabel):
    import copy
    out = []
    for r in media[mid]['regions']:
        if r['id'] in relabel: r = copy.deepcopy(r); r['label'] = relabel[r['id']]; out.append(r)
    return out

PATCH = []; NEXT = {}
def ex(cid, **e):
    NEXT[cid] = NEXT.get(cid, 640) + 1
    e = dict({'id': f'{cid}-e{NEXT[cid]}', 'difficulty': 2, 'tags': ['concept'], 'quick': False, 'src': SRC[cid]}, **e)
    PATCH.append({'chapter': cid, 'appendExercises': [e]})
def fig(cid, sec, mid): PATCH.append({'chapter': cid, 'section': sec, 'appendBlocks': [{'t': 'figure', 'media': mid, 'src': SRC[cid]}], 'appendExercises': []})

# ---- ch09: Spark's cluster overview
fig('ch09', 'ch09-s02', 'spark-cluster-overview')
ex('ch09', type='img_drag', section='ch09-s02', media='spark-cluster-overview', quick=True,
   regions=regs_of('spark-cluster-overview', {'lbl-driver': 'Driver program', 'sc': 'SparkContext', 'cm': 'Cluster manager', 'lbl-exec1': 'Executor', 'cache1': 'Cache', 'task1': 'Task'}),
   distractors=['Metastore', 'Control plane'], q='This is **Apache Spark’s own** cluster picture. Drag the names back onto it.',
   explain='The **driver program** holds the **SparkContext**, which connects to a **cluster manager** that allocates resources; Spark acquires **executors** on the worker nodes (processes that run **tasks** and keep data in a **cache**). In Databricks classic: one executor per worker, and the platform plays the cluster-manager role.')
ex('ch09', type='img_hotspot', section='ch09-s02', media='spark-cluster-overview', answer=['task1', 'task1b', 'task2a', 'task2b'], any=True, tags=['concept', 'exam'],
   why={'sc': 'The SparkContext lives in the driver: it schedules tasks, it does not run them.', 'cm': 'The cluster manager allocates resources; it runs no tasks.', 'cache1': 'The cache stores data; tasks are the units of computation.', 'cache2': 'The cache stores data; tasks are the units of computation.'},
   q='Where is your `groupBy` actually computed? Tap one place.',
   explain='In **tasks** inside the **executors** on the worker nodes — one task per partition. The driver plans and schedules; the cluster manager only allocates resources.')
ex('ch09', type='img_sequence', section='ch09-s02', media='spark-cluster-overview', targets=['sc', 'cm', 'exec1', 'task1', 'cache1'], answer=['sc', 'cm', 'exec1', 'task1'],
   q='An application starts. Tap the steps in the order the Spark docs describe them.',
   explain='The **SparkContext** connects to the **cluster manager** → Spark acquires **executors** on the nodes → sends them your code → finally sends **tasks** to the executors to run. (Apache Spark docs, “Cluster Mode Overview”.)')
ex('ch09', type='img_occlusion', section='ch09-s02', media='spark-cluster-overview', targets=['lbl-driver', 'sc', 'cm', 'lbl-exec1', 'cache1'],
   q='Cover & recall the parts of a Spark cluster.', explain='Driver program (SparkContext) · cluster manager · executors on worker nodes · tasks · cache.')

# ---- ch04: a real physical plan
fig('ch04', 'ch04-s09', 'spark-sql-plan')
ex('ch04', type='img_hotspot', section='ch04-s09', media='spark-sql-plan', answer=['exchange'], quick=True, tags=['concept', 'exam'],
   why={'bexch': 'BroadcastExchange copies the SMALL side to every executor — the big side is not shuffled there.', 'aqe': 'AQEShuffleRead READS the shuffle output; the shuffle itself is the Exchange above it.', 'bhj': 'The broadcast hash join avoids a shuffle of the big side.', 'filter': 'A filter works inside each partition — no shuffle.'},
   q='A real plan from the Spark UI. Tap the operator where the **shuffle** happens.',
   explain='**Exchange** = the redistribution / shuffle boundary (here for the aggregation). Partial aggregate before it, final aggregate after it.')
ex('ch04', type='img_hotspot', section='ch04-s09', media='spark-sql-plan', answer=['bhj'], tags=['concept', 'exam'],
   why={'bexch': 'That broadcasts the small side — the join itself is the next operator.', 'exchange': 'That shuffle is for the aggregation, not for the join.'},
   q='Which **join strategy** did Spark choose? Tap the join.',
   explain='**BroadcastHashJoin**: the small side (Range, 100,000 rows) was broadcast (**BroadcastExchange**), so the big side joined locally without a shuffle.')
ex('ch04', type='img_drag', section='ch04-s09', media='spark-sql-plan',
   regions=regs_of('spark-sql-plan', {'agg1': 'Partial aggregate (per partition)', 'exchange': 'Shuffle boundary', 'agg2': 'Final aggregate', 'bexch': 'Broadcast of the small side'}),
   distractors=['Spill to disk'], q='Explain the plan: drag what each covered operator **does**.',
   explain='**HashAggregate (partial)** per partition → **Exchange** (shuffle by key) → **HashAggregate (final)** combining the partial sums. The **BroadcastExchange** ships the small side to every executor for the broadcast hash join.')
ex('ch04', type='img_sequence', section='ch04-s09', media='spark-sql-plan', answer=['scan', 'filter', 'bhj', 'agg1', 'exchange', 'agg2', 'take'],
   q='Follow the big side of the data from the scan to the result (skip Project and AQEShuffleRead).',
   explain='Scan → Filter → BroadcastHashJoin → partial HashAggregate → **Exchange** → final HashAggregate → TakeOrderedAndProject.')

# ---- ch09: the stage page
fig('ch09', 'ch09-s14', 'spark-stage-page')
ex('ch09', type='img_hotspot', section='ch09-s14', media='spark-stage-page', answer=['summary'], tags=['concept', 'debug'],
   why={'tasks': 'With 2,000 tasks you would scroll forever — the summary already shows the distribution.', 'dag-link': 'The DAG shows the operators, not the task-time distribution.'},
   q='Your join stage is slow. Tap the part of this page where you check for **skew** first.',
   explain='**Summary Metrics**: compare **median vs max** (duration, shuffle read, spill). Median 20 s and max 15 min with a huge shuffle read on the max task = a strong skew signal.')
ex('ch09', type='img_hotspot', section='ch09-s14', media='spark-stage-page', answer=['c-executor'], tags=['concept', 'debug'],
   why={'c-host': 'The host is the machine’s address; the executor column says which executor ran the task.', 'c-locality': 'Locality says how close the data was, not which executor ran it.'},
   q='Tap the column that tells you **where each task ran**.',
   explain='**Executor ID** — here every task says **driver**: there were no separate executors (local / single-node mode: the driver also acts as the worker).')
ex('ch09', type='img_reveal', section='ch09-s14', media='spark-stage-page', grid=[3, 3], tags=['concept', 'exam'],
   options=['Single node: the driver also acts as the worker', 'A cluster with five workers', 'A serverless SQL warehouse', 'A multi-node compute with 0 workers running Spark normally'], answer=0,
   q='Open as few tiles as you can: every task ran on executor **“driver”**. What kind of compute is this?',
   explain='**Single node**: no separate worker nodes, the driver also acts as the worker. Trap: a *multi-node* compute with **0 workers** cannot run distributed Spark commands at all.')
ex('ch09', type='img_hotspot', section='ch09-s14', media='spark-stage-page', answer=['c-remote'],
   why={'c-swrite': 'Shuffle WRITE time is about producing shuffle files, not fetching them.', 'c-fetchwait': 'Fetch wait is time spent waiting — not the bytes fetched.'},
   q='Tap the column with the bytes each task fetched from **other** executors during the shuffle.',
   explain='**Shuffle Remote Reads**. A single task with a giant shuffle read is the classic skew picture.')

# ---- ch13: streaming statistics
fig('ch13', 'ch13-s15', 'spark-streaming-stats')
ex('ch13', type='img_hotspot', section='ch13-s15', media='spark-streaming-stats', answer=['r-input', 'r-process'], tags=['concept', 'debug'],
   why={'r-duration': 'Batch duration helps too, but “keeping up” is arrival vs processing speed.', 'r-rows': 'Rows per batch alone says nothing about keeping up.'},
   q='Is this query **keeping up** with its source? Tap the **two** charts you compare.',
   explain='**Input Rate vs Process Rate**. Input 100k rows/s but processed 40k rows/s sustained → backlog grows. Here both ≈ 2 rows/s → it keeps up.')
ex('ch13', type='img_hotspot', section='ch13-s15', media='spark-streaming-stats', answer=['r-duration'], tags=['debug'],
   why={'r-process': 'Process rate can stay flat while each batch gets slower and slower.'},
   q='Input is stable, but each micro-batch takes longer every hour (10 s → 40 s → 2 min). Which chart shows it?',
   explain='**Batch Duration**. Rising durations with stable input → inspect the stateful operators: is state (numRowsTotal) growing forever? Missing/too-long watermark, unbounded keys, bad stateful join.')
ex('ch13', type='img_reveal', section='ch13-s15', media='spark-streaming-stats', grid=[3, 3],
   options=['Keeping up: processing ≈ arrival, no growing backlog', 'Falling behind: the backlog is growing', 'State is growing without bound', 'The stream has stopped'], answer=0,
   q='Uncover as little as you can: what is the verdict for this query?',
   explain='Input ≈ 2 records/s and process ≈ 2 records/s, batch duration flat around 3 s → **keeping up**. Falling behind would show process rate below input rate for a sustained time.')

# ---- top-ups for v1 pictures (>= 3 exercises per picture)
ex('ch05', type='img_hotspot', section='ch05-s07', media='dbx-vacuum', answer=['fb'], tags=['pitfall', 'exam'],
   why={'fa': 'A is only in v0 — v1 = {B, C} does not need it.', 'fc': 'C is in the current snapshot: VACUUM keeps it.', 'fd': 'D is not part of v1.'},
   q='VACUUM ran (retention passed). Now `SELECT … VERSION AS OF 1` fails. Which missing file breaks it?',
   explain='v1 = {B, C}. C is still current, but **B** was only referenced by old versions → VACUUM deleted it. Time travel is not a backup.')
ex('ch05', type='img_select', section='ch05-s07', media='dbx-vacuum',
   regions=regs_of('dbx-vacuum', {'fa': 'Deleted by VACUUM', 'fb': 'Deleted by VACUUM', 'fc': 'Kept (current snapshot)', 'fd': 'Kept (current snapshot)'}),
   q='After VACUUM (retention passed): what happens to each file?',
   explain='A and B are referenced only by old versions → **deleted**. C and D are in the current snapshot {C, D} → **kept**.')
ex('ch13', type='img_hotspot', section='ch13-s09', media='dbx-stream-checkpoint', answer=['state'], tags=['pitfall'],
   why={'offsets': 'Offsets are about the source progress; the incompatibility is in the stored state schema.', 'metadata': 'The query id stays; it is the state that no longer fits.'},
   q='You change `groupBy("customer_id").count()` to `groupBy("country").sum("amount")` and restart from the same checkpoint. Which part no longer fits?',
   explain='**state/** — its schema (key = customer_id, value = count) is part of the checkpoint. Changing state keys or aggregations is incompatible → new checkpoint + recomputation. State schema is effectively production data.')

out = {'_doc': 'GENERATED by authoring/visual_v2.py — web pictures (Apache Spark docs, Apache-2.0) + top-ups. Additive; ids chNN-e641+.', 'patches': PATCH}
json.dump(out, open(os.path.join(HERE, '..', 'patches', 'visual_v2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(ITEMS)} web pictures, {sum(len(p["appendExercises"]) for p in PATCH)} exercises, {sum(len(p.get("appendBlocks", [])) for p in PATCH)} figures')
