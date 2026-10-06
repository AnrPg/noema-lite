# -*- coding: utf-8 -*-
# Sections for ch09 — Compute Mastery: From VM to Task (source pp. 306–358)

def S(n): return f"ch09-s{n:02d}"

def P(t): return {"t": "p", "text": t}
def L(items, ordered=False): return {"t": "list", "items": items, "ordered": ordered}
def C(code, lang="python", caption=None):
    b = {"t": "code", "lang": lang, "code": code}
    if caption: b["caption"] = caption
    return b
def D(text, caption=None):
    b = {"t": "diagram", "text": text}
    if caption: b["caption"] = caption
    return b
def T(head, rows, caption=None):
    b = {"t": "table", "head": head, "rows": rows}
    if caption: b["caption"] = caption
    return b
def CO(kind, title, text): return {"t": "callout", "kind": kind, "title": title, "text": text}
def CMP(*items): return {"t": "compare", "items": [{"title": a, "points": b} for a, b in items]}
def F(items, caption=None):
    b = {"t": "flow", "items": items}
    if caption: b["caption"] = caption
    return b
def R(label, text): return {"t": "reveal", "label": label, "text": text}
def A(title, qs): return {"t": "ask", "title": title, "questions": qs}
def TERMS(pairs): return {"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]}

SECTIONS = []

# ---------------------------------------------------------------- s01
SECTIONS.append({"id": S(1), "title": "What You Buy: The Compute Stack",
 "hook": "Look at any compute config and instantly know how many machines, cores and parallel tasks you really have.",
 "blocks": [
  P("**Phase 1 goal**: look at a compute configuration and say *how many machines* you have, *what runs on each*, roughly *how many Spark tasks run at once*, *where OOM can happen*, *how shuffle is affected*, *what autoscaling changes*, and *why serverless or classic*."),
  F(["VM", "Driver / Worker", "Executor", "Core", "Task", "Partition", "Stage", "Job"],
    caption="Phase 1 builds from the lowest level up (part 1: the execution hierarchy)"),
  F(["Autoscaling / node sizing", "Access mode", "Pools / Spot / termination", "Serverless abstraction", "Debugging + Spark UI"],
    caption="Part 2: the configuration and operations layers on top"),
  CO("key", "Today's default", "Databricks currently recommends **serverless** as the default for most new workloads, and **classic** only when you need capabilities or configuration that serverless does not support."),
  P("Say you create **classic compute** with: Driver = 8 cores / 32 GB, Workers = 4 × (8 cores / 32 GB)."),
  D("                DRIVER VM\n               8 CPU / 32 GB\n                    |\n     +----------+---+------+----------+\n     v          v          v          v\n WORKER 1   WORKER 2   WORKER 3   WORKER 4\n  8 cores    8 cores    8 cores    8 cores\n  32 GB      32 GB      32 GB      32 GB",
    caption="1 driver machine + 4 worker machines = 5 cloud VMs"),
  R("Think first: how many cloud VMs is that, and how many executor cores?",
    "**5 VMs** (1 driver + 4 workers). Executor cores = 4 × 8 = **32**, not 40. Worker RAM ≈ 4 × 32 = **128 GB**. The driver is a separate coordinator, not distributed capacity."),
  T(["Resource", "Count", "Why"],
    [["Cloud VMs", "1 + 4 = 5", "Every node, driver included, is a VM you pay for"],
     ["Executor (worker) cores", "4 × 8 = 32", "Only worker cores run distributed tasks"],
     ["Worker RAM", "4 × 32 GB = 128 GB", "Driver RAM is separate"],
     ["Driver", "8 cores / 32 GB", "Coordinator: plans and schedules, not a task slot pool"]],
    caption="What you actually bought"),
  CO("pitfall", "Don't add the driver to worker capacity", "Saying \"**40 worker cores**\" (32 + 8 driver cores) is the classic counting mistake. The driver's cores are **not** executor cores."),
  CO("analogy", "Head chef vs line cooks", "The **driver** is the head chef who reads orders and assigns dishes. The workers are the cooking stations. Hiring a bigger head chef adds no extra stove."),
  TERMS([["VM", "A cloud virtual machine; every driver and worker node is one."],
         ["Driver", "The coordinator node: holds SparkSession/SparkContext, plans queries, schedules tasks."],
         ["Worker", "A node that does distributed processing; in Databricks classic it runs one executor."],
         ["Executor", "The Spark process on a worker that runs tasks."],
         ["Core", "A CPU core of an executor; ≈ one task slot."],
         ["Task", "The smallest basic execution unit of a stage; processes one partition."],
         ["Partition", "A chunk of data; one partition → one task within a stage."],
         ["Stage", "A set of tasks that run without a shuffle in between."],
         ["Job", "All stages triggered by one action (count, display, write…)."]]),
 ]})

# ---------------------------------------------------------------- s02
SECTIONS.append({"id": S(2), "title": "Driver vs Executors (Level-up)",
 "hook": "The driver plans, the executors do. Mixing them up leads to wrong sizing and wrong OOM fixes.",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 already taught *driver = coordinator, worker = processing*. Here you add the **full list of driver jobs**, the **plan pipeline**, and the **one-executor-per-worker** rule."),
  L(["SparkSession", "SparkContext", "query planning", "DAG construction", "stage scheduling", "task scheduling",
     "tracking executors", "collecting task metadata / results", "notebook interpreter / session"]),
  P("Databricks describes the **driver** as the node that keeps the state of attached notebooks, maintains the SparkContext, interprets commands and coordinates the executors."),
  C('result = (\n    spark.table("sales.orders")\n         .groupBy("country")\n         .sum("amount")\n)\ndisplay(result)', caption="An e-shop revenue-per-country query"),
  R("Think first: does the driver fetch all rows and start adding amounts?",
    "No. The driver first builds a **plan**: Logical Plan (Aggregate ← Scan sales.orders) → Optimized Plan → Physical Plan. Then it splits the physical plan into stages/tasks that the **workers** run on the actual partitions."),
  F(["Logical plan", "Optimized plan", "Physical plan", "Stages & tasks", "Executors run tasks"], caption="Driver organizes, workers execute"),
  D("Scan sales.orders          (on workers, per partition)\n     |\nPartial Aggregate          (sum per country, per partition)\n     |\nExchange                   (shuffle by country)\n     |\nFinal Aggregate            (combine partial sums)",
    caption="The physical plan of the groupBy"),
  CMP(("DRIVER", ["coordination / control", "plans, schedules, tracks", "receives results/metadata"]),
      ("WORKERS", ["distributed processing", "run tasks on actual partitions", "hold shuffle/spill/cache locally"])),
  P("Not 100% true for every implementation detail, but **driver ≠ worker** is the right mental model and it is fundamental."),
  CO("key", "One executor per worker", "In vanilla Spark, worker machines and executors can relate in complex ways. In **Databricks classic**, Databricks runs **one Spark executor per worker node** — that's why the docs use *worker* and *executor* almost interchangeably. 8 workers → normally 8 executors."),
  D("Worker 1 ── Executor 1\nWorker 2 ── Executor 2\nWorker 3 ── Executor 3"),
  CO("exam", "Certification trap: executors", "\"Databricks classic compute has 6 workers. How many Spark executors?\" → **6**. One executor per worker. Don't add one for the driver and don't multiply by cores."),
 ]})

# ---------------------------------------------------------------- s03
SECTIONS.append({"id": S(3), "title": "Cores, Tasks, Partitions & Waves",
 "hook": "The most useful sizing formula in Spark: tasks ÷ task slots = waves.",
 "blocks": [
  P("Spark uses **cores** as the basis for task parallelism: roughly **one active task per available executor core**. Databricks states a 1:1 mapping between task slots and available cores."),
  P("So an 8-core worker can usually run about **8 tasks concurrently**."),
  P("A **task** is the smallest basic execution unit of a Spark stage. Within a stage, **1 partition → 1 task**."),
  C('# DataFrame with 100 partitions\ndf.filter("amount > 10").count()\n# → this stage has ~100 tasks', caption="100 partitions → 100 tasks"),
  D("4 workers × 8 cores = 32 task slots\n\nWave 1 → 32 tasks\nWave 2 → 32 tasks\nWave 3 → 32 tasks\nWave 4 →  4 tasks   (28 slots idle)\n         ───\n         100 tasks = 4 waves",
    caption="Tasks beyond the slot count run in waves (conceptually)"),
  CO("key", "The formulas", "**Task slots** = workers × cores per worker (driver excluded).\n**Waves** ≈ ceil(tasks ÷ slots), assuming similar task durations."),
  T(["Partitions in stage", "On 32 slots", "Verdict"],
    [["4", "4 tasks run, 28 cores idle", "Huge cluster, not enough parallel work"],
     ["32", "Fills all 32 slots", "Very good fit"],
     ["1,000", "32 at a time until done", "Fine — more partitions than cores is not a problem by itself"],
     ["1,000,000 tiny", "Endless tiny tasks", "Scheduling / task-startup overhead becomes significant"]],
    caption="The partition count decides how many parallel pieces of work exist"),
  CO("pitfall", "Big cluster, tiny parallelism", "A 32-core cluster reading a dataset with **4 partitions** keeps 28 cores idle. Parallelism is capped by partitions, not by the size of the bill."),
  P("End-to-end: `spark.read.table(\"orders\").groupBy(\"country\").sum(\"amount\")` with 64 input partitions. **Stage 1** = 64 tasks (task 1 → partition 1 … task 64 → partition 64). The groupBy causes a **shuffle**; if Spark uses 200 shuffle partitions, **Stage 2** = 200 tasks."),
  D("Stage 1: 64 input partitions  → 64 tasks\n            |  shuffle (groupBy)\n            v\nStage 2: 200 shuffle partitions → 200 tasks",
    caption="Partition count is stage-specific"),
  CO("key", "No single partition count per job", "**Partition count is stage-specific.** A job does not have one partition number — each stage has its own."),
  P("On 4 workers × 8 cores (32 slots): Stage 1 = 64 tasks → **2 waves**. Stage 2 = 200 tasks → 200/32 = 6.25 → **7 waves**."),
  CO("warn", "Waves are conceptual", "Tasks don't all take the same time. In practice **skew** can make one task run far longer than the others, so real execution isn't neat waves."),
  R("Exercise 2: 6 workers × 16 cores, stage with 768 partitions. How many task slots and waves?",
    "Slots = 6 × 16 = **96**. Waves ≈ 768 / 96 = **8**, if all tasks have similar duration."),
 ]})

# ---------------------------------------------------------------- s04
SECTIONS.append({"id": S(4), "title": "Scale Up vs Scale Out & Memory per Core",
 "hook": "Same total cores and RAM can still behave very differently — the shape of the cluster matters.",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 defined *scale up* (bigger machines) and *scale out* (more machines). Here you learn **why the shape changes behaviour** and the **memory-per-core** heuristic."),
  CMP(("Cluster A — scale up", ["2 workers × 16 cores × 128 GB", "Totals: 32 cores, 256 GB", "few large workers"]),
      ("Cluster B — scale out", ["8 workers × 4 cores × 32 GB", "Totals: 32 cores, 256 GB", "many small workers"])),
  P("The **totals are identical**. Databricks uses exactly this kind of example in its sizing best practices — and the point is that equal cores ≠ equal performance."),
  L(["network traffic", "shuffle fan-out", "executor heap size", "per-task memory", "scheduling", "fault impact", "local disk"]),
  R("Think first: A and B both have 8 GB per core. So what actually differs?",
    "The **executor heap** (one 128 GB executor vs one 32 GB executor), **shuffle fan-out** (8 workers exchange blocks with more peers over the network), **fault impact** (losing 1 of 2 workers loses 50% of capacity; 1 of 8 loses 12.5%) and **local disk** per node."),
  P("**Per-task memory example**: each task needs ~10 GB of working memory. A worker with 4 cores / 16 GB runs 4 concurrent tasks."),
  D("Worker: 4 cores / 16 GB\n\n task1 10GB  task2 10GB  task3 10GB  task4 10GB\n └──────────────── 40 GB working set ────────┘\n                     vs 16 GB RAM\n                  → spill or OOM",
    caption="4 × 10 GB = 40 GB potential working set in a 16 GB worker"),
  P("A worker with 4 cores / **64 GB** has a much larger memory-per-core ratio and handles the same tasks comfortably."),
  CO("key", "Memory per core > raw GB", "**Memory per core** matters more than total GB. Worker A: 4 cores / 16 GB = **4 GB/core**. Worker B: 4 cores / 32 GB = **8 GB/core**."),
  CO("tip", "When you suspect a memory problem", "Databricks suggests trying a **higher memory-per-core ratio** to see whether behaviour changes, and recommends **memory-optimized workers** for heavy shuffle, spill and memory-intensive workloads."),
 ]})

# ---------------------------------------------------------------- s05
SECTIONS.append({"id": S(5), "title": "Where Worker RAM Goes: Execution, Storage & Spill",
 "hook": "A 32 GB worker never gives 32 GB to your rows — and running out of RAM usually means spill, not failure.",
 "blocks": [
  P("Don't imagine **32 GB worker = 32 GB available for Spark rows**. Several consumers share worker RAM."),
  D("Worker RAM\n├── JVM heap\n│   ├── Spark execution memory\n│   ├── cached data\n│   ├── JVM objects\n│   └── metadata\n├── off-heap / native memory\n├── Python worker processes\n├── Photon / native processing\n└── OS / Databricks services",
    caption="Who eats worker memory"),
  CO("warn", "Not a simple formula", "The exact allocation is **not** simply RAM ÷ cores. But for sizing, **memory per core** is still a useful heuristic."),
  CMP(("Execution memory", ["sort", "shuffle", "hash aggregation", "join hash tables"]),
      ("Storage memory", ["df.cache()", "persisted blocks"])),
  P("Spark has **unified memory management**: execution and storage can, to some degree, share the available managed memory."),
  CO("interview", "What interviewers want", "You don't need every memory fraction by heart. You need this: **join / sort / groupBy can eat execution memory even if you never called `cache()`**."),
  P("**Spill**: a task must sort 20 GB but can't keep all intermediate data in RAM. Spark writes intermediate data to the **local worker disk** and keeps going."),
  F(["RAM insufficient", "Write intermediate data to local worker disk", "Continue processing"], caption="What spill is"),
  P("The Spark UI shows spill as **Memory Bytes Spilled** and **Disk Bytes Spilled**."),
  CO("key", "Spill ≠ failure", "**Spill does not mean the job is broken.** Spark is designed so operations can spill. But *huge, repeated* spill can make a workload very slow."),
  L(["insufficient memory", "too-large partitions", "skew", "bad join", "too few shuffle partitions"]),
  CO("tip", "Fix direction", "Databricks lists memory-intensive **shuffle/spill** workloads as a use case for **memory-optimized workers** — after you've ruled out skew and bad partitioning."),
  A("Ask yourself when the Spark UI shows spill", [
    "Is this a little spill or huge, repeated spill that slows the stage?",
    "Is the spill concentrated in one task (skew) or spread across all tasks?",
    "Are my partitions too large because there are too few shuffle partitions?",
    "Is a join or aggregation building a big hash table in execution memory?",
    "Would a higher memory-per-core worker change the behaviour?"]),
 ]})

# ---------------------------------------------------------------- s06
SECTIONS.append({"id": S(6), "title": "Shuffle & the Temporary Local Disk",
 "hook": "Shuffle writes to local disks and crosses the network — and none of that survives the cluster.",
 "blocks": [
  C('df.groupBy("country").sum("amount")'),
  P("**Map-side tasks** produce shuffle output and write it as **shuffle files on each worker's local disk**. Downstream tasks then **pull** those blocks over the network."),
  D("Worker 1 local disk: shuffle files ─┐\nWorker 2 local disk: shuffle files ─┼─ network ─> downstream tasks\nWorker 3 local disk: shuffle files ─┘\n\nWorker A ── shuffle blocks ── network ──> Worker B",
    caption="Shuffle = local disk + network"),
  P("So heavy **shuffle** puts pressure on four resources at once:"),
  L(["CPU", "memory", "network", "local disk"]),
  P("Executors' **local disks** are used, among other things, for shuffle files, spill and caching."),
  R("Think first: what happens to those local files when the cluster stops?",
    "The **worker VM is destroyed**. Local shuffle files, cached partitions, temp files and spill files can all be lost."),
  CMP(("Local worker disk", ["temporary compute storage", "shuffle, spill, cache, temp files", "gone when the VM is destroyed"]),
      ("Delta table storage", ["persistent cloud storage", "your tables and their transaction log", "survives any cluster"])),
  CO("pitfall", "Local disk is not storage", "**Local worker disk = temporary compute storage.** Never rely on cached/local data surviving; persist results as Delta tables in cloud storage."),
 ]})

# ---------------------------------------------------------------- s07
SECTIONS.append({"id": S(7), "title": "Driver OOM vs Executor OOM",
 "hook": "Two different crashes, two different fixes — and \"double the cluster\" is usually the wrong first move.",
 "blocks": [
  CMP(("Driver OOM", ["df.collect() / df.toPandas() on large data", "huge result", "huge query plan", "too many task metadata", "large local Python structures"]),
      ("Executor OOM", ["skewed partition", "large hash join", "huge window partition", "too few shuffle partitions", "large UDF memory", "stateful streaming state"])),
  P("**Example**: Workers = 20 × 64 GB, Driver = 8 GB. You run `rows = df.collect()` on a 100 GB result. The workers are fine — the **driver** collapses."),
  C("rows = df.collect()   # pulls every row into driver memory\npdf = df.toPandas()   # same: materializes the data on the driver", caption="The two classic driver killers"),
  CO("key", "Databricks' list", "Databricks names **skew, large broadcasts, UDFs, unpartitioned windows and too few shuffle partitions** as common causes of memory failures."),
  P("**Bad reasoning**: OOM → double the cluster. **Better**: walk a diagnosis chain first."),
  F(["Which executor/task?", "One partition dominates?", "Skew?", "Spill?", "Join?", "Window?", "Too few partitions?", "Memory per core?"],
    caption="Memory debugging chain — before adding RAM"),
  CO("debug", "Mnemonic", "**W**ise **D**octors **S**can **S**ymptoms, **J**udge **W**ounds, **P**rescribe **M**edicine → **W**hich task · **D**ominant partition · **S**kew · **S**pill · **J**oin · **W**indow · **P**artitions too few · **M**emory/core."),
  CO("pitfall", "100 workers can't split one partition", "If the problem is **one 100 GB partition**, having 100 workers barely helps: a single task must still process those 100 GB."),
  A("Ask yourself when something dies with OOM", [
    "Did the driver die or an executor? (Where is the error coming from?)",
    "If the driver: did I call collect(), toPandas() or build a huge result/plan?",
    "If an executor: which task failed, and does one partition dominate in size?",
    "Is there skew, a big hash join or broadcast, or an unpartitioned window?",
    "Are there too few shuffle partitions, making each partition huge?",
    "Only then: would a higher memory-per-core worker help?"]),
 ]})

# ---------------------------------------------------------------- s08
SECTIONS.append({"id": S(8), "title": "Autoscaling From First Principles (Level-up)",
 "hook": "Autoscaling adds task slots — it never adds partitions and never fixes skew.",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 covered *classic min/max workers* vs *serverless managed scaling*. Here you do the **slot math**, see **what autoscaling cannot fix**, and meet two exam traps."),
  P("Worker = 8 cores / 32 GB, **Min workers = 2**, **Max workers = 8**. Minimum capacity = 2 × 8 = **16 task slots**; maximum = 8 × 8 = **64 task slots**."),
  F(["16 slots", "24 slots", "40 slots", "64 slots"], caption="Parallel task capacity can move between limits depending on the workload"),
  CO("key", "What does NOT change", "Worker size stays **8 cores / 32 GB each**. Autoscaling never turns \"2 huge VMs\" into \"8 tiny VMs\". It is **horizontal autoscaling**: it changes the *number* of workers."),
  R("Think first: a stage has 1 partition. You scale from 2 to 100 workers. How many tasks?",
    "**1.** So about 1 core is busy and hundreds are idle. **Autoscaling doesn't magically create partitions.**"),
  P("**Skew failure**: a stage with 100 partitions — 99 of 100 MB, one of **200 GB**. Scaling 4 → 40 workers makes the 99 small ones finish fast, but the job ends only when **the straggler** finishes."),
  CO("pitfall", "Skew ≠ missing capacity", "When one giant task dominates, the problem is **skew**, not insufficient parallel capacity. More workers just means more idle cores waiting."),
  R("Exercise 3: 4 workers × 8 cores, stage of 30 partitions. Autoscale to 8 workers — big speed-up?",
    "No. 32 slots already run all **30 tasks** at once. At 8 workers you have 64 slots but still only 30 tasks → essentially **no gain in task parallelism**."),
  CMP(("Classic autoscaling", ["worker type = X", "min = 2, max = 8 (you set them)", "changes worker count only"]),
      ("Serverless autoscaling", ["you just run the workload", "Databricks manages instances, capacity, scaling, runtime", "serverless Jobs: automatic scaling + platform-managed Photon"])),
  CO("exam", "Serverless does autoscale", "**Serverless autoscales**, but it's usually *not* the manual `min_workers` / `max_workers` axis. You can't set min_workers=2, max_workers=10 for ordinary serverless notebook compute the classic way."),
  CO("exam", "Certification trap: autoscaling", "Classic autoscaling primarily changes the **number of workers**, **not the worker instance size**."),
  CO("exam", "Certification trap: Spark dynamic allocation", "Vanilla Spark has `spark.dynamicAllocation.enabled`. Databricks explicitly lists the **dynamic-allocation properties as unsupported** on classic compute and tells you to use **Databricks autoscaling** instead."),
  A("Ask yourself before turning up max workers", [
    "How many tasks does the slow stage actually have compared with my task slots?",
    "Are tasks fewer than slots already (more workers = more idle cores)?",
    "Is one straggler task dominating the stage (skew)?",
    "Am I trying to fix this with spark.dynamicAllocation instead of Databricks autoscaling?"]),
 ]})

# ---------------------------------------------------------------- s09
SECTIONS.append({"id": S(9), "title": "Single Node, Zero Workers & Access Modes (Level-up)",
 "hook": "Single node ≠ zero workers, and Dedicated ≠ faster. Two favourite exam traps.",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 introduced single/multi-node and Standard/Dedicated. New here: the **zero-workers trap**, **Auto** access mode, the **2026 UI change**, and the rule *capability, not performance*."),
  D("┌────────────────────┐\n│ DRIVER             │\n│ + Spark local work │\n└────────────────────┘\n   (no worker nodes)", caption="Single-node compute"),
  P("Classic doesn't have to mean a distributed cluster. In **Single node** mode there are no separate worker nodes — Databricks says the **driver also acts as the worker**."),
  CMP(("Single node is good for", ["small development", "small datasets", "some local ML", "non-distributed workloads"]),
      ("Single node is NOT for", ["multi-TB Spark ETL"])),
  CO("exam", "Certification trap: zero workers", "A **multi-node** compute with **0 workers**: can it run Spark distributed commands? **No.** Docs: without worker nodes, *non-Spark* commands run on the driver but **Spark commands fail**. If you want single-machine Spark, pick **Single Node** — a separate mode."),
  CO("warn", "2026 nuance: the UI changed", "The current UI has **no separate obvious \"multi-node\" selector**: compute is multi-node by default and you choose **Single node** when desired. **Driver type** moved under **Advanced Performance** and defaults to **Auto**. Older tutorials and screenshots look different."),
  CMP(("Standard", ["many users share one compute with workload isolation", "Databricks' recommended mode for most workloads", "Python, SQL, Scala", "R not supported"]),
      ("Dedicated", ["assigned to a specific user or (in supported setups) a group", "for RDD APIs, R, GPU, ML Runtime", "privileged / lower-level machine access"]),
      ("Auto", ["not a third access model", "Databricks picks Standard or Dedicated by runtime/hardware", "prefers Standard; switches to Dedicated for ML Runtime, GPU or a fairly old DBR"])),
  P("**Practical rule for data engineering**: **Standard** by default. Dedicated only when you can say \"I need a specific capability that Standard doesn't support\"."),
  CO("pitfall", "Dedicated is not a performance tier", "Don't pick **Dedicated** because it \"sounds faster\" or because \"production is important\". It's a **security/capability mode**, not a speed setting."),
  CO("exam", "Certification trap: Standard vs Dedicated", "Choose Dedicated only when the workload **requires** capabilities Standard can't support. **Standard** is the recommended classic access mode for most workloads."),
 ]})

# ---------------------------------------------------------------- s10
SECTIONS.append({"id": S(10), "title": "Pools & Spot Instances (Level-up)",
 "hook": "Pools answer \"where do the VMs come from?\" — spot answers \"how cheap can they be?\"",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 explained what a pool is and pool lifecycle. Here: the **full mental model** (pool vs cluster, pool vs autoscaling, serverless vs pools) plus **spot instances**."),
  F(["Start cluster", "Ask cloud provider for VMs", "Wait for VM provisioning", "Prepare runtime", "Spark starts"], caption="Without a pool: every start pays the provisioning wait"),
  D("POOL (pre-warmed VM capacity)\n├── idle VM\n├── idle VM\n├── idle VM\n└── used VM\n\ncluster → pool → warm instance available → attach quickly"),
  P("Pool parameters (as described for the AWS implementation) include:"),
  L(["minimum idle instances", "maximum capacity", "idle instance auto termination"]),
  CMP(("Pool", ["a reservoir of infrastructure instances", "can serve more than one compute"]),
      ("Compute (cluster)", ["a Spark execution environment", "draws its nodes from the pool"])),
  D("            POOL\n     ┌───────┼───────┐\n     v       v       v\n Cluster A Cluster B Cluster C"),
  P("Cluster wants to grow **2 → 6 workers**. The **autoscaler** decides \"I need +4\". The **pool** answers \"here are 4 warm VMs\"."),
  CO("key", "Two different questions", "**Autoscaler: HOW MANY?** **Pool: WHERE DO THE VMs COME FROM?** A pool never decides how many workers Spark needs."),
  P("**Serverless vs pools**: serverless makes the pool problem a **platform concern**. That's why Databricks now recommends serverless instead of pools where the workload is compatible. Serverless doesn't support user-configured instance pools."),
  CMP(("On-demand VM", ["provider promises normal availability", "more expensive"]),
      ("Spot VM", ["cheap spare capacity", "can be reclaimed by the cloud provider"])),
  P("If a spot worker disappears, Spark can often **retry** its tasks: task lost → scheduled elsewhere. So spot is attractive for **fault-tolerant batch**, not for every workload."),
  CO("warn", "Spot and latency-sensitive streaming", "Current Databricks **real-time streaming mode requires spot off**, because interruptions are bad for latency-sensitive persistent processing."),
  CO("key", "Driver on spot?", "You usually want the **driver** stable. Lose a worker → some tasks retry. Lose the driver → the **Spark application itself** is disrupted. Architectures separate driver reliability from worker cost optimization."),
 ]})

# ---------------------------------------------------------------- s11
SECTIONS.append({"id": S(11), "title": "Termination, Lifecycle & Permissions (Level-up)",
 "hook": "Terminated is not deleted, and \"can attach\" is not \"can read the data\".",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 covered termination and auto-termination basics and SQL-warehouse ACLs. New here: exactly **what survives**, **jobs lifecycle**, **compute permission levels** and **serverless permission objects**."),
  F(["running", "no commands", "idle", "X minutes", "terminate"], caption="Auto-termination of an all-purpose cluster"),
  P("Why? Interactive clusters **cost money even when the developer went for coffee**."),
  CMP(("Gone after termination", ["VMs", "cache", "shuffle files", "process / executor memory", "local temp files", "Python variables", "runtime processes"]),
      ("Remains after termination", ["DBR version", "worker type & driver type", "autoscaling settings", "name", "permissions"])),
  P("**Termination ≠ delete.** Press **Start** and a **fresh** compute is created from the saved configuration — but all ephemeral state is gone."),
  T(["Ephemeral (lost)", "Persistent (kept)"],
    [["executor memory", "Delta tables"], ["cache", "workspace notebooks"], ["shuffle", "Unity Catalog metadata"],
     ["local temporary files", "compute configuration"], ["runtime processes", "job definitions"]],
    caption="Big-test answer: what disappears vs what remains"),
  F(["Job starts", "Compute starts", "Tasks run", "Job finishes", "Compute goes away"], caption="Jobs compute lifecycle"),
  P("Jobs compute is governed by the **workload lifecycle**, not mainly by an idle timeout. Databricks generally discourages all-purpose compute for automated production jobs."),
  T(["Compute permission", "What it allows"],
    [["CAN ATTACH TO", "Attach a notebook and use the compute"],
     ["CAN RESTART", "Also start / restart / terminate it"],
     ["CAN MANAGE", "Also change compute configuration and permissions"]]),
  CO("pitfall", "Compute ACL ≠ Unity Catalog ACL", "You can have **CAN ATTACH TO** on the cluster and still have **SELECT prod.payroll = NO** → the query fails. Compute permissions never grant data access."),
  P("**Serverless permissions**: serverless doesn't mean everyone has access. The workspace has serverless permission objects — **Default Interactive Compute** (notebooks / Databricks Connect) and **Default Automated Compute** (Jobs / Pipelines) — with **CAN USE** and management permissions."),
  A("Ask yourself when a query fails on a cluster I can attach to", [
    "Is this a compute problem (can't attach/start) or a data problem (permission denied on a table)?",
    "Which identity is actually running the query?",
    "Does that identity have the Unity Catalog privileges (e.g. SELECT) on the table?",
    "Am I confusing CAN ATTACH TO / CAN MANAGE with data access?"]),
 ]})

# ---------------------------------------------------------------- s12
SECTIONS.append({"id": S(12), "title": "Photon in the Execution Stack (Level-up)",
 "hook": "Photon speeds up SQL/DataFrame operators on CPUs — not Python loops, not GPUs.",
 "blocks": [
  CO("tip", "Level-up from ch08", "Ch08 explained what Photon is and where it's configured. Here: where it sits in the **execution stack**, and why **UDFs** reduce its benefit."),
  D("Spark DataFrame / SQL\n        |\n     Catalyst\n        |\n  Physical Plan\n        |\n┌──────────────────┐\n│ Photon native    │\n│   or Spark JVM   │\n└──────────────────┘\n        |\n   workers / CPU", caption="Photon is an execution engine under the physical plan"),
  P("**Photon** is a native, vectorized engine. It's enabled in **serverless** and **SQL warehouses**; on classic all-purpose / jobs / pipelines it's configurable, and in the current UI it's **default-on**."),
  L(["scans", "filters", "joins", "aggregations", "Delta / Parquet writes", "SQL / DataFrames"]),
  C("for x in range(10_000_000):\n    do_python_work(x)", caption="Photon does NOT turn this into fast native execution"),
  CO("pitfall", "Photon is not a Python accelerator — nor a GPU", "Photon is **CPU-native vectorized query execution**. It won't speed up arbitrary Python loops, and it has nothing to do with GPUs."),
  CMP(("Built-in functions", ["F.sum(), F.when(), F.col(), F.regexp_extract()", "visible to the optimizer", "native engine has a much bigger chance to accelerate"]),
      ("Opaque Python UDF", ["my_python_udf(...)", "a black box to the optimizer", "less optimizer-friendly"])),
  CO("tip", "Best practice", "Prefer **built-in Spark SQL / DataFrame functions** wherever possible."),
  CO("exam", "Larger driver or Photon?", "For a **CPU-bound SQL aggregation**, **Photon / query optimization** is far more relevant than a bigger driver — the aggregation runs on the workers."),
 ]})

# ---------------------------------------------------------------- s13
SECTIONS.append({"id": S(13), "title": "Serverless Trade-offs & the Compute Selection Algorithm",
 "hook": "Serverless removes the knobs — that's both the limitation and the benefit.",
 "blocks": [
  CMP(("Classic UI knobs", ["DBR", "driver node type", "worker node type", "worker count", "min/max workers", "Photon", "pool", "spot", "access mode", "Spark configs", "init scripts …"]),
      ("Serverless", ["much less infrastructure configuration", "Databricks manages instances, scaling, runtime"])),
  P("Databricks does **not** give you control in serverless over:"),
  L(["compute policies", "instance pools", "most Spark cluster configurations", "compute-scoped init scripts", "compute-scoped libraries"]),
  CO("key", "Limitation AND benefit", "Losing these knobs is not only a limitation — it's the **abstraction benefit**: no node sizing, no pool tuning, no idle clusters."),
  P("**What you sacrifice: control.** Current serverless limitations include:"),
  L(["no R", "no RDD APIs", "Spark Connect APIs only", "no cluster instance pools", "limited Spark configs"]),
  D("START\n  |\nCan serverless support the workload?\n  ├── YES → prefer serverless\n  └── NO  → classic required\n              |\n        Need shared general DE/SQL?\n              ├── yes → Standard\n              └── need R/RDD/GPU/ML Runtime?\n                        → Dedicated", caption="Compute selection algorithm"),
  P("This matches current Databricks recommendations."),
  R("Think first: a team needs R for analysis. Which compute?",
    "Serverless has **no R** → classic required. Standard doesn't support R → **classic Dedicated**."),
  CO("exam", "Order of the questions matters", "Ask **\"can serverless do it?\"** first. Only if not, go classic, then pick **Standard** unless you need a Dedicated-only capability."),
 ]})

# ---------------------------------------------------------------- s14
SECTIONS.append({"id": S(14), "title": "Diagnosing Workloads: Spark UI & Bottleneck Types",
 "hook": "Before buying more hardware, read the task-metric distributions and name the bottleneck.",
 "blocks": [
  P("**Real sizing case**: daily batch ETL, 2 TB input, operations filter → join → groupBy. Driver 8 cores/32 GB; workers 4 × (8 cores/32 GB) → 32 worker cores, 128 GB; **autoscale 4–12**."),
  P("The initial scan creates **2,000 partitions**. At 4 workers: **32** concurrent tasks. At 12 workers: **96** concurrent tasks. So the scan phase can gain a lot of parallelism."),
  P("But after the shuffle the **join stage** has 499 partitions of 2 GB and **one of 300 GB**. Scaling 4 → 12 makes the small ones finish faster, but the 300 GB task stays the bottleneck."),
  D("Spark UI, join stage:\n  many tasks .......... done\n  one task: huge duration\n            huge shuffle read\n            huge spill\n\nDiagnosis: SKEW  — not \"need 50 workers\""),
  F(["Stages", "Open the slow stage", "Task metrics", "Compare distributions (median vs max)"], caption="Spark UI path for a slow stage"),
  L(["Duration", "Input Size", "Shuffle Read", "Shuffle Write", "Records", "Memory Spill", "Disk Spill", "GC Time"]),
  CO("key", "The skew signal", "**Median task = 20 sec, max task = 15 min**, with a huge shuffle read on the max task → **strong skew signal**."),
  T(["Bottleneck", "Signals", "Potential fixes"],
    [["CPU-bound", "CPU high, little spill, memory OK, tasks balanced", "more cores, compute-optimized workers, Photon, better algorithm/query — not just more RAM"],
     ["Memory-bound", "high spill, executor OOM, GC high, CPU not fully useful", "higher memory/core, more partitions, remove skew, smaller broadcast, different join, memory-optimized worker"],
     ["I/O-bound", "CPU low, tasks spend time reading", "fix storage/file layout, too many small files, network, poor pruning, reading too much data"]],
    caption="Name the bottleneck first"),
  CO("pitfall", "Scaling the wrong resource", "For an **I/O-bound** job, scaling CPU may not help. For a **CPU-bound** job, more RAM won't help."),
  T(["Workload symptom", "First direction of thought"],
    [["CPU consistently saturated", "more/faster cores, Photon, query optimization"],
     ["Executor OOM", "memory/core, skew, partitions, join/window"],
     ["Huge disk spill", "memory pressure, partition size, skew"],
     ["Driver OOM", "collect/toPandas, driver size, plan/result size"],
     ["Long cluster startup", "serverless or pool"],
     ["Idle interactive cost", "auto-termination"],
     ["Variable workload", "autoscaling"],
     ["Need R/RDD/GPU", "Dedicated classic"],
     ["Typical DE workloads", "Standard or serverless"],
     ["Tiny number of partitions", "adding workers won't help"],
     ["Few extreme stragglers", "skew investigation"]],
    caption="Classic config best-practice matrix"),
  A("Ask yourself when a stage is slow", [
    "Which stage is slow, and how many tasks does it have vs my slots?",
    "Is max task duration far above the median (skew)?",
    "Does the slowest task also have the biggest shuffle read / spill?",
    "Is CPU high (CPU-bound), spill/GC high (memory-bound) or CPU low while reading (I/O-bound)?",
    "Am I about to scale the resource that isn't the bottleneck?"]),
 ]})

# ---------------------------------------------------------------- s15
SECTIONS.append({"id": S(15), "title": "Hands-on: Config, Partitions, Plans & Experiments",
 "hook": "Five lines of code connect compute sizing to what Spark actually executes.",
 "blocks": [
  C('spark.version                                   # Spark version\nspark.conf.get("spark.sql.shuffle.partitions")  # inspect a Spark config', caption="Inspect runtime and Spark config"),
  P("Databricks documents **`spark.conf.get(...)`** as the way to inspect Spark configuration."),
  C("df.rdd.getNumPartitions()", caption="See the partition count"),
  CO("warn", "RDD access needed", "`df.rdd.getNumPartitions()` needs **RDD access** → fine on compatible classic compute, but **not on serverless** (Spark Connect), where RDD APIs aren't supported. There, reason from the **query plan** and **Spark UI / query profile** instead."),
  CMP(("repartition(n)", ["df2 = df.repartition(200)", "redistributes data into n partitions", "usually involves a shuffle", "can increase or decrease"]),
      ("coalesce(n)", ["df2 = df.coalesce(20)", "reduces partitions without full redistribution", "useful when there are too many partitions", "dangerous if collapsed too aggressively (lost parallelism)"])),
  C('df.explain("formatted")', caption="Look for: Exchange, HashAggregate, BroadcastHashJoin, SortMergeJoin"),
  P("A line like `Exchange hashpartitioning(customer_id, 200)` tells you a **shuffle** is happening: data is redistributed by `customer_id` into 200 partitions. This bridges compute sizing with execution."),
  C('from pyspark.sql import functions as F\n\ndf = spark.range(0, 10_000_000)\ndf = df.withColumn("group_id", F.col("id") % 100)\n\nresult = df.groupBy("group_id").count()\nresult.explain("formatted")   # look for Exchange\ndisplay(result)               # then open the Spark UI', caption="Experiment 1: see a shuffle"),
  F(["Job", "Stage", "Tasks", "Shuffle"], caption="What to inspect in the Spark UI after display(result)"),
  C("tiny_parallelism = df.coalesce(1)\ntiny_parallelism.count()\n\ndf.count()   # compare", caption="Experiment 2: create bad parallelism"),
  A("Ask yourself during experiment 2", ["Why are most cores idle? (Answer: only one partition → one task.)"]),
  C('many = df.repartition(500)\n(many.groupBy("group_id").count()\n     .write.mode("overwrite").format("noop").save())', caption="Experiment 3: force more partitions, then inspect the number of tasks"),
  P("The **`noop`** format runs the whole computation but writes nothing — handy for timing and inspecting tasks without creating files."),
  CO("key", "The point of experiment 3", "Not \"500 is good\". The point is to *see* the chain: **partitioning → number of tasks → usable core parallelism**."),
 ]})

# ---------------------------------------------------------------- s16
SECTIONS.append({"id": S(16), "title": "Phase-1 Boss Test & Can-You-Explain",
 "hook": "25 exam-style questions plus the eight sentences you must be able to say without notes.",
 "blocks": [
  P("The **Big Phase-1 test** is in the exercises below. Try every question before reading the explanation."),
  CO("key", "Say it without notes", "If you can explain each statement below out loud, Phase 1 is done."),
  L(["A classic Databricks cluster has one Spark driver and one executor per worker.",
     "Each worker contributes CPU cores, and Spark generally maps one task slot to each available executor core.",
     "Partitions determine how many independent tasks a stage can expose — so adding workers only helps if the stage has enough useful parallelism.",
     "Worker memory is used for execution, caching, native/Python processing and platform overhead; when execution data doesn't fit, Spark may spill to local worker disk.",
     "Driver memory is separate: collect() and toPandas() can OOM the driver even when executors have huge aggregate RAM.",
     "Classic autoscaling changes worker count between configured limits; serverless also scales, but Databricks controls the infrastructure.",
     "Standard and Dedicated are access/capability modes, not performance tiers.",
     "Pools accelerate provisioning of classic compute; they do not decide the worker count — autoscaling does."], ordered=True),
  R("Think first: which single number limits a stage's parallelism even on a 1,000-core cluster?",
    "The stage's **partition count**. One partition → one task; tasks can't exceed partitions."),
  CO("tip", "Next practical step", "Open a realistic **Create Compute** form field by field and design three clusters: an **interactive development** cluster, a **production batch ETL** cluster and a **memory-heavy Spark job** — then predict their Spark UI behaviour and debug deliberately bad configurations."),
 ]})
