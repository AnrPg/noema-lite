"""ch11 sections 11–16: bindings & compute, fine-grained access, lineage/federation/sharing,
production architecture & labs, the debugging algorithm, big test."""
from ch11_core import c

# =====================================================================
# s11
# =====================================================================
c.sec(11, "Workspace Bindings & the UC Compute Requirement",
      "Correct grants are not the whole story. The workspace you are in and the compute you use can still block access.")
c.p("You have two workspaces, `dev-workspace` and `prod-workspace`, and a catalog `prod`. You can say: **the `prod` catalog may be used only from specific workspaces.** That is a **workspace binding**.")
c.diagram("""
                     catalog prod  (bound to prod-workspace only)
                       ▲        ✗
                       │        │
prod-workspace ────────┘        └──────── dev-workspace
   access possible                  access FAILS
                                    (even with all grants)
""", "Workspace binding: a separate access-control mechanism")
c.p("UC uses workspace bindings as a **separate access-control mechanism** for **catalogs, external locations and storage credentials**. So the user can hold the permission and access still fails, because the **current workspace has no binding** to the catalog.")
c.p("**Debugging implication.** The user has USE CATALOG `prod`, USE SCHEMA `prod.finance`, SELECT `prod.finance.payroll` — and still fails. Possible cause: **`prod` catalog not bound to this workspace.**")
c.callout("pitfall", "User privilege ≠ the only authorization boundary",
          "Grants answer \"may this principal do X?\". Workspace bindings answer \"may X be used **from this workspace** at all?\". Both must say yes.")
c.p("**UC compute requirement.** Having permissions isn't enough: the **compute must be Unity Catalog-compatible**. Classic compute with **Standard** or **Dedicated** access mode can access UC; **serverless** and **Databricks SQL** compute support it.")
c.diagram("""
permissions correct
        +
wrong / legacy compute (not UC-compatible)
        =
still failure
""", "Correct grants on the wrong compute still fail")
c.callout("key", "Recap → Chapters 7 & 8",
          "Access modes Standard vs Dedicated (Chapter 7) and SQL-warehouse Gate 2 (Chapter 8) meet here: the access mode is what makes classic compute **UC-capable**.")
c.ask("Ask yourself when every grant looks right but access still fails", [
    "Which workspace am I in — and is the catalog (or external location / credential) bound to it?",
    "Would the same query work from the prod workspace?",
    "Is my compute UC-compatible: Standard/Dedicated access mode, serverless, or a SQL warehouse?",
    "Am I on an old/legacy cluster configuration someone left running?"])

c.T("§45 Workspace bindings")
c.mcq("Which UC objects can be restricted with workspace bindings (per the source)? (choose all)",
      ["Catalogs", "External locations", "Storage credentials", "Individual table columns"], [0, 1, 2],
      "Workspace bindings apply to **catalogs, external locations and storage credentials**. Column-level control is done with masks/ABAC, not bindings.",
      tags=("exam",), diff=2, quick=True)
c.tf("If a user holds USE CATALOG, USE SCHEMA and SELECT on `prod.finance.payroll`, the query must succeed from any workspace attached to the metastore.", False,
     "False. A **workspace binding** can restrict `prod` to specific workspaces. User privileges are not the only authorization boundary.",
     tags=("pitfall", "exam"), diff=2, quick=True)

c.T("§46 Debugging implication of bindings")
c.scenario("Nikos has USE CATALOG prod, USE SCHEMA prod.finance and SELECT on prod.finance.payroll. From `dev-workspace` the query fails; his teammate in `prod-workspace` runs the same query fine.", [
    ("Grants are identical for both (same group). What's the strongest hypothesis?", [
        ("Catalog `prod` is bound only to `prod-workspace`.", True, "Yes — same principal grants, different workspace → binding."),
        ("Nikos lacks SELECT.", False, "Same group, same grants; the teammate succeeds."),
        ("The table is external.", False, "Then it would fail in both workspaces."),
    ]),
    ("Binding confirmed. What's the right fix?", [
        ("Run it from prod-workspace, or — if dev access is truly intended — have an admin add a binding for dev-workspace.", True, "Bindings are deliberate isolation; change them only if the design allows it."),
        ("Grant ALL PRIVILEGES on prod to Nikos.", False, "Grants can't override a missing workspace binding."),
        ("Copy payroll into the dev catalog.", False, "That copies sensitive data around and defeats the isolation."),
    ])],
    tags=("debug",), diff=2)
c.order("Order the checks when grants look correct but a catalog is unreachable from your workspace.",
        ["Confirm the running identity", "Confirm USE CATALOG / USE SCHEMA / SELECT", "Check which workspace you are in",
         "Check the catalog's workspace bindings", "Retry from a bound workspace or request a binding change"],
        "Identity and grants first (the common causes), then the separate workspace-binding boundary.",
        tags=("debug",), diff=2)

c.T("§73 UC compute requirement")
c.mcq("Which compute can access Unity Catalog? (choose all)",
      ["Classic compute with Standard access mode", "Classic compute with Dedicated access mode", "Serverless compute",
       "Databricks SQL warehouses", "A legacy cluster configuration that isn't UC-compatible"], [0, 1, 2, 3],
      "Standard and Dedicated classic compute, serverless and Databricks SQL support UC. A legacy/non-UC configuration fails even with perfect grants.",
      tags=("exam",), diff=2)
c.tf("If all Unity Catalog permissions are correct, the query succeeds on any cluster.", False,
     "False. **permissions correct + wrong legacy compute = still failure.** Compute must be UC-compatible.",
     tags=("pitfall",), diff=1)
c.scenario("A notebook on an old team cluster fails to read `prod.silver.orders`; the same user reads it fine from a SQL warehouse.", [
    ("Grants are the same in both cases. Which layer differs?", [
        ("Compute: the old cluster may not be UC-compatible.", True, "Same principal + same grants + different compute → compute layer."),
        ("The table's row filter.", False, "Row filters apply regardless of compute; they wouldn't cause a fail-vs-success split here."),
        ("USE SCHEMA.", False, "Then the warehouse query would fail too."),
    ]),
    ("Fix?", [
        ("Use a cluster with Standard (or Dedicated) access mode, or serverless.", True, "Correct — UC-compatible compute."),
        ("Grant SELECT again.", False, "Grants are already fine."),
        ("Add more workers.", False, "Size doesn't make a cluster UC-compatible."),
    ])],
    tags=("debug",), diff=2)

c.order("Order the checks when the same user and grants work on a SQL warehouse but fail on a cluster.",
        ["Confirm identity and grants are identical in both runs", "Re-run the query on serverless / a SQL warehouse to isolate compute",
         "Inspect the cluster's access mode", "Switch to Standard/Dedicated access mode or serverless"],
        "Same principal + same grants + different compute isolates the compute layer; UC needs Standard/Dedicated, serverless or Databricks SQL.",
        tags=("debug",), diff=2)

# =====================================================================
# s12
# =====================================================================
c.sec(12, "Row Filters, Column Masks & ABAC",
      "SELECT decides whether you can query a table. Fine-grained policies decide which rows and which values you see.")
c.p("**Row-level security.** Table `sales(country, revenue)` has GR, DE, FR rows. You want: Greek team → only GR rows; German team → only DE rows.")
c.p("A **row filter** is a **SQL UDF applied at query time**: rows where it returns **false** are removed.")
c.diagram("""
SELECT * FROM sales
        │
        ▼
   row filter UDF
        ├── TRUE  → row visible
        └── FALSE → row removed
""", "Row filter at query time")
c.code("sql", """CREATE FUNCTION security.country_filter(country STRING)
RETURN
  CASE
    WHEN is_account_group_member('global_sales') THEN TRUE
    WHEN is_account_group_member('greece_sales') AND country = 'GR' THEN TRUE
    ELSE FALSE
  END;

ALTER TABLE ecommerce.gold.sales
SET ROW FILTER security.country_filter
ON (country);""", "Row filter: UDF + ALTER TABLE … SET ROW FILTER … ON (col)")
c.callout("warn", "Design production UDFs carefully",
          "The pattern above is the basic mechanism; production filter functions need careful design (every group covered, default FALSE, tested).")
c.p("**Column mask.** Table `customer_id, name, email, salary`: analysts need the rows but not the real salary. A mask is a **query-time policy on a column value**.")
c.diagram("""
stored value:            5000
query as finance_admin:  5000
query as analyst:        ****   (or NULL / bucketed)
""", "Same stored value, different visible value")
c.code("sql", """CREATE FUNCTION security.mask_salary(salary DECIMAL(10,2))
RETURN CASE
  WHEN is_account_group_member('finance_admins') THEN salary
  ELSE NULL
END;

ALTER TABLE ecommerce.gold.employees
ALTER COLUMN salary SET MASK security.mask_salary;""", "Column mask: UDF + ALTER COLUMN … SET MASK")
c.p("**ABAC (Attribute-Based Access Control).** For 5 tables you can attach filters/masks one by one. For **10,000 tables** that doesn't scale. ABAC uses **governed tags** (e.g. `sensitivity = pii`) plus **policies** (e.g. if a column is tagged pii → mask it for users without privilege).")
c.code("sql", """ALTER TABLE ecommerce.silver.customers
ALTER COLUMN email SET TAGS ('sensitivity' = 'pii');
-- an ABAC policy then masks every column tagged pii""", "Tag once; the policy follows the tag")
c.p("Databricks now recommends ABAC for **centralized, tag-driven policies** across many objects. ABAC can apply **row filters, column masks**, and now **policy-based GRANT/DENY** capabilities in supported scopes.")
c.compare(("Table-level mask / filter", ["manually attach to table A", "manually attach to table B …", "good for per-table logic"]),
          ("ABAC", ["tag: PII", "policy: mask PII", "new tagged table tomorrow → automatically covered", "consistent across many tables"]))
c.p("**Debugging Case 6**: \"I have SELECT, why do I see `****`?\" Because **SELECT ≠ unfiltered raw visibility**. Fine-grained policies change row/column visibility. Check **column mask, row filter, ABAC**.")
c.callout("exam", "SELECT ≠ seeing everything",
          "Missing rows or masked values with a successful query is not a permission bug in the grants. It is a **row filter / column mask / ABAC** policy doing its job.")
c.ask("Ask yourself when a query succeeds but rows are missing or values are masked", [
    "Does this table have a row filter (which function, on which column)?",
    "Does this column have a mask?",
    "Is an ABAC policy matching a tag on this table/column?",
    "Which groups am I in — does the policy function check a group I'm not in (is_account_group_member)?",
    "Is the masking intended for my role, or is my group membership wrong?"])

c.T("§48–49 Row filters")
c.mcq("What does a row filter do?",
      ["A SQL UDF evaluated at query time; rows where it returns false are removed from the result",
       "A job that deletes forbidden rows from the table files", "A view the user must query instead of the table",
       "A cluster setting that hides partitions"], 0,
      "Row filters are **query-time** policies — stored data is untouched; different users see different rows of the same table.",
      tags=("concept",), diff=1, quick=True)
c.cloze("Attach the row filter to the table.",
        "ALTER TABLE ecommerce.gold.sales\nSET [[ROW FILTER]] security.country_filter\n[[ON]] ([[country]]);",
        "`ALTER TABLE … SET ROW FILTER <function> ON (<column>)` binds the UDF; the listed column is passed as the function's argument.",
        bank=["MASK", "USING", "WHERE"], as_code=True, tags=("syntax",), diff=2, quick=True)
c.calc("With the `country_filter` from the lesson, table `sales` has 100 GR, 80 DE and 20 FR rows. How many rows does a member of `greece_sales` (and NOT of `global_sales`) see with `SELECT *`?",
       100, "The function returns TRUE for global_sales (no), then for greece_sales AND country='GR' → only the **100** GR rows; DE and FR rows hit ELSE FALSE and are removed.",
       unit="rows", tags=("calc",), diff=2)
c.write("Write a row filter function `security.country_filter(country STRING)` that returns TRUE for members of `global_sales`, TRUE for `greece_sales` members on GR rows, otherwise FALSE — and attach it to `ecommerce.gold.sales` on column `country`.",
        "CREATE FUNCTION security.country_filter(country STRING)\nRETURN\n  CASE\n    WHEN is_account_group_member('global_sales') THEN TRUE\n    WHEN is_account_group_member('greece_sales') AND country = 'GR' THEN TRUE\n    ELSE FALSE\n  END;\n\nALTER TABLE ecommerce.gold.sales\nSET ROW FILTER security.country_filter\nON (country);",
        ["create function security.country_filter", "is_account_group_member('global_sales')", "is_account_group_member('greece_sales')", "else false", "set row filter security.country_filter", "on (country)"],
        "A filter UDF returns a boolean per row; `is_account_group_member` makes it user-aware. Default FALSE is the safe choice.",
        tags=("syntax",), diff=3)
c.spotbug("This filter should show GR rows to greece_sales and everything to global_sales. Which line makes it leak data?",
          ["CREATE FUNCTION security.country_filter(country STRING)", "RETURN CASE",
           "  WHEN is_account_group_member('global_sales') THEN TRUE", "  WHEN is_account_group_member('greece_sales') AND country = 'GR' THEN TRUE",
           "  ELSE TRUE", "END;"],
          [4], "  ELSE FALSE",
          "`ELSE TRUE` shows every row to everyone not matched above — the filter filters nothing. Default must be **FALSE** (deny by default).",
          tags=("pitfall", "debug"), diff=2)

c.T("§50 Column masks")
c.tf("A column mask changes the value stored in the Delta files for users without privilege.", False,
     "False. The stored value (e.g. 5000) is unchanged; the mask is a **query-time** policy, so finance_admin sees 5000 and an analyst sees **** / NULL / a bucket.",
     tags=("concept", "pitfall"), diff=1)
c.cloze("Attach the mask function to the salary column.",
        "ALTER TABLE ecommerce.gold.employees\n[[ALTER COLUMN]] salary SET [[MASK]] security.mask_salary;",
        "Masks are set per column: `ALTER TABLE … ALTER COLUMN <col> SET MASK <function>`.",
        bank=["ROW FILTER", "MODIFY COLUMN", "POLICY"], as_code=True, tags=("syntax",), diff=2)

c.T("§51–52 ABAC and table-level policy vs ABAC")
c.mcq("You have 10,000 tables and want every column tagged `sensitivity = pii` masked for users without privilege — including tables created next month. Best tool?",
      ["ABAC: governed tags + a central policy", "A column mask attached manually to each table", "A row filter on each table", "Revoke SELECT from everyone"], 0,
      "ABAC scales: tag the data, write one policy; a new tagged table tomorrow is **automatically covered**. Manual per-table masks don't scale and are easy to forget.",
      tags=("concept", "exam"), diff=2, quick=True)
c.bucket("Per-table policy or ABAC?", ["Direct row filter / column mask", "ABAC (tags + policy)"],
         [("one table with unique country logic", 0), ("mask every PII-tagged column across the lakehouse", 1),
          ("new tagged tables must be covered automatically", 1), ("a special salary rule for one HR table", 0),
          ("consistent policy enforcement across thousands of tables", 1)],
         "Databricks recommends ABAC for consistent enforcement across many tables; direct filters/masks fit per-table logic.",
         tags=("compare",), diff=2)
c.tf("ABAC can apply row filters and column masks, and now also policy-based GRANT/DENY capabilities in supported scopes.", True,
     "True per the source: ABAC policies cover row filters, column masks and policy-based GRANT/DENY in supported scopes.",
     tags=("concept",), diff=2)

c.T("Debugging Case 6 — user sees masked salary")
c.scenario("An analyst says: \"I have SELECT on `ecommerce.gold.employees`, but salary shows `****`. Fix my permissions!\"", [
    ("What do you tell yourself first?", [
        ("SELECT ≠ unfiltered raw visibility — look for fine-grained policies.", True, "Right: the query succeeded, so grants are fine; a policy changed the values."),
        ("Grant MODIFY so they can see real values.", False, "MODIFY is write access and doesn't bypass masks."),
        ("The data is corrupted.", False, "Stored values are intact; masking is query-time."),
    ]),
    ("Where do you look?", [
        ("Column mask on `salary`, row filter on the table, and any ABAC policy matching tags on the column.", True, "Those three change visibility."),
        ("SHOW GRANTS ON CATALOG only.", False, "Grants don't explain masked values."),
        ("The cluster's Spark config.", False, "Masks are UC policies, not Spark settings."),
    ]),
    ("A mask returns real salary only to `finance_admins`. The analyst isn't in it. Correct outcome?", [
        ("Working as designed; if the business approves, add them to the right group — don't remove the mask.", True, "The policy is doing its job; access changes go through group membership."),
        ("Drop the mask for everyone.", False, "That exposes salary to all readers."),
        ("Give the analyst ownership.", False, "Ownership is not a way around governance."),
    ])],
    tags=("debug",), diff=2)
c.order("Case 6 — order the checks for \"query works but values are masked / rows missing\".",
        ["Confirm the query succeeded (so base grants are fine)", "Check for a column mask on the column", "Check for a row filter on the table",
         "Check ABAC policies matching tags", "Check the user's group memberships used by the policy functions"],
        "A successful query rules out missing grants. Then inspect the fine-grained layers and the group memberships those policies test.",
        tags=("debug",), diff=2)

# =====================================================================
# s13
# =====================================================================
c.sec(13, "Lineage, Catalog Explorer, Federation & Delta Sharing",
      "Lineage shows who depends on what before you change anything. Federation and Delta Sharing reach data beyond your own lakehouse.")
c.diagram("""
bronze.orders
     ↓
silver.orders
     ↓
gold.daily_revenue
     ↓
  dashboard
""", "UC captures upstream / downstream relationships")
c.p("Databricks collects **lineage automatically** for queries run on Databricks, **down to column level**, aggregated **across workspaces that share the same metastore**.")
c.p("**Why it matters — impact analysis.** You want to change `silver.orders.customer_id`. A blind `ALTER …` could break `gold.customer_360`, a dashboard, an ML feature, a report. Lineage shows `customer_id → gold.customer_360 → executive_dashboard` **before** you change it.")
c.p("**Debugging with lineage.** The dashboard shows wrong revenue. Walk **upstream**: dashboard ↑ gold.daily_revenue ↑ silver.orders ↑ bronze.orders, and ask **\"in which layer did the wrong value first appear?\"** — the layer-by-layer debugging you already know.")
c.ask("Ask yourself when a dashboard number is wrong", [
    "What is the dashboard's direct upstream table (lineage)?",
    "Is the value already wrong in gold.daily_revenue?",
    "Is it wrong in silver.orders?",
    "Is it wrong in bronze.orders (i.e. at ingestion)?",
    "So in which layer did the wrong value FIRST appear — and what transformation sits just before it?"])
c.p("**Catalog Explorer** is the UC UI in the workspace. It is a **governance UI**, not just a file browser.")
c.diagram("""
Catalog Explorer
└── ecommerce
    ├── bronze
    │   └── orders_raw
    ├── silver
    │   └── orders
    └── gold
        └── daily_sales

per object (if permitted): schema · details · permissions
  · history · lineage · tags · dependencies
""", "Catalog Explorer")
c.p("**Lakehouse Federation** — query data where it lives, **without full ingestion**. External databases (PostgreSQL, Snowflake, SQL Server …) are exposed under UC governance: **connection → foreign catalog → external database metadata**.")
c.code("sql", """-- sketch; connector options vary (deep dive later)
CREATE CONNECTION pg_sales TYPE postgresql
OPTIONS (host 'pg.company.com', port '5432',
         user secret('pg', 'user'), password secret('pg', 'pwd'));

CREATE FOREIGN CATALOG pg_sales_cat
USING CONNECTION pg_sales
OPTIONS (database 'sales');""", "Connection → foreign catalog")
c.p("`CREATE CONNECTION` / `CREATE FOREIGN CATALOG` privileges are part of the UC privilege model.")
c.p("**Delta Sharing** — the opposite-ish use case: share governed data **outward** with another organization / recipient. It is an **open sharing protocol** integrated with UC: your UC tables → **share** → **recipient**, without necessarily copying files by hand.")
c.code("sql", """-- sketch; deep dive in cross-organization sharing
CREATE SHARE ecommerce_share;
ALTER SHARE ecommerce_share ADD TABLE prod_ecommerce.gold.daily_revenue;
CREATE RECIPIENT partner_co;
GRANT SELECT ON SHARE ecommerce_share TO RECIPIENT partner_co;""", "Tables → share → recipient")
c.compare(("Lakehouse Federation", ["query data where it lives ELSEWHERE", "connection → foreign catalog", "pull-style: you read external DBs"]),
          ("Delta Sharing", ["safely expose / share data OUTWARD", "share → recipient", "push-style: others read your data"]))

c.T("§53 Lineage (automatic, column-level, across workspaces)")
c.mcq("Which statements about UC lineage are true per the source? (choose all)",
      ["Collected automatically for queries run on Databricks", "Can go down to column level",
       "Aggregated across workspaces sharing the same metastore", "Must be declared manually in a YAML file"], [0, 1, 2],
      "Lineage is automatic, column-level and metastore-wide. No manual declaration is needed.",
      tags=("concept",), diff=2, quick=True)

c.T("§54 Lineage for impact analysis")
c.mcq("Before renaming `silver.orders.customer_id`, what should you do?",
      ["Check its column-level lineage to find downstream tables, dashboards, features and reports", "Just run ALTER — Delta keeps history",
       "Run VACUUM first", "Grant MODIFY to everyone so they can fix their code"], 0,
      "Lineage enables **impact analysis**: see `customer_id → gold.customer_360 → executive_dashboard` before breaking it. Time travel doesn't fix broken consumers.",
      tags=("concept",), diff=1, quick=True)

c.T("§55 Debugging with lineage")
c.order("Dashboard revenue is wrong. Order the upstream walk.",
        ["dashboard", "gold.daily_revenue", "silver.orders", "bronze.orders"],
        "Walk upstream along lineage from the symptom; the first layer where the value is already wrong is where the bug was introduced (it's in the transformation into that layer).",
        tags=("debug",), diff=1)
c.scenario("The executive dashboard shows revenue 3× too high for yesterday.", [
    ("First step?", [
        ("Open lineage for the dashboard to find its upstream table(s).", True, "Lineage gives you the path to walk."),
        ("Re-run every pipeline.", False, "Re-running hides the evidence and may repeat the bug."),
        ("Grant analysts MODIFY to fix the numbers.", False, "Never patch outputs by hand."),
    ]),
    ("gold.daily_revenue is 3× too high; silver.orders looks correct. Conclusion?", [
        ("The bug was introduced in the silver → gold transformation (e.g. a bad join duplicating rows).", True, "First layer where the value is wrong = the transformation just before it."),
        ("Bronze ingestion is broken.", False, "Silver is correct, so the input to gold is fine."),
        ("The dashboard tool is miscalculating.", False, "Gold is already wrong upstream of the dashboard."),
    ])],
    tags=("debug",), diff=2)

c.T("§56 Catalog Explorer")
c.tf("Catalog Explorer is basically a file browser for cloud storage.", False,
     "False. It's a **governance UI**: per object you can see schema, details, permissions, history, lineage, tags and dependencies (as permitted).",
     tags=("concept",), diff=1)

c.T("§74–75 Lakehouse Federation vs Delta Sharing")
c.match("Match each need to the feature.",
        [("Query a PostgreSQL DB under UC governance without ingesting it", "Lakehouse Federation"),
         ("Give a partner company governed read access to gold tables", "Delta Sharing"),
         ("Restrict catalog `prod` to the prod workspace", "Workspace binding"),
         ("See which dashboards use a column", "Lineage")],
        "Federation brings external data **in** (query in place); Delta Sharing sends governed data **out**; bindings restrict workspaces; lineage tracks dependencies.",
        tags=("compare",), diff=1)
c.order("Lakehouse Federation — order the objects from your UC down to the external data.",
        ["Unity Catalog metastore", "Connection (to PostgreSQL / Snowflake / SQL Server …)", "Foreign catalog", "External database metadata / tables"],
        "A connection holds how to reach the external system; a foreign catalog mirrors its databases into the UC namespace for governed queries.",
        diff=2)
c.cloze("Complete the Delta Sharing flow.",
        "CREATE [[SHARE]] ecommerce_share;\nALTER SHARE ecommerce_share [[ADD TABLE]] prod_ecommerce.gold.daily_revenue;\nCREATE [[RECIPIENT]] partner_co;\nGRANT SELECT ON SHARE ecommerce_share TO RECIPIENT partner_co;",
        "Tables → **share** → **recipient**: create the share, add tables, create the recipient, grant the share to the recipient.",
        bank=["CONNECTION", "FOREIGN CATALOG", "INSERT"], as_code=True, tags=("syntax",), diff=2)

# =====================================================================
# s14
# =====================================================================
c.sec(14, "Production Architecture, Grants & Hands-on Labs",
      "Everything comes together in one e-commerce lakehouse: the catalog layout, the groups, the service principals and least-privilege grants, then built for real in SQL.")
c.diagram("""
CATALOG prod_ecommerce
├── bronze
│   ├── orders_raw
│   ├── customers_raw
│   └── ingest_files      [volume]
├── silver
│   ├── orders
│   ├── customers
│   └── products
└── gold
    ├── daily_revenue
    ├── customer_360
    └── product_performance
""", "Production e-commerce catalog")
c.table(["Groups", "Service principals"],
        [["`data_engineers`", "`orders_ingest_sp`"], ["`analysts`", "`silver_transform_sp`"],
         ["`finance_analysts`", "`gold_pipeline_sp`"], ["`platform_admins`", "—"]])
c.code("sql", """-- engineers
GRANT USE CATALOG    ON CATALOG prod_ecommerce        TO `data_engineers`;
GRANT USE SCHEMA     ON SCHEMA  prod_ecommerce.silver TO `data_engineers`;
GRANT SELECT, MODIFY ON SCHEMA  prod_ecommerce.silver TO `data_engineers`;""", "Engineer grants")
c.callout("tip", "Even tighter: writes for service principals only",
          "A production architecture may reserve **direct MODIFY for service principals** — Databricks explicitly recommends this as a best practice. Humans read; pipelines write.")
c.code("sql", """-- analysts: Gold only
GRANT USE CATALOG ON CATALOG prod_ecommerce      TO `analysts`;
GRANT USE SCHEMA  ON SCHEMA  prod_ecommerce.gold TO `analysts`;
GRANT SELECT      ON SCHEMA  prod_ecommerce.gold TO `analysts`;""", "Analysts can query Gold — but not Silver (no grants there)")
c.code("sql", """-- gold pipeline: read Silver, write Gold
GRANT USE CATALOG ON CATALOG prod_ecommerce        TO `gold_pipeline_sp`;
GRANT USE SCHEMA  ON SCHEMA  prod_ecommerce.silver TO `gold_pipeline_sp`;
GRANT SELECT      ON SCHEMA  prod_ecommerce.silver TO `gold_pipeline_sp`;
GRANT USE SCHEMA  ON SCHEMA  prod_ecommerce.gold   TO `gold_pipeline_sp`;
GRANT MODIFY      ON SCHEMA  prod_ecommerce.gold   TO `gold_pipeline_sp`;""", "read Silver + write Gold = least privilege")
c.callout("tip", "What a real gold pipeline may also need",
          "MODIFY covers writing data. A pipeline that **creates new tables** in gold also needs `CREATE TABLE` on the schema, and a MERGE that reads its target needs `SELECT` on gold too. Grant these only when the job really does them.")
c.callout("pitfall", "Common bad practice",
          "`GRANT ALL PRIVILEGES ON CATALOG prod_ecommerce TO all_company_users;` — far more than anyone needs, and it grows over time because ALL PRIVILEGES is evaluated dynamically.")
c.table(["Item", "Value"],
        [["Metastore", "Europe"], ["Catalog", "`prod_ecommerce`"], ["Managed storage", "`cloud://company-uc/prod-ecommerce/`"],
         ["Schemas", "`bronze`, `silver`, `gold`, `raw_files`"],
         ["Tables", "`prod_ecommerce.bronze.orders_raw`, `prod_ecommerce.silver.orders`, `prod_ecommerce.gold.daily_revenue`"],
         ["Volume", "`prod_ecommerce.raw_files.incoming`"], ["Service principals", "`orders_ingest_sp`, `transform_sp`"]],
        "Full mini-project configuration")
c.p("**Practical SQL lab** — build a dev copy and inspect it.")
c.code("sql", """CREATE CATALOG IF NOT EXISTS ecommerce_dev;

CREATE SCHEMA IF NOT EXISTS ecommerce_dev.bronze;
CREATE SCHEMA IF NOT EXISTS ecommerce_dev.silver;
CREATE SCHEMA IF NOT EXISTS ecommerce_dev.gold;
CREATE SCHEMA IF NOT EXISTS ecommerce_dev.files;

CREATE TABLE ecommerce_dev.silver.orders (
  order_id    BIGINT,
  customer_id BIGINT,
  amount      DECIMAL(10,2),
  country     STRING
);

CREATE VOLUME ecommerce_dev.files.incoming;""", "Lab 1 — create objects")
c.code("sql", """SHOW CATALOGS;
SHOW SCHEMAS IN ecommerce_dev;
SHOW TABLES  IN ecommerce_dev.silver;
DESCRIBE TABLE ecommerce_dev.silver.orders;""", "Lab 2 — inspect objects (basic UC navigation)")
c.code("sql", """GRANT USE CATALOG ON CATALOG ecommerce_dev      TO `training_analysts`;
GRANT USE SCHEMA  ON SCHEMA  ecommerce_dev.gold TO `training_analysts`;
GRANT SELECT      ON SCHEMA  ecommerce_dev.gold TO `training_analysts`;

SHOW GRANTS ON SCHEMA ecommerce_dev.gold;""", "Lab 3 — grant practice")
c.code("sql", """GRANT USE SCHEMA ON SCHEMA ecommerce_dev.files TO `data_engineers`;
GRANT READ VOLUME, WRITE VOLUME
ON VOLUME ecommerce_dev.files.incoming
TO `data_engineers`;
-- (data_engineers also need USE CATALOG on ecommerce_dev)""", "Lab 4 — volume practice (grants)")
c.code("python", """path = "/Volumes/ecommerce_dev/files/incoming/test.txt"
with open(path, "w") as f:
    f.write("hello unity catalog")

with open(path, "r") as f:
    print(f.read())""", "Lab 4 — write then read a file in the volume")
c.p("**Phase 3 production exercise.** Build `ecommerce_dev` with `bronze`, `silver`, `gold`, `files` (in your head or a sandbox) and run the whole flow:")
c.flow(["CREATE CATALOG", "CREATE SCHEMA", "CREATE TABLE", "CREATE VOLUME", "GRANT USE CATALOG / USE SCHEMA",
        "GRANT SELECT / MODIFY", "GRANT READ / WRITE VOLUME", "SHOW GRANTS", "REVOKE"], "The full UC flow")
c.p("Then imagine two roles — **analyst** and **pipeline service principal** — and decide who may: read Gold, write Gold, read Silver, create table, write volume, manage grants.")

c.T("§57–60 Production architecture & grants")
c.bucket("Phase 3 production exercise: who should be able to do each action?", ["Analyst", "Pipeline service principal", "Platform admins group (owner / MANAGE)"],
         [("read Gold", 0), ("write Gold", 1), ("read Silver", 1), ("create table (in the pipeline's target schema)", 1),
          ("write the ingestion volume", 1), ("manage grants", 2)],
         "Analysts read Gold only. The pipeline SP reads Silver, writes Gold, creates its tables and writes landing files (in practice the ingest SP writes the volume). Managing grants is governance: owner group / MANAGE holders — neither analysts nor pipelines.",
         tags=("concept", "exam"), diff=2, quick=True)
c.mcq("With the analyst grants from the lesson (USE CATALOG prod_ecommerce, USE SCHEMA + SELECT on gold), what happens to `SELECT * FROM prod_ecommerce.silver.orders` for an analyst?",
      ["Denied — no USE SCHEMA / SELECT on silver", "Allowed — USE CATALOG covers all schemas",
       "Allowed — SELECT on gold is inherited by silver", "Allowed but masked"], 0,
      "Grants are scoped: Gold yes, Silver no. USE CATALOG is only a prerequisite, and grants flow **down** a hierarchy, never sideways between sibling schemas.",
      tags=("concept",), diff=1, quick=True)
c.write("Write the grants so `gold_pipeline_sp` can read every table in `prod_ecommerce.silver` and write to `prod_ecommerce.gold` — nothing else.",
        "GRANT USE CATALOG ON CATALOG prod_ecommerce TO `gold_pipeline_sp`;\nGRANT USE SCHEMA ON SCHEMA prod_ecommerce.silver TO `gold_pipeline_sp`;\nGRANT SELECT ON SCHEMA prod_ecommerce.silver TO `gold_pipeline_sp`;\nGRANT USE SCHEMA ON SCHEMA prod_ecommerce.gold TO `gold_pipeline_sp`;\nGRANT MODIFY ON SCHEMA prod_ecommerce.gold TO `gold_pipeline_sp`;",
        ["grant use catalog on catalog prod_ecommerce", "grant use schema on schema prod_ecommerce.silver", "grant select on schema prod_ecommerce.silver",
         "grant use schema on schema prod_ecommerce.gold", "grant modify on schema prod_ecommerce.gold", "`gold_pipeline_sp`"],
        "Read Silver (USE SCHEMA + SELECT) and write Gold (USE SCHEMA + MODIFY), with one USE CATALOG. Schema-level grants inherit to all tables.",
        tags=("syntax",), diff=3)
c.spotbug("Grants for analysts in production. Which line violates least privilege?",
          ["GRANT USE CATALOG ON CATALOG prod_ecommerce TO `analysts`;", "GRANT USE SCHEMA ON SCHEMA prod_ecommerce.gold TO `analysts`;",
           "GRANT SELECT ON SCHEMA prod_ecommerce.gold TO `analysts`;", "GRANT MODIFY ON SCHEMA prod_ecommerce.gold TO `analysts`;"],
          [3], "-- remove: analysts only read; writes go to service principals",
          "Analysts need to **read** Gold. MODIFY lets them change production data; Databricks recommends reserving direct writes for service principals.",
          tags=("pitfall",), diff=1)

c.T("§61 Common bad practice (ALL PRIVILEGES to everyone)")
c.tf("`GRANT ALL PRIVILEGES ON CATALOG prod_ecommerce TO all_company_users` is acceptable as long as you review it once a year, because ALL PRIVILEGES is a fixed list.", False,
     "False twice: it violates least privilege, and ALL PRIVILEGES is **evaluated dynamically** — new applicable privileges are included automatically as they're added.",
     tags=("pitfall", "exam"), diff=2)

c.T("§76 Full mini-project configuration")
c.match("Mini-project configuration: match the object kind to its name.",
        [("Catalog", "prod_ecommerce"), ("Volume", "prod_ecommerce.raw_files.incoming"),
         ("Gold table", "prod_ecommerce.gold.daily_revenue"), ("Service principal", "orders_ingest_sp"), ("Metastore", "Europe")],
        "One regional metastore (Europe), one production catalog with bronze/silver/gold/raw_files schemas, tables per layer, a landing volume, and service principals for ingest and transform.",
        diff=1)

c.T("§77–78 Practical SQL lab + inspecting objects")
c.match("Lab 2: match the inspection command to what it lists.",
        [("SHOW CATALOGS;", "all catalogs you can see"), ("SHOW SCHEMAS IN ecommerce_dev;", "schemas of one catalog"),
         ("SHOW TABLES IN ecommerce_dev.silver;", "tables of one schema"), ("DESCRIBE TABLE ecommerce_dev.silver.orders;", "columns and types of one table")],
        "Top-down navigation: catalogs → schemas → tables → columns. Basic UC navigation from SQL.",
        tags=("syntax",), diff=1)
c.write("Lab 1: create catalog `ecommerce_dev` (if missing), schema `files` in it (if missing) and the managed volume `incoming`.",
        "CREATE CATALOG IF NOT EXISTS ecommerce_dev;\nCREATE SCHEMA IF NOT EXISTS ecommerce_dev.files;\nCREATE VOLUME ecommerce_dev.files.incoming;",
        ["create catalog if not exists ecommerce_dev", "create schema if not exists ecommerce_dev.files", "create volume ecommerce_dev.files.incoming"],
        "No LOCATION → managed volume under the catalog/schema managed storage.",
        tags=("syntax",), diff=1)

c.T("§79–80 Grant practice + volume practice")
c.cloze("Lab 3: complete the grant practice for `training_analysts`, then inspect.",
        "GRANT [[USE CATALOG]] ON CATALOG ecommerce_dev TO `training_analysts`;\nGRANT [[USE SCHEMA]] ON SCHEMA ecommerce_dev.gold TO `training_analysts`;\nGRANT [[SELECT]] ON SCHEMA ecommerce_dev.gold TO `training_analysts`;\n[[SHOW GRANTS]] ON SCHEMA ecommerce_dev.gold;",
        "Namespace first (USE CATALOG, USE SCHEMA), then data (SELECT on the schema, inherited by its tables), then verify with SHOW GRANTS.",
        bank=["MODIFY", "BROWSE", "DESCRIBE"], as_code=True, tags=("syntax",), diff=1)
c.mcq("Lab 4 grants `data_engineers` USE SCHEMA on `ecommerce_dev.files` and READ VOLUME, WRITE VOLUME on `incoming` — and nothing else. What could still block `open(\"/Volumes/ecommerce_dev/files/incoming/test.txt\", \"w\")`?",
      ["Missing USE CATALOG on `ecommerce_dev`", "Missing MODIFY on the volume", "Missing SELECT on the schema", "Volumes can't be written from Python"], 0,
      "The source lab omits it, but the read/write path needs **USE CATALOG + USE SCHEMA + READ VOLUME (+ WRITE VOLUME)**. MODIFY/SELECT are table privileges; Python `open()` on /Volumes paths is supported.",
      tags=("debug", "pitfall"), diff=2)

# =====================================================================
# s15
# =====================================================================
c.sec(15, "The PERMISSION_DENIED Algorithm & the Six Cases",
      "The main outcome of Phase 3: stop thinking \"I don't have SELECT\" and walk the whole authorization chain.")
c.code("sql", """SELECT * FROM prod_ecommerce.gold.daily_revenue;
-- PERMISSION_DENIED""")
c.callout("pitfall", "Don't ask for admin",
          "\"Give me admin\" fixes the symptom, breaks least privilege, and teaches you nothing. **Debug by layers.**")
c.diagram("""
1. Which principal is ACTUALLY executing?        (Identity)
        ↓
2. Right workspace / catalog binding?            (Binding)
        ↓
3. USE CATALOG?                                  (Catalog)
        ↓
4. USE SCHEMA?                                   (Schema)
        ↓
5. SELECT (object privilege)?                    (Object)
        ↓
6. Row filter / column mask / ABAC?              (Fine-grained)
        ↓
7. External-storage permissions, if relevant?    (Storage)
        ↓
8. Compute compatible with Unity Catalog?        (Compute)
""", "The production-grade permission-debugging model")
c.callout("tip", "Mnemonic: I Bet Cats Sit On Fluffy Silk Cushions",
          "**I**dentity · **B**inding · **C**atalog · **S**chema · **O**bject · **F**ine-grained · **S**torage · **C**ompute.")
c.table(["Case", "Symptom", "Layer", "Check"],
        [["1 Wrong identity", "notebook works, job fails", "Identity", "job run-as (service principal) grants"],
         ["2 SELECT, no USE SCHEMA", "denied although SELECT exists", "Schema", "USE SCHEMA on parent schema"],
         ["3 Revoked but still readable", "REVOKE had no effect", "Object (inheritance)", "SELECT on schema / catalog"],
         ["4 Managed OK, external fails", "storage access error", "Storage (+ Binding)", "external location, credential, binding, cloud IAM"],
         ["5 Volume file fails", "open('/Volumes/…') fails", "Object (volume)", "READ VOLUME (+ WRITE VOLUME)"],
         ["6 Sees ****", "query OK, values masked", "Fine-grained", "column mask / row filter / ABAC"]],
        "The six debugging cases on the algorithm")
c.p("**Case 1 — Wrong identity.** You (Nikos) have SELECT ✅ in the notebook. The job runs as `orders-etl-sp`, which has **no** SELECT ❌. The job fails.")
c.callout("key", "Run button ≠ workload identity",
          "The identity that presses **Run** is not necessarily the identity the workload **uses**. A job may execute as a service principal with different UC privileges.")
c.ask("Ask yourself on every PERMISSION_DENIED (I Bet Cats Sit On Fluffy Silk Cushions)", [
    "Which principal is actually executing — me, a job run-as, a pipeline service principal?",
    "Am I in a workspace bound to this catalog / external location?",
    "Does that principal have USE CATALOG on the catalog?",
    "Does it have USE SCHEMA on the schema?",
    "Does it have the object privilege (SELECT / MODIFY / READ VOLUME …), directly or inherited?",
    "Is a row filter, column mask or ABAC policy changing what it sees?",
    "For external data: are external location, storage credential and cloud IAM OK?",
    "Is the compute Unity Catalog-compatible?"])
c.callout("key", "The Phase-3 outcome",
          "Never again think of a permission error as just \"I don't have SELECT\". Think of the **whole authorization chain**.")

c.T("§62 The permission-debugging algorithm (8 layers)")
c.order("Order the 8 layers of the permission-debugging algorithm.",
        ["Which principal actually executes?", "Workspace / catalog binding", "USE CATALOG", "USE SCHEMA", "SELECT (object privilege)",
         "Row filter / column mask / ABAC", "External-storage permissions (if relevant)", "UC-compatible compute"],
        "I Bet Cats Sit On Fluffy Silk Cushions: Identity → Binding → Catalog → Schema → Object → Fine-grained → Storage → Compute. Identity is first because every later check depends on WHO is being authorized.",
        tags=("debug", "exam"), diff=2, quick=True)
c.cloze("Complete the mnemonic layers (I Bet Cats Sit On Fluffy Silk Cushions).",
        "[[Identity]] → [[Binding]] → Catalog → Schema → [[Object]] → [[Fine-grained|Fine grained]] → Storage → [[Compute]]",
        "Identity (actual principal), Binding (workspace), Catalog (USE CATALOG), Schema (USE SCHEMA), Object (SELECT/MODIFY…), Fine-grained (filters/masks/ABAC), Storage (external location/IAM), Compute (UC-compatible).",
        bank=["Ownership", "Cluster size", "Photon"], tags=("debug",), diff=1, quick=True)
c.mcq("You hit PERMISSION_DENIED on `prod_ecommerce.gold.daily_revenue`. What is the FIRST question of the algorithm?",
      ["Which principal is actually executing this?", "Do I have SELECT?", "Is the table external?", "Can I get admin?"], 0,
      "Identity first: all grants are evaluated for the **executing** principal. Checking SELECT for yourself is pointless if a job runs as a service principal. Asking for admin isn't debugging.",
      why=["Correct.", "Step 5 — and only meaningful for the right identity.", "Step 7 — only relevant for external data.", "Not a debugging step; breaks least privilege."],
      tags=("debug",), diff=1)
c.scenario("A scheduled job writing `prod_ecommerce.gold.daily_revenue` fails with PERMISSION_DENIED. It worked yesterday. Walk the algorithm.", [
    ("Step 1?", [
        ("Check the job's run-as principal (did someone change it to a different SP?).", True, "Identity first."),
        ("Check that YOU have MODIFY on gold.", False, "You're not the one executing."),
        ("Enlarge the cluster.", False, "Not an authorization layer."),
    ]),
    ("Run-as is still `gold_pipeline_sp`. You're in the prod workspace on a serverless job. Next?", [
        ("SHOW GRANTS on catalog, schema gold and the table for `gold_pipeline_sp` (USE CATALOG, USE SCHEMA, MODIFY).", True, "Catalog → schema → object for the right principal."),
        ("Look at the dashboard's lineage.", False, "Lineage helps with wrong values, not with denied writes."),
        ("Drop and recreate the table.", False, "Destructive and doesn't address authorization."),
    ]),
    ("You find a REVOKE MODIFY ON SCHEMA prod_ecommerce.gold FROM gold_pipeline_sp in yesterday's audit. Fix?", [
        ("Restore `GRANT MODIFY ON SCHEMA prod_ecommerce.gold TO gold_pipeline_sp` (after confirming it was a mistake).", True, "Restore exactly the missing privilege — least privilege preserved."),
        ("Make the job run as your personal user.", False, "Production writes should not depend on a personal identity."),
        ("Grant ALL PRIVILEGES on the catalog to the SP.", False, "Way beyond what's needed."),
    ])],
    tags=("debug",), diff=3)
c.bucket("Map each symptom to the algorithm layer you should suspect first.", ["Identity", "Binding", "Fine-grained policy", "Storage / Compute"],
         [("notebook works, scheduled job fails", 0), ("same grants, works in prod-workspace, fails in dev-workspace", 1),
          ("query succeeds but salary shows ****", 2), ("GR analyst sees only GR rows", 2),
          ("managed table OK, external table storage error", 3), ("same user/grants, fails only on an old legacy cluster", 3)],
         "Symptoms point to layers: a different executor → identity; different workspace → binding; succeeded-but-altered results → fine-grained; external-only or compute-only failures → storage/compute.",
         tags=("debug",), diff=2)
c.spotbug("A junior's runbook for PERMISSION_DENIED. Which step is in the wrong place?",
          ["1. Check SELECT on the table", "2. Which principal actually executes?", "3. Check USE CATALOG", "4. Check USE SCHEMA", "5. Check filters / masks / ABAC"],
          [0], "Move 'Which principal actually executes?' to step 1 (then binding, USE CATALOG, USE SCHEMA, SELECT …)",
          "Checking SELECT first — for whom? Identity must come first, and the object privilege comes **after** the namespace prerequisites (USE CATALOG, USE SCHEMA).",
          tags=("debug",), diff=2)

c.T("§63 Case 1 — wrong identity")
c.tf("The identity that presses \"Run\" on a job is always the identity the job uses to access data.", False,
     "False. The job may **run as** a service principal (e.g. `orders-etl-sp`) with different UC privileges. Check the run-as identity.",
     tags=("pitfall", "exam"), diff=1, quick=True)
c.scenario("Your notebook reads `prod.silver.orders` fine. The same code as a scheduled job fails with PERMISSION_DENIED.", [
    ("First question?", [
        ("Which identity does the job run as?", True, "The classic Case 1."),
        ("Is my SELECT still there?", False, "Your notebook works — your SELECT is fine."),
        ("Is the table corrupted?", False, "Then your notebook would fail too."),
    ]),
    ("Job runs as `orders-etl-sp`. Next?", [
        ("SHOW GRANTS for `orders-etl-sp` on catalog, schema and table.", True, "Check the right principal's chain."),
        ("Change run-as to your own user so it works.", False, "Production shouldn't depend on a personal account (it breaks when you leave)."),
        ("Grant yourself more privileges.", False, "You're not the one being denied."),
    ]),
    ("`orders-etl-sp` lacks SELECT on the table. Fix?", [
        ("Grant the SP exactly what the job needs (USE CATALOG, USE SCHEMA, SELECT …).", True, "Least privilege for the machine identity."),
        ("Grant ALL PRIVILEGES on prod to the SP.", False, "Over-privileged."),
        ("Add the SP to the `admins` group.", False, "Over-privileged and opaque."),
    ])],
    tags=("debug",), diff=2)
c.order("Case 1 — order the steps when a job fails but your notebook works.",
        ["Notice: same code, different executor", "Open the job settings and find the run-as identity",
         "SHOW GRANTS for that service principal at catalog → schema → object", "Grant the missing privilege(s) to the SP", "Re-run the job"],
        "The job's identity is different from yours. Find it, inspect its grants, and grant only what's missing.",
        tags=("debug",), diff=1)
c.free("In your own words: what does \"think the whole authorization chain, not just SELECT\" mean?",
       "A permission error can come from any layer: the wrong executing identity (job run-as), a workspace binding, missing USE CATALOG or USE SCHEMA, the object privilege itself (or an inherited grant), fine-grained policies (row filters, column masks, ABAC), the external storage chain (external location, credential, cloud IAM), or non-UC-compatible compute. So I walk the layers in order instead of assuming SELECT is missing or asking for admin.",
       ["Identity / run-as", "Binding", "USE CATALOG / USE SCHEMA", "Object privilege incl. inheritance", "Fine-grained policies", "Storage chain", "Compute compatibility", "Not 'ask for admin'"],
       "The Phase-3 outcome: a permission error is a chain, and you walk it in order.",
       tags=("debug", "interview"), diff=2)

# =====================================================================
# s16
# =====================================================================
c.sec(16, "Confusable Pairs & the Phase-3 Big Test",
      "Rapid-fire recall over the whole chapter: these are the questions interviews and certifications ask.")
c.table(["Pair", "First", "Second"],
        [["Managed vs external DROP", "UC handles metadata + file lifecycle", "metadata removed, files remain"],
         ["Storage credential vs external location", "HOW Databricks authenticates (cloud identity)", "WHICH path + which credential (securable)"],
         ["External location vs external table", "governed storage path", "table metadata pointing at data inside that path"],
         ["Metastore vs catalog", "top regional governance container", "primary logical/data isolation container inside it"],
         ["USE SCHEMA vs SELECT", "traverse the namespace", "read the data"],
         ["Table vs volume", "rows/columns, SELECT / MODIFY", "files, READ VOLUME / WRITE VOLUME"],
         ["Federation vs Delta Sharing", "query data where it lives elsewhere", "share data outward"]],
        "Confusable pairs — know both sides")
c.p("**Big test — Phase 3.** Every question of the source test is an exercise below (Q23–Q27 are missing in the source export).")
c.callout("exam", "Classic traps in one list",
          "USE ≠ SELECT · ALL PRIVILEGES excludes MANAGE / EXTERNAL USE … · REVOKE on table ≠ access gone · DROP external keeps files · workspace ≠ namespace level · SELECT ≠ unfiltered · permissions + wrong compute = failure.")
c.reveal("Think first: one sentence that sums up Phase 3?",
         "Don't think of a permission error as \"I don't have SELECT\" — think of the whole authorization chain: **I Bet Cats Sit On Fluffy Silk Cushions**.")

c.T("§85 Big test Q1 — top-level object")
c.mcq("Q1. What is the top-level Unity Catalog object?", ["Metastore", "Catalog", "Workspace", "Account"], 0,
      "The **metastore** is the top-level UC container for metadata and permissions. Catalogs live inside it; workspaces and accounts aren't UC namespace objects.",
      tags=("exam",), diff=1, quick=True)
c.T("§85 Big test Q2 — parse prod.finance.payroll")
c.cloze("Q2. What does `prod.finance.payroll` mean?",
        "catalog = [[prod]], schema = [[finance]], object = [[payroll]]",
        "Three-level namespace: catalog.schema.object.", tags=("exam",), diff=1, quick=True)
c.T("§85 Big test Q3 — workspace above catalog?")
c.tf("Q3. The workspace is above the catalog in the Unity Catalog namespace.", False,
     "No. The workspace is an operational environment; the catalog lives inside a UC **metastore**.", tags=("exam",), diff=1)
c.T("§85 Big test Q4 — multiple workspaces, one metastore")
c.tf("Q4. Multiple workspaces can use one metastore.", True,
     "Yes — typically within the same regional metastore architecture, subject to workspace bindings and permissions.", tags=("exam",), diff=1)
c.T("§85 Big test Q5–Q6 — securable, principal")
c.mcq("Q5. What is a securable object?",
      ["A Unity Catalog object on which privileges can be granted to principals", "Any encrypted file in S3", "A user, group or service principal", "A cluster with Dedicated access mode"], 0,
      "Securable = UC object you can grant on. The principal is the WHO; encryption and clusters are unrelated.", tags=("exam",), diff=1)
c.odd("Q6. A principal receives permissions. Which one is NOT a principal?",
      ["user", "group", "service principal", "schema"], 3,
      "Principals are users, groups and service principals. A schema is a **securable**.", tags=("exam",), diff=1)
c.T("§85 Big test Q7–Q8 — USE CATALOG and read path")
c.tf("Q7. USE CATALOG lets me SELECT every table in the catalog.", False, "No. It's only a traversal prerequisite.", tags=("exam",), diff=1)
c.order("Q8. The typical read path — order the grants from outermost to innermost.", ["USE CATALOG", "USE SCHEMA", "SELECT"],
        "Catalog → schema → object.", tags=("exam",), diff=1)
c.T("§85 Big test Q9–Q10 — groups, service principals")
c.mcq("Q9. Why are groups preferred to individual grants?",
      ["They centralize membership management and reduce permission sprawl", "Groups get higher query priority",
       "Individual users can't receive grants", "Groups bypass row filters"], 0,
      "One grant per group, membership changes instead of grant changes. Users **can** receive grants — it just doesn't scale.", tags=("exam",), diff=1)
c.mcq("Q10. Why use service principals for production pipelines?",
      ["Stable machine identity, decoupled from individual employee lifecycle", "They're cheaper per DBU", "They skip Unity Catalog checks", "They can't be granted privileges"], 0,
      "If an employee leaves, a personal-identity pipeline breaks; an SP doesn't. SPs are fully subject to UC grants.", tags=("exam",), diff=1)
c.T("§85 Big test Q11 — ownership")
c.mcq("Q11. What is ownership?",
      ["An administrative/control relationship with an object, including broad management and grant-delegation capabilities", "Another name for SELECT",
       "The workspace where the object was created", "Write access to the files"], 0,
      "Owners can manage the object, manage privileges and transfer ownership — far more than SELECT.", tags=("exam",), diff=1)
c.T("§85 Big test Q12 — ALL PRIVILEGES exclusions")
c.mcq("Q12. Is ALL PRIVILEGES literally every possible privilege? Which are excluded? (choose all)",
      ["MANAGE", "EXTERNAL USE LOCATION", "EXTERNAL USE SCHEMA", "SELECT", "MODIFY"], [0, 1, 2],
      "No — MANAGE, EXTERNAL USE LOCATION and EXTERNAL USE SCHEMA are excluded.", tags=("exam",), diff=2)
c.T("§85 Big test Q13–Q15 — managed vs external, DROP")
c.bucket("Q13. Managed vs external: who controls the storage lifecycle?", ["UC controls governance + storage lifecycle", "UC governance only; you/external system control lifecycle"],
         [("managed table", 0), ("external table", 1), ("managed volume", 0), ("external volume", 1)],
         "Managed → UC owns location and lifecycle. External → UC governs, you control location and lifecycle.", tags=("exam",), diff=1)
c.tf("Q14. Dropping an external table deletes its files.", False, "No. Underlying files remain; only UC metadata is removed.", tags=("exam",), diff=1)
c.mcq("Q15. What happens to the files when you drop a MANAGED table?",
      ["Unity Catalog manages their deletion as part of the managed lifecycle", "They always remain forever", "They move to the external location", "They become a volume"], 0,
      "For managed tables UC owns the file lifecycle, including deletion after DROP.", tags=("exam",), diff=1)
c.T("§85 Big test Q16–Q18 — credential, location, why location")
c.match("Q16–Q18. Match each question to its answer.",
        [("Storage credential?", "governed abstraction of a cloud authentication identity"),
         ("External location?", "cloud path + storage credential, as a securable"),
         ("Why grant on an external location, not the raw credential?", "better path-scoped least privilege")],
        "Credential = identity, location = path + identity, grants on location = path-scoped least privilege.", tags=("exam",), diff=1)
c.T("§85 Big test Q19–Q21 — volumes")
c.mcq("Q19. What is a volume?", ["A Unity Catalog governed container for non-tabular files", "A Delta table without schema",
                                 "A disk attached to the driver", "A backup of a catalog"], 0,
      "Volumes govern files (PDFs, images, raw files) with /Volumes/... paths.", tags=("exam",), diff=1)
c.cloze("Q20. Volume read privileges?", "USE [[CATALOG]] + USE [[SCHEMA]] + [[READ VOLUME]]",
        "Same prerequisites as tables, but the object privilege is READ VOLUME.", bank=["SELECT", "WRITE VOLUME", "MODIFY"], tags=("exam",), diff=1)
c.tf("Q21. Table permissions and volume permissions are identical.", False,
     "No. Tables use e.g. SELECT, MODIFY; volumes use READ VOLUME, WRITE VOLUME.", tags=("exam",), diff=1)
c.T("§85 Big test Q22 — workspace binding")
c.mcq("Q22. What is a workspace binding?",
      ["A restriction specifying which workspaces can access certain UC objects (catalogs, external locations, storage credentials)",
       "Attaching a notebook to a cluster", "The link between an account and its billing", "A grant from a workspace admin to a user"], 0,
      "Bindings restrict where (from which workspaces) catalogs, external locations and credentials can be used — independent of user grants.", tags=("exam",), diff=1)
c.T("§85 Big test Q28 — column-level lineage")
c.tf("Q28. Unity Catalog captures column-level lineage.", True, "Yes, for supported Databricks queries/workloads.", tags=("exam",), diff=1)
c.T("§85 Big test Q29 — PERMISSION_DENIED sequence")
c.cloze("Q29. Fill in the likely debugging sequence for PERMISSION_DENIED.",
        "actual [[principal]] → workspace [[binding]] → USE CATALOG → USE SCHEMA → object [[privilege]] → [[fine-grained]] policies → storage/external location → [[compute]] compatibility",
        "Identity, binding, catalog, schema, object, fine-grained, storage, compute — I Bet Cats Sit On Fluffy Silk Cushions.",
        bank=["owner", "cluster size", "region"], tags=("exam", "debug"), diff=2)
c.T("§85 Big test Q30 — job fails, notebook succeeds")
c.mcq("Q30. Why can a job fail although your notebook succeeds?",
      ["The job may execute as a different service principal with different UC privileges", "Jobs ignore Unity Catalog",
       "Notebooks cache permissions forever", "Jobs can only read managed tables"], 0,
      "Different executor, different grants — Case 1 of the algorithm.", tags=("exam", "debug"), diff=1)
