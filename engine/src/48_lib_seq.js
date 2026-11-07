/* ===================== interactive activities — seq@1, the engine library's DNA, RNA and protein sequence engine (docs/library/seq.md) =====================
   A GENERAL engine of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md §1) for molecular sequences, from base pairing to research tools. One model = one `mode`:
     translate   composition (GC by three conventions, GC skew in windows), reverse complement, molecular weight, translation in any of
                 the six frames with every NCBI genetic code (1–6, 9–16, 21–33: ambiguous codons resolved when unanimous, alternative
                 starts read as M at a CDS start, the context-dependent stops of tables 27, 28, 31, incomplete mitochondrial stops), CDS
                 validation, ORFs in six frames (NCBI ORFfinder conventions), splicing of given exons with GT–AG / GC–AG / AT–AC checks,
                 codon usage (RSCU, Sharp, Tuohy & Mosurski 1986), ENC (Wright 1990), CAI against a reference usage (Sharp & Li 1987).
     mutate      variants on a CDS (substitution, deletion, insertion, duplication, delins) with the HGVS 3′ rule, their effect on the
                 protein (synonymous, missense, nonsense, stop-loss, start-loss, in-frame, frameshift) and HGVS names (den Dunnen et
                 al. 2016), BLOSUM62 of a missense change, restriction sites gained or lost.
     divergence  two aligned sequences: p, Jukes–Cantor (1969), Kimura 2-parameter (1980), Ts/Tv; coding: Nei–Gojobori (1986) dN, dS, ω.
     tm          oligonucleotide melting temperature: Wallace (1979), Marmur–Doty (1962), salt-adjusted (Howley et al. 1979), nearest
                 neighbour (SantaLucia 1998; SantaLucia & Hicks 2004) with the salt corrections of Schildkraut & Lifson 1965,
                 SantaLucia 1998, Owczarzy 2004 and 2008 (Mg²⁺, dNTP); a two-state melting curve; primer checks (length, GC, Tm, GC
                 clamp, runs, self- and pair complementarity with ΔG estimates, hairpins); in-silico PCR (mismatches, both strands).
     align       pairwise alignment: Needleman–Wunsch (1970), Smith–Waterman (1981), semi-global, linear or affine gaps (Gotoh 1982) with
                 the three-state recursion, BLOSUM62/BLOSUM50/PAM250 or match/mismatch, banded DP, co-optimal counts, Karlin–Altschul
                 bits and E (BLOSUM62 11/1), a seeded shuffle test; drawings of the alignment and of a small DP matrix.
     dotplot     a windowed dot plot (Gibbs & McIntyre 1970; Maizel & Lenk 1981) with the reverse-complement strand.
     digest      restriction digests: a REBASE subset of 67 enzymes (Type II and IIS) or the model's own, both strands, linear or
                 circular, Dam/Dcm methylation, fragments, overhangs; a gel (log-linear migration, agarose range) and a map.
     protein     average and monoisotopic mass, pI and charge (Bjellqvist, EMBOSS, Lehninger, Solomon or Sillero pK sets), GRAVY and
                 hydropathy (Kyte & Doolittle 1982), ε280 (Pace et al. 1995), aliphatic index (Ikai 1980), instability index
                 (Guruprasad et al. 1990), aromaticity (Lobry & Gautier 1994), a helical wheel with the hydrophobic moment (Eisenberg 1984).
     crispr      CRISPR guides: PAM search on both strands for SpCas9 (NGG), SpCas9-NG (NG), SaCas9 (NNGRRT) and Cas12a (TTTV), cut
                 sites, guide GC, U6 poly-T, seed uniqueness, the guide nearest a target.
   Pure JS, no DOM, no learner text: numbers, codes and only the model's own short texts (sequence pieces, enzyme names) as `s`.
   Python twin of checkSpec / exprs / keys: tools/lib_seq.py. Tests: node tests/lib_seq.js. */
(function noemaLibSeqModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, keys and numbers leave this module
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'seq@1';
  const BUDGET = 200000;
  const has = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const MODES = ['translate', 'mutate', 'divergence', 'tm', 'align', 'dotplot', 'digest', 'protein', 'crispr'];

  /* ---------- data ---------- */
  // NCBI genetic codes (Elzanowski & Ostell, gc.prt): the amino acids and the starts (M) of the 64 codons in TCAG order (TTT, TTC, …, GGG)
  // substitution matrices in the order ARNDCQEGHILKMFPSTWYVBZX* (24 × 24, row by row), as NCBI ftp.ncbi.nlm.nih.gov/blast/matrices/
  const MATS = {
    BLOSUM62: '4 -1 -2 -2 0 -1 -1 0 -2 -1 -1 -1 -1 -2 -1 1 0 -3 -2 0 -2 -1 0 -4 -1 5 0 -2 -3 1 0 -2 0 -3 -2 2 -1 -3 -2 -1 -1 -3 -2 -3 -1 0 -1 -4 -2 0 6 1 -3 0 0 0 1 -3 -3 0 -2 -3 -2 1 0 -4 -2 -3 3 0 -1 -4 -2 -2 1 6 -3 0 2 -1 -1 -3 -4 -1 -3 -3 -1 0 -1 -4 -3 -3 4 1 -1 -4 0 -3 -3 -3 9 -3 -4 -3 -3 -1 -1 -3 -1 -2 -3 -1 -1 -2 -2 -1 -3 -3 -2 -4 -1 1 0 0 -3 5 2 -2 0 -3 -2 1 0 -3 -1 0 -1 -2 -1 -2 0 3 -1 -4 -1 0 0 2 -4 2 5 -2 0 -3 -3 1 -2 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4 0 -2 0 -1 -3 -2 -2 6 -2 -4 -4 -2 -3 -3 -2 0 -2 -2 -3 -3 -1 -2 -1 -4 -2 0 1 -1 -3 0 0 -2 8 -3 -3 -1 -2 -1 -2 -1 -2 -2 2 -3 0 0 -1 -4 -1 -3 -3 -3 -1 -3 -3 -4 -3 4 2 -3 1 0 -3 -2 -1 -3 -1 3 -3 -3 -1 -4 -1 -2 -3 -4 -1 -2 -3 -4 -3 2 4 -2 2 0 -3 -2 -1 -2 -1 1 -4 -3 -1 -4 -1 2 0 -1 -3 1 1 -2 -1 -3 -2 5 -1 -3 -1 0 -1 -3 -2 -2 0 1 -1 -4 -1 -1 -2 -3 -1 0 -2 -3 -2 1 2 -1 5 0 -2 -1 -1 -1 -1 1 -3 -1 -1 -4 -2 -3 -3 -3 -2 -3 -3 -3 -1 0 0 -3 0 6 -4 -2 -2 1 3 -1 -3 -3 -1 -4 -1 -2 -2 -1 -3 -1 -1 -2 -2 -3 -3 -1 -2 -4 7 -1 -1 -4 -3 -2 -2 -1 -2 -4 1 -1 1 0 -1 0 0 0 -1 -2 -2 0 -1 -2 -1 4 1 -3 -2 -2 0 0 0 -4 0 -1 0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1 1 5 -2 -2 0 -1 -1 0 -4 -3 -3 -4 -4 -2 -2 -3 -2 -2 -3 -2 -3 -1 1 -4 -3 -2 11 2 -3 -4 -3 -2 -4 -2 -2 -2 -3 -2 -1 -2 -3 2 -1 -1 -2 -1 3 -3 -2 -2 2 7 -1 -3 -2 -1 -4 0 -3 -3 -3 -1 -2 -2 -3 -3 3 1 -2 1 -1 -2 -2 0 -3 -1 4 -3 -2 -1 -4 -2 -1 3 4 -3 0 1 -1 0 -3 -4 0 -3 -3 -2 0 -1 -4 -3 -3 4 1 -1 -4 -1 0 0 1 -3 3 4 -2 0 -3 -3 1 -1 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4 0 -1 -1 -1 -2 -1 -1 -1 -1 -1 -1 -1 -1 -1 -2 0 0 -2 -1 -1 -1 -1 -1 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 1',
    PAM250: '2 -2 0 0 -2 0 0 1 -1 -1 -2 -1 -1 -3 1 1 1 -6 -3 0 0 0 0 -8 -2 6 0 -1 -4 1 -1 -3 2 -2 -3 3 0 -4 0 0 -1 2 -4 -2 -1 0 -1 -8 0 0 2 2 -4 1 1 0 2 -2 -3 1 -2 -3 0 1 0 -4 -2 -2 2 1 0 -8 0 -1 2 4 -5 2 3 1 1 -2 -4 0 -3 -6 -1 0 0 -7 -4 -2 3 3 -1 -8 -2 -4 -4 -5 12 -5 -5 -3 -3 -2 -6 -5 -5 -4 -3 0 -2 -8 0 -2 -4 -5 -3 -8 0 1 1 2 -5 4 2 -1 3 -2 -2 1 -1 -5 0 -1 -1 -5 -4 -2 1 3 -1 -8 0 -1 1 3 -5 2 4 0 1 -2 -3 0 -2 -5 -1 0 0 -7 -4 -2 3 3 -1 -8 1 -3 0 1 -3 -1 0 5 -2 -3 -4 -2 -3 -5 0 1 0 -7 -5 -1 0 0 -1 -8 -1 2 2 1 -3 3 1 -2 6 -2 -2 0 -2 -2 0 -1 -1 -3 0 -2 1 2 -1 -8 -1 -2 -2 -2 -2 -2 -2 -3 -2 5 2 -2 2 1 -2 -1 0 -5 -1 4 -2 -2 -1 -8 -2 -3 -3 -4 -6 -2 -3 -4 -2 2 6 -3 4 2 -3 -3 -2 -2 -1 2 -3 -3 -1 -8 -1 3 1 0 -5 1 0 -2 0 -2 -3 5 0 -5 -1 0 0 -3 -4 -2 1 0 -1 -8 -1 0 -2 -3 -5 -1 -2 -3 -2 2 4 0 6 0 -2 -2 -1 -4 -2 2 -2 -2 -1 -8 -3 -4 -3 -6 -4 -5 -5 -5 -2 1 2 -5 0 9 -5 -3 -3 0 7 -1 -4 -5 -2 -8 1 0 0 -1 -3 0 -1 0 0 -2 -3 -1 -2 -5 6 1 0 -6 -5 -1 -1 0 -1 -8 1 0 1 0 0 -1 0 1 -1 -1 -3 0 -2 -3 1 2 1 -2 -3 -1 0 0 0 -8 1 -1 0 0 -2 -1 0 0 -1 0 -2 0 -1 -3 0 1 3 -5 -3 0 0 -1 0 -8 -6 2 -4 -7 -8 -5 -7 -7 -3 -5 -2 -3 -4 0 -6 -2 -5 17 0 -6 -5 -6 -4 -8 -3 -4 -2 -4 0 -4 -4 -5 0 -1 -1 -4 -2 7 -5 -3 -3 0 10 -2 -3 -4 -2 -8 0 -2 -2 -2 -2 -2 -2 -1 -2 4 2 -2 2 -1 -1 -1 0 -6 -2 4 -2 -2 -1 -8 0 -1 2 3 -4 1 3 0 1 -2 -3 1 -2 -4 -1 0 0 -5 -3 -2 3 2 -1 -8 0 0 1 3 -5 3 3 0 2 -2 -3 0 -2 -5 0 0 -1 -6 -4 -2 2 3 -1 -8 0 -1 0 -1 -3 -1 -1 -1 -1 -1 -1 -1 -1 -2 -1 0 0 -4 -2 -1 -1 -1 -1 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 1',
    BLOSUM50: '5 -2 -1 -2 -1 -1 -1 0 -2 -1 -2 -1 -1 -3 -1 1 0 -3 -2 0 -2 -1 -1 -5 -2 7 -1 -2 -4 1 0 -3 0 -4 -3 3 -2 -3 -3 -1 -1 -3 -1 -3 -1 0 -1 -5 -1 -1 7 2 -2 0 0 0 1 -3 -4 0 -2 -4 -2 1 0 -4 -2 -3 4 0 -1 -5 -2 -2 2 8 -4 0 2 -1 -1 -4 -4 -1 -4 -5 -1 0 -1 -5 -3 -4 5 1 -1 -5 -1 -4 -2 -4 13 -3 -3 -3 -3 -2 -2 -3 -2 -2 -4 -1 -1 -5 -3 -1 -3 -3 -2 -5 -1 1 0 0 -3 7 2 -2 1 -3 -2 2 0 -4 -1 0 -1 -1 -1 -3 0 4 -1 -5 -1 0 0 2 -3 2 6 -3 0 -4 -3 1 -2 -3 -1 -1 -1 -3 -2 -3 1 5 -1 -5 0 -3 0 -1 -3 -2 -3 8 -2 -4 -4 -2 -3 -4 -2 0 -2 -3 -3 -4 -1 -2 -2 -5 -2 0 1 -1 -3 1 0 -2 10 -4 -3 0 -1 -1 -2 -1 -2 -3 2 -4 0 0 -1 -5 -1 -4 -3 -4 -2 -3 -4 -4 -4 5 2 -3 2 0 -3 -3 -1 -3 -1 4 -4 -3 -1 -5 -2 -3 -4 -4 -2 -2 -3 -4 -3 2 5 -3 3 1 -4 -3 -1 -2 -1 1 -4 -3 -1 -5 -1 3 0 -1 -3 2 1 -2 0 -3 -3 6 -2 -4 -1 0 -1 -3 -2 -3 0 1 -1 -5 -1 -2 -2 -4 -2 0 -2 -3 -1 2 3 -2 7 0 -3 -2 -1 -1 0 1 -3 -1 -1 -5 -3 -3 -4 -5 -2 -4 -3 -4 -1 0 1 -4 0 8 -4 -3 -2 1 4 -1 -4 -4 -2 -5 -1 -3 -2 -1 -4 -1 -1 -2 -2 -3 -4 -1 -3 -4 10 -1 -1 -4 -3 -3 -2 -1 -2 -5 1 -1 1 0 -1 0 -1 0 -1 -3 -3 0 -2 -3 -1 5 2 -4 -2 -2 0 0 -1 -5 0 -1 0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1 2 5 -3 -2 0 0 -1 0 -5 -3 -3 -4 -5 -5 -1 -3 -3 -3 -3 -2 -3 -1 1 -4 -4 -3 15 2 -3 -5 -2 -3 -5 -2 -1 -2 -3 -3 -1 -2 -3 2 -1 -1 -2 0 4 -3 -2 -2 2 8 -1 -3 -2 -1 -5 0 -3 -3 -4 -1 -3 -3 -4 -4 4 1 -3 1 -1 -3 -2 0 -3 -1 5 -4 -3 -1 -5 -2 -1 4 5 -3 0 1 -1 0 -4 -4 0 -3 -4 -2 0 0 -5 -3 -4 5 2 -1 -5 -1 0 0 1 -3 4 5 -2 0 -3 -3 1 -1 -4 -1 0 -1 -2 -2 -3 2 5 -1 -5 -1 -1 -1 -1 -2 -1 -1 -2 -1 -1 -1 -1 -1 -2 -2 -1 0 -3 -1 -1 -1 -1 -1 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 -5 1',
  };
  // Guruprasad, Reddy & Pandit (1990) dipeptide instability weights DIWV[x][y], x, y in ACDEFGHIKLMNPQRSTVWY (as Biopython ProtParamData)
  const DIWV_S = '1.0 44.94 -7.49 1.0 1.0 1.0 -7.49 1.0 1.0 1.0 1.0 1.0 20.26 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 20.26 1.0 1.0 1.0 33.6 1.0 1.0 20.26 33.6 1.0 20.26 -6.54 1.0 1.0 33.6 -6.54 24.68 1.0 1.0 1.0 1.0 1.0 -6.54 1.0 1.0 1.0 -7.49 1.0 1.0 1.0 1.0 1.0 -6.54 20.26 -14.03 1.0 1.0 1.0 1.0 44.94 20.26 33.6 1.0 1.0 -6.54 20.26 1.0 1.0 1.0 1.0 20.26 20.26 1.0 20.26 1.0 1.0 -14.03 1.0 1.0 1.0 13.34 1.0 1.0 1.0 1.0 1.0 -14.03 1.0 1.0 1.0 20.26 1.0 1.0 1.0 1.0 1.0 1.0 33.601 -7.49 1.0 1.0 -6.54 1.0 13.34 1.0 -7.49 -7.49 1.0 1.0 -7.49 1.0 1.0 1.0 1.0 -7.49 1.0 13.34 -7.49 1.0 1.0 1.0 1.0 -9.37 -9.37 1.0 44.94 24.68 1.0 1.0 24.68 -1.88 1.0 1.0 1.0 -6.54 1.0 -1.88 44.94 1.0 1.0 1.0 44.94 1.0 1.0 13.34 1.0 -7.49 20.26 1.0 1.0 -1.88 1.0 1.0 1.0 1.0 -7.49 1.0 1.0 1.0 1.0 1.0 1.0 1.0 -7.49 1.0 -7.49 1.0 -7.49 33.6 1.0 -6.54 24.64 33.6 1.0 1.0 -7.49 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 -7.49 1.0 1.0 1.0 20.26 33.6 20.26 1.0 1.0 1.0 24.68 1.0 13.34 1.0 1.0 1.0 1.0 1.0 58.28 1.0 1.0 1.0 -1.88 1.0 44.94 -6.54 -6.54 44.94 -1.88 1.0 1.0 24.68 1.0 -1.88 1.0 1.0 -14.03 -14.03 1.0 44.94 24.68 1.0 1.0 1.0 -1.88 -6.54 1.0 1.0 -7.49 1.0 -9.37 1.0 20.26 -6.54 -6.54 18.38 20.26 1.0 1.0 1.0 1.0 1.0 -6.54 1.0 20.26 20.26 -6.54 20.26 1.0 20.26 -1.88 1.0 1.0 -6.54 20.26 20.26 -6.54 1.0 1.0 1.0 1.0 1.0 1.0 1.0 20.26 20.26 1.0 44.94 1.0 -6.54 1.0 -6.54 1.0 1.0 1.0 1.0 1.0 -7.49 20.26 1.0 1.0 1.0 1.0 13.34 20.26 20.26 58.28 44.94 1.0 1.0 58.28 -6.54 1.0 33.6 1.0 20.26 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 44.94 20.26 20.26 20.26 1.0 1.0 1.0 1.0 1.0 1.0 1.0 20.26 13.34 -7.49 1.0 1.0 1.0 1.0 1.0 -14.03 1.0 -6.54 1.0 1.0 1.0 1.0 -14.03 1.0 1.0 1.0 -14.03 1.0 1.0 -7.49 1.0 1.0 -1.88 1.0 1.0 1.0 20.26 1.0 1.0 1.0 -7.49 1.0 1.0 -6.54 -14.03 1.0 1.0 1.0 1.0 -9.37 24.68 1.0 1.0 13.34 24.68 13.34 1.0 1.0 1.0 1.0 -14.03 -7.49 1.0 1.0 24.68 1.0 24.68 -6.54 1.0 -7.49 13.34 1.0 1.0 1.0 44.94 1.0 13.34 1.0 -15.91 1.0 -7.49 1.0 -9.37 13.34';
  const NCBI = {
    1: ['FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '---M---------------M---------------M----------------------------'],
    2: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG', '--------------------------------MMMM---------------M------------'],
    3: ['FFLLSSSSYY**CCWWTTTTPPPPHHQQRRRRIIMMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '----------------------------------MM---------------M------------'],
    4: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '--MM---------------M------------MMMM---------------M------------'],
    5: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG', '---M----------------------------MMMM---------------M------------'],
    6: ['FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    9: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG', '-----------------------------------M---------------M------------'],
    10: ['FFLLSSSSYY**CCCWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    11: ['FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '---M---------------M------------MMMM---------------M------------'],
    12: ['FFLLSSSSYY**CC*WLLLSPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-------------------M---------------M----------------------------'],
    13: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSGGVVVVAAAADDEEGGGG', '---M------------------------------MM---------------M------------'],
    14: ['FFLLSSSSYYY*CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    15: ['FFLLSSSSYY*QCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    16: ['FFLLSSSSYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    21: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNNKSSSSVVVVAAAADDEEGGGG', '-----------------------------------M---------------M------------'],
    22: ['FFLLSS*SYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    23: ['FF*LSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '--------------------------------M--M---------------M------------'],
    24: ['FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSSKVVVVAAAADDEEGGGG', '---M---------------M---------------M---------------M------------'],
    25: ['FFLLSSSSYY**CCGWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '---M-------------------------------M---------------M------------'],
    26: ['FFLLSSSSYY**CC*WLLLAPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-------------------M---------------M----------------------------'],
    27: ['FFLLSSSSYYQQCCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    28: ['FFLLSSSSYYQQCCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    29: ['FFLLSSSSYYYYCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    30: ['FFLLSSSSYYEECC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    31: ['FFLLSSSSYYEECCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '-----------------------------------M----------------------------'],
    32: ['FFLLSSSSYY*WCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', '---M---------------M------------MMMM---------------M------------'],
    33: ['FFLLSSSSYYY*CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSSKVVVVAAAADDEEGGGG', '---M---------------M---------------M---------------M------------'],
  };
  // context-dependent stops (Swart et al. 2016; NCBI): a sense codon inside, a stop only as the last codon
  const CTX = { 27: ['TGA'], 28: ['TAA', 'TAG', 'TGA'], 31: ['TAA', 'TAG'] };
  const MITO = [2, 3, 4, 5, 9, 13, 14, 16, 21, 22, 23, 24, 33];   // tables whose name says mitochondrial: incomplete stops (T, TA) completed by poly(A)
  const B4 = 'TCAG';
  const IUPAC = { A: 'A', C: 'C', G: 'G', T: 'T', U: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
  const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', D: 'H', H: 'D', V: 'B', N: 'N', '-': '-' };
  const NUC = 'ACGTURYSWKMBDHVN', PROT = 'ACDEFGHIKLMNPQRSTVWYUOBZJX*';
  const AA3 = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', U: 'Sec', O: 'Pyl', B: 'Asx', Z: 'Glx', J: 'Xle', X: 'Xaa', '*': '*' };
  const MAT_ORDER = 'ARNDCQEGHILKMFPSTWYVBZX*';
  const MATRIX = {};
  for (const k of Object.keys(MATS)) { const v = MATS[k].split(' ').map(Number), m = {}; for (let i = 0; i < 24; i++) { m[MAT_ORDER[i]] = {}; for (let j = 0; j < 24; j++) m[MAT_ORDER[i]][MAT_ORDER[j]] = v[i * 24 + j]; } MATRIX[k] = m; }
  const AA20 = 'ACDEFGHIKLMNPQRSTVWY';
  const DIWV = {}; { const v = DIWV_S.split(' ').map(Number); for (let i = 0; i < 20; i++) { DIWV[AA20[i]] = {}; for (let j = 0; j < 20; j++) DIWV[AA20[i]][AA20[j]] = v[i * 20 + j]; } }
  // free amino-acid masses (IUPAC atomic weights, as Biopython IUPACData), water 18.01528 / 18.010565
  const MW_AVG = { A: 89.0932, C: 121.1582, D: 133.1027, E: 147.1293, F: 165.1891, G: 75.0666, H: 155.1546, I: 131.1729, K: 146.1876, L: 131.1729, M: 149.2113, N: 132.1179, O: 255.3134, P: 115.1305, Q: 146.1445, R: 174.201, S: 105.0926, T: 119.1192, U: 168.0532, V: 117.1463, W: 204.2252, Y: 181.1885 };
  const MW_MONO = { A: 89.047678, C: 121.019749, D: 133.037508, E: 147.053158, F: 165.078979, G: 75.032028, H: 155.069477, I: 131.094629, K: 146.105528, L: 131.094629, M: 149.051049, N: 132.053492, O: 255.158292, P: 115.063329, Q: 146.069142, R: 174.111676, S: 105.042593, T: 119.058243, U: 168.964203, V: 117.078979, W: 204.089878, Y: 181.073893 };
  const PAIR = { B: 'DN', Z: 'EQ', J: 'IL' };
  const WATER = 18.01528, WATER_MONO = 18.010565;
  // nucleotide residues (monophosphates incl. water, Biopython): ssDNA MW = Σ − (n − 1)·water (5′-phosphate)
  const NT_DNA = { A: 331.2218, C: 307.1971, G: 347.2212, T: 322.2085 }, NT_RNA = { A: 347.2212, C: 323.1965, G: 363.2206, U: 324.1813 };
  const KD = { A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5, L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2 };   // Kyte & Doolittle 1982
  const EIS = { A: 0.62, R: -2.53, N: -0.78, D: -0.9, C: 0.29, Q: -0.85, E: -0.74, G: 0.48, H: -0.4, I: 1.38, L: 1.06, K: -1.5, M: 0.64, F: 1.19, P: 0.12, S: -0.18, T: -0.05, W: 0.81, Y: 0.26, V: 1.08 };   // Eisenberg 1984 consensus
  // pK values, Bjellqvist et al. 1993/1994 (ExPASy Compute pI/Mw; Biopython IsoelectricPoint)
  const PK_POS = { K: 10.0, R: 12.0, H: 5.98 }, PK_NEG = { D: 4.05, E: 4.45, C: 9.0, Y: 10.0 };
  const PK_N = { A: 7.59, M: 7.0, S: 6.93, P: 8.36, T: 6.82, V: 7.44, E: 7.7 }, PK_C = { D: 4.55, E: 4.75 };
  // SantaLucia 1998 unified (= Biopython DNA_NN3) and SantaLucia & Hicks 2004 (DNA_NN4): ΔH kcal/mol, ΔS cal/(K·mol), 1 M NaCl
  const NN_SETS = {
    santalucia1998: { init: [0, 0], initAT: [2.3, 4.1], initGC: [0.1, -2.8], sym: [0, -1.4], st: { 'AA/TT': [-7.9, -22.2], 'AT/TA': [-7.2, -20.4], 'TA/AT': [-7.2, -21.3], 'CA/GT': [-8.5, -22.7], 'GT/CA': [-8.4, -22.4], 'CT/GA': [-7.8, -21.0], 'GA/CT': [-8.2, -22.2], 'CG/GC': [-10.6, -27.2], 'GC/CG': [-9.8, -24.4], 'GG/CC': [-8.0, -19.9] } },
    santalucia2004: { init: [0.2, -5.7], initAT: [2.2, 6.9], initGC: [0, 0], sym: [0, -1.4], st: { 'AA/TT': [-7.6, -21.3], 'AT/TA': [-7.2, -20.4], 'TA/AT': [-7.2, -21.3], 'CA/GT': [-8.5, -22.7], 'GT/CA': [-8.4, -22.4], 'CT/GA': [-7.8, -21.0], 'GA/CT': [-8.2, -22.2], 'CG/GC': [-10.6, -27.2], 'GC/CG': [-9.8, -24.4], 'GG/CC': [-8.0, -19.9] } },
  };
  const R_GAS = 1.987;   // cal/(K·mol), as Biopython Tm_NN
  // a subset of REBASE (Roberts et al. 2023): site 5′→3′ (IUPAC), c1 = top-strand cut, c2 = bottom-strand cut, both counted from the
  // site's first base in top-strand coordinates (cut before that index); overhang c2 − c1: > 0 a 5′ overhang, < 0 a 3′ overhang, 0 blunt
  // a curated subset of REBASE (Roberts et al. 2023 NAR 51:D629; rebase.neb.com, recognition sites and cut positions as NEB lists them):
  // [site 5′→3′ (IUPAC), c1 = the top-strand cut, c2 = the bottom-strand cut, both counted from the site's first base in top-strand
  // coordinates (the cut lies before that index); c2 − c1 > 0 a 5′ overhang, < 0 a 3′ overhang, 0 blunt]. Type IIS enzymes (BsaI …
  // FokI) cut outside their site: GGTCTC(1/5) → c1 = 6 + 1, c2 = 6 + 5. The methylation flag: dam (GATC, N6-methyl-A) or dcm (CCWGG,
  // C5-methyl-C) blocks the enzyme when a methylated base lies inside its site; dam+ = the enzyme cuts only methylated sites (DpnI).
  const ENZ = {
    EcoRI: ['GAATTC', 1, 5], BamHI: ['GGATCC', 1, 5], HindIII: ['AAGCTT', 1, 5], XhoI: ['CTCGAG', 1, 5], SalI: ['GTCGAC', 1, 5],
    XbaI: ['TCTAGA', 1, 5, 'dam'], SpeI: ['ACTAGT', 1, 5], NheI: ['GCTAGC', 1, 5], NcoI: ['CCATGG', 1, 5], NdeI: ['CATATG', 2, 4],
    BglII: ['AGATCT', 1, 5], MluI: ['ACGCGT', 1, 5], XmaI: ['CCCGGG', 1, 5], AvaI: ['CYCGRG', 1, 5], ClaI: ['ATCGAT', 2, 4, 'dam'],
    AgeI: ['ACCGGT', 1, 5], AflII: ['CTTAAG', 1, 5], MfeI: ['CAATTG', 1, 5], BsrGI: ['TGTACA', 1, 5], EagI: ['CGGCCG', 1, 5],
    BclI: ['TGATCA', 1, 5, 'dam'], BstEII: ['GGTNACC', 1, 6],
    TaqI: ['TCGA', 1, 3], MspI: ['CCGG', 1, 3], HpaII: ['CCGG', 1, 3], HinfI: ['GANTC', 1, 4], Sau3AI: ['GATC', 0, 4], MboI: ['GATC', 0, 4, 'dam'],
    DpnI: ['GATC', 2, 2, 'dam+'], DdeI: ['CTNAG', 1, 4], Bsu36I: ['CCTNAGG', 2, 5], EcoRII: ['CCWGG', 0, 5, 'dcm'],
    SmaI: ['CCCGGG', 3, 3], EcoRV: ['GATATC', 3, 3], HaeIII: ['GGCC', 2, 2], AluI: ['AGCT', 2, 2], PvuII: ['CAGCTG', 3, 3],
    ScaI: ['AGTACT', 3, 3], HpaI: ['GTTAAC', 3, 3], DraI: ['TTTAAA', 3, 3], StuI: ['AGGCCT', 3, 3, 'dcm'], NruI: ['TCGCGA', 3, 3],
    NaeI: ['GCCGGC', 3, 3], SnaBI: ['TACGTA', 3, 3], PmeI: ['GTTTAAAC', 4, 4], SwaI: ['ATTTAAAT', 4, 4], XmnI: ['GAANNNNTTC', 5, 5],
    PstI: ['CTGCAG', 5, 1], KpnI: ['GGTACC', 5, 1], SacI: ['GAGCTC', 5, 1], SphI: ['GCATGC', 5, 1], ApaI: ['GGGCCC', 5, 1, 'dcm'], NsiI: ['ATGCAT', 5, 1],
    AatII: ['GACGTC', 5, 1], SacII: ['CCGCGG', 4, 2], PacI: ['TTAATTAA', 5, 3],
    NotI: ['GCGGCCGC', 2, 6], AscI: ['GGCGCGCC', 2, 6], SfiI: ['GGCCNNNNNGGCC', 8, 5], BstXI: ['CCANNNNNNTGG', 8, 4],
    BsaI: ['GGTCTC', 7, 11, 'dcm'], BsmBI: ['CGTCTC', 7, 11], BbsI: ['GAAGAC', 8, 12], SapI: ['GCTCTTC', 8, 11], BsmAI: ['GTCTC', 6, 10],
    PaqCI: ['CACCTGC', 11, 15], FokI: ['GGATG', 14, 18],
  };
  // size ladders (bp) for the gel drawing: generic 1 kb and 100 bp ladders, and λ DNA digested with HindIII (its real fragments)
  const LADDER = { '1kb': [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500], '100bp': [1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], lambda: [23130, 9416, 6557, 4361, 2322, 2027, 564, 125] };
  // the range an agarose gel resolves (Sambrook & Russell 2001, Molecular Cloning 3rd ed., Table 5-1): % → [smallest, largest] bp
  const AGAROSE = [[0.3, 5000, 60000], [0.6, 1000, 20000], [0.7, 800, 10000], [0.9, 500, 7000], [1.2, 400, 6000], [1.5, 200, 3000], [2, 100, 2000]];

  /* ---------- sequences ---------- */
  const WS = /[ \t\r\n\f\v0-9]/g;
  /** a sequence as written in the model → its letters: FASTA header lines dropped, spaces and digits removed, upper case */
  function clean(s) {
    if (typeof s !== 'string') return '';
    return s.split('\n').filter(l => !l.replace(/^[ \t\r\f\v]+/, '').startsWith('>')).join('\n').replace(WS, '').toUpperCase();
  }
  const revcomp = s => { let r = ''; for (let i = s.length - 1; i >= 0; i--) r += COMP[s[i]] || 'N'; return r; };
  const toDNA = s => s.replace(/U/g, 'T');
  const cIdx = c => { const a = B4.indexOf(c[0]), b = B4.indexOf(c[1]), d = B4.indexOf(c[2]); return a < 0 || b < 0 || d < 0 ? -1 : 16 * a + 4 * b + d; };
  const CODONS = []; for (const a of B4) for (const b of B4) for (const d of B4) CODONS.push(a + b + d);
  const tab = id => NCBI[id] || NCBI[1];
  const isStart = (codon, id) => { const k = cIdx(codon); return k >= 0 && tab(id)[1][k] === 'M'; };
  /** one codon (IUPAC allowed) → its amino acid; ctx: true = a context-dependent stop is read as a stop */
  function aaOf(codon, id, ctx) {
    const t = tab(id)[0], cs = CTX[id] || [];
    const one = c => { if (ctx && cs.includes(c)) return '*'; return t[cIdx(c)]; };
    if (/^[ACGT]{3}$/.test(codon)) return one(codon);
    const e = [...codon].map(x => IUPAC[x] || '');
    if (e.some(x => !x)) return 'X';
    const set = new Set();
    for (const a of e[0]) for (const b of e[1]) for (const d of e[2]) set.add(one(a + b + d));
    if (set.size === 1) return [...set][0];
    if (set.has('*')) return 'X';
    for (const p of Object.keys(PAIR)) if ([...set].every(x => PAIR[p].includes(x))) return p;
    return 'X';
  }
  /** translate s (DNA letters) from offset off; cds: the first codon read as M when a start; ctxEnd: the last codon may be a context stop */
  function translate(s, off, id, o) {
    o = o || {};
    let p = '';
    const n = Math.floor((s.length - off) / 3);
    for (let i = 0; i < n; i++) {
      const c = s.substr(off + 3 * i, 3);
      let a = aaOf(c, id, i === n - 1);
      if (i === 0 && o.cds && isStart(c, id)) a = 'M';
      p += a;
      if (o.toStop && a === '*') break;
    }
    return p;
  }

  /* ---------- the checker (the same problems, in the same order, as tools/lib_seq.py check_spec; SPEC is the same JSON there) ---------- */
  const SPEC = {"modes":["translate","mutate","divergence","tm","align","dotplot","digest","protein","crispr"],"tables":{"translate":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","table":"int:1:33","frame":"numx","start":"enum:atg|alt|any","minLen":"numx","nested":"bool","partial":"bool","cds":"bool","toStop":"bool","gc":"enum:remove|ignore|weighted","window":"numx","exons":{"$list":{"$obj":{"start":"numx!","end":"numx!"}},"max":20},"refUsage":{"$list":"nonneg","min":64,"max":64}},"mutate":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","table":"int:1:33","variants":{"$req":true,"$list":{"$obj":{"kind":"enum:sub|del|ins|dup|delins!","pos":"numx!","end":"numx","altIndex":"numx"}},"min":1,"max":16},"enzymes":{"$list":"id","max":10}},"divergence":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","coding":"bool","table":"int:1:33"},"tm":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","na":"numx","k":"numx","tris":"numx","mg":"numx","dntp":"numx","c1":"numx","c2":"numx","saltCorr":"enum:none|schildkraut|santalucia|owczarzy2004|owczarzy2008","nn":"enum:santalucia1998|santalucia2004","selfComp":"enum:auto|yes|no","tMin":"numx","tMax":"numx","mismatches":"numx"},"align":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","type":"enum:global|local|semiglobal","alphabet":"enum:auto|dna|protein","matrix":"enum:BLOSUM62|BLOSUM50|PAM250|none","match":"numx","mismatch":"numx","gap":"numx","open":"numx","extend":"numx","shuffles":"numx","band":"numx"},"dotplot":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","window":"numx","stringency":"numx","revcomp":"bool"},"digest":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","enzymes":{"$req":true,"$list":"id","min":1,"max":10},"custom":{"$list":{"$obj":{"name":"id!","cut":"int:-40:60!","cut2":"int:-40:60"}},"max":6},"circular":"bool","ladder":"enum:none|1kb|100bp|lambda","agarose":"numx","dam":"bool","dcm":"bool","features":{"$list":{"$obj":{"start":"numx!","end":"numx!","key":"key!","strand":"enum:+|-"}},"max":16}},"protein":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","ph":"numx","window":"numx","wheel":"numx","pk":"enum:bjellqvist|emboss|lehninger|solomon|sillero"},"crispr":{"mode":"enum:translate|mutate|divergence|tm|align|dotplot|digest|protein|crispr!","nuclease":"enum:SpCas9|SpCas9NG|SaCas9|Cas12a","guideLen":"numx","target":"numx","gcMin":"numx","gcMax":"numx","seedLen":"numx"}},"seqs":{"translate":[["seq","nuc",20000,1,true]],"mutate":[["cds","strict",6000,3,true]],"divergence":[["a","gap",6000,1,true],["b","gap",6000,1,true]],"tm":[["seq","nuc",120,2,true],["seq2","nuc",120,2,false],["template","nuc",20000,1,false]],"align":[["a","any",2000,1,true],["b","any",2000,1,true]],"dotplot":[["a","any",2000,1,true],["b","any",2000,1,true]],"digest":[["seq","nuc",20000,1,true]],"protein":[["seq","prot",5000,1,true]],"crispr":[["seq","nuc",20000,1,true]]},"outs":{"translate":"length:s gc:s gcSkew:s gc3:s count:s:base protLength:s nStops:s leftover:s nOrfs:s longestOrf:s orfStart:s:int orfEnd:s:int orfFrame:s:int orfCodons:s:int orfPartial:s:int mwSS:s mwOH:s codonCount:s:codon rscu:s:codon aaCount:s:aa enc:s cai:s cdsValid:s incompleteStop:s splicedLength:s nIntrons:s canonicalIntrons:s palindrome:s valid:s winPos:e gcWin:e skewWin:e cumSkew:e codonIndex:e codonCounts:e rscuAll:e translation:c orfMap:c strands:c","mutate":"effect:s:int protPos:s:int refAa:s:int altAa:s:int newLength:s:int fsStop:s:int blosum:s:int transition:s:int sitesRef:s:int sitesAlt:s:int refLength:s nVariants:s count:s:int transitions:s transversions:s valid:s effects:e hgvs:c protein:c:int","divergence":"sites:s diffs:s p:s jc:s k2p:s P:s Q:s tsTv:s S:s N:s Sd:s Nd:s pS:s pN:s dS:s dN:s omega:s valid:s diffPos:e alignment:c","tm":"length:s gc:s tmWallace:s tmMarmur:s tmSalt:s tmNN:s dH:s dS:s dG37:s selfComp:s gcClamp:s maxRun:s maxDinuc:s selfAny:s self3:s hairpin:s selfDG:s self3DG:s hairpinDG:s nIssues:s issue:s:issue tm2:s dTm:s pairAny:s pair3:s pairDG:s product:s productTm:s nProducts:s fwdPos:s revPos:s fwdMism:s revMism:s valid:s T:e theta:e duplex:c pcr:c","align":"score:s nCoOptimal:s identity:s identityShort:s similarity:s gaps:s gapOpens:s alnLength:s nIdentical:s startA:s endA:s startB:s endB:s bits:s evalue:s zScore:s pShuffle:s cells:s banded:s valid:s shuffleScores:e alignment:c dp:c","dotplot":"nHits:s nHitsRev:s longestDiag:s cells:s valid:s dots:c","digest":"length:s nSites:s nBlocked:s nFragments:s bands:s outOfRange:s sitePos:s:int cutPos:s:int siteEnzyme:s:int fragment:s:int fragmentSorted:s:int migration:s:int overhang:s:int nSitesOf:s:int valid:s fragments:e fragmentsSorted:e gel:c map:c","protein":"length:s mwAvg:s mwMono:s pI:s charge:s gravy:s eps280:s eps280ox:s abs01:s abs01ox:s aliphatic:s instability:s aromaticity:s muH:s aaCount:s:aa aaFrac:s:aa valid:s phGrid:e chargeCurve:e hydroX:e hydropathy:e wheel:c","crispr":"nGuides:s nPlus:s nMinus:s nGood:s nearestCut:s nearestDist:s nearestStrand:s nearestGc:s nearestPolyT:s nearestSeedHits:s guideCut:s:int guideStrand:s:int guideGc:s:int guideSeedHits:s:int valid:s cuts:e guides:c"},"tableIds":[1,2,3,4,5,6,9,10,11,12,13,14,15,16,21,22,23,24,25,26,27,28,29,30,31,32,33],"enzymes":["EcoRI","BamHI","HindIII","XhoI","SalI","XbaI","SpeI","NheI","NcoI","NdeI","BglII","MluI","XmaI","AvaI","ClaI","AgeI","AflII","MfeI","BsrGI","EagI","BclI","BstEII","TaqI","MspI","HpaII","HinfI","Sau3AI","MboI","DpnI","DdeI","Bsu36I","EcoRII","SmaI","EcoRV","HaeIII","AluI","PvuII","ScaI","HpaI","DraI","StuI","NruI","NaeI","SnaBI","PmeI","SwaI","XmnI","PstI","KpnI","SacI","SphI","ApaI","NsiI","AatII","SacII","PacI","NotI","AscI","SfiI","BstXI","BsaI","BsmBI","BbsI","SapI","BsmAI","PaqCI","FokI"],"issues":["length","gc","tm","clamp","run","dinuc","self3","selfAny","hairpin","pairTm","pair3"],"alpha":{"nuc":"ACGTURYSWKMBDHVN","strict":"ACGTU","gap":"ACGTURYSWKMBDHVN-","prot":"ACDEFGHIKLMNPQRSTVWYUOBZJX*","any":"ACDEFGHIKLMNPQRSTVWYUOBZJX*TRYSWKMDHVN"},"alphaMsg":{"nuc":"not a nucleotide code","strict":"not A, C, G, T or U","gap":"not a nucleotide code or -","prot":"not an amino-acid letter","any":"not a sequence letter"},"argMsg":{"int":"needs an integer from 0 to 9999","base":"needs one nucleotide letter (A, C, G, T, U or an IUPAC code)","codon":"needs a codon of three letters A, C, G, T or U","aa":"needs one amino-acid letter","issue":"needs one of length, gc, tm, clamp, run, dinuc, self3, selfAny, hairpin, pairTm, pair3"},"cellLimit":250000};
  const TABLES = SPEC.tables, SEQS = SPEC.seqs, ALPHA = SPEC.alpha, ALPHA_MSG = SPEC.alphaMsg, TABLE_IDS = SPEC.tableIds, ENZ_NAMES = SPEC.enzymes, ISSUES = SPEC.issues;
  const S = 'scalar', SE = 'series', SC = 'scene';
  const o_ = str => { const o = {}; for (const part of str.split(' ')) { const [name, k, arg] = part.split(':'); o[name] = arg ? [{ s: S, e: SE, c: SC }[k], arg] : [{ s: S, e: SE, c: SC }[k]]; } return o; };
  const OUTS = {}; for (const md of MODES) OUTS[md] = o_(SPEC.outs[md]);
  const NESTED = { mutate: ['variants', 'alt'], digest: ['custom', 'site'] };   // sequences inside a list of objects
  const ARG_OK = {
    int: a => Number.isInteger(a) && a >= 0 && a <= 9999,
    base: a => typeof a === 'string' && a.length === 1 && NUC.includes(a),
    codon: a => typeof a === 'string' && /^[ACGTU]{3}$/.test(a),
    aa: a => typeof a === 'string' && a.length === 1 && PROT.slice(0, -1).includes(a),
    issue: a => typeof a === 'string' && ISSUES.includes(a),
  };
  /** checks one sequence of the model → its letters, or null */
  function seqCheck(v, path, alpha, max, min, E) {
    if (typeof v !== 'string') { E('value', path, 'needs a sequence (a text)'); return null; }
    for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) > 127) { E('value', path, 'only ASCII letters'); return null; }
    const s = clean(v);
    if (s.length < (min || 1)) { E('value', path, (min || 1) === 1 ? 'empty after removing spaces, digits and FASTA headers' : `shorter than ${min} letters`); return null; }
    if (s.length > max) { E('size', path, `longer than ${max} letters (${s.length})`); return null; }
    const A = ALPHA[alpha];
    for (let i = 0; i < s.length; i++) if (!A.includes(s[i])) { E('alphabet', path, `${ALPHA_MSG[alpha]}: ${s[i]} at position ${i + 1}`); return null; }
    if (alpha !== 'prot' && alpha !== 'any' && s.includes('T') && s.includes('U')) { E('alphabet', path, 'mixes T and U (DNA and RNA)'); return null; }
    return s;
  }
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    const mode = isObj(m) && MODES.includes(m.mode) ? m.mode : null;
    if (!isObj(m)) E('format', 'model', 'not an object');
    else if (!mode) E('enum', 'model.mode', 'one of ' + MODES.join(', '));
    else {
      // the sequences are checked apart (seqCheck): the walk sees the model without them
      const sf = SEQS[mode].map(x => x[0]), nest = NESTED[mode], rest = {};
      for (const k of Object.keys(m)) if (!sf.includes(k)) rest[k] = m[k];
      if (nest && Array.isArray(rest[nest[0]])) rest[nest[0]] = rest[nest[0]].map(x => { if (!isObj(x)) return x; const y = {}; for (const k of Object.keys(x)) if (k !== nest[1]) y[k] = x[k]; return y; });
      C.walk(rest, TABLES[mode], 'model', E, W);
      semantic(mode, m, E, W);
    }
    C.checkOutputs(spec, ID, [S, SE, SC], (o, at, E2) => {
      if (!mode) return;
      const d = has(OUTS[mode], o.of) ? OUTS[mode][o.of] : null;
      if (!d) { E2('output', at + '.of', `${mode} computes no ${o.kind} "${o.of}"`); return; }
      if (d[0] !== o.kind) { E2('output', at + '.kind', `"${o.of}" is a ${d[0]}`); return; }
      if (d[1] && !ARG_OK[d[1]](o.arg)) E2('output', at + '.arg', `"${o.of}" ${SPEC.argMsg[d[1]]}`);
    }, E, W);
    return P;
  }
  function semantic(mode, m, E) {
    const got = {};
    for (const [f, alpha, max, min, req] of SEQS[mode]) {
      let al = alpha;
      if (mode === 'align') al = m.alphabet === 'dna' ? 'nuc' : m.alphabet === 'protein' ? 'prot' : 'any';
      if (m[f] === undefined) { if (req) E('value', 'model.' + f, 'missing'); continue; }
      got[f] = seqCheck(m[f], 'model.' + f, al, max, min, E);
    }
    if (Number.isInteger(m.table) && !TABLE_IDS.includes(m.table)) E('value', 'model.table', 'not an NCBI genetic code (1–6, 9–16, 21–33)');
    const enzList = (arr, own, msg) => (Array.isArray(arr) ? arr : []).forEach((x, i) => { if (typeof x === 'string' && C.ID_RE.test(x) && !ENZ_NAMES.includes(x) && !own.includes(x)) E('ref', `model.enzymes[${i}]`, msg); });
    if (mode === 'mutate') {
      (Array.isArray(m.variants) ? m.variants : []).forEach((v, i) => {
        if (!isObj(v)) return;
        const at = `model.variants[${i}]`;
        if (v.alt !== undefined) seqCheck(v.alt, at + '.alt', 'strict', 60, 1, E);
        if (v.kind === 'sub' && v.alt === undefined && v.altIndex === undefined) E('value', at, 'a substitution needs alt or altIndex');
        if ((v.kind === 'ins' || v.kind === 'delins') && v.alt === undefined) E('value', at + '.alt', 'missing (the inserted bases)');
      });
      enzList(m.enzymes, [], 'not a built-in enzyme');
    } else if (mode === 'divergence') {
      if (got.a && got.b && got.a.length !== got.b.length) E('value', 'model.b', `not as long as a (${got.b.length} and ${got.a.length}): the two must be aligned`);
    } else if (mode === 'align') {
      if (got.a && got.b && (m.band === undefined || typeof m.band === 'number')) {
        const bw = typeof m.band === 'number' && m.band >= 0 ? Math.min(got.b.length + 1, 2 * Math.round(m.band) + 1) : got.b.length + 1;
        const cells = (got.a.length + 1) * bw;
        if (cells > SPEC.cellLimit) E('size', 'model', `${cells} cells of dynamic programming, more than ${SPEC.cellLimit}: ${m.band === undefined ? 'set model.band (a banded alignment) or use shorter sequences' : 'a narrower band or shorter sequences'}`);
      }
      if (m.alphabet === 'dna' && typeof m.matrix === 'string' && m.matrix !== 'none') E('value', 'model.matrix', 'a substitution matrix scores proteins (alphabet dna: none)');
    } else if (mode === 'digest') {
      const own = [];
      (Array.isArray(m.custom) ? m.custom : []).forEach((x, i) => {
        if (!isObj(x)) return;
        if (typeof x.name === 'string') { if (own.includes(x.name) || ENZ_NAMES.includes(x.name)) E('value', `model.custom[${i}].name`, 'already the name of an enzyme'); own.push(x.name); }
        if (x.site === undefined) E('value', `model.custom[${i}].site`, 'missing');
        else seqCheck(x.site, `model.custom[${i}].site`, 'nuc', 30, 2, E);
      });
      enzList(m.enzymes, own, 'not a built-in enzyme or a name of model.custom');
    } else if (mode === 'protein') {
      if (got.seq && got.seq.slice(0, -1).includes('*')) E('value', 'model.seq', 'a stop * only at the end');
    }
  }
  /** every expression of the model: [source, path, local names] */
  function exprs(spec) {
    const m = isObj(spec) && isObj(spec.model) ? spec.model : null, out = [];
    if (!m || !MODES.includes(m.mode)) return out;
    const go = (o, T, path) => {
      if (!isObj(o)) return;
      for (const k of Object.keys(T)) {
        const kd = T[k], v = o[k], p = path + '.' + k;
        if (typeof kd === 'string') { if (kd.replace('!', '') === 'numx' && typeof v === 'string') out.push([v, p, []]); }
        else if (kd.$obj) go(v, kd.$obj, p);
        else if (kd.$list && Array.isArray(v)) v.forEach((x, i) => { if (typeof kd.$list === 'string') { if (kd.$list.replace('!', '') === 'numx' && typeof x === 'string') out.push([x, `${p}[${i}]`, []]); } else if (kd.$list.$obj) go(x, kd.$list.$obj, `${p}[${i}]`); });
      }
    };
    go(m, TABLES[m.mode], 'model');
    return out;
  }
  /** every string key the model names: the labels of a digest map's features */
  function keys(spec) {
    const m = isObj(spec) && isObj(spec.model) ? spec.model : null;
    if (!m || m.mode !== 'digest' || !Array.isArray(m.features)) return [];
    const out = [];
    m.features.forEach((f, i) => { if (isObj(f) && typeof f.key === 'string' && C.KEY_RE.test(f.key)) out.push([f.key, `model.features[${i}].key`]); });
    return out;
  }

  /* ---------- numbers ---------- */
  const CXC = new Map();
  function num(v, env, dflt) {
    if (v === undefined || v === null) return dflt;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return +v;
    let f = CXC.get(v); if (!f) { f = C.cx(v); if (CXC.size > 256) CXC.clear(); CXC.set(v, f); }
    const r = f(env); return typeof r === 'number' ? r : NaN;
  }
  const grid = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  const r6 = x => Math.round(x * 1e6) / 1e6;

  /* ======================= translate ======================= */
  const GC_W = { A: 0, T: 0, U: 0, G: 1, C: 1, S: 1, W: 0, R: 0.5, Y: 0.5, K: 0.5, M: 0.5, B: 2 / 3, D: 1 / 3, H: 1 / 3, V: 2 / 3, N: 0.5 };
  /** GC fraction (Biopython gc_fraction): remove — ambiguous letters left out; ignore — counted in the length only; weighted */
  function gcFrac(s, how) {
    if (!s.length) return NaN;
    if (how === 'weighted') { let g = 0; for (const c of s) g += GC_W[c] || 0; return g / s.length; }
    let g = 0, n = 0; for (const c of s) { if (c === 'G' || c === 'C' || c === 'S') g++; if ('ATCGSWU'.includes(c)) n++; }
    return how === 'ignore' ? g / s.length : n ? g / n : NaN;
  }
  function families(id) {   // aa → [codon indices] of the table (stops under '*')
    const t = tab(id)[0], f = {};
    for (let k = 0; k < 64; k++) { const a = t[k]; (f[a] = f[a] || []).push(k); }
    return f;
  }
  function rscuOf(counts, id) {
    const f = families(id), r = new Array(64).fill(NaN);
    for (const a of Object.keys(f)) { const ks = f[a], tot = ks.reduce((x, k) => x + counts[k], 0); if (tot > 0) for (const k of ks) r[k] = counts[k] * ks.length / tot; }
    return r;
  }
  /** the effective number of codons (Wright 1990): Nc = Σ_k n_k / mean F_k over the sense families of degeneracy k */
  function encOf(counts, id) {
    const f = families(id), byK = {};
    for (const a of Object.keys(f)) {
      if (a === '*') continue;
      const ks = f[a], k = ks.length; byK[k] = byK[k] || { n: 0, F: [] }; byK[k].n++;
      if (k === 1) continue;
      const n = ks.reduce((x, j) => x + counts[j], 0);
      if (n < 2) continue;
      let s2 = 0; for (const j of ks) s2 += (counts[j] / n) * (counts[j] / n);
      byK[k].F.push((n * s2 - 1) / (n - 1));
    }
    const mean = k => (byK[k] && byK[k].F.length ? byK[k].F.reduce((a, b) => a + b, 0) / byK[k].F.length : NaN);
    let nc = 0, ok = true;
    for (const k of Object.keys(byK).map(Number)) {
      if (k === 1) { nc += byK[k].n; continue; }
      let F = mean(k);
      if (!Number.isFinite(F) && k === 3) F = (mean(2) + mean(4)) / 2;   // Wright: the missing isoleucine class
      if (!(F > 0)) { ok = false; break; }
      nc += byK[k].n / F;
    }
    const sense = 64 - (f['*'] ? f['*'].length : 0);
    return ok ? Math.min(nc, sense) : NaN;
  }
  function runTranslate(m, env) {
    const codes = [], out = {};
    let s0 = toDNA(clean(m.seq)), id = m.table || 1;
    out.length = s0.length;
    // splicing: exons 1-based inclusive, ascending
    let s = s0;
    out.splicedLength = s0.length; out.nIntrons = 0; out.canonicalIntrons = 0;
    if (Array.isArray(m.exons) && m.exons.length) {
      const ex = m.exons.map(x => [Math.round(num(x.start, env, NaN)), Math.round(num(x.end, env, NaN))]);
      if (ex.some(([a, b], i) => !(a >= 1 && b <= s0.length && a <= b && (i === 0 || a > ex[i - 1][1])))) codes.push('exon-range');
      else {
        s = ex.map(([a, b]) => s0.slice(a - 1, b)).join('');
        out.splicedLength = s.length; out.nIntrons = ex.length - 1;
        for (let i = 1; i < ex.length; i++) {
          const intr = s0.slice(ex[i - 1][1], ex[i][0] - 1), d = intr.slice(0, 2), a = intr.slice(-2);
          if (intr.length >= 4 && ((d === 'GT' || d === 'GC') && a === 'AG' || d === 'AT' && a === 'AC')) out.canonicalIntrons++;
        }
        if (out.canonicalIntrons < out.nIntrons) codes.push('noncanonical-intron');
      }
    }
    const L = s.length, how = m.gc || 'remove';
    out.gc = gcFrac(s, how);
    const cnt = c => [...s].filter(x => x === c).length;
    const g = cnt('G'), c = cnt('C');
    out.gcSkew = g + c ? (g - c) / (g + c) : NaN;
    let g3 = 0, n3 = 0; for (let i = 2; i < L; i += 3) { if ('ACGT'.includes(s[i])) { n3++; if (s[i] === 'G' || s[i] === 'C') g3++; } }
    out.gc3 = n3 ? g3 / n3 : NaN;
    const amb = /[^ACGT]/.test(s);
    if (amb) codes.push('ambiguous');
    const rna = /U/.test(clean(m.seq));
    out.mwSS = amb || !L ? NaN : [...s].reduce((x, b) => x + (rna ? NT_RNA[b === 'T' ? 'U' : b] : NT_DNA[b]), 0) - (L - 1) * WATER;
    out.mwOH = amb || rna || !L ? NaN : 313.21 * cnt('A') + 304.2 * cnt('T') + 289.18 * cnt('C') + 329.21 * cnt('G') - 61.96;   // OligoCalc (Kibbe 2007), 5′-OH
    // GC and skew in windows
    let w = Math.round(num(m.window, env, Math.min(100, L)));
    if (!(w >= 1)) { codes.push('window-range'); w = Math.max(1, Math.min(100, L)); }
    if (L / w > 2000) { codes.push('window-small'); w = Math.ceil(L / 2000); }
    out.winPos = []; out.gcWin = []; out.skewWin = []; out.cumSkew = [];
    let cum = 0;
    for (let i = 0; i + w <= L; i += w) {
      const part = s.substr(i, w); let gg = 0, cc = 0; for (const x of part) { if (x === 'G') gg++; else if (x === 'C') cc++; }
      out.winPos.push(i + w / 2); out.gcWin.push(gcFrac(part, how)); const sk = gg + cc ? (gg - cc) / (gg + cc) : 0; out.skewWin.push(gg + cc ? sk : NaN); cum += sk; out.cumSkew.push(cum);
    }
    // translation in the frame
    let fr = Math.round(num(m.frame, env, 1));
    if (![1, 2, 3, -1, -2, -3].includes(fr)) { codes.push('frame-range'); fr = 1; }
    const rc = revcomp(s);
    out.palindrome = L && s === rc ? 1 : 0;
    const fs = fr > 0 ? s : rc, off = Math.abs(fr) - 1;
    const prot = translate(fs, off, id, { cds: !!m.cds, toStop: !!m.toStop });
    out.protLength = [...prot].filter(x => x !== '*').length; out.nStops = [...prot].filter(x => x === '*').length;
    out.leftover = Math.max(0, fs.length - off) % 3;
    const ac = {}; for (const x of prot) ac[x] = (ac[x] || 0) + 1;
    // the CDS check
    out.cdsValid = NaN; out.incompleteStop = 0;
    if (m.cds) {
      const full = translate(s, 0, id, { cds: true });
      const okStart = L >= 3 && isStart(s.slice(0, 3), id), okLen = L % 3 === 0, okStop = full.endsWith('*'), inner = full.slice(0, -1).includes('*');
      if (!okStart) codes.push('cds-no-start');
      if (!okLen) codes.push('cds-length');
      if (!okStop) codes.push('cds-no-stop');
      if (inner) codes.push('cds-internal-stop');
      const tail = s.slice(L - (L % 3));
      if (!okLen && MITO.includes(id) && (tail === 'T' || tail === 'TA') && !full.includes('*')) { out.incompleteStop = 1; codes.push('incomplete-stop'); }
      out.cdsValid = okStart && okLen && okStop && !inner ? 1 : 0;
    }
    // codon usage, RSCU, ENC, CAI (frame 1 of the working sequence)
    const counts = new Array(64).fill(0);
    for (let i = 0; i + 3 <= L; i += 3) { const k = cIdx(s.substr(i, 3)); if (k >= 0) counts[k]++; }
    const rs = rscuOf(counts, id);
    out.codonIndex = counts.map((_, k) => k); out.codonCounts = counts; out.rscuAll = rs;
    out.enc = encOf(counts, id);
    if (!Number.isFinite(out.enc)) codes.push('enc-sparse');
    out.cai = NaN;
    if (Array.isArray(m.refUsage) && m.refUsage.length === 64) {
      const rr = rscuOf(m.refUsage, id), f = families(id), wv = new Array(64).fill(NaN);
      let zero = false;
      for (const a of Object.keys(f)) { if (a === '*' || f[a].length === 1) continue; const mx = Math.max(...f[a].map(k => (Number.isFinite(rr[k]) ? rr[k] : 0))); for (const k of f[a]) wv[k] = mx > 0 ? rr[k] / mx : NaN; }
      let sl = 0, nn = 0;
      for (let k = 0; k < 64; k++) if (counts[k] && Number.isFinite(wv[k])) { let wk = wv[k]; if (wk === 0) { wk = 0.01; zero = true; } sl += counts[k] * Math.log(wk); nn += counts[k]; }
      out.cai = nn ? Math.exp(sl / nn) : NaN;
      if (zero) codes.push('cai-zero-w');
    }
    // ORFs in six frames
    const startMode = m.start || 'atg', minLen = Math.round(num(m.minLen, env, 75)), nested = !!m.nested, partial = m.partial !== false;
    if (!(minLen >= 3)) codes.push('minlen-range');
    const orfs = [];
    const ctxStops = CTX[id] || [];
    for (const f of [1, 2, 3, -1, -2, -3]) {
      const str = f > 0 ? s : rc, o0 = Math.abs(f) - 1, n = Math.floor((L - o0) / 3);
      let open = [], lastStop = -1;
      const emit = (i, j, stop) => {
        const nt = (j - i + (stop ? 1 : 0)) * 3;
        if (nt < Math.max(3, minLen)) return;
        const p5 = startMode === 'any' && lastStop < 0, a = o0 + 3 * i, b = o0 + 3 * (stop ? j : j - 1) + 2;
        orfs.push({ f, i, nt, codons: j - i, partial: (p5 ? 1 : 0) + (stop ? 0 : 2), start: f > 0 ? a + 1 : L - a, end: f > 0 ? b + 1 : L - b });
      };
      for (let j = 0; j < n; j++) {
        const cdn = str.substr(o0 + 3 * j, 3), a = /^[ACGT]{3}$/.test(cdn) ? tab(id)[0][cIdx(cdn)] : aaOf(cdn, id, false);
        const stop = a === '*' && !ctxStops.includes(cdn);
        if (stop) {
          if (startMode === 'any') { if (j > lastStop + 1) emit(lastStop + 1, j, true); }
          else for (const i of open) emit(i, j, true);
          open = []; lastStop = j;
          continue;
        }
        if (startMode !== 'any' && (nested || !open.length)) {
          if (startMode === 'atg' ? cdn === 'ATG' : isStart(cdn, id)) open.push(j);
        }
      }
      if (partial) {
        if (startMode === 'any') { if (n > lastStop + 1) emit(lastStop + 1, n, false); }
        else for (const i of open) emit(i, n, false);
      }
      if (orfs.length > 5000) { codes.push('orfs-many'); break; }
    }
    const FO = [1, 2, 3, -1, -2, -3];
    orfs.sort((x, y) => y.nt - x.nt || FO.indexOf(x.f) - FO.indexOf(y.f) || x.i - y.i);
    out.nOrfs = orfs.length; out.longestOrf = orfs.length ? orfs[0].codons : 0;
    const of = (k, i) => (Number.isInteger(i) && i < orfs.length ? orfs[i][k] : NaN);
    out.translation = drawTranslation(fs, off, prot, fr);
    out.orfMap = drawOrfs(L, orfs);
    out.strands = drawStrands(s);
    out.valid = codes.some(x => ['exon-range', 'frame-range'].includes(x)) ? 0 : 1;
    const ARG = {
      count: b => [...s].filter(x => x === toDNA(b)).length, codonCount: cd => counts[cIdx(toDNA(cd))], rscu: cd => rs[cIdx(toDNA(cd))], aaCount: a => ac[a] || 0,
      orfStart: i => of('start', i), orfEnd: i => of('end', i), orfFrame: i => of('f', i), orfCodons: i => of('codons', i), orfPartial: i => of('partial', i),
    };
    return { out, codes, ARG, orfs, prot };
  }
  function drawTranslation(fs, off, prot, fr) {
    // rows of 20 codons: the codon (s) and its amino acid below; the frame label at the left
    const rows = Math.min(15, Math.ceil(prot.length / 20)), sc = C.scene([-3, 21, -rows * 2 - 0.5, 1.5]);
    sc.txt(-2.5, 0.9, { s: (fr > 0 ? '+' : '') + fr, c: 'muted', anchor: 'start' });
    for (let i = 0; i < Math.min(prot.length, rows * 20); i++) {
      const r = Math.floor(i / 20), x = i % 20 + 0.5, y = -r * 2;
      if (i % 20 === 0) sc.txt(-0.4, y, { v: off + 3 * i + 1, c: 'muted', anchor: 'end' });
      const a = prot[i];
      sc.txt(x, y, { s: fs.substr(off + 3 * i, 3), c: a === '*' ? 'bad' : a === 'M' ? 'ok' : 'base', anchor: 'middle' });
      sc.txt(x, y - 0.8, { s: a, c: a === '*' ? 'bad' : a === 'M' ? 'ok' : 'hi', anchor: 'middle' });
    }
    return sc.done();
  }
  function drawOrfs(L, orfs) {
    const sc = C.scene([-0.08 * L, 1.02 * L, -4.2, 4.2]), FY = { 1: 3, 2: 2, 3: 1, '-1': -1, '-2': -2, '-3': -3 };
    sc.seg(0, 0, L, 0, { c: 'base', w: 2 });
    for (const f of [1, 2, 3, -1, -2, -3]) { sc.txt(-0.02 * L, FY[f], { s: (f > 0 ? '+' : '') + f, c: 'muted', anchor: 'end' }); sc.seg(0, FY[f], L, FY[f], { c: 'muted', dash: true }); }
    for (const o of orfs.slice(0, 600)) {
      const y = FY[o.f], a = Math.min(o.start, o.end) - 1, b = Math.max(o.start, o.end), tip = Math.min(0.4 * (b - a), 0.015 * L);
      const pts = o.f > 0 ? [a, y - 0.3, b - tip, y - 0.3, b, y, b - tip, y + 0.3, a, y + 0.3] : [b, y - 0.3, a + tip, y - 0.3, a, y, a + tip, y + 0.3, b, y + 0.3];
      sc.poly(pts, { c: o.partial ? 'warn' : 'ok', fill: true, closed: true });
    }
    sc.txt(0, -3.9, { v: 1, c: 'muted', anchor: 'start' }); sc.txt(L, -3.9, { v: L, c: 'muted', anchor: 'end' });
    return sc.done();
  }
  function drawStrands(s) {
    const n = Math.min(60, s.length), sc = C.scene([-3, n + 3, -2.2, 1.2]);
    sc.txt(-1.5, 0, { s: "5'", c: 'muted', anchor: 'middle' }); sc.txt(n + 1.5, 0, { s: "3'", c: 'muted', anchor: 'middle' });
    sc.txt(-1.5, -1.5, { s: "3'", c: 'muted', anchor: 'middle' }); sc.txt(n + 1.5, -1.5, { s: "5'", c: 'muted', anchor: 'middle' });
    for (let i = 0; i < n; i++) {
      const b = s[i], role = b === 'G' || b === 'C' ? 'hi' : 'info';
      sc.txt(i + 0.5, 0, { s: b, c: role, anchor: 'middle' }); sc.seg(i + 0.5, -0.35, i + 0.5, -1.05, { c: 'muted' }); sc.txt(i + 0.5, -1.5, { s: COMP[b] || 'N', c: role, anchor: 'middle' });
    }
    return sc.done();
  }

  /* ======================= mutate ======================= */
  const p3 = a => AA3[a] || 'Xaa';
  const AAI = 'ACDEFGHIKLMNPQRSTVWY*';   // refAa / altAa: the index of the amino acid in this order (20 = a stop)
  const cut64 = s => (s.length <= 64 ? s : s.slice(0, 63) + '…');
  /** the protein of a CDS (DNA letters): from codon 1 to the first stop (included) or the last whole codon */
  const protOf = (s, id) => translate(s, 0, id, { cds: true, toStop: true });
  function applyVariant(ref, v, env) {
    const L = ref.length, kind = v.kind;
    let a = Math.round(num(v.pos, env, NaN)) - 1, b = v.end === undefined ? a : Math.round(num(v.end, env, NaN)) - 1;
    let alt = v.alt !== undefined ? toDNA(clean(v.alt)) : '';
    if (kind === 'sub' && v.alt === undefined) { const k = Math.round(num(v.altIndex, env, NaN)); alt = k >= 0 && k <= 3 ? 'ACGT'[k] : ''; }
    if (!(a >= 0 && a < L) || !(b >= a && b < L) || (kind === 'sub' && (b !== a || alt.length !== 1))) return null;
    if (kind === 'ins' && !(a < L - 1)) return null;
    let seq, c;
    if (kind === 'sub') {
      if (alt === ref[a]) return { seq: ref, c: `c.${a + 1}=`, same: true, at: a };
      seq = ref.slice(0, a) + alt + ref.slice(a + 1); c = `c.${a + 1}${ref[a]}>${alt}`;
    } else if (kind === 'del' || kind === 'dup') {
      while (b + 1 < L && ref[b + 1] === ref[a]) { a++; b++; }   // the 3′ rule
      const rng = a === b ? `${a + 1}` : `${a + 1}_${b + 1}`;
      seq = kind === 'del' ? ref.slice(0, a) + ref.slice(b + 1) : ref.slice(0, b + 1) + ref.slice(a, b + 1) + ref.slice(b + 1);
      c = `c.${rng}${kind}`;
    } else if (kind === 'ins') {
      let p = a, x = alt;   // inserted between p and p + 1 (0-based); shifted 3′ through repeats
      while (p + 1 < L && ref[p + 1] === x[0]) { x = x.slice(1) + x[0]; p++; }
      seq = ref.slice(0, p + 1) + x + ref.slice(p + 1);
      if (p + 1 >= x.length && ref.slice(p + 1 - x.length, p + 1) === x) c = x.length === 1 ? `c.${p + 1}dup` : `c.${p + 2 - x.length}_${p + 1}dup`;
      else c = `c.${p + 1}_${p + 2}ins${x}`;
    } else {
      seq = ref.slice(0, a) + alt + ref.slice(b + 1);
      c = `c.${a === b ? a + 1 : `${a + 1}_${b + 1}`}delins${alt}`;
    }
    return { seq, c, sub: kind === 'sub' ? [ref[a], alt] : null, at: a };
  }
  /** effect: 0 synonymous, 1 missense, 2 nonsense, 3 stop-loss, 4 start-loss, 5 in-frame deletion, 6 in-frame insertion, 7 in-frame delins, 8 frameshift, 9 not applied */
  function effectOf(ref, alt, id, inFrame) {
    const R = protOf(ref, id), A = protOf(alt, id);
    const res = { R, A, effect: 0, pos: NaN, newLen: A.endsWith('*') ? A.length - 1 : NaN, fs: NaN, blosum: NaN, p: 'p.(=)' };
    let P = 0; while (P < R.length && P < A.length && R[P] === A[P]) P++;
    if (P === R.length && P === A.length) return res;
    res.pos = P + 1;
    if (P === 0 && R[0] === 'M') { res.effect = 4; res.p = 'p.(Met1?)'; return res; }
    if (P < A.length && A[P] === '*' && R[P] !== '*') { res.effect = 2; res.p = `p.(${p3(R[P])}${P + 1}*)`; return res; }
    const stopAt = A.indexOf('*', P);
    if (R[P] === '*') {   // the stop is lost: an extension to the next stop
      res.effect = 3; res.p = `p.(*${P + 1}${p3(A[P])}ext*${stopAt >= 0 ? stopAt - P + 1 : '?'})`; return res;
    }
    if (!inFrame) {
      res.effect = 8; res.fs = stopAt >= 0 ? stopAt - P + 1 : NaN;
      res.p = `p.(${p3(R[P])}${P + 1}${p3(A[P] || 'X')}fs*${stopAt >= 0 ? stopAt - P + 1 : '?'})`; return res;
    }
    let Q = 0; while (Q < R.length - P && Q < A.length - P && R[R.length - 1 - Q] === A[A.length - 1 - Q]) Q++;
    const del = R.slice(P, R.length - Q), ins = A.slice(P, A.length - Q);
    const span = (i, j) => (i === j ? `${p3(R[i])}${i + 1}` : `${p3(R[i])}${i + 1}_${p3(R[j])}${j + 1}`);
    const three = x => [...x].map(p3).join('');
    if (del.length === 1 && ins.length === 1) { res.effect = 1; res.blosum = MATRIX.BLOSUM62[R[P]] && MATRIX.BLOSUM62[R[P]][A[P]] !== undefined ? MATRIX.BLOSUM62[R[P]][A[P]] : NaN; res.p = `p.(${p3(R[P])}${P + 1}${p3(A[P])})`; return res; }
    if (!ins.length) { res.effect = 5; res.p = `p.(${span(P, P + del.length - 1)}del)`; return res; }
    if (!del.length) {
      res.effect = 6;
      if (P >= ins.length && R.slice(P - ins.length, P) === ins) res.p = `p.(${span(P - ins.length, P - 1)}dup)`;
      else res.p = `p.(${p3(R[P - 1])}${P}_${p3(R[P])}${P + 1}ins${three(ins)})`;
      return res;
    }
    res.effect = 7; res.p = `p.(${span(P, P + del.length - 1)}delins${three(ins)})`;
    return res;
  }
  function runMutate(m, env) {
    const codes = [], out = {};
    const ref = toDNA(clean(m.cds)), id = m.table || 1;
    if (!isStart(ref.slice(0, 3), id)) codes.push('cds-no-start');
    const R = protOf(ref, id);
    if (!R.endsWith('*')) codes.push('cds-no-stop');
    out.refLength = R.endsWith('*') ? R.length - 1 : R.length;
    const res = [], cnt = new Array(10).fill(0);
    const enz = (Array.isArray(m.enzymes) ? m.enzymes : []).filter(n => has(ENZ, n)).map(n => ENZ[n]), sitesRef = enz.length ? countSites(ref, enz, false) : NaN;
    let ts = 0, tv = 0;
    for (const v of m.variants) {
      const ap = applyVariant(ref, v, env);
      if (!ap) { codes.push('variant-range'); res.push({ effect: 9, c: '?', p: '?' }); cnt[9]++; continue; }
      if (ap.same) { codes.push('same-base'); res.push({ effect: 9, c: ap.c, p: 'p.(=)' }); cnt[9]++; continue; }
      const e = effectOf(ref, ap.seq, id, (ap.seq.length - ref.length) % 3 === 0);
      if (e.effect === 0 && ap.sub) { const k = Math.floor(ap.at / 3); if (k < R.length) { e.pos = k + 1; e.p = `p.(${p3(R[k])}${k + 1}=)`; } }
      e.refAa = Number.isFinite(e.pos) ? AAI.indexOf(R[e.pos - 1]) : NaN; e.altAa = Number.isFinite(e.pos) && e.A[e.pos - 1] !== undefined ? AAI.indexOf(e.A[e.pos - 1]) : NaN;
      if (enz.length) { e.sitesRef = sitesRef; e.sitesAlt = countSites(ap.seq, enz, false); }
      let tr = NaN;
      if (ap.sub) { const x = ap.sub.join(''); tr = ['AG', 'GA', 'CT', 'TC'].includes(x) ? 1 : 0; if (tr) ts++; else tv++; }
      res.push({ ...e, c: ap.c, tr });
      cnt[e.effect]++;
    }
    out.nVariants = res.length; out.transitions = ts; out.transversions = tv;
    out.effects = res.map(r => r.effect);
    const sc = C.scene([0, 40, -res.length - 0.5, 0.5]);
    res.forEach((r, i) => { sc.txt(0.3, -i, { s: cut64(r.c), c: 'base', anchor: 'start' }); sc.txt(20, -i, { s: cut64(r.p), c: r.effect === 0 ? 'ok' : r.effect === 1 ? 'warn' : r.effect === 9 ? 'muted' : 'bad', anchor: 'start' }); });
    out.hgvs = sc.done();
    out.valid = codes.includes('variant-range') ? 0 : 1;
    const at = (k, i) => (Number.isInteger(i) && i < res.length && res[i][k] !== undefined ? res[i][k] : NaN);
    const ARG = {
      effect: i => at('effect', i), protPos: i => at('pos', i), refAa: i => at('refAa', i), altAa: i => at('altAa', i), sitesRef: i => at('sitesRef', i), sitesAlt: i => at('sitesAlt', i), newLength: i => at('newLen', i), fsStop: i => at('fs', i), blosum: i => at('blosum', i), transition: i => at('tr', i),
      count: k => (Number.isInteger(k) && k < 10 ? cnt[k] : NaN), protein: i => drawProtein(res[i], R),
    };
    return { out, codes, ARG, res };
  }
  function drawProtein(r, R) {
    // the reference and the variant protein around the first change: 25 residues each, the changed ones marked
    if (!r || !r.A) return { view: [0, 1, 0, 1], items: [] };
    const P = Number.isFinite(r.pos) ? r.pos - 1 : 0, a = Math.max(0, P - 8), n = 25, sc = C.scene([-1.5, n + 0.5, -2.6, 1.2]);
    sc.txt(-0.5, 0, { v: a + 1, c: 'muted', anchor: 'end' });
    for (let i = 0; i < n; i++) {
      const x = R[a + i], y = r.A[a + i];
      if (x !== undefined) sc.txt(i + 0.5, 0, { s: x, c: x === '*' ? 'bad' : 'base', anchor: 'middle' });
      if (y !== undefined) sc.txt(i + 0.5, -1.4, { s: y, c: y === x ? 'base' : 'bad', anchor: 'middle' });
      if (x !== undefined && y !== undefined && x === y) sc.seg(i + 0.5, -0.35, i + 0.5, -1.0, { c: 'muted' });
    }
    return sc.done();
  }

  /* ======================= divergence ======================= */
  const isTs = (x, y) => (x === 'A' && y === 'G') || (x === 'G' && y === 'A') || (x === 'C' && y === 'T') || (x === 'T' && y === 'C');
  const jcD = p => (p < 0.75 ? -0.75 * Math.log(1 - 4 * p / 3) : NaN);
  /** Nei & Gojobori (1986) synonymous sites of one codon (as Biopython: changes to a stop count as nonsynonymous) */
  function synSites(codon, id) {
    const a = aaOf(codon, id, false); let s = 0;
    for (let i = 0; i < 3; i++) for (const b of 'ACGT') { if (b === codon[i]) continue; const mu = codon.slice(0, i) + b + codon.slice(i + 1), x = aaOf(mu, id, false); if (x !== '*' && x === a) s++; }
    return s / 3;
  }
  /** synonymous and nonsynonymous differences of two codons, every mutational pathway weighted equally */
  function synDiffs(c1, c2, id) {
    const diff = [0, 1, 2].filter(i => c1[i] !== c2[i]);
    if (!diff.length) return [0, 0];
    const step = (x, y) => (aaOf(x, id, false) === aaOf(y, id, false) ? [1, 0] : [0, 1]);
    const perms = diff.length === 1 ? [diff] : diff.length === 2 ? [[diff[0], diff[1]], [diff[1], diff[0]]] : [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let sd = 0, nd = 0;
    for (const pth of perms) { let cur = c1; for (const i of pth) { const nx = cur.slice(0, i) + c2[i] + cur.slice(i + 1); const [a, b] = step(cur, nx); sd += a; nd += b; cur = nx; } }
    return [sd / perms.length, nd / perms.length];
  }
  function runDivergence(m) {
    const codes = [], out = {};
    const a = toDNA(clean(m.a)), b = toDNA(clean(m.b)), id = m.table || 1;
    let sites = 0, P = 0, Q = 0; const pos = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (!'ACGT'.includes(x) || !'ACGT'.includes(y)) continue;
      sites++;
      if (x !== y) { pos.push(i + 1); if (isTs(x, y)) P++; else Q++; }
    }
    out.sites = sites; out.diffs = P + Q; out.diffPos = pos;
    if (!sites) { codes.push('no-sites'); return { out: { ...out, valid: 0 }, codes }; }
    out.p = (P + Q) / sites; out.P = P / sites; out.Q = Q / sites; out.tsTv = Q ? P / Q : NaN;
    out.jc = jcD(out.p);
    const k1 = 1 - 2 * out.P - out.Q, k2 = 1 - 2 * out.Q;
    out.k2p = k1 > 0 && k2 > 0 ? -0.5 * Math.log(k1) - 0.25 * Math.log(k2) : NaN;
    if (!Number.isFinite(out.jc) || !Number.isFinite(out.k2p)) codes.push('saturated');
    if (m.coding) {
      if (a.length % 3) codes.push('coding-length');
      let Ss = 0, Sd = 0, Nd = 0, n = 0;
      for (let i = 0; i + 3 <= a.length; i += 3) {
        const c1 = a.substr(i, 3), c2 = b.substr(i, 3);
        if (!/^[ACGT]{3}$/.test(c1) || !/^[ACGT]{3}$/.test(c2) || aaOf(c1, id, false) === '*' || aaOf(c2, id, false) === '*') continue;
        n++; Ss += (synSites(c1, id) + synSites(c2, id)) / 2;
        const [x, y] = synDiffs(c1, c2, id); Sd += x; Nd += y;
      }
      out.S = Ss; out.N = 3 * n - Ss; out.Sd = Sd; out.Nd = Nd;
      out.pS = Ss > 0 ? Sd / Ss : NaN; out.pN = out.N > 0 ? Nd / out.N : NaN;
      out.dS = jcD(out.pS); out.dN = jcD(out.pN); out.omega = out.dS > 0 ? out.dN / out.dS : NaN;
      if (!Number.isFinite(out.dS) || !Number.isFinite(out.dN)) codes.push('saturated');
    }
    const n = Math.min(300, a.length), rows = Math.ceil(n / 50), sc = C.scene([-2, 51, -rows * 3 + 0.5, 1]);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 50), x = i % 50 + 0.5, y = -r * 3, d = a[i] !== b[i];
      if (i % 50 === 0) sc.txt(-0.4, y, { v: i + 1, c: 'muted', anchor: 'end' });
      sc.txt(x, y, { s: a[i], c: d ? 'bad' : 'base', anchor: 'middle' }); sc.txt(x, y - 1.2, { s: b[i], c: d ? 'bad' : 'base', anchor: 'middle' });
      if (d && 'ACGT'.includes(a[i]) && 'ACGT'.includes(b[i])) sc.pt(x, y - 0.6, { r: 2, c: isTs(a[i], b[i]) ? 'warn' : 'bad' });
    }
    out.alignment = sc.done();
    out.valid = 1;
    return { out, codes };
  }

  /* ======================= tm ======================= */
  function saltCorr(method, s, ion) {
    // Biopython MeltingTemp.salt_correction (methods 1, 5, 6, 7): ions in mM
    let Mon = ion.na + ion.k + ion.tris / 2, mg = ion.mg * 1e-3;
    if (ion.k + ion.mg + ion.tris + ion.dntp > 0 && method !== 7 && ion.dntp < ion.mg) Mon += 120 * Math.sqrt(ion.mg - ion.dntp);
    const mon = Mon * 1e-3, gc = gcFrac(s, 'ignore'), N = s.length;
    if (method === 1) return mon > 0 ? 16.6 * Math.log10(mon) : NaN;
    if (method === 5) return mon > 0 ? 0.368 * (N - 1) * Math.log(mon) : NaN;
    if (method === 6) return mon > 0 ? (4.29 * gc - 3.95) * 1e-5 * Math.log(mon) + 9.40e-6 * Math.log(mon) ** 2 : NaN;
    // method 7, Owczarzy et al. 2008 (Mg²⁺; free Mg after dNTP binding with Ka = 3·10⁴ M⁻¹)
    let a = 3.92, b = -0.911, c = 6.26, d = 1.42; const e = -48.2, f = 52.5; let g = 8.31;
    if (ion.dntp > 0) { const dn = ion.dntp * 1e-3, ka = 3e4; mg = (-(ka * dn - ka * mg + 1) + Math.sqrt((ka * dn - ka * mg + 1) ** 2 + 4 * ka * mg)) / (2 * ka); }
    if (Mon > 0) {
      const R = Math.sqrt(mg) / mon;
      if (R < 0.22) return (4.29 * gc - 3.95) * 1e-5 * Math.log(mon) + 9.40e-6 * Math.log(mon) ** 2;
      if (R < 6) { const l = Math.log(mon); a = 3.92 * (0.843 - 0.352 * Math.sqrt(mon) * l); d = 1.42 * (1.279 - 4.03e-3 * l - 8.03e-3 * l * l); g = 8.31 * (0.486 - 0.258 * l + 5.25e-3 * l * l * l); }
    }
    if (!(mg > 0)) return NaN;
    const lm = Math.log(mg);
    return (a + b * lm + gc * (c + d * lm) + (1 / (2 * (N - 1))) * (e + f * lm + g * lm * lm)) * 1e-5;
  }
  const SALT_M = { none: 0, schildkraut: 1, santalucia: 5, owczarzy2004: 6, owczarzy2008: 7 };
  /** nearest-neighbour Tm of a perfect duplex (Biopython Tm_NN without mismatches): {tm, dH, dS} */
  function tmNN(s, o) {
    const T = NN_SETS[o.nn || 'santalucia1998'], N = s.length;
    if (N < 2) return { tm: NaN, dH: NaN, dS: NaN };
    let dH = T.init[0], dS = T.init[1];
    const ends = s[0] + s[N - 1], at = [...ends].filter(x => x === 'A' || x === 'T').length, gcE = 2 - at;
    dH += T.initAT[0] * at + T.initGC[0] * gcE; dS += T.initAT[1] * at + T.initGC[1] * gcE;
    for (let i = 0; i < N - 1; i++) {
      const k = s.substr(i, 2) + '/' + COMP[s[i]] + COMP[s[i + 1]], kr = [...k].reverse().join('');
      const v = T.st[k] || T.st[kr]; dH += v[0]; dS += v[1];
    }
    let kc = (o.c1 - o.c2 / 2) * 1e-9;
    if (o.self) { kc = o.c1 * 1e-9; dH += T.sym[0]; dS += T.sym[1]; }
    const meth = SALT_M[o.saltCorr || 'santalucia'];
    const corr = meth ? saltCorr(meth, s, o.ion) : 0;
    if (meth === 5) dS += corr;
    let tm = (1000 * dH) / (dS + R_GAS * Math.log(kc)) - 273.15;
    if (meth === 1) tm += corr;
    if (meth === 6 || meth === 7) tm = 1 / (1 / (tm + 273.15) + corr) - 273.15;
    return { tm, dH, dS, kc };
  }
  /** ΔG°37 (kcal/mol, 1 M Na⁺) of the perfect duplex whose top strand is d: SantaLucia 1998 stacks (ΔH − 310.15·ΔS), with or without
      the two initiation terms (no initiation: a hairpin stem, whose loop term is added apart) */
  function nnDG(d, init) {
    const T = NN_SETS.santalucia1998; let g = 0;
    for (let i = 0; i + 1 < d.length; i++) { const k = d.substr(i, 2) + '/' + COMP[d[i]] + COMP[d[i + 1]], v = T.st[k] || T.st[[...k].reverse().join('')]; if (!v) return NaN; g += v[0] - 310.15 * v[1] / 1000; }
    if (init) for (const e of [d[0], d[d.length - 1]]) { const v = e === 'A' || e === 'T' ? T.initAT : T.initGC; g += v[0] - 310.15 * v[1] / 1000; }
    return g;
  }
  /** the longest run of consecutive Watson–Crick pairs between x and y (both 5′→3′) held antiparallel at any offset, and the lowest
      ΔG°37 of such a run of ≥ 2 pairs (ungapped; Primer3's thermodynamic alignment is not reproduced); end3: runs that pair x's 3′ base */
  function compBest(x, y, end3) {
    const yr = revcomp(y); let best = 0, dG = 0;
    for (let sh = -(yr.length - 1); sh < x.length; sh++) {
      let run = 0;
      const lo = Math.max(0, sh), hi = Math.min(x.length, sh + yr.length);
      for (let i = lo; i <= hi; i++) {
        if (i < hi && x[i] === yr[i - sh]) { run++; continue; }
        if (run && (!end3 || i === x.length)) { best = Math.max(best, run); if (run >= 2) dG = Math.min(dG, nnDG(x.substr(i - run, run), true)); }
        run = 0;
      }
    }
    return { run: best, dG: best >= 2 ? Math.round(dG * 1000) / 1000 : 0 };
  }
  // hairpin loop initiation ΔG°37 (kcal/mol) by loop length (SantaLucia & Hicks 2004 Table 4); longer loops: + 2.44·R·T·ln(n/30) (Jacobson–Stockmayer)
  const HP_LOOP = { 3: 3.5, 4: 3.5, 5: 3.3, 6: 4.0, 7: 4.2, 8: 4.3, 9: 4.5, 10: 4.6, 12: 5.0, 14: 5.1, 16: 5.3, 18: 5.5, 20: 5.7, 25: 6.1, 30: 6.3 };
  function loopDG(n) {
    if (HP_LOOP[n] !== undefined) return HP_LOOP[n];
    if (n > 30) return 6.3 + 2.44 * 1.987e-3 * 310.15 * Math.log(n / 30);
    const ks = Object.keys(HP_LOOP).map(Number); let a = 3; for (const k of ks) if (k < n) a = k; const b = ks.find(k => k > n);
    return HP_LOOP[a] + (HP_LOOP[b] - HP_LOOP[a]) * (n - a) / (b - a);
  }
  /** the longest hairpin stem (≥ 3 unpaired bases in the loop) and the lowest ΔG°37 = stem stacks + loop term over stems of ≥ 2 pairs */
  function hairpinBest(s) {
    let stem = 0, dG = Infinity;
    for (let i = 0; i < s.length; i++) for (let j = s.length - 1; j - i >= 4; j--) {
      let k = 0;
      while (j - k - (i + k) - 1 >= 3 && COMP[s[i + k]] === s[j - k]) {
        k++;
        stem = Math.max(stem, k);
        if (k >= 2) dG = Math.min(dG, nnDG(s.substr(i, k), false) + loopDG(j - k - (i + k) + 1));
      }
    }
    return { stem, dG: Number.isFinite(dG) ? Math.round(dG * 1000) / 1000 : NaN };
  }
  /** IUPAC-aware binding: p (5′→3′) on the top strand of t, or on the bottom strand (where t holds its reverse complement), with ≤ mis
      mismatches and the primer's 3′ base always paired → [{top, pos, end (1-based on t), mis}] */
  function bindSites(t, p, mis) {
    const out = [], n = p.length, rp = revcomp(p), ok = (a, b) => (IUPAC[a] || '').includes(b);
    for (let i = 0; i + n <= t.length; i++) {
      for (const [q, top] of [[p, true], [rp, false]]) {
        if (!(top ? ok(q[n - 1], t[i + n - 1]) : ok(q[0], t[i]))) continue;
        let e = 0; for (let k = 0; k < n && e <= mis; k++) if (!ok(q[k], t[i + k])) e++;
        if (e <= mis) out.push({ top, pos: i + 1, end: i + n, mis: e });
      }
      if (out.length > 1000) break;
    }
    return out;
  }
  function drawPcr(r) {
    if (!r) return { view: [0, 1, 0, 1], items: [] };
    const L = r.L, sc = C.scene([-0.04 * L, 1.04 * L, -2, 2]);
    sc.seg(0, 0.15, L, 0.15, { c: 'base', w: 2 }); sc.seg(0, -0.15, L, -0.15, { c: 'base', w: 2 });
    sc.txt(0, -0.7, { v: 1, c: 'muted', anchor: 'start' }); sc.txt(L, -0.7, { v: L, c: 'muted', anchor: 'end' });
    for (const x of r.top.slice(0, 200)) sc.seg(x.pos - 1, 0.6, x.end, 0.6, { c: x.mis ? 'warn' : 'ok', w: 3, arrow: true });
    for (const y of r.bot.slice(0, 200)) sc.seg(y.end, -0.6, y.pos - 1, -0.6, { c: y.mis ? 'warn' : 'ok', w: 3, arrow: true });
    if (r.p0) { const a = r.p0.x.pos - 1, b = r.p0.y.end; sc.poly([a, 1.1, b, 1.1, b, 1.4, a, 1.4], { c: 'hi', fill: true, closed: true }); sc.txt((a + b) / 2, 1.75, { v: r.p0.len, c: 'hi', anchor: 'middle' }); }
    return sc.done();
  }
  function runTm(m, env) {
    const codes = [], out = {};
    const s = toDNA(clean(m.seq)), N = s.length;
    out.length = N;
    const cnt = c => [...s].filter(x => x === c).length, A = cnt('A'), T = cnt('T'), G = cnt('G'), Cc = cnt('C');
    const amb = /[^ACGT]/.test(s);
    if (amb) codes.push('ambiguous');
    out.gc = gcFrac(s, 'remove');
    out.tmWallace = amb ? NaN : 2 * (A + T) + 4 * (G + Cc);
    out.tmMarmur = amb ? NaN : 64.9 + 41 * (G + Cc - 16.4) / N;
    const ion = { na: num(m.na, env, 50), k: num(m.k, env, 0), tris: num(m.tris, env, 0), mg: num(m.mg, env, 0), dntp: num(m.dntp, env, 0) };
    const c1 = num(m.c1, env, 25), c2 = num(m.c2, env, 25);
    if (!Object.values(ion).every(v => v >= 0 && Number.isFinite(v))) codes.push('salt-range');
    const monM = (ion.na + ion.k + ion.tris / 2) * 1e-3;
    out.tmSalt = amb || !(monM > 0) ? NaN : 81.5 + 16.6 * Math.log10(monM) + 0.41 * (100 * (G + Cc) / N) - 600 / N;
    const selfC = m.selfComp === 'yes' || (m.selfComp !== 'no' && s === revcomp(s));
    out.selfComp = selfC ? 1 : 0;
    const o = { nn: m.nn, c1, c2, self: selfC, saltCorr: m.saltCorr || 'santalucia', ion };
    let r = { tm: NaN, dH: NaN, dS: NaN };
    if (!amb && !codes.includes('salt-range')) {
      if (!(selfC ? c1 > 0 : c1 - c2 / 2 > 0)) codes.push('conc-range');
      else { r = tmNN(s, o); if (!Number.isFinite(r.tm)) codes.push('salt-range'); }
    }
    out.tmNN = r.tm; out.dH = r.dH; out.dS = r.dS; out.dG37 = r.dH - 310.15 * r.dS / 1000;
    if (N > 60) codes.push('long-oligo');
    if (out.tmNN < 0) codes.push('below-zero');
    // the melting curve: a two-state duplex whose ΔS is set so that its midpoint is the Tm above
    out.T = []; out.theta = [];
    if (Number.isFinite(r.tm)) {
      const Tm = r.tm + 273.15, dSx = 1000 * r.dH / Tm - R_GAS * Math.log(r.kc), t0 = num(m.tMin, env, r.tm - 25), t1 = num(m.tMax, env, r.tm + 25);
      if (t1 > t0) for (const t of grid(t0, t1, 201)) {
        const TK = t + 273.15, K = Math.exp(-(1000 * r.dH - TK * dSx) / (R_GAS * TK));
        let th;
        if (selfC) { const c = c1 * 1e-9, bq = 4 * K * c + 1; const D = (bq - Math.sqrt(bq * bq - 16 * K * K * c * c)) / (8 * K); th = 2 * D / c; }
        else { const ca = c1 * 1e-9, cb = c2 * 1e-9, lo = Math.min(ca, cb), hi = Math.max(ca, cb), bq = K * (ca + cb) + 1; const D = (bq - Math.sqrt(Math.max(0, bq * bq - 4 * K * K * ca * cb))) / (2 * K); th = lo > 0 ? D / lo : NaN; void hi; }
        out.T.push(t); out.theta.push(Math.min(1, Math.max(0, th)));
      } else codes.push('range');
    }
    // primer checks (oligos ≤ 60 nt): runs of pairs and their nearest-neighbour ΔG°37 (an estimate: perfect stems, 1 M Na⁺)
    const runs = re => { let b = 0; for (const x of s.match(re) || []) b = Math.max(b, x.length); return b; };
    if (N <= 60 && !amb) {
      out.gcClamp = [...s.slice(-5)].filter(x => x === 'G' || x === 'C').length;
      out.maxRun = runs(/(.)\1*/g);
      let dn = 0; for (let i = 0; i + 1 < N; i++) { let k = 1; while (i + 2 * k + 1 < N && s.substr(i + 2 * k, 2) === s.substr(i, 2)) k++; if (s[i] !== s[i + 1]) dn = Math.max(dn, k); }
      out.maxDinuc = dn;
      const sa = compBest(s, s, false), s3 = compBest(s, s, true), hp = hairpinBest(s);
      out.selfAny = sa.run; out.self3 = s3.run; out.selfDG = sa.dG; out.self3DG = s3.dG; out.hairpin = hp.stem; out.hairpinDG = hp.dG;
    } else { out.gcClamp = out.maxRun = out.maxDinuc = out.selfAny = out.self3 = out.hairpin = out.selfDG = out.self3DG = out.hairpinDG = NaN; }
    // the second primer, the amplicon
    out.tm2 = out.dTm = out.pairAny = out.pair3 = out.pairDG = out.product = out.productTm = out.fwdPos = out.revPos = out.fwdMism = out.revMism = NaN;
    out.nProducts = NaN;
    const s2 = typeof m.seq2 === 'string' ? toDNA(clean(m.seq2)) : null;
    if (s2 !== null) {
      if (!/[^ACGT]/.test(s2) && !amb && !codes.includes('salt-range') && c1 - c2 / 2 > 0) {
        out.tm2 = tmNN(s2, { ...o, self: s2 === revcomp(s2) }).tm; out.dTm = Math.abs(out.tmNN - out.tm2);
      }
      if (N <= 60 && s2.length <= 60 && !amb && !/[^ACGT]/.test(s2)) {
        const pa = compBest(s, s2, false); out.pairAny = pa.run; out.pairDG = pa.dG;
        out.pair3 = Math.max(compBest(s, s2, true).run, compBest(s2, s, true).run);
      }
    }
    // in-silico PCR on the template: every binding site of each primer on either strand, ≤ `mismatches` mismatches, the 3′ base paired
    let pcr = null;
    if (typeof m.template === 'string') {
      const t = toDNA(clean(m.template)), mis = Math.round(num(m.mismatches, env, 0));
      if (!(mis >= 0 && mis <= 5)) codes.push('mismatch-range');
      else {
        const prim = s2 !== null ? [s, s2] : [s], top = [], bot = [];
        prim.forEach((p, pi) => { for (const x of bindSites(t, p, mis)) (x.top ? top : bot).push({ ...x, pi }); });
        out.fwdPos = (top.find(x => x.pi === 0) || { pos: NaN }).pos;
        const prods = [];
        for (const x of top) for (const y of bot) { const len = y.end - x.pos + 1; if (len >= prim[x.pi].length && len <= 20000) prods.push({ x, y, len }); }
        prods.sort((u, v) => (u.x.pi === 0 && u.y.pi === 1 ? 0 : 1) - (v.x.pi === 0 && v.y.pi === 1 ? 0 : 1) || u.len - v.len || u.x.pos - v.x.pos);
        out.nProducts = prods.length;
        if (!top.length && !bot.length) codes.push('primer-not-found');
        if (prods.length) {
          const p0 = prods[0];
          if (!(p0.x.pi === 0 && p0.y.pi === 1)) codes.push(s2 === null || p0.x.pi === p0.y.pi ? 'single-primer-product' : 'primers-swapped');
          if (prods.length > 1) codes.push('several-products');
          out.fwdPos = p0.x.pos; out.revPos = p0.y.end; out.product = p0.len; out.fwdMism = p0.x.mis; out.revMism = p0.y.mis;
          const amp = t.slice(p0.x.pos - 1, p0.y.end), g = [...amp].filter(c => c === 'G' || c === 'C').length, mon = (ion.na + ion.k + ion.tris / 2) * 1e-3;
          out.productTm = mon > 0 ? 81.5 + 16.6 * Math.log10(mon) + 0.41 * (100 * g / amp.length) - 675 / amp.length : NaN;   // long DNA (Howley et al. 1979; Sambrook & Russell 2001)
          pcr = { L: t.length, top, bot, p0 };
        } else if (s2 !== null) codes.push('no-product');
        if (!pcr) pcr = { L: t.length, top, bot, p0: null };
      }
    }
    out.pcr = drawPcr(pcr);
    // the primer rules (Dieffenbach, Lowe & Dveksler 1993; Primer3 defaults, Untergasser et al. 2012)
    const iss = {
      length: !(N >= 18 && N <= 30), gc: !(out.gc >= 0.4 && out.gc <= 0.6), tm: !(out.tmNN >= 52 && out.tmNN <= 65), clamp: !(out.gcClamp >= 1 && out.gcClamp <= 3),
      run: !(out.maxRun <= 4), dinuc: !(out.maxDinuc <= 4), self3: !(out.self3 < 4), selfAny: !(out.selfAny < 8), hairpin: !(out.hairpin < 4),
      pairTm: s2 !== null && !(out.dTm <= 5), pair3: s2 !== null && !(out.pair3 < 4),
    };
    out.nIssues = ISSUES.filter(k => iss[k]).length;
    for (const k of ISSUES) if (iss[k]) codes.push('primer-' + k);
    const n = Math.min(60, N), sc = C.scene([-3, n + 3, -2.2, 1.2]);
    sc.txt(-1.5, 0, { s: "5'", c: 'muted', anchor: 'middle' }); sc.txt(n + 1.5, 0, { s: "3'", c: 'muted', anchor: 'middle' });
    sc.txt(-1.5, -1.5, { s: "3'", c: 'muted', anchor: 'middle' }); sc.txt(n + 1.5, -1.5, { s: "5'", c: 'muted', anchor: 'middle' });
    for (let i = 0; i < n; i++) { const b = s[i], role = b === 'G' || b === 'C' ? 'hi' : 'info'; sc.txt(i + 0.5, 0, { s: b, c: role, anchor: 'middle' }); sc.seg(i + 0.5, -0.35, i + 0.5, -1.05, { c: role, w: b === 'G' || b === 'C' ? 3 : 2 }); sc.txt(i + 0.5, -1.5, { s: COMP[b] || 'N', c: role, anchor: 'middle' }); }
    out.duplex = sc.done();
    out.valid = Number.isFinite(out.tmNN) ? 1 : 0;
    return { out, codes, ARG: { issue: k => (iss[k] ? 1 : 0) } };
  }

  /* ======================= align ======================= */
  const NEG = -Infinity;
  const eq = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  function scorer(m, env, prot) {
    const mat = m.matrix ? (m.matrix === 'none' ? null : MATRIX[m.matrix]) : prot ? MATRIX.BLOSUM62 : null;
    const ma = num(m.match, env, 1), mi = num(m.mismatch, env, -1);
    const map = x => (x === 'U' ? (prot ? 'C' : 'T') : x === 'O' ? 'K' : x === 'J' ? 'X' : x);
    if (mat) return { f: (x, y) => { const a = map(x), b = map(y); return mat[a] && mat[a][b] !== undefined ? mat[a][b] : mat.X.X; }, mat };
    return { f: (x, y) => (map(x) === map(y) ? ma : mi), mat: null };
  }
  /** the cells of a (banded) DP matrix: row i holds the columns lo[i] … hi[i] around the diagonal j ≈ i·n/m (w = Infinity: all) */
  function bandOf(m, n, w) {
    const lo = new Int32Array(m + 1), hi = new Int32Array(m + 1), off = new Int32Array(m + 2);
    for (let i = 0; i <= m; i++) {
      const c = m ? Math.round(i * n / m) : 0;
      lo[i] = w === Infinity ? 0 : Math.max(0, c - w); hi[i] = w === Infinity ? n : Math.min(n, c + w);
      off[i + 1] = off[i] + hi[i] - lo[i] + 1;
    }
    return { lo, hi, off, size: off[m + 1], ix: (i, j) => (i < 0 || i > m || j < lo[i] || j > hi[i] ? -1 : off[i] + j - lo[i]) };
  }
  /** one alignment run with the three-state recursion (Gotoh 1982; Durbin et al. 1998 §2.4): M ends in a pair, X in a letter of a
      against a gap, Y in a letter of b against a gap; gaps may follow each other (X ↔ Y). A gap of k letters scores o + (k − 1)·e.
      Each state also counts its co-optimal paths (doubles, capped at 1e300). → {score, count, M, X, Y, B (the band), end} */
  function dp(a, b, sf, type, o, e, w) {
    const m = a.length, n = b.length, B = bandOf(m, n, w), sz = B.size, ix = B.ix;
    const M = new Float64Array(sz).fill(NEG), X = new Float64Array(sz).fill(NEG), Y = new Float64Array(sz).fill(NEG);
    const cM = new Float64Array(sz), cX = new Float64Array(sz), cY = new Float64Array(sz);
    const loc = type === 'local', semi = type === 'semiglobal';
    M[0] = 0; cM[0] = 1;
    if (!loc) {
      for (let i = 1; i <= m; i++) { const k = ix(i, 0); if (k >= 0) { X[k] = semi ? 0 : o + (i - 1) * e; cX[k] = 1; } }
      for (let j = 1; j <= n; j++) { const k = ix(0, j); if (k >= 0) { Y[k] = semi ? 0 : o + (j - 1) * e; cY[k] = 1; } }
    }
    const cap = v => (v > 1e300 ? 1e300 : v);
    const gv = (A, k) => (k < 0 ? NEG : A[k]), gc = (A, k) => (k < 0 ? 0 : A[k]);
    for (let i = 1; i <= m; i++) for (let j = Math.max(1, B.lo[i]); j <= B.hi[i]; j++) {
      const k = ix(i, j), d = ix(i - 1, j - 1), u = ix(i - 1, j), l = ix(i, j - 1);
      const Md = gv(M, d), Xd = gv(X, d), Yd = gv(Y, d);
      let best = Math.max(Md, Xd, Yd), c = 0;
      if (loc && !(best > 0)) { best = 0; c = 1; }
      else { if (eq(Md, best)) c += cM[d]; if (eq(Xd, best)) c += cX[d]; if (eq(Yd, best)) c += cY[d]; }
      if (best > NEG) { M[k] = best + sf(a[i - 1], b[j - 1]); cM[k] = cap(c); }
      const Mu = gv(M, u) + o, Xu = gv(X, u) + e, Yu = gv(Y, u) + o, bx = Math.max(Mu, Xu, Yu);
      if (bx > NEG) { let cx = 0; if (eq(Mu, bx)) cx += gc(cM, u); if (eq(Xu, bx)) cx += gc(cX, u); if (eq(Yu, bx)) cx += gc(cY, u); X[k] = bx; cX[k] = cap(cx); }
      const Ml = gv(M, l) + o, Yl = gv(Y, l) + e, Xl = gv(X, l) + o, by = Math.max(Ml, Yl, Xl);
      if (by > NEG) { let cy = 0; if (eq(Ml, by)) cy += gc(cM, l); if (eq(Yl, by)) cy += gc(cY, l); if (eq(Xl, by)) cy += gc(cX, l); Y[k] = by; cY[k] = cap(cy); }
    }
    // the end: global (m, n); semi-global the last row or column; local any pair cell
    let score = NEG, count = 0, end = null;
    const consider = (i, j, st) => {
      const k = ix(i, j); if (k < 0) return;
      const v = st === 0 ? M[k] : st === 1 ? X[k] : Y[k], cc = st === 0 ? cM[k] : st === 1 ? cX[k] : cY[k];
      if (!(v > NEG)) return;
      if (v > score && !eq(v, score)) { score = v; count = cc; end = [i, j, st]; } else if (eq(v, score)) count = cap(count + cc);
    };
    if (type === 'global') for (const st of [0, 1, 2]) consider(m, n, st);
    else if (semi) { for (let j = 0; j <= n; j++) for (const st of [0, 1, 2]) consider(m, j, st); for (let i = 0; i < m; i++) for (const st of [0, 1, 2]) consider(i, n, st); }
    else for (let i = 1; i <= m; i++) for (let j = Math.max(1, B.lo[i]); j <= B.hi[i]; j++) consider(i, j, 0);
    if (loc && !(score > 0)) { score = 0; count = 1; end = null; }
    return { score, count, M, X, Y, B, end };
  }
  /** the traceback of the alignment shown (ties broken in a fixed order: a pair, then a gap in b, then a gap in a) → the aligned
      strings and the cells where it starts (i0, j0) and ends (i1, j1) */
  function traceback(a, b, r, sf, type, o, e) {
    const { M, X, Y } = r, ix = r.B.ix, m = a.length, n = b.length; let ra = '', rb = '';
    if (!r.end) return { ra, rb, i0: 0, j0: 0, i1: 0, j1: 0 };
    let [i, j, st] = r.end; const i1 = i, j1 = j;
    const loc = type === 'local', semi = type === 'semiglobal';
    if (semi) { ra = a.slice(i) + '-'.repeat(n - j); rb = '-'.repeat(m - i) + b.slice(j); }
    const gv = (A, k) => (k < 0 ? NEG : A[k]);
    for (let guard = 0; guard < m + n + 2; guard++) {
      if (i === 0 && j === 0) break;
      if (!loc && (i === 0 || j === 0)) { ra = a.slice(0, i) + '-'.repeat(j) + ra; rb = '-'.repeat(i) + b.slice(0, j) + rb; i = 0; j = 0; break; }
      const k = ix(i, j);
      if (st === 0) {
        const d = ix(i - 1, j - 1), v = M[k] - sf(a[i - 1], b[j - 1]);
        ra = a[i - 1] + ra; rb = b[j - 1] + rb; i--; j--;
        if (loc && !(Math.max(gv(M, d), gv(X, d), gv(Y, d)) > 0)) break;
        st = eq(gv(M, d), v) ? 0 : eq(gv(X, d), v) ? 1 : 2;
      } else if (st === 1) {
        const u = ix(i - 1, j), v = X[k];
        ra = a[i - 1] + ra; rb = '-' + rb; i--;
        st = eq(gv(M, u) + o, v) ? 0 : eq(gv(X, u) + e, v) ? 1 : 2;
      } else {
        const l = ix(i, j - 1), v = Y[k];
        ra = '-' + ra; rb = b[j - 1] + rb; j--;
        st = eq(gv(M, l) + o, v) ? 0 : eq(gv(Y, l) + e, v) ? 2 : 1;
      }
    }
    return { ra, rb, i0: i, j0: j, i1, j1 };
  }
  function runAlign(m, env, seed) {
    const codes = [], out = {};
    const a = clean(m.a), b = clean(m.b);
    const prot = m.alphabet === 'protein' || (m.alphabet !== 'dna' && /[^ACGTUN]/.test(a + b));
    const type = m.type || 'global', sc0 = scorer(m, env, prot);
    let o, e;
    if (m.open !== undefined || m.extend !== undefined) { o = num(m.open, env, prot ? -12 : -2); e = num(m.extend, env, -1); }
    else if (m.gap !== undefined) { o = e = num(m.gap, env, -2); }
    else if (prot) { o = -12; e = -1; } else { o = e = -2; }
    if (!(o <= 0 && e <= 0) || ![o, e, num(m.match, env, 1), num(m.mismatch, env, -1)].every(Number.isFinite)) { codes.push('gap-range'); return { out: { valid: 0 }, codes }; }
    if (e < o) codes.push('extend-above-open');
    const bw = m.band === undefined ? Infinity : Math.round(num(m.band, env, NaN));
    if (!(bw >= 0)) { codes.push('band-range'); return { out: { valid: 0 }, codes }; }
    const cells = bandOf(a.length, b.length, bw).size;
    if (cells > SPEC.cellLimit) { codes.push('budget'); return { out: { valid: 0, cells }, codes }; }
    out.cells = cells; out.banded = bw < b.length ? 1 : 0;
    if (out.banded) codes.push('banded');
    const r = dp(a, b, sc0.f, type, o, e, bw);
    out.score = r.score; out.nCoOptimal = r.count;
    const tb = traceback(a, b, r, sc0.f, type, o, e);
    const L = tb.ra.length;
    let idn = 0, sim = 0, gaps = 0, opens = 0;
    for (let k = 0; k < L; k++) {
      const x = tb.ra[k], y = tb.rb[k];
      if (x === '-' || y === '-') { gaps++; if (k === 0 || (x === '-') !== (tb.ra[k - 1] === '-') || (y === '-') !== (tb.rb[k - 1] === '-')) opens++; continue; }
      if (x === y) idn++; if (sc0.f(x, y) > 0) sim++;
    }
    // identity = identical columns / alignment columns (gaps included, as EMBOSS); identityShort = / the shorter sequence (May 2004)
    out.alnLength = L; out.nIdentical = idn; out.gaps = gaps; out.gapOpens = opens; out.identity = L ? idn / L : NaN; out.similarity = L ? sim / L : NaN;
    out.identityShort = Math.min(a.length, b.length) ? idn / Math.min(a.length, b.length) : NaN;
    if (type === 'local') { out.startA = r.end ? tb.i0 + 1 : NaN; out.endA = r.end ? tb.i1 : NaN; out.startB = r.end ? tb.j0 + 1 : NaN; out.endB = r.end ? tb.j1 : NaN; if (!r.end) codes.push('no-local-similarity'); }
    else { out.startA = 1; out.endA = a.length; out.startB = 1; out.endB = b.length; }
    // Karlin–Altschul for BLOSUM62 local with BLAST's 11/1 gaps (λ 0.267, K 0.041; NCBI BLAST)
    out.bits = out.evalue = NaN;
    if (type === 'local' && sc0.mat === MATRIX.BLOSUM62 && o === -12 && e === -1) { const lam = 0.267, K = 0.041; out.bits = (lam * r.score - Math.log(K)) / Math.LN2; out.evalue = K * a.length * b.length * Math.exp(-lam * r.score); }
    // a seeded shuffle test of b
    const nsh = Math.round(num(m.shuffles, env, 0));
    out.zScore = out.pShuffle = NaN; out.shuffleScores = [];
    if (nsh > 0) {
      if (nsh > 1000 || out.cells * (1 + nsh) > BUDGET * 10) codes.push('budget');
      else {
        const rand = C.rng(seed >>> 0, 'seq-shuffle'), sh = [];
        for (let t = 0; t < nsh; t++) { const x = b.split(''); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tt = x[i]; x[i] = x[j]; x[j] = tt; } sh.push(dp(a, x.join(''), sc0.f, type, o, e, bw).score); }
        const mu = sh.reduce((p, q) => p + q, 0) / nsh, sd = Math.sqrt(sh.reduce((p, q) => p + (q - mu) * (q - mu), 0) / Math.max(1, nsh - 1));
        out.zScore = sd > 0 ? (r.score - mu) / sd : NaN; out.pShuffle = (1 + sh.filter(x => x >= r.score - 1e-9).length) / (1 + nsh); out.shuffleScores = sh;
      }
    }
    out.alignment = drawAlignment(tb, sc0.f);
    out.dp = drawDP(a, b, r, tb, type);
    out.valid = 1;
    return { out, codes };
  }
  function drawAlignment(tb, sf) {
    const n = Math.min(600, tb.ra.length), rows = Math.max(1, Math.ceil(n / 60)), sc = C.scene([-1, 61, -rows * 3.2 + 0.6, 1]);
    for (let k = 0; k < n; k++) {
      const x = k % 60 + 0.5, y = -Math.floor(k / 60) * 3.2, p = tb.ra[k], q = tb.rb[k];
      sc.txt(x, y, { s: p, c: p === '-' ? 'muted' : 'base', anchor: 'middle' }); sc.txt(x, y - 1.6, { s: q, c: q === '-' ? 'muted' : 'base', anchor: 'middle' });
      if (p !== '-' && q !== '-') { if (p === q) sc.seg(x, y - 0.45, x, y - 1.15, { c: 'ok', w: 2 }); else if (sf(p, q) > 0) sc.pt(x, y - 0.8, { r: 2, c: 'info' }); }
    }
    return sc.done();
  }
  function drawDP(a, b, r, tb, type) {
    const m = a.length, n = b.length;
    if ((m + 1) * (n + 1) > 400) return { view: [0, 1, 0, 1], items: [] };
    const sc = C.scene([-1.5, n + 1, -m - 1, 1.5]), ix = r.B.ix;
    for (let j = 0; j < n; j++) sc.txt(j + 1, 1, { s: b[j], c: 'hi', anchor: 'middle' });
    for (let i = 0; i < m; i++) sc.txt(-1, -(i + 1), { s: a[i], c: 'hi', anchor: 'middle' });
    // the path of the alignment shown
    const on = new Set(); { let i = tb.i0, j = tb.j0; on.add(ix(i, j)); for (let k = 0; k < tb.ra.length; k++) { if (tb.ra[k] !== '-') i++; if (tb.rb[k] !== '-') j++; on.add(ix(i, j)); } }
    for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) {
      const k = ix(i, j); if (k < 0) continue;
      const v = Math.max(r.M[k], r.X[k], r.Y[k]);
      sc.txt(j, -i, { v: type === 'local' ? Math.round(Math.max(0, Number.isFinite(v) ? v : 0) * 100) / 100 : Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN, c: on.has(k) ? 'ok' : 'muted', anchor: 'middle' });
    }
    return sc.done();
  }

  /* ======================= dotplot ======================= */
  /** a windowed dot plot: a dot at (i, j) when ≥ k of the w letters of a[i…] and b[j…] match (Maizel & Lenk 1981); one sliding count
      per diagonal, O(m·n). More than 900 dots are pooled into a 30 × 30 grid (the dot's size grows with log10 of its count). */
  function runDotplot(m, env) {
    const codes = [], out = {};
    const a = clean(m.a), b = clean(m.b), la = a.length, lb = b.length;
    const w = Math.round(num(m.window, env, 1)), k = Math.round(num(m.stringency, env, w));
    if (!(w >= 1 && w <= Math.min(la, lb)) || !(k >= 1 && k <= w)) { codes.push('window-range'); return { out: { valid: 0 }, codes }; }
    out.cells = la * lb;
    const LIM = 900, G = 30;
    const scan = bb => {
      let longest = 0, nh = 0; const list = [], bins = new Map();
      for (let d = -(lb - w); d <= la - w; d++) {   // diagonal i − j = d, windows starting at (i, j)
        const i0 = Math.max(0, d), j0 = i0 - d; let run = 0, cur = 0;
        for (let t = 0; i0 + t < la && j0 + t < lb; t++) {
          if (a[i0 + t] === bb[j0 + t]) cur++;
          if (t >= w && a[i0 + t - w] === bb[j0 + t - w]) cur--;
          if (t >= w - 1) {
            if (cur >= k) {
              const i = i0 + t - w + 1, j = j0 + t - w + 1; nh++; run++; if (run > longest) longest = run;
              if (list.length < LIM) list.push(i, j);
              const key = Math.floor(i / la * G) * G + Math.floor(j / lb * G); bins.set(key, (bins.get(key) || 0) + 1);
            } else run = 0;
          }
        }
      }
      return { longest, nh, list, bins };
    };
    const f = scan(b);
    out.longestDiag = f.longest; out.nHits = f.nh; out.nHitsRev = NaN;
    const r = m.revcomp ? scan(revcomp(b)) : null;
    if (r) out.nHitsRev = r.nh;
    const sc = C.scene([-0.02 * la, la * 1.02, -lb * 1.02, lb * 0.02]);
    sc.poly([0, 0, la, 0, la, -lb, 0, -lb], { c: 'muted', closed: true });
    const plot = (h, role, rev) => {
      if (h.nh <= LIM) { for (let q = 0; q < h.list.length; q += 2) { const i = h.list[q], j = h.list[q + 1]; sc.pt(i + w / 2, -(rev ? lb - j - w / 2 : j + w / 2), { r: 1.5, c: role }); } return; }
      for (const [key, v] of h.bins) { const gi = Math.floor(key / G), gj = key % G; sc.pt((gi + 0.5) * la / G, -(rev ? lb - (gj + 0.5) * lb / G : (gj + 0.5) * lb / G), { r: 1.5 + Math.min(3, Math.log10(v)), c: role }); }
      codes.push('dots-pooled');
    };
    plot(f, 'hi', false);
    if (r) plot(r, 'warn', true);
    out.dots = sc.done();
    out.valid = 1;
    return { out, codes };
  }

  /* ======================= digest ======================= */
  const siteRe = site => new RegExp([...site].map(c => (IUPAC[c] && IUPAC[c].length > 1 ? '[' + IUPAC[c] + ']' : IUPAC[c] || c)).join(''), 'g');
  /** the methylated bases of E. coli's Dam (GATC: the A of both strands) and Dcm (CCWGG: the inner C of both strands), 0-based top indices */
  function methylated(s, dam, dcm) {
    const at = new Set();
    if (dam) for (let q = s.indexOf('GATC'); q >= 0; q = s.indexOf('GATC', q + 1)) { at.add(q + 1); at.add(q + 2); }
    if (dcm) { const re = /CC[AT]GG/g; let mt; while ((mt = re.exec(s))) { at.add(mt.index + 1); at.add(mt.index + 3); re.lastIndex = mt.index + 1; } }
    return at;
  }
  /** every site of the enzymes defs ([site, c1, c2, meth?]) on both strands of s (palindromes once; overlapping sites all; a circle
      wraps) → [{pos (1-based), cut (top-strand cut, before that 0-based index), cut2 (bottom), e, fwd, blocked}] */
  function findSites(s, defs, circ, met, codes) {
    const L = s.length, sites = [];
    defs.forEach((def, ei) => {
      const [site, c1, c2, meth] = def, ls = site.length, pal = revcomp(site) === site;
      const hay = circ ? s + s.slice(0, ls - 1) : s;
      for (const [pat, fwd] of pal ? [[site, true]] : [[site, true], [revcomp(site), false]]) {
        const re = siteRe(pat);
        for (let p = 0; p + ls <= hay.length; p++) {
          re.lastIndex = p; const mt = re.exec(hay); if (!mt) break; p = mt.index;
          if (p >= L) break;
          let cut = fwd ? p + c1 : p + ls - c2, cut2 = fwd ? p + c2 : p + ls - c1;
          if (circ) { cut = ((cut % L) + L) % L; cut2 = ((cut2 % L) + L) % L; }
          else if (cut <= 0 || cut >= L || cut2 <= 0 || cut2 >= L) { if (codes) codes.push('cut-outside'); cut = NaN; }
          let blocked = false;
          if (meth && met) {
            let hit = false; for (let q = p; q < p + ls; q++) if (met.has(circ ? q % L : q)) hit = true;
            blocked = meth === 'dam+' ? !hit : hit;
          } else if (meth === 'dam+') blocked = true;
          sites.push({ pos: p + 1, cut, cut2, e: ei, fwd, blocked });
        }
      }
    });
    return sites.sort((x, y) => x.pos - y.pos || x.e - y.e);
  }
  /** the number of sites an unmethylated sequence offers to the enzymes (mutate: sites gained or lost) */
  const countSites = (s, defs, circ) => findSites(s, defs, circ, null, null).filter(x => !x.blocked).length;
  /** the resolving range of an agarose gel at a% (Sambrook & Russell 2001 Table 5-1, interpolated in log size) → [lo, hi] bp */
  function agaroseRange(a) {
    const T = AGAROSE; if (a <= T[0][0]) return [T[0][1], T[0][2]]; if (a >= T[T.length - 1][0]) return [T[T.length - 1][1], T[T.length - 1][2]];
    let i = 0; while (T[i + 1][0] < a) i++;
    const f = (a - T[i][0]) / (T[i + 1][0] - T[i][0]), lg = (x, y) => Math.pow(10, Math.log10(x) + f * (Math.log10(y) - Math.log10(x)));
    return [lg(T[i][1], T[i + 1][1]), lg(T[i][2], T[i + 1][2])];
  }
  /** relative migration (0 the well, 1 the dye front), log-linear in size inside the resolving range (Helling, Goodman & Boyer 1974);
      sizes outside it are pressed against the range's ends (0.02–0.1 above, 0.9–0.98 below) */
  function migrate(bp, lo, hi) {
    const y = (Math.log10(hi) - Math.log10(bp)) / (Math.log10(hi) - Math.log10(lo));
    return 0.1 + 0.8 * Math.max(-0.1, Math.min(1.1, y));
  }
  function runDigest(m, env) {
    const codes = [], out = {};
    const s = toDNA(clean(m.seq)), L = s.length, circ = !!m.circular;
    out.length = L;
    if (/[^ACGT]/.test(s)) codes.push('ambiguous');
    const own = {}; for (const x of m.custom || []) if (isObj(x)) { const st = toDNA(clean(x.site)); own[x.name] = [st, x.cut, x.cut2 === undefined ? st.length - x.cut : x.cut2]; }
    const enz = m.enzymes.map(n => ({ name: n, def: own[n] || ENZ[n] }));
    const met = m.dam || m.dcm ? methylated(s, !!m.dam, !!m.dcm) : null;
    const all = findSites(s, enz.map(z => z.def), circ, met, codes), sites = all.filter(x => !x.blocked);
    out.nSites = sites.length; out.nBlocked = all.length - sites.length;
    if (out.nBlocked) codes.push('methylation-blocked');
    const cuts = [...new Set(sites.map(x => x.cut).filter(Number.isFinite))].sort((x, y) => x - y);
    let frags;
    if (!cuts.length) frags = [L];
    else if (circ) frags = cuts.map((c, i) => (i + 1 < cuts.length ? cuts[i + 1] - c : L - c + cuts[0]));
    else { const bd = [0, ...cuts, L]; frags = []; for (let i = 0; i + 1 < bd.length; i++) if (bd[i + 1] > bd[i]) frags.push(bd[i + 1] - bd[i]); }
    if (!cuts.length) codes.push(circ ? 'uncut-circle' : 'uncut');
    out.nFragments = frags.length; out.fragments = frags; out.fragmentsSorted = frags.slice().sort((x, y) => y - x);
    // the gel
    let ag = num(m.agarose, env, 1);
    if (!(ag >= 0.3 && ag <= 2)) { codes.push('agarose-range'); ag = Math.min(2, Math.max(0.3, Number.isFinite(ag) ? ag : 1)); }
    const [lo, hi] = agaroseRange(ag), mig = out.fragmentsSorted.map(f => migrate(f, lo, hi));
    out.outOfRange = out.fragmentsSorted.filter(f => f < lo || f > hi).length;
    if (out.outOfRange) codes.push('gel-range');
    let bands = 0, last = -1; for (const y of mig) { if (last < 0 || y - last >= 0.01) bands++; last = y; }   // bands closer than 1 % of the gel merge
    out.bands = bands;
    const lad = m.ladder || '1kb';
    out.gel = drawGel(out.fragmentsSorted, mig, lad, lo, hi, circ && !cuts.length);
    out.map = drawMap(L, circ, sites, enz, (Array.isArray(m.features) ? m.features : []).filter(isObj).map(f => ({ a: num(f.start, env, NaN), b: num(f.end, env, NaN), key: f.key, minus: f.strand === '-' })));
    out.valid = 1;
    const at = (arr, i) => (Number.isInteger(i) && i < arr.length ? arr[i] : NaN);
    const ARG = {
      sitePos: i => at(sites.map(x => x.pos), i), cutPos: i => at(sites.map(x => x.cut), i), siteEnzyme: i => at(sites.map(x => x.e), i),
      fragment: i => at(frags, i), fragmentSorted: i => at(out.fragmentsSorted, i), migration: i => at(mig, i),
      overhang: i => (Number.isInteger(i) && i < enz.length ? enz[i].def[2] - enz[i].def[1] : NaN), nSitesOf: i => (Number.isInteger(i) && i < enz.length ? sites.filter(x => x.e === i).length : NaN),
    };
    return { out, codes, ARG, sites, frags };
  }
  function drawGel(frags, mig, lad, lo, hi, supercoiled) {
    const lanes = lad !== 'none' ? 2 : 1, sc = C.scene([-2, lanes * 3, -10.4, 0.8]);
    for (let l = 0; l < lanes; l++) sc.poly([l * 3, 0.4, l * 3 + 2, 0.4, l * 3 + 2, 0, l * 3, 0], { c: 'muted', closed: true });
    if (lad !== 'none') for (const bp of LADDER[lad]) { const y = -10 * migrate(bp, lo, hi); sc.seg(0.1, y, 1.9, y, { c: 'muted', w: 2 }); sc.txt(-0.2, y, { v: bp, c: 'muted', anchor: 'end' }); }
    const x0 = lad !== 'none' ? 3 : 0;
    frags.slice(0, 300).forEach((f, i) => { const y = -10 * mig[i]; sc.seg(x0 + 0.1, y, x0 + 1.9, y, { c: supercoiled ? 'warn' : f < lo || f > hi ? 'muted' : 'hi', w: 3 }); });
    return sc.done();
  }
  function drawMap(L, circ, sites, enz, feats) {
    const name = x => String(enz[x.e].name).slice(0, 64);
    if (!circ) {
      const sc = C.scene([-0.05 * L, 1.05 * L, -2.4, 2]);
      sc.seg(0, 0, L, 0, { c: 'base', w: 3 });
      feats.slice(0, 16).forEach(f => { if (!(f.a >= 1 && f.b <= L && f.a <= f.b)) return; const a = f.a - 1, b = f.b, y = -0.9, t = Math.min(0.3 * (b - a), 0.02 * L);
        sc.poly(f.minus ? [b, y - 0.25, a + t, y - 0.25, a, y, a + t, y + 0.25, b, y + 0.25] : [a, y - 0.25, b - t, y - 0.25, b, y, b - t, y + 0.25, a, y + 0.25], { c: 'info', fill: true, closed: true });
        sc.txt((a + b) / 2, y - 0.6, { key: f.key, c: 'info', anchor: 'middle' }); });
      sites.slice(0, 300).forEach((x, i) => { if (!Number.isFinite(x.cut)) return; sc.seg(x.cut, -0.3, x.cut, 0.3, { c: 'bad', w: 2 }); sc.txt(x.cut, 0.5 + (i % 3) * 0.4, { s: name(x), c: 'base', anchor: 'middle' }); });
      sc.txt(0, -2.1, { v: 1, c: 'muted', anchor: 'start' }); sc.txt(L, -2.1, { v: L, c: 'muted', anchor: 'end' });
      return sc.done();
    }
    const sc = C.scene([-1.7, 1.7, -1.7, 1.7]), pts = [];
    for (let i = 0; i <= 72; i++) { const t = i / 72 * 2 * Math.PI; pts.push(Math.sin(t), Math.cos(t)); }
    sc.poly(pts, { c: 'base', closed: true });
    feats.slice(0, 16).forEach(f => { if (!(f.a >= 1 && f.b <= L && f.a <= f.b)) return; const arc = []; const n = Math.max(2, Math.ceil((f.b - f.a + 1) / L * 72));
      for (let i = 0; i <= n; i++) { const t = ((f.a - 1) + (f.b - f.a + 1) * i / n) / L * 2 * Math.PI; arc.push(0.85 * Math.sin(t), 0.85 * Math.cos(t)); }
      sc.poly(arc, { c: 'info', closed: false }); const tm = ((f.a + f.b) / 2) / L * 2 * Math.PI; sc.txt(0.62 * Math.sin(tm), 0.62 * Math.cos(tm), { key: f.key, c: 'info', anchor: 'middle' }); });
    sites.slice(0, 300).forEach(x => { if (!Number.isFinite(x.cut)) return; const t = x.cut / L * 2 * Math.PI, sx = Math.sin(t), cy = Math.cos(t); sc.seg(0.9 * sx, 0.9 * cy, 1.1 * sx, 1.1 * cy, { c: 'bad', w: 2 }); sc.txt(1.3 * sx, 1.3 * cy, { s: name(x), c: 'base', anchor: 'middle' }); });
    sc.txt(0, 0, { v: L, c: 'muted', anchor: 'middle' });
    return sc.done();
  }

  /* ======================= protein ======================= */
  // other pK sets (Kozlowski 2016 Biol Direct 11:55, Table 1): [N-terminus, C-terminus, K, R, H, D, E, C, Y]
  const PK_SETS = { emboss: [8.6, 3.6, 10.8, 12.5, 6.5, 3.9, 4.1, 8.5, 10.1], lehninger: [9.69, 2.34, 10.5, 12.4, 6.0, 3.86, 4.25, 8.33, 10.0],
    solomon: [9.6, 2.4, 10.5, 12.5, 6.0, 3.9, 4.3, 8.3, 10.1], sillero: [8.2, 3.2, 10.4, 12.0, 6.4, 4.0, 4.5, 9.0, 10.0] };
  /** the net charge at pH (Henderson–Hasselbalch for each group); Bjellqvist: terminal pKs depend on the terminal residue */
  function chargeAt(cnt, nt, ct, ph, set) {
    const S2 = set && set !== 'bjellqvist' ? PK_SETS[set] : null;
    const P = S2 ? { K: S2[2], R: S2[3], H: S2[4] } : PK_POS, N = S2 ? { D: S2[5], E: S2[6], C: S2[7], Y: S2[8] } : PK_NEG;
    const pn = S2 ? S2[0] : PK_N[nt] || 7.5, pc = S2 ? S2[1] : PK_C[ct] || 3.55;
    let pos = 1 / (Math.pow(10, ph - pn) + 1), neg = 1 / (Math.pow(10, pc - ph) + 1);
    for (const a of Object.keys(P)) pos += (cnt[a] || 0) / (Math.pow(10, ph - P[a]) + 1);
    for (const a of Object.keys(N)) neg += (cnt[a] || 0) / (Math.pow(10, N[a] - ph) + 1);
    return pos - neg;
  }
  function runProtein(m, env) {
    const codes = [], out = {};
    let s = clean(m.seq); if (s.endsWith('*')) s = s.slice(0, -1);
    const L = s.length; out.length = L;
    if (!L) { codes.push('empty'); return { out: { valid: 0, length: 0 }, codes }; }
    const cnt = {}; for (const x of s) cnt[x] = (cnt[x] || 0) + 1;
    const amb = /[BZJX]/.test(s);
    if (amb) codes.push('ambiguous');
    const mass = (T, w) => { let t = 0; for (const x of s) { if (T[x] !== undefined) t += T[x]; else if (PAIR[x]) t += (T[PAIR[x][0]] + T[PAIR[x][1]]) / 2; else return NaN; } return t - (L - 1) * w; };
    out.mwAvg = mass(MW_AVG, WATER); out.mwMono = mass(MW_MONO, WATER_MONO);
    const nt = s[0], ct = s[L - 1];
    let lo = 0, hi = 14;
    const pk = m.pk || 'bjellqvist';
    for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (chargeAt(cnt, nt, ct, mid, pk) > 0) lo = mid; else hi = mid; }
    out.pI = (lo + hi) / 2;
    const ph = num(m.ph, env, 7);
    out.charge = chargeAt(cnt, nt, ct, ph, pk);
    out.gravy = [...s].every(x => KD[x] !== undefined) ? [...s].reduce((t, x) => t + KD[x], 0) / L : NaN;
    out.eps280 = 5500 * (cnt.W || 0) + 1490 * (cnt.Y || 0); out.eps280ox = out.eps280 + 125 * Math.floor((cnt.C || 0) / 2);
    out.abs01 = out.eps280 / out.mwAvg; out.abs01ox = out.eps280ox / out.mwAvg;
    const fr = a => (cnt[a] || 0) / L;
    out.aliphatic = 100 * (fr('A') + 2.9 * fr('V') + 3.9 * (fr('I') + fr('L')));
    out.aromaticity = fr('F') + fr('W') + fr('Y');
    let ins = 0, okI = true; for (let i = 0; i + 1 < L; i++) { const r2 = DIWV[s[i]]; if (!r2 || r2[s[i + 1]] === undefined) { okI = false; break; } ins += r2[s[i + 1]]; }
    out.instability = okI ? 10 / L * ins : NaN;
    out.phGrid = grid(0, 14, 201); out.chargeCurve = out.phGrid.map(p => chargeAt(cnt, nt, ct, p, pk));
    let w = Math.round(num(m.window, env, 9));
    if (!(w >= 1 && w <= L)) { codes.push('window-range'); w = Math.min(L, 9); }
    const hx = [], hy = [];
    for (let i = 0; i + w <= L; i++) { let t = 0, ok = true; for (let j = 0; j < w; j++) { const v = KD[s[i + j]]; if (v === undefined) { ok = false; break; } t += v; } hx.push(i + (w + 1) / 2); hy.push(ok ? t / w : NaN); }
    out.hydroX = C.thin(hx, 2000); out.hydropathy = C.thin(hy, 2000);
    // the helical wheel: 100° per residue (α-helix), the hydrophobic moment μH = |Σ h e^{iθ}| / n (Eisenberg et al. 1984)
    const nw = Math.max(3, Math.min(36, Math.round(num(m.wheel, env, 18)), L));
    let mx = 0, my = 0, okW = true;
    const sc = C.scene([-1.6, 1.6, -1.6, 1.6]);
    for (let i = 0; i < nw; i++) {
      const t = i * 100 * Math.PI / 180, x = s[i], h = EIS[x], r = 1 + 0.12 * Math.floor(i / 18);
      if (h === undefined) okW = false; else { mx += h * Math.cos(t); my += h * Math.sin(t); }
      sc.circ(r * Math.sin(t), r * Math.cos(t), 0.13, { c: KD[x] > 0 ? 'hi' : KD[x] !== undefined ? 'info' : 'muted', fill: KD[x] > 0 });
      sc.txt(r * Math.sin(t), r * Math.cos(t), { s: x, c: 'base', anchor: 'middle' });
      if (i) { const t0 = (i - 1) * 100 * Math.PI / 180, r0 = 1 + 0.12 * Math.floor((i - 1) / 18); sc.seg(r0 * Math.sin(t0) * 0.85, r0 * Math.cos(t0) * 0.85, r * Math.sin(t) * 0.85, r * Math.cos(t) * 0.85, { c: 'muted' }); }
    }
    out.muH = okW ? Math.hypot(mx, my) / nw : NaN;
    if (okW && (mx || my)) { const mm = Math.hypot(mx, my); sc.seg(0, 0, 0.7 * my / mm, 0.7 * mx / mm, { c: 'ok', arrow: true, w: 2 }); }
    out.wheel = sc.done();
    out.valid = 1;
    return { out, codes, ARG: { aaCount: a => cnt[a] || 0, aaFrac: a => (cnt[a] || 0) / L } };
  }

  /* ======================= crispr ======================= */
  // nucleases: the PAM (IUPAC), its side of the protospacer (3: SpCas9 type, 5: Cas12a), the protospacer length, the default seed and
  // the cut, counted on the protospacer's strand: Cas9 blunt 3 bp from the PAM (Jinek et al. 2012; Cong et al. 2013); SpCas9-NG (Nishimasu
  // et al. 2018); SaCas9 NNGRRT, 21 nt (Ran et al. 2015); Cas12a TTTV, 23 nt, staggered after nt 18 (PAM strand) and 23 (target strand),
  // a 5-nt 5′ overhang (Zetsche et al. 2015)
  const NUCLEASES = { SpCas9: ['NGG', 3, 20, 12, -3, -3], SpCas9NG: ['NG', 3, 20, 12, -3, -3], SaCas9: ['NNGRRT', 3, 21, 12, -3, -3], Cas12a: ['TTTV', 5, 23, 8, 18, 23] };
  function runCrispr(m, env) {
    const codes = [], out = {};
    const s = toDNA(clean(m.seq)), L = s.length, rc = revcomp(s);
    const [pam, side, g0, seed0, k1, k2] = NUCLEASES[m.nuclease || 'SpCas9'];
    const g = Math.round(num(m.guideLen, env, g0)), sl = Math.round(num(m.seedLen, env, seed0)), lp = pam.length;
    const gcMin = num(m.gcMin, env, 0.4), gcMax = num(m.gcMax, env, 0.8), target = num(m.target, env, Math.ceil(L / 2));
    if (!(g >= 15 && g <= 30) || !(sl >= 1 && sl <= g)) { codes.push('guide-range'); return { out: { valid: 0 }, codes }; }
    if (/[^ACGT]/.test(s)) codes.push('ambiguous');
    const re = siteRe(pam), gs = [];
    for (const [str, plus] of [[s, true], [rc, false]]) {
      for (let p = 0; p + lp <= L; p++) {
        re.lastIndex = p; const mt = re.exec(str); if (!mt) break; p = mt.index;
        const a = side === 3 ? p - g : p + lp;   // the protospacer [a, a + g) on this strand
        if (a < 0 || a + g > L) continue;
        const proto = str.substr(a, g);
        if (/[^ACGT]/.test(proto)) continue;
        const c1 = side === 3 ? p + k1 : p + lp + k1, c2 = side === 3 ? p + k2 : p + lp + k2;   // cuts before these indices of this strand
        const top = plus ? c1 : L - c1, bot = plus ? c2 : L - c2;
        const sd = side === 3 ? proto.slice(g - sl) : proto.slice(0, sl);
        gs.push({ plus, cut: top, cut2: bot, proto, pam: str.substr(p, lp), seed: sd, gc: [...proto].filter(x => x === 'G' || x === 'C').length / g, polyT: /TTTT/.test(proto) ? 1 : 0 });
        if (gs.length > 5000) break;
      }
    }
    if (gs.length > 5000) codes.push('guides-many');
    const seen = new Map(); for (const x of gs) seen.set(x.seed, (seen.get(x.seed) || 0) + 1);
    for (const x of gs) { x.hits = seen.get(x.seed) - 1; x.good = x.gc >= gcMin && x.gc <= gcMax && !x.polyT && !x.hits; }
    gs.sort((x, y) => x.cut - y.cut || (x.plus ? 0 : 1) - (y.plus ? 0 : 1));
    out.nGuides = gs.length; out.nPlus = gs.filter(x => x.plus).length; out.nMinus = gs.length - out.nPlus; out.nGood = gs.filter(x => x.good).length;
    out.cuts = gs.map(x => x.cut);
    // the distance from a cut (after base c) to the target base t, in bases between them: 0 = the cut touches the target
    const dist = c => (target <= c ? c - target : target - c - 1);
    let best = null; for (const x of gs) if (!best || dist(x.cut) < dist(best.cut)) best = x;
    if (!(target >= 1 && target <= L)) codes.push('target-range');
    if (!gs.length) codes.push('no-pam');
    out.nearestCut = best ? best.cut : NaN; out.nearestDist = best ? dist(best.cut) : NaN; out.nearestStrand = best ? (best.plus ? 1 : -1) : NaN;
    out.nearestGc = best ? best.gc : NaN; out.nearestPolyT = best ? best.polyT : NaN; out.nearestSeedHits = best ? best.hits : NaN;
    out.guides = drawGuides(L, gs, best, target, side);
    out.valid = 1;
    const at = (k, i) => (Number.isInteger(i) && i < gs.length ? (k === 'plus' ? (gs[i].plus ? 1 : -1) : gs[i][k]) : NaN);
    return { out, codes, ARG: { guideCut: i => at('cut', i), guideStrand: i => at('plus', i), guideGc: i => at('gc', i), guideSeedHits: i => at('hits', i) } };
  }
  function drawGuides(L, gs, best, target, side) {
    const sc = C.scene([-0.04 * L, 1.04 * L, -3.2, 3.2]);
    sc.seg(0, 0, L, 0, { c: 'base', w: 3 });
    sc.txt(0, -0.5, { v: 1, c: 'muted', anchor: 'start' }); sc.txt(L, -0.5, { v: L, c: 'muted', anchor: 'end' });
    if (target >= 1 && target <= L) sc.pt(target - 0.5, 0, { r: 5, c: 'warn' });
    gs.slice(0, 900).forEach((x, i) => {
      const y = (x.plus ? 1 : -1) * (0.6 + (i % 4) * 0.35), n = x.proto.length;
      const a = side === 3 ? (x.plus ? x.cut + 3 - n : x.cut - 3) : x.plus ? x.cut - 18 : x.cut + 18 - n;
      sc.seg(x.plus ? a : a + n, y, x.plus ? a + n : a, y, { c: x === best ? 'hi' : x.good ? 'ok' : 'muted', w: x === best ? 3 : 1.5, arrow: true });
    });
    if (best) { sc.seg(best.cut, -0.3, best.cut, 0.3, { c: 'bad', w: 2 }); sc.txt(L / 2, 2.8, { s: best.proto + ' ' + best.pam, c: 'hi', anchor: 'middle' }); }
    return sc.done();
  }

  /* ---------- run: the spec's outputs ---------- */
  const RUN = { translate: runTranslate, mutate: runMutate, divergence: runDivergence, tm: runTm, align: runAlign, dotplot: runDotplot, digest: runDigest, protein: runProtein, crispr: runCrispr };
  function run(spec, env, o) {
    const m = (spec && spec.model && typeof spec.model === 'object' && spec.model) || {}, seed = (o && o.seed) || 1;
    let res;
    // a model the checker refuses never runs: a missing, empty or foreign sequence gives NaN and the code `empty` / `invalid`
    const bad = has(SEQS, m.mode) ? SEQS[m.mode].find(([f, al, mx, mn, req]) => (req || m[f] !== undefined) && seqCheck(m[f], f, m.mode === 'align' ? (m.alphabet === 'dna' ? 'nuc' : m.alphabet === 'protein' ? 'prot' : 'any') : al, mx, mn, () => {}) === null) : null;
    if (bad) res = { out: { valid: 0 }, codes: [typeof m[bad[0]] === 'string' && !clean(m[bad[0]]).length ? 'empty' : 'invalid'] };
    else try { res = RUN[m.mode](m, env || {}, seed); } catch (e) { res = { out: { valid: 0 }, codes: ['error'] }; }
    const out = {};
    for (const op of (spec && Array.isArray(spec.outputs) ? spec.outputs : [])) {
      if (!op || typeof op.id !== 'string') continue;
      const d = has(OUTS, m.mode) && typeof op.of === 'string' && has(OUTS[m.mode], op.of) ? OUTS[m.mode][op.of] : null;
      let v;
      if (d && d[1] && res.ARG && res.ARG[op.of]) { try { v = res.ARG[op.of](op.arg); } catch (e) { v = undefined; } }
      else v = d ? res.out[op.of] : undefined;
      if (v === undefined || (d && d[0] === 'scalar' && typeof v !== 'number')) v = d && d[0] === 'series' ? [] : d && d[0] === 'scene' ? { view: [0, 1, 0, 1], items: [] } : NaN;
      out[op.id] = v;
    }
    return { out, codes: [...new Set(res.codes || [])] };
  }
  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, scenes: true });
  engine.workerSource = C.workerSource(noemaLibSeqModule, 'NoemaLibSeq', { kit: true });
  root.NoemaLibSeq = Object.freeze({
    id: ID, MODES, SPEC, TABLES, OUTS, NCBI, ENZ, MATRIX, NUCLEASES, checkSpec, exprs, keys, run, engine: Object.freeze(engine), simEngine,
    table: { model: { $by: 'mode', $cases: Object.fromEntries(MODES.map(md => { const t = Object.assign({}, TABLES[md], ...SEQS[md].map(x => ({ [x[0]]: 'seq' + (x[4] ? '!' : '') }))), n = NESTED[md]; if (n && t[n[0]] && t[n[0]].$list && t[n[0]].$list.$obj) t[n[0]] = Object.assign({}, t[n[0]], { $list: { $obj: Object.assign({}, t[n[0]].$list.$obj, { [n[1]]: 'seq' }) } }); return [md, t]; })) }, outputs: { $by: 'mode', $cases: Object.fromEntries(MODES.map(md => [md, Object.keys(OUTS[md]).reduce((a, k) => ((a[OUTS[md][k][0]] = a[OUTS[md][k][0]] || []).push(k), a), {})])) }, fields: { arg: 'any' } },   // the form of the activity author (46_lib_schema.js)
    // the pieces, for tests
    clean, revcomp, translate, aaOf, gcFrac, tmNN, saltCorr, dp, encOf, rscuOf, synSites, synDiffs, compBest, hairpinBest, bindSites, nnDG, chargeAt, findSites, agaroseRange, migrate, bandOf, traceback,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
