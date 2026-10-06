# ch12 part 4: s13-s16 + flashcards

# =====================================================================
s13 = C.sec(13, "Exactly-once, Bronze → MERGE & Production Architecture",
            "Each file loaded once is not the same as each order stored once — know which layer guarantees what.")
S("§62", "§63", "§102", "Q21", "Q22")
C.p("Auto Loader is designed for **exactly-once file ingestion** into Delta — when combined correctly with checkpointing and a supported (transactional) sink.")
C.p("That does **not** mean duplicates can never appear in your business table. Duplicates can come from the **source data itself**:")
C.diagram("""
 file A: order_id=100        file B: order_id=100
   processed once ✔            processed once ✔
              ↓                       ↓
     Bronze: two rows with order_id = 100   (correctly!)

 file-level exactly-once  ≠  business-key deduplication
""")
C.callout("key", "Auto Loader tracks FILES, not business entities",
          "`fileA processed once` + `fileB processed once` does not imply `order_id 100 appears once`. Business-key dedup/upsert is Silver's job.")
trap("exam", "Exactly-once ≠ no duplicate keys",
     "Exactly-once file ingestion guarantees each *file* is ingested once. Two distinct files (an upstream retry, a resend, an update) can legitimately contain the same order_id.",
     "Deduplicate / MERGE on the business key in Silver (or the CDC layer).")
S("§64")
C.flow(["Files", "Auto Loader", "Bronze append", "dedup / CDC", "MERGE", "Silver"], "Common architecture")
C.p("This cleanly separates **ingestion correctness** (every file exactly once) from **business-state correctness** (every order once, latest version).")
C.code("sql", "MERGE INTO ecommerce.silver.orders AS t\nUSING (\n  SELECT *\n  FROM ecommerce.bronze.orders_raw\n  QUALIFY row_number() OVER (\n    PARTITION BY order_id ORDER BY _ingested_at DESC) = 1\n) AS s\nON t.order_id = s.order_id\nWHEN MATCHED THEN UPDATE SET *\nWHEN NOT MATCHED THEN INSERT *;",
       "Sketch: dedupe Bronze by business key, then MERGE into Silver (column lists simplified)")
S("§84")
C.compare(("Bad Bronze", ["ingest", "+ business rules", "+ join 8 tables", "+ calculate revenue", "+ drop malformed source data"]),
          ("Better", ["**Bronze**: land faithfully", "**Silver**: validate, dedup, cast, join, apply CDC", "Recovery is easy: fix Silver code, rebuild from Bronze"]))
trap("pitfall", "Transforming (and dropping) during ingestion",
     "Bronze that applies business rules, joins and drops malformed rows loses the raw evidence; when a rule is wrong you can't rebuild.",
     "Ingestion ≠ transformation: keep Bronze conservative, do business logic in Silver/Gold.")
S("§100")
C.callout("interview", "Why not write Auto Loader directly into Silver?",
          "Bronze gives **source fidelity, replay, audit, schema-drift handling, rescued data and debugging**. Silver then enforces **business keys, types, deduplication, CDC and quality**. The separation minimizes coupling between ingestion and business transformation.")
S("§86", "Q23")
C.diagram("""
 Cloud / Volume landing zone
   ↓  immutable files
 Auto Loader
   ↓
 Bronze  : raw + metadata + rescued data
   ↓  validation
 Silver  : typed + dedup + CDC
   ↓
 Gold
""", "The production ingestion architecture to internalize")
S("PA")
C.p("**Production assignment** — build `/Volumes/ecommerce/raw/orders/` → Auto Loader → `ecommerce.bronze.orders_raw` with `order_id, customer_id, amount, status, _ingested_at, _rescued_data`, then deliberately test:")
C.ol(["Ingest the first JSON file", "Restart the stream", "Add a second file", "Verify the first wasn't reprocessed",
      "Add a new column", "Observe schema evolution", "Add a malformed value", "Inspect rescued data",
      "Delete the checkpoint — in a sandbox only", "Observe the changed behavior", "Restore/recreate safely",
      "Add a duplicate business key in a different file", "Verify Auto Loader processes each file once",
      "Prove the business duplicate still exists", "Deduplicate downstream"])
C.reveal("Think first: in step 14 the duplicate order_id is still in Bronze although every file was processed exactly once. Is Auto Loader broken?",
         "No. Two **different files** each contained order_id 100, and each file was correctly ingested once. File identity ≠ business identity — step 15 (dedupe downstream) is where that's fixed.")

S("§62", "§63", "§102", "Q21", "Q22")
C.calc("File A and file B (two distinct files) each contain one row with order_id=100. Auto Loader with an intact checkpoint ingests both. How many order_id=100 rows does Bronze contain?",
       2, "Each file is processed exactly once, and each contains the row → 2 rows. Exactly-once is about files, not business keys.",
       unit="rows", tags=("calc", "exam"), diff=1, quick=True)
C.tf("Big-Test Q21: exactly-once file ingestion guarantees there are no duplicate `customer_id` values in Bronze.", False,
     "No. Distinct files can contain the same business key (upstream retries, resends, updates). Exactly-once covers file processing only.",
     tags=("exam", "pitfall"), diff=1, quick=True)
C.mcq("Big-Test Q22: where should business-key deduplication generally happen?",
      ["Silver / the CDC processing layer", "Inside Auto Loader's checkpoint", "In the landing zone by deleting files", "In Gold dashboards"], 0,
      "Bronze lands faithfully; Silver enforces business keys via dedup/MERGE/CDC. The checkpoint knows files, not keys; deleting source files destroys evidence; Gold is too late and repeats logic.",
      tags=("exam",), diff=1,
      why=["Correct.", "Checkpoints track files, not keys.", "Never mutate the landing zone to dedupe.", "Too late, and every consumer would repeat it."])
C.free("Engineering question: why doesn't file-level exactly-once guarantee no duplicate business rows?",
       "Because file identity is not business-entity identity. Auto Loader guarantees each file is ingested once, but two distinct files can legitimately contain the same order_id — an upstream retry, a re-sent export, or an updated version of the order. Both are processed once each, giving two business rows. Therefore dedup/MERGE on the business key belongs downstream in Silver/CDC.",
       ["File identity ≠ business entity identity", "Distinct files can share a key (retry, resend, update)", "Each processed once → still 2 rows", "Dedup/MERGE downstream (Silver)"],
       "Interviewers love this: it separates people who memorized 'exactly-once' from people who understand what is counted once.",
       tags=("interview", "exam"), diff=2)
S("§64")
C.spotbug("This Silver MERGE still produces duplicate order_ids when an order arrives in two different files. Which line is the bug?",
          ["MERGE INTO ecommerce.silver.orders AS t", "USING ecommerce.bronze.orders_raw_deduped AS s",
           "ON t.order_id = s.order_id AND t._source_file = s._source_file", "WHEN MATCHED THEN UPDATE SET *", "WHEN NOT MATCHED THEN INSERT *;"],
          [2], "ON t.order_id = s.order_id",
          "Matching on `_source_file` too means the same order from a different file never matches → it's inserted again. MERGE must match on the business key only; file metadata is audit data, not identity.",
          tags=("debug", "pitfall"), diff=2)
C.write("Write a SQL MERGE that upserts the latest Bronze version of each `order_id` (by `_ingested_at`) into `ecommerce.silver.orders`.",
        "MERGE INTO ecommerce.silver.orders AS t\nUSING (\n  SELECT *\n  FROM ecommerce.bronze.orders_raw\n  QUALIFY row_number() OVER (PARTITION BY order_id ORDER BY _ingested_at DESC) = 1\n) AS s\nON t.order_id = s.order_id\nWHEN MATCHED THEN UPDATE SET *\nWHEN NOT MATCHED THEN INSERT *;",
        ["merge into ecommerce.silver.orders", "row_number() over (partition by order_id", "on t.order_id = s.order_id", "when matched then update", "when not matched then insert"],
        "Dedupe the source first (one row per key, latest wins) — otherwise MERGE fails with multiple source rows matching one target row — then match on the business key only.",
        lang="sql", tags=("syntax",), diff=3)
S("§84", "§100")
C.bucket("Bronze or Silver responsibility?", ["Bronze (land faithfully)", "Silver (business correctness)"],
         [("Keep raw values, even 'unknown'", 0), ("Add `_source_file`, `_ingested_at`, `_rescued_data`", 0), ("Replayable source of truth", 0),
          ("Cast to strict types", 1), ("Deduplicate by order_id", 1), ("Apply CDC / MERGE", 1), ("Join with customers", 1)],
        "Bronze is conservative so it can be replayed; Silver applies the rules that might be wrong and might need to be re-run from Bronze.",
        tags=("compare", "pitfall"), diff=1, quick=True)
C.free("Engineering question: why not write Auto Loader directly into Silver?",
       "Because Bronze buys source fidelity, replay, audit, schema-drift handling, rescued data and debugging. If Auto Loader wrote straight into a typed, deduplicated Silver table, any wrong cast, dedup rule or CDC logic would destroy raw evidence and I couldn't rebuild. With Bronze in between, Silver can enforce business keys, types, dedup, CDC and quality — and be rebuilt from Bronze when a rule changes. It decouples ingestion from business transformation.",
       ["Source fidelity / replay", "Audit + debugging", "Schema drift + rescued data handled in Bronze", "Silver enforces keys, types, dedup, CDC, quality", "Decoupling ingestion from business logic"],
       "Short version: Bronze is your undo button.",
       tags=("interview",), diff=2)
S("§86", "Q23")
C.order("Big-Test Q23: order the recommended file-ingestion architecture.",
        ["Landing zone (immutable files)", "Auto Loader", "Bronze (raw + metadata + rescued data)", "Validate / dedup / CDC", "Silver", "Gold"],
        "Immutable files make discovery reliable, Auto Loader ingests exactly once, Bronze preserves, the validation step enforces business correctness, Silver/Gold serve consumers.",
        tags=("exam",), diff=1)
S("PA")
C.order("Production assignment, part 1 — order the experiment steps.",
        ["Ingest the first JSON file", "Restart the stream", "Add a second file", "Verify the first wasn't reprocessed",
         "Add a new column", "Observe schema evolution", "Add a malformed value", "Inspect rescued data"],
        "Each step proves one property: checkpoint survives restarts, only new files are processed, schema evolution behaves as configured, and unexpected values are rescued rather than lost.",
        tags=("concept",), diff=2)
C.order("Production assignment, part 2 — order the remaining steps.",
        ["Delete the checkpoint (sandbox only)", "Observe the changed behavior", "Restore/recreate safely",
         "Add a duplicate business key in a different file", "Verify Auto Loader processes each file once",
         "Prove the business duplicate still exists", "Deduplicate downstream"],
        "Part 2 breaks state on purpose (only in a sandbox!), then proves the key lesson: file-level exactly-once leaves business duplicates for Silver.",
        tags=("debug",), diff=2)

# =====================================================================
s14 = C.sec(14, "Choosing the Tool: spark.read vs COPY INTO vs Auto Loader",
            "Same goal, three tools — pick by file count, arrival pattern, schema churn and who writes the code.")
S("§65")
C.p("Sometimes you don't want a permanently running stream. You want: **process all new files now, then stop.** That's the **AvailableNow** trigger.")
C.flow(["start", "process backlog", "reach latest known input", "stop"], "AvailableNow")
C.code("python", 'query = (\n    orders.writeStream\n        .format("delta")\n        .option("checkpointLocation", checkpoint_path)\n        .trigger(availableNow=True)\n        .toTable("ecommerce.bronze.orders_raw")\n)\nquery.awaitTermination()   # optional: block until done',
       "Scheduled, batch-like incremental ingestion with Auto Loader")
C.callout("key", "Streaming engine, batch-like job",
          "AvailableNow shows that the streaming engine can implement **batch-like incremental jobs**: schedule it hourly in a Job, it catches up and stops — with checkpoint guarantees and no always-on cluster.")
S("§66")
C.compare(("COPY INTO", ["run command", "discover unprocessed source files", "load", "finish"]),
          ("Auto Loader", ["stateful incremental stream", "discover files continuously / in batches", "checkpoint progress", "load incrementally"]))
S("§67", "§68", "Q8")
C.compare(("Use COPY INTO when", ["moderate number of files (thousands over time)", "SQL-centric workflow", "simple ingestion", "easy retriable/idempotent loading", "reloading selected files matters (FILES, force)"]),
          ("Use Auto Loader when", ["large / continuously growing source", "millions of files", "frequent arrivals", "schema changes (richer evolution)", "streaming/incremental, high-scale production"]))
S("§94")
C.table(["Property", "spark.read", "COPY INTO", "Auto Loader"],
        [["Basic batch read", "✅", "✅", "via streaming model"],
         ["Remembers processed files", "❌", "✅", "✅"],
         ["Idempotent file load", "❌ by itself", "✅", "✅ with checkpoint/sink semantics"],
         ["SQL-friendly", "limited", "✅", "SQL via Lakeflow / read_files"],
         ["Huge file counts", "weak/manual", "okay, moderate scale", "strongest"],
         ["Continuous ingestion", "❌", "repeated runs", "✅"],
         ["Schema evolution", "manual", "supported", "strongest / flexible"],
         ["Checkpoint", "❌", "internal tracking", "explicit streaming checkpoint"],
         ["Streaming integration", "❌", "❌ (not as a stream)", "✅"]], "The comparison table")
S("§95", "§96")
trap("exam", "Millions of files arriving continuously",
     "Exam: 'millions of files arriving continuously in cloud object storage — which mechanism?' Answer: **Auto Loader** — not repeated spark.read, and typically not COPY INTO at that scale.",
     "Scale + continuous arrivals → Auto Loader.")
C.reveal("Think first: a team with SQL-only analysts gets ~20 CSV files a day from a partner and occasionally must reload one specific file. Which tool?",
         "**COPY INTO**: moderate volume, SQL-centric, idempotent re-runs, and `FILES = (...)` (+ `force` when deliberate) handles the selective reload.")

S("§95", "§68")
C.mcq("Exam trap: millions of files arrive continuously in cloud object storage. Which ingestion mechanism should you choose?",
      ["Auto Loader", "COPY INTO on a schedule", "spark.read of the whole folder every 5 minutes", "INSERT INTO from a view over the folder"], 0,
      "Auto Loader is the recommended choice for millions+ files and continuous arrivals: incremental discovery (listing or file events) and a streaming checkpoint. COPY INTO is fine for thousands; repeated spark.read re-reads everything.",
      tags=("exam",), diff=1, quick=True,
      why=["Correct.", "Typically not at that scale.", "Re-reads and duplicates.", "No file tracking."])
S("Q8", "§67", "§68")
C.bucket("COPY INTO or Auto Loader?", ["COPY INTO", "Auto Loader"],
         [("Thousands of files over time, SQL team", 0), ("Need to reload two specific files on purpose", 0), ("Simple scheduled idempotent load", 0),
          ("Millions of files", 1), ("New files every few seconds", 1), ("Frequent upstream schema changes", 1), ("Streaming pipeline feeding Silver continuously", 1)],
        "Big-Test Q8: Auto Loader wins for continuous/high-scale ingestion, millions of files and richer schema evolution; COPY INTO for moderate, SQL-centric, retriable loads.",
        tags=("compare", "exam"), diff=2, quick=True)
S("§65")
C.cloze("Make the Auto Loader write process everything available, then stop.",
        'query = (\n    orders.writeStream\n        .option("checkpointLocation", checkpoint_path)\n        .[[trigger]]([[availableNow]]=True)\n        .toTable("ecommerce.bronze.orders_raw")\n)',
        "`.trigger(availableNow=True)` processes the backlog in (possibly several) batches and stops — ideal for scheduled incremental jobs.",
        bank=["once", "processingTime", "option", "continuous"], as_code=True, tags=("syntax",), diff=2)
C.tf("A stream started with `trigger(availableNow=True)` keeps running forever, waiting for new files.", False,
     "AvailableNow processes all input available at start and then **stops**. Run it from a scheduled Job to get batch-like incremental ingestion.",
     tags=("concept", "pitfall"), diff=1)
C.write("Write the write side of an Auto Loader stream `orders` that runs as a scheduled incremental job: Delta, checkpoint at `checkpoint_path`, process all available files then stop, into `ecommerce.bronze.orders_raw`.",
        'query = (\n    orders.writeStream\n        .format("delta")\n        .option("checkpointLocation", checkpoint_path)\n        .trigger(availableNow=True)\n        .toTable("ecommerce.bronze.orders_raw")\n)',
        ["writestream", '"checkpointlocation", checkpoint_path', "trigger(availablenow=true)", 'totable("ecommerce.bronze.orders_raw")'],
        "Same skeleton as a continuous stream plus `.trigger(availableNow=True)`. The checkpoint still guarantees that the next scheduled run starts where this one stopped.",
        lang="python", tags=("syntax",), diff=2)
S("§94")
C.match("Match the property to the tool that is strongest at it (per the comparison table).",
        [("Explicit streaming checkpoint", "Auto Loader"), ("Simple SQL, idempotent re-runs, no stream", "COPY INTO"),
         ("Reads whatever is there now, no memory", "spark.read")],
        "spark.read has no memory; COPY INTO tracks files internally per run; Auto Loader keeps an explicit streaming checkpoint and integrates with streaming.",
        tags=("compare",), diff=1)
C.mcq("Per the comparison table, how does COPY INTO handle 'continuous ingestion'?",
      ["Through repeated runs (e.g. a scheduled job)", "Natively as a stream", "Not at all — it can only run once per table", "Through file notifications"], 0,
      "COPY INTO is a command: run → load new files → finish. Continuity means scheduling it repeatedly; it isn't a stream. Auto Loader is the native streaming option.",
      tags=("compare",), diff=2,
      why=["Correct.", "It's not a streaming source.", "It can run any number of times — idempotently.", "That's an Auto Loader discovery mode."])
C.odd("Which statement does NOT describe Auto Loader?",
      ["Stateful incremental stream", "Discovers files continuously or in batches", "Checkpoints its progress", "Runs once, loads, and keeps no state between runs"], 3,
      "'Run, load, finish' with only internal tracking is COPY INTO's mental model; spark.read keeps no state at all. Auto Loader is a stateful stream with a checkpoint.",
      tags=("compare",), diff=1)
S("§66", "§67")
C.scenario("A partner drops ~30 CSV files per day into a Volume. Your team is SQL-first. Last week a bad file had to be reloaded after the partner fixed it. Which design?",
           [("Pick the ingestion tool.",
             [("COPY INTO, scheduled", True, "Moderate volume, SQL-centric, idempotent re-runs — COPY INTO's sweet spot."),
              ("Always-on Auto Loader cluster", False, "Works, but heavier than needed for 30 files/day and a SQL team."),
              ("Nightly spark.read + append", False, "Re-reads everything → duplicates.")]),
            ("The partner overwrites `orders_0928.csv` with a fixed version. What happens on the next COPY INTO run?",
             [("It's skipped — already loaded, even though content changed", True, "So corrections need a new file name or a deliberate reload."),
              ("It's reloaded automatically", False, "COPY INTO skips loaded files even if modified."),
              ("COPY INTO fails", False, "It succeeds — silently skipping the file.")]),
            ("Best way to get the fix in?",
             [("Ask for corrections as new files; if unavoidable, reload that file with FILES + force and remove the old rows", True, "Immutable delivery first; force only deliberately with cleanup."),
              ("Drop the table and reload everything every day", False, "Expensive and loses idempotency."),
              ("Delete COPY INTO's history by recreating the Volume", False, "Destructive and unnecessary.")])],
           tags=("compare", "debug"), diff=2)

# =====================================================================
s15 = C.sec(15, "Debugging I: Missing Rows & Overwritten Files",
            "'New files exist but no rows appear' has eight possible breakpoints — check them in order.")
S("§76")
C.p("Symptom: the landing zone has new files, Bronze has **no new rows**. Don't guess — walk the chain from the source to the sink:")
C.flow(["New files exist?", "Path matches?", "Extension/format right?", "Discovered?", "Checkpoint: already processed?", "Parsing failure?", "Schema issue?", "Sink write failure?"],
       "Systematic order: source → sink")
C.table(["Breakpoint", "Typical evidence"],
        [["Files don't exist", "Upstream says 'sent', listing of the path shows nothing"],
         ["Path mismatch", "Stream reads `/raw/order/`, files land in `/raw/orders/`"],
         ["Wrong extension/format", "cloudFiles.format json, files are `.csv` / `.json.gz` / filtered out"],
         ["Not discovered", "Stream progress shows 0 input files"],
         ["Already processed", "Same file names as before (overwrite) → checkpoint says done"],
         ["Parsing failure", "Rows null / in `_rescued_data` / corrupt records"],
         ["Schema issue", "Stream stopped on schema change; rows rejected"],
         ["Sink failure", "Write error, permissions, table dropped"]])
C.ask("Ask yourself when new files exist but no rows appear", [
    "Do the new files actually exist where I think (list the path)?",
    "Does the stream's `.load()` path exactly match where they land?",
    "Are the extension and format what the reader expects?",
    "Did Auto Loader discover them (query progress: numFilesOutstanding / input rows)?",
    "Does the checkpoint consider them already processed (same names, overwritten)?",
    "Did parsing fail (nulls, `_rescued_data`, corrupt records)?",
    "Is the stream stopped on a schema change?",
    "Did the write to the sink fail (permissions, table changed)?"])
S("§77", "§78", "Q24")
C.p("**File accidentally overwritten**: COPY INTO may still treat a previously loaded file as processed **even if its contents changed** — the correction never arrives. Auto Loader behaves similarly by default (it doesn't reprocess modified files unless `cloudFiles.allowOverwrites` is enabled, which risks duplicates).")
C.compare(("Mutable delivery (avoid)", ["upload `file.csv`", "later mutate `file.csv`", "later mutate again", "`orders_latest.json` overwritten repeatedly"]),
          ("Immutable delivery (prefer)", ["`orders_20260928_001.json`", "`orders_20260928_002.json`", "a correction = a NEW file", "every file identity appears once"]))
trap("pitfall", "Overwriting source files in place",
     "Incremental loaders reason about **file identity**. An overwritten file may be skipped as 'already loaded' (lost correction) or, with overwrites allowed, reprocessed (duplicates).",
     "Agree on immutable landing zones: unique file names, corrections as new files.")
C.ask("Ask yourself when a corrected source file doesn't show up", [
    "Was the correction delivered as a new file or as an overwrite of a loaded one?",
    "Does the loader consider that file identity already processed?",
    "Is the file's modification time later than its rows' `_ingested_at`?",
    "If I force a reload, what removes the old rows first?"])
C.callout("key", "Immutable landing zones are easier to reason about",
          "Incremental systems reason much more reliably about **new file identities** than about mutable files.")

S("§76")
C.order("Order the checks for 'new files exist but no rows appear' (source → sink).",
        ["Do the new files actually exist?", "Does the path match?", "Are extension/format correct?", "Did Auto Loader discover them?",
         "Does the checkpoint say already processed?", "Parsing failure?", "Schema issue?", "Sink write failure?"],
        "Start at the source and move toward the sink; the first check that fails is where reality diverges from expectation. Jumping to 'schema issue' before confirming the files exist wastes hours.",
        tags=("debug",), diff=2, quick=True)
C.spotbug("Files land in `/Volumes/ecommerce/raw/orders/`. The stream runs without errors but Bronze never gets new rows. Which line?",
          ["orders = (", "    spark.readStream", '        .format("cloudFiles")', '        .option("cloudFiles.format", "json")',
           '        .option("cloudFiles.schemaLocation", schema_path)', '        .load("/Volumes/ecommerce/raw/order/")', ")"],
          [5], '        .load("/Volumes/ecommerce/raw/orders/")',
          "The stream watches `/raw/order/` (singular) — a path mismatch, check #2 in the chain. No error is raised because an empty or different directory is perfectly valid.",
          tags=("debug",), diff=1, quick=True)
C.mcq("Bronze has no new rows. You've confirmed the files exist. What do you check next?",
      ["Whether the stream's load path exactly matches where the files land", "Whether the sink table has enough partitions",
       "Whether Photon is enabled", "Whether the schema hints are alphabetical"], 0,
      "Next in the chain after 'files exist' is 'path matches'. Partitions, Photon and hint order don't stop files from being picked up.",
      tags=("debug",), diff=1,
      why=["Correct.", "Irrelevant to discovery.", "Engine choice doesn't hide files.", "Order doesn't matter."])
S("§77", "§78", "Q24")
C.tf("Big-Test Q24: incremental ingestion systems reason more reliably about new immutable file identities than about repeatedly mutated file names.", True,
     "A loader that tracks file identity can't tell 'new content in an old name' reliably — it either skips it (lost update) or reprocesses it (duplicates). Unique, immutable files avoid both.",
     tags=("exam", "concept"), diff=1, quick=True)
C.mcq("Which delivery convention is best for incremental ingestion?",
      ["`orders_20260928_001.json`, `orders_20260928_002.json`, … never modified", "`orders_latest.json` overwritten every 5 minutes",
       "`orders.csv` appended in place", "One folder per day, files replaced on corrections"], 0,
      "Unique, immutable file names give each delivery a new identity that COPY INTO / Auto Loader can track exactly once. The others mutate an existing identity.",
      tags=("concept",), diff=1,
      why=["Correct.", "Overwritten identity → skipped or duplicated.", "Appending in place mutates a tracked file.", "Replacing files mutates identities."])
C.free("Big-Test Q24: why use immutable files in the landing zone? Mention what goes wrong otherwise with COPY INTO.",
       "Incremental loaders track file identity. With immutable, uniquely named files each delivery is a new identity and is loaded exactly once. If a source overwrites a file, COPY INTO (and Auto Loader by default) treat it as already loaded and skip it, so the correction is silently lost; forcing reloads or allowing overwrites risks duplicates. Immutable files make loads predictable, auditable and replayable.",
       ["Loaders track file identity", "New immutable file = new identity = loaded once", "Overwritten file is skipped (lost correction)", "Forcing/allowing overwrites → duplicates"],
       "Name corrections as new files, e.g. `orders_20260928_001_v2.json`.",
       tags=("exam", "interview"), diff=2)

S("§76")
playbook(8, "New files exist but no rows appear", s15,
         "Upstream says files were delivered; the landing zone listing shows them; `ecommerce.bronze.orders_raw` has no new rows. The stream/job shows no errors.",
         ["Do the new files actually exist where I think?",
          "Does the stream's load path exactly match the landing path?",
          "Are the extension and format what the reader expects?",
          "Did Auto Loader discover them at all (query progress)?",
          "Does the checkpoint say they were already processed (same names)?",
          "Did parsing fail (nulls / `_rescued_data` / corrupt records)?",
          "Is the stream stopped on a schema change?",
          "Did the write to the sink fail?"],
         [("List the landing path and compare with the stream's `.load()` path.", "Covers existence + path mismatch.", 'display(dbutils.fs.ls("/Volumes/ecommerce/raw/orders/"))'),
          ("Check format/extension vs `cloudFiles.format` and any filters.", "A `.csv.gz` or `.JSON` may not be what you expect."),
          ("Inspect the query's recent progress (input rows, files).", "Proves whether discovery happened.", "query.recentProgress"),
          ("Compare the new file names with already-ingested `_source_file`s.", "Same names = considered processed."),
          ("Query `_rescued_data` / nulls for the latest ingestion.", "Parsing problems hide rows' content."),
          ("Check the stream status/errors and the sink table.", "Schema stops and sink failures end the chain.")],
         ["Files never arrived", "Path mismatch", "Wrong extension/format", "Not discovered", "Overwritten names already processed", "Parsing failure", "Schema change stop", "Sink write failure"],
         "Find the first breakpoint along source → sink and fix exactly there (path, format, naming, parser options, schema policy or sink).",
         mnemonic="EXIST · PATH · FORMAT · FOUND · DONE? · PARSE · SCHEMA · SINK")
C.scenario("Upstream: 'We delivered 12 order files at 09:00.' Bronze: no new rows since 08:55. The Auto Loader stream shows status 'running'.",
           [("First check?",
             [("List the landing path to see whether the 12 files are really there", True, "Start at the source: existence first."),
              ("Restart the stream with a new checkpoint", False, "Destroys progress and risks duplicates before you know anything."),
              ("Enable inferColumnTypes", False, "Types don't make files appear.")]),
            ("Files are in `/Volumes/ecommerce/raw/orders/2026/09/28/`. The stream loads `/Volumes/ecommerce/raw/orders/`. Query progress shows 12 new files read but 0 rows written. Next?",
             [("Check parsing: nulls / `_rescued_data` / a format or extension mismatch", True, "Files were discovered, so the break is later in the chain — parsing."),
              ("Check the path again", False, "Progress shows the files were discovered, so the path is fine."),
              ("Check the checkpoint for deletion", False, "The files were read; the checkpoint isn't skipping them.")]),
            ("The files are gzip CSV (`.csv.gz`) while `cloudFiles.format` is `json`. Fix?",
             [("Set the correct format (csv) and parser options for that feed — or a separate stream if both formats coexist", True, "The grammar must match the files."),
              ("Rename the files to .json", False, "Renaming doesn't change content; it would still fail to parse."),
              ("Drop the Bronze table", False, "Unrelated and destructive.")])],
           tags=("debug",), diff=2)
S("§77", "§78")
playbook(9, "Source file overwritten: the correction never arrived", s15,
         "Upstream fixed wrong amounts by re-uploading `orders_0928.csv` under the same name. Bronze/Silver still show the old wrong amounts. COPY INTO runs succeed.",
         ["Was the correction delivered as a NEW file or by overwriting an already-loaded one?",
          "Does COPY INTO / Auto Loader consider that file identity already processed?",
          "Do Bronze rows from that file show the old `_ingested_at` only?",
          "Do I need a deliberate reload (FILES + force) and cleanup of the old rows?",
          "Can upstream switch to immutable, uniquely named deliveries?"],
         [("Compare the file's modification time with the Bronze `_ingested_at` for that `_source_file`.", "Modified after ingestion = overwritten in place."),
          ("Confirm the loader skipped it (no new rows for that file).", "COPY INTO skips loaded files even if changed."),
          ("Delete the old rows of that file, then reload deliberately.", "Avoid duplicates while getting the correction in.",
           "DELETE FROM ecommerce.bronze.orders_raw WHERE _source_file LIKE '%orders_0928.csv';\n\nCOPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders_csv/'\nFILEFORMAT = CSV\nFILES = ('orders_0928.csv')\nFORMAT_OPTIONS ('header' = 'true')\nCOPY_OPTIONS ('force' = 'true');"),
          ("Agree on immutable delivery (corrections as new files).", "Prevents the next lost correction.")],
         ["Source overwrote an already-loaded file", "Loader tracks file identity, not content", "No immutable-delivery agreement"],
         "Reload deliberately (cleanup + FILES + force) and move upstream to immutable, uniquely named files.",
         mnemonic="SAME NAME = SAME FILE (to the loader)")
C.scenario("Finance says the 28 Sept amounts are still wrong although the partner 'fixed and re-uploaded the file this morning'. Your scheduled COPY INTO ran fine after the re-upload.",
           [("Most likely explanation?",
             [("COPY INTO skipped the re-uploaded file because that file was already loaded", True, "Already-loaded files are skipped even if modified."),
              ("COPY INTO failed silently", False, "It succeeded — skipping is normal behavior."),
              ("Silver's MERGE is broken", False, "Check ingestion first: Bronze never received the new content.")]),
            ("How do you prove it?",
             [("Compare the file's modification time with `_ingested_at` of its Bronze rows", True, "Modified after it was ingested → overwrite that was skipped."),
              ("Count all Bronze rows", False, "Doesn't show which file content is loaded."),
              ("Run VALIDATE ALL", False, "Validation checks parse/schema, not load history.")]),
            ("Fix now, and prevent next time?",
             [("Delete that file's old rows, reload it with FILES + force; ask the partner for new file names on corrections", True, "Deliberate reload without duplicates + immutable delivery."),
              ("Run COPY INTO with force on the whole folder", False, "Reloads every file → mass duplicates."),
              ("Wait for tomorrow's run", False, "It will skip the file again.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'overwritten source file, correction missing'.",
        ["Check whether the file was overwritten (mtime vs `_ingested_at`)", "Confirm the loader skipped it",
         "Delete that file's old rows", "Reload just that file deliberately (FILES + force)", "Agree on immutable delivery"],
        "Prove the overwrite, then reload surgically. Forcing without deleting the old rows first would leave both versions in Bronze.",
        tags=("debug",), diff=2)

# =====================================================================
s16 = C.sec(16, "Debugging II: Schema Shifts, Missing Columns, Duplicate IDs & Bad CSV",
            "Four incidents you will meet in your first month — each with its own ordered questions.")
S("§79")
C.p("**Schema suddenly changes.** Yesterday `amount STRING`; today the source sends `amount` as a **STRUCT**.")
C.ask("Ask yourself when the source schema suddenly changes", [
    "Was the source contract intentionally changed?",
    "Did only one corrupt file do this?",
    "Should the field be rescued?",
    "Should the schema evolve?",
    "Should the stream fail?"])
trap("warn", "Don't blindly allow everything",
     "Turning on every evolution option lets an accidental upstream change (e.g. amount becoming a struct) flow silently into Silver and Gold.",
     "Decide per change: evolve (intentional), rescue (unexpected but keep), or fail (contract violation).")
S("§80")
C.p("**New column missing.** Upstream adds `discount`, but Bronze doesn't show it. Check: **schema evolution mode**, **schemaLocation state**, a **provided explicit schema**, **rescued data**.")
C.callout("debug", "Explicit schema swallows new columns",
          "If you supplied a strict explicit schema, a new field won't appear as a regular column automatically (mode `none`). Look in `_rescued_data` — if you enabled it.")
C.ask("Ask yourself when a new upstream column is missing", [
    "Which schemaEvolutionMode is in effect?",
    "What does the latest schema in schemaLocation contain?",
    "Am I providing a strict explicit schema without the new field?",
    "Is the value sitting in `_rescued_data` — is rescue even enabled?"])
S("§81")
C.p("**Duplicated business IDs.** Rows show `order_id=100` twice. **Do not immediately blame Auto Loader.**")
C.table(["Question", "If yes →"],
        [["Same source file loaded twice?", "Ingestion problem (checkpoint reset, force, plain re-read)"],
         ["Two different files both contain the ID?", "Source behavior — dedupe in Silver"],
         ["Upstream retry re-sent the order?", "Source behavior — dedupe in Silver"],
         ["Silver MERGE/dedup missing or wrong key?", "Transformation problem"],
         ["Checkpoint reset?", "Ingestion problem — reconcile"]])
C.callout("key", "File idempotency vs business-key idempotency",
          "This is exactly why we separate **file idempotency** (Auto Loader / COPY INTO) from **business-key idempotency** (dedup / MERGE in Silver).")
C.ask("Ask yourself when you see duplicated business IDs", [
    "Was the same source file loaded twice?",
    "Do two different files both contain the ID?",
    "Was it an upstream retry?",
    "Is the Silver MERGE/dedup missing or keyed wrongly?",
    "Was a checkpoint reset?"])
S("§82")
C.p("**Malformed CSV.** Expected `id,amount` / `1,10.5`. Bad line: `2,\"10.5` — an **unclosed quote**.")
C.p("Possible results: **parse error**, **corrupt/rescued data**, or **unexpected columns** (the quote swallows the separator and the next line). Investigate the parser options: `quote`, `escape`, `multiLine`, `delimiter`, `header`.")
C.code("python", 'df = (\n    spark.read\n        .format("csv")\n        .option("header", "true")\n        .option("quote", \'"\')\n        .option("escape", \'"\')\n        .option("multiLine", "true")\n        .option("mode", "PERMISSIVE")\n        .option("columnNameOfCorruptRecord", "_corrupt_record")\n        .schema("id BIGINT, amount DOUBLE, _corrupt_record STRING")\n        .load(path)\n)', "Make bad lines visible instead of guessing")
C.ask("Ask yourself when a CSV has malformed rows", [
    "What does the raw line look like?",
    "Is there an unclosed or unescaped quote (quote / escape)?",
    "Do quoted fields contain newlines (multiLine)?",
    "Are delimiter and header right?",
    "Is my mode hiding bad rows (DROPMALFORMED) or surfacing them?"])
trap("pitfall", "multiLine + broken quote = swallowed rows",
     "With `multiLine=true`, an unclosed quote can make the parser treat the following lines as part of one field — several good rows can vanish into one bad record.",
     "Inspect raw lines around the failure, fix quote/escape settings, and keep corrupt/rescued records visible instead of dropping them.")

S("§79")
C.order("Order the questions to ask when `amount` suddenly arrives as a STRUCT.",
        ["Was the source contract intentionally changed?", "Did only one corrupt file do this?", "Should the field be rescued?",
         "Should the schema evolve?", "Should the stream fail?"],
        "First establish intent and blast radius (one file or all?), then choose the policy: rescue, evolve or fail. Policies chosen before knowing intent are guesses.",
        tags=("debug",), diff=2, quick=True)
C.tf("The safest response to an unexpected upstream schema change is to enable every schema-evolution option so the stream never fails again.", False,
     "Blind evolution lets accidental upstream changes (like `amount` turning into a struct) flow silently into Silver and Gold. Decide per change: evolve if intentional, rescue if unexpected but worth keeping, fail if it violates the contract.",
     tags=("pitfall",), diff=1)
S("§81")
C.bucket("Duplicate `order_id=100` rows. Classify each cause.", ["Ingestion problem", "Source behavior (dedupe in Silver)", "Transformation problem"],
         [("Same source file loaded twice", 0), ("Checkpoint reset re-ingested old files", 0), ("COPY INTO run with force on the whole folder", 0),
          ("Two different files both contain order 100", 1), ("Upstream retry re-sent the order", 1),
          ("Silver MERGE missing", 2), ("MERGE matches on the wrong key", 2)],
        "Classifying the duplicate tells you where to fix it. Ingestion problems → fix state/loads and reconcile Bronze; source behavior → expected, dedupe in Silver; transformation problems → fix the MERGE.",
        tags=("debug",), diff=2, quick=True)
S("§82")
C.mcq("A CSV line reads `2,\"10.5` (opening quote, no closing quote). Which parser options do you investigate first?",
      ["quote, escape, multiLine, delimiter, header", "cloudFiles.schemaLocation and checkpointLocation", "PATTERN and FILES", "mergeSchema in COPY_OPTIONS"], 0,
      "A quoting problem is a grammar problem: quote/escape decide how quotes are parsed, multiLine whether a quoted field may continue on the next line, delimiter/header the basic structure. State locations and file filters are unrelated.",
      tags=("debug",), diff=1, quick=True,
      why=["Correct.", "State locations don't parse lines.", "They choose files, not how lines parse.", "Schema merging isn't a quoting fix."])
C.tf("In PERMISSIVE mode with `columnNameOfCorruptRecord`, malformed CSV lines can be kept in a corrupt-record column instead of being dropped.", True,
     "PERMISSIVE keeps the row (nulls for unparsable fields) and can store the raw line in the named column — evidence you can inspect or quarantine.",
     tags=("debug", "concept"), diff=2)
C.spotbug("A CSV of addresses with quoted line breaks (`\"Main St\\nApt 4\"`) produces twice as many rows as expected, half of them garbage. Which line needs changing?",
          ['df = (', '    spark.read', '        .format("csv")', '        .option("header", "true")', '        .option("multiLine", "false")',
           '        .schema(schema)', '        .load(path)', ')'],
          [4], '        .option("multiLine", "true")',
          "Quoted fields containing newlines need `multiLine=true`; otherwise each physical line becomes a row and the quoted address is split in two. (Only enable it when needed: it also changes how broken quotes behave.)",
          tags=("debug",), diff=2)

S("§79")
playbook(10, "Source schema suddenly changed (STRING → STRUCT)", s16,
         "Bronze worked yesterday with `amount STRING`; today Auto Loader stops, rescues lots of values, or `amount` contains JSON blobs like `{\"value\":19.5,\"currency\":\"EUR\"}`.",
         ["Was the source contract intentionally changed?",
          "Did only one corrupt file do this, or every new file?",
          "Should the field be rescued (keep running, inspect later)?",
          "Should the schema evolve (intentional, agreed change)?",
          "Should the stream fail (contract violation that needs review)?"],
         [("Find which files carry the new shape (`_source_file`, `_rescued_data`).", "One file = bad delivery; all files = contract change."),
          ("Ask upstream whether the change is intentional and documented.", "Policy depends on intent."),
          ("Choose: rescue (schemaEvolutionMode rescue / rescued column), evolve deliberately, or fail.", "Don't blindly allow everything."),
          ("Adapt Silver parsing (e.g. extract `amount.value`) only after the decision.", "Keeps Silver correct across old and new shapes.")],
         ["Intentional upstream contract change", "A single corrupt/test file", "No agreed evolution policy"],
         "Establish intent and scope, then deliberately rescue, evolve or fail; never 'enable everything'.",
         mnemonic="INTENT → ONE FILE? → RESCUE / EVOLVE / FAIL")
C.scenario("Today's Bronze rows show `amount` = `{\"value\":19.5,\"currency\":\"EUR\"}` instead of `19.5`. Silver casts now produce nulls.",
           [("First question?",
             [("Was this contract change intentional, and does it affect all new files or one?", True, "Intent + scope decide everything that follows."),
              ("How do I enable automatic type widening everywhere?", False, "Blindly allowing changes is how bugs reach Gold."),
              ("Should I delete today's files?", False, "Destroys evidence and real orders.")]),
            ("Every new file has the new shape, and upstream confirms it's intended. Next?",
             [("Agree the new contract and update Silver to extract `value`/`currency` (evolve deliberately)", True, "An intentional change gets a deliberate, reviewed adaptation."),
              ("Set the stream to rescue mode forever and ignore it", False, "Then every amount lives in `_rescued_data` and Silver stays broken."),
              ("Cast the struct to DOUBLE", False, "Not a valid cast; values stay null.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'schema suddenly changed'.",
        ["Find which files carry the new shape", "Ask upstream if the change is intentional", "Decide: rescue, evolve or fail",
         "Adapt Silver parsing after the decision", "Monitor rescued data for the next deliveries"],
        "Scope and intent come before policy; Silver changes come after the policy is decided.",
        tags=("debug",), diff=2)
S("§80")
playbook(11, "New upstream column missing from Bronze", s16,
         "Upstream added `discount` last week. Bronze `orders_raw` has no `discount` column; nothing failed.",
         ["Which schemaEvolutionMode is in effect (explicit default none? rescue?)",
          "What does the latest schema under schemaLocation contain?",
          "Am I providing a strict explicit schema that doesn't list `discount`?",
          "Is the value sitting in `_rescued_data` — and is rescue even enabled?",
          "Did the stream actually restart after an addNewColumns stop?"],
         [("Read the stream definition: `.schema(...)`, schemaEvolutionMode, rescuedDataColumn.", "Explicit schema → mode none → column ignored."),
          ("Inspect the latest schema version in schemaLocation.", "With inference + addNewColumns the new column should appear there."),
          ("Query `_rescued_data` for `discount`.", "In rescue mode (or with rescuedDataColumn) the values are preserved.",
           "SELECT _rescued_data FROM ecommerce.bronze.orders_raw WHERE _rescued_data LIKE '%discount%' LIMIT 10;"),
          ("If the column is wanted: add it to the explicit schema / switch mode, and backfill from rescued data or source files.", "Deliberate evolution plus recovery of the missed values.")],
         ["Strict explicit schema (mode none)", "rescue mode keeps it in `_rescued_data`", "Stream not restarted after evolution stop"],
         "Check mode → schemaLocation → explicit schema → rescued data; then evolve deliberately and backfill.",
         mnemonic="MODE · SCHEMALOC · EXPLICIT · RESCUED")
C.scenario("Upstream added `discount` 5 days ago. Bronze has no such column; the stream never failed. Your read uses `.schema(schema)` with 5 columns.",
           [("What explains 'never failed, column missing'?",
             [("With a provided schema the evolution mode defaults to none: new columns are ignored", True, "Explicit schema + mode none = silent ignore (unless rescued)."),
              ("Auto Loader can't read new columns", False, "It can — evolution is a configuration choice."),
              ("The checkpoint is corrupt", False, "Checkpoint corruption wouldn't selectively drop one field.")]),
            ("Is the discount data lost?",
             [("Only if rescuedDataColumn wasn't set — otherwise it's in `_rescued_data`; and the source files still have it", True, "Check rescued data first, the immutable source files second."),
              ("Yes, permanently", False, "Source files are still in the landing zone."),
              ("No, it's in a hidden `discount` column", False, "There's no hidden column.")]),
            ("Fix?",
             [("Add `discount` to the schema deliberately and backfill the missed values", True, "Reviewed evolution + recovery."),
              ("Delete the checkpoint to reprocess everything", False, "That duplicates every file."),
              ("Switch to inferSchema in batch", False, "Loses incremental state.")])],
           tags=("debug", "pitfall"), diff=2)
C.order("Order the playbook for 'new column missing'.",
        ["Check schemaEvolutionMode", "Inspect schemaLocation's latest schema", "Check for a strict explicit schema",
         "Look in `_rescued_data`", "Evolve deliberately and backfill"],
        "The four checks from the source in order: mode, schemaLocation state, explicit schema, rescued data — then act.",
        tags=("debug",), diff=2)
S("§81")
playbook(12, "Duplicated business IDs in Bronze/Silver", s16,
         "`order_id = 100` appears twice (or more) in Bronze and/or Silver.",
         ["Was the same source file loaded twice?",
          "Do two different files both contain the ID?",
          "Was it an upstream retry/resend?",
          "Is the Silver MERGE/dedup missing or keyed wrongly?",
          "Was a checkpoint reset (or COPY INTO forced)?"],
         [("Group the duplicates by `_source_file` and `_ingested_at`.", "Same file twice = ingestion; different files = source.",
           "SELECT order_id, _source_file, _ingested_at\nFROM ecommerce.bronze.orders_raw\nWHERE order_id = 100;"),
          ("If same file twice: look for checkpoint resets, force reloads, plain re-reads.", "Fix state and reconcile Bronze."),
          ("If different files: confirm with upstream (retry/resend/update).", "Expected source behavior."),
          ("Check the Silver MERGE: dedupe source by key, match on business key only.", "Business-key idempotency belongs here.")],
         ["Same file ingested twice (checkpoint reset / force / re-read)", "Distinct files with same key (retry/resend)", "Missing or wrong Silver dedup/MERGE"],
         "Separate file idempotency (fix loads/state) from business-key idempotency (dedupe/MERGE in Silver). Don't immediately blame Auto Loader.",
         mnemonic="SAME FILE? · OTHER FILE? · RETRY? · MERGE? · RESET?")
C.scenario("Silver `orders` has two rows for order_id 100. A colleague says 'Auto Loader is broken, it duplicates data'.",
           [("What do you do first?",
             [("Look at the Bronze rows for order 100 with `_source_file` and `_ingested_at`", True, "Evidence before blame."),
              ("Delete Auto Loader's checkpoint to 'reset' it", False, "That would create real duplicates."),
              ("Add DISTINCT to the Gold query", False, "Hides the symptom.")]),
            ("The two Bronze rows come from two different files (`..._001.json`, `..._007.json`). Conclusion?",
             [("Auto Loader worked: two files legitimately contain the same ID; Silver must dedupe/MERGE by order_id", True, "File-level exactly-once ≠ business dedup."),
              ("Auto Loader processed a file twice", False, "Different file names = different files."),
              ("The checkpoint was reset", False, "A reset would show the SAME file twice.")]),
            ("Silver uses MERGE ON order_id AND _source_file. Fix?",
             [("Dedupe the source by order_id and MERGE on order_id only", True, "Business key only; file path is audit data."),
              ("Add `_ingested_at` to the ON clause too", False, "Makes matching even rarer → more duplicates."),
              ("Switch Silver to append", False, "Append guarantees duplicates.")])],
           tags=("debug",), diff=2)
C.order("Order the duplicate-ID checks from the source's list.",
        ["Same source file loaded twice?", "Two different files both contain the ID?", "Upstream retry?", "Silver merge/dedup missing?", "Checkpoint reset?"],
        "First distinguish ingestion vs source (same file vs different files), then the downstream dedup, then state resets. Each answer points to a different layer.",
        tags=("debug",), diff=2)
S("§82")
playbook(13, "Malformed CSV rows", s16,
         "A CSV feed produces parse errors, rows with null amounts, values in `_rescued_data`/`_corrupt_record`, or rows with unexpected extra columns — e.g. a line `2,\"10.5`.",
         ["What does the raw line look like around the failure?",
          "Is the quote character right — and is there an unclosed quote?",
          "How are quotes escaped inside fields (escape)?",
          "Do quoted fields contain newlines (multiLine)?",
          "Is the delimiter right, and is the header option correct?",
          "Which mode is hiding or surfacing the bad rows?"],
         [("Read the raw text of the file to see the exact bad line.", "You need the real grammar, not a guess.", 'spark.read.text(path).show(20, truncate=False)'),
          ("Compare quote/escape/multiLine/delimiter/header with the file.", "Each is one grammar rule."),
          ("Make bad rows visible: PERMISSIVE + columnNameOfCorruptRecord (or rescued data).", "Evidence instead of silent nulls/drops.", '.option("mode", "PERMISSIVE")\n.option("columnNameOfCorruptRecord", "_corrupt_record")'),
          ("Fix options or get upstream to fix the export; quarantine the bad rows.", "Clean data continues; bad data stays inspectable.")],
         ["Unclosed or unescaped quotes", "Embedded newlines without multiLine", "Wrong delimiter/header", "Mode silently dropping/nulling rows"],
         "Look at the raw line, align quote/escape/multiLine/delimiter/header with the file, keep bad rows visible and quarantined.",
         mnemonic="RAW → QUOTE → ESCAPE → MULTILINE → DELIM/HEADER → MODE")
C.scenario("A partner CSV suddenly loads with fewer rows than the partner reports, and some `amount`s are null. No job failed.",
           [("First step?",
             [("Look at the raw text lines of the file", True, "Parsing problems are only understood from the raw grammar."),
              ("Switch to FAILFAST in production immediately", False, "Useful to surface errors, but first look at what's wrong."),
              ("Re-run the load", False, "Same input, same parse result.")]),
            ("Raw line: `2,\"10.5` followed by normal lines. multiLine=true is set. Why are rows missing?",
             [("The unclosed quote makes the parser swallow following lines into one field", True, "multiLine lets a quoted field continue across lines."),
              ("The delimiter is wrong", False, "Other lines parse fine with comma."),
              ("The header option is missing", False, "That would affect column names, not swallow rows.")]),
            ("Best handling?",
             [("Keep bad records visible (corrupt/rescued column), quarantine them, and ask the partner to fix quoting", True, "Evidence + clean flow + fix at the source."),
              ("Use DROPMALFORMED and move on", False, "Silently loses rows — the original complaint."),
              ("Strip all quotes with a regex before reading", False, "Breaks legitimate quoted fields containing commas.")])],
           tags=("debug", "pitfall"), diff=3)
C.order("Order the playbook for 'malformed CSV'.",
        ["Read the raw lines around the failure", "Check quote and escape settings", "Check multiLine", "Check delimiter and header",
         "Make bad rows visible (PERMISSIVE + corrupt/rescued column)", "Quarantine and fix at the source"],
        "Grammar rules from most to least likely for a broken quote, then visibility and remediation.",
        tags=("debug",), diff=2)
S("§80", "§81", "§79", "§82")
C.match("Match each symptom to the FIRST thing you check.",
        [("New column missing from Bronze", "Schema evolution mode / explicit schema"),
         ("order_id duplicated", "Same file twice or different files?"),
         ("amount suddenly a STRUCT", "Was the contract change intentional?"),
         ("CSV rows swallowed after `2,\"10.5`", "quote / escape / multiLine"),
         ("New files, no rows", "Do the files exist at the stream's path?")],
        "Each incident has its own entry point. Starting at the right one is most of the speed of a good debugger.",
        tags=("debug",), diff=2)

# =====================================================================
# Flashcards
F = [
 ("What is ingestion?", "Bringing data that lives outside the platform into it — here, files into Delta tables.", s01),
 ("Six questions every ingestion pipeline answers?", "Where is the data → discover → read → interpret with schema → remember what's processed → write reliably to Delta.", s01),
 ("Is `spark.read` batch or incremental?", "Batch: reads the path's current contents, no memory of earlier runs.", s02),
 ("CSV without the header option gives which column names?", "`_c0, _c1, _c2…` — and the header line becomes a data row.", s02),
 ("Option for a pipe-separated file?", "`.option(\"delimiter\", \"|\")` (alias `sep`).", s02),
 ("Three CSV `mode` values?", "PERMISSIVE (default, nulls + optional corrupt column), DROPMALFORMED (drop), FAILFAST (throw).", s02),
 ("CSV with no schema and no inferSchema → column types?", "All STRING.", s02),
 ("Why does schema inference cost time?", "Spark must inspect the data to decide types before the real read (extra pass).", s03),
 ("Two ways to pass an explicit schema?", "A StructType of StructFields, or a DDL string like `\"order_id BIGINT, amount DOUBLE\"`.", s03),
 ("Five benefits of explicit schema in production?", "Faster (no inference pass), predictable, version-controlled, no type surprises, easier validation.", s03),
 ("Schema inference bug example?", "Monday amounts 100, 200 → INT; Tuesday 100.50 → DOUBLE: the inferred type changes between runs.", s03),
 ("What does a nested JSON object become?", "A struct column (e.g. `customer.name`).", s04),
 ("Why doesn't Parquet need inferSchema?", "Its schema (names + types) is stored in the file.", s04),
 ("CSV vs JSON vs Parquet in one line each?", "CSV: textual, weak types. JSON: semi-structured, types from content. Parquet: columnar, schema in file.", s04),
 ("What is `read_files`?", "Databricks SQL table-valued function reading CSV/JSON/XML/text/binary/Parquet/Avro/ORC, with format/schema inference.", s04),
 ("`STREAM read_files(...)` in a streaming table uses…?", "Auto Loader under the hood.", s04),
 ("How do you get the source file path of a row?", "`_metadata.file_path` (hidden column; select it explicitly).", s05),
 ("Minimum audit columns in Bronze?", "`_source_file` and `_ingested_at` (plus `_rescued_data`).", s05),
 ("Run plain spark.read + append twice on the same files →?", "Duplicate rows: no file-history memory.", s06),
 ("Problems of filtering input by date folder?", "Late files, backfills, re-uploads, timezone bugs, renamed files, missing folders.", s06),
 ("What does COPY INTO remember?", "Which source files it has already loaded → retryable, idempotent loads.", s06),
 ("Does COPY INTO reload an already-loaded file whose content changed?", "No — skipped even if modified (unless `COPY_OPTIONS ('force'='true')`).", s06),
 ("COPY INTO target must be…?", "A Delta table.", s06),
 ("What is PATTERN in COPY INTO?", "A glob filter on source file names, e.g. `'orders_*.csv'`.", s07),
 ("FILES limit per COPY INTO statement?", "Up to 1000 file names.", s07),
 ("What does VALIDATE do?", "Checks parsing, schema compatibility and constraints without writing (`VALIDATE ALL` / `VALIDATE n ROWS`).", s07),
 ("FORMAT_OPTIONS vs COPY_OPTIONS mergeSchema?", "FORMAT: merge source files' schemas. COPY: evolve the target Delta schema.", s07),
 ("COPY INTO vs Auto Loader by scale?", "Thousands of files → COPY INTO fine; millions+ → Auto Loader.", s08),
 ("What does `format(\"cloudFiles\")` mean?", "Use Auto Loader; the file format goes in `cloudFiles.format`.", s08),
 ("Why `readStream` for Auto Loader?", "It's built on Structured Streaming: new files processed incrementally in micro-batches.", s08),
 ("Two Auto Loader misconceptions?", "'It's a faster spark.read' and 'it turns files into Kafka' — both false.", s08),
 ("schemaLocation vs checkpointLocation?", "schemaLocation = shape (inferred schema + history, `_schemas`). checkpoint = progress/state.", s09),
 ("Why must checkpoints be persistent?", "They must survive compute restart/termination — never `/tmp`.", s09),
 ("Is schemaLocation needed with a full explicit schema?", "Not in the same way (no inference/evolution); the checkpoint still is.", s09),
 ("Checkpoint deleted → ?", "Stream loses progress; old files may be seen as new → duplicates or reconciliation.", s10),
 ("Can two streams share a checkpoint?", "No — one checkpoint per streaming query.", s10),
 ("Changed the source path — keep the checkpoint?", "No: checkpoint belongs to the query's source topology; new source → new checkpoint.", s10),
 ("Two file-discovery modes?", "Directory listing vs file notification / managed file events.", s11),
 ("Auto Loader default types for JSON/CSV/XML?", "STRING — unless `cloudFiles.inferColumnTypes=true`.", s11),
 ("Default sample for initial inference?", "Up to 50 GB or 1000 files, whichever first.", s11),
 ("What do schema hints do?", "`cloudFiles.schemaHints`: set types for specific columns while inferring the rest; for Parquet they're not a post-read cast.", s11),
 ("Default schemaEvolutionMode and what it does?", "addNewColumns (no schema given): stream stops on a new column, records it, continues after restart.", s12),
 ("What is `_rescued_data`?", "A column preserving values/fields that don't match the schema instead of losing them.", s12),
 ("Quarantine pattern?", "Rows with `_rescued_data IS NOT NULL` → quarantine table; clean rows → Silver.", s12),
 ("Explicit schema + new upstream column →?", "Ignored (mode none) unless rescuedDataColumn is set.", s12),
 ("Does exactly-once file ingestion prevent duplicate order_ids?", "No — distinct files can contain the same key; dedupe/MERGE in Silver.", s13),
 ("Why keep Bronze between Auto Loader and Silver?", "Source fidelity, replay, audit, schema drift, rescued data, debugging.", s13),
 ("What does AvailableNow do?", "`.trigger(availableNow=True)`: process all available files, then stop — batch-like incremental jobs.", s14),
 ("When COPY INTO?", "Moderate file counts, SQL-centric, simple, idempotent re-runs, selective reloads.", s14),
 ("New files but no rows — the 8-step chain?", "Exist → path → format → discovered → already processed → parse → schema → sink.", s15),
 ("Why immutable source files?", "Loaders track file identity; overwrites get skipped (lost corrections) or duplicated.", s15),
 ("Duplicate IDs — first question?", "Same file loaded twice, or two different files containing the ID?", s16),
 ("Parser options to check for malformed CSV?", "quote, escape, multiLine, delimiter, header (and mode).", s16),
]
for q, a, sec in F:
    C.card(q, a, sec)
