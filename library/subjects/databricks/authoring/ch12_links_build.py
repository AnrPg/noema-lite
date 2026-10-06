"""Build patches/ch12_links.json — additive 'Level-up →' callouts + new nuances (ids chNN-e8NN / chNN-d8N)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
REF = "see Chapter 12: Data Ingestion: Files, COPY INTO & Auto Loader"

def lvl(title, text, kind="key"):
    return {"t": "callout", "kind": kind, "title": "Level-up → " + title, "text": text + " (" + REF + ".)"}

def ex(eid, typ, section, q, explain, tags, diff=2, **kw):
    e = {"id": eid, "type": typ, "section": section, "difficulty": diff, "tags": tags, "quick": False, "q": q}
    e.update(kw)
    if explain is not None: e["explain"] = explain
    return e

P = []

# ---------------- ch02 ----------------
P.append({"chapter": "ch02", "section": "ch02-s04",
  "appendBlocks": [lvl("incremental file ingestion",
     "Chapter 12 shows why re-running `spark.read` over a folder duplicates data, how COPY INTO remembers loaded files, and how Auto Loader with `.trigger(availableNow=True)` gives a scheduled job that is batch-like *and* incremental.")],
  "appendExercises": [ex("ch02-e801", "tf", "ch02-s04",
     "A scheduled Auto Loader job using `.trigger(availableNow=True)` is an example of batch-like scheduling with incremental processing.",
     "AvailableNow processes all new files available at start, then stops — run hourly from a Job it behaves like batch, but the checkpoint makes each run touch only new files. Batch vs streaming describes timing; incremental describes how much work is redone.",
     ["concept", "exam"], answer=True)],
  "appendFlashcards": [{"q": "Plain spark.read over the whole folder every day — incremental?", "a": "No: it re-reads every file each run (duplicates on append). Use COPY INTO or Auto Loader for file-level incremental loads.", "section": "ch02-s04"}]})

P.append({"chapter": "ch02", "section": "ch02-s05",
  "appendBlocks": [lvl("checkpoints in Auto Loader",
     "Auto Loader has TWO state locations: `checkpointLocation` (progress — which files are done) and `cloudFiles.schemaLocation` (the inferred schema and its history). Chapter 12 adds the incident playbooks: checkpoint deleted, shared between streams, or kept after changing the source path.")],
  "appendExercises": [ex("ch02-e802", "mcq", "ch02-s05",
     "In an Auto Loader stream, which location remembers **which files have already been processed**?",
     "Progress lives in the streaming checkpoint (`checkpointLocation` on the write). `cloudFiles.schemaLocation` stores the inferred schema and its evolution — not progress. A `/tmp` path is ephemeral and would lose everything when compute terminates.",
     ["exam", "concept"], options=["checkpointLocation", "cloudFiles.schemaLocation", "The target table's _delta_log only", "/tmp on the driver"], answer=0,
     why=["Correct: progress/state.", "That's schema history, not progress.", "Auto Loader's file progress is in the checkpoint.", "Ephemeral — lost on termination."])],
  "appendFlashcards": [{"q": "checkpointLocation vs cloudFiles.schemaLocation?", "a": "Checkpoint = how far the stream got (processed files/state). schemaLocation = what shape the data has (schema + history).", "section": "ch02-s05"}]})

P.append({"chapter": "ch02", "section": "ch02-s09",
  "appendBlocks": [lvl("schema evolution at ingestion time",
     "Auto Loader makes the 'evolve vs enforce' decision concrete with `cloudFiles.schemaEvolutionMode` (addNewColumns / rescue / failOnNewColumns / none) and a `_rescued_data` column that keeps values that don't fit. Its default deliberately stops the stream on a new column, then continues with the new schema after restart.")],
  "appendExercises": [ex("ch02-e803", "tf", "ch02-s09",
     "With Auto Loader's default schema evolution (schema inferred, addNewColumns), a new column in a source file stops the stream; after a restart the column is part of the schema.",
     "Stopping is a deliberate control point: the new schema is recorded in schemaLocation, and a restart (e.g. via Job retries) continues with it. It's 'enforcement + an explicit evolution policy', not silent mutation.",
     ["concept", "exam"], answer=True)]})

P.append({"chapter": "ch02", "section": "ch02-s10",
  "appendBlocks": [lvl("a production Bronze table",
     "A robust Bronze row = source fields (often kept as STRING) + `_source_file` + `_ingested_at` + `_rescued_data`; rows with rescued content go to a quarantine table, and business-key dedup/MERGE happens in Silver.")],
  "appendExercises": [ex("ch02-e804", "mcq", "ch02-s10",
     "Auto Loader infers JSON/CSV columns as STRING by default. Why is that often a *good* fit for Bronze?",
     "Bronze should preserve the source. If tomorrow `amount` arrives as \"unknown\", a STRING column keeps it; a DOUBLE column would fail or push it to rescued data. Silver then validates and casts. The other options are false claims.",
     ["concept", "pitfall"], options=["It preserves odd values like \"unknown\" so Silver can validate and cast", "Delta cannot store DOUBLE in Bronze", "Strings make aggregations faster", "Unity Catalog forbids typed Bronze tables"], answer=0,
     why=["Correct.", "Delta stores all common types.", "Strings are usually slower for math.", "No such rule."])]})

# ---------------- ch03 ----------------
P.append({"chapter": "ch03", "section": "ch03-s11",
  "appendBlocks": [lvl("the 8-step 'new files, no rows' chain",
     "For file ingestion the source→Bronze boundary splits into eight checks: files exist → path matches → extension/format → discovered → checkpoint already processed → parsing → schema → sink. Chapter 12 turns it into a playbook with scenarios.", kind="tip")],
  "appendExercises": [ex("ch03-e801", "tf", "ch03-s11",
     "If the Auto Loader query progress shows the new files were read but 0 rows reached Bronze, the stream's load path is the most likely problem.",
     "If files were read, discovery (and therefore the path) worked. The break is later in the chain: parsing (format/extension mismatch, rescued or corrupt records), a schema-change stop, or the sink write.",
     ["debug"], answer=False)]})

P.append({"chapter": "ch03", "section": "ch03-s12",
  "appendBlocks": [lvl("file idempotency vs business-key idempotency",
     "Exactly-once file ingestion (Auto Loader/COPY INTO) never guarantees one row per order_id: two different files can carry the same key. First ask *same file twice or two different files?* — the answer tells you whether to fix ingestion state or Silver's MERGE.")],
  "appendExercises": [ex("ch03-e802", "scenario", "ch03-s12",
     "Silver shows order_id 100 twice. A colleague blames Auto Loader.",
     None, ["debug", "exam"],
     steps=[{"prompt": "The two Bronze rows have different `_source_file` values. What does that tell you?",
             "options": [{"text": "Auto Loader processed two distinct files once each; the duplicate comes from the source", "ok": True, "fb": "Right: file-level exactly-once ≠ business-key dedup."},
                         {"text": "Auto Loader ingested the same file twice", "ok": False, "fb": "Then `_source_file` would be identical."},
                         {"text": "The checkpoint was deleted", "ok": False, "fb": "A reset re-ingests the SAME files — same `_source_file`, new `_ingested_at`."}]},
            {"prompt": "Where do you fix it?",
             "options": [{"text": "Silver: dedupe by order_id and MERGE on the business key", "ok": True, "fb": "Business-key idempotency belongs downstream."},
                         {"text": "Delete one of the source files", "ok": False, "fb": "Never destroy source evidence."},
                         {"text": "Reset the Auto Loader checkpoint", "ok": False, "fb": "That creates real duplicates."}]}])]})

# ---------------- ch06 ----------------
P.append({"chapter": "ch06", "section": "ch06-s04",
  "appendBlocks": [lvl("idempotent file loads",
     "COPY INTO is idempotent per *file*: re-runs skip already-loaded files — even if a file's content was later changed. Only `COPY_OPTIONS ('force' = 'true')` reloads, and then you own the duplicates.")],
  "appendExercises": [ex("ch06-e801", "mcq", "ch06-s04",
     "Upstream overwrote an already-loaded `orders_0928.csv` with corrected amounts. What does the next normal COPY INTO run do with it?",
     "COPY INTO tracks loaded file identities; a modified file with an already-loaded identity is skipped. Corrections should arrive as new files; a deliberate reload needs FILES + force and a cleanup of the old rows.",
     ["pitfall", "exam"], options=["Skips it — it was already loaded", "Reloads it because the content changed", "Fails with a conflict error", "Replaces the old rows automatically"], answer=0,
     why=["Correct.", "Content changes don't trigger reloads.", "It succeeds silently.", "COPY INTO never deletes old rows."])]})

P.append({"chapter": "ch06", "section": "ch06-s07",
  "appendBlocks": [lvl("mergeSchema in COPY INTO",
     "COPY INTO has two different mergeSchema switches: `FORMAT_OPTIONS ('mergeSchema'='true')` merges the schemas of the source files, `COPY_OPTIONS ('mergeSchema'='true')` evolves the target Delta table.")],
  "appendExercises": [ex("ch06-e802", "cloze", "ch06-s07",
     "Complete COPY INTO so that new source columns are merged across files AND added to the target table.",
     "FORMAT_OPTIONS = how the source files are read (merge their schemas); COPY_OPTIONS = how the target is loaded (evolve its schema). With only one of them the new column may not reach the table.",
     ["syntax", "exam"], diff=2, asCode=True,
     text="COPY INTO ecommerce.bronze.orders_raw\nFROM '/path/'\nFILEFORMAT = CSV\n[[FORMAT_OPTIONS]] ('header' = 'true', 'mergeSchema' = 'true')\n[[COPY_OPTIONS]] ('mergeSchema' = 'true');",
     bank=["OPTIONS", "TBLPROPERTIES", "WITH SCHEMA EVOLUTION"])]})

# ---------------- ch10 ----------------
P.append({"chapter": "ch10", "section": "ch10-s08",
  "appendBlocks": [lvl("the full Phase 4",
     "Chapter 12 is the complete Phase 4: CSV options and modes, StructType/DDL schemas, `_metadata.file_path`, every COPY INTO clause (PATTERN, FILES, VALIDATE, transforms, two mergeSchemas), Auto Loader internals, 13 debugging playbooks and the Big Test.")],
  "appendExercises": [
    ex("ch10-e801", "spotbug", "ch10-s08",
       "The folder contains `orders_001.csv`, `orders_002.csv`, `customers_001.csv`. This COPY INTO loads nothing. Which line?",
       "COPY INTO's PATTERN is a **glob**, not a regex. `'orders_.*[.]csv'` would need a literal dot after `orders_`; `'orders_*.csv'` matches the order files.",
       ["pitfall", "syntax"], diff=3,
       lines=["COPY INTO ecommerce.bronze.orders_raw", "FROM '/Volumes/ecommerce/raw/incoming/'", "FILEFORMAT = CSV", "PATTERN = 'orders_.*[.]csv'", "FORMAT_OPTIONS ('header' = 'true');"],
       bugs=[3], fix="PATTERN = 'orders_*.csv'"),
    ex("ch10-e802", "tf", "ch10-s08",
       "Because Auto Loader ingests each file exactly once (with an intact checkpoint), the Bronze table cannot contain two rows with the same order_id.",
       "Exactly-once is about files. Two distinct files (an upstream retry or resend) can carry the same order_id, and both are correctly ingested once. Business-key dedup/MERGE belongs in Silver.",
       ["exam", "pitfall"], answer=False)],
  "appendFlashcards": [{"q": "Auto Loader's default sample for initial schema inference?", "a": "Up to 50 GB or 1000 files, whichever is reached first.", "section": "ch10-s08"}]})

P.append({"chapter": "ch10", "section": "ch10-s10",
  "appendBlocks": [lvl("read_files before Lakeflow",
     "`read_files(path, format => ..., schema => ...)` also works as a plain SQL reader for ad-hoc exploration; with `STREAM` inside a streaming table it runs Auto Loader, so checkpoints, string inference, schema evolution and `_rescued_data` all apply.", kind="tip")]})

out = {"patches": P}
os.makedirs(os.path.join(HERE, "patches"), exist_ok=True)
json.dump(out, open(os.path.join(HERE, "patches", "ch12_links.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote patches/ch12_links.json:", len(P), "patches,", sum(len(p.get("appendExercises", [])) for p in P), "exercises")
