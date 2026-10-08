#!/usr/bin/env python3
"""Validate a language course (docs/LANGUAGES.md §4 and §11). No network, no dependencies.

  python3 tools/validate_lang.py <course-dir> [--lang de] [--strict] [--json] [--batch fd.00,fd.01] [--alone]

Without --strict a course may be unfinished: a node without its lexicon file in a language is “not prepared yet”
and a frame without a sentence is reported as a warning. --strict (the tests, a finished course) makes both errors.
--lang checks one language only (the language-neutral core is always checked).
--batch: while a content batch is written, only the listed nodes must have a word (or an absent entry) for every concept.
The parallel order (D13, a hard constraint) is checked against every language of this course, the path of every
language type, and every language of the other courses in the same folder (library/languages/*); --alone skips the others.

Exit 0 when valid, 1 with the list of problems otherwise. Every check here has a negative test in tests/lang_validate.py.
"""
import json, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from langlib import (pinyin_tone, nfc, canon, cell_errors, cell_parts, UD_POS, strip_marks, has_marks, letters, is_han,
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


# ---------- the parallel order (D13, §4.4.3) — a hard constraint across every language of every course ----------
def course_paths(root, label=None):
    """The teaching path of every language of the course at root, and the path of every language type (the path a
    language still to come would walk): [(name, [(node id, {items})])]. An item is a subject — "node X", "grammar
    fn.Y", "word Z" (a concept) — in the step where the path teaches it first."""
    J = lambda rel: json.load(open(os.path.join(root, rel), encoding='utf-8'))
    course = J('course.json'); nodes = {n['id']: n for n in J('core/nodes.json').get('nodes', []) if n.get('id')}
    label = label or course.get('id') or os.path.basename(root)
    holders = []
    for L in course.get('languages') or []:
        try: typ = J(f'lang/{L}/language.json').get('typology')
        except (OSError, ValueError): continue
        holders.append((f'{label}/{L}', L, typ))
    holders += [(f'{label}/{t} type', None, t) for t in sorted(TYPOLOGIES)]
    order = topo_order(nodes); out = []
    for name, L, typ in holders:
        seen, steps = set(), []
        for nid in order:
            n = nodes[nid]
            if not applies(n, L, typ): continue
            g = {'node ' + nid} | {'grammar ' + f for f in lesson_functions(n, L, typ)} | {'word ' + c for c in n.get('concepts') or []}
            g -= seen; seen |= g
            steps.append((nid, g))
        out.append((name, steps))
    return out


def order_conflicts(paths, mine=None, limit=12):
    """Pairs of subjects taught in opposite orders by two paths, then cycles through three or more paths (no common
    order exists at all). mine: report only conflicts that involve a path whose name starts with it. → [message]"""
    pos = []
    for _, steps in paths:
        p = {}
        for i, (nid, g) in enumerate(steps):
            for x in g: p[x] = (i, nid)
        pos.append(p)
    found = {}
    for a in range(len(paths)):
        for b in range(a + 1, len(paths)):
            if mine and not (paths[a][0].startswith(mine) or paths[b][0].startswith(mine)): continue
            A, B = pos[a], pos[b]
            common = sorted((x for x in A if x in B), key=lambda x: (A[x][0], B[x][0]))
            best, i = None, 0   # best: the item of an earlier step of A that comes latest in B
            while i < len(common):
                j = i
                while j < len(common) and A[common[j]][0] == A[common[i]][0]: j += 1
                for y in common[i:j]:
                    if best and B[y][0] < B[best][0]:
                        key = (best, y)
                        if key not in found: found[key] = f'“{best}” comes before “{y}” in {paths[a][0]} ({A[best][1]} → {A[y][1]}) but after it in {paths[b][0]} ({B[y][1]} → {B[best][1]})'
                for y in common[i:j]:
                    if best is None or B[y][0] > B[best][0]: best = y
                i = j
    msgs = list(found.values())
    if not msgs:   # no pair disagrees — but three paths can still go round in a circle (x < y, y < z, z < x)
        succ = {}
        for k, (name, steps) in enumerate(paths):
            for i, (nid, g) in enumerate(steps):
                sep = ('step', k, i)
                for x in g: succ.setdefault(x, set()).add(sep)
                if i + 1 < len(steps): succ.setdefault(sep, set()).update(steps[i + 1][1])
        state = {}
        for start in list(succ):
            if state.get(start): continue
            stack = [(start, iter(succ.get(start, ())))]; state[start] = 1; trail = [start]
            while stack:
                x, it = stack[-1]; nxt = next(it, None)
                if nxt is None: state[x] = 2; stack.pop(); trail.pop(); continue
                if state.get(nxt) == 1:
                    cyc = [t for t in trail[trail.index(nxt):] if isinstance(t, str)]
                    return [f'no common order exists: {" → ".join(cyc + [cyc[0]])} (each step of the circle comes from a different path)']
                if not state.get(nxt): state[nxt] = 1; stack.append((nxt, iter(succ.get(nxt, ())))); trail.append(nxt)
    return msgs[:limit] + ([f'… and {len(msgs) - limit} more'] if len(msgs) > limit else [])


def peer_courses(root):
    """The other language courses of the app: the course folders next to this one (library/languages/*)."""
    up = os.path.dirname(os.path.abspath(root)); out = []
    for d in sorted(os.listdir(up)) if os.path.isdir(up) else []:
        p = os.path.join(up, d)
        if os.path.abspath(p) == os.path.abspath(root) or not os.path.exists(os.path.join(p, 'course.json')): continue
        try:
            if json.load(open(os.path.join(p, 'course.json'), encoding='utf-8')).get('format') == 'noema.langcourse/v1': out.append(p)
        except (OSError, ValueError): pass
    return out
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


def check_profile(v, w, L, lj, x, required, pending=frozenset()):
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
    # D15: every distinct meaning is a concept; a nuance hangs under the sense it belongs to
    byid = {s.get('id'): s for s in senses}
    for s in senses:
        sw = f'{pw} · sense {s.get("id")}'
        if s.get('concept') and s.get('of'): v.E(sw, 'a sense is either its own meaning (concept) or a nuance of another (of), not both')
        elif not s.get('concept') and not s.get('of'): v.E(sw, 'every meaning is a concept (D15): give its concept (pending if the course does not teach it yet), or “of”: the sense it is a nuance of')
        elif s.get('of') and not (byid.get(s['of']) or {}).get('concept'): v.E(sw, f'of: “{s["of"]}” is not a sense of this word with a concept')
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
            if s.get('concept') and per.get(s.get('id'), 0) < (1 if s['concept'] in pending else 2): v.E(f'{pw} · sense {s.get("id")}', 'the main sense of a concept needs at least 2 examples' if s['concept'] not in pending else 'a meaning needs at least one example')
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

# ---------- D14: the catalogue of phenomena and the facade of a word ----------
FEATURE_TYPES = {'enum', 'string', 'strings', 'bool', 'int', 'list'}
ITEM_TYPES = {'string', 'strings', 'bool', 'int', 'senses', 'lexeme', 'cell'}
TOP_FIELDS = {'gender', 'class', 'translit', 'pinyin', 'trad', 'plene', 'variants', 'alts', 'prefix', 'role', 'forms', 'formsAlt'}
PHEN_AREAS = {'script', 'orthography', 'phonology', 'morphology', 'syntax', 'lexicon', 'semantics', 'pragmatics', 'culture', 'numbers'}
PHEN_STATUS = {'covered', 'partial', 'missing'}
REPO_PHENOMENA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'library', 'languages', '_phenomena')


def phenomena_path(root, L):
    """The catalogue of phenomena of language L (§4.11): next to the course (library/languages/_phenomena), else the repo's."""
    for d in (os.path.join(os.path.dirname(os.path.abspath(root)), '_phenomena'), REPO_PHENOMENA):
        p = os.path.join(d, L + '.json')
        if os.path.exists(p): return p
    return None


def load_typology(path):
    """The shared typological vocabulary and the language profiles next to a catalogue (D16): (features {id: {values}}, profiles {code: values})."""
    d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(path))), '_typology')
    try:
        fs = json.load(open(os.path.join(d, 'features.json'), encoding='utf-8'))['features']
        ls = json.load(open(os.path.join(d, 'languages.json'), encoding='utf-8'))['languages']
    except (OSError, ValueError, KeyError): return None, None
    return {f['id']: {x['id'] for x in f.get('values') or []} for f in fs}, {x['code']: x.get('values') or {} for x in ls}


def check_phenomena(v, L, path):
    """→ the phenomenon ids of the catalogue (errors for a broken catalogue)."""
    w = f'_phenomena/{L}.json'
    try: d = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e: v.E(w, f'cannot read ({e})'); return set()
    feats, profiles = load_typology(path)
    if feats is None: v.E('_typology', 'missing: the shared typological vocabulary and language profiles (features.json, languages.json; D16, §4.11)')
    elif L not in profiles: v.E('_typology/languages.json', f'no profile for “{L}”: every course language is described in the shared vocabulary (D16)')
    mine = (profiles or {}).get(L) or {}; covered = set()
    if d.get('format') != 'noema.langphenomena/v1': v.E(w, 'format must be "noema.langphenomena/v1"')
    if d.get('lang') != L: v.E(w, f'lang must be “{L}”')
    ids = set()
    for ph in d.get('phenomena') or []:
        pid = ph.get('id'); pw = f'{w} · {pid}'
        if not pid or pid in ids: v.E(pw, 'phenomenon id missing or repeated'); continue
        ids.add(pid)
        for k in ('title', 'what'): need_str(v, pw, ph, k)
        if ph.get('area') not in PHEN_AREAS: v.E(pw, f'area must be one of {", ".join(sorted(PHEN_AREAS))}')
        if ph.get('status') not in PHEN_STATUS: v.E(pw, 'status must be covered, partial or missing')
        if ph.get('status') != 'covered' and not (ph.get('gap') or '').strip(): v.E(pw, 'say what is missing (gap)')
        if not ph.get('examples'): v.E(pw, 'at least one example')
        if ph.get('kind', 'has') not in ('has', 'lacks'): v.E(pw, 'kind must be "has" or "lacks"')
        if feats is not None:
            tags = ph.get('typology')
            if not isinstance(tags, list) or not tags: v.E(pw, 'tag it with the typological feature values it is about (typology: [{feature, value}], D16)'); tags = []
            for t in tags:
                fid, val = t.get('feature'), t.get('value')
                if fid not in feats: v.E(pw, f'typology: unknown feature “{fid}”'); continue
                if val not in feats[fid]: v.E(pw, f'typology: “{val}” is not a value of {fid}'); continue
                if mine and mine.get(fid) not in (val, None) and mine.get(fid) != 'unknown': v.E(pw, f'typology: {fid} = “{val}”, but the profile of {L} says “{mine.get(fid)}”')
                covered.add(fid)
    if len(ids) < 20: v.E(w, 'a catalogue of phenomena covers every area of the language (at least 20 phenomena)')
    if feats is not None and mine:
        miss = sorted(f for f in feats if f not in covered and mine.get(f) not in (None, 'unknown'))
        if miss: v.E(w, f'{len(miss)} typological feature(s) not covered by any phenomenon — what the language has or lacks matters to learners of other backgrounds (D16): {", ".join(miss[:12])}{" …" if len(miss) > 12 else ""}')
    return ids


def check_decls(v, where, wf, phen):
    """The wordFeatures declaration of a language → {pos: [declaration]} (errors for broken declarations)."""
    out = {}
    if not isinstance(wf, dict): v.E(where, 'wordFeatures must map parts of speech to their parameters (D14, §4.5.1)'); return out
    for pos, ds in wf.items():
        if pos not in UD_POS: v.E(where, f'wordFeatures: unknown part of speech “{pos}”')
        seen = set(); out[pos] = []
        for d in ds or []:
            dw = f'{where} · wordFeatures.{pos}.{d.get("id")}'
            if not d.get('id') or d['id'] in seen: v.E(dw, 'id missing or repeated'); continue
            seen.add(d['id']); out[pos].append(d)
            need_str(v, dw, d, 'title')
            if d.get('at') == 'top':
                if d['id'] not in TOP_FIELDS: v.E(dw, f'“at: top” only for the shared fields ({", ".join(sorted(TOP_FIELDS))})')
            elif d['id'] in TOP_FIELDS: v.E(dw, f'“{d["id"]}” is a shared top-level field: declare it with "at": "top"')
            if d.get('type') not in FEATURE_TYPES: v.E(dw, f'type must be one of {", ".join(sorted(FEATURE_TYPES))}')
            if d.get('type') == 'enum' and not d.get('values'): v.E(dw, 'an enum needs its values')
            if d.get('type') == 'list':
                if not isinstance(d.get('item'), dict) or not d['item']: v.E(dw, 'a list needs its item (key → type)')
                for k, t in (d.get('item') or {}).items():
                    t0 = t.rstrip('?')
                    if not (t0 in ITEM_TYPES or (t0.startswith('enum:') and len(t0) > 5)): v.E(dw, f'item.{k}: unknown type “{t}”')
            ps = d.get('phenomenon'); ps = ps if isinstance(ps, list) else [ps] if ps else []
            if not ps: v.E(dw, 'name the phenomenon (or phenomena) it records (§4.11)')
            for ph_ in ps:
                if ph_ not in phen: v.E(dw, f'phenomenon “{ph_}” is not in the catalogue')
    return out


def check_features(v, w, x, decls, lexids):
    """Every parameter of the word's part of speech stated, typed (D14)."""
    pos = x.get('pos'); key = f'{pos}.{x["class"]}' if x.get('class') else pos
    feats = x.get('features')
    if feats is not None and not isinstance(feats, dict): v.E(w, '“features” must be an object'); feats = {}
    feats = feats or {}
    sids = {s.get('id') for s in ((x.get('profile') or {}).get('senses') or [])}
    mine = [d for d in decls.get(pos, []) if not d.get('classes') or key in d['classes']]
    known = {d['id'] for d in mine}
    for k in feats:
        if k not in known: v.E(w, f'features.{k}: not a parameter of {key} in this language (wordFeatures)')
    def typed(dw, t, val, values=None):
        t0 = t.rstrip('?')
        if t0 == 'string': return isinstance(val, str) and val.strip() != ''
        if t0 == 'strings': return isinstance(val, list) and all(isinstance(a, str) and a.strip() and (not values or a in values) for a in val)
        if t0 == 'bool': return isinstance(val, bool)
        if t0 == 'int': return isinstance(val, int) and not isinstance(val, bool)
        if t0 == 'lexeme': return isinstance(val, str) and ':' in val
        if t0 == 'cell': return isinstance(val, str) and val.strip() != ''
        if t0 == 'senses':
            if not (isinstance(val, list) and val and all(isinstance(a, str) for a in val)): return False
            bad = [a for a in val if a not in sids]
            if bad: v.E(dw, f'unknown sense(s) {", ".join(bad)} (the ids of the word\'s profile senses)')
            return True
        if t0.startswith('enum:'): return val in t0[5:].split('|')
        return False
    for d in mine:
        fid = d['id']; dw = f'{w} · {fid}'
        if d.get('at') == 'top': val = x.get(fid)
        else: val = feats.get(fid)
        if val is None:
            v.E(w, f'the word does not state its {d.get("title", fid)} ({fid}{" at the top level" if d.get("at") == "top" else ""}): give a value' + (' or {"none": "<why>"}' if d.get('none') else '') + ' (D14)'); continue
        if isinstance(val, dict) and set(val) == {'none'}:
            if not d.get('none'): v.E(dw, 'this parameter cannot be “none”: every such word has it')
            elif not (isinstance(val['none'], str) and val['none'].strip()): v.E(dw, 'say why it is none')
            continue
        t = d.get('type')
        if t == 'enum':
            if val not in (d.get('values') or []): v.E(dw, f'“{val}” is not one of {", ".join(map(str, d.get("values") or []))}')
        elif t == 'list':
            if not isinstance(val, list): v.E(dw, 'must be a list'); continue
            for i, it in enumerate(val):
                iw = f'{dw}[{i}]'
                if not isinstance(it, dict): v.E(iw, 'must be an object'); continue
                for k in it:
                    if k not in d['item']: v.E(iw, f'unknown key “{k}”')
                for k, kt in d['item'].items():
                    if k not in it:
                        if not kt.endswith('?'): v.E(iw, f'“{k}” is required')
                    elif not typed(iw, kt, it[k]): v.E(iw, f'{k}: not a valid {kt.rstrip("?")}')
        elif not typed(dw, t, val, d.get('values')): v.E(dw, f'not a valid {t}' + (f' (one of {", ".join(d["values"])})' if d.get('values') else ''))


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


def validate(root, only=None, strict=True, batch=None, peers=None):
    """peers: the other courses whose language paths this one must agree with (D13); default: the course folders next to it."""
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
        if n.get('stage') is not None and n['stage'] not in ('foundations', 'core', 'advanced'): v.E(w, 'stage must be foundations, core or advanced (D17)')
        if n.get('stage') == 'advanced' and n.get('family') not in ('field', 'grammar', 'lexicon', 'variety', 'text', 'culture'): v.E(w, 'an advanced module names its family: field, grammar, lexicon, variety, text or culture (D17, §4.4.4)')
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
    pending = {cid for cid, c in concepts.items() if c.get('pending')}   # meanings known from words, not taught yet (D15)
    for cid in concepts:
        if cid in pending:
            if cid in owners: v.E(f'concept {cid}', f'is pending but node {owners[cid][0]} teaches it: remove "pending"')
        elif cid not in owners: v.E(f'concept {cid}', 'is in no node (a meaning not taught yet is "pending": true)')
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

    # ---------- the parallel order (D13): one common order of the subjects for every language of every course ----------
    if nd:
        try:
            paths = course_paths(root, course.get('id'))
            for p in (peer_courses(root) if peers is None else peers):
                try: paths += course_paths(p)
                except (OSError, ValueError, KeyError) as e: v.W(f'course {os.path.basename(p)}', f'not read for the parallel order: {e}')
            for m in order_conflicts(paths, mine=(course.get('id') or '') + '/'):
                v.E('parallel order (D13)', m + ' — a subject common to several paths keeps the same place in all of them; move it in every language (docs/LANGUAGES.md §4.4.3)')
        except (OSError, ValueError, KeyError) as e: v.E('parallel order (D13)', f'cannot read the paths: {e}')

    # ---------- every language ----------
    meant = set()   # every concept some word of some language has (D15: a pending concept exists because a word means it)
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
        # D14: the catalogue of phenomena comes first; the facade of every part of speech is declared from it
        pp = phenomena_path(root, L)
        if not pp: v.E(f'_phenomena/{L}.json', f'missing: a language starts with its catalogue of phenomena (docs/LANGUAGES.md §4.11)'); phen = set()
        else: phen = check_phenomena(v, L, pp)
        if 'wordFeatures' not in lj: v.E(f'{lw}/language.json', 'wordFeatures is required: the parameters every word of each part of speech states (D14, §4.5.1)')
        decls = check_decls(v, f'{lw}/language.json', lj.get('wordFeatures') or {}, phen) if 'wordFeatures' in lj else {}
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
                meant.update(x.get('senses') or [])
                need_str(v, w, x, 'lemma')
                if x.get('pos') not in UD_POS: v.E(w, f'unknown part of speech “{x.get("pos")}”')
                senses = x.get('senses')
                if not isinstance(senses, list): v.E(w, '“senses” must be a list (empty for a word with no shared concept)'); senses = []
                for si, s in enumerate(senses):
                    if s not in concepts: v.E(w, f'unknown concept “{s}”')
                    elif si == 0 and owner.get(s) != nid and x.get('role') and owner.get(s) in order and order.index(owner[s]) > order.index(nid): later_cov.add(s); continue   # a grammar word met early (לְ) whose concept is taught later
                    elif si == 0 and s in pending and x.get('role'): continue   # a grammar word met here whose meaning is not taught as a concept yet (D15; its role says why it is here)
                    elif si == 0 and owner.get(s) != nid: v.E(w, f'concept “{s}” belongs to node {owner.get(s)} in {L}, not {nid}')
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
                check_profile(v, w, L, lj, x, course.get('profiles', 'required') == 'required', pending)
                if 'wordFeatures' in lj:
                    if x.get('pos') not in decls: v.E(w, f'no wordFeatures for {x.get("pos")} in {L}: declare the parameters of this part of speech (an empty list if it has none)')
                    check_features(v, w, x, decls, lex)
                for ct in x.get('contrasts') or []:
                    if ct.get('concept') not in (x.get('senses') or []): v.E(w, f'contrasts: “{ct.get("concept")}” is not one of the word\'s concepts')
                    for k in ('axis', 'value'): need_str(v, w + ' · contrasts', ct, k)
                if x.get('pos') == 'NOUN' and L in GENDERED_NOUNS and x.get('class') != 'plt' and x.get('gender') not in ('MASC', 'FEM', 'NEUT'): v.E(w, 'gender is required (MASC, FEM or NEUT)')
                if L == 'zh':
                    lemma = x.get('lemma', '')
                    hans = [ch for ch in lemma if is_han(ch)]
                    if len(hans) != len(lemma): v.E(w, f'“{lemma}” must be written in characters only')
                    if not x.get('trad') or len(x['trad']) != len(lemma): v.E(w, 'the traditional form (trad) is required, with as many characters as the lemma')
                    syl = pinyin_split(x.get('pinyin', ''))
                    if not syl: v.E(w, 'pinyin is required (syllables separated by spaces)')
                    elif len(syl) != len(lemma) - (1 if lemma.endswith('儿') and syl[-1].endswith('r') and len(lemma) > 1 and pinyin_tone(syl[-1])[0] != 'er' else 0):   # erhua: 哪儿 nǎr
                        v.E(w, f'{len(syl)} pinyin syllables for {len(lemma)} characters')
                    erhua = lemma.endswith('儿') and len(lemma) > 1 and syl and syl[-1].endswith('r') and pinyin_tone(syl[-1])[0] != 'er' and len(syl) == len(lemma) - 1
                    for i_, s in enumerate(syl):
                        for e in pinyin_syllable_errors(s[:-1] if erhua and i_ == len(syl) - 1 else s): v.E(w, e)   # huìr, nǎr: the syllable without its r
                    ms = (x.get('features') or {}).get('measure', x.get('measure'))
                    if x.get('pos') == 'NOUN' and not ms and not x.get('measureNone'): v.E(w, 'a noun needs its measure word(s) (features.measure), or {"none": "<why>"} (人们)')
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
        # D14: one concept, several words → each says what separates it, on one axis
        words_of = defaultdict(list)
        for lid, x in lex.items():
            for c in x.get('senses') or []: words_of[c].append(lid)
        for cid, ids in words_of.items():
            if len(ids) < 2: continue
            got = {lid: next((ct for ct in lex[lid].get('contrasts') or [] if ct.get('concept') == cid), None) for lid in ids}
            miss = [lid for lid, ct in got.items() if not ct]
            if miss: v.E(f'{lw} · concept {cid}', f'{len(ids)} words ({", ".join(ids)}): each says what separates it (contrasts) — missing in {", ".join(miss)} (D14, §4.5.2)'); continue
            if len({ct.get('axis') for ct in got.values()}) > 1: v.E(f'{lw} · concept {cid}', f'the words of one concept are contrasted on ONE axis, not {sorted({ct.get("axis") for ct in got.values()})}')
            vals = [ct.get('value') for ct in got.values()]
            if len(set(vals)) < len(vals): v.E(f'{lw} · concept {cid}', 'two words have the same contrast value')

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
            if L == 'ar' and not first and got != want and len(want) > 2 and want[0] == 'ا' and want[1] in '\u0650\u064f\u064e' and got in ('\u0671' + want[2:], 'ا' + want[2:]):
                return [(l, f)]   # hamzat al-waṣl: inside a sentence the alif loses its vowel (ٱبْنُ / ابْنُ), at the start it is said with it (اِبْنُ)
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
                    tagsets = ev.get('tags') or []
                    tagsets = tagsets if tagsets and isinstance(tagsets[0], list) else [tagsets] if tagsets else []   # [["CMPR"], ["SPRL"]] = either
                    ok = (any(l in (ev.get('lemmas') or []) for l, _ in used) or any(f and ts and all(t in cell_parts(f) for t in ts) for _, f in used for ts in tagsets)
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
    if not only and strict:
        for cid in sorted(pending - meant): v.E(f'concept {cid}', 'is pending, but no word of the course has this meaning: remove it')
    for x in os.listdir(os.path.join(root, 'lang')) if os.path.isdir(os.path.join(root, 'lang')) else []:
        if x not in langs: v.W(f'lang/{x}', 'not a course language (ignored)')
    return v


def main(a):
    if not a: print(__doc__); sys.exit(2)
    batch = set(a[a.index('--batch') + 1].split(',')) if '--batch' in a else None   # a content batch in progress: only these nodes must be complete
    peers = [] if '--alone' in a else None   # --alone: skip the comparison with the other courses (D13)
    v = validate(a[0], a[a.index('--lang') + 1] if '--lang' in a else None, '--strict' in a, batch, peers)
    if '--json' in a: print(json.dumps({'errors': v.errors, 'warnings': v.warns}, ensure_ascii=False, indent=1))
    else:
        for e in v.errors: print('❌', e)
        for w in v.warns: print('⚠️ ', w)
        print(f'{"✅ valid" if not v.errors else "❌ " + str(len(v.errors)) + " problem(s)"} — {a[0]}')
    sys.exit(1 if v.errors else 0)

if __name__ == '__main__': main(sys.argv[1:])
