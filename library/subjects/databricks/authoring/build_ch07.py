import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from c78_common import *

CID = "ch07"
b = Builder(CID)
OUT = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------------------ SECTIONS
S = []

# s01 ---------------------------------------------------------------
S.append({"id": "ch07-s01", "title": "Compute = a Configuration Vector",
 "hook": "Serverless, Classic, All-purpose, Photon… are not 20 rival products — they are settings of ONE thing.",
 "blocks": [
  P("Your code is just text. `spark.table(\"prod.sales.orders\").groupBy(\"country\").sum(\"amount\")` computes nothing until it gets real resources."),
  CODE("python", 'df = spark.table("prod.sales.orders")\ndf.groupBy("country").sum("amount").display()', "Code alone does no computation"),
  P("Those resources are **CPU, RAM, network, possibly GPU, a Spark driver and Spark executors**. Databricks calls the whole bundle **compute**."),
  R("Think first: Serverless, Classic, All-purpose, Jobs, Standard, Dedicated, Single-node, Autoscaling, GPU, Photon… how many *compute types* is that?",
    "Almost none of them are types. Most are **different characteristics of the same compute** — like colour, engine and gearbox are characteristics of one car, not competing cars."),
  P("You will meet all these words: Serverless, Classic, All-purpose, Jobs, Pipeline, Standard, Dedicated, Single-node, Multi-node, Fixed-size, Autoscaling, CPU, GPU, Photon, non-Photon, SQL Serverless, SQL Pro, SQL Classic."),
  C("key", "One compute, many axes", "A single compute can be **Classic + All-purpose + Standard access + Multi-node + Autoscaling + CPU + Photon + DBR 17.3 LTS**. That whole list is ONE compute configuration."),
  D("""
Compute = (
  workload purpose,      e.g. interactive
  infrastructure model,  e.g. classic
  access mode,           e.g. standard
  topology,              e.g. multi-node
  scaling,               e.g. autoscaling
  hardware,              e.g. CPU
  runtime,               e.g. DBR 17.3
  execution engine       e.g. Photon
)""", "Think of compute as a vector of 8 axes"),
  C("analogy", "Ordering a car", "\"Diesel\", \"automatic\" and \"red\" are not three cars. They are three answers to three different questions about ONE car. Same with \"classic\", \"all-purpose\" and \"Photon\"."),
  C("pitfall", "Flat-list thinking", "Reading the compute page as a flat list of 12+ competing products is the root of most confusion. Always ask: *which axis does this word belong to?*"),
 ]})

# s02 ---------------------------------------------------------------
S.append({"id": "ch07-s02", "title": "Axis 1 & 2: Purpose vs Infrastructure",
 "hook": "\"What do I want to do?\" and \"Who manages the machines?\" are two completely different questions.",
 "blocks": [
  P("**Axis 1 — workload purpose** answers: *what do I want to do?* There are four basic categories."),
  T(["Workload", "What it means"], [
     ["Interactive", "I sit in a notebook and run cells"],
     ["Job", "Code runs automatically / on a schedule"],
     ["Pipeline", "A Lakeflow declarative data pipeline"],
     ["SQL", "SQL analytics, dashboards, BI"]], "Axis 1 — purpose"),
  P("**Axis 2 — infrastructure model** answers: *who manages the machines?* Two options: **Serverless** or **Classic**."),
  CMP(("Serverless", ["You say: \"run the workload\"", "Databricks manages machines, instance types, scaling, server-side runtime, infrastructure lifecycle", "You do NOT define 1 driver, 8 workers, m5.4xlarge, DBR X, min 2 / max 10", "Infrastructure is Databricks-managed"]),
      ("Classic", ["You (or a compute policy) define much more", "VM type, driver, workers, runtime, autoscaling, access mode, Photon, spot instances…", "Classic all-purpose, jobs and pipeline compute are resources YOU create and configure", "They run in the customer's cloud account/environment"])),
  C("key", "Different axes", "Purpose (interactive/job/pipeline/SQL) is a completely different axis from serverless/classic. Every purpose has to be combined with an infrastructure model."),
  C("analogy", "Taxi vs your own car", "Serverless = taxi: you give the destination, the company handles the vehicle. Classic = your own car: you choose the model, engine, tyres and you pay for parking while it sits idle."),
  R("Think first: a cluster with `m5.4xlarge` workers, 2–10 autoscaling and DBR 17.3 LTS — serverless or classic?",
    "**Classic.** Picking VM types, worker counts and a DBR version are exactly the decisions serverless takes away from you."),
 ]})

# s03 ---------------------------------------------------------------
S.append({"id": "ch07-s03", "title": "The Workload × Infrastructure Matrix",
 "hook": "The first map to memorise: every workload has a serverless and a classic flavour — with different product names.",
 "blocks": [
  P("**All-purpose does NOT mean non-serverless.** It roughly means: *reusable interactive classic Spark compute* — the thing you attach notebooks to while experimenting."),
  D("""
09:00 Nikos opens notebook
  ↓ attaches notebook to cluster
09:10 run cell
09:30 another cell
10:20 debugging
11:00 another notebook attaches""", "All-purpose = a reusable resource that lives across sessions"),
  P("Is there a *serverless all-purpose*? Conceptually yes (interactive + serverless), but Databricks does not call it that. It is named **Serverless compute for notebooks**."),
  D("""
INTERACTIVE COMPUTE
├── Serverless → Serverless notebook compute
└── Classic    → Classic all-purpose compute

AUTOMATED WORKLOAD
├── Serverless → Serverless Jobs compute
└── Classic    → Classic Jobs compute

LAKEFLOW PIPELINE
├── Serverless → Serverless pipeline compute
└── Classic    → Classic pipeline compute""", "Same split, three times"),
  T(["Purpose", "Serverless", "Classic"], [
     ["Interactive notebook", "Serverless notebook compute", "All-purpose compute"],
     ["Automated job", "Serverless Jobs compute", "Jobs compute"],
     ["Lakeflow pipeline", "Serverless pipeline", "Classic pipeline"],
     ["SQL / BI", "Serverless SQL warehouse", "Pro / Classic SQL warehouse"]], "THE matrix to memorise: Workload × Infrastructure"),
  P("Databricks today recommends **serverless** for most new notebook, job and pipeline workloads."),
  C("exam", "Different axes — but a constrained matrix", "There is no UI with \"Purpose: ☑ all-purpose\" + \"Infrastructure: ☑ serverless\" that produces a \"serverless all-purpose cluster\". interactive + classic is *named* classic all-purpose compute; interactive + serverless is *named* serverless notebook compute. Think **constrained matrix**, not a free Cartesian product."),
  C("pitfall", "\"Serverless is the opposite of all-purpose\"", "Wrong level. The opposite of serverless is **classic**. All-purpose describes the interactive/reusable *lifecycle* of a classic compute."),
 ]})

# s04 ---------------------------------------------------------------
S.append({"id": "ch07-s04", "title": "The Full Compute Family Tree",
 "hook": "Ten compute types to master — six Spark/general, four SQL — arranged as a tree, not a flat list.",
 "blocks": [
  P("For data engineering and analytics you need these **Spark/general compute** types:"),
  L(["Serverless notebook compute", "Classic all-purpose compute", "Serverless Jobs compute", "Classic Jobs compute", "Serverless Lakeflow pipeline compute", "Classic Lakeflow pipeline compute"], True),
  P("The official docs split serverless into **notebooks, jobs and pipelines**, while classic covers **all-purpose, jobs and pipeline** resources."),
  P("**SQL compute is a separate family** — SQL Warehouses: (7) Serverless SQL Warehouse, (8) Pro SQL Warehouse, (9) Classic SQL Warehouse, and now (10) **Lakehouse Real-Time SQL Warehouse [Beta]** for very low-latency / high-concurrency read workloads."),
  D("""
DATABRICKS COMPUTE
├── General Spark compute
│   ├── Interactive
│   │   ├── Serverless notebook
│   │   └── Classic all-purpose
│   ├── Automated
│   │   ├── Serverless Jobs
│   │   └── Classic Jobs
│   └── Lakeflow pipelines
│       ├── Serverless pipeline
│       └── Classic pipeline
└── SQL Compute
    ├── Serverless SQL Warehouse
    ├── Pro SQL Warehouse
    ├── Classic SQL Warehouse
    └── Lakehouse Real-Time [Beta]""", "A far better mental model than a flat list of 10"),
  P("Other products also run on serverless infrastructure — **model serving, data-quality monitoring, predictive optimization** — but they are managed from separate product surfaces. Don't put them in the same bucket yet."),
  P("There is also **AI Runtime** (Preview) for serverless GPU / deep-learning workloads."),
  C("tip", "What to master first", "As a data engineer, master the 9–10 compute types above first. Model serving, AI Runtime etc. come later."),
 ]})

# s05 ---------------------------------------------------------------
S.append({"id": "ch07-s05", "title": "All-purpose vs Jobs: Two Lifecycles",
 "hook": "All-purpose lives on between your cells; Jobs compute is born with the run and dies with it.",
 "blocks": [
  P("**All-purpose, concretely:** you create `my-dev-cluster` with Runtime 17.3 LTS, 2–8 workers, autoscaling ON, Standard access."),
  D("""
Notebook A ─┐
Notebook B ─┼──► my-dev-cluster
Notebook C ─┘""", "Many notebooks share one reusable cluster"),
  P("The cluster exists independently of any specific job. You run `spark.read.table(...)`, pause 10 minutes, run another command, debug… That is **all-purpose**: a reusable classic resource not created for one automated run."),
  P("**Jobs compute:** a job runs Bronze → Silver at 02:00. You don't need a cluster sitting open at 08:00, 12:00, 18:00."),
  F(["JOB START", "compute starts", "run pipeline", "job ends", "compute goes away"], "Jobs compute lifecycle"),
  P("In **Classic Jobs Compute** you define the cluster configuration; in **Serverless Jobs** Databricks manages it."),
  C("warn", "Job on all-purpose? Technically yes", "Many job task types *can* run on a classic all-purpose cluster, but Databricks does NOT recommend it for production — it prefers serverless jobs or classic jobs compute."),
  D("""
my-dev-cluster (all-purpose)
├── Developer A: running a query
├── Developer B: debugging
└── Job C: production ETL
      → all compete for CPU, RAM,
        executors, shuffle bandwidth""", "Why production jobs suffer on shared all-purpose"),
  P("One developer can destroy the **performance predictability** of the production job."),
  C("pitfall", "The name is misleading", "**All-purpose ≠ \"can do / best for all workloads\".** It means *generic reusable interactive compute*."),
 ]})

# s06 ---------------------------------------------------------------
S.append({"id": "ch07-s06", "title": "Access Mode: Standard vs Dedicated",
 "hook": "Who may use this classic compute, and how are users isolated?",
 "blocks": [
  P("**Access mode** is the next axis. It applies mainly to **classic all-purpose and jobs** compute: **Standard** vs **Dedicated**."),
  D("""
Classic cluster (Standard access)
┌────────────────────────┐
│  Nikos workload        │
│  Maria workload        │
│  John workload         │
└────────────────────────┘
many users, workload isolation""", "Standard = shared with isolation"),
  P("**Standard**: many users can use the same compute with workload isolation. Databricks recommends Standard for **most classic workloads**."),
  P("**Dedicated**: the compute is assigned to **one user or a specific group** and is not general shared compute. Used when workloads/features need a more direct environment — e.g. some **ML / GPU / R** scenarios."),
  T(["Lifecycle", "Standard", "Dedicated"], [
     ["All-purpose", "✅", "✅"],
     ["Jobs", "✅", "✅"],
     ["Pipeline", "own pipeline configuration model", "own pipeline configuration model"]], "Classic compute matrix — a real second axis"),
  P("So valid combos include Classic + All-purpose + Standard, Classic + All-purpose + Dedicated, Classic + Jobs + Standard, Classic + Jobs + Dedicated."),
  R("Think first: does serverless have the Standard/Dedicated dropdown?",
    "**No, not in the same way.** You don't create a cluster, so you never write `Access mode = Dedicated`, `Workers = 8`. Those are platform-managed choices. E.g. **serverless Jobs uses Standard access-mode semantics** and requires a workload compatible with Standard compute."),
  C("exam", "Terminology trap: \"standard compute\"", "\"Standard compute\" does NOT mean normal/basic compute. Today it means **classic compute configured with Standard access mode**. Likewise **\"Dedicated compute\" = classic compute configured with Dedicated access mode**."),
  C("pitfall", "Standard/Dedicated is not universal", "SQL warehouses and serverless don't expose this selector. It is a **classic compute** concept."),
 ]})

# s07 ---------------------------------------------------------------
S.append({"id": "ch07-s07", "title": "Topology, Scaling & Hardware",
 "hook": "Single vs multi-node, fixed vs autoscaling, CPU vs GPU — three more independent knobs.",
 "blocks": [
  P("**Single-node vs Multi-node** is a classic compute setting."),
  D("""
MULTI-NODE                 SINGLE-NODE
      DRIVER              ┌───────────────────┐
        │                 │ DRIVER + executor │
  ┌─────┼─────┐           │ same machine      │
  ▼     ▼     ▼           └───────────────────┘
WORKER WORKER WORKER      no separate worker VMs
distributed Spark""", "Topology axis"),
  P("Single-node is for **small data, non-distributed libraries, certain ML workloads, development** — not large distributed Spark processing."),
  CMP(("Fixed size", ["`workers = 4`", "4 workers all the time"]),
      ("Autoscaling", ["`min workers = 2`, `max workers = 10`", "low load 2 → medium 5 → heavy 10 → later 3", "Databricks adds/removes workers within YOUR bounds"])),
  CMP(("Classic autoscaling", ["YOU: min = 2, max = 10, worker type = X", "Databricks: chooses a number between 2 and 10"]),
      ("Serverless", ["YOU: run my workload", "Databricks: handles resource selection AND scaling"])),
  C("pitfall", "Autoscaling ≠ serverless", "Classic compute can perfectly well autoscale. Autoscaling is a scaling axis, serverless is an infrastructure axis."),
  P("**CPU vs GPU:** classic compute can use CPU instances or **GPU instances** (deep learning). GPU classic compute uses the **ML runtime**, and **Photon is not supported on GPU instance types**."),
  CODE("text", "Classic + All-purpose + Dedicated + GPU + DBR ML", "A perfectly sensible configuration"),
  P("Since 2026 **AI Runtime** (Public Preview) brings **serverless GPU** infrastructure for deep learning. So GPU and serverless are not opposites — again, different axes."),
  C("exam", "Constraint between axes", "GPU + Photon on classic GPU compute ❌. Not every combination of axis values is allowed."),
 ]})

# s08 ---------------------------------------------------------------
S.append({"id": "ch07-s08", "title": "Runtime & Photon as Axes",
 "hook": "DBR is software, Photon is an execution engine — neither is a compute family.",
 "blocks": [
  P("On classic compute you pick a **Databricks Runtime (DBR)** such as `DBR 17.3 LTS` or a `DBR ML` variant. That is a **software stack**, not hardware."),
  CODE("text", "AWS VM:  m5.xlarge      <- hardware\nsoftware: DBR 17.3 LTS  <- runtime", "Hardware and runtime are separate choices"),
  P("The runtime includes **Spark plus Databricks software/libraries**."),
  CMP(("Classic", ["\"I choose the DBR\"", "e.g. DBR 17.3 LTS"]),
      ("Serverless", ["\"Databricks manages the server runtime\"", "No traditional DBR version picker", "Databricks upgrades the server-side runtime; **serverless environment versions** give application compatibility"])),
  P("**Photon** on classic CPU compute: **ON or OFF** — your choice. On **serverless**: Photon enabled, managed by Databricks. **SQL warehouses** also use Photon."),
  C("key", "Photon is an axis, not a family", "There is no \"Photon compute\" product. Photon is a setting (engine) that sits on top of a compute."),
  C("pitfall", "\"Which DBR for my serverless job?\"", "Usually the wrong question: on serverless you don't pin a traditional DBR version."),
 ]})

# s09 ---------------------------------------------------------------
S.append({"id": "ch07-s09", "title": "The Classic Matrix & What Serverless Removes",
 "hook": "Classic = a dozen knobs; serverless = \"here is my workload, run it\".",
 "blocks": [
  T(["Axis", "Options (classic all-purpose / jobs)"], [
     ["Purpose", "All-purpose / Jobs"],
     ["Infrastructure", "Classic"],
     ["Access", "Standard / Dedicated"],
     ["Nodes", "Single / Multi"],
     ["Scale", "Fixed / Autoscaling"],
     ["Hardware", "CPU / GPU"],
     ["Worker type", "memory / compute / general purpose etc."],
     ["Driver type", "same as worker or different"],
     ["Runtime", "DBR version / DBR ML"],
     ["Photon", "On / Off, where supported"],
     ["Instances", "On-demand / Spot workers"],
     ["Pool", "Pool / direct provisioning"],
     ["Termination", "manual / auto-terminate"]], "The big classic matrix"),
  P("**Example 1 — interactive ETL development:** All-purpose · Classic · Standard · DBR 17.3 LTS · Photon ON · Multi-node · general-purpose worker · 2 → 8 workers · general-purpose driver. That is **one classic all-purpose compute with 9 configuration choices**, not 10 computes."),
  P("**Example 2 — production scheduled ETL:** Jobs · Classic · Standard · DBR 17.3 LTS · Photon ON · Multi-node · autoscaling 4 → 20 workers → a **Classic Jobs Compute** with specific parameters."),
  P("**Serverless equivalent:** Purpose = Jobs, Infrastructure = Serverless. Now you do NOT choose driver VM, worker VM, 2–20 workers, DBR 17.3, spot or pool. **Autoscaling and Photon are enabled automatically** in serverless Jobs."),
  P("Order of decisions: first decide *Classic all-purpose* or *Classic Jobs*; **only then** go into Standard/Dedicated, Single/Multi, DBR, CPU/GPU, worker type, driver type, Fixed/Autoscaling, Photon, Spot, Pools, auto termination."),
  CMP(("Classic — you answer", ["Which VMs? How many?", "Which driver? Which workers?", "Which runtime?", "Autoscale from where to where?", "Photon? Spot? Pool?"]),
      ("Serverless — you answer", ["\"Here is my workload. Run it.\"", "Far fewer infrastructure choices"])),
  C("warn", "Not supported on serverless", "Serverless does NOT support **compute policies, instance pools, compute-scoped init scripts, compute-scoped libraries**, or most **Spark cluster configurations** — these infrastructure concerns are platform-managed."),
  C("exam", "Classic = 'large matrix', Serverless = 'matrix disappears'", "That disappearance is the whole point of serverless."),
 ]})

# s10 ---------------------------------------------------------------
S.append({"id": "ch07-s10", "title": "Serverless Performance Modes",
 "hook": "Serverless still has a knob — speed vs cost — and its name collides with an access mode.",
 "blocks": [
  P("For serverless **Jobs and Pipelines** there is a **performance mode**: **Performance Optimized** vs **Standard**."),
  CMP(("Performance Optimized", ["faster startup", "more latency-sensitive"]),
      ("Standard (performance)", ["slower startup", "lower cost", "batch-friendly"])),
  T(["Serverless workload", "Performance optimized", "Standard"], [
     ["Notebook", "✅", "❌"],
     ["Job", "✅", "✅"],
     ["Pipeline", "✅", "✅"]], "Serverless matrix — notebooks use a performance-oriented interactive mode"),
  C("exam", "Standard access ≠ Standard performance", "**Standard access mode** = security/isolation concept for classic compute (who may use it, how users are isolated). **Standard performance mode** = serverless cost/latency concept (lower cost or faster startup?). Nothing in common except the English word."),
  CMP(("Standard ACCESS mode", ["Classic compute", "Who may use this compute?", "How are users isolated?"]),
      ("Standard PERFORMANCE mode", ["Serverless Jobs / Pipelines", "Lower cost or faster startup?", "Not available for notebooks"])),
  R("Think first: a nightly 02:00 batch ETL with no SLA on start time — which serverless performance mode?",
    "**Standard** performance mode: slower startup doesn't matter at 02:00, and it costs less."),
 ]})

# s11 ---------------------------------------------------------------
S.append({"id": "ch07-s11", "title": "SQL Warehouses: Serverless, Pro, Classic",
 "hook": "The SQL family is its own branch — with its own feature ladder.",
 "blocks": [
  D("""
SQL WAREHOUSE
├── Serverless
├── Pro
└── Classic""", "A different branch from Spark/general compute"),
  P("**All** current warehouse types support **Photon**. **Serverless** additionally has **Predictive IO + Intelligent Workload Management**. **Pro** has Photon + Predictive IO. **Classic** has Photon only."),
  T(["Feature", "Serverless", "Pro", "Classic"], [
     ["Photon", "✅", "✅", "✅"],
     ["Predictive IO", "✅", "✅", "❌"],
     ["Intelligent Workload Management", "✅", "❌", "❌"],
     ["Databricks-managed serverless infra", "✅", "❌", "❌"],
     ["Custom networking flexibility", "limited / different", "✅", "✅"],
     ["Recommended default", "✅", "special cases", "fallback / basic"]], "SQL warehouse matrix"),
  C("tip", "Feature ladder mnemonic", "**Classic = P**, **Pro = P + P**, **Serverless = P + P + I**: Photon → + Predictive IO → + Intelligent Workload Management."),
  P("Can a **notebook attach to a SQL warehouse**? Yes — but it can only run **SQL and Markdown** cells, not Python/R."),
  CODE("sql", "-- works in a notebook attached to a SQL warehouse\nSELECT COUNT(*)\nFROM prod.sales.orders;", "✅ SQL cell"),
  CODE("python", "# fails in a notebook attached ONLY to a SQL warehouse\nfrom pyspark.sql import functions as F", "❌ Python cell"),
  C("pitfall", "Python on a SQL warehouse", "A notebook attached exclusively to a SQL warehouse cannot run Python cells. Attach to serverless notebook compute or all-purpose for PySpark."),
 ]})

# s12 ---------------------------------------------------------------
S.append({"id": "ch07-s12", "title": "Choosing Compute: The One Decision Diagram",
 "hook": "First question: what is my workload? Second: do I need custom infra? Only then: parameters.",
 "blocks": [
  T(["I want to…", "Best default", "Other options"], [
     ["Interactive Python/PySpark notebook", "Serverless notebook", "Classic all-purpose"],
     ["Interactive SQL notebook", "Serverless compute or serverless SQL warehouse", "Pro/classic warehouse, all-purpose"],
     ["Scheduled Python notebook", "Serverless Jobs", "Classic Jobs"],
     ["Python script job", "Serverless Jobs", "Classic Jobs"],
     ["Python wheel", "Serverless Jobs", "Classic Jobs"],
     ["JAR", "Classic Jobs in some cases / serverless support per task", "Classic"],
     ["spark-submit", "Classic Jobs", "—"],
     ["SQL Job task", "Serverless SQL Warehouse", "Pro SQL Warehouse"],
     ["dbt", "Serverless SQL Warehouse", "Pro"],
     ["Lakeflow pipeline", "Serverless pipeline", "Classic pipeline"],
     ["BI / dashboard", "Serverless SQL Warehouse", "Pro / Classic warehouse"]], "Usage matrix (mirrors Databricks' task-support matrix)"),
  T(["Family", "SL/Classic", "Access cfg?", "Nodes cfg?", "DBR cfg?", "Autoscale cfg?"], [
     ["Serverless notebook", "Serverless", "❌", "❌", "❌ (no traditional DBR)", "❌ infra managed"],
     ["All-purpose", "Classic", "✅", "✅", "✅", "✅"],
     ["Serverless Jobs", "Serverless", "❌", "❌", "❌ (no traditional DBR)", "❌ infra managed"],
     ["Classic Jobs", "Classic", "✅", "✅", "✅", "✅"],
     ["Serverless pipeline", "Serverless", "managed", "❌", "managed", "managed"],
     ["Classic pipeline", "Classic", "pipeline-specific", "✅", "✅", "✅"],
     ["Serverless SQL WH", "Serverless", "SQL security model", "managed", "managed", "managed"],
     ["Pro SQL WH", "non-serverless", "warehouse model", "abstracted", "Databricks SQL runtime", "warehouse autoscale"],
     ["Classic SQL WH", "non-serverless", "warehouse model", "abstracted", "Databricks SQL runtime", "warehouse autoscale"]], "\"All possible combinations\" in one useful matrix"),
  C("key", "Constraints between axes", "If you choose serverless, many axes are managed by Databricks (no worker type, no pool…). And on classic GPU compute, GPU + Photon is not possible. The axes are real but **constrained**."),
  D("""
              DATABRICKS COMPUTE
                     │
     FIRST QUESTION: What is my workload?
                     │
  ┌────────────┬─────┴──────┬────────────┐
INTERACTIVE   JOB        PIPELINE       SQL
  │            │            │            │
choose infra choose infra choose infra  SQL WH
 ┌─┴─┐        ┌─┴─┐        ┌─┴─┐      ┌──┼───┐
 S   C        S   C        S   C      S Pro  C
     │
 ALL-PURPOSE → configure: Standard/Dedicated,
   Single/Multi, Fixed/Autoscale, CPU/GPU,
   DBR, Photon
S = Serverless   C = Classic""", "The ONE diagram to remember"),
  P("**Example A:** \"Explore 500 GB of customer transactions.\" Step 1: interactive (I'll try commands). Step 2: custom infra? No → **Serverless notebook compute**. Done — no worker VMs to decide."),
  P("**Example B:** \"Run ETL every night at 2 a.m.\" automated + no special infra → **Serverless Jobs**."),
  P("**Example C:** nightly ETL using a **custom Spark JAR and low-level Spark functionality** not supported on serverless → automated + classic required → **Classic Jobs Compute**, then choose DBR, workers, autoscaling, access mode, Photon…"),
  P("**Example D:** 100 analysts run SQL from **Power BI**. Not an all-purpose cluster! SQL/BI → SQL Warehouse → usually **Serverless SQL Warehouse** (recommended today for BI, SQL ETL and exploratory analytics)."),
  P("**Example E:** \"I want an **R** notebook.\" Serverless notebooks don't support **R** (the source also lists Scala and **RDD APIs** as unsupported). Interactive + unsupported serverless feature → **Classic all-purpose**, possibly **Dedicated**."),
  A("Ask yourself when choosing compute", ["Am I sitting and trying commands (interactive), scheduling something (job), building a declarative pipeline, or serving SQL/BI?", "Do I need anything serverless doesn't support (R, RDD APIs, custom JAR/low-level Spark, init scripts, pools, specific Spark configs)?", "If not — why wouldn't I use serverless?", "If classic: have I decided all-purpose vs jobs BEFORE touching the parameters?", "Is this SQL/BI? Then why am I looking at Spark clusters instead of a SQL warehouse?"]),
 ]})

# ------------------------------------------------------------------ EXERCISES
# s01
b.mcq(1, 1, ["concept"], "Which list best describes what **compute** means in Databricks?",
      ["The notebook and its code", "CPU, RAM, network, possibly GPU, a Spark driver and Spark executors used to run the workload", "The Delta tables your query reads", "The Unity Catalog metastore"], 1,
      "Compute is the set of real resources Databricks uses to execute a workload. Code alone is just text and does no computation; tables and metastores are data/metadata, not the execution resources.",
      why=["Code needs compute to run; it isn't compute.", "Correct — the bundle of execution resources.", "Tables are data, stored outside compute.", "The metastore holds metadata, not execution resources."], quick=True, cov=["§1"])
b.tf(1, 1, ["concept", "pitfall"], "Serverless, Classic, All-purpose, Jobs, Standard, Dedicated, Photon and GPU are twelve-ish competing compute types you pick one of.", False,
     "Most of these words are **characteristics (axes) of the same compute**. One compute can be Classic + All-purpose + Standard + Multi-node + Autoscaling + CPU + Photon + DBR 17.3 LTS at the same time.", quick=True, cov=["§2", "§3"])
b.match(1, 2, ["concept"], "Match each value to the axis it belongs to.",
        [("Interactive", "Workload purpose"), ("Classic", "Infrastructure model"), ("Standard", "Access mode"), ("Multi-node", "Topology"), ("DBR 17.3", "Runtime"), ("Photon", "Execution engine")],
        "This is the configuration vector: purpose, infrastructure, access, topology, scaling, hardware, runtime, engine. Each word answers a different question about the SAME compute.", quick=True, cov=["§3"])
b.cloze(1, 2, ["concept"], "Complete the configuration vector.",
        "Compute = (workload [[purpose]], [[infrastructure]] model, [[access]] mode, topology, [[scaling]], hardware, [[runtime]], execution [[engine]])",
        "The eight axes: purpose, infrastructure, access mode, topology, scaling, hardware, runtime, execution engine. Learning which axis each UI option belongs to removes most confusion.",
        bank=["cluster", "catalog", "storage"], cov=["§3"])
b.free(1, 2, ["concept", "interview"], "In your own words: why is it wrong to think of the Databricks compute page as a flat list of compute types?",
       "Because most terms are values on different axes of one compute configuration. Serverless/classic is about who manages infrastructure, all-purpose/jobs about lifecycle/purpose, Standard/Dedicated about access, Photon about the execution engine, DBR about software. One compute combines one value from each axis, so 'Classic + All-purpose + Standard + Photon' is one compute, not four.",
       ["Most terms are axes/characteristics, not types", "Names at least 3 axes correctly", "One compute = one value per axis (configuration vector)"],
       "A flat list hides that the words answer different questions. Thinking in axes lets you read any configuration as a vector of choices.", cov=["§2", "§3"])
b.odd(1, 1, ["concept"], "Which one is NOT a characteristic/axis value of a single compute configuration?",
      ["Autoscaling", "Photon", "prod.sales.orders", "Standard access"], 2,
      "`prod.sales.orders` is a table (data), not a compute setting. Autoscaling (scaling), Photon (engine) and Standard (access mode) are all axis values of one compute.", cov=["§1", "§3"])

# s02
b.bucket(2, 1, ["concept", "compare"], "Sort: which axis does each phrase answer?",
         ["Axis 1: What do I want to do?", "Axis 2: Who manages the machines?"],
         [("Interactive development", 0), ("Automated job", 0), ("Lakeflow pipeline", 0), ("SQL / BI", 0), ("Serverless", 1), ("Classic", 1)],
         "Purpose (interactive / job / pipeline / SQL) is one axis; infrastructure model (serverless / classic) is a completely different axis.", quick=True, cov=["§4", "§5"])
b.mcq(2, 1, ["concept"], "On **serverless** compute, which of these do you still decide yourself?",
      ["Worker VM type m5.4xlarge", "min workers 2 / max workers 10", "The workload to run", "The DBR version 17.3"], 2,
      "With serverless you say 'run the workload' and Databricks manages machines, instance types, scaling, server-side runtime and lifecycle. VM types, worker counts and DBR pinning are classic decisions.",
      why=["Instance types are managed by Databricks.", "Scaling is managed by Databricks.", "Correct — the workload is yours.", "Server-side runtime is managed by Databricks."], quick=True, cov=["§5"])
b.tf(2, 1, ["concept"], "Classic all-purpose, jobs and pipeline compute run in the customer's cloud account/environment and are resources you create and configure.", True,
     "That is the classic model: you (or a compute policy) define VM type, driver, workers, runtime, autoscaling, access mode, Photon, spot instances, etc., and the VMs live in your cloud account.", cov=["§5"])
b.bucket(2, 2, ["compare"], "Who decides it? Sort each item.",
         ["You decide (classic)", "Databricks manages (serverless)"],
         [("VM type for workers", 0), ("Spot instances", 0), ("Access mode", 0), ("Infrastructure lifecycle (serverless)", 1), ("Instance types (serverless)", 1), ("Scaling (serverless)", 1), ("Number of workers (classic)", 0)],
         "In classic you configure the infrastructure envelope; in serverless the infrastructure (machines, instance types, scaling, runtime server side, lifecycle) is Databricks-managed.", cov=["§5"])
b.free(2, 1, ["concept"], "Explain serverless vs classic with an everyday analogy.",
       "Serverless is like a taxi: you give the destination (your workload) and the company handles the vehicle, maintenance and scaling. Classic is like owning a car: you choose the model (VM type), how many (workers), the engine (runtime/Photon), and you pay while it sits idle.",
       ["Serverless: you specify the workload only", "Classic: you choose infrastructure details", "Mentions who manages lifecycle/cost of idle"],
       "Any analogy works if it separates 'what I want done' from 'who owns and configures the machines'.", cov=["§5"])

# s03
b.mcq(3, 1, ["concept", "exam"], "What is the **classic** equivalent of **serverless notebook compute**?",
      ["Classic Jobs compute", "Classic all-purpose compute", "Pro SQL warehouse", "Classic pipeline compute"], 1,
      "Interactive + serverless = serverless notebook compute; interactive + classic = classic all-purpose compute. Jobs compute is for automated runs, warehouses for SQL.", quick=True, cov=["§7", "§10", "Q2"])
b.mcq(3, 1, ["concept", "exam"], "What is the classic equivalent of **serverless Jobs compute**?",
      ["Classic all-purpose compute", "Classic Jobs compute", "Serverless pipeline", "Classic SQL warehouse"], 1,
      "Automated workload: serverless → Serverless Jobs compute, classic → Classic Jobs compute. All-purpose is the interactive classic flavour.", cov=["§8", "§10", "Q3"])
b.tf(3, 1, ["pitfall", "exam"], "Serverless is the opposite of all-purpose.", False,
     "Different levels. The infrastructure opposite of serverless is **classic**. All-purpose describes an interactive/reusable classic workload lifecycle.", quick=True, cov=["§6", "Q1"])
b.match(3, 2, ["concept"], "Complete the Workload × Infrastructure matrix: match each (purpose + infra) to its product name.",
        [("Interactive + Serverless", "Serverless notebook compute"), ("Interactive + Classic", "All-purpose compute"), ("Automated + Serverless", "Serverless Jobs compute"), ("Automated + Classic", "Jobs compute"), ("Lakeflow pipeline + Classic", "Classic pipeline"), ("SQL/BI + Serverless", "Serverless SQL warehouse")],
        "This matrix is the first map to memorise. Notice that the interactive/serverless product is NOT called 'serverless all-purpose'.", cov=["§10", "§7", "§8", "§9"])
b.tf(3, 2, ["exam", "pitfall"], "In the UI you can tick 'Purpose: all-purpose' and 'Infrastructure: serverless' to create a serverless all-purpose cluster.", False,
     "There is no such pair of dropdowns. Interactive + serverless is the product **serverless notebook compute**. Purpose and infrastructure are different axes conceptually, but the matrix is constrained, not a free Cartesian product.", cov=["§11"])
b.cloze(3, 1, ["concept"], "Fill in the product names.",
        "INTERACTIVE → Serverless: [[Serverless notebook compute|serverless compute for notebooks|serverless notebook]] / Classic: [[Classic all-purpose compute|all-purpose compute|all-purpose]]",
        "Databricks names the serverless interactive option 'Serverless compute for notebooks'; the classic one is all-purpose compute.", cov=["§7"])
b.mcq(3, 2, ["concept"], "What does **all-purpose** actually mean?",
      ["Non-serverless", "Best for every workload", "Reusable interactive classic Spark compute you attach notebooks to", "A cluster that can run SQL warehouses"], 2,
      "All-purpose is a lifecycle concept: a reusable classic resource that lives across interactive sessions. It is not a synonym of 'non-serverless' and not 'best for everything'.",
      why=["Classic is the opposite of serverless; all-purpose is a lifecycle.", "The name misleads — it's not the best choice for all.", "Correct.", "Warehouses are a separate family."], cov=["§6"])

# s04
b.calc(4, 1, ["concept"], "How many **Spark/general** compute types (serverless + classic flavours of interactive, automated and pipeline) are in the list?", 6, "types",
       "Interactive, automated and pipeline × serverless/classic = 3 × 2 = 6: serverless notebook, classic all-purpose, serverless jobs, classic jobs, serverless pipeline, classic pipeline.", quick=True, cov=["§12"])
b.calc(4, 1, ["concept"], "How many SQL warehouse types are listed, counting the Beta one?", 4, "warehouse types",
       "Serverless, Pro, Classic, plus Lakehouse Real-Time SQL Warehouse [Beta] for very low-latency/high-concurrency reads = 4. Together with the 6 Spark types that's the 10 compute types to master.", cov=["§13"])
b.bucket(4, 1, ["concept"], "Put each compute type into its family.",
         ["General Spark compute", "SQL compute"],
         [("Serverless notebook", 0), ("Classic Jobs", 0), ("Serverless pipeline", 0), ("Pro SQL Warehouse", 1), ("Lakehouse Real-Time [Beta]", 1), ("Classic all-purpose", 0), ("Classic SQL Warehouse", 1)],
         "SQL warehouses are a separate family from the six Spark/general compute types.", quick=True, cov=["§13", "§14"])
b.odd(4, 2, ["concept"], "Which one should NOT be put in the same bucket as the core data-engineering compute types (yet)?",
      ["Serverless Jobs", "Model serving", "Classic pipeline", "Serverless SQL Warehouse"], 1,
      "Model serving (like data-quality monitoring and predictive optimization) uses serverless infrastructure but is managed from a separate product surface. The other three are core compute types.", cov=["§56"])
b.mcq(4, 2, ["concept"], "What is the **Lakehouse Real-Time SQL Warehouse [Beta]** for?",
      ["GPU deep learning", "Very low-latency / high-concurrency read workloads", "Running R notebooks", "Streaming ingestion with Auto Loader"], 1,
      "It is a new SQL warehouse type for particularly low-latency, high-concurrency reads. Serverless GPU deep learning is AI Runtime.", cov=["§13"])
b.tf(4, 1, ["concept"], "AI Runtime (Preview) provides serverless GPU infrastructure for deep-learning workloads.", True,
     "AI Runtime brings serverless GPU — which proves GPU and serverless are not opposite concepts.", cov=["§56", "§29"])

# s05
b.order(5, 1, ["concept"], "Order the **Jobs compute** lifecycle.",
        ["Job start", "Compute starts", "Run pipeline", "Job ends", "Compute goes away"],
        "Jobs compute is born with the run and terminates with it — no cluster sitting open at 08:00, 12:00, 18:00 for a 02:00 job.", quick=True, cov=["§16"])
b.tf(5, 1, ["exam", "pitfall"], "A job task can never run on a classic all-purpose cluster.", False,
     "Technically many job task types can use all-purpose compute. Databricks just doesn't recommend it for production — it prefers serverless jobs or classic jobs compute.", quick=True, cov=["§17"])
b.mcq(5, 2, ["pitfall", "exam"], "Why does Databricks discourage running production ETL on a shared all-purpose cluster?",
      ["All-purpose can't read Delta tables", "Developers' queries compete with the job for CPU, RAM, executors and shuffle bandwidth, killing predictability", "All-purpose clusters can't autoscale", "Jobs can't be scheduled on all-purpose"], 1,
      "Shared resources mean a developer's heavy query can destroy the performance predictability of the production job. All-purpose can read Delta and can autoscale — those distractors are false.",
      why=["False — it reads Delta fine.", "Correct.", "False — classic all-purpose can autoscale.", "Technically jobs can use it."], cov=["§17"])
b.tf(5, 1, ["pitfall"], "'All-purpose' means it is the best choice for all workloads.", False,
     "The name is misleading. It means generic reusable interactive compute, not 'optimal for everything'.", cov=["§18"])
b.bucket(5, 2, ["compare"], "All-purpose or Jobs compute?",
         ["Classic all-purpose", "Classic Jobs compute"],
         [("Exists independently of any specific job", 0), ("Starts when the job starts", 1), ("Several notebooks attach to it", 0), ("Terminates when the run completes", 1), ("Pause 10 min, then run another cell", 0), ("02:00 Bronze → Silver scheduled run", 1)],
         "All-purpose is a reusable interactive resource; Jobs compute's lifecycle is tied to the run.", cov=["§15", "§16"])
b.scenario(5, 2, ["debug"], "Your nightly production ETL runs on `my-dev-cluster` (shared all-purpose). Run times vary wildly: 20 minutes some nights, 90 minutes others.",
  [("What do you suspect first?", [
      ("Resource contention: other users/notebooks share the cluster", True, "Yes — on all-purpose, developers and the job compete for CPU, RAM, executors and shuffle bandwidth."),
      ("The Delta table is corrupt", False, "Nothing points to corruption; variable runtime on a shared cluster points to contention."),
      ("Photon is broken", False, "Photon doesn't cause night-to-night variance tied to other users."),
   ]),
   ("What's the recommended fix?", [
      ("Move the job to serverless Jobs (or classic Jobs compute)", True, "Correct — jobs compute gives the run its own lifecycle and isolated resources."),
      ("Ask developers to stop working at night forever", False, "Fragile and doesn't fix billing/idle issues; use the intended compute."),
      ("Make the all-purpose cluster Dedicated to the job", False, "That still keeps an always-on interactive cluster; Jobs compute is the operational model."),
   ])],
  "All-purpose = interactive by design. Production jobs belong on serverless Jobs or classic Jobs compute for predictable performance.", cov=["§17", "§18"])

# s06
b.mcq(6, 1, ["concept"], "Which access mode does Databricks recommend for **most classic workloads**?",
      ["Dedicated", "Standard", "No isolation shared", "Single user legacy"], 1,
      "Standard: many users share the compute with workload isolation. Dedicated is for one user/group when features need a more direct environment (some ML/GPU/R).", quick=True, cov=["§20"])
b.tf(6, 1, ["exam", "pitfall"], "When someone says \"standard compute\" in today's Databricks terminology, they mean a basic/normal cluster.", False,
     "\"Standard compute\" = classic compute configured with **Standard access mode**. \"Dedicated compute\" = classic compute configured with Dedicated access mode.", quick=True, cov=["§52"])
b.tf(6, 2, ["exam"], "A classic all-purpose compute can be either Standard or Dedicated.", True,
     "Yes — Standard/Dedicated are explicit access-mode options for both classic all-purpose and classic jobs compute.", cov=["§22", "§23", "Q5"])
b.mcq(6, 2, ["exam", "pitfall"], "Does **serverless Jobs** have a Standard/Dedicated dropdown?",
      ["Yes, Dedicated by default", "Yes, Standard by default and you can switch", "No — the platform manages it; serverless Jobs uses Standard access-mode semantics and needs Standard-compatible workloads", "No — serverless has no security at all"], 2,
      "In serverless you don't create a cluster or set access mode/workers. Serverless Jobs uses Standard access semantics, so workloads must be compatible with Standard compute.",
      why=["There's no selector.", "There's no selector to switch.", "Correct.", "Serverless has access management, just not this selector."], cov=["§24"])
b.match(6, 2, ["concept"], "Match the classic-compute matrix cell to its value.",
        [("All-purpose × Standard", "✅ supported"), ("Jobs × Dedicated", "✅ also supported"), ("Pipeline × Standard/Dedicated", "own pipeline configuration model"), ("Serverless Jobs × access dropdown", "not exposed — Standard semantics")],
        "Standard/Dedicated is explicit for all-purpose and jobs compute; pipelines have their own configuration model; serverless hides the selector.", cov=["§23", "§24"])
b.odd(6, 2, ["concept"], "Which scenario is the odd one out (doesn't point to Dedicated access)?",
      ["R development needing a direct environment", "Some GPU ML workloads", "A compute assigned to a single data scientist group", "20 analysts sharing a cluster with workload isolation"], 3,
      "Many users sharing with isolation is **Standard**. Dedicated is assigned to one user/group and used for some ML/GPU/R scenarios.", cov=["§21"])

# s07
b.tf(7, 1, ["pitfall", "exam"], "Autoscaling means serverless.", False,
     "Classic compute can autoscale perfectly well (you set min/max; Databricks picks a number between). Autoscaling ≠ serverless.", quick=True, cov=["§27", "Q4"])
b.calc(7, 1, ["calc"], "A **fixed-size** classic cluster has `workers = 4`. During a heavy spike, how many workers does it have?", 4, "workers",
       "Fixed means fixed: 4 workers all the time. Only autoscaling clusters move between min and max.", quick=True, cov=["§26"])
b.calc(7, 2, ["calc"], "An autoscaling classic cluster has min 2, max 10 workers. What is the most workers it can reach under the heaviest load?", 10, "workers",
       "Databricks adds/removes workers but only inside the bounds YOU set: 2–10. It will never go to 11 on its own.", cov=["§26"])
b.bucket(7, 2, ["concept"], "Single-node or multi-node?",
         ["Single-node", "Multi-node"],
         [("Small data", 0), ("Non-distributed libraries", 0), ("Large distributed Spark processing", 1), ("Driver + separate worker VMs", 1), ("Driver acts as executor on the same machine", 0), ("Development / certain ML workloads", 0)],
         "Single-node has no separate worker VMs — fine for small data, dev, non-distributed libraries and some ML, not for large distributed Spark.", cov=["§25"])
b.spotbug(7, 2, ["pitfall", "exam"], "This classic compute spec has an invalid combination. Click the bad line.",
          ["Infrastructure: Classic", "Purpose: All-purpose", "Access mode: Dedicated", "Hardware: GPU instances", "Runtime: DBR ML", "Photon: ON"], [5],
          "Photon: OFF (Photon is not supported on GPU instance types)",
          "Classic GPU compute uses the ML runtime and Photon is not supported on GPU instance types. Classic + All-purpose + Dedicated + GPU + DBR ML is otherwise a perfectly sensible config.", cov=["§28", "§53-54"])
b.tf(7, 2, ["concept"], "GPU and serverless are opposite concepts: if you need GPU you must use classic.", False,
     "AI Runtime (Public Preview, 2026) brings serverless GPU infrastructure for deep learning. GPU (hardware) and serverless (infrastructure model) are different axes.", cov=["§29"])
b.cloze(7, 1, ["concept"], "Complete the comparison.",
        "Classic autoscaling: YOU set [[min]] = 2 and [[max]] = 10 and the worker type; Databricks chooses a number between them. Serverless: YOU say \"run my [[workload]]\" and Databricks handles resource selection and [[scaling]].",
        "The difference is who owns the bounds and resource choice. Classic autoscaling is still you configuring infrastructure.", bank=["driver", "pool", "Photon"], cov=["§27"])

# s08
b.mcq(8, 1, ["concept"], "On classic compute, choosing `DBR 17.3 LTS` selects…",
      ["The VM hardware", "The software stack (Spark + Databricks software/libraries)", "The access mode", "The number of workers"], 1,
      "The runtime is software, not hardware. `m5.xlarge` would be the hardware choice.", quick=True, cov=["§30"])
b.tf(8, 1, ["exam", "pitfall"], "On serverless compute you pick a traditional DBR version like `DBR 17.3` from a dropdown.", False,
     "Databricks upgrades the server-side runtime itself and uses **serverless environment versions** for application compatibility. 'Classic: I choose the DBR; serverless: Databricks manages the server runtime.'", quick=True, cov=["§31"])
b.bucket(8, 2, ["compare"], "Who decides Photon?",
         ["You choose ON/OFF", "Always on / managed"],
         [("Classic all-purpose (CPU)", 0), ("Classic Jobs (CPU)", 0), ("Serverless notebook", 1), ("Serverless Jobs", 1), ("SQL warehouses", 1)],
         "On classic CPU compute Photon is a toggle; on serverless it is enabled and managed; SQL warehouses also use Photon.", cov=["§32"])
b.odd(8, 2, ["concept"], "Which one is a compute *family* rather than an axis value?",
      ["Photon", "DBR 17.3 LTS", "SQL Warehouse", "Autoscaling"], 2,
      "SQL Warehouse is a compute family. Photon (engine), DBR (runtime) and autoscaling (scaling) are axes/settings on a compute.", cov=["§32", "§30"])
b.free(8, 2, ["concept"], "Explain why 'AWS VM m5.xlarge' and 'DBR 17.3 LTS' are not alternatives to each other.",
       "They live on different axes: m5.xlarge is hardware (the machine), DBR 17.3 LTS is the software stack installed on it (Spark + Databricks software/libraries). A classic compute needs both: a VM type and a runtime.",
       ["Hardware vs software", "Both are chosen together on classic", "Runtime includes Spark + Databricks libraries"],
       "Every classic config answers 'which machine?' and 'which software on it?' separately.", cov=["§30"])

# s09
b.mcq(9, 2, ["exam", "pitfall"], "Which of these is NOT supported on serverless compute?",
      ["Running a scheduled Python notebook", "Instance pools and compute-scoped init scripts", "Photon", "Autoscaling"], 1,
      "Serverless doesn't support compute policies, instance pools, compute-scoped init scripts, compute-scoped libraries or most Spark cluster configs — they're platform-managed. Photon and autoscaling are automatic on serverless Jobs.",
      why=["Supported — serverless Jobs.", "Correct.", "Photon is enabled automatically.", "Autoscaling is automatic/managed."], quick=True, cov=["§46"])
b.spotbug(9, 2, ["pitfall", "exam"], "A colleague wrote this **serverless Jobs** spec. Which lines are impossible?",
          ["Purpose: Jobs", "Infrastructure: Serverless", "Worker type: m5.4xlarge", "Workers: 2-20 (autoscaling)", "Performance mode: Standard"], [2, 3],
          "Purpose: Jobs\nInfrastructure: Serverless\nPerformance mode: Standard",
          "Worker type and min/max workers are infrastructure configuration that serverless manages for you. Performance mode (Standard vs Performance Optimized) IS a valid serverless Jobs setting.", quick=True, cov=["§36", "Q7"])
b.tf(9, 1, ["exam"], "Classic + Jobs + Standard + Multi-node + Autoscaling + Photon is a valid configuration.", True,
     "Completely sensible: a classic jobs compute with Standard access, several workers, autoscaling and Photon.", cov=["Q6", "§35"])
b.calc(9, 2, ["calc"], "Example 1 (interactive ETL development) lists: Purpose, Infrastructure, Access mode, Runtime, Photon, Topology, Worker, Scaling, Driver. How many **computes** does it describe?", 1, "compute",
       "One classic all-purpose compute with 9 configuration choices — not 9 or 10 computes.", cov=["§34"])
b.order(9, 2, ["concept"], "Order the decision process for a classic compute.",
        ["Decide workload purpose (interactive / job / pipeline / SQL)", "Decide infrastructure (serverless vs classic)", "Land on the product (e.g. Classic Jobs)", "Then set parameters: access mode, nodes, DBR, worker/driver type, scaling, Photon, spot, pools, termination"],
        "Parameters come LAST. Only after you've chosen 'classic all-purpose' or 'classic Jobs' do Standard/Dedicated, DBR, workers etc. become relevant.", cov=["§45"])
b.match(9, 2, ["concept"], "Match the classic matrix axis to its options.",
        [("Instances", "On-demand / Spot workers"), ("Pool", "Pool / direct provisioning"), ("Termination", "manual / auto-terminate"), ("Driver type", "same as worker or different"), ("Worker type", "memory / compute / general purpose"), ("Scale", "Fixed / Autoscaling")],
        "These are classic all-purpose/jobs configuration settings — the ones serverless removes.", cov=["§33"])
b.write(9, 2, ["syntax"], "Write the axis-by-axis spec (one `Axis: value` per line) for a **production scheduled ETL on classic jobs compute**: Standard access, DBR 17.3 LTS, Photon on, multi-node, autoscaling 4 → 20 workers.",
        "Purpose: Jobs\nInfrastructure: Classic\nAccess: Standard\nRuntime: DBR 17.3 LTS\nPhoton: ON\nTopology: Multi-node\nAutoscaling: 4 -> 20 workers",
        ["Jobs", "Classic", "Standard", "17.3 LTS", "Photon", "Multi-node", "4 -> 20"], "text",
        "This is exactly the source's example 2 — one Classic Jobs Compute with specific parameters. LTS suits production; autoscaling bounds are yours on classic.", cov=["§35"])
b.write(9, 1, ["syntax"], "Now write the **serverless equivalent** of that ETL spec (only the lines you still choose; one `Axis: value` per line).",
        "Purpose: Jobs\nInfrastructure: Serverless",
        ["Purpose: Jobs", "Infrastructure: Serverless"], "text",
        "Driver VM, worker VM, 2–20 workers, DBR 17.3, spot and pool all disappear. Autoscaling and Photon are enabled automatically on serverless Jobs.", cov=["§36"])

# s10
b.mcq(10, 1, ["concept"], "Which serverless workload does NOT offer **Standard performance mode**?",
      ["Jobs", "Lakeflow pipelines", "Notebooks", "All of them offer it"], 2,
      "Standard performance mode exists for serverless Jobs and pipelines; notebooks use a performance-oriented interactive mode.", quick=True, cov=["§37", "§38"])
b.tf(10, 1, ["exam", "pitfall"], "Standard access mode and Standard performance mode are the same setting seen from two screens.", False,
     "No relation besides the English word. Standard **access** = security/isolation on classic compute. Standard **performance** = serverless cost vs startup trade-off.", quick=True, cov=["§39", "Q8"])
b.bucket(10, 2, ["compare", "exam"], "Which 'Standard' is this about?",
         ["Standard ACCESS mode", "Standard PERFORMANCE mode"],
         [("Who may use this classic compute?", 0), ("How are users isolated?", 0), ("Lower cost vs faster startup", 1), ("Serverless Jobs / pipelines", 1), ("Classic all-purpose/jobs", 0), ("Batch-friendly, slower startup", 1)],
         "Same word, two unrelated concepts — a classic source of confusion and a likely exam trap.", cov=["§39"])
b.match(10, 1, ["concept"], "Match each serverless performance mode to its trait.",
        [("Performance Optimized", "faster startup, latency-sensitive"), ("Standard", "slower startup, lower cost, batch-friendly"), ("Notebook mode", "performance-oriented interactive only")],
        "For nightly batch with no start-time SLA, Standard performance mode saves money.", cov=["§37"])
b.scenario(10, 2, ["debug"], "Your serverless nightly job is cheap but finance's dashboard SLA was just moved earlier, and the job now starts too slowly to finish in time.",
  [("What setting do you look at first?", [
      ("The serverless performance mode (Standard vs Performance Optimized)", True, "Right — Standard mode trades slower startup for lower cost."),
      ("The access mode (Standard vs Dedicated)", False, "Access mode is security/isolation, and serverless doesn't expose it."),
      ("The worker type", False, "Serverless doesn't let you pick worker types."),
   ]),
   ("What change fits the new SLA?", [
      ("Switch the job to Performance Optimized", True, "Faster startup, more latency-sensitive — at higher cost."),
      ("Move the job to a notebook on Standard performance", False, "Notebooks don't even have Standard performance mode."),
      ("Add an instance pool", False, "Pools aren't supported on serverless."),
   ])],
  "Performance mode is THE serverless knob for start-up latency vs cost. Don't confuse it with Standard access mode.", cov=["§37", "§39"])

# s11
b.mcq(11, 1, ["concept"], "Which SQL warehouse type has Photon + Predictive IO but NOT Intelligent Workload Management?",
      ["Serverless", "Pro", "Classic", "Lakehouse Real-Time"], 1,
      "Classic = Photon; Pro = Photon + Predictive IO; Serverless = Photon + Predictive IO + Intelligent Workload Management.", quick=True, cov=["§40", "§41"])
b.tf(11, 1, ["pitfall", "exam"], "A notebook attached only to a SQL warehouse can run `from pyspark.sql import functions as F`.", False,
     "A notebook on a SQL warehouse can run SQL and Markdown cells only — not Python/R. Use serverless notebook compute or all-purpose for PySpark.", quick=True, cov=["§42"])
b.match(11, 2, ["concept"], "Match the SQL warehouse matrix row to its correct 'Classic' column value.",
        [("Photon", "✅"), ("Predictive IO", "❌"), ("Recommended default", "fallback/basic"), ("Custom networking flexibility", "✅ (flexible)")],
        "Classic warehouses have Photon but neither Predictive IO nor IWM, keep custom networking flexibility, and are the fallback/basic option. Serverless is the recommended default.", cov=["§41"])
b.spotbug(11, 2, ["debug", "pitfall"], "Notebook attached to `analytics-wh` (a SQL warehouse). Which cell will fail?",
          ["%md ## Orders report", "SELECT COUNT(*) FROM prod.sales.orders;", "%python", "from pyspark.sql import functions as F", "SELECT country, SUM(amount) FROM prod.sales.orders GROUP BY country;"], [2, 3],
          "Remove the Python cell, or attach the notebook to serverless notebook compute / all-purpose compute to run PySpark.",
          "SQL warehouses only execute SQL and Markdown in notebooks. The Python cell fails; the Markdown and SQL cells work.", cov=["§42"])
b.write(11, 1, ["syntax"], "Write a query you CAN run in a notebook attached to a SQL warehouse: total `amount` per `country` from `prod.sales.orders`.",
        "SELECT country, SUM(amount) AS total_amount\nFROM prod.sales.orders\nGROUP BY country;",
        ["select", "sum(amount)", "from prod.sales.orders", "group by country"], "sql",
        "SQL cells run on a SQL warehouse; the same logic in PySpark (`groupBy(...).sum(...)`) would need Spark compute.", cov=["§42"])
b.order(11, 2, ["concept"], "Order the warehouse types from FEWEST to MOST features (Photon / Predictive IO / IWM).",
        ["Classic (Photon)", "Pro (Photon + Predictive IO)", "Serverless (Photon + Predictive IO + IWM)"],
        "Each step up adds one: Predictive IO at Pro, Intelligent Workload Management at Serverless.", cov=["§40", "§41"])
b.tf(11, 2, ["concept"], "All current SQL warehouse types support Photon.", True,
     "Serverless, Pro and Classic all have Photon; they differ in Predictive IO and Intelligent Workload Management.", cov=["§40"])

# s12
b.mcq(12, 1, ["exam"], "100 analysts run SQL from **Power BI**. What do you start with?",
      ["A big classic all-purpose cluster", "Serverless SQL Warehouse", "Serverless Jobs", "Classic pipeline"], 1,
      "SQL/BI workload → SQL warehouse → usually Serverless SQL Warehouse, recommended today for BI, SQL ETL and exploratory analytics.", quick=True, cov=["§50", "Q11"])
b.mcq(12, 1, ["exam"], "You want to develop in **R** interactively. Which compute?",
      ["Serverless notebook compute", "Classic all-purpose (possibly Dedicated)", "Serverless SQL warehouse", "Serverless Jobs"], 1,
      "Serverless notebooks don't support R. Interactive + unsupported serverless feature → classic all-purpose, possibly Dedicated depending on the workload.", quick=True, cov=["§51", "Q12"])
b.mcq(12, 1, ["exam"], "Interactive PySpark exploration of 500 GB, no special requirements?",
      ["Serverless notebook compute", "Classic Jobs", "Pro SQL warehouse", "Classic pipeline"], 0,
      "Step 1: interactive. Step 2: no custom infra → serverless notebook compute. No worker VMs to decide.", cov=["§47", "Q9"])
b.mcq(12, 2, ["exam"], "Nightly ETL uses a **custom Spark JAR and low-level Spark functionality** that serverless doesn't support. Which compute?",
      ["Serverless Jobs", "Classic Jobs compute", "Serverless notebook", "Serverless SQL warehouse"], 1,
      "Automated + classic required → Classic Jobs Compute, then choose DBR, workers, autoscaling, access mode, Photon. Without that constraint, serverless Jobs would be the default.", cov=["§49", "Q10"])
b.match(12, 2, ["exam"], "Match the task to its best default compute (usage matrix).",
        [("Scheduled Python notebook", "Serverless Jobs"), ("spark-submit", "Classic Jobs"), ("dbt", "Serverless SQL Warehouse"), ("Lakeflow pipeline", "Serverless pipeline"), ("Interactive PySpark notebook", "Serverless notebook")],
        "The usage matrix mirrors Databricks' task-support matrix: serverless defaults everywhere except where a classic-only feature (spark-submit) is needed; SQL-shaped tasks go to warehouses.", cov=["§43"])
b.order(12, 2, ["concept"], "Order the questions in the decision diagram.",
        ["What is my workload? (interactive / job / pipeline / SQL)", "Do I need custom infra or an unsupported serverless feature?", "Pick the product (e.g. serverless notebook vs classic all-purpose)", "If classic: configure Standard/Dedicated, Single/Multi, Fixed/Autoscale, CPU/GPU, DBR, Photon"],
        "Workload first, infrastructure second, parameters last. Once this is clear, Compute → Create compute stops looking like dozens of unrelated checkboxes.", cov=["§44", "diagram"])
b.bucket(12, 2, ["exam"], "Serverless or classic required?",
         ["Serverless is fine", "Classic required"],
         [("Nightly 2 a.m. ETL in Python, nothing special", 0), ("Interactive R notebook", 1), ("RDD API code", 1), ("Custom JAR with low-level Spark features", 1), ("Exploring a 500 GB table in PySpark", 0), ("spark-submit task", 1)],
         "Default to serverless; fall back to classic only for unsupported features (R, RDD APIs, spark-submit, custom low-level JARs…).", cov=["§47", "§48", "§49", "§51", "§43"])
b.scenario(12, 2, ["debug", "exam"], "A teammate says: \"I need interactive compute, so I'll create a serverless all-purpose cluster with Dedicated access, 2–8 workers and DBR 17.3.\"",
  [("What's wrong in the first part?", [
      ("There is no 'serverless all-purpose cluster' — interactive + serverless is serverless notebook compute", True, "Correct — interactive + classic is all-purpose; interactive + serverless is a differently named product."),
      ("Nothing — that product exists", False, "It doesn't exist under that name; the matrix is constrained."),
      ("All-purpose can't be interactive", False, "All-purpose is interactive by design."),
   ]),
   ("If they really need Dedicated, 2–8 workers and DBR 17.3, what do they need?", [
      ("Classic all-purpose compute", True, "Those are all classic infrastructure knobs."),
      ("Serverless notebook with a Dedicated toggle", False, "Serverless has no access-mode, worker or DBR selector."),
      ("Serverless SQL warehouse", False, "Warehouses don't have Standard/Dedicated or DBR selectors either."),
   ])],
  "Purpose and infrastructure are different axes, but the matrix is constrained: classic exposes the knobs; serverless hides them.", cov=["§11", "§53-54", "§55"])
b.tf(12, 2, ["concept"], "In the 'all combinations' matrix, Classic Jobs lets you configure access mode, nodes, DBR and autoscaling, while Serverless Jobs exposes none of them.", True,
     "Classic Jobs: ✅ ✅ ✅ ✅. Serverless Jobs: ❌ access, ❌ nodes, ❌ traditional DBR, ❌ autoscaling (infra managed).", cov=["§55"])
b.mcq(12, 3, ["exam"], "In the 'all combinations' matrix, how are DBR and autoscaling described for **Pro/Classic SQL warehouses**?",
      ["You pick a DBR; min/max workers", "Databricks SQL runtime; warehouse autoscale", "Serverless managed; no scaling", "Pipeline channel; vertical scaling"], 1,
      "Non-serverless warehouses use the Databricks SQL runtime (no DBR selector) and scale as warehouses (warehouse autoscale), with access via the warehouse model. Nodes are abstracted.", cov=["§55"])
b.free(12, 2, ["interview"], "Interview question: \"Walk me through how you would choose compute for a new workload in Databricks.\"",
       "First I identify the workload: interactive development, an automated job, a Lakeflow pipeline or SQL/BI. SQL/BI goes to a SQL warehouse, usually serverless. For the others I ask whether I need anything serverless doesn't support (R, RDD APIs, custom JAR/low-level Spark, init scripts, pools, specific Spark configs). If not, I pick serverless notebook / serverless Jobs / serverless pipeline. If I do, I choose the classic equivalent (all-purpose, Jobs compute, classic pipeline) and only then configure access mode, nodes, DBR, worker/driver types, scaling, Photon, spot, pools and termination.",
       ["Workload first", "SQL/BI → SQL warehouse", "Serverless default unless unsupported feature", "Classic equivalents named correctly", "Parameters last"],
       "This is the decision diagram in prose: workload → infrastructure → parameters.", cov=["§44", "diagram", "§45"])
b.cloze(12, 1, ["exam"], "Complete the quiz answers.",
        "Interactive PySpark without special needs → [[serverless notebook compute|serverless notebook]]. Scheduled PySpark production ETL → [[serverless jobs]] if supported, otherwise [[classic jobs|classic jobs compute]]. Power BI → usually [[serverless sql warehouse]].",
        "These four answers cover most real-life compute choices.", cov=["Q9", "Q10", "Q11"])

# ---- extra debug-oriented exercises (scenario + order per playbook)
b.cloze(6, 1, ["concept"], "Complete the access-mode definitions.",
        "Access mode is an axis mainly for classic [[all-purpose]] and [[jobs]] compute. [[Standard]]: many users share the compute with workload isolation. [[Dedicated]]: assigned to one user or group.",
        "Standard/Dedicated is the classic access-mode axis; serverless and SQL warehouses don't expose it.", bank=["serverless", "SQL warehouse", "Photon"], cov=["§19", "§20", "§21"])
b.scenario(6, 3, ["debug"], "A task that ran fine on a classic **Dedicated** cluster fails after you move it to **serverless Jobs**.",
  [("What do you ask yourself first?", [
      ("Does serverless Jobs use Standard access semantics that my code isn't compatible with?", True, "Yes — serverless Jobs requires Standard-compatible workloads."),
      ("Did serverless forget to enable Photon?", False, "Photon is automatic on serverless Jobs and wouldn't break compatibility."),
      ("Is the serverless worker type too small?", False, "You can't choose worker types on serverless; that isn't the lever."),
   ]),
   ("The code relies on a Dedicated-only feature and can't be refactored now. What do you do?", [
      ("Run it on classic Jobs compute with Dedicated access", True, "Only classic exposes Dedicated access mode."),
      ("Set Access mode = Dedicated in the serverless job", False, "Serverless has no such dropdown."),
      ("Run it on a SQL warehouse", False, "Warehouses have no Dedicated mode and don't run arbitrary Spark code."),
   ])],
  "Serverless Jobs = Standard access semantics. Dedicated-only workloads stay on classic.", cov=["§24", "§21"])
b.order(5, 2, ["debug"], "Order the debug steps for an unpredictable production job.",
        ["Check which compute the job runs on", "Check who else is attached to that cluster during the run", "Confirm contention for CPU/RAM/executors/shuffle", "Move the job to serverless Jobs or classic Jobs compute"],
        "Compute first, then contention evidence, then move to the intended operational compute.", cov=["§17"])
b.scenario(9, 2, ["debug"], "You migrate a classic job to serverless Jobs and can't find where to set the instance pool, the init script and `min_workers`.",
  [("What is the most likely explanation?", [
      ("Serverless doesn't support pools, compute-scoped init scripts or worker counts — they're platform-managed", True, "Exactly; the infrastructure matrix disappears on serverless."),
      ("You lack CAN MANAGE on the job", False, "Permissions don't hide these fields; they simply don't exist on serverless."),
      ("The fields are under Advanced → Spark config", False, "Most Spark cluster configs are also not supported on serverless."),
   ]),
   ("The init script installs a native library the job truly needs. Next step?", [
      ("Run this task on Classic Jobs compute", True, "Classic exposes init scripts, pools and worker settings."),
      ("Add the init script to the serverless notebook instead", False, "Compute-scoped init scripts aren't supported on serverless anywhere."),
      ("Use a bigger serverless performance mode", False, "Performance mode affects startup/cost, not native installs."),
   ])],
  "Serverless removes policies, pools, compute-scoped init scripts/libraries and most Spark configs. Truly required → classic.", cov=["§46"])
b.order(9, 2, ["debug"], "Order the 'missing field on serverless' playbook.",
        ["Am I on serverless or classic?", "Is the setting an infrastructure concern (VMs, counts, pools, init scripts, policies)?", "Do I truly need it or is it a classic habit?", "If truly needed, switch the task to Classic Jobs compute"],
        "Identify the compute, classify the setting, challenge the need, then switch only if required.", cov=["§46"])
b.scenario(11, 1, ["debug"], "In a notebook, `SELECT COUNT(*) FROM prod.sales.orders` works but the next cell `from pyspark.sql import functions as F` errors.",
  [("What do you check first?", [
      ("What compute the notebook is attached to", True, "If it's a SQL warehouse, only SQL and Markdown run."),
      ("Whether `prod.sales.orders` exists", False, "The SQL cell already worked; the table is fine."),
      ("Whether Photon is enabled", False, "Photon doesn't control which languages run."),
   ]),
   ("It's attached to `analytics-wh`. Fix?", [
      ("Attach to serverless notebook compute (or all-purpose) for the Python cells", True, "Python/PySpark needs Spark compute."),
      ("Upgrade the warehouse from Pro to Serverless", False, "No warehouse type runs Python notebook cells."),
      ("Grant CAN MANAGE on the warehouse", False, "It's not a permission problem."),
   ])],
  "Notebooks on SQL warehouses run SQL + Markdown only.", cov=["§42"])
b.order(10, 2, ["debug"], "Order the questions for a serverless job with a startup-latency problem.",
        ["Is it a serverless Job/pipeline (not a notebook)?", "Which performance mode is set?", "Does the workload need fast startup or is it relaxed batch?", "Switch to Performance Optimized (or Standard for cheaper batch)"],
        "Identify, read the mode, match it to the SLA, then switch.", cov=["§37", "§38"])
b.scenario(12, 1, ["debug"], "A data scientist's R notebook won't run on serverless notebook compute.",
  [("First question?", [
      ("Does serverless notebook compute support R?", True, "It doesn't — R (and RDD APIs) are unsupported on serverless notebooks."),
      ("Is the cluster's DBR too old?", False, "Serverless has no user-chosen DBR."),
      ("Is the SQL warehouse stopped?", False, "Not relevant to a serverless notebook."),
   ]),
   ("Best compute for this R development?", [
      ("Classic all-purpose, possibly Dedicated", True, "Interactive + unsupported serverless feature → classic all-purpose."),
      ("Serverless Jobs", False, "Still serverless, and not interactive."),
      ("Pro SQL warehouse", False, "Warehouses run SQL only."),
   ])],
  "Interactive + unsupported serverless feature → classic all-purpose (maybe Dedicated).", cov=["§51"])
b.scenario(7, 2, ["debug"], "You configure a classic all-purpose cluster with GPU instances and DBR ML and notice the Photon toggle can't be turned on.",
  [("Why?", [
      ("Photon isn't supported on GPU instance types", True, "Axis constraint: GPU + Photon ❌ on classic."),
      ("You need Dedicated access for Photon", False, "Photon has nothing to do with access mode."),
      ("DBR ML is too old", False, "It's the GPU instance type, not the runtime version."),
   ]),
   ("The team also runs heavy SQL ETL in the same notebook. Best approach?", [
      ("Run the SQL/ETL on a CPU compute with Photon; keep GPU compute for deep learning", True, "Different axes, different needs."),
      ("Force Photon via Spark config", False, "Not supported — don't fight the constraint."),
      ("Switch to single-node", False, "Topology doesn't unlock Photon on GPU."),
   ])],
  "Not all axis combinations are valid: GPU + Photon on classic GPU compute is the classic example.", cov=["§28", "§53-54"])
b.cloze(9, 2, ["exam", "pitfall"], "Complete the list of things serverless does NOT support.",
        "Serverless does not support compute [[policies]], instance [[pools]], compute-scoped [[init scripts]], compute-scoped [[libraries]] or most Spark cluster [[configurations|configs]].",
        "These are infrastructure-level concerns that the platform manages on serverless.", bank=["Photon", "autoscaling", "notebooks"], cov=["§46"])

# ------------------------------------------------------------------ DEBUG PLAYBOOKS
DEBUG = [
 {"id": "ch07-d01", "title": "My R / RDD notebook fails on serverless", "section": "ch07-s12",
  "symptom": "A notebook using R (or RDD APIs) fails or the language isn't available when attached to serverless notebook compute.",
  "askYourself": ["Is this notebook running on serverless notebook compute?", "Does my code use something serverless notebooks don't support (R, RDD APIs; the source also lists Scala)?", "Can I rewrite it with DataFrame/SQL APIs that serverless supports?", "If not, do I need classic all-purpose — and does the workload need Dedicated access?"],
  "steps": [{"do": "Check which compute the notebook is attached to.", "why": "Serverless notebook compute has language/API limits."},
            {"do": "Identify the unsupported feature (R, RDD).", "why": "Decides whether a rewrite or a compute change is needed."},
            {"do": "Attach to a classic all-purpose cluster (Dedicated if required).", "why": "Interactive + unsupported serverless feature → classic all-purpose."}],
  "rootCauses": ["Serverless notebooks don't support R or RDD APIs.", "Workload needs a direct/dedicated environment."],
  "fix": "Use classic all-purpose compute (possibly Dedicated access) for R/RDD development, or rewrite to DataFrame/SQL to stay on serverless.",
  "mnemonic": "Serverless says 'R? Arrr, no.'"},
 {"id": "ch07-d02", "title": "I can't find worker type / pool / init script fields on my serverless job", "section": "ch07-s09",
  "symptom": "You try to set worker type, min/max workers, an instance pool, a compute policy or a compute-scoped init script on serverless Jobs and the fields don't exist.",
  "askYourself": ["Am I on serverless or classic?", "Is the setting I want an infrastructure concern (VMs, counts, pools, init scripts, policies, Spark cluster configs)?", "Does my workload truly need that setting, or was I copying a classic habit?", "If it truly needs it, should this be Classic Jobs compute?"],
  "steps": [{"do": "Confirm the job's compute is serverless.", "why": "Serverless hides the infrastructure envelope by design."},
            {"do": "Check whether the requirement is real (e.g. custom JAR/low-level Spark).", "why": "Most workloads don't need these knobs."},
            {"do": "If required, switch the task to Classic Jobs compute and configure there.", "why": "Classic exposes VM type, workers, pools, init scripts, policies."}],
  "rootCauses": ["Serverless doesn't support compute policies, instance pools, compute-scoped init scripts, compute-scoped libraries or most Spark cluster configs.", "Applying classic thinking to serverless."],
  "fix": "Let serverless manage infrastructure; if a classic-only feature is required, use Classic Jobs compute.",
  "mnemonic": "No PIPS on serverless: Policies, Init scripts, Pools, Spark confs."},
 {"id": "ch07-d03", "title": "Production job runtime is unpredictable", "section": "ch07-s05",
  "symptom": "A scheduled production ETL takes 20 min some nights and 90 min others; it runs on a shared all-purpose cluster.",
  "askYourself": ["Which compute does this job run on — all-purpose, classic jobs or serverless jobs?", "Who else is attached to that cluster at the same time?", "Are developers' notebooks competing for CPU, RAM, executors, shuffle bandwidth?", "Is this one of the limited exceptions (iterative job testing, very short frequent jobs) — or real production?", "Can I move it to serverless Jobs or classic Jobs compute?"],
  "steps": [{"do": "Look at the job's compute setting.", "why": "All-purpose is shared and interactive by design."},
            {"do": "Check other activity on that cluster during the run.", "why": "Contention explains run-to-run variance."},
            {"do": "Switch the job to serverless Jobs (or classic Jobs compute).", "why": "Jobs compute's lifecycle is tied to the run — isolated and predictable."}],
  "rootCauses": ["Resource contention on shared all-purpose compute.", "Using all-purpose for production against Databricks' recommendation."],
  "fix": "Run production jobs on serverless Jobs or classic Jobs compute.",
  "mnemonic": "Prod gets its own room."},
 {"id": "ch07-d04", "title": "Python cell fails in a notebook attached to a SQL warehouse", "section": "ch07-s11",
  "symptom": "SQL cells run fine, but `from pyspark.sql import functions as F` fails in the same notebook.",
  "askYourself": ["What is this notebook attached to — a SQL warehouse or Spark compute?", "Which cell languages does a SQL warehouse run (SQL + Markdown only)?", "Can this logic be expressed in SQL instead?", "If I need Python, should I attach serverless notebook compute or all-purpose?"],
  "steps": [{"do": "Check the attached compute in the notebook header.", "why": "Warehouses only run SQL and Markdown."},
            {"do": "Rewrite in SQL or re-attach to Spark compute.", "why": "PySpark needs Spark/general compute."}],
  "rootCauses": ["Notebook attached exclusively to a SQL warehouse."],
  "fix": "Attach the notebook to serverless notebook compute (or classic all-purpose) for Python, or keep SQL-only cells on the warehouse."},
 {"id": "ch07-d05", "title": "Serverless job/pipeline starts too slowly (or costs more than expected)", "section": "ch07-s10",
  "symptom": "A serverless job or pipeline has slow startup that breaks an SLA — or a batch job is more expensive than needed.",
  "askYourself": ["Is this a serverless Job/pipeline or a notebook (notebooks have no Standard performance mode)?", "Which performance mode is set: Standard or Performance Optimized?", "Does this workload need fast startup (latency-sensitive) or is it batch with slack?", "Am I confusing performance mode with Standard ACCESS mode?"],
  "steps": [{"do": "Open the job/pipeline settings and read the performance mode.", "why": "It's the serverless cost/startup knob."},
            {"do": "Latency-sensitive → Performance Optimized; batch with slack → Standard.", "why": "Standard = slower startup, lower cost."}],
  "rootCauses": ["Standard performance mode on a latency-sensitive workload.", "Performance Optimized on a relaxed batch workload (paying for speed you don't need)."],
  "fix": "Match the performance mode to the SLA: Performance Optimized for fast startup, Standard for cheaper batch.",
  "mnemonic": "Fast or cheap — pick the mode."},
 {"id": "ch07-d06", "title": "Photon option unavailable on my GPU cluster", "section": "ch07-s07",
  "symptom": "On a classic GPU cluster with DBR ML, Photon can't be enabled.",
  "askYourself": ["Is this classic compute on GPU instance types?", "Do I actually need Photon (SQL/DataFrame engine) or the GPU (deep learning)?", "Should SQL/ETL parts run on a separate CPU compute with Photon?"],
  "steps": [{"do": "Confirm the instance type is GPU.", "why": "Photon isn't supported on GPU instance types."},
            {"do": "Split workloads: GPU compute for DL, CPU + Photon for ETL.", "why": "Different axes, different needs."}],
  "rootCauses": ["Axis constraint: GPU + Photon is not allowed on classic GPU compute."],
  "fix": "Accept no Photon on GPU compute, or run SQL/ETL on CPU compute with Photon."},
 {"id": "ch07-d07", "title": "Workload fails on serverless Jobs but worked on my Dedicated cluster", "section": "ch07-s06",
  "symptom": "Code that ran on a classic Dedicated cluster fails after moving the task to serverless Jobs.",
  "askYourself": ["Does serverless Jobs use Standard access-mode semantics?", "Was my code relying on something only Dedicated (single-user/direct) environments allow?", "Is the failing feature in the serverless-unsupported list (R, RDD, init scripts, Spark configs)?", "Should this task stay on classic Jobs compute with Dedicated access?"],
  "steps": [{"do": "Read the error and identify the feature used.", "why": "Serverless Jobs requires Standard-compatible workloads."},
            {"do": "Refactor to Standard-compatible APIs, or keep classic Jobs + Dedicated.", "why": "Only classic exposes Dedicated."}],
  "rootCauses": ["Serverless Jobs = Standard access semantics; Dedicated-only features fail."],
  "fix": "Make the workload Standard-compatible or run it on classic Jobs compute with Dedicated access."},
]

PITFALLS = [
 {"title": "Serverless is the opposite of all-purpose", "text": "They live on different axes: serverless/classic is infrastructure, all-purpose/jobs is lifecycle/purpose.", "fix": "Opposite of serverless = classic. Classic interactive = all-purpose."},
 {"title": "Looking for a 'serverless all-purpose cluster'", "text": "Interactive + serverless is named serverless notebook compute; the matrix is constrained.", "fix": "Use the Workload × Infrastructure matrix names."},
 {"title": "All-purpose = best for everything", "text": "The name is misleading: it means generic reusable interactive compute.", "fix": "Use Jobs compute (serverless or classic) for production jobs."},
 {"title": "Production jobs on shared all-purpose", "text": "Developers compete with the job for CPU, RAM, executors, shuffle bandwidth — no predictability.", "fix": "Serverless Jobs or classic Jobs compute."},
 {"title": "Autoscaling = serverless", "text": "Classic compute autoscales between min and max that YOU set.", "fix": "Autoscaling is a scaling axis; serverless is an infrastructure axis."},
 {"title": "Standard access vs Standard performance", "text": "Same word, unrelated concepts: security/isolation vs serverless cost/startup.", "fix": "Ask: classic security question or serverless speed/cost question?"},
 {"title": "'Standard compute' = basic compute", "text": "It means classic compute with Standard access mode.", "fix": "Read 'standard/dedicated compute' as access-mode names."},
 {"title": "Expecting a Standard/Dedicated dropdown on serverless", "text": "Serverless hides it; serverless Jobs uses Standard semantics.", "fix": "Need Dedicated → classic compute."},
 {"title": "Setting worker type / min-max / pools on serverless", "text": "Serverless manages infrastructure and doesn't support pools, policies, compute-scoped init scripts/libraries, most Spark configs.", "fix": "Let it go, or use classic if truly required."},
 {"title": "Photon on GPU classic compute", "text": "Photon isn't supported on GPU instance types.", "fix": "GPU for DL; CPU + Photon for ETL/SQL."},
 {"title": "Python cells on a SQL warehouse", "text": "Notebooks on a SQL warehouse run only SQL and Markdown.", "fix": "Attach to serverless notebook or all-purpose for Python."},
 {"title": "R on serverless notebooks", "text": "Serverless notebooks don't support R (nor RDD APIs).", "fix": "Classic all-purpose, possibly Dedicated."},
 {"title": "Standard performance mode for notebooks", "text": "Notebooks only use the performance-oriented interactive mode.", "fix": "Standard performance mode is for serverless Jobs/pipelines."},
 {"title": "All-purpose cluster for BI", "text": "Power BI / dashboards are a SQL/BI workload.", "fix": "Serverless SQL Warehouse."},
 {"title": "Pinning a DBR on serverless", "text": "Serverless manages the server runtime; you choose environment versions instead.", "fix": "Pin DBR only on classic."},
]

FLASH = [
 ("What is 'compute' in Databricks?", "The resources used to execute a workload: CPU, RAM, network, possibly GPU, Spark driver and executors.", 1),
 ("Name the 8 axes of the compute configuration vector.", "Purpose, infrastructure, access mode, topology, scaling, hardware, runtime, execution engine.", 1),
 ("Axis 1 values?", "Interactive, Job, Pipeline, SQL.", 2),
 ("Axis 2 values?", "Serverless vs Classic — who manages the machines.", 2),
 ("Where do classic computes run?", "In the customer's cloud account/environment.", 2),
 ("Interactive + serverless is called…", "Serverless compute for notebooks (serverless notebook compute).", 3),
 ("Interactive + classic is called…", "Classic all-purpose compute.", 3),
 ("Opposite of serverless?", "Classic (not all-purpose).", 3),
 ("Why 'constrained matrix'?", "Axes are conceptually independent, but only certain named products exist (no 'serverless all-purpose').", 3),
 ("The 6 Spark/general compute types?", "Serverless notebook, classic all-purpose, serverless Jobs, classic Jobs, serverless pipeline, classic pipeline.", 4),
 ("The 4 SQL warehouse types?", "Serverless, Pro, Classic, Lakehouse Real-Time [Beta].", 4),
 ("Lakehouse Real-Time SQL Warehouse is for…", "Very low-latency / high-concurrency read workloads (Beta).", 4),
 ("AI Runtime?", "Serverless GPU infrastructure for deep learning (Preview).", 4),
 ("Jobs compute lifecycle?", "Job start → compute starts → run → job ends → compute goes away.", 5),
 ("Can a job run on all-purpose?", "Technically yes for many task types, but not recommended for production.", 5),
 ("Standard access mode?", "Many users share classic compute with workload isolation; recommended for most classic workloads.", 6),
 ("Dedicated access mode?", "Compute assigned to one user or group; for some ML/GPU/R scenarios.", 6),
 ("'Standard compute' means…", "Classic compute configured with Standard access mode.", 6),
 ("Serverless Jobs access semantics?", "Standard access-mode semantics; workload must be Standard-compatible.", 6),
 ("Single-node is for…", "Small data, non-distributed libraries, certain ML, development.", 7),
 ("Autoscaling vs serverless?", "Different axes; classic can autoscale within your min/max.", 7),
 ("Photon on GPU classic compute?", "Not supported.", 7),
 ("Classic vs serverless runtime?", "Classic: you choose the DBR. Serverless: Databricks manages the runtime; you get environment versions.", 8),
 ("Photon on serverless?", "Enabled and managed by Databricks.", 8),
 ("4 things serverless doesn't support (infra)?", "Compute policies, instance pools, compute-scoped init scripts, compute-scoped libraries (and most Spark cluster configs).", 9),
 ("What's automatic on serverless Jobs?", "Autoscaling and Photon.", 9),
 ("Serverless performance modes?", "Performance Optimized (fast startup) vs Standard (slower startup, lower cost, batch).", 10),
 ("Which serverless workload lacks Standard performance mode?", "Notebooks.", 10),
 ("Standard access vs Standard performance?", "Security/isolation (classic) vs cost/startup trade-off (serverless). Unrelated.", 10),
 ("SQL warehouse features ladder?", "Classic: Photon. Pro: + Predictive IO. Serverless: + Intelligent Workload Management.", 11),
 ("Notebook on a SQL warehouse can run…", "SQL and Markdown only.", 11),
 ("Best default for Power BI?", "Serverless SQL Warehouse.", 12),
 ("Best default for spark-submit?", "Classic Jobs.", 12),
 ("Best default for dbt?", "Serverless SQL Warehouse (alt: Pro).", 12),
 ("First question in the decision diagram?", "What is my workload?", 12),
]

OBJ = ["You can explain compute as a configuration vector and name the axis behind any setting.",
       "You can draw the Workload × Infrastructure matrix and name all 10 compute types.",
       "You can distinguish all-purpose vs jobs lifecycles and Standard vs Dedicated access mode.",
       "You can tell Standard access mode from Standard performance mode and explain serverless performance modes.",
       "You can compare Serverless / Pro / Classic SQL warehouses and know a notebook on a warehouse runs only SQL/Markdown.",
       "You can choose the right compute for a workload with the one decision diagram.",
       "You can debug 'missing field on serverless', 'unpredictable prod job' and 'unsupported language' situations."]

ch = {"id": CID, "num": 7, "title": "Compute Landscape: Every Compute & Every Axis",
      "subtitle": "Serverless vs classic, all-purpose vs jobs, access modes, SQL warehouses — as axes, not a flat list",
      "emoji": "🧭", "sourcePages": "179–216",
      "mantra": "First ask WHAT you run, then WHO manages the machines, and only then turn the knobs.",
      "objectives": OBJ, "sections": S, "debug": DEBUG, "pitfalls": PITFALLS,
      "flashcards": [{"q": q, "a": a, "section": f"ch07-s{s:02d}"} for q, a, s in FLASH],
      "exercises": b.ex}
dump(ch, os.path.join(OUT, "ch07.json"))

HEAD = [
 ("§1", "What is compute (CPU/RAM/network/GPU/driver/executors)", 1), ("§2", "Terminology problem (list of 18 words)", 1),
 ("§3", "Basic axes / configuration vector", 1), ("§4", "Axis 1 — workload purpose", 2), ("§5", "Axis 2 — serverless vs classic", 2),
 ("§6", "Where all-purpose fits (≠ non-serverless)", 3), ("§7", "Serverless all-purpose? → serverless notebook compute", 3),
 ("§8", "Jobs: serverless vs classic", 3), ("§9", "Pipelines: serverless vs classic", 3), ("§10", "Workload × Infrastructure matrix", 3),
 ("§11", "Different axes but constrained matrix", 3), ("§12", "Full list of Spark compute types", 4), ("§13", "SQL family + Lakehouse Real-Time [Beta]", 4),
 ("§14", "Compute tree", 4), ("§15", "All-purpose concretely (my-dev-cluster)", 5), ("§16", "Jobs compute lifecycle", 5),
 ("§17", "Job on all-purpose? yes but not recommended", 5), ("§18", "All-purpose ≠ all workloads", 5), ("§19", "Access mode axis", 6),
 ("§20", "Standard access mode", 6), ("§21", "Dedicated access mode", 6), ("§22", "Combinations classic × lifecycle × access", 6),
 ("§23", "Classic compute matrix", 6), ("§24", "Serverless has no Standard/Dedicated dropdown", 6), ("§25", "Single vs multi-node", 7),
 ("§26", "Fixed vs autoscaling", 7), ("§27", "Autoscaling ≠ serverless", 7), ("§28", "CPU vs GPU; no Photon on GPU", 7),
 ("§29", "Serverless GPU / AI Runtime", 7), ("§30", "DBR axis (software ≠ hardware)", 8), ("§31", "Serverless runtime / environment versions", 8),
 ("§32", "Photon axis", 8), ("§33", "Big classic matrix", 9), ("§34", "Example config 1 (interactive ETL dev)", 9),
 ("§35", "Example config 2 (prod scheduled ETL)", 9), ("§36", "Serverless equivalent", 9), ("§37", "Serverless performance modes", 10),
 ("§38", "Serverless matrix (notebook no Standard)", 10), ("§39", "Standard access vs Standard performance", 10),
 ("§40", "SQL warehouse branch & features", 11), ("§41", "SQL warehouse matrix", 11), ("§42", "Notebook on SQL warehouse: SQL+Markdown only", 11),
 ("§43", "Usage matrix", 12), ("§44", "Conceptual tree", 12), ("§45", "Then choose parameters", 9),
 ("§46", "Serverless removes the matrix (no policies/pools/init scripts/libs/Spark confs)", 9), ("§47", "Example: 500 GB exploration", 12),
 ("§48", "Example: nightly ETL → serverless Jobs", 12), ("§49", "Example: custom JAR → classic Jobs", 12), ("§50", "Example: Power BI → serverless SQL WH", 12),
 ("§51", "Example: R notebook → classic all-purpose", 12), ("§52", "Terminology trap: standard/dedicated compute", 6),
 ("§53-54", "Matrix to keep / constraints between axes (source mangled)", 12), ("§55", "All combinations matrix", 12),
 ("§56", "Other serverless products, AI Runtime", 4),
 ("Q1", "Quiz: serverless opposite of all-purpose?", 3), ("Q2", "Quiz: classic equivalent of serverless notebook", 3),
 ("Q3", "Quiz: classic equivalent of serverless Jobs", 3), ("Q4", "Quiz: classic autoscale?", 7), ("Q5", "Quiz: all-purpose Standard or Dedicated?", 6),
 ("Q6", "Quiz: Classic+Jobs+Standard+Multi+Autoscale+Photon valid?", 9), ("Q7", "Quiz: serverless Jobs + worker type + 2–20 workers?", 9),
 ("Q8", "Quiz: Standard access = Standard performance?", 10), ("Q9", "Quiz: interactive PySpark", 12), ("Q10", "Quiz: scheduled PySpark ETL", 12),
 ("Q11", "Quiz: Power BI", 12), ("Q12", "Quiz: R development", 12), ("diagram", "The one diagram to remember", 12),
]
missing = coverage_md(os.path.join(OUT, "ch07.coverage.md"), "ch07 Compute Landscape (p179–216)", HEAD, b, S,
                      {d["id"]: f"{d['title']} → {d['section']}" for d in DEBUG})
print("uncovered:", missing)
