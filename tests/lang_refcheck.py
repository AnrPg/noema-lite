#!/usr/bin/env python3
"""tools/lang_refcheck.py without the network: Wiktionary entries are stubbed, so the comparison rules are tested exactly.
Usage: python3 tests/lang_refcheck.py"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'tools'))
import lang_refcheck as R
fails = 0
def ok(c, m):
    global fails
    print(('  ✅ ' if c else '  ❌ ') + m)
    if not c: fails += 1

DB = {
 ('de', 'Kürbis'): [{'pos': 'noun', 'word': 'Kürbis', 'head_templates': [{'args': {'1': 'm'}, 'expansion': 'Kürbis m (strong, genitive Kürbisses or Kürbis, plural Kürbisse)'}],
     'senses': [{'glosses': ['pumpkin, gourd, squash']}],
     'forms': [{'form': 'Kürbis', 'tags': ['nominative', 'singular']}, {'form': 'Kürbisses', 'tags': ['genitive', 'singular']}, {'form': 'Kürbis', 'tags': ['genitive', 'singular']},
               {'form': 'Kürbisse', 'tags': ['definite', 'nominative', 'plural']}, {'form': 'Kürbissen', 'tags': ['dative', 'definite', 'plural']}]}],
 ('he', 'דלעת'): [{'pos': 'noun', 'word': 'דלעת', 'head_templates': [{'args': {'wv': 'דְּלַעַת', 'g': 'f'}, 'expansion': "דְּלַעַת • (dlá'at) f"}],
     'senses': [{'glosses': ['pumpkin', 'gourd']}],
     'forms': [{'form': 'דְּלַעַת', 'tags': ['canonical', 'feminine']}, {'form': 'דְּלוּעִים', 'tags': ['indefinite', 'plural']}]}],
 ('ar', 'بصل'): [{'pos': 'noun', 'word': 'بصل', 'senses': [{'glosses': ['onion']}],
     'forms': [{'form': 'بَصَل', 'tags': ['canonical', 'masculine']}, {'form': 'بَصَلٌ', 'tags': ['collective', 'indefinite', 'nominative', 'triptote']},
               {'form': 'بَصَلَةٌ', 'tags': ['ar-infl-a', 'collective', 'indefinite', 'nominative', 'singulative', 'triptote']},
               {'form': 'بَصَلَتَانِ', 'tags': ['collective', 'dual', 'indefinite', 'nominative', 'singulative']}]}],
 ('zh', '黃瓜'): [{'pos': 'noun', 'word': '黃瓜', 'senses': [{'glosses': ['cucumber (Classifier: 根 m; 條／条 c)']}],
     'sounds': [{'zh_pron': 'huángguā', 'tags': ['Mandarin', 'Pinyin']}]}],
 ('zh', '黄瓜'): [{'pos': 'soft-redirect', 'redirects': ['黃瓜']}],
}
R.fetch = lambda lang, w, offline=False: DB.get((lang, R.nfc(w)), [])

def lx(**k): return {'ref': {'src': 'test'}, **k}
r = R.check_lexeme('de', lx(id='de:Kürbis', lemma='Kürbis', pos='NOUN', gender='MASC', forms={'N;NOM;SG': 'Kürbis', 'N;GEN;SG': 'Kürbisses', 'N;NOM;PL': 'Kürbisse', 'N;DAT;PL': 'Kürbissen', 'N;ACC;SG': 'Kürbis'}), 'pumpkin', True)
ok(not r['problems'] and {'meaning', 'gender', 'N;GEN;SG', 'N;DAT;PL'} <= set(r['checked']) and 'N;ACC;SG' in r['unverified'], 'German: forms that Wiktionary lists are checked, the others stay unverified')
r = R.check_lexeme('de', lx(id='de:Kürbis', lemma='Kürbis', pos='NOUN', gender='FEM', forms={'N;NOM;PL': 'Kürbise'}), 'pumpkin', True)
ok(any(p.startswith('gender: FEM') for p in r['problems']) and any('Kürbise' in p and 'Kürbisse' in p for p in r['problems']), 'wrong gender and wrong plural are reported: ' + '; '.join(r['problems']))
r = R.check_lexeme('he', lx(id='he:dlaat', lemma='דְּלַעַת', pos='NOUN', gender='FEM', forms={'N;SG;INDF': 'דְּלַעַת', 'N;PL;INDF': 'דְּלָעוֹת'}), 'pumpkin', True)
ok(any('N;PL;INDF' in p and 'דְּלוּעִים' in p for p in r['problems']), 'Hebrew: an invented plural is caught')
r = R.check_lexeme('he', lx(id='he:dlaat', lemma='דְּלַעַת', pos='NOUN', gender='FEM', forms={'N;PL;INDF': 'דַּלּוּעִים'}), 'pumpkin', True)
ok(any('vowels it' in p for p in r['problems']), 'Hebrew: same letters, other vowels → “Wiktionary vowels it …”')
r = R.check_lexeme('ar', lx(id='ar:basal', lemma='بَصَل', pos='NOUN', **{'class': 'collective'}, gender='MASC', forms={'N;NOM;COLL;INDF': 'بَصَلٌ', 'N;NOM;SG;INDF': 'بَصَلَةٌ', 'N;NOM;PL;INDF': 'بَصَلَاتٌ'}), 'onion', True)
ok(not r['problems'] and {'N;NOM;COLL;INDF', 'N;NOM;SG;INDF'} <= set(r['checked']) and 'N;NOM;PL;INDF' in r['unverified'], 'Arabic collective: collective and unit noun matched to Wiktionary\'s collective/singulative tables, the dual is never taken for the plural')
r = R.check_lexeme('zh', lx(id='zh:huanggua', lemma='黄瓜', trad='黃瓜', pinyin='huáng guā', pos='NOUN', measure=['根', '条']), 'cucumber', True)
ok(any('条' in p and 'Mandarin' in p for p in r['problems']) and 'pinyin' in r['checked'] and 'trad' in r['checked'], 'Chinese: pinyin and traditional checked; a measure word listed only for Cantonese is reported')
r = R.check_lexeme('zh', lx(id='zh:huanggua', lemma='黄瓜', trad='黃瓜', pinyin='huáng gūa', pos='NOUN'), 'cucumber', True)
ok(any(p.startswith('pinyin') for p in r['problems']), 'Chinese: wrong pinyin reported')
r = R.check_lexeme('zh', {'id': 'zh:huanggua', 'lemma': '黄瓜', 'trad': '黃瓜', 'pinyin': 'huáng guā', 'pos': 'NOUN', 'measure': ['根', '条'], 'ref': {'src': 'test', 'override': {'measure': '一条黄瓜 is common in Mainland usage'}}}, 'cucumber', True)
ok(not r['problems'] and r.get('overridden'), 'a difference explained in ref.override is accepted and listed')
r = R.check_lexeme('de', lx(id='de:Tomate', lemma='Tomate', pos='NOUN', gender='FEM'), 'tomato', True)
ok(not r['problems'] and r['unverified'], 'a word Wiktionary does not have is unverified, not wrong')
DB[('de', 'Paprika')] = [{'pos': 'noun', 'word': 'Paprika', 'senses': [{'glosses': ['bell pepper']}], 'head_templates': [{'args': {'1': 'm,f'}, 'expansion': 'Paprika m or f (strong, genitive Paprikas, plural Paprikas)'}], 'forms': []}]
r = R.check_lexeme('de', lx(id='de:Paprika', lemma='Paprika', pos='NOUN', gender='FEM'), 'bell pepper', True)
ok('gender' in r['checked'] and not r['problems'], 'a noun with two genders in Wiktionary accepts either')
DB[('de', 'kein')] = [{'pos': 'pron', 'word': 'kein', 'senses': [{'glosses': ['no, not any']}], 'forms': [{'form': 'keinen', 'tags': ['accusative', 'masculine', 'singular']}]}]
r = R.check_lexeme('de', lx(id='de:kein', lemma='kein', pos='DET', forms={'DET;ACC;SG;MASC': 'keinen'}), 'not (negation)', True)
ok(not r['problems'] and 'DET;ACC;SG;MASC' in r['checked'], 'a determiner filed as a pronoun by Wiktionary is still checked')
DB[('de', 'essen')] = [{'pos': 'verb', 'word': 'essen', 'senses': [{'glosses': ['to eat']}], 'forms': [{'form': 'aß', 'tags': ['indicative', 'preterite', 'singular', 'third-person']}, {'form': 'gegessen', 'tags': ['participle', 'past']}]}]
r = R.check_lexeme('de', lx(id='de:essen', lemma='essen', pos='VERB', forms={'V;PST;3;SG': 'aß', 'V;PTCP;PST': 'gegessen'}), 'to eat', True)
ok({'V;PST;3;SG', 'V;PTCP;PST'} <= set(r['checked']), 'German preterite and participle are checked')
DB[('de', 'er')] = [{'pos': 'pron', 'word': 'er', 'senses': [{'glosses': ['he']}], 'forms': [{'form': 'er', 'tags': ['nominative', 'singular', 'masculine', 'third-person']}, {'form': 'ihn', 'tags': ['accusative', 'singular', 'masculine', 'third-person']}, {'form': 'mich', 'tags': ['accusative', 'singular', 'first-person']}]}]
r = R.check_lexeme('de', lx(id='de:er', lemma='er', pos='PRON', forms={'PRON;ACC': 'ihn'}), 'he', True)
ok('PRON;ACC' in r['checked'] and not r['problems'], 'pronoun cells are checked against the row of that pronoun only (not mich)')
r = R.check_lexeme('de', {'id': 'de:x', 'lemma': 'kein', 'pos': 'NOUN', 'ref': {'src': 't', 'override': {'pos': 'reason'}}}, 'no', True)
ok(not r['problems'] and r.get('overridden'), 'even a part-of-speech difference can be explained with override {"pos": …}')
DB[('he', 'קישוא')] = [{'pos': 'noun', 'word': 'קישוא', 'senses': [{'glosses': ['zucchini']}], 'forms': [{'form': 'קִשּׁוּא', 'tags': ['canonical', 'masculine']}, {'form': 'קִשּׁוּאִים', 'tags': ['indefinite', 'plural']}]}]
r = R.check_lexeme('he', lx(id='he:kishu', lemma='קִשּׁוּא', pos='NOUN', gender='MASC', forms={'N;PL;INDF': 'קִשּׁוּאִים'}, plene={'N;SG;INDF': 'קישוא'}), 'zucchini', True)
ok('N;PL;INDF' in r['checked'] and not r['problems'], 'a word Wiktionary files under its full spelling is found through plene')
print(f'\n{fails} FAILED' if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
