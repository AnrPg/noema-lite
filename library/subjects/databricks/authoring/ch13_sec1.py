# -*- coding: utf-8 -*-
"""ch13 Structured Streaming - theory sections 1-8."""


def build(ch):
    # ------------------------------------------------------------------ s01
    ch.sec(1, "Streaming From First Principles: the Unbounded Table",
           "Structured Streaming is not a different Spark — it is the same engine running over data that never ends.")
    ch.p("**Batch**: the input is known now (A, B, C, D). You process it, you get a result, you **stop**. The dataset is **bounded**.")
    ch.p("**Streaming**: at 10:00 A and B arrive, at 10:01 C, at 10:02 D and E, at 10:03 F … You don't know where it ends. The dataset is logically **unbounded**.")
    ch.diagram("""
BATCH (bounded)            STREAMING (unbounded)
 A B C D                    10:00  A B
   │ process                10:01  C
   ▼                        10:02  D E
 result → STOP              10:03  F
                            ...    (no END)""", "Bounded vs unbounded input")
    ch.callout("key", "The unbounded table model",
               "Think of a stream as a **table that keeps growing**: every new event is a new row appended at the bottom. Your query is defined once over that table; the engine runs it **incrementally** over the new rows.")
    ch.p("Because of that model you can write streaming transformations **almost like batch DataFrames**:")
    ch.code("python", 'result = (\n    stream_df\n        .filter("amount > 0")\n        .groupBy("country")\n        .count()\n)',
            "Looks like batch — runs incrementally")
    ch.p("The difference is hidden in the engine: Spark keeps **execution progress** and, where needed, **intermediate state** between different arrivals of data.")
    ch.p("The mental model of this whole chapter, top to bottom:")
    ch.diagram("""
STREAMING SOURCE
      ↓
readStream
      ↓
incremental DataFrame plan
      ↓
trigger
      ↓
micro-batch / real-time execution
      ↓
stateless or stateful operators
      ↓
writeStream
      ↓
sink
      │
      └── checkpoint: remembers progress + state""", "The Phase 5 mental model")
    ch.callout("exam", "Why can streaming reuse batch DataFrame syntax?",
               "Because Structured Streaming uses Spark's **DataFrame / query-planning execution model**, applied **incrementally** over unbounded input. Same planner, same jobs/stages/tasks — just re-run on new data.")
    ch.terms([("Bounded dataset", "Input with a known end (yesterday's orders.csv). Process once, then stop."),
              ("Unbounded dataset", "Input that logically keeps growing (Kafka topic, files landing forever)."),
              ("Stateless vs stateful", "Whether the query must remember information from previous micro-batches (see section 5)."),
              ("Checkpoint", "Durable storage of progress (offsets, commits) and state — the stream's memory.")])
    ch.callout("tip", "What this chapter builds on",
               "Batch vs streaming basics: Chapter 2. Partitions, skew and Spark UI: Chapter 9. Auto Loader specifics (cloudFiles, schemaLocation, file discovery): Chapter 12. Here we go **underneath** Auto Loader into the Structured Streaming engine itself.")
    ch.reveal("Think first: is a nightly job that only processes new rows 'streaming'?",
              "Not necessarily. Streaming describes an **unbounded input + incremental engine**. You'll see in section 4 that the streaming engine can even run as a scheduled job that stops (`availableNow`).")

    # ------------------------------------------------------------------ s02
    ch.sec(2, "readStream, writeStream & the Lazy Start",
           "One word — readStream instead of read — changes the whole execution model.")
    ch.compare(("Batch read", ['`spark.read.format("json").load(path)`', '"Read whatever exists **now**."', "Bounded batch DataFrame", "Ends when the files are read"]),
               ("Streaming read", ['`spark.readStream.format("json").schema(schema).load(path)`', '"Treat this source as **continuously evolving** and track my progress."', "Streaming DataFrame", "Never 'ends' by itself"]))
    ch.code("python", 'df = (\n    spark.readStream\n        .format("json")\n        .schema(schema)      # streaming file sources need a schema\n        .load(path)\n)',
            "First streaming DataFrame")
    ch.callout("exam", "Trap: read vs readStream",
               "`spark.read` → **bounded batch read**. `spark.readStream` → **streaming source**. Simple, but frequently tested — and calling `.writeStream` on a batch DataFrame fails.")
    ch.p("**readStream does not start anything.** It is Spark lazy evaluation again: it only builds a streaming DataFrame / logical plan.")
    ch.code("python", 'events = spark.readStream.format(...).load(...)   # plan only\n\nquery = (\n    events.writeStream\n        .format("delta")\n        .option("checkpointLocation", checkpoint)\n        .toTable("ecommerce.bronze.events")   # <- starts the query\n)',
            "Execution starts at the sink")
    ch.flow(["readStream → define source", "transformations → define computation", "writeStream → define sink", "toTable()/start() → START the query"],
            "Who does what")
    ch.p("`toTable(name)` starts a query that writes into a table; `start()` starts a query whose sink is given by `format(...)`/path or by `foreachBatch`. Both return a **StreamingQuery** handle.")
    ch.p("A full stream always has three parts: **SOURCE → TRANSFORMATION → SINK**.")
    ch.code("python", 'events = spark.readStream.table("ecommerce.bronze.events")          # SOURCE\n\nclean = events.filter("event_type IS NOT NULL")                      # TRANSFORMATION\n\nquery = (\n    clean.writeStream\n        .option("checkpointLocation", checkpoint)\n        .toTable("ecommerce.silver.events")                         # SINK\n)',
            "Source → transformation → sink, Delta to Delta")
    ch.table(["Handle call", "What it gives you"],
             [["`query.status`", "What the query is doing right now (e.g. waiting for data, trigger active?)"],
              ["`query.lastProgress`", "Metrics of the last completed micro-batch (rows, rates, durations, state, watermark)"],
              ["`query.recentProgress`", "A list of the most recent progress reports"],
              ["`query.awaitTermination()`", "Block until the query stops (useful in jobs/scripts)"],
              ["`query.stop()`", "Stop the streaming query"]],
             "The StreamingQuery handle (monitoring in depth: section 15)")
    ch.callout("pitfall", "No checkpoint = no memory",
               "Every production `writeStream` needs a durable `checkpointLocation` (e.g. a path in a Volume). It is how the query remembers progress across restarts (section 9).")
    ch.reveal("Think first: you run a cell that only contains `events = spark.readStream...load(path)`. Does Spark read any file?",
              "No. Like any transformation, it just defines a plan. Nothing executes until a streaming sink is started with `writeStream ... toTable()/start()` (or a notebook `display()` starts a query for you).")

    # ------------------------------------------------------------------ s03
    ch.sec(3, "Micro-batches & the processingTime Trigger",
           "Spark doesn't launch a job per event — it groups arrivals into small batches. Every batch lesson you learned still applies.")
    ch.p("Events arrive at 12:00:00 (e1), 12:00:01 (e2), 12:00:02 (e3), 12:00:03 (e4), 12:00:04 (e5). Spark doesn't need a new distributed job for each event — it **groups** them.")
    ch.diagram("""
arrivals:  e1  e2  e3  e4  e5
           └─┬─┘   └─┬─┘   │
Micro-batch 1: e1 e2
Micro-batch 2: e3 e4
Micro-batch 3: e5""", "Micro-batching")
    ch.callout("key", "Micro-batch = a small Spark job",
               "A **micro-batch** is a bounded chunk of newly available stream data, executed as a Spark job. new input → micro-batch N → job → stages → tasks → partitions.")
    ch.p("So everything from Chapter 9 still applies inside every batch: **job, stage, task, partition, shuffle, join, spill, skew**.")
    ch.code("python", 'query = (\n    events.writeStream\n        .format("delta")\n        .outputMode("append")\n        .option("checkpointLocation", checkpoint)\n        .trigger(processingTime="5 seconds")\n        .toTable("ecommerce.bronze.events")\n)',
            "5-second micro-batches (classic compute)")
    ch.diagram("""
00–05 s  → batch 0
05–10 s  → batch 1
10–15 s  → batch 2""", "Conceptually, with a 5-second trigger")
    ch.p("The **processingTime** trigger says **how often** Spark tries to start a new micro-batch. It is a schedule for attempts, not a promise of completion.")
    ch.reveal("Think first: the trigger is every 5 seconds, but one micro-batch needs 12 seconds. Does Spark run three batches in parallel to keep up?",
              "No. In the normal sequential micro-batch model, batch 2 starts only **after** batch 1 finishes (0 → 12 s, then the next). A **processing backlog** builds up and latency grows.")
    ch.diagram("""
trigger = every 5 s, batch needs 12 s
Batch 1: |0 ──────────── 12|
Batch 2:                   |12 ──────────── 24|
Batch 3:                                      |24 → ...
→ backlog grows, end-to-end latency grows""", "Batches never overlap")
    ch.callout("debug", "Production signal",
               "Batches consistently longer than the trigger interval mean **ingestion rate > processing capacity**. The trigger can't fix that — only more capacity or a cheaper query can (section 14).")
    ch.ask("Ask yourself when batches overrun the trigger",
           ["Is the batch duration consistently above the trigger interval, or was it one spike?",
            "Is the input rate growing, or is the same input taking longer each batch?",
            "Which stage inside the slow micro-batch dominates (shuffle, skew, state, sink)?"])

    # ------------------------------------------------------------------ s04
    ch.sec(4, "Trigger Types: Default, AvailableNow, Once, Real-time & Serverless",
           "The trigger decides WHEN batches run — including 'catch up, then stop', which is the Data Engineer's favourite.")
    ch.table(["Trigger", "Syntax", "Meaning"],
             [["Default (processingTime = 0)", "no `.trigger(...)`", "Start the next micro-batch as soon as the previous one finishes"],
              ["Fixed interval", '`.trigger(processingTime="10 seconds")`', "Fixed-interval micro-batches"],
              ["AvailableNow", "`.trigger(availableNow=True)`", "Process everything available now (incrementally), then **stop**"],
              ["Once (deprecated)", "`.trigger(once=True)`", "Old 'one batch then stop' — replaced by AvailableNow"],
              ["Real-time mode", "dedicated real-time trigger (supported classic only)", "Ultra-low-latency operational streaming, sub-second targets"]],
             "Today's important trigger models")
    ch.callout("warn", "Once is deprecated",
               "Databricks deprecated `Trigger.Once` in favour of `Trigger.AvailableNow`. Once processes the backlog in a single batch; AvailableNow can split it into several batches (respecting rate limits) and still stops at the end.")
    ch.p("**AvailableNow** in practice: every hour you want *'process all new records since last time, then stop'*.")
    ch.code("python", 'query = (\n    events.writeStream\n        .trigger(availableNow=True)\n        .option("checkpointLocation", checkpoint)\n        .toTable("ecommerce.bronze.events")\n)',
            "Scheduled incremental processing")
    ch.diagram("""
Run 1:  available: A B C   → process A B C → stop
         (checkpoint now knows A B C)
1 hour later
Run 2:  available: D E     → process D E   → stop""", "AvailableNow + checkpoint = incremental batch")
    ch.callout("key", "Streaming ≠ always-on",
               "The streaming engine can power **scheduled incremental batch** jobs. Databricks especially recommends AvailableNow for **serverless jobs**.")
    ch.p("Why use the streaming engine for scheduled batch? You get **incremental source tracking, checkpointing, state management, fault recovery and incremental semantics** for free — instead of hand-writing:")
    ch.code("python", 'last_processed_timestamp = ...          # stored where? updated when?\ndf = spark.sql(f"SELECT * FROM src WHERE event_ts > \'{last_processed_timestamp}\'")',
            "The manual progress tracking AvailableNow replaces")
    ch.p("This is exactly the model Auto Loader uses (Chapter 12): a streaming source + checkpoint + AvailableNow on a schedule.")
    ch.p("**Real-time mode** (classic Databricks) targets **sub-second end-to-end latency** for ultra-low-latency operational workloads in supported scenarios. It is **not** the default choice for ordinary lakehouse ETL — micro-batch or AvailableNow is simpler, cheaper and easier to operate.")
    ch.table(["Trigger", "Serverless notebooks/jobs"],
             [["AvailableNow", "✅ supported — the recommended incremental trigger"],
              ["Once", "✅ supported but deprecated"],
              ["ProcessingTime", "❌ not supported"],
              ["Real-time", "❌ not supported"]],
             "Serverless streaming nuance (2026)")
    ch.callout("exam", "Trap: serverless + always-on",
               "On serverless notebooks/jobs, time-based `processingTime` triggers aren't supported. For **always-running** serverless streams, the preferred architecture is a **Lakeflow pipeline in continuous mode** (Phase 6).")
    ch.callout("exam", "Trap: AvailableNow",
               "AvailableNow = **process the currently available backlog incrementally, then stop**. Not 'run forever', and not 'reprocess everything'.")
    ch.reveal("Think first: you run an AvailableNow query twice in a row with no new data. What does run 2 process?",
              "Nothing new — the checkpoint already records that all available input was processed, so the query finds no new offsets and stops.")

    # ------------------------------------------------------------------ s05
    ch.sec(5, "Stateless vs Stateful & the State Store",
           "Can each record be handled alone, or must Spark remember the past? That one question decides cost, risk and recovery.")
    ch.code("python", 'clean = (\n    events\n        .filter("amount > 0")\n        .select("event_id", "customer_id", "amount")\n)', "Stateless")
    ch.p("For every record you can decide what to do **without remembering previous records**: event → filter → projection → output. Databricks defines **stateless** queries as queries that keep no intermediate state beyond **progress tracking** from source to sink.")
    ch.code("python", 'events.groupBy("customer_id").count()', "Stateful")
    ch.p("To answer *'customer 42 count = ?'* Spark must remember: batch 1 → customer 42 = 5; batch 2 brings 3 more → new total = 8. That memory is **state**.")
    ch.compare(("Stateless", ["filter, select/projection, withColumn", "Each row handled independently", "Only progress (offsets/commits) in the checkpoint", "Easy to change and restart"]),
               ("Stateful", ["aggregations (groupBy…agg/count)", "distinct / dropDuplicates", "stream-stream joins", "custom stateful operations", "State saved in the checkpoint → harder to change"]))
    ch.callout("key", "What state really is",
               "**State** = information from previous micro-batches needed to correctly process the next ones. It is not the final output — it is the **working memory** of the streaming computation.")
    ch.table(["key", "count"], [["customer_1", "50"], ["customer_2", "22"], ["customer_3", "910"], ["…", "…"]],
             "State of groupBy(customer_id).count()")
    ch.p("**Why state can explode**: `groupBy(\"customer_id\").count()` with 1 million new customers per day and no reason to ever forget old ones.")
    ch.table(["Day", "Keys in state"], [["Day 1", "1M"], ["Day 30", "30M"], ["Day 365", "365M"]], "State grows forever")
    ch.flow(["more memory", "larger checkpoints", "slower state lookups", "slower batches", "potential OOM"], "Consequences of unbounded state")
    ch.callout("pitfall", "Unbounded state",
               "A stateful query without a time bound keeps every key forever. That is why **watermarks** (section 7) are so important.")
    ch.p("**The state store.** Streaming state is not a Python dictionary on the driver. It is **distributed state** attached to the stateful operators, partitioned across executors and made durable via the checkpoint.")
    ch.flow(["stateful operator", "distributed state store", "checkpoint durability"])
    ch.p("For demanding stateful workloads Databricks currently recommends the **RocksDB state store with changelog checkpointing**: it scales state better and reduces state-checkpoint overhead and latency.")
    ch.code("python", 'spark.conf.set(\n  "spark.sql.streaming.stateStore.providerClass",\n  "com.databricks.sql.streaming.state.RocksDBStateStoreProvider")\nspark.conf.set(\n  "spark.sql.streaming.stateStore.rocksdb.changelogCheckpointing.enabled", "true")',
            "Reference only — don't configure blindly; recognise when state is the bottleneck")
    ch.callout("key", "State bottleneck ≠ compute bottleneck",
               "When **state** becomes the bottleneck, bigger compute alone isn't necessarily the fix — the state design (watermark, keys) and the **state-store architecture** may matter more. You don't need RocksDB internals yet.")
    ch.ask("Ask yourself when the state store is huge",
           ["How many keys does state hold — is key cardinality unbounded?",
            "Is there a watermark, and is it much longer than real lateness?",
            "How long are my windows?",
            "Do my stream-stream joins have time bounds, and what is my dedup horizon?",
            "Is one stateful key (e.g. 'anonymous') skewed?",
            "Is this really a compute problem — or is the state semantically unbounded?"])
    ch.reveal("Think first: is `groupBy(...).count()` stateful in batch Spark too?",
              "In a batch job it simply computes once and forgets. In **streaming**, yes — the aggregate must accumulate across micro-batches, so Spark keeps state between them.")

    # ------------------------------------------------------------------ s06
    ch.sec(6, "Event Time vs Processing Time & Event-time Windows",
           "An order placed at 10:03 that arrives at 10:11 still belongs to 10:00–10:10. Which clock you use decides correctness.")
    ch.code("json", '{\n  "event_id": 123,\n  "event_time": "2026-09-28 10:03:00"\n}', "Arrives in Databricks at 10:11:00")
    ch.compare(("Event time — 10:03", ["When the **business event happened**", "A column in the data (event_time)", "What windows and watermarks use"]),
               ("Processing time — 10:11", ["When the **system saw/processed** it", "The engine's wall clock", "What triggers use"]))
    ch.p("Why can they differ? A **mobile** client offline, **network delay**, a **Kafka backlog**, a **server outage**, **retries**, a **batch upload**, **clock skew**. The purchase happened at 10:03 but arrived at 10:11 → the record is **late-arriving**.")
    ch.callout("exam", "Trap: processing time vs event time",
               "Processing time = when Databricks processes it. Event time = the timestamp of when the event occurred. **Watermarks use event time**, not the arrival wall clock.")
    ch.p("**Event-time windows**: sales per 10-minute window.")
    ch.code("python", 'from pyspark.sql import functions as F\n\nsales = (\n    events\n        .groupBy(F.window("event_time", "10 minutes"))\n        .agg(F.sum("amount").alias("revenue"))\n)', "Tumbling 10-minute windows")
    ch.diagram("""
windows:  [10:00–10:10)  [10:10–10:20)  [10:20–10:30)
event_time 10:03  ──► lands in [10:00–10:10)
             ...even if it ARRIVED at 10:11""", "The window is chosen by event time")
    ch.callout("key", "Tumbling vs sliding windows",
               "`F.window(col, \"10 minutes\")` = **tumbling**: fixed, non-overlapping, each event in exactly one window. `F.window(col, \"10 minutes\", \"5 minutes\")` = **sliding** (window 10 min, slide 5 min): windows overlap, so each event lands in window/slide = **2** windows. (Sliding windows are standard Spark API, added here for completeness.)")
    ch.p("The window column is a struct with `window.start` and `window.end` — you'll use `window.start` later as a MERGE key (section 13).")
    ch.p("**The late-data problem.** At 10:10 you might say *'window 10:00–10:10 is finished'*. But at 10:15 an event with `event_time = 10:08` arrives — it belongs to the old window.")
    ch.compare(("Wait forever", ["correct for arbitrarily late data", "**infinite state**"]),
               ("Close immediately", ["low state", "**lose late data**"]))
    ch.p("We need a compromise → the **watermark**.")
    ch.reveal("Think first: with 10-minute tumbling windows, which window does an event with event_time 10:19:59 land in — and one with 10:20:00?",
              "10:19:59 → **[10:10–10:20)**. 10:20:00 → **[10:20–10:30)**. Window start is inclusive, end is exclusive.")

    # ------------------------------------------------------------------ s07
    ch.sec(7, "Watermarks: Bounding State & Late Data",
           "The watermark is the deal you make: 'I'll keep state for events up to X late — older ones I may drop.'")
    ch.code("python", 'watermarked = (\n    events\n        .withWatermark("event_time", "10 minutes")\n)')
    ch.p("Meaning, approximately: *I'm willing to keep state so I can accept events that arrive up to about 10 minutes late **relative to the event-time progress I have observed**.*")
    ch.p("Databricks defines a **watermark** as an event-time threshold that lets Structured Streaming **stop keeping old state** and **control late-arriving data**.")
    ch.callout("key", "Watermark ≠ wall-clock timer",
               "It does NOT mean 'each event gets 10 real minutes from its birth'. Spark tracks the **maximum event time seen** and computes: watermark ≈ max event time − delay. Max seen 12:00, delay 10 min → watermark ≈ **11:50**. State older than that may be considered final/evictable.")
    ch.diagram("""
event-time axis ───────────────────────────────►
            11:50                   12:00
              │◄──── delay 10 min ────►│
          watermark               max event time seen
 older than watermark → too late (may be dropped)
 newer than watermark → still accepted""", "Watermark = max event time − delay")
    ch.p("Why 'approximately'? The API guarantees the actual watermark stays **at least** the configured delay behind event-time progress; coordination between partitions (and, in micro-batch mode, the watermark being updated at the end of a batch and applied to the next) means you must not treat its instantaneous value as a perfect wall-clock cutoff.")
    ch.callout("interview", "One-liner",
               "*Watermark is an event-time progress threshold, not a simple timer per row.*")
    ch.callout("key", "The guarantee in one line",
               "Data **less late** than the delay is guaranteed to be aggregated. Data **later** than the threshold **may** be dropped — 'may', not 'will': don't build logic that relies on late rows being discarded.")
    ch.code("python", 'sales = (\n    events\n        .withWatermark("event_time", "15 minutes")\n        .groupBy(\n            F.window("event_time", "10 minutes"),\n            F.col("country"))\n        .agg(F.sum("amount").alias("revenue"))\n)',
            "Stateful aggregation with a watermark")
    ch.table(["window", "country", "revenue"], [["10:00–10:10", "GR", "1200"], ["10:00–10:10", "DE", "800"], ["10:10–10:20", "GR", "400"]],
             "What the state might contain")
    ch.p("When the watermark passes sufficiently beyond an old window, that window's **state can be removed** → state stays **bounded**.")
    ch.compare(("Short watermark (5 min)", ["less state, lower memory", "faster state operations", "lower latency for append finalization", "❌ records later than the tolerance may be dropped"]),
               ("Long watermark (2 hours)", ["accepts more late events", "❌ more state & memory", "❌ bigger checkpoints", "❌ higher latency"]))
    ch.callout("warn", "Too small drops valid data",
               "Databricks describes exactly this **latency / state / correctness** trade-off and warns that a very small watermark can discard **valid** late records. Pick it from how late real data actually arrives.")
    ch.callout("exam", "Trap: watermark purpose",
               "Correct: **bound state + define tolerated lateness / finalization**. Wrong: 'delete old table rows'. A watermark is **not a retention policy** — not VACUUM, not table retention, not a TTL. It never deletes historical Delta rows.")
    ch.p("**'Late' is relative to query progress.** An event arrives 20 minutes after it happened. Late? If the stream's max seen event time is only 5 minutes ahead of it → **could still be accepted**. If the stream has already seen events 2 hours ahead → **could be too late**.")
    ch.callout("key", "late ≠ now − event_time",
               "Lateness depends on **event-time watermark progress**, not on how long the event spent in transit.")
    ch.ask("Ask yourself when late events seem to be missing",
           ["What event_time did the missing events carry?",
            "What was the maximum event time already observed when they arrived?",
            "What watermark delay was configured?",
            "Had the watermark already passed their window?",
            "Am I reasoning from arrival time instead of event time?"])
    ch.reveal("Think first: max event time seen = 10:20, watermark delay 5 min. An event with event_time 10:03 arrives. Accepted? What if the delay were 30 min?",
              "5 min → watermark ≈ 10:15 > 10:03 → **too late**, may be dropped. 30 min → watermark ≈ 09:50 < 10:03 → **still accepted** and updates its window's state.")

    # ------------------------------------------------------------------ s08
    ch.sec(8, "Output Modes: Append, Update, Complete",
           "When a result can still change, which rows do you emit — the final ones, the changed ones, or everything?")
    ch.table(["Mode", "What it emits each trigger"],
             [["Append", "Only rows considered **final** (will never change again)"],
              ["Update", "Rows whose result **changed** in this trigger"],
              ["Complete", "The **entire** current result/state every trigger"]])
    ch.p("**Append**: the 10:00–10:10 revenue may still change at 10:11 because of late data, so append must not emit it yet. With a watermark: wait until the window is considered final → **emit once**. For window aggregations, append writes after the watermark passes the window.")
    ch.p("**Update**: batch 1 → GR revenue = 100 → emit `GR 100`. Batch 2 receives +50 → GR = 150 → emit `GR 150`. Downstream sees **updates**.")
    ch.p("**Complete**: every trigger emits the whole aggregate. Batch 1: GR 100, DE 50. Batch 2: GR 150, DE 50, FR 20 — all of it rewritten.")
    ch.callout("warn", "Complete mode keeps all state",
               "In complete mode aggregation state is **not evicted by the watermark** (the whole result must be re-emitted). With large/unbounded key cardinality it gets expensive.")
    ch.callout("exam", "Delta sink: append + complete, NOT update",
               "Delta Lake streaming sinks support **append** and **complete**, not **update** directly. For update-like semantics into Delta use **foreachBatch + MERGE** (section 13). A classic certification/interview detail.")
    ch.p("**Stateless streams**: `events.filter(...).select(...)` has no stateful row that changes later, so the append/update/complete distinction doesn't change operator behaviour (and complete mode isn't allowed without an aggregation).")
    ch.table(["Query shape", "Append", "Update", "Complete"],
             [["Stateless (filter/select)", "✅ default", "same effect as append", "❌ needs an aggregation"],
              ["Aggregation + watermark", "✅ emits when window final", "✅ changed rows", "✅ (state not evicted)"],
              ["Aggregation, no watermark", "❌ never final → not allowed", "✅", "✅"],
              ["Delta table sink", "✅", "❌ use foreachBatch+MERGE", "✅"]],
             "Which modes make sense")
    ch.p("**Production example — event analytics.** Schema: `event_id STRING, user_id BIGINT, event_type STRING, event_time TIMESTAMP`.")
    ch.code("python", 'from pyspark.sql import functions as F\n\nevents = spark.readStream.table("ecommerce.bronze.events")\n\ncounts = (\n    events\n        .withWatermark("event_time", "20 minutes")\n        .groupBy(F.window("event_time", "5 minutes"), "event_type")\n        .count()\n)\n\nquery = (\n    counts.writeStream\n        .outputMode("append")\n        .option("checkpointLocation",\n                "/Volumes/ecommerce/system/event_counts_ckpt")\n        .toTable("ecommerce.gold.event_counts")\n)',
            "Window + watermark + append → Delta")
    ch.diagram("""
events 10:01 click, 10:02 click, 10:03 purchase
   → window [10:00–10:05) state: click=2, purchase=1
late event, event_time 10:04 → state updates
watermark advances past 10:05 (max event time ≥ ~10:25)
   → append: window FINAL → emit row once
   → window state removed""", "The complete lifecycle of one window")
    ch.callout("debug", "\"Why does append output look delayed?\"",
               "Events arrive instantly but rows don't appear. **Stateful aggregate + append mode + watermark** means Spark must wait until it considers the aggregate final (window end + watermark delay). This is **intended behaviour**, not necessarily lag.")
    ch.callout("exam", "Trap: output mode",
               "Append = finalized rows. Update = changed rows. Complete = entire result. And **not every sink supports every mode** — Delta doesn't support update directly.")
    ch.reveal("Think first: a dashboard must show click counts growing live (10:01 → 1, 10:02 → 2) in a Delta table. Which output mode?",
              "Not append (waits for finality) and not update (Delta sink doesn't support it). Use **foreachBatch + MERGE** to upsert the changing aggregates (section 13).")
