# -*- coding: utf-8 -*-
"""ch13 playbooks, extra debug order exercises, pitfalls, flashcards."""


def S(n): return f"ch13-s{n:02d}"


def build(ch):
    # ------------------------------------------------------------ playbooks
    ch.playbook(1, "Streaming latency high — the production debugging tree (master playbook)", S(15),
        "End-to-end latency keeps rising; dashboards are minutes or hours behind; batch durations exceed the trigger interval.",
        ["Is the input backlog actually growing — is inputRowsPerSecond above processedRowsPerSecond, sustained?",
         "Which micro-batch got slow, and since when (a deploy, a data change, a key)?",
         "Inside that batch, which stage and which tasks dominate?",
         "Is it an ordinary Spark problem — shuffle, skew, spill, a bad join?",
         "Is it a state problem — state growing, watermark not advancing, state-store commit time?",
         "Is it a source/sink problem — source throughput, sink API latency, storage writes?",
         "Am I about to 'fix' it with a restart or a new checkpoint instead of with evidence?"],
        [("Compare input vs processed rate in `query.lastProgress` / recentProgress", "Confirms a real backlog vs a one-off spike", "p = query.lastProgress\np['inputRowsPerSecond'], p['processedRowsPerSecond']"),
         ("Find the slow micro-batch (durationMs over time)", "Pinpoints when the regression started"),
         ("Open Spark UI stage/task metrics for that batch", "Median vs max task duration, shuffle read, spill"),
         ("Check stateOperators (numRowsTotal, memory) and the eventTime watermark", "State growth / stuck watermark is streaming-specific"),
         ("Check source and sink throughput/latency", "External bottlenecks don't show up as CPU"),
         ("Fix the branch you found: capacity, query, partitioning/skew, state design, sink", "No checkpoint magic fixes throughput")],
        ["ingestion rate > processing capacity", "skew / shuffle / spill inside the micro-batch", "unbounded or skewed state", "slow source or sink"],
        "Follow the tree: backlog → slow batch → stage/task metrics → Spark vs state vs source/sink branch, then fix that branch (capacity, query, key design, watermark, sink).",
        "B-B-S then 3 S's: Backlog → Batch → Stage, then Spark / State / Source-sink")
    ch.playbook(2, "Stream stopped making progress", S(15),
        "No new rows reach the sink for a long time; the query may look 'running' or may have stopped.",
        ["Is the query actually active (status) or has it terminated with an exception?",
         "Is the source still producing — are there new offsets/files available?",
         "Is the checkpoint corrupted or pointing somewhere unexpected?",
         "Is the sink blocked (locks, throttling, failing writes)?",
         "Is a stateful batch stuck (huge state commit)?",
         "Did an executor fail repeatedly?",
         "Did a permission or credential expire?",
         "Was source retention violated while it was stopped?"],
        [("Read `query.status`, `query.lastProgress` and the exception (if any)", "Evidence before action", "query.status\nquery.lastProgress\nquery.exception()"),
         ("Check the source for new data/offsets", "Maybe there's simply nothing new"),
         ("Inspect checkpoint location and recent commits", "Is progress being recorded?"),
         ("Check sink, executors and permissions in the logs", "Blocked sink, executor loss and expired permissions all stall progress"),
         ("Compare the stop duration with source retention", "Missing-file failures need recover/rebuild, not ignoreMissingFiles")],
        ["query terminated", "no new source data", "corrupted/changed checkpoint", "blocked sink", "stuck state batch", "executor failure", "expired permission", "source retention violated"],
        "Don't restart blindly. Identify which of the nine checks fails, fix that cause, then restart on the SAME checkpoint.",
        "ON → FED → STUCK → ALLOWED (active? source producing? something stuck? still permitted & retained?)")
    ch.playbook(3, "Batch durations increase while input is stable", S(15),
        "Batch duration goes 10 s → 12 s → 20 s → 40 s → 2 min … while inputRowsPerSecond stays flat.",
        ["Is state (numRowsTotal) growing every batch?",
         "Is there a watermark at all — and is it far longer than real lateness?",
         "Is the key cardinality unbounded (new keys forever)?",
         "Is a stateful join or dedup missing time bounds?",
         "Is checkpoint/state-store overhead rising (consider RocksDB + changelog checkpointing)?",
         "Are tiny output files or source metadata growth slowing each batch?",
         "Is the sink getting slower?"],
        [("Plot numRowsTotal from stateOperators across batches", "Endless growth = watermark/state design is the primary suspect"),
         ("Review watermark, window duration, join bounds and dedup horizon", "Each is a state bound"),
         ("Check state-store commit/checkpoint durations", "State-store architecture may matter more than compute"),
         ("Check sink file sizes and sink latency", "Small files / sink slowdown add per-batch cost")],
        ["state growth (missing/too long watermark, unbounded keys, bad stateful join)", "checkpoint overhead", "small files / output overhead", "source metadata growth", "sink slowdown"],
        "Bound the state (add/shorten watermark to realistic lateness, time-bound joins/dedup, fix key design), use RocksDB + changelog checkpointing for large state, compact small files.",
        "Stable in, slower out → suspect STATE first")
    ch.playbook(4, "Late records are missing from windowed results", S(7),
        "Some events that happened inside a window never show up in its aggregate; nothing failed.",
        ["What event_time did the missing records carry?",
         "What was the maximum event time already observed when they arrived?",
         "What watermark delay is configured, on which column?",
         "Had the watermark already passed their window when they arrived?",
         "Which output mode is used — and has the window been emitted yet?",
         "Are the window boundaries what I think (start inclusive, end exclusive)?",
         "Am I wrongly reasoning from arrival time instead of event time?"],
        [("Look up the missing rows' event_time in Bronze", "Starting point of the event-time chain"),
         ("Read the watermark from lastProgress around their arrival", "Was the record behind the watermark?", "query.lastProgress['eventTime']['watermark']"),
         ("Check withWatermark column and delay", "Watermark must be on event time, not ingest time"),
         ("Check output mode and whether the window is final yet", "Append may simply not have emitted it yet"),
         ("Only then look at the checkpoint", "Don't blame the checkpoint first without evidence")],
        ["watermark too short for real lateness", "watermark on the wrong (processing-time) column", "window not yet final in append mode", "misunderstood window boundaries"],
        "Size the watermark from measured lateness (accepting more state/latency), make sure it is on the event-time column, and explain append-mode finalization to consumers.",
        "E-M-W-P-O-W: Event time, Max seen, Watermark, Progress, Output mode, Window")
    ch.playbook(5, "Duplicates after a failure", S(10),
        "After a crash/restart, the target table or an external system contains the same business record twice.",
        ["Is the sink a managed Delta sink (exactly-once) or a custom/foreachBatch sink?",
         "Does foreachBatch perform a non-idempotent side effect (append without key, balance += x, emails, API calls)?",
         "Does the source itself contain duplicate business events?",
         "Was the checkpoint reset, deleted or changed?",
         "Are two queries writing the same target?"],
        [("Identify the sink type and the foreachBatch logic", "Exactly-once stops at non-transactional edges"),
         ("Count duplicates in the source by business key", "Processing guarantee ≠ business dedup", "SELECT event_id, COUNT(*) FROM ecommerce.bronze.events\nGROUP BY event_id HAVING COUNT(*) > 1"),
         ("Check checkpoint history/location changes", "A new checkpoint = new query = reprocessing"),
         ("Make writes idempotent (MERGE by key/version) and add dedup with a watermark", "Replay must give the same end state")],
        ["non-idempotent foreachBatch side effect replayed", "source duplicates", "checkpoint reset", "custom sink without transactions"],
        "Exactly-once is end-to-end only where every piece participates: use Delta sinks or idempotent MERGE by business key, dedup source duplicates with watermark-bounded dropDuplicates, never reset checkpoints casually.",
        "Sink → Side effect → Source → Checkpoint")
    ch.playbook(6, "State store is huge", S(5),
        "State memory/rows keep growing, checkpoints get large, batches slow, executors spill or OOM.",
        ["How many keys does the state hold — is key cardinality unbounded?",
         "Is there a watermark, and how long is it?",
         "How long are the windows?",
         "How much late-data tolerance did we really need?",
         "Do stream-stream joins have time bounds on both sides?",
         "What is the dedup horizon?",
         "Is one stateful key skewed (e.g. 'anonymous')?"],
        [("Read stateOperators metrics (numRowsTotal, memory) per batch", "Quantify growth"),
         ("Review watermark, window duration, join bounds, dedup horizon", "Each bounds or unbounds state"),
         ("Check per-partition state size", "Skewed key → one hot state partition"),
         ("Consider RocksDB with changelog checkpointing", "State-store architecture for large state")],
        ["semantically unbounded state", "watermark missing/too long", "long windows", "unbounded joins/dedup", "key skew"],
        "The fix isn't necessarily bigger compute — bound the state semantically (watermark, join bounds, dedup horizon, key design), then choose the right state store.",
        "Keys, Clock, Joins, Dedup, Skew")
    ch.playbook(7, "Delta-source stream fails after a long stop (missing files)", S(12),
        "A stream reading a Delta table restarts after weeks and fails with a missing-file / file-not-found style error.",
        ["How long was the stream stopped vs the source's retention?",
         "Did VACUUM run on the source meanwhile (DESCRIBE HISTORY)?",
         "Which source version does the checkpoint still need?",
         "Am I tempted to set ignoreMissingFiles — do I accept silent wrong results? (No.)"],
        [("Compare the stop window with retention properties", "Explains whether needed files were vacuumed", "SHOW TBLPROPERTIES ecommerce.bronze.events;"),
         ("Check DESCRIBE HISTORY for VACUUM operations", "Confirms the physical deletion", "DESCRIBE HISTORY ecommerce.bronze.events;"),
         ("Recover/rebuild the stream appropriately (reset + full refresh/backfill)", "Incremental catch-up is impossible"),
         ("Increase retention / guarantee a run within the window", "Prevent recurrence")],
        ["stream stopped longer than source retention", "VACUUM removed files the checkpoint needs"],
        "Never use spark.sql.files.ignoreMissingFiles=true as a workaround. Rebuild/backfill now; design retention and run frequency together (run at least once per retention window).",
        "Retain, don't ignore")
    ch.playbook(8, "Append output looks delayed / Gold table empty for recent windows", S(8),
        "Events arrive in Bronze instantly, but the windowed Gold table (append mode) shows nothing for the last N minutes.",
        ["Is this a stateful aggregation in append mode with a watermark?",
         "How far is the current watermark behind the max event time?",
         "Has the watermark passed the end of the windows I expect?",
         "Are batches actually fast (no backlog)?",
         "Do consumers really need finalized rows, or live-updating rows?"],
        [("Read eventTime.watermark from lastProgress", "Windows emit only after the watermark passes their end"),
         ("Check batch durations and rates", "Rule out real lag"),
         ("If live values are required, switch to foreachBatch + MERGE (update-like)", "Delta sink has no update mode")],
        ["intended append-mode finalization delay (window + watermark)", "actual backlog (less likely if batches are fast)"],
        "Explain the expected delay (≈ window length + watermark delay), or provide a live table via foreachBatch + MERGE while keeping the append table for final results.",
        "Append waits for FINAL")
    ch.playbook(9, "Stateful query won't restart after a code deployment", S(9),
        "After deploying a new version, the streaming query fails at startup on the existing checkpoint (or produces odd state).",
        ["Is this query stateful?",
         "Did the change touch state keys, state schema, source type or number/type of stateful operators?",
         "Did I test this restart against a copy of the checkpoint?",
         "Can I afford a new checkpoint + backfill?"],
        [("Diff the old and new query plans for stateful operators", "Find the incompatible change"),
         ("Consult the checkpoint compatibility rules", "Some stateless changes are fine; stateful ones usually aren't"),
         ("If incompatible: new checkpoint + planned full recomputation/backfill", "State schema is effectively production data")],
        ["changed state keys", "changed state schema", "changed source type", "changed number/type of stateful operators"],
        "Roll back, or deliberately start a new checkpoint with a planned backfill. Never hand-edit checkpoint folders.",
        "Same checkpoint ≠ seamless")
    ch.playbook(10, "Micro-batches overrun the trigger because of skew", S(14),
        "Trigger 5 s, yet every micro-batch takes 30+ s; one task is far slower than the rest; backlog grows.",
        ["Is the max task duration far above the median?",
         "Does the slow task have the biggest shuffle read / spill?",
         "Is it a stateful groupBy on a hot key (e.g. user_id = 'anonymous')?",
         "Would more workers help — or is it one partition?"],
        [("Spark UI: compare median vs max task in the slow stage", "Skew signal"),
         ("Find the hot key in the input", "Explains the hot state partition", "events.groupBy('user_id').count().orderBy('count', ascending=False).limit(10)"),
         ("Redesign the key / handle the hot key separately", "Streaming key design matters")],
        ["key skew in a shuffle or stateful operator", "too few partitions"],
        "Fix the data distribution (key design, separate hot-key handling, partitioning) rather than only adding workers.",
        "Median vs max")
    ch.playbook(11, "Delta-source stream fails after UPDATE/DELETE on the source", S(12),
        "A stream reading a Delta table fails after someone ran UPDATE, DELETE or MERGE on that source table.",
        ["Is the source table append-only in my design, or does it receive row-level changes?",
         "Do downstream consumers need those changes propagated?",
         "Should I read the Change Data Feed instead?",
         "If I skip change commits, am I OK with changes NOT being propagated?"],
        [("Check DESCRIBE HISTORY on the source for non-append operations", "Find the offending commits"),
         ("Decide semantics: propagate (readChangeFeed) or ignore (skipChangeCommits)", "A simple Delta source is append-oriented")],
        ["non-append commits on a Delta source read as a plain append stream"],
        "Use Change Data Feed to propagate row-level changes, or skipChangeCommits deliberately if they must be ignored; keep Bronze append-only where possible.",
        "Append in, CDF for changes")

    # ------------------------------------------------------------ debug order exercises (one per playbook topic)
    def at(n): ch.cur = S(n)
    at(15)
    ch.order("Stream stopped making progress: order the checks as in the playbook (mnemonic ON → FED → STUCK → ALLOWED).",
             ["Is the query active?", "Is the source still producing / new offsets available?", "Is the checkpoint corrupted?", "Is the sink blocked?",
              "Is a state batch stuck or an executor failing?", "Did a permission expire?", "Was source retention violated?"],
             "Start with the cheapest/most obvious (is it even running? is there new data?) before deeper causes; never restart blindly.",
             tags=("debug",), diff=2)
    ch.order("Batch durations grow with stable input: order the investigation.",
             ["Confirm input rate is stable but duration grows", "Check state metrics (numRowsTotal) across batches", "Review watermark / window / join bounds / dedup horizon",
              "Check checkpoint/state-store overhead", "Check small files and sink latency"],
             "State is the primary suspect when input is stable; then state-store overhead; then output/sink costs.", tags=("debug",), diff=2)
    at(7)
    ch.order("Missing late records: order the event-time chain (E-M-W-P-O-W).",
             ["the record's event_time", "max observed event time at arrival", "configured watermark delay/column", "watermark progress", "output mode", "window boundaries"],
             "Reason in event time. Only blame the checkpoint if evidence points there.", tags=("debug",), diff=2)
    at(10)
    ch.order("Duplicates after failure: order the questions.",
             ["Delta sink or custom/foreachBatch sink?", "Non-idempotent side effect in foreachBatch?", "Does the source itself contain duplicates?", "Was the checkpoint reset?"],
             "Sink type first (where exactly-once ends), then side effects, then source duplicates and checkpoint resets.", tags=("debug",), diff=2)
    at(5)
    ch.scenario("The state of `groupBy(\"session_id\").count()` grows by millions of rows every day and batches keep slowing down. There is no watermark.",
                [("Why is state growing forever?",
                  [("New session_ids keep appearing and nothing tells Spark it can forget old ones", True, "Unbounded key cardinality with no time bound."),
                   ("The checkpoint is duplicated", False, "No evidence of that."),
                   ("Append mode stores every row twice", False, "Not how output modes work.")]),
                 ("What is the most effective fix?",
                  [("Add an event-time window + watermark so old sessions' state can be evicted", True, "Bound the state semantically."),
                   ("Double the cluster", False, "Buys time; state keeps growing."),
                   ("Use complete mode", False, "Complete mode never evicts state.")])],
                "State store huge: maybe the state is semantically unbounded — fix the semantics before the hardware.", tags=("debug",), diff=2)
    ch.order("State store huge: order the checks (Keys, Clock, Joins, Dedup, Skew).",
             ["number of keys", "watermark / window duration / late tolerance", "join time bounds", "dedup horizon", "stateful key skew"],
             "Each item is a reason state can't be evicted or is concentrated.", tags=("debug",), diff=2)
    at(12)
    ch.order("Delta-source stream fails after a long stop: order the response.",
             ["Compare stop duration with source retention", "Confirm VACUUM ran (DESCRIBE HISTORY)", "Reject the ignoreMissingFiles workaround",
              "Recover/rebuild the stream (reset + backfill)", "Increase retention / guarantee runs within the window"],
             "Diagnose, refuse the silent-wrong-results shortcut, rebuild, then prevent.", tags=("debug",), diff=2)

    # ------------------------------------------------------------ pitfalls
    P = ch.pitfall
    P("read instead of readStream", "`spark.read` builds a bounded batch DataFrame; calling `.writeStream` on it fails.", "Use `spark.readStream` for streaming sources.")
    P("Expecting readStream to start processing", "readStream only defines a plan; nothing runs until a sink is started.", "Start the query with `writeStream ... toTable()/start()`.")
    P("Trigger interval ≠ completion guarantee", "A 5-second trigger with 12-second batches builds a backlog; batches don't run in parallel.", "Treat sustained overrun as capacity problem; fix capacity/query/skew.")
    P("Using Trigger.Once", "Once is deprecated.", "Use `trigger(availableNow=True)`.")
    P("processingTime on serverless", "Serverless notebooks/jobs don't support time-based or real-time triggers.", "Use AvailableNow on a schedule, or a Lakeflow pipeline in continuous mode for always-on.")
    P("Real-time mode for ordinary ETL", "Ultra-low latency adds cost/complexity most lakehouse ETL doesn't need.", "Default to micro-batch or AvailableNow.")
    P("Unbounded state", "Stateful queries without a time bound (aggregation, dedup, joins) keep keys forever → memory, checkpoint size, slow batches, OOM.", "Add watermarks, window/time bounds, dedup horizon; review key cardinality.")
    P("Arrival time ≠ event time", "Windowing or watermarking on processing/ingest time puts late events in the wrong window or drops them.", "Window and watermark on the event-time column.")
    P("Watermark as a wall-clock timer", "Lateness is relative to max observed event time, not to now − event_time.", "Reason: watermark ≈ max event time − delay.")
    P("Watermark too short", "Valid late records beyond the tolerance may be dropped.", "Size it from measured real lateness; accept the state/latency cost.")
    P("Watermark as retention policy", "A watermark never deletes table rows; it only affects streaming state and late data.", "Use DELETE/retention/VACUUM for data lifecycle.")
    P("Watermark after the aggregation", "Defined after groupBy, it can't bound the aggregation's state.", "Call withWatermark before groupBy, on the window's time column.")
    P("Update mode into a Delta sink", "The Delta sink supports append and complete only.", "Use foreachBatch + MERGE for update-like results.")
    P("Complete mode on high-cardinality aggregates", "Complete mode doesn't evict state via watermark and rewrites everything.", "Prefer append/update with watermark, or MERGE.")
    P("Append output 'delayed'", "Append emits windows only once final (window end + watermark).", "Explain expected delay or provide a live MERGE table.")
    P("Deleting or changing the checkpoint", "The query restarts as new: reprocessing, duplicate side effects, lost state.", "Keep one stable checkpoint per query; resets only deliberately (sandbox / planned backfill).")
    P("Assuming new code reuses the checkpoint", "Changing state keys/schema/source/stateful operators can be checkpoint-incompatible.", "Check compatibility rules and test stateful deployments.")
    P("Exactly-once ≠ no duplicates", "Source duplicates pass through; non-idempotent foreachBatch side effects replay.", "Dedup business keys; make side effects idempotent.")
    P("Non-idempotent foreachBatch", "Retries can call the function twice (balance += x, emails).", "MERGE by business key/version or transactional sink semantics.")
    P("Unbounded dropDuplicates", "dropDuplicates without a watermark remembers every key forever.", "Watermark + include event_time, or dropDuplicatesWithinWatermark.")
    P("Stream-stream join without watermarks", "Join state grows without bound; outer joins are rejected.", "Watermarks on both inputs + time-range join condition.")
    P("Using max multiple-watermark policy casually", "Faster progress but records of the slower stream may be dropped.", "Keep the default min unless you accept the loss.")
    P("Expecting stream-static joins to recompute history", "A changed dimension doesn't rewrite already-written outputs.", "Use materialized/declarative patterns if recomputation is required.")
    P("Stopping a Delta-source stream longer than retention", "Vacuumed files make incremental catch-up impossible.", "Run at least once per retention window; increase retention.")
    P("ignoreMissingFiles as a fix", "Hides missing data → silent incorrect results.", "Increase retention or recover/rebuild the stream.")
    P("UPDATE/DELETE on a Delta streaming source", "A plain Delta source is append-oriented; change commits break or get skipped.", "Use Change Data Feed or skipChangeCommits deliberately.")
    P("Tiny triggers → small files", "Every micro-batch writes small files and commits.", "Choose a sensible latency; rely on OPTIMIZE/predictive optimization.")
    P("Thinking a checkpoint adds throughput", "Checkpoint preserves progress; it doesn't create capacity.", "Add capacity, cheaper query, less state, less skew.")
    P("Skewed stateful key", "One hot key (e.g. 'anonymous') creates a hot state partition that slows every batch.", "Redesign keys / handle hot keys separately.")
    P("Checkpoint = 'last timestamp'", "A checkpoint stores offsets, commits, state and query metadata — not just a timestamp.", "Treat it as the query's identity and durable memory.")
    P("AvailableNow = run forever", "AvailableNow processes the currently available backlog incrementally and then stops.", "Schedule it (e.g. hourly) for incremental batch; use continuous modes for always-on.")
    P("Restarting blindly", "Restarts (especially with new checkpoints) destroy evidence and can duplicate data.", "Inspect status/lastProgress first.")

    # ------------------------------------------------------------ flashcards
    C = ch.card
    C("What does Structured Streaming treat a stream as?", "An incrementally growing (unbounded) table processed by the same Spark engine.", S(1))
    C("Bounded vs unbounded dataset?", "Bounded: known end, process once and stop. Unbounded: keeps growing, processed incrementally.", S(1))
    C("Why can streaming reuse batch DataFrame syntax?", "Same DataFrame/query-planning model, executed incrementally over unbounded input.", S(1))
    C("read vs readStream?", "read = bounded batch read; readStream = streaming source with progress tracking.", S(2))
    C("Does readStream start processing?", "No — lazy plan only. writeStream ... toTable()/start() starts the query.", S(2))
    C("Three parts of every stream?", "Source → transformation → sink.", S(2))
    C("query.lastProgress vs query.status?", "lastProgress = metrics of the last micro-batch; status = what it's doing now.", S(2))
    C("What is a micro-batch?", "A bounded chunk of newly available data executed as a Spark job.", S(3))
    C("processingTime trigger meaning?", "How often Spark attempts a new micro-batch — not a completion guarantee.", S(3))
    C("Trigger 5 s, batch takes 12 s?", "Batches run sequentially → backlog builds, latency grows (ingest > capacity).", S(3))
    C("Default trigger?", "processingTime = 0: next micro-batch as soon as the previous finishes.", S(4))
    C("AvailableNow?", "Process all currently available unprocessed input incrementally, then stop.", S(4))
    C("Once vs AvailableNow?", "Once is deprecated; AvailableNow replaces it (can use several batches).", S(4))
    C("Serverless notebooks/jobs triggers?", "AvailableNow ✅, Once ✅ (deprecated), ProcessingTime ❌, RealTime ❌.", S(4))
    C("Always-on streaming on serverless?", "Lakeflow pipeline in continuous mode.", S(4))
    C("Real-time mode?", "Classic-only ultra-low-latency (sub-second) operational streaming; not the default for ETL.", S(4))
    C("Stateless query definition?", "Keeps no intermediate state beyond source→sink progress tracking.", S(5))
    C("Stateful operators?", "Aggregations, distinct/dropDuplicates, stream-stream joins, custom stateful ops.", S(5))
    C("What is state?", "Info from previous micro-batches needed to process the next ones — the working memory.", S(5))
    C("Recommended state store for demanding workloads?", "RocksDB with changelog checkpointing.", S(5))
    C("Event time vs processing time?", "Event time = when it happened (data column). Processing time = when the engine processed it.", S(6))
    C("Why can events arrive late?", "Offline mobile, network delay, Kafka backlog, outage, retry, batch upload, clock skew.", S(6))
    C("Which window does event_time 10:03 land in (10-min tumbling)?", "[10:00–10:10), regardless of arrival time.", S(6))
    C("Tumbling vs sliding window?", "Tumbling: non-overlapping, 1 window per event. Sliding: overlapping, window/slide windows per event.", S(6))
    C("Watermark definition?", "Event-time threshold that lets Spark drop old state and control late data.", S(7))
    C("How is the watermark computed?", "≈ max observed event time − delay (at least the delay behind; not exact).", S(7))
    C("Max event 12:00, delay 10 min → watermark?", "≈ 11:50.", S(7))
    C("Short watermark pros/cons?", "Less state, lower latency; but less tolerance for late data.", S(7))
    C("Long watermark pros/cons?", "More late data accepted; more state, memory, checkpoint size, latency.", S(7))
    C("Is a watermark a retention policy?", "No — it never deletes table rows; only bounds state/late data.", S(7))
    C("Is 'late' = now − event_time?", "No — late is relative to event-time watermark progress.", S(7))
    C("Append / Update / Complete?", "Final rows / changed rows / entire result each trigger.", S(8))
    C("Output modes of the Delta sink?", "Append and complete — not update (use foreachBatch + MERGE).", S(8))
    C("Complete mode and watermark eviction?", "Complete mode doesn't evict aggregation state via watermark.", S(8))
    C("Why does append output look delayed?", "Stateful aggregate + append + watermark → waits until the window is final.", S(8))
    C("What's in a checkpoint?", "offsets, commits, state (stateful), metadata — not just a last timestamp.", S(9))
    C("Commit log purpose?", "Records which micro-batches committed to the sink — key to exactly-once.", S(9))
    C("Deleting the checkpoint?", "Next run is a new query: reprocessing, duplicate side effects, lost state.", S(9))
    C("Checkpoint-incompatible changes?", "State keys, state schema, source type, number/type of stateful operators.", S(9))
    C("Exactly-once trio for Delta sinks?", "Source offsets + checkpoint commits + Delta transaction log.", S(10))
    C("Where does exactly-once stop?", "At the edges: custom/non-transactional sinks and external side effects.", S(10))
    C("Does exactly-once remove source duplicates?", "No — processing guarantee ≠ business deduplication.", S(10))
    C("Bounded streaming dedup?", 'withWatermark("event_time", "1 hour").dropDuplicates(["event_id", "event_time"]).', S(10))
    C("Why do stream-stream joins need state?", "A record may wait for a later match from the other stream.", S(11))
    C("Outer stream-stream join requirement?", "Watermark (+ time constraint) — to know when unmatched rows are final.", S(11))
    C("Default multiple-watermark policy?", "min — the slowest input decides global progress (safer).", S(11))
    C("Stream-static join caveat?", "Dimension changes don't recompute already-written outputs.", S(11))
    C("Delta source with UPDATE/DELETE?", "Append-oriented source; use Change Data Feed (or skipChangeCommits deliberately).", S(12))
    C("Stream stopped beyond source retention?", "Needed files may be vacuumed → can't catch up; reset/full refresh needed.", S(12))
    C("ignoreMissingFiles=true as a fix?", "Never — can silently produce incorrect results.", S(12))
    C("foreachBatch signature?", "func(batch_df, batch_id) — each micro-batch as a batch DataFrame.", S(13))
    C("Classic streaming upsert?", "foreachBatch + DeltaTable MERGE (whenMatchedUpdateAll / whenNotMatchedInsertAll).", S(13))
    C("Main foreachBatch responsibility?", "Sink-side idempotency — a retried batch may run again.", S(13))
    C("Is batch_id a universal dedup key?", "No — it can help detect replays in some sinks; design depends on the target.", S(13))
    C("Small vs large micro-batches?", "Small: low latency, more overhead, small files. Large: throughput, higher latency.", S(14))
    C("50 MB/s in, 20 MB/s processed?", "+30 MB/s backlog; no checkpoint can fix it.", S(14))
    C("Signs of a hot stateful key?", "One slow task, one huge state partition, spill, increasing latency.", S(14))
    C("Input vs processed rate check?", "Sustained inputRowsPerSecond > processedRowsPerSecond → backlog grows.", S(15))
    C("Debugging tree branches?", "Spark (shuffle/skew/spill/join), State (growth/watermark/state store), Source/Sink (throughput/API latency/storage).", S(15))
    C("Batch durations grow, input stable — first suspect?", "State growth → watermark/state design.", S(15))
    C("Rate source columns?", "timestamp and value (option rowsPerSecond).", S(16))
    C("Best-practice design questions?", "Source, event time, late data, state, watermark, trigger, sink, checkpoint, retention — designed together.", S(16))
