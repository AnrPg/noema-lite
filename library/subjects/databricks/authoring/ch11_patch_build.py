"""Build content/patches/ch11_links.json — additive Level-up links + new nuances from Chapter 11 (Unity Catalog Mastery).
Patch ids: exercises chNN-e7NN, playbooks chNN-d7N."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
REF = "see Chapter 11: Unity Catalog Mastery"


def lvl(title, text, kind="key"):
    return {"t": "callout", "kind": kind, "title": "Level-up → " + title, "text": text + " " + REF + "."}


patches = [
 {"chapter": "ch01", "section": "ch01-s09",
  "appendBlocks": [lvl("the full UC hierarchy",
    "Metastore → catalog → schema → object, managed vs external storage, and why UC governs metadata but never stores the bytes are now covered in depth —")]},

 {"chapter": "ch03", "section": "ch03-s02",
  "appendBlocks": [lvl("principals in production",
    "New: provision principals at the **account level**, and give **production ownership and write access** to groups / service principals, never personal users —")]},

 {"chapter": "ch03", "section": "ch03-s03",
  "appendBlocks": [lvl("inheritance, REVOKE, ownership, MANAGE, BROWSE",
    "Grants on a schema/catalog **flow down** to children (including future tables), so a table-level `REVOKE` can leave access in place. Ownership, MANAGE, BROWSE and SHOW GRANTS are covered too —")],
  "appendExercises": [
   {"id": "ch03-e703", "type": "tf", "section": "ch03-s03", "difficulty": 2, "tags": ["pitfall", "exam"], "quick": False,
    "q": "After `REVOKE SELECT ON TABLE company.finance.transactions FROM analysts`, analysts are guaranteed to lose read access to that table.",
    "answer": False,
    "explain": "False. If `SELECT` was also granted on the parent **schema** or **catalog**, the table inherits it and access remains. Always run SHOW GRANTS on the schema and catalog too (Chapter 11, Case 3)."}],
  "appendPitfalls": [{"title": "REVOKE on a table ≠ access gone",
    "text": "Inherited SELECT on the schema or catalog keeps the table readable after a table-level REVOKE.",
    "fix": "SHOW GRANTS on schema and catalog; restructure where SELECT is granted."}],
  "appendFlashcards": [{"q": "Why can a user still read a table after REVOKE SELECT ON TABLE?", "a": "An inherited SELECT on the parent schema or catalog.", "section": "ch03-s03"}]},

 {"chapter": "ch03", "section": "ch03-s04",
  "appendBlocks": [lvl("the 8-layer PERMISSION_DENIED algorithm",
    "The full algorithm puts **identity first** and adds three layers this checklist lacks: **workspace binding**, **external storage** (location / credential / cloud IAM) and **UC-compatible compute**. Mnemonic: *I Bet Cats Sit On Fluffy Silk Cushions* —")],
  "appendExercises": [
   {"id": "ch03-e701", "type": "mcq", "section": "ch03-s04", "difficulty": 2, "tags": ["debug", "exam"], "quick": False,
    "q": "The Phase-3 permission algorithm extends this section's checklist. Which layers does it ADD? (choose all)",
    "options": ["Workspace / catalog binding", "External-storage permissions (external location, credential, cloud IAM)", "UC-compatible compute", "USE SCHEMA", "Row filters / column masks"],
    "answer": [0, 1, 2], "multi": True,
    "why": ["Added — grants can't override a missing binding.", "Added — matters for external tables/volumes.", "Added — correct grants on legacy compute still fail.", "Already in the checklist.", "Already in the checklist."],
    "explain": "Full order: Identity → Binding → USE CATALOG → USE SCHEMA → Object → Fine-grained → Storage → Compute. Binding, storage and compute are the new layers; identity also moves to the front, because every grant is evaluated for the executing principal."},
   {"id": "ch03-e702", "type": "order", "section": "ch03-s04", "difficulty": 2, "tags": ["debug"], "quick": False,
    "q": "Put the 8 layers of the full PERMISSION_DENIED algorithm in order.",
    "items": ["Which principal actually executes?", "Workspace / catalog binding", "USE CATALOG", "USE SCHEMA", "Object privilege (SELECT …)", "Row filter / column mask / ABAC", "External storage (if relevant)", "UC-compatible compute"],
    "explain": "I Bet Cats Sit On Fluffy Silk Cushions: Identity, Binding, Catalog, Schema, Object, Fine-grained, Storage, Compute."}],
  "appendFlashcards": [{"q": "Full PERMISSION_DENIED mnemonic?", "a": "I Bet Cats Sit On Fluffy Silk Cushions — Identity, Binding, Catalog, Schema, Object, Fine-grained, Storage, Compute.", "section": "ch03-s04"}]},

 {"chapter": "ch03", "section": "ch03-s05",
  "appendBlocks": [lvl("ALL PRIVILEGES is not everything",
    "`ALL PRIVILEGES` **excludes MANAGE, EXTERNAL USE LOCATION and EXTERNAL USE SCHEMA**, and it is **evaluated dynamically** (new privileges are added automatically) — one more reason for restraint —", "tip")],
  "appendExercises": [
   {"id": "ch03-e704", "type": "tf", "section": "ch03-s05", "difficulty": 2, "tags": ["exam", "pitfall"], "quick": False,
    "q": "`ALL PRIVILEGES` is a fixed list that includes MANAGE.", "answer": False,
    "explain": "False twice: MANAGE (plus EXTERNAL USE LOCATION / EXTERNAL USE SCHEMA) is excluded, and ALL PRIVILEGES is evaluated dynamically, so it silently grows when new applicable privileges appear."}],
  "appendFlashcards": [{"q": "What does ALL PRIVILEGES exclude?", "a": "MANAGE, EXTERNAL USE LOCATION, EXTERNAL USE SCHEMA.", "section": "ch03-s05"}]},

 {"chapter": "ch04", "section": "ch04-s02",
  "appendBlocks": [lvl("workspace ≠ metastore",
    "Usually **one metastore per region**; many workspaces attach to it and share governance. A notebook lives in a workspace, but `prod.sales.orders` is registered in the metastore —")],
  "appendExercises": [
   {"id": "ch04-e701", "type": "tf", "section": "ch04-s02", "difficulty": 1, "tags": ["exam"], "quick": False,
    "q": "A table created from workspace A can be queried from workspace B in the same region, if both use the same metastore, the principal has the grants and no workspace binding blocks it.",
    "answer": True,
    "explain": "True. Tables are registered in the regional **metastore**, not in a workspace. Same metastore + grants + no blocking binding = access from any attached workspace."}],
  "appendFlashcards": [{"q": "Typical number of UC metastores per region?", "a": "One, shared by the region's workspaces.", "section": "ch04-s02"}]},

 {"chapter": "ch04", "section": "ch04-s12",
  "appendBlocks": [lvl("Catalog Explorer as governance UI",
    "Per object you can see schema, details, **permissions, history, lineage, tags, dependencies**; BROWSE lets users discover objects without data access —", "tip")]},

 {"chapter": "ch04", "section": "ch04-s13",
  "appendBlocks": [lvl("catalog.schema.object",
    "The third name can be a table, view, **volume, function, model**, materialized view or streaming table — so the general form is `catalog.schema.object`. Catalog/schema design and creation privileges are covered —")]},

 {"chapter": "ch04", "section": "ch04-s14",
  "appendBlocks": [lvl("six permission-debugging cases",
    "Wrong identity, SELECT without USE SCHEMA, revoked-but-inherited, external-storage failures, volume READ/WRITE VOLUME and masked values each get a playbook —", "tip")]},

 {"chapter": "ch07", "section": "ch07-s06",
  "appendBlocks": [lvl("access mode = UC compatibility",
    "Classic compute in **Standard or Dedicated** access mode, serverless and Databricks SQL can access Unity Catalog. **Correct permissions + wrong legacy compute = still failure** —")],
  "appendExercises": [
   {"id": "ch07-e701", "type": "tf", "section": "ch07-s06", "difficulty": 1, "tags": ["pitfall"], "quick": False,
    "q": "If a user's Unity Catalog grants are correct, the query works on any cluster, whatever its configuration.", "answer": False,
    "explain": "False. The compute must be UC-compatible (Standard/Dedicated classic, serverless, SQL warehouse). A legacy configuration fails even with perfect grants — layer 8 of the permission algorithm."}],
  "appendFlashcards": [{"q": "Which compute can access Unity Catalog?", "a": "Classic Standard/Dedicated access mode, serverless, Databricks SQL.", "section": "ch07-s06"}]},

 {"chapter": "ch08", "section": "ch08-s12",
  "appendBlocks": [lvl("what Gate 2 really contains",
    "\"Unity Catalog\" in Gate 2 is itself a chain: workspace binding → USE CATALOG → USE SCHEMA → object privilege → row filters / masks / ABAC → external storage —", "tip")]},

 {"chapter": "ch08", "section": "ch08-s13",
  "appendBlocks": [lvl("run-as = Case 1",
    "\"Notebook works, job/pipeline fails\" is Debugging Case 1 (wrong identity). The production example `gold_pipeline_sp` gets read-Silver + write-Gold grants only —", "tip")]},

 {"chapter": "ch05", "section": "ch05-s12",
  "appendBlocks": [lvl("Unity Catalog in depth is here",
    "The promised deep dive (catalog.schema.object, managed vs external, volumes, external locations, grants, PERMISSION_DENIED debugging) is now written —", "tip")]},

 {"chapter": "ch06", "section": "ch06-s14",
  "appendBlocks": [lvl("Phase 3 is now a full chapter",
    "Every item of this \"what's next\" list — metastore to PERMISSION_DENIED debugging — is taught and tested —", "tip")]},

 {"chapter": "ch10", "section": "ch10-s07",
  "appendBlocks": [lvl("the full Phase 3",
    "This preview is now a full chapter: 16 sections, the 8-layer algorithm (identity first, plus binding, fine-grained policies, storage and compute), six debugging cases and the Phase-3 big test —")]},
]

out = os.path.join(HERE, "patches", "ch11_links.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({"patches": patches}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote", out, len(patches), "patches")
