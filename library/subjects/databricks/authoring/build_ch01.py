#!/usr/bin/env python3
"""Build ch01.json — Foundations: Storage, Tables & Transactions (source pages 1–26)."""
import json, os

CID = "ch01"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch01.json")

def P(t): return {"t": "p", "text": t}
def L(items, ordered=False): return {"t": "list", "items": items, "ordered": ordered}
def CODE(lang, code, caption=None):
    b = {"t": "code", "lang": lang, "code": code}
    if caption: b["caption"] = caption
    return b
def DIA(text, caption=None):
    b = {"t": "diagram", "text": text}
    if caption: b["caption"] = caption
    return b
def TAB(head, rows, caption=None):
    b = {"t": "table", "head": head, "rows": rows}
    if caption: b["caption"] = caption
    return b
def CO(kind, title, text): return {"t": "callout", "kind": kind, "title": title, "text": text}
def CMP(*items): return {"t": "compare", "items": [{"title": a, "points": b} for a, b in items]}
def FLOW(items, caption=None):
    b = {"t": "flow", "items": items}
    if caption: b["caption"] = caption
    return b
def REV(label, text): return {"t": "reveal", "label": label, "text": text}
def ASK(title, qs): return {"t": "ask", "title": title, "questions": qs}
def TERMS(pairs): return {"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]}

def S(n): return f"{CID}-s{n:02d}"

sections = []
exercises = []

def sec(n, title, hook, blocks):
    sections.append({"id": S(n), "title": title, "hook": hook, "blocks": blocks})

def ex(type_, n, diff, tags, q, explain, quick=False, **kw):
    e = {"id": None, "type": type_, "section": S(n), "difficulty": diff, "tags": tags,
         "quick": quick, "q": q}
    e.update(kw)
    e["explain"] = explain
    exercises.append(e)

# =====================================================================
# S01 Orientation
# =====================================================================
sec(1, "Orientation: From Spark to Databricks",
    "You already know Spark's engine. Now you learn the platform built around it.",
[
 P("This course **builds on your Spark knowledge** instead of restarting from zero. Spark ideas come back inside real Databricks debugging cases, not as a separate Spark course."),
 L(["Execution hierarchy, partitions and **shuffle** mechanics",
    "Catalyst / AQE, statistics and size estimates",
    "`df.explain(mode=\"extended\")` and `df.explain(mode=\"cost\")`",
    "Spark UI reasoning",
    "Physical join strategies: BHJ, SMJ, SHJ, BNLJ"]),
 TERMS([("BHJ", "Broadcast Hash Join: the small side is copied to every executor, so the big side does not shuffle."),
        ("SMJ", "Sort-Merge Join: both sides are shuffled by key, sorted, then merged."),
        ("SHJ", "Shuffled Hash Join: both sides are shuffled, then a hash table is built per partition."),
        ("BNLJ", "Broadcast Nested Loop Join: the fallback for non-equi joins. One side is broadcast and every row pair is compared."),
        ("AQE", "Adaptive Query Execution: Spark re-optimizes the plan at runtime using real shuffle statistics.")]),
 CO("tip", "Your known weak spot",
    "The thing that still needs work is an **intuitive picture of what physically moves during a shuffle** and how that turns into join execution. Expect it to come back in debugging cases."),
 P("The current **Databricks Data Engineer Associate exam** tests much more than syntax:"),
 TAB(["Area", "Exam topics named in the source"], [
     ["Platform", "platform architecture, compute selection"],
     ["Data & tables", "Delta Lake, ingestion, PySpark transformations, Liquid Clustering, predictive optimization"],
     ["Operations", "Lakeflow Jobs, CI/CD / Automation Bundles"],
     ["Troubleshooting", "Spark UI troubleshooting, skew / shuffling / spilling, OOM diagnosis"],
     ["Governance", "Unity Catalog, governance / security"]]),
 CO("exam", "The exam went operational",
    "The exam guide now leans toward **operational** skills: diagnosing skew, shuffle/spill and OOMs, CI/CD, Lakeflow Jobs and governance. Memorizing will not be enough. You need to be able to *reason about running systems*."),
 DIA("YOUR EXISTING SPARK KNOWLEDGE\n"
     " ├─ Spark execution model\n"
     " ├─ partitions / shuffle\n"
     " ├─ Catalyst / physical plans\n"
     " ├─ joins\n"
     " ├─ AQE\n"
     " ├─ Spark UI / explain()\n"
     " └─ DataFrame API\n"
     "        │\n"
     "        ▼\n"
     "PREREQUISITES — ROUND 1      ◄ THIS CHAPTER\n"
     " ├─ compute vs storage\n"
     " ├─ object storage\n"
     " ├─ file ≠ table\n"
     " ├─ columnar storage / Parquet\n"
     " ├─ database metadata\n"
     " ├─ ACID transactions\n"
     " ├─ transaction logs\n"
     " └─ data lake → lakehouse motivation\n"
     "        │\n"
     "        ▼\n"
     "PREREQUISITES — ROUND 2      (next chapter)\n"
     " ├─ ETL vs ELT\n"
     " └─ …\n"
     "        │\n"
     "        ▼\n"
     "DATABRICKS PROPER → production, debugging, certification",
     "The Databricks mastery DAG"),
 CO("key", "The one-sentence mental model",
    "**Spark computes. Storage persists. Delta gives stored files table semantics. Unity Catalog governs the objects.** Databricks integrates these pieces into one platform."),
 REV("Think first: why learn storage, tables and transactions before you open the Databricks UI?",
     "Much of Databricks' behavior, and many exam traps, come from **mixing up layers**: compute vs storage, file vs table, Delta vs Parquet, Unity Catalog vs Delta. If you can keep these layers apart, the UI and APIs make sense."),
])

ex("mcq", 1, 1, ["concept"], "Which topic is **NOT** part of *Prerequisites — Round 1* in the mastery DAG?",
   "ETL vs ELT opens **Round 2**, which moves from the storage model to the pipeline model. Round 1 is about storage, tables and transactions: compute vs storage, object storage, file ≠ table, Parquet, metadata, ACID, transaction logs and the lakehouse motivation.",
   quick=True, options=["ACID transactions", "columnar storage / Parquet", "ETL vs ELT", "transaction logs"], answer=2,
   why=["Round 1: needed to understand Delta.", "Round 1: explains column pruning.", "Correct: this is the first Round 2 topic.", "Round 1: the core of Delta Lake."])
ex("cloze", 1, 1, ["concept"], "Complete the chapter mantra.",
   "Each clause names one layer and its single job. Spark (compute) **computes**. Cloud storage **persists**. Delta turns stored Parquet files into **tables** with transactions. Unity Catalog **governs** (names, permissions). Databricks is the platform that **integrates** all of them.",
   quick=True, text="Spark [[computes]]. Storage [[persists]]. [[Delta|Delta Lake]] gives stored files table semantics. [[Unity Catalog|UC]] governs the objects. Databricks [[integrates]] these pieces into one platform.",
   bank=["Parquet", "Photon", "executes", "stores", "replaces"])
ex("match", 1, 2, ["concept"], "Match each Spark abbreviation you already studied to its meaning.",
   "These are the four physical join strategies plus AQE from your Spark foundation. BHJ avoids shuffling the big side by broadcasting the small one. SMJ shuffles and sorts both sides. SHJ shuffles both sides and hashes per partition. BNLJ is the costly fallback for non-equi joins. AQE re-plans at runtime from real statistics.",
   quick=True, pairs=[["BHJ", "Broadcast Hash Join"], ["SMJ", "Sort-Merge Join"], ["SHJ", "Shuffled Hash Join"],
                      ["BNLJ", "Broadcast Nested Loop Join"], ["AQE", "Adaptive Query Execution"]])
ex("tf", 1, 1, ["exam"], "The current Databricks Data Engineer Associate exam is mostly about memorizing syntax. Operational topics such as OOM diagnosis and skew are not tested.",
   "False. The current exam guide explicitly includes Spark UI troubleshooting, skew/shuffle/spill, **OOM diagnosis**, CI/CD/Automation Bundles, Lakeflow Jobs and governance. That is why this course trains reasoning and debugging, not just syntax.",
   answer=False)
ex("mcq", 1, 2, ["exam"], "Which of these are named in the source as topics of the current Associate exam? (Select all that apply.)",
   "Liquid Clustering, predictive optimization, Spark UI troubleshooting and CI/CD with Automation Bundles all appear in the exam list. Writing custom JVM garbage collectors does not. The exam tests platform operation, not JVM internals.",
   multi=True, options=["Liquid Clustering", "Predictive optimization", "Spark UI troubleshooting", "CI/CD / Automation Bundles", "Writing custom JVM garbage collectors"],
   answer=[0, 1, 2, 3],
   why=["Listed.", "Listed.", "Listed.", "Listed.", "Not listed. JVM internals are not part of the exam."])
ex("bucket", 1, 1, ["concept"], "Sort each topic into its place in the mastery DAG.",
   "Your **existing Spark knowledge** covers the execution engine: Catalyst, AQE, the DataFrame API and joins. **Round 1** builds the storage and table model (compute vs storage, ACID, transaction logs, lakehouse motivation). **Round 2** starts the pipeline model with ETL vs ELT.",
   buckets=["Existing Spark knowledge", "Prerequisites Round 1", "Prerequisites Round 2"],
   items=[{"text": "Catalyst / physical plans", "bucket": 0}, {"text": "AQE", "bucket": 0},
          {"text": "DataFrame API", "bucket": 0}, {"text": "compute vs storage", "bucket": 1},
          {"text": "ACID transactions", "bucket": 1}, {"text": "transaction logs", "bucket": 1},
          {"text": "data lake → lakehouse motivation", "bucket": 1}, {"text": "ETL vs ELT", "bucket": 2}])
ex("order", 1, 1, ["concept"], "Put the learning path in order.",
   "The path starts from the Spark engine you already know. Round 1 builds the storage model. Round 2 builds the pipeline model. Only then do you enter Databricks proper. Each stage depends on the vocabulary of the stage before it.",
   items=["Existing Spark knowledge", "Prerequisites Round 1: storage, tables, transactions",
          "Prerequisites Round 2: pipeline model (ETL vs ELT …)", "Databricks proper: production, debugging, certification"])

# =====================================================================
# S02 Compute vs storage
# =====================================================================
sec(2, "Compute vs Storage: Independent Lifetimes",
    "Clusters come and go. Your data must not.",
[
 P("Imagine an e-shop with `customers`, `orders` and `products`. Something must **store** those bytes while nobody is processing them."),
 P("Something else must **execute** a query over them:"),
 CODE("sql", "SELECT customer_id, SUM(amount)\nFROM orders\nGROUP BY customer_id;"),
 CMP(("Storage", ["Answers: *Where are the bytes after my program stops running?*",
                  "Amazon S3, Azure Data Lake Storage (ADLS), Google Cloud Storage (GCS)",
                  "Persistent: survives when nothing is running"]),
     ("Compute", ["Answers: *Which CPUs and RAM execute my code?*",
                  "For Spark: a driver plus executors",
                  "Temporary: can disappear after the work is done"])),
 CODE("text", "s3://company-data/orders/...\nabfss://data@company.dfs.core.windows.net/orders/...\ngs://company-data/orders/...",
      "Storage locations on S3, ADLS and GCS"),
 DIA("      Driver\n"
     "        │\n"
     "  ┌─────┼─────────┐\n"
     "  ▼     ▼         ▼\n"
     " Executor Executor Executor     ◄ COMPUTE (temporary)\n"
     "  ▲         ▲\n"
     "  │ reads   │ reads\n"
     " parquet   parquet\n"
     "  file      file\n"
     "  └────┬────┘\n"
     "  Object storage                ◄ STORAGE (persistent)",
     "Executors read files from object storage"),
 CO("key", "Independent lifetimes",
    "The compute resources can disappear afterward. **The data remains.** This separation is central to modern lakehouse systems."),
 P("Why is this useful? Take a **10 TB** dataset with a compute pattern that changes every day:"),
 TAB(["Day", "Machines", "10 TB dataset"], [["Monday", "20", "still there"], ["Tuesday", "0", "still there"], ["Wednesday", "100", "still there"]]),
 P("You do not want your 10 TB to vanish because Tuesday has zero workers. You pay for compute only when you need it and **scale it independently** of the data."),
 P("Databricks makes the same split. The **workspace** holds artifacts and configurations, such as notebooks and settings. **Persistent data** usually lives in your cloud storage."),
 TAB(["What", "After you terminate the cluster"], [
     ["Executor RAM", "Gone"],
     ["Temporary local Spark / shuffle files", "Normally gone with the compute environment"],
     ["Files in object storage (e.g. `s3://shop/orders/`)", "Remain"]], "Exercise 1 in table form"),
 CO("analogy", "Kitchen analogy",
    "Storage is the **pantry**. Compute is the **cooks**. Send all the cooks home and the food is still in the pantry. Hire 100 cooks tomorrow and they all cook from the same pantry."),
 CO("pitfall", "Don't keep anything important in compute",
    "Shuffle files, local temp files and executor memory belong to the compute environment. Treat them as **disposable**. Only data written to persistent storage survives the cluster."),
 REV("Think first: 100 TB dataset; 50 workers at 08:00, 200 at 12:00, 0 at 18:00. Why is this a good design?",
     "Persistent storage survives on its own, while compute capacity **scales with the workload**. You add workers at peak, pay nothing at 18:00, and the 100 TB is untouched the whole time."),
])

ex("bucket", 2, 1, ["concept", "exam"], "Your Spark cluster (driver, worker1, worker2, worker3) reads `s3://shop/orders/`. You **terminate the cluster**. Sort each item.",
   "Everything that lives in the compute environment (executor RAM, driver memory, local shuffle/temp files) disappears with it. Files in persistent object storage, such as `s3://shop/orders/` or an ADLS path, remain. This difference returns later as compute vs Delta tables.",
   quick=True, buckets=["Disappears with the cluster", "Survives"],
   items=[{"text": "Executor RAM", "bucket": 0}, {"text": "Spark shuffle files on local worker disks", "bucket": 0},
          {"text": "Driver memory", "bucket": 0}, {"text": "Parquet files in `s3://shop/orders/`", "bucket": 1},
          {"text": "Files under `abfss://data@company.dfs.core.windows.net/orders/`", "bucket": 1},
          {"text": "Temporary local data written by Spark during a job", "bucket": 0}])
ex("tf", 2, 1, ["concept"], "Storage is the layer that answers *\"Which CPUs and RAM execute my code?\"*",
   "False. That question belongs to **compute** (driver and executors). Storage answers *\"Where are the bytes after my program stops running?\"* Keeping the two questions apart is the first step of the chapter's mental model.",
   quick=True, answer=False)
ex("mcq", 2, 2, ["pitfall"], "After the cluster that ran a big `groupBy` is terminated, what normally happens to the **shuffle files** it wrote?",
   "Shuffle files are temporary local data owned by the compute environment, so they normally disappear with it. They are never automatically published into the table's storage location. Only data that was explicitly written to persistent storage survives.",
   options=["They are kept in `s3://shop/orders/` next to the data", "They normally disappear with the compute environment",
            "They are converted to Parquet and committed to the table", "They are moved to the control plane for reuse"], answer=1,
   why=["Shuffle files live on the workers' local disks, not in your object storage path.", "Correct: they are temporary and owned by compute.",
        "Nothing commits shuffle output to a table automatically.", "The control plane runs platform services. It does not store your shuffle data."])
ex("match", 2, 1, ["concept"], "Match each address or component to what it is.",
   "`s3://` is Amazon S3, `abfss://…dfs.core.windows.net` is Azure Data Lake Storage, and `gs://` is Google Cloud Storage. All three are **persistent object storage**. An executor is different: it is CPU and RAM, so it belongs to compute.",
   pairs=[["`s3://company-data/orders/`", "Amazon S3"], ["`abfss://data@company.dfs.core.windows.net/orders/`", "Azure Data Lake Storage"],
          ["`gs://company-data/orders/`", "Google Cloud Storage"], ["Executor", "Compute (CPU + RAM)"]])
ex("calc", 2, 1, ["pitfall"], "A **100 TB** persistent dataset is processed by 50 workers at 08:00 and 200 workers at 12:00. At 18:00 the cluster scales to **0 workers**. How many TB of the dataset still exist in storage at 18:00?",
   "All **100 TB** remain, because storage and compute have independent lifetimes. Scaling compute to zero only stops processing and billing for workers. The trap is to think that 'no cluster' means 'no data'.",
   answer=100, tolerance=0, unit="TB")
ex("free", 2, 2, ["interview"], "**Challenge Q12.** Why is this architecture useful?\n`100 TB persistent dataset` · `08:00 → 50 workers` · `12:00 → 200 workers` · `18:00 → 0 workers`",
   "Persistent storage survives on its own while compute capacity scales with the workload. You pay for 200 workers only at peak, for zero at night, and the data is never at risk because it does not live on the workers.",
   model="Because storage and compute are decoupled: the 100 TB lives in persistent object storage that survives independently, while compute can be scaled up (200 workers at peak), down, or to zero according to the workload. You pay for compute only when you need it, and terminating workers never deletes the data.",
   rubric=["Storage persists independently of compute", "Compute scales up/down (even to zero) with workload", "Cost or elasticity benefit", "Terminating compute does not delete data"])
ex("odd", 2, 1, ["concept"], "Which one doesn't belong?",
   "Amazon S3, ADLS and GCS are all **persistent cloud object storage**. A Spark executor is **compute**: CPUs and RAM that disappear when the cluster is terminated.",
   options=["Amazon S3", "Azure Data Lake Storage", "Google Cloud Storage", "Spark executor"], answer=3)

# =====================================================================
# S03 File ≠ table
# =====================================================================
sec(3, "A File Is Not a Table",
    "Three Parquet files are not yet an `orders` table. Something has to say which files count.",
[
 P("Suppose storage contains:"),
 CODE("text", "/orders/\n  part-00000.parquet\n  part-00001.parquet\n  part-00002.parquet"),
 P("Those are **files**. You may *logically* read them as \"the `orders` table\", but files alone do not give you full database-table behavior."),
 P("Now run an update on one e-shop order:"),
 CODE("sql", "UPDATE orders\nSET status = 'cancelled'\nWHERE order_id = 123;"),
 REV("Think first: order 123 lives inside part-00001.parquet. Why can't the engine just change that one cell?",
     "Columnar files are **immutable-ish**: values are grouped by column, encoded and compressed. They are not a grid of editable cells. The engine usually writes a **new file version** that contains the changed rows."),
 CO("pitfall", "Not an Excel cell",
    "Don't picture `UPDATE` as editing a cell in Excel. For columnar files the engine often has to **create a new file** that holds the changed rows."),
 DIA("part-00001.parquet  ──►  old file: NO LONGER part of table\n"
     "part-00003.parquet  ──►  new file: NOW part of table\n"
     "                (contains order 123 = 'cancelled')\n"
     "\n"
     "    who records this?  ──►  metadata / transaction state",
     "After an UPDATE, someone must track which files count"),
 CO("key", "The missing piece",
    "Something must know *old file → no longer part of the table* and *new file → now part of the table*. That something is **metadata / transaction state**. In Databricks it is the Delta transaction log."),
])

ex("tf", 3, 1, ["pitfall"], "`UPDATE orders SET status='cancelled' WHERE order_id=123` edits the single value for order 123 directly inside the existing Parquet file, like editing a cell in Excel.",
   "False. Columnar files are not manipulated as individual mutable cells. The engine usually writes a **new file version** with the changed rows, and metadata records that the old file is out and the new file is in.",
   quick=True, answer=False)
ex("cloze", 3, 1, ["concept"], "Fill the gaps.",
   "The part files are **physical** objects. \"The orders table\" is a **logical** interpretation of them. The link between the two, saying which files currently belong to the table, is **metadata** (transaction state).",
   quick=True, text="`part-00000.parquet`, `part-00001.parquet` … are [[physical|physical files]] objects. \"The `orders` table\" is a [[logical]] interpretation of them. Knowing which file currently belongs to the table requires [[metadata|transaction state]].",
   bank=["executor", "partition", "temporary"])
ex("mcq", 3, 2, ["concept", "exam"], "The directory `/orders/` contains three `part-0000N.parquet` files. Which statement is most accurate?",
   "Files can be *interpreted* as a table, but they don't bring table behavior such as atomic updates, coherent snapshots or a record of which files belong. Those come from metadata and transaction state. Having Parquet files also does not make something a Delta table automatically.",
   options=["They are a full database table with ACID guarantees", "They are files you may interpret as a table, but files alone don't provide full table behavior",
            "They are a Delta table, because Delta stores data as Parquet", "They are a Unity Catalog object, because they live in cloud storage"], answer=1,
   why=["Plain files have no transaction state, so there is no ACID.", "Correct.", "Delta also needs a `_delta_log`. Parquet alone is not Delta.", "Unity Catalog objects are registered metadata. Files in storage are not automatically UC objects."])
ex("spotbug", 3, 2, ["pitfall"], "A teammate wrote these notes. Click the **wrong** statements.",
   "\"These files automatically behave like a full database table\" is wrong: files alone don't give table semantics. \"UPDATE rewrites only that one cell … in place\" is wrong: the engine writes a replacement file instead of editing cells in a columnar file. The other lines describe the correct model.",
   lines=["/orders/ contains part-00000 … part-00002.parquet",
          "These files automatically behave like a full database table",
          "order_id = 123 lives inside part-00001.parquet",
          "UPDATE rewrites only that one cell inside part-00001.parquet, in place",
          "Something must record that the old file is out and the new file is in"],
   bugs=[1, 3], fix="Line 1 → 'These files can be interpreted as a table, but files alone don't provide full table behavior.'\nLine 3 → 'UPDATE typically writes a new file with the changed rows; metadata/transaction state marks the old file as removed and the new file as added.'")
ex("free", 3, 2, ["concept"], "In 2–3 sentences, explain why a directory of Parquet files is **not** the same as a table.",
   "A table is a logical object with defined membership, a schema and transactional behavior. A directory is just bytes. You need metadata or transaction state to know which files make up the table at each moment, especially after updates create replacement files.",
   model="Files are physical bytes in storage; a table is a logical object. After an UPDATE/DELETE the engine writes replacement files, so something (metadata/transaction state) must record which files currently belong to the table and which are obsolete. A bare directory has no such record, so it can't provide full table behavior.",
   rubric=["Files = physical, table = logical", "Changes create replacement files", "Metadata/transaction state decides membership", "Directory alone lacks that"])
ex("odd", 3, 1, ["concept"], "Which one doesn't belong?",
   "The three `part-*.parquet` items are **physical files** in storage. \"The `orders` table\" is a **logical** concept, and you need metadata to know which files make it up.",
   options=["part-00000.parquet", "part-00001.parquet", "part-00002.parquet", "the `orders` table"], answer=3)

# =====================================================================
# S04 Parquet & pruning
# =====================================================================
sec(4, "What Parquet Gives You: Columnar Storage & Pruning",
    "Read only the columns, and later only the files, that the query needs.",
[
 P("Take a small `people` table: `id | name | age | country`, with rows (1, Maria, 25, GR), (2, John, 37, US), (3, Anna, 42, DE)."),
 CMP(("Row-oriented (naive)", ["`1, Maria, 25, GR`", "`2, John, 37, US`", "`3, Anna, 42, DE`", "Whole rows stored together"]),
     ("Columnar (Parquet idea)", ["`id: 1 2 3`", "`name: Maria John Anna`", "`age: 25 37 42`", "`country: GR US DE`"])),
 TERMS([("Row group", "A horizontal slice of rows inside a Parquet file."),
        ("Column chunk", "The data of one column within one row group."),
        ("Page", "The smallest unit inside a column chunk. Encoding and compression are applied at this level."),
        ("Encodings / compression", "Ways to store a column compactly. Similar values sit together, so they compress well."),
        ("File metadata", "Schema and statistics stored in the file footer.")]),
 P("Real Parquet is more sophisticated than this picture, but the picture explains why **analytical engines** like it."),
 CODE("sql", "SELECT AVG(age)\nFROM people;"),
 P("This query needs `age`. It does not need `id`, `name`, `country`, `address`, `email`…"),
 CO("key", "Column pruning",
    "Columnar formats let the engine **skip irrelevant columns**. This is called **column pruning**. It reduces I/O."),
 CODE("text", "ReadSchema: struct<age:int>", "What you'll see in a Spark plan, even if the table has 100 columns"),
 CO("pitfall", "ReadSchema is not cosmetic",
    "`ReadSchema: struct<age:int>` means Spark **requested only the column it needs** from storage. It is evidence that pruning happened, not a decorative line in the plan."),
 P("**Exercise 2.** The table is `sales(sale_id, customer_id, product_id, amount, country, timestamp, salesperson, comments)` and the query is:"),
 CODE("sql", "SELECT country, SUM(amount)\nFROM sales\nGROUP BY country;"),
 REV("Which columns are fundamentally needed from storage?",
     "Only `country` and `amount`. The other six columns can potentially be pruned, which reduces I/O."),
 CMP(("Column pruning", ["Reduces **which columns** are read", "Comes from the columnar format", "e.g. read 2 of 80 columns"]),
     ("Data skipping / partition / clustering pruning", ["Reduces **which files or regions** are scanned", "Comes from table layout + statistics", "e.g. read only files for one date"])),
 CO("exam", "Two different mechanisms (Challenge Q14)",
    "A 5 TB table, and the query needs 2 columns and one date. **Column pruning** cuts the columns. **Data skipping / partition or clustering pruning** cuts the files or regions. They are different mechanisms, and later chapters cover each one in detail."),
])

ex("mcq", 4, 1, ["concept"], "**Exercise 2.** `sales(sale_id, customer_id, product_id, amount, country, timestamp, salesperson, comments)`. Which columns does this query fundamentally need from storage? (Select all.)",
   "Only `country` (grouping key) and `amount` (aggregated value) are needed. Thanks to the columnar format, Spark can prune the other six columns and read less. `sale_id` is a tempting wrong pick, but nothing in the query references it.",
   quick=True, code="SELECT country, SUM(amount)\nFROM sales\nGROUP BY country;", multi=True,
   options=["sale_id", "customer_id", "amount", "country", "timestamp", "comments"], answer=[2, 3],
   why=["Not referenced.", "Not referenced.", "Needed: aggregated by SUM.", "Needed: GROUP BY key.", "Not referenced.", "Not referenced."])
ex("mcq", 4, 1, ["concept", "exam"], "**Challenge Q5.** Why can `SELECT AVG(age) FROM people;` read far less data from Parquet than from a row-oriented representation?",
   "Parquet is **columnar**, so Spark can do column pruning and fetch only the `age` column. In a row layout every row carries all its columns together, so you read the bytes of `name`, `email` and so on just to reach `age`. Compression helps too, but the main reason is column access.",
   quick=True, options=["Parquet files are always smaller than any other format", "Parquet is columnar, so Spark can prune and read only the `age` column",
            "Parquet keeps a transaction log that indexes ages", "Parquet caches the average in its footer"], answer=1,
   why=["Size alone isn't the point. Being able to read only one column is.", "Correct.", "A transaction log is a Delta feature, not a Parquet one.", "Parquet stores statistics, but this answer misstates the mechanism."])
ex("cloze", 4, 1, ["syntax"], "Fill the gaps.",
   "Skipping irrelevant columns is **column pruning**. The physical plan shows it as `ReadSchema: struct<age:int>`: only `age` was requested even if the table has 100 columns.",
   quick=True, text="Avoiding reading irrelevant columns is called [[column pruning]]. In the physical plan for `SELECT AVG(age) FROM people` you may see `ReadSchema: struct<[[age]]:int>` even though the table has 100 columns.",
   bank=["data skipping", "name", "shuffle", "country"])
ex("tf", 4, 1, ["pitfall"], "`ReadSchema: struct<age:int>` in a plan is cosmetic. Spark still reads all 100 columns from storage.",
   "False. ReadSchema shows the columns Spark actually **requests** from the files. A single column there is evidence that column pruning reduced I/O.",
   answer=False)
ex("calc", 4, 2, ["calc"], "Idealized model: a Parquet table has **100 columns of equal size**. Approximately what **percentage** of the column data does `SELECT AVG(age)` need to read thanks to column pruning?",
   "1 of 100 equal-size columns is **1%**. Real numbers differ because columns differ in size and compression, but the order of magnitude shows why column pruning matters for wide tables.",
   answer=1, tolerance=0.1, unit="%")
ex("calc", 4, 2, ["calc", "debug"], "A table occupies **5 TB**, stored as **50 columns of equal size**. Your query needs **2 columns**. With column pruning alone (no file skipping), roughly how many TB must be read?",
   "2/50 × 5 TB = **0.2 TB**. Data skipping or partition/clustering pruning could cut this further by scanning only the files for the requested date. That second mechanism is separate from column pruning.",
   answer=0.2, tolerance=0.01, unit="TB")
ex("bucket", 4, 2, ["compare", "exam"], "Sort each situation by the mechanism that reduces the read.",
   "**Column pruning** reduces *which columns* are read and relies on the columnar format. **Data skipping / partition / clustering pruning** reduces *which files or regions* are scanned and relies on layout and statistics (such as min/max values per file). Q14 asks you to name one of each.",
   buckets=["Column pruning (fewer columns)", "Data skipping / partition / clustering pruning (fewer files/regions)"],
   items=[{"text": "Query needs only 2 of 80 columns", "bucket": 0},
          {"text": "`ReadSchema: struct<country:string,amount:double>`", "bucket": 0},
          {"text": "Spark never fetches the `comments` column", "bucket": 0},
          {"text": "Only files for one date are scanned", "bucket": 1},
          {"text": "Files whose statistics exclude the filter value are skipped", "bucket": 1},
          {"text": "Only one partition directory is read", "bucket": 1}])
ex("free", 4, 3, ["debug", "exam"], "**Challenge Q14 (debugging).** A table occupies 5 TB in cloud storage, but your query needs two columns and rows from one date. Name **two fundamentally different mechanisms** that could reduce what Spark has to read.",
   "The key word is *different*. One mechanism trims the read vertically (columns) and the other trims it horizontally (files or regions). Naming two kinds of pruning that both cut columns would miss the point.",
   model="1) Column pruning: because the format is columnar, Spark reads only the two needed columns. 2) Data skipping / partition pruning / clustering-based pruning: using table layout and statistics, Spark skips files or regions that cannot contain the requested date.",
   rubric=["Column pruning (fewer columns)", "Data skipping / partition / clustering pruning (fewer files/regions)", "States that the two are different axes"])
ex("write", 4, 1, ["syntax"], "Write the Exercise 2 query: total `amount` per `country` from `sales`.",
   "`GROUP BY country` with `SUM(amount)` needs only those two columns. That makes it a textbook case for column pruning on a columnar format.",
   solution="SELECT country, SUM(amount)\nFROM sales\nGROUP BY country;", keywords=["select country", "sum(amount)", "from sales", "group by country"], lang="sql")
ex("spotbug", 4, 2, ["pitfall"], "Click the wrong line(s) in this query analysis.",
   "\"Also needed: sale_id\" is wrong: `sale_id` is not referenced, so it can be pruned. \"Column pruning also lets Spark skip files\" is wrong: column pruning reduces columns, not files. Skipping files for a date is data skipping or partition/clustering pruning.",
   lines=["Query: SELECT country, SUM(amount) FROM sales GROUP BY country",
          "Needed columns: country, amount",
          "Also needed: sale_id (to count rows)",
          "Columnar format lets Spark prune the other columns",
          "Column pruning also lets Spark skip files from other dates"],
   bugs=[2, 4], fix="Remove line 2: sale_id is not needed. Line 4 → 'Skipping files from other dates is data skipping / partition / clustering pruning, a different mechanism from column pruning.'")

# =====================================================================
# S05 Directory insufficient + ACID
# =====================================================================
sec(5, "Why Files Need Transactions: ACID",
    "A reader must never see a state that the table was never in.",
[
 P("Imagine `/orders/` holds `A.parquet`, `B.parquet`, `C.parquet`. **Reader X** starts reading A, B, C."),
 P("At the same moment, **writer Y** runs an update and changes the directory to A, D, E."),
 DIA("time ─────────────────────────────────────────►\n"
     "Reader X:  read A ....... read B ....... read C?\n"
     "Writer Y:        [ replace B,C with D,E ]\n"
     "\n"
     "OK      : A B C   (old state)\n"
     "OK      : A D E   (new state)\n"
     "DANGER  : A B E   (a state that never existed)",
     "Concurrent reader and writer on a plain directory"),
 REV("Think first: what's wrong with seeing A B E?",
     "A B E may correspond to **no valid state of the table at all**: half old, half new. This is where database transactional semantics come in."),
 TAB(["Letter", "Meaning", "E-shop example"], [
     ["**A**tomicity", "A transaction happens completely or not at all. The commit becomes visible as **one logical change**.", "A pipeline replaces 80 files. Nobody should see 37 old + 43 new."],
     ["**C**onsistency", "Each transaction moves the database from one valid state to another and respects enforced invariants.", "An order table never ends up violating its enforced rules."],
     ["**I**solation", "Concurrent operations don't produce invalid interleavings. A reader sees a coherent snapshot.", "Reader R sees version 87 while W creates 88, never half-87-half-88."],
     ["**D**urability", "Once a transaction commits, that state survives later process or compute failures.", "The cluster crashes after the commit and the new orders are still there."]]),
 CO("exam", "Two meanings of \"consistency\"",
    "ACID **Consistency** means valid state → valid state, respecting invariants. It is **not** the C in the CAP theorem from distributed systems. Same English word, different concept."),
 DIA("Reader R ──► snapshot v87  (coherent)\n"
     "Writer W ──► creating v88\n"
     "\n"
     "never: rows from v87 + rows from v88 mixed",
     "Isolation"),
 CO("key", "Why Parquet alone can't do this (Q15)",
    "Parquet describes **how data is stored in files**. By itself it gives no transaction history, no atomic commits, no coherent snapshots and no table-state management. Those are what concurrent, database-like modifications need."),
 ASK("Ask yourself when a reader sees mixed or partial data", [
     "Is this a plain directory of Parquet files with no transaction log?",
     "Am I reading the files directly by path instead of through the table's committed snapshot?",
     "Was a writer replacing files while I was reading?",
     "Which guarantee failed: atomicity (half-done commit visible) or isolation (interleaving)?"]),
])

ex("mcq", 5, 1, ["concept"], "Reader X starts reading A, B, C while writer Y changes the directory to A, D, E. Which results would be **valid** for X to see? (Select all.)",
   "Valid results are complete states: the old one (A B C) or the new one (A D E). Mixtures such as A B E, or a union of both like A B C D E, represent **no valid table state**. Preventing them is the job of transactional semantics.",
   quick=True, multi=True, options=["A B C", "A D E", "A B E", "A B C D E"], answer=[0, 1],
   why=["Complete old state.", "Complete new state.", "Half old, half new: invalid.", "A union of two states is not a state the table was ever in."])
ex("match", 5, 1, ["concept", "exam"], "Match each ACID property to its meaning.",
   "Atomicity is all-or-nothing visibility. Consistency is valid → valid while respecting invariants. Isolation means no invalid interleavings, so each reader gets a coherent snapshot. Durability means committed state survives failures.",
   quick=True, pairs=[["Atomicity", "Completely or not at all: one logical change"],
                      ["Consistency", "Valid state → valid state, respecting invariants"],
                      ["Isolation", "Concurrent ops don't interleave invalidly; coherent snapshot"],
                      ["Durability", "Committed state survives later compute failure"]])
ex("tf", 5, 1, ["exam", "pitfall"], "The C in ACID means the same thing as the C (Consistency) in the CAP theorem.",
   "False. ACID consistency means a transaction moves the database from one valid state to another while respecting invariants. CAP consistency is a distributed-systems property about replicas agreeing. Same word, different concept, and a classic trap.",
   quick=True, answer=False)
ex("mcq", 5, 2, ["exam"], "**Challenge Q6.** A reader sees some files from **before** a transaction and some files created **during** it. What's the problem, and which ACID idea is most directly involved?",
   "The reader observes an **invalid partial state** that never existed as a committed table. Atomic visibility of commits and isolation between reader and writer are the guarantees that prevent this. Durability is about surviving crashes after the commit, so it is not the answer here.",
   options=["Data loss; durability", "An invalid partial state; atomic visibility / isolation", "Slow reads; column pruning", "Schema mismatch; consistency in the CAP sense"], answer=1,
   why=["No committed data is lost here.", "Correct.", "This is about correctness, not speed.", "CAP consistency is a different concept."])
ex("cloze", 5, 2, ["concept"], "Fill the gaps about isolation.",
   "Isolation means reader R keeps a coherent snapshot (version 87) while writer W builds version 88. A dataset that is half 87 and half 88 is an invalid interleaving.",
   text="Reader R should see a coherent snapshot such as version [[87]] while writer W creates version [[88]], and never a half-87-half-88 dataset. This ACID property is [[isolation]].",
   bank=["atomicity", "durability", "86", "89"])
ex("calc", 5, 2, ["pitfall", "exam"], "A pipeline replaces **80 files** atomically. Halfway through the write, 43 new files physically exist. How many of the **new** files may a concurrent reader of the current table see **before the commit**?",
   "**0.** With atomicity the change becomes visible as one logical commit, so before it a reader sees only the old state and after it only the new one. Seeing 43 new files plus 37 old ones is exactly the partial state atomicity forbids.",
   answer=0, tolerance=0, unit="files")
ex("free", 5, 3, ["interview", "exam"], "**Challenge Q15 (critical thinking).** Why isn't adding ACID semantics to an object store simply a matter of \"store everything as Parquet\"?",
   "The trap is to treat a file format as a transaction system. Parquet is about layout inside a file. ACID is about state across files and over time, so it needs a log or protocol on top.",
   model="Parquet describes how data is stored inside files; by itself it provides no transaction history, no atomic commits, no coherent snapshots for readers, and no table-state management (which files belong to which version). Those are required for database-like concurrent modifications — which is why Delta adds a transaction log on top of Parquet.",
   rubric=["Parquet = file storage format only", "No transaction history / atomic commits", "No coherent snapshots / isolation", "Needs table-state management (e.g. Delta log)"])
ex("odd", 5, 1, ["concept"], "Which one doesn't belong?",
   "Atomicity, Isolation and Durability are ACID transaction guarantees. Column pruning is a read optimization made possible by columnar formats and has nothing to do with transactional correctness.",
   options=["Atomicity", "Isolation", "Durability", "Column pruning"], answer=3)
ex("scenario", 5, 3, ["debug"], "A dashboard query on `/orders/` ran while the nightly job was replacing files. It returned rows from `A`, `B` and `E`, a mix that matches neither the old nor the new state.",
   "Mixed states come from the lack of a transactional layer: no log, or a reader that bypasses it. The fix is to make commits atomic and reads snapshot-based (Delta, read through the table), not to time jobs carefully or add compute.",
   steps=[
     {"prompt": "What do you check first?",
      "options": [{"text": "Whether `/orders/` is a plain Parquet directory (no `_delta_log/`) or a Delta table", "ok": True, "fb": "Right. Without a transaction log, nothing makes a commit atomic."},
                  {"text": "Whether the cluster had enough memory", "ok": False, "fb": "Memory doesn't cause a mixed table state."},
                  {"text": "Whether the query used column pruning", "ok": False, "fb": "Column pruning changes which columns are read, not which version is seen."}]},
     {"prompt": "It *is* a Delta table. What next?",
      "options": [{"text": "Check whether the dashboard reads the folder as plain Parquet (`spark.read.parquet(path)`) instead of through Delta", "ok": True, "fb": "Correct. A plain Parquet read lists every physical file and ignores the log's snapshot."},
                  {"text": "Delete the `_delta_log` folder and retry", "ok": False, "fb": "Destroys the table state. Never do this."},
                  {"text": "Schedule the dashboard so it never overlaps the job", "ok": False, "fb": "That hides the symptom. Proper isolation makes overlap safe."}]},
     {"prompt": "Which ACID ideas does the fix restore?",
      "options": [{"text": "Atomic visibility of commits + isolation (one coherent snapshot per reader)", "ok": True, "fb": "Yes. The reader sees v87 or v88, never half of each."},
                  {"text": "Durability only", "ok": False, "fb": "Durability is about surviving failures after a commit."},
                  {"text": "CAP consistency", "ok": False, "fb": "A different concept from ACID."}]}])
ex("order", 5, 2, ["debug"], "Order the checks for *\"a reader saw a mixed/partial state\"*.",
   "First establish whether a transactional layer exists at all, then whether the reader actually uses it. Then confirm the overlap with a writer, and finally name the violated guarantee so the fix targets it.",
   items=["Check for a `_delta_log/` (is there a transaction log?)",
          "Check that the reader goes through the table/Delta, not plain Parquet by path",
          "Confirm a writer was replacing files during the read",
          "Name the violated guarantee: atomicity / isolation",
          "Fix: Delta table + snapshot reads"])

# =====================================================================
# S06 Delta Lake & the transaction log
# =====================================================================
sec(6, "Delta Lake & the Transaction Log",
    "Parquet holds the rows. `_delta_log` decides which files are the table.",
[
 P("Traditional **data lakes** gave cheap, scalable storage, but they historically lacked the guarantees expected from databases. Databricks' core answer is **Delta Lake**."),
 CO("key", "Definition",
    "Delta Lake extends **Parquet data files** with a **file-based transaction log**. That gives ACID transactions and scalable metadata management while staying compatible with the Spark APIs. Delta is the **default table format** on Databricks unless you specify otherwise."),
 DIA("my_table/\n"
     " ├─ part-00000.parquet\n"
     " ├─ part-00001.parquet\n"
     " ├─ part-00002.parquet\n"
     " └─ _delta_log/\n"
     "      └─ …  (one commit per table version)",
     "A Delta table on storage (simplified)"),
 TAB(["Piece", "Role"], [["Parquet files", "the actual rows"], ["`_delta_log`", "which files make up each valid table version"]]),
 P("Each version is a commit made of **ADD** and **REMOVE** actions. Replay them in order to get a snapshot:"),
 CODE("text", "version 0:  add A   add B\nversion 1:  remove B   add C\nversion 2:  add D\n\nsnapshot(v0) = A + B\nsnapshot(v1) = A + C\nsnapshot(v2) = A + C + D",
      "Replaying the log"),
 P("Notice that `B.parquet` may still **physically exist** for some time. The current snapshot simply says *B is not part of the current table*."),
 CO("key", "The essential insight",
    "**Physical existence of a file ≠ logical membership in the current table.** The relevant snapshot decides membership, not the file listing."),
 L(["`DELETE`", "`UPDATE`", "`MERGE`", "Time Travel", "`VACUUM`", "concurrent writes"]),
 P("Every topic above depends on that insight. You will meet each of them in later chapters."),
 CO("pitfall", "Parquet files ≠ Delta table",
    "`part-0000.parquet`, `part-0001.parquet`… do **not** automatically mean you have a Delta table. Without a `_delta_log` there is no transaction log, so it is not Delta."),
 CO("warn", "Uncommitted files are invisible (Q11)",
    "If Spark has physically written three replacement files but the transaction has **not committed**, readers of the current table must not see them. Creating files is not the same as **publishing a committed version**."),
 CO("warn", "Read the table, not the folder",
    "If you list the folder, or read it as plain Parquet, you see **every** physical file, including removed and uncommitted ones. Read through the Delta table so that the log decides what counts."),
 ASK("Ask yourself when files exist in storage but their rows aren't in the table", [
     "Does the current snapshot reference this file, or did a later version REMOVE it?",
     "Did the transaction that wrote this file ever commit?",
     "Was this file dropped into the folder by a plain Parquet write that never touched the log?",
     "Am I treating physical existence as logical membership?"]),
])

ex("mcq", 6, 2, ["concept", "exam"], "**Exercise 3.** Which files make up the current snapshot after v3?",
   "Replay the log: v0 → {A, B}. v1 removes A and adds C → {B, C}. v2 adds D → {B, C, D}. v3 removes B → **{C, D}**. A and B may still physically exist, but they are not logical members.",
   quick=True, code="v0: ADD A   ADD B\nv1: REMOVE A   ADD C\nv2: ADD D\nv3: REMOVE B",
   options=["A + B + C + D", "C + D", "B + C + D", "D only"], answer=1,
   why=["Ignores the REMOVE actions. That is the physical listing, not the snapshot.", "Correct.", "That is the state after v2. v3 removed B.", "C was never removed."])
ex("tf", 6, 1, ["exam", "pitfall"], "**Challenge Q1.** A folder containing `part-0000.parquet`, `part-0001.parquet` and `part-0002.parquet` automatically means you have a Delta table.",
   "False. Plain Parquet files do not imply a Delta transaction log. A Delta table is Parquet data files **plus** `_delta_log`, which records which files form each version.",
   quick=True, answer=False)
ex("mcq", 6, 2, ["exam"], "**Challenge Q7.** What is the current snapshot?",
   "v0: {A, B}. v1: remove A, add C → {B, C}. v2: add D → {B, C, D}. v3: remove C, add E → **{B, D, E}**. If you forget a REMOVE, you get a superset that no version ever had.",
   code="v0 ADD A\nv0 ADD B\nv1 REMOVE A\nv1 ADD C\nv2 ADD D\nv3 REMOVE C\nv3 ADD E",
   options=["A, B, C, D, E", "B, C, D, E", "B, D, E", "D, E"], answer=2,
   why=["The physical files, ignoring every REMOVE.", "Forgot v3's REMOVE C.", "Correct.", "B was never removed."])
ex("calc", 6, 2, ["calc"], "Using the Q7 log (`v0 ADD A, ADD B · v1 REMOVE A, ADD C · v2 ADD D · v3 REMOVE C, ADD E`): **how many files** are in the current snapshot, and how many files were ever written in total? Enter only the **snapshot count**.",
   "5 files were written (A–E), but the snapshot holds **3** (B, D, E). The difference (A and C) may still sit physically in storage. That is the gap between physical existence and logical membership.",
   answer=3, tolerance=0, unit="files")
ex("tf", 6, 1, ["exam", "pitfall"], "**Challenge Q4.** A Parquet file physically exists in storage, but the current Delta snapshot no longer references it. It is still logically part of the current table.",
   "False. Logical membership is decided by the relevant table snapshot, not by whether a file physically exists. Removed files can linger until they are cleaned up, and they are still not part of the current table.",
   answer=False)
ex("mcq", 6, 1, ["exam"], "**Challenge Q10.** Which component primarily provides **transactional state**?",
   "The **Delta transaction log** records the ADD/REMOVE commits that define each version. Executors compute and Parquet stores rows. Unity Catalog grants control who may access data, not which files form a version.",
   options=["Spark executor", "Parquet alone", "Delta transaction log", "Unity Catalog permission grants"], answer=2,
   why=["Executors are temporary compute.", "Parquet has no transaction history.", "Correct.", "Grants are governance, not transaction state."])
ex("tf", 6, 2, ["exam", "pitfall"], "**Challenge Q11.** Spark has physically written three replacement files, but the Delta transaction has not committed. A reader of the current table should already see those three files, because they physically exist.",
   "False. Physically creating files is not the same as publishing a committed table version. Until the commit lands in the log, readers keep seeing the previous snapshot. That is atomicity and isolation at work.",
   answer=False)
ex("order", 6, 2, ["concept"], "Order the snapshots produced by replaying the Exercise 3 log (`v0: ADD A, ADD B · v1: REMOVE A, ADD C · v2: ADD D · v3: REMOVE B`).",
   "Replay strictly in version order and apply each REMOVE and ADD. Every snapshot is a complete, valid state. Applying versions out of order produces a state the table never had.",
   items=["v0 → {A, B}", "v1 → {B, C}", "v2 → {B, C, D}", "v3 → {C, D}"])
ex("spotbug", 6, 3, ["debug"], "A colleague replayed this log by hand. Click the line where the replay goes wrong.",
   "Log: `v0 ADD A, ADD B · v1 REMOVE A, ADD C · v2 ADD D · v3 REMOVE C, ADD E`. The error starts at `v2 → {A, B, C, D}`: v2 only adds D, so the state is {B, C, D}, because A was removed in v1. `v3 → {A, B, D, E}` carries the same mistake forward. The correct final snapshot is {B, D, E}.",
   lines=["v0 → {A, B}", "v1 → {B, C}", "v2 → {A, B, C, D}", "v3 → {A, B, D, E}"],
   bugs=[2, 3], fix="v2 → {B, C, D}\nv3 → {B, D, E}")
ex("bucket", 6, 1, ["concept"], "Parquet data files or `_delta_log`? Sort each responsibility.",
   "Parquet files hold the **rows**, column-encoded and compressed. The `_delta_log` holds the **table state**: ADD/REMOVE actions and which files make up each version. That state is what makes snapshots and time travel possible.",
   buckets=["Parquet data files", "_delta_log"],
   items=[{"text": "The actual rows (e.g. `123, 4921, 79.95`)", "bucket": 0},
          {"text": "Columnar encoding and compression", "bucket": 0},
          {"text": "Which files make up version 2", "bucket": 1},
          {"text": "ADD / REMOVE actions per commit", "bucket": 1},
          {"text": "Knowing that B.parquet is no longer in the table", "bucket": 1},
          {"text": "Values of the `amount` column", "bucket": 0}])
ex("mcq", 6, 2, ["concept"], "Which later topics depend on understanding *physical existence ≠ logical membership*? (Select all.)",
   "DELETE, UPDATE and MERGE create replacement files and REMOVE old ones. Time Travel reads older snapshots. VACUUM physically cleans up files that are no longer referenced. Column pruning is a read optimization that does not depend on this idea.",
   multi=True, options=["DELETE / UPDATE / MERGE", "Time Travel", "VACUUM", "Concurrent writes", "Column pruning"], answer=[0, 1, 2, 3],
   why=["They rewrite and REMOVE files.", "It reads old snapshots whose files may still exist.", "It deletes files that are no longer referenced.", "Writers commit competing versions.", "It is about columns, not file membership."])
ex("scenario", 6, 3, ["debug"], "You list `s3://shop/orders/` and see `X.parquet`, but `SELECT` on the Delta table never returns any of X's rows.",
   "Start from the log, not the folder listing. Check whether X is referenced by the current snapshot. If it isn't, find out why: a later REMOVE, a write that never committed, or a write that bypassed the log. Never point a plain Parquet reader at the folder to \"fix\" it.",
   steps=[
     {"prompt": "What do you check first?",
      "options": [{"text": "Whether the current snapshot (replayed from `_delta_log`) references X.parquet", "ok": True, "fb": "Right. Membership comes from the snapshot, not from the folder listing."},
                  {"text": "Increase the cluster size and rerun the query", "ok": False, "fb": "This isn't a capacity problem. More compute won't make an unreferenced file appear."},
                  {"text": "Re-read the folder with `spark.read.parquet(...)`", "ok": False, "fb": "That bypasses the log and would also return removed or uncommitted data. It hides the problem."}]},
     {"prompt": "The current snapshot does NOT reference X. Which explanation fits?",
      "options": [{"text": "A later version REMOVEd X (e.g. after an UPDATE/DELETE), or X's transaction never committed", "ok": True, "fb": "Correct. Both leave a physical file that is not a logical member."},
                  {"text": "S3 is corrupting the file", "ok": False, "fb": "Storage is not the suspect. The file reads fine, it just isn't in the table."},
                  {"text": "Column pruning skipped the file", "ok": False, "fb": "Column pruning drops columns, not whole files."}]},
     {"prompt": "What's the correct conclusion?",
      "options": [{"text": "X physically exists but is not logically part of the current table. That is expected behavior", "ok": True, "fb": "Yes: physical existence ≠ logical membership."},
                  {"text": "Manually add X to the folder again", "ok": False, "fb": "It's already in the folder. Only a commit makes a file part of the table."},
                  {"text": "Delete `_delta_log` so all files are read", "ok": False, "fb": "Never do this. You would destroy the table's state and expose stale files."}]}])
ex("order", 6, 2, ["debug"], "Put the investigation for *\"file exists in storage, rows not in the table\"* in order.",
   "Start by confirming the symptom from the table's point of view. Then consult the log for membership and explain the absence (REMOVE, missing commit, or a write that bypassed the log). Only then decide on a fix.",
   items=["Confirm the rows are missing when querying the table (not the folder)",
          "Replay the log: is the file referenced by the current snapshot?",
          "If not: was it REMOVEd by a later version, or never committed?",
          "Check whether it was written by a plain Parquet write that bypassed the log",
          "Conclude: physical existence ≠ logical membership, so fix the write path if needed"])

# =====================================================================
# S07 SQL operation vs physical files
# =====================================================================
sec(7, "SQL Operations vs Physical Files",
    "`DELETE` looks like row surgery. Underneath, it is a file swap plus a commit.",
[
 CODE("sql", "DELETE FROM orders\nWHERE order_id = 123;"),
 CMP(("Beginner model", ["find row 123", "erase row"]),
     ("Better model (file-oriented storage)", ["find the file that contains 123 (A.parquet)", "write a replacement file without 123 (B.parquet)", "commit: REMOVE A, ADD B"])),
 DIA("A.parquet            B.parquet\n"
     "──────────           ──────────\n"
     "120                  120\n"
     "121                  121\n"
     "123   ── rewrite ──► 124\n"
     "124                  125\n"
     "125\n"
     "\n"
     "commit:  REMOVE A.parquet   ADD B.parquet\n"
     "before:  table → A        after:  table → B",
     "A DELETE as a file rewrite plus a transaction"),
 FLOW(["Locate file with row", "Write replacement file", "Commit REMOVE old + ADD new", "New snapshot uses new file"], "DELETE under the hood (foundation model)"),
 P("The operation looks like normal database **DML** (`DELETE`). Underneath it may involve **file-level rewriting** and **transaction metadata**."),
 CO("tip", "This model will get more detail",
    "Modern Delta has extra mechanisms and optimizations that refine this picture in later chapters. The rewrite + REMOVE/ADD model is still the correct foundation."),
 CO("pitfall", "\"Deleted\" ≠ physically erased",
    "After the commit, `A.parquet` is no longer part of the table, but it may still **physically exist** for a while. The snapshot changed. The bytes in storage didn't have to."),
 REV("Think first (Q3): why can a Delta DELETE create new Parquet files?",
     "Columnar data files are not edited as individual mutable cells. A change may produce **replacement files**, plus transaction metadata recording which files now belong to the table."),
])

ex("order", 7, 1, ["concept"], "Order what happens (foundation model) when you run `DELETE FROM orders WHERE order_id = 123;`",
   "The engine finds the file holding the row, writes a replacement without it, and commits REMOVE old + ADD new as one transaction. Only after the commit does the snapshot point to the new file. Readers before the commit still see the old file.",
   quick=True, items=["Locate the file containing order 123 (A.parquet)", "Write replacement B.parquet without row 123",
                      "Commit: REMOVE A.parquet + ADD B.parquet", "New snapshot: table → B"])
ex("mcq", 7, 2, ["exam"], "**Challenge Q3.** Why can a Delta `DELETE` operation require creating new Parquet files?",
   "Columnar data files are generally not edited as individual mutable cells. A change can mean writing replacement files, plus transaction metadata that marks which files now belong to the table. The other options describe things that aren't true.",
   quick=True, options=["Because Delta keeps every deleted row in a new 'trash' file", "Because columnar files aren't edited cell by cell, so changes produce replacement files plus log metadata",
            "Because Spark must convert Parquet to CSV before deleting", "Because Unity Catalog requires a new file for every permission change"], answer=1,
   why=["There's no 'trash file' in this model.", "Correct.", "No format conversion happens.", "Permissions don't create data files."])
ex("write", 7, 1, ["syntax"], "Write the SQL to delete the e-shop order with id 123 from `orders`.",
   "This is ordinary DML syntax. On a Delta table it may turn into a file rewrite plus a REMOVE/ADD commit.",
   solution="DELETE FROM orders\nWHERE order_id = 123;", keywords=["delete from orders", "where order_id = 123"], lang="sql")
ex("tf", 7, 1, ["pitfall"], "After `DELETE FROM orders WHERE order_id = 123` commits, `A.parquet` (the old file) has necessarily already been physically erased from storage.",
   "False. The commit removes A from the **current snapshot**, but the file can still physically exist for some time. Logical membership changed, and physical cleanup is a separate matter.",
   answer=False)
ex("spotbug", 7, 2, ["debug"], "Click the wrong line(s) in this description of a DELETE.",
   "\"write B.parquet containing 120,121,123,…\" is wrong: the replacement must not contain row 123, otherwise nothing is deleted. \"commit: ADD A.parquet\" is wrong: the commit must ADD the new file B. Re-adding A would leave row 123 in the table.",
   lines=["-- before: table → A.parquet (120,121,123,124,125)", "DELETE FROM orders WHERE order_id = 123;",
          "write B.parquet containing 120,121,123,124,125", "commit: REMOVE A.parquet", "commit: ADD A.parquet",
          "-- after: table → B.parquet"],
   bugs=[2, 4], fix="write B.parquet containing 120,121,124,125\ncommit: ADD B.parquet")
ex("calc", 7, 2, ["calc"], "Foundation model: `A.parquet` holds **1,000,000** rows. `DELETE ... WHERE order_id = 123` matches exactly one row in A. How many rows must be written into the replacement file?",
   "The replacement holds every surviving row: 1,000,000 − 1 = **999,999**. Deleting one row can mean rewriting nearly a whole file, which is why later chapters cover optimizations for this.",
   answer=999999, tolerance=0, unit="rows")
ex("free", 7, 2, ["concept"], "Explain the difference between the *beginner model* and the *file-oriented model* of `DELETE` in 2–3 sentences.",
   "The key contrast is between **in-place row surgery** and **file replacement plus commit**. The table changes because the log now points to a different set of files.",
   model="The beginner imagines finding row 123 and erasing it in place. On file-oriented analytical storage, the engine instead writes a replacement file without the row and commits a transaction that REMOVEs the old file and ADDs the new one; the new snapshot points at the replacement.",
   rubric=["Beginner: find & erase in place", "Real: write replacement file", "Commit REMOVE old + ADD new", "Snapshot switches to new file"])

# =====================================================================
# S08 Lake vs warehouse → lakehouse
# =====================================================================
sec(8, "Data Lake vs Data Warehouse → Lakehouse",
    "Understand the word *lakehouse* instead of memorizing it.",
[
 CMP(("Data lake (traditional)", ["Cheap / object storage", "Files", "Flexible schemas and formats", "Huge raw datasets", "ML / data-science friendly", "Historically weaker transaction/table guarantees"]),
     ("Data warehouse (traditional)", ["Structured tables", "SQL", "Transactions", "Governance", "BI", "Optimized analytical querying", "Historically more rigid and separate from raw/ML data"])),
 DIA("Data lake characteristics\n"
     "          +\n"
     "Database / warehouse semantics\n"
     "          │\n"
     "          ▼\n"
     "      LAKEHOUSE",
     "The lakehouse idea, roughly"),
 P("**Delta Lake** is a major part of how Databricks gives object-storage data database-like table semantics. Databricks describes Delta as the **optimized storage layer underpinning lakehouse tables**."),
 CO("pitfall", "Not \"Spark with notebooks\"",
    "Databricks is **not** simply Spark with notebooks. The platform connects storage, transactional tables, Spark/Photon compute, governance, orchestration, SQL/BI, ML/AI and DevOps."),
 FLOW(["storage", "transactional tables", "Spark/Photon compute", "governance", "orchestration", "SQL/BI", "ML/AI", "DevOps"], "What Databricks connects"),
 CO("interview", "Q13: Is Delta Lake a database?",
    "\"Delta Lake is a database\" is imprecise. Delta Lake is a **transactional storage/table layer over files**, not a standalone traditional database server."),
 REV("Think first: what does the lake bring, and what does the warehouse bring?",
     "The lake brings cheap object storage, files, flexible formats and room for raw/ML data. The warehouse brings tables, SQL, transactions, governance and BI performance. The lakehouse aims to combine both on the same data."),
])

ex("bucket", 8, 1, ["compare"], "Sort each trait by the **traditional** architecture it describes.",
   "Lakes were about **cheap, flexible, raw** storage that suits ML but had weak table guarantees. Warehouses were about **structured, transactional, governed** SQL/BI but were rigid and separate from raw/ML data. The lakehouse combines both.",
   quick=True, buckets=["Data lake", "Data warehouse"],
   items=[{"text": "Cheap object storage", "bucket": 0}, {"text": "Flexible schemas / formats", "bucket": 0},
          {"text": "ML / data-science friendly raw data", "bucket": 0}, {"text": "Historically weaker transaction guarantees", "bucket": 0},
          {"text": "Structured tables with transactions", "bucket": 1}, {"text": "Optimized BI / analytical SQL", "bucket": 1},
          {"text": "Historically rigid, separate from ML data", "bucket": 1}])
ex("mcq", 8, 1, ["concept"], "Which best describes the **lakehouse** idea?",
   "A lakehouse combines **data-lake characteristics** (cheap object storage, files, flexible formats) with **database/warehouse semantics** (tables, transactions, governance). On Databricks, Delta Lake supplies much of the table side.",
   quick=True, options=["A warehouse that stores CSV exports", "Data-lake characteristics + database/warehouse semantics",
            "A lake with no schemas at all", "Spark running inside a traditional database server"], answer=1,
   why=["That's still just a warehouse.", "Correct.", "That's a raw lake without table semantics.", "The lakehouse runs on object storage, not inside a DB server."])
ex("free", 8, 2, ["interview"], "**Challenge Q13 (interview).** In one sentence, explain why *\"Delta Lake is a database\"* is an imprecise statement.",
   "A strong answer says what Delta **is** (a table and transaction layer over files in storage) and what it **is not** (a standalone database server with its own engine). Compute comes from Spark/Photon, storage from cloud object storage and governance from Unity Catalog.",
   model="Delta Lake is a transactional storage/table layer over files (Parquet + a transaction log in object storage), not a standalone traditional database server.",
   rubric=["Transactional table/storage layer", "Over files in storage", "Not a standalone database server/engine"])
ex("tf", 8, 1, ["exam", "pitfall"], "Databricks is essentially \"Spark with notebooks\".",
   "False. Databricks connects storage, transactional tables (Delta), Spark/Photon compute, governance (Unity Catalog), orchestration, SQL/BI, ML/AI and DevOps. Spark is only the compute part.",
   answer=False)
ex("odd", 8, 2, ["compare"], "Which one is **not** a traditional data-lake characteristic?",
   "Cheap object storage, flexible formats and huge raw datasets describe the lake. Strong transactions with governed BI were the **warehouse's** strengths, and the lakehouse adds them to the lake.",
   options=["Cheap object storage", "Flexible schemas / formats", "Huge raw datasets", "Strong transactions with governed BI"], answer=3)
ex("mcq", 8, 2, ["exam"], "Which statement about Delta Lake is the most precise?",
   "Delta is the **optimized storage/table layer** that underpins lakehouse tables: Parquet plus a transaction log. It is not a server, not a compute engine and not the governance layer.",
   options=["A standalone database server that replaces Spark", "The optimized storage/table layer underpinning lakehouse tables",
            "A compute engine like Photon", "The governance layer that grants permissions"], answer=1,
   why=["It's not a server and doesn't replace Spark.", "Correct.", "Photon/Spark are compute.", "That's Unity Catalog."])

# =====================================================================
# S09 Table metadata & Unity Catalog namespace
# =====================================================================
sec(9, "Table Metadata & the Unity Catalog Namespace",
    "How does `prod.sales.orders` turn into actual files? Through metadata.",
[
 CODE("sql", "SELECT *\nFROM prod.sales.orders;"),
 P("How does the system know what `prod.sales.orders` means? It needs **metadata**."),
 CMP(("Metadata (describes the data)", ["catalog: `prod`", "schema: `sales`", "table name: `orders`",
                                         "columns: `order_id BIGINT`, `customer_id BIGINT`, `amount DECIMAL(10,2)`",
                                         "format: `DELTA`", "storage location: `s3://.../orders/`", "owner: `data_engineers`", "permissions: …"]),
     ("Data (the rows)", ["`123, 4921, 79.95`", "`124, 8177, 20.30`"])),
 CO("key", "Metadata ≠ data",
    "**Metadata describes the data.** Keep these apart and Unity Catalog becomes easy to understand later."),
 P("In modern Databricks, **Unity Catalog** organizes governed objects with a **three-level namespace**, and it is the centralized governance layer for tables and other data/AI assets."),
 CODE("text", "catalog.schema.object"),
 DIA("SELECT * FROM ecommerce.silver.orders;\n"
     "\n"
     "ecommerce  ◄ catalog\n"
     "silver     ◄ schema\n"
     "orders     ◄ table (object)",
     "Reading a three-level name"),
 CO("pitfall", "Not server.database.table",
    "Don't map `catalog.schema.object` onto `server.database.table` from traditional databases. The first part is a **catalog**, not a server. Exact semantics come later."),
 CO("exam", "Unity Catalog ≠ Delta Lake",
    "Unity Catalog = **metadata + governance** (names, ownership, permissions). Delta Lake = **transactional table format** over files. They work together but are different layers."),
 REV("Think first: in `company.finance.transactions`, which part is the catalog?",
     "`company` is the catalog, `finance` is the schema and `transactions` is the object (table)."),
])

ex("match", 9, 1, ["exam"], "**Challenge Q8.** What does each part of `company.finance.transactions` represent in the Unity Catalog naming model?",
   "Unity Catalog names follow `catalog.schema.object`, so `company` is the catalog, `finance` is the schema and `transactions` is the object (table). The first part is **not** a server.",
   quick=True, pairs=[["company", "catalog"], ["finance", "schema"], ["transactions", "object / table"]])
ex("bucket", 9, 1, ["concept"], "Metadata or data? Sort each item for the table `prod.sales.orders`.",
   "Metadata *describes* the table: names, columns and types, format, location, owner, permissions. Data is the rows themselves. Confusing the two is the root of the classic \"Unity Catalog ≠ Delta\" trap.",
   quick=True, buckets=["Metadata", "Data"],
   items=[{"text": "`amount DECIMAL(10,2)`", "bucket": 0}, {"text": "format: DELTA", "bucket": 0},
          {"text": "storage location `s3://.../orders/`", "bucket": 0}, {"text": "owner: data_engineers", "bucket": 0},
          {"text": "`123, 4921, 79.95`", "bucket": 1}, {"text": "`124, 8177, 20.30`", "bucket": 1}])
ex("mcq", 9, 2, ["pitfall", "exam"], "A colleague reads `ecommerce.silver.orders` as *server `ecommerce`, database `silver`, table `orders`*. What's wrong?",
   "Unity Catalog uses `catalog.schema.object`, so `ecommerce` is a **catalog**. Mapping it to `server.database.table` from traditional databases is a common mental trap.",
   options=["Nothing, that's exactly the UC model", "`ecommerce` is a catalog, not a server: the model is catalog.schema.object",
            "`silver` is the table and `orders` a column", "UC uses only two levels: schema.table"], answer=1,
   why=["UC is not server-based naming.", "Correct.", "`orders` is the table.", "UC uses three levels."])
ex("cloze", 9, 1, ["syntax"], "Fill the gaps.",
   "UC uses a **three-level** namespace: `catalog.schema.object`. Example: `ecommerce.silver.orders` → catalog `ecommerce`, schema `silver`, table `orders`.",
   text="Unity Catalog uses a [[three-level|3-level]] namespace: [[catalog]].[[schema]].[[object|table]]. In `ecommerce.silver.orders`, `silver` is the [[schema]].",
   bank=["server", "database", "two-level", "partition"])
ex("write", 9, 1, ["syntax"], "Write a query that reads every column of the `orders` table in schema `silver` of catalog `ecommerce`.",
   "Use the full three-level name, `catalog.schema.table`, so there is no doubt about which object you mean.",
   solution="SELECT *\nFROM ecommerce.silver.orders;", keywords=["select *", "from ecommerce.silver.orders"], lang="sql")
ex("tf", 9, 2, ["pitfall"], "Unity Catalog is where the actual rows of a table (e.g. `123, 4921, 79.95`) are stored.",
   "False. Unity Catalog is the **metadata and governance** layer: names, ownership and permissions. The rows live in Parquet data files (managed by Delta) in cloud storage.",
   answer=False)
ex("spotbug", 9, 2, ["concept"], "Click the wrong line(s) in this metadata description of `prod.sales.orders`.",
   "\"server: prod\" is wrong: `prod` is the **catalog**. \"database server: sales\" is wrong: `sales` is the **schema**. The UC model is catalog.schema.object, not server.database.table.",
   lines=["server: prod", "database server: sales", "table name: orders", "format: DELTA", "storage location: s3://.../orders/"],
   bugs=[0, 1], fix="catalog: prod\nschema: sales")

# =====================================================================
# S10 The one diagram + Spark + cluster deletion
# =====================================================================
sec(10, "The One Diagram: Spark, Delta, UC & Storage",
    "Four related things, not synonyms. Confusing them is a classic certification trap.",
[
 DIA("            YOU\n"
     "             │  SQL / Python\n"
     "             ▼\n"
     "   ┌────────────────────┐\n"
     "   │   Compute engine   │\n"
     "   │   Spark / Photon   │\n"
     "   └─────────┬──────────┘\n"
     "             │ reads / writes\n"
     "             ▼\n"
     "   ┌────────────────────┐\n"
     "   │    Delta table     │\n"
     "   │ Parquet data files │\n"
     "   │ + transaction log  │\n"
     "   └─────────┬──────────┘\n"
     "             │ physically lives in\n"
     "             ▼\n"
     "   ┌────────────────────┐\n"
     "   │   Cloud storage    │\n"
     "   │  S3 / ADLS / GCS   │\n"
     "   └────────────────────┘",
     "Keep this model"),
 P("You already know `spark.read.parquet(...)` and `df.write.parquet(...)`. **Spark** is the processing engine. **Parquet** is a storage file format."),
 CODE("python", "df = spark.read.parquet(path)          # Spark reads Parquet files\ndf.write.parquet(path)                  # Spark writes Parquet files\n\ndf.write.format(\"delta\").save(path)    # Parquet files + Delta log\ndf.write.saveAsTable(\"catalog.schema.orders\")  # governed table"),
 FLOW(["Spark", "produces Parquet data files", "updates Delta transaction metadata"], "df.write.format(\"delta\").save(...)"),
 DIA("Unity Catalog object   (catalog.schema.orders)\n"
     "        │\n"
     "        ▼\n"
     "   Delta table\n"
     "        │\n"
     "        ▼\n"
     "  cloud storage",
     "saveAsTable adds a governed layer"),
 CO("tip", "Don't memorize syntax yet",
    "Later chapters take each form apart, including when these snippets are equivalent and when they **absolutely are not**."),
 P("**Databricks-style question:** you run `df.write.saveAsTable(\"prod.sales.orders\")`, then later terminate the compute resource. Does `prod.sales.orders` necessarily disappear?"),
 CO("exam", "Cluster gone ≠ table gone",
    "**No.** The compute environment and the persistent data have **different lifetimes**. This sounds trivial, but it explains a large class of Databricks architecture questions."),
 CO("key", "Spark vs Delta (Q2)",
    "Spark is mainly a **distributed computation engine**. Delta Lake supplies **transactional table/storage semantics** over data files."),
 ASK("Ask yourself when a table \"disappeared\" after the cluster was terminated", [
     "Am I confusing the compute resource (driver, executors, RAM) with the table (files + log in cloud storage)?",
     "Was the data ever persisted with `saveAsTable` or `format(\"delta\").save`, or did it only live in a DataFrame in memory?",
     "Did the write actually commit a table version?",
     "Am I querying the exact `catalog.schema.table` name I wrote to?"]),
])

ex("mcq", 10, 1, ["exam"], "**Challenge Q9.** Which component normally *executes* `df.groupBy(\"country\").sum(\"amount\")`?",
   "**Spark** is the compute engine that runs transformations and aggregations. Delta is the table format, Unity Catalog governs objects and Parquet is a file format. None of those execute anything.",
   quick=True, options=["Delta Lake", "Spark", "Unity Catalog", "Parquet"], answer=1,
   why=["Delta gives table semantics, not computation.", "Correct.", "UC governs names and permissions.", "Parquet is just a file format."])
ex("free", 10, 2, ["exam", "interview"], "**Challenge Q2.** What is the principal conceptual difference between **Spark** and **Delta Lake**?",
   "Separate the *engine* from the *table layer*. Spark does the work in memory on executors. Delta defines what the table is: which Parquet files, which version, with ACID guarantees.",
   quick=True, model="Spark is primarily a distributed computation engine (it executes reads, transformations, joins, aggregations), while Delta Lake supplies transactional table/storage semantics (ACID, versions/snapshots via a transaction log) over data files in storage.",
   rubric=["Spark = distributed computation engine", "Delta = transactional table/storage layer", "Delta works over data files (Parquet + log)"])
ex("order", 10, 1, ["concept"], "Order the layers of *the one diagram* from top (you) to bottom.",
   "You send SQL/Python to the **compute engine**, which reads and writes a **Delta table** (Parquet files + log), which physically lives in **cloud storage**. With `saveAsTable`, a Unity Catalog object sits on top of the Delta table as the governed name.",
   items=["You (SQL / Python)", "Compute engine (Spark / Photon)", "Delta table (Parquet files + transaction log)", "Cloud storage (S3 / ADLS / GCS)"])
ex("write", 10, 1, ["syntax"], "Write PySpark that saves DataFrame `df` as a **Delta** table at path `path` (path-based, not a catalog name).",
   "`format(\"delta\")` makes Spark write Parquet data files **and** update the Delta transaction log. `df.write.parquet(path)` would write plain Parquet with no log.",
   solution="df.write.format(\"delta\").save(path)", keywords=["df.write", "format(\"delta\")", ".save("], lang="python")
ex("write", 10, 2, ["syntax"], "Write PySpark that saves `df` as the governed table `orders` in schema `sales` of catalog `prod`.",
   "`saveAsTable` with a three-level name creates or updates a **Unity Catalog object** backed by a Delta table in cloud storage. That adds a governed layer on top of path-based writes.",
   solution="df.write.saveAsTable(\"prod.sales.orders\")", keywords=["saveAsTable", "prod.sales.orders"], lang="python")
ex("match", 10, 2, ["compare"], "Match each snippet to what it conceptually produces or does.",
   "`read.parquet` / `write.parquet` handle plain Parquet with no log. `format(\"delta\").save` writes Parquet **plus** the Delta log at a path. `saveAsTable(\"catalog.schema.orders\")` adds a governed UC object over the Delta table. Later chapters cover when these are equivalent and when they are not.",
   pairs=[["`spark.read.parquet(...)`", "Reads plain Parquet files"],
          ["`df.write.parquet(...)`", "Writes Parquet files only, no transaction log"],
          ["`df.write.format(\"delta\").save(...)`", "Writes Parquet files + updates Delta log at a path"],
          ["`df.write.saveAsTable(\"catalog.schema.orders\")`", "Creates/updates a governed UC table backed by Delta"]])
ex("tf", 10, 1, ["exam", "pitfall"], "After `df.write.saveAsTable(\"prod.sales.orders\")`, terminating the compute resource means `prod.sales.orders` necessarily disappears.",
   "False. Compute and persistent data have different lifetimes. The table's files and log live in cloud storage and its name lives in the catalog, so new compute can query it later.",
   answer=False)
ex("scenario", 10, 2, ["debug", "exam"], "Yesterday you ran `df.write.saveAsTable(\"prod.sales.orders\")`, then terminated the cluster. Today a teammate says: *\"The cluster is gone, so the table is gone, right?\"*",
   "Separate the lifetimes: compute is gone, but persistent data and catalog metadata are not. If the table really can't be found, look at the write (did it persist and commit?) and the name (full three-level name). Don't blame the terminated cluster.",
   steps=[
     {"prompt": "What's your first response?",
      "options": [{"text": "No. Compute and persistent data have independent lifetimes, so the table should still exist", "ok": True, "fb": "Correct. Terminating compute removes RAM and temporary files, not the table in cloud storage."},
                  {"text": "Yes, we must rerun the whole pipeline", "ok": False, "fb": "That confuses compute with storage. The data was persisted."},
                  {"text": "It depends on whether the cluster had autoscaling", "ok": False, "fb": "Autoscaling changes compute size. It has nothing to do with table persistence."}]},
     {"prompt": "You start new compute, and the query still can't find the table. What do you check first?",
      "options": [{"text": "That I'm using the exact full name `prod.sales.orders` (catalog.schema.table)", "ok": True, "fb": "Good. A wrong catalog or schema is a cheap, common cause."},
                  {"text": "Make the cluster bigger", "ok": False, "fb": "Size doesn't affect whether a name resolves."},
                  {"text": "Look for the old executors' shuffle files", "ok": False, "fb": "Those were temporary and are gone. They never held the table anyway."}]},
     {"prompt": "The name is correct, and still nothing. What next?",
      "options": [{"text": "Check whether the original write actually ran and committed (vs. only building a DataFrame in memory)", "ok": True, "fb": "Right. If nothing was persisted or committed, there's nothing to find."},
                  {"text": "Conclude that Delta tables only live as long as the cluster", "ok": False, "fb": "False premise: Delta tables persist in cloud storage."},
                  {"text": "Read the driver's RAM dump", "ok": False, "fb": "The driver's memory is gone and never held the persisted table."}]}])
ex("order", 10, 2, ["debug"], "Order the checks for *\"my table seems gone after the cluster was terminated\"*.",
   "First fix the mental model (compute ≠ storage). Then check the cheap things: the exact name. Then the write itself: was it persisted and committed? Each step rules out a whole layer.",
   items=["Remind myself: terminating compute doesn't delete persisted tables",
          "Query the exact three-level name from new compute",
          "Verify the write used saveAsTable / format(\"delta\").save, not just an in-memory DataFrame",
          "Verify the write committed a table version",
          "Only then investigate storage / catalog configuration"])

# =====================================================================
# S11 Control plane vs compute plane
# =====================================================================
sec(11, "Control Plane vs Compute Plane (Preview)",
    "One side decides what should run. The other side runs it.",
[
 CMP(("Control plane", ["Databricks-managed backend / platform services", "Includes the web application", "Platform coordination", "Think: *\"What should run?\"*"]),
     ("Compute plane", ["Where your workload actually processes data", "Serverless: Databricks-managed serverless compute plane", "Classic: cloud infrastructure in the **customer's** cloud environment", "Think: *\"Actually run it.\"*"])),
 DIA("CONTROL PLANE  (Databricks-managed services, web app)\n"
     "      │  \"What should run?\"\n"
     "      ▼\n"
     "COMPUTE PLANE  (where data is processed)\n"
     "   ├─ serverless → Databricks-managed serverless plane\n"
     "   └─ classic    → customer's cloud environment\n"
     "      \"Actually run it.\"",
     "First preview. Later chapters make it precise"),
 CO("exam", "Where does compute live?",
    "**Serverless** workloads run on compute that Databricks operates in a **Databricks-managed serverless compute plane**. **Classic** compute uses cloud infrastructure associated with the **customer's** cloud environment."),
 CO("analogy", "Restaurant analogy",
    "The control plane is the **front office**: it takes orders and coordinates. The compute plane is the **kitchen** where the cooking happens. With serverless, the restaurant also runs the kitchen. With classic compute, the kitchen sits in your building."),
 REV("Think first: where does the Databricks web UI belong?",
     "In the **control plane**, which holds the Databricks-managed backend services, including the web application and platform coordination."),
])

ex("bucket", 11, 1, ["concept", "exam"], "Control plane or compute plane?",
   "The **control plane** holds Databricks-managed services: the web app and coordination (\"what should run?\"). The **compute plane** is where data is actually processed (\"actually run it\"), whether serverless or classic.",
   quick=True, buckets=["Control plane", "Compute plane"],
   items=[{"text": "Databricks web application", "bucket": 0}, {"text": "Platform coordination services", "bucket": 0},
          {"text": "\"What should run?\"", "bucket": 0}, {"text": "Executors processing your orders data", "bucket": 1},
          {"text": "\"Actually run it.\"", "bucket": 1}, {"text": "Serverless compute resources", "bucket": 1}])
ex("tf", 11, 2, ["exam"], "For serverless workloads, compute runs in a Databricks-managed serverless compute plane. Classic compute uses cloud infrastructure associated with the customer's cloud environment.",
   "True. This is the source's first-preview distinction. Serverless means Databricks operates the compute. Classic means the compute runs in infrastructure tied to your own cloud environment.",
   quick=True, answer=True)
ex("mcq", 11, 1, ["concept"], "Where does your workload *actually process data*?",
   "The **compute plane** is where data processing happens. The control plane coordinates and serves the web app. Unity Catalog and the Delta log are not planes: they are governance and table-state layers.",
   options=["Control plane", "Compute plane", "Unity Catalog", "The Delta transaction log"], answer=1,
   why=["The control plane decides and coordinates, but does not process your data.", "Correct.", "UC governs objects.", "The log records table state."])
ex("mcq", 11, 2, ["exam", "pitfall"], "A team uses **classic** compute. Whose cloud environment hosts the compute infrastructure?",
   "Classic compute uses cloud infrastructure associated with the **customer's** cloud environment. It's the serverless case where Databricks operates the compute plane, so mixing the two up is a typical trap.",
   options=["The customer's cloud environment", "The Databricks-managed serverless compute plane", "The control plane", "Unity Catalog's metastore"], answer=0,
   why=["Correct.", "That's serverless.", "The control plane hosts platform services, not your classic clusters.", "The metastore is metadata, not compute."])
ex("odd", 11, 2, ["concept"], "Which one doesn't belong with the **control plane**?",
   "The web application, coordination and \"what should run?\" all describe the control plane. Processing data on executors happens in the **compute plane**.",
   options=["Web application", "Platform coordination", "\"What should run?\"", "Executors processing data"], answer=3)

# =====================================================================
# S12 Debugging mindset + Round-1 review
# =====================================================================
sec(12, "Debugging Mindset & Round-1 Review",
    "\"Spark is slow\" isn't a diagnosis. Find the layer first.",
[
 CODE("python", "df = spark.read.table(\"sales.orders\")\ndf.groupBy(\"country\").sum(\"amount\").show()", "It's extremely slow. Which layer is responsible?"),
 P("A beginner answers \"Spark\". That's **insufficient**: many layers could be the cause."),
 TAB(["Layer", "Hypothesis to test"], [
     ["storage", "slow reads?"], ["table layout", "too many tiny files?"], ["Delta", "bad physical organization?"],
     ["Spark", "enormous shuffle?"], ["data", "severe skew?"], ["compute", "insufficient resources?"],
     ["query", "inefficient transformation?"], ["statistics", "optimizer made a bad choice?"], ["network", "huge exchange?"]]),
 FLOW(["symptom", "identify layer", "collect evidence", "form hypothesis", "check Spark/Databricks metrics", "fix", "remeasure"], "Professional debugging loop"),
 CO("pitfall", "\"Query slow → increase cluster size\"",
    "Throwing more compute at every slow query is the anti-pattern. It skips identifying the layer and collecting evidence. This is the difference between someone who **uses** Databricks and someone who can **operate** it professionally."),
 ASK("Ask yourself when a query is extremely slow", [
     "Which layer could this be: storage, table layout, Delta, Spark, data, compute, query, statistics or network?",
     "What evidence do I have, or have I only guessed?",
     "Am I reading too many tiny files, or a badly organized table?",
     "Is there an enormous shuffle or a huge exchange over the network?",
     "Is one key severely skewed?",
     "Did the optimizer choose badly because of missing or stale statistics?",
     "After my fix, did I remeasure?"]),
 P("**What you should be able to say after Round 1, without notes:**"),
 TAB(["Not the same", "Why"], [
     ["Spark ≠ Databricks", "Spark is the engine. Databricks is the whole platform"],
     ["Spark ≠ Delta", "computation vs transactional table layer"],
     ["Delta ≠ Parquet", "Delta = Parquet + transaction log"],
     ["table ≠ file", "a table is logical, files are physical"],
     ["table ≠ storage directory", "the snapshot decides membership"],
     ["storage ≠ compute", "independent lifetimes"],
     ["file exists ≠ in current table", "physical vs logical membership"],
     ["metadata ≠ data", "description vs rows"],
     ["Unity Catalog ≠ Delta Lake", "governance vs table format"]]),
 CO("tip", "Self-check",
    "If any line above still feels fuzzy, go back to its section before moving on to Round 2."),
])

ex("scenario", 12, 2, ["debug"], "`spark.read.table(\"sales.orders\").groupBy(\"country\").sum(\"amount\").show()` is extremely slow. Walk through it like a professional.",
   "Professionals go symptom → layer → evidence → hypothesis → metrics → fix → remeasure. Scaling the cluster blindly may hide the problem, cost more, or change nothing if the cause is in storage, layout, skew or statistics.",
   quick=True, steps=[
     {"prompt": "What's your first move?",
      "options": [{"text": "Identify which layer could be responsible (storage, layout, Delta, Spark, data, compute, query, stats, network)", "ok": True, "fb": "Yes. Finding the layer comes before any fix."},
                  {"text": "Increase the cluster size", "ok": False, "fb": "That's the anti-pattern: a fix without a diagnosis."},
                  {"text": "Blame Spark and rewrite in pandas", "ok": False, "fb": "\"Spark\" is not a diagnosis, and this throws away distributed compute."}]},
     {"prompt": "You suspect the table layout. What do you do next?",
      "options": [{"text": "Collect evidence, e.g. check whether the scan reads a huge number of tiny files", "ok": True, "fb": "Right. Get evidence for or against the hypothesis."},
                  {"text": "Immediately rewrite the whole table", "ok": False, "fb": "That's a fix before any evidence. You might rewrite for nothing."},
                  {"text": "Add more executors", "ok": False, "fb": "That doesn't test the hypothesis."}]},
     {"prompt": "You applied a fix. What's the last step?",
      "options": [{"text": "Remeasure and compare with the original symptom", "ok": True, "fb": "Correct. A fix isn't done until it has been measured."},
                  {"text": "Assume it worked and move on", "ok": False, "fb": "Unverified fixes are guesses."},
                  {"text": "Scale the cluster too, just in case", "ok": False, "fb": "Then you can't tell which change helped."}]}])
ex("order", 12, 1, ["debug"], "Put the professional debugging loop in order.",
   "Symptom → identify layer → collect evidence → form hypothesis → check Spark/Databricks metrics → fix → remeasure. Skipping to \"increase cluster size\" jumps straight from symptom to an untested fix.",
   quick=True, items=["symptom", "identify layer", "collect evidence", "form hypothesis", "check Spark/Databricks metrics", "fix", "remeasure"])
ex("match", 12, 2, ["debug"], "Match each layer to the hypothesis you'd test for a slow query.",
   "Each layer has its own typical failure. Storage gives slow reads, table layout gives many tiny files, data gives skew, statistics give bad optimizer choices, and network gives huge exchanges. Naming the layer tells you what evidence to collect.",
   pairs=[["storage", "slow reads?"], ["table layout", "too many tiny files?"], ["data", "severe skew?"],
          ["statistics", "optimizer made a bad choice?"], ["network", "huge exchange?"], ["compute", "insufficient resources?"]])
ex("mcq", 12, 1, ["debug", "pitfall"], "A query is slow. Which response best shows **professional** Databricks operation?",
   "The professional identifies the layer and gathers evidence before fixing. \"Increase cluster size\" may hide the real cause (tiny files, skew, bad statistics) while costing more.",
   options=["Increase the cluster size right away", "Identify the layer, collect evidence, form a hypothesis, check metrics, fix, remeasure",
            "Restart the cluster until it's fast", "Convert the table to CSV"], answer=1,
   why=["The classic anti-pattern.", "Correct.", "Restarting doesn't diagnose anything.", "That makes everything worse: no columnar pruning."])
ex("bucket", 12, 2, ["exam", "pitfall"], "Round-1 review: sort the statements.",
   "Each true line keeps two layers apart. Each false line merges layers that are only related. The exam often hides exactly these confusions inside longer answer options.",
   buckets=["Correct", "Wrong"],
   items=[{"text": "Delta = Parquet data files + transaction log", "bucket": 0},
          {"text": "Unity Catalog governs objects; Delta is the table format", "bucket": 0},
          {"text": "Storage and compute have independent lifetimes", "bucket": 0},
          {"text": "Spark = Databricks", "bucket": 1},
          {"text": "If a file exists in the table folder, it's in the current table", "bucket": 1},
          {"text": "Metadata and data are the same thing", "bucket": 1},
          {"text": "A table is just its storage directory", "bucket": 1}])
ex("spotbug", 12, 2, ["exam"], "Click the wrong statements in this Round-1 cheat sheet.",
   "\"Delta = Parquet\" is wrong: Delta adds a transaction log to Parquet. \"file exists ⇒ in current table\" is wrong: physical existence ≠ current membership. \"Unity Catalog = Delta Lake\" is wrong: UC is governance and metadata, Delta is the table format.",
   lines=["Spark ≠ Databricks", "Delta = Parquet", "storage ≠ compute", "file exists ⇒ in current table", "metadata ≠ data", "Unity Catalog = Delta Lake"],
   bugs=[1, 3, 5], fix="Delta ≠ Parquet (Parquet + transaction log)\nphysical file existence ≠ current table membership\nUnity Catalog ≠ Delta Lake")
ex("odd", 12, 2, ["debug"], "Three of these are *layers* to suspect for a slow query. Which one is **not** a layer but an anti-pattern fix?",
   "Storage, table layout and statistics are layers you investigate. \"Increase cluster size\" is a fix applied without evidence: the anti-pattern this section warns about.",
   options=["storage", "table layout", "statistics", "increase cluster size"], answer=3)
ex("free", 12, 3, ["debug", "interview"], "Interview: *\"Our `groupBy(\"country\").sum(\"amount\")` on `sales.orders` is slow. What do you do?\"* Answer in 3–5 sentences.",
   "A strong answer names several layers, says how you would get **evidence** for each, and closes with remeasurement. It also explicitly rejects \"just scale the cluster\".",
   model="I wouldn't start by scaling the cluster. I'd first identify the layer: storage (slow reads), table layout (many tiny files), Delta organization, Spark (huge shuffle), data (skewed country), compute (insufficient resources), query, statistics (bad optimizer choice) or network (huge exchange). Then I'd collect evidence — Spark UI/metrics, the plan — form a hypothesis, apply a targeted fix, and remeasure against the original symptom.",
   rubric=["Rejects blind cluster scaling", "Names multiple candidate layers", "Collects evidence (metrics / plan / UI)", "Hypothesis → fix", "Remeasure"])

# =====================================================================
# assign exercise ids
# =====================================================================
for i, e in enumerate(exercises, 1):
    e["id"] = f"{CID}-e{i:03d}"

# =====================================================================
# Debug playbooks
# =====================================================================
debug = [
 {"id": "ch01-d01", "title": "Table \"disappeared\" after the cluster was terminated", "section": S(10),
  "symptom": "You (or a teammate) believe `prod.sales.orders` is gone because the cluster that wrote it was terminated, or a query from new compute can't find it.",
  "askYourself": [
     "Am I confusing the compute resource (driver, executors, RAM) with the table (Parquet files + log in cloud storage)?",
     "Was the data ever persisted with saveAsTable / format(\"delta\").save, or did it only live in a DataFrame in memory?",
     "Did the write actually commit a table version?",
     "Am I querying the exact three-level name (catalog.schema.table) I wrote to?",
     "Is my new compute pointing at the same catalog and storage?"],
  "steps": [
     {"do": "Restate the model: compute and persistent storage have independent lifetimes.", "why": "Terminating compute removes RAM and temporary shuffle files, not the table."},
     {"do": "Query the full name from new compute.", "why": "Rules out a wrong catalog or schema.", "code": "SELECT * FROM prod.sales.orders LIMIT 10;"},
     {"do": "Check the original write code.", "why": "A DataFrame that was never written lived only in executor memory.", "code": "df.write.saveAsTable(\"prod.sales.orders\")"},
     {"do": "Confirm the write committed (a new version exists in the table's log).", "why": "Physically written but uncommitted files are not a published table."}],
  "rootCauses": ["Mental model error: equating cluster lifetime with table lifetime",
                 "Data was never persisted (only an in-memory DataFrame)",
                 "Write never committed",
                 "Wrong catalog/schema in the name"],
  "fix": "Query the table from any compute using its full three-level name. If it was never persisted or committed, write it with saveAsTable (or format(\"delta\").save) and confirm the commit.",
  "mnemonic": "Cluster dies, table stays."},
 {"id": "ch01-d02", "title": "Reader sees a partial / mixed state (e.g. A B E)", "section": S(5),
  "symptom": "A query that ran during an update returns a mix of old and new rows (or duplicates), a state the table was never in.",
  "askYourself": [
     "Is this a plain directory of Parquet files with no transaction log (no `_delta_log/`)?",
     "Am I reading the files directly by path, as plain Parquet, instead of through the table's committed snapshot?",
     "Was a writer replacing files while I was reading?",
     "Which guarantee failed: atomicity (half-finished change visible) or isolation (invalid interleaving)?",
     "Does my reader stay on one snapshot version (e.g. 87) while the writer builds 88?"],
  "steps": [
     {"do": "Check the table folder for a `_delta_log/` directory.", "why": "Without a transaction log, there are no atomic commits or snapshots."},
     {"do": "Check how the reader reads: table name / Delta format vs plain `spark.read.parquet(path)`.", "why": "A plain Parquet read lists every physical file and ignores the log."},
     {"do": "Line up the timing of the read and the concurrent write.", "why": "Confirms an overlap that let the reader see an in-between state."}],
  "rootCauses": ["Plain Parquet directory with no transactional layer",
                 "Reader bypasses the Delta log (reads files by path as Parquet)",
                 "Writer's partial progress is visible because nothing makes the commit atomic"],
  "fix": "Store the data as a Delta table and read it through Delta (table name or format(\"delta\")), so every reader sees exactly one committed snapshot.",
  "mnemonic": "ABE is a lie: only ABC or ADE."},
 {"id": "ch01-d03", "title": "Files exist in storage, but their rows aren't in the table", "section": S(6),
  "symptom": "Listing the table folder shows `X.parquet`, but SELECT on the table never returns X's rows.",
  "askYourself": [
     "Does the current snapshot reference X, or did a later version REMOVE it?",
     "Did the transaction that wrote X ever commit?",
     "Was X dropped into the folder by a plain Parquet write that never touched the log?",
     "Am I treating physical existence as logical membership?"],
  "steps": [
     {"do": "Confirm the symptom by querying the table, not the folder.", "why": "The folder listing is physical. The table is logical."},
     {"do": "Replay the log versions (ADD/REMOVE) up to the current one.", "why": "Membership is defined by the snapshot.", "code": "v0: ADD A ADD B\nv1: REMOVE A ADD C\n…"},
     {"do": "If X was never ADDed: check whether its writer failed before committing, or wrote plain Parquet.", "why": "Uncommitted or out-of-band files are not published versions."}],
  "rootCauses": ["X was removed by a later commit (e.g. UPDATE/DELETE rewrite) but not yet physically cleaned up",
                 "X's transaction never committed",
                 "X was written by a path that bypassed the Delta log"],
  "fix": "Accept that removed files are expected leftovers. For missing data, rerun the write through Delta so it commits an ADD. Never point a plain Parquet reader at the folder or touch `_delta_log` by hand.",
  "mnemonic": "Exists ≠ belongs."},
 {"id": "ch01-d04", "title": "Query is extremely slow", "section": S(12),
  "symptom": "`spark.read.table(\"sales.orders\").groupBy(\"country\").sum(\"amount\").show()` takes far too long.",
  "askYourself": [
     "Which layer could it be: storage, table layout, Delta, Spark, data, compute, query, statistics or network?",
     "What evidence do I actually have, or have I only guessed?",
     "Am I reading too many tiny files or a badly organized table?",
     "Is there an enormous shuffle or a huge exchange over the network?",
     "Is a key (e.g. one country) severely skewed?",
     "Are the resources insufficient, or is the transformation itself inefficient?",
     "Did the optimizer choose badly because statistics are missing or stale?",
     "After the fix, did I remeasure?"],
  "steps": [
     {"do": "Name the symptom precisely (which stage, how slow compared with normal).", "why": "A vague symptom leads to a vague fix."},
     {"do": "Pick the candidate layer(s).", "why": "\"Spark\" alone is not a diagnosis."},
     {"do": "Collect evidence and form a hypothesis.", "why": "e.g. a scan with a huge file count → tiny files; one long task → skew."},
     {"do": "Check Spark/Databricks metrics (Spark UI, plan).", "why": "Confirms or refutes the hypothesis.", "code": "df.explain(mode=\"extended\")"},
     {"do": "Apply a targeted fix and remeasure.", "why": "Only measurement proves the fix worked."}],
  "rootCauses": ["slow storage reads", "too many tiny files", "bad Delta physical organization", "enormous shuffle",
                 "severe data skew", "insufficient compute", "inefficient transformation", "bad optimizer choice from statistics", "huge network exchange"],
  "fix": "Follow symptom → identify layer → collect evidence → form hypothesis → check metrics → fix → remeasure. Never default to \"increase cluster size\".",
  "mnemonic": "Layers: \"Some Tables Deliver Slow Data; Check Query Stats Now\" (storage, table layout, Delta, Spark, data, compute, query, statistics, network)."},
]

pitfalls = [
 {"title": "Parquet files ≠ Delta table", "text": "A folder of `part-*.parquet` files is not automatically a Delta table.", "fix": "Delta = Parquet + `_delta_log`. No log means no Delta."},
 {"title": "UPDATE/DELETE as cell edits", "text": "Picturing UPDATE/DELETE as editing a cell in Excel.", "fix": "Columnar files get rewritten: write a replacement file, then commit REMOVE old + ADD new."},
 {"title": "Physical existence = membership", "text": "Assuming a file in the table folder is part of the current table.", "fix": "The current snapshot (from the log) decides membership. Removed or uncommitted files can still sit in storage."},
 {"title": "Seeing uncommitted files", "text": "Expecting readers to see files that were written but not yet committed.", "fix": "Only a committed version is published. Writing files is not committing."},
 {"title": "ACID consistency vs CAP consistency", "text": "Treating the C in ACID as the C in CAP.", "fix": "ACID C = valid state → valid state respecting invariants. CAP C is a distributed-systems property."},
 {"title": "Cluster terminated = table deleted", "text": "Believing that terminating compute deletes `prod.sales.orders`.", "fix": "Compute and persistent storage have independent lifetimes."},
 {"title": "Relying on compute-local data", "text": "Expecting executor RAM or shuffle/temp files to survive the cluster.", "fix": "They are disposable. Persist important data to cloud storage as a table."},
 {"title": "catalog.schema.object read as server.database.table", "text": "Reading `ecommerce.silver.orders` as server/database/table.", "fix": "UC: catalog `ecommerce`, schema `silver`, object `orders`."},
 {"title": "Unity Catalog = Delta Lake", "text": "Mixing up the governance layer with the table format.", "fix": "UC = metadata + governance. Delta = transactional table layer over files."},
 {"title": "\"Delta Lake is a database\"", "text": "Calling Delta a database server.", "fix": "Delta is a transactional storage/table layer over files, not a standalone database server."},
 {"title": "Databricks = Spark with notebooks", "text": "Reducing Databricks to its compute engine.", "fix": "It connects storage, Delta tables, Spark/Photon, governance, orchestration, SQL/BI, ML/AI and DevOps."},
 {"title": "ReadSchema is cosmetic", "text": "Ignoring `ReadSchema: struct<age:int>` in a plan.", "fix": "It shows the columns Spark actually requests, which is evidence of column pruning."},
 {"title": "Column pruning = file skipping", "text": "Thinking column pruning also skips files or dates.", "fix": "Column pruning cuts columns. Data skipping / partition / clustering pruning cuts files or regions."},
 {"title": "Query slow → bigger cluster", "text": "Scaling compute without diagnosing.", "fix": "Symptom → identify layer → evidence → hypothesis → metrics → fix → remeasure."},
 {"title": "Serverless vs classic location", "text": "Assuming classic compute runs in the Databricks-managed plane.", "fix": "Serverless runs in a Databricks-managed serverless compute plane. Classic runs in the customer's cloud environment."},
]

flashcards = [
 ("What's the chapter mantra?", "Spark computes. Storage persists. Delta gives stored files table semantics. Unity Catalog governs the objects.", 1),
 ("Which question does storage answer?", "Where are the bytes after my program stops running?", 2),
 ("Which question does compute answer?", "Which CPUs and RAM execute my code?", 2),
 ("Name three cloud object stores and their URI schemes.", "Amazon S3 `s3://`, ADLS `abfss://`, GCS `gs://`.", 2),
 ("Terminate the cluster: what happens to executor RAM, shuffle files and S3 files?", "RAM gone. Shuffle/temp files normally gone. S3 files remain.", 2),
 ("Why must storage and compute have independent lifetimes?", "So data survives while compute scales up, down or to zero with the workload.", 2),
 ("Do part-*.parquet files make a table?", "Not by themselves. You need metadata/transaction state to know which files make up the table.", 3),
 ("What does UPDATE do physically on columnar files (foundation model)?", "Writes a new file version with the changed rows, then the metadata marks old out and new in.", 3),
 ("What is column pruning?", "Reading only the columns a query needs, enabled by columnar formats.", 4),
 ("What does `ReadSchema: struct<age:int>` tell you?", "Spark requested only the `age` column from storage.", 4),
 ("Name Parquet's internal structures.", "Row groups, column chunks, pages, encodings, compression, metadata.", 4),
 ("Column pruning vs data skipping?", "Pruning = fewer columns. Skipping/partition/clustering pruning = fewer files or regions.", 4),
 ("Reader reads A B C while the writer changes the folder to A D E. Which results are valid?", "A B C or A D E. Never A B E.", 5),
 ("Atomicity in one line?", "Completely or not at all: the commit is visible as one logical change.", 5),
 ("ACID consistency vs CAP consistency?", "ACID: valid state → valid state respecting invariants. CAP: a different distributed-systems concept.", 5),
 ("Isolation example?", "Reader sees coherent v87 while the writer creates v88, never half-and-half.", 5),
 ("Durability in one line?", "Committed state survives later process or compute failure.", 5),
 ("What is Delta Lake?", "Parquet data files + a file-based transaction log → ACID, scalable metadata, Spark API compatibility.", 6),
 ("What does `_delta_log` record?", "Which files make up each valid table version (ADD/REMOVE per commit).", 6),
 ("Physical file existence vs logical membership?", "Not the same. The current snapshot decides membership.", 6),
 ("Log: v0 ADD A,B; v1 REMOVE A, ADD C; v2 ADD D; v3 REMOVE B. Snapshot?", "C + D.", 6),
 ("Should uncommitted written files be visible?", "No. Writing files ≠ publishing a committed version.", 6),
 ("DELETE of one row, file model?", "Write a replacement file without the row, then commit REMOVE old + ADD new.", 7),
 ("What does a lakehouse combine?", "Data-lake characteristics + database/warehouse semantics.", 8),
 ("Why is \"Delta Lake is a database\" imprecise?", "It's a transactional storage/table layer over files, not a standalone database server.", 8),
 ("What does UC's namespace look like?", "catalog.schema.object (three levels).", 9),
 ("`company.finance.transactions` = ?", "company = catalog, finance = schema, transactions = table/object.", 9),
 ("Metadata vs data?", "Metadata describes the data (names, columns, format, location, owner, permissions). Data is the rows.", 9),
 ("Which component executes `df.groupBy(...).sum(...)`?", "Spark.", 10),
 ("Which component provides transactional state?", "The Delta transaction log.", 10),
 ("Does terminating compute delete `prod.sales.orders`?", "No. Compute and persistent data have different lifetimes.", 10),
 ("Control plane vs compute plane?", "Control plane: Databricks services and web app (\"what should run?\"). Compute plane: where data is processed (\"actually run it\").", 11),
 ("Where does serverless vs classic compute run?", "Serverless: Databricks-managed serverless compute plane. Classic: the customer's cloud environment.", 11),
 ("The professional debugging loop?", "Symptom → identify layer → collect evidence → hypothesis → check metrics → fix → remeasure.", 12),
 ("Nine candidate layers for a slow query?", "Storage, table layout, Delta, Spark, data, compute, query, statistics, network.", 12),
]

chapter = {
 "id": CID, "num": 1,
 "title": "Foundations: Storage, Tables & Transactions",
 "subtitle": "Why a folder of Parquet files isn't a table, and what Delta, Spark and Unity Catalog each add",
 "emoji": "🧱",
 "sourcePages": "1–26",
 "mantra": "Spark computes. Storage persists. Delta gives stored files table semantics. Unity Catalog governs the objects.",
 "objectives": [
   "You can explain why compute and storage have independent lifetimes, and what survives cluster termination.",
   "You can explain why a file is not a table and why Parquet alone is not enough for concurrent updates.",
   "You can explain column pruning and tell it apart from data skipping / partition pruning.",
   "You can define each ACID property with an example and avoid the ACID-vs-CAP consistency trap.",
   "You can replay a Delta log (ADD/REMOVE) to find the current snapshot, and explain physical existence ≠ logical membership.",
   "You can read a Unity Catalog name (catalog.schema.object) and keep metadata, Delta, Spark and storage apart.",
   "You can describe the control plane vs the compute plane (serverless vs classic).",
   "You can debug a slow query layer by layer instead of just scaling the cluster."],
 "sections": sections,
 "debug": debug,
 "pitfalls": pitfalls,
 "flashcards": [{"q": q, "a": a, "section": S(n)} for q, a, n in flashcards],
 "exercises": exercises,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(chapter, f, ensure_ascii=False, indent=1)
print("wrote", OUT, len(exercises), "exercises")
