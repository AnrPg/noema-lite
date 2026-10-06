# Exercises for ch10
EX = []
def add(type_, sec, diff, tags, q, explain=None, quick=False, **kw):
    e = {"id": f"ch10-e{len(EX)+1:03d}", "type": type_, "section": f"ch10-s{sec:02d}",
         "difficulty": diff, "tags": tags, "quick": quick, "q": q}
    if explain: e["explain"] = explain
    e.update(kw)
    EX.append(e)

def opt(text, ok, fb): return {"text": text, "ok": ok, "fb": fb}

# ======================= s01
add("mcq", 1, 1, ["concept"], "What is the new contract for every phase of the course?",
 "Every unit must combine theory/architecture/best practices with real UI, SQL, PySpark, CLI/YAML syntax, debugging and exercises. The tutor explicitly dropped the isolated ‘one concept at a time’ style because it stayed cut off from the real platform.",
 quick=True,
 options=["Theory first; syntax only in a final project", "Both theory/best practices AND real UI/SQL/PySpark/CLI syntax, debugging and exercises", "Only certification-style multiple choice drills", "Only hands-on notebooks without architecture"],
 answer=1,
 why=["Syntax is not postponed — it's in every lesson.", "Correct: both, in every phase.", "Exams are one goal among job and projects.", "Architecture and best practices are mandatory too."])
add("tf", 1, 1, ["exam"], "The current Databricks Data Engineer Associate exam mainly tests DataFrame transformations; deployment and troubleshooting are out of scope.",
 "False. The source stresses the exam now covers architecture, compute, Delta/Unity Catalog, ingestion, orchestration, Spark troubleshooting and deployment concepts — not only transformations. That's exactly why the plan covers all of them.",
 quick=True, answer=False)
add("bucket", 1, 2, ["concept"], "Sort these already-covered topics into the two groups of the ‘Already covered’ map.",
 "Foundations are engine/data-modeling ideas (Spark execution, partitions, shuffle, CDC, schema evolution, medallion). Databricks fundamentals are platform concepts (control vs compute plane, Photon, pools, SQL warehouses, access). Keeping the split clear tells you whether a question is about Spark itself or about the Databricks platform.",
 buckets=["Foundations", "Databricks fundamentals"],
 items=[{"text": "partitions / shuffle", "bucket": 0}, {"text": "CDC", "bucket": 0}, {"text": "medallion architecture", "bucket": 0}, {"text": "schema evolution", "bucket": 0}, {"text": "joins / physical plans", "bucket": 0},
        {"text": "control vs compute plane", "bucket": 1}, {"text": "Photon", "bucket": 1}, {"text": "pools", "bucket": 1}, {"text": "SQL warehouses", "bucket": 1}, {"text": "compute access", "bucket": 1}])
add("match", 1, 2, ["concept"], "Match each already-covered fundamental to its one-line definition.",
 "The control plane is Databricks' managed backend; the compute plane is where data is processed. DBR is the software image, Photon the vectorized engine, and pools are pre-warmed VMs that shorten start-up. These terms reappear in Phase 1 in much more depth.",
 pairs=[["Control plane", "Databricks-managed backend: UI, scheduler, cluster manager"], ["Compute plane", "Where your data is actually processed"], ["DBR", "Versioned image: Spark + Delta + libraries + OS"], ["Photon", "Native vectorized C++ query engine"], ["Pool", "Pre-warmed idle VMs for faster cluster start"]])
add("odd", 1, 2, ["concept"], "Which item was NOT already covered before the roadmap started?",
 "Row filters/column masks belong to Phase 3 (Unity Catalog governance) and are still ahead. Photon, pools and autoscaling were all part of the Databricks fundamentals already taught.",
 options=["Photon", "Pools", "Row filters and column masks", "Autoscaling"], answer=2)

# ======================= s02
add("order", 2, 1, ["concept"], "Put the FIRST five phases of the roadmap in dependency order.",
 "Compute comes first because everything runs on it; Delta is the storage format; Unity Catalog governs those tables; ingestion loads data into governed tables; streaming generalizes ingestion into continuous processing. Each layer needs the previous one.",
 quick=True, items=["Compute", "Delta Lake", "Unity Catalog", "Ingestion", "Structured Streaming"])
add("order", 2, 2, ["concept"], "Put the LAST five phases of the roadmap in order.",
 "Declarative pipelines build on streaming; Jobs orchestrate pipelines and notebooks; Databricks SQL serves the results; performance & debugging needs all prior layers; production CI/CD packages everything for deployment.",
 items=["Declarative Pipelines", "Jobs", "Databricks SQL", "Performance and Debugging", "Production CI/CD"])
add("free", 2, 2, ["concept", "interview"], "Explain in your own words why the plan puts **compute before Delta**.",
 "A good answer links Delta operations to their execution on compute and to dependency order.",
 model="Every Delta operation — MERGE, OPTIMIZE, a streaming write — is finally executed as Spark tasks on a driver and executors. To understand why a MERGE shuffles, why OPTIMIZE takes time, why a write creates many small files or why something OOMs, I need cores, task slots, partitions, memory and shuffle first. The plan follows dependency order: each layer needs the previous one, and compute is the bottom layer.",
 rubric=["Delta commands run as Spark tasks on compute", "Mentions cores/tasks/partitions/shuffle/memory as prerequisites", "Explains performance/cost of Delta ops depends on compute", "Names dependency order (each layer needs the previous)"])
add("mcq", 2, 1, ["concept"], "Why does the plan refuse to follow the workspace menu order (Workspace → Catalog → Compute → Jobs → SQL)?",
 "Menu order is good for a product tour, not for learning — it presents concepts before what they depend on. Dependency order lets you explain why things work, not just where buttons are.",
 quick=True,
 options=["The menu changes too often", "Menu order is a product tour; learning needs dependency order", "The menu hides Unity Catalog", "The exam follows reverse menu order"], answer=1,
 why=["Not the stated reason.", "Correct — the exact reasoning in the source.", "UC is visible in the menu (Catalog).", "Nothing like this is stated."])
add("tf", 2, 1, ["concept"], "In the roadmap, Jobs (orchestration) comes before Declarative Pipelines.",
 "False. Pipelines are Phase 6 and Jobs are Phase 7: you first learn to build pipelines, then how to orchestrate them (and notebooks, SQL…) in production workflows.",
 answer=False)
add("match", 2, 2, ["concept"], "Match the phase number to its topic.",
 "1 Compute, 2 Delta, 3 Unity Catalog, 4 Ingestion, 5 Streaming, 6 Declarative Pipelines, 7 Jobs, 8 Databricks SQL, 9 Performance & Debugging, 10 Production/CI-CD. Knowing the numbers helps you navigate the plan file.",
 pairs=[["Phase 3", "Unity Catalog Mastery"], ["Phase 4", "Data Ingestion"], ["Phase 6", "Lakeflow Spark Declarative Pipelines"], ["Phase 8", "Databricks SQL"], ["Phase 9", "Performance and Debugging"], ["Phase 10", "Production Engineering, CLI, and CI/CD"]])
add("cloze", 2, 1, ["concept"], "Complete the principle behind the learning order.",
 "The curriculum follows dependency order rather than the Databricks menu layout, because each next layer needs the previous one. The menu order would be a product tour.",
 text="The curriculum follows [[dependency]] order rather than the Databricks [[menu]] layout: each next layer needs the [[previous]] one. The first phase is [[Compute]].",
 bank=["alphabetical", "exam", "next", "Delta"])

# ======================= s03
add("order", 3, 1, ["concept"], "Order the first 8 questions of the standard lesson structure.",
 "The route goes from WHY (problem, without Databricks, which component) to HOW (internals, architecture) to USE (UI, syntax, production example). Starting from the problem keeps features anchored to what they solve.",
 quick=True, items=["What problem are we solving?", "How would we solve it without Databricks?", "Which Databricks component solves it?", "How does it work internally?", "Where does it sit in the architecture?", "How do I use it in the UI?", "What is the real syntax?", "What does a production example look like?"])
add("order", 3, 2, ["concept"], "Order questions 9–17 of the standard lesson structure.",
 "After USE comes JUDGE (alternatives, when not, best practices, common mistakes), then BREAK (debugging, certification traps), then PROVE (exercises, full solutions, mini-project). Debugging comes after you know the common mistakes.",
 items=["What alternatives exist?", "When should I not use it?", "Best practices", "Common mistakes", "Debugging workflow", "Certification traps", "Exercises", "Full solutions", "Mini-project extension"])
add("mcq", 3, 1, ["concept"], "Which questions of the lesson structure does the tutor say he will insist on most?",
 "6–8: UI, real syntax and a production example. The learner had complained that two lessons on a tool without seeing a single real configuration or source file were useless.",
 quick=True,
 options=["1–3 (problem framing)", "6–8 (UI, real syntax, production example)", "9–10 (alternatives, when not to use)", "15–17 (exercises, solutions, mini-project)"], answer=1)
add("cloze", 3, 1, ["concept"], "Fill in the lesson-structure blocks.",
 "Questions 1–3 frame the problem, 6–8 are the practical core, 13 is the debugging workflow and 17 extends the ongoing project. Remember the six blocks WHY-HOW-USE-JUDGE-BREAK-PROVE.",
 quick=True,
 text="Question 1 asks what [[problem]] we are solving; question 2 asks how we would solve it [[without Databricks]]; question 10 asks when we should [[not]] use it; question 13 is the [[debugging]] workflow; question 17 is the [[mini-project]] extension.",
 bank=["syntax", "always", "pricing", "UI"])
add("tf", 3, 1, ["concept"], "The standard lesson structure starts with the real syntax so you can try things immediately.",
 "False. It starts with *What problem are we solving?* and *How would we solve it without Databricks?*. Syntax is question 7 — after you know what the component is and where it sits.",
 answer=False)
add("scenario", 3, 2, ["concept", "debug"], "You apply the 17-question structure to a feature you have never studied: **Auto Loader**.",
 steps=[
  {"prompt": "Question 1 — what problem are we solving?", "options": [
    opt("Ingest only the NEW files that keep landing in cloud storage, without reprocessing old ones", True, "Right — incremental file ingestion is the core problem."),
    opt("Making queries on gold tables faster", False, "That's a performance/layout concern, not what Auto Loader solves."),
    opt("Granting analysts access to tables", False, "That's Unity Catalog's job.")]},
  {"prompt": "Question 2 — how would you solve it without Databricks?", "options": [
    opt("Keep my own table of processed file names and run a cron script that lists the folder and loads unseen files", True, "Exactly — and this shows what Auto Loader automates: discovery + state (checkpoint) + schema handling."),
    opt("Reload the entire folder every run and overwrite the table", False, "That works but re-reads everything; it's the inefficiency Auto Loader removes."),
    opt("It can't be done without Databricks", False, "It can — the manual version exposes the real mechanics.")]},
  {"prompt": "Question 10 — when should you NOT use it?", "options": [
    opt("For a one-off load of a few known files, where a plain `spark.read` or `COPY INTO` is simpler", True, "Correct — ‘when NOT to use’ forces you to know the alternatives (question 9)."),
    opt("Never — Auto Loader is always the best choice", False, "Every tool has a ‘when not’; skipping question 10 is a classic gap."),
    opt("Whenever the data is JSON", False, "JSON is a supported `cloudFiles.format`.")]},
 ])
add("free", 3, 2, ["concept"], "Why is question 2 — *How would we solve it without Databricks?* — valuable?",
 "Look for: reveals the real problem, shows what the component abstracts, helps with failure modes/alternatives.",
 model="Doing it by hand exposes the actual problem and the moving parts (state, scheduling, schema handling). Then I can see exactly what the Databricks component automates and why it's designed that way, which also tells me how it can fail and what the alternatives are.",
 rubric=["Exposes the real underlying problem", "Shows what the component abstracts/automates", "Helps understand design, failure modes or alternatives"])
add("scenario", 3, 3, ["debug"], "Lesson question **13. Debugging workflow** in action: you just learned Jobs and your first job task fails with a vague error.",
 steps=[
  {"prompt": "What mindset does question 13 ask for first?", "options": [
    opt("A systematic, ordered checklist of where the failure can come from", True, "Yes — every lesson ends with an ordered debugging model (e.g. upstream → compute → runtime → …)."),
    opt("Re-run until it passes", False, "Retries hide the cause; they're a setting, not a diagnosis."),
    opt("Increase the cluster size", False, "That's the ‘blind scaling’ the plan explicitly rejects.")]},
  {"prompt": "The upstream task succeeded and compute started fine. Next?", "options": [
    opt("Continue down the list: runtime → library → permissions → parameter → data → Spark execution", True, "Right — keep walking the model instead of jumping to a favorite guess."),
    opt("Assume it's Spark skew", False, "Skew is the last bucket (Spark execution); check cheaper causes first."),
    opt("Delete the job and recreate it", False, "Destroys evidence (run history) without explaining anything.")]},
 ])

# ======================= s04
add("bucket", 4, 2, ["concept"], "Which of the four interfaces does each item belong to?",
 "SQL covers DDL/DML and governance statements; PySpark covers DataFrame, read/write, streaming and Delta APIs; platform config covers compute, Jobs, Pipelines and Bundles YAML; CLI/external covers `databricks …` commands, Git and Databricks Connect.",
 quick=True,
 buckets=["SQL", "PySpark", "Platform / config", "CLI / external dev"],
 items=[{"text": "GRANT SELECT ON TABLE …", "bucket": 0}, {"text": "COPY INTO …", "bucket": 0}, {"text": "DeltaTable.forName(…)", "bucket": 1}, {"text": "spark.readStream", "bucket": 1},
        {"text": "databricks.yml resources", "bucket": 2}, {"text": "worker type & autoscaling settings", "bucket": 2}, {"text": "databricks bundle deploy -t dev", "bucket": 3}, {"text": "Databricks Connect from VS Code", "bucket": 3}, {"text": "MERGE INTO …", "bucket": 0}, {"text": "Job task dependencies", "bucket": 2}])
add("bucket", 4, 2, ["concept"], "Second round — interface for each item.",
 "REVOKE and Delta DML are SQL; read/write and streaming APIs are PySpark; pipeline settings and Bundles YAML are platform configuration; Git and deployment workflows are CLI/external development.",
 buckets=["SQL", "PySpark", "Platform / config", "CLI / external dev"],
 items=[{"text": "REVOKE", "bucket": 0}, {"text": "UPDATE / DELETE (Delta DML)", "bucket": 0}, {"text": "df.writeTo(…)", "bucket": 1}, {"text": ".writeStream", "bucket": 1}, {"text": "Pipeline settings", "bucket": 2}, {"text": "Bundles YAML targets", "bucket": 2}, {"text": "Git", "bucket": 3}, {"text": "Deployment workflows", "bucket": 3}])
add("bucket", 4, 1, ["concept"], "Place each table/source of the e-commerce lakehouse in its layer.",
 "Sources are raw feeds (customers CDC, orders JSON, products CSV, events stream). Bronze keeps raw copies (`*_raw`), silver holds cleaned entities, gold holds business aggregates like `daily_revenue` and `customer_360`.",
 buckets=["sources", "BRONZE", "SILVER", "GOLD"],
 items=[{"text": "orders JSON", "bucket": 0}, {"text": "events stream", "bucket": 0}, {"text": "customers_raw", "bucket": 1}, {"text": "products_raw", "bucket": 1}, {"text": "customers", "bucket": 2}, {"text": "events", "bucket": 2}, {"text": "daily_revenue", "bucket": 3}, {"text": "customer_360", "bucket": 3}, {"text": "conversion_metrics", "bucket": 3}, {"text": "product_performance", "bucket": 3}])
add("tf", 4, 1, ["concept"], "The plan uses a separate toy example in each lesson so that topics don't interfere with each other.",
 "False. Separate toy examples make you lose the big picture. The plan builds ONE production-style project (an e-commerce lakehouse) that grows with every phase.",
 quick=True, answer=False)
add("mcq", 4, 1, ["concept"], "In the project, which source arrives as a CDC feed?",
 "Customers arrive as CDC (inserts/updates/deletes), orders as JSON files, products as CSV and events as a stream. CDC is where MERGE and AUTO CDC will be practiced.",
 options=["customers", "orders", "products", "events"], answer=0)
add("odd", 4, 2, ["concept"], "Three of these are listed under ‘Platform / configuration’. Which one is not?",
 "Jobs, Pipelines and Bundles YAML are platform configuration. The DataFrame API is a PySpark interface.",
 options=["Jobs", "Pipelines", "Bundles YAML", "DataFrame API"], answer=3)
add("match", 4, 2, ["concept"], "Match the source feed to its format in the project.",
 "Each source deliberately uses a different shape so the course can practice CDC, JSON/CSV file ingestion and streaming on one project.",
 pairs=[["customers", "CDC"], ["orders", "JSON"], ["products", "CSV"], ["events", "stream"]])

# ======================= s05
add("calc", 5, 1, ["calc"], "Compute Part 3 config: 4 workers × 8 cores each (plus a driver). Roughly how many Spark tasks can run concurrently?",
 "Task slots = worker cores = 4 × 8 = 32 (one task per executor core). The driver schedules tasks but does not run them, so its cores are not counted.",
 quick=True, answer=32, tolerance=0, unit="tasks")
add("calc", 5, 2, ["calc", "pitfall"], "Phase 1 practice config: driver 16 cores; workers 8 cores each, min 2, max 10. What is the MAXIMUM number of concurrent task slots?",
 "Only worker cores count: 10 × 8 = 80. Adding the driver's 16 (= 96) is the classic trap. At minimum scale you'd have 2 × 8 = 16 slots.",
 answer=80, tolerance=0, unit="task slots")
add("calc", 5, 2, ["calc"], "With 32 task slots, a stage has 1,000 partitions of similar size. About how many ‘waves’ of tasks are needed?",
 "Each wave runs up to 32 tasks: 1000 / 32 = 31.25, so 32 waves (the last one partial). Many partitions keep all cores busy; too few would leave cores idle.",
 answer=32, tolerance=1, unit="waves")
add("tf", 5, 1, ["pitfall"], "With a 16-core driver and 2 workers of 8 cores, the cluster can run 32 tasks in parallel.",
 "False. Tasks run on executors on the workers: 2 × 8 = 16 slots. The driver's cores coordinate (planning, scheduling, collecting results) and don't add task slots.",
 quick=True, answer=False)
add("mcq", 5, 2, ["pitfall", "calc"], "4 workers × 8 cores, but the stage has only 4 partitions. What happens?",
 "One task per partition → only 4 tasks, so 28 of 32 cores sit idle. Too few partitions waste the cluster no matter how big it is — that's why partition count is part of compute mastery.",
 options=["32 tasks run, each with 1/8 of a partition", "4 tasks run; 28 cores sit idle", "Spark automatically splits into 32 partitions always", "The job fails"], answer=1,
 why=["A partition is not split across tasks automatically.", "Correct.", "Spark does not always repartition to match cores.", "Nothing fails; it's just inefficient."])
add("match", 5, 2, ["concept"], "Match the classic compute term to its definition.",
 "A task slot is one executor core. Pools keep warm VMs; policies restrict settings; spot instances are cheap but reclaimable; auto-termination stops idle clusters to save money.",
 pairs=[["Task slot", "One executor core = one concurrently running task"], ["Pool", "Pre-warmed idle instances to start/scale faster"], ["Compute policy", "Admin rules restricting allowed compute settings"], ["Spot instance", "Cheap spare capacity that can be reclaimed"], ["Auto-termination", "Stops the cluster after N idle minutes"]])
add("bucket", 5, 2, ["compare"], "Serverless compute: is each item managed for you, or still something you configure?",
 "Serverless abstracts the infrastructure envelope (instance types, worker counts, spot/on-demand, pools, driver size). You still own your code, the environment version and Python dependencies, and job/notebook parameters.",
 buckets=["Abstracted away by Databricks", "Still yours to configure"],
 items=[{"text": "Worker instance type", "bucket": 0}, {"text": "Number of workers / autoscale bounds", "bucket": 0}, {"text": "Spot vs on-demand", "bucket": 0}, {"text": "Pools", "bucket": 0},
        {"text": "Python dependencies (environment)", "bucket": 1}, {"text": "Your notebook/job code", "bucket": 1}, {"text": "Task parameters", "bucket": 1}])
add("odd", 5, 2, ["exam"], "Officially, classic compute includes three resource kinds. Which item is NOT one of them?",
 "Databricks splits compute into serverless, classic and SQL warehouses; classic covers all-purpose, jobs and Lakeflow pipeline resources. SQL warehouses are their own category.",
 options=["All-purpose compute", "Jobs compute", "Lakeflow pipeline compute", "SQL warehouse"], answer=3)
add("cloze", 5, 1, ["exam"], "Complete the official compute taxonomy.",
 "Three top-level categories: serverless, classic, SQL warehouses. Classic itself contains all-purpose, jobs and Lakeflow pipeline resources.",
 text="Databricks officially splits compute into [[serverless]], [[classic]] and [[SQL warehouses]]; classic includes [[all-purpose]], jobs and Lakeflow pipeline resources.",
 bank=["pools", "spot", "Photon"])

# ======================= s06
add("match", 6, 1, ["syntax"], "Match each Delta SQL command to what it does.",
 "DESCRIBE DETAIL = current table metadata; DESCRIBE HISTORY = per-version provenance; RESTORE = new version with old state; VACUUM = physical delete of unreferenced files; OPTIMIZE = compaction/layout; TRUNCATE = remove all rows.",
 quick=True,
 pairs=[["DESCRIBE DETAIL", "Current metadata: format, location, numFiles, size"], ["DESCRIBE HISTORY", "Version, timestamp, user, operation, metrics"], ["RESTORE", "New current version equal to an old state"], ["VACUUM", "Physically delete expired unreferenced files"], ["OPTIMIZE", "Compact small files / re-layout"], ["TRUNCATE", "Remove all rows, keep the table"]])
add("bucket", 6, 1, ["syntax"], "SQL syntax or PySpark/Delta API?",
 "Phase 2 teaches both sides: SQL statements (MERGE, ALTER TABLE, DESCRIBE HISTORY, VACUUM) and the Python APIs (writeTo, DeltaTable.forName, insertInto, saveAsTable).",
 buckets=["SQL", "PySpark / Delta API"],
 items=[{"text": "MERGE", "bucket": 0}, {"text": "ALTER TABLE", "bucket": 0}, {"text": "DESCRIBE HISTORY", "bucket": 0}, {"text": "VACUUM", "bucket": 0}, {"text": "df.writeTo(...)", "bucket": 1}, {"text": "DeltaTable.forName(...)", "bucket": 1}, {"text": "insertInto(...)", "bucket": 1}, {"text": "saveAsTable(...)", "bucket": 1}])
add("tf", 6, 2, ["pitfall", "syntax"], "`df.write.insertInto(\"prod.silver.orders\")` matches DataFrame columns to table columns by name.",
 "False — `insertInto` is positional. If the DataFrame's column order differs, values silently go into the wrong columns (or fail on type mismatch). Select columns in table order or use `saveAsTable`/`writeTo` which resolve by name.",
 quick=True, answer=False)
add("mcq", 6, 2, ["concept"], "A daily job rewrites yesterday's partition of a partitioned table. Which technique replaces only the partitions present in the new data?",
 "Dynamic (partition) overwrite only replaces partitions that appear in the incoming DataFrame. A plain overwrite would wipe every other day's data; append would duplicate yesterday.",
 options=["Plain `mode(\"overwrite\")`", "Dynamic overwrite (`partitionOverwriteMode=dynamic`)", "`mode(\"append\")`", "`VACUUM` then append"], answer=1,
 why=["Static overwrite replaces the whole table.", "Correct.", "Re-running append creates duplicates.", "VACUUM deletes unreferenced files; it doesn't replace data."])
add("match", 6, 2, ["concept"], "Match the Delta engineering topic to its definition.",
 "Type widening changes a type to a wider one without rewrite; deletion vectors mark rows deleted without immediate rewrite; idempotent MERGE can be re-run safely; late-arriving data must not overwrite newer state; schema enforcement rejects mismatched writes.",
 pairs=[["Type widening", "INT → BIGINT without rewriting data files"], ["Deletion vectors", "Mark rows deleted instead of rewriting the Parquet file"], ["Idempotent MERGE", "Re-running the same input causes no duplicates"], ["Late-arriving data", "Old events arriving after newer ones for the same key"], ["Schema enforcement", "Writes with a mismatched schema are rejected"]])
add("odd", 6, 1, ["concept"], "Which one is NOT a ‘physical optimization’ topic of Phase 2?",
 "Small files, OPTIMIZE, data skipping, file statistics, liquid clustering and predictive optimization are physical layout topics. Time travel is an engineering/usage topic (querying old snapshots).",
 options=["Liquid Clustering", "Data skipping", "Time travel", "Predictive optimization"], answer=2)
add("write", 6, 2, ["syntax"], "Using the Delta Python API, delete all rows with `status = 'test'` from `prod.silver.orders`.",
 "`DeltaTable.forName(spark, name)` returns a DeltaTable object; `.delete(condition)` commits a DELETE as a new table version — the same result as SQL `DELETE FROM … WHERE …`.",
 solution="from delta.tables import DeltaTable\n\norders = DeltaTable.forName(spark, \"prod.silver.orders\")\norders.delete(\"status = 'test'\")",
 keywords=["DeltaTable.forName", ".delete(", "prod.silver.orders"], lang="python")
add("cloze", 6, 1, ["exam", "pitfall"], "OPTIMIZE vs VACUUM vs predictive optimization.",
 "OPTIMIZE reorganizes active files; VACUUM physically deletes expired unreferenced files; predictive optimization runs OPTIMIZE/VACUUM/ANALYZE automatically for UC managed tables. Confusing OPTIMIZE and VACUUM is a common exam trap.",
 quick=True,
 text="[[OPTIMIZE]] compacts and re-lays out active files; [[VACUUM]] physically deletes expired, unreferenced files; predictive optimization runs them automatically for Unity Catalog [[managed]] tables.",
 bank=["RESTORE", "external", "TRUNCATE"])

# ======================= s07
add("order", 7, 1, ["concept"], "Order the Unity Catalog namespace from the top down to a table.",
 "Metastore (top container per region) → catalog → schema → table/view/volume/function/model. The 3-level name `catalog.schema.table` lives inside one metastore.",
 quick=True, items=["Metastore", "Catalog", "Schema", "Table"])
add("order", 7, 2, ["concept"], "Order the topics as Phase 3 will teach them (teaser at the end of Phase 2).",
 "Namespace first (catalog → schema → tables → volumes), then storage access (credentials/locations), then permissions (grants/ownership → service principals → fine-grained row filters/masks/ABAC), then lineage. Systematic PERMISSION_DENIED debugging ties it together.",
 items=["Catalog", "Schema", "Managed / external tables", "Volumes", "Storage credentials / external locations", "Grants / ownership", "Service principals", "Row filters / masks / ABAC", "Lineage"])
add("order", 7, 2, ["debug"], "Order the PERMISSION_DENIED debugging chain.",
 "Start with identity (who am I, which principal runs the job), then walk the privileges top-down (USE CATALOG → USE SCHEMA → SELECT/MODIFY), then ownership, and finally storage credentials for path-based access.",
 quick=True, items=["Who am I?", "What principal is the job using?", "USE CATALOG?", "USE SCHEMA?", "SELECT / MODIFY?", "Ownership?", "Storage credential?"])
add("write", 7, 2, ["syntax", "exam"], "Write the three GRANTs that let group `analysts` read `prod.silver.orders` (nothing more).",
 "Reading requires USE CATALOG on the catalog, USE SCHEMA on the schema and SELECT on the table. Granting only SELECT is the classic mistake — without the USE privileges the table is unreachable.",
 solution="GRANT USE CATALOG ON CATALOG prod TO `analysts`;\nGRANT USE SCHEMA ON SCHEMA prod.silver TO `analysts`;\nGRANT SELECT ON TABLE prod.silver.orders TO `analysts`;",
 keywords=["GRANT USE CATALOG ON CATALOG prod", "GRANT USE SCHEMA ON SCHEMA prod.silver", "GRANT SELECT ON TABLE prod.silver.orders", "`analysts`"], lang="sql")
add("spotbug", 7, 2, ["syntax", "pitfall"], "Click the buggy line in this grant script for `data-engineers`.",
 "`USE CATALOG` is a catalog-level privilege; on a schema you grant `USE SCHEMA`. The securable type in `ON …` must match the privilege.",
 lines=["GRANT USE CATALOG ON CATALOG prod TO `data-engineers`;", "GRANT USE CATALOG ON SCHEMA prod.silver TO `data-engineers`;", "GRANT SELECT ON TABLE prod.silver.orders TO `data-engineers`;"],
 bugs=[1], fix="GRANT USE SCHEMA ON SCHEMA prod.silver TO `data-engineers`;")
add("match", 7, 2, ["concept"], "Match the storage/namespace object to its definition.",
 "Storage credential = cloud identity; external location = path + credential; volume = governed non-tabular files; managed table = UC owns data lifecycle; external table = data at your path; metastore = top-level container.",
 pairs=[["Storage credential", "Wraps a cloud IAM role / managed identity"], ["External location", "Cloud path + the credential used to access it"], ["Volume", "Governed non-tabular files under /Volumes/…"], ["Managed table", "UC manages metadata AND data files; DROP deletes data"], ["External table", "Data stays at your path; DROP keeps files"], ["Metastore", "Top-level UC container per region"]])
add("match", 7, 2, ["concept"], "Match the governance feature to its definition.",
 "Row filters hide rows; column masks hide values; ABAC applies policies via tags at scale; lineage tracks data flow; Delta Sharing shares data externally; Lakehouse Federation queries external databases in place.",
 pairs=[["Row filter", "UDF deciding which rows a user sees"], ["Column mask", "UDF returning a masked value for unauthorized users"], ["ABAC", "Tag-driven policies applying filters/masks at scale"], ["Lineage", "Automatic record of which tables/columns feed which"], ["Delta Sharing", "Open protocol to share live data with other orgs"], ["Lakehouse Federation", "Query external databases without ingesting them"]])
add("scenario", 7, 3, ["debug"], "A scheduled job fails with `PERMISSION_DENIED` reading `prod.silver.orders`. When you run the same notebook yourself, it works.",
 steps=[
  {"prompt": "First question to ask?", "options": [
    opt("Which principal is the job actually running as?", True, "Yes — your success proves only that YOU have access. The job may run as its owner or a service principal."),
    opt("Is the cluster big enough?", False, "Permissions have nothing to do with cluster size."),
    opt("Should I VACUUM the table?", False, "Unrelated to access control.")]},
  {"prompt": "The job runs as service principal `sp-etl`. `SHOW GRANTS` shows SELECT on the table for `sp-etl`. Next?", "options": [
    opt("Check USE SCHEMA on `prod.silver` and USE CATALOG on `prod` for `sp-etl`", True, "Right — SELECT on the table is useless without the USE privileges on its parents."),
    opt("Grant ALL PRIVILEGES on the metastore to be safe", False, "Violates least privilege and hides the real gap."),
    opt("Conclude the error is a Databricks bug", False, "Walk the chain before blaming the platform.")]},
  {"prompt": "USE SCHEMA is missing. What's the least-privilege fix?", "options": [
    opt("`GRANT USE SCHEMA ON SCHEMA prod.silver TO `sp-etl`` (and USE CATALOG if also missing)", True, "Minimal grant that closes exactly the gap."),
    opt("Make `sp-etl` the owner of the catalog", False, "Ownership grants far more than needed."),
    opt("Run the job as your personal user", False, "Production jobs should not depend on a person's account.")]},
 ])
add("tf", 7, 1, ["exam", "pitfall"], "Granting `SELECT` on a table is sufficient for a user to query it.",
 "False. The user also needs `USE CATALOG` on the parent catalog and `USE SCHEMA` on the parent schema (directly or inherited). This is the most common Unity Catalog permission trap.",
 answer=False)
add("mcq", 7, 1, ["concept", "exam"], "Which identity should a production job or CI/CD deployment run as?",
 "Service principals are non-human identities meant for automation. Personal accounts break when people leave or change roles and violate least-privilege separation.",
 options=["The most senior engineer's user", "A service principal", "The workspace admin", "Any user in the `analysts` group"], answer=1)
add("odd", 7, 2, ["concept"], "Which one is NOT a Unity Catalog securable object inside a schema?",
 "Tables, volumes and functions live inside schemas and are governed by UC. A cluster pool is a compute resource, not a data object in the catalog hierarchy.",
 options=["Table", "Volume", "Function", "Cluster pool"], answer=3)

# ======================= s08
add("match", 8, 1, ["concept"], "Match the Auto Loader term to its meaning.",
 "`cloudFiles` is the source format; schemaLocation stores the inferred schema; schema hints force types; `_rescued_data` keeps non-conforming values; file notification uses cloud events instead of listing directories.",
 quick=True,
 pairs=[["cloudFiles", "Auto Loader's source format name"], ["schemaLocation", "Where the inferred schema and its evolution are stored"], ["Schema hints", "Force types for specific columns"], ["Rescued data column", "Captures values that don't fit the schema"], ["File notification", "Discovers new files via cloud storage events/queues"], ["Directory listing", "Default discovery: lists the input path"]])
add("mcq", 8, 2, ["compare", "exam"], "Which statement best contrasts COPY INTO and Auto Loader?",
 "Both are idempotent at the file level. COPY INTO is a SQL batch command, good for thousands of files; Auto Loader is a streaming source with checkpoint, schema evolution and rescued data, built to scale to millions of files.",
 options=["COPY INTO reprocesses all files every run; Auto Loader doesn't", "COPY INTO is an idempotent SQL load; Auto Loader is a checkpointed streaming source that scales to huge file volumes", "Auto Loader only works with CSV", "They are two names for the same feature"], answer=1,
 why=["COPY INTO skips already-loaded files.", "Correct.", "Auto Loader supports JSON, CSV, Parquet, Avro…", "Different features with different interfaces."])
add("spotbug", 8, 2, ["syntax", "pitfall"], "Find the bug in this Auto Loader read.",
 "Auto Loader is a Structured Streaming source: it must be started with `spark.readStream`, not batch `spark.read`. The rest (cloudFiles.format, schemaLocation, load) is fine.",
 lines=["df = (", "    spark.read", "        .format(\"cloudFiles\")", "        .option(\"cloudFiles.format\", \"json\")", "        .option(\"cloudFiles.schemaLocation\", schema_path)", "        .load(source_path)", ")"],
 bugs=[1], fix="    spark.readStream")
add("write", 8, 2, ["syntax"], "Write an Auto Loader read of JSON files from `source_path`, storing the schema at `schema_path`.",
 "`readStream.format(\"cloudFiles\")` selects Auto Loader; `cloudFiles.format` names the file format; `cloudFiles.schemaLocation` is where the inferred schema is tracked between runs.",
 solution="df = (\n    spark.readStream\n        .format(\"cloudFiles\")\n        .option(\"cloudFiles.format\", \"json\")\n        .option(\"cloudFiles.schemaLocation\", schema_path)\n        .load(source_path)\n)",
 keywords=["readStream", "cloudFiles", "cloudFiles.format", "json", "cloudFiles.schemaLocation", ".load("], lang="python")
add("scenario", 8, 3, ["debug", "pitfall"], "The bronze `orders_raw` table suddenly contains every order twice. Nothing changed in the source folder.",
 steps=[
  {"prompt": "What's your first hypothesis to check?", "options": [
    opt("Was the Auto Loader checkpoint deleted, moved, or changed?", True, "Yes — the checkpoint is the memory of which files were processed. Without it every file looks new."),
    opt("The cluster ran out of memory", False, "OOM would fail the run, not duplicate data."),
    opt("Schema hints are wrong", False, "Hints affect types, not how many times files are read.")]},
  {"prompt": "Git history shows someone changed `checkpointLocation` to a new path last night. What happened?", "options": [
    opt("The new checkpoint had no file state, so all existing files were ingested again", True, "Exactly — that's why ingestion is only ‘exactly-once-ish’."),
    opt("Auto Loader merged both checkpoints", False, "Checkpoints are never merged."),
    opt("Nothing — the checkpoint path doesn't matter", False, "It is the single most important piece of state.")]},
  {"prompt": "Best clean-up and prevention?", "options": [
    opt("Deduplicate (or restore to the version before the bad run) and treat checkpoint paths as fixed, per-stream configuration", True, "Fix the data with DESCRIBE HISTORY/RESTORE or dedup, and never casually change or share checkpoints."),
    opt("Delete the checkpoint again to reset", False, "That would re-ingest everything a third time."),
    opt("Switch to schema inference", False, "Unrelated to duplicates.")]},
 ])
add("tf", 8, 1, ["pitfall"], "Re-running the same `COPY INTO` over the same files loads those files a second time.",
 "False. COPY INTO is idempotent: it tracks already-loaded files and skips them, so a re-run typically loads 0 new rows. (Only a force option would reload them.)",
 answer=False)
add("tf", 8, 2, ["compare"], "Schema inference on CSV/JSON is free — Spark already knows the types without reading the data.",
 "False. Inference requires an extra pass/sample over the data and the guessed types can change between runs. An explicit schema avoids that cost and makes production behavior predictable.",
 answer=False)
add("order", 8, 2, ["debug"], "Order a sensible debug path for ‘rows are missing from bronze’.",
 "First confirm the symptom, then whether the files are actually where the stream reads, then the stream's state (checkpoint), then schema/malformed rows that may have been rescued or dropped. Cheap facts before deep hypotheses.",
 items=["Confirm which rows/files are missing", "Check the files actually landed in the path the stream reads", "Check the checkpoint (already processed? wrong path?)", "Check schema drift / `_rescued_data` for malformed rows"])
add("cloze", 8, 1, ["syntax"], "Complete the Auto Loader skeleton.",
 "Auto Loader = `readStream` + format `cloudFiles`; options are prefixed `cloudFiles.` (format, schemaLocation).",
 quick=True, asCode=True,
 text="spark.[[readStream]]\n  .format(\"[[cloudFiles]]\")\n  .option(\"cloudFiles.[[format]]\", \"json\")\n  .option(\"cloudFiles.[[schemaLocation]]\", schema_path)\n  .load(source_path)",
 bank=["read", "delta", "checkpointLocation", "header"])

# ======================= s09
add("match", 9, 1, ["concept"], "Match the streaming term to its meaning.",
 "Micro-batches are small batch jobs; the checkpoint stores progress; offsets mark source position; state is kept across batches; the watermark bounds lateness and lets old state be dropped.",
 quick=True,
 pairs=[["Micro-batch", "Stream processed as a series of small batch jobs"], ["Checkpoint", "Durable progress: offsets, commits, state"], ["Offset", "Source position read up to"], ["State", "Data remembered across batches (aggregations, dedup)"], ["Watermark", "Bound on lateness so old state can be dropped"]])
add("bucket", 9, 2, ["compare"], "Stateless or stateful transformation?",
 "Stateless ops look at one row at a time (filter, select, withColumn). Stateful ops must remember data across micro-batches: aggregations, windowed counts, streaming dedup, stream-stream joins — they need state and usually a watermark.",
 buckets=["Stateless", "Stateful"],
 items=[{"text": "filter(amount > 0)", "bucket": 0}, {"text": "select / withColumn", "bucket": 0}, {"text": "explode a JSON array", "bucket": 0},
        {"text": "groupBy(customer).count()", "bucket": 1}, {"text": "window aggregation over 10 minutes", "bucket": 1}, {"text": "dropDuplicates with watermark", "bucket": 1}, {"text": "stream-stream join", "bucket": 1}])
add("mcq", 9, 2, ["concept"], "Which output mode writes the ENTIRE result table on every trigger?",
 "Complete mode rewrites the whole aggregated result each trigger. Append writes only new finalized rows; update writes only rows that changed.",
 options=["append", "update", "complete", "overwrite"], answer=2)
add("cloze", 9, 1, ["syntax"], "Complete the streaming write from the plan.",
 "The checkpoint is set via `checkpointLocation`, the trigger via `processingTime`, and `toTable` starts the query into the target table.",
 quick=True, asCode=True,
 text="query = (events\n  .[[writeStream]]\n  .format(\"delta\")\n  .option(\"[[checkpointLocation]]\", checkpoint)\n  .trigger([[processingTime]]=\"30 seconds\")\n  .[[toTable]](\"bronze.events\"))",
 bank=["write", "schemaLocation", "save", "interval"])
add("tf", 9, 2, ["pitfall"], "Because Structured Streaming writing to Delta is exactly-once, duplicates in the target are impossible.",
 "False — that's why the plan says exactly-once is subtle. Exactly-once holds for a given query + checkpoint + transactional sink. Changing/deleting the checkpoint, two queries writing the same table, non-idempotent `foreachBatch` logic or duplicates already in the source all produce duplicates.",
 answer=False)
add("scenario", 9, 3, ["debug"], "After a restart, the streaming table `bronze.events` contains a block of duplicated events.",
 steps=[
  {"prompt": "What do you inspect first?", "options": [
    opt("The checkpointLocation used before and after the restart", True, "Same checkpoint → resume from stored offsets; new checkpoint → reprocess from the start."),
    opt("The trigger interval", False, "The interval changes batch frequency, not correctness."),
    opt("The cluster's worker count", False, "Scale doesn't create duplicates.")]},
  {"prompt": "The checkpoint was unchanged. The query uses `foreachBatch` doing a plain INSERT into another table. Hypothesis?", "options": [
    opt("A batch was retried after partial failure and the non-idempotent INSERT ran twice", True, "Correct — inside foreachBatch you must make writes idempotent (e.g. MERGE on a key)."),
    opt("Watermarks always create duplicates", False, "Watermarks bound lateness; they don't duplicate data."),
    opt("Delta is not transactional", False, "Delta is transactional; the problem is the custom write logic.")]},
 ])
add("mcq", 9, 1, ["concept"], "An order event is created at 10:00 on a phone but reaches Spark at 10:07. What is 10:00?",
 "Event time is when the event happened (a column in the data); processing time is when Spark processes it. Windowing and watermarks should normally use event time so late arrivals land in the right window.",
 options=["Processing time", "Event time", "Watermark", "Offset"], answer=1)
add("order", 9, 2, ["debug"], "Order the questions for ‘duplicates appeared in a streaming target’.",
 "Check the cheapest, most common cause first (checkpoint identity), then whether another writer exists, then custom write logic, then the source itself.",
 items=["Did the checkpoint location change or get deleted?", "Is another query writing to the same target?", "Is foreachBatch logic idempotent?", "Did the source itself deliver duplicates?"])

# ======================= s10
add("order", 10, 1, ["concept", "exam"], "Order the naming history of Databricks' declarative pipeline product.",
 "Delta Live Tables (DLT) → Lakeflow Declarative Pipelines → (Lakeflow) Spark Declarative Pipelines. Same product line; the plan teaches the current form while making sure you recognize legacy tutorials.",
 quick=True, items=["Delta Live Tables", "Lakeflow Declarative Pipelines", "Spark Declarative Pipelines"])
add("bucket", 10, 2, ["compare"], "Streaming table or materialized view?",
 "Streaming tables process append-only/streaming input once per row — ideal for bronze ingestion with `STREAM read_files`. Materialized views keep the result of any query (joins, aggregations) correct on refresh — ideal for gold aggregates.",
 buckets=["Streaming table", "Materialized view"],
 items=[{"text": "Bronze ingestion with STREAM read_files", "bucket": 0}, {"text": "Each input row processed once", "bucket": 0}, {"text": "Append-only event source", "bucket": 0},
        {"text": "daily_revenue aggregate", "bucket": 1}, {"text": "Join of customers and orders kept correct", "bucket": 1}, {"text": "Precomputed query result refreshed", "bucket": 1}])
add("spotbug", 10, 2, ["syntax", "pitfall"], "This pipeline definition fails. Which line is wrong?",
 "A streaming table must be defined by a streaming query. `read_files(...)` without `STREAM` is a batch read; it should be `FROM STREAM read_files(...)`.",
 lines=["CREATE OR REFRESH STREAMING TABLE bronze_orders", "AS", "SELECT *", "FROM read_files('/Volumes/shop/raw/orders', format => 'json');"],
 bugs=[3], fix="FROM STREAM read_files('/Volumes/shop/raw/orders', format => 'json');")
add("write", 10, 2, ["syntax"], "Write the SQL pipeline definition of a streaming table `bronze_orders` that incrementally reads files with `read_files(...)`.",
 "`CREATE OR REFRESH STREAMING TABLE … AS SELECT * FROM STREAM read_files(...)` is the canonical bronze ingestion pattern; STREAM makes it incremental (Auto Loader under the hood).",
 solution="CREATE OR REFRESH STREAMING TABLE bronze_orders\nAS\nSELECT *\nFROM STREAM read_files(...);",
 keywords=["create or refresh streaming table", "bronze_orders", "from stream read_files"], lang="sql")
add("match", 10, 2, ["concept"], "Match the pipeline concept to its definition.",
 "Expectations are data-quality rules; AUTO CDC applies change feeds; SCD1 overwrites; SCD2 keeps history; the event log records progress/quality/lineage; temporary views are intermediate and not published.",
 pairs=[["Expectations", "Data-quality rules: warn, DROP ROW or FAIL UPDATE"], ["AUTO CDC", "Declarative apply of a change feed (formerly APPLY CHANGES)"], ["SCD Type 1", "Overwrite old values, keep current state only"], ["SCD Type 2", "Keep history with versioned rows"], ["Event log", "Queryable record of progress, quality metrics, errors"], ["Temporary view", "Intermediate dataset not published to the catalog"]])
add("tf", 10, 1, ["exam"], "Delta Live Tables and Lakeflow Spark Declarative Pipelines are two unrelated products.",
 "False. They are the same product line renamed: Delta Live Tables → Lakeflow Declarative Pipelines → Spark Declarative Pipelines. Old tutorials (DLT, `import dlt`, APPLY CHANGES) still describe the same concepts.",
 quick=True, answer=False)
add("mcq", 10, 2, ["concept"], "A customer moves from Athens to Thessaloniki. You must keep BOTH addresses with validity periods for historical reports. Which pattern?",
 "SCD Type 2 keeps history by closing the old row and inserting a new version. SCD Type 1 would overwrite Athens with Thessaloniki and lose history. AUTO CDC supports both via its SCD type setting.",
 options=["SCD Type 1", "SCD Type 2", "Temporary view", "Complete output mode"], answer=1)
add("odd", 10, 1, ["concept"], "Which is NOT a dataset type you define in a declarative pipeline?",
 "Streaming tables, materialized views and temporary views are pipeline datasets. A SQL warehouse is compute for Databricks SQL, not a dataset.",
 options=["Streaming table", "Materialized view", "Temporary view", "SQL warehouse"], answer=3)
add("cloze", 10, 2, ["syntax"], "Complete the expectation that drops rows with a NULL order_id.",
 "Expectations are declared as `CONSTRAINT name EXPECT (condition)`; `ON VIOLATION DROP ROW` drops bad rows (default is to keep and only record them; `FAIL UPDATE` stops the update). Violations are counted in the event log.",
 asCode=True,
 text="CONSTRAINT valid_id [[EXPECT]] (order_id IS NOT NULL)\n  ON [[VIOLATION]] [[DROP ROW]]",
 bank=["CHECK", "ERROR", "DELETE"])

# ======================= s11
add("match", 11, 1, ["concept"], "Match the job trigger to when it starts a run.",
 "Schedules are time-based; continuous keeps one run always going; file-arrival reacts to new files in storage; table-update reacts to changes in monitored tables.",
 quick=True,
 pairs=[["Schedule", "At a cron-style time"], ["Continuous", "Immediately after the previous run ends"], ["File arrival", "When new files land in a monitored location"], ["Table update", "When a monitored source table changes"]])
add("order", 11, 1, ["concept"], "Order the tasks of the example job DAG (customers and orders run in parallel — treat them as one step).",
 "ingest → bronze → (customers ‖ orders) → gold → quality check. gold depends on both silver tasks; the quality check runs last on the final outputs.",
 items=["ingest", "bronze", "customers + orders (parallel)", "gold", "quality check"])
add("order", 11, 2, ["debug"], "Order the ‘task failed’ debugging model.",
 "Upstream first (cheapest), then infrastructure (compute, runtime, library), then identity (permissions), then inputs (parameters, data), and finally Spark execution itself.",
 quick=True, items=["Upstream?", "Compute?", "Runtime?", "Library?", "Permissions?", "Parameter?", "Data?", "Spark execution?"])
add("scenario", 11, 3, ["debug"], "Nightly job `orders_daily`: task `gold` fails with `ModuleNotFoundError: No module named 'holidays'`.",
 steps=[
  {"prompt": "Which bucket of the debugging model is this?", "options": [
    opt("Library", True, "A missing Python module is a dependency/library problem."),
    opt("Permissions", False, "A permission error would say PERMISSION_DENIED / access denied."),
    opt("Data", False, "Data issues show up as schema/value errors, not missing modules.")]},
  {"prompt": "The task runs fine on your all-purpose cluster. Why does the job fail?", "options": [
    opt("The job's compute (job cluster / serverless environment) doesn't have the library installed", True, "Each compute has its own libraries; your interactive cluster's packages don't follow the job."),
    opt("The job runs an older Spark that can't import Python", False, "All runtimes run Python; it's the missing package."),
    opt("Retries are disabled", False, "Retrying won't install the library.")]},
  {"prompt": "Best production fix?", "options": [
    opt("Declare the dependency in the job's task libraries / serverless environment (ideally pinned, in the bundle)", True, "Reproducible: the dependency is part of the job definition."),
    opt("Point the job at your all-purpose cluster", False, "Works by accident, costs more and isn't isolated or reproducible."),
    opt("`pip install` inside the notebook manually once", False, "Manual one-off steps aren't reproducible.")]},
 ])
add("bucket", 11, 2, ["compare"], "Where does each job compute option sit?",
 "Serverless job compute is Databricks-managed. New job clusters, shared job clusters and existing all-purpose clusters are classic compute you configure; only the job clusters are created for the run and terminated after.",
 buckets=["Serverless (managed)", "Classic (you configure)"],
 items=[{"text": "Serverless job compute", "bucket": 0}, {"text": "New job cluster", "bucket": 1}, {"text": "Shared job cluster", "bucket": 1}, {"text": "Existing all-purpose compute", "bucket": 1}, {"text": "Classic job compute", "bucket": 1}])
add("match", 11, 2, ["concept"], "Match the Jobs concept to its definition.",
 "A job is the definition, a task a unit of work, a run one execution; dynamic value references are resolved at run time; run-job triggers another job; for-each loops a nested task.",
 pairs=[["Job", "The orchestrated workflow definition"], ["Task", "One unit of work inside a job"], ["Run", "One execution of a job"], ["Dynamic value reference", "Placeholder like {{job.run_id}} resolved at run time"], ["Run-job task", "A task that triggers another job"], ["For-each", "Runs a nested task once per list item"]])
add("tf", 11, 1, ["pitfall"], "Running production jobs on an existing all-purpose cluster is the recommended default.",
 "False. All-purpose compute is meant for interactive work: it's pricier and shared/less isolated. Production jobs normally use serverless job compute or job clusters created per run.",
 answer=False)

# ======================= s12
add("match", 12, 1, ["concept"], "Match the Databricks SQL feature to its purpose.",
 "Query history lists past runs; the query profile breaks one query down by operator; alerts notify on conditions; AI/BI dashboards visualize; the Statement Execution API runs SQL over REST; JDBC/ODBC connect BI tools.",
 quick=True,
 pairs=[["Query history", "List of past queries with duration and user"], ["Query profile", "Per-operator execution breakdown of one query"], ["Alerts", "Notify when a scheduled query meets a condition"], ["AI/BI dashboards", "Native Databricks dashboards"], ["Statement Execution API", "Run SQL on a warehouse via REST"], ["JDBC / ODBC", "Drivers for Power BI / Tableau"]])
add("mcq", 12, 2, ["concept", "exam"], "At 9:00, 60 analysts open dashboards; each query is simple but many are QUEUED. What do you change on the SQL warehouse?",
 "Queueing is a concurrency problem: raise max clusters so the warehouse scales out. A bigger size speeds up individual heavy queries but doesn't add parallel capacity as effectively.",
 options=["Increase warehouse size", "Increase max clusters", "Disable auto-stop", "Switch to an all-purpose cluster"], answer=1,
 why=["Size helps heavy single queries, not queueing.", "Correct — scale out for concurrency.", "Auto-stop only affects idle time.", "All-purpose clusters aren't for BI serving."])
add("bucket", 12, 2, ["concept"], "Author, monitor/debug, or connect?",
 "Authoring happens in the SQL editor, queries and dashboards; monitoring/debugging uses query history, query profile and alerts; external access goes through JDBC/ODBC, Power BI/Tableau and the Statement Execution API.",
 buckets=["Author", "Monitor / debug", "Connect externally"],
 items=[{"text": "SQL Editor", "bucket": 0}, {"text": "AI/BI dashboards", "bucket": 0}, {"text": "Query history", "bucket": 1}, {"text": "Query profile", "bucket": 1}, {"text": "Alerts", "bucket": 1}, {"text": "JDBC / ODBC", "bucket": 2}, {"text": "Statement Execution API", "bucket": 2}, {"text": "Tableau connectivity", "bucket": 2}])
add("tf", 12, 1, ["concept"], "Auto-stop shuts the SQL warehouse down after a period of inactivity to save cost.",
 "True. Auto-stop stops an idle warehouse after the configured minutes; the next query starts it again (fast for serverless).",
 quick=True, answer=True)
add("odd", 12, 1, ["exam"], "Which is NOT a SQL warehouse type?",
 "SQL warehouses come as Serverless, Pro and Classic. All-purpose is a classic cluster type for notebooks, not a warehouse type.",
 options=["Serverless", "Pro", "Classic", "All-purpose"], answer=3)
add("scenario", 12, 2, ["debug"], "One gold dashboard query takes 3 minutes; all others are fast and nothing is queued.",
 steps=[
  {"prompt": "Where do you look first?", "options": [
    opt("The query profile of that query", True, "It shows which operator (scan, join, aggregate) eats the time and how much data is read."),
    opt("Raise max clusters", False, "Nothing is queued — concurrency isn't the problem."),
    opt("Recreate the dashboard", False, "The dashboard isn't the slow part; the query is.")]},
  {"prompt": "The profile shows a full scan of a huge table with most time in the Scan. Reasonable direction?", "options": [
    opt("Improve data layout/skipping (clustering on filter columns) or precompute with a materialized view", True, "Less data read = faster; MVs precompute heavy aggregations."),
    opt("Disable Photon", False, "Photon speeds up scans; disabling it slows things down."),
    opt("Shorten auto-stop", False, "Auto-stop affects idle cost, not query speed.")]},
 ])

# ======================= s13
add("order", 13, 1, ["debug"], "Order the investigation process for ‘query slow’.",
 "Go from coarse to fine: Spark UI → the slow stage → the slow tasks inside it → compare their distribution → then test hypotheses (skew, shuffle, spill, I/O, join, GC, small files). Never start with ‘bigger cluster’.",
 quick=True, items=["Query slow", "Open Spark UI", "Find slow stage", "Find slow tasks", "Compare task distribution", "Test hypotheses: skew / shuffle / spill / I/O / join / GC / small files"])
add("match", 13, 2, ["concept"], "Match the physical-plan operator to its meaning.",
 "Exchange = shuffle; BroadcastHashJoin = small side copied everywhere; SortMergeJoin = shuffle + sort + merge; HashAggregate = hash-based aggregation; WholeStageCodegen = fused generated code; Scan = reading the source.",
 quick=True,
 pairs=[["Exchange", "Shuffle / redistribution of data (stage boundary)"], ["BroadcastHashJoin", "Small side copied to every executor"], ["SortMergeJoin", "Both sides shuffled by key, sorted, merged"], ["HashAggregate", "Aggregation using a hash map"], ["WholeStageCodegen", "Several operators fused into one generated function"], ["Scan", "Reading the data source"]])
add("match", 13, 2, ["concept", "debug"], "Match the Spark UI metric to what it tells you.",
 "Shuffle write/read measure data moved between stages; spill (memory/disk) shows data that didn't fit; GC time shows JVM memory pressure. Uneven shuffle read across tasks is the classic skew signal.",
 pairs=[["Shuffle write", "Bytes written by map tasks for the next stage"], ["Shuffle read", "Bytes fetched by reduce tasks"], ["Spill (memory)", "In-memory size of data that had to be spilled"], ["Spill (disk)", "On-disk size of spilled data"], ["GC time", "Time paused for JVM garbage collection"]])
add("mcq", 13, 2, ["compare", "pitfall"], "You need to reduce 2,000 tiny output partitions to 50 before writing, as cheaply as possible. Which call?",
 "`coalesce(50)` merges existing partitions without a full shuffle — cheap, down-only. `repartition(50)` does a full shuffle (useful to rebalance or increase), which costs more here.",
 options=["repartition(50)", "coalesce(50)", "repartition(5000)", "AQE must be disabled first"], answer=1)
add("bucket", 13, 2, ["debug"], "Which bottleneck does each piece of evidence point to?",
 "Spill, high GC and OOMs mean memory pressure. Long time reading storage, thousands of tiny files or slow shuffle fetch mean I/O-bound. Busy cores with heavy UDFs/expressions and no spill mean CPU-bound.",
 buckets=["CPU-bound", "Memory-bound", "I/O-bound"],
 items=[{"text": "Cores at 100%, heavy Python UDF, no spill", "bucket": 0}, {"text": "Complex expressions/decompression dominate", "bucket": 0}, {"text": "Large spill (disk)", "bucket": 1}, {"text": "High GC time", "bucket": 1}, {"text": "Executor OOM", "bucket": 1}, {"text": "Thousands of tiny input files", "bucket": 2}, {"text": "Time dominated by reading storage", "bucket": 2}])
add("tf", 13, 1, ["pitfall", "interview"], "When a job slows from 8 to 42 minutes, the first step is to use a bigger cluster.",
 "False. The plan explicitly rejects blind scaling: open the Spark UI, find the slow stage and tasks, compare distributions and test hypotheses. If it's skew, more nodes won't help at all.",
 quick=True, answer=False)
add("mcq", 13, 2, ["debug"], "The DRIVER crashes with OutOfMemory right after `big_df.collect()`. Most likely cause?",
 "`collect()` (and `toPandas()`) pulls all rows into the driver's memory — a classic driver OOM. Executor OOMs come from huge partitions/skew on workers, not from collecting results.",
 options=["A skewed partition on one executor", "Collecting a large result to the driver", "Too many shuffle partitions", "Photon is enabled"], answer=1)
add("match", 13, 2, ["concept"], "Match the performance technique to its definition.",
 "Salting spreads hot keys; broadcasting avoids shuffling the big side; AQE re-optimizes at runtime; compaction fixes small files; data skipping avoids reading irrelevant files.",
 pairs=[["Salting", "Add a random suffix to a hot key to spread it"], ["Broadcasting", "Send a small table to all executors"], ["AQE", "Runtime re-optimization: coalesce, switch joins, split skew"], ["File compaction", "Merge many small files into larger ones"], ["Data skipping", "Use file stats to avoid reading files"]])
add("scenario", 13, 3, ["debug"], "Case from the plan: **Job used to take 8 min. Now takes 42 min.**",
 steps=[
  {"prompt": "First move?", "options": [
    opt("Open the Spark UI and find which stage got slow", True, "Evidence first: locate the slow stage."),
    opt("Double the workers", False, "Blind scaling; if it's skew it won't help."),
    opt("Rewrite the job in SQL", False, "No evidence that the language is the issue.")]},
  {"prompt": "Stage 7 (a join) went from 1 to 35 minutes. Inside it?", "options": [
    opt("Compare task metrics: min/median/max duration, shuffle read, spill per task", True, "The distribution tells skew vs uniform slowness."),
    opt("Check the driver logs only", False, "The driver log rarely shows per-task imbalance."),
    opt("Restart the cluster", False, "Destroys the UI evidence.")]},
  {"prompt": "All tasks are uniformly slower and shuffle read grew 5×; the plan shows SortMergeJoin where it used to be BroadcastHashJoin. Interpretation?", "options": [
    opt("The dimension table grew past the broadcast threshold, so the join switched to a shuffle join", True, "Uniform slowdown + more shuffle + changed join strategy = data growth changed the plan; consider broadcast hints, filtering, or layout."),
    opt("Classic data skew", False, "Skew shows a few slow tasks, not a uniform slowdown."),
    opt("GC is broken", False, "No GC evidence was mentioned.")]},
 ])
add("odd", 13, 1, ["concept"], "Three are physical-plan operators. Which one is a Spark UI task metric instead?",
 "Exchange, SortMergeJoin and HashAggregate appear in physical plans. GC time is a per-task metric shown in the Spark UI.",
 options=["Exchange", "SortMergeJoin", "HashAggregate", "GC time"], answer=3)

# ======================= s14
add("order", 14, 1, ["syntax"], "Order the bundle commands for a first deployment to dev.",
 "Validate the configuration, deploy the resources to the dev target, then run the deployed job by its resource key.",
 quick=True, items=["databricks bundle validate", "databricks bundle deploy -t dev", "databricks bundle run orders_job -t dev"])
add("spotbug", 14, 2, ["syntax", "pitfall"], "The bundle defines `resources.jobs.orders_job` with `name: orders-job`. Which command is wrong?",
 "`bundle run` takes the resource KEY (`orders_job`), not the display name (`orders-job`). Validate and deploy are correct.",
 lines=["databricks bundle validate", "databricks bundle deploy -t dev", "databricks bundle run orders-job -t dev"],
 bugs=[2], fix="databricks bundle run orders_job -t dev")
add("write", 14, 2, ["syntax"], "Write the `targets` section of `databricks.yml` with a `dev` target in development mode and a `prod` target in production mode.",
 "Targets define deployment environments; `mode: development` gives per-user, prefixed, paused deployments, while `mode: production` marks the real deployment (ideally run as a service principal).",
 solution="targets:\n  dev:\n    mode: development\n  prod:\n    mode: production",
 keywords=["targets:", "dev:", "mode: development", "prod:", "mode: production"], lang="yaml")
add("match", 14, 2, ["concept"], "Match the developer-workflow tool to its definition.",
 "The CLI drives Databricks from a terminal; Git folders bring repos into the workspace; workspace files hold non-notebook code/config; wheels package libraries; Databricks Connect runs local IDE code on remote compute.",
 quick=True,
 pairs=[["Databricks CLI", "Terminal tool: `databricks …` commands"], ["Git folders", "Git repo cloned into the workspace (formerly Repos)"], ["Workspace files", "Non-notebook files (.py, .yml) in the workspace"], ["Python wheel", "Packaged library (.whl) installed on compute"], ["Databricks Connect", "Run local IDE Spark code on remote Databricks compute"]])
add("tf", 14, 1, ["exam"], "Per the source, Declarative Automation Bundles is the current name for what used to be called Databricks Asset Bundles.",
 "True (per the source). Bundles describe jobs, pipelines, source files and deployment targets as version-controlled YAML (`databricks.yml`) and are deployed with `databricks bundle …`. Expect both names in docs and tutorials.",
 answer=True)
add("cloze", 14, 1, ["syntax"], "Complete the bundle basics.",
 "The primary bundle file is `databricks.yml` (YAML). `-t` selects the target; `validate` checks configuration before deploying.",
 text="The primary bundle file is [[databricks.yml]]. You check it with `databricks bundle [[validate]]`, deploy with `databricks bundle deploy [[-t]] dev`, and run a job with `databricks bundle [[run]] orders_job -t dev`.",
 bank=["bundle.json", "start", "--env"])
add("mcq", 14, 2, ["concept", "exam"], "Your CI pipeline deploys the bundle to prod. Which identity should it use?",
 "A service principal: a non-human deployment identity with exactly the needed permissions. Personal credentials in CI are a security and continuity risk.",
 options=["A developer's personal access token", "A service principal", "The workspace admin account", "No identity — bundles deploy anonymously"], answer=1)
add("free", 14, 3, ["interview"], "Interview: why define jobs and pipelines in a bundle instead of clicking them together in the UI?",
 "Look for version control, review, reproducible multi-environment deploys, CI/CD, rollbacks, service-principal identity.",
 model="With a bundle, jobs/pipelines/source files and targets are version-controlled configuration. Changes are reviewed in Git, validated and tested in CI, and deployed the same way to dev/test/prod with per-environment settings. Deployments are reproducible and can be rolled back by redeploying a previous commit, and production runs under a service principal instead of someone's account. Clicking in the UI is manual, unreviewed and hard to reproduce.",
 rubric=["Version control / code review", "Reproducible deployments across dev/test/prod (targets)", "CI/CD validation & testing", "Rollback by redeploying a previous version", "Service principal / deployment identity"])

# ======================= s15
add("mcq", 15, 1, ["exam"], "You need to run a **scheduled PySpark workload without managing infrastructure**. Which compute?",
 "Serverless jobs compute: scheduled (a job), PySpark, and Databricks manages the infrastructure. All-purpose is interactive; classic job clusters require you to configure VMs; a SQL warehouse runs SQL, not PySpark jobs.",
 quick=True,
 options=["All-purpose cluster", "Classic job cluster", "Serverless Jobs", "SQL warehouse"], answer=2,
 why=["Interactive and you manage it.", "Classic = you manage the VM configuration.", "Correct.", "Warehouses run SQL, not PySpark workloads."])
add("scenario", 15, 3, ["debug", "interview"], "A 2 TB ETL job went from 12 to 45 minutes. One stage has 1,000 tasks: 997 finish in 20 s, 3 run 15 min spilling 80 GB each.",
 steps=[
  {"prompt": "Most likely diagnosis?", "options": [
    opt("Data skew — a few partitions hold far more data", True, "A long tail of a few huge tasks is the skew signature."),
    opt("The cluster is too small", False, "997 tasks finish quickly; capacity is fine."),
    opt("Too many small files", False, "Small files make many tasks slow-ish, not 3 extreme stragglers.")]},
  {"prompt": "How do you prove it in the Spark UI?", "options": [
    opt("Stage summary metrics: median vs max duration, shuffle read/records and spill concentrated in the 3 tasks", True, "Evidence: max ≫ median and the same 3 tasks read far more shuffle data."),
    opt("Check the job's total duration only", False, "Total duration can't distinguish skew from other causes."),
    opt("Look at the notebook code formatting", False, "Not evidence.")]},
  {"prompt": "Then what?", "options": [
    opt("Find the hot join/grouping key (e.g. NULL or one giant customer) and apply AQE skew handling, salting, or broadcasting the small side", True, "Fix the distribution, not the hardware."),
    opt("Add 20 workers", False, "The 3 huge partitions still run as 3 single tasks."),
    opt("Increase GC time", False, "GC time is a symptom metric, not a setting to raise.")]},
 ])
add("calc", 15, 2, ["calc"], "In the 2 TB case, 3 straggler tasks each spill 80 GB. How many GB spill in total from those tasks?",
 "3 × 80 GB = 240 GB of spill concentrated in 3 tasks out of 1,000 — further evidence that the data is unevenly distributed (skew), not that the whole cluster lacks memory.",
 quick=True, answer=240, tolerance=0, unit="GB")
add("bucket", 15, 2, ["exam", "compare"], "Certification-style or engineering-style question?",
 "Certification-style questions ask you to pick the correct product/feature for a short scenario. Engineering-style questions give symptoms and numbers and expect hypothesis → evidence → fix.",
 buckets=["Certification-style", "Engineering-style"],
 items=[{"text": "Which compute for a scheduled PySpark workload without infra management?", "bucket": 0}, {"text": "Which command shows a table's version history?", "bucket": 0}, {"text": "Which privilege is needed to access a schema?", "bucket": 0},
        {"text": "3 of 1,000 tasks take 15 min and spill 80 GB — investigate", "bucket": 1}, {"text": "Job went from 8 to 42 minutes — what do you do?", "bucket": 1}, {"text": "Bronze suddenly has every row twice — find the cause", "bucket": 1}])
add("order", 15, 2, ["debug"], "Order the verification list the plan gives after hypothesizing skew.",
 "Start in the Spark UI, look at the task-duration distribution, then shuffle read/write and spill per task, then partition sizes, then identify the join/grouping key, and confirm with the physical plan.",
 items=["Spark UI", "Task-duration distribution", "Shuffle read/write", "Spill", "Partition sizes", "Join/grouping keys", "Physical plan"])
add("free", 15, 3, ["interview", "debug"], "Answer the engineering-style question as in an interview: *3 of 1,000 tasks take 15 min and spill 80 GB each; the rest take 20 s. What is happening and how do you investigate?*",
 "Look for: skew hypothesis, UI evidence, hot key, fixes, why scaling doesn't help.",
 model="It's very likely data skew: a few partitions got far more data than the rest, so three tasks process huge partitions, run out of execution memory and spill. I'd confirm in the Spark UI stage view — median duration ~20 s vs max ~15 min, and those three tasks have much larger shuffle read/records and all the spill. Then I'd find the join or groupBy key feeding that stage and check its value distribution (often NULLs or one giant customer) and confirm the join type in the physical plan. Fixes: enable/tune AQE skew-join handling, salt the hot key, broadcast the small side, or handle the hot key/NULLs separately. Adding nodes wouldn't help, because the big partitions still run as single tasks.",
 rubric=["Hypothesis: data skew", "Evidence: median vs max duration, shuffle read and spill per task in Spark UI", "Find the hot key (join/grouping key, NULLs)", "Fixes: AQE skew handling, salting, broadcast, separate hot-key handling", "Explains why more hardware doesn't fix it"])
add("tf", 15, 1, ["pitfall", "exam"], "If 997 tasks finish in 20 s and 3 take 15 minutes, the cluster simply needs more workers.",
 "False. The cluster handles 997 tasks quickly; the problem is 3 oversized partitions. More workers can't split a single task, so the stragglers stay slow — this is skew.",
 answer=False)
