"""Shared helpers for building ch07/ch08 JSON (blocks, exercises, coverage)."""
import json


def P(t): return {"t": "p", "text": t}
def L(items, ordered=False): return {"t": "list", "items": items, "ordered": ordered}
def CODE(lang, code, caption=None):
    b = {"t": "code", "lang": lang, "code": code}
    if caption: b["caption"] = caption
    return b
def D(text, caption=None):
    b = {"t": "diagram", "text": text.strip("\n")}
    if caption: b["caption"] = caption
    return b
def T(head, rows, caption=None):
    b = {"t": "table", "head": head, "rows": rows}
    if caption: b["caption"] = caption
    return b
def C(kind, title, text): return {"t": "callout", "kind": kind, "title": title, "text": text}
def CMP(*items): return {"t": "compare", "items": [{"title": a, "points": b} for a, b in items]}
def F(items, caption=None):
    b = {"t": "flow", "items": items}
    if caption: b["caption"] = caption
    return b
def R(label, text): return {"t": "reveal", "label": label, "text": text}
def A(title, qs): return {"t": "ask", "title": title, "questions": qs}
def TM(*pairs): return {"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]}


class Builder:
    def __init__(self, cid):
        self.cid = cid
        self.ex = []
        self.cov = {}   # exercise id -> list of coverage keys

    def add(self, type_, sec, diff, tags, q, explain, quick=False, cov=(), **kw):
        eid = f"{self.cid}-e{len(self.ex)+1:03d}"
        e = {"id": eid, "type": type_, "section": f"{self.cid}-s{sec:02d}", "difficulty": diff,
             "tags": tags, "quick": quick, "q": q}
        e.update(kw)
        e["explain"] = explain
        self.ex.append(e)
        self.cov[eid] = list(cov)
        return eid

    # convenience wrappers
    def mcq(self, sec, diff, tags, q, options, answer, explain, why=None, **kw):
        if why: kw["why"] = why
        if isinstance(answer, list): kw["multi"] = True
        return self.add("mcq", sec, diff, tags, q, explain, options=options, answer=answer, **kw)
    def tf(self, sec, diff, tags, q, answer, explain, **kw):
        return self.add("tf", sec, diff, tags, q, explain, answer=answer, **kw)
    def odd(self, sec, diff, tags, q, options, answer, explain, **kw):
        return self.add("odd", sec, diff, tags, q, explain, options=options, answer=answer, **kw)
    def order(self, sec, diff, tags, q, items, explain, **kw):
        return self.add("order", sec, diff, tags, q, explain, items=items, **kw)
    def match(self, sec, diff, tags, q, pairs, explain, **kw):
        return self.add("match", sec, diff, tags, q, explain, pairs=[list(p) for p in pairs], **kw)
    def bucket(self, sec, diff, tags, q, buckets, items, explain, **kw):
        return self.add("bucket", sec, diff, tags, q, explain, buckets=buckets,
                        items=[{"text": t, "bucket": b} for t, b in items], **kw)
    def cloze(self, sec, diff, tags, q, text, explain, bank=None, asCode=False, **kw):
        if bank: kw["bank"] = bank
        if asCode: kw["asCode"] = True
        return self.add("cloze", sec, diff, tags, q, explain, text=text, **kw)
    def spotbug(self, sec, diff, tags, q, lines, bugs, fix, explain, **kw):
        return self.add("spotbug", sec, diff, tags, q, explain, lines=lines, bugs=bugs, fix=fix, **kw)
    def calc(self, sec, diff, tags, q, answer, unit, explain, tolerance=0, **kw):
        return self.add("calc", sec, diff, tags, q, explain, answer=answer, tolerance=tolerance, unit=unit, **kw)
    def scenario(self, sec, diff, tags, q, steps, explain, **kw):
        st = []
        for s in steps:
            prompt, opts = s[0], s[1]
            d = {"prompt": prompt, "options": [{"text": t, "ok": ok, "fb": fb} for t, ok, fb in opts]}
            if len(s) > 2 and s[2]: d["code"] = s[2]
            st.append(d)
        return self.add("scenario", sec, diff, tags, q, explain, steps=st, **kw)
    def free(self, sec, diff, tags, q, model, rubric, explain, **kw):
        return self.add("free", sec, diff, tags, q, explain, model=model, rubric=rubric, **kw)
    def write(self, sec, diff, tags, q, solution, keywords, lang, explain, **kw):
        return self.add("write", sec, diff, tags, q, explain, solution=solution, keywords=keywords, lang=lang, **kw)


def coverage_md(path, title, headings, b, sections, extra_sections_map):
    """headings: list of (key, label, section_num). Writes checklist; returns list of uncovered keys."""
    lines = [f"# {title} — coverage checklist", "",
             "Each source heading / concept / test question → section id and exercise ids.", ""]
    missing = []
    for key, label, sec in headings:
        exs = [eid for eid, ks in b.cov.items() if key in ks]
        mark = "x" if exs else " "
        if not exs: missing.append(key)
        lines.append(f"- [{mark}] **{key}** {label} → `{b.cid}-s{sec:02d}` · " + (", ".join(exs) if exs else "NO EXERCISE"))
    lines.append("")
    lines.append("## Debug playbooks")
    for k, v in extra_sections_map.items():
        lines.append(f"- {k}: {v}")
    open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return missing


def dump(ch, path):
    json.dump(ch, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
