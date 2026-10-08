#!/usr/bin/env python3
# Regenerate: python3 tests/fixtures/lang-mini.src/mkmini.py .   (then python3 tools/validate_lang.py tests/fixtures/lang-mini)
"""Writes tests/fixtures/lang-mini (hand-checked mini course, docs/LANGUAGES.md §11). All text NFC."""
import json, os, sys, unicodedata
ROOT = sys.argv[1]
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'lang-mini')

def nfc(x):
    if isinstance(x, str): return unicodedata.normalize('NFC', x)
    if isinstance(x, list): return [nfc(v) for v in x]
    if isinstance(x, dict): return {nfc(k): nfc(v) for k, v in x.items()}
    return x
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mkmini_profiles import P as PROFILES
def attach(obj):
    """Put each word profile on its lexeme."""
    for x in (obj.get('lexemes') or []) if isinstance(obj, dict) else []:
        if x.get('id') in PROFILES: x['profile'] = PROFILES[x['id']]
    return obj
import re as _re
import mkmini_facade, mkmini_notes
def w(rel, obj):
    obj = attach(obj)
    g_ = _re.match(r'lang/(\w+)/grammar/(.+)\.json$', rel)
    if g_: mkmini_notes.grammar(g_.group(1), g_.group(2), obj)   # D18: comparison notes, no forYou
    b_ = _re.match(r'lang/(\w+)/bank/basic\.json$', rel)
    if b_ and mkmini_notes.EXEMPT.get(b_.group(1)): obj['fieldExemptions'] = mkmini_notes.EXEMPT[b_.group(1)]   # D19
    m = _re.match(r'lang/(\w+)/(language\.json|lexicon/)', rel)
    if m and m.group(2) == 'language.json': mkmini_facade.apply(m.group(1), obj, {})
    elif m: mkmini_facade.apply(m.group(1), {}, obj)   # D14 facade, D15 meanings
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: json.dump(nfc(obj), f, ensure_ascii=False, indent=1); f.write('\n')

w('course.json', {"format": "noema.langcourse/v1", "id": "lang-mini", "title": "Mini course · Arabic · Hebrew · Chinese · German",
  "explainLang": "en", "languages": ["ar", "he", "zh", "de"], "profiles": "required",
  "defaults": {"depth": {"ar": 3, "he": 3, "zh": 3, "de": 3}, "batch": 12, "dailyMinutes": 30},
  "knownLanguages": ["el", "en", "de", "ru", "tr"]})

# ---------- core ----------
w('core/fields/core.json', {"field": "core", "title": "Core words", "subgroups": [
    {"id": "pron", "title": "Personal pronouns"}, {"id": "verb", "title": "Basic verbs"}, {"id": "func", "title": "Function words"}],
  "sources": ["Core spine of the course (docs/LANGUAGES.md §4.4)"],
  "concepts": [
    {"id": "pron.he", "gloss": "he", "subgroup": "pron", "tier": 1, "rank": 1},
    {"id": "pron.she", "gloss": "she", "subgroup": "pron", "tier": 1, "rank": 2},
    {"id": "verb.eat", "gloss": "to eat", "subgroup": "verb", "tier": 1, "rank": 3},
    {"id": "det.def", "gloss": "the (definite article)", "subgroup": "func", "tier": 1, "rank": 4},
    {"id": "det.indef", "gloss": "a, an (indefinite article)", "subgroup": "func", "tier": 1, "rank": 5},
    {"id": "conj.and", "gloss": "and", "subgroup": "func", "tier": 1, "rank": 6},
    {"id": "greet.hello", "gloss": "hello", "subgroup": "func", "tier": 1, "rank": 7}]})
w('core/fields/more.json', mkmini_facade.field())   # pending meanings (D15)
w('core/fields/food.vegetables.json', {"field": "food.vegetables", "title": "Vegetables", "subgroups": [
    {"id": "root", "title": "Root vegetables and bulbs"}, {"id": "fruit", "title": "Fruit vegetables"}],
  "sources": ["Mini fixture: a hand-picked subset (the real field is exhaustive)"],
  "concepts": [
    {"id": "veg.carrot", "gloss": "carrot", "subgroup": "root", "tier": 1, "rank": 1, "wikidata": "Q81"},
    {"id": "veg.onion", "gloss": "onion", "subgroup": "root", "tier": 1, "rank": 2, "wikidata": "Q23485"},
    {"id": "veg.cucumber", "gloss": "cucumber", "subgroup": "fruit", "tier": 1, "rank": 3, "wikidata": "Q2735883"},
    {"id": "veg.eggplant", "gloss": "eggplant, aubergine", "subgroup": "fruit", "tier": 2, "rank": 1, "wikidata": "Q7540"},
    {"id": "veg.pumpkin", "gloss": "pumpkin", "subgroup": "fruit", "tier": 2, "rank": 2, "wikidata": "Q165308"}]})
w('core/nodes.json', {"nodes": [
  {"id": "fd.00", "kind": "lesson", "step": 0, "title": "The language and the types of languages", "concepts": [], "functions": {"*": ["fn.overview"]}, "prereqs": []},
  {"id": "fd.01", "kind": "lesson", "step": 1, "title": "Hello — and how words are built", "concepts": ["greet.hello"], "functions": {"*": ["fn.definite"], "ar": ["fn.root.pattern"], "he": ["fn.root.pattern"]}, "prereqs": ["fd.00"]},
  {"id": "fd.01x", "kind": "lesson", "step": 1, "langs": ["de"], "title": "An extra lesson for German only", "concepts": [], "functions": ["fn.plural.noun"], "prereqs": ["fd.01"]},
  {"id": "core.1", "kind": "core", "title": "He, she, eat — and the little words", "concepts": ["pron.he", "pron.she", "verb.eat", "det.def", "det.indef", "conj.and"], "prereqs": ["fd.01x"]},
  {"id": "veg.1", "kind": "field", "field": "food.vegetables", "tier": 1, "title": "Vegetables I", "concepts": ["veg.carrot", "veg.onion", "veg.cucumber"], "prereqs": ["core.1"]},
  {"id": "veg.2", "kind": "field", "field": "food.vegetables", "tier": 2, "title": "Vegetables II", "concepts": ["veg.eggplant", "veg.pumpkin"], "prereqs": ["veg.1"]}]})
w('core/functions/fn.definite.json', {"id": "fn.definite", "title": "The and a: definiteness", "category": "morphosyntax", "level": "A1", "after": [], "tags": ["Definiteness"]})
w('core/functions/fn.overview.json', {"id": "fn.overview", "title": "The language at a glance — and the four types of languages", "category": "overview", "level": "A1", "after": [], "tags": []})
w('core/functions/fn.root.pattern.json', {"id": "fn.root.pattern", "title": "Roots and patterns", "category": "morphology", "level": "A1", "after": [], "tags": []})
w('core/typology.json', json.load(open(os.path.join(ROOT, 'tools', 'lang_sources', 'foundations', 'typology.json'), encoding='utf-8')))
w('core/functions/fn.plural.noun.json', {"id": "fn.plural.noun", "title": "More than one: plural of nouns", "category": "morphology", "level": "A1", "after": ["fn.definite"], "tags": ["Number"]})
w('core/frames.json', {"frames": [
  {"id": "fr.eat.def", "meaning": "PERSON eats the VEGETABLE (one, definite)"},
  {"id": "fr.eat.indef", "meaning": "PERSON eats a VEGETABLE (one, indefinite)"},
  {"id": "fr.eat.generic", "meaning": "PERSON eats VEGETABLES (in general)"},
  {"id": "fr.eat.and", "meaning": "PERSON eats the VEGETABLE and the VEGETABLE"},
  {"id": "fr.eat.def.pl", "meaning": "PERSON eats the VEGETABLES (several, definite)"},
  {"id": "fr.eat.def2", "meaning": "PERSON eats the VEGETABLE (one, definite) — second tier"}]})

# ---------- German ----------
w('lang/de/language.json', {"code": "de", "typology": "fusional", "name": "German", "nativeName": "Deutsch", "script": "Latn", "dir": "ltr",
  "tokenJoin": "space", "capitalizeFirst": True, "vowelMarks": False, "romanization": None,
  "citationCells": {"NOUN": "N;NOM;SG", "VERB": "V;NFIN", "PRON": "PRON;NOM", "DET.def": "DET;NOM;SG;MASC", "DET.indef": "DET;NOM;SG;MASC"},
  "paradigmCells": {
    "NOUN": ["N;NOM;SG", "N;ACC;SG", "N;DAT;SG", "N;GEN;SG", "N;NOM;PL", "N;ACC;PL", "N;DAT;PL", "N;GEN;PL"],
    "VERB": ["V;NFIN", "V;PRS;1;SG", "V;PRS;2;SG", "V;PRS;3;SG", "V;PRS;1;PL", "V;PRS;2;PL", "V;PRS;3;PL"],
    "PRON": ["PRON;NOM", "PRON;ACC", "PRON;DAT"],
    "DET.def": [f"DET;{c};SG;{g}" for c in ("NOM", "ACC", "DAT", "GEN") for g in ("MASC", "FEM", "NEUT")] + [f"DET;{c};PL" for c in ("NOM", "ACC", "DAT", "GEN")],
    "DET.indef": [f"DET;{c};SG;{g}" for c in ("NOM", "ACC", "DAT", "GEN") for g in ("MASC", "FEM", "NEUT")]}})
def de_noun(lid, lemma, sense, gender, gen_sg, pl, dat_pl=None):
    f = {"N;NOM;SG": lemma, "N;ACC;SG": lemma, "N;DAT;SG": lemma, "N;GEN;SG": gen_sg, "N;NOM;PL": pl, "N;ACC;PL": pl, "N;DAT;PL": dat_pl or pl, "N;GEN;PL": pl}
    return {"id": lid, "lemma": lemma, "pos": "NOUN", "senses": [sense], "gender": gender, "forms": f, "ref": {"src": "fixture", "checked": "2026-10-07"}}
der = {"NOM": ("der", "die", "das", "die"), "ACC": ("den", "die", "das", "die"), "DAT": ("dem", "der", "dem", "den"), "GEN": ("des", "der", "des", "der")}
ein = {"NOM": ("ein", "eine", "ein"), "ACC": ("einen", "eine", "ein"), "DAT": ("einem", "einer", "einem"), "GEN": ("eines", "einer", "eines")}
G = ("MASC", "FEM", "NEUT")
w('lang/de/lexicon/core.1.json', {"lexemes": [
  {"id": "de:er", "lemma": "er", "pos": "PRON", "senses": ["pron.he"], "forms": {"PRON;NOM": "er", "PRON;ACC": "ihn", "PRON;DAT": "ihm"}, "ref": {"src": "fixture"}},
  {"id": "de:sie", "lemma": "sie", "pos": "PRON", "senses": ["pron.she"], "forms": {"PRON;NOM": "sie", "PRON;ACC": "sie", "PRON;DAT": "ihr"}, "ref": {"src": "fixture"}},
  {"id": "de:essen", "lemma": "essen", "pos": "VERB", "senses": ["verb.eat"], "aux": "haben",
   "forms": {"V;NFIN": "essen", "V;PRS;1;SG": "esse", "V;PRS;2;SG": "isst", "V;PRS;3;SG": "isst", "V;PRS;1;PL": "essen", "V;PRS;2;PL": "esst", "V;PRS;3;PL": "essen"}, "ref": {"src": "fixture"}},
  {"id": "de:der", "lemma": "der", "pos": "DET", "class": "def", "senses": ["det.def"],
   "forms": {**{f"DET;{c};SG;{G[i]}": der[c][i] for c in der for i in range(3)}, **{f"DET;{c};PL": der[c][3] for c in der}}, "ref": {"src": "fixture"}},
  {"id": "de:ein", "lemma": "ein", "pos": "DET", "class": "indef", "senses": ["det.indef"],
   "forms": {f"DET;{c};SG;{G[i]}": ein[c][i] for c in ein for i in range(3)}, "ref": {"src": "fixture"}},
  {"id": "de:und", "lemma": "und", "pos": "CCONJ", "senses": ["conj.and"], "ref": {"src": "fixture"}}], "absent": []})
w('lang/de/lexicon/veg.1.json', {"lexemes": [
  de_noun("de:Karotte", "Karotte", "veg.carrot", "FEM", "Karotte", "Karotten") | {"variants": [{"lemma": "Möhre", "region": "north"}, {"lemma": "Rüebli", "region": "CH"}]},
  de_noun("de:Zwiebel", "Zwiebel", "veg.onion", "FEM", "Zwiebel", "Zwiebeln"),
  de_noun("de:Gurke", "Gurke", "veg.cucumber", "FEM", "Gurke", "Gurken")], "absent": []})
w('lang/de/lexicon/veg.2.json', {"lexemes": [
  de_noun("de:Aubergine", "Aubergine", "veg.eggplant", "FEM", "Aubergine", "Auberginen"),
  de_noun("de:Kürbis", "Kürbis", "veg.pumpkin", "MASC", "Kürbisses", "Kürbisse", "Kürbissen")], "absent": []})

# ---------- Arabic ----------
w('lang/ar/language.json', {"code": "ar", "typology": "fusional", "name": "Arabic", "nativeName": "العربية", "script": "Arab", "dir": "rtl",
  "tokenJoin": "space", "capitalizeFirst": False, "vowelMarks": True, "romanization": "din31635",
  "citationCells": {"VERB": "V;PST;3;SG;MASC", "PRON": "PRON;NOM"},
  "paradigmCells": {
    "NOUN.collective": ["N;NOM;COLL;INDF", "N;NOM;COLL;DEF", "N;ACC;COLL;DEF", "N;NOM;SG;INDF", "N;ACC;SG;INDF", "N;NOM;SG;DEF", "N;ACC;SG;DEF", "N;NOM;PL;INDF", "N;NOM;PL;DEF", "N;ACC;PL;DEF"],
    "VERB": ["V;PST;3;SG;MASC", "V;PRS;IND;1;SG", "V;PRS;IND;2;SG;MASC", "V;PRS;IND;2;SG;FEM", "V;PRS;IND;3;SG;MASC", "V;PRS;IND;3;SG;FEM", "V;PRS;IND;1;PL", "V;PRS;IND;2;PL;MASC", "V;PRS;IND;2;PL;FEM", "V;PRS;IND;3;PL;MASC", "V;PRS;IND;3;PL;FEM"],
    "PRON": ["PRON;NOM"]}})
def ar_coll(lid, coll, unit, sense, translit, root):
    """coll/unit without the article and endings: e.g. 'جَزَر', 'جَزَرَة' (the unit noun ends in ة)."""
    base_pl = unit[:-2] + 'َات' if unit.endswith('َة') else None   # جَزَرَة → جَزَرَات
    assert base_pl, unit
    f = {"N;NOM;COLL;INDF": coll + 'ٌ', "N;NOM;COLL;DEF": 'الْ' + coll + 'ُ', "N;ACC;COLL;DEF": 'الْ' + coll + 'َ',
         "N;NOM;SG;INDF": unit + 'ٌ', "N;ACC;SG;INDF": unit + 'ً', "N;NOM;SG;DEF": 'الْ' + unit + 'ُ', "N;ACC;SG;DEF": 'الْ' + unit + 'َ',
         "N;NOM;PL;INDF": base_pl + 'ٌ', "N;NOM;PL;DEF": 'الْ' + base_pl + 'ُ', "N;ACC;PL;DEF": 'الْ' + base_pl + 'ِ'}
    return {"id": lid, "lemma": coll, "pos": "NOUN", "class": "collective", "senses": [sense], "gender": "MASC", "root": root,
            "unit": unit, "translit": translit, "forms": f, "ref": {"src": "fixture", "checked": "2026-10-07"}}
w('lang/ar/lexicon/core.1.json', {"lexemes": [
  {"id": "ar:huwa", "lemma": "هُوَ", "pos": "PRON", "senses": ["pron.he"], "translit": "huwa", "forms": {"PRON;NOM": "هُوَ"}, "ref": {"src": "fixture"}},
  {"id": "ar:hiya", "lemma": "هِيَ", "pos": "PRON", "senses": ["pron.she"], "translit": "hiya", "forms": {"PRON;NOM": "هِيَ"}, "ref": {"src": "fixture"}},
  {"id": "ar:akala", "lemma": "أَكَلَ", "pos": "VERB", "senses": ["verb.eat"], "root": "ء ك ل", "verbForm": "I", "translit": "akala",
   "forms": {"V;PST;3;SG;MASC": "أَكَلَ", "V;PRS;IND;1;SG": "آكُلُ", "V;PRS;IND;2;SG;MASC": "تَأْكُلُ", "V;PRS;IND;2;SG;FEM": "تَأْكُلِينَ",
             "V;PRS;IND;3;SG;MASC": "يَأْكُلُ", "V;PRS;IND;3;SG;FEM": "تَأْكُلُ", "V;PRS;IND;1;PL": "نَأْكُلُ",
             "V;PRS;IND;2;PL;MASC": "تَأْكُلُونَ", "V;PRS;IND;2;PL;FEM": "تَأْكُلْنَ", "V;PRS;IND;3;PL;MASC": "يَأْكُلُونَ", "V;PRS;IND;3;PL;FEM": "يَأْكُلْنَ"}, "ref": {"src": "fixture"}},
  {"id": "ar:wa", "lemma": "وَ", "pos": "CCONJ", "senses": ["conj.and"], "prefix": True, "translit": "wa", "ref": {"src": "fixture"}}],
  "absent": [
    {"concept": "det.def", "reason": "No separate word: the definite article al- (ال) is part of the noun forms (DEF cells).", "use": "الْ + noun"},
    {"concept": "det.indef", "reason": "No indefinite article: an indefinite noun takes nunation (tanwīn, -un/-an/-in).", "use": "noun with tanwīn"}]})
w('lang/ar/lexicon/veg.1.json', {"lexemes": [
  ar_coll("ar:jazar", "جَزَر", "جَزَرَة", "veg.carrot", "jazar", "ج ز ر"),
  ar_coll("ar:basal", "بَصَل", "بَصَلَة", "veg.onion", "baṣal", "ب ص ل"),
  ar_coll("ar:khiyar", "خِيَار", "خِيَارَة", "veg.cucumber", "ḫiyār", "خ ي ر")], "absent": []})
w('lang/ar/lexicon/veg.2.json', {"lexemes": [
  ar_coll("ar:badhinjan", "بَاذِنْجَان", "بَاذِنْجَانَة", "veg.eggplant", "bāḏinǧān", None),
  ar_coll("ar:qar", "قَرْع", "قَرْعَة", "veg.pumpkin", "qarʿ", "ق ر ع")], "absent": []})

# ---------- Hebrew ----------
w('lang/he/language.json', {"code": "he", "typology": "fusional", "name": "Hebrew", "nativeName": "עברית", "script": "Hebr", "dir": "rtl",
  "tokenJoin": "space", "capitalizeFirst": False, "vowelMarks": True, "romanization": "simple",
  "citationCells": {"NOUN": "N;SG;INDF", "VERB": "V;PST;3;SG;MASC"},
  "paradigmCells": {
    "NOUN": ["N;SG;INDF", "N;SG;DEF", "N;PL;INDF", "N;PL;DEF"],
    "VERB": ["V;PST;3;SG;MASC", "V;PRS;SG;MASC", "V;PRS;SG;FEM", "V;PRS;PL;MASC", "V;PRS;PL;FEM"]}})
def he_noun(lid, sense, gender, sg, sg_def, pl, pl_def, translit, root=None):
    return {"id": lid, "lemma": sg, "pos": "NOUN", "senses": [sense], "gender": gender, "translit": translit, **({"root": root} if root else {}),
            "forms": {"N;SG;INDF": sg, "N;SG;DEF": sg_def, "N;PL;INDF": pl, "N;PL;DEF": pl_def}, "ref": {"src": "fixture", "checked": "2026-10-07"}}
w('lang/he/lexicon/core.1.json', {"lexemes": [
  {"id": "he:hu", "lemma": "הוּא", "pos": "PRON", "senses": ["pron.he"], "translit": "hu", "ref": {"src": "fixture"}},
  {"id": "he:hi", "lemma": "הִיא", "pos": "PRON", "senses": ["pron.she"], "translit": "hi", "ref": {"src": "fixture"}},
  {"id": "he:akhal", "lemma": "אָכַל", "pos": "VERB", "senses": ["verb.eat"], "root": "א כ ל", "binyan": "paal", "translit": "akhal",
   "forms": {"V;PST;3;SG;MASC": "אָכַל", "V;PRS;SG;MASC": "אוֹכֵל", "V;PRS;SG;FEM": "אוֹכֶלֶת", "V;PRS;PL;MASC": "אוֹכְלִים", "V;PRS;PL;FEM": "אוֹכְלוֹת"}, "ref": {"src": "fixture"}},
  {"id": "he:ve", "lemma": "וְ", "pos": "CCONJ", "senses": ["conj.and"], "prefix": True, "translit": "ve", "note": "וּ (u-) before ב, מ, פ and before a shva", "ref": {"src": "fixture"}},
  {"id": "he:et", "lemma": "אֶת", "pos": "ADP", "senses": [], "role": "marks a definite direct object (no English equivalent)", "translit": "et", "ref": {"src": "fixture"}}],
  "absent": [
    {"concept": "det.def", "reason": "No separate word: the definite article ha- (הַ) is part of the noun forms (DEF cells).", "use": "הַ + noun"},
    {"concept": "det.indef", "reason": "Hebrew has no indefinite article: the bare noun is indefinite.", "use": "bare noun"}]})
w('lang/he/lexicon/veg.1.json', {"lexemes": [
  he_noun("he:gezer", "veg.carrot", "MASC", "גֶּזֶר", "הַגֶּזֶר", "גְּזָרִים", "הַגְּזָרִים", "gezer"),
  he_noun("he:batsal", "veg.onion", "MASC", "בָּצָל", "הַבָּצָל", "בְּצָלִים", "הַבְּצָלִים", "batsal"),
  he_noun("he:melafefon", "veg.cucumber", "MASC", "מְלָפְפוֹן", "הַמְּלָפְפוֹן", "מְלָפְפוֹנִים", "הַמְּלָפְפוֹנִים", "melafefon")], "absent": []})
w('lang/he/lexicon/veg.2.json', {"lexemes": [
  he_noun("he:chatsil", "veg.eggplant", "MASC", "חָצִיל", "הֶחָצִיל", "חֲצִילִים", "הַחֲצִילִים", "chatsil"),
  he_noun("he:dlaat", "veg.pumpkin", "FEM", "דְּלַעַת", "הַדְּלַעַת", "דְּלוּעִים", "הַדְּלוּעִים", "dla'at")], "absent": []})

# ---------- Chinese ----------
w('lang/zh/language.json', {"code": "zh", "typology": "isolating", "name": "Chinese (Mandarin)", "nativeName": "中文", "script": "Hani", "dir": "ltr",
  "tokenJoin": "none", "capitalizeFirst": False, "vowelMarks": False, "romanization": "pinyin", "variants": ["simplified", "traditional"],
  "paradigmCells": {}})
def zh(lid, lemma, trad, pinyin, pos, senses, measure=None, **kw):
    d = {"id": lid, "lemma": lemma, "trad": trad, "pinyin": pinyin, "pos": pos, "senses": senses, **kw, "ref": {"src": "fixture"}}
    if measure: d["measure"] = measure
    return d
w('lang/zh/lexicon/core.1.json', {"lexemes": [
  zh("zh:ta.he", "他", "他", "tā", "PRON", ["pron.he"]),
  zh("zh:ta.she", "她", "她", "tā", "PRON", ["pron.she"]),
  zh("zh:chi", "吃", "吃", "chī", "VERB", ["verb.eat"]),
  zh("zh:he", "和", "和", "hé", "CCONJ", ["conj.and"]),
  zh("zh:yi", "一", "一", "yī", "NUM", [], role="the number one; with a measure word it plays the role of “a”"),
  zh("zh:ge", "个", "個", "gè", "CLF", [], role="the general measure word")],
  "absent": [
    {"concept": "det.def", "reason": "Chinese has no articles; definiteness comes from context, word order or 这/那 (this/that).", "use": "bare noun"},
    {"concept": "det.indef", "reason": "No indefinite article; when needed, 一 + a measure word (一个 …).", "use": "一 + measure word + noun"}]})
w('lang/zh/lexicon/veg.1.json', {"lexemes": [
  zh("zh:huluobo", "胡萝卜", "胡蘿蔔", "hú luó bo", "NOUN", ["veg.carrot"], ["根"]),
  zh("zh:yangcong", "洋葱", "洋蔥", "yáng cōng", "NOUN", ["veg.onion"], ["个", "颗"]),
  zh("zh:huanggua", "黄瓜", "黃瓜", "huáng guā", "NOUN", ["veg.cucumber"], ["根"])], "absent": []})
w('lang/zh/lexicon/veg.2.json', {"lexemes": [
  zh("zh:qiezi", "茄子", "茄子", "qié zi", "NOUN", ["veg.eggplant"], ["个", "根"]),
  zh("zh:nangua", "南瓜", "南瓜", "nán guā", "NOUN", ["veg.pumpkin"], ["个"])], "absent": []})

# ---------- lesson 0: greetings ----------
REF = {"src": "fixture", "checked": "2026-10-08"}
w('lang/de/lexicon/fd.01.json', {"lexemes": [{"id": "de:hallo", "lemma": "hallo", "pos": "INTJ", "senses": ["greet.hello"], "ref": REF}]})
w('lang/ar/lexicon/fd.01.json', {"lexemes": [{"id": "ar:marhaban", "lemma": "مَرْحَبًا", "pos": "INTJ", "senses": ["greet.hello"], "translit": "marḥaban", "ref": REF}]})
w('lang/he/lexicon/fd.01.json', {"lexemes": [{"id": "he:shalom", "lemma": "שָׁלוֹם", "pos": "INTJ", "senses": ["greet.hello"], "translit": "shalom", "ref": REF}]})
w('lang/zh/lexicon/fd.01.json', {"lexemes": [zh("zh:nihao", "你好", "你好", "nǐ hǎo", "INTJ", ["greet.hello"])]})
from mkmini_overview import OVERVIEW, ROOTS
for code, g in OVERVIEW.items(): w(f'lang/{code}/grammar/fn.overview.json', g)
for code, g in ROOTS.items(): w(f'lang/{code}/grammar/fn.root.pattern.json', g)

# ---------- grammar realizations ----------
def gram(fn, status, summary, **kw):
    return {"function": fn, "status": status, "summary": summary, **kw}
w('lang/de/grammar/fn.definite.json', gram("fn.definite", "realized", "German marks definiteness with articles: der/die/das (the) and ein/eine (a). The article also shows gender, number and case.",
  procedure={"askYourself": ["Is the thing known/specific (→ der/die/das) or new/any (→ ein/eine)?", "What is the gender of the noun?", "Which case does its role in the sentence need?"]},
  traps=["The article changes with the case: der Kürbis (subject) → den Kürbis (object).", "There is no plural of ein: “Gurken” alone means “cucumbers”."],
  evidence={"lemmas": ["de:der", "de:ein"]}, paradigmCells=["DET;NOM;SG;MASC", "DET;ACC;SG;MASC"], needs={"NOUN": 3}, generators=[{"type": "inflect", "pos": "DET", "count": 8}, {"type": "gender_article", "pos": "NOUN"}, {"type": "build_sentence", "bank": {"functions": ["fn.definite"]}}, {"type": "sentence_meaning"}]))
w('lang/ar/grammar/fn.definite.json', gram("fn.definite", "realized", "Arabic marks a definite noun with the prefix al- (الْ) and an indefinite noun with nunation (tanwīn).",
  procedure={"askYourself": ["Is the noun specific or generic (→ al-) or one of many (→ tanwīn)?", "Did I drop the tanwīn after adding al-?"]},
  traps=["Never al- and tanwīn together.", "Generic statements use al-: هِيَ تَأْكُلُ الْخِيَارَ = she eats cucumbers (in general)."],
  evidence={"tags": ["DEF"]}, paradigmCells=["N;NOM;SG;DEF", "N;NOM;SG;INDF"], needs={"NOUN": 3}, generators=[{"type": "inflect", "pos": "NOUN", "cells": ["N;NOM;SG;DEF", "N;NOM;SG;INDF"], "count": 8}]))
w('lang/he/grammar/fn.definite.json', gram("fn.definite", "realized", "Hebrew marks a definite noun with the prefix ha- (הַ); there is no indefinite article. A definite direct object takes אֶת.",
  procedure={"askYourself": ["Is the noun specific (→ הַ)?", "Is it the direct object and definite (→ אֶת before it)?"]},
  traps=["Before ח with kamatz the article becomes הֶ: הֶחָצִיל.", "No אֶת before an indefinite object: הוּא אוֹכֵל בָּצָל."],
  evidence={"tags": ["DEF"]}, paradigmCells=["N;SG;DEF", "N;SG;INDF"], needs={"NOUN": 3}, generators=[{"type": "inflect", "pos": "NOUN", "cells": ["N;SG;DEF"], "count": 8}]))
w('lang/zh/grammar/fn.definite.json', gram("fn.definite", "absent", "Chinese has no articles. A bare noun is read from context; 一 + measure word introduces one new thing; 这/那 point to a known one.",
  traps=["Do not translate “the” word by word."], needs={}, generators=[]))
w('lang/de/grammar/fn.plural.noun.json', gram("fn.plural.noun", "realized", "German nouns form the plural with -e, -er, -(e)n, -s or an umlaut; learn the plural together with the noun. Most feminine nouns take -(e)n.",
  procedure={"askYourself": ["What plural did I learn with this noun?", "Dative plural: does it need an extra -n?"]},
  traps=["Dative plural adds -n when possible: den Kürbissen.", "-is → -isse: der Kürbis, die Kürbisse."],
  evidence={"tags": ["PL"]}, paradigmCells=["N;NOM;PL", "N;DAT;PL"], needs={"NOUN": 3}, generators=[{"type": "inflect", "pos": "NOUN", "cells": ["N;NOM;PL"], "count": 8}]))
w('lang/ar/grammar/fn.plural.noun.json', gram("fn.plural.noun", "realized", "Arabic has singular, dual and plural; sound plurals (-ūn/-īn, -āt) and broken plurals. Most vegetables are collective nouns: جَزَر (carrots, as a kind); one piece is the unit noun جَزَرَة, counted pieces take -āt: جَزَرَات.",
  procedure={"askYourself": ["Do I mean the vegetable in general (→ collective) or counted pieces (→ unit noun, plural -āt)?"]},
  traps=["The sound feminine plural has -i (not -a) in the accusative: الْجَزَرَاتِ.", "Non-human plurals take feminine singular agreement."],
  evidence={"tags": ["PL"]}, paradigmCells=["N;NOM;PL;INDF", "N;NOM;PL;DEF"], needs={"NOUN": 3}, generators=[{"type": "inflect", "pos": "NOUN", "cells": ["N;NOM;PL;INDF"], "count": 8}]))
w('lang/he/grammar/fn.plural.noun.json', gram("fn.plural.noun", "realized", "Hebrew masculine nouns usually take -im (ים), feminine nouns -ot (וֹת); the vowels of the stem often change.",
  procedure={"askYourself": ["Masculine or feminine?", "Do the stem vowels shorten (גֶּזֶר → גְּזָרִים)?"]},
  traps=["The ending does not always follow the gender: דְּלַעַת (pumpkin) is feminine, yet its plural is דְּלוּעִים (-im).", "The stem vowels change in the plural: גֶּזֶר → גְּזָרִים, בָּצָל → בְּצָלִים."],
  evidence={"tags": ["PL"]}, paradigmCells=["N;PL;INDF"], needs={"NOUN": 3}, generators=[{"type": "inflect", "pos": "NOUN", "cells": ["N;PL;INDF"], "count": 8}, {"type": "transform", "bank": {"functions": ["fn.plural.noun"], "variant": "Number"}}]))
w('lang/zh/grammar/fn.plural.noun.json', gram("fn.plural.noun", "absent", "Chinese nouns do not change for number. Quantity is shown by numerals with measure words (三个洋葱), by context, or with 们 for groups of people.",
  traps=["Never add 们 to things: *洋葱们."], needs={}, generators=[]))

# ---------- bank ----------
def tok(t, l=None, f=None, parts=None, p=False):
    d = {"t": t}
    if p: d["p"] = True
    if l: d["l"] = l
    if f: d["f"] = f
    if parts: d["parts"] = parts
    return d
P = lambda t: tok(t, p=True)
def S(i, lang, frame, text, tokens, functions, gloss, variantOf=None, variant=None):
    d = {"id": f"{lang}.s.{i:03d}", "frame": frame, "text": text, "tokens": tokens, "functions": functions, "gloss": gloss, "level": "A1"}
    if variantOf: d["variantOf"] = variantOf; d["variant"] = variant
    return d
de = [
  S(1, "de", "fr.eat.def", "Sie isst die Karotte.", [tok("Sie", "de:sie", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("die", "de:der", "DET;ACC;SG;FEM"), tok("Karotte", "de:Karotte", "N;ACC;SG"), P(".")], ["fn.definite"], "She eats the carrot."),
  S(2, "de", "fr.eat.indef", "Er isst eine Zwiebel.", [tok("Er", "de:er", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("eine", "de:ein", "DET;ACC;SG;FEM"), tok("Zwiebel", "de:Zwiebel", "N;ACC;SG"), P(".")], ["fn.definite"], "He eats an onion."),
  S(3, "de", "fr.eat.generic", "Sie isst Gurken.", [tok("Sie", "de:sie", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("Gurken", "de:Gurke", "N;ACC;PL"), P(".")], ["fn.plural.noun"], "She eats cucumbers."),
  S(4, "de", "fr.eat.and", "Er isst die Karotte und die Zwiebel.", [tok("Er", "de:er", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("die", "de:der", "DET;ACC;SG;FEM"), tok("Karotte", "de:Karotte", "N;ACC;SG"), tok("und", "de:und"), tok("die", "de:der", "DET;ACC;SG;FEM"), tok("Zwiebel", "de:Zwiebel", "N;ACC;SG"), P(".")], ["fn.definite"], "He eats the carrot and the onion."),
  S(5, "de", "fr.eat.def.pl", "Sie isst die Auberginen.", [tok("Sie", "de:sie", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("die", "de:der", "DET;ACC;PL"), tok("Auberginen", "de:Aubergine", "N;ACC;PL"), P(".")], ["fn.definite", "fn.plural.noun"], "She eats the eggplants."),
  S(6, "de", "fr.eat.def2", "Er isst den Kürbis.", [tok("Er", "de:er", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("den", "de:der", "DET;ACC;SG;MASC"), tok("Kürbis", "de:Kürbis", "N;ACC;SG"), P(".")], ["fn.definite"], "He eats the pumpkin."),
  S(7, "de", "fr.eat.def", "Sie isst die Karotten.", [tok("Sie", "de:sie", "PRON;NOM"), tok("isst", "de:essen", "V;PRS;3;SG"), tok("die", "de:der", "DET;ACC;PL"), tok("Karotten", "de:Karotte", "N;ACC;PL"), P(".")], ["fn.definite", "fn.plural.noun"], "She eats the carrots.", "de.s.001", {"Number": "PL"}),
]
ar = [
  S(1, "ar", "fr.eat.def", "هِيَ تَأْكُلُ الْجَزَرَةَ.", [tok("هِيَ", "ar:hiya", "PRON;NOM"), tok("تَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;FEM"), tok("الْجَزَرَةَ", "ar:jazar", "N;ACC;SG;DEF"), P(".")], ["fn.definite"], "She eats the carrot."),
  S(2, "ar", "fr.eat.indef", "هُوَ يَأْكُلُ بَصَلَةً.", [tok("هُوَ", "ar:huwa", "PRON;NOM"), tok("يَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;MASC"), tok("بَصَلَةً", "ar:basal", "N;ACC;SG;INDF"), P(".")], [], "He eats an onion."),
  S(3, "ar", "fr.eat.generic", "هِيَ تَأْكُلُ الْخِيَارَ.", [tok("هِيَ", "ar:hiya", "PRON;NOM"), tok("تَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;FEM"), tok("الْخِيَارَ", "ar:khiyar", "N;ACC;COLL;DEF"), P(".")], ["fn.definite"], "She eats cucumbers (in general)."),
  S(4, "ar", "fr.eat.and", "هُوَ يَأْكُلُ الْجَزَرَةَ وَالْبَصَلَةَ.", [tok("هُوَ", "ar:huwa", "PRON;NOM"), tok("يَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;MASC"), tok("الْجَزَرَةَ", "ar:jazar", "N;ACC;SG;DEF"),
     tok("وَالْبَصَلَةَ", parts=[tok("وَ", "ar:wa"), tok("الْبَصَلَةَ", "ar:basal", "N;ACC;SG;DEF")]), P(".")], ["fn.definite"], "He eats the carrot and the onion."),
  S(5, "ar", "fr.eat.def.pl", "هِيَ تَأْكُلُ الْبَاذِنْجَانَاتِ.", [tok("هِيَ", "ar:hiya", "PRON;NOM"), tok("تَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;FEM"), tok("الْبَاذِنْجَانَاتِ", "ar:badhinjan", "N;ACC;PL;DEF"), P(".")], ["fn.definite", "fn.plural.noun"], "She eats the eggplants."),
  S(6, "ar", "fr.eat.def2", "هُوَ يَأْكُلُ الْقَرْعَةَ.", [tok("هُوَ", "ar:huwa", "PRON;NOM"), tok("يَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;MASC"), tok("الْقَرْعَةَ", "ar:qar", "N;ACC;SG;DEF"), P(".")], ["fn.definite"], "He eats the pumpkin."),
  S(7, "ar", "fr.eat.def", "هِيَ تَأْكُلُ الْجَزَرَاتِ.", [tok("هِيَ", "ar:hiya", "PRON;NOM"), tok("تَأْكُلُ", "ar:akala", "V;PRS;IND;3;SG;FEM"), tok("الْجَزَرَاتِ", "ar:jazar", "N;ACC;PL;DEF"), P(".")], ["fn.definite", "fn.plural.noun"], "She eats the carrots.", "ar.s.001", {"Number": "PL"}),
]
he = [
  S(1, "he", "fr.eat.def", "הִיא אוֹכֶלֶת אֶת הַגֶּזֶר.", [tok("הִיא", "he:hi"), tok("אוֹכֶלֶת", "he:akhal", "V;PRS;SG;FEM"), tok("אֶת", "he:et"), tok("הַגֶּזֶר", "he:gezer", "N;SG;DEF"), P(".")], ["fn.definite"], "She eats the carrot."),
  S(2, "he", "fr.eat.indef", "הוּא אוֹכֵל בָּצָל.", [tok("הוּא", "he:hu"), tok("אוֹכֵל", "he:akhal", "V;PRS;SG;MASC"), tok("בָּצָל", "he:batsal", "N;SG;INDF"), P(".")], [], "He eats an onion."),
  S(3, "he", "fr.eat.generic", "הִיא אוֹכֶלֶת מְלָפְפוֹנִים.", [tok("הִיא", "he:hi"), tok("אוֹכֶלֶת", "he:akhal", "V;PRS;SG;FEM"), tok("מְלָפְפוֹנִים", "he:melafefon", "N;PL;INDF"), P(".")], ["fn.plural.noun"], "She eats cucumbers."),
  S(4, "he", "fr.eat.and", "הוּא אוֹכֵל אֶת הַגֶּזֶר וְאֶת הַבָּצָל.", [tok("הוּא", "he:hu"), tok("אוֹכֵל", "he:akhal", "V;PRS;SG;MASC"), tok("אֶת", "he:et"), tok("הַגֶּזֶר", "he:gezer", "N;SG;DEF"),
     tok("וְאֶת", parts=[tok("וְ", "he:ve"), tok("אֶת", "he:et")]), tok("הַבָּצָל", "he:batsal", "N;SG;DEF"), P(".")], ["fn.definite"], "He eats the carrot and the onion."),
  S(5, "he", "fr.eat.def.pl", "הִיא אוֹכֶלֶת אֶת הַחֲצִילִים.", [tok("הִיא", "he:hi"), tok("אוֹכֶלֶת", "he:akhal", "V;PRS;SG;FEM"), tok("אֶת", "he:et"), tok("הַחֲצִילִים", "he:chatsil", "N;PL;DEF"), P(".")], ["fn.definite", "fn.plural.noun"], "She eats the eggplants."),
  S(6, "he", "fr.eat.def2", "הוּא אוֹכֵל אֶת הַדְּלַעַת.", [tok("הוּא", "he:hu"), tok("אוֹכֵל", "he:akhal", "V;PRS;SG;MASC"), tok("אֶת", "he:et"), tok("הַדְּלַעַת", "he:dlaat", "N;SG;DEF"), P(".")], ["fn.definite"], "He eats the pumpkin."),
  S(7, "he", "fr.eat.def", "הִיא אוֹכֶלֶת אֶת הַגְּזָרִים.", [tok("הִיא", "he:hi"), tok("אוֹכֶלֶת", "he:akhal", "V;PRS;SG;FEM"), tok("אֶת", "he:et"), tok("הַגְּזָרִים", "he:gezer", "N;PL;DEF"), P(".")], ["fn.definite", "fn.plural.noun"], "She eats the carrots.", "he.s.001", {"Number": "PL"}),
]
zh_ = [
  S(1, "zh", "fr.eat.def", "她吃胡萝卜。", [tok("她", "zh:ta.she"), tok("吃", "zh:chi"), tok("胡萝卜", "zh:huluobo"), P("。")], [], "She eats the carrot."),
  S(2, "zh", "fr.eat.indef", "他吃一个洋葱。", [tok("他", "zh:ta.he"), tok("吃", "zh:chi"), tok("一", "zh:yi"), tok("个", "zh:ge"), tok("洋葱", "zh:yangcong"), P("。")], [], "He eats an onion."),
  S(3, "zh", "fr.eat.generic", "她吃黄瓜。", [tok("她", "zh:ta.she"), tok("吃", "zh:chi"), tok("黄瓜", "zh:huanggua"), P("。")], [], "She eats cucumbers."),
  S(4, "zh", "fr.eat.and", "他吃胡萝卜和洋葱。", [tok("他", "zh:ta.he"), tok("吃", "zh:chi"), tok("胡萝卜", "zh:huluobo"), tok("和", "zh:he"), tok("洋葱", "zh:yangcong"), P("。")], [], "He eats the carrot and the onion."),
  S(5, "zh", "fr.eat.def.pl", "她吃茄子。", [tok("她", "zh:ta.she"), tok("吃", "zh:chi"), tok("茄子", "zh:qiezi"), P("。")], [], "She eats the eggplants."),
  S(6, "zh", "fr.eat.def2", "他吃南瓜。", [tok("他", "zh:ta.he"), tok("吃", "zh:chi"), tok("南瓜", "zh:nangua"), P("。")], [], "He eats the pumpkin."),
]
for code, arr in (("de", de), ("ar", ar), ("he", he), ("zh", zh_)):
    w(f'lang/{code}/bank/basic.json', {"sentences": arr})
print('written', OUT)

n = sum(1 for k in PROFILES)
print('profiles', n)
