#!/usr/bin/env python3
"""Shared helpers for the language courses (docs/LANGUAGES.md). The JavaScript twin is engine/langcore.js;
both are checked against the same vectors (tests/fixtures/lang-vectors.json)."""
import re, unicodedata

def nfc(s): return unicodedata.normalize('NFC', s)

# ---------- feature cells (UniMorph-style) ----------
CELL_POS = {'N', 'V', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'NUM', 'PART', 'CLF', 'AUX'}
TAGS = {
    # case
    'NOM', 'ACC', 'GEN', 'DAT', 'INS', 'LOC', 'VOC', 'ABL', 'ESS', 'PRT', 'COM', 'OBL', 'DIR',
    # number
    'SG', 'PL', 'DU', 'COLL',
    # gender / animacy
    'MASC', 'FEM', 'NEUT', 'ANIM', 'INAN',
    # person
    '1', '2', '3',
    # tense, aspect, mood, voice, finiteness
    'PRS', 'PST', 'FUT', 'IPFV', 'PFV', 'PRF', 'PROG', 'IND', 'SBJV', 'IMP', 'JUS', 'COND', 'ACT', 'PASS', 'MID', 'NFIN', 'PTCP', 'MSDR',
    # definiteness, state
    'DEF', 'INDF', 'CONST',
    # politeness, comparison, misc
    'INFM', 'FORM', 'POL', 'CMPR', 'SPRL', 'ALT', 'NEG', 'POSS',
}
UD_POS = {'NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ', 'SCONJ', 'NUM', 'PART', 'INTJ', 'CLF', 'X'}

def cell_parts(cell): return [x for x in str(cell).split(';') if x]
def canon(cell):
    """'V;PRS;IND;3;SG;FEM' → 'V;3;FEM;IND;PRS;SG' (POS first, the rest sorted) — the order of tags never matters."""
    p = cell_parts(cell)
    return ';'.join(p[:1] + sorted(p[1:])) if p else ''
def cell_errors(cell, extra=()):
    p = cell_parts(cell)
    if not p: return ['empty cell']
    out = []
    if p[0] not in CELL_POS: out.append(f'unknown part of speech “{p[0]}” (one of {", ".join(sorted(CELL_POS))})')
    for t in p[1:]:
        if t not in TAGS and t not in extra: out.append(f'unknown tag “{t}”')
    if len(set(p)) != len(p): out.append('repeated tag')
    return out
def cell_has(cell, tags): return all(t in cell_parts(cell) for t in tags)

# ---------- vowel marks (Arabic ḥarakāt, Hebrew niqqud) ----------
AR_MARKS = set(range(0x064B, 0x0653)) | {0x0670}          # tanwīn, short vowels, šadda, sukūn, dagger alif
HE_MARKS = set(range(0x0591, 0x05BE)) | {0x05BF, 0x05C1, 0x05C2, 0x05C4, 0x05C5, 0x05C7}   # cantillation + points (not maqaf 05BE, not sof pasuq 05C3)
def marks_of(lang): return AR_MARKS if lang == 'ar' else HE_MARKS if lang == 'he' else set()
def strip_marks(lang, s):
    """The unvocalized spelling: remove the vowel marks (and turn alif waṣla into a plain alif)."""
    m = marks_of(lang)
    out = ''.join(ch for ch in nfc(s) if ord(ch) not in m)
    if lang == 'ar': out = out.replace('ٱ', 'ا')
    return out
def has_marks(lang, s): m = marks_of(lang); return any(ord(ch) in m for ch in s)
def letters(s): return [ch for ch in s if unicodedata.category(ch).startswith('L')]

# ---------- Chinese ----------
def is_han(ch):
    o = ord(ch)
    return 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or 0x20000 <= o <= 0x2EBEF or 0xF900 <= o <= 0xFAFF
TONE_MARKS = {'ā': ('a', 1), 'á': ('a', 2), 'ǎ': ('a', 3), 'à': ('a', 4), 'ē': ('e', 1), 'é': ('e', 2), 'ě': ('e', 3), 'è': ('e', 4),
              'ī': ('i', 1), 'í': ('i', 2), 'ǐ': ('i', 3), 'ì': ('i', 4), 'ō': ('o', 1), 'ó': ('o', 2), 'ǒ': ('o', 3), 'ò': ('o', 4),
              'ū': ('u', 1), 'ú': ('u', 2), 'ǔ': ('u', 3), 'ù': ('u', 4), 'ǖ': ('ü', 1), 'ǘ': ('ü', 2), 'ǚ': ('ü', 3), 'ǜ': ('ü', 4)}
MARK_OF = {(v, t): m for m, (v, t) in TONE_MARKS.items()}
FINALS = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er', 'i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing',
          'iong', 'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng', 'ü', 'üe', 'üan', 'ün', 'ue']
_SYL = re.compile(r'^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(' + '|'.join(sorted(FINALS, key=len, reverse=True)) + r')$')
def pinyin_split(s): return [x for x in re.split(r"[\s']+", nfc(s).strip().lower()) if x]
def pinyin_tone(syl):
    """'luó' → ('luo', 2); 'bo' → ('bo', 5). Error text instead of a tuple when there are two tone marks."""
    base, tone = '', 5
    for ch in nfc(syl).lower():
        if ch in TONE_MARKS:
            if tone != 5: return 'two tone marks'
            v, tone = TONE_MARKS[ch]; base += v
        else: base += 'ü' if ch == 'v' else ch
    return base, tone
def mark_position(base):
    """Index of the vowel that carries the tone mark: a or e, else the o of ou, else the last vowel."""
    for v in 'ae':
        if v in base: return base.index(v)
    if 'ou' in base: return base.index('o')
    for i in range(len(base) - 1, -1, -1):
        if base[i] in 'iouü': return i
    return -1
def pinyin_syllable_errors(syl):
    r = pinyin_tone(syl)
    if isinstance(r, str): return [f'“{syl}”: {r}']
    base, tone = r
    m = _SYL.match(base)
    if not m: return [f'“{syl}” is not a pinyin syllable']
    ini, fin = m.group(1) or '', m.group(2)
    err = []
    if ini in ('j', 'q', 'x') and not (fin.startswith('i') or fin.startswith('u')) : err.append(f'“{syl}”: j/q/x go only with i or u (= ü)')
    if ini in ('j', 'q', 'x', 'y') and fin.startswith('ü'): err.append(f'“{syl}”: after {ini} write u, not ü')
    if ini in ('g', 'k', 'h', 'f', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's') and (fin.startswith('i') and fin != 'i' or fin.startswith('ü')): err.append(f'“{syl}”: impossible after {ini}')
    if ini in ('g', 'k', 'h', 'f') and fin == 'i': err.append(f'“{syl}”: impossible after {ini}')
    if fin == 'er' and ini: err.append(f'“{syl}”: er takes no initial')
    if not ini and fin not in ('a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'er'): err.append(f'“{syl}”: write it with y- or w-')
    if tone != 5:
        want = mark_position(base)
        got = next((i for i, ch in enumerate(nfc(syl).lower()) if ch in TONE_MARKS), -1)
        if want != got: err.append(f'“{syl}”: the tone mark belongs on “{base[want]}”')
    return err
def pinyin_numbers_to_marks(s):
    """'hu2 luo2 bo5' / 'lv4' → 'hú luó bo' / 'lǜ'."""
    out = []
    for syl in pinyin_split(s):
        m = re.match(r'^([a-zü:v]+)([0-5])?$', syl)
        if not m: out.append(syl); continue
        base = m.group(1).replace('u:', 'ü').replace('v', 'ü'); t = int(m.group(2) or 5)
        if t in (0, 5): out.append(base); continue
        i = mark_position(base)
        out.append(base[:i] + MARK_OF[(base[i], t)] + base[i + 1:] if i >= 0 else base)
    return ' '.join(out)
def pinyin_marks_to_numbers(s):
    out = []
    for syl in pinyin_split(s):
        r = pinyin_tone(syl); out.append(syl if isinstance(r, str) else r[0] + str(r[1]))
    return ' '.join(out)

# ---------- sentences ----------
def join_tokens(tokens, how):
    """The written sentence from its tokens: 'space' (words separated, punctuation attached to the word before;
    p: 'open' attaches to the word after) or 'none' (Chinese)."""
    out, glue_next = '', True
    for k in tokens:
        t = k['t']
        if how == 'none' or not out or glue_next or k.get('p') is True: out += t
        else: out += ' ' + t
        glue_next = k.get('p') == 'open'
    return out
def cap_first(s): return s[:1].upper() + s[1:]
