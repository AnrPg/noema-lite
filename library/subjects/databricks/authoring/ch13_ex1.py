# -*- coding: utf-8 -*-
"""ch13 exercises for sections 1-8."""


def build(ch):
    def at(n): ch.cur = f"ch13-s{n:02d}"

    # ================================================================ s01
    at(1)
    ch.mcq("Test Q1: Why can Spark Structured Streaming reuse batch-like DataFrame syntax?",
           ["Because it converts streams into files first and runs a nightly batch",
            "Because it uses Spark's DataFrame/query-planning execution model incrementally over unbounded input",
            "Because streaming DataFrames are just pandas DataFrames refreshed every second",
            "Because it only supports SQL, and SQL is the same everywhere"], 1,
           "Structured Streaming is the same Spark engine: the same planner turns your DataFrame code into jobs, applied **incrementally** to new data. It does not secretly batch files nightly, and it is not pandas.",
           tags=("exam", "concept"), quick=True,
           why=["No — it processes incrementally as data becomes available, not as a nightly batch.",
                "Correct — same planner and engine, incremental execution.",
                "No — Spark DataFrames are distributed; pandas has nothing to do with it.",
                "No — the DataFrame API (Python) is reused, not only SQL."])
    ch.tf("Structured Streaming is a separate execution engine from batch Spark, with its own notion of jobs and tasks.", False,
          "It is the **same** Spark execution engine. A micro-batch is a normal Spark job with stages, tasks and partitions; only the input is treated as unbounded and processed incrementally.",
          tags=("concept", "pitfall"), quick=True)
    ch.bucket("Bounded or unbounded input?", ["Bounded (batch)", "Unbounded (streaming)"],
              [("Yesterday's orders.csv export", 0), ("A Kafka topic of clicks", 1), ("A one-off 2 TB historical backfill", 0),
               ("JSON files landing in a Volume forever", 1), ("Rows appended continuously to a Bronze Delta table", 1), ("A fixed reference CSV of country codes", 0)],
              "Bounded = known end, process once and stop. Unbounded = logically keeps growing, the query must keep (or repeatedly) process new data.",
              tags=("concept",), diff=1)
    ch.order("Put the Phase 5 mental model in order (top to bottom).",
             ["streaming source", "readStream", "incremental DataFrame plan", "trigger", "micro-batch / real-time execution", "stateless or stateful operators", "writeStream", "sink"],
             "Source → readStream defines it → a plan is built → the trigger decides when → micro-batch executes → operators (stateless/stateful) → writeStream → sink, with the checkpoint remembering progress + state alongside.",
             tags=("concept",), diff=2)
    ch.cloze("Complete the unbounded-table idea.",
             "Structured Streaming treats a stream as a table that keeps [[growing|growing forever]]: each new event is a new [[row]]. The engine runs your query [[incrementally]] over the new rows while the [[checkpoint]] remembers progress and state.",
             "The unbounded-table model is the core of Structured Streaming: same query, incremental execution, checkpointed progress.",
             bank=["shrinking", "column", "once", "cluster"], tags=("concept",), quick=True)
    ch.odd("Which item does NOT belong to the streaming mental model chain?",
           ["readStream", "trigger", "checkpoint", "VACUUM"], 3,
           "readStream, trigger and checkpoint are all parts of a streaming query. **VACUUM** is Delta table file garbage collection — a storage maintenance command, not part of the streaming pipeline (though it can break a stopped stream, section 12).",
           tags=("concept",))
    ch.free("Explain in 3–4 sentences the difference between a bounded and an unbounded dataset, and why the second needs a checkpoint.",
            "A bounded dataset has a known end: you read it all, compute and stop. An unbounded dataset logically never ends — new records keep arriving — so the query keeps running or re-running on new data. Because it runs over and over, the engine must durably remember which input it already processed (and any intermediate state), otherwise a restart would reprocess or skip data. That memory is the checkpoint.",
            ["bounded = known end, process once", "unbounded = keeps growing", "processed repeatedly/incrementally", "checkpoint remembers progress (and state) across restarts"],
            "This is the first-principles core: unboundedness is what forces progress tracking.", tags=("concept",), diff=1)

    # ================================================================ s02
    at(2)
    ch.tf("Test Q3: `spark.readStream...load(path)` immediately starts processing files.", False,
          "No. readStream only defines a streaming source / logical plan (lazy evaluation). Execution starts when a streaming sink is started with `writeStream ... toTable()` or `.start()`.",
          tags=("exam",), quick=True)
    ch.mcq("Certification trap: what is the difference between `spark.read` and `spark.readStream`?",
           ["None — readStream is just a faster read", "read = bounded batch read; readStream = streaming source tracked incrementally",
            "read works only on Delta; readStream only on Kafka", "readStream reads the whole table every second"], 1,
           "`spark.read` reads what exists now (bounded). `spark.readStream` treats the source as continuously evolving and tracks progress. Simple but frequently tested.",
           tags=("exam",), quick=True,
           why=["They have different execution models, not different speeds.", "Correct.", "Both work with many formats (json, Delta, etc.).", "No — it processes only new data incrementally."])
    ch.spotbug("This cell fails with an error about `writeStream`. Which line is the bug?",
               ["events = (", "    spark.read", '        .format("json")', "        .schema(schema)", "        .load(path)", ")",
                'events.writeStream.option("checkpointLocation", ckpt).toTable("ecommerce.bronze.events")'],
               [1], 'events = (\n    spark.readStream\n        .format("json")\n        .schema(schema)\n        .load(path)\n)',
               "`spark.read` creates a **batch** DataFrame; `.writeStream` can only be called on a streaming DataFrame. Use `spark.readStream`.",
               tags=("debug", "exam", "syntax"))
    ch.cloze("Fill in the streaming read.",
             'df = (\n    spark.[[readStream]]\n        .format("json")\n        .[[schema]](schema)\n        .[[load]](path)\n)',
             "Streaming file sources take an explicit `.schema(...)` — then `.load(path)` builds the streaming DataFrame (still lazy).",
             bank=["read", "start", "table", "option"], as_code=True, tags=("syntax",))
    ch.cloze("Complete the sink that STARTS the query.",
             'query = (\n    events.[[writeStream]]\n        .format("delta")\n        .option("[[checkpointLocation]]", checkpoint)\n        .[[toTable]]("ecommerce.bronze.events")\n)',
             "`writeStream` defines the sink, `checkpointLocation` gives the query its durable memory, `toTable(...)` starts the query writing to a table.",
             as_code=True, tags=("syntax",), diff=2)
    ch.match("Match each piece to its role.",
             [("readStream", "define the source"), ("filter/select/groupBy", "define the computation"), ("writeStream", "define the sink"),
              ("toTable() / start()", "start the streaming query"), ("checkpointLocation", "durable progress + state")],
             "Only the start call triggers execution; everything before it is plan-building.", tags=("concept",), quick=True)
    ch.write("Write a stream that reads the Delta table `ecommerce.bronze.events`, keeps rows where `event_type IS NOT NULL`, and writes to `ecommerce.silver.events` with checkpoint variable `checkpoint`.",
             'events = spark.readStream.table("ecommerce.bronze.events")\nclean = events.filter("event_type IS NOT NULL")\nquery = (\n    clean.writeStream\n        .option("checkpointLocation", checkpoint)\n        .toTable("ecommerce.silver.events")\n)',
             ["readStream", ".table(", "filter", "writeStream", "checkpointLocation", "toTable"],
             "Source → transformation → sink. Delta-to-Delta streaming needs only `readStream.table`, a transformation and `writeStream...toTable` with a checkpoint.",
             lang="python", tags=("syntax",))
    ch.mcq("Which StreamingQuery call blocks until the query stops — typical at the end of a job script?",
           ["query.lastProgress", "query.status", "query.awaitTermination()", "query.recentProgress"], 2,
           "`awaitTermination()` blocks; `status` and `lastProgress`/`recentProgress` only report what's happening.",
           tags=("syntax",))
    ch.tf("In production, a `writeStream` to a table should always set a durable `checkpointLocation`.", True,
          "Without a durable checkpoint the query can't remember offsets, commits and state across restarts — it would behave as a new query each time.",
          tags=("pitfall",))

    # ================================================================ s03
    at(3)
    ch.mcq("Test Q2: What is a micro-batch?",
           ["A single event processed by its own Spark job", "A bounded chunk of newly available stream data executed as a Spark job",
            "A small cluster dedicated to streaming", "A Delta file smaller than 128 MB"], 1,
           "Micro-batch = bounded chunk of new data → one Spark job (stages, tasks, partitions). Spark does not launch a job per event.",
           tags=("exam",), quick=True,
           why=["That's the misconception micro-batching avoids.", "Correct.", "It's a unit of work, not compute.", "Unrelated to file sizes."])
    ch.tf("Inside a micro-batch, concepts like shuffle, skew, spill and partitions no longer apply because streaming has its own engine.", False,
          "Each micro-batch is a normal Spark job: job → stages → tasks → partitions. Shuffle, joins, spill and skew all still apply (Chapter 9).",
          tags=("pitfall",), quick=True)
    ch.calc("Trigger = every 5 seconds, but each micro-batch needs 12 seconds. Batches run sequentially. How many micro-batches COMPLETE in the first 60 seconds?",
            5, "Batches don't overlap: they finish at 12, 24, 36, 48, 60 s → **5** batches. Twelve were 'scheduled' by the 5-s trigger, so a backlog builds and latency grows.",
            unit="batches", tags=("calc",), diff=2)
    ch.mcq("Trigger every 5 s, a micro-batch takes 12 s. What does Spark do in the normal micro-batch model?",
           ["Runs 3 batches in parallel to catch up", "Skips the data of the missed triggers",
            "Starts the next batch after the current one finishes; backlog and latency grow", "Fails the query with a trigger timeout"], 2,
           "Micro-batches are sequential. No data is skipped and no parallel batches run — the query just falls behind: processing backlog + growing latency.",
           tags=("concept", "pitfall"))
    ch.cloze("Complete the 5-second trigger.",
             'query = (\n    events.writeStream\n        .format("delta")\n        .outputMode("append")\n        .option("checkpointLocation", checkpoint)\n        .trigger([[processingTime]]="[[5 seconds]]")\n        .toTable("ecommerce.bronze.events")\n)',
             "`processingTime` sets how often Spark tries to start a new micro-batch.", as_code=True, tags=("syntax",), quick=True)
    ch.tf("A processingTime trigger of 5 seconds guarantees every micro-batch completes within 5 seconds.", False,
          "It only schedules **attempts**. If a batch takes longer, the next one starts late — the trigger can't create capacity.",
          tags=("pitfall", "exam"))
    ch.order("Arrange the execution hierarchy of one micro-batch.",
             ["new input", "micro-batch N", "Spark job", "stages", "tasks", "partitions"],
             "Each micro-batch becomes a Spark job, split into stages, executed by tasks — one task per partition.", tags=("concept",), diff=1)
    ch.mcq("Batches consistently take longer than the trigger interval. What is this production signal?",
           ["The checkpoint is corrupted", "Ingestion rate > processing capacity", "The watermark is too short", "The sink is in update mode"], 1,
           "Sustained overrun = the pipeline can't process data as fast as it arrives. Fix with capacity, a cheaper query, less state or less skew — not with the trigger.",
           tags=("debug",))

    # ================================================================ s04
    at(4)
    ch.mcq("Test Q4: What is AvailableNow?",
           ["Run continuously with the lowest latency", "Process all currently available unprocessed input incrementally, then stop",
            "Reprocess the entire source from the beginning, then stop", "Process exactly one row, then stop"], 1,
           "AvailableNow = catch up on everything available now (possibly in several batches), then stop. The checkpoint makes the next run start where this one ended.",
           tags=("exam",), quick=True,
           why=["That's processingTime/real-time, not AvailableNow.", "Correct.", "No — only unprocessed input; the checkpoint remembers the rest.", "No such semantics."])
    ch.free("Test Q5: Why is AvailableNow useful for Data Engineering?",
            "Scheduled incremental jobs get checkpointed streaming semantics — incremental source tracking, checkpointing, state management, fault recovery — without an always-on process. You schedule it (e.g. hourly), it processes everything new since the last run and stops, so you pay only while it runs and never hand-write last_processed_timestamp logic.",
            ["scheduled incremental processing", "checkpoint tracks progress", "no always-on cluster / cost", "no manual watermark/timestamp tracking"],
            "This is why Databricks recommends AvailableNow especially on serverless jobs, and why Auto Loader jobs commonly use it.", tags=("exam", "interview"))
    ch.match("Match the trigger to its behaviour.",
             [("no .trigger(...)", "next micro-batch as soon as the previous finishes"), ('processingTime="10 seconds"', "fixed-interval micro-batches"),
              ("availableNow=True", "process the available backlog, then stop"), ("once=True", "deprecated single-batch run"),
              ("real-time mode", "sub-second operational latency on supported classic")],
             "Default = processingTime 0. Once was deprecated in favour of AvailableNow.", tags=("syntax",), quick=True)
    ch.tf("Databricks recommends `Trigger.Once` over `Trigger.AvailableNow` for new scheduled jobs.", False,
          "Reverse: Once is **deprecated** in favour of AvailableNow, which can split a large backlog into multiple batches and still stops at the end.",
          tags=("exam", "pitfall"))
    ch.bucket("On serverless notebooks/jobs, is this trigger supported?", ["Supported", "Not supported"],
              [("availableNow=True", 0), ("once=True (deprecated)", 0), ('processingTime="1 minute"', 1), ("real-time mode", 1)],
              "Serverless: AvailableNow ✅, Once ✅ (deprecated), ProcessingTime ❌, RealTime ❌. Always-on serverless streaming → Lakeflow pipeline continuous mode.",
              tags=("exam",), diff=2)
    ch.mcq("Certification trap: you need an ALWAYS-RUNNING stream on serverless. What's the preferred architecture?",
           ['Serverless job with .trigger(processingTime="10 seconds")', "Serverless job with .trigger(availableNow=True) in a while-true loop",
            "A Lakeflow pipeline in continuous mode", "Real-time mode on a serverless SQL warehouse"], 2,
           "Time-based triggers aren't supported on serverless notebooks/jobs, and real-time mode is classic-only. For continuously running serverless workloads Databricks directs you to Lakeflow pipelines' continuous mode (Phase 6).",
           tags=("exam",), diff=2,
           why=["processingTime isn't supported on serverless notebooks/jobs.", "A hack; AvailableNow is meant for scheduled runs.", "Correct.", "Real-time mode is for supported classic environments, not SQL warehouses."])
    ch.write("Write the hourly incremental job: trigger that processes what's available then stops, checkpoint `checkpoint`, target `ecommerce.bronze.events`.",
             'query = (\n    events.writeStream\n        .trigger(availableNow=True)\n        .option("checkpointLocation", checkpoint)\n        .toTable("ecommerce.bronze.events")\n)',
             ["writeStream", "availableNow=True", "checkpointLocation", "toTable"],
             "Schedule this hourly: run 1 processes A B C, run 2 processes only D E because the checkpoint remembers A B C.", lang="python", tags=("syntax",))
    ch.scenario("An hourly AvailableNow job ran at 10:00 and processed files A, B, C. At 11:00 it runs again; only D and E are new.",
                [("What does the 11:00 run process?",
                  [("Only D and E, then stops", True, "Right — the checkpoint knows A B C were processed."),
                   ("A, B, C, D, E again", False, "Only if the checkpoint were deleted or changed."),
                   ("Nothing until a new trigger interval passes", False, "AvailableNow doesn't wait for intervals; it processes the available backlog.")]),
                 ("At 12:00 nothing new has arrived. What happens?",
                  [("It finds no new offsets and stops quickly", True, "Correct — nothing new to process."),
                   ("It waits forever for new data", False, "That's the default/processingTime behaviour, not AvailableNow."),
                   ("It fails because there is no data", False, "An empty backlog is a normal outcome.")])],
                "AvailableNow + checkpoint = incremental batch semantics without hand-written progress tracking.", tags=("concept", "exam"), diff=1)
    ch.odd("Which is NOT something AvailableNow gives you for free compared with a hand-written `WHERE event_ts > last_ts` job?",
           ["incremental source tracking", "fault recovery via checkpoint", "business-level deduplication of duplicate events", "state management"], 2,
           "The streaming engine tracks progress, recovers and manages state. It does **not** deduplicate business duplicates — that remains your job.",
           tags=("pitfall",), diff=2)
    ch.tf("Real-time mode should be the default choice for ordinary lakehouse ETL because lower latency is always better.", False,
          "Real-time mode targets ultra-low-latency operational workloads. For normal lakehouse ETL, micro-batch or AvailableNow is simpler, cheaper and easier to operate.",
          tags=("pitfall",))

    # ================================================================ s05
    at(5)
    ch.mcq("Test Q6: Stateless vs stateful?",
           ["Stateless never writes to a sink; stateful does", "Stateless processing doesn't need historical intermediate state; stateful does",
            "Stateless uses Python; stateful uses SQL", "Stateless runs on serverless; stateful only on classic"], 1,
           "Stateless keeps only progress tracking; stateful keeps intermediate state (counts, open windows, join buffers, dedup keys) across micro-batches.",
           tags=("exam",), quick=True)
    ch.tf("Test Q7: In a streaming query, `groupBy(...).count()` is stateful.", True,
          "Q8 — why: the aggregate result must accumulate information across micro-batches (customer 42: 5, then 8), so Spark keeps state.",
          tags=("exam",), quick=True)
    ch.bucket("Stateless or stateful in Structured Streaming?", ["Stateless", "Stateful"],
              [('filter("amount > 0")', 0), ('select("event_id", "amount")', 0), ('withColumn("group_id", col("value") % 5)', 0),
               ('groupBy("customer_id").count()', 1), ('dropDuplicates(["event_id"])', 1), ("distinct()", 1), ("stream-stream join", 1),
               ("stream-static join (enrichment)", 0)],
              "Aggregations, distinct/dropDuplicates, stream-stream joins and custom stateful operations keep state. A stream-static join doesn't buffer the stream side.",
              tags=("concept", "exam"), diff=2)
    ch.free("Test Q8: Why is a streaming groupBy stateful? Use the customer-42 example.",
            "Because the result must accumulate across micro-batches. If batch 1 had 5 events for customer 42 and batch 2 brings 3 more, Spark can only output 8 if it remembered the 5 from batch 1. That remembered running count is state, kept in the distributed state store and checkpointed.",
            ["accumulate across micro-batches", "must remember previous count", "5 + 3 = 8 example", "stored in state store / checkpoint"],
            "State = information from previous micro-batches needed to process the next ones correctly.", tags=("exam", "concept"), diff=1)
    ch.calc("`groupBy(\"customer_id\").count()` with no watermark; 1 million NEW customers appear every day and none is ever forgotten. How many million keys are in state after 30 days?",
            30, "1M × 30 days = **30M** keys (365M after a year). State grows forever → more memory, bigger checkpoints, slower lookups, slower batches, potential OOM.",
            unit="million keys", tags=("calc",), diff=1)
    ch.order("Unbounded state: order the consequences as they snowball.",
             ["state keeps growing", "more memory used", "larger checkpoints", "slower state lookups", "slower batches", "potential OOM"],
             "Growing state first costs memory and checkpoint size, then slows every lookup and batch, and finally can OOM.", tags=("pitfall",), diff=2)
    ch.mcq("Test Q34: Which state-store technology does Databricks currently recommend for demanding stateful workloads?",
           ["An in-driver Python dictionary", "RocksDB with changelog checkpointing", "A Delta table rewritten every batch", "Photon's vectorized cache"], 1,
           "RocksDB state store + changelog checkpointing scales state and reduces state-checkpoint overhead/latency. State is distributed across executors — never a driver dict.",
           tags=("exam",), quick=True,
           why=["State is distributed, not a driver dict.", "Correct.", "Not how state is stored.", "Photon is an execution engine, not a state store."])
    ch.tf("When state becomes the bottleneck, scaling up compute is always the right fix.", False,
          "Not necessarily. The state design (watermark, key cardinality, join bounds) and the state-store architecture (RocksDB + changelog checkpointing) may matter more than node size.",
          tags=("pitfall", "debug"))
    ch.cloze("Complete the definition.",
             "State is information from previous [[micro-batches|batches]] that is needed to correctly process the [[next|following]] ones. It is the [[working memory]] of the computation, not the final output.",
             "That's why state must be checkpointed — losing it means wrong (restarted-from-zero) aggregates.", bank=["files", "previous", "final output"], tags=("concept",))
    ch.odd("Three of these are stateful operators. Which one is the odd one out?",
           ["dropDuplicates", "stream-stream join", "windowed aggregation", "select with a computed column"], 3,
           "A projection with a computed column is stateless: each row is handled alone.", tags=("concept",))

    # ================================================================ s06
    at(6)
    ch.mcq("Test Q9: What is event time?",
           ["When Databricks processed the record", "When the event occurred, according to the event data", "When the file was written to storage", "The trigger interval"], 1,
           "Event time is a column carried by the data (event_time). Processing time (Q10) is when the engine observes/processes the record.",
           tags=("exam",), quick=True)
    ch.match("Test Q10 & certification trap: match each time concept.",
             [("Event time", "when the business event happened"), ("Processing time", "when the engine saw/processed it"),
              ("Watermark", "event-time threshold for late data"), ("Trigger", "how often a micro-batch is attempted")],
             "Watermarks are based on **event time**, triggers on **processing time** (wall clock).", tags=("exam",), quick=True)
    ch.bucket("Test Q11: which of these can make event time EARLIER than processing time?", ["Can cause late arrival", "Not a cause"],
              [("mobile app offline", 0), ("network delay", 0), ("Kafka backlog", 0), ("retries", 0), ("batch upload of a day's events", 0),
               ("clock skew", 0), ("choosing append output mode", 1), ("using a Delta sink", 1)],
              "Network delays, offline clients, queues/backlogs, outages, retries, batch uploads and clock skew all delay arrival. Output mode and sink type don't change when the event happened.",
              tags=("exam",), diff=1)
    ch.calc("10-minute tumbling windows. An event has event_time 10:03 and arrives at 10:11. Which window START does it belong to? (answer as HHMM, e.g. 1000)",
            1000, "Windows are assigned by **event time**: 10:03 → [10:00–10:10), start 10:00. Arrival at 10:11 is irrelevant to the window choice.",
            unit="HHMM", tags=("calc",), diff=1, quick=True)
    ch.calc("5-minute tumbling windows. Event_time 10:47:30. Window START? (HHMM)", 1045,
            "5-minute windows start at :00, :05, … :45, :50. 10:47:30 is in [10:45–10:50).", unit="HHMM", tags=("calc",), diff=1)
    ch.calc("Sliding window: `F.window(\"event_time\", \"1 hour\", \"15 minutes\")`. In how many windows does each event land?", 4,
            "Overlapping windows: window ÷ slide = 60 ÷ 15 = **4**. A tumbling window (no slide) puts each event in exactly 1.",
            unit="windows", tags=("calc",), diff=2)
    ch.cloze("Write the revenue-per-10-minute-window aggregation.",
             'from pyspark.sql import functions as F\nsales = (\n    events\n        .groupBy(F.[[window]]("[[event_time]]", "10 minutes"))\n        .agg(F.[[sum]]("amount").alias("revenue"))\n)',
             "`F.window(timeCol, duration)` creates tumbling event-time windows; group by it and aggregate.", as_code=True, tags=("syntax",), diff=2)
    ch.tf("A purchase at event_time 10:03 that arrives at 10:11 is counted in the 10:10–10:20 window because that's when Spark saw it.", False,
          "Event-time windows use event time: it belongs to 10:00–10:10. Using arrival time would put revenue in the wrong period.",
          tags=("pitfall", "exam"))
    ch.mcq("Late data trade-off: what happens if you keep every window open forever?",
           ["Low state but lost late data", "Correct for arbitrarily late data but infinite state", "Exactly-once is broken", "Windows close at wall-clock end"], 1,
           "Waiting forever = correct but unbounded state. Closing immediately = low state but lost late data. The watermark is the compromise.",
           tags=("concept",), diff=1)

    # ================================================================ s07
    at(7)
    ch.mcq("Test Q12: What does a watermark solve?",
           ["It deletes old rows from the Delta table", "It bounds state and sets a threshold for late-data handling/finalization",
            "It speeds up the trigger", "It guarantees no duplicates"], 1,
           "Watermark = bound state + tolerated lateness/finalization. It is not a retention policy and doesn't touch table rows.",
           tags=("exam",), quick=True,
           why=["That's VACUUM/retention territory, not watermarks.", "Correct.", "Triggers are separate.", "Dedup is a separate stateful op."])
    ch.tf("Test Q13: `withWatermark(\"event_time\", \"10 minutes\")` means each event is accepted for exactly 10 wall-clock minutes after it was created.", False,
          "No. The watermark is relative to the **maximum observed event time** (watermark ≈ max event time − 10 min), not to each row's wall-clock age.",
          tags=("exam", "pitfall"), quick=True)
    ch.calc("Max event time seen so far = 12:00, watermark delay 10 minutes. Conceptual watermark? (HHMM)", 1150,
            "watermark ≈ max event time − delay = 12:00 − 10 min = **11:50**. State older than that may be finalized/evicted.",
            unit="HHMM", tags=("calc",), diff=1, quick=True)
    ch.mcq("Max event time seen = 10:20, delay = 5 min. An event with event_time 10:03 arrives now. What happens?",
           ["Accepted — it arrived within 20 wall-clock minutes", "It is older than the watermark (≈10:15) → too late, may be dropped",
            "It's assigned to the current window instead", "The query fails"], 1,
           "Watermark ≈ 10:20 − 5 = 10:15. 10:03 is behind it → too late. With a 30-min delay (watermark ≈ 09:50) it would still be accepted.",
           tags=("calc", "exam"), diff=2)
    ch.calc("Lab 7 variant: max event time seen = 10:20, watermark delay 30 minutes. What is the conceptual watermark? (HHMM)", 950,
            "10:20 − 30 min = **09:50**. An event at 10:03 is newer than that → accepted and still updates its window's state.",
            unit="HHMM", tags=("calc",), diff=2)
    ch.bucket("Short (5 min) or long (2 h) watermark?", ["Short watermark", "Long watermark"],
              [("less state, lower memory", 0), ("accepts more late events", 1), ("lower latency for append finalization", 0),
               ("bigger checkpoints", 1), ("late records beyond tolerance may be dropped", 0), ("higher result latency", 1)],
              "Test Q14/Q15: short = less state and lower latency, but lower tolerance for late data. Long = more tolerance, more state, memory, checkpoint size and latency.",
              tags=("exam", "compare"), diff=2)
    ch.tf("Certification trap: a 7-day watermark on a streaming table makes Databricks delete table rows older than 7 days.", False,
          "A watermark only affects streaming **state** and late-data handling. Historical rows stay; deletion is DELETE/retention/VACUUM territory.",
          tags=("exam", "pitfall"))
    ch.tf("Late is relative to query progress: an event that arrives 20 minutes after it happened can still be accepted with a 10-minute watermark.", True,
          "If the max event time seen is only, say, 5 minutes ahead of it, the watermark is still behind its event time → accepted. Lateness ≠ now − event_time.",
          tags=("concept", "pitfall"), diff=3)
    ch.write("Add a 15-minute watermark on `event_time`, then sum `amount` as `revenue` per 10-minute window and `country`.",
             'from pyspark.sql import functions as F\nsales = (\n    events\n        .withWatermark("event_time", "15 minutes")\n        .groupBy(F.window("event_time", "10 minutes"), F.col("country"))\n        .agg(F.sum("amount").alias("revenue"))\n)',
             ["withWatermark", '"15 minutes"', "groupBy", "F.window", '"10 minutes"', "country", "F.sum", "revenue"],
             "Watermark first (on the same event-time column used by the window), then the windowed aggregation — so old window state can be evicted.",
             lang="python", tags=("syntax",), diff=2)
    ch.spotbug("This aggregation keeps growing state and the watermark never cleans anything. Which line is wrong?",
               ["counts = (", "    events", '        .groupBy(F.window("event_time", "5 minutes"), "event_type")', "        .count()",
                '        .withWatermark("event_time", "20 minutes")', ")"],
               [4], 'counts = (\n    events\n        .withWatermark("event_time", "20 minutes")\n        .groupBy(F.window("event_time", "5 minutes"), "event_type")\n        .count()\n)',
               "The watermark must be defined **before** the aggregation, on the event-time column the window uses. Applied afterwards, it can't bound the aggregation's state (and append mode on the aggregate isn't allowed).",
               tags=("debug", "syntax"), diff=2)
    ch.spotbug("Late events are dropped although they are only minutes late in business terms. Spot the semantic bug.",
               ['events = spark.readStream.table("ecommerce.bronze.events")', 'events = events.withColumn("ingest_ts", F.current_timestamp())',
                'agg = (events.withWatermark("ingest_ts", "10 minutes")', '       .groupBy(F.window("event_time", "10 minutes")).count())'],
               [2], 'agg = (events.withWatermark("event_time", "10 minutes")\n       .groupBy(F.window("event_time", "10 minutes")).count())',
               "The watermark is on processing/ingest time, not on the event-time column used by the window. Watermarks must use **event time** — the timestamp that represents reality.",
               tags=("debug", "pitfall"), diff=3)
    ch.free("Interview: 'A watermark is just a timer per row.' Correct this statement.",
            "A watermark is an event-time progress threshold, not a per-row timer. Spark tracks the maximum event time it has observed and sets watermark ≈ max event time − delay; the actual value is guaranteed to lag at least by the delay but isn't an exact instantaneous cutoff (it's coordinated across partitions and updated between micro-batches). Events older than the watermark may be dropped and state for windows behind it can be finalized and evicted.",
            ["event-time progress, not wall clock", "max observed event time − delay", "not exact / at least delay behind", "lets state be evicted and late data be handled"],
            "Being precise here signals you understand why 'late' depends on query progress.", tags=("interview",), diff=2)
    ch.scenario("Lab 7: you send event_time 10:01 (arrives 10:01), 10:02 (arrives 10:02) and 10:03 (arrives 10:20) with a 5-minute watermark. The 10:03 event is still counted. A teammate says 'the watermark is broken'.",
                [("What is the max event time seen when the 10:03 event arrives?",
                  [("10:02", True, "Right — only event times count, and the latest was 10:02."),
                   ("10:20", False, "That's the arrival (processing) time, not event time."),
                   ("10:03", False, "10:03 is the late event itself; before it, the max was 10:02.")]),
                 ("So is the 10:03 event late in event-time terms?",
                  [("No — watermark ≈ 09:57, the event is ahead of it", True, "Correct: lateness is relative to event-time progress."),
                   ("Yes, it's 18 minutes late so it must be dropped", False, "Wall-clock delay doesn't define lateness."),
                   ("It depends on the trigger interval", False, "Triggers don't define lateness.")]),
                 ("How do you make the lab show the difference between 5- and 30-minute watermarks?",
                  [("First send an on-time event with event_time ≈ 10:20, let a batch pass, then send the 10:03 event", True, "Now 5 min → watermark ≈ 10:15 (dropped) vs 30 min → ≈ 09:50 (accepted)."),
                   ("Delete the checkpoint between runs", False, "Irrelevant to lateness and dangerous habit."),
                   ("Switch to complete mode", False, "Complete mode doesn't evict state; it hides the effect.")])],
                "Watermarks are event-time based: you must advance event time to make an event 'late'.", tags=("debug", "calc"), diff=3)

    # ================================================================ s08
    at(8)
    ch.match("Test Q22, Q23, Q24: match the output mode.",
             [("Append", "emits rows once considered final"), ("Update", "emits changed aggregate rows each trigger"), ("Complete", "emits the complete aggregate result each trigger")],
             "Append = finalized, Update = changed, Complete = everything.", tags=("exam",), quick=True)
    ch.tf("Test Q25: The Delta streaming sink supports update output mode directly.", False,
          "No. Delta sinks support append and complete. Update-like semantics into Delta are implemented with foreachBatch + MERGE.",
          tags=("exam",), quick=True)
    ch.mcq("Batch 1: GR 100, DE 50. Batch 2 adds +50 for GR and a new FR 20. What does COMPLETE mode emit after batch 2?",
           ["GR 150 only", "GR 150 and FR 20", "GR 150, DE 50, FR 20", "Nothing until the watermark passes"], 2,
           "Complete re-emits the whole result every trigger. Update would emit GR 150 and FR 20 (the changed rows). Append would wait for finality.",
           tags=("concept", "compare"), diff=2)
    ch.mcq("Same data: what does UPDATE mode emit after batch 2?",
           ["GR 150, DE 50, FR 20", "GR 150, FR 20", "DE 50", "GR 50, FR 20"], 1,
           "Update emits only rows whose result changed in this trigger: GR (100→150) and the new FR. DE didn't change.",
           tags=("concept",), diff=2)
    ch.spotbug("This query fails at start. Which line is the problem?",
               ["counts = (events.withWatermark(\"event_time\", \"20 minutes\")", "          .groupBy(F.window(\"event_time\", \"5 minutes\"), \"event_type\").count())",
                "(counts.writeStream", "    .outputMode(\"update\")", "    .option(\"checkpointLocation\", ckpt)", "    .toTable(\"ecommerce.gold.event_counts\"))"],
               [3], '(counts.writeStream\n    .outputMode("append")      # or foreachBatch + MERGE for live updates\n    .option("checkpointLocation", ckpt)\n    .toTable("ecommerce.gold.event_counts"))',
               "The Delta table sink doesn't support update mode. Use append (finalized windows) or foreachBatch + MERGE for update-like behaviour.",
               tags=("debug", "exam"), diff=2)
    ch.spotbug("This aggregation is rejected in append mode. Why?",
               ["counts = (", "    events", '        .groupBy(F.window("event_time", "5 minutes"))', "        .count()", ")",
                '(counts.writeStream.outputMode("append")', '    .option("checkpointLocation", ckpt).toTable("gold.counts"))'],
               [1], 'counts = (\n    events\n        .withWatermark("event_time", "20 minutes")\n        .groupBy(F.window("event_time", "5 minutes"))\n        .count()\n)',
               "Append emits only final rows; without a watermark no aggregate can ever be final, so Spark refuses append for streaming aggregations without a watermark. Add `withWatermark` on the event-time column before the groupBy.",
               tags=("debug", "exam"), diff=3)
    ch.tf("In complete mode, the watermark evicts old aggregation state just like in append/update mode.", False,
          "Complete mode must re-emit the whole result, so aggregation state is **not** evicted by the watermark — expensive with large/unbounded cardinality.",
          tags=("pitfall", "exam"), diff=2)
    ch.tf("For a stateless filter/select stream, choosing append vs update makes no real semantic difference.", True,
          "No row ever changes later, so the output-mode distinction doesn't change operator behaviour (complete isn't allowed without an aggregation).",
          tags=("concept",))
    ch.calc("Event analytics example: 5-minute windows, 20-minute watermark, append mode. Roughly what max event time must the stream observe before window [10:00–10:05) is emitted? (HHMM)", 1025,
            "The window is final when the watermark (max event time − 20 min) reaches its end 10:05 → max event time ≈ **10:25** (and the next micro-batch runs). That's why append output looks 'delayed'.",
            unit="HHMM", tolerance=1, tags=("calc", "exam"), diff=3)
    ch.scenario("A product manager complains: 'Events arrive instantly in Bronze, but ecommerce.gold.event_counts (5-min windows, 20-min watermark, append) shows nothing for the last half hour. The stream is lagging!'",
                [("What do you check first?",
                  [("Compare the latest event times with the current watermark in query.lastProgress", True, "Right — append only emits windows the watermark has passed."),
                   ("Restart the cluster", False, "Restarting blindly hides evidence and doesn't change semantics."),
                   ("Delete the checkpoint to 'reset' the stream", False, "Dangerous: reprocessing and duplicates.")]),
                 ("Watermark is 20 min behind the max event time; batches are fast. Diagnosis?",
                  [("Intended behaviour: windows are emitted once final", True, "Correct — stateful aggregate + append + watermark = wait for finality."),
                   ("Backlog: input rate > processing rate", False, "Batches are fast; rates would show it."),
                   ("Corrupted state store", False, "No evidence points there.")]),
                 ("The PM really needs live-updating counts. What do you propose?",
                  [("foreachBatch + MERGE into a live counts table (update-like semantics)", True, "Yes — Delta sink doesn't support update mode directly."),
                   ('Switch the Delta sink to outputMode("update")', False, "Delta sinks don't support update mode."),
                   ("Set the watermark to 0 seconds", False, "That drops valid late data and still isn't 'live update'.")])],
                "Append output looking delayed is often intended. Live dashboards need update-like semantics via foreachBatch + MERGE.",
                tags=("debug", "exam"), diff=2)
    ch.write("Write the Gold writer for the event-analytics `counts` DataFrame: append mode, checkpoint `/Volumes/ecommerce/system/event_counts_ckpt`, table `ecommerce.gold.event_counts`.",
             'query = (\n    counts.writeStream\n        .outputMode("append")\n        .option("checkpointLocation", "/Volumes/ecommerce/system/event_counts_ckpt")\n        .toTable("ecommerce.gold.event_counts")\n)',
             ['outputMode("append")', "checkpointLocation", "/Volumes/ecommerce/system/event_counts_ckpt", 'toTable("ecommerce.gold.event_counts")'],
             "Append + watermark gives one final row per window and event_type, and lets window state be removed afterwards.",
             lang="python", tags=("syntax",))
    ch.order("Order the lifecycle of one window in the event-analytics example.",
             ["events arrive with event_time in [10:00–10:05)", "Spark keeps counts in state per event_type", "a late event (10:04) updates the window state",
              "the watermark advances past the window end", "append mode emits the final row once", "the window's state is removed"],
             "That's the complete lifecycle: accumulate, absorb late data, finalize at the watermark, emit once, evict state.", tags=("concept",), diff=2)
