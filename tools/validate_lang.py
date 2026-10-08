#!/usr/bin/env python3
"""Validate a language course (docs/LANGUAGES.md §4 and §11). No network, no dependencies.

  python3 tools/validate_lang.py <course-dir> [--lang de] [--strict] [--json] [--batch fd.00,fd.01]

Without --strict a course may be unfinished: a node without its lexicon file in a language is “not prepared yet”
and a frame without a sentence is reported as a warning. --strict (the tests, a finished course) makes both errors.
--lang checks one language only (the language-neutral core is always checked).
--batch: while a content batch is written, only the listed nodes must have a word (or an absent entry) for every concept.

Exit 0 when valid, 1 with the list of problems otherwise. Every check here has a negative test in tests/lang_validate.py.
"""
import json, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from langlib import (nfc, canon, cell_errors, cell_parts, UD_POS, strip_marks, has_marks, letters, is_han,
                     pinyin_split, pinyin_syllable_errors, join_tokens, cap_first)

GENERATORS = {  # exercise types a function may ask for (docs/LANGUAGES.md §6)
    'quiz', 'sentence_meaning',
    'glyph_form', 'transliterate', 'vowelize', 'tone_mark', 'char_compose', 'trace', 'spell',
    'learn_batch', 'recognize', 'picture_name', 'exhaustive_recall', 'field_map', 'gender_article', 'principal_parts', 'measure_word',
    'root_family', 'compound_split', 'sense_split', 'collocation', 'confusables', 'intensity_scale',
    'paradigm', 'inflect', 'analyze', 'morph_build', 'root_pattern', 'agree',
    'build_sentence', 'word_order', 'transform', 'contrast', 'parse', 'gloss', 'proofread', 'combine',
    'translate', 'rewrite', 'expand', 'guided_compose', 'graded_reader', 'number_words', 'clock', 'date', 'register', 'dialogue_turn',
    'parallel_translate', 'parallel_align', 'which_language', 'cognate_bridge', 'compare_rule',
    'register_pick', 'nuance_pick', 'connotation', 'idiom_meaning', 'example_cloze', 'sense_pick', 'etymology_link'}
STATUS = {'realized', 'periphrastic', 'absent'}
TYPOLOGIES = {'isolating', 'agglutinating', 'fusional', 'polysynthetic'}   # D10: one path of foundation lessons per type
NODE_KINDS = {'core', 'field', 'lesson'}


def lesson_functions(n, L, typ):
    """The grammar a lesson teaches in language L: its list, or "*" + the type's + the language's (§4.4.1)."""
    f = n.get('functions') or []
    if isinstance(f, list): return list(f)
    out = []
    for k in ('*', typ, L):
        for x in f.get(k) or []:
            if x not in out: out.append(x)
    return out


def topo_order(nodes):
    """Node ids, prerequisites first (stable by file order) — the order of teaching."""
    out, seen = [], set()
    def visit(x):
        if x in seen or x not in nodes: return
        seen.add(x)
        for p in nodes[x].get('prereqs') or []: visit(p)
        out.append(x)
    for x in nodes: visit(x)
    return out


def applies(n, L, typ):
    """Does node n apply to language L (of morphological type typ)? (§4.4)"""
    return (not n.get('path') or n['path'] == typ) and (not n.get('langs') or L in n['langs'])
CONTENT_POS = {'NOUN', 'VERB', 'ADJ', 'ADV'}   # words that get a full profile (§4.6)
REGISTERS = {'neutral', 'formal', 'informal', 'colloquial', 'slang', 'vulgar', 'literary', 'poetic', 'technical', 'scientific', 'children',
             'regional', 'dialectal', 'archaic', 'obsolete', 'dated', 'euphemistic', 'humorous', 'pejorative', 'honorific', 'religious'}
WORD_STATUS = {'current', 'dated', 'archaic', 'obsolete', 'rare', 'neologism'}
CONNOTATION = {'neutral', 'positive', 'negative', 'mixed'}
PHRASE_KINDS = {'idiom', 'proverb', 'saying', 'quote', 'slang', 'colloquial', 'fixed expression'}
CEFR = {'A1', 'A2', 'B1', 'B2', 'C1', 'C2'}


def contains_word(L, lj, x, text):
    """Does the text use the word (any of its forms, its lemma, or a full spelling)? Vowel marks must match too."""
    t = nfc(text)
    cands = [x.get('lemma', '')] + list((x.get('forms') or {}).values()) + list((x.get('plene') or {}).values())
    if lj.get('capitalizeFirst'):
        t = t.casefold(); cands = [c.casefold() for c in cands]
    return any(c and nfc(c) in t for c in cands)


def check_profile(v, w, L, lj, x, required):
    pr = x.get('profile')
    content = x.get('pos') in CONTENT_POS
    if pr is None:
        if required and content: v.E(w, 'a word profile is required for content words (docs/LANGUAGES.md §4.6)')
        return
    if not isinstance(pr, dict): v.E(w, 'profile must be an object'); return
    pw = w + ' · profile'
    regs = lambda r: [r] if isinstance(r, str) else (r or [])
    def reg_ok(where, r):
        for g in regs(r):
            if g not in REGISTERS: v.E(where, f'unknown register “{g}” (one of {", ".join(sorted(REGISTERS))})')
    if pr.get('frequency') not in CEFR: v.E(pw, 'frequency must be a CEFR level (A1 … C2)')
    if pr.get('status') not in WORD_STATUS: v.E(pw, f'status must be one of {", ".join(sorted(WORD_STATUS))}')
    if pr.get('connotation') not in CONNOTATION: v.E(pw, f'connotation must be one of {", ".join(sorted(CONNOTATION))}')
    if not regs(pr.get('register')): v.E(pw, 'register is required')
    reg_ok(pw, pr.get('register'))
    need_str(v, pw, pr, 'feeling')
    if pr.get('intensity') is not None and pr.get('intensity') not in (1, 2, 3, 4, 5): v.E(pw, 'intensity must be 1–5 (or absent)')
    senses = pr.get('senses') or []
    if not senses: v.E(pw, 'at least one sense is required')
    sids = set()
    for s in senses:
        sw = f'{pw} · sense {s.get("id")}'
        if not s.get('id') or s['id'] in sids: v.E(sw, 'sense id missing or repeated')
        sids.add(s.get('id'))
        need_str(v, sw, s, 'def')
        if not regs(s.get('register')): v.E(sw, 'register is required')
        reg_ok(sw, s.get('register'))
        if s.get('concept') and s['concept'] not in (x.get('senses') or []): v.E(sw, f'concept “{s["concept"]}” is not one of the word\'s senses')
    for c in x.get('senses') or []:
        if not any(s.get('concept') == c for s in senses): v.E(pw, f'no sense explains the concept “{c}”')
    exs = pr.get('examples') or []
    per = {}
    for i, e in enumerate(exs):
        ew = f'{pw} · example {i + 1}'
        for k in ('text', 'tr', 'context'): need_str(v, ew, e, k)
        if not e.get('register'): v.E(ew, 'register is required')
        reg_ok(ew, e.get('register'))
        if e.get('sense') not in sids: v.E(ew, f'unknown sense “{e.get("sense")}”')
        per[e.get('sense')] = per.get(e.get('sense'), 0) + 1
        if e.get('text') and not contains_word(L, lj, x, e['text']): v.E(ew, f'“{e["text"]}” does not contain the word (none of its forms, with the same vowel marks)')
        if lj.get('vowelMarks') and e.get('text') and not has_marks(L, e['text']): v.E(ew, 'examples are written fully vocalized')
        if e.get('cell'):
            f = (x.get('forms') or {}).get(e['cell'])
            if not f or nfc(f) not in nfc(e.get('text', '')): v.E(ew, f'the cell {e["cell"]} form is not in the text')
    if content:
        if len(exs) < 3: v.E(pw, f'at least 3 examples are required ({len(exs)})')
        if len({e.get('context') for e in exs}) < 2: v.E(pw, 'examples must cover at least 2 different contexts')
        for s in senses:
            if s.get('concept') and per.get(s.get('id'), 0) < 2: v.E(f'{pw} · sense {s.get("id")}', 'the main sense of a concept needs at least 2 examples')
    for k in ('collocations', 'particleVerbs'):
        for i, c in enumerate(pr.get(k) or []):
            for f in ('text', 'tr'): need_str(v, f'{pw} · {k} {i + 1}', c, f)
    if content and x.get('pos') in ('NOUN', 'VERB', 'ADJ') and len(pr.get('collocations') or []) < 2: v.E(pw, 'at least 2 collocations are required')
    for i, ph in enumerate(pr.get('phrases') or []):
        phw = f'{pw} · phrase {i + 1}'
        for f in ('text', 'tr', 'meaning'): need_str(v, phw, ph, f)
        if ph.get('kind') not in PHRASE_KINDS: v.E(phw, f'kind must be one of {", ".join(sorted(PHRASE_KINDS))}')
        reg_ok(phw, ph.get('register'))
        if ph.get('kind') == 'quote':
            need_str(v, phw, ph, 'source')
            if len(ph.get('text', '')) > 160: v.E(phw, 'a quote must be short (≤ 160 characters) and from a public-domain or properly attributed source')
    if 'synonyms' not in pr: v.E(pw, 'synonyms is required (an empty list with synonymsNone when there is none)')
    syns = pr.get('synonyms') or []
    if not syns and content and not (isinstance(pr.get('synonymsNone'), str) and pr['synonymsNone'].strip()): v.E(pw, 'no synonyms: say why in synonymsNone')
    for i, sy in enumerate(syns):
        sw = f'{pw} · synonym {i + 1}'
        for f in ('word', 'nuance'): need_str(v, sw, sy, f)
        if not sy.get('register'): v.E(sw, 'register is required (synonyms are compared by register)')
        reg_ok(sw, sy.get('register'))
    ety = pr.get('etymology') or {}
    if content:
        if not (isinstance(ety, dict) and ety.get('text') and ety.get('src')): v.E(pw, 'etymology {text, src} is required')
        if not pr.get('pitfalls'): v.E(pw, 'at least one pitfall is required')
        if not pr.get('subtleties'): v.E(pw, 'at least one subtlety is required')
        if not pr.get('funFacts'): v.W(pw, 'no fun fact')

GENDERED_NOUNS = {'de', 'ar', 'he', 'fr', 'es', 'it', 'pt', 'ru', 'el', 'hi'}


class V:
    def __init__(self, root):
        self.root = root; self.errors = []; self.warns = []
    def E(self, where, msg): self.errors.append(f'{where}: {msg}')
    def W(self, where, msg): self.warns.append(f'{where}: {msg}')
    def load(self, rel, required=True):
        p = os.path.join(self.root, rel)
        if not os.path.exists(p):
            if required: self.E(rel, 'missing file')
            return None
        try:
            with open(p, encoding='utf-8') as f: raw = f.read()
        except Exception as e: self.E(rel, f'cannot read ({e})'); return None
        if raw != nfc(raw): self.E(rel, 'text is not in Unicode NFC (normalize it: the same letters typed with marks in another order would not match)')
        try: return json.loads(raw)
        except Exception as e: self.E(rel, f'not valid JSON ({e})'); return None
    def files(self, rel):
        p = os.path.join(self.root, rel)
        return sorted(f for f in os.listdir(p) if f.endswith('.json')) if os.path.isdir(p) else []


def need_str(v, where, obj, key):
    if not (isinstance(obj.get(key), str) and obj[key].strip()): v.E(where, f'“{key}” is required (text)')


def validate(root, only=None, strict=True, batch=None):
    v = V(root)
    course = v.load('course.json')
    if not course: return v
    if course.get('format') != 'noema.langcourse/v1': v.E('course.json', 'format must be "noema.langcourse/v1"')
    for k in ('id', 'title', 'explainLang'): need_str(v, 'course.json', course, k)
    langs = course.get('languages') or []
    draft = set(course.get('draft') or [])   # nodes whose words are being written: not offered to learners yet (§4.2)
    if not langs or not all(isinstance(x, str) for x in langs): v.E('course.json', '“languages” must list the language codes of the course')
    for L in (course.get('defaults', {}).get('depth') or {}):
        if L not in langs: v.E('course.json', f'depth given for “{L}”, which is not a course language')

    # ---------- fields and concepts ----------
    concepts = {}
    for fn in v.files('core/fields'):
        where = f'core/fields/{fn}'; d = v.load(where)
        if not d: continue
        need_str(v, where, d, 'field'); need_str(v, where, d, 'title')
        if not (isinstance(d.get('sources'), list) and d['sources']): v.E(where, '“sources” is required: how the list was made complete')
        subs = {s.get('id') for s in d.get('subgroups') or []}
        ranks = defaultdict(set)
        for c in d.get('concepts') or []:
            cid = c.get('id'); w = f'{where} · {cid}'
            if not cid: v.E(where, 'a concept without id'); continue
            if cid in concepts: v.E(w, 'concept id used twice')
            concepts[cid] = {**c, '_field': d.get('field')}
            need_str(v, w, c, 'gloss')
            if subs and c.get('subgroup') not in subs: v.E(w, f'unknown subgroup “{c.get("subgroup")}”')
            if c.get('tier') not in (1, 2, 3): v.E(w, 'tier must be 1, 2 or 3')
            r = c.get('rank')
            if not (isinstance(r, int) and r > 0): v.E(w, 'rank must be a positive integer')
            elif r in ranks[c.get('tier')]: v.E(w, f'rank {r} used twice in tier {c.get("tier")}')
            else: ranks[c.get('tier')].add(r)
    media = v.load('core/media/media.json', required=False)
    media_ids = {m.get('id') for m in (media or {}).get('items', [])}
    for cid, c in concepts.items():
        if c.get('media') and c['media'] not in media_ids: v.E(f'concept {cid}', f'image “{c["media"]}” is not in core/media/media.json')

    # ---------- functions and frames ----------
    functions = {}
    for fn in v.files('core/functions'):
        where = f'core/functions/{fn}'; d = v.load(where)
        if not d: continue
        if not d.get('id') or d['id'] + '.json' != fn: v.E(where, 'the id must match the file name')
        functions[d.get('id')] = d
        need_str(v, where, d, 'title')
    for fid, d in functions.items():
        for a in d.get('after') or []:
            if a not in functions: v.E(f'core/functions/{fid}.json', f'unknown function “{a}” in after')
    frames = {}
    for f in (v.load('core/frames.json') or {}).get('frames', []):
        if f.get('id') in frames: v.E('core/frames.json', f'frame id “{f.get("id")}” used twice')
        frames[f.get('id')] = f
        need_str(v, f'core/frames.json · {f.get("id")}', f, 'meaning')

    # ---------- the DAG ----------
    nodes = {}
    nd = v.load('core/nodes.json')
    owners = defaultdict(list)   # concept → the nodes that teach it (per language at most one of them applies, §4.4)
    for n in (nd or {}).get('nodes', []):
        nid = n.get('id'); w = f'core/nodes.json · {nid}'
        if not nid: v.E('core/nodes.json', 'a node without id'); continue
        if nid in nodes: v.E(w, 'node id used twice')
        nodes[nid] = n
        need_str(v, w, n, 'title')
        if n.get('kind') not in NODE_KINDS: v.E(w, 'kind must be "core", "field" or "lesson"')
        if not n.get('concepts') and n.get('kind') != 'lesson': v.E(w, 'a node needs concepts')
        if n.get('path') is not None and n['path'] not in TYPOLOGIES: v.E(w, f'path must be one of {", ".join(sorted(TYPOLOGIES))}')
        if n.get('kind') == 'lesson':
            fl = n.get('functions')
            if isinstance(fl, dict):
                for key in fl:
                    if key != '*' and key not in TYPOLOGIES and key not in langs: v.E(w, f'functions: “{key}” is not "*", a language type or a course language')
                allf = [x for v_ in fl.values() for x in (v_ or [])]
            else: allf = fl if isinstance(fl, list) else []
            if not allf: v.E(w, 'a lesson needs its grammar (functions)')
            for f in allf:
                if f not in functions: v.E(w, f'unknown function “{f}”')
            if n.get('step') is not None and not (isinstance(n['step'], int) and n['step'] >= 0): v.E(w, 'step must be a whole number ≥ 0')
        elif n.get('functions'): v.E(w, 'only lessons have functions')
        for x in n.get('langs') or []:
            if x not in langs: v.E(w, f'“{x}” in langs is not a course language')
        for cid in n.get('concepts') or []:
            if cid not in concepts: v.E(w, f'unknown concept “{cid}”'); continue
            if cid in n.get('concepts')[:n['concepts'].index(cid)]: v.E(w, f'concept “{cid}” listed twice')
            owners[cid].append(nid)
            if n.get('kind') == 'field':
                if concepts[cid]['_field'] != n.get('field'): v.E(w, f'concept “{cid}” belongs to field {concepts[cid]["_field"]}, not {n.get("field")}')
                if concepts[cid].get('tier') != n.get('tier'): v.E(w, f'concept “{cid}” is tier {concepts[cid].get("tier")}, the node is tier {n.get("tier")}')
    for nid, n in nodes.items():
        for p in n.get('prereqs') or []:
            if p not in nodes: v.E(f'core/nodes.json · {nid}', f'unknown prerequisite “{p}”')
    for cid in concepts:
        if cid not in owners: v.E(f'concept {cid}', 'is in no node')
    state = {}
    def visit(x, path):
        if state.get(x) == 1: v.E('core/nodes.json', 'cycle: ' + ' → '.join(path + [x])); return
        if state.get(x) == 2 or x not in nodes: return
        state[x] = 1
        for p in nodes[x].get('prereqs') or []: visit(p, path + [x])
        state[x] = 2
    for nid in nodes: visit(nid, [])

    lessons = {nid: n for nid, n in nodes.items() if n.get('kind') == 'lesson'}
    if lessons:
        ty = v.load('core/typology.json')
        if ty:
            got = {t.get('id') for t in ty.get('types') or []}
            if got != TYPOLOGIES: v.E('core/typology.json', f'types must be exactly {", ".join(sorted(TYPOLOGIES))}')
            need_str(v, 'core/typology.json', ty, 'intro')
            for t in ty.get('types') or []:
                tw = f'core/typology.json · {t.get("id")}'
                for k in ('name', 'summary'): need_str(v, tw, t, k)
                if len(t.get('examples') or []) < 2: v.E(tw, 'at least 2 examples')
                for e in t.get('examples') or []:
                    for k in ('lang', 'text', 'analysis'): need_str(v, tw + ' · example', e, k)

    # ---------- every language ----------
    for L in langs:
        if only and L != only: continue
        lw = f'lang/{L}'
        lj = v.load(f'{lw}/language.json')
        if not lj: continue
        if lj.get('code') != L: v.E(f'{lw}/language.json', f'code must be “{L}”')
        if lj.get('dir') not in ('ltr', 'rtl'): v.E(f'{lw}/language.json', 'dir must be "ltr" or "rtl"')
        if lj.get('tokenJoin') not in ('space', 'none'): v.E(f'{lw}/language.json', 'tokenJoin must be "space" or "none"')
        extra = set(lj.get('extraTags') or [])
        pcells = lj.get('paradigmCells') or {}
        for k, cells in pcells.items():
            for c in cells:
                for e in cell_errors(c, extra): v.E(f'{lw}/language.json · paradigmCells.{k}', f'{c}: {e}')
        typ = lj.get('typology')
        if typ not in TYPOLOGIES: v.E(f'{lw}/language.json', f'typology must be one of {", ".join(sorted(TYPOLOGIES))} (D10)')
        app = {nid for nid, n in nodes.items() if applies(n, L, typ)}
        owner = {}
        for cid, ns in owners.items():
            mine = [x for x in ns if x in app]
            if len(mine) > 1: v.E(f'core/nodes.json · {L}', f'concept “{cid}” is taught twice in {L}: {", ".join(mine)}')
            if mine: owner[cid] = mine[0]
        # effective prerequisites: nodes that do not apply are passed through
        def eff(nid, seen=None):
            seen = seen or set(); out = set()
            for p in nodes[nid].get('prereqs') or []:
                if p not in nodes or p in seen: continue
                seen.add(p)
                out |= {p} if p in app else eff(p, seen)
            return out
        mylessons = [nid for nid in lessons if nid in app]
        if mylessons:
            prev = {nid: {p for p in eff(nid) if p in lessons} for nid in mylessons}
            firsts = [nid for nid in mylessons if not prev[nid]]
            if len(firsts) != 1: v.E(f'core/nodes.json · {L}', f'the lessons of {L} must form one chain; it starts at {", ".join(firsts) or "nothing"}')
            for nid in mylessons:
                if len(prev[nid]) > 1: v.E(f'core/nodes.json · {nid}', f'in {L} it follows two lessons ({", ".join(sorted(prev[nid]))}); lessons form a chain')
            nxt = defaultdict(list)
            for nid in mylessons:
                for p in prev[nid]: nxt[p].append(nid)
            for p, ns in nxt.items():
                if len(ns) > 1: v.E(f'core/nodes.json · {p}', f'in {L} two lessons follow it ({", ".join(sorted(ns))}); lessons form a chain')
            if len(firsts) == 1 and 'fn.overview' in functions and 'fn.overview' not in lesson_functions(nodes[firsts[0]], L, typ):
                v.E(f'core/nodes.json · {firsts[0]}', f'the first lesson of {L} is the overview (functions: fn.overview, D11)')
            found = [nid for nid in mylessons if nodes[nid].get('stage', 'foundations') == 'foundations']
            last = [nid for nid in found if not any(x in found for x in nxt.get(nid, []))]
            def reaches(nid, target, seen=None):
                seen = seen or set()
                for p in eff(nid):
                    if p == target: return True
                    if p in seen: continue
                    seen.add(p)
                    if reaches(p, target, seen): return True
                return False
            for nid in app:
                if nodes[nid].get('kind') == 'field' and len(last) == 1 and not reaches(nid, last[0]):
                    v.E(f'core/nodes.json · {nid}', f'in {L} the field opens before the foundations are done: it must come after {last[0]}')
        citation = lj.get('citationCells') or {}
        marks = bool(lj.get('vowelMarks'))
        lex = {}; later_cov = set(); pending_cov = []
        order = topo_order(nodes)
        for nid, n in nodes.items():
            where = f'{lw}/lexicon/{nid}.json'
            exists = os.path.exists(os.path.join(root, where))
            if nid not in app:
                if exists: v.E(where, f'node {nid} does not apply to {L} (path / langs)')
                continue
            if not exists and not n.get('concepts'): continue   # a grammar-only lesson needs no word file
            if not strict and not exists:
                v.W(where, 'not prepared yet'); continue
            d = v.load(where)
            if d is None: continue
            covered = set()
            for x in d.get('lexemes') or []:
                lid = x.get('id'); w = f'{where} · {lid}'
                if not (isinstance(lid, str) and lid.startswith(L + ':')): v.E(w, f'lexeme id must start with “{L}:”'); continue
                if lid in lex: v.E(w, 'lexeme id used twice')
                lex[lid] = {**x, '_node': nid}
                need_str(v, w, x, 'lemma')
                if x.get('pos') not in UD_POS: v.E(w, f'unknown part of speech “{x.get("pos")}”')
                senses = x.get('senses')
                if not isinstance(senses, list): v.E(w, '“senses” must be a list (empty for a word with no shared concept)'); senses = []
                for si, s in enumerate(senses):
                    if s not in concepts: v.E(w, f'unknown concept “{s}”')
                    elif si == 0 and owner.get(s) != nid: v.E(w, f'concept “{s}” belongs to node {owner.get(s)} in {L}, not {nid}')
                    elif si > 0 and owner.get(s) and order.index(owner[s]) < order.index(nid): v.E(w, f'its other sense “{s}” is taught earlier ({owner[s]}): put the word in that node, with that sense first')
                    if si == 0: covered.add(s)
                    else: later_cov.add(s)
                if not senses: need_str(v, w, x, 'role')
                if not isinstance(x.get('ref'), dict): v.E(w, '“ref” is required (how the word was checked)')
                forms = x.get('forms')
                key = f'{x.get("pos")}.{x["class"]}' if x.get('class') else x.get('pos')
                req = pcells.get(key, pcells.get(x.get('pos'), []))
                if forms is not None and not isinstance(forms, dict): v.E(w, '“forms” must be an object'); forms = {}
                forms = forms or {}
                seen = {}
                for c, f in forms.items():
                    for e in cell_errors(c, extra): v.E(w, f'cell {c}: {e}')
                    if canon(c) in seen: v.E(w, f'cells {seen[canon(c)]} and {c} are the same')
                    seen[canon(c)] = c
                    if not (isinstance(f, str) and f.strip()): v.E(w, f'cell {c}: empty form')
                    elif marks and len(letters(f)) > 1 and not has_marks(L, f): v.E(w, f'cell {c}: “{f}” has no vowel marks (store {L} forms fully vocalized)')
                for c in req:
                    if canon(c) not in seen: v.E(w, f'missing cell {c}')
                plene = x.get('plene') or {}
                if not isinstance(plene, dict): v.E(w, '“plene” must map cells to the full unvocalized spelling'); plene = {}
                for c, f in plene.items():
                    if canon(c) not in seen: v.E(w, f'plene: no cell {c}')
                    elif has_marks(L, f): v.E(w, f'plene {c}: “{f}” must be written without vowel marks')
                cc = citation.get(key, citation.get(x.get('pos')))
                if cc and forms:
                    if canon(cc) not in seen: v.E(w, f'missing citation cell {cc}')
                    elif forms[seen[canon(cc)]] != x.get('lemma'): v.E(w, f'the lemma “{x.get("lemma")}” must be the {cc} form “{forms[seen[canon(cc)]]}”')
                if marks and len(letters(x.get('lemma', ''))) > 1 and not has_marks(L, x.get('lemma', '')): v.E(w, f'the lemma has no vowel marks')
                check_profile(v, w, L, lj, x, course.get('profiles', 'required') == 'required')
                if x.get('pos') == 'NOUN' and L in GENDERED_NOUNS and x.get('class') != 'plt' and x.get('gender') not in ('MASC', 'FEM', 'NEUT'): v.E(w, 'gender is required (MASC, FEM or NEUT)')
                if L == 'zh':
                    lemma = x.get('lemma', '')
                    hans = [ch for ch in lemma if is_han(ch)]
                    if len(hans) != len(lemma): v.E(w, f'“{lemma}” must be written in characters only')
                    if not x.get('trad') or len(x['trad']) != len(lemma): v.E(w, 'the traditional form (trad) is required, with as many characters as the lemma')
                    syl = pinyin_split(x.get('pinyin', ''))
                    if not syl: v.E(w, 'pinyin is required (syllables separated by spaces)')
                    elif len(syl) != len(lemma) - (1 if lemma.endswith('儿') and syl[-1].endswith('r') and len(lemma) > 1 else 0):   # erhua: 哪儿 nǎr
                        v.E(w, f'{len(syl)} pinyin syllables for {len(lemma)} characters')
                    for s in syl:
                        for e in pinyin_syllable_errors(s): v.E(w, e)
                    if x.get('pos') == 'NOUN' and not x.get('measure') and not x.get('measureNone'): v.E(w, 'a noun needs its measure word(s) (measure), or measureNone with the reason (人们)')
            for a in d.get('absent') or []:
                cid = a.get('concept'); w = f'{where} · absent {cid}'
                if owner.get(cid) != nid: v.E(w, f'concept “{cid}” is not in node {nid}')
                if cid in covered: v.E(w, 'the concept has a word and is also marked absent')
                need_str(v, w, a, 'reason')
                covered.add(cid)
            pending_cov.append((where, nid, covered))
        for where, nid, covered in pending_cov:
            for cid in nodes[nid].get('concepts') or []:
                if cid not in covered and cid not in later_cov: (v.E if (batch and nid in batch) or (not batch and nid not in draft) else v.W)(where, f'concept “{cid}” has no word and is not marked absent')

        # grammar realizations
        for nid in mylessons:
            for fid in lesson_functions(nodes[nid], L, typ):
                if fid in functions and not os.path.exists(os.path.join(root, f'{lw}/grammar/{fid}.json')):
                    (v.E if strict else v.W)(f'{lw}/grammar/{fid}.json', f'lesson {nid} needs this realization')
        for fid in functions:
            where = f'{lw}/grammar/{fid}.json'
            if not os.path.exists(os.path.join(root, where)): continue
            g = v.load(where)
            if not g: continue
            overview = functions[fid].get('category') == 'overview'
            if g.get('function') != fid: v.E(where, f'function must be “{fid}”')
            if g.get('status') not in STATUS: v.E(where, f'status must be one of {", ".join(sorted(STATUS))}')
            need_str(v, where, g, 'summary')
            for gen in g.get('generators') or []:
                if gen.get('type') not in GENERATORS: v.E(where, f'unknown exercise type “{gen.get("type")}”')
                if gen.get('type') == 'inflect' and not gen.get('pos'): v.E(where, 'inflect needs pos')
                for fr_ in (gen.get('bank') or {}).get('frames') or []:
                    if fr_ not in frames: v.E(where, f'generator bank: unknown frame “{fr_}”')
                for f_ in (gen.get('bank') or {}).get('functions') or []:
                    if f_ not in functions: v.E(where, f'generator bank: unknown function “{f_}”')
                if gen.get('type') == 'quiz' and not g.get('quiz'): v.E(where, 'quiz: the questions (quiz) are missing')
            for i, q in enumerate(g.get('quiz') or []):
                qw = f'{where} · quiz {i + 1}'
                need_str(v, qw, q, 'q'); need_str(v, qw, q, 'why')
                opts = q.get('options')
                if not (isinstance(opts, list) and len(opts) >= 2 and all(isinstance(o, str) and o.strip() for o in opts)): v.E(qw, 'options: at least 2 non-empty strings')
                elif len(set(opts)) != len(opts): v.E(qw, 'two options are the same')
                elif q.get('answer') not in opts: v.E(qw, 'answer must be one of the options (the text)')
            if overview:
                t = g.get('typology') or {}
                if t.get('type') != typ: v.E(where, f'typology.type must be the language’s type “{typ}”')
                need_str(v, where + ' · typology', t, 'why')
                if len(g.get('facts') or []) < 3: v.E(where, 'facts: at least 3 (family, script and direction, speakers…)')
                for f in g.get('facts') or []:
                    for k in ('label', 'value'): need_str(v, where + ' · facts', f, k)
                if len(g.get('peculiarities') or []) < 3: v.E(where, 'peculiarities: at least 3 that matter from the beginning (D11)')
                for f in g.get('peculiarities') or []:
                    for k in ('title', 'text'): need_str(v, where + ' · peculiarities', f, k)
                for f in g.get('forYou') or []:
                    if f.get('lang') not in (course.get('knownLanguages') or []): v.E(where + ' · forYou', f'“{f.get("lang")}” is not in course.knownLanguages')
                    need_str(v, where + ' · forYou', f, 'text')
                if not g.get('forYou'): v.E(where, 'forYou: what is easy or hard given the languages the learner knows')
                if len(g.get('quiz') or []) < 3: v.E(where, 'quiz: at least 3 questions')
            for c in g.get('paradigmCells') or []:
                for e in cell_errors(c, extra): v.E(where, f'{c}: {e}')
            if g.get('status') != 'absent' and not overview:
                ev = g.get('evidence') or {}
                for l in ev.get('lemmas') or []:
                    if l not in lex: v.E(where, f'evidence lemma “{l}” is not in the lexicon')
                if not (g.get('procedure') or {}).get('askYourself'): v.E(where, 'procedure.askYourself (the “ask yourself” checklist) is required')

        # sentence bank
        realized = set(); sids = {}
        grams = {fid: (v.load(f'{lw}/grammar/{fid}.json', required=False) or {}) for fid in functions}
        def check_token(k, w, first):
            l = k.get('l')
            if l not in lex: v.E(w, f'unknown lexeme “{l}”'); return []
            x = lex[l]; forms = x.get('forms') or {}
            f = k.get('f')
            if f:
                cm = {canon(c): c for c in forms}
                if canon(f) not in cm: v.E(w, f'“{l}” has no cell {f}'); return [(l, f)]
                want = forms[cm[canon(f)]]
            else:
                if forms: v.E(w, f'“{l}” is inflected: the cell (f) is required'); return [(l, None)]
                want = x.get('lemma')
            got = k.get('t')
            if not f and got in (x.get('alts') or []): return [(l, f)]   # another spelling of an invariant word (וּ for וְ)
            if got != want and not (first and lj.get('capitalizeFirst') and got == cap_first(want)):
                v.E(w, f'“{got}” is not the {f or "lemma"} form of {l} (“{want}”)')
            return [(l, f)]
        for fn in v.files(f'{lw}/bank'):
            where = f'{lw}/bank/{fn}'; d = v.load(where)
            for s in (d or {}).get('sentences', []):
                sid = s.get('id'); w = f'{where} · {sid}'
                if not (isinstance(sid, str) and sid.startswith(L + '.')): v.E(w, f'sentence id must start with “{L}.”')
                if sid in sids: v.E(w, 'sentence id used twice')
                sids[sid] = s
                if s.get('frame') not in frames: v.E(w, f'unknown frame “{s.get("frame")}”')
                elif not s.get('variantOf'): realized.add(s['frame'])
                need_str(v, w, s, 'gloss')
                toks = s.get('tokens') or []
                if not toks: v.E(w, 'tokens are required'); continue
                used = []; first = True
                for i, k in enumerate(toks):
                    tw = f'{w} · token {i + 1} “{k.get("t")}”'
                    if k.get('p'):
                        if k.get('t') and k['t'][-1] in '.?!。？！؟': first = True   # a new sentence inside the text (an exchange): it may start with a capital
                        continue
                    if k.get('name'):   # a proper name (Anna, דָּוִד): no lexeme, never taught, never required
                        if k.get('l') or k.get('f'): v.E(tw, 'a name has no lexeme (l) and no cell (f)')
                        first = False; continue
                    if k.get('parts'):
                        if ''.join(p.get('t', '') for p in k['parts']) != k.get('t'): v.E(tw, 'the parts do not spell the token')
                        for j, p in enumerate(k['parts']):
                            if not p.get('name'): used += check_token(p, f'{tw} · part {j + 1}', first and j == 0)
                    else: used += check_token(k, tw, first)
                    first = False
                if join_tokens(toks, lj.get('tokenJoin')) != s.get('text'): v.E(w, f'text “{s.get("text")}” ≠ the tokens joined “{join_tokens(toks, lj.get("tokenJoin"))}”')
                for fid in s.get('functions') or []:
                    if fid not in functions: v.E(w, f'unknown function “{fid}”'); continue
                    g = grams.get(fid) or {}
                    if g.get('status') == 'absent': v.E(w, f'{fid} is absent in {L}; a sentence cannot show it'); continue
                    ev = g.get('evidence') or {}
                    if not (ev.get('tags') or ev.get('lemmas') or ev.get('punct')): v.E(w, f'{fid} has no evidence in its realization (tags, lemmas or punct): a sentence cannot show it'); continue
                    ok = (any(l in (ev.get('lemmas') or []) for l, _ in used) or any(f and all(t in cell_parts(f) for t in ev.get('tags') or ['∅']) for _, f in used)
                          or any(k.get('p') and k.get('t') in (ev.get('punct') or []) for k in toks))   # e.g. a question mark
                    if ok and any(l in (ev.get('exclude') or []) for l, _ in used): ok = False   # e.g. a wh-word: not a yes/no question
                    if not ok: v.E(w, f'listed as {fid}, but no word shows it (evidence {ev})')
        for sid, s in sids.items():
            vo = s.get('variantOf')
            if vo:
                if vo not in sids: v.E(f'{lw}/bank · {sid}', f'variantOf “{vo}” does not exist')
                elif sids[vo].get('frame') != s.get('frame'): v.E(f'{lw}/bank · {sid}', 'a variant must have the frame of its original')
                if not s.get('variant'): v.E(f'{lw}/bank · {sid}', 'a variant must say what changed (variant)')
        for fid, f in frames.items():
            if fid not in realized and L not in (f.get('absent') or {}): (v.E if strict else v.W)(f'{lw}/bank', f'frame “{fid}” has no sentence in {L}')
    for x in os.listdir(os.path.join(root, 'lang')) if os.path.isdir(os.path.join(root, 'lang')) else []:
        if x not in langs: v.W(f'lang/{x}', 'not a course language (ignored)')
    return v


def main(a):
    if not a: print(__doc__); sys.exit(2)
    batch = set(a[a.index('--batch') + 1].split(',')) if '--batch' in a else None   # a content batch in progress: only these nodes must be complete
    v = validate(a[0], a[a.index('--lang') + 1] if '--lang' in a else None, '--strict' in a, batch)
    if '--json' in a: print(json.dumps({'errors': v.errors, 'warnings': v.warns}, ensure_ascii=False, indent=1))
    else:
        for e in v.errors: print('❌', e)
        for w in v.warns: print('⚠️ ', w)
        print(f'{"✅ valid" if not v.errors else "❌ " + str(len(v.errors)) + " problem(s)"} — {a[0]}')
    sys.exit(1 if v.errors else 0)

if __name__ == '__main__': main(sys.argv[1:])
