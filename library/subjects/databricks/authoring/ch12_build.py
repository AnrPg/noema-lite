"""Build ch12.json (Data Ingestion: Files, COPY INTO & Auto Loader) + ch12.coverage.md.
Parts: ch12_p1.py (s01-s05), ch12_p2.py (s06-s08), ch12_p3.py (s09-s12), ch12_p4.py (s13-s16 + cards).
Run: python3 ch12_build.py"""
import os, sys, json
from collections import OrderedDict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from chlib import Chapter

C = Chapter("ch12", 12,
    title="Data Ingestion: Files, COPY INTO & Auto Loader",
    subtitle="spark.read, schemas, COPY INTO, Auto Loader, checkpoints, schema evolution, rescued data — and debugging every ingestion incident",
    emoji="📥",
    sourcePages="456–510",
    mantra="Land files faithfully and exactly once: the reader needs a grammar (schema), the loader needs a memory (COPY INTO tracking or a checkpoint), and business duplicates are Silver's job.",
    objectives=[
        "You can read CSV, JSON and Parquet with spark.read, set the right parsing options and choose explicit schema (StructType or DDL) over inference for production.",
        "You can explain why re-running spark.read duplicates data and how COPY INTO's file tracking makes loads retryable and idempotent — including the 'changed file is still skipped' subtlety.",
        "You can write COPY INTO with FILEFORMAT, FORMAT_OPTIONS, COPY_OPTIONS, PATTERN, FILES, VALIDATE and a SELECT transformation, and tell the two mergeSchema options apart.",
        "You can write a production Auto Loader Bronze stream (cloudFiles, schemaLocation, checkpointLocation, toTable, availableNow) and explain schemaLocation vs checkpointLocation.",
        "You can predict Auto Loader's schema inference (strings by default, 50 GB / 1000-file sample, hints, inferColumnTypes), schema evolution modes and rescued data.",
        "You can explain why file-level exactly-once does not prevent duplicate business keys, and where dedup/MERGE belongs.",
        "You can choose between spark.read, COPY INTO and Auto Loader and answer the classic exam traps.",
        "You can debug missing rows, overwritten files, schema shifts, missing columns, duplicate IDs, malformed CSV and checkpoint incidents with an ordered checklist.",
    ])

# ---------------- coverage tracking ----------------
COV = OrderedDict()      # key -> {"sec": set(), "ex": []}
CUR = []
def S(*keys):
    """Set the source headings that the next exercises/blocks cover."""
    global CUR
    CUR = list(keys)
    for k in keys:
        COV.setdefault(k, {"sec": set(), "ex": []})["sec"].add(C.cur)

_orig_e = C._e
def _e(*a, **kw):
    eid = _orig_e(*a, **kw)
    for k in CUR:
        COV.setdefault(k, {"sec": set(), "ex": []})["ex"].append(eid)
    return eid
C._e = _e

def trap(kind, title, text, fix):
    """Pitfall/exam/warn callout + chapter pitfall entry in one go."""
    C.callout(kind, title, text)
    C.pitfall(title, text, fix)

PB = []   # (playbook id, coverage keys)
def playbook(idx, *a, **kw):
    C.playbook(idx, *a, **kw)
    PB.append((f"ch12-d{idx:02d}", list(CUR)))
    for k in CUR:
        COV.setdefault(k, {"sec": set(), "ex": []})

for part in ["ch12_p1.py", "ch12_p2.py", "ch12_p3.py", "ch12_p4.py"]:
    exec(open(os.path.join(HERE, part), encoding="utf-8").read())

C.save(os.path.join(HERE, "ch12.json"))

# ---------------- coverage.md ----------------
HEAD = json.load(open(os.path.join(HERE, "ch12_headings.json"), encoding="utf-8"))
lines = ["# ch12 coverage — Data Ingestion (PDF #2 pp. 54–108 = orig 456–510)", "",
         "Every numbered source heading (§1–§103), every Big-Test question (Q1–Q25) and the production assignment → section + exercises.",
         "Playbooks are listed with the headings they cover.", "",
         "| Source item | Section(s) | Exercises | Playbooks |", "|---|---|---|---|"]
missing = []
pbmap = {}
for pid, keys in PB:
    for k in keys: pbmap.setdefault(k, []).append(pid)
for key, label in HEAD:
    v = COV.get(key)
    secs = ", ".join(sorted(v["sec"])) if v else ""
    exs = ", ".join(v["ex"]) if v else ""
    pbs = ", ".join(pbmap.get(key, []))
    if not v or (not v["ex"] and not pbs): missing.append(key)
    lines.append(f"| {key} {label} | {secs or '—'} | {exs or '—'} | {pbs or '—'} |")
extra = [k for k in COV if k not in dict(HEAD)]
lines += ["", "## Added for clarity (not in source, short accurate definitions)",
          "- CSV `mode` (PERMISSIVE / DROPMALFORMED / FAILFAST) and `columnNameOfCorruptRecord` → ch12-s02 (needed to debug malformed CSV, §82).",
          "- `_metadata` hidden column fields (`file_path`, `file_name`, `file_size`, `file_modification_time`) → ch12-s05 (concrete syntax for §18/§83).",
          "- `COPY_OPTIONS ('force' = 'true')` → ch12-s06 (the escape hatch for §23/§77).",
          "- PATTERN is a **glob**, not a regex (source example `'orders_.*[.]csv'` corrected to `'orders_*.csv'`) → ch12-s07.",
          "- FILES and PATTERN are mutually exclusive; `VALIDATE n ROWS` variant → ch12-s07.",
          "- `cloudFiles.schemaEvolutionMode` values (addNewColumns / rescue / failOnNewColumns / none) → ch12-s12 (makes §53–§54 'depending on configured mode' concrete).",
          "- `rescuedDataColumn` option for explicit schemas, `cloudFiles.includeExistingFiles` for checkpoint recovery, `cloudFiles.useNotifications` → ch12-s12/s10/s11.",
          "- `.trigger(availableNow=True)` syntax → ch12-s14.", "",
          "## Audit", f"- Exercises: {len(C.d['exercises'])}, playbooks: {len(C.d['debug'])}, flashcards: {len(C.d['flashcards'])}, pitfalls: {len(C.d['pitfalls'])}",
          f"- Items without exercise or playbook: {', '.join(missing) if missing else 'none'}",
          f"- Coverage keys used but not in heading list: {', '.join(extra) if extra else 'none'}"]
open(os.path.join(HERE, "ch12.coverage.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("coverage missing:", missing, "| extra keys:", extra)
