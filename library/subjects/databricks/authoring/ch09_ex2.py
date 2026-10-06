# -*- coding: utf-8 -*-
# Exercises ch09, sections 9-16
from ch09_ex1 import ex, opt

# ---------------- s09
ex("tf", 9, 1, ["exam", "pitfall"], "A multi-node compute configured with 0 workers can still run Spark commands, because the driver will do the work.",
   "False. Docs: without worker nodes, **non-Spark** commands run on the driver but **Spark commands fail**. For single-machine Spark choose **Single node**, a separate mode where the driver also acts as worker.",
   quick=True, answer=False)
ex("mcq", 9, 1, ["exam"], "Your team needs **R** notebooks on classic compute. Which access mode?",
   "Standard supports Python, SQL and Scala but **not R**. R is one of the capabilities that requires **Dedicated**. Auto would pick for you, but the requirement itself means Dedicated.",
   quick=True, options=["Standard", "Dedicated", "Any — access mode doesn't affect languages", "Serverless"], answer=1,
   why=["Standard doesn't support R.", "Correct: R requires Dedicated.", "Access mode does constrain capabilities like R and RDD APIs.", "Serverless has no R either."])
ex("mcq", 9, 2, ["exam", "concept"], "The current compute UI shows **Access mode: Auto**. What does that mean?",
   "Auto isn't a third semantic model: Databricks picks Standard or Dedicated depending on runtime/hardware. It prefers Standard but switches to Dedicated for e.g. ML Runtime, GPU or a fairly old DBR.",
   options=["A third access model between Standard and Dedicated", "Databricks chooses Standard or Dedicated based on runtime/hardware", "Access is granted automatically to all workspace users", "The compute switches modes at runtime per query"], answer=1)
ex("bucket", 9, 2, ["compare", "exam"], "Standard is enough, or Dedicated needed?",
   "Standard covers shared DE/SQL work in Python, SQL and Scala. R, RDD APIs, GPU, ML Runtime and privileged machine access are Dedicated territory.",
   buckets=["Standard is fine", "Dedicated needed"],
   items=[{"text": "Shared PySpark ETL development by a team", "bucket": 0}, {"text": "SQL analysis", "bucket": 0}, {"text": "Scala Spark job", "bucket": 0},
          {"text": "R notebooks", "bucket": 1}, {"text": "Legacy code using RDD APIs", "bucket": 1}, {"text": "GPU deep-learning training", "bucket": 1},
          {"text": "ML Runtime", "bucket": 1}, {"text": "Privileged / low-level machine access", "bucket": 1}])
ex("tf", 9, 1, ["exam", "pitfall"], "Dedicated access mode should be chosen for important production jobs because it is the higher-performance tier.",
   "False. Dedicated is a **security/capability mode**, not a performance tier. Choose it only when the workload needs something Standard can't do (R, RDD, GPU, ML Runtime, privileged access).",
   answer=False)
ex("mcq", 9, 1, ["concept"], "Which workload is NOT a good fit for Single node compute?",
   "Single node (driver also acts as worker) suits small development, small datasets, some local ML and non-distributed work — not multi-TB Spark ETL, which needs distributed workers.",
   options=["Small development notebook", "Some local ML on a small dataset", "Multi-TB Spark ETL", "Non-distributed Python workload"], answer=2)
ex("match", 9, 2, ["exam"], "2026 UI nuance: match each element to how the current UI handles it.",
   "Compute is multi-node by default, Single node is chosen explicitly, driver type moved under Advanced Performance (default Auto), and access mode can be Auto. Old tutorials show a different UI.",
   pairs=[["Multi-node selector", "Gone: compute is multi-node by default"], ["Single node", "Chosen explicitly when desired"],
          ["Driver type", "Under Advanced Performance, defaults to Auto"], ["Access mode Auto", "Databricks picks Standard or Dedicated"]])
ex("odd", 9, 2, ["exam"], "Auto access mode normally prefers Standard. Which of these does NOT make it switch to Dedicated?",
   "Auto moves to Dedicated when you pick ML Runtime, GPU or a fairly old DBR. Photon is an engine toggle and doesn't require Dedicated.",
   options=["Selecting ML Runtime", "Selecting a GPU instance", "Selecting a fairly old DBR", "Enabling Photon"], answer=3)
ex("scenario", 9, 2, ["debug", "exam"], "A colleague created a multi-node compute with workers = 0 to save money. `print(1+1)` works, but `spark.range(10).count()` fails.",
   "Zero workers ≠ Single node.",
   steps=[
    {"prompt": "What's going on?", "options": [
      opt("Multi-node with 0 workers: non-Spark commands run on the driver, Spark commands fail", True, "That's exactly the documented behaviour."),
      opt("The DBR version is too old for spark.range", False, "spark.range is basic Spark; the issue is the missing workers."),
      opt("Photon doesn't support range()", False, "Photon isn't the problem here.")]},
    {"prompt": "They only need small single-machine Spark. Fix?", "options": [
      opt("Use Single node compute", True, "Single node is the separate mode where the driver acts as worker."),
      opt("Switch access mode to Dedicated", False, "Access mode doesn't add workers."),
      opt("Set spark.dynamicAllocation.enabled=true", False, "Unsupported on Databricks and wouldn't create a worker anyway.")]}])

# ---------------- s10
ex("mcq", 10, 1, ["exam", "concept"], "A cluster attached to a pool autoscales from 2 to 6 workers. Who decides that 4 more workers are needed?",
   "The **autoscaler** decides HOW MANY (+4). The **pool** only answers WHERE THE VMs COME FROM (4 warm instances). A pool never decides Spark's worker count.",
   quick=True, options=["The pool", "The autoscaler", "The cloud provider", "The driver's SparkContext via dynamic allocation"], answer=1)
ex("match", 10, 1, ["concept", "compare"], "Match each component to the question it answers.",
   "Autoscaler: how many workers. Pool: where the VMs come from. Compute: the Spark execution environment. Serverless: the platform manages capacity itself.",
   quick=True, pairs=[["Autoscaler", "HOW MANY workers?"], ["Pool", "WHERE DO the VMs come from?"], ["Compute (cluster)", "WHERE does Spark execute?"], ["Serverless", "Capacity is a platform concern"]])
ex("order", 10, 1, ["concept"], "Order the start-up path of a classic cluster **without** a pool.",
   "Without a pool every start asks the cloud for VMs and waits for provisioning before the runtime is prepared and Spark starts — that wait is what pools remove.",
   items=["Start cluster", "Ask cloud provider for VMs", "Wait for VM provisioning", "Prepare runtime", "Spark starts"])
ex("tf", 10, 1, ["concept"], "One instance pool can serve only one cluster.",
   "False. A pool is a reservoir of infrastructure instances and can serve several computes (Cluster A, B, C).",
   answer=False)
ex("mcq", 10, 2, ["concept"], "A spot worker is reclaimed mid-job. What typically happens, and which workload suits spot best?",
   "Spark can often retry the lost tasks elsewhere (task lost → schedule elsewhere), which makes spot attractive for **fault-tolerant batch**. Latency-sensitive streaming is a poor fit.",
   options=["The whole job always fails; spot suits nothing", "Lost tasks are rescheduled; good for fault-tolerant batch", "Data in Delta is lost; use only for dev", "Spark switches the driver to spot"], answer=1)
ex("tf", 10, 2, ["exam"], "Current Databricks real-time streaming mode requires spot instances to be turned off.",
   "True (per the source). Interruptions from reclaimed spot capacity are bad for latency-sensitive persistent processing.",
   answer=True)
ex("mcq", 10, 2, ["concept", "pitfall"], "Why do architectures usually keep the **driver** on stable (on-demand) capacity even when workers use spot?",
   "Losing a worker means some tasks retry. Losing the driver disrupts the **Spark application itself**. So driver reliability is separated from worker cost optimization.",
   options=["The driver is cheaper on-demand", "Losing the driver disrupts the whole Spark application; losing a worker only retries tasks", "Spot can't run the SparkContext binary", "Unity Catalog requires on-demand drivers"], answer=1)
ex("tf", 10, 1, ["exam"], "Serverless compute lets you attach your own instance pool to reduce startup time.",
   "False. Serverless doesn't support user-configured instance pools — it makes the pool problem a platform concern, which is why Databricks recommends serverless instead of pools where compatible.",
   answer=False)
ex("cloze", 10, 2, ["syntax", "concept"], "Name the three pool parameters from the source (AWS implementation).",
   "Minimum idle instances keep warm VMs ready, maximum capacity caps the pool size, idle instance auto termination releases unused warm VMs.",
   text="Pool parameters: minimum [[idle]] instances, maximum [[capacity]], and idle instance auto [[termination]].",
   bank=["workers", "partitions", "spot"])

# ---------------- s11
ex("bucket", 11, 1, ["concept", "exam"], "After an all-purpose cluster terminates: gone or kept?",
   "Termination destroys the VMs and everything ephemeral on them, but keeps the configuration (DBR, node types, autoscaling, name, permissions). Press Start and a fresh compute is built from it.",
   quick=True, buckets=["Gone", "Kept"],
   items=[{"text": "Cached DataFrames", "bucket": 0}, {"text": "Python variables", "bucket": 0}, {"text": "Shuffle files", "bucket": 0}, {"text": "Local temp files", "bucket": 0},
          {"text": "DBR version setting", "bucket": 1}, {"text": "Worker/driver type", "bucket": 1}, {"text": "Autoscaling settings", "bucket": 1}, {"text": "Compute permissions", "bucket": 1}])
ex("mcq", 11, 1, ["concept", "pitfall"], "You have **CAN ATTACH TO** on a cluster. What can you do?",
   "CAN ATTACH TO lets you attach a notebook and use the compute. Start/restart/terminate needs CAN RESTART; changing config/permissions needs CAN MANAGE. None of them grants data access — that's Unity Catalog.",
   quick=True, options=["Attach a notebook and use the compute", "Restart and terminate the cluster", "Change the worker type", "Read any table in the workspace"], answer=0)
ex("match", 11, 1, ["concept"], "Match each compute permission to what it adds.",
   "The levels are cumulative: ATTACH TO = use; RESTART = + start/restart/terminate; MANAGE = + change configuration and permissions.",
   pairs=[["CAN ATTACH TO", "Attach a notebook and run code"], ["CAN RESTART", "Start / restart / terminate"], ["CAN MANAGE", "Change configuration and permissions"]])
ex("scenario", 11, 2, ["debug"], "Nikos attaches his notebook to the shared cluster without problems, but `SELECT * FROM prod.payroll` fails with a permission error.",
   "Compute ACL ≠ Unity Catalog ACL.",
   steps=[
    {"prompt": "What kind of problem is this?", "options": [
      opt("Data permission (Unity Catalog), not compute permission", True, "He can use the compute; the table grant is the missing gate."),
      opt("Compute permission — he needs CAN MANAGE", False, "No compute permission level grants data access."),
      opt("The cluster is in Standard mode and can't read payroll", False, "Access mode isn't a table-permission mechanism.")]},
    {"prompt": "What do you check?", "options": [
      opt("Whether the running identity has SELECT on prod.payroll in Unity Catalog", True, "Correct gate to inspect."),
      opt("The cluster's autoscaling settings", False, "Irrelevant to authorization."),
      opt("Whether Photon is on", False, "Photon has nothing to do with permissions.")]}])
ex("tf", 11, 1, ["concept"], "Jobs compute is governed mainly by an idle auto-termination timeout, like all-purpose clusters.",
   "False. Jobs compute follows the **workload lifecycle**: job starts → compute starts → tasks run → job finishes → compute goes away. Idle timeouts are the all-purpose mechanism.",
   answer=False)
ex("order", 11, 1, ["concept"], "Order the jobs compute lifecycle.",
   "Jobs compute exists only for the job's duration — that's why Databricks prefers it over all-purpose compute for automated production jobs.",
   items=["Job starts", "Compute starts", "Tasks run", "Job finishes", "Compute goes away"])
ex("mcq", 11, 2, ["concept", "exam"], "Which serverless permission object governs **Jobs and Pipelines**?",
   "The workspace has **Default Interactive Compute** (notebooks / Databricks Connect) and **Default Automated Compute** (Jobs / Pipelines), each with CAN USE and management permissions. Serverless doesn't mean everyone has access.",
   options=["Default Interactive Compute", "Default Automated Compute", "CAN ATTACH TO on the serverless cluster", "There are no serverless permissions — everyone can use it"], answer=1)
ex("tf", 11, 1, ["pitfall"], "After you press Start on a terminated cluster, your previous Python variables and cache are restored.",
   "False. Start creates a **fresh** compute from the saved config. Cache, shuffle, process memory, local temp files and Python variables are gone.",
   answer=False)
ex("order", 11, 2, ["debug"], "A query fails on a cluster you can attach to. Order your checks.",
   "First classify compute vs data problem, then identify the running identity, then check its UC privileges, then request the right grant — never \"fix\" it with compute permissions.",
   items=["Classify: compute problem or data-permission problem?", "Identify which identity runs the query", "Check Unity Catalog privileges on the table", "Request the missing UC privilege"])

# ---------------- s12
ex("tf", 12, 1, ["pitfall"], "Enabling Photon will make a Python `for` loop over 10 million items run as fast native code.",
   "False. Photon is a native vectorized engine for SQL/DataFrame operators (scans, filters, joins, aggregations, writes). It doesn't magically convert arbitrary Python loops.",
   quick=True, answer=False)
ex("mcq", 12, 1, ["exam"], "A SQL aggregation is clearly CPU-bound on the workers. Which change is more likely to help?",
   "The aggregation runs on the workers, so a larger **driver** barely matters. **Photon / query optimization** directly speeds up CPU-heavy SQL operators.",
   quick=True, options=["A larger driver", "Photon / query optimization", "Dedicated access mode", "A longer auto-termination timeout"], answer=1)
ex("bucket", 12, 2, ["concept"], "Does Photon accelerate it well?",
   "Photon shines on SQL/DataFrame operators: scans, filters, joins, aggregations, Delta/Parquet writes. Opaque Python code and UDF logic are black boxes it can't vectorize.",
   buckets=["Photon accelerates well", "Little or no Photon benefit"],
   items=[{"text": "Scans", "bucket": 0}, {"text": "Filters", "bucket": 0}, {"text": "Joins", "bucket": 0}, {"text": "Aggregations", "bucket": 0}, {"text": "Delta/Parquet writes", "bucket": 0},
          {"text": "Python for-loop over items", "bucket": 1}, {"text": "Logic inside an opaque Python UDF", "bucket": 1}])
ex("spotbug", 12, 2, ["pitfall"], "This transformation runs slowly even with Photon on. Click the line that makes it optimizer-unfriendly.",
   "The Python UDF is an opaque black box: Catalyst can't see inside it and the native engine can't vectorize it. The same logic with built-in functions (`F.when`, `F.col`) is visible to the optimizer.",
   lines=["from pyspark.sql import functions as F", "@F.udf('string')", "def tier(amount): return 'big' if amount > 100 else 'small'", "orders = spark.table('main.shop.orders')", "out = orders.withColumn('tier', tier('amount'))"],
   bugs=[4], fix="out = orders.withColumn('tier', F.when(F.col('amount') > 100, 'big').otherwise('small'))")
ex("write", 12, 2, ["syntax"], "Rewrite with built-ins (no UDF): add a column `tier` = `'big'` when `amount > 100`, else `'small'`, on DataFrame `orders`.",
   "`F.when(...).otherwise(...)` with `F.col` keeps the logic inside Spark's optimizer and gives Photon a chance to accelerate it.",
   lang="python", solution="from pyspark.sql import functions as F\nout = orders.withColumn(\"tier\", F.when(F.col(\"amount\") > 100, \"big\").otherwise(\"small\"))",
   keywords=["withColumn", "F.when", "F.col", "otherwise"])
ex("order", 12, 1, ["concept"], "Order the execution stack from your code down to the hardware.",
   "Your DataFrame/SQL code is optimized by Catalyst into a physical plan, which is executed either by Photon native code or the Spark JVM, on the workers' CPUs.",
   items=["Spark DataFrame / SQL", "Catalyst", "Physical plan", "Photon native or Spark JVM", "Workers / CPU"])
ex("mcq", 12, 2, ["concept"], "Where is Photon configured vs always on?",
   "Serverless and SQL warehouses have Photon enabled; on classic all-purpose/jobs/pipelines it's configurable and default-on in the current UI.",
   options=["Always on everywhere, never configurable", "Enabled in serverless and SQL warehouses; configurable (default-on) on classic", "Only available on GPU clusters", "Only available on Dedicated access mode"], answer=1)

# ---------------- s13
ex("order", 13, 1, ["concept", "exam"], "Order the compute selection algorithm.",
   "Ask first whether serverless can support the workload; only if not is classic required, and then Standard is the default unless you need R/RDD/GPU/ML Runtime (Dedicated).",
   quick=True, items=["Can serverless support the workload?", "Yes → prefer serverless", "No → classic required", "Shared general DE/SQL → Standard", "Need R/RDD/GPU/ML Runtime → Dedicated"])
ex("mcq", 13, 1, ["exam"], "Which of these can you NOT control on serverless compute?",
   "Serverless doesn't give user control over compute policies, instance pools, most Spark cluster configs, compute-scoped init scripts or compute-scoped libraries. Choosing what your code does — tables, SQL, DataFrame logic — is still yours.",
   quick=True, options=["Which tables your query reads", "Compute-scoped init scripts", "The SQL you write", "Which notebook you run"], answer=1)
ex("odd", 13, 2, ["exam"], "Three of these are current serverless limitations. Which is the odd one out?",
   "No R, no RDD APIs and Spark Connect APIs only are real serverless limitations. Photon is platform-managed and on in serverless — it's not a limitation.",
   options=["No R", "No RDD APIs", "Spark Connect APIs only", "No Photon"], answer=3)
ex("bucket", 13, 2, ["exam", "compare"], "Run the selection algorithm: serverless, classic Standard or classic Dedicated?",
   "Default to serverless when supported. If a custom cluster Spark config or init script is required for shared DE work → classic Standard. R, RDD, GPU → classic Dedicated.",
   buckets=["Serverless", "Classic Standard", "Classic Dedicated"],
   items=[{"text": "Scheduled PySpark ETL that serverless supports", "bucket": 0}, {"text": "Ad-hoc SQL/Python notebook exploration", "bucket": 0},
          {"text": "Shared team DE work needing a compute-scoped init script", "bucket": 1}, {"text": "Shared ETL needing a Spark config serverless doesn't allow", "bucket": 1},
          {"text": "R analysis", "bucket": 2}, {"text": "Legacy RDD-based job", "bucket": 2}, {"text": "GPU model training", "bucket": 2}])
ex("tf", 13, 1, ["concept"], "Serverless's reduced configurability is purely a limitation with no benefit.",
   "False. It's also the **abstraction benefit**: no node sizing, pool tuning, spot strategy or idle cluster management for you to get wrong.",
   answer=False)
ex("cloze", 13, 1, ["exam"], "Complete the current serverless limitations list.",
   "Serverless trades control for abstraction: no R, no RDD APIs, Spark Connect APIs only, no cluster instance pools, limited Spark configs.",
   text="Serverless: no [[R]], no [[RDD]] APIs, [[Spark Connect]] APIs only, no cluster instance [[pools]], limited Spark [[configs|configurations]].",
   bank=["Python", "SQL", "Photon", "Delta"])
ex("free", 13, 2, ["interview"], "Interview: \"How do you decide between serverless and classic compute, and between Standard and Dedicated?\"",
   "Order of questions + capability-based reasoning.",
   model="I first ask whether serverless supports the workload; if yes I prefer it, since Databricks manages instances, scaling and runtime. If not — e.g. I need R, RDD APIs, compute-scoped init scripts/libraries or Spark configs serverless doesn't allow — classic is required. On classic, Standard is the default for shared DE/SQL work; I choose Dedicated only for capabilities Standard can't support such as R, RDD APIs, GPU, ML Runtime or privileged machine access — never as a performance tier.",
   rubric=["Serverless first if supported", "Classic when capability/config missing", "Standard default on classic", "Dedicated for R/RDD/GPU/ML Runtime, not performance"])

# ---------------- s14
ex("mcq", 14, 1, ["debug", "exam"], "Spark UI for a slow stage: median task 20 s, max task 15 min, and the max task has a huge shuffle read. Diagnosis?",
   "Max ≫ median with an outsized shuffle read on one task is a **strong skew signal**. More workers won't shorten the straggler.",
   quick=True, options=["Strong skew signal", "CPU-bound workload", "Driver OOM", "Too many workers"], answer=0)
ex("bucket", 14, 2, ["debug"], "Classify the signals: CPU-bound, memory-bound or I/O-bound?",
   "CPU-bound: CPU high, little spill, balanced tasks. Memory-bound: high spill, executor OOM, high GC, CPU not doing useful work. I/O-bound: CPU low while tasks spend time reading.",
   quick=True, buckets=["CPU-bound", "Memory-bound", "I/O-bound"],
   items=[{"text": "CPU high, little spill, tasks balanced", "bucket": 0}, {"text": "Memory OK, CPU saturated", "bucket": 0},
          {"text": "High spill and high GC time", "bucket": 1}, {"text": "Executor OOM", "bucket": 1},
          {"text": "CPU low, tasks spend time reading", "bucket": 2}, {"text": "Thousands of small files, poor pruning", "bucket": 2}])
ex("calc", 14, 2, ["calc"], "Sizing case: scan creates **2,000 partitions**; autoscale reaches **12 workers × 8 cores**. Roughly how many waves for the scan stage?",
   "12 × 8 = 96 concurrent tasks; 2,000 / 96 ≈ 20.8 → **21 waves**. At 4 workers (32 slots) it would be 63 waves — so the scan phase gains a lot from autoscaling.",
   answer=21, tolerance=0, unit="waves")
ex("calc", 14, 2, ["calc"], "Same scan of 2,000 partitions at the **minimum of 4 workers × 8 cores**. How many waves?",
   "4 × 8 = 32 slots; 2,000 / 32 = 62.5 → **63 waves**. Plenty of balanced tasks means more workers really do help this stage.",
   answer=63, tolerance=0, unit="waves")
ex("scenario", 14, 3, ["debug"], "Daily 2 TB ETL (filter → join → groupBy) on 4–12 autoscaling workers. The scan is fast, but the join stage takes 3 hours. Someone wants 50 workers.",
   "The source's sizing case: skew in the join stage, not capacity.",
   steps=[
    {"prompt": "Where do you look first?", "options": [
      opt("Spark UI → Stages → the join stage → task metrics distributions", True, "Distributions (median vs max) reveal what averages hide."),
      opt("Just set max workers to 50", False, "Hardware before diagnosis is the anti-pattern."),
      opt("The driver's memory settings", False, "The slow part is a worker stage.")]},
    {"prompt": "You see 499 tasks done (~2 GB each) and one task with huge duration, huge shuffle read (300 GB) and huge spill. Diagnosis?", "options": [
      opt("Skew", True, "One partition dwarfs the rest — classic skew."),
      opt("Need 50 workers", False, "The 300 GB task is still one task on one core."),
      opt("I/O-bound storage", False, "Most tasks finished quickly; the straggler is data-distribution driven.")]},
    {"prompt": "Would doubling RAM cure it?", "options": [
      opt("No: it may reduce spill/failure but doesn't redistribute skewed data", True, "Skew is a data-distribution problem."),
      opt("Yes: spill disappears so skew disappears", False, "The straggler still processes 300 GB alone."),
      opt("Yes, if you also enable Dedicated", False, "Access mode is unrelated to performance.")]}])
ex("match", 14, 2, ["debug"], "Best-practice matrix: match the symptom to the first direction of thought.",
   "Each symptom points to a different lever: idle cost → auto-termination, long startup → serverless/pool, driver OOM → collect/toPandas/driver size, stragglers → skew, few partitions → workers won't help, variable load → autoscaling.",
   pairs=[["Idle interactive cost", "Auto-termination"], ["Long cluster startup", "Serverless or pool"], ["Driver OOM", "collect/toPandas, driver size, plan/result size"],
          ["Few extreme stragglers", "Skew investigation"], ["Tiny number of partitions", "Adding workers won't help"], ["Variable workload", "Autoscaling"]])
ex("mcq", 14, 2, ["debug"], "CPU is low and tasks spend most time reading. What's the likely direction?",
   "That's I/O-bound: look at storage/file layout, too many small files, network, poor pruning, or simply reading too much data. Scaling CPU may not help.",
   options=["Add compute-optimized workers", "File layout / small files / pruning / read less data", "Bigger driver", "Disable Photon"], answer=1)
ex("order", 14, 1, ["debug"], "Order the Spark UI path for diagnosing a slow stage.",
   "Go to Stages, open the slow one, look at task metrics, and compare distributions (median vs max) of duration, input, shuffle read/write, spill and GC.",
   items=["Open the Stages tab", "Open the slow stage", "Look at the task metrics", "Compare distributions: median vs max"])
ex("tf", 14, 1, ["pitfall"], "For a CPU-bound workload (CPU saturated, little spill, balanced tasks), adding RAM is the primary fix.",
   "False. CPU-bound calls for more/faster cores, compute-optimized workers, Photon or a better algorithm/query — not just more RAM.",
   answer=False)
ex("odd", 14, 2, ["debug"], "Which is NOT one of the task-metric distributions you inspect for a slow stage?",
   "Duration, Shuffle Read, GC Time (plus Input Size, Shuffle Write, Records, Memory/Disk Spill) are task metrics. Unity Catalog grants aren't Spark UI performance metrics.",
   options=["Duration", "Shuffle Read", "GC Time", "Unity Catalog grants"], answer=3)
ex("scenario", 14, 2, ["debug"], "An hourly job got slower. Cluster metrics: CPU ~95% on all workers, almost no spill, task durations balanced. Your teammate proposes memory-optimized workers.",
   "Identify the bottleneck before choosing hardware.",
   steps=[
    {"prompt": "Which bottleneck type is this?", "options": [
      opt("CPU-bound", True, "High CPU, little spill, balanced tasks."),
      opt("Memory-bound", False, "No spill/GC/OOM signals."),
      opt("I/O-bound", False, "CPU would be low if tasks were waiting on reads.")]},
    {"prompt": "Best first direction?", "options": [
      opt("Photon / query optimization / more or faster cores (compute-optimized)", True, "Matches the CPU-bound row of the matrix."),
      opt("Memory-optimized workers", False, "More RAM doesn't help a CPU-saturated job."),
      opt("Longer auto-termination", False, "Cost setting, not performance.")]}])

# ---------------- s15
ex("write", 15, 1, ["syntax"], "Write the Python to inspect the current value of the shuffle-partitions Spark config.",
   "`spark.conf.get(...)` is the documented way to inspect Spark configuration; `spark.sql.shuffle.partitions` controls how many partitions a shuffle produces.",
   quick=True, lang="python", solution='spark.conf.get("spark.sql.shuffle.partitions")', keywords=["spark.conf.get", "spark.sql.shuffle.partitions"])
ex("cloze", 15, 1, ["syntax"], "Complete the code to print the Spark version and the partition count of `df` (classic compute).",
   "`spark.version` returns the Spark version; `df.rdd.getNumPartitions()` needs RDD access — fine on compatible classic compute, not on serverless.",
   quick=True, asCode=True, text="print(spark.[[version]])\nprint(df.[[rdd]].[[getNumPartitions]]())",
   bank=["partitions", "conf", "numPartitions"])
ex("tf", 15, 1, ["pitfall", "exam"], "`df.rdd.getNumPartitions()` works the same on serverless notebook compute as on classic.",
   "False. It needs RDD access, and serverless (Spark Connect) doesn't support RDD APIs. On serverless, reason from the query plan and Spark UI / query profile.",
   answer=False)
ex("mcq", 15, 2, ["compare", "syntax"], "You wrote 5,000 tiny partitions and want ~20 for the final write, without a full shuffle. Which is the better fit?",
   "`coalesce(20)` reduces partitions without full redistribution — ideal for too many partitions. `repartition(20)` would do a shuffle. But don't collapse too aggressively (e.g. coalesce(1)) or you lose parallelism.",
   options=["df.repartition(20)", "df.coalesce(20)", "df.coalesce(1)", 'spark.conf.get("spark.sql.shuffle.partitions")'], answer=1,
   why=["Works, but usually triggers a shuffle.", "Correct: reduces partitions without full redistribution.", "Collapses parallelism to one task.", "That only reads a config value."])
ex("write", 15, 2, ["syntax"], "Experiment 1: create a 10-million-row DataFrame with a `group_id` = `id % 100`, count rows per group, and print the formatted plan.",
   "`spark.range` creates the `id` column; `F.col(\"id\") % 100` creates 100 groups; `explain(\"formatted\")` shows the Exchange (shuffle) caused by groupBy.",
   lang="python", solution='from pyspark.sql import functions as F\ndf = spark.range(0, 10_000_000)\ndf = df.withColumn("group_id", F.col("id") % 100)\nresult = df.groupBy("group_id").count()\nresult.explain("formatted")',
   keywords=["spark.range", "withColumn", "% 100", "groupBy", "explain(\"formatted\")"])
ex("spotbug", 15, 2, ["debug", "pitfall"], "On a 64-core cluster this job uses only one core for the heavy aggregation. Click the culprit line.",
   "`coalesce(1)` collapses the data into one partition → one task → one busy core. Coalesce is a narrow operation, so the whole upstream stage runs as a single task too.",
   lines=['df = spark.table("main.shop.orders")', "df = df.coalesce(1)", 'agg = df.groupBy("customer_id").sum("amount")', 'agg.write.mode("overwrite").saveAsTable("main.shop.cust_totals")'],
   bugs=[1], fix='df = spark.table("main.shop.orders")   # keep source parallelism\n# coalesce (moderately) only right before writing, if files are too many')
ex("mcq", 15, 2, ["syntax"], "`df.explain(\"formatted\")` shows `Exchange hashpartitioning(customer_id, 200)`. What does the **200** most likely reflect?",
   "Exchange = shuffle; hashpartitioning by customer_id into **200** partitions — typically the value of `spark.sql.shuffle.partitions`. So the next stage will have about 200 tasks.",
   options=["The number of workers", "The number of shuffle partitions (→ ~200 tasks in the next stage)", "The number of input files", "The broadcast threshold in MB"], answer=1)
ex("write", 15, 2, ["syntax"], "Experiment 3: repartition `df` into 500 partitions, count rows per `group_id`, and run it with a write that produces no output files (overwrite mode).",
   "The `noop` format executes the whole plan but writes nothing, so you can inspect the number of tasks in the Spark UI. The lesson: partitioning → number of tasks → usable core parallelism.",
   lang="python", solution='many = df.repartition(500)\nmany.groupBy("group_id").count().write.mode("overwrite").format("noop").save()',
   keywords=["repartition(500)", "groupBy", "format(\"noop\")", "mode(\"overwrite\")", "save()"])
ex("cloze", 15, 1, ["syntax"], "Fill in the operator names to look for in `explain(\"formatted\")` output.",
   "Exchange = shuffle boundary; HashAggregate = aggregation; BroadcastHashJoin vs SortMergeJoin = the join strategy chosen.",
   text="A shuffle appears as [[Exchange]]; an aggregation as [[HashAggregate]]; joins as [[BroadcastHashJoin]] or [[SortMergeJoin]].",
   bank=["FileScan", "Project", "CartesianProduct"])
ex("scenario", 15, 2, ["debug"], "You run Experiment 2: `df.coalesce(1).count()` vs `df.count()` on a large DataFrame. In the Spark UI most cores are idle during the first one.",
   "Ask yourself: why are most cores idle?",
   steps=[
    {"prompt": "Why are most cores idle?", "options": [
      opt("Only one partition → one task", True, "Exactly the lesson of the experiment."),
      opt("The cluster is still autoscaling", False, "Even fully scaled, one task can use one core."),
      opt("count() is executed on the driver", False, "count() runs as tasks on executors and sums partial counts.")]},
    {"prompt": "How do you confirm in the Spark UI?", "options": [
      opt("Look at the stage's number of tasks (1 vs many)", True, "Task count per stage = partitions."),
      opt("Check the cluster's DBR version", False, "Irrelevant."),
      opt("Check the Delta table history", False, "Not related to execution parallelism.")]}])
ex("calc", 15, 1, ["calc"], "In Experiment 1, `group_id = id % 100` over `spark.range(0, 10_000_000)`. How many rows does `result` (groupBy count) have?",
   "`id % 100` yields values 0–99 → **100** groups, each with 100,000 rows. The shuffle still moves partial counts across workers (Exchange).",
   answer=100, tolerance=0, unit="rows")

# ---------------- s16  (Big Phase-1 test, Q1–Q25)
ex("calc", 16, 1, ["calc", "exam"], "Q1. Driver: 4 cores. Workers: 5 × 8 cores. How many **executor cores**?",
   "5 × 8 = **40**. The driver's cores aren't executor cores.", quick=True, answer=40, tolerance=0, unit="cores")
ex("calc", 16, 1, ["calc", "exam"], "Q2. A stage has 160 partitions and the cluster has 40 worker cores. Approximately how many waves under ideal balance?",
   "160 / 40 = **4 waves**, assuming balanced task durations.", quick=True, answer=4, tolerance=0, unit="waves")
ex("mcq", 16, 1, ["exam"], "Q3. You go from 5 workers → 20 workers, but the stage only has 8 partitions. Will it scale well?",
   "No. Only 8 tasks exist, so the extra workers mostly leave cores idle. Partitions cap parallelism.",
   options=["Yes, roughly 4× faster", "No — only 8 tasks exist; most new cores stay idle", "Yes, Spark splits partitions to match workers", "Only if Photon is on"], answer=1)
ex("mcq", 16, 1, ["exam"], "Q4. What is the relationship between worker and executor in Databricks classic?",
   "Databricks classic runs **one executor per worker node** — which is why the terms are used almost interchangeably.",
   options=["One executor per worker node", "One executor per core", "One executor per cluster", "Executors run only on the driver"], answer=0)
ex("mcq", 16, 2, ["exam", "debug"], "Q5. A single task spills 80 GB while all other tasks spill almost nothing. What do you suspect first?",
   "Data **skew** / an unusually large partition. If memory were globally too small, all tasks would spill.",
   options=["Data skew / unusually large partition", "Not enough workers", "Driver too small", "Photon disabled"], answer=0)
ex("mcq", 16, 3, ["exam", "debug"], "Q6. All executors die with OOM during a hash aggregation. Which do you investigate? (select all that apply)",
   "Investigate partition sizes, shuffle partition count, skew, hash-table size, join strategy, memory/core, UDFs and windows. Driver type and auto-termination have nothing to do with executor-side hash aggregation memory.",
   multi=True, options=["Partition sizes and shuffle partition count", "Skew", "Hash-table size / join strategy", "Memory per core", "UDFs and windows", "Auto-termination timeout"], answer=[0, 1, 2, 3, 4])
ex("mcq", 16, 1, ["exam", "debug"], "Q7. The driver crashes after `df.toPandas()`. Workers have plenty of RAM. Why?",
   "`toPandas()` **materializes the distributed data on the driver**. Worker RAM doesn't help; the driver's memory is the limit.",
   options=["toPandas() materializes all distributed data on the driver", "Workers ran out of memory and took the driver down", "Photon doesn't support pandas", "Standard access mode blocks pandas"], answer=0)
ex("match", 16, 2, ["exam", "compare"], "Q8 + Q9. Match each phrase to its meaning.",
   "More workers = horizontal scale-out; larger worker type = vertical scale-up; autoscaling 2–10 = worker count varies between 2 and 10 with the same worker type.",
   pairs=[["More workers", "Horizontal scale-out"], ["Larger worker type", "Vertical scale-up"], ["Classic autoscaling 2–10", "Worker count varies 2–10, same worker type"]])
ex("tf", 16, 1, ["exam"], "Q10. Serverless compute autoscales.",
   "True — but the infrastructure scaling is **platform-managed**, not a classic min/max worker setting.", answer=True)
ex("tf", 16, 1, ["exam"], "Q11. You can set traditional `min_workers=2, max_workers=10` for ordinary serverless notebook compute.",
   "False — not using the classic configuration model. Serverless scaling is managed by Databricks.", answer=False)
ex("mcq", 16, 2, ["exam"], "Q12 + Q13. Which pairing of reasons is correct?",
   "Dedicated: when you need R, RDD APIs, GPU/ML Runtime, privileged machine access or other things Standard can't do. Standard: general DE/ETL and shared collaborative workloads — the recommended classic default.",
   options=["Dedicated for production importance; Standard for dev only", "Dedicated for R/RDD/GPU/ML Runtime/privileged access; Standard for general shared DE/ETL (recommended default)", "Dedicated for speed; Standard for cost", "Dedicated for SQL; Standard for Python"], answer=1)
ex("mcq", 16, 1, ["exam"], "Q14. What problem does a pool solve?",
   "It **reduces instance provisioning / startup latency** by keeping warm instances ready.",
   options=["Reduces provisioning/startup latency with warm instances", "Decides how many workers Spark needs", "Grants data access", "Fixes data skew"], answer=0)
ex("tf", 16, 1, ["exam"], "Q15. A pool decides how many workers Spark needs.",
   "False. Autoscaling determines worker count; the pool only provides instances.", answer=False)
ex("bucket", 16, 2, ["exam"], "Q16 + Q17. What disappears when compute terminates, and what remains?",
   "Ephemeral: executor memory, cache, shuffle, local temporary files, runtime processes. Persistent: Delta tables, workspace notebooks, Unity Catalog metadata, compute configuration, job definitions.",
   buckets=["Disappears (ephemeral)", "Remains (persistent)"],
   items=[{"text": "Executor memory", "bucket": 0}, {"text": "Cache", "bucket": 0}, {"text": "Shuffle data", "bucket": 0}, {"text": "Runtime processes", "bucket": 0},
          {"text": "Delta tables", "bucket": 1}, {"text": "Workspace notebooks", "bucket": 1}, {"text": "Unity Catalog metadata", "bucket": 1}, {"text": "Job definitions", "bucket": 1}, {"text": "Compute configuration", "bucket": 1}])
ex("mcq", 16, 1, ["exam"], "Q18. Why is Spot cheaper but riskier?",
   "Spot is spare capacity that the **cloud provider can reclaim**. Cheap, but workers can disappear (tasks then retry).",
   options=["The cloud provider can reclaim spot capacity", "Spot VMs have fewer cores", "Spot disables Photon", "Spot data isn't encrypted"], answer=0)
ex("tf", 16, 1, ["exam", "pitfall"], "Q19. Photon means GPU acceleration.",
   "False. Photon is **CPU-native vectorized** query execution, not GPU.", answer=False)
ex("mcq", 16, 2, ["exam"], "Q20. Which is more likely to help a CPU-bound SQL aggregation?",
   "Photon / query optimization is far more directly relevant; the driver doesn't execute the aggregation.",
   options=["Larger driver", "Photon / query optimization", "More RAM per worker"], answer=1)
ex("mcq", 16, 1, ["exam"], "Q21. You have 64 cores but 1 partition. What's the limiting resource?",
   "**Parallelism**: one partition → one task → one core busy, 63 idle.",
   options=["Parallelism (one partition → one task)", "RAM", "Network", "Driver CPU"], answer=0)
ex("mcq", 16, 2, ["exam"], "Q22. You have 500 balanced partitions and only 8 cores. What's one obvious avenue?",
   "With plenty of balanced, independent tasks, **more cores/workers can help** (500 / 8 ≈ 63 waves today).",
   options=["More cores/workers", "coalesce(1)", "Bigger driver", "Switch to Dedicated"], answer=0)
ex("tf", 16, 2, ["exam", "pitfall"], "Q23. More RAM automatically cures skew.",
   "False. Skew is a **data-distribution** problem. More memory may reduce failure/spill but doesn't redistribute the skewed data.", answer=False)
ex("mcq", 16, 1, ["exam"], "Q24. What does an `Exchange` in a physical plan usually tell you?",
   "A **data redistribution / shuffle boundary** is likely occurring — and a new stage starts after it.",
   options=["A shuffle / data redistribution boundary", "A Delta transaction commit", "A broadcast variable was created by the driver", "Photon was disabled"], answer=0)
ex("mcq", 16, 2, ["exam"], "Q25. Why can too many tiny partitions also be bad? (select all)",
   "Task scheduling/setup overhead, tiny files, excessive metadata and inefficient execution can dominate useful work. Tiny partitions don't cause driver collect() issues by themselves.",
   multi=True, options=["Task scheduling/setup overhead", "Tiny files", "Excessive metadata", "Inefficient execution dominates useful work", "They force collect() onto the driver"], answer=[0, 1, 2, 3])
ex("free", 16, 2, ["interview"], "Say it without notes: explain Phase 1 in ~6 sentences (driver/executors, slots, partitions, memory/spill, driver memory, autoscaling, access modes, pools).",
   "The closing \"what you should be able to explain\" list.",
   model="A classic Databricks cluster has one driver and one executor per worker. Each worker contributes cores and Spark maps one task slot per executor core. Partitions determine how many tasks a stage exposes, so adding workers only helps with enough useful parallelism. Worker memory serves execution, caching, native/Python processing and platform overhead; when execution data doesn't fit, Spark spills to local disk. Driver memory is separate, so collect()/toPandas() can OOM the driver even with huge executor RAM. Classic autoscaling changes worker count within limits; serverless also scales but Databricks controls the infrastructure. Standard and Dedicated are access/capability modes, not performance tiers, and pools speed up provisioning but don't decide worker count.",
   rubric=["One driver + one executor per worker", "1 task slot per core; partitions → tasks", "Memory consumers + spill to local disk", "Driver OOM via collect/toPandas", "Autoscaling changes worker count; serverless managed", "Access modes ≠ performance; pools ≠ worker count"])
ex("free", 16, 3, ["interview", "compare"], "Next step from the source: design three classic clusters — (1) interactive development, (2) production batch ETL, (3) memory-heavy Spark job. For each, name the key settings and one Spark UI behaviour you'd predict.",
   "Apply sizing, lifecycle and memory-per-core reasoning.",
   model="(1) Interactive dev: all-purpose, Standard access mode, small autoscaling range (or single node for tiny data), short auto-termination, optionally a pool for fast start; expect short stages and idle periods. (2) Production batch ETL: jobs compute (or serverless jobs if supported), Standard, autoscaling sized to the scan's partitions, Photon on, spot workers but a stable driver; expect a wide scan stage with many waves and shuffle stages sized by shuffle partitions — watch for stragglers. (3) Memory-heavy job: memory-optimized workers with high GB/core, enough shuffle partitions, skew checks; expect spill metrics and GC time to be the things to monitor, and OOM if memory per core is too low.",
   rubric=["Dev: all-purpose + auto-termination (+pool/single node)", "Batch: jobs compute/serverless, autoscaling, spot workers + stable driver", "Memory-heavy: memory-optimized / high GB per core, partitions", "Predicts Spark UI signals (waves, stragglers, spill/GC)"])

# ---------------- extra debug drills (scenario + order per playbook)
ex("order", 7, 2, ["debug"], "The driver crashed right after a notebook cell ran. Order your driver-OOM checks.",
   "Confirm it's the driver, find the action that pulled data to it, compare the result size with driver RAM, keep the work distributed — and only then consider a bigger driver. Mnemonic: the driver is a desk, not a warehouse.",
   items=["Confirm the driver (not an executor) failed", "Find the action that pulled data to the driver (collect/toPandas)", "Compare result size with driver RAM", "Aggregate/filter on workers or write to a table instead", "Only if truly needed: larger driver type"])
ex("scenario", 5, 2, ["debug"], "A daily aggregation got 3× slower. No failure, but the Spark UI shows tens of GB of Disk Bytes Spilled and high GC time spread across **all** tasks of the shuffle stage.",
   "Spill is a symptom: find out why it spills.",
   steps=[
    {"prompt": "First interpretation?", "options": [
      opt("Memory pressure across all tasks — not a single skewed task", True, "Uniform spill points to partitions too large / memory per core too low rather than skew."),
      opt("The job has failed and must be restarted", False, "Spill ≠ failure; the job is just slow."),
      opt("Driver OOM", False, "The spill is in executor tasks.")]},
    {"prompt": "What do you check next?", "options": [
      opt("Partition size and spark.sql.shuffle.partitions", True, "Too few shuffle partitions → each partition too big → spill."),
      opt("The compute permissions", False, "Permissions don't affect memory."),
      opt("The auto-termination timeout", False, "Cost setting, not performance.")]},
    {"prompt": "Partitions are reasonable now, but spill remains high. Next lever?", "options": [
      opt("Higher memory per core / memory-optimized workers", True, "Databricks recommends them for memory-intensive shuffle/spill workloads."),
      opt("More workers of the same small type", False, "Doesn't change memory per task."),
      opt("coalesce(1)", False, "Makes partitions even bigger.")]}])
ex("order", 5, 2, ["debug"], "Huge spill is slowing a stage. Order your investigation.",
   "Size the spill, see whether it's concentrated (skew) or spread, check partition size/shuffle partitions, look at the join, and only then change memory per core.",
   items=["Is the spill huge and repeated?", "Concentrated in one task or spread across all?", "Partitions too large / too few shuffle partitions?", "Is a join building large hash tables?", "Try higher memory per core / memory-optimized workers"])
ex("order", 9, 1, ["debug"], "Spark commands fail on a compute with 0 workers. Order the fix path.",
   "Check node mode and worker count, confirm the symptom (non-Spark ok, Spark fails), then pick Single node for single-machine Spark or add workers for distributed work.",
   items=["Check node mode and worker count", "Confirm non-Spark commands work but Spark commands fail", "Decide: single-machine or distributed?", "Single node mode — or add ≥1 worker"])
ex("scenario", 10, 2, ["debug"], "Every morning the team waits ~7 minutes for their classic all-purpose cluster to start, and at night the cluster sits idle for hours.",
   "Slow start → serverless or pool; idle cost → auto-termination.",
   steps=[
    {"prompt": "What's the first question for the slow start?", "options": [
      opt("Can serverless support this workload?", True, "Databricks recommends serverless instead of pools where compatible."),
      opt("Should we add more workers?", False, "More workers mean more VMs to provision, not faster start."),
      opt("Should we switch to Dedicated?", False, "Access mode doesn't affect provisioning time.")]},
    {"prompt": "They need a compute-scoped init script, so classic is required. How do you cut startup time?", "options": [
      opt("Attach the cluster to an instance pool with warm idle instances", True, "Warm VMs skip the provisioning wait."),
      opt("Set spark.dynamicAllocation.enabled", False, "Unsupported on Databricks and unrelated to start-up."),
      opt("Use spot for the driver", False, "Cheaper, not faster — and riskier for the driver.")]},
    {"prompt": "And the idle overnight cost?", "options": [
      opt("Set auto-termination after X idle minutes", True, "Interactive clusters cost money while idle."),
      opt("Delete the cluster every night", False, "Termination already keeps the config; deleting loses it."),
      opt("Raise min workers", False, "That increases idle cost.")]}])
ex("order", 10, 2, ["debug"], "Cluster start-up is too slow. Order your decisions.",
   "Prefer serverless where compatible; if classic is required, use a pool with warm instances and tune its parameters; separately fix idle cost with auto-termination.",
   items=["Check whether serverless supports the workload", "If classic required: attach to an instance pool", "Tune min idle instances / max capacity", "Set auto-termination for idle interactive cost"])
ex("scenario", 15, 2, ["debug"], "On serverless notebook compute, `df.rdd.getNumPartitions()` raises an error saying the RDD API isn't supported.",
   "Serverless speaks Spark Connect, not RDD.",
   steps=[
    {"prompt": "Why does it fail?", "options": [
      opt("Serverless supports Spark Connect APIs only — no RDD APIs", True, "Correct."),
      opt("The DataFrame has zero partitions", False, "It would return 0, not an API error."),
      opt("You lack CAN MANAGE on the compute", False, "Permissions aren't the issue.")]},
    {"prompt": "How do you see partitioning on serverless?", "options": [
      opt('Use df.explain("formatted") and the Spark UI / query profile', True, "Exchange hashpartitioning(..., N) shows the shuffle partitioning."),
      opt("Call df.rdd.partitions instead", False, "Still the RDD API."),
      opt("Switch Photon off", False, "Irrelevant to API support.")]}])
ex("order", 15, 2, ["debug"], "RDD code fails on serverless. Order the response.",
   "Confirm the compute type, use plan/Spark UI instead, and move to compatible classic compute only if RDD APIs are truly required.",
   items=["Confirm you're on serverless (Spark Connect)", "Get the information from explain / Spark UI / query profile", "If RDD APIs are mandatory: move to compatible classic compute"])
ex("scenario", 8, 2, ["debug", "exam"], "A Spark veteran sets `spark.dynamicAllocation.enabled true` in a classic cluster's Spark config, expecting executors to scale. Nothing scales as hoped.",
   "On Databricks, the autoscaler allocates — not Spark.",
   steps=[
    {"prompt": "What's wrong?", "options": [
      opt("Databricks lists dynamic-allocation properties as unsupported on classic", True, "Correct — use Databricks autoscaling."),
      opt("The property name needs a databricks. prefix", False, "There's no such supported variant."),
      opt("Dynamic allocation only works on serverless", False, "Serverless scaling is platform-managed; no Spark property controls it.")]},
    {"prompt": "Fix?", "options": [
      opt("Remove the property and enable autoscaling with min/max workers", True, "That's the supported mechanism."),
      opt("Add more spark.dynamicAllocation.* properties", False, "Still unsupported."),
      opt("Switch to Dedicated", False, "Access mode doesn't control scaling.")]}])
ex("order", 14, 2, ["debug"], "A job is slow and someone says \"add hardware\". Order your bottleneck triage.",
   "C-M-I: check CPU, then memory signals, then I/O, then stragglers — and only then match the fix to the bottleneck.",
   items=["CPU high and tasks balanced? (CPU-bound)", "Spill/GC/OOM high? (memory-bound)", "CPU low while reading? (I/O-bound)", "Few extreme stragglers? (skew)", "Apply the matching fix from the matrix"])
