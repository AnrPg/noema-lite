# Arabic (Modern Standard) — the distinctive parameters of a word, per part of speech (R3, D14)

The map behind `language.json` → `wordFeatures`. Every declared parameter is stated by **every** word of its part of
speech (a value, or `{"none": "<why>"}`); `prominent` parameters are shown right under the word, in `order`.
Status: **declared** = existed before R3 · **added** = added by R3 (2026-10-11) · **n.a.** = considered and not a word
parameter here (the reason says where the information lives instead).

All forms are fully vocalized, as the course writes them; transliterations follow the course scheme (DIN 31635 letters,
pausal form: no case ending, no tanwīn). Checked against Wiktionary (kaikki, `data/refcache/ar`): 164 plural
transliterations agree with Wiktionary's romanization (5 more differ only by Wiktionary's full form: *karāsiyy*,
*qahāwin*, *maqāhin*, *quran*, *layālin* — the course gives the pausal *karāsī*, *qahāwī*, *maqāhī*, *qurā*, *layālī*);
190 of the 192 construct forms Wiktionary has agree (the two others are homographs: سَمْك, فَجَل); every imperative and
past-1st-person form agrees with the course's paradigms and with Wiktionary. Counts: 264 nouns, 57 adjectives,
37 verbs, 36 adverbs, 22 prepositions, 19 pronouns, 30 numerals, 10 particles, 8 + 6 conjunctions, 25 interjections, 2 determiners.

## NOUN (classes: NOUN, NOUN.collective, NOUN.mass, NOUN.sg, NOUN.plt, NOUN.du, NOUN.kin, NOUN.person, NOUN.def, NOUN.quant)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `plurals` (per meaning) | every plural, each with the meanings it belongs to (بُيُوت houses / أَبْيَات verses), its kind (broken, sound -ūna, sound -āt), pattern, declension, a note, and its **transliteration** (`translit`, pausal); a noun may have two or three | ✓ | declared (`translit` added) |
| 2 | `gender` (top level) | masculine / feminine: agreement and the polarity of 3–10; covert feminines (شَمْس، أُمّ) are not predictable | ✓ | declared |
| 3 | `dual` | -āni, with ة → ت (سَنَتَانِ) and irregular duals (أَبَوَانِ) | ✓ | declared |
| 4 | `human` | plurals of people agree in the plural, all other plurals as feminine singular | ✓ | declared |
| 5 | `declension` | triptote / diptote (no tanwīn, genitive -a) / defective (-in) / invariable — of the singular | ✓ | declared |
| 6 | `construct` | the construct form (iḍāfa) with its reading: ة read -t- (مَدْرَسَةُ madrasatu), the five nouns (أَبُو، أَخُو), the dual without nūn (وَالِدَا), the defective ī (مُحَامِي); none for phrases (only the head changes) and for day / month names (always the second word) | ✓ | added |
| 7 | `root` | the radicals: the family and the dictionary entry; none for loanwords and phrases | ✓ | declared |
| 8 | `pattern` | the measure (wazn) in ف ع ل letters; none for loanwords and words that fit no measure | ✓ | declared |
| 9 | `unit` (collectives only) | the unit noun in -a (تُفَّاحَة from تُفَّاح), needed for counting | ✓ | declared |
| 10 | `pair` | the male / female counterpart of a person noun: -a (مُعَلِّم → مُعَلِّمَة) or another root (رَجُل ↔ اِمْرَأَة, أَب ↔ أُمّ); none for things and for words covering both sexes | ✓ | added |
| 11 | `sunLetter` | the article assimilates (الشَّمْس aš-šams) or not (الْقَمَر al-qamar) |  | declared |
| 12 | `meaningForms` | a form that belongs to one meaning only (a fixed phrase, another maṣdar) |  | declared |
| 13 | `translit` (top level) | the reading of the pausal form, shown under the word already |  | declared |
| – | case forms (nominative, accusative, genitive; definite / indefinite) | the paradigm cells N;NOM;SG;INDF …; the declension class says which endings | | n.a. (paradigm) |
| – | possessive forms (كِتَابِي) | the paradigm (N;…;POSS) and `fn.possessive`; regular except the five nouns, given in `construct` | | n.a. (paradigm) |
| – | diminutive (فُعَيْل) | rare and mostly lexicalized (كُتَيِّب booklet): a word of its own, not a parameter (`ar.morph.diminutive`) | | n.a. |
| – | plural of paucity vs. multitude | stated in the plural's `note` where it matters (أَسْمَاك / سَمَكَات) | | n.a. (in `plurals`) |
| – | definiteness of names (always definite: الْأَحَد) | the class NOUN.def and its paradigm (definite cells only) | | n.a. (class) |

## VERB (classes: VERB, VERB.defective frozen, VERB.imp imperative only)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `verbForm` | form I–X: gives the present, participle and maṣdar patterns and a typical meaning | ✓ | declared |
| 2 | `present` | the second principal part, 3rd person singular (يَكْتُبُ) | ✓ | declared |
| 3 | `stemVowels` | form I: the vowel pair past – present (a–u, a–i, a–a, i–a, i–i, u–u), not predictable; for weak verbs the underlying vowel (نَامَ i–a, زَارَ a–u); none for forms II–X | ✓ | added |
| 4 | `masdar` | the verbal noun(s), unpredictable in form I (ذَهَاب, نَوْم, زِيَارَة) | ✓ | declared |
| 5 | `participles` | active / passive participle, frequent as nouns and adjectives | ✓ | declared |
| 6 | `rootClass` | sound / hollow / defective / assimilated / doubled / hamzated: changes the conjugation | ✓ | declared |
| 7 | `governs` | direct object (accusative) or a fixed preposition, per meaning (ذَهَبَ إِلَى، اِنْتَظَرَ + acc.) | ✓ | declared |
| 8 | `imperative` | to one man: helping alif (اُكْتُبْ / اِشْرَبْ), weak letters dropped (قُلْ، نَمْ، اِمْشِ، صِلْ), irregular (كُلْ) | ✓ | added |
| 9 | `passive` | the internal passive, past / present (كُتِبَ / يُكْتَبُ; قِيدَ / يُقَادُ), per meaning; none for verbs without an object | ✓ | added |
| 10 | `past1sg` | the past before a consonant ending (كُنْتُ، نِمْتُ، مَشَيْتُ، أَحْبَبْتُ): where weak and doubled stems change | ✓ | added |
| 11 | `root` | the centre of the word family | ✓ | declared |
| 12 | `meaningForms` | a form of one meaning only (another maṣdar) |  | declared |
| 13 | `translit` (top level) | the reading of the citation form (3rd person masculine singular past) |  | declared |
| – | the conjugation (persons, numbers, genders, moods) | the paradigm cells V;PST / V;PRS;IND / V;SBJV / V;JUS / V;IMP | | n.a. (paradigm) |
| – | subjunctive and jussive | regular from the present (`ar.morph.verb.moods`); shown in the paradigm | | n.a. (paradigm) |
| – | future (سَـ / سَوْفَ) | one rule for every verb (`fn.future`) | | n.a. (grammar) |
| – | infinitive | Arabic has none; the maṣdar takes its place (`ar.morph.no_infinitive`) | | n.a. (`masdar`) |

## ADJ (classes: ADJ, ADJ.quant, ADJ.elative)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `feminine` | -a (كَبِيرَة), فَعْلَاء for colours (حَمْرَاء), فَعْلَى for faʿlān (عَطْشَى), أُولَى for أَوَّل | ✓ | declared |
| 2 | `plurals` | the masculine plural(s) of people — broken or -ūna — per meaning (كِبَار / كُبَرَاء), each with its transliteration | ✓ | declared (`translit` added) |
| 3 | `elative` | the comparative / superlative أَفْعَل (أَكْبَر); none where the comparison is made with أَكْثَرُ / أَشَدُّ + a maṣdar | ✓ | declared |
| 4 | `declension` | colours and faʿlān are diptotes, غَالٍ is defective | ✓ | declared |
| 5 | `governs` | a fixed preposition of the complement (قَرِيب مِنْ، بَعِيد عَنْ، سَعِيد بِـ، سَهْل عَلَى); none: no fixed preposition | ✓ | added |
| 6 | `derivedFrom` | what the adjective is made from: a participle, a faʿīl, a **nisba** in -ī (بُنِّيّ ← بُنّ), an elative | ✓ | declared |
| 7 | `root` | the family (verb, noun) | ✓ | declared |
| 8 | `pattern` | faʿīl, fāʿil, faʿlān, afʿal, -iyy … | ✓ | declared |
| 9 | `sunLetter` | the article assimilates or not |  | declared |
| 10 | `meaningForms` | a form of one meaning only |  | declared |
| 11 | `translit` (top level) | the pausal masculine singular |  | declared |
| – | nisba as a separate parameter | the nisba is a way of making an adjective: `derivedFrom` (+ `pattern` -iyy) says it | | n.a. (in `derivedFrom`) |
| – | feminine plural | regular -āt on the feminine (كَبِيرَات); colours and faʿlān share the broken plural for both genders (حُمْر) — the paradigm cells ADJ;…;PL;FEM | | n.a. (paradigm) |
| – | position | every adjective follows its noun and agrees in four features: grammar (`fn.adjective`), not a word property | | n.a. |

## ADV

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `formation` | adverbial accusative (غَدًا، كَثِيرًا، الْيَوْمَ — keeps -an / -a), indeclinable particle (هُنَا، أَمْسِ، الْآنَ، فَقَطْ), or a phrase (بِخَيْرٍ، مِنْ فَضْلِكَ) | ✓ | added |
| 2 | `derivedFrom` | the noun or adjective it is made from | ✓ | declared |
| 3 | `root` | the family | ✓ | declared |
| 4 | `meaningForms` | a form of one meaning only (كَيْفَمَا) |  | declared |
| 5 | `translit` (top level) | the reading |  | declared |
| – | comparison | adverbs are not compared; أَكْثَرَ + a maṣdar (grammar) | | n.a. |

## ADP (classes: ADP, ADP.bare)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `withPronoun` | the forms with an attached pronoun, me / him (عَلَيَّ، عَلَيْهِ; إِلَيَّ; فِيَّ; مِنِّي; لِي; بِهِ); none for حَتَّى، مُنْذُ (ADP.bare) | ✓ | added |
| 2 | `kind` | ḥarf (short particle) / ẓarf (an adverbial noun: may take مِنْ before it, مِنْ تَحْتِ) / phrase | ✓ | declared |
| 3 | `prefix` (top level) | written joined to the next word (بِـ، لِـ) | ✓ | declared |
| 4 | `root` | the root of a ẓarf (ق ب ل for قَبْلَ) |  | declared |
| 5 | `meaningForms` | a form of one meaning only (بَعْدُ “yet”) |  | declared |
| 6 | `translit` (top level) | the reading |  | declared |
| – | case governed | every preposition takes the genitive: grammar (`fn.prep.core`), not a word property | | n.a. |
| – | لِـ + الـ → لِلـ | a spelling rule of one preposition, taught in `fn.prep.core` | | n.a. (grammar) |

## PRON (classes: PRON personal, PRON.dem, PRON.dempl, PRON.int, PRON.neg)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `person` (personal) | person, number and gender (أَنْتَ / أَنْتِ / أَنْتُمَا …) | ✓ | declared |
| 2 | `suffix` (personal) | the attached form (ـكَ، ـهَا; ـِي on nouns, ـنِي on verbs) | ✓ | declared |
| 3 | `translit` (top level) | the reading |  | declared |
| – | demonstrative forms (هٰذَا / هٰذِهِ / هٰؤُلَاءِ) | the paradigm cells PRON;SG;MASC … of PRON.dem | | n.a. (paradigm) |
| – | persons / things (مَنْ / مَا، مَاذَا) | the senses of the interrogatives and `contrasts` | | n.a. (senses) |

## DET

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `governs` | what follows: أَيّ + a genitive noun in a construct (أَيُّ كِتَابٍ؟); لِمَنْ before the thing owned | ✓ | added |
| 2 | `translit` (top level) | the reading |  | declared |

## NUM (classes: NUM.noun, NUM.one, NUM.two, NUM.unit, NUM.teen, NUM.ten)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `polarity` | 3–10 (and in the teens) take the opposite gender of the counted noun | ✓ | declared |
| 2 | `genderForms` | the form with a masculine and with a feminine noun (ثَلَاثَة / ثَلَاث; ثَمَانِيَة / ثَمَانٍ; ثَلَاثَةَ عَشَرَ / ثَلَاثَ عَشْرَةَ); none for tens, مِائَة, أَلْف | ✓ | added |
| 3 | `countedNoun` | the number and case of the counted noun (genitive plural after 3–10, accusative singular after 11–99, genitive singular after 100) | ✓ | declared |
| 4 | `ordinal` | ثَالِث، أَوَّل (suppletive), حَادِيَ عَشَرَ | ✓ | declared |
| 5 | `root` | the family (ث ل ث: ثَلَاثَة، ثَالِث، ثُلُث) |  | declared |
| 6 | `translit` (top level) | the reading |  | declared |
| – | fractions (ثُلُث، رُبْع، نِصْف) | nouns of their own | | n.a. |

## CCONJ · SCONJ · PART · INTJ

| POS | # | parameter | why | prominent | status |
|---|---|---|---|---|---|
| CCONJ | 1 | `governs` | words / clauses; لٰكِنَّ + an accusative subject or a suffix | ✓ | declared |
| CCONJ | 2 | `prefix` (top level) | وَ، فَ are written joined | ✓ | declared |
| CCONJ | 3 | `translit` (top level) | the reading |  | declared |
| SCONJ | 1 | `governs` | the mood or clause after it (أَنْ + subjunctive, أَنَّ + accusative / suffix, إِذَا + past) | ✓ | declared |
| SCONJ | 2 | `translit` (top level) | the reading |  | declared |
| PART | 1 | `governs` | what follows: لَمْ + jussive, لَنْ + subjunctive, سَـ / سَوْفَ + present, مَا + past, قَدْ + past or present, هَلْ / أَ + a statement; none for the answer لَا | ✓ | added |
| PART | 2 | `prefix` (top level) | سَـ and أَ are written joined | ✓ | declared |
| PART | 3 | `translit` (top level) | the reading |  | declared |
| INTJ | 1 | `addressee` | the form for a man / a woman / anyone (تُصْبِحُ / تُصْبِحِينَ عَلَى خَيْرٍ) | ✓ | declared |
| INTJ | 2 | `response` | the fixed answer (صَبَاحُ الْخَيْرِ → صَبَاحُ النُّورِ) | ✓ | declared |
| INTJ | 3 | `translit` (top level) | the reading |  | declared |

## The checklist of the type (R3_CHECKLIST, R3_TYPE)

* `nom.genderCount` → `gender` · `nom.plural` → `plurals` · `nom.dual` → `dual` · `nom.cases` → `declension` (NOUN), every
  preposition takes the genitive (ADP: n.a., see above) · `nom.constructState` → `construct` (added) ·
  `morph.rootPattern` → `root`, `pattern` (NOUN), `root`, `verbForm` (VERB) · `morph.stemChange` → `present`,
  `stemVowels`, `past1sg` · `adj.comparativeForm` → `elative` · `script.vowels` → `translit` (every part of speech).
* Fusional type: an inflection class for nouns (`declension`, `plurals`, `pattern`) and the principal parts of verbs
  (`verbForm`, `present`, `stemVowels`).
