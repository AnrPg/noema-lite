"""ch11 sections 6–10: inheritance/REVOKE, ownership, managed vs external, storage, volumes."""
from ch11_core import c

# =====================================================================
# s06
# =====================================================================
c.sec(6, "Inheritance, SELECT vs MODIFY, SHOW GRANTS & REVOKE",
      "Grants flow down the hierarchy. That saves thousands of grants, and it explains why a REVOKE can leave access in place.")
c.p("**Privilege inheritance**: a grant on a parent can flow to its children, following the Unity Catalog inheritance model.")
c.code("sql", """GRANT SELECT
ON SCHEMA ecommerce.gold
TO `analysts`;
-- flows to the tables/views inside ecommerce.gold""")
c.diagram("""
CATALOG ecommerce        grant here → flows to all schemas below
└── SCHEMA gold          grant here → flows to all objects below
    ├── daily_sales       ← inherits
    ├── customer_360      ← inherits
    └── (new table)       ← inherits too
""", "Grants on parents flow to children")
c.p("Databricks recommends using the hierarchy and inheritance to avoid **thousands of per-table grants**.")
c.table(["Privilege", "Meaning", "Typical principal"],
        [["`SELECT`", "read the table", "analyst"],
         ["`MODIFY`", "write / change table data (broad DML)", "data engineer / pipeline service principal"],
         ["finer-grained DML (e.g. `INSERT`, beta)", "narrower write capability instead of broad MODIFY", "a pipeline that only appends"]],
        "SELECT vs MODIFY")
c.p("**MODIFY** has historically covered **broad DML**. Current Unity Catalog also has **finer-grained DML privileges in beta** (e.g. `INSERT`), so you can grant narrower write rights than MODIFY. The basic model is still analyst → SELECT and engineer or pipeline SP → MODIFY, depending on the architecture.")
c.p("**SHOW GRANTS** answers the most basic debugging question: **who has what?**")
c.code("sql", """SHOW GRANTS ON TABLE  ecommerce.gold.daily_sales;
SHOW GRANTS ON SCHEMA ecommerce.gold;
SHOW GRANTS ON CATALOG ecommerce;

-- optional: filter by principal
SHOW GRANTS `analysts` ON SCHEMA ecommerce.gold;""", "Inspect every level of the hierarchy")
c.code("sql", """REVOKE SELECT
ON TABLE ecommerce.gold.daily_sales
FROM `analysts`;""", "REVOKE uses FROM, not TO")
c.callout("pitfall", "REVOKE on the table ≠ access gone",
          "You can remove the **direct** table grant and the user still reads, because `SELECT` on the **schema** or **catalog** is inherited. Permission debugging must always inspect **inheritance**.")
c.p("**Debugging Case 3**: a user had SELECT on `daily_revenue`. The admin runs REVOKE on the table, but the user **still reads**. Likely cause: `SELECT ON SCHEMA gold`, or a catalog-level inherited grant.")
c.diagram("""
SHOW GRANTS ON CATALOG prod_ecommerce        SELECT? ── yes → still readable
        │ no
SHOW GRANTS ON SCHEMA  prod_ecommerce.gold   SELECT? ── yes → still readable
        │ no
SHOW GRANTS ON TABLE   ...daily_revenue      (revoked) → access really gone
""", "Case 3: inspect the whole hierarchy, not just the table")
c.ask("Ask yourself when a REVOKE didn't remove access", [
    "Did I revoke from the right principal — the group the user actually belongs to?",
    "Is there SELECT on the parent schema that the table inherits?",
    "Is there SELECT (or ALL PRIVILEGES) on the parent catalog?",
    "Is the user in another group that still holds a grant?",
    "Is the user the owner (or does the user hold MANAGE) and so able to re-grant?"])

c.T("§20 Privilege inheritance")
c.mcq("`GRANT SELECT ON SCHEMA ecommerce.gold TO analysts` was run last month (plus USE CATALOG/USE SCHEMA). Today a new table `ecommerce.gold.churn` is created. Can analysts read it?",
      ["Yes — the schema-level SELECT is inherited by objects in the schema, including new ones",
       "No — inheritance only covers tables that existed at grant time", "Only after re-running the GRANT", "Only if the new table is managed"], 0,
      "Inheritance flows from the schema to its children, so new tables are covered automatically. That's the power — and the risk — of hierarchical grants.",
      tags=("concept", "exam"), diff=2, quick=True)
c.calc("Schema `gold` has 2,000 tables. Three groups need read access. How many `GRANT SELECT` statements do you need if you grant at **schema** level and rely on inheritance?",
       3, "One schema-level grant per group = **3** (plus the USE prerequisites). Per table it would be 2,000 × 3 = 6,000 — exactly the grant sprawl Databricks tells you to avoid with inheritance.",
       unit="grants", tags=("calc",), diff=1)

c.T("§22 SELECT vs MODIFY (+ finer-grained DML in beta)")
c.match("Match each privilege to its meaning.",
        [("SELECT", "read the table"), ("MODIFY", "broad write/change of table data"),
         ("INSERT (beta)", "narrower write capability than MODIFY"), ("USE SCHEMA", "traverse the schema namespace")],
        "SELECT reads, MODIFY is broad DML, finer-grained DML privileges such as INSERT (beta) narrow writes, USE SCHEMA only traverses.",
        diff=1, quick=True)
c.bucket("Basic production model: who typically gets what on `prod.silver`?", ["Analyst", "Data engineer / pipeline SP"],
         [("SELECT on gold tables", 0), ("MODIFY on silver tables", 1), ("write the nightly MERGE output", 1),
          ("read dashboards' source tables", 0), ("append new rows from ingestion", 1)],
         "Analysts read (SELECT); engineers and especially pipeline service principals write (MODIFY or finer DML). Databricks recommends reserving direct writes in production for service principals.",
         tags=("compare",), diff=1)

c.T("§25 SHOW GRANTS")
c.cloze("Fill in the statements to inspect grants at every level.",
        "SHOW GRANTS ON [[TABLE]] ecommerce.gold.daily_sales;\nSHOW GRANTS ON [[SCHEMA]] ecommerce.gold;\nSHOW GRANTS ON [[CATALOG]] ecommerce;",
        "`SHOW GRANTS ON <type> <name>` answers \"who has what?\". Checking all three levels catches inherited grants.",
        bank=["DATABASE", "WORKSPACE", "METASTORE"], as_code=True, tags=("syntax",), diff=1, quick=True)

c.T("§26 REVOKE")
c.spotbug("Find the syntax bug in this revoke.",
          ["-- remove direct read access", "REVOKE SELECT", "ON TABLE ecommerce.gold.daily_sales", "TO `analysts`;"],
          [3], "FROM `analysts`;",
          "GRANT … **TO** principal, but REVOKE … **FROM** principal. Using TO in a REVOKE is a syntax error.",
          tags=("syntax", "pitfall"), diff=1)
c.write("Revoke group `analysts`' direct SELECT on `ecommerce.gold.daily_sales`, then show the grants on the schema to check for inherited access.",
        "REVOKE SELECT ON TABLE ecommerce.gold.daily_sales FROM `analysts`;\nSHOW GRANTS ON SCHEMA ecommerce.gold;",
        ["revoke select", "on table ecommerce.gold.daily_sales", "from `analysts`", "show grants on schema ecommerce.gold"],
        "After a REVOKE, always look **up** the hierarchy: a schema- or catalog-level SELECT keeps the access alive.",
        tags=("syntax", "debug"), diff=2)

c.T("Debugging Case 3 — direct grant revoked but access remains")
c.tf("After `REVOKE SELECT ON TABLE prod_ecommerce.gold.daily_revenue FROM analysts`, members of analysts can no longer read that table.", False,
     "Not necessarily. If `SELECT` exists on schema `gold` or catalog `prod_ecommerce`, the table **inherits** it and access remains. Always inspect the hierarchy.",
     tags=("pitfall", "exam"), diff=2, quick=True)
c.scenario("The admin revoked `SELECT ON TABLE prod_ecommerce.gold.daily_revenue FROM analysts`. An analyst still reads the table.", [
    ("First move?", [
        ("`SHOW GRANTS ON SCHEMA prod_ecommerce.gold;` and `SHOW GRANTS ON CATALOG prod_ecommerce;`", True, "Yes — look for inherited SELECT above the table."),
        ("Run the REVOKE again.", False, "The direct grant is already gone; repeating it changes nothing."),
        ("Assume caching and wait an hour.", False, "Guessing. The usual cause is inheritance — verify it."),
    ]),
    ("You find `SELECT ON SCHEMA prod_ecommerce.gold TO analysts`. Goal: analysts read all gold tables EXCEPT daily_revenue. Best approach?", [
        ("Remove the schema-level SELECT and grant SELECT on the specific gold tables they should read (or move daily_revenue to a schema they can't read).", True, "Right — inheritance can't be overridden by revoking at a lower level; restructure the grants."),
        ("Revoke at table level again, harder.", False, "A table-level REVOKE doesn't block a schema-level inherited grant."),
        ("Make the analysts owners of the table.", False, "That gives them more power, not less."),
    ])],
    tags=("debug",), diff=3)
c.order("Case 3 — order your checks when access survives a REVOKE.",
        ["Confirm which principal/group the user reads through", "SHOW GRANTS on the table (direct grant really gone?)",
         "SHOW GRANTS on the parent schema (inherited SELECT?)", "SHOW GRANTS on the parent catalog (inherited SELECT / ALL PRIVILEGES?)",
         "Restructure grants at the right level"],
        "Go bottom-up from the object you revoked: table → schema → catalog. Inherited grants higher up keep access alive; fix by restructuring where SELECT is granted.",
        tags=("debug",), diff=2)

# =====================================================================
# s07
# =====================================================================
c.sec(7, "Ownership, MANAGE, ALL PRIVILEGES & BROWSE",
      "Some privileges let you change the rules rather than read data. Use them sparingly and give them to groups.")
c.p("**Every securable has an owner.** The owner has far more power than plain SELECT. Typically the owner can:")
c.ul(["**manage privileges** (grant / revoke to others)", "**modify / manage** the object", "**transfer ownership**"])
c.compare(("Bad", ["`prod.gold.revenue`", "owner = Nikos", "Nikos leaves → orphaned governance"]),
          ("Better", ["`prod.gold.revenue`", "owner = `data_platform_admins`", "group membership changes, ownership stays"]))
c.code("sql", "ALTER TABLE prod.gold.revenue SET OWNER TO `data_platform_admins`;", "Transfer ownership to a group")
c.p("**MANAGE** is a privilege for **delegated governance**: a principal with MANAGE can manage grants and ownership-related operations **without being the owner**.")
c.code("sql", "GRANT MANAGE ON SCHEMA prod.gold TO `data_platform_admins`;")
c.callout("exam", "ALL PRIVILEGES is not literally everything",
          "Current UC docs: **`MANAGE`, `EXTERNAL USE LOCATION` and `EXTERNAL USE SCHEMA` are NOT included in `ALL PRIVILEGES`.** Classic certification trap.")
c.terms([("EXTERNAL USE SCHEMA / EXTERNAL USE LOCATION", "Privileges that let **external (non-Databricks) engines** access UC data in a schema / location via UC's APIs. Must be granted explicitly — never via ALL PRIVILEGES."),
         ("ALL PRIVILEGES", "Every applicable privilege on the securable **except** MANAGE / EXTERNAL USE … — and it is evaluated **dynamically**, so privileges added to the platform later are included automatically.")])
c.code("sql", """-- common bad practice
GRANT ALL PRIVILEGES
ON CATALOG prod_ecommerce
TO `all_company_users`;""", "Don't do this")
c.p("Why is that bad? It may allow **much more** than each principal needs, and `ALL PRIVILEGES` is **evaluated dynamically** — as new applicable privileges are added, they're included. Databricks recommends **restraint with both ALL PRIVILEGES and MANAGE**.")
c.p("**BROWSE** allows **discoverability / metadata visibility** without data access. Users can discover that a dataset **exists**, then **request access** before running `SELECT`. Lineage visibility can also use BROWSE semantics for object discovery.")
c.code("sql", "GRANT BROWSE ON CATALOG prod TO `account users`;", "Everyone can discover; nobody reads without SELECT")
c.table(["Privilege / role", "Read data?", "Change grants?"],
        [["owner", "can manage the object fully", "yes"], ["`MANAGE`", "not by itself", "yes (delegated)"],
         ["`ALL PRIVILEGES`", "yes (SELECT, MODIFY …)", "no MANAGE — excluded"], ["`BROWSE`", "no — metadata only", "no"],
         ["`SELECT`", "yes", "no"]], "Power ladder")

c.T("§23 Ownership")
c.mcq("Who should own the production table `prod.gold.revenue`?",
      ["The group `data_platform_admins`", "Nikos, who created it", "Every analyst", "The workspace"], 0,
      "Databricks recommends **groups** (or service principals) as owners of production objects. A personal owner disappears with the employee; analysts need SELECT, not ownership; a workspace can't own UC objects.",
      why=["Correct.", "Personal ownership breaks when Nikos leaves.", "Ownership is far more than reading — too much power.", "Workspaces are not principals."],
      tags=("concept",), diff=1, quick=True)
c.mcq("Which abilities does an object's owner typically have that a principal with only SELECT does not? (choose all)",
      ["Manage privileges on the object (grant/revoke)", "Modify / manage the object", "Transfer ownership", "Bypass row filters on every table in the metastore"],
      [0, 1, 2],
      "Owners can manage privileges, manage the object and transfer ownership. Ownership of one object doesn't grant powers across the whole metastore.",
      tags=("concept",), diff=2)
c.write("Transfer ownership of `prod.gold.revenue` from Nikos to the group `data_platform_admins`.",
        "ALTER TABLE prod.gold.revenue SET OWNER TO `data_platform_admins`;",
        ["alter table prod.gold.revenue", "owner to", "`data_platform_admins`"],
        "`ALTER <type> <name> [SET] OWNER TO principal` transfers ownership. Group ownership keeps production governance stable when people leave.",
        tags=("syntax",), diff=2)

c.T("§24 MANAGE + ALL PRIVILEGES exclusions")
c.tf("`ALL PRIVILEGES` includes `MANAGE`.", False,
     "False. Current UC docs exclude **MANAGE, EXTERNAL USE LOCATION and EXTERNAL USE SCHEMA** from ALL PRIVILEGES. A certification favourite.",
     tags=("exam", "pitfall"), diff=1, quick=True)
c.odd("Three of these are covered by `ALL PRIVILEGES` on a schema. Which one is not?",
      ["SELECT", "MODIFY", "CREATE TABLE", "MANAGE"], 3,
      "MANAGE (delegated governance) is excluded from ALL PRIVILEGES, as are EXTERNAL USE LOCATION / EXTERNAL USE SCHEMA. Data and create privileges are included.",
      tags=("exam",), diff=2)
c.mcq("A platform team wants Maria to manage grants on schema `prod.gold` without making her (or anyone) the owner. Which privilege?",
      ["MANAGE", "ALL PRIVILEGES", "BROWSE", "USE SCHEMA"], 0,
      "**MANAGE** is the delegated-governance privilege: manage grants and ownership-related operations without being owner. ALL PRIVILEGES excludes MANAGE; BROWSE is discovery only; USE SCHEMA only traverses.",
      tags=("concept", "exam"), diff=2)

c.T("§61 Bad practice: ALL PRIVILEGES to everyone")
c.free("Why is `GRANT ALL PRIVILEGES ON CATALOG prod_ecommerce TO all_company_users` a bad idea? Mention the dynamic evaluation.",
       "It violates least privilege: every employee gets far more than they need (writes, creates, etc.) on all of production, which increases the blast radius of mistakes or compromised accounts. And ALL PRIVILEGES is evaluated dynamically: as new applicable privileges are added to the platform they are automatically included, so the grant silently grows over time. Databricks recommends restraint with ALL PRIVILEGES and MANAGE.",
       ["Violates least privilege / huge blast radius", "Everyone gets write/create on prod", "Dynamic evaluation: future privileges included automatically", "Restraint with ALL PRIVILEGES and MANAGE"],
       "Two reasons: too broad today, and it grows tomorrow because ALL PRIVILEGES is evaluated dynamically.",
       tags=("pitfall", "interview"), diff=2)

c.T("§47 BROWSE")
c.mcq("You want every employee to discover which datasets exist in catalog `prod` (and request access), without reading any data. Which privilege?",
      ["BROWSE on the catalog", "SELECT on the catalog", "USE CATALOG only", "MANAGE on the catalog"], 0,
      "**BROWSE** gives metadata visibility/discoverability without data access. SELECT would expose data; MANAGE would let them change grants; USE CATALOG alone is a traversal prerequisite, not a discovery feature.",
      tags=("concept",), diff=2, quick=True)
c.tf("A principal with BROWSE on a catalog can run `SELECT *` on its tables.", False,
     "False. BROWSE shows that objects **exist** (metadata), not their data. To query, the user still requests and receives USE CATALOG + USE SCHEMA + SELECT.",
     tags=("pitfall",), diff=1)

# =====================================================================
# s08
# =====================================================================
c.sec(8, "Managed vs External Tables",
      "The difference is who controls where the files live and when they die. It decides what DROP TABLE does to your data.")
c.reveal("Think first: does \"managed\" mean the data sits inside Databricks' servers and \"external\" outside?",
         "**No.** Both can live in **your own cloud object storage**. The difference is **who controls the location and lifecycle of the underlying files**.")
c.p("Databricks: **managed assets** get UC governance **and** storage-lifecycle management; **external assets** get UC governance, but the storage lifecycle stays **your** (or an external system's) responsibility.")
c.code("sql", """CREATE TABLE ecommerce.silver.orders (
  id     BIGINT,
  amount DECIMAL(10,2)
);                      -- no LOCATION → managed""", "Managed table: Unity Catalog decides the path")
c.diagram("""
catalog / schema managed storage root
            │
            ▼
Unity-generated internal location
            │
            ▼
        Delta files
""", "Where a managed table's files go")
c.code("sql", """CREATE TABLE ecommerce.silver.orders_ext
USING DELTA
LOCATION 's3://company-data/orders/';   -- or the Azure/GCS equivalent""", "External table: YOU specify the location")
c.compare(("MANAGED TABLE — UC controls", ["metadata", "permissions", "lineage", "storage location", "storage lifecycle"]),
          ("EXTERNAL TABLE — UC controls", ["metadata", "permissions", "lineage", "— YOU control: storage location + storage lifecycle"]))
c.table(["", "Managed", "External"],
        [["Who picks the path?", "Unity Catalog", "You (`LOCATION`)"],
         ["`DROP TABLE` metadata", "removed", "removed"],
         ["`DROP TABLE` files", "deleted by UC as part of the managed lifecycle", "**remain** in storage"]],
        "The certification classic")
c.callout("exam", "DROP TABLE: managed vs external",
          "`DROP TABLE managed_table` → UC handles metadata **and** underlying file lifecycle. `DROP TABLE external_table` → UC removes the metadata, but the **files remain**. Know this cold.")
c.p("**Which is recommended?** For new Databricks-first workloads, Databricks generally recommends **managed tables** — more automation, optimization and governance integration.")
c.p("**External tables make sense** when: existing data already lives at known paths; multiple non-Databricks systems control the storage lifecycle; migration constraints; interoperability requirements.")
c.p("**External table lifecycle example.** `s3://company/legacy/orders/` already holds Delta data.")
c.code("sql", """CREATE TABLE ecommerce.silver.legacy_orders
USING DELTA
LOCATION 's3://company/legacy/orders/';""")
c.ul(["Prerequisite: the location falls under a **governed external location** + the principal has the required privileges.",
      "UC now **registers metadata**. It does **not** necessarily rewrite the data."])
c.callout("tip", "Check the type before you DROP",
          "`DESCRIBE TABLE EXTENDED <name>` shows **Type** (MANAGED / EXTERNAL) and **Location**. Ten seconds that prevent \"where did my data go?\" — or \"why is my bucket still full?\".")
c.ask("Ask yourself before / after a DROP TABLE", [
    "Is this table MANAGED or EXTERNAL (DESCRIBE TABLE EXTENDED)?",
    "If managed: am I OK with UC deleting the underlying files as part of the lifecycle?",
    "If external: do I expect the files to stay — and who will clean them up?",
    "Do other systems still read these files directly?"])

c.T("§27 Managed vs external — the real difference")
c.tf("\"Managed\" means the data is stored on Databricks' servers; \"external\" means it is stored in your cloud account.", False,
     "False. Both can be in **your** cloud object storage. The difference is **who controls the location and lifecycle** of the files: UC (managed) or you / an external system (external).",
     tags=("pitfall", "exam"), diff=1, quick=True)
c.bucket("For an EXTERNAL table, who is responsible for what?", ["Unity Catalog", "You / the external system"],
         [("metadata", 0), ("permissions", 0), ("lineage", 0), ("choosing the storage location", 1), ("deleting files when no longer needed", 1)],
         "External tables still get full UC **governance** (metadata, permissions, lineage). Only **location + lifecycle** move to you. For managed tables UC does all five.",
         tags=("compare",), diff=2)

c.T("§28–29 Managed table / external table syntax")
c.cloze("Complete the external table definition.",
        "CREATE TABLE ecommerce.silver.orders_ext\n[[USING]] DELTA\n[[LOCATION]] 's3://company-data/orders/';",
        "`LOCATION` is what makes the table external: you specify the path. Omit it and UC picks a managed path.",
        bank=["PATH", "STORED AS", "MANAGED LOCATION"], as_code=True, tags=("syntax",), diff=1)
c.mcq("`CREATE TABLE ecommerce.silver.orders (id BIGINT, amount DECIMAL(10,2));` — which kind of table is this, and who decides its storage path?",
      ["Managed — Unity Catalog decides the path (under the managed storage root)", "External — the default bucket of the workspace",
       "External — the path is the catalog name", "Neither: a table without LOCATION is only a view"], 0,
      "No `LOCATION` → **managed** table; UC generates an internal location under the schema/catalog/metastore managed storage root.",
      tags=("concept",), diff=1)

c.T("§30 / §69 DROP behavior")
c.mcq("You run `DROP TABLE ecommerce.silver.orders_ext;` on an EXTERNAL table. What happens?",
      ["UC metadata is removed; the files at the external path remain", "Metadata and files are both deleted",
       "Nothing — external tables can't be dropped", "Files are deleted but metadata stays"], 0,
      "Dropping an **external** table removes the catalog entry only; the underlying files stay where you put them. For a **managed** table, UC also handles deleting the files.",
      why=["Correct.", "That's the managed behavior.", "They can be dropped — only metadata goes.", "Backwards."],
      tags=("exam",), diff=1, quick=True)
c.spotbug("A cleanup script. Which comment reveals a wrong assumption?",
          ["-- orders_ext is an EXTERNAL table at s3://company-data/orders/", "DROP TABLE ecommerce.silver.orders_ext;",
           "-- storage cost for s3://company-data/orders/ is now freed", "-- recreate later with CREATE TABLE ... LOCATION if needed"],
          [2], "-- metadata removed; files at s3://company-data/orders/ remain → delete them with your storage tooling if truly unwanted",
          "Dropping an external table does **not** delete the files, so storage costs remain. (The last line is right: you can re-register the same path later.)",
          tags=("pitfall", "debug"), diff=2)

c.T("§31 Which is recommended (managed) + when external")
c.bucket("Managed or external? Classify each situation.", ["Prefer MANAGED", "EXTERNAL makes sense"],
         [("a brand-new Databricks-first silver table", 0), ("you want maximum automation/optimization integration", 0),
          ("10 TB of legacy Delta data already at known S3 paths", 1), ("a non-Databricks system controls the files' lifecycle", 1),
          ("migration constraints force data to stay at its path", 1), ("a new gold aggregate for dashboards", 0)],
         "Default to managed for new Databricks workloads (automation, optimization, governance integration). External fits existing paths, external lifecycle control, migration constraints and interoperability.",
         tags=("compare",), diff=2)

c.T("§38 External table lifecycle example")
c.order("Registering existing legacy Delta data as an external table — order the steps.",
        ["Delta data already exists at s3://company/legacy/orders/", "An external location governs a path covering it",
         "The principal holds the required privileges (e.g. CREATE EXTERNAL TABLE on the external location)",
         "Run CREATE TABLE ecommerce.silver.legacy_orders USING DELTA LOCATION '…'", "UC registers the metadata (data not rewritten)"],
        "Data first, then governance of the path (external location), then privileges, then the CREATE TABLE … LOCATION, which only registers metadata.",
        diff=2)
c.tf("`CREATE TABLE … USING DELTA LOCATION 's3://company/legacy/orders/'` on existing Delta data necessarily rewrites all the data files.", False,
     "False. Unity Catalog **registers metadata** pointing at the existing files; it does not necessarily rewrite them.",
     tags=("concept",), diff=2)
c.write("Register the existing Delta data at `s3://company/legacy/orders/` as table `ecommerce.silver.legacy_orders`.",
        "CREATE TABLE ecommerce.silver.legacy_orders\nUSING DELTA\nLOCATION 's3://company/legacy/orders/';",
        ["create table ecommerce.silver.legacy_orders", "using delta", "location 's3://company/legacy/orders/'"],
        "External table = CREATE TABLE … LOCATION. It works only if the path is under a governed external location and you have the privileges.",
        tags=("syntax",), diff=1)
c.free("(Interview) What is the difference between a managed table and an external table in Unity Catalog?",
       "Both are governed by Unity Catalog for metadata, access control, auditing and lineage. For a managed table, Unity Catalog additionally controls the underlying storage location and file lifecycle. For an external table, I provide the storage path and the underlying files remain externally managed; dropping the external table removes the catalog metadata but does not delete the underlying files.",
       ["Both: UC governance (metadata, access, auditing, lineage)", "Managed: UC controls location + file lifecycle", "External: I provide the path, lifecycle external", "DROP external → metadata gone, files stay"],
       "The strong answer starts with what is **the same** (governance) before the difference (location + lifecycle) and the DROP consequence.",
       tags=("interview",), diff=2)
c.scenario("Monday: a colleague says \"I dropped `silver.orders_old` to save storage, but the S3 bill didn't change\". Tuesday: another dropped `silver.orders_tmp` and \"the data is gone from storage\".", [
    ("What do you check for both tables?", [
        ("Whether each was MANAGED or EXTERNAL (e.g. from the CREATE statement / DESCRIBE TABLE EXTENDED history or audit).", True, "Yes — DROP behavior depends entirely on the table type."),
        ("Whether the cluster was Photon-enabled.", False, "Compute engine doesn't decide DROP semantics."),
        ("Whether the user had SELECT.", False, "Both DROPs succeeded; this isn't a permission problem."),
    ]),
    ("`orders_old` was EXTERNAL. Explain the unchanged bill.", [
        ("DROP removed only the UC metadata; the files at its LOCATION remain until someone deletes them with storage tooling.", True, "Correct — external lifecycle is your responsibility."),
        ("UC deletes external files after 30 days.", False, "UC doesn't manage external file lifecycle."),
        ("The DROP failed silently.", False, "The table entry is gone; the files were never UC's to delete."),
    ]),
    ("`orders_tmp` was MANAGED. Lesson for next time?", [
        ("Check the type before DROP: a managed DROP lets UC delete the underlying files as part of its lifecycle.", True, "Right — managed = UC owns location and lifecycle."),
        ("Never use managed tables.", False, "Managed is the recommended default; just know the semantics."),
        ("Always add LOCATION so nothing is ever deleted.", False, "Making everything external pushes lifecycle work and governance gaps onto you."),
    ])],
    tags=("debug", "exam"), diff=2)

# =====================================================================
# s09
# =====================================================================
c.sec(9, "Managed Storage, Storage Credentials & External Locations",
      "This is where the bytes physically are, and how Databricks is allowed to reach them, one layer at a time.")
c.p("Where does a managed table physically go? UC can have a **managed storage location** at three levels: **metastore, catalog, schema**. The **most specific (lowest) available** location wins.")
c.diagram("""
schema managed location     ← highest priority (if set)
        │ else
catalog managed location
        │ else
metastore managed location
""", "Most specific managed location wins")
c.p("Databricks now often recommends **catalog-level managed storage** as the isolation boundary.")
c.code("sql", """CREATE CATALOG ecommerce
MANAGED LOCATION 's3://company-uc/ecommerce/';

CREATE SCHEMA ecommerce.finance
MANAGED LOCATION 's3://company-uc/ecommerce/finance/';""", "Managed locations on catalog and schema")
c.callout("warn", "Requirements for MANAGED LOCATION",
          "The path must lie **under a Unity Catalog external location**, and you need the **`CREATE MANAGED STORAGE`** privilege (on that external location).")
c.p("**Storage credential.** Databricks must authenticate to the cloud for `s3://company-raw-data/`. You don't want every user holding an **AWS access key + secret key**. So UC has an object that **abstracts a long-term cloud credential**:")
c.table(["Cloud", "What the storage credential wraps"],
        [["AWS", "IAM role"], ["Azure", "managed identity / service principal"], ["GCP", "service account"]])
c.p("A storage credential alone answers \"**with which identity** can I talk to the cloud?\" — not \"**which path** do we govern?\". The **external location** combines **cloud path + storage credential** and is itself a securable.")
c.diagram("""
AWS IAM role / Azure identity
        │
        ▼
Storage Credential      "IAM role X"
        │
        ▼
External Location       path = s3://company/raw/
        │               credential = IAM role X
        ▼
External Table / External Volume
        │
        ▼
      Files
""", "The full chain — one of the most important UC diagrams")
c.code("sql", """-- storage credentials are usually created by an admin
-- (Catalog Explorer / CLI / API) after the cloud IAM setup
SHOW STORAGE CREDENTIALS;

CREATE EXTERNAL LOCATION finance_loc
  URL 's3://company/finance/'
  WITH (STORAGE CREDENTIAL cred_a);

GRANT CREATE EXTERNAL TABLE
  ON EXTERNAL LOCATION finance_loc
  TO `data_engineers`;""", "External location = path + credential; grant on the location")
c.p("**Why not grant on the storage credential directly?** A credential may reach a **huge storage scope**. An external location like `s3://company/finance/` scopes access to **that path only**. Databricks recommends granting e.g. `CREATE EXTERNAL TABLE` on the **external location** rather than on the credential.")
c.diagram("""
credential A
├── s3://company/raw/       (external location 1)
├── s3://company/archive/   (external location 2)
└── s3://company/shared/    (external location 3)
     each with its own UC access boundary
""", "One credential, many external locations")
c.compare(("Storage credential", ["HOW Databricks authenticates to cloud storage", "wraps IAM role / managed identity / service account", "can be broad"]),
          ("External location", ["WHICH cloud path + WHICH credential", "a securable path boundary", "grant privileges here (path-scoped least privilege)"]),
          ("External table", ["table METADATA pointing at tabular data", "lives INSIDE a governed path", "not a synonym of external location"]))
c.callout("exam", "Two confusable pairs",
          "**Storage credential vs external location**: identity vs path + identity. **External location vs external table**: governed storage path vs table metadata pointing at data inside that path. Not synonyms.")
c.p("**Debugging Case 4**: the **managed** table works, the **external** table fails with `PERMISSION_DENIED` / a storage access error. External storage adds **extra layers**: external location, storage credential, workspace binding, cloud IAM.")
c.ask("Ask yourself when a managed table works but the external one fails", [
    "Is the table's LOCATION covered by an external location at all?",
    "Do I (or the job's principal) hold the needed privilege on that external location?",
    "Is the external location / storage credential bound to this workspace?",
    "Does the cloud IAM role behind the storage credential actually allow this path?",
    "Was the IAM role / trust policy changed or the bucket policy tightened recently?"])

c.T("§32 Managed storage location — priority")
c.order("Which managed storage location wins? Order from HIGHEST to LOWEST priority.",
        ["Schema managed location", "Catalog managed location", "Metastore managed location"],
        "The most specific (lowest-level) available location wins: schema, else catalog, else metastore. Databricks often recommends catalog-level storage as the isolation boundary.",
        tags=("exam",), diff=1, quick=True)
c.mcq("Catalog `ecommerce` has MANAGED LOCATION `s3://uc/ecommerce/`; schema `ecommerce.finance` has MANAGED LOCATION `s3://uc/finance/`. A managed table is created in `ecommerce.finance`. Where do its files go?",
      ["Under `s3://uc/finance/`", "Under `s3://uc/ecommerce/`", "Under the metastore root", "Wherever the cluster's DBFS root is"], 0,
      "The **most specific** available managed location wins: the schema's. The catalog location would be used only if the schema had none.",
      tags=("exam",), diff=2, quick=True)

c.T("§33 CREATE CATALOG … MANAGED LOCATION + requirements")
c.write("Create catalog `ecommerce` whose managed tables are stored under `s3://company-uc/ecommerce/`.",
        "CREATE CATALOG ecommerce\nMANAGED LOCATION 's3://company-uc/ecommerce/';",
        ["create catalog ecommerce", "managed location", "'s3://company-uc/ecommerce/'"],
        "`MANAGED LOCATION` (not `LOCATION`) sets the catalog's managed storage root. It must be under an external location and you need CREATE MANAGED STORAGE.",
        tags=("syntax",), diff=1)
c.mcq("`CREATE CATALOG ecommerce MANAGED LOCATION 's3://company-uc/ecommerce/'` fails. Which are plausible causes? (choose all)",
      ["The path is not under any Unity Catalog external location", "You lack CREATE MANAGED STORAGE on the external location",
       "You lack CREATE CATALOG on the metastore", "The cluster has too few workers"],
      [0, 1, 2],
      "Managed locations must sit under an external location, need CREATE MANAGED STORAGE, and catalog creation itself needs CREATE CATALOG. Cluster size is irrelevant to authorization.",
      tags=("debug", "exam"), diff=2)

c.T("§34–35 Storage credential & external location")
c.match("Match each cloud to what its storage credential typically wraps.",
        [("AWS", "IAM role"), ("Azure", "managed identity / service principal"), ("GCP", "service account")],
        "A storage credential abstracts a **long-term cloud identity** so users never handle raw access keys.",
        diff=1)
c.mcq("What does an external location add that a storage credential alone doesn't have?",
      ["A specific cloud path (URI) bound to the credential, as a securable boundary", "A cloud identity to authenticate with",
       "The table schema", "A compute cluster"], 0,
      "The credential says **who** (which cloud identity). The external location says **where** (which path) + which credential, and it's a securable you grant on.",
      tags=("concept",), diff=1)
c.cloze("Complete the external location definition.",
        "CREATE [[EXTERNAL LOCATION]] finance_loc\n  [[URL]] 's3://company/finance/'\n  WITH ([[STORAGE CREDENTIAL]] cred_a);",
        "`CREATE EXTERNAL LOCATION name URL '<path>' WITH (STORAGE CREDENTIAL <cred>)` binds a path to a credential.",
        bank=["LOCATION", "PATH", "IAM ROLE"], as_code=True, tags=("syntax",), diff=2)

c.T("§36 The full chain")
c.order("Order the chain from cloud identity down to the files.",
        ["AWS IAM role / Azure identity", "Storage credential", "External location (s3://company/raw/)", "External table / external volume", "Files"],
        "Cloud identity → credential (UC abstraction) → external location (path + credential) → table/volume metadata → the actual files.",
        diff=2)

c.T("§37 Why external location rather than the raw credential")
c.mcq("Why does Databricks recommend granting `CREATE EXTERNAL TABLE` on an external location instead of on the storage credential?",
      ["It scopes the permission to a specific path — path-scoped least privilege", "Storage credentials can't receive grants",
       "External locations are faster", "Credentials expire every hour"], 0,
      "A credential may reach a huge storage scope; an external location like `s3://company/finance/` limits access to that path. Credentials **are** securables — the point is granularity.",
      tags=("concept", "exam"), diff=2, quick=True)
c.write("Allow group `data_engineers` to create external tables only under the external location `finance_loc`.",
        "GRANT CREATE EXTERNAL TABLE\nON EXTERNAL LOCATION finance_loc\nTO `data_engineers`;",
        ["grant create external table", "on external location finance_loc", "to `data_engineers`"],
        "Granting on the external location (not the credential) scopes the privilege to its path.",
        tags=("syntax",), diff=2)

c.T("§70–71 Confusable pairs: credential vs location, location vs table")
c.tf("One storage credential can be used by several external locations, each with its own UC access boundary.", True,
     "True. E.g. credential A backs `s3://company/raw/`, `.../archive/` and `.../shared/`, and each location gets separate grants.",
     tags=("exam",), diff=1)
c.tf("\"External location\" and \"external table\" are synonyms.", False,
     "False. An **external location** is a governed storage **path** (+ credential). An **external table** is **table metadata** pointing at tabular data **inside** such a governed path.",
     tags=("exam", "pitfall"), diff=1)
c.free("(Interview) Storage credential vs external location?",
       "A storage credential represents the cloud identity Databricks can use to authenticate to object storage (an IAM role, managed identity or service account). An external location binds that credential to a specific governed cloud-storage URI, giving Unity Catalog a securable path boundary on which privileges can be granted. One credential can back many external locations.",
       ["Credential = cloud identity for authentication", "Location = URI + credential", "Location is a securable path boundary", "Grant privileges on the location"],
       "Identity (credential) vs path-scoped securable (location).",
       tags=("interview",), diff=2)

c.T("Debugging Case 4 — managed works, external fails")
c.scenario("`SELECT * FROM prod.silver.orders` (managed) works. `SELECT * FROM prod.silver.legacy_orders` (external at s3://company/legacy/orders/) fails with a storage access error.", [
    ("You already confirmed USE CATALOG, USE SCHEMA and SELECT on both tables. Where next?", [
        ("The extra external-storage layers: external location, storage credential, workspace binding, cloud IAM.", True, "Right — the managed table proves the UC grants work; the difference is the storage path."),
        ("Re-grant SELECT on the external table.", False, "SELECT is already fine; the managed one works with the same grants."),
        ("Switch to a bigger cluster.", False, "Sizing doesn't cause storage access errors."),
    ]),
    ("Which external-location question first?", [
        ("Is `s3://company/legacy/orders/` covered by an external location, and is it bound to this workspace?", True, "Yes — no governed path, or a location not usable in this workspace, means no access."),
        ("Is the table partitioned?", False, "Partitioning doesn't affect authorization."),
        ("Does the table have a column mask?", False, "Masks change values, they don't cause storage access errors."),
    ]),
    ("Location exists and is bound. The cloud team rotated the IAM role's policy last night. Fix?", [
        ("Have the cloud team restore read access for the IAM role behind the storage credential to that path.", True, "Correct — UC can't grant what the cloud identity itself is not allowed to do."),
        ("Give the users AWS access keys.", False, "Bypasses governance — exactly what storage credentials exist to avoid."),
        ("Convert the table to managed by DROP + CREATE.", False, "Drastic and doesn't fix the broken credential."),
    ])],
    tags=("debug",), diff=3)
c.order("Case 4 — order the extra checks for an external table that fails while managed tables work.",
        ["Confirm UC grants (USE CATALOG / USE SCHEMA / SELECT) — managed works, so likely fine",
         "Find the table's LOCATION (DESCRIBE TABLE EXTENDED)", "Check the external location covering that path + privileges on it",
         "Check workspace binding of the external location / credential", "Check the storage credential and the cloud IAM permissions behind it"],
        "Start from what's proven (UC grants), then follow the storage chain outward: location → external location → binding → credential → cloud IAM.",
        tags=("debug",), diff=3)

# =====================================================================
# s10
# =====================================================================
c.sec(10, "Volumes: Governed Files",
      "Not everything is a table. PDFs, images, configs and raw files get UC governance through volumes.")
c.p("A **table** is for tabular data: rows / columns with SQL / DataFrame semantics. What about **PDF, JPEG, JSON config, ML files, checkpoints, text documents, binary artifacts, raw files**? You don't want to make them all tables.")
c.p("**Volume** = a Unity Catalog **governed storage object for non-tabular / file-based data**.")
c.code("sql", """-- managed volume: UC picks the storage location
CREATE VOLUME ecommerce.raw.documents;

-- external volume: you point at an existing path
CREATE EXTERNAL VOLUME ecommerce.raw.documents_ext
LOCATION 's3://company/documents/';""", "Managed vs external volume")
c.diagram("""
/Volumes/ecommerce/raw/documents/sample.json
         ^^^^^^^^^ ^^^ ^^^^^^^^^ ^^^^^^^^^^^
         catalog   schema volume  file path
""", "Volume path anatomy")
c.table(["", "Managed volume", "External volume"],
        [["Location chosen by", "Unity Catalog", "you (`LOCATION`)"],
         ["`DROP VOLUME`", "can remove underlying data (managed lifecycle)", "metadata removed, **files remain**"]],
        "Same lifecycle logic as tables")
c.table(["Asset", "Read", "Write"],
        [["Table", "`SELECT`", "`MODIFY`"], ["Volume", "`READ VOLUME`", "`WRITE VOLUME`"]], "Different privilege names")
c.code("sql", """GRANT READ VOLUME
ON VOLUME ecommerce.raw.documents
TO `data_scientists`;""")
c.table(["To…", "You need"],
        [["read files", "`USE CATALOG` + `USE SCHEMA` + `READ VOLUME`"],
         ["write files", "`USE CATALOG` + `USE SCHEMA` + `READ VOLUME` + `WRITE VOLUME`"]],
        "Current volume privilege model (per the source)")
c.code("python", """path = "/Volumes/ecommerce/raw/documents/sample.json"
with open(path, "r") as f:
    text = f.read()

df = spark.read.json("/Volumes/ecommerce/raw/documents/events/")""", "File access: plain Python or Spark")
c.callout("key", "Volume = governed file-path semantics",
          "Databricks recommends **table names** for tables and **`/Volumes/...`** paths for direct non-tabular file access, instead of writing raw cloud URIs everywhere.")
c.table(["Need", "Table", "Volume"],
        [["SQL rows/columns", "✅", "❌"], ["DataFrame table semantics", "✅", "❌"], ["PDF / images / files", "❌", "✅"],
         ["`SELECT *`", "✅", "❌"], ["`READ VOLUME`", "❌", "✅"], ["Delta table history", "✅", "❌ (not as table semantics)"]],
        "Tables vs volumes — an easy certification question")
c.p("**Debugging Case 5**: the user has USE CATALOG ✅ and USE SCHEMA ✅, but `open(\"/Volumes/.../file.json\")` fails. Check **READ VOLUME** — and for writes, **WRITE VOLUME** too.")
c.ask("Ask yourself when a /Volumes/ file can't be read or written", [
    "Is the path really /Volumes/<catalog>/<schema>/<volume>/… (right names, right order)?",
    "Do I have USE CATALOG and USE SCHEMA on the parents?",
    "Do I have READ VOLUME on this volume (not SELECT — that's for tables)?",
    "For writes: do I also have WRITE VOLUME?",
    "If it's an external volume: are the external location / credential / cloud IAM fine?"])
c.callout("pitfall", "SELECT does nothing for volumes",
          "Granting `SELECT` on a schema doesn't open its volumes. Volumes use **READ VOLUME / WRITE VOLUME**.")

c.T("§39 Why volumes exist")
c.bucket("Table or volume?", ["Table", "Volume"],
         [("daily order rows queried with SQL", 0), ("invoice PDFs", 1), ("product JPEG images", 1), ("JSON config files for a job", 1),
          ("customer dimension with Delta history", 0), ("raw landing files before ingestion", 1)],
         "Tables are for rows/columns with SQL/DataFrame semantics and Delta history. Volumes govern non-tabular or raw files — PDFs, images, configs, landing files.",
         diff=1, quick=True)

c.T("§40–41 Managed / external volume + drop")
c.cloze("Complete the statements: a managed volume, then an external one.",
        "CREATE [[VOLUME]] ecommerce.raw.documents;\nCREATE [[EXTERNAL VOLUME]] ecommerce.raw.documents_ext\n[[LOCATION]] 's3://company/documents/';",
        "`CREATE VOLUME` = managed (UC picks the location). `CREATE EXTERNAL VOLUME … LOCATION` = you specify the path.",
        bank=["TABLE", "MANAGED VOLUME", "URL"], as_code=True, tags=("syntax",), diff=1, quick=True)
c.tf("Dropping an external volume deletes the files at its LOCATION.", False,
     "False. As with external tables: metadata is removed, **underlying files remain**. A managed volume drop can remove the data as part of the managed lifecycle.",
     tags=("exam", "pitfall"), diff=1)

c.T("§42 Volume permissions (READ VOLUME / WRITE VOLUME)")
c.mcq("Which set lets `data_scientists` READ files in volume `ecommerce.raw.documents`?",
      ["USE CATALOG ecommerce + USE SCHEMA ecommerce.raw + READ VOLUME on the volume", "SELECT on the volume",
       "USE CATALOG + USE SCHEMA only", "READ FILES on the schema"], 0,
      "Volumes use **READ VOLUME / WRITE VOLUME**, plus the usual USE CATALOG + USE SCHEMA prerequisites. SELECT is a table privilege.",
      tags=("exam",), diff=1, quick=True)
c.match("Match the action to the privilege it needs (beyond USE CATALOG + USE SCHEMA).",
        [("read a table", "SELECT"), ("write a table", "MODIFY"), ("read volume files", "READ VOLUME"), ("write volume files", "WRITE VOLUME (+ READ VOLUME)")],
        "Tables: SELECT / MODIFY. Volumes: READ VOLUME / WRITE VOLUME. Table and volume permissions are **not** identical.",
        tags=("compare",), diff=1)
c.write("Grant group `data_scientists` read access to files in volume `ecommerce.raw.documents` (assume they already have the USE privileges).",
        "GRANT READ VOLUME\nON VOLUME ecommerce.raw.documents\nTO `data_scientists`;",
        ["grant read volume", "on volume ecommerce.raw.documents", "to `data_scientists`"],
        "Object type keyword is `VOLUME`; the privilege is `READ VOLUME`.",
        tags=("syntax",), diff=1)

c.T("§43 File access via /Volumes paths")
c.spotbug("This code should read a JSON file from volume `documents` in schema `raw` of catalog `ecommerce`. Which line is wrong?",
          ["# read config from the governed volume", "path = \"/Volumes/raw/ecommerce/documents/sample.json\"", "with open(path, \"r\") as f:", "    text = f.read()"],
          [1], "path = \"/Volumes/ecommerce/raw/documents/sample.json\"",
          "Volume paths follow the namespace order: `/Volumes/<catalog>/<schema>/<volume>/<file>`. Swapping catalog and schema points at a non-existent volume.",
          tags=("debug", "syntax"), diff=2)
c.mcq("Which is the recommended way to reach a non-tabular file governed by UC?",
      ["`/Volumes/ecommerce/raw/documents/sample.json`", "`s3://company/documents/sample.json` everywhere in code",
       "`SELECT * FROM ecommerce.raw.documents`", "Copy it into a Delta table first"], 0,
      "Databricks recommends **/Volumes/...** paths for direct non-tabular file access (governed file-path semantics) and table names for tables — not raw cloud URIs scattered through code.",
      tags=("concept",), diff=1)

c.T("§44 Tables vs volumes")
c.tf("A volume gives you Delta table history (DESCRIBE HISTORY) for its files.", False,
     "False. Delta table history is a **table** feature. Volumes govern files; they don't give table semantics or history.",
     tags=("exam",), diff=2)

c.T("Debugging Case 5 — volume file inaccessible")
c.scenario("A user with USE CATALOG and USE SCHEMA runs `open(\"/Volumes/ecommerce/raw/documents/file.json\")` and it fails.", [
    ("What's the first privilege to check?", [
        ("READ VOLUME on `ecommerce.raw.documents`.", True, "Yes — USE privileges are prerequisites; READ VOLUME opens the files."),
        ("SELECT on the schema.", False, "SELECT is a table privilege; it doesn't open volumes."),
        ("MODIFY on the volume.", False, "MODIFY is for tables; volumes use READ/WRITE VOLUME."),
    ]),
    ("Granted READ VOLUME; reading works. Now the user's job writes `open(path, \"w\")` and fails. Next?", [
        ("Grant WRITE VOLUME as well (READ + WRITE VOLUME for writes).", True, "Correct — writes need WRITE VOLUME on top of the read set."),
        ("Grant ALL PRIVILEGES on the catalog.", False, "Massive over-grant for one write."),
        ("Make it an external volume.", False, "Volume type doesn't remove the need for WRITE VOLUME."),
    ])],
    tags=("debug",), diff=2)
c.order("Case 5 — order the checks for a failing /Volumes/ file access.",
        ["Verify the path order /Volumes/<catalog>/<schema>/<volume>/…", "USE CATALOG on the catalog", "USE SCHEMA on the schema",
         "READ VOLUME on the volume", "WRITE VOLUME too, if it's a write", "External volume? then external location / credential / IAM"],
        "Path first (cheapest), then the namespace prerequisites, then the volume privileges, and the storage layers only for external volumes.",
        tags=("debug",), diff=2)
c.free("(Interview) Volume vs table?",
       "A table provides structured relational semantics over rows and columns, while a Unity Catalog volume provides governed access to non-tabular files in cloud storage. Tables use privileges such as SELECT and MODIFY, whereas volumes use READ VOLUME and WRITE VOLUME. Files in volumes are accessed through /Volumes/catalog/schema/volume/ paths.",
       ["Table = rows/columns relational semantics", "Volume = governed non-tabular files", "SELECT/MODIFY vs READ VOLUME/WRITE VOLUME", "/Volumes/... paths"],
       "Name the semantics difference and the privilege difference.",
       tags=("interview",), diff=1)
