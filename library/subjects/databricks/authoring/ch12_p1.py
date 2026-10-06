# ch12 part 1: s01-s05   (exec'd by ch12_build.py — uses C, S, trap, playbook)

# =====================================================================
s01 = C.sec(1, "Ingestion: The Problem & the Ladder",
            "Almost every pipeline starts with files you didn't write — this chapter is how you land them safely, once.")
S("§1", "§2", "§103")
C.p("**Ingestion** is the process by which data that lives *outside* your target platform is brought *into* it — e.g. into a Delta table governed by Unity Catalog.")
C.diagram("""
 External system
   ├── CSV files
   ├── JSON
   ├── Parquet
   ├── API export          ──►  ingestion  ──►  Delta table
   ├── Kafka                                    (Databricks)
   ├── Database
   └── object storage
""", "Many sources, one goal: a reliable Delta table")
C.p("This chapter (Phase 4) focuses on **file-based ingestion**: data that arrives as files in cloud storage or a Unity Catalog Volume.")
C.p("**Running example.** An e-shop's operational system writes a new JSON file every **5 minutes** into `s3://company/orders/` — `orders_2026_09_28_0001.json`, `…_0002.json`, `…_0003.json` …")
C.flow(["new files", "Bronze", "Silver", "Gold"], "Where the files must end up")
C.p("The first problem is deceptively simple: **how do I read these files — and only the ones I haven't read yet?**")
C.diagram("""
 data lives somewhere
        ↓
 I must DISCOVER it
        ↓
 I must READ it
        ↓
 I must INTERPRET it with a schema
        ↓
 I must REMEMBER what I already processed
        ↓
 I must WRITE it reliably to Delta
""", "The six questions every ingestion pipeline answers")
C.diagram("""
 FILES → spark.read → schema → batch ingestion
       → COPY INTO → Auto Loader → incremental discovery
       → checkpoint + schemaLocation → schema evolution
       → rescued data → production debugging
""", "The ladder of this chapter: lowest abstraction first")
C.callout("key", "Recap: you've met the outlines before",
          "Chapter 2 introduced batch vs incremental, checkpoints, schema enforcement/evolution and the medallion layers; Chapter 10 previewed Phase 4. Here every one of those ideas gets its real syntax, its failure modes and its debugging checklist.")
C.reveal("Think first: the orders folder gains 288 files a day. Name three things your loader must decide or remember.",
         "(1) **Which files are new** (discovery), (2) **what shape they have** (schema), (3) **what it already loaded** (state), so a retry or tomorrow's run doesn't load yesterday's files again.")
C.terms([("Ingestion", "Bringing data from outside the platform into it (here: files → Delta)."),
         ("File-based ingestion", "The source delivers data as files (CSV/JSON/Parquet…) in object storage or a Volume."),
         ("Landing zone", "The storage path/Volume where source files arrive before ingestion."),
         ("Incremental ingestion", "Each run processes only what is new since the last run."),
         ("Reproducible", "Re-running the pipeline on the same inputs gives the same table — no surprises, no duplicates.")])

C.mcq("Which statement best defines **ingestion** in this chapter?",
      ["Bringing data that lives outside the target platform into it, e.g. files → a Delta table",
       "Aggregating Silver data into Gold metrics",
       "Optimizing small files inside a Delta table",
       "Granting SELECT on a Bronze table"], 0,
      "Ingestion is the *entry* step: external data (files, exports, streams) gets into the platform. Aggregating to Gold is transformation, OPTIMIZE is table maintenance and GRANT is governance — all happen *after* data has been ingested.",
      tags=("concept",), diff=1, quick=True,
      why=["Correct: outside → inside.", "That's Gold-layer transformation.", "That's table maintenance.", "That's governance."])
C.order("Put the six questions of an ingestion pipeline in order.",
        ["Where does the data live?", "Discover which files exist / are new", "Read the files",
         "Interpret them with a schema", "Remember what was already processed", "Write reliably to Delta"],
        "You can't read what you haven't discovered, can't type what you haven't read, and must record progress *before* the next run — otherwise you'll re-read. The final write must be transactional (Delta) so a crash doesn't leave half a load.",
        tags=("concept",), diff=1, quick=True)
C.tf("Phase 4 ingestion is mainly about consuming Kafka topics.", False,
     "Phase 4 focuses on **file-based ingestion**: CSV/JSON/Parquet files landing in storage. Kafka appears in the list of external sources, but message-bus streaming belongs to the Structured Streaming phase.",
     tags=("concept",), diff=1, quick=True)
C.calc("The operational system writes one orders file every 5 minutes, around the clock. How many files land per day?",
       288, "24 h × 60 min / 5 min = 288 files/day — about 105,000 per year. That's why 're-read the whole folder every run' becomes painful quickly and why file-tracking tools exist.",
       unit="files", tags=("calc",), diff=1)
C.odd("Three of these are external **sources** that ingestion reads from. Which one is not?",
      ["A folder of CSV exports", "An API export dumped as JSON", "A Kafka topic", "The Gold `daily_sales` table"], 3,
      "CSV exports, API dumps and Kafka topics all live outside the lakehouse and must be ingested. A Gold table is the *end* of the pipeline inside the platform — it's an output, not an ingestion source.",
      tags=("concept",), diff=1)
C.match("Match each rung of the ladder to what it adds.",
        [("spark.read", "Reads whatever is in the path right now"),
         ("COPY INTO", "Remembers which files it already loaded (SQL, idempotent)"),
         ("Auto Loader", "Incremental file discovery as a stream"),
         ("cloudFiles.schemaLocation", "Remembers the inferred schema and its evolution"),
         ("Rescued data column", "Keeps values that don't fit the schema")],
        "Each rung solves a problem the previous one leaves open: spark.read has no memory; COPY INTO adds per-file memory; Auto Loader adds scalable discovery + checkpointed progress; schemaLocation adds schema memory; rescued data stops information loss.",
        tags=("concept", "compare"), diff=2)

# =====================================================================
s02 = C.sec(2, "spark.read & CSV Parsing Options",
            "A CSV file is a grammar — if you don't tell the parser the rules, it reads nonsense without complaining.")
S("§3", "Q3")
C.p("`spark.read` is the most basic PySpark ingestion API. It is a **batch read**: it reads what is in the path *right now*.")
C.code("python", 'df = spark.read.format("json").load(path)')
C.flow(["path currently contains files", "Spark enumerates input", "reads them", "returns a DataFrame"], "What a batch read does")
C.code("python", 'orders = (\n    spark.read\n        .format("json")\n        .load("/Volumes/ecommerce/raw/incoming/orders/")\n)\n\n# shorter, identical:\norders = spark.read.json("/Volumes/ecommerce/raw/incoming/orders/")',
       "Long form vs shorthand")
C.callout("tip", "Two spellings, one reader",
          "`spark.read.format(\"csv\").load(p)` ≡ `spark.read.csv(p)`; same for `json` and `parquet`. The long form is handy when the format is a variable.")
S("§4", "§5", "§6")
C.p("**CSV** needs parsing options. The `header` option says: *the first line holds the column names*.")
C.code("python", 'df = (\n    spark.read\n        .format("csv")\n        .option("header", "true")\n        .load(path)\n)', "CSV with header")
C.code("text", "order_id,customer_id,amount\n1001,17,25.90\n1002,18,10.50", "orders.csv")
C.table(["header option", "Column names", "What happens to line 1"],
        [["\"true\"", "order_id, customer_id, amount", "Used as names"],
         ["not set / \"false\"", "_c0, _c1, _c2", "Read as a **data row** (\"order_id\",\"customer_id\",\"amount\")"]])
C.p("**Delimiter**: CSV doesn't always mean comma. A pipe-separated file needs `.option(\"delimiter\", \"|\")` (alias `sep`).")
C.code("python", '# file:  1001|17|25.90\n#        1002|18|10.50\ndf = (\n    spark.read\n        .format("csv")\n        .option("delimiter", "|")\n        .load(path)\n)', "Pipe-delimited CSV")
C.code("python", '.option("header", "true")\n.option("delimiter", ",")\n.option("quote", \'"\')\n.option("escape", \'"\')\n.option("multiLine", "true")\n.option("nullValue", "NULL")', "Options you'll meet constantly")
C.table(["Option", "Tells the parser…", "Example problem it solves"],
        [["header", "line 1 = column names", "columns named _c0, _c1…"],
         ["delimiter / sep", "the field separator", "`|` or `;` files read as 1 column"],
         ["quote", "which char wraps a field", "`\"Athens, GR\"` split into 2 fields"],
         ["escape", "how a quote inside a quoted field is escaped", "`\"He said \"\"hi\"\"\"` breaks parsing"],
         ["multiLine", "a quoted field may contain newlines", "an address with a line break becomes 2 rows"],
         ["nullValue", "which text means NULL", "the string 'NULL' stored as text"],
         ["mode", "what to do with malformed rows", "PERMISSIVE / DROPMALFORMED / FAILFAST"]])
C.p("**`mode`** (added for clarity — you need it to debug bad CSV): **PERMISSIVE** (default) keeps the row and sets unparsable fields to null; **DROPMALFORMED** silently drops bad rows; **FAILFAST** throws on the first bad row. In PERMISSIVE you can keep the raw bad line with `columnNameOfCorruptRecord` (e.g. `_corrupt_record`).")
C.callout("key", "The file format is a grammar",
          "Don't memorize every option. Learn to think: *what is the structure of this file, and have I told the parser?* Separator, quoting, escaping, line breaks, null spelling, header.")
trap("pitfall", "No header option → header becomes data",
     "Reading a CSV with a header line but without `.option(\"header\",\"true\")` gives columns `_c0, _c1…` AND an extra data row containing the column names — which later fails every cast.",
     "Always state `header` explicitly for CSV (and check the first rows with display()).")
trap("exam", "CSV without schema = all STRING",
     "Plain CSV has no native types. With neither `.schema(...)` nor `inferSchema=true`, every CSV column is read as **STRING**.",
     "Pass an explicit schema (production) or set inferSchema for exploration.")
C.reveal("Think first: you read `1001|17|25.90` with default CSV options. How many columns do you get?",
         "**One** column `_c0` containing the whole line `1001|17|25.90` — the parser looked for commas, found none. No error is raised: wrong grammar silently gives wrong data.")
C.ask("Ask yourself when a CSV reads wrong", [
    "Did I set `header` — and does the file actually have a header line?",
    "Is the separator really a comma, or `|`, `;`, tab?",
    "Do fields contain the separator or newlines inside quotes (quote / escape / multiLine)?",
    "How does the source spell NULL (`NULL`, empty, `NA`)?",
    "Which `mode` decides what happens to malformed rows — and am I silently dropping or nulling data?"])

S("§3", "Q3")
C.mcq("`spark.read.json(path)` is best described as…",
      ["A batch read of whatever files are in the path at this moment",
       "An incremental read that skips files already read yesterday",
       "A streaming read that waits for new files",
       "A read that only loads files modified today"], 0,
      "`spark.read` is plain **batch**: it enumerates the path's *current* contents and reads them all. It has no memory of previous runs — that's exactly the gap COPY INTO and Auto Loader fill.",
      tags=("concept",), diff=1, quick=True,
      why=["Correct.", "No memory: that's COPY INTO / Auto Loader.", "That's readStream/Auto Loader.", "No such default filter exists."])
S("§4", "§5", "§6")
C.cloze("Complete a CSV read that uses the first line as column names.",
        'df = (\n    spark.[[read]]\n        .format("[[csv]]")\n        .option("[[header]]", "true")\n        .[[load]](path)\n)',
        "`spark.read` → `.format(\"csv\")` → `.option(\"header\",\"true\")` → `.load(path)`. `readStream` would make it a streaming read, and `inferSchema` is a different option (types, not names).",
        bank=["readStream", "inferSchema", "save", "json"], as_code=True, tags=("syntax",), diff=1, quick=True)
C.tf("If you read a CSV without the header option, Spark names the columns `_c0`, `_c1`, `_c2`, …", True,
     "Without `header=true` Spark doesn't know names exist, so it generates positional names — and also treats the real header line as a data row. That second effect is the nasty part.",
     tags=("concept", "pitfall"), diff=1, quick=True)
C.mcq("A pipe-separated file (`1001|17|25.90`) is read with `spark.read.format(\"csv\").load(path)`. What do you get?",
      ["One column `_c0` holding each whole line", "Three correctly split columns", "An immediate parse error", "An empty DataFrame"], 0,
      "The default separator is a comma. With no comma in the line, the whole line is one field. Spark does not error — that's why a wrong grammar is dangerous: it gives quietly wrong data.",
      tags=("pitfall", "debug"), diff=2,
      why=["Correct.", "Only with delimiter '|'.", "No error: PERMISSIVE parsing just yields one field.", "Rows are read, just not split."])
C.write("Write PySpark that reads a **pipe-delimited** CSV **with a header line** from `/Volumes/ecommerce/raw/orders_pipe/` into `df`.",
        'df = (\n    spark.read\n        .format("csv")\n        .option("header", "true")\n        .option("delimiter", "|")\n        .load("/Volumes/ecommerce/raw/orders_pipe/")\n)',
        ["spark.read", 'format("csv")', 'option("header", "true")', 'option("delimiter", "|")', ".load("],
        "Two grammar facts must be told to the parser: the first line is names (`header`) and the separator is `|` (`delimiter`, alias `sep`). Leave either out and you get `_c0` columns or one-column rows.",
        lang="python", tags=("syntax",), diff=2)
C.match("Match each CSV option to the problem it solves.",
        [("quote", "A field like \"Athens, GR\" is split into two"),
         ("escape", "A quote character inside a quoted field breaks parsing"),
         ("multiLine", "A quoted address containing a line break becomes two rows"),
         ("nullValue", "The text NULL is stored as a string instead of null"),
         ("delimiter", "A ;-separated file is read as one column")],
        "Each option describes one grammar rule. Debug a broken CSV by asking which rule the parser got wrong: separators, quoting, escaping, newlines inside fields or null spelling.",
        tags=("syntax", "debug"), diff=2)
C.spotbug("The file `/Volumes/ecommerce/raw/orders_pipe/` looks like `order_id|customer_id|amount` then `1001|17|25.90`. Which line is wrong?",
          ['df = (', '    spark.read', '        .format("csv")', '        .option("header", "true")',
           '        .option("delimiter", ",")', '        .load("/Volumes/ecommerce/raw/orders_pipe/")', ')'],
          [4], '.option("delimiter", "|")',
          "The header option is right, but the delimiter says comma while the file uses pipes. Result: a single column named `order_id|customer_id|amount` holding whole lines — no error, just wrong data.",
          tags=("debug", "syntax"), diff=1)
C.bucket("Sort each behaviour into the CSV `mode` that produces it.",
         ["PERMISSIVE", "DROPMALFORMED", "FAILFAST"],
         [("Default mode", 0), ("Keeps the bad row, sets unparsable fields to null", 0),
          ("Can keep the raw bad line in `_corrupt_record`", 0), ("Bad rows silently disappear", 1),
          ("Row counts shrink without any error", 1), ("Job throws on the first malformed row", 2),
          ("Best when any bad row must stop the load", 2)],
        "PERMISSIVE keeps everything (nulls + optional corrupt-record column), DROPMALFORMED hides problems by dropping rows, FAILFAST makes problems loud. In Bronze, silently dropping (DROPMALFORMED) is usually the worst choice because you lose evidence.",
        tags=("concept", "pitfall"), diff=2)
C.tf("A CSV read with neither `.schema(...)` nor `inferSchema=true` returns typed columns (INT, DOUBLE…) automatically.", False,
     "CSV is plain text with no native types. Without a schema or inference, every column is **STRING**. JSON is different: the JSON reader infers types from the values by default.",
     tags=("exam", "pitfall"), diff=2)
C.free("In your own words: what does it mean that \"the file format is a grammar\", and how does that help you debug a broken CSV read?",
       "A parser can only split and type a file correctly if it knows the file's rules: separator, header line, quote and escape characters, whether fields contain newlines, how nulls are spelled. When a CSV reads wrong I don't randomly toggle options — I look at the raw file, list its grammar rules and compare them with the options I passed (header, delimiter, quote, escape, multiLine, nullValue, mode).",
       ["Parser needs the file's structural rules", "Names concrete rules: separator, header, quote/escape, multiLine, null spelling",
        "Debug by comparing raw file vs options passed", "Wrong grammar often gives silently wrong data, not errors"],
       "Thinking of options as grammar turns option-guessing into a checklist. It also explains why the worst CSV bugs don't throw: the parser happily applies the wrong grammar.",
       tags=("concept", "debug"), diff=2)

# =====================================================================
s03 = C.sec(3, "Schema Inference vs Explicit Schema",
            "Guessing types costs an extra pass over the data — and tomorrow's guess may differ from today's.")
S("§7", "§8")
C.p("If you don't give a schema, Spark can **infer** one. For CSV you must ask for it with `inferSchema`.")
C.code("python", 'df = (\n    spark.read\n        .option("header", "true")\n        .option("inferSchema", "true")\n        .csv(path)\n)')
C.table(["Input column", "Sample values", "Inferred type"], [["id", "1, 2", "INT"], ["amount", "15.2, 20.1", "DOUBLE"]])
C.p("Why does inference **cost** something? To know whether `\"123\"` is INT, LONG or STRING, Spark must **look at the data** first.")
C.flow(["inspect input", "decide types", "then read the actual data"], "Inference = an extra pass")
C.callout("key", "Explicit schema skips the inference pass",
          "Databricks documentation says it explicitly: supplying a schema lets the reader **skip schema inference**, which speeds up the read.")
S("§9", "§10")
C.code("python", 'from pyspark.sql.types import (\n    StructType, StructField,\n    LongType, DoubleType, StringType, TimestampType,\n)\n\nschema = StructType([\n    StructField("order_id",    LongType(),      True),\n    StructField("customer_id", LongType(),      True),\n    StructField("amount",      DoubleType(),    True),\n    StructField("status",      StringType(),    True),\n    StructField("order_ts",    TimestampType(), True),\n])\n\ndf = spark.read.schema(schema).json(path)',
       "Explicit schema with StructType (the 3rd arg = nullable)")
C.p("With `.schema(...)` you say: **\"Don't guess. This is the contract.\"**")
C.code("python", 'schema = """\n  order_id    BIGINT,\n  customer_id BIGINT,\n  amount      DOUBLE,\n  status      STRING,\n  order_ts    TIMESTAMP\n"""\n\ndf = spark.read.schema(schema).json(path)',
       "Same contract as a DDL-formatted string")
C.code("python", 'schema = """\n  order_id BIGINT, customer_id BIGINT,\n  amount DOUBLE,   status STRING\n"""\n\ndf = (\n    spark.read\n        .format("csv")\n        .option("header", "true")\n        .schema(schema)\n        .load("/Volumes/ecommerce/raw/orders_csv/")\n)\ndisplay(df)', "Lab: CSV ingestion with an explicit schema")
C.p("Databricks accepts a schema either as a **StructType** or as a **DDL string**. The DDL string is often more readable and easy to review in Git.")
C.table(["DDL type", "StructType class"], [["BIGINT", "LongType()"], ["INT", "IntegerType()"], ["DOUBLE", "DoubleType()"],
                                         ["STRING", "StringType()"], ["TIMESTAMP", "TimestampType()"]])
S("§11", "§99", "Q2")
C.compare(("Schema inference", ["Convenient for **exploratory** work", "Extra pass over the data", "Types can change between runs", "Nobody reviewed the contract"]),
          ("Explicit schema", ["Default choice for **production** ingestion", "**Faster** (no inference pass)", "**Predictable** and **version-controlled**", "No accidental type surprises; easier validation"]))
S("§12")
C.diagram("""
 File 1 (Mon)        File 2 (Tue)
 amount              amount
 100                 100.50
 200
   ↓ infer             ↓ infer
 amount: INT         amount: DOUBLE   ← type changed!
""", "The schema-inference bug: same column, different guess")
trap("warn", "Inference is a moving target",
     "Monday's files make Spark infer `amount INT`; Tuesday's file has `100.50` → the inferred type changes (or parsing breaks). Downstream writes then hit schema mismatches.",
     "Have a deliberate schema policy: explicit schema (or Auto Loader with schemaLocation + hints) for production ingestion.")
C.callout("interview", "Engineering question: why explicit schema in production?",
          "It **avoids an inference pass**, gives a **stable data contract**, makes **failures predictable**, prevents **accidental type drift**, and lets schema changes be **reviewed** instead of silently inferred.")
C.reveal("Think first: with an explicit schema `amount DOUBLE`, a row arrives with `amount = \"abc\"`. What happens in the default PERMISSIVE mode?",
         "The row is kept and `amount` becomes **null** (optionally the raw record goes to a corrupt-record or rescued-data column). No type drift — the contract held; the bad *value* is what you now investigate.")
C.ask("Ask yourself before relying on schema inference", [
    "Is this exploration or a production pipeline?",
    "Would a different guess tomorrow (INT → DOUBLE) break a downstream write?",
    "Who owns the contract with the upstream team — and is it written down?",
    "Could a reviewer see a schema change in Git, or would it happen silently?"])

S("§7", "§8")
C.mcq("Why does schema inference on CSV/JSON cost time?",
      ["Spark must inspect the data to decide types before reading it for real",
       "Spark must contact Unity Catalog for every column",
       "Inference rewrites the files as Parquet first",
       "Inference forces a shuffle of all rows"], 0,
      "Types aren't stored in CSV/JSON, so Spark samples/scans input, decides types, then reads again. Explicit schema removes that pass. Unity Catalog, rewriting to Parquet and shuffles have nothing to do with inference.",
      tags=("concept",), diff=1, quick=True,
      why=["Correct.", "UC isn't involved in file type guessing.", "No rewrite happens.", "No shuffle needed for inference."])
S("§9", "§10", "§11")
C.tf("Supplying an explicit schema lets the reader skip the schema-inference pass.", True,
     "That's the documented performance benefit: with `.schema(...)` the reader trusts your contract and goes straight to reading. Predictability is the other, often bigger, benefit.",
     tags=("concept", "exam"), diff=1, quick=True)
C.cloze("Complete the explicit schema.",
        'schema = [[StructType]]([\n    [[StructField]]("order_id", [[LongType]](), True),\n    StructField("amount", [[DoubleType]](), True),\n    StructField("status", StringType(), True),\n])\ndf = spark.read.[[schema]](schema).json(path)',
        "A StructType is a list of StructFields (name, type instance, nullable). BIGINT ↔ LongType, DOUBLE ↔ DoubleType. The reader method is `.schema(...)` — `inferSchema` is the opposite idea.",
        bank=["IntegerType", "inferSchema", "StructColumn", "FloatType"], as_code=True, tags=("syntax",), diff=2)
C.write("Write a **DDL-string** schema for `order_id BIGINT, customer_id BIGINT, amount DOUBLE, status STRING` and use it to read JSON from `path` into `df`.",
        'schema = "order_id BIGINT, customer_id BIGINT, amount DOUBLE, status STRING"\n\ndf = (\n    spark.read\n        .schema(schema)\n        .json(path)\n)',
        ["order_id bigint", "amount double", "status string", ".schema(schema)", ".json("],
        "Databricks accepts a DDL string anywhere a StructType is accepted — no imports needed, and it reads like a CREATE TABLE column list. The reader then skips inference.",
        lang="python", tags=("syntax",), diff=1)
C.match("Match the DDL type to its StructType class.",
        [("BIGINT", "LongType()"), ("INT", "IntegerType()"), ("DOUBLE", "DoubleType()"), ("STRING", "StringType()"), ("TIMESTAMP", "TimestampType()")],
        "BIGINT is a 64-bit long, INT a 32-bit integer. Mixing them up (INT for order IDs) is a classic overflow risk on large ID ranges.",
        tags=("syntax",), diff=1)
C.spotbug("This schema crashes when the read runs. Which line is buggy?",
          ['schema = StructType([', '    StructField("order_id", LongType(), True),', '    StructField("amount", DoubleType, True),',
           '    StructField("status", StringType(), True),', '])', 'df = spark.read.schema(schema).json(path)'],
          [2], 'StructField("amount", DoubleType(), True),',
          "`DoubleType` without parentheses passes the *class*, not a DataType *instance*. StructField needs an instance like `DoubleType()`. A DDL string avoids this whole class of typos.",
          tags=("syntax", "debug"), diff=2)
C.odd("Which one is NOT a reason to prefer explicit schema for production ingestion?",
      ["Faster: no inference pass", "Predictable and version-controlled contract", "No accidental type surprises",
       "New upstream columns are adopted automatically without review"], 3,
      "An explicit schema does the opposite of auto-adopting: changes must be made deliberately and reviewed. That's a feature — but it means you need a plan for new columns (rescued data / evolution policy).",
      tags=("concept", "exam"), diff=2)
C.bucket("Exploration or production? Choose the better default.",
         ["Schema inference is fine", "Use an explicit schema"],
         [("Peeking at a vendor's sample file in a notebook", 0), ("One-off ad-hoc analysis of a CSV", 0),
          ("Nightly Bronze load feeding finance dashboards", 1), ("A pipeline whose downstream MERGE expects BIGINT keys", 1),
          ("A job reviewed and deployed through CI/CD", 1), ("Figuring out what columns a new feed even has", 0)],
        "Inference trades predictability for convenience — fine when a human is looking at the result. Anything scheduled, shared, or feeding typed downstream tables needs a contract that doesn't change silently.",
        tags=("compare",), diff=1)
S("§87")
C.write("Lab (CSV ingestion): the file has `order_id,customer_id,amount,status` + rows like `1001,10,19.50,NEW`. Read `/Volumes/ecommerce/raw/orders_csv/` as CSV with the header line and an explicit DDL schema (`order_id BIGINT, customer_id BIGINT, amount DOUBLE, status STRING`), then `display` it.",
        'schema = """\n  order_id BIGINT,\n  customer_id BIGINT,\n  amount DOUBLE,\n  status STRING\n"""\n\ndf = (\n    spark.read\n        .format("csv")\n        .option("header", "true")\n        .schema(schema)\n        .load("/Volumes/ecommerce/raw/orders_csv/")\n)\ndisplay(df)',
        ['format("csv")', 'option("header", "true")', ".schema(schema)", "order_id bigint", "amount double", "display(df)"],
        "Header gives the names, the explicit schema gives the types — no inference pass, and the contract is reviewable. `header` is still needed with an explicit schema, otherwise the header line is parsed as a (malformed) data row.",
        lang="python", tags=("syntax",), diff=2)
C.tf("When you pass an explicit schema to a CSV read, the `header` option no longer matters.", False,
     "The schema sets names and types, but the parser still needs to know that line 1 is a header. Without `header=true` the header line is parsed as data (and fails the BIGINT/DOUBLE casts → nulls or corrupt rows).",
     tags=("pitfall",), diff=2)
S("§12")
C.mcq("Monday's CSVs have `amount` = 100, 200 (inferred INT). Tuesday a file has `100.50`. What is the risk with inferSchema?",
      ["The inferred type changes (INT → DOUBLE) or parsing breaks, so downstream writes can hit schema mismatches",
       "Spark rejects Tuesday's file because INT is locked forever",
       "Nothing — inference always picks the widest type ever seen",
       "Spark converts 100.50 to 100 silently and keeps INT"], 0,
      "Inference only sees the data it's given *this run*. A different sample → a different type. That's why ingestion needs a deliberate schema policy instead of letting each run guess.",
      tags=("pitfall", "exam"), diff=2,
      why=["Correct.", "Inference has no memory between runs.", "It only knows the data it sampled this run.", "Not what happens; the type guess changes instead."])
S("§99", "Q2")
C.free("Engineering question: **why would you prefer an explicit schema in production?** Give at least four reasons.",
       "An explicit schema avoids the inference pass (faster), gives a stable, version-controlled data contract, makes failures predictable (a bad value fails or is rescued the same way every time), prevents accidental type drift between runs, and forces schema changes to be reviewed instead of silently inferred. Databricks documents that supplying a schema lets the reader skip inference.",
       ["Performance: skips inference pass", "Stable/version-controlled contract", "Predictable failures, easier debugging",
        "No silent type drift", "Schema changes are reviewed / controlled evolution"],
       "Big-Test Q2 answer in one line: performance, predictable contract, easier debugging, controlled evolution.",
       tags=("interview", "exam"), diff=2)

playbook(1, "Inferred column types drift between runs", s03,
         "Yesterday's load worked; today the write fails with a schema mismatch, or `amount` arrives as DOUBLE/STRING instead of INT. Nobody changed the code.",
         ["Is this read using `inferSchema` (or JSON's default inference) instead of an explicit schema?",
          "What type did yesterday's run infer, and what does today's run infer for the same column?",
          "Which new file introduced the different values (e.g. `100.50`, `unknown`)?",
          "Is the new value legitimate (contract change) or a bad record?",
          "Should Bronze keep this column as STRING and cast in Silver instead?"],
         [("Print both schemas and diff them.", "Confirms it's an inference change, not a code change.", 'df.printSchema()'),
          ("Find the file with the new value pattern using the source-file path.", "Pins down which delivery changed.", 'df.select("amount", "_metadata.file_path").where("amount NOT RLIKE \'^[0-9]+$\'")'),
          ("Ask the upstream owner whether the type change is intended.", "Decides evolve vs reject."),
          ("Replace inference with an explicit schema (DDL string) in Git.", "Stops future silent drift.", 'schema = "order_id BIGINT, amount DOUBLE, status STRING"\ndf = spark.read.schema(schema).json(path)')],
         ["Schema inferred from different samples each run", "Upstream started sending decimals/strings", "No deliberate schema policy"],
         "Pin the contract: explicit schema (or STRING in Bronze + typed casts in Silver), and handle genuinely new types through a reviewed change.",
         mnemonic="GUESS → DIFF → FILE → OWNER → PIN")
C.scenario("Your nightly CSV load (with `inferSchema=true`) suddenly fails writing to `bronze.orders_raw`: *schema mismatch on column amount*. The code hasn't changed in weeks.",
           [("What do you check first?",
             [("Compare the inferred schema of today's input with the table schema", True, "Right: an unchanged job + a new mismatch screams 'the inferred type changed'."),
              ("Enable mergeSchema so the write passes", False, "That hides the symptom and may widen your table's types without review."),
              ("Restart the cluster", False, "Compute restarts don't change how types are inferred from data.")]),
            ("Today's inference says `amount: double`; the table has `amount: int`. Next?",
             [("Find which file contains decimal amounts and ask upstream if that's intended", True, "Yes: decide whether it's a contract change or a bad delivery."),
              ("Cast amount to int in the read and move on", False, "Truncating 100.50 to 100 silently corrupts money values."),
              ("Delete today's files", False, "Destroys evidence and real orders.")]),
            ("Upstream confirms: prices now have cents. Long-term fix?",
             [("Use an explicit schema (e.g. DECIMAL/DOUBLE) committed to Git and evolve the table deliberately", True, "Predictable, reviewed, no more guessing per run."),
              ("Keep inferSchema but run the job twice", False, "Inference is still a per-run guess."),
              ("Switch to DROPMALFORMED mode", False, "That would silently drop the decimal rows.")])],
           tags=("debug",), diff=2)
C.order("Order the playbook for 'inferred types drift between runs'.",
        ["Confirm the read relies on inference", "Diff yesterday's vs today's inferred schema",
         "Locate the file that introduced the new values", "Ask upstream whether the change is intended",
         "Pin an explicit schema (or STRING in Bronze) in Git"],
        "Prove the mechanism (inference) before acting, find the evidence (file), decide with the owner, then remove the cause (pinned contract). Jumping straight to 'enable evolution' skips the decision.",
        tags=("debug",), diff=2)

# =====================================================================
s04 = C.sec(4, "JSON, Parquet & read_files()",
            "Text formats need parsing, typed formats carry their schema — and SQL has its own file reader.")
S("§13")
C.p("**JSON** (as read by Spark by default) is one object per line — *JSON Lines*:")
C.code("text", '{"order_id": 1, "customer": "Maria", "amount": 20.5}\n{"order_id": 2, "customer": "John",  "amount": 50.0}', "orders.json")
C.code("python", 'df = spark.read.json(path)                 # types inferred from values\ndf = spark.read.schema(schema).json(path)  # explicit contract')
C.p("JSON can be **nested**. A nested object becomes a **struct** column:")
C.code("text", '{"order_id": 1, "customer": {"id": 100, "name": "Maria"}}')
C.diagram("""
 root
  ├── order_id: long
  └── customer: struct
        ├── id: long
        └── name: string
""", "Inferred schema (printSchema) — access with customer.name")
C.callout("tip", "One record spread over many lines?",
          "Pretty-printed JSON (one object across several lines, or a big array) needs `.option(\"multiLine\", \"true\")`; the default reader expects one JSON object per line.")
S("§14", "§15")
C.p("**Parquet** is typed: each file stores its **schema metadata**. `spark.read.parquet(path)` needs no CSV-style parsing options or type guessing.")
C.table(["Format", "Nature", "Where types come from"],
        [["CSV", "textual", "weak / none — you or inference decide"],
         ["JSON", "semi-structured (nested)", "inferred from the content"],
         ["Parquet", "columnar, binary", "schema encoded in the file"]])
C.p("That's why lakehouses typically **ingest raw CSV/JSON** and then write **Delta (Parquet-backed) tables**: from then on the types live with the data.")
S("§16", "§17", "§85")
C.p("**`read_files()`** is Databricks' SQL table-valued function for reading files. It reads CSV, JSON, XML, text, binary, Parquet, Avro and ORC, and can infer format and schema.")
C.code("sql", "SELECT *\nFROM read_files(\n  '/Volumes/ecommerce/raw/orders/',\n  format => 'json'\n);\n\nSELECT *\nFROM read_files(\n  '/Volumes/ecommerce/raw/orders/',\n  format => 'csv',\n  schema => 'order_id BIGINT, customer_id BIGINT, amount DOUBLE'\n);",
       "read_files: inferred vs explicit schema (named args use =>)")
C.p("Where you'll use it: **Databricks SQL**, **Lakeflow pipelines**, and **ad-hoc file exploration**.")
C.code("sql", "CREATE OR REFRESH STREAMING TABLE bronze_orders\nAS\nSELECT *\nFROM STREAM read_files(\n  '/Volumes/ecommerce/raw/orders/',\n  format => 'json'\n);",
       "Preview of Phase 6: read_files inside a streaming table")
trap("exam", "STREAM read_files = Auto Loader underneath",
     "When `read_files` is used with `STREAM` in a streaming table, Databricks runs **Auto Loader** for incremental file ingestion. Everything you learn about Auto Loader (checkpoints, schema inference, rescued data) applies.",
     "Treat `STREAM read_files(...)` as the SQL face of Auto Loader.")
C.reveal("Think first: why does Parquet not need a `header` or `inferSchema` option?",
         "Because the **schema is stored in the file** itself (column names + types in the footer). There's nothing to guess and no header line to interpret.")

S("§13")
C.tf("By default `spark.read.json` expects one JSON object per line.", True,
     "The default is JSON Lines. A pretty-printed object spanning several lines needs `multiLine=true`, otherwise you'll see corrupt records.",
     tags=("concept", "pitfall"), diff=2, quick=True)
C.mcq("You read `{\"order_id\": 1, \"customer\": {\"id\": 100, \"name\": \"Maria\"}}` with `spark.read.json`. What type is `customer`?",
      ["struct<id: long, name: string>", "string", "map<string,string>", "array<string>"], 0,
      "A nested JSON object becomes a **struct** with its own typed fields; you access `customer.name`. It is not flattened to a string, and Spark doesn't choose map unless you declare one.",
      tags=("concept",), diff=1, quick=True,
      why=["Correct.", "Only with a schema declaring STRING.", "Map only if you declare it.", "Arrays come from JSON lists [...]."])
S("§14", "§15")
C.bucket("Sort each property to its format.", ["CSV", "JSON", "Parquet"],
         [("Textual, weak/no native types", 0), ("Needs header/delimiter options", 0),
          ("Semi-structured with nested objects", 1), ("Types inferred from content", 1),
          ("Columnar", 2), ("Schema encoded in the file", 2), ("No parsing options needed to get types", 2)],
        "CSV is flat text; JSON is text with structure; Parquet is binary, columnar and self-describing. That's why raw CSV/JSON is landed and then written into Delta/Parquet-backed tables.",
        tags=("compare",), diff=1, quick=True)
C.tf("Parquet files need `inferSchema=true` to get typed columns.", False,
     "Parquet stores its schema in the file's metadata, so types come for free. `inferSchema` is a CSV-parser option.",
     tags=("concept",), diff=1)
S("§16", "§17")
C.cloze("Complete the SQL that reads CSV files with an explicit schema.",
        "SELECT *\nFROM [[read_files]](\n  '/Volumes/ecommerce/raw/orders/',\n  format [[=>]] 'csv',\n  [[schema]] => 'order_id BIGINT, amount DOUBLE'\n);",
        "`read_files` is a table-valued function with named arguments written `name => value`. `format` and `schema` are the two you'll use most.",
        bank=["read_csv", "=", "columns", "spark.read"], as_code=True, tags=("syntax",), diff=2)
C.write("Write a Databricks SQL query that reads JSON files from `/Volumes/ecommerce/raw/orders/` with `read_files`.",
        "SELECT *\nFROM read_files(\n  '/Volumes/ecommerce/raw/orders/',\n  format => 'json'\n);",
        ["select", "from read_files(", "/volumes/ecommerce/raw/orders/", "format => 'json'"],
        "In SQL you don't need spark.read: `read_files(path, format => ...)` returns a table you can SELECT from. Omit `format` and it can infer it; add `schema =>` for a contract.",
        lang="sql", tags=("syntax",), diff=1)
C.odd("Which one can `read_files` NOT read directly?", ["Avro files", "ORC files", "XML files", "A Kafka topic"], 3,
      "read_files reads **files** (CSV, JSON, XML, text, binary, Parquet, Avro, ORC). A Kafka topic is a message stream, consumed with a streaming Kafka source, not a file reader.",
      tags=("concept",), diff=1)
S("§85", "§17")
C.mcq("In a Lakeflow streaming table, `SELECT * FROM STREAM read_files('/Volumes/.../orders/', format => 'json')` ingests files using…",
      ["Auto Loader under the hood", "Repeated full spark.read of the folder", "COPY INTO", "A Kafka connector"], 0,
      "In streaming-table context Databricks uses **Auto Loader** for incremental file ingestion. So checkpoints, schema inference/evolution and rescued data behave as in this chapter.",
      tags=("exam",), diff=2,
      why=["Correct.", "That wouldn't be incremental.", "COPY INTO is a separate SQL command.", "Files aren't Kafka."])

# =====================================================================
s05 = C.sec(5, "Metadata Columns: Which File Did This Row Come From?",
            "When a bad row shows up in Silver, the first question is 'which file?' — make Bronze able to answer.")
S("§18", "§83")
C.p("When you ingest files you often want to know: **from which file did this row come? when was the file created? which source sent it?**")
C.diagram("""
 business data          +   ingestion metadata
 order_id, amount           _source_file, _ingested_at
""", "A Bronze row = what the source said + how it got here")
C.p("Spark file sources expose a hidden **`_metadata`** column. You must **select it explicitly** — `SELECT *` doesn't include it.")
C.table(["Field", "Meaning"],
        [["_metadata.file_path", "Full path of the source file"], ["_metadata.file_name", "File name only"],
         ["_metadata.file_size", "Size in bytes"], ["_metadata.file_modification_time", "Last modification timestamp of the file"]])
C.code("python", 'from pyspark.sql import functions as F\n\nbronze_df = (\n    spark.read.schema(schema).json(path)\n        .select(\n            "*",\n            F.col("_metadata.file_path").alias("_source_file"),\n            F.current_timestamp().alias("_ingested_at"),\n        )\n)',
       "Adding audit columns (works the same on an Auto Loader stream)")
C.code("sql", "SELECT *, _metadata.file_path AS _source_file\nFROM read_files('/Volumes/ecommerce/raw/orders/', format => 'json');", "Same idea in SQL")
C.callout("tip", "Legacy spelling",
          "Older code uses `input_file_name()`. Prefer `_metadata.file_path`: it's the current, documented way and also gives size and modification time.")
C.diagram("""
 Silver bad row
      ↓  (keys / lineage)
 Bronze source row  ── _source_file = .../orders_0912.json
      ↓
 original file in the landing zone
""", "Audit trail that metadata columns make possible")
C.callout("key", "Source-file metadata = audit evidence",
          "Good Bronze systems add `_source_file` and `_ingestion_ts`/`_ingested_at`. When someone asks *\"where did this bad record come from?\"*, you answer with a query, not a guess. That's operational observability.")
trap("pitfall", "_metadata isn't in SELECT *",
     "The `_metadata` column is hidden: `select(\"*\")` or `SELECT *` won't return it, so audit columns silently go missing.",
     "Select `_metadata` (or `_metadata.file_path`) explicitly and alias it, e.g. `_source_file`.")
C.ask("Ask yourself when a Silver row looks wrong", [
    "Which Bronze row produced it (same business key, same batch)?",
    "What is that Bronze row's `_source_file`?",
    "When was it ingested (`_ingested_at`) — before or after the incident?",
    "Is the original file still in the landing zone, and unchanged?"])

C.mcq("Which expression gives the full path of the file a row came from?",
      ["`_metadata.file_path`", "`_source_file()`", "`spark.read.path`", "`current_file()`"], 0,
      "`_metadata` is the hidden file-metadata column; `file_path` is its full-path field. You then usually alias it to `_source_file`. The other options don't exist.",
      tags=("syntax",), diff=1, quick=True)
C.tf("`df.select(\"*\")` on a file-based DataFrame automatically includes the `_metadata` column.", False,
     "`_metadata` is hidden by design so it doesn't pollute schemas; you must select it (or its fields) explicitly.",
     tags=("pitfall",), diff=1, quick=True)
C.write("Add two audit columns to `df` (read from files): `_source_file` from the file path metadata, and `_ingested_at` = current timestamp. Use `F` = `pyspark.sql.functions`.",
        'bronze_df = df.select(\n    "*",\n    F.col("_metadata.file_path").alias("_source_file"),\n    F.current_timestamp().alias("_ingested_at"),\n)',
        ["_metadata.file_path", 'alias("_source_file")', "current_timestamp()", 'alias("_ingested_at")'],
        "File path + ingestion time are the minimum audit pair. With them, a Silver incident can be traced to a concrete file and moment instead of guessed.",
        lang="python", tags=("syntax",), diff=2, quick=True)
C.order("A finance analyst finds a wrong amount in Silver. Order the trace.",
        ["Identify the Silver row and its business key", "Find the matching Bronze row(s)",
         "Read the Bronze row's `_source_file` and `_ingested_at`", "Open the original file in the landing zone",
         "Decide: source error or transformation error"],
        "Walk backwards one layer at a time. Without `_source_file` the chain breaks at step 3 and you're left grepping thousands of files.",
        tags=("debug",), diff=2)
C.free("Why are `_source_file` and `_ingested_at` worth adding to every Bronze table? Answer as you would to a teammate who says 'they waste space'.",
       "They are cheap audit evidence. When a Silver or Gold value is wrong, they let me trace the row back to the exact file and load time, prove whether the source sent bad data or our transformation broke it, find all rows from a bad delivery to quarantine or reprocess, and detect duplicate loads (same file twice). A few bytes per row buy fast incident resolution.",
       ["Trace Silver → Bronze → original file", "Distinguish source error vs transformation error",
        "Find/reprocess all rows of one bad file", "Detect duplicate or late loads", "Cheap compared to debugging time"],
       "Observability is a design decision made at ingestion time; you can't add the file path later once the files are gone.",
       tags=("interview",), diff=2)
C.cloze("Complete the SQL that keeps the source file path.",
        "SELECT *, [[_metadata]].[[file_path]] AS _source_file\nFROM read_files('/Volumes/ecommerce/raw/orders/', format => 'json');",
        "`_metadata.file_path` works in SQL file reads too (read_files, COPY INTO's SELECT). Alias it so the column has a stable Bronze name.",
        bank=["input", "path", "_file"], as_code=True, tags=("syntax",), diff=1)
