# -*- coding: utf-8 -*-
"""Build ch13.json (Structured Streaming). Run: python3 build_ch13.py"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from chlib import Chapter
import ch13_sec1, ch13_sec2, ch13_ex1, ch13_ex2, ch13_meta

ch = Chapter("ch13", 13,
    title="Structured Streaming",
    subtitle="Micro-batches, triggers, state, event time, watermarks, output modes, checkpoints, exactly-once and production debugging",
    emoji="🌊",
    sourcePages="510–569",
    mantra="A stream is a table that never stops growing: the checkpoint remembers how far you got, state remembers what you need, and the watermark decides when you may forget.",
    objectives=[
        "You can explain Structured Streaming from first principles: unbounded table, lazy readStream, micro-batches as Spark jobs, source → transformation → sink.",
        "You can choose and write the right trigger (default, processingTime, availableNow, once, real-time) — including the serverless rules.",
        "You can tell stateless from stateful operators and predict state growth.",
        "You can reason in event time: assign events to windows, compute watermarks and decide whether a late event is accepted.",
        "You can pick append / update / complete per query and sink, and implement update-like results with foreachBatch + MERGE.",
        "You can explain what a checkpoint stores, when it is incompatible, and exactly what exactly-once does and does not guarantee.",
        "You can write stream-static and stream-stream joins with watermarks and explain the min watermark policy.",
        "You can debug slow, stalled, lossy, duplicating and state-heavy streams with ordered playbooks."])
for m in (ch13_sec1, ch13_sec2):
    m.build(ch)
ch13_ex1.build(ch)
ch13_ex2.build(ch)
ch13_meta.build(ch)
# order exercises by section (stable) and renumber
order = {s["id"]: i for i, s in enumerate(ch.d["sections"])}
ex = sorted(ch.d["exercises"], key=lambda e: order[e["section"]])
for i, e in enumerate(ex, 1):
    e["id"] = f"ch13-e{i:03d}"
ch.d["exercises"] = ex
ch.save(os.path.join(HERE, "ch13.json"))
