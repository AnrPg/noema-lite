# -*- coding: utf-8 -*-
"""Generate ch13.coverage.md: every source heading / test question -> section + exercise ids (keyword-matched)."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ch = json.load(open(os.path.join(HERE, "ch13.json"), encoding="utf-8"))
EX = ch["exercises"]


def find(sec, *kws):
    ids = []
    for e in EX:
        if sec and e["section"] != f"ch13-s{sec:02d}":
            continue
        blob = json.dumps(e, ensure_ascii=False).lower()
        if all(k.lower() in blob for k in kws):
            ids.append(e["id"])
    return ids


# (source item, orig page, section number, keywords to locate exercises)
ITEMS = [
    ("Intro: Phase 5 mental model (source→readStream→plan→trigger→micro-batch→operators→writeStream→sink + checkpoint)", "510–511", 1, ["mental model"]),
    ("1. Batch vs streaming from first principles (bounded/unbounded)", "511–512", 1, ["bound"]),
    ("2. First streaming DataFrame; read vs readStream", "512", 2, ["readStream"]),
    ("3. readStream doesn't start execution (lazy); writeStream starts", "513", 2, ["start"]),
    ("4. What is a micro-batch", "513–514", 3, ["micro-batch"]),
    ("5. 5-second micro-batches (processingTime)", "514–515", 3, ["processingTime"]),
    ("6. Batch longer than trigger interval → backlog", "515–516", 3, ["12"]),
    ("7. Trigger types (default, processingTime, availableNow, real-time; Once deprecated; serverless)", "516", 4, ["trigger"]),
    ("8. AvailableNow", "516–517", 4, ["availableNow"]),
    ("9. Why use the streaming engine for scheduled batch", "517", 4, ["checkpoint"]),
    ("10. Stateless streaming", "517–518", 5, ["stateless"]),
    ("11. Stateful streaming (aggregations, distinct, dropDuplicates, joins)", "518–519", 5, ["stateful"]),
    ("12. What state really is", "519", 5, ["state"]),
    ("13. Why state can become huge (1M keys/day)", "519–520", 5, ["30"]),
    ("14. Processing time vs event time", "520", 6, ["event time"]),
    ("15. Why they differ (offline, network, Kafka backlog, outage, retry, batch upload, clock skew)", "520–521", 6, ["clock skew"]),
    ("16. Event-time windows (F.window)", "521–522", 6, ["window"]),
    ("17. Late-data problem (wait forever vs close immediately)", "522–523", 6, ["forever"]),
    ("18. Watermark (withWatermark)", "523", 7, ["watermark"]),
    ("19. Watermark ≠ wall-clock timer (max event time − delay)", "523–524", 7, ["11:50"]),
    ("20. Why not 'exactly 10 minutes' (at least delay behind)", "524", 7, ["timer"]),
    ("21. Stateful aggregation with watermark", "524–525", 7, ["15 minutes"]),
    ("22. Short vs long watermark", "525–526", 7, ["long"]),
    ("23. Watermark is not a data retention policy", "526", 7, ["delete"]),
    ("24. Output modes overview", "526", 8, ["append"]),
    ("25. Append mode (emit once final)", "526–527", 8, ["final"]),
    ("26. Update mode + Delta sink has no update mode", "527–528", 8, ["update"]),
    ("27. Complete mode (state not evicted)", "528", 8, ["complete"]),
    ("28. Stateless streams and output modes", "528", 8, ["stateless"]),
    ("29. Checkpoint deeper (offsets, commits, state, metadata)", "529", 9, ["commits"]),
    ("30. Offset (Kafka partition offsets)", "529", 9, ["offsets"]),
    ("31. Commit log", "530", 9, ["commit"]),
    ("32. State in checkpoint", "530", 9, ["state"]),
    ("33. State store (distributed; RocksDB + changelog)", "530–531", 5, ["RocksDB"]),
    ("34. Why stateful queries are harder to change", "531", 9, ["groupBy"]),
    ("35. Deleting checkpoint", "531–532", 9, ["delet"]),
    ("36. Exactly-once (offsets + commits + Delta log)", "532", 10, ["Delta"]),
    ("37. Failure scenario (batch 20, committed? retry?)", "532–533", 10, ["batch 20"]),
    ("38. Exactly-once stops at boundaries (emails)", "533", 10, ["email"]),
    ("39. Exactly-once ≠ no duplicate source events", "533–534", 10, ["duplicate"]),
    ("40. Streaming deduplication (dropDuplicates + watermark) [+ dropDuplicatesWithinWatermark note]", "534–535", 10, ["dropDuplicates"]),
    ("41. Stream-static join", "535", 11, ["static"]),
    ("42. Static side semantics caveat", "535–536", 11, ["recompute"]),
    ("43. Stream-stream join (state for waiting)", "536", 11, ["wait"]),
    ("44. Stream-stream join with watermarks; outer joins need watermark", "536–537", 11, ["withWatermark"]),
    ("45. Multiple watermarks (min default, max with care)", "537", 11, ["min"]),
    ("46. Why min makes sense", "537–538", 11, ["slowest"]),
    ("47. Source → transformation → sink", "538–539", 2, ["ecommerce.silver.events"]),
    ("48. Delta as streaming source", "539", 12, ["Delta"]),
    ("49. Delta source caveat (UPDATE/DELETE/MERGE → CDF) [+ skipChangeCommits note]", "539", 12, ["Change"]),
    ("50. Source retention caveat", "539–540", 12, ["retention"]),
    ("51. Don't fix missing files with ignoreMissingFiles", "540", 12, ["ignoreMissingFiles"]),
    ("52. foreachBatch", "540–541", 13, ["foreachBatch"]),
    ("53. Streaming MERGE pattern", "541", 13, ["merge"]),
    ("54. foreachBatch must be idempotent", "541–542", 13, ["idempot"]),
    ("55. batch_id can help (not universal)", "542", 13, ["batch_id"]),
    ("56. Real-time mode", "542", 4, ["real-time"]),
    ("57. Latency vs throughput", "543–544", 14, ["latency"]),
    ("58. Small files in streaming", "544", 14, ["small"]),
    ("59. Backpressure / backlog (50 vs 20 MB/s)", "544–545", 14, ["MB"]),
    ("60. Monitoring (status, lastProgress, Spark UI, StreamingQueryListener)", "545", 15, ["lastProgress"]),
    ("61. Input rate vs processing rate", "545–546", 15, ["processedRowsPerSecond"]),
    ("62. State growth debugging", "546–547", 15, ["state"]),
    ("63. Watermark debugging (questions)", "547", 7, ["max"]),
    ("64. 'Late' is relative to query progress", "547–548", 7, ["relative"]),
    ("65. Production example — event analytics (code)", "548–549", 8, ["event_counts"]),
    ("66. What happens here (window lifecycle)", "549–550", 8, ["lifecycle"]),
    ("67. Why append output can look delayed", "550", 8, ["delayed"]),
    ("68. Update-like result to Delta (foreachBatch + MERGE merge_counts)", "550–551", 13, ["merge_counts"]),
    ("69. Streaming source and retention (Friday example)", "551", 12, ["7"]),
    ("70. Checkpoint and code deployment (safe vs dangerous changes)", "551–552", 9, ["checkpoint"]),
    ("71. Stateful restart from new checkpoint (backfill)", "552", 9, ["backfill"]),
    ("72. Micro-batch + Spark performance", "552–553", 3, ["shuffle"]),
    ("73. Example skew in stream (99 × 2 s, 1 × 30 s)", "553", 14, ["30"]),
    ("74. Stateful streaming + skew ('anonymous' 70%)", "553–554", 14, ["anonymous"]),
    ("75. State-store best practice (RocksDB + changelog checkpointing)", "554", 5, ["RocksDB"]),
    ("76. Serverless streaming nuance (AvailableNow ✓, Once ✓ deprecated, ProcessingTime ✗, RealTime ✗; Lakeflow continuous)", "554–555", 4, ["serverless"]),
    ("77. Lab 1 — rate source", "555", 16, ["rate"]),
    ("78. Lab 2 — stateless", "555–556", 16, ["Lab 2"]),
    ("79. Lab 3 — stateful aggregate", "556", 16, ["Lab 3"]),
    ("80. Lab 4 — event-time windows", "556–557", 16, ["window"]),
    ("81. Lab 5 — AvailableNow on Delta", "557", 16, ["Lab 5"]),
    ("82. Lab 6 — intentional checkpoint reset", "557–558", 16, ["Lab 6"]),
    ("83. Lab 7 — late data (5 vs 30 min watermark)", "558", 7, ["Lab 7"]),
    ("84. Lab 8 — foreachBatch inspect_batch", "558–559", 16, ["Lab 8"]),
    ("85. Production debugging tree", "559", 15, ["tree"]),
    ("86. Debugging: stream stopped making progress", "559–560", 15, ["progress"]),
    ("87. Debugging: increasing batch durations", "560", 15, ["stable"]),
    ("88. Debugging: missing late records", "560–561", 15, ["late"]),
    ("89. Debugging: duplicates after failure", "561", 15, ["duplicate"]),
    ("90. Debugging: state store huge", "561", 15, ["state store huge"]),
    ("91. Best-practice mental model (source…retention)", "561–562", 16, ["RETENTION"]),
    ("92. Trap: read vs readStream", "562", 2, ["spark.read"]),
    ("93. Trap: processing time vs event time", "562", 6, ["Processing time"]),
    ("94. Trap: watermark purpose", "562–563", 7, ["retention"]),
    ("95. Trap: checkpoint stores offsets/commits/state", "563", 9, ["timestamp"]),
    ("96. Trap: AvailableNow ≠ run forever", "563", 4, ["stop"]),
    ("97. Trap: serverless trigger", "563–564", 4, ["serverless"]),
    ("98. Trap: output mode / Delta sink no update", "564", 8, ["Delta"]),
    ("99. Trap: watermarks and outer joins", "564", 11, ["outer"]),
    ("Phase 5 mini-project (bronze → silver → gold, watermark + window, test plan)", "566–569", 16, ["mini-project"]),
]
QS = [(1, 1, "Q1"), (2, 3, "Q2"), (3, 2, "Q3"), (4, 4, "Q4"), (5, 4, "Q5"), (6, 5, "Q6"), (7, 5, "Q7"), (8, 5, "Q8"), (9, 6, "Q9"),
      (10, 6, "Q10"), (11, 6, "Q11"), (12, 7, "Q12"), (13, 7, "Q13"), (14, 7, "Q14"), (15, 7, "Q15"), (16, 9, "Q16"), (17, 9, "Q17"),
      (18, 10, "Q18"), (19, 10, "Q19"), (20, 13, "Q20"), (21, 13, "Q21"), (22, 8, "Q22"), (23, 8, "Q23"), (24, 8, "Q24"), (25, 8, "Q25"),
      (26, 11, "Q26"), (27, 11, "Q27"), (28, 12, "Q28"), (29, 12, "Q29"), (30, 14, "Q30"), (31, 14, "Q31"), (32, 15, "Q32"),
      (33, 14, "Q33"), (34, 5, "Q34"), (35, 16, "Q35")]

lines = ["# ch13 coverage — Structured Streaming (PDF #2 pp.108–167 = orig 510–569)", "",
         "Generated by `build_ch13_coverage.py` from ch13.json. Exercise ids are keyword matches inside the section (first 6 shown).", "",
         "## Numbered headings", "", "| Source item | Orig pp. | Section | Exercises |", "|---|---|---|---|"]
missing = []
for item, pp, sec, kws in ITEMS:
    ids = find(sec, *kws)
    if not ids:
        missing.append(item)
    lines.append(f"| {item} | {pp} | ch13-s{sec:02d} | {', '.join(ids[:6]) or '(theory blocks only)'} |")
lines += ["", "## Big Phase 5 test (Q1–Q35) — every question is an exercise", "", "| Question | Section | Exercise |", "|---|---|---|"]
for n, sec, tag in QS:
    ids = [e["id"] for e in EX if re.search(rf"\b{tag}\b", e["q"]) and e["section"] == f"ch13-s{sec:02d}"]
    if not ids:
        ids = [e["id"] for e in EX if re.search(rf"\b{tag}\b", json.dumps(e, ensure_ascii=False))]
    if not ids:
        missing.append(tag)
    lines.append(f"| {tag} | ch13-s{sec:02d} | {', '.join(ids)} |")
lines += ["", "## Debugging cases → playbooks", "", "| Case | Playbook | Section ask block | Scenario / order exercises |", "|---|---|---|---|"]
for d in ch["debug"]:
    sec = d["section"]
    sc = [e["id"] for e in EX if e["section"] == sec and e["type"] in ("scenario", "order") and "debug" in e["tags"]]
    lines.append(f"| {d['title']} | {d['id']} | {sec} | {', '.join(sc[:5])} |")
lines += ["", "## Additions beyond the source (accuracy/completeness, flagged in text)", "",
          "- Sliding vs tumbling windows (`F.window(col, dur, slide)`) — ch13-s06.",
          "- `dropDuplicatesWithinWatermark` — ch13-s10.",
          "- `skipChangeCommits` / `readChangeFeed` options and the default fail-on-change behaviour of a Delta source — ch13-s12.",
          "- `txnAppId`/`txnVersion` idempotent Delta writes in foreachBatch — ch13-s13.",
          "- `spark.sql.streaming.multipleWatermarkPolicy` config name; RocksDB config keys; retention TBLPROPERTIES — s11, s05, s12.",
          "- Serverless note for the mini-project's Gold query (default trigger unsupported on serverless) — ch13-s16.",
          "- Lab 7 correction: as written the 10:03 event is not late in event-time terms; how to make the lab show the difference — ch13-s07/s16.",
          "", "## Patch file `patches/ch13_links.json`", "",
          "Level-up callouts + one exercise each: ch02-s03 (e901), ch02-s04 (e902), ch02-s05 (e903), ch02-s06 (e904), ch03-s11 (e901), ch03-s12 (e902), ch04-s09 (e901), ch05-s07 (e901 + pitfall), ch05-s09 (e902), ch06-s10 (e901), ch09-s14 (e901), ch10-s09 (e901, e902 + nuance warn), ch10-s10 (e903).",
          "", "## Self-audit", "", ("All items mapped to at least one exercise." if not missing else "Theory-only items (covered by blocks): " + "; ".join(missing))]
open(os.path.join(HERE, "ch13.coverage.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("missing:", missing)
