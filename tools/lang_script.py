#!/usr/bin/env python3
"""Script modules of the language courses (docs/LANGUAGES.md §4.9, §5.5, §6.1) — build and check.

  python3 tools/lang_script.py build <course-dir> [--lang ar|he|zh] [--offline]
  python3 tools/lang_script.py check <course-dir>

Writes reference data (not course content):
  lang/ar/script.json   the Arabic alphabet: every letter with its name, sound, transliteration (the course's DIN 31635-like
                        scheme), its positional forms and how it joins (derived from the Unicode presentation forms: a letter
                        without an initial form does not connect to the next one), sun / moon letters, the hamza seats,
                        tāʾ marbūṭa, alif maqṣūra, alif waṣla, the lām-alif ligature, the vowel marks, teaching groups, look-alikes
  lang/he/script.json   the Hebrew alphabet: every letter (with dagesh where it changes the sound, shin / sin), the five final
                        forms, sounds, transliteration (the course's simple scheme), the niqqud, teaching groups, look-alikes
  lang/zh/chars.json    every character of the course's Chinese words: readings (Make Me a Hanzi + the readings the words use),
                        meaning, decomposition (IDS), radical, etymology hint, the traditional form(s) the words use, stroke
                        medians (Make Me a Hanzi graphics.txt, for tracing and stroke order)
Source of the Chinese data: https://github.com/skishore/makemeahanzi (dictionary.txt from Unihan / CJKlib, LGPL;
graphics.txt from the Arphic PL fonts, Arphic Public License), cached in data/refcache/makemeahanzi/.
`check` is what tools/validate_lang.py runs on every course language that has a script module.
"""
import json, os, sys, unicodedata, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from langlib import nfc, strip_marks, marks_of, is_han, pinyin_split, pinyin_tone, pinyin_syllable_errors

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MMAH = os.path.join(ROOT, 'data', 'refcache', 'makemeahanzi')
MMAH_URL = 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/'
ZWJ = '‍'

# ---------- Arabic ----------
# (letter, name, transliteration, sound (IPA, Modern Standard Arabic), sun letter, note)
AR_LETTERS = [
    ('ا', 'ʾalif', 'ā', 'aː', False, 'a long ā; also the seat of a hamza (أ إ) and the silent alif of hamzat al-waṣl'),
    ('ب', 'bāʾ', 'b', 'b', False, ''),
    ('ت', 'tāʾ', 't', 't', True, ''),
    ('ث', 'ṯāʾ', 'ṯ', 'θ', True, ''),
    ('ج', 'jīm', 'j', 'd͡ʒ', False, 'said ʒ or ɡ in some regions'),
    ('ح', 'ḥāʾ', 'ḥ', 'ħ', False, 'a voiceless h from the throat'),
    ('خ', 'ḫāʾ', 'ḫ', 'x', False, ''),
    ('د', 'dāl', 'd', 'd', True, ''),
    ('ذ', 'ḏāl', 'ḏ', 'ð', True, ''),
    ('ر', 'rāʾ', 'r', 'r', True, 'a rolled or tapped r'),
    ('ز', 'zāy', 'z', 'z', True, ''),
    ('س', 'sīn', 's', 's', True, ''),
    ('ش', 'šīn', 'š', 'ʃ', True, ''),
    ('ص', 'ṣād', 'ṣ', 'sˤ', True, 'emphatic (pharyngealized) s'),
    ('ض', 'ḍād', 'ḍ', 'dˤ', True, 'emphatic d'),
    ('ط', 'ṭāʾ', 'ṭ', 'tˤ', True, 'emphatic t'),
    ('ظ', 'ẓāʾ', 'ẓ', 'ðˤ', True, 'emphatic ḏ'),
    ('ع', 'ʿayn', 'ʿ', 'ʕ', False, 'a voiced sound from the throat'),
    ('غ', 'ġayn', 'ġ', 'ɣ', False, ''),
    ('ف', 'fāʾ', 'f', 'f', False, ''),
    ('ق', 'qāf', 'q', 'q', False, 'a k from far back in the throat'),
    ('ك', 'kāf', 'k', 'k', False, ''),
    ('ل', 'lām', 'l', 'l', True, ''),
    ('م', 'mīm', 'm', 'm', False, ''),
    ('ن', 'nūn', 'n', 'n', True, ''),
    ('ه', 'hāʾ', 'h', 'h', False, ''),
    ('و', 'wāw', 'w', 'w', False, 'also the long vowel ū'),
    ('ي', 'yāʾ', 'y', 'j', False, 'also the long vowel ī'),
    ('ء', 'hamza', 'ʾ', 'ʔ', False, 'the glottal stop on its own (on the line)'),
    ('أ', 'hamza on alif', 'ʾ', 'ʔ', False, 'hamza with a or u'),
    ('إ', 'hamza under alif', 'ʾ', 'ʔ', False, 'hamza with i'),
    ('آ', 'alif madda', 'ʾā', 'ʔaː', False, 'hamza + long ā'),
    ('ؤ', 'hamza on wāw', 'ʾ', 'ʔ', False, ''),
    ('ئ', 'hamza on yāʾ', 'ʾ', 'ʔ', False, 'written without dots'),
    ('ة', 'tāʾ marbūṭa', 'a', 'a', False, 'only at the end of a word; said -a in pause, -at before an ending or in a construct'),
    ('ى', 'alif maqṣūra', 'ā', 'aː', False, 'only at the end of a word: a long ā written like a yāʾ without dots'),
    ('ٱ', 'alif waṣla', '', '', False, 'the alif of hamzat al-waṣl: silent inside a sentence'),
]
AR_FINAL_ONLY = {'ى'}   # Unicode gives alif maqṣūra initial / medial forms for other languages (Uighur); in Arabic it ends a word
AR_LIGATURES = [('لا', 'lām-alif', 'lā', 'laː', 'lām followed by alif is always written as one sign')]
# (mark, name, transliteration, what it does, kind)  kind: vowel (one per letter) · shadda (with a vowel) · other
AR_MARKS = [
    ('َ', 'fatḥa', 'a', 'short a', 'vowel'), ('ِ', 'kasra', 'i', 'short i', 'vowel'), ('ُ', 'ḍamma', 'u', 'short u', 'vowel'),
    ('ْ', 'sukūn', '', 'no vowel after the letter', 'vowel'), ('ّ', 'šadda', '(double)', 'the letter is doubled', 'shadda'),
    ('ً', 'tanwīn fatḥ', 'an', '-an (indefinite accusative)', 'vowel'), ('ٍ', 'tanwīn kasr', 'in', '-in (indefinite genitive)', 'vowel'),
    ('ٌ', 'tanwīn ḍamm', 'un', '-un (indefinite nominative)', 'vowel'), ('ٰ', 'dagger alif', 'ā', 'a long ā written above the letter (هٰذَا)', 'vowel'),
]
AR_GROUPS = [
    ('ar.g1', 'Alif and the “tooth” letters', 'ا ب ت ث ن ي'),
    ('ar.g2', 'The short vowels, sukūn and šadda', 'َ ِ ُ ْ ّ'),
    ('ar.g3', 'The “cup” letters', 'ج ح خ'),
    ('ar.g4', 'Letters that never join the next one', 'د ذ ر ز و'),
    ('ar.g5', 'The “wave” and “loop” letters', 'س ش ص ض'),
    ('ar.g6', 'Upright and “eye” letters', 'ط ظ ع غ'),
    ('ar.g7', 'The rest of the alphabet', 'ف ق ك ل م ه'),
    ('ar.g8', 'Hamza, tāʾ marbūṭa, alif maqṣūra, lām-alif, tanwīn', 'ء أ إ آ ؤ ئ ة ى ٱ لا ً ٍ ٌ ٰ'),
]
AR_LOOKALIKES = ['ب ت ث ن ي', 'ج ح خ', 'د ذ', 'ر ز', 'س ش', 'ص ض', 'ط ظ', 'ع غ', 'ف ق', 'ه ة', 'ى ي', 'ا أ إ آ', 'و ؤ', 'د ر']

# ---------- Hebrew ----------
# (letter, name, transliteration (the course's simple scheme), sound (IPA, Modern Hebrew), note)
HE_LETTERS = [
    ('א', 'alef', "'", 'ʔ', 'often silent; carries a vowel'),
    ('בּ', 'bet', 'b', 'b', 'with dagesh'), ('ב', 'vet', 'v', 'v', 'without dagesh'),
    ('ג', 'gimel', 'g', 'ɡ', ''), ('ד', 'dalet', 'd', 'd', ''),
    ('ה', 'he', 'h', 'h', 'silent at the end of a word'),
    ('ו', 'vav', 'v', 'v', 'also the vowels וּ u and וֹ o'),
    ('ז', 'zayin', 'z', 'z', ''), ('ח', 'chet', 'ch', 'χ', ''), ('ט', 'tet', 't', 't', ''), ('י', 'yod', 'y', 'j', 'also part of the vowels i, e'),
    ('כּ', 'kaf', 'k', 'k', 'with dagesh'), ('כ', 'khaf', 'ch', 'χ', 'without dagesh'),
    ('ל', 'lamed', 'l', 'l', ''), ('מ', 'mem', 'm', 'm', ''), ('נ', 'nun', 'n', 'n', ''), ('ס', 'samekh', 's', 's', ''),
    ('ע', 'ayin', "'", 'ʔ', 'often silent in Modern Hebrew'),
    ('פּ', 'pe', 'p', 'p', 'with dagesh'), ('פ', 'fe', 'f', 'f', 'without dagesh'),
    ('צ', 'tsadi', 'ts', 't͡s', ''), ('ק', 'qof', 'k', 'k', ''), ('ר', 'resh', 'r', 'ʁ', ''),
    ('שׁ', 'shin', 'sh', 'ʃ', 'dot on the right'), ('שׂ', 'sin', 's', 's', 'dot on the left'), ('ת', 'tav', 't', 't', ''),
]
HE_FINALS = {'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ'}
HE_FINAL_INFO = {'ך': ('final khaf', 'ch', 'χ'), 'ם': ('final mem', 'm', 'm'), 'ן': ('final nun', 'n', 'n'), 'ף': ('final fe', 'f', 'f'), 'ץ': ('final tsadi', 'ts', 't͡s')}
HE_MARKS = [
    ('ַ', 'patach', 'a', 'a', 'vowel'), ('ָ', 'kamatz', 'a', 'a (o as kamatz katan)', 'vowel'), ('ְ', 'shva', 'e', 'e or no vowel', 'vowel'),
    ('ִ', 'hiriq', 'i', 'i', 'vowel'), ('ֵ', 'tsere', 'e', 'e', 'vowel'), ('ֶ', 'segol', 'e', 'e', 'vowel'),
    ('ֹ', 'holam', 'o', 'o', 'vowel'), ('ֻ', 'kubutz', 'u', 'u', 'vowel'),
    ('ֲ', 'hataf patach', 'a', 'a (short)', 'vowel'), ('ֱ', 'hataf segol', 'e', 'e (short)', 'vowel'), ('ֳ', 'hataf kamatz', 'o', 'o (short)', 'vowel'),
    ('ׇ', 'kamatz katan', 'o', 'o', 'vowel'),
    ('ּ', 'dagesh', '', 'hardens ב כ פ (b k p), marks וּ (u) and a sounded final ה (mappiq)', 'shadda'),
]
HE_GROUPS = [
    ('he.g1', 'First letters', 'א בּ ב ג ד ה'),
    ('he.g2', 'The first vowels', 'ַ ָ ְ ִ ֵ ֶ'),
    ('he.g3', 'Thin and tall letters', 'ו ז ח ט י'),
    ('he.g4', 'Letters with final forms (1)', 'כּ כ ך ל מ ם נ ן'),
    ('he.g5', 'More vowels and the dagesh', 'ֹ ֻ ּ ֲ ֱ ֳ ׇ'),
    ('he.g6', 'Letters with final forms (2)', 'ס ע פּ פ ף צ ץ'),
    ('he.g7', 'The last letters', 'ק ר שׁ שׂ ת'),
]
HE_LOOKALIKES = ['ב כ', 'ד ר ך', 'ה ח ת', 'ו ז ן', 'ט מ', 'ס ם', 'ג נ', 'ע צ', 'י ו', 'שׁ שׂ', 'כ כּ', 'פ פּ', 'ב בּ']
HE_BASE_MARKS = {'ׁ', 'ׂ'}   # the shin / sin dot belongs to the letter, it is not a vowel mark to add


def presentation_forms():
    """Base letters (or the lām-alif pair) → {isolated, initial, medial, final: presentation-form character} from Unicode."""
    pf = {}
    for o in list(range(0xFB50, 0xFE00)) + list(range(0xFE70, 0xFF00)):
        d = unicodedata.decomposition(chr(o))
        if d.startswith('<'):
            tag, *cps = d.split()
            pf.setdefault(''.join(chr(int(c, 16)) for c in cps), {})[tag.strip('<>')] = chr(o)
    return pf


def build_ar():
    pf = presentation_forms(); letters = []
    for ch, name, tr, snd, sun, note in AR_LETTERS:
        have = set(pf.get(ch, {}))
        if ch in AR_FINAL_ONLY: have -= {'initial', 'medial'}
        joins = 'dual' if 'initial' in have else 'right' if 'final' in have else 'none'
        forms = {'isolated': ch}
        if joins == 'dual': forms.update(initial=ch + ZWJ, medial=ZWJ + ch + ZWJ, final=ZWJ + ch)
        elif joins == 'right': forms.update(final=ZWJ + ch)
        e = {'ch': ch, 'name': name, 'translit': tr, 'sound': snd, 'joins': joins, 'forms': forms, 'unicode': unicodedata.name(ch)}
        if sun or ch in 'بجحخعغفقكمهوي': e['sun'] = bool(sun)   # sun / moon letters: the l of al- assimilates to a sun letter
        if note: e['note'] = note
        letters.append(e)
    for ch, name, tr, snd, note in AR_LIGATURES:
        letters.append({'ch': ch, 'name': name, 'translit': tr, 'sound': snd, 'joins': 'right', 'ligature': True,
                        'forms': {'isolated': ch, 'final': ZWJ + ch}, 'note': note})
    return {'format': 'noema.langscript/v1', 'lang': 'ar', 'script': 'Arab', 'dir': 'rtl', 'kind': 'abjad',
            'about': 'Reference data for the Arabic script: letters, positional forms (from the Unicode presentation forms), sounds, the course’s transliteration, vowel marks. Built by tools/lang_script.py.',
            'sources': ['Unicode Character Database (letter names, presentation forms → joining)', 'DIN 31635 (transliteration, as the course writes it: j for ج)', 'Wikipedia: Arabic alphabet; Arabic phonology'],
            'letters': letters,
            'marks': [{'ch': m, 'name': n, 'translit': t, 'what': w, 'kind': k} for m, n, t, w, k in AR_MARKS],
            'groups': [{'id': i, 'title': t, 'items': s.split()} for i, t, s in AR_GROUPS],
            'lookalikes': [s.split() for s in AR_LOOKALIKES],
            'keyboard': {'rows': ['ض ص ث ق ف غ ع ه خ ح ج د', 'ش س ي ب ل ا ت ن م ك ط', 'ئ ء ؤ ر لا ى ة و ز ظ', 'ذ أ إ آ'],
                         'marks': [m for m, *_ in AR_MARKS], 'punct': ['،', '؛', '؟', '.', '!']}}


def build_he():
    letters = []
    for ch, name, tr, snd, note in HE_LETTERS:
        base = ch[0]
        e = {'ch': ch, 'name': name, 'translit': tr, 'sound': snd, 'unicode': unicodedata.name(base), 'forms': {'regular': ch}}
        if base in HE_FINALS and not (ch == 'כּ' or ch == 'פּ'): e['forms']['final'] = HE_FINALS[base]
        if note: e['note'] = note
        letters.append(e)
    for base, fin in HE_FINALS.items():
        name, tr, snd = HE_FINAL_INFO[fin]
        letters.append({'ch': fin, 'name': name, 'translit': tr, 'sound': snd, 'unicode': unicodedata.name(fin), 'forms': {'final': fin}, 'finalOf': base,
                        'note': 'only at the end of a word'})
    return {'format': 'noema.langscript/v1', 'lang': 'he', 'script': 'Hebr', 'dir': 'rtl', 'kind': 'abjad',
            'about': 'Reference data for the Hebrew script: letters (with dagesh where it changes the sound; shin / sin), the five final forms, sounds, the course’s transliteration, the niqqud. Built by tools/lang_script.py.',
            'sources': ['Unicode Character Database (letter names)', 'Wikipedia: Hebrew alphabet; Niqqud; Modern Hebrew phonology'],
            'letters': letters,
            'marks': [{'ch': m, 'name': n, 'translit': t, 'what': w, 'kind': k} for m, n, t, w, k in HE_MARKS],
            'baseMarks': sorted(HE_BASE_MARKS),
            'groups': [{'id': i, 'title': t, 'items': s.split()} for i, t, s in HE_GROUPS],
            'lookalikes': [s.split() for s in HE_LOOKALIKES],
            'keyboard': {'rows': ['ק ר א ט ו ן ם פ', 'ש ד ג כ ע י ח ל ך ף', 'ז ס ב ה נ מ צ ת ץ'],
                         'marks': [m for m, *_ in HE_MARKS] + ['ׁ', 'ׂ'], 'punct': [',', '.', '?', '!', '־']}}


# ---------- Chinese ----------
def mmah(name, offline=False):
    os.makedirs(MMAH, exist_ok=True)
    p = os.path.join(MMAH, name)
    if not os.path.exists(p):
        if offline: raise SystemExit(f'{p} is missing (run without --offline to download it from {MMAH_URL})')
        print('downloading', MMAH_URL + name, '…')
        with urllib.request.urlopen(MMAH_URL + name, timeout=120) as r, open(p + '.tmp', 'wb') as f: f.write(r.read())
        os.replace(p + '.tmp', p)
    out = {}
    with open(p, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                d = json.loads(line); out[d['character']] = d
    return out


UNIHAN = os.path.join(ROOT, 'data', 'refcache', 'unihan')
UNIHAN_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip'
def unihan(offline=False):
    """Unihan (Unicode): {char: {field: value}} for the fields the characters need (readings, definition, variants, strokes)."""
    os.makedirs(UNIHAN, exist_ok=True)
    files = [os.path.join(UNIHAN, f) for f in ('Unihan_Readings.txt', 'Unihan_Variants.txt', 'Unihan_IRGSources.txt')]
    if not all(os.path.exists(f) for f in files):
        if offline: return {}
        import zipfile, io
        print('downloading', UNIHAN_URL, '…')
        with urllib.request.urlopen(UNIHAN_URL, timeout=180) as r: zipfile.ZipFile(io.BytesIO(r.read())).extractall(UNIHAN)
    want = {'kMandarin', 'kHanyuPinyin', 'kDefinition', 'kTraditionalVariant', 'kSimplifiedVariant', 'kSemanticVariant', 'kZVariant', 'kSpecializedSemanticVariant', 'kTotalStrokes'}
    out = {}
    for fn in files:
        with open(fn, encoding='utf-8') as f:
            for line in f:
                if line.startswith('U+'):
                    cp, field, val = line.rstrip('\n').split('\t', 2)
                    if field in want: out.setdefault(chr(int(cp[2:], 16)), {})[field] = val
    return out


def course_lexemes(root, code):
    d = os.path.join(root, 'lang', code, 'lexicon'); out = []
    for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if fn.endswith('.json'):
            with open(os.path.join(d, fn), encoding='utf-8') as f: out += json.load(f).get('lexemes', [])
    return out


def build_zh(root, offline=False):
    dic, gra, uh = mmah('dictionary.txt', offline), mmah('graphics.txt', offline), unihan(offline)
    chars, missing = {}, []
    for x in course_lexemes(root, 'zh'):
        lem = [c for c in nfc(x['lemma'])]; trad = list(nfc(x.get('trad') or x['lemma'])); syl = pinyin_split(x.get('pinyin') or '')
        han = [c for c in lem if is_han(c)]
        for i, ch in enumerate(lem):
            if not is_han(ch): continue
            e = chars.setdefault(ch, {'ch': ch, 'readings': [], 'trad': [], 'words': []})
            e['words'].append(x['id'])
            j = han.index(ch) if False else sum(1 for c in lem[:i] if is_han(c))
            if len(syl) == len(han) and syl[j] not in e['readings']: e['readings'].append(syl[j])
            if len(trad) == len(lem) and trad[i] != ch and trad[i] not in e['trad']: e['trad'].append(trad[i])
    out = []
    for ch in sorted(chars, key=lambda c: (-len(chars[c]['words']), c)):
        e, d, g = chars[ch], dic.get(ch), gra.get(ch)
        rec = {'ch': ch, 'readings': [], 'meaning': '', 'trad': e['trad'], 'inWords': len(e['words'])}
        if d:
            rec['readings'] = [nfc(p) for p in d.get('pinyin') or []]
            rec['meaning'] = d.get('definition') or ''
            if d.get('decomposition') and d['decomposition'] != '？': rec['ids'] = d['decomposition']
            if d.get('radical'): rec['radical'] = d['radical']
            et = d.get('etymology') or {}
            if et: rec['etymology'] = {k: et[k] for k in ('type', 'hint', 'semantic', 'phonetic') if et.get(k)}
        u = uh.get(ch, {})
        for r in (u.get('kMandarin') or '').split():   # Unihan: every Mandarin reading (Make Me a Hanzi lists only some)
            if nfc(r) not in rec['readings']: rec['readings'].append(nfc(r))
        if not rec['meaning'] and u.get('kDefinition'): rec['meaning'] = u['kDefinition']
        if u.get('kTotalStrokes'): rec['strokes'] = int(u['kTotalStrokes'].split()[0])
        for t in e['trad']:   # the traditional forms the words use must be traditional variants of the character in Unihan
            tv = {chr(int(x[2:].split('<')[0], 16)) for k in ('kTraditionalVariant', 'kSemanticVariant', 'kZVariant', 'kSpecializedSemanticVariant') for x in (u.get(k) or '').split()}
            if uh and t not in tv: print(f'  ⚠️ {ch}: the words write it {t}, which Unihan does not list as a variant ({" ".join(sorted(tv)) or "none"})')
        for r in e['readings']:   # the readings the course's words use (neutral tone, a second reading …)
            if r not in rec['readings']: rec.setdefault('wordReadings', []).append(r)
        if g: rec['medians'] = g['medians']
        if not d or not g: missing.append(ch)
        out.append(rec)
    return {'format': 'noema.langchars/v1', 'lang': 'zh',
            'about': 'The characters of the course’s Chinese words (simplified, as the lemmas write them): readings, meaning, components (IDS), radical, '
                     'etymology hint, the traditional forms the words use, stroke medians (1024 × 1024 box, y upwards from 0 at −124: draw at (x, 900 − y)). Built by tools/lang_script.py.',
            'sources': ['Make Me a Hanzi (github.com/skishore/makemeahanzi): dictionary.txt (from Unihan and CJKlib; LGPL) and graphics.txt (from the Arphic PL fonts; Arphic Public License)',
                        'Unihan (Unicode Character Database): kMandarin readings, kDefinition where Make Me a Hanzi has no entry, kTotalStrokes, kTraditionalVariant (checked)',
                        'the course lexicon (the readings and traditional forms its words use)'],
            'missing': missing, 'chars': out}


def write(p, data):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        if data.get('chars'):   # one character per line: diffs stay readable
            head = {k: v for k, v in data.items() if k != 'chars'}
            f.write(json.dumps(head, ensure_ascii=False, indent=1)[:-2] + ',\n "chars": [\n' + ',\n'.join(json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in data['chars']) + '\n ]\n}\n')
        else: f.write(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
    print('wrote', os.path.relpath(p, ROOT))


# ---------- checks (also run by tools/validate_lang.py) ----------
def texts_of_lexicon(root, code):
    """Every written form of the course in a language: lemmas, forms, spellings, bank sentences."""
    out = []
    for x in course_lexemes(root, code):
        out += [x.get('lemma', '')] + list((x.get('forms') or {}).values()) + list(x.get('alts') or []) + list((x.get('plene') or {}).values())
    d = os.path.join(root, 'lang', code, 'bank')
    for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if fn.endswith('.json'):
            with open(os.path.join(d, fn), encoding='utf-8') as f: out += [s.get('text', '') for s in json.load(f).get('sentences', [])]
    return [nfc(t) for t in out if isinstance(t, str)]


def check(root, code, strict=True):
    """→ (errors, warnings): lists of 'where: message'."""
    E, W = [], []
    if code in ('ar', 'he'):
        rel = f'lang/{code}/script.json'; p = os.path.join(root, rel)
        if not os.path.exists(p): W.append(f'{rel}: missing — the script module of the alphabet (docs/LANGUAGES.md §4.9; build it with tools/lang_script.py build)'); return E, W
        with open(p, encoding='utf-8') as f: s = json.load(f)
        if s.get('format') != 'noema.langscript/v1' or s.get('lang') != code: E.append(f'{rel}: format must be noema.langscript/v1 and lang “{code}”')
        script_name = 'ARABIC' if code == 'ar' else 'HEBREW'
        letters = s.get('letters') or []; marks = s.get('marks') or []; keys = [x.get('ch') for x in letters] + [m.get('ch') for m in marks]
        if len(set(keys)) != len(keys): E.append(f'{rel}: a letter or mark is listed twice')
        pf = presentation_forms() if code == 'ar' else {}
        for x in letters:
            w = f'{rel} · {x.get("ch")}'
            for k in ('name', 'translit', 'sound', 'forms'):
                if k not in x: E.append(f'{w}: “{k}” is required')
            ch = x.get('ch') or ''
            if not ch or not all(unicodedata.name(c, '').startswith(script_name) for c in ch): E.append(f'{w}: not {script_name.lower()} letters')
            if code == 'ar' and not x.get('ligature'):
                have = set(pf.get(ch, {})) - ({'initial', 'medial'} if ch in AR_FINAL_ONLY else set())
                want = 'dual' if 'initial' in have else 'right' if 'final' in have else 'none'
                if x.get('joins') != want: E.append(f'{w}: joins must be “{want}” (Unicode presentation forms)')
                f = x.get('forms') or {}
                exp = {'isolated': ch, **({'initial': ch + ZWJ, 'medial': ZWJ + ch + ZWJ, 'final': ZWJ + ch} if want == 'dual' else {'final': ZWJ + ch} if want == 'right' else {})}
                if f != exp: E.append(f'{w}: positional forms do not match its joining ({", ".join(exp)})')
            if code == 'he':
                b = ch[:1]
                if x.get('finalOf'):
                    if HE_FINALS.get(x['finalOf']) != ch: E.append(f'{w}: not the final form of {x["finalOf"]}')
                elif b in HE_FINALS and len(ch) == 1 and (x.get('forms') or {}).get('final') != HE_FINALS[b]: E.append(f'{w}: its final form is {HE_FINALS[b]}')
        markset = marks_of(code)
        for m in marks:
            if len(m.get('ch', '')) != 1 or ord(m['ch']) not in markset: E.append(f'{rel} · mark {m.get("ch")!r}: not a {code} vowel mark')
            if m.get('kind') not in ('vowel', 'shadda'): E.append(f'{rel} · mark {m.get("name")}: kind must be vowel or shadda')
        grouped = [i for g in s.get('groups') or [] for i in g.get('items') or []]
        for k in keys:
            if grouped.count(k) != 1: E.append(f'{rel}: “{k}” must be in exactly one teaching group (found {grouped.count(k)})')
        for k in grouped:
            if k not in keys: E.append(f'{rel}: group item “{k}” is not a letter or mark of the module')
        # complete for the alphabet: every letter and mark the course writes is in the module
        base = {c for x in letters for c in (x.get('ch') or '') if unicodedata.category(c).startswith('L')} | {(x.get('forms') or {}).get('final', '')[-1:] for x in letters}
        used_l, used_m = set(), set()
        for t in texts_of_lexicon(root, code):
            for c in t:
                if unicodedata.category(c).startswith('L'): used_l.add(c)
                elif ord(c) in markset: used_m.add(c)
        for c in sorted(used_l - base): E.append(f'{rel}: the course writes the letter {c} ({unicodedata.name(c, "?")}), which the module lacks')
        mk = {m.get('ch') for m in marks} | set(s.get('baseMarks') or [])
        for c in sorted(used_m - mk): E.append(f'{rel}: the course writes the mark {unicodedata.name(c, "?")}, which the module lacks')
    elif code == 'zh':
        rel = 'lang/zh/chars.json'; p = os.path.join(root, rel)
        if not os.path.exists(p): W.append(f'{rel}: missing — the characters of the course’s words (docs/LANGUAGES.md §4.9; build it with tools/lang_script.py build)'); return E, W
        with open(p, encoding='utf-8') as f: s = json.load(f)
        if s.get('format') != 'noema.langchars/v1': E.append(f'{rel}: format must be noema.langchars/v1')
        by = {}
        for e in s.get('chars') or []:
            ch = e.get('ch', ''); w = f'{rel} · {ch}'
            if len(ch) != 1 or not is_han(ch): E.append(f'{w}: not one Chinese character'); continue
            if ch in by: E.append(f'{w}: listed twice')
            by[ch] = e
            for r in (e.get('readings') or []) + (e.get('wordReadings') or []):
                er = pinyin_syllable_errors(r)
                if er and not r.endswith('r'): E.append(f'{w}: reading {r}: {er[0]}')
            if not e.get('readings') and not e.get('wordReadings'): E.append(f'{w}: no reading')
            for t in e.get('trad') or []:
                if len(t) != 1 or not is_han(t): E.append(f'{w}: traditional form “{t}” is not one character')
            med = e.get('medians')
            if med is not None:
                if not (isinstance(med, list) and med and all(isinstance(st, list) and len(st) >= 2 and all(isinstance(pt, list) and len(pt) == 2 and -200 <= pt[0] <= 1224 and -300 <= pt[1] <= 1124 for pt in st) for st in med)):
                    E.append(f'{w}: medians must be strokes of ≥ 2 points [x, y] in the 1024 box')
            elif strict: W.append(f'{w}: no stroke data (it cannot be traced)')
        for x in course_lexemes(root, 'zh'):
            lem = nfc(x.get('lemma', '')); han = [c for c in lem if is_han(c)]; syl = pinyin_split(x.get('pinyin') or ''); trad = nfc(x.get('trad') or lem)
            for i, c in enumerate(han):
                if c not in by: (E if strict else W).append(f'{rel}: the character {c} of {x["id"]} is missing'); continue
                e = by[c]
                if len(syl) == len(han):
                    rd = (e.get('readings') or []) + (e.get('wordReadings') or [])
                    if syl[i] not in rd: E.append(f'{rel} · {c}: the reading {syl[i]} of {x["id"]} is not listed')
            if len(trad) == len(lem):
                for a, b in zip(lem, trad):
                    if is_han(a) and a != b and a in by and b not in (by[a].get('trad') or []): E.append(f'{rel} · {a}: the traditional form {b} of {x["id"]} is not listed')
    return E, W


def main(a):
    if len(a) < 2 or a[0] not in ('build', 'check'): print(__doc__); sys.exit(2)
    root = a[1]; only = a[a.index('--lang') + 1] if '--lang' in a else None
    with open(os.path.join(root, 'course.json'), encoding='utf-8') as f: langs = json.load(f)['languages']
    langs = [c for c in langs if c in ('ar', 'he', 'zh') and (not only or c == only)]
    if a[0] == 'build':
        for c in langs:
            if c == 'ar': write(os.path.join(root, 'lang', 'ar', 'script.json'), build_ar())
            if c == 'he': write(os.path.join(root, 'lang', 'he', 'script.json'), build_he())
            if c == 'zh':
                d = build_zh(root, '--offline' in a); write(os.path.join(root, 'lang', 'zh', 'chars.json'), d)
                if d['missing']: print('  without Make Me a Hanzi data:', ' '.join(d['missing']))
    bad = 0
    for c in langs:
        E, W = check(root, c)
        for e in E: print('❌', e)
        for w in W[:20]: print('⚠️ ', w)
        bad += len(E)
        print(f'{"✅" if not E else "❌"} {c}: script module {"valid" if not E else str(len(E)) + " problem(s)"}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__': main(sys.argv[1:])
