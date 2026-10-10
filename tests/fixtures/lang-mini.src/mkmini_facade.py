"""Mini course: the facade of every word (D14) and every meaning a concept (D15) — frozen from the real course on 2026-10-08."""
import json
DATA = json.loads(r"""{
 "decls": {
  "ar": {
   "CCONJ": [
    {
     "id": "translit",
     "title": "transliteration",
     "at": "top",
     "type": "string",
     "phenomenon": "ar.orth.romanization",
     "why": "Shows the vowels."
    },
    {
     "id": "prefix",
     "title": "written attached",
     "at": "top",
     "type": "bool",
     "phenomenon": "ar.morph.prefix_clitics",
     "why": "وَ and فَ are written together with the next word."
    },
    {
     "id": "governs",
     "title": "what follows",
     "type": "enum",
     "values": [
      "ACC+suffix",
      "clause",
      "words or clauses"
     ],
     "phenomenon": "ar.syn.inna_sisters",
     "why": "لٰكِنَّ takes a noun in the accusative or a pronoun suffix; the others join words or whole clauses."
    }
   ],
   "INTJ": [
    {
     "id": "translit",
     "title": "transliteration",
     "at": "top",
     "type": "string",
     "phenomenon": "ar.orth.romanization",
     "why": "Shows the vowels of the formula."
    },
    {
     "id": "addressee",
     "title": "said to",
     "type": "enum",
     "values": [
      "MASC",
      "FEM",
      "PL",
      "any"
     ],
     "phenomenon": "ar.prag.addressee_gender",
     "why": "Many formulas change with the person addressed: a man, a woman, a group (كَيْفَ حَالُكَ / حَالُكِ / حَالُكُمْ)."
    },
    {
     "id": "response",
     "title": "fixed answer",
     "type": "string",
     "none": true,
     "phenomenon": "ar.prag.greeting_pairs",
     "why": "The answer this formula gets (صَبَاحُ الْخَيْرِ → صَبَاحُ النُّورِ); “none” when there is no fixed answer."
    }
   ],
   "NOUN": [
    {
     "id": "gender",
     "title": "gender",
     "at": "top",
     "type": "enum",
     "values": [
      "MASC",
      "FEM"
     ],
     "phenomenon": "ar.morph.gender",
     "why": "Drives the agreement of adjectives, verbs and pronouns and the polarity of the numbers 3–10."
    },
    {
     "id": "translit",
     "title": "transliteration",
     "at": "top",
     "type": "string",
     "phenomenon": "ar.orth.romanization",
     "why": "Shows the vowels and the sounds until the script is read fluently: the pausal form, without case or tanwīn ending (kitāb, muḥāmī, maqhā)."
    },
    {
     "id": "root",
     "title": "root (radicals)",
     "type": "string",
     "none": true,
     "phenomenon": "ar.morph.root",
     "why": "Links the word to its family and to the dictionary; “none” for loanwords and for phrases (their parts have their own roots)."
    },
    {
     "id": "pattern",
     "title": "pattern (wazn)",
     "type": "string",
     "none": true,
     "phenomenon": "ar.morph.pattern",
     "why": "The measure in ف ع ل letters (mafʿal = place, mifʿāl = tool, fāʿil = doer …) lets the learner guess new words; “none” for loanwords, phrases and words that fit no measure."
    },
    {
     "id": "sunLetter",
     "title": "sun letter (al- assimilates)",
     "type": "bool",
     "phenomenon": "ar.orth.sun_letters",
     "why": "With a sun letter the l of the article is not pronounced and the letter is doubled: الشَّمْسُ aš-šams; with a moon letter: الْقَمَرُ al-qamar."
    },
    {
     "id": "human",
     "title": "human (agreement class)",
     "type": "bool",
     "phenomenon": "ar.syn.nonhuman_plural",
     "why": "Plurals of people agree in the plural; all other plurals agree as feminine singular (الْكُتُبُ جَدِيدَةٌ)."
    },
    {
     "id": "plurals",
     "title": "plurals",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "kind": "enum:broken|soundMasc|soundFem",
      "pattern": "string?",
      "declension": "enum:triptote|diptote|defective|invariable|sound",
      "note": "string?",
      "senses": "senses"
     },
     "phenomenon": "ar.morph.plural.broken",
     "why": "The plural is learned with the noun: its kind (broken, sound masculine -ūna, sound feminine -āt), its pattern and declension, and the meanings it belongs to (بُيُوت houses / أَبْيَات verses). “none” for mass nouns, names and words used only in the singular."
    },
    {
     "id": "dual",
     "title": "dual",
     "type": "string",
     "none": true,
     "phenomenon": "ar.morph.number.dual",
     "why": "Mostly regular (-āni), but ة becomes ت (سَنَتَانِ) and some duals are irregular (أَبَوَانِ); “none” for mass nouns, names and plural-only words."
    },
    {
     "id": "declension",
     "title": "declension (of the singular; of the head noun in a phrase)",
     "type": "enum",
     "values": [
      "triptote",
      "diptote",
      "defective",
      "invariable",
      "dual"
     ],
     "phenomenon": "ar.morph.diptote",
     "why": "Triptotes take tanwīn and -i in the genitive; diptotes (names, أَفْعَل, -ān, many broken plurals) take no tanwīn and -a; defective nouns end in -in (مُحَامٍ); invariable nouns never change (مَقْهًى، كُوسَا)."
    },
    {
     "id": "unit",
     "title": "unit noun",
     "type": "string",
     "classes": [
      "NOUN.collective"
     ],
     "phenomenon": "ar.morph.collective_unit",
     "why": "One piece of a collective (تُفَّاحَة from تُفَّاح); needed for counting."
    },
    {
     "id": "meaningForms",
     "title": "forms of one meaning only",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "what": "string",
      "senses": "senses"
     },
     "phenomenon": "ar.sem.polysemy_homonymy",
     "why": "A form (a fixed phrase, another maṣdar, an adverbial accusative …) that belongs to one meaning of the word; “none” when every meaning has the same forms. Per-meaning plurals are in plurals."
    }
   ],
   "PRON": [
    {
     "id": "translit",
     "title": "transliteration",
     "at": "top",
     "type": "string",
     "phenomenon": "ar.orth.romanization",
     "why": "Shows the vowels."
    },
    {
     "id": "person",
     "title": "person, number, gender",
     "type": "string",
     "classes": [
      "PRON"
     ],
     "phenomenon": "ar.morph.pron.gender2",
     "why": "Gender in the 2nd and 3rd person (أَنْتَ / أَنْتِ، هُمْ / هُنَّ)."
    },
    {
     "id": "suffix",
     "title": "attached form",
     "type": "string",
     "classes": [
      "PRON"
     ],
     "phenomenon": "ar.morph.suffix_pronouns",
     "why": "The pronoun as an ending on nouns, verbs and prepositions (كِتَابُكَ، يَرَاهُ، لَهَا)."
    }
   ],
   "VERB": [
    {
     "id": "translit",
     "title": "transliteration",
     "at": "top",
     "type": "string",
     "phenomenon": "ar.orth.romanization",
     "why": "Shows the vowels of the 3rd person singular past (the citation form)."
    },
    {
     "id": "root",
     "title": "root (radicals)",
     "type": "string",
     "phenomenon": "ar.morph.root",
     "why": "The verb is the centre of its word family."
    },
    {
     "id": "rootClass",
     "title": "root class",
     "type": "strings",
     "values": [
      "sound",
      "hollow",
      "defective",
      "assimilated",
      "doubled",
      "hamzated"
     ],
     "phenomenon": "ar.morph.root.weak",
     "why": "Weak radicals (و ي), a doubled radical or hamza change the conjugation: hollow قَالَ، defective مَشَى، assimilated وَصَلَ، doubled أَحَبَّ، hamzated أَكَلَ."
    },
    {
     "id": "verbForm",
     "title": "verb form",
     "type": "enum",
     "values": [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X"
     ],
     "phenomenon": "ar.morph.verb.forms",
     "why": "Form I … X gives the present, participle and maṣdar patterns and a typical meaning."
    },
    {
     "id": "present",
     "title": "present (imperfect) 3rd person singular",
     "type": "string",
     "none": true,
     "phenomenon": "ar.morph.verb.stem_vowel",
     "why": "The second principal part: the stem vowel of form I (يَكْتُبُ / يَشْرَبُ / يَجْلِسُ) cannot be predicted. “none” for a verb that has no present."
    },
    {
     "id": "masdar",
     "title": "verbal noun (maṣdar)",
     "type": "strings",
     "none": true,
     "phenomenon": "ar.morph.masdar",
     "why": "Arabic’s “infinitive” (to eat = أَكْل); unpredictable for form I. “none” for a verb that has none."
    },
    {
     "id": "participles",
     "title": "active / passive participle",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "kind": "enum:active|passive"
     },
     "phenomenon": "ar.morph.participles",
     "why": "Very frequent as nouns and adjectives (كَاتِب writer, مَكْتُوب written); the passive participle only for verbs with an object."
    },
    {
     "id": "governs",
     "title": "object and preposition",
     "type": "list",
     "none": true,
     "item": {
      "case": "enum:ACC|GEN?",
      "prep": "string?",
      "what": "string",
      "senses": "senses"
     },
     "phenomenon": "ar.syn.verb_government",
     "why": "What the verb takes: a direct object (accusative) or a preposition (ذَهَبَ إِلَى، خَرَجَ مِنْ، اِنْتَظَرَ + acc.), per meaning. “none” for a verb used without an object."
    },
    {
     "id": "meaningForms",
     "title": "forms of one meaning only",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "what": "string",
      "senses": "senses"
     },
     "phenomenon": "ar.sem.polysemy_homonymy",
     "why": "A form (a fixed phrase, another maṣdar, an adverbial accusative …) that belongs to one meaning of the word; “none” when every meaning has the same forms. Per-meaning plurals are in plurals."
    }
   ]
  },
  "he": {
   "ADP": [
    {
     "id": "translit",
     "title": "learner transliteration",
     "phenomenon": "he.orth.romanization",
     "type": "string",
     "at": "top",
     "why": "Until the script is learned every word is shown with its romanization, in one scheme: ch for ח and כ, ts for צ, sh for שׁ, ei for ֵי, an apostrophe before an ע / א that opens a syllable inside a word, a hyphen after a prefix (be-, le-)."
    },
    {
     "id": "prefix",
     "title": "written onto the next word",
     "phenomenon": "he.orth.prefix-clitics",
     "type": "bool",
     "at": "top",
     "why": "בְּ, לְ, מִ are prefixes, written onto the next word and fused with the article (בַּבַּיִת); the others are words of their own."
    },
    {
     "id": "spelling",
     "title": "everyday spelling (no vowel points)",
     "phenomenon": "he.orth.ktiv-male",
     "type": "string",
     "why": "Everyday texts are unvocalized: the learner must read and type the standard full spelling (ktiv male), which often adds ו or י to the stripped form (שֻׁלְחָן → שולחן)."
    },
    {
     "id": "pronForms",
     "title": "forms with personal endings",
     "phenomenon": "he.morph.prep-suffix",
     "type": "list",
     "none": true,
     "item": {
      "cell": "cell",
      "form": "string"
     },
     "why": "Prepositions take endings instead of pronouns, often with another stem (עִם → אִתִּי, מִ → מִמֶּנִּי, אֶת → אוֹתִי)."
    }
   ],
   "CCONJ": [
    {
     "id": "translit",
     "title": "learner transliteration",
     "phenomenon": "he.orth.romanization",
     "type": "string",
     "at": "top",
     "why": "Until the script is learned every word is shown with its romanization, in one scheme: ch for ח and כ, ts for צ, sh for שׁ, ei for ֵי, an apostrophe before an ע / א that opens a syllable inside a word, a hyphen after a prefix (be-, le-)."
    },
    {
     "id": "prefix",
     "title": "written onto the next word",
     "phenomenon": "he.orth.prefix-clitics",
     "type": "bool",
     "at": "top",
     "why": "וְ is a prefix with several spellings (וּ, וַ); אוֹ and אֲבָל are words of their own."
    },
    {
     "id": "spelling",
     "title": "everyday spelling (no vowel points)",
     "phenomenon": "he.orth.ktiv-male",
     "type": "string",
     "why": "Everyday texts are unvocalized: the learner must read and type the standard full spelling (ktiv male), which often adds ו or י to the stripped form (שֻׁלְחָן → שולחן)."
    }
   ],
   "INTJ": [
    {
     "id": "translit",
     "title": "learner transliteration",
     "phenomenon": "he.orth.romanization",
     "type": "string",
     "at": "top",
     "why": "Until the script is learned every word is shown with its romanization, in one scheme: ch for ח and כ, ts for צ, sh for שׁ, ei for ֵי, an apostrophe before an ע / א that opens a syllable inside a word, a hyphen after a prefix (be-, le-)."
    },
    {
     "id": "spelling",
     "title": "everyday spelling (no vowel points)",
     "phenomenon": "he.orth.ktiv-male",
     "type": "string",
     "why": "Everyday texts are unvocalized: the learner must read and type the standard full spelling (ktiv male), which often adds ו or י to the stripped form (שֻׁלְחָן → שולחן)."
    },
    {
     "id": "addressee",
     "title": "said to",
     "phenomenon": "he.prag.gendered-address",
     "type": "enum",
     "values": [
      "a man",
      "a woman",
      "several people",
      "anyone"
     ],
     "why": "Many phrases change with the person spoken to (מַה שְּׁלוֹמְךָ to a man, מַה שְּׁלוֹמֵךְ to a woman)."
    },
    {
     "id": "reply",
     "title": "usual reply",
     "phenomenon": "he.prag.greeting-replies",
     "type": "string",
     "none": true,
     "why": "Greetings and formulas have set answers (בֹּקֶר טוֹב → בֹּקֶר אוֹר, תּוֹדָה → בְּבַקָּשָׁה)."
    }
   ],
   "NOUN": [
    {
     "id": "gender",
     "title": "gender",
     "phenomenon": "he.morph.gender",
     "type": "enum",
     "values": [
      "MASC",
      "FEM"
     ],
     "at": "top",
     "why": "Every agreeing word (adjective, verb, demonstrative, number) depends on it, and the ending often misleads (לַיְלָה m., עִיר f.)."
    },
    {
     "id": "translit",
     "title": "learner transliteration",
     "phenomenon": "he.orth.romanization",
     "type": "string",
     "at": "top",
     "why": "Until the script is learned every word is shown with its romanization, in one scheme: ch for ח and כ, ts for צ, sh for שׁ, ei for ֵי, an apostrophe before an ע / א that opens a syllable inside a word, a hyphen after a prefix (be-, le-)."
    },
    {
     "id": "spelling",
     "title": "everyday spelling (no vowel points)",
     "phenomenon": "he.orth.ktiv-male",
     "type": "string",
     "why": "Everyday texts are unvocalized: the learner must read and type the standard full spelling (ktiv male), which often adds ו or י to the stripped form (שֻׁלְחָן → שולחן)."
    },
    {
     "id": "root",
     "title": "root",
     "phenomenon": "he.morph.root",
     "type": "string",
     "why": "The root letters, separated by spaces (כ ת ב): the root links the word to its family and to Arabic cognates. Loans, compounds and primary words say none, with the reason.",
     "none": true
    },
    {
     "id": "pattern",
     "title": "noun pattern (mishkal)",
     "phenomenon": "he.morph.mishkal",
     "type": "string",
     "none": true,
     "why": "The pattern, written with the dummy root ק־ט־ל, carries meaning (places מִקְטָל, tools, professions קַטָּל) and predicts the plural and the construct. Loans, compounds and primary or one-syllable nouns say none."
    },
    {
     "id": "plurals",
     "title": "plural",
     "phenomenon": "he.morph.plural",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "kind": "enum:im|ot",
      "senses": "senses",
      "note": "string?"
     },
     "why": "The plural is not predictable from the gender (חַלּוֹנוֹת m., שָׁנִים f.) and the stem often changes; a meaning may have its own plural (כִּכָּרוֹת squares, כִּכְּרוֹת loaves)."
    },
    {
     "id": "dual",
     "title": "dual (“two …”)",
     "phenomenon": "he.morph.dual",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses?"
     },
     "why": "A few nouns (units of time, paired things) say “two” with the ending ־ַיִם (יוֹמַיִם); all others use שְׁנֵי / שְׁתֵּי + the plural."
    },
    {
     "id": "construct",
     "title": "construct forms (“the … of”)",
     "phenomenon": "he.morph.construct",
     "type": "list",
     "none": true,
     "item": {
      "cell": "enum:N;SG;CONST|N;PL;CONST",
      "form": "string",
      "senses": "senses?",
      "note": "string?"
     },
     "why": "Needed for every “X of Y” phrase and every compound; the stem often changes (בַּיִת → בֵּית, ־ָה → ־ַת, ־ִים → ־ֵי). The forms are also paradigm cells."
    },
    {
     "id": "meaningForms",
     "title": "forms of one meaning",
     "phenomenon": "he.sem.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning may use only some forms (only the plural, only the construct, only with the article, only the imperative): each such form names its meanings."
    }
   ],
   "PRON": [
    {
     "id": "translit",
     "title": "learner transliteration",
     "phenomenon": "he.orth.romanization",
     "type": "string",
     "at": "top",
     "why": "Until the script is learned every word is shown with its romanization, in one scheme: ch for ח and כ, ts for צ, sh for שׁ, ei for ֵי, an apostrophe before an ע / א that opens a syllable inside a word, a hyphen after a prefix (be-, le-)."
    },
    {
     "id": "spelling",
     "title": "everyday spelling (no vowel points)",
     "phenomenon": "he.orth.ktiv-male",
     "type": "string",
     "why": "Everyday texts are unvocalized: the learner must read and type the standard full spelling (ktiv male), which often adds ו or י to the stripped form (שֻׁלְחָן → שולחן)."
    },
    {
     "id": "agreement",
     "title": "gender (for agreement)",
     "phenomenon": "he.syntax.agreement",
     "type": "enum",
     "values": [
      "masculine",
      "feminine",
      "both",
      "inflected"
     ],
     "why": "“You” and “they” have masculine and feminine words; the verb and the adjective agree with them. both = one form for both genders; inflected = the forms carry the gender (זֶה / זֹאת)."
    },
    {
     "id": "meaningForms",
     "title": "forms of one meaning",
     "phenomenon": "he.sem.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning may use only some forms (only the plural, only the construct, only with the article, only the imperative): each such form names its meanings."
    }
   ],
   "VERB": [
    {
     "id": "translit",
     "title": "learner transliteration",
     "phenomenon": "he.orth.romanization",
     "type": "string",
     "at": "top",
     "why": "Until the script is learned every word is shown with its romanization, in one scheme: ch for ח and כ, ts for צ, sh for שׁ, ei for ֵי, an apostrophe before an ע / א that opens a syllable inside a word, a hyphen after a prefix (be-, le-)."
    },
    {
     "id": "spelling",
     "title": "everyday spelling (no vowel points)",
     "phenomenon": "he.orth.ktiv-male",
     "type": "string",
     "why": "Everyday texts are unvocalized: the learner must read and type the standard full spelling (ktiv male), which often adds ו or י to the stripped form (שֻׁלְחָן → שולחן)."
    },
    {
     "id": "root",
     "title": "root",
     "phenomenon": "he.morph.root",
     "type": "string",
     "why": "The root letters, separated by spaces (כ ת ב): the root links the word to its family and to Arabic cognates. Loans, compounds and primary words say none, with the reason."
    },
    {
     "id": "binyan",
     "title": "verb pattern (binyan)",
     "phenomenon": "he.morph.binyan",
     "type": "string",
     "why": "One of paal, nifal, piel, pual, hifil, hufal, hitpael: it fixes all the forms and often the meaning relative to other verbs of the root."
    },
    {
     "id": "rootClass",
     "title": "weak-root class (gizra)",
     "phenomenon": "he.morph.weak-roots",
     "type": "strings",
     "values": [
      "regular",
      "pe-nun",
      "pe-yod",
      "pe-alef",
      "pe-guttural",
      "ayin-vav",
      "ayin-yod",
      "ayin-guttural",
      "lamed-he",
      "lamed-alef",
      "lamed-guttural",
      "kfulim",
      "quadriliteral",
      "irregular"
     ],
     "why": "Explains the “irregular” forms: שׁוֹתָה, לִשְׁתּוֹת (lamed-he), בָּא (ayin-vav), תִּסַּע (pe-nun), לָלֶכֶת (הָלַךְ, irregular)."
    },
    {
     "id": "future",
     "title": "future (he will …)",
     "phenomenon": "he.morph.future",
     "type": "string",
     "why": "The 3rd person masculine singular future is a principal part: it shows the stem vowel of pa‘al (יִכְתֹּב / יִלְמַד) and what a weak root does (יֵלֵךְ, יִסַּע)."
    },
    {
     "id": "governs",
     "title": "preposition or object marker of each meaning",
     "phenomenon": "he.syntax.government",
     "type": "list",
     "item": {
      "prep": "enum:et|le|be|mi|al|im|el|none",
      "senses": "senses"
     },
     "why": "Each verb takes its own preposition or אֶת (definite object), often unlike English or Greek: חִכָּה לְ, עָזַב אֶת, נָהַג בְּ; none = no complement or a bare complement."
    },
    {
     "id": "verbalNoun",
     "title": "verbal noun (shem pe‘ula)",
     "phenomenon": "he.morph.verbal-noun",
     "type": "string",
     "none": true,
     "why": "The action noun (אֲכִילָה “eating”, נְסִיעָה “a ride”) is predictable by binyan but irregular in detail, and used constantly in writing."
    },
    {
     "id": "meaningForms",
     "title": "forms of one meaning",
     "phenomenon": "he.sem.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning may use only some forms (only the plural, only the construct, only with the article, only the imperative): each such form names its meanings."
    }
   ]
  },
  "zh": {
   "CCONJ": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    }
   ],
   "CLF": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    },
    {
     "id": "kind",
     "title": "kind of measure word",
     "phenomenon": "zh.syntax.measure.kinds",
     "type": "strings",
     "values": [
      "general",
      "sortal",
      "container",
      "partitive",
      "unit",
      "collective",
      "verbal"
     ],
     "why": "个 is general; 本, 张, 条 sort nouns by kind or shape (sortal); 杯, 碗, 瓶 measure by a container; 块, 份 take a piece or a portion (partitive); 岁 is a unit; most usual use first."
    }
   ],
   "INTJ": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    }
   ],
   "NOUN": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    },
    {
     "id": "measure",
     "title": "measure word(s), most usual first",
     "phenomenon": "zh.syntax.measure",
     "type": "strings",
     "none": true,
     "why": "A noun cannot be counted or pointed at (一个, 这本) without its measure word; none for nouns that count by themselves (天, 年), mass nouns, time and place words and pair words, with the reason."
    }
   ],
   "NUM": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    }
   ],
   "PRON": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    }
   ],
   "VERB": [
    {
     "id": "pinyin",
     "title": "pinyin (dictionary tones)",
     "phenomenon": "zh.phon.tones",
     "type": "string",
     "at": "top",
     "why": "The reading cannot be seen in the characters and the tones are part of the word. Dictionary (citation) tones, syllables separated by spaces; toneless syllables carry no mark; the spoken tones of 一 and 不 are in toneSandhi."
    },
    {
     "id": "trad",
     "title": "traditional characters",
     "phenomenon": "zh.script.simptrad",
     "type": "string",
     "at": "top",
     "why": "Taiwan, Hong Kong and Macau write traditional characters; the learner meets both. The traditional form of the main meaning; other meanings in tradPerSense."
    },
    {
     "id": "readings",
     "title": "reading per meaning (多音字)",
     "phenomenon": "zh.script.polyphones",
     "type": "list",
     "none": true,
     "item": {
      "pinyin": "string",
      "senses": "senses"
     },
     "why": "长 cháng ‘long’ / zhǎng ‘to grow’, 都 dōu ‘all’ / dū ‘capital’: the reading depends on the meaning. Every reading with the senses it serves; none when all senses are read alike."
    },
    {
     "id": "tradPerSense",
     "title": "traditional characters per meaning",
     "phenomenon": "zh.orth.trad.manytoone",
     "type": "list",
     "none": true,
     "item": {
      "trad": "string",
      "senses": "senses"
     },
     "why": "One simplified character can stand for several traditional ones: 里 is 裡 ‘inside’ but 里 ‘li (500 m)’, 周 is 週 ‘week’ but 周 ‘circuit, the Zhou dynasty’. None when every sense has the same traditional form."
    },
    {
     "id": "toneSandhi",
     "title": "spoken tone of 一 / 不",
     "phenomenon": "zh.phon.sandhi.yibu",
     "type": "string",
     "none": true,
     "why": "Dictionaries write 一 yī and 不 bù; in speech 一 is yí before a 4th tone and yì before the others, 不 is bú before a 4th tone. The spoken pinyin of the word where it differs; none for words without 一 / 不 or where the tone does not change."
    },
    {
     "id": "separable",
     "title": "splits into verb + object (离合词)",
     "phenomenon": "zh.morph.separable",
     "type": "list",
     "none": true,
     "item": {
      "verb": "string",
      "object": "string",
      "example": "string?"
     },
     "why": "Verb-object words open up: 了, a number or a measure go between the parts (放了三天假, 做了一顿饭). None for verbs that do not split."
    },
    {
     "id": "neg",
     "title": "negated with 不, 没 or both",
     "phenomenon": "zh.syntax.negation",
     "type": "enum",
     "none": true,
     "values": [
      "bu+mei",
      "bu",
      "mei"
     ],
     "why": "不 negates habits, wishes and the present / future, 没 past events and 有; 是 takes only 不, 有 only 没."
    }
   ]
  },
  "de": {
   "CCONJ": [
    {
     "id": "verbPosition",
     "title": "effect on word order",
     "phenomenon": "de.syn.v2",
     "type": "enum",
     "values": [
      "none (position zero)",
      "takes the first place (inversion)"
     ],
     "why": "und, oder, aber, denn stand before the clause and change nothing (…, denn ich habe Hunger); weder / noch take the first place, so the verb follows them (Weder hat er angerufen, noch …)."
    }
   ],
   "DET": [
    {
     "id": "adjAfter",
     "title": "adjective endings after it",
     "phenomenon": "de.morph.adj.declension",
     "type": "enum",
     "values": [
      "weak",
      "mixed",
      "strong"
     ],
     "why": "der-words → weak endings (der gute Wein), ein-words → mixed (ein guter Wein), words that show no case themselves → strong (viel guter Wein, einige gute Freunde)."
    },
    {
     "id": "address",
     "title": "addressee",
     "phenomenon": "de.prag.address",
     "type": "enum",
     "values": [
      "informal",
      "formal"
     ],
     "none": true,
     "classes": [
      "DET.poss"
     ],
     "why": "dein / euer (du, ihr) or Ihr (Sie). none: the owner is not the person spoken to."
    },
    {
     "id": "senseForms",
     "title": "forms of one meaning",
     "phenomenon": "de.lex.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning with forms of its own (ein standing alone → einer, eine, eins). none: every meaning uses the same forms."
    }
   ],
   "INTJ": [
    {
     "id": "formality",
     "title": "formality",
     "phenomenon": "de.prag.address",
     "type": "enum",
     "values": [
      "informal",
      "neutral",
      "formal"
     ],
     "why": "Which situations the formula fits: informal (friends, family: hallo, tschüss), formal (strangers, customers: guten Tag, auf Wiedersehen, wie geht es Ihnen), neutral (both)."
    }
   ],
   "NOUN": [
    {
     "id": "gender",
     "at": "top",
     "title": "gender",
     "phenomenon": "de.morph.noun.gender",
     "type": "enum",
     "values": [
      "MASC",
      "FEM",
      "NEUT"
     ],
     "classes": [
      "NOUN",
      "NOUN.sgt",
      "NOUN.adj"
     ],
     "why": "Chooses the article (der / die / das), the pronoun and the adjective endings; learned with every noun. Plural-only nouns (class plt) have none."
    },
    {
     "id": "plurals",
     "title": "plural, per meaning",
     "phenomenon": "de.morph.noun.plural.bysense",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "pattern": "enum:-e|umlaut + -e|-er|umlaut + -er|-n|-en|-nen|-s|no ending|umlaut only|adjectival|foreign",
      "senses": "senses",
      "note": "string?"
     },
     "why": "The plural is not predictable and is learned with the noun; a meaning may have its own plural (Banken / Bänke) or none (das Land = the countryside). A meaning left out of every item has no plural. none: mass nouns (class sgt) and plural-only nouns (class plt)."
    },
    {
     "id": "declension",
     "title": "singular declension",
     "phenomenon": "de.morph.noun.weak",
     "type": "enum",
     "values": [
      "strong",
      "weak",
      "mixed",
      "feminine",
      "adjectival"
     ],
     "classes": [
      "NOUN",
      "NOUN.sgt",
      "NOUN.adj"
     ],
     "why": "strong: des Tisches, dem Tisch (-(e)s in the genitive); weak (n-declension): den / dem / des Jungen; mixed: des Namens, den Namen; feminine: no ending in the singular; adjectival: declined like an adjective (der Verwandte, ein Verwandter)."
    },
    {
     "id": "compound",
     "title": "compound parts",
     "phenomenon": "de.morph.compound",
     "type": "list",
     "none": true,
     "item": {
      "part": "string",
      "role": "enum:modifier|head",
      "linker": "string?"
     },
     "why": "The last part (head) gives the gender and the plural, the parts before it narrow the meaning; linker = the joining element (Blume-n-kohl, Geburt-s-tag) or “−e” when the first part loses its final e (Kirsch-tomate). A verb as modifier appears as its stem (wohnen → Wohnzimmer). none: a simple or derived word, or two separate words."
    },
    {
     "id": "homonyms",
     "title": "same form, other gender",
     "phenomenon": "de.morph.noun.homonym.gender",
     "type": "list",
     "none": true,
     "item": {
      "gender": "enum:MASC|FEM|NEUT",
      "meaning": "string",
      "senses": "senses?"
     },
     "why": "der Junge (boy) / das Junge (young animal): the article alone tells two words apart. senses: when the other gender belongs to a meaning of this word."
    },
    {
     "id": "senseForms",
     "title": "forms of one meaning",
     "phenomenon": "de.lex.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning used in a form or construction of its own besides its plural (Frau as a title: Frau Weber, never plural; Bad in place names: in Bad Ems). none: every meaning uses the same forms."
    }
   ],
   "PRON": [
    {
     "id": "address",
     "title": "addressee",
     "phenomenon": "de.prag.address",
     "type": "enum",
     "values": [
      "informal",
      "formal"
     ],
     "none": true,
     "why": "du / ihr (informal) or Sie (formal). none: not a pronoun of address."
    },
    {
     "id": "reference",
     "title": "what it refers to",
     "phenomenon": "de.morph.pron.gender.reference",
     "type": "enum",
     "values": [
      "persons",
      "things",
      "persons and things"
     ],
     "why": "er / sie / es refer to things as well, by the gender of the noun (der Tisch → er); wer asks for persons, was for things."
    },
    {
     "id": "senseForms",
     "title": "forms of one meaning",
     "phenomenon": "de.lex.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning with forms of its own (das Ich, die Ichs; Ihr written with a capital). none: every meaning uses the same forms."
    }
   ],
   "VERB": [
    {
     "id": "principalParts",
     "title": "principal parts",
     "phenomenon": "de.morph.verb.classes",
     "type": "strings",
     "why": "infinitive – 3rd person singular present – 3rd person singular Präteritum – Partizip II: the four forms every learner memorizes (separable verbs with the particle in place: kommt an, kam an, angekommen)."
    },
    {
     "id": "conjugation",
     "title": "conjugation class",
     "phenomenon": "de.morph.verb.classes",
     "type": "enum",
     "values": [
      "weak",
      "strong",
      "mixed",
      "modal",
      "irregular"
     ],
     "why": "weak: -te, ge-…-t (kaufen); strong: vowel change, ge-…-en (trinken – trank – getrunken); mixed: vowel change with weak endings (rennen – rannte – gerannt); modal: modal verbs (mögen, wollen); irregular: sein, haben."
    },
    {
     "id": "presentChange",
     "title": "vowel change in the present (du / er)",
     "phenomenon": "de.morph.verb.present",
     "type": "enum",
     "values": [
      "no change",
      "e>i",
      "e>ie",
      "a>ä",
      "au>äu",
      "irregular"
     ],
     "why": "essen → du isst, fahren → du fährst, laufen → du läufst; decides the du-forms and the du-imperative (iss!)."
    },
    {
     "id": "aux",
     "title": "perfect auxiliary",
     "phenomenon": "de.morph.verb.aux",
     "type": "enum",
     "values": [
      "haben",
      "sein",
      "both"
     ],
     "why": "sein for movement and change of state (ist gegangen), haben for the rest; both: it depends on the meaning or on a direct object (hat das Auto gefahren / ist nach Berlin gefahren) – see auxBySense."
    },
    {
     "id": "auxBySense",
     "title": "auxiliary per meaning",
     "phenomenon": "de.morph.verb.aux",
     "type": "list",
     "none": true,
     "item": {
      "aux": "enum:haben|sein",
      "senses": "senses",
      "when": "string?"
     },
     "why": "For verbs with aux “both”: which meaning (or construction) takes which auxiliary. none: one auxiliary for every meaning."
    },
    {
     "id": "separable",
     "title": "separable particle",
     "phenomenon": "de.morph.verb.separable",
     "type": "string",
     "none": true,
     "why": "The stressed particle goes to the end of the clause (Ich komme morgen an), ge- and zu go inside it (angekommen, anzukommen)."
    },
    {
     "id": "inseparable",
     "title": "inseparable prefix",
     "phenomenon": "de.morph.verb.inseparable",
     "type": "enum",
     "values": [
      "be",
      "emp",
      "ent",
      "er",
      "ge",
      "miss",
      "ver",
      "zer"
     ],
     "none": true,
     "why": "An unstressed prefix that never separates and takes no ge- in the participle (verlassen – verlassen)."
    },
    {
     "id": "governs",
     "title": "objects and complements, per meaning",
     "phenomenon": "de.syn.verb.government",
     "type": "list",
     "none": true,
     "item": {
      "case": "enum:NOM|ACC|DAT|GEN",
      "prep": "string?",
      "senses": "senses",
      "note": "string?"
     },
     "why": "The case of each object (helfen + DAT, kaufen + ACC (+ DAT)), a preposition the verb chooses (warten auf + ACC), or a predicative nominative (Ich heiße Anna). none: the verb takes no object in any meaning."
    },
    {
     "id": "reflexive",
     "title": "reflexive use, per meaning",
     "phenomenon": "de.morph.verb.reflexive",
     "type": "list",
     "none": true,
     "item": {
      "case": "enum:ACC|DAT",
      "senses": "senses"
     },
     "why": "A meaning that needs the reflexive pronoun (sich verlassen auf: ich verlasse mich). none: no reflexive meaning."
    },
    {
     "id": "motion",
     "title": "manner of motion",
     "phenomenon": "de.lex.motion.manner",
     "type": "enum",
     "values": [
      "on foot",
      "by vehicle",
      "by air",
      "any means"
     ],
     "none": true,
     "why": "German chooses the verb by how one moves: gehen (on foot), fahren (in a vehicle), fliegen (by air); kommen, reisen say nothing about it."
    },
    {
     "id": "senseForms",
     "title": "forms of one meaning",
     "phenomenon": "de.lex.polysemy",
     "type": "list",
     "none": true,
     "item": {
      "form": "string",
      "senses": "senses",
      "note": "string?"
     },
     "why": "A meaning that uses forms of its own (mögen “would like” → möchte, möchtest …). none: every meaning uses the same forms."
    }
   ]
  }
 },
 "features": {
  "ar:huwa": {
   "person": "3rd person singular, masculine",
   "suffix": "ـهُ"
  },
  "ar:hiya": {
   "person": "3rd person singular, feminine",
   "suffix": "ـهَا"
  },
  "ar:akala": {
   "root": "ء ك ل",
   "rootClass": [
    "hamzated"
   ],
   "verbForm": "I",
   "present": "يَأْكُلُ",
   "masdar": [
    "أَكْل"
   ],
   "participles": [
    {
     "form": "آكِل",
     "kind": "active"
    },
    {
     "form": "مَأْكُول",
     "kind": "passive"
    }
   ],
   "governs": [
    {
     "case": "ACC",
     "what": "the food (أَكَلَ الْخُبْزَ)",
     "senses": [
      "s1",
      "s2"
     ]
    }
   ],
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "ar:wa": {
   "governs": "words or clauses"
  },
  "ar:marhaban": {
   "addressee": "any",
   "response": "مَرْحَبًا / أَهْلًا (بِكَ، بِكِ)"
  },
  "ar:jazar": {
   "root": {
    "none": "a loanword (Persian gazar): no Arabic root"
   },
   "pattern": {
    "none": "no Arabic root, so no measure"
   },
   "sunLetter": false,
   "human": false,
   "plurals": [
    {
     "form": "جَزَرَات",
     "kind": "soundFem",
     "declension": "sound",
     "note": "counted: the plural of the unit noun",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": "جَزَرَتَانِ",
   "declension": "triptote",
   "unit": "جَزَرَة",
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "ar:basal": {
   "root": "ب ص ل",
   "pattern": "فَعَل",
   "sunLetter": false,
   "human": false,
   "plurals": [
    {
     "form": "بَصَلَات",
     "kind": "soundFem",
     "declension": "sound",
     "note": "counted: the plural of the unit noun",
     "senses": [
      "s1",
      "s2"
     ]
    }
   ],
   "dual": "بَصَلَتَانِ",
   "declension": "triptote",
   "unit": "بَصَلَة",
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "ar:khiyar": {
   "root": {
    "none": "a loanword from Persian (xiyār); خِيَار “choice” (خ ي ر) is another word"
   },
   "pattern": {
    "none": "no Arabic root, so no measure"
   },
   "sunLetter": false,
   "human": false,
   "plurals": [
    {
     "form": "خِيَارَات",
     "kind": "soundFem",
     "declension": "sound",
     "note": "counted: the plural of the unit noun",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": "خِيَارَتَانِ",
   "declension": "triptote",
   "unit": "خِيَارَة",
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "ar:badhinjan": {
   "root": {
    "none": "a loanword (Persian): no Arabic root"
   },
   "pattern": {
    "none": "no Arabic root, so no measure"
   },
   "sunLetter": false,
   "human": false,
   "plurals": [
    {
     "form": "بَاذِنْجَانَات",
     "kind": "soundFem",
     "declension": "sound",
     "note": "counted: the plural of the unit noun",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": "بَاذِنْجَانَتَانِ",
   "declension": "triptote",
   "unit": "بَاذِنْجَانَة",
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "ar:qar": {
   "root": {
    "none": "a loanword from Syriac (qarʿā), not the native root ق ر ع “to knock”"
   },
   "pattern": {
    "none": "no Arabic root, so no measure"
   },
   "sunLetter": false,
   "human": false,
   "plurals": [
    {
     "form": "قَرْعَات",
     "kind": "soundFem",
     "declension": "sound",
     "note": "counted: the plural of the unit noun",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": "قَرْعَتَانِ",
   "declension": "triptote",
   "unit": "قَرْعَة",
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "de:er": {
   "address": {
    "none": "not a pronoun of address"
   },
   "reference": "persons and things",
   "senseForms": {
    "none": "every meaning uses the same forms"
   }
  },
  "de:sie": {
   "address": {
    "none": "not a pronoun of address"
   },
   "reference": "persons and things",
   "senseForms": {
    "none": "every meaning uses the same forms"
   }
  },
  "de:essen": {
   "principalParts": [
    "essen",
    "isst",
    "aß",
    "gegessen"
   ],
   "conjugation": "strong",
   "presentChange": "e>i",
   "aux": "haben",
   "auxBySense": {
    "none": "one auxiliary for every meaning"
   },
   "separable": {
    "none": "not a separable verb"
   },
   "inseparable": {
    "none": "no inseparable prefix"
   },
   "governs": [
    {
     "case": "ACC",
     "senses": [
      "s1"
     ],
     "note": "the object may be left out: Wir essen um sieben."
    }
   ],
   "reflexive": {
    "none": "no reflexive meaning"
   },
   "motion": {
    "none": "not a verb of motion"
   },
   "senseForms": {
    "none": "every meaning uses the same forms"
   }
  },
  "de:der": {
   "adjAfter": "weak",
   "senseForms": {
    "none": "every meaning uses the same forms"
   }
  },
  "de:ein": {
   "adjAfter": "mixed",
   "senseForms": []
  },
  "de:und": {
   "verbPosition": "none (position zero)"
  },
  "de:hallo": {
   "formality": "informal"
  },
  "de:Karotte": {
   "plurals": [
    {
     "form": "Karotten",
     "pattern": "-n",
     "senses": [
      "s1"
     ]
    }
   ],
   "declension": "feminine",
   "compound": {
    "none": "a simple word"
   },
   "homonyms": {
    "none": "no other noun with this form"
   },
   "senseForms": {
    "none": "one meaning"
   }
  },
  "de:Zwiebel": {
   "plurals": [
    {
     "form": "Zwiebeln",
     "pattern": "-n",
     "senses": [
      "s1",
      "s2",
      "s3"
     ]
    }
   ],
   "declension": "feminine",
   "compound": {
    "none": "a simple word"
   },
   "homonyms": {
    "none": "no other noun with this form"
   },
   "senseForms": {
    "none": "every meaning uses the same forms"
   }
  },
  "de:Gurke": {
   "plurals": [
    {
     "form": "Gurken",
     "pattern": "-n",
     "senses": [
      "s1",
      "s2",
      "s3",
      "s4"
     ]
    }
   ],
   "declension": "feminine",
   "compound": {
    "none": "a simple word"
   },
   "homonyms": {
    "none": "no other noun with this form"
   },
   "senseForms": {
    "none": "every meaning uses the same forms"
   }
  },
  "de:Aubergine": {
   "plurals": [
    {
     "form": "Auberginen",
     "pattern": "-n",
     "senses": [
      "s1"
     ]
    }
   ],
   "declension": "feminine",
   "compound": {
    "none": "a simple word"
   },
   "homonyms": {
    "none": "no other noun with this form"
   },
   "senseForms": {
    "none": "one meaning"
   }
  },
  "de:Kürbis": {
   "plurals": [
    {
     "form": "Kürbisse",
     "pattern": "-e",
     "senses": [
      "s1"
     ]
    }
   ],
   "declension": "strong",
   "compound": {
    "none": "a simple word"
   },
   "homonyms": {
    "none": "no other noun with this form"
   },
   "senseForms": {
    "none": "one meaning"
   }
  },
  "he:hu": {
   "spelling": "הוא",
   "agreement": "masculine",
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "he:hi": {
   "spelling": "היא",
   "agreement": "feminine",
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "he:akhal": {
   "spelling": "אכל",
   "root": "א כ ל",
   "binyan": "paal",
   "rootClass": [
    "pe-alef"
   ],
   "future": "יֹאכַל",
   "governs": [
    {
     "prep": "et",
     "senses": [
      "s1",
      "s2"
     ]
    }
   ],
   "verbalNoun": "אֲכִילָה",
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "he:ve": {
   "spelling": "ו"
  },
  "he:et": {
   "spelling": "את",
   "pronForms": [
    {
     "cell": "ADP;1;SG",
     "form": "אוֹתִי"
    },
    {
     "cell": "ADP;2;SG;MASC",
     "form": "אוֹתְךָ"
    },
    {
     "cell": "ADP;2;SG;FEM",
     "form": "אוֹתָךְ"
    },
    {
     "cell": "ADP;3;SG;MASC",
     "form": "אוֹתוֹ"
    },
    {
     "cell": "ADP;3;SG;FEM",
     "form": "אוֹתָהּ"
    },
    {
     "cell": "ADP;1;PL",
     "form": "אוֹתָנוּ"
    },
    {
     "cell": "ADP;2;PL;MASC",
     "form": "אֶתְכֶם"
    },
    {
     "cell": "ADP;2;PL;FEM",
     "form": "אֶתְכֶן"
    },
    {
     "cell": "ADP;3;PL;MASC",
     "form": "אוֹתָם"
    },
    {
     "cell": "ADP;3;PL;FEM",
     "form": "אוֹתָן"
    }
   ]
  },
  "he:shalom": {
   "spelling": "שלום",
   "addressee": "anyone",
   "reply": "שָׁלוֹם"
  },
  "he:gezer": {
   "spelling": "גזר",
   "root": "ג ז ר",
   "pattern": "קֶטֶל",
   "plurals": [
    {
     "form": "גְּזָרִים",
     "kind": "im",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": {
    "none": "no dual in use: “two” is שְׁנֵי / שְׁתֵּי + the plural"
   },
   "construct": [
    {
     "cell": "N;SG;CONST",
     "form": "גֶּזֶר"
    },
    {
     "cell": "N;PL;CONST",
     "form": "גִּזְרֵי"
    }
   ],
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "he:batsal": {
   "spelling": "בצל",
   "root": "ב צ ל",
   "pattern": "קָטָל",
   "plurals": [
    {
     "form": "בְּצָלִים",
     "kind": "im",
     "senses": [
      "s1",
      "s2"
     ]
    }
   ],
   "dual": {
    "none": "no dual in use: “two” is שְׁנֵי / שְׁתֵּי + the plural"
   },
   "construct": [
    {
     "cell": "N;SG;CONST",
     "form": "בְּצַל"
    },
    {
     "cell": "N;PL;CONST",
     "form": "בִּצְלֵי"
    }
   ],
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "he:melafefon": {
   "spelling": "מלפפון",
   "root": {
    "none": "a loanword (Greek μηλοπέπων): no Hebrew root"
   },
   "pattern": {
    "none": "a loanword: not built on a Hebrew pattern"
   },
   "plurals": [
    {
     "form": "מְלָפְפוֹנִים",
     "kind": "im",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": {
    "none": "no dual in use: “two” is שְׁנֵי / שְׁתֵּי + the plural"
   },
   "construct": [
    {
     "cell": "N;SG;CONST",
     "form": "מְלָפְפוֹן"
    },
    {
     "cell": "N;PL;CONST",
     "form": "מְלָפְפוֹנֵי"
    }
   ],
   "meaningForms": {
    "none": "the same forms in every meaning"
   }
  },
  "he:chatsil": {
   "spelling": "חציל",
   "root": {
    "none": "coined in 1831 from Arabic حَيْصَل: no Hebrew root"
   },
   "pattern": "קָטִיל",
   "plurals": [
    {
     "form": "חֲצִילִים",
     "kind": "im",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": {
    "none": "no dual in use: “two” is שְׁנֵי / שְׁתֵּי + the plural"
   },
   "construct": [
    {
     "cell": "N;SG;CONST",
     "form": "חֲצִיל"
    },
    {
     "cell": "N;PL;CONST",
     "form": "חֲצִילֵי"
    }
   ],
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "he:dlaat": {
   "spelling": "דלעת",
   "root": "ד ל ע",
   "pattern": {
    "none": "an old plant name: no standard pattern is given"
   },
   "plurals": [
    {
     "form": "דְּלוּעִים",
     "kind": "im",
     "senses": [
      "s1"
     ]
    }
   ],
   "dual": {
    "none": "no dual in use: “two” is שְׁנֵי / שְׁתֵּי + the plural"
   },
   "construct": [
    {
     "cell": "N;SG;CONST",
     "form": "דְּלַעַת"
    },
    {
     "cell": "N;PL;CONST",
     "form": "דְּלוּעֵי"
    }
   ],
   "meaningForms": {
    "none": "one meaning"
   }
  },
  "zh:ta.he": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   }
  },
  "zh:ta.she": {
   "readings": {
    "none": "one meaning, one reading"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   }
  },
  "zh:chi": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "separable": {
    "none": "one syllable: nothing to split"
   },
   "neg": "bu+mei"
  },
  "zh:he": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   }
  },
  "zh:yi": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": "yí before a 4th tone (一个 yí ge), yì before the 1st–3rd tones (一本 yì běn); yī alone, in counting, in dates and ordinals"
  },
  "zh:ge": {
   "readings": {
    "none": "one reading"
   },
   "tradPerSense": {
    "none": "traditional 個 for every sense"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "kind": [
    "general"
   ]
  },
  "zh:nihao": {
   "readings": {
    "none": "one meaning, one reading"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   }
  },
  "zh:huluobo": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "traditional 胡蘿蔔 for every sense"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "measure": [
    "根"
   ]
  },
  "zh:yangcong": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "traditional 洋蔥 for every sense"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "measure": [
    "个",
    "颗"
   ]
  },
  "zh:huanggua": {
   "readings": {
    "none": "one meaning, one reading"
   },
   "tradPerSense": {
    "none": "traditional 黃瓜 for every sense"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "measure": [
    "根"
   ]
  },
  "zh:qiezi": {
   "readings": {
    "none": "one reading for all its senses"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "measure": [
    "个",
    "根",
    "条"
   ]
  },
  "zh:nangua": {
   "readings": {
    "none": "one meaning, one reading"
   },
   "tradPerSense": {
    "none": "written the same in traditional characters"
   },
   "toneSandhi": {
    "none": "no 一 or 不 in the word"
   },
   "measure": [
    "个"
   ]
  }
 },
 "tops": {
  "he:et": {
   "prefix": false
  }
 },
 "senses": {
  "de:Gurke|s2": "food.gherkin",
  "de:Gurke|s3": "obj.junk",
  "de:Gurke|s4": "body.nose",
  "de:Zwiebel|s2": "nature.bulb",
  "de:Zwiebel|s3": "obj.clock",
  "ar:akala|s2": "verb.corrode",
  "he:akhal|s2": "verb.corrode",
  "ar:basal|s2": "nature.bulb",
  "he:batsal|s2": "nature.bulb",
  "zh:chi|s2": "verb.take.medicine",
  "zh:chi|s3": "verb.suffer",
  "zh:yangcong|s2": "comm.tearjerker",
  "zh:qiezi|s2": "intj.cheese"
 },
 "of": {
  "de:essen|s2": "s1"
 }
}""")

PENDING = [("food.gherkin", "pickled gherkin"), ("obj.junk", "old banger, piece of junk"), ("body.nose", "(big) nose"), ("nature.bulb", "bulb (of a plant)"),
           ("obj.clock", "clock, watch"), ("verb.corrode", "to eat away, to corrode"), ("verb.take.medicine", "to take (medicine)"), ("verb.suffer", "to suffer, to endure"),
           ("comm.tearjerker", "a sad, tear-jerking story"), ("intj.cheese", "‘cheese!’ (said when taking a photo)")]

EXAMPLES = {   # one example for a pending meaning that the mini profile had none for (from the real course)
  "ar:basal": {"text": "يُزْرَعُ التُّولِيبُ مِنْ بَصَلٍ فِي الْخَرِيفِ.", "tr": "Tulips are planted from bulbs in autumn.", "register": "neutral", "context": "gardening", "sense": "s2"},
  "zh:yangcong": {"text": "这个视频有洋葱，我看哭了。", "py": "Zhège shìpín yǒu yángcōng, wǒ kàn kū le.", "tr": "This video is a tear-jerker — it made me cry.", "register": "slang", "context": "internet", "sense": "s2"},
  "de:Gurke": {"text": "Was hat der für eine Gurke im Gesicht!", "tr": "What a hooter he’s got on his face!", "register": "humorous", "context": "joking", "sense": "s4"}}

def field():
    """The pending meanings of the mini course’s words (D15): known from words, taught by no node."""
    return {"field": "more", "title": "Other meanings (pending)", "sources": ["the other meanings of the mini course words (D15)"],
            "concepts": [{"id": c, "gloss": g, "tier": 2, "rank": i + 1, "pending": True} for i, (c, g) in enumerate(PENDING)]}

def apply(code, lj, lexicon):
    """language.json gets wordFeatures; every lexeme its features, its other meanings as concepts."""
    if lj: lj["wordFeatures"] = DATA["decls"][code]
    for x in lexicon.get("lexemes") or []:
        if x["id"] in DATA["features"]:
            items = list(x.items()); x.clear()
            for k, v in items:
                x[k] = v
                if k == "senses": x["features"] = DATA["features"][x["id"]]
        for k, v in DATA["tops"].get(x["id"], {}).items(): x.setdefault(k, v)
        for s in (x.get("profile") or {}).get("senses") or []:
            c = DATA["senses"].get(x["id"] + "|" + s["id"]); o = DATA["of"].get(x["id"] + "|" + s["id"])
            if c:
                s["concept"] = c
                if c not in x["senses"]: x["senses"].append(c)
            if o: s["of"] = o
        e = EXAMPLES.get(x["id"])
        if e and x.get("profile") and not any(y.get("sense") == e["sense"] for y in x["profile"]["examples"]): x["profile"]["examples"].append(dict(e))
    return lexicon
