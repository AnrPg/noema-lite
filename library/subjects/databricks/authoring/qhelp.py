"""Tiny DSL helpers to build chapter JSON for the Databricks Quest app."""
import json, textwrap


def _d(s):
    return textwrap.dedent(s).strip("\n")


def P(t): return {"t": "p", "text": t}
def L(*items, ordered=False): return {"t": "list", "items": list(items), "ordered": ordered}


def C(code, lang="sql", caption=None):
    b = {"t": "code", "lang": lang, "code": _d(code)}
    if caption: b["caption"] = caption
    return b


def D(text, caption=None):
    b = {"t": "diagram", "text": _d(text)}
    if caption: b["caption"] = caption
    return b


def T(head, rows, caption=None):
    b = {"t": "table", "head": head, "rows": rows}
    if caption: b["caption"] = caption
    return b


def CO(kind, title, text): return {"t": "callout", "kind": kind, "title": title, "text": text}
def CMP(*items): return {"t": "compare", "items": [{"title": a, "points": b} for a, b in items]}


def F(*items, caption=None):
    b = {"t": "flow", "items": list(items)}
    if caption: b["caption"] = caption
    return b


def R(label, text): return {"t": "reveal", "label": label, "text": text}
def ASK(title, *qs): return {"t": "ask", "title": title, "questions": list(qs)}
def TERMS(*pairs): return {"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]}


class Chapter:
    def __init__(self, cid):
        self.cid = cid
        self.ex = []
        self.sections = []
        self.debug = []
        self.flash = []
        self.pitfalls = []

    def s(self, n): return f"{self.cid}-s{n:02d}"

    def section(self, n, title, hook, blocks):
        self.sections.append({"id": self.s(n), "title": title, "hook": hook, "blocks": blocks})

    def add(self, type, sec, diff, tags, q, explain, quick=False, code=None, **kw):
        e = {"type": type, "section": self.s(sec), "difficulty": diff, "tags": tags,
             "quick": quick, "q": q}
        if code: e["code"] = _d(code)
        for k, v in kw.items():
            if k in ("solution", "fix") and isinstance(v, str): v = _d(v)
            e[k] = v
        e["explain"] = explain
        self.ex.append(e)

    def mcq(self, sec, diff, tags, q, options, answer, explain, why=None, quick=False, code=None):
        kw = {"options": options, "answer": answer}
        if isinstance(answer, list): kw["multi"] = True
        if why: kw["why"] = why
        self.add("mcq", sec, diff, tags, q, explain, quick, code, **kw)

    def tf(self, sec, diff, tags, q, answer, explain, quick=False, code=None):
        self.add("tf", sec, diff, tags, q, explain, quick, code, answer=answer)

    def odd(self, sec, diff, tags, q, options, answer, explain, quick=False):
        self.add("odd", sec, diff, tags, q, explain, quick, options=options, answer=answer)

    def order(self, sec, diff, tags, q, items, explain, quick=False):
        self.add("order", sec, diff, tags, q, explain, quick, items=items)

    def match(self, sec, diff, tags, q, pairs, explain, quick=False):
        self.add("match", sec, diff, tags, q, explain, quick, pairs=[list(p) for p in pairs])

    def bucket(self, sec, diff, tags, q, buckets, items, explain, quick=False):
        self.add("bucket", sec, diff, tags, q, explain, quick, buckets=buckets,
                 items=[{"text": t, "bucket": b} for t, b in items])

    def cloze(self, sec, diff, tags, q, text, explain, bank=None, asCode=False, quick=False):
        kw = {"text": _d(text) if asCode else text}
        if bank: kw["bank"] = bank
        if asCode: kw["asCode"] = True
        self.add("cloze", sec, diff, tags, q, explain, quick, **kw)

    def spotbug(self, sec, diff, tags, q, lines, bugs, fix, explain, quick=False):
        self.add("spotbug", sec, diff, tags, q, explain, quick, lines=lines, bugs=bugs, fix=fix)

    def calc(self, sec, diff, tags, q, answer, explain, unit="", tolerance=0, quick=False, code=None):
        self.add("calc", sec, diff, tags, q, explain, quick, code, answer=answer, tolerance=tolerance, unit=unit)

    def scenario(self, sec, diff, tags, q, steps, explain):
        st = []
        for s in steps:
            prompt, opts = s[0], s[1]
            d = {"prompt": prompt, "options": [{"text": t, "ok": ok, "fb": fb} for t, ok, fb in opts]}
            if len(s) > 2 and s[2]: d["code"] = _d(s[2])
            st.append(d)
        self.add("scenario", sec, diff, tags, q, explain, False, steps=st)

    def free(self, sec, diff, tags, q, model, rubric, explain, quick=False):
        self.add("free", sec, diff, tags, q, explain, quick, model=model, rubric=rubric)

    def write(self, sec, diff, tags, q, solution, keywords, explain, lang="sql", quick=False, code=None):
        self.add("write", sec, diff, tags, q, explain, quick, code, solution=solution, keywords=keywords, lang=lang)

    def playbook(self, n, title, sec, symptom, ask, steps, causes, fix, mnemonic=None):
        d = {"id": f"{self.cid}-d{n:02d}", "title": title, "section": self.s(sec), "symptom": symptom,
             "askYourself": ask,
             "steps": [dict(do=a, why=b, **({"code": _d(c)} if c else {})) for a, b, c in steps],
             "rootCauses": causes, "fix": fix}
        if mnemonic: d["mnemonic"] = mnemonic
        self.debug.append(d)

    def card(self, sec, q, a): self.flash.append({"q": q, "a": a, "section": self.s(sec)})
    def pit(self, title, text, fix): self.pitfalls.append({"title": title, "text": text, "fix": fix})

    def dump(self, path, **meta):
        exs = []
        for i, e in enumerate(self.ex, 1):
            e2 = {"id": f"{self.cid}-e{i:03d}"}
            e2.update(e)
            exs.append(e2)
        ch = dict(id=self.cid, **meta, sections=self.sections, debug=self.debug,
                  pitfalls=self.pitfalls, flashcards=self.flash, exercises=exs)
        json.dump(ch, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return ch
