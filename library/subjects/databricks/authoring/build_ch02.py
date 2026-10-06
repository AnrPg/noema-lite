import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chlib import Chapter

C = Chapter("ch02", 2,
    title="Data Engineering Building Blocks",
    subtitle="ETL/ELT, batch vs streaming vs incremental, checkpoints, CDC, schema contracts and the medallion architecture",
    emoji="🧱",
    sourcePages="26–52",
    mantra="Keep the raw truth, process only what changed, respect the schema contract, and refine data step by step from Bronze to Gold.",
    objectives=[
        "You can explain where the transformation happens in ETL vs ELT, and why keeping raw data lets you rebuild everything downstream.",
        "You can classify any workload on two independent axes: batch vs streaming, and full recompute vs incremental.",
        "You can explain micro-batches and why streaming still runs on Spark jobs, stages and tasks.",
        "You can explain what a checkpoint remembers and what happens when a stream restarts with or without it.",
        "You can read a CDC stream (I/U/D + sequence + key), apply it correctly, and choose SCD Type 1 vs Type 2.",
        "You can tell schema enforcement from schema evolution and debug a schema mismatch without 'enabling evolution everywhere'.",
        "You can place any dataset in Bronze, Silver or Gold and defend the choice.",
    ])

# =====================================================================
# s01 Pipeline model
# =====================================================================
s01 = C.sec(1, "From Storage Model to Pipeline Model",
            "Every Databricks product solves one pipeline problem. Learn the problems first and the product names become easy labels.")
C.p("Round 1 built the **storage model**: who computes, how files are stored, and who governs them.")
C.table(["Component", "Role in one phrase"], [
    ["Spark", "compute (the execution engine)"],
    ["Parquet", "file format"],
    ["Delta Lake", "transactional table layer"],
    ["Unity Catalog", "metadata + governance"],
    ["Cloud storage", "durable (permanent) storage"],
], caption="Recap of Round 1")
C.p("Round 2 builds the **pipeline model**. Before you touch Databricks buttons and APIs, you need to know which problem each tool is trying to solve.")
C.diagram("""
data source
    │
    ▼
ETL / ELT
    │
    ▼
batch ── streaming ── incremental processing
    │
    ▼
CDC (change data capture)
    │
    ▼
schema enforcement / schema evolution
    │
    ▼
Bronze → Silver → Gold
    │
    ▼
identities / permissions          (→ Chapter 3)
    │
    ▼
dev → test → prod → CI/CD         (→ Chapter 3)
""", caption="The concept chain of this round")
C.callout("key", "Problem first, product second",
          "Auto Loader, Lakeflow pipelines, AUTO CDC, Jobs and Bundles are all answers to the problems in this chain. If the problems are clear, you can learn Databricks from zero to production, debugging and certification without memorizing product names blindly.")
C.reveal("Think first: why not start directly with the Databricks UI?",
         "Because the UI shows you *solutions*. Without knowing the problem (e.g. 'how do I process only new data?'), every button looks like an unrelated product.")
C.callout("analogy", "Storage model vs pipeline model",
          "The storage model is the warehouse building (shelves, locks, inventory list). The pipeline model is the logistics: how goods arrive, get checked, sorted and shipped to customers.")

C.match("Match each Round-1 component to its role.", [
    ("Spark", "compute"), ("Parquet", "file format"), ("Delta Lake", "transactional table layer"),
    ("Unity Catalog", "metadata + governance"), ("Cloud storage", "durable storage")],
    "These five roles are the storage model. Keep them separate: Spark computes but stores nothing permanently; Parquet is just a file layout; Delta adds transactions on top of Parquet; Unity Catalog governs names and permissions; cloud storage holds the bytes.",
    tags=["concept"], diff=1, quick=True)
C.order("Put the Round-2 concept chain in the order the tutor builds it.", [
    "Data source", "ETL / ELT", "Batch, streaming, incremental processing", "CDC",
    "Schema enforcement / evolution", "Bronze → Silver → Gold", "Identities / permissions", "Dev → test → prod and CI/CD"],
    "Data first has to be moved (ETL/ELT), then you decide how often and how much to process, how to capture changes, how to protect the structure, how to organise quality layers — and only then who may access it and how code is shipped safely.",
    tags=["concept"], diff=1, quick=True)
C.odd("Which one is NOT part of the storage layer of a lakehouse?", ["Parquet", "Delta Lake", "Cloud storage", "Spark"], 3,
      "Spark is the compute engine; it reads and writes data but is not where data lives. Parquet (file format), Delta Lake (table layer over files) and cloud storage (the bytes) all belong to the storage side.",
      tags=["concept"], diff=1)
C.tf("Delta Lake and Parquet are two names for the same thing.", False,
     "Parquet is a columnar *file format*. Delta Lake is a *transactional table layer* built on Parquet files plus a transaction log. Delta ≠ Parquet is one of the Round-1 must-know distinctions.",
     tags=["concept", "exam"], diff=1)
C.mcq("Which component answers the question 'who may read `company.finance.payroll`?'",
      ["Spark", "Parquet", "Unity Catalog", "Cloud storage"], 2,
      "Unity Catalog is the metadata + governance layer: names (catalog.schema.object) and permissions live there. Spark only executes, Parquet only stores, and cloud storage only holds bytes.",
      why=["Spark executes queries; it does not decide permissions.", "Parquet is a file format with no permission model.",
           "Correct: governance is Unity Catalog's job.", "Storage holds files; table-level access is governed above it."],
      tags=["concept"], diff=1)

# =====================================================================
# s02 ETL vs ELT
# =====================================================================
s02 = C.sec(2, "ETL vs ELT",
            "The real question is WHERE the transformation happens — and whether you keep the raw data.")
C.p("Imagine a company with **PostgreSQL** (`customers`, `orders`), the **Shopify API** (`products`) and **CSV files** (marketing campaigns). You want all of it in your analytics system.")
C.terms([
    ("Extract", "Take data out of the source, e.g. `SELECT ...` from PostgreSQL → raw orders."),
    ("Transform", "Change the data: clean, cast, validate, join."),
    ("Load", "Write the data into the target system, e.g. the Delta table `company.silver.orders`."),
])
C.code("text", '" Athens "            → "ATHENS"            (trim + upper case)\n"19.95"               → DECIMAL(10,2)       (cast)\nNULL age              → validation / quarantine\ncustomer_id + orders  → JOIN', caption="Typical transformations")
C.compare(
    ("ETL (traditional)", ["Extract → **Transform** → Load", "source → extract → ETL server → transform → warehouse", "Transform first, load only the clean result", "Raw input is usually not kept"]),
    ("ELT (modern cloud / lakehouse)", ["Extract → **Load** → Transform", "PostgreSQL → raw data → lakehouse → Spark/SQL transformations → clean tables", "Load raw first, transform inside the platform", "Raw input is kept (this becomes Bronze)"]),
)
C.p("**Why ELT fits Databricks:** the lakehouse stores huge amounts of raw data cheaply and brings distributed compute only when needed. So you first keep *exactly what came from the source*, then transform.")
C.code("text", 'order_id,customer_id,amount\n101,7,"19.50"\n102,12,"52.90"', caption="Incoming CSV — note that amount is a quoted string")
C.flow(["CSV", "parse", "validate", "amount → DECIMAL", "load clean table"], caption="ETL-like")
C.flow(["CSV", "store raw in Bronze", "later parse / validate", "Silver Delta table"], caption="ELT-like")
C.callout("key", "The ELT superpower: you can change your mind",
          "Tomorrow you discover `\"19.50\"` was **USD, not EUR**. With ELT you still have the original raw dataset, so you just fix the rule and rebuild — you don't necessarily have to ask the source system again.")
C.callout("exam", "Don't get stuck on the label",
          "Databricks now uses **ETL** very broadly for data-engineering pipelines, even when the physical architecture is quite ELT-like. In exam questions focus on *where the transformation happens*, not on the acronym.")
C.reveal("Think first: a nightly API returns JSON. You must (1) never lose the original response, (2) change transformation rules later, (3) rebuild downstream tables. ETL or ELT?",
         "**ELT: Extract → Load raw → Transform.** You first keep an immutable/raw representation and build all downstream datasets from it.")

C.mcq("An API returns JSON every night. You must never lose the original response, be able to change transformation rules later, and rebuild downstream tables. Which flow fits best?",
      ["Extract → Transform → Load", "Extract → Load raw → Transform", "Transform → Extract → Load", "Load → Extract → Transform"], 1,
      "Keeping the untouched response first (load raw) and transforming afterwards satisfies all three needs: the original is preserved, rules can change, and downstream tables can be rebuilt from raw. With classic ETL only the transformed output survives.",
      why=["Only the transformed result is stored, so the original is lost.", "Correct: raw is kept immutable and is the rebuild source.",
           "You cannot transform data you haven't extracted yet.", "You cannot load data you haven't extracted."],
      tags=["concept", "exam"], diff=1, quick=True)
C.cloze("Fill in the letter order.", "ETL = Extract → [[Transform]] → [[Load]]\nELT = Extract → [[Load]] → [[Transform]]",
        "Both start with Extract. ETL transforms on the way (e.g. on an ETL server) and loads only the result; ELT loads raw data into the platform and transforms it there.",
        bank=["Validate", "Join"], tags=["concept"], diff=1, quick=True)
C.bucket("Sort each statement into ETL or ELT.", ["ETL", "ELT"], [
    ("Transformation happens on a separate ETL server before the warehouse", 0),
    ("Raw source data lands in the lakehouse first", 1),
    ("Only the cleaned result is stored", 0),
    ("Transformations run later with Spark / SQL inside the platform", 1),
    ("Lets you rebuild clean tables after fixing a rule", 1),
    ("Traditional warehouse pattern", 0),
], "ETL = transform before load (classic warehouses, ETL servers, only clean output). ELT = load raw first and transform with the platform's distributed compute, which naturally keeps raw data for rebuilds.",
   tags=["compare"], diff=1)
C.match("Match each raw value to the transformation it needs.", [
    ('" Athens "', "Trim spaces and upper-case → \"ATHENS\""),
    ('"19.95"', "Cast to DECIMAL(10,2)"),
    ("NULL age", "Validation / quarantine"),
    ("customer_id + orders", "JOIN"),
], "These are the four typical Transform examples: string cleaning, type casting, validation (bad rows are not silently accepted — they are rejected or quarantined) and combining datasets with joins.",
   tags=["concept"], diff=1)
C.tf("Because Databricks calls its pipelines 'ETL', the transformation in a Databricks pipeline always happens before the data is stored.", False,
     "Databricks uses 'ETL' loosely for any data-engineering pipeline. Many Databricks pipelines are physically ELT-like: raw data lands in Bronze first and is transformed later. Exams test understanding of where the transformation happens, not the label.",
     tags=["exam", "pitfall"], diff=2)
C.scenario("You loaded `amount` as EUR into your clean `orders` table for 6 months. Today finance says the source always sent **USD**.", [
    ("Your pipeline was ETL-only (no raw copy). What is your realistic situation?", [
        ("Re-request the historical data from the source system — and hope it still has it", True, "Right. Without a raw copy, the only way to recompute is to go back to the source, which may no longer keep 6 months of history."),
        ("Run `RESTORE` on the clean table", False, "Restoring an older version still gives you EUR-labelled values; the bug was in the transformation itself."),
        ("Nothing to do, DECIMAL values are correct", False, "The numbers were interpreted with the wrong currency; downstream totals are wrong."),
    ]),
    ("Now imagine the same pipeline as ELT with a Bronze copy of every raw file. What do you do?", [
        ("Fix the conversion rule and rebuild the clean table from Bronze", True, "Exactly the ELT benefit: raw is still there, so you just reprocess with the corrected rule."),
        ("Delete Bronze to save storage, then fix the rule", False, "Bronze is the rebuild source — deleting it destroys your recovery path."),
        ("Ask every customer to re-place their orders", False, "Not needed: the raw truth is already stored in Bronze."),
    ]),
], explain="Keeping raw data turns a 'call the source and pray' situation into a simple reprocess.", tags=["debug", "concept"], diff=2)
C.free("In 3–4 sentences: why is ELT such a natural fit for a lakehouse like Databricks?",
       "A lakehouse can store huge volumes of raw data cheaply in cloud storage and bring distributed compute (Spark) only when needed. So it is cheap to land everything exactly as it came from the source first and transform later inside the platform. Keeping the raw copy means you can change transformation rules and rebuild downstream tables without asking the source again. That raw landing zone is what we call Bronze.",
       ["cheap storage of large raw data", "distributed compute on demand", "keep exactly what came from source", "rebuild / change rules later without re-asking the source", "links to Bronze"],
       "The core argument is economic + recoverability: cheap storage + elastic compute make 'load raw, transform later' affordable, and the raw copy makes every downstream table reproducible.",
       tags=["interview", "concept"], diff=2)

# =====================================================================
# s03 Batch vs streaming
# =====================================================================
s03 = C.sec(3, "Batch vs Streaming (and Micro-batches)",
            "Is your input finite or endless? That single question separates batch from streaming.")
C.p("Today you have `orders.csv`: **1 GB, 1,000,000 rows**. You run:")
C.code("python", 'df = spark.read.csv("/data/orders.csv")\nresult = (\n    df.groupBy("country")\n      .count()\n)\nresult.write.saveAsTable("sales_per_country")', caption="A classic batch job")
C.p("The dataset has a clear end: row 1, row 2 … row 1,000,000, **END**. That is a **bounded dataset**.")
C.flow(["START", "read all input", "compute", "write output", "STOP"], caption="Batch processing")
C.p("Now think of **Kafka**: 12:00 order 101, 12:00 order 102, 12:01 order 103 … There is no natural END OF FILE. The dataset is logically **unbounded** (events, events, events … ∞).")
C.compare(
    ("Batch", ["Bounded input (has an END)", "Read everything → compute → write → stop", "Example: yesterday's orders.csv"]),
    ("Streaming", ["Unbounded input (no natural end)", "Computation keeps going as new data arrives", "Example: Kafka topic of orders"]),
)
C.p("In **Spark Structured Streaming** you often write transformations almost like batch DataFrames, but the engine keeps updating the result as data arrives. Databricks describes it as near-real-time processing with **incremental computation** and **fault tolerance**.")
C.callout("pitfall", "Streaming ≠ one row at a time",
          "A common mistake is to imagine `event1 → process, event2 → process …`. Spark Structured Streaming often groups incoming records into **micro-batches** and runs each one through normal distributed Spark execution.")
C.diagram("""
events arriving:  1  2  3  4  5
                  │
                  ▼
micro-batch 1:  [1 2]
micro-batch 2:  [3 4]
micro-batch 3:  [5]
""", caption="Micro-batching")
C.flow(["micro-batch", "Spark job", "stages", "tasks", "partitions", "possible shuffle"], caption="Each micro-batch is a normal Spark execution")
C.callout("key", "Streaming builds on Spark — it doesn't replace it",
          "Everything you learned about jobs, stages, tasks, partitions and shuffles still applies inside every micro-batch. How often a micro-batch starts is controlled by a streaming **trigger** — you'll configure it when we reach Structured Streaming / Auto Loader.")
C.reveal("Think first: does a Kafka topic of orders ever reach END OF FILE?",
         "No. New orders can always arrive, so the input is logically unbounded. That is why the computation must keep running (or keep being re-run) instead of 'read everything and stop'.")

C.tf("In Spark Structured Streaming, each incoming event is immediately processed by its own Spark task.", False,
     "Structured Streaming typically collects incoming records into micro-batches; each micro-batch becomes a Spark job with stages and tasks over partitions. 'One event → one task' is the classic misconception.",
     tags=["pitfall", "exam"], diff=1, quick=True)
C.calc("Five events arrive (1, 2, 3, 4, 5) and the engine groups them two at a time, exactly as in the lesson's example. How many micro-batches run?", 3,
       "[1 2], [3 4], [5] → 3 micro-batches. The last batch can be smaller; micro-batches are not required to be full. Each one is a separate distributed Spark execution.",
       unit="micro-batches", tags=["calc", "concept"], diff=1, quick=True)
C.free("Test Q2: Why does 'streaming' not necessarily mean 'one event → one Spark task immediately'?",
       "Because engines like Spark Structured Streaming collect incoming records into micro-batches and execute each micro-batch through the normal Spark execution model (job → stages → tasks over partitions, possibly with a shuffle). So many events are processed together, in parallel, rather than each event triggering its own task.",
       ["micro-batches", "many records grouped together", "normal Spark execution model (job/stages/tasks/partitions)"],
       "Official answer: engines like Spark Structured Streaming can gather incoming records into micro-batches and run them through the usual Spark execution model.",
       tags=["exam", "interview"], diff=2)
C.order("Order the execution chain of ONE micro-batch.", ["micro-batch", "Spark job", "stages", "tasks", "partitions processed (possible shuffle)"],
        "A micro-batch is submitted as a Spark job, the job is split into stages (at shuffle boundaries), each stage into tasks, and each task processes one partition. Streaming reuses the whole batch execution model.",
        tags=["concept"], diff=2)
C.bucket("Bounded (batch-style) or unbounded (streaming-style) input?", ["Bounded", "Unbounded"], [
    ("orders.csv, 1 GB, 1,000,000 rows", 0),
    ("Kafka topic receiving orders all day", 1),
    ("Last month's exported invoices", 0),
    ("Click events from the web shop, continuously", 1),
    ("A one-off historical backfill file", 0),
    ("Payment events from a message queue", 1),
], "Ask: does this input have a natural END? A file or export does; a topic or queue that keeps receiving events does not.",
   tags=["concept"], diff=1)
C.spotbug("A teammate wrote these notes on streaming. Click the WRONG lines.", [
    "1. Streaming input is logically unbounded: there is no natural END OF FILE.",
    "2. In Structured Streaming each event becomes its own Spark task immediately.",
    "3. Structured Streaming often groups records into micro-batches.",
    "4. Streaming replaces Spark's jobs/stages/tasks model with a different engine.",
    "5. You often write streaming transformations almost like batch DataFrames.",
], [1, 3],
    "2. Records are typically grouped into micro-batches, and each micro-batch runs as a Spark job.\n4. Streaming builds ON the Spark execution model: each micro-batch → job → stages → tasks → partitions.",
    "Lines 2 and 4 are the two classic myths. Micro-batches are processed by normal distributed Spark execution, so streaming builds on (doesn't replace) jobs, stages and tasks.",
    tags=["pitfall", "concept"], diff=2)
C.write("Write the PySpark batch job from the lesson: read `/data/orders.csv`, count orders per `country`, and save the result as table `sales_per_country`.",
        'df = spark.read.csv("/data/orders.csv")\nresult = df.groupBy("country").count()\nresult.write.saveAsTable("sales_per_country")',
        ["spark.read.csv", "groupBy", "count()", "saveAsTable"],
        "This is a bounded job: it reads all of the file, aggregates, writes, and stops. (In practice you'd add `header=True` so `country` is a real column name — the lesson keeps it minimal.)",
        lang="python", tags=["syntax"], diff=1)

# =====================================================================
# s04 Incremental processing
# =====================================================================
s04 = C.sec(4, "Incremental Processing",
            "Streaming answers 'how often'; incremental answers 'how much do I reprocess'. They are different axes.")
C.callout("key", "Streaming ≠ incremental", "Streaming and incremental processing are **not the same thing**. One describes the input/timing, the other describes how much work is redone.")
C.table(["Day", "Total data", "Naive pipeline processes", "Incremental pipeline processes"], [
    ["Day 1", "100 GB", "100 GB", "100 GB"],
    ["Day 2", "102 GB (+2)", "102 GB", "2 GB"],
    ["Day 3", "105 GB (+3)", "105 GB", "3 GB"],
], caption="Why recompute everything when only 3 GB is new?")
C.diagram("""
previous state
      +
new / changed input
      =
new state

NOT:  recompute everything from zero
""", caption="Incremental processing in one picture")
C.p("**Batch can be incremental.** Every night at 02:00 the pipeline runs once and reads only yesterday's rows:")
C.code("sql", "SELECT *\nFROM transactions\nWHERE transaction_date = CURRENT_DATE - 1;", caption="Batch (runs once a day) + incremental (only new rows)")
C.p("**Streaming is usually incremental.** The checkpoint says *processed up to event 100000*; events 100001, 100002, 100003 arrive and only those are processed — the previous 100,000 are not necessarily re-read.")
C.table(["", "Full recompute", "Incremental"], [
    ["Batch", "Nightly job re-reads the whole 105 GB", "Nightly job reads only yesterday's rows"],
    ["Streaming", "Unusual / wasteful", "Typical: continue after the checkpoint"],
], caption="Two independent axes")
C.callout("exam", "Batch + incremental is a valid answer",
          "If a job runs once a day (batch) but reads only rows created since the last run, it is **both batch and incremental**. Exams love this combination.")
C.reveal("Think first: 1 TB of historical orders; every night 10 MB of new orders arrive; a 03:00 job processes only those 10 MB. What is it?",
         "**Batch + incremental.** It runs on a schedule over a finite chunk (batch) and touches only new data (incremental). It is not streaming, and it is certainly not a full refresh.")

C.mcq("1 TB historical orders. Every night 10 MB of new orders arrive. A job at 03:00 processes only those 10 MB. What is it?",
      ["Streaming only", "Batch only", "Batch + incremental", "Streaming + full refresh"], 2,
      "It runs once per night on a finite chunk (batch) and processes only the new 10 MB (incremental). 'Batch only' misses the incremental part; nothing here runs continuously, so it isn't streaming.",
      why=["Nothing runs continuously; it's a scheduled run.", "True but incomplete: it also processes only new data.",
           "Correct: scheduled + only-new-data.", "It neither streams nor refreshes the full 1 TB."],
      tags=["exam", "concept"], diff=1, quick=True)
C.mcq("Test Q1: A job runs at 02:00 once a day and reads only the rows created since the previous run. Select ALL that apply.",
      ["batch", "streaming", "incremental"], [0, 2],
      "Once-a-day scheduled execution over a finite input = batch; reading only rows since the previous run = incremental. It is not streaming because it does not keep running as data arrives.",
      tags=["exam"], diff=1, quick=True)
C.tf("A pipeline that runs only once a day cannot be incremental.", False,
     "Frequency and amount are independent. A once-a-day batch job that filters `WHERE transaction_date = CURRENT_DATE - 1` is batch AND incremental.",
     tags=["pitfall", "exam"], diff=1)
C.calc("Using the lesson's numbers (Day 1: 100 GB, Day 2: +2 GB, Day 3: +3 GB): how many GB in total does the NAIVE pipeline process over the three days, minus what the INCREMENTAL pipeline processes? (Saved GB)", 202,
       "Naive: 100 + 102 + 105 = 307 GB. Incremental: 100 + 2 + 3 = 105 GB. Saved: 307 − 105 = 202 GB — and the gap keeps growing every day.",
       unit="GB", tags=["calc"], diff=2)
C.calc("Test Q3 numbers: a 5 TB table where only 20 MB changes per day. Roughly how many times more data does a daily full reload read than an incremental load? (Use 1 TB = 1,000,000 MB.)", 250000,
       "5 TB = 5,000,000 MB; 5,000,000 / 20 = 250,000×. You'd reprocess a huge historical dataset even though only a tiny subset changed.",
       unit="×", tolerance=1000, tags=["calc", "exam"], diff=2)
C.free("Test Q3: You have a 5 TB table and 20 MB changes per day. Why is it probably a bad idea to reload the whole table daily?",
       "Because you would reprocess (and pay compute and time for) a huge historical dataset even though only a tiny subset changed. Incremental processing handles only the new or changed data — previous state + changes = new state — so it is far cheaper and faster.",
       ["reprocesses huge historical data", "only a tiny subset changed", "incremental processes only changes", "cost / time"],
       "Official answer: you reprocess an enormous historical dataset although only a minimal subset changed; incremental processing can process just the changes.",
       tags=["exam", "interview"], diff=1)
C.free("Test Q30 (interview): Explain the difference between batch, streaming and incremental processing WITHOUT buzzwords.",
       "Batch: I process a finite set of data in one run and then stop. Streaming: the input keeps arriving and the computation keeps updating as it arrives. Incremental: instead of recomputing the whole history, I process only what is new or changed. So one workload can be batch and incremental at the same time.",
       ["batch = finite set, one run", "streaming = input keeps arriving, result keeps updating", "incremental = only new/changed data, not full history", "batch and incremental can coexist"],
       "The key insight interviewers look for is the last sentence: incremental is an independent axis, so a nightly job can be both batch and incremental.",
       tags=["interview", "exam"], diff=2)
C.cloze("Complete the nightly incremental batch query.", "SELECT *\nFROM transactions\nWHERE [[transaction_date]] = [[CURRENT_DATE]] - 1;",
        "Filtering on yesterday's date makes a once-a-day batch job read only new rows — incremental. Without the WHERE clause the same job would be a full recompute.",
        as_code=True, bank=["created_by", "NOW()", "MAX_DATE"], tags=["syntax"], diff=1)
C.bucket("Batch? Streaming? Classify the TIMING axis only.", ["Batch (runs and stops)", "Streaming (keeps running as data arrives)"], [
    ("Nightly 02:00 job reading yesterday's rows", 0),
    ("Query that continuously updates as Kafka events arrive", 1),
    ("Monthly full rebuild of a report table", 0),
    ("Pipeline that resumes after checkpoint offset 100000 and keeps consuming", 1),
    ("03:00 job that processes the 10 MB of new orders", 0),
], "Timing axis: does it run and stop (batch) or keep consuming as data arrives (streaming)? Whether it's incremental is a separate question — e.g. the 02:00 and 03:00 jobs are batch AND incremental.",
   tags=["compare"], diff=1)

# =====================================================================
# s05 Checkpoints
# =====================================================================
s05 = C.sec(5, "Checkpoints: Remembering Where You Stopped",
            "A stream that crashes must know whether to continue at 901 or start again at 1.")
C.p("A streaming pipeline has processed **events 1 → 900**. The server crashes. It comes back up. **Where does it continue?**")
C.p("Somewhere there must be state like *\"I've already processed until offset 900.\"* Storing that progress is one of the roles of the **checkpoint**.")
C.diagram("""
SOURCE
──────────────────────────────────────
1  2  3  ...  899  900 │ 901  902 ...
                        ▲
                   checkpoint = "900"

restart → process 901, 902, ...
""", caption="The checkpoint marks committed progress")
C.compare(
    ("Without checkpoint", ["Engine can't easily know whether to start at 1 or continue at 901", "Restart from 1 → reprocessing / duplicates", "Guessing could skip data"]),
    ("With checkpoint", ["Engine reads 'processed until 900'", "Resumes at 901", "No re-reading of the first 900 events needed"]),
)
C.terms([
    ("Offset", "A position in the source stream (e.g. event number 900 in a Kafka partition)."),
    ("Checkpoint", "Stored progress/state of a stream, e.g. the last offset it has fully processed, used to resume after a restart."),
])
C.callout("pitfall", "Reset checkpoint = amnesia",
          "If a checkpoint is deleted, reset, or the stream is pointed at a new checkpoint location, the engine 'forgets' its progress and may re-ingest old data. A **checkpoint reset** is one of the classic causes of duplicate records (see Chapter 3, debugging case 2).")
C.ask("Ask yourself after a streaming restart", [
    "Did the stream restart with the SAME checkpoint location as before?",
    "Has the checkpoint advanced past the last offset I expected?",
    "Did anyone delete or reset the checkpoint (or change its path)?",
    "Are the events after the restart starting right after the last committed offset — not at 1?",
])
C.callout("tip", "Deeper later", "We'll study checkpoint internals in depth with Structured Streaming and Auto Loader. For now: checkpoint = 'where I stopped'.")

C.mcq("A stream processed events 1–900 and stored `900` in its checkpoint, then crashed. After restart with the same checkpoint, what happens?",
      ["It starts again from event 1", "It continues from event 901", "It skips to the newest event only", "It fails because state is lost"], 1,
      "The checkpoint records committed progress, so the engine resumes right after it: 901, 902, … Starting at 1 would reprocess (duplicates); jumping to the newest would skip data.",
      why=["That's what happens WITHOUT (or with a reset) checkpoint.", "Correct.", "That would silently skip events 901..newest-1.", "State is exactly what the checkpoint preserved."],
      tags=["concept"], diff=1, quick=True)
C.tf("One role of a streaming checkpoint is to remember how far the stream has already processed the source (e.g. up to offset 900).", True,
     "Yes. Conceptually the checkpoint says 'processed until offset 900', which tells the engine to continue from 901 after a restart.",
     tags=["concept"], diff=1, quick=True)
C.cloze("Fill in the restart logic.", "Checkpoint says: processed until offset [[900]]. After the restart the stream continues from offset [[901]]. Without a checkpoint the engine can't easily know whether to start from [[1]] or continue.",
        "The checkpoint stores committed progress. Resume point = last committed offset + 1.", tags=["concept"], diff=1)
C.order("Order the crash-recovery story of a stream with a checkpoint.", [
    "Process events 1–900", "Record progress '900' in the checkpoint", "Server crashes",
    "Stream restarts with the same checkpoint location", "Engine reads checkpoint → resume at 901"],
    "Progress must be recorded BEFORE the crash for recovery to work; on restart the engine reads that stored progress and continues right after it.",
    tags=["debug", "concept"], diff=2)
C.scenario("After an overnight incident, your streaming Bronze table suddenly contains every event from the last month **twice**. The source itself has no duplicates.", [
    ("What do you ask yourself first?", [
        ("Did the stream restart with the same checkpoint, or was the checkpoint deleted/reset/moved?", True, "Right: a reset checkpoint makes the engine forget its progress and re-read old offsets."),
        ("Is the Spark UI showing a big shuffle?", False, "Shuffles explain performance, not replayed data."),
        ("Should I enable schema evolution?", False, "Schema has nothing to do with replayed events."),
    ]),
    ("You find the job was redeployed with a new checkpoint path. What is the mechanism?", [
        ("The new, empty checkpoint had no progress, so the stream started reading old data again", True, "Exactly — with no stored offset the engine re-ingested data it had already written."),
        ("Delta Lake duplicated the files during OPTIMIZE", False, "Compaction rewrites files but doesn't duplicate rows logically."),
        ("Kafka sent the events twice", False, "You verified the source has no duplicates."),
    ]),
], explain="Checkpoint reset is one of the seven duplicate causes listed in Chapter 3. The checkpoint location is part of the stream's identity — changing it is like starting a brand-new stream.",
   tags=["debug", "pitfall"], diff=2)
C.odd("Which is NOT something the checkpoint helps with?", [
    "Knowing where to resume after a crash", "Avoiding re-reading events already processed",
    "Fault-tolerant streaming", "Converting amount strings to DECIMAL"], 3,
    "Checkpoints are about progress/state and fault tolerance. Type conversion is a transformation rule (Silver logic), unrelated to where the stream resumes.",
    tags=["concept"], diff=1)

# =====================================================================
# s06 CDC
# =====================================================================
s06 = C.sec(6, "CDC: Change Data Capture",
            "Don't copy 2 billion rows every hour to learn that one customer moved city.")
C.p("Operational **PostgreSQL** has a `customers` table:")
C.table(["id", "name", "city"], [["1", "Maria", "Athens"], ["2", "John", "Patras"]])
C.p("At 10:00 Maria moves from Athens to Volos:")
C.code("sql", "UPDATE customers\nSET city = 'Volos'\nWHERE id = 1;")
C.compare(
    ("Solution 1: re-read the whole table", ["10:00 SELECT * FROM customers", "11:00 SELECT * FROM customers", "12:00 SELECT * FROM customers", "With 2 billion rows → tragically expensive"]),
    ("Solution 2: send only the changes", ["Source emits `UPDATE id=1 city=Volos`", "Lakehouse applies just that change", "This is **Change Data Capture (CDC)**"]),
)
C.table(["op", "id", "name", "city", "seq"], [
    ["I", "1", "Maria", "Athens", "10"],
    ["I", "2", "John", "Patras", "11"],
    ["U", "1", "Maria", "Volos", "12"],
    ["D", "2", "John", "null", "13"],
], caption="A conceptual CDC stream: I = INSERT, U = UPDATE, D = DELETE, seq = order of the changes")
C.reveal("Think first: why do we need the `seq` column if events arrive in a queue anyway?",
         "Because **arrival order ≠ the order the source made the changes**. In a distributed network, seq 18 can arrive before seq 17.")
C.diagram("""
source changes:   seq 17: city = Volos
                  seq 18: city = Larisa   (latest truth)

arrival order:    18 ......... then 17

"last event received wins" → Volos   ✗ WRONG
order by seq               → Larisa  ✓ CORRECT
""", caption="Out-of-order arrival")
C.callout("pitfall", "Arrival order is not source order",
          "If you apply 'last event received wins', late-arriving older events overwrite newer truth. CDC needs **ordering/sequencing** (a seq, version or event time from the source).")
C.ul(["**Ordering / sequencing** — to know which change is newest (seq, version, event ordering).",
      "**A primary/business key** — to know WHICH entity each change applies to (e.g. customer `id`)."])
C.callout("debug", "Deleted at source, alive forever in Silver",
          "A customer was deleted from PostgreSQL but still exists in Silver forever. Suspect **CDC/delete handling**: the delete event may not be captured, or it is captured but not applied.")
C.ask("Ask yourself when the CDC result looks wrong", [
    "Am I applying changes by the source sequence (seq/version), or by arrival order?",
    "Is the key I match on really the primary/business key of the entity?",
    "Are DELETE events captured at the source at all?",
    "If they are captured, does my apply logic actually execute deletes?",
])

C.free("Test Q4: What problem does CDC solve?",
       "CDC carries inserts, updates and deletes from a source system to the target without needing a full snapshot/reload every time. Instead of re-reading e.g. a 2-billion-row table every hour, only the changes are sent and applied.",
       ["transfers inserts/updates/deletes", "no full snapshot / reload each time", "only changes are moved"],
       "Official answer: it transfers inserts/updates/deletes from the source system without needing a full snapshot/reload every time.",
       tags=["exam", "interview"], diff=1, quick=True)
C.mcq("Test Q5: `seq=100 UPDATE balance=50` and `seq=101 UPDATE balance=80` — but event 101 arrives BEFORE event 100. If you apply arrival order, what final balance do you get, and what's correct?",
      ["Final 80; correct 80", "Final 50; correct 80", "Final 80; correct 50", "Final 50; correct 50"], 1,
      "Arrival order applies 101 (80) and then 100 (50), so you end at 50. The source's latest change is seq 101 → 80. Arrival order ≠ source modification order; you need sequence/version/event ordering.",
      why=["Arrival order ends with event 100, not 101.", "Correct: late older event overwrote the newer truth.", "Seq 101 is newer, so 80 is correct.", "50 is the older value."],
      tags=["exam", "pitfall", "calc"], diff=2, quick=True)
C.calc("Apply this CDC stream to an empty current-state table: I(1 Maria Athens, seq 10), I(2 John Patras, seq 11), U(1 Maria Volos, seq 12), D(2, seq 13). How many rows remain?", 1,
       "After seq 10–11 there are 2 rows; seq 12 updates Maria to Volos; seq 13 deletes John. Result: 1 row — Maria | Volos.",
       unit="rows", tags=["calc"], diff=1, quick=True)
C.match("Match each CDC element to its meaning.", [
    ("I", "INSERT"), ("U", "UPDATE"), ("D", "DELETE"),
    ("seq", "order of the changes at the source"), ("id (primary/business key)", "which entity the change applies to")],
    "A CDC event = operation + key + new values + ordering. Without the key you don't know which row to change; without seq you don't know which change is newest.",
    tags=["concept"], diff=1)
C.tf("CDC means re-reading the full source table on a schedule and comparing it with the target.", False,
     "Re-reading the whole table every hour is the expensive 'Solution 1'. CDC is 'Solution 2': the source emits only the changes (I/U/D) and the target applies them.",
     tags=["concept"], diff=1)
C.mcq("Updates `seq 17: city=Volos` and `seq 18: city=Larisa` arrive in the order 18, 17. You use 'last event received wins'. Final city?",
      ["Larisa", "Volos", "NULL", "Athens"], 1,
      "Last received is seq 17 (Volos), so you wrongly end up with Volos although the latest real state is Larisa. Ordering by seq fixes it.",
      tags=["pitfall", "debug"], diff=1)
C.scenario("Test Q27: A customer was deleted from PostgreSQL. In Silver the customer still exists — forever.", [
    ("Which category of problem do you suspect?", [
        ("CDC / delete handling", True, "Right. Inserts and updates flow, but the delete is lost somewhere between capture and apply."),
        ("Schema evolution", False, "A schema change would usually fail writes or add columns, not keep a specific row alive."),
        ("Checkpoint reset", False, "A reset causes replays/duplicates, not a missing delete."),
    ]),
    ("Where do you look first?", [
        ("Bronze: does the raw CDC feed contain a D event for this customer?", True, "Good — this splits the problem in two: not captured vs captured-but-not-applied."),
        ("The Gold dashboard", False, "Gold is downstream; first prove where the delete disappears."),
        ("Cluster size", False, "Compute size doesn't drop events."),
    ]),
    ("The D event IS in Bronze. What's the likely bug now?", [
        ("The Silver apply logic ignores DELETE operations (or matches on the wrong key)", True, "Exactly — the event was captured but not applied correctly."),
        ("PostgreSQL never emitted it", False, "You just saw it in Bronze, so capture worked."),
        ("Bronze should not contain deletes", False, "Bronze keeps raw source behaviour, including deletes."),
    ]),
], explain="Official answer: CDC/delete handling — the delete event is probably not captured or not applied correctly.", tags=["debug", "exam"], diff=2)
C.order("Order the steps to apply a CDC feed correctly to a current-state table.", [
    "Read the new change events (I/U/D)", "Identify each event's entity by its primary/business key",
    "Order events per key by the source sequence (not arrival)", "Apply INSERT / UPDATE / DELETE in that order",
    "Result: the latest correct state per key"],
    "Key + ordering are the two things CDC needs. Ordering by arrival or forgetting deletes are the two most common bugs.",
    tags=["debug", "concept"], diff=2)
C.order("A deleted customer is still in Silver. Order your investigation.", [
    "Confirm the customer is really deleted in the source (PostgreSQL)",
    "Check Bronze: is there a D event for that key?",
    "If no D event → capture problem (deletes not collected)",
    "If D event exists → check the Silver apply logic handles deletes",
    "Check the key used to match the delete is the real business key"],
    "Walk the pipeline in order and find the first point where reality diverges: source → captured in Bronze? → applied in Silver? The key check catches deletes that 'apply' to no row.",
    tags=["debug"], diff=2)
C.spotbug("This pseudo-code applies CDC events to `silver.customers`. Click the buggy lines.", [
    "events = read_new_cdc_events()",
    "events = sort(events, by='arrival_time')",
    "for e in events:",
    "    if e.op == 'I': insert(key=e.id, row=e)",
    "    if e.op == 'U': update(key=e.id, row=e)",
    "    if e.op == 'D': pass   # ignore deletes",
], [1, 5],
    "events = sort(events, by='seq')          # source order, not arrival\n...\n    if e.op == 'D': delete(key=e.id)",
    "Sorting by arrival time reproduces the Volos/Larisa bug; ignoring D events produces the 'deleted at source, alive forever in Silver' bug. Both are textbook CDC errors.",
    tags=["debug", "pitfall"], diff=2)
C.write("Write the SQL that Maria's move produces in the operational PostgreSQL table (customer id 1 moves to Volos).",
        "UPDATE customers\nSET city = 'Volos'\nWHERE id = 1;",
        ["update customers", "set city", "'volos'", "where id = 1"],
        "This single UPDATE is what CDC captures as `U | 1 | Maria | Volos | seq`. Without CDC the lakehouse would only notice it by re-reading the whole table.",
        tags=["syntax"], diff=1)

# =====================================================================
# s07 SCD1/SCD2 & AUTO CDC
# =====================================================================
s07 = C.sec(7, "SCD Type 1 vs Type 2 (and AUTO CDC)",
            "Do you need only today's truth — or the full history of truths?")
C.p("**SCD Type 1** (Slowly Changing Dimension Type 1): keep only the **current state**. Old values are overwritten.")
C.diagram("""
customer_id = 1
Maria | Athens
      │  UPDATE
      ▼
Maria | Volos        ← Athens is gone
""", caption="SCD Type 1")
C.p("**SCD Type 2**: keep **history**. Each change closes the old version and opens a new one.")
C.table(["customer", "city", "from", "to"], [
    ["Maria", "Athens", "2024-01-01", "2026-08-10"],
    ["Maria", "Volos", "2026-08-10", "NULL (current)"],
], caption="SCD Type 2")
C.p("Now you can ask: *Where did Maria live on 1 July 2025?* → **Athens** (2024-01-01 ≤ date < 2026-08-10).")
C.compare(
    ("SCD Type 1", ["Overwrite in place", "Only current state", "1 row per key", "Question it answers: 'Where does she live now?'"]),
    ("SCD Type 2", ["Close old version, add new one", "Full history with validity ranges", "1 row per version", "Question it answers: 'Where did she live on date X?'"]),
)
C.table(["seq", "event"], [["20", "INSERT id=4 salary=1000"], ["21", "UPDATE id=4 salary=1300"], ["22", "UPDATE id=4 salary=1500"]],
        caption="Exercise input")
C.code("text", "SCD1 result:\n  id=4  salary=1500\n\nSCD2 result (version history):\n  id  salary  valid_from  valid_to\n  4   1000    ...         ...\n  4   1300    ...         ...\n  4   1500    ...         current", caption="Same events, two outcomes")
C.callout("exam", "AUTO CDC vs APPLY CHANGES",
          "Today Databricks provides **AUTO CDC** and **AUTO CDC FROM SNAPSHOT** in Lakeflow pipelines; they can manage **SCD Type 1 and Type 2**. The older **APPLY CHANGES** APIs still exist, but current docs recommend AUTO CDC. Older courses and exam questions may still use the old name — it's the same concept.")
C.reveal("Think first: in the SCD2 table, what does `to = NULL` mean?",
         "That row is the **current** version — it has not been closed by a newer change yet.")

C.mcq("Test Q6: You only need to know a customer's CURRENT address. SCD1 or SCD2?", ["SCD Type 1", "SCD Type 2"], 0,
      "Only the current state matters, so overwriting in place (Type 1) is enough. Type 2 would store history you don't need.",
      tags=["exam"], diff=1, quick=True)
C.mcq("Test Q7: You need to know where a customer lived in 2019, 2022 and 2025. SCD1 or SCD2?", ["SCD Type 1", "SCD Type 2"], 1,
      "Point-in-time questions need history with validity ranges — Type 2. Type 1 overwrote 2019 and 2022 long ago.",
      tags=["exam"], diff=1, quick=True)
C.cloze("Events: seq 20 INSERT id=4 salary=1000; seq 21 UPDATE salary=1300; seq 22 UPDATE salary=1500.",
        "SCD1 keeps only id=4 salary=[[1500]]. SCD2 keeps [[3]] versions for id=4, and the current one has salary [[1500]].",
        "Type 1 overwrites, so only the latest value survives. Type 2 keeps one row per version (1000, 1300, 1500), with the latest marked current (open valid_to).",
        tags=["calc", "concept"], diff=1, quick=True)
C.mcq("Using the SCD2 table (Athens 2024-01-01 → 2026-08-10, Volos 2026-08-10 → NULL), where did Maria live on 1 July 2025?",
      ["Athens", "Volos", "Unknown — SCD2 only stores the current city", "Both"], 0,
      "1 July 2025 lies inside the Athens validity range (2024-01-01 to 2026-08-10). This kind of question is exactly what Type 2 exists for.",
      tags=["concept"], diff=1)
C.tf("APPLY CHANGES and AUTO CDC are completely different features, so old exam questions about APPLY CHANGES no longer apply.", False,
     "APPLY CHANGES is the older API name for the same CDC idea; the current docs recommend AUTO CDC (and AUTO CDC FROM SNAPSHOT). Old courses/exams may still use the old terminology.",
     tags=["exam", "pitfall"], diff=2)
C.match("Match the term to its description.", [
    ("SCD Type 1", "Overwrite: keep only the current state"),
    ("SCD Type 2", "Keep a version history with validity ranges"),
    ("AUTO CDC", "Current Lakeflow API for applying CDC (SCD1/SCD2)"),
    ("APPLY CHANGES", "Older name of the CDC API, still found in old material"),
    ("AUTO CDC FROM SNAPSHOT", "CDC variant that works from successive source snapshots"),
], "AUTO CDC is the recommended way in Lakeflow pipelines; APPLY CHANGES is legacy naming; both can produce SCD1 or SCD2 tables.",
   tags=["exam"], diff=2)
C.bucket("SCD Type 1 or Type 2?", ["SCD Type 1", "SCD Type 2"], [
    ("Shipping label needs the customer's current address", 0),
    ("Auditor asks what salary employee 4 had last March", 1),
    ("Report of revenue by the region the customer lived in AT ORDER TIME", 1),
    ("Fix a typo in a product name everywhere", 0),
    ("Track every price change of a product for analysis", 1),
], "Need only 'now' → Type 1. Need 'what was true at time X' → Type 2.",
   tags=["compare"], diff=2)
C.odd("Which one does NOT belong to SCD Type 2?", ["valid_from column", "valid_to column", "one row per version", "overwrite the old value in place"], 3,
      "Overwriting in place is the definition of Type 1. Type 2 closes the old row (valid_to) and inserts a new version (valid_from).",
      tags=["compare"], diff=1)
C.calc("A customer moves 4 times after the initial insert. How many rows does an SCD Type 2 table hold for that customer (one row per version)?", 5,
       "Initial version + 4 changes = 5 versions, exactly one of them current (open valid_to). An SCD Type 1 table would still hold 1 row.",
       unit="rows", tags=["calc"], diff=1)

# =====================================================================
# s08 Schema as contract & enforcement
# =====================================================================
s08 = C.sec(8, "Schema as a Contract: Enforcement",
            "A bad upstream value should be stopped at the door, not discovered on the CEO's dashboard.")
C.p("A **schema** = column names + column types. Treat it as a **contract** between producer and consumers.")
C.code("text", "orders\n  order_id     BIGINT\n  customer_id  BIGINT\n  amount       DECIMAL\n  country      STRING", caption="The orders contract")
C.p("Someone tries to write `amount = {\"foo\": 12}` or a column `unknown_column`. You want to say: *I don't accept arbitrary data that doesn't match the contract.* That is **schema enforcement**.")
C.callout("key", "Delta enforces on write",
          "For Delta tables, Databricks validates the schema **at write time** and rejects incompatible data — unless you have enabled an allowed schema-evolution procedure.")
C.p("Why it matters: Power BI expects `amount: DECIMAL`. Suddenly the upstream producer sends `amount: STRING` with the value `\"unknown\"`.")
C.flow(["upstream schema bug", "Silver corrupted", "Gold wrong", "dashboard broken"], caption="What happens if you accept anything")
C.callout("tip", "Fail early, fail cheap", "Schema enforcement can stop the problem at the first write, before bad data spreads to Silver, Gold and BI.")
C.terms([
    ("Schema-on-write", "Structure is checked when data is written (Delta's schema enforcement)."),
    ("Schema-on-read", "Data is stored as-is and structure is applied when it's read/parsed later (the raw ELT/Bronze idea)."),
    ("Schema drift", "Informal name for the source schema changing over time — sometimes intentionally, sometimes by bug."),
])

C.mcq("Target Delta column `amount DECIMAL`. A producer writes a batch where `amount` is the STRING `\"unknown\"`. No schema evolution is configured. What happens?",
      ["The write is rejected with a schema error", "Delta silently converts it to NULL", "Delta changes the column type to STRING", "The row is written and fixed later by OPTIMIZE"], 0,
      "Delta validates the schema on write and rejects incompatible data. It does not silently coerce values or change column types unless an evolution path is explicitly enabled — and even then, changing DECIMAL to STRING is not an automatic evolution.",
      why=["Correct: enforcement on write.", "No silent coercion — that would hide the bug.", "Type changes don't happen implicitly.", "OPTIMIZE compacts files; it never fixes data."],
      tags=["exam", "concept"], diff=1, quick=True)
C.tf("By default, writing a DataFrame with an extra column `unknown_column` into a Delta table just ignores the extra column.", False,
     "Schema enforcement rejects the write because the incoming schema doesn't match the table contract. Adding columns requires explicit, controlled schema evolution.",
     tags=["pitfall", "exam"], diff=1, quick=True)
C.order("Order the damage chain when bad data is accepted without enforcement.", ["Upstream schema bug", "Silver corrupted", "Gold wrong", "Dashboard broken"],
        "Each layer consumes the previous one, so an unchecked bug propagates. Enforcement cuts the chain at the first step.",
        tags=["pitfall"], diff=1)
C.bucket("Without schema evolution enabled: does a Delta write into `orders(order_id BIGINT, customer_id BIGINT, amount DECIMAL, country STRING)` pass or get rejected?",
         ["Passes", "Rejected"], [
    ("A batch with exactly those four columns and valid values", 0),
    ("amount = {\"foo\": 12}", 1),
    ("An extra column `unknown_column`", 1),
    ("amount arriving as the string \"unknown\"", 1),
    ("New orders with the correct types for all columns", 0),
], "Enforcement accepts data that fits the contract and rejects incompatible types or unexpected columns until you explicitly allow an evolution.",
   tags=["concept"], diff=1)
C.odd("A schema is defined by…", ["column names", "column types", "the contract consumers rely on", "the number of files in the table"], 3,
      "Schema = names + types (the contract). File count is a physical storage detail, unrelated to the schema.",
      tags=["concept"], diff=1)
C.free("Explain to a junior why schema enforcement is necessary, using a Power BI dashboard example.",
       "The dashboard expects amount as DECIMAL. If an upstream producer suddenly sends amount as the string 'unknown' and we accept anything, the bug corrupts Silver, then Gold aggregates are wrong, and finally the dashboard breaks or shows wrong numbers. Enforcement rejects the incompatible write at the first table, so the problem is caught early and close to its cause.",
       ["contract: dashboard expects DECIMAL", "upstream sends STRING 'unknown'", "propagates Silver → Gold → dashboard", "enforcement stops it early"],
       "Good answers name the propagation chain and the benefit of failing early at the boundary.",
       tags=["interview", "concept"], diff=2)

# =====================================================================
# s09 Schema evolution & mismatch debugging
# =====================================================================
s09 = C.sec(9, "Schema Evolution & Debugging a Schema Mismatch",
            "Schemas change legitimately. The skill is evolving on purpose — not by accident.")
C.p("Today `orders` has `id, amount`. Tomorrow the source adds `discount_code`. You don't always want **FAIL FOREVER** — you may want the schema to change in a **controlled** way. That is **schema evolution**.")
C.ul(["New columns", "Renaming / dropping columns", "Type widening or other type changes"])
C.callout("exam", "Enforcement and evolution are NOT opposites",
          "It's not *enforcement OR evolution*. It's usually **enforcement + an explicit evolution policy**: by default I protect the schema, but I allow specific changes under specific rules.")
C.compare(
    ("Schema enforcement", ["Protects the existing contract", "Rejects incompatible writes", "Default behaviour"]),
    ("Schema evolution", ["Allows a controlled change of the contract", "E.g. add `discount_code`", "Explicitly enabled, with rules"]),
)
C.callout("debug", "AnalysisException: schema mismatch",
          "Yesterday the pipeline worked. Today: `AnalysisException ... schema mismatch`. Do **not** immediately write 'enable schema evolution everywhere'. First ask what actually changed.")
C.diagram("""
Did the source schema really change?
   │
   ├── yes → was it intentional?
   │          ├── yes → evolve carefully
   │          └── no  → source bug (fix upstream)
   │
   └── no  → parsing / type-inference bug on our side
""", caption="Schema-mismatch decision tree — this is production thinking")
C.ask("Ask yourself when you hit a schema mismatch", [
    "Did the source schema REALLY change, or did my parsing/type inference change?",
    "If it changed, was the change intentional (announced, documented)?",
    "If intentional, which exact evolution (add column, rename, widen type) do I need — and only where?",
    "If unintentional, who owns the source bug upstream?",
])
C.reveal("Think first: target is `customer_id BIGINT, age INT, country STRING`; the source suddenly also has `loyalty_points INT`. What happened, and do you accept it?",
         "It's a **schema-evolution candidate: add column**. That does NOT automatically mean you accept it — first confirm the change is expected/intentional, then evolve in a controlled way.")
C.callout("pitfall", "Blind evolution", "Turning on every possible schema evolution everywhere is the WORST option: real upstream bugs then flow silently into Silver and Gold.")

C.mcq("Test Q28: The source schema changed. Which is the WORST practice?",
      ["A. Fail and investigate", "B. Confirm the change is intentional, then apply evolution", "C. Blindly enable every possible schema evolution everywhere"], 2,
      "C removes the safety net: unintended upstream bugs would be silently absorbed. A is safe (maybe slow); B is the ideal production behaviour.",
      why=["Safe: you lose time, not correctness.", "Best practice: enforce + controlled evolution.", "Correct (worst): blind evolution hides bugs."],
      tags=["exam", "pitfall"], diff=1, quick=True)
C.tf("Test Q9: When an upstream API adds a new field, that is necessarily an error.", False,
     "Not necessarily — it may be completely legitimate schema evolution. Confirm it's intentional, then evolve in a controlled way.",
     tags=["exam"], diff=1, quick=True)
C.free("Test Q8: What is the difference between schema enforcement and schema evolution?",
       "Enforcement protects the existing schema contract by rejecting incompatible writes. Evolution allows a controlled change of that contract, such as adding a column. They are not opposites: in production you usually combine enforcement with an explicit evolution policy.",
       ["enforcement protects existing contract / rejects incompatible writes", "evolution = controlled change of the schema", "not opposites — used together"],
       "Official answer: enforcement protects the existing schema contract; evolution allows a controlled change of that schema.",
       tags=["exam", "interview"], diff=1)
C.mcq("Target: `customer_id BIGINT, age INT, country STRING`. Source now also sends `loyalty_points INT`. Best description?",
      ["Data corruption — drop the source", "Schema-evolution candidate (add column); confirm it's expected before accepting", "Type widening", "Must always be accepted automatically"], 1,
      "Adding a column is the classic evolution candidate, but 'candidate' is the key word: verify the change is intended before evolving the table.",
      tags=["concept", "pitfall"], diff=1)
C.scenario("Yesterday the pipeline worked. Today the write fails with `AnalysisException: schema mismatch`.", [
    ("What do you do FIRST?", [
        ("Check whether the source schema really changed", True, "Right — the first branch of the decision tree."),
        ("Enable schema evolution on all tables", False, "That's the anti-pattern: it may silently accept a real bug."),
        ("Restart the cluster", False, "A schema mismatch is about data shape, not compute health."),
    ]),
    ("The source schema did NOT change. What do you suspect?", [
        ("A parsing / type-inference bug on our side", True, "Yes — e.g. inference read a column as STRING today because of an odd value."),
        ("A source bug", False, "The source didn't change, so the source isn't the culprit."),
        ("Intentional evolution", False, "Nothing evolved upstream."),
    ]),
    ("In a different incident the source DID change, but nobody upstream intended it. Conclusion?", [
        ("It's a source bug — report/fix upstream, don't evolve", True, "Correct: evolving would bake the bug into your contract."),
        ("Evolve carefully", False, "Only intentional changes should be evolved."),
        ("Parsing bug", False, "The source really changed, so it's not our parser."),
    ]),
], explain="Decision tree: changed? → intentional? → evolve carefully / source bug; not changed → our parsing/type-inference bug.",
   tags=["debug", "exam"], diff=2)
C.order("Order the schema-mismatch decision process for the INTENTIONAL-change path.", [
    "See AnalysisException: schema mismatch", "Check whether the source schema really changed",
    "Confirm the change is intentional", "Choose the specific evolution needed (e.g. add column)",
    "Apply the evolution carefully, only where needed"],
    "Production thinking: prove what changed, prove it's intended, then evolve narrowly. Skipping straight to evolution is the classic mistake.",
    tags=["debug"], diff=2)
C.match("Match each decision-tree outcome to its conclusion.", [
    ("Source changed + intentional", "Evolve carefully"),
    ("Source changed + NOT intentional", "Source bug"),
    ("Source did NOT change", "Parsing / type-inference bug"),
], "Only the first branch leads to schema evolution; the other two are bugs to fix, not changes to accept.",
   tags=["debug"], diff=1)
C.bucket("Likely legitimate evolution (after confirming) or likely a bug?", ["Likely evolution candidate", "Likely bug"], [
    ("New `discount_code` column announced in the source release notes", 0),
    ("`amount` sometimes arrives as the string \"unknown\"", 1),
    ("New `loyalty_points INT` column after a planned loyalty launch", 0),
    ("`age` inferred as STRING today because one file had a stray header row", 1),
    ("A planned widening of `quantity` from INT to BIGINT", 0),
], "Intentional, announced changes are evolution candidates; random type changes or inference glitches are bugs — evolving them would corrupt the contract.",
   tags=["pitfall", "debug"], diff=2)
C.tf("Enforcement and evolution are mutually exclusive: a table either enforces its schema or allows evolution.", False,
     "They work together: enforcement by default, plus an explicit policy that allows specific, controlled changes.",
     tags=["exam", "pitfall"], diff=1)

# =====================================================================
# s10 Medallion layers
# =====================================================================
s10 = C.sec(10, "Medallion Architecture: Bronze, Silver, Gold",
            "Everything so far snaps together here: raw truth, cleaning, CDC and business-ready data.")
C.p("Databricks widely recommends **Bronze → Silver → Gold**. It is **not mandatory** — it's a design pattern of **progressively increasing data quality**.")
C.flow(["Bronze (raw)", "Silver (clean, validated)", "Gold (business-ready)"])
C.p("**Bronze** — keep as faithfully as possible what came from the source (e.g. Kafka → Bronze orders):")
C.code("text", '{\n  "id": "00192",\n  "amount": "25.98",\n  "customer": "  MARIA ",\n  "event_time": "..."\n}', caption="A Bronze record — messy on purpose")
C.ul(["Duplicates", "Nulls", "Bad formatting", "Incorrect cases", "Unexpected fields"])
C.p("That's not necessarily a problem: Bronze is very close to the **source truth**.")
C.reveal("Think first: why on earth keep 'dirty' data?",
         "Suppose today's rule was wrong: `amount = amount * 100` and you built a broken Silver. With Bronze: Bronze → correct code → **rebuild Silver**. Without raw data you may have to re-request it from the source — and the source may no longer have it.")
C.p("**Silver** — cleaned, validated, usable data. Typical work here:")
C.ul(["parsing", "casting", "deduplication", "null handling", "quality checks", "CDC application", "joins", "normalization", "business-key validation"])
C.table(["Field", "Bronze", "Silver"], [
    ["id", '"00192" (string)', "192 (BIGINT)"],
    ["customer", '"  MARIA " (string)', '"MARIA" (STRING)'],
    ["amount", '"25.98" (string)', "25.98 (DECIMAL)"],
], caption="Same record, Bronze → Silver")
C.p("Databricks describes Silver as the cleansed/validated/refined layer that data analysts and data scientists can use.")
C.p("**Gold** — data shaped for a **specific business use**: `gold.daily_sales`, `customer_lifetime_value`, `monthly_revenue_by_product`.")
C.table(["date", "country", "revenue"], [["2026-09-14", "GR", "190000"], ["2026-09-14", "DE", "310000"]], caption="gold.daily_sales")
C.callout("pitfall", "Gold ≠ 'Silver but cleaner'", "Gold is usually **consumer/business oriented**: aggregates, metrics, models for a specific audience — not just an extra cleaning pass.")
C.compare(
    ("Bronze", ["Source-faithful raw data", "Duplicates/nulls allowed", "Purpose: audit, reprocess, debug"]),
    ("Silver", ["Clean, validated, deduplicated", "CDC applied, types cast", "Purpose: reusable datasets for analysts/DS"]),
    ("Gold", ["Business-shaped aggregates/models", "e.g. daily_sales, lifetime value", "Purpose: specific consumers (BI, CEO)"]),
)

C.tf("Test Q10: If Bronze contains duplicates, that is necessarily a bug.", False,
     "No. Bronze may deliberately preserve raw source behaviour, duplicates included. Deduplication is a Silver responsibility.",
     tags=["exam", "pitfall"], diff=1, quick=True)
C.mcq("Test Q12: A table with `customer_id, lifetime_value` per customer usually belongs to…", ["Bronze", "Silver", "Gold"], 2,
      "Lifetime value is a business metric computed for a specific use — Gold. Silver holds the clean customers/orders it is computed from.",
      tags=["exam"], diff=1, quick=True)
C.mcq("Test Q13: A deduplicated, validated customer table usually belongs to…", ["Bronze", "Silver", "Gold"], 1,
      "Dedup + validation = Silver. It's clean and reusable but not yet shaped for one business question.",
      tags=["exam"], diff=1, quick=True)
C.free("Test Q11: Why keep Bronze instead of writing straight to Gold?",
       "For auditability, reprocessing, debugging and the ability to rebuild downstream layers when the transformation logic changes. If a rule was wrong (e.g. amount * 100), we fix the code and rebuild Silver/Gold from Bronze; without raw data we might have to ask the source again, and it may no longer have the data.",
       ["auditability", "reprocessing / rebuild downstream", "debugging", "transformation logic may change", "source may no longer have the data"],
       "Official answer: auditability, reprocessing, debugging and the ability to recreate downstream layers when transformation logic changes.",
       tags=["exam", "interview"], diff=2)
C.free("Test Q29 (interview): Explain the medallion architecture in 30 seconds.",
       "The medallion architecture organizes lakehouse data into progressively higher-quality layers: Bronze for raw, source-faithful data; Silver for validated, cleaned, reusable datasets; and Gold for business-oriented aggregates or models that serve specific consumers. It's a design pattern, not a requirement, and all three layers can be Delta tables.",
       ["progressively increasing quality", "Bronze = raw / source-faithful", "Silver = validated, cleaned, reusable", "Gold = business-oriented for specific consumers"],
       "A strong answer names all three layers by purpose (not by file format) and the idea of progressive quality.",
       tags=["interview", "exam"], diff=2)
C.match("Match each Bronze value to its Silver form.", [
    ('"id": "00192"', "192 as BIGINT"), ('"customer": "  MARIA "', '"MARIA" as STRING'), ('"amount": "25.98"', "25.98 as DECIMAL")],
    "Silver parses and casts strings into proper types and cleans formatting (trimming). Bronze keeps the original strings so this can always be redone.",
    tags=["concept"], diff=1)
C.tf("The medallion architecture is a mandatory Databricks feature you must enable.", False,
     "It's a widely recommended design pattern (progressively increasing quality), not a required feature or setting.",
     tags=["concept", "exam"], diff=1)
C.scenario("A bug in your Silver job multiplied every amount by 100 for the past week (`amount = amount * 100`). Gold revenue is 100× too high.", [
    ("What's your recovery plan, given you have Bronze?", [
        ("Fix the transformation code and rebuild Silver (and then Gold) from Bronze", True, "Exactly what Bronze is for: raw → corrected code → rebuild."),
        ("Divide Gold revenue by 100 by hand", False, "Patching the symptom leaves Silver wrong and every other consumer still broken."),
        ("Re-request a week of data from the source", False, "Unnecessary — Bronze already holds the source-faithful data."),
    ]),
    ("Your colleague asks: what if we had NOT kept Bronze?", [
        ("We would need the source to resend the data — and it may no longer have it", True, "That's the main argument for keeping raw data."),
        ("No difference, Silver can fix itself", False, "Silver only contains the already-wrong values."),
        ("Delta's transaction log would contain the raw JSON", False, "The log tracks table versions of Silver, which were already wrong."),
    ]),
], explain="Bronze turns a transformation bug into a reprocessing job instead of a data-loss incident.", tags=["debug", "concept"], diff=2)
C.order("Order the recovery after a wrong Silver transformation rule.", [
    "Notice wrong numbers in Gold", "Trace the error to the Silver transformation rule",
    "Fix the transformation code", "Rebuild Silver from Bronze", "Rebuild Gold from the corrected Silver"],
    "Fix the cause, then recompute downstream in dependency order: Bronze is the trusted starting point, Gold comes last.",
    tags=["debug"], diff=2)
C.bucket("Which layer typically does this work?", ["Bronze", "Silver", "Gold"], [
    ("Land raw Kafka events exactly as received", 0),
    ("Deduplicate orders", 1),
    ("Apply CDC to build the current customer table", 1),
    ("Compute monthly revenue by product", 2),
    ("Cast amount strings to DECIMAL", 1),
    ("Customer lifetime value for marketing", 2),
    ("Keep duplicates and unexpected fields as they came", 0),
], "Bronze = keep raw; Silver = parse, cast, dedup, CDC, quality; Gold = business-shaped aggregates and metrics.",
   tags=["concept"], diff=1)

# =====================================================================
# s11 Medallion in practice
# =====================================================================
s11 = C.sec(11, "Medallion in Practice: The E-shop End to End",
            "One picture that ties ingestion, CDC, cleaning and aggregation together.")
C.diagram("""
PostgreSQL ───┐
Kafka ────────┼──►  ┌──────────┐
JSON files ───┘     │  BRONZE  │
                    └────┬─────┘
                         │ parse / validate
                         │ deduplicate
                         │ apply CDC
                         │ clean types
                         ▼
                    ┌──────────┐
                    │  SILVER  │
                    │ customers│
                    │ orders   │
                    │ products │
                    └────┬─────┘
                         │ aggregate / model
                         ▼
                    ┌──────────┐
                    │   GOLD   │
                    └──────────┘
""", caption="The full e-shop example")
C.callout("pitfall", "Layers are not file formats",
          "Don't think *Bronze = CSV, Silver = Parquet, Gold = database*. All three can be **Delta tables**. The difference is **semantic / quality / purpose**, not necessarily file format.")
C.table(["Layer", "Typical Lakeflow dataset type (current Databricks recommendation)"], [
    ["Bronze", "Streaming tables"],
    ["Silver", "Streaming tables or materialized views, depending on the transformation"],
    ["Gold", "Materialized views for aggregations / metrics"],
])
C.reveal("Think first: where do these go? A raw JSON exactly as received · B orders with validated types, duplicates removed · C monthly revenue by country · D customer table after applying CDC · E malformed records captured for investigation",
         "A → Bronze · B → Silver · C → Gold · D → Silver · E → usually Bronze / a quarantine layer. E depends on the architecture — but you **never make bad records silently disappear**.")
C.callout("warn", "Never silently drop malformed records", "Capture them (Bronze or a quarantine table) so they can be investigated and replayed.")
C.diagram("""
SOURCE
  │  extract / ingest
  ▼
┌────────┐
│ BRONZE │
└───┬────┘
    │  validate · clean · CDC · evolve schema
    ▼
┌────────┐
│ SILVER │
└───┬────┘
    │  model · aggregate
    ▼
┌────────┐
│  GOLD  │
└────────┘
""", caption="The mental model to keep: which work happens at which boundary")

C.bucket("Where would you put each dataset? (the lesson's exercise)", ["Bronze", "Silver", "Gold", "Bronze / quarantine"], [
    ("A. Raw JSON exactly as received", 0),
    ("B. Orders with validated types and duplicates removed", 1),
    ("C. Monthly revenue by country", 2),
    ("D. Customer table after applying CDC", 1),
    ("E. Malformed records captured for investigation", 3),
], "A is source-faithful (Bronze); B and D are cleaned/CDC-applied reusable data (Silver); C is a business aggregate (Gold); E is usually kept in Bronze or a dedicated quarantine area — architecture-dependent, but never silently discarded.",
   tags=["exam"], diff=1, quick=True)
C.tf("A correct medallion design uses CSV for Bronze, Parquet for Silver and a database for Gold.", False,
     "All three layers can be Delta tables. The layers differ in semantics, quality and purpose — not necessarily in file format.",
     tags=["pitfall", "exam"], diff=1, quick=True)
C.mcq("In current Lakeflow pipelines, which dataset type does Databricks typically recommend for Gold aggregations/metrics?",
      ["Streaming tables only", "Materialized views", "Raw JSON files in a volume", "Temporary views"], 1,
      "The recommended pattern: Bronze often streaming tables, Silver streaming tables or materialized views depending on the transformation, Gold materialized views for aggregations/metrics.",
      tags=["exam"], diff=2)
C.odd("Which one is NOT what distinguishes Bronze, Silver and Gold?", ["Semantics", "Data quality", "Purpose / consumer", "File format"], 3,
      "All layers can be Delta tables; the distinction is semantic/quality/purpose. File format is the misconception.",
      tags=["pitfall"], diff=1)
C.match("Match each transformation to the boundary where it usually happens.", [
    ("Extract / ingest raw events", "Source → Bronze"),
    ("Validate, clean, apply CDC, evolve schema", "Bronze → Silver"),
    ("Model and aggregate for a business use", "Silver → Gold"),
], "Knowing which work happens at which boundary is also how you debug: if data is in Bronze but not in Silver, the Bronze → Silver work is your suspect.",
   tags=["concept", "debug"], diff=1)
C.mcq("Your Silver validation finds 300 malformed order records. What is the right default behaviour?",
      ["Drop them silently so Silver stays clean", "Capture them in Bronze / a quarantine table for investigation", "Write them to Gold with a warning flag", "Stop all pipelines permanently"], 1,
      "Bad records should be visible and investigable, not vanish. Where exactly they live depends on the architecture (Bronze or a quarantine layer), but silently discarding them hides data loss.",
      tags=["pitfall"], diff=1)
C.order("Order the e-shop data flow.", ["Sources: PostgreSQL, Kafka, JSON files", "Bronze (raw)", "Parse / validate, deduplicate, apply CDC, clean types",
                                        "Silver: customers, orders, products", "Aggregate / model", "Gold"],
        "Raw lands first, cleaning/CDC produce Silver entities, and aggregation produces Gold. This is the same flow you'll build with Lakeflow pipelines later.",
        tags=["concept"], diff=1)

# =====================================================================
# Debug playbooks
# =====================================================================
C.playbook(1, "Write fails: AnalysisException — schema mismatch", s09,
    "A pipeline that worked yesterday fails today with `AnalysisException ... schema mismatch` when writing to a Delta table.",
    ["Did the source schema REALLY change, or only what my code inferred?",
     "Can I diff yesterday's input schema against today's (columns + types)?",
     "If it changed: was it intentional — announced, documented, agreed with the producer?",
     "If intentional: what is the narrowest evolution I need (add column, rename, widen type) and on which table?",
     "If not intentional: who owns the source, and how do I stop bad data meanwhile?",
     "If it did NOT change: did my parsing or type inference produce a different type today?"],
    [("Compare the incoming schema with the table schema", "Identify exactly which column/type differs.", "df.printSchema()\nDESCRIBE TABLE silver.orders;"),
     ("Check with the source owner / release notes whether the change was planned", "Only intentional changes should be evolved."),
     ("If unchanged at source, inspect parsing / type inference (e.g. a stray header row turning INT into STRING)", "The bug may be on our side."),
     ("Apply a narrow, explicit evolution — or fix the bug — and re-run", "Never 'enable schema evolution everywhere'.")],
    ["Intentional upstream change (e.g. new column) not yet allowed by the table",
     "Unintentional upstream bug (e.g. amount sent as STRING 'unknown')",
     "Parsing / type-inference bug in our own ingestion"],
    "Changed + intentional → evolve carefully; changed + unintentional → fix the source; unchanged → fix parsing/inference. Keep enforcement on.",
    mnemonic="Changed? → Intended? → Evolve narrowly. (C-I-E)")
C.playbook(2, "Deleted at source, still alive in Silver", s06,
    "A customer was deleted in PostgreSQL, but the row is still present in Silver — forever.",
    ["Is the customer really deleted in the source?",
     "Does the raw CDC feed in Bronze contain a D (DELETE) event for that key?",
     "If not: is my CDC capture configured to emit deletes at all?",
     "If yes: does my Silver apply logic handle DELETE operations?",
     "Am I matching the delete on the real primary/business key?",
     "Is the delete being applied in source sequence order (not overwritten by an older late event)?"],
    [("Query Bronze for change events of that key", "Splits the problem: captured vs not captured."),
     ("Inspect the Silver CDC apply logic (AUTO CDC config / MERGE)", "Look for ignored D events or a wrong key."),
     ("Check sequencing for that key", "An older out-of-order UPDATE could re-create the row.")],
    ["Delete events not captured by CDC", "Apply logic ignores deletes", "Wrong key in the apply step", "Out-of-order events applied by arrival order"],
    "Capture deletes at the source, apply them by key in sequence order (e.g. with AUTO CDC), then rebuild/repair Silver.",
    mnemonic="Captured? Applied? Right key? Right order?")
C.playbook(3, "Wrong 'latest' state after CDC", s06,
    "The Silver customer table shows Volos, but the source says the latest city is Larisa.",
    ["Am I applying changes by arrival order or by the source sequence?",
     "Does every CDC event carry a seq / version / event-time from the source?",
     "Did events for the same key arrive out of order?",
     "Is my key the true primary/business key?"],
    [("List all CDC events for the key with their seq and arrival time", "Reveals out-of-order arrival (e.g. 18 before 17)."),
     ("Check the apply logic's ordering column", "'Last received wins' is the bug."),
     ("Re-apply ordered by seq", "The highest seq per key is the truth.")],
    ["'Last event received wins' logic", "Missing or ignored sequence column", "Wrong key"],
    "Always order and resolve CDC changes per key by the source sequence (seq/version), never by arrival.",
    mnemonic="Arrival ≠ truth; seq = truth.")
C.playbook(4, "Stream restarted: reprocessed or skipped data", s05,
    "After a crash or redeploy, the stream either re-ingests old events (duplicates) or seems to have skipped events.",
    ["Did the stream restart with the SAME checkpoint location?",
     "Was the checkpoint deleted, reset or moved during redeploy?",
     "What offset does the checkpoint say was processed last?",
     "Do the first events after restart start right after that offset?"],
    [("Compare the checkpoint path in the old and new job config", "A new path = a brand-new stream with no memory."),
     ("Inspect the last committed offset", "Tells you where the engine believes it stopped."),
     ("Compare Bronze row counts per source offset/file before and after restart", "Shows duplicates or gaps.")],
    ["Checkpoint reset/deleted", "Checkpoint location changed in a redeploy", "Restart without any checkpoint"],
    "Keep a stable checkpoint per stream; if it was reset, deduplicate the replayed range (e.g. in Silver) and restore the correct checkpoint setup.",
    mnemonic="Same path? Same progress? Next offset?")
C.playbook(5, "Silver is wrong because a transformation rule was wrong", s10,
    "Gold metrics are off (e.g. revenue 100× too high) and the cause is a bad rule like `amount = amount * 100` in Silver.",
    ["Is the error already present in Silver, or only in Gold?",
     "Which transformation rule produced it, and since when?",
     "Do I still have the raw data in Bronze for that period?",
     "Which downstream tables depend on the wrong Silver table?"],
    [("Compare a few Bronze vs Silver records", "Proves the rule, not the source, is wrong."),
     ("Fix the transformation code", "Fix the cause, not the symptom."),
     ("Rebuild Silver from Bronze, then Gold from Silver", "Recompute in dependency order.")],
    ["Wrong transformation logic", "No raw copy kept (makes recovery hard)"],
    "Correct the code and rebuild downstream from Bronze. This is why Bronze exists.",
    mnemonic="Fix code → rebuild from Bronze → cascade down.")

# =====================================================================
# Pitfalls
# =====================================================================
for t, x, f in [
    ("Fighting over the ETL/ELT label", "Databricks calls most pipelines 'ETL' even when they're ELT-like.", "Focus on where the transformation happens and whether raw is kept."),
    ("Not keeping raw data", "Pure ETL stores only the transformed output; a wrong rule (USD vs EUR, amount*100) can't be fixed without re-asking the source.", "Load raw first (Bronze) and transform downstream."),
    ("Streaming = one row at a time", "Structured Streaming often processes micro-batches through normal Spark execution.", "Think micro-batch → job → stages → tasks → partitions."),
    ("Streaming = incremental (and batch ≠ incremental)", "They are independent axes; a nightly job can be batch + incremental.", "Ask separately: how is it triggered? how much is reprocessed?"),
    ("Full reload of a huge table every day", "Reprocessing 5 TB to pick up 20 MB of changes wastes time and money.", "Process only new/changed data (incremental, CDC)."),
    ("Resetting or moving the checkpoint", "The stream forgets its progress and replays or skips data.", "Keep a stable checkpoint location per stream."),
    ("Last-received-wins CDC", "Arrival order ≠ source order; late old events overwrite newer truth.", "Order changes per key by seq/version."),
    ("Ignoring DELETE events", "Customers deleted at source live forever in Silver.", "Capture and apply deletes by key."),
    ("Thinking APPLY CHANGES and AUTO CDC are unrelated", "Old material uses APPLY CHANGES; current docs recommend AUTO CDC.", "Treat them as old/new names for the CDC API."),
    ("Enforcement vs evolution as opposites", "Production uses both together.", "Enforce by default + explicit, narrow evolution policy."),
    ("Enabling schema evolution everywhere", "Real upstream bugs flow silently into Silver and Gold.", "Investigate: changed? intended? then evolve narrowly."),
    ("Treating every new field as an error", "New fields can be legitimate evolution.", "Confirm intent, then evolve in a controlled way."),
    ("Calling Bronze duplicates a bug", "Bronze intentionally preserves raw source behaviour.", "Deduplicate in Silver."),
    ("Gold = cleaner Silver", "Gold is shaped for specific business consumers.", "Build Gold as aggregates/models for a use case."),
    ("Bronze = CSV, Silver = Parquet, Gold = database", "All layers can be Delta tables.", "Distinguish layers by semantics, quality, purpose."),
    ("Silently dropping malformed records", "Data disappears without trace.", "Capture them in Bronze or a quarantine table."),
]:
    C.pitfall(t, x, f)

# =====================================================================
# Flashcards
# =====================================================================
for q, a, s in [
    ("Storage model in five lines?", "Spark = compute · Parquet = file format · Delta Lake = transactional table layer · Unity Catalog = metadata + governance · Cloud storage = durable storage", s01),
    ("ETL vs ELT in one line?", "ETL transforms before loading; ELT loads raw first and transforms inside the platform.", s02),
    ("Why does ELT fit a lakehouse?", "Cheap storage for huge raw data + distributed compute on demand → keep raw, transform later, rebuild anytime.", s02),
    ("What should you focus on in exam ETL/ELT questions?", "Where the transformation happens — Databricks uses 'ETL' broadly.", s02),
    ("Bounded vs unbounded?", "Bounded = has an END (a file); unbounded = no natural end (Kafka events).", s03),
    ("What is a micro-batch?", "A small group of incoming streaming records processed together as a normal Spark job.", s03),
    ("Does streaming replace Spark's execution model?", "No — each micro-batch runs as job → stages → tasks → partitions (possibly shuffle).", s03),
    ("Incremental processing formula?", "previous state + new/changed input = new state (not recompute from zero).", s04),
    ("Can batch be incremental?", "Yes — e.g. a 02:00 job reading only yesterday's rows is batch + incremental.", s04),
    ("1 TB history, 10 MB nightly, job processes only 10 MB → ?", "Batch + incremental.", s04),
    ("What does a checkpoint remember (conceptually)?", "How far the stream has processed, e.g. 'processed until offset 900' → resume at 901.", s05),
    ("What happens if the checkpoint is reset?", "The stream forgets its progress → replays (duplicates) or wrong resume point.", s05),
    ("What is CDC?", "Capturing only inserts/updates/deletes from a source instead of reloading full snapshots.", s06),
    ("CDC op codes?", "I = INSERT, U = UPDATE, D = DELETE (+ seq for order, key for entity).", s06),
    ("Why not trust arrival order in CDC?", "Arrival order ≠ source modification order; use seq/version.", s06),
    ("Two things every CDC apply needs?", "Ordering/sequencing and a primary/business key.", s06),
    ("Deleted at source, alive in Silver → suspect?", "CDC/delete handling: delete not captured or not applied.", s06),
    ("SCD Type 1?", "Overwrite — keep only the current state.", s07),
    ("SCD Type 2?", "Keep history: one row per version with valid_from / valid_to (NULL/current = latest).", s07),
    ("Current Databricks CDC API name? Old name?", "AUTO CDC (and AUTO CDC FROM SNAPSHOT); older name APPLY CHANGES.", s07),
    ("Schema enforcement?", "Validate on write and reject data that breaks the schema contract (Delta does this by default).", s08),
    ("Schema evolution?", "A controlled, explicit change of the schema — e.g. add column, rename/drop, type widening.", s09),
    ("Enforcement vs evolution — opposites?", "No: enforcement + explicit evolution policy.", s09),
    ("Schema mismatch decision tree?", "Source changed? yes → intentional? yes evolve carefully / no source bug; no → parsing/type-inference bug.", s09),
    ("Worst reaction to a schema change?", "Blindly enabling every schema evolution everywhere.", s09),
    ("Bronze purpose?", "Keep source data as faithfully as possible — for audit, reprocessing, debugging, rebuilds.", s10),
    ("Silver purpose?", "Cleaned, validated, deduplicated, CDC-applied, reusable data.", s10),
    ("Gold purpose?", "Business-shaped aggregates/models for specific consumers (daily_sales, lifetime value).", s10),
    ("What distinguishes the medallion layers?", "Semantics / quality / purpose — not file format (all can be Delta).", s11),
    ("Typical Lakeflow types per layer?", "Bronze: streaming tables · Silver: streaming tables or MVs · Gold: materialized views.", s11),
    ("Malformed records go where?", "Usually Bronze or a quarantine layer — never silently dropped.", s11),
]:
    C.card(q, a, s)

C.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch02.json"))
