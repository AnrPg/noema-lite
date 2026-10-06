from qhelp import *


def add_sections(ch):
    # ---------------- s01 ----------------
    ch.section(1, "Creating Delta Tables in SQL", "CREATE vs CREATE OR REPLACE is the difference between 'safe' and 'I just wiped prod'.", [
        P("Phase 2 goal: move from 'I understand Delta internals' to '**I can use Delta correctly in production**' — syntax, APIs, patterns, optimization."),
        D("""
        PHASE 2 — DELTA LAKE IN PRACTICE
        1. Table creation + writes
        2. UPDATE / DELETE / MERGE
        3. Write modes + overwrite semantics
        4. Schema enforcement / evolution / type widening
        5. History / time travel / restore / vacuum
        6. Physical optimization: small files, OPTIMIZE,
           data skipping, file stats, deletion vectors,
           liquid clustering, predictive optimization
        """, caption="Roadmap (internals of DML/MERGE/history live in Chapter 5)"),
        P("In Databricks, tables are **Delta by default** unless you ask for another format. Databricks recommends **Unity Catalog managed Delta tables** for most workloads."),
        C("""
        CREATE TABLE ecommerce.bronze.orders_raw (
          order_id    BIGINT,
          customer_id BIGINT,
          amount      DECIMAL(10,2),
          status      STRING,
          order_ts    TIMESTAMP
        );            -- Delta by default
        """, caption="Project: catalog ecommerce · schema bronze · table orders_raw"),
        P("`USING DELTA` is optional today, but useful when teaching or when you want to be **absolutely explicit**."),
        T(["Statement", "If table exists", "Typical use"], [
            ["`CREATE TABLE t (...)`", "Fails (table already exists)", "Safe default"],
            ["`CREATE TABLE IF NOT EXISTS t (...)`", "Does nothing", "Idempotent setup scripts"],
            ["`CREATE OR REPLACE TABLE t (...)`", "**Replaces** definition/state", "Dev; deliberate rebuilds"],
        ]),
        CO("pitfall", "CREATE OR REPLACE in production", "Handy in development, dangerous in production if not used consciously: it replaces the existing table definition and its current state. (On Delta the replace is a new version, so history survives — but downstream consumers instantly see the new state.)"),
        P("**CTAS — CREATE TABLE AS SELECT.** You don't declare a schema; it is **derived from the query**. Databricks uses this pattern even in its official Delta tutorials."),
        C("""
        CREATE OR REPLACE TABLE ecommerce.silver.orders AS
        SELECT
          CAST(order_id AS BIGINT)       AS order_id,
          customer_id,
          CAST(amount AS DECIMAL(10,2))  AS amount,
          UPPER(status)                  AS status,
          order_ts
        FROM ecommerce.bronze.orders_raw;
        """, caption="CTAS: Bronze → Silver with casts and cleanup"),
        P("**CREATE TABLE LIKE** copies the table **definition/metadata, not the data** — an empty table with the same structure."),
        C("""
        CREATE TABLE ecommerce.silver.orders_test
        LIKE ecommerce.silver.orders;
        """),
        L("dev → test copies", "prod-like staging tables", "schema cloning", "migration testing"),
        R("Exercise 1 — think first: you want an empty table with the same schema as `prod.silver.customers`, no data. What do you write?",
          "`CREATE TABLE dev.silver.customers LIKE prod.silver.customers;`"),
    ])

    # ---------------- s02 ----------------
    ch.section(2, "Creating & Writing from PySpark", "Two writer APIs, one positional trap: know writeTo(), saveAsTable() and why insertInto() bites.", [
        P("The modern recommended API is **DataFrameWriterV2**: `df.writeTo(...)`."),
        C("""
        df.writeTo("ecommerce.bronze.orders_raw").create()
        df.writeTo("ecommerce.bronze.orders_raw").createOrReplace()
        df.writeTo("ecommerce.silver.orders").append()

        (df.writeTo("ecommerce.bronze.orders_raw")
           .using("delta")
           .createOrReplace())
        """, lang="python", caption="writeTo() — V2 API"),
        P("The classic API is still everywhere: `df.write…saveAsTable(...)`."),
        C("""
        df.write.saveAsTable("ecommerce.bronze.orders_raw")

        (df.write
           .mode("overwrite")
           .saveAsTable("ecommerce.bronze.orders_raw"))
        """, lang="python", caption="saveAsTable() — classic DataFrameWriter"),
        CMP(
            ("saveAsTable() (classic)", ["Simple, very widespread", "Behaviour driven by `.mode(...)`", "You'll see it in most existing code"]),
            ("writeTo() (V2)", ["Clear create / replace / append semantics", "Better partitioning support", "Table properties & clustering support", "Conditional overwrite features"]),
        ),
        CO("tip", "Know both", "For new code prefer `writeTo()` where practical — but read and maintain `saveAsTable()` code fluently."),
        P("**insertInto() — important trap.** `df.write.insertInto(\"ecommerce.silver.orders\")` requires a compatible schema, but it matches columns **by position, not by name**."),
        D("""
        target:     id BIGINT | name STRING
        DataFrame:  name      | id
                      │          │
        insertInto -> col1 -> id,  col2 -> name   (positional!)
        if types can be coerced -> silently WRONG mapping
        """),
        R("Exercise 2 — think first: target (id BIGINT, name STRING), DataFrame columns (name, id). Which API is more dangerous?",
          "`insertInto(...)` — it uses **position-based** resolution, so `name` lands in `id` (or fails only if the cast is impossible). Name-based APIs (`saveAsTable` append, `writeTo().append()`) avoid this."),
        CO("pitfall", "Positional resolution", "If types allow coercion, `insertInto` can write values into the wrong columns without any error. Reorder with `df.select(target_cols)` or use a name-based API."),
        ASK("Ask yourself when values land in the wrong columns",
            "Did I write with insertInto (positional) instead of a name-based API?",
            "Does the DataFrame column order match the target column order?",
            "Could the types be coerced silently (e.g. numbers into strings)?",
            "Which version introduced the bad rows, so I can RESTORE or fix them?"),
    ])

    # ---------------- s03 ----------------
    ch.section(3, "INSERT, INSERT OVERWRITE & TRUNCATE", "INTO adds, OVERWRITE replaces, TRUNCATE empties, DROP deletes the object — four verbs, four outcomes.", [
        C("""
        INSERT INTO ecommerce.silver.orders VALUES
          (1001, 51, 29.90, 'NEW', current_timestamp()),
          (1002, 92, 55.00, 'NEW', current_timestamp());
        """, caption="INSERT INTO = add rows"),
        P("**INSERT INTO** is **additive**: it adds rows and never replaces existing ones (the docs say so explicitly)."),
        C("""
        INSERT INTO ecommerce.silver.orders
        SELECT order_id, customer_id, amount, status, order_ts
        FROM ecommerce.bronze.orders_raw
        WHERE ingestion_date = current_date();
        """, caption="INSERT INTO … SELECT — the everyday batch ETL pattern"),
        P("**INSERT OVERWRITE** does not append: it **overwrites the target scope**. Without a partition/predicate restriction it can replace the **entire** table contents."),
        C("""
        INSERT OVERWRITE TABLE ecommerce.silver.orders
        SELECT * FROM staging.orders;
        """),
        D("""
        INSERT INTO       = additive    (existing + new)
        INSERT OVERWRITE  = replacement (target scope := new)
        """),
        P("**TRUNCATE TABLE** empties a table: schema and table object remain, rows are removed."),
        C("TRUNCATE TABLE ecommerce.bronze.orders_raw;"),
        CMP(
            ("TRUNCATE TABLE", ["schema remains", "table object remains", "rows removed"]),
            ("DROP TABLE", ["removes the table object itself", "schema/definition gone from the catalog"]),
        ),
        CO("exam", "INTO vs OVERWRITE", "Q: difference between INSERT INTO and INSERT OVERWRITE? A: INTO **adds** rows; OVERWRITE **replaces the target scope**."),
    ])

    # ---------------- s04 ----------------
    ch.section(4, "Append vs Overwrite & Idempotency", "A retry should never double your revenue — design writes that are safe to run twice.", [
        C("""
        df.write.mode("append").saveAsTable("ecommerce.silver.orders")
        df.writeTo("ecommerce.silver.orders").append()
        """, lang="python", caption="append: existing rows + new rows"),
        C("""
        df.write.mode("overwrite").saveAsTable("ecommerce.silver.orders")
        """, lang="python", caption="overwrite: can replace the WHOLE table"),
        T(["Mode", "Good when…"], [
            ["append", "Data are **genuinely new**, no overlap with existing rows"],
            ["full overwrite", "The target should **exactly equal** this new DataFrame"],
        ], caption="Daily file 2026-09-27 orders: which mode?"),
        CO("pitfall", "The overwrite trap", "Table holds **3 years** of data. Your DataFrame holds **only yesterday**. `df.write.mode(\"overwrite\").saveAsTable(...)` → the other 3 years vanish from the logical state. One of the most classic production mistakes."),
        ASK("Ask yourself when a table suddenly lost most of its rows after a write",
            "Was the last write mode overwrite (DESCRIBE HISTORY → operationParameters)?",
            "Did the DataFrame contain only a subset (e.g. only yesterday)?",
            "Which version was the last good one, and are its files still within retention?",
            "Should this write have been append, MERGE or REPLACE WHERE instead?"),
        R("Think first: when exactly is a full overwrite dangerous?", "When the DataFrame contains only a **subset** of what the table should contain."),
        P("**Idempotent** = running the same operation a second time with the same input does **not change** the final state again. Critical when a job **retries**."),
        D("""
        source: id=5, status='PAID'
        MERGE run 1: updates id=5 -> PAID
        MERGE run 2: updates id=5 -> PAID   (same final state)
        => idempotent
        """),
        C("""
        UPDATE orders
        SET amount = amount + 10
        WHERE id = 5;
        -- run twice: +10, +10  => +20 total  => NOT idempotent
        """),
        CMP(
            ("Idempotent", ["MERGE that sets values from source (`t.status = s.status`)", "Full overwrite with the same complete DataFrame", "REPLACE WHERE for one date with the same data"]),
            ("Not idempotent", ["`amount = amount + 10`", "Blind append of the same batch twice (duplicates)", "Counters/increments"]),
        ),
        CO("key", "Use MERGE for idempotent upserts", "MERGE that **sets** target values from a deduplicated source converges to the same state on every retry."),
    ])

    # ---------------- s05 ----------------
    ch.section(5, "Selective Overwrite: REPLACE WHERE & REPLACE USING", "Replace exactly one day (or one country) and leave everything else untouched.", [
        P("You want to replace only `date = 2026-09-27`. Today there are better options than the legacy `partitionOverwriteMode`: Databricks recommends **REPLACE WHERE** or **REPLACE USING** for new workloads."),
        C("""
        INSERT INTO ecommerce.silver.orders
        REPLACE WHERE order_date = DATE'2026-09-27'
        SELECT * FROM ecommerce.staging.orders_daily;
        """, caption="REPLACE WHERE: explicit predicate"),
        D("""
        replace rows matching the predicate
        leave everything else untouched
        """),
        P("REPLACE WHERE is supported on **all compute types**."),
        C("""
        INSERT INTO ecommerce.silver.orders
        REPLACE USING (order_date)
        SELECT * FROM ecommerce.staging.orders_daily;
        """, caption="REPLACE USING: dynamic overwrite by key columns"),
        P("**REPLACE USING** replaces target rows whose values in the listed key columns match those in the **incoming** dataset. It's the recommended replacement for legacy dynamic partition overwrite. (The source also lists `REPLACE ON` as a further per-use-case variant.)"),
        C("""
        (df.write
           .mode("overwrite")
           .option("partitionOverwriteMode", "dynamic")
           .saveAsTable("ecommerce.silver.orders"))
        """, lang="python", caption="Legacy: dynamic partition overwrite"),
        CO("warn", "Legacy", "`partitionOverwriteMode = dynamic` is still supported in some contexts but is legacy, not preferred for new workloads, and has compute limitations."),
        CO("pitfall", "Dynamic overwrite with a stray key", "Incoming data meant for `2026-09-27` accidentally contains one row with `order_date = 2024-01-01`. Dynamic overwrite (and REPLACE USING) will replace the **whole 2024-01-01 slice** with that single row. Always **validate the incoming key/partition domain** before writing."),
        CMP(
            ("REPLACE WHERE", ["You state the predicate explicitly", "Replaces exactly that slice", "Stray rows outside the predicate → write fails instead of silently replacing"]),
            ("REPLACE USING / dynamic", ["Slices derived from incoming data", "Convenient for many keys", "Stray keys replace unintended slices"]),
        ),
        R("Exercise 4 — think first: replace only `country='GR'`, keep DE/FR unchanged. Better than full overwrite?",
          "Selective overwrite: `INSERT INTO t REPLACE WHERE country = 'GR' SELECT …`."),
        ASK("Ask yourself before any overwrite",
            "Does my DataFrame contain the whole table, or only a subset?",
            "Which slice (date/country) am I really trying to replace?",
            "Have I validated the distinct key values in the incoming data?",
            "Would REPLACE WHERE with an explicit predicate be safer here?"),
    ])

    # ---------------- s06 ----------------
    ch.section(6, "Schema Enforcement & Safe Casting", "Schema enforcement is a seatbelt, not a nuisance — it stops bad producers before the CEO dashboard.", [
        P("Target has `id BIGINT, amount DECIMAL(10,2)`. A DataFrame arrives with `amount STRUCT<foo:INT>`. Default expectation: **the write fails**."),
        F("Bad producer", "Silent corruption", "Silver", "Gold", "CEO dashboard", caption="What schema enforcement prevents"),
        P("Delta performs **schema validation on write**, using the schema stored in the transaction-log metadata."),
        L("Columns must exist in the target", "Types must match or be **safely castable**"),
        T(["Target", "Incoming", "Result"], [
            ["amount BIGINT", "amount INT", "OK — safe cast"],
            ["amount BIGINT", "amount STRUCT<…>", "Fails — no safe cast"],
            ["amount DECIMAL(10,2)", "amount STRUCT<foo:INT>", "Fails"],
            ["id, name", "id, name, email", "Fails unless evolution is allowed (next section)"],
        ]),
        CO("key", "Enforcement vs evolution", "**Enforcement** rejects incompatible data. **Evolution** allows specific, controlled schema changes."),
        CO("tip", "Best practice", "Use schema enforcement as **protection**, not as a nuisance to disable."),
        ASK("Ask yourself when a write fails with a schema mismatch",
            "What does DESCRIBE TABLE say vs df.printSchema()?",
            "Is it a new column, a different type, or a renamed column?",
            "Is the change intentional evolution — or a bug in the source?",
            "If intentional: can I evolve explicitly and locally (mergeSchema / WITH SCHEMA EVOLUTION / ALTER TABLE)?"),
    ])

    # ---------------- s07 ----------------
    ch.section(7, "Schema Evolution: mergeSchema, autoMerge, overwriteSchema, ALTER", "Let intentional changes in, keep accidental ones out — and make it explicit which write may change the schema.", [
        P("Yesterday the source had `customer_id, name, city`. Today it also has `segment`. `source_df.write.mode(\"append\").saveAsTable(...)` **fails**."),
        P("Don't immediately enable a global setting. **First ask: is `segment` an intentional addition?** If yes, allow evolution **for this write only**:"),
        C("""
        (source_df.write
           .option("mergeSchema", "true")
           .mode("append")
           .saveAsTable("prod.silver.customers"))
        """, lang="python", caption="Per-write schema evolution"),
        C("""
        spark.conf.set(
            "spark.databricks.delta.schema.autoMerge.enabled", "true"
        )   # session-wide: every later write may evolve schemas!
        """, lang="python", caption="Global autoMerge — not preferred for production"),
        CMP(
            ("mergeSchema (per write)", ["Localized and explicit", "Clear which write may change the schema", "Recommended"]),
            ("autoMerge (session-wide)", ["Many unrelated writes may evolve schemas", "Hard to tell which operation was allowed to", "Avoid in production"]),
        ),
        P("Modern **SQL syntax** for evolution scoped to one statement:"),
        C("""
        MERGE WITH SCHEMA EVOLUTION INTO target t
        USING source s
        ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *;

        -- DBR 18.1+
        INSERT WITH SCHEMA EVOLUTION INTO target
        SELECT * FROM source;
        """),
        CO("exam", "Know both", "For 2026 certification/real projects, know the new `WITH SCHEMA EVOLUTION` syntax **and** `.option(\"mergeSchema\", \"true\")` — you'll see the latter everywhere."),
        P("**overwriteSchema is different.** It means: overwrite the data **and replace the schema/partitioning**."),
        C("""
        (df.write
           .mode("overwrite")
           .option("overwriteSchema", "true")
           .saveAsTable("ecommerce.silver.orders"))
        """, lang="python"),
        D("""
        mergeSchema      -> evolve / add compatible schema changes
        overwriteSchema  -> replace table schema during overwrite
        """),
        P("**Manual evolution** — when the change is intentional, change the schema explicitly with `ALTER TABLE`:"),
        C("""
        ALTER TABLE prod.silver.customers ADD COLUMNS (email STRING);
        ALTER TABLE ecommerce.silver.orders ADD COLUMN source_system STRING;
        ALTER TABLE prod.silver.customers RENAME COLUMN name TO full_name;
        ALTER TABLE prod.silver.customers DROP COLUMN obsolete_field;
        ALTER TABLE ecommerce.silver.orders
          SET TBLPROPERTIES ('delta.enableDeletionVectors' = 'true');
        """, caption="ALTER TABLE: metadata, schema and properties"),
        CO("warn", "Column mapping", "Metadata-only **RENAME COLUMN** and **DROP COLUMN** require **column mapping** support on the table."),
    ])

    # ---------------- s08 ----------------
    ch.section(8, "Type Widening & Schema Changes Under Concurrency", "INT → BIGINT is growth; INT → STRING is a different meaning — and every schema change is a metadata commit that can collide.", [
        P("`quantity INT` grows so much you need `quantity BIGINT`. That is **type widening** — a move to a compatible, wider type. Delta supports it as a **table feature** (now GA)."),
        C("""
        ALTER TABLE ecommerce.silver.orders
        SET TBLPROPERTIES ('delta.enableTypeWidening' = 'true');

        ALTER TABLE ecommerce.silver.orders
        ALTER COLUMN quantity TYPE BIGINT;
        """),
        T(["From", "Can widen to"], [
            ["BYTE", "SHORT / INT / BIGINT / DECIMAL / DOUBLE"],
            ["SHORT", "INT / BIGINT / DECIMAL / DOUBLE"],
            ["INT", "BIGINT / DECIMAL / DOUBLE"],
            ["FLOAT", "DOUBLE"],
        ], caption="Supported widenings (no rewrite of underlying data files)"),
        CO("key", "Widening ≠ arbitrary cast", "`INT → BIGINT` is widening. `INT → STRING` or `STRING → STRUCT` are **not** — they change meaning. Type evolution does not mean 'any type to any other type'."),
        P("Supported widening changes happen **without rewriting** the underlying data files."),
        P("Now the production caveat: **schema changes are metadata changes**, and metadata changes **conflict with concurrent writes**."),
        D("""
        11:59  production streaming pipeline running
        12:00  ALTER TABLE ... ADD COLUMNS ...
        12:00  writer fails  (MetadataChangedException)
        """, caption="Not necessarily a bug — expected concurrency semantics"),
        P("Databricks recommends **coordinating schema updates**: they can make concurrent writes fail and can also **stop streams** reading the table until they are restarted."),
        ASK("Ask yourself when a writer fails right after a schema change",
            "Did someone run ALTER TABLE or a schema-evolving write at that time (DESCRIBE HISTORY)?",
            "Is the error MetadataChangedException?",
            "Are streaming readers of this table now stopped and needing a restart?",
            "Can schema changes be scheduled/coordinated with the pipelines that write this table?"),
    ])

    # ---------------- s09 ----------------
    ch.section(9, "DESCRIBE DETAIL & Inspecting Tables", "Three DESCRIBEs, three questions: what columns? what versions? what files?", [
        C("DESCRIBE DETAIL ecommerce.silver.orders;"),
        P("Returns **one row** of table-level metadata — a top debugging command."),
        TERMS(
            ("format", "e.g. delta"),
            ("location", "Where the files live"),
            ("sizeInBytes", "Current table size (current snapshot)"),
            ("numFiles", "Number of files in the current snapshot"),
            ("partitionColumns / clusteringColumns", "Layout keys"),
            ("properties / table features", "e.g. deletion vectors, type widening"),
        ),
        T(["Command", "Answers"], [
            ["DESCRIBE TABLE t", "Which columns and types? (compare with `df.printSchema()`)"],
            ["DESCRIBE HISTORY t", "Which versions/operations, by whom, with what metrics? (Chapter 5)"],
            ["DESCRIBE DETAIL t", "Format, location, size, number of files, partitioning, properties/features"],
        ]),
        CO("debug", "Average file size", "`sizeInBytes / numFiles` = average file size. Hundreds of thousands of files with a tiny average size → small-file pressure."),
        R("Think first: storage costs doubled but DESCRIBE DETAIL `sizeInBytes` didn't. Why?",
          "DETAIL reports the **current snapshot**. Old unreferenced files kept for history/time travel aren't counted — check VACUUM/retention (Chapter 5)."),
    ])

    # ---------------- s10 ----------------
    ch.section(10, "OPTIMIZE & the Small-File Problem", "10 GB in 10 files flies; 10 GB in 100,000 files crawls — same bytes, different file count.", [
        P("Writes often produce files of 10 MB, 12 MB, 8 MB… thousands of **small Parquet files**."),
        T(["Option", "Layout", "Effect"], [
            ["A", "10 files × 1 GB", "Few file opens, healthy tasks"],
            ["B", "100,000 files × 100 KB", "Huge metadata/file-open overhead, many tiny Spark tasks, inefficient scheduling, poor scan efficiency"],
        ], caption="Same 10 GB dataset"),
        CO("key", "Look at file distribution, not just total bytes", "Health = **number and size distribution of files**, not only total size."),
        C("OPTIMIZE ecommerce.silver.orders;"),
        P("**OPTIMIZE** improves physical layout. Without clustering/Z-order semantics it does **bin packing**: compacting small files into more balanced sizes (e.g. 50,000 × 1 MB → far fewer, larger files)."),
        D("""
        A B C D E F      many small files
             │  OPTIMIZE
             ▼
           X   Y         fewer, larger files

        log: REMOVE A..F, ADD X, ADD Y   (dataChange = false)
        """),
        P("The logical data doesn't change. The `dataChange` flag in the protocol marks the commit as **rearrangement**, not a logical record change (e.g. streaming readers don't treat it as new data)."),
        CMP(
            ("OPTIMIZE", ["Rewrites/reorganizes **active** data files", "Layout & performance", "Creates new files + a new version"]),
            ("VACUUM", ["Physically **deletes old unreferenced** files", "Garbage collection / storage", "Doesn't change the current snapshot"]),
        ),
        CO("exam", "Classic confusion", "OPTIMIZE ≠ VACUUM. After OPTIMIZE, the old small files are still on storage until VACUUM removes them past retention."),
        ASK("Ask yourself when storage 'exploded'",
            "What do numFiles and sizeInBytes say in DESCRIBE DETAIL?",
            "Is the average file size tiny (hundreds of thousands of files)?",
            "Which writes produce so many small files (frequent small appends, streaming)?",
            "Has OPTIMIZE run — and has VACUUM cleaned up the replaced files after retention?",
            "Is predictive optimization enabled for this UC managed table?"),
    ])

    # ---------------- s11 ----------------
    ch.section(11, "Data Skipping & File Statistics", "The fastest file to read is the one you never open.", [
        P("Delta stores **file-level statistics** in the log's `add` actions:"),
        L("min values per column", "max values per column", "null counts", "row count"),
        D("""
        file A: customer_id min=1    max=1000
        file B: customer_id min=1001 max=2000
        file C: customer_id min=2001 max=3000

        WHERE customer_id = 2500
          A -> cannot contain 2500 -> skip
          B -> cannot contain 2500 -> skip
          C -> may contain 2500    -> read
        """, caption="Data skipping"),
        P("**Data skipping** = using file statistics so files that cannot contain matching rows are not read. Stats also help pruning and query planning."),
        CO("key", "Skipping needs a good layout", "If every file holds customer_ids 1…3000 (min=1, max=3000), no file can be skipped. Stats only help when values are **clustered** into narrow ranges per file."),
        P("Predictive optimization also **collects statistics** on Unity Catalog managed tables."),
        R("Think first: `WHERE customer_id = 1234` still scans most of the table. What could be wrong?",
          "Files hold wide, overlapping customer_id ranges (bad layout/no clustering), stats missing for that column, or the filter isn't selective. Consider liquid clustering on `customer_id`."),
        ASK("Ask yourself when a selective query scans too much",
            "How is the table laid out — partitioned, clustered, or neither?",
            "Is the table clustered on the column I filter by?",
            "Are statistics collected for that column?",
            "Is the filter actually selective?",
            "Is data skipping kicking in (files read vs total files)?"),
    ])

    # ---------------- s12 ----------------
    ch.section(12, "Liquid Clustering", "Partition + ZORDER locked you in; liquid clustering lets the layout follow your queries.", [
        CMP(
            ("Old way", ["`partitionBy(date)`", "+ maybe `ZORDER BY customer_id`", "Static physical design decision"]),
            ("Liquid clustering", ["`CLUSTER BY (customer_id)`", "Keys can change as query patterns change", "Applied incrementally"]),
        ),
        P("Databricks describes **liquid clustering** as the layout technique that replaces traditional partitioning and ZORDER for many use cases, and recommends it for new Delta tables."),
        C("""
        ALTER TABLE ecommerce.silver.orders
        CLUSTER BY (customer_id);

        OPTIMIZE ecommerce.silver.orders;        -- incremental clustering
        OPTIMIZE ecommerce.silver.orders FULL;   -- recluster ALL existing data
        """),
        P("Setting `CLUSTER BY` doesn't rewrite old data on its own. Plain `OPTIMIZE` clusters incrementally; to apply clustering to **existing** data, run `OPTIMIZE … FULL`."),
        CO("analogy", "Why 'liquid'?", "A static `partitionBy(country)` is concrete poured into the table's design. Liquid clustering is a shape you can change: new keys without an immediate rewrite of all historical data."),
        P("**When does it make sense?** Columns used often in **filters**, **joins** and **selective lookups**, with enough **cardinality** that physical ordering helps — e.g. `CLUSTER BY (customer_id)` when you often run `WHERE customer_id = ?`."),
        CO("tip", "Bonus: concurrency", "Liquid-clustered tables also benefit from row-level concurrency (Chapter 5)."),
        CO("warn", "Not combined with partitioning/ZORDER", "Liquid clustering replaces partitioning and ZORDER on a table — you don't stack them."),
    ])

    # ---------------- s13 ----------------
    ch.section(13, "Predictive Optimization", "Let Databricks schedule maintenance — but you still need to know why a table is slow.", [
        P("For **Unity Catalog managed tables**, **predictive optimization** lets Databricks run maintenance automatically and decide which tables benefit."),
        L("OPTIMIZE", "VACUUM", "ANALYZE (statistics)"),
        CMP(
            ("Without", ["You schedule OPTIMIZE every Sunday", "VACUUM every Monday", "ANALYZE every…"]),
            ("With predictive optimization", ["Databricks monitors tables", "Decides if maintenance is needed", "Runs it when useful"]),
        ),
        CO("pitfall", "Automation ≠ understanding", "Predictive optimization does **not** mean you don't need to understand optimization. In debugging you must still know why files are small, why skipping doesn't work, why a clustering key is bad, why a scan is huge."),
        CO("tip", "Best practice", "Enable predictive optimization for Unity Catalog managed tables where supported."),
    ])

    # ---------------- s14 ----------------
    ch.section(14, "Production Project, Debug Workflows & Best Practices", "Glue it all together: the e-shop pipeline, the 5 debug workflows, 13 rules and a 20-step drill.", [
        C("""
        CREATE TABLE ecommerce.bronze.orders_raw (
          order_id BIGINT, customer_id BIGINT, amount DECIMAL(10,2),
          status STRING, order_ts TIMESTAMP, ingestion_ts TIMESTAMP
        );

        CREATE TABLE ecommerce.silver.orders (
          order_id BIGINT, customer_id BIGINT, amount DECIMAL(10,2),
          status STRING, order_ts TIMESTAMP, updated_at TIMESTAMP
        );

        CREATE OR REPLACE TABLE ecommerce.staging.orders_updates AS
        SELECT * FROM VALUES
          (1001L, 51L, 29.90D, 'PAID'),
          (1003L, 92L, 44.50D, 'NEW')
        AS t(order_id, customer_id, amount, status);
        """, caption="Bronze, Silver, staging"),
        C("""
        MERGE INTO ecommerce.silver.orders AS t
        USING ecommerce.staging.orders_updates AS s
        ON t.order_id = s.order_id
        WHEN MATCHED THEN UPDATE SET
          t.customer_id = s.customer_id,
          t.amount      = s.amount,
          t.status      = s.status,
          t.updated_at  = current_timestamp()
        WHEN NOT MATCHED THEN INSERT
          (order_id, customer_id, amount, status, updated_at)
        VALUES
          (s.order_id, s.customer_id, s.amount, s.status, current_timestamp());
        """, caption="Idempotent MERGE: re-running gives the same business state"),
        T(["#", "Symptom", "First command", "Look for"], [
            ["1", "MERGE fails (multiple source rows matched)", "`GROUP BY key HAVING COUNT(*) > 1`", "Ordering field → dedup (Ch.5)"],
            ["2", "Write fails: schema mismatch", "`DESCRIBE TABLE` vs `df.printSchema()`", "New column? type? rename? intentional?"],
            ["3", "Storage exploded", "`DESCRIBE DETAIL`", "numFiles, sizeInBytes → small files"],
            ["4", "Query scans too much", "Inspect layout/stats", "Clustering, stats, selectivity, skipping"],
            ["5", "Someone broke data", "`DESCRIBE HISTORY`", "Bad version → time travel → RESTORE (Ch.5)"],
        ], caption="The 5 debugging workflows at a glance"),
        CO("debug", "Workflow 2 rule", "Do **not** blindly enable `mergeSchema` — first decide whether the change is intentional evolution or a source bug."),
        L(
            "Prefer Unity Catalog managed Delta tables unless you have a reason not to.",
            "Prefer `writeTo()`/V2 semantics for modern table creation where practical.",
            "Use MERGE for idempotent upserts.",
            "Deduplicate the source before MERGE.",
            "Avoid blind full overwrite.",
            "Prefer REPLACE WHERE / REPLACE USING over legacy dynamic partition overwrite for new workloads.",
            "Use schema enforcement as protection, not nuisance.",
            "Enable schema evolution explicitly and locally when possible.",
            "Use DESCRIBE HISTORY and time travel for debugging.",
            "Do not treat time travel as long-term backup.",
            "Understand OPTIMIZE vs VACUUM.",
            "Prefer liquid clustering for many modern layout cases instead of static partitions.",
            "Enable predictive optimization for UC managed tables where supported.",
            ordered=True),
        P("**Practical assignment** — build `ecommerce.bronze.orders_raw`, `ecommerce.staging.orders_updates`, `ecommerce.silver.orders` and do, in order:"),
        L("CREATE TABLE", "INSERT initial rows", "Append new rows", "UPDATE one row", "DELETE one row", "MERGE updates + inserts", "Intentionally duplicate a source key", "Deduplicate with ROW_NUMBER", "Run MERGE again to prove idempotency", "Add a new column with mergeSchema", "DESCRIBE DETAIL", "DESCRIBE HISTORY", "Query VERSION AS OF", "RESTORE", "Create many small files", "OPTIMIZE", "Inspect numFiles before/after", "Enable clustering", "OPTIMIZE FULL", "Inspect behaviour/history", ordered=True),
        P("**What's next:** Phase 3 — Unity Catalog mastery: metastore → catalog → schema → managed/external tables → volumes → credentials/external locations → grants → service principals → row filters/masks → lineage → `PERMISSION_DENIED` debugging."),
    ])
