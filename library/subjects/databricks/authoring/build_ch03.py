import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chlib import Chapter

C = Chapter("ch03", 3,
    title="Identity, Governance & Shipping Code",
    subtitle="Principals, securables, privileges, dev→staging→prod, Git, CI/CD, IaC, Bundles — and the three classic debugging cases",
    emoji="🔐",
    sourcePages="52–76",
    mantra="Know WHO is running, WHAT it may touch and HOW the code reached prod — then debug by finding the first layer where reality diverges from what you expected.",
    objectives=[
        "You can separate authentication from authorization and name the three principal types.",
        "You can read a GRANT statement word by word and list every privilege needed to SELECT from catalog.schema.table.",
        "You can debug PERMISSION_DENIED in the right order — ending with 'which identity is ACTUALLY running?'.",
        "You can explain least privilege and why ALL PRIVILEGES for everybody is a bad fix.",
        "You can describe dev → test/staging → prod, Git flow, CI, CD and Infrastructure as Code (Declarative Automation Bundles, formerly Asset Bundles).",
        "You can run the three classic debugging playbooks: no new data, duplicate records, works in dev / fails in prod.",
        "You can map the whole platform: Lakeflow/Spark, Unity Catalog, Git/CI/CD, Bundles, Delta + cloud storage.",
    ])

# =====================================================================
# s01 Authentication vs authorization
# =====================================================================
s01 = C.sec(1, "Authentication vs Authorization",
            "'Who are you?' and 'What may you do?' are two different questions — and two different failure modes.")
C.compare(
    ("Authentication", ["Question: **Who are you?**", "`nikos@company.com` logs in", "System proves: this really is Nikos"]),
    ("Authorization", ["Question: **What are you allowed to do?**", "Checked after identity is known", "E.g. SELECT yes, DELETE no"]),
)
C.table(["Action by Nikos", "Allowed?"], [["SELECT customers", "YES"], ["DELETE customers", "NO"], ["CREATE TABLE", "NO"]],
        caption="Authorization = a list of allowed actions for a known identity")
C.callout("analogy", "Hotel analogy",
          "Reception checks your passport — **authentication**. Your key card then opens only your room and the gym, not the kitchen — **authorization**.")
C.callout("key", "Order matters", "Authorization only makes sense after authentication: first the system knows WHO, then it decides WHAT that identity may do.")
C.reveal("Think first: Nikos logs in successfully but gets an error when running DELETE. Authentication or authorization problem?",
         "**Authorization.** Login worked, so his identity was proven; the system simply doesn't allow that identity to delete.")

C.free("Test Q14: What is the difference between authentication and authorization?",
       "Authentication answers 'who are you?' — it proves an identity, e.g. that the login really is nikos@company.com. Authorization answers 'what are you allowed to do?' — e.g. Nikos may SELECT customers but not DELETE or CREATE TABLE.",
       ["authentication = who are you / prove identity", "authorization = what are you allowed to do", "example"],
       "Official answer: Authentication — who are you? Authorization — what are you allowed to do?",
       tags=["exam", "interview"], diff=1, quick=True)
C.bucket("Authentication or authorization?", ["Authentication", "Authorization"], [
    ("Logging in as nikos@company.com", 0),
    ("Checking whether Nikos may DELETE customers", 1),
    ("Proving the caller really is the service principal orders-etl-prod", 0),
    ("GRANT SELECT ON TABLE ... TO analysts", 1),
    ("A login fails because of a wrong password/token", 0),
    ("PERMISSION_DENIED on a SELECT after a successful login", 1),
], "Authentication = establishing identity (login, token). Authorization = permissions of that identity (grants, PERMISSION_DENIED).",
   tags=["compare"], diff=1, quick=True)
C.tf("PERMISSION_DENIED after you have successfully logged in is an authentication problem.", False,
     "You are already authenticated (the system knows who you are). PERMISSION_DENIED means that identity lacks a privilege — an authorization problem.",
     tags=["pitfall", "debug"], diff=1)
C.cloze("Complete the two questions.", "Authentication asks: [[who are you|who are you?]] — Authorization asks: [[what are you allowed to do|what are you allowed to do?|what may you do]]",
        "Two separate checks: identity first, then permissions for that identity.", bank=["where are you", "how fast are you"], tags=["concept"], diff=1)
C.odd("Which one is NOT an authorization decision?", ["Nikos may SELECT customers", "Nikos may not DELETE customers", "Nikos may not CREATE TABLE", "Nikos proves his identity at login"], 3,
      "Proving identity at login is authentication; the other three are permissions granted (or not) to that identity.",
      tags=["compare"], diff=1)

# =====================================================================
# s02 Principals
# =====================================================================
s02 = C.sec(2, "Principals: User, Group, Service Principal",
            "Every grant goes TO a principal — pick the right kind and half of your security problems disappear.")
C.p("A **principal** is an identity to which permissions can be given. Unity Catalog grants privileges to principals on securable objects.")
C.terms([
    ("User", "A human, e.g. `nikos@company.com`."),
    ("Group", "A set of principals, e.g. `data_engineers` = Nikos, Maria, John."),
    ("Service principal", "A machine identity for automation, e.g. `orders-etl-prod`."),
])
C.code("sql", "-- painful: one grant per person\nGRANT ... TO Nikos;\nGRANT ... TO Maria;\nGRANT ... TO John;\n\n-- better: grant to the group, manage membership\nGRANT ... TO `data_engineers`;", caption="Grant to groups, not individuals")
C.callout("tip", "Groups over individuals", "Databricks recommends managing access through **groups** instead of individual users wherever possible. Then onboarding/offboarding = changing group membership.")
C.p("A production job runs **every night at 02:00**. Ideally it should **not** 'run as Nikos'. What if Nikos leaves the company and his account is disabled? The job breaks.")
C.diagram("""
human       ──►  user identity       (nikos@company.com)
automation  ──►  service principal   (orders-etl-prod)
""", caption="Humans use users; automation uses service principals")
C.callout("interview", "Why service principals for production?",
          "A production workload needs a **stable machine identity** independent of the lifecycle and permissions of one specific employee. We'll use this again with Jobs and CI/CD.")

C.free("Test Q15: What is a principal?",
       "An identity to which privileges can be assigned — for example a user, a group or a service principal.",
       ["identity", "privileges/permissions can be granted to it", "user / group / service principal"],
       "Official answer: an identity to which privileges can be assigned, e.g. user, group or service principal.",
       tags=["exam"], diff=1, quick=True)
C.mcq("Test Q16: Why should a production job usually run as a service principal instead of a developer's personal account?",
      ["Service principals run queries faster",
       "Production needs a stable machine identity independent of one employee's lifecycle and permissions",
       "Personal accounts cannot run jobs on a schedule",
       "Service principals automatically get ALL PRIVILEGES"], 1,
      "If the job runs as Nikos and Nikos leaves (account disabled) or his permissions change, production breaks. A service principal like `orders-etl-prod` is owned by the system, not a person.",
      why=["Identity doesn't affect query speed.", "Correct.", "They can — that's exactly the risk.", "No! Service principals should also follow least privilege."],
      tags=["exam", "interview"], diff=1, quick=True)
C.match("Match each example to its principal type.", [
    ("nikos@company.com", "User"), ("data_engineers", "Group"), ("orders-etl-prod", "Service principal")],
    "Users = humans, groups = sets of principals, service principals = machine identities for automation.",
    tags=["concept"], diff=1)
C.odd("Which one is NOT a principal?", ["nikos@company.com", "data_engineers", "orders-etl-prod", "company.finance.payroll"], 3,
      "`company.finance.payroll` is a table — a securable object you grant ON. The other three are identities you grant TO.",
      tags=["concept", "exam"], diff=1)
C.scenario("The nightly `orders` job has run fine for a year. Today it fails at 02:00. Yesterday Nikos — the engineer who created it — left the company.", [
    ("What is your first hypothesis?", [
        ("The job runs as Nikos's user identity, which was just disabled", True, "Right — a classic reason to use service principals for production."),
        ("The data volume suddenly grew", False, "Possible in general, but the timing with Nikos leaving is the strong clue."),
        ("Spark has a bug", False, "Don't blame the platform before checking the identity."),
    ]),
    ("Confirmed: 'Run as' = nikos@company.com. What is the durable fix?", [
        ("Run the job as a service principal (e.g. orders-etl-prod) with only the privileges it needs", True, "Stable machine identity + least privilege."),
        ("Run it as another engineer's account", False, "Same problem again when that person leaves or changes role."),
        ("Re-enable Nikos's account forever", False, "Keeps a departed employee's identity alive — a security risk."),
    ]),
], explain="Human → user identity; automation → service principal.", tags=["debug", "exam"], diff=2)
C.write("Grant the group `data_engineers` SELECT on table `company.silver.orders` (one statement).",
        "GRANT SELECT ON TABLE company.silver.orders TO `data_engineers`;",
        ["grant select", "on table company.silver.orders", "to `data_engineers`"],
        "Granting to a group means you manage access by membership; backticks are used around principal names in Databricks SQL.",
        tags=["syntax"], diff=1)
C.calc("Nikos, Maria and John each need the same 4 privileges. How many GRANT statements do you write if you grant per user (instead of 4 grants to `data_engineers`)?", 12,
       "3 users × 4 privileges = 12 statements, versus 4 when granting to the group — and with the group, onboarding a 4th engineer needs 0 new grants, just a membership change.",
       unit="statements", tags=["calc", "concept"], diff=1)
C.tf("Databricks recommends granting privileges to individual users rather than groups wherever possible.", False,
     "The recommendation is the opposite: manage access through groups where possible, and manage membership.",
     tags=["exam", "pitfall"], diff=1)

# =====================================================================
# s03 Securables, privileges, GRANT grammar
# =====================================================================
s03 = C.sec(3, "Securable Objects, Privileges & GRANT Grammar",
            "Read GRANT like a sentence: give WHAT right, ON which object, TO whom.")
C.p("A **securable object** is anything whose permissions you can control: catalog, schema, table, volume, function, …")
C.code("text", "catalog:  company\nschema:   company.finance\ntable:    company.finance.payroll", caption="Securables at three levels")
C.p("A **privilege** is the action a principal is allowed to perform on a securable object.")
C.code("sql", "GRANT SELECT\nON TABLE company.finance.transactions\nTO `analysts`;")
C.table(["Word", "Meaning"], [
    ["GRANT", "give"],
    ["SELECT", "the read permission (the privilege)"],
    ["ON TABLE …", "on this securable object"],
    ["TO analysts", "to this principal (here a group)"],
], caption="Parse it grammatically instead of memorizing it")
C.p("To SELECT from `company.finance.transactions` you conceptually walk the path **company → finance → transactions**, so permissions usually include the containers too:")
C.code("sql", "GRANT USE CATALOG ON CATALOG company TO `analysts`;\nGRANT USE SCHEMA  ON SCHEMA  company.finance TO `analysts`;\nGRANT SELECT      ON TABLE   company.finance.transactions TO `analysts`;", caption="The full path for a read")
C.callout("exam", "SELECT alone is not enough",
          "Having SELECT on a table but **not USE CATALOG** (or USE SCHEMA) can still produce a permission problem: access passes through the catalog/schema hierarchy.")
C.callout("tip", "Coming later", "Privilege inheritance and the exact Unity Catalog semantics come in the Unity Catalog chapter.")
C.terms([
    ("Securable object", "A governed object on which permissions can be granted (catalog, schema, table, volume, function…)."),
    ("Privilege", "An action a principal may perform on a securable (SELECT, USE CATALOG, USE SCHEMA…)."),
])

C.free("Test Q17: What is a securable object?",
       "A governed object on which permissions can be granted — e.g. a catalog, schema, table, volume or function.",
       ["governed object", "permissions can be granted on it", "examples: catalog/schema/table/volume/function"],
       "Official answer: a governed object on which permissions can be granted.",
       tags=["exam"], diff=1, quick=True)
C.match("Test Q18: Explain `GRANT SELECT ON TABLE prod.finance.transactions TO analysts;` word by word — match each part to its meaning.", [
    ("GRANT", "give"), ("SELECT", "the read permission"), ("ON TABLE prod.finance.transactions", "on this table (securable)"), ("TO `analysts`", "to this principal / group")],
    "GRANT = give, SELECT = privilege, ON TABLE … = securable, TO … = principal. Reading it as a sentence prevents mechanical memorization.",
    tags=["exam", "syntax"], diff=1, quick=True)
C.mcq("Test Q19: A group has SELECT on a table but NOT USE CATALOG on its catalog. Can there be a permission problem?",
      ["No — SELECT on the table is all you need", "Yes — access passes through the catalog/schema hierarchy", "Only if the table is a view", "Only for service principals"], 1,
      "To reach `catalog.schema.table` the principal also needs USE CATALOG on the catalog and USE SCHEMA on the schema. Missing either blocks the read.",
      tags=["exam", "pitfall"], diff=2, quick=True)
C.write("Write the three GRANT statements that let group `analysts` read `company.finance.transactions`.",
        "GRANT USE CATALOG ON CATALOG company TO `analysts`;\nGRANT USE SCHEMA ON SCHEMA company.finance TO `analysts`;\nGRANT SELECT ON TABLE company.finance.transactions TO `analysts`;",
        ["use catalog on catalog company", "use schema on schema company.finance", "select on table company.finance.transactions", "to `analysts`"],
        "Walk the path: catalog → schema → table. Each level needs its own privilege.",
        tags=["syntax", "exam"], diff=2)
C.calc("A brand-new group has no privileges at all. What is the minimum number of GRANT statements so it can SELECT from one table `prod.finance.transactions` (as taught in the lesson)?", 3,
       "USE CATALOG on prod, USE SCHEMA on prod.finance, SELECT on the table — one per level of the three-level name.",
       unit="grants", tags=["calc", "exam"], diff=1)
C.order("Order the grants along the access path (outer container first).", [
    "USE CATALOG on company", "USE SCHEMA on company.finance", "SELECT on company.finance.transactions"],
    "The path goes company → finance → transactions; the outer containers must be usable before the table can be read.",
    tags=["syntax"], diff=1)
C.bucket("Principal, securable object or privilege?", ["Principal", "Securable object", "Privilege"], [
    ("`analysts`", 0), ("orders-etl-prod", 0), ("company.finance", 1), ("a volume", 1),
    ("SELECT", 2), ("USE CATALOG", 2), ("company.finance.payroll", 1), ("USE SCHEMA", 2)],
    "Principal = WHO (TO …); securable = WHAT object (ON …); privilege = WHICH action (GRANT …).",
    tags=["concept"], diff=1)
C.spotbug("This script should let `analysts` read `company.finance.transactions`. Click the buggy lines.", [
    "GRANT USE CATALOG ON CATALOG company TO `analysts`;",
    "GRANT USE SCHEMA ON TABLE company.finance TO `analysts`;",
    "GRANT SELECT ON TABLE company.finance TO `analysts`;",
], [1, 2],
    "GRANT USE SCHEMA ON SCHEMA company.finance TO `analysts`;\nGRANT SELECT ON TABLE company.finance.transactions TO `analysts`;",
    "USE SCHEMA is granted ON SCHEMA (not ON TABLE), and SELECT needs the full three-level table name — `company.finance` is a schema, not a table.",
    tags=["syntax", "debug"], diff=2)

# =====================================================================
# s04 PERMISSION_DENIED debugging
# =====================================================================
s04 = C.sec(4, "Debugging PERMISSION_DENIED",
            "'Give me admin' is not debugging. Walk the path — and check WHO is really running.")
C.code("sql", "SELECT *\nFROM prod.finance.transactions;\n\n-- Error: PERMISSION_DENIED")
C.compare(
    ("Bad debugging", ["\"Just give me admin\"", "Fixes the symptom, breaks least privilege", "You learn nothing about the cause"]),
    ("Good debugging", ["Walk the access path step by step", "Check the identity that actually runs", "Grant only the missing privilege"]),
)
C.flow(["Workspace access?", "USE CATALOG prod?", "USE SCHEMA finance?", "SELECT on table?", "Row filters / masks / policies?", "Which identity is ACTUALLY running?"],
       caption="The permission-debugging chain")
C.callout("key", "The last question is the critical one",
          "**You** may have SELECT. But the Job may run as `orders-prod-service-principal` — and that identity may not.")
C.ask("Ask yourself when you see PERMISSION_DENIED", [
    "Can this principal access the workspace at all?",
    "Does it have USE CATALOG on the catalog (prod)?",
    "Does it have USE SCHEMA on the schema (finance)?",
    "Does it have SELECT on the table itself?",
    "Are row filters, column masks or other policies limiting it?",
    "Which identity is ACTUALLY running this — me, or a job's service principal?",
])
C.callout("pitfall", "'It works for me' proves nothing", "Your own successful query only proves YOUR identity has the privileges. Always check the run identity of the job.")

C.order("Order the PERMISSION_DENIED checks exactly as taught.", [
    "Can the principal access the workspace?", "Can it USE CATALOG prod?", "Can it USE SCHEMA finance?",
    "Does it have SELECT on the table?", "Are there row filters / masks / policies?", "Which identity is ACTUALLY running?"],
    "Walk from the outside in (workspace → catalog → schema → table → fine-grained policies), and never forget the run identity, which is often the real cause.",
    tags=["debug", "exam"], diff=2, quick=True)
C.tf("If my own SELECT on a table works, a scheduled job that reads the same table cannot get PERMISSION_DENIED.", False,
     "The job may run as a different identity (e.g. a service principal) with different privileges. 'Which identity is actually running?' is the critical check.",
     tags=["pitfall", "debug"], diff=1, quick=True)
C.scenario("`SELECT * FROM prod.finance.transactions` works in your notebook, but the nightly Job fails with `PERMISSION_DENIED`.", [
    ("What do you check first?", [
        ("Which identity the Job actually runs as", True, "Your success proves only your privileges; the job's identity is the prime suspect."),
        ("Ask an admin for ALL PRIVILEGES on prod", False, "That's the 'give me admin' anti-pattern."),
        ("Rewrite the query in Python", False, "Language doesn't change permissions."),
    ]),
    ("It runs as `orders-prod-service-principal`. Which privileges must you verify for it?", [
        ("USE CATALOG on prod, USE SCHEMA on prod.finance, SELECT on the table (plus any row filters/masks)", True, "That's the full path for a read."),
        ("Only SELECT on the table", False, "Without USE CATALOG / USE SCHEMA the read still fails."),
        ("MANAGE on the catalog", False, "Far more than needed — violates least privilege."),
    ]),
    ("It lacks USE SCHEMA on prod.finance. Fix?", [
        ("GRANT USE SCHEMA ON SCHEMA prod.finance TO the service principal", True, "Grant exactly the missing privilege."),
        ("Make the service principal a workspace admin", False, "Huge blast radius for a one-privilege problem."),
        ("Run the job as your own user", False, "Ties production to a person — the exact thing service principals avoid."),
    ]),
], explain="Path + identity: workspace → catalog → schema → table → policies → who is ACTUALLY running.", tags=["debug", "exam"], diff=2)
C.cloze("Complete the permission-debugging chain.", "workspace access → USE [[CATALOG]] → USE [[SCHEMA]] → [[SELECT]] on table → row filters / masks / policies → which [[identity]] is ACTUALLY running?",
        "Outer containers first, then the table, then fine-grained policies, and finally the run identity — the check that most often explains 'works for me, fails in the job'.",
        bank=["ADMIN", "CLUSTER", "MANAGE"], tags=["debug", "exam"], diff=1)
C.mcq("Which response to PERMISSION_DENIED is the 'bad debugging' the lesson warns about?",
      ["Checking USE CATALOG on the catalog", "Checking which identity runs the job", "Asking for admin rights so it 'just works'", "Checking row filters and masks"], 2,
      "Requesting admin hides the cause and breaks least privilege. The other three are steps of the correct debugging chain.",
      tags=["pitfall"], diff=1)
C.free("Explain why 'Which identity is ACTUALLY running?' is the most important PERMISSION_DENIED question.",
       "Because permissions belong to identities. When I test interactively my user identity runs the query, but a scheduled job usually runs as another identity, often a service principal like orders-prod-service-principal. My grants don't apply to it, so the job can fail even though the same query works for me.",
       ["permissions are per identity", "interactive = my user; job = service principal / run-as", "my privileges don't transfer"],
       "This single check explains most 'works for me, fails in the job' permission incidents.",
       tags=["debug", "interview"], diff=2)
C.odd("Which is NOT part of the PERMISSION_DENIED checklist?", ["USE CATALOG on the catalog", "SELECT on the table", "Run identity", "Number of shuffle partitions"], 3,
      "Shuffle partitions affect performance, never permissions. The other three are steps of the permission chain.",
      tags=["debug"], diff=1)

# =====================================================================
# s05 Least privilege
# =====================================================================
s05 = C.sec(5, "Least Privilege",
            "Give exactly what's needed — because every extra privilege is an extra way to break production.")
C.p("**Least privilege**: give only the permissions that are necessary.")
C.p("If an analyst needs `SELECT`, you do **not** give `ALL PRIVILEGES` 'so they can work more easily'.")
C.callout("warn", "Powerful privileges", "Databricks specifically warns to use powerful privileges such as **ALL PRIVILEGES**, **MANAGE** and **ownership** sparingly.")
C.ul(["Violates least privilege", "Increases the **blast radius** (how much damage one mistake or compromised identity can do)",
      "Risk of accidental or destructive actions", "Security exposure"])
C.terms([("Blast radius", "How much can be damaged if one identity makes a mistake or is compromised.")])
C.callout("pitfall", "'Give ALL PRIVILEGES to everybody'", "It makes the error disappear today and creates a much bigger incident tomorrow.")
C.reveal("Think first: an analyst needs to read gold.daily_sales. What exactly do they need?",
         "USE CATALOG on the catalog, USE SCHEMA on the schema, SELECT on the table — nothing more (no MODIFY, no ALL PRIVILEGES, no ownership).")

C.free("Test Q20: Why is 'give ALL PRIVILEGES to everybody' a bad solution to permission errors?",
       "It violates least privilege, increases the blast radius, raises the risk of accidental or destructive actions, and increases security exposure. It also hides the real missing privilege instead of fixing it.",
       ["violates least privilege", "bigger blast radius", "accidental/destructive actions", "security exposure"],
       "Official answer: violates least privilege, increases blast radius, risk of accidental/destructive actions and security exposure.",
       tags=["exam", "interview"], diff=1, quick=True)
C.mcq("An analyst only needs to read one table. Which grant set follows least privilege?",
      ["ALL PRIVILEGES on the catalog", "USE CATALOG + USE SCHEMA + SELECT on the table", "Ownership of the table", "MANAGE on the schema"], 1,
      "Grant exactly the read path. ALL PRIVILEGES, MANAGE and ownership are powerful privileges Databricks says to use sparingly.",
      tags=["exam"], diff=1, quick=True)
C.mcq("Select ALL the consequences of over-granting privileges.", ["Larger blast radius", "Risk of accidental destructive actions", "Higher security exposure", "Faster queries"], [0, 1, 2],
      "Over-granting has only downsides for safety; privileges don't change performance.",
      tags=["pitfall"], diff=1)
C.tf("ALL PRIVILEGES, MANAGE and ownership should be used sparingly.", True,
     "Databricks explicitly warns about these powerful privileges; they should be reserved for the few identities that truly administer objects.",
     tags=["exam"], diff=1)
C.odd("Which grant does NOT fit 'least privilege for a read-only analyst'?", ["USE CATALOG", "USE SCHEMA", "SELECT", "ALL PRIVILEGES"], 3,
      "ALL PRIVILEGES includes writes and more — far beyond read-only needs.",
      tags=["pitfall"], diff=1)

# =====================================================================
# s06 Dev / test / prod
# =====================================================================
s06 = C.sec(6, "Dev → Test/Staging → Prod",
            "Never debug on the CEO's dashboard. Environments let you break things safely.")
C.p("You have `prod.gold.monthly_revenue` feeding the **CEO dashboard**. You want to try `.filter(col(\"country\") != \"GR\")` for debugging. Do you edit the production notebook and press **Run All**? **No.** You want **environment isolation**.")
C.diagram("""
DEV
 │  code changes
 ▼
TEST / STAGING
 │  validation
 ▼
PROD
""")
C.compare(
    ("DEV", ["Developer works here", "May break things, experiment, debug", "Sample data", "e.g. `dev_nikos.silver.orders`"]),
    ("TEST / STAGING", ["Closer to production", "Checks permissions, dependencies, configuration", "Integration, data quality, deployment", "No impact on real consumers"]),
    ("PROD", ["Real workloads run", "Controlled deployments, stable configs", "Monitoring, restricted permissions", "Reproducibility"]),
)
C.flow(["Notebook in browser", "edit production code manually", "Run All"], caption="The big mistake — not a serious deployment model")
C.ask("Questions you CAN'T answer after a manual prod edit", [
    "Which version is running?",
    "Who changed it?",
    "When?",
    "What changed?",
    "How do I go back to the previous version?",
    "Did this same code pass tests?",
])
C.callout("pitfall", "Manual production edits", "You lose reproducibility, controlled review/testing, reliable version history and repeatable deployment.")

C.free("Test Q21: Why shouldn't you edit a production notebook manually?",
       "Because you lose reproducibility, controlled review and testing, reliable version history and repeatable deployment. Afterwards nobody can reliably say which version runs, who changed what and when, how to roll back, or whether that code passed tests.",
       ["reproducibility", "review / testing", "version history", "repeatable deployment / rollback"],
       "Official answer: you lose reproducibility, controlled review/testing, reliable version history and repeatable deployment.",
       tags=["exam", "interview"], diff=1, quick=True)
C.bucket("Which environment is this typical of?", ["DEV", "TEST / STAGING", "PROD"], [
    ("Experimenting with sample data", 0),
    ("Validating permissions, dependencies and configuration before release", 1),
    ("CEO dashboard reads from here", 2),
    ("`dev_nikos.silver.orders`", 0),
    ("Integration and data-quality checks without affecting real consumers", 1),
    ("Restricted permissions, monitoring, stable configs", 2),
    ("It's fine to break things here", 0),
], "DEV = freedom to break; STAGING = production-like validation without real consumers; PROD = controlled, monitored, restricted.",
   tags=["concept"], diff=1, quick=True)
C.order("Order the path a code change should take.", ["DEV (code changes)", "TEST / STAGING (validation)", "PROD"],
        "Changes are developed in DEV, validated in a production-like STAGING environment, and only then reach PROD.",
        tags=["concept"], diff=1)
C.tf("Test/staging is where you validate permissions, dependencies, configuration, integration, data quality and deployment without affecting real consumers.", True,
     "That is exactly the role of staging: be close to prod, but isolated from real consumers.",
     tags=["concept"], diff=1)
C.scenario("The CEO's monthly revenue numbers changed overnight. A colleague says: 'I just tested a filter in the prod notebook and pressed Run All.'", [
    ("What's the first problem you face?", [
        ("You can't reliably tell which version ran, what changed, or how to roll back", True, "Manual edits leave no reliable version history or review trail."),
        ("The cluster is too small", False, "Compute size is not the issue here."),
        ("Unity Catalog is down", False, "Nothing points to governance."),
    ]),
    ("What should the process have been?", [
        ("Change code in DEV, commit to Git, review, test in STAGING, deploy to PROD automatically", True, "Environment isolation + source control + CI/CD."),
        ("Edit prod but warn the CEO first", False, "Still no review, tests or reproducibility."),
        ("Copy the prod notebook and edit the copy in prod", False, "Still running untested code against prod data."),
    ]),
], explain="Production changes must be reproducible, reviewed, tested and reversible.", tags=["debug", "pitfall"], diff=2)
C.order("A manual prod edit broke a dashboard. Order the questions you'd need answered (the lesson's list).", [
    "Which version is running?", "Who changed it?", "When?", "What changed?", "How do I return to the previous version?", "Did the same code pass tests?"],
    "These six questions are exactly what Git + CI/CD answer reliably — and what manual edits make unanswerable.",
    tags=["debug"], diff=2)

# =====================================================================
# s07 Source control
# =====================================================================
s07 = C.sec(7, "Source Control with Git",
            "The source of truth is the repository — not 'that notebook Nikos has in his workspace'.")
C.flow(["developer", "branch", "commit", "pull request", "review", "main"], caption="Typical Git flow")
C.p("The **source of truth** for code becomes the **Git repository** — not *\"that notebook Nikos has in the workspace\"*.")
C.terms([
    ("Branch", "An isolated line of work for one change."),
    ("Commit", "A recorded snapshot of changes with author and time."),
    ("Pull request (PR)", "A request to merge a branch, where the change is reviewed (and tested)."),
    ("main", "The shared branch that represents accepted code."),
])
C.callout("key", "What Git gives you", "Version history, who/what/when for every change, review before merge, and an easy way back to previous versions — the answers to the 'manual edit' questions.")
C.reveal("Think first: which of the six 'manual edit' questions does Git answer?",
         "Which version, who, when, what changed and how to go back. 'Did it pass tests?' needs CI on top of Git.")

C.order("Order the Git flow.", ["developer", "branch", "commit", "pull request", "review", "main"],
        "Work happens on a branch, is recorded in commits, proposed via a pull request, reviewed, and only then merged into main.",
        tags=["concept"], diff=1, quick=True)
C.mcq("What is the source of truth for production code in a mature setup?",
      ["The notebook in Nikos's workspace", "The Git repository", "The latest cluster log", "The CEO dashboard"], 1,
      "Code lives and is versioned in Git; workspaces get their code from it. A personal workspace notebook has no reliable history or review.",
      tags=["concept", "exam"], diff=1, quick=True)
C.match("Match each Git term to its role.", [
    ("branch", "isolated line of work for a change"), ("commit", "recorded snapshot of changes"),
    ("pull request", "proposal to merge, where review happens"), ("main", "shared branch of accepted code")],
    "Together these give versioning, traceability and review before code reaches production.",
    tags=["concept"], diff=1)
C.tf("Using Git alone already guarantees that the code passed tests.", False,
     "Git gives history and review. Automatic testing of each change is CI (Continuous Integration), built on top of Git.",
     tags=["pitfall"], diff=1)

# =====================================================================
# s08 CI & CD
# =====================================================================
s08 = C.sec(8, "CI and CD",
            "Machines check every change (CI) and ship validated changes the same way every time (CD).")
C.p("**CI — Continuous Integration.** You `git push`; the system automatically runs:")
C.flow(["lint", "unit tests", "integration tests", "configuration validation", "build"], caption="A CI pipeline")
C.callout("key", "CI gate", "If anything fails: **don't merge / don't deploy.**")
C.p("**CD** can mean **Continuous Delivery** or **Continuous Deployment** depending on the process. The core idea: validated artifact/code → automated, controlled deployment → target environment.")
C.flow(["main branch", "tests", "deploy staging", "integration tests", "deploy production"], caption="A CD pipeline")
C.compare(
    ("CI", ["Automatic integration / validation / testing of code changes", "Runs on push / PR", "Output: pass/fail + build"]),
    ("CD", ["Controlled delivery/deployment of validated changes", "To staging, then production", "Output: deployed environment"]),
)
C.callout("exam", "Two meanings of CD", "Continuous **Delivery** (ready to deploy, often with an approval) vs Continuous **Deployment** (deployed automatically). Either way: validated code → automated, controlled deployment.")

C.free("Test Q22: What is CI?", "Automatic integration, validation and testing of code changes — e.g. lint, unit tests, integration tests, configuration validation and build on every push; if anything fails, you don't merge or deploy.",
       ["automatic", "integration / validation / testing of code changes", "fail → no merge/deploy"],
       "Official answer: automatic integration/validation/testing of code changes.", tags=["exam"], diff=1, quick=True)
C.free("Test Q23: What is CD?", "Controlled delivery or deployment of validated changes to the target environments, e.g. main → tests → deploy staging → integration tests → deploy production.",
       ["controlled delivery/deployment", "validated changes", "target environments (staging, prod)"],
       "Official answer: controlled delivery/deployment of the validated changes to the target environments.", tags=["exam"], diff=1, quick=True)
C.order("Order the CI pipeline from the lesson.", ["lint", "unit tests", "integration tests", "configuration validation", "build"],
        "Cheap, fast checks first (lint, unit tests), slower ones later (integration, config validation), and build at the end.",
        tags=["concept"], diff=2)
C.order("Order the CD pipeline from the lesson.", ["main branch", "tests", "deploy staging", "integration tests", "deploy production"],
        "Validated code moves to staging, is integration-tested there, and only then is deployed to production.",
        tags=["concept"], diff=2)
C.mcq("CI fails on the integration tests for your pull request. What should happen?", ["Merge anyway and fix in prod", "Do not merge / deploy", "Deploy to prod but not staging", "Disable the failing test"], 1,
      "CI is a gate: a failing check blocks merge and deploy. Disabling tests or 'fixing in prod' defeats its purpose.",
      tags=["pitfall", "exam"], diff=1)
C.tf("CD always means fully automatic deployment to production with no human approval.", False,
     "CD can mean Continuous Delivery or Continuous Deployment depending on the process; the shared idea is automated, controlled deployment of validated code.",
     tags=["exam"], diff=2)
C.bucket("CI or CD?", ["CI", "CD"], [
    ("Run lint and unit tests on every push", 0), ("Deploy to staging after merge to main", 1),
    ("Validate configuration before merge", 0), ("Promote the validated version to production", 1),
    ("Build the artifact", 0)],
    "CI validates the change; CD ships the validated change to environments.", tags=["compare"], diff=1)

# =====================================================================
# s09 IaC & Bundles
# =====================================================================
s09 = C.sec(9, "Infrastructure as Code & Declarative Automation Bundles",
            "If a Job exists only as UI clicks, nobody can review it, version it or recreate it.")
C.p("A Job needs: task A, task B, schedule, compute, parameters, permissions. You *can* create all of it manually in the UI — but in production it's often better to **declare it as code/configuration**.")
C.code("yaml", "job:\n  name: orders_pipeline\n  schedule:\n    ...\n  tasks:\n    - ingest\n    - transform", caption="Conceptual job definition (not real syntax yet)")
C.ul(["Can live in Git", "Can be reviewed", "Has version history", "Can be reproduced", "Can be deployed automatically"])
C.p("This is the philosophy of **Infrastructure as Code / configuration as code**.")
C.callout("exam", "Naming: Declarative Automation Bundles = Databricks Asset Bundles",
          "The tool you'll learn later is called **Declarative Automation Bundles**; it was formerly called **Databricks Asset Bundles**. Tutorials saying 'Asset Bundles' mean the same concept.")
C.p("Databricks recommends bundles as the main approach for CI/CD and IaC-style deployment of Databricks projects. A bundle can describe **jobs, pipelines, source files, tests and target environments**. The central file is usually **`databricks.yml`**.")
C.code("yaml", "targets:\n  dev:\n    mode: development\n  prod:\n    mode: production", caption="databricks.yml targets with the two deployment modes")
C.callout("tip", "Don't memorize yet", "We'll learn bundle syntax line by line in the Bundles chapter. For now: bundle = project + resources + targets, as code.")

C.mcq("Test Q24: What do we gain when a Job's definition lives in YAML/Git instead of only UI clicks? Select ALL that apply.",
      ["Version control", "Review", "Reproducibility", "Automation / repeatable deployments", "Environment-specific configuration", "Faster Spark execution"], [0, 1, 2, 3, 4],
      "Official answer: version control, review, reproducibility, automation, repeatable deployments, environment-specific configuration. Configuration as code doesn't make Spark itself faster.",
      tags=["exam"], diff=1, quick=True)
C.tf("'Databricks Asset Bundles' and 'Declarative Automation Bundles' are two completely different concepts.", False,
     "Declarative Automation Bundles is the current name; Databricks Asset Bundles was the earlier name of the same tool.",
     tags=["exam", "pitfall"], diff=1, quick=True)
C.cloze("Complete the bundle targets in `databricks.yml`.", "targets:\n  dev:\n    mode: [[development]]\n  prod:\n    mode: [[production]]",
        "Databricks explicitly supports `development` and `production` deployment modes for bundle targets.",
        as_code=True, bank=["staging", "debug", "release"], tags=["syntax"], diff=1)
C.write("Write the `targets` section of a `databricks.yml` with a `dev` target in development mode and a `prod` target in production mode.",
        "targets:\n  dev:\n    mode: development\n  prod:\n    mode: production",
        ["targets:", "dev:", "mode: development", "prod:", "mode: production"],
        "Targets are the environments a bundle deploys to; each declares its mode. Exact further syntax comes in the Bundles chapter.",
        lang="yaml", tags=["syntax"], diff=1)
C.spotbug("A teammate summarized bundles. Click the WRONG statements.", [
    "A bundle can describe jobs, pipelines, source files, tests and target environments.",
    "The central configuration file is usually databricks.yml.",
    "Bundles are a different technology from the old Databricks Asset Bundles.",
    "Targets can use the modes development and production.",
    "Bundles are meant only for one-off manual deployments from the UI.",
], [2, 4],
    "Declarative Automation Bundles are the renamed Databricks Asset Bundles (same concept).\nBundles are the recommended basis for CI/CD and IaC-style, automated, repeatable deployments.",
    "Bundles = renamed Asset Bundles, designed for automated CI/CD deployment — the opposite of manual UI clicks.",
    tags=["exam", "pitfall"], diff=2)
C.free("Explain Infrastructure as Code to a teammate who builds all Jobs by clicking in the UI.",
       "Instead of creating the job's tasks, schedule, compute, parameters and permissions by hand, you declare them in a configuration file (e.g. YAML in a bundle). That file lives in Git, gets reviewed, has version history, can recreate the same job anywhere, and can be deployed automatically to dev, staging and prod by CI/CD.",
       ["declare job/infrastructure as code/config", "in Git: review + version history", "reproducible", "automated deployment per environment"],
       "The point isn't YAML itself — it's that configuration gets the same safety net as code.",
       tags=["interview"], diff=2)

# =====================================================================
# s10 Big picture & naming
# =====================================================================
s10 = C.sec(10, "The Whole Platform at a Glance (and 2026 Naming)",
            "One mental model for the entire data-engineering platform — plus a decoder ring for old names.")
C.diagram("""
PostgreSQL
    │  CDC
    ▼
┌──────────────┐
│    BRONZE    │  raw changes
└──────┬───────┘
       │  AUTO CDC · validation · cleaning
       ▼
┌──────────────┐
│    SILVER    │  customers · orders · products
└──────┬───────┘
       │  aggregation
       ▼
┌──────────────┐
│     GOLD     │
└──────────────┘
""", caption="The e-commerce data flow")
C.table(["Concern", "What handles it"], [
    ["Execution", "Lakeflow / Spark → processing"],
    ["Governance", "Unity Catalog → who? what object? what privilege?"],
    ["Development", "Git → DEV → tests → STAGING → PROD"],
    ["Deployment", "Declarative Automation Bundle + CI/CD system"],
    ["Storage", "Delta tables → cloud object storage"],
], caption="Add these layers around the data flow")
C.callout("key", "A correct mental model", "This is already a fairly accurate mental model of the entire Databricks data-engineering platform.")
C.p("**2026 naming:** you'll meet tutorials using different names for the pipeline product:")
C.ul(["Delta Live Tables", "DLT", "Lakeflow Declarative Pipelines", "Spark Declarative Pipelines", "Lakeflow pipelines"])
C.p("In current docs, **Lakeflow pipelines** build on **Apache Spark Declarative Pipelines (SDP)** and support **batch and streaming** pipelines in **SQL/Python**, with **automatic dependency orchestration** and **incremental processing**.")
C.callout("exam", "Old names still matter", "You'll learn today's syntax, but old names remain important for older tutorials, Stack Overflow, older exams and existing production systems.")

C.match("Match each platform concern to what handles it.", [
    ("Execution", "Lakeflow / Spark"), ("Governance", "Unity Catalog"), ("Deployment", "Bundles + CI/CD"),
    ("Storage", "Delta tables on cloud object storage"), ("Development", "Git → DEV → tests → STAGING → PROD")],
    "Keeping these five concerns separate is what makes debugging possible: each failure usually lives in one of them.",
    tags=["concept"], diff=1, quick=True)
C.odd("Which name is NOT a (past or present) name for Databricks' declarative pipeline product?", [
    "Delta Live Tables (DLT)", "Lakeflow Declarative Pipelines", "Spark Declarative Pipelines", "Declarative Automation Bundles"], 3,
    "Bundles are the deployment/IaC tool (formerly Asset Bundles). The other three are names along the DLT → Lakeflow pipelines evolution.",
    tags=["exam", "pitfall"], diff=2, quick=True)
C.mcq("According to current docs, what do Lakeflow pipelines build on?", ["Apache Spark Declarative Pipelines (SDP)", "Apache Kafka Streams", "Databricks Asset Bundles", "Unity Catalog lineage"], 0,
      "Lakeflow pipelines build on Apache Spark Declarative Pipelines and support batch + streaming in SQL/Python with automatic dependency orchestration and incremental processing.",
      tags=["exam"], diff=2)
C.mcq("Which capabilities does the lesson attribute to Lakeflow pipelines? Select ALL.", ["Batch and streaming pipelines", "SQL and Python", "Automatic dependency orchestration", "Incremental processing", "Granting Unity Catalog privileges"], [0, 1, 2, 3],
      "Governance (grants) is Unity Catalog's job, not the pipeline engine's.", tags=["concept"], diff=2)
C.tf("A tutorial about 'Delta Live Tables' is about a totally unrelated product from Lakeflow pipelines.", False,
     "DLT is an older name in the same lineage: DLT → Lakeflow Declarative Pipelines → Lakeflow pipelines on Spark Declarative Pipelines.",
     tags=["exam"], diff=1)
C.bucket("Which layer of the platform does each item belong to?", ["Execution", "Governance", "Deployment", "Storage"], [
    ("Spark / Lakeflow processing", 0), ("GRANT SELECT to analysts", 1), ("databricks.yml targets", 2),
    ("Delta tables on cloud object storage", 3), ("CI/CD system deploying to prod", 2), ("'who / what object / what privilege'", 1)],
    "Execution computes, governance controls access, deployment ships code/config, storage keeps the data.",
    tags=["concept"], diff=1)

# =====================================================================
# s11 Debugging case 1: no new data
# =====================================================================
s11 = C.sec(11, "Debugging Case 1: No New Data Appears",
            "Source has today's data, Gold doesn't. Walk the pipeline — don't blame the platform.")
C.p("Pipeline: **source files → bronze → silver → gold**. The source has today's data. **Gold doesn't.**")
C.callout("warn", "Don't say 'Databricks bug'", "Think in pipeline terms and check each layer in order.")
C.flow(["Source: new files exist?", "Bronze: ingested?", "Checkpoint: advanced?", "Silver: rows rejected?", "Schema: changed?", "CDC: sequence/key correct?", "Gold: refresh/job ran?"],
       caption="The layer-by-layer check")
C.ask("Ask yourself when new data doesn't show up", [
    "Source: do the new files/events really exist?",
    "Bronze: were they ingested?",
    "Checkpoint: did it advance?",
    "Silver: did the transformation reject (filter/quarantine) the rows?",
    "Schema: did it change and block the write?",
    "CDC: are sequence and key correct?",
    "Gold: did the refresh/job actually run?",
])
C.callout("key", "The golden rule of this course",
          "**Find the first layer at which reality diverges from what you expected.** Everything upstream of it is fine; the bug lives at that boundary.")
C.table(["Observation", "Where to debug"], [
    ["Kafka has event 500, Bronze doesn't", "Source → Bronze (ingestion, checkpoint)"],
    ["Bronze has event 500, Silver doesn't", "Bronze → Silver (validation, schema, CDC, dedup)"],
    ["Silver has it, Gold doesn't", "Silver → Gold (aggregation, refresh / job run)"],
])
C.reveal("Think first (test Q25): Kafka → Bronze → Silver → Gold. Kafka has event 500. Bronze has event 500. Silver doesn't. Where do you start?",
         "At the **Bronze → Silver boundary** — you've already proven the event reached Bronze, so source and ingestion are fine.")

C.order("Order the 'no new data' checks exactly as taught.", [
    "Source: do the new files exist?", "Bronze: ingested?", "Checkpoint: advanced?", "Silver: rows rejected by transformation?",
    "Schema: changed?", "CDC: sequence/key correct?", "Gold: refresh/job ran?"],
    "Follow the data from source to Gold. The first check that fails is the layer where reality diverges — that's where the bug lives.",
    tags=["debug", "exam"], diff=2, quick=True)
C.mcq("Test Q25: Kafka has event 500, Bronze has event 500, Silver does not. Where do you start debugging?",
      ["Kafka producer", "Source → Bronze ingestion", "The Bronze → Silver boundary", "The Gold dashboard"], 2,
      "The event is proven to be in Bronze, so everything up to Bronze works. The first divergence is Bronze → Silver (validation, schema, CDC, dedup, filters).",
      why=["Kafka has the event — the producer is fine.", "Bronze has the event — ingestion is fine.", "Correct: first layer where reality diverges.", "Gold is downstream of the problem."],
      tags=["exam", "debug"], diff=2, quick=True)
C.scenario("Source has today's files; Gold shows nothing for today.", [
    ("Where do you start?", [
        ("At the source: confirm the new files really exist", True, "Start at the beginning and walk forward."),
        ("Open a ticket: Databricks bug", False, "Never the first hypothesis."),
        ("Rebuild Gold from scratch", False, "You don't know yet where data stops."),
    ]),
    ("Files exist, but Bronze has no rows for today. What next?", [
        ("Check whether ingestion ran and whether the checkpoint advanced", True, "Data stops at Source → Bronze: ingestion + checkpoint are the suspects."),
        ("Check Silver's dedup logic", False, "Silver can't process rows Bronze never received."),
        ("Check Gold refresh", False, "Too far downstream."),
    ]),
    ("Alternate timeline: Bronze AND Silver have today's rows, Gold doesn't. Suspect?", [
        ("Gold refresh/job didn't run (or its aggregation filtered the rows)", True, "First divergence is Silver → Gold."),
        ("The checkpoint", False, "Ingestion is proven fine — Bronze and Silver have the data."),
        ("Schema at source", False, "Rows already flowed through Silver."),
    ]),
], explain="Find the first layer where reality diverges from expectation.", tags=["debug"], diff=2)
C.scenario("Bronze has today's rows; Silver doesn't. The Silver job ran successfully.", [
    ("Which group of causes lives at the Bronze → Silver boundary?", [
        ("Rows rejected by validation, a schema change, wrong CDC sequence/key", True, "These are exactly the Silver, Schema and CDC checks."),
        ("Source files missing", False, "Bronze already has them."),
        ("Gold refresh schedule", False, "Gold is after Silver."),
    ]),
    ("You find a new quarantine table full of today's rows with 'amount is not DECIMAL'. Meaning?", [
        ("The Silver transformation rejected them — investigate the schema/type change upstream", True, "Rejected rows + type complaint → follow the schema-mismatch decision tree."),
        ("Delete the quarantine table and rerun", False, "That hides the evidence and loses data."),
        ("The checkpoint is broken", False, "Rows were ingested — the checkpoint did its job."),
    ]),
], explain="'Silver: rejected rows?' and 'Schema: changed?' are consecutive checks for a reason.", tags=["debug"], diff=3)
C.tf("When Gold lacks today's data, the efficient approach is to start checking at Gold and work backwards randomly.", False,
     "Walk the pipeline systematically and find the FIRST layer where data diverges from expectation. Starting at the source (or bisecting with evidence like 'Bronze has event 500') prevents guessing.",
     tags=["debug"], diff=1)
C.free("State the course's general debugging principle and apply it to: 'Kafka has event 500, Bronze has it, Silver doesn't'.",
       "Find the first layer at which reality diverges from what you expected. Kafka and Bronze both have event 500, so source and ingestion work; Silver doesn't, so the first divergence is Bronze → Silver — I investigate validation/rejected rows, schema changes and CDC key/sequence there.",
       ["first layer where reality diverges", "Bronze has it → ingestion fine", "debug the Bronze → Silver boundary"],
       "The principle turns a vague 'data is missing' into one specific boundary to inspect.",
       tags=["debug", "interview"], diff=2)

# =====================================================================
# s12 Debugging case 2: duplicates
# =====================================================================
s12 = C.sec(12, "Debugging Case 2: Duplicate Records",
            "'I have duplicates' is a symptom, not a root cause — there are at least seven very different causes.")
C.code("text", "order 123\norder 123", caption="The symptom")
C.table(["Possible cause", "Where it lives / what to check"], [
    ["Source produced a duplicate", "Source: does the source itself contain order 123 twice?"],
    ["File ingested twice", "Source → Bronze: was the same file loaded twice?"],
    ["Checkpoint reset", "Streaming: was the checkpoint deleted/reset/moved?"],
    ["Retry semantics", "Job: did a retry re-write data that was already written?"],
    ["CDC key incorrect", "Silver: is the key really unique per entity?"],
    ["Deduplication missing", "Silver: is there a dedup step at all?"],
    ["MERGE condition incorrect", "Silver/Gold: does the MERGE ON clause match existing rows?"],
], caption="Seven very different root causes")
C.callout("key", "Symptom ≠ root cause", "\"I have duplicates\" is **not** a root cause. It's a symptom. Your job is to find which mechanism created the second copy.")
C.ask("Ask yourself when you see duplicate records", [
    "Does the source itself contain the duplicate?",
    "Was the same file/batch ingested twice into Bronze?",
    "Was a streaming checkpoint reset or moved?",
    "Did a job retry re-write data it had already written?",
    "Is the CDC/business key I use really unique?",
    "Does my Silver logic deduplicate at all?",
    "Is my MERGE condition matching on the right key?",
])
C.code("sql", "-- BUG: matching on a changing column means updates never match\nMERGE INTO silver.orders t\nUSING updates s\nON t.order_id = s.order_id AND t.updated_at = s.updated_at\nWHEN MATCHED THEN UPDATE SET *\nWHEN NOT MATCHED THEN INSERT *;", caption="An incorrect MERGE condition that inserts a second order 123")
C.callout("pitfall", "Deduplicating blindly", "Adding `DISTINCT` everywhere may hide the symptom while the real cause (e.g. a reset checkpoint or wrong MERGE key) keeps producing bad data.")

C.tf("'We have duplicates' is a root cause.", False,
     "It's a symptom. Causes range from the source producing duplicates to a wrong MERGE condition — each needs a different fix.",
     tags=["debug", "pitfall"], diff=1, quick=True)
C.cloze("Complete the key sentence.", "\"I have duplicates\" is not a [[root cause]]. It is a [[symptom]].",
        "Seven different mechanisms can produce the same duplicate symptom; each needs a different fix.",
        bank=["feature", "solution"], tags=["debug"], diff=1)
C.mcq("Which of these is NOT one of the seven duplicate causes listed in the lesson?",
      ["Checkpoint reset", "MERGE condition incorrect", "Too few shuffle partitions", "File ingested twice"], 2,
      "Shuffle partition count affects performance, not row multiplicity. The listed causes: source duplicate, file ingested twice, checkpoint reset, retry semantics, CDC key incorrect, dedup missing, MERGE condition incorrect.",
      tags=["debug", "exam"], diff=1, quick=True)
C.bucket("Where does each duplicate cause live?", ["Source / ingestion", "Streaming / job execution", "Silver logic"], [
    ("Source produced the duplicate", 0), ("Same file ingested twice", 0), ("Checkpoint reset", 1),
    ("Retry re-wrote already written data", 1), ("CDC key not unique", 2), ("No deduplication step", 2), ("Wrong MERGE condition", 2)],
    "Locating the cause by layer tells you where to look first and which fix applies.",
    tags=["debug"], diff=2)
C.scenario("Silver `orders` contains order 123 twice.", [
    ("First question?", [
        ("Does Bronze (the raw source data) already contain order 123 twice?", True, "This splits upstream causes from Silver-logic causes."),
        ("Add SELECT DISTINCT to Gold", False, "Hides the symptom without finding the mechanism."),
        ("Increase cluster size", False, "Duplicates aren't a capacity issue."),
    ]),
    ("Bronze has order 123 twice, from two different files with the same content. Next?", [
        ("Check whether the same file was ingested twice or the checkpoint was reset", True, "Same content in two loads → ingestion/checkpoint suspects."),
        ("Check the Gold refresh", False, "Gold is downstream."),
        ("Check schema evolution", False, "Schema doesn't duplicate rows."),
    ]),
    ("Other timeline: Bronze has order 123 once (an insert) and once more as an update; Silver has 2 rows. Suspect?", [
        ("The MERGE condition or CDC key is wrong, so the update was inserted instead of matched", True, "Update not matched → WHEN NOT MATCHED THEN INSERT → duplicate."),
        ("Source produced a duplicate", False, "The source sent an insert + an update, which is valid."),
        ("Checkpoint reset", False, "Bronze shows no replay."),
    ]),
], explain="Duplicates are a symptom; trace them to the mechanism.", tags=["debug"], diff=2)
C.order("Order a sensible duplicate investigation (upstream first).", [
    "Does the source itself contain the duplicate?", "Was the same file ingested twice into Bronze?",
    "Was the checkpoint reset, or did a retry re-write data?", "Is the CDC/business key correct and unique?",
    "Does Silver deduplicate, and is the MERGE condition right?"],
    "Upstream checks first: if Bronze already holds the duplicate, Silver logic isn't the origin (though missing dedup may fail to remove it).",
    tags=["debug"], diff=2)
C.spotbug("This MERGE keeps creating a second row for order 123 whenever the order is updated. Click the buggy line.", [
    "MERGE INTO silver.orders t",
    "USING updates s",
    "ON t.order_id = s.order_id AND t.updated_at = s.updated_at",
    "WHEN MATCHED THEN UPDATE SET *",
    "WHEN NOT MATCHED THEN INSERT *;",
], [2],
    "ON t.order_id = s.order_id",
    "An update carries a new `updated_at`, so `t.updated_at = s.updated_at` never matches the existing row; it falls into WHEN NOT MATCHED and gets inserted again. Match on the business key only.",
    tags=["debug", "syntax"], diff=3)
C.free("Your manager says: 'Just add DISTINCT and close the duplicates ticket.' Respond professionally.",
       "Duplicates are a symptom, not a root cause. DISTINCT might hide them in one query but the mechanism — e.g. a file ingested twice, a reset checkpoint, a retry, a wrong CDC key or MERGE condition, or missing dedup — will keep producing bad data and affect other consumers. Let me first find where the second copy appears (source, Bronze, Silver) and fix that mechanism; then we add proper dedup in Silver if needed.",
       ["symptom not root cause", "DISTINCT hides the problem", "name possible mechanisms", "find where the duplicate first appears", "fix mechanism / proper Silver dedup"],
       "Good answers redirect from the symptom to the first layer where the duplicate appears.",
       tags=["debug", "interview"], diff=2)

# =====================================================================
# s13 Debugging case 3: dev vs prod
# =====================================================================
s13 = C.sec(13, "Debugging Case 3: Works in Dev, Fails in Prod",
            "Perfect code can still fail — because prod is a different execution environment.")
C.code("text", "DEV   → success\nPROD  → PERMISSION_DENIED")
C.p("The code may be perfect. What can differ between environments:")
C.table(["Group", "What may differ"], [
    ["WHO runs it", "identity"],
    ["WHAT it may touch", "permissions · catalog · schema · storage credential"],
    ["HOW it's configured", "configuration · secret"],
    ["WHERE it runs", "compute · runtime"],
], caption="Nine differences, grouped WHO → WHAT → HOW → WHERE")
C.callout("key", "Not just the traceback", "Production debugging isn't just reading the Python traceback. You must understand the **whole execution environment**.")
C.callout("debug", "Works when I run it, fails when scheduled (test Q26)",
          "One of the first things to check: the **run identity**. You may have the permissions while the scheduled execution identity does not.")
C.ask("Ask yourself when it works in dev but fails in prod", [
    "Which identity runs it in prod — and is it the same one that ran it in dev?",
    "Does that identity have the needed permissions in prod?",
    "Am I pointing at the right catalog and schema for prod (not dev_…)?",
    "Does prod use a storage credential this identity can use?",
    "Is the prod configuration (parameters, paths) different?",
    "Do the secrets exist in prod and can this identity read them?",
    "Is the compute different (type, access mode, size)?",
    "Is the runtime version different?",
])
C.compare(
    ("DEV run", ["You (user identity)", "dev_ catalog/schema", "Your personal config & secrets", "Your interactive compute/runtime"]),
    ("PROD run", ["Service principal / run-as identity", "prod catalog/schema", "Prod config & secrets", "Job compute, possibly another runtime"]),
)
C.callout("pitfall", "Assuming the code is the problem", "When only the environment changed, the code is the least likely suspect. Compare environments before rewriting code.")

C.mcq("Test Q26: A pipeline runs correctly when YOU run it but fails when it runs scheduled. One of the first things to check?",
      ["The Python traceback line numbers", "The run identity of the scheduled execution", "Whether Photon is enabled", "The number of files in Bronze"], 1,
      "You may have the permissions, but the scheduled execution identity (often a service principal) may not. Identity is the classic difference between manual and scheduled runs.",
      tags=["exam", "debug"], diff=1, quick=True)
C.bucket("Group the nine dev-vs-prod differences.", ["WHO", "WHAT it may touch", "HOW it's configured", "WHERE it runs"], [
    ("identity", 0), ("permissions", 1), ("catalog", 1), ("schema", 1), ("storage credential", 1),
    ("configuration", 2), ("secret", 2), ("compute", 3), ("runtime", 3)],
    "WHO → WHAT → HOW → WHERE is a compact way to remember all nine items from the lesson.",
    tags=["debug"], diff=2, quick=True)
C.scenario("A job works in DEV. In PROD it fails with `PERMISSION_DENIED`. The code is identical.", [
    ("What do you check first?", [
        ("The identity running in prod vs dev", True, "WHO first — permissions belong to identities."),
        ("Rewrite the code", False, "Identical code succeeded in dev; the environment differs."),
        ("Upgrade the runtime", False, "PERMISSION_DENIED points at identity/permissions, not runtime."),
    ]),
    ("Prod runs as a service principal. What next?", [
        ("Verify its privileges along the path in the PROD catalog/schema (and storage credential if it touches external storage)", True, "WHAT it may touch in prod."),
        ("Give it ALL PRIVILEGES", False, "Violates least privilege."),
        ("Switch prod to run as your user", False, "Ties production to a person."),
    ]),
    ("Privileges look right. The code reads a table name from a parameter. What else could differ?", [
        ("Configuration: the prod parameter may point at a different catalog/schema (e.g. still dev_…)", True, "HOW it's configured — config, then secrets."),
        ("Shuffle partitions", False, "Performance setting, not a permission cause."),
        ("Nothing else can differ", False, "Config, secrets, compute and runtime can all differ."),
    ]),
], explain="Dev and prod differ in identity, permissions, catalog, schema, storage credential, configuration, secret, compute and runtime.", tags=["debug", "exam"], diff=2)
C.order("Order the dev-vs-prod checks using the WHO → WHAT → HOW → WHERE grouping.", [
    "Identity (who runs it)", "Permissions, catalog, schema, storage credential", "Configuration and secrets", "Compute and runtime"],
    "Start with identity because it changes everything downstream; then what that identity may access; then configuration; finally the compute environment.",
    tags=["debug"], diff=2)
C.scenario("A notebook succeeds when you click Run, but the same notebook as a scheduled Job fails every night.", [
    ("What's one of the first things to check?", [
        ("Under which identity the scheduled run executes", True, "Official answer: run identity."),
        ("Whether the notebook has too many cells", False, "Cell count isn't a failure cause."),
        ("Whether the schedule time is correct", False, "It runs — and fails — so scheduling works."),
    ]),
    ("The job runs as a service principal that lacks SELECT on one table. Fix?", [
        ("Grant that specific privilege (and the USE CATALOG/USE SCHEMA path) to the service principal", True, "Least-privilege fix for the actual gap."),
        ("Change 'Run as' to your own user", False, "Works until you leave or your permissions change."),
        ("Give the service principal MANAGE on the catalog", False, "Far too broad."),
    ]),
], explain="Manual vs scheduled differ mainly in identity.", tags=["debug", "exam"], diff=2)
C.order("Your notebook works manually but fails as a scheduled job. Order the checks.", [
    "Find the job's run identity", "Compare it with the identity used in the manual run",
    "Check that identity's privileges along the catalog → schema → table path", "Grant only the missing privilege", "Re-run the scheduled job"],
    "Identity first, then the privilege path, then a least-privilege fix, then verify.",
    tags=["debug"], diff=2)
C.tf("If code works in dev, a failure in prod must be caused by a bug in the code.", False,
     "The code may be perfect; identity, permissions, catalog, schema, storage credential, configuration, secrets, compute or runtime may differ.",
     tags=["pitfall", "debug"], diff=1)
C.odd("Which one is NOT among the dev-vs-prod differences listed in the lesson?", ["storage credential", "secret", "runtime", "the developer's keyboard layout"], 3,
      "The nine: identity, permissions, catalog, schema, storage credential, configuration, secret, compute, runtime.",
      tags=["debug"], diff=1)

# =====================================================================
# s14 Mindset & what's next
# =====================================================================
s14 = C.sec(14, "The Debugging Mindset & What Comes Next",
            "One rule to carry into every Databricks topic, and the map of where we go next.")
C.callout("key", "One rule for all debugging", "Find the **first layer where reality diverges** from what you expected. Symptoms (missing data, duplicates, PERMISSION_DENIED) are not root causes.")
C.table(["Debugging case", "First move"], [
    ["No new data", "Walk Source → Bronze → checkpoint → Silver → schema → CDC → Gold"],
    ["Duplicates", "Treat as symptom; find where the second copy first appears"],
    ["Works in dev, fails in prod", "Compare environments, starting with identity"],
    ["PERMISSION_DENIED", "Walk workspace → catalog → schema → table → policies → run identity"],
])
C.p("With these prerequisites you can start Databricks itself without memorizing product names you don't understand.")
C.diagram("""
DATABRICKS — PART 1
├── what Databricks really is
├── account vs workspace
├── control plane vs compute plane
├── workspace UI
├── serverless vs classic compute
├── clusters / compute
├── SQL warehouses
├── Databricks Runtime
├── Photon
├── notebooks
├── catalogs / schemas / tables in the UI
├── how a notebook really executes
├── first real exercise
└── debugging failing compute/notebooks/queries
""", caption="Next: Databricks Part 1")
C.flow(["Delta Lake", "Unity Catalog", "Ingestion / Auto Loader", "Lakeflow", "Jobs", "Databricks SQL", "Performance / Spark UI", "Bundles / CI-CD", "Security & projects"],
       caption="The learning path after Part 1 (then production projects and certification drills)")

C.match("Match each symptom to its first move.", [
    ("No new data in Gold", "Walk the layers from the source"),
    ("Duplicate records", "Find where the second copy first appears"),
    ("Works in dev, fails in prod", "Compare environments, starting with identity"),
    ("PERMISSION_DENIED", "Walk the privilege path, then check run identity")],
    "All four apply the same principle: find the first point where reality diverges from expectation.",
    tags=["debug"], diff=1, quick=True)
C.tf("Every symptom (missing data, duplicates, PERMISSION_DENIED) is itself a root cause you can fix directly.", False,
     "They are symptoms. The course's rule: find the first layer where reality diverges, and the mechanism there is the root cause.",
     tags=["debug"], diff=1, quick=True)
C.order("Order the learning path that follows the prerequisites.", ["Databricks Part 1 (platform, compute, notebooks)", "Delta Lake", "Unity Catalog", "Ingestion / Auto Loader", "Lakeflow", "Jobs", "Databricks SQL", "Performance / Spark UI"],
        "The roadmap goes from the platform itself to storage (Delta), governance (UC), ingestion, pipelines, orchestration, SQL, performance and then Bundles/CI-CD, security, production projects and certification drills.",
        tags=["concept"], diff=2)
C.mcq("Which topic is part of 'Databricks — Part 1' in the roadmap?", ["Control plane vs compute plane", "AUTO CDC syntax", "Bundle targets", "Row filters and masks"], 0,
      "Part 1 covers the platform basics: account vs workspace, control vs compute plane, compute types, SQL warehouses, Runtime, Photon, notebooks and first debugging.",
      tags=["concept"], diff=1)

# =====================================================================
# Debug playbooks
# =====================================================================
C.playbook(1, "PERMISSION_DENIED on SELECT", s04,
    "`SELECT * FROM prod.finance.transactions` fails with `PERMISSION_DENIED`.",
    ["Can this principal access the workspace at all?",
     "Does it have USE CATALOG on prod?",
     "Does it have USE SCHEMA on prod.finance?",
     "Does it have SELECT on the table?",
     "Are row filters, column masks or other policies in play?",
     "Which identity is ACTUALLY running this — me or a job's service principal?"],
    [("Identify the executing identity (user vs job run-as / service principal)", "Your privileges don't transfer to other identities."),
     ("Check the privilege path for that identity", "USE CATALOG → USE SCHEMA → SELECT.",
      "SHOW GRANTS ON CATALOG prod;\nSHOW GRANTS ON SCHEMA prod.finance;\nSHOW GRANTS ON TABLE prod.finance.transactions;"),
     ("Check fine-grained policies (row filters / masks)", "They can restrict even with SELECT."),
     ("Grant only the missing privilege, ideally to a group or the service principal", "Least privilege — never 'give me admin'.")],
    ["Missing USE CATALOG / USE SCHEMA", "Missing SELECT", "Job runs as a different identity without grants", "Policies (row filters/masks)"],
    "Grant exactly the missing privilege to the identity that actually runs the workload.",
    mnemonic="Workspace → Catalog → Schema → Table → Policies → WHO? (W-C-S-T-P-Who)")
C.playbook(2, "No new data appears in Gold", s11,
    "The source has today's data, but Gold doesn't.",
    ["Source: do the new files/events really exist?",
     "Bronze: were they ingested?",
     "Checkpoint: did it advance?",
     "Silver: did the transformation reject the rows?",
     "Schema: did it change?",
     "CDC: are sequence and key correct?",
     "Gold: did the refresh/job run?"],
    [("Confirm new data at the source", "Rules out 'nothing arrived'."),
     ("Count today's rows in Bronze", "Splits ingestion problems from transformation problems."),
     ("Inspect the stream checkpoint progress", "A stuck checkpoint means nothing new is read."),
     ("Look for rejected/quarantined rows and schema errors in Silver", "Validation or schema mismatch can drop the rows."),
     ("Verify CDC sequence/key logic", "Wrong ordering or keys can hide changes."),
     ("Check the Gold job/refresh run history", "Maybe Gold simply didn't refresh.")],
    ["Files never arrived", "Ingestion didn't run", "Checkpoint stuck", "Rows rejected by validation", "Schema change blocked writes", "CDC key/sequence wrong", "Gold refresh/job didn't run"],
    "Fix the first layer where reality diverges, then let the downstream layers catch up (or rerun them).",
    mnemonic="Source · Bronze · Checkpoint · Silver · Schema · CDC · Gold — 'Some Big Cats Sleep Soundly Chasing Geese'")
C.playbook(3, "Duplicate records", s12,
    "The same record appears twice (e.g. order 123 twice) in Silver or Gold.",
    ["Does the source itself contain the duplicate?",
     "Was the same file ingested twice?",
     "Was a checkpoint reset?",
     "Did a retry re-write data already written?",
     "Is the CDC key correct and unique?",
     "Is deduplication missing?",
     "Is the MERGE condition correct?"],
    [("Find the first layer where the duplicate appears (source, Bronze, Silver)", "Separates upstream from logic causes."),
     ("For Bronze duplicates: check ingestion history and checkpoint", "File-twice or reset checkpoint."),
     ("Check job run history for retries", "Non-idempotent writes duplicate data on retry."),
     ("Review CDC key, dedup step and MERGE ON clause", "Logic causes in Silver.", "MERGE INTO silver.orders t\nUSING updates s\nON t.order_id = s.order_id\n...")],
    ["Source produced duplicate", "File ingested twice", "Checkpoint reset", "Retry semantics", "CDC key incorrect", "Deduplication missing", "MERGE condition incorrect"],
    "Fix the mechanism that created the second copy, then clean existing duplicates (e.g. dedup in Silver). Never just hide them with DISTINCT.",
    mnemonic="'Some Files Can Repeat; Keys, Dedup, MERGE' (S-F-C-R-K-D-M)")
C.playbook(4, "Works in dev, fails in prod", s13,
    "DEV: success. PROD: PERMISSION_DENIED (or another failure) with identical code.",
    ["Which identity runs it in prod, and is it the same as in dev?",
     "Does that identity have the needed permissions in prod?",
     "Am I using the right prod catalog?",
     "Am I using the right prod schema?",
     "Is there a storage credential this identity can use?",
     "Is the prod configuration different?",
     "Do the needed secrets exist in prod?",
     "Is the compute different?",
     "Is the runtime different?"],
    [("Compare run identity between dev and prod", "Most common difference."),
     ("Check privileges and object names in prod", "Catalog/schema names and grants differ per environment."),
     ("Diff configuration and secrets between targets", "Parameters, paths, credentials."),
     ("Compare compute type and runtime version", "Behaviour can differ by environment.")],
    ["Different identity", "Missing permissions", "Wrong catalog/schema", "Missing storage credential", "Different configuration", "Missing secret", "Different compute", "Different runtime"],
    "Make environments differ only in deliberate, declared ways (bundle targets), and grant the prod identity exactly what it needs.",
    mnemonic="WHO → WHAT → HOW → WHERE (identity → permissions/catalog/schema/credential → config/secret → compute/runtime)")
C.playbook(5, "Works when I run it, fails when scheduled", s13,
    "A pipeline succeeds when run manually but fails when the scheduled job runs it.",
    ["Which identity does the scheduled run use?",
     "Is it the same identity as my manual run?",
     "Does the scheduled identity have USE CATALOG, USE SCHEMA and SELECT/MODIFY where needed?",
     "Does it differ in configuration, secrets or compute from my manual run?"],
    [("Open the job settings and read the run-as identity", "Manual runs use you; scheduled runs may not."),
     ("Check that identity's grants along the path", "Find the specific missing privilege."),
     ("Grant the minimal privilege and re-run", "Least privilege.")],
    ["Scheduled identity lacks privileges", "Job configured with different parameters/secrets"],
    "Check run identity first; grant the scheduled identity exactly what it needs.",
    mnemonic="Me ≠ the job.")
C.playbook(6, "Nobody knows what is running in production", s06,
    "Prod output changed overnight; someone edited the production notebook manually and pressed Run All.",
    ["Which version is running?",
     "Who changed it?",
     "When?",
     "What changed?",
     "How do I return to the previous version?",
     "Did this same code pass tests?"],
    [("Try to reconstruct the change from notebook history / colleagues", "Without Git, evidence is weak."),
     ("Restore known-good code", "Stop the damage."),
     ("Move the code into Git with review, CI and CD via bundles", "Make the six questions answerable next time.")],
    ["Manual edits in production", "No source control", "No CI/CD or environment isolation"],
    "Dev → staging → prod with Git, CI and CD (bundles). Never edit production by hand.",
    mnemonic="Which · Who · When · What · Way back · Tested? (6 Ws)")

# =====================================================================
# Pitfalls
# =====================================================================
for t, x, f in [
    ("Confusing authentication with authorization", "PERMISSION_DENIED after login is about permissions, not identity proof.", "Ask: who are you? vs what may you do?"),
    ("Granting to individuals", "Per-user grants become unmanageable.", "Grant to groups and manage membership."),
    ("Production jobs running as a person", "When the person leaves or changes role, prod breaks.", "Use a service principal."),
    ("SELECT without USE CATALOG / USE SCHEMA", "Access passes through the catalog/schema hierarchy.", "Grant the whole path."),
    ("'Give me admin' debugging", "Hides the cause and violates least privilege.", "Walk the privilege path and check run identity."),
    ("'It works for me'", "Your identity's privileges don't apply to the job's identity.", "Check which identity is ACTUALLY running."),
    ("ALL PRIVILEGES for everybody", "Larger blast radius, accidental/destructive actions, security exposure.", "Least privilege; use ALL PRIVILEGES/MANAGE/ownership sparingly."),
    ("Editing production notebooks manually", "No reproducibility, review, version history or repeatable deployment.", "Dev → staging → prod via Git + CI/CD."),
    ("Treating a workspace notebook as source of truth", "No reliable history or review.", "The Git repository is the source of truth."),
    ("Merging despite failing CI", "Untested code reaches prod.", "CI failure blocks merge/deploy."),
    ("Thinking Asset Bundles and Declarative Automation Bundles differ", "It's a rename.", "Same tool, new name."),
    ("Thinking DLT is unrelated to Lakeflow pipelines", "Old names persist in tutorials, exams and prod systems.", "Map DLT → Lakeflow Declarative Pipelines → Lakeflow pipelines (SDP)."),
    ("Blaming 'a Databricks bug'", "Skips systematic debugging.", "Find the first layer where reality diverges."),
    ("Treating duplicates as a root cause", "DISTINCT hides the mechanism.", "Trace the second copy to one of the seven causes."),
    ("Assuming dev success means prod code bug", "Environments differ in nine ways.", "Compare WHO → WHAT → HOW → WHERE."),
]:
    C.pitfall(t, x, f)

# =====================================================================
# Flashcards
# =====================================================================
for q, a, s in [
    ("Authentication vs authorization?", "Authentication: who are you? Authorization: what are you allowed to do?", s01),
    ("What is a principal?", "An identity privileges can be granted to: user, group or service principal.", s02),
    ("User / group / service principal examples?", "nikos@company.com / data_engineers / orders-etl-prod", s02),
    ("Why grant to groups?", "Manage access via membership instead of many per-user grants (Databricks recommendation).", s02),
    ("Why service principals for prod jobs?", "Stable machine identity independent of an employee's lifecycle and permissions.", s02),
    ("Securable object?", "A governed object permissions can be granted on (catalog, schema, table, volume, function…).", s03),
    ("Privilege?", "An action a principal may perform on a securable object.", s03),
    ("Parse GRANT SELECT ON TABLE t TO `analysts`.", "GRANT = give · SELECT = read privilege · ON TABLE t = securable · TO analysts = principal.", s03),
    ("Privileges needed to read company.finance.transactions?", "USE CATALOG on company, USE SCHEMA on company.finance, SELECT on the table.", s03),
    ("SELECT on table but no USE CATALOG — problem?", "Yes, access passes through the catalog/schema hierarchy.", s03),
    ("PERMISSION_DENIED checklist?", "Workspace → USE CATALOG → USE SCHEMA → SELECT → row filters/masks/policies → which identity is ACTUALLY running?", s04),
    ("Least privilege?", "Give only the permissions that are necessary.", s05),
    ("Privileges to use sparingly?", "ALL PRIVILEGES, MANAGE, ownership.", s05),
    ("Why not ALL PRIVILEGES for everyone?", "Violates least privilege, bigger blast radius, accidental/destructive actions, security exposure.", s05),
    ("Role of TEST/STAGING?", "Production-like validation of permissions, dependencies, config, integration, data quality, deployment — without real consumers.", s06),
    ("Six questions a manual prod edit can't answer?", "Which version? Who? When? What changed? How to go back? Did it pass tests?", s06),
    ("Git flow?", "developer → branch → commit → pull request → review → main.", s07),
    ("Source of truth for code?", "The Git repository — not a notebook in someone's workspace.", s07),
    ("CI?", "Automatic integration/validation/testing on push: lint → unit → integration → config validation → build; fail = no merge/deploy.", s08),
    ("CD?", "Controlled delivery/deployment of validated changes: main → tests → staging → integration tests → prod.", s08),
    ("Benefits of Job config in YAML/Git?", "Version control, review, reproducibility, automation, repeatable deployments, env-specific config.", s09),
    ("Declarative Automation Bundles — old name?", "Databricks Asset Bundles. Central file: databricks.yml.", s09),
    ("Bundle deployment modes?", "development and production (e.g. targets dev / prod).", s09),
    ("Old names of Lakeflow pipelines?", "Delta Live Tables (DLT), Lakeflow Declarative Pipelines; built on Apache Spark Declarative Pipelines (SDP).", s10),
    ("No new data in Gold — check order?", "Source → Bronze → checkpoint → Silver rejects → schema → CDC → Gold refresh.", s11),
    ("Course-wide debugging rule?", "Find the first layer where reality diverges from expectation.", s11),
    ("Kafka & Bronze have event 500, Silver doesn't → ?", "Debug the Bronze → Silver boundary.", s11),
    ("Seven duplicate causes?", "Source duplicate, file ingested twice, checkpoint reset, retry semantics, CDC key incorrect, dedup missing, MERGE condition incorrect.", s12),
    ("Nine dev-vs-prod differences?", "identity, permissions, catalog, schema, storage credential, configuration, secret, compute, runtime.", s13),
    ("Works manually, fails scheduled → first check?", "The scheduled run identity.", s13),
]:
    C.card(q, a, s)

C.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch03.json"))
