# -*- coding: utf-8 -*-
# Exercises ch09, sections 1-8
EX = []
def ex(type, sec, d, tags, q, explain, quick=False, **kw):
    e = {"type": type, "section": f"ch09-s{sec:02d}", "difficulty": d, "tags": tags, "quick": quick, "q": q}
    if explain: e["explain"] = explain
    e.update(kw)
    EX.append(e)
def opt(text, ok, fb): return {"text": text, "ok": ok, "fb": fb}

# ---------------- s01
ex("calc", 1, 1, ["calc", "exam"], "Exercise 1 from the source. Driver: 4 cores / 16 GB. Workers: 10 × (8 cores / 32 GB). How many **worker cores** are there?",
   "10 × 8 = **80** worker cores. Not 84: the driver's 4 cores are coordination capacity, not worker execution capacity. Only worker cores become task slots.",
   quick=True, answer=80, tolerance=0, unit="cores")
ex("calc", 1, 1, ["calc"], "Same compute (driver 4c/16GB + 10 workers of 8c/32GB). How many **cloud VMs** are you paying for?",
   "1 driver VM + 10 worker VMs = **11** VMs. The driver doesn't add task slots, but it is still a machine you pay for — every node is a VM.",
   quick=True, answer=11, tolerance=0, unit="VMs")
ex("mcq", 1, 1, ["concept", "pitfall"], "Driver: 8 cores / 32 GB. Workers: 4 × (8 cores / 32 GB). Which statement is correct?",
   "Executors only live on workers: 4 × 8 = 32 cores and 4 × 32 = 128 GB. The tempting 40 cores / 160 GB adds the driver, which is a separate coordinator. There are 5 VMs (driver included), not 4.",
   options=["40 executor cores and 160 GB worker RAM", "32 executor cores and 128 GB worker RAM", "32 executor cores, 4 VMs in total", "40 executor cores, 5 VMs in total"],
   answer=1, why=["Adds the driver's 8 cores and 32 GB — classic mistake.", "Correct: only workers count as distributed capacity.", "Core count is right, but there are 5 VMs (the driver is a VM too).", "VM count right, core count wrong (driver cores added)."])
ex("calc", 1, 2, ["calc"], "Driver: 16 cores / 128 GB. Workers: 6 × (16 cores / 64 GB). How many **GB of worker RAM** in total?",
   "6 × 64 = **384 GB**. The driver's 128 GB is not part of the distributed worker memory — it serves planning, results and notebook state.",
   answer=384, tolerance=0, unit="GB")
ex("order", 1, 1, ["concept"], "Phase 1 builds from the lowest level up. Put the execution hierarchy in the order the source teaches it (lowest → most abstract).",
   "VM → Driver/Worker → Executor → Core → Task → Partition → Stage → Job. Machines host the driver/workers, workers host executors, executor cores run tasks, each task processes a partition, tasks form stages, stages form a job.",
   items=["VM", "Driver / Worker", "Executor", "Core", "Task", "Partition", "Stage", "Job"])
ex("tf", 1, 1, ["concept", "exam"], "Databricks currently recommends classic compute as the default for most new workloads and serverless only for special cases.",
   "False — it's the other way round. Databricks recommends **serverless** as the default for most new workloads, and classic when you need capabilities or configuration that serverless doesn't support.",
   answer=False)
ex("match", 1, 1, ["concept"], "Match each term to its definition.",
   "The driver coordinates, the executor is the process on a worker, a task is the smallest unit of a stage, a partition is the chunk of data a task processes, and a stage is a group of tasks between shuffles.",
   pairs=[["Driver", "Plans queries and schedules tasks"], ["Executor", "Spark process on a worker that runs tasks"], ["Task", "Smallest basic execution unit of a stage"],
          ["Partition", "Chunk of data processed by one task"], ["Stage", "Set of tasks that run without a shuffle in between"]])

# ---------------- s02
ex("mcq", 2, 1, ["exam"], "Certification trap: a Databricks classic compute has **6 workers**. How many Spark executors does it have?",
   "Databricks classic runs **one executor per worker node**, so 6 workers → 6 executors. The driver is not an executor, and executors aren't multiplied by cores — cores are task slots inside an executor.",
   quick=True, options=["6", "7", "6 × cores per worker", "It depends on spark.executor.instances"], answer=0,
   why=["Correct: one executor per worker.", "The driver doesn't run an executor in multi-node compute.", "Cores are task slots inside one executor, not separate executors.", "That's vanilla-Spark thinking; Databricks classic fixes one executor per worker."])
ex("order", 2, 2, ["concept"], "You run `spark.table(\"sales.orders\").groupBy(\"country\").sum(\"amount\")` and `display(result)`. Order what the driver/cluster does.",
   "The driver never starts adding rows itself: it builds the logical plan, optimizes it, produces a physical plan, cuts it into stages and tasks, and only then do executors process the actual partitions.",
   quick=True, items=["Build logical plan (Aggregate ← Scan)", "Optimize the plan", "Produce the physical plan", "Split into stages and tasks", "Executors run tasks on partitions", "Result returned to the notebook"])
ex("order", 2, 2, ["concept"], "Order the operators of the physical plan for `groupBy(\"country\").sum(\"amount\")`.",
   "Scan reads partitions, Partial Aggregate sums per country inside each partition, Exchange shuffles partial results by country, Final Aggregate combines them. The Exchange is the stage boundary.",
   items=["Scan", "Partial Aggregate", "Exchange", "Final Aggregate"])
ex("bucket", 2, 1, ["concept", "compare"], "Driver or workers? Sort each responsibility.",
   "The driver is coordination/control: sessions, planning, DAG and scheduling, notebook state. Workers do distributed processing: they scan, aggregate and shuffle the actual partitions.",
   buckets=["Driver", "Workers (executors)"],
   items=[{"text": "SparkContext / SparkSession", "bucket": 0}, {"text": "Query planning and DAG construction", "bucket": 0}, {"text": "Task scheduling and tracking executors", "bucket": 0},
          {"text": "Notebook interpreter / session state", "bucket": 0}, {"text": "Scanning partition 37 of sales.orders", "bucket": 1}, {"text": "Partial aggregation of rows in a partition", "bucket": 1},
          {"text": "Writing shuffle files to local disk", "bucket": 1}, {"text": "Collecting task metadata/results", "bucket": 0}])
ex("tf", 2, 1, ["concept"], "In Databricks classic documentation, *worker* and *executor* are often used almost interchangeably because Databricks runs one executor per worker node.",
   "True. In vanilla Spark the mapping can be more complex, but Databricks classic runs exactly one Spark executor per worker node, so the terms are near-synonyms there.",
   answer=True)
ex("odd", 2, 2, ["concept"], "Which one is NOT a driver responsibility?",
   "Tracking executors, stage scheduling and holding the SparkContext are all coordination jobs of the driver. Scanning a partition is actual data processing — done by a task on an executor.",
   options=["Tracking executors", "Stage scheduling", "Scanning partition 37 of sales.orders", "Holding the SparkContext"], answer=2)
ex("free", 2, 2, ["interview", "concept"], "Interview: \"When I run a groupBy-sum in a notebook, does the driver add up all the amounts?\" Answer in your own words.",
   "A strong answer separates planning from execution and mentions the physical plan.",
   model="No. The driver builds a logical plan, optimizes it and creates a physical plan (Scan → Partial Aggregate → Exchange → Final Aggregate). It splits that into stages and tasks and schedules them on the executors. The workers scan their partitions, compute partial sums, shuffle by key and compute the final sums; the driver only coordinates and receives the (small) result.",
   rubric=["Driver builds/optimizes plans", "Physical plan: partial aggregate, exchange, final aggregate", "Workers process the partitions", "Driver coordinates/schedules and receives results"])

# ---------------- s03
ex("calc", 3, 1, ["calc"], "4 workers × 8 cores. A stage has **100 partitions**. Roughly how many **waves** of tasks?",
   "Slots = 4 × 8 = 32. 100 / 32 = 3.125 → **4 waves** (32, 32, 32, 4). Conceptual only — real tasks vary in duration.",
   quick=True, answer=4, tolerance=0, unit="waves")
ex("calc", 3, 2, ["calc"], "Same 32 slots. In the **last** wave of that 100-task stage, how many tasks run?",
   "Three full waves run 96 tasks; the last wave runs 100 − 96 = **4** tasks while 28 slots sit idle. That idle tail is why partition counts that are multiples of the slot count are slightly more efficient.",
   answer=4, tolerance=0, unit="tasks")
ex("calc", 3, 1, ["calc", "exam"], "4 workers × 8 cores. After a groupBy, Stage 2 has **200 shuffle partitions**. How many waves?",
   "200 / 32 = 6.25 → you need **7 waves** (round up). Stage 1 with 64 input partitions needs only 2 waves.",
   quick=True, answer=7, tolerance=0, unit="waves")
ex("calc", 3, 1, ["calc"], "Exercise 2: 6 workers × 16 cores per worker. How many **task slots**?",
   "6 × 16 = **96** task slots: one slot per executor core, driver excluded.",
   answer=96, tolerance=0, unit="slots")
ex("calc", 3, 2, ["calc", "exam"], "Exercise 2 continued: 96 task slots, stage with **768 partitions**. Approximately how many waves?",
   "768 / 96 = **8 waves**, if all tasks have similar duration. Skew would break that neat picture.",
   answer=8, tolerance=0, unit="waves")
ex("calc", 3, 1, ["calc", "pitfall"], "Cluster with 32 available cores reads a dataset with only **4 partitions**. How many cores sit idle during that stage?",
   "4 partitions → 4 tasks → 4 busy cores, **28 idle**. A huge cluster without enough parallel work is wasted money.",
   answer=28, tolerance=0, unit="cores")
ex("mcq", 3, 1, ["concept"], "`orders` has 64 input partitions; you run `groupBy(\"country\").sum(\"amount\")` and Spark uses 200 shuffle partitions. How many tasks does the post-shuffle stage have?",
   "The downstream stage processes shuffle partitions, so it has **200** tasks. The 64 belongs to Stage 1 (scan). Partition count is stage-specific.",
   options=["64", "200", "264", "32 (one per core)"], answer=1,
   why=["That's Stage 1 (the scan stage).", "Correct: one task per shuffle partition.", "Tasks of different stages aren't added into one stage.", "Cores are slots; they don't determine the number of tasks."])
ex("tf", 3, 1, ["concept", "pitfall"], "A Spark job has one partition count that applies to all of its stages.",
   "False. **Partition count is stage-specific**: e.g. the scan stage has 64 input partitions and the post-groupBy stage has 200 shuffle partitions.",
   answer=False)
ex("tf", 3, 2, ["pitfall"], "Having 1,000 partitions on a 32-core cluster is a problem simply because there are more partitions than cores.",
   "False. They just run 32 at a time until done. The problem only appears when partitions become *tiny* in huge numbers (e.g. 1,000,000), so scheduling/task-startup overhead dominates.",
   answer=False)
ex("mcq", 3, 2, ["concept"], "A stage creates **1,000,000 tiny tasks**. What becomes the significant cost?",
   "Each task has scheduling and startup cost; with a million tiny tasks that overhead rivals or exceeds the useful work. It's not about cores being too few — 32 at a time is fine for 1,000 normal-sized tasks.",
   options=["Scheduling / task-startup overhead", "Driver RAM for storing Delta tables", "Spot instance reclamation", "Photon compilation of each row"], answer=0)
ex("cloze", 3, 1, ["calc", "concept"], "Fill in the sizing formulas.",
   "Slots come from workers × cores per worker (driver excluded); each slot runs ~1 task; tasks beyond the slot count run in waves.",
   text="Task slots = [[workers|number of workers]] × [[cores per worker|cores]]. Within a stage, 1 partition → 1 [[task]]. Waves ≈ tasks ÷ [[slots|task slots]], rounded up.",
   bank=["driver cores", "executors per core", "stages"])

# ---------------- s04
ex("calc", 4, 1, ["calc"], "Worker A: 4 cores / 16 GB. What is its **memory per core** (GB)?",
   "16 / 4 = **4 GB/core**. Compare with 4 cores / 32 GB = 8 GB/core — the same number of tasks, each with twice the memory headroom.",
   quick=True, answer=4, tolerance=0, unit="GB/core")
ex("calc", 4, 1, ["calc", "pitfall"], "Each task needs about 10 GB of working memory. A worker with 4 cores / 16 GB runs 4 concurrent tasks. What is the **potential working set** in GB?",
   "4 × 10 = **40 GB** of potential working set in a 16 GB worker → expect spill or OOM. A 4-core / 64 GB worker has a much better memory-per-core ratio for this workload.",
   quick=True, answer=40, tolerance=0, unit="GB")
ex("mcq", 4, 2, ["compare", "concept"], "Cluster A: 2 workers × 16 cores × 128 GB. Cluster B: 8 workers × 4 cores × 32 GB. Which statement is true?",
   "Both total 32 cores / 256 GB, but behaviour can differ: A has big executor heaps and fewer network peers; B has more shuffle fan-out and smaller fault impact per worker. Equal totals ≠ equal performance.",
   options=["They will perform identically because totals are equal", "Totals are equal, but network, shuffle fan-out, heap size and fault impact differ", "B has more total cores", "A is scale out, B is scale up"], answer=1,
   why=["Totals alone don't determine behaviour.", "Correct.", "Both have 32 cores.", "Reversed: A (few large) = scale up, B (many small) = scale out."])
ex("tf", 4, 1, ["pitfall"], "Two clusters with identical total cores and RAM will behave identically.",
   "False. Shape matters: network traffic, shuffle fan-out, executor heap size, per-task memory, scheduling, fault impact and local disk all depend on how capacity is split across workers.",
   answer=False)
ex("bucket", 4, 2, ["compare"], "Scale up (few large workers) or scale out (many small workers)? Sort the characteristics.",
   "Few large workers = bigger executor heaps and fewer network peers, but each lost worker removes a big share of capacity. Many small workers = more shuffle fan-out over the network but smaller fault impact per node.",
   buckets=["Scale up (few large)", "Scale out (many small)"],
   items=[{"text": "Cluster A: 2 × 16 cores × 128 GB", "bucket": 0}, {"text": "Cluster B: 8 × 4 cores × 32 GB", "bucket": 1},
          {"text": "Larger executor heap per worker", "bucket": 0}, {"text": "More shuffle fan-out between nodes", "bucket": 1},
          {"text": "Losing one worker removes a large share of capacity", "bucket": 0}, {"text": "Losing one worker removes a small share of capacity", "bucket": 1}])
ex("mcq", 4, 2, ["debug"], "You suspect a memory problem in a shuffle-heavy job. Which experiment does Databricks suggest first among these?",
   "Databricks suggests trying a **higher memory-per-core ratio** (e.g. memory-optimized workers) to see whether behaviour changes. More workers of the same type don't change per-task memory; a bigger driver doesn't help executors.",
   options=["Try workers with a higher memory-per-core ratio", "Add more workers of the same type", "Increase the driver size", "Turn off Photon"], answer=0)
ex("calc", 4, 2, ["calc", "compare"], "Cluster A (2 workers) loses one worker to a failure. What **percent** of worker capacity is lost?",
   "1 of 2 workers = **50%**. In Cluster B (8 workers) one failure costs only 12.5%. That's the *fault impact* difference between scale up and scale out.",
   answer=50, tolerance=0, unit="%")
ex("odd", 4, 2, ["concept"], "Which is NOT one of the things that differ between scale up and scale out?",
   "Network traffic, shuffle fan-out and per-task memory all depend on cluster shape. The Delta table storage format is a property of the data in cloud storage, independent of compute shape.",
   options=["Network traffic", "Shuffle fan-out", "Per-task memory", "Delta table storage format"], answer=3)

# ---------------- s05
ex("bucket", 5, 1, ["concept"], "Execution memory or storage memory?",
   "Execution memory serves operations in flight (sort, shuffle, hash aggregation, join hash tables). Storage memory holds cached/persisted data. With unified memory management they can share managed memory to some degree.",
   quick=True, buckets=["Execution memory", "Storage memory"],
   items=[{"text": "sort", "bucket": 0}, {"text": "shuffle", "bucket": 0}, {"text": "hash aggregation", "bucket": 0}, {"text": "join hash tables", "bucket": 0},
          {"text": "df.cache()", "bucket": 1}, {"text": "persisted blocks", "bucket": 1}])
ex("tf", 5, 1, ["pitfall", "interview"], "If you never call `cache()`, Spark memory pressure can't happen.",
   "False. **join / sort / groupBy** use execution memory even without any cache(). This is exactly the point interviewers want you to know.",
   quick=True, answer=False)
ex("tf", 5, 1, ["pitfall"], "If the Spark UI shows Disk Bytes Spilled, the job has failed.",
   "False. **Spill ≠ failure**: Spark is designed so operations can spill to local disk and continue. Only huge, repeated spill is a problem — mostly for speed.",
   answer=False)
ex("mcq", 5, 2, ["debug"], "A stage shows huge, repeated spill. Which can be causes? (select all)",
   "Huge repeated spill points to insufficient memory, too-large partitions, skew, a bad join, or too few shuffle partitions. More workers don't cause spill, and Photon isn't a spill cause listed here.",
   multi=True, options=["Insufficient memory", "Too-large partitions", "Skew", "Too few shuffle partitions", "Too many workers"], answer=[0, 1, 2, 3])
ex("match", 5, 2, ["concept"], "Match each workload element to the worker-memory consumer it uses.",
   "Cached DataFrames live in the JVM heap as cached data; hash joins use execution memory; Python processes run outside the JVM; Photon uses native memory; the OS and Databricks services also take their share.",
   pairs=[["df.cache() blocks", "JVM heap: cached data"], ["Hash join build side", "JVM heap: Spark execution memory"], ["Python UDF processes", "Python worker processes"],
          ["Photon vectorized operators", "Photon / native processing"], ["Node agents and the operating system", "OS / Databricks services"]])
ex("order", 5, 1, ["concept"], "Order what happens when a task spills.",
   "The task needs more memory than available, Spark writes intermediate data to the worker's local disk, processing continues, and the Spark UI records Memory/Disk Bytes Spilled.",
   items=["Task's intermediate data outgrows available RAM", "Spark writes intermediate data to local worker disk", "Processing continues", "Spark UI shows Memory/Disk Bytes Spilled"])
ex("cloze", 5, 1, ["syntax"], "Name the two Spark UI spill metrics.",
   "Memory Bytes Spilled is the in-memory size of the spilled data; Disk Bytes Spilled is its size on disk.",
   text="Spark UI spill metrics: [[Memory]] Bytes Spilled and [[Disk]] Bytes Spilled.", bank=["Shuffle", "Network", "Cache"])
ex("mcq", 5, 2, ["concept", "pitfall"], "A worker has 32 GB RAM. How much is available for your rows?",
   "Worker RAM is shared by the JVM heap (execution, cache, JVM objects, metadata), off-heap/native memory, Python workers, Photon and OS/Databricks services. It's not a simple RAM ÷ cores formula — memory per core is a heuristic.",
   options=["All 32 GB", "Exactly 32 GB ÷ cores per task", "Less: RAM is shared by JVM heap, off-heap, Python workers, Photon and OS/services", "Only what was cached with cache()"], answer=2)

# ---------------- s06
ex("mcq", 6, 1, ["concept"], "During `df.groupBy(\"country\").sum(\"amount\")`, where do map-side tasks put their shuffle output?",
   "Map-side tasks write shuffle files to their worker's **local disk**; downstream tasks pull the blocks over the **network**. Shuffle data is not written to the Delta table or the driver.",
   quick=True, options=["On each worker's local disk, fetched over the network", "In the Delta table's cloud storage", "In the driver's memory", "In the Unity Catalog metastore"], answer=0)
ex("tf", 6, 1, ["pitfall"], "Spill and shuffle files on worker local disks survive cluster termination, so the next run can reuse them.",
   "False. Local worker disk is **temporary compute storage**: when the VM is destroyed, shuffle, cache, temp and spill files can be lost. Persistent data belongs in Delta tables in cloud storage.",
   quick=True, answer=False)
ex("mcq", 6, 2, ["concept"], "Heavy shuffle puts pressure on which resources? (select all)",
   "Shuffle serializes data (CPU), buffers it (memory), writes it locally (local disk) and transfers it between workers (network). The UC metastore isn't involved in moving shuffle blocks.",
   multi=True, options=["CPU", "Memory", "Network", "Local disk", "Unity Catalog metastore"], answer=[0, 1, 2, 3])
ex("bucket", 6, 1, ["concept"], "Lost when the cluster stops, or persists?",
   "Anything on worker local disk or in memory is ephemeral. Delta data lives in cloud storage and table metadata in Unity Catalog.",
   buckets=["Lost (temporary compute storage)", "Persists"],
   items=[{"text": "Shuffle files", "bucket": 0}, {"text": "Cached partitions", "bucket": 0}, {"text": "Spill files", "bucket": 0}, {"text": "Temp files", "bucket": 0},
          {"text": "Delta table data", "bucket": 1}, {"text": "Unity Catalog metadata", "bucket": 1}])
ex("order", 6, 2, ["concept"], "Order the life of a groupBy shuffle.",
   "Map-side tasks process their partitions and write shuffle output locally; downstream tasks fetch blocks over the network and compute the final aggregate.",
   items=["Map-side tasks compute partial aggregates", "Shuffle files written to each worker's local disk", "Downstream tasks fetch shuffle blocks over the network", "Final aggregate computed per key"])
ex("free", 6, 2, ["concept"], "A colleague caches a cleaned DataFrame on an all-purpose cluster and says \"tomorrow we'll just reuse the cache\". Explain the problem.",
   "Cache and local files are ephemeral; persistence means writing to Delta.",
   model="Cached partitions live in executor memory/local disk, which is temporary compute storage. When the cluster terminates (e.g. auto-termination overnight), the worker VMs are destroyed and the cache is lost. To reuse the data tomorrow, write it to a Delta table in persistent cloud storage.",
   rubric=["Cache lives on executors / local disk", "Termination destroys worker VMs", "Ephemeral state is lost", "Persist to a Delta table"])

# ---------------- s07
ex("mcq", 7, 1, ["debug", "exam"], "Workers: 20 × 64 GB. Driver: 8 GB. You run `rows = df.collect()` on a 100 GB result. What happens?",
   "collect() brings every row to the driver. 100 GB into an 8 GB driver → **driver OOM**, while workers are fine. The 1,280 GB of worker RAM is irrelevant for a driver-side result.",
   quick=True, options=["Works: 1,280 GB of worker RAM is plenty", "Driver OOM — the workers are fine", "Executor OOM on one worker", "Spark spills the result to the driver's disk and continues"], answer=1,
   why=["Aggregate worker RAM doesn't help the driver.", "Correct.", "The workers just send their partitions; the driver collapses.", "collect() results must fit in driver memory."])
ex("bucket", 7, 2, ["debug", "compare"], "Driver OOM or executor OOM? Sort the causes.",
   "Driver OOM comes from things concentrated on the coordinator (collected results, huge plans, task metadata, local Python objects). Executor OOM comes from heavy per-task work (skew, hash joins, windows, too few partitions, UDF memory, streaming state).",
   quick=True, buckets=["Driver OOM", "Executor OOM"],
   items=[{"text": "df.toPandas() on a huge table", "bucket": 0}, {"text": "huge query plan", "bucket": 0}, {"text": "too many task metadata", "bucket": 0},
          {"text": "large local Python structures", "bucket": 0}, {"text": "skewed partition", "bucket": 1}, {"text": "large hash join", "bucket": 1},
          {"text": "huge window partition", "bucket": 1}, {"text": "too few shuffle partitions", "bucket": 1}, {"text": "stateful streaming state", "bucket": 1}, {"text": "large UDF memory", "bucket": 1}])
ex("order", 7, 2, ["debug"], "An executor dies with OOM. Put the diagnosis chain in order (before touching cluster size).",
   "Locate the failing executor/task, check whether one partition dominates, which points to skew; then look for spill, join and window issues, the shuffle partition count, and only finally memory per core. Mnemonic: Wise Doctors Scan Symptoms, Judge Wounds, Prescribe Medicine.",
   items=["Which executor/task failed?", "Does one partition dominate?", "Is it skew?", "Is there heavy spill?", "Is a join the culprit?", "Is a window the culprit?", "Too few partitions?", "Memory per core?"])
ex("tf", 7, 1, ["pitfall", "debug"], "If one partition is 100 GB and causes OOM, scaling to 100 workers solves it.",
   "False. A single task must still process the whole 100 GB partition — 99 workers just sit idle. Fix the partitioning/skew instead.",
   answer=False)
ex("scenario", 7, 3, ["debug"], "Nightly job: `orders.join(customers, \"customer_id\").groupBy(\"country\").sum(\"amount\")`. Stage 7 fails: *ExecutorLostFailure … OutOfMemoryError*. Your manager says \"double the cluster\".",
   "Doubling first is bad reasoning. The chain is: which task → dominant partition → skew → spill/join/window → partitions → memory per core.",
   steps=[
    {"prompt": "What do you do first?", "options": [
      opt("Double the number of workers and rerun", False, "Hardware first is the bad-reasoning path: if one partition is huge, extra workers stay idle."),
      opt("Open stage 7 in the Spark UI and find which tasks failed / are biggest", True, "Right — locate the failing executor/task and compare it with the others."),
      opt("Switch the cluster to Dedicated access mode", False, "Access mode is a capability/security setting, not a memory fix.")]},
    {"prompt": "Task metrics: median shuffle read 1.5 GB, max 180 GB (the failing task), heavy spill on that task only. Diagnosis?", "options": [
      opt("Skew on the join key — one partition dominates", True, "Correct: max ≫ median with huge shuffle read on one task is the skew signature."),
      opt("Too few cores overall", False, "Most tasks finished quickly; capacity isn't the limit."),
      opt("Driver OOM", False, "The error is ExecutorLost on a task — it's an executor problem.")]},
    {"prompt": "Best next move?", "options": [
      opt("Address the skewed key's data distribution, then rerun", True, "Skew is a data-distribution problem; fix the distribution."),
      opt("Double RAM per worker and hope", False, "More RAM may reduce failure/spill but doesn't redistribute skewed data."),
      opt("coalesce(1) to simplify the stage", False, "That collapses parallelism and makes it far worse.")]}])
ex("scenario", 7, 2, ["debug"], "A data scientist runs `pdf = df.toPandas()` on a 60 GB table. The notebook detaches with a driver error. Workers: 10 × 64 GB, driver: 16 GB.",
   "toPandas() materializes distributed data on the driver; keep work distributed or reduce data first.",
   steps=[
    {"prompt": "Which component failed and why?", "options": [
      opt("Driver: toPandas() pulled 60 GB into a 16 GB driver", True, "Correct — aggregate worker RAM doesn't matter for driver-side materialization."),
      opt("Executors: 60 GB is too much for 10 workers", False, "640 GB of worker RAM handles 60 GB easily; the workers weren't the problem."),
      opt("Spot reclamation of a worker", False, "Nothing points to a lost worker; the failure follows toPandas().")]},
    {"prompt": "What's the best fix?", "options": [
      opt("Aggregate/filter/sample in Spark first, toPandas() only the small result (or write to a table)", True, "Keeps the heavy lifting distributed."),
      opt("Add 10 more workers", False, "Workers don't help a driver-side collect."),
      opt("Enable Photon", False, "Photon accelerates SQL operators; it doesn't shrink what you collect to the driver.")]}])
ex("spotbug", 7, 2, ["debug", "pitfall"], "This notebook keeps crashing the driver on a 2 TB orders table. Click the buggy line.",
   "`collect()` pulls all 2 TB onto the driver → driver OOM. Aggregate on the workers and write the result to a table (or collect only the small aggregate).",
   lines=['orders = spark.table("main.shop.orders")', 'paid = orders.filter("status = \'PAID\'")', "rows = paid.collect()", "total = sum(r['amount'] for r in rows)", "print(total)"],
   bugs=[2], fix="from pyspark.sql import functions as F\ntotal = paid.agg(F.sum(\"amount\")).first()[0]   # aggregate on workers, bring back 1 row")
ex("odd", 7, 2, ["debug", "exam"], "Three of these are typical *executor* memory-failure causes listed by Databricks. Which one is the odd one out?",
   "Skew, large broadcasts and unpartitioned windows all blow up memory inside executors. `toPandas()` materializes data on the **driver** — a driver OOM cause.",
   options=["Skewed partitions", "Large broadcasts", "Unpartitioned windows", "df.toPandas() on a big table"], answer=3)
ex("free", 7, 2, ["interview", "debug"], "Interview: \"What's the difference between a driver OOM and an executor OOM, and how would you debug each?\"",
   "Name causes on both sides and a diagnosis-before-hardware approach.",
   model="Driver OOM happens on the coordinator, typically from collect()/toPandas() of large data, huge results or plans, many task metadata or big local Python objects — workers may be perfectly fine. I'd find the action that pulls data to the driver and keep the work distributed. Executor OOM happens inside a worker during task processing: skewed partitions, big hash joins/broadcasts, huge windows, too few shuffle partitions, UDF memory or streaming state. I'd open the stage in the Spark UI, find the failing task, compare max vs median partition size, check spill/join/window and shuffle partitions, and only then consider higher memory per core.",
   rubric=["Driver OOM causes (collect/toPandas, plan/result size)", "Executor OOM causes (skew, joins, windows, partitions)", "Debug with Spark UI task metrics", "Hardware/memory-per-core as last step"])

# ---------------- s08
ex("calc", 8, 1, ["calc"], "Classic autoscaling: worker = 8 cores / 32 GB, min 2, max 8. **Minimum** task slots?",
   "2 × 8 = **16** task slots at the minimum. The worker type never changes, only the count.",
   quick=True, answer=16, tolerance=0, unit="slots")
ex("calc", 8, 1, ["calc"], "Same autoscaling config (8-core workers, min 2, max 8). **Maximum** task slots?",
   "8 × 8 = **64** task slots. Capacity can move e.g. 16 → 24 → 40 → 64 depending on the workload.",
   quick=True, answer=64, tolerance=0, unit="slots")
ex("tf", 8, 1, ["exam", "pitfall"], "When classic autoscaling scales from 2 to 8 workers, it may also switch to a larger worker instance type.",
   "False. Autoscaling is **horizontal**: it changes the number of workers, and each stays 8 cores / 32 GB. It never turns 2 huge VMs into 8 tiny ones or vice versa.",
   answer=False)
ex("calc", 8, 2, ["calc", "exam"], "Exercise 3: 4 workers × 8 cores; a stage has 30 partitions. Autoscaling grows to 8 workers. How many cores are **idle** in that stage after scaling?",
   "8 × 8 = 64 slots but only 30 tasks → **34 idle** cores. Before scaling, 32 slots already ran all 30 tasks at once, so the stage gains essentially nothing.",
   answer=34, tolerance=0, unit="cores")
ex("scenario", 8, 2, ["debug"], "A stage takes 40 minutes. You raise max workers from 2 to 100 and autoscaling adds them — still 40 minutes. The Spark UI shows the stage has **1 task**.",
   "Autoscaling adds slots, not partitions. One partition → one task → one busy core.",
   steps=[
    {"prompt": "Why didn't 98 more workers help?", "options": [
      opt("The stage has 1 partition → 1 task; extra cores are idle", True, "Exactly: autoscaling doesn't magically create partitions."),
      opt("Autoscaling was too slow to add workers", False, "The workers were added; there was simply no work for them."),
      opt("Photon was off", False, "Photon wouldn't split one task into many.")]},
    {"prompt": "Upstream code contains `df = df.coalesce(1)`. What do you do?", "options": [
      opt("Remove it / repartition to a sensible number before the heavy work", True, "Restores parallelism the cluster can use."),
      opt("Raise max workers to 200", False, "Still 1 task."),
      opt("Switch to a bigger driver", False, "The driver isn't running the task.")]},
    {"prompt": "After fixing, how do you verify?", "options": [
      opt("Check the stage's task count in the Spark UI (or getNumPartitions on classic)", True, "Tasks per stage should now be close to the partition count you set."),
      opt("Check the cluster's autoscaling min/max", False, "Configuration doesn't prove the stage now has parallel tasks."),
      opt("Check the DBR version", False, "Irrelevant to partitioning.")]}])
ex("mcq", 8, 2, ["debug", "exam"], "Stage of 100 partitions: 99 × 100 MB and 1 × **200 GB**. You autoscale 4 → 40 workers. What happens?",
   "The 99 small tasks finish quickly either way; the job ends when the **straggler** (200 GB task) finishes. The problem is skew, not insufficient parallel capacity.",
   options=["The job becomes ~10× faster", "Small tasks finish fast; the 200 GB straggler still decides job time", "Spark automatically splits the 200 GB partition across the new workers", "The job fails because autoscaling can't exceed 32 workers"], answer=1)
ex("mcq", 8, 2, ["exam"], "Coming from vanilla Spark, you set `spark.dynamicAllocation.enabled=true` on Databricks classic compute. What's correct?",
   "Databricks explicitly lists the dynamic-allocation properties as **unsupported** on classic and tells you to use **Databricks autoscaling** (min/max workers). It's a favourite exam/interview distinction.",
   options=["It's the recommended way to autoscale on Databricks", "It's unsupported; use Databricks autoscaling instead", "It only works with Photon", "It works only on serverless"], answer=1)
ex("tf", 8, 1, ["exam"], "Serverless compute has no autoscaling at all — that's why there's no min/max workers field.",
   "False. Serverless **does** autoscale; Databricks manages instances, capacity, scaling and runtime. There's no min/max field because scaling is platform-managed, not because it doesn't exist.",
   answer=False)
ex("cloze", 8, 1, ["exam", "concept"], "Complete the exam rule.",
   "Classic autoscaling is horizontal: it changes worker count between your min and max, never the instance type.",
   text="Classic autoscaling is [[horizontal]] scaling: it changes the [[number of workers|worker count]], not the [[worker instance size|instance size|worker size|worker type]].",
   bank=["vertical", "driver size", "partition count"])
ex("order", 8, 2, ["debug"], "Autoscaling isn't speeding up a slow stage. Order your checks.",
   "Count tasks first, compare with slots, look for a collapsed partition count, check for a skewed straggler, and only then change partitioning — not max workers.",
   items=["Count the tasks of the slow stage", "Compute task slots (workers × cores)", "Check for coalesce(1) / single-partition source", "Check for a skewed straggler task", "Repartition / fix skew instead of adding workers"])
