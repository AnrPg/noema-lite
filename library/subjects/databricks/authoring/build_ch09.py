# -*- coding: utf-8 -*-
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ch09_sections import SECTIONS
from ch09_meta import DEBUG, PITFALLS, FLASHCARDS
import ch09_ex1, ch09_ex2
EX = ch09_ex1.EX
order = {s["id"]: i for i, s in enumerate(SECTIONS)}
EX = sorted(EX, key=lambda e: order[e["section"]])  # stable: keeps authoring order within section
for i, e in enumerate(EX, 1):
    e["id"] = f"ch09-e{i:03d}"
    if not e.get("quick"): e.pop("quick", None)
    # put id first
ex_out = [{"id": e["id"], **{k: v for k, v in e.items() if k != "id"}} for e in EX]
ch = {
 "id": "ch09", "num": 9,
 "title": "Compute Mastery: From VM to Task",
 "subtitle": "Cores, partitions, waves, memory, spill, OOM, autoscaling and the compute decisions behind them",
 "emoji": "⚙️",
 "sourcePages": "306–358",
 "mantra": "Workers × cores = slots, partitions = tasks, and no amount of hardware fixes too few partitions, skew or a collect() on the driver.",
 "objectives": [
  "You can compute executors, task slots and waves from any compute configuration (driver excluded).",
  "You can explain why partition count, not cluster size, caps a stage's parallelism — and why autoscaling can't fix one partition or skew.",
  "You can reason about scale up vs scale out, memory per core, execution vs storage memory, and spill vs failure.",
  "You can tell driver OOM from executor OOM and walk the memory-debugging chain before adding RAM.",
  "You can name the bottleneck (CPU / memory / I/O / skew) from Spark UI task metrics and pick the matching fix.",
  "You can choose serverless vs classic and Standard vs Dedicated with the selection algorithm, and explain pools, spot, termination and permissions.",
  "You can write spark.conf.get, getNumPartitions, repartition, coalesce and explain('formatted') and know their serverless caveats.",
  "You can dodge the certification traps: executors per worker, zero workers, autoscaling vs instance size, Dedicated ≠ performance, dynamic allocation."],
 "sections": SECTIONS, "debug": DEBUG, "pitfalls": PITFALLS, "flashcards": FLASHCARDS, "exercises": ex_out,
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch09.json")
json.dump(ch, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote", out, len(ex_out), "exercises")
