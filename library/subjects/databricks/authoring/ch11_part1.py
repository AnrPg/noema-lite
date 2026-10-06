"""ch11 sections 1–5: mental model, hierarchy, namespace, principals, USE privileges."""
from ch11_core import c

# =====================================================================
# s01
# =====================================================================
c.sec(1, "The Four Questions & Why Unity Catalog Exists",
      "Four questions explain almost all of Unity Catalog. Learn them first and the rest of the phase slots in around them.")
c.p("The most important mental model of Phase 3: every governance question breaks into **four questions**, asked top to bottom.")
c.diagram("""
WHO?            user / group / service principal
   │
   ▼
WHAT OBJECT?    metastore
                └── catalog
                    └── schema
                        ├── table     ├── view
                        ├── volume    ├── function
                        └── model
   │
   ▼
WHAT ACTION?    USE / SELECT / MODIFY / CREATE / READ VOLUME / ...
   │
   ▼
WHERE ARE       managed storage
THE BYTES?      or  external location → cloud object storage
""", "The Phase-3 mental model: WHO → WHAT OBJECT → WHAT ACTION → WHERE ARE THE BYTES")
c.callout("key", "Make this one diagram clear",
          "Once **WHO / WHAT OBJECT / WHAT ACTION / WHERE ARE THE BYTES** is clear, almost all of Unity Catalog starts to make sense. Every later section answers one of these four.")
c.p("**Why does Unity Catalog exist?** Start without Databricks. A company keeps its data in **S3 / ADLS** folders and has **100 developers**.")
c.diagram("""
S3 / ADLS
├── finance/
│   ├── payroll/
│   └── invoices/
├── sales/
│   ├── orders/
│   └── customers/
└── marketing/
""", "Just folders. Nothing here says who may read payroll.")
c.p("Without **central governance** you must answer by hand:")
c.ul(["Who can **read** payroll? Who can **write** orders?",
      "Who is the **owner**?",
      "Which **pipeline** created this table? Which **dashboard** uses this column?",
      "Which **service principal** has access?",
      "What happens if someone reads the **storage path directly**, bypassing permissions?"])
c.reveal("Think first: what if permissions live only in the S3 bucket, Azure Storage, notebooks, clusters and BI tools?",
         "You get **fragmented governance**: five places, five permission models, no single answer to \"who has what?\". Unity Catalog makes governance **central**.")
c.p("Databricks describes Unity Catalog as a **hierarchical governance layer**: every governed asset is a **securable object**, privileges go to **users, groups or service principals**, the **metastore** is the top-level container, and assets live in the three-level namespace `catalog.schema.object`.")
c.callout("pitfall", "Unity Catalog ≠ storage",
          "UC is **not** a giant database filesystem and does **not** store the Parquet bytes. It is **metadata + namespace + permissions + ownership + lineage + governance policies + storage references**. The bytes live in **S3 / ADLS / GCS**.")
c.diagram("""
Unity Catalog
     │  governs
     ▼
table metadata
     │  points to / manages
     ▼
cloud storage  (S3 / ADLS / GCS)
""", "UC governs metadata that points at (or manages) cloud storage")
c.callout("analogy", "Library catalogue + security desk",
          "UC is the library's **catalogue and security desk**: it knows every book, who may borrow it and where it sits. The **books themselves** stand on shelves elsewhere — your cloud storage.")
c.callout("key", "Recap → Chapter 1",
          "Metadata ≠ data and UC ≠ Delta Lake were introduced in Chapter 1 (\"Table Metadata & the Unity Catalog Namespace\"). This chapter goes deep.")

c.T("§0 Mental model: WHO / WHAT OBJECT / WHAT ACTION / WHERE ARE THE BYTES")
c.order("Put the four Unity Catalog questions in the order the mental model asks them.",
        ["WHO? (user / group / service principal)", "WHAT OBJECT? (metastore → catalog → schema → object)",
         "WHAT ACTION? (USE / SELECT / MODIFY / CREATE / READ VOLUME)", "WHERE ARE THE BYTES? (managed storage or external location)"],
        "The model goes from the **identity**, to the **object** in the hierarchy, to the **action** (privilege), and finally to the **physical bytes** in cloud storage. Most permission bugs sit in one of these four layers.",
        tags=("concept",), diff=1, quick=True)
c.bucket("Sort each item into the question of the mental model it answers.",
         ["WHO?", "WHAT OBJECT?", "WHAT ACTION?", "WHERE ARE THE BYTES?"],
         [("`nikos@company.com`", 0), ("group `analysts`", 0), ("`orders-etl-prod` service principal", 0),
          ("`prod.sales.orders`", 1), ("volume `prod.raw.documents`", 1),
          ("`SELECT`", 2), ("`READ VOLUME`", 2),
          ("`s3://company/raw/` via an external location", 3), ("managed storage of the catalog", 3)],
         "Principals answer **WHO**; securables in the hierarchy answer **WHAT OBJECT**; privileges answer **WHAT ACTION**; managed storage / external locations answer **WHERE ARE THE BYTES**. Mixing these layers up is the root of most UC confusion.",
         tags=("concept",), diff=1, quick=True)

c.T("§1 Why Unity Catalog exists — fragmented vs central governance")
c.mcq("Permissions for the same data live in S3 bucket policies, Azure Storage ACLs, notebook ACLs, cluster settings and the BI tool. What is this called?",
      ["Fragmented governance", "Least privilege", "Data isolation", "Workspace binding"], 0,
      "When permissions are scattered across storage, notebooks, clusters and BI tools you have **fragmented governance** — no single place answers \"who has what?\". UC exists to make governance **central**. Least privilege is a principle, not this problem.",
      why=["Correct — many systems, many permission models.", "Least privilege is about giving minimal rights, not where rights live.",
           "Data isolation is a design goal (often a catalog boundary).", "Workspace binding is a UC feature restricting which workspaces see an object."],
      tags=("concept",), diff=1)
c.mcq("Which governance question can bucket-level storage permissions alone **never** answer?",
      ["Which dashboard uses the column `orders.customer_id`?", "Can this IAM role read `s3://company/finance/`?",
       "Is this bucket encrypted?", "Who can list the `sales/` prefix?"], 0,
      "Storage permissions know about **paths and identities**, not about **tables, columns, pipelines or dashboards**. Questions like \"which dashboard uses this column?\" need **lineage**, which UC captures centrally.",
      tags=("concept", "exam"), diff=2)

c.T("§2 Unity Catalog ≠ storage")
c.tf("Unity Catalog stores the Parquet bytes of your Delta tables inside its own database.", False,
     "False. UC holds **metadata, namespace, permissions, ownership, lineage, policies and storage references**. The actual data files live in **cloud object storage** (S3 / ADLS / GCS) — even for managed tables.",
     tags=("pitfall",), diff=1, quick=True)
c.mcq("Which items does Unity Catalog hold? (choose all)",
      ["Table metadata and the namespace", "Permissions and ownership", "Lineage", "References to storage locations", "The Parquet data files themselves"],
      [0, 1, 2, 3],
      "UC = metadata + namespace + permissions + ownership + lineage + governance policies + storage references. The **data files** stay in cloud storage; UC only points to (or manages) them.",
      tags=("concept", "pitfall"), diff=2)
c.odd("Which one doesn't belong?", ["S3", "ADLS", "GCS", "Unity Catalog"], 3,
      "S3, ADLS and GCS are **cloud object stores** where the bytes live. Unity Catalog is the **governance layer** that points at them — it is not storage.",
      tags=("concept",), diff=1)
c.free("Explain to a new colleague, in 3–4 sentences, why a company with 100 developers and data in S3 folders needs Unity Catalog.",
       "Without central governance, permissions live in many places (bucket policies, notebooks, clusters, BI tools), so nobody can answer who may read payroll, who owns a table, which pipeline created it or which dashboard uses a column. Unity Catalog adds one hierarchical governance layer over the storage: every asset is a securable object in a catalog.schema.object namespace, privileges go to users, groups and service principals, and lineage is captured automatically. The bytes stay in cloud storage — UC governs metadata, permissions and storage references.",
       ["Fragmented governance across many tools", "UC = one central, hierarchical governance layer", "Securables + privileges + principals", "Lineage / ownership questions answered", "UC does not store the bytes"],
       "A strong answer names the problem (fragmented governance), the solution (central hierarchical layer with securables, privileges, principals) and the boundary (UC governs; storage keeps the bytes).",
       tags=("interview",), diff=2)

# =====================================================================
# s02
# =====================================================================
c.sec(2, "Metastore, Workspace & the Hierarchy",
      "The metastore sits above everything, and the workspace is not part of the namespace at all. Misplace either and your debugging goes wrong from the first step.")
c.p("The hierarchy from the top: one **metastore** holds **catalogs**, catalogs hold **schemas**, schemas hold **objects**.")
c.diagram("""
METASTORE
├── CATALOG: dev
│   ├── SCHEMA: bronze
│   ├── SCHEMA: silver
│   └── SCHEMA: gold
├── CATALOG: prod
│   ├── SCHEMA: bronze
│   ├── SCHEMA: silver
│   └── SCHEMA: gold
└── CATALOG: sandbox
""", "Metastore → catalogs → schemas")
c.diagram("""
prod
└── silver
    ├── orders            (table)
    ├── customers         (table)
    ├── products          (table)
    ├── files_volume      (volume)
    └── normalize_email() (function)
""", "Inside a schema: tables, volumes, functions …")
c.p("Databricks treats the **catalog** as the **primary unit of data isolation**, and the **schema** as a finer organizational / access-control layer.")
c.p("The **metastore** is the **top-level container of Unity Catalog for metadata and permissions**. It exposes the three-level namespace `catalog.schema.object`.")
c.compare(("A metastore IS", ["the top-level UC container", "metadata about catalogs, tables, volumes, external locations, credentials, shares, permissions …", "regional (usually one per region)"]),
          ("A metastore is NOT", ["a table", "a schema", "a storage bucket", "a workspace"]))
c.p("Usually there is **one metastore per region**, and many workspaces in that region attach to it — so they share governance.")
c.diagram("""
Databricks Account
├── Workspace A ──┐
├── Workspace B ──┼──►  Metastore Europe
└── Workspace C ──┘
""", "Many workspaces, one regional metastore → common governance")
c.compare(("Workspace", ["operational development environment", "notebooks, jobs, compute live here", "where you WORK"]),
          ("Metastore", ["regional Unity Catalog governance container", "`prod.sales.orders` is REGISTERED here", "where objects are GOVERNED"]))
c.p("So two workspaces can see the **same governed object** when all three hold:")
c.flow(["Both attached to the same metastore", "Principal has the permission", "No workspace binding forbids it", "Access ✓"],
       "Three conditions for cross-workspace access")
c.callout("exam", "Metastore vs catalog",
          "**Metastore** = top **regional** governance container. **Catalog** = primary **logical / data isolation** container **inside** the metastore. You do **not** create a metastore per project by default — isolation usually starts at the **catalog** level.")
c.callout("pitfall", "The workspace is not in the namespace",
          "`catalog.schema.object` has no workspace level. A notebook **lives in** a workspace; `prod.sales.orders` is **registered in** the metastore. \"Workspace above catalog\" is wrong.")
c.callout("key", "Recap → Chapter 4",
          "Account vs workspace (one account, many workspaces, metastores configured at account level) is in Chapter 4, \"Account vs Workspace\".")

c.T("§3 Hierarchy from the top (metastore → catalog → schema → object)")
c.order("Order these levels from top (broadest) to bottom.",
        ["Metastore", "Catalog (e.g. `prod`)", "Schema (e.g. `silver`)", "Object (e.g. table `orders`)"],
        "Metastore is the top-level container, then catalog (first name), schema (second name), object (third name). The workspace is **not** part of this chain.",
        diff=1, quick=True)
c.mcq("Databricks calls one level \"the primary unit of data isolation\". Which?",
      ["Catalog", "Schema", "Metastore", "Workspace"], 0,
      "The **catalog** is the primary data-isolation unit (e.g. `dev` vs `prod`). The schema is a finer organizational/access layer; the metastore is regional and usually shared; the workspace is an operational environment, not a namespace level.",
      why=["Correct.", "Schema is finer-grained organization inside a catalog.", "Usually one per region, shared by many workspaces — too broad.", "Not part of the namespace."],
      tags=("exam",), diff=1, quick=True)

c.T("§4 Metastore — what it really is")
c.odd("A metastore is NOT three of these. Which option is the odd one out because it IS what a metastore is?",
      ["a table", "a storage bucket", "a workspace", "the top-level container for UC metadata and permissions"], 3,
      "A metastore is the **top-level container for Unity Catalog metadata and permissions**. It is not a table, not a schema, not a storage bucket and not a workspace.",
      tags=("concept", "pitfall"), diff=1)
c.mcq("Which of these does the metastore hold metadata about? (choose all)",
      ["Catalogs and tables", "Volumes", "External locations and storage credentials", "Shares and permissions", "Running clusters"],
      [0, 1, 2, 3],
      "The metastore tracks catalogs, tables, volumes, external locations, credentials, shares and permissions. **Clusters** are compute resources in a workspace, not metastore objects.",
      tags=("concept",), diff=2)
c.calc("A company has 3 workspaces in Europe and 2 workspaces in the US, using the typical pattern. How many Unity Catalog metastores do they usually have?",
       2, "Typically **one metastore per region**, shared by all workspaces in that region: one for Europe, one for the US = **2**. You don't create one metastore per workspace or per project.",
       unit="metastores", tags=("calc", "exam"), diff=2)

c.T("§5 Workspace ≠ metastore")
c.bucket("Where does each thing belong?", ["Lives in a WORKSPACE (operational)", "Registered in the METASTORE (governed)"],
         [("a notebook", 0), ("a job definition", 0), ("an all-purpose cluster", 0),
          ("table `prod.sales.orders`", 1), ("catalog `prod`", 1), ("an external location", 1), ("a storage credential", 1)],
         "Notebooks, jobs and compute are **workspace** objects (where you work). Catalogs, tables, external locations and credentials are **metastore** objects (where data is governed) — which is why several workspaces can see the same table.",
         diff=2)
c.mcq("Workspace B wants to query `prod.sales.orders`, created from workspace A. Which conditions must hold? (choose all)",
      ["Both workspaces are attached to the same metastore", "The principal has the needed privileges",
       "No workspace binding blocks the catalog in workspace B", "The table was re-created inside workspace B"],
      [0, 1, 2],
      "The table is registered in the **metastore**, not in workspace A. B sees it if it shares the metastore, the principal is granted access, and no **workspace binding** excludes B. Nothing needs to be re-created.",
      tags=("concept", "exam"), diff=2)
c.mcq("A team lead wants to isolate a new project's data. What is the default Databricks recommendation?",
      ["Create a new catalog (and grants) inside the existing regional metastore", "Create a new metastore for the project",
       "Create a new workspace — that isolates the data", "Create a new S3 bucket and skip UC"], 0,
      "Isolation usually starts at the **catalog** level. A new metastore per project is **not** the default pattern (usually one per region), and a new workspace does not isolate governed data on its own — workspaces sharing a metastore see the same objects.",
      why=["Correct.", "Metastores are regional containers; not one per project.", "A workspace is an operational environment; data stays in the shared metastore.", "Skipping UC brings back fragmented governance."],
      tags=("pitfall", "exam"), diff=2)

# =====================================================================
# s03
# =====================================================================
c.sec(3, "Catalogs, Schemas, Objects & Creating Them",
      "Catalog = big boundary, schema = organization, object = the thing. Creating each already needs hierarchical privileges.")
c.diagram("""
prod . sales . orders
^^^^   ^^^^^   ^^^^^^
catalog schema object
""", "Three names, three levels")
c.p("The **catalog** is the first level. Think of it as a large **logical / security boundary**.")
c.table(["Design style", "Example catalogs"],
        [["By environment", "`dev`, `test`, `prod`"], ["By business unit", "`finance`, `sales`, `marketing`"],
         ["Mixed", "`prod_finance`, `prod_sales`, `dev_shared`"]],
        "There is no single right structure")
c.p("Databricks recommends that catalogs represent **meaningful isolation boundaries** — environment, business unit, team or project — so that **hierarchical grants stay simple and logical**.")
c.p("The **schema** is the second level: a child of a catalog that can contain **tables, views, volumes, models and functions**. Organize schemas by **layer, team, domain or use case**.")
c.compare(("By layer", ["prod.bronze", "prod.silver", "prod.gold"]),
          ("By domain", ["prod.finance", "prod.logistics", "prod.crm"]))
c.p("The third name is the **object**: table, view, volume, function, model, materialized view, streaming table … So the general form is **`catalog.schema.object`**, not always `catalog.schema.table`.")
c.callout("key", "Recap → Chapter 4: fully qualified names",
          "`SELECT * FROM prod.sales.orders` is **fully qualified**; `SELECT * FROM orders` depends on `current_catalog()` / `current_schema()` (set with `USE CATALOG` / `USE SCHEMA`). In production, fully qualified names are safer because they **remove ambiguity**. Details: Chapter 4, \"Namespaces and Fully Qualified Names\".")
c.code("sql", """CREATE CATALOG ecommerce;
USE CATALOG ecommerce;

CREATE SCHEMA ecommerce.silver;
CREATE SCHEMA IF NOT EXISTS ecommerce.silver;   -- idempotent""", "Creating a catalog and a schema")
c.table(["You want to…", "Privilege you typically need"],
        [["`CREATE CATALOG`", "`CREATE CATALOG` on the **metastore**"],
         ["`CREATE SCHEMA` in `ecommerce`", "`USE CATALOG` **+** `CREATE SCHEMA` on the parent catalog `ecommerce`"]],
        "The first example that permissions are hierarchical")
c.callout("exam", "CREATE SCHEMA needs two privileges",
          "`CREATE SCHEMA` alone is not enough: you also need `USE CATALOG` on the parent catalog. It is the first time you see that UC permissions are **hierarchical**.")
c.ask("Ask yourself when CREATE CATALOG / CREATE SCHEMA fails", [
    "Am I creating a catalog — then do I have CREATE CATALOG on the metastore?",
    "Am I creating a schema — do I have BOTH USE CATALOG and CREATE SCHEMA on the parent catalog?",
    "Am I using the fully qualified name, so the schema lands in the catalog I think?",
    "Is the identity running this the one that holds the grants (me vs a job's service principal)?"])

c.T("§6–8 Catalog, schema, object (three-level namespace)")
c.match("Match each part of `prod.finance.payroll` to its level.",
        [("prod", "catalog"), ("finance", "schema"), ("payroll", "object (here a table)")],
        "The three-level namespace is **catalog.schema.object**. The first name is the isolation boundary, the second organizes, the third is the actual asset.",
        diff=1, quick=True)
c.odd("Which one cannot be the third name (the object) in `catalog.schema.object`?",
      ["a volume", "a function", "a materialized view", "a workspace"], 3,
      "Objects inside a schema include tables, views, volumes, functions, models, materialized views and streaming tables. A **workspace** is an operational environment outside the namespace.",
      tags=("concept", "pitfall"), diff=1)
c.bucket("A company is designing catalogs. Classify each design.", ["By environment", "By business unit", "Mixed"],
         [("`dev`, `test`, `prod`", 0), ("`finance`, `sales`, `marketing`", 1), ("`prod_finance`, `prod_sales`, `dev_shared`", 2),
          ("`staging`, `prod`", 0), ("`hr`, `logistics`", 1)],
         "All three are valid; there is no single right structure. Databricks' rule: catalogs should be **meaningful isolation boundaries** (environment, business unit, team, project) so grants stay simple.",
         tags=("compare",), diff=1)
c.tf("Databricks prescribes exactly one correct catalog layout: one catalog per environment (dev/test/prod).", False,
     "False. Environment, business unit, team, project or mixed layouts are all valid. The guidance is that catalogs represent **meaningful isolation boundaries** so hierarchical grants stay simple.",
     tags=("pitfall",), diff=1)

c.T("§9 Fully qualified names (recap)")
c.mcq("You run `USE CATALOG prod; USE SCHEMA sales;` and then `SELECT * FROM orders;`. Which table do you read, and why is this risky in production code?",
      ["`prod.sales.orders`; the short name depends on session context, so the same code may read another table elsewhere",
       "`orders` in the default `hive_metastore`; USE is ignored by SELECT",
       "An error — short names are not allowed in Unity Catalog",
       "`prod.sales.orders`; there is no risk because USE is permanent for the workspace"], 0,
      "Unqualified names resolve against the **current catalog and schema**. That works, but the same code run with a different context resolves to a different object — so production code prefers **fully qualified names**. USE only affects the current session.",
      tags=("concept", "pitfall"), diff=2)

c.T("§10–11 Creating catalogs and schemas + required privileges")
c.cloze("Complete the statements to create the catalog and an idempotent schema.",
        "[[CREATE CATALOG]] ecommerce;\n[[USE CATALOG]] ecommerce;\nCREATE SCHEMA [[IF NOT EXISTS]] ecommerce.silver;",
        "`CREATE CATALOG` makes the catalog, `USE CATALOG` sets the session context, and `IF NOT EXISTS` makes the schema creation safe to re-run.",
        bank=["CREATE DATABASE", "USE SCHEMA", "OR REPLACE"], as_code=True, tags=("syntax",), diff=1, quick=True)
c.mcq("Maria runs `CREATE SCHEMA ecommerce.gold;` and gets a permission error. Which pair of privileges does she typically need?",
      ["`USE CATALOG` + `CREATE SCHEMA` on catalog `ecommerce`", "`CREATE SCHEMA` on the metastore only",
       "`SELECT` on catalog `ecommerce`", "`CREATE CATALOG` on the metastore"], 0,
      "Schema creation needs `USE CATALOG` **and** `CREATE SCHEMA` on the **parent catalog**. `CREATE CATALOG` is for making catalogs; `SELECT` is a data-reading privilege.",
      why=["Correct — hierarchical.", "CREATE SCHEMA is granted on the parent catalog.", "SELECT reads data; it doesn't create schemas.", "That creates catalogs, not schemas."],
      tags=("exam",), diff=2)
c.tf("To create a new catalog you typically need the `CREATE CATALOG` privilege on the metastore.", True,
     "True. Catalogs are children of the metastore, so `CREATE CATALOG` is granted on the metastore — the same hierarchical logic as `CREATE SCHEMA` on the parent catalog.",
     tags=("exam",), diff=1)
c.write("Write SQL that creates catalog `ecommerce` (only if missing), creates schema `silver` in it (only if missing), and then sets both as the current context.",
        "CREATE CATALOG IF NOT EXISTS ecommerce;\nCREATE SCHEMA IF NOT EXISTS ecommerce.silver;\nUSE CATALOG ecommerce;\nUSE SCHEMA silver;",
        ["create catalog if not exists", "create schema if not exists ecommerce.silver", "use catalog", "use schema"],
        "`IF NOT EXISTS` makes setup scripts re-runnable; `USE CATALOG` / `USE SCHEMA` only set the session context — they don't grant anything.",
        diff=1)
c.scenario("`CREATE SCHEMA ecommerce.gold;` fails with a permission error for Maria. Walk it like an engineer.", [
    ("What do you check first?", [
        ("Who is actually running the statement (Maria interactively, or a job's service principal)?", True, "Right — always confirm the identity before reading grants."),
        ("Ask an admin for ALL PRIVILEGES on the metastore.", False, "That breaks least privilege and teaches you nothing about the cause."),
        ("Re-create the catalog.", False, "Destructive and unrelated — the catalog exists."),
    ]),
    ("Maria runs it herself. Which grants do you inspect?", [
        ("`SHOW GRANTS ON CATALOG ecommerce;` — look for USE CATALOG and CREATE SCHEMA for Maria or her groups.", True, "Correct: schema creation is authorized on the parent catalog."),
        ("`SHOW GRANTS ON TABLE ecommerce.gold.x;`", False, "The schema doesn't exist yet; table grants are irrelevant."),
        ("Check the cluster's autoscaling settings.", False, "Compute sizing has nothing to do with a privilege error."),
    ]),
    ("She has CREATE SCHEMA but no USE CATALOG. Fix?", [
        ("`GRANT USE CATALOG ON CATALOG ecommerce TO` her group.", True, "Yes — CREATE SCHEMA needs USE CATALOG as a prerequisite."),
        ("Grant SELECT on the catalog.", False, "SELECT reads data; it doesn't let you traverse/use the catalog for creation."),
        ("Grant CREATE CATALOG on the metastore.", False, "Over-privileged and still not the missing piece."),
    ])],
    tags=("debug",), diff=2)

# =====================================================================
# s04
# =====================================================================
c.sec(4, "Securables, Principals, Groups & Service Principals",
      "Grants connect a principal to a securable through a privilege. Grant to groups and run production as service principals, and an access list stays manageable.")
c.callout("key", "Recap → Chapter 3",
          "Principals (user / group / service principal), securables and the GRANT grammar were introduced in Chapter 3. New here: the full securable list, account-level provisioning, and why production **ownership and writes** belong to groups / service principals.")
c.terms([("Securable object", "An object registered in Unity Catalog on which grants can be given to a principal: catalog, schema, table, volume, **external location, storage credential**, function …"),
         ("Principal", "An identity that receives permissions: **user** (`nikos@company.com`), **group** (`data_engineers`), **service principal** (`orders-etl-prod`)."),
         ("Privilege", "An allowed **action** on a securable, e.g. `SELECT`, `MODIFY`, `USE SCHEMA`, `READ VOLUME`.")])
c.p("Databricks recommends provisioning principals at the **account level** and using **groups** instead of individual users wherever possible.")
c.code("sql", """-- painful: one grant per person (×200 tables!)
GRANT SELECT ON TABLE prod.gold.daily_sales TO `nikos@company.com`;
GRANT SELECT ON TABLE prod.gold.daily_sales TO `maria@company.com`;
-- ... John, Eva ...

-- better: one grant to the group
GRANT SELECT
ON TABLE prod.gold.daily_sales
TO `analysts`;""", "Grant to groups, manage membership")
c.diagram("""
Maria joins the team
        │
        ▼
add Maria to group `analysts`
        │
        ▼
0 table grants changed  (not 200)
""", "Membership management replaces grant sprawl")
c.p("A **service principal** is a machine identity. The **02:00 daily ETL** should not depend on `nikos@company.com`: if Nikos leaves, his account is **disabled** and production stops. Use `orders-etl-prod` instead.")
c.callout("tip", "Production ownership & writes → groups / service principals",
          "Databricks recommends assigning **production ownership and write access** to **groups or service principals**, not personal users.")
c.table(["Part", "Meaning"],
        [["`GRANT`", "give"], ["`SELECT`", "which permission (privilege)"], ["`ON TABLE`", "which object type"],
         ["`ecommerce.silver.orders`", "which object (securable)"], ["`TO analysts`", "to which principal"]],
        "Parsing `GRANT SELECT ON TABLE ecommerce.silver.orders TO analysts;`")

c.T("§12 Securable object")
c.bucket("Classify each item.", ["Principal (WHO)", "Securable (WHAT OBJECT)", "Privilege (WHAT ACTION)"],
         [("`nikos@company.com`", 0), ("`data_engineers`", 0), ("`orders-etl-prod`", 0),
          ("external location `finance_loc`", 1), ("storage credential `cred_a`", 1), ("function `normalize_email()`", 1),
          ("`SELECT`", 2), ("`MODIFY`", 2), ("`READ VOLUME`", 2)],
         "Principals receive grants, securables are what grants are **on**, privileges are the **action** granted. External locations and storage credentials are securables too — you grant privileges on them.",
         diff=2, quick=True)
c.tf("A storage credential is a securable object in Unity Catalog.", True,
     "True. Any object registered in UC on which grants can be given is securable — including **storage credentials** and **external locations**, not only tables.",
     tags=("concept",), diff=1)

c.T("§13–14 Principals and why groups")
c.calc("4 analysts each need SELECT on 50 gold tables. How many GRANT statements do you need if you grant per individual user (one table per statement)?",
       200, "4 users × 50 tables = **200** grants. With a group `analysts` you grant 50 (or 1 at schema level with inheritance), and a new hire needs **0** new grants — just group membership.",
       unit="grants", tags=("calc",), diff=1, quick=True)
c.tf("When Maria joins the analytics team and all grants were made to group `analysts`, you must add her to each of the 200 table grants.", False,
     "False. You add Maria to the `analysts` group; **zero** grants change. That's exactly why groups are preferred: membership management instead of permission sprawl.",
     tags=("concept",), diff=1)
c.tf("Databricks recommends provisioning users, groups and service principals at the workspace level, separately in each workspace.", False,
     "False. The recommendation is to provision principals at the **account level** (and use groups), so the same identities work across workspaces attached to the metastore.",
     tags=("exam",), diff=2)

c.T("§15 Service principal")
c.spotbug("A production job definition. Which line is the governance problem?",
          ["name: orders_nightly_etl", "schedule: \"0 0 2 * * ?\"   # 02:00 daily", "run_as: nikos@company.com", "task: notebooks/silver_orders"],
          [2], "run_as: orders-etl-prod   # service principal",
          "A production job should not run as a **personal user**: if Nikos leaves and his account is disabled, the 02:00 ETL stops. Run it as a **service principal** — a stable machine identity decoupled from employee lifecycle.",
          tags=("pitfall",), diff=1)

c.T("§16 Privilege + GRANT grammar")
c.cloze("Complete the grant that lets group `analysts` read the table.",
        "GRANT [[SELECT]]\nON [[TABLE]] ecommerce.silver.orders\n[[TO]] `analysts`;",
        "Grammar: **GRANT** privilege **ON** object-type object **TO** principal. `FROM` belongs to REVOKE.",
        bank=["MODIFY", "SCHEMA", "FROM"], as_code=True, tags=("syntax",), diff=1, quick=True)

# =====================================================================
# s05
# =====================================================================
c.sec(5, "USE CATALOG, USE SCHEMA & the Read Path",
      "`USE` lets you through the doors but doesn't let you read anything. Reading a table takes three keys.")
c.code("sql", """GRANT USE CATALOG
ON CATALOG ecommerce
TO `analysts`;""")
c.compare(("USE CATALOG does NOT mean", ["they can read all tables", "SELECT on everything inside"]),
          ("USE CATALOG means", ["they can **traverse / use** the catalog as a namespace", "still subject to permissions on each object"]))
c.p("Databricks states explicitly: `USE CATALOG` and `USE SCHEMA` are **prerequisite access privileges** — on their own they do **not** grant `SELECT`.")
c.code("sql", """GRANT USE SCHEMA
ON SCHEMA ecommerce.gold
TO `analysts`;      -- still NOT "SELECT everything\"""")
c.diagram("""
USE CATALOG ecommerce      (door of the building)
        +
USE SCHEMA  gold           (door of the floor)
        +
SELECT      daily_sales    (key to the room)
        =
SELECT * FROM ecommerce.gold.daily_sales  ✓
""", "The read path: three keys")
c.code("sql", """GRANT USE CATALOG ON CATALOG ecommerce             TO `analysts`;
GRANT USE SCHEMA  ON SCHEMA  ecommerce.gold        TO `analysts`;
GRANT SELECT      ON TABLE   ecommerce.gold.daily_sales TO `analysts`;

-- now this works:
SELECT * FROM ecommerce.gold.daily_sales;""", "The minimum to read one table")
c.reveal("Think first (source exercise §21): `analysts` have USE CATALOG ecommerce and USE SCHEMA ecommerce.gold, but no SELECT. What does `SELECT * FROM ecommerce.gold.daily_sales` do?",
         "It **fails**. `USE` gives no permission on the **data** — it only lets you traverse the namespace.")
c.p("**Debugging Case 2** — the mirror image: SELECT on `daily_revenue` ✅, USE CATALOG ✅, **USE SCHEMA ❌**. The query can still fail, because you **cannot traverse the schema**.")
c.callout("exam", "USE privileges are prerequisites, not data access",
          "Reading needs **USE CATALOG + USE SCHEMA + SELECT** (on the table, or inherited). Missing any one → denied. Having only the USE pair → also denied.")
c.ask("Ask yourself when I have SELECT but still get PERMISSION_DENIED", [
    "Do I (or my group) have USE CATALOG on the parent catalog?",
    "Do I have USE SCHEMA on the exact parent schema — not on a sibling schema?",
    "Is the SELECT on this object (or inherited from schema/catalog)?",
    "Am I really the identity running the query?"])

c.T("§17–18 USE CATALOG / USE SCHEMA are prerequisites")
c.mcq("(Source exercise §21) `analysts` have `USE CATALOG ecommerce` and `USE SCHEMA ecommerce.gold`, but no SELECT. What happens to `SELECT * FROM ecommerce.gold.daily_sales`?",
      ["It fails — USE gives no permission on the data", "It succeeds — USE SCHEMA implies SELECT on its tables",
       "It returns column names but no rows", "It succeeds only on a SQL warehouse"], 0,
      "USE CATALOG / USE SCHEMA only let you **traverse** the namespace. Data access needs `SELECT` on the table (or inherited from the schema/catalog). No compute type changes that.",
      why=["Correct.", "Classic misconception: USE ≠ SELECT.", "No partial result — the query is denied.", "Warehouses enforce the same UC privileges."],
      tags=("exam", "pitfall"), diff=1, quick=True)
c.mcq("Which set of grants is the minimum for group `analysts` to read `ecommerce.gold.daily_sales`?",
      ["USE CATALOG on `ecommerce` + USE SCHEMA on `ecommerce.gold` + SELECT on the table",
       "SELECT on the table only", "USE CATALOG + USE SCHEMA only", "ALL PRIVILEGES on catalog `ecommerce`"], 0,
      "Three keys: building door (USE CATALOG), floor door (USE SCHEMA), room key (SELECT). ALL PRIVILEGES would work but violates least privilege.",
      tags=("concept",), diff=1, quick=True)

c.T("§19 Reading a table — the three grants")
c.write("Write the three GRANT statements so group `analysts` can run `SELECT * FROM ecommerce.gold.daily_sales;` — nothing more.",
        "GRANT USE CATALOG ON CATALOG ecommerce TO `analysts`;\nGRANT USE SCHEMA ON SCHEMA ecommerce.gold TO `analysts`;\nGRANT SELECT ON TABLE ecommerce.gold.daily_sales TO `analysts`;",
        ["grant use catalog on catalog ecommerce", "grant use schema on schema ecommerce.gold", "grant select on table ecommerce.gold.daily_sales", "to `analysts`"],
        "USE CATALOG and USE SCHEMA are prerequisites; SELECT on the table grants the data. Granting SELECT at table level (not schema) is the least-privilege version.",
        tags=("syntax",), diff=2)
c.spotbug("These grants should let `analysts` read `ecommerce.gold.daily_sales`, but the query is denied. Find the buggy line.",
          ["GRANT USE CATALOG ON CATALOG ecommerce TO `analysts`;", "GRANT USE SCHEMA ON SCHEMA ecommerce.silver TO `analysts`;",
           "GRANT SELECT ON TABLE ecommerce.gold.daily_sales TO `analysts`;"],
          [1], "GRANT USE SCHEMA ON SCHEMA ecommerce.gold TO `analysts`;",
          "USE SCHEMA was granted on the **sibling** schema `silver`, not on `gold`. Without USE SCHEMA on the parent schema, the table can't be reached even with SELECT — Debugging Case 2.",
          tags=("debug", "pitfall"), diff=2)

c.T("Debugging Case 2 — SELECT exists, USE SCHEMA does not")
c.scenario("A user has SELECT on `prod_ecommerce.gold.daily_revenue` and USE CATALOG on `prod_ecommerce`, yet `SELECT * FROM prod_ecommerce.gold.daily_revenue` returns PERMISSION_DENIED.", [
    ("The user swears \"I have SELECT!\". What do you check?", [
        ("`SHOW GRANTS ON SCHEMA prod_ecommerce.gold;` — is there USE SCHEMA for the user or their groups?", True, "Yes: SELECT is useless if you can't traverse the parent schema."),
        ("Re-grant SELECT on the table.", False, "SELECT is already there; repeating it changes nothing."),
        ("Restart the cluster.", False, "Compute restarts don't change UC privileges."),
    ]),
    ("No USE SCHEMA anywhere for them. Least-privilege fix?", [
        ("`GRANT USE SCHEMA ON SCHEMA prod_ecommerce.gold TO` the user's group.", True, "Correct — that adds the missing prerequisite only."),
        ("`GRANT ALL PRIVILEGES ON SCHEMA prod_ecommerce.gold`.", False, "Works but grants far more than needed (MODIFY, CREATE …)."),
        ("`GRANT SELECT ON SCHEMA prod_ecommerce.gold`.", False, "SELECT on the schema still isn't USE SCHEMA; the traversal privilege is missing."),
    ])],
    tags=("debug",), diff=2)
c.order("Case 2 — order your checks when a user has SELECT on a table but is denied.",
        ["Confirm the identity actually running the query", "Check USE CATALOG on the parent catalog",
         "Check USE SCHEMA on the exact parent schema", "Confirm SELECT on the table (direct or inherited)", "Grant only the missing prerequisite to the group"],
        "Walk **top-down**: identity first, then the namespace prerequisites (catalog, schema), then the object privilege. Fix by adding only what's missing — usually `USE SCHEMA` — to a group.",
        tags=("debug",), diff=2)
c.free("(Interview) Explain the difference between USE SCHEMA and SELECT.",
       "USE SCHEMA allows a principal to traverse/use the schema namespace, but it does not grant access to table data. To query a table, the user typically also needs USE CATALOG on the parent catalog and SELECT on the table or an inherited grant from the schema or catalog.",
       ["USE SCHEMA = traverse / use the namespace", "No data access by itself", "Also needs USE CATALOG", "SELECT on table or inherited parent grant"],
       "The interview answer distinguishes **namespace traversal** (USE) from **data access** (SELECT) and names the full read path.",
       tags=("interview",), diff=2)
