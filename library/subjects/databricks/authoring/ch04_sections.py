# Sections for ch04 — Databricks Platform Tour (source pp. 76–131)

def S(n): return "ch04-s%02d" % n

def p(t): return {"t": "p", "text": t}
def lst(items, ordered=False): return {"t": "list", "items": items, "ordered": ordered}
def code(c, lang="python", caption=None):
    b = {"t": "code", "lang": lang, "code": c}
    if caption: b["caption"] = caption
    return b
def diagram(t, caption=None):
    b = {"t": "diagram", "text": t}
    if caption: b["caption"] = caption
    return b
def table(head, rows, caption=None):
    b = {"t": "table", "head": head, "rows": rows}
    if caption: b["caption"] = caption
    return b
def callout(kind, title, text): return {"t": "callout", "kind": kind, "title": title, "text": text}
def compare(*items): return {"t": "compare", "items": [{"title": a, "points": b} for a, b in items]}
def flow(items, caption=None):
    b = {"t": "flow", "items": items}
    if caption: b["caption"] = caption
    return b
def reveal(l, t): return {"t": "reveal", "label": l, "text": t}
def ask(title, qs): return {"t": "ask", "title": title, "questions": qs}
def terms(pairs): return {"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]}

SECTIONS = []
def sec(n, title, hook, blocks):
    SECTIONS.append({"id": S(n), "title": title, "hook": hook, "blocks": blocks})

# ---------------------------------------------------------------- s01
sec(1, "What Databricks Actually Is",
    "If you think \"Databricks = managed Spark\", every product name will feel random.",
    [
    reveal("Think first: Workspace, Serverless, Compute, SQL Warehouse, Databricks Runtime, Photon, Notebook, Unity Catalog — 8 unrelated products?",
           "No. They are **layers of one model**: where you work (workspace, notebook), what executes (compute: serverless/classic/SQL warehouse), the software on the machines (Runtime), the fast engine (Photon), and who may touch what (Unity Catalog). This chapter builds that model."),
    p("The most dangerous oversimplification is **Databricks = managed Spark**. Historically that was close to the truth. Today it is not."),
    p("Databricks is a **unified data/AI platform**: data engineering, analytics, AI/ML, governance and deployment in one environment. **Apache Spark** is still the central *execution technology* inside it."),
    lst(["**Delta Lake** — the table format", "**Unity Catalog** — governance", "**SQL warehouses** — SQL compute",
         "**Lakeflow** — pipelines/ingestion", "**Serverless compute**", "**Photon** — vectorized engine",
         "ML/AI services, orchestration (Jobs), DevOps tooling"]),
    diagram(
"┌──────────────────── DATABRICKS ────────────────────┐\n"
"│   Notebooks        SQL Editor        Jobs          │\n"
"│       └────────────────┼────────────────┘          │\n"
"│                        ▼                           │\n"
"│              COMPUTE  (Spark / Photon)             │\n"
"│                        ▼                           │\n"
"│              Delta / other data                    │\n"
"│                        ▼                           │\n"
"│              Cloud storage                         │\n"
"│                                                    │\n"
"│   Unity Catalog governs all of these assets        │\n"
"└────────────────────────────────────────────────────┘",
        "Interfaces on top, compute in the middle, data at the bottom, governance across everything."),
    compare(("Spark", ["Mainly an **execution engine**", "Runs transformations, SQL, joins, aggregations",
                       "One technology inside Databricks"]),
            ("Databricks", ["A whole **data/AI platform**", "UI, governance, compute management, orchestration, SQL, ML",
                            "Uses Spark (and Photon) to execute work"])),
    callout("analogy", "Engine vs car", "Spark is the **engine**. Databricks is the whole car: engine, dashboard, keys and locks (governance), navigation (orchestration) and the garage that maintains it."),
    callout("exam", "Classic trap", "Spark is **not** a cloud provider and **not** a file format. Databricks and Spark are **not** synonyms: Spark is one of the core execution technologies *inside* Databricks."),
    ])

# ---------------------------------------------------------------- s02
sec(2, "Account vs Workspace",
    "The first boundary every exam and every admin conversation starts with.",
    [
    p("Imagine a company, **ACME Corporation**, buys Databricks. At the very top sits the **Databricks account** — the organization-level boundary."),
    p("At **account level** you manage users, groups and service principals, workspaces, Unity Catalog metastores, billing and account-level policies. One account can contain **many workspaces**."),
    diagram(
"DATABRICKS ACCOUNT  (organization level)\n"
"│\n"
"├── identities (users, groups, service principals)\n"
"├── billing\n"
"├── account policies\n"
"├── Unity Catalog configuration (metastores)\n"
"│\n"
"├── Workspace A\n"
"├── Workspace B\n"
"└── Workspace C",
        "One account → many workspaces."),
    p("A **workspace** is the operational/collaboration environment where users actually work. Databricks describes it as the environment where workloads such as ingestion, interactive analysis, scheduled jobs and ML training run."),
    lst(["notebooks", "files", "Git folders", "jobs", "pipelines", "SQL queries", "dashboards", "compute", "Catalog Explorer"]),
    p("ACME might have one account with three workspaces: `analytics-prod`, `engineering-dev`, `research`."),
    callout("analogy", "Azure tenant mental model", "**Azure tenant** ≈ organization-wide level; **Databricks account** ≈ organization-wide Databricks level; **workspace** ≈ a specific environment where teams and workloads operate. Not a perfect 1:1 mapping, but a useful mental model."),
    compare(("Data engineer (daily life)", ["Opens `https://....databricks....`", "Sees Workspace, Catalog, Jobs & Pipelines, Compute, SQL…",
                                         "Lives mostly in the **workspace**"]),
            ("Admin (account level)", ["Create workspace", "Configure SSO", "Add account group", "Manage billing"])),
    table(["Operation", "Where it most likely happens"],
          [["Create a notebook", "Workspace"],
           ["Create an organization-wide identity", "Account-level administration"],
           ["Run a Spark query", "Workspace workload, executed on compute"],
           ["Create a second workspace", "Account level"]],
          "Source exercise 2 — memorize the pattern, not the rows."),
    callout("exam", "Which is higher?", "The **account** is the higher organizational object. A workspace never contains an account; an account contains workspaces."),
    ])

# ---------------------------------------------------------------- s03
sec(3, "Control Plane vs Compute Plane",
    "Knowing which plane does what tells you where to look when something breaks.",
    [
    p("Databricks architecture explicitly separates two planes: the **control plane** and the **compute plane**."),
    compare(("CONTROL PLANE — \"manages and coordinates\"",
             ["Databricks-managed backend services", "Web UI (the web app lives here)", "APIs", "Workspace metadata",
              "Job orchestration metadata", "Configuration, platform coordination"]),
            ("COMPUTE PLANE — \"does the work\"",
             ["Actual data processing", "Spark transformations", "SQL execution", "Joins, aggregations", "ML computation"])),
    callout("analogy", "Restaurant", "The **control plane** is the front desk and manager: takes the order, schedules the kitchen, keeps the books. The **compute plane** is the kitchen where the food (your data) is actually cooked."),
    p("Follow one command. In a notebook you write:"),
    code('df.groupBy("country").sum("amount").show()'),
    diagram(
"Browser\n"
"   │\n"
"   ▼\n"
"Databricks control services   (control plane)\n"
"   │  schedule / coordinate execution\n"
"   ▼\n"
"Compute plane\n"
"   ├── Driver / Spark session\n"
"   ├── Workers\n"
"   └── Photon / Spark execution\n"
"   │\n"
"   ▼\n"
"Data storage",
        "The path of one notebook command."),
    callout("pitfall", "Who actually runs groupBy?", "Your **browser does not** run the groupBy. The **control plane is not** where the Spark workload runs. The computation happens in the **compute plane**."),
    reveal("Think first: Browser → Databricks UI → Spark query → ADLS. Which two planes are involved?",
           "The UI / platform coordination belongs to the **control plane**; the Spark computation happens in the **compute plane** (which then reads the data in ADLS storage)."),
    ])

# ---------------------------------------------------------------- s04
sec(4, "Classic vs Serverless Compute",
    "Two compute planes, one fundamental trade-off: control vs convenience.",
    [
    p("Today there are two main kinds of compute plane: the **classic compute plane** and the **serverless compute plane**. Databricks documentation separates them explicitly."),
    p("With **classic compute** you create and configure the resources yourself — a driver VM plus worker VMs — and choose many infrastructure characteristics."),
    diagram(
"Your cloud environment  (e.g. YOUR AWS account)\n"
"│\n"
"├── Driver VM\n"
"├── Worker VM\n"
"├── Worker VM\n"
"└── Worker VM",
        "Classic: resources live in the customer's cloud account (AWS; similar on Azure/GCP)."),
    p("Classic = **more control**, but also **more operational responsibility**."),
    p("With **serverless** you say \"I want compute to run this workload\" — not \"give me 1 driver with X RAM and 8 workers of this VM type\". Databricks takes over most of the provisioning and scaling."),
    diagram(
"YOU: run notebook\n"
"        │\n"
"        ▼\n"
"Databricks\n"
"  ├── allocates compute\n"
"  ├── scales it\n"
"  ├── manages the runtime\n"
"  └── tears down / scales resources as appropriate"),
    callout("key", "Current recommendation", "Databricks today recommends **serverless compute for most interactive and automated workloads**, when it is available and supports your requirements."),
    callout("pitfall", "Serverless ≠ \"no servers\"", "Of course there are servers, CPUs and RAM. **Serverless** means *you* don't manage the underlying server infrastructure the same way — the **abstraction boundary moved**."),
    compare(("SERVERLESS", ["Less infrastructure to manage", "Fast provisioning", "Automatic scaling", "Platform optimizations"]),
            ("CLASSIC", ["More control", "Custom configuration", "Special API / runtime / network needs"])),
    callout("pitfall", "Not \"serverless good, classic useless\"", "Some workloads **still need classic**. Serverless is a default recommendation, not a verdict that classic is obsolete."),
    callout("warn", "Serverless limitations (current)", "Serverless compute **does not support R**, **does not support Spark RDD APIs**, and is built on **Spark Connect** APIs. Old code like `spark.sparkContext.parallelize([1,2,3])` should not be assumed to work in a serverless notebook."),
    code("rdd = spark.sparkContext.parallelize([1, 2, 3])   # RDD API → needs classic compute", caption="Don't assume this runs on serverless."),
    p("**\"Cluster\" vs \"compute\"**: older tutorials say *cluster* everywhere; today's UI/docs prefer the broader word **compute**. Classic Spark compute still has the familiar shape:"),
    diagram(
"            DRIVER\n"
"              │\n"
"     ┌────────┼────────┐\n"
"     ▼        ▼        ▼\n"
"  worker   worker   worker\n"
"\n"
"job → stage → task → partition",
        "Everything you know from Spark still applies on classic compute."),
    ])

# ---------------------------------------------------------------- s05
sec(5, "Compute Types at a Glance: All-Purpose, Jobs, SQL Warehouse",
    "There is no \"the Databricks cluster\" — there are compute types for different workload shapes.",
    [
    p("**All-purpose compute** (classic) is used mostly for **interactive development**: several notebooks can attach to the same compute."),
    diagram(
"Notebook A ─┐\n"
"Notebook B ─┼──► All-purpose compute\n"
"Notebook C ─┘",
        "Good for development, interactive exploration, debugging."),
    callout("pitfall", "All-purpose for automated jobs?", "All-purpose compute is **not** Databricks' first recommendation for automated Jobs. For jobs it recommends **serverless** in most cases, or **classic jobs compute** when you need custom cluster characteristics."),
    p("**Jobs compute**: a pipeline runs at 02:00 (ingest → transform → aggregate). You don't need an interactive cluster open all day — compute exists for the job."),
    flow(["Job starts", "Compute available / provisioned", "Tasks run", "Workload finishes"], "Jobs compute lifecycle"),
    p("Deeper later (Jobs chapters): serverless jobs, classic jobs compute, shared job compute, task-level compute."),
    p("A **SQL warehouse** is a compute resource **optimized for SQL analytics**, used by the SQL editor, dashboards, BI tools and other SQL workloads."),
    code("SELECT country, SUM(revenue)\nFROM prod.gold.sales\nGROUP BY country;", "sql", "A typical query a SQL warehouse executes."),
    diagram(
"Power BI ─────┐\n"
"              │\n"
"SQL Editor ───┼──► SQL Warehouse ───► tables\n"
"              │\n"
"Dashboard ────┘"),
    callout("exam", "SQL warehouse ≠ database", "Here **warehouse** means a **compute resource**, not the place where tables are stored. Tables keep their own data/storage layer; the warehouse only **executes queries**."),
    p("SQL warehouse types today: **Serverless**, **Pro**, **Classic**. There is also **Lakehouse Real-Time** (Beta) for specific low-latency/high-concurrency cases. For most SQL analytics, Databricks recommends a **serverless SQL warehouse** when available."),
    table(["Workload", "Likely compute"],
          [["Notebook: `spark.read.table(\"prod.sales.orders\")`", "Serverless notebook compute or classic all-purpose compute"],
           ["SQL dashboard: `SELECT COUNT(*) FROM prod.sales.orders`", "SQL warehouse"],
           ["Scheduled Python ETL", "Serverless jobs compute or classic jobs compute"]],
          "Different compute types for different workload shapes."),
    flow(["Interactive Python/DataFrames → Serverless notebook compute", "Interactive SQL / BI → Serverless SQL warehouse",
          "Automated Python/SQL job → Serverless Jobs", "Custom cluster config / unsupported feature → Classic",
          "RDD / R requirement → Classic"], "Compute-selection mental model (interview/exam)"),
    callout("interview", "Why a SQL warehouse instead of general Spark compute?", "*A SQL warehouse is purpose-built for SQL analytics and BI workloads and provides SQL-oriented performance, concurrency and scaling capabilities, whereas general notebook or classic compute is suited to broader Spark and programmatic workloads.*"),
    ])

# ---------------------------------------------------------------- s06
sec(6, "Databricks Runtime (DBR), LTS and Runtime ML",
    "Hardware alone runs nothing: the Runtime is the software that makes compute behave a certain way.",
    [
    p("You have a compute machine. Hardware alone is not enough — you need a **software environment**: Spark, Python, Scala, JVM, Delta libraries, Databricks integrations, optimized libraries, system dependencies."),
    p("Databricks packages a **tested software stack** called the **Databricks Runtime (DBR)**."),
    diagram(
"Compute VM            (hardware / infrastructure)\n"
"│\n"
"└── Databricks Runtime  (software)\n"
"      ├── Apache Spark\n"
"      ├── Delta support\n"
"      ├── Python environment\n"
"      ├── libraries\n"
"      ├── Databricks optimizations\n"
"      └── integrations"),
    callout("key", "VM ≠ DBR", "**VM / compute resources** = hardware/infrastructure abstraction. **DBR** = software runtime environment. Same VM type + different DBR can behave differently."),
    p("You will see versions like `17.3 LTS`, `18.x`, `19 Beta`. (In June 2026 the source reports DBR 19 Beta on Spark 4.2.0, with LTS lines like 17.3 and 16.4 still getting maintenance.) **Don't memorize numbers** — understand the consequence:"),
    flow(["Different DBR", "different Spark version", "different Python / packages", "different capabilities & bug fixes", "different behavior"]),
    terms([("LTS", "**Long-Term Support** runtime. Preferred in production when you want stability, predictable maintenance and less frequent migration instead of chasing every new release.")]),
    p("**Runtime debugging story**: DEV runs DBR 18.x, PROD runs DBR 17.3 LTS. `some_new_api(...)` works in dev but raises `AttributeError` in prod. Likely root cause: **runtime version mismatch**."),
    flow(["code", "+ runtime", "+ libraries", "+ configuration"], "Production debugging is never just \"does the Python code have a bug?\""),
    ask("Ask yourself when code works in DEV but fails in PROD", [
        "Which DBR version runs in DEV, and which in PROD?",
        "Does the failing API/library exist in the older runtime?",
        "Are the Python libraries/versions the same in both environments?",
        "Is the configuration (compute, settings) the same?"]),
    p("**Databricks Runtime for Machine Learning (DBR ML)** adds prebuilt ML/DL infrastructure and common ML libraries so you don't build the whole environment yourself."),
    flow(["Standard DBR", "+ ML libraries", "+ ML/DL infrastructure", "= DBR ML"]),
    ])

# ---------------------------------------------------------------- s07
sec(7, "Photon: The Vectorized Engine Under Your Code",
    "Faster SQL/DataFrames without rewriting a single line.",
    [
    p("**Spark** is an execution framework / engine ecosystem. **Photon** is the **Databricks-native vectorized query engine**, designed to accelerate SQL and DataFrame workloads."),
    callout("pitfall", "What Photon is NOT", "Photon is **not** another programming language, **not** a database and **not** a storage format."),
    compare(("Without Photon", ["SQL / DataFrame", "↓ Spark plan", "↓ Spark/JVM execution"]),
            ("With Photon (supported ops)", ["SQL / DataFrame", "↓ query plan", "↓ Photon-native execution"])),
    p("The key point: you write the **same SQL/DataFrame code**. The optimization happens **beneath the API abstraction**."),
    code('result = (\n    spark.table("prod.sales.orders")\n    .groupBy("country")\n    .sum("amount")\n)\n# NOT: photon.groupBy(...)  ← no such API'),
    reveal("Think first: why would processing a batch of values be faster than one row at a time?",
           "Row-at-a-time pays per-row overhead (row 1 → process, row 2 → process…). **Vectorized** processing works on a batch `[v1 v2 v3 v4 …]` at once, exploiting CPU characteristics — less overhead, better CPU efficiency. (C++/SIMD internals come in the performance chapter.)"),
    diagram(
"Row-at-a-time:   row1 → process\n"
"                 row2 → process\n"
"                 row3 → process\n"
"\n"
"Vectorized:      [v1 v2 v3 v4 ...] → operate on the whole batch"),
    callout("key", "Where Photon is on", "Photon is **enabled on serverless compute and SQL warehouses**. On **classic** compute it is also available and usually enabled by default through the corresponding configuration."),
    callout("interview", "What is Photon?", "*Photon is Databricks' native vectorized execution engine that accelerates supported SQL and DataFrame operations underneath the existing APIs, so applications generally do not need a separate Photon-specific programming model.*"),
    ])

# ---------------------------------------------------------------- s08
sec(8, "Notebooks: Cells, Compute Attachment, display() vs show()",
    "A notebook is a document — it does nothing until it is attached to compute.",
    [
    p("A Databricks **notebook** is an interactive document made of **cells** — e.g. Cell 1 Python, Cell 2 SQL, Cell 3 Markdown, Cell 4 Python. Notebooks support **Python, SQL, Scala and R**, depending on the compute/runtime."),
    callout("key", "The notebook alone executes nothing", "A notebook is a code/document **artifact**. Even `print(\"hello\")` needs an **active execution session** on compute."),
    diagram(
"Notebook\n"
"   │  attach / connect\n"
"   ▼\n"
"Compute\n"
"   │\n"
"   ▼\n"
"execution"),
    p("In **Unity Catalog-enabled workspaces**, Databricks can **auto-attach** a new notebook to **serverless compute** when you run a cell without having chosen other compute."),
    p("Your first real notebook cell:"),
    code('data = [\n    (1, "Athens", 120.0),\n    (2, "Volos", 80.0),\n    (3, "Athens", 50.0),\n    (4, "Patras", 200.0),\n    (5, "Athens", 30.0),\n]\n\ndf = spark.createDataFrame(\n    data,\n    ["order_id", "city", "amount"]\n)\n\ndisplay(df)'),
    p("You never created `spark` — in a Databricks notebook a ready-made **Spark session** exists on supported compute."),
    flow(["Python list", "spark.createDataFrame()", "Spark DataFrame"], "Inferred schema: order_id: long · city: string · amount: double"),
    compare(("df.show()", ["**Spark API** (core PySpark)", "Text-oriented output", "Works anywhere Spark runs"]),
            ("display(df)", ["**Databricks notebook/platform helper**", "Richer rendering, easy table/visualizations", "Not a core PySpark DataFrame method"])),
    callout("pitfall", "Porting code out of Databricks", "`display()` is a notebook convenience. If you move code outside Databricks (plain PySpark, a library, a test), `display` won't exist — use Spark APIs such as `df.show()`."),
    ])

# ---------------------------------------------------------------- s09
sec(9, "Transformations, Physical Plans and Lazy Evaluation",
    "Databricks doesn't hide your Spark knowledge — it leans on it.",
    [
    code('from pyspark.sql import functions as F\n\ncity_sales = (\n    df\n    .groupBy("city")\n    .agg(\n        F.sum("amount").alias("total_sales"),\n        F.count("*").alias("orders")\n    )\n    .orderBy(F.desc("total_sales"))\n)\n\ndisplay(city_sales)'),
    table(["city", "total_sales", "orders"], [["Athens", "200.0", "3"], ["Patras", "200.0", "1"], ["Volos", "80.0", "1"]],
          "Athens = 120 + 50 + 30. (Athens and Patras tie at 200.0, so their relative order is not guaranteed.)"),
    p("`groupBy(\"city\")` most likely needs a **shuffle**, so that all rows with the same city key end up in the same downstream partition."),
    code('city_sales.explain("formatted")\n# or\ncity_sales.explain("extended")', caption="See the physical plan."),
    diagram(
"HashAggregate   (final)\n"
"Exchange        ← redistribution / shuffle boundary\n"
"HashAggregate   (partial, per partition)\n"
"Sort",
        "Operators you will typically see for groupBy + orderBy."),
    callout("key", "Exchange = shuffle", "In a physical plan, **Exchange** is usually where you see a redistribution/shuffle boundary."),
    reveal("Think first: why does `df.filter(F.col(\"amount\") > 100)` usually need no shuffle, while `df.groupBy(\"city\").sum(\"amount\")` probably does?",
           "A **filter** can be decided independently inside each existing partition (partition 1 → filter locally, partition 2 → filter locally…). For **groupBy(\"city\")**, all rows with `city = Athens` must be combined logically even if they started in different partitions → **redistribution/shuffle**."),
    p("**What really happens when you press Run** (interview level):"),
    flow(["Notebook cell", "Python runs in active compute session", "Spark builds logical transformations", "Action/display needs a result",
          "Catalyst analysis & optimization", "Physical execution plan", "Spark / Photon execution", "Tasks process partitions (scan, filter, shuffle for groupBy)"]),
    p("**Lazy evaluation remains**: `orders = spark.table(...)`, `x = orders.filter(...)`, `y = x.groupBy(...).sum(...)` only **describe** computation."),
    code("display(y)      # action\ny.count()       # action\ny.write...      # action", caption="These force evaluation. Databricks doesn't change this basic Spark logic."),
    callout("exam", "filter() ≠ processed", "After `df.filter(...)` no data has necessarily been processed yet: the transformation only extends the plan. Execution happens when an action/result is requested."),
    ])

# ---------------------------------------------------------------- s10
sec(10, "Magic Commands, spark.table(), spark.sql() and _sqldf",
    "One notebook, several languages — and they all meet at the same tables.",
    [
    p("Say the notebook's **default language is Python**. A cell starting with **`%sql`** means: *interpret this cell as SQL*."),
    table(["Magic", "What the cell becomes"],
          [["`%python`", "Python cell"], ["`%sql`", "SQL cell"], ["`%scala`", "Scala cell"], ["`%r`", "R cell"],
           ["`%md`", "Markdown (documentation) cell"], ["`%pip`", "Install notebook-scoped Python libraries"]],
          "Magic commands listed in the source."),
    code("%python\nx = 5\nprint(x * 2)"),
    code("%sql\nSELECT current_timestamp() AS now;", "sql"),
    code("%md\n# Sales Analysis\nThis is the daily sales notebook.", "text"),
    code("%pip install requests"),
    callout("pitfall", "%pip is notebook-scoped", "`%pip` installs **notebook-scoped** Python libraries (scoped to the notebook/session context). Don't assume it is a permanent installation for the whole workspace."),
    p("**SQL and Python in the same flow**: both of these can point to the same logical table `main.sales.orders`."),
    compare(("Python", ['`orders = spark.table("main.sales.orders")`', "`display(orders)`"]),
            ("SQL", ["`%sql`", "`SELECT * FROM main.sales.orders;`"])),
    flow(["UC name prod.silver.orders", "resolve metadata", "table", "Spark DataFrame"], "spark.table(\"catalog.schema.table\")"),
    code('df = spark.sql("""\n    SELECT country, SUM(amount) AS revenue\n    FROM prod.silver.orders\n    GROUP BY country\n""")\ndisplay(df)', caption="spark.sql() returns a DataFrame: SQL statement → Spark SQL → DataFrame."),
    p("**`_sqldf`**: in supported notebook environments, the result of a `%sql` cell becomes available to **subsequent Python** code as `_sqldf`."),
    code("%sql\nSELECT * FROM prod.silver.orders WHERE amount > 100;", "sql"),
    code("display(_sqldf)   # next Python cell: result of the SQL cell above"),
    callout("warn", "Interactive only", "`_sqldf` is a handy interactive feature. **Don't build production architecture on it** — use `spark.sql()` / `spark.table()` and named DataFrames."),
    ])

# ---------------------------------------------------------------- s11
sec(11, "Widgets and SQL Parameters (:param, IDENTIFIER)",
    "Stop editing code to change a country — parameterize the notebook.",
    [
    p("You want the notebook to run for different countries. **Bad**: `country = \"GR\"` and edit the code by hand each time."),
    code('dbutils.widgets.dropdown(\n    "country",          # name\n    "GR",               # default value\n    ["GR", "DE", "FR"], # choices\n    "Country"           # label shown in the UI\n)\n\ncountry = dbutils.widgets.get("country")\n\nfiltered = (\n    spark.table("prod.silver.orders")\n    .filter(F.col("country") == country)\n)\ndisplay(filtered)', caption="Create → read → use."),
    flow(["Create widget (dbutils.widgets.dropdown/text)", "Read it (dbutils.widgets.get)", "Use the value in filter/SQL", "display()"]),
    terms([("Widgets", "Notebook input controls for **parameterized notebooks/dashboards**. Types include **text**, **dropdown**, **combobox** (and others, e.g. multiselect)."),
           ("dbutils.widgets.get(name)", "Returns the widget's current value (as a string) to Python code.")]),
    p("**Modern SQL parameter markers** use **`:parameter`** — not the older **`${parameter}`**, which is **deprecated for DBR 15.2+**."),
    code('dbutils.widgets.text("country", "GR")', caption="Python cell"),
    code("%sql\nSELECT *\nFROM prod.silver.orders\nWHERE country = :country;", "sql", "SQL cell — modern parameter marker"),
    callout("exam", ":country, not ${country}", "Learn today's syntax, not old tutorials: `:country` is current; `${country}` is legacy/deprecated."),
    reveal("Think first: a widget holds `table = orders`. Why can't you just write `SELECT * FROM :table`?",
           "A **parameter value** and a **SQL identifier** are different semantic categories. `WHERE country = :country` inserts a *value*; `FROM ...` needs an *identifier* (an object name). Use **`IDENTIFIER(:table_name)`** for parameterized object names."),
    code("SELECT *\nFROM IDENTIFIER(:table_name);", "sql"),
    callout("pitfall", "Value vs identifier", "Parameter markers stand for **values**. For table/column/schema names use **`IDENTIFIER()`**. Literal vs identifier vs parameter vs expression is a frequent source of SQL bugs (covered in depth later)."),
    ])

# ---------------------------------------------------------------- s12
sec(12, "Catalog Explorer, SHOW/DESCRIBE and Your First Delta Table",
    "Find data by clicking, confirm it by SQL — then create a real table.",
    [
    p("On the left of the workspace you'll find **Catalog / Catalog Explorer**: discovery of Unity Catalog objects."),
    diagram(
"catalog\n"
"  └── schema\n"
"        ├── tables\n"
"        ├── views\n"
"        ├── volumes\n"
"        ├── functions\n"
"        └── models ...\n"
"\n"
"prod\n"
"├── bronze\n"
"│   └── raw_orders\n"
"├── silver\n"
"│   └── orders\n"
"└── gold\n"
"    └── daily_sales"),
    callout("key", "Discovery needs privileges", "Catalog Explorer requires suitable privileges such as **BROWSE** and/or the corresponding **data access privileges** to see objects."),
    code("SHOW CATALOGS;\nSHOW SCHEMAS IN prod;\nSHOW TABLES IN prod.silver;\nDESCRIBE TABLE prod.silver.orders;\nDESCRIBE DETAIL prod.silver.orders;", "sql",
         "Drill down level by level. These become your basic debugging tools."),
    terms([("DESCRIBE TABLE", "Shows the table's columns and data types."),
           ("DESCRIBE DETAIL", "Shows table-level details (format, location, size, number of files…).")]),
    code("CREATE SCHEMA IF NOT EXISTS dev_training.sales;", "sql", "Catalog dev_training, schema sales."),
    code("CREATE TABLE dev_training.sales.orders (\n  order_id    BIGINT,\n  customer_id BIGINT,\n  amount      DECIMAL(10,2),\n  country     STRING,\n  order_ts    TIMESTAMP\n)\nUSING DELTA;", "sql"),
    diagram(
"Unity Catalog\n"
"   │  name / metadata / permissions\n"
"   ▼\n"
"dev_training.sales.orders\n"
"   │  table format\n"
"   ▼\n"
"Delta\n"
"   │  files + transaction state\n"
"   ▼\n"
"storage",
        "Connect the layers: UC names & governs, Delta formats, storage holds bytes."),
    code("INSERT INTO dev_training.sales.orders\nVALUES\n  (1, 101, 20.50, 'GR', CURRENT_TIMESTAMP()),\n  (2, 102, 90.00, 'DE', CURRENT_TIMESTAMP()),\n  (3, 103, 15.25, 'GR', CURRENT_TIMESTAMP());\n\nSELECT * FROM dev_training.sales.orders;", "sql",
         "A real table workflow — not a toy DataFrame living only in RAM."),
    code('orders = spark.table("dev_training.sales.orders")\n\ngreek_orders = orders.filter(F.col("country") == "GR")\ndisplay(greek_orders)\n\n(orders\n  .groupBy("country")\n  .agg(F.sum("amount").alias("revenue"))\n  .display())          # if .display() isn\'t supported, use display(...)', caption="The same table from Python."),
    callout("exam", "Compute lifetime ≠ data lifetime", "If compute stops, your Delta table is **not** lost — it lives in persistent storage. Compute can come and go; data persists."),
    ])

# ---------------------------------------------------------------- s13
sec(13, "Namespaces and Fully Qualified Names",
    "`orders` might silently mean dev — `prod.silver.orders` can't.",
    [
    p("`prod.silver.orders` is a **Unity Catalog three-level namespace**: **catalog.schema.table**."),
    table(["Part", "Level"], [["`prod`", "catalog"], ["`silver`", "schema"], ["`orders`", "object / table"]]),
    p("Good production habit: write **`catalog.schema.table`** instead of just `orders`."),
    reveal("Think first: your current context is `dev.sales` and you run `SELECT * FROM orders;`. What do you read?",
           "You read **`dev.sales.orders`** — while you may have believed you were reading `prod.sales.orders`. No error, just the wrong data. Very dangerous."),
    code("SELECT current_catalog();\nSELECT current_schema();", "sql", "Check the current namespace."),
    code("USE CATALOG prod;\nUSE SCHEMA silver;\n\nSELECT * FROM orders;   -- now resolves to prod.silver.orders", "sql"),
    callout("pitfall", "Unqualified names resolve against the current context", "A short name is resolved using the **current catalog and schema**. For production transformations prefer the fully qualified `prod.silver.orders`."),
    ask("Ask yourself before running a query with a short table name", [
        "What are current_catalog() and current_schema() right now?",
        "Could the same table name exist in dev and prod?",
        "Would a fully qualified name remove any doubt?"]),
    ])

# ---------------------------------------------------------------- s14
sec(14, "Debugging by Layer: Cases A–D",
    "Find the failing layer first — don't jump to shuffles when the notebook isn't even attached.",
    [
    p("A **notebook cell is stuck**. Don't start by inspecting Spark shuffle. First decide **which layer** the failure is in."),
    flow(["Compute attached?", "Compute running?", "Session healthy?", "Code parsed?", "Table exists?", "Permission?", "Query plan?", "Runtime execution?"],
         "The layer ladder — top to bottom."),
    table(["Case", "Symptom", "Layer", "First move"],
          [["A", "notebook not attached", "Execution environment (not Spark code)", "Attach / start compute"],
           ["B", "`TABLE_OR_VIEW_NOT_FOUND`", "Naming / namespace", "`SHOW TABLES IN prod.silver;`"],
           ["C", "`INSUFFICIENT_PRIVILEGES`", "Governance / authorization", "Which principal? USE CATALOG / USE SCHEMA / SELECT?"],
           ["D", "`ModuleNotFoundError`", "Runtime / environment / dependency", "`%pip install` (notebook) or managed deps (prod)"]]),
    code('spark.table("prod.silver.ordres")   # → TABLE_OR_VIEW_NOT_FOUND', caption="Case B: typo 'ordres' instead of 'orders' — or wrong catalog/schema."),
    ask("Ask yourself on TABLE_OR_VIEW_NOT_FOUND", [
        "Does SHOW TABLES IN <catalog>.<schema> list the table?",
        "Did I spell the table name exactly (ordres vs orders)?",
        "Am I in the catalog/schema I think I am?",
        "Did I use a fully qualified name?"]),
    code("SELECT * FROM prod.finance.transactions;  -- → INSUFFICIENT_PRIVILEGES", "sql", "Case C"),
    ask("Ask yourself on INSUFFICIENT_PRIVILEGES / PERMISSION_DENIED", [
        "Which principal am I (or is the job running as)?",
        "Do I have USE CATALOG on the catalog?",
        "Do I have USE SCHEMA on the schema?",
        "Do I have SELECT on the table?"]),
    callout("pitfall", "Wrong layer, wrong tool", "A permission error is a **governance** problem — you don't look at Spark partitions. A `ModuleNotFoundError` is an **environment** problem — not a data problem."),
    code("import some_library        # ModuleNotFoundError\n%pip install some-library   # notebook fix", caption="Case D. In production, manage dependencies systematically, not with ad-hoc %pip."),
    callout("debug", "Works when I run it, fails as a scheduled job", "Notebook works for you, but the scheduled job gets `PERMISSION_DENIED`. First serious hypothesis: a **different execution identity/principal** runs the job."),
    callout("debug", "Works in DEV, ModuleNotFoundError in PROD", "Check early: (1) the **Databricks Runtime version**, (2) the **Python/library environment**."),
    ])

# ---------------------------------------------------------------- s15
sec(15, "Slow Queries: Case E and the Debugging Tree",
    "\"It's slow, get a bigger cluster\" is a guess, not a diagnosis.",
    [
    p("**Case E — the query runs but is slow.** *Now* you start looking at Spark."),
    lst(["Physical plan", "Spark UI", "tasks", "shuffle", "skew", "spill", "input bytes", "partition counts", "join strategy"]),
    callout("pitfall", "Slow ≠ small cluster", "A slow query does **not** automatically mean the cluster is too small. That habit should disappear from day one."),
    code('result = (\n    spark.table("prod.silver.orders")\n    .join(spark.table("prod.silver.customers"), "customer_id")\n    .groupBy("country")\n    .agg(F.sum("amount"))\n)\ndisplay(result)     # runs for 40 minutes', caption="A real debugging case."),
    diagram(
"Is compute actually healthy?\n"
"            │\n"
"            ▼\n"
"How much input data?\n"
"            │\n"
"            ▼\n"
"What physical join?\n"
"     ┌──────┴──────┐\n"
"     ▼             ▼\n"
"   BHJ?          SMJ?\n"
"     │             │\n"
"     ▼             ▼\n"
" reasonable?   huge shuffle?\n"
"                   │\n"
"                   ▼\n"
"                 skew?\n"
"                   │\n"
"                   ▼\n"
"             spill to disk?\n"
"                   │\n"
"                   ▼\n"
"         tiny files / bad layout?",
        "BHJ = broadcast hash join, SMJ = sort-merge join. Real Spark UI examples come later."),
    reveal("Think first: a junior says \"we need a bigger cluster\". What's wrong with that reasoning?",
           "No **root cause** has been identified. It could be skew, a wrong join, a huge shuffle, spill, poor table layout, small files, an unnecessary scan, a bad query, insufficient statistics — or a genuine compute bottleneck. Cluster sizing is only **one** possibility."),
    ask("Ask yourself when a query is slow", [
        "Is the compute actually healthy?",
        "How much input data am I really reading?",
        "Which physical join did Spark pick (BHJ or SMJ)?",
        "Is there a huge shuffle (Exchange)?",
        "Is the data skewed?",
        "Are tasks spilling to disk?",
        "Are there tiny files or a bad table layout?"]),
    ])

# ---------------------------------------------------------------- s16
sec(16, "Mini-Project, Mental Buckets and Recap",
    "Put it all together in one parameterized notebook — then sort every term into the right bucket.",
    [
    code("CREATE TABLE IF NOT EXISTS dev_training.sales.orders (\n  order_id    BIGINT,\n  customer_id BIGINT,\n  city        STRING,\n  amount      DECIMAL(10,2),\n  order_date  DATE\n) USING DELTA;\n\nINSERT INTO dev_training.sales.orders VALUES\n (1, 101, 'Athens', 100.00, DATE'2026-09-10'),\n (2, 102, 'Volos',   80.00, DATE'2026-09-10'),\n (3, 101, 'Athens',  30.00, DATE'2026-09-11'),\n (4, 103, 'Patras', 150.00, DATE'2026-09-11'),\n (5, 104, 'Athens', 200.00, DATE'2026-09-12'),\n (6, 102, 'Volos',   40.00, DATE'2026-09-12');", "sql",
         "Setup (works on Free / normal workspaces, depending on your access)."),
    code("-- Task A: revenue per city\nSELECT city, SUM(amount) AS revenue\nFROM dev_training.sales.orders\nGROUP BY city\nORDER BY revenue DESC;", "sql"),
    code('# Task B: same in PySpark\nfrom pyspark.sql import functions as F\norders = spark.table("dev_training.sales.orders")\ncity_revenue = (\n    orders.groupBy("city")\n    .agg(F.sum("amount").alias("revenue"))\n    .orderBy(F.desc("revenue"))\n)\ndisplay(city_revenue)\n\n# Task C: physical plan → look for Exchange and Aggregate\ncity_revenue.explain("formatted")'),
    code('# Task D: parameter\ndbutils.widgets.dropdown("city", "Athens", ["Athens", "Volos", "Patras"])\ncity = dbutils.widgets.get("city")\nresult = (\n    spark.table("dev_training.sales.orders")\n    .filter(F.col("city") == city)\n)\ndisplay(result)'),
    code("%sql\n-- Task E: SQL version with the modern marker\nSELECT *\nFROM dev_training.sales.orders\nWHERE city = :city;", "sql"),
    table(["When you see…", "Think…"],
          [["`spark.table(...)`", "Spark API"], ["`display(...)`", "Databricks notebook convenience"],
           ["`prod.silver.orders`", "Unity Catalog namespace"], ["Serverless", "Databricks-managed compute infrastructure"],
           ["SQL Warehouse", "SQL-optimized compute"], ["Photon", "Vectorized native execution engine"],
           ["DBR 17.3", "Software/runtime environment"]],
          "Not everything goes into one mental bucket called \"Databricks stuff\"."),
    diagram(
"ACCOUNT\n"
"  └── WORKSPACE\n"
"        ├── Notebook\n"
"        ├── SQL Editor\n"
"        ├── Jobs\n"
"        └── Pipelines\n"
"              │\n"
"              ▼\n"
"           COMPUTE\n"
"        ┌─────┴─────┐\n"
"   Serverless    Classic\n"
"        └─────┬─────┘\n"
"       Spark / Photon\n"
"              │\n"
"              ▼\n"
"        Delta Tables\n"
"              │\n"
"              ▼\n"
"      Persistent Storage",
        "Your first Databricks execution model."),
    compare(("Python you now know", ["`spark.table(...)`", "`spark.sql(...)`", "`df.explain(...)`", "`display(...)`", "`dbutils.widgets...`"]),
            ("SQL you now know", ["`SHOW CATALOGS / SCHEMAS / TABLES`", "`CREATE SCHEMA`", "`CREATE TABLE ... USING DELTA`", "`INSERT INTO`, `SELECT`", "`USE CATALOG`, `USE SCHEMA`"]),
            ("Notebook constructs", ["`%python`", "`%sql`", "`%md`", "`%pip`"])),
    callout("interview", "Workspace vs compute", "*A workspace is the collaborative and operational environment that contains development, orchestration, governance and analytics interfaces, whereas compute is the execution infrastructure used to actually process workloads submitted from those interfaces.*"),
    ])
