# ch12 part 3: s09-s12

# =====================================================================
s09 = C.sec(9, "schemaLocation vs checkpointLocation & What Happens Inside",
            "Two folders, two memories: one remembers the SHAPE of the data, the other remembers HOW FAR you got.")
S("§36", "§37", "§38", "§39", "§97", "Q11", "Q12", "Q13")
C.p("An Auto Loader pipeline has **two state locations**. Beginners mix them up constantly.")
C.diagram("""
 cloudFiles.schemaLocation          checkpointLocation
 ─────────────────────────          ──────────────────────────
 "What SHAPE does the data have?"   "How FAR has this stream got?"
  • schema I inferred                • files already processed
  • how it evolved                   • offsets / batch ids
  • schema versions  (_schemas/)     • stream metadata & state
 set on the READ (cloudFiles.*)     set on the WRITE (writeStream)
""", "Different questions, different owners")
C.p("**schemaLocation**: Auto Loader must remember *which schema it discovered, how it evolved, which versions existed*. Databricks stores the inferred schema in a **`_schemas`** folder under `cloudFiles.schemaLocation`.")
C.p("**checkpointLocation**: the streaming query's **progress and state** — conceptually *files processed: A, B, C* plus stream metadata — so a restart continues correctly.")
C.callout("tip", "Same directory is allowed, same role is not",
          "Databricks examples sometimes point both options at the same directory (the schema goes into its `_schemas` subfolder). That works — but the two *roles* stay different: schema history vs stream progress.")
trap("exam", "schemaLocation ≠ progress",
     "`cloudFiles.schemaLocation` stores **schema history/state**, not stream progress. Progress lives in the **checkpoint**. Exam questions swap them on purpose.",
     "Shape → schemaLocation. Progress → checkpointLocation.")
S("§40", "§101")
C.diagram("""
 files:   A   B   C
 stream:  A ✔ B ✔ ──✖ cluster dies
 checkpoint: "A, B done"
 restart  ──►  reads checkpoint  ──►  processes C only
""", "Restart: continue, don't start from zero")
C.callout("interview", "What exactly does the checkpoint protect?",
          "It stores the streaming query's **progress and state**, so after a restart the query continues from the correct point instead of rediscovering the input as if it were new.")
S("§41", "Q15")
trap("pitfall", "Checkpoint on ephemeral disk",
     "`checkpointLocation=\"/tmp/checkpoint\"` lives on a worker's local disk. When the cluster terminates, the checkpoint vanishes → the stream loses all progress.",
     "Put checkpoints on persistent storage: a Unity Catalog Volume or cloud path, e.g. `/Volumes/ecommerce/system/orders_checkpoint/`.")
S("§61")
C.p("**Do I still need schemaLocation with an explicit schema?** If you fully provide `.schema(...)` and don't use Auto Loader-managed inference/evolution, schemaLocation isn't required in the same way. Whenever Auto Loader **infers or evolves** the schema, `cloudFiles.schemaLocation` is critical. The **checkpoint is always required** for the write.")
S("§72")
C.compare(("Initial run", ["1. discover files", "2. infer schema", "3. persist schema state", "4. decide which files are new", "5. process batch", "6. write Delta transaction", "7. update checkpoint"]),
          ("Next run", ["1. read checkpoint", "2. discover files", "3. skip already-processed files", "4. process only new", "5. commit", "6. advance checkpoint"]))
C.callout("key", "The heart of Auto Loader", "Commit the Delta transaction, *then* advance the checkpoint. That ordering is why a crash in between doesn't lose or double-count files when the sink is Delta.")
C.reveal("Think first: a stream processed A and B, then the cluster died. The checkpoint is intact. File C arrived meanwhile. What happens on restart?",
         "Auto Loader reads the checkpoint (A, B done), discovers C as new and processes **only C**. It does not start from zero.")
C.ask("Ask yourself when setting up a new Auto Loader stream", [
    "Is my checkpoint on persistent storage (Volume / cloud path), not /tmp?",
    "Is this checkpoint path used by this one query only?",
    "Am I inferring the schema — then where is schemaLocation?",
    "Would I be able to explain which of the two folders holds what?"])

S("§36", "§37", "§38", "§39", "Q11", "Q12", "Q13")
C.tf("`cloudFiles.schemaLocation` and `checkpointLocation` are two names for the same thing.", False,
     "Big-Test Q13: No. schemaLocation = schema inference/evolution history; checkpointLocation = streaming progress/state. They may even share a directory, but they answer different questions.",
     tags=("exam",), diff=1, quick=True)
C.bucket("Which location holds it?", ["cloudFiles.schemaLocation", "checkpointLocation"],
         [("The schema Auto Loader inferred", 0), ("Previous schema versions after evolution", 0), ("The `_schemas` folder", 0),
          ("Which files were already processed", 1), ("Batch ids / offsets of the stream", 1), ("What lets a restart continue from file C", 1)],
        "Shape vs progress. If the question is about columns and types → schemaLocation. If it's about what's done → checkpoint.",
        tags=("exam", "compare"), diff=1, quick=True)
S("§97")
C.mcq("Exam trap: what does `cloudFiles.schemaLocation` store?",
      ["Schema history/state for inference and evolution", "Stream progress (processed files)", "A copy of the raw files", "The Delta transaction log"], 0,
      "schemaLocation is schema memory. Progress is the checkpoint's job; the Delta log belongs to the target table; raw files stay in the landing zone.",
      tags=("exam",), diff=1,
      why=["Correct.", "That's checkpointLocation.", "Auto Loader never copies raw files there.", "That's in the table's _delta_log."])
S("§40")
C.calc("Files A, B, C have 100 rows each. The stream processed A and B, then the cluster died. It restarts with the same intact checkpoint. How many rows does the target hold after the restart has caught up?",
       300, "Checkpoint says A and B are done → only C (100 rows) is processed on restart: 200 + 100 = 300. No file is reprocessed.",
       unit="rows", tags=("calc",), diff=1)
S("§41", "Q15")
C.spotbug("This stream lost all its progress after the cluster auto-terminated overnight. Which line is the cause?",
          ["query = (", "    orders.writeStream", '        .format("delta")', '        .option("checkpointLocation", "/tmp/orders_checkpoint")',
           '        .toTable("ecommerce.bronze.orders_raw")', ")"],
          [3], '        .option("checkpointLocation", "/Volumes/ecommerce/system/orders_checkpoint/")',
          "`/tmp` is ephemeral local disk on the cluster. When compute terminates, the checkpoint disappears and the stream restarts without memory. Checkpoints must survive compute (Big-Test Q15).",
          tags=("debug", "pitfall"), diff=1)
C.tf("A checkpoint must survive compute restarts and terminations, so it belongs on persistent storage.", True,
     "Compute is disposable; streaming state is not. A Volume or cloud path outlives any cluster.",
     tags=("concept",), diff=1)
S("§72")
C.order("Order what Auto Loader does on its **initial** run.",
        ["Discover files", "Infer schema", "Persist schema state", "Decide which files are new", "Process the batch", "Write the Delta transaction", "Update the checkpoint"],
        "Schema must exist (and be saved) before files can be parsed; the checkpoint advances only after the Delta commit, so a crash between them re-processes rather than loses a batch.",
        tags=("concept",), diff=2)
C.order("Order what Auto Loader does on a **subsequent** run.",
        ["Read the checkpoint", "Discover files", "Skip already-processed files", "Process only new files", "Commit to Delta", "Advance the checkpoint"],
        "The run starts from remembered state, not from scratch — that's the whole difference from spark.read.",
        tags=("concept",), diff=2)
S("§61")
C.mcq("You give Auto Loader a full explicit `.schema(...)` and don't use inference or evolution. Which statement is right?",
      ["schemaLocation isn't required in the same way, but checkpointLocation still is", "Neither location is needed",
       "schemaLocation is still mandatory, checkpoint is optional", "You must set both to the same path"], 0,
      "schemaLocation matters for Auto Loader-managed inference/evolution. The checkpoint is always needed for the streaming write to remember progress.",
      tags=("concept", "exam"), diff=2,
      why=["Correct.", "Without a checkpoint the stream can't track progress.", "Reversed.", "Allowed, but not required."])
S("§101")
C.free("Engineering question: what exactly does the checkpoint protect?",
       "The checkpoint stores the streaming query's progress and state — which input (files/offsets) has been processed and committed, plus the query's metadata and any operator state. After a restart, the query reads it and continues from the correct point instead of rediscovering the whole input as new, which would reprocess or duplicate data.",
       ["Stores progress (processed files/offsets)", "Stores state/metadata of the query", "Restart continues from correct point", "Without it: rediscovery as new → reprocessing/duplicates"],
       "Note what it does NOT protect: business-key uniqueness, or a sink that isn't transactional.",
       tags=("interview",), diff=2)

# =====================================================================
s10 = C.sec(10, "Checkpoint Incidents: Deleted, Shared, Re-pointed",
            "A checkpoint is operational state, not a cache — delete it, share it or re-point it and the stream forgets or confuses its past.")
S("§73", "Q14")
C.p("**Classic incident:** A, B, C are processed. Someone deletes the checkpoint (\"cleanup\"). The next start has **no ingestion history**.")
C.diagram("""
 before:  checkpoint = {A, B, C}     Bronze = A B C
 rm -r checkpoint
 restart: checkpoint = {}            sees A B C (+D) as NEW
          Bronze = A B C  A B C D   ← duplicates
""", "Deleted checkpoint → files may be seen as new")
C.p("Depending on the pipeline and sink you may **duplicate ingestion** or need **recovery/reconciliation**.")
trap("warn", "Checkpoint = operational state",
     "Deleting, resetting or moving a checkpoint wipes the stream's memory of what it processed. Re-ingestion and duplicates follow.",
     "Never treat checkpoints as disposable temp data. Back them up/protect them; reset only deliberately, with a reconciliation plan.")
C.p("**Recovery options** (decide deliberately): restore the checkpoint if you have a copy; or restart fresh and **reconcile** — e.g. delete Bronze rows of re-ingested files by `_source_file`, or dedupe/MERGE downstream; or start a new checkpoint with `cloudFiles.includeExistingFiles = false` so only files arriving *after* the start are ingested (risk: files that landed during the gap are skipped).")
S("§74", "Q16")
C.diagram("""
 Pipeline A ──┐
              ├──► checkpoint=/shared/checkpoint   ✖ corrupt state
 Pipeline B ──┘
""", "Two queries, one checkpoint")
trap("pitfall", "Shared checkpoint path",
     "Two unrelated streaming queries writing to the same checkpoint location can corrupt each other's progress and state: one may skip files, the other reprocess, or the stream fails.",
     "One checkpoint location per streaming query — derive it from the target name, e.g. `/Volumes/<cat>/system/<table>_checkpoint/`.")
S("§75")
C.p("**Re-pointing the source**: the checkpoint belonged to a query reading `/orders/sourceA`. You change the code to read `/orders/sourceB` but keep the same checkpoint. **Dangerous** — the checkpoint describes the logical query and its source topology, not a generic cache.")
trap("pitfall", "Changed source, same checkpoint",
     "Keeping a checkpoint after changing the source path (or other topology) mixes the old query's progress with a new input: files can be skipped, re-read or the stream can fail.",
     "New source/topology → new checkpoint, plus an explicit backfill/reconciliation plan.")
C.ask("Ask yourself whenever a stream's history looks wrong", [
    "Is the checkpoint location exactly the same as in the last good run?",
    "Was the checkpoint deleted, moved or overwritten (deploy, cleanup script, path typo)?",
    "Does any other query write to the same checkpoint path?",
    "Did the source path or query shape change while the checkpoint stayed the same?",
    "Do Bronze rows show old `_source_file`s with new `_ingested_at` values?"])

S("§73", "Q14")
C.calc("Files A, B, C (100 rows each) were ingested. The checkpoint is deleted, file D (100 rows) lands, and the stream restarts with a new empty checkpoint and default options. How many rows does Bronze hold now?",
       700, "With no history, A, B, C are seen as new again (300 duplicate rows) plus D (100): 300 + 300 + 100 = 700. That's why a checkpoint reset needs a reconciliation plan.",
       unit="rows", tags=("calc", "pitfall"), diff=2, quick=True)
C.mcq("Big-Test Q14: what happens if the checkpoint disappears?",
      ["The stream loses its progress/state; recovery or reconciliation may be needed and duplicate ingestion becomes possible",
       "Nothing — Auto Loader rebuilds progress from the Delta log automatically",
       "The stream refuses to ever start again",
       "Only the schema is lost; progress is kept in schemaLocation"], 0,
      "Progress lives only in the checkpoint. Without it, previously processed files can look new. schemaLocation doesn't hold progress, and Auto Loader doesn't reconstruct file history from the target table.",
      tags=("exam", "debug"), diff=1, quick=True,
      why=["Correct.", "No automatic reconstruction of processed-file history.", "It starts — with amnesia.", "schemaLocation stores schema, not progress."])
S("§74", "Q16")
C.tf("Two different streaming queries may safely share one checkpoint path if they write to different tables.", False,
     "Big-Test Q16: checkpoint state belongs to **one** logical streaming query. Sharing corrupts semantics regardless of targets.",
     tags=("pitfall", "exam"), diff=1, quick=True)
S("§75")
C.tf("After changing an Auto Loader stream's source path, it's fine to keep the old checkpoint — it's just a cache.", False,
     "The checkpoint belongs to the logical query and its source topology. Re-pointing the source with the same checkpoint is dangerous; use a new checkpoint and plan the backfill.",
     tags=("pitfall",), diff=2)

S("§73")
playbook(3, "Checkpoint deleted: old files re-ingested", s10,
         "After a 'cleanup' or redeploy, Bronze row count jumps. Old files' rows appear again with today's `_ingested_at`; downstream sees duplicates.",
         ["Is the checkpoint location the same as before — and does it still contain data?",
          "Who or what deleted/reset it (cleanup job, redeploy, path change)?",
          "Which `_source_file`s were ingested twice, and in which Delta versions?",
          "Do I have a copy of the old checkpoint to restore?",
          "If not: reconcile by source file, dedupe downstream, or restart with includeExistingFiles=false?"],
         [("Compare the configured checkpointLocation with the last good run and list its contents.", "Proves a reset vs a different bug."),
          ("Find files ingested more than once.", "Measures the blast radius.",
           "SELECT _source_file, count(DISTINCT _ingested_at) AS loads\nFROM ecommerce.bronze.orders_raw\nGROUP BY _source_file HAVING loads > 1;"),
          ("Restore the checkpoint copy if one exists; otherwise delete the duplicate load (by `_ingested_at` / RESTORE).", "Get Bronze back to one copy per file."),
          ("Protect the checkpoint path (permissions, no cleanup jobs on /system).", "Prevents a repeat.")],
         ["Checkpoint deleted or reset", "Checkpoint path changed in a deploy", "Cleanup script treating checkpoints as temp data"],
         "Restore or reconcile, then protect checkpoint paths as operational state. If a fresh start is unavoidable, decide explicitly between re-ingest+dedupe and includeExistingFiles=false.",
         mnemonic="WHERE → WHO → WHICH FILES → RESTORE or RECONCILE → PROTECT")
C.scenario("Monday morning Bronze `orders_raw` has 2× the expected rows for all of last month. Friday's deploy 'cleaned up' the `/Volumes/ecommerce/system/` folder.",
           [("First check?",
             [("Whether the stream's checkpoint folder was deleted or emptied", True, "A cleanup of /system is the prime suspect: no checkpoint → old files look new."),
              ("Whether upstream re-sent last month's files", False, "Possible, but the deploy + doubling of every file points at the checkpoint first."),
              ("Whether OPTIMIZE ran", False, "OPTIMIZE never changes row counts.")]),
            ("The checkpoint folder was recreated empty on Friday. How do you measure the damage?",
             [("Count distinct `_ingested_at` per `_source_file`: files loaded twice are the duplicates", True, "Precise blast radius from your audit columns."),
              ("Count rows per day", False, "Shows that something doubled, not which files."),
              ("Look at the Spark UI", False, "The UI won't tell you which files were reprocessed last week.")]),
            ("No checkpoint backup exists. Best repair?",
             [("Delete the second load of each duplicated file (by `_ingested_at`) and keep the new checkpoint going", True, "Bronze returns to one copy per file and the stream continues with its fresh history."),
              ("Delete the checkpoint again and restart", False, "That re-ingests everything a third time."),
              ("Do nothing; Silver will handle it", False, "Only if Silver dedupes on the right key — and Bronze stays wrong for audits.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'checkpoint deleted'.",
        ["Confirm the checkpoint path and its (missing) contents", "Find who/what deleted it", "Identify files ingested twice via `_source_file`",
         "Restore the checkpoint or reconcile the duplicate load", "Protect checkpoint paths from cleanup"],
        "Evidence first (was it really reset?), then cause, blast radius, repair, prevention. Restarting blindly before measuring makes reconciliation harder.",
        tags=("debug",), diff=2)
S("§74")
playbook(4, "Two streams share one checkpoint", s10,
         "Two pipelines behave strangely at the same time: one skips files, the other reprocesses or fails with checkpoint/offset errors. Their configs both say `checkpointLocation=/shared/checkpoint`.",
         ["Which queries write to this checkpoint path?",
          "Did they start sharing it after a copy-paste or a refactor of a common config?",
          "Which files did each stream skip or reprocess?",
          "Can each query get its own fresh checkpoint without losing or duplicating data?"],
         [("Grep job/pipeline configs for the checkpoint path.", "Find every query using it."),
          ("Stop both queries.", "Prevent further state corruption."),
          ("Give each query a unique checkpoint path derived from its target.", "One query = one checkpoint.", '.option("checkpointLocation", "/Volumes/ecommerce/system/orders_bronze_checkpoint/")'),
          ("Reconcile missing/duplicate files per target using `_source_file`.", "Fix the data the confusion caused.")],
         ["Copy-pasted config", "Shared 'common' checkpoint variable", "Misunderstanding checkpoint as a generic folder"],
         "One checkpoint per streaming query, named after its target; reconcile both targets after the split.",
         mnemonic="ONE QUERY, ONE CHECKPOINT")
C.scenario("`orders_bronze` and `customers_bronze` streams both started acting up after a refactor that introduced `CHECKPOINT = \"/Volumes/ecommerce/system/checkpoint\"` in a shared config module.",
           [("What do you suspect?",
             [("Both queries now write to the same checkpoint location", True, "A shared constant for checkpoints is a classic refactor bug."),
              ("The landing zone ran out of space", False, "Wouldn't explain skipping vs reprocessing in two specific streams."),
              ("Photon is disabled", False, "Engine choice doesn't affect checkpoint semantics.")]),
            ("Confirmed. What now?",
             [("Stop both, give each its own checkpoint path, then reconcile each target", True, "Separate state first, then repair data."),
              ("Keep one stream running and fix the other later", False, "The running one keeps corrupting the shared state."),
              ("Delete the shared checkpoint and restart both on it", False, "Still shared — and now both re-ingest everything.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'two streams share one checkpoint'.",
        ["Find all queries using the checkpoint path", "Stop the affected queries", "Assign a unique checkpoint per query",
         "Reconcile skipped/duplicated files per target", "Restart and monitor"],
        "Stop the bleeding before fixing data; otherwise the shared state keeps changing under you.",
        tags=("debug",), diff=2)
S("§75")
playbook(5, "Source path changed, checkpoint kept", s10,
         "After changing `.load(\"/orders/sourceA\")` to `.load(\"/orders/sourceB\")` the stream fails, ingests nothing, or ingests an unexpected mix of files.",
         ["Did the source path (or query shape) change while the checkpoint stayed the same?",
          "What does the checkpoint believe the source is?",
          "Should sourceB start from scratch (backfill) or only new files?",
          "Will sourceA's data still be needed in the same target?"],
         [("Diff the stream definition against the last good deploy.", "Confirms a topology change."),
          ("Create a new checkpoint (and schemaLocation if needed) for the new source.", "The old checkpoint describes another query."),
          ("Decide backfill: includeExistingFiles=true (default) to load sourceB history, or false for only new files.", "Explicit choice instead of accidental."),
          ("Verify counts per `_source_file` prefix in the target.", "Proves no gap/overlap.")],
         ["Checkpoint treated as a generic cache", "Path change in config without state plan"],
         "New source/topology → new checkpoint + explicit backfill decision.",
         mnemonic="NEW SOURCE → NEW CHECKPOINT")
C.scenario("The upstream team moved deliveries from `/Volumes/ecommerce/raw/orders_v1/` to `/orders_v2/`. You edited `.load(...)` and redeployed, keeping the checkpoint. Now Bronze gets nothing from v2.",
           [("What is the most likely cause?",
             [("The old checkpoint belongs to the v1 query; re-pointing the source with it is unsafe", True, "Checkpoint state is tied to the query's source topology."),
              ("v2 files are in a format Auto Loader can't read", False, "Same format; the change was the path."),
              ("The target table is full", False, "Delta tables don't 'fill up'.")]),
            ("Best fix?",
             [("New checkpoint for the v2 stream + explicit choice whether to backfill existing v2 files", True, "Clean state and a deliberate backfill decision."),
              ("Delete the v1 files so the checkpoint 'matches'", False, "Destroys source data and doesn't fix the topology mismatch."),
              ("Use the same checkpoint for a v1 and a v2 stream", False, "That's the shared-checkpoint bug.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'source changed, checkpoint kept'.",
        ["Diff stream definition vs last good deploy", "Create a new checkpoint for the new source",
         "Decide backfill (includeExistingFiles)", "Start the stream", "Verify counts per source prefix"],
        "The decision about history (backfill or not) must be explicit; a new checkpoint by default ingests existing files.",
        tags=("debug",), diff=3)
S("§73", "Q14", "§74", "Q16")
C.free("Big-Test Q14 + Q16: what happens if a checkpoint disappears, and why must two streams never share one?",
       "If the checkpoint disappears, the stream loses its record of what it processed; on restart previously processed files can be treated as new, so duplicate ingestion or a recovery/reconciliation effort follows. Two streams must not share one because checkpoint state belongs to one logical streaming query — its progress, offsets and metadata describe that query's source and plan; sharing makes queries overwrite/misread each other's state.",
       ["Lost progress → files may look new", "Duplicates or reconciliation needed", "Checkpoint belongs to one logical query", "Sharing corrupts each other's state"],
       "Both answers come from one idea: the checkpoint IS the stream's memory.",
       tags=("exam", "interview"), diff=2)

# =====================================================================
s11 = C.sec(11, "File Discovery & Auto Loader Schema Inference",
            "How Auto Loader finds new files, and why its default schema is all STRING — on purpose.")
S("§42", "§43", "§44")
C.p("Auto Loader must learn **which new files appeared**. Two conceptual mechanisms:")
C.compare(("Directory listing", ["List the path", "Compare against tracked state", "Discover new files", "Simple, no extra cloud setup (default)", "Can get expensive with huge file counts"]),
          ("File notification / managed file events", ["New file → cloud event", "Auto Loader learns about it from events", "Avoids repeated massive listings", "Classic: `cloudFiles.useNotifications`; current: managed file events on UC external locations"]))
C.diagram("""
 LISTING:       list path → diff vs state → new files
 NOTIFICATION:  new file → cloud event → Auto Loader knows
""")
C.callout("key", "The takeaway that won't change",
          "Exact cloud-specific implementations evolve; the concept stays: Auto Loader can **discover new files incrementally without a full directory scan each time**.")
S("§45")
C.p("Auto Loader supports schema inference/evolution for **JSON, CSV, XML, Avro and Parquet** — with different semantics for text vs typed formats.")
S("§46", "§47", "§48", "§98", "Q17")
C.table(["Reader", "JSON `{\"id\": 1, \"amount\": 20.5}` becomes"],
        [["spark.read (inference)", "id LONG, amount DOUBLE"], ["Auto Loader (default)", "id STRING, amount STRING"],
         ["Auto Loader + inferColumnTypes=true", "id LONG, amount DOUBLE (like DataFrameReader)"]])
C.p("For **JSON, CSV and XML** Auto Loader infers every field as **STRING** by default — to reduce schema-evolution failures from type mismatches. Typed formats (Parquet, Avro) keep their encoded types.")
C.code("python", '.option("cloudFiles.inferColumnTypes", "true")', "Ask for real types instead")
trap("exam", "Auto Loader defaults text formats to STRING",
     "Unlike `spark.read` with inferSchema, Auto Loader infers JSON/CSV/XML columns as STRING unless `cloudFiles.inferColumnTypes=true`.",
     "Expect strings in Bronze; use inferColumnTypes, schema hints or Silver casts when you need types.")
S("§49")
C.diagram("""
 today:     amount = 19.50        tomorrow:  amount = "unknown"
 Bronze amount DOUBLE  → parse fails / value rescued
 Bronze amount STRING  → keeps "19.50" and "unknown"  ✔
                         → Silver validates & casts
""", "Why Bronze often prefers strings")
C.flow(["Bronze: preserve the source", "Silver: enforce clean types"], "Medallion philosophy")
S("§50", "Q18")
C.p("**Initial inference samples**, it doesn't scan your whole history: by default up to **50 GB or 1000 files, whichever limit is reached first** (tunable via `cloudFiles.schemaInference.sampleSize.numBytes` / `.numFiles`).")
S("§51", "§52")
C.p("**Schema hints** let you steer inference for specific columns without declaring every column:")
C.code("python", '.option("cloudFiles.schemaHints", "order_id BIGINT, amount DOUBLE")')
C.p("For **typed formats like Parquet**, a hint tells the reader *which type to read the column as* — it is **not** just a cast applied after reading. `schema hint ≠ withColumn(cast(...))`.")
trap("pitfall", "Inferred once, remembered after",
     "Inference runs when the stream first builds its schema and the result is persisted in schemaLocation. Flipping `inferColumnTypes` later on an existing stream doesn't magically re-infer the stored schema.",
     "Decide inference options before the first run; for an existing stream use schema hints or Silver casts (or a deliberately new stream with a new schemaLocation/checkpoint).")
C.ask("Ask yourself when Auto Loader columns come out as STRING", [
    "Is the source JSON/CSV/XML, where STRING is the default?",
    "Did I set `cloudFiles.inferColumnTypes` before the schema was first persisted?",
    "Do I actually want raw strings in Bronze and typed casts in Silver?",
    "Which few columns need types now — would schema hints be enough?"])
C.reveal("Think first: a vendor sends 3,000 JSON files of 10 MB each. Which sampling limit stops initial inference first?",
         "**1000 files** (10 GB) is reached long before 50 GB. Inference sees only the first 1000 files — a column that appears only in later files isn't in the initial schema (schema evolution handles it later).")

S("§42", "§43", "§44")
C.match("Match the discovery concept to its description.",
        [("Directory listing", "List the path and diff it against tracked state"),
         ("File notification", "Cloud events tell Auto Loader a file was created"),
         ("Managed file events", "Databricks-managed events on UC external locations"),
         ("Naive full listing every trigger", "Cost grows with the size of the whole folder")],
        "Both real mechanisms are incremental; notification-style discovery avoids repeatedly listing huge directories.",
        tags=("concept",), diff=2, quick=True)
C.tf("File-notification mode avoids repeatedly listing a huge input directory.", True,
     "With notifications/file events, new files are announced by the cloud, so Auto Loader doesn't have to scan millions of names each trigger.",
     tags=("concept",), diff=1)
S("§46", "§47", "§48", "§98", "Q17")
C.mcq("Auto Loader (default options) reads JSON `{\"id\": 1, \"amount\": 20.5}`. What types are inferred?",
      ["id STRING, amount STRING", "id LONG, amount DOUBLE", "id INT, amount FLOAT", "id LONG, amount STRING"], 0,
      "For JSON/CSV/XML, Auto Loader defaults to STRING to reduce type-mismatch evolution failures. `spark.read` would infer LONG/DOUBLE; Auto Loader does so only with `cloudFiles.inferColumnTypes=true`.",
      tags=("exam",), diff=1, quick=True,
      why=["Correct.", "That's spark.read or inferColumnTypes=true.", "Spark doesn't pick INT/FLOAT for JSON numbers.", "No mixed rule like that."])
C.cloze("Make Auto Loader infer real column types for JSON.",
        'spark.readStream\n    .format("cloudFiles")\n    .option("cloudFiles.format", "json")\n    .option("cloudFiles.[[inferColumnTypes]]", "[[true]]")\n    .option("cloudFiles.schemaLocation", schema_path)\n    .load(source_path)',
        "`cloudFiles.inferColumnTypes=true` makes Auto Loader infer types like the DataFrameReader. `inferSchema` is the plain CSV reader option and isn't how Auto Loader is configured.",
        bank=["inferSchema", "false", "schemaHints"], as_code=True, tags=("syntax", "exam"), diff=2)
C.tf("By default, Auto Loader infers CSV columns with real types, exactly like `spark.read.option(\"inferSchema\",\"true\")`.", False,
     "Exam trap: Auto Loader's default for CSV/JSON/XML is STRING. Only `cloudFiles.inferColumnTypes=true` gives DataFrameReader-like types.",
     tags=("exam", "pitfall"), diff=1)
S("§49")
C.mcq("Why do many Bronze tables intentionally keep source fields as STRING?",
      ["So unexpected values like \"unknown\" are preserved instead of failing or being nulled; Silver validates and casts",
       "Because Delta can't store DOUBLE", "Because strings are faster to aggregate", "Because Unity Catalog requires it"], 0,
      "Bronze's job is to preserve the source. A typed Bronze column turns tomorrow's `\"unknown\"` into a failure or a rescued value; a STRING keeps it, and Silver decides how to clean it.",
      tags=("concept",), diff=2,
      why=["Correct.", "Delta stores all common types.", "Strings are usually slower for math.", "UC doesn't impose that."])
S("§50", "Q18")
C.calc("A feed has 200 Parquet files of 1 GB each. With default sampling limits, how many files does Auto Loader's initial schema inference read before stopping?",
       50, "Limits: 50 GB or 1000 files, whichever comes first. At 1 GB per file the 50 GB limit is hit after 50 files.",
       unit="files", tags=("calc", "exam"), diff=2)
C.mcq("Big-Test Q18: how much input does Auto Loader sample by default for initial schema inference?",
      ["Up to 50 GB or 1000 files, whichever is reached first", "All files in the directory", "Exactly the first file", "Up to 1 GB or 100 files"], 0,
      "Inference samples — it doesn't read the entire historical corpus. Columns that only appear later are handled by schema evolution.",
      tags=("exam",), diff=1,
      why=["Correct.", "It intentionally doesn't scan everything.", "One file would be far too little.", "Wrong numbers."])
S("§51", "§52")
C.write("Add schema hints so Auto Loader types `order_id` as BIGINT and `amount` as DOUBLE while inferring everything else (JSON source, schema at `schema_path`).",
        'orders = (\n    spark.readStream\n        .format("cloudFiles")\n        .option("cloudFiles.format", "json")\n        .option("cloudFiles.schemaLocation", schema_path)\n        .option("cloudFiles.schemaHints", "order_id BIGINT, amount DOUBLE")\n        .load(source_path)\n)',
        ['"cloudfiles.schemahints"', "order_id bigint", "amount double", '"cloudfiles.schemalocation"'],
        "Hints override inference only for the named columns; the rest are still inferred (as STRING by default). It's the middle ground between full inference and a full explicit schema.",
        lang="python", tags=("syntax",), diff=2)
C.tf("For Parquet sources, a schema hint is exactly the same as reading the column and then applying `cast(...)`.", False,
     "For typed formats the hint tells the reader which type to read the column as; it's not a post-read cast. Semantics (overflow, precision, failures) can differ.",
     tags=("pitfall",), diff=3)
C.tf("On an existing stream whose schema is already stored in schemaLocation, flipping `cloudFiles.inferColumnTypes` to true automatically re-types the stored columns on restart.", False,
     "Inference runs when the schema is first built; afterwards Auto Loader works from the schema persisted in schemaLocation. Decide inference options before the first run; for an existing stream use schema hints, Silver casts, or a deliberately new stream.",
     tags=("pitfall",), diff=3)
C.odd("Three of these are ways to get typed columns out of Auto Loader on JSON. Which one isn't?",
      ["`cloudFiles.inferColumnTypes = true`", "`cloudFiles.schemaHints` for specific columns", "An explicit `.schema(...)`", "`cloudFiles.format = \"parquet\"` on JSON files"], 3,
      "Setting the format to parquet doesn't convert JSON files — it would just fail to read them. The real levers are inferColumnTypes, hints, or an explicit schema (or casting in Silver).",
      tags=("concept",), diff=2)
S("§45")
C.bucket("Default Auto Loader inference: which formats come out as STRING columns and which keep encoded types?",
         ["STRING by default", "Types from the file"],
         [("JSON", 0), ("CSV", 0), ("XML", 0), ("Parquet", 1), ("Avro", 1)],
        "Text formats carry no reliable types, so Auto Loader plays safe with STRING; Parquet and Avro embed their schema.",
        tags=("concept",), diff=2)

S("§46", "§48", "§49")
playbook(6, "Auto Loader table has every column as STRING", s11,
         "The new Bronze table from Auto Loader shows `order_id STRING, amount STRING, order_ts STRING`; a downstream sum fails or sorts '100' before '20'.",
         ["Is the source a text format (JSON/CSV/XML) where Auto Loader defaults to STRING?",
          "Did I set `cloudFiles.inferColumnTypes` — and before the schema was first persisted?",
          "Do I actually want strings in Bronze (preserve source) and types in Silver?",
          "Which few columns really need types early — would schema hints do?",
          "Is a full explicit schema justified because the upstream contract is known?"],
         [("Check the schema stored under schemaLocation (`_schemas`) and the table schema.", "Confirms default string inference."),
          ("Decide the layer for typing: Bronze strings + Silver casts is often the safest.", "Keeps raw values like 'unknown' visible."),
          ("If types are needed at ingestion: add schemaHints for key columns or inferColumnTypes for a new stream.", "Targeted, reviewed typing.",
           '.option("cloudFiles.schemaHints", "order_id BIGINT, amount DOUBLE")'),
          ("Cast in Silver with validation.", "Bad values become quarantinable instead of breaking ingestion.",
           "SELECT CAST(order_id AS BIGINT) AS order_id, TRY_CAST(amount AS DOUBLE) AS amount FROM ecommerce.bronze.orders_raw")],
         ["Default string inference for text formats (by design)", "inferColumnTypes not set (or set after schema persisted)"],
         "Not a bug: keep strings in Bronze and cast in Silver, or use hints / inferColumnTypes / explicit schema deliberately.",
         mnemonic="TEXT → STRING; decide WHERE to type")
C.scenario("An analyst complains: 'Bronze orders from Auto Loader — all columns are strings! Is ingestion broken?' Source: JSON files.",
           [("What's your first reaction?",
             [("Check whether this is Auto Loader's default string inference for JSON", True, "It's expected behavior for JSON/CSV/XML unless inferColumnTypes is set."),
              ("Restart the stream with a new checkpoint", False, "Resetting state doesn't change inference and risks duplicates."),
              ("Convert the JSON files to CSV", False, "CSV would also default to strings.")]),
            ("It is the default. The analyst needs numeric amounts for a report. Best layer to fix it?",
             [("Silver: cast/validate types (Bronze keeps the raw strings)", True, "Bronze preserves source; Silver enforces types — medallion philosophy."),
              ("Bronze: drop rows whose amount isn't numeric", False, "Bronze shouldn't throw away source data."),
              ("Gold: cast in every dashboard query", False, "Repeats logic in every consumer and hides bad values.")])],
           tags=("debug",), diff=1)
C.order("Order the playbook for 'every column is STRING'.",
        ["Confirm source is JSON/CSV/XML with default inference", "Inspect the schema stored in schemaLocation",
         "Decide which layer should own typing", "Add hints / inferColumnTypes only where justified", "Cast and validate in Silver"],
        "Recognize the default before 'fixing' it; most of the time the fix is a Silver cast, not an ingestion change.",
        tags=("debug",), diff=2)

# =====================================================================
s12 = C.sec(12, "Schema Evolution, Rescued Data & Quarantine",
            "When the source changes shape, you want control — not a silent mutation and not lost data.")
S("§53", "§54", "§92")
C.p("Yesterday: `order_id, amount`. Today the source adds **`discount_code`**. Auto Loader can detect and **evolve** the schema — depending on the configured mode.")
C.diagram("""
 new unexpected column discovered
          ↓
 Auto Loader records the schema change (schemaLocation)
          ↓
 stream FAILS / stops (default mode)
          ↓
 restart → new schema used, column included
""", "Why schema evolution can stop a stream")
C.callout("key", "Stopping is a feature",
          "In many production contexts this is desirable: **don't silently mutate pipeline semantics without control.** Run the stream under a Job with retries so the restart picks up the new schema.")
C.table(["cloudFiles.schemaEvolutionMode", "On a new column…"],
        [["addNewColumns (default when no schema given)", "Stream fails; new column added to the schema; restart continues with it"],
         ["rescue", "Schema never evolves; stream keeps running; new columns go to the rescued data column"],
         ["failOnNewColumns", "Stream fails and stays failed until you update the schema or remove the file"],
         ["none (default when you provide a schema)", "Schema doesn't evolve, new columns ignored (not rescued unless rescuedDataColumn is set)"]],
        "Modes added for clarity — the source says 'depending on configured mode'")
C.code("python", '.option("cloudFiles.schemaEvolutionMode", "addNewColumns")   # or rescue / failOnNewColumns / none')
trap("warn", "A failing stream after a new column isn't (necessarily) a bug",
     "With the default addNewColumns mode, the first batch that contains a new column stops the stream after recording the new schema. Restarting picks it up.",
     "Run Auto Loader as a Job with retries; decide per feed whether new columns should evolve, be rescued, or fail loudly.")
S("§55", "§56", "§57", "Q19", "Q20")
C.p("**Rescued data** is one of Databricks' best ingestion ideas. Expected schema `id BIGINT, amount DOUBLE`; incoming:")
C.code("text", '{"id": 10, "amount": "UNKNOWN", "new_field": "abc"}')
C.diagram("""
 id            = 10
 amount        = null
 _rescued_data = {"amount": "UNKNOWN", "new_field": "abc"}
""", "Conceptual rescued row: nothing is lost")
C.p("Instead of silently throwing away mismatched or unexpected fields, Auto Loader / `read_files` put them in a **rescued data column** (`_rescued_data`) — values that don't match the expected type, and fields not in the schema.")
C.compare(("Without rescue", ["bad row → drop?", "fail?", "corrupt?"]),
          ("With rescue", ["valid columns load normally", "unexpected content preserved", "Silver can inspect, alert, quarantine, fix"]))
S("§58")
C.diagram("""
 Robust Bronze row
 ├── business/source fields : order_id, customer_id, amount, status
 ├── _ingested_at           : ingestion timestamp
 ├── _source_file           : source filename
 └── _rescued_data          : whatever didn't fit
""", "Bronze architecture pattern = excellent auditability")
S("§59")
C.diagram("""
 Bronze
   ↓ validation
   ├── _rescued_data IS NULL     → Silver
   └── _rescued_data IS NOT NULL → quarantine.orders_bad
""", "Quarantine pattern")
C.code("python", 'bronze = spark.read.table("ecommerce.bronze.orders_raw")\n\n(bronze.where("_rescued_data IS NOT NULL")\n       .write.mode("append")\n       .saveAsTable("ecommerce.quarantine.orders_bad"))\n\nclean = bronze.where("_rescued_data IS NULL")   # continues to Silver')
S("§60", "§61")
C.p("**Explicit schema with Auto Loader** — very common when the upstream contract is known. Note the deliberate STRING for `amount` and `order_ts`:")
C.code("python", 'schema = """\n  order_id    BIGINT,\n  customer_id BIGINT,\n  amount      STRING,\n  status      STRING,\n  order_ts    STRING\n"""\n\norders = (\n    spark.readStream\n        .format("cloudFiles")\n        .option("cloudFiles.format", "json")\n        .schema(schema)\n        .option("rescuedDataColumn", "_rescued_data")   # keep what doesn\'t fit\n        .load(source)\n)')
trap("pitfall", "Explicit schema hides new columns",
     "With a strict explicit schema the evolution mode defaults to `none`: a new upstream column does NOT appear as a regular column and isn't rescued unless you set `rescuedDataColumn`.",
     "Add `.option(\"rescuedDataColumn\", \"_rescued_data\")` and monitor it, or change the schema deliberately.")
S("§92", "§93")
C.ul(["**Lab — schema evolution:** start with `{\"id\":1,\"amount\":\"20.0\"}`, then add `{\"id\":2,\"amount\":\"25.0\",\"discount\":\"SAVE10\"}`. Watch schemaLocation get a new schema version and the stream stop/restart.",
      "**Lab — bad data:** add `{\"id\":3,\"amount\":{\"unexpected\":true}}`. If `amount` is typed (hint/inferColumnTypes), the object can't fit → `amount` null + value in `_rescued_data`. If `amount` is STRING it may simply be kept as raw JSON text. Either way: **don't just make it pass — know where unexpected data goes.**"])
C.ask("Ask yourself when an Auto Loader stream stops on a schema change", [
    "Is this the documented addNewColumns stop-and-restart, not a real failure?",
    "Which file introduced the new column, and is the change intentional?",
    "Does schemaLocation now hold a new schema version?",
    "Should this feed evolve, rescue, or fail loudly?",
    "Will a job retry restart the stream automatically?"])
C.reveal("Think first: why is quarantining by `_rescued_data IS NOT NULL` better than dropping those rows in Bronze?",
         "Because Bronze keeps the evidence. Quarantine isolates suspicious rows from Silver while preserving them for alerting, investigation and reprocessing once the rule or the source is fixed.")

S("§53", "§54", "§92")
C.mcq("Default Auto Loader (inferred schema, default mode). A file with a new column `discount` arrives. What happens?",
      ["The stream fails after recording the new schema; on restart the column is included", "The column is silently dropped forever",
       "The whole table is overwritten with the new schema", "The file is skipped and never processed"], 0,
      "addNewColumns (default without a provided schema): stop, record evolved schema in schemaLocation, continue on restart. Nothing is dropped or skipped.",
      tags=("concept", "exam"), diff=2, quick=True,
      why=["Correct.", "That's closer to mode none with explicit schema.", "Evolution adds columns; it doesn't overwrite data.", "The file is processed after restart."])
C.bucket("Which schemaEvolutionMode behaves like this?", ["addNewColumns", "rescue", "failOnNewColumns", "none"],
         [("Stream stops, schema gains the column, restart continues", 0), ("Default when Auto Loader infers the schema", 0),
          ("Stream keeps running; new fields land in `_rescued_data`", 1),
          ("Stream stops and stays down until you change the schema or remove the file", 2),
          ("Default when you provide a schema: new columns ignored", 3)],
        "Pick per feed: evolve (addNewColumns), keep running but capture (rescue), demand human review (failOnNewColumns), or ignore (none).",
        tags=("concept", "compare"), diff=3)
C.cloze("Configure Auto Loader to never evolve the schema but capture new fields in the rescued column.",
        '.option("cloudFiles.[[schemaEvolutionMode]]", "[[rescue]]")',
        "`rescue` mode keeps the schema fixed and the stream running, while unexpected columns are preserved in `_rescued_data`.",
        bank=["mergeSchema", "addNewColumns", "none", "schemaHints"], as_code=True, tags=("syntax",), diff=2)
S("§55", "§56", "§57", "Q19", "Q20")
C.mcq("Expected schema `id BIGINT, amount DOUBLE`. Incoming `{\"id\": 10, \"amount\": \"UNKNOWN\", \"new_field\": \"abc\"}` with rescued data enabled. Result?",
      ["id=10, amount=null, _rescued_data has amount:\"UNKNOWN\" and new_field:\"abc\"", "Row dropped",
       "Stream fails on the type mismatch", "amount=0, new_field ignored"], 0,
      "Valid fields load, the mismatching value and unexpected field are preserved in `_rescued_data`. No information is lost and nothing is fabricated (amount isn't set to 0).",
      tags=("concept",), diff=2, quick=True,
      why=["Correct.", "Rescue exists exactly to avoid dropping.", "Type mismatches are rescued, not fatal.", "Inventing 0 would corrupt the data."])
C.tf("The rescued data column exists so mismatched or unexpected values are preserved instead of silently lost.", True,
     "Big-Test Q19. It keeps the row loadable while preserving the problematic content for inspection, alerting, quarantine and fixes (Q20).",
     tags=("concept",), diff=1)
C.free("Big-Test Q19 + Q20: what is rescued data and why is it useful?",
       "Rescued data is a special column (`_rescued_data`) where Auto Loader/read_files put values that don't match the expected schema — wrong types, unexpected fields — instead of losing them. It's useful for auditability (nothing silently dropped), handling schema drift, debugging what the source really sent, and quarantine patterns (route rows with rescued data away from Silver).",
       ["Column for values/fields not matching the schema", "Preserved instead of lost", "Auditability + schema-drift handling", "Debugging + quarantine"],
       "Short answer: unexpected data is kept where you can see it.",
       tags=("exam",), diff=2)
S("§58")
C.odd("Three of these belong in a robust Bronze row. Which one does not?",
      ["`_ingested_at`", "`_source_file`", "`_rescued_data`", "`revenue_per_customer`"], 3,
      "Bronze = source fields + ingestion metadata + rescued data. A business metric like revenue per customer is Gold work; computing it in Bronze couples ingestion to business rules.",
      tags=("concept",), diff=1)
S("§59")
C.spotbug("This quarantine step sends the wrong rows to quarantine. Which line?",
          ['bronze = spark.read.table("ecommerce.bronze.orders_raw")', '(bronze.where("_rescued_data IS NULL")',
           '       .write.mode("append")', '       .saveAsTable("ecommerce.quarantine.orders_bad"))', 'clean = bronze.where("_rescued_data IS NULL")'],
          [1], '(bronze.where("_rescued_data IS NOT NULL")',
          "Quarantine must receive rows WITH rescued content (`IS NOT NULL`). As written, clean rows are quarantined and suspicious rows are lost from both outputs.",
          tags=("debug",), diff=1)
C.write("Write PySpark that routes Bronze rows with rescued data into `ecommerce.quarantine.orders_bad` (append) and keeps clean rows in a DataFrame `clean`.",
        'bronze = spark.read.table("ecommerce.bronze.orders_raw")\n\n(bronze.where("_rescued_data IS NOT NULL")\n       .write.mode("append")\n       .saveAsTable("ecommerce.quarantine.orders_bad"))\n\nclean = bronze.where("_rescued_data IS NULL")',
        ["_rescued_data is not null", "saveastable(\"ecommerce.quarantine.orders_bad\")", "_rescued_data is null"],
        "Two complementary filters on `_rescued_data`. Quarantine keeps evidence; clean rows continue to Silver.",
        lang="python", tags=("syntax",), diff=2)
S("§60", "§61")
C.write("Write an Auto Loader read of JSON from `source` with an **explicit DDL schema** (`order_id BIGINT, amount STRING, status STRING`) that still keeps non-matching data in `_rescued_data`.",
        'schema = "order_id BIGINT, amount STRING, status STRING"\n\norders = (\n    spark.readStream\n        .format("cloudFiles")\n        .option("cloudFiles.format", "json")\n        .schema(schema)\n        .option("rescuedDataColumn", "_rescued_data")\n        .load(source)\n)',
        ['format("cloudfiles")', ".schema(schema)", '"rescueddatacolumn", "_rescued_data"', ".load(source)"],
        "With an explicit schema Auto Loader doesn't infer or evolve, and new fields would be ignored. `rescuedDataColumn` keeps them visible. schemaLocation isn't needed for inference here; the write still needs a checkpoint.",
        lang="python", tags=("syntax",), diff=3)
S("§93")
C.mcq("Lab: you add `{\"id\":3,\"amount\":{\"unexpected\":true}}` while `amount` is hinted as DOUBLE and rescued data is on. What do you expect?",
      ["amount is null for that row and the object appears in `_rescued_data`", "The stream deletes the file",
       "amount becomes 1.0", "All previous rows get amount null"], 0,
      "An object can't fit a DOUBLE, so the value is rescued and the typed column is null. The point of the lab: know where unexpected data goes, not just make the pipeline pass.",
      tags=("concept", "debug"), diff=2,
      why=["Correct.", "Auto Loader never deletes source files by default.", "No such coercion.", "Other rows are unaffected."])

S("§54", "§53")
playbook(7, "Stream stopped right after a new column appeared", s12,
         "The Auto Loader job failed with an error saying a new field/column was detected (schema change). It worked for weeks. Upstream says they 'added a small field'.",
         ["Is this the documented addNewColumns behavior (stop, record, restart) rather than a real bug?",
          "Which file introduced the new column — and is the change intentional?",
          "Did the schema in schemaLocation get a new version with the column?",
          "Should this feed evolve, rescue, or fail loudly (schemaEvolutionMode)?",
          "Does the job have retries so a restart picks up the evolved schema?"],
         [("Read the failure message and the latest schema version under schemaLocation/_schemas.", "Confirms a schema-evolution stop."),
          ("Find the file with the new column (`_metadata.file_path` / landing-zone timestamps).", "Ties the change to a delivery."),
          ("Confirm with upstream that the column is intended.", "Evolution is a contract decision."),
          ("Restart (or rely on job retries); verify the column appears.", "addNewColumns continues with the new schema after restart."),
          ("Set schemaEvolutionMode deliberately for this feed.", "rescue / failOnNewColumns if evolution should not be automatic.", '.option("cloudFiles.schemaEvolutionMode", "rescue")')],
         ["New column + default addNewColumns mode", "Job without retries", "Unannounced upstream change"],
         "Treat the stop as a control point: confirm intent, restart (job retries), and choose an evolution mode per feed.",
         mnemonic="STOP → SCHEMA → FILE → OWNER → RESTART → MODE")
C.scenario("Your Auto Loader Bronze job failed overnight: the error mentions a newly detected field `discount`. It ran fine for months.",
           [("First interpretation?",
             [("Likely expected schema-evolution behavior: the stream stopped after recording a new column", True, "Default addNewColumns stops on new columns by design."),
              ("The checkpoint is corrupt — delete it", False, "Deleting the checkpoint causes re-ingestion and duplicates; it's not the issue."),
              ("Disk is full on the driver", False, "The error names a new field, not disk space.")]),
            ("Upstream confirms `discount` is intentional. Next?",
             [("Restart the stream (or let job retries do it) and verify the column appears", True, "On restart the evolved schema from schemaLocation is used."),
              ("Switch to spark.read to avoid failures", False, "You'd lose incremental state and re-read everything."),
              ("Manually edit files to remove `discount`", False, "Never mutate source evidence.")]),
            ("For a sensitive finance feed you'd rather review every change. Which mode?",
             [("failOnNewColumns", True, "It stays failed until a human updates the schema — explicit review."),
              ("addNewColumns", False, "That evolves automatically after restart."),
              ("none", False, "That silently ignores new columns.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'stream stopped after a new column'.",
        ["Read the error and the latest schema version in schemaLocation", "Find the file that introduced the column",
         "Confirm intent with upstream", "Restart / rely on job retries and verify", "Choose the evolution mode for this feed"],
        "The stop is a checkpoint for humans. Confirm what changed and whether it's wanted before simply restarting.",
        tags=("debug",), diff=2)
