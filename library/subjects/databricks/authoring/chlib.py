"""Tiny helper library for building chapter JSON files."""
import json


class Chapter:
    def __init__(self, cid, num, **meta):
        self.cid = cid
        self.d = {"id": cid, "num": num, **meta, "sections": [], "debug": [],
                  "pitfalls": [], "flashcards": [], "exercises": []}
        self.n = 0
        self.cur = None

    # ---------- sections & blocks ----------
    def sec(self, idx, title, hook):
        sid = f"{self.cid}-s{idx:02d}"
        self.d["sections"].append({"id": sid, "title": title, "hook": hook, "blocks": []})
        self.cur = sid
        return sid

    def _b(self, b):
        self.d["sections"][-1]["blocks"].append(b)

    def p(self, text): self._b({"t": "p", "text": text})
    def ul(self, items): self._b({"t": "list", "items": items, "ordered": False})
    def ol(self, items): self._b({"t": "list", "items": items, "ordered": True})

    def code(self, lang, code, caption=None):
        b = {"t": "code", "lang": lang, "code": code}
        if caption: b["caption"] = caption
        self._b(b)

    def diagram(self, text, caption=None):
        b = {"t": "diagram", "text": text.strip("\n")}
        if caption: b["caption"] = caption
        self._b(b)

    def table(self, head, rows, caption=None):
        b = {"t": "table", "head": head, "rows": rows}
        if caption: b["caption"] = caption
        self._b(b)

    def callout(self, kind, title, text):
        self._b({"t": "callout", "kind": kind, "title": title, "text": text})

    def compare(self, *items):
        self._b({"t": "compare", "items": [{"title": t, "points": p} for t, p in items]})

    def flow(self, items, caption=None):
        b = {"t": "flow", "items": items}
        if caption: b["caption"] = caption
        self._b(b)

    def reveal(self, label, text): self._b({"t": "reveal", "label": label, "text": text})
    def ask(self, title, qs): self._b({"t": "ask", "title": title, "questions": qs})
    def terms(self, pairs): self._b({"t": "terms", "items": [{"term": a, "def": b} for a, b in pairs]})

    # ---------- exercises ----------
    def _e(self, typ, q, explain, tags, diff, quick, extra, code=None, section=None):
        self.n += 1
        e = {"id": f"{self.cid}-e{self.n:03d}", "type": typ, "section": section or self.cur,
             "difficulty": diff, "tags": tags, "quick": quick, "q": q}
        if code: e["code"] = code
        e.update(extra)
        if explain is not None: e["explain"] = explain
        self.d["exercises"].append(e)
        return e["id"]

    def mcq(self, q, options, answer, explain, tags=("concept",), diff=1, quick=False, why=None, code=None):
        ex = {"options": options, "answer": answer}
        if isinstance(answer, list): ex["multi"] = True
        if why: ex["why"] = why
        return self._e("mcq", q, explain, list(tags), diff, quick, ex, code)

    def tf(self, q, answer, explain, tags=("concept",), diff=1, quick=False, code=None):
        return self._e("tf", q, explain, list(tags), diff, quick, {"answer": answer}, code)

    def odd(self, q, options, answer, explain, tags=("concept",), diff=1, quick=False):
        return self._e("odd", q, explain, list(tags), diff, quick, {"options": options, "answer": answer})

    def order(self, q, items, explain, tags=("concept",), diff=2, quick=False):
        return self._e("order", q, explain, list(tags), diff, quick, {"items": items})

    def match(self, q, pairs, explain, tags=("concept",), diff=1, quick=False):
        return self._e("match", q, explain, list(tags), diff, quick, {"pairs": [list(x) for x in pairs]})

    def bucket(self, q, buckets, items, explain, tags=("concept",), diff=2, quick=False):
        return self._e("bucket", q, explain, list(tags), diff, quick,
                       {"buckets": buckets, "items": [{"text": t, "bucket": b} for t, b in items]})

    def cloze(self, q, text, explain, bank=None, as_code=False, tags=("concept",), diff=1, quick=False):
        ex = {"text": text}
        if bank: ex["bank"] = bank
        if as_code: ex["asCode"] = True
        return self._e("cloze", q, explain, list(tags), diff, quick, ex)

    def spotbug(self, q, lines, bugs, fix, explain, tags=("debug",), diff=2, quick=False):
        return self._e("spotbug", q, explain, list(tags), diff, quick, {"lines": lines, "bugs": bugs, "fix": fix})

    def calc(self, q, answer, explain, unit="", tolerance=0, tags=("calc",), diff=2, quick=False, code=None):
        return self._e("calc", q, explain, list(tags), diff, quick,
                       {"answer": answer, "tolerance": tolerance, "unit": unit}, code)

    def scenario(self, q, steps, explain=None, tags=("debug",), diff=2, quick=False):
        st = []
        for s in steps:
            prompt, opts = s[0], s[1]
            x = {"prompt": prompt, "options": [{"text": t, "ok": ok, "fb": fb} for t, ok, fb in opts]}
            if len(s) > 2 and s[2]: x["code"] = s[2]
            st.append(x)
        return self._e("scenario", q, explain, list(tags), diff, quick, {"steps": st})

    def free(self, q, model, rubric, explain, tags=("interview",), diff=2, quick=False):
        return self._e("free", q, explain, list(tags), diff, quick, {"model": model, "rubric": rubric})

    def write(self, q, solution, keywords, explain, lang="sql", tags=("syntax",), diff=2, quick=False):
        return self._e("write", q, explain, list(tags), diff, quick,
                       {"solution": solution, "keywords": keywords, "lang": lang})

    # ---------- other ----------
    def playbook(self, idx, title, section, symptom, ask, steps, causes, fix, mnemonic=None):
        d = {"id": f"{self.cid}-d{idx:02d}", "title": title, "section": section, "symptom": symptom,
             "askYourself": ask, "steps": [dict(zip(("do", "why", "code"), s)) for s in steps],
             "rootCauses": causes, "fix": fix}
        for s in d["steps"]:
            if s.get("code") is None: s.pop("code", None)
        if mnemonic: d["mnemonic"] = mnemonic
        self.d["debug"].append(d)

    def pitfall(self, title, text, fix): self.d["pitfalls"].append({"title": title, "text": text, "fix": fix})

    def card(self, q, a, section): self.d["flashcards"].append({"q": q, "a": a, "section": section})

    def save(self, path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.d, f, ensure_ascii=False, indent=1)
        print("wrote", path, len(self.d["exercises"]), "exercises")
