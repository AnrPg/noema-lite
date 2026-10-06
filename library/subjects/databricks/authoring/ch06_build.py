import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qhelp import *
from ch06_sections import add_sections

ch = Chapter("ch06")
add_sections(ch)

# =============== s01 SQL creation ===============
ch.tf(1, 1, ["concept", "exam"], "`CREATE TABLE ecommerce.bronze.orders_raw (...)` silently replaces the table if it already exists.", False,
      "Plain `CREATE TABLE` usually **fails** when the table exists. Replacement needs `CREATE OR REPLACE TABLE`; no-op-if-exists needs `CREATE TABLE IF NOT EXISTS`.", quick=True)
ch.mcq(1, 1, ["concept", "syntax"], "In a CTAS (`CREATE TABLE … AS SELECT`), where does the table's schema come from?",
       ["You must declare it in parentheses first", "It is derived from the SELECT query", "It is copied from the source table's DDL", "Delta infers it later on first read"], 1,
       "CTAS derives column names and types from the query — that's why you use CAST/aliases in the SELECT to control the resulting schema.",
       why=["Not in CTAS.", "Correct.", "Only CREATE TABLE LIKE copies a definition.", "Schema is fixed at creation."], quick=True)
ch.write(1, 1, ["syntax"], "Exercise 1: create an **empty** table `dev.silver.customers` with the same schema as `prod.silver.customers` — no data.",
         "CREATE TABLE dev.silver.customers\nLIKE prod.silver.customers;", ["create table dev.silver.customers", "like prod.silver.customers"],
         "`CREATE TABLE … LIKE …` copies the definition/metadata, not the rows. Great for dev/test, prod-like staging, schema cloning and migration testing.")
ch.tf(1, 1, ["exam"], "In Databricks you must write `USING DELTA` or the table will be created as Parquet.", False,
      "Delta is the default table format on Databricks. `USING DELTA` is optional — useful only for explicitness.")
ch.bucket(1, 2, ["compare", "pitfall"], "The table already exists. What does each statement do?", ["Fails", "No-op", "Replaces definition/state"],
          [("CREATE TABLE t (...)", 0), ("CREATE TABLE IF NOT EXISTS t (...)", 1), ("CREATE OR REPLACE TABLE t (...)", 2), ("CREATE OR REPLACE TABLE t AS SELECT …", 2), ("CREATE TABLE t AS SELECT … (CTAS without OR REPLACE)", 0)],
          "Only OR REPLACE replaces; IF NOT EXISTS skips; plain CREATE (including plain CTAS) fails on an existing table. In production, OR REPLACE must be a conscious choice.")
ch.write(1, 2, ["syntax"], "CTAS: create/replace `ecommerce.silver.orders` from `ecommerce.bronze.orders_raw`, casting `order_id` to BIGINT and `amount` to DECIMAL(10,2), upper-casing `status`, keeping `customer_id` and `order_ts`.",
         """
         CREATE OR REPLACE TABLE ecommerce.silver.orders AS
         SELECT
           CAST(order_id AS BIGINT) AS order_id,
           customer_id,
           CAST(amount AS DECIMAL(10,2)) AS amount,
           UPPER(status) AS status,
           order_ts
         FROM ecommerce.bronze.orders_raw;
         """, ["create or replace table ecommerce.silver.orders as", "cast(order_id as bigint)", "decimal(10,2)", "upper(status)", "from ecommerce.bronze.orders_raw"],
         "The SELECT defines the Silver schema; casts make types explicit instead of relying on whatever Bronze had.")
ch.odd(1, 2, ["concept"], "Which statement copies data rows into the new table?",
       ["`CREATE TABLE b LIKE a`", "`CREATE TABLE b (id BIGINT)`", "`CREATE TABLE IF NOT EXISTS b (id BIGINT)`", "`CREATE TABLE b AS SELECT * FROM a`"], 3,
       "Only CTAS materializes query results. LIKE copies structure only; the others define an empty schema.")

# =============== s02 PySpark ===============
ch.mcq(2, 1, ["pitfall", "exam"], "Exercise 2: target `(id BIGINT, name STRING)`; DataFrame columns `(name, id)`. Which API is the most dangerous here?",
       ["`df.writeTo(t).append()`", "`df.write.mode('append').saveAsTable(t)`", "`df.write.insertInto(t)`", "`MERGE INTO` with explicit columns"], 2,
       "`insertInto` resolves columns **by position**, so `name` goes into `id`. If types can be coerced it silently writes wrong data; otherwise it fails.",
       why=["Name-based.", "Name-based for Delta tables.", "Correct: position-based.", "Explicit mapping by name."], quick=True)
ch.tf(2, 1, ["concept"], "`df.writeTo(...)` is the DataFrameWriterV2 API, which Databricks recommends for many modern table writes.", True,
      "writeTo() = V2: clearer create/replace semantics, better partitioning, table properties, clustering and conditional overwrite support.", quick=True)
ch.match(2, 2, ["syntax"], "Match each call to its effect.",
         [("df.writeTo(t).create()", "Create new table; fail if it exists"),
          ("df.writeTo(t).createOrReplace()", "Create or replace the table"),
          ("df.writeTo(t).append()", "Add rows to existing table"),
          ("df.write.mode('overwrite').saveAsTable(t)", "Classic API: replace table contents"),
          ("df.write.insertInto(t)", "Insert by column position")],
         "V2 methods name the intent directly; the classic API encodes it in `.mode()`; insertInto is positional.")
ch.spotbug(2, 2, ["pitfall", "debug"], "Target `ecommerce.silver.customers` has columns `(id, name)`. Which line causes silently swapped values?",
           ["df = spark.table('staging.customers_raw').select('name', 'id')", "df = df.dropDuplicates(['id'])", "df.write.insertInto('ecommerce.silver.customers')", "spark.table('ecommerce.silver.customers').show()"], [2],
           "df.select('id', 'name').write.insertInto('ecommerce.silver.customers')\n# or: df.writeTo('ecommerce.silver.customers').append()",
           "insertInto maps by position: DataFrame column 1 (`name`) → target column 1 (`id`). Either reorder to match the target, or use a name-based API.")
ch.cloze(2, 1, ["syntax"], "Create or replace a Delta table with the V2 API.",
         """
         (df.[[writeTo]]("ecommerce.bronze.orders_raw")
            .[[using]]("delta")
            .[[createOrReplace]]())
         """, "writeTo(name) → using(format) → createOrReplace(). `.create()` would fail if the table existed; `.append()` adds rows.",
         bank=["saveAsTable", "mode", "insertInto", "format"], asCode=True)
ch.mcq(2, 2, ["compare", "exam"], "Difference between `saveAsTable(...)` and `writeTo(...)`?",
       ["They are identical aliases", "saveAsTable is the older DataFrameWriter API; writeTo is DataFrameWriterV2 with more explicit create/replace/partitioning/table semantics", "writeTo only works for Parquet", "saveAsTable can't overwrite"], 1,
       "Both write tables. V2 makes intent explicit (create, createOrReplace, append, overwrite…) and supports properties/clustering better; the classic API relies on `.mode()`.")
ch.write(2, 1, ["syntax"], "Append `df` to `ecommerce.silver.orders` using the V2 API.",
         'df.writeTo("ecommerce.silver.orders").append()', ["writeto(", "ecommerce.silver.orders", ".append()"],
         "V2 append is name-based and explicit. Classic equivalent: `df.write.mode('append').saveAsTable(...)`.", lang="python")

# =============== s03 INSERT / TRUNCATE ===============
ch.mcq(3, 1, ["exam"], "Difference between `INSERT INTO` and `INSERT OVERWRITE`?",
       ["None on Delta", "INTO adds rows; OVERWRITE replaces the target scope", "INTO replaces; OVERWRITE appends", "OVERWRITE only changes the schema"], 1,
       "INTO is additive. OVERWRITE replaces the target scope — without restriction, the entire table contents.", quick=True)
ch.tf(3, 1, ["pitfall", "exam"], "`TRUNCATE TABLE` removes the table object from the catalog.", False,
      "TRUNCATE removes rows; schema and table object remain. `DROP TABLE` removes the table object.", quick=True)
ch.calc(3, 1, ["calc"], "`ecommerce.silver.orders` has 1,000 rows. You run `INSERT OVERWRITE TABLE ecommerce.silver.orders SELECT * FROM staging.orders` where staging has 200 rows (no partition restriction). How many rows does the table have now?", 200,
        "INSERT OVERWRITE replaced the whole target scope with the 200 staging rows. With `INSERT INTO` it would have been 1,200.", unit="rows")
ch.cloze(3, 1, ["syntax"], "Daily batch ETL: copy today's Bronze rows into Silver.",
         """
         INSERT [[INTO]] ecommerce.silver.orders
         [[SELECT]] order_id, customer_id, amount, status, order_ts
         FROM ecommerce.bronze.orders_raw
         WHERE ingestion_date = [[current_date()]];
         """, "INSERT INTO … SELECT is the bread-and-butter additive load. Using OVERWRITE here would wipe all previous days.",
         bank=["OVERWRITE", "VALUES", "now"], asCode=True)
ch.bucket(3, 2, ["compare"], "TRUNCATE TABLE or DROP TABLE?", ["TRUNCATE TABLE", "DROP TABLE"],
          [("Schema remains", 0), ("Table object removed", 1), ("All rows removed, table still queryable", 0), ("Table no longer appears in SHOW TABLES", 1), ("You can INSERT into it immediately afterwards", 0)],
          "TRUNCATE empties; DROP deletes the object (and its definition).")
ch.odd(3, 2, ["concept"], "Which statement does NOT keep existing rows?",
       ["`INSERT INTO t VALUES (...)`", "`INSERT INTO t SELECT …`", "`df.writeTo(t).append()`", "`INSERT OVERWRITE TABLE t SELECT …`"], 3,
       "The first three are additive; INSERT OVERWRITE replaces the target scope.")

# =============== s04 append/overwrite/idempotency ===============
ch.mcq(4, 1, ["concept", "exam"], "When do you use append?",
       ["When the incoming rows are genuinely additive and don't replace existing state", "Whenever a job might retry", "When the target should exactly equal the DataFrame", "When fixing yesterday's wrong data"], 0,
       "Append = existing + new rows, no overlap. If rows overlap or correct existing state, you need MERGE/REPLACE WHERE; 'exactly equal' is full overwrite.", quick=True)
ch.tf(4, 1, ["pitfall", "exam"], "A full overwrite is dangerous when the DataFrame contains only a subset of the table (e.g. only yesterday).", True,
      "Overwrite replaces the logical state with the DataFrame: 3 years of data become 1 day. One of the most classic production mistakes.", quick=True)
ch.calc(4, 2, ["calc", "pitfall"], "Order id=5 has `amount = 100`. A job runs `UPDATE orders SET amount = amount + 10 WHERE id = 5`, fails after committing, and is retried once. What is the amount now?", 120,
        "+10 and +10 → 120. The statement is **not idempotent**: repeating it keeps changing the state. A MERGE that sets `amount = s.amount` would give the same result on every retry.", unit="")
ch.bucket(4, 2, ["concept", "pitfall"], "Idempotent (safe to re-run) or not?", ["Idempotent", "Not idempotent"],
          [("MERGE setting t.status = s.status from a deduplicated source", 0), ("UPDATE … SET amount = amount + 10", 1), ("Appending the same daily batch twice", 1), ("REPLACE WHERE order_date = '2026-09-27' with the same data", 0), ("Full overwrite with the same complete DataFrame", 0), ("Incrementing a counter column", 1)],
          "Idempotent writes **set** a final state; non-idempotent ones **add to** the current state (increments, blind appends).")
ch.scenario(4, 2, ["debug", "pitfall"], "Monday morning: `ecommerce.silver.orders` (3 years of data) now holds only Sunday's orders.", [
    ("First move?", [
        ("DESCRIBE HISTORY to find the last write and its operationParameters (mode)", True, "History reveals a WRITE with mode Overwrite — the smoking gun."),
        ("Re-run all ingestion jobs for 3 years", False, "Slow and unnecessary while history still has the good version."),
        ("VACUUM to clean up", False, "Would destroy the old files you need to recover!"),
    ]),
    ("History: v310 = WRITE mode=Overwrite by the daily job. Recovery?", [
        ("RESTORE TABLE … TO VERSION AS OF 309 (files still within retention)", True, "Creates v311 equal to the good state."),
        ("Time travel only — SELECT VERSION AS OF 309 fixes it", False, "Time travel reads; it doesn't make the state current."),
        ("Delete the v310 commit file", False, "Never hand-edit the log."),
    ]),
    ("Prevention?", [
        ("Change the daily job to append / MERGE / REPLACE WHERE order_date = <day>", True, "Never full-overwrite with a subset."),
        ("Keep overwrite but run it at night", False, "Timing doesn't change semantics."),
        ("Enable autoMerge", False, "Schema setting, unrelated."),
    ]),
], "Overwrite with a subset = data loss in the current state. Recover with RESTORE, prevent with append/MERGE/selective overwrite.")
ch.free(4, 2, ["concept", "interview"], "What does it mean that a MERGE is idempotent, and why does it matter for production jobs?",
        "Idempotent means that running the same operation again with the same input does not change the final logical state any further. A MERGE that sets target columns from a deduplicated source (e.g. id=5 → status 'PAID') gives the same table no matter how many times it runs. That matters because jobs retry after failures: a retry must not double-apply changes like `amount = amount + 10` or duplicate appended rows.",
        ["Same input re-run → same final state", "MERGE sets values (not increments)", "Retries are common in production", "Contrast with non-idempotent increments/appends"],
        "Mention **retries** and give a non-idempotent counter-example.")
ch.mcq(4, 2, ["concept"], "Daily file for 2026-09-27 may be re-delivered with corrections later that day. Which write is the best fit?",
       ["Append", "Full overwrite of the table", "Selective overwrite of that day (REPLACE WHERE) or MERGE on the key", "INSERT OVERWRITE without predicate"], 2,
       "Data overlap with existing rows, so plain append would duplicate; full overwrite would wipe other days. Replace that day's slice or MERGE by key — both idempotent.")

# =============== s05 selective overwrite ===============
ch.write(5, 1, ["syntax"], "Exercise 4: replace only `country = 'GR'` rows of `sales.orders` with `staging.orders_gr`, keeping DE/FR unchanged.",
         """
         INSERT INTO sales.orders
         REPLACE WHERE country = 'GR'
         SELECT * FROM staging.orders_gr;
         """, ["insert into sales.orders", "replace where country = 'gr'", "select"],
         "REPLACE WHERE replaces exactly the rows matching the predicate and leaves everything else untouched — far safer than a full overwrite.", quick=True)
ch.cloze(5, 2, ["syntax"], "Dynamic overwrite, modern style.",
         """
         INSERT INTO ecommerce.silver.orders
         [[REPLACE USING]] (order_date)
         SELECT * FROM ecommerce.staging.orders_daily;
         """, "REPLACE USING (cols) replaces target rows whose key-column values appear in the incoming data. Recommended over legacy partitionOverwriteMode=dynamic.",
         bank=["REPLACE WHERE", "OVERWRITE PARTITION", "MERGE USING"], asCode=True)
ch.mcq(5, 1, ["exam"], "Which pattern does Databricks recommend for selective overwrite in new workloads?",
       ["`partitionOverwriteMode = dynamic`", "`REPLACE WHERE` / `REPLACE USING` (or `REPLACE ON`) depending on use case", "Full overwrite then re-append old data", "DELETE then INSERT in two jobs"], 1,
       "The modern INSERT … REPLACE variants are atomic and explicit. Dynamic partition overwrite is legacy with compute limitations; DELETE + INSERT in two jobs isn't atomic.", quick=True)
ch.tf(5, 1, ["exam"], "`.option(\"partitionOverwriteMode\", \"dynamic\")` is the preferred choice for new workloads.", False,
      "It's legacy: still supported in some contexts, has compute limitations, and Databricks recommends REPLACE WHERE / REPLACE USING instead.")
ch.scenario(5, 3, ["debug", "pitfall"], "You ran a dynamic overwrite for 2026-09-27. Next day, analysts report that all of **2024-01-01**'s orders are gone except one row.", [
    ("What likely happened?", [
        ("The incoming data contained a stray row with order_date = 2024-01-01, so that whole slice was replaced", True, "Dynamic overwrite replaces every key present in the incoming data."),
        ("VACUUM deleted 2024 files", False, "VACUUM doesn't change the current snapshot."),
        ("A concurrency conflict dropped rows", False, "Conflicts fail transactions; they don't drop rows."),
    ]),
    ("How do you confirm?", [
        ("DESCRIBE HISTORY + time-travel compare the 2024-01-01 slice before/after the write", True, "Shows the slice shrank in that exact version."),
        ("DESCRIBE DETAIL", False, "Gives current size/files, not per-slice changes."),
        ("Check cluster logs only", False, "The data evidence is in history."),
    ]),
    ("Prevention for next time?", [
        ("Validate the incoming key domain (e.g. SELECT DISTINCT order_date) before writing, or use REPLACE WHERE with an explicit predicate", True, "REPLACE WHERE fails if rows violate the predicate."),
        ("Switch to full overwrite", False, "Even worse."),
        ("Increase VACUUM retention", False, "Helps recovery, not prevention."),
    ]),
], "Always validate the incoming key/partition domain; explicit predicates are safer than data-derived slices.")
ch.spotbug(5, 2, ["pitfall"], "A job should only replace 2026-09-27 in a 3-year table. Which line is the bug?",
           ["daily = spark.table('ecommerce.staging.orders_daily')", "daily = daily.filter(\"order_date = '2026-09-27'\")", "daily.write.mode('overwrite').saveAsTable('ecommerce.silver.orders')", "print('done')"], [2],
           """
           (daily.write.mode("overwrite")
                .option("replaceWhere", "order_date = '2026-09-27'")
                .saveAsTable("ecommerce.silver.orders"))
           # or SQL: INSERT INTO ecommerce.silver.orders REPLACE WHERE order_date = DATE'2026-09-27' SELECT ...
           """,
           "A plain overwrite replaces the **whole** table with one day. Restrict it with a replaceWhere predicate (the DataFrame form of REPLACE WHERE).")
ch.order(5, 2, ["pitfall"], "Order a safe selective-overwrite routine.",
         ["Decide which slice to replace (e.g. order_date = 2026-09-27)", "Validate the incoming key domain (SELECT DISTINCT order_date)", "INSERT INTO … REPLACE WHERE <slice predicate> SELECT …", "Check DESCRIBE HISTORY metrics for the new version"],
         "Decide → validate → replace explicitly → verify. Validation catches stray keys before they replace unintended slices.")
ch.mcq(5, 3, ["compare"], "Incoming data accidentally includes one row outside the intended date. Which option protects you best?",
       ["REPLACE USING (order_date)", "partitionOverwriteMode = dynamic", "REPLACE WHERE order_date = DATE'2026-09-27'", "Full overwrite"], 2,
       "REPLACE WHERE states the slice explicitly and validates that written rows match the predicate, so the stray row makes the write fail instead of wiping another slice. Data-derived dynamic options replace whatever keys arrive.")

# =============== s06 enforcement ===============
ch.mcq(6, 1, ["concept", "exam"], "What is schema enforcement?",
       ["Automatically adding new columns", "Validation on write that incoming columns/types are compatible with the target schema", "Casting everything to STRING", "Locking the schema forever"], 1,
       "Enforcement rejects incompatible writes (missing/unknown columns, unsafe types) using the schema stored in the log metadata.", quick=True)
ch.tf(6, 1, ["concept"], "Writing `amount INT` into a target column `amount BIGINT` can succeed through a safe cast.", True,
      "INT → BIGINT is safely castable. A complex STRUCT into BIGINT is not.", quick=True)
ch.bucket(6, 2, ["concept", "exam"], "Default behaviour (no evolution enabled): accepted or rejected?", ["Accepted", "Rejected"],
          [("INT into BIGINT column", 0), ("STRUCT<foo:INT> into DECIMAL(10,2) column", 1), ("Extra column `email` not in target", 1), ("Exactly matching columns and types", 0), ("STRUCT into BIGINT column", 1)],
          "Columns must exist and types must match or be safely castable. New columns need explicit evolution.")
ch.mcq(6, 2, ["concept"], "Which rules does Delta check on write? (choose all)",
       ["Columns must exist in the target", "Types must match or be safely castable", "Column order must match exactly for saveAsTable", "Row count must not decrease"], [0, 1],
       "Schema validation is about column existence and type compatibility. Column order matters only for positional APIs like insertInto; row counts aren't validated.")
ch.free(6, 2, ["exam", "interview"], "Difference between schema enforcement and schema evolution?",
        "Schema enforcement validates every write against the target schema and rejects incompatible data, protecting downstream tables from silent corruption. Schema evolution is a controlled, explicit change of the target schema so it can accept intentional structural changes, such as a new column, via mergeSchema, WITH SCHEMA EVOLUTION or ALTER TABLE.",
        ["Enforcement rejects incompatible data", "Evolution = controlled schema change", "Evolution must be explicit/intentional", "Examples of mechanisms"], "One protects, the other permits — explicitly.")
ch.odd(6, 2, ["concept"], "Which one is NOT a goal of schema enforcement?",
       ["Stop a bad producer before it corrupts Silver/Gold", "Reject a STRUCT arriving in a DECIMAL column", "Automatically add every new column a source sends", "Use the schema stored in the transaction log for validation"], 2,
       "Adding columns is evolution — opt-in and explicit. Enforcement's job is to reject.")

# =============== s07 evolution ===============
ch.mcq(7, 1, ["exam", "pitfall"], "Why is a global `spark.databricks.delta.schema.autoMerge.enabled = true` not the preferred production approach?",
       ["It's slower", "It lets many unrelated writes evolve schemas and hides which operation was allowed to", "It's deprecated and removed", "It only works with Parquet"], 1,
       "Session-wide evolution affects every subsequent write. Per-write `mergeSchema` or `WITH SCHEMA EVOLUTION` keeps the permission local and explicit.", quick=True)
ch.tf(7, 1, ["exam"], "`mergeSchema` and `overwriteSchema` do the same thing.", False,
      "mergeSchema evolves/adds compatible changes during a write; overwriteSchema replaces the table schema (and partitioning) during an overwrite.", quick=True)
ch.write(7, 1, ["syntax"], "Append `source_df` to `prod.silver.customers`, allowing schema evolution for this write only.",
         """
         (source_df.write
            .option("mergeSchema", "true")
            .mode("append")
            .saveAsTable("prod.silver.customers"))
         """, ["option(\"mergeschema\", \"true\")", "mode(\"append\")", "saveastable(\"prod.silver.customers\")"],
         "Per-write evolution: only this write may add `segment`. The rest of the session stays protected by enforcement.", lang="python")
ch.cloze(7, 2, ["syntax"], "MERGE that may evolve the schema for this operation only.",
         """
         MERGE [[WITH SCHEMA EVOLUTION]] INTO target t
         USING source s
         ON t.id = s.id
         WHEN MATCHED THEN UPDATE SET *
         WHEN NOT MATCHED THEN INSERT *;
         """, "`MERGE WITH SCHEMA EVOLUTION INTO` scopes evolution to that statement — the SQL counterpart of per-write mergeSchema.",
         bank=["WITH MERGESCHEMA", "AUTO MERGE", "OVERWRITE SCHEMA"], asCode=True)
ch.spotbug(7, 2, ["pitfall"], "A notebook fixing a failing append. Which line is the anti-pattern?",
           ["# source added column 'segment'", "spark.conf.set('spark.databricks.delta.schema.autoMerge.enabled', 'true')", "source_df.write.mode('append').saveAsTable('prod.silver.customers')", "other_df.write.mode('append').saveAsTable('prod.gold.kpis')"], [1],
           "source_df.write.option('mergeSchema', 'true').mode('append').saveAsTable('prod.silver.customers')",
           "The global setting also lets `other_df`'s write (and every later one) evolve schemas silently. Scope evolution to the one write that needs it — after confirming the new column is intentional.")
ch.scenario(7, 2, ["debug"], "Today's append to `prod.silver.customers` fails with a schema mismatch. Yesterday it worked.", [
    ("First step?", [
        ("Compare DESCRIBE TABLE with df.printSchema()", True, "See exactly which column/type differs."),
        ("Enable mergeSchema and re-run", False, "Blindly evolving can bake a source bug into Silver."),
        ("Drop the target and recreate it from the DataFrame", False, "Destroys data and history."),
    ], "DESCRIBE TABLE prod.silver.customers;\n-- vs\ndf.printSchema()"),
    ("The DataFrame has a new column `segment STRING`. Next question?", [
        ("Is `segment` an intentional addition, or a source bug?", True, "Intentional evolution vs bug is the key decision."),
        ("Which cluster ran the job?", False, "Irrelevant to schema."),
        ("How many files does the table have?", False, "Irrelevant here."),
    ]),
    ("Product confirms `segment` is intentional. Fix?", [
        ("Per-write .option('mergeSchema','true') (or ALTER TABLE ADD COLUMNS segment STRING)", True, "Local, explicit evolution."),
        ("Set autoMerge globally for the cluster", False, "Too broad: unrelated writes could evolve too."),
        ("Use overwriteSchema with append", False, "overwriteSchema replaces schema on overwrite — wrong tool."),
    ]),
], "DESCRIBE TABLE vs printSchema → new column/type/rename? → intentional? → explicit local evolution. Never blind mergeSchema.")
ch.match(7, 2, ["syntax"], "Match each tool to its effect.",
         [("option('mergeSchema','true')", "Evolve schema for this write"),
          ("autoMerge.enabled = true", "Evolve schema for all writes in the session"),
          ("option('overwriteSchema','true')", "Replace schema/partitioning during overwrite"),
          ("ALTER TABLE … ADD COLUMNS", "Manual, explicit schema change"),
          ("INSERT WITH SCHEMA EVOLUTION INTO", "SQL insert that may evolve schema (DBR 18.1+)")],
         "Know the scope of each: per write, per session, replace, manual DDL, per SQL statement.")
ch.write(7, 2, ["syntax"], "Manual evolution on `prod.silver.customers`: add `email STRING`, then rename `name` to `full_name`.",
         """
         ALTER TABLE prod.silver.customers ADD COLUMNS (email STRING);
         ALTER TABLE prod.silver.customers RENAME COLUMN name TO full_name;
         """, ["add columns (email string)", "rename column name to full_name"],
         "ALTER TABLE makes intentional changes explicit. Metadata-only rename (and drop) requires column mapping on the table.")
ch.tf(7, 3, ["exam", "pitfall"], "Metadata-only `RENAME COLUMN` and `DROP COLUMN` on Delta require column mapping support.", True,
      "Without column mapping, Delta identifies columns by name in the Parquet files, so renames/drops can't be metadata-only.")
ch.mcq(7, 2, ["exam"], "Which statement needs DBR 18.1+ according to the course?",
       ["`MERGE WITH SCHEMA EVOLUTION INTO …`", "`INSERT WITH SCHEMA EVOLUTION INTO … SELECT …`", "`.option('mergeSchema','true')`", "`ALTER TABLE … ADD COLUMNS`"], 1,
       "INSERT WITH SCHEMA EVOLUTION is the newest form (DBR 18.1+). MERGE WITH SCHEMA EVOLUTION, mergeSchema and ALTER have been around longer.")

# =============== s08 type widening / concurrency ===============
ch.mcq(8, 1, ["concept", "exam"], "What is type widening?",
       ["Any type change, e.g. INT → STRING", "A compatible move to a wider type, e.g. INT → BIGINT or FLOAT → DOUBLE, without rewriting data files for supported cases", "Adding new columns", "Increasing the number of partitions"], 1,
       "Widening keeps meaning and only expands range/precision. INT → STRING changes semantics and isn't widening.", quick=True)
ch.tf(8, 1, ["pitfall", "exam"], "`STRING → STRUCT` is a supported type widening.", False,
      "Widening ≠ arbitrary cast. STRING → STRUCT changes the data's meaning entirely; type evolution doesn't mean 'any type to any type'.", quick=True)
ch.write(8, 2, ["syntax"], "Enable type widening on `ecommerce.silver.orders` and widen `quantity` to BIGINT.",
         """
         ALTER TABLE ecommerce.silver.orders
         SET TBLPROPERTIES ('delta.enableTypeWidening' = 'true');

         ALTER TABLE ecommerce.silver.orders
         ALTER COLUMN quantity TYPE BIGINT;
         """, ["delta.enableTypeWidening", "alter column quantity type bigint"],
         "Type widening is a table feature: enable it, then widen. Supported changes don't rewrite the underlying Parquet files.")
ch.bucket(8, 2, ["concept"], "Supported widening or not?", ["Supported widening", "Not widening"],
          [("INT → BIGINT", 0), ("FLOAT → DOUBLE", 0), ("SHORT → INT", 0), ("BYTE → DECIMAL", 0), ("INT → STRING", 1), ("BIGINT → INT", 1), ("STRING → STRUCT", 1)],
          "Widening goes to a wider compatible numeric type. Narrowing (BIGINT → INT) loses range; INT → STRING / STRING → STRUCT change meaning.")
ch.scenario(8, 2, ["debug"], "12:00 — a streaming pipeline writing to `prod.silver.orders` fails with `MetadataChangedException`. At 12:00 a colleague ran `ALTER TABLE prod.silver.orders ADD COLUMNS (channel STRING)`.", [
    ("Is this a Delta bug?", [
        ("No — schema changes are metadata commits that conflict with concurrent writes", True, "Expected optimistic-concurrency semantics."),
        ("Yes — the table is corrupted", False, "Concurrency exceptions prevent corruption."),
        ("Yes — streaming doesn't support Delta", False, "It does; it just reacts to schema changes."),
    ]),
    ("What else should you expect?", [
        ("Streams reading the table may stop until restarted", True, "Schema changes can halt streaming readers too."),
        ("All old versions are deleted", False, "Nothing like that happens."),
        ("The column is silently dropped", False, "The ALTER committed fine."),
    ]),
    ("Process fix?", [
        ("Coordinate schema changes with pipeline owners (maintenance window), then restart affected streams", True, "Databricks recommends coordinating schema updates."),
        ("Disable the transaction log during ALTERs", False, "Not a thing."),
        ("Enable autoMerge globally so ALTERs aren't needed", False, "Trades a coordination problem for uncontrolled evolution."),
    ]),
], "Schema change = metadata change → conflicts with concurrent writers and can stop streams. Coordinate it.")
ch.tf(8, 2, ["concept"], "Supported type-widening changes rewrite all the table's Parquet files.", False,
      "Supported widening is metadata-level: the underlying data files are not rewritten — readers upcast values on read.")
ch.order(8, 1, ["syntax"], "Order the steps to widen `quantity` from INT to BIGINT safely in production.",
         ["Coordinate the change with pipelines writing the table", "ALTER TABLE … SET TBLPROPERTIES ('delta.enableTypeWidening' = 'true')", "ALTER TABLE … ALTER COLUMN quantity TYPE BIGINT", "Restart streams that read the table if they stopped"],
         "Schema changes are metadata commits that conflict with concurrent writes — coordinate first, enable the feature, widen, then restart affected streams.")

# =============== s09 DESCRIBE DETAIL ===============
ch.mcq(9, 1, ["concept", "exam"], "What does `DESCRIBE DETAIL` show?",
       ["Every version with its operation", "Current table-level metadata: format, location, numFiles, sizeInBytes, partitioning, properties/features", "Column names only", "Running queries"], 1,
       "DETAIL = one row of current table metadata. Versions → DESCRIBE HISTORY; columns → DESCRIBE TABLE.", quick=True)
ch.match(9, 1, ["compare"], "Which command answers which question?",
         [("DESCRIBE TABLE", "Which columns and types?"), ("DESCRIBE HISTORY", "Who changed what, when?"), ("DESCRIBE DETAIL", "How many files and bytes?"), ("df.printSchema()", "What schema does my DataFrame have?")],
         "Schema-mismatch debugging pairs DESCRIBE TABLE with printSchema; storage debugging uses DETAIL; data-change debugging uses HISTORY.", quick=True)
ch.calc(9, 2, ["calc", "debug"], "DESCRIBE DETAIL shows `sizeInBytes` = 20 GB and `numFiles` = 200,000. What's the average file size in **KB**? (use 1 GB = 1,000,000 KB)", 100,
        "20,000,000 KB / 200,000 = 100 KB per file — classic small-file pressure. Healthy Delta files are typically in the hundreds of MB to ~1 GB range.", unit="KB")
ch.tf(9, 1, ["concept"], "`DESCRIBE DETAIL` returns one row with table-level metadata.", True,
      "One row: format, location, size, numFiles, partition/clustering columns, properties, features…")
ch.odd(9, 2, ["concept"], "Which field does NOT come from DESCRIBE DETAIL?",
       ["numFiles", "sizeInBytes", "operationMetrics", "location"], 2,
       "operationMetrics is per-version info from DESCRIBE HISTORY.")
ch.mcq(9, 3, ["debug"], "Cloud bill for the table's storage doubled, but `DESCRIBE DETAIL` `sizeInBytes` stayed flat. Most likely explanation?",
       ["DETAIL is broken", "DETAIL measures the current snapshot; old unreferenced files (history) aren't counted — check VACUUM/retention", "The table switched to Parquet", "Deletion vectors doubled the size"], 1,
       "Removed files still occupy storage until VACUUM. DETAIL reports the current snapshot only, so history-driven storage growth is invisible there.")

# =============== s10 OPTIMIZE / small files ===============
ch.mcq(10, 1, ["concept", "exam"], "What is the small-file problem?",
       ["Files under 1 GB can't be read", "Too many small physical files create metadata, file-open and task-scheduling overhead", "Parquet compresses small files badly", "Small files break ACID"], 1,
       "Total bytes may be fine; the number of files kills performance: listing, metadata, many tiny tasks, poor scan efficiency.", quick=True)
ch.tf(10, 1, ["exam", "pitfall"], "OPTIMIZE physically deletes old unreferenced files from storage.", False,
      "OPTIMIZE rewrites active files into a better layout (new version). Deleting old unreferenced files is VACUUM's job, after retention.", quick=True)
ch.calc(10, 1, ["calc"], "A 10 GB dataset is stored as files of 100 KB each. How many files is that? (1 GB = 1,000,000 KB)", 100000,
        "10,000,000 KB / 100 KB = 100,000 files — option B from the lesson, versus 10 × 1 GB in option A. Same bytes, vastly more overhead.", unit="files")
ch.mcq(10, 2, ["concept"], "Without clustering/Z-order, what does `OPTIMIZE` do?",
       ["Bin packing: compacts small files into more balanced, larger files", "Sorts all data by primary key", "Deletes duplicates", "Collects statistics only"], 0,
       "Plain OPTIMIZE = bin packing. With liquid clustering it also organizes data by the clustering keys.")
ch.bucket(10, 2, ["compare", "exam"], "OPTIMIZE or VACUUM?", ["OPTIMIZE", "VACUUM"],
          [("Rewrites active data files", 0), ("Deletes old unreferenced files", 1), ("Fixes small-file pressure", 0), ("Reduces storage after DELETEs (after retention)", 1), ("Commits REMOVE/ADD with dataChange=false", 0), ("Garbage collection", 1)],
          "OPTIMIZE = layout/performance; VACUUM = physical cleanup. Often run together: OPTIMIZE, then later VACUUM removes the replaced small files.")
ch.scenario(10, 2, ["debug"], "`ecommerce.silver.orders` storage and query times exploded after a streaming job went live.", [
    ("First command?", [
        ("DESCRIBE DETAIL ecommerce.silver.orders", True, "numFiles and sizeInBytes reveal file count and average size."),
        ("DESCRIBE HISTORY only", False, "Useful later, but file counts come from DETAIL."),
        ("VACUUM RETAIN 0 HOURS", False, "Dangerous and doesn't fix layout."),
    ], "DESCRIBE DETAIL ecommerce.silver.orders;"),
    ("numFiles = 450,000, average ~50 KB. Diagnosis?", [
        ("Small-file pressure from frequent tiny writes", True, "Hundreds of thousands of tiny files = classic small-file problem."),
        ("Data skew", False, "Skew is uneven partition sizes, not tiny files."),
        ("Schema mismatch", False, "Unrelated."),
    ]),
    ("Fix?", [
        ("Run OPTIMIZE (or enable predictive optimization), then VACUUM after retention to drop replaced files", True, "Compaction + later cleanup."),
        ("Only VACUUM", False, "VACUUM doesn't compact active files."),
        ("Increase driver memory", False, "Doesn't change file layout."),
    ]),
], "DETAIL → numFiles/sizeInBytes → small files → OPTIMIZE (+ predictive optimization) and VACUUM later.")
ch.tf(10, 3, ["concept"], "After OPTIMIZE, the commit can use `dataChange = false` because the data was rearranged, not logically changed.", True,
      "The protocol's dataChange flag distinguishes rearrangement (compaction) from real record changes — e.g. so streaming readers don't reprocess compacted files as new data.")

# =============== s11 data skipping ===============
ch.calc(11, 1, ["calc", "concept"], "Stats: file A customer_id 1–1000, file B 1001–2000, file C 2001–3000. Query: `WHERE customer_id = 2500`. How many files must be read?", 1,
        "Only C's min/max range can contain 2500. A and B are skipped without being opened — that's data skipping.", unit="files", quick=True)
ch.mcq(11, 1, ["exam"], "What is data skipping?",
       ["Skipping corrupted files", "Using file statistics so files that cannot contain matching rows are not read", "Sampling 10% of the data", "Skipping VACUUM"], 1,
       "Min/max (and null count) stats per file let the engine prove a file can't match the predicate.", quick=True)
ch.mcq(11, 2, ["concept"], "Which file-level statistics does Delta typically store? (choose all)",
       ["min values", "max values", "null counts", "row count", "average query latency"], [0, 1, 2, 3],
       "These stats live in the add actions and drive pruning, skipping and planning. Query latency is not file metadata.")
ch.tf(11, 2, ["concept", "pitfall"], "If every file contains customer_ids from 1 to 3000, min/max statistics can still skip most files for `customer_id = 2500`.", False,
      "Each file's range [1, 3000] contains 2500, so no file can be skipped. Skipping needs a layout where values are clustered into narrow per-file ranges.")
ch.scenario(11, 3, ["debug"], "`SELECT * FROM ecommerce.silver.orders WHERE customer_id = 1234` still scans most of the table.", [
    ("What do you investigate first?", [
        ("Table layout and clustering: is data organized by customer_id?", True, "Without clustering, every file spans many customers."),
        ("Driver memory", False, "Scan volume isn't a memory setting."),
        ("Schema enforcement", False, "Unrelated."),
    ]),
    ("Layout: partitioned by order_date, no clustering. Stats exist but every file spans the full customer_id range. Also check?", [
        ("Filter selectivity and whether data skipping actually prunes files", True, "Confirms skipping is ineffective due to layout."),
        ("Whether VACUUM ran", False, "VACUUM doesn't affect current file ranges."),
        ("insertInto usage", False, "Unrelated."),
    ]),
    ("Fix?", [
        ("Consider liquid clustering on customer_id, then OPTIMIZE (FULL for existing data)", True, "Clusters values into narrow ranges so skipping works."),
        ("Add more workers", False, "Scans the same data faster but more expensively."),
        ("Partition by customer_id", False, "High-cardinality partitioning creates huge numbers of tiny partitions — liquid clustering is the modern answer."),
    ]),
], "Layout → clustering → stats → selectivity → skipping. Liquid clustering on the filter column is often the fix.")
ch.free(11, 2, ["concept"], "Explain why data skipping can fail even though Delta collects min/max statistics.",
        "Statistics only help if each file holds a narrow range of the filtered column. If data was written in arrival order, every file may contain nearly the full range of customer_id, so for any value every file's min/max range overlaps and nothing can be skipped. Missing statistics for that column or a non-selective filter also defeat skipping. Clustering the data on the filter column fixes the ranges.",
        ["Stats help only with narrow per-file ranges", "Overlapping ranges → nothing skipped", "Missing stats / low selectivity", "Clustering as fix"], "Link stats to physical layout.")

# =============== s12 liquid clustering ===============
ch.mcq(12, 1, ["exam", "compare"], "Why is liquid clustering different from static partitioning?",
       ["It stores data in JSON", "Clustering keys can evolve without immediately redesigning/rewriting the historical layout, and clustering is applied incrementally", "It requires ZORDER on every column", "It only works on external tables"], 1,
       "Partitioning is a fixed physical design; liquid clustering is adaptable and incremental.", quick=True)
ch.cloze(12, 2, ["syntax"], "Cluster the orders table by customer and recluster existing data.",
         """
         ALTER TABLE ecommerce.silver.orders
         [[CLUSTER BY]] (customer_id);

         OPTIMIZE ecommerce.silver.orders [[FULL]];
         """, "ALTER … CLUSTER BY sets the keys; OPTIMIZE … FULL applies clustering to all existing data (plain OPTIMIZE clusters incrementally).",
         bank=["PARTITIONED BY", "ZORDER BY", "ALL"], asCode=True, quick=True)
ch.tf(12, 2, ["pitfall", "exam"], "Running `ALTER TABLE … CLUSTER BY (customer_id)` immediately rewrites all historical data.", False,
      "Changing keys doesn't force an immediate rewrite. New writes/OPTIMIZE apply clustering incrementally; OPTIMIZE FULL reclusters everything.")
ch.mcq(12, 2, ["concept"], "Which column is the best liquid-clustering candidate for an orders table queried mostly with `WHERE customer_id = ?` and joined to customers?",
       ["`status` (4 distinct values)", "`customer_id`", "`amount`", "`ingestion_ts` (never filtered)"], 1,
       "Good keys are used in filters/joins/selective lookups and have enough cardinality for layout to help. status has too few values; never-filtered columns don't help.")
ch.odd(12, 2, ["concept"], "Which is NOT a typical reason to choose a clustering key?",
       ["Frequently used in filters", "Used in joins", "Selective lookups on it", "It has only 2 distinct values"], 3,
       "Very low cardinality gives physical ordering little to work with.")
ch.write(12, 2, ["syntax"], "Assignment steps 18–19: enable clustering on `ecommerce.silver.orders` by `customer_id`, then cluster all existing data.",
         """
         ALTER TABLE ecommerce.silver.orders CLUSTER BY (customer_id);
         OPTIMIZE ecommerce.silver.orders FULL;
         """, ["cluster by (customer_id)", "optimize ecommerce.silver.orders full"],
         "CLUSTER BY sets keys; OPTIMIZE FULL rewrites existing data accordingly. Afterwards compare DESCRIBE HISTORY/DETAIL.")
ch.mcq(12, 3, ["concept"], "Which statements about liquid clustering are true? (choose all)",
       ["Databricks recommends it for many new Delta tables instead of partitioning + ZORDER", "Clustering keys can change as query patterns change", "Liquid-clustered tables also use row-level concurrency", "You should combine it with partitionBy on the same keys for best results"], [0, 1, 2],
       "Liquid clustering replaces partitioning/ZORDER rather than stacking on top of them.")

# =============== s13 predictive optimization ===============
ch.mcq(13, 1, ["exam"], "Which maintenance operations can predictive optimization run automatically? (choose all)",
       ["OPTIMIZE", "VACUUM", "ANALYZE", "RESTORE", "MERGE"], [0, 1, 2],
       "PO handles maintenance: compaction/clustering, cleanup, statistics. RESTORE and MERGE are data operations you decide.", quick=True)
ch.tf(13, 1, ["pitfall"], "With predictive optimization enabled you no longer need to understand optimization.", False,
      "Automation doesn't replace engineering understanding: you still debug small files, failed skipping, bad clustering keys and huge scans.", quick=True)
ch.mcq(13, 1, ["concept"], "Predictive optimization is recommended for which tables?",
       ["Any Parquet folder", "Unity Catalog managed tables", "Only external tables", "Only streaming tables"], 1,
       "Databricks recommends PO for UC managed tables — it monitors and maintains them, and also collects statistics.")
ch.bucket(13, 1, ["compare"], "Manual maintenance or predictive optimization?", ["Manual", "Predictive optimization"],
          [("You schedule OPTIMIZE every Sunday", 0), ("Databricks decides which tables benefit", 1), ("You schedule VACUUM every Monday", 0), ("Maintenance runs when useful", 1), ("Collects statistics on UC managed tables", 1)],
          "PO turns calendar-driven maintenance into need-driven maintenance.")
ch.free(13, 2, ["interview"], "A teammate says: \"We enabled predictive optimization, so performance tuning is solved.\" Respond.",
        "Predictive optimization automates maintenance on UC managed tables — it runs OPTIMIZE, VACUUM and ANALYZE when it judges they help. But it doesn't choose the right clustering keys for our queries, doesn't fix a pipeline that writes millions of tiny files, and doesn't explain why a query scans everything. We still need to understand small files, data skipping, statistics and layout to debug and design tables.",
        ["PO = automated OPTIMIZE/VACUUM/ANALYZE on UC managed tables", "Doesn't replace understanding", "Examples: clustering keys, small files, skipping, huge scans"], "Balance: appreciate automation, keep ownership.")

# =============== s14 project / workflows / best practices ===============
ch.match(14, 1, ["debug"], "Match each debugging workflow to its first command.",
         [("MERGE fails: multiple source rows matched", "GROUP BY key HAVING COUNT(*) > 1"),
          ("Write fails: schema mismatch", "DESCRIBE TABLE vs df.printSchema()"),
          ("Storage exploded", "DESCRIBE DETAIL (numFiles, sizeInBytes)"),
          ("Query scans too much", "Inspect layout, clustering, stats, skipping"),
          ("Someone broke data", "DESCRIBE HISTORY")],
         "Five workflows, five entry points. Memorize the pairs — they are the first 30 seconds of every Delta incident.", quick=True)
ch.mcq(14, 1, ["exam"], "Which is NOT one of the Phase 2 best practices?",
       ["Deduplicate source before MERGE", "Enable schema evolution explicitly and locally", "Use time travel as long-term backup", "Prefer liquid clustering over static partitions for many cases"], 2,
       "Rule 10 says the opposite: do NOT treat time travel as long-term backup.", quick=True)
ch.order(14, 2, ["concept"], "Order the first part of the practical assignment.",
         ["CREATE TABLE", "INSERT initial rows", "Append new rows", "UPDATE one row", "DELETE one row", "MERGE updates + inserts", "Intentionally duplicate a source key", "Deduplicate with ROW_NUMBER", "Run MERGE again to prove idempotency"],
         "Steps 1–9: build up writes, DML, then break and fix MERGE and prove idempotency.")
ch.order(14, 2, ["concept"], "Order the second part of the practical assignment.",
         ["Add a new column with mergeSchema", "DESCRIBE DETAIL / DESCRIBE HISTORY", "Query VERSION AS OF", "RESTORE", "Create many small files", "OPTIMIZE and inspect numFiles before/after", "Enable clustering", "OPTIMIZE FULL", "Inspect behaviour/history"],
         "Steps 10–20: schema evolution, inspection, time travel/restore, then small files → OPTIMIZE → clustering → OPTIMIZE FULL.")
ch.bucket(14, 2, ["pitfall", "exam"], "Best practice or anti-pattern?", ["Best practice", "Anti-pattern"],
          [("Prefer UC managed Delta tables", 0), ("Blind full overwrite with a daily DataFrame", 1), ("Prefer REPLACE WHERE / REPLACE USING over dynamic partition overwrite", 0), ("Global autoMerge for the whole cluster", 1), ("Use MERGE for idempotent upserts", 0), ("Treat time travel as backup", 1), ("Enable predictive optimization on UC managed tables", 0), ("Design everything around static partitions", 1)],
          "The 13 rules reduce to: explicit, local, idempotent, and let the platform maintain layout — while you understand it.")
ch.write(14, 2, ["syntax"], "Write the project's idempotent MERGE: target `ecommerce.silver.orders`, source `ecommerce.staging.orders_updates` on `order_id`; on match set customer_id, amount, status, `updated_at = current_timestamp()`; otherwise insert those columns.",
         """
         MERGE INTO ecommerce.silver.orders AS t
         USING ecommerce.staging.orders_updates AS s
         ON t.order_id = s.order_id
         WHEN MATCHED THEN UPDATE SET
           t.customer_id = s.customer_id,
           t.amount = s.amount,
           t.status = s.status,
           t.updated_at = current_timestamp()
         WHEN NOT MATCHED THEN INSERT (order_id, customer_id, amount, status, updated_at)
         VALUES (s.order_id, s.customer_id, s.amount, s.status, current_timestamp());
         """, ["merge into ecommerce.silver.orders", "on t.order_id = s.order_id", "when matched then update set", "t.updated_at = current_timestamp()", "when not matched then insert"],
         "It **sets** values from the source, so re-running yields the same business state (only `updated_at` refreshes). That's what makes retries safe.")
ch.order(14, 2, ["debug"], "Order the schema-mismatch workflow.",
         ["Write fails", "DESCRIBE TABLE on the target", "Compare with df.printSchema()", "Classify: new column / different type / rename", "Decide: intentional evolution or source bug?", "Evolve explicitly (mergeSchema / ALTER) or fix the source"],
         "Workflow 2. The decision point is 'intentional or bug?' — never blindly enable mergeSchema.")
ch.tf(14, 1, ["debug"], "In the 'someone broke data' workflow, RESTORE comes before DESCRIBE HISTORY.", False,
      "History first (find the bad version), time travel to confirm the last good one, then RESTORE if needed.")
ch.mcq(14, 2, ["concept"], "Why does the project MERGE count as idempotent even though it sets `updated_at = current_timestamp()`?",
       ["It isn't idempotent at all", "Business columns are set from the source, so re-runs converge to the same logical state; only the audit timestamp refreshes", "current_timestamp() is constant forever", "MERGE is always idempotent regardless of SET expressions"], 1,
       "Idempotency is about the final logical/business state. An audit timestamp changing is acceptable; `amount = amount + 10` would not be. A MERGE with increments is not idempotent.")

# ---- coverage additions ----
ch.tf(5, 2, ["exam"], "According to the course, `REPLACE WHERE` is supported on all compute types, while legacy dynamic partition overwrite has compute limitations.", True,
      "One more reason to prefer REPLACE WHERE / REPLACE USING for new workloads: no compute-type restrictions, explicit semantics, atomic replacement.")

# ---- extra code drills ----
ch.cloze(7, 2, ["syntax", "pitfall"], "Overwrite the table AND replace its schema (deliberately).",
         """
         (df.write
            .mode("[[overwrite]]")
            .option("[[overwriteSchema]]", "true")
            .saveAsTable("ecommerce.silver.orders"))
         """, "overwriteSchema only makes sense with overwrite mode: it replaces data and schema/partitioning. To just add a column during append, use mergeSchema instead.",
         bank=["append", "mergeSchema", "replaceWhere"], asCode=True)
ch.spotbug(7, 3, ["pitfall", "exam"], "Goal: append today's rows and accept the new `segment` column. Which line is wrong?",
           ["(source_df.write", "   .mode('overwrite')", "   .option('overwriteSchema', 'true')", "   .saveAsTable('prod.silver.customers'))"], [1, 2],
           "(source_df.write\n   .mode('append')\n   .option('mergeSchema', 'true')\n   .saveAsTable('prod.silver.customers'))",
           "overwrite + overwriteSchema replaces the whole table (data and schema) with today's rows. Appending with an extra column needs mode append + mergeSchema.")
ch.spotbug(12, 2, ["pitfall", "syntax"], "Goal: cluster the existing orders by customer_id. Which line won't do what the comment claims?",
           ["ALTER TABLE ecommerce.silver.orders CLUSTER BY (customer_id);", "-- now ALL historical data is clustered by customer_id", "SELECT * FROM ecommerce.silver.orders WHERE customer_id = 1234;"], [1],
           "ALTER TABLE ecommerce.silver.orders CLUSTER BY (customer_id);\nOPTIMIZE ecommerce.silver.orders FULL;  -- recluster existing data",
           "Setting CLUSTER BY doesn't rewrite historical data. Run OPTIMIZE … FULL to apply clustering to all existing records (plain OPTIMIZE is incremental).")
ch.cloze(9, 1, ["syntax", "debug"], "Storage debugging: fill in the command and the two fields you read first.",
         """
         DESCRIBE [[DETAIL]] ecommerce.silver.orders;
         -- look at: [[numFiles]] and [[sizeInBytes]]
         """, "DESCRIBE DETAIL gives one row of table-level metadata; numFiles and sizeInBytes reveal small-file pressure (average file size).",
         bank=["HISTORY", "TABLE", "operationMetrics", "version"], asCode=True)
ch.cloze(10, 1, ["syntax"], "Compact small files.",
         "[[OPTIMIZE]] ecommerce.silver.orders;",
         "OPTIMIZE bin-packs small files into larger ones (and clusters if keys are set). VACUUM would only delete old unreferenced files.",
         bank=["VACUUM", "ANALYZE", "REORG"], asCode=True)

# ---- extra debug drills ----
ch.scenario(2, 2, ["debug", "pitfall"], "After yesterday's load, `ecommerce.silver.customers.id` contains values like 'Maria' cast weirdly / NULLs, and `name` contains numbers. No job failed.", [
    ("First suspicion?", [
        ("The load used a positional writer (insertInto) with a different column order", True, "Silent swaps without errors are the signature of positional resolution."),
        ("Schema enforcement is broken", False, "Enforcement checks types/columns, not intended mapping by position."),
        ("VACUUM corrupted the data", False, "VACUUM doesn't change current data."),
    ]),
    ("The code: df.select('name','id').write.insertInto(target). Fix?", [
        ("Use df.writeTo(target).append() (name-based) or select columns in target order", True, "Removes the positional dependency."),
        ("Add mergeSchema", False, "Schema evolution doesn't fix mapping."),
        ("Switch to overwrite mode", False, "Would wipe the table and still swap columns."),
    ]),
    ("And the bad rows already written?", [
        ("Find the bad version in DESCRIBE HISTORY and RESTORE (or repair) it", True, "History pinpoints the load; RESTORE repairs."),
        ("Ignore them", False, "Silent corruption propagates to Gold."),
        ("Delete the _delta_log commit", False, "Never hand-edit the log."),
    ]),
], "Positional writes swap columns silently when types can be coerced. Use name-based APIs.")
ch.order(2, 2, ["debug"], "Values landed in the wrong columns. Order the investigation.",
         ["Check whether the writer used insertInto (positional)", "Compare DataFrame column order with DESCRIBE TABLE", "Fix code: name-based API or reorder columns", "RESTORE or repair the version that introduced bad rows"],
         "Identify the positional API, prove the order mismatch, fix the code, then repair the data.")
ch.order(4, 2, ["debug"], "A table lost years of rows after a daily job. Order your response.",
         ["DESCRIBE HISTORY: find the WRITE with mode Overwrite", "Confirm the DataFrame contained only a subset", "RESTORE the last good version (within retention)", "Change the job to append / MERGE / REPLACE WHERE"],
         "Locate, confirm, recover, prevent.")
ch.order(8, 2, ["debug"], "A writer fails with MetadataChangedException right after an ALTER TABLE. Order the response.",
         ["DESCRIBE HISTORY: find the concurrent ALTER / schema-evolving write", "Confirm the error is MetadataChangedException", "Restart the failed writer and any stopped streams", "Agree a coordination process for future schema changes"],
         "It's expected concurrency semantics: identify the change, restart, and coordinate next time.")
ch.order(10, 2, ["debug"], "Storage exploded. Order the workflow.",
         ["DESCRIBE DETAIL: read numFiles and sizeInBytes", "Compute average file size", "Identify writers producing tiny files", "OPTIMIZE (or enable predictive optimization)", "VACUUM after retention to remove replaced files"],
         "Measure, diagnose small-file pressure, find the cause, compact, then clean up.")
ch.order(11, 2, ["debug"], "A selective query scans too much. Order the checks.",
         ["Table layout (partitioned / clustered?)", "Clustering on the filter column?", "Statistics collected for that column?", "Filter selectivity", "Is data skipping pruning files?"],
         "Workflow 4: layout → clustering → stats → selectivity → skipping; often the fix is liquid clustering on the filter column.")

# =============== Playbooks ===============
ch.playbook(1, "Write fails: schema mismatch", 7,
            "Append/MERGE that worked yesterday fails today with a schema mismatch error (e.g. new column `segment`).",
            ["What does DESCRIBE TABLE show vs df.printSchema()?", "Is it a new column, a different type, or a renamed column?", "Is this intentional evolution or a source bug?", "If intentional, can I evolve explicitly and locally (mergeSchema / WITH SCHEMA EVOLUTION / ALTER TABLE)?", "Is it a widening (INT → BIGINT) that needs type widening rather than a cast?"],
            [("Compare schemas", "Find the exact difference", "DESCRIBE TABLE ecommerce.silver.orders;\n-- vs df.printSchema()"),
             ("Classify the change", "New column / type / rename lead to different fixes", None),
             ("Confirm intent with the producer", "Don't bake source bugs into Silver", None),
             ("Evolve explicitly", "Local evolution keeps other writes protected", "(source_df.write.option(\"mergeSchema\", \"true\")\n   .mode(\"append\").saveAsTable(\"prod.silver.customers\"))")],
            ["Producer added a column", "Producer changed a type", "Column renamed upstream", "Upstream bug"],
            "Never blindly enable mergeSchema or global autoMerge; evolve per write or via ALTER TABLE once the change is confirmed intentional.",
            mnemonic="3C + E: Compare, Classify, Confirm — then Evolve")
ch.playbook(2, "Storage exploded", 10,
            "Storage and/or query time grew sharply; listing the table is slow.",
            ["What do numFiles and sizeInBytes say in DESCRIBE DETAIL?", "Is the average file size tiny (small-file pressure)?", "Which writes produce many small files?", "Has OPTIMIZE run — and VACUUM afterwards, past retention?", "Is predictive optimization enabled for this UC managed table?", "Is the growth actually old history files (not counted in DETAIL)?"],
            [("DESCRIBE DETAIL", "numFiles, sizeInBytes → average file size", "DESCRIBE DETAIL ecommerce.silver.orders;"),
             ("Compact", "Bin-pack small files", "OPTIMIZE ecommerce.silver.orders;"),
             ("Clean up after retention", "Remove replaced files", "VACUUM ecommerce.silver.orders;"),
             ("Automate", "Let PO maintain UC managed tables", None)],
            ["Frequent tiny appends/streaming micro-batches", "No compaction", "No VACUUM after rewrites"],
            "OPTIMIZE (or predictive optimization), VACUUM after retention, and fix writers that produce tiny files.",
            mnemonic="DETAIL → Divide (size/files) → OPTIMIZE → VACUUM")
ch.playbook(3, "Query scans too much", 11,
            "`WHERE customer_id = 1234` still reads most of the table's files.",
            ["How is the table laid out (partitioned, clustered, neither)?", "Is it clustered on the column I filter by?", "Are statistics collected for that column?", "Is the filter actually selective?", "Is data skipping pruning files at all?"],
            [("Check DESCRIBE DETAIL partition/clustering columns", "Know the current layout", "DESCRIBE DETAIL ecommerce.silver.orders;"),
             ("Cluster on the filter column", "Narrow per-file ranges enable skipping", "ALTER TABLE ecommerce.silver.orders CLUSTER BY (customer_id);\nOPTIMIZE ecommerce.silver.orders FULL;")],
            ["No clustering on filter column", "Overlapping min/max ranges", "Missing stats", "Unselective filter"],
            "Liquid clustering on the frequently filtered/joined column, then OPTIMIZE FULL; keep stats current (predictive optimization/ANALYZE).",
            mnemonic="L-C-S-S-S: Layout, Clustering, Stats, Selectivity, Skipping")
ch.playbook(4, "Writer fails right after a schema change (MetadataChangedException)", 8,
            "A streaming/batch writer fails with `MetadataChangedException` at the moment someone ran ALTER TABLE; streams reading the table stop.",
            ["Did someone run ALTER TABLE or a schema-evolving write at that time (DESCRIBE HISTORY)?", "Is the error MetadataChangedException?", "Are streaming readers now stopped and needing a restart?", "Can schema changes be coordinated with the pipelines that write this table?"],
            [("DESCRIBE HISTORY", "Find the concurrent metadata change", "DESCRIBE HISTORY prod.silver.orders;"),
             ("Restart affected writers/streams", "They must pick up the new metadata", None),
             ("Agree on a change process", "Coordinate schema updates", None)],
            ["Concurrent ALTER TABLE", "Schema-evolving write in another job"],
            "Treat it as expected concurrency semantics: retry/restart, and coordinate future schema changes.",
            mnemonic="Schema change = metadata commit = conflict")
ch.playbook(5, "Table lost most of its rows after a write", 4,
            "A table with years of data now only contains the latest batch.",
            ["Was the last write mode overwrite (DESCRIBE HISTORY → operationParameters)?", "Did the DataFrame contain only a subset?", "Which version was the last good one, and are its files still within retention?", "Should this job use append, MERGE or REPLACE WHERE instead?"],
            [("DESCRIBE HISTORY", "Find the overwrite", "DESCRIBE HISTORY ecommerce.silver.orders;"),
             ("RESTORE", "Bring back the last good state as a new version", "RESTORE TABLE ecommerce.silver.orders TO VERSION AS OF 309;"),
             ("Fix the job's write semantics", "Prevent recurrence", None)],
            ["Full overwrite with a subset DataFrame", "INSERT OVERWRITE without predicate"],
            "RESTORE, then switch the job to append / MERGE / REPLACE WHERE.",
            mnemonic="Subset + overwrite = loss")
ch.playbook(6, "Dynamic overwrite replaced an unexpected slice", 5,
            "After a 'one-day' dynamic overwrite, a different date's data shrank to a few rows.",
            ["Which keys/partitions did the incoming data actually contain (SELECT DISTINCT)?", "Did a stray row carry an unexpected date?", "Which version changed the slice (history + time travel)?", "Would REPLACE WHERE with an explicit predicate have failed safely?"],
            [("Inspect incoming key domain", "Find stray keys", "SELECT DISTINCT order_date FROM ecommerce.staging.orders_daily;"),
             ("Compare versions for the damaged slice", "Confirm the culprit write", None),
             ("Restore/repair and switch to REPLACE WHERE", "Explicit predicate validates rows", None)],
            ["Data-derived overwrite with stray keys", "No validation of incoming domain"],
            "Validate the incoming domain; prefer explicit REPLACE WHERE; repair with RESTORE or re-load of the slice.",
            mnemonic="Validate the domain before you replace")
ch.playbook(7, "Values landed in the wrong columns", 2,
            "After a load, `id` contains names (or numbers appear in a text column); no error was raised.",
            ["Did I write with insertInto (positional)?", "Does the DataFrame column order match the target?", "Could types be coerced silently?", "Which version introduced the bad rows?"],
            [("Check the writing code", "Spot positional APIs", None),
             ("Compare DataFrame column order vs DESCRIBE TABLE", "Confirm mismatch", None),
             ("Fix code: select columns in target order or use a name-based API", "Prevent recurrence", "df.writeTo('ecommerce.silver.customers').append()"),
             ("RESTORE or repair affected version", "Clean data", None)],
            ["insertInto positional resolution"],
            "Use name-based writers (writeTo().append(), saveAsTable append) or reorder columns explicitly.",
            mnemonic="insertInto = position, not name")

# =============== Pitfalls ===============
for t, x, f in [
    ("CREATE OR REPLACE in production", "Replaces definition/state of an existing table.", "Use CREATE TABLE / IF NOT EXISTS unless a rebuild is intended."),
    ("insertInto is positional", "Columns matched by position; silent wrong mapping if coercible.", "Use writeTo().append()/saveAsTable or reorder columns."),
    ("INSERT OVERWRITE without predicate", "Replaces the entire table.", "Use INSERT INTO or REPLACE WHERE."),
    ("Full overwrite with a subset", "3 years → 1 day.", "Append / MERGE / REPLACE WHERE."),
    ("Non-idempotent writes", "amount = amount + 10 or blind appends double-apply on retry.", "MERGE that sets values from a deduplicated source."),
    ("Legacy dynamic partition overwrite", "Legacy, compute limitations, stray keys replace slices.", "REPLACE WHERE / REPLACE USING; validate the key domain."),
    ("Disabling enforcement mentally", "Treating schema errors as a nuisance.", "Investigate: intentional evolution or source bug?"),
    ("Global autoMerge", "Every write in the session can evolve schemas.", "Per-write mergeSchema / WITH SCHEMA EVOLUTION."),
    ("mergeSchema ≠ overwriteSchema", "overwriteSchema replaces schema/partitioning on overwrite.", "Pick the tool by intent."),
    ("Rename/drop without column mapping", "Metadata-only rename/drop needs column mapping.", "Enable column mapping first."),
    ("Widening ≠ arbitrary cast", "INT → STRING / STRING → STRUCT aren't widening.", "Use type widening only for supported wider types."),
    ("Uncoordinated schema changes", "ALTER during writes → MetadataChangedException; streams stop.", "Coordinate schema changes and restart streams."),
    ("OPTIMIZE ≠ VACUUM", "OPTIMIZE rewrites active files; VACUUM deletes old ones.", "Run both for their own purpose."),
    ("Judging health by total bytes", "File count/size distribution matters.", "Check numFiles and average size in DESCRIBE DETAIL."),
    ("Expecting immediate rewrite from CLUSTER BY", "Changing keys doesn't recluster existing data.", "OPTIMIZE FULL to recluster everything."),
    ("Automation replaces understanding", "Predictive optimization doesn't debug layouts for you.", "Still learn small files, skipping, clustering."),
]:
    ch.pit(t, x, f)

# =============== Flashcards ===============
for s, q, a in [
    (1, "Default table format on Databricks?", "Delta (USING DELTA optional)."),
    (1, "Recommended table type for most workloads?", "Unity Catalog managed Delta tables."),
    (1, "CREATE TABLE when table exists?", "Fails (use IF NOT EXISTS to no-op, OR REPLACE to replace)."),
    (1, "CTAS schema source?", "Derived from the SELECT query."),
    (1, "CREATE TABLE b LIKE a copies?", "Definition/metadata only, no data."),
    (2, "V2 writer API?", "`df.writeTo(t).create() / createOrReplace() / append()`."),
    (2, "writeTo advantages?", "Clear create/replace semantics, partitioning, table properties, clustering, conditional overwrite."),
    (2, "insertInto resolves columns by?", "Position, not name."),
    (3, "INSERT INTO vs INSERT OVERWRITE?", "INTO adds rows; OVERWRITE replaces the target scope."),
    (3, "TRUNCATE vs DROP?", "TRUNCATE removes rows (table + schema stay); DROP removes the table object."),
    (4, "When append?", "Rows are genuinely new, no overlap."),
    (4, "When full overwrite?", "Target should exactly equal the new DataFrame."),
    (4, "Idempotent operation?", "Re-running with same input doesn't change final state again."),
    (4, "Non-idempotent example?", "`UPDATE … SET amount = amount + 10` (twice → +20)."),
    (5, "REPLACE WHERE syntax?", "`INSERT INTO t REPLACE WHERE pred SELECT …`."),
    (5, "REPLACE USING does?", "Replaces target rows matching incoming values of the listed key columns (dynamic overwrite)."),
    (5, "Legacy dynamic overwrite option?", "`.option('partitionOverwriteMode','dynamic')` with mode overwrite."),
    (5, "Dynamic overwrite risk?", "A stray key in the data replaces that whole slice — validate the domain."),
    (6, "Schema enforcement rules?", "Columns must exist; types must match or be safely castable."),
    (6, "INT into BIGINT column?", "OK — safe cast."),
    (7, "Per-write evolution option?", "`.option('mergeSchema','true')`."),
    (7, "Global evolution config?", "`spark.databricks.delta.schema.autoMerge.enabled` — avoid in production."),
    (7, "SQL evolution syntax?", "`MERGE WITH SCHEMA EVOLUTION INTO …`; `INSERT WITH SCHEMA EVOLUTION INTO …` (DBR 18.1+)."),
    (7, "overwriteSchema does?", "Replaces schema/partitioning during overwrite."),
    (7, "Rename/drop column requires?", "Column mapping (for metadata-only changes)."),
    (8, "Enable type widening?", "`'delta.enableTypeWidening' = 'true'` then `ALTER COLUMN c TYPE BIGINT`."),
    (8, "INT can widen to?", "BIGINT, DECIMAL, DOUBLE."),
    (8, "Does supported widening rewrite files?", "No."),
    (8, "Schema change during writes →?", "MetadataChangedException for concurrent writers; streams may stop."),
    (9, "DESCRIBE DETAIL key fields?", "format, location, sizeInBytes, numFiles, partition/clustering cols, properties/features."),
    (9, "Average file size formula?", "sizeInBytes / numFiles."),
    (10, "Small-file problem costs?", "Metadata, file listing/open, task scheduling, poor scan efficiency."),
    (10, "Plain OPTIMIZE does?", "Bin packing: compacts small files into balanced larger files."),
    (10, "OPTIMIZE vs VACUUM?", "OPTIMIZE reorganizes active files; VACUUM deletes expired unreferenced files."),
    (10, "dataChange=false means?", "Commit rearranges data without logical record change."),
    (11, "Data skipping?", "Using file stats to skip files that can't contain matching rows."),
    (11, "File stats stored?", "min, max, null counts, row count."),
    (12, "Liquid clustering syntax?", "`ALTER TABLE t CLUSTER BY (col)`; `OPTIMIZE t FULL` for existing data."),
    (12, "Good clustering key?", "Frequently filtered/joined, selective lookups, enough cardinality."),
    (12, "Why 'liquid'?", "Keys can change without immediate rewrite of historical layout; incremental."),
    (13, "Predictive optimization runs?", "OPTIMIZE, VACUUM, ANALYZE on UC managed tables when useful."),
    (14, "5 debug workflows?", "MERGE fails; schema mismatch; storage exploded; scans too much; someone broke data."),
]:
    ch.card(s, q, a)

ch.dump(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch06.json"),
        num=6, title="Delta Table Engineering & Optimization", subtitle="Writes, overwrite semantics, schemas and physical layout in production",
        emoji="🛠️", sourcePages="358–402 (+ 157–168 schema & OPTIMIZE parts)",
        mantra="Write explicitly (create, append, replace a slice), evolve schemas locally, and keep files few, big and clustered on what you filter.",
        objectives=[
            "You can create Delta tables with CREATE, CREATE OR REPLACE, CTAS, LIKE and the PySpark writeTo()/saveAsTable() APIs.",
            "You can choose between append, full overwrite, REPLACE WHERE and REPLACE USING, and design idempotent writes.",
            "You can explain schema enforcement, per-write evolution (mergeSchema / WITH SCHEMA EVOLUTION), overwriteSchema and type widening.",
            "You can inspect tables with DESCRIBE TABLE / DETAIL / HISTORY and diagnose small files and failed data skipping.",
            "You can apply OPTIMIZE, liquid clustering (CLUSTER BY, OPTIMIZE FULL) and predictive optimization correctly.",
            "You can run the 5 Delta debugging workflows and follow the 13 best practices.",
        ])
print("written")
