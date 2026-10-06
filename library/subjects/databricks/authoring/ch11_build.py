"""Build ch11.json (Unity Catalog Mastery, PDF#2 p1–54 = orig 403–456) + ch11.coverage.md.
Run: python3 ch11_build.py"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ch11_core import c
import ch11_part1, ch11_part2, ch11_part3  # noqa: F401  (they populate c)

S = lambda n: f"ch11-s{n:02d}"

# ---------------------------------------------------------------- playbooks
c.playbook(1, "PERMISSION_DENIED — the 8-layer algorithm", S(15),
  "`PERMISSION_DENIED` (or INSUFFICIENT_PRIVILEGES) on a Unity Catalog object, e.g. `SELECT * FROM prod_ecommerce.gold.daily_revenue`.",
  ["Which principal is ACTUALLY executing — me, a job run-as, a pipeline service principal?",
   "Am I in a workspace that is bound to this catalog / external location / credential?",
   "Does that principal have USE CATALOG on the catalog?",
   "Does it have USE SCHEMA on the exact parent schema?",
   "Does it have the object privilege (SELECT / MODIFY / READ VOLUME …), directly or inherited from schema/catalog?",
   "Is a row filter, column mask or ABAC policy changing what it sees?",
   "For external data: are the external location, storage credential and cloud IAM OK?",
   "Is the compute Unity Catalog-compatible (Standard/Dedicated, serverless, SQL warehouse)?"],
  [("Identify the executor.", "Every grant is evaluated for the executing principal.", "SELECT current_user();  -- interactive\n-- jobs/pipelines: check the run-as identity in settings"),
   ("Check the workspace binding of the catalog / external location.", "A binding can block access despite perfect grants."),
   ("Show grants top-down for that principal.", "USE CATALOG → USE SCHEMA → object privilege; inheritance included.",
    "SHOW GRANTS ON CATALOG prod_ecommerce;\nSHOW GRANTS ON SCHEMA prod_ecommerce.gold;\nSHOW GRANTS ON TABLE prod_ecommerce.gold.daily_revenue;"),
   ("If the query succeeds but rows/values look wrong, inspect filters, masks and ABAC.", "SELECT ≠ unfiltered raw visibility."),
   ("For external tables/volumes, follow the storage chain.", "External location → storage credential → cloud IAM.", "DESCRIBE TABLE EXTENDED prod_ecommerce.silver.legacy_orders;"),
   ("Confirm the compute is UC-compatible.", "Correct permissions + wrong legacy compute = still failure.")],
  ["Job runs as a different service principal", "Workspace not bound to the catalog", "Missing USE CATALOG / USE SCHEMA",
   "Missing object privilege (or wrong level)", "Fine-grained policy hides rows/values", "External location / credential / IAM problem", "Non-UC-compatible compute"],
  "Fix the exact missing layer for the exact principal (usually a group or service principal) — never \"give me admin\".",
  "I Bet Cats Sit On Fluffy Silk Cushions — Identity · Binding · Catalog · Schema · Object · Fine-grained · Storage · Compute")

c.playbook(2, "Case 1 — notebook works, job fails (wrong identity)", S(15),
  "Your notebook reads the table; the scheduled job running the same code fails with PERMISSION_DENIED.",
  ["Is the job running as a different identity than me?",
   "Which service principal is the run-as identity?",
   "Does that service principal have USE CATALOG, USE SCHEMA and the object privilege?",
   "Was the run-as recently changed?",
   "Am I tempted to make it run as my personal user — and why is that wrong for production?"],
  [("Open the job settings and read the run-as identity.", "The identity that presses Run is not necessarily the workload identity."),
   ("Show grants for that service principal down the hierarchy.", "Find the exact missing privilege.", "SHOW GRANTS `orders-etl-sp` ON SCHEMA prod.silver;"),
   ("Grant only what the job needs to the service principal.", "Least privilege for machine identities.", "GRANT SELECT ON TABLE prod.silver.orders TO `orders-etl-sp`;")],
  ["Job runs as `orders-etl-sp`, which lacks SELECT", "Run-as changed to an under-privileged identity"],
  "Grant the missing privilege(s) to the job's service principal; keep production on service principals, not personal users.",
  "Run button ≠ run-as")

c.playbook(3, "Case 2 — SELECT exists but USE SCHEMA doesn't", S(5),
  "User has SELECT on `prod_ecommerce.gold.daily_revenue` (and USE CATALOG) but the query is denied.",
  ["Do I have USE CATALOG on the parent catalog?",
   "Do I have USE SCHEMA on this exact schema — not on a sibling like silver?",
   "Is the SELECT on this object or inherited?",
   "Am I the identity that holds these grants?"],
  [("Show grants on the schema.", "USE SCHEMA is a prerequisite for data access.", "SHOW GRANTS ON SCHEMA prod_ecommerce.gold;"),
   ("Grant USE SCHEMA to the group.", "Adds only the missing prerequisite.", "GRANT USE SCHEMA ON SCHEMA prod_ecommerce.gold TO `analysts`;")],
  ["USE SCHEMA missing", "USE SCHEMA granted on the wrong schema"],
  "Grant USE SCHEMA (and USE CATALOG if missing) — SELECT alone can't traverse the namespace.",
  "Three keys: building, floor, room")

c.playbook(4, "Case 3 — REVOKE done, access remains", S(6),
  "Admin ran `REVOKE SELECT ON TABLE prod_ecommerce.gold.daily_revenue FROM analysts`, yet analysts still read the table.",
  ["Did I revoke from the group the user actually reads through?",
   "Is there SELECT on the parent schema that the table inherits?",
   "Is there SELECT or ALL PRIVILEGES on the parent catalog?",
   "Is the user in another group with a grant?",
   "Is the user owner or MANAGE holder (able to re-grant)?"],
  [("Show grants at schema and catalog level.", "Inherited grants survive a table-level revoke.", "SHOW GRANTS ON SCHEMA prod_ecommerce.gold;\nSHOW GRANTS ON CATALOG prod_ecommerce;"),
   ("Restructure: move SELECT from schema to the specific tables (or move the sensitive table to another schema).", "You can't block an inherited grant by revoking lower down.")],
  ["SELECT ON SCHEMA gold", "Catalog-level inherited grant", "Another group membership"],
  "Find the inherited grant and restructure where SELECT is granted; always inspect the hierarchy.",
  "Grants flow down — look up")

c.playbook(5, "Case 4 — managed table works, external table fails", S(9),
  "Managed tables work; an external table returns PERMISSION_DENIED or a storage access error.",
  ["Do the UC grants work (does a managed table in the same schema work)?",
   "What is the table's LOCATION?",
   "Is that path under an external location — and do I have privileges on it?",
   "Is the external location / storage credential bound to this workspace?",
   "Does the cloud IAM identity behind the storage credential allow this path?"],
  [("Get the location.", "Know which path you're dealing with.", "DESCRIBE TABLE EXTENDED prod.silver.legacy_orders;"),
   ("Check external locations covering it.", "No governed path → no access.", "SHOW EXTERNAL LOCATIONS;"),
   ("Check bindings and the storage credential.", "Bindings also apply to external locations and credentials.", "DESCRIBE EXTERNAL LOCATION legacy_loc;"),
   ("Escalate to the cloud team for IAM.", "UC can't grant more than the cloud identity is allowed.")],
  ["No external location for the path", "Missing privilege on the external location", "Workspace binding", "Cloud IAM policy changed"],
  "Repair the failing storage layer (external location, credential, binding or cloud IAM) — never hand out raw cloud keys.",
  "External = extra layers: Location · Credential · Binding · IAM")

c.playbook(6, "Case 5 — /Volumes file inaccessible", S(10),
  "`open(\"/Volumes/ecommerce/raw/documents/file.json\")` fails although the user has USE CATALOG and USE SCHEMA.",
  ["Is the path /Volumes/<catalog>/<schema>/<volume>/… in the right order?",
   "Do I have READ VOLUME on this volume?",
   "For writes, do I also have WRITE VOLUME?",
   "Am I using SELECT/MODIFY by mistake (table privileges)?",
   "If it's an external volume, is the storage chain OK?"],
  [("Verify the path.", "Swapped names point to a non-existent volume."),
   ("Grant READ VOLUME (and WRITE VOLUME for writes).", "Volume privileges are separate from table privileges.",
    "GRANT READ VOLUME, WRITE VOLUME ON VOLUME ecommerce.raw.documents TO `data_engineers`;")],
  ["READ VOLUME missing", "WRITE VOLUME missing for writes", "Wrong path", "External storage chain broken"],
  "Grant READ VOLUME (plus WRITE VOLUME for writes) on the volume.",
  "Files ≠ rows: READ/WRITE VOLUME")

c.playbook(7, "Case 6 — \"I have SELECT, why do I see ****?\"", S(12),
  "Query succeeds, but salary shows `****` / NULL, or rows are missing.",
  ["Did the query succeed (so grants are fine)?",
   "Is there a column mask on this column?",
   "Is there a row filter on this table?",
   "Does an ABAC policy match a tag on this table/column?",
   "Which groups am I in — does the policy check a group I'm not in?"],
  [("Inspect the table definition for filters/masks.", "Masks and filters are attached to the table/column.", "DESCRIBE TABLE EXTENDED ecommerce.gold.employees;"),
   ("Check ABAC policies and tags in Catalog Explorer.", "Tag-driven policies apply without per-table attachment."),
   ("Decide: intended? If access is approved, change group membership — don't drop the policy.", "The policy is doing its job.")],
  ["Column mask", "Row filter", "ABAC policy on tagged data", "User not in the privileged group"],
  "Explain that SELECT ≠ unfiltered visibility; adjust group membership only if the business approves.",
  "SELECT opens the door, policies dim the lights")

c.playbook(8, "Grants correct, still denied — workspace binding", S(11),
  "User has USE CATALOG, USE SCHEMA and SELECT, but the query fails in one workspace and works in another.",
  ["Which workspace am I in?",
   "Is the catalog bound only to specific workspaces?",
   "Are the external location / storage credential bound to this workspace?",
   "Should this workspace have access at all (isolation by design)?"],
  [("Compare the same query from another workspace.", "Same principal + same grants + different result → binding."),
   ("Check the catalog's workspace bindings in Catalog Explorer.", "Bindings are a separate access-control mechanism."),
   ("Use the bound workspace, or request a binding change if intended.", "Grants can't override a missing binding.")],
  ["Catalog not bound to this workspace", "External location / credential not bound"],
  "Run from a bound workspace or have an admin add the binding — if the isolation design allows it.",
  "User privilege ≠ only boundary")

c.playbook(9, "Grants correct, still denied — compute not UC-compatible", S(11),
  "Same user and grants work on a SQL warehouse but fail on an old cluster.",
  ["Does the same query work on a SQL warehouse or serverless?",
   "What is this cluster's access mode?",
   "Is it Standard or Dedicated — or a legacy configuration?",
   "Did someone reuse an old cluster definition?"],
  [("Compare on serverless / SQL warehouse.", "Isolates the compute layer."),
   ("Check the access mode in the cluster config.", "Standard/Dedicated are UC-capable."),
   ("Switch to UC-compatible compute.", "Permissions correct + wrong legacy compute = still failure.")],
  ["Legacy / non-UC access mode", "Old cluster definition reused"],
  "Use Standard/Dedicated classic compute, serverless, or a SQL warehouse.",
  "Right grants, wrong engine")

c.playbook(10, "DROP TABLE surprise: data gone / storage not freed", S(8),
  "After DROP TABLE either the data disappeared from storage (unexpected) or the storage bill didn't drop (unexpected).",
  ["Was the table MANAGED or EXTERNAL?",
   "If managed: did I know UC deletes the files as part of the lifecycle?",
   "If external: did I expect the files to stay?",
   "Do other systems still read those files?"],
  [("Check the type and location before dropping.", "DROP semantics depend on the type.", "DESCRIBE TABLE EXTENDED ecommerce.silver.orders_ext;"),
   ("For external tables, delete unwanted files with storage tooling (or re-register with CREATE TABLE … LOCATION).", "UC removed only the metadata.")],
  ["Managed table: UC handles file deletion", "External table: files remain"],
  "Know managed vs external DROP semantics; check the type before every DROP.",
  "Managed dies whole; external leaves its body")

c.playbook(11, "CREATE CATALOG / CREATE SCHEMA (… MANAGED LOCATION) fails", S(3),
  "`CREATE SCHEMA ecommerce.gold` or `CREATE CATALOG ecommerce MANAGED LOCATION 's3://…'` fails with a permission error.",
  ["Who is actually running the statement?",
   "Catalog: do I have CREATE CATALOG on the metastore?",
   "Schema: do I have BOTH USE CATALOG and CREATE SCHEMA on the parent catalog?",
   "Managed location: is the path under a UC external location?",
   "Managed location: do I have CREATE MANAGED STORAGE on that external location?"],
  [("Show grants on the metastore / parent catalog.", "Creation privileges are granted on the parent.", "SHOW GRANTS ON CATALOG ecommerce;"),
   ("For MANAGED LOCATION, list external locations and check the path is under one.", "Managed locations must sit under an external location.", "SHOW EXTERNAL LOCATIONS;"),
   ("Grant the missing privilege to the right group.", "Least privilege.", "GRANT USE CATALOG, CREATE SCHEMA ON CATALOG ecommerce TO `data_engineers`;")],
  ["Missing CREATE CATALOG", "Missing USE CATALOG or CREATE SCHEMA", "Path not under an external location", "Missing CREATE MANAGED STORAGE"],
  "Grant the creation privilege on the parent (plus USE prerequisites); for managed locations, use a path under an external location and CREATE MANAGED STORAGE.",
  "Create on the parent")

c.playbook(12, "Dashboard shows wrong revenue — debug with lineage", S(13),
  "The executive dashboard shows wrong revenue numbers.",
  ["What is the dashboard's upstream table (lineage)?",
   "Is the value already wrong in gold.daily_revenue?",
   "Is it wrong in silver.orders?",
   "Is it wrong in bronze.orders?",
   "In which layer did the wrong value FIRST appear — and which transformation feeds it?"],
  [("Open lineage for the dashboard in Catalog Explorer.", "Lineage gives the path upstream."),
   ("Query each layer for the same day/key.", "Find the first wrong layer.", "SELECT SUM(amount) FROM prod_ecommerce.silver.orders WHERE order_date = '2026-01-09';"),
   ("Fix the transformation into the first wrong layer, then rerun downstream.", "The bug lives just before the first wrong layer.")],
  ["Bad join/duplicates in silver→gold", "Bad cleaning in bronze→silver", "Ingestion issue in bronze"],
  "Walk lineage upstream to the first wrong layer and fix that transformation.",
  "Walk upstream until it's right")

# ---------------------------------------------------------------- pitfalls
P = c.pitfall
P("Thinking Unity Catalog stores your data", "UC holds metadata, permissions, lineage and storage references; the bytes are in S3/ADLS/GCS.", "Separate governance (UC) from storage (cloud) in every explanation and debug.")
P("Putting the workspace in the namespace", "A notebook lives in a workspace; tables are registered in the metastore. `catalog.schema.object` has no workspace level.", "Remember: workspace = operational environment; metastore = regional governance container.")
P("One metastore per project", "Metastores are regional (usually one per region). Isolation starts at the catalog level.", "Create a new catalog, not a new metastore.")
P("CREATE SCHEMA with only CREATE SCHEMA", "Schema creation also needs USE CATALOG on the parent catalog.", "Grant USE CATALOG + CREATE SCHEMA on the parent catalog.")
P("USE CATALOG / USE SCHEMA mistaken for data access", "USE privileges are traversal prerequisites; they never grant SELECT.", "Read path = USE CATALOG + USE SCHEMA + SELECT.")
P("SELECT without USE SCHEMA", "SELECT on a table is useless if the parent schema can't be traversed.", "Grant USE SCHEMA on the exact parent schema.")
P("REVOKE on a table assumed to remove access", "Inherited SELECT on the schema or catalog keeps access alive.", "SHOW GRANTS on schema and catalog; restructure grants.")
P("REVOKE … TO", "REVOKE uses FROM, GRANT uses TO.", "REVOKE SELECT ON TABLE t FROM `group`;")
P("ALL PRIVILEGES assumed to be everything", "MANAGE, EXTERNAL USE LOCATION and EXTERNAL USE SCHEMA are excluded.", "Grant MANAGE explicitly where delegated governance is intended.")
P("GRANT ALL PRIVILEGES to all users", "Violates least privilege, and ALL PRIVILEGES grows dynamically as new privileges appear.", "Grant minimal, specific privileges to groups; be restrained with ALL PRIVILEGES and MANAGE.")
P("Personal owners and personal run-as in production", "When the person leaves, ownership/jobs break.", "Groups own production objects; service principals run pipelines.")
P("BROWSE confused with SELECT", "BROWSE only reveals that objects exist (metadata).", "Use BROWSE for discovery; grant SELECT only after an access request.")
P("Managed = inside Databricks servers", "Both managed and external data can live in your cloud storage; the difference is who controls location and lifecycle.", "Ask \"who controls the files' location and lifecycle?\"")
P("Dropping an external table to free storage", "DROP on an external table removes metadata only; files remain.", "Delete files with storage tooling if truly unwanted; check type before DROP.")
P("Dropping a managed table you still need", "For managed tables UC handles deletion of the underlying files.", "DESCRIBE TABLE EXTENDED before DROP; know the type.")
P("MANAGED LOCATION on an ungoverned path", "Managed locations must be under a UC external location and need CREATE MANAGED STORAGE.", "Create/choose an external location first; grant CREATE MANAGED STORAGE.")
P("Granting on the storage credential instead of the external location", "Credentials can reach a huge storage scope.", "Grant CREATE EXTERNAL TABLE etc. on the external location (path-scoped).")
P("External location vs external table confusion", "Location = governed path; table = metadata pointing at data in that path.", "Keep the chain: credential → location → table/volume → files.")
P("Using SELECT for volumes", "Volumes use READ VOLUME / WRITE VOLUME.", "Grant USE CATALOG + USE SCHEMA + READ VOLUME (+ WRITE VOLUME).")
P("Ignoring workspace bindings", "A catalog/location/credential may be bound to specific workspaces; grants can't override that.", "Check bindings when grants look right but access fails in one workspace.")
P("Correct grants on non-UC compute", "Legacy compute fails even with perfect permissions.", "Use Standard/Dedicated, serverless or SQL warehouses.")
P("SELECT expected to show raw values", "Row filters, column masks and ABAC change visibility at query time.", "Check filters/masks/ABAC and group membership.")
P("Row filter defaulting to TRUE", "ELSE TRUE shows every row to unmatched users.", "Deny by default: ELSE FALSE.")
P("Per-table masks for thousands of tables", "Manual attachment doesn't scale and misses new tables.", "Use ABAC: governed tags + central policy.")
P("Assuming the Run-button identity is the workload identity", "Jobs/pipelines may run as a service principal.", "Check run-as first (layer 1 of the algorithm).")
P("Asking for admin on PERMISSION_DENIED", "Fixes the symptom, breaks least privilege, teaches nothing.", "Walk I Bet Cats Sit On Fluffy Silk Cushions.")

# ---------------------------------------------------------------- flashcards
F = c.card
F("The four questions of the Phase-3 mental model?", "WHO? → WHAT OBJECT? → WHAT ACTION? → WHERE ARE THE BYTES?", S(1))
F("What is fragmented governance?", "Permissions scattered across storage, notebooks, clusters and BI tools — no single answer to \"who has what?\".", S(1))
F("What does Unity Catalog hold?", "Metadata + namespace + permissions + ownership + lineage + governance policies + storage references — not the bytes.", S(1))
F("Top-level Unity Catalog object?", "The metastore.", S(2))
F("How many metastores per region, typically?", "One; many workspaces in the region attach to it.", S(2))
F("Workspace vs metastore?", "Workspace = operational development environment. Metastore = regional UC governance container.", S(2))
F("Three conditions for two workspaces to see the same object?", "Same metastore + principal has permission + no workspace binding forbids it.", S(2))
F("Metastore vs catalog?", "Metastore = top regional governance container. Catalog = primary logical/data isolation container inside it.", S(2))
F("Primary unit of data isolation?", "The catalog.", S(3))
F("What can a schema contain?", "Tables, views, volumes, models, functions (and materialized views, streaming tables …).", S(3))
F("Privileges to create a schema?", "USE CATALOG + CREATE SCHEMA on the parent catalog.", S(3))
F("Privilege to create a catalog?", "CREATE CATALOG on the metastore.", S(3))
F("Securable object?", "A UC object on which privileges can be granted to principals (catalog, schema, table, volume, external location, storage credential, function …).", S(4))
F("Three kinds of principal?", "User, group, service principal.", S(4))
F("Where should principals be provisioned?", "At the account level; prefer groups over individual users.", S(4))
F("Why service principals for production?", "Stable machine identity decoupled from employee lifecycle.", S(4))
F("Does USE CATALOG give SELECT?", "No — USE CATALOG / USE SCHEMA are prerequisites only.", S(5))
F("Minimum grants to read one table?", "USE CATALOG + USE SCHEMA + SELECT (on table or inherited).", S(5))
F("Case 2 cause?", "SELECT exists but USE SCHEMA is missing → can't traverse the schema.", S(5))
F("What does GRANT SELECT ON SCHEMA do to new tables?", "They inherit it — inheritance covers current and future child objects.", S(6))
F("SELECT vs MODIFY?", "SELECT reads; MODIFY writes/changes data (broad DML). Finer DML like INSERT exists in beta.", S(6))
F("Command to answer \"who has what?\"", "SHOW GRANTS ON <TABLE|SCHEMA|CATALOG> <name>;", S(6))
F("REVOKE grammar?", "REVOKE <privilege> ON <type> <name> FROM <principal>;", S(6))
F("Case 3: REVOKE on table but user still reads — why?", "Inherited SELECT on the schema or catalog.", S(6))
F("What can an owner do?", "Manage privileges, modify/manage the object, transfer ownership.", S(7))
F("Who should own production objects?", "Groups (e.g. data_platform_admins), not individuals.", S(7))
F("What is MANAGE?", "Delegated governance: manage grants/ownership-related operations without being owner.", S(7))
F("What is excluded from ALL PRIVILEGES?", "MANAGE, EXTERNAL USE LOCATION, EXTERNAL USE SCHEMA.", S(7))
F("Why is ALL PRIVILEGES risky over time?", "It's evaluated dynamically — new applicable privileges are added automatically.", S(7))
F("What does BROWSE allow?", "Discovering that objects exist (metadata) without data access.", S(7))
F("Managed vs external — the real difference?", "Who controls the files' location and lifecycle (UC vs you/external system).", S(8))
F("DROP managed table?", "UC handles metadata and deletion of underlying files.", S(8))
F("DROP external table?", "Metadata removed; files remain.", S(8))
F("When does an external table make sense?", "Existing data at known paths, non-Databricks lifecycle control, migration constraints, interoperability.", S(8))
F("Managed storage location priority?", "Schema > catalog > metastore (most specific wins).", S(9))
F("Requirements for MANAGED LOCATION?", "Path under a UC external location + CREATE MANAGED STORAGE.", S(9))
F("Storage credential?", "UC object abstracting a long-term cloud identity (IAM role / managed identity / service account).", S(9))
F("External location?", "Cloud path + storage credential, as a securable.", S(9))
F("The full storage chain?", "Cloud IAM → storage credential → external location → external table/volume → files.", S(9))
F("Why grant on external location, not credential?", "Path-scoped least privilege.", S(9))
F("Case 4 extra layers?", "External location, storage credential, workspace binding, cloud IAM.", S(9))
F("What is a volume?", "A UC-governed object for non-tabular/file data, accessed via /Volumes/catalog/schema/volume/…", S(10))
F("Volume privileges?", "READ VOLUME, WRITE VOLUME (+ USE CATALOG, USE SCHEMA).", S(10))
F("Drop an external volume?", "Metadata removed; files remain.", S(10))
F("What is a workspace binding?", "A restriction on which workspaces can use a catalog, external location or storage credential.", S(11))
F("Which compute supports UC?", "Classic Standard/Dedicated, serverless, Databricks SQL.", S(11))
F("Row filter?", "SQL UDF applied at query time; rows where it returns false are removed.", S(12))
F("Syntax to attach a row filter?", "ALTER TABLE t SET ROW FILTER f ON (col);", S(12))
F("Syntax to attach a column mask?", "ALTER TABLE t ALTER COLUMN c SET MASK f;", S(12))
F("ABAC?", "Attribute-based access control: governed tags + central policies (filters, masks, GRANT/DENY) across many objects.", S(12))
F("Case 6: SELECT but ****?", "SELECT ≠ unfiltered raw visibility — column mask / row filter / ABAC.", S(12))
F("Lineage scope?", "Automatic, down to column level, across workspaces sharing the metastore.", S(13))
F("Debugging with lineage — the key question?", "In which layer did the wrong value first appear?", S(13))
F("Federation vs Delta Sharing?", "Federation: query data where it lives elsewhere (connection → foreign catalog). Delta Sharing: share data outward (share → recipient).", S(13))
F("Gold pipeline SP grants?", "Read Silver (USE SCHEMA + SELECT) + write Gold (USE SCHEMA + MODIFY) + USE CATALOG.", S(14))
F("Permission-debugging mnemonic?", "I Bet Cats Sit On Fluffy Silk Cushions — Identity, Binding, Catalog, Schema, Object, Fine-grained, Storage, Compute.", S(15))
F("Why can a job fail while your notebook works?", "It may run as a service principal with different privileges.", S(15))

c.save(os.path.join(HERE, "ch11.json"))

# ---------------------------------------------------------------- coverage
d = c.d
ex_by_id = {e["id"]: e for e in d["exercises"]}
lines = ["# ch11 — Unity Catalog Mastery — coverage checklist",
         "", "Source: PDF #2 pages 1–54 (original 403–456), from the Phase-3 mental model to the Phase-3 wrap-up (stop at \"Phase 4 — Data Ingestion\").",
         "", "Format: source heading / concept → section → exercises.", ""]
for label, sec, ids in c.cov:
    lines.append(f"- [x] **{label}** → `{sec}` → " + ", ".join(f"{i} ({ex_by_id[i]['type']})" for i in ids))
lines += ["", "## Debug playbooks"]
for pb in d["debug"]:
    lines.append(f"- [x] `{pb['id']}` {pb['title']} → `{pb['section']}`" + (f" — mnemonic: *{pb['mnemonic']}*" if pb.get('mnemonic') else ""))
lines += ["", "## Additional source items mapped to blocks (taught, and tested where listed above)",
          "- [x] §1 S3/ADLS folder tree + 7 governance questions → ch11-s01 diagram + list",
          "- [x] §3 hierarchy trees (dev/prod/sandbox; prod.silver contents incl. normalize_email()) → ch11-s02 diagrams",
          "- [x] §9 current_catalog()/current_schema()/USE → ch11-s03 recap callout (deep coverage ch04-s13)",
          "- [x] §44 Tables vs Volumes table (re-drawn from PDF image p27) → ch11-s10 table",
          "- [x] §56 Catalog Explorer tree + tabs (schema/details/permissions/history/lineage/tags/dependencies) → ch11-s13",
          "- [x] §72 Metastore vs catalog → ch11-s02 exam callout + ch11-e016; s16 confusable-pairs table",
          "- [x] §81–84 Interview answers → ch11-s08 / s09 / s05 / s10 free exercises",
          "- [x] Phase-3 production exercise (full flow + two roles) → ch11-s14 flow + bucket",
          "- [x] Phase-3 outcome (\"whole authorization chain\") → ch11-s15 callout + free",
          "",
          "## Source issues",
          "- Big test jumps from Q22 to Q28: Q23–Q27 are missing in the export, and Q22's answer is cut off (\"…or cred\" → credentials). Covered Q1–Q22 and Q28–Q30.",
          "- Text extraction dropped ✅/❌ marks (Case 1, Case 2, Case 5, tables-vs-volumes table); restored from the page images.",
          "- Lab §80 grants USE SCHEMA + READ/WRITE VOLUME but omits USE CATALOG on ecommerce_dev; flagged in a code comment and ch11 exercise.",
          "- Additions for real syntax not shown in the source (marked as such): column-mask SQL (ALTER COLUMN … SET MASK), CREATE EXTERNAL LOCATION … WITH (STORAGE CREDENTIAL …), ALTER … SET OWNER TO, SET TAGS, Federation/Delta Sharing sketches. Storage credentials are noted as usually created via Catalog Explorer/CLI/API rather than SQL.",
          ""]
open(os.path.join(HERE, "ch11.coverage.md"), "w", encoding="utf-8").write("\n".join(lines))
print("wrote ch11.coverage.md")
