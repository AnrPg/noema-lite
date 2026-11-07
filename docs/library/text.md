# `text@1` — texts and verse (`engine/src/48_lib_text.js`, `NoemaLibText`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for literature, linguistics, the classics and the digital
humanities: tokens and types in every script, frequency laws, lexical diversity, concordances, collocations, keyness, stylometry,
readability, Greek and Latin quantitative metre (every valid scansion of a line, with the assumptions it makes), English
accentual-syllabic metre and rhyme schemes. The Python twin is `tools/lib_text.py` (`ID`, `check_spec`, `exprs`, `keys`): it checks
and does not analyse, with the same problems (code, path, message, level) as the JS `checkSpec`. The tests are
`node tests/lib_text.js` (99 assertions) and `node tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/text.json`,
24 specs). The reference activity is `tools/activities_examples/hexameter-scansion` (Aeneid 1.1–7: the learner picks a line and
guesses each foot; the engine lists every valid scansion and draws the best). The research behind this chapter is the project's
`engine-library/research/maptext.md` (§ text).

Pure JS, no dependency: `String.prototype.normalize` (UAX #15), Unicode property escapes (`\p{L}`, `\p{M}`, `\p{Script=Han}`…),
`toLowerCase` with SpecialCasing (Greek final sigma) and, only when `normalize.segment` is `words` on a script without spaces,
`Intl.Segmenter` (present in every current browser and in Workers; its absence is the code `no_segmenter`). Deterministic and
bounded; numbers, codes, keys and the model's own short texts (`s`, ≤ 64 characters) leave the engine.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "text@1",
  "params": [ { "id": "line", "kind": "slider", "label": "lineLabel", "min": 1, "max": 3, "step": 1, "default": 1 },
              { "id": "w", "kind": "slider", "label": "windowLabel", "min": 5, "max": 20, "step": 1, "default": 10 } ],
  "model": {
    "texts": [ { "id": "aen", "lang": "la", "label": "aenLabel",
                 "body": "Arma virumque cano, Troiae qui prīmus ab ōris\nĪtaliam fātō profugus Lāvīnjaque vēnit\nlītora, multum ille et terrīs iactātus et altō" } ],
    "normalize": { "uvij": true },
    "metre": { "pattern": "hexameter", "mcl": "both" } },
  "outputs": [
    { "id": "n", "kind": "scalar", "of": "scansions", "line": "line" },
    { "id": "d", "kind": "scalar", "of": "dactyls", "line": "line" },
    { "id": "f1", "kind": "scalar", "of": "foot", "line": "line", "n": 1 },
    { "id": "pen", "kind": "scalar", "of": "caesura", "line": "line", "type": "penthemimeral" },
    { "id": "m", "kind": "scalar", "of": "mattr", "window": "w" },
    { "id": "sc", "kind": "scene", "of": "scansion", "line": "line" },
    { "id": "dl", "kind": "series", "of": "dactylsByLine" }, { "id": "ln", "kind": "series", "of": "lineAxis" } ],
  "plots": [ { "kind": "scene", "of": "sc", "title": "scanTitle", "height": 200 },
             { "kind": "series", "title": "dactylTitle", "x": { "series": "ln", "label": "lineAxisLabel" },
               "y": { "min": 0, "max": 5 }, "series": [ { "y": "dl", "label": "dactylLine", "style": "points" } ] } ] }
```

- **The texts are the model's own content.** `body` (≤ 60 000 characters per text and in all, ≤ 30 texts) is never shown as a learner
  string; the engine returns numbers about it and, in scenes, short pieces of it (`s` ≤ 64 characters: a KWIC line, a syllable, a
  rhyme word). Words in outputs (`word`, `w1`, `w2`, `scheme`) are short raw texts (1–64 characters), normalised like the text.
- **numx** fields (`line`, `window`, `threshold`, `sample`, `per`, `rmin`, `rmax`, `xmin`, `o11`, `r1`, `c1`, `n`, `mfw`) take a
  number or an expression over the spec's names; `exprs(spec)` lists them as `[source, path, []]` in that order. A static `line` must be
  an integer 1–2000; a computed one is rounded. `keys(spec)` lists `texts[].label` (used by the Delta map).
- `text` names a text of the model; when it is left out, the first text is used.
- **Runtime** (`run(spec, env, {prepared})` → `{out, codes: [{id, code}]}`): tokenisations and scansions are cached per run (and across
  runs through `prepare`). What cannot be computed is NaN, an empty series or an empty scene with a code (§12); a run never throws.

### 1.1 The model

| field | kind | meaning |
|---|---|---|
| `texts` | 1–30 `{id!, body!, lang, label}` | `lang`: en · la · grc · el · de · fr · es · it · ru · ar · he · zh · ja · th · other |
| `normalize.form` | NFC (default) · NFD · NFKC · none | Unicode normalisation (UAX #15) before anything else |
| `normalize.case` | lower (default) · keep | case folding by `toLowerCase` (Greek final sigma by SpecialCasing) |
| `normalize.foldSigma` | bool | ς → σ (one letter for counting) |
| `normalize.diacritics` | keep (default) · strip | NFD, drop `\p{M}`, NFC (lossy: Greek accents, Latin macrons) |
| `normalize.uvij` | bool | Latin v → u, j → i (editions differ) |
| `normalize.numbers` | drop (default) · keep | tokens of digits only |
| `normalize.hyphens` | join (default) · split | a line-end hyphen before a lower-case letter is joined |
| `normalize.enclitics` | bool | Latin -que, -ne, -ve split off as tokens `-que`… (except quoque, itaque, neque… a closed list) |
| `normalize.segment` | auto (default) · chars · words | zh/ja/th: one token per character (`auto`, deterministic) or `Intl.Segmenter` words (`words`, code `segmenter_approx`: dictionaries differ between browsers) |
| `metre` | `{pattern!, lang la·grc·en, mcl both·long·short, synizesis, max 1–64}` | §8–§10; `max` caps the readings listed (default 64) |
| `lexicon` | ≤ 2000 `{w!, p!}` | English stress overrides: `p` one digit per syllable (1 primary, 2 secondary, 0 none), e.g. `temperate` → `100` |

### 1.2 Checker codes (`checkSpec`, the same in `tools/lib_text.py`)

| code | when |
|---|---|
| `format` / `value` / `size` / `enum` / `unknown-field` (warning) | the shared walker: shape, required fields, lengths, enumerations |
| `dup` | two texts with the same id |
| `value` | a text without `body`; a lexicon word not 1–64 characters or a stress pattern not `[012]{1,12}`; an output word not 1–64 characters; `assoc` without `w1`+`w2` or the four counts; a `line` that is not an integer 1–2000; a `scheme` that is not letters and spaces; Delta with < 3 texts |
| `size` | a body over 60 000 characters, or all bodies together (lengths in UTF-16 units, as JS counts them) |
| `ref` | `text`, `ref`, `a`, `b` naming no text; a scansion output without `model.metre`; `metreFit` on a quantitative metre; scansions on an English metre |
| `output` | an `of` that does not exist for that `kind` |

## 2. Tokens, types and sentences

A token is a maximal run of letters, marks and digits, with inner elision apostrophes (`'`, U+02BC, U+1FBD, U+1FBF are all mapped to
U+2019 first, so `l’homme`, `δ’ ἄρα`, `o’er` are stable); the folded form (§1.1) is the type. Sentences end at `. ! ? …` (and the Greek
question mark `;`, U+037E after NFC, for grc and el; the ano teleia `·` does not end a sentence); a full stop after a closed list of
English abbreviations (Mr, Dr, e.g., etc…) does not. Greek: NFC turns oxia (U+1F71) into tonos (U+03AC), so editions encoded either way
give the same types.

| output (scalar) | value |
|---|---|
| `tokens`, `types` | N, V |
| `ttr` | V/N |
| `hapax`, `dis` | types of frequency 1, 2 |
| `sentences` | sentence count (0 for an empty text) |
| `chars` | grapheme clusters without spaces (`Intl.Segmenter` graphemes, else code points after NFC) |
| `meanWordLen` | mean graphemes per token |
| `freq` | `word!` count, or per `per` tokens (e.g. 1000) |

## 3. Frequency laws

| output | method | source |
|---|---|---|
| `zipf` (scalar; `fit` ols·mle, `rmin`, `rmax`, `xmin`) | `ols`: α = −slope of ln f on ln r over ranks rmin…rmax. `mle`: the discrete power-law MLE of the frequency distribution above `xmin`, α_f = 1 + n/Σ ln(x/(xmin − ½)), turned into the rank exponent α = 1/(α_f − 1) | Zipf 1949; Clauset, Shalizi & Newman 2009, SIAM Rev. 51:661, eq. 3.7 |
| `heaps` (scalar; `what` beta·K) | V = K·N^β by OLS on ln V vs ln N for N ≥ max(10, N/10) | Heaps 1978; Herdan 1960 |
| `rankFreq`, `ranks` (series; `top` ≤ 2000) | frequencies by rank (ties by first occurrence) and the rank axis | — |
| `heapsV`, `heapsN` (series) | the vocabulary growth curve (thinned to ≤ 2000 points) | — |
| `wordLengths`, `lengthAxis` (series; `max`) | how many tokens have 1, 2, … max graphemes (the last bin is "max or more") | Mendenhall 1887 |

OLS on a log–log rank plot is what textbooks show and is biased (Clauset et al. 2009); the MLE is offered next to it so an activity can
show the difference. Fewer than 5 types (or 5 frequencies ≥ xmin) give NaN with `few_types`; Heaps needs ≥ 50 tokens (`too_short`).

## 4. Lexical diversity

| output | formula | source | note |
|---|---|---|---|
| `ttr` | V/N | — | falls with N: never compare texts of different length (the series `ttrCurve` shows it) |
| `guiraudR` | V/√N | Guiraud 1954 | |
| `herdanC` | ln V / ln N | Herdan 1960 | N ≥ 2 |
| `yuleK` | 10⁴ (Σ m² V_m − N)/N² | Yule 1944 | stable in N |
| `simpsonD` | Σ f(f − 1) / (N(N − 1)) | Simpson 1949 | N ≥ 2 |
| `honoreR` | 100 ln N / (1 − V₁/V) | Honoré 1979 | NaN when every type is a hapax (`all_hapax`) |
| `mattr` (`window`, default 50) | the mean TTR of every window of W tokens | Covington & McFall 2010, J. Quant. Ling. 17:94 | W > N gives the TTR with `window_gt_text` |
| `mtld` (`threshold`, default 0.72) | N / factors, where a factor ends when the running TTR falls to the threshold, plus a partial factor (1 − TTR)/(1 − 0.72); mean of the forward and backward passes | McCarthy & Jarvis 2010, BRM 42:381 | < 100 tokens: `short_text` |
| `hdd` (`sample`, default 42) | Σ over types of (1 − P(absent from a sample of s tokens))/s, hypergeometric via ln Γ (Lanczos) | McCarthy & Jarvis 2007, Lang. Testing 24:459 | N < s: NaN, `too_short` |

Series: `ttrCurve`, `mattrCurve`, `mtldCurve` over `prefixN` (`steps` prefixes, ≤ 200) — the length bias made visible.

## 5. Concordance and collocation

- `kwic` (scene; `word!`, `window` 1–12 tokens, `max` lines ≤ 40): the classic keyword-in-context display, the keyword in role `hi`,
  the contexts right- and left-aligned, each piece ≤ 64 characters. Not found: an empty scene with `not_found`.
- `topWords` (scene; `top` ≤ 30): a bar chart of the most frequent types.
- `assoc` (scalar; `measure!`): from two words (`w1`, `w2`, co-occurring within `span` tokens, default 1 = adjacent bigram) or from the
  counts `o11` (pair), `r1` (w1), `c1` (w2), `n` (sample size), all numx. Expected E₁₁ = r₁c₁/n over the 2×2 contingency table
  (Evert 2008, *Corpora and collocations*).

| `measure` | formula | source |
|---|---|---|
| `pmi` | log₂(O₁₁/E₁₁) | Church & Hanks 1990 |
| `npmi` | pmi / −log₂(O₁₁/n), in [−1, 1] | Bouma 2009 |
| `mi3` | log₂(O₁₁³/E₁₁) | Daille 1994 |
| `t` | (O₁₁ − E₁₁)/√O₁₁ | Church et al. 1991 |
| `chi2` | Pearson's χ² of the 2×2 table (code `chi2_small` when an expected count < 5) | Manning & Schütze 1999 §5.3.3 |
| `g2` | 2 Σ O ln(O/E) over the four cells | Dunning 1993, Comp. Ling. 19:61 |
| `dice` · `logDice` | 2O₁₁/(r₁ + c₁) · 14 + log₂ of it | Dice 1945, Smadja 1993 · Rychlý 2008 |

A pair never seen: PMI and logDice −∞, t NaN, with `zero_pair`; impossible counts (O₁₁ > r₁, …): NaN with `counts`.

- `keyness` (scalar; `text!`, `ref!`, `word!`, `measure` g2·logRatio): signed log-likelihood (positive when the word is relatively more
  frequent in `text`; Rayson & Garside 2000) or Log Ratio log₂ of the relative frequencies (a zero count counts as 0.5; Hardie 2014).

## 6. Stylometry

`delta` (scalar; `a!`, `b!`, `mfw` default 100, `variant`) and `deltaMap` (scene, a k × k heat map with the values) over all the
model's texts (≥ 3): the relative frequencies of the `mfw` most frequent words of the whole corpus, z-scored across the texts (sample
standard deviation), then **burrows** = mean |z_a − z_b| (Burrows 2002, LLC 17:267), **cosine** = 1 − cos(z_a, z_b) (Smith & Aldridge
2011; Evert et al. 2017 show it is the most robust), **quadratic** = mean (z_a − z_b)² (Argamon 2008). A word with zero spread is
dropped (`sd_zero`).

## 7. Readability

`readability` (scalar; `formula!`, `what` score·asl·asw·words·sentences·syllables). ASL = words per sentence, ASW = syllables per word.
Each formula is meant for one language; on another the value is given with `formula_lang`. A text without sentence punctuation (a
poem) is one sentence with `no_sentences`; SMOG on < 30 sentences gives `smog_short`.

| `formula` | language | formula | source |
|---|---|---|---|
| `flesch` | en | 206.835 − 1.015 ASL − 84.6 ASW | Flesch 1948 |
| `fk` | en | 0.39 ASL + 11.8 ASW − 15.59 | Kincaid et al. 1975 |
| `fog` | en | 0.4 (ASL + 100 · words of ≥ 3 syllables / words) | Gunning 1952 |
| `smog` | en | 1.043 √(polysyllables × 30/sentences) + 3.1291 | McLaughlin 1969 |
| `coleman` | en | 0.0588 L − 0.296 S − 15.8 (per 100 words) | Coleman & Liau 1975 |
| `ari` | en | 4.71 letters/word + 0.5 ASL − 21.43 | Senter & Smith 1967 |
| `lix` | any | ASL + 100 · words of > 6 letters / words | Björnsson 1968 |
| `amstad` | de | 180 − ASL − 58.5 ASW | Amstad 1978 |
| `kandel` | fr | 207 − 1.015 ASL − 73.6 ASW | Kandel & Moles 1958 |
| `huerta` | es | 206.84 − 0.60 · 100 ASW − 1.02 · 100 S/W | Fernández Huerta 1959 |
| `szigriszt` | es | 206.835 − 62.3 ASW − ASL | Szigriszt-Pazos 1993 |
| `oborneva` | ru | 206.835 − 1.3 ASL − 60.1 ASW | Oborneva 2006 |

Syllables: English by vowel groups with the usual corrections (silent final e, -le, -es, -ed, a list of exceptions such as every,
heaven, fire, poem); other languages by vowel groups of their alphabet (Spanish hiatus with í/ú, French mute final e, Russian one per
vowel letter). The formulas are rough by design (they ignore meaning); the tests check the formulas, not a claim about a text's
difficulty. Values outside a scale (a negative grade) are returned as they are.

## 8. Latin and Greek quantitative metre

`model.metre.pattern`: `hexameter`, `pentameter`, `elegiac` (odd lines hexameters, even lines pentameters), `trimeter` (Greek iambic
trimeter), `senarius` (Latin iambic senarius), `hendecasyllable` (Phalaecean), `sapphic` (the lesser Sapphic line). Templates after
West 1987 (*Introduction to Greek Metre*) and Raven 1965 (*Latin Metre*).

**Syllables and quantity** (Allen, *Vox Latina* 1978 and *Vox Graeca* 1987): one syllable per vowel or diphthong. A syllable is long by
nature (a macron or circumflex, Greek η ω, an iota subscript, a diphthong) or by position (two consonants follow, across word ends; x,
z, ζ, ξ, ψ count double; h counts zero; qu, gu after n, ch, ph, th, rh are one consonant). A short vowel before a stop + liquid
inside a word (*muta cum liquida*, `mcl`) is either (`mcl: both`; `long`/`short` make the other choice cost one). An unmarked vowel
whose length is not known is either. Latin consonantal i and u (iam, Troia, volvit) are consonants; `Lāvīnja` marks it where the
author knows it. A diaeresis (ï) forbids a diphthong.

**Changes at word ends**: Latin elision of a final vowel, diphthong or vowel + m before a vowel or h + vowel (*multum ille* →
*mult’ ill’*), prodelision with *es*/*est* (*bona est* → *bona’st*), `^` after a word marks hiatus; Greek elided words keep their
apostrophe, and **epic correption** lets a long final vowel or diphthong before a vowel count short (it costs one when used).
**Synizesis** (Greek ε + ω/ο/α inside a word, as Πηληϊάδεω) is tried when `synizesis` is not false: each candidate (≤ 6 per line) is
applied or not, and every use costs one.

**Every scansion**: a depth-first match of the syllables against the metre's template enumerates every assignment that fits (≤ 200 000
steps: beyond, `too_ambiguous`), each with its cost (correption, a disfavoured mcl choice, synizesis; a hexameter with a spondaic fifth
foot, the *spondeiazon*, costs one: ≈ 5 % of Homer's lines, a few dozen in the whole Aeneid). Readings are ranked by cost, then by
feet; `max` cuts the list (`readings_cut`). No fit: `no_scansion`. An unmarked text often has several readings — that is the lesson,
not an error: Aeneid 1.1 without macrons has 2 (DDSSDS and a spondeiazon), with *prīmus, ōris* one.

| output | fields | value |
|---|---|---|
| `scansions` (scalar) | `line!` | how many readings |
| `foot` (scalar) | `line!`, `n!` 1–6, `reading` | 1 if foot n of the reading is a dactyl, 0 a spondee (`no_feet` for non-dactylic metres) |
| `dactyls` (scalar) | `line!`, `reading` | dactyls in the reading |
| `caesura` (scalar) | `line!`, `type!`, `reading` | 1 / 0: `penthemimeral` (after the 3rd foot's first syllable), `trithemimeral`, `hephthemimeral`, `trochaic` (after a dactylic 3rd foot's second syllable), `bucolic` (a word end after the 4th foot), `diaeresis` (pentameter, at the midpoint) |
| `syllables` (scalar) | `line` | syllables of the line (of the best reading); without `line`, of the whole text (readability counting) |
| `scansion` (scene) | `line!`, `reading` | the syllables, – and ⏑ over them (in role `warn` where an assumption decided: mcl, correption, synizesis), the foot bars, D/S per foot, ‖ at the caesurae |
| `dactylsByLine`, `lineAxis` (series) | — | dactyls of the best reading of each line (≤ 200 lines; NaN where none) and the line numbers |

## 9. English metre

`iambic5` (pentameter), `iambic4`, `trochaic4`. Stress per word: the `lexicon`, then a built-in list (≈ 200 words: compare 01, summer
10, temperate 100…), then monosyllables (function words weak, others free), then suffix rules (-tion → …10, -ity → …100) with the code
`stress_guess`. The line is matched against the template and its usual variants (initial inversion, feminine ending, headless line;
catalexis for trochaic tetrameter) by a simplified **stress-maximum** rule (Kiparsky 1975, LI 6:576; Hanson & Kiparsky 1996): a
lexically stressed syllable of a polysyllable in a weak position, with no stress next to it, is a violation; weaker mismatches only
cost.

| output | value |
|---|---|
| `metreFit` (scalar; `line!`) | the violations of the best variant (0 = the line scans); NaN with `syllable_count` when no variant has the line's syllable count |
| `syllables` (scalar; `line`) | the syllables counted for the metre |

## 10. Rhyme

`rhyme` (scalar; `a!`, `b!` line numbers): 1 if the last words share a rhyme key, else 0. `scheme` (scalar; `scheme!` letters such as
`ABAB CDCD EFEF GG`, `from`): the number of line pairs where the scheme and the rhyme keys disagree (0 = the scheme fits); too few lines
give `lines`. `rhymes` (scene; `from`): up to 40 lines with the letter each one gets. The rhyme key is **orthographic** (the last vowel
group of the last word to its end, after dropping a silent e, a plural -s, -ed after a consonant; diacritics stripped): it finds
*day/May*, misses eye rhymes and sound rhymes spelled differently (*through/blue*). A phonetic dictionary (CMUdict, 3.6 MB) was judged
too large to vendor; a `lexicon` of rhyme keys is a possible extension.

## 11. Limits

≤ 30 texts and ≤ 60 000 characters in all; ≤ 200 000 tokens (`truncated`); ≤ 2000 values per series, ≤ 2000 scene items; scansion
≤ 64 readings (`max`) and ≤ 200 000 matching steps; ≤ 6 synizesis candidates per line; `dactylsByLine` ≤ 200 lines; words ≤ 64
characters. Measured: the heaviest test run 104 ms in node (Gettysburg with every measure; the sonnet with 14 lines of metre and
rhyme).

## 12. Runtime codes

| code | meaning |
|---|---|
| `empty` | no tokens (ratios NaN) |
| `too_short` · `short_text` | too few tokens for the measure (NaN) · MTLD on < 100 tokens (a value, unreliable) |
| `window_gt_text` | MATTR window longer than the text (the TTR is given) |
| `few_types` · `all_hapax` | Zipf with < 5 types · Honoré with every type a hapax |
| `counts` · `zero_pair` · `chi2_small` | impossible 2×2 counts · a pair never seen · expected counts < 5 |
| `formula_lang` · `no_sentences` · `smog_short` | a readability formula for another language · no sentence punctuation · SMOG on < 30 sentences |
| `sd_zero` | Delta: a word with no spread was dropped |
| `no_line` · `no_reading` · `no_feet` | the line does not exist · the reading does not exist · a foot of a non-dactylic metre |
| `no_scansion` · `too_ambiguous` · `readings_cut` | no reading fits · the matcher hit its step bound · more readings than `max` |
| `syllable_count` · `stress_guess` | English: no variant has that many syllables · a stress was guessed by rule |
| `lines` · `not_found` | a scheme longer than the text · a KWIC word not in the text |
| `segmenter_approx` · `no_segmenter` | word segmentation by `Intl.Segmenter` (browser-dependent) · not available (characters used) |
| `truncated` · `error` | over 200 000 tokens · an internal failure |

## 13. Reference values asserted by `tests/lib_text.js`

| what | value | source |
|---|---|---|
| "new companies" O₁₁ 8, f 15 828 / 4 675, N 14 307 668 | t = 0.999932, χ² = 1.55 | Manning & Schütze 1999 §5.3.1, §5.3.3 |
| "Ayatollah Ruhollah" 20, 42, 20 | PMI 18.38 | M&S Table 5.16 |
| "most powerful" 150, 12 593, 932 | G² 1291.42 (± 0.15; exact 2×2: 1291.319057) | M&S Table 5.12; Dunning 1993 |
| Gettysburg Address (Bliss copy) | N 272, V 138, hapax 90, 10 sentences; MATTR(50) 0.7664574, MTLD(0.72) 58.131408, HD-D(42) 0.8263084, Yule K 110.564446 | cross-checked with the Python package lexical-diversity 0.1.1 |
| "The cat sat on the mat." | Flesch 116.145, FK −1.45 | the formulas |
| f = 20 000/r | Zipf OLS α = 1 (0.002); MLE α ≈ 1 (0.06) | Clauset et al. 2009 |
| Unicode | ΟΔΥΣΣΕΥΣ → final ς; ἄνδρα 5 code points NFC, 7 NFD; oxia = tonos after NFC | Unicode SpecialCasing, UAX #15 |
| Aeneid 1.1 | DDSSDS, penthemimeral; 2 readings unmarked, 1 with prīmus ōris | standard scansion |
| Aeneid 1.2 (Lāvīnja-) · 1.3 | DSDSDS · DSSSDS with mult(um) ill(e) | standard scansion |
| Eclogues 1.1, Aeneid 2.49 | DDDSDS | standard scansion |
| Ovid, Amores 1.1.1–2 | DDDDDS (17 syllables) + pentameter with the central diaeresis | standard scansion |
| Iliad 1.1 · Odyssey 1.1 | DDSDDS with synizesis of -δεω · DDDDDS with epic correption | standard scansion |
| Shakespeare, Sonnet 18 | ABAB CDCD EFEF GG fits (0), every line 10 syllables, metreFit 0; line 5 an initial inversion | Kiparsky 1975 |
| Gray, Elegy 1 | regular iambic pentameter | — |

Also asserted: every edge case of §12, the Greek question mark, Chinese characters as tokens, Latin enclitics, hyphen joining, the
checker's codes, the adapter (sliders → outputs), the Worker source giving identical outputs in a fresh `vm` context, and the
pathological trimeter line staying within the step bound.

## 14. Not covered (and why)

Lemmatisation and part-of-speech tagging (need language models far beyond a vendored file; a pack can supply lemma lists as texts);
phonetic rhyme and stress dictionaries (CMUdict is 3.6 MB); Arabic ʿarūḍ and Sanskrit metres (the same machinery with other rules — a
later version); syllabification of Greek and Latin prose for readability (vowel groups are used); topic models and embeddings (not
deterministic within the budget).

## Uses the kernel

No duplicated facility (no randomness, no root finding, no statistics the kernel has): nothing to move (checked 2026-11-07).
