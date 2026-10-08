#!/usr/bin/env python3
"""Cross-check a language course against reference dictionaries (docs/LANGUAGES.md §11).

  python3 tools/lang_refcheck.py <course-dir> [--lang de] [--json report.json] [--offline]

Source: Wiktionary, as extracted by kaikki.org (one small JSON file per word, cached in data/refcache/).
Checked per word: the part of speech exists, a meaning matches the concept, gender, every paradigm cell that
Wiktionary also lists (forms must be identical, vowel marks included), pinyin, measure words, traditional form.
Exit 1 when there is a discrepancy that the word does not explain in ref.override ({"cell or field": "reason"}).
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from langlib import nfc, cell_parts, strip_marks, has_marks, pinyin_split

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'refcache')
LANGNAME = {'de': 'German', 'ar': 'Arabic', 'he': 'Hebrew', 'zh': 'Chinese', 'el': 'Greek', 'ru': 'Russian', 'tr': 'Turkish', 'hi': 'Hindi',
            'fr': 'French', 'es': 'Spanish', 'it': 'Italian', 'en': 'English', 'pt': 'Portuguese', 'ja': 'Japanese'}
POS = {'NOUN': {'noun'}, 'PROPN': {'name'}, 'VERB': {'verb'}, 'ADJ': {'adj'}, 'ADV': {'adv'}, 'PRON': {'pron'}, 'DET': {'det', 'article'},
       'ADP': {'prep', 'postp', 'particle'}, 'CCONJ': {'conj'}, 'SCONJ': {'conj'}, 'NUM': {'num'}, 'PART': {'particle'}, 'CLF': {'classifier', 'character', 'counter'},
       'INTJ': {'intj'}}
TAG = {'NOM': 'nominative', 'ACC': 'accusative', 'GEN': 'genitive', 'DAT': 'dative', 'SG': 'singular', 'PL': 'plural', 'DU': 'dual',
       'DEF': 'definite', 'INDF': 'indefinite', 'CONST': 'construct', '1': 'first-person', '2': 'second-person', '3': 'third-person',
       'MASC': 'masculine', 'FEM': 'feminine', 'NEUT': 'neuter', 'PRS': 'present', 'PST': 'past', 'FUT': 'future', 'IND': 'indicative',
       'SBJV': 'subjunctive', 'IMP': 'imperative', 'NFIN': 'infinitive', 'PTCP': 'participle'}
CONFLICT = {'subjunctive', 'subjunctive-i', 'subjunctive-ii', 'imperative', 'possessed-form', 'construct', 'dual', 'informal', 'error-unrecognized-form',
            'obsolete', 'rare', 'alternative', 'romanization', 'canonical', 'table-tags', 'inflection-template', 'class', 'archaic', 'dialectal', 'jussive', 'energetic',
            'passive', 'participle', 'infinitive', 'preterite', 'future', 'past', 'present', 'plural', 'singular', 'non-past', 'singulative', 'collective', 'feminine', 'masculine', 'neuter'}


def kaikki_url(lang, w):
    return f"https://kaikki.org/dictionary/{LANGNAME[lang]}/meaning/{urllib.parse.quote(w[0])}/{urllib.parse.quote(w[:2])}/{urllib.parse.quote(w)}.jsonl"


def fetch(lang, word, offline=False):
    """All Wiktionary entries for a written word (cached). [] when Wiktionary has none."""
    word = nfc(word)
    os.makedirs(os.path.join(CACHE, lang), exist_ok=True)
    p = os.path.join(CACHE, lang, urllib.parse.quote(word, safe='') + '.json')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f: return json.load(f)
    if offline: return None
    out = []
    for attempt in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(kaikki_url(lang, word), headers={'User-Agent': 'noema-lite/1.0 (personal study app; refcheck)'}), timeout=40)
            out = [json.loads(l) for l in r.read().decode('utf-8').splitlines() if l.strip()]
            break
        except urllib.error.HTTPError as e:
            if e.code == 404: out = []; break
            time.sleep(1 + attempt)
        except Exception:
            time.sleep(1 + attempt)
    else:
        return None
    with open(p, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
    return out


def lookup_word(lang, lx):
    if lang == 'he' and lx.get('prefix'): return strip_marks(lang, lx['lemma']) + '־'   # Wiktionary files Hebrew prefixes as ו־, ב־ …
    if lang in ('ar', 'he'): return strip_marks(lang, lx['lemma'])
    if lang == 'zh': return lx.get('trad') or lx['lemma']
    return lx['lemma']


def entries_for(lang, lx, offline):
    es = fetch(lang, lookup_word(lang, lx), offline)
    if es is None: return None
    if not es and lang in ('ar', 'he'):   # Wiktionary titles many words by their full (plene) spelling: קישוא, עגבנייה
        for alt in dict.fromkeys(v for v in (lx.get('plene') or {}).values() if ' ' not in v or ' ' in lx['lemma']):
            es = fetch(lang, alt, offline) or []
            if es: break
    if lang == 'zh':   # the simplified page only redirects; read the traditional one too
        extra = []
        for e in fetch(lang, lx['lemma'], offline) or []:
            for r in e.get('redirects') or []:
                extra += fetch(lang, r, offline) or []
        es = es + extra
    return [e for e in es if e.get('pos') != 'soft-redirect']


def canonical(e):
    for f in e.get('forms', []):
        if 'canonical' in (f.get('tags') or []): return nfc(f['form'])
    a = (e.get('head_templates') or [{}])[0].get('args', {})
    return nfc(a.get('wv') or e.get('word', ''))


GMAP = {'m': 'MASC', 'f': 'FEM', 'n': 'NEUT'}
def genders_of(e):
    """Every gender Wiktionary gives the word (some nouns have two or three: der/die Paprika)."""
    out = set()
    for f in e.get('forms', []):
        t = f.get('tags') or []
        if 'canonical' in t:
            out |= {G for g, G in (('masculine', 'MASC'), ('feminine', 'FEM'), ('neuter', 'NEUT')) if g in t}
    for h in e.get('head_templates') or []:
        a = h.get('args', {})
        for k, v in a.items():
            if (k in ('g', 'g2', 'g3') or re.fullmatch(r'\d', k)) and str(v) in GMAP: out.add(GMAP[str(v)])
            for part in re.split(r'[,/]', str(v)) if k in ('1', 'g') else []:
                if part.strip() in GMAP: out.add(GMAP[part.strip()])
        exp = h.get('expansion', '')
        head = re.split(r'\(', exp, maxsplit=1)[0]
        out |= {GMAP[m] for m in re.findall(r'(?:^|\s)(m|f|n)(?=\s|$|,)', head)}
    return out
def gender_of(e):
    g = genders_of(e); return sorted(g)[0] if g else None


def want_tags(lang, lx, cell):
    """Wiktionary tags for one of our cells (and tags that must be absent)."""
    p = cell_parts(cell)[1:]
    want = set(TAG[t] for t in p if t in TAG)
    if lang == 'ar':
        if 'PRS' in p: want.discard('present'); want.add('non-past')
        if lx.get('class') == 'collective':
            # Wiktionary tags the whole table "collective"; the unit noun and its plural are "singulative"
            if 'COLL' in p: want |= {'collective'}; want.discard('singular')
            elif 'SG' in p: want |= {'collective', 'singulative'}; want.discard('singular')
            elif 'PL' in p: want |= {'collective', 'singulative', 'plural'}
    if lang == 'de' and 'NFIN' in p: want = {'infinitive'}
    if lang == 'de' and 'PST' in p and 'PTCP' not in p: want.discard('past'); want.add('preterite')
    return want


def check_lexeme(lang, lx, gloss, offline):
    """Every problem reads “<key>: <message>”; key = pos | meaning | gender | <cell> | pinyin | trad | measure.
    ref.override {"<key>": "reason"} accepts that difference (the reason is listed); "all" accepts every difference of the word."""
    res = _check(lang, lx, gloss, offline)
    ov = (lx.get('ref') or {}).get('override') or {}
    if isinstance(ov, dict) and ov:
        kept = []
        for p in res['problems']:
            key = p.split(': ')[0]
            if key in ov or 'all' in ov: res.setdefault('overridden', []).append(f'{p} — {ov.get(key) or ov.get("all")}')
            else: kept.append(p)
        res['problems'] = kept
    return res


def _check(lang, lx, gloss, offline):
    res = {'id': lx['id'], 'checked': [], 'unverified': [], 'problems': []}
    es = entries_for(lang, lx, offline)
    if es is None: res['unverified'].append('no network / not cached'); return res
    allowed = set(POS.get(lx['pos'], set()))
    if lang in ('zh', 'ja') and len(lx['lemma']) == 1: allowed.add('character')   # one-character words are filed as characters
    if lx.get('prefix'): allowed |= {'prefix', 'character'}
    if lx['pos'] == 'DET': allowed.add('pron')   # Wiktionary files many determiners (dieser, kein, mein …) as pronouns
    pos_ok = [e for e in es if e.get('pos') in allowed]
    if not pos_ok:
        (res['problems'] if es else res['unverified']).append(f'pos: Wiktionary has no {lx["pos"]} entry for “{lookup_word(lang, lx)}”' + (f' (it has: {sorted({e.get("pos") for e in es})})' if es else ''))
        return res
    lemma = nfc(lx['lemma'])
    same = [e for e in pos_ok if canonical(e) == lemma] if lang in ('ar', 'he') else pos_ok
    words = [w for w in re.split(r'[^a-z]+', (gloss or '').lower()) if len(w) > 2 and w not in ('the', 'and', 'definite', 'indefinite', 'article')]
    def means(e): return any(any(w in g.lower() for w in words) for s in e.get('senses', []) for g in s.get('glosses', []))
    meant = [e for e in (same or pos_ok) if means(e)] if words else (same or pos_ok)
    pool = meant or same or pos_ok
    if words and not meant: res['problems'].append(f'meaning: no Wiktionary meaning of “{lookup_word(lang, lx)}” mentions “{gloss}”')
    elif words: res['checked'].append('meaning')
    if lang in ('ar', 'he') and not same: res['unverified'].append(f'vowelled lemma “{lemma}” not found (Wiktionary: {sorted({canonical(e) for e in pos_ok})})')
    # gender
    if lx.get('gender'):
        gs = set().union(*[genders_of(e) for e in pool]) if pool else set()
        if gs and lx['gender'] not in gs: res['problems'].append(f'gender: {lx["gender"]}, Wiktionary says {"/".join(sorted(gs))}')
        elif gs: res['checked'].append('gender')
        else: res['unverified'].append('gender')
    # forms
    forms = [(nfc(f['form']).rstrip('־'), set(f.get('tags') or [])) for e in pool for f in e.get('forms', [])]
    PERS = {'first-person', 'second-person', 'third-person', 'singular', 'plural', 'masculine', 'feminine', 'neuter'}
    own = set().union(*[t & PERS for f, t in forms if f == lemma and 'nominative' in t]) if lx['pos'] == 'PRON' else set()
    for cell, ours in (lx.get('forms') or {}).items():
        want = want_tags(lang, lx, cell)
        if lx['pos'] == 'PRON':
            # Wiktionary shows the whole pronoun table on each pronoun: keep only the row of this pronoun
            if not own & {'first-person', 'second-person', 'third-person'}: res['unverified'].append(cell); continue   # its own row is missing or garbled
            want |= own
        if not want: res['unverified'].append(cell); continue
        # a pronoun's person, number and gender belong to the word itself, not to its cell (PRON;ACC of er = ihn)
        conflict = CONFLICT - ({'singular', 'plural', 'masculine', 'feminine', 'neuter'} - want if cell.startswith('PRON') else set())
        cands = {f for f, t in forms if want <= t and not ((t - want) & conflict)}
        if not cands: res['unverified'].append(cell); continue
        if lang in ('ar', 'he') and not any(has_marks(lang, c) for c in cands):
            # Wiktionary gives this cell only without vowel marks (often in full spelling): compare spellings
            mine = {strip_marks(lang, ours), nfc((lx.get('plene') or {}).get(cell, ''))}
            if mine & cands: res['checked'].append(cell)
            else: res['unverified'].append(f'{cell} (Wiktionary: {" / ".join(sorted(cands))} — give plene to compare)')
            continue
        if nfc(ours) in cands: res['checked'].append(cell)
        elif strip_marks(lang, ours) in {strip_marks(lang, c) for c in cands}: res['problems'].append(f'{cell}: “{ours}” — Wiktionary vowels it {" / ".join(sorted(cands))}')
        else: res['problems'].append(f'{cell}: “{ours}” — Wiktionary has {" / ".join(sorted(cands))}')
    # Chinese
    if lang == 'zh':
        pys = {re.sub(r'\s+', '', s.get('zh_pron', '')).lower() for e in pool for s in e.get('sounds', []) if 'Mandarin' in (s.get('tags') or []) and 'Pinyin' in (s.get('tags') or [])}
        mine = ''.join(pinyin_split(lx.get('pinyin', '')))
        if pys:
            if mine in {p.replace(',', '') for p in pys} or any(mine in re.split(r'[,;/]', p) for p in pys): res['checked'].append('pinyin')
            else: res['problems'].append(f'pinyin: “{lx.get("pinyin")}”, Wiktionary has {" / ".join(sorted(pys))}')
        else: res['unverified'].append('pinyin')
        if lx.get('trad'):
            trads = {e.get('word') for e in pool} | {f for f, t in forms if 'Traditional-Chinese' in t and 'nonstandard' not in t}
            if lx['trad'] in trads or lx['trad'] == lx['lemma']: res['checked'].append('trad')
            else: res['problems'].append(f'trad: traditional “{lx["trad"]}”, Wiktionary has {" / ".join(sorted(trads))}')
        if lx.get('measure'):
            text = ' '.join(g for e in pool for s in e.get('senses', []) for g in s.get('glosses', []) + s.get('raw_glosses', []))
            cls = set()
            for m in re.finditer(r'Classifiers?:\s*([^)]*)', text):
                for item in m.group(1).split(';'):
                    item = item.strip(); parts = item.split()
                    if not parts: continue
                    chars, tags = parts[0], parts[1:]
                    if not tags or 'm' in tags: cls |= set(chars.split('／'))
            if cls:
                miss = [c for c in lx['measure'] if c not in cls]
                if miss: res['problems'].append(f'measure: measure word(s) {"、".join(miss)} not listed by Wiktionary for Mandarin ({"、".join(sorted(cls))})')
                else: res['checked'].append('measure')
            else: res['unverified'].append('measure')
    return res


def run(root, only=None, offline=False):
    sys.path.insert(0, os.path.join(ROOT, 'engine'))
    def J(rel):
        p = os.path.join(root, rel)
        if not os.path.exists(p): return None
        with open(p, encoding='utf-8') as f: return json.load(f)
    course = J('course.json'); nodes = J('core/nodes.json')['nodes']
    gloss = {}
    for f in sorted(os.listdir(os.path.join(root, 'core', 'fields'))):
        for c in J(f'core/fields/{f}')['concepts']: gloss[c['id']] = c.get('gloss', '')
    report = {}
    for L in course['languages']:
        if only and L != only: continue
        if L not in LANGNAME: continue
        for n in nodes:
            d = J(f'lang/{L}/lexicon/{n["id"]}.json') or {}
            for lx in d.get('lexemes', []):
                g = gloss.get((lx.get('senses') or [''])[0], '') if lx.get('senses') else ''
                report[lx['id']] = check_lexeme(L, lx, g, offline)
    return report


def main(a):
    if not a: print(__doc__); sys.exit(2)
    only = a[a.index('--lang') + 1] if '--lang' in a else None
    rep = run(a[0], only, '--offline' in a)
    if '--json' in a:
        with open(a[a.index('--json') + 1], 'w', encoding='utf-8') as f: json.dump(rep, f, ensure_ascii=False, indent=1)
    bad = 0
    for lid, r in rep.items():
        mark = '❌' if r['problems'] else '✅'
        if r['problems']: bad += 1
        print(f'{mark} {lid}: checked {len(r["checked"])} · unverified {len(r["unverified"])}' + ''.join(f'\n     ❌ {p}' for p in r['problems']) + ''.join(f'\n     ↪ {p}' for p in r.get('overridden', [])))
    print(f'\n{"❌ " + str(bad) + " word(s) disagree with Wiktionary" if bad else "✅ no disagreement with Wiktionary"} ({len(rep)} words)')
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main(sys.argv[1:])
