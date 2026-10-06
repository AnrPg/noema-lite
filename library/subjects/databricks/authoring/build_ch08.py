import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from c78_common import *

CID = "ch08"
b = Builder(CID)
OUT = os.path.dirname(os.path.abspath(__file__))
S = []

# s01 ---------------------------------------------------------------
S.append({"id": "ch08-s01", "title": "The Layered Stack & What 'Runtime' Means",
 "hook": "DBR, Photon, driver type, pool, autoscaling and serverless sit on DIFFERENT layers — the UI just puts them side by side.",
 "blocks": [
  D("""
┌────────────────────────────────────┐
│ YOUR WORKLOAD                      │
│ Python / SQL / Spark / ML/Pipeline │
└─────────────────┬──────────────────┘
                  ▼
EXECUTION ENGINE   Spark JVM and/or Photon
                  ▼
RUNTIME            Databricks Runtime
                   Spark + Python + JVM + libs
                  ▼
COMPUTE NODES      Driver + Worker(s)
              ┌───┴────┐
          Driver type  Worker type
          (VM shape)   (VM shape)
                  ▼
INFRASTRUCTURE     Classic / Serverless""", "Each setting belongs to ONE layer"),
  C("key", "Not alternatives on one level", "DBR, Photon, driver type, worker type, pool, autoscaling, all-purpose and serverless are **not** alternative choices on the same level. Place each on its layer."),
  P("**Runtime in general:** source code is just text. To execute it you need an environment: Python interpreter, JVM, Apache Spark, PySpark, Java/Scala libraries, native and system libraries, configuration and dependency versions."),
  P("That environment is the **runtime environment**."),
  D("""
my_program.py
     ▼
Python 3.12 runtime
├── Python interpreter
├── standard library
└── installed packages""", "A plain Python runtime"),
  R("Think first: the same program moves from Python 3.12 + numpy 2.x to Python 3.8 + numpy 1.20. What can happen?",
    "It may **behave differently or fail**. Code behaviour depends on the runtime it runs in — that's why runtime versions matter."),
  C("analogy", "Recipe vs kitchen", "Your code is the recipe; the runtime is the stocked kitchen (tools, ingredients, versions). The same recipe in a different kitchen can turn out differently."),
 ]})

# s02 ---------------------------------------------------------------
S.append({"id": "ch08-s02", "title": "Databricks Runtime (DBR), Versions & LTS",
 "hook": "DBR is the software stack loaded on every VM — and its version decides which Spark you get.",
 "blocks": [
  P("In Databricks the packaged runtime is the **Databricks Runtime (DBR)**: the set of core components that run on the compute. **Every DBR version includes Apache Spark.**"),
  D("""
VM (CPU, RAM, disk, network)   ← can't run spark.read alone
└── Databricks Runtime
    ├── Apache Spark   ├── JVM
    ├── Python         ├── PySpark
    ├── Scala          ├── Delta Lake integrations
    ├── Databricks optimizations
    ├── built-in libraries
    └── Databricks services/integrations

your code → DBR → VM hardware""", "DBR loaded on top of a bare VM"),
  CMP(("Worker type: m5.4xlarge", ["\"What kind of machine do I want?\"", "NODE TYPE = hardware/infrastructure"]),
      ("Databricks Runtime: 18 LTS", ["\"What software environment goes on those machines?\"", "RUNTIME = software environment"])),
  C("analogy", "Laptop", "Ryzen 9, 32 GB RAM, 1 TB SSD ≈ **worker node type**. Ubuntu + Python + Java + Spark + libraries ≈ **runtime**. (Not exactly an OS, but a good start.)"),
  P("**Why versions?** Spark, Python, Scala, Java, Delta support, Databricks APIs, libraries, security fixes and performance optimizations all evolve. DBR 16 and DBR 19 differ in Spark version, APIs, bug fixes, library versions, optimizer behaviour, Python versions and features."),
  T(["DBR", "Spark"], [["19", "Spark 4.2.0"], ["18 LTS", "Spark 4.1.0"], ["17.3 LTS", "Spark 4.0.0"], ["16.4 LTS", "Spark 3.5.2"], ["15.4 LTS", "Spark 3.5.0"], ["14.3 LTS", "Spark 3.5.0"]], "Versions per the source's release notes snapshot; 19 and all these LTS have ML variants"),
  P("**LTS = Long-Term Support.** For a production chain PostgreSQL → Databricks → bronze → silver → gold → financial reporting you don't want a new runtime / new Spark / new library every few weeks where *something subtly changes*."),
  P("Pinning **DBR 18 LTS** gives a longer support/stability horizon — supported until **June 2029** (per the source)."),
  T(["Use", "Databricks' general advice"], [["All-purpose development", "newest / current runtime"], ["Operational jobs", "consider LTS"], ["Machine learning", "consider DBR ML"]]),
  C("exam", "LTS for production", "Production jobs → LTS DBR; learning/interactive dev → current DBR."),
 ]})

# s03 ---------------------------------------------------------------
S.append({"id": "ch08-s03", "title": "DBR vs DBR ML, and Runtime Beyond Classic",
 "hook": "Classic picks a DBR; serverless, pipelines and warehouses each manage runtime their own way.",
 "blocks": [
  CMP(("Databricks Runtime", ["For Spark, SQL, ETL, data engineering", "e.g. Databricks Runtime 18 LTS"]),
      ("Databricks Runtime for ML", ["Normal DBR + preconfigured ML/DL stack", "e.g. 18 LTS ML: PyTorch, transformers, XGBoost, MLflow, GPU components", "DBR + ML/DL libs + ML integrations + GPU software"])),
  C("pitfall", "DBR ML is not 'better'", "You don't pick DBR ML because it sounds better. For ordinary ETL the normal DBR is usually more appropriate."),
  T(["Use case", "Usual choice"], [
     ["Learning / interactive development", "Current DBR"], ["Production Spark job", "LTS DBR"], ["ML / PyTorch / XGBoost", "DBR ML"],
     ["GPU ML", "DBR ML + GPU node"], ["Legacy application", "DBR version compatible with the application"], ["Serverless", "You do NOT choose a traditional DBR"]], "Beginner's runtime decision table"),
  P("**Serverless:** Databricks explicitly says that for serverless Jobs it **auto-upgrades the runtime** and manages runtime version, instance types, memory and processing engines. So *\"which DBR for my serverless job?\"* is usually the wrong question."),
  P("But **serverless still has a runtime** — you just don't choose the exact traditional DBR. Serverless notebooks have an **Environment** configuration: base environment / **environment version** plus dependencies."),
  D("""
SERVERLESS
├── Databricks-managed underlying runtime
└── user-configurable application environment
    ├── libraries
    ├── dependencies
    └── environment version""", "Serverless runtime model"),
  P("**Lakeflow pipelines** use **runtime channels**: `current` and `preview`. Databricks upgrades the pipeline runtime. Per the source: current ≈ DBR 17.3, preview ≈ DBR 18, rolling out per region."),
  T(["Compute", "Who decides the runtime?"], [["Classic all-purpose / job", "You choose the DBR"], ["Serverless", "Databricks manages DBR/runtime"], ["Lakeflow pipeline", "Pipeline runtime channel (current / preview)"], ["SQL warehouse", "Databricks SQL-managed runtime"]], "The runtime mental map"),
 ]})

# s04 ---------------------------------------------------------------
S.append({"id": "ch08-s04", "title": "Photon: The Vectorized Engine",
 "hook": "Same code, same Catalyst plan — a faster C++ engine executes it underneath.",
 "blocks": [
  P("**Photon** is the Databricks-native **vectorized execution engine**."),
  L(["NOT a runtime version", "NOT a VM", "NOT a replacement of Spark as a programming model", "NOT a database", "NOT a file format"]),
  CODE("python", '(spark.table("orders")\n   .filter("amount > 100")\n   .groupBy("country")\n   .sum("amount"))'),
  F(["DataFrame API", "logical plan", "Catalyst optimizer", "physical plan", "execution"], "Catalyst still plans — Photon doesn't replace it"),
  CMP(("Without Photon", ["Catalyst physical plan", "↓ Spark JVM execution", "↓ CPU"]),
      ("With Photon (supported operators)", ["Catalyst physical plan", "↓ Photon native engine (C++)", "↓ vectorized columnar batches", "↓ CPU / SIMD"])),
  P("**Vectorized:** row-at-a-time loads row 1, calculates, loads row 2… Vectorized processes a whole batch `[100, 200, 300, 400, …]` of `amount * 1.24` at once. CPUs use **SIMD** — *Single Instruction, Multiple Data*. Photon processes batches of **thousands of rows**."),
  P("**No code change:** you still write `df.groupBy(\"country\").sum(\"amount\")` — never `photon.groupBy(...)`. Spark API → Catalyst → Photon."),
  D("""
Scan        → Photon
Filter      → Photon
SomeUnsupportedOperation → Spark/JVM (fallback)
Aggregate""", "Unsupported operator? Fallback, not failure"),
  C("key", "Fallback", "If Photon doesn't support an operator, the query does NOT fail — that part falls back to Spark/JVM. Photon and regular Spark can participate in the same workload."),
  P("The \"other option\" to Photon is simply **Photon OFF → traditional Spark JVM execution**. There is no third general engine."),
 ]})

# s05 ---------------------------------------------------------------
S.append({"id": "ch08-s05", "title": "Photon per Compute, vs GPU, vs Runtime",
 "hook": "Where is Photon on by default, and why it is neither a GPU nor a DBR.",
 "blocks": [
  T(["Compute", "Photon"], [["Serverless compute", "Enabled"], ["SQL warehouse", "Enabled"], ["Serverless Lakeflow pipeline", "Enabled"],
     ["Classic all-purpose", "On by default, configurable"], ["Classic jobs", "On by default, configurable"], ["Classic pipeline", "Configurable via the Photon setting"]], "Photon configuration per compute type"),
  C("pitfall", "Photon ≠ GPU acceleration", "Photon = **CPU-native vectorized SQL/DataFrame engine**. GPU = **hardware accelerator** for deep learning, matrix operations, model training. Classic GPU compute does **not** support Photon."),
  CMP(("Execution engine axis", ["Photon / JVM"]), ("Hardware axis", ["CPU / GPU"])),
  P("**Runtime vs Photon:** `DBR 18 LTS + Photon ON` coexist. DBR = software environment; Photon = query execution engine inside the execution stack."),
  D("""
Your PySpark
   ↓
DBR environment
├── Catalyst planner
└── execution
    ├── Photon
    └── JVM Spark""", "Photon lives INSIDE the runtime's execution layer"),
  C("exam", "Not competitors", "DBR and Photon are not competing options — one compute can use DBR 18 LTS **and** Photon."),
 ]})

# s06 ---------------------------------------------------------------
S.append({"id": "ch08-s06", "title": "The Driver Node & Driver Type",
 "hook": "The driver coordinates — and everything you collect() lands in its RAM.",
 "blocks": [
  D("""
              DRIVER
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
   WORKER    WORKER    WORKER
   executor  executor  executor""", "Classic multi-node Spark compute"),
  P("The **driver** is the coordinator. It holds the **state of attached notebooks**, the **SparkContext**, interprets commands and runs the Spark master/coordinator for the executors."),
  F(["receive notebook command", "build logical plan", "analyze/optimize", "build stages/tasks", "schedule tasks on workers", "monitor execution", "receive results", "send output to notebook"], "What the driver does for display(result)"),
  P("**Driver type** is not a different software. It's **which cloud VM instance type the driver uses** — e.g. AWS `m5.xlarge`, `m5.2xlarge`, `r5.4xlarge` (names differ per cloud)."),
  D("""
distributed rows on workers
   ↓      ↓      ↓
        DRIVER        ← df.collect()
data = 50 GB, driver RAM = 16 GB → driver OOM""", "collect() brings EVERYTHING to the driver"),
  P("Databricks recommends a **larger driver type** when you expect lots of collected data. Other driver-memory stressors: **large plans, too much task metadata, many attached notebook sessions, local Python objects**."),
  C("interview", "\"But I have 640 GB of RAM!\"", "Driver 8 GB, workers 10 × 64 GB = 640 GB. `huge_df.collect()` crashes the driver with OOM. collect() moves data workers → driver, and the driver has only 8 GB. That's why driver type and worker type are separate axes."),
  A("Ask yourself when the driver crashes with OOM", ["Did I call collect() (or toPandas / similar) on a large result?", "How big is the data I'm bringing back vs the driver's RAM?", "Is the driver type much smaller than the workers?", "Are many notebooks attached / large local Python objects living on the driver?", "Do I really need the data on the driver, or can workers finish the job?"]),
 ]})

# s07 ---------------------------------------------------------------
S.append({"id": "ch08-s07", "title": "Workers, Worker Types & Scaling Up vs Out",
 "hook": "Workers do the heavy lifting; the right worker shape depends on the workload's bottleneck.",
 "blocks": [
  D("""
WORKER 1: partition 1, partition 2
WORKER 2: partition 3, partition 4
WORKER 3: partition 5, partition 6""", "Workers do the distributed work"),
  P("On Databricks multi-node classic compute each worker runs a **Spark executor**; docs often use worker/executor almost interchangeably."),
  P("**Worker type** = which cloud VM type each worker uses. 4 workers × (8 cores, 32 GB) = **32 worker cores** and **128 GB aggregate worker RAM** — distributed, not one 128 GB machine."),
  T(["Workload", "Pressure on"], [["CPU-heavy", "CPU → compute-optimized machines"], ["Large join, cache, wide aggregation", "RAM"], ["Huge shuffle", "network, local disk, memory"]], "There is no 'best' worker type — it's workload-dependent"),
  P("**Driver type and worker type can differ** (e.g. driver 16 cores/64 GB, workers 8 cores/32 GB, or the reverse). By **default the driver type = worker type**."),
  CMP(("Scale UP", ["Bigger machine", "worker 8 CPU → 32 CPU", "32 GB → 128 GB"]), ("Scale OUT", ["More machines", "4 workers → 16 workers"])),
  P("Spark is designed mainly for distributed **scale-out**, but node sizing still matters enormously."),
  T(["Spark UI shows", "Consider", "NOT"], [
     ["All workers CPU-saturated, little/no spill, memory OK, huge CPU time", "More workers, larger/CPU-oriented workers, Photon, query optimization", "A bigger driver"],
     ["Massive spill to disk, executor OOMs", "More worker memory, better partitioning, less skew, different join, more/larger workers", "Necessarily a bigger driver"]], "Two classic diagnosis scenarios"),
  C("pitfall", "Upsizing the driver for worker problems", "CPU saturation, spill and executor OOM are **worker-side** bottlenecks. A bigger driver doesn't help."),
 ]})

# s08 ---------------------------------------------------------------
S.append({"id": "ch08-s08", "title": "Autoscaling Across Compute Types",
 "hook": "Four different things are all called 'autoscaling'.",
 "blocks": [
  P("**Classic autoscaling:** worker type 8 CPU/32 GB, **Min workers = 2, Max workers = 10**. Databricks may go 2 → 4 → 8 → 10 → 6 → 2 with load. The **type** of each worker stays; the **number** changes = **horizontal scaling**."),
  P("**Serverless notebooks/jobs:** autoscaling exists but is not a parameter you manage. You submit the workload; Databricks selects, scales, adjusts memory and optimizes. In serverless Jobs, **autoscaling and Photon are automatic**. No `min_workers = 4`, `max_workers = 20`, `worker_type = r5.4xlarge`."),
  C("key", "Is autoscaling a classic-only axis?", "Conceptually autoscaling exists on BOTH. As a **manual configuration axis** (fixed 8 vs autoscale 2–10) it's mainly classic. On serverless, scaling is inherent — no \"Enable autoscaling?\" checkbox."),
  P("**Serverless Lakeflow pipelines** have **horizontal** (more/fewer workers/executors) **and vertical** autoscaling (larger/smaller machine types). E.g. Databricks may see an OOM and use a larger worker/driver instance in the next update. You don't pick the worker type, but you **can set a Max workers upper bound** for cost/capacity."),
  P("**SQL warehouse autoscaling** is about **concurrency**: a Medium warehouse gets more **warehouse clusters** (1 → 2 → 3…) as 10, 50, 100 queries arrive. Serverless warehouses use **Intelligent Workload Management**; you can set min/max cluster counts."),
  T(["Kind", "What scales"], [["Classic Spark autoscaling", "workers"], ["SQL warehouse concurrency scaling", "warehouse clusters"], ["Serverless compute scaling", "managed infrastructure"], ["Serverless pipeline", "horizontal + vertical"]], "Same word, four meanings"),
  C("exam", "Serverless still scales", "\"Is there scaling on serverless?\" Yes — intrinsic and platform-managed, just not a user-selected fixed/autoscaling axis."),
 ]})

# s09 ---------------------------------------------------------------
S.append({"id": "ch08-s09", "title": "All-purpose Is Not Interactive-only",
 "hook": "Interactive by design — not by technical restriction.",
 "blocks": [
  P("All-purpose is designed and recommended for **interactive development, ad-hoc analysis, debugging, exploration** — but you **can** use an existing all-purpose classic compute for certain Job tasks. Databricks supports it but explicitly **does not recommend it for production jobs**."),
  CMP(("All-purpose lifecycle", ["start cluster → Nikos runs → thinks 10 min → runs again", "Maria attaches → Nikos debugs → more notebooks", "lives independently of one task"]),
      ("Jobs compute lifecycle", ["job starts → compute starts", "job executes → job completes", "compute terminates — the operational model"])),
  P("**Why not for production jobs?** Developer A, Developer B, Notebook C and a production job share CPU, RAM, executors, shuffle bandwidth. A random `df.crossJoin(other_huge_df).count()` can hurt production ETL."),
  L(["Different billing model", "Can stay idle (still running)", "Job-specific tuning doesn't always fit a shared interactive cluster", "Less predictable production behaviour"]),
  P("**Limited exceptions:** iterative development/testing of a Job (avoid repeated startup) and **very short, frequent jobs** where an already-running all-purpose cluster cuts startup latency."),
  C("exam", "One-liner", "**all-purpose = interactive by design, not an interactive-only technical restriction.**"),
 ]})

# s10 ---------------------------------------------------------------
S.append({"id": "ch08-s10", "title": "Instance Pools",
 "hook": "A parking lot of warm VMs, so classic clusters start fast.",
 "blocks": [
  P("Full name: **Instance Pool**. NOT a thread pool, connection pool, data pool or Spark executor pool. It's **a reservoir of already-provisioned cloud VM instances** that classic compute can use quickly."),
  CMP(("Without pool", ["start cluster", "Databricks asks AWS for 8 VMs", "AWS provisions VMs → VM boot", "DBR install/start → cluster ready", "can take a while"]),
      ("With pool", ["idle VMs already provisioned/warm", "cluster grabs them", "much faster startup"])),
  P("**Pool settings:** **minimum idle**, **maximum capacity**, **idle instance auto-termination**."),
  P("**Lifecycle:** min idle = 3, max capacity = 20 → initially 3 idle VMs. Cluster A needs 2 → gets 2 idle VMs, pool tries to restore min idle. Cluster B needs 5 more → takes from the pool, or the pool requests new cloud machines."),
  P("**Preloaded DBR:** a pool can have `Preloaded DBR = 18 LTS`, so idle VMs already have the runtime cached → cluster wants DBR 18 → VM ready → very fast startup."),
  D("""
cluster: min 2, max 10   pool: max capacity 20
now: 2 workers → autoscaler: "I need 4 more"
   pool has idle? → give 4 immediately
   otherwise      → pool → cloud → provision more

POOL        = WHERE machines come from
AUTOSCALING = HOW MANY machines compute wants""", "Pools + autoscaling work together"),
  P("**Pools and serverless:** you don't pick a pool on serverless — prewarming, capacity, machine choice and idle infrastructure are Databricks' problem. Current docs recommend **serverless instead of pools** when the workload supports it."),
  C("debug", "Cluster takes 4 minutes to start", "Query performance is excellent once running, but startup is 4 min. More worker RAM won't fix it. A **pool** reduces VM provisioning/runtime startup latency — or better, if compatible, **serverless** removes the provisioning problem entirely."),
 ]})

# s11 ---------------------------------------------------------------
S.append({"id": "ch08-s11", "title": "Termination, Auto Termination & Auto Stop",
 "hook": "Terminating compute is not deleting it — and your Delta tables don't care either way.",
 "blocks": [
  CMP(("Terminate compute", ["running VMs terminated/released", "configuration (name, runtime, worker type, autoscaling, settings) STAYS", "press Start later → new VMs"]),
      ("Delete compute configuration", ["the configuration itself is removed"])),
  CMP(("Lost on termination (ephemeral)", ["executor memory", "cached DataFrames", "shuffle files", "local temporary files", "Python process state", "in-memory variables / session state"]),
      ("Survives termination (persistent)", ["Delta tables in ADLS/S3/GCS", "Unity Catalog metadata", "notebook source code", "job definition"])),
  C("key", "compute lifetime ≠ persistent data lifetime", "Back to the basic principle: clusters come and go; tables and code persist."),
  F(["active", "idle", "30 minutes", "terminate"], "All-purpose auto termination (inactivity-based)"),
  P("**Classic Jobs compute** doesn't wait 30 idle minutes: job starts → compute starts → job completes → compute terminates."),
  T(["Compute", "Termination model"], [["All-purpose", "Auto termination = idle-time based"], ["Jobs compute", "Job-lifecycle based"], ["SQL warehouse", "Auto Stop — default ~10 min serverless, ~45 min Pro/Classic (different minimums)"]]),
  C("tip", "Similar concept, different product setting", "Classic auto termination and SQL warehouse **Auto Stop** are similar lifecycle ideas but separate configurations."),
  A("Ask yourself when compute keeps costing money", ["Is this an all-purpose cluster (it stays up while idle)?", "Is auto termination configured, and to what idle time?", "Is something keeping it 'active' (attached notebook running, a job using it)?", "Is a production job running on all-purpose instead of Jobs compute?", "For SQL warehouses: what's the Auto Stop value?", "Could serverless remove idle infrastructure altogether?"]),
 ]})

# s12 ---------------------------------------------------------------
S.append({"id": "ch08-s12", "title": "SQL Warehouse Access: Two Gates",
 "hook": "Permission to use the compute ≠ permission to read the data.",
 "blocks": [
  CODE("sql", "SELECT *\nFROM prod.finance.payroll;", "Run through a SQL warehouse"),
  D("""
Gate 1: May Nikos use THIS COMPUTE?  → warehouse ACL
Gate 2: May Nikos read THIS TABLE?   → Unity Catalog
        both open → query possible""", "Two separate questions"),
  T(["Permission", "What it allows"], [
     ["CAN VIEW", "see the warehouse / details"], ["CAN MONITOR", "view/monitor (query history, profiles) and run queries"],
     ["CAN USE", "use the warehouse to run queries"], ["CAN MANAGE", "change configuration / permissions"], ["IS OWNER", "ownership / admin-like control"]], "Gate 1 — warehouse ACL (the warehouse is a workspace object)"),
  C("pitfall", "CAN USE ≠ read all data", "Nikos has CAN USE on the warehouse but no SELECT on `prod.finance.payroll` → **permission denied**. CAN USE = you may use this query engine; it does NOT grant every table the engine can reach."),
  P("**Gate 2 — Unity Catalog:** e.g. `USE CATALOG` on `prod`, `USE SCHEMA` on `finance`, `SELECT` on `payroll`. **Warehouse ACL + UC permissions = query possible.**"),
  CODE("sql", "GRANT USE CATALOG ON CATALOG prod TO `nikos@company.com`;\nGRANT USE SCHEMA ON SCHEMA prod.finance TO `nikos@company.com`;\nGRANT SELECT ON TABLE prod.finance.payroll TO `nikos@company.com`;", "Gate 2 grants (UC syntax)"),
  P("**Example:** `analysts` have CAN USE on `analytics-wh` and SELECT on `prod.sales.*` but not `prod.hr.*`. `SELECT * FROM prod.sales.orders` ✅, `SELECT * FROM prod.hr.salary` ❌ — on exactly the same warehouse."),
  P("**CAN MONITOR** fits a power user / performance engineer who needs query history, query profiles and warehouse monitoring without changing size, scaling or permissions."),
  C("exam", "No Standard/Dedicated on warehouses", "SQL warehouses don't use the classic Standard/Dedicated selector. They have warehouse ACL + Unity Catalog governance + their own security architecture. \"Serverless SQL Warehouse + Dedicated access mode\" is not a valid axis."),
  A("Ask yourself when a warehouse query gets PERMISSION_DENIED", ["Can I start/use the warehouse at all (Gate 1: CAN USE or higher)?", "Is the error about the warehouse or about a table/schema/catalog?", "Do I have USE CATALOG on the catalog?", "Do I have USE SCHEMA on the schema?", "Do I have SELECT on the table itself?", "Am I assuming CAN USE grants data access?"]),
 ]})

# s13 ---------------------------------------------------------------
S.append({"id": "ch08-s13", "title": "Pipeline & Serverless Access: Three Layers",
 "hook": "Who may press Start, whose identity runs the pipeline, and what data that identity can touch.",
 "blocks": [
  D("""
Layer 1: Can you access/control the PIPELINE OBJECT?
         → pipeline ACL
Layer 2: Under WHOSE IDENTITY does it execute?
         → run-as (user or service principal)
Layer 3: What DATA can that identity access?
         → Unity Catalog privileges""", "Pipeline access = 3 layers"),
  T(["Permission", "Capabilities"], [["CAN VIEW", "see pipeline / details"], ["CAN RUN", "start/stop a pipeline update"], ["CAN MANAGE", "edit settings + permissions + run"], ["IS OWNER", "owner"]], "Layer 1 — pipeline ACL (workspace object)"),
  P("**Layer 2 — run-as:** Nikos has CAN RUN and presses **Start**. When the pipeline reads `prod.raw.orders`, it uses the **run-as identity**, e.g. `etl-service-principal` — not necessarily Nikos' permissions."),
  P("By default **run-as = the creator**, but it can be changed to another user or a **service principal**. Databricks recommends a **service principal for production**."),
  D("""
Nikos:            CAN RUN pipeline, no SELECT on prod.raw.orders
pipeline-prod-sp: SELECT prod.raw.orders, CREATE TABLE prod.silver
→ Nikos can trigger it (CAN RUN)
→ it executes fine (run-as SP has the data privileges)""", "Same pattern as Jobs"),
  P("**Layer 3 — UC privileges** for the pipeline service principal: `USE CATALOG`, `USE SCHEMA`, `SELECT` on sources, `CREATE TABLE` or `CREATE MATERIALIZED VIEW` on the target schema. Grant **only what's needed**."),
  CODE("sql", "GRANT USE CATALOG ON CATALOG prod TO `pipeline-prod-sp`;\nGRANT USE SCHEMA ON SCHEMA prod.raw TO `pipeline-prod-sp`;\nGRANT SELECT ON TABLE prod.raw.orders TO `pipeline-prod-sp`;\nGRANT USE SCHEMA, CREATE TABLE, CREATE MATERIALIZED VIEW\n  ON SCHEMA prod.silver TO `pipeline-prod-sp`;", "Least-privilege grants for the run-as SP"),
  C("pitfall", "Pipeline permission ≠ output data permission", "Maria has CAN VIEW on the pipeline. That is NOT `SELECT` on `prod.gold.revenue` — the output table is a UC object with its own permissions. To open the backing pipeline from a streaming table/materialized view, non-admins may also need **REFRESH** on that object."),
  P("**Pipeline compute permissions:** a **serverless pipeline** runs on Databricks-managed compute — no cluster, no `CAN ATTACH TO`, no user-managed sizing/configuration/security. A **classic pipeline** has more infra options, but its compute lifecycle is pipeline-managed (you can't freely pin a Spark version; the pipeline runtime manages it)."),
  P("**Serverless access management exists** — just not Standard/Dedicated. Built-in workspace objects: **Default Interactive Compute** (serverless notebooks / Databricks Connect) and **Default Automated Compute** (serverless Jobs / Lakeflow pipelines), with **CAN USE / CAN MANAGE**; admins can restrict which users/groups use serverless."),
  C("key", "Standard/Dedicated is not universal", "It's mainly a classic compute access-mode concept."),
  A("Ask yourself when a pipeline update fails although I could start it", ["Layer 1: do I (still) have CAN RUN / CAN MANAGE — and did the update actually start?", "Layer 2: whose identity does the pipeline run as — me, the creator, or a service principal?", "Layer 3: does THAT identity have USE CATALOG + USE SCHEMA on sources and target?", "Does it have SELECT on every source table?", "Does it have CREATE TABLE / CREATE MATERIALIZED VIEW on the target schema?", "Am I testing with MY permissions instead of the run-as identity's?"]),
 ]})

# s14 ---------------------------------------------------------------
S.append({"id": "ch08-s14", "title": "Putting It Together: Matrices, Start-up & the Full Stack",
 "hook": "Read any configuration field by field and know what happens when you press Start.",
 "blocks": [
  T(["Axis", "Classic All-purpose", "Classic Jobs", "Serverless Notebook", "Serverless Jobs"], [
     ["Purpose", "interactive-oriented", "automated", "interactive", "automated"],
     ["DBR", "you choose", "you choose", "managed", "managed"],
     ["Photon", "configurable", "configurable", "enabled", "enabled"],
     ["Driver type", "you choose", "you choose", "managed", "managed"],
     ["Worker type", "you choose", "you choose", "managed", "managed"],
     ["Fixed workers", "✅", "✅", "❌", "❌"],
     ["Min/max autoscale", "✅", "✅", "❌", "❌"],
     ["Automatic scaling", "optional", "optional", "✅ managed", "✅ managed"],
     ["Pool", "✅", "✅", "❌", "❌"],
     ["Standard/Dedicated", "✅", "✅", "not a selector", "not a selector"],
     ["Auto termination", "configurable", "lifecycle-based", "managed", "lifecycle-based"],
     ["GPU", "possible (classic config)", "possible", "AI Runtime separately", "AI Runtime separately"],
     ["Job use", "supported, discouraged for prod", "intended use", "N/A", "intended use"]], "Spark compute matrix"),
  T(["Axis", "Classic Pipeline", "Serverless Pipeline"], [
     ["Compute ownership", "customer/classic", "Databricks managed"], ["Runtime", "pipeline-managed channel", "pipeline-managed"],
     ["Instance types", "configurable", "managed"], ["Worker autoscaling", "enhanced, configurable", "enhanced automatic"],
     ["Vertical scaling", "limited / manual node choice", "automatic"], ["Photon", "configurable", "enabled"],
     ["Unity Catalog", "supported", "required"], ["Legacy Hive", "possible", "no"], ["Pool / custom cluster settings", "some classic controls", "no"],
     ["Pipeline ACL", "CAN VIEW/RUN/MANAGE/OWNER", "same"], ["Run-as", "user / service principal", "same"]], "Lakeflow pipeline matrix"),
  T(["Parameter", "Serverless SQL WH", "Pro", "Classic"], [
     ["DBR selector", "❌", "❌", "❌"], ["Photon", "✅", "✅", "✅"], ["Warehouse size", "✅", "✅", "✅"], ["Concurrent cluster scaling", "✅", "✅", "✅"],
     ["Intelligent workload management", "✅", "❌", "❌"], ["Predictive IO", "✅", "✅", "❌"], ["Standard/Dedicated", "❌", "❌", "❌"],
     ["Warehouse ACL", "✅", "✅", "✅"], ["Unity Catalog data ACL", "✅", "✅", "✅"], ["Auto Stop", "✅", "✅", "✅"]], "SQL warehouse matrix"),
  CODE("text", "Name: etl-development\nPurpose: All-purpose        → lifecycle/purpose\nInfrastructure: Classic     → infrastructure management\nAccess mode: Standard       → access/security mode\nRuntime: DBR 18 LTS         → software environment\nPhoton: Enabled             → execution engine\nDriver: r6i.2xlarge         → driver hardware\nWorker: r6i.xlarge          → worker hardware\nAutoscaling: min 2, max 8   → horizontal scaling policy\nPool: (optional)            → VM provisioning source", "Reading a complete classic configuration"),
  F(["Need compute", "Driver VM (maybe from pool)", "Min worker VMs", "Start/install DBR 18 LTS", "Start Spark driver", "Start Spark executors", "Photon available", "Spark session ready", "Notebook attaches"], "What happens when you press Start"),
  F(["Notebook", "Driver", "Catalyst", "physical plan", "Photon", "tasks", "workers", "partitions"], "Then df.groupBy(\"country\").sum(\"amount\") runs"),
  D("""
WORKLOAD          SQL / Python / Spark / ML
   ▼
API / PLANNER     Spark Catalyst
   ▼
EXECUTION ENGINE  Photon / Spark JVM
   ▼
RUNTIME           DBR / DBR ML
   ▼
CLASSIC COMPUTE   Driver + Worker node(s)
   ├── Driver type
   └── Worker type → scaling policy

SERVERLESS collapses the bottom half:
managed runtime, Photon, machine types,
scaling, provisioning, lifecycle""", "The full stack"),
  CMP(("Classic", ["You manage/configure the infrastructure envelope."]), ("Serverless", ["You specify the workload; Databricks manages the infrastructure envelope."])),
 ]})

# ------------------------------------------------------------------ EXERCISES
# s01
b.order(1, 1, ["concept"], "Order the layers from TOP (your code) to BOTTOM.",
        ["Your workload (Python/SQL/Spark/ML/Pipeline)", "Execution engine (Spark JVM and/or Photon)", "Runtime (Databricks Runtime)", "Compute nodes (driver + workers, with driver/worker types)", "Infrastructure (classic / serverless)"],
        "Each setting lives on one layer. DBR is software under the engine; driver/worker types are VM shapes; classic/serverless is who runs the infrastructure.", quick=True, cov=["intro"])
b.tf(1, 1, ["concept"], "DBR, Photon, driver type, pool, autoscaling and serverless are alternative choices on the same level.", False,
     "They belong to different layers: engine, runtime, nodes, provisioning, scaling, infrastructure. The UI just shows them side by side.", quick=True, cov=["intro"])
b.mcq(1, 1, ["concept"], "Which is NOT part of a runtime environment?",
      ["Python interpreter", "JVM and Apache Spark", "Dependency versions and configuration", "The rows of your orders table"], 3,
      "A runtime is the software environment the program executes in (interpreter, JVM, Spark, libraries, configs). Your table's rows are data.", cov=["§1"])
b.free(1, 2, ["concept"], "Explain what 'runtime' means and why the same program can behave differently in a different runtime.",
       "A runtime environment is everything the code needs to execute: interpreter, JVM, Spark, libraries, native/system libs, configuration and dependency versions. The source is only text; behaviour depends on the versions in the runtime, so moving from Python 3.12/numpy 2.x to Python 3.8/numpy 1.20 can change results or make the code fail.",
       ["Runtime = execution environment (interpreter, libs, config, versions)", "Code is just text", "Different versions → different behaviour or failure"],
       "Understanding runtime as 'the stocked kitchen' explains why DBR versions and LTS matter.", cov=["§1"])
b.tf(1, 2, ["concept"], "A program written for Python 3.12 + numpy 2.x is guaranteed to run identically on Python 3.8 + numpy 1.20.", False,
     "Different runtime versions can change behaviour or make code fail — the motivation for pinned/LTS runtimes.", cov=["§1"])

# s02
b.mcq(2, 1, ["concept"], "What does every Databricks Runtime version include?",
      ["A GPU driver", "Apache Spark", "Photon is always on", "An instance pool"], 1,
      "DBR is the set of core components on the compute; all DBR versions include Apache Spark. GPU software is in DBR ML; Photon and pools are separate settings.", quick=True, cov=["§2"])
b.tf(2, 1, ["concept", "exam"], "DBR 18 LTS and r5.4xlarge are two versions of the same thing.", False,
     "DBR = software stack; r5.4xlarge = cloud VM/hardware instance type. Runtime ≠ machine. (Final test Q1.)", quick=True, cov=["§3", "T1"])
b.match(2, 1, ["concept"], "Laptop analogy: match the laptop part to its Databricks equivalent.",
        [("Ryzen 9, 32 GB RAM, 1 TB SSD", "Worker node type"), ("Ubuntu + Python + Java + Spark + libraries", "Runtime (DBR)"), ("The program you run", "Your workload / code")],
        "Hardware ≈ node type; installed software stack ≈ runtime. Not exactly an OS, but a good starting analogy.", cov=["§4"])
b.match(2, 2, ["concept"], "Match each DBR to its Spark version (source snapshot).",
        [("19", "Spark 4.2.0"), ("18 LTS", "Spark 4.1.0"), ("17.3 LTS", "Spark 4.0.0"), ("16.4 LTS", "Spark 3.5.2"), ("15.4 LTS", "Spark 3.5.0")],
        "Different DBRs ship different Spark versions — one reason why changing DBR can change behaviour. (14.3 LTS also ships Spark 3.5.0.)", cov=["§5"])
b.mcq(2, 2, ["concept", "exam"], "What does **LTS** give a production pipeline?",
      ["Faster queries", "A longer support/stability horizon so things don't subtly change every few weeks", "GPU support", "Automatic Photon"], 1,
      "LTS = Long-Term Support. For PostgreSQL → bronze → silver → gold → financial reporting you want stability; DBR 18 LTS is supported until June 2029 per the source.", cov=["§6"])
b.bucket(2, 2, ["exam"], "Which runtime does Databricks generally advise?",
         ["Newest / current DBR", "LTS DBR", "DBR ML"],
         [("All-purpose development", 0), ("Learning / interactive work", 0), ("Operational production jobs", 1), ("Nightly financial reporting ETL", 1), ("XGBoost model training", 2), ("PyTorch deep learning", 2)],
         "Dev → current; operational jobs → LTS; ML → DBR ML.", cov=["§6", "§8"])
b.calc(2, 1, ["calc"], "Per the source, until which year is DBR 18 LTS supported?", 2029, "year",
       "June 2029 — that long horizon is why LTS suits production.", cov=["§6"])
b.cloze(2, 1, ["concept"], "Complete.",
        "NODE TYPE = [[hardware|infrastructure|hardware/infrastructure]] configuration, while RUNTIME = [[software]] environment. LTS stands for [[Long-Term Support|long term support]].",
        "Choosing m5.4xlarge answers 'what machine?'; choosing DBR 18 LTS answers 'what software on it?'.", cov=["§3", "§6"])

# s03
b.tf(3, 1, ["pitfall"], "You should use DBR ML for ordinary ETL because it includes more libraries and is therefore better.", False,
     "DBR ML = DBR + ML/DL libraries (PyTorch, transformers, XGBoost, MLflow, GPU components). For ordinary ETL the normal DBR is usually more appropriate.", quick=True, cov=["§7"])
b.match(3, 1, ["concept"], "Match the use case to the usual runtime choice.",
        [("Learning / interactive development", "Current DBR"), ("Production Spark job", "LTS DBR"), ("GPU ML", "DBR ML + GPU node"), ("Legacy application", "DBR compatible with the app"), ("Serverless", "No traditional DBR choice")],
        "The beginner's runtime decision table. The last row is the most important: on serverless you don't choose a DBR.", quick=True, cov=["§8"])
b.mcq(3, 2, ["exam", "pitfall"], "A colleague asks: \"Which DBR should I pin for my serverless job?\" Best answer?",
      ["DBR 18 LTS", "The newest DBR", "Usually the wrong question — Databricks auto-upgrades and manages the runtime on serverless", "DBR ML"], 2,
      "For serverless Jobs, Databricks manages runtime version, instance types, memory and processing engines and upgrades automatically. You don't pin DBR like on classic.", cov=["§9"])
b.tf(3, 2, ["concept"], "Serverless means there is no runtime at all.", False,
     "A runtime exists — the user just doesn't choose the exact traditional DBR. Serverless notebooks expose an Environment (environment version + dependencies) on top of a Databricks-managed runtime.", cov=["§10"])
b.bucket(3, 2, ["compare"], "Who decides the runtime?",
         ["You choose a DBR", "Databricks manages", "Pipeline runtime channel"],
         [("Classic all-purpose", 0), ("Classic jobs", 0), ("Serverless Jobs", 1), ("SQL warehouse (Databricks SQL runtime)", 1), ("Lakeflow pipeline (current/preview)", 2)],
         "Classic → you pick DBR; serverless & warehouses → managed; pipelines → current/preview channels upgraded by Databricks.", cov=["§11", "mentalmap"])
b.cloze(3, 2, ["concept"], "Complete the pipeline runtime facts.",
        "Lakeflow pipelines use runtime [[channels]]: [[current]] and [[preview]]. Per the source, current is based on DBR [[17.3]] and preview on DBR [[18]].",
        "You don't pick 'DBR 18.0' for a pipeline like on an all-purpose cluster; Databricks upgrades the pipeline runtime with a rolling per-region rollout.", bank=["LTS", "stable", "19"], cov=["§11"])
b.mcq(3, 2, ["concept"], "What can you configure on a **serverless notebook's** Environment panel?",
      ["The exact DBR version", "Base environment / environment version and dependencies", "Worker instance type", "Access mode"], 1,
      "Serverless gives a user-configurable application environment (libraries, dependencies, environment version) on top of a Databricks-managed runtime.", cov=["§10"])

# s04
b.odd(4, 1, ["concept"], "Photon is a vectorized execution engine. Which statement about it is TRUE (the odd one out among the false ones)?",
      ["Photon is a runtime version", "Photon is a VM type", "Photon executes supported operators natively in C++", "Photon is a file format"], 2,
      "Photon is not a runtime version, VM, database, file format or Spark-replacing programming model. It executes supported physical-plan operators natively in C++ on columnar batches.", quick=True, cov=["§12"])
b.tf(4, 1, ["exam"], "When Photon is used, it replaces the Catalyst optimizer.", False,
     "Catalyst still plans and optimizes. Photon takes over execution of supported operators. (Final test Q5.)", quick=True, cov=["§13", "T5"])
b.order(4, 2, ["concept"], "Order the path of a DataFrame query with Photon ON.",
        ["DataFrame API", "Logical plan", "Catalyst optimizer", "Physical plan", "Photon native engine (C++)", "Vectorized batches on CPU/SIMD"],
        "Photon only enters after the physical plan; it replaces the JVM execution layer for supported operations.", cov=["§13"])
b.mcq(4, 2, ["concept"], "What does SIMD stand for, and why does Photon care?",
      ["Single Instruction, Multiple Data — process many values per instruction on batches", "Spark In-Memory Distribution — caching", "Serverless Instance Management Daemon", "Sequential Instruction, Many Disks"], 0,
      "Vectorized engines process batches (thousands of rows) and modern CPUs apply one instruction to many values at once.", cov=["§14"])
b.tf(4, 1, ["concept"], "To use Photon you must rewrite code as `photon.groupBy(...)`.", False,
     "No code change: the same DataFrame/SQL code goes Spark API → Catalyst → Photon.", cov=["§15"])
b.mcq(4, 2, ["exam", "pitfall"], "A physical plan contains an operator Photon doesn't support. What happens?",
      ["The whole query fails", "That part falls back to Spark/JVM execution", "Databricks switches to GPU", "The cluster restarts without Photon"], 1,
      "Photon and regular Spark/JVM execution can participate in the same workload — unsupported operations fall back.", cov=["§16", "T4"])
b.mcq(4, 1, ["concept"], "What is the alternative when Photon is OFF or unsupported?",
      ["X-engine", "Traditional Spark/JVM execution", "Pandas", "SQL warehouse"], 1,
      "The main comparison is Spark traditional JVM execution vs Photon native execution. There's no third general engine. (Final test Q4.)", cov=["§17", "T4"])
b.calc(4, 1, ["calc"], "The vectorized example computes `amount * 1.24`. For amount = 300, what's the result?", 372, "",
       "300 × 1.24 = 372. Row-at-a-time loads and computes each row; vectorized applies the multiplication to a whole batch at once.", tolerance=0.01, cov=["§14"])

# s05
b.bucket(5, 1, ["concept"], "Photon: always on, or configurable?",
         ["Enabled (managed)", "On by default / configurable"],
         [("Serverless compute", 0), ("SQL warehouse", 0), ("Serverless Lakeflow pipeline", 0), ("Classic all-purpose", 1), ("Classic jobs", 1), ("Classic pipeline", 1)],
         "Serverless and warehouses: enabled. Classic all-purpose/jobs/pipelines: toggled via the Photon setting.", quick=True, cov=["§18"])
b.tf(5, 1, ["pitfall", "exam"], "Photon = GPU acceleration.", False,
     "Photon is a CPU-native vectorized SQL/DataFrame engine. GPU is a hardware accelerator for deep learning/matrix ops/training. Classic GPU compute doesn't even support Photon.", quick=True, cov=["§19"])
b.tf(5, 1, ["exam"], "A compute can use DBR 18 LTS and Photon at the same time.", True,
     "DBR = software environment; Photon = execution engine inside it. Not competing options. (Final test Q2.)", cov=["§20", "T2"])
b.match(5, 2, ["concept"], "Match each term to its axis.",
        [("Photon / JVM", "Execution engine"), ("CPU / GPU", "Hardware"), ("DBR 18 LTS", "Software environment"), ("Catalyst", "Planner")],
        "Keeping axes apart prevents 'Photon = GPU' and 'DBR vs Photon' confusions.", cov=["§19", "§20"])
b.free(5, 2, ["interview"], "Interview: \"What is Photon and how does it relate to DBR?\"",
       "Photon is Databricks' native C++ vectorized execution engine for supported Spark SQL/DataFrame operations. Catalyst still plans the query; Photon executes supported operators on columnar batches using SIMD, falling back to JVM Spark for unsupported ones. It lives inside the DBR's execution layer — DBR is the software environment, Photon the engine — so a compute can run DBR 18 LTS with Photon on. It needs no code changes and is not GPU acceleration.",
       ["Native C++ vectorized engine", "Catalyst still plans", "Fallback to JVM", "Inside DBR — not competing", "No code change; not GPU"],
       "A complete answer separates engine, planner, runtime and hardware.", cov=["§12", "§20", "T3"])
b.spotbug(5, 2, ["pitfall"], "Which line in this classic compute plan is invalid?",
          ["Purpose: All-purpose", "Hardware: GPU (deep learning)", "Runtime: DBR 18 LTS ML", "Photon: Enabled", "Access: Dedicated"], [3],
          "Photon: Disabled (not supported on classic GPU compute)",
          "Classic GPU compute doesn't support Photon. Everything else is a sensible DL configuration.", cov=["§19"])

# s06
b.mcq(6, 1, ["concept"], "What is the driver's role?",
      ["Stores the Delta files", "Coordinator: holds notebook state & SparkContext, builds plans/tasks, schedules them on workers", "Runs only the Photon engine", "Is a backup worker"], 1,
      "The driver interprets commands, plans, builds stages/tasks, schedules and monitors them, and returns results to the notebook. Workers do the bulk distributed processing.", quick=True, cov=["§21", "§22"])
b.calc(6, 2, ["calc"], "Driver 8 GB, workers 10 × 64 GB. What's the total **worker** RAM (GB)?", 640, "GB",
       "10 × 64 = 640 GB — but collect() needs the result to fit in the 8 GB driver, not in 640 GB.", quick=True, cov=["§70"])
b.tf(6, 2, ["exam", "pitfall"], "With 20 workers × 64 GB and an 8 GB driver, you can safely `collect()` a 100 GB result.", False,
     "collect() gathers the result on the driver, which has 8 GB → driver OOM. (Final test Q8.)", cov=["§24", "T8"])
b.order(6, 2, ["concept"], "Order what the driver does for `display(result)`.",
        ["Receive the notebook command", "Build the logical plan", "Analyze/optimize the plan", "Construct stages/tasks", "Schedule tasks on workers", "Monitor execution", "Send output to the notebook"],
        "Plan → tasks → schedule → monitor → return. The driver coordinates; workers execute.", cov=["§22"])
b.mcq(6, 1, ["concept"], "What is **driver type**?",
      ["A different Spark software for the driver", "The cloud VM instance type used for the driver (e.g. m5.2xlarge)", "Standard vs Dedicated", "Python vs Scala driver"], 1,
      "Driver type = VM shape of the Spark driver/coordinator. Names differ per cloud. (Final test Q7.)", cov=["§23", "T7"])
b.mcq(6, 2, ["concept"], "Which is NOT listed as a driver-memory stressor?",
      ["Large collect() results", "Large plans / too much task metadata", "Many attached notebook sessions and local Python objects", "Many partitions spilled by executors to local disk"], 3,
      "Executor spill is a worker-side issue. Driver stressors: collected data, large plans, task metadata, many sessions, local Python objects.", cov=["§24"])
b.spotbug(6, 2, ["debug", "pitfall"], "Driver: 8 GB. Workers: 10 × 64 GB. Which line will most likely crash the driver?",
          ["huge_df = spark.table(\"prod.sales.events\")", "agg = huge_df.groupBy(\"country\").count()", "rows = huge_df.collect()", "display(agg)"], [2],
          "display(agg)  # or aggregate/write on workers instead of collecting the huge DataFrame",
          "collect() moves every row from the workers to the 8 GB driver. The aggregation runs distributed and returns a small result.", cov=["§24", "§70"])
b.scenario(6, 2, ["debug", "interview"], "A junior says: \"The driver crashed with OOM on `huge_df.collect()`, but we have 640 GB of RAM!\" (driver 8 GB, 10 × 64 GB workers)",
  [("What's the flaw in the reasoning?", [
      ("collect() brings data to the driver, which has only 8 GB; worker RAM doesn't help", True, "Exactly — driver and worker RAM are different axes."),
      ("The workers must be too small", False, "640 GB of worker RAM is irrelevant to what lands on the driver."),
      ("Photon should have been off", False, "Photon has nothing to do with driver memory for collect()."),
   ]),
   ("If the team truly needs lots of data on the driver, which setting changes?", [
      ("A larger driver type", True, "Databricks recommends a larger driver when you expect much collected data."),
      ("More workers", False, "Scale-out adds worker RAM, not driver RAM."),
      ("An instance pool", False, "Pools speed up provisioning, not memory."),
   ])],
  "Driver type and worker type are separate parameters for a reason. Avoid collecting big data; if unavoidable, size the driver.", cov=["§70", "§24"])

# s07
b.calc(7, 1, ["calc"], "4 workers, each 8 cores / 32 GB. Total worker CPU cores?", 32, "cores",
       "4 × 8 = 32 worker cores.", quick=True, cov=["§26"])
b.calc(7, 1, ["calc"], "Same cluster: aggregate worker RAM in GB?", 128, "GB",
       "4 × 32 = 128 GB — distributed across 4 machines, not one 128 GB box.", cov=["§26"])
b.tf(7, 1, ["concept"], "4 workers × 32 GB behave like a single 128 GB machine.", False,
     "The memory is aggregate but distributed; each executor still has only its own node's RAM.", cov=["§26"])
b.bucket(7, 2, ["concept"], "Which resource is the workload most likely to pressure?",
         ["CPU", "RAM", "Network / local disk"],
         [("CPU-heavy transformations", 0), ("Large join", 1), ("Caching a big DataFrame", 1), ("Wide aggregation", 1), ("Huge shuffle", 2)],
         "Different node families give different CPU/RAM/disk/network ratios; there's no best worker type — it's workload-dependent. (A huge shuffle also pressures memory.)", cov=["§27"])
b.tf(7, 1, ["concept"], "By default, the driver type is the same as the worker type, but they can differ.", True,
     "Driver and worker type are two separate classic parameters; default is the same VM shape.", quick=True, cov=["§28"])
b.match(7, 2, ["compare"], "Scale up or scale out?",
        [("Worker 8 CPU → 32 CPU", "Scale up"), ("4 workers → 16 workers", "Scale out"), ("Spark's primary design", "Distributed scale-out"), ("Autoscaling min/max workers", "Horizontal scaling")],
        "Scale up = bigger machines; scale out = more machines. Spark favours scale-out but node sizing still matters.", cov=["§29", "§30"])
b.scenario(7, 2, ["debug"], "Spark UI: all workers CPU-saturated, little/no spill, memory OK, huge CPU processing time.",
  [("What's the bottleneck?", [
      ("Worker CPU", True, "Saturated workers with healthy memory = CPU-bound."),
      ("The driver", False, "Nothing points to the driver."),
      ("Network shuffle", False, "No spill or shuffle symptoms are described."),
   ]),
   ("Which option is NOT a good response?", [
      ("Get a bigger driver", True, "Correct to reject — the driver isn't the bottleneck."),
      ("More workers or larger/CPU-oriented workers", False, "That's a valid response, so it's not the 'NOT good' option."),
      ("Enable Photon / optimize the query", False, "Also valid for CPU-heavy SQL/DataFrame work."),
   ])],
  "Match the fix to the layer: worker CPU problems → more/stronger workers, Photon, query optimization — never 'bigger driver' by reflex.", cov=["§71"])
b.mcq(7, 2, ["debug", "pitfall"], "Spark UI shows massive spill to disk and executor OOMs. Which response is LEAST relevant?",
      ["More worker memory / larger workers", "Better partitioning, less skew, different join", "More workers", "A bigger driver"], 3,
      "Spill and executor OOM are worker-side. Driver size isn't necessarily the answer.", cov=["§72"])
b.order(7, 2, ["debug"], "Order your reasoning when Spark UI shows a performance problem.",
        ["Read the symptom in Spark UI (CPU? spill? executor OOM?)", "Decide which layer is the bottleneck (driver vs workers)", "Pick the fix for that layer (workers/memory/partitioning/Photon/query)", "Only upsize the driver if the driver is the bottleneck (e.g. collect)"],
        "Symptom → layer → targeted fix. 'Bigger driver' is a reflex that rarely helps worker bottlenecks.", cov=["§71", "§72"])

# s08
b.calc(8, 2, ["calc"], "Classic cluster min 2 / max 10, currently 2 workers. Autoscaler wants 4 more. How many workers after scaling?", 6, "workers",
       "2 + 4 = 6, within the 2–10 bounds. The worker type stays the same; only the count changes.", quick=True, cov=["§30", "§43"])
b.tf(8, 1, ["exam", "pitfall"], "Autoscaling means serverless.", False,
     "Classic clusters can autoscale between min and max. (Final test Q9.)", quick=True, cov=["§32", "T9"])
b.mcq(8, 2, ["exam"], "Can you set min=2 / max=20 workers on an ordinary **serverless Job**?",
      ["Yes, under Advanced", "No — not with the classic cluster model; Databricks manages scaling/resources automatically", "Only with Dedicated access", "Only with Photon off"], 1,
      "Serverless Jobs have autoscaling and Photon automatically, but no classic min/max worker settings. (Final test Q10.)", cov=["§31", "T10"])
b.tf(8, 1, ["exam"], "Serverless compute has no scaling at all.", False,
     "Scaling is intrinsic/platform-managed on serverless — just not a user-selected fixed/autoscaling axis. (Final test Q11.)", cov=["§32", "T11"])
b.match(8, 2, ["compare"], "Match each autoscaling kind to what it scales.",
        [("Classic Spark autoscaling", "Number of workers"), ("SQL warehouse scaling", "Number of warehouse clusters (concurrency)"), ("Serverless compute", "Managed infrastructure"), ("Serverless pipeline", "Horizontal + vertical (machine size)")],
        "Same word, four meanings. Don't mix 'warehouse clusters for concurrency' with 'Spark workers 2–10'.", cov=["§34", "§33"])
b.mcq(8, 2, ["exam"], "Serverless Lakeflow pipeline: what can you still set regarding scaling?",
      ["Worker instance type", "A Max workers upper bound for cost/capacity", "Min/max driver size", "Nothing — and it can't scale"], 1,
      "Databricks does horizontal + vertical autoscaling (e.g. after OOM, a bigger instance next update). You may cap Max workers, but you don't do the full classic worker configuration. (Final test Q22–23.)", cov=["§33", "T22", "T23"])
b.tf(8, 2, ["exam"], "Serverless pipelines can scale vertically: after an OOM Databricks may pick a larger worker/driver instance for the next update.", True,
     "Vertical autoscaling = larger/smaller machine types, chosen automatically by Databricks.", cov=["§33", "T23"])
b.cloze(8, 2, ["concept"], "Complete.",
        "Classic autoscaling is [[horizontal]] scaling: the [[number|count]] of workers changes, the worker [[type]] stays. A SQL warehouse scales the number of warehouse [[clusters]] for concurrency; serverless SQL warehouses use [[Intelligent Workload Management|IWM]].",
        "Know which thing each 'autoscaling' changes.", bank=["vertical", "driver", "Photon"], cov=["§30", "§34"])

# s09
b.tf(9, 1, ["exam", "pitfall"], "All-purpose compute is technically restricted to notebooks.", False,
     "It can be used by Jobs in supported cases, but Databricks doesn't recommend it for production jobs. Interactive by design, not by restriction. (Final test Q15.)", quick=True, cov=["§35", "T15"])
b.mcq(9, 2, ["exam"], "Which reasons explain why all-purpose isn't recommended for production jobs? (choose all)",
      ["Different billing model", "Resource contention with other users", "Can stay idle while running", "Less predictable production behaviour", "It cannot read Unity Catalog tables"], [0, 1, 2, 3],
      "Billing, contention, idle lifecycle and predictability (Final test Q16). Reading UC tables is not the issue.", quick=True, cov=["§37", "T16"])
b.bucket(9, 2, ["exam"], "Is using all-purpose for a job reasonable here?",
         ["Reasonable exception", "Not recommended"],
         [("Iterative development/testing of a job", 0), ("Very short, very frequent jobs where startup latency hurts", 0), ("Nightly production revenue ETL", 1), ("Monthly finance close pipeline", 1), ("Production job on the team's shared dev cluster", 1)],
         "Databricks lists limited exceptions: iterative job dev/testing (avoid repeated startup) and very short frequent jobs. Production → jobs compute.", cov=["§38"])
b.free(9, 2, ["interview"], "\"Isn't all-purpose restricted to interactive mode?\" Answer like in an interview.",
       "No. All-purpose is interactive by design — it lives independently of tasks while people attach notebooks, think, rerun and debug — but it's not a technical restriction. Jobs can run on existing all-purpose compute in supported cases. Databricks discourages it for production because of billing, resource contention (a developer's crossJoin can hurt prod ETL), idle lifecycle and unpredictability. Exceptions: iterative job testing and very short frequent jobs where startup latency matters.",
       ["Not a technical restriction", "Supported but discouraged for production", "Reasons: billing, contention, idle, predictability", "Exceptions: iterative testing, short frequent jobs"],
       "The key phrase is 'interactive by design, not interactive-only'.", cov=["§35", "§36", "§37", "§38"])
b.mcq(9, 1, ["concept"], "Which code line in a developer's notebook is the source's example of something that can hurt a production job sharing the cluster?",
      ["df.limit(10).show()", "df.crossJoin(other_huge_df).count()", "spark.sql(\"SELECT 1\")", "dbutils.fs.ls(\"/\")"], 1,
      "A huge cross join eats shared CPU, RAM, executors and shuffle bandwidth — exactly why shared all-purpose is risky for production.", cov=["§37"])

# s10
b.mcq(10, 1, ["concept"], "What is an **instance pool**?",
      ["A thread pool in the driver", "A reservoir of already-provisioned cloud VMs that classic compute can grab quickly", "A pool of Spark executors shared across clusters", "A connection pool to SQL warehouses"], 1,
      "Pools are about VM provisioning speed. Not thread, connection, data or executor pools. (Final test Q12.)", quick=True, cov=["§39", "T12"])
b.tf(10, 1, ["exam", "pitfall"], "Pools and autoscaling are the same thing.", False,
     "Autoscaling decides HOW MANY nodes the cluster wants; the pool decides WHERE they come from (and provides them faster). (Final test Q13.)", quick=True, cov=["§43", "T13"])
b.calc(10, 2, ["calc"], "Pool: minimum idle = 3, max capacity = 20. Cluster A takes 2 idle VMs. How many idle VMs remain immediately, before the pool replenishes?", 1, "VMs",
       "3 − 2 = 1. Then the pool tries to restore its minimum idle capacity back to 3.", cov=["§41"])
b.order(10, 2, ["concept"], "Order cluster startup WITHOUT a pool.",
        ["User starts cluster", "Databricks asks the cloud for VMs", "Cloud provisions VMs", "VMs boot", "DBR install/start", "Cluster ready"],
        "Every step costs time; pools skip provisioning/boot (and preloaded DBR skips runtime loading).", cov=["§40"])
b.match(10, 2, ["concept"], "Match each pool setting/feature to its effect.",
        [("Minimum idle", "How many warm VMs the pool tries to keep ready"), ("Maximum capacity", "Upper limit on instances in the pool"), ("Idle instance auto-termination", "Releases idle VMs after a while"), ("Preloaded DBR", "Runtime already cached on idle VMs")],
        "These are the pool settings Databricks defines; preloaded DBR makes startup very fast.", cov=["§41", "§42"])
b.tf(10, 1, ["exam"], "On serverless you choose an instance pool to speed up startup.", False,
     "No pools on serverless — prewarming and capacity are Databricks' problem. Docs recommend serverless instead of pools when supported.", cov=["§44"])
b.scenario(10, 2, ["debug"], "Queries are excellent once the classic cluster is running, but every start takes ~4 minutes and users complain.",
  [("What do you suspect?", [
      ("VM provisioning + runtime startup latency", True, "Startup, not query performance, is the problem."),
      ("Too little worker RAM", False, "Query performance is already excellent — RAM isn't it."),
      ("Missing SELECT privileges", False, "Permissions would cause errors, not slow startup."),
   ]),
   ("Which classic option reduces it?", [
      ("An instance pool (ideally with preloaded DBR)", True, "Warm VMs + cached runtime = fast launch."),
      ("Bigger worker type", False, "Bigger VMs don't provision faster."),
      ("Photon", False, "Photon speeds execution, not startup."),
   ]),
   ("And the even better option if the workload is compatible?", [
      ("Serverless", True, "You stop managing the provisioning problem at all."),
      ("Dedicated access mode", False, "Access mode doesn't affect startup."),
      ("DBR ML", False, "A heavier runtime doesn't help startup."),
   ])],
  "Slow start ≠ slow queries. Pools (with preloaded DBR) or serverless attack provisioning latency.", cov=["§73", "§40", "§42"])
b.order(10, 2, ["debug"], "Order the 'cluster slow to start' playbook.",
        ["Is the slowness at startup or during queries?", "Is this classic compute provisioning VMs from the cloud each time?", "Could a pool with preloaded DBR serve warm VMs?", "Is the workload serverless-compatible, so provisioning disappears entirely?"],
        "Separate startup from runtime performance first; then pool, then serverless.", cov=["§73"])
b.cloze(10, 1, ["concept"], "Complete the slogan.",
        "POOL = [[where]] machines come from. AUTOSCALING = how [[many]] machines the compute currently wants.",
        "Two independent concepts that cooperate: the autoscaler asks, the pool serves (or asks the cloud).", cov=["§43"])

# s11
b.bucket(11, 1, ["concept"], "Lost or kept when an all-purpose cluster terminates?",
         ["Lost (ephemeral)", "Kept (persistent)"],
         [("Cached DataFrames", 0), ("Python variables / session state", 0), ("Shuffle & local temp files", 0), ("Delta table in S3/ADLS/GCS", 1), ("Unity Catalog metadata", 1), ("Notebook source code", 1), ("Compute configuration (runtime, worker type…)", 1)],
         "Compute lifetime ≠ persistent data lifetime. Termination releases VMs and ephemeral state; config, tables, metadata, code and job definitions stay. (Final test Q14.)", quick=True, cov=["§45", "§46", "T14"])
b.tf(11, 1, ["concept"], "Terminating a classic all-purpose compute deletes its configuration.", False,
     "Terminate ≠ delete. VMs are released; name, runtime, worker type, autoscaling and settings remain, and you can press Start later.", quick=True, cov=["§45"])
b.match(11, 2, ["compare"], "Match compute to its termination model.",
        [("All-purpose", "Idle-time based auto termination"), ("Classic Jobs compute", "Job-lifecycle based"), ("SQL warehouse", "Auto Stop"), ("Serverless notebook", "Managed by Databricks")],
        "Similar lifecycle ideas, different product settings.", cov=["§47", "§48", "§49"])
b.calc(11, 1, ["calc"], "Typical default Auto Stop for a **Serverless** SQL warehouse (minutes)?", 10, "min",
       "~10 min for serverless vs ~45 min for Pro/Classic, with different minimums.", cov=["§49"])
b.calc(11, 1, ["calc"], "Typical default Auto Stop for a **Pro/Classic** SQL warehouse (minutes)?", 45, "min",
       "45 min by default — 4.5× the serverless default, a cost difference worth knowing.", cov=["§49"])
b.scenario(11, 2, ["debug"], "Finance asks why the dev cluster `etl-development` cost money all weekend although nobody worked.",
  [("First question?", [
      ("Is it an all-purpose cluster and is auto termination configured?", True, "All-purpose stays up while idle unless auto termination stops it."),
      ("Did the Delta tables grow?", False, "Storage isn't what keeps a cluster billing."),
      ("Is Photon on?", False, "Photon doesn't keep a cluster alive."),
   ]),
   ("Auto termination is OFF. What else could keep it busy even if ON?", [
      ("A scheduled job or running notebook attached to it", True, "Activity resets the idle timer — e.g. a job wrongly pointed at all-purpose."),
      ("The cluster's DBR is LTS", False, "Runtime choice doesn't affect idleness."),
      ("Unity Catalog grants", False, "Permissions don't keep compute alive."),
   ]),
   ("Best fix?", [
      ("Enable auto termination (e.g. 30 min) and move scheduled work to Jobs compute", True, "Idle-based termination for interactive; lifecycle-based compute for jobs."),
      ("Delete the cluster configuration every Friday", False, "Terminate ≠ delete; you'd lose the config for nothing."),
      ("Switch to DBR ML", False, "Irrelevant to cost from idleness."),
   ])],
  "All-purpose = idle-time based termination; jobs compute = lifecycle based. Configure the former, use the latter for scheduled work.", cov=["§47", "§48"])
b.order(11, 1, ["concept"], "Order all-purpose auto termination.",
        ["Active (commands running)", "Idle (no commands)", "Configured idle time passes (e.g. 30 min)", "Terminate"],
        "Inactivity-based automatic termination is a classic compute configuration.", cov=["§47"])
b.scenario(11, 2, ["debug"], "After the cluster auto-terminated over lunch, Nikos re-runs a cell and gets `NameError: name 'orders_df' is not defined`. He's worried the orders table is gone.",
  [("What happened?", [
      ("Termination wiped ephemeral session state (variables, cached DataFrames); the table is fine", True, "Python state lives on compute; Delta tables live in cloud storage."),
      ("The Delta table was deleted with the cluster", False, "Compute lifetime ≠ persistent data lifetime."),
      ("Unity Catalog revoked his SELECT", False, "That would be a permission error, not NameError."),
   ]),
   ("What should he do?", [
      ("Restart/attach and re-run the cells that define orders_df (re-read the table)", True, "Recreate ephemeral state from persistent data."),
      ("Restore the table with time travel", False, "Nothing happened to the table."),
      ("Ask an admin to recover the cluster's RAM", False, "Ephemeral memory is gone by design."),
   ])],
  "What dies with compute: memory, caches, shuffle/temp files, Python state. What survives: tables, UC metadata, notebooks, job definitions.", cov=["§46"])

# s12
b.tf(12, 1, ["exam", "pitfall"], "CAN USE on a SQL warehouse = SELECT on all tables.", False,
     "CAN USE is a permission on the compute only. Unity Catalog data privileges are separate. (Final test Q17.)", quick=True, cov=["§52", "T17"])
b.match(12, 1, ["concept"], "Match the warehouse ACL level to what it allows.",
        [("CAN VIEW", "See the warehouse / details"), ("CAN USE", "Run queries on it"), ("CAN MONITOR", "Query history/profiles/monitoring + run queries"), ("CAN MANAGE", "Change configuration and permissions"), ("IS OWNER", "Ownership / admin-like control")],
        "Gate 1 levels. None of them grants table data — that's Gate 2 (UC).", quick=True, cov=["§51"])
b.scenario(12, 2, ["debug"], "Nikos runs `SELECT * FROM prod.finance.payroll;` on `analytics-wh` and gets PERMISSION_DENIED. He insists: \"But I have CAN USE on the warehouse!\"",
  [("Which gate is failing?", [
      ("Gate 2 — Unity Catalog data privileges", True, "He could submit the query, so Gate 1 (warehouse) is open."),
      ("Gate 1 — the warehouse ACL", False, "With CAN USE he can use the warehouse; the denial is about data."),
      ("Neither — the warehouse is too small", False, "Size never produces PERMISSION_DENIED."),
   ]),
   ("Which privileges must he have on the data path?", [
      ("USE CATALOG on prod, USE SCHEMA on prod.finance, SELECT on payroll", True, "All three are needed for the query."),
      ("CAN MANAGE on the warehouse", False, "More warehouse power doesn't grant data."),
      ("Only SELECT on payroll", False, "He also needs USE CATALOG and USE SCHEMA on the parents."),
   ]),
   ("Who should fix it?", [
      ("The data owner / UC admin grants the UC privileges (if appropriate)", True, "Data access is governed in Unity Catalog."),
      ("The warehouse owner gives him IS OWNER", False, "Ownership of compute doesn't open data."),
      ("Switch to a Dedicated warehouse", False, "Warehouses have no Dedicated mode."),
   ])],
  "Warehouse ACL + Unity Catalog permissions = query possible. Permission to use compute ≠ permission to use data.", cov=["§50", "§52", "§53"])
b.order(12, 2, ["debug"], "Order the checks for PERMISSION_DENIED on a SQL warehouse query.",
        ["Gate 1: can I use the warehouse (CAN USE+)?", "Is the error about the warehouse or a data object?", "USE CATALOG on the catalog?", "USE SCHEMA on the schema?", "SELECT on the table?"],
        "Compute gate first, then the UC path top-down: catalog → schema → table.", cov=["§50", "§53"])
b.write(12, 2, ["syntax"], "Write the Unity Catalog grants so `nikos@company.com` can run `SELECT * FROM prod.finance.payroll` (he already has CAN USE on the warehouse).",
        "GRANT USE CATALOG ON CATALOG prod TO `nikos@company.com`;\nGRANT USE SCHEMA ON SCHEMA prod.finance TO `nikos@company.com`;\nGRANT SELECT ON TABLE prod.finance.payroll TO `nikos@company.com`;",
        ["use catalog", "on catalog prod", "use schema", "on schema prod.finance", "grant select", "prod.finance.payroll"], "sql",
        "Gate 2 needs all three: USE CATALOG and USE SCHEMA on the parents plus SELECT on the table. No warehouse permission can replace these.", cov=["§53"])
b.mcq(12, 2, ["exam"], "`analysts` have CAN USE on `analytics-wh` and SELECT on `prod.sales.*` only. Which query succeeds?",
      ["SELECT * FROM prod.hr.salary", "SELECT * FROM prod.sales.orders", "Both — same warehouse", "Neither — they need CAN MANAGE"], 1,
      "Same warehouse, different data permissions: sales ✅, hr ❌.", cov=["§54"])
b.mcq(12, 2, ["exam"], "A performance engineer needs query history, query profiles and warehouse monitoring, but must NOT change size, scaling or permissions. Which level?",
      ["CAN VIEW", "CAN MONITOR", "CAN MANAGE", "IS OWNER"], 1,
      "CAN MONITOR allows running queries plus monitoring/query-profile capabilities, without configuration rights.", cov=["§55"])
b.spotbug(12, 2, ["pitfall", "exam"], "Which line of this warehouse request is invalid?",
          ["Warehouse type: Serverless SQL", "Size: Medium", "Scaling: min 1, max 3 clusters", "Access mode: Dedicated", "Permissions: analysts CAN USE"], [3],
          "Remove 'Access mode' — use warehouse ACL + Unity Catalog grants instead.",
          "SQL warehouses don't have the Standard/Dedicated selector; access is warehouse ACL + UC governance. (Final test Q21.)", cov=["§56", "T21"])
b.tf(12, 1, ["exam"], "Serverless SQL Warehouse + Dedicated access mode is a valid combination.", False,
     "Not a valid axis — warehouses have their own warehouse ACL + UC security model. (Final test Q21.)", cov=["§56", "T21"])

# s13
b.order(13, 1, ["concept"], "Order the three layers of pipeline access.",
        ["Pipeline ACL — can you access/control the pipeline object?", "Run-as identity — whose identity executes the pipeline?", "Unity Catalog privileges — what data can that identity access?"],
        "Object → identity → data. Mnemonic: **ORD** (Object, Run-as, Data).", quick=True, cov=["§57"])
b.match(13, 1, ["concept"], "Match the pipeline ACL level to its capability.",
        [("CAN VIEW", "See pipeline / details"), ("CAN RUN", "Start/stop a pipeline update"), ("CAN MANAGE", "Edit settings + permissions + run"), ("IS OWNER", "Owner")],
        "Layer 1 controls the pipeline object, not the data it reads or writes.", quick=True, cov=["§58"])
b.tf(13, 2, ["exam"], "Maria has CAN RUN on a pipeline but no SELECT on its source table. She can still trigger a successful run.", True,
     "Yes — if the pipeline's run-as identity has the required source/target privileges. CAN RUN lets her start it; the run-as identity's privileges let it execute. (Final test Q18.)", cov=["§60", "T18"])
b.tf(13, 1, ["exam", "pitfall"], "CAN VIEW on a pipeline = SELECT on its output tables.", False,
     "Pipeline object ACL and Unity Catalog data ACL are different. Output tables are UC objects with their own permissions. (Final test Q19.)", cov=["§62", "T19"])
b.mcq(13, 2, ["exam"], "Which identity does a production pipeline use to read sources and write targets?",
      ["Whoever clicks Start", "The configured run-as principal — usually a service principal", "The workspace admin", "The SQL warehouse owner"], 1,
      "Updates execute as the run-as identity. Default = creator; Databricks recommends a service principal for production. (Final test Q20.)", cov=["§59", "T20"])
b.scenario(13, 3, ["debug"], "You have CAN RUN on `orders_pipeline`. You click Start; the update begins but fails reading `prod.raw.orders` with a permission error. You personally CAN read that table.",
  [("Layer 1 — is the pipeline ACL the problem?", [
      ("No — the update started, so CAN RUN works", True, "Layer 1 is fine; move on."),
      ("Yes — I need CAN MANAGE", False, "CAN RUN is enough to start/stop updates."),
      ("Yes — I need IS OWNER", False, "Ownership isn't needed to run."),
   ]),
   ("Layer 2 — what do you check next?", [
      ("The pipeline's run-as identity", True, "The update runs as that identity, not as you — your own SELECT is irrelevant."),
      ("My own SELECT privilege again", False, "You already have it; the pipeline doesn't use it unless it runs as you."),
      ("The pipeline's Photon setting", False, "Photon doesn't cause permission errors."),
   ]),
   ("Run-as = `pipeline-prod-sp`. Layer 3 — what's likely missing?", [
      ("USE CATALOG / USE SCHEMA / SELECT on the source for the service principal", True, "Grant least privilege to the SP on the data path."),
      ("CAN ATTACH TO on the pipeline's cluster", False, "No such cluster permission for serverless pipelines; and it's data that's denied."),
      ("CAN MONITOR on a SQL warehouse", False, "Unrelated compute."),
   ])],
  "Three layers: object ACL, run-as identity, UC privileges of that identity. Debug them in order (ORD).", cov=["§57", "§59", "§60", "§61"])
b.order(13, 2, ["debug"], "Order the playbook for 'pipeline runs fail although I can run it'.",
        ["Did the update actually start (Layer 1 OK)?", "Who is the run-as identity?", "Does it have USE CATALOG + USE SCHEMA on sources/target?", "Does it have SELECT on every source table?", "Does it have CREATE TABLE / CREATE MATERIALIZED VIEW on the target schema?"],
        "Object → identity → data, then data top-down: containers, sources, target creation rights.", cov=["§57", "§61"])
b.write(13, 2, ["syntax"], "Write least-privilege grants for `pipeline-prod-sp` to read `prod.raw.orders` and create tables/materialized views in `prod.silver`.",
        "GRANT USE CATALOG ON CATALOG prod TO `pipeline-prod-sp`;\nGRANT USE SCHEMA ON SCHEMA prod.raw TO `pipeline-prod-sp`;\nGRANT SELECT ON TABLE prod.raw.orders TO `pipeline-prod-sp`;\nGRANT USE SCHEMA, CREATE TABLE, CREATE MATERIALIZED VIEW ON SCHEMA prod.silver TO `pipeline-prod-sp`;",
        ["use catalog", "use schema", "select on table prod.raw.orders", "create table", "create materialized view", "prod.silver"], "sql",
        "Layer 3 for the run-as SP: containers (USE CATALOG/SCHEMA), SELECT on sources, CREATE TABLE/MATERIALIZED VIEW on the target schema — and nothing more.", cov=["§61"])
b.spotbug(13, 2, ["debug", "pitfall"], "The pipeline SP still can't read `prod.raw.orders`. Which grant is missing/wrong?",
          ["GRANT USE CATALOG ON CATALOG prod TO `pipeline-prod-sp`;", "GRANT SELECT ON TABLE prod.raw.orders TO `nikos@company.com`;", "GRANT USE SCHEMA, CREATE TABLE ON SCHEMA prod.silver TO `pipeline-prod-sp`;"], [1],
          "GRANT USE SCHEMA ON SCHEMA prod.raw TO `pipeline-prod-sp`;\nGRANT SELECT ON TABLE prod.raw.orders TO `pipeline-prod-sp`;",
          "SELECT was granted to Nikos, not to the run-as identity — and the SP also lacks USE SCHEMA on prod.raw. The pipeline runs as the SP, so grants must target it.", cov=["§59", "§61"])
b.mcq(13, 2, ["pitfall"], "Maria (CAN VIEW on the pipeline, not admin) wants to open the backing pipeline from the `prod.gold.revenue` materialized view and read it. What may she need?",
      ["Nothing — CAN VIEW covers it", "SELECT on prod.gold.revenue (plus USE CATALOG/SCHEMA) and possibly REFRESH on that object", "CAN MANAGE on the pipeline", "CAN USE on Default Automated Compute"], 1,
      "Pipeline ACL ≠ data ACL. Reading needs UC privileges; opening the backing pipeline from a ST/MV may also need REFRESH for non-admins.", cov=["§62"])
b.tf(13, 2, ["concept"], "On a serverless pipeline, you grant users CAN ATTACH TO on its cluster.", False,
     "Serverless pipelines have no user-managed cluster sizing/configuration/security — there's nothing to attach to.", cov=["§63"])
b.mcq(13, 2, ["concept"], "Which statement about **classic pipeline** compute is correct?",
      ["It's an ordinary all-purpose cluster you can attach notebooks to", "You get more infra options, but the pipeline manages the compute lifecycle and runtime (no free Spark version pinning)", "It has no infrastructure options at all", "It requires Dedicated access"], 1,
      "Classic pipelines expose some infrastructure choices, but lifecycle and runtime are pipeline-managed.", cov=["§63"])
b.match(13, 2, ["concept"], "Match the serverless access object to what it controls.",
        [("Default Interactive Compute", "Serverless notebooks / Databricks Connect"), ("Default Automated Compute", "Serverless Jobs / Lakeflow pipelines"), ("CAN USE", "Allowed to use that serverless compute"), ("CAN MANAGE", "Manage it, incl. who may use it")],
        "Serverless has access management — just not Standard/Dedicated. Admins can restrict which users/groups use serverless.", cov=["§64"])
b.scenario(13, 2, ["debug"], "A new analyst can't run any notebook on serverless compute, while colleagues can.",
  [("What do you check?", [
      ("Whether she has CAN USE on Default Interactive Compute", True, "That object controls serverless notebooks/Databricks Connect access."),
      ("Her Standard/Dedicated access mode", False, "Not a serverless concept."),
      ("Her CAN USE on the SQL warehouse", False, "Different compute."),
   ]),
   ("And for her scheduled serverless jobs?", [
      ("Default Automated Compute (CAN USE)", True, "It governs serverless Jobs and Lakeflow pipelines."),
      ("Default Interactive Compute again", False, "That's for interactive use."),
      ("Pipeline CAN VIEW", False, "Object ACL of a pipeline, not serverless compute access."),
   ])],
  "Standard/Dedicated is not a universal access axis; serverless uses Default Interactive / Default Automated Compute with CAN USE / CAN MANAGE.", cov=["§64"])
b.cloze(13, 1, ["concept"], "Complete the run-as rules.",
        "By default a pipeline runs as its [[creator]], but run-as can be changed to another user or a [[service principal]]. Databricks recommends a service principal for [[production]].",
        "Production pipelines shouldn't depend on a person's account and permissions.", bank=["admin", "group", "development"], cov=["§59"])

# s14
b.order(14, 2, ["concept"], "Order what happens when you press **Start** on a classic all-purpose cluster.",
        ["Need compute", "Get driver VM (possibly from pool)", "Get min worker VMs", "Start/install DBR", "Start Spark driver", "Start Spark executors", "Photon available/enabled", "Spark session ready", "Notebook attaches"],
        "Machines first, then software, then Spark processes, then the session your notebook uses.", quick=True, cov=["§69"])
b.match(14, 2, ["concept"], "Read the configuration: match each field to its layer.",
        [("All-purpose", "Lifecycle / purpose"), ("Classic", "Infrastructure management"), ("Standard", "Access / security mode"), ("DBR 18 LTS", "Software environment"), ("r6i.2xlarge driver", "Driver hardware"), ("min 2 / max 8", "Horizontal scaling policy"), ("Pool", "VM provisioning source")],
        "Each parameter has a different place in the architecture.", quick=True, cov=["§68"])
b.order(14, 2, ["concept"], "Order the path of `df.groupBy(\"country\").sum(\"amount\")` after the cluster is up.",
        ["Notebook", "Driver", "Catalyst", "Physical plan", "Photon", "Tasks", "Workers", "Partitions"],
        "The whole chain: notebook → driver plans with Catalyst → Photon executes tasks on workers over partitions.", cov=["§69"])
b.mcq(14, 2, ["exam"], "In the Spark compute matrix, which is TRUE for **Serverless Notebook**?",
      ["Pool ✅", "Min/max autoscale ✅", "Photon enabled, scaling managed, no Standard/Dedicated selector", "You choose driver type"], 2,
      "Serverless notebook: DBR/driver/worker managed, Photon enabled, automatic scaling managed, no pool, access mode not a selector.", cov=["§65"])
b.bucket(14, 3, ["exam"], "Classic pipeline or serverless pipeline?",
         ["Classic pipeline", "Serverless pipeline"],
         [("Legacy Hive metastore possible", 0), ("Unity Catalog required", 1), ("Instance types configurable", 0), ("Vertical scaling automatic", 1), ("Some classic controls (pool/custom settings)", 0), ("Photon always enabled", 1)],
         "Both share pipeline ACL and run-as; they differ on infrastructure control, UC requirement, Hive and scaling.", cov=["§66"])
b.mcq(14, 2, ["exam"], "Which row is ❌ for ALL three SQL warehouse types?",
      ["Photon", "Warehouse ACL", "DBR selector and Standard/Dedicated", "Auto Stop"], 2,
      "No warehouse has a DBR selector or Standard/Dedicated. All have Photon, size, concurrent cluster scaling, warehouse ACL, UC data ACL and Auto Stop; IWM is serverless-only, Predictive IO serverless+Pro.", cov=["§67"])
b.free(14, 2, ["interview"], "What's the essential difference between classic and serverless? Then place the runtime in the stack.",
       "Classic: you manage/configure the infrastructure envelope (VMs, driver/worker types, scaling, DBR, Photon, pools, termination). Serverless: you specify the workload and Databricks manages the envelope (runtime, Photon, machine types, scaling, provisioning, lifecycle). Stack from the app side: your code → Spark/Photon → Databricks Runtime → driver/workers → VM/CPU/RAM.",
       ["Classic: you configure the infrastructure envelope", "Serverless: you specify the workload; Databricks manages", "Stack: code → Spark/Photon → DBR → driver/workers → VMs"],
       "Final test Q24–25: serverless collapses the bottom half of the stack.", cov=["T24", "T25", "§74"])
b.order(14, 1, ["concept"], "Order the stack from the application side down to hardware.",
        ["Your code", "Spark / Photon", "Databricks Runtime", "Driver / workers", "VM / CPU / RAM"],
        "Hardware ↑ runtime ↑ execution engine/Spark ↑ your application — the same stack read bottom-up. (Final test Q25.)", cov=["T25", "§74"])
b.tf(14, 1, ["concept"], "Serverless collapses most of the bottom half of the stack: managed runtime, Photon, machine types, scaling, provisioning and lifecycle.", True,
     "That collapse is exactly the value of serverless.", cov=["§74", "T24"])
b.write(14, 2, ["syntax"], "Write the axis-by-axis spec (`Field: value` per line) of an `etl-development` classic all-purpose cluster: Standard access, DBR 18 LTS, Photon enabled, driver r6i.2xlarge, worker r6i.xlarge, autoscaling min 2 max 8.",
        "Name: etl-development\nPurpose: All-purpose\nInfrastructure: Classic\nAccess mode: Standard\nRuntime: DBR 18 LTS\nPhoton: Enabled\nDriver: r6i.2xlarge\nWorker: r6i.xlarge\nAutoscaling: min 2, max 8",
        ["All-purpose", "Classic", "Standard", "DBR 18 LTS", "Photon", "r6i.2xlarge", "r6i.xlarge", "min 2", "max 8"], "text",
        "This is the source's complete configuration — one compute, each field on a different layer (purpose, infra, access, software, engine, driver HW, worker HW, scaling).", cov=["§68"])
b.write(14, 1, ["syntax"], "Write the PySpark that the start-up chain eventually executes: total `amount` per `country` from table `orders` (start from `spark.table`).",
        'spark.table("orders").groupBy("country").sum("amount")',
        ["spark.table", "groupby(\"country\")", "sum(\"amount\")"], "python",
        "Driver + Catalyst plan it, Photon executes supported operators as tasks on workers over partitions.", cov=["§69"])
b.mcq(14, 3, ["exam"], "Which pair is NOT correct (classic all-purpose vs serverless Jobs)?",
      ["Auto termination: configurable vs lifecycle-based", "GPU: possible classic config vs AI Runtime separately", "Pool: ✅ vs ❌", "Job use: intended vs N/A"], 3,
      "Job use for all-purpose is 'supported but discouraged for prod', and for serverless Jobs it's the 'intended use'. 'N/A' belongs to serverless notebook.", cov=["§65"])

# ---- extra exercises
b.mcq(7, 1, ["concept", "exam"], "What is **worker type**?",
      ["The number of workers", "The cloud VM shape of each worker/executor node", "The Spark version on the worker", "Standard vs Dedicated"], 1,
      "Worker type = which cloud VM type each worker uses. On multi-node classic compute each worker runs a Spark executor. (Final test Q6.)", cov=["§25", "§26", "T6"])
b.odd(7, 2, ["concept"], "Which one does NOT describe the worker side of a classic multi-node cluster?",
      ["Runs a Spark executor", "Processes partitions in parallel", "Holds the SparkContext and notebook state", "Its VM shape is the worker type"], 2,
      "SparkContext and notebook state live on the **driver**. Workers run executors that process partitions.", cov=["§25", "§21"])
b.odd(4, 2, ["concept"], "Which one does NOT belong with the others (things Photon is)?",
      ["Native C++ engine", "Vectorized columnar batches", "Uses SIMD on CPUs", "A new programming API you must call"], 3,
      "Photon runs under the same Spark API — no new programming model. The other three describe how it executes.", cov=["§12", "§14", "§15"])
b.odd(10, 2, ["concept"], "Which one is NOT a kind of pool the Databricks 'Pool' setting refers to?",
      ["Pre-provisioned idle VMs", "Instance Pool", "Thread pool in the driver", "Warm machines for classic clusters"], 2,
      "The Pool setting means an **Instance Pool** of cloud VMs — not a thread, connection, data or executor pool.", cov=["§39"])
b.odd(12, 2, ["exam"], "Three of these are Gate-2 (data) privileges. Which is the odd one out?",
      ["USE CATALOG", "USE SCHEMA", "SELECT", "CAN USE"], 3,
      "CAN USE is a warehouse ACL (Gate 1, compute). USE CATALOG / USE SCHEMA / SELECT are Unity Catalog data privileges (Gate 2).", cov=["§51", "§53"])
b.scenario(13, 2, ["debug"], "Maria has CAN VIEW on `revenue_pipeline`. She runs `SELECT * FROM prod.gold.revenue;` and is denied.",
  [("What do you conclude first?", [
      ("Her pipeline permission doesn't cover the output table's data", True, "Pipeline object ACL ≠ Unity Catalog data ACL."),
      ("The pipeline failed and the table is empty", False, "An empty table wouldn't produce a permission error."),
      ("She needs CAN RUN", False, "Running the pipeline still wouldn't grant SELECT on the output."),
   ]),
   ("What does she need?", [
      ("SELECT on prod.gold.revenue (+ USE CATALOG/USE SCHEMA), and REFRESH if she must open the backing pipeline from the MV", True, "Output tables are UC objects with their own permissions."),
      ("CAN MANAGE on the pipeline", False, "More pipeline power ≠ data access."),
      ("CAN USE on Default Automated Compute", False, "That's serverless compute access."),
   ])],
  "Pipeline permission ≠ output data permission.", cov=["§62"])
b.order(6, 2, ["debug"], "Order the 'driver OOM on collect()' playbook.",
        ["Find the collect()-style action", "Compare the result size with the DRIVER's RAM", "Try to keep the work distributed (aggregate/write on workers)", "Only if data must come back: choose a larger driver type"],
        "Locate the action, compare with driver RAM, avoid the transfer, size up only if truly needed.", cov=["§24", "§70"])
b.order(11, 2, ["debug"], "Order the 'why is my cluster still costing money?' checks.",
        ["Is it all-purpose compute?", "Is auto termination configured (and to what)?", "Is a notebook or job keeping it active?", "Should scheduled work move to Jobs compute?", "Check warehouse Auto Stop / pool idle VMs elsewhere"],
        "Mnemonic IDLE: all-purpose? auto-termination set? lingering jobs/notebooks? elsewhere (warehouses, pools)?", cov=["§47", "§48", "§49"])
b.scenario(2, 2, ["debug"], "A classic production job ran for months; after someone switched its cluster from DBR 17.3 LTS to the newest DBR, results subtly changed.",
  [("What's the most likely cause?", [
      ("The new DBR ships different Spark/library versions and optimizer behaviour", True, "DBRs differ in Spark versions, APIs, libraries, optimizer behaviour."),
      ("The Delta table got corrupted", False, "Nothing indicates corruption; the runtime changed."),
      ("Unity Catalog permissions changed", False, "Permissions would cause errors, not subtle result changes."),
   ]),
   ("Best practice going forward?", [
      ("Pin production jobs to an LTS DBR and test new runtimes before switching", True, "LTS = longer support/stability horizon."),
      ("Always use the newest DBR in production", False, "That's the advice for development, not operational jobs."),
      ("Switch to DBR ML", False, "ML runtime doesn't add stability for ETL."),
   ])],
  "Development → current DBR; operational jobs → LTS. Runtime changes can subtly change behaviour.", cov=["§5", "§6"])
b.cloze(6, 1, ["concept"], "Complete.",
        "`df.collect()` moves rows from the [[workers]] to the [[driver]]. With 50 GB of data and 16 GB of driver RAM you will very likely get a driver [[OOM|out of memory]].",
        "The fix is to avoid collecting big data or, if needed, to choose a larger driver type.", bank=["executor", "pool", "warehouse"], cov=["§24"])
b.cloze(12, 2, ["exam"], "Complete the core rule.",
        "Warehouse [[ACL]] + Unity Catalog [[permissions|privileges]] = query possible. Permission to use [[compute]] ≠ permission to use [[data]].",
        "This pattern repeats across Databricks: warehouses, jobs and pipelines.", bank=["Photon", "pool"], cov=["§53"])

# ------------------------------------------------------------------ DEBUG
DEBUG = [
 {"id": "ch08-d01", "title": "I can use the warehouse but get PERMISSION_DENIED", "section": "ch08-s12",
  "symptom": "`SELECT * FROM prod.finance.payroll` on a SQL warehouse fails with PERMISSION_DENIED, although the user has CAN USE on the warehouse.",
  "askYourself": ["Could I start/use the warehouse at all — is Gate 1 (warehouse ACL) open?", "Is the error about the warehouse or about a data object?", "Do I have USE CATALOG on the catalog?", "Do I have USE SCHEMA on the schema?", "Do I have SELECT on the table itself?", "Am I wrongly assuming CAN USE (or even CAN MANAGE) grants data access?"],
  "steps": [{"do": "Confirm warehouse permission level (CAN USE/MONITOR/MANAGE).", "why": "Gate 1 = may I use this compute."},
            {"do": "Check UC privileges top-down.", "why": "Gate 2 = may I read this data.", "code": "SHOW GRANTS ON TABLE prod.finance.payroll;"},
            {"do": "Ask the data owner to grant the missing privilege (if appropriate).", "why": "Data access is governed in Unity Catalog.", "code": "GRANT SELECT ON TABLE prod.finance.payroll TO `nikos@company.com`;"}],
  "rootCauses": ["Missing SELECT on the table.", "Missing USE CATALOG / USE SCHEMA on parents.", "Belief that compute permission = data permission."],
  "fix": "Grant the needed UC privileges (USE CATALOG, USE SCHEMA, SELECT). Warehouse ACL + UC permissions = query possible.",
  "mnemonic": "Two gates: Machine, then Data."},
 {"id": "ch08-d02", "title": "Pipeline runs fail although I can run it", "section": "ch08-s13",
  "symptom": "You have CAN RUN, the update starts, but fails with permission errors reading sources or creating target tables — even though you personally can read the source.",
  "askYourself": ["Layer 1: did the update actually start (so my CAN RUN is fine)?", "Layer 2: whose identity does the pipeline run as — creator, another user, a service principal?", "Am I testing with MY permissions instead of the run-as identity's?", "Layer 3: does the run-as identity have USE CATALOG and USE SCHEMA on source and target?", "Does it have SELECT on every source table?", "Does it have CREATE TABLE / CREATE MATERIALIZED VIEW on the target schema?"],
  "steps": [{"do": "Check the pipeline's permissions page.", "why": "Layer 1: object ACL."},
            {"do": "Read the 'Run as' setting.", "why": "Layer 2: updates execute as this identity."},
            {"do": "Inspect grants for the run-as identity on sources and target.", "why": "Layer 3: UC privileges of THAT identity.", "code": "SHOW GRANTS `pipeline-prod-sp` ON SCHEMA prod.silver;"},
            {"do": "Grant least privilege to the run-as SP.", "why": "Only what the pipeline needs.", "code": "GRANT SELECT ON TABLE prod.raw.orders TO `pipeline-prod-sp`;"}],
  "rootCauses": ["Run-as identity lacks UC privileges.", "Grants were given to a person instead of the run-as SP.", "Run-as still the creator, whose access changed."],
  "fix": "Run production pipelines as a service principal and give that SP USE CATALOG, USE SCHEMA, SELECT on sources and CREATE TABLE/MATERIALIZED VIEW on the target.",
  "mnemonic": "ORD — Object (ACL), Run-as (identity), Data (UC)."},
 {"id": "ch08-d03", "title": "I can see the pipeline but can't read its output table", "section": "ch08-s13",
  "symptom": "Maria has CAN VIEW on the pipeline, but `SELECT * FROM prod.gold.revenue` fails with a permission error.",
  "askYourself": ["Is my permission on the pipeline OBJECT or on the DATA?", "Do I have USE CATALOG / USE SCHEMA / SELECT on the output table?", "Am I a non-admin trying to open the backing pipeline from a streaming table/MV (REFRESH needed)?"],
  "steps": [{"do": "Separate pipeline ACL from UC ACL.", "why": "Output tables are UC objects with their own permissions."},
            {"do": "Request SELECT (and parent USE privileges) on the output table.", "why": "Gate to the data is in Unity Catalog."}],
  "rootCauses": ["Pipeline permission ≠ output data permission."],
  "fix": "Grant UC privileges on the output table (and REFRESH if she must open the backing pipeline from the ST/MV)."},
 {"id": "ch08-d04", "title": "Driver OOM on collect() despite huge worker RAM", "section": "ch08-s06",
  "symptom": "Driver 8 GB, workers 10 × 64 GB. `huge_df.collect()` crashes the driver with OOM.",
  "askYourself": ["Am I bringing data back to the driver (collect / similar)?", "How big is the result vs the DRIVER's RAM (not the workers')?", "Is the driver type much smaller than the worker type?", "Can the work stay on the workers (aggregate, write, display a sample)?", "If I truly need data on the driver, is a larger driver type justified?", "Are other driver stressors present (huge plans, task metadata, many sessions, big local Python objects)?"],
  "steps": [{"do": "Find the collect()-style action.", "why": "collect() moves all rows workers → driver."},
            {"do": "Compare result size with driver RAM.", "why": "Worker RAM is irrelevant for driver-side data."},
            {"do": "Rewrite to keep work distributed, or size up the driver.", "why": "Databricks recommends a larger driver when much data is collected."}],
  "rootCauses": ["Collecting a large result into a small driver.", "Confusing aggregate worker RAM with driver RAM."],
  "fix": "Avoid collecting big data; aggregate or write on workers. If unavoidable, choose a larger driver type.",
  "mnemonic": "collect() = Everything Comes Home to the driver."},
 {"id": "ch08-d05", "title": "Cluster is slow to start", "section": "ch08-s10",
  "symptom": "Queries are excellent once the classic cluster runs, but startup takes ~4 minutes.",
  "askYourself": ["Is the problem startup time or query time?", "Is the cluster provisioning fresh VMs from the cloud every time?", "Is the runtime downloaded/started from scratch on each VM?", "Could an instance pool (with preloaded DBR) provide warm VMs?", "Is the workload compatible with serverless, removing provisioning entirely?"],
  "steps": [{"do": "Separate startup from execution time.", "why": "More worker RAM doesn't fix startup."},
            {"do": "Attach the cluster to an instance pool with preloaded DBR.", "why": "Warm VMs + cached runtime = fast launch."},
            {"do": "Consider serverless.", "why": "Databricks owns prewarming and capacity."}],
  "rootCauses": ["VM provisioning + boot + DBR start latency."],
  "fix": "Use a pool (min idle, preloaded DBR) or move to serverless if compatible.",
  "mnemonic": "Slow start? Pool it or go serverless."},
 {"id": "ch08-d06", "title": "Why is my cluster still costing money?", "section": "ch08-s11",
  "symptom": "An all-purpose cluster (or a warehouse) kept billing overnight/at the weekend though nobody was working.",
  "askYourself": ["Is this all-purpose compute (it stays up while idle)?", "Is auto termination configured, and to what idle time?", "Is something keeping it active — a running notebook or a job pointed at it?", "Should that scheduled work run on Jobs compute (lifecycle-based termination) instead?", "For a SQL warehouse: what is Auto Stop set to (serverless ~10 min, Pro/Classic ~45 min defaults)?", "Is a pool keeping minimum idle VMs provisioned?", "Could serverless remove idle infrastructure altogether?"],
  "steps": [{"do": "Check the compute type and its auto-termination setting.", "why": "All-purpose termination is idle-time based."},
            {"do": "Look for attached notebooks/jobs keeping it active.", "why": "Activity resets the idle clock."},
            {"do": "Move scheduled work to Jobs compute; set auto termination / Auto Stop.", "why": "Jobs compute terminates when the run ends."}],
  "rootCauses": ["Auto termination off or too long.", "Jobs running on all-purpose.", "Long Auto Stop on warehouses.", "Pools keeping idle VMs."],
  "fix": "Enable auto termination (e.g. 30 min), use Jobs compute for scheduled work, tune warehouse Auto Stop and pool min idle.",
  "mnemonic": "IDLE: Is it all-purpose? Did auto-termination get set? Lingering jobs/notebooks? Elsewhere (warehouse Auto Stop, pools)?"},
 {"id": "ch08-d07", "title": "Workers are struggling — should I upsize the driver?", "section": "ch08-s07",
  "symptom": "Spark UI shows saturated worker CPUs, or massive spill and executor OOMs. Someone proposes a bigger driver.",
  "askYourself": ["Which layer shows the symptom — driver or workers?", "CPU saturated with little spill and healthy memory → is this a worker CPU bottleneck?", "Massive spill / executor OOM → is worker memory, partitioning, skew or join strategy the issue?", "Would more workers (scale out) or larger workers (scale up) help?", "Would Photon or query optimization reduce CPU time?", "Is the driver actually doing anything heavy (collect)?"],
  "steps": [{"do": "Read Spark UI symptoms.", "why": "Diagnose before resizing."},
            {"do": "Apply worker-side fixes.", "why": "The bottleneck is on workers."}],
  "rootCauses": ["Worker CPU bottleneck.", "Insufficient worker memory / bad partitioning / skew / join choice."],
  "fix": "CPU-bound: more/CPU-oriented workers, Photon, query optimization. Spill/OOM: more worker memory, better partitioning, less skew, different join, more/larger workers. Not a bigger driver.",
  "mnemonic": "Fix the layer that hurts."},
 {"id": "ch08-d08", "title": "My variables/cached data vanished after the cluster restarted", "section": "ch08-s11",
  "symptom": "After auto termination, re-running a cell gives NameError or cached DataFrames are gone; the user fears data loss.",
  "askYourself": ["Did the compute terminate (auto termination / manual)?", "Is the missing thing ephemeral (variables, cache, shuffle, temp files) or persistent (Delta tables, UC metadata, notebooks, jobs)?", "Can I recreate the state by re-running cells from persistent data?"],
  "steps": [{"do": "Confirm termination in the compute event log/state.", "why": "Termination wipes ephemeral state."},
            {"do": "Re-run the defining cells.", "why": "Persistent tables are untouched."}],
  "rootCauses": ["Compute lifetime ≠ persistent data lifetime."],
  "fix": "Restart and recreate session state from tables; nothing persistent was lost."},
 {"id": "ch08-d09", "title": "A user can't use serverless compute at all", "section": "ch08-s13",
  "symptom": "A user's notebooks or jobs can't use serverless compute while colleagues' can.",
  "askYourself": ["Is this interactive (notebooks / Databricks Connect) or automated (jobs / pipelines)?", "Does the user (or their group) have CAN USE on Default Interactive Compute?", "For jobs/pipelines: CAN USE on Default Automated Compute?", "Am I looking for a Standard/Dedicated setting that doesn't exist on serverless?"],
  "steps": [{"do": "Open the permissions of the built-in serverless compute objects.", "why": "Admins can restrict serverless per user/group."},
            {"do": "Grant CAN USE to the right group.", "why": "Restores access."}],
  "rootCauses": ["Missing CAN USE on Default Interactive / Default Automated Compute."],
  "fix": "Grant CAN USE on the relevant serverless compute object."},
 {"id": "ch08-d10", "title": "Production code changed behaviour after a runtime change", "section": "ch08-s02",
  "symptom": "A production job that ran for months suddenly produces different results or fails after its runtime changed.",
  "askYourself": ["Did the DBR version (and with it Spark/Python/library versions) change?", "Is the job pinned to an LTS runtime?", "Is it on serverless, where Databricks upgrades the runtime automatically?", "Is the job on a pipeline channel (current/preview) that moved forward?"],
  "steps": [{"do": "Compare runtime/Spark versions before and after.", "why": "DBRs differ in Spark version, APIs, libraries, optimizer behaviour."},
            {"do": "Pin classic production jobs to an LTS DBR.", "why": "Longer stability horizon."}],
  "rootCauses": ["Runtime upgrade changed Spark/library behaviour."],
  "fix": "Use LTS DBR for classic production jobs; test on new runtimes before switching; on serverless use environment versions for application compatibility."},
]

PITFALLS = [
 {"title": "Runtime = machine", "text": "DBR 18 LTS and r5.4xlarge are not versions of the same thing.", "fix": "Runtime = software; node type = hardware."},
 {"title": "DBR ML for everything", "text": "DBR ML adds ML/DL libraries; it's not 'better' for ETL.", "fix": "Normal DBR for ETL; DBR ML for ML."},
 {"title": "Pinning DBR on serverless", "text": "Serverless auto-upgrades its runtime.", "fix": "Use environment versions; pin DBR only on classic."},
 {"title": "Photon replaces Catalyst", "text": "Catalyst still plans; Photon executes supported operators.", "fix": "Photon = engine below the physical plan."},
 {"title": "Photon = GPU", "text": "Photon is a CPU vectorized engine; GPU compute doesn't support Photon.", "fix": "Engine axis vs hardware axis."},
 {"title": "DBR vs Photon as competitors", "text": "They coexist: DBR 18 LTS + Photon ON.", "fix": "Photon lives inside the runtime's execution layer."},
 {"title": "Unsupported operator = failure", "text": "Unsupported operations fall back to Spark/JVM.", "fix": "Expect mixed Photon + JVM plans."},
 {"title": "Big workers protect collect()", "text": "collect() lands on the driver; worker RAM doesn't help.", "fix": "Avoid collect on big data or size the driver."},
 {"title": "Bigger driver for worker bottlenecks", "text": "CPU saturation, spill and executor OOM are worker-side.", "fix": "Fix workers, partitioning, skew, join, Photon."},
 {"title": "Autoscaling = serverless", "text": "Classic autoscales between your min/max.", "fix": "Separate scaling axis from infrastructure axis."},
 {"title": "Serverless doesn't scale", "text": "Scaling is intrinsic and managed.", "fix": "Pipelines even scale vertically; you may cap max workers."},
 {"title": "Warehouse scaling = worker scaling", "text": "Warehouses add clusters for concurrency.", "fix": "Know which thing each 'autoscaling' changes."},
 {"title": "All-purpose is interactive-only", "text": "Jobs can use it; it's discouraged for production.", "fix": "Interactive by design, not by restriction."},
 {"title": "Pools = autoscaling", "text": "Pool = where VMs come from; autoscaling = how many.", "fix": "Use both together."},
 {"title": "Pools on serverless", "text": "Not available; serverless handles prewarming.", "fix": "Prefer serverless over pools when compatible."},
 {"title": "Terminate = delete", "text": "Termination releases VMs, keeps config.", "fix": "Delete only to remove the configuration."},
 {"title": "Termination deletes tables", "text": "Only ephemeral state is lost.", "fix": "compute lifetime ≠ persistent data lifetime."},
 {"title": "CAN USE = SELECT everywhere", "text": "Warehouse ACL is about compute only.", "fix": "Also grant USE CATALOG, USE SCHEMA, SELECT."},
 {"title": "Standard/Dedicated on warehouses", "text": "Not a valid axis for SQL warehouses.", "fix": "Warehouse ACL + UC governance."},
 {"title": "CAN RUN means my permissions are used", "text": "Pipelines execute as the run-as identity.", "fix": "Grant data privileges to the run-as SP."},
 {"title": "CAN VIEW pipeline = SELECT on outputs", "text": "Output tables are UC objects with their own ACL.", "fix": "Grant UC privileges (and REFRESH if needed)."},
 {"title": "Personal run-as in production", "text": "Default run-as is the creator.", "fix": "Use a service principal for production pipelines."},
 {"title": "Standard/Dedicated is universal", "text": "Serverless uses Default Interactive/Automated Compute with CAN USE/CAN MANAGE.", "fix": "Know each compute's access model."},
]

FLASH = [
 ("What is a runtime environment?", "Everything code needs to execute: interpreter, JVM, Spark, libraries, native/system libs, config, dependency versions.", 1),
 ("What does every DBR include?", "Apache Spark.", 2),
 ("Runtime vs node type?", "Runtime = software environment; node type = hardware/VM.", 2),
 ("LTS?", "Long-Term Support — longer stability horizon; DBR 18 LTS supported until June 2029 (source).", 2),
 ("DBR 17.3 LTS ships which Spark?", "Spark 4.0.0.", 2),
 ("DBR 18 LTS ships which Spark?", "Spark 4.1.0.", 2),
 ("DBR ML?", "DBR + ML/DL stack (PyTorch, transformers, XGBoost, MLflow, GPU components).", 3),
 ("Runtime on serverless?", "Databricks-managed & auto-upgraded; you configure environment version + dependencies.", 3),
 ("Lakeflow pipeline runtime?", "Channels: current (≈DBR 17.3) and preview (≈DBR 18).", 3),
 ("SQL warehouse runtime?", "Databricks SQL-managed runtime; no DBR selector.", 3),
 ("Photon in one line?", "Databricks-native C++ vectorized execution engine for supported Spark SQL/DataFrame ops.", 4),
 ("Does Photon replace Catalyst?", "No — Catalyst plans; Photon executes supported operators.", 4),
 ("SIMD?", "Single Instruction, Multiple Data.", 4),
 ("Unsupported operator in Photon?", "Falls back to Spark/JVM; query doesn't fail.", 4),
 ("Where is Photon always enabled?", "Serverless compute, SQL warehouses, serverless pipelines.", 5),
 ("Photon on GPU classic compute?", "Not supported.", 5),
 ("Driver's job?", "Coordinator: notebook state, SparkContext, planning, tasks, scheduling, monitoring, results.", 6),
 ("Driver type?", "The cloud VM instance type of the driver.", 6),
 ("collect() danger?", "Brings all rows to the driver → driver OOM if larger than driver RAM.", 6),
 ("Default driver type?", "Same as the worker type.", 7),
 ("4 workers × 8 cores × 32 GB?", "32 cores, 128 GB aggregate (distributed).", 7),
 ("Scale up vs out?", "Bigger machines vs more machines.", 7),
 ("Classic autoscaling changes…", "The number of workers (type stays) — horizontal.", 8),
 ("Serverless pipeline scaling?", "Horizontal + vertical, automatic; optional Max workers cap.", 8),
 ("SQL warehouse scaling?", "Adds warehouse clusters for concurrency (min/max cluster counts).", 8),
 ("All-purpose for jobs?", "Supported, discouraged for production; exceptions: iterative job testing, very short frequent jobs.", 9),
 ("Instance pool?", "Reservoir of pre-provisioned cloud VMs for faster classic cluster starts.", 10),
 ("Pool settings?", "Minimum idle, maximum capacity, idle instance auto-termination (+ preloaded DBR).", 10),
 ("Pool vs autoscaling?", "Pool = where machines come from; autoscaling = how many.", 10),
 ("Lost on termination?", "Executor memory, cached DFs, shuffle/temp files, Python/session state.", 11),
 ("Auto Stop defaults?", "Serverless ~10 min; Pro/Classic ~45 min.", 11),
 ("SQL warehouse 2 gates?", "Gate 1 warehouse ACL; Gate 2 Unity Catalog privileges.", 12),
 ("CAN MONITOR on warehouse?", "Run queries + query history/profiles/monitoring, no config changes.", 12),
 ("Pipeline 3 layers?", "Pipeline ACL → run-as identity → UC privileges of that identity.", 13),
 ("Pipeline ACL levels?", "CAN VIEW, CAN RUN, CAN MANAGE, IS OWNER.", 13),
 ("Default run-as?", "The creator; recommended: service principal for production.", 13),
 ("Serverless access objects?", "Default Interactive Compute (notebooks/Databricks Connect), Default Automated Compute (Jobs/pipelines); CAN USE/CAN MANAGE.", 13),
 ("Start sequence?", "Need compute → driver VM → min workers → DBR → Spark driver → executors → Photon → session → notebook attaches.", 14),
 ("Classic vs serverless in one line?", "Classic: you configure the infrastructure envelope. Serverless: you specify the workload; Databricks manages it.", 14),
]

OBJ = ["You can explain what a runtime is, choose between current, LTS and ML DBRs, and know how runtime works on serverless, pipelines and warehouses.",
       "You can explain Photon (vectorized, Catalyst still plans, fallback) and separate it from DBR and GPU.",
       "You can size driver vs workers, compute aggregate cores/RAM and diagnose driver-OOM vs worker bottlenecks.",
       "You can compare autoscaling on classic, serverless, pipelines and SQL warehouses, and pools vs autoscaling.",
       "You can explain termination, auto termination and Auto Stop and what survives them.",
       "You can debug SQL warehouse PERMISSION_DENIED (two gates) and failing pipeline runs (three layers).",
       "You can read a full classic configuration and narrate what happens when you press Start."]

ch = {"id": CID, "num": 8, "title": "Compute Anatomy & Access Control",
      "subtitle": "DBR, Photon, driver/workers, scaling, pools, termination — and who may use compute vs data",
      "emoji": "⚙️", "sourcePages": "216–271",
      "mantra": "Every knob lives on one layer — and permission to use compute is never permission to use data.",
      "objectives": OBJ, "sections": S, "debug": DEBUG, "pitfalls": PITFALLS,
      "flashcards": [{"q": q, "a": a, "section": f"ch08-s{s:02d}"} for q, a, s in FLASH],
      "exercises": b.ex}
dump(ch, os.path.join(OUT, "ch08.json"))

HEAD = [("intro", "Layered stack (workload/engine/runtime/nodes/infra)", 1), ("§1", "What 'runtime' means in general", 1),
 ("§2", "Databricks Runtime (DBR) contents", 2), ("§3", "Runtime ≠ machine", 2), ("§4", "Laptop analogy", 2), ("§5", "Why DBR versions; DBR→Spark table", 2),
 ("§6", "LTS, June 2029, recommendations", 2), ("§7", "Standard DBR vs DBR ML", 3), ("§8", "Runtime decision table", 3), ("§9", "DBR on serverless", 3),
 ("§10", "Serverless runtime exists; environment versions", 3), ("§11", "Lakeflow pipelines runtime channels", 3), ("mentalmap", "Runtime mental map", 3),
 ("§12", "What Photon is / isn't", 4), ("§13", "Where Photon sits (Catalyst still plans)", 4), ("§14", "Vectorized / SIMD", 4), ("§15", "No code change", 4),
 ("§16", "Fallback for unsupported operators", 4), ("§17", "Alternative = Spark JVM", 4), ("§18", "Photon config per compute type", 5),
 ("§19", "Photon vs GPU", 5), ("§20", "Runtime vs Photon", 5), ("§21", "Driver node", 6), ("§22", "What the driver does", 6), ("§23", "Driver type", 6),
 ("§24", "Driver RAM / collect() / stressors", 6), ("§25", "Worker node", 7), ("§26", "Worker type & math", 7), ("§27", "Worker type vs workload", 7),
 ("§28", "Driver type vs worker type", 7), ("§29", "Scale up vs scale out", 7), ("§30", "Classic autoscaling", 8), ("§31", "Serverless autoscaling", 8),
 ("§32", "Autoscaling axis only classic?", 8), ("§33", "Serverless pipeline H+V scaling", 8), ("§34", "SQL warehouse autoscaling", 8),
 ("§35", "All-purpose not interactive-only", 9), ("§36", "Why called interactive (lifecycle)", 9), ("§37", "Why not all-purpose for prod jobs", 9),
 ("§38", "Exceptions", 9), ("§39", "Instance pool definition", 10), ("§40", "Why pools exist", 10), ("§41", "Pool lifecycle", 10),
 ("§42", "Preloaded DBR", 10), ("§43", "Pools + autoscaling", 10), ("§44", "Pools vs serverless", 10), ("§45", "Termination vs delete", 11),
 ("§46", "What's lost / kept", 11), ("§47", "Auto termination", 11), ("§48", "Jobs compute termination", 11), ("§49", "SQL warehouse Auto Stop", 11),
 ("§50", "SQL WH access: two gates", 12), ("§51", "Warehouse ACL levels", 12), ("§52", "CAN USE ≠ data", 12), ("§53", "Gate 2 Unity Catalog", 12),
 ("§54", "Example analysts sales vs hr", 12), ("§55", "CAN MONITOR", 12), ("§56", "No Standard/Dedicated on warehouses", 12),
 ("§57", "Pipeline 3 layers", 13), ("§58", "Pipeline ACL", 13), ("§59", "Run-as identity", 13), ("§60", "Why run-as matters", 13),
 ("§61", "UC privileges for pipeline SP", 13), ("§62", "Pipeline permission ≠ output data (REFRESH)", 13), ("§63", "Pipeline compute permissions", 13),
 ("§64", "Serverless access management", 13), ("§65", "Spark compute matrix", 14), ("§66", "Pipeline matrix", 14), ("§67", "SQL warehouse matrix", 14),
 ("§68", "Complete classic configuration", 14), ("§69", "Start sequence", 14), ("§70", "Scenario: collect OOM", 6), ("§71", "Scenario: CPU saturated", 7),
 ("§72", "Scenario: spill/executor OOM", 7), ("§73", "Scenario: slow start", 10), ("§74", "Full stack / serverless collapses", 14)] + \
 [(f"T{i}", f"Final test Q{i}", s) for i, s in [(1,2),(2,5),(3,5),(4,4),(5,4),(6,7),(7,6),(8,6),(9,8),(10,8),(11,8),(12,10),(13,10),(14,11),(15,9),(16,9),(17,12),(18,13),(19,13),(20,13),(21,12),(22,8),(23,8),(24,14),(25,14)]]
missing = coverage_md(os.path.join(OUT, "ch08.coverage.md"), "ch08 Compute Anatomy & Access Control (p216–271)", HEAD, b, S,
                      {d["id"]: f"{d['title']} → {d['section']}" for d in DEBUG})
print("uncovered:", missing)
