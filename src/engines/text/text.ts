/* ===================== text@1 — texts and verse (the engine library of sim-spec@1, docs/library/text.md) =====================
   A general engine for literature, linguistics, the classics and the digital humanities: tokens and types in every script (Unicode
   normalisation UAX #15, final sigma, elision apostrophes, scripts without spaces), frequency laws (Zipf 1949, Heaps 1978), lexical
   diversity (TTR, Guiraud, Herdan, Yule 1944, Simpson, Honoré, MATTR: Covington & McFall 2010, MTLD and HD-D: McCarthy & Jarvis 2007,
   2010), n-grams, KWIC concordances, collocations (PMI: Church & Hanks 1990, t, χ², log-likelihood: Dunning 1993, Dice/logDice: Rychlý
   2008), keyness (Rayson & Garside 2000; Log Ratio: Hardie 2014), stylometry (Burrows' Delta 2002, Cosine Delta: Smith & Aldridge 2011),
   readability formulas with their languages, Greek and Latin quantitative metre (hexameter, pentameter, iambic trimeter, senarius,
   hendecasyllable, sapphic) that lists EVERY valid scansion with the assumptions it makes, English accentual-syllabic metre (iambic
   pentameter with a simplified Kiparsky stress-maximum rule) and rhyme schemes. Pure JS (String.normalize, \p{…}, Intl.Segmenter
   when asked for), deterministic, bounded; numbers, codes, keys and the model's own short texts (`s`) only. */
import NoemaLibCore from '../kernel/core.ts';
import type { EngineCore, Inputs, Problem, SimEngine, Spec } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes, keys, numbers and the model's own words leave this module

/* ---------- types: the core functions this engine calls (kernel/core.js), its model and outputs as checkSpec admits them ---------- */
type Rec = Record<string, unknown>;
/** a writer of problems: E (an error) or W (a warning) of the core's problems() */
type Report = (code: string, path: string, msg: string) => void;
/** the options of a scene item: a text of the model (s), a key of the string tables, a number (v); anchor, colour role, fill, dash */
interface SceneOpts {
  readonly s?: string | undefined;
  readonly key?: string | undefined;
  readonly v?: number;
  readonly anchor?: 'start' | 'end';
  readonly c?: string;
  readonly fill?: boolean;
  readonly dash?: boolean;
}
interface SceneOut {
  readonly view: number[];
  readonly items: Rec[];
}
interface SceneBuilder {
  seg(x1: number, y1: number, x2: number, y2: number, o?: SceneOpts): void;
  poly(pts: number[], o?: SceneOpts): void;
  txt(x: number, y: number, o?: SceneOpts): void;
  done(): SceneOut;
}
interface CoreUse {
  readonly ID_RE: RegExp;
  problems(): { P: Problem[]; E: Report; W: Report };
  walk(o: unknown, table: unknown, path: string, E: Report, W: Report): void;
  checkOutputs(
    spec: unknown,
    id: string,
    kinds: readonly string[],
    out: (o: Rec, at: string, E: Report, W: Report) => void,
    E: Report,
    W: Report,
  ): void;
  cx(v: unknown): (env: Inputs) => number;
  thin(a: readonly number[], n?: number): number[];
  scene(view: number[]): SceneBuilder;
  makeEngine(def: {
    readonly id: string;
    readonly checkSpec: (spec: unknown) => Problem[];
    readonly run: (spec: Spec, env: Inputs, opts?: { readonly prepared?: Prepared | null }) => RunResult;
    readonly prepare: (spec: Spec) => Prepared;
    readonly scenes: boolean;
  }): { engine: EngineCore; simEngine: SimEngine };
}
// kernel/core.js is typed at its edge as an opaque KernelApi (kernel/core.d.ts): CoreUse is the part of it this engine calls
const C = NoemaLibCore as unknown as CoreUse;
const ID = 'text@1';
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

type Lang = string;
/** model.normalize */
interface Norm {
  readonly form?: 'NFC' | 'NFD' | 'NFKC' | 'none';
  readonly case?: 'lower' | 'keep';
  readonly foldSigma?: boolean;
  readonly diacritics?: 'keep' | 'strip';
  readonly uvij?: boolean;
  readonly numbers?: 'keep' | 'drop';
  readonly hyphens?: 'join' | 'split';
  readonly enclitics?: boolean;
  readonly segment?: 'auto' | 'chars' | 'words';
}
/** model.metre (also the options of a scansion) */
interface Metre {
  readonly pattern?: string;
  readonly lang?: Lang;
  readonly mcl?: 'both' | 'long' | 'short';
  readonly synizesis?: boolean;
  readonly max?: number;
}
/** a text of model.texts */
interface TextDoc {
  readonly id: string;
  readonly lang?: Lang;
  readonly label?: string;
  readonly body?: string;
}
interface TextModel {
  readonly texts?: readonly TextDoc[];
  readonly normalize?: Norm;
  readonly metre?: Metre;
  readonly lexicon?: ReadonlyArray<{ readonly w: string; readonly p: string }>;
}
/** a number of an output: a number or an expression over the spec's names */
type NumX = number | string;
/** an output of a spec, as checkSpec admits it (the fields its `of` takes: OUT) */
interface TextOutput {
  readonly id: string;
  readonly kind: string;
  readonly of: string;
  readonly text?: string;
  readonly ref?: string;
  readonly word?: string;
  readonly w1?: string;
  readonly w2?: string;
  readonly scheme?: string;
  readonly measure?: string;
  readonly fit?: string;
  readonly what?: string;
  readonly formula?: string;
  readonly variant?: string;
  readonly type?: string;
  readonly a?: string | number;
  readonly b?: string | number;
  readonly n?: NumX;
  readonly line?: NumX;
  readonly window?: NumX;
  readonly threshold?: NumX;
  readonly sample?: NumX;
  readonly per?: NumX;
  readonly rmin?: NumX;
  readonly rmax?: NumX;
  readonly xmin?: NumX;
  readonly o11?: NumX;
  readonly r1?: NumX;
  readonly c1?: NumX;
  readonly mfw?: NumX;
  readonly span?: number;
  readonly reading?: number;
  readonly top?: number;
  readonly steps?: number;
  readonly max?: number;
  readonly from?: number;
}
const LANGS = ['en', 'la', 'grc', 'el', 'de', 'fr', 'es', 'it', 'ru', 'ar', 'he', 'zh', 'ja', 'th', 'other'];
const METRES = [
  'hexameter',
  'pentameter',
  'elegiac',
  'trimeter',
  'senarius',
  'hendecasyllable',
  'sapphic',
  'iambic5',
  'iambic4',
  'trochaic4',
];
const FORMULAS = ['flesch', 'fk', 'fog', 'smog', 'coleman', 'ari', 'lix', 'amstad', 'kandel', 'huerta', 'szigriszt', 'oborneva'];
const FORMULA_LANG: Readonly<Record<string, readonly string[] | null>> = {
  flesch: ['en'],
  fk: ['en'],
  fog: ['en'],
  smog: ['en'],
  coleman: ['en'],
  ari: ['en'],
  lix: null,
  amstad: ['de'],
  kandel: ['fr'],
  huerta: ['es'],
  szigriszt: ['es'],
  oborneva: ['ru'],
};
const MEASURES = ['pmi', 'npmi', 'mi3', 't', 'chi2', 'g2', 'dice', 'logDice'];
const LIM = { texts: 30, body: 60000, lexicon: 2000, tokens: 200000, readings: 4096 };
const RAW_MAX = 64;

/* ---------- the model table (the same codes and messages as tools/lib_text.py) ---------- */
const TABLE = {
  texts: { $req: true, $list: { $obj: { id: 'id!', lang: `enum:${LANGS.join('|')}`, label: 'key' } }, min: 1, max: LIM.texts },
  normalize: {
    $obj: {
      form: 'enum:NFC|NFD|NFKC|none',
      case: 'enum:lower|keep',
      foldSigma: 'bool',
      diacritics: 'enum:keep|strip',
      uvij: 'bool',
      numbers: 'enum:keep|drop',
      hyphens: 'enum:join|split',
      enclitics: 'bool',
      segment: 'enum:auto|chars|words',
    },
  },
  metre: {
    $obj: { pattern: `enum:${METRES.join('|')}!`, lang: 'enum:la|grc|en', mcl: 'enum:both|long|short', synizesis: 'bool', max: 'int:1:64' },
  },
  lexicon: { $list: { $obj: { p: 'expr!' } }, max: LIM.lexicon },
};
const T_ = 'ref',
  LINE = 'int:1:2000',
  READ = 'int:1:64';
const OUT: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>> = {
  scalar: {
    tokens: { text: T_ },
    types: { text: T_ },
    ttr: { text: T_ },
    hapax: { text: T_ },
    dis: { text: T_ },
    sentences: { text: T_ },
    chars: { text: T_ },
    meanWordLen: { text: T_ },
    yuleK: { text: T_ },
    herdanC: { text: T_ },
    guiraudR: { text: T_ },
    simpsonD: { text: T_ },
    honoreR: { text: T_ },
    mattr: { text: T_, window: 'numx' },
    mtld: { text: T_, threshold: 'numx' },
    hdd: { text: T_, sample: 'numx' },
    freq: { text: T_, word: 'raw!', per: 'numx' },
    zipf: { text: T_, fit: 'enum:ols|mle', rmin: 'numx', rmax: 'numx', xmin: 'numx' },
    heaps: { text: T_, what: 'enum:beta|K' },
    assoc: {
      text: T_,
      w1: 'raw',
      w2: 'raw',
      measure: `enum:${MEASURES.join('|')}!`,
      span: 'int:1:10',
      o11: 'numx',
      r1: 'numx',
      c1: 'numx',
      n: 'numx',
    },
    keyness: { text: 'ref!', ref: 'ref!', word: 'raw!', measure: 'enum:g2|logRatio' },
    readability: { text: T_, formula: `enum:${FORMULAS.join('|')}!`, what: 'enum:score|asl|asw|words|sentences|syllables' },
    delta: { a: 'ref!', b: 'ref!', mfw: 'numx', variant: 'enum:burrows|cosine|quadratic' },
    syllables: { text: T_, line: 'numx' },
    scansions: { text: T_, line: 'numx!' },
    foot: { text: T_, line: 'numx!', n: 'int:1:6!', reading: READ },
    dactyls: { text: T_, line: 'numx!', reading: READ },
    caesura: {
      text: T_,
      line: 'numx!',
      type: 'enum:penthemimeral|trithemimeral|hephthemimeral|trochaic|bucolic|diaeresis!',
      reading: READ,
    },
    metreFit: { text: T_, line: 'numx!' },
    rhyme: { text: T_, a: 'int:1:2000!', b: 'int:1:2000!' },
    scheme: { text: T_, scheme: 'raw!', from: LINE },
  },
  series: {
    rankFreq: { text: T_, top: 'int:2:2000' },
    ranks: { text: T_, top: 'int:2:2000' },
    heapsV: { text: T_ },
    heapsN: { text: T_ },
    ttrCurve: { text: T_, steps: 'int:2:200' },
    mattrCurve: { text: T_, steps: 'int:2:200', window: 'numx' },
    mtldCurve: { text: T_, steps: 'int:2:200', threshold: 'numx' },
    prefixN: { text: T_, steps: 'int:2:200' },
    wordLengths: { text: T_, max: 'int:2:40' },
    lengthAxis: { max: 'int:2:40' },
    dactylsByLine: { text: T_ },
    lineAxis: { text: T_ },
  },
  scene: {
    kwic: { text: T_, word: 'raw!', window: 'int:1:12', max: 'int:1:40' },
    scansion: { text: T_, line: 'numx!', reading: READ },
    topWords: { text: T_, top: 'int:2:30' },
    deltaMap: { mfw: 'numx', variant: 'enum:burrows|cosine|quadratic' },
    rhymes: { text: T_, from: LINE },
  },
};
const RAW_F = ['word', 'w1', 'w2', 'scheme'];
const NUMX_ORDER = ['line', 'window', 'threshold', 'sample', 'per', 'rmin', 'rmax', 'xmin', 'o11', 'r1', 'c1', 'n', 'mfw'];
const rawOk = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= RAW_MAX;

function checkSpec(spec: unknown): Problem[] {
  const { P, E, W } = C.problems();
  const m0 = isObj(spec) ? spec.model : undefined;
  // the raw texts (a text's body, a lexicon's words) are the model's own content: checked here, not by the table
  let m = m0;
  if (isObj(m0)) {
    const m1: Rec = Object.assign({}, m0);
    m = m1;
    if (Array.isArray(m0.texts))
      m1.texts = (m0.texts as unknown[]).map(t => {
        if (!isObj(t)) return t;
        const c = Object.assign({}, t);
        delete c.body;
        return c;
      });
    if (Array.isArray(m0.lexicon))
      m1.lexicon = (m0.lexicon as unknown[]).map(x => {
        if (!isObj(x)) return x;
        const c = Object.assign({}, x);
        delete c.w;
        return c;
      });
  }
  C.walk(m, TABLE, 'model', E, W);
  const M: Rec = isObj(m0) ? m0 : {};
  const ids: string[] = [];
  let total = 0;
  (Array.isArray(M.texts) ? (M.texts as unknown[]) : []).forEach((t, i) => {
    if (!isObj(t)) return;
    if (typeof t.id === 'string') {
      if (ids.includes(t.id)) E('dup', `model.texts[${i}].id`, `the id ${t.id} is used twice`);
      ids.push(t.id);
    }
    if (typeof t.body !== 'string') E('value', `model.texts[${i}].body`, 'missing (the text itself, a string)');
    else {
      total += t.body.length;
      if (t.body.length > LIM.body) E('size', `model.texts[${i}].body`, `more than ${LIM.body} characters`);
    }
  });
  if (total > LIM.body) E('size', 'model.texts', `more than ${LIM.body} characters in all`);
  (Array.isArray(M.lexicon) ? (M.lexicon as unknown[]) : []).forEach((x, i) => {
    if (!isObj(x)) return;
    if (!rawOk(x.w)) E('value', `model.lexicon[${i}].w`, `needs a word (1-${RAW_MAX} characters)`);
    if (typeof x.p === 'string' && !/^[012]{1,12}$/.test(x.p))
      E('value', `model.lexicon[${i}].p`, 'needs a stress pattern of 0, 1, 2 (one digit per syllable)');
  });
  C.checkOutputs(
    spec,
    ID,
    ['scalar', 'series', 'scene'],
    (o, at, E2, W2) => {
      // checkOutputs gives only outputs whose kind is one of the three and whose of is a text
      const kind = o.kind as string,
        of = o.of as string;
      const T = OUT[kind]![of];
      if (!T) {
        E2('output', at + '.of', `${kind} outputs of ${ID} are: ${Object.keys(OUT[kind]!).join(', ')}`);
        return;
      }
      const T2: Record<string, string> = { id: 'expr', kind: 'expr', of: 'expr' };
      for (const [k, v] of Object.entries(T)) if (!v.startsWith('raw')) T2[k] = v;
      const o2 = Object.assign({}, o);
      for (const k of RAW_F) if (T[k]) Reflect.deleteProperty(o2, k);
      C.walk(o2, T2, at, E2, W2);
      for (const k of RAW_F)
        if (T[k]) {
          if (o[k] === undefined) {
            if (T[k] === 'raw!') E2('value', `${at}.${k}`, 'missing');
          } else if (!rawOk(o[k])) E2('value', `${at}.${k}`, `needs a short text (1-${RAW_MAX} characters)`);
        }
      for (const k of ['text', 'ref', 'a', 'b']) {
        const v = o[k];
        if (T[k] && T[k].startsWith('ref') && typeof v === 'string' && C.ID_RE.test(v) && !ids.includes(v))
          E2('ref', `${at}.${k}`, 'not a text of the model');
      }
      if (
        o.of === 'assoc' &&
        !(o.w1 !== undefined && o.w2 !== undefined) &&
        !(o.o11 !== undefined && o.r1 !== undefined && o.c1 !== undefined && o.n !== undefined)
      )
        E2('value', at, 'needs w1 and w2, or the counts o11, r1, c1 and n');
      if (['scansions', 'foot', 'dactyls', 'caesura', 'scansion', 'dactylsByLine', 'metreFit'].includes(of) && !isObj(M.metre))
        E2('ref', at + '.of', 'needs model.metre');
      if (of === 'metreFit' && isObj(M.metre) && !['iambic5', 'iambic4', 'trochaic4'].includes(M.metre.pattern as string))
        E2('ref', at + '.of', 'metreFit is for the English metres (iambic5, iambic4, trochaic4); use scansions');
      if (
        ['foot', 'dactyls', 'caesura', 'scansions', 'scansion', 'dactylsByLine'].includes(of) &&
        isObj(M.metre) &&
        ['iambic5', 'iambic4', 'trochaic4'].includes(M.metre.pattern as string)
      )
        E2('ref', at + '.of', 'the English metres give metreFit and syllables');
      if ((o.of === 'delta' || o.of === 'deltaMap') && ids.length < 3) E2('value', at + '.of', 'Delta needs at least 3 texts');
      if (isNum(o.line) && !(Number.isInteger(o.line) && o.line >= 1 && o.line <= 2000))
        E2('value', at + '.line', 'needs an integer from 1 to 2000');
      if (o.of === 'scheme' && rawOk(o.scheme) && !/^[A-Za-z ]+$/.test(o.scheme))
        E2('value', at + '.scheme', 'needs letters such as ABAB CDCD EFEF GG');
    },
    E,
    W,
  );
  return P;
}
function exprs(spec: unknown): Array<[string, string, string[]]> {
  const out: Array<[string, string, string[]]> = [];
  (isObj(spec) && Array.isArray(spec.outputs) ? (spec.outputs as unknown[]) : []).forEach((o, i) => {
    if (!isObj(o)) return;
    const K = OUT[o.kind as string],
      T = K && K[o.of as string];
    if (!T) return;
    for (const k of NUMX_ORDER) {
      const v = o[k];
      if (T[k] && T[k].startsWith('numx') && typeof v === 'string') out.push([v, `outputs[${i}].${k}`, []]);
    }
  });
  return out;
}
function keys(spec: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = [],
    m: Rec = isObj(spec) && isObj(spec.model) ? spec.model : {};
  (Array.isArray(m.texts) ? (m.texts as unknown[]) : []).forEach((t, i) => {
    if (isObj(t) && typeof t.label === 'string') out.push([t.label, `model.texts[${i}].label`]);
  });
  return out;
}

/* ---------- normalisation and tokens ---------- */
const APOS = /['ʼ᾽᾿]/g; // ' U+02BC U+1FBD U+1FBF → ’ (U+2019): one elision mark
const TOKEN = /[\p{L}\p{M}\p{N}]+(?:’[\p{L}\p{M}\p{N}]+)*’?/gu;
const NOSPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const ENCL_EXC = new Set([
  'quoque',
  'itaque',
  'neque',
  'utique',
  'atque',
  'quisque',
  'quaeque',
  'quodque',
  'usque',
  'denique',
  'undique',
  'plerumque',
  'namque',
  'bene',
  'mane',
  'pane',
  'sine',
  'paene',
  'ne',
  'que',
  've',
  'nive',
  'sive',
  'neve',
]);
/** a token: w (folded), s (surface), i (char offset), sent (sentence index) */
interface Tok {
  w: string;
  s: string;
  readonly i: number;
  readonly sent: number;
}
interface Tokens {
  readonly toks: Tok[];
  readonly norm: string;
  readonly sentences: number;
  readonly hasEnd: boolean;
}
/** a text's tokens as a run keeps them: the words, their counts and the codes of the tokenizer */
interface RunTokens extends Tokens {
  readonly ws: string[];
  readonly cm: Map<string, number>;
  readonly codes: string[];
}
function normalizeText(s: string | undefined, N: Norm): string {
  let t = String(s).replace(/﻿|­/g, '');
  const form = N.form || 'NFC';
  if (form !== 'none') t = t.normalize(form);
  t = t.replace(APOS, '’');
  if ((N.hyphens || 'join') === 'join') t = t.replace(/(\p{L})-\r?\n\s*(\p{Ll})/gu, '$1$2');
  return t;
}
function foldWord(w: string, N: Norm): string {
  let x = w;
  if ((N.case || 'lower') === 'lower') x = x.toLowerCase();
  if ((N.diacritics || 'keep') === 'strip') x = x.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  if (N.foldSigma) x = x.replace(/ς/g, 'σ');
  if (N.uvij) x = x.replace(/v/g, 'u').replace(/j/g, 'i').replace(/V/g, 'U').replace(/J/g, 'I');
  return x;
}
/** tokens of a text: [{w (folded), s (surface), i (char offset), sent (sentence index)}] and codes */
function tokenize(text: TextDoc, N: Norm, codes: string[]): Tokens {
  const lang = text.lang || 'other',
    t = normalizeText(text.body || '', N),
    out: Tok[] = [];
  const seg = N.segment || 'auto';
  const sentEnd = lang === 'grc' || lang === 'el' ? /[.!?;…]/ : /[.!?…]/;
  const ABBR = /^(mr|mrs|ms|dr|st|vs|cf|etc|e\.g|i\.e|no|prof|jr|sr|vol|pp|ca|fig)$/i;
  let sent = 0,
    last = 0;
  const pushTok = (s: string, i: number) => {
    // sentence boundaries between the previous token and this one
    const gap = t.slice(last, i);
    if (out.length && sentEnd.test(gap) && !(/^\s*\.\s*$/.test(gap) && ABBR.test(out[out.length - 1]!.s))) sent++;
    last = i + s.length;
    if ((N.numbers || 'drop') === 'drop' && /^[\p{N}]+$/u.test(s)) return;
    const w = foldWord(s, N);
    if (N.enclitics && lang === 'la') {
      const m = /^(.{2,}?)(que|ne|ve)$/.exec(w);
      if (m && !ENCL_EXC.has(w)) {
        out.push({ w: m[1]!, s, i, sent });
        out.push({ w: '-' + m[2]!, s, i, sent });
        return;
      }
    }
    out.push({ w, s, i, sent });
  };
  const useChars = seg === 'chars' || (seg === 'auto' && ['zh', 'ja', 'th'].includes(lang));
  if (seg === 'words' && NOSPACE.test(t)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- engines without Intl.Segmenter exist (the types assume one)
    if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
      for (const x of new Intl.Segmenter(lang === 'other' ? undefined : lang, { granularity: 'word' }).segment(t))
        if (x.isWordLike) pushTok(x.segment, x.index);
      codes.push('segmenter_approx');
    } else {
      codes.push('no_segmenter');
      for (const x of t.matchAll(TOKEN)) charToks(x[0], x.index);
    }
  } else
    for (const x of t.matchAll(TOKEN)) {
      if (useChars && NOSPACE.test(x[0])) charToks(x[0], x.index);
      else pushTok(x[0], x.index);
    }
  function charToks(s: string, i0: number) {
    let off = 0;
    for (const ch of s) {
      if (/[\p{L}\p{N}]/u.test(ch) || /\p{M}/u.test(ch)) {
        if (/\p{M}/u.test(ch) && out.length) {
          out[out.length - 1]!.w += ch;
          out[out.length - 1]!.s += ch;
        } else pushTok(ch, i0 + off);
      }
      off += ch.length;
    }
  }
  if (out.length > LIM.tokens) {
    codes.push('truncated');
    out.length = LIM.tokens;
  }
  return { toks: out, norm: t, sentences: out.length ? sent + 1 : 0, hasEnd: sentEnd.test(t) };
}
const graphemes = (s: string) => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- engines without Intl.Segmenter exist (the types assume one)
  if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)).length;
  }
  return Array.from(s.normalize('NFC')).length;
};

/* ---------- frequency and lexical diversity ---------- */
function counts(ws: readonly string[]) {
  const m = new Map<string, number>();
  for (const w of ws) m.set(w, (m.get(w) || 0) + 1);
  return m;
}
/** types by frequency, ties by first occurrence (Map insertion order) */
const ranked = (cm: Map<string, number>) =>
  [...cm.entries()].map((e, i): [string, number, number] => [e[0], e[1], i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
const ttr = (ws: readonly string[]) => (ws.length ? new Set(ws).size / ws.length : NaN);
/** MATTR (Covington & McFall 2010): the mean TTR of every window of W tokens; W > N → the TTR (code window_gt_text) */
function mattr(ws: readonly string[], W: number, codes?: string[]) {
  W = Math.max(1, Math.round(W));
  if (!ws.length) return NaN;
  if (ws.length < W) {
    if (codes) codes.push('window_gt_text');
    return ttr(ws);
  }
  const c = new Map<string, number>();
  let types = 0,
    sum = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    c.set(w, (c.get(w) || 0) + 1);
    if (c.get(w) === 1) types++;
    if (i >= W) {
      const o = ws[i - W]!,
        k = c.get(o)! - 1;
      c.set(o, k);
      if (k === 0) types--;
    }
    if (i >= W - 1) sum += types / W;
  }
  return sum / (ws.length - W + 1);
}
/** MTLD (McCarthy & Jarvis 2010, BRM 42:381): factors where the running TTR falls to the threshold (≤ 0.72); the rest a partial factor */
function mtldDir(ws: readonly string[], th: number) {
  let f = 0,
    types = new Set<string>(),
    n = 0;
  for (const w of ws) {
    n++;
    types.add(w);
    if (types.size / n <= th) {
      f++;
      types = new Set<string>();
      n = 0;
    }
  }
  if (n > 0) f += (1 - types.size / n) / (1 - th);
  return f > 0 ? ws.length / f : NaN;
}
const mtld = (ws: readonly string[], th: number) => (ws.length ? (mtldDir(ws, th) + mtldDir(ws.slice().reverse(), th)) / 2 : NaN);
/** HD-D (McCarthy & Jarvis 2007): Σ over types of (1 − P(type absent from a random sample of s tokens)) / s — the expected TTR of the sample */
function hdd(cm: Map<string, number>, N: number, s: number) {
  s = Math.round(s);
  if (N < s || s < 1) return NaN;
  const lnC = (n: number, k: number) => lgam(n + 1) - lgam(k + 1) - lgam(n - k + 1);
  let sum = 0;
  for (const f of cm.values()) {
    const p0 = N - f >= s ? Math.exp(lnC(N - f, s) - lnC(N, s)) : 0;
    sum += (1 - p0) / s;
  }
  return sum;
}
function lgam(x: number): number {
  // ln Γ(x), Lanczos (g = 7, n = 9)
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgam(1 - x);
  x -= 1;
  let a = g[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function spectrum(cm: Map<string, number>) {
  const V = new Map<number, number>();
  for (const f of cm.values()) V.set(f, (V.get(f) || 0) + 1);
  return V;
}
const yuleK = (cm: Map<string, number>, N: number) => {
  if (!N) return NaN;
  let s = 0;
  for (const [m, v] of spectrum(cm)) s += m * m * v;
  return (1e4 * (s - N)) / (N * N);
}; // Yule 1944
const simpsonD = (cm: Map<string, number>, N: number) => {
  if (N < 2) return NaN;
  let s = 0;
  for (const f of cm.values()) s += f * (f - 1);
  return s / (N * (N - 1));
};
const honoreR = (cm: Map<string, number>, N: number) => {
  const V = cm.size,
    V1 = [...cm.values()].filter(f => f === 1).length;
  return V1 === V ? NaN : (100 * Math.log(N)) / (1 - V1 / V);
}; // Honoré 1979
function ols(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length;
  if (n < 2) return { b: NaN, a: NaN };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { b, a: (sy - b * sx) / n };
}
/** Zipf exponent α of f(r) = C r^−α: OLS on ln f vs ln r over ranks rmin…rmax, or the discrete power-law MLE of the frequency
      distribution (Clauset, Shalizi & Newman 2009, SIAM Rev. 51:661, eq. 3.7 approximation) turned into α = 1/(α_f − 1) */
function zipf(cm: Map<string, number>, fit: string, rmin: number | undefined, rmax: number | undefined, codes: string[], xmin0?: number) {
  const fr = ranked(cm).map(e => e[1]);
  if (fr.length < 5) {
    codes.push('few_types');
    return NaN;
  }
  if (fit === 'mle') {
    const xmin = Math.max(1, Math.round(xmin0 || 1)),
      xs = fr.filter(f => f >= xmin);
    if (xs.length < 5) {
      codes.push('few_types');
      return NaN;
    }
    let s = 0;
    for (const x of xs) s += Math.log(x / (xmin - 0.5));
    const af = 1 + xs.length / s;
    return 1 / (af - 1);
  }
  const a = Math.max(1, Math.round(rmin || 1)),
    b = Math.min(fr.length, Math.round(rmax || fr.length)),
    X: number[] = [],
    Y: number[] = [];
  for (let r = a; r <= b; r++) {
    X.push(Math.log(r));
    Y.push(Math.log(fr[r - 1]!));
  }
  if (X.length < 5) {
    codes.push('few_types');
    return NaN;
  }
  return -ols(X, Y).b;
}
function heapsCurve(ws: readonly string[]) {
  const seen = new Set<string>(),
    N: number[] = [],
    V: number[] = [];
  ws.forEach((w, i) => {
    seen.add(w);
    N.push(i + 1);
    V.push(seen.size);
  });
  return { N, V };
}
function heaps(ws: readonly string[], codes: string[]) {
  // V = K N^β (Heaps 1978), OLS on ln V vs ln N over N ≥ max(10, N/10)
  if (ws.length < 50) {
    codes.push('too_short');
    return { beta: NaN, K: NaN };
  }
  const { N, V } = heapsCurve(ws),
    lo = Math.max(10, Math.floor(ws.length / 10)),
    X: number[] = [],
    Y: number[] = [];
  for (let i = lo - 1; i < N.length; i++) {
    X.push(Math.log(N[i]!));
    Y.push(Math.log(V[i]!));
  }
  const r = ols(X, Y);
  return { beta: r.b, K: Math.exp(r.a) };
}

/* ---------- association (Evert 2008; Manning & Schütze 1999 ch. 5) ---------- */
function assoc(o11: number, r1: number, c1: number, n: number, measure: string | undefined, codes: string[]) {
  if (![o11, r1, c1, n].every(isNum) || n <= 0 || r1 <= 0 || c1 <= 0 || o11 < 0 || o11 > Math.min(r1, c1)) {
    codes.push('counts');
    return NaN;
  }
  const O = [
      [o11, r1 - o11],
      [c1 - o11, n - r1 - c1 + o11],
    ],
    R = [r1, n - r1],
    Cc = [c1, n - c1];
  if (O[1]![1]! < 0) {
    codes.push('counts');
    return NaN;
  }
  const E = [
    [(R[0]! * Cc[0]!) / n, (R[0]! * Cc[1]!) / n],
    [(R[1]! * Cc[0]!) / n, (R[1]! * Cc[1]!) / n],
  ];
  if (measure === 'pmi' || measure === 'npmi' || measure === 'mi3') {
    if (o11 === 0) {
      codes.push('zero_pair');
      return measure === 'npmi' ? -1 : -Infinity;
    }
    const pmi = Math.log2((o11 * n) / (r1 * c1));
    if (measure === 'pmi') return pmi; // Church & Hanks 1990
    if (measure === 'mi3') return Math.log2((o11 ** 3 * n) / (r1 * c1)); // Daille 1994
    return o11 === n ? 1 : pmi / -Math.log2(o11 / n); // Bouma 2009
  }
  if (measure === 't') {
    if (o11 === 0) {
      codes.push('zero_pair');
      return NaN;
    }
    return (o11 - E[0]![0]!) / Math.sqrt(o11);
  } // Church et al. 1991
  if (measure === 'chi2') {
    if (E.some(r => r.some(e => e < 5))) codes.push('chi2_small');
    return (n * (O[0]![0]! * O[1]![1]! - O[0]![1]! * O[1]![0]!) ** 2) / (R[0]! * R[1]! * Cc[0]! * Cc[1]!);
  }
  if (measure === 'g2') {
    let g = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (O[i]![j]! > 0) g += O[i]![j]! * Math.log(O[i]![j]! / E[i]![j]!);
    return 2 * g;
  } // Dunning 1993
  if (measure === 'dice') return (2 * o11) / (r1 + c1); // Dice 1945; Smadja 1993
  if (measure === 'logDice') {
    if (o11 === 0) {
      codes.push('zero_pair');
      return -Infinity;
    }
    return 14 + Math.log2((2 * o11) / (r1 + c1));
  } // Rychlý 2008
  return NaN;
}
function pairCount(ws: readonly string[], w1: string, w2: string, span: number) {
  let n = 0;
  for (let i = 0; i < ws.length; i++) if (ws[i] === w1) for (let k = 1; k <= span && i + k < ws.length; k++) if (ws[i + k] === w2) n++;
  return n;
}

/* ---------- syllables (for readability and English metre) ---------- */
const EN_EXC: Readonly<Record<string, number>> = {
  every: 2,
  business: 2,
  fire: 1,
  hour: 1,
  our: 1,
  poem: 2,
  orange: 2,
  wednesday: 2,
  naive: 2,
  area: 3,
  idea: 3,
  create: 2,
  people: 2,
  heaven: 2,
  flower: 2,
  power: 2,
  being: 2,
  quiet: 2,
  science: 2,
  lion: 2,
  real: 1,
  eye: 1,
  eyes: 1,
  the: 1,
  are: 1,
  were: 1,
  there: 1,
  where: 1,
  here: 1,
  more: 1,
  before: 2,
  temperate: 3,
  lovely: 2,
  sometime: 2,
  nature: 2,
  changing: 2,
  possession: 3,
  wander: 2,
  eternal: 3,
  every_: 2,
  breathe: 1,
  gives: 1,
  lives: 1,
  shake: 1,
  lease: 1,
  complexion: 3,
  declines: 2,
  untrimmed: 2,
  dimmed: 1,
  owest: 1,
  growest: 1,
  thou: 1,
  rough: 1,
  through: 1,
  though: 1,
  one: 1,
  once: 1,
  done: 1,
  gone: 1,
  some: 1,
  come: 1,
  love: 1,
  move: 1,
  give: 1,
  live: 1,
  have: 1,
  above: 2,
  whose: 1,
  those: 1,
  these: 1,
  machine: 2,
  recipe: 3,
  simile: 3,
  apostrophe: 4,
  epitome: 4,
  cafe: 2,
  maybe: 2,
};
function sylEn(w0: string): number {
  const w = w0
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-zà-ÿ]/g, '');
  if (!w) return 0;
  if (EN_EXC[w]) return EN_EXC[w];
  if (w.length <= 3) return 1;
  let x = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m: string) => m[0]!).replace(/^y/, '');
  if (/[^aeiouy]le$/.test(w)) x = w.slice(0, -2) + 'el'; // table, little: the -le stays a syllable
  if (/(?:[sxz]|ch|sh|[cg])es$/.test(w)) x = w.slice(0, -2) + 'as'; // boxes, places, judges: -es is a syllable
  if (/[td]ed$/.test(w)) x = w.slice(0, -2) + 'ad'; // wanted, needed: -ed is a syllable
  let n = (x.match(/[aeiouyà-ÿ]+/g) || []).length;
  if (/[^aeiou]ia/.test(w) || (/[^t]io/.test(w) && !/(tion|sion|cious|tious|gious)/.test(w)))
    n += (w.match(/[^aeiouts]i[ao]/g) || []).length ? 1 : 0;
  if (/eo(?!u)|ua|uo|iu(?!m)/.test(w)) n += 0;
  if (/ism$/.test(w)) n++;
  if (/[^aeiouy]ier$|[^aeiouy]iest$/.test(w)) n++;
  return Math.max(1, n);
}
const VOW: Readonly<Record<string, RegExp>> & { readonly other: RegExp } = {
  de: /[aeiouyäöü]+/g,
  fr: /[aeiouyàâäéèêëîïôöùûüœæ]+/g,
  es: /[aeiouyáéíóúü]+/g,
  it: /[aeiouàèéìíòóùú]+/g,
  ru: /[аеёиоуыэюя]/g,
  la: /[aeiouyāēīōūȳ]+/g,
  el: /[αεηιουωάέήίόύώϊϋΐΰ]+/g,
  other: /[aeiouyà-ÿ]+/g,
};
function sylOf(w: string, lang: Lang | undefined): number {
  if (lang === 'en') return sylEn(w);
  let x = w.toLowerCase();
  if (lang === 'es') x = x.replace(/([aeo])([íú])/g, '$1-$2').replace(/([íú])([aeo])/g, '$1-$2'); // hiatus with an accented í, ú
  if (lang === 'fr') x = x.replace(/(?:e|es|ent)$/, '') || x; // the mute final e (prose)
  if (lang === 'grc' || lang === 'el') x = x.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  const re = VOW[lang as string] || VOW.other;
  return Math.max(1, (x.match(re) || []).length);
}
/* ---------- readability (sources in docs/library/text.md §readability) ---------- */
function readability(toks: readonly Tok[], sentences: number, lang: Lang, formula: string, what: string, codes: string[]) {
  const words = toks.filter(t => /\p{L}/u.test(t.s)),
    W = words.length,
    S = Math.max(sentences, W ? 1 : 0);
  if (!W) {
    codes.push('empty');
    return NaN;
  }
  const syl = words.map(t => sylOf(t.s, lang)),
    SY = syl.reduce((a, b) => a + b, 0);
  const letters = words.reduce((a, t) => a + (t.s.match(/\p{L}/gu) || []).length, 0);
  const asl = W / S,
    asw = SY / W,
    poly = syl.filter(x => x >= 3).length,
    long = words.filter(t => (t.s.match(/\p{L}/gu) || []).length > 6).length;
  if (what === 'asl') return asl;
  if (what === 'asw') return asw;
  if (what === 'words') return W;
  if (what === 'sentences') return S;
  if (what === 'syllables') return SY;
  const L = FORMULA_LANG[formula];
  if (L && !L.includes(lang)) codes.push('formula_lang');
  if (sentences === 0) codes.push('no_sentences');
  switch (formula) {
    case 'flesch':
      return 206.835 - 1.015 * asl - 84.6 * asw; // Flesch 1948
    case 'fk':
      return 0.39 * asl + 11.8 * asw - 15.59; // Kincaid et al. 1975
    case 'fog':
      return 0.4 * (asl + (100 * poly) / W); // Gunning 1952
    case 'smog':
      if (S < 30) codes.push('smog_short');
      return 1.043 * Math.sqrt((poly * 30) / S) + 3.1291; // McLaughlin 1969
    case 'coleman':
      return 0.0588 * ((100 * letters) / W) - 0.296 * ((100 * S) / W) - 15.8; // Coleman & Liau 1975
    case 'ari':
      return (4.71 * letters) / W + 0.5 * asl - 21.43; // Senter & Smith 1967
    case 'lix':
      return asl + (100 * long) / W; // Björnsson 1968
    case 'amstad':
      return 180 - asl - 58.5 * asw; // Amstad 1978
    case 'kandel':
      return 207 - 1.015 * asl - 73.6 * asw; // Kandel & Moles 1958
    case 'huerta':
      return 206.84 - 0.6 * (100 * asw) - 1.02 * ((100 * S) / W); // Fernández Huerta 1959
    case 'szigriszt':
      return 206.835 - 62.3 * asw - asl; // Szigriszt-Pazos 1993
    case 'oborneva':
      return 206.835 - 1.3 * asl - 60.1 * asw; // Oborneva 2006
  }
  return NaN;
}

/* ---------- stylometry: Burrows' Delta (2002) and its variants ---------- */
function deltaMatrix(tokLists: ReadonlyArray<readonly string[]>, mfw: number, variant: string, codes: string[]) {
  const all = new Map<string, number>();
  tokLists.forEach(ws => {
    for (const w of ws) all.set(w, (all.get(w) || 0) + 1);
  });
  const words = ranked(all)
    .slice(0, Math.max(1, Math.round(mfw)))
    .map(e => e[0]);
  const rel = tokLists.map(ws => {
    const c = counts(ws),
      n = ws.length || 1;
    return words.map(w => (c.get(w) || 0) / n);
  });
  const k = tokLists.length,
    Z = rel.map((): number[] => []),
    keep: string[] = [];
  words.forEach((w, j) => {
    const xs = rel.map(r => r[j]!),
      mu = xs.reduce((a, b) => a + b, 0) / k,
      sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (k - 1));
    if (!(sd > 0)) return;
    keep.push(w);
    rel.forEach((r, i) => Z[i]!.push((r[j]! - mu) / sd));
  });
  if (keep.length < words.length) codes.push('sd_zero');
  const n = keep.length,
    D: number[][] = [];
  for (let a = 0; a < k; a++) {
    D.push([]);
    const Za = Z[a]!;
    for (let b = 0; b < k; b++) {
      const Zb = Z[b]!;
      let v;
      if (!n) v = NaN;
      else if (variant === 'cosine') {
        let ab = 0,
          aa = 0,
          bb = 0;
        for (let j = 0; j < n; j++) {
          ab += Za[j]! * Zb[j]!;
          aa += Za[j]! ** 2;
          bb += Zb[j]! ** 2;
        }
        v = 1 - ab / Math.sqrt(aa * bb);
      } else if (variant === 'quadratic') {
        let s = 0;
        for (let j = 0; j < n; j++) s += (Za[j]! - Zb[j]!) ** 2;
        v = s / n;
      } // Argamon 2008
      else {
        let s = 0;
        for (let j = 0; j < n; j++) s += Math.abs(Za[j]! - Zb[j]!);
        v = s / n;
      }
      D[a]!.push(a === b ? 0 : v);
    }
  }
  return { D, words: keep };
}

/* ---------- quantitative metre: syllables of a line (Latin, Greek), every valid scansion ---------- */
const MAC = '̄',
  BRE = '̆',
  DIA = '̈',
  CIRC = '͂',
  ISUB = 'ͅ';
const LA_DIPH = ['ae', 'au', 'oe'],
  LA_DIPH_W: Readonly<Record<string, readonly string[]>> = {
    eu: ['heu', 'eheu', 'neu', 'seu', 'ceu'],
    ui: ['cui', 'huic'],
    ei: ['dein', 'deinde', 'hei', 'proin', 'proinde'],
  };
const GR_DIPH = ['αι', 'ει', 'οι', 'υι', 'αυ', 'ευ', 'ηυ', 'ου', 'ωυ'];
const GR_STOP = 'πβφτδθκγχ',
  LIQ_LA = 'lr',
  LIQ_GR = 'λρ',
  LA_STOP = 'bcdgptk';
/** letters of a word: [{b: base letter, m: marks}] (NFD; Greek: only quantity-relevant marks kept) */
/** a letter of a word: its base letter and its combining marks */
interface Letter {
  readonly b: string;
  m: string;
}
/** a unit of a word: a vowel (V: its natural quantity, a diphthong, an iota subscript) or a consonant (C: its weight in position,
    a stop, a liquid); s = its letters */
interface Unit {
  readonly t: 'V' | 'C';
  readonly s: string;
  readonly nat?: boolean | null;
  readonly diph?: boolean;
  readonly isub?: boolean;
  readonly end?: boolean;
  readonly w?: number;
  readonly stop?: boolean;
  readonly liq?: boolean;
}
/** a unit in the line: its word and whether it ends it */
interface SeqUnit extends Unit {
  readonly wi: number;
  readonly last: boolean;
}
/** a word of a verse line */
interface VerseWord {
  readonly s: string;
  readonly norm: string;
  U: Unit[];
  readonly hiatus: boolean;
  readonly elided: boolean;
  readonly link: boolean;
  elidedAt?: boolean;
  corr?: boolean;
  synal?: boolean;
}
/** a syllable: its possible quantities (L, S), why it is open to choice, its word, vowel, written form w */
interface Syl {
  readonly q: string[];
  readonly why: string | null;
  readonly wi: number;
  readonly s: string;
  readonly diph: boolean | undefined;
  readonly wordEnd: boolean;
  readonly i: number;
  w?: string;
}
interface LineSyllables {
  readonly syl: Syl[];
  readonly words: VerseWord[];
  readonly notes: Array<{ readonly w: number; readonly k: string }>;
  readonly cand: number[];
  readonly seq: SeqUnit[];
}
function letters(word: string) {
  const out: Letter[] = [];
  for (const ch of word.normalize('NFD')) {
    if (/\p{M}/u.test(ch)) {
      if (out.length) out[out.length - 1]!.m += ch;
      continue;
    }
    if (!/\p{L}/u.test(ch)) continue;
    let b = ch.toLowerCase();
    if (b === 'ς') b = 'σ';
    out.push({ b, m: '' });
  }
  return out;
}
const isV = (b: string, gr: boolean) => (gr ? 'αεηιουω' : 'aeiouy').includes(b);
/** a word → units: V {nat: true | false | null, diph, s} and C {w (position weight), stop, liq, s} (Allen 1973/1978/1987) */
function units(word: string, lang: Lang | undefined, wordNorm: string) {
  const gr = lang === 'grc',
    L = letters(word),
    U: Unit[] = [];
  const plain = L.map(x => x.b).join('');
  for (let i = 0; i < L.length; i++) {
    const { b, m } = L[i]!,
      nx = L[i + 1],
      nb = nx ? nx.b : '';
    if (isV(b, gr) || (!gr && (b === 'i' || b === 'u'))) {
      // Latin consonantal i / u
      if (
        !gr &&
        b === 'i' &&
        !m.includes(DIA) &&
        nx &&
        isV(nb, false) &&
        (i === 0 ? !['io', 'iulus', 'ion'].includes(plain) : U.length && U[U.length - 1]!.t === 'V')
      ) {
        U.push({ t: 'C', w: i === 0 ? 1 : 2, stop: false, liq: false, s: 'i' });
        continue;
      }
      if (!gr && b === 'u' && !m.includes(DIA) && nx && isV(nb, false) && (i === 0 || (U.length && U[U.length - 1]!.t === 'V'))) {
        if (i === 0 || U[U.length - 1]!.t === 'V') {
          U.push({ t: 'C', w: 1, stop: false, liq: false, s: 'u' });
          continue;
        }
      }
      // diphthongs
      const pair = nx ? b + nb : '';
      const diph =
        nx &&
        !nx.m.includes(DIA) &&
        !m.includes(MAC) &&
        !m.includes(BRE) &&
        (gr ? GR_DIPH.includes(pair) : LA_DIPH.includes(pair) || (LA_DIPH_W[pair] || []).includes(wordNorm));
      if (diph) {
        U.push({ t: 'V', nat: true, diph: true, s: b + nb, end: false });
        i++;
        continue;
      }
      let nat: boolean | null = null;
      if (m.includes(MAC) || m.includes(CIRC) || m.includes(ISUB)) nat = true;
      else if (m.includes(BRE)) nat = false;
      else if (gr) nat = b === 'η' || b === 'ω' ? true : b === 'ε' || b === 'ο' ? false : null;
      U.push({ t: 'V', nat, diph: false, isub: m.includes(ISUB), s: b });
      continue;
    }
    if (b === 'h' && !gr) {
      U.push({ t: 'C', w: 0, stop: false, liq: false, s: 'h' });
      continue;
    }
    if (!gr && b === 'q' && nb === 'u') {
      U.push({ t: 'C', w: 1, stop: true, liq: false, s: 'qu' });
      i++;
      continue;
    }
    if (!gr && b === 'g' && nb === 'u' && i > 0 && L[i - 1]!.b === 'n' && L[i + 2] && isV(L[i + 2]!.b, false)) {
      U.push({ t: 'C', w: 1, stop: true, liq: false, s: 'gu' });
      i++;
      continue;
    }
    if (!gr && 'cpt'.includes(b) && nb === 'h') {
      U.push({ t: 'C', w: 1, stop: true, liq: false, s: b + 'h' });
      i++;
      continue;
    }
    if (!gr && b === 'r' && nb === 'h') {
      U.push({ t: 'C', w: 1, stop: false, liq: true, s: 'rh' });
      i++;
      continue;
    }
    const dbl = gr ? 'ζξψ'.includes(b) : 'xz'.includes(b);
    U.push({
      t: 'C',
      w: dbl ? 2 : 1,
      stop: gr ? GR_STOP.includes(b) : LA_STOP.includes(b),
      liq: gr ? LIQ_GR.includes(b) : LIQ_LA.includes(b),
      s: b,
    });
  }
  return U;
}
/** a verse line → syllables with their possible quantities and the optional changes (synizesis) */
function lineSyllables(line: string, lang: Lang | undefined, opts: Metre): LineSyllables {
  const gr = lang === 'grc';
  const txt = line.normalize('NFC').replace(APOS, '’');
  const rawWords = txt.split(/\s+/).filter(Boolean);
  const words: VerseWord[] = [];
  for (const rw of rawWords) {
    const hiatus = /\^/.test(rw),
      elided = /’$/.test(rw.replace(/[^\p{L}\p{M}’‿]/gu, ''));
    const parts = rw.split('‿');
    parts.forEach((p, k) => {
      const clean = p.replace(/[^\p{L}\p{M}]/gu, '');
      if (!clean) return;
      const norm = letters(clean)
        .map(x => x.b)
        .join('');
      words.push({
        s: clean,
        norm,
        U: units(clean, lang, norm),
        hiatus: hiatus && k === parts.length - 1,
        elided: elided && k === parts.length - 1,
        link: k < parts.length - 1,
      });
    });
  }
  // Latin elision (synaloepha) and prodelision: a final vowel, diphthong or vowel + m before an initial vowel or h + vowel
  const notes: Array<{ w: number; k: string }> = [];
  for (let i = 0; i + 1 < words.length; i++) {
    const a = words[i]!,
      b = words[i + 1]!,
      U = a.U,
      V = b.U;
    const firstV = V.findIndex(u => u.t === 'V'),
      startsV = firstV === 0 || (firstV === 1 && V[0]!.s === 'h');
    const lastV = U.length - 1 - [...U].reverse().findIndex(u => u.t === 'V');
    if (lastV < 0 || lastV >= U.length) continue;
    const endsV = lastV === U.length - 1 || (!gr && lastV === U.length - 2 && U[U.length - 1]!.s === 'm');
    if (!gr && startsV && endsV && !a.hiatus) {
      if (/^(est|es)$/.test(b.norm)) {
        b.U = b.U.slice(1);
        notes.push({ w: i + 1, k: 'prodelision' });
      } // bona est → bona'st
      else {
        a.U = U.slice(0, lastV);
        a.elidedAt = true;
        notes.push({ w: i, k: 'elision' });
      }
    }
    if (gr && startsV && endsV && lastV === U.length - 1 && !a.hiatus && !a.elided) a.corr = true; // epic correption is possible
    if (a.link) a.synal = true;
  }
  // the flat sequence of units with word ends
  const seq: SeqUnit[] = [];
  words.forEach((w, wi) => {
    w.U.forEach((u, k) => seq.push(Object.assign({}, u, { wi, last: k === w.U.length - 1 })));
  });
  // syllables: one per vowel unit; the consonants after a vowel (up to the next vowel, across word ends) decide position
  const syl: Syl[] = [];
  for (let i = 0; i < seq.length; i++) {
    if (seq[i]!.t !== 'V') continue;
    let j = i + 1,
      w = 0;
    const cl: SeqUnit[] = [];
    while (j < seq.length && seq[j]!.t !== 'V') {
      cl.push(seq[j]!);
      w += seq[j]!.w!; // a consonant's weight
      j++;
    }
    const wordEndV = !cl.length && j < seq.length && seq[j]!.wi !== seq[i]!.wi; // a vowel at a word end before a vowel
    const v = seq[i]!;
    const realCl = cl.filter(c => c.w! > 0);
    const mcl = realCl.length === 2 && realCl[0]!.stop && realCl[1]!.liq && realCl.every(c => c.wi === realCl[0]!.wi) && w === 2;
    let q: string[],
      why: string | null = null;
    if (v.nat === true) q = ['L'];
    else if (w >= 2 && !mcl) q = ['L'];
    else if (mcl) {
      q = ['L', 'S']; // (a long vowel took the first branch)
      why = 'mcl';
    } else q = v.nat === false ? ['S'] : ['L', 'S'];
    if (gr && v.nat === true && wordEndV && words[v.wi]!.corr) {
      q = ['L', 'S'];
      why = 'correption';
    }
    // the syllable's written form: its onset consonants (from the previous vowel's cluster) + the vowel
    syl.push({ q, why, wi: v.wi, s: v.s, diph: v.diph, wordEnd: j >= seq.length || seq[j]!.wi !== v.wi, i });
  }
  // written syllables for display: inside a word one consonant (or a stop + liquid) opens the next syllable, the rest close this one;
  // at a word end the consonants stay with their own word
  const vi: number[] = [];
  seq.forEach((u, i) => {
    if (u.t === 'V') vi.push(i);
  });
  if (vi.length) {
    const on = vi.map(() => ''),
      co = vi.map(() => '');
    for (let i = 0; i < vi[0]!; i++) on[0]! += seq[i]!.s;
    for (let i = vi[vi.length - 1]! + 1; i < seq.length; i++) co[vi.length - 1]! += seq[i]!.s;
    for (let k = 0; k + 1 < vi.length; k++) {
      const a = vi[k]!,
        b = vi[k + 1]!,
        cl = seq.slice(a + 1, b),
        inW = cl.filter(c => c.wi === seq[a]!.wi && c.wi === seq[b]!.wi);
      const nOn = inW.length >= 2 && inW[inW.length - 2]!.stop && inW[inW.length - 1]!.liq ? 2 : Math.min(1, inW.length);
      cl.forEach(c => {
        if (c.wi === seq[a]!.wi && c.wi !== seq[b]!.wi) co[k]! += c.s;
        else if (c.wi !== seq[a]!.wi) on[k + 1]! += c.s;
        else if (inW.indexOf(c) >= inW.length - nOn) on[k + 1]! += c.s;
        else co[k]! += c.s;
      });
    }
    syl.forEach((x, k) => {
      x.w = on[k]! + x.s + co[k]!;
      if (x.wordEnd) x.w = x.w.replace(/σ$/, 'ς');
    });
  }
  const cand: number[] = [];
  if (gr && opts.synizesis !== false)
    syl.forEach((s, k) => {
      const n = syl[k + 1];
      if (n && n.wi === s.wi && s.s === 'ε' && !s.diph && ['ω', 'ο', 'α'].includes(n.s[0]!)) cand.push(k);
    });
  // author-marked synizesis / synaloepha (‿) inside a word: merge the two vowels
  return { syl, words, notes, cand, seq };
}
// the metres as sequences of elements; each element: alternatives of quantity strings (X = either) — West 1987; Raven 1965
/** an alternative of a metre's element: its quantities (X = either) and its label */
type Alt = [string, string];
const D_S: Alt[] = [
  ['LSS', 'D'],
  ['LL', 'S'],
];
const TEMPLATES: Readonly<Record<string, Alt[][]>> = {
  hexameter: [D_S, D_S, D_S, D_S, D_S, [['LX', 'S']]],
  pentameter: [D_S, D_S, [['L', 'h']], [['LSS', 'D']], [['LSS', 'D']], [['X', 'e']]],
  trimeter: (() => {
    const X: Alt[] = [
        ['L', 'x'],
        ['S', 'x'],
        ['SS', 'r'],
      ],
      Lr: Alt[] = [
        ['L', 'l'],
        ['SS', 'r'],
      ],
      S: Alt[] = [['S', 's']];
    return [X, Lr, S, Lr, X, Lr, S, Lr, X, Lr, S, [['X', 'e']]];
  })(),
  senarius: (() => {
    const X: Alt[] = [
        ['L', 'x'],
        ['S', 'x'],
        ['SS', 'r'],
      ],
      Lr: Alt[] = [
        ['L', 'l'],
        ['SS', 'r'],
      ];
    return [X, Lr, X, Lr, X, Lr, X, Lr, X, Lr, [['S', 's']], [['X', 'e']]];
  })(),
  hendecasyllable: [
    [
      ['L', 'x'],
      ['S', 'x'],
    ],
    [
      ['L', 'x'],
      ['S', 'x'],
    ],
    [['L', 'l']],
    [['S', 's']],
    [['S', 's']],
    [['L', 'l']],
    [['S', 's']],
    [['L', 'l']],
    [['S', 's']],
    [['L', 'l']],
    [['X', 'e']],
  ],
  sapphic: [
    [['L', 'l']],
    [['S', 's']],
    [['L', 'l']],
    [
      ['L', 'x'],
      ['S', 'x'],
    ],
    [['L', 'l']],
    [['S', 's']],
    [['S', 's']],
    [['L', 'l']],
    [['S', 's']],
    [['L', 'l']],
    [['X', 'e']],
  ],
};
/** every scansion of a line: [{q (L/S string), feet (D/S for dactylic metres), cost, notes, caesurae, elements}] best first */
/** a reading of a line: its quantities (q), feet, cost, notes, caesurae, syllables and elements (el: [quantities, label]) */
interface Reading {
  readonly q: string;
  readonly feet: string;
  readonly cost: number;
  readonly notes: string[];
  readonly caesurae: string[];
  readonly syl: Syl[];
  readonly el: Alt[];
}
interface Scan {
  readonly readings: Reading[];
  readonly base: LineSyllables;
}
function scan(line: string, lang: Lang | undefined, pattern: string | undefined, opts: Metre, codes: string[]): Scan {
  const base = lineSyllables(line, lang, opts);
  const T = TEMPLATES[pattern as string];
  if (!T) return { readings: [], base };
  const out = new Map<string, { q: string; el: Alt[]; cost: number; syl: Syl[]; notes: string[] }>();
  let tries = 0;
  const k = Math.min(base.cand.length, 6);
  for (let mask = 0; mask < 1 << k; mask++) {
    // apply the synizesis candidates of this mask: two vowels → one long syllable
    const syl: Syl[] = [];
    const used: string[] = [];
    for (let i = 0; i < base.syl.length; i++) {
      const ci = base.cand.indexOf(i);
      if (ci >= 0 && ci < k && (mask >> ci) & 1) {
        const a = base.syl[i]!,
          b = base.syl[i + 1]!;
        syl.push(Object.assign({}, b, { q: ['L'], s: a.s + b.s, w: (a.w || a.s) + (b.w || b.s), why: 'synizesis', wordEnd: b.wordEnd }));
        used.push('synizesis');
        i++;
      } else syl.push(base.syl[i]!);
    }
    const n = syl.length,
      path: Alt[] = [];
    const rec = (ei: number, si: number, cost: number) => {
      if (++tries > 200000) return;
      if (ei === T.length) {
        if (si === n) {
          const q = path.map(p => p[0]).join('');
          const key = q + '|' + path.map(p => p[1]).join('');
          const c = cost + used.length;
          const prev = out.get(key);
          if (!prev || prev.cost > c) out.set(key, { q, el: path.map(p => p.slice() as Alt), cost: c, syl, notes: used.slice() });
        }
        return;
      }
      for (const [alt, lab] of T[ei]!) {
        if (si + alt.length > n) continue;
        let ok = true,
          c = cost;
        const qq: string[] = [];
        for (let t = 0; t < alt.length; t++) {
          const s = syl[si + t]!,
            want = alt[t]!;
          const final = si + t === n - 1;
          if (want === 'X' || (final && ei === T.length - 1)) {
            qq.push(s.q.length === 1 ? s.q[0]! : want === 'X' ? 'X' : want);
            continue;
          }
          if (!s.q.includes(want)) {
            ok = false;
            break;
          }
          if (s.why === 'correption' && want === 'S') c += 1;
          if (s.why === 'mcl' && ((opts.mcl === 'short' && want === 'L') || (opts.mcl === 'long' && want === 'S'))) c += 1;
          qq.push(want);
        }
        if (!ok) continue;
        path.push([qq.join(''), lab]);
        rec(ei + 1, si + alt.length, c);
        path.pop();
      }
    };
    rec(0, 0, 0);
  }
  if (tries > 200000) codes.push('too_ambiguous');
  const readings = [...out.values()]
    .map(r => {
      const feet =
        pattern === 'hexameter' || pattern === 'pentameter'
          ? r.el
              .filter(e => e[1] === 'D' || e[1] === 'S')
              .map(e => e[1])
              .join('')
          : '';
      const starts: number[] = [];
      let p = 0;
      for (const e of r.el) {
        starts.push(p);
        p += e[0].length;
      }
      const ends = new Set<number>();
      r.syl.forEach((s, i) => {
        if (s.wordEnd) ends.add(i + 1);
      }); // a word ends after syllable i (1-based count)
      const cz: string[] = [];
      if (pattern === 'hexameter') {
        const f = (i: number) => starts[i]!;
        if (ends.has(f(2) + 1)) cz.push('penthemimeral');
        if (r.el[2]![1] === 'D' && ends.has(f(2) + 2) && !ends.has(f(2) + 1)) cz.push('trochaic');
        if (ends.has(f(1) + 1)) cz.push('trithemimeral');
        if (ends.has(f(3) + 1)) cz.push('hephthemimeral');
        if (ends.has(f(4))) cz.push('bucolic');
      }
      if (pattern === 'pentameter' && ends.has(starts[3]!)) cz.push('diaeresis');
      let cost = r.cost;
      if (pattern === 'hexameter' && r.el[4]![1] === 'S') {
        r.notes.push('spondeiazon');
        cost += 1;
      } // a rare licence (≈ 5 % of Homer's lines; a few dozen lines in the whole Aeneid)
      const reading: Reading = { q: r.q.replace(/X/g, 'L'), feet, cost, notes: r.notes, caesurae: cz, syl: r.syl, el: r.el };
      return reading;
    })
    .sort((a, b) => a.cost - b.cost || (a.feet < b.feet ? -1 : a.feet > b.feet ? 1 : 0) || (a.q < b.q ? -1 : 1));
  const max = opts.max || 64;
  if (readings.length > max) codes.push('readings_cut');
  if (!readings.length) codes.push('no_scansion');
  return { readings: readings.slice(0, max), base };
}

/* ---------- English metre: stress, a simplified stress-maximum rule (Kiparsky 1975; Hanson & Kiparsky 1996) ---------- */
const EN_FUNC = new Set(
  'a an the and but or nor for so yet of to in on at by with from up as if than that this these those is am are was were be been being do does did have has had shall will would should can could may might must i me my mine we us our you your thou thee thy thine he him his she her it its they them their who whom whose which what when where while not no all too more most such than then there here o oh'.split(
    ' ',
  ),
);
const EN_STRESS: Readonly<Record<string, string>> = {
  compare: '01',
  summer: '10',
  summers: '10',
  lovely: '10',
  temperate: '100',
  darling: '10',
  winds: '1',
  complexion: '010',
  often: '10',
  every: '10',
  sometime: '10',
  declines: '01',
  nature: '10',
  natures: '10',
  changing: '10',
  untrimmed: '01',
  eternal: '010',
  possession: '010',
  wander: '10',
  wanderst: '10',
  breathe: '1',
  alone: '01',
  against: '01',
  beyond: '01',
  between: '01',
  upon: '01',
  below: '01',
  away: '01',
  about: '01',
  again: '01',
  remember: '010',
  forget: '01',
  beauty: '10',
  heaven: '10',
  heavens: '10',
  morning: '10',
  evening: '10',
  river: '10',
  mistress: '10',
  delight: '01',
  desire: '01',
  return: '01',
  begin: '01',
  behold: '01',
  divine: '01',
  despair: '01',
  perfect: '10',
  even: '10',
  only: '10',
  ever: '10',
  never: '10',
  over: '10',
  under: '10',
  into: '10',
  unto: '10',
  happy: '10',
  tomorrow: '010',
  yesterday: '100',
  beautiful: '100',
  poetry: '100',
  amazing: '010',
  within: '01',
  without: '01',
  because: '01',
  before: '01',
  behind: '01',
  among: '01',
  beneath: '01',
  myself: '01',
  himself: '01',
  herself: '01',
  itself: '01',
  machine: '01',
  today: '01',
  tonight: '01',
};
function enStress(w0: string, lex: ReadonlyMap<string, string>, codes: Set<string>): string {
  const w = w0
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z]/g, '');
  if (!w) return '';
  if (lex.has(w)) return lex.get(w)!;
  if (EN_STRESS[w]) return EN_STRESS[w];
  const n = sylEn(w);
  if (n === 1) return EN_FUNC.has(w) ? 'u' : 'm'; // u: a weak monosyllable, m: a stressable one (either position)
  codes.add('stress_guess');
  if (/(tion|sion|cian|tial|cial|ious)$/.test(w)) return '0'.repeat(n - 2) + '10';
  if (/(ity|ical|ogy|ify)$/.test(w) && n >= 3) return '0'.repeat(n - 3) + '100';
  if (n === 2)
    return /^(a|be|de|re|con|com|ex|in|un|dis|mis|pre|pro|for|en|em)/.test(w) && !/(ing|er|ed|ly|y|ow|le|en|est|ful|ness)$/.test(w)
      ? '01'
      : '10';
  return '1' + '0'.repeat(n - 1);
}
const EN_TEMPLATES: Readonly<Record<string, string>> = { iambic5: 'ws'.repeat(5), iambic4: 'ws'.repeat(4), trochaic4: 'sw'.repeat(4) };
/** the best fit of a line to an English template: {violations (hard), cost, syllables, marks, variant} */
/** a syllable of an English line: its stress (0, 1, 2; u a weak, m a stressable monosyllable) and whether its word has more */
interface EnSyl {
  readonly c: string;
  readonly poly: boolean;
}
interface EnFit {
  readonly best: { readonly name: string; readonly hard: number; readonly cost: number; readonly t: string } | null;
  readonly syllables: number;
  readonly sy: EnSyl[];
  readonly codes: string[];
}
function enFit(line: string, pattern: string | undefined, lex: ReadonlyMap<string, string>): EnFit {
  const codes = new Set<string>();
  const ws =
    line
      .normalize('NFC')
      .replace(APOS, '’')
      .match(/[\p{L}’]+/gu) || [];
  const sy: EnSyl[] = [];
  for (const w of ws) {
    const p = enStress(w, lex, codes),
      poly = p.length > 1;
    for (const ch of p) sy.push({ c: ch, poly });
  }
  const base = EN_TEMPLATES[pattern as string]!,
    variants: Array<{ name: string; hard: number; cost: number; t: string }> = [];
  const tmpl: Array<[string, string]> = [['', base]];
  if (pattern !== 'trochaic4')
    tmpl.push(
      ['inversion', 'sw' + base.slice(2)],
      ['feminine', base + 'w'],
      ['inversion+feminine', 'sw' + base.slice(2) + 'w'],
      ['headless', base.slice(1)],
    );
  else tmpl.push(['catalectic', base.slice(0, -1)]);
  for (const [name, t] of tmpl) {
    if (t.length !== sy.length) continue;
    let hard = 0,
      soft = 0;
    for (let i = 0; i < t.length; i++) {
      const s = sy[i]!,
        pos = t[i];
      if (pos === 'w' && s.c === '1' && s.poly) {
        // a lexical stress of a word of 2+ syllables in a weak position: a stress maximum, unless next to another stress
        const nb = [sy[i - 1], sy[i + 1]].some(x => x && (x.c === '1' || x.c === 'm'));
        if (nb) soft += 1;
        else hard += 1;
      }
      if (pos === 's' && s.c === 'u') soft += 0.5;
      if (pos === 's' && s.c === '0') soft += 0.5;
      if (pos === 'w' && s.c === 'm') soft += 0.25;
      if (pos === 'w' && s.c === '2') soft += 0.25;
    }
    variants.push({ name, hard, cost: hard * 10 + soft + (name ? 0.5 : 0), t });
  }
  variants.sort((a, b) => a.cost - b.cost);
  return { best: variants[0] || null, syllables: sy.length, sy, codes: [...codes] };
}
/** the rhyme key of a line's last word (orthographic: from the last vowel group of the stem, a silent e and -s / -ed / ’d dropped) */
function rhymeKey(line: string): string {
  const ws =
    line
      .normalize('NFC')
      .replace(APOS, '’')
      .toLowerCase()
      .match(/[\p{L}’]+/gu) || [];
  if (!ws.length) return '';
  let w = ws[ws.length - 1]!.replace(/’(d|st|s)$/, (_m0, x: string) => (x === 'd' ? 'd' : x === 'st' ? 'st' : '')).replace(/’/g, '');
  if (/[^aeiouy]ed$/.test(w) && w.length > 4) w = w.slice(0, -2);
  w = w.replace(/([^s])s$/, '$1');
  if (/[^aeiouy]e$/.test(w) && w.length > 2 && /[aeiouy]/.test(w.slice(0, -2))) w = w.slice(0, -1);
  w = w.normalize('NFD').replace(/\p{M}/gu, '');
  const m = /([aeiouy]+[w]?)([^aeiouy]*)$/.exec(w);
  return m ? m[1]! + m[2]! : w;
}

/* ---------- run ---------- */
/** what a spec's runs share: its compiled expressions, the tokens of its texts and the scansions of its lines */
interface Prepared {
  readonly cache: Map<string, (env: Inputs) => number>;
  readonly toks: Map<string, RunTokens>;
  readonly scans: Map<string, Scan & { readonly codes: string[] }>;
}
interface RunResult {
  readonly out: Rec;
  readonly codes: Array<{ id: string; code: string }>;
}
/** an output while it is computed: its line rounded to an integer */
type Output = Omit<TextOutput, 'line'> & { readonly line?: number };
function prepare(): Prepared {
  return { cache: new Map(), toks: new Map(), scans: new Map() };
}
function run(spec: Spec, env: Inputs, opts?: { readonly prepared?: Prepared | null }): RunResult {
  const prep = (opts && opts.prepared) || prepare(),
    cache = prep.cache;
  const ev = <D extends number | undefined>(v: NumX | null | undefined, d: D): number | D => {
    if (v === undefined || v === null) return d;
    if (typeof v === 'number') return v;
    let f = cache.get(v);
    if (!f) {
      f = C.cx(v);
      cache.set(v, f);
    }
    return f(env);
  };
  // the spec passed checkSpec: its model and outputs have the shapes of TextModel and TextOutput, and model.texts has at least one text
  const m = (spec.model || {}) as TextModel,
    N = m.normalize || {},
    codes: Array<{ id: string; code: string }> = [],
    code = (id: string, c: string) => codes.push({ id, code: c });
  const texts = m.texts || [],
    tById = (id: unknown) => (texts.find(t => t.id === id) || texts[0])!;
  const lex = new Map((m.lexicon || []).map((x): [string, string] => [x.w.toLowerCase(), x.p]));
  const tok = (t: TextDoc, id: string) => {
    let r = prep.toks.get(t.id);
    if (!r) {
      const cs: string[] = [];
      const b = tokenize(t, N, cs),
        ws = b.toks.map(x => x.w);
      r = { ...b, ws, cm: counts(ws), codes: cs };
      prep.toks.set(t.id, r);
    }
    for (const c of r.codes) code(id, c);
    return r;
  };
  const lines = (t: TextDoc) =>
    (t.body || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => /\p{L}/u.test(s));
  const metre: Metre = m.metre || {},
    mlang = metre.lang || (texts[0] && texts[0].lang) || 'la';
  const patternOf = (ln: number) => (metre.pattern === 'elegiac' ? (ln % 2 ? 'hexameter' : 'pentameter') : metre.pattern);
  const scanLine = (t: TextDoc, ln: number, id: string) => {
    const L = lines(t);
    if (!(ln >= 1 && ln <= L.length)) {
      code(id, 'no_line');
      return null;
    }
    const key = `${t.id}:${ln}`;
    let r = prep.scans.get(key);
    if (!r) {
      const cs: string[] = [];
      r = { ...scan(L[ln - 1]!, mlang === 'en' ? 'la' : mlang, patternOf(ln), metre, cs), codes: cs };
      prep.scans.set(key, r);
    }
    for (const c of r.codes) code(id, c);
    return r;
  };
  const out: Rec = {};
  for (const o of (spec.outputs || []) as readonly TextOutput[]) {
    try {
      out[o.id] = one(o);
    } catch {
      out[o.id] = o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN;
      code(o.id, 'error');
    }
  }
  function one(o0: TextOutput) {
    const o = (o0.line !== undefined ? Object.assign({}, o0, { line: Math.round(ev(o0.line, NaN)) }) : o0) as Output;
    const of = o.of,
      S = o.kind === 'scalar',
      t = tById(o.text);
    if (S) {
      if (
        [
          'tokens',
          'types',
          'ttr',
          'hapax',
          'dis',
          'sentences',
          'chars',
          'meanWordLen',
          'yuleK',
          'herdanC',
          'guiraudR',
          'simpsonD',
          'honoreR',
          'mattr',
          'mtld',
          'hdd',
          'freq',
          'zipf',
          'heaps',
        ].includes(of)
      ) {
        const r = tok(t, o.id),
          ws = r.ws,
          Nn = ws.length,
          V = r.cm.size;
        if (!Nn && !['tokens', 'types', 'hapax', 'dis', 'sentences', 'chars', 'freq'].includes(of)) {
          code(o.id, 'empty');
          return NaN;
        }
        switch (of) {
          case 'tokens':
            if (!Nn) code(o.id, 'empty');
            return Nn;
          case 'types':
            return V;
          case 'ttr':
            return V / Nn;
          case 'hapax':
            return [...r.cm.values()].filter(f => f === 1).length;
          case 'dis':
            return [...r.cm.values()].filter(f => f === 2).length;
          case 'sentences':
            return r.sentences;
          case 'chars':
            return graphemes(r.norm.replace(/\s+/g, ''));
          case 'meanWordLen':
            return r.toks.reduce((a, x) => a + graphemes(x.s), 0) / Nn;
          case 'yuleK':
            return yuleK(r.cm, Nn);
          case 'herdanC':
            if (Nn < 2) {
              code(o.id, 'too_short');
              return NaN;
            }
            return Math.log(V) / Math.log(Nn);
          case 'guiraudR':
            return V / Math.sqrt(Nn);
          case 'simpsonD':
            if (Nn < 2) {
              code(o.id, 'too_short');
              return NaN;
            }
            return simpsonD(r.cm, Nn);
          case 'honoreR': {
            const v = honoreR(r.cm, Nn);
            if (!isNum(v)) code(o.id, 'all_hapax');
            return v;
          }
          case 'mattr': {
            const cs: string[] = [];
            const v = mattr(ws, ev(o.window, 50), cs);
            cs.forEach(c => code(o.id, c));
            return v;
          }
          case 'mtld':
            if (Nn < 2) {
              code(o.id, 'too_short');
              return NaN;
            }
            if (Nn < 100) code(o.id, 'short_text');
            return mtld(ws, ev(o.threshold, 0.72));
          case 'hdd': {
            const s = ev(o.sample, 42);
            if (Nn < s) {
              code(o.id, 'too_short');
              return NaN;
            }
            return hdd(r.cm, Nn, s);
          }
          case 'freq': {
            const w = foldWord(normalizeText(o.word, N), N);
            const f = r.cm.get(w) || 0;
            const per = ev(o.per, undefined);
            return per ? (Nn ? (f / Nn) * per : NaN) : f;
          }
          case 'zipf': {
            const cs: string[] = [];
            const v = zipf(r.cm, o.fit || 'ols', ev(o.rmin, 1), ev(o.rmax, undefined), cs, ev(o.xmin, 1));
            cs.forEach(c => code(o.id, c));
            return v;
          }
          case 'heaps': {
            const cs: string[] = [];
            const h = heaps(ws, cs);
            cs.forEach(c => code(o.id, c));
            return o.what === 'K' ? h.K : h.beta;
          }
        }
      }
      if (of === 'assoc') {
        const cs: string[] = [];
        let v;
        if (o.o11 !== undefined && o.r1 !== undefined) v = assoc(ev(o.o11, NaN), ev(o.r1, NaN), ev(o.c1, NaN), ev(o.n, NaN), o.measure, cs);
        else {
          const r = tok(t, o.id),
            f = (w: string | undefined) => foldWord(normalizeText(w, N), N),
            a = f(o.w1),
            b = f(o.w2);
          v = assoc(pairCount(r.ws, a, b, o.span || 1), r.cm.get(a) || 0, r.cm.get(b) || 0, r.ws.length, o.measure, cs);
        }
        cs.forEach(c => code(o.id, c));
        return v;
      }
      if (of === 'keyness') {
        const A = tok(tById(o.text), o.id),
          B = tok(tById(o.ref), o.id),
          w = foldWord(normalizeText(o.word, N), N);
        const a = A.cm.get(w) || 0,
          b = B.cm.get(w) || 0,
          na = A.ws.length,
          nb = B.ws.length;
        if (!na || !nb) {
          code(o.id, 'empty');
          return NaN;
        }
        if (o.measure === 'logRatio') return Math.log2((a || 0.5) / na / ((b || 0.5) / nb));
        const cs: string[] = [],
          g = assoc(a, a + b, na, na + nb, 'g2', cs);
        return a / na >= b / nb ? g : -g; // signed G² (Rayson & Garside 2000)
      }
      if (of === 'readability') {
        const r = tok(t, o.id),
          cs: string[] = [];
        const v = readability(r.toks, r.hasEnd ? r.sentences : 0, t.lang || 'en', o.formula!, o.what || 'score', cs);
        cs.forEach(c => code(o.id, c));
        return v;
      }
      if (of === 'delta') {
        const cs: string[] = [],
          lists = texts.map(x => tok(x, o.id).ws),
          { D } = deltaMatrix(lists, ev(o.mfw, 100), o.variant || 'burrows', cs);
        cs.forEach(c => code(o.id, c));
        return D[texts.findIndex(x => x.id === o.a)]![texts.findIndex(x => x.id === o.b)];
      }
      if (of === 'syllables') {
        if (o.line === undefined) {
          const r = tok(t, o.id);
          return r.toks.reduce((a, x) => a + sylOf(x.s, t.lang || 'en'), 0);
        }
        const L = lines(t),
          ln = o.line;
        if (!(ln >= 1 && ln <= L.length)) {
          code(o.id, 'no_line');
          return NaN;
        }
        if ((t.lang || 'en') === 'la' || t.lang === 'grc') {
          // a line in range always scans (scanLine gives null only for a line out of range)
          const r: { readonly readings?: Reading[]; readonly base: LineSyllables } =
            metre.pattern && !EN_TEMPLATES[metre.pattern] ? scanLine(t, ln, o.id)! : { base: lineSyllables(L[ln - 1]!, t.lang, metre) };
          return r.readings && r.readings.length ? r.readings[0]!.syl.length : r.base.syl.length;
        }
        return enFit(L[ln - 1]!, 'iambic5', lex).syllables;
      }
      if (of === 'metreFit') {
        const L = lines(t),
          ln = o.line!;
        if (!(ln >= 1 && ln <= L.length)) {
          code(o.id, 'no_line');
          return NaN;
        }
        const r = enFit(L[ln - 1]!, metre.pattern, lex);
        r.codes.forEach(c => code(o.id, c));
        if (!r.best) {
          code(o.id, 'syllable_count');
          return NaN;
        }
        return r.best.hard;
      }
      if (['scansions', 'foot', 'dactyls', 'caesura'].includes(of)) {
        const r = scanLine(t, o.line!, o.id);
        if (!r) return NaN;
        if (of === 'scansions') return r.readings.length;
        const rd = r.readings[(o.reading || 1) - 1];
        if (!rd) {
          code(o.id, 'no_reading');
          return NaN;
        }
        if (of === 'foot') {
          const n = o.n as number;
          if (!rd.feet || n > rd.feet.length) {
            code(o.id, 'no_feet');
            return NaN;
          }
          return rd.feet[n - 1] === 'D' ? 1 : 0;
        }
        if (of === 'dactyls') return rd.feet ? Array.from(rd.feet).filter(f => f === 'D').length : NaN;
        return rd.caesurae.includes(o.type!) ? 1 : 0;
      }
      if (of === 'rhyme') {
        const L = lines(t),
          a = o.a as number,
          b = o.b as number;
        if (a > L.length || b > L.length) {
          code(o.id, 'no_line');
          return NaN;
        }
        return +(rhymeKey(L[a - 1]!) === rhymeKey(L[b - 1]!) && rhymeKey(L[a - 1]!) !== '');
      }
      if (of === 'scheme') {
        const want = o.scheme!.replace(/\s+/g, '').toUpperCase(),
          L = lines(t).slice((o.from || 1) - 1, (o.from || 1) - 1 + want.length);
        if (L.length !== want.length) {
          code(o.id, 'lines');
          return NaN;
        }
        const ks = L.map(rhymeKey);
        let bad = 0;
        for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if ((want[i] === want[j]) !== (ks[i] === ks[j])) bad++;
        return bad;
      }
      return NaN;
    }
    if (o.kind === 'series') {
      const r = ['lengthAxis'].includes(of) ? null : ['dactylsByLine', 'lineAxis'].includes(of) ? null : tok(t, o.id),
        ws = r ? r.ws : [];
      if (of === 'rankFreq' || of === 'ranks') {
        const fr = ranked(r!.cm).slice(0, o.top || 2000);
        return of === 'ranks' ? fr.map((_, i) => i + 1) : fr.map(e => e[1]);
      }
      if (of === 'heapsV' || of === 'heapsN') {
        const h = heapsCurve(ws);
        return C.thin(of === 'heapsV' ? h.V : h.N, 2000);
      }
      if (['ttrCurve', 'mattrCurve', 'mtldCurve', 'prefixN'].includes(of)) {
        const k = o.steps || 50,
          ns: number[] = [];
        for (let i = 1; i <= k; i++) ns.push(Math.max(1, Math.round((ws.length * i) / k)));
        if (!ws.length) return [];
        if (of === 'prefixN') return ns;
        return ns.map(n => {
          const p = ws.slice(0, n);
          return of === 'ttrCurve' ? ttr(p) : of === 'mattrCurve' ? mattr(p, ev(o.window, 50)) : mtld(p, ev(o.threshold, 0.72));
        });
      }
      if (of === 'wordLengths') {
        const mx = o.max || 15,
          a = new Array<number>(mx).fill(0);
        for (const x of r!.toks) {
          const g = graphemes(x.s);
          a[Math.min(mx, g) - 1]!++;
        }
        return a;
      }
      if (of === 'lengthAxis') return Array.from({ length: o.max || 15 }, (_, i) => i + 1);
      if (of === 'lineAxis')
        return lines(t)
          .map((_, i) => i + 1)
          .slice(0, 2000);
      if (of === 'dactylsByLine')
        return lines(t)
          .slice(0, 200)
          .map((_, i) => {
            const s = scanLine(t, i + 1, o.id);
            const rd = s && s.readings[0];
            return rd && rd.feet ? Array.from(rd.feet).filter(f => f === 'D').length : NaN;
          });
      return [];
    }
    if (o.kind === 'scene') return drawScene(o, t);
    return NaN;
  }
  function drawScene(o: Output, t: TextDoc): SceneOut {
    const clip = (s: string) => s.slice(0, 64);

    if (o.of === 'kwic') {
      const r = tok(t, o.id),
        w = foldWord(normalizeText(o.word, N), N),
        k = (o.window as number | undefined) || 5,
        mx = o.max || 20,
        rows: number[] = [];
      r.toks.forEach((x, i) => {
        if (x.w === w && rows.length < mx) rows.push(i);
      });
      const sc = C.scene([-12, 12, -(rows.length || 1) - 1, 1]);
      rows.forEach((i, row) => {
        const y = -row - 0.5,
          L = r.toks
            .slice(Math.max(0, i - k), i)
            .map(x => x.s)
            .join(' '),
          R = r.toks
            .slice(i + 1, i + 1 + k)
            .map(x => x.s)
            .join(' ');
        sc.txt(-1.2, y, { s: clip(L.length > 64 ? '…' + L.slice(-63) : L), anchor: 'end', c: 'base' });
        sc.txt(0, y, { s: clip(r.toks[i]!.s), c: 'hi' });
        sc.txt(1.2, y, { s: clip(R), anchor: 'start', c: 'base' });
      });
      if (!rows.length) code(o.id, 'not_found');
      return sc.done();
    }
    if (o.of === 'scansion') {
      const r = scanLine(t, Math.round(ev(o.line, NaN)), o.id);
      const rd = r && r.readings[(o.reading || 1) - 1];
      const syl = rd ? rd.syl : r ? r.base.syl : [],
        n = syl.length,
        sc = C.scene([-0.8, Math.max(n, 1) - 0.2, -1.6, 1.8]);
      syl.forEach((s, i) => {
        const q = rd ? rd.q[i] : s.q.length === 1 ? s.q[0]! : '?';
        sc.txt(i, 0, { s: clip(s.w || s.s), c: 'base' });
        sc.txt(i, 0.9, { s: q === 'L' ? '–' : q === 'S' ? '⏑' : '×', c: s.why ? 'warn' : 'hi' });
      });
      if (rd) {
        let p = 0;
        for (const e of rd.el) {
          p += e[0].length;
          if (p < n) sc.seg(p - 0.5, -0.6, p - 0.5, 1.4, { c: 'muted', dash: true });
        }
        const st: number[] = [];
        let q = 0;
        for (const e of rd.el) {
          st.push(q);
          q += e[0].length;
        }
        for (const cz of rd.caesurae) {
          const at = (
            {
              penthemimeral: st[2]! + 1,
              trochaic: st[2]! + 2,
              trithemimeral: st[1]! + 1,
              hephthemimeral: st[3]! + 1,
              bucolic: st[4],
              diaeresis: st[3],
            } as Readonly<Record<string, number | undefined>>
          )[cz];
          if (isNum(at)) sc.txt(at - 0.5, -1.1, { s: '‖', c: 'ok' });
        }
        if (rd.feet)
          Array.from(rd.feet).forEach((f, i) => {
            sc.txt(st[i]! + (rd.el[i]![0].length - 1) / 2, 1.5, { s: f, c: 'info' });
          });
      }
      return sc.done();
    }
    if (o.of === 'topWords') {
      const r = tok(t, o.id),
        fr = ranked(r.cm).slice(0, o.top || 15),
        mx = fr.length ? fr[0]![1] : 1,
        sc = C.scene([-3, 10.5, -fr.length - 0.5, 0.5]);
      fr.forEach(([w, f], i) => {
        const y = -i - 0.5,
          x = (10 * f) / mx;
        sc.poly([0, y - 0.35, x, y - 0.35, x, y + 0.35, 0, y + 0.35], { c: i < 3 ? 'hi' : 'info', fill: true });
        sc.txt(-0.2, y - 0.1, { s: clip(w), anchor: 'end' });
        sc.txt(x + 0.2, y - 0.1, { v: f, anchor: 'start', c: 'muted' });
      });
      return sc.done();
    }
    if (o.of === 'deltaMap') {
      const cs: string[] = [],
        lists = texts.map(x => tok(x, o.id).ws),
        { D } = deltaMatrix(lists, ev(o.mfw, 100), o.variant || 'burrows', cs);
      cs.forEach(c => code(o.id, c));
      const k = texts.length,
        flat = D.flat()
          .filter((v, i) => i % (k + 1) !== 0 && isNum(v))
          .sort((a, b) => a - b),
        q1 = flat[Math.floor(flat.length / 3)]!,
        q2 = flat[Math.floor((2 * flat.length) / 3)]!;
      const sc = C.scene([-3, k + 0.2, -k - 0.2, 3]);
      for (let a = 0; a < k; a++) {
        const ta = texts[a]!;
        sc.txt(-0.2, -a - 0.5, { key: ta.label, s: ta.label ? undefined : clip(ta.id), anchor: 'end' });
        sc.txt(a + 0.5, 0.4, { key: ta.label, s: ta.label ? undefined : clip(ta.id) });
        for (let b = 0; b < k; b++) {
          const v = D[a]![b]!,
            c = a === b ? 'muted' : v <= q1 ? 'ok' : v <= q2 ? 'warn' : 'bad';
          sc.poly([b, -a, b + 1, -a, b + 1, -a - 1, b, -a - 1], { c, fill: true });
          if (a !== b) sc.txt(b + 0.5, -a - 0.6, { v: Math.round(v * 1000) / 1000 });
        }
      }
      return sc.done();
    }
    if (o.of === 'rhymes') {
      const L = lines(t).slice((o.from || 1) - 1, (o.from || 1) + 39),
        keys2: string[] = [],
        letters2: string[] = [];
      for (const l of L) {
        const k = rhymeKey(l);
        let i = keys2.indexOf(k);
        if (i < 0) {
          keys2.push(k);
          i = keys2.length - 1;
        }
        letters2.push(String.fromCharCode(65 + (i % 26)));
      }
      const sc = C.scene([-1, 14, -L.length - 0.5, 0.5]);
      L.forEach((l, i) => {
        const ws = l.match(/[\p{L}’']+/gu) || [''];
        sc.txt(0, -i - 0.5, { s: letters2[i], c: 'hi' });
        sc.txt(1, -i - 0.5, { s: clip(ws[ws.length - 1]!), anchor: 'start' });
      });
      return sc.done();
    }
    return { view: [-1, 1, -1, 1], items: [] };
  }
  return { out, codes };
}

const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
const API = Object.freeze({
  table: { model: TABLE, outputs: OUT }, // the form of the activity author (src/engines/kernel/schema.ts)
  id: ID,
  checkSpec,
  exprs,
  keys,
  run,
  prepare,
  engine: Object.freeze(engine),
  simEngine,
  tokenize,
  normalizeText,
  mattr,
  mtld,
  mtldDir,
  hdd,
  yuleK,
  simpsonD,
  honoreR,
  zipf,
  heaps,
  assoc,
  readability,
  sylEn,
  sylOf,
  deltaMatrix,
  units,
  lineSyllables,
  scan,
  enFit,
  rhymeKey,
});
export default API;
/* i18n-ignore-end */
