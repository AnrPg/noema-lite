# Hebrew — the distinctive parameters of a word, per part of speech (R3, D14)

The map behind `language.json` → `wordFeatures`. Every declared parameter is stated by **every** word of its part of
speech (a value, or `{"none": "<why>"}`); `prominent` parameters are shown right under the word, in `order`.
Status: **declared** = existed before R3 · **added** = added by R3 (2026-10-11) · **n.a.** = considered and not a word
parameter here (the reason says where the information lives instead).

Forms are written with vowel points, as the course writes them. Sources: the paradigm cells of each word (checked
against Wiktionary by `tools/lang_refcheck.py`, cache `data/refcache/he`), Wiktionary's declension tables for the
possessive forms (taken only where they agree with the word's construct forms), its head lines for the passive
counterparts of verbs ("passive counterpart נֶאֱכַל"), and the grammar pages of the course.

## NOUN (classes: NOUN, NOUN.mass, NOUN.sgt, NOUN.plt, NOUN.cal)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `gender` (top level) | masculine / feminine: every adjective, verb, demonstrative and number agrees with it, and the ending can mislead | ✓ | declared |
| 2 | `plurals` (per meaning) | the plural form(s) with their ending (־ִים / ־וֹת) and the meanings they belong to (כִּכָּרוֹת / כִּכְּרוֹת) | ✓ | declared |
| 3 | `pluralShape` | what is irregular about the plural: the other gender's ending (חַלּוֹן → חַלּוֹנוֹת, שָׁנָה → שָׁנִים), a segolate with rebuilt vowels (סֵפֶר → סְפָרִים), a stem change (בַּיִת → בָּתִּים, עִיר → עָרִים), the plural of another word (אַבָּא → אָבוֹת), compounds (בָּתֵּי סֵפֶר, בְּנֵי דּוֹדִים) | ✓ | added |
| 4 | `construct` | the construct singular and plural (בֵּית, בָּתֵּי; מִשְׁפַּחַת): the form before another noun, often with other vowels | ✓ | declared |
| 5 | `possessive` | the form with “my” (סִפְרִי / סְפָרַי, אִשְׁתִּי), which shows the stem the endings attach to; register everyday (family words) or formal | ✓ | added |
| 6 | `root` | the root letters (כ ת ב): the word's family; none for loans, compounds and primary words | ✓ | declared |
| 7 | `pattern` | the mishkal (מִקְטָל, קַטָּל …): carries meaning and predicts the plural and the construct | ✓ | declared |
| 8 | `spelling` | the everyday unvocalized spelling (ktiv male: שֻׁלְחָן → שולחן) | ✓ | declared |
| 9 | `dual` | the dual in ־ַיִם where it lives (יוֹמַיִם, שְׁבוּעַיִם, body parts); none otherwise |  | declared |
| 10 | `genderCue` | a gender that goes against the ending (feminine עִיר, אֶרֶץ, כּוֹס; masculine לַיְלָה), or none |  | added |
| 11 | `pair` | the female / male counterpart of a person noun (מוֹרֶה ↔ מוֹרָה, אָח ↔ אָחוֹת, בַּעַל ↔ אִשָּׁה per meaning), linked to its lexeme |  | added |
| 12 | `meaningForms` | a meaning with forms of its own (only the plural, only the construct …) |  | declared |
| 13 | `translit` (top level) | the learner transliteration, until the script is learned |  | declared |
| – | definite form (הַ / הָ / הֶ, doubling) | follows from the first letter: a rule of the article (`he.morph.article`), stored in the paradigm cells N;SG;DEF / N;PL;DEF | | n.a. (paradigm) |
| – | case | Hebrew has no cases (`he.morph.no-case`): the job is done by prepositions and אֶת | | n.a. |
| – | all ten possessive forms | the paradigm cells N;POSS;* of the family words; the card states the 1st person, which shows the stem | | n.a. (paradigm) |
| – | stress (BO-ker, ye-LA-dim) | pronunciation: the lexicon does not store stress; segolates are flagged by `pluralShape` | | n.a. |
| – | measure words | none in Hebrew (`he.morph.no-classifiers`) | | n.a. |

## VERB (classes: VERB, VERB.copula)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `binyan` | paal, nifal, piel, pual, hifil, hufal, hitpael: fixes all the forms and often the meaning | ✓ | declared |
| 2 | `root` | the root letters | ✓ | declared |
| 3 | `rootClass` | the weak-root class (gizra): explains the “irregular” forms (קָם, שׁוֹתֶה, יֵלֵךְ) | ✓ | declared |
| 4 | `present` | the masculine singular present (כּוֹתֵב, מְדַבֵּר, קָם); none for הָיָה | ✓ | added |
| 5 | `future` | the 3rd person masculine singular future (יִכְתֹּב / יִלְמַד, יֵלֵךְ, יִסַּע): the stem vowel of pa‘al | ✓ | declared |
| 6 | `infinitive` | the infinitive with לְ (לֶאֱכֹל, לָלֶכֶת, לָצֵאת) | ✓ | added |
| 7 | `governs` | the preposition or object marker of each meaning (חִכָּה לְ, עָזַב אֶת, נָהַג בְּ) | ✓ | declared |
| 8 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 9 | `imperative` | to a man / a woman / several people (קוּם, קוּמִי, קוּמוּ; לֵךְ, סַע, צֵא); none when no command is used |  | added |
| 10 | `related` | the same root in other binyanim with the relation: passive (אָכַל → נֶאֱכַל), causative (בָּא → הֵבִיא), transitive / intransitive partner (הִתְעוֹרֵר ↔ הֵעִיר, סִיֵּם ↔ הִסְתַּיֵּם), “become” (הָיָה → נִהְיָה) |  | added |
| 11 | `verbalNoun` | the action noun (אֲכִילָה, נְסִיעָה) |  | declared |
| 12 | `meaningForms` | a meaning with forms of its own (הָיָה לִי “I had” agrees with the thing) |  | declared |
| 13 | `translit` (top level) | the learner transliteration |  | declared |
| – | past 3rd person masculine singular | the citation form: the lemma itself (הָלַךְ); the other past cells are in the paradigm | | n.a. (the lemma) |
| – | person / gender endings | regular for every verb: the paradigm cells V;PST;* / V;FUT;* | | n.a. (paradigm) |
| – | auxiliary, separable particle, perfect | Hebrew has none (`he.morph.no-perfect`, `he.morph.no-particle-verbs`) | | n.a. |
| – | aspect pairs | Hebrew verbs have no aspect pairs; the binyan relations are in `related` | | n.a. |

## ADJ (classes: ADJ, ADJ.inv)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `inflection` | the feminine and the plurals (גָּדוֹל → גְּדוֹלָה, גְּדוֹלִים, גְּדוֹלוֹת; יָרֹק → יְרֻקָּה): vowel changes and doubled letters; none for invariable words (בְּסֵדֶר) | ✓ | added |
| 2 | `root` | the root letters | ✓ | declared |
| 3 | `pattern` | the adjective pattern (קָטֹל, קָטֵל, ־ִי …) | ✓ | declared |
| 4 | `governs` | the preposition of a complement (שָׂמֵחַ בְּ, דּוֹמֶה לְ) | ✓ | declared |
| 5 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 6 | `meaningForms` | a meaning with forms of its own |  | declared |
| 7 | `translit` (top level) | the learner transliteration |  | declared |
| – | comparative / superlative forms | comparison is made with words for every adjective (יוֹתֵר, הֲכִי, בְּיוֹתֵר: `he.morph.comparison`) | | n.a. |
| – | definite forms (הַגָּדוֹל) | the article, by rule: paradigm cells ADJ;*;DEF | | n.a. (paradigm) |

## ADV

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `derivedFrom` | the word it is built from (בְּ + שֶׁקֶט → בְּשֶׁקֶט, the feminine adjective …) | ✓ | declared |
| 2 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 3 | `meaningForms` | a meaning with forms of its own |  | declared |
| 4 | `translit` (top level) | the learner transliteration |  | declared |
| – | comparison | analytic (יוֹתֵר מַהֵר), the same for every adverb | | n.a. |
| – | formal / everyday pairs (פֹּה / כָּאן) | `contrasts` and the register of the word profile | | n.a. (`contrasts`) |

## NUM (classes: NUM, NUM.gender, NUM.two, NUM.const, NUM.dual)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `agreement` | agrees (1, 2, 11, 12) / reversed endings (3–10 and the units of 13–19: שְׁלוֹשָׁה סְפָרִים, שָׁלוֹשׁ מִטּוֹת) / one form | ✓ | added |
| 2 | `genderForms` | the masculine and feminine forms (the feminine is also the counting form) | ✓ | added |
| 3 | `construct` | the form before a noun: שְׁנֵי / שְׁתֵּי, שְׁלוֹשֶׁת הַ…, אַחַד הַ… “one of”; none when the number stays as it is | ✓ | added |
| 4 | `position` | before the noun, or after it (אֶחָד) | ✓ | declared |
| 5 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 6 | `translit` (top level) | the learner transliteration |  | declared |
| – | ordinals | words of their own (רִאשׁוֹן … עֲשִׂירִי), adjectives in the lexicon | | n.a. (ADJ) |
| – | the dual / plural of 100 and 1000 | the paradigm cells NUM;DU / NUM;PL | | n.a. (paradigm) |

## PRON (classes: PRON, PRON.dem, PRON.all)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `agreement` | the gender it takes in agreement (masculine / feminine / both / inflected) | ✓ | declared |
| 2 | `suffix` | the personal ending that stands for it on prepositions and nouns (־ִי: לִי, סִפְרִי; ־ַי after plural nouns) | ✓ | added |
| 3 | `object` | the form as a direct object: אֶת with the ending (אוֹתִי, אוֹתוֹ) | ✓ | added |
| 4 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 5 | `meaningForms` | a meaning with forms of its own (אֵלֶּה “these”) |  | declared |
| 6 | `translit` (top level) | the learner transliteration |  | declared |
| – | politeness | Hebrew has no polite pronoun (`he.prag.no-tv`) | | n.a. |

## DET (classes: DET, DET.dem, DET.int)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `nounAfter` | the noun it takes and how the meaning changes (כָּל יוֹם “every day” / כָּל הַיּוֹם “all day”; שׁוּם only with a negation) | ✓ | added |
| 2 | `position` | before or after the noun (הַהוּא after a definite noun) | ✓ | declared |
| 3 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 4 | `meaningForms` | a meaning with forms of its own (הָהֵם, הָהֵן “those”) |  | declared |
| 5 | `translit` (top level) | the learner transliteration |  | declared |

## ADP (classes: ADP, ADP.suffixed)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `prefix` (top level) | written onto the next word (בְּ, לְ, מִ) | ✓ | declared |
| 2 | `pronForms` | the ten forms with personal endings (לִי, אִתִּי, עָלַי …) | ✓ | declared |
| 3 | `suffixSet` | which endings: of a singular noun (לִי, לוֹ), of a plural noun (עָלַי, עָלָיו), mixed (בֵּינִי / בֵּינֵינוּ), or a stem of its own (אִתִּי, מִמֶּנִּי, אוֹתִי) | ✓ | added |
| 4 | `withArticle` | fusion with the article: בַּבַּיִת, לַשּׁוּק; מִ does not fuse (מֵהַבַּיִת); none for separate words | ✓ | added |
| 5 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| 6 | `translit` (top level) | the learner transliteration |  | declared |
| – | the case it governs | Hebrew has no cases: a noun after a preposition does not change | | n.a. |
| – | vowel of the prefix before a shva (לִ, בִּ) | a rule of the prefixes (`he.orth.prefix-vowels`), stored as the cell ADP;ALT | | n.a. (paradigm) |

## CCONJ · SCONJ · INTJ · PART

| POS | # | parameter | why | prominent | status |
|---|---|---|---|---|---|
| CCONJ | 1 | `prefix` (top level) | וְ is written onto the next word | ✓ | declared |
| CCONJ | 2 | `allomorphs` | וּ before ב, מ, פ and a shva; וִ before יְ | ✓ | added |
| CCONJ | 3 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| CCONJ | 4 | `translit` (top level) | the learner transliteration |  | declared |
| SCONJ | 1 | `prefix` (top level) | שֶׁ and כְּשֶׁ are written onto the next word | ✓ | declared |
| SCONJ | 2 | `tense` | the tense the clause takes: the future for a future event after כְּשֶׁ and אִם | ✓ | added |
| SCONJ | 3 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| SCONJ | 4 | `translit` (top level) | the learner transliteration |  | declared |
| INTJ | 1 | `addressee` | said to a man / a woman / several people / anyone (תִּתְחַדֵּשׁ / תִּתְחַדְּשִׁי) | ✓ | declared |
| INTJ | 2 | `reply` | the usual answer (שָׁלוֹם – שָׁלוֹם; תּוֹדָה – בְּבַקָּשָׁה) | ✓ | declared |
| INTJ | 3 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| INTJ | 4 | `translit` (top level) | the learner transliteration |  | declared |
| PART | 1 | `spelling` | the everyday unvocalized spelling | ✓ | declared |
| PART | 2 | `meaningForms` | a meaning with forms of its own (אֵין with endings: אֵינֶנִּי …) |  | declared |
| PART | 3 | `translit` (top level) | the learner transliteration |  | declared |
