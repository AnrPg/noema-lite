#!/usr/bin/env python3
"""Explanation facades of a language course (D19, docs/language-packs.md §3–§4). No network; babel optional.

  python3 tools/lang_facade.py extract   <course> [--locale en] [--shown-only] [--out DIR]
  python3 tools/lang_facade.py parity    <course> --locale <loc> [--out DIR] [--strict] [--no-write]
  python3 tools/lang_facade.py lint      <course> [--locale <loc>] [--json] [--strict] [--max N]
  python3 tools/lang_facade.py task      <course> --locale <loc> --tier 1 [--lang L|core|ph:L|typology] [--max-chars 12000] [--out DIR]
  python3 tools/lang_facade.py merge     <course> --locale <loc> <answers.json> … [--by claude]
  python3 tools/lang_facade.py roundtrip <course>
  python3 tools/lang_facade.py fields    <course>            (every registered field: count, chars, tier, kind)

extract    the master (English, inline in the course files) as a facade: facades/en/{core,<L>}.json,
           _phenomena/facades/en/<L>.json, _typology/facades/en.json + facades/en/facade.json. Every note is in it (the
           master is the translators' reference); --shown-only keeps only the notes an English native sees.
           The output is generated and reproducible: it is not committed (.gitignore).
parity     a locale facade against the master: every address present, nothing stale (src = hash of the master text),
           target-language runs preserved; counts per tier / field / language. A locale facade carries EVERY note (R1: the
           folded “From other languages” section is in the explanation language too); the locale's own notes and the
           type / branch / family notes are Tier 1, the notes for other languages Tier 3.
           Writes facades/<loc>/PARITY.md.
lint       the D19 rules: every text field is registered (tools/schemas/noema.langfacade.fields.json); general texts name
           no language outside the course (CLDR names: babel, else tools/i18n/langnames/<locale>.json) — provenance cues
           cues (from / borrowed / via / Proto- / Old …), older stages, varieties of the course languages (Egyptian,
           Cantonese, Swiss German), cuisine / plant / people adjectives (Welsh onion) and quoted glosses are exempt in every
           field, cognates in an etymology too unless they compare with a supported native; English-anchored explanations (“no ‘do’”, “-ing”, “is not ‘the’”) flagged; notes: `for`
           allowed, a note names only its own language, a type note none; every grammar page has the required notes
           (every supported native but the page's own language + type:fusional, type:agglutinating, type:isolating,
           type:polysynthetic, branch:Semitic); R2: notes and comparison-like texts use the structured Markdown subset
           (warnings: a long paragraph without structure, markup outside the subset). With --locale: the facade's texts and notes too.
task       translation chunks for Claude (instructions, the locale's glossary from i18n/glossary/, the items to translate);
           merge writes the answers ({address: text}) into the facade with the master's hash.
roundtrip  extract → strip every registered text → re-apply = byte-identical files (the parity of the English master).

Exit 0 when nothing is wrong (lint: no error; with --strict no warning either), 1 otherwise.
"""
import argparse, glob, hashlib, json, os, re, shutil, sys, tempfile, time
from collections import Counter, OrderedDict, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
def _first(*ps):
    return next((p for p in ps if os.path.exists(p)), ps[0])
# the repository (tools/schemas, tools/i18n) or the skill toolkit (schemas/ next to scripts/, scripts/i18n)
REG_PATH = _first(os.path.join(HERE, 'schemas', 'noema.langfacade.fields.json'), os.path.join(REPO, 'schemas', 'noema.langfacade.fields.json'))
NAMES_DIR = _first(os.path.join(HERE, 'i18n', 'langnames'), os.path.join(REPO, 'i18n', 'langnames'))
GLOSSARY_DIR = os.path.join(REPO, 'i18n', 'glossary')

MASTER = 'en'
SUPPORTED = ['en', 'el', 'ru', 'fr', 'ar', 'de', 'hi', 'zh', 'ja', 'it', 'es', 'sq', 'pt', 'tr']        # supported natives = the UI locales' languages
LOCALES = ['en', 'el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT', 'tr']
TYPES = ['fusional', 'agglutinating', 'isolating', 'polysynthetic']
REQUIRED_GROUPS = ['type:fusional', 'type:agglutinating', 'type:isolating', 'type:polysynthetic', 'branch:Semitic']
GROUP_PREFIXES = ('type:', 'branch:', 'family:')
TEXT_KINDS = ('gloss', 'prose', 'mixed')
REGISTER = {'el': 'εσύ', 'ru': 'ты', 'fr': 'tu', 'de': 'du', 'it': 'tu', 'es': 'tú', 'pt': 'tu (pt-PT)', 'sq': 'ti', 'hi': 'आप',
            'ja': 'です/ます', 'zh': '你', 'tr': 'sen', 'ar': 'أنت (Modern Standard Arabic, gender-neutral phrasing where possible)', 'en': 'you'}
TYPOGRAPHY = {'fr': 'a narrow no-break space (U+202F) before ? ! : ; and « » quotes', 'el': '; as the question mark and « » quotes',
              'ru': '« » quotes', 'de': '„…“ quotes', 'es': '¿…? ¡…! and « » or “ ” quotes', 'it': '« » or “ ” quotes',
              'pt': '« » or “ ” quotes', 'sq': '“ ” or « » quotes', 'ja': '「」 quotes, full-width punctuation',
              'zh': '“ ” quotes, full-width punctuation', 'ar': 'Arabic punctuation (، ؛ ؟)', 'hi': 'the danda । at sentence end is optional; standard Latin punctuation is fine',
              'tr': '“ ” or « » quotes; keep dotted/dotless i (İ i / I ı) exactly'}


def locale_lang(loc):
    """The language of a locale: ar-EG → ar, zh-Hant → zh, pt-PT → pt."""
    return (loc or '').split('-')[0].lower()


def text_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:12]


def shows(loc, for_):
    """Is a note for `for_` one of the locale's OWN notes (its language, or a type / branch / family)? — the notes of the
    first section “From your languages” for a learner of this language (§2.2). A locale facade carries ALL notes (R1: the
    folded third section “From other languages” is shown in the explanation language too); its own notes are Tier 1."""
    return isinstance(for_, str) and (for_ == locale_lang(loc) or for_.startswith(GROUP_PREFIXES))


def esc(seg):
    return str(seg).replace('~', '~0').replace('/', '~1')


def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()


def wjson(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: f.write(json.dumps(obj, ensure_ascii=False, indent=1) + '\n')


# ---------------------------------------------------------------- the registry
class Registry:
    def __init__(self, path=REG_PATH):
        self.raw = json.loads(rd(path))
        self.structural = set(self.raw.get('structuralKeys') or [])
        self.records = []
        for r in self.raw['records']:
            r = dict(r)
            r['at_t'] = tuple(s for s in r.get('at', '').split('/') if s)
            r['fields_c'] = [(tuple(f['path'].split('/')), f) for f in r['fields']]
            self.records.append(r)

    def field_rows(self):
        return [(r, f) for r in self.records for f in r['fields']]


def match(pat, tail):
    return len(pat) == len(tail) and all(p == '*' or p == str(t) for p, t in zip(pat, tail))


# ---------------------------------------------------------------- JSON with the span of every string value
TOK = re.compile(r'"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,"]+')


def string_spans(raw):
    """[(path, start, end)] of every string VALUE of a JSON text (object keys excluded); path = keys and indexes."""
    out, stack = [], []   # frames: [is_obj, key_or_index, want_key]
    for m in TOK.finditer(raw):
        t = m.group(); c = t[0]
        if c == '{': stack.append([True, None, True])
        elif c == '[': stack.append([False, 0, False])
        elif c in '}]': stack.pop()
        elif c == ':': stack[-1][2] = False
        elif c == ',':
            if stack[-1][0]: stack[-1][2] = True
            else: stack[-1][1] += 1
        elif c == '"':
            if stack and stack[-1][0] and stack[-1][2]: stack[-1][1] = json.loads(t)
            else: out.append((tuple(f[1] for f in stack), m.start(), m.end()))
    return out


def get_at(obj, path):
    for p in path:
        try: obj = obj[p]
        except (KeyError, IndexError, TypeError): return None
    return obj


def expand(obj, pat, pre=()):
    """Every (path, value) of obj matching a pattern of keys / '*'."""
    if not pat: yield pre, obj; return
    head, rest = pat[0], pat[1:]
    if head == '*':
        items = obj.items() if isinstance(obj, dict) else enumerate(obj) if isinstance(obj, list) else []
        for k, v in items: yield from expand(v, rest, pre + (k,))
    elif isinstance(obj, dict) and head in obj: yield from expand(obj[head], rest, pre + (head,))


# ---------------------------------------------------------------- the course's texts
class Text:
    __slots__ = ('addr', 'rec', 'field', 'pat', 'tier', 'kind', 'note', 'for_', 'prov', 'file', 'rel', 'span', 'text', 'facade', 'L', 'ptr')

    def __init__(self, **kw):
        for k, v in kw.items(): setattr(self, k, v)

    def where(self):
        return f'{self.rel} · {self.addr}'


def lib_of(course):
    return os.path.dirname(os.path.abspath(course))


def course_langs(course):
    try: c = json.loads(rd(os.path.join(course, 'course.json')))
    except (OSError, ValueError): return []
    langs = list(c.get('languages') or [])
    for d in sorted(glob.glob(os.path.join(course, 'lang', '*'))):
        L = os.path.basename(d)
        if os.path.isdir(d) and L not in langs: langs.append(L)
    return langs


def course_files(course, reg, langs=None):
    """[(scope, abs path, display path, L, [records])] — every file a record of the registry covers."""
    lib = lib_of(course); langs = langs or course_langs(course)
    found = OrderedDict()
    for r in reg.records:
        base = {'course': course, 'phenomena': os.path.join(lib, '_phenomena'), 'typology': os.path.join(lib, '_typology')}[r['scope']]
        pats = [(r['files'].replace('{L}', L), L) for L in langs] if '{L}' in r['files'] else [(r['files'], None)]
        for pat, L in pats:
            for p in sorted(glob.glob(os.path.join(base, pat))):
                if '/facades/' in p.replace(os.sep, '/'): continue
                key = os.path.abspath(p)
                if key not in found:
                    found[key] = [r['scope'], key, os.path.relpath(key, lib), L, []]
                found[key][4].append(r)
    return [tuple(v) for v in found.values()]


def facade_name(r, L):
    f = r['facade']
    return f.replace('{L}', L or '') if '{L}' in f else f


def fill_key(tpl, obj, L):
    def sub(m):
        k = m.group(1)
        if k == 'L': return L or ''
        v = obj.get(k) if isinstance(obj, dict) else None
        return esc(v) if isinstance(v, (str, int)) else '?'
    return re.sub(r'\{(\w+)\}', sub, tpl)


def scan_file(reg, scope, path, rel, L, recs, raw=None, structural_ok=True):
    """→ (texts, unregistered, raw) of one file."""
    raw = rd(path) if raw is None else raw
    obj = json.loads(raw)
    inst = {}   # prefix path → [(record, key)]
    for r in recs:
        for pre, val in expand(obj, r['at_t']):
            if isinstance(val, dict): inst.setdefault(pre, []).append((r, fill_key(r['key'], val, L)))
    texts, unreg = [], []
    for path, a, b in string_spans(raw):
        hit = None
        for k in range(len(path), -1, -1):
            for r, key in inst.get(path[:k], ()):
                tail = path[k:]
                for pat, f in r['fields_c']:
                    if match(pat, tail): hit = (r, key, tail, f, pat); break
                if hit: break
            if hit: break
        if not hit:
            keys = [p for p in path if isinstance(p, str)]
            if not (structural_ok and any(p in reg.structural for p in keys)):
                unreg.append((rel, '/'.join(esc(p) for p in path)))
            continue
        r, key, tail, f, pat = hit
        if f['kind'] not in TEXT_KINDS: continue
        text = json.loads(raw[a:b])
        if not text.strip(): continue
        for_ = None
        if f.get('note'):
            n = get_at(obj, path[:-1]); for_ = n.get('for') if isinstance(n, dict) else None
        texts.append(Text(addr=f'{r["prefix"]}:{key}/' + '/'.join(esc(p) for p in tail), rec=r['id'], field=f, pat='/'.join(pat),
                          tier=f.get('tier', 3), kind=f['kind'], note=bool(f.get('note')), for_=for_, prov=bool(f.get('provenance')),
                          file=path, rel=rel, span=(a, b), text=text, facade=(scope, facade_name(r, L)), L=L, ptr=path))
    return texts, unreg, raw


def collect(course, reg=None, langs=None):
    """Every registered text of a course (with the shared phenomena / typology files) and every unregistered string."""
    reg = reg or Registry()
    texts, unreg = [], []
    for scope, path, rel, L, recs in course_files(course, reg, langs):
        t, u, _ = scan_file(reg, scope, path, rel, L, recs)
        texts += t; unreg += u
    seen = Counter(t.addr for t in texts)
    dup = [a for a, n in seen.items() if n > 1]
    return texts, unreg, dup


# ---------------------------------------------------------------- facade files
def facade_file(course, loc, scope, name, out=None):
    lib = out or lib_of(course); cid = os.path.basename(os.path.abspath(course))
    if scope == 'course': return os.path.join(lib, cid, 'facades', loc, name + '.json') if out else os.path.join(course, 'facades', loc, name + '.json')
    if scope == 'phenomena': return os.path.join(lib, '_phenomena', 'facades', loc, name + '.json')
    return os.path.join(lib, '_typology', 'facades', loc + '.json')


def manifest_path(course, loc, out=None):
    cid = os.path.basename(os.path.abspath(course))
    return os.path.join(out, cid, 'facades', loc, 'facade.json') if out else os.path.join(course, 'facades', loc, 'facade.json')


def load_facade(course, loc, texts, out=None):
    """address → entry, over every facade file the course's texts can live in (+ the manifest, or None)."""
    entries, files = {}, set()
    for t in texts: files.add(facade_file(course, loc, *t.facade, out=out))
    for p in sorted(files):
        if os.path.exists(p):
            try: d = json.loads(rd(p))
            except ValueError as e: raise SystemExit(f'{p}: not valid JSON ({e})')
            for a, e in d.items():
                entries[a] = dict(e, _file=p)
    mp = manifest_path(course, loc, out)
    man = json.loads(rd(mp)) if os.path.exists(mp) else None
    return entries, man


def coverage(texts, entries):
    cov = {}
    for t in texts:
        c = cov.setdefault(str(t.tier), {'total': 0, 'done': 0, 'stale': 0, 'missing': 0})
        c['total'] += 1
        e = entries.get(t.addr)
        if not e: c['missing'] += 1
        elif e.get('src') != text_hash(t.text): c['stale'] += 1
        else: c['done'] += 1
    return dict(sorted(cov.items()))


def write_manifest(course, loc, texts, entries, status, notes, out=None):
    lib = out or lib_of(course)
    files = sorted({os.path.relpath(facade_file(course, loc, *t.facade, out=out), lib) for t in texts})
    man = {'format': 'noema.langfacade/v1', 'course': os.path.basename(os.path.abspath(course)), 'locale': loc, 'master': MASTER,
           'status': status, 'coverage': coverage(texts, entries), 'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'files': files, 'notes': notes}
    wjson(manifest_path(course, loc, out), man)
    return man


def for_locale(texts, loc, all_notes=True):
    """The texts a locale facade carries: every text, every note (R1). all_notes=False: only the locale's own notes."""
    return [t for t in texts if not t.note or all_notes or shows(loc, t.for_)]


def tier_of(t, loc):
    """A note for another language (the folded “From other languages” section, R1) is Tier 3 in a locale facade."""
    return 3 if t.note and loc != MASTER and not shows(loc, t.for_) else t.tier


def extract(course, loc=MASTER, all_notes=True, out=None, reg=None):
    """The master as a facade (all notes unless all_notes=False). → (texts, {file: entries})."""
    if loc != MASTER: raise SystemExit(f'extract writes the master ({MASTER}); a locale facade is made by translation tasks (task / merge)')
    texts, unreg, dup = collect(course, reg)
    if dup: raise SystemExit(f'two texts with one address (the registry key is not unique): {dup[:5]}')
    texts = for_locale(texts, loc, all_notes)
    files = OrderedDict()
    for t in texts:
        files.setdefault(facade_file(course, loc, *t.facade, out=out), OrderedDict())[t.addr] = {'t': t.text, 'src': text_hash(t.text), 'by': 'extract'}
    for p, d in files.items(): wjson(p, d)
    entries = {a: e for d in files.values() for a, e in d.items()}
    write_manifest(course, loc, texts, entries, 'on', ['*'] if all_notes else sorted({'en', 'type:*', 'branch:*', 'family:*'}), out)
    return texts, files


# ---------------------------------------------------------------- target-language runs (kept byte-identical in every locale)
SCRIPT_RUN = re.compile(r'[֐-׿יִ-ﭏ؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿'
                        r'㐀-䶿一-鿿豈-﫿　-〿]+(?:[ ‌‍]?[֐-׿יִ-ﭏ؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿㐀-䶿一-鿿豈-﫿]+)*')
LATIN_MARKED = re.compile(r"[A-Za-zʾʿ'’\-]*[À-ÖØ-öø-ɏḀ-ỿʾʿ][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿʾʿ'’\-]*")
STARRED = re.compile(r'\*[^\s,;.)\]]+')   # filtered by starred(): the Markdown emphasis of R2 is not a form
NUMBER = re.compile(r'\d+(?:[.,:]\d+)*')
WORD = re.compile(r"[^\W\d_]+(?:['’\-][^\W\d_]+)*")


def lang_forms(course, L):
    """Every form and lemma of the lexicon of L, lowercased (to recognise a table cell written in L)."""
    out = set()
    for p in glob.glob(os.path.join(course, 'lang', L, 'lexicon', '*.json')):
        try: d = json.loads(rd(p))
        except ValueError: continue
        for x in d.get('lexemes') or []:
            for v in [x.get('lemma')] + list((x.get('forms') or {}).values()):
                if isinstance(v, str):
                    for w in WORD.findall(v): out.add(w.lower())
    return out


def starred(s):
    """Wrong / reconstructed forms (*gegesst, *paʕala) — not the Markdown emphasis of R2 (**key**, *cited*)."""
    out = []
    for m in STARRED.finditer(s):
        a, b = m.start(), m.end()
        if (a and s[a - 1] == '*') or s[a + 1:a + 2] == '*': continue   # ** bold
        w = m.group().rstrip('*')
        if m.group().endswith('*') or s[b:b + 1] == '*': continue        # *italic*
        out.append(w)
    return out


# Words with diacritics that are ordinary English (loanwords, place names): a translation says them its own way (καφέ, χαλαπένιο)
LOANWORDS = set('''café cafés soirée soirées purée purées crèche crèches risqué frisée jalapeño jalapeños jícama jícamas yacón padrón yucatán
provençal provençale naïve naïvely naïveté façade façades résumé résumés cliché clichés entrée entrées fiancé fiancée déjà vu protégé rosé
sauté sautéed sautéing piñata piñatas piña señor señora señorita mañana pokémon brûlée crème flambé flambéed consommé pâté pâtés glacé
açaí éclair éclairs élite début décor voilà tête touché passé exposé appliqué lamé moiré matelassé crêpe crêpes bisqué bouillabaisse
canapé canapés négligée attaché première premières naïf coöperate zoölogy mêlée outré arête protégés dénouement détente émigré émigrés
communiqué blasé recherché divorcée habanero piñón piñones guaraná caña jalapeño ñandú tamalé chipotlé müsli muesli über doppelgänger
angström ångström gruyère emmentaler crème fraîche señorío são paulo bogotá méxico perú panamá yucatán córdoba málaga cádiz
québec montréal zürich düsseldorf köln münchen'''.split())
TRANSLIT = re.compile(r"[ʾʿʼʻāēīōūȳǖǎěǐǒǔǚǜḥḫṭṣḍẓṯḏġšžčřǧṛṇṃśẖḳṿḵṅḷḇḡḅṗṟṙṡṫẕḩ"
                      r"ĀĒĪŌŪǍĚǏǑǓḤḪṬṢḌẒṮḎĠŠŽČŘǦṚṆṂŚḲḴṄḶ]")
HYPHEN_EN = {'type', 'clause', 'like', 'style', 'form', 'forms', 'based', 'word', 'words', 'sound', 'pattern', 'verb', 'verbs', 'noun',
             'nouns', 'ending', 'endings', 'stem', 'construction', 'phrase', 'prefix', 'suffix', 'root', 'speaking', 'speakers', 'era', 'period'}
MARKED_CH = re.compile(r"[À-ÖØ-öø-ɏḀ-ỿʾʿ]")


def marked_run(w, L=None, forms=None, course=()):
    """A Latin word with a diacritic → the part every locale keeps (a transliteration, pinyin, a form of a Latin-script course
    language), or None: an English word or loanword (café, jalapeño, Yucatán) that a translation renders its own way."""
    w = w.strip("'’\"”“-")
    w = re.sub(r"['’]s$", '', w)                                    # Baṭṭūṭa’s → Baṭṭūṭa
    if '-' in w:                                                       # faʿīl-type, während-clause → the marked part
        parts = w.split('-')
        if all(MARKED_CH.search(x) or x.lower() in HYPHEN_EN for x in parts) and any(x.lower() in HYPHEN_EN for x in parts):
            w = '-'.join(x for x in parts if x.lower() not in HYPHEN_EN)
    if len(w) < 2 or not MARKED_CH.search(w): return None
    low = w.lower()
    if low in LOANWORDS or (low.endswith('s') and low[:-1] in LOANWORDS): return None
    if w[0].isupper() and low.endswith('ic') and TRANSLIT.search(w): return None   # Qurʾānic: an English adjective of a name
    if TRANSLIT.search(w): return w                                    # a transliteration (qaruba, faʿīl), pinyin with a macron or caron
    if forms and low in forms: return w                                # a form of a course language (während, Mädchen)
    if L and L in course: return w                                     # a text of a course language: its romanization (karóv, chá)
    return None


def runs(t, forms=None, course=(), all_forms=None):
    """The parts of a master text that every locale keeps byte-identical."""
    s = t.text
    marked = [marked_run(w, t.L, all_forms if all_forms is not None else forms, course) for w in LATIN_MARKED.findall(s)]
    out = SCRIPT_RUN.findall(s) + starred(s) + NUMBER.findall(s) + [w for w in marked if w]
    if t.kind == 'mixed' and forms:
        ws = WORD.findall(s)
        if ws and all(w.lower() in forms for w in ws): out.append(s.strip())   # a cell written in the language itself
    return [r for r in out if r.strip()]


def run_kept(r, text, loc=None):
    """A run is kept when it is in the translation byte for byte; a number may take the locale's separators (3,500 ↔ 3.500,
    2.5 ↔ 2,5): the digits stay identical."""
    if r in text: return True
    if NUMBER.fullmatch(r) and re.search(r'[.,]', r):
        digits = re.escape(r)
        alt = re.sub(r'\\[.,]|[.,]', '[.,\u00a0\u202f ]', digits)
        return re.search(r'(?<![\d.,])' + alt + r'(?![\d])', text) is not None
    return False


# ---------------------------------------------------------------- parity
def parity(course, loc, out=None, write=True, reg=None):
    texts, unreg, dup = collect(course, reg)
    entries, man = load_facade(course, loc, texts, out)
    all_notes = not man or man.get('notes') in (None, ['*'])   # R1: every facade carries every note
    want = for_locale(texts, loc, all_notes)
    by_addr = {t.addr: t for t in texts}
    forms = {L: lang_forms(course, L) for L in course_langs(course)}
    all_forms = set().union(*forms.values()) if forms else set()
    clangs = set(course_langs(course))
    rows = []   # (t, state, problem)
    for t in want:
        e = entries.get(t.addr)
        if not e: rows.append((t, 'missing', None)); continue
        if e.get('src') != text_hash(t.text): rows.append((t, 'stale', None)); continue
        lost = [r for r in runs(t, forms.get(t.L), clangs, all_forms) if not run_kept(r, e.get('t', ''), loc)]
        rows.append((t, 'broken' if lost else 'done', lost))
    orphans = sorted(a for a in entries if a not in by_addr)
    forbidden = sorted(a for a in entries if a in by_addr and by_addr[a].note and not all_notes and not shows(loc, by_addr[a].for_))
    res = {'locale': loc, 'course': os.path.basename(os.path.abspath(course)), 'addresses': len(want),
           'tiers': defaultdict(Counter), 'files': defaultdict(Counter), 'fields': defaultdict(Counter),
           'chars': defaultdict(int), 'orphans': orphans, 'forbidden': forbidden, 'unregistered': unreg, 'duplicates': dup,
           'problems': [(t.addr, st, lost) for t, st, lost in rows if st != 'done']}
    for t, st, lost in rows:
        fl = os.path.relpath(facade_file(course, loc, *t.facade, out=out), out or lib_of(course))
        for bucket, k in ((res['tiers'], str(tier_of(t, loc))), (res['files'], fl), (res['fields'], f'{t.rec}:{t.pat}')):
            bucket[k][st] += 1; bucket[k]['total'] += 1
        res['chars'][str(tier_of(t, loc))] += len(t.text)
    res['ok'] = not res['problems'] and not orphans and not forbidden and not unreg and not dup
    if write:
        p = os.path.join(os.path.dirname(manifest_path(course, loc, out)), 'PARITY.md')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f: f.write(parity_md(res))
        res['written'] = p
    return res


def parity_md(res, limit=60):
    def table(title, bucket):
        lines = [f'### {title}', '', '| | total | done | stale | missing | runs broken |', '|---|---:|---:|---:|---:|---:|']
        for k, c in sorted(bucket.items()):
            lines.append(f'| {k} | {c["total"]} | {c["done"]} | {c["stale"]} | {c["missing"]} | {c["broken"]} |')
        return lines + ['']
    tot = Counter()
    for c in res['tiers'].values(): tot.update(c)
    L = [f'# Facade parity — {res["course"]} · {res["locale"]}', '',
         f'Made by `python3 tools/lang_facade.py parity {res["course"]} --locale {res["locale"]}` '
         f'({time.strftime("%Y-%m-%d", time.gmtime())}). Contract: docs/language-packs.md §3.', '',
         f'**{tot["total"]} addresses** · done {tot["done"]} · stale {tot["stale"]} · missing {tot["missing"]} · target-language runs broken {tot["broken"]} · '
         f'orphans {len(res["orphans"])} · notes it cannot show {len(res["forbidden"])} · unregistered text fields {len(res["unregistered"])} · '
         f'duplicate addresses {len(res["duplicates"])} — **{"OK" if res["ok"] else "NOT OK"}**', '',
         'Characters of the master per tier: ' + ' · '.join(f'tier {k}: {v:,}' for k, v in sorted(res['chars'].items())), '']
    L += table('Per tier', res['tiers']) + table('Per file (language)', res['files']) + table('Per field', res['fields'])
    if res['problems']:
        L += ['### Problems (first %d)' % limit, '']
        for a, st, lost in res['problems'][:limit]: L.append(f'* `{a}` — {st}' + (f': lost {", ".join(map(repr, lost[:5]))}' if lost else ''))
        L.append('')
    for title, xs in (('Orphans (address not in the master)', res['orphans']), ('Notes this locale cannot show', res['forbidden']),
                      ('Unregistered text fields', [f'{a} {b}' for a, b in res['unregistered']]), ('Duplicate addresses', res['duplicates'])):
        if xs: L += [f'### {title} ({len(xs)})', ''] + [f'* `{x}`' for x in xs[:limit]] + ['']
    return '\n'.join(L)


# ---------------------------------------------------------------- language names (CLDR)
_NAMES = {}


def names_of(loc):
    """code → name of the language in the locale: babel (CLDR) if installed, else tools/i18n/langnames/<loc>.json."""
    if loc in _NAMES: return _NAMES[loc]
    out = {}
    try:
        from babel import Locale
        out = {k: v for k, v in Locale.parse(loc.replace('-', '_')).languages.items() if '_' not in k}
    except Exception:
        out = {}
    p = os.path.join(NAMES_DIR, loc + '.json')
    if os.path.exists(p):
        for k, v in json.loads(rd(p)).items(): out.setdefault(k, v)
    _NAMES[loc] = out
    return out


EN_EXTRA = {'Farsi': 'fa', 'Mandarin': 'zh', 'Old Norse': 'non', 'Proto-Indo-European': 'ine', 'Proto-Germanic': 'gem',
            'Proto-Slavic': 'sla', 'Proto-Semitic': 'sem', 'Romance': 'roa', 'Slavic': 'sla', 'Slavonic': 'sla', 'Turkic': 'trk',
            'Celtic': 'cel', 'Bantu': 'bnt', 'Uralic': 'urj', 'Finno-Ugric': 'urj', 'Scandinavian': 'gmq', 'Nordic': 'gmq',
            'Iranian': 'ira', 'Indo-Aryan': 'inc', 'Anglo-Saxon': 'ang', 'Castilian': 'es', 'Brazilian Portuguese': 'pt',
            'Ottoman Turkish': 'ota', 'Ottoman': 'ota', 'Sanskrit': 'sa', 'Aramaic': 'arc', 'Akkadian': 'akk', 'Phoenician': 'phn',
            'Syriac': 'syc', 'Coptic': 'cop', 'Egyptian': 'egy', 'Ge’ez': 'gez', "Ge'ez": 'gez', 'Ladino': 'lad', 'Nahuatl': 'nah',
            'Klingon': 'tlh', 'Mongol': 'mn'}
COURSE_ALIASES = {'zh': ['Mandarin', 'Putonghua', 'Chinese', 'Cantonese'], 'ar': ['Arabic'], 'he': ['Hebrew', 'Ivrit'], 'de': ['German']}
EN_SKIP = {'Afar', 'Mari', 'Tonga', 'Kongo', 'Venda', 'Sango', 'Komi', 'Luba', 'Interlingua', 'Interlingue', 'Ido', 'Ewe', 'Twi',
           'Fon', 'Ga', 'Yi', 'Root', 'Bini', 'Mono', 'Ossetic', 'Duala', 'Dinka', 'Fang', 'Herero', 'Kaje', 'Kako', 'Moksha', 'Nama', 'Fulah'}
NOT_A_LANGUAGE_AFTER = re.compile(r'^\s*(?:script|alphabet|letters?|characters?|transliteration|romanization|capitals?|punctuation|'
                                  r'digits?|numerals?|keyboard|type|font|text\b|print)', re.I)
INFLECTING = {'el', 'ru', 'de', 'it', 'es', 'pt', 'sq', 'fr'}
# Names of (mostly small) languages that are ordinary words of the locale: never matched as a language name there
LOCALE_STOP = {'el': {'βεγγαλικά', 'σαν', 'σένα', 'λάμπα', 'πάλι', 'κομ', 'γκα', 'τζου', 'μέρου', 'μέτα', 'κρι', 'μπαμπάρα', 'σάνγκο', 'μάνο', 'μόνο',
                      'τόνγκα', 'έουε', 'φον', 'ίντο', 'νάμα', 'φανγκ', 'μάρι', 'κόμι', 'λούμπα', 'ντουάλα'},
               'ru': {'га', 'фон', 'моно', 'коми', 'йи', 'идо'}, 'fr': {'ga', 'fon', 'mono', 'ido', 'yi', 'fang'},
               'de': {'ga', 'fon', 'mono', 'ido', 'yi'}, 'it': {'ga', 'fon', 'mono', 'ido', 'yi'}, 'es': {'ga', 'fon', 'mono', 'ido', 'yi'},
               'pt': {'ga', 'fon', 'mono', 'ido', 'yi'}, 'sq': {'ga', 'fon', 'mono', 'ido', 'yi'}}
LOCALE_CODE_FIX = {'el': {'den': 'sla', 'rm': 'roa'}}
VARIETY_CODES = {'zh': {'yue', 'wuu', 'hak', 'nan', 'cmn', 'hsn', 'gan', 'cdo', 'cjy', 'cpx', 'mnp', 'czh'},
                 'ar': {'arz', 'apc', 'acm', 'ary', 'aeb', 'arq', 'afb', 'ajp', 'ayl', 'apd', 'ars', 'acw', 'shu', 'abv', 'arb'},
                 'de': {'gsw', 'bar', 'nds', 'ksh', 'pfl', 'swg', 'sxu', 'vmf', 'pdc', 'ltz'}, 'he': {'hbo'}}
# what follows a name that makes it no language (Latin script, a French wrench, Gothic letters)
NOT_A_LANGUAGE_AFTER_LOC = {'el': re.compile(r'^\s*(?:(?:της|του|τους|των|τις|τα)\s+)?(?:αλφάβητ\w*|γραφ(?:ή|ής|ές|ών)\b|γράμμα\w*|γραμμάτων|χαρακτήρ\w*|μεταγραφ\w*|στοιχεί\w*|'
                                            r'κεφαλαί\w*|ψηφί\w*|αριθμ\w*|κλειδ\w*|πληκτρολόγι\w*|γραμματοσειρ\w*)', re.I)}
EL_ADJ = re.compile(r'^(.{3,}ικ|.{3,}ζικ|.{3,}σκ)(?:ά|α|ή|η|ό|ο)$')   # Ελληνικά, Λατινικά, Καντονέζικα → their stem
EL_ADJ_ENDINGS = r'(?:ά|α|ή|η|ής|ης|ό|ο|ού|ου|ών|ων|ές|ες|ές|οί|οι|ός|ος|ούς|ους|ών|ήν|ην)'


class NameMatcher:
    """Finds names of languages outside the course in a text of one locale. → [(code, name, start, end)]."""

    def __init__(self, loc, course_codes, allow=()):
        self.loc = locale_lang(loc) if loc not in LOCALES else loc
        names = names_of(loc)
        allow = set(allow) | set(course_codes)
        course_names = {n for c in course_codes for n in [names.get(c, '')] + (COURSE_ALIASES.get(c, []) if loc == 'en' else []) if n}
        cand = {}
        allow |= {v for c in course_codes for v in VARIETY_CODES.get(c, ())}   # Cantonese, Egyptian Arabic, Swiss German: the course's own
        for c, n in names.items():
            if c in allow or not n: continue
            if any(cn and cn.lower() in n.lower() for cn in course_names): continue   # “Egyptian Arabic”, “Swiss German”: a course language
            cand.setdefault(n, c)
        if loc == 'en':
            for n, c in EN_EXTRA.items():
                if c not in allow and n not in course_names: cand.setdefault(n, c)
            cand = {n: c for n, c in cand.items() if len(n) >= 4 or n == 'Lao'}
            for n in EN_SKIP: cand.pop(n, None)
            for c in allow:   # the course's own names (and the varieties of its languages) are never outside it
                for n in COURSE_ALIASES.get(c, []) + sorted(VARIETIES.get(c, ())): cand.pop(n, None)
            self.items = sorted(cand.items(), key=lambda x: -len(x[0]))
            self.rx = re.compile(r'(?<![\w-])(' + '|'.join(re.escape(n) for n, _ in self.items) + r')(?![\w-])') if self.items else None
            self.loose = re.compile(r'(?<!\w)(' + '|'.join(re.escape(n) for n, _ in self.items) + r')(?!\w)') if self.items else None   # Latin-based, Greek-derived
            self.code = dict(self.items)
            self.kind = 'en'
        else:
            pats = []
            lang = locale_lang(loc)
            stop = LOCALE_STOP.get(lang, set())
            for n, c in cand.items():
                low = n.lower()
                if low in stop: continue   # an ordinary word of the locale (el σαν, πάλι, λάμπα): not a name worth matching
                if lang == 'el':   # whole words: an adjectival name (Ελληνικά, Λατινικά) with its endings, any other name as written
                    m = EL_ADJ.match(low)
                    pats.append((low, c, n, (m.group(1) + EL_ADJ_ENDINGS) if m else re.escape(low)))
                    continue
                if lang in ('zh', 'ja'):
                    stems = {low} | ({low[:-1]} if len(low) > 2 and low[-1] in '语語文' else set())
                elif lang == 'ar':
                    s = re.sub(r'^ال', '', low); s = re.sub(r'(ية|ي)$', '', s); stems = {s} if len(s) >= 3 else {low}
                elif lang in INFLECTING and len(low) >= 6 and ' ' not in low:
                    stems = {low[:-2] if len(low) >= 8 else low[:-1]}
                else:
                    stems = {low}
                for s in stems: pats.append((s, c, n, None))
            pats.sort(key=lambda x: -len(x[0]))
            self.items = [(s, c, n) for s, c, n, _ in pats]
            if lang == 'el':   # whole-word matching (σαν ≠ Σαν, the Shan language; Κονγκ in Χονγκ Κονγκ ≠ Κονγκό)
                self.rx = re.compile(r'(?<!\w)(?:' + '|'.join(f'(?P<n{i}>{rx})' for i, (_, _, _, rx) in enumerate(pats)) + r')(?!\w)') if pats else None
                self.group_code = {f'n{i}': c for i, (_, c, _, _) in enumerate(pats)}
            else:
                body = '|'.join(re.escape(s) for s, _, _, _ in pats)
                if lang in ('zh', 'ja', 'ar', 'hi'): self.rx = re.compile('(' + body + ')') if pats else None
                else: self.rx = re.compile(r'(?<!\w)(' + body + r')\w*') if pats else None
                self.group_code = None
            fix = LOCALE_CODE_FIX.get(lang, {})   # a family adjective that CLDR gives to one small language (el Σλαβικά = Slave)
            if fix:
                pats = [(s_, fix.get(c, c), n, rx) for s_, c, n, rx in pats]
                if self.group_code: self.group_code = {g: fix.get(c, c) for g, c in self.group_code.items()}
            self.code = {s: c for s, c, _, _ in pats}
            self.after_rx = NOT_A_LANGUAGE_AFTER_LOC.get(lang)
            self.kind = 'stem'

    def find(self, text):
        if not self.rx: return []
        out = []
        src = text if self.kind == 'en' else text.lower()
        for m in self.rx.finditer(src):
            if getattr(self, 'group_code', None):
                if self.after_rx and self.after_rx.match(text[m.end():]): continue
                out.append((self.group_code[m.lastgroup], text[m.start():m.end()], m.start(), m.end())); continue
            n = m.group(1)
            if self.kind == 'en' and n == 'Latin' and NOT_A_LANGUAGE_AFTER.match(text[m.end():]): continue
            out.append((self.code.get(n), text[m.start():m.end()], m.start(), m.end()))
        return out


PROV_BEFORE = re.compile(r'\b(?:from|borrowed|borrowing|borrowings|loan|loans|loanword|loanwords|loan-word|via|through|calque[sd]?|calque of|derived|derives|'
                         r'adopted|taken|ultimately|origin|originally|coined|transmitted|entered|reached|inherited|descends?|goes back|went back|'
                         r'back to|came|comes|travelled|traveled|passed|influenced|influence|after|translation of|translates|translating|'
                         r'translated|matching|match of|renders?|rendering|modell?ed on|gave|spread|wanderword|doublet|followed|half|import of)\b[^.;:!?]*$', re.I)
PROV_AFTER = re.compile(r'^[\s\w/-]{0,12}?\b(?:origin|origins|original|loan|loans|loanword|loanwords|borrowing|borrowings|source|etymon|root|roots|'
                        r'name|names|nickname|word|words|term|terms|spelling|calque|etymology|past|history|form|forms|entry|entries|letters?|'
                        r'alphabet|script|kanji|plural|pronunciation|way|import|numbers|numerals|sound|in sound)\b', re.I)
COMPARE_BEFORE = re.compile(r'\b(?:cognate|cognates|compare[sd]?|cf\.?|like|unlike|as in|related to|same as|akin|similar|similarly|'
                            r'resembles?|equivalent|corresponds?|false friends?|also in|just as|different from|differs?|whereas|while in|'
                            r'speakers of|learners of|matches|shared with|cousin|cousins)\b[^.;:!?]*$', re.I)
SAME_SOURCE = re.compile(r'\bthe same\s+$', re.I)   # “the same Persian word”: one source, not a comparison
IS_FORM = re.compile(r'\b(?:is|are)\s+(?:the\s+|a\s+|an\s+)?$', re.I)   # “каперсы is the Greek κάππαρις”, “Cousine is French cousine”
PART_OF = re.compile(r'^\s+[^\s+]+(?:\s+\([^)]*\))?(?:\s+[^\s+]+)?\s*\+')   # Greek τῆλε + φωνή, Japanese 海苔 (nori) + Blatt
GLOSS_PAREN = re.compile(r'[^\x00-\x7f]\s*\(\s*$')   # 希腊人 (Greek)
OWN_SCRIPT_FORM = re.compile(r'^\s+[^\x00-\x7f]')
ARROW = re.compile(r'→|←|>\s*$|^\s*>')
# older stages and languages without living native speakers: naming them is etymology or history, never a comparison a learner could use
STAGE_WORDS = (r'Old|Middle|Ancient|Classical|Medieval|Mediaeval|Late|Early|Byzantine|Vulgar|Biblical|Koine|Koiné|Archaic|Imperial|'
               r'Babylonian|Assyrian|Mishnaic|Hellenistic|Ecclesiastical|Church|Scholarly|Botanical|Scientific|Neo')
STAGE_BEFORE = re.compile(r'(?:\b(?:Proto|Pre)-|\b(?:' + STAGE_WORDS + r')[\s-]+(?:\w+\s+)?)$')   # Old High …, Proto-…, Late Latin
STAGE_NAME = re.compile(r'^(?:(?:Proto|Pre)-|(?:' + STAGE_WORDS + r')\s)')
HISTORIC = {'Latin', 'Ancient Greek', 'Akkadian', 'Ugaritic', 'Phoenician', 'Punic', 'Sumerian', 'Elamite', 'Hittite', 'Gothic', 'Sanskrit',
            'Pali', 'Avestan', 'Ge’ez', "Ge'ez", 'Geez', 'Geʿez', 'Coptic', 'Egyptian', 'Ancient Egyptian', 'Syriac', 'Classical Syriac', 'Aramaic',
            'Old Norse', 'Anglo-Saxon', 'Ottoman', 'Ottoman Turkish', 'Old South Arabian', 'Sogdian', 'Parthian', 'Tocharian', 'Etruscan',
            'Oscan', 'Umbrian', 'Hebrew (Biblical)', 'Literary Chinese', 'Classical Chinese', 'Bactrian', 'Xianbei', 'Safaitic', 'Prussian'}
# a following word that shows the name is not about a language: cooking, plants, places, people (Welsh onion, Greek and Turkish families)
NOT_A_LANGUAGE_NOUN = re.compile(
    r'^(?:\s*(?:,|and|or|/)\s*[A-Z][\w-]+)*(?:\s+[a-z][\w-]+)?\s+(?:'
    r'cuisine|cooking|cookery|kitchen|kitchens|food|foods|dish|dishes|meal|meals|soup|soups|stew|curry|curries|salad|salads|'
    r'recipe|recipes|restaurant|restaurants|menu|menus|market|markets|shop|shops|bakery|bakeries|cafés?|bar|bars|breakfast|tea|teas|coffee|beer|wine|'
    r'liqueur|cheese|bread|laverbread|pastry|sweets|dessert|desserts|fries|aspic|borscht|horchata|style|variety|varieties|cultivar|cultivars|'
    r'vegetable|vegetables|plant|plants|leaf|leaves|greens|brassica|brassicas|fruit|fruits|tree|trees|flower|flowers|thistle|speciality|specialty|'
    r'cucumber|cucumbers|onion|onions|cabbage|cabbages|lettuce|mustard|radish|radishes|chives|garlic|leek|leeks|melon|melons|'
    r'pear|pears|plum|plums|cherry|cherries|lemon|lemons|lime|limes|orange|oranges|pepper|peppers|chili|chilli|chillies|pea|peas|'
    r'seaweed|seaweeds|spinach|cress|parsley|basil|mint|herbs?|spices?|rice|noodles|dumplings|bean|beans|lentils?|grain|'
    r'garden|gardens|church|churches|coast|coasts|island|islands|mountains?|valley|gulf|Gulf|sea|Sea|harbour|harbor|port|Guiana|Riviera|Alps|'
    r'empire|Empire|kings?|court|army|Academy|academy|city|cities|town|towns|village|villages|'
    r'people|peoples|families|family|themselves|traders?|merchants?|settlers?|immigrants?|cooks?|chefs?|farmers?|monks?|scholars?|botanists?|'
    r'tradition|traditions|custom|customs|festival|festivals|holiday|holidays|calendar|culture|art|music|carpets?|rugs?|'
    r'medicine|herbalists?|farming|growers?|scientists?|galleons|ships|sailors|explorers|Wikipedia|dashi|kimchi|symbolism|elegance|products)\b')
GRAMMAR_AFTER = re.compile(r'^\s*\b(?:has|had|have|is|uses|marks|puts|says|grammar|verbs?|nouns?|cases?|tenses?|speakers?|learners?)\b', re.I)
# varieties of the course languages (CLDR lists some as languages of their own): a variety of a course language is the course
VARIETIES = {'ar': {'Egyptian', 'Levantine', 'Gulf', 'Maghrebi', 'Moroccan', 'Najdi', 'Hejazi', 'Iraqi', 'Sudanese', 'Tunisian', 'Algerian',
                    'Libyan', 'Hassaniya', 'Hassaniyya', 'Yemeni', 'Palestinian', 'Syrian', 'Lebanese', 'Jordanian', 'Bedouin'},
             'de': {'Bavarian', 'Alemannic', 'Swabian', 'Colognian', 'Kölsch', 'Low German', 'Swiss German', 'Austrian German',
                    'Palatine German', 'Upper Saxon', 'Franconian', 'Walser'},
             'zh': {'Cantonese', 'Hakka', 'Hokkien', 'Teochew', 'Shanghainese', 'Min Nan', 'Min', 'Wu', 'Gan', 'Xiang', 'Jin',
                    'Taiwanese', 'Taiwanese Hokkien'},
             'he': {'Mishnaic Hebrew', 'Biblical Hebrew', 'Modern Hebrew'}}
NAME_EN = {'ar': 'Arabic', 'he': 'Hebrew', 'zh': 'Chinese', 'de': 'German', 'en': 'English', 'el': 'Greek', 'ru': 'Russian', 'fr': 'French',
           'hi': 'Hindi', 'ja': 'Japanese', 'it': 'Italian', 'es': 'Spanish', 'sq': 'Albanian', 'pt': 'Portuguese', 'tr': 'Turkish'}
SUPPORTED_NAMES = {NAME_EN[c] for c in SUPPORTED}


def _last(rx, s):
    m = None
    for m in rx.finditer(s): pass
    return m.start() if m else -1


def _clause(text, start, n=60):
    return re.split(r'[.;!?]', text[max(0, start - n):start])[-1]


def provenance_ok(text, start, end):
    """A language named as the source of a word (provenance, allowed in every field), not as a comparison.
    The cue nearest to the name decides: “Like English rice, it goes back to Greek ὄρυζα” — Greek is provenance."""
    before = _clause(text, start); after = text[end:]
    if SAME_SOURCE.search(before) and PROV_AFTER.match(after): return True          # the same Persian word
    if IS_FORM.search(before) and not COMPARE_BEFORE.search(before.split(',')[-1]): return True   # … is the Greek κάππαρις
    if PART_OF.match(after): return True                                            # a part of a compound
    if ARROW.search(text[max(0, start - 4):start]) or ARROW.search(after[:40].split('.')[0]): return True   # German Bier → Italian birra →
    p, c = PROV_BEFORE.search(before), COMPARE_BEFORE.search(before)
    if c and (not p or c.start() > p.start()) and not (p and _last(re.compile(r'\b(?:from|through|via|back to|borrowed)\b', re.I), before) > c.start()):
        return False
    return bool(p or PROV_AFTER.match(after))


def compared(text, start):
    before = re.split(r'[.;!?(]', text[max(0, start - 40):start])[-1]
    return bool(COMPARE_BEFORE.search(before))


def quoted(text, start, end):
    """A name inside quotes is a gloss or a cited phrase (יְוָנִי “Greek”, ‘England, English’), not a reference point."""
    before = text[max(0, start - 40):start]
    o = max(before.rfind('“'), before.rfind('‘'))
    c = max([m.start() for m in re.finditer(r'”|’(?!\w)', before)] or [-1])   # it’s: an apostrophe, not a closing quote
    return GLOSS_PAREN.search(before) is not None or (o > c and bool(re.match(r'^[^“‘]{0,40}?(?:”|’(?!\w))', text[end:])))


def historic(text, start, name):
    """An older stage (Proto-…, Old …, Middle …, Classical …) or a language without living native speakers (Latin, Akkadian …)."""
    return name in HISTORIC or bool(STAGE_NAME.match(name)) or bool(STAGE_BEFORE.search(text[max(0, start - 30):start]))


def exempt(text, start, end, name, course_codes=(), prov_field=False, own=None):
    """Why a name of a language in a text is NOT a comparison with that language (None: it is one, or may be).
    Shared by every field: provenance, older stages, varieties of the course languages, cuisine / plant / people adjectives,
    quoted glosses; in an etymology (prov_field) a language no learner has as a supported native (cognate with Tibetan)."""
    after = text[end:]
    for c in course_codes:   # a variety of a course language: Egyptian (Arabic), Bavarian (German), Cantonese
        if name in VARIETIES.get(c, ()): return 'variety'
        for n in [NAME_EN.get(c)] + COURSE_ALIASES.get(c, []):
            if n and re.match(r'\s+' + re.escape(n) + r'\b', after): return 'variety'
    if own and NAME_EN.get(own) and NAME_EN[own] in name: return 'own'      # Ottoman Turkish in a note for tr: the learner's own language
    if NOT_A_LANGUAGE_NOUN.match(after): return 'not a language'
    if quoted(text, start, end): return 'quoted'
    if provenance_ok(text, start, end): return 'provenance'
    if historic(text, start, name) and not GRAMMAR_AFTER.match(after): return 'etymology'
    if prov_field and (name not in SUPPORTED_NAMES or not compared(text, start)): return 'etymology'   # cognate with Tibetan; Japanese 海苔 (nori)
    return None


ANCHORED = [
    (re.compile(r"\b(?:no|not|never|without|instead of|rather than|is not|isn['’]t|are not|aren['’]t|has no|have no|there is no)\s+"
                r"[‘'\"“](?:the|a|an|do|does|did|was|were|will|shall|would|have|has|had|be|been|being|it|there is|there are|of|to|some|any|-ing|-ed|-s|’s|'s)[’'\"”]", re.I),
     'explains through an English grammar word (“no ‘do’”, “is not ‘the’”): say what the language does in its own terms'),
    (re.compile(r'(?<![\w.-])-ing\b(?!\.|\s*form of the|\s*\()', re.I), 'explains through the English “-ing” form'),   # not Dipl.-Ing.
    (re.compile(r'\b(?:was|were|is|are)\s*…\s*-ing\b|\b(?:was|were|is|are) \w+ing\b(?= form)', re.I), 'explains through an English tense form'),
    (re.compile(r'\bphrasal verbs?\b', re.I), 'explains through English phrasal verbs'),
    (re.compile(r'\b(?:do|does|did)-support\b|\bno [‘\'"“]?do[’\'"”]?\b(?! not)', re.I), 'explains through English “do”'),
]


# ---------------------------------------------------------------- R2: the structured Markdown subset of notes
# paragraphs (\n\n) · "- " / "1. " lists · **bold** (one or two) · *italic* · an example on its own line ("→ …" or a list item);
# no headings, links, HTML, tables or code (the app adds the language heading and the chip; it builds DOM nodes, never innerHTML)
STRUCT_LONG = 220
MD_FORBIDDEN = [
    (re.compile(r'(?m)^\s{0,3}#{1,6}\s'), 'a heading'),
    (re.compile(r'\[[^\]\n]+\]\([^)\s]+\)|https?://'), 'a link'),
    (re.compile(r'</?[A-Za-z][A-Za-z0-9]*(?:\s[^<>]*)?/?>'), 'HTML'),
    (re.compile(r'(?m)^\s*\|.*\|\s*$'), 'a table'),
    (re.compile(r'`'), 'code'),
]


def structure(text):
    """R2 → [(category, message)]: a long note squashed into one paragraph, markup outside the subset, too much bold."""
    out = []
    s = text or ''
    for rx, what in MD_FORBIDDEN:
        if rx.search(s): out.append(('markup', f'{what} in a note: the Markdown subset has paragraphs, "- " / "1. " lists, **bold**, *italic* and "→ " example lines only (R2)'))
    if len(s) > STRUCT_LONG and '\n' not in s.strip():
        out.append(('structure', f'{len(s)} characters in one paragraph: two or more points → a "- " list, a rule + its example → the example on its own line ("→ …"), paragraphs separated by a blank line (R2)'))
    if len(re.findall(r'\*\*[^*\n]+\*\*', s)) > 2: out.append(('structure', 'more than two **bold** parts: bold only the one key sentence or word (R2)'))
    return out


def anchored(text):
    return [msg for rx, msg in ANCHORED if rx.search(text)]


# ---------------------------------------------------------------- lint
class Finding:
    __slots__ = ('sev', 'cat', 'where', 'msg')

    def __init__(self, sev, cat, where, msg): self.sev, self.cat, self.where, self.msg = sev, cat, where, msg

    def line(self): return f'{self.where}: {self.msg}'

    def json(self): return {'severity': self.sev, 'category': self.cat, 'where': self.where, 'message': self.msg}


def typology_world(course):
    """(profiles {code: entry}, families, branches) of _typology/languages.json."""
    p = os.path.join(lib_of(course), '_typology', 'languages.json')
    try: ls = json.loads(rd(p))['languages']
    except (OSError, ValueError, KeyError): return {}, set(), set()
    return ({x['code']: x for x in ls}, {x.get('family') for x in ls if x.get('family')},
            {re.sub(r'\s*\(.*', '', x.get('branch') or '').strip() for x in ls if x.get('branch')})


def required_notes(L):
    """The `for` values every grammar page of language L must carry (top-level notes, §2.1)."""
    return [c for c in SUPPORTED if c != L] + REQUIRED_GROUPS


def lint(course, loc=None, texts=None, unreg=None, reg=None, langs=None):
    """→ [Finding]. sev: error (the registry) | warn (the D19 content rules) | info."""
    if texts is None: texts, unreg, dup = collect(course, reg, langs)
    else: dup = []
    langs = langs or course_langs(course)
    out = []
    F = lambda sev, cat, where, msg: out.append(Finding(sev, cat, where, msg))
    for rel, ptr in unreg or []: F('error', 'registry', rel, f'{ptr}: a text field not in tools/schemas/noema.langfacade.fields.json — register it with its kind')
    for a in dup: F('error', 'registry', a, 'two texts with one address')
    profiles, families, branches = typology_world(course)
    en = NameMatcher('en', langs)
    for t in texts:
        if t.note or t.field.get('structured') or t.pat.split('/')[-2:-1] in (['pitfalls'], ['subtleties'], ['funFacts']) or t.pat.endswith('profile/feeling'):
            for cat, msg in structure(t.text): F('warn', cat, t.where(), msg)   # R2: a structured Markdown subset
        if t.note:
            f = t.for_ or ''
            if f.startswith('type:'):
                if f[5:] not in TYPES: F('warn', 'note-for', t.where(), f'unknown type “{f[5:]}”')
            elif f.startswith('branch:'):
                if branches and f[7:] not in branches: F('warn', 'note-for', t.where(), f'unknown branch “{f[7:]}” (branches of _typology/languages.json)')
            elif f.startswith('family:'):
                if families and f[7:] not in families: F('warn', 'note-for', t.where(), f'unknown family “{f[7:]}”')
            elif f not in SUPPORTED:
                F('info', 'note-source', t.where(), f'a note for “{f}” (not a supported native): shown only in the folded “From other languages” section (R1)')
                continue   # not a learner's native: its names are not linted
            own = {f} if f in profiles or f in SUPPORTED else set()
            names = [n for n in en.find(t.text) if n[0] not in own and not exempt(t.text, n[2], n[3], n[1], langs, own=f)]
            if names:
                what = 'a type / branch / family note names no language' if f.startswith(GROUP_PREFIXES) else f'a note for {f} names only its own language and the course languages'
                F('warn', 'note-names', t.where(), f'{what}: {", ".join(sorted({n[1] for n in names}))}')
            continue
        names = [n for n in en.find(t.text) if not exempt(t.text, n[2], n[3], n[1], langs, prov_field=t.prov or t.pat.split('/')[-1] == 'use')]
        if t.kind == 'gloss':   # a gloss may BE about a language (Englisch = “English”, “I speak English”): only a comparison counts
            names = [n for n in names if compared(t.text, n[2])]
        if names:
            F('warn', 'names', t.where(), f'names a language outside the course ({", ".join(sorted({n[1] for n in names}))}): a comparison goes into a note for that language (profile.notes / notes), the general text says what the language does')
        if t.kind != 'gloss':   # a gloss translates (“be just …-ing”); an explanation must not lean on English grammar
            for msg in anchored(t.text): F('warn', 'anchored', t.where(), msg)
    # required notes on every grammar page (top-level notes)
    gfor = defaultdict(set); pages = {}
    for t in texts:
        if t.rec == 'grammar':
            key = t.addr.split('/')[0]; pages.setdefault(key, t)
            if t.note and len(t.ptr) == 3 and t.ptr[0] == 'notes': gfor[key].add(t.for_)
    for scope, path, rel, L, recs in course_files(course, reg or Registry(), langs):
        if not any(r['id'] == 'grammar' for r in recs): continue
        try: g = json.loads(rd(path))
        except ValueError: continue
        key = f'g:{L}:{g.get("function")}'
        have = {n.get('for') for n in g.get('notes') or [] if isinstance(n, dict) and isinstance(n.get('text'), str) and n['text'].strip()}
        miss = [c for c in required_notes(L) if c not in have]
        if miss: F('warn', 'required', f'{rel} · {key}', f'required notes missing (D19): {", ".join(miss)}')
    if loc and loc != MASTER: out += lint_facade(course, loc, texts)
    return out


def lint_facade(course, loc, texts):
    out = []
    entries, man = load_facade(course, loc, texts)
    if not entries: return [Finding('info', 'facade', loc, 'no facade for this locale yet')]
    by_addr = {t.addr: t for t in texts}
    nm = NameMatcher(loc, course_langs(course), allow={locale_lang(loc)})
    nm_all = NameMatcher(loc, course_langs(course))
    en = NameMatcher('en', course_langs(course))
    for a, e in entries.items():
        t = by_addr.get(a)
        if not t: continue
        named = set()
        for m in (en.loose.finditer(t.text) if en.loose else ()):   # Ancient Greek, Ottoman Turkish: also the language the stage is of
            named.add(en.code.get(m.group(1))); named.update(en.code.get(w) for w in m.group(1).split() if en.code.get(w))   # the languages the master text names (its own lint judges them): the translation names them too
        if t.note:
            th = [n for n in nm_all.find(e.get('t', '')) if n[0] not in named] if t.for_.startswith(GROUP_PREFIXES) else []
            if th: out.append(Finding('warn', 'facade-names', a, 'a type note names a language: ' + ', '.join(sorted({n[1] for n in th}))))
            continue
        hits = nm_all.find(e.get('t', '')) if not t.prov else [n for n in nm_all.find(e.get('t', '')) if n[0] != locale_lang(loc)]
        if t.prov: hits = []   # provenance in another language cannot be judged by cue words; the master's lint decides
        hits = [n for n in hits if n[0] not in named]
        if hits: out.append(Finding('warn', 'facade-names', a, f'names a language outside the course in a general text: {", ".join(sorted({n[1] for n in hits}))}'))
    return out


# ---------------------------------------------------------------- translation tasks
def glossary(loc):
    import csv
    rows = []
    for p in (os.path.join(GLOSSARY_DIR, loc + '.csv'), os.path.join(GLOSSARY_DIR, 'drafts', loc + '.csv')):
        if not os.path.exists(p): continue
        with open(p, encoding='utf-8', newline='') as f:
            for r in csv.DictReader(f):
                if r.get('source') and r.get('target') and not any(x[0] == r['source'] for x in rows):
                    rows.append([r['source'], r['target'], r.get('description', '')])
    return rows


def task_instructions(loc, course_langs_names):
    lang = locale_lang(loc)
    name = names_of('en').get(lang, lang)
    return '\n'.join([
        f'You translate the explanation texts of the language course into {name} ({loc}) — the language its learners speak natively (D19, docs/language-packs.md). '
        f'The course teaches {course_langs_names}; the master texts are written in English only as a vehicle.',
        '1. Translate and adapt: natural, idiomatic, concise; the way a good teacher who is a native speaker would explain it. '
        f'Address the learner with {REGISTER.get(lang, "the usual informal form")}. Typography: {TYPOGRAPHY.get(lang, "the locale’s usual quotes and punctuation")}.',
        '2. Target-language words stay byte-identical: Arabic, Hebrew, Chinese characters, German forms, transliterations, pinyin, *-marked wrong forms, numbers, '
        'the order of examples. Do not add, drop or change any of them.',
        '3. kind "gloss": a short translation of a meaning or a label (keep the parenthesised target words). kind "prose": an explanation. '
        'kind "mixed": a table cell / quiz option mixing target-language forms with labels — translate ONLY the label parts; a cell that is entirely target language stays as it is.',
        f'4. No language outside the course is a reference point. Never add English (or any other language) to a text; where the English master explains through '
        f'English grammar (“no ‘do’”, “-ing form”, “is not ‘the’”), say what the course language does in its own terms. {name} may be named only in the notes for “{lang}”.',
        f'5. Notes (items with "for"): a note for “{lang}” speaks to a native {name} speaker — adapt it freely and give its examples in {name} (in its own script); '
        'a type / branch note (type:…, branch:…) names no language at all; a note for another language (the folded section “From other languages”, R1) '
        'is translated faithfully and keeps that language\'s examples byte-identical.',
        '6. Use the glossary for the app’s terms. Keep the markup exactly (R2): line breaks, blank lines between paragraphs, "- " and "1. " list items, '
        '**bold**, *italic*, "→ " example lines, and ·, ‹ ›, ___ where they are.',
        '7. Answer with ONE JSON object {"<address>": "<translated text>"} containing every address of "items" and nothing else. '
        f'Then save it and run: python3 tools/lang_facade.py merge <course> --locale {loc} <answers.json> && python3 tools/lang_facade.py parity <course> --locale {loc}'])


def make_tasks(course, loc, tiers, only=None, max_chars=12000, out=None, reg=None):
    texts, unreg, dup = collect(course, reg)
    want = [t for t in for_locale(texts, loc) if tier_of(t, loc) in tiers]
    entries, man = load_facade(course, loc, texts)
    todo = [t for t in want if not (entries.get(t.addr) and entries[t.addr].get('src') == text_hash(t.text))]
    if only:
        todo = [t for t in todo if t.facade[1] == only or f'{t.facade[0][:2]}:{t.facade[1]}' == only or (only == 'typology' and t.facade[0] == 'typology')]
    groups = OrderedDict()
    for t in todo: groups.setdefault(t.facade, []).append(t)
    out = out or os.path.join(course, 'facades', loc, 'tasks')
    os.makedirs(out, exist_ok=True)
    langs = course_langs(course); en = names_of('en')
    ins = task_instructions(loc, ', '.join(en.get(L, L) for L in langs))
    gl = glossary(loc); written = []
    for (scope, name), ts in groups.items():
        chunk, size, k = [], 0, 0
        def flush():
            nonlocal chunk, size, k
            if not chunk: return
            k += 1
            fn = os.path.join(out, f'{loc}-t{"".join(map(str, sorted(tiers)))}-{scope[:2]}-{name}-{k:03d}.json')
            items = []
            for t in chunk:
                it = OrderedDict([('a', t.addr), ('kind', t.kind), ('tier', t.tier), ('text', t.text)])
                if t.note: it['for'] = t.for_
                if t.L: it['lang'] = t.L
                items.append(it)
            wjson(fn, OrderedDict([('format', 'noema.langfacade.task/v1'), ('course', os.path.basename(os.path.abspath(course))), ('locale', loc),
                                   ('tiers', sorted(tiers)), ('facade', f'{scope}:{name}'), ('chunk', k), ('instructions', ins), ('glossary', gl), ('items', items)]))
            written.append((fn, len(chunk), size)); chunk, size = [], 0
        for t in ts:
            if chunk and size + len(t.text) > max_chars: flush()
            chunk.append(t); size += len(t.text)
        flush()
    return written, len(todo)


def merge(course, loc, answer_files, by='claude', reg=None):
    texts, unreg, dup = collect(course, reg)
    by_addr = {t.addr: t for t in texts}
    files, n, bad = {}, 0, []
    for af in answer_files:
        ans = json.loads(rd(af))
        if isinstance(ans, dict) and 'items' in ans and isinstance(ans['items'], dict): ans = ans['items']
        for a, v in ans.items():
            t = by_addr.get(a)
            if not t: bad.append(f'{a}: not an address of the master'); continue
            txt = v.get('t') if isinstance(v, dict) else v
            if not isinstance(txt, str) or not txt.strip(): bad.append(f'{a}: empty'); continue
            p = facade_file(course, loc, *t.facade)
            if p not in files: files[p] = json.loads(rd(p)) if os.path.exists(p) else {}
            files[p][a] = {'t': txt, 'src': v.get('src', text_hash(t.text)) if isinstance(v, dict) else text_hash(t.text), 'by': by}
            n += 1
    order = {t.addr: i for i, t in enumerate(texts)}
    for p, d in files.items(): wjson(p, OrderedDict(sorted(d.items(), key=lambda kv: order.get(kv[0], 1 << 30))))
    entries, man = load_facade(course, loc, texts)
    write_manifest(course, loc, for_locale(texts, loc), entries, (man or {}).get('status', 'draft'), ['*'])
    return n, bad


# ---------------------------------------------------------------- round trip (strip → apply)
def ascii_style(raw):
    """Was this JSON written with ensure_ascii (non-ASCII letters as \\u escapes)?"""
    return raw.isascii() and bool(re.search(r'\\u[0-9a-fA-F]{4}', raw))


def rewrite(course, entries, blank=False, reg=None, langs=None, styles=None):
    """Write the facade's texts (or empty strings) into the course files at their addresses, keeping every other byte.
    styles: filled with {path: ensure_ascii} of every file written (apply_entries uses it to restore the same escapes)."""
    reg = reg or Registry(); changed = 0
    for scope, path, rel, L, recs in course_files(course, reg, langs):
        ts, _, raw = scan_file(reg, scope, path, rel, L, recs)
        asc = ascii_style(raw)
        if styles is not None: styles[path] = asc
        parts, last = [], 0
        for t in sorted(ts, key=lambda t: t.span[0]):
            if t.addr not in entries: continue
            a, b = t.span
            parts.append(raw[last:a]); parts.append('""' if blank else json.dumps(entries[t.addr]['t'], ensure_ascii=asc)); last = b
        if not parts: continue
        parts.append(raw[last:])
        new = ''.join(parts)
        if new != raw:
            with open(path, 'w', encoding='utf-8') as f: f.write(new)
            changed += 1
    return changed


def apply_entries(course, entries, reg=None, langs=None, styles=None):
    """Put texts back at addresses whose value is now an empty string (after strip)."""
    reg = reg or Registry(); changed = 0
    for scope, path, rel, L, recs in course_files(course, reg, langs):
        raw = rd(path); obj = json.loads(raw)
        inst = {}
        for r in recs:
            for pre, val in expand(obj, r['at_t']):
                if isinstance(val, dict): inst.setdefault(pre, []).append((r, fill_key(r['key'], val, L)))
        parts, last = [], 0; asc = (styles or {}).get(path, ascii_style(raw))
        for path_, a, b in string_spans(raw):
            if raw[a:b] != '""': continue
            for k in range(len(path_), -1, -1):
                done = False
                for r, key in inst.get(path_[:k], ()):
                    tail = path_[k:]
                    for pat, f in r['fields_c']:
                        if match(pat, tail):
                            addr = f'{r["prefix"]}:{key}/' + '/'.join(esc(p) for p in tail)
                            if addr in entries:
                                parts.append(raw[last:a]); parts.append(json.dumps(entries[addr]['t'], ensure_ascii=asc)); last = b
                            done = True; break
                    if done: break
                if done: break
        if not parts: continue
        parts.append(raw[last:])
        with open(path, 'w', encoding='utf-8') as f: f.write(''.join(parts))
        changed += 1
    return changed


def roundtrip(course, reg=None):
    """Copy the course (+ _phenomena, _typology) → extract the master → strip → apply → compare bytes. → (ok, report)."""
    reg = reg or Registry()
    lib = lib_of(course); cid = os.path.basename(os.path.abspath(course))
    tmp = tempfile.mkdtemp(prefix='facade-rt-')
    try:
        for d in (cid, '_phenomena', '_typology'):
            src = os.path.join(lib, d)
            if os.path.isdir(src): shutil.copytree(src, os.path.join(tmp, d), ignore=shutil.ignore_patterns('facades', '*.js'))
        c2 = os.path.join(tmp, cid)
        files_before = {p: rd(p) for _, p, _, _, _ in course_files(c2, reg)}
        out = os.path.join(tmp, '_out')
        texts, files = extract(c2, MASTER, all_notes=True, out=out, reg=reg)
        entries = {a: e for d in files.values() for a, e in d.items()}
        styles = {}
        n_strip = rewrite(c2, entries, blank=True, reg=reg, styles=styles)
        left, _, _ = collect(c2, reg)
        n_apply = apply_entries(c2, entries, reg=reg, styles=styles)
        diff = [os.path.relpath(p, tmp) for p, raw in files_before.items() if rd(p) != raw]
        ok = not diff and not left
        rep = (f'{len(texts)} texts in {len(files_before)} files · stripped {n_strip} files (left non-empty: {len(left)}) · '
               f're-applied {n_apply} files · byte-identical: {"yes" if not diff else "NO — " + ", ".join(diff[:5])}')
        return ok, rep
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------- CLI
def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['extract', 'parity', 'lint', 'task', 'merge', 'roundtrip', 'fields'])
    ap.add_argument('course')
    ap.add_argument('answers', nargs='*')
    ap.add_argument('--locale', default=None)
    ap.add_argument('--out', default=None)
    ap.add_argument('--shown-only', action='store_true')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--no-write', action='store_true')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--max', type=int, default=40)
    ap.add_argument('--tier', default='1')
    ap.add_argument('--lang', default=None)
    ap.add_argument('--max-chars', type=int, default=12000)
    ap.add_argument('--by', default='claude')
    a = ap.parse_args(argv)
    course = os.path.abspath(a.course.rstrip('/'))
    if not os.path.exists(os.path.join(course, 'course.json')): ap.error(f'{a.course}: not a course folder (course.json missing)')
    if a.locale and a.locale not in LOCALES: ap.error(f'--locale must be one of {", ".join(LOCALES)}')
    if a.cmd == 'extract':
        texts, files = extract(course, a.locale or MASTER, all_notes=not a.shown_only, out=a.out)
        tiers = Counter(t.tier for t in texts); chars = Counter()
        for t in texts: chars[t.tier] += len(t.text)
        print(f'✅ {len(texts)} texts → {len(files)} facade files ({", ".join(f"tier {k}: {tiers[k]} texts, {chars[k]:,} chars" for k in sorted(tiers))})')
        for p in files: print('  ', os.path.relpath(p))
        return 0
    if a.cmd == 'parity':
        if not a.locale: ap.error('parity needs --locale')
        r = parity(course, a.locale, out=a.out, write=not a.no_write)
        tot = Counter()
        for c in r['tiers'].values(): tot.update(c)
        print(f'{"✅" if r["ok"] else "❌"} {a.locale}: {tot["total"]} addresses · done {tot["done"]} · stale {tot["stale"]} · missing {tot["missing"]} · '
              f'runs broken {tot["broken"]} · orphans {len(r["orphans"])} · forbidden notes {len(r["forbidden"])} · unregistered {len(r["unregistered"])}'
              + (f' → {os.path.relpath(r["written"])}' if r.get('written') else ''))
        return 0 if r['ok'] or not a.strict else 1
    if a.cmd == 'lint':
        fs = lint(course, a.locale)
        if a.json: print(json.dumps([f.json() for f in fs], ensure_ascii=False, indent=1))
        else:
            by = defaultdict(list)
            for f in fs: by[(f.sev, f.cat)].append(f)
            for (sev, cat), xs in sorted(by.items(), key=lambda kv: ({'error': 0, 'warn': 1, 'info': 2}[kv[0][0]], kv[0][1])):
                print(f'{ {"error": "❌", "warn": "⚠️ ", "info": "ℹ️ "}[sev]} {cat}: {len(xs)}')
                for f in xs[:a.max]: print('    ', f.line())
                if len(xs) > a.max: print(f'     … {len(xs) - a.max} more')
            c = Counter(f.sev for f in fs)
            print(f'{"✅" if not c["error"] else "❌"} lint {os.path.basename(course)}{" · " + a.locale if a.locale else ""}: {c["error"]} error(s), {c["warn"]} warning(s), {c["info"]} note(s)')
        c = Counter(f.sev for f in fs)
        return 1 if c['error'] or (a.strict and c['warn']) else 0
    if a.cmd == 'task':
        if not a.locale or a.locale == MASTER: ap.error('task needs --locale (not en: the master is written, not translated)')
        tiers = {int(x) for x in a.tier.split(',')}
        written, n = make_tasks(course, a.locale, tiers, a.lang, a.max_chars, a.out)
        print(f'✅ {n} texts to translate → {len(written)} task file(s)')
        for fn, k, size in written[:a.max]: print(f'   {os.path.relpath(fn)}  ({k} items, {size:,} chars)')
        return 0
    if a.cmd == 'merge':
        if not a.locale or a.locale == MASTER: ap.error('merge needs --locale (not en)')
        n, bad = merge(course, a.locale, a.answers, a.by)
        for b in bad[:a.max]: print('❌', b)
        print(f'{"✅" if not bad else "⚠️ "} merged {n} text(s) into the {a.locale} facade; {len(bad)} refused')
        return 1 if bad else 0
    if a.cmd == 'roundtrip':
        ok, rep = roundtrip(course)
        print(('✅ ' if ok else '❌ ') + rep)
        return 0 if ok else 1
    if a.cmd == 'fields':
        texts, unreg, dup = collect(course)
        agg = OrderedDict()
        for t in texts:
            k = (t.rec, t.pat, t.tier, t.kind + (' note' if t.note else '')); c = agg.setdefault(k, [0, 0]); c[0] += 1; c[1] += len(t.text)
        for (r, p, tier, kind), (n, ch) in agg.items(): print(f'{r:10} {p:32} tier {tier}  {kind:11} {n:6} {ch:9,}')
        print(f'unregistered: {len(unreg)} · duplicate addresses: {len(dup)}')
        for u in unreg[:a.max]: print('  ', *u)
        return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
