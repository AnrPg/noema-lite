/* noema-lite — Q0, the gradual introduction of concepts (tools/CONTENT_SPEC.md "Q0", docs/PIPELINES.md §4): nothing is used
   before it is taught, every page has one focus and teaches it in depth. The rules read the chapter's concept list
   (map.concepts: what the chapter introduces, and where; map.known: what it may use without introducing it) and check it
   against the text itself, so a concept that is used too early is found even when the author did not mean to use it:
     concept.map         the concept list is there and well formed
     concept.order       no term, unit or symbol of a concept before the section that introduces it (theory, exercises, cards,
                         playbooks), no concept before the concepts it needs, none that a later chapter introduces
     concept.undeclared  every terms-block term, unit after a number and acronym is in the concept list
     theory.focus        one focus per section, at most maxNew new concepts
     theory.depth        enough teaching text per section, a think-first reveal, every new concept defined where it is introduced
   The real case behind it: a first chapter on charge that converted mAh to coulombs and asked about amperes, volts and
   joules in its first section, before current, voltage or energy had been introduced (tests/gradual.js). */
import { spec, type RuleIssue, type Spec } from '../../../contracts/rules/spec.ts';
import type { QualityCheck } from './rules.ts';
import { isObj, isStr, list, obj, objs, s, type Obj } from './util.ts';

/** what the Q0 rules read of a chapter (quality.ts QualityContext has it all) */
export interface GradualContext {
  readonly cid: string;
  readonly chapter: Obj;
  readonly sections: readonly Obj[];
  readonly exercises: readonly Obj[];
  readonly map: Obj;
  /** the pack's chapters before and after this one, when the whole pack is checked (pack.ts); null for one chapter alone */
  readonly before: readonly Obj[] | null;
  readonly after: readonly Obj[] | null;
  /** what earlier Roadmap steps taught (subject.authoring.known: [{id, terms, units, symbols, from: "@<step id>"}]), read as known
      in every chapter — the concept maps of the steps the pack builds on, so their acronyms and terms need no map.known again */
  readonly inherited?: readonly Obj[];
}

/** one entry of the lexicon: a concept of this chapter, a known one, or one of another chapter */
interface Entry {
  readonly id: string;
  readonly label: string;
  readonly kind: 'concept' | 'known' | 'later' | 'earlier';
  readonly sec: number; // concept: the index of the section that introduces it (-1 = not found); else -1
  readonly where: string; // the section or chapter that introduces it, for messages
  readonly re: readonly RegExp[]; // the words (case-insensitive), the capitals (exact)
  readonly units: readonly string[];
  readonly symbols: readonly string[];
  readonly needs: readonly string[];
}

const PREFIX = '[pnµμumkMG]?';
const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const L = '[\\p{L}\\p{N}]';
/** text without its accents and other marks (ά → α, é → e), every character kept in its place: the words are matched on this,
    so an inflection that moves the accent (στιγμιότυπο, στιγμιοτύπων) is the same word */
const fold1 = (ch: string): string => ch.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const fold = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
/** the folded text and, for each of its characters, where it is in the original (to quote the words as written) */
let lastFold: { t: string; f: string; at: number[] } = { t: '', f: '', at: [] };
const folded = (t: string): { f: string; at: number[] } => {
  if (lastFold.t === t) return lastFold;
  let f = '';
  const at: number[] = [];
  let i = 0;
  for (const ch of t) {
    const x = fold1(ch);
    f += x;
    for (let k = 0; k < x.length; k++) at.push(i);
    i += ch.length;
  }
  lastFold = { t, f, at };
  return lastFold;
};
/** the endings of Greek nouns and adjectives (folded): a Greek word of a term matches in every case and number, a multi-word
    term only as the whole phrase (so “δομικό στιγμιότυπο” is not found in a bare “στιγμιότυπα”) */
const GR_END = [
  ...new Set([
    'ος',
    'ου',
    'ο',
    'ε',
    'οι',
    'ων',
    'ους',
    'ον',
    'α',
    'ας',
    'ες',
    'η',
    'ης',
    'ι',
    'ιου',
    'ια',
    'ιων',
    'ιας',
    'ιες',
    'ις',
    'εις',
    'εων',
    'εως',
    'ατα',
    'ατος',
    'ατων',
    'ματα',
    'ματος',
    'ματων',
    'ν',
    'ς',
    'ηδες',
    'αδες',
    'ουδες',
    'ειο',
    'εια',
    'ειου',
    'ειων',
    'υ',
  ]),
].sort((a, b) => b.length - a.length);
const GR_TAIL = `(?:${GR_END.join('|')})?`;
const GREEK = /[\u0370-\u03ff\u1f00-\u1fff]/u;
/** one word of a term as a pattern (folded): a Greek word → its stem and any ending */
const wordRe = (w: string): string => {
  const f = fold(w).toLowerCase();
  if (!GREEK.test(f) || f.length < 4 || /[^\p{L}]/u.test(f)) return esc(fold(w));
  const e = GR_END.find(x => f.endsWith(x) && f.length - x.length >= 3) ?? '';
  return esc(f.slice(0, f.length - e.length)) + GR_TAIL;
};
/** a term as a pattern, read on folded text (fold): words end where letters end; a trailing * is a stem (inflected languages);
    each Greek word in all its forms; plural s/es */
const termRe = (t: string): RegExp | null => {
  const w = t.trim();
  if (!w) return null;
  const stem = w.endsWith('*'),
    words = (stem ? w.slice(0, -1) : w).split(/\s+/);
  const caps = /^[A-Z0-9][A-Z0-9-]*[A-Z][A-Z0-9-]*$/.test(w);
  const last = words.length - 1,
    lastGreek = !stem && GREEK.test(words[last] ?? '');
  const core = words.map((x, i) => (i === last && stem ? esc(fold(x)) : wordRe(x))).join('\\s+');
  const tail = stem ? '\\p{L}*' : caps ? 's?' : lastGreek ? '' : '(?:s|es)?';
  return new RegExp(`(?<!${L})${core}${tail}(?!${L})`, caps ? 'u' : 'iu');
};
/** a unit after a number: the number starts a token (not the 0C of 0x0C, the 2 of R2), the unit ends one and is not a word's
    first letter before a hyphen (4 N-channel, 2 P-type) */
const RE_CACHE = new Map<string, RegExp>();
const cached = (k: string, mk: () => RegExp): RegExp => {
  let r = RE_CACHE.get(k);
  if (!r) RE_CACHE.set(k, (r = mk()));
  return r;
};
const unitRe = (u: string): RegExp =>
  cached('u' + u, () => new RegExp(`(?<![\\p{L}\\p{N}_.])\\d[\\d.,]*\\s{0,3}${PREFIX}${esc(u)}(?![\\p{L}\\p{N}]|-\\p{L})`, 'u'));
const symRe = (x: string): RegExp => cached('s' + x, () => new RegExp(`(?<![A-Za-z\\\\])${esc(x)}(?![A-Za-z])`, 'u'));
const strsOf = (v: unknown): string[] => list(v).filter((x): x is string => isStr(x));

const MATH = /\$\$?([^$]+)\$\$?/g;
const mathOf = (t: string): string => [...t.matchAll(MATH)].map(m => m[1]).join(' ');
/** the text without math and inline code (for words and acronyms) */
const plain = (t: string): string => t.replace(MATH, ' ').replace(/`[^`]*`/g, ' ');

/** the learner text of a value: every string except the keys that hold no text */
const SKIP = new Set([
  'id',
  'section',
  'src',
  'cite',
  'media',
  'lr',
  'think',
  'mode',
  'type',
  'tags',
  'regions',
  'targets',
  'kp',
  'with',
  't',
  'kind',
  'activity',
  'lang',
  'height',
  'ordered',
  'code',
  'answer',
  'tolerance',
  'difficulty',
  'quick',
  'emoji',
]);
function* texts(x: unknown): Generator<string> {
  if (typeof x === 'string') yield x;
  else if (Array.isArray(x)) for (const v of x) yield* texts(v);
  else if (isObj(x)) for (const [k, v] of Object.entries(x)) if (!SKIP.has(k)) yield* texts(v);
}
const textOf = (x: unknown): string => [...texts(x)].join('\n');
/** an exercise's unit field ("mAh", "A·s", "V/m") as text the unit patterns read */
const unitField = (e: Obj): string =>
  isStr(e.unit)
    ? e.unit
        .split(/[·*/\s^()]+/)
        .filter(Boolean)
        .map(u => '1 ' + u)
        .join(' ')
    : '';

/** the text with LaTeX unit wrappers and spacing undone ($2\,\mathrm{mA}$ → 2 mA), for the unit patterns */
const delatex = (t: string): string =>
  t
    .replace(/\\(?:mathrm|text|textrm|rm|mathit|operatorname)\s*\{([^}]*)\}/g, ' $1')
    .replace(/\\[,;:! ]|~/g, ' ')
    .replace(/\$/g, ' ');
/** a table cell that is exactly a declared symbol (symbol tables, unit tables: "I", "Q", "V") */
const cellSym = (en: Entry, b: Obj): boolean =>
  b.t === 'table' &&
  en.symbols.length > 0 &&
  [...list(b.head), ...list(b.rows).flatMap(r => list(r))].some(x => isStr(x) && en.symbols.includes(x.trim()));
/** the words of the text that use the concept (the first one found), or null */
const find = (en: Entry, t: string): string | null => {
  const p = plain(t);
  if (en.re.length) {
    const { f, at } = folded(p);
    for (const r of en.re) {
      const m = r.exec(f);
      if (m) {
        const a = at[m.index] ?? 0,
          b = at[m.index + m[0].length - 1] ?? a;
        return p.slice(a, b + ((p.codePointAt(b) ?? 0) > 0xffff ? 2 : 1));
      }
    }
  }
  const u = delatex(t);
  for (const x of en.units) {
    const m = unitRe(x).exec(u);
    if (m) return m[0].trim();
  }
  const m = mathOf(t);
  if (m) for (const x of en.symbols) if (symRe(x).test(m)) return x;
  return null;
};
const uses = (en: Entry, t: string): boolean => find(en, t) !== null;
/** where in an exercise, card or playbook the concept is used: the field and the words */
const findIn = (en: Entry, e: Obj): string | null => {
  for (const [k, v] of Object.entries(e)) {
    if (SKIP.has(k)) continue;
    const w = k === 'unit' ? find(en, unitField(e)) : find(en, textOf(v));
    if (w) return `${k}: “${w}”`;
  }
  return null;
};

/** the words a block teaches with (not tables, code or drawings) */
const TEACH = new Set(['p', 'list', 'callout', 'reveal', 'ask', 'terms', 'compare', 'flow']);
export const teachingWords = (b: Obj): number =>
  TEACH.has(s(b.t))
    ? plain(textOf(b))
        .split(/\s+/)
        .filter(w => /[\p{L}\p{N}]/u.test(w)).length
    : 0;

const blockName = (b: Obj): string => (b.t === 'p' ? 'a paragraph' : `a ${s(b.t)} block`);

const LEXICON = new WeakMap<GradualContext, Entry[]>();
/** the lexicon of a chapter: its concepts, its known ones; with the concepts of the other chapters of the pack */
function lexicon(c: GradualContext): Entry[] {
  const done = LEXICON.get(c);
  if (done) return done;
  const out = makeLexicon(c);
  LEXICON.set(c, out);
  return out;
}
/** map.mentions: a concept only NAMED (not taught) in a section before the one that introduces it — a later section of this
    chapter, or a later chapter (a forward reference: "…as we will see in ch10"), each with why. Only that section's theory
    may name it; its exercises, cards and every other page still may not use it. → concept id → the sections */
function mentionsOf(c: GradualContext): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of objs(c.map.mentions)) {
    if (!isStr(m.id) || !isStr(m.in) || !isStr(m.why) || m.why.trim().length < 10) continue;
    const set = out.get(m.id) ?? new Set<string>();
    set.add(m.in);
    out.set(m.id, set);
  }
  return out;
}
function makeLexicon(c: GradualContext): Entry[] {
  const secIdx = new Map(c.sections.map((x, i) => [x.id, i]));
  const mk = (x: Obj, kind: Entry['kind'], sec: number, where: string): Entry => ({
    id: s(x.id),
    label: strsOf(x.terms)[0] ?? strsOf(x.units)[0] ?? s(x.id),
    kind,
    sec,
    where,
    re: strsOf(x.terms)
      .map(termRe)
      .filter((r): r is RegExp => r !== null),
    units: strsOf(x.units),
    symbols: strsOf(x.symbols),
    needs: strsOf(x.needs),
  });
  const own = objs(c.map.concepts).map(x => mk(x, 'concept', secIdx.get(x.in) ?? -1, s(x.in)));
  const known = [
    ...objs(c.map.known).map(x => mk(x, 'known', -1, s(x.from))),
    ...(c.inherited ?? []).filter(x => /^@\S+$/.test(s(x.from ?? ''))).map(x => mk(x, 'known', -1, s(x.from))),
  ];
  const other = (chs: readonly Obj[] | null, kind: 'later' | 'earlier'): Entry[] =>
    (chs ?? []).flatMap(ch => objs(obj(ch.map).concepts).map(x => mk(x, kind, -1, s(ch.id))));
  return [...own, ...known, ...other(c.before, 'earlier'), ...other(c.after, 'later')];
}

/** what only looks like a measurement, read the same way in every chapter (limits report 2026-11-22), so no unit pattern
    sees it: a hex number (0x0C), cell-pack notation (3S, 4S2P, 2P), a temperature written without ° (183 C beside "solder",
    "reflow", "temperature"… becomes 183 °C, which a concept of temperature with units ["°C"] still sees), N as a count or a
    variable after a number (5 N times, 2 N + 1) */
const HEX = /(?<![\p{L}\p{N}_])0x[0-9A-Fa-f]+(?![\p{L}\p{N}_])/gu;
const CELLS = /(?<![\p{L}\p{N}_.,])\d+(?:S\d+P|S|P)(?![\p{L}\p{N}_])/gu;
const TEMP_CUE =
  /°|temperat|celsius|fahrenheit|degree|solder|reflow|melt|boil|freez|oven|thermal|thermistor|ambient|junction|overheat|θερμοκρασ|βαθμ|температур|градус|Temperatur|Grad\b|température|degré/iu;
const TEMP = /(?<![\p{L}\p{N}_.])(\d[\d.,]*)\s{0,3}C(?![\p{L}\p{N}°])/gu;
const COUNT_N =
  /(?<![\p{L}\p{N}_.])(\d[\d.,]*)\s{0,3}N(?=\s*(?:[+\-−×*/=·^]|(?:times|items|cells|steps|bits|bytes|samples|points|nodes|elements|iterations|operations|comparisons|cycles|loops|rows|entries)\b))/gu;
const COUNT_N_AFTER = /([+\-−×*/=·^(]\s*\d[\d.,]*)\s{0,3}N(?![\p{L}\p{N}])/gu;
/** one-letter units that are also everyday letters (concept.undeclared reads them only where the unit is named): C a grade or
    a temperature, N a count, A a base of DNA or a grade (10 A), F, H, S; with the unit's name in the pack languages */
const AMBIGUOUS: ReadonlyMap<string, readonly string[]> = new Map([
  ['A', ['ampere', 'amp', 'αμπέρ', 'ампер']],
  ['C', ['coulomb', 'κουλόμπ', 'кулон']],
  ['N', ['newton', 'νιούτον', 'ньютон']],
  ['F', ['farad', 'φαράντ', 'фарад']],
  ['H', ['henry', 'χένρι', 'генри']],
  ['S', ['siemens', 'ζίμενς', 'сименс']],
]);
export const lookAlikes = (t: string): string =>
  t
    .replace(HEX, ' ')
    .replace(CELLS, ' ')
    .split(/(?<=[.!?;:\n])/u)
    .map(x => (TEMP_CUE.test(x) ? x.replace(TEMP, '$1 °C') : x))
    .join('')
    .replace(COUNT_N, '$1·N')
    .replace(COUNT_N_AFTER, '$1·N');

/** map.plainText: words and numbers of the chapter that only look like a unit or an acronym (3S = three cells in series, 183 C
    on a solder datasheet, 0x0C): the Q0 rules read the text without them; and without the look-alikes above, always */
const SCRUBBED = new WeakMap<GradualContext, GradualContext>();
function scrubbed(c: GradualContext): GradualContext {
  const done = SCRUBBED.get(c);
  if (done) return done;
  const out = scrub(c);
  SCRUBBED.set(c, out);
  return out;
}
function scrub(c: GradualContext): GradualContext {
  const words = strsOf(c.map.plainText)
    .map(w => w.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const re = words.length
    ? new RegExp(`(?<![\\p{L}\\p{N}_]|\\d[.,])(?:${words.map(w => esc(w).replace(/\s+/g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
    : null;
  const clean = (x: unknown, key = ''): unknown =>
    typeof x === 'string'
      ? key === 'id' || key === 'section' || key === 'in'
        ? x
        : lookAlikes(re ? x.replace(re, ' ') : x)
      : Array.isArray(x)
        ? x.map(v => clean(v, key))
        : isObj(x)
          ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clean(v, k)]))
          : x;
  const map = c.map;
  return {
    ...c,
    chapter: { ...(clean(c.chapter) as Obj), map },
    sections: c.sections.map(x => clean(x) as Obj),
    exercises: c.exercises.map(x => clean(x) as Obj),
  };
}

const rule = (
  check: QualityCheck,
  body: (c: GradualContext, add: (msg: string) => void, chk: QualityCheck) => void,
): Spec<GradualContext> =>
  spec(check.id, c => {
    const out: RuleIssue[] = [];
    body(scrubbed(c), message => out.push({ rule: check.id, at: c.cid, message }), check);
    return out;
  });

const hasConcepts = (c: GradualContext): boolean => objs(c.map.concepts).length > 0;

/** concept.map: the list is there and well formed */
export const conceptMap = (chk: QualityCheck): Spec<GradualContext> =>
  rule(chk, (c, add) => {
    const cs = objs(c.map.concepts),
      ks = objs(c.map.known);
    if (!cs.length) {
      add(
        'no concept list: map.concepts names every concept the chapter introduces (terms, in = its section, def, needs) and map.known every concept it uses without introducing it (from: chNN, @<step id> or everyday)',
      );
      return;
    }
    const secs = new Set(c.sections.map(x => x.id));
    const ids = new Set<string>();
    for (const x of [...cs, ...ks]) {
      const id = s(x.id ?? '');
      if (!isStr(x.id) || ids.has(id)) add(`concept id ${JSON.stringify(x.id ?? null)} missing or repeated`);
      ids.add(id);
      if (!strsOf(x.terms).length && !strsOf(x.units).length && !strsOf(x.symbols).length)
        add(`${id}: needs its terms (the words the learner meets), units or symbols`);
    }
    for (const x of cs) {
      if (!secs.has(x.in)) add(`${s(x.id)}: in ${JSON.stringify(x.in ?? null)} is not a section of the chapter`);
      if (!isStr(x.def) || x.def.trim().length < 20) add(`${s(x.id)}: def gives its definition (one or two sentences)`);
    }
    // a need may be a concept of this chapter, a known one, or one of another chapter of the pack (concept.order checks
    // that it comes earlier)
    const others = new Set([...(c.before ?? []), ...(c.after ?? [])].flatMap(ch => objs(obj(ch.map).concepts).map(x => s(x.id))));
    for (const x of cs)
      for (const n of strsOf(x.needs))
        if (!ids.has(n) && !others.has(n)) add(`${s(x.id)}: needs ${JSON.stringify(n)}, which is neither a concept nor a known one`);
    // map.mentions: a later concept only named in a section, with why — never one the section defines (that is introducing it)
    const ownIn = new Map(cs.map(x => [s(x.id), s(x.in)]));
    const secOrder = new Map(c.sections.map((x, i) => [x.id, i]));
    const laterIds = new Set((c.after ?? []).flatMap(ch => objs(obj(ch.map).concepts).map(x => s(x.id))));
    const lex = lexicon(c);
    objs(c.map.mentions).forEach((m, i) => {
      const at = `map.mentions[${i}]`,
        id = s(m.id ?? '');
      if (!isStr(m.id) || !isStr(m.in) || !secs.has(m.in)) {
        add(
          `${at}: { id: a concept introduced later, in: the section that only names it, why } — ${JSON.stringify(m.in ?? null)} is not a section of the chapter`,
        );
        return;
      }
      if (!isStr(m.why) || m.why.trim().length < 10) add(`${at} (${id}): why — one line on why it is only named here and taught later`);
      const mine = ownIn.get(id);
      if (mine !== undefined) {
        if ((secOrder.get(mine) ?? -1) <= (secOrder.get(m.in) ?? -1))
          add(`${at} (${id}): ${s(m.in)} is not before ${mine}, where it is introduced — a mention is only for a concept taught later`);
      } else if (!laterIds.has(id)) add(`${at}: ${JSON.stringify(id)} is not a concept of this chapter or of a later one`);
      const en = lex.find(e => e.id === id && (e.kind === 'concept' || e.kind === 'later'));
      const sec = c.sections.find(x => x.id === m.in);
      if (en && sec) {
        const bs = objs(sec.blocks),
          bold = [
            ...bs
              .map(textOf)
              .join('\n')
              .matchAll(/\*\*([^*]+)\*\*/g),
          ]
            .map(x => x[1])
            .join('\n'),
          terms = bs
            .filter(b => b.t === 'terms')
            .flatMap(b => objs(b.items).map(it => s(it.term ?? '')))
            .join('\n');
        if (uses(en, bold) || uses(en, terms))
          add(
            `${at} (${id}): ${s(m.in)} defines “${en.label}” (in bold or a terms block) — that is introducing it, not a mention: move the concept to ${s(m.in)}, or only name it there`,
          );
      }
    });
    const earlier = c.before ? new Set(c.before.map(ch => s(ch.id))) : null;
    for (const x of ks) {
      const f = s(x.from ?? '');
      if (!(f === 'everyday' || /^ch\d+$/.test(f) || /^@\S+$/.test(f)))
        add(`${s(x.id)}: from must be 'chNN' (an earlier chapter), '@<step id>' (an earlier Roadmap step) or 'everyday'`);
      else if (earlier && /^ch\d+$/.test(f) && !earlier.has(f)) add(`${s(x.id)}: from ${f}, which is not an earlier chapter of this pack`);
    }
  });

/** concept.order: nothing before it is introduced */
export const conceptOrder = (chk: QualityCheck): Spec<GradualContext> =>
  rule(chk, (c, add) => {
    if (!hasConcepts(c)) return;
    const lex = lexicon(c);
    const own = lex.filter(e => e.kind === 'concept'),
      byId = new Map(lex.filter(e => e.kind === 'concept' || e.kind === 'known').map(e => [e.id, e]));
    const secIdx = new Map(c.sections.map((x, i) => [x.id, i]));
    const named = mentionsOf(c),
      mentioned = (id: string, sec: unknown): boolean => named.get(id)?.has(s(sec)) === true;
    // the theory, block by block: where each concept first appears
    const first = new Map<string, [number, number]>();
    const told = new Set<string>();
    c.sections.forEach((x, si) => {
      const bs: Obj[] = [{ t: 'title', text: x.title, hook: x.hook }, ...objs(x.blocks)];
      bs.forEach((b, bi) => {
        const t = textOf(b);
        for (const en of own) {
          const w = find(en, t) ?? (cellSym(en, b) ? (en.symbols.find(y => JSON.stringify(b).includes(`"${y}"`)) ?? en.symbols[0]) : null);
          if (w === null) continue;
          if (en.sec > si && mentioned(en.id, x.id)) continue; // only named here (map.mentions): not its first appearance
          if (!first.has(en.id)) first.set(en.id, [si, bi]);
          if (en.sec > si && !told.has(en.id + '@' + s(x.id))) {
            told.add(en.id + '@' + s(x.id));
            add(
              `${s(x.id)} (${bi ? `${blockName(b)}, blocks[${bi - 1}]` : 'its title or hook'}): uses “${en.label}” (${en.id}) — the text says “${w}” — which is introduced only in ${en.where}; introduce it first, or move this`,
            );
          }
        }
      });
    });
    for (const en of own) {
      if (en.sec < 0) continue;
      const f = first.get(en.id);
      if (!f || f[0] > en.sec) add(`${en.id}: the map says ${en.where} introduces it, but that section never names “${en.label}”`);
    }
    // a concept comes after what it needs
    const at = (id: string): [number, number] => {
      const e = byId.get(id);
      if (!e || e.kind === 'known') return [-1, -1];
      const f = first.get(id);
      return f && f[0] >= e.sec ? f : [e.sec, 0];
    };
    for (const en of own)
      for (const n of en.needs) {
        const ahead = lex.find(e => e.kind === 'later' && e.id === n);
        if (ahead && !byId.has(n)) {
          add(`${en.id} (${en.where}) needs ${n} (“${ahead.label}”), which ${ahead.where} introduces later; teach ${n} first`);
          continue;
        }
        const need = byId.get(n);
        if (!need || need.kind === 'known' || en.sec < 0) continue;
        const [ns, nb] = at(n),
          [es, eb] = at(en.id);
        if (ns > es || (ns === es && nb > eb))
          add(`${en.id} (${en.where}) needs ${n} (“${need.label}”), which comes only later (${need.where}); teach ${n} first`);
      }
    // exercises, cards and playbooks: only what their section (or an earlier one) introduced
    const last = c.sections.length - 1;
    const items: [string, Obj][] = [
      ...c.exercises.map((e): [string, Obj] => [s(e.id ?? 'an exercise'), e]),
      ...objs(c.chapter.flashcards).map((e, i): [string, Obj] => [s(e.id ?? `card ${i + 1}`), e]),
      ...objs(c.chapter.pitfalls).map((e, i): [string, Obj] => [`pitfall ${i + 1}`, e]),
      ...objs(c.chapter.debug).map((e, i): [string, Obj] => [s(e.id ?? `playbook ${i + 1}`), e]),
    ];
    for (const [name, e] of items) {
      const si = secIdx.get(e.section) ?? last,
        t = textOf(e) + '\n' + unitField(e);
      const late = own.filter(en => en.sec > si && uses(en, t));
      if (late.length)
        add(
          `${name} (${s(e.section ?? 'the chapter')}): uses ${late.map(en => `“${en.label}” (introduced in ${en.where}; ${findIn(en, e) ?? 'its text'})`).join(', ')} before it is introduced; move it after that section or rewrite it`,
        );
    }
    // the concepts of a later chapter
    const mine = lex.filter(e => e.kind === 'concept' || e.kind === 'known');
    const covered = (en: Entry): boolean => mine.some(m => m.id === en.id || en.re.some(r => m.re.some(q => q.source === r.source)));
    const later = lex.filter(e => e.kind === 'later' && !covered(e));
    if (later.length) {
      const rest = items.map(([, e]) => textOf(e) + '\n' + unitField(e)).join('\n');
      const textFor = (en: Entry): string => [...c.sections.filter(x => !mentioned(en.id, x.id)).map(textOf), rest].join('\n');
      for (const en of later)
        if (uses(en, textFor(en)))
          add(`uses “${en.label}” (${en.id}), which ${en.where} introduces later; introduce it here, or leave it for ${en.where}`);
    }
  });

/** concept.undeclared: what the checker can see by itself is in the list */
export const conceptUndeclared = (chk: QualityCheck): Spec<GradualContext> =>
  rule(chk, (c, add, k) => {
    if (!hasConcepts(c)) return;
    const lex = lexicon(c).filter(e => e.kind !== 'later');
    const covers = (t: string): boolean => lex.some(en => uses(en, t));
    const units = k.units ?? [];
    // a declared unit covers its base symbol with or without an SI prefix (units: ["mAh"] covers 2000 mAh)
    const symCovered = (u: string): boolean => {
      const re = new RegExp(`^${PREFIX}${esc(u)}$`, 'u');
      return lex.some(en => en.units.some(x => re.test(x)));
    };
    const all: [string, string][] = [
      ...c.sections.map((x): [string, string] => [
        s(x.id),
        objs(x.blocks).map(textOf).join('\n') + '\n' + s(x.title ?? '') + '\n' + s(x.hook ?? ''),
      ]),
      ...c.exercises.map((e): [string, string] => [s(e.id), textOf(e) + '\n' + unitField(e)]),
      ...objs(c.chapter.flashcards).map((e, i): [string, string] => [s(e.id ?? `card ${i + 1}`), textOf(e)]),
      ...objs(c.chapter.pitfalls).map((e, i): [string, string] => [`pitfall ${i + 1}`, textOf(e)]),
      ...objs(c.chapter.debug).map((e, i): [string, string] => [s(e.id ?? `playbook ${i + 1}`), textOf(e)]),
    ];
    // terms blocks
    for (const x of c.sections)
      for (const b of objs(x.blocks))
        if (b.t === 'terms')
          for (const it of objs(b.items))
            if (isStr(it.term) && !covers(it.term)) add(`${s(x.id)}: the term “${it.term}” is not in map.concepts or map.known`);
    // units after a number
    const told = new Set<string>();
    // a one-letter unit that is also a letter of everyday text (C a grade or a temperature, N a count, F, H) is read as that unit
    // only in a chapter that names the unit (coulomb, newton…); where a concept declares it, concept.order still sees every use
    const whole = fold(all.map(([, t]) => t).join('\n'));
    const named = (u: { readonly sym: string; readonly name: string }): boolean =>
      [u.name, ...(AMBIGUOUS.get(u.sym) ?? [])].some(n => new RegExp(esc(fold(n)), 'iu').test(whole));
    for (const u of units) {
      if (symCovered(u.sym)) continue;
      if (AMBIGUOUS.has(u.sym) && !named(u)) continue;
      const hit = all.find(([, t]) => unitRe(u.sym).test(delatex(t)));
      if (hit && !told.has(u.sym)) {
        told.add(u.sym);
        add(
          `${hit[0]}: uses the unit ${u.sym} (${u.name}, ${u.what}), but no concept of map.concepts or map.known lists it in units; introduce ${u.what} and its unit before it is used (when “${(unitRe(u.sym).exec(delatex(hit[1]))?.[0] ?? u.sym).trim()}” is not that unit — 3S for three cells in series, a part number —, list it in map.plainText)`,
        );
      }
    }
    // acronyms
    const stop = new Set(k.stop ?? []);
    const unitTok = new RegExp(`^${PREFIX}(?:${units.map(u => esc(u.sym)).join('|')})$`, 'u');
    const seen = new Set<string>();
    for (const [where, t] of all)
      for (const m of plain(t).matchAll(/(?<![\p{L}\p{N}])[A-Z][A-Z0-9]*[A-Z][A-Z0-9]*(?=s?(?![\p{L}\p{N}]))/gu)) {
        const a = m[0];
        if (seen.has(a) || stop.has(a) || /^[IVXLCDM]+$/.test(a) || unitTok.test(a)) continue;
        seen.add(a);
        if (!covers(a) && !lex.some(en => en.symbols.includes(a)))
          add(
            `${where}: the acronym ${a} is not in map.concepts or map.known (expand it where it is introduced; when it is not an acronym — a hex number, a part number —, list it in map.plainText)`,
          );
      }
  });

/** theory.focus: one idea per section */
export const theoryFocus = (chk: QualityCheck): Spec<GradualContext> =>
  rule(chk, (c, add, k) => {
    if (!hasConcepts(c)) return;
    const max = k.maxNew ?? 3;
    for (const x of c.sections) {
      if (!isStr(x.focus)) add(`${s(x.id)}: no focus (section.focus: the one idea this page teaches, in one sentence)`);
      const news = objs(c.map.concepts).filter(e => e.in === x.id);
      if (news.length > max)
        add(
          `${s(x.id)}: introduces ${news.length} new concepts (${news.map(e => s(e.id)).join(', ')}), at most ${max}: split it into more sections, one idea each`,
        );
    }
  });

/** theory.depth: enough teaching on every page */
export const theoryDepth = (chk: QualityCheck): Spec<GradualContext> =>
  rule(chk, (c, add, k) => {
    if (!hasConcepts(c)) return;
    const base = k.minWords ?? 0,
      per = k.perConcept ?? 0;
    const own = lexicon(c).filter(e => e.kind === 'concept');
    for (const x of c.sections) {
      const bs = objs(x.blocks),
        news = own.filter(e => e.where === x.id);
      const need = base + per * Math.max(0, news.length - 1),
        have = bs.reduce((n, b) => n + teachingWords(b), 0);
      if (have < need)
        add(
          `${s(x.id)}: ${have} words of teaching text, needs >= ${need} (${base} + ${per} per new concept after the first): go deeper on its one idea`,
        );
      if (!bs.some(b => b.t === 'reveal')) add(`${s(x.id)}: no reveal block ('think first' before the key point)`);
      const bold = [
        ...bs
          .map(textOf)
          .join('\n')
          .matchAll(/\*\*([^*]+)\*\*/g),
      ]
        .map(m => m[1])
        .join('\n');
      const terms = bs
        .filter(b => b.t === 'terms')
        .flatMap(b => objs(b.items).map(it => s(it.term ?? '')))
        .join('\n');
      for (const en of news)
        if (!uses(en, bold) && !uses(en, terms))
          add(
            `${s(x.id)}: introduces “${en.label}” (${en.id}) without defining it there (a terms block, or the term in bold where it is defined)`,
          );
    }
  });
