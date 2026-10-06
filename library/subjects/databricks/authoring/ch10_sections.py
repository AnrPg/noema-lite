# Sections for ch10 — The Mastery Roadmap
def P(t): return {"t": "p", "text": t}
def L(items, ordered=False): return {"t": "list", "items": items, "ordered": ordered}
def C(kind, title, text): return {"t": "callout", "kind": kind, "title": title, "text": text}
def CODE(lang, code, cap=None):
    b = {"t": "code", "lang": lang, "code": code}
    if cap: b["caption"] = cap
    return b
def D(text, cap=None):
    b = {"t": "diagram", "text": text}
    if cap: b["caption"] = cap
    return b
def T(head, rows, cap=None):
    b = {"t": "table", "head": head, "rows": rows}
    if cap: b["caption"] = cap
    return b
def CMP(*items): return {"t": "compare", "items": [{"title": a, "points": b} for a, b in items]}
def F(items, cap=None):
    b = {"t": "flow", "items": items}
    if cap: b["caption"] = cap
    return b
def R(label, text): return {"t": "reveal", "label": label, "text": text}
def ASK(title, qs): return {"t": "ask", "title": title, "questions": qs}
def TERMS(pairs): return {"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]}

S = []

# ---------------------------------------------------------------- s01
S.append({"id": "ch10-s01", "title": "The New Course Contract & Ground Already Covered",
 "hook": "From here on every lesson = theory AND real syntax. First, take stock of what you already own.",
 "blocks": [
  P("The learner asked: *continue teaching Databricks in depth — what's the plan?* and insisted on learning **both theory/best practices AND syntax/practical use** of the platform."),
  P("The tutor's answer: stop teaching **one concept at a time**, cut off from the real Databricks. Instead, build the whole platform as if preparing for a job, real projects and certification **at the same time**."),
  C("key", "The contract for every phase", "Each unit must do **both**: theory / architecture / best practices **plus** real UI, SQL, PySpark, CLI/YAML syntax, debugging and exercises."),
  C("exam", "Why this matches the exam", "The current **Data Engineer Associate** exam no longer tests only transformations. It also covers architecture, compute, Delta/Unity Catalog, ingestion, orchestration, Spark troubleshooting and deployment concepts."),
  D("FOUNDATIONS (done)\n├── Spark execution foundations\n├── partitions / shuffle\n├── joins / physical plans\n├── batch / streaming / incremental\n├── CDC\n├── schema evolution\n├── medallion architecture\n└── Databricks fundamentals\n    ├── account / workspace\n    ├── control vs compute plane\n    ├── serverless vs classic\n    ├── all-purpose / jobs / pipelines\n    ├── SQL warehouses\n    ├── DBR / runtime\n    ├── Photon\n    ├── driver / workers\n    ├── pools\n    ├── autoscaling\n    └── compute access", "What is already covered before the roadmap starts"),
  TERMS([
   ("Control plane", "The Databricks-managed backend: web app, notebooks, job scheduler, cluster manager, Unity Catalog services."),
   ("Compute plane", "Where your data is actually processed — VMs in your cloud account (classic) or in Databricks' account (serverless)."),
   ("Serverless vs classic", "Serverless: you specify the workload, Databricks manages the infrastructure. Classic: you configure the VMs (sizes, workers, runtime) yourself."),
   ("All-purpose / jobs / pipelines compute", "Interactive cluster for notebooks / ephemeral cluster for one job run / compute that runs a declarative pipeline."),
   ("SQL warehouse", "Compute dedicated to SQL and BI queries (Databricks SQL)."),
   ("DBR (Databricks Runtime)", "The versioned software image on the cluster: Spark + Delta + libraries + OS."),
   ("Photon", "Databricks' native vectorized (C++) query engine that speeds up SQL/DataFrame operations."),
   ("Pool", "A set of idle, ready-to-use VM instances that cuts cluster start and autoscaling time."),
   ("Compute access (access mode)", "Who may use the compute and how it isolates users — e.g. **Standard** (shared) or **Dedicated** (single user/group)."),
  ]),
  R("Think first: why does the tutor insist on showing real configs and source files from now on?", "Because two lessons about a tool without ever seeing one **real configuration or source file** are useless for a job. Knowing names is not knowing the platform."),
  P("The roadmap below has **10 phases**, a project that grows with you, a fixed **lesson blueprint**, and **four interfaces** learned in parallel."),
 ]})

# ---------------------------------------------------------------- s02
S.append({"id": "ch10-s02", "title": "Dependency Order: The 10-Phase Map",
 "hook": "Learn layers in the order they depend on each other — not in the order of the sidebar menu.",
 "blocks": [
  C("warn", "What we will NOT do", "We will **not** blindly follow the workspace menu order (Workspace → Catalog → Compute → Jobs → SQL …). That order is good for a **product tour**, not for learning."),
  P("Instead the plan follows **dependency order**: each next layer needs the previous one."),
  D(" 1 Compute\n   ↓\n 2 Delta Lake\n   ↓\n 3 Unity Catalog\n   ↓\n 4 Ingestion\n   ↓\n 5 Structured Streaming\n   ↓\n 6 Declarative Pipelines\n   ↓\n 7 Jobs\n   ↓\n 8 Databricks SQL\n   ↓\n 9 Performance & Debugging\n   ↓\n10 Production CI/CD", "Learning order = dependency order"),
  T(["#", "Phase", "Goal (one line)"], [
   ["1", "Compute Mastery", "Configure, reason about, troubleshoot and optimize real Spark workloads."],
   ["2", "Delta Lake in Practice", "Move from Delta internals to using Delta correctly in production."],
   ["3", "Unity Catalog Mastery", "Storage, namespace, governance, identities and permissions as ONE system."],
   ["4", "Data Ingestion", "Ingest files/external sources correctly, incrementally, reproducibly."],
   ["5", "Structured Streaming", "Streaming from execution model to production reliability."],
   ["6", "Lakeflow Spark Declarative Pipelines", "Production declarative pipelines with current syntax."],
   ["7", "Lakeflow Jobs & Orchestration", "Orchestrate production workflows reliably."],
   ["8", "Databricks SQL", "SQL analytics & BI compute — not a black box."],
   ["9", "Performance & Debugging", "Diagnose slowdowns with evidence, not by blindly scaling."],
   ["10", "Production Eng., CLI, CI/CD", "Operate Databricks as a production software platform."],
  ], "The 10 phases and their stated goals"),
  CMP(("Menu order (product tour)", ["Workspace → Catalog → Compute → Jobs → SQL …", "Shows where buttons are", "Concepts appear before what they depend on"]),
      ("Dependency order (learning)", ["Compute → Delta → UC → … → CI/CD", "Each layer builds on the previous", "You can explain *why*, not just *where*"])),
  R("Think first: why does compute come BEFORE Delta?", "Every Delta command (MERGE, OPTIMIZE, a streaming write) finally runs as **Spark tasks on compute**. To reason about why a MERGE is slow, why OPTIMIZE costs what it costs or why a write creates small files, you need cores, task slots, partitions, shuffle and memory first."),
  C("tip", "The plan as a file", "The tutor exported the whole roadmap as `databricks_mastery_phased_plan.md` — Markdown so it works as a syllabus in Obsidian or Git. The roadmap's audience: technical interviews, certifications, real-world DE projects, production debugging, platform operations, CI/CD and deployment."),
 ]})

# ---------------------------------------------------------------- s03
SEVENTEEN = [
 "What problem are we solving?",
 "How would we solve it without Databricks?",
 "Which Databricks component solves it?",
 "How does it work internally?",
 "Where does it sit in the architecture?",
 "How do I use it in the UI?",
 "What is the real syntax?",
 "What does a production example look like?",
 "What alternatives exist?",
 "When should I NOT use it?",
 "Best practices",
 "Common mistakes",
 "Debugging workflow",
 "Certification traps",
 "Exercises",
 "Full solutions",
 "Mini-project extension",
]
S.append({"id": "ch10-s03", "title": "The 17-Question Lesson Blueprint",
 "hook": "One fixed route through every topic — so information never feels scattered again.",
 "blocks": [
  P("The learner had struggled with **slides and scattered information**. Fix: every lesson follows roughly the **same route**, a standard structure of questions."),
  L(SEVENTEEN, True),
  C("key", "Questions 6–8 get special weight", "**6. UI, 7. real syntax, 8. production example.** The learner had rightly complained that two lessons on a tool without a single real configuration or source file are useless."),
  T(["Block", "Questions", "Purpose"], [
   ["WHY", "1–3", "Problem → life without Databricks → which component"],
   ["HOW", "4–5", "Internals and place in the architecture"],
   ["USE", "6–8", "UI, real syntax, production example"],
   ["JUDGE", "9–12", "Alternatives, when NOT to use, best practices, common mistakes"],
   ["BREAK", "13–14", "Debugging workflow, certification traps"],
   ["PROVE", "15–17", "Exercises, full solutions, mini-project extension"],
  ], "Group the 17 into 6 blocks to memorize them"),
  C("tip", "13 vs 17", "In the chat the tutor first listed **13** steps (ending at *Debugging*). The exported plan adds **14 Certification traps, 15 Exercises, 16 Full solutions, 17 Mini-project extension**."),
  C("analogy", "A pilot's checklist", "Like a pre-flight checklist, the 17 questions stop you from skipping the boring-but-critical parts — especially *When should I NOT use it?* and *Debugging*."),
  R("Think first: why ask “How would we solve it without Databricks?”", "It exposes the **real problem** and shows exactly what the Databricks component abstracts away (e.g. without Auto Loader you'd track processed file names yourself). Once you see the manual version, the feature's design and its failure modes make sense."),
  ASK("Ask yourself when you meet ANY new Databricks feature", [
   "What problem does this solve, in one sentence?",
   "How would I do it by hand without Databricks?",
   "Where does it sit: control plane, compute, storage, catalog?",
   "Have I seen it in the UI AND written its real syntax?",
   "When would I deliberately NOT use it?",
   "How does it fail, and where would I look first?",
  ]),
 ]})

# ---------------------------------------------------------------- s04
S.append({"id": "ch10-s04", "title": "Four Interfaces in Parallel & the Growing Project",
 "hook": "SQL, PySpark, platform config and CLI — plus one e-commerce lakehouse that grows with every phase.",
 "blocks": [
  P("Syntax will **not** be limited to PySpark. Four interfaces are learned **in parallel**."),
  D("SQL\n├── CREATE / ALTER / MERGE\n├── COPY INTO / GRANT / REVOKE\n└── Delta DML, Unity Catalog SQL\nPySpark\n├── DataFrame API\n├── read/write APIs\n├── streaming APIs\n└── Delta APIs\nPlatform / config\n├── compute configuration\n├── Jobs\n├── Pipelines\n└── Bundles YAML\nCLI / external development\n├── databricks ...\n├── Git\n├── Databricks Connect\n└── deployment workflows", "The four interfaces"),
  T(["Interface", "Typical examples", "Where you write it"], [
   ["SQL", "`CREATE`, `ALTER`, `MERGE`, `COPY INTO`, `GRANT`, `REVOKE`", "SQL editor, notebook SQL cells, pipeline .sql files"],
   ["PySpark", "`spark.read`, `df.write`, `spark.readStream`, `DeltaTable`", "Notebooks, Python files, pipelines"],
   ["Platform / config", "Compute settings, Jobs, Pipelines, Bundles YAML", "UI forms or `databricks.yml`"],
   ["CLI / external dev", "`databricks bundle deploy`, Git, Databricks Connect", "Terminal, IDE, CI system"],
  ]),
  C("tip", "UI ↔ object mapping", "Wherever there is a UI, the tutor will also explain: **where do I click in the workspace, and which Databricks object does what I see correspond to?**"),
  P("Instead of a separate **toy example** per lesson (which loses the big picture), one **production-style project** grows with you."),
  D("E-COMMERCE LAKEHOUSE\nsources/\n├── customers CDC\n├── orders JSON\n├── products CSV\n└── events stream\n      ↓\nBRONZE: customers_raw, orders_raw,\n        products_raw, events_raw\n      ↓\nSILVER: customers, orders,\n        products, events\n      ↓\nGOLD:   daily_revenue, customer_360,\n        product_performance,\n        conversion_metrics", "The ongoing project"),
  L(["Auto Loader", "CDC", "`MERGE`", "Lakeflow pipelines", "Data-quality checks", "Unity Catalog security", "Jobs", "SQL dashboards", "Performance tuning", "CI/CD", "Service principals", "Dev/prod environments"]),
  C("key", "The end goal", "At the end you won't just have *seen* Databricks concepts — you'll know **how they connect into one production system**."),
 ]})

# ---------------------------------------------------------------- s05 Phase 1
S.append({"id": "ch10-s05", "title": "Phase 1 — Compute Mastery (Preview)",
 "hook": "Read a cluster config and predict what it means for a real Spark job.",
 "blocks": [
  P("**Goal:** understand compute deeply enough to configure, reason about, troubleshoot and optimize real Spark workloads — understand **every field**, not just the names."),
  C("key", "Official compute split", "Databricks officially splits compute into **serverless**, **classic** and **SQL warehouses**. Classic compute includes **all-purpose**, **jobs** and **Lakeflow pipeline** resources."),
  TERMS([
   ("Driver", "The node running your program's main process: builds the plan, schedules tasks, collects results."),
   ("Worker", "A VM that hosts an executor and does the actual data processing."),
   ("Executor", "The JVM process on a worker that runs tasks and holds cached/shuffle data."),
   ("Cores", "CPU cores; each executor core runs one task at a time."),
   ("Executor memory", "The JVM heap of the executor, used for execution (joins, aggregations, sorts) and storage (cache)."),
   ("Task slot", "One executor core = one slot = one task running concurrently."),
   ("Partition", "A chunk of data; one task processes one partition."),
   ("Worker / driver type", "The VM instance type (cores, RAM, disk) chosen for workers / for the driver."),
   ("Autoscaling", "Databricks adds/removes workers between a min and max based on load."),
   ("Pools", "Pre-warmed idle instances that make clusters start and scale faster."),
   ("Spot vs on-demand", "Spot: cheap spare capacity that can be reclaimed. On-demand: full price, not reclaimed."),
   ("Compute policies", "Admin rules that restrict/preset which compute settings users may choose (and cost limits)."),
   ("Access modes", "Isolation/sharing model — **Standard** (multi-user, shared) or **Dedicated** (single user or group)."),
   ("Termination / auto-termination", "Stopping the cluster; auto-termination stops it after N idle minutes to save cost."),
  ]),
  TERMS([
   ("What serverless abstracts away", "VM types, worker counts, spot/on-demand, runtime image and cluster startup — Databricks manages them."),
   ("What remains configurable", "Mainly your code, the **environment** (environment version + Python dependencies) and a few job/notebook settings."),
   ("Serverless notebooks / jobs / pipelines", "The same workloads run on Databricks-managed, fast-starting compute."),
   ("Limitations", "Some features/configs available on classic (custom Spark configs, init scripts, specific instance types…) are not available."),
  ]),
  CODE("text", "Driver:  16 cores / 64 GB\nWorkers: 8 cores / 32 GB\nWorkers: min 2, max 10\nDBR:     18 LTS\nPhoton:  enabled\nAccess mode: Standard", "Practice config from the plan"),
  L(["Total available cores", "Approximate task parallelism", "Where executor memory lives", "Effect of 2 vs 10 workers", "Shuffle behavior", "Where spill happens", "When the driver OOMs", "When an executor OOMs", "Spark UI interpretation"]),
  R("Think first: with workers min 2 / max 10, 8 cores each, how many tasks can run at once?", "Only **worker** cores run tasks: 2 × 8 = **16** slots at minimum, 10 × 8 = **80** at maximum. The driver's 16 cores schedule work; they do not add task slots."),
  C("pitfall", "Don't count the driver", "A classic mistake in parallelism math is adding driver cores to the task slots. Tasks run on **executors on workers**."),
  P("**Immediate next lesson — Compute Part 3: From VM to Spark Task.** Config: driver + 4 workers, 8 cores and 32 GB RAM per worker, DBR 18 LTS, Photon enabled, autoscale 2–8."),
  L(["What process runs on the driver? On a worker?", "What exactly is an executor? One or many per worker?", "What is an executor core, and how does a core relate to a Spark task?", "With 4 × 8 cores, how many tasks run concurrently?", "What happens with 1,000 partitions? With only 4?", "Where is the executor heap? What is memory overhead?", "What happens during shuffle? What is written to local disk? Where does spill occur?", "What changes when autoscaling 2 → 8 workers? What changes with Photon?", "Which details disappear from user management in serverless?", "How do these show up in the Spark UI (Executor/Stage/Task views)?"]),
  C("pitfall", "Too few partitions", "With fewer partitions than task slots, cores sit idle no matter how big the cluster is."),
  R("Think first: 4 workers × 8 cores, a stage with 1,000 partitions vs 4 partitions?", "32 slots. 1,000 partitions → tasks run in about ⌈1000/32⌉ = **32 waves**. 4 partitions → only **4 tasks**, so 28 cores sit **idle** — too few partitions waste the cluster."),
 ]})

# ---------------------------------------------------------------- s06 Phase 2
S.append({"id": "ch10-s06", "title": "Phase 2 — Delta Lake in Practice (Preview)",
 "hook": "You know Parquet + _delta_log + snapshots. Now you'll actually USE Delta in production.",
 "blocks": [
  P("**Already understood:** Parquet + `_delta_log` + snapshots + MVCC + ADD/REMOVE actions. **Goal now:** use Delta **correctly in production**."),
  T(["SQL", "What it does (1 line)"], [
   ["`CREATE TABLE`", "Create a (Delta) table — schema, location/managed, properties."],
   ["`INSERT`", "Append (or `INSERT OVERWRITE`) rows."],
   ["`UPDATE` / `DELETE`", "Change / remove rows matching a predicate (new table version)."],
   ["`MERGE`", "Upsert: match source to target and update/insert/delete in one atomic commit."],
   ["`TRUNCATE`", "Remove all rows, keep the table definition."],
   ["`ALTER TABLE`", "Change schema/properties: add columns, set properties, clustering…"],
   ["`DESCRIBE DETAIL`", "Current table-level metadata: format, location, numFiles, size, features."],
   ["`DESCRIBE HISTORY`", "Per-version provenance: version, timestamp, user, operation, metrics."],
   ["`RESTORE`", "Create a NEW current version whose state equals an old version."],
   ["`VACUUM`", "Physically delete unreferenced files older than the retention period."],
   ["`OPTIMIZE`", "Compact small files / re-layout active files."],
  ], "Phase 2 SQL syntax"),
  T(["PySpark / Delta API", "Meaning"], [
   ["`spark.read.table(...)`", "Read a catalog table as a DataFrame."],
   ["`df.write`", "DataFrameWriter (v1): `.mode(...)`, `.format(...)`, `.save/.saveAsTable`."],
   ["`df.writeTo(...)`", "DataFrameWriterV2: `.append()`, `.overwritePartitions()`, `.createOrReplace()`."],
   ["`saveAsTable(...)`", "Write the DataFrame as a named table (columns matched by **name** on append)."],
   ["`insertInto(...)`", "Insert into an existing table — columns matched by **position**."],
   ["`DeltaTable.forName(...)`", "Get a DeltaTable object for programmatic DML."],
   ["`.merge(...)` / `.update(...)` / `.delete(...)`", "MERGE / UPDATE / DELETE via the Python API."],
  ]),
  C("pitfall", "insertInto is positional", "`insertInto` maps columns **by position**, not by name. If the DataFrame's column order differs from the table's, values silently land in the wrong columns (or fail on type)."),
  TERMS([
   ("Append vs overwrite", "Append adds rows; overwrite replaces the table's (or a partition's) contents."),
   ("Dynamic overwrite", "Overwrite only the partitions present in the incoming data (`partitionOverwriteMode=dynamic`), leaving others untouched."),
   ("Idempotent MERGE", "A MERGE you can re-run on the same input without creating duplicates or double-applying changes."),
   ("CDC", "Change Data Capture: a feed of inserts/updates/deletes to apply to a target."),
   ("Deduplication", "Keep one row per key (e.g. `ROW_NUMBER()` over key ordered by timestamp)."),
   ("Late-arriving data", "Records that arrive after newer records for the same key/time — must not overwrite newer state."),
   ("Schema enforcement", "Delta rejects writes whose schema doesn't match the table."),
   ("Schema evolution", "Explicitly allow new columns to be added on write (e.g. `mergeSchema`)."),
   ("Type widening", "Change a column to a wider type (e.g. INT → BIGINT) without rewriting data files."),
   ("Time travel", "Query an older snapshot: `VERSION AS OF` / `TIMESTAMP AS OF`."),
   ("Deletion vectors", "Mark rows as deleted/changed in a side file instead of rewriting the whole Parquet file immediately."),
  ]),
  TERMS([
   ("Small files", "Too many tiny files → metadata, file-open and task-scheduling overhead."),
   ("OPTIMIZE", "Compacts small files into larger ones (and applies clustering)."),
   ("Data skipping", "Uses per-file statistics to skip files that cannot contain matching rows."),
   ("File statistics", "Min/max/null counts per column stored in the Delta log for each file."),
   ("Liquid Clustering", "Flexible, incremental data layout by clustering keys (`CLUSTER BY`) — keys can change without a full rewrite; replaces static partitioning/Z-order."),
   ("Predictive optimization", "For Unity Catalog managed tables, Databricks automatically runs OPTIMIZE / VACUUM / ANALYZE when it judges they're needed."),
  ]),
  C("exam", "OPTIMIZE ≠ VACUUM", "**OPTIMIZE** reorganizes active files/layout. **VACUUM** physically deletes expired, unreferenced files. History is not a backup — VACUUM and retention remove old files."),
 ]})

# ---------------------------------------------------------------- s07 Phase 3
S.append({"id": "ch10-s07", "title": "Phase 3 — Unity Catalog Mastery (Preview)",
 "hook": "Much more than catalog.schema.table: storage → namespace → identities → permissions as ONE system.",
 "blocks": [
  P("**Goal:** understand storage, namespace, governance, identities and permissions as **one coherent system**, built from storage upward."),
  D("Cloud storage (s3://, abfss://, gs://)\n      ↑\nExternal location  (path + credential)\n      ↑\nStorage credential (cloud IAM identity)\n\nUnity Catalog\n└── Metastore\n    └── Catalog\n        └── Schema\n            ├── Managed table\n            ├── External table\n            ├── Volume\n            ├── View\n            ├── Materialized view\n            ├── Function\n            └── Model", "Storage and namespace model"),
  TERMS([
   ("Metastore", "Top-level UC container (one per region) holding all catalogs and their permissions."),
   ("Catalog", "First level of the 3-level namespace `catalog.schema.object` (e.g. `prod`)."),
   ("Schema", "Second level (database) inside a catalog, e.g. `prod.silver`."),
   ("Managed table", "UC manages both metadata AND the data files' lifecycle (DROP deletes data)."),
   ("External table", "UC manages metadata; data lives at a path you control (DROP keeps the files)."),
   ("Volume", "UC object governing **non-tabular files** (CSV, images…), path `/Volumes/catalog/schema/volume/`."),
   ("View / Materialized view", "Saved query / saved query whose results are precomputed and refreshed."),
   ("Function", "A UDF registered in a schema (also used for row filters and column masks)."),
   ("Model", "A registered ML model governed by UC."),
   ("Storage credential", "UC object wrapping a cloud identity (IAM role / managed identity) allowed to access storage."),
   ("External location", "A cloud storage path + the storage credential used to access it, governed with grants."),
  ]),
  CODE("sql", "CREATE CATALOG ...;  CREATE SCHEMA ...;\nCREATE TABLE ...;    CREATE VOLUME ...;\n\nGRANT USE CATALOG ON CATALOG prod TO `data-engineers`;\nGRANT USE SCHEMA ON SCHEMA prod.silver TO `data-engineers`;\nGRANT SELECT ON TABLE prod.silver.orders TO `analysts`;\n\nREVOKE ... ;  SHOW GRANTS ON TABLE prod.silver.orders;", "Phase 3 SQL syntax"),
  C("key", "Three keys to read one table", "To `SELECT` from `prod.silver.orders` a principal needs **USE CATALOG** on `prod`, **USE SCHEMA** on `prod.silver` and **SELECT** on the table (or inherit them from a higher level)."),
  TERMS([
   ("Users / groups", "Human identities; groups bundle them so you grant once to a team."),
   ("Service principal", "A non-human identity for automation — jobs, pipelines, CI/CD deployments."),
   ("Ownership", "Each securable has one owner who has all privileges on it and can grant them."),
   ("Privilege inheritance", "A grant on a catalog or schema flows down to all objects inside it."),
   ("Least privilege", "Grant only the minimum privileges needed for the task."),
   ("Row filter", "A UDF attached to a table that decides which rows each user may see."),
   ("Column mask", "A UDF attached to a column that returns a masked value (e.g. `***`) for unauthorized users."),
   ("ABAC", "Attribute-based access control: policies driven by governed **tags** (e.g. `pii`) apply filters/masks at scale."),
   ("Lineage", "UC automatically records which tables/columns were read to produce which others."),
   ("Audit / governance", "Logs of who accessed/changed what (e.g. audit logs, system tables)."),
   ("Delta Sharing", "Open protocol to share live data securely with other organizations/platforms."),
   ("Lakehouse Federation", "Query external databases (e.g. PostgreSQL, Snowflake) through UC foreign catalogs without ingesting the data."),
  ]),
  F(["PERMISSION_DENIED", "Who am I?", "Which principal runs the job?", "USE CATALOG?", "USE SCHEMA?", "SELECT / MODIFY?", "Ownership?", "Storage credential?"], "Permission-debugging chain"),
  C("pitfall", "It works for me, it fails in the job", "A job may run as a **different principal** (job owner or a service principal) than you. Your notebook succeeding proves nothing about the job's identity."),
  ASK("Ask yourself on PERMISSION_DENIED", ["Who am I right now (`current_user()`)?", "Which principal is the job/pipeline actually running as?", "Does that principal have USE CATALOG on the catalog?", "Does it have USE SCHEMA on the schema?", "Does it have SELECT (read) or MODIFY (write) on the object?", "Is ownership involved (e.g. ALTER/DROP needs owner)?", "For paths/external data: is the storage credential / external location granted?"]),
  D("metastore → catalog → schema\n→ managed / external tables → volumes\n→ storage credentials / external locations\n→ grants / ownership → service principals\n→ row filters / masks / ABAC → lineage\n→ systematic PERMISSION_DENIED debugging", "Phase 3 teaching order (teaser at the end of Phase 2)"),
  C("tip", "Earlier teaser (end of Delta Part 2)", "The Part 3 teaser listed: `catalog.schema.object`, managed vs external tables, **managed storage**, volumes, external locations, storage credentials, ownership, `USE CATALOG`, `USE SCHEMA`, `SELECT`, `MODIFY`, privilege inheritance, service principals, row filters, column masks, lineage and, above all, real PERMISSION_DENIED debugging scenarios."),
 ]})

# ---------------------------------------------------------------- s08 Phase 4
S.append({"id": "ch10-s08", "title": "Phase 4 — Data Ingestion (Preview)",
 "hook": "From spark.read to COPY INTO to Auto Loader — and breaking pipelines on purpose.",
 "blocks": [
  P("**Goal:** ingest files and external sources **correctly, incrementally and reproducibly**. Start simple, end with Auto Loader in depth."),
  CODE("python", "df = (\n    spark.read\n        .format(\"csv\")\n        .option(\"header\", True)\n        .schema(schema)\n        .load(path)\n)\n\nspark.read.json(...)\nspark.read.parquet(...)", "Core batch reads"),
  CMP(("Explicit schema", ["You pass `.schema(schema)`", "No extra pass over the data", "Wrong-typed data becomes null/fails predictably", "Best for production"]),
      ("Schema inference", ["Spark samples/scans the files to guess types", "Extra read cost on CSV/JSON", "Types may change between runs", "Fine for exploration"])),
  TERMS([
   ("`COPY INTO`", "SQL command that loads files from a location into a Delta table **idempotently** — already-loaded files are skipped on re-run."),
   ("Auto Loader", "Incremental file ingestion as a stream: processes only new files that land in a directory."),
   ("`cloudFiles`", "The source format name for Auto Loader: `spark.readStream.format(\"cloudFiles\")`."),
   ("File discovery", "How Auto Loader finds new files: directory listing or file notification."),
   ("Directory listing", "Default mode: lists the input directory to find new files."),
   ("File notification", "Uses cloud storage events/queues to learn about new files — scales to huge directories."),
   ("Checkpoint", "Stores which files/offsets were already processed so a restart continues exactly where it stopped."),
   ("`schemaLocation`", "`cloudFiles.schemaLocation`: where Auto Loader stores the inferred schema and its evolution."),
   ("Schema inference", "Auto Loader infers the schema from sampled files (JSON/CSV columns default to STRING unless type inference is on)."),
   ("Schema hints", "`cloudFiles.schemaHints`: force specific types for some columns, e.g. `amount DECIMAL(10,2)`."),
   ("Schema evolution", "When new columns appear, Auto Loader updates the schema (default: stop the stream, restart with new columns)."),
   ("Rescued data column", "`_rescued_data`: captures values that don't fit the schema instead of losing them."),
   ("Duplicate prevention / incremental semantics", "Checkpointed file tracking means each file is ingested once — \"exactly-once-ish\" as long as the checkpoint is intact."),
  ]),
  CODE("python", "(\n    spark.readStream\n        .format(\"cloudFiles\")\n        .option(\"cloudFiles.format\", \"json\")\n        .option(\"cloudFiles.schemaLocation\", schema_path)\n        .load(source_path)\n)", "Auto Loader skeleton"),
  CMP(("COPY INTO", ["SQL command, batch-style", "Idempotent: skips loaded files", "Good for thousands of files / scheduled loads"]),
      ("Auto Loader", ["Structured Streaming source (`cloudFiles`)", "Checkpoint + schemaLocation", "Scales to millions of files, schema evolution, rescued data"])),
  C("warn", "\"Exactly-once-ish\"", "Exactly-once ingestion depends on the **checkpoint**. Delete or change it and Auto Loader treats every file as new → **duplicates**."),
  L(["Build ingestion pipelines", "Intentionally break them", "Diagnose missing files", "Diagnose duplicate files", "Diagnose schema drift", "Diagnose malformed rows"]),
  ASK("Ask yourself when ingestion looks wrong", ["Is it missing, duplicated, drifted or malformed data?", "Did the files actually land in the path the stream reads?", "Was the checkpoint deleted, moved or shared between two streams?", "Did the source schema change (new/renamed columns)?", "Is anything sitting in `_rescued_data`?"]),
 ]})

# ---------------------------------------------------------------- s09 Phase 5
S.append({"id": "ch10-s09", "title": "Phase 5 — Structured Streaming (Preview)",
 "hook": "From micro-batches to production reliability — and why exactly-once is subtle.",
 "blocks": [
  P("**Goal:** understand streaming from the **execution model** to **production reliability**, back in Spark but inside Databricks."),
  CODE("python", "query = (\n    events\n        .writeStream\n        .format(\"delta\")\n        .option(\"checkpointLocation\", checkpoint)\n        .trigger(processingTime=\"30 seconds\")\n        .toTable(\"bronze.events\")\n)", "Core syntax: spark.readStream … .writeStream"),
  T(["Line", "Meaning"], [
   ["`.writeStream`", "Turns the streaming DataFrame into a continuously running query."],
   ["`.format(\"delta\")`", "Sink is a Delta table (transactional → supports exactly-once)."],
   ["`checkpointLocation`", "Where offsets, commits and state are stored for recovery."],
   ["`.trigger(processingTime=\"30 seconds\")`", "Start a micro-batch every 30 seconds."],
   ["`.toTable(\"bronze.events\")`", "Start the query writing into that table; returns a StreamingQuery."],
  ]),
  TERMS([
   ("Micro-batch", "The stream is processed as a series of small batch jobs."),
   ("Checkpoint", "Durable record of progress (offsets, commits, state) used on restart."),
   ("Offset", "Position in the source up to which data has been read."),
   ("State", "Data kept across micro-batches for aggregations, dedup, joins (in the state store)."),
   ("Watermark", "`withWatermark(col, delay)`: how late data may arrive before state for old windows is dropped."),
   ("Event time vs processing time", "When the event happened (column in data) vs when Spark processes it."),
   ("Late data", "Events arriving after newer events; beyond the watermark they may be ignored."),
   ("Stateless vs stateful", "Row-by-row ops (filter, select) vs ops that remember (aggregations, dedup, stream joins)."),
  ]),
  T(["Output mode", "What is written each trigger"], [
   ["append", "Only new rows that are final (won't change again)."],
   ["update", "Only rows that changed since the last trigger."],
   ["complete", "The whole result table every trigger (aggregations)."],
  ]),
  C("warn", "Why exactly-once is subtle", "End-to-end exactly-once needs a **replayable source + checkpoint + idempotent/transactional sink**. You can still create duplicates: deleting/changing the checkpoint, two queries writing the same table, non-idempotent `foreachBatch` logic, or duplicates already in the source."),
  L(["Duplicate scenarios", "Restart behavior", "State-store debugging"]),
  R("Think first: you restart a stream with a NEW checkpoint path on the same source. What happens?", "The new query has no memory of processed offsets/files, so it starts from the beginning (or from the configured starting point) and **reprocesses data → duplicates** in an append sink."),
 ]})

# ---------------------------------------------------------------- s10 Phase 6
S.append({"id": "ch10-s10", "title": "Phase 6 — Lakeflow Spark Declarative Pipelines (Preview)",
 "hook": "Declare tables; let the engine build the DAG, run incrementally and enforce quality.",
 "blocks": [
  P("**Goal:** build production declarative pipelines with **current** Databricks syntax and concepts — while still recognizing older terminology."),
  D("Delta Live Tables (DLT)\n        ↓\nLakeflow Declarative Pipelines\n        ↓\n(Lakeflow) Spark Declarative Pipelines", "Same product line, renamed twice"),
  C("tip", "Recognize legacy tutorials", "Older material says **DLT**, `import dlt`, `APPLY CHANGES INTO` or the `LIVE.` prefix. The current names are Lakeflow Spark Declarative Pipelines and `AUTO CDC`. Learn the current form; recognize the old."),
  CODE("sql", "CREATE OR REFRESH STREAMING TABLE bronze_orders\nAS\nSELECT *\nFROM STREAM read_files(...);", "SQL-style pipeline source"),
  TERMS([
   ("`read_files`", "SQL table-valued function that reads files from a path; with `STREAM` it ingests incrementally (Auto Loader)."),
   ("Streaming table", "Delta table fed by a streaming query; each new input row is processed once (append-style, incremental)."),
   ("Materialized view", "Table whose content is the precomputed result of a query, refreshed (incrementally when possible)."),
   ("Temporary view", "Intermediate dataset inside the pipeline, not published to the catalog."),
   ("Dependencies / DAG generation", "The engine reads which datasets each query references and builds the execution graph automatically."),
   ("Incremental computation", "Process only new/changed data instead of recomputing everything."),
   ("Expectations", "Data-quality rules on a dataset: `CONSTRAINT c EXPECT (cond)` with action warn (default), `DROP ROW` or `FAIL UPDATE`."),
   ("`AUTO CDC`", "Declarative CDC apply (formerly `APPLY CHANGES`): orders changes by a sequence column and applies upserts/deletes."),
   ("SCD Type 1", "Overwrite the old value — keep only current state."),
   ("SCD Type 2", "Keep history: close the old row (`__END_AT`) and insert a new version."),
   ("Serverless vs classic pipeline compute", "Databricks-managed compute vs a pipeline cluster you configure."),
   ("Pipeline parameters", "Key-value settings of the pipeline referenced from source code (e.g. catalog name per env)."),
   ("Event log", "The pipeline's log of events — progress, data-quality metrics, lineage, errors — queryable as a table."),
   ("Pipeline monitoring / debugging", "Pipeline UI graph + event log to find failing flows, dropped rows and slow updates."),
  ]),
  CMP(("Streaming table", ["Input: append-only/streaming source", "Each row processed once", "Ideal for bronze ingestion"]),
      ("Materialized view", ["Input: any query (joins, aggregations)", "Result kept correct on refresh", "Ideal for silver/gold aggregates"])),
  CODE("sql", "CREATE OR REFRESH STREAMING TABLE silver_orders (\n  CONSTRAINT valid_id EXPECT (order_id IS NOT NULL)\n    ON VIOLATION DROP ROW\n)\nAS SELECT * FROM STREAM(bronze_orders);", "An expectation (illustration)"),
  C("pitfall", "Forgetting STREAM", "A streaming table must read a **streaming** source: `FROM STREAM read_files(...)` or `FROM STREAM(table)`. Without `STREAM` it's a batch query and the definition fails."),
 ]})

# ---------------------------------------------------------------- s11 Phase 7
S.append({"id": "ch10-s11", "title": "Phase 7 — Lakeflow Jobs & Orchestration (Preview)",
 "hook": "How everything before becomes a reliable production workflow.",
 "blocks": [
  P("**Goal:** orchestrate production workflows reliably — via the **UI and declarative configuration**."),
  D("        ingest\n          │\n          ▼\n        bronze\n          │\n     ┌────┴────┐\n     ▼         ▼\n customers   orders\n     │         │\n     └────┬────┘\n          ▼\n         gold\n          │\n          ▼\n    quality check", "A real job DAG (customers and orders run in parallel)"),
  TERMS([
   ("Job", "The orchestrated workflow definition (tasks + schedule + settings)."),
   ("Task", "One unit of work in a job: notebook, Python, SQL, pipeline, run-job…"),
   ("Run", "One execution of a job (each task gets a task run)."),
   ("Task dependency", "`depends_on`: a task starts only after its upstream tasks finish."),
   ("Parameters", "Job/task inputs (key-value) passed to the code."),
   ("Dynamic value references", "Placeholders like `{{job.run_id}}` or `{{job.start_time.iso_date}}` resolved at run time."),
   ("Retries / timeouts", "Re-run a failed task N times / fail a task that runs too long."),
   ("Notifications", "Email/webhook alerts on start, success, failure, duration."),
   ("If/else", "Condition task that branches the DAG based on a value."),
   ("For-each", "Runs a nested task once per item of a list."),
   ("Run-job task", "A task that triggers another job."),
  ]),
  T(["Trigger", "Starts a run when…"], [
   ["Schedule", "a cron-style time arrives (e.g. daily 02:00)."],
   ["Continuous", "always — a new run starts as soon as the previous ends."],
   ["File arrival", "new files land in a monitored storage location."],
   ["Table update", "a monitored source table is updated."],
  ]),
  T(["Compute choice", "What it is"], [
   ["Serverless job compute", "Databricks-managed; no infra to configure."],
   ["Classic job compute / new job cluster", "A cluster created for the run and terminated after."],
   ["Shared job cluster", "One job cluster reused by several tasks of the same job."],
   ["Existing all-purpose compute", "Reuse an interactive cluster — convenient for dev, pricier and less isolated for prod."],
  ]),
  C("pitfall", "Prod jobs on all-purpose compute", "Interactive clusters are pricier, shared and less isolated — and they hide missing job dependencies (\"works on my cluster\"). Use serverless job compute or job clusters and declare libraries in the job."),
  F(["Task failed", "Upstream?", "Compute?", "Runtime?", "Library?", "Permissions?", "Parameter?", "Data?", "Spark execution?"], "Debugging model"),
  ASK("Ask yourself when a task fails", ["Did an upstream task fail or produce bad output?", "Did the compute start (quota, policy, spot loss)?", "Is it a runtime/DBR version issue?", "Is a library missing or conflicting?", "Does the run-as identity have permissions?", "Was a parameter missing or wrong?", "Is the input data unexpected (empty, schema drift)?", "Is it a Spark execution error (OOM, skew, timeout)?"]),
 ]})

# ---------------------------------------------------------------- s12 Phase 8
S.append({"id": "ch10-s12", "title": "Phase 8 — Databricks SQL (Preview)",
 "hook": "SQL warehouses are not a black box ‘for BI’ — you'll size, profile and tune them.",
 "blocks": [
  P("**Goal:** master SQL analytics and BI compute rather than treating SQL warehouses as a black box."),
  TERMS([
   ("SQL Editor", "Workspace UI to write and run SQL against a warehouse."),
   ("Queries", "Saved SQL statements you can reuse, schedule and share."),
   ("Query history", "List of past queries with status, duration, user and warehouse."),
   ("Query profile", "Visual per-operator breakdown of a query's execution — the DBSQL debugging tool."),
   ("SQL warehouse", "Compute for SQL: **Serverless**, **Pro** or **Classic**."),
   ("Warehouse size", "T-shirt size (2X-Small … 4X-Large) of each cluster → speed of individual queries."),
   ("Min/max clusters", "How many clusters the warehouse scales across → concurrency (many users)."),
   ("Autoscaling / auto-stop", "Adds clusters under load / stops the warehouse after idle minutes."),
   ("AI/BI dashboards", "Databricks' native dashboards built on SQL datasets."),
   ("Alerts", "Scheduled query + condition that sends a notification when met."),
   ("Materialized views / streaming tables", "Also creatable in DBSQL, refreshed on schedule."),
   ("Statement Execution API", "REST API to run SQL on a warehouse from any application."),
   ("JDBC / ODBC", "Standard drivers for external tools — e.g. **Power BI**, **Tableau** connectivity."),
  ]),
  CMP(("Serverless warehouse", ["Databricks-managed compute", "Starts in seconds", "Recommended default"]),
      ("Pro / Classic warehouse", ["Compute runs in your cloud account", "Slower start", "Classic has fewer performance features than Pro"])),
  C("pitfall", "Wrong warehouse knob", "Raising **size** doesn't fix queueing, and raising **max clusters** doesn't fix one heavy query."),
  C("key", "Size vs clusters", "**Size** makes each query faster (bigger cluster). **Max clusters** lets more queries run at once (concurrency). Queries *queueing* → raise max clusters; one *heavy* query slow → bigger size or tune the query."),
  C("tip", "SQL performance tuning", "Phase 8 ends with SQL performance tuning — start from the **query profile**, not by guessing."),
 ]})

# ---------------------------------------------------------------- s13 Phase 9
S.append({"id": "ch10-s13", "title": "Phase 9 — Performance & Debugging (Preview)",
 "hook": "\"Job went from 8 to 42 minutes\" — evidence, not a bigger cluster.",
 "blocks": [
  P("One of the most important units for **interviews and real work**. Driven by real **symptom** cases."),
  CODE("text", "Job used to take 8 min.\nNow takes 42 min.", "Example case"),
  C("warn", "Not: \"use a bigger cluster\"", "**Goal:** diagnose slowdowns using **evidence** instead of blindly scaling compute."),
  D("Query slow\n   ↓\nSpark UI\n   ↓\nFind slow stage\n   ↓\nFind slow tasks\n   ↓\nCompare task distribution\n   ↓\nSkew? Shuffle? Spill? I/O?\nJoin? GC? Small files?", "Investigation process"),
  T(["Spark UI metric", "What it tells you"], [
   ["Jobs / Stages / Tasks", "Hierarchy: action → stages split at shuffles → one task per partition."],
   ["Input size", "Bytes read from the source by the stage/task."],
   ["Output size", "Bytes written to the sink."],
   ["Shuffle write", "Bytes written by map-side tasks for the next stage."],
   ["Shuffle read", "Bytes fetched by reduce-side tasks — uneven = skew."],
   ["Spill (memory)", "Size (in memory, deserialized) of data that had to be spilled."],
   ["Spill (disk)", "Size of that spilled data on disk (serialized) — any spill = memory pressure."],
   ["GC time", "Time the JVM paused for garbage collection — high → memory pressure."],
   ["Task duration", "Compare min/median/max — a long tail = skew or stragglers."],
   ["Records", "Rows read/written per task — reveals uneven partitions."],
  ]),
  T(["Plan operator", "Meaning"], [
   ["`Exchange`", "A shuffle (or broadcast) — data redistributed; stage boundary."],
   ["`BroadcastHashJoin`", "Small side copied to every executor; big side not shuffled."],
   ["`SortMergeJoin`", "Both sides shuffled by key, sorted, then merged — the large-large join."],
   ["`HashAggregate`", "Aggregation with a hash map (often partial → Exchange → final)."],
   ["`Scan`", "Reading the source; shows pushed filters / files read."],
   ["`Filter`", "Row predicate applied to the data."],
   ["Whole-stage codegen", "`WholeStageCodegen` / `*(n)`: fuses several operators into one generated function."],
   ["Photon operators", "`Photon...` nodes run in the Photon engine; non-Photon nodes show fallbacks."],
  ]),
  TERMS([
   ("Data skew", "A few keys/partitions hold far more data than others → a few very slow tasks."),
   ("Salting", "Append a random suffix to a hot key to spread it across many partitions."),
   ("Broadcasting", "Send a small table to all executors to avoid shuffling the big one."),
   ("AQE", "Adaptive Query Execution: re-optimizes at runtime — coalesces shuffle partitions, switches join strategy, splits skewed partitions."),
   ("Partition tuning", "Choose a sensible number/size of partitions (e.g. `spark.sql.shuffle.partitions`)."),
   ("`repartition` vs `coalesce`", "repartition = full shuffle to N partitions (up or down); coalesce = merge partitions without full shuffle (down only)."),
   ("Small file problem / file compaction", "Many tiny files slow reads; compaction (`OPTIMIZE`) merges them."),
   ("Data skipping / Liquid Clustering", "Skip irrelevant files via stats; cluster data so skipping works well."),
   ("Driver OOM", "Driver runs out of memory — e.g. `collect()`/`toPandas()` of big data, huge broadcast, too much metadata."),
   ("Executor OOM", "An executor runs out of memory — e.g. a giant skewed partition, oversized partitions."),
   ("GC pressure / spill", "Memory too tight: lots of GC time, data spilled to disk."),
  ]),
  T(["Bound by", "Typical evidence"], [
   ["CPU-bound", "Cores busy, little spill/IO wait; heavy UDFs, decompression, complex expressions."],
   ["Memory-bound", "Spill, high GC time, OOMs."],
   ["I/O-bound", "Time dominated by reading/writing storage or shuffle fetch; many small files."],
  ]),
  ASK("Ask yourself when a job got slower", ["What changed: data volume, code, cluster, runtime?", "Which stage got slow?", "Inside that stage, are ALL tasks slow or only a few?", "Is shuffle read/write much bigger than before?", "Is there spill or high GC time?", "Is the join strategy what I expected (broadcast vs sort-merge)?", "Did the number/size of input files explode (small files)?"]),
 ]})

# ---------------------------------------------------------------- s14 Phase 10
S.append({"id": "ch10-s14", "title": "Phase 10 — Production Engineering, CLI & CI/CD (Preview)",
 "hook": "Not a developer who only knows how to press ‘Run All’.",
 "blocks": [
  P("**Goal:** move beyond notebooks and operate Databricks as a **production software platform**."),
  TERMS([
   ("Databricks CLI", "Command-line tool (`databricks ...`) to manage workspace objects, jobs, bundles, etc."),
   ("Git integration / Git folders", "Clone a Git repo into the workspace and commit/pull/branch from there (formerly *Repos*)."),
   ("Workspace files", "Non-notebook files (`.py`, `.yml`, `.json`) stored in the workspace."),
   ("Python modules", "Reusable `.py` code imported by notebooks/jobs instead of copy-paste."),
   ("Python wheels", "Packaged library (`.whl`) installed on compute."),
   ("Dependency management", "Pinning libraries per cluster/job/serverless environment for reproducible runs."),
   ("Databricks Connect", "Run Spark code from your local IDE against remote Databricks compute."),
   ("IDE workflows", "Develop locally (e.g. VS Code), test, then deploy."),
  ]),
  C("key", "Declarative Automation Bundles", "Per the source, the **current name of the former Databricks Asset Bundles (DABs)**. You describe jobs, pipelines, source files, deployment targets and other resources as **version-controlled configuration**, then validate and deploy via CI/CD."),
  CODE("yaml", "bundle:\n  name: orders_project\n\nresources:\n  jobs:\n    orders_job:          # resource KEY\n      name: orders-job   # display name\n      tasks:\n        ...\n\ntargets:\n  dev:\n    mode: development\n  prod:\n    mode: production", "databricks.yml — the primary bundle file (YAML)"),
  CODE("bash", "databricks bundle validate\ndatabricks bundle deploy -t dev\ndatabricks bundle run orders_job -t dev", "Bundle commands"),
  T(["Command", "Does"], [
   ["`bundle validate`", "Checks the bundle configuration for errors before deploying."],
   ["`bundle deploy -t dev`", "Uploads files and creates/updates resources in the `dev` target."],
   ["`bundle run orders_job -t dev`", "Runs the deployed resource identified by its **key** in the `dev` target."],
  ]),
  C("pitfall", "Key, not display name", "`bundle run` takes the resource **key** (`orders_job`), not the job's display `name` (`orders-job`)."),
  C("tip", "Target modes", "`mode: development` deploys per-user copies (names prefixed with `[dev user]`, schedules paused). `mode: production` is for the real deployment, ideally run as a **service principal**."),
  C("pitfall", "Personal identity in CI/CD", "Deploying or running production with a person's token is risky and breaks when people leave or change roles. Use a **service principal** as the deployment identity."),
  TERMS([
   ("Git branching", "Feature branches → PR → main; deployments come from tracked commits."),
   ("Validation / testing", "Run `bundle validate` + unit/integration tests in CI before deploy."),
   ("Environment-specific configuration", "Per-target settings (catalog, cluster size, schedule) in the bundle."),
   ("Dev / test / prod", "Separate environments; promote the same code through them."),
   ("Service principals / deployment identities", "Prod deploys and runs under a non-human identity, not a person's account."),
   ("Reproducible deployments / rollbacks", "Same commit → same deployment; roll back by redeploying a previous version."),
   ("Secrets / configuration", "Credentials kept in secret scopes, never hard-coded."),
   ("Production release workflow", "Branch → CI validate/test → deploy to test → approve → deploy to prod."),
  ]),
 ]})

# ---------------------------------------------------------------- s15 Assessment
S.append({"id": "ch10-s15", "title": "Assessment Strategy: Certification vs Engineering Questions",
 "hook": "Two kinds of questions — the second kind is what makes you genuinely good.",
 "blocks": [
  CMP(("Certification-style", ["Pick the right product/feature", "Short scenario → one correct choice", "e.g. which compute for a scheduled job?"]),
      ("Engineering-style", ["Read symptoms and numbers", "Form a hypothesis, prove it with evidence", "Propose fixes"])),
  P("**Certification example:** *You need to run a scheduled PySpark workload without managing infrastructure. Which compute should you use?* → **Serverless Jobs** (serverless job compute)."),
  P("**Engineering example:** *A 2 TB ETL job went from 12 to 45 minutes. One stage has 1,000 tasks; 997 finish in 20 seconds, 3 run for 15 minutes while spilling 80 GB each.*"),
  D("task duration\n 15 min │                     ███ ← 3 tasks\n        │                     ███   80 GB spill\n        │                     ███   each\n 20 s   │████████████████████ ███\n        └───────────────────────────\n          997 tasks            3", "Long-tail task distribution = skew signature"),
  C("key", "Expected reasoning", "**Likely data skew.** Then know *why*, *how to prove it in the Spark UI* and *which fixes exist*."),
  L(["Spark UI", "Task-duration distribution", "Shuffle read/write", "Spill", "Partition sizes", "Join/grouping keys", "Physical plan"]),
  C("interview", "How to answer", "Name the hypothesis (skew), show the evidence (median ≈ 20 s vs max ≈ 15 min, shuffle read and spill concentrated in 3 tasks), find the hot key (e.g. one huge customer or NULLs), then fixes: AQE skew-join handling, salting, broadcasting the small side, handling hot keys/NULLs separately."),
  ASK("Ask yourself on a straggler stage", ["Are only a few tasks slow while most are fast?", "Do those tasks read far more shuffle data/records?", "Are they the ones spilling?", "Which join or groupBy key feeds that stage?", "Is one key value (or NULL) dominating?", "Does the plan show a SortMergeJoin that could be broadcast?"]),
  C("exam", "More hardware ≠ fix for skew", "Adding workers doesn't help: the 3 huge partitions are still processed by 3 single tasks."),
 ]})
