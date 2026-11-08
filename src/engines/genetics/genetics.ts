/* ===================== interactive activities — genetics@1, the engine library's heredity and population engine (docs/library/genetics.md) =====================
   A GENERAL engine of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md §1) for genetics from Mendel to population and quantitative genetics.
   One model = one `mode`:
     cross       Mendelian crosses of 1–6 loci: 1–6 alleles per locus with complete dominance in their listed order, incomplete
                 dominance or codominance (also pairs such as ABO's IA–IB), lethal and semi-lethal genotypes, X- (XY) and Z- (ZW)
                 linkage, linkage with recombination fractions and three-point coincidence, two-locus epistasis presets (9:3:4,
                 12:3:1, 9:7, 15:1, 13:3, 9:6:1 or custom); phenotype classes, exact ratios, χ² against observed counts; a Punnett square.
     pedigree    a pedigree of ≤ 24 people under AD, AR, XD, XR, Y-linked or mitochondrial inheritance with penetrance and phenocopies:
                 the likelihood (exact enumeration of genotypes, Elston & Stewart 1971 in spirit), each person's posterior carrier
                 probability and risk of being affected given everyone else; a drawing in the standard nomenclature (Bennett et al. 2008).
     hw          Hardy–Weinberg (Hardy 1908; Weinberg 1908) for 2–8 alleles, inbreeding F (Wright 1922), X-linkage, the χ² test and the
                 exact test (Wigginton, Cutler & Abecasis 2005); a de Finetti diagram.
     selection   one locus, deterministic: fitnesses, mutation both ways, one-way migration, meiotic drive; equilibria (Fisher 1922; Haldane).
     drift       Wright–Fisher (diploid) and Moran (haploid, Moran 1958) with selection, dominance and mutation; seeded replicates; Kimura's
                 (1962) fixation probability, Kimura & Ohta's (1969) times, heterozygosity decay.
     map         map functions (Haldane 1919, Kosambi 1944) and the three-point test cross (gene order, distances, coincidence, interference).
     coalescent  Kingman's (1982) coalescent of n ≤ 50 genes with infinite-sites mutations: TMRCA, S, π, θ_W (Watterson 1975), Tajima's
                 D (1989), the site frequency spectrum; a genealogy drawing.
     ld          linkage disequilibrium D, D′ (Lewontin 1964), r² (Hill & Robertson 1968), decay by recombination, drift expectations
                 (Sved 1971; Ohta & Kimura 1969).
     quant       quantitative genetics: the breeder's equation (Lush 1937) with truncation intensity, one-locus values (Falconer & Mackay
                 1996), liability threshold heritability (Falconer 1965), a seeded polygenic truncation-selection simulation.
   Pure JS, no DOM, no learner text: numbers, codes and only the model's own short texts (allele names, ids) as `s`.
   checkSpec / exprs / keys: the golden outputs of the former Python twin (tests/fixtures/parity/enginelib.json). Tests: node tests/lib_genetics.js. */
import NoemaLibCore from '../kernel/core.ts';
import type { CoreStepper, Emit, NumFn, Rec, SceneData, Table, TableNode } from '../kernel/core.ts';
import type { Stream } from '../kernel/simkit.ts';
import type { Problem, Spec } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes, keys and numbers leave this module
const C = NoemaLibCore;
const ID = 'genetics@1';
const BUDGET = 200000;
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o: object, k: unknown) => Object.prototype.hasOwnProperty.call(o, k as PropertyKey);
/** a number of the model: a number or an expression (numx) */
type Numx = number | string;
/** what a mode computes: scalars, series and scenes by output name */
type OutVal = number | number[] | SceneData;
/** the outputs of a mode that take an argument (`arg`: a pattern, an index, a person's id or an allele pair), checked by checkSpec */
type ArgFns = Readonly<Record<string, ((arg: never) => unknown) | undefined>>;
/** a mode's run: its outputs, its codes, the outputs with an argument */
interface ModeRun {
  readonly out: Record<string, OutVal>;
  readonly codes: string[];
  readonly ARG?: ArgFns;
}
/** what a mode computes: of → [kind, arg kind] */
type OutDef = readonly [string, string?];
/** a locus of a cross, after checkSpec */
type LocusSpec = {
  readonly id: string;
  readonly alleles: readonly string[];
  readonly dominance?: string;
  readonly codominant?: ReadonlyArray<readonly string[]>;
  readonly chrom?: string;
  readonly lethal?: ReadonlyArray<{ readonly genotype: readonly string[]; readonly viability?: Numx }>;
};
/** a cross (mode cross), after checkSpec */
type CrossModel = {
  readonly loci: readonly LocusSpec[];
  readonly p1: Readonly<Record<string, readonly string[]>>;
  readonly p2: Readonly<Record<string, readonly string[]>>;
  readonly linkage?: ReadonlyArray<{ readonly a: string; readonly b: string; readonly r: Numx }>;
  readonly coincidence?: Numx;
  readonly epistasis?: { readonly a: string; readonly b: string; readonly type: string; readonly classes?: readonly number[] };
  readonly observed?: readonly Numx[];
  readonly classLabels?: readonly string[];
};
/** a person of a pedigree, after checkSpec */
type Person = {
  readonly id: string;
  readonly sex: string;
  readonly mother?: string;
  readonly father?: string;
  readonly affected?: boolean;
};
/** a pedigree (mode pedigree), after checkSpec */
type PedigreeModel = {
  readonly inheritance: string;
  readonly q?: Numx;
  readonly penetrance?: Numx;
  readonly phenocopy?: Numx;
  readonly showRisk?: boolean;
  readonly people: readonly Person[];
};
/** a Hardy–Weinberg locus (mode hw), after checkSpec */
type HWModel = { readonly freqs: readonly Numx[]; readonly F?: Numx; readonly chrom?: string; readonly counts?: readonly Numx[] };
/** a mode's computation (of its own model, as checkSpec let it through) */
type Runner = (m: never, env: Rec, seed: number) => ModeRun;
/** the variates the samplers use: a kernel stream, or a bare uniform function */
type Uniform = (() => number) & {
  readonly binomial?: Stream['binomial'];
  readonly poisson?: Stream['poisson'];
  readonly exp?: Stream['exp'];
};
/** a locus of a cross as runCross computes with it */
interface CLocus {
  readonly id: string;
  readonly al: readonly string[];
  readonly dom: string;
  readonly chrom: string;
  readonly co: string[];
  readonly lethal: Array<{ readonly g: string; readonly v: number }>;
}
/** a gamete: an allele index per locus (−1: none), the sex chromosome it carries, its probability */
interface Gamete {
  a: number[];
  sc: string | null;
  p: number;
}
/** a zygote of a cross */
interface Zygote {
  readonly geno: number[][];
  readonly sx: string;
  readonly w: number;
  readonly label: string;
  readonly cls: number;
}
/** a phenotype class of a cross */
interface PhenoClass {
  readonly label: string;
  readonly cls: number;
  p: number;
}
/** the three-point test cross (mode map), after checkSpec */
type ThreePoint = {
  readonly loci: readonly string[];
  readonly classes: ReadonlyArray<{ readonly alleles: readonly number[]; readonly n: Numx }>;
};
/** map functions and the three-point cross (mode map), after checkSpec */
type MapModel = { readonly r?: Numx; readonly d?: Numx; readonly threePoint?: ThreePoint };
/** a node of a coalescent genealogy */
interface CoalNode {
  readonly t: number;
  readonly kids: number[];
  readonly size: number;
}
/** the stepper's state in mode drift: the replicate populations and the seeded stream (the kernel stream's state, or a mulberry32 word) */
interface DriftState {
  readonly other?: undefined;
  t0: number;
  g: number;
  proc: unknown;
  copies: number;
  i: number[];
  tFix: number[];
  H0: number;
  dec: number;
  rs: number[] | number;
}
/** the stepper's state in every other mode: the time (the outputs are recomputed at each step) */
interface OtherState {
  readonly t: number;
  readonly other: true;
}
type StepState = DriftState | OtherState;
const MODES = ['cross', 'pedigree', 'hw', 'selection', 'drift', 'map', 'coalescent', 'ld', 'quant'];

/* ---------- special functions (all bounded, double precision) ---------- */
const LF: number[] = [0];
for (let i = 1; i < 1024; i++) LF[i] = LF[i - 1]! + Math.log(i);
/** ln k! — a table to 1023, then Stirling's series */
function logFact(k: number): number {
  if (k < 0 || !Number.isFinite(k)) return NaN;
  if (k < 1024) return LF[Math.round(k)]!;
  const x = k + 1;
  return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * x) - 1 / (360 * x * x * x) + 1 / (1260 * Math.pow(x, 5));
}
/* the own special functions, exported for the tests: the engine's χ² tail and Φ⁻¹ are the kernel's (NoemaSimKit has the same Lanczos
   ln Γ and NR Q(a, x)); erfc gives Φ */
/** ln Γ(x) (Lanczos, g = 7, n = 9; ~1e-15) */
const LZ = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LZ[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LZ[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** regularized upper incomplete gamma Q(a, x) (Numerical Recipes 3rd ed. §6.2: series below a + 1, Lentz continued fraction above) */
function gammaQ(a: number, x: number) {
  if (!(a > 0) || !(x >= 0)) return NaN;
  if (x === 0) return 1;
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a,
      sum = 1 / a,
      del = sum;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  let b = x + 1 - a,
    c = 1e300,
    d = 1 / b,
    h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - gln) * h);
}
/** the χ² upper tail P(X ≥ x | df) */
const chi2Sf = (x: number, df: number) => (df >= 1 && x >= 0 ? C.kit().chi2Sf(x, df) : NaN); // the kernel's tail
/** erfc: Taylor series of erf below 2, Lentz continued fraction above (relative error ~1e-15) */
function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) {
    let s = x,
      t = x;
    const x2 = x * x;
    for (let n = 1; n < 100; n++) {
      t *= -x2 / n;
      const d = t / (2 * n + 1);
      s += d;
      if (Math.abs(d) < 1e-17) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * s;
  }
  let f = x,
    Cc = x,
    D = 0; // erfc(x) = e^(−x²)/√π / (x + ½/(x + 1/(x + 3/2/(x + …))))
  for (let n = 1; n < 300; n++) {
    const an = n / 2;
    D = x + an * D;
    D = D === 0 ? 1e-300 : 1 / D;
    Cc = x + an / Cc;
    if (Cc === 0) Cc = 1e-300;
    const del = Cc * D;
    f *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}
const Phi = (z: number) => 0.5 * erfc(-z / Math.SQRT2);
const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
/** Φ⁻¹(p): the kernel's AS 241 */
const PhiInv = (p: number) => C.kit().normInv(p);
/** truncation selection intensity i = φ(x)/p, x = Φ⁻¹(1 − p) (Falconer & Mackay 1996 ch. 11) */
const intensity = (p: number) => (p > 0 && p < 1 ? phi(PhiInv(1 - p)) / p : NaN);

/* ---------- seeded sampling ---------- */
/** Binomial(n, p): inversion when n·min(p, 1−p) < 10, else Hörmann's (1993) BTRS transformed rejection — exact, O(1) expected */
function binomial(rand: () => number, n: number, p: number): number {
  if (!(n >= 0) || !(p >= 0 && p <= 1)) return NaN;
  if (n === 0 || p === 0) return 0;
  if (p === 1) return n;
  if (p > 0.5) return n - binomial(rand, n, 1 - p);
  if (n * p < 10) {
    // inversion by the recurrence f(k+1) = f(k)·(n−k)/(k+1)·p/q
    const s = p / (1 - p);
    let f = Math.exp(n * Math.log1p(-p)),
      F = f,
      k = 0;
    const u = rand();
    while (u > F && k < n) {
      f *= (s * (n - k)) / (k + 1);
      k++;
      F += f;
      if (f < 1e-300 && F >= 1 - 1e-15) break;
    }
    return k;
  }
  const q = 1 - p,
    spq = Math.sqrt(n * p * q),
    b = 1.15 + 2.53 * spq,
    a = -0.0873 + 0.0248 * b + 0.01 * p,
    c = n * p + 0.5;
  const alpha = (2.83 + 5.1 / b) * spq,
    vr = 0.92 - 4.2 / b,
    m = Math.floor((n + 1) * p),
    lpq = Math.log(p / q);
  const h = logFact(m) + logFact(n - m);
  for (let it = 0; it < 1000; it++) {
    const U = rand() - 0.5,
      V0 = rand(),
      us = 0.5 - Math.abs(U),
      k = Math.floor(((2 * a) / us + b) * U + c);
    if (k < 0 || k > n) continue;
    if (us >= 0.07 && V0 <= vr) return k;
    const V = Math.log((V0 * alpha) / (a / (us * us) + b));
    if (V <= h - logFact(k) - logFact(n - k) + (k - m) * lpq) return k;
  }
  return Math.round(n * p); // unreachable in practice (acceptance ≥ 0.8 per try)
}
/** Poisson(λ) by inversion on pieces of λ ≤ 30 (exact; λ ≤ 1e5) */
function poisson(rand: () => number, lam: number) {
  if (!(lam >= 0) || lam > 1e5) return NaN;
  let k = 0;
  while (lam > 0) {
    const l = Math.min(lam, 30);
    lam -= l;
    let p = Math.exp(-l),
      F = p,
      j = 0;
    const u = rand();
    while (u > F && j < 1000) {
      j++;
      p *= l / j;
      F += p;
    }
    k += j;
  }
  return k;
}
const expo = (rand: () => number, rate: number) => -Math.log(1 - rand()) / rate;
/** the variates of a stream: the kernel's (NoemaSimKit stream: binomial and Poisson by inversion, one uniform each — CRN-friendly;
      exponential by inversion), else this module's samplers on a bare uniform function (FALLBACK) */
const sampler = (r: Uniform) =>
  typeof r.binomial === 'function'
    ? {
        binomial: (n: number, p: number) => r.binomial!(n, p),
        poisson: (l: number) => (l > 1e5 ? NaN : r.poisson!(l)),
        exp: (rate: number) => r.exp!(rate),
      }
    : {
        binomial: (n: number, p: number) => binomial(r, n, p),
        poisson: (l: number) => poisson(r, l),
        exp: (rate: number) => expo(r, rate),
      };

/* ---------- the model tables (the same as the former Python twin (tests/fixtures/parity/enginelib.json)) ---------- */
const LOCUS: Table = {
  id: 'name!',
  alleles: { $req: true, $list: 'id', min: 1, max: 6 },
  dominance: 'enum:complete|incomplete|codominant',
  codominant: { $list: { $list: 'id', min: 2, max: 2 }, max: 6 },
  chrom: 'enum:auto|X|Z',
  lethal: { $list: { $obj: { genotype: { $req: true, $list: 'id', min: 1, max: 2 }, viability: 'numx' } }, max: 8 },
};
const PARENT: TableNode = { $req: true, $map: { $list: 'id', min: 1, max: 2 }, max: 6 };
// prettier-ignore
const TABLES: Readonly<Record<string, Table>> = {
  cross: { mode: 'enum:cross!', loci: { $req: true, $list: { $obj: LOCUS }, min: 1, max: 6 }, p1: PARENT, p2: PARENT,
    linkage: { $list: { $obj: { a: 'ref!', b: 'ref!', r: 'numx!' } }, max: 5 }, coincidence: 'numx',
    epistasis: { $obj: { a: 'ref!', b: 'ref!', type: 'enum:none|recessive|dominant|duplicateRecessive|duplicateDominant|dominantSuppression|cumulative|custom!', classes: { $list: 'int:0:3', min: 4, max: 4 } } },
    observed: { $list: 'numx', max: 64 }, classLabels: { $list: 'key', max: 16 } },
  pedigree: { mode: 'enum:pedigree!', inheritance: 'enum:AD|AR|XD|XR|Y|mt!', q: 'numx', penetrance: 'numx', phenocopy: 'numx', showRisk: 'bool',
    people: { $req: true, $list: { $obj: { id: 'id!', sex: 'enum:f|m|u!', mother: 'ref', father: 'ref', affected: 'bool' } }, min: 1, max: 24 } },
  hw: { mode: 'enum:hw!', freqs: { $req: true, $list: 'numx', min: 2, max: 8 }, F: 'numx', chrom: 'enum:auto|X', counts: { $list: 'numx', min: 3, max: 3 } },
  selection: { mode: 'enum:selection!', p0: 'numx!', w11: 'numx', w12: 'numx', w22: 'numx', mu: 'numx', nu: 'numx', m: 'numx', pm: 'numx', drive: 'numx', gens: 'numx' },
  drift: { mode: 'enum:drift!', process: 'enum:wf|moran', N: 'numx!', p0: 'numx!', s: 'numx', h: 'numx', mu: 'numx', nu: 'numx', reps: 'numx', gens: 'numx' },
  map: { mode: 'enum:map!', r: 'numx', d: 'numx',
    threePoint: { $obj: { loci: { $req: true, $list: 'id', min: 3, max: 3 }, classes: { $req: true, $list: { $obj: { alleles: { $req: true, $list: 'int:0:1', min: 3, max: 3 }, n: 'numx!' } }, min: 2, max: 8 } } } },
  coalescent: { mode: 'enum:coalescent!', n: 'numx!', Ne: 'numx!', mu: 'numx', reps: 'numx' },
  ld: { mode: 'enum:ld!', pAB: 'numx', pAb: 'numx', paB: 'numx', pab: 'numx', pA: 'numx', pB: 'numx', D: 'numx', c: 'numx!', gens: 'numx', Ne: 'numx' },
  quant: { mode: 'enum:quant!', h2: 'numx', sigmaP: 'numx', S: 'numx', sel: 'numx', gens: 'numx', mean0: 'numx', a: 'numx', d: 'numx', p: 'numx', K: 'numx', Kr: 'numx', rel: 'numx',
    sim: { $obj: { N: 'numx!', L: 'numx!', gens: 'numx!', sel: 'numx!', h2: 'numx!' } } },
};
/* what each mode computes: of → [kind, arg] (arg: none · 'pattern' · 'int' · 'id' · 'pair') */
const S = 'scalar',
  SE = 'series',
  SC = 'scene';
// prettier-ignore
const OUTS: Readonly<Record<string, Readonly<Record<string, OutDef>>>> = {
  cross: { frac: [S, 'pattern'], classFrac: [S, 'int'], ratio: [S, 'int'], nClasses: [S], nGenotypes: [S], nGametes1: [S], nGametes2: [S], survival: [S], chi2: [S], df: [S], pValue: [S], minExpected: [S], valid: [S],
    classIndex: [SE], classFracs: [SE], ratios: [SE], expected: [SE], observed: [SE], punnett: [SC] },
  pedigree: { carrier: [S, 'id'], het: [S, 'id'], affectedProb: [S, 'id'], likelihood: [S], logL10: [S], consistent: [S], combos: [S], valid: [S], pedigree: [SC] },
  hw: { geno: [S, 'pair'], het: [S], homo: [S], male: [S, 'int'], xRatio: [S, 'int'], n: [S], pHat: [S], Fhat: [S], expAA: [S], expAa: [S], expaa: [S], chi2: [S], df: [S], pChi2: [S], pExact: [S], valid: [S],
    pGrid: [SE], fAA: [SE], fAa: [SE], faa: [SE], deFinetti: [SC] },
  selection: { pFinal: [S], qFinal: [S], wbarFinal: [S], pEq: [S], eqStable: [S], deltaP0: [S], gens: [S], valid: [S],
    t: [SE], p: [SE], q: [SE], wbar: [SE], fAA: [SE], fAa: [SE], faa: [SE], pGrid: [SE], deltaPGrid: [SE], wbarGrid: [SE] },
  drift: { fixed: [S], lost: [S], segregating: [S], meanP: [S], meanH: [S], hTheory: [S], uTheory: [S], uNeutral: [S], tFix: [S], tLoss: [S], tAbs: [S], meanTfix: [S], valid: [S],
    t: [SE], meanPs: [SE], meanHs: [SE], hTheoryS: [SE], rep: [SE, 'int'], histX: [SE], hist: [SE] },
  map: { haldane: [S], kosambi: [S], rHaldane: [S], rKosambi: [S], middle: [S], d12: [S], d23: [S], dSum: [S], dOuter: [S], coincidence: [S], interference: [S], nTotal: [S], valid: [S],
    mapR: [SE], mapMorgan: [SE], mapHaldane: [SE], mapKosambi: [SE], geneMap: [SC] },
  coalescent: { tmrca: [S], totalLength: [S], S: [S], pi: [S], thetaW: [S], tajimaD: [S], eTmrca: [S], eTotal: [S], eS: [S], aN: [S], meanTmrca: [S], meanTotal: [S], meanS: [S], meanD: [S], valid: [S],
    sfsI: [SE], sfs: [SE], sfsTheory: [SE], tree: [SC] },
  ld: { D: [S], Dprime: [S], r2: [S], pA: [S], pB: [S], Dmax: [S], halfLife: [S], Dfinal: [S], r2Sved: [S], sigma2: [S], valid: [S], t: [SE], Dt: [SE], r2t: [SE] },
  quant: { R: [S], i: [S], Sel: [S], meanFinal: [S], M: [S], alpha: [S], VA: [S], VD: [S], VG: [S], bvAA: [S], bvAa: [S], bvaa: [S], h2Liab: [S], xg: [S], xr: [S],
    simMean: [S], simVA: [S], simH2: [S], simP: [S], valid: [S], t: [SE], mean: [SE], simT: [SE], simMeans: [SE], simVAs: [SE], simPs: [SE] },
};
/* two-locus epistasis: the class of A_B_, A_bb, aaB_, aabb (Bateson 1909; Griffiths et al., Introduction to Genetic Analysis, ch. 6) */
const EPI: Readonly<Record<string, readonly number[]>> = {
  none: [0, 1, 2, 3],
  recessive: [0, 1, 2, 2],
  dominant: [0, 0, 1, 2],
  duplicateRecessive: [0, 1, 1, 1],
  duplicateDominant: [0, 0, 0, 1],
  dominantSuppression: [0, 0, 1, 0],
  cumulative: [0, 1, 1, 2],
};

/* ---------- checkSpec (the same problems, in the same order, as the former Python twin check_spec (tests/fixtures/parity/enginelib.json)) ---------- */
const ARG_MSG: Readonly<Record<string, string>> = {
  pattern: 'needs a genotype pattern (one token per locus: _, A_, A/a or A/)',
  int: 'needs an integer from 0 to 4095',
  id: 'needs the id of a person of the pedigree',
  pair: 'needs two allele indices i/j (0-based, i <= j)',
};
/** the number of distinct values (numbers, texts, booleans; anything else counts as distinct) — as the former Python twin (tests/fixtures/parity/enginelib.json) */
const uniqCount = (a: readonly unknown[]) =>
  new Set(
    a.map((x, i) =>
      typeof x === 'number'
        ? `n${x}`
        : typeof x === 'string'
          ? 's' + x
          : typeof x === 'boolean'
            ? 'b' + String(x)
            : x === null
              ? 'z'
              : `o${i}`,
    ),
  ).size;
const splitWs = (s: string) => s.split(/[ \t\n\r]+/).filter(Boolean);
function patternOk(arg: unknown, loci: readonly Rec[]) {
  if (typeof arg !== 'string') return false;
  let s = arg.trim();
  if (s.startsWith('f:') || s.startsWith('m:')) s = s.slice(2);
  const tk = splitWs(s);
  if (tk.length !== loci.length) return false;
  return tk.every((t, i) => {
    const L = loci[i]!,
      al: unknown[] = Array.isArray(L.alleles) ? L.alleles : [];
    if (t === '_') return true;
    if (t.endsWith('_')) return al.includes(t.slice(0, -1));
    const parts = t.split('/');
    if (parts.length !== 2) return false;
    if (parts[1] === '') return (L.chrom === 'X' || L.chrom === 'Z') && al.includes(parts[0]);
    return al.includes(parts[0]) && al.includes(parts[1]);
  });
}
function checkSpec(spec: unknown): Problem[] {
  const { P, E, W } = C.problems();
  const m = isObj(spec) ? spec.model : undefined;
  const mode = isObj(m) && MODES.includes(m.mode as string) ? (m.mode as string) : null;
  if (!isObj(m)) E('format', 'model', 'not an object');
  else if (!mode) E('enum', 'model.mode', 'one of ' + MODES.join(', '));
  else {
    C.walk(m, TABLES[mode]!, 'model', E, W);
    semantic(mode, m, E);
  }
  C.checkOutputs(
    spec,
    ID,
    ['scalar', 'series', 'scene'],
    (o, at) => {
      for (const k of Object.keys(o)) if (!['id', 'kind', 'of', 'arg'].includes(k)) W('unknown-field', at + '.' + k, 'ignored');
      if (!mode) return;
      const d = has(OUTS[mode]!, o.of) ? OUTS[mode]![o.of]! : null;
      if (!d || d[0] !== o.kind) {
        E(
          'output',
          at + '.of',
          `one of ${Object.keys(OUTS[mode]!)
            .filter(k => OUTS[mode]![k]![0] === o.kind)
            .join(', ')} (a ${o.kind} of mode ${mode})`,
        );
        return;
      }
      const ak = d[1];
      if (!ak) {
        if (o.arg !== undefined) W('unknown-field', at + '.arg', 'ignored');
        return;
      }
      if (o.arg === undefined) {
        E('output', at + '.arg', 'missing');
        return;
      }
      let good = true;
      if (ak === 'int') good = typeof o.arg === 'number' && Number.isInteger(o.arg) && o.arg >= 0 && o.arg <= 4095;
      else if (ak === 'id')
        good =
          typeof o.arg === 'string' &&
          Array.isArray((m as Rec).people) &&
          ((m as Rec).people as unknown[]).some((p: unknown) => isObj(p) && p.id === o.arg);
      else if (ak === 'pair') {
        const x = typeof o.arg === 'string' && /^[0-7]\/[0-7]$/.test(o.arg) ? o.arg.split('/').map(Number) : null;
        good = !!x && x[0]! <= x[1]! && Array.isArray((m as Rec).freqs) && x[1]! < ((m as Rec).freqs as unknown[]).length;
      } else if (ak === 'pattern')
        good = Array.isArray((m as Rec).loci) && ((m as Rec).loci as unknown[]).every(isObj) && patternOk(o.arg, (m as Rec).loci as Rec[]);
      if (!good) E('output', at + '.arg', ARG_MSG[ak]!);
    },
    E,
    W,
  );
  return P;
}
function semantic(mode: string, m: Rec, E: Emit): void {
  if (mode === 'cross') {
    const loci: Rec[] = Array.isArray(m.loci) ? m.loci.filter(isObj) : [];
    const ids: unknown[] = [];
    ((Array.isArray(m.loci) ? m.loci : []) as unknown[]).forEach((L, i) => {
      if (!isObj(L)) return;
      const at = `model.loci[${i}]`;
      if (typeof L.id === 'string') {
        if (ids.includes(L.id)) E('value', at + '.id', 'duplicate id');
        ids.push(L.id);
      }
      const al: unknown[] = Array.isArray(L.alleles) ? L.alleles : [];
      if (uniqCount(al) !== al.length) E('value', at + '.alleles', 'duplicate allele');
      if (al.some(a => typeof a === 'string' && a.includes('_'))) E('value', at + '.alleles', 'allele names cannot contain _');
      ((Array.isArray(L.codominant) ? L.codominant : []) as unknown[]).forEach((pr, j) => {
        if (Array.isArray(pr) && !pr.every(a => al.includes(a))) E('ref', `${at}.codominant[${j}]`, 'not an allele of this locus');
      });
      ((Array.isArray(L.lethal) ? L.lethal : []) as unknown[]).forEach((x, j) => {
        const g: unknown[] | null = isObj(x) && Array.isArray(x.genotype) ? x.genotype : null;
        if (!g) return;
        if (!g.every(a => al.includes(a))) E('ref', `${at}.lethal[${j}].genotype`, 'not an allele of this locus');
        else if (g.length === 1 && !(L.chrom === 'X' || L.chrom === 'Z'))
          E('value', `${at}.lethal[${j}].genotype`, 'one allele only on an X- or Z-linked locus');
      });
    });
    const chroms = loci.map(L => L.chrom || 'auto');
    if (chroms.includes('X') && chroms.includes('Z')) E('value', 'model.loci', 'X- and Z-linked loci cannot be mixed');
    const sys = chroms.includes('Z') ? 'Z' : 'X';
    for (const pk of ['p1', 'p2']) {
      const G = m[pk];
      if (!isObj(G)) continue;
      for (const k of Object.keys(G)) if (!ids.includes(k)) E('ref', `model.${pk}.${k}`, 'not a locus');
      loci.forEach(L => {
        if (typeof L.id !== 'string') return;
        const g: unknown = has(G, L.id) ? G[L.id] : undefined;
        if (g === undefined) {
          E('value', `model.${pk}.${L.id}`, 'missing');
          return;
        }
        if (!Array.isArray(g)) return;
        const al: unknown[] = Array.isArray(L.alleles) ? L.alleles : [];
        if (!g.every((a: unknown) => al.includes(a))) {
          E('ref', `model.${pk}.${L.id}`, 'not an allele of this locus');
          return;
        }
        const ch = L.chrom || 'auto';
        const hemi = (ch === 'X' && pk === 'p2') || (ch === 'Z' && pk === 'p1');
        const need = ch === 'auto' || !hemi ? 2 : 1;
        if (g.length !== need)
          E(
            'value',
            `model.${pk}.${L.id}`,
            need === 2
              ? 'needs 2 alleles'
              : `needs 1 allele (the ${pk === 'p1' ? 'mother' : 'father'} is hemizygous: ${sys === 'Z' ? 'ZW' : 'XY'})`,
          );
      });
    }
    const deg = Object.create(null) as Record<string, number>,
      edges: Array<[string, string]> = [];
    ((Array.isArray(m.linkage) ? m.linkage : []) as unknown[]).forEach((x, j) => {
      if (!isObj(x)) return;
      const at = `model.linkage[${j}]`;
      for (const f of ['a', 'b']) if (typeof x[f] === 'string' && !ids.includes(x[f])) E('ref', `${at}.${f}`, 'not a locus');
      if (!ids.includes(x.a) || !ids.includes(x.b)) return;
      if (x.a === x.b) {
        E('value', at, 'a locus cannot be linked to itself');
        return;
      }
      const ca = loci.find(L => L.id === x.a)!.chrom || 'auto',
        cb = loci.find(L => L.id === x.b)!.chrom || 'auto';
      if (ca !== cb) {
        E('value', at, 'linked loci must be on the same kind of chromosome');
        return;
      }
      deg[x.a as string] = (deg[x.a as string] || 0) + 1;
      deg[x.b as string] = (deg[x.b as string] || 0) + 1;
      edges.push([x.a as string, x.b as string]);
      if (deg[x.a as string]! > 2 || deg[x.b as string]! > 2 || chainOf(edges).cycle)
        E('value', at, 'linkage must form chains of loci (each locus between at most two others, no loop)');
    });
    const ep = m.epistasis;
    if (isObj(ep) && typeof ep.a === 'string' && typeof ep.b === 'string') {
      for (const f of ['a', 'b']) if (!ids.includes(ep[f])) E('ref', `model.epistasis.${f}`, 'not a locus');
      if (ids.includes(ep.a) && ids.includes(ep.b)) {
        if (ep.a === ep.b) E('value', 'model.epistasis', 'needs two different loci');
        else
          for (const f of ['a', 'b']) {
            const L = loci.find(x => x.id === ep[f])!;
            if (!(
              Array.isArray(L.alleles) &&
              L.alleles.length === 2 &&
              (L.dominance || 'complete') === 'complete' &&
              (L.chrom || 'auto') === 'auto'
            ))
              E('value', `model.epistasis.${f}`, 'needs an autosomal locus with 2 alleles and complete dominance');
          }
      }
      if (ep.type === 'custom' && !Array.isArray(ep.classes))
        E('value', 'model.epistasis.classes', 'missing (custom: the class of A_B_, A_bb, aaB_, aabb)');
    }
  } else if (mode === 'pedigree') {
    const ps: unknown[] = Array.isArray(m.people) ? m.people : [],
      ids: string[] = [];
    ps.forEach((p, i) => {
      if (isObj(p) && typeof p.id === 'string') {
        if (ids.includes(p.id)) E('value', `model.people[${i}].id`, 'duplicate id');
        ids.push(p.id);
      }
    });
    const by = Object.create(null) as Record<string, Rec | undefined>;
    ps.forEach(p => {
      if (isObj(p) && typeof p.id === 'string' && !by[p.id]) by[p.id] = p;
    });
    const sexed = m.inheritance === 'XD' || m.inheritance === 'XR' || m.inheritance === 'Y';
    ps.forEach((p, i) => {
      if (!isObj(p)) return;
      const at = `model.people[${i}]`;
      if (sexed && p.sex === 'u') E('value', at + '.sex', 'f or m (this inheritance depends on sex)');
      if ((p.mother === undefined) !== (p.father === undefined)) {
        E('value', at, 'needs both parents or none');
        return;
      }
      if (p.mother === undefined) return;
      for (const [f, sx] of [
        ['mother', 'f'],
        ['father', 'm'],
      ] as const) {
        if (typeof p[f] !== 'string') continue;
        if (!by[p[f]]) E('ref', `${at}.${f}`, 'not a person of the pedigree');
        else if (p[f] === p.id) E('value', `${at}.${f}`, 'a person cannot be their own parent');
        else if (by[p[f]]!.sex !== sx)
          E('value', `${at}.${f}`, f === 'mother' ? 'the mother must have sex f' : 'the father must have sex m');
      }
    });
    const seen = Object.create(null) as Record<string, number>,
      cyc = (id: string): boolean => {
        if (seen[id] === 1) return true;
        if (seen[id] === 2) return false;
        seen[id] = 1;
        const p = by[id];
        let r = false;
        if (p && typeof p.mother === 'string' && typeof p.father === 'string' && by[p.mother] && by[p.father])
          r = cyc(p.mother) || cyc(p.father);
        seen[id] = 2;
        return r;
      };
    if (ids.some(id => cyc(id))) E('value', 'model.people', 'a person is their own ancestor');
    else {
      let combos = 1;
      for (const p of ps) if (isObj(p)) combos *= nGeno(m.inheritance, p.sex);
      if (combos > BUDGET) E('size', 'model.people', `more than ${BUDGET} genotype combinations (${combos}): fewer people`);
    }
  } else if (mode === 'hw') {
    if (m.chrom === 'X' && Array.isArray(m.counts)) E('value', 'model.counts', 'the tests are for an autosomal locus');
    else if (Array.isArray(m.counts) && Array.isArray(m.freqs) && m.freqs.length !== 2)
      E('value', 'model.counts', 'the tests need 2 alleles');
  } else if (mode === 'map') {
    const tp = m.threePoint;
    if (isObj(tp) && Array.isArray(tp.classes)) {
      const ks: string[] = [];
      tp.classes.forEach((c: unknown, i) => {
        if (isObj(c) && Array.isArray(c.alleles) && c.alleles.length === 3 && c.alleles.every((x: unknown) => x === 0 || x === 1)) {
          const k = c.alleles.join('');
          if (ks.includes(k)) E('value', `model.threePoint.classes[${i}].alleles`, 'the same class twice');
          ks.push(k);
        }
      });
      if (Array.isArray(tp.loci) && uniqCount(tp.loci) !== tp.loci.length) E('value', 'model.threePoint.loci', 'duplicate locus');
    }
  } else if (mode === 'ld') {
    const four = ['pAB', 'pAb', 'paB', 'pab'].filter(k => m[k] !== undefined).length,
      three = ['pA', 'pB', 'D'].filter(k => m[k] !== undefined).length;
    if (!((four === 4 && three === 0) || (four === 0 && three === 3)))
      E('value', 'model', 'needs the four haplotype frequencies pAB, pAb, paB, pab or pA, pB and D');
  }
}
const nGeno = (inh: unknown, sex: unknown) =>
  inh === 'mt' ? 2 : inh === 'Y' ? (sex === 'm' ? 2 : 1) : (inh === 'XD' || inh === 'XR') && sex === 'm' ? 2 : 3;
/** the chains of a set of edges [[a, b]]: {chains: [[ids in order]], cycle} */
function chainOf(edges: ReadonlyArray<readonly [string, string]>) {
  const adj = Object.create(null) as Record<string, string[]>,
    order: string[] = [];
  for (const [a, b] of edges) {
    for (const [u, v] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!adj[u]) {
        adj[u] = [];
        order.push(u);
      }
      adj[u].push(v);
    }
  }
  const done = Object.create(null) as Record<string, number>,
    chains: string[][] = [];
  let cycle = false;
  for (const s of order) {
    if (done[s] || adj[s]!.length !== 1) continue;
    const ch = [s];
    done[s] = 1;
    let prev: string | null = null,
      cur = s;
    for (;;) {
      const nx = adj[cur]!.find(x => x !== prev && !done[x]);
      if (nx === undefined) break;
      ch.push(nx);
      done[nx] = 1;
      prev = cur;
      cur = nx;
    }
    chains.push(ch);
  }
  if (order.some(k => !done[k])) cycle = true;
  return { chains, cycle };
}

/* ---------- exprs and keys ---------- */
function exprs(spec: unknown): Array<[string, string, string[]]> {
  const out: Array<[string, string, string[]]> = [],
    m: Rec = isObj(spec) && isObj(spec.model) ? spec.model : {};
  const add = (v: unknown, p: string) => {
    if (typeof v === 'string') out.push([v, p, []]);
  };
  const walkT = (o: unknown, T: Table, p: string): void => {
    if (!isObj(o)) return;
    for (const k of Object.keys(T)) {
      const kd = T[k]!,
        v = o[k],
        q = p + '.' + k;
      if (v === undefined) continue;
      if (typeof kd === 'string') {
        if (kd.replace('!', '') === 'numx') add(v, q);
      } else if (kd.$obj) walkT(v, kd.$obj, q);
      else if (kd.$list && Array.isArray(v))
        v.forEach((x: unknown, i) => {
          if (typeof kd.$list === 'string') {
            if (kd.$list === 'numx') add(x, `${q}[${i}]`);
          } else if (kd.$list!.$obj) walkT(x, kd.$list!.$obj, `${q}[${i}]`);
        });
    }
  };
  if (MODES.includes(m.mode as string)) walkT(m, TABLES[m.mode as string]!, 'model');
  return out;
}
function keys(spec: unknown): Array<[string, string]> {
  const m: Rec = isObj(spec) && isObj(spec.model) ? spec.model : {};
  return m.mode === 'cross' && Array.isArray(m.classLabels)
    ? m.classLabels.map((k: string, i): [string, string] => [k, `model.classLabels[${i}]`])
    : [];
}

/* ---------- evaluation of the model's numbers ---------- */
const CXC = new Map<unknown, NumFn>();
function num(v: unknown, env: Rec, dflt: number): number {
  if (v === undefined) return dflt;
  if (typeof v === 'number') return v;
  let f = CXC.get(v);
  if (!f) {
    f = C.cx(v);
    if (CXC.size > 512) CXC.clear();
    CXC.set(v, f);
  }
  return f(env);
}
const grid = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const ROLE = ['hi', 'ok', 'info', 'warn', 'bad', 'muted', 'base'];

/* ======================= cross ======================= */
function runCross(m: CrossModel, env: Rec) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const loci: CLocus[] = m.loci.map(L => ({
    id: L.id,
    al: L.alleles,
    dom: L.dominance || 'complete',
    chrom: L.chrom || 'auto',
    co: (L.codominant || []).map(p => p.slice().sort().join('|')),
    lethal: (L.lethal || []).map(x => ({ g: x.genotype.slice().sort().join('|'), v: num(x.viability, env, 0) })),
  }));
  const nL = loci.length,
    idx = Object.create(null) as Record<string, number>;
  loci.forEach((L, i) => {
    idx[L.id] = i;
  });
  const sexSys = loci.some(L => L.chrom === 'Z') ? 'Z' : loci.some(L => L.chrom === 'X') ? 'X' : null;
  const rOf = Object.create(null) as Record<string, number>;
  let bad = false;
  for (const x of m.linkage || []) {
    const r = num(x.r, env, NaN);
    if (!(r >= 0 && r <= 0.5)) {
      codes.push('r-range');
      bad = true;
    }
    rOf[x.a + '|' + x.b] = rOf[x.b + '|' + x.a] = r;
  }
  const coin = num(m.coincidence, env, 1);
  if (!(coin >= 0)) {
    codes.push('coincidence-range');
    bad = true;
  }
  const { chains } = chainOf((m.linkage || []).map((x): [string, string] => [x.a, x.b]));
  const inChain = Object.create(null) as Record<string, number>;
  chains.forEach(ch => {
    ch.forEach(id => {
      inChain[id] = 1;
    });
  });
  const groups = chains.map(ch => ch.map(id => idx[id]!)).concat(loci.filter(L => !inChain[L.id]).map(L => [idx[L.id]!]));
  // crossover patterns of a chain of k loci: [{x: [0/1 per interval], p}]; three loci use the coefficient of coincidence c
  function patterns(g: readonly number[]) {
    const k = g.length,
      rs: number[] = [];
    for (let i = 0; i + 1 < k; i++) rs.push(rOf[loci[g[i]!]!.id + '|' + loci[g[i + 1]!]!.id]!);
    const pats: Array<{ x: number[]; p: number }> = [];
    for (let mask = 0; mask < 1 << (k - 1); mask++) {
      const x: number[] = [];
      for (let i = 0; i < k - 1; i++) x.push((mask >> i) & 1);
      let p: number;
      if (k === 3) {
        const [r1, r2] = rs as [number, number],
          dco = coin * r1 * r2;
        p = x[0] && x[1] ? dco : x[0] ? r1 - dco : x[1] ? r2 - dco : 1 - r1 - r2 + dco;
      } else {
        p = 1;
        x.forEach((b, i) => {
          p *= b ? rs[i]! : 1 - rs[i]!;
        });
      }
      pats.push({ x, p });
    }
    return pats;
  }
  if (!bad)
    for (const g of groups)
      if (g.length === 3) {
        for (const pt of patterns(g))
          if (pt.p < -1e-12) {
            codes.push('coincidence-range');
            bad = true;
            break;
          }
      }
  if (bad) return { out: { valid: 0, survival: NaN }, codes };
  function gametes(G: Readonly<Record<string, readonly string[]>>, pk: string) {
    let list: Gamete[] = [{ a: new Array<number>(nL).fill(-1), sc: null, p: 1 }];
    const hemiSide = !!sexSys && ((sexSys === 'X' && pk === 'p2') || (sexSys === 'Z' && pk === 'p1'));
    for (const g of groups) {
      const sexLinked = loci[g[0]!]!.chrom !== 'auto';
      const opts: Array<{ set: number[]; sc: string | null; p: number }> = [];
      if (sexLinked && hemiSide) {
        // the one X (Z) or the Y (W): ½ each, no recombination
        opts.push(
          { set: g.map(li => loci[li]!.al.indexOf(G[loci[li]!.id]![0]!)), sc: sexSys, p: 0.5 },
          { set: g.map(() => -1), sc: sexSys === 'X' ? 'Y' : 'W', p: 0.5 },
        );
      } else {
        const h = [0, 1].map(j => g.map(li => loci[li]!.al.indexOf(G[loci[li]!.id]![j]!))); // haplotype j = the j-th allele listed at each locus
        for (const pt of g.length > 1 ? patterns(g) : [{ x: [], p: 1 }])
          for (const s0 of [0, 1]) {
            let hs = s0;
            const a = [h[hs]![0]!];
            for (let i = 1; i < g.length; i++) {
              if (pt.x[i - 1]) hs = 1 - hs;
              a.push(h[hs]![i]!);
            }
            opts.push({ set: a, sc: sexLinked ? sexSys : null, p: pt.p * 0.5 });
          }
      }
      const nx: Gamete[] = [];
      for (const b of list)
        for (const o of opts) {
          if (o.p <= 0) continue;
          const a = b.a.slice();
          g.forEach((li, i) => {
            a[li] = o.set[i]!;
          });
          nx.push({ a, sc: o.sc || b.sc, p: b.p * o.p });
        }
      list = nx;
    }
    const mp = new Map<string, Gamete>();
    for (const x of list) {
      const k = x.a.join(',') + ':' + String(x.sc);
      const y = mp.get(k);
      if (y) y.p += x.p;
      else mp.set(k, { a: x.a, sc: x.sc, p: x.p });
    }
    return [...mp.values()];
  }
  const g1 = gametes(m.p1, 'p1'),
    g2 = gametes(m.p2, 'p2');
  // the expressed alleles of one locus (by rank; codominant pairs and incomplete dominance express both)
  function expressed(L: CLocus, gs: readonly number[]) {
    const u = [...new Set(gs)].sort((a, b) => a - b);
    if (!u.length) return [];
    if (L.dom !== 'complete') return u;
    const top = u[0]!,
      ex = [top];
    for (const a of u.slice(1)) if (L.co.includes([L.al[top], L.al[a]].sort().join('|'))) ex.push(a);
    return ex;
  }
  const ep = isObj(m.epistasis) ? m.epistasis : null,
    epMap = ep ? (ep.type === 'custom' ? ep.classes : EPI[ep.type]) : null;
  const ea = ep ? idx[ep.a]! : -1,
    eb = ep ? idx[ep.b]! : -1;
  const zyg: Zygote[] = [];
  let surv = 0,
    total = 0;
  for (const x of g1)
    for (const y of g2) {
      const w0 = x.p * y.p;
      total += w0;
      const sexes: Array<[string, number]> =
        sexSys === 'X'
          ? [[y.sc === 'Y' ? 'm' : 'f', 1]]
          : sexSys === 'Z'
            ? [[x.sc === 'W' ? 'f' : 'm', 1]]
            : [
                ['f', 0.5],
                ['m', 0.5],
              ];
      const geno = loci.map((L, i) => [x.a[i]!, y.a[i]!].filter(a => a >= 0).sort((a, b) => a - b));
      let v = 1;
      geno.forEach((gg, i) => {
        const k = gg
          .map(a => loci[i]!.al[a])
          .sort()
          .join('|');
        for (const l of loci[i]!.lethal) if (l.g === k) v *= Math.max(0, Math.min(1, l.v));
      });
      for (const [sx, fs] of sexes) {
        const w = w0 * fs * v;
        const parts = loci.map((L, i) =>
          expressed(L, geno[i]!)
            .map(a => L.al[a])
            .join('+'),
        );
        let cls = 0,
          label: string;
        if (epMap) {
          const aD = geno[ea]!.includes(0),
            bD = geno[eb]!.includes(0);
          cls = epMap[(aD ? 0 : 2) + (bD ? 0 : 1)]!;
          label = `E${cls}${parts
            .filter((_, i) => i !== ea && i !== eb)
            .map(s => ' ' + s)
            .join('')}`;
        } else label = parts.join(' ');
        zyg.push({ geno, sx, w, label, cls });
        surv += w;
      }
    }
  if (!(surv > 0)) {
    codes.push('all-lethal');
    return { out: { valid: 0, survival: 0, nClasses: 0 }, codes };
  }
  const clsMap = new Map<string, PhenoClass>();
  for (const z of zyg) {
    if (z.w <= 0) continue;
    const c = clsMap.get(z.label) || { label: z.label, cls: z.cls, p: 0 };
    c.p += z.w / surv;
    clsMap.set(z.label, c);
  }
  // class order: the epistasis class, then the most frequent first, then the label
  const classes = [...clsMap.values()].sort(
    (a, b) =>
      (epMap ? a.cls - b.cls : 0) ||
      (b.p - a.p > 1e-12 ? 1 : a.p - b.p > 1e-12 ? -1 : 0) ||
      (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  );
  const probs = classes.map(c => c.p);
  out.nClasses = classes.length;
  out.nGenotypes = new Set(zyg.filter(z => z.w > 0).map(z => z.geno.map(g => g.join('/')).join(' ') + (sexSys ? ':' + z.sx : ''))).size;
  out.nGametes1 = g1.length;
  out.nGametes2 = g2.length;
  out.survival = surv / total;
  const rat = ratioOf(probs);
  out.classIndex = probs.map((_, i) => i);
  out.classFracs = probs;
  out.ratios = rat || probs.map(() => NaN);
  function fracOf(pat: string) {
    let s = pat.trim(),
      sx: string | null = null;
    if (s.startsWith('f:') || s.startsWith('m:')) {
      sx = s[0]!;
      s = s.slice(2);
    }
    const tk = splitWs(s);
    let nm = 0,
      den = 0;
    for (const z of zyg) {
      if (z.w <= 0 || (sx && z.sx !== sx)) continue;
      den += z.w;
      const okz = tk.every((t, i) => {
        const L = loci[i]!,
          g = z.geno[i]!.map(a => L.al[a]);
        if (t === '_') return true;
        if (t.endsWith('_')) return g.includes(t.slice(0, -1));
        const [a, b] = t.split('/');
        if (b === '') return g.length === 1 && g[0] === a;
        return g.length === 2 && [a, b].sort().join('|') === g.slice().sort().join('|');
      });
      if (okz) nm += z.w;
    }
    return den > 0 ? nm / den : NaN;
  }
  const ARG = {
    classFrac: (i: number) => (i < probs.length ? probs[i]! : NaN),
    ratio: (i: number) => (rat && i < rat.length ? rat[i]! : NaN),
    frac: fracOf,
  };
  // χ² against observed counts (in class order); Cochran's rule: warn when an expected count is below 5
  out.chi2 = out.pValue = out.df = out.minExpected = NaN;
  out.observed = [];
  out.expected = [];
  if (Array.isArray(m.observed)) {
    const obs = m.observed.map(v => num(v, env, NaN));
    out.observed = obs;
    if (obs.length !== probs.length) codes.push('observed-classes');
    else if (obs.some(v => !(v >= 0))) codes.push('observed-range');
    else {
      const N = obs.reduce((a, b) => a + b, 0),
        ex = probs.map(p => p * N);
      out.expected = ex;
      out.df = probs.length - 1;
      out.minExpected = Math.min(...ex);
      out.chi2 = N > 0 && out.df >= 1 ? obs.reduce((s, o, i) => s + ((o - ex[i]!) * (o - ex[i]!)) / ex[i]!, 0) : NaN;
      out.pValue = chi2Sf(out.chi2, out.df);
      if (out.minExpected < 5) codes.push('expected-below-5');
    }
  }
  out.valid = codes.includes('observed-classes') || codes.includes('observed-range') ? 0 : 1;
  out.punnett = punnett(g1, g2, loci, sexSys, zyg, classes, m.classLabels, codes);
  return { out, codes, ARG, classes };
}
/** the smallest whole-number ratio of class probabilities (≤ 4096 parts each), or null */
function ratioOf(ps: readonly number[]) {
  const pos = ps.filter(p => p > 1e-15);
  if (!pos.length) return null;
  const mn = Math.min(...pos);
  for (let k = 1; k <= 4096; k++) {
    const v = ps.map(p => (p / mn) * k);
    if (v.every(x => Math.abs(x - Math.round(x)) < 1e-7 * Math.max(1, x))) {
      const r = v.map(Math.round),
        g = r.reduce((a, b) => gcd(a, b), 0) || 1;
      return r.map(x => x / g);
    }
  }
  return null;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function punnett(
  g1: readonly Gamete[],
  g2: readonly Gamete[],
  loci: readonly CLocus[],
  sexSys: string | null,
  zyg: readonly Zygote[],
  classes: readonly PhenoClass[],
  labels: readonly string[] | undefined,
  codes: string[],
): SceneData {
  const n1 = g1.length,
    n2 = g2.length;
  if (n1 > 8 || n2 > 8) {
    codes.push('punnett-large');
    return { view: [0, 1, 0, 1], items: [] };
  }
  const sc = C.scene([-1.6, n2 + (Array.isArray(labels) ? 1.6 : 0.2), -n1 - 0.2, 1.4]);
  const gl = (g: Gamete) => g.a.map((a, i) => (a >= 0 ? loci[i]!.al[a] : '')).join('') + (g.sc === 'Y' || g.sc === 'W' ? g.sc : '');
  g2.forEach((g, j) => {
    sc.txt(j + 0.5, 0.45, { s: gl(g).slice(0, 64), c: 'base', anchor: 'middle' });
  });
  g1.forEach((g, i) => {
    sc.txt(-0.8, -i - 0.5, { s: gl(g).slice(0, 64), c: 'base', anchor: 'middle' });
  });
  const byLabel = new Map<string, number>();
  classes.forEach((c, i) => byLabel.set(c.label, i));
  const per = sexSys ? 1 : 2;
  for (let i = 0; i < n1; i++)
    for (let j = 0; j < n2; j++) {
      const z = zyg[(i * n2 + j) * per]!,
        ci = z.w > 0 ? byLabel.get(z.label)! : -1;
      sc.poly([j, -i, j + 1, -i, j + 1, -i - 1, j, -i - 1], {
        closed: true,
        fill: ci >= 0,
        c: ci >= 0 ? ROLE[ci % ROLE.length] : 'muted',
        dash: ci < 0,
      });
      const gs = z.geno
        .map((g, li) => {
          const L = loci[li]!,
            a = g.map(x => L.al[x]);
          if (L.chrom === 'auto') return a.join('');
          return a.length === 2 ? a.join('/') : a[0]! + '/' + (sexSys === 'X' ? 'Y' : 'W');
        })
        .join(' ');
      sc.txt(j + 0.5, -i - 0.5, { s: gs.slice(0, 64), c: 'base', anchor: 'middle' });
    }
  if (Array.isArray(labels))
    labels.slice(0, classes.length).forEach((k, i) => {
      sc.pt(n2 + 0.3, -0.3 - 0.45 * i, { r: 5, c: ROLE[i % ROLE.length] });
      sc.txt(n2 + 0.5, -0.3 - 0.45 * i, { key: k, c: 'base' });
    });
  return sc.done();
}

/* ======================= pedigree ======================= */
function runPedigree(m: PedigreeModel, env: Rec) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const inh = m.inheritance,
    q = num(m.q, env, 0.01),
    f = num(m.penetrance, env, 1),
    pc = num(m.phenocopy, env, 0);
  const none = { carrier: () => NaN, het: () => NaN, affectedProb: () => NaN };
  if (!(q >= 0 && q <= 1) || !(f >= 0 && f <= 1) || !(pc >= 0 && pc <= 1)) {
    codes.push('prob-range');
    return { out: { valid: 0 }, codes, ARG: none };
  }
  const ps = m.people,
    n = ps.length,
    ix = Object.create(null) as Record<string, number>;
  ps.forEach((p, i) => {
    ix[p.id] = i;
  });
  const mo = ps.map(p => (p.mother === undefined ? -1 : ix[p.mother]!)),
    fa = ps.map(p => (p.father === undefined ? -1 : ix[p.father]!));
  const ng = ps.map(p => nGeno(inh, p.sex));
  // the genotype = the number of disease alleles D (autosomal and X in females 0–2; X in males, Y in males, mt 0–1; Y in females 0)
  const prior = (i: number, g: number) => {
    const p = ps[i]!;
    if (inh === 'mt') return g ? q : 1 - q;
    if (inh === 'Y') return p.sex === 'm' ? (g ? q : 1 - q) : 1;
    if ((inh === 'XD' || inh === 'XR') && p.sex === 'm') return g ? q : 1 - q;
    return g === 0 ? (1 - q) * (1 - q) : g === 1 ? 2 * q * (1 - q) : q * q;
  };
  const tD = (gp: number) => (gp === 0 ? 0 : gp === 1 ? 0.5 : 1); // P(a mother with gp disease alleles transmits D)
  function trans(i: number, g: number, gm: number, gf: number) {
    const p = ps[i]!;
    if (inh === 'mt') return g === gm ? 1 : 0;
    if (inh === 'Y') return p.sex === 'm' ? (g === gf ? 1 : 0) : 1;
    const dm = tD(gm),
      df = inh === 'XD' || inh === 'XR' ? gf : tD(gf); // a father passes his one X
    if ((inh === 'XD' || inh === 'XR') && p.sex === 'm') return g ? dm : 1 - dm;
    return g === 0 ? (1 - dm) * (1 - df) : g === 1 ? dm * (1 - df) + (1 - dm) * df : dm * df;
  }
  function pen(i: number, g: number) {
    const s = ps[i]!.sex;
    let aff: boolean;
    if (inh === 'AD' || inh === 'mt' || inh === 'XD') aff = g >= 1;
    else if (inh === 'AR') aff = g === 2;
    else if (inh === 'XR') aff = s === 'm' ? g === 1 : g === 2;
    else aff = s === 'm' && g === 1;
    return aff ? f : pc;
  }
  const phen = (i: number, g: number) => (ps[i]!.affected === undefined ? 1 : ps[i]!.affected ? pen(i, g) : 1 - pen(i, g));
  let combos = 1;
  for (const k of ng) combos *= k;
  if (combos > BUDGET) {
    codes.push('budget');
    return { out: { valid: 0, combos }, codes, ARG: none };
  }
  const g = new Array<number>(n).fill(0),
    fac = new Array<number>(n);
  let L = 0;
  const carr = new Array<number>(n).fill(0),
    hetS = new Array<number>(n).fill(0),
    affNum = new Array<number>(n).fill(0),
    affDen = new Array<number>(n).fill(0);
  for (let c = 0; c < combos; c++) {
    let w = 1;
    for (let i = 0; i < n && w > 0; i++) w *= mo[i]! < 0 ? prior(i, g[i]!) : trans(i, g[i]!, g[mo[i]!]!, g[fa[i]!]!);
    if (w > 0) {
      let all = w,
        zeros = 0,
        nz = w;
      for (let i = 0; i < n; i++) {
        fac[i] = phen(i, g[i]!);
        if (fac[i] === 0) zeros++;
        else nz *= fac[i]!;
        all *= fac[i]!;
      }
      L += all;
      for (let i = 0; i < n; i++) {
        if (all > 0) {
          if (g[i]! >= 1) carr[i]! += all;
          if (g[i] === 1 && ng[i] === 3) hetS[i]! += all;
        }
        const others = zeros === 0 ? nz / fac[i]! : zeros === 1 && fac[i] === 0 ? nz : 0; // the likelihood without person i's own phenotype
        affDen[i]! += others;
        affNum[i]! += others * pen(i, g[i]!);
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      g[i]!++;
      if (g[i]! < ng[i]!) break;
      g[i] = 0;
    }
  }
  out.combos = combos;
  out.likelihood = L;
  out.logL10 = L > 0 ? Math.log10(L) : -Infinity;
  out.consistent = L > 0 ? 1 : 0;
  if (!(L > 0)) codes.push('inconsistent');
  const ARG = {
    carrier: (id: string) => (L > 0 ? carr[ix[id]!]! / L : NaN),
    het: (id: string) => (L > 0 && ng[ix[id]!] === 3 ? hetS[ix[id]!]! / L : NaN),
    affectedProb: (id: string) => (affDen[ix[id]!]! > 0 ? affNum[ix[id]!]! / affDen[ix[id]!]! : NaN),
  };
  out.valid = L > 0 ? 1 : 0;
  out.pedigree = drawPedigree(ps, mo, fa, m.showRisk ? ps.map(p => ARG.carrier(p.id)) : null);
  return { out, codes, ARG };
}
function drawPedigree(ps: readonly Person[], mo: readonly number[], fa: readonly number[], risk: readonly number[] | null) {
  const n = ps.length,
    gen = new Array<number>(n).fill(-1);
  const depth = (i: number): number => {
    if (gen[i]! >= 0) return gen[i]!;
    gen[i] = 0;
    if (mo[i]! >= 0) gen[i] = 1 + Math.max(depth(mo[i]!), depth(fa[i]!));
    return gen[i];
  };
  for (let i = 0; i < n; i++) depth(i);
  for (let i = 0; i < n; i++)
    if (mo[i]! >= 0) {
      const a = mo[i]!,
        b = fa[i]!,
        gg = Math.max(gen[a]!, gen[b]!);
      gen[a] = gen[b] = gg;
    } // spouses side by side
  const rows = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!rows.has(gen[i]!)) rows.set(gen[i]!, []);
    rows.get(gen[i]!)!.push(i);
  }
  const xs = new Array<number>(n).fill(0),
    maxG = Math.max(...gen);
  let width = 1;
  for (const r of rows.values()) {
    const ord: number[] = [];
    for (const i of r) {
      if (ord.includes(i)) continue;
      ord.push(i);
      for (let c = 0; c < n; c++)
        if (mo[c]! >= 0) {
          const sp = mo[c] === i ? fa[c]! : fa[c] === i ? mo[c]! : -1;
          if (sp >= 0 && r.includes(sp) && !ord.includes(sp)) ord.push(sp);
        }
    }
    ord.forEach((i, j) => {
      xs[i] = j * 1.6;
    });
    width = Math.max(width, ord.length * 1.6);
  }
  const y = (i: number) => -gen[i]! * 2;
  const sc = C.scene([-1, width, -maxG * 2 - 1.4, 1]);
  const drawn = new Set<string>();
  for (let c = 0; c < n; c++) {
    if (mo[c]! < 0) continue;
    const a = mo[c]!,
      b = fa[c]!,
      key = `${a}-${b}`,
      yy = y(a),
      mx = (xs[a]! + xs[b]!) / 2;
    if (!drawn.has(key)) {
      drawn.add(key);
      sc.seg(Math.min(xs[a]!, xs[b]!) + 0.3, yy, Math.max(xs[a]!, xs[b]!) - 0.3, yy, { c: 'base' });
      sc.seg(mx, yy, mx, yy - 1, { c: 'base' });
    }
    sc.seg(mx, yy - 1, xs[c]!, yy - 1, { c: 'base' });
    sc.seg(xs[c]!, yy - 1, xs[c]!, y(c) + 0.3, { c: 'base' });
  }
  for (let i = 0; i < n; i++) {
    const p = ps[i]!,
      x = xs[i]!,
      yy = y(i),
      unk = p.affected === undefined,
      role = unk ? 'muted' : p.affected ? 'bad' : 'base';
    const o = { c: role, fill: !!p.affected, closed: true, dash: unk };
    if (p.sex === 'f') sc.circ(x, yy, 0.3, { c: role, fill: !!p.affected, dash: unk });
    else if (p.sex === 'm') sc.poly([x - 0.3, yy - 0.3, x + 0.3, yy - 0.3, x + 0.3, yy + 0.3, x - 0.3, yy + 0.3], o);
    else sc.poly([x, yy - 0.35, x + 0.35, yy, x, yy + 0.35, x - 0.35, yy], o);
    sc.txt(x, yy - 0.55, { s: p.id.slice(0, 64), c: 'base', anchor: 'middle' });
    if (risk && Number.isFinite(risk[i])) sc.txt(x, yy - 0.85, { v: Math.round(risk[i]! * 1000) / 1000, c: 'info', anchor: 'middle' });
  }
  return sc.done();
}

/* ======================= Hardy–Weinberg ======================= */
/** the exact HWE test (Wigginton, Cutler & Abecasis 2005, AJHG 76:887): P of het counts as likely or less likely than observed */
function hweExact(nAA: number, nAa: number, naa: number) {
  const homr = Math.min(nAA, naa),
    homc = Math.max(nAA, naa),
    het = nAa,
    N = homr + homc + het,
    rare = 2 * homr + het;
  if (N === 0) return NaN;
  const probs = new Array<number>(rare + 1).fill(0);
  let mid = Math.floor((rare * (2 * N - rare)) / (2 * N));
  if (mid % 2 !== rare % 2) mid++;
  let ch: number,
    cr = (rare - mid) / 2,
    cc = N - mid - cr;
  probs[mid] = 1;
  let sum = 1;
  for (ch = mid; ch > 1; ch -= 2) {
    probs[ch - 2] = (probs[ch]! * ch * (ch - 1)) / (4 * (cr + 1) * (cc + 1));
    sum += probs[ch - 2]!;
    cr++;
    cc++;
  }
  cr = (rare - mid) / 2;
  cc = N - mid - cr;
  for (ch = mid; ch <= rare - 2; ch += 2) {
    probs[ch + 2] = (probs[ch]! * 4 * cr * cc) / ((ch + 2) * (ch + 1));
    sum += probs[ch + 2]!;
    cr--;
    cc--;
  }
  let p = 0;
  const po = probs[het]! / sum;
  for (let i = 0; i <= rare; i++) {
    const x = probs[i]! / sum;
    if (x <= po * (1 + 1e-9)) p += x;
  }
  return Math.min(1, p);
}
function runHW(m: HWModel, env: Rec) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const fr = m.freqs.map(v => num(v, env, NaN)),
    F = num(m.F, env, 0),
    X = m.chrom === 'X';
  const k = fr.length,
    sum = fr.reduce((a, b) => a + b, 0);
  const none = { geno: () => NaN, male: () => NaN, xRatio: () => NaN };
  if (fr.some(v => !(v >= 0 && v <= 1)) || Math.abs(sum - 1) > 1e-6) {
    codes.push('freq-sum');
    return { out: { valid: 0 }, codes, ARG: none };
  }
  if (!(F >= -1 && F <= 1)) {
    codes.push('F-range');
    return { out: { valid: 0 }, codes, ARG: none };
  }
  const geno = (i: number, j: number) => (i === j ? fr[i]! * fr[i]! + F * fr[i]! * (1 - fr[i]!) : 2 * fr[i]! * fr[j]! * (1 - F));
  let homo = 0;
  for (let i = 0; i < k; i++) homo += geno(i, i);
  out.homo = homo;
  out.het = 1 - homo;
  if (fr.some((_, i) => geno(i, i) < -1e-12)) codes.push('F-range'); // F < 0 beyond −p_min/(1 − p_min)
  const ARG = {
    geno: (s: string) => {
      const [i, j] = s.split('/').map(Number) as [number, number];
      return geno(i, j);
    },
    male: (i: number) => (X && i < k ? fr[i]! : NaN),
    xRatio: (i: number) => (X && i < k && fr[i]! > 0 ? fr[i]! / geno(i, i) : NaN),
  };
  if (Array.isArray(m.counts)) {
    const c = m.counts.map(v => num(v, env, NaN));
    if (c.some(v => !(v >= 0) || Math.abs(v - Math.round(v)) > 1e-9)) {
      codes.push('counts-range');
      Object.assign(out, { n: NaN, chi2: NaN, pChi2: NaN, pExact: NaN });
    } else {
      const [a, b, d] = c.map(Math.round) as [number, number, number],
        N = a + b + d;
      out.n = N;
      const pH = N ? (2 * a + b) / (2 * N) : NaN;
      out.pHat = pH;
      const He = 2 * pH * (1 - pH);
      out.Fhat = He > 0 ? 1 - b / N / He : NaN;
      out.expAA = N * pH * pH;
      out.expAa = N * He;
      out.expaa = N * (1 - pH) * (1 - pH);
      out.df = 1;
      if (!(pH > 0 && pH < 1)) {
        codes.push('monomorphic');
        out.chi2 = out.pChi2 = NaN;
        out.pExact = N ? 1 : NaN;
      } else {
        out.chi2 = (a - out.expAA) ** 2 / out.expAA + (b - out.expAa) ** 2 / out.expAa + (d - out.expaa) ** 2 / out.expaa;
        out.pChi2 = chi2Sf(out.chi2, 1);
        out.pExact = hweExact(a, b, d);
        if (Math.min(out.expAA, out.expAa, out.expaa) < 5) codes.push('expected-below-5');
      }
    }
  }
  const pg = grid(0, 1, 101);
  out.pGrid = pg;
  out.fAA = pg.map(p => p * p + F * p * (1 - p));
  out.fAa = pg.map(p => 2 * p * (1 - p) * (1 - F));
  out.faa = pg.map(p => (1 - p) * (1 - p) + F * p * (1 - p));
  if (k === 2) {
    // the de Finetti diagram: AA at (0, 0), aa at (1, 0), Aa at (½, √3/2)
    const h = Math.sqrt(3) / 2,
      P = (AA: number, Aa: number): [number, number] => [1 - AA - Aa + Aa * 0.5, Aa * h];
    const sc = C.scene([-0.1, 1.1, -0.1, h + 0.1]);
    sc.poly([0, 0, 1, 0, 0.5, h], { closed: true, c: 'base' });
    const pts: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const p = i / 100,
        xy = P(p * p + F * p * (1 - p), 2 * p * (1 - p) * (1 - F));
      pts.push(xy[0], xy[1]);
    }
    sc.poly(pts, { c: 'info' });
    const e = P(geno(0, 0), geno(0, 1));
    sc.pt(e[0], e[1], { r: 5, c: 'hi' });
    if (Array.isArray(m.counts) && (out.n as number) > 0) {
      const cc = m.counts.map(v => num(v, env, NaN));
      const o = P(cc[0]! / (out.n as number), cc[1]! / (out.n as number));
      sc.pt(o[0], o[1], { r: 5, c: 'warn' });
    }
    out.deFinetti = sc.done();
  }
  out.valid = codes.includes('F-range') || codes.includes('counts-range') ? 0 : 1;
  return { out, codes, ARG };
}

/* ======================= selection (deterministic) ======================= */
function runSelection(m: Rec, env: Rec) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const p0 = num(m.p0, env, NaN),
    w11 = num(m.w11, env, 1),
    w12 = num(m.w12, env, 1),
    w22 = num(m.w22, env, 1);
  const mu = num(m.mu, env, 0),
    nu = num(m.nu, env, 0),
    mg = num(m.m, env, 0),
    pm = num(m.pm, env, 0),
    k = num(m.drive, env, 0.5);
  const G = Math.round(num(m.gens, env, 100));
  if (!(p0 >= 0 && p0 <= 1) || ![mu, nu, mg, pm, k].every(v => v >= 0 && v <= 1)) codes.push('prob-range');
  if (![w11, w12, w22].every(w => w >= 0 && Number.isFinite(w))) codes.push('fitness-range');
  if (!(G >= 1 && G <= BUDGET)) codes.push('budget');
  if (codes.length) return { out: { valid: 0 }, codes };
  // one generation: selection (Aa transmits A with probability k: ½ Mendelian, otherwise meiotic drive) → mutation A→a (mu), a→A (nu) → migration (m, from a pool at pm)
  const step = (p: number): [number, number] => {
    const q = 1 - p,
      wb = p * p * w11 + 2 * p * q * w12 + q * q * w22;
    if (!(wb > 0)) return [NaN, 0];
    let ps = (p * p * w11 + 2 * p * q * w12 * k) / wb;
    ps = ps * (1 - mu) + (1 - ps) * nu;
    ps = (1 - mg) * ps + mg * pm;
    return [ps, wb];
  };
  const t = [0],
    P = [p0],
    WB: number[] = [];
  let p = p0;
  for (let g = 1; g <= G; g++) {
    const [pn, wb] = step(p);
    WB.push(wb);
    if (!Number.isFinite(pn)) {
      codes.push('extinct');
      break;
    }
    p = Math.min(1, Math.max(0, pn));
    t.push(g);
    P.push(p);
  }
  const pl = P[P.length - 1]!;
  WB.length = P.length - 1;
  WB.push(pl * pl * w11 + 2 * pl * (1 - pl) * w12 + (1 - pl) * (1 - pl) * w22);
  out.t = t;
  out.p = P;
  out.q = P.map(x => 1 - x);
  out.wbar = WB;
  out.fAA = P.map(x => x * x);
  out.fAa = P.map(x => 2 * x * (1 - x));
  out.faa = P.map(x => (1 - x) * (1 - x));
  out.pFinal = pl;
  out.qFinal = 1 - pl;
  out.wbarFinal = WB[WB.length - 1]!;
  out.gens = P.length - 1;
  out.deltaP0 = step(p0)[0] - p0;
  // the interior equilibrium of selection alone: p* = (w22 − w12)/(w11 − 2·w12 + w22); stable iff the heterozygote is fittest
  const den = w11 - 2 * w12 + w22,
    pe = den !== 0 ? (w22 - w12) / den : NaN;
  out.pEq = pe > 0 && pe < 1 ? pe : NaN;
  out.eqStable = Number.isFinite(out.pEq) ? (w12 > w11 && w12 > w22 ? 1 : 0) : NaN;
  const pg = grid(0, 1, 201);
  out.pGrid = pg;
  out.deltaPGrid = pg.map(x => step(x)[0] - x);
  out.wbarGrid = pg.map(x => x * x * w11 + 2 * x * (1 - x) * w12 + (1 - x) * (1 - x) * w22);
  out.valid = codes.length ? 0 : 1;
  return { out, codes };
}

/* ======================= drift (Wright–Fisher, Moran) ======================= */
/** Kimura (1962) u(p), fitness aa 1, Aa 1 + h·s, AA 1 + s, effective size N: ∫₀ᵖ G / ∫₀¹ G, G = exp(−4Nshx − 2Ns(1 − 2h)x²) */
function kimuraU(N: number, s: number, h: number, p: number) {
  if (!(p >= 0 && p <= 1)) return NaN;
  if (p === 0 || p === 1 || s === 0) return p;
  if (h === 0.5) {
    // closed form (1 − e^(−2Nsp))/(1 − e^(−2Ns)) with expm1
    const a = 2 * N * s;
    if (a > 700) return -Math.expm1(-a * p);
    if (a < -700) return Math.exp(a * (1 - p)); // (e^{|a|p} − 1)/(e^{|a|} − 1) → e^{−|a|(1−p)}
    return Math.expm1(-a * p) / Math.expm1(-a);
  }
  const ex = (x: number) => -4 * N * s * h * x - 2 * N * s * (1 - 2 * h) * x * x;
  const v = -h / (1 - 2 * h),
    M = Math.max(ex(0), ex(1), v > 0 && v < 1 ? ex(v) : -Infinity);
  const simpson = (a: number, b: number, nn: number) => {
    const hh = (b - a) / nn;
    let s2 = Math.exp(ex(a) - M) + Math.exp(ex(b) - M);
    for (let i = 1; i < nn; i++) s2 += (i % 2 ? 4 : 2) * Math.exp(ex(a + i * hh) - M);
    return (s2 * hh) / 3;
  };
  return simpson(0, p, 2000) / simpson(0, 1, 2000);
}
function runDrift(m: Rec, env: Rec, seed: number) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const proc = m.process || 'wf',
    N = Math.round(num(m.N, env, NaN)),
    p0 = num(m.p0, env, NaN),
    s = num(m.s, env, 0),
    h = num(m.h, env, 0.5);
  const mu = num(m.mu, env, 0),
    nu = num(m.nu, env, 0),
    reps = Math.round(num(m.reps, env, 20)),
    G = Math.round(num(m.gens, env, 100));
  const none = { rep: () => [] };
  if (!(N >= 1 && N <= 1e6)) codes.push('N-range');
  if (!(p0 >= 0 && p0 <= 1) || !(mu >= 0 && mu <= 1) || !(nu >= 0 && nu <= 1)) codes.push('prob-range');
  if (!(s > -1) || !Number.isFinite(h)) codes.push('fitness-range');
  if (!(reps >= 1 && G >= 1)) codes.push('budget');
  else if (!codes.length && reps * G * (proc === 'moran' ? N : 1) > BUDGET) codes.push('budget');
  if (codes.length) return { out: { valid: 0 }, codes, ARG: none };
  const copies = proc === 'moran' ? N : 2 * N,
    i0 = Math.round(p0 * copies);
  if (Math.abs(i0 / copies - p0) > 1e-9) codes.push('p0-rounded');
  const rand = C.rng(seed >>> 0, 'genetics-drift'),
    draw = sampler(rand);
  const meanP = new Array<number>(G + 1).fill(0),
    meanH = new Array<number>(G + 1).fill(0),
    keep = Math.min(reps, 20),
    trace: number[][] = [];
  let fixed = 0,
    lost = 0,
    tfSum = 0;
  const finals: number[] = [];
  for (let r = 0; r < reps; r++) {
    let i = i0;
    const tr = r < keep ? [i / copies] : null;
    let tFix = -1;
    meanP[0]! += i / copies;
    meanH[0]! += 2 * (i / copies) * (1 - i / copies);
    for (let g = 1; g <= G; g++) {
      if (proc === 'wf') {
        // selection, mutation, then binomial sampling of 2N gene copies
        const p = i / copies,
          q = 1 - p,
          wAA = 1 + s,
          wAa = 1 + h * s,
          wb = p * p * wAA + 2 * p * q * wAa + q * q;
        let ps = (p * p * wAA + p * q * wAa) / wb;
        ps = ps * (1 - mu) + (1 - ps) * nu;
        i = draw.binomial(copies, Math.min(1, Math.max(0, ps)));
      } else {
        for (let k = 0; k < N; k++) {
          // one birth (by fitness; the offspring may mutate) and one death (uniform) per step
          if ((i === 0 && nu === 0) || (i === N && mu === 0)) break;
          const r1 = rand(),
            r2 = rand(),
            r3 = rand();
          const fA = (1 + s) * i,
            tot = fA + (N - i);
          let birthA = r1 * tot < fA;
          if (birthA ? r3 < mu : r3 < nu) birthA = !birthA;
          i += (birthA ? 1 : 0) - (r2 * N < i ? 1 : 0);
        }
      }
      const p = i / copies;
      meanP[g]! += p;
      meanH[g]! += 2 * p * (1 - p);
      if (tr) tr.push(p);
      if (i === copies && tFix < 0) tFix = g;
    }
    if (tr) trace.push(tr);
    if (i === copies) {
      fixed++;
      tfSum += tFix;
    } else if (i === 0) lost++;
    finals.push(i / copies);
  }
  out.t = Array.from({ length: G + 1 }, (_, g) => g);
  out.meanPs = meanP.map(v => v / reps);
  out.meanHs = meanH.map(v => v / reps);
  // E[2pq] decays by (1 − 1/2N) per WF generation; by (1 − 2/N²) per Moran step (Moran 1958)
  const H0 = 2 * (i0 / copies) * (1 - i0 / copies),
    dec = proc === 'wf' ? 1 - 1 / (2 * N) : Math.pow(1 - 2 / (N * N), N);
  out.hTheoryS = out.t.map(g => H0 * Math.pow(dec, g));
  out.fixed = fixed / reps;
  out.lost = lost / reps;
  out.segregating = 1 - out.fixed - out.lost;
  out.meanP = out.meanPs[G]!;
  out.meanH = out.meanHs[G]!;
  out.hTheory = out.hTheoryS[G]!;
  const pp = i0 / copies;
  out.uNeutral = pp;
  out.uTheory = proc === 'wf' ? kimuraU(N, s, h, pp) : s === 0 ? pp : (1 - Math.pow(1 + s, -i0)) / (1 - Math.pow(1 + s, -N)); // Moran: ρ = (1 − r^−i)/(1 − r^−N)
  // Kimura & Ohta (1969), neutral: conditional mean times in generations (Moran: one generation = N steps ≈ a haploid WF of N/2)
  const Ne4 = proc === 'wf' ? 4 * N : N;
  out.tFix = pp > 0 && pp < 1 ? (-Ne4 * (1 - pp) * Math.log(1 - pp)) / pp : NaN;
  out.tLoss = pp > 0 && pp < 1 ? (-Ne4 * pp * Math.log(pp)) / (1 - pp) : NaN;
  out.tAbs = pp > 0 && pp < 1 ? -Ne4 * (pp * Math.log(pp) + (1 - pp) * Math.log(1 - pp)) : NaN;
  out.meanTfix = fixed ? tfSum / fixed : NaN;
  const bins = 21,
    hist = new Array<number>(bins).fill(0);
  for (const x of finals) hist[Math.min(bins - 1, Math.round(x * (bins - 1)))]!++;
  out.histX = grid(0, 1, bins);
  out.hist = hist.map(v => v / reps);
  out.valid = 1;
  return { out, codes, ARG: { rep: (i: number) => (i < trace.length ? trace[i]! : []) } };
}

/* ======================= map functions, three-point cross ======================= */
const haldane = (r: number) => (r >= 0 && r < 0.5 ? -50 * Math.log1p(-2 * r) : r === 0.5 ? Infinity : NaN); // cM (Haldane 1919)
const kosambi = (r: number) => (r >= 0 && r < 0.5 ? 25 * Math.log((1 + 2 * r) / (1 - 2 * r)) : r === 0.5 ? Infinity : NaN); // cM (Kosambi 1944)
const rHaldane = (d: number) => (d >= 0 ? -0.5 * Math.expm1((-2 * d) / 100) : NaN);
const rKosambi = (d: number) => (d >= 0 ? 0.5 * Math.tanh((2 * d) / 100) : NaN);
function runMap(m: MapModel, env: Rec) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const r = num(m.r, env, NaN),
    d = num(m.d, env, NaN);
  if (m.r !== undefined && !(r >= 0 && r <= 0.5)) codes.push('r-range');
  if (m.d !== undefined && !(d >= 0)) codes.push('d-range');
  out.haldane = haldane(r);
  out.kosambi = kosambi(r);
  out.rHaldane = rHaldane(d);
  out.rKosambi = rKosambi(d);
  const rg = grid(0, 0.499, 200);
  out.mapR = rg;
  out.mapMorgan = rg.map(x => 100 * x);
  out.mapHaldane = rg.map(haldane);
  out.mapKosambi = rg.map(kosambi);
  Object.assign(out, { middle: NaN, d12: NaN, d23: NaN, dSum: NaN, dOuter: NaN, coincidence: NaN, interference: NaN, nTotal: NaN });
  const tp = m.threePoint;
  if (isObj(tp)) {
    const cnt = Object.create(null) as Record<string, number>;
    for (const c of tp.classes) cnt[c.alleles.join('')] = num(c.n, env, NaN);
    if (Object.keys(cnt).some(k => !(cnt[k]! >= 0))) codes.push('counts-range');
    else {
      const get = (k: string) => cnt[k] || 0,
        comp = (k: string) =>
          k
            .split('')
            .map(x => (x === '0' ? '1' : '0'))
            .join('');
      const pairs: Array<{ a: string; n: number }> = [];
      for (const k of ['000', '001', '010', '011']) pairs.push({ a: k, n: get(k) + get(comp(k)) });
      const N = pairs.reduce((s2, p) => s2 + p.n, 0);
      out.nTotal = N;
      const srt = pairs.slice().sort((x, y) => y.n - x.n);
      if (!(N > 0)) codes.push('counts-range');
      else if (srt[0]!.n === srt[1]!.n) codes.push('ambiguous-parentals');
      else if (srt[2]!.n === srt[3]!.n) codes.push('ambiguous-order');
      else {
        const par = srt[0]!.a;
        // every other pair differs from the parentals at one locus (its representative or its complement): the locus that switches
        const sw = (p: { readonly a: string }) => {
          const dif = [0, 1, 2].filter(i => p.a[i] !== par[i]);
          return dif.length === 1 ? dif[0]! : [0, 1, 2].find(i => !dif.includes(i))!;
        };
        const dco = srt[3]!,
          mid = sw(dco),
          outer = [0, 1, 2].filter(i => i !== mid);
        const sOf = (i: number) => (srt.slice(1, 3).find(p => sw(p) === i) || { n: 0 }).n;
        out.middle = mid;
        const r1 = (sOf(outer[0]!) + dco.n) / N,
          r2 = (sOf(outer[1]!) + dco.n) / N;
        out.d12 = 100 * r1;
        out.d23 = 100 * r2;
        out.dSum = out.d12 + out.d23;
        out.dOuter = (100 * (sOf(outer[0]!) + sOf(outer[1]!))) / N; // the outer pair alone misses the double crossovers
        out.coincidence = r1 * r2 > 0 ? dco.n / N / (r1 * r2) : NaN;
        out.interference = 1 - out.coincidence;
        const L = tp.loci,
          ord = [outer[0], mid, outer[1]];
        const sc = C.scene([-10, out.dSum + 10, -6, 6]);
        sc.seg(0, 0, out.dSum, 0, { c: 'base', w: 3 });
        [0, out.d12, out.dSum].forEach((x, j) => {
          sc.seg(x, -1, x, 1, { c: j === 1 ? 'hi' : 'base' });
          sc.txt(x, 2, { s: String(L[ord[j]!]).slice(0, 64), c: 'base', anchor: 'middle' });
        });
        sc.txt(out.d12 / 2, -3, { v: Math.round(out.d12 * 10) / 10, c: 'info', anchor: 'middle' });
        sc.txt(out.d12 + out.d23 / 2, -3, { v: Math.round(out.d23 * 10) / 10, c: 'info', anchor: 'middle' });
        out.geneMap = sc.done();
      }
    }
  }
  out.valid = codes.length ? 0 : 1;
  return { out, codes };
}

/* ======================= the coalescent ======================= */
const aN = (n: number) => {
  let a = 0;
  for (let i = 1; i < n; i++) a += 1 / i;
  return a;
};
/** Tajima's D (Tajima 1989 eq. 38) from π, S and n; NaN when S = 0 */
function tajimaD(pi: number, S2: number, n: number) {
  if (!(S2 > 0) || n < 3) return NaN;
  let a1 = 0,
    a2 = 0;
  for (let i = 1; i < n; i++) {
    a1 += 1 / i;
    a2 += 1 / (i * i);
  }
  const b1 = (n + 1) / (3 * (n - 1)),
    b2 = (2 * (n * n + n + 3)) / (9 * n * (n - 1)),
    c1 = b1 - 1 / a1,
    c2 = b2 - (n + 2) / (a1 * n) + a2 / (a1 * a1);
  const e1 = c1 / a1,
    e2 = c2 / (a1 * a1 + a2);
  return (pi - S2 / a1) / Math.sqrt(e1 * S2 + e2 * S2 * (S2 - 1));
}
function coalTree(rand: Uniform, n: number, Ne: number, mu: number) {
  // leaves 0..n−1 at time 0; with k lineages the waiting time is Exp(C(k,2)) in units of 2Ne generations (Kingman 1982; Hudson 1983)
  const nodes: CoalNode[] = [],
    draw = sampler(rand);
  for (let i = 0; i < n; i++) nodes.push({ t: 0, kids: [], size: 1 });
  let live = nodes.map((_, i) => i),
    t = 0;
  for (let k = n; k > 1; k--) {
    t += draw.exp((k * (k - 1)) / 2) * 2 * Ne;
    const a = Math.floor(rand() * live.length);
    let b = Math.floor(rand() * (live.length - 1));
    if (b >= a) b++;
    const na = live[a]!,
      nb = live[b]!;
    nodes.push({ t, kids: [na, nb], size: nodes[na]!.size + nodes[nb]!.size });
    live = live.filter((_, j) => j !== a && j !== b);
    live.push(nodes.length - 1);
  }
  let total = 0,
    S2 = 0,
    pi = 0;
  const sfs = new Array<number>(n).fill(0);
  for (const nd of nodes)
    for (const c of nd.kids) {
      const len = nd.t - nodes[c]!.t;
      total += len;
      if (mu > 0) {
        const k = draw.poisson(mu * len);
        S2 += k;
        sfs[nodes[c]!.size]! += k;
        pi += k * nodes[c]!.size * (n - nodes[c]!.size);
      }
    }
  return { nodes, tmrca: t, total, S: S2, pi: pi / ((n * (n - 1)) / 2), sfs };
}
function runCoalescent(m: Rec, env: Rec, seed: number) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const n = Math.round(num(m.n, env, NaN)),
    Ne = num(m.Ne, env, NaN),
    mu = num(m.mu, env, 0),
    reps = Math.round(num(m.reps, env, 1));
  if (!(n >= 2 && n <= 50)) codes.push('n-range');
  if (!(Ne > 0) || !(mu >= 0) || !(4 * Ne * mu <= 1000)) codes.push('param-range');
  if (!(reps >= 1) || reps * n > BUDGET) codes.push('budget');
  if (codes.length) return { out: { valid: 0 }, codes };
  const rand = C.rng(seed >>> 0, 'genetics-coalescent'),
    a = aN(n),
    theta = 4 * Ne * mu;
  out.aN = a;
  out.eTmrca = 4 * Ne * (1 - 1 / n);
  out.eTotal = 4 * Ne * a;
  out.eS = theta * a;
  let sT = 0,
    sL = 0,
    sS = 0,
    sD = 0,
    nD = 0;
  const sfs = new Array<number>(n).fill(0);
  let first: ReturnType<typeof coalTree> | null = null;
  for (let r = 0; r < reps; r++) {
    const tr = coalTree(rand, n, Ne, mu);
    if (!first) first = tr;
    sT += tr.tmrca;
    sL += tr.total;
    sS += tr.S;
    for (let i = 1; i < n; i++) sfs[i]! += tr.sfs[i]!;
    const D = tajimaD(tr.pi, tr.S, n);
    if (Number.isFinite(D)) {
      sD += D;
      nD++;
    }
  }
  out.tmrca = first!.tmrca;
  out.totalLength = first!.total;
  out.S = first!.S;
  out.pi = first!.pi;
  out.thetaW = first!.S / a;
  out.tajimaD = tajimaD(first!.pi, first!.S, n);
  out.meanTmrca = sT / reps;
  out.meanTotal = sL / reps;
  out.meanS = sS / reps;
  out.meanD = nD ? sD / nD : NaN;
  out.sfsI = Array.from({ length: n - 1 }, (_, i) => i + 1);
  out.sfs = out.sfsI.map(i => sfs[i]! / reps);
  out.sfsTheory = out.sfsI.map(i => theta / i);
  // the genealogy of the first replicate: leaves in depth-first order, time upwards
  const nodes = first!.nodes,
    xs = new Array<number>(nodes.length).fill(0);
  let leaf = 0;
  const place = (i: number): number => {
    const nd = nodes[i]!;
    if (!nd.kids.length) {
      xs[i] = leaf++;
      return xs[i];
    }
    xs[i] = (place(nd.kids[0]!) + place(nd.kids[1]!)) / 2;
    return xs[i];
  };
  place(nodes.length - 1);
  const T = first!.tmrca || 1,
    H = n - 1,
    ys = (t: number) => (t / T) * H;
  const sc = C.scene([-1, n, -1, H + 1]);
  nodes.forEach((nd, i) => {
    for (const c of nd.kids) {
      sc.seg(xs[c]!, ys(nodes[c]!.t), xs[c]!, ys(nd.t), { c: 'base' });
      sc.seg(xs[c]!, ys(nd.t), xs[i]!, ys(nd.t), { c: 'base' });
    }
  });
  for (let i = 0; i < n; i++) sc.pt(xs[i]!, 0, { r: 3, c: 'hi' });
  out.tree = sc.done();
  out.valid = 1;
  return { out, codes };
}

/* ======================= linkage disequilibrium ======================= */
function runLD(m: Rec, env: Rec) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  let pA: number, pB: number, D: number;
  if (m.pAB !== undefined) {
    const h = ['pAB', 'pAb', 'paB', 'pab'].map(k => num(m[k], env, NaN));
    if (h.some(v => !(v >= 0 && v <= 1)) || Math.abs(h.reduce((a, b) => a + b, 0) - 1) > 1e-6) {
      codes.push('freq-sum');
      return { out: { valid: 0 }, codes };
    }
    pA = h[0]! + h[1]!;
    pB = h[0]! + h[2]!;
    D = h[0]! * h[3]! - h[1]! * h[2]!;
  } else {
    pA = num(m.pA, env, NaN);
    pB = num(m.pB, env, NaN);
    D = num(m.D, env, NaN);
    if (!(pA >= 0 && pA <= 1 && pB >= 0 && pB <= 1) || !Number.isFinite(D)) {
      codes.push('freq-sum');
      return { out: { valid: 0 }, codes };
    }
  }
  const qA = 1 - pA,
    qB = 1 - pB,
    c = num(m.c, env, NaN),
    G = Math.round(num(m.gens, env, 50)),
    Ne = num(m.Ne, env, NaN);
  const Dmax = D >= 0 ? Math.min(pA * qB, qA * pB) : Math.min(pA * pB, qA * qB);
  if (Math.abs(D) > Dmax + 1e-12) {
    codes.push('D-range');
    return { out: { valid: 0 }, codes };
  }
  if (!(c >= 0 && c <= 0.5)) {
    codes.push('r-range');
    return { out: { valid: 0 }, codes };
  }
  if (!(G >= 1 && G <= BUDGET)) {
    codes.push('budget');
    return { out: { valid: 0 }, codes };
  }
  const vv = pA * qA * pB * qB;
  out.pA = pA;
  out.pB = pB;
  out.D = D;
  out.Dmax = Dmax;
  out.Dprime = Dmax > 0 ? D / Dmax : NaN;
  out.r2 = vv > 0 ? (D * D) / vv : NaN;
  if (!(vv > 0)) codes.push('monomorphic');
  out.halfLife = c > 0 ? Math.log(0.5) / Math.log1p(-c) : Infinity;
  out.t = Array.from({ length: G + 1 }, (_, g) => g);
  out.Dt = out.t.map(g => D * Math.pow(1 - c, g));
  out.r2t = out.Dt.map(x => (vv > 0 ? (x * x) / vv : NaN));
  out.Dfinal = out.Dt[G]!;
  const rho = 4 * Ne * c;
  out.r2Sved = Ne > 0 ? 1 / (1 + rho) : NaN; // Sved 1971
  out.sigma2 = Ne > 0 ? (10 + rho) / ((2 + rho) * (11 + rho)) : NaN; // Ohta & Kimura 1969; Hill & Weir 1988
  out.valid = 1;
  return { out, codes };
}

/* ======================= quantitative genetics ======================= */
function runQuant(m: Rec, env: Rec, seed: number) {
  const codes: string[] = [],
    out: Record<string, OutVal> = {};
  const h2 = num(m.h2, env, NaN),
    sP = num(m.sigmaP, env, NaN),
    Ssel = num(m.S, env, NaN),
    sel = num(m.sel, env, NaN);
  const G = Math.round(num(m.gens, env, 10)),
    m0 = num(m.mean0, env, 0);
  if (m.h2 !== undefined && !(h2 >= 0 && h2 <= 1)) codes.push('h2-range');
  if (m.sel !== undefined && !(sel > 0 && sel < 1)) codes.push('prob-range');
  out.i = intensity(sel);
  out.Sel = m.S !== undefined ? Ssel : out.i * sP;
  out.R = h2 * out.Sel; // the breeder's equation R = h²·S (Lush 1937)
  if (G >= 1 && G <= BUDGET && Number.isFinite(out.R)) {
    out.t = Array.from({ length: G + 1 }, (_, g) => g);
    out.mean = out.t.map(g => m0 + g * (out.R as number));
    out.meanFinal = m0 + G * out.R;
  } else {
    out.t = [];
    out.mean = [];
    out.meanFinal = NaN;
  }
  // one locus (Falconer & Mackay 1996 ch. 7–8): genotypic values +a (AA), d (Aa), −a (aa); p = freq(A)
  const a = num(m.a, env, NaN),
    dd = num(m.d, env, 0),
    p = num(m.p, env, NaN),
    q = 1 - p;
  if (m.p !== undefined && !(p >= 0 && p <= 1)) codes.push('prob-range');
  out.M = a * (p - q) + 2 * dd * p * q;
  out.alpha = a + dd * (q - p);
  out.VA = 2 * p * q * out.alpha * out.alpha;
  out.VD = Math.pow(2 * p * q * dd, 2);
  out.VG = out.VA + out.VD;
  out.bvAA = 2 * q * out.alpha;
  out.bvAa = (q - p) * out.alpha;
  out.bvaa = -2 * p * out.alpha;
  // the liability threshold (Falconer 1965): x = Φ⁻¹(1 − K), a = φ(x_g)/K_g, h² = (x_g − x_r)/a / r
  const K = num(m.K, env, NaN),
    Kr = num(m.Kr, env, NaN),
    rel = num(m.rel, env, 0.5);
  if ((m.K !== undefined && !(K > 0 && K < 1)) || (m.Kr !== undefined && !(Kr > 0 && Kr < 1))) codes.push('prob-range');
  out.xg = PhiInv(1 - K);
  out.xr = PhiInv(1 - Kr);
  out.h2Liab = (out.xg - out.xr) / (phi(out.xg) / K) / rel;
  if (m.K !== undefined && m.Kr !== undefined && !(Kr > K)) codes.push('Kr-not-above-K');
  // a seeded polygenic simulation: N diploids, L additive biallelic loci (±½ per allele copy), truncation selection, free recombination
  if (isObj(m.sim)) {
    const sm = m.sim,
      N = Math.round(num(sm.N, env, NaN)),
      L = Math.round(num(sm.L, env, NaN)),
      SG = Math.round(num(sm.gens, env, NaN)),
      fr = num(sm.sel, env, NaN),
      hh = num(sm.h2, env, NaN);
    if (!(N >= 4 && N <= 2000 && L >= 1 && L <= 200 && SG >= 1 && fr > 0 && fr <= 1 && hh > 0 && hh <= 1)) codes.push('sim-range');
    else if (N * L * SG > BUDGET) codes.push('budget');
    else {
      const rand = C.rng(seed >>> 0, 'genetics-quant');
      let gen: Int8Array[] = [];
      for (let k = 0; k < N; k++) {
        const g = new Int8Array(2 * L);
        for (let j = 0; j < 2 * L; j++) g[j] = rand() < 0.5 ? 1 : 0;
        gen.push(g);
      }
      const gv = (g: Int8Array) => {
        let s2 = 0;
        for (let j = 0; j < g.length; j++) s2 += g[j]!;
        return (s2 - L) / 2;
      };
      const VE = ((L / 8) * (1 - hh)) / hh,
        sdE = Math.sqrt(VE); // V_A at p = ½: 2pq·α² per locus = 1/8
      const means: number[] = [],
        vas: number[] = [],
        pfs: number[] = [];
      const stat = () => {
        const v = gen.map(gv),
          mn = v.reduce((x, y) => x + y, 0) / N;
        means.push(mn);
        vas.push(v.reduce((x, y) => x + (y - mn) * (y - mn), 0) / N);
        let c1 = 0;
        for (const g of gen) for (let j = 0; j < 2 * L; j++) c1 += g[j]!;
        pfs.push(c1 / (2 * L * N));
      };
      stat();
      for (let t2 = 0; t2 < SG; t2++) {
        const ph = gen.map((g, k) => ({ k, z: gv(g) + sdE * C.normal(rand) })).sort((x, y) => y.z - x.z || x.k - y.k);
        const nSel = Math.max(2, Math.round(fr * N)),
          par = ph.slice(0, nSel).map(x => gen[x.k]!),
          nx: Int8Array[] = [];
        for (let k = 0; k < N; k++) {
          const a1 = Math.floor(rand() * nSel);
          let b1 = Math.floor(rand() * (nSel - 1));
          if (b1 >= a1) b1++;
          const g = new Int8Array(2 * L),
            A = par[a1]!,
            B = par[b1]!;
          for (let j = 0; j < L; j++) {
            g[2 * j] = A[2 * j + (rand() < 0.5 ? 0 : 1)]!;
            g[2 * j + 1] = B[2 * j + (rand() < 0.5 ? 0 : 1)]!;
          }
          nx.push(g);
        }
        gen = nx;
        stat();
      }
      out.simT = means.map((_, k) => k);
      out.simMeans = means;
      out.simVAs = vas;
      out.simPs = pfs;
      out.simMean = means[means.length - 1]!;
      out.simVA = vas[vas.length - 1]!;
      out.simP = pfs[pfs.length - 1]!;
      out.simH2 = out.simVA / (out.simVA + VE);
    }
  }
  out.valid = codes.some(c => c !== 'Kr-not-above-K') ? 0 : 1;
  return { out, codes };
}

/* ---------- run: the spec's outputs ---------- */
const RUN: Readonly<Record<string, Runner>> = {
  cross: runCross,
  pedigree: runPedigree,
  hw: runHW,
  selection: runSelection,
  drift: runDrift,
  map: runMap,
  coalescent: runCoalescent,
  ld: runLD,
  quant: runQuant,
};
function run(spec: Spec | null | undefined, env?: Rec | null, o?: { readonly seed?: number } | null) {
  const m = ((spec && spec.model && typeof spec.model === 'object' && spec.model) || {}) as Rec,
    seed = (o && o.seed) || 1;
  let res: ModeRun;
  try {
    res = RUN[m.mode as string]!(m as never, env || {}, seed);
  } catch {
    res = { out: { valid: 0 }, codes: ['error'] };
  }
  const out: Record<string, unknown> = {};
  for (const op of (spec && Array.isArray(spec.outputs) ? spec.outputs : []) as Array<Rec | null>) {
    if (!op || typeof op.id !== 'string') continue;
    const d =
      has(OUTS, m.mode) && typeof op.of === 'string' && has(OUTS[m.mode as string]!, op.of) ? OUTS[m.mode as string]![op.of]! : null;
    let v: unknown;
    if (d && d[1] && res.ARG && res.ARG[op.of as string]) {
      try {
        v = res.ARG[op.of as string]!(op.arg as never);
      } catch {
        v = undefined;
      }
    } else v = d ? res.out[op.of as string] : undefined;
    if (v === undefined) v = d && d[0] === 'series' ? [] : d && d[0] === 'scene' ? { view: [0, 1, 0, 1], items: [] } : NaN;
    out[op.id] = v;
  }
  return { out, codes: res.codes };
}
/* ---------- the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): genetic drift in a co-simulation ----------
     mode drift: the replicate populations are the state; each macro step runs the generations up to round(t + dt − t0) with the same
     Wright–Fisher / Moran sampling as runDrift, and with the inputs of that step (a population size N an ecological part computes:
     a bottleneck keeps the allele frequency, the copies are rescaled; a selection s that changes with the environment). Its seeded
     stream lives in the state (a plain number), so a snapshot repeats the same draws. Per step: meanP, meanH, fixed, lost, segregating
     (now), rep (one sample of replicate arg), t (the generation), meanPs / meanHs (one sample each), uTheory and the neutral times at the
     current inputs. Every other mode is recomputed at each step from the current inputs. */
/* the stepper's stream is plain data in its state (snapshot = copy): the kernel stream's 6 numbers (a state that carries a plain
   number instead draws from a mulberry32 word) */
function stepRng0(seed: number) {
  const K = C.kit();
  return K.stream(seed >>> 0, 'genetics-drift-step').state();
}
function stepRng(ns: DriftState) {
  const K = C.kit();
  return Array.isArray(ns.rs) ? K.stream(0, '', { state: ns.rs }) : null;
}
function dRand(st: DriftState) {
  const a = (st.rs = ((st.rs as number) + 0x6d2b79f5) >>> 0);
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const stepper: CoreStepper<StepState> = {
  init(model, inputs, sc) {
    const m: Rec = isObj(model) ? model : {};
    if (m.mode !== 'drift') return { t: sc.t0 || 0, other: true };
    const proc = m.process || 'wf',
      N = Math.round(num(m.N, inputs, NaN)),
      p0 = num(m.p0, inputs, NaN),
      reps = Math.round(num(m.reps, inputs, 20));
    if (!(N >= 1 && N <= 1e6) || !(p0 >= 0 && p0 <= 1) || !(reps >= 1 && reps <= 10000)) return null;
    const copies = proc === 'moran' ? N : 2 * N,
      i0 = Math.round(p0 * copies);
    return {
      t0: sc.t0 || 0,
      g: 0,
      proc,
      copies,
      i: new Array<number>(reps).fill(i0),
      tFix: new Array<number>(reps).fill(-1),
      H0: 2 * (i0 / copies) * (1 - i0 / copies),
      dec: 0,
      rs: stepRng0(sc.seed),
    };
  },
  step(st, inputs, t, dt, sc) {
    const m = sc.spec.model as Rec,
      outs = (Array.isArray(sc.spec.outputs) ? sc.spec.outputs : []) as Array<Rec | null>;
    if (st.other) {
      const r = run(sc.spec, inputs, { seed: sc.seed });
      return { state: { ...st, t: t + dt }, out: r.out, dt };
    }
    const ns = C.copyData(st) as DriftState,
      N = Math.round(num(m.N, inputs, NaN)),
      s = num(m.s, inputs, 0),
      h = num(m.h, inputs, 0.5),
      mu = num(m.mu, inputs, 0),
      nu = num(m.nu, inputs, 0);
    if (!(N >= 1 && N <= 1e6) || !(s > -1) || !(mu >= 0 && mu <= 1) || !(nu >= 0 && nu <= 1))
      return { state: st, out: {}, dt, fail: 'range' };
    const copies = ns.proc === 'moran' ? N : 2 * N;
    if (copies !== ns.copies) {
      ns.i = ns.i.map(i => Math.round((i / ns.copies) * copies));
      ns.copies = copies;
    } // a new size: the same frequencies
    const target = Math.round(t + dt - ns.t0),
      reps = ns.i.length;
    if ((target - ns.g) * reps * (ns.proc === 'moran' ? N : 1) > BUDGET) return { state: st, out: {}, dt, fail: 'budget' };
    const R = stepRng(ns),
      u = R || (() => dRand(ns)),
      dr = sampler(u);
    for (; ns.g < target; ns.g++)
      for (let r = 0; r < reps; r++) {
        let i = ns.i[r]!;
        if (ns.proc === 'wf') {
          const p = i / copies,
            q = 1 - p,
            wAA = 1 + s,
            wAa = 1 + h * s,
            wb = p * p * wAA + 2 * p * q * wAa + q * q;
          let ps = (p * p * wAA + p * q * wAa) / wb;
          ps = ps * (1 - mu) + (1 - ps) * nu;
          i = dr.binomial(copies, Math.min(1, Math.max(0, ps)));
        } else
          for (let k = 0; k < N; k++) {
            if ((i === 0 && nu === 0) || (i === N && mu === 0)) break;
            const r1 = u(),
              r2 = u(),
              r3 = u(),
              fA = (1 + s) * i,
              tot = fA + (N - i);
            let birthA = r1 * tot < fA;
            if (birthA ? r3 < mu : r3 < nu) birthA = !birthA;
            i += (birthA ? 1 : 0) - (r2 * N < i ? 1 : 0);
          }
        ns.i[r] = i;
        if (i === copies && ns.tFix[r]! < 0) ns.tFix[r] = ns.g + 1;
      }
    if (R) ns.rs = R.state();
    const ps = ns.i.map(i => i / copies),
      fixed = ps.filter(p => p === 1).length / reps,
      lost = ps.filter(p => p === 0).length / reps;
    const meanP = ps.reduce((a, b) => a + b, 0) / reps,
      meanH = ps.reduce((a, p) => a + 2 * p * (1 - p), 0) / reps;
    const p0 = num(m.p0, inputs, NaN),
      dec = ns.proc === 'wf' ? 1 - 1 / (2 * N) : Math.pow(1 - 2 / (N * N), N),
      Ne4 = ns.proc === 'wf' ? 4 * N : N;
    const fx = ns.tFix.filter(x => x >= 0),
      v = {
        t: ns.g,
        meanP,
        meanH,
        meanPs: meanP,
        meanHs: meanH,
        fixed,
        lost,
        segregating: 1 - fixed - lost,
        hTheory: ns.H0 * Math.pow(dec, ns.g),
        hTheoryS: ns.H0 * Math.pow(dec, ns.g),
        uNeutral: p0,
        uTheory: ns.proc === 'wf' ? kimuraU(N, s, h, p0) : NaN,
        tFix: p0 > 0 && p0 < 1 ? (-Ne4 * (1 - p0) * Math.log(1 - p0)) / p0 : NaN,
        meanTfix: fx.length ? fx.reduce((a, b) => a + b, 0) / fx.length : NaN,
        valid: 1,
      };
    const out: Record<string, number> = {};
    for (const o of outs) {
      if (!o || typeof o.id !== 'string') continue;
      out[o.id] = o.of === 'rep' ? (ps[Math.round(num(o.arg, inputs, 0))] ?? NaN) : has(v, o.of) ? v[o.of as keyof typeof v] : NaN;
    }
    return { state: ns, out, dt };
  },
};
const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, scenes: true, stepper });
const API = Object.freeze({
  table: {
    model: { $by: 'mode', $cases: TABLES },
    outputs: {
      $by: 'mode',
      $cases: Object.fromEntries(
        MODES.map(m => [
          m,
          Object.keys(OUTS[m]!).reduce<Record<string, string[]>>(
            (a, k) => ((a[OUTS[m]![k]![0]] = a[OUTS[m]![k]![0]] || []).push(k), a),
            {},
          ),
        ]),
      ),
    },
    fields: { arg: 'numx' },
  }, // the form of the activity author (src/engines/kernel/schema.ts)
  id: ID,
  MODES,
  TABLES,
  OUTS,
  EPI,
  checkSpec,
  exprs,
  keys,
  run,
  engine: Object.freeze(engine),
  simEngine,
  stepper,
  // the formulas, for tests
  logFact,
  lgamma,
  gammaQ,
  chi2Sf,
  erfc,
  Phi,
  PhiInv,
  intensity,
  binomial,
  poisson,
  hweExact,
  kimuraU,
  haldane,
  kosambi,
  rHaldane,
  rKosambi,
  tajimaD,
  aN,
  ratioOf,
  chainOf,
});
export default API;
/* i18n-ignore-end */
