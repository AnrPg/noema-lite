#!/usr/bin/env python3
"""tools/validate_lang.py: the mini course passes, and every kind of mistake is caught with a clear message.
Also checks tools/langlib.py against the shared vectors (tests/fixtures/lang-vectors.json).
Usage: python3 tests/lang_validate.py"""
import json, os, shutil, sys, tempfile, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import langlib
from validate_lang import validate
MINI = os.path.join(HERE, 'fixtures', 'lang-mini')
fails = 0
class Raw(str): pass   # a mutation that returns Raw replaces the file text itself
def ok(c, m):
    global fails
    print(('  ✅ ' if c else '  ❌ ') + m)
    if not c: fails += 1

# ---------- shared vectors ----------
vec = json.load(open(os.path.join(HERE, 'fixtures', 'lang-vectors.json'), encoding='utf-8'))
bad = [c for c in vec['canon'] if langlib.canon(c[0]) != c[1]]
ok(not bad, f'canon: {len(vec["canon"])} vectors' + (f' — wrong: {bad}' if bad else ''))
bad = [c for c in vec['strip'] if langlib.strip_marks(c[0], c[1]) != unicodedata.normalize('NFC', c[2])]
ok(not bad, f'strip_marks: {len(vec["strip"])} vectors' + (f' — wrong: {bad}' if bad else ''))
bad = [c for c in vec['pinyinValid'] if (not langlib.pinyin_syllable_errors(c[0])) != c[1]]
ok(not bad, f'pinyin syllables: {len(vec["pinyinValid"])} vectors' + (f' — wrong: {[(c[0], langlib.pinyin_syllable_errors(c[0])) for c in bad]}' if bad else ''))
bad = [c for c in vec['pinyinNumbers'] if langlib.pinyin_numbers_to_marks(c[0]) != c[1] or langlib.pinyin_marks_to_numbers(c[1]) != c[2]]
ok(not bad, f'pinyin numbers ↔ marks: {len(vec["pinyinNumbers"])} vectors' + (f' — wrong: {bad}' if bad else ''))
bad = [c for c in vec['join'] if langlib.join_tokens(c[0], c[1]) != c[2]]
ok(not bad, f'join tokens: {len(vec["join"])} vectors' + (f' — wrong: {bad}' if bad else ''))

# ---------- the mini course ----------
v = validate(MINI, strict=True)
ok(not v.errors, 'the mini course is valid' + (f': {v.errors[:5]}' if v.errors else ''))

# ---------- the JSON Schema agrees with the files (when the jsonschema package is installed) ----------
try:
    import jsonschema, glob
    if not hasattr(jsonschema, 'Draft202012Validator'): raise ImportError('jsonschema too old for draft 2020-12')
    sch = json.load(open(os.path.join(ROOT, 'tools', 'schemas', 'noema.lang.v1.schema.json'), encoding='utf-8'))
    kinds = [('course.json', 'course'), ('core/fields/*.json', 'field'), ('core/nodes.json', 'nodes'), ('core/functions/*.json', 'function'), ('core/frames.json', 'frames'), ('core/typology.json', 'typology'),
             ('lang/*/language.json', 'language'), ('lang/*/lexicon/*.json', 'lexicon'), ('lang/*/grammar/*.json', 'grammar'), ('lang/*/bank/*.json', 'bank')]
    probs, n = [], 0
    for pat, k in kinds:
        for f in glob.glob(os.path.join(MINI, pat)):
            n += 1
            sub = {**sch, '$ref': f'#/$defs/{k}'}
            for e in jsonschema.Draft202012Validator(sub).iter_errors(json.load(open(f, encoding='utf-8'))): probs.append(f'{os.path.relpath(f, MINI)}: {e.message}')
    ok(not probs and n > 30, f'the JSON Schema accepts all {n} files of the mini course' + (f': {probs[:3]}' if probs else ''))
except ImportError as e:
    print(f'  ⏭  schema check skipped ({e})')

def mutated(change):
    d = tempfile.mkdtemp(prefix='lang-mini-'); dst = os.path.join(d, 'c'); shutil.copytree(MINI, dst)
    def J(rel, fn=None):
        p = os.path.join(dst, rel)
        if fn is None: return p
        with open(p, encoding='utf-8') as f: obj = json.load(f)
        r = fn(obj)
        with open(p, 'w', encoding='utf-8') as f: f.write(r if isinstance(r, Raw) else json.dumps(obj, ensure_ascii=False, indent=1))
    change(J, dst)
    v = validate(dst, strict=True); shutil.rmtree(d); return v.errors

def expect(name, change, needle):
    errs = mutated(change)
    hit = [e for e in errs if needle in e]
    ok(bool(hit), f'{name} → “{hit[0] if hit else needle}”' + ('' if hit else f' (got {errs[:3]})'))

def sent(lang, i): return lambda o: o['sentences'][i]
def set_tok(lang, si, ti, **kw):
    def f(o):
        o['sentences'][si]['tokens'][ti].update(kw)
    return f
expect('wrong form in a sentence', lambda J, d: J('lang/de/bank/basic.json', set_tok('de', 0, 3, t='Karotten')), 'is not the N;ACC;SG form of de:Karotte')
expect('cell missing from a paradigm', lambda J, d: J('lang/de/lexicon/veg.1.json', lambda o: o['lexemes'][0]['forms'].pop('N;GEN;PL')), 'missing cell N;GEN;PL')
expect('unknown word in a sentence', lambda J, d: J('lang/de/bank/basic.json', set_tok('de', 0, 3, l='de:Tomate')), 'unknown lexeme “de:Tomate”')
expect('cycle in the DAG', lambda J, d: J('core/nodes.json', lambda o: o['nodes'][0].update(prereqs=['veg.2'])), 'cycle:')
expect('lexicon of a node missing in a language', lambda J, d: os.remove(J('lang/he/lexicon/veg.2.json')), 'lang/he/lexicon/veg.2.json: missing file')
expect('text ≠ tokens', lambda J, d: J('lang/zh/bank/basic.json', lambda o: o['sentences'][0].update(text='她吃胡萝卜')), '≠ the tokens joined')
expect('pinyin syllables ≠ characters', lambda J, d: J('lang/zh/lexicon/veg.1.json', lambda o: o['lexemes'][0].update(pinyin='hú luó')), '2 pinyin syllables for 3 characters')
expect('tone mark on the wrong vowel', lambda J, d: J('lang/zh/lexicon/veg.1.json', lambda o: o['lexemes'][2].update(pinyin='huáng gūa')), 'the tone mark belongs on “a”')
expect('Hebrew form without vowel marks', lambda J, d: J('lang/he/lexicon/veg.1.json', lambda o: o['lexemes'][0]['forms'].update({'N;PL;INDF': 'גזרים'})), 'has no vowel marks')
expect('function listed without evidence', lambda J, d: J('lang/de/bank/basic.json', lambda o: o['sentences'][2]['functions'].append('fn.definite')), 'listed as fn.definite, but no word shows it')
expect('function absent in the language', lambda J, d: J('lang/zh/bank/basic.json', lambda o: o['sentences'][0]['functions'].append('fn.plural.noun')), 'is absent in zh')
expect('concept neither realized nor absent', lambda J, d: J('lang/ar/lexicon/core.1.json', lambda o: o['absent'].pop(0)), 'concept “det.def” has no word and is not marked absent')
expect('text not in NFC', lambda J, d: J('lang/he/lexicon/veg.1.json', lambda o: Raw(json.dumps(o, ensure_ascii=False).replace(unicodedata.normalize('NFC', '\u05d1\u05bc\u05b8'), '\u05d1\u05bc\u05b8'))), 'not in Unicode NFC')
expect('frame without a sentence in a language', lambda J, d: J('lang/he/bank/basic.json', lambda o: o.update(sentences=[s for s in o['sentences'] if s['frame'] != 'fr.eat.def2'])), 'frame “fr.eat.def2” has no sentence in he')
expect('concept in two nodes', lambda J, d: J('core/nodes.json', lambda o: o['nodes'][5]['concepts'].append('veg.carrot')), 'is taught twice in')
# ---------- paths and lessons (D9–D11) ----------
N_ = lambda i, **kw: (lambda J, d: J('core/nodes.json', lambda o: o['nodes'][i].update(**kw)))
expect('lesson without functions', N_(0, functions={}), 'a lesson needs its grammar')
expect('lesson with an unknown function', N_(1, functions={'*': ['fn.definite', 'fn.nothing']}), 'unknown function “fn.nothing”')
expect('functions for an unknown key', N_(1, functions={'*': ['fn.definite'], 'tonal': ['fn.definite']}), '“tonal” is not "*", a language type or a course language')
expect('unknown path', N_(2, path='tonal'), 'path must be one of')
expect('functions on a field node', N_(4, functions=['fn.definite']), 'only lessons have functions')
expect('two first lessons', N_(1, prereqs=[]), 'must form one chain')
expect('first lesson is not the overview', lambda J, d: J('core/nodes.json', lambda o: (o['nodes'][0].update(functions={'*': ['fn.definite']}), o['nodes'][1].update(functions={'*': ['fn.overview']}))), 'is the overview')
expect('field opens before the foundations', N_(3, prereqs=['fd.00']), 'the field opens before the foundations are done')
expect('word file for a node that does not apply', lambda J, d: shutil.copy(J('lang/ar/lexicon/fd.01.json'), os.path.join(d, 'lang/ar/lexicon/fd.01x.json')), 'node fd.01x does not apply to ar')
expect('language without its type', lambda J, d: J('lang/he/language.json', lambda o: o.pop('typology')), 'typology must be one of')
expect('lesson function without realization', lambda J, d: os.remove(J('lang/he/grammar/fn.root.pattern.json')), 'lesson fd.01 needs this realization')
expect('quiz answer not among the options', lambda J, d: J('lang/de/grammar/fn.overview.json', lambda o: o['quiz'][0].update(answer='tonal')), 'answer must be one of the options')
expect('overview without peculiarities', lambda J, d: J('lang/zh/grammar/fn.overview.json', lambda o: o.update(peculiarities=o['peculiarities'][:1])), 'peculiarities: at least 3')
expect('overview of the wrong type', lambda J, d: J('lang/zh/grammar/fn.overview.json', lambda o: o['typology'].update(type='fusional')), 'typology.type must be the language’s type')
expect('step that is not a number', N_(1, step='one'), 'step must be a whole number')
expect('typology text incomplete', lambda J, d: J('core/typology.json', lambda o: o['types'].pop()), 'types must be exactly')
expect('lemma ≠ citation form', lambda J, d: J('lang/de/lexicon/core.1.json', lambda o: o['lexemes'][2].update(lemma='isst')), 'must be the V;NFIN form')
expect('German noun without gender', lambda J, d: J('lang/de/lexicon/veg.2.json', lambda o: o['lexemes'][1].pop('gender')), 'gender is required')
expect('Chinese noun without measure word', lambda J, d: J('lang/zh/lexicon/veg.2.json', lambda o: o['lexemes'][1].pop('measure')), 'needs its measure word')
expect('parts that do not spell the token', lambda J, d: J('lang/he/bank/basic.json', lambda o: o['sentences'][3]['tokens'][4]['parts'][0].update(t='וּ')), 'the parts do not spell the token')
expect('unknown tag in a cell', lambda J, d: J('lang/de/language.json', lambda o: o['paradigmCells']['VERB'].append('V;PRSNT;1;SG')), 'unknown tag “PRSNT”')
expect('field without sources', lambda J, d: J('core/fields/food.vegetables.json', lambda o: o.pop('sources')), '“sources” is required')
expect('variant of a missing sentence', lambda J, d: J('lang/ar/bank/basic.json', lambda o: o['sentences'][6].update(variantOf='ar.s.099')), 'variantOf “ar.s.099” does not exist')
expect('capital letter only allowed at the start', lambda J, d: J('lang/de/bank/basic.json', set_tok('de', 3, 4, t='Und')), '“Und” is not the lemma form of de:und')

expect('plene spelling with vowel marks', lambda J, d: J('lang/he/lexicon/veg.1.json', lambda o: o['lexemes'][0].update(plene={'N;SG;INDF': 'גֶּזֶר'})), 'must be written without vowel marks')
expect('question evidence by punctuation', lambda J, d: J('lang/de/grammar/fn.definite.json', lambda o: o.update(evidence={'punct': ['?']})), 'listed as fn.definite, but no word shows it (evidence {\'punct\'')

expect('evidence excluded by a word (a wh-word is not a yes/no question)', lambda J, d: J('lang/de/grammar/fn.definite.json', lambda o: o['evidence'].update(exclude=['de:sie'])), 'de.s.001: listed as fn.definite, but no word shows it')
expect('plural-only noun needs no gender, others do', lambda J, d: J('lang/de/lexicon/veg.2.json', lambda o: [o['lexemes'][0].update({'class': 'plt'}), o['lexemes'][0].pop('gender'), o['lexemes'][1].pop('gender')]), 'de:Kürbis: gender is required')

# word profiles (§4.6)
PR = lambda rel, i, fn: (lambda J, d: J(rel, lambda o: fn(o['lexemes'][i]['profile'])))
expect('content word without a profile', lambda J, d: J('lang/de/lexicon/veg.1.json', lambda o: o['lexemes'][0].pop('profile')), 'a word profile is required')
expect('example without the word', PR('lang/de/lexicon/veg.1.json', 0, lambda p: p['examples'][0].update(text='Ich schäle die Möhren.')), 'does not contain the word')
expect('Hebrew example without vowel marks', PR('lang/he/lexicon/veg.1.json', 0, lambda p: p['examples'][0].update(text='אמא מגררת גזר לסלט.')), 'does not contain the word')
expect('Arabic example with other vowels', PR('lang/ar/lexicon/veg.1.json', 1, lambda p: p['examples'][1].update(text='رَائِحَةُ الْبُصُلِ قَوِيَّةٌ.')), 'does not contain the word')
expect('fewer than 3 examples', PR('lang/zh/lexicon/veg.2.json', 1, lambda p: p.update(examples=p['examples'][:2])), 'at least 3 examples')
expect('examples in one context only', PR('lang/de/lexicon/veg.2.json', 1, lambda p: [e.update(context='cooking') for e in p['examples']]), 'at least 2 different contexts')
expect('unknown register', PR('lang/de/lexicon/veg.1.json', 2, lambda p: p['senses'][2].update(register=['streetwise'])), 'unknown register “streetwise”')
expect('quote without a source', PR('lang/de/lexicon/core.1.json', 2, lambda p: p['phrases'][2].pop('source')), '“source” is required')
expect('no synonyms and no reason', PR('lang/he/lexicon/veg.1.json', 0, lambda p: p.pop('synonymsNone')), 'say why in synonymsNone')
expect('synonym without register', PR('lang/de/lexicon/core.1.json', 2, lambda p: p['synonyms'][0].pop('register')), 'synonyms are compared by register')
expect('no etymology', PR('lang/ar/lexicon/veg.2.json', 0, lambda p: p.pop('etymology')), 'etymology {text, src} is required')
expect('no pitfall', PR('lang/zh/lexicon/core.1.json', 2, lambda p: p.update(pitfalls=[])), 'at least one pitfall')
expect('no subtlety', PR('lang/zh/lexicon/core.1.json', 2, lambda p: p.update(subtleties=[])), 'at least one subtlety')
expect('concept without a sense', PR('lang/he/lexicon/veg.2.json', 0, lambda p: p['senses'][0].pop('concept')), 'no sense explains the concept')
expect('example of an unknown sense', PR('lang/zh/lexicon/veg.1.json', 0, lambda p: p['examples'][0].update(sense='s9')), 'unknown sense “s9”')
expect('only one collocation', PR('lang/de/lexicon/veg.2.json', 0, lambda p: p.update(collocations=p['collocations'][:1])), 'at least 2 collocations')

# an unfinished course: missing node content is a warning without --strict, an error with it
def unfinished(J, d): os.remove(J('lang/zh/lexicon/veg.2.json'))
dd = tempfile.mkdtemp(); dst = os.path.join(dd, 'c'); shutil.copytree(MINI, dst); os.remove(os.path.join(dst, 'lang/zh/lexicon/veg.2.json'))
vs, vl = validate(dst, strict=True), validate(dst, strict=False); shutil.rmtree(dd)
ok(any('missing file' in e for e in vs.errors) and not any('veg.2.json' in e for e in vl.errors) and any('not prepared yet' in w for w in vl.warns), 'unfinished course: “not prepared yet” is a warning, an error only with --strict')

print(f'\n{fails} FAILED' if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
