/* seq@1 (src/engines/seq/seq.js, docs/library/seq.md) against published values and Biopython 1.88 (Cock et al. 2009), the test
   oracle the values were generated with (Biopython is not needed to run this file):
   1. alphabets, cleaning, reverse complement, GC (three conventions), masses; 2. the NCBI genetic codes, ambiguous codons, starts,
   context-dependent and incomplete stops; 3. ORFs in six frames, codon usage (RSCU, ENC, CAI); 4. mutations and HGVS names;
   5. divergence (JC69, K2P, Nei–Gojobori); 6. melting temperature (Wallace, Marmur–Doty, SantaLucia 1998 / 2004, the salt corrections
   of Schildkraut, SantaLucia, Owczarzy 2004 and 2008), primer checks, in-silico PCR; 7. alignment (Needleman–Wunsch, Smith–Waterman,
   Gotoh, semi-global, banding, Karlin–Altschul, shuffles); 8. dot plots; 9. restriction digests, methylation, gels; 10. proteins (mass,
   pI with five pK sets, ε280, GRAVY, instability); 11. CRISPR guides; 12. checks, the golden SPEC of the former Python twin, adapter, Worker, speed;
   13. the reference activity sickle-codon.   Usage: node tests/lib_seq.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibSeq = ENGINES.mod('seq@1');
const Q = NoemaLibSeq;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const spec = (model, outs) => ({ format: 'noema.sim-spec/v1', engine: 'seq@1', model, outputs: outs.map(([id, kind, of, arg]) => ({ id, kind, of, ...(arg !== undefined ? { arg } : {}) })) });
const sc = (...names) => names.map(x => [x, 'scalar', x]);
const R = (model, outs, env) => { const s = spec(model, outs), r = Q.run(s, env || {}, { seed: 1 }); return { o: r.out, c: r.codes, P: Q.checkSpec(s).filter(p => p.level === 'error') }; };
const letters = scene => scene.items.filter(i => typeof i.s === 'string' && i.s.length === 1).map(i => i.s).join('');
const rows = scene => { const l = letters(scene); let a = '', b = ''; for (let i = 0; i < l.length; i += 2) { a += l[i]; b += l[i + 1]; } return a + '/' + b; };
const texts = scene => scene.items.filter(i => typeof i.s === 'string').map(i => i.s);

ok(Q.id === 'seq@1' && Object.isFrozen(Q) && Q.engine.id === 'seq@1' && typeof Q.engine.workerSource === 'string' && Q.MODES.length === 9, 'NoemaLibSeq: id, frozen API, 9 modes, engine with workerSource');

// ---------- 1. alphabets ----------
ok(Q.revcomp('ATGRNYTTAA') === 'TTAARNYCAT', 'S1 reverse complement keeps IUPAC codes: ATGRNYTTAA → TTAARNYCAT (Biopython)');
ok(Q.clean('>seq1 a header\nacg t12\n  >another\nTTA 3') === 'ACGTTTA', 'cleaning: FASTA headers, spaces, digits dropped, upper case');
{
  const g = h => R({ mode: 'translate', seq: 'ATGCSWNN', gc: h }, sc('gc')).o.gc;
  ok(g('remove') === 0.5 && g('ignore') === 0.375 && g('weighted') === 0.5, `S5 GC of ATGCSWNN: remove ${g('remove')}, ignore ${g('ignore')}, weighted ${g('weighted')} (0.5 / 0.375 / 0.5, Biopython gc_fraction)`);
  const m = R({ mode: 'translate', seq: 'ATGC' }, sc('mwSS', 'mwOH')).o;
  ok(near(m.mwSS, 1253.80, 0.02) && near(m.mwOH, 1173.84, 0.02), `S18 ssDNA ATGC: ${m.mwSS.toFixed(2)} Da with a 5′ phosphate (Biopython 1253.80), ${m.mwOH.toFixed(2)} Da 5′-OH (OligoCalc 1173.84)`);
  const p = R({ mode: 'translate', seq: 'GAATTC' }, sc('palindrome')).o.palindrome + R({ mode: 'translate', seq: 'GAATTA' }, sc('palindrome')).o.palindrome;
  ok(p === 1, 'GAATTC is its own reverse complement (palindrome 1), GAATTA is not');
  const w = R({ mode: 'translate', seq: 'GGGGGCCCCC'.repeat(10), window: 10 }, [['x', 'series', 'winPos'], ['s', 'series', 'skewWin'], ['c', 'series', 'cumSkew']]).o;
  ok(w.x.length === 10 && w.s.every(v => v === 0) && w.c[9] === 0, 'GC skew (G − C)/(G + C) in windows of 10: 0 for GGGGGCCCCC (Lobry 1996)');
}

// ---------- 2. genetic codes ----------
{
  const ids = Object.keys(Q.NCBI).map(Number);
  ok(ids.length === 27 && JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]) && ids.every(i => Q.NCBI[i][0].length === 64 && Q.NCBI[i][1].length === 64), 'all 27 NCBI genetic codes (1–6, 9–16, 21–33), 64 codons each with their starts (gc.prt via Biopython 1.88)');
  ok(Q.NCBI[1][0] === 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG' && Q.NCBI[2][0].slice(44, 48) === 'SS**', 'table 1 is the standard code; table 2 reads AGA, AGG as stops');
  const t = Q.translate('ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG', 0, 1, {}), t2 = Q.translate('ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG', 0, 1, { toStop: true });
  ok(t === 'MAIVMGR*KGAR*' && t2 === 'MAIVMGR*', `S2 translation (table 1): ${t}; to the first stop ${t2} (Biopython Tutorial §3)`);
  ok(Q.translate('ATAAGATGA', 0, 1, {}) === 'IR*' && Q.translate('ATAAGATGA', 0, 2, {}) === 'M*W', 'S3 ATAAGATGA: IR* in table 1, M*W in table 2 (vertebrate mitochondria)');
  const cds = letters(R({ mode: 'translate', seq: 'GTGAAATAA', table: 11, cds: true }, [['t', 'scene', 'translation']]).o.t), not = letters(R({ mode: 'translate', seq: 'GTGAAATAA', table: 11 }, [['t', 'scene', 'translation']]).o.t);
  ok(cds === 'MK*' && not === 'VK*', `S4 GTG start in table 11: ${cds} as a CDS, ${not} elsewhere (NCBI convention)`);
  const amb = ['CTN', 'TTR', 'MGR', 'YTR', 'TAR', 'RAY', 'SAR', 'MTH', 'NNN'].map(c => Q.aaOf(c, 1, false)).join('');
  ok(amb === 'LLRL*BZJX', `ambiguous codons resolved when unanimous: CTN TTR MGR YTR TAR → LLRL*, RAY → B, SAR → Z, MTH → J, NNN → X (${amb})`);
  const c27 = Q.translate('ATGTGAGGGTGA', 0, 27, {}), c31 = Q.translate('ATGTAAGGGTAA', 0, 31, {}), c28 = Q.translate('ATGTAAGGGTAA', 0, 28, {});
  ok(c27 === 'MWG*' && c31 === 'MEG*' && c28 === 'MQG*', `context-dependent stops (Swart et al. 2016): UGA is W inside and a stop at the end in table 27 (${c27}); UAA E in 31 (${c31}), Q in 28 (${c28})`);
  const inc = R({ mode: 'translate', seq: 'ATGAAATTTCCCTA', table: 2, cds: true }, sc('cdsValid', 'incompleteStop'));
  ok(inc.o.incompleteStop === 1 && inc.c.includes('incomplete-stop') && inc.o.cdsValid === 0, 'a mitochondrial CDS ending in TA: the incomplete stop completed by poly(A) is reported (incomplete-stop)');
  const bad = R({ mode: 'translate', seq: 'ATGTAAGGGTTT', cds: true }, sc('cdsValid'));
  ok(bad.o.cdsValid === 0 && bad.c.includes('cds-internal-stop') && bad.c.includes('cds-no-stop'), 'CDS check: an internal stop and no final stop are both reported');
  const fr = [1, 2, 3, -1, -2, -3].map(f => R({ mode: 'translate', seq: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG', frame: 'k' }, sc('protLength', 'leftover'), { k: f }).o);
  ok(fr[0].leftover === 0 && fr[1].leftover === 2 && fr[2].leftover === 1 && fr[3].leftover === 0 && fr.every(x => x.protLength >= 9), `six frames (−1 starts at the 3′ end of the input, NCBI ORFfinder): leftover bases ${fr.map(x => x.leftover)}`);
  const sp = R({ mode: 'translate', seq: 'ATGGCGTAAGTTTTTTTTCAGAGAATAA', exons: [{ start: 1, end: 5 }, { start: 22, end: 28 }], cds: true }, sc('splicedLength', 'nIntrons', 'canonicalIntrons', 'protLength', 'cdsValid'));
  ok(sp.o.splicedLength === 12 && sp.o.nIntrons === 1 && sp.o.canonicalIntrons === 1 && sp.o.cdsValid === 1 && sp.o.protLength === 3, 'splicing given exons: a GT…AG intron removed, the spliced CDS ATGGC|AGAATAA → MAE* is valid');
}

// ---------- 3. ORFs and codon usage ----------
{
  const o = R({ mode: 'translate', seq: 'CCATGAAATTTTAGCC', minLen: 12, partial: false }, [...sc('nOrfs'), ['a', 'scalar', 'orfStart', 0], ['b', 'scalar', 'orfEnd', 0], ['f', 'scalar', 'orfFrame', 0], ['c', 'scalar', 'orfCodons', 0], ['m', 'scene', 'orfMap']]).o;
  ok(o.nOrfs === 1 && o.a === 3 && o.b === 14 && o.f === 3 && o.c === 3 && o.m.items.some(i => i.k === 'poly'), `S20 ORFs of ≥ 12 nt (stop included) in CCATGAAATTTTAGCC: one, frame +3, nt ${o.a}–${o.b}, ${o.c} codons (MKF)`);
  const r = R({ mode: 'translate', seq: 'GGCTAAAATTTCATGG', minLen: 12, partial: false }, [...sc('nOrfs'), ['a', 'scalar', 'orfStart', 0], ['b', 'scalar', 'orfEnd', 0], ['f', 'scalar', 'orfFrame', 0]]).o;
  ok(r.nOrfs === 1 && r.a === 14 && r.b === 3 && r.f === -3, 'the same ORF on the reverse strand: frame −3, from nt 14 down to 3 (input coordinates)');
  const p = R({ mode: 'translate', seq: 'CCATGAAATTTCCC', minLen: 9 }, [...sc('nOrfs'), ['x', 'scalar', 'orfPartial', 0]]).o;
  ok(p.nOrfs >= 1 && p.x === 2, 'an ORF that runs off the 3′ end is kept and flagged partial (2 = open at 3′)');
  const one = 'GCT'.repeat(5) + 'TGT'.repeat(5) + 'GAT'.repeat(5) + 'GAA'.repeat(5) + 'TTT'.repeat(5) + 'GGT'.repeat(5) + 'CAT'.repeat(5) + 'ATT'.repeat(5) + 'AAA'.repeat(5) + 'TTA'.repeat(5) + 'ATG' + 'AAT'.repeat(5) + 'CCT'.repeat(5) + 'CAA'.repeat(5) + 'CGT'.repeat(5) + 'TCT'.repeat(5) + 'ACT'.repeat(5) + 'GTT'.repeat(5) + 'TGG' + 'TAT'.repeat(5);
  const all = []; for (const a of 'TCAG') for (const b of 'TCAG') for (const c of 'TCAG') all.push(a + b + c);
  const even = all.filter(x => !['TAA', 'TAG', 'TGA'].includes(x)).join('').repeat(3);
  const e1 = R({ mode: 'translate', seq: one }, sc('enc')).o.enc, e2 = R({ mode: 'translate', seq: even }, sc('enc')).o.enc;
  ok(e1 === 20 && e2 === 61, `ENC (Wright 1990): one codon per amino acid → ${e1} (20); every sense codon equally → ${e2} (61)`);
  const ref = all.map(c => (c === 'GCT' || c === 'AAA' ? 10 : 1));
  const cai = cd => R({ mode: 'translate', seq: cd, refUsage: ref }, sc('cai')).o.cai;
  ok(near(cai('GCTAAAGCTAAA'), 1, 1e-12) && near(cai('GCCAAG'), Math.sqrt(0.1 * 0.1), 1e-12), 'CAI (Sharp & Li 1987): the reference\'s preferred codons → 1; GCC, AAG with w = 1/10 each → 0.1');
  const rs = R({ mode: 'translate', seq: 'GCTGCTGCCGCA' }, [['a', 'scalar', 'rscu', 'GCT'], ['b', 'scalar', 'rscu', 'GCG']]).o;
  ok(rs.a === 2 && rs.b === 0, 'RSCU (Sharp, Tuohy & Mosurski 1986): GCT used 2 of 4 Ala codons → 2.0, GCG unused → 0');
}

// ---------- 4. mutations ----------
{
  const mv = (cds, v) => { const r = R({ mode: 'mutate', cds, variants: [v] }, [['e', 'scalar', 'effect', 0], ['p', 'scalar', 'protPos', 0], ['n', 'scalar', 'newLength', 0], ['f', 'scalar', 'fsStop', 0], ['b', 'scalar', 'blosum', 0], ['h', 'scene', 'hgvs']]); return { ...r.o, names: texts(r.o.h).join(' '), codes: r.c }; };
  const c = 'ATGGGTTGGTAA';
  const a = mv(c, { kind: 'sub', pos: 5, alt: 'T' }), b = mv(c, { kind: 'sub', pos: 6, alt: 'C' }), d = mv(c, { kind: 'sub', pos: 9, alt: 'A' }), f = mv(c, { kind: 'del', pos: 4 });
  ok(a.e === 1 && a.names === 'c.5G>T p.(Gly2Val)' && a.b === -3, `S21 c.5G>T → ${a.names}, missense, BLOSUM62 G→V ${a.b}`);
  ok(b.e === 0 && b.names === 'c.6T>C p.(Gly2=)', `S21 c.6T>C → ${b.names}, synonymous`);
  ok(d.e === 2 && d.names === 'c.9G>A p.(Trp3*)', `S21 c.9G>A → ${d.names}, nonsense`);
  ok(f.e === 8 && f.names === 'c.5del p.(Gly2Valfs*?)', `S21 c.4delG → shifted 3′ to ${f.names} (HGVS 3′ rule), a frameshift with no stop in the sequence`);
  const k = 'ATGAAACTGAAAGGCTAA';
  const t = [mv(k, { kind: 'del', pos: 4, end: 6 }), mv(k, { kind: 'ins', pos: 6, alt: 'CAG' }), mv(k, { kind: 'dup', pos: 4, end: 6 }), mv(k, { kind: 'del', pos: 5 }), mv(k, { kind: 'sub', pos: 17, alt: 'C' }), mv(k, { kind: 'delins', pos: 7, end: 9, alt: 'TGG' }), mv(k, { kind: 'sub', pos: 2, alt: 'C' }), mv(k, { kind: 'ins', pos: 6, alt: 'A' })];
  const want = [[5, 'c.4_6del p.(Lys2del)'], [6, 'c.7_8insAGC p.(Lys2_Leu3insGln)'], [6, 'c.4_6dup p.(Lys2dup)'], [8, 'c.6del p.(Lys2Asnfs*2)'], [3, 'c.17A>C p.(*6Serext*?)'], [1, 'c.7_9delinsTGG p.(Leu3Trp)'], [4, 'c.2T>C p.(Met1?)'], [8, 'c.6dup p.(Leu3Thrfs*?)']];
  t.forEach((x, i) => ok(x.e === want[i][0] && x.names === want[i][1], `HGVS (den Dunnen et al. 2016) on ATG AAA CTG AAA GGC TAA: ${x.names} (effect ${x.e})`));
  ok(t[3].f === 2 && t[3].n === 2, 'the frameshift c.6del meets a new stop 2 codons on (fs*2): the protein is 2 residues long');
  const same = R({ mode: 'mutate', cds: c, variants: [{ kind: 'sub', pos: 5, alt: 'G' }, { kind: 'sub', pos: 99, alt: 'A' }] }, [['e', 'scalar', 'effect', 0], ['f', 'scalar', 'effect', 1]]);
  ok(same.o.e === 9 && same.o.f === 9 && same.c.includes('same-base') && same.c.includes('variant-range'), 'a substitution by the same base and a position beyond the CDS: effect 9 and the codes same-base, variant-range');
  const ts = R({ mode: 'mutate', cds: c, variants: [{ kind: 'sub', pos: 5, alt: 'A' }, { kind: 'sub', pos: 5, alt: 'C' }] }, sc('transitions', 'transversions')).o;
  ok(ts.transitions === 1 && ts.transversions === 1, 'transitions (G→A) and transversions (G→C) counted');
}

// ---------- 5. divergence ----------
{
  const d = R({ mode: 'divergence', a: 'ATGCTGAAACCC', b: 'ATGTTGAAGCCA', coding: true }, sc('p', 'jc', 'k2p', 'tsTv', 'S', 'Sd', 'Nd')).o;
  const P = 2 / 12, Qv = 1 / 12, k2 = -0.5 * Math.log(1 - 2 * P - Qv) - 0.25 * Math.log(1 - 2 * Qv);
  ok(d.p === 0.25 && near(d.jc, -0.75 * Math.log(1 - 4 * 0.25 / 3), 1e-12) && near(d.k2p, k2, 1e-12) && d.tsTv === 2, `p 0.25, JC69 d = −¾ ln(1 − 4p/3) = ${d.jc.toFixed(4)}, K2P ${d.k2p.toFixed(4)}, Ts/Tv 2 (Jukes & Cantor 1969; Kimura 1980)`);
  ok(near(d.S, 7 / 3, 1e-12) && d.Sd === 3 && d.Nd === 0, `Nei & Gojobori (1986): 3 synonymous differences (CTG→TTG, AAA→AAG, CCC→CCA), S = ${d.S.toFixed(3)} sites`);
  const sat = R({ mode: 'divergence', a: 'ACGT', b: 'CATG' }, sc('jc'));
  ok(Number.isNaN(sat.o.jc) && sat.c.includes('saturated'), 'p ≥ ¾: the JC distance is undefined → NaN and the code saturated');
}

// ---------- 6. melting temperature, primers, PCR ----------
{
  const L24 = 'AGCGGATAACAATTTCACACAGGA';
  const a = R({ mode: 'tm', seq: L24, na: 1000, c1: 250, c2: 250, saltCorr: 'none' }, sc('tmWallace', 'tmMarmur', 'tmNN', 'dH', 'dS')).o;
  ok(a.tmWallace === 68 && near(a.tmMarmur, 53.97, 0.01), `S6 ${L24}: Wallace ${a.tmWallace} °C (Wallace et al. 1979), Marmur–Doty ${a.tmMarmur.toFixed(2)} °C`);
  ok(near(a.dH, -184.4, 1e-9) && near(a.dS, -500.7, 1e-9) && near(a.tmNN, 73.28, 0.01), `S7 nearest neighbour (SantaLucia 1998), 1 M Na⁺, 250 nM each strand: ΔH ${a.dH.toFixed(1)}, ΔS ${a.dS.toFixed(1)}, Tm ${a.tmNN.toFixed(2)} °C (Biopython Tm_NN 73.28)`);
  const tm = (o) => R({ mode: 'tm', seq: L24, ...o }, sc('tmNN')).o.tmNN;
  const bio = [[{ na: 50, c1: 250, c2: 250, saltCorr: 'santalucia' }, 57.5298, 'SantaLucia 1998 entropy correction, 50 mM Na⁺ (S8 57.53)'],
    [{ na: 50, saltCorr: 'owczarzy2004' }, 53.5916, 'Owczarzy et al. 2004, 50 mM Na⁺'],
    [{ na: 50, mg: 1.5, dntp: 0.6, saltCorr: 'owczarzy2008' }, 60.0253, 'Owczarzy et al. 2008, 50 mM Na⁺, 1.5 mM Mg²⁺, 0.6 mM dNTP (the Primer3 defaults)'],
    [{ na: 50, mg: 10, saltCorr: 'owczarzy2008' }, 63.7458, 'Owczarzy 2008, 10 mM Mg²⁺ (Mg-dominated, R ≥ 6)'],
    [{ na: 50, mg: 3, saltCorr: 'owczarzy2008' }, 62.1798, 'Owczarzy 2008, 3 mM Mg²⁺ (the mixed regime 0.22 ≤ R < 6)'],
    [{ na: 50, saltCorr: 'schildkraut' }, 48.7326, 'Schildkraut & Lifson 1965, 16.6 log10[Na⁺]'],
    [{ na: 50, k: 20, tris: 10, mg: 2, dntp: 0.8, saltCorr: 'santalucia' }, 61.9935, 'SantaLucia with Na⁺ equivalents of K⁺, Tris and Mg²⁺ (von Ahsen et al. 2001)'],
    [{ na: 50, nn: 'santalucia2004', saltCorr: 'santalucia' }, 54.7456, 'SantaLucia & Hicks 2004 parameters']];
  for (const [o, v, what] of bio) { const t = tm(o); ok(near(t, v, 0.005), `Tm ${t.toFixed(4)} °C = Biopython 1.88 Tm_NN ${v}: ${what}`); }
  const s9 = R({ mode: 'tm', seq: 'CGCGAATTCGCG', na: 1000, c1: 250, saltCorr: 'none' }, sc('tmNN', 'dH', 'dS', 'selfComp')).o;
  ok(s9.selfComp === 1 && near(s9.dH, -101.2, 1e-9) && near(s9.dS, -273.8, 1e-9) && near(s9.tmNN, 59.73, 0.01), `S9 self-complementary CGCGAATTCGCG: x = 1 and the symmetry term, ΔH −101.2, ΔS −273.8, Tm ${s9.tmNN.toFixed(2)} °C`);
  const cu = R({ mode: 'tm', seq: L24, na: 50, c1: 250, c2: 250 }, [['T', 'series', 'T'], ['th', 'series', 'theta'], ['t', 'scalar', 'tmNN']]).o;
  const k = cu.T.findIndex(x => x >= cu.t - 1e-9);
  ok(cu.T.length === 201 && near(cu.th[k], 0.5, 1e-9) && cu.th[0] > 0.99 && cu.th[200] < 0.01, 'the two-state melting curve: half the strands paired at Tm, all below, none above');
  const p = R({ mode: 'tm', seq: L24 }, [...sc('gcClamp', 'maxRun', 'maxDinuc', 'selfAny', 'self3', 'hairpin', 'hairpinDG', 'nIssues'), ['g', 'scalar', 'issue', 'gc']]).o;
  ok(p.gcClamp === 3 && p.maxRun === 3 && p.selfAny === 4 && p.self3 === 2 && p.hairpin === 2 && p.hairpinDG > 0 && p.nIssues === 0 && p.g === 0, `primer checks of the M13 reverse primer: GC clamp ${p.gcClamp}, longest run ${p.maxRun}, self complementarity ${p.selfAny} (3′: ${p.self3}), no stable hairpin (ΔG ${p.hairpinDG} > 0): 0 issues`);
  const h = R({ mode: 'tm', seq: 'GGGGCCTTTTGGCCCC' }, sc('hairpin', 'hairpinDG', 'selfDG'));
  ok(h.o.hairpin === 6 && h.o.hairpinDG < -5 && h.o.selfDG < -7 && h.c.includes('primer-hairpin') && h.c.includes('primer-self3'), `a designed hairpin GGGGCC TTTT GGCCCC: stem 6, ΔG°37 ≈ ${h.o.hairpinDG} kcal/mol (stacks + SantaLucia & Hicks 2004 loop), self-dimer ${h.o.selfDG}`);
  const tpl = 'TTAGCGGATAACAATTTCACACAGGAAACAGCTATGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACG';
  const pc = R({ mode: 'tm', seq: L24, seq2: 'CGTTGTAAAACGACGGCCAGT', template: tpl }, [...sc('product', 'fwdPos', 'revPos', 'nProducts', 'productTm', 'dTm'), ['pc', 'scene', 'pcr']]).o;
  ok(pc.product === 126 && pc.fwdPos === 3 && pc.revPos === 128 && pc.nProducts === 1 && pc.pc.items.some(i => i.k === 'poly'), `in-silico PCR on a pUC19 MCS template with the M13 primers: one product of ${pc.product} bp (${pc.fwdPos}–${pc.revPos}), product Tm ${pc.productTm.toFixed(1)} °C`);
  const mm = R({ mode: 'tm', seq: 'AGCGGATAACAATTTGACACAGGA', seq2: 'CGTTGTAAAACGACGGCCAGT', template: tpl, mismatches: 1 }, sc('product', 'fwdMism')).o;
  const m3 = R({ mode: 'tm', seq: 'AGCGGATAACAATTTCACACAGGT', seq2: 'CGTTGTAAAACGACGGCCAGT', template: tpl, mismatches: 2 }, sc('product'));
  ok(mm.product === 126 && mm.fwdMism === 1 && Number.isNaN(m3.o.product) && m3.c.includes('no-product'), 'one internal mismatch is tolerated (mismatches 1); a mismatch at the primer\'s 3′ base never primes (no-product)');
  const sw = R({ mode: 'tm', seq: 'CGTTGTAAAACGACGGCCAGT', seq2: L24, template: tpl }, sc('product'));
  ok(sw.o.product === 126 && sw.c.includes('primers-swapped'), 'primers given the other way round still amplify, with the code primers-swapped');
  const lo = R({ mode: 'tm', seq: 'ACGT', na: 0 }, sc('tmNN'));
  ok(Number.isNaN(lo.o.tmNN) && lo.c.includes('salt-range'), 'no Na⁺ at all: ln 0 has no value, so no NN Tm (NaN and the code salt-range), never a wrong number');
  const amb = R({ mode: 'tm', seq: 'ACGTNACGTACGTACGT' }, sc('tmNN', 'tmWallace'));
  ok(Number.isNaN(amb.o.tmNN) && Number.isNaN(amb.o.tmWallace) && amb.c.includes('ambiguous'), 'an ambiguous base: Tm refused (NaN, ambiguous)');
  const cc = R({ mode: 'tm', seq: L24, c1: 10, c2: 50 }, sc('tmNN'));
  ok(Number.isNaN(cc.o.tmNN) && cc.c.includes('conc-range'), 'C1 − C2/2 ≤ 0: no Tm (conc-range)');
}

// ---------- 7. alignment ----------
{
  const al = (o, outs) => R({ mode: 'align', ...o }, outs || sc('score', 'nCoOptimal'));
  const s10 = al({ a: 'GATTACA', b: 'GCATGCU', match: 1, mismatch: -1, gap: -1 }).o;
  ok(s10.score === 0 && s10.nCoOptimal === 3, `S10 Needleman–Wunsch GATTACA / GCATGCU, +1/−1/−1: score ${s10.score}, ${s10.nCoOptimal} co-optimal alignments`);
  const s11 = al({ a: 'TGTTACGG', b: 'GGTTGACTA', type: 'local', alphabet: 'dna', match: 3, mismatch: -3, gap: -2 }, [...sc('score', 'startA', 'endA'), ['al', 'scene', 'alignment']]).o;
  ok(s11.score === 13 && s11.startA === 2 && s11.endA === 6 && rows(s11.al) === 'GTT-AC/GTTGAC', `S11 Smith–Waterman TGTTACGG / GGTTGACTA, +3/−3/−2: score 13, GTT-AC / GTTGAC`);
  const g = al({ a: 'HEAGAWGHEE', b: 'PAWHEAE', matrix: 'BLOSUM50', gap: -8 }).o, l = al({ a: 'HEAGAWGHEE', b: 'PAWHEAE', matrix: 'BLOSUM50', gap: -8, type: 'local' }, [...sc('score'), ['al', 'scene', 'alignment']]).o;
  ok(g.score === 1 && l.score === 28 && rows(l.al) === 'AWGHE/AW-HE', `S12 HEAGAWGHEE / PAWHEAE, BLOSUM50, gap −8 (Durbin et al. 1998 figs 2.5–2.6): global ${g.score}, local ${l.score} AWGHE / AW-HE`);
  const b = al({ a: 'HEAGAWGHEE', b: 'PAWHEAE', matrix: 'BLOSUM62', open: -12, extend: -1, type: 'local' }, sc('score', 'bits', 'evalue')).o;
  ok(b.score === 17 && near(b.bits, (0.267 * 17 - Math.log(0.041)) / Math.LN2, 1e-12) && near(b.evalue, 0.041 * 70 * Math.exp(-0.267 * 17), 1e-12), `S13 BLOSUM62, BLAST gaps 11/1 (open −12, extend −1), local: ${b.score}; Karlin–Altschul ${b.bits.toFixed(2)} bits, E = ${b.evalue.toPrecision(3)} (λ 0.267, K 0.041)`);
  const t = al({ a: 'AAAGGG', b: 'AAAAGGG', alphabet: 'dna', match: 1, mismatch: -1, open: -3, extend: -1 }).o;
  ok(t.score === 3 && t.nCoOptimal === 4, `S14 affine gaps (Gotoh 1982) AAAGGG / AAAAGGG, open −3: score ${t.score}, ${t.nCoOptimal} co-optimal (the gap anywhere in the A run)`);
  const nl = al({ a: 'AAAA', b: 'CCCC', alphabet: 'dna', type: 'local' }, sc('score', 'alnLength'));
  ok(nl.o.score === 0 && nl.o.alnLength === 0 && nl.c.includes('no-local-similarity'), 'local alignment of unrelated sequences: score 0, an empty alignment and no-local-similarity');
  const sg = al({ a: 'ACGTACGTAC', b: 'GTACG', alphabet: 'dna', type: 'semiglobal', match: 1, mismatch: -1, gap: -2 }, sc('score')).o;
  ok(sg.score === 5, 'semi-global (end gaps free): GTACG inside ACGTACGTAC scores 5, its 5 matches');
  const x = 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGG', y = x.slice(5) + 'GGGG';
  const full = al({ a: x, b: y }, sc('score', 'cells')).o, band = al({ a: x, b: y, band: 30 }, sc('score', 'cells', 'banded'));
  ok(full.score === band.o.score && band.o.cells < full.cells / 3 && band.o.banded === 1 && band.c.includes('banded'), `a banded alignment (w 30) finds the full optimum ${full.score} with ${band.o.cells} of ${full.cells} cells, and says it is banded`);
  const nb = al({ a: x, b: y, band: 1 }, sc('score')).o;
  ok(nb.score < full.score, 'too narrow a band (w 1) misses the optimum: banding is an approximation');
  const big = 'ACGT'.repeat(500), bb = R({ mode: 'align', a: big, b: big, alphabet: 'dna', band: 'k' }, sc('score', 'cells'), { k: 200 });
  ok(Number.isNaN(bb.o.score) && bb.c.includes('budget'), 'a band the slider widens past 250 000 cells → NaN and the code budget');
  const sh = s => R({ mode: 'align', a: 'HEAGAWGHEE', b: 'PAWHEAE', type: 'local', shuffles: 50 }, [['z', 'scalar', 'zScore'], ['p', 'scalar', 'pShuffle'], ['s', 'series', 'shuffleScores']]);
  const s1 = sh(), s2 = sh();
  ok(JSON.stringify(s1.o) === JSON.stringify(s2.o) && s1.o.s.length === 50 && s1.o.p > 0 && s1.o.p <= 1, `a seeded shuffle test (50 shuffles of b): z ${s1.o.z.toFixed(2)}, empirical p ${s1.o.p.toFixed(2)}, the same on every run`);
  const id = al({ a: 'ACGTACGT', b: 'ACGACGT', alphabet: 'dna', match: 1, mismatch: -1, gap: -1 }, sc('identity', 'identityShort', 'gaps', 'gapOpens', 'alnLength')).o;
  ok(id.alnLength === 8 && id.identity === 7 / 8 && id.identityShort === 1 && id.gaps === 1 && id.gapOpens === 1, 'identity over the alignment\'s 8 columns 7/8 (EMBOSS) and over the shorter sequence 7/7 (May 2004)');
  const dpS = al({ a: 'GATTACA', b: 'GCATGCT', alphabet: 'dna', match: 1, mismatch: -1, gap: -1 }, [['d', 'scene', 'dp']]).o.d;
  ok(dpS.items.filter(i => i.k === 'txt' && typeof i.v === 'number').length === 64 && dpS.items.some(i => i.c === 'ok'), 'the DP matrix of a small alignment: 8 × 8 scores with the path marked');
}

// ---------- 8. dot plots ----------
{
  const d = R({ mode: 'dotplot', a: 'ACGTTGCAAC', b: 'ACGTTGCAAC', window: 1, stringency: 1 }, sc('nHits', 'longestDiag')).o;
  const cnt = [...'ACGT'].reduce((t, x) => { const k = [...'ACGTTGCAAC'].filter(y => y === x).length; return t + k * k; }, 0);
  ok(d.longestDiag === 10 && d.nHits === cnt, `a self dot plot (w 1): the main diagonal of 10, every identical letter pair a dot (${cnt} = Σ count²)`);
  const r = R({ mode: 'dotplot', a: 'AAAAGGGCCCATTT', b: 'AAAAGGGCCCATTT', window: 4, stringency: 4, revcomp: true }, sc('nHits', 'nHitsRev'));
  ok(r.o.nHits >= 11 && r.o.nHitsRev >= 1, `the reverse-complement strand shows the inverted repeat GGGCCC (${r.o.nHitsRev} reverse dots)`);
  const big = R({ mode: 'dotplot', a: 'A'.repeat(1500), b: 'A'.repeat(1500), window: 1 }, [['n', 'scalar', 'nHits'], ['d', 'scene', 'dots']]);
  ok(big.o.n === 2250000 && big.o.d.items.length <= 2000 && big.c.includes('dots-pooled'), '2 250 000 dots are pooled into ≤ 2000 scene items (dots-pooled)');
  ok(R({ mode: 'dotplot', a: 'ACGT', b: 'ACGT', window: 5 }, sc('nHits')).c.includes('window-range'), 'a window longer than a sequence → window-range');
}

// ---------- 9. restriction digests ----------
{
  const D = (seq, enz, x) => R({ mode: 'digest', seq, enzymes: enz, ...(x || {}) }, [...sc('nSites', 'nBlocked', 'nFragments', 'bands', 'outOfRange'), ['f', 'series', 'fragments'], ['c0', 'scalar', 'cutPos', 0], ['p0', 'scalar', 'sitePos', 0], ['p1', 'scalar', 'sitePos', 1], ['o0', 'scalar', 'overhang', 0], ['g', 'scene', 'gel'], ['m', 'scene', 'map']]);
  const e = D('GGAATTCCGAATTCA', ['EcoRI']).o;
  ok(e.nSites === 2 && e.p0 === 2 && e.p1 === 9 && JSON.stringify(e.f) === '[2,7,6]' && e.o0 === 4, 'S19 EcoRI G^AATTC on GGAATTCCGAATTCA: sites at 2 and 9, fragments 2, 7, 6 bp, a 4-nt 5′ overhang (REBASE)');
  const c = D('GGAATTCCGAATTCA', ['EcoRI'], { circular: true }).o, u = D('GGGGCCCCTTTT', ['EcoRI'], { circular: true });
  ok(JSON.stringify(c.f) === '[7,8]' && u.o.nFragments === 1 && u.c.includes('uncut-circle'), 'circular: 2 cuts give 2 fragments (7 + 8); no site leaves the circle uncut (uncut-circle)');
  ok(D('AAGGTACCAA', ['KpnI']).o.o0 === -4 && D('AACCCGGGAA', ['SmaI']).o.o0 === 0 && D('AAGGTACCAA', ['KpnI']).o.c0 === 7, 'KpnI GGTAC^C leaves a 3′ overhang (−4), SmaI CCC^GGG blunt ends (0)');
  const f = D('AAAAGGTCTCAGGGGTTTTTTTTTT', ['BsaI']).o, rv = D('TTTTTTTTTTGGGGAGAGACCAAAA', ['BsaI']).o;
  ok(f.c0 === 11 && rv.c0 === 10 && f.o0 === 4, 'Type IIS BsaI GGTCTC(1/5) cuts outside its site: 1 nt after it on the top strand; on the reverse site GAGACC 5 nt before it (Golden Gate)');
  const dm = D('AAGATCAA', ['MboI', 'DpnI', 'Sau3AI'], { dam: true }).o, nd = D('AAGATCAA', ['MboI', 'DpnI', 'Sau3AI']).o;
  ok(dm.nSites === 2 && dm.nBlocked === 1 && nd.nSites === 2 && nd.nBlocked === 1, 'Dam methylation (GATC): MboI is blocked and DpnI cuts only methylated DNA; Sau3AI cuts either way');
  ok(D('AATCTAGATCAA', ['XbaI'], { dam: true }).o.nSites === 0 && D('AATCTAGAGCAA', ['XbaI'], { dam: true }).o.nSites === 1, 'XbaI TCTAGA is blocked only when a GATC overlaps it (TCTAGATC)');
  ok(D('GGTCTCAAAA', ['BsaI']).c.includes('cut-outside'), 'a Type IIS cut beyond the end of a linear sequence → cut-outside');
  const gel = D('A'.repeat(3000) + 'GAATTC' + 'A'.repeat(6994), ['EcoRI'], { agarose: 0.8, ladder: 'lambda' }).o;
  ok(gel.nFragments === 2 && gel.bands === 2 && gel.outOfRange === 0 && gel.g.items.filter(i => i.k === 'txt').length === 8, 'a 10 kb linear digest on a 0.8 % gel: two resolved bands beside the 8 bands of λ–HindIII');
  ok(Q.migrate(1000, 500, 10000) < Q.migrate(600, 500, 10000) && Q.migrate(10000, 500, 10000) === 0.1 && near(Q.migrate(500, 500, 10000), 0.9, 1e-12), 'migration is log-linear in size inside the resolving range (Helling et al. 1974): smaller runs further');
  ok(JSON.stringify(Q.agaroseRange(1.2).map(Math.round)) === '[400,6000]' && JSON.stringify(Q.agaroseRange(2)) === '[100,2000]', 'resolving range of agarose: 1.2 % 0.4–6 kb, 2 % 0.1–2 kb (Sambrook & Russell 2001 Table 5-1)');
  const ow = R({ mode: 'digest', seq: 'GGAATTCC', enzymes: ['Mine'], custom: [{ name: 'Mine', site: 'AATT', cut: 2 }] }, [['c', 'scalar', 'cutPos', 0]]).o;
  ok(ow.c === 4, 'an enzyme of the model\'s own (AA^TT, palindromic): its cut at 4');
}

// ---------- 10. proteins ----------
{
  const ub = 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG';
  const u = R({ mode: 'protein', seq: ub }, sc('mwAvg', 'pI', 'gravy', 'instability', 'eps280', 'aliphatic')).o;
  ok(near(u.mwAvg, 8564.74, 0.02) && near(u.pI, 6.56, 0.01) && near(u.gravy, -0.489, 0.001) && near(u.instability, 36.055, 0.001), `S15 human ubiquitin: ${u.mwAvg.toFixed(2)} Da (ExPASy 8564.8), pI ${u.pI.toFixed(2)} (Bjellqvist, ExPASy 6.56), GRAVY ${u.gravy.toFixed(3)}, instability ${u.instability.toFixed(2)} (Biopython)`);
  const a = R({ mode: 'protein', seq: 'ACDEFGHIKLMNPQRSTVWY' }, sc('mwAvg', 'mwMono', 'pI')).o;
  ok(near(a.mwAvg, 2395.71, 0.01) && near(a.mwMono, 2394.1249, 0.001) && near(a.pI, 6.78, 0.01), `S16 the 20 amino acids: ${a.mwAvg.toFixed(2)} / ${a.mwMono.toFixed(4)} Da, pI ${a.pI.toFixed(2)} (Biopython)`);
  const lys = 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL';
  const ly = R({ mode: 'protein', seq: lys }, sc('mwAvg', 'pI', 'eps280', 'eps280ox')).o;
  ok(near(ly.pI, 9.32, 0.01) && near(ly.mwAvg, 14313.0, 0.1) && ly.eps280 === 37470 && ly.eps280ox === 37970, `hen egg-white lysozyme (P00698, mature): ${ly.mwAvg.toFixed(1)} Da, pI ${ly.pI.toFixed(2)} (ExPASy 9.32), ε280 ${ly.eps280} reduced / ${ly.eps280ox} with 4 cystines (Pace et al. 1995)`);
  const sets = ['bjellqvist', 'emboss', 'lehninger', 'solomon', 'sillero'].map(k => R({ mode: 'protein', seq: ub, pk: k }, sc('pI')).o.pI);
  ok(new Set(sets.map(x => x.toFixed(2))).size === 5 && sets.every(x => x > 6 && x < 8), `pI of ubiquitin by pK set: ${sets.map(x => x.toFixed(2)).join(', ')} (Bjellqvist, EMBOSS, Lehninger, Solomon, Sillero — Kozlowski 2016: they differ)`);
  const ch = R({ mode: 'protein', seq: ub, ph: 7 }, [['c', 'scalar', 'charge'], ['g', 'series', 'phGrid'], ['q', 'series', 'chargeCurve']]).o;
  ok(ch.q[0] > 0 && ch.q[200] < 0 && ch.q.every((v, i) => i === 0 || v <= ch.q[i - 1] + 1e-12), 'the net charge falls monotonically from + at pH 0 to − at pH 14');
  const h = R({ mode: 'protein', seq: 'KKKKKKKKKLLLLLLLLLLLLLLLLLLLKKKKKKKKK', window: 19 }, [['x', 'series', 'hydroX'], ['y', 'series', 'hydropathy']]).o;
  ok(h.y.length === 37 - 19 + 1 && Math.max(...h.y) > 1.6, `a Kyte–Doolittle window of 19 over a 19-leucine stretch peaks at ${Math.max(...h.y).toFixed(2)} > 1.6, the transmembrane threshold (Kyte & Doolittle 1982)`);
  const g = R({ mode: 'protein', seq: 'GGGG' }, sc('pI', 'eps280')).o;
  ok(near(g.pI, (7.5 + 3.55) / 2, 0.01) && g.eps280 === 0, 'a peptide without ionisable side chains: pI from its two termini alone, ε280 0 (no W, Y)');
  const x = R({ mode: 'protein', seq: 'MKBZX' }, sc('mwAvg', 'gravy'));
  ok(Number.isNaN(x.o.mwAvg) && Number.isNaN(x.o.gravy) && x.c.includes('ambiguous'), 'X has no mass: MW and GRAVY refused (NaN, ambiguous); B and Z would take the mean of their pair');
  const wh = R({ mode: 'protein', seq: 'LKKLLKLLKKLLKLLKKL' }, [['m', 'scalar', 'muH'], ['w', 'scene', 'wheel']]).o;
  ok(wh.m > 0.5 && wh.w.items.filter(i => i.k === 'circ').length === 18, `an amphipathic helix on the helical wheel: hydrophobic moment μH ${wh.m.toFixed(2)} (Eisenberg et al. 1984)`);
}

// ---------- 11. CRISPR ----------
{
  const s = 'AAAAAAAAAAACGTACGTACGTACGTACGTTGGAAAAAAAAAAAAAAAAAAAA', p = s.indexOf('TGG', 20);
  const c = R({ mode: 'crispr', seq: s, target: 25 }, sc('nGuides', 'nPlus', 'nearestCut', 'nearestDist', 'nearestGc', 'nGood')).o;
  ok(c.nGuides === 1 && c.nPlus === 1 && c.nearestCut === p - 3 && near(c.nearestGc, 0.5, 1e-12) && c.nGood === 1, `SpCas9: one NGG PAM, the blunt cut 3 bp from it at ${c.nearestCut} (Jinek et al. 2012), guide GC 50 %`);
  const m = R({ mode: 'crispr', seq: 'CCAACGTACGTACGTACGTACGTAAAAAAAAAAAAAAA', target: 10 }, sc('nGuides', 'nMinus', 'nearestCut')).o;
  ok(m.nGuides === 1 && m.nMinus === 1 && m.nearestCut === 6, 'a CCN on the top strand is an NGG PAM on the bottom strand: its cut at 6, 3 bp inside the protospacer');
  const a = R({ mode: 'crispr', nuclease: 'Cas12a', seq: 'GGTTTAACGTACGTACGTACGTACGTACGAAAAAAAAAAA', target: 25 }, [...sc('nPlus', 'nearestCut'), ['c', 'series', 'cuts']]).o;
  ok(a.nPlus === 1 && a.nearestCut === 6 + 18, 'Cas12a: the TTTV PAM 5′ of the protospacer, the cut 18 nt after the PAM (Zetsche et al. 2015)');
  const t = R({ mode: 'crispr', seq: 'ACGTTTTTACGTACGTACGTAGGACGTTTTTACGTACGTACGTAGG' }, sc('nGuides', 'nGood', 'nearestPolyT', 'nearestSeedHits')).o;
  ok(t.nGuides === 2 && t.nGood === 0 && t.nearestPolyT === 1 && t.nearestSeedHits === 1, 'guides with TTTT (a Pol III terminator) and a seed found twice are not good guides');
  ok(R({ mode: 'crispr', seq: 'AAAAAAAAAAAAAAAAAAAAAAAAA' }, sc('nGuides')).c.includes('no-pam'), 'no PAM → no-pam');
}

// ---------- 12. checks, the Python twin, adapter, Worker, speed ----------
{
  const codes = s => Q.checkSpec(s).map(p => p.code + ' ' + p.path);
  ok(codes(spec({ mode: 'tm', seq: 'ACGTX' }, [])).includes('alphabet model.seq'), 'a letter outside the alphabet → alphabet, with its position');
  ok(codes(spec({ mode: 'translate', seq: 'ACGTU' }, [])).includes('alphabet model.seq'), 'T and U mixed → alphabet');
  ok(codes(spec({ mode: 'translate', seq: 'ACGT', table: 8 }, [])).includes('value model.table'), 'table 8 does not exist → value model.table');
  ok(codes(spec({ mode: 'align', a: 'A'.repeat(600), b: 'A'.repeat(600), alphabet: 'dna' }, [])).includes('size model') && !codes(spec({ mode: 'align', a: 'A'.repeat(600), b: 'A'.repeat(600), alphabet: 'dna', band: 50 }, [])).length, 'a 600 × 600 alignment needs a band (size model); with band 50 it passes');
  ok(codes(spec({ mode: 'digest', seq: 'ACGT', enzymes: ['EcoXI'] }, [])).includes('ref model.enzymes[0]'), 'an unknown enzyme → ref');
  ok(codes(spec({ mode: 'protein', seq: 'MK' }, [['x', 'scalar', 'tmNN']])).includes('output outputs[0].of'), 'an output the mode does not compute → output');
  ok(codes(spec({ mode: 'tm', seq: 'A'.repeat(121) }, [])).includes('size model.seq'), 'an oligo longer than 120 nt → size');
  const ex = Q.exprs(spec({ mode: 'digest', seq: 'ACGT', enzymes: ['EcoRI'], agarose: 'k / 10', features: [{ start: 1, end: 'k', key: 'ori' }] }, []));
  ok(JSON.stringify(ex) === '[["k / 10","model.agarose",[]],["k","model.features[0].end",[]]]', 'exprs lists every expression of the model with its path');
  ok(JSON.stringify(Q.keys(spec({ mode: 'digest', seq: 'ACGT', enzymes: ['EcoRI'], features: [{ start: 1, end: 2, key: 'oriLabel' }] }, []))) === '[["oriLabel","model.features[0].key"]]', 'keys lists the labels of the map\'s features');
  ok(JSON.stringify(require('./golden.cjs')('lib_seq')('spec')) === JSON.stringify(Q.SPEC), 'the SPEC (tables, sequences, outputs, enzymes) is the golden one of the former Python twin (tools/lib_seq.py)');
  ok(Q.SPEC.enzymes.length === Object.keys(Q.ENZ).length && Q.SPEC.enzymes.every(k => Q.ENZ[k]), `the enzyme list of the checker = the ${Object.keys(Q.ENZ).length} enzymes the engine knows`);
  ok(Object.keys(Q.ENZ).every(k => { const [s, c1, c2] = Q.ENZ[k]; return Q.revcomp(s) !== s || c1 + c2 === s.length; }), 'every palindromic enzyme cuts both strands symmetrically (c1 + c2 = the site\'s length)');
  const s = spec({ mode: 'protein', seq: 'MKWVTFISLLFLFSSAYS', ph: 'k' }, [['c', 'scalar', 'charge'], ['h', 'series', 'hydropathy'], ['w', 'scene', 'wheel']]);
  s.outputs[1].id = 'hy';
  const o = Q.engine.create(s, { seed: 3 }).run({ k: 7 });
  ok(Number.isFinite(o.c) && o.hy.length === 10 && o.w.items.length > 0, 'the sim adapter: engine.create(spec).run({k: 7}) → a charge, a series of 10, a scene');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + Q.engine.workerSource, ctx);
  const ws = spec({ mode: 'align', a: 'HEAGAWGHEE', b: 'PAWHEAE', type: 'local', shuffles: 20 }, [['s', 'scalar', 'score'], ['z', 'scalar', 'zScore'], ['a', 'scene', 'alignment']]);
  ok(JSON.stringify(ctx.self.noemaEngine.create(ws, { seed: 9 }).run({})) === JSON.stringify(Q.engine.create(ws, { seed: 9 }).run({})), 'the Worker source in a fresh vm context gives the same outputs (seeded shuffles)');
  const r0 = Q.run(null), r1 = Q.run({ model: { mode: 'x' }, outputs: [{ id: 'a', of: 'b' }] }), r2 = Q.run({ model: { mode: 'protein', seq: 'MK' }, outputs: [{ id: 'a', kind: 'scalar', of: 'constructor' }] }), r3 = Q.run({ model: { mode: 'translate', seq: '' }, outputs: [{ id: 'a', kind: 'scalar', of: 'length' }] });
  ok(r0.codes.length && Number.isNaN(r1.out.a) && Number.isNaN(r2.out.a) && Number.isNaN(r3.out.a) && r3.codes.includes('empty'), 'a run never throws: no spec, an unknown mode, an inherited name, an empty sequence → NaN and a code');
  const t0 = Date.now();
  Q.engine.create(spec({ mode: 'mutate', cds: 'ATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGGTAA', variants: [{ kind: 'sub', pos: 20, alt: 'T' }], enzymes: ['Bsu36I'] }, [['e', 'scalar', 'effect', 0], ['h', 'scene', 'hgvs']]), {}).run({});
  Q.run(spec({ mode: 'tm', seq: 'AGCGGATAACAATTTCACACAGGA', seq2: 'CGTTGTAAAACGACGGCCAGT' }, [['t', 'scalar', 'tmNN'], ['T', 'series', 'theta']]), {}, {});
  const typ = Date.now() - t0;
  const rnd = C => { let x = 7, s = ''; for (let i = 0; i < C; i++) { x = (x * 1103515245 + 12345) % 2147483648; s += 'ACGT'[x >> 16 & 3]; } return s; };
  const big = rnd(20000), t1 = Date.now();
  Q.run(spec({ mode: 'translate', seq: big, minLen: 30, start: 'any', nested: true, window: 10 }, [['n', 'scalar', 'nOrfs'], ['m', 'scene', 'orfMap'], ['g', 'series', 'gcWin']]), {}, {});
  Q.run(spec({ mode: 'align', a: big.slice(0, 499), b: big.slice(1, 500), alphabet: 'dna', shuffles: 7 }, [['s', 'scalar', 'score']]), {}, { seed: 1 });
  Q.run(spec({ mode: 'align', a: big.slice(0, 2000), b: big.slice(5, 2000), alphabet: 'dna', band: 60 }, [['s', 'scalar', 'score']]), {}, {});
  Q.run(spec({ mode: 'dotplot', a: big.slice(0, 2000), b: big.slice(0, 2000), window: 1, revcomp: true }, [['d', 'scene', 'dots']]), {}, {});
  Q.run(spec({ mode: 'digest', seq: big, enzymes: ['Sau3AI', 'HaeIII', 'AluI', 'MspI', 'TaqI', 'HinfI', 'DdeI', 'BstXI', 'SfiI', 'XmnI'], circular: true, dam: true, dcm: true }, [['n', 'scalar', 'nSites'], ['g', 'scene', 'gel'], ['m', 'scene', 'map']]), {}, {});
  Q.run(spec({ mode: 'crispr', seq: big, nuclease: 'SpCas9NG' }, [['n', 'scalar', 'nGuides'], ['g', 'scene', 'guides']]), {}, {});
  Q.run(spec({ mode: 'tm', seq: rnd(120), template: big, mismatches: 5 }, [['t', 'scalar', 'tmNN']]), {}, {});
  const worst = Date.now() - t1;
  ok(typ < 50 && worst < 2000, `speed: a mutation and a primer pair ${typ} ms (< 50); the worst allowed runs (20 kb ORFs in 6 frames, 250 000-cell alignments with shuffles and a 2 kb band, a 2 kb × 2 kb dot plot, a 20 kb digest with 10 enzymes, 20 kb of NG PAMs, PCR with 5 mismatches) ${worst} ms (< 2 s)`);
}

// ---------- 13. the reference activity sickle-codon (its exercise's checks and tests.json; the content checks pass it) ----------
{
  const AD = path.join(ROOT, 'tools', 'activities_examples', 'sickle-codon'), rd = f => JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
  const ex = rd('spec.json'), sim = Q.engine.create(ex, { seed: 1 });
  const LOC = ['en', 'el', 'ru', 'de', 'fr'], tables = Object.fromEntries(LOC.map(l => [l, rd(`strings.${l}.json`)]));
  const js = ENGINES.content().checkSimSpec(ex, tables);
  ok(js.length === 0, `sickle-codon: the spec passes the content checks (checkSimSpec) with its five string tables${js.length ? ': ' + js.join('; ') : ''}`);
  ok(LOC.every(l => JSON.stringify(Object.keys(tables[l]).sort()) === JSON.stringify(Object.keys(tables.en).sort())), 'sickle-codon: the five string tables have the same keys');
  const act = rd('activity.json'); ok(act.id === 'sickle-codon' && act.runtime === 'sim-spec@1' && fs.readFileSync(path.join(AD, 'fallback.svg'), 'utf8').startsWith('<svg'), 'sickle-codon: activity.json and fallback.svg');
  const prot = Q.translate(Q.clean(ex.model.cds), 0, 1, {});
  ok(prot === 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH*', 'the HBB CDS of the activity translates to human β-globin (UniProt P68871, 147 residues with Met1)');
  // the exercise ch01-e930 (docs/library/seq.md §13): grade checks
  const checks = ['effect == 1', 'aaPos == 7', 'altAa == 17'].map(e => NoemaExpr.compile(e));
  for (const c of rd('tests.json').cases) {
    const v = { pos: 1, base: 0 }; for (const st of c.steps) v[st.set] = st.value;
    const out = sim.run(v), env = Object.assign({}, v, Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')));
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = checks.every(f => !!f(env));
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `sickle-codon: ${c.name}`);
  }
  const hs = sim.run({ pos: 20, base: 3 });
  ok(texts(hs.names).join(' ') === 'c.20A>T p.(Glu7Val)', 'sickle-codon: the HGVS names of haemoglobin S, c.20A>T p.(Glu7Val)');
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
