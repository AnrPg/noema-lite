# German — the distinctive parameters of a word, per part of speech (R3, D14)

The map behind `language.json` → `wordFeatures`. Every declared parameter is stated by **every** word of its part of
speech (a value, or `{"none": "<why>"}`); `prominent` parameters are shown right under the word, in `order`.
Status: **declared** = existed before R3 · **added** = added by R3 (2026-10-11) · **n.a.** = considered and not a word
parameter here (the reason says where the information lives instead).

Values were checked against Wiktionary (kaikki, `data/refcache/de`): every genitive singular of the 297 nouns it has,
every imperative and every one-word Konjunktiv II of the 45 verbs agree with it.

## NOUN (classes: NOUN, NOUN.sgt mass, NOUN.plt plural-only, NOUN.adj adjectival)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `gender` (top level) | der / die / das: chooses article, pronoun, adjective endings; not predictable. Not for plural-only nouns. | ✓ | declared |
| 2 | `plurals` (per meaning) | the plural class (-e, ¨-e, -er, -(e)n, -s, Ø, ¨) is learned with the noun; a meaning may have its own plural (Banken / Bänke) or none | ✓ | declared |
| 3 | `genitive` | the genitive singular with its article (des Tisches / des Tischs, des Jungen, der Frau): the dictionary header and the declension at a glance | ✓ | added |
| 4 | `declension` | strong / weak (n-declension) / mixed / feminine / adjectival singular declension | ✓ | declared |
| 5 | `number` | singular and plural · singular only (Obst, Reis, months) · plural only (Eltern, Leute, Ferien) |  | added |
| 6 | `homonyms` | same form, other gender, other meaning (der / das Junge; gender by sense) | ✓ | declared |
| 7 | `genderCue` | the rule behind the gender (suffix, meaning class, compound head, -e tendency) or "no rule"; exceptions flagged (der Käse, das Bier, die Nacht) |  | added |
| 8 | `pair` | the female / male counterpart of a person noun (Lehrer ↔ Lehrerin, Bruder ↔ Schwester), linked to its lexeme |  | added |
| 9 | `diminutive` | -chen / -lein (always neuter, usually umlaut) when one is in common use; lexicalized ones say so (Brötchen, Plätzchen, Fräulein) |  | added |
| 10 | `compound` | parts, head (gives gender and plural), linking element (-s-, -n-, −e) |  | declared |
| 11 | `senseForms` | a meaning with forms of its own (Frau as a title) |  | declared |
| – | capitalization | every noun is capitalized: an orthographic rule, not a property of one noun | | n.a. |
| – | case forms | the paradigm cells (N;NOM;SG … N;GEN;PL), shown in the paradigm | | n.a. (paradigm) |
| – | measure use (zwei Glas Wein) | recorded as a second plural with its note in `plurals` (Glas → Glas) | | n.a. (in `plurals`) |
| – | regional words (Paradeiser, Jänner) | the shared top-level `variants` | | n.a. (`variants`) |
| – | stress, vowel length, ich-/ach-Laut | pronunciation (IPA) — not a facade parameter; the lexicon does not store IPA yet | | n.a. (see report) |
| – | word family (wohnen → Wohnung) | `de.morph.derivation` is planned "later" in the catalogue (a family field like the ar / he root families) | | n.a. (deferred) |

## VERB

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `principalParts` | infinitive – er present – er Präteritum – Partizip II (with the particle in place) | ✓ | declared |
| 2 | `aux` | perfect with haben / sein / both | ✓ | declared |
| 3 | `auxBySense` | which meaning takes which auxiliary (fahren) | ✓ | declared |
| 4 | `presentChange` | du / er vowel change e→i, e→ie, a→ä, au→äu | ✓ | declared |
| 5 | `separable` | the stressed particle that moves to the end (an-, auf-, zurück-) | ✓ | declared |
| 6 | `inseparable` | the unstressed prefix (be-, er-, ver- …) | ✓ | declared |
| 7 | `governs` | object cases and prepositional objects per meaning (warten auf + ACC, helfen + DAT) | ✓ | declared |
| 8 | `reflexive` | meanings that need sich (ACC / DAT) | ✓ | declared |
| 9 | `conjugation` | weak / strong / mixed / modal / irregular |  | declared |
| 10 | `participle` | Partizip II with ge-, ge- after the particle, or none (unstressed prefix, -ieren) |  | added |
| 11 | `imperative` | du – ihr – Sie forms (lies!, iss!, fahr!, sei!; warte! with -e); none for modals |  | added |
| 12 | `konj2` | the one-word Konjunktiv II and how alive it is (wäre / käme: speech; äße, tränke: rare); none for weak verbs (= Präteritum) |  | added |
| 13 | `endingAdjust` | -e- insertion (du wartest), s-sound stems (du heißt), -ern stems (wir erinnern) |  | added |
| 14 | `spokenPast` | Perfekt in speech vs Präteritum also in speech (sein, haben, werden, modals) |  | added |
| 15 | `ersatzInfinitive` | modal + infinitive in the perfect: hat kommen wollen (not gewollt) |  | added |
| 16 | `motion` | manner of motion (gehen on foot, fahren by vehicle, fliegen by air) |  | declared |
| 17 | `deixis` | hin / her in the verb (hineingehen, hereinkommen) |  | added |
| 18 | `posture` | the position-verb pairs stellen – stehen, legen – liegen … (none of the current verbs; declared so that new ones state it) |  | added |
| 19 | `senseForms` | a meaning with forms of its own (mögen → möchte) |  | declared |
| – | Präteritum, Partizip II as separate fields | inside `principalParts`; the card derives "Präteritum" and "Partizip II" from it | | n.a. |
| – | zu-infinitive (anzukommen) | follows from `separable` (zu goes inside the particle) | | n.a. |
| – | Konjunktiv I | formed regularly from the stem for every verb (er komme); only sein (sei) is irregular — a paradigm matter | | n.a. (paradigm) |
| – | stress of prefixes | follows from `separable` / `inseparable` | | n.a. |

## ADJ (classes: ADJ, ADJ.attr attributive only, ADJ.inv invariable)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `comparison` | regular / umlaut / irregular / not compared | ✓ | declared |
| 2 | `degrees` | the comparative and superlative forms (älter, am ältesten; besser, am besten; also-correct forms after a slash) | ✓ | added |
| 3 | `stem` | stem change before an ending (hoch → hoh-, dunkel → dunkl-, teuer → teur-) | ✓ | declared |
| 4 | `endings` | takes endings / invariable (rosa, lila, orange) | ✓ | added |
| 5 | `governs` | complement with fixed preposition (froh über + ACC, hungrig nach + DAT) or dative experiencer (Mir ist kalt) | ✓ | added |
| 6 | `use` | attributive and predicative / attributive only (ordinals, letzte) / predicative only |  | added |
| – | adverbial use without ending | true of every German adjective: grammar, not a word property | | n.a. |

## ADV

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `comparison` | oft – öfter – am öftesten; bald – eher – am ehesten | ✓ | declared |
| 2 | `deixis` | hin / her (wohin, woher) | ✓ | added |
| 3 | `particleUse` | modal-particle meanings (vielleicht, auch, nur) with their function | ✓ | added |
| – | interrogative / relative / indefinite use (wo = irgendwo) | separate meanings in `profile.senses` | | n.a. |

## ADP

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `governs` | case per meaning; two-way prepositions (DAT where? / ACC where to?) | ✓ | declared |
| 2 | `contractions` | im, zum, ans … (and colloquial ones) | ✓ | declared |
| 3 | `pronominalAdverb` | the da- / wo- forms for things (darauf / worauf, drauf); none for ohne, seit, während, bis | ✓ | added |
| 4 | `position` | before the noun / after in some phrases (meiner Meinung nach) |  | added |

## DET (classes: def, indef, dem, poss, neg, quant, quantpl, int)

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `adjAfter` | weak / mixed / strong adjective endings after it | ✓ | declared |
| 2 | `owner` (poss only) | which person owns: sein for er / es, ihr for sie and for they | ✓ | added |
| 3 | `address` (poss only) | dein / euer informal, Ihr formal | ✓ | declared |
| 4 | `standalone` | forms used alone as a pronoun (einer / eins, meiner / mein(e)s, dessen / denen, dies) |  | added |
| 5 | `stem` | euer → eur-, unser → unsr- (literary) |  | added |
| 6 | `senseForms` | a meaning with forms of its own (ein = one, alle = used up) |  | declared |

## PRON

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `reference` | persons / things / both (er = he and it) | ✓ | declared |
| 2 | `address` | du / ihr informal, Sie formal | ✓ | declared |
| 3 | `possessive` | the matching possessive (er → sein, sie → ihr, wer → wessen) | ✓ | added |
| 4 | `reflexiveForm` | mich / mir, dich / dir, uns, euch, and sich for every 3rd person and Sie | ✓ | added |
| 5 | `senseForms` | das Ich; Ihr written with a capital |  | declared |
| – | case forms (mich, mir, ihn, ihm) | the paradigm cells PRON;NOM / ACC / DAT (GEN) | | n.a. (paradigm) |

## NUM

| # | parameter | why | prominent | status |
|---|---|---|---|---|
| 1 | `ordinal` | -te / -ste, erste, dritte, siebte | ✓ | declared |
| 2 | `inCompounds` | units before tens (einundzwanzig); changed forms (sech-, sieb-, dreißig, zwanzig, zwo) |  | added |
| – | fractions (Drittel, Viertel) | not taught yet; Viertel / Hälfte are nouns of their own | | n.a. |

## SCONJ · CCONJ · INTJ · PART

| POS | # | parameter | why | prominent | status |
|---|---|---|---|---|---|
| SCONJ | 1 | `verbPosition` | the finite verb goes to the end | ✓ | declared |
| CCONJ | 1 | `verbPosition` | position zero (und, aber, denn) vs first place (weder, noch) | ✓ | declared |
| CCONJ | 2 | `paired` | weder … noch, entweder … oder, zwar … aber | ✓ | added |
| CCONJ | 3 | `particleUse` | aber, denn as modal particles |  | added |
| INTJ | 1 | `formality` | informal / neutral / formal | ✓ | declared |
| INTJ | 2 | `reply` | the usual answer (danke – bitte; wie geht's? – gut, danke, und dir?) | ✓ | added |
| INTJ | 3 | `region` | where used and regional alternatives (Grüß Gott, Moin, Servus, Grüezi) |  | added |
| INTJ | 4 | `particleUse` | ja as a modal particle |  | added |
| PART | 1 | `particleUse` | the modal-particle function (doch: urging, reminding) | ✓ | added |
| SCONJ | – | mood after it (als ob + Konjunktiv II) | grammar pages and `contrasts` (als / wenn) | | n.a. |
