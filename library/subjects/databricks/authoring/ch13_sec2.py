# -*- coding: utf-8 -*-
"""ch13 Structured Streaming - theory sections 9-16."""


def build(ch):
    # ------------------------------------------------------------------ s09
    ch.sec(9, "Checkpoint Internals: Offsets, Commits, State & Query Identity",
           "In Chapter 2 the checkpoint was 'where I stopped'. Now we open the box — and see why it is part of the query's identity.")
    ch.p("The Databricks docs say a checkpoint directory contains at least **offsets**, **commits** and, for stateful workloads, **state** metadata/content.")
    ch.diagram("""
checkpoint/
│
├── offsets/    what range each micro-batch READS
├── commits/    which micro-batches were WRITTEN to the sink
├── state/      state-store data of stateful operators
└── metadata    the query's identity""", "Inside a checkpoint")
    ch.terms([("Offset", "The source's 'how far have I read?'. Kafka: partition 0 → offset 1050, partition 1 → offset 2040. File/Auto Loader sources have an equivalent progress concept."),
              ("Commit log", "Record of the micro-batches that have successfully committed to the sink — a key part of exactly-once semantics."),
              ("State", "State-store metadata/content for stateful operators (counts per customer, open windows, join buffers, dedup keys)."),
              ("Metadata", "Identifies the query; changing it effectively means a different query.")])
    ch.p("**Offsets**: the checkpoint keeps the source offsets / progress for **each micro-batch**. **Commits**: suppose micro-batch 42 processed source range X — the checkpoint must also know *'was batch 42 written successfully to the sink?'*.")
    ch.p("**State in the checkpoint**: for `events.groupBy(\"customer_id\").count()`, after a restart Spark must remember customer_1 = 120, customer_2 = 50 … Without it, a new event for customer_1 wouldn't know the previous total was 120.")
    ch.callout("exam", "Trap: what a checkpoint stores",
               "Progress **offsets**, **commits** and **state** information (plus query metadata) — **not** just a 'last timestamp'.")
    ch.p("**Why stateful queries are harder to change.** The checkpoint's state has a schema: key = customer_id, value = count. Change the code to key = country, value = sum(amount) and you can't necessarily reuse the same checkpoint. Databricks has explicit restrictions on what may change between restarts from the same checkpoint.")
    ch.callout("key", "A checkpoint is not a generic reusable folder",
               "It encodes the **query identity and state**. One checkpoint ↔ one query. Never share it between two streams.")
    ch.p("**Deleting the checkpoint** (or changing `checkpointLocation`) makes the next run start as a **new query**: query identity, progress and state are gone.")
    ch.flow(["reprocessing", "duplicate external side effects", "loss of accumulated state", "full rebuild required"],
            "What a lost checkpoint can mean (per pipeline)")
    ch.table(["Change between deployments", "Checkpoint reuse"],
             [["Some stateless filters / projections", "Often OK — depends on the exact query"],
              ["State keys (groupBy columns)", "❌ dangerous / incompatible"],
              ["State schema (agg functions, value columns)", "❌ dangerous / incompatible"],
              ["Source type (Kafka → Delta…)", "❌ incompatible"],
              ["Number/type of stateful operators", "❌ incompatible"]],
             "Checkpoint & code deployment")
    ch.callout("warn", "Rule for deployments",
               "Never assume 'same checkpoint' means 'new code will pick up seamlessly'. Consult the compatibility rules and **test stateful deployments** carefully.")
    ch.p("**Stateful restart from a new checkpoint.** If you change the state architecture, the old checkpoint is incompatible and you may need **new checkpoint + full recomputation/backfill**. That is expensive — which is why **state schema is effectively production data**.")
    ch.ask("Ask yourself before deploying a change to a streaming query",
           ["Is this query stateless or stateful?",
            "Does my change touch state keys, state schema, the source type or the stateful operators?",
            "If the checkpoint becomes incompatible, can I afford a new checkpoint + backfill?",
            "Have I tested the restart from the existing checkpoint in a non-prod copy?"])
    ch.callout("tip", "Sandbox lab: checkpoint reset",
               "Run a stream, then restart it with a **new checkpoint location**: it behaves as a brand-new stream. That proves the checkpoint is part of query identity. **Only in a sandbox** — never casually in production.")
    ch.reveal("Think first: you delete the checkpoint of an append Bronze→Silver stream reading a Delta table and restart. What do you expect in Silver?",
              "The query starts as new, so it re-reads the source from its starting point and **re-appends rows already written → duplicates** (and any stateful results restart from zero).")

    # ------------------------------------------------------------------ s10
    ch.sec(10, "Exactly-once: What It Really Means (and Streaming Dedup)",
           "Exactly-once is a precise engine guarantee with sharp edges — not a promise that duplicates can't exist.")
    ch.p("For a managed **Delta streaming sink**, three things cooperate so that a retried micro-batch never becomes a partial or duplicate commit:")
    ch.flow(["source offsets", "checkpoint commits", "Delta transaction log"], "The exactly-once trio")
    ch.p("Databricks states the Delta streaming sink provides **exactly-once processing guarantees**, even with concurrent streams or batch queries on the table.")
    ch.p("**Failure scenario**: micro-batch 20 reads events 1000–1100 and writes to Delta. The system crashes exactly at the boundary. On restart the engine must decide: *was batch 20 committed?*")
    ch.diagram("""
1. write offsets/20  (plan: read 1000–1100)
2. process batch 20
3. Delta commit (tagged with query id + batch 20)
4. write commits/20
        ✗ crash somewhere
restart: offsets/20 exists, commits/20 missing
  → batch 20 already in the Delta log?  skip it
  → not in the log?                     retry it
NEVER: "half applied twice\"""", "Restart decision")
    ch.callout("key", "Exactly-once stops at the boundaries",
               "`foreachBatch(send_email)` sends 100 emails, then the process crashes before the checkpoint commit. On retry the same batch runs again → **emails sent again**. The email service has no Delta transaction semantics. Structured Streaming exactly-once ≠ every arbitrary side effect exactly once.")
    ch.p("Databricks stresses that exactly-once guarantees in managed Delta flows **stop at the edges** — custom or non-transactional sinks. There you must make the write **idempotent**.")
    ch.callout("pitfall", "Exactly-once ≠ no duplicate source events",
               "Kafka can deliver `event_id=123` twice as **two distinct records**. The engine processes each input record exactly once — and both duplicates land in the table. **Processing guarantee ≠ business deduplication** (same lesson as Auto Loader files, Chapter 12).")
    ch.p("**Streaming deduplication.** The simple version:")
    ch.code("python", 'unique = events.dropDuplicates(["event_id"])', "Correct result — unbounded state")
    ch.p("Problem: to know whether `event_id=123` has **ever** appeared, Spark must remember every event ID **forever** → unbounded state. You usually need a **watermark / time bound**:")
    ch.code("python", 'unique = (\n    events\n        .withWatermark("event_time", "1 hour")\n        .dropDuplicates(["event_id", "event_time"])\n)', "Dedup state cleaned as event time progresses")
    ch.p("Including the watermarked `event_time` column in the dedup keys lets Spark drop old keys once the watermark passes them. **Deduplication is a stateful operation.**")
    ch.callout("tip", "dropDuplicatesWithinWatermark",
               "Newer Spark/Databricks runtimes also offer `events.withWatermark(\"event_time\", \"1 hour\").dropDuplicatesWithinWatermark([\"event_id\"])` — dedups on the key alone for duplicates arriving within the watermark delay, even if their timestamps differ slightly. (Standard API, beyond the source; the source's pattern above is the classic one.)")
    ch.ask("Ask yourself when someone says 'it's exactly-once, so no duplicates'",
           ["Is the sink a managed Delta sink, or a custom / foreachBatch / external sink?",
            "Could the source itself contain the same business event twice?",
            "Was the checkpoint ever reset or changed?",
            "Is there any non-idempotent side effect (emails, API calls, balance += x)?"])
    ch.reveal("Think first: Q18 — 'Exactly-once Delta sink means the source cannot contain duplicates.' True?",
              "**No.** Processing guarantees don't deduplicate semantically duplicated input records. Two records with the same event_id are two records to the engine.")

    # ------------------------------------------------------------------ s11
    ch.sec(11, "Streaming Joins: Stream-Static & Stream-Stream",
           "Joining a live stream to a table is easy; joining two live streams forces Spark to wait — and waiting costs state.")
    ch.p("**Stream-static join**: live `orders` stream + a relatively static `products` table. Very common for enrichment.")
    ch.code("python", 'products = spark.table("ecommerce.silver.products")   # static (batch) side\n\nenriched = (\n    orders_stream\n        .join(products, "product_id")\n)', "stream events + static dimension → enriched stream")
    ch.callout("warn", "Static side semantics",
               "If the static table changes, behaviour depends on the query/execution semantics and refresh architecture. With a Delta static side, **new** micro-batches may join against a newer version — but a long-running stream does **not** magically recompute already-written outputs because a dimension changed. If correctness requires recomputation when dimensions change, materialized/declarative pipeline patterns (Phase 6) may fit better.")
    ch.p("**Stream-stream join**: `orders` stream + `payments` stream, matched on `order_id`. The order event arrives at 10:00, the payment at 10:02 → Spark must keep the **order in state** until its payment arrives. For how long? Forever? Without a watermark/time condition, state can grow **without bound**.")
    ch.code("python", 'from pyspark.sql import functions as F\n\norders_w   = orders.withWatermark("order_time", "30 minutes")\npayments_w = payments.withWatermark("payment_time", "30 minutes")\n\njoined = orders_w.alias("o").join(\n    payments_w.alias("p"),\n    F.expr("""\n        o.order_id = p.order_id AND\n        p.payment_time BETWEEN o.order_time\n                           AND o.order_time + INTERVAL 1 HOUR\n    """),\n    "inner")',
            "Key + time relationship + watermarks on both sides")
    ch.p("The join condition contains **key + time relationship**: same `order_id` **and** the payment occurs within the expected time range. Databricks recommends **watermarks on both inputs** so obsolete state can be discarded.")
    ch.callout("exam", "Trap: watermarks and outer joins",
               "For stream-stream **outer** joins a watermark (plus a time constraint) is **required**: the engine must know when an unmatched record can be considered final and emitted with NULLs.")
    ch.p("**Multiple watermarks.** orders: 10 min delay, payments: 1 hour delay. Spark must compute **one global watermark**. The default policy is **min** — the slowest stream decides progress. You can choose **max**, but then records of the slower stream may be dropped; Databricks warns to use it with care.")
    ch.code("python", 'spark.conf.set("spark.sql.streaming.multipleWatermarkPolicy", "min")   # default\n# "max" = faster progress, but slow-stream records may be dropped', "The policy setting")
    ch.diagram("""
orders watermark   → 14:00
payments watermark → 13:00
policy max: global 14:00 → state for 13:xx may be dropped
            but payments for 13:xx can still arrive  ✗
policy min: global 13:00 → follows the SLOWEST input  ✓""", "Why 'min' protects correctness")
    ch.ask("Ask yourself before writing a stream-stream join",
           ["How long can a matching record from the other stream arrive after this one?",
            "Do both inputs have a watermark on their event-time column?",
            "Does my join condition include a time range, not just the key?",
            "Is it an outer join (then watermark + time constraint are mandatory)?",
            "Will the global watermark (min) be held back by a slow input?"])
    ch.reveal("Think first: why do stream-stream joins need state at all, when stream-static joins don't buffer the stream?",
              "Because a record from one stream may need to **wait** for a later matching record from the other stream. The static side is fully available every batch; a stream side isn't.")

    # ------------------------------------------------------------------ s12
    ch.sec(12, "Delta as Streaming Source & Sink: Changes and Retention",
           "Delta-to-Delta streaming is the backbone of medallion pipelines — with two operational landmines.")
    ch.code("python", 'bronze = spark.readStream.table("ecommerce.bronze.events")', "Stream the additions of a Bronze Delta table downstream")
    ch.p("Delta tables can be both **sources** and **sinks** of Structured Streaming. A Bronze table that keeps receiving rows can feed Silver incrementally.")
    ch.callout("warn", "Delta source is append-oriented",
               "A simple Delta streaming source naturally streams **appends**. If the source table gets **UPDATE / DELETE / MERGE**, downstream semantics need more care. For row-level changes, **Change Data Feed** is often the right tool (joined with CDC later).")
    ch.p("Accuracy note (standard Delta behaviour): by default a commit that changes existing data in the source makes the stream **fail** rather than silently re-emit rewritten files. The option `skipChangeCommits` ignores such commits (their changes are **not** propagated); reading the **Change Data Feed** propagates them properly.")
    ch.code("python", '# ignore update/delete commits (changes NOT propagated)\nspark.readStream.option("skipChangeCommits", "true").table("ecommerce.bronze.events")\n\n# propagate row-level changes via Change Data Feed\nspark.readStream.option("readChangeFeed", "true").table("ecommerce.silver.customers")',
            "Two ways to handle non-append source commits")
    ch.p("**Source retention caveat.** If a stream reading a Delta source is stopped much longer than the source's retention, the files/history it needs may be **vacuumed** — it may never catch up.")
    ch.diagram("""
Friday:        stream stops (checkpoint: "I need version X")
source:        VACUUM retention = 7 days
2 weeks later: restart
               version X files no longer exist
→ stream cannot recover incrementally""", "Retention vs a stopped stream")
    ch.callout("key", "Run at least once per retention window",
               "Databricks: a stream must run **at least once within the source retention window**, otherwise it may fail with a **missing-file** error and need a reset/full refresh. Design streaming operations and source retention **together**.")
    ch.callout("pitfall", "Don't 'fix' missing files with ignoreMissingFiles",
               "Do **not** set `spark.sql.files.ignoreMissingFiles=true` as a workaround for a stream that fell behind Delta retention — Databricks warns it can produce **silent incorrect results**. Correct fix: **increase retention**, or **recover/rebuild** the stream appropriately. Never suppress a correctness error.")
    ch.code("sql", "ALTER TABLE ecommerce.bronze.events SET TBLPROPERTIES (\n  'delta.logRetentionDuration'         = 'interval 30 days',\n  'delta.deletedFileRetentionDuration' = 'interval 14 days'\n);",
            "Increasing retention so a stopped stream can still catch up")
    ch.ask("Ask yourself when a Delta-source stream fails after a long stop",
           ["How long was the stream stopped, compared with the source's retention settings?",
            "Did a VACUUM run on the source in the meantime (DESCRIBE HISTORY)?",
            "Is the error about missing files for a version the checkpoint still needs?",
            "Am I tempted to flip ignoreMissingFiles — and do I understand that hides data loss?"])
    ch.reveal("Think first: Q28 — why can a stream fail if it was stopped beyond Delta retention?",
              "Because the source versions/files it still needs to read were **vacuumed** before the stream caught up. The checkpoint points to data that physically no longer exists.")

    # ------------------------------------------------------------------ s13
    ch.sec(13, "foreachBatch, Streaming MERGE & Idempotency",
           "foreachBatch turns each micro-batch into an ordinary DataFrame — full power, full responsibility.")
    ch.code("python", 'def process_batch(batch_df, batch_id):\n    ...\n\nquery = (\n    stream_df.writeStream\n        .foreachBatch(process_batch)\n        .option("checkpointLocation", checkpoint)\n        .start()\n)', "The bridge between streaming and batch APIs")
    ch.flow(["stream", "micro-batch → batch DataFrame", "your function(batch_df, batch_id)"], "Per micro-batch")
    ch.p("Inside the function you can use **batch-only** operations: **MERGE**, complex Delta DML, custom sink logic.")
    ch.code("python", 'from delta.tables import DeltaTable\n\ndef upsert(batch_df, batch_id):\n    target = DeltaTable.forName(spark, "ecommerce.silver.customers")\n    (target.alias("t")\n        .merge(batch_df.alias("s"), "t.customer_id = s.customer_id")\n        .whenMatchedUpdateAll()\n        .whenNotMatchedInsertAll()\n        .execute())\n\nquery = (\n    changes.writeStream\n        .foreachBatch(upsert)\n        .option("checkpointLocation", checkpoint)\n        .start()\n)', "The classic streaming-upsert pattern")
    ch.callout("pitfall", "foreachBatch must be idempotent",
               "If batch 10 retries, your function **may execute again**. `balance = balance + incoming_amount` twice → wrong. `MERGE` by a stable business key/version → can be idempotent. foreachBatch gives power, but **you** become responsible for sink-side idempotency.")
    ch.compare(("Not idempotent", ["`balance = balance + amount`", "INSERT/append without a key", "send_email(), call_api()", "Replay = applied twice"]),
               ("Idempotent", ["MERGE on business key (+ version)", "overwrite of a deterministic partition", "Upsert where replay gives the same end state", "Replay = same result"]))
    ch.p("**batch_id** can help some external-sink patterns recognise a **replayed** batch. But don't treat batch_id alone as a universal business dedup key — the safest design depends on the target system.")
    ch.callout("tip", "Delta's built-in idempotent foreachBatch writes",
               "For plain Delta writes inside foreachBatch, Delta supports the writer options `txnAppId` (a stable id for the query) and `txnVersion` (e.g. the batch_id) so a replayed batch is skipped. (Standard Delta API, beyond the source.)")
    ch.p("**Update-like results to Delta.** A dashboard wants live counts (10:01 → click_count=1, 10:02 → 2). Delta doesn't support streaming update output mode as a sink, so implement update-like semantics with foreachBatch + MERGE:")
    ch.code("python", 'def merge_counts(batch_df, batch_id):\n    target = DeltaTable.forName(spark, "ecommerce.gold.live_event_counts")\n    (target.alias("t")\n        .merge(batch_df.alias("s"),\n               """t.window_start = s.window.start\n                  AND t.event_type = s.event_type""")\n        .whenMatchedUpdateAll()\n        .whenNotMatchedInsertAll()\n        .execute())\n\n(counts.writeStream\n    .outputMode("update")          # emit changed aggregates to the function\n    .foreachBatch(merge_counts)\n    .option("checkpointLocation", ckpt)\n    .start())',
            "Window aggregates upserted into Delta")
    ch.callout("key", "Why update mode is fine here",
               "The **sink** is now your function, not the Delta sink — so `outputMode(\"update\")` simply hands each batch's **changed** aggregate rows to the function, which MERGEs them. (In practice flatten `window.start` into a real `window_start` column to match the target schema.)")
    ch.ask("Ask yourself before shipping a foreachBatch function",
           ["If this exact batch runs twice, is the end state the same?",
            "Am I merging on a stable business key (and version/sequence)?",
            "Do I trigger external side effects that can't be rolled back?",
            "Can the micro-batch contain several rows per key that must be deduplicated before MERGE?"])
    ch.reveal("Think first: Q20 — why can foreachBatch duplicate external side effects even though the stream is 'exactly-once'?",
              "A failed/retried batch may invoke the function again, and external sinks don't participate in Spark/Delta transaction semantics. Solution (Q21): make side effects **idempotent** — business key/version, or transactional sink semantics.")

    # ------------------------------------------------------------------ s14
    ch.sec(14, "Performance: Latency, Throughput, Backlog, Small Files & Skew",
           "A stream must not only be correct — every micro-batch must finish fast enough to keep up with arrivals.")
    ch.compare(("Small micro-batches (every 1 s)", ["✅ lower latency", "❌ more scheduling overhead", "❌ more frequent commits", "❌ more storage API calls", "❌ smaller output files"]),
               ("Large micro-batches (every 1 min)", ["✅ better throughput efficiency", "✅ larger batches, less overhead", "❌ higher latency"]))
    ch.flow(["latency", "throughput", "cost", "state size", "correctness"], "Streaming design always balances")
    ch.p("**Small files in streaming**: every tiny micro-batch writing to Delta → batch 1 → 2 MB file, batch 2 → 3 MB, batch 3 → 1 MB … → **small-file pressure**.")
    ch.callout("tip", "Physical maintenance still matters",
               "Delta can compact later (**OPTIMIZE**, **predictive optimization**), and Delta's streaming integration addresses transactional and small-file concerns — but choose the latency requirement sensibly. Don't trigger every second if every minute is enough.")
    ch.p("**Backpressure / backlog**: the source produces **50 MB/s**, the pipeline processes **20 MB/s** → **+30 MB/s** backlog.")
    ch.callout("key", "No checkpoint magic fixes throughput",
               "A checkpoint preserves correctness/progress; it does not create processing capacity. Sustained input > processing → latency ↑, backlog ↑, and eventually **source retention may be exceeded**.")
    ch.ul(["more processing capacity", "a better (cheaper) query", "larger batches", "less state", "better partitioning", "reduce skew"])
    ch.p("**Micro-batch = Spark job**, so it suffers the exact same issues as batch: skew, shuffle, bad joins, too few or too many partitions, spill, executor OOM, driver OOM. Streaming adds one more dimension: **it must finish fast enough to keep up**.")
    ch.diagram("""
trigger intended: 5 s
99 partitions → finish in 2 s
 1 partition  → takes 30 s   (skew)
→ every micro-batch ≥ 30 s → backlog grows""", "Skew in a stream (Phase 1 meets Phase 5)")
    ch.p("**Stateful + skew is especially bad.** One key `user_id = \"anonymous\"` holds 70% of events; `.groupBy(\"user_id\")` creates a **hot state partition**.")
    ch.ul(["one task slow", "one state partition huge", "spill", "increasing latency"])
    ch.callout("key", "Key design matters in streaming",
               "Streaming partition/key design decides whether state is spread evenly. A hot key in state hurts every single micro-batch, forever.")
    ch.ask("Ask yourself when a stream can't keep up",
           ["Is input rate permanently higher than processing rate, or was it a burst?",
            "Is one task (or one state partition) much slower than the rest?",
            "Is my trigger so small that overhead and tiny files dominate?",
            "Will the backlog outlive the source's retention?"])
    ch.reveal("Think first: Q31 — input rate permanently exceeds processing rate. Would a checkpoint fix this?",
              "No. Checkpoint preserves correctness/progress; it doesn't create processing capacity. Backlog and latency keep growing (Q30) until you add capacity or make the query cheaper.")

    # ------------------------------------------------------------------ s15
    ch.sec(15, "Monitoring & the Production Debugging Tree",
           "Streaming bugs show up as numbers: rates, durations, state rows, the watermark. Read them before you restart anything.")
    ch.code("python", 'query.status          # what is the query doing right now?\nquery.lastProgress    # metrics of the last micro-batch (dict/JSON)\nquery.recentProgress  # list of recent progress reports',
            "Code-level monitoring")
    ch.code("json", '{\n  "batchId": 812,\n  "numInputRows": 1500000,\n  "inputRowsPerSecond": 100000.0,\n  "processedRowsPerSecond": 40000.0,\n  "durationMs": {"triggerExecution": 37500},\n  "eventTime": {"watermark": "2026-09-28T10:15:00.000Z"},\n  "stateOperators": [{"numRowsTotal": 48210933}]\n}',
            "Illustrative lastProgress fields worth knowing")
    ch.table(["Metric", "What it tells you"],
             [["input rows / inputRowsPerSecond", "How fast data arrives"],
              ["processedRowsPerSecond", "How fast you process it"],
              ["batch duration", "Is each micro-batch keeping up with the trigger?"],
              ["state rows (numRowsTotal)", "Is state bounded or growing forever?"],
              ["watermark", "How far event-time progress has moved"],
              ["shuffle / task skew", "Ordinary Spark problems inside the batch"]],
             "What you care about in Spark UI / Databricks monitoring")
    ch.p("Databricks positions the **Spark UI** (streaming tab) and the **StreamingQueryListener** as the production monitoring mechanisms.")
    ch.callout("key", "Input rate vs processing rate",
               "input 50,000 rows/s, processed 100,000 rows/s → capacity to spare. input 100,000, processed 40,000 **sustained** → backlog grows. Often more useful than staring at cluster CPU.")
    ch.p("**State growth**: batch durations go 10 s → 12 s → 20 s → 40 s → 2 min … while input rate is **stable**. Inspect the stateful operators: is `numRowsTotal` in state increasing forever? Likely: **missing watermark, watermark too long, unbounded key cardinality, bad stateful join**.")
    ch.diagram("""
STREAMING LATENCY HIGH
        ↓
Is input backlog growing?
        ↓ yes
Which micro-batch is slow?
        ↓
Spark stage/task metrics
        ↓
┌──────────────┬───────────────┬───────────────┐
SPARK          STATE           SOURCE/SINK
shuffle        growth          throughput
skew           watermark       API latency
spill          state store     storage
join""", "The production debugging tree")
    ch.callout("key", "Streaming adds three factors",
               "Streaming adds **state**, **source** and **sink** factors on top of ordinary Spark performance (shuffle, skew, spill, join).")
    ch.table(["Case", "First things to check"],
             [["Stream stopped progressing", "query active? source producing? new offsets/files? checkpoint corrupted? sink blocked? state batch stuck? executor failure? permission expired? source retention violated?"],
              ["Batch durations increasing", "state growth, checkpoint overhead, small files/output overhead, source metadata growth, sink slowdown"],
              ["Missing late records", "event_time, max observed event_time, configured watermark, watermark progress, output mode, window boundaries"],
              ["Duplicates after failure", "Delta sink? custom sink? foreachBatch? source duplicates? checkpoint reset? non-idempotent side effect?"],
              ["State store huge", "number of keys, watermark, window duration, late-data tolerance, join time bounds, dedup horizon, stateful key skew"]],
             "The five debugging cases (full playbooks in the Debug tab)")
    ch.ask("Ask yourself when the stream stopped making progress",
           ["Is the query active, or did it terminate with an exception?",
            "Is the source still producing — are new offsets/files available?",
            "Is the checkpoint corrupted or changed?",
            "Is the sink blocked, or a state batch stuck?",
            "Did an executor fail repeatedly?",
            "Did a permission/credential expire?",
            "Was source retention violated while it was stopped?"])
    ch.ask("Ask yourself when batch durations grow but input is stable",
           ["Is state (numRowsTotal) growing every batch?",
            "Is checkpoint/state-store overhead rising?",
            "Are small output files or source metadata growth adding per-batch cost?",
            "Is the sink slowing down?"])
    ch.callout("warn", "Don't restart blindly",
               "When a stream stops progressing, **inspect progress before restarting**. A restart can hide the evidence (and with a changed checkpoint, create duplicates).")
    ch.callout("debug", "Missing late records: don't blame the checkpoint first",
               "Check the event-time chain (event_time → max observed → watermark → output mode → window boundaries). Blame the **checkpoint** only if evidence points there.")
    ch.callout("debug", "State store huge: maybe not a compute problem",
               "The fix isn't necessarily bigger compute — maybe the state is **semantically unbounded** (no watermark, no join time bound, infinite dedup horizon).")
    ch.callout("interview", "Exactly-once is end-to-end only when every piece participates",
               "Duplicates after a failure mean some piece didn't participate: a non-transactional sink, a non-idempotent foreachBatch, a duplicating source or a reset checkpoint.")
    ch.ask("Ask yourself when a stream is slow (the tree, as questions)",
           ["Is the input backlog actually growing (input rate vs processed rate)?",
            "Which micro-batch is slow, and since when?",
            "Inside that batch, which stage/task dominates?",
            "Is it a Spark problem (shuffle, skew, spill, join)?",
            "Is it a state problem (growth, watermark, state store)?",
            "Is it a source/sink problem (throughput, API latency, storage)?"])

    # ------------------------------------------------------------------ s16
    ch.sec(16, "Labs, Best-Practice Model & the Phase 5 Mini-Project",
           "Eight small labs make the engine visible; one design checklist and one mini-project glue Phase 5 together.")
    ch.code("python", 'from pyspark.sql import functions as F\n\nevents = (\n    spark.readStream\n        .format("rate")\n        .option("rowsPerSecond", 10)\n        .load()                       # columns: timestamp, value (0,1,2,...)\n)\ntransformed = events.withColumn("group_id", F.col("value") % 5)',
            "Lab 1 — rate source: synthetic stream, no external ingestion complexity")
    ch.code("python", 'positive = (\n    events\n        .filter("value % 2 = 0")\n        .select("timestamp", "value")\n)', "Lab 2 — stateless: no aggregate state, each record independent")
    ch.code("python", 'counts = (\n    events\n        .withColumn("group_id", F.col("value") % 5)\n        .groupBy("group_id")\n        .count()\n)   # Spark must remember 0 → count, 1 → count, ...',
            "Lab 3 — stateful aggregate: inspect progress/state metrics")
    ch.code("python", 'windowed = (\n    events\n        .withWatermark("timestamp", "30 seconds")\n        .groupBy(F.window("timestamp", "10 seconds"))\n        .count()\n)', "Lab 4 — event-time windows: watch when windows appear/finalize per output mode")
    ch.code("python", 'stream_df = spark.readStream.table("ecommerce.bronze.orders")\n(\n    stream_df.writeStream\n        .trigger(availableNow=True)\n        .option("checkpointLocation",\n                "/Volumes/ecommerce/system/orders_to_silver")\n        .toTable("ecommerce.silver.orders_incremental")\n)\n# run again with no new data → nothing new to process',
            "Lab 5 — AvailableNow on Delta")
    ch.p("**Lab 6 — intentional checkpoint reset** (sandbox only): run the stream, then use a **new checkpoint location** → the query behaves as a new stream. Proof that the checkpoint is part of query identity.")
    ch.p("**Lab 7 — late data**: controlled events, arrival order 10:01 (event_time 10:01), 10:02 (10:02), 10:20 (event_time 10:03). Try watermark = 5 min and = 30 min and observe whether the late record can still affect state.")
    ch.callout("warn", "Make Lab 7 actually show the difference",
               "With only those three events, the max event time seen is **10:02**, so the 10:03 event isn't late in event-time terms under either watermark — it arrived 18 minutes late on the wall clock, but lateness is relative to event-time progress. Add an on-time event with event_time ≈ 10:20 **before** it (and let a micro-batch pass so the watermark advances): then 5 min → watermark ≈ 10:15 → dropped; 30 min → ≈ 09:50 → accepted.")
    ch.code("python", 'def inspect_batch(df, batch_id):\n    print(f"Batch: {batch_id}")\n    print(f"Rows: {df.count()}")\n\nquery = (\n    events.writeStream\n        .foreachBatch(inspect_batch)\n        .start()\n)   # prints Batch 0, Batch 1, Batch 2, ...',
            "Lab 8 — foreachBatch: micro-batches become physically visible")
    ch.table(["Design question", "Ask"],
             [["SOURCE", "What are its ordering/duplicate guarantees?"],
              ["EVENT TIME", "Which timestamp represents reality?"],
              ["LATE DATA", "How late can valid records arrive?"],
              ["STATE", "What information must be remembered?"],
              ["WATERMARK", "When can old state safely disappear?"],
              ["TRIGGER", "How much latency do we need?"],
              ["SINK", "Can it commit idempotently?"],
              ["CHECKPOINT", "Where is durable progress/state stored?"],
              ["RETENTION", "Can the source retain data long enough to recover?"]],
             "Best-practice mental model — design these TOGETHER")
    ch.callout("key", "Not independent choices",
               "Late-data tolerance sets the watermark, which bounds the state, which drives cost; the trigger sets latency and file sizes; retention must exceed your longest possible stop. Change one, re-check the others. Memory hook: **S-E-L-S-W-T-S-C-R** (\"**S**treams **E**at **L**ate **S**tate, **W**atch **T**he **S**ink, **C**heck **R**etention\").")
    ch.p("**Phase 5 mini-project** — extend the e-shop project:")
    ch.flow(["Auto Loader", "ecommerce.bronze.events", "Structured Streaming clean/validate", "ecommerce.silver.events", "window aggregation", "ecommerce.gold.events_5min"])
    ch.code("python", 'bronze = spark.readStream.table("ecommerce.bronze.events")\n\nsilver = (\n    bronze\n        .filter("event_id IS NOT NULL")\n        .filter("event_time IS NOT NULL")\n)\n(\n    silver.writeStream\n        .trigger(availableNow=True)\n        .option("checkpointLocation",\n                "/Volumes/ecommerce/system/bronze_to_silver_events")\n        .toTable("ecommerce.silver.events")\n)',
            "Bronze → Silver (stateless, AvailableNow)")
    ch.code("python", 'gold = (\n    spark.readStream\n        .table("ecommerce.silver.events")\n        .withWatermark("event_time", "20 minutes")\n        .groupBy(F.window("event_time", "5 minutes"), "event_type")\n        .agg(F.count("*").alias("events"))\n)\n(\n    gold.writeStream\n        .outputMode("append")\n        .option("checkpointLocation",\n                "/Volumes/ecommerce/system/events_gold_5min")\n        .toTable("ecommerce.gold.events_5min")\n)',
            "Silver → Gold (stateful, watermark + 5-min windows, append)")
    ch.callout("warn", "Running the mini-project on serverless",
               "The Gold query above uses the **default** trigger. On serverless notebooks/jobs only AvailableNow (and deprecated Once) are supported, so add `.trigger(availableNow=True)` there too and schedule it — or run it on classic compute / a Lakeflow pipeline.")
    ch.p("Then test it **deliberately** with:")
    ch.ol(["on-time events", "late events within the watermark", "very late events (beyond the watermark)", "a stream restart", "a new checkpoint (sandbox only)",
           "duplicate business events", "a prolonged stop that approaches source retention"])
    ch.callout("interview", "Q35 — How would you explain Structured Streaming?",
               "Structured Streaming treats an unbounded data source as an **incrementally growing table**. You define transformations with Spark's DataFrame model; the engine executes newly available data in **micro-batches** or supported low-latency modes. **Checkpoints** track source progress and commits, **state stores** preserve intermediate state for aggregations, joins and deduplication, and **watermarks** bound that state and define lateness tolerance for event-time processing.")
    ch.reveal("Think first: in the mini-project, why is Bronze→Silver fine with AvailableNow and no watermark, while Silver→Gold needs one?",
              "Bronze→Silver is **stateless** (filters) — only progress is tracked. Silver→Gold is a **windowed aggregation in append mode**: without a watermark the windows could never be finalized (append isn't even allowed) and state would grow forever.")
