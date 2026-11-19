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
/** a term as a pattern: words end where letters end; a trailing * is a stem (inflected languages); plural s/es */
const termRe = (t: string): RegExp | null => {
  const w = t.trim();
  if (!w) return null;
  const stem = w.endsWith('*'),
    core = esc(stem ? w.slice(0, -1) : w).replace(/\s+/g, '\\s+');
  const caps = /^[A-Z0-9][A-Z0-9-]*[A-Z][A-Z0-9-]*$/.test(w);
  const tail = stem ? '\\p{L}*' : caps ? 's?' : '(?:s|es)?';
  return new RegExp(`(?<!${L})${core}${tail}(?!${L})`, caps ? 'u' : 'iu');
};
const unitRe = (u: string): RegExp => new RegExp(`\\d\\s?${PREFIX}${esc(u)}(?![\\p{L}\\p{N}])`, 'u');
const symRe = (x: string): RegExp => new RegExp(`(?<![A-Za-z\\\\])${esc(x)}(?![A-Za-z])`, 'u');
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

const uses = (en: Entry, t: string): boolean => {
  const p = plain(t);
  if (en.re.some(r => r.test(p))) return true;
  if (en.units.some(u => unitRe(u).test(t))) return true;
  const m = mathOf(t);
  return m.length > 0 && en.symbols.some(x => symRe(x).test(m));
};

/** the words a block teaches with (not tables, code or drawings) */
const TEACH = new Set(['p', 'list', 'callout', 'reveal', 'ask', 'terms', 'compare', 'flow']);
const words = (b: Obj): number =>
  TEACH.has(s(b.t))
    ? plain(textOf(b))
        .split(/\s+/)
        .filter(w => /[\p{L}\p{N}]/u.test(w)).length
    : 0;

const blockName = (b: Obj): string => (b.t === 'p' ? 'a paragraph' : `a ${s(b.t)} block`);

/** the lexicon of a chapter: its concepts, its known ones; with the concepts of the other chapters of the pack */
function lexicon(c: GradualContext): Entry[] {
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
  const known = objs(c.map.known).map(x => mk(x, 'known', -1, s(x.from)));
  const other = (chs: readonly Obj[] | null, kind: 'later' | 'earlier'): Entry[] =>
    (chs ?? []).flatMap(ch => objs(obj(ch.map).concepts).map(x => mk(x, kind, -1, s(ch.id))));
  return [...own, ...known, ...other(c.before, 'earlier'), ...other(c.after, 'later')];
}

const rule = (
  check: QualityCheck,
  body: (c: GradualContext, add: (msg: string) => void, chk: QualityCheck) => void,
): Spec<GradualContext> =>
  spec(check.id, c => {
    const out: RuleIssue[] = [];
    body(c, message => out.push({ rule: check.id, at: c.cid, message }), check);
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
    // the theory, block by block: where each concept first appears
    const first = new Map<string, [number, number]>();
    const told = new Set<string>();
    c.sections.forEach((x, si) => {
      const bs: Obj[] = [{ t: 'title', text: x.title, hook: x.hook }, ...objs(x.blocks)];
      bs.forEach((b, bi) => {
        const t = textOf(b);
        for (const en of own) {
          if (!uses(en, t)) continue;
          if (!first.has(en.id)) first.set(en.id, [si, bi]);
          if (en.sec > si && !told.has(en.id + '@' + s(x.id))) {
            told.add(en.id + '@' + s(x.id));
            add(
              `${s(x.id)} (${bi ? blockName(b) : 'its title or hook'}): uses “${en.label}” (${en.id}), which is introduced only in ${en.where}; introduce it first, or move this`,
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
          `${name} (${s(e.section ?? 'the chapter')}): uses ${late.map(en => `“${en.label}” (introduced in ${en.where})`).join(', ')} before it is introduced; move it after that section or rewrite it`,
        );
    }
    // the concepts of a later chapter
    const mine = lex.filter(e => e.kind === 'concept' || e.kind === 'known');
    const covered = (en: Entry): boolean => mine.some(m => m.id === en.id || en.re.some(r => m.re.some(q => q.source === r.source)));
    const later = lex.filter(e => e.kind === 'later' && !covered(e));
    if (later.length) {
      const all = [...c.sections.map(textOf), ...items.map(([, e]) => textOf(e) + '\n' + unitField(e))].join('\n');
      for (const en of later)
        if (uses(en, all))
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
    const symCovered = (u: string): boolean => lex.some(en => en.units.includes(u));
    const all: [string, string][] = [
      ...c.sections.map((x): [string, string] => [s(x.id), objs(x.blocks).map(textOf).join('\n') + '\n' + s(x.title ?? '')]),
      ...c.exercises.map((e): [string, string] => [s(e.id), textOf(e) + '\n' + unitField(e)]),
      ...objs(c.chapter.flashcards).map((e, i): [string, string] => [s(e.id ?? `card ${i + 1}`), textOf(e)]),
    ];
    // terms blocks
    for (const x of c.sections)
      for (const b of objs(x.blocks))
        if (b.t === 'terms')
          for (const it of objs(b.items))
            if (isStr(it.term) && !covers(it.term)) add(`${s(x.id)}: the term “${it.term}” is not in map.concepts or map.known`);
    // units after a number
    const told = new Set<string>();
    for (const u of units) {
      if (symCovered(u.sym)) continue;
      const hit = all.find(([, t]) => unitRe(u.sym).test(t));
      if (hit && !told.has(u.sym)) {
        told.add(u.sym);
        add(
          `${hit[0]}: uses the unit ${u.sym} (${u.name}, ${u.what}), but no concept of map.concepts or map.known lists it in units; introduce ${u.what} and its unit before it is used`,
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
          add(`${where}: the acronym ${a} is not in map.concepts or map.known (expand it where it is introduced)`);
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
        have = bs.reduce((n, b) => n + words(b), 0);
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
