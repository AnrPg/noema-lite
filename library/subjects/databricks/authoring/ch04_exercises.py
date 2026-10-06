# Exercises for ch04
EX = []
def S(n): return "ch04-s%02d" % n
def X(type, sec, diff, tags, q, quick=False, **kw):
    e = {"id": "ch04-e%03d" % (len(EX) + 1), "type": type, "section": S(sec), "difficulty": diff,
         "tags": tags, "quick": quick, "q": q}
    e.update(kw)
    EX.append(e)

def opt(text, ok, fb): return {"text": text, "ok": ok, "fb": fb}

# ======================= s01 What Databricks is
X("mcq", 1, 1, ["concept", "exam"], "Source Exercise 1 — which statement is correct?", True,
  options=["Databricks and Spark are synonyms.",
           "Spark is one of the core execution technologies inside Databricks.",
           "Databricks is a file format.",
           "Spark is a cloud provider."],
  answer=1,
  why=["Databricks is a whole platform (UI, governance, SQL, orchestration…); Spark is one engine inside it.",
       "Correct: Spark remains the central execution technology inside the platform.",
       "Delta is the table format; Databricks is a platform.",
       "AWS/Azure/GCP are cloud providers; Spark is an execution engine."],
  explain="Spark is an **execution engine**; Databricks is a **data/AI platform** that uses Spark (and Photon) to execute work. The tempting option A is the historical 'managed Spark' view, which is now an oversimplification.")
X("tf", 1, 1, ["pitfall", "concept"], "\"Databricks = managed Spark\" is an accurate description of today's Databricks platform.", True,
  answer=False,
  explain="Historically this was close; today it is the **most dangerous oversimplification**. Databricks also includes Delta Lake, Unity Catalog, SQL warehouses, Lakeflow, serverless compute, Photon, ML/AI services, orchestration and DevOps tooling — Spark is just the core execution technology.")
X("match", 1, 1, ["concept"], "Match each platform component to its role.",
  pairs=[["Delta Lake", "Table format"], ["Unity Catalog", "Governance of data & AI assets"],
         ["SQL warehouse", "Compute for SQL analytics"], ["Photon", "Vectorized query engine"],
         ["Lakeflow", "Pipelines / ingestion"]],
  explain="These are the pieces that make Databricks a **platform** rather than 'just Spark'. Keeping each in its own bucket (format, governance, compute, engine, pipelines) is the whole point of this chapter.")
X("odd", 1, 2, ["concept", "compare"], "Which one doesn't belong?",
  options=["Apache Spark", "Photon", "SQL warehouse", "Unity Catalog"], answer=3,
  explain="Spark and Photon are execution engines and a SQL warehouse is compute — all three **execute** work. **Unity Catalog** governs assets (names, metadata, permissions); it doesn't run queries.")
X("free", 1, 2, ["interview", "concept"], "In your own words: why is \"Databricks is just managed Spark\" an oversimplification, and what role does Spark still play?",
  model="Spark is still the central execution engine, but Databricks today is a unified data/AI platform: it adds Delta Lake (table format), Unity Catalog (governance), SQL warehouses (SQL compute), Lakeflow (pipelines), serverless compute, Photon (vectorized engine), ML/AI services, orchestration and DevOps tooling. So Spark is one technology inside the platform, not the platform itself.",
  rubric=["Spark = execution engine still central", "Databricks = unified platform (engineering, analytics, AI, governance, deployment)",
          "Names at least 3 non-Spark components (Delta, UC, SQL warehouses, Photon, Lakeflow, serverless…)"],
  explain="A strong answer contrasts **engine** vs **platform** and lists concrete components beyond Spark.")

# ======================= s02 Account vs Workspace
X("bucket", 2, 1, ["concept", "exam"], "Source Exercise 2 (extended) — where does each operation most likely happen?", True,
  buckets=["Account level", "Workspace"],
  items=[{"text": "Create a notebook", "bucket": 1}, {"text": "Create an organization-wide identity", "bucket": 0},
         {"text": "Run a Spark query", "bucket": 1}, {"text": "Create a second workspace", "bucket": 0},
         {"text": "Configure SSO", "bucket": 0}, {"text": "Manage billing", "bucket": 0},
         {"text": "Open Catalog Explorer", "bucket": 1}, {"text": "Add an account group", "bucket": 0},
         {"text": "Schedule a job", "bucket": 1}],
  explain="The **account** is the org-level boundary: identities, billing, policies, UC metastores, workspace creation. The **workspace** is where daily work happens: notebooks, jobs, queries, Catalog Explorer — and a Spark query is a workspace workload executed on compute.")
X("mcq", 2, 1, ["exam", "concept"], "Test Q1 — which is the higher organizational object?", True,
  options=["Workspace", "Account", "Notebook", "Compute"], answer=1,
  why=["A workspace lives inside an account.", "Correct: one account can contain many workspaces.",
       "A notebook lives inside a workspace.", "Compute is execution infrastructure used from a workspace."],
  explain="The **account** sits at the top; it contains workspaces. The trap is thinking the workspace (what you see every day) is the top level.")
X("tf", 2, 1, ["concept"], "A single Databricks account can contain multiple workspaces.",
  answer=True,
  explain="Yes — e.g. ACME's one account can hold `analytics-prod`, `engineering-dev` and `research`. The reverse (one workspace containing accounts) is never true.")
X("mcq", 2, 2, ["concept"], "ACME's Databricks setup shows `analytics-prod`, `engineering-dev` and `research` under one account. What are they?",
  options=["Three accounts", "Three workspaces in one account", "Three catalogs in one metastore", "Three clusters"], answer=1,
  why=["There is one account (the org boundary).", "Correct: environments where teams and workloads operate.",
       "Catalogs are data namespaces, not team environments.", "Clusters are compute, not environments."],
  explain="Separate team/environment spaces like prod/dev/research are typically **workspaces** under a single **account**. Catalogs are data namespaces and clusters are compute — different layers.")
X("cloze", 2, 1, ["concept"], "Fill in the levels.",
  text="The [[account]] is the organization-level boundary where you manage identities, billing and workspaces. The [[workspace]] is the collaboration environment containing notebooks, jobs, dashboards and Catalog Explorer.",
  bank=["catalog", "cluster", "metastore"],
  explain="Account = org-wide administration; workspace = where users work. Catalog, cluster and metastore belong to other layers (data namespace, compute, UC configuration).")
X("tf", 2, 2, ["pitfall"], "The analogy \"Azure tenant ≈ Databricks account, workspace ≈ a specific team environment\" is an exact one-to-one mapping.",
  answer=False,
  explain="The source explicitly says it is **not** an exact mapping — just a useful mental model for the org-wide vs environment-level distinction.")

# ======================= s03 Control vs compute plane
X("bucket", 3, 1, ["concept", "exam"], "Sort each item into the plane it belongs to.", True,
  buckets=["Control plane", "Compute plane"],
  items=[{"text": "Web UI", "bucket": 0}, {"text": "APIs", "bucket": 0}, {"text": "Workspace metadata", "bucket": 0},
         {"text": "Job orchestration metadata", "bucket": 0}, {"text": "Spark transformations", "bucket": 1},
         {"text": "SQL execution", "bucket": 1}, {"text": "Joins and aggregations", "bucket": 1},
         {"text": "ML computation", "bucket": 1}, {"text": "Platform configuration", "bucket": 0}],
  explain="The **control plane** 'manages and coordinates' (UI, APIs, metadata, configuration). The **compute plane** does the actual data processing (Spark, SQL, joins, ML).")
X("mcq", 3, 1, ["exam"], "Test Q2 — where does the real data processing happen?", True,
  options=["In the control plane", "In the compute plane", "In your browser", "In Unity Catalog"], answer=1,
  why=["The control plane coordinates; it doesn't run the Spark workload.", "Correct.",
       "The browser only shows the UI.", "UC governs; it doesn't process data."],
  explain="Data processing (transformations, SQL, joins, aggregations, ML) runs on compute resources in the **compute plane**.")
X("mcq", 3, 1, ["exam"], "Test Q3 — the Databricks web UI conceptually belongs to…",
  options=["the control plane", "the compute plane", "the storage layer"], answer=0,
  explain="The web application lives in the **control plane**, together with APIs, metadata and orchestration. The compute plane is where data is processed.")
X("tf", 3, 1, ["pitfall"], "When you run `df.groupBy(\"country\").sum(\"amount\").show()` in a notebook, your browser performs the aggregation.",
  answer=False,
  explain="The browser only sends the command. The control plane coordinates, and the **compute plane** (driver + workers, Spark/Photon) executes the groupBy against storage.")
X("order", 3, 2, ["concept"], "Order the path of a notebook command from your keyboard to the data.",
  items=["Browser", "Databricks control services (schedule/coordinate)", "Compute plane: driver / Spark session",
         "Workers run Spark/Photon execution", "Data storage"],
  explain="Browser → control plane coordinates → compute plane executes (driver plans, workers run tasks) → data is read from/written to storage.")
X("mcq", 3, 3, ["exam", "interview"], "Test Q21 (hard) — `Browser → Databricks UI → Spark query → ADLS`. Which two planes take part, and how?",
  options=["Control plane for UI/coordination; compute plane for the Spark computation",
           "Compute plane for the UI; control plane for the Spark computation",
           "Only the control plane — ADLS is part of it",
           "Only the compute plane — the UI runs on the driver"], answer=0,
  why=["Correct.", "Exactly reversed.", "ADLS is storage; the Spark computation still needs the compute plane.",
       "The UI is a control-plane web app, not something running on the driver."],
  explain="UI and platform coordination = **control plane**; Spark computation = **compute plane**, which then reads data in ADLS storage.")

# ======================= s04 Classic vs Serverless
X("mcq", 4, 1, ["concept", "exam"], "Source Exercise 3 — interactive Python notebook with `spark.read.table(...)`, DataFrame transformations and SQL; no special infrastructure requirement. What does Databricks generally recommend today?", True,
  options=["Classic all-purpose compute", "Serverless compute (if available and the workload is supported)",
           "A SQL warehouse", "Classic jobs compute"], answer=1,
  why=["Fine but not the default recommendation without special needs.", "Correct.",
       "SQL warehouses serve SQL/BI, not Python notebooks.", "Jobs compute is for automated jobs, not interactive work."],
  explain="Databricks recommends **serverless** for most interactive and automated workloads when available and supported. Classic is for special requirements (R, RDDs, custom config).")
X("tf", 4, 1, ["pitfall", "exam"], "Test Q4 — \"Serverless\" means there are no servers involved.", True,
  answer=False,
  explain="There are still CPUs, RAM and machines. Serverless means **Databricks manages** the provisioning/infrastructure for you — the abstraction boundary moved.")
X("mcq", 4, 2, ["exam", "compare"], "Test Q5 — valid reasons to choose classic instead of serverless (select all).",
  options=["You need R", "You use Spark RDD APIs", "Custom infrastructure/network/runtime requirements",
           "Serverless cannot run SQL", "Classic is always faster"], answer=[0, 1, 2], multi=True,
  why=["Correct: serverless doesn't support R today.", "Correct: no RDD APIs on serverless (Spark Connect based).",
       "Correct: classic gives custom configuration.", "False: serverless runs SQL fine.", "False: no such rule."],
  explain="Choose classic when you need capabilities/config serverless lacks: **R**, **RDD APIs**, or custom infra/network/runtime needs. 'Serverless = good, classic = useless' is wrong both ways.")
X("spotbug", 4, 2, ["pitfall", "debug"], "This notebook runs on **serverless** compute. Which line should you not expect to work?",
  lines=['df = spark.read.table("prod.sales.orders")',
         "rdd = spark.sparkContext.parallelize([1, 2, 3])",
         'big = df.filter(df.amount > 100)',
         "display(big)"],
  bugs=[1],
  fix="Use the DataFrame API instead (e.g. `spark.createDataFrame([(1,),(2,),(3,)], [\"n\"])`) or run the notebook on classic compute if RDDs are truly required.",
  explain="Serverless is built on **Spark Connect** and does **not support RDD APIs** (`sparkContext`). DataFrame reads, filters and `display` are fine.")
X("bucket", 4, 1, ["compare"], "Serverless or classic? Sort each characteristic.",
  buckets=["Serverless", "Classic"],
  items=[{"text": "Less infrastructure to manage", "bucket": 0}, {"text": "Fast provisioning", "bucket": 0},
         {"text": "Automatic scaling", "bucket": 0}, {"text": "You pick driver/worker VM types", "bucket": 1},
         {"text": "Custom network/runtime needs", "bucket": 1}, {"text": "Supports RDD APIs and R", "bucket": 1},
         {"text": "More operational responsibility", "bucket": 1}, {"text": "Platform optimizations handled for you", "bucket": 0}],
  explain="The trade-off: serverless = less to manage, fast, auto-scaling; classic = more control and custom config, but more responsibility.")
X("tf", 4, 1, ["concept"], "On AWS, classic compute resources (driver and worker VMs) live in the customer's AWS account.",
  answer=True,
  explain="Yes — with classic compute the VMs run in **your** cloud environment (similar architectures exist on Azure and GCP). With serverless, Databricks manages the compute.")
X("scenario", 4, 2, ["debug", "pitfall"], "A colleague moves an old Spark notebook to a new serverless notebook. A cell fails at `spark.sparkContext.parallelize(...)`.",
  steps=[
    {"prompt": "What do you suspect first?",
     "options": [opt("The serverless limitation: no RDD APIs", True, "Right — serverless is Spark Connect-based and doesn't support RDD APIs."),
                 opt("The cluster is too small", False, "Size doesn't make an unsupported API appear."),
                 opt("The table doesn't exist", False, "There is no table read on this line."),
                 opt("Photon is disabled", False, "Photon has nothing to do with RDD API availability.")]},
    {"prompt": "What's the best fix?",
     "options": [opt("Rewrite with the DataFrame API, or run on classic compute if RDDs are truly needed", True, "Both are valid; DataFrames keep you on the recommended serverless path."),
                 opt("Add %pip install pyspark", False, "The library is there; the API isn't supported on serverless."),
                 opt("Switch to a SQL warehouse", False, "SQL warehouses run SQL, not Python RDD code."),
                 opt("Retry the cell a few times", False, "It's not transient — it's an unsupported API.")]}],
  explain="Serverless doesn't support R or RDD APIs. Either modernize to DataFrames or pick classic compute.")
X("odd", 4, 2, ["pitfall", "exam"], "Which one is NOT a current serverless limitation?",
  options=["R language", "Spark RDD APIs", "`spark.sparkContext.parallelize(...)`", "DataFrame `groupBy().agg()`"], answer=3,
  explain="R and RDD APIs (including `sparkContext.parallelize`) aren't supported on serverless. **DataFrame** operations are exactly what serverless (Spark Connect) supports.")
X("order", 4, 2, ["debug"], "Order the steps to handle legacy code failing on serverless.",
  items=["Identify the failing line (e.g. uses sparkContext / RDD or R)",
         "Confirm the notebook is running on serverless compute",
         "Decide: rewrite with DataFrame API, or move to classic compute",
         "Re-run and verify results"],
  explain="Locate the failing construct, confirm the compute type, then choose between modernizing the code and choosing classic compute.")
X("tf", 4, 1, ["concept"], "Today's UI and docs mostly say \"compute\" where older tutorials said \"cluster\", but classic Spark compute still has a driver and workers.",
  answer=True,
  explain="'Compute' is the broader modern term. Classic compute still follows driver → workers, and job → stage → task → partition logic applies.")

# ======================= s05 Compute types
X("match", 5, 1, ["concept", "exam"], "Compute-selection mental model — match the workload to the generally preferred compute.", True,
  pairs=[["Interactive Python/DataFrames", "Serverless notebook compute"],
         ["Interactive SQL / BI (Power BI)", "Serverless SQL warehouse"],
         ["Automated Python/SQL job", "Serverless jobs compute"],
         ["Needs RDD APIs or R", "Classic compute"]],
  explain="This is the current Databricks recommendation pattern: serverless where possible, the SQL warehouse for SQL/BI, and classic when you need unsupported features or custom config.")
X("tf", 5, 1, ["pitfall", "exam"], "A SQL warehouse is where your tables' data is physically stored.", True,
  answer=False,
  explain="Classic exam/interview trap. A SQL warehouse is **compute** that executes queries; tables keep their own storage layer (Delta files in cloud storage).")
X("mcq", 5, 1, ["exam"], "Test Q7 — which compute would you typically use for Power BI SQL queries?",
  options=["Serverless SQL warehouse", "Classic all-purpose compute", "Serverless notebook compute", "Classic jobs compute"], answer=0,
  explain="BI tools send SQL to a **SQL warehouse** — usually **serverless** when available. Notebook/all-purpose compute is for programmatic work.")
X("mcq", 5, 1, ["exam"], "Test Q8 — what is a SQL warehouse?",
  options=["Compute optimized for SQL workloads", "The physical storage of tables", "A schema inside a catalog", "A BI dashboard"], answer=0,
  why=["Correct.", "Storage is a separate layer.", "That's a schema (namespace).", "Dashboards *use* a warehouse."],
  explain="A SQL warehouse is **SQL-optimized compute** used by the SQL editor, dashboards and BI tools — not storage.")
X("mcq", 5, 2, ["concept"], "Which is NOT a SQL warehouse type?",
  options=["Serverless", "Pro", "Classic", "Photon"], answer=3,
  explain="Warehouse types are **Serverless, Pro, Classic** (plus Lakehouse Real-Time in Beta for low-latency/high-concurrency). **Photon** is an execution engine that runs inside warehouses.")
X("tf", 5, 2, ["pitfall"], "Databricks' first recommendation for automated jobs is classic all-purpose compute.",
  answer=False,
  explain="All-purpose compute is for interactive development. For jobs Databricks recommends **serverless** in most cases, or **classic jobs compute** when you need custom cluster characteristics.")
X("order", 5, 1, ["concept"], "A nightly 02:00 pipeline runs on jobs compute. Order its lifecycle.",
  items=["Job starts", "Compute available / provisioned", "Tasks run (ingest → transform → aggregate)", "Workload finishes"],
  explain="Jobs compute exists for the job — no interactive cluster sitting open all day.")
X("mcq", 5, 1, ["exam"], "Test Q6 — default recommendation for an interactive Python/DataFrame notebook?",
  options=["Serverless notebook compute (if supported)", "SQL warehouse", "Classic jobs compute", "Lakehouse Real-Time"], answer=0,
  explain="Interactive Python/DataFrames → **serverless notebook compute** generally preferred. SQL warehouses serve SQL/BI; jobs compute serves automation.")
X("free", 5, 2, ["interview"], "Interview Q28: \"Why would you choose a SQL warehouse instead of general-purpose Spark compute?\"",
  model="A SQL warehouse is purpose-built for SQL analytics and BI workloads and provides SQL-oriented performance, concurrency and scaling capabilities, whereas general notebook or classic compute is suited to broader Spark and programmatic workloads.",
  rubric=["Purpose-built for SQL analytics / BI", "SQL-oriented performance, concurrency, scaling",
          "General compute suits broader Spark/programmatic workloads"],
  explain="Hit the three axes: purpose (SQL/BI), properties (performance, concurrency, scaling) and contrast (programmatic Spark work).")
X("odd", 5, 2, ["compare"], "Which one doesn't belong with the others?",
  options=["Serverless notebook compute", "SQL warehouse", "Classic jobs compute", "Databricks Runtime 17.3 LTS"], answer=3,
  explain="The first three are **compute** types. **DBR 17.3 LTS** is the software/runtime environment that runs *on* compute.")

# ======================= s06 DBR
X("mcq", 6, 1, ["exam"], "Test Q9 — what is the Databricks Runtime?", True,
  options=["The software/runtime stack (Spark + Databricks-integrated libraries and dependencies) the workload runs on",
           "The VM type of the driver", "A SQL warehouse size", "The Unity Catalog metastore"], answer=0,
  explain="DBR is a **tested software stack**: Spark, Python, JVM, Delta support, libraries, optimizations, integrations. The VM is hardware; DBR is software.")
X("tf", 6, 1, ["exam", "pitfall"], "Test Q10 — DBR and the VM are the same thing.", True,
  answer=False,
  explain="**VM/compute resources** = hardware/infrastructure abstraction; **DBR** = software runtime environment installed on it.")
X("scenario", 6, 2, ["debug"], "DEV compute runs DBR 18.x, PROD runs DBR 17.3 LTS. `some_new_api(...)` works in DEV but PROD raises `AttributeError`.",
  steps=[
    {"prompt": "What's your first hypothesis?",
     "options": [opt("Runtime version mismatch: the API doesn't exist in 17.3", True, "Different DBR = different Spark/Python/packages = different capabilities."),
                 opt("The PROD cluster is too small", False, "Size doesn't remove attributes from an API."),
                 opt("A typo in the table name", False, "That would be TABLE_OR_VIEW_NOT_FOUND, not AttributeError."),
                 opt("Missing SELECT permission", False, "Permissions give INSUFFICIENT_PRIVILEGES, not AttributeError.")]},
    {"prompt": "Which comparison do you make?",
     "options": [opt("Compare DBR versions, libraries and configuration across DEV and PROD", True, "Production debugging = code + runtime + libraries + configuration."),
                 opt("Compare row counts of the tables", False, "This is an environment failure, not a data issue."),
                 opt("Compare Photon settings", False, "Photon doesn't add or remove Python attributes.")]}],
  explain="When code behaves differently across environments, align the **runtime, libraries and configuration** before suspecting the code.")
X("order", 6, 2, ["debug"], "Order the investigation of \"works in DEV, AttributeError in PROD\".",
  items=["Read the exact error and the failing call", "Compare DBR versions in DEV vs PROD",
         "Compare Python/library versions", "Compare compute configuration", "Align the runtime (or avoid the newer API) and re-test"],
  explain="Start from the error, then walk the environment layers: runtime → libraries → configuration, and fix by aligning environments.")
X("cloze", 6, 1, ["concept"], "Fill in the runtime terms.",
  text="LTS stands for [[Long-Term Support]]. For production, LTS is often preferred for stability, predictable maintenance and less frequent [[migration|migrations]]. DBR ML = standard DBR + [[ML libraries|machine learning libraries]] + ML/DL infrastructure.",
  explain="LTS runtimes trade newest features for stability; DBR ML saves you from building an ML environment yourself.")
X("mcq", 6, 2, ["concept"], "What can change when you switch DBR version? (select all)",
  options=["Spark version", "Python packages", "Capabilities and bug fixes", "Behavior of the same code", "The data stored in your Delta tables"],
  answer=[0, 1, 2, 3], multi=True,
  explain="Different DBR → different Spark, packages, capabilities, bug fixes and behavior. Your **stored data** doesn't change just because the runtime changed.")
X("match", 6, 1, ["concept"], "Match the term to what it is.",
  pairs=[["VM", "Hardware / infrastructure"], ["DBR", "Tested software stack incl. Spark"],
         ["LTS", "Long-Term Support runtime line"], ["DBR ML", "DBR + ML libraries + ML/DL infrastructure"]],
  explain="Keep hardware (VM) separate from software (DBR), and know the two DBR flavors that matter now: LTS for stability, ML for prebuilt ML tooling.")
X("free", 6, 2, ["debug", "concept"], "Why is production debugging \"code + runtime + libraries + configuration\" and not just \"does the Python code have a bug?\"",
  model="The same code can behave differently depending on the Databricks Runtime (Spark/Python versions, available APIs), the installed libraries and the configuration. A failure in PROD may come from a runtime mismatch (e.g. DBR 18.x in dev vs 17.3 LTS in prod) or a missing library, even if the code is correct.",
  rubric=["Same code, different environment → different behavior", "Mentions runtime version differences",
          "Mentions libraries/configuration", "Example such as AttributeError from version mismatch"],
  explain="The point is to widen your search space from 'my code' to the whole execution environment.")

# ======================= s07 Photon
X("tf", 7, 1, ["exam", "pitfall"], "Source Exercise 4 — to use Photon you must rewrite `df.groupBy(\"customer_id\").sum(\"amount\")` with a Photon-specific API.", True,
  answer=False,
  explain="No. The same DataFrame/SQL abstraction can execute through Photon for supported operations — optimization happens **beneath** the API.")
X("odd", 7, 1, ["pitfall", "concept"], "Photon IS one of these — which one?", True,
  options=["A programming language", "A database", "A storage format", "A vectorized query engine"], answer=3,
  explain="Photon is a **Databricks-native vectorized query engine**. It is not a language, not a database and not a storage format — the three classic misconceptions.")
X("mcq", 7, 2, ["concept", "exam"], "Where is Photon available?",
  options=["Only on SQL warehouses", "Enabled on serverless compute and SQL warehouses; also available (usually on by default) on classic compute",
           "Only on classic compute with a special Photon library", "Only when you import the photon module"], answer=1,
  explain="Photon is **enabled on serverless and SQL warehouses**, and on classic compute it's available and usually enabled by default via configuration. There is no module to import.")
X("spotbug", 7, 2, ["pitfall", "syntax"], "Someone tried to 'turn on Photon' in code. Which line is wrong?",
  lines=["from pyspark.sql import functions as F", 'orders = spark.table("prod.sales.orders")',
         'result = photon.groupBy(orders, "country").sum("amount")', "display(result)"],
  bugs=[2],
  fix='result = orders.groupBy("country").sum("amount")',
  explain="There is no `photon.groupBy` API. You write normal DataFrame/SQL code and Photon accelerates supported operations underneath.")
X("free", 7, 2, ["interview"], "Interview Q29: \"What is Photon?\"",
  model="Photon is Databricks' native vectorized execution engine that accelerates supported SQL and DataFrame operations underneath the existing APIs, so applications generally do not need a separate Photon-specific programming model.",
  rubric=["Native/Databricks vectorized engine", "Accelerates supported SQL & DataFrame ops", "Works under existing APIs — no special code"],
  explain="Nail the three points: what (vectorized native engine), for what (SQL/DataFrames), how you use it (you don't change code).")
X("mcq", 7, 2, ["concept"], "Why can vectorized processing be faster than row-at-a-time?",
  options=["It processes batches of values at once, reducing per-row overhead and using CPU characteristics better",
           "It skips rows that don't match", "It stores data in a different file format", "It uses more workers"], answer=0,
  explain="Vectorized execution operates on **batches** (`[v1 v2 v3 …]`) instead of one row at a time, cutting overhead and improving CPU efficiency. It is not a storage format and doesn't change cluster size.")
X("cloze", 7, 1, ["concept"], "Complete the definition.",
  text="Photon is a Databricks-native [[vectorized]] query engine that accelerates [[SQL]] and [[DataFrame]] workloads, while Spark is the broader execution framework.",
  bank=["row-based", "RDD", "storage"],
  explain="Vectorized + SQL/DataFrame is the core of the definition. RDD workloads are not what Photon targets.")

# ======================= s08 Notebooks
X("tf", 8, 1, ["exam", "pitfall"], "Test Q19 — a notebook that exists but is not attached to any compute can still execute a Spark workload.", True,
  answer=False,
  explain="A notebook is an artifact/interface. It needs an **execution compute/session** — even `print(\"hello\")` needs one.")
X("bucket", 8, 1, ["concept", "compare", "pitfall"], "Spark API or Databricks notebook/platform helper?", True,
  buckets=["Spark API (portable)", "Databricks notebook helper"],
  items=[{"text": "df.show()", "bucket": 0}, {"text": "display(df)", "bucket": 1},
         {"text": "spark.createDataFrame(...)", "bucket": 0}, {"text": "df.groupBy(...).agg(...)", "bucket": 0},
         {"text": "dbutils.widgets.get(...)", "bucket": 1}, {"text": "df.explain(\"formatted\")", "bucket": 0},
         {"text": "_sqldf", "bucket": 1}, {"text": "spark.table(...)", "bucket": 0}],
  explain="Spark APIs work anywhere Spark runs. `display`, `dbutils` and `_sqldf` are **notebook/platform conveniences** — they break if you port code outside Databricks.")
X("mcq", 8, 2, ["concept"], "`spark.createDataFrame([(1, \"Athens\", 120.0), …], [\"order_id\", \"city\", \"amount\"])` — which schema is inferred?",
  options=["order_id: long, city: string, amount: double", "order_id: int, city: string, amount: float",
           "order_id: string, city: string, amount: string", "order_id: long, city: string, amount: decimal(10,2)"], answer=0,
  explain="Python ints become **long** and Python floats become **double**. DECIMAL only appears when you declare it (as in a SQL table definition).")
X("write", 8, 2, ["syntax"], "Create a Spark DataFrame `df` from the list `data` with columns `order_id`, `city`, `amount`, and render it with the Databricks notebook helper.",
  solution='df = spark.createDataFrame(\n    data,\n    ["order_id", "city", "amount"]\n)\ndisplay(df)',
  keywords=["spark.createDataFrame", "order_id", "city", "amount", "display(df)"], lang="python",
  explain="In a Databricks notebook `spark` already exists. `display(df)` gives rich rendering; `df.show()` would be the portable Spark alternative.")
X("spotbug", 8, 2, ["pitfall", "debug"], "This script will run as a **plain PySpark job outside Databricks**. Which line will fail?",
  lines=["from pyspark.sql import SparkSession", "spark = SparkSession.builder.getOrCreate()",
         'df = spark.createDataFrame([(1, "Athens", 120.0)], ["order_id", "city", "amount"])', "display(df)"],
  bugs=[3],
  fix="df.show()",
  explain="`display()` is a **Databricks notebook helper**, not a PySpark method. Outside Databricks use `df.show()`. (Outside Databricks you *do* need to build the SparkSession, as lines 0–1 do.)")
X("mcq", 8, 2, ["concept"], "In a Unity Catalog-enabled workspace you open a brand-new notebook and run a cell without choosing compute. What can happen?",
  options=["Databricks can automatically attach it to serverless compute", "The cell runs in your browser",
           "The cell silently does nothing forever", "A SQL warehouse is created for it"], answer=0,
  explain="Current Databricks can **auto-attach** new notebooks to **serverless compute** in UC-enabled workspaces. Code never runs in the browser.")
X("tf", 8, 1, ["concept"], "In a Databricks notebook you must create `spark` yourself with `SparkSession.builder` before using it.",
  answer=False,
  explain="A ready-made Spark session (`spark`) is provided on supported compute. You only build it yourself outside Databricks.")

# ======================= s09 Transformations / plans / lazy
X("calc", 9, 1, ["calc"], "Orders: (1, Athens, 120.0), (2, Volos, 80.0), (3, Athens, 50.0), (4, Patras, 200.0), (5, Athens, 30.0). What is `total_sales` for Athens?", True,
  answer=200, tolerance=0, unit="",
  explain="120 + 50 + 30 = **200.0**, from 3 orders. Note Patras also has 200.0, so in `orderBy(desc(\"total_sales\"))` Athens and Patras tie and their order isn't guaranteed.")
X("mcq", 9, 2, ["concept", "exam"], "Source Exercise 5 — why does `df.filter(F.col(\"amount\") > 100)` usually need no shuffle, while `df.groupBy(\"city\").sum(\"amount\")` probably does?", True,
  options=["Filter is decided independently within each partition; groupBy must bring all rows of the same city together across partitions",
           "Filter runs on the driver; groupBy runs on workers",
           "Filter uses Photon; groupBy doesn't",
           "groupBy writes to disk; filter doesn't"], answer=0,
  explain="Each partition can filter **locally**. But rows with `city = Athens` may sit in several partitions and must be combined logically → **redistribution/shuffle**.")
X("order", 9, 2, ["interview", "concept"], "What happens when you press Run on a cell with transformations + `display(result)`? Put the steps in order.",
  items=["Python code executes in the active compute session", "Spark builds logical DataFrame transformations",
         "display() requires a result (action)", "Catalyst analysis and optimization", "Physical execution plan",
         "Spark/Photon execution: tasks process partitions (scan, filter, shuffle)"],
  explain="Not just 'Python runs': code builds a lazy plan, an action triggers Catalyst optimization, a physical plan is chosen, and Spark/Photon tasks process partitions.")
X("mcq", 9, 2, ["concept", "exam"], "Which of these trigger actual evaluation? (select all)",
  options=["display(y)", "y.count()", "y.write...", "x = orders.filter(...)", "y = x.groupBy(...).sum(...)"],
  answer=[0, 1, 2], multi=True,
  explain="`display`, `count` and `write` are **actions** needing a result. `filter` and `groupBy().sum()` are **transformations** that only describe computation (lazy evaluation).")
X("cloze", 9, 1, ["syntax"], "Complete the code to print the physical plan in the readable format, and name the shuffle operator.",
  text='city_sales.[[explain]]("[[formatted|extended]]")\n# shuffle boundary operator in the plan: [[Exchange]]',
  asCode=True,
  explain="`explain(\"formatted\")` (or `\"extended\"`) shows the plan. **Exchange** marks redistribution/shuffle; you'll also see HashAggregate and Sort.")
X("mcq", 9, 2, ["exam"], "Test Q26 — `spark.table(\"orders\").groupBy(\"customer_id\").sum(\"amount\")` shows **Exchange** in the plan. What does that most likely mean?",
  options=["Data redistribution/shuffle is required for the aggregation", "Data is being exchanged with the control plane",
           "Photon is disabled", "The table is being copied to a new location"], answer=0,
  explain="Exchange = **shuffle**: rows with the same `customer_id` must meet in the same partition. This is your Spark knowledge applied directly in Databricks.")
X("tf", 9, 1, ["exam", "pitfall"], "Test Q20 — once `df.filter(...)` has run in a cell, the data has already been filtered.",
  answer=False,
  explain="Because of **lazy evaluation**, the filter only adds to the computation plan. Execution happens when an action/result is requested (display, count, write).")
X("calc", 9, 1, ["calc"], "How many rows will `city_sales` (groupBy city over the 5 orders in Athens/Volos/Patras) contain?",
  answer=3, tolerance=0, unit="rows",
  explain="One row per distinct city: Athens, Patras, Volos → **3** rows. groupBy collapses the 5 orders into 3 groups.")
X("write", 9, 2, ["syntax"], "Write `city_sales`: group `df` by `city`, compute `total_sales` (sum of amount) and `orders` (count of rows), sorted by `total_sales` descending.",
  solution='from pyspark.sql import functions as F\n\ncity_sales = (\n    df\n    .groupBy("city")\n    .agg(\n        F.sum("amount").alias("total_sales"),\n        F.count("*").alias("orders")\n    )\n    .orderBy(F.desc("total_sales"))\n)',
  keywords=["groupBy(\"city\")", ".agg(", "F.sum(\"amount\")", "alias(\"total_sales\")", "F.count(\"*\")", "orderBy", "F.desc"], lang="python",
  explain="`agg` with aliased `F.sum`/`F.count`, then `orderBy(F.desc(...))`. Expect HashAggregate + Exchange in the plan.")
X("free", 9, 3, ["interview"], "Interview: explain what really happens between pressing Run and seeing a table from `display(result)`.",
  model="The cell's Python runs in the active compute session. The DataFrame calls build a lazy logical plan; nothing is processed yet. display() is an action, so Spark runs Catalyst analysis/optimization, picks a physical plan, and Spark/Photon executes it as tasks over partitions — scanning, filtering, and shuffling for the groupBy — and returns the result to the notebook.",
  rubric=["Runs in compute session, not browser", "Transformations are lazy", "Action triggers Catalyst optimization",
          "Physical plan executed by Spark/Photon tasks over partitions", "Mentions shuffle for groupBy"],
  explain="The interview-level answer connects notebook → lazy plan → action → Catalyst → physical plan → distributed tasks.")

# ======================= s10 Magic commands / spark.table / spark.sql / _sqldf
X("match", 10, 1, ["syntax", "exam"], "Test Q15/Q16 (extended) — match each magic command to what it does.", True,
  pairs=[["%sql", "Run this cell as SQL"], ["%md", "Render this cell as Markdown"],
         ["%pip", "Manage notebook-scoped Python packages"], ["%python", "Run this cell as Python"],
         ["%scala", "Run this cell as Scala"]],
  explain="Magic commands switch how **one cell** is interpreted (`%python`, `%sql`, `%scala`, `%r`, `%md`) or manage notebook-scoped libraries (`%pip`).")
X("tf", 10, 1, ["pitfall", "exam"], "`%pip install requests` permanently installs `requests` for every notebook in the workspace.", True,
  answer=False,
  explain="`%pip` installs **notebook-scoped** libraries tied to the notebook/session context — not a permanent workspace-wide installation.")
X("spotbug", 10, 2, ["syntax", "debug"], "A cell in a Python-default notebook should run this query as SQL, but it fails with a Python SyntaxError. Which line is wrong?",
  lines=["%python", "SELECT city, SUM(amount) AS revenue", "FROM prod.silver.orders", "GROUP BY city;"],
  bugs=[0],
  fix="%sql\nSELECT city, SUM(amount) AS revenue\nFROM prod.silver.orders\nGROUP BY city;",
  explain="The magic `%python` tells the notebook to parse SQL text as Python. Start the cell with **`%sql`** so it's interpreted as SQL.")
X("mcq", 10, 1, ["exam"], "Test Q13 — what does `spark.table(\"prod.silver.orders\")` do?",
  options=["Creates a Spark DataFrame that refers to that table object", "Copies the whole table into driver memory",
           "Creates a new empty table", "Opens the table in Catalog Explorer"], answer=0,
  explain="It resolves the UC name's metadata and returns a **DataFrame** pointing at the table. Thanks to lazy evaluation, nothing is read until an action runs.")
X("mcq", 10, 1, ["concept"], "What does `spark.sql(\"SELECT country, SUM(amount) AS revenue FROM prod.silver.orders GROUP BY country\")` return?",
  options=["A DataFrame", "A Python list of rows", "A printed text table", "Nothing — it only runs the query"], answer=0,
  explain="SQL statement → Spark SQL → **DataFrame**. You can keep transforming it or `display()` it.")
X("write", 10, 2, ["syntax"], "From Python, run SQL that computes revenue per country from `prod.silver.orders` into DataFrame `df`, then display it.",
  solution='df = spark.sql("""\n    SELECT country, SUM(amount) AS revenue\n    FROM prod.silver.orders\n    GROUP BY country\n""")\ndisplay(df)',
  keywords=["spark.sql(", "SUM(amount) AS revenue", "FROM prod.silver.orders", "GROUP BY country", "display(df)"], lang="python",
  explain="`spark.sql` lets you write SQL while staying in Python and getting a DataFrame back.")
X("mcq", 10, 2, ["pitfall", "concept"], "What is `_sqldf`, and how should you use it?",
  options=["The result of the previous SQL cell exposed to subsequent Python; a handy interactive feature, not a basis for production design",
           "A built-in table listing all SQL queries; ideal for production auditing",
           "A function that converts a DataFrame to SQL", "The SQL warehouse's default DataFrame"], answer=0,
  explain="In supported notebook environments, a `%sql` cell's result becomes `_sqldf` for later Python cells. Great for exploration — but use `spark.sql()`/named DataFrames in production.")
X("cloze", 10, 2, ["syntax"], "Complete the two cells so a SQL result is reused in Python.",
  text="%[[sql]]\nSELECT * FROM prod.silver.orders WHERE amount > 100;\n\n# next cell (Python)\ndisplay([[_sqldf]])",
  asCode=True,
  explain="`%sql` makes the cell SQL; its result is exposed to later Python as `_sqldf` in supported environments.")
X("tf", 10, 1, ["concept"], "`spark.table(\"main.sales.orders\")` in Python and `%sql SELECT * FROM main.sales.orders` can lead to the same logical table.",
  answer=True,
  explain="Both resolve the same Unity Catalog name. Python and SQL are just two front doors to the same table.")

# ======================= s11 Widgets & parameters
X("cloze", 11, 1, ["syntax"], "Complete the dropdown widget and read its value.", True,
  text='dbutils.widgets.[[dropdown]](\n    "country",\n    "GR",\n    ["GR", "DE", "FR"],\n    "Country"\n)\ncountry = dbutils.widgets.[[get]]("country")',
  asCode=True, bank=["text", "set", "read"],
  explain="`dropdown(name, default, choices, label)` creates the control; `dbutils.widgets.get(name)` returns its current value.")
X("mcq", 11, 1, ["exam", "syntax"], "Test Q17 — which is today's SQL parameter marker syntax for a widget named `country`?", True,
  options=[":country", "${country}", "@country", "{{country}}"], answer=0,
  why=["Correct: modern parameter marker.", "Legacy; deprecated for DBR 15.2+.", "Not Databricks parameter syntax here.", "Not this syntax."],
  explain="Use **`:country`**. `${country}` is the older syntax, deprecated for DBR 15.2+ — learn today's syntax, not old tutorials.")
X("spotbug", 11, 2, ["syntax", "pitfall"], "Which line uses deprecated syntax?",
  lines=['# Python cell: dbutils.widgets.text("country", "GR")', "%sql", "SELECT *", "FROM prod.silver.orders", "WHERE country = '${country}';"],
  bugs=[4],
  fix="WHERE country = :country;",
  explain="`${country}` is legacy/deprecated (DBR 15.2+). The modern parameter marker is `:country`.")
X("spotbug", 11, 3, ["syntax", "pitfall"], "A widget holds a table name. Which line is wrong?",
  lines=['dbutils.widgets.text("table_name", "prod.silver.orders")', "%sql", "SELECT *", "FROM :table_name;"],
  bugs=[3],
  fix="FROM IDENTIFIER(:table_name);",
  explain="A parameter marker stands for a **value**; after `FROM` SQL needs an **identifier**. Wrap it: `IDENTIFIER(:table_name)`.")
X("mcq", 11, 2, ["exam"], "Test Q18 — why isn't `FROM :table` treated like `WHERE country = :country`?",
  options=["`FROM` needs a SQL identifier (object name), while `WHERE country = :country` takes a parameter value",
           "Parameters only work in Python cells", "`:table` is reserved syntax for temporary views", "Widgets can't hold strings"], answer=0,
  explain="Identifier vs value are different semantic categories. For dynamic object names use `IDENTIFIER()`.")
X("write", 11, 2, ["syntax"], "Create a text widget `country` with default `GR` (Python), then write the SQL cell that filters `prod.silver.orders` with the modern parameter marker.",
  solution='dbutils.widgets.text("country", "GR")\n\n%sql\nSELECT *\nFROM prod.silver.orders\nWHERE country = :country;',
  keywords=["dbutils.widgets.text", "\"country\"", "%sql", "where country = :country"], lang="python",
  explain="Create the widget once, then reference it in SQL with `:country` (not `${country}`).")
X("order", 11, 1, ["syntax"], "Order the parameterized-notebook pattern.",
  items=["Create the widget (dbutils.widgets.dropdown)", "Read the value (dbutils.widgets.get)",
         "Use the value in a filter", "Render with display()"],
  explain="Create → get → use → display. Users then change the widget instead of editing code.")
X("bucket", 11, 3, ["pitfall", "syntax"], "Can a plain parameter marker (`:p`) go there, or do you need `IDENTIFIER(:p)`?",
  buckets=["Plain value marker :p", "Needs IDENTIFIER(:p)"],
  items=[{"text": "WHERE country = ?", "bucket": 0}, {"text": "FROM ? (table name)", "bucket": 1},
         {"text": "WHERE amount > ?", "bucket": 0}, {"text": "SELECT ? FROM t (column name)", "bucket": 1},
         {"text": "WHERE order_date = ?", "bucket": 0}, {"text": "Catalog/schema name in a qualified name", "bucket": 1}],
  explain="Values (strings, numbers, dates) use plain markers. Anything that is an **object name** (table, column, schema) is an identifier → `IDENTIFIER()`.")
X("tf", 11, 1, ["exam"], "The `${param}` syntax is deprecated for DBR 15.2 and above.",
  answer=True,
  explain="Correct. Modern SQL uses parameter markers like `:param`.")
X("free", 11, 1, ["concept"], "Why are widgets better than writing `country = \"GR\"` at the top of the notebook?",
  model="Hardcoding means editing code every time you need another country, which is error-prone and not reusable. Widgets turn the notebook into a parameterized notebook/dashboard: the value is chosen in the UI (or passed in), read with dbutils.widgets.get, and the code stays unchanged.",
  rubric=["Avoids editing code for each run", "Parameterized/reusable notebook", "Value read via dbutils.widgets.get"],
  explain="Widgets separate **inputs** from **logic** — the first step toward reusable, schedulable notebooks.")

# ======================= s12 Catalog Explorer & first table
X("order", 12, 1, ["syntax", "debug"], "Order the SQL drill-down from the top of the namespace to one table's details.", True,
  items=["SHOW CATALOGS;", "SHOW SCHEMAS IN prod;", "SHOW TABLES IN prod.silver;", "DESCRIBE TABLE prod.silver.orders;", "DESCRIBE DETAIL prod.silver.orders;"],
  explain="Catalog → schema → table → columns → table-level details. This drill-down is your basic debugging toolkit.")
X("cloze", 12, 1, ["syntax"], "Complete the exploration commands.", True,
  text="SHOW [[CATALOGS]];\nSHOW [[SCHEMAS]] IN prod;\nSHOW [[TABLES]] IN prod.silver;\nDESCRIBE [[DETAIL]] prod.silver.orders;",
  asCode=True, bank=["VIEWS", "COLUMNS"],
  explain="SHOW CATALOGS / SCHEMAS IN catalog / TABLES IN catalog.schema, and DESCRIBE DETAIL for table-level info (format, location, size).")
X("write", 12, 2, ["syntax"], "Create the schema `dev_training.sales` only if missing, then a Delta table `orders` with order_id BIGINT, customer_id BIGINT, amount DECIMAL(10,2), country STRING, order_ts TIMESTAMP.",
  solution="CREATE SCHEMA IF NOT EXISTS dev_training.sales;\n\nCREATE TABLE dev_training.sales.orders (\n  order_id BIGINT,\n  customer_id BIGINT,\n  amount DECIMAL(10,2),\n  country STRING,\n  order_ts TIMESTAMP\n)\nUSING DELTA;",
  keywords=["create schema if not exists dev_training.sales", "create table dev_training.sales.orders", "decimal(10,2)", "timestamp", "using delta"], lang="sql",
  explain="Schema first (catalog.schema), then the table with a fully qualified name and `USING DELTA`.")
X("spotbug", 12, 2, ["syntax", "debug"], "The table has 5 columns (order_id, customer_id, amount, country, order_ts). Which line breaks the INSERT?",
  lines=["INSERT INTO dev_training.sales.orders", "VALUES", "  (1, 101, 20.50, 'GR', CURRENT_TIMESTAMP()),",
         "  (2, 102, 90.00, CURRENT_TIMESTAMP()),", "  (3, 103, 15.25, 'GR', CURRENT_TIMESTAMP());"],
  bugs=[3],
  fix="  (2, 102, 90.00, 'DE', CURRENT_TIMESTAMP()),",
  explain="Row 2 has only 4 values — the `country` value is missing. Every VALUES row must match the table's column count and order.")
X("tf", 12, 1, ["exam", "pitfall"], "Test Q22 — the compute stopped, so your Delta table is gone.",
  answer=False,
  explain="**Compute lifetime ≠ data lifetime.** The Delta table lives in persistent storage; compute can stop and start without affecting it.")
X("mcq", 12, 2, ["concept", "pitfall"], "A colleague can't see the `prod` catalog in Catalog Explorer, but you can. Most likely reason?",
  options=["They lack privileges such as BROWSE or the corresponding data access privileges",
           "Their compute is too small", "Catalog Explorer only shows the creator's objects", "Photon is disabled for them"], answer=0,
  explain="Catalog Explorer discovery is **governed**: you need privileges like **BROWSE** and/or data access privileges. Compute size and Photon are irrelevant to visibility.")
X("match", 12, 2, ["concept"], "Match each layer to its job for `dev_training.sales.orders`.",
  pairs=[["Unity Catalog", "Name, metadata, permissions"], ["Delta", "Table format: files + transaction state"],
         ["Storage", "Where the bytes persist"], ["Compute", "Executes the queries"]],
  explain="UC names and governs, Delta formats, storage persists, compute executes — four separate layers.")
X("mcq", 12, 2, ["syntax"], "You want table-level information such as format, location and number of files. Which command?",
  options=["DESCRIBE DETAIL prod.silver.orders;", "DESCRIBE TABLE prod.silver.orders;", "SHOW TABLES IN prod.silver;", "SHOW SCHEMAS IN prod;"], answer=0,
  explain="`DESCRIBE DETAIL` gives table-level details; `DESCRIBE TABLE` gives columns and types; SHOW commands list objects.")

# ======================= s13 Namespaces
X("match", 13, 1, ["exam"], "Test Q14 — what is each part of `prod.silver.orders`?", True,
  pairs=[["prod", "catalog"], ["silver", "schema"], ["orders", "table / object"]],
  explain="Unity Catalog's three-level namespace: **catalog.schema.table**.")
X("mcq", 13, 1, ["pitfall", "exam"], "Current context is `dev.sales`. You run `SELECT * FROM orders;` believing you read production. What do you actually read?", True,
  options=["dev.sales.orders", "prod.sales.orders", "An error: the name is ambiguous", "main.default.orders"], answer=0,
  explain="Short names resolve against the **current catalog and schema** → `dev.sales.orders`. No error — just silently wrong data. Use fully qualified names.")
X("scenario", 13, 2, ["debug", "pitfall"], "Your notebook's revenue numbers are far lower than finance's report. The query is `SELECT SUM(amount) FROM orders;` and it runs without errors.",
  steps=[
    {"prompt": "What do you check first?",
     "options": [opt("SELECT current_catalog(), current_schema()", True, "The unqualified name may be resolving to a different catalog/schema."),
                 opt("Increase the cluster size", False, "Wrong numbers aren't a performance problem."),
                 opt("Check Photon is enabled", False, "Photon changes speed, not results."),
                 opt("Reinstall libraries with %pip", False, "No dependency error here.")]},
    {"prompt": "It returns `dev` / `sales`. What now?",
     "options": [opt("Rewrite with the fully qualified name prod.sales.orders (or USE CATALOG/USE SCHEMA explicitly)", True, "Fully qualified names remove the ambiguity."),
                 opt("Delete dev.sales.orders", False, "Destructive and doesn't fix the habit."),
                 opt("Run the same query again", False, "Same context → same wrong table.")]}],
  explain="Silent wrong-namespace reads are dangerous because nothing errors. Check the current namespace and fully qualify production queries.")
X("order", 13, 2, ["debug"], "Order the steps when you suspect a short table name hit the wrong environment.",
  items=["Notice results look wrong (no error raised)", "Run SELECT current_catalog() and current_schema()",
         "Compare with the intended catalog.schema", "Rewrite using catalog.schema.table", "Re-run and compare results"],
  explain="Confirm the current namespace, compare with intent, and fix by fully qualifying.")
X("cloze", 13, 1, ["syntax"], "Check and set the namespace.",
  text="SELECT [[current_catalog]]();\nSELECT [[current_schema]]();\nUSE [[CATALOG]] prod;\nUSE [[SCHEMA]] silver;",
  asCode=True,
  explain="`current_catalog()`/`current_schema()` reveal the context; `USE CATALOG`/`USE SCHEMA` set it.")
X("tf", 13, 1, ["pitfall"], "An unqualified table name like `orders` is always resolved in the `prod` catalog.",
  answer=False,
  explain="It's resolved against the **current** catalog and schema, whatever they are. That's why production code should use `catalog.schema.table`.")
X("write", 13, 2, ["syntax"], "Set the context to catalog `prod` and schema `silver`, then select all rows from `orders` using the short name.",
  solution="USE CATALOG prod;\nUSE SCHEMA silver;\n\nSELECT *\nFROM orders;",
  keywords=["use catalog prod", "use schema silver", "from orders"], lang="sql",
  explain="After `USE CATALOG`/`USE SCHEMA`, `orders` resolves to `prod.silver.orders`. For production transformations, the fully qualified name is still safer.")

# ======================= s14 Debugging by layer
X("scenario", 14, 1, ["debug", "exam"], "`spark.table(\"prod.silver.ordres\")` fails with `TABLE_OR_VIEW_NOT_FOUND`.", True,
  code='spark.table("prod.silver.ordres")',
  steps=[
    {"prompt": "First thing to run?",
     "options": [opt("SHOW TABLES IN prod.silver;", True, "List what actually exists in that schema."),
                 opt("Open the Spark UI and inspect shuffles", False, "Wrong layer — the plan never ran; the name didn't resolve."),
                 opt("Increase cluster size", False, "Compute size can't create a missing name."),
                 opt("%pip install the table", False, "Tables aren't packages.")]},
    {"prompt": "The list shows `orders`. Conclusion?",
     "options": [opt("Typo: ordres → orders", True, "Fix the name and re-run."),
                 opt("Permission problem", False, "Permission errors look like INSUFFICIENT_PRIVILEGES."),
                 opt("Runtime mismatch", False, "Runtime issues show up as AttributeError/ModuleNotFoundError.")]},
    {"prompt": "If `orders` had NOT been listed there, what would you check next?",
     "options": [opt("Whether I'm in the wrong catalog/schema (current_catalog(), current_schema(), SHOW SCHEMAS)", True, "The table may live elsewhere."),
                 opt("Restart the compute", False, "Doesn't change where tables live."),
                 opt("Enable Photon", False, "Irrelevant to name resolution.")]}],
  explain="TABLE_OR_VIEW_NOT_FOUND is a **naming/namespace** problem: typo or wrong catalog/schema. Use SHOW TABLES/SCHEMAS before touching Spark internals.")
X("order", 14, 2, ["debug", "exam"], "A notebook cell is stuck/failing. Order the layer ladder (top to bottom).", True,
  items=["Compute attached?", "Compute running?", "Session healthy?", "Code parsed?", "Table exists?", "Permission?", "Query plan?", "Runtime execution?"],
  explain="Find the failing **layer** first: environment → code → data/naming → governance → plan → execution. Don't jump to shuffle analysis when the notebook isn't even attached.")
X("bucket", 14, 1, ["debug", "pitfall"], "Which layer does each symptom point to?",
  buckets=["Execution environment", "Naming / namespace", "Governance / authorization", "Runtime / dependencies"],
  items=[{"text": "notebook not attached", "bucket": 0}, {"text": "TABLE_OR_VIEW_NOT_FOUND", "bucket": 1},
         {"text": "INSUFFICIENT_PRIVILEGES", "bucket": 2}, {"text": "ModuleNotFoundError", "bucket": 3},
         {"text": "Typo 'ordres' in a table name", "bucket": 1}, {"text": "Scheduled job gets PERMISSION_DENIED", "bucket": 2},
         {"text": "AttributeError only on the older DBR", "bucket": 3}, {"text": "Compute not running", "bucket": 0}],
  explain="Classify before you fix: Case A environment, Case B naming, Case C governance, Case D runtime/dependency.")
X("scenario", 14, 2, ["debug", "exam"], "Test Q25 — the notebook works when **you** run it, but the scheduled job fails with `PERMISSION_DENIED`.",
  steps=[
    {"prompt": "First serious hypothesis?",
     "options": [opt("The job runs as a different execution identity/principal", True, "Same code, different principal → different privileges."),
                 opt("The job's cluster is too small", False, "Size doesn't cause permission errors."),
                 opt("The table was deleted", False, "Then you'd see TABLE_OR_VIEW_NOT_FOUND, and it works for you."),
                 opt("Photon is off on job compute", False, "Photon doesn't affect authorization.")]},
    {"prompt": "What do you verify for that principal?",
     "options": [opt("USE CATALOG, USE SCHEMA and SELECT on the objects", True, "The full privilege chain must exist for the job's principal."),
                 opt("Spark partition counts", False, "Wrong layer — this is governance."),
                 opt("The DBR version", False, "Runtime doesn't grant permissions.")]}],
  explain="When it works for you but not for the job, compare **who** runs it. Then check the privilege chain for that principal.")
X("order", 14, 2, ["debug"], "Case C — order the questions for `INSUFFICIENT_PRIVILEGES` on `SELECT * FROM prod.finance.transactions`.",
  items=["Which principal am I (or is the job running as)?", "Do I have USE CATALOG on prod?", "Do I have USE SCHEMA on prod.finance?", "Do I have SELECT on the table?"],
  explain="Identity first, then the chain from outer to inner: catalog → schema → table. This is the governance layer — not Spark partitions.")
X("mcq", 14, 2, ["debug", "exam"], "Test Q24 — notebook works in DEV but PROD shows `ModuleNotFoundError`. Which two categories do you check early? (select all that apply)",
  options=["Databricks Runtime version", "Python/library environment", "Unity Catalog grants", "Spark shuffle partitions"],
  answer=[0, 1], multi=True,
  explain="ModuleNotFoundError is a **runtime/environment/dependency** issue: compare DBR versions and the installed Python libraries. Grants and shuffles belong to other layers.")
X("spotbug", 14, 1, ["debug", "syntax"], "This cell raises `TABLE_OR_VIEW_NOT_FOUND`. Which line?",
  lines=["from pyspark.sql import functions as F", 'orders = spark.table("prod.silver.ordres")',
         'big = orders.filter(F.col("amount") > 100)', "display(big)"],
  bugs=[1],
  fix='orders = spark.table("prod.silver.orders")',
  explain="`ordres` is a typo for `orders`. `SHOW TABLES IN prod.silver;` would have revealed it immediately.")
X("scenario", 14, 1, ["debug"], "Case A — you click Run and nothing executes; the notebook header says it's not attached.",
  steps=[
    {"prompt": "Which layer is this?",
     "options": [opt("Execution environment", True, "No compute session → nothing can run."),
                 opt("Spark code bug", False, "The code never even reached Spark."),
                 opt("Governance", False, "No permission error was raised."),
                 opt("Data layout", False, "No data has been read.")]},
    {"prompt": "What do you do?",
     "options": [opt("Attach to compute (e.g. serverless) / start the compute, then re-run", True, "Give the notebook an execution session."),
                 opt("Rewrite the groupBy", False, "Code isn't the problem."),
                 opt("Run OPTIMIZE on the table", False, "Table layout is irrelevant here.")]}],
  explain="A notebook is just an artifact. 'Not attached' is an environment problem — fix the compute, not the code.")
X("mcq", 14, 2, ["pitfall", "debug"], "You get `INSUFFICIENT_PRIVILEGES`. Which of these should you NOT spend time on?",
  options=["Spark partition counts", "Which principal you are", "USE CATALOG / USE SCHEMA grants", "SELECT on the table"], answer=0,
  explain="Permission errors live in the **governance/authorization** layer. Spark partitions are an execution-layer concern and won't explain a denied access.")
X("tf", 14, 1, ["pitfall", "debug"], "`ModuleNotFoundError` most likely indicates a data problem in your tables.",
  answer=False,
  explain="It's a **runtime/environment/dependency** problem. In a notebook `%pip install some-library` may help; in production manage dependencies systematically.")

# ======================= s15 Slow queries
X("free", 15, 2, ["interview", "pitfall", "exam"], "Test Q23 — a query is slow and a junior engineer says \"we need a bigger cluster\". What's wrong with that reasoning?", True,
  model="No root cause has been identified. The slowness could come from skew, a wrong join strategy, a huge shuffle, spill to disk, poor table layout, small files, an unnecessary scan, a badly written query or insufficient statistics — or a real compute bottleneck. Cluster sizing is only one possibility, so you first inspect the physical plan and Spark UI.",
  rubric=["Root cause not identified", "Lists several alternatives (skew, join, shuffle, spill, layout/small files, scan, statistics)",
          "Cluster size is only one possibility", "Investigate plan/Spark UI first"],
  explain="Slow ≠ small cluster. Diagnose before you scale.")
X("order", 15, 2, ["debug"], "Order the debugging tree for a 40-minute join + groupBy query.", True,
  items=["Is compute actually healthy?", "How much input data?", "What physical join (BHJ or SMJ)?",
         "Huge shuffle?", "Skew?", "Spill to disk?", "Tiny files / bad layout?"],
  explain="Health → input size → join strategy → shuffle → skew → spill → file layout. Each step narrows the cause before you touch cluster size.")
X("scenario", 15, 3, ["debug"], "`orders JOIN customers ON customer_id`, then `groupBy(\"country\")`, runs for 40 minutes.",
  steps=[
    {"prompt": "Before anything else?",
     "options": [opt("Confirm the compute is actually healthy", True, "Rule out the environment layer first."),
                 opt("Double the workers", False, "That's guessing without a root cause."),
                 opt("Rewrite in Scala", False, "Language isn't the issue.")]},
    {"prompt": "Compute is fine. Next?",
     "options": [opt("Check input size and which physical join was chosen (BHJ vs SMJ) in the plan", True, "Input volume and join strategy are the biggest levers."),
                 opt("Check UC permissions", False, "The query runs — permissions are fine."),
                 opt("Reinstall libraries", False, "No dependency error.")]},
    {"prompt": "It's a sort-merge join with a huge shuffle. One task runs far longer than the rest. Suspect?",
     "options": [opt("Skew — some customer_id/country keys are much bigger", True, "One slow task among many fast ones is the classic skew signal."),
                 opt("Typo in the table name", False, "Then it wouldn't run at all."),
                 opt("Photon is a database", False, "Photon is an engine, and this doesn't explain one slow task.")]}],
  explain="Walk the tree: healthy compute → input size → join type → shuffle → skew → spill → file layout. Evidence before resources.")
X("mcq", 15, 2, ["debug"], "Case E (query runs but is slow) — what do you inspect? (select all)",
  options=["Physical plan", "Spark UI tasks", "Skew and spill", "Join strategy and partition counts", "USE CATALOG privileges", "%pip packages"],
  answer=[0, 1, 2, 3], multi=True,
  explain="Only now do you open Spark: plan, Spark UI, tasks, shuffle, skew, spill, input bytes, partition counts, join strategy. Privileges and packages belong to other layers — the query already runs.")
X("tf", 15, 1, ["pitfall", "exam"], "A slow query automatically means the cluster is too small.",
  answer=False,
  explain="Slow ≠ small cluster. Skew, joins, shuffles, spill, small files or bad queries are just as likely. Find the root cause first.")
X("odd", 15, 2, ["debug"], "Which one is NOT a typical cause of a slow (but running) query?",
  options=["Huge shuffle", "Data skew", "Spill to disk", "INSUFFICIENT_PRIVILEGES"], answer=3,
  explain="Shuffle, skew and spill are performance causes. `INSUFFICIENT_PRIVILEGES` stops the query from running at all — a governance error, not slowness.")

# ======================= s16 Mini-project & recap
X("calc", 16, 1, ["calc"], "Mini-project data: Athens 100.00, Volos 80.00, Athens 30.00, Patras 150.00, Athens 200.00, Volos 40.00. What revenue does Task A return for Athens?", True,
  answer=330, tolerance=0, unit="",
  explain="100 + 30 + 200 = **330.00**. Full Task A result (ORDER BY revenue DESC): Athens 330, Patras 150, Volos 120.")
X("match", 16, 1, ["concept", "exam"], "When you see it, think it — match each term to its mental bucket.", True,
  pairs=[["spark.table(...)", "Spark API"], ["display(...)", "Databricks notebook convenience"],
         ["prod.silver.orders", "Unity Catalog namespace"], ["Serverless", "Databricks-managed compute infrastructure"],
         ["Photon", "Vectorized native execution engine"], ["DBR 17.3", "Software/runtime environment"]],
  explain="Not everything belongs in a bucket called 'Databricks stuff'. Each term has a precise layer: API, helper, namespace, infrastructure, engine, runtime. (SQL Warehouse → SQL-optimized compute.)")
X("write", 16, 1, ["syntax"], "Task A — SQL: revenue per city from `dev_training.sales.orders`, highest first.",
  solution="SELECT\n  city,\n  SUM(amount) AS revenue\nFROM dev_training.sales.orders\nGROUP BY city\nORDER BY revenue DESC;",
  keywords=["sum(amount) as revenue", "from dev_training.sales.orders", "group by city", "order by revenue desc"], lang="sql",
  explain="Aggregate with SUM, group by city, sort descending by the alias.")
X("write", 16, 2, ["syntax"], "Task B — PySpark: the same result as Task A in a DataFrame `city_revenue`, displayed.",
  solution='from pyspark.sql import functions as F\n\norders = spark.table("dev_training.sales.orders")\ncity_revenue = (\n    orders\n    .groupBy("city")\n    .agg(F.sum("amount").alias("revenue"))\n    .orderBy(F.desc("revenue"))\n)\ndisplay(city_revenue)',
  keywords=["spark.table(\"dev_training.sales.orders\")", "groupBy(\"city\")", "F.sum(\"amount\").alias(\"revenue\")", "orderBy(F.desc(\"revenue\"))", "display(city_revenue)"], lang="python",
  explain="Same logic, DataFrame API: `spark.table` → `groupBy` → `agg(F.sum().alias())` → `orderBy(F.desc())`.")
X("cloze", 16, 2, ["syntax"], "Task D — complete the parameterized filter.",
  text='dbutils.widgets.[[dropdown]]("city", "Athens", ["Athens", "Volos", "Patras"])\ncity = dbutils.widgets.[[get]]("city")\nresult = (\n    spark.[[table]]("dev_training.sales.orders")\n    .filter(F.col("city") == [[city]])\n)\ndisplay(result)',
  asCode=True,
  explain="Create the dropdown, read it with `get`, read the table with `spark.table`, and compare the column to the Python variable `city`.")
X("mcq", 16, 2, ["concept"], "Task C — after `city_revenue.explain(\"formatted\")`, which operators should you look for, and why?",
  options=["Exchange and Aggregate — GROUP BY city must bring rows with the same city together",
           "Filter and Project — they cause the shuffle", "BroadcastHashJoin — every groupBy is a join",
           "Photon and Delta — they show the table format"], answer=0,
  explain="GROUP BY needs a **shuffle** (Exchange) so same-city rows meet, and **(Hash)Aggregate** operators compute partial and final sums.")
X("free", 16, 2, ["interview"], "Interview Q27: \"What is the difference between a Databricks workspace and compute?\"",
  model="A workspace is the collaborative and operational environment that contains development, orchestration, governance and analytics interfaces, whereas compute is the execution infrastructure used to actually process workloads submitted from those interfaces.",
  rubric=["Workspace = collaborative/operational environment with interfaces", "Compute = execution infrastructure",
          "Workloads are submitted from the workspace and processed on compute"],
  explain="Interfaces vs execution: the workspace is where you work; compute is what does the work.")
X("calc", 16, 1, ["calc"], "Task D with the default widget value (`Athens`): how many rows does `display(result)` show?",
  answer=3, tolerance=0, unit="rows",
  explain="Athens appears in orders 1, 3 and 5 → **3** rows. The widget default is the second argument of `dropdown`.")
X("tf", 16, 1, ["exam", "syntax"], "Task E — the recommended SQL version is `SELECT * FROM dev_training.sales.orders WHERE city = '${city}';`",
  answer=False,
  explain="Use the modern marker: `WHERE city = :city`. `${city}` is legacy/deprecated syntax.")
X("odd", 16, 2, ["concept", "compare"], "Which one doesn't belong?",
  options=["display(df)", "dbutils.widgets.get(\"city\")", "_sqldf", "df.groupBy(\"city\")"], answer=3,
  explain="`display`, `dbutils` and `_sqldf` are **Databricks notebook conveniences**. `df.groupBy` is a portable **Spark API**.")

# ======================= added: d02 order
X("order", 14, 1, ["debug", "exam"], "Order your moves for `TABLE_OR_VIEW_NOT_FOUND` on `spark.table(\"prod.silver.ordres\")`.",
  items=["Run SHOW TABLES IN prod.silver;", "Compare the spelling (ordres vs orders)",
         "Check current_catalog() / current_schema() and SHOW SCHEMAS if the table isn't there",
         "Rewrite with the correct fully qualified name and re-run"],
  explain="SHOW → spell → scope → qualify. All of this is the naming layer — no Spark UI needed.")
