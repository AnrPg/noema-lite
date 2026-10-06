# -*- coding: utf-8 -*-
"""ch13 exercises for sections 9-16."""


def build(ch):
    def at(n): ch.cur = f"ch13-s{n:02d}"

    # ================================================================ s09
    at(9)
    ch.mcq("Test Q16: What does a streaming checkpoint contain?",
           ["Only the last processed timestamp", "Offsets/progress, commit information, query metadata and state where applicable",
            "A full copy of the sink table", "The notebook source code"], 1,
           "offsets/ (what each batch reads), commits/ (what was written), state/ (stateful operators) and metadata (query identity). Certification trap: it's not just a 'last timestamp'.",
           tags=("exam",), quick=True,
           why=["The classic trap answer.", "Correct.", "The sink data lives in the sink.", "Code isn't stored in the checkpoint."])
    ch.mcq("Test Q17: What happens if the checkpoint is deleted (or the checkpointLocation changed)?",
           ["The stream resumes exactly where it stopped", "The query starts as new and loses prior progress/state identity",
            "Databricks rebuilds it from the Delta log automatically", "Only the state is lost; offsets are kept in the sink"], 1,
           "Deleting/changing the checkpoint = a new query: reprocessing, duplicate external side effects, lost accumulated state, maybe a full rebuild.",
           tags=("exam", "pitfall"), quick=True)
    ch.match("Match each checkpoint folder to what it records.",
             [("offsets/", "source range each micro-batch reads"), ("commits/", "micro-batches successfully written to the sink"),
              ("state/", "state-store data of stateful operators"), ("metadata", "the query's identity")],
             "Offsets are written before a batch runs, commits after the sink succeeds — that pair lets a restart decide skip vs retry.", tags=("concept",), quick=True)
    ch.bucket("Deploying new code on the SAME checkpoint: usually OK or dangerous?", ["Often OK (test it)", "Dangerous / incompatible"],
              [("adding a stateless filter", 0), ("renaming a projected column in a stateless query", 0), ("changing groupBy key customer_id → country", 1),
               ("changing count() to sum(amount)", 1), ("switching the source from Kafka to Delta", 1), ("adding a second stateful aggregation", 1)],
              "Some stateless changes can reuse a checkpoint depending on the exact query. State keys, state schema, source type and the number/type of stateful operators are checkpoint-incompatible changes.",
              tags=("pitfall", "exam"), diff=2)
    ch.tf("A checkpoint folder is a generic progress folder that two different streaming queries can safely share.", False,
          "A checkpoint encodes one query's identity, offsets, commits and state. Sharing it between queries corrupts progress semantics. One checkpoint ↔ one query.",
          tags=("pitfall",))
    ch.free("Why is 'state schema effectively production data'?",
            "Because a stateful query's checkpoint holds state with a specific schema (keys and values). If you change the state architecture, the old checkpoint becomes incompatible and you may need a new checkpoint plus a full recomputation/backfill — which is expensive. So changing state keys or aggregations must be planned and tested like a data migration.",
            ["state lives in the checkpoint with a schema", "incompatible changes need new checkpoint", "requires full recomputation/backfill", "expensive → plan/test like data"],
            "Stateless changes are cheap; stateful changes can cost a full rebuild.", tags=("concept", "interview"), diff=2)
    ch.scenario("You deploy a new version of a stateful query: groupBy changed from customer_id to country. You restart it on the existing checkpoint and it fails at start.",
                [("What is the most likely cause?",
                  [("The new state schema is incompatible with the checkpoint's state", True, "Right — state keys changed."),
                   ("The cluster is too small", False, "It fails before processing any data."),
                   ("The source is out of retention", False, "Possible in general, but the change you just made is the obvious suspect.")]),
                 ("What is the correct way forward?",
                  [("New checkpoint + plan a full recomputation/backfill of the result", True, "Yes — and do it deliberately, ideally tested in non-prod first."),
                   ("Delete files inside state/ until it starts", False, "Hand-editing a checkpoint corrupts query identity."),
                   ("Point the old checkpoint at a different table", False, "Doesn't fix the state incompatibility.")])],
                "Stateful changes can be checkpoint-incompatible; the way out is a new checkpoint + backfill.", tags=("debug",), diff=2)
    ch.order("Write-ahead sequence of one micro-batch (why restarts are safe).",
             ["record the planned source range in offsets/", "process the micro-batch", "commit the result to the Delta sink", "record the batch in commits/"],
             "Offsets first (plan), then process, then the sink commit, then the commit log. On restart, an offsets entry without a commit entry tells Spark which batch to check/redo.",
             tags=("concept",), diff=3)
    ch.cloze("Fill in the checkpoint-reset consequences.",
             "Deleting a checkpoint can mean [[reprocessing]], duplicate external [[side effects]], loss of accumulated [[state]], and a full [[rebuild|backfill]].",
             "Per pipeline the impact differs — but never treat a checkpoint reset as harmless.", bank=["compaction", "faster batches"], tags=("pitfall",))

    # ================================================================ s10
    at(10)
    ch.tf("Test Q18: An exactly-once Delta sink means the source cannot contain duplicates.", False,
          "Q19 — why not: processing guarantees don't deduplicate semantically duplicated input records. Two records with event_id=123 are two records.",
          tags=("exam", "pitfall"), quick=True)
    ch.mcq("Which three pieces cooperate so a retried micro-batch never becomes a partial/duplicate commit in a Delta sink?",
           ["trigger + output mode + watermark", "source offsets + checkpoint commits + Delta transaction log", "Photon + RocksDB + Unity Catalog", "foreachBatch + batch_id + MERGE"], 1,
           "Replayable source offsets, the checkpoint commit log and Delta's transactional log together give exactly-once into a Delta sink.",
           tags=("concept", "exam"), quick=True)
    ch.scenario("Micro-batch 20 reads events 1000–1100 and writes to a Delta sink. The driver crashes right at the boundary.",
                [("On restart, what question must the engine answer first?",
                  [("Was batch 20 committed?", True, "Exactly — offsets/20 exists; is there a commit?"),
                   ("Which events arrived during the crash?", False, "Not yet relevant; batch 20's range is already fixed in offsets/."),
                   ("Should it switch to complete mode?", False, "Output mode isn't part of recovery.")]),
                 ("Batch 20 IS in the Delta log but commits/20 is missing. What happens?",
                  [("It is not applied again", True, "Correct — Delta knows this query's batch 20 is committed."),
                   ("It is appended a second time", False, "That's what exactly-once prevents for the Delta sink."),
                   ("Half of it is re-applied", False, "Never 'half applied twice'.")]),
                 ("Batch 20 is NOT in the Delta log. What happens?",
                  [("Batch 20 is retried with the same offsets 1000–1100", True, "Yes — same range, deterministic retry."),
                   ("Events 1000–1100 are skipped", False, "That would lose data."),
                   ("The stream starts from event 0", False, "Only a lost checkpoint does that.")])],
                "if committed → don't apply again; if not → retry. Never half applied twice.", tags=("concept", "debug"), diff=2)
    ch.tf("Because Structured Streaming is exactly-once, a `foreachBatch` that sends emails sends each email exactly once even after a crash.", False,
          "Exactly-once stops at the boundaries. If the crash happens before the checkpoint commit, the batch replays and the emails are sent again. External services don't share Delta's transaction semantics.",
          tags=("pitfall", "exam"), diff=2)
    ch.calc("A foreachBatch sends 100 emails per micro-batch. Batch 7 sends its 100 emails, then the process crashes before the checkpoint commit. After the retry succeeds, how many emails did batch 7's customers receive in total?",
            200, "The retry re-runs the function for the same batch → 100 + 100 = **200**. Make side effects idempotent (e.g. record sent ids keyed by business id/batch).",
            unit="emails", tags=("calc", "pitfall"), diff=2)
    ch.write("Deduplicate a stream on `event_id` with bounded state: 1-hour watermark on `event_time`.",
             'unique = (\n    events\n        .withWatermark("event_time", "1 hour")\n        .dropDuplicates(["event_id", "event_time"])\n)',
             ["withWatermark", '"1 hour"', "dropDuplicates", "event_id", "event_time"],
             "Including the watermarked event_time in the dedup keys lets Spark drop old keys as event time progresses. Without the watermark, every event_id is remembered forever.",
             lang="python", tags=("syntax",), diff=2)
    ch.spotbug("This dedup stream ran fine for weeks; now batches slow down and memory keeps rising. Which line causes it?",
               ['events = spark.readStream.table("ecommerce.bronze.events")', 'unique = events.dropDuplicates(["event_id"])',
                '(unique.writeStream.option("checkpointLocation", ckpt)', '    .toTable("ecommerce.silver.events"))'],
               [1], 'unique = (events.withWatermark("event_time", "1 hour")\n               .dropDuplicates(["event_id", "event_time"]))',
               "Without a time bound, dropDuplicates must remember every event_id ever seen → unbounded state. Add a watermark and include the event-time column.",
               tags=("debug", "pitfall"), diff=2)
    ch.odd("Which statement does NOT belong with the others?",
           ["Dedup is a stateful operation", "Unbounded dedup needs to remember every key forever", "A watermark lets dedup state be cleaned",
            "Exactly-once processing removes duplicate business events automatically"], 3,
           "The first three are true facts about streaming dedup. Exactly-once processing does NOT remove business duplicates — that's the trap.",
           tags=("exam", "pitfall"), diff=2)
    ch.mcq("You need to drop duplicates on `event_id` even when the duplicate copies carry slightly different `event_time` values, with bounded state. Which API fits best?",
           ['dropDuplicates(["event_id"]) without watermark', 'withWatermark(...).dropDuplicatesWithinWatermark(["event_id"])',
            'withWatermark(...).dropDuplicates(["event_id", "event_time"])', "distinct()"], 1,
           "`dropDuplicatesWithinWatermark` dedups on the key alone within the watermark delay — copies with different timestamps still collapse. The classic `[event_id, event_time]` key treats different timestamps as different rows.",
           tags=("syntax",), diff=3,
           why=["Unbounded state.", "Correct (newer runtimes).", "Bounded, but copies with different event_time aren't considered duplicates.", "Unbounded and compares all columns."])

    # ================================================================ s11
    at(11)
    ch.mcq("Test Q26: Why do stream-stream joins need state?",
           ["Because joins always shuffle", "A record from one stream may need to wait for a later matching record from the other",
            "Because the static side is cached in state", "Because Delta sinks require it"], 1,
           "An order at 10:00 must be kept until its payment (10:02) arrives. Q27: watermarks decide when that waiting state can be discarded.",
           tags=("exam",), quick=True)
    ch.tf("Certification trap: for stream-stream OUTER joins, a watermark is required.", True,
          "The engine must know when an unmatched record can be considered final and emitted with NULLs — that's exactly what watermark + time constraint provide.",
          tags=("exam",), quick=True)
    ch.calc("Orders watermark is at 13:50, payments watermark at 12:59. With the default multiple-watermark policy, what is the global watermark? (HHMM)", 1259,
            "Default policy = **min** → the slowest input decides: 12:59. With `max` it would be 13:50 and late payments could be dropped.",
            unit="HHMM", tags=("calc", "exam"), diff=2)
    ch.mcq("Why is 'min' the default multiple-watermark policy?",
           ["It is faster", "Global progress follows the slowest input, so state the slow stream still needs isn't discarded",
            "It reduces state to zero", "Outer joins don't support max"], 1,
           "If orders are at 14:00 but payments only at 13:00, using the orders watermark could discard state while matching payments can still appear. min protects correctness; max trades correctness for progress.",
           tags=("concept",), diff=2)
    ch.cloze("Complete the stream-stream join setup.",
             'orders_w = orders.[[withWatermark]]("order_time", "30 minutes")\npayments_w = payments.withWatermark("[[payment_time]]", "30 minutes")\njoined = orders_w.alias("o").join(\n    payments_w.alias("p"),\n    F.expr("""o.order_id = p.order_id AND\n              p.payment_time [[BETWEEN]] o.order_time AND o.order_time + INTERVAL 1 HOUR"""))',
             "Watermarks on both inputs + key + time-range condition let Spark discard obsolete join state.", as_code=True, tags=("syntax",), diff=3)
    ch.spotbug("This stream-stream left outer join is rejected. Which line is missing the essential piece?",
               ['orders_w = orders.withWatermark("order_time", "30 minutes")', "payments_s = payments",
                'joined = orders_w.join(payments_s, F.expr("order_id = p_order_id AND payment_time BETWEEN order_time AND order_time + INTERVAL 1 HOUR"), "left_outer")'],
               [1], 'payments_s = payments.withWatermark("payment_time", "30 minutes")',
               "Outer stream-stream joins require watermarks so unmatched rows can be finalized; Databricks recommends watermarks on BOTH inputs. The payments side has none.",
               tags=("debug", "exam"), diff=3)
    ch.tf("In a long-running stream-static join, if the products dimension table is updated, Spark automatically recomputes all previously written enriched rows.", False,
          "Already-written outputs are not recomputed. New micro-batches may see the newer version, but history stays as it was. If correctness needs recomputation, consider materialized/declarative pipeline patterns (Phase 6).",
          tags=("pitfall",), diff=2)
    ch.write("Enrich `orders_stream` with the static table `ecommerce.silver.products` on `product_id`.",
             'products = spark.table("ecommerce.silver.products")\nenriched = orders_stream.join(products, "product_id")',
             ["spark.table", "ecommerce.silver.products", "join", "product_id"],
             "Stream-static join: the static side is read with spark.table (batch). Very common for dimension enrichment.", lang="python", tags=("syntax",), diff=1)
    ch.bucket("Stream-static or stream-stream join?", ["Stream-static", "Stream-stream"],
              [("orders stream + products table", 0), ("orders stream + payments stream", 1), ("needs watermarks on both sides", 1),
               ("static side may change without recomputing history", 0), ("buffers records waiting for a future match", 1)],
              "Only stream-stream joins buffer both sides in state and need watermarks/time bounds.", tags=("compare",), diff=1)

    # ================================================================ s12
    at(12)
    ch.mcq("Test Q28: Why can a stream fail if it was stopped beyond the Delta source's retention?",
           ["The checkpoint expires automatically after 7 days", "Required source versions/files may have been vacuumed before the stream catches up",
            "Delta tables can't be read by streams after 7 days", "The watermark deletes the source rows"], 1,
           "The checkpoint says 'I need version X', but VACUUM removed the physical files. The stream can't recover incrementally.",
           tags=("exam",), quick=True)
    ch.tf("Test Q29: To get a stream that fell behind Delta retention running again, set `spark.sql.files.ignoreMissingFiles=true`.", False,
          "No. Databricks warns this can silently produce incorrect streaming results. Increase retention or recover/rebuild the stream appropriately.",
          tags=("exam", "pitfall"), quick=True)
    ch.calc("A stream reading a Delta source stops on Friday. The source's file retention for VACUUM is 7 days. What is the maximum number of whole days the stream can stay stopped and still be sure to catch up (assuming VACUUM runs daily)?",
            7, "It must run at least once within the retention window: after more than 7 days, files it needs may be vacuumed. The '2 weeks later' restart in the source example fails.",
            unit="days", tags=("calc",), diff=2)
    ch.scenario("A Silver stream reading `ecommerce.bronze.events` was paused for a 3-week migration. On restart it fails with a missing-file error.",
                [("What do you check first?",
                  [("Source retention settings and DESCRIBE HISTORY for VACUUM runs during the pause", True, "Right — compare the pause with retention."),
                   ("The watermark delay", False, "Watermarks don't delete source files."),
                   ("Whether the trigger is AvailableNow", False, "Trigger type doesn't affect retention.")]),
                 ("VACUUM with 7-day retention ran weekly. A colleague suggests ignoreMissingFiles=true. Your answer?",
                  [("No — it may silently produce incorrect results; recover/rebuild instead", True, "Correct — don't suppress a correctness error."),
                   ("Yes, the missing files were probably empty", False, "You have no evidence of that; data would silently go missing."),
                   ("Yes, but only for one run", False, "One run is enough to lose data silently.")]),
                 ("How do you prevent it next time?",
                  [("Design retention and streaming operations together: longer retention or guarantee runs within the window", True, "Yes — a real production operational requirement."),
                   ("Delete the checkpoint before every pause", False, "That causes reprocessing and duplicates."),
                   ("Use complete mode", False, "Irrelevant to source retention.")])],
                "A stream must run at least once within the source retention window.", tags=("debug", "exam"), diff=2)
    ch.mcq("A Bronze Delta table used as a streaming source starts receiving UPDATE and DELETE commits. What is the right default thinking?",
           ["Nothing changes — a Delta source streams row-level changes automatically", "A simple Delta source is append-oriented; use Change Data Feed (or deliberately skip change commits) for row-level changes",
            "Switch the sink to complete mode", "Increase the watermark"], 1,
           "A plain Delta streaming source handles appends; non-append commits need care. CDF (`readChangeFeed`) propagates row-level changes; `skipChangeCommits` ignores them (changes not propagated).",
           tags=("pitfall", "concept"), diff=2)
    ch.match("Match the Delta-source option to its effect.",
             [("(default)", "non-append change commits make the stream fail"), ("skipChangeCommits", "ignore update/delete commits; changes not propagated"),
              ("readChangeFeed", "stream row-level inserts/updates/deletes via CDF"), ("ignoreMissingFiles=true", "hides missing files — can give silent wrong results")],
             "Pick the behaviour deliberately; never use ignoreMissingFiles as a retention workaround.", tags=("syntax", "pitfall"), diff=3)
    ch.write("Increase the source table's retention so a stopped stream has more time to catch up: set `delta.deletedFileRetentionDuration` to 14 days and `delta.logRetentionDuration` to 30 days on `ecommerce.bronze.events`.",
             "ALTER TABLE ecommerce.bronze.events SET TBLPROPERTIES (\n  'delta.logRetentionDuration' = 'interval 30 days',\n  'delta.deletedFileRetentionDuration' = 'interval 14 days'\n);",
             ["alter table", "set tblproperties", "delta.logRetentionDuration", "delta.deletedFileRetentionDuration", "interval 14 days"],
             "Increasing retention is one of the two correct fixes (the other: recover/rebuild the stream). It costs storage, so size it to your longest realistic stop.",
             lang="sql", tags=("syntax",), diff=2)

    # ================================================================ s13
    at(13)
    ch.free("Test Q20 + Q21: Why can foreachBatch duplicate external side effects, and what's the solution?",
            "A failed or retried micro-batch may invoke the foreachBatch function again for the same data. External sinks (email, APIs, other databases) don't participate in Spark/Delta transaction semantics, so their effects happen twice. Solution: make the side effects idempotent — e.g. MERGE/upsert by a stable business key and version, or use transactional sink semantics, so that replaying a batch yields the same end state.",
            ["retry re-invokes the function", "external sinks not transactional with Spark/Delta", "make it idempotent", "business key/version or transactional sink"],
            "foreachBatch gives power, but sink-side idempotency becomes your responsibility.", tags=("exam", "interview"), quick=True)
    ch.cloze("Complete the streaming upsert.",
             'from delta.tables import DeltaTable\n\ndef upsert(batch_df, [[batch_id]]):\n    target = DeltaTable.[[forName]](spark, "ecommerce.silver.customers")\n    (target.alias("t")\n        .[[merge]](batch_df.alias("s"), "t.customer_id = s.customer_id")\n        .[[whenMatchedUpdateAll]]()\n        .whenNotMatchedInsertAll()\n        .execute())\n\nquery = changes.writeStream.[[foreachBatch]](upsert).option("checkpointLocation", ckpt).start()',
             "The function receives each micro-batch as a batch DataFrame plus its batch_id; MERGE by key makes it idempotent.", as_code=True, tags=("syntax",), diff=2, quick=True)
    ch.spotbug("This foreachBatch keeps account balances. After a retry, some balances are doubled. Which line is the bug?",
               ["def apply(batch_df, batch_id):", "    for r in batch_df.collect():",
                '        spark.sql(f"UPDATE accounts SET balance = balance + {r.amount} WHERE id = {r.id}")',
                "query = tx.writeStream.foreachBatch(apply).option('checkpointLocation', ckpt).start()"],
               [2], "-- record each transaction once, keyed by tx_id (replay inserts nothing new)\nMERGE INTO ledger t USING batch s ON t.tx_id = s.tx_id\nWHEN NOT MATCHED THEN INSERT *\n-- balance = SUM(amount) per account, derived from the ledger",
               "`balance = balance + amount` is not idempotent: a replayed batch applies the increment twice. Key the effect by a stable business id (tx_id) / version so a replay changes nothing. (Collecting to the driver is a second smell.)",
               tags=("debug", "pitfall"), diff=3)
    ch.tf("`batch_id` alone is a universal business deduplication key for any external sink.", False,
          "batch_id can help some sinks recognise replayed batches, but it isn't a business key (and a new checkpoint restarts numbering). The safest design depends on the target system.",
          tags=("pitfall",), diff=2)
    ch.bucket("Idempotent on replay, or not?", ["Idempotent", "Not idempotent"],
              [("MERGE by customer_id, update to latest version", 0), ("balance = balance + incoming_amount", 1), ("send_email(customer)", 1),
               ("overwrite one deterministic partition with the batch's data", 0), ("plain INSERT/append without any key", 1), ("Delta write with txnAppId + txnVersion=batch_id", 0)],
              "Idempotent = running the same batch twice gives the same end state.", tags=("pitfall", "concept"), diff=2)
    ch.write("Write a foreachBatch function `merge_counts` that MERGEs `batch_df` into `ecommerce.gold.live_event_counts` on window start and event_type (update all when matched, insert all otherwise), and start the stream from `counts` in update mode with checkpoint `ckpt`.",
             'from delta.tables import DeltaTable\n\ndef merge_counts(batch_df, batch_id):\n    target = DeltaTable.forName(spark, "ecommerce.gold.live_event_counts")\n    (target.alias("t")\n        .merge(batch_df.alias("s"),\n               "t.window_start = s.window.start AND t.event_type = s.event_type")\n        .whenMatchedUpdateAll()\n        .whenNotMatchedInsertAll()\n        .execute())\n\n(counts.writeStream\n    .outputMode("update")\n    .foreachBatch(merge_counts)\n    .option("checkpointLocation", ckpt)\n    .start())',
             ["def merge_counts(batch_df, batch_id)", "DeltaTable.forName", "merge", "window.start", "event_type", "whenMatchedUpdateAll", "whenNotMatchedInsertAll", "foreachBatch(merge_counts)", "outputMode(\"update\")"],
             "Update mode hands only changed aggregates to the function; MERGE turns them into update-like semantics on the Delta table — what the Delta sink can't do directly.",
             lang="python", tags=("syntax", "exam"), diff=3)
    ch.mcq("Which of these can you do inside foreachBatch but NOT directly with a streaming Delta sink?",
           ["append rows", "MERGE (upsert) into a Delta table", "use a checkpoint", "complete mode"], 1,
           "foreachBatch exposes each micro-batch as a batch DataFrame, so batch-only operations like MERGE, complex Delta DML or custom sink logic become available.",
           tags=("concept",), diff=1)

    # ================================================================ s14
    at(14)
    ch.mcq("Test Q30: Input rate permanently exceeds processing rate. What happens?",
           ["Spark automatically drops the excess input", "Backlog and latency grow", "Exactly-once guarantees break", "The checkpoint fixes it on the next restart"], 1,
           "Sustained mismatch → backlog grows, latency grows, and eventually source retention may be exceeded. Q31: a checkpoint doesn't create capacity.",
           tags=("exam",), quick=True)
    ch.tf("Test Q31: A checkpoint can fix a throughput mismatch between source and pipeline.", False,
          "Checkpoint preserves correctness/progress; it doesn't create processing capacity. You need more capacity, a better query, larger batches, less state, better partitioning or less skew.",
          tags=("exam", "pitfall"), quick=True)
    ch.calc("Source produces 50 MB/s, the pipeline processes 20 MB/s. How many MB of backlog accumulate in 10 minutes?", 18000,
            "Net +30 MB/s × 600 s = **18,000 MB** (~18 GB) — and it keeps growing until capacity or efficiency changes.",
            unit="MB", tolerance=0, tags=("calc",), diff=2)
    ch.mcq("Test Q33: One state partition dominates (one task slow, one state partition huge, spill). Likely issue?",
           ["Too short watermark", "Key skew (e.g. user_id = 'anonymous' with 70% of events)", "Delta sink in append mode", "Checkpoint on a Volume"], 1,
           "A hot key in a stateful groupBy concentrates state and work in one partition. Streaming partition/key design matters.",
           tags=("exam", "debug"), quick=True)
    ch.calc("Trigger target = 5 s. In each micro-batch 99 partitions finish in 2 s, but one skewed partition takes 30 s. What is the minimum duration (s) of each micro-batch?", 30,
            "A stage finishes when its slowest task finishes → ≥ **30 s** per batch, 6× the trigger. Backlog grows — the Phase 1 ↔ Phase 5 connection.",
            unit="seconds", tags=("calc", "debug"), diff=1)
    ch.bucket("Effect of SMALL micro-batches (every 1 s) vs LARGE ones (every 1 min)?", ["Small micro-batches", "Large micro-batches"],
              [("lower latency", 0), ("better throughput efficiency", 1), ("more scheduling overhead", 0), ("more frequent commits & storage API calls", 0),
               ("smaller output files", 0), ("higher latency", 1), ("less per-batch overhead", 1)],
              "Streaming design balances latency, throughput, cost, state size and correctness.", tags=("compare",), diff=2)
    ch.odd("Which is NOT a valid fix for a sustained backlog?",
           ["more processing capacity", "reduce skew / better partitioning", "a new checkpoint location", "larger batches / less state"], 2,
           "A new checkpoint just restarts the query as new (reprocessing, duplicates) — it adds no capacity.", tags=("pitfall",), diff=1)
    ch.tf("Delta's streaming integration makes small files impossible, so trigger frequency never matters for file layout.", False,
          "Tiny micro-batches still create small files (1–3 MB each). OPTIMIZE/predictive optimization can compact later, but choose latency requirements sensibly.",
          tags=("pitfall",))
    ch.scenario("A clickstream aggregation by `user_id` gets slower each day. Spark UI: in every micro-batch, one task takes 40 s while the others take 2 s, with spill. Input rate is stable.",
                [("What is the first hypothesis?",
                  [("Key skew: one user_id holds a huge share of events/state", True, "Yes — one slow task + one huge state partition = hot key."),
                   ("The watermark is too short", False, "That drops late data; it doesn't create one slow task."),
                   ("The Delta sink doesn't support append", False, "It does.")]),
                 ("You find user_id = 'anonymous' is 70% of events. What do you do?",
                  [("Rethink the key design (e.g. handle anonymous traffic separately / different grouping key)", True, "Right — state partition/key design matters."),
                   ("Add more workers only", False, "One hot partition stays one task; more workers don't split it."),
                   ("Delete the checkpoint", False, "Loses state and reprocesses; skew remains.")])],
                "Stateful streaming + skew is especially bad: the hot key hurts every batch forever.", tags=("debug",), diff=2)

    # ================================================================ s15
    at(15)
    ch.free("Test Q32: Batch durations increase while input rate stays stable. What should you inspect?",
            "State growth (numRowsTotal of stateful operators), checkpoint/state-store overhead, sink and source performance (small files/output overhead, source metadata growth, sink slowdown) and ordinary Spark execution metrics. If state metrics grow endlessly, the watermark/state design is the primary suspect.",
            ["state growth / numRowsTotal", "checkpoint/state-store overhead", "source/sink performance, small files", "Spark execution (stages/tasks)", "watermark/state design primary suspect"],
            "Stable input + growing duration means each batch does more work for the same input — usually state.", tags=("exam", "debug"), quick=True)
    ch.mcq("lastProgress shows inputRowsPerSecond = 100,000 and processedRowsPerSecond = 40,000 for an hour. Conclusion?",
           ["Healthy — capacity to spare", "Backlog is growing; the pipeline can't keep up", "The watermark is too long", "Nothing — CPU is the only reliable metric"], 1,
           "Sustained input > processed → backlog grows. Input 50,000 vs processed 100,000 would mean spare capacity. This ratio is often more useful than cluster CPU.",
           tags=("debug",), quick=True)
    ch.order("Walk the production debugging tree for 'streaming latency high'.",
             ["Is input backlog growing?", "Which micro-batch is slow?", "Open Spark stage/task metrics", "Classify: Spark (shuffle/skew/spill/join)", "…or state (growth/watermark/state store)", "…or source/sink (throughput/API latency/storage)"],
             "Backlog → slow batch → stage/task metrics → then branch into Spark, state or source/sink factors.", tags=("debug",), diff=2)
    ch.bucket("Classify each finding into the tree's branches.", ["Spark execution", "State", "Source/Sink"],
              [("one task with huge shuffle read", 0), ("disk spill in the join stage", 0), ("numRowsTotal growing every batch", 1), ("watermark not advancing", 1),
               ("sink API calls slow / throttled", 2), ("storage writes slow", 2), ("RocksDB state-store commit time high", 1)],
              "Streaming adds state and source/sink factors on top of ordinary Spark performance.", tags=("debug",), diff=2)
    ch.scenario("A stream has stopped making progress: no new rows in the sink for two hours. Your manager says 'just restart it'.",
                [("What do you do before restarting?",
                  [("Inspect status/lastProgress and the query state first", True, "Right — don't restart blindly; preserve the evidence."),
                   ("Restart with a new checkpoint to be safe", False, "That creates a new query — reprocessing and duplicates."),
                   ("Increase the trigger interval", False, "Doesn't diagnose anything.")]),
                 ("The query is active and waiting for data. Next check?",
                  [("Is the source still producing — are new offsets/files available?", True, "Yes — maybe there's simply nothing new."),
                   ("Is the watermark too short?", False, "Watermarks affect late data, not whether new data is read."),
                   ("Is the output mode complete?", False, "Not related to progress.")]),
                 ("New files are there, but reading them fails with an authorization error. Likely cause?",
                  [("A permission/credential used by the job expired or was revoked", True, "One of the classic 'stopped progressing' causes."),
                   ("The checkpoint is too large", False, "That would slow, not deny access."),
                   ("Key skew", False, "Skew slows batches; it doesn't cause access errors.")])],
                "Checklist: query active? source producing? new offsets? checkpoint corrupted? sink blocked? state batch stuck? executor failure? permission expired? retention violated?",
                tags=("debug",), diff=2)
    ch.scenario("Users report that some late purchase events are missing from the 10-minute revenue windows.",
                [("What do you look at first?",
                  [("The missing events' event_time vs the max observed event time and the watermark at their arrival", True, "Yes — the event-time chain."),
                   ("The checkpoint folder", False, "Don't blame the checkpoint first unless evidence points there."),
                   ("Cluster CPU", False, "Missing late rows are a semantics question first.")]),
                 ("The watermark delay is 5 minutes; the events were 20 minutes behind the max event time. Conclusion?",
                  [("They were beyond the watermark and may be dropped — the tolerance is too short for real lateness", True, "Correct — measure real lateness and size the watermark."),
                   ("Exactly-once is broken", False, "Exactly-once is about commits, not lateness."),
                   ("The window boundaries are wrong", False, "They're assigned by event time correctly.")]),
                 ("What fix keeps late data without unbounded state?",
                  [("Increase the watermark to cover realistic lateness (accept more state/latency)", True, "That's the explicit latency/state/correctness trade-off."),
                   ("Remove the watermark entirely", False, "Unbounded state — and append mode wouldn't be allowed."),
                   ("Set ignoreMissingFiles=true", False, "Unrelated and dangerous.")])],
                "Missing late records: event_time → max observed → configured watermark → watermark progress → output mode → window boundaries.",
                tags=("debug", "exam"), diff=2)
    ch.scenario("After a cluster failure, the gold customer table and an external CRM both show duplicate entries.",
                [("Which question comes first?",
                  [("Is the sink a managed Delta sink, a custom sink or a foreachBatch?", True, "Exactly-once only holds where every piece participates."),
                   ("Is the trigger interval too short?", False, "Doesn't create duplicates."),
                   ("Is the watermark too long?", False, "Doesn't create duplicates.")]),
                 ("It's a foreachBatch that MERGEs into Delta and POSTs to the CRM. Where do the CRM duplicates come from?",
                  [("The retried batch re-ran the non-idempotent POST", True, "External side effects aren't covered by Delta transactions."),
                   ("Delta's MERGE duplicated rows", False, "MERGE by key is idempotent."),
                   ("The source can't contain duplicates", False, "Sources can — but here the retry explains it.")]),
                 ("But the Delta table has duplicates too. What else do you check?",
                  [("Whether the source itself contains duplicates or the checkpoint was reset", True, "Both are on the duplicates checklist."),
                   ("Whether update mode is enabled", False, "Not a duplicate mechanism."),
                   ("Whether Photon is on", False, "Unrelated.")])],
                "Checklist: Delta sink? custom sink? foreachBatch? source duplicates? checkpoint reset? non-idempotent side effect?",
                tags=("debug",), diff=3)
    ch.mcq("State store is huge. Which item is NOT on the 'state store huge' checklist?",
           ["number of keys", "dedup horizon", "join time bounds", "trigger output file size"], 3,
           "The checklist: number of keys, watermark, window duration, late-data tolerance, join time bounds, dedup horizon, stateful key skew. Output file size belongs to the sink/small-files branch.",
           tags=("debug",), diff=2)
    ch.cloze("Complete the monitoring calls.",
             "query.[[status]]          # what is it doing right now?\nquery.[[lastProgress]]    # metrics of the last micro-batch\nquery.[[recentProgress]]  # recent progress reports",
             "status = current activity; lastProgress = metrics of the last batch (rates, durations, state, watermark); recentProgress = history.",
             as_code=True, tags=("syntax",), diff=1)
    ch.tf("When batch durations grow while input is stable, and state metrics grow endlessly, the primary suspect is the watermark/state design.", True,
          "Stable input + growing state → each batch does more state work. Missing watermark, too long watermark, unbounded key cardinality or a bad stateful join.",
          tags=("debug",))

    # ================================================================ s16
    at(16)
    ch.free("Test Q35 (interview): How would you explain Structured Streaming?",
            "Structured Streaming treats an unbounded data source as an incrementally growing table. The developer defines transformations using Spark's DataFrame model, while the engine executes newly available data in micro-batches or supported low-latency modes. Checkpoints track source progress and commits, and state stores preserve intermediate state for aggregations, joins and deduplication. Watermarks bound that state and define lateness tolerance for event-time processing.",
            ["unbounded source as an incrementally growing table", "DataFrame model, micro-batches / low-latency modes", "checkpoints: progress + commits", "state stores for aggregations/joins/dedup", "watermarks bound state, lateness tolerance"],
            "A strong answer touches model, execution, durability, state and time — in that order.", tags=("interview", "exam"), quick=True)
    ch.cloze("Lab 1: complete the rate source.",
             'events = (\n    spark.readStream\n        .format("[[rate]]")\n        .option("[[rowsPerSecond]]", 10)\n        .load()\n)\ntransformed = events.withColumn("group_id", F.col("[[value]]") % 5)',
             "The rate source produces `timestamp` and an increasing `value` — a synthetic stream without external ingestion complexity.", as_code=True, tags=("syntax",), quick=True)
    ch.match("Match each lab to what it teaches.",
             [("Lab 2 — filter value % 2 = 0", "stateless: no aggregate state"), ("Lab 3 — groupBy(group_id).count()", "stateful: Spark remembers counts"),
              ("Lab 5 — AvailableNow rerun", "checkpoint remembers progress: nothing new"), ("Lab 6 — new checkpoint location", "checkpoint = query identity"),
              ("Lab 8 — foreachBatch print", "micro-batches become visible")],
             "Each lab isolates one engine concept; Lab 4 (windows) and Lab 7 (late data) cover event time.", tags=("concept",), quick=True)
    ch.order("Order the design questions of the best-practice mental model.",
             ["SOURCE: ordering/duplicate guarantees?", "EVENT TIME: which timestamp is reality?", "LATE DATA: how late can valid records be?", "STATE: what must be remembered?",
              "WATERMARK: when can old state go?", "TRIGGER: how much latency?", "SINK: idempotent commits?", "CHECKPOINT & RETENTION: durable progress, recoverable source?"],
             "Mnemonic S-E-L-S-W-T-S-C-R. These are not independent choices — each one constrains the next.", tags=("concept",), diff=3)
    ch.write("Mini-project Gold: from `ecommerce.silver.events`, 20-minute watermark on `event_time`, count events per 5-minute window and `event_type` as `events`, append to `ecommerce.gold.events_5min` with checkpoint `/Volumes/ecommerce/system/events_gold_5min`.",
             'gold = (\n    spark.readStream\n        .table("ecommerce.silver.events")\n        .withWatermark("event_time", "20 minutes")\n        .groupBy(F.window("event_time", "5 minutes"), "event_type")\n        .agg(F.count("*").alias("events"))\n)\n(\n    gold.writeStream\n        .outputMode("append")\n        .option("checkpointLocation", "/Volumes/ecommerce/system/events_gold_5min")\n        .toTable("ecommerce.gold.events_5min")\n)',
             ["readStream", "ecommerce.silver.events", 'withWatermark("event_time", "20 minutes")', 'F.window("event_time", "5 minutes")', "event_type",
              'alias("events")', 'outputMode("append")', "events_gold_5min", "toTable"],
             "Stateful windowed aggregation + watermark + append: one final row per window and event type; state evicted after finalization.",
             lang="python", tags=("syntax",), diff=3)
    ch.write("Mini-project Silver: stream `ecommerce.bronze.events`, drop rows with NULL `event_id` or `event_time`, write with AvailableNow to `ecommerce.silver.events`, checkpoint `/Volumes/ecommerce/system/bronze_to_silver_events`.",
             'bronze = spark.readStream.table("ecommerce.bronze.events")\nsilver = (\n    bronze\n        .filter("event_id IS NOT NULL")\n        .filter("event_time IS NOT NULL")\n)\n(\n    silver.writeStream\n        .trigger(availableNow=True)\n        .option("checkpointLocation", "/Volumes/ecommerce/system/bronze_to_silver_events")\n        .toTable("ecommerce.silver.events")\n)',
             ["readStream", "event_id IS NOT NULL", "event_time IS NOT NULL", "availableNow=True", "bronze_to_silver_events", 'toTable("ecommerce.silver.events")'],
             "Stateless clean/validate step: only progress is tracked, so AvailableNow on a schedule is perfect.", lang="python", tags=("syntax",), diff=2)
    ch.bucket("Mini-project test plan: what do you EXPECT to see?", ["Row appears/updates correctly", "Row may be dropped", "Problem: reprocessing/failure risk"],
              [("on-time events", 0), ("late events within the 20-min watermark", 0), ("very late events beyond the watermark", 1),
               ("a normal stream restart with the same checkpoint", 0), ("restart with a new checkpoint (sandbox)", 2), ("prolonged stop beyond source retention", 2)],
              "Testing deliberately teaches the semantics: watermark tolerance, checkpoint identity and retention. (Duplicate business events would also pass through — dedup is separate.)",
              tags=("pitfall", "concept"), diff=2)
    ch.tf("Lab 6 (using a new checkpoint location to see the stream restart as new) is a reasonable quick fix to try in production when a stream misbehaves.", False,
          "Only in a sandbox. In production a new checkpoint means a new query: reprocessing, duplicate side effects and lost state.",
          tags=("pitfall",))
    ch.mcq("You want to run the mini-project's Gold query on a serverless job. What must change?",
           ["Nothing — the default trigger works everywhere", "Add .trigger(availableNow=True) and schedule the job", "Switch to complete mode", 'Use .trigger(processingTime="1 minute")'], 1,
           "Serverless notebooks/jobs support AvailableNow (and deprecated Once), not default/time-based triggers. For always-on, use a Lakeflow pipeline in continuous mode.",
           tags=("exam",), diff=2)
