from qhelp import *


def add_sections(ch):
    # ---------------- s01 ----------------
    ch.section(1, "Anatomy of a Delta Table", "A Delta table is not 'a folder of Parquet files' — it is whatever the transaction log says it is.", [
        P("Zoom in on the bottom of the Databricks stack. Today we open the **Delta table** box and look at files and commits."),
        F("Notebook / SQL / Job", "Compute", "Spark / Photon", "Delta tables", "Cloud storage", caption="The stack from the previous chapter — we now open 'Delta tables'"),
        P("Goal: when you see a `MERGE`, an `UPDATE`, a concurrency error or a `VACUUM`, you can **predict** what happens to the data files and to `_delta_log`. Not just recite 'Delta = Parquet + log'."),
        P("**Delta Lake** is the default table format in Databricks. It extends Parquet data files with a **versioned transaction log**, which gives ACID semantics, metadata management, batch/streaming interoperability and table versioning."),
        C("""
        CREATE TABLE dev_training.sales.orders (
          order_id    BIGINT,
          customer_id BIGINT,
          amount      DECIMAL(10,2),
          status      STRING
        )
        USING DELTA;
        """, caption="A plain e-shop orders table"),
        D("""
        orders/
        ├── part-00000-....parquet      <- columnar data
        ├── part-00001-....parquet
        ├── part-00002-....parquet
        └── _delta_log/                 <- versioned table state
            ├── 00000000000000000000.json   (version 0)
            ├── 00000000000000000001.json   (version 1)
            ├── 00000000000000000002.json   (version 2)
            └── ...
        """, caption="What the storage layer conceptually holds"),
        TERMS(
            ("part-*.parquet", "The **data files**: real rows, stored column by column (Parquet)."),
            ("_delta_log/", "Folder holding the **versioned state** of the table: one JSON commit file per version."),
            ("Commit file", "A JSON file named with a **20-digit zero-padded** version number, e.g. `00000000000000000003.json`."),
            ("Version", "Each normal commit creates a new **atomic** version with a monotonically increasing number: 0, 1, 2, 3…"),
            ("Action", "One entry inside a commit (e.g. `add`, `remove`). A commit = an atomic set of actions that turns the previous snapshot into the next."),
        ),
        P("Example: `CREATE TABLE` was version 0. Now you insert two orders:"),
        C("""
        INSERT INTO dev_training.sales.orders VALUES
          (1, 101, 20.00, 'NEW'),
          (2, 102, 30.00, 'NEW');
        """),
        D("""
        part-A.parquet
        order_id | customer_id | amount | status
        ---------+-------------+--------+-------
               1 |         101 |  20.00 | NEW
               2 |         102 |  30.00 | NEW

        _delta_log/00000000000000000001.json
          version 1:  ADD part-A.parquet
        """, caption="One INSERT -> one new data file + one commit"),
        C("""
        {
          "add": {
            "path": "part-A.parquet",
            "size": 12345,
            "dataChange": true
          }
        }
        """, lang="text", caption="Very simplified add action (real JSON is richer)"),
        P("A real `add` action can also carry **partition values**, **modification time** and **file-level statistics** (record count, min/max per column). Those stats power data skipping (Chapter 6)."),
        CO("key", "The first big idea", "The table is **the set of logical files that the transaction log says belong to the current snapshot** — not every `.parquet` file sitting in the folder.\n`physical storage ≠ logical current table state`"),
        R("Think first: storage has A.parquet, B.parquet, C.parquet but the current snapshot lists only A and C. Is B part of the table?",
          "**No.** B may be an old file still needed for time travel, or one waiting to be cleaned up by `VACUUM`. A `SELECT` on the current version never reads it."),
        D("""
          Parquet files
        + optional deletion vectors
        + _delta_log versions (JSON commits)
        + checkpoints
        ---------------------------------
        = Delta table state
        """, caption="Storage-side formula to make instinctive"),
        CO("interview", "\"Parquet already stores data, so why do I need Delta?\"", "Parquet defines a **columnar file format**, but it does not define **transactional table state across many files**. Delta adds a versioned transaction log, atomic commits, snapshot isolation, schema enforcement/evolution, DML (`MERGE`/`UPDATE`/`DELETE`), concurrency control, history/time travel and physical optimization features over those files."),
    ])

    # ---------------- s02 ----------------
    ch.section(2, "Snapshots, ADD/REMOVE & Checkpoints", "A snapshot is just the result of replaying the log — once you can replay it in your head, Delta stops being magic.", [
        P("A **snapshot** is the table as of one version. You get it by **replaying** the log actions from the start (or from a checkpoint)."),
        D("""
        v0:  ADD A, ADD B        -> {A, B}
        v1:  REMOVE A, ADD C     -> {B, C}
        v2:  ADD D               -> {B, C, D}
        """, caption="Replay the log to compute each snapshot"),
        P("So `SELECT * FROM t VERSION AS OF 2` must read exactly **{B, C, D}** — the files of that snapshot, not whatever is current today."),
        CO("key", "MVCC", "Delta uses **MVCC (multi-version concurrency control)**: every reader picks one consistent snapshot through the transaction log and reads only its files."),
        CMP(
            ("ADD file", ["This logical file now **participates** in the snapshot.", "Written by INSERT, UPDATE, MERGE, OPTIMIZE…"]),
            ("REMOVE file", ["This file **no longer participates** in the current snapshot.", "Is **NOT** `rm file` — the bytes stay on storage.", "Kept as a **tombstone** for a while."]),
        ),
        P("Why keep removed files around? So that **older snapshots** and **concurrent readers** that started earlier keep working. Physical deletion happens later, typically via **VACUUM**."),
        L("Snapshot isolation for readers that started before the change", "Concurrent readers still mid-query", "Time travel to older versions", "Recovery / history semantics — until retention expires and cleanup runs", ordered=False),
        CO("analogy", "Library catalogue", "The data files are books on the shelves; the log is the **catalogue**. 'REMOVE' crosses a book out of the catalogue — the book stays on the shelf until the cleaner (VACUUM) comes."),
        P("**Problem:** a table with 1,000,000 commits. If every reader replayed v0 → v1 → … → v1,000,000, query planning would be painfully slow."),
        D("""
        v0.json  v1.json ... v100.checkpoint  v101.json  v102.json  v103.json
                                  │              │          │          │
        snapshot v103 = load checkpoint v100 + replay 101 + 102 + 103
        (NOT replay 0 → 103)
        """, caption="Checkpoints summarize the log up to a version"),
        P("A **checkpoint** stores a summary of table state up to some version in **Parquet-based** structures. **Checkpoint V2** is designed for better scalability and concurrency on large / frequently updated tables."),
        CO("exam", "Don't rely on checkpoint frequency", "The exact checkpoint interval is an **implementation/performance detail** that Databricks may adjust. Application code must never assume 'a checkpoint every exactly N commits'."),
        CO("pitfall", "Never hand-edit `_delta_log`", "Do not edit `00000000000000000152.json` or delete transaction files to 'fix' a table. The log **is** the transactional protocol. Use supported commands: `UPDATE`, `DELETE`, `MERGE`, `RESTORE`, `ALTER TABLE`, `VACUUM`, `OPTIMIZE` and the supported APIs."),
        ASK("Ask yourself when a file exists but a query doesn't read it",
            "Is this file referenced by the current snapshot, or only by older versions?",
            "Was it removed by an UPDATE/DELETE/MERGE/OPTIMIZE commit (tombstone)?",
            "Is it just waiting for VACUUM after the retention window?"),
    ])

    # ---------------- s03 ----------------
    ch.section(3, "UPDATE & DELETE: Copy-on-Write", "Object storage has no 'database pages' — so how can a row change? By swapping files atomically.", [
        P("Delta supports SQL DML. Logically an `UPDATE` means:"),
        F("Find matching rows", "Change current table state", "Commit a new Delta version"),
        C("""
        UPDATE dev_training.sales.orders
        SET status = 'SHIPPED'
        WHERE order_id = 2;
        """),
        R("Before you read on: why can't Delta just open the Parquet file and change the bytes of row 2?",
          "Parquet files are **immutable**, compressed, columnar blobs on object storage. Changing one value in place is not supported — and readers using the old snapshot still need the old file."),
        P("The classic Delta mechanism is **copy-on-write**: write a new file containing the changed row plus the untouched rows, then swap files in one commit."),
        D("""
        A.parquet (old)          B.parquet (new)
        1 | 20 | NEW             1 | 20 | NEW
        2 | 30 | NEW      ==>    2 | 30 | SHIPPED
        3 | 40 | NEW             3 | 40 | NEW

        commit:  REMOVE A  +  ADD B
        before: snapshot -> A      after: snapshot -> B
        """, caption="UPDATE via file rewrite (the first mental model)"),
        P("A more realistic **conditional update** from the e-shop: late shipments get a 5% discount."),
        C("""
        UPDATE ecommerce.silver.orders
        SET
          status = 'LATE',
          amount = amount * 0.95
        WHERE status = 'SHIPPING'
          AND order_ts < current_timestamp() - INTERVAL 7 DAYS;
        """),
        P("**DELETE** is just as simple. With a predicate, or without one — which logically deletes **all rows** (the table itself stays)."),
        C("""
        DELETE FROM dev_training.sales.orders
        WHERE status = 'CANCELLED';

        -- no WHERE: logically removes every row
        DELETE FROM dev_training.sales.orders;
        """),
        P("`DELETE` on Delta supports fairly complex predicates and subqueries (with some limitations)."),
        D("""
        before            after
        1 NEW             1 NEW
        2 CANCELLED  ==>  3 SHIPPED
        3 SHIPPED
        """, caption="State changes atomically"),
        CO("key", "Atomic = no half states", "No reader may ever see 'half old + half new'. A reader sees the whole old snapshot or the whole new one."),
        CO("warn", "Logical removal ≠ physical removal", "After `DELETE`, the old files can stay on storage (history/time travel) until `VACUUM` runs."),
        CO("interview", "Why UPDATE/DELETE matter in a lakehouse", "On plain Parquet folders, mutation semantics are hard. With Delta, `UPDATE`, `DELETE` and `MERGE` are **transactional** operations — that's why we say Delta gives **database-like table semantics on object storage**."),
    ])

    # ---------------- s04 ----------------
    ch.section(4, "Deletion Vectors", "Rewriting a 1 GB file to delete one row is absurd — deletion vectors fix that.", [
        P("Picture a huge Parquet file: **1 GB, 2,000,000 rows**. You want to delete **1 row**. The naïve copy-on-write model does:"),
        F("Read huge file", "Rewrite almost all of it", "REMOVE old file", "ADD replacement file", caption="Very expensive for one row"),
        P("Databricks has **deletion vectors (DV)**: instead of immediately rewriting the file, Delta records *which rows* are logically deleted."),
        D("""
        A.parquet  +  DV: "row 72832 is logically deleted"

        read A  ->  apply deletion vector  ->  don't return row 72832
        """, caption="Merge-on-read: the file stays, a small marker hides rows"),
        P("DVs can speed up **DELETE, UPDATE and MERGE**. For an `UPDATE`, the old row version is marked deleted in the DV and the new row version is written to a small **supplemental data file**."),
        CMP(
            ("Without DV", ["delete one row", "→ rewrite the whole Parquet file", "expensive write, simple read"]),
            ("With DV", ["data file remains", "+ metadata marks the row as deleted", "cheap write; reads apply the DV"]),
        ),
        P("So we correct our mental model. 'UPDATE one row → always rewrite the whole file' is **no longer generally true**:"),
        D("""
        logical table change
                │
        Delta chooses an implementation
                ├── file rewrite (copy-on-write)
                └── deletion vector + supplemental data
        (depends on table features / runtime / engine)
        """),
        P("DVs must be **enabled on the table**. Databricks recommends them unless you have a compatibility constraint with older clients."),
        C("""
        ALTER TABLE dev_training.sales.orders
        SET TBLPROPERTIES (
          'delta.enableDeletionVectors' = true
        );
        """),
        CO("warn", "Table features upgrade the protocol", "Enabling table features (like DVs) can **upgrade the Delta protocol** and make the table incompatible with older Delta clients/readers."),
        R("Think first: a 3 GB Parquet file, you delete 2 rows. Why is a DV much cheaper than an immediate rewrite?",
          "The engine just records that those 2 rows are logically deleted. It does **not** rewrite the other millions of rows of the 3 GB file right now."),
        P("Physically purging DV-soft-deleted data needs two steps: rewrite the affected files, then clean up the old ones after retention."),
        C("""
        REORG TABLE dev_training.sales.orders APPLY (PURGE);
        -- ...after the required retention period:
        VACUUM dev_training.sales.orders;
        """, caption="Physical purge of soft-deleted rows"),
        CO("tip", "DVs also help concurrency", "Because a row change doesn't always need a full file rewrite, two writers touching **different rows of the same file** can avoid conflicts (row-level concurrency, section 11)."),
    ])

    # ---------------- s05 ----------------
    ch.section(5, "DESCRIBE HISTORY & Time Travel", "'The data broke around noon' — history + time travel turn that panic into a 3-query investigation.", [
        P("**DESCRIBE HISTORY** is your first Delta debugging tool. It lists table versions in **reverse chronological order** with operation metadata."),
        C("DESCRIBE HISTORY dev_training.sales.orders;"),
        T(["version", "timestamp", "operation"], [["8", "12:30", "MERGE"], ["7", "12:10", "UPDATE"], ["6", "11:00", "WRITE"], ["5", "10:00", "DELETE"]], caption="Conceptual output (newest first)"),
        TERMS(
            ("version / timestamp", "Which commit, and when."),
            ("user", "Who (or which identity) ran it."),
            ("operation", "WRITE, MERGE, UPDATE, DELETE, RESTORE, OPTIMIZE…"),
            ("operationParameters", "e.g. the MERGE predicate, write mode."),
            ("operationMetrics", "e.g. rows inserted/updated/deleted, files added/removed."),
        ),
        P("History retention (the log) is **30 days by default** (`delta.logRetentionDuration`)."),
        CO("debug", "Don't start by guessing", "Someone says 'data broke around 12'. Run `DESCRIBE HISTORY` and look for: **which operation** changed the table, **who**, **when**, **what metrics** it had."),
        P("**Time travel** reads an older snapshot. It never changes the current table."),
        C("""
        SELECT * FROM dev_training.sales.orders VERSION AS OF 5;

        SELECT * FROM dev_training.sales.orders
        TIMESTAMP AS OF '2026-09-15 10:00:00';
        """),
        C("""
        old_df = (
            spark.read
                 .option("versionAsOf", 121)
                 .table("ecommerce.silver.orders")
        )
        # by time instead: .option("timestampAsOf", "2026-09-26 10:00:00")
        # path-based equivalents exist where appropriate
        """, lang="python", caption="Time travel from PySpark"),
        P("Real debugging workflow — 'today `customer_id` became null':"),
        C("""
        SELECT * FROM prod.silver.orders VERSION AS OF 124;  -- looks right
        SELECT * FROM prod.silver.orders VERSION AS OF 125;  -- broken!
        DESCRIBE HISTORY prod.silver.orders;  -- which operation made v125?
        """),
        F("DESCRIBE HISTORY", "Compare good vs bad version", "Find the operation that created the bad version", "Fix or RESTORE", caption="History-driven debugging"),
        ASK("Ask yourself when 'someone broke the data'",
            "When was the data last known to be correct?",
            "Which version(s) were committed between 'good' and 'bad' in DESCRIBE HISTORY?",
            "What operation, by which user/job, created the first bad version — and what do its operationMetrics say?",
            "If I time-travel to the previous version, is the data correct there?",
            "Do I fix forward, or RESTORE to the last good version?"),
    ])

    # ---------------- s06 ----------------
    ch.section(6, "RESTORE & Why Time Travel Is Not a Backup", "RESTORE rolls the table forward to an old state — and history has an expiry date.", [
        CMP(
            ("Time travel", ["`SELECT … VERSION AS OF n`", "**Reads** an old snapshot", "Current table unchanged", "No new version"]),
            ("RESTORE", ["`RESTORE TABLE … TO VERSION AS OF n`", "Makes an old state **current again**", "Creates a **new** version", "Logged in history as RESTORE"]),
        ),
        C("""
        RESTORE TABLE prod.silver.orders TO VERSION AS OF 124;

        RESTORE TABLE prod.silver.orders
        TO TIMESTAMP AS OF '2026-09-15 10:00:00';
        """),
        D("""
        v124  good
        v125  bad
        v126  RESTORE  (state equivalent to v124)
        """, caption="RESTORE does not delete history — it appends"),
        CO("key", "History stays history", "Restoring v124 while current is v125 does **not** delete v125. A new transaction (v126) is committed whose state equals v124. Restore to v7 from v10 → you get **v11**."),
        R("Think first: why is it GOOD that RESTORE appends a version instead of deleting the bad ones?",
          "You keep a full audit trail (who restored, when) and you can still inspect — or even return to — the 'bad' versions while investigating."),
        P("Now the classic exam/interview trap: **time travel is not a backup**. Databricks says explicitly not to use table history as a long-term backup strategy."),
        T(["Retention", "Default", "Controls"], [
            ["Deleted data files (VACUUM threshold)", "7 days", "`delta.deletedFileRetentionDuration`"],
            ["Transaction-log history", "30 days", "`delta.logRetentionDuration`"],
        ], caption="Two different clocks"),
        P("To time travel to version N you need **both** the log entries of N **and** the data files of N. VACUUM can delete the files even while the history entry is still visible."),
        D("""
        history metadata exists
                 ≠
        all old data files still exist
        """),
        CO("exam", "Trap: 'Delta history = backup'", "False. Retention and VACUUM limit history/time travel. For real backups use a proper backup/replication strategy (e.g. deep copies to another location)."),
    ])

    # ---------------- s07 ----------------
    ch.section(7, "VACUUM: Physical Garbage Collection", "DELETE makes rows disappear from queries; VACUUM makes bytes disappear from storage.", [
        D("""
        v0 -> {A, B}
        v1 -> {B, C}
        v2 -> {C, D}       current snapshot = {C, D}
        physically on storage: A  B  C  D
        """, caption="Why old files pile up"),
        P("A and B may still be needed for older snapshots. After the retention interval, **VACUUM** removes files that are no longer referenced by any version inside the retention window."),
        C("""
        VACUUM dev_training.sales.orders;                  -- default 7 days
        VACUUM dev_training.sales.orders RETAIN 168 HOURS; -- 168 h = 7 days
        """),
        CMP(
            ("VACUUM", ["garbage collection", "physically deletes old **unreferenced** files", "no new data layout"]),
            ("NOT VACUUM's job", ["compacting small files → that is **OPTIMIZE** (Chapter 6)", "making queries faster", "changing the current snapshot"]),
        ),
        CO("pitfall", "Never `VACUUM … RETAIN 0 HOURS` blindly", "Deleting old/uncommitted files too early can break **time travel**, **long-running readers**, **long-running writers** (whose not-yet-committed files look 'unreferenced') and **recovery**. Databricks recommends at least 7 days and has a safety check (`spark.databricks.delta.retentionDurationCheck.enabled`) that blocks dangerously short retention."),
        CO("exam", "Red flag answer", "\"I want to save storage, so `VACUUM RETAIN 0 HOURS` every hour.\" → always wrong in an exam."),
        P("**Production bug: DELETE worked, storage didn't shrink.** A 10 TB table; you delete everything before 2020. Queries no longer return those rows, yet storage stays near 10 TB."),
        C("""
        DELETE FROM orders WHERE event_date < DATE'2020-01-01';
        """),
        L("Logical delete ≠ immediate physical file deletion.", "Old files are kept for snapshots/time travel.", "With DVs, the **original file may still be the current physical input**, with the deleted rows merely masked.", "Physical purge: `REORG TABLE … APPLY (PURGE)`, then `VACUUM` once the retention has passed."),
        ASK("Ask yourself when storage didn't shrink after DELETE",
            "Is this actually a bug, or just logical vs physical deletion?",
            "Are deletion vectors enabled, so rows are only masked inside still-current files?",
            "Has VACUUM run since the delete — and has the retention window passed?",
            "Do I need REORG TABLE … APPLY (PURGE) before VACUUM?"),
        P("**Production bug: time travel stopped working.** Yesterday `SELECT * FROM orders VERSION AS OF 80` worked; today it fails."),
        ASK("Ask yourself when an old version is no longer queryable",
            "What does DESCRIBE HISTORY show — did a VACUUM run?",
            "With which retention?",
            "Do the data files of v80 still exist, or only its history entry?"),
        CO("key", "History entry ≠ queryable version", "VACUUM can remove physical files required by older versions, so a visible history entry doesn't guarantee that version is still readable."),
    ])

    # ---------------- s08 ----------------
    ch.section(8, "MERGE Fundamentals", "MERGE is the most important Delta command for a data engineer: one atomic statement for insert + update + delete.", [
        P("Target `prod.silver.customers` holds Maria/Athens, John/Patras, Anna/Volos. A source batch arrives: John moved to Athens, George (id 4) is new."),
        T(["", "id", "name", "city", "→ action"], [
            ["target", "1", "Maria", "Athens", "untouched"],
            ["target", "2", "John", "Patras", "UPDATE to Athens"],
            ["target", "3", "Anna", "Volos", "untouched"],
            ["source", "2", "John", "Athens", "matches id 2"],
            ["source", "4", "George", "Larisa", "INSERT"],
        ], caption="UPDATE + INSERT = upsert"),
        C("""
        MERGE INTO prod.silver.customers AS target
        USING staging.customer_updates AS source
        ON target.id = source.id
        WHEN MATCHED THEN
          UPDATE SET
            target.name = source.name,
            target.city = source.city
        WHEN NOT MATCHED THEN
          INSERT (id, name, city)
          VALUES (source.id, source.name, source.city);
        """, caption="Basic upsert"),
        TERMS(
            ("TARGET", "The real table I want to change."),
            ("SOURCE", "The new data."),
            ("ON", "When a source row and a target row are considered **the same entity**."),
        ),
        D("""
                         source row
                             │
              does target contain a matching key?
                   ┌─────────┴─────────┐
                  YES                  NO
                   │                   │
             WHEN MATCHED        WHEN NOT MATCHED
           (UPDATE / DELETE)        (INSERT)

           target row with NO matching source row
                             │
                 WHEN NOT MATCHED BY SOURCE
                     (UPDATE / DELETE)
        """, caption="MERGE as a Venn diagram: 3 cases"),
        P("**WHEN NOT MATCHED BY SOURCE**: the target row exists but the source doesn't have it. Target {1,2,3,4}, source {1,2,4} → row 3. Allowed actions: **UPDATE or DELETE** (never INSERT — there's no source row to insert)."),
        C("""
        MERGE INTO target t
        USING source s
        ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
        WHEN NOT MATCHED BY SOURCE THEN DELETE;
        """, caption="Full sync against an authoritative snapshot"),
        CO("pitfall", "NOT MATCHED BY SOURCE + incremental source = disaster", "If the source is only **'today's changed records'** (not a full authoritative snapshot), `WHEN NOT MATCHED BY SOURCE THEN DELETE` deletes almost the **entire** target. Know the **semantics of your source**, not just the syntax."),
        ASK("Ask yourself when rows vanished after a MERGE",
            "Does the MERGE contain WHEN NOT MATCHED BY SOURCE THEN DELETE?",
            "Is the source a full authoritative snapshot, or only today's changes?",
            "What do the MERGE's operationMetrics in DESCRIBE HISTORY say about deleted rows?",
            "Which version is the last good one to RESTORE?"),
        P("`UPDATE SET *` / `INSERT *` are handy when source and target schemas are compatible:"),
        C("""
        MERGE INTO target t
        USING source s
        ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *;
        """),
        P("In production you often prefer **explicit mapping**, so you know exactly which columns change (and can add audit columns):"),
        C("""
        UPDATE SET
          t.name       = s.name,
          t.city       = s.city,
          t.updated_at = current_timestamp()
        """),
        CO("interview", "Why MERGE matters for CDC", "A change feed usually contains inserts, updates and deletes for existing entities. `MERGE` applies all of them to the target **atomically** in one transaction — a Delta-only DML for insert/update/delete based on matching conditions."),
    ])

    # ---------------- s09 ----------------
    ch.section(9, "MERGE in Practice: Duplicates, Dedup, Python", "The #1 MERGE failure in production is a duplicated key in the source — learn to spot and fix it in seconds.", [
        P("Hands-on first. Build this and run it — then look at `DESCRIBE HISTORY` and you'll see a **MERGE** version."),
        C("""
        CREATE TABLE IF NOT EXISTS dev_training.silver.customers (
          customer_id BIGINT, name STRING, city STRING, updated_at TIMESTAMP
        ) USING DELTA;

        INSERT INTO dev_training.silver.customers VALUES
          (1, 'Maria', 'Athens', current_timestamp()),
          (2, 'John',  'Patras', current_timestamp()),
          (3, 'Anna',  'Volos',  current_timestamp());

        CREATE OR REPLACE TABLE dev_training.staging.customer_updates AS
        SELECT * FROM VALUES
          (2L, 'John',   'Athens'),
          (4L, 'George', 'Larisa')
        AS t(customer_id, name, city);

        MERGE INTO dev_training.silver.customers AS t
        USING dev_training.staging.customer_updates AS s
        ON t.customer_id = s.customer_id
        WHEN MATCHED THEN UPDATE SET
          t.name = s.name, t.city = s.city, t.updated_at = current_timestamp()
        WHEN NOT MATCHED THEN INSERT (customer_id, name, city, updated_at)
          VALUES (s.customer_id, s.name, s.city, current_timestamp());

        DESCRIBE HISTORY dev_training.silver.customers;
        """, caption="Result: 1 Maria Athens · 2 John Athens · 3 Anna Volos · 4 George Larisa"),
        P("**The duplicate-match problem.** Target has id=7. The source has id=7/Athens **and** id=7/Volos. Which city should win?"),
        D("""
        source: id=7 city=Athens seq=10
                id=7 city=Volos  seq=11      target: id=7
        MERGE ... ON target.id = source.id WHEN MATCHED THEN UPDATE
        -> Athens? Volos?  ambiguous -> FAIL
        """),
        P("There is no single answer, so the MERGE fails with a **multiple source rows matched** error (`DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE`). Databricks requires you to **preprocess the source** so no ambiguous matches exist."),
        CO("exam", "Runtime detail", "From **DBR 16.0+**, duplicate-match detection considers the `ON` condition **and** the relevant `WHEN MATCHED` conditions. **15.4 LTS and below** used only the `ON` condition."),
        P("Fix: keep only the **latest** change per key with a window function (CDC + window functions + MERGE in one real pattern)."),
        C("""
        WITH ranked AS (
          SELECT *,
                 ROW_NUMBER() OVER (
                   PARTITION BY id
                   ORDER BY seq DESC
                 ) AS rn
          FROM staging.customer_changes
        )
        SELECT * FROM ranked WHERE rn = 1;   -- then MERGE using this
        """, caption="SQL dedup: latest event per key"),
        C("""
        from pyspark.sql import functions as F
        from pyspark.sql.window import Window

        w = Window.partitionBy("customer_id").orderBy(F.col("sequence_number").desc())

        latest = (
            source_df
              .withColumn("rn", F.row_number().over(w))
              .filter(F.col("rn") == 1)
              .drop("rn")
        )
        """, lang="python", caption="PySpark dedup"),
        F("Is target key unique?", "Does source contain duplicates?", "Which source row is latest?", "Is there a sequence / updated_at?", "Deduplicate", "MERGE", caption="Debug sequence for a failing MERGE"),
        C("""
        SELECT order_id, COUNT(*)
        FROM ecommerce.staging.orders_updates
        GROUP BY order_id
        HAVING COUNT(*) > 1;
        """, caption="Find the duplicated keys"),
        ASK("Ask yourself when MERGE says 'multiple source rows matched'",
            "Is the target key really unique?",
            "Does my source contain duplicate keys?",
            "Which source row is the latest for each key?",
            "Do I have a deterministic ordering field (event_sequence / updated_at / version)?",
            "Did I deduplicate before the MERGE?"),
        P("Typical ordering fields: `event_sequence`, `updated_at`, `version`."),
        P("**MERGE in Python** — the classic Delta API (same matching model as SQL):"),
        C("""
        from delta.tables import DeltaTable

        target = DeltaTable.forName(spark, "prod.silver.customers")
        source = spark.table("staging.customer_updates")

        (
            target.alias("t")
              .merge(source.alias("s"), "t.id = s.id")
              .whenMatchedUpdate(set={"name": "s.name", "city": "s.city"})
              .whenNotMatchedInsert(values={
                  "id": "s.id", "name": "s.name", "city": "s.city"})
              .execute()
        )
        """, lang="python"),
        P("Modern PySpark/Databricks also offers a DataFrame `mergeInto()` API — but master SQL `MERGE` and `DeltaTable` first: they're everywhere in existing production code."),
        CO("pitfall", "No `UPDATE … FROM … JOIN`", "Coming from PostgreSQL/SQL Server you may write `UPDATE target SET … FROM source WHERE …`. **Databricks SQL does not support this pattern.** To update from another relation, use `MERGE INTO`."),
    ])

    # ---------------- s10 ----------------
    ch.section(10, "Optimistic Concurrency Control", "Two jobs, one table, no locks — and yet no corruption. Here's the trick.", [
        P("Jobs A and B start together on a table at **v50**. A wants to update customer 10, B wants to update customer 20. Both read snapshot v50."),
        P("Delta does **not** necessarily take a pessimistic lock ('lock the entire table, everyone wait'). It uses **optimistic concurrency control**:"),
        F("READ: consistent snapshot", "WRITE: prepare candidate files", "VALIDATE: did a conflicting commit happen?", "COMMIT: new atomic version, or fail/retry"),
        P("**Why 'optimistic'?** The system assumes most concurrent transactions probably won't conflict. It lets A and B both work, and only at commit time asks: *can both results coexist consistently?* Yes → commit. No → conflict."),
        CO("analogy", "Google Docs vs a library book", "Pessimistic = only one person can borrow the book. Optimistic = everyone edits their copy; at 'save' time the system checks whether edits collide."),
        P("**Atomic version creation**: current = v50. A commits first → **v51**. B (based on v50) must now check: *what changed from v50 → v51, and does it affect rows/files I read or change?*"),
        D("""
        v50 ──► A commits ──► v51
         │
         └─ B (read v50) validates v50→v51
                ├─ no conflict ──► commits v52
                └─ conflict    ──► transaction FAILS
                                   (table not corrupted)
        """),
        P("Put together, every Delta write follows the same skeleton:"),
        D("""
              CURRENT SNAPSHOT
                     │
               READ / ANALYZE
                     │
        prepare data-file changes (files / DVs)
                     │
           optimistic validation
              ┌──────┴──────┐
          conflict?        safe?
              │              │
            FAIL       ATOMIC COMMIT
                             │
                        NEW VERSION
                             │
                        NEW SNAPSHOT
        """, caption="The mental model for every Delta write"),
        P("When you read `MERGE INTO prod.silver.customers …` don't think only 'update/insert'. See the whole pipeline:"),
        F("Source rows", "Matching (ON)", "Read target snapshot", "Determine changed rows/files", "Write new data / DVs", "Optimistic conflict validation", "Atomic log commit", "New version", "New consistent snapshot", caption="A MERGE, end to end"),
        CO("key", "Data engineer level", "Once this pipeline is instinctive, most Delta concepts stop being memorization."),
    ])

    # ---------------- s11 ----------------
    ch.section(11, "Isolation Levels & Row-Level Concurrency", "Which conflicts are real and which are just 'same file, different row'?", [
        P("Delta on Databricks supports two **isolation levels** for writes:"),
        T(["Level", "Meaning"], [
            ["WriteSerializable (default)", "Writes are serializable; weaker than Serializable but allows more concurrency."],
            ["Serializable", "Strongest: the outcome of concurrent reads **and** writes must be explainable by a fully serial order."],
        ]),
        P("**Reads** use **snapshot isolation** — every reader sees one consistent version."),
        C("""
        ALTER TABLE my_table
        SET TBLPROPERTIES ('delta.isolationLevel' = 'Serializable');
        """),
        D("""
        readers         -> consistent snapshots
        writers         -> optimistic validation
        default writes  -> WriteSerializable
        """, caption="Memorize this trio (not the full conflict matrix)"),
        P("**Row-level concurrency.** Older behaviour: A updates row 1 in file X, B updates row 9000 in the same file X → they could **conflict** because both touched file X."),
        P("With **row-level concurrency + deletion vectors**, Databricks detects conflicts at **row** granularity, so A and B can both succeed even though their rows share a physical file."),
        L("Supported Databricks Runtime", "Deletion vectors enabled", "Unpartitioned tables — liquid-clustered tables also use this architecture"),
        CO("key", "Same row still conflicts", "Job A: `UPDATE customers SET status='A' WHERE id=10`; Job B: `… status='B' WHERE id=10`. That's a **real logical conflict**: one commits, the other fails or is serialized safely — never random corruption."),
        CMP(
            ("Different rows, same file", ["Old: possible conflict (file-level)", "Now: can coexist with DVs + row-level concurrency"]),
            ("Same row", ["Always a real conflict", "One commit wins, the other fails/retries"]),
        ),
    ])

    # ---------------- s12 ----------------
    ch.section(12, "Concurrency Errors & Debugging", "A concurrency exception means Delta protected you — your job is to find out from whom.", [
        T(["Error", "What it usually means"], [
            ["DELTA_CONCURRENT_WRITE", "A concurrent transaction wrote new data after your transaction read the table."],
            ["ConcurrentAppendException (DELTA_CONCURRENT_APPEND)", "Another operation added files to the data/partition your operation read."],
            ["ConcurrentDeleteReadException (DELTA_CONCURRENT_DELETE_READ)", "Another operation deleted/rewrote a file your operation read."],
            ["MetadataChangedException", "A concurrent operation changed table metadata (e.g. `ALTER TABLE`, schema-evolving write)."],
            ["ProtocolChangedException", "The table protocol changed concurrently (e.g. table feature upgrade, concurrent create/replace)."],
            ["ConcurrentTransactionException", "Two writers with the same transaction identity (e.g. two streams sharing one checkpoint) collided."],
        ], caption="Concurrency errors you will meet"),
        CO("key", "Not corruption", "These errors do **not** mean 'the Delta table is corrupted'. They usually mean **the optimistic concurrency system prevented an unsafe commit**. Databricks suggests **retry logic** for legitimate transient conflicts — after **re-reading fresh state**."),
        CMP(
            ("Bad response", ["'Run it again until it works.'"]),
            ("Engineer response", ["Who else wrote?", "What did both read?", "Can I narrow the scope?", "Is a schema change running?", "Then decide on retry."]),
        ),
        ASK("Ask yourself when a MERGE fails with DELTA_CONCURRENT_WRITE",
            "What other writer touched this table at the same time (DESCRIBE HISTORY)?",
            "What rows/files/partitions did both operations read?",
            "Are my predicates too broad?",
            "Can I narrow the MERGE condition (e.g. add a date bound)?",
            "Is a schema ALTER happening concurrently?",
            "Are deletion vectors / row-level concurrency available on this table?",
            "Should the application retry after re-reading fresh state?"),
        P("`MERGE … ON t.id = s.id` on a huge table can have a **broad read scope**. If it is semantically correct, add a physical/time bound:"),
        C("""
        MERGE INTO prod.silver.orders t
        USING daily_updates s
        ON t.id = s.id
           AND t.event_date = DATE'2026-09-16'
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *;
        """, caption="Narrower ON = smaller scan AND smaller conflict domain"),
        CO("warn", "Only if semantically correct", "Adding `t.event_date = …` is valid only if matching target rows really live on that date. Otherwise you'd insert duplicates for rows from other dates."),
        CO("tip", "Schema changes are metadata changes", "An `ALTER TABLE` at 12:00 while a pipeline writes can fail that writer with `MetadataChangedException` — expected semantics, not a bug. Full story in Chapter 6."),
        P("**What's next:** Unity Catalog in depth — `catalog.schema.object`, managed vs external tables, volumes, external locations, grants, and real `PERMISSION_DENIED` debugging."),
    ])
