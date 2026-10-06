# -*- coding: utf-8 -*-
"""Build patches/ch13_links.json — additive Level-up links + new streaming nuances for existing chapters.
Run: python3 build_ch13_patches.py"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
REF = "see Chapter 13: Structured Streaming"


def lvl(text, kind="key", title="Level-up → Structured Streaming"):
    return {"t": "callout", "kind": kind, "title": title, "text": text}


def ex(eid, typ, section, q, explain, tags, diff=2, **kw):
    e = {"id": eid, "type": typ, "section": section, "difficulty": diff, "tags": tags, "quick": False, "q": q}
    e.update(kw)
    e["explain"] = explain
    return e


patches = []
add = patches.append

# ---------------------------------------------------------------- ch02
add({"chapter": "ch02", "section": "ch02-s03",
     "appendBlocks": [lvl("Micro-batches now in depth: the unbounded-table model, lazy `readStream`, `processingTime` vs `availableNow` triggers, and what happens when a batch takes longer than its trigger (backlog, not parallel batches) — " + REF + ", sections 1–4.")],
     "appendExercises": [
         ex("ch02-e901", "tf", "ch02-s03",
            "If a micro-batch takes 12 s but the trigger is every 5 s, Spark runs the overdue micro-batches in parallel to keep up.",
            "No. In the normal micro-batch model batches run **sequentially**: the next starts after the current one finishes, so a processing backlog builds and latency grows. That's a signal that ingestion rate > processing capacity.",
            ["pitfall", "concept"], 2, answer=False)],
     "appendFlashcards": [{"q": "Trigger 5 s, micro-batch needs 12 s — what happens?", "a": "Batches stay sequential → backlog builds, latency grows (ingest > capacity).", "section": "ch02-s03"}]})
add({"chapter": "ch02", "section": "ch02-s04",
     "appendBlocks": [lvl("The streaming engine can itself run **batch + incremental**: `writeStream.trigger(availableNow=True)` on a schedule processes only what's new since the checkpoint, then stops — no hand-written `last_processed_timestamp`. " + REF + ", section 4.", kind="tip")],
     "appendExercises": [
         ex("ch02-e902", "mcq", "ch02-s04",
            "An hourly job uses `readStream` + `writeStream.trigger(availableNow=True)` with a checkpoint. How do you classify it?",
            "It runs on a schedule and stops (batch-like execution) but touches only new input thanks to the checkpoint (incremental). AvailableNow = scheduled incremental processing with streaming semantics, not an always-on stream.",
            ["exam", "concept"], 2,
            options=["Always-on streaming, full recompute", "Scheduled (batch-like) + incremental, using the streaming engine", "Batch + full recompute", "Real-time mode"],
            answer=1)]})
add({"chapter": "ch02", "section": "ch02-s05",
     "appendBlocks": [lvl("Open the box: a checkpoint holds **offsets/** (what each micro-batch reads), **commits/** (what reached the sink), **state/** (stateful operators) and **metadata** (query identity) — not just 'the last offset'. Why new code can make it incompatible, and why deleting it means a brand-new query: " + REF + ", section 9.")],
     "appendExercises": [
         ex("ch02-e903", "mcq", "ch02-s05",
            "Certification trap: what does a Structured Streaming checkpoint store?",
            "Offsets/progress, commit information, query metadata and — for stateful queries — state. 'Just the last timestamp' is the classic wrong answer; that's why deleting it loses progress **and** state and turns the next run into a new query.",
            ["exam"], 2,
            options=["Only the last processed timestamp", "Offsets, commits, query metadata and state (where applicable)", "A full copy of the sink table", "The notebook code"],
            answer=1)],
     "appendFlashcards": [{"q": "Checkpoint folders?", "a": "offsets/, commits/, state/ (stateful), metadata — the query's identity and memory.", "section": "ch02-s05"}]})
add({"chapter": "ch02", "section": "ch02-s06",
     "appendBlocks": [lvl("Streaming FROM a Delta table is append-oriented: if the source gets UPDATE/DELETE/MERGE, read its **Change Data Feed** (`readChangeFeed`) to propagate row-level changes, or deliberately skip them (`skipChangeCommits`). " + REF + ", section 12.", kind="tip")],
     "appendExercises": [
         ex("ch02-e904", "mcq", "ch02-s06",
            "A Silver Delta table receives MERGE updates. A downstream stream must see those row-level changes. What should it read?",
            "A plain `readStream.table(...)` on Delta is append-oriented and fails (or, with skipChangeCommits, ignores) commits that change existing rows. The Change Data Feed exposes inserts/updates/deletes as a stream.",
            ["concept", "pitfall"], 2,
            options=['spark.readStream.table("silver.customers")', 'spark.readStream.option("readChangeFeed", "true").table("silver.customers")',
                     'spark.readStream.option("skipChangeCommits", "true").table("silver.customers")', 'spark.read.table("silver.customers")'],
            answer=1)]})

# ---------------------------------------------------------------- ch03
add({"chapter": "ch03", "section": "ch03-s11",
     "appendBlocks": [lvl("For streams, 'no new data' has a 9-point checklist: query active? source producing? new offsets? checkpoint corrupted? sink blocked? state batch stuck? executor failure? permission expired? source retention violated? — and **don't restart blindly**. " + REF + ", section 15 (playbook 'Stream stopped making progress').", kind="tip")],
     "appendExercises": [
         ex("ch03-e901", "tf", "ch03-s11",
            "When a streaming query stops making progress, the safest first move is to restart it with a fresh checkpoint location.",
            "No. First inspect `query.status`/`lastProgress` and walk the checklist. A new checkpoint makes the query brand new → reprocessing and duplicates, and a restart can destroy the evidence.",
            ["debug", "pitfall"], 2, answer=False)]})
add({"chapter": "ch03", "section": "ch03-s12",
     "appendBlocks": [lvl("Exactly-once has edges: Delta sinks are exactly-once, but a **non-idempotent foreachBatch** (emails, `balance += x`) replays on retry, and **source duplicates** pass straight through (processing guarantee ≠ business dedup). Bounded streaming dedup: `withWatermark(...).dropDuplicates([\"event_id\", \"event_time\"])`. " + REF + ", sections 10 & 13.")],
     "appendExercises": [
         ex("ch03-e902", "mcq", "ch03-s12",
            "A streaming job writes to Delta (exactly-once sink) AND posts each order to a CRM inside foreachBatch. After a crash, the CRM shows order 123 twice; Delta doesn't. Most likely cause?",
            "The retried micro-batch re-invoked foreachBatch, and the CRM call isn't covered by Delta/checkpoint transactions. Exactly-once stops at non-transactional edges — make the side effect idempotent (business key/version).",
            ["debug", "exam"], 2,
            options=["Delta's exactly-once guarantee failed", "The retried batch re-ran a non-idempotent external side effect", "The watermark was too short", "Complete output mode"],
            answer=1)]})

# ---------------------------------------------------------------- ch04
add({"chapter": "ch04", "section": "ch04-s09",
     "appendBlocks": [lvl("Lazy evaluation applies to streams too: `spark.readStream...load()` only builds a plan; the query starts at `writeStream ... toTable()/start()`. " + REF + ", section 2.", kind="tip")],
     "appendExercises": [
         ex("ch04-e901", "tf", "ch04-s09",
            "`events = spark.readStream.format(\"json\").schema(s).load(path)` immediately starts reading files.",
            "No — like any transformation it defines a (streaming) plan. Execution begins when a streaming sink is started with `writeStream ... toTable()` or `.start()`.",
            ["exam"], 1, answer=False)]})

# ---------------------------------------------------------------- ch05
add({"chapter": "ch05", "section": "ch05-s07",
     "appendBlocks": [lvl("VACUUM vs **streaming readers**: a stream reading this table that stays stopped longer than retention may find its needed files vacuumed and fail with a missing-file error. Never 'fix' it with `spark.sql.files.ignoreMissingFiles=true` (silent wrong results) — increase retention or rebuild the stream. " + REF + ", section 12.", kind="key", title="Level-up → VACUUM breaks stopped streams")],
     "appendExercises": [
         ex("ch05-e901", "scenario", "ch05-s07",
            "A stream reading `ecommerce.bronze.events` (VACUUM retention 7 days, VACUUM runs daily) was stopped for 2 weeks. On restart it fails: files for a version the checkpoint needs are missing.",
            "Streams must run at least once within the source retention window. Design retention and stream operations together.",
            ["debug", "pitfall"], 2,
            steps=[{"prompt": "What happened?", "options": [
                       {"text": "VACUUM removed files the stopped stream still needed", "ok": True, "fb": "Right — the checkpoint points at version X, whose files are gone."},
                       {"text": "The checkpoint expired after 7 days", "ok": False, "fb": "Checkpoints don't expire; the source files did."},
                       {"text": "The watermark deleted old rows", "ok": False, "fb": "Watermarks never delete table data."}]},
                   {"prompt": "Best response?", "options": [
                       {"text": "Recover/rebuild the stream and increase retention for the future", "ok": True, "fb": "Correct — fix properly, then prevent."},
                       {"text": "Set spark.sql.files.ignoreMissingFiles=true", "ok": False, "fb": "Databricks warns it can silently produce incorrect results."},
                       {"text": "Run VACUUM RETAIN 0 HOURS to clean up", "ok": False, "fb": "Makes things worse."}]}])],
     "appendPitfalls": [{"title": "VACUUM vs stopped streams", "text": "A stream stopped longer than the source retention can't catch up once its files are vacuumed.", "fix": "Run streams at least once per retention window; increase retention; never use ignoreMissingFiles as a workaround."}]})
add({"chapter": "ch05", "section": "ch05-s09",
     "appendBlocks": [lvl("MERGE in a stream: `writeStream.foreachBatch(upsert)` where `upsert(batch_df, batch_id)` runs `DeltaTable.forName(...).merge(...).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()` — the classic streaming upsert, and the way to get update-like results into Delta (the Delta sink has no update mode). Keep it idempotent: a retried batch may run twice. " + REF + ", section 13.")],
     "appendExercises": [
         ex("ch05-e902", "cloze", "ch05-s09",
            "Complete the streaming upsert.",
            "foreachBatch hands each micro-batch to a function as a batch DataFrame, so batch-only MERGE becomes possible; MERGE by key keeps a replayed batch idempotent.",
            ["syntax"], 2,
            text='def upsert(batch_df, batch_id):\n    (DeltaTable.forName(spark, "ecommerce.silver.customers").alias("t")\n        .[[merge]](batch_df.alias("s"), "t.customer_id = s.customer_id")\n        .whenMatchedUpdateAll()\n        .whenNotMatchedInsertAll()\n        .execute())\n\nchanges.writeStream.[[foreachBatch]](upsert).option("[[checkpointLocation]]", ckpt).start()',
            asCode=True)]})

# ---------------------------------------------------------------- ch06
add({"chapter": "ch06", "section": "ch06-s10",
     "appendBlocks": [lvl("Streaming is a small-file factory: every tiny micro-batch commits small files (1–3 MB each). OPTIMIZE / predictive optimization can compact later, but pick a sensible trigger latency. " + REF + ", section 14.", kind="tip")],
     "appendExercises": [
         ex("ch06-e901", "mcq", "ch06-s10",
            "A stream writes to Delta with `trigger(processingTime=\"1 second\")` although the dashboard refreshes every 15 minutes. DESCRIBE DETAIL shows 400,000 files of ~1 MB. Best first change?",
            "Tiny micro-batches mean more scheduling overhead, more commits, more storage API calls and smaller files. Matching the trigger to the real latency need (or AvailableNow on a schedule) attacks the cause; OPTIMIZE then cleans up the existing layout.",
            ["pitfall", "debug"], 2,
            options=["Add more workers", "Lengthen the trigger to match the real latency need, then OPTIMIZE", "Run VACUUM RETAIN 0 HOURS", "Switch to complete output mode"],
            answer=1)]})

# ---------------------------------------------------------------- ch09
add({"chapter": "ch09", "section": "ch09-s14",
     "appendBlocks": [lvl("Every micro-batch is a Spark job, so skew/spill/shuffle diagnosis applies unchanged — plus a deadline: the batch must finish before the next trigger. Streaming adds **state** (growth, watermark, state store) and **source/sink** (throughput, API latency, storage) branches to the debugging tree; compare `inputRowsPerSecond` vs `processedRowsPerSecond` before CPU. " + REF + ", sections 14–15.")],
     "appendExercises": [
         ex("ch09-e901", "calc", "ch09-s14",
            "A streaming micro-batch has 100 partitions: 99 finish in 2 s, one skewed partition takes 30 s. The trigger is 5 s. What is the minimum duration of each micro-batch in seconds?",
            "The stage ends with its slowest task → ≥ 30 s, six times the trigger, so backlog grows every batch. Adding workers doesn't split one partition; fix the skew/key design.",
            ["calc", "debug"], 2, answer=30, tolerance=0, unit="seconds")],
     "appendFlashcards": [{"q": "Streaming-specific branches of the debugging tree?", "a": "State (growth, watermark, state store) and Source/Sink (throughput, API latency, storage) — on top of Spark shuffle/skew/spill/join.", "section": "ch09-s14"}]})

# ---------------------------------------------------------------- ch10
add({"chapter": "ch10", "section": "ch10-s09",
     "appendBlocks": [lvl("Phase 5 is now a full chapter: triggers incl. AvailableNow and serverless rules, stateless vs stateful, event time and windows, watermarks, output modes (Delta sink: append + complete only), checkpoint internals, exactly-once boundaries, joins, foreachBatch + MERGE, 11 debugging playbooks and the Phase 5 mini-project — " + REF + "."),
                      lvl("Two corrections to remember for the preview above: the **update** output mode is not supported by the Delta sink (use foreachBatch + MERGE), and a `processingTime` trigger is not supported on serverless notebooks/jobs (use AvailableNow, or a Lakeflow pipeline in continuous mode for always-on).", kind="warn", title="Nuance → Delta sink & serverless triggers")],
     "appendExercises": [
         ex("ch10-e901", "tf", "ch10-s09",
            "The Delta streaming sink supports all three output modes: append, update and complete.",
            "No — append and complete only. Update-like semantics into Delta are built with foreachBatch + MERGE.",
            ["exam", "pitfall"], 2, answer=False),
         ex("ch10-e902", "mcq", "ch10-s09",
            "The preview's code uses `.trigger(processingTime=\"30 seconds\")`. You run it as a serverless job. What happens / what should you use?",
            "Serverless notebooks/jobs support AvailableNow (and deprecated Once), not time-based ProcessingTime or real-time triggers. Schedule an AvailableNow job, or use a Lakeflow pipeline in continuous mode for an always-on stream.",
            ["exam"], 2,
            options=["Works the same as on classic", "Not supported on serverless — use availableNow on a schedule, or Lakeflow continuous mode for always-on",
                     "Serverless silently converts it to real-time mode", "It runs once and fails"],
            answer=1)]})
add({"chapter": "ch10", "section": "ch10-s10",
     "appendBlocks": [lvl("Why Phase 6 follows Phase 5: always-running serverless streams are best built as **Lakeflow pipelines in continuous mode**, and recomputation when dimensions change fits declarative/materialized patterns better than a long-running stream-static join. " + REF + ", sections 4 & 11.", kind="tip")],
     "appendExercises": [
         ex("ch10-e903", "tf", "ch10-s10",
            "In a long-running stream-static join, updating the dimension table automatically recomputes all previously written enriched rows.",
            "No. New micro-batches may join against the newer dimension, but already-written outputs are not recomputed. If correctness requires recomputation, materialized/declarative pipeline patterns (Phase 6) are often a better fit.",
            ["pitfall"], 2, answer=False)]})

out = os.path.join(HERE, "patches", "ch13_links.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({"patches": patches}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote", out, len(patches), "patches")
