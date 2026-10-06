# ch12 part 2: s06-s08

# =====================================================================
s06 = C.sec(6, "The Re-read Problem → COPY INTO Idempotency",
            "spark.read has no memory: run it twice and you load everything twice. COPY INTO remembers files.")
S("§19", "§88", "Q3")
C.p("Day 1: folder `orders/` has `file1.json`, `file2.json`. You run `spark.read.json(path)` and append to Bronze. Day 2 a `file3.json` lands. You run the same code. **What does it read?**")
C.diagram("""
 Day 1 run           Day 2 run
 orders/             orders/
 ├── file1  ✔        ├── file1  ✔  (again!)
 └── file2  ✔        ├── file2  ✔  (again!)
                     └── file3  ✔
""", "spark.read reads the whole current folder every time")
C.p("**All three files** — not just `file3`. Appended to Bronze, file1 and file2 are now **duplicated**. That's the core problem of incremental ingestion.")
C.code("python", '(\n    df.write\n      .mode("append")\n      .saveAsTable("ecommerce.bronze.orders_raw")\n)\n# run twice over the same files  →  duplicate rows', "Lab: plain batch load — run it twice on purpose")
C.callout("key", "No file-history memory",
          "Plain `spark.read` keeps **no record** of which files it has seen. Re-reading the same source file and appending = duplicates. The duplication is the intended lesson of the lab.")
S("§20")
C.p("**Naive fix**: restrict the path by date, e.g. `path = \"/orders/2026-09-28/*.json\"`. It works only if the **upstream storage layout is perfectly reliable**.")
C.ul(["**Late files** — yesterday's file lands after today's run started",
      "**Backfills** — upstream re-delivers last month",
      "**Re-uploads** — same day folder gets a corrected file",
      "**Timezone bugs** — '2026-09-28' in UTC vs local time",
      "**Renamed files** — naming convention changes",
      "**Missing expected folders** — the job fails or silently loads nothing"])
trap("pitfall", "Date-folder filtering is fragile incremental logic",
     "Filtering by filename/date assumes a perfect upstream layout. Late files, backfills, re-uploads, timezone bugs, renames and missing folders all cause skipped or duplicated data.",
     "Use a tool that tracks processed files: COPY INTO or Auto Loader.")
S("§21", "§22", "Q4", "§96")
C.p("**`COPY INTO`** is the first Databricks ingestion primitive with memory. It loads files into a **Delta table** and is **retryable and idempotent**: files already loaded are **skipped** on later runs.")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders/'\nFILEFORMAT = JSON;")
C.diagram("""
 Run 1: file1, file2 present  → load file1, load file2
 Run 2: nothing new           → skip file1, skip file2
 file3.json lands
 Run 3:                       → skip file1, skip file2, load file3
""", "Idempotent = safe to re-run")
C.p("Compare that with naive *read the entire folder every run*: re-running COPY INTO after a failure or by accident doesn't duplicate anything.")
S("§23", "Q5")
trap("warn", "A changed file is still 'already loaded'",
     "Databricks: if a file was already loaded, COPY INTO **skips it on later runs even if the file's contents have changed**. Same tracked file identity ≠ 'reload because content changed'.",
     "Deliver corrections as NEW files (immutable delivery). To deliberately reload, use `COPY_OPTIONS ('force' = 'true')` and handle duplicates.")
C.p("**`force`** (added for clarity): `COPY_OPTIONS ('force' = 'true')` disables the idempotency check and loads the files again *regardless* of history — useful for a deliberate reload, dangerous by accident (duplicates).")
S("§24")
C.p("The **target must be a Delta table**. You can create it with a schema first:")
C.code("sql", "CREATE TABLE IF NOT EXISTS ecommerce.bronze.orders_raw (\n  order_id    BIGINT,\n  customer_id BIGINT,\n  amount      DOUBLE,\n  status      STRING\n);\n\nCOPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders/'\nFILEFORMAT = JSON;")
S("§25", "§89")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders_csv/'\nFILEFORMAT = CSV\nFORMAT_OPTIONS (\n  'header'    = 'true',\n  'delimiter' = ','\n);",
       "CSV COPY INTO: parser options go in FORMAT_OPTIONS")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders_csv/'\nFILEFORMAT = CSV\nFORMAT_OPTIONS ('header' = 'true', 'inferSchema' = 'true');\n-- run it twice: the 2nd run skips the already-loaded files",
       "Lab: clear/rebuild the table, then run COPY INTO twice")
C.reveal("Think first: you re-run the exact same COPY INTO 5 minutes later and no new files arrived. How many rows are added?",
         "**Zero.** Every file is already in COPY INTO's load history, so all are skipped. The statement still succeeds — that's what idempotent means.")
C.ask("Ask yourself before re-running a load", [
    "Does this tool remember which files it loaded (COPY INTO / Auto Loader) or not (spark.read)?",
    "If a file was corrected upstream, did it arrive as a NEW file or overwrite the old one?",
    "Am I about to use `force` — and what will dedupe the duplicates it creates?",
    "Is my target a Delta table?"])

S("§19", "§88", "Q3")
C.calc("Two files (1,000 rows each) sit in `orders/`. You run `spark.read.json(path)` + `.mode(\"append\")` into Bronze **three times** with no new files. How many rows does Bronze hold?",
       6000, "Each run re-reads both files (2,000 rows) and appends: 3 × 2,000 = 6,000 rows, 4,000 of them duplicates. spark.read has no memory of earlier runs.",
       unit="rows", tags=("calc", "pitfall"), diff=1, quick=True)
S("§21", "§22", "Q4", "§96", "§89")
C.calc("Same folder, but with COPY INTO: run 1 (file1, file2 present), run 2 (nothing new), then file3 (1,000 rows) lands and run 3 executes. Total rows in Bronze?",
       3000, "Run 1 loads 2,000; run 2 skips both files; run 3 skips file1/file2 and loads file3 → 3,000 rows, no duplicates. COPY INTO tracks loaded files.",
       unit="rows", tags=("calc",), diff=1, quick=True)
C.tf("Re-running the same `COPY INTO` against the same source directory loads the already-loaded files a second time.", False,
     "Already-loaded files are **skipped by default** — that's COPY INTO's idempotency and a classic exam trap. Only `COPY_OPTIONS ('force'='true')` disables it.",
     tags=("exam",), diff=1, quick=True)
C.mcq("What does COPY INTO remember between runs?",
      ["Which source files it has already loaded into the target", "The last value of every business key",
       "The full content hash of every row", "Only the timestamp of the last run"], 0,
      "COPY INTO keeps per-file load history for the target table, which makes it retryable and idempotent at the **file** level. It does not know about business keys or row hashes.",
      tags=("concept", "exam"), diff=1,
      why=["Correct (Big-Test Q4).", "No business-key tracking.", "It tracks files, not row hashes.", "A timestamp alone couldn't skip late/old files reliably."])
S("§23", "Q5")
C.tf("If `file1.json` was loaded yesterday and upstream overwrote it today with corrected content, a normal COPY INTO run will load the new content.", False,
     "Already-loaded files are skipped **even if modified**. The correction is silently ignored — which is exactly why sources should deliver new, immutable files.",
     tags=("pitfall", "exam"), diff=2)
C.mcq("You *deliberately* need COPY INTO to reload files it already loaded. Which clause?",
      ["COPY_OPTIONS ('force' = 'true')", "FORMAT_OPTIONS ('mergeSchema' = 'true')", "VALIDATE ALL", "PATTERN = '*'"], 0,
      "`force` disables the idempotency check. mergeSchema is about schemas, VALIDATE doesn't write at all, and PATTERN only filters names — already-loaded matches are still skipped.",
      tags=("syntax", "pitfall"), diff=2,
      why=["Correct — and expect duplicates unless you clean up.", "Schema merging, not reloading.", "Validation writes nothing.", "Filtering doesn't bypass load history."])
S("§20")
C.bucket("Problems of 'filter the path by today's date' incremental logic?",
         ["Real risk of the naive approach", "Not a problem it has"],
         [("A late file for yesterday lands after today's run", 0), ("Upstream backfills last month", 0),
          ("A corrected file is re-uploaded into the same day folder", 0), ("UTC vs local-time folder names", 0),
          ("The expected folder doesn't exist today", 0), ("Spark can't read JSON from a dated folder", 1),
          ("Delta can't append to a table twice a day", 1)],
        "All the real risks come from assuming a perfect upstream layout. Spark and Delta are fine with dated folders — the logic of 'which files are new' is what's fragile.",
        tags=("pitfall",), diff=2)
S("§21", "§24", "§25")
C.write("Write COPY INTO that loads CSV files with a header line from `/Volumes/ecommerce/raw/orders_csv/` into `ecommerce.bronze.orders_raw`.",
        "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders_csv/'\nFILEFORMAT = CSV\nFORMAT_OPTIONS (\n  'header' = 'true'\n);",
        ["copy into ecommerce.bronze.orders_raw", "from '/volumes/ecommerce/raw/orders_csv/'", "fileformat = csv", "format_options", "'header' = 'true'"],
        "COPY INTO = target, FROM source path, FILEFORMAT, then parser options in FORMAT_OPTIONS. The target must be Delta.",
        lang="sql", tags=("syntax",), diff=2)
C.cloze("Complete the COPY INTO statement.",
        "[[COPY INTO]] ecommerce.bronze.orders_raw\n[[FROM]] '/Volumes/ecommerce/raw/orders/'\n[[FILEFORMAT]] = JSON;",
        "The three mandatory pieces: `COPY INTO <delta table>`, `FROM <path or SELECT>`, `FILEFORMAT = <format>`.",
        bank=["INSERT INTO", "FORMAT", "LOCATION"], as_code=True, tags=("syntax",), diff=1)
C.spotbug("This COPY INTO fails. Which lines are wrong?",
          ["COPY INTO ecommerce.bronze.orders_raw", "FROM '/Volumes/ecommerce/raw/orders_csv/'", "FORMAT = CSV",
           "OPTIONS (", "  'header' = 'true'", ");"],
          [2, 3], "FILEFORMAT = CSV\nFORMAT_OPTIONS (\n  'header' = 'true'\n);",
          "The keywords are `FILEFORMAT` (not FORMAT) and `FORMAT_OPTIONS` for parser options (not OPTIONS). `COPY_OPTIONS` is a separate clause for load behavior like mergeSchema or force.",
          tags=("syntax", "debug"), diff=2)
C.tf("COPY INTO can write into any table format, e.g. a CSV-backed external table.", False,
     "The COPY INTO target must be a **Delta table**. The idempotent load history lives with that Delta target.",
     tags=("exam",), diff=1)
C.free("Big-Test Q3: what happens if you run `spark.read` over the same whole directory every day — and how would you fix it?",
       "It re-reads the directory's current contents every day — all old files plus the new ones — because spark.read keeps no file history. Appending that to Bronze duplicates everything already loaded. Fixes: manually restrict the input (fragile: late files, backfills, re-uploads), or use a tool that tracks processed files: COPY INTO (idempotent, skips loaded files) or Auto Loader (checkpointed incremental discovery).",
       ["Reads all current files again", "No file-history memory", "Append → duplicates",
        "Manual path filtering is fragile", "COPY INTO / Auto Loader track processed files"],
       "The question tests whether you see that 'batch read' and 'incremental' are different properties.",
       tags=("exam", "interview"), diff=2)

playbook(2, "Bronze doubled after re-running a plain batch load", s06,
         "Row count in `ecommerce.bronze.orders_raw` jumped to exactly 2× (or 3×) after someone re-ran the ingestion notebook. Same order_ids appear several times, with different `_ingested_at`.",
         ["Was this load a plain `spark.read` + `mode(\"append\")` with no file tracking?",
          "Did the run read files that a previous run already loaded (same `_source_file` twice)?",
          "Was the job retried or re-run manually?",
          "Can I delete the duplicate load cleanly (by `_ingested_at` / Delta version)?",
          "Should this load be COPY INTO or Auto Loader instead?"],
         [("Count rows per source file and ingestion time.", "Same file with 2+ ingestion times = re-read duplicates.",
           "SELECT _source_file, _ingested_at, count(*)\nFROM ecommerce.bronze.orders_raw\nGROUP BY ALL ORDER BY _source_file;"),
          ("Check DESCRIBE HISTORY for the extra WRITE/append versions.", "Shows which runs appended.", "DESCRIBE HISTORY ecommerce.bronze.orders_raw;"),
          ("Remove the duplicate load (RESTORE to the version before, or DELETE by `_ingested_at`).", "Return to a correct state."),
          ("Replace the loader with COPY INTO or Auto Loader.", "Tracks loaded files so re-runs are safe.")],
         ["spark.read has no file-history memory", "Manual or automatic re-run of an append job", "No idempotent loader"],
         "Clean up the duplicate append, then switch to an idempotent file loader (COPY INTO / Auto Loader).",
         mnemonic="READ-AGAIN = APPEND-AGAIN")
C.scenario("A teammate re-ran the Bronze notebook (`spark.read.json(path)` → `.mode(\"append\")`) after a timeout. Now `orders_raw` has every order twice.",
           [("What is your first hypothesis to verify?",
             [("The re-run re-read files that were already loaded", True, "Yes: plain spark.read reads the whole folder every time."),
              ("Auto Loader's checkpoint was deleted", False, "There's no Auto Loader here — it's a plain batch read."),
              ("Delta wrote each row twice internally", False, "Delta writes exactly what the DataFrame contains.")]),
            ("How do you prove it?",
             [("Group by `_source_file` and `_ingested_at`: each file appears with two ingestion times", True, "That's the fingerprint of a re-read."),
              ("Run OPTIMIZE and recount", False, "OPTIMIZE compacts files; it doesn't change row counts."),
              ("Check cluster logs for OOM", False, "Memory has nothing to do with duplication here.")]),
            ("Durable fix?",
             [("Switch to COPY INTO (or Auto Loader) and clean up the duplicate append", True, "Idempotent loading makes the next retry harmless."),
              ("Tell everyone never to re-run notebooks", False, "Retries are normal; the loader must be safe to re-run."),
              ("Add `.distinct()` before the write", False, "Distinct within one run doesn't stop duplicates across runs.")])],
           tags=("debug",), diff=1)
C.order("Order the playbook for 'Bronze doubled after a re-run'.",
        ["Confirm the loader is plain spark.read + append", "Group rows by `_source_file` and `_ingested_at`",
         "Find the extra append in DESCRIBE HISTORY", "Remove the duplicate load (RESTORE or DELETE)",
         "Replace the loader with COPY INTO / Auto Loader"],
        "Mechanism → evidence → history → repair → prevention. Fixing data without changing the loader guarantees the next retry repeats the incident.",
        tags=("debug",), diff=2)

# =====================================================================
s07 = C.sec(7, "COPY INTO Options: PATTERN, FILES, VALIDATE, Transforms & Schema",
            "COPY INTO isn't a byte copy: it filters, validates, casts and can evolve the target schema.")
S("§26", "Q6")
C.p("**PATTERN** filters which source files are loaded. Folder `incoming/` holds `orders_001.csv`, `orders_002.csv`, `customers_001.csv` — you want only orders:")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/incoming/'\nFILEFORMAT = CSV\nPATTERN = 'orders_*.csv'\nFORMAT_OPTIONS ('header' = 'true');")
trap("warn", "PATTERN is a glob, not a regex",
     "COPY INTO's PATTERN is a **glob pattern** (`*`, `?`, `[a-z]`, `{a,b}`). The tutoring notes wrote a regex-style `'orders_.*[.]csv'` — as a glob that means 'orders_.' + anything + '.csv' and would NOT match `orders_001.csv`.",
     "Write globs: `PATTERN = 'orders_*.csv'`. Test with VALIDATE or a small run.")
S("§27")
C.p("**FILES** loads an explicit list of file names (relative to the FROM path) — up to **1000 files per statement**. FILES and PATTERN can't be combined in one statement.")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders/'\nFILEFORMAT = JSON\nFILES = ('file1.json', 'file2.json');")
S("§28", "§90", "Q7")
C.p("**VALIDATE** checks the files **without writing data**: do they parse, is the schema compatible (or evolvable), do nullability and CHECK constraints hold?")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders_csv/'\nFILEFORMAT = CSV\nFORMAT_OPTIONS ('header' = 'true')\nVALIDATE ALL;      -- or: VALIDATE 15 ROWS",
       "Lab: validate first, inspect the result, then load")
C.callout("tip", "A pre-production / debugging tool",
          "Run `VALIDATE ALL` against a new feed or a suspicious batch before the real load. Nothing is committed, so it's safe on production targets.")
S("§29")
C.p("COPY INTO can **transform** while loading — the FROM can be a SELECT over the files: projection, casts, functions, even metadata.")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM (\n  SELECT\n    order_id::BIGINT,\n    customer_id::BIGINT,\n    amount::DOUBLE,\n    upper(status)        AS status,\n    _metadata.file_path  AS _source_file\n  FROM '/Volumes/ecommerce/raw/orders/'\n)\nFILEFORMAT = JSON;")
C.callout("key", "Not a byte copy", "COPY INTO parses files and can project, cast and compute columns. The target still gets typed Delta rows.")
S("§30", "Q25")
C.code("sql", "COPY INTO ecommerce.bronze.orders_raw\nFROM '/path/'\nFILEFORMAT = CSV\nFORMAT_OPTIONS ('inferSchema' = 'true', 'mergeSchema' = 'true')\nCOPY_OPTIONS ('mergeSchema' = 'true');",
       "Inference + schema evolution in COPY INTO")
C.table(["Where", "mergeSchema means…"],
        [["FORMAT_OPTIONS ('mergeSchema'='true')", "Merge the schemas of the **source files** (file A has col x, file B has col y → read both)"],
         ["COPY_OPTIONS ('mergeSchema'='true')", "**Evolve the target Delta table's** schema to accept new columns"]])
trap("exam", "Two different mergeSchema options",
     "`FORMAT_OPTIONS mergeSchema` reconciles schemas across source files; `COPY_OPTIONS mergeSchema` evolves the target Delta schema. Setting only one may not give you new columns in the table.",
     "Remember: FORMAT = files being read, COPY = target being written.")
C.p("Nice trick (added for clarity): you can create a **schemaless placeholder** Delta table with `CREATE TABLE IF NOT EXISTS ecommerce.bronze.orders_raw;` and let COPY INTO with `mergeSchema` set the schema on first load.")
C.reveal("Think first: you use FILES with 2,500 file names. What happens?",
         "One statement accepts at most **1000** file names, so you split into **3 statements** (1000 + 1000 + 500) — or use a PATTERN / let idempotency pick new files instead.")

S("§26", "Q6")
C.mcq("What does `PATTERN` do in COPY INTO?",
      ["Filters which source files are loaded, by a glob on their names", "Validates each row against a regex",
       "Renames the loaded files", "Sets the CSV delimiter"], 0,
      "PATTERN is a source-file **filter** (Big-Test Q6). It's a glob on file names/paths — not row validation, not renaming, not a parser option.",
      tags=("concept",), diff=1, quick=True,
      why=["Correct.", "Rows aren't regex-validated by PATTERN.", "COPY INTO never renames files.", "Delimiter lives in FORMAT_OPTIONS."])
C.spotbug("The folder holds `orders_001.csv`, `orders_002.csv`, `customers_001.csv`. This loads **nothing**. Which line is the bug?",
          ["COPY INTO ecommerce.bronze.orders_raw", "FROM '/Volumes/ecommerce/raw/incoming/'", "FILEFORMAT = CSV",
           "PATTERN = 'orders_.*[.]csv'", "FORMAT_OPTIONS ('header' = 'true');"],
          [3], "PATTERN = 'orders_*.csv'",
          "PATTERN is a **glob**. `'orders_.*[.]csv'` as a glob needs a literal dot right after `orders_`, so `orders_001.csv` doesn't match. The glob `'orders_*.csv'` does. (This is a correction of the tutoring notes' regex-style example.)",
          tags=("debug", "pitfall"), diff=3)
S("§27")
C.calc("You must load an explicit list of 2,500 file names with the FILES clause. What is the minimum number of COPY INTO statements?",
       3, "FILES accepts at most 1000 names per statement: ceil(2500 / 1000) = 3 statements (1000 + 1000 + 500).",
       unit="statements", tags=("calc", "exam"), diff=1, quick=True)
C.tf("You can use FILES and PATTERN together in the same COPY INTO statement.", False,
     "They're two alternative ways of choosing files: an explicit list *or* a glob. Pick one per statement.",
     tags=("syntax",), diff=2)
S("§28", "§90", "Q7")
C.mcq("What does `VALIDATE ALL` do in COPY INTO?",
      ["Checks parsing, schema compatibility and constraints for all data without writing anything",
       "Loads the data and then runs CHECK constraints",
       "Deletes rows that fail validation from the target",
       "Re-validates files that were already loaded"], 0,
      "VALIDATE is a dry run (Big-Test Q7): parse/schema/nullability/CHECK constraints are tested, **nothing is written**. The other options all imply a write or a delete.",
      tags=("concept", "exam"), diff=1, quick=True,
      why=["Correct.", "VALIDATE never writes.", "It never deletes.", "It's about the files in this statement, not history."])
C.write("Write a COPY INTO that only **validates** (no load) CSV files with a header in `/Volumes/ecommerce/raw/orders_csv/` against `ecommerce.bronze.orders_raw`.",
        "COPY INTO ecommerce.bronze.orders_raw\nFROM '/Volumes/ecommerce/raw/orders_csv/'\nFILEFORMAT = CSV\nFORMAT_OPTIONS ('header' = 'true')\nVALIDATE ALL;",
        ["copy into ecommerce.bronze.orders_raw", "fileformat = csv", "'header' = 'true'", "validate all"],
        "Add `VALIDATE ALL` (or `VALIDATE n ROWS`) at the end. Use it before the first real load of a new feed or when debugging a suspect batch.",
        lang="sql", tags=("syntax",), diff=2)
C.odd("Three of these are checked by COPY INTO's VALIDATE. Which one is not?",
      ["Files parse with the given format options", "Schema is compatible with (or can evolve into) the target",
       "NOT NULL / CHECK constraints hold", "No business key appears twice across files"], 3,
      "VALIDATE checks parsing, schema and table constraints. Business-key uniqueness is not a file-level concern — duplicates across files are handled downstream (dedup / MERGE in Silver).",
      tags=("concept", "pitfall"), diff=2)
S("§29")
C.write("Write a COPY INTO from JSON in `/Volumes/ecommerce/raw/orders/` into `ecommerce.bronze.orders_raw` that casts `order_id` to BIGINT, `amount` to DOUBLE and stores `upper(status) AS status`.",
        "COPY INTO ecommerce.bronze.orders_raw\nFROM (\n  SELECT\n    order_id::BIGINT,\n    amount::DOUBLE,\n    upper(status) AS status\n  FROM '/Volumes/ecommerce/raw/orders/'\n)\nFILEFORMAT = JSON;",
        ["copy into ecommerce.bronze.orders_raw", "from (", "select", "::bigint", "::double", "upper(status) as status", "fileformat = json"],
        "The FROM becomes a SELECT over the path. Casts with `::TYPE`, functions like upper(), and `_metadata.file_path` are all allowed — COPY INTO is a parse-project-load, not a byte copy.",
        lang="sql", tags=("syntax",), diff=3)
C.tf("COPY INTO is just a byte-level file copy into the table's storage.", False,
     "COPY INTO parses the files with the given format and can project, cast and compute columns via a SELECT before writing Delta rows.",
     tags=("concept",), diff=1)
S("§30", "Q25")
C.bucket("Which mergeSchema does what?", ["FORMAT_OPTIONS mergeSchema", "COPY_OPTIONS mergeSchema"],
         [("Combines columns across source files that differ", 0), ("Concerns the files being read", 0),
          ("Adds new columns to the target Delta table", 1), ("Concerns the table being written", 1),
          ("File A has `coupon`, file B doesn't — read both into one schema", 0),
          ("Target table gets a new `discount_code` column", 1)],
        "FORMAT_OPTIONS = how to read the source; COPY_OPTIONS = how to load into the target. Big-Test Q25 is exactly this distinction.",
        tags=("exam", "compare"), diff=2)
C.cloze("Complete COPY INTO with inference and target-schema evolution.",
        "COPY INTO ecommerce.bronze.orders_raw\nFROM '/path/'\nFILEFORMAT = CSV\n[[FORMAT_OPTIONS]] ('inferSchema' = 'true', 'mergeSchema' = 'true')\n[[COPY_OPTIONS]] ('[[mergeSchema]]' = 'true');",
        "Parser/source options go in FORMAT_OPTIONS; load behavior (target evolution, force) goes in COPY_OPTIONS.",
        bank=["OPTIONS", "TBLPROPERTIES", "overwriteSchema", "force"], as_code=True, tags=("syntax", "exam"), diff=2)
C.free("Big-Test Q25: explain the difference between `FORMAT_OPTIONS mergeSchema` and `COPY_OPTIONS mergeSchema`.",
       "FORMAT_OPTIONS mergeSchema tells the reader to reconcile/merge the schemas of the source files being read (different files may have different columns). COPY_OPTIONS mergeSchema allows the load to evolve the target Delta table's schema, adding new columns. To get a brand-new source column into the table you typically need both.",
       ["FORMAT_OPTIONS = source files' schemas merged", "COPY_OPTIONS = target Delta schema evolves", "Often both needed for a new column"],
       "Mnemonic: FORMAT reads, COPY writes.",
       tags=("exam",), diff=2)

# =====================================================================
s08 = C.sec(8, "Auto Loader: cloudFiles, readStream & the Bronze Skeleton",
            "When the folder holds millions of files and keeps growing, you need discovery with memory — that's Auto Loader.")
S("§31")
C.p("Databricks' guidance on scale: **thousands of files over time → COPY INTO can be fine; millions+ → prefer Auto Loader**. Auto Loader discovers files more efficiently, processes them in incremental batches and has richer schema inference/evolution.")
S("§32")
C.p("The problem: `orders/` holds **5,000,000** files and **+100** arrive every 10 seconds. A naive loader lists all 5,000,000 names each time to find the 100 new ones.")
C.diagram("""
 every trigger:
   list 5,000,000 names  ──►  compare with what I loaded  ──►  100 new
   (cost grows with the folder, not with the new data)
""", "Naive discovery doesn't scale")
C.p("**Auto Loader** keeps **incremental state** about what it has already discovered and processed, so work scales with new arrivals.")
S("§33", "Q9")
C.code("python", 'orders = (\n    spark.readStream\n        .format("cloudFiles")\n        .option("cloudFiles.format", "json")\n        .load("/Volumes/ecommerce/raw/orders/")\n)', "Auto Loader read")
C.callout("key", "`cloudFiles` = Auto Loader", "The magic identifier `format(\"cloudFiles\")` means *use Auto Loader*. The actual file format goes in `cloudFiles.format`.")
S("§34", "Q10")
C.p("**Why `readStream`?** Auto Loader is built on **Spark Structured Streaming**. That doesn't mean the source is Kafka or a live event feed — the source is **files**. The *processing model* is streaming: incremental arrivals → micro-batches of new files.")
C.flow(["incremental arrivals", "micro-batches", "new files only"], "Streaming as a processing model, not a source type")
S("§35", "§71", "§91")
C.code("python", 'from pyspark.sql import functions as F\n\nsource_path     = "/Volumes/ecommerce/raw/orders/"\nschema_path     = "/Volumes/ecommerce/system/orders_schema/"\ncheckpoint_path = "/Volumes/ecommerce/system/orders_checkpoint/"\n\norders = (\n    spark.readStream\n        .format("cloudFiles")\n        .option("cloudFiles.format", "json")\n        .option("cloudFiles.schemaLocation", schema_path)\n        .load(source_path)\n        .withColumn("_ingested_at", F.current_timestamp())\n)\n\nquery = (\n    orders.writeStream\n        .format("delta")\n        .option("checkpointLocation", checkpoint_path)\n        .toTable("ecommerce.bronze.orders_raw")\n)',
       "Production-style Bronze ingestion skeleton — memorize this shape")
C.table(["Piece", "Role"],
        [["readStream.format(\"cloudFiles\")", "Auto Loader source"], ["cloudFiles.format", "Format of the files (json, csv, parquet…)"],
         ["cloudFiles.schemaLocation", "Where inferred schema + its history are stored"], [".load(source_path)", "Landing-zone path to watch"],
         ["writeStream.format(\"delta\")", "Delta sink"], ["checkpointLocation", "Where stream progress/state is stored"],
         [".toTable(...)", "Target Unity Catalog table"]])
C.p("**Lab:** start the stream, drop a new file into `orders_json/`, and observe that **only the new arrival** is processed.")
S("§69", "§70")
C.compare(("Misconception", ["Auto Loader = a faster spark.read", "Auto Loader turns files into Kafka"]),
          ("Reality", ["Its edge is **incremental discovery + state tracking + schema handling + streaming integration**, not reading each file faster", "The **source stays files**; only the processing model is streaming/incremental"]))
trap("exam", "Auto Loader is not 'faster spark.read'",
     "Auto Loader doesn't read an individual file faster. Its value is incremental file discovery, remembered state, schema handling and streaming integration.",
     "Answer 'why Auto Loader?' with discovery + state + schema + streaming, not raw speed.")
C.reveal("Think first: where does the word `json` go in an Auto Loader read — `.format(\"json\")`?",
         "No. `.format(\"cloudFiles\")` selects Auto Loader; the file format goes in **`.option(\"cloudFiles.format\", \"json\")`**. Writing `.format(\"json\")` with readStream gives a plain file stream without Auto Loader's features.")

S("§32")
C.calc("The folder holds 5,000,000 files and 100 new ones arrive per trigger. With naive full listing, how many file names are scanned per *new* file discovered?",
       50000, "5,000,000 / 100 = 50,000 names listed for every new file found. The cost tracks the size of the folder, not the new data — that's what Auto Loader's incremental state avoids.",
       unit="names", tags=("calc",), diff=1, quick=True)
S("§33", "Q9")
C.mcq("What does `.format(\"cloudFiles\")` mean?",
      ["Use the Auto Loader source", "Read files from any cloud provider in batch", "Write the stream to cloud storage", "Use COPY INTO under the hood"], 0,
      "`cloudFiles` is the Auto Loader source provider (Big-Test Q9). The actual file format is set with `cloudFiles.format`.",
      tags=("syntax", "exam"), diff=1, quick=True,
      why=["Correct.", "It's a streaming source, not batch.", "It's a read-side format.", "COPY INTO is a separate SQL command."])
S("§34", "Q10", "§70")
C.mcq("Why does Auto Loader use `spark.readStream` even though the source is just files?",
      ["Because it uses the Structured Streaming incremental-processing model (micro-batches of new files)",
       "Because files are converted into Kafka messages first",
       "Because readStream reads each file faster",
       "Because batch reads can't read JSON"], 0,
      "Big-Test Q10: Auto Loader is built on Structured Streaming. 'Streaming' here describes *how* new files are processed (incrementally, with a checkpoint), not the type of source.",
      tags=("concept", "exam"), diff=2,
      why=["Correct.", "Misconception: the source remains files.", "Misconception: the gain is discovery/state, not per-file speed.", "spark.read.json reads JSON fine."])
C.tf("Auto Loader converts incoming files into a Kafka-like message log before processing them.", False,
     "Misconception. The source remains files in storage; Auto Loader just discovers and processes them incrementally using the streaming engine.",
     tags=("pitfall",), diff=1)
S("§69")
C.tf("The main advantage of Auto Loader is that it reads each individual file faster than spark.read.", False,
     "Its advantage is incremental discovery, state tracking (what's processed), schema handling and streaming integration — not per-file read speed.",
     tags=("exam", "pitfall"), diff=1)
S("§35", "§71", "§91")
C.write("Write a full Auto Loader Bronze stream: JSON files from `source_path`, schema stored at `schema_path`, checkpoint at `checkpoint_path`, written to `ecommerce.bronze.orders_raw`.",
        'orders = (\n    spark.readStream\n        .format("cloudFiles")\n        .option("cloudFiles.format", "json")\n        .option("cloudFiles.schemaLocation", schema_path)\n        .load(source_path)\n)\n\nquery = (\n    orders.writeStream\n        .format("delta")\n        .option("checkpointLocation", checkpoint_path)\n        .toTable("ecommerce.bronze.orders_raw")\n)',
        ["readstream", 'format("cloudfiles")', '"cloudfiles.format", "json"', '"cloudfiles.schemalocation", schema_path', ".load(source_path)",
         "writestream", '"checkpointlocation", checkpoint_path', 'totable("ecommerce.bronze.orders_raw")'],
        "Two halves: the read (cloudFiles + format + schemaLocation + load) and the write (writeStream + checkpointLocation + toTable). Forgetting either state location is the #1 skeleton bug.",
        lang="python", tags=("syntax",), diff=2)
C.cloze("Complete the Auto Loader skeleton.",
        'orders = (\n    spark.[[readStream]]\n        .format("[[cloudFiles]]")\n        .option("cloudFiles.[[format]]", "json")\n        .option("cloudFiles.[[schemaLocation]]", schema_path)\n        .load(source_path)\n)\nquery = (\n    orders.[[writeStream]]\n        .option("[[checkpointLocation]]", checkpoint_path)\n        .[[toTable]]("ecommerce.bronze.orders_raw")\n)',
        "readStream + cloudFiles on the read side; writeStream + checkpointLocation + toTable on the write side. schemaLocation is a `cloudFiles.` option; checkpointLocation is not.",
        bank=["read", "autoloader", "saveAsTable", "checkpoint"], as_code=True, tags=("syntax",), diff=2)
C.spotbug("This 'Auto Loader' stream runs, but has no Auto Loader schema inference or file tracking features. Which line is wrong?",
          ["orders = (", "    spark.readStream", '        .format("json")', '        .option("cloudFiles.schemaLocation", schema_path)',
           "        .load(source_path)", ")"],
          [2], '        .format("cloudFiles")\n        .option("cloudFiles.format", "json")',
          "`.format(\"json\")` creates a plain file stream; the `cloudFiles.*` options are then ignored. Auto Loader requires `.format(\"cloudFiles\")` plus `cloudFiles.format`.",
          tags=("debug", "syntax"), diff=2)
C.match("Match each skeleton piece to its role.",
        [("format(\"cloudFiles\")", "Selects Auto Loader"), ("cloudFiles.format", "Format of the incoming files"),
         ("cloudFiles.schemaLocation", "Stores inferred schema + history"), ("checkpointLocation", "Stores stream progress/state"),
         ("toTable", "Names the target table")],
        "Read side: what to read and how to interpret it. Write side: where to put it and how to remember progress.",
        tags=("syntax",), diff=1)
S("Q1")
C.free("Big-Test Q1: what's the main difference between `spark.read` and Auto Loader?",
       "spark.read is ordinary batch file reading: it reads whatever is in the path right now and remembers nothing. Auto Loader runs on Structured Streaming and adds incremental file discovery and stateful processing: it tracks (in a checkpoint) which files were processed, picks up only new files, and manages schema inference/evolution in schemaLocation.",
       ["spark.read = batch, current contents, no memory", "Auto Loader = Structured Streaming source (cloudFiles)",
        "Incremental discovery of new files", "Checkpointed state / schema handling"],
       "Speed of reading a single file is not the difference — memory and discovery are.",
       tags=("exam", "interview"), diff=1)
S("§31")
C.mcq("Per Databricks guidance, which ingestion tool fits a source that grows to **millions of files** over time?",
      ["Auto Loader", "COPY INTO", "A nightly spark.read of the whole folder", "INSERT INTO ... SELECT"], 0,
      "COPY INTO is fine for thousands of files; at millions+ Auto Loader's incremental discovery and state are the recommended approach.",
      tags=("exam",), diff=1,
      why=["Correct.", "Suitable for thousands, not the recommended choice at millions+.", "Re-reads everything every night.", "No file discovery at all."])
