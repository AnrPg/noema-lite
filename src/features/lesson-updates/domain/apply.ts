/* noema-lite — applying a lesson update (docs/LESSON_UPDATES.md §3): the ops of the update and of the options picked, on
   copies of the chapter and of its translations, the same way in every language. Pure.

   Places are those of the lesson AS IT IS: "before block 3 of ch02-s04" means the block that is block 3 now, however many
   blocks other ops add before it; new sections go after the section named (a new one included); exercises, cards and
   pitfalls go at the end of their lists. So the result does not depend on the order Claude wrote the ops in. */
import { copy, isObj, list, obj, objs, s, type MutObj, type Obj } from '../../content/domain/util.ts';
import type { AddOp, LessonUpdate, Op, Picks, SectionOp } from './model.ts';

/** a stable text of JSON data (keys sorted), so the same chapter hashes the same wherever it was read */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (isObj(v))
    return (
      '{' +
      Object.keys(v)
        .filter(k => v[k] !== undefined)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v ?? null);
}
/** FNV-1a (two 32-bit lanes) of a text → 16 hex digits: enough to see that a chapter changed */
export function hashText(t: string): string {
  let a = 0x811c9dc5,
    b = 0x01000193 ^ t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
/** the hash of a chapter as the update's base names it */
export const chapterHash = (chapter: unknown): string => hashText(canonical(chapter));

/** the ops that apply with these picks: the update's own, then the option picked of each choice (else its recommended one) */
export function opsFor(u: LessonUpdate, picks: Picks = {}): Op[] {
  const out: Op[] = [...u.ops];
  for (const c of u.choices ?? []) {
    const id = picks[c.id] ?? c.recommended;
    const o = c.options.find(x => x.id === id) ?? c.options.find(x => x.id === c.recommended);
    if (o) out.push(...o.ops);
  }
  return out;
}
/** the picks as they apply: every choice with the option the learner picked, or its recommended one */
export function effectivePicks(u: LessonUpdate, picks: Picks = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of u.choices ?? []) out[c.id] = c.options.some(o => o.id === picks[c.id]) ? (picks[c.id] as string) : c.recommended;
  return out;
}

/** the translated version of an op's content for one locale (null: the source's own text) */
const trOf = <T>(op: { readonly i18n?: Readonly<Record<string, T>> }, loc: string | null, own: T): T =>
  loc === null ? own : (op.i18n?.[loc] ?? own);

/** One chapter (the pack's, or a translation's) with the ops applied. loc: null for the pack's own chapter. */
export function applyToChapter(chapter: Obj, ops: readonly Op[], loc: string | null): MutObj {
  const ch = copy(chapter) as MutObj;
  const sections = objs(ch.sections).map(x => ({ ...x }));
  ch.sections = sections;
  // anchors: each section's blocks as they are now, so "before block n" stays the block it named
  const orig = new Map<string, Obj[]>();
  for (const sc of sections) {
    const bs = objs(sc.blocks).map(b => ({ ...b }));
    sc.blocks = bs;
    orig.set(s(sc.id), [...bs]);
  }
  const secOf = (id: string): MutObj | undefined => sections.find(x => x.id === id);
  // 1. new sections, in the order written (one may follow another new one)
  for (const op of ops.filter((o): o is SectionOp => o.op === 'section')) {
    const t = obj(trOf(op, loc, op.section));
    const sc: MutObj = { ...copy(op.section), ...(loc === null ? {} : pickText(t, ['title', 'hook', 'focus'])) };
    if (loc !== null) sc.blocks = copy(list(t.blocks));
    sc.blocks = objs(sc.blocks).map(b => ({ ...b }));
    const after = op.after === null ? -1 : sections.findIndex(x => x.id === op.after);
    sections.splice(op.after === null ? 0 : after < 0 ? sections.length : after + 1, 0, sc);
    orig.set(s(sc.id), [...objs(sc.blocks)]);
  }
  // 2. blocks and replacements, anchored on the blocks as they were
  for (const op of ops) {
    if (op.op !== 'blocks' && op.op !== 'replace') continue;
    const sc = secOf(op.section);
    if (!sc) continue;
    const bs = sc.blocks as Obj[],
      was = orig.get(op.section) ?? [];
    if (op.op === 'replace') {
      const r = op,
        target = was[r.at];
      const i = target ? bs.indexOf(target) : -1;
      if (i >= 0) bs.splice(i, 1, copy(trOf(r, loc, r.block)));
      continue;
    }
    const b = op;
    const add = list(trOf(b, loc, b.blocks)).map(x => copy(x as Obj));
    const anchor = b.at === undefined ? undefined : was[b.at];
    const i = anchor ? bs.indexOf(anchor) : -1;
    bs.splice(i >= 0 ? i : bs.length, 0, ...add);
  }
  // 3. exercises, cards, pitfalls at the end of their lists; map entries
  for (const op of ops) {
    if (op.op === 'exercises' || op.op === 'flashcards' || op.op === 'pitfalls') {
      const o = op;
      const items = list(trOf(o, loc, o.items)).map((x, i) => {
        const own = o.items[i] ?? {};
        // the source decides what is not words: the id, the section (a placement fix moves it), the level
        return { ...copy(x as Obj), ...pick(own, ['id', 'section', 'level']) };
      });
      ch[o.op] = [...objs(ch[o.op]), ...items];
    } else if (op.op === 'map' && loc === null) {
      const m = op,
        map = { ...obj(ch.map) };
      for (const k of ['concepts', 'points', 'learnables', 'known'] as const)
        if (m[k]?.length) map[k] = [...objs(map[k]), ...copy(m[k] ?? [])];
      ch.map = map;
    }
  }
  return ch;
}
const pick = (o: Obj, keys: readonly string[]): MutObj => {
  const out: MutObj = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
const pickText = (o: Obj, keys: readonly string[]): MutObj => pick(o, keys);

export interface Applied {
  /** the pack with the chapter changed (a copy; version unchanged: the caller names the new one) */
  readonly pack: MutObj;
  /** the chapter's translations, changed the same way, by locale (only those that had the chapter) */
  readonly translations: Readonly<Record<string, MutObj>>;
}
/** The update with these picks on a pack and the chapter's translations (by locale; null: that translation lacks it). */
export function applyUpdate(pack: Obj, trChapters: Readonly<Record<string, Obj | null>>, u: LessonUpdate, picks: Picks = {}): Applied {
  const ops = opsFor(u, picks);
  const p = { ...pack };
  p.chapters = objs(pack.chapters).map(c => (c.id === u.chapter ? applyToChapter(c, ops, null) : c));
  const translations: Record<string, MutObj> = {};
  for (const [loc, c] of Object.entries(trChapters)) if (c) translations[loc] = applyToChapter(c, ops, loc);
  return { pack: p, translations };
}

/** the chapter of a pack (null: none with that id) */
export const chapterOf = (pack: Obj, id: string): Obj | null => objs(pack.chapters).find(c => c.id === id) ?? null;

/** what each add op brings, counted for the review's line ("3 blocks, 6 exercises…") */
export function countOps(ops: readonly Op[]): Record<string, number> {
  const n: Record<string, number> = {};
  const add = (k: string, v: number): void => {
    n[k] = (n[k] ?? 0) + v;
  };
  for (const op of ops) {
    if (op.op === 'section') add('sections', 1);
    else if (op.op === 'blocks') add('blocks', op.blocks.length);
    else if (op.op === 'replace') add('replaced', 1);
    else if (op.op === 'map')
      add('map', (op.concepts?.length ?? 0) + (op.points?.length ?? 0) + (op.learnables?.length ?? 0) + (op.known?.length ?? 0));
    else add(op.op, op.items.length);
  }
  return n;
}
/** is the op an addition (never changes what the lesson has)? */
export const additive = (op: Op): op is AddOp => op.op !== 'replace';
