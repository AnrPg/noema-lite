# `seq@1` — DNA, RNA and protein sequences (`src/engines/seq/seq.js`, `NoemaLibSeq`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for molecular sequences, from base pairing to the tools of a
molecular-biology bench. There is one engine with 9 **modes** (`model.mode`): `translate`, `mutate`, `divergence`, `tm`, `align`,
`dotplot`, `digest`, `protein`, `crispr`. The Python twin is `tools/lib_seq.py` (`ID`, `check_spec`, `exprs`, `keys`). It checks and
does not compute, and it gives the same problems (code, path, message, level) as the JS `checkSpec`. The two share one JSON constant
`SPEC` (the tables, the sequence fields, the outputs, the enzyme names, the genetic-code ids), and the tests check that the two copies
are identical. The tests are `node tests/lib_seq.js` (132 assertions) and `node tests/enginelib.js` (JS ↔ Python parity on
`tests/fixtures/enginelib/seq.json`, 27 specs). The reference activity is `tools/activities_examples/sickle-codon`: the learner
changes one base of the human β-globin coding sequence and looks for the sickle-cell mutation. The research behind this chapter is in
the project's `engine-library/research/life.md` (§ seq@1).

Pure JS, no dependency. The data tables are inline: the 27 NCBI genetic codes (~3 KB), BLOSUM62, BLOSUM50 and PAM250 (~2 KB each),
the Guruprasad dipeptide instability table, the SantaLucia nearest-neighbour parameters and 67 REBASE enzymes (~5 KB). They were
compared with Biopython 1.88 (Cock et al. 2009), which was the test oracle when the reference values were made. Biopython is not
shipped and is not needed to run the tests.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "seq@1",
  "params": [ { "id": "pos", "kind": "slider", "label": "posLabel", "min": 1, "max": 60, "step": 1, "default": 1 },
              { "id": "base", "kind": "choice", "label": "baseLabel", "default": 0,
                "options": [ { "value": 0, "label": "baseA" }, { "value": 1, "label": "baseC" }, { "value": 2, "label": "baseG" }, { "value": 3, "label": "baseT" } ] } ],
  "model": { "mode": "mutate",
    "cds": ">HBB coding sequence\nATGGTGCATCTGACTCCTGAGGAGAAGTCT…CACTAA",
    "variants": [ { "kind": "sub", "pos": "pos", "altIndex": "base" } ],
    "enzymes": [ "Bsu36I" ] },
  "outputs": [ { "id": "effect", "kind": "scalar", "of": "effect", "arg": 0 },
               { "id": "aaPos", "kind": "scalar", "of": "protPos", "arg": 0 },
               { "id": "altAa", "kind": "scalar", "of": "altAa", "arg": 0 },
               { "id": "sitesAlt", "kind": "scalar", "of": "sitesAlt", "arg": 0 },
               { "id": "names", "kind": "scene", "of": "hgvs" } ],
  "plots": [ { "kind": "scene", "of": "names", "title": "namesTitle", "height": 120 } ] }
```

- **Sequences** are texts of the model (`seq`, `cds`, `a`, `b`, `seq2`, `template`, a variant's `alt`, a custom enzyme's `site`). A
  sequence may be written in FASTA style: lines that start with `>` are dropped, and so are spaces, line breaks and digits (GenBank
  numbering). Letters are made upper case. A sequence is never a formula. The checker refuses an empty sequence, a sequence too
  long for its mode, a non-ASCII character, a letter outside the alphabet (it names the letter and its position) and T mixed with U.
  Alphabets: nucleotides `ACGTU` + the IUPAC codes `RYSWKMBDHVN` (Cornish-Bowden 1985); `mutate` takes only `ACGTU`; `divergence`
  also takes `-`; proteins take the 20 amino acids + `U` (Sec), `O` (Pyl), `B`, `Z`, `J`, `X` and a final `*`.
- **Numbers** of the model are **numx**: a number, or an expression over the spec's names (consts, params, derived), compiled once
  with NoemaExpr. `exprs(spec)` lists them as `[source, path, []]`. The engine has no local names. `keys(spec)` lists the keys of a
  digest map's `features` (the labels drawn on the map). Every other label is a number (`v`) or the model's own short text (`s`,
  ≤ 64 characters: codons, residues, HGVS names, enzyme names, a guide).
- **Outputs**: `{id, kind, of, arg?}`. `of` must be something the mode computes (§3–§11), and `kind` must be its kind. Otherwise the
  error is `output`. Outputs marked *(arg)* take an `arg`: an index (`int`, 0–9999: an ORF, a variant, a site, a fragment, a
  guide), a nucleotide letter (`base`), a codon (`codon`), an amino-acid letter (`aa`) or a primer rule (`issue`).
- **Runtime codes** (`run(spec, env, {seed})` returns `{out, codes}`): a value outside a method's range is never reported as a wrong
  number. A value that cannot be computed is NaN (an empty series, an empty scene), and the code says why. `valid` is 0 when the
  mode's main result is missing. A model the checker refuses does not run (`empty`, `invalid`). A run never throws: an internal
  failure gives `error`.
- **Limits**: sequences ≤ 20 000 nt (`translate`, `digest`, `crispr`, a PCR template), ≤ 6000 (`mutate`, `divergence`), ≤ 2000 per
  sequence (`align`, `dotplot`), ≤ 120 nt (an oligo of `tm`), ≤ 5000 aa (`protein`). Alignment ≤ 250 000 DP cells (a band makes
  longer pairs fit). A shuffle test ≤ 1000 shuffles and cells × (1 + shuffles) ≤ 2 000 000. A dot plot ≤ 2000 × 2000 = 4 000 000
  windows. ≤ 5000 ORFs, ≤ 5000 CRISPR guides, ≤ 1000 primer binding sites. Every series ≤ 2000 values and every scene ≤ 2000 items
  (a large dot plot is pooled). The worst allowed runs take ~0.7 s together (the speed test).

### 1.1 Checker codes (`checkSpec`, the same in `tools/lib_seq.py`)

| code | when |
|---|---|
| `format` | `model` is not an object; a shape is not an object or an array |
| `enum` | `mode`, `start`, `gc`, `saltCorr`, `nn`, `selfComp`, `type`, `alphabet`, `matrix`, `ladder`, `pk`, `nuclease`, a variant's `kind`, a feature's `strand` |
| `value` | a missing required field; a value of the wrong kind; a sequence that is not a text, empty, shorter than its minimum or not ASCII; a genetic code that does not exist (7, 8, 17–20); a substitution without `alt`/`altIndex`; an insertion without `alt`; aligned sequences of different lengths (`divergence`); a substitution matrix on DNA; a custom enzyme named like another; a `*` inside a protein |
| `alphabet` | a letter outside the mode's alphabet (with the letter and its position); T and U in one sequence |
| `size` | a list or a sequence too long; an alignment of more than 250 000 cells (set `band`) |
| `ref` | an enzyme that is neither built in nor in `model.custom` |
| `unknown-field` (warning) | a field the mode does not know |
| `output` | an `of` the mode does not compute, a kind it does not give, a missing or malformed `arg` |

## 2. Conventions

- Positions are 1-based and in the coordinates of the input's top strand, as NCBI and GenBank count them. A cut position *c* means
  the cut lies after base *c*, that is, before 0-based index *c*. An ORF on the minus strand runs from its start (the higher number)
  down to its end.
- Frames: +1, +2, +3 start at bases 1, 2, 3. −1, −2, −3 start at the 3′ end of the input, on the reverse complement (NCBI ORFfinder).
- Genetic codes: the NCBI tables 1–6, 9–16, 21–33 (Elzanowski & Ostell, `gc.prt`). Each table is two 64-letter strings (amino acids,
  starts) in TCAG order.
- Ambiguous codons are expanded (≤ 64 combinations). The amino acid is given when all expansions agree (CTN → L, MGR → R, TAR → `*`).
  B is given for {D, N}, Z for {E, Q}, J for {I, L}, and X for anything else (Biopython, EMBOSS `transeq`).
- Gap scores are **scores** (≤ 0). A gap of *k* letters scores `open + (k − 1)·extend`: `open` is the score of its first position
  (Biopython's `open_gap_score`; EMBOSS). BLAST's "existence 11, extension 1" is therefore `open −12, extend −1`. A linear gap is
  `gap` (= open = extend).
- HGVS (den Dunnen et al. 2016; varnomen.hgvs.org): `c.` counts from the A of ATG = c.1. Deletions, duplications and insertions are
  shifted to their most 3′ position (the 3′ rule) before they are named. Deleted bases are not written (`c.5del`). An insertion that
  repeats the bases before it is a `dup`. Protein names use three-letter codes in parentheses (predicted).

## 3. `translate` — composition, translation, ORFs, splicing, codon usage

Model: `seq`, `table` (1), `frame` (numx, ±1–3), `cds` (bool: the first codon is read as M when it is a start of the table, and the
CDS is validated), `toStop`, `start` (`atg` | `alt` | `any` for ORFs), `minLen` (numx, nt with the stop, default 75 as ORFfinder),
`nested`, `partial` (default true), `gc` (`remove` | `ignore` | `weighted`), `window` (numx, nt), `exons` ([{start, end}] 1-based,
ascending), `refUsage` (64 counts in TCAG order: the reference for CAI).

| output | kind | what |
|---|---|---|
| `length`, `gc`, `gcSkew`, `gc3`, `count` *(base)*, `palindrome` | scalar | composition: GC in the chosen convention (Biopython `gc_fraction`: `remove` leaves ambiguous letters out, `ignore` counts them in the length only, `weighted` S = 1, W = 0, N = ½, B/V = ⅔, D/H = ⅓); skew (G − C)/(G + C) (Lobry 1996); GC at third positions |
| `mwSS`, `mwOH` | scalar | ssDNA/RNA mass with a 5′ phosphate (Σ monophosphates − (n − 1)·18.015, Biopython) and the synthetic-oligo 5′-OH mass (OligoCalc, Kibbe 2007); NaN with ambiguous letters |
| `protLength`, `nStops`, `leftover` | scalar | the translation of the frame: residues, stops, the 1–2 bases left over |
| `cdsValid`, `incompleteStop` | scalar | with `cds`: a start of the table, length ÷ 3, one final stop, no internal stop; a mitochondrial CDS ending in T or TA (completed by poly(A)) |
| `nOrfs`, `longestOrf`, `orfStart`/`orfEnd`/`orfFrame`/`orfCodons`/`orfPartial` *(int: rank by length)* | scalar | ORFs in six frames; `orfPartial` 1 = no upstream stop (`start: any`), 2 = open at 3′ |
| `splicedLength`, `nIntrons`, `canonicalIntrons` | scalar | the exons joined; introns GT–AG, GC–AG (~0.8 % of human introns) or AT–AC (U12) |
| `codonCount`, `rscu` *(codon)*, `aaCount` *(aa)*, `enc`, `cai` | scalar | codon usage of frame +1 of the (spliced) sequence: RSCU (Sharp, Tuohy & Mosurski 1986); ENC = Σ_k n_k / F̄_k over the degeneracy classes of the table (Wright 1990; a missing 3-fold class takes the mean of F₂ and F₄); CAI = geometric mean of w = RSCU/RSCU_max of the reference (Sharp & Li 1987; Met, Trp and stops left out; a w of 0 becomes 0.01 with `cai-zero-w`) |
| `winPos`, `gcWin`, `skewWin`, `cumSkew`, `codonIndex`, `codonCounts`, `rscuAll` | series | windows (≤ 2000: a window too small is widened, `window-small`); 64 codons |
| `translation`, `orfMap`, `strands` | scene | codons with their amino acids (≤ 300); six ORF tracks (partial ORFs `warn`); the two strands of the first 60 bases |

Context-dependent stops: in tables 27 (TGA), 28 (TAA, TAG, TGA) and 31 (TAA, TAG), these codons are read as amino acids inside a
sequence and as a stop only as its last codon (Swart et al. 2016 Cell 166:691; Záhonová et al. 2016). An alternative start codon is
read as M only at position 1 of a CDS. Codes: `ambiguous`, `exon-range`, `noncanonical-intron`, `frame-range`, `window-range`,
`window-small`, `cds-no-start`, `cds-length`, `cds-no-stop`, `cds-internal-stop`, `incomplete-stop`, `minlen-range`, `orfs-many`,
`enc-sparse` (a class without two codons of data), `cai-zero-w`.

## 4. `mutate` — variants and their effect (HGVS)

Model: `cds` (ACGT(U), from ATG), `table`, `variants` (1–16: `{kind: sub | del | ins | dup | delins, pos, end?, alt? | altIndex?}`;
`pos`/`end` numx 1-based; `alt` the new bases; `altIndex` numx 0–3 = A, C, G, T for a slider), `enzymes` (≤ 10 built-in names: their
sites are counted in the reference and in each variant).

| output | kind | what |
|---|---|---|
| `effect` *(int)* | scalar | 0 synonymous, 1 missense, 2 nonsense, 3 stop-loss, 4 start-loss, 5 in-frame deletion, 6 in-frame insertion/duplication, 7 in-frame delins, 8 frameshift, 9 not applied (out of range, the same base) |
| `protPos`, `refAa`, `altAa` *(int)* | scalar | the first residue changed, and its amino acids as indices in `ACDEFGHIKLMNPQRSTVWY*` (20 = stop) |
| `newLength`, `fsStop`, `blosum`, `transition`, `sitesRef`, `sitesAlt` *(int)* | scalar | the new protein's length; the frameshift's `fs*N`; BLOSUM62 of a missense exchange; a transition (A↔G, C↔T) 1, a transversion 0; restriction sites before and after |
| `refLength`, `nVariants`, `count` *(int: an effect)*, `transitions`, `transversions` | scalar | |
| `effects` | series | the effect of each variant |
| `hgvs`, `protein` *(int)* | scene | the c. and p. names of every variant; the two proteins around a variant's first change |

Names: `c.20A>T p.(Glu7Val)`, `p.(Gly2=)`, `p.(Trp3*)`, `c.4_6del p.(Lys2del)`, `c.4_6dup p.(Lys2dup)`, `c.7_8insAGC
p.(Lys2_Leu3insGln)`, `c.6del p.(Lys2Asnfs*2)`, `p.(Gly2Valfs*?)` (no stop before the end), `c.17A>C p.(*6Serext*?)`, `p.(Met1?)`
(the start is lost: the effect is unknown). Codes: `cds-no-start`, `cds-no-stop`, `variant-range`, `same-base`. Not covered (it would
need gene structure): intronic and UTR numbering (c.88+1, c.−14), splice effects, complex alleles.

## 5. `divergence` — distances between two aligned sequences

Model: `a`, `b` (the same length, gaps `-` allowed), `coding`, `table`. Outputs: `sites`, `diffs`, `p`, `P` (transitions/site), `Q`
(transversions/site), `tsTv`, `jc` = −¾ ln(1 − 4p/3) (Jukes & Cantor 1969), `k2p` = −½ ln(1 − 2P − Q) − ¼ ln(1 − 2Q) (Kimura 1980).
With `coding`: `S`, `N`, `Sd`, `Nd`, `pS`, `pN`, `dS`, `dN`, `omega` (Nei & Gojobori 1986: every pathway between two codons weighted
equally; a change to a stop counts as non-synonymous). Series `diffPos`; scene `alignment` (≤ 300 columns, transitions `warn`).
Codes: `no-sites`, `saturated` (p ≥ ¾: no distance), `coding-length`.

## 6. `tm` — melting temperature, primers, in-silico PCR

Model: `seq` (the oligo, ≤ 120 nt), `seq2` (a second primer), `template` (≤ 20 000 nt), the ions in mM `na` (50), `k`, `tris`, `mg`,
`dntp`, the strand concentrations in nM `c1` (25), `c2` (25), `saltCorr` (`none` | `schildkraut` | `santalucia` (default) |
`owczarzy2004` | `owczarzy2008`), `nn` (`santalucia1998` | `santalucia2004`), `selfComp` (`auto` | `yes` | `no`), `tMin`/`tMax` (the
curve's range), `mismatches` (0–5 for PCR).

- **Wallace** (Wallace et al. 1979): 2(A+T) + 4(G+C), for 14–20-mers. **Marmur–Doty** (1962): 64.9 + 41(G+C − 16.4)/N. **Salt-adjusted**
  (Howley et al. 1979): 81.5 + 16.6 log₁₀[Mon⁺] + 0.41 %GC − 600/N.
- **Nearest neighbour** (SantaLucia 1998, PNAS 95:1460, the "unified" table = Biopython `DNA_NN3`; or SantaLucia & Hicks 2004 =
  `DNA_NN4`): ΔH° and ΔS° = the stacks + an initiation term for each terminal pair (+ the symmetry term −1.4 e.u. for a
  self-complementary duplex). Tm = 1000ΔH°/(ΔS° + R ln k) − 273.15, R = 1.987 cal/(K·mol), k = (c1 − c2/2)·10⁻⁹ (k = c1 for a
  self-complementary oligo; c1 = c2 gives C_T/4). `dG37` = ΔH° − 310.15·ΔS°.
- **Salt corrections** (as Biopython `salt_correction`). The monovalent equivalent is [Mon⁺] = Na⁺ + K⁺ + Tris/2, plus
  120·√(Mg²⁺ − dNTP) for the first three (von Ahsen et al. 2001). `schildkraut`: + 16.6 log₁₀[Mon⁺] (Schildkraut & Lifson 1965).
  `santalucia`: ΔS° + 0.368 (N − 1) ln[Mon⁺]. `owczarzy2004` (Biochemistry 43:3537): 1/Tm + (4.29 f_GC − 3.95)·10⁻⁵ ln[Na⁺] +
  9.40·10⁻⁶ ln²[Na⁺]. `owczarzy2008` (Biochemistry 47:5336): Mg²⁺ with the free Mg after dNTP binding (Ka = 3·10⁴ M⁻¹),
  R = √[Mg]/[Mon]. When R < 0.22 the 2004 correction is used, when 0.22 ≤ R < 6 a, d, g depend on [Mon] (eq. 18), and when R ≥ 6 the
  constants are a = 3.92e−5, b = −9.11e−6, c = 6.26e−5, d = 1.42e−5, e = −4.82e−4, f = 5.25e−4, g = 8.31e−5.
- The **melting curve** (`T`, `theta`, 201 points): the fraction of the limiting strand in duplex in a two-state model (exact for
  self-complementary and mixed strands), ½ at the Tm above.
- **Primer checks** (oligos ≤ 60 nt, no ambiguous base): `gcClamp` (G/C among the last 5), `maxRun`, `maxDinuc`, `selfAny`/`self3` (the
  longest run of complementary pairs of the oligo with itself, anywhere / pairing its 3′ base), `selfDG`/`self3DG`, `hairpin`
  (the longest stem with a loop ≥ 3) and `hairpinDG`, `pairAny`/`pair3`/`pairDG` with `seq2`, `tm2`, `dTm`. The ΔG°37 values are
  **estimates**: ungapped perfect stems, SantaLucia 1998 stacks at 1 M Na⁺, and the hairpin loop terms of SantaLucia & Hicks 2004
  Table 4 (3–30 nt, Jacobson–Stockmayer beyond). Primer3's thermodynamic alignment, with mismatches and dangling ends, is not
  reproduced. The rules (`issue` *(issue)* 1 = broken, `nIssues`) follow Dieffenbach et al. 1993 and the Primer3 defaults
  (Untergasser et al. 2012): `length` 18–30, `gc` 40–60 %, `tm` 52–65 °C, `clamp` 1–3, `run` ≤ 4, `dinuc` ≤ 4, `self3` < 4,
  `selfAny` < 8, `hairpin` < 4, `pairTm` ΔTm ≤ 5 °C, `pair3` < 4. Each broken rule is also the code `primer-<rule>`.
- **In-silico PCR** on `template`: every binding site of each primer on either strand, with IUPAC-degenerate primers, ≤ `mismatches`
  mismatches, and the 3′ base always paired. A product is a top-strand site followed by a bottom-strand site (≤ 20 000 bp). The
  product shown is seq → seq2 if there is one, else the shortest. Outputs: `product`, `fwdPos`, `revPos`, `fwdMism`, `revMism`,
  `nProducts`, `productTm` (long DNA: 81.5 + 16.6 log₁₀[Mon⁺] + 0.41 %GC − 675/N). Scenes: `duplex`, `pcr`.

Codes: `ambiguous` (no Tm: NaN), `salt-range` (a negative ion or no monovalent ion, where ln 0 has no value), `conc-range`
(c1 − c2/2 ≤ 0), `long-oligo` (> 60 nt: NN is less accurate, so compare the salt-adjusted value), `below-zero` (not a stable duplex),
`range`, `mismatch-range`, `primer-not-found`, `no-product`, `several-products`, `primers-swapped`, `single-primer-product`, `primer-*`.

## 7. `align` — pairwise alignment

Model: `a`, `b`, `type` (`global` | `local` | `semiglobal`), `alphabet` (`auto` | `dna` | `protein`), `matrix` (`BLOSUM62` |
`BLOSUM50` | `PAM250` | `none`; proteins default to BLOSUM62), `match`/`mismatch` (+1/−1), `gap` or `open`/`extend` (proteins −12/−1,
DNA −2), `band` (numx, the half-width), `shuffles` (numx).

- One three-state recursion covers every case (Gotoh 1982; Durbin et al. 1998 §2.4). M ends in a pair, X in a letter of a against a
  gap, Y in a letter of b against a gap, and X ↔ Y transitions are allowed. Global = Needleman & Wunsch (1970). Local = Smith &
  Waterman (1981): M starts afresh at 0, and the end is the best pair cell. Semi-global: end gaps are free. A linear gap is
  open = extend.
- **Traceback** follows the states (the correct affine traceback, Flouri et al. 2015). Ties are broken in a fixed order: a pair,
  then a gap in b, then a gap in a. Different tools pick different co-optimal alignments, so the tests assert scores and counts.
  `nCoOptimal` counts every optimal path (doubles, capped at 1e300).
- **Band**: row i keeps the columns within `band` of j = i·n/m. Cells outside it are −∞. This is an approximation, and the code
  `banded` says it was used. Too narrow a band misses the optimum (tested).
- Matrices: NCBI's BLOSUM62 (Henikoff & Henikoff 1992; the distributed matrix, see Styczynski et al. 2008), BLOSUM50, PAM250 (Dayhoff
  et al. 1978). U is scored as C, O as K and J as X.
- Statistics: `identity` = identical columns / alignment columns, gaps included (EMBOSS); `identityShort` = / the shorter sequence;
  `similarity` = columns with a positive score; `gaps`, `gapOpens`, `alnLength`, `startA`…`endB`. Karlin–Altschul `bits` =
  (λS − ln K)/ln 2 and `evalue` = K·m·n·e^(−λS) only for local BLOSUM62 with gaps 11/1 (λ = 0.267, K = 0.041, NCBI BLAST; no edge
  correction). Otherwise they are NaN. `shuffles`: b shuffled with the seeded mulberry32, giving `zScore`, `pShuffle` = (1 + #≥S)/(1
  + n) and `shuffleScores`.
- Scenes: `alignment` (≤ 600 columns, identities and positive pairs marked), `dp` (the matrix with the path, when (m + 1)(n + 1) ≤ 400).

Codes: `gap-range` (a positive gap score), `extend-above-open`, `band-range`, `budget` (> 250 000 cells, for example a band widened by a
slider), `banded`, `no-local-similarity` (score 0, an empty alignment).

## 8. `dotplot`

Model: `a`, `b`, `window` (w), `stringency` (k ≤ w), `revcomp`. A dot is placed at (i, j) when ≥ k of the w letters match (Gibbs &
McIntyre 1970; Maizel & Lenk 1981), using one sliding count per diagonal, O(m·n). Outputs: `nHits`, `nHitsRev` (dots of the reverse
complement of b: inversions and palindromes), `longestDiag`, `cells`, scene `dots`. More than 900 dots per strand are pooled into a
30 × 30 grid, and the size of a dot grows with log₁₀ of its count (`dots-pooled`). Codes: `window-range`.

## 9. `digest` — restriction enzymes, gels, maps

Model: `seq`, `enzymes` (1–10 names), `custom` ([{name, site (IUPAC), cut, cut2?}]: the top-strand and bottom-strand cuts counted from
the site's first base; cut2 defaults to the palindromic one), `circular`, `dam`, `dcm` (E. coli methylation), `ladder` (`1kb` |
`100bp` | `lambda` (λ–HindIII: 23130 … 125) | `none`), `agarose` (numx %, 0.3–2), `features` ([{start, end, key, strand}] drawn on the map).

- The built-in enzymes are a REBASE subset (Roberts et al. 2023, NAR 51:D629): EcoRI, BamHI, HindIII, XhoI, SalI, XbaI, SpeI, NheI,
  NcoI, NdeI, BglII, MluI, XmaI, AvaI, ClaI, AgeI, AflII, MfeI, BsrGI, EagI, BclI, BstEII, TaqI, MspI, HpaII, HinfI, Sau3AI, MboI,
  DpnI, DdeI, Bsu36I, EcoRII, SmaI, EcoRV, HaeIII, AluI, PvuII, ScaI, HpaI, DraI, StuI, NruI, NaeI, SnaBI, PmeI, SwaI, XmnI, PstI,
  KpnI, SacI, SphI, ApaI, NsiI, AatII, SacII, PacI, NotI, AscI, SfiI, BstXI and the Type IIS BsaI, BsmBI, BbsI, SapI, BsmAI, PaqCI,
  FokI (they cut outside their site, as in Golden Gate assembly). Both strands are searched; a palindromic site is searched once,
  overlapping sites all count, and a circle wraps.
- An IUPAC letter in a site matches any of its bases. A sequence with ambiguous letters gives the code `ambiguous`: its N cannot
  match, so possible sites are not listed.
- Methylation: Dam methylates the A of GATC on both strands, and Dcm the inner C of CCWGG. A sensitive enzyme (MboI, BclI, XbaI, ClaI;
  EcoRII, ApaI, StuI, BsaI) is blocked when a methylated base lies inside its site. DpnI cuts only methylated sites. Methylation is
  a simplification of REBASE's overlap rules: hemimethylation and CpG methylation are not modelled.
- Fragments are cut at the top-strand cuts: linear (both ends) or circular (an uncut circle stays one molecule, `uncut-circle`).
  `overhang` *(int: an enzyme)* = c2 − c1 (> 0 a 5′ overhang, < 0 a 3′ overhang, 0 blunt).
- **Gel**: the migration is log-linear in size inside the resolving range of the agarose (Helling, Goodman & Boyer 1974). The
  range: 0.3 % 5–60 kb, 0.6 % 1–20 kb, 0.7 % 0.8–10 kb, 0.9 % 0.5–7 kb, 1.2 % 0.4–6 kb, 1.5 % 0.2–3 kb, 2 % 0.1–2 kb (Sambrook & Russell
  2001, Table 5-1), interpolated in log size. Sizes outside the range are pressed against its ends (`gel-range`, `outOfRange`), and
  bands closer than 1 % of the gel merge (`bands`). `migration` *(int)* is 0 at the well and 1 at the dye front. Supercoiled DNA
  runs differently: an uncut circle is drawn `warn` and gives no real size.
- Outputs: `length`, `nSites`, `nBlocked`, `nFragments`, `bands`, `outOfRange`, `sitePos`/`cutPos`/`siteEnzyme`/`fragment`/
  `fragmentSorted`/`migration`/`overhang`/`nSitesOf` *(int)*, series `fragments`, `fragmentsSorted`, scenes `gel` and `map` (linear
  or a plasmid circle with the features). Codes: `cut-outside` (a Type IIS cut beyond a linear end), `uncut`, `uncut-circle`,
  `methylation-blocked`, `agarose-range`, `gel-range`, `ambiguous`.

## 10. `protein`

Model: `seq`, `ph` (7), `window` (9), `wheel` (18 residues), `pk` (`bjellqvist` | `emboss` | `lehninger` | `solomon` | `sillero`).

- Mass: Σ free amino acids − (n − 1)·water (average 18.01528, monoisotopic 18.010565; IUPAC atomic weights, as Biopython). B and Z
  take the mean of their pair. X gives NaN (`ambiguous`). Disulfides are not subtracted.
- pI: bisection on [0, 14] (60 steps) of the net charge (Henderson–Hasselbalch). The pK set is stated. Bjellqvist et al. 1993
  (ExPASy, Biopython) has terminal pKs that depend on the terminal residue; the other four sets are from Kozlowski 2016, Table 1.
  Unlike Biopython, whose search starts at pH 4.05, very acidic peptides get their true pI.
- `eps280` = 5500 W + 1490 Y (reduced) and `eps280ox` + 125 per cystine (Pace et al. 1995); `abs01`/`abs01ox` = A280 of 1 g/L.
- `gravy` and the `hydropathy` window (Kyte & Doolittle 1982; a window of 19 above 1.6 suggests a transmembrane helix). `aliphatic` =
  X_A + 2.9 X_V + 3.9 (X_I + X_L) (Ikai 1980). `instability` (Guruprasad et al. 1990: > 40 unstable). `aromaticity` (F + W + Y,
  Lobry & Gautier 1994). `muH`, the hydrophobic moment at 100° per residue, uses the Eisenberg consensus scale (Eisenberg et al.
  1984). `aaCount`, `aaFrac` *(aa)*. Series `phGrid`/`chargeCurve`, `hydroX`/`hydropathy`; scene `wheel`. Codes: `ambiguous`,
  `window-range`, `empty`.

## 11. `crispr` — guides and PAMs

Model: `seq`, `nuclease` (`SpCas9` NGG, 20 nt, a blunt cut 3 bp from the PAM, Jinek et al. 2012, Cong et al. 2013; `SpCas9NG` NG,
Nishimasu et al. 2018; `SaCas9` NNGRRT, 21 nt, Ran et al. 2015; `Cas12a` TTTV 5′ of a 23-nt protospacer, staggered cuts 18 and 23 nt
after the PAM, Zetsche et al. 2015), `guideLen`, `seedLen` (12, Cas12a 8), `target` (a base, default the middle), `gcMin`/`gcMax`
(0.4–0.8). Both strands are searched. A guide is **good** when its GC is in range, it has no TTTT (a Pol III terminator for U6
expression) and its PAM-proximal seed occurs at no other PAM of the sequence. Outputs: `nGuides`, `nPlus`, `nMinus`, `nGood`,
`nearestCut`, `nearestDist` (the bases between the cut and the target), `nearestStrand`, `nearestGc`, `nearestPolyT`,
`nearestSeedHits`, `guideCut`/`guideStrand`/`guideGc`/`guideSeedHits` *(int)*, series `cuts`, scene `guides` (the guide nearest the
target shown with its PAM). Activity scores (Doench 2016) and genome-wide off-targets are out of scope. Codes: `guide-range`,
`guides-many`, `no-pam`, `target-range`, `ambiguous`.

## 12. Validity, limits and what is left out

- The NN Tm assumes perfect duplexes. Mismatches, dangling ends and RNA/RNA or DNA/RNA tables (Xia 1998, Sugimoto 1995) are not
  included. Over 60 nt the NN accuracy falls (`long-oligo`).
- The primer ΔG values are ungapped estimates (above). Secondary structure prediction (Zuker) is left out.
- Alignment covers pairs only. Multiple alignment is out of scope, and Karlin–Altschul E-values exist only for BLOSUM62 11/1.
- Splicing is given, not predicted (MaxEntScan and SpliceAI are out of scope). HGVS covers CDS variants only.
- Selenocysteine (UGA) and pyrrolysine (UAG) recoding needs a SECIS element or a context. It is never applied automatically, and a
  model cannot mark it yet.
- Genome codon-usage tables are not shipped: the author gives `refUsage` (Kazusa, or CoCoPUTs, Alexaki et al. 2019).

## 13. Reference values (asserted in `tests/lib_seq.js`)

| # | case | expected | source |
|---|---|---|---|
| S1 | reverse complement ATGRNYTTAA | TTAARNYCAT | IUPAC; Biopython |
| S2 | translate ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG | MAIVMGR*KGAR* (to stop MAIVMGR*) | Biopython Tutorial §3 |
| S3 | ATAAGATGA tables 1 / 2 | IR* / M*W | NCBI |
| S4 | GTGAAATAA table 11 as a CDS / not | MK* / VK* | NCBI |
| S5 | GC of ATGCSWNN remove / ignore / weighted | 0.5 / 0.375 / 0.5 | Biopython `gc_fraction` |
| S6 | AGCGGATAACAATTTCACACAGGA Wallace; Marmur–Doty | 68 °C; 53.97 °C | Wallace 1979; Marmur & Doty 1962 |
| S7 | same, NN, 1 M Na⁺, 250 nM each | ΔH −184.4, ΔS −500.7, Tm 73.28 °C | SantaLucia 1998 = Biopython |
| S8 | same, 50 mM Na⁺ (SantaLucia correction) | 57.53 °C | Biopython |
| — | same, Owczarzy 2004 50 mM / 2008 with 1.5 mM Mg²⁺ + 0.6 mM dNTP / 10 mM Mg²⁺ / 3 mM Mg²⁺; Schildkraut; Na-equivalents; NN 2004 | 53.592 / 60.025 / 63.746 / 62.180; 48.733; 61.994; 54.746 °C (±0.005) | Biopython 1.88 Tm_NN |
| S9 | CGCGAATTCGCG, 1 M, 250 nM, self-complementary | ΔH −101.2, ΔS −273.8, Tm 59.73 °C | Biopython |
| S10 | NW GATTACA / GCATGCU, +1/−1/−1 | 0, 3 co-optimal | Biopython |
| S11 | SW TGTTACGG / GGTTGACTA, +3/−3/−2 | 13, GTT-AC / GTTGAC | Wikipedia (Smith–Waterman) |
| S12 | HEAGAWGHEE / PAWHEAE, BLOSUM50, −8 | global 1, local 28 (AWGHE / AW-HE) | Durbin et al. 1998 §2.3 |
| S13 | same, BLOSUM62, 11/1, local | 17 | Biopython PairwiseAligner |
| S14 | AAAGGG / AAAAGGG, +1/−1, open −3 extend −1 | 3, 4 co-optimal | exact |
| S15 | human ubiquitin | 8564.74 Da, pI 6.56, GRAVY −0.489, instability 36.06 | ExPASy ProtParam; Biopython |
| S16 | ACDEFGHIKLMNPQRSTVWY | 2395.71 / 2394.1249 Da, pI 6.78 | Biopython |
| — | hen egg-white lysozyme (P00698 mature) | 14313.0 Da, pI 9.32, ε280 37470 / 37970 | ExPASy ProtParam |
| S18 | ssDNA ATGC | 1253.80 (5′-P) / 1173.84 (5′-OH) Da | Biopython / OligoCalc |
| S19 | EcoRI on GGAATTCCGAATTCA | sites 2, 9; fragments 2, 7, 6; 5′ AATT | REBASE |
| S20 | ORFs ≥ 12 nt in CCATGAAATTTTAGCC | one, +3, nt 3–14, MKF | definition |
| S21 | CDS ATGGGTTGGTAA: c.5G>T, c.6T>C, c.9G>A, c.4delG | p.(Gly2Val), p.(Gly2=), p.(Trp3*), c.5del p.(Gly2Valfs*?) | HGVS 2016 |
| — | ENC of one codon per amino acid / all codons equally | 20 / 61 | Wright 1990 |
| — | HBB c.20A>T | p.(Glu7Val), BLOSUM62 −2, a Bsu36I site lost (2 → 1) | HbS (Ingram 1957); MstII diagnosis (Chang & Kan 1982) |

The insulin-A pI of the research file (4.05) is not used: 4.05 is the floor of Biopython's pI search, not a measured value.

## 14. The reference activity `sickle-codon`

The human β-globin coding sequence (HBB, 444 nt, which translates to UniProt P68871). Controls: a position (c.1–60) and a new base
(A, C, G, T). Readouts: the first residue changed, missense / silent / nonsense, BLOSUM62, transition, the Bsu36I sites left. Scenes:
the HGVS names and the two proteins around the change. The graded exercise (a `sim` exercise, here `ch01-e930`) asks for the single
substitution that turns Glu7 into Val. Its `grade.checks` are `effect == 1` (label: a missense change), `aaPos == 7` (codon 7) and
`altAa == 17` (valine). Only c.20A>T passes. The near misses in `tests.json` are c.19G>A (Glu7Lys, haemoglobin C), c.20A>C (Glu7Ala),
c.21G>A (silent), c.19G>T (a stop) and c.2T>G (start lost).

## Uses the kernel

Since 2026-11-07 the shuffle null draws from a kernel stream (`C.rng(seed, 'seq-shuffle')` = `SK.stream`) and the isoelectric point is Brent's root (`SK.brent`) of the net charge (bisection only as a fallback); the Worker source carries the kernel. Snapshot re-recorded for the shuffle.
