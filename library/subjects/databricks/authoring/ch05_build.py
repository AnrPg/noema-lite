import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qhelp import *
from ch05_sections import add_sections

ch = Chapter("ch05")
add_sections(ch)

# =============== s01 Anatomy ===============
ch.tf(1, 1, ["concept", "exam"], "A Delta table consists of every `.parquet` file that physically exists in the table's folder.", False,
      "The table is the set of **logical** files that the transaction log references in the current snapshot. Old files (removed by UPDATE/DELETE/OPTIMIZE) can still sit in the folder for time travel or until VACUUM — they are not part of the current table.", quick=True)
ch.calc(1, 1, ["concept", "exam"], "A Delta table folder physically holds **50** Parquet files. The current snapshot in `_delta_log` references **37** of them. How many files are logically part of the current table?", 37,
        "**37.** Physical existence does not imply current logical membership. The other 13 are typically tombstoned files kept for older snapshots/time travel or waiting for VACUUM.", unit="files", quick=True)
ch.mcq(1, 1, ["concept", "syntax"], "Which filename is a valid Delta commit file for **version 3**?",
       ["`3.json`", "`00000000000000000003.json`", "`v3.parquet`", "`commit-0003.log`"], 1,
       "Commit files use **20-digit zero-padded** version numbers with a `.json` extension. Zero padding keeps lexical order = version order when listing the folder.",
       why=["Not zero-padded.", "Correct: 20 digits, zero-padded, JSON.", "Commits are JSON; Parquet is used for data files and checkpoints.", "Invented naming."])
ch.mcq(1, 2, ["concept"], "Storage contains `A.parquet`, `B.parquet`, `C.parquet`; the current snapshot lists only A and C. What is the **most likely** reason B still exists?",
       ["B is corrupted and Delta skips it", "B is an old file kept for time travel / not yet removed by VACUUM", "B is a checkpoint file", "B is a staging file Spark forgot to delete, so the table is broken"], 1,
       "B was probably removed logically by an earlier commit (REMOVE action) and is retained for older snapshots until VACUUM cleans it up after the retention window. This is normal, not corruption.",
       why=["Delta doesn't skip files because of corruption; it reads exactly what the snapshot lists.", "Correct.", "Checkpoints live inside `_delta_log`, not as data files.", "Unreferenced files are expected; the table is fine."])
ch.mcq(1, 2, ["concept"], "Which information can a real `add` action in the transaction log carry? (choose all)",
       ["File path and size", "`dataChange` flag", "Partition values and modification time", "File-level statistics (record count, min/max)", "The full row data of the file"], [0, 1, 2, 3],
       "An `add` action describes a file: path, size, `dataChange`, partition values, modification time and per-file statistics. The rows themselves live only in the Parquet file — the log stores metadata, not data.", )
ch.bucket(1, 1, ["concept"], "Where does each thing live?", ["Parquet data files", "_delta_log/"],
          [("Actual column values of orders", 0), ("JSON commit per version", 1), ("Columnar compressed rows", 0), ("ADD / REMOVE actions", 1), ("Checkpoint summaries of table state", 1), ("Table version history", 1)],
          "Parquet files hold the **data**; `_delta_log` holds the **versioned state**: commit JSONs with actions, plus checkpoints. Checkpoints are Parquet-based but they live in the log folder and summarize metadata, not business rows.")
ch.cloze(1, 2, ["concept"], "Complete the storage-side formula of a Delta table.",
         "Parquet files + optional [[deletion vectors|DVs|deletion vector]] + _delta_log [[versions|commits]] + [[checkpoints|checkpoint]] = Delta table state",
         "The table state is assembled from the data files, any deletion vectors that mask rows, the versioned commits and the checkpoints that summarize them. If you can rebuild this in your head, MERGE/VACUUM/concurrency become predictable.",
         bank=["indexes", "locks", "partitions"])
ch.free(1, 2, ["interview"], "Interview: **\"Parquet already stores data, so why do I need Delta?\"** Answer in 3–4 sentences.",
        "Parquet defines how columnar data is stored in individual files, but it doesn't define transactional table state across many files. Delta adds a versioned transaction log on top of those files, giving atomic (ACID) commits and snapshot isolation. That enables DML such as MERGE/UPDATE/DELETE, schema enforcement and evolution, concurrency control, history and time travel, plus physical optimization features like OPTIMIZE, data skipping and clustering.",
        ["Parquet = file format, not table state across files", "Versioned transaction log", "ACID / atomic commits + snapshot isolation", "DML: MERGE/UPDATE/DELETE", "Schema enforcement/evolution, time travel, concurrency control, optimization"],
        "Strong answers contrast **file format** vs **table semantics**. Mentioning only 'Delta is faster' misses the point: the core value is the transaction log and everything it enables.")

# =============== s02 Snapshots ===============
ch.mcq(2, 2, ["concept", "calc"], "Replay this log. Which files form the snapshot of **version 2**?",
       ["{A, B, C, D}", "{B, C, D}", "{C, D}", "{A, C, D}"], 1,
       "v0 → {A, B}; v1 removes A and adds C → {B, C}; v2 adds D → {B, C, D}. A is still on storage but not in the snapshot.",
       why=["Includes A, which was removed in v1.", "Correct replay.", "B was never removed.", "A was removed; B was not."],
       code="v0: ADD A, ADD B\nv1: REMOVE A, ADD C\nv2: ADD D", quick=True)
ch.tf(2, 1, ["concept", "exam"], "A `remove` action in the Delta log means the file is immediately deleted from cloud storage (`rm`).", False,
      "`remove` only means the file **no longer participates** in the snapshot. It is kept as a tombstone so older snapshots and concurrent readers still work; physical deletion happens later via VACUUM.", quick=True)
ch.order(2, 2, ["concept"], "Order the steps a reader uses to build the snapshot of **v103** when a checkpoint exists at v100.",
         ["Load checkpoint v100", "Replay v101.json", "Replay v102.json", "Replay v103.json"],
         "Readers start from the latest checkpoint at or before the target version and replay only the JSON commits after it. Replaying from v0 would make planning expensive on tables with thousands of commits.")
ch.mcq(2, 2, ["concept"], "Why does Delta keep old (removed) data files around for a while? (choose all)",
       ["Snapshot isolation for readers that started earlier", "Concurrent readers mid-query", "Time travel to older versions", "To make current queries faster", "Recovery/history semantics until retention + cleanup"], [0, 1, 2, 4],
       "Old files serve older snapshots: in-flight readers, time travel and recovery. They do **not** speed up current queries — current queries never read them.")
ch.mcq(2, 1, ["concept"], "What does a Delta **checkpoint** do?",
       ["Physically deletes old files", "Stores a summarized table state so readers don't replay the log from version 0", "Locks the table during writes", "Compacts small data files"], 1,
       "A checkpoint summarizes the log up to a version in Parquet-based structures. Deleting files is VACUUM; compaction is OPTIMIZE; Delta doesn't lock the table for writes.",
       why=["That's VACUUM.", "Correct.", "Delta uses optimistic concurrency, no table lock.", "That's OPTIMIZE."])
ch.tf(2, 2, ["exam", "pitfall"], "Your application can safely assume Delta writes a checkpoint every exactly N commits.", False,
      "Checkpoint frequency is an implementation/performance detail and Databricks may adjust it (Checkpoint V2 even changes the structure). Code that depends on a fixed interval is fragile.")
ch.spotbug(2, 2, ["pitfall", "debug"], "A runbook to 'undo' a bad commit. Which line is the dangerous one?",
           ["-- bad data appeared in version 152", "DESCRIBE HISTORY prod.silver.orders;", "%sh rm /mnt/lake/orders/_delta_log/00000000000000000152.json", "SELECT * FROM prod.silver.orders VERSION AS OF 151;"], [2],
           "RESTORE TABLE prod.silver.orders TO VERSION AS OF 151;",
           "Never edit or delete files in `_delta_log` — the log is the transactional protocol and hand edits can corrupt the table for every reader/writer. Use the supported `RESTORE` operation, which appends a new version equivalent to v151.")
ch.odd(2, 1, ["concept", "pitfall"], "Which is NOT a supported way to change a Delta table's state?",
       ["`RESTORE TABLE … TO VERSION AS OF 5`", "`VACUUM t`", "Editing `00000000000000000152.json` by hand", "`ALTER TABLE t SET TBLPROPERTIES (…)`"], 2,
       "UPDATE, DELETE, MERGE, RESTORE, ALTER TABLE, VACUUM, OPTIMIZE and supported APIs are the legit tools. Hand-editing the log bypasses the protocol.")

# =============== s03 UPDATE/DELETE ===============
ch.tf(3, 1, ["concept", "exam"], "A Delta `UPDATE` opens the existing Parquet file and edits the changed bytes in place.", False,
      "Parquet files are immutable. Delta writes new data (rewritten file or supplemental file + DV) and commits the swap atomically. Old snapshots still point at the untouched old file.", quick=True)
ch.mcq(3, 2, ["concept"], "File A holds 3 rows; you update row 2 using classic copy-on-write. Which commit is written?",
       ["`UPDATE A row 2`", "`REMOVE A` + `ADD B` (B = all 3 rows, row 2 changed)", "`ADD B` (B = only row 2)", "`REMOVE A` only"], 1,
       "Copy-on-write rewrites the file: B contains rows 1 and 3 unchanged plus the new row 2, and the commit atomically removes A and adds B. Adding only row 2 would leave the old row 2 visible in A.",
       why=["There's no in-place row action in the log.", "Correct.", "Old row 2 would still be visible in A → duplicate.", "Rows 1 and 3 would vanish."], quick=True)
ch.write(3, 2, ["syntax"], "Write the conditional update: orders in status `SHIPPING` older than 7 days become `LATE` and get a 5% discount on `amount`. Table: `ecommerce.silver.orders` (cols `status`, `amount`, `order_ts`).",
         """
         UPDATE ecommerce.silver.orders
         SET status = 'LATE',
             amount = amount * 0.95
         WHERE status = 'SHIPPING'
           AND order_ts < current_timestamp() - INTERVAL 7 DAYS;
         """, ["update ecommerce.silver.orders", "set", "amount * 0.95", "where", "interval 7 days"],
         "One `UPDATE` can set several columns. The time predicate uses `current_timestamp() - INTERVAL 7 DAYS`. Delta then decides the physical implementation (rewrite or DV) and commits a new version.")
ch.write(3, 1, ["syntax"], "Delete all cancelled orders from `dev_training.sales.orders`.",
         "DELETE FROM dev_training.sales.orders\nWHERE status = 'CANCELLED';", ["delete from dev_training.sales.orders", "where status = 'cancelled'"],
         "`DELETE FROM … WHERE …` removes rows logically and commits a new version. The files may remain physically until VACUUM.")
ch.tf(3, 1, ["pitfall"], "`DELETE FROM dev_training.sales.orders;` (no WHERE) drops the table object.", False,
      "Without WHERE it logically deletes **all rows**, but the table object, schema and history remain. Dropping the object is `DROP TABLE`.")
ch.mcq(3, 2, ["concept", "exam"], "A long `SELECT` is running while a `DELETE` commits on the same Delta table. What can the reader see?",
       ["A mix: some deleted rows, some not", "Either the full old snapshot or the full new snapshot — never half", "An error, because the table is locked", "Random results until VACUUM runs"], 1,
       "Commits are atomic and readers use snapshot isolation: a reader is pinned to one version for its whole query. 'Half old + half new' is exactly what Delta guarantees never happens.")
ch.cloze(3, 1, ["syntax"], "Fill in the UPDATE.",
         """
         [[UPDATE]] dev_training.sales.orders
         [[SET]] status = 'SHIPPED'
         [[WHERE]] order_id = 2;
         """, "Standard SQL DML. On Delta it results in a new table version; the old version stays readable via time travel.",
         bank=["MERGE", "VALUES", "FROM"], asCode=True)
ch.free(3, 2, ["interview", "concept"], "Why do we say Delta gives 'database-like table semantics on object storage'? Use UPDATE/DELETE as your example.",
        "On a plain Parquet folder you can't safely change a row: you'd have to rewrite files by hand and readers could see half-written states. Delta turns UPDATE, DELETE and MERGE into transactional operations: it writes new files (or deletion vectors) and atomically commits a new version in the log, so readers always see a consistent snapshot. That's the kind of mutation guarantee you'd expect from a database, on top of cheap object storage.",
        ["Plain Parquet: mutation is hard/unsafe", "Delta DML is transactional", "New files/DVs + atomic log commit", "Readers see consistent snapshots"],
        "The key is **transactional mutation**. Answers that just list commands miss why they're safe: the atomic commit to the log.")

# =============== s04 Deletion vectors ===============
ch.mcq(4, 1, ["concept"], "A 3 GB Parquet file; you delete 2 rows. Why can a deletion vector be much cheaper than an immediate file rewrite?",
       ["DVs compress the file", "Delta records that 2 rows are logically deleted without rewriting the millions of remaining rows now", "DVs delete the rows from cloud storage directly", "DVs skip writing to the transaction log"], 1,
       "A DV is a small marker of deleted row positions. The expensive rewrite of the 3 GB file is avoided (or deferred, e.g. to OPTIMIZE/REORG). The commit still goes through the log.",
       why=["DVs don't compress.", "Correct.", "Nothing is physically deleted — rows are masked.", "Every change is still a log commit."], quick=True)
ch.order(4, 1, ["concept"], "Order what a reader does on a table whose file has a deletion vector.",
         ["Read the snapshot from the log", "Read data file A.parquet", "Apply the deletion vector", "Return rows not marked deleted"],
         "The reader combines the underlying data file with the DV state and never returns logically deleted rows. That's why reads pay a small cost while writes become cheap.", quick=True)
ch.tf(4, 2, ["concept"], "With deletion vectors, an `UPDATE` can mark the old row version as deleted and write the new row version into a small supplemental data file.", True,
      "That's exactly how DVs accelerate UPDATE (and MERGE): mark old row in the DV, write only the new row version, instead of rewriting the full file.")
ch.write(4, 1, ["syntax"], "Enable deletion vectors on `dev_training.sales.orders`.",
         "ALTER TABLE dev_training.sales.orders\nSET TBLPROPERTIES ('delta.enableDeletionVectors' = true);",
         ["alter table dev_training.sales.orders", "set tblproperties", "delta.enableDeletionVectors"],
         "DVs are a table feature set via a table property. Databricks recommends them unless older clients must still read the table.")
ch.mcq(4, 2, ["pitfall", "exam"], "What is the main risk when enabling a table feature such as deletion vectors?",
       ["It deletes table history", "It can upgrade the Delta protocol, making the table unreadable by older Delta clients", "It disables time travel", "It turns the table into a Parquet table"], 1,
       "Table features may raise the minimum reader/writer protocol versions. Old engines/clients that don't support the feature can no longer read/write the table — check compatibility first.")
ch.tf(4, 2, ["exam", "pitfall"], "In modern Databricks, updating one row **always** rewrites the whole Parquet file.", False,
      "That was the first mental model, but with deletion vectors Delta can choose between file rewrite and DV + supplemental data, depending on table features/runtime/engine.")
ch.cloze(4, 3, ["syntax", "pitfall"], "Physically purge rows soft-deleted via deletion vectors.",
         """
         [[REORG]] TABLE dev_training.sales.orders APPLY ([[PURGE]]);
         -- after the retention period has passed:
         [[VACUUM]] dev_training.sales.orders;
         """, "REORG … APPLY (PURGE) rewrites files so soft-deleted rows are physically gone from current files; VACUUM later removes the old files once they're beyond retention. Either step alone isn't enough.",
         bank=["OPTIMIZE", "RESTORE", "TRUNCATE"], asCode=True)
ch.match(4, 2, ["concept"], "Match each DV situation to what happens.",
         [("DELETE 1 row with DVs on", "Row marked deleted in a DV; file kept"),
          ("Reading a file with a DV", "File + DV combined; masked rows skipped"),
          ("UPDATE 1 row with DVs on", "Old row masked + new row in supplemental file"),
          ("REORG TABLE … APPLY (PURGE)", "Files rewritten without soft-deleted rows")],
         "DVs make writes cheap by deferring rewrites; reads apply the DV; PURGE finally materializes the deletion physically.")

# =============== s05 History / time travel ===============
ch.cloze(5, 1, ["syntax"], "Read two old snapshots.",
         """
         SELECT * FROM dev_training.sales.orders [[VERSION AS OF]] 5;
         SELECT * FROM dev_training.sales.orders [[TIMESTAMP AS OF]] '2026-09-15 10:00:00';
         """, "Time travel by version number or by timestamp. Neither changes the current table.", bank=["RESTORE TO", "AS OF VERSION", "SNAPSHOT"], asCode=True, quick=True)
ch.mcq(5, 1, ["concept"], "What does `DESCRIBE HISTORY t` return?",
       ["The current schema", "Table versions in reverse chronological order with timestamp, user, operation, parameters and metrics", "The list of Parquet files", "Only the last 10 queries run on the table"], 1,
       "History is versioned provenance per write: version, timestamp, user, operation, operationParameters, operationMetrics… newest first. Schema → DESCRIBE TABLE; files/size → DESCRIBE DETAIL.",
       why=["That's DESCRIBE TABLE.", "Correct.", "File-level info isn't listed; DESCRIBE DETAIL gives counts.", "It lists writes (commits), not SELECT queries."], quick=True)
ch.write(5, 1, ["syntax"], "PySpark: load `ecommerce.silver.orders` as it was at version 121 into `old_df`.",
         """
         old_df = (
             spark.read
                  .option("versionAsOf", 121)
                  .table("ecommerce.silver.orders")
         )
         """, ["spark.read", "versionAsOf", "121", ".table("], "The reader option `versionAsOf` (or `timestampAsOf`) selects the snapshot. It's the DataFrame equivalent of `VERSION AS OF`.", lang="python")
ch.tf(5, 1, ["concept", "exam"], "`SELECT * FROM orders VERSION AS OF 5` makes version 5 the current version of the table.", False,
      "Time travel is read-only: it reads an older snapshot. Making an old state current again is `RESTORE`, which creates a new version.")
ch.mcq(5, 1, ["concept"], "What is the default transaction-log history retention?",
       ["7 days", "30 days", "90 days", "Forever"], 1,
       "Log history defaults to **30 days** (`delta.logRetentionDuration`). Don't confuse with the **7-day** deleted-file retention used by VACUUM.",
       why=["That's the VACUUM data-file threshold.", "Correct.", "Not a Delta default.", "History is finite — that's why it isn't a backup."])
ch.scenario(5, 2, ["debug"], "A stakeholder: \"Today `customer_id` in `prod.silver.orders` became NULL for many rows.\"", [
    ("What do you do first?", [
        ("Run DESCRIBE HISTORY prod.silver.orders to see recent operations", True, "Right: don't guess — history shows which operations ran, when and by whom."),
        ("Re-run yesterday's pipeline to overwrite the table", False, "You'd change the table before understanding what broke it, and maybe re-break it."),
        ("Run VACUUM to clean up bad files", False, "VACUUM can destroy the old files you need for comparison and recovery!"),
    ]),
    ("History shows v124 (MERGE 09:00) and v125 (UPDATE 11:00). How do you pinpoint the bad version?", [
        ("Time-travel: compare VERSION AS OF 124 vs VERSION AS OF 125", True, "Comparing snapshots shows v124 correct and v125 broken."),
        ("Read the Parquet files directly from storage", False, "Physical files include removed ones; you'd mix snapshots."),
        ("Look at DESCRIBE DETAIL", False, "DETAIL gives current table-level metadata, not per-version contents."),
    ], "SELECT * FROM prod.silver.orders VERSION AS OF 124;\nSELECT * FROM prod.silver.orders VERSION AS OF 125;"),
    ("v125 is the culprit (an UPDATE from a buggy job). Next?", [
        ("Inspect v125's operation, user and operationMetrics, then fix the job and decide fix-forward vs RESTORE TABLE … TO VERSION AS OF 124", True, "Correct: find root cause, then repair data safely."),
        ("Delete 00000000000000000125.json from _delta_log", False, "Never hand-edit the log."),
        ("Do nothing; time travel is a backup anyway", False, "History expires and VACUUM can remove files."),
    ]),
], "History → compare versions with time travel → identify the operation → fix or RESTORE. That is the real Delta debugging workflow.")
ch.order(5, 2, ["debug"], "A pipeline corrupted data and it showed up in v101. Order your actions.",
         ["Run DESCRIBE HISTORY", "Time-travel and compare v100 vs v101", "Identify the operation/job that created v101", "Decide: fix forward or RESTORE to v100"],
         "This is the test answer for 'corrupted pipeline at v101': history, compare, locate operation, then repair. Restoring first without understanding risks repeating the bug on the next run.")
ch.spotbug(5, 2, ["syntax"], "Which line has invalid time-travel syntax?",
           ["SELECT *", "FROM ecommerce.silver.orders", "AS OF VERSION 121", "WHERE status = 'PAID';"], [2],
           "SELECT *\nFROM ecommerce.silver.orders VERSION AS OF 121\nWHERE status = 'PAID';",
           "The syntax is `table_name VERSION AS OF n` (or `TIMESTAMP AS OF '…'`), placed right after the table name. `AS OF VERSION` is not valid Databricks SQL.")

# =============== s06 RESTORE ===============
ch.calc(6, 1, ["concept", "exam"], "Current version is **v10**. You run `RESTORE TABLE t TO VERSION AS OF 7`. What version number does the table have afterwards?", 11,
        "RESTORE is a new transaction appended to history: v11 with state equivalent to v7. Versions 8–10 are not deleted.", unit="version", quick=True)
ch.tf(6, 1, ["exam", "pitfall"], "Restoring to v7 while current is v10 deletes versions 8–10 from the history.", False,
      "History stays history. RESTORE commits a new version (v11) whose state equals v7; you can still inspect v8–v10 (as long as retention allows).", quick=True)
ch.bucket(6, 2, ["compare"], "Time travel or RESTORE?", ["Time travel (VERSION AS OF)", "RESTORE"],
          [("Reads an old snapshot", 0), ("Creates a new table version", 1), ("Current table state unchanged", 0), ("Old state becomes current again", 1), ("Shows up as an operation in DESCRIBE HISTORY", 1), ("Works in a plain SELECT", 0)],
          "Time travel = read only. RESTORE = a write that makes an old state current, committed as a new version and visible in history.")
ch.write(6, 1, ["syntax"], "Restore `prod.silver.orders` to how it was at `2026-09-15 10:00:00`.",
         "RESTORE TABLE prod.silver.orders\nTO TIMESTAMP AS OF '2026-09-15 10:00:00';",
         ["restore table prod.silver.orders", "to timestamp as of"], "RESTORE accepts `TO VERSION AS OF n` or `TO TIMESTAMP AS OF '…'`. It fails if the files for that version were vacuumed.")
ch.tf(6, 1, ["exam", "pitfall"], "Delta table history is a long-term backup system.", False,
      "No. Default 7-day deleted-file retention (VACUUM) and 30-day log retention limit time travel. Databricks explicitly says not to use history as a long-term backup strategy.")
ch.mcq(6, 2, ["concept", "pitfall"], "To successfully time travel to version N, what must still exist?",
       ["Only the history entry for N", "Only the data files for N", "Both the log history for N and the data files of N", "Only the latest checkpoint"], 2,
       "You need the log (to know which files form N) **and** the files themselves. VACUUM may delete files while the history entry is still listed — the classic 'history exists but query fails' case.",
       why=["Metadata alone can't return rows.", "Without the log you don't know which files form N.", "Correct.", "A checkpoint summarizes state but not the old data files."])
ch.match(6, 2, ["concept"], "Match each retention fact.",
         [("VACUUM deleted-file threshold (default)", "7 days"), ("Transaction-log history (default)", "30 days"), ("RETAIN 168 HOURS", "Same as the 7-day default"), ("Time travel to a vacuumed version", "Fails: data files gone")],
         "Two different clocks: 7 days for data files, 30 days for log history. 168 h = 7 × 24.")

# =============== s07 VACUUM ===============
ch.calc(7, 1, ["calc"], "`VACUUM t RETAIN 168 HOURS` keeps how many **days** of removed files?", 7,
        "168 / 24 = 7 days — exactly the Databricks default and recommended minimum.", unit="days", quick=True)
ch.tf(7, 1, ["exam", "pitfall"], "VACUUM speeds up queries by compacting small files into bigger ones.", False,
      "VACUUM = garbage collection of old unreferenced files. Compaction/layout is OPTIMIZE. Confusing them is a very common exam trap.", quick=True)
ch.mcq(7, 2, ["exam", "pitfall"], "A colleague proposes: \"To save storage, run `VACUUM t RETAIN 0 HOURS` every hour.\" What can break? (choose all)",
       ["Time travel", "Long-running readers", "Long-running writers whose uncommitted files look unreferenced", "Recovery assumptions", "Schema enforcement"], [0, 1, 2, 3],
       "Zero retention deletes files that older snapshots, in-flight queries and in-flight writers still need. Databricks recommends ≥7 days and has a safety check that blocks short retention. Schema enforcement is unrelated.")
ch.mcq(7, 1, ["concept"], "Log: v0 → {A,B}, v1 → {B,C}, v2 → {C,D}. After the retention window passes, which files can VACUUM eventually remove?",
       ["C and D", "A and B", "A only", "None — VACUUM never deletes data files"], 1,
       "Current snapshot is {C, D}. A and B are referenced only by older versions; once those versions fall outside retention, VACUUM can delete them.")
ch.scenario(7, 2, ["debug"], "A 10 TB `orders` table. You ran `DELETE FROM orders WHERE event_date < DATE'2020-01-01'`. Queries no longer return those rows, but storage is still ~10 TB.", [
    ("First reaction?", [
        ("Recognize logical delete ≠ physical deletion; this is not necessarily a bug", True, "Correct: old files are kept for snapshots/time travel."),
        ("Open a P1: Delta failed to delete", False, "The DELETE worked logically — check the physical side first."),
        ("Re-run the DELETE until storage drops", False, "Re-running deletes nothing new and adds versions."),
    ]),
    ("DVs are enabled on the table. What does that imply?", [
        ("Original files may still be current physical inputs, with deleted rows only masked", True, "Right: soft-deleted rows sit inside still-referenced files."),
        ("DVs physically delete rows immediately", False, "DVs mask rows; they don't purge."),
        ("DVs mean VACUUM alone will free the space", False, "VACUUM only removes unreferenced files; masked rows are inside referenced files."),
    ]),
    ("How do you actually free the space?", [
        ("REORG TABLE orders APPLY (PURGE), then VACUUM after retention", True, "PURGE rewrites files without masked rows; VACUUM later deletes the old ones."),
        ("VACUUM orders RETAIN 0 HOURS", False, "Dangerous and still doesn't purge DV-masked rows."),
        ("OPTIMIZE orders and stop", False, "Rewritten files help, but old files stay until VACUUM."),
    ]),
], "Two layers: logical state (DELETE) vs physical garbage collection (REORG PURGE + VACUUM). Not a contradiction.")
ch.scenario(7, 2, ["debug"], "Yesterday `SELECT * FROM orders VERSION AS OF 80` worked. Today it fails.", [
    ("First thing you check?", [
        ("DESCRIBE HISTORY orders — did a VACUUM run?", True, "Yes: history reveals maintenance operations and their timing."),
        ("Increase cluster size", False, "Not a compute problem."),
        ("Re-create the table from scratch", False, "Destroys evidence and history."),
    ]),
    ("History shows `VACUUM` ran last night. What next?", [
        ("Check its retention and whether v80's data files still exist", True, "A history entry for v80 doesn't guarantee its files survived."),
        ("Assume the log is corrupted and delete it", False, "Never touch the log by hand."),
        ("Run RESTORE TO VERSION AS OF 80", False, "RESTORE needs the same files — it would fail too."),
    ]),
], "VACUUM can remove the physical files older versions need. History entries alone don't make a version queryable — another reason time travel isn't a backup.")
ch.order(7, 2, ["debug", "pitfall"], "Order the steps to physically get rid of rows soft-deleted with deletion vectors.",
         ["DELETE FROM … WHERE … (rows masked by DV)", "REORG TABLE … APPLY (PURGE)", "Wait until the retention period has passed", "VACUUM …"],
         "DELETE is logical; PURGE rewrites files so the rows are physically gone from current files; after retention, VACUUM deletes the old files from storage.")
ch.spotbug(7, 3, ["pitfall", "exam"], "A nightly 'storage saver' job. Which lines are dangerous?",
           ["# nightly maintenance", "spark.conf.set('spark.databricks.delta.retentionDurationCheck.enabled', 'false')", "spark.sql('VACUUM prod.silver.orders RETAIN 0 HOURS')", "spark.sql('DESCRIBE HISTORY prod.silver.orders').show()"], [1, 2],
           "spark.sql('VACUUM prod.silver.orders')  # default 7 days\n# or RETAIN 168 HOURS; keep the safety check enabled",
           "Line 1 disables the safety check that exists precisely to block short retention, and line 2 deletes every unreferenced file immediately — breaking time travel, long-running readers/writers and recovery. Keep ≥7 days.")
ch.cloze(7, 1, ["exam"], "Default retention values.",
         "VACUUM keeps deleted data files for [[7]] days by default, while transaction-log history is kept for [[30]] days.",
         "Two different clocks. You need both the log entry and the files to time travel, so the effective window is usually the 7-day file retention.", bank=["1", "14", "90", "365"])

# =============== s08 MERGE fundamentals ===============
ch.mcq(8, 1, ["concept"], "In `MERGE`, what does **WHEN MATCHED** mean?",
       ["A target row has no source row", "A source row found a target row that satisfies the ON condition", "The source and target schemas match", "The row was already merged earlier"], 1,
       "WHEN MATCHED = source row ↔ target row pair via ON. Typically UPDATE (or DELETE). 'Target row with no source row' is NOT MATCHED BY SOURCE.", quick=True)
ch.match(8, 1, ["concept", "syntax"], "Match each MERGE clause to its meaning.",
         [("ON", "When source and target rows are the same entity"),
          ("WHEN MATCHED", "Source row has a matching target row"),
          ("WHEN NOT MATCHED", "Source row has no target row (usually INSERT)"),
          ("WHEN NOT MATCHED BY SOURCE", "Target row has no source row (UPDATE/DELETE)")],
         "Three cases of the Venn diagram plus the ON condition that defines 'same entity'.", quick=True)
ch.write(8, 2, ["syntax"], "Write an upsert: target `prod.silver.customers` (id, name, city), source `staging.customer_updates`. Update name/city on match, insert otherwise. Use explicit columns.",
         """
         MERGE INTO prod.silver.customers AS t
         USING staging.customer_updates AS s
         ON t.id = s.id
         WHEN MATCHED THEN
           UPDATE SET t.name = s.name, t.city = s.city
         WHEN NOT MATCHED THEN
           INSERT (id, name, city) VALUES (s.id, s.name, s.city);
         """, ["merge into prod.silver.customers", "using staging.customer_updates", "on t.id = s.id", "when matched then", "update set", "when not matched then", "insert"],
         "Read it like a compiler: TARGET, SOURCE, ON (entity identity), then the action per case. This is the canonical upsert.")
ch.tf(8, 1, ["syntax", "exam"], "`WHEN NOT MATCHED BY SOURCE THEN INSERT *` is valid MERGE syntax.", False,
      "NOT MATCHED BY SOURCE supports only **UPDATE or DELETE** — there is no source row whose values could be inserted.")
ch.mcq(8, 2, ["pitfall", "exam"], "Your source contains only **today's changed records**. You add `WHEN NOT MATCHED BY SOURCE THEN DELETE`. What happens?",
       ["Only today's deleted records are removed", "Every target row not in today's batch is deleted — possibly almost the entire table", "Nothing; the clause is ignored for incremental sources", "The MERGE fails with a syntax error"], 1,
       "The clause treats the source as **authoritative**: anything missing from it is deleted. Use it only when the source is a complete snapshot.",
       why=["Delta can't know which rows are 'deleted today' — absence = delete.", "Correct.", "Delta doesn't know your source semantics.", "The syntax is valid."])
ch.cloze(8, 1, ["syntax"], "Complete a full sync against an authoritative snapshot.",
         """
         MERGE INTO target t
         USING source s
         ON t.id = s.id
         WHEN MATCHED THEN UPDATE SET [[*]]
         WHEN NOT MATCHED THEN [[INSERT]] *
         WHEN NOT MATCHED BY [[SOURCE]] THEN [[DELETE]];
         """, "`UPDATE SET *` and `INSERT *` map columns by name when schemas are compatible; NOT MATCHED BY SOURCE … DELETE removes target rows absent from the snapshot.", bank=["TARGET", "VALUES", "ALL"], asCode=True)
ch.mcq(8, 2, ["concept"], "Why might production code prefer explicit `UPDATE SET t.name = s.name, …` over `UPDATE SET *`?",
       ["`SET *` is not supported on Delta", "Explicit mapping shows exactly which columns change and lets you add audit columns like `updated_at`", "Explicit mapping is always faster", "`SET *` deletes unmapped columns"], 1,
       "Explicit mapping is about control and readability: you know precisely what's touched, and you can add `t.updated_at = current_timestamp()`. `SET *` works when schemas are compatible.")
ch.free(8, 2, ["interview"], "Why is MERGE especially important for CDC (change data capture)?",
        "A change feed typically contains inserts, updates and deletes for entities that already exist in the target. MERGE matches each change to the target by key and applies insert/update/delete in one atomic transaction, so the target stays a consistent mirror of the source state. Without it you'd need several separate statements with intermediate inconsistent states.",
        ["CDC = inserts + updates + deletes for existing entities", "MERGE matches by key", "Applies all actions atomically in one commit"],
        "The answer combines **mixed change types** and **atomicity**.")
ch.bucket(8, 2, ["concept"], "Target ids {1,2,3,4}; source ids {1,2,5}. Which MERGE case does each id fall into?",
          ["WHEN MATCHED", "WHEN NOT MATCHED", "WHEN NOT MATCHED BY SOURCE"],
          [("id 1", 0), ("id 2", 0), ("id 5", 1), ("id 3", 2), ("id 4", 2)],
          "In both → MATCHED; only in source → NOT MATCHED (insert); only in target → NOT MATCHED BY SOURCE (update/delete).")
ch.calc(8, 2, ["calc"], "Target ids {1,2,3,4}; source ids {1,2,4,5}. You run MERGE with WHEN MATCHED UPDATE, WHEN NOT MATCHED INSERT, WHEN NOT MATCHED BY SOURCE DELETE. How many rows does the target have afterwards?", 4,
        "1,2,4 matched → updated; 5 inserted; 3 deleted (not in source). Result {1,2,4,5} = 4 rows — the target now mirrors the source exactly.", unit="rows")

# =============== s09 MERGE practice ===============
ch.mcq(9, 1, ["exam", "debug"], "The source has **two rows with the same business key** that both match the same target row in an UPDATE. What do you do?",
       ["Nothing; Delta picks the last one", "Deduplicate/rank the source first so the choice is deterministic", "Switch to INSERT OVERWRITE", "Disable the duplicate check"], 1,
       "Multiple matches make the intended final value ambiguous, so MERGE fails. Rank by a deterministic ordering field (sequence/updated_at/version) and keep one row per key.",
       why=["Delta does not pick silently — it errors.", "Correct.", "Overwrite changes semantics completely.", "There's no such switch; ambiguity must be resolved."], quick=True)
ch.cloze(9, 2, ["syntax"], "Keep only the latest CDC event per key.",
         """
         WITH ranked AS (
           SELECT *,
                  [[ROW_NUMBER]]() OVER (
                    [[PARTITION BY]] id
                    ORDER BY seq [[DESC]]
                  ) AS rn
           FROM staging.customer_changes
         )
         SELECT * FROM ranked WHERE rn = [[1]];
         """, "PARTITION BY the business key, ORDER BY the sequence descending, keep rn = 1 → one latest row per key. RANK() could keep ties; ROW_NUMBER() guarantees one.",
         bank=["RANK", "GROUP BY", "ASC", "0"], asCode=True, quick=True)
ch.write(9, 2, ["syntax"], "PySpark: from `source_df`, keep only the latest row per `customer_id` by `sequence_number`, result in `latest` (drop helper column).",
         """
         from pyspark.sql import functions as F
         from pyspark.sql.window import Window

         w = Window.partitionBy("customer_id").orderBy(F.col("sequence_number").desc())
         latest = (source_df
                   .withColumn("rn", F.row_number().over(w))
                   .filter(F.col("rn") == 1)
                   .drop("rn"))
         """, ["Window.partitionBy(\"customer_id\")", ".desc()", "row_number()", "filter", "== 1", "drop(\"rn\")"],
         "Same pattern as SQL: a window per key ordered newest first, row_number, keep 1. This is a real data-engineering pattern, not a toy window exercise.", lang="python")
ch.order(9, 2, ["debug"], "MERGE on `customer_id` fails. Order the debug sequence.",
         ["Is the target key unique?", "Does the source contain duplicates?", "Which source row is the latest?", "Is there an event sequence / updated_at?", "Deduplicate", "Run the MERGE"],
         "Check uniqueness on both sides, then find a deterministic ordering field, dedup, and only then merge. Skipping the ordering-field question leads to arbitrary picks.")
ch.tf(9, 3, ["exam"], "On DBR 16.0+, MERGE duplicate-match detection considers both the ON condition and relevant WHEN MATCHED conditions, while 15.4 LTS and below used only ON.", True,
      "Correct runtime detail: newer runtimes can avoid false 'multiple matches' errors when WHEN MATCHED conditions make only one source row applicable.")
ch.spotbug(9, 2, ["pitfall", "exam", "syntax"], "A PostgreSQL developer wrote this for Databricks SQL. Which line is the problem?",
           ["UPDATE prod.silver.customers c", "SET city = u.city", "FROM staging.customer_updates u", "WHERE c.id = u.id;"], [2],
           """
           MERGE INTO prod.silver.customers c
           USING staging.customer_updates u
           ON c.id = u.id
           WHEN MATCHED THEN UPDATE SET c.city = u.city;
           """,
           "Databricks SQL does not support the `UPDATE … FROM …` (join-update) pattern. To update from another relation, use `MERGE INTO … WHEN MATCHED THEN UPDATE`.")
ch.write(9, 3, ["syntax"], "Python: upsert `staging.customer_updates` into `prod.silver.customers` on `id` using the `DeltaTable` API (update name, city; insert id, name, city).",
         """
         from delta.tables import DeltaTable

         target = DeltaTable.forName(spark, "prod.silver.customers")
         source = spark.table("staging.customer_updates")

         (target.alias("t")
            .merge(source.alias("s"), "t.id = s.id")
            .whenMatchedUpdate(set={"name": "s.name", "city": "s.city"})
            .whenNotMatchedInsert(values={"id": "s.id", "name": "s.name", "city": "s.city"})
            .execute())
         """, ["DeltaTable.forName", ".merge(", "t.id = s.id", "whenMatchedUpdate", "whenNotMatchedInsert", ".execute()"],
         "The DeltaTable builder mirrors SQL MERGE: alias target/source, merge condition, clause builders, then `.execute()` — forgetting `execute()` means nothing runs.", lang="python")
ch.scenario(9, 2, ["debug"], "Nightly MERGE into `ecommerce.silver.orders` fails: *multiple source rows matched target row*.", [
    ("What do you query first?", [
        ("GROUP BY order_id HAVING COUNT(*) > 1 on the staging table", True, "Finds which keys are duplicated in the source."),
        ("DESCRIBE DETAIL on the target", False, "File counts won't reveal duplicate keys."),
        ("VACUUM the target", False, "Irrelevant and risky."),
    ], "SELECT order_id, COUNT(*)\nFROM ecommerce.staging.orders_updates\nGROUP BY order_id\nHAVING COUNT(*) > 1;"),
    ("order_id 1001 appears twice (two CDC events). What do you need to decide which wins?", [
        ("A deterministic ordering field such as event_sequence, updated_at or version", True, "That's what makes the pick reproducible."),
        ("Pick whichever Spark returns first", False, "Non-deterministic — results may change on retry."),
        ("Average the two amounts", False, "Invents data that never existed."),
    ]),
    ("Final fix?", [
        ("ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY event_sequence DESC), keep rn = 1, then MERGE", True, "Dedup, then merge the clean source."),
        ("Add WHEN NOT MATCHED BY SOURCE THEN DELETE", False, "Unrelated, and dangerous for an incremental source."),
        ("Switch to append mode", False, "Creates duplicates in the target instead."),
    ]),
], "Find duplicates → find ordering field → dedup → merge.")
ch.mcq(9, 1, ["concept"], "Source has `id=10 version=1 amount=100` and `id=10 version=2 amount=120`. Before MERGE you…",
       ["Keep both; MERGE handles it", "Rank by business key ordered by `version DESC` and keep rn = 1 (amount 120)", "Keep the lower version", "SUM the amounts → 220"], 1,
       "Deduplicate by business key with a deterministic ordering field. The newest version (2, amount 120) represents the latest state.")
ch.write(9, 1, ["syntax", "debug"], "Write the query that finds duplicated `order_id`s in `ecommerce.staging.orders_updates`.",
         "SELECT order_id, COUNT(*)\nFROM ecommerce.staging.orders_updates\nGROUP BY order_id\nHAVING COUNT(*) > 1;",
         ["group by order_id", "having count(*) > 1"], "The first query in the 'merge fails' workflow. `HAVING` filters groups after aggregation — WHERE can't reference COUNT(*).")

# =============== s10 Optimistic concurrency ===============
ch.order(10, 1, ["concept"], "Order the phases of optimistic concurrency control.",
         ["READ: consistent snapshot", "WRITE: prepare candidate output", "VALIDATE: check for conflicting commits", "COMMIT: new atomic version (or fail)"],
         "Databricks describes exactly read → write → validate-and-commit. Validation happens at the end, which is what makes it 'optimistic'.", quick=True)
ch.tf(10, 1, ["concept", "exam"], "Delta locks the entire table pessimistically so that concurrent writers wait for each other.", False,
      "Delta uses optimistic concurrency: writers work in parallel on a snapshot and conflicts are checked at commit time.", quick=True)
ch.mcq(10, 2, ["concept", "interview"], "Why is it called **optimistic** concurrency control?",
       ["It always succeeds", "It assumes most concurrent transactions won't conflict and checks only at validation/commit", "It retries automatically forever", "It optimistically skips validation for small writes"], 1,
       "It bets on 'no conflict', lets everyone work, then validates. If the bet fails, one transaction fails — the table stays consistent.")
ch.mcq(10, 2, ["concept"], "Table at v50. A and B both read v50. A commits v51. B's changes don't conflict with A's. What happens to B?",
       ["B fails because it read an old version", "B validates v50→v51, finds no conflict and commits v52", "B overwrites v51", "B waits for a lock"], 1,
       "Reading an older version isn't itself a failure: B checks what changed since its snapshot. No conflict → it commits as the next version, v52.")
ch.order(10, 3, ["concept"], "Order the life of a MERGE as you should picture it.",
         ["Source rows matched via ON", "Read target snapshot", "Determine changed rows/files", "Write new data / deletion vectors", "Optimistic conflict validation", "Atomic transaction-log commit", "New version → new consistent snapshot"],
         "This is the 'data engineer' level view of MERGE: matching, file-level changes, validation, atomic commit. Seeing only 'update/insert' hides where failures and costs come from.")
ch.free(10, 2, ["interview"], "Explain optimistic concurrency control in Delta in your own words.",
        "Each transaction reads a consistent snapshot of the table and prepares its new files without locking the whole table. At commit time Delta checks which commits happened since that snapshot and whether they conflict with what this transaction read or changed. If it's safe, the commit becomes a new atomic version; if not, the transaction fails (and can retry on fresh state) instead of corrupting the table.",
        ["Works on a snapshot, no pessimistic table lock", "Validation at commit against concurrent commits", "Safe → new atomic version", "Conflict → fail/retry, no corruption"], "Hit the four phases and the 'fail instead of corrupt' guarantee.")
ch.calc(10, 2, ["calc"], "Table at v50. Jobs A, B, C all read v50. A commits first. B validates — no conflict — and commits. C validates — conflicts with A — and fails. What is the latest table version?", 52,
        "A → v51, B → v52, C fails and creates no version. Failed transactions never produce versions.", unit="version")

# =============== s11 Isolation / row-level ===============
ch.mcq(11, 1, ["exam"], "What is the default isolation level for Delta writes on Databricks?",
       ["Serializable", "WriteSerializable", "Read Committed", "Snapshot"], 1,
       "Default writes: **WriteSerializable**. Reads use snapshot isolation. Serializable is the stronger, opt-in level.",
       why=["Stronger, opt-in.", "Correct.", "Not a Delta level.", "Snapshot isolation describes reads, not the write level."], quick=True)
ch.tf(11, 2, ["exam", "concept"], "If jobs A and B change **different rows** of the **same** Parquet file, they must conflict.", False,
      "Not anymore: with deletion vectors and row-level concurrency they can coexist, as long as they don't change the same row and the requirements are met.", quick=True)
ch.mcq(11, 2, ["exam"], "A: `UPDATE customers SET status='A' WHERE id=10`; B concurrently: `… status='B' WHERE id=10`. What do you expect?",
       ["Both succeed; last writer wins silently", "A real write conflict: one commits, the other fails or is serialized safely", "Random corruption of row 10", "Both fail"], 1,
       "Same-row modifications still conflict even with row-level concurrency. Optimistic validation guarantees one wins and the other fails — never inconsistent state.")
ch.write(11, 1, ["syntax"], "Set the isolation level of `my_table` to Serializable.",
         "ALTER TABLE my_table\nSET TBLPROPERTIES ('delta.isolationLevel' = 'Serializable');",
         ["alter table my_table", "set tblproperties", "delta.isolationLevel", "serializable"],
         "Isolation level is a table property. Serializable is stricter (reads + writes explainable by a serial order) and may cause more conflicts.")
ch.match(11, 2, ["concept"], "Match the concurrency concept.",
         [("Readers", "Consistent snapshots (snapshot isolation)"), ("Writers", "Optimistic validation at commit"), ("Default write isolation", "WriteSerializable"), ("Strongest isolation", "Serializable"), ("Different rows, same file", "Can coexist with DVs + row-level concurrency")],
         "The memorization trio plus the row-level concurrency rule.")
ch.mcq(11, 3, ["concept"], "Which conditions enable row-level concurrency on Databricks? (choose all)",
       ["Deletion vectors enabled", "Supported Databricks Runtime", "Unpartitioned table (or liquid-clustered table)", "Isolation level set to Serializable", "ZORDER applied"], [0, 1, 2],
       "Row-level concurrency relies on DVs and works for unpartitioned tables on supported runtimes; liquid-clustered tables also use this architecture. Isolation level and ZORDER are not prerequisites.")
ch.odd(11, 2, ["concept"], "Which one does NOT belong to Delta's isolation vocabulary on Databricks?",
       ["WriteSerializable", "Serializable", "Snapshot isolation for reads", "Read Uncommitted"], 3,
       "Delta writes use WriteSerializable (default) or Serializable; reads use snapshot isolation. Delta never exposes uncommitted data — that's the whole point of atomic commits.")

# =============== s12 Concurrency errors ===============
ch.mcq(12, 1, ["exam", "debug"], "Your write fails with `ConcurrentAppendException`. What does this usually mean?",
       ["The Delta table is corrupted", "The optimistic concurrency system prevented an unsafe commit because another operation added files your operation depended on", "Cluster ran out of memory", "Schema mismatch"], 1,
       "Concurrency exceptions signal protection, not corruption. Investigate the competing writer; retry after re-reading fresh state if the conflict is transient.", quick=True)
ch.match(12, 2, ["debug", "exam"], "Match each exception to its likely cause.",
         [("MetadataChangedException", "Concurrent ALTER TABLE / schema-evolving write"),
          ("ConcurrentAppendException", "Another writer added files in the data you read"),
          ("ConcurrentDeleteReadException", "Another writer deleted/rewrote a file you read"),
          ("ProtocolChangedException", "Table protocol/features upgraded concurrently"),
          ("ConcurrentTransactionException", "Two writers share one transaction identity (e.g. stream checkpoint)")],
         "Learn the cause behind each name: it tells you which *other* operation to look for in DESCRIBE HISTORY.", quick=True)
ch.scenario(12, 3, ["debug"], "Your daily `MERGE INTO prod.silver.orders … ON t.id = s.id` fails with `DELTA_CONCURRENT_WRITE`.", [
    ("What's your first move?", [
        ("Find what other writer touched the table at the same time (DESCRIBE HISTORY)", True, "Identify the competing transaction first."),
        ("Wrap it in a loop: run again until it works", False, "Hides the cause; may hammer the table and never converge."),
        ("Drop and recreate the table", False, "Destroys data/history; the table isn't corrupted."),
    ]),
    ("History shows a backfill job running MERGE on the same table. Both MERGEs scan the whole table. What helps?", [
        ("Narrow the MERGE condition if semantically correct, e.g. AND t.event_date = DATE'2026-09-16'", True, "Smaller read scope = smaller scan and smaller conflict domain."),
        ("Switch both to INSERT OVERWRITE", False, "Changes semantics and still conflicts."),
        ("Lower the cluster size", False, "Concurrency conflicts aren't a compute problem."),
    ]),
    ("Anything else to check?", [
        ("Whether DVs/row-level concurrency are enabled, whether a schema ALTER runs concurrently, and add retry-after-fresh-read for transient conflicts", True, "Covers the remaining causes and a safe retry policy."),
        ("Set VACUUM RETAIN 0 HOURS", False, "Unrelated and dangerous."),
        ("Disable the transaction log", False, "Impossible and nonsensical."),
    ]),
], "Concurrency debugging = who else wrote, what did both read, can scope be narrowed, schema changes?, DV/RLC available?, then retry policy.")
ch.order(12, 2, ["debug"], "Order the concurrency debugging questions (playbook order).",
         ["What other writer touched this table?", "What rows/files/partitions did both operations read?", "Are predicates too broad / can I narrow the MERGE condition?", "Is a schema ALTER happening concurrently?", "Are deletion vectors / row-level concurrency available?", "Should the application retry after re-reading fresh state?"],
         "From cause (who/what) to scope (predicates) to special causes (schema) to platform features (DV/RLC) and finally the retry policy. Retrying first is the 'bad response'.")
ch.write(12, 3, ["syntax"], "Rewrite the MERGE so its ON condition is bounded to `event_date = DATE'2026-09-16'` (target `prod.silver.orders` t, source `daily_updates` s, key `id`, use `SET *`/`INSERT *`).",
         """
         MERGE INTO prod.silver.orders t
         USING daily_updates s
         ON t.id = s.id
            AND t.event_date = DATE'2026-09-16'
         WHEN MATCHED THEN UPDATE SET *
         WHEN NOT MATCHED THEN INSERT *;
         """, ["merge into prod.silver.orders", "on t.id = s.id", "and t.event_date = date'2026-09-16'", "update set *", "insert *"],
         "The extra bound reduces both the scan and the conflict domain — valid only if matching target rows really live on that date, otherwise rows from other dates would be inserted as duplicates.")
ch.tf(12, 1, ["debug", "pitfall"], "The right response to a concurrency exception is to re-run the job until it succeeds.", False,
      "That's the 'bad response'. First understand who else wrote and why the scopes overlap. Retry logic is fine for legitimate transient conflicts — after re-reading fresh state.")
ch.mcq(12, 2, ["exam", "debug"], "`MetadataChangedException` during a write. What probably happened?",
       ["Disk full on a worker", "A concurrent operation changed the table metadata, e.g. ALTER TABLE or a schema-evolving write", "Your SELECT used the wrong version", "VACUUM deleted a data file"], 1,
       "Schema changes are metadata changes and conflict with concurrent writes (they can also stop streams reading the table until restart). Coordinate schema updates.")
ch.bucket(12, 2, ["concept", "debug"], "Will these two concurrent operations necessarily conflict (assume DVs + row-level concurrency enabled, unpartitioned table)?",
          ["Real conflict expected", "Can usually coexist"],
          [("Both UPDATE row id=10", 0), ("A updates row 1, B updates row 9000 of the same file", 1), ("A runs ALTER TABLE ADD COLUMNS while B writes", 0), ("A deletes a file that B's MERGE read", 0), ("Two blind INSERT appends", 1)],
          "Same-row changes, metadata changes and deletes of files you read are real conflicts. Different rows (with RLC) and blind appends usually coexist.")

# ---- coverage additions ----
ch.mcq(8, 1, ["exam", "concept"], "What is `MERGE`?",
       ["A command that combines two tables into a new table", "An atomic source-to-target operation that can update, insert and delete target rows based on matching conditions", "A way to merge small files", "A schema-evolution command"], 1,
       "MERGE matches source rows to target rows with an ON condition and applies UPDATE/INSERT/DELETE per case, all in one transaction (one new version). File compaction is OPTIMIZE; schema merging is mergeSchema.",
       why=["It changes an existing target, it doesn't build a new table.", "Correct.", "That's OPTIMIZE.", "That's mergeSchema / WITH SCHEMA EVOLUTION."])
ch.tf(2, 3, ["concept"], "Checkpoint V2 is a newer checkpoint design aimed at better scalability and concurrency for large or frequently updated tables.", True,
      "Checkpoints summarize log state in Parquet-based structures; V2 improves how that works at scale. You still shouldn't depend on when checkpoints are written.")
ch.tf(9, 2, ["concept"], "Besides SQL MERGE and `DeltaTable.merge`, modern PySpark/Databricks also has a DataFrame `mergeInto()` API — all implement the same source-target matching model.", True,
      "Different APIs, same semantics: ON condition + matched / not matched / not matched by source clauses. Learn SQL MERGE and DeltaTable first — they dominate existing production code.")

# ---- extra code drills ----
ch.cloze(9, 2, ["syntax"], "Complete the Python MERGE.",
         """
         from delta.tables import [[DeltaTable]]

         target = DeltaTable.[[forName]](spark, "prod.silver.customers")
         (target.alias("t")
            .[[merge]](source.alias("s"), "t.id = s.id")
            .[[whenMatchedUpdate]](set={"name": "s.name", "city": "s.city"})
            .[[whenNotMatchedInsert]](values={"id": "s.id", "name": "s.name", "city": "s.city"})
            .[[execute]]())
         """, "forName loads the table by catalog name; merge(source, condition) starts the builder; whenMatchedUpdate/whenNotMatchedInsert mirror WHEN MATCHED / WHEN NOT MATCHED; execute() runs it.",
         bank=["forPath", "join", "whenMatchedInsert", "collect"], asCode=True)
ch.spotbug(8, 2, ["pitfall", "debug"], "The source `staging.customer_changes_today` holds only today's changed customers. Which line will cause data loss?",
           ["MERGE INTO prod.silver.customers t", "USING staging.customer_changes_today s", "ON t.id = s.id", "WHEN MATCHED THEN UPDATE SET *", "WHEN NOT MATCHED THEN INSERT *", "WHEN NOT MATCHED BY SOURCE THEN DELETE;"], [5],
           """
           MERGE INTO prod.silver.customers t
           USING staging.customer_changes_today s
           ON t.id = s.id
           WHEN MATCHED THEN UPDATE SET *
           WHEN NOT MATCHED THEN INSERT *;
           """,
           "With an incremental source, every customer not changed today is 'not matched by source' and gets deleted. Only use that clause when the source is a full authoritative snapshot.")
ch.spotbug(3, 2, ["concept", "pitfall"], "A colleague's 'mental model' notes for an UPDATE of row 2 in file A (rows 1–3). Which line is wrong?",
           ["1. Find files containing order_id = 2 (file A)", "2. Open A.parquet and overwrite row 2's bytes in place", "3. Commit to _delta_log as a new version", "4. Old snapshots still see the old row 2"], [1],
           "2. Write a new file B (rows 1, 3 unchanged + new row 2) — or a DV + supplemental file — then commit REMOVE A + ADD B",
           "Parquet files are immutable. Delta writes new data (copy-on-write rewrite or deletion vector + supplemental file) and swaps it in atomically; that's also why old snapshots still work.")
ch.cloze(10, 2, ["concept"], "Optimistic concurrency in one sentence.",
         "Each writer [[reads]] a consistent snapshot, [[writes]] candidate files without locking, then [[validates]] against commits made since its snapshot and either [[commits]] a new atomic version or fails.",
         "READ → WRITE → VALIDATE → COMMIT. Conflicts are detected at the end, not prevented with locks up front.", bank=["locks", "vacuums", "merges"])

# ---- extra debug drills ----
ch.order(7, 2, ["debug"], "`VERSION AS OF 80` worked yesterday and fails today. Order your investigation.",
         ["Run DESCRIBE HISTORY on the table", "Check whether a VACUUM ran and with which retention", "Check whether v80's data files still exist (not just its history entry)", "Conclude: time travel isn't a backup — rely on a real backup for older states"],
         "History first, then the VACUUM and its retention, then the physical files. A history entry alone never proves a version is still queryable.")
ch.scenario(8, 2, ["debug", "pitfall"], "After the nightly MERGE into `prod.silver.customers`, the table dropped from 2 million rows to 3,000.", [
    ("What do you look at first?", [
        ("DESCRIBE HISTORY: the MERGE's operationMetrics (numTargetRowsDeleted)", True, "Confirms the MERGE deleted rows and how many."),
        ("DESCRIBE DETAIL numFiles", False, "File counts don't explain logical row loss."),
        ("Cluster event log", False, "Data loss is a logic issue, visible in history."),
    ]),
    ("The MERGE has WHEN NOT MATCHED BY SOURCE THEN DELETE. The source is 'today's changed customers'. Diagnosis?", [
        ("The clause treated the incremental batch as authoritative and deleted every customer not in it", True, "Exactly the documented danger."),
        ("A concurrency conflict deleted rows", False, "Conflicts fail transactions, they don't delete rows."),
        ("VACUUM removed the rows", False, "VACUUM never changes the current snapshot."),
    ]),
    ("Fix?", [
        ("RESTORE to the pre-MERGE version, then remove the clause (keep it only for full snapshots)", True, "Repair data, then fix semantics."),
        ("Re-run the MERGE twice", False, "Same result again."),
        ("Switch the source to INSERT OVERWRITE", False, "Another way to lose data."),
    ]),
], "NOT MATCHED BY SOURCE DELETE is only safe with a full authoritative snapshot as source.")
ch.order(8, 2, ["debug"], "Rows vanished after a MERGE. Order the response.",
         ["Check the MERGE for WHEN NOT MATCHED BY SOURCE THEN DELETE", "Determine whether the source is a full snapshot or incremental", "Read the MERGE's operationMetrics in DESCRIBE HISTORY", "RESTORE the last good version", "Remove or condition the clause"],
         "Find the clause, confirm the source semantics, quantify via metrics, restore, then fix the code so it can't recur.")

# =============== Playbooks ===============
ch.playbook(1, "MERGE fails: multiple source rows matched", 9,
            "MERGE aborts with `DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE` (\"multiple source rows matched target row\").",
            ["Is the target key really unique?", "Does my source contain duplicate keys (GROUP BY … HAVING COUNT(*) > 1)?", "Which source row is the latest for each key?", "Do I have a deterministic ordering field (event_sequence / updated_at / version)?", "Did I deduplicate before the MERGE, and does my ON (+ WHEN MATCHED conditions on DBR 16+) still allow multiple matches?"],
            [("Count duplicate keys in the source", "Confirms the ambiguity and shows which keys", "SELECT order_id, COUNT(*)\nFROM ecommerce.staging.orders_updates\nGROUP BY order_id\nHAVING COUNT(*) > 1;"),
             ("Pick the ordering field", "Makes the choice deterministic and retry-safe", None),
             ("Deduplicate with ROW_NUMBER", "Keep exactly one latest row per key", "ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY event_sequence DESC) AS rn  -- keep rn = 1"),
             ("Re-run MERGE using the deduplicated source", "No ambiguity → MERGE succeeds", None)],
            ["CDC feed delivers several events per key in one batch", "Source join fan-out created duplicates", "Target key not unique"],
            "Deduplicate the source by business key with a deterministic ordering field (ROW_NUMBER … rn = 1), then MERGE.",
            mnemonic="U-D-L-O-D-M: Unique? Dupes? Latest? Ordering field? Dedup! Merge!")
ch.playbook(2, "Someone broke the data", 5,
            "Data was correct at 09:00, wrong at 11:00 (e.g. `customer_id` suddenly NULL); corruption shows up in some version vN.",
            ["When was the data last known to be correct?", "Which versions were committed between good and bad (DESCRIBE HISTORY)?", "If I time-travel to the previous version, is it correct?", "Which operation, user/job and operationMetrics created the first bad version?", "Should I fix forward, or RESTORE to the last good version — and are its files still there?"],
            [("DESCRIBE HISTORY", "Lists versions, operations, users, metrics newest first", "DESCRIBE HISTORY prod.silver.orders;"),
             ("Compare good vs bad with time travel", "Pinpoints the exact version that broke", "SELECT * FROM prod.silver.orders VERSION AS OF 124;\nSELECT * FROM prod.silver.orders VERSION AS OF 125;"),
             ("Inspect the guilty operation", "Root cause: which job/user, which predicate", None),
             ("Repair", "RESTORE creates a new version equal to the good one", "RESTORE TABLE prod.silver.orders TO VERSION AS OF 124;")],
            ["Buggy job/UPDATE/MERGE", "Wrong source data merged", "Manual change by a user"],
            "Fix the job, then fix forward or `RESTORE TABLE … TO VERSION AS OF <good>` (new version, history kept).",
            mnemonic="H-C-B-R: History, Compare, Blame, Restore")
ch.playbook(3, "DELETE worked but storage didn't shrink", 7,
            "`DELETE` succeeded, queries don't return the rows, but cloud storage usage is unchanged (e.g. still ~10 TB).",
            ["Is this really a bug, or logical vs physical deletion?", "Are old files simply retained for snapshots/time travel?", "Are deletion vectors enabled, so rows are only masked inside still-current files?", "Has VACUUM run since, and has the retention window passed?", "Do I need REORG TABLE … APPLY (PURGE) first?"],
            [("Check history and table properties", "See DELETE/VACUUM operations and whether DVs are on", "DESCRIBE HISTORY orders;"),
             ("Purge DV-masked rows", "Rewrites files without soft-deleted rows", "REORG TABLE orders APPLY (PURGE);"),
             ("VACUUM after retention", "Physically removes unreferenced old files", "VACUUM orders;")],
            ["Logical delete ≠ physical deletion", "Files retained for time travel", "DV soft-deletes keep original files current"],
            "REORG TABLE … APPLY (PURGE), then VACUUM once retention has passed. Never shortcut with RETAIN 0 HOURS.",
            mnemonic="Logical ≠ Physical: PURGE then VACUUM")
ch.playbook(4, "Time travel to an old version stopped working", 7,
            "Yesterday `SELECT * FROM orders VERSION AS OF 80` worked; today it errors (files not found).",
            ["What does DESCRIBE HISTORY show — did a VACUUM run?", "With which retention?", "Do the data files of v80 still exist, or only its history entry?", "Is v80 still inside the 30-day log retention?"],
            [("DESCRIBE HISTORY orders", "Find a VACUUM operation and its parameters", "DESCRIBE HISTORY orders;"),
             ("Compare v80's age with retention settings", "7-day file retention vs 30-day log retention", None)],
            ["VACUUM removed files needed by v80", "Version older than retention", "Short custom retention"],
            "Accept that time travel isn't a backup; keep ≥7 days retention and use a real backup strategy for long-term recovery.",
            mnemonic="History entry ≠ files exist")
ch.playbook(5, "Concurrent write conflict (DELTA_CONCURRENT_WRITE)", 12,
            "MERGE/UPDATE fails with `DELTA_CONCURRENT_WRITE`, `ConcurrentAppendException`, `ConcurrentDeleteReadException`, `MetadataChangedException`…",
            ["What other writer touched this table at the same time?", "What rows/files/partitions did both operations read?", "Are my predicates too broad?", "Can I narrow the MERGE condition (e.g. a date bound)?", "Is a schema ALTER happening concurrently?", "Are deletion vectors / row-level concurrency available?", "Should the application retry after re-reading fresh state?"],
            [("DESCRIBE HISTORY around the failure time", "Identify the competing transaction", "DESCRIBE HISTORY prod.silver.orders;"),
             ("Narrow the read scope if semantically correct", "Smaller scan, smaller conflict domain", "ON t.id = s.id AND t.event_date = DATE'2026-09-16'"),
             ("Enable DVs / row-level concurrency where possible", "Different-row changes stop conflicting", "ALTER TABLE t SET TBLPROPERTIES ('delta.enableDeletionVectors' = true);"),
             ("Add retry-on-fresh-state for transient conflicts", "Legitimate conflicts resolve on retry", None)],
            ["Two jobs writing overlapping data", "Over-broad MERGE predicates", "Concurrent schema change", "File-level conflicts without DVs"],
            "Coordinate writers, narrow scopes, enable DV/RLC, retry after re-reading — never blind 'run until it works'.",
            mnemonic="Who-What-Wide-Schema-Rows-Retry")
ch.playbook(6, "Rows vanished after a MERGE", 8,
            "After a routine MERGE, most of the target table is gone; DESCRIBE HISTORY shows a MERGE with huge `numTargetRowsDeleted`.",
            ["Does the MERGE have WHEN NOT MATCHED BY SOURCE THEN DELETE?", "Is the source a full authoritative snapshot or just today's changes?", "What do the MERGE's operationMetrics show (rows deleted)?", "Which version was the last good one to RESTORE?"],
            [("DESCRIBE HISTORY", "Find the MERGE and its delete metrics", "DESCRIBE HISTORY prod.silver.customers;"),
             ("RESTORE the last good version", "New version equal to pre-MERGE state", "RESTORE TABLE prod.silver.customers TO VERSION AS OF 41;"),
             ("Remove/condition the clause", "Only use NOT MATCHED BY SOURCE with authoritative snapshots", None)],
            ["NOT MATCHED BY SOURCE DELETE with an incremental source"],
            "Restore, then drop the clause (or bound it with a condition) unless the source is a complete snapshot.",
            mnemonic="Absent ≠ deleted")

# =============== Pitfalls ===============
for t, x, f in [
    ("Physical files ≠ table", "Counting/reading .parquet files in the folder includes removed files.", "Trust the snapshot in `_delta_log`; query through the table."),
    ("REMOVE is not rm", "A remove action only drops the file from the snapshot.", "Expect files to remain until VACUUM after retention."),
    ("Relying on checkpoint frequency", "Checkpoint interval is an implementation detail.", "Never code against 'every N commits'."),
    ("Hand-editing _delta_log", "Editing/deleting commit JSONs breaks the protocol.", "Use RESTORE, UPDATE, DELETE, MERGE, ALTER, VACUUM, OPTIMIZE."),
    ("'UPDATE always rewrites the whole file'", "Outdated with deletion vectors.", "Delta chooses rewrite or DV + supplemental data."),
    ("Table features break old clients", "Enabling DVs etc. can upgrade the protocol.", "Check reader compatibility before enabling."),
    ("Time travel ≠ backup", "7-day file retention and 30-day log retention limit history.", "Use a real backup strategy."),
    ("RESTORE deletes history?", "No — it appends a new version.", "Expect vN+1 equal to the restored state."),
    ("VACUUM ≠ OPTIMIZE", "VACUUM deletes old unreferenced files; it doesn't compact.", "Use OPTIMIZE for layout, VACUUM for cleanup."),
    ("VACUUM RETAIN 0 HOURS", "Breaks time travel, long-running readers/writers, recovery.", "Keep ≥ 7 days and the safety check enabled."),
    ("Storage didn't shrink after DELETE", "Logical delete ≠ physical deletion (DVs mask rows).", "REORG … APPLY (PURGE) then VACUUM."),
    ("NOT MATCHED BY SOURCE DELETE on incremental source", "Deletes everything not in today's batch.", "Only with authoritative full snapshots."),
    ("Duplicate keys in MERGE source", "Ambiguous match → MERGE fails.", "Dedup with ROW_NUMBER by ordering field."),
    ("UPDATE … FROM … JOIN", "Not supported in Databricks SQL.", "Use MERGE INTO."),
    ("'Run it again until it works'", "Hides real concurrency causes.", "Investigate writers/scope; retry only after fresh read."),
    ("Concurrency error = corruption?", "No — it's protection against an unsafe commit.", "Find the competing writer."),
]:
    ch.pit(t, x, f)

# =============== Flashcards ===============
for s, q, a in [
    (1, "Delta = ?", "Parquet data files + versioned transaction log (`_delta_log`) → ACID table semantics."),
    (1, "Commit file name format?", "20-digit zero-padded version + .json, e.g. `00000000000000000003.json`."),
    (1, "What is the 'table' in Delta?", "The set of logical files the log says belong to the current snapshot."),
    (1, "50 physical files, snapshot lists 37 → current files?", "37."),
    (1, "What can an `add` action contain?", "path, size, dataChange, partition values, modification time, file stats (numRecords, min/max)."),
    (2, "What is a snapshot?", "Table state at a version = replay of log actions (from a checkpoint)."),
    (2, "MVCC in Delta?", "Readers pick one consistent snapshot via the log; writers create new versions."),
    (2, "Does REMOVE delete the file?", "No — tombstone; physical deletion later via VACUUM."),
    (2, "Checkpoint purpose?", "Parquet-based summary of state so readers don't replay from v0."),
    (2, "Checkpoint V2?", "Newer checkpoint design for scalability/concurrency on large, frequently updated tables."),
    (3, "Classic UPDATE mechanism?", "Copy-on-write: write new file B, commit REMOVE A + ADD B."),
    (3, "DELETE without WHERE?", "Logically deletes all rows; table object stays."),
    (4, "Deletion vector?", "Metadata marking specific rows of a file as deleted, avoiding immediate rewrite."),
    (4, "Which ops do DVs speed up?", "DELETE, UPDATE, MERGE."),
    (4, "Enable DVs?", "`ALTER TABLE t SET TBLPROPERTIES ('delta.enableDeletionVectors' = true)`."),
    (4, "Physically purge DV-deleted rows?", "`REORG TABLE t APPLY (PURGE)` then `VACUUM` after retention."),
    (5, "DESCRIBE HISTORY order & content?", "Newest first: version, timestamp, user, operation, operationParameters, operationMetrics."),
    (5, "Time travel SQL?", "`SELECT … FROM t VERSION AS OF n` / `TIMESTAMP AS OF '…'`."),
    (5, "Time travel PySpark?", "`spark.read.option('versionAsOf', n).table('t')` (or timestampAsOf)."),
    (5, "Default log retention?", "30 days (`delta.logRetentionDuration`)."),
    (6, "RESTORE vs time travel?", "Time travel reads old snapshot; RESTORE makes it current via a NEW version."),
    (6, "Current v10, RESTORE to v7 → ?", "v11 (state = v7); v8–v10 remain in history."),
    (6, "Is time travel a backup?", "No — finite retention + VACUUM."),
    (7, "VACUUM default retention?", "7 days = RETAIN 168 HOURS."),
    (7, "VACUUM does what?", "Physically deletes old unreferenced files beyond retention (garbage collection)."),
    (7, "Why not RETAIN 0 HOURS?", "Breaks time travel, long-running readers/writers, recovery; safety check blocks it."),
    (7, "DELETE done, storage same — why?", "Logical ≠ physical; files kept for history; DVs mask rows in current files."),
    (8, "WHEN NOT MATCHED BY SOURCE allows?", "UPDATE or DELETE (not INSERT)."),
    (8, "Danger of NOT MATCHED BY SOURCE DELETE?", "With an incremental source it deletes legit rows missing from the batch."),
    (8, "MERGE's three cases?", "MATCHED (both), NOT MATCHED (source only), NOT MATCHED BY SOURCE (target only)."),
    (9, "MERGE error with duplicate source keys?", "Multiple source rows matched the same target row → ambiguous → fail."),
    (9, "Dedup pattern?", "ROW_NUMBER() OVER (PARTITION BY key ORDER BY seq DESC), keep rn = 1."),
    (9, "DBR 16.0+ duplicate-match rule?", "Considers ON + relevant WHEN MATCHED conditions (≤15.4 LTS: ON only)."),
    (9, "UPDATE … FROM … JOIN on Databricks?", "Not supported → use MERGE INTO."),
    (9, "Python MERGE entry point?", "`DeltaTable.forName(spark, name).alias('t').merge(src.alias('s'), cond)…execute()`."),
    (10, "OCC phases?", "READ → WRITE → VALIDATE → COMMIT."),
    (10, "Why 'optimistic'?", "Assumes no conflict; checks only at commit."),
    (11, "Default write isolation?", "WriteSerializable (reads: snapshot isolation)."),
    (11, "Different rows, same file — conflict?", "Not necessarily: DVs + row-level concurrency let them coexist."),
    (11, "Same row by two writers?", "Real conflict: one commits, other fails/serializes."),
    (12, "MetadataChangedException cause?", "Concurrent metadata change: ALTER TABLE or schema-evolving write."),
    (12, "Concurrency exception = corrupted table?", "No — OCC prevented an unsafe commit."),
    (12, "How to shrink conflict domain of a MERGE?", "Narrow ON with a semantically correct bound (e.g. event_date)."),
]:
    ch.card(s, q, a)

ch.dump(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch05.json"),
        num=5, title="Delta Lake Internals", subtitle="How SQL commands become files + transaction-log commits",
        emoji="🔺", sourcePages="132–179, 358–402 (internals parts)",
        mantra="Every Delta write = read a snapshot, write new files (or deletion vectors), validate optimistically, and commit one atomic log version.",
        objectives=[
            "You can replay a Delta log in your head and say which files form any snapshot.",
            "You can explain how UPDATE/DELETE become file rewrites or deletion vectors.",
            "You can use DESCRIBE HISTORY, time travel and RESTORE to investigate and repair bad data.",
            "You can explain why time travel is not a backup and how VACUUM retention affects it.",
            "You can write correct MERGE statements (SQL + Python), including NOT MATCHED BY SOURCE, and deduplicate CDC sources.",
            "You can explain optimistic concurrency, isolation levels and row-level concurrency.",
            "You can debug MERGE failures, concurrency exceptions, 'storage didn't shrink' and 'time travel broke'.",
        ])
print("written")
