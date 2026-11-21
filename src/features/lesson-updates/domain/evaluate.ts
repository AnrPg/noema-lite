/* noema-lite — the gate of a lesson update (docs/LESSON_UPDATES.md §4): nothing reaches the learner's lesson unless the
   whole pack, with the addition, passes every check it passed before — the pack's rules (Q0 gradual introduction, one
   focus per section, Q1–Q9, the mix of exercises, the variety of engines), every translation of the chapter and the 文A
   bridges. Pure: the checks come in (the app's NoemaCore.content, the connector's engine).

   What is judged is what the update ADDS: an error the pack already had (an older pack under today's rules) is not the
   update's, so the errors of the pack before and after are compared, position numbers aside (blocks[3] → blocks[#]).

   prepare() is what the connector and a pasted answer run once, before the learner sees anything:
     · the shape (model.ts), every text in every language of the pack;
     · content the lesson already has: refused unless it is a choice of kind "duplicate" (skip / merge / keep as a
       second explanation) — the learner decides;
     · the checks with the recommended options; an addition that brings an error is tried later in the chapter, after
       each following section in turn (a term used before the section that teaches it): the first place where its errors
       go is kept and noted (the review shows it). A short definition cannot keep it where it was: the knowledge map
       says which section introduces a concept (Q0), and the update never moves what the lesson teaches;
     · every other option of every choice, each with the rest recommended: an option that fails is refused.
   verify() is what the app runs again with the learner's picks just before it saves. */
import { isObj, list, obj, objs, s, type MutObj, type Obj } from '../../content/domain/util.ts';
import { applyUpdate, chapterHash, chapterOf } from './apply.ts';
import {
  isItemOp,
  shapeProblems,
  UPDATE_FORMAT,
  type AddOp,
  type BridgeAdds,
  type Choice,
  type LessonUpdate,
  type Note,
  type Op,
  type Picks,
} from './model.ts';

export interface CheckReport {
  readonly errors: readonly string[];
}
/** the checks a lesson update must pass (src/features/content: NoemaCore.content in the app, the connector's engine) */
export interface Checks {
  checkPack(p: unknown, expectId?: unknown, opts?: { readonly requireQuality?: boolean }): CheckReport;
  checkTranslation(t: unknown, pack?: unknown): CheckReport;
  checkBridge(b: unknown, pack?: unknown): CheckReport;
}
/** the lesson as it is: the pack (its own language), its translations as noema-translation files by locale (every chapter),
    and the account's 文A bridges of the pack by pair key */
export interface Base {
  readonly pack: Obj;
  readonly translations: Readonly<Record<string, Obj>>;
  readonly bridges?: Readonly<Record<string, Obj>>;
}
/** the lesson with an update applied (what the app saves) */
export interface Result {
  readonly pack: MutObj;
  readonly translations: Readonly<Record<string, MutObj>>;
  readonly bridges: Readonly<Record<string, MutObj>>;
}

/** an error text without its position numbers: the same problem after blocks were added before it is the same problem */
export const normalize = (e: string): string =>
  e
    .replace(/\[\d+\]/g, '[#]')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, '#')
    .trim();
/** the errors of b that a does not have (as many times as b has more of them) */
export function newErrors(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const e of a) left.set(normalize(e), (left.get(normalize(e)) ?? 0) + 1);
  const out: string[] = [];
  for (const e of b) {
    const k = normalize(e),
      n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    else out.push(e);
  }
  return out;
}

/* ---------- the lesson with the update ---------- */

/** the translated chapters of a base, by locale (null: that translation lacks the chapter) */
export const trChapters = (b: Base, chapter: string): Record<string, Obj | null> =>
  Object.fromEntries(Object.entries(b.translations).map(([loc, f]) => [loc, objs(f.chapters).find(c => c.id === chapter) ?? null]));
/** the languages the pack is translated into, which every added text must come in (those that have the chapter) */
export const localesOf = (b: Base, chapter: string): string[] =>
  Object.entries(trChapters(b, chapter))
    .filter(([, c]) => c)
    .map(([l]) => l)
    .sort();

/** new bridge entries merged into the bridges of the account (an entry whose word is there already is left as it is) */
export function mergeBridges(bridges: Readonly<Record<string, Obj>>, adds: BridgeAdds | undefined): Record<string, MutObj> {
  const out: Record<string, MutObj> = {};
  for (const [pair, b] of Object.entries(bridges)) {
    const extra = adds?.[pair] ?? [];
    if (!extra.length) continue;
    const have = new Set(objs(b.entries).map(e => s(e.k).toLowerCase()));
    const add = extra.filter(e => {
      const k = s(e.k).toLowerCase();
      if (!k || have.has(k)) return false;
      have.add(k);
      return true;
    });
    if (add.length) out[pair] = { ...b, entries: [...objs(b.entries), ...add] };
  }
  return out;
}

export function applyAll(b: Base, u: LessonUpdate, picks: Picks = {}): Result {
  const a = applyUpdate(b.pack, trChapters(b, u.chapter), u, picks);
  const translations: Record<string, MutObj> = {};
  for (const [loc, f] of Object.entries(b.translations)) {
    const c = a.translations[loc];
    translations[loc] = c ? { ...f, chapters: objs(f.chapters).map(x => (x.id === u.chapter ? c : x)) } : { ...f };
  }
  return { pack: a.pack, translations, bridges: mergeBridges(b.bridges ?? {}, u.bridges) };
}

/** every error of a lesson: the pack's, each translation's ([el] …), each bridge's ([bridge ru] …) */
export function errorsOf(
  checks: Checks,
  pack: Obj,
  translations: Readonly<Record<string, Obj>>,
  bridges: Readonly<Record<string, Obj>>,
): string[] {
  const E = [...checks.checkPack(pack, undefined, { requireQuality: true }).errors];
  for (const [loc, f] of Object.entries(translations)) for (const e of checks.checkTranslation(f, pack).errors) E.push(`[${loc}] ${e}`);
  for (const [pair, br] of Object.entries(bridges)) for (const e of checks.checkBridge(br, pack).errors) E.push(`[bridge ${pair}] ${e}`);
  return E;
}

/** A gate of one lesson: the errors it had before, and the new errors of an update with some picks. */
export function gate(checks: Checks, b: Base) {
  const before = errorsOf(checks, b.pack, b.translations, {});
  const bridgesBefore = errorsOf(checks, { subject: obj(b.pack.subject), chapters: [] }, {}, b.bridges ?? {}).filter(e =>
    e.startsWith('[bridge'),
  );
  return {
    before,
    /** the errors the update with these picks brings (none: it may be saved) */
    added(u: LessonUpdate, picks: Picks = {}): string[] {
      const r = applyAll(b, u, picks);
      const after = errorsOf(checks, r.pack, r.translations, {});
      const touched = Object.fromEntries(Object.entries(b.bridges ?? {}).map(([k, v]) => [k, r.bridges[k] ?? v]));
      const bAfter = errorsOf(checks, r.pack, {}, touched).filter(e => e.startsWith('[bridge'));
      return [...newErrors(before, after), ...newErrors(bridgesBefore, bAfter)];
    },
  };
}

/* ---------- content the lesson already has ---------- */

const WORDS = /[\p{L}\p{N}]+/gu;
/** every text inside a block or an item (keys of code, ids and media aside) */
export function textOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) textOf(x, out);
  else if (isObj(v))
    for (const [k, x] of Object.entries(v))
      if (!['id', 'section', 'media', 'code', 't', 'type', 'lang', 'kind', 'level', 'cite', 'src', 'bid'].includes(k)) textOf(x, out);
  return out;
}
const shingles = (t: string, n = 5): Set<string> => {
  const w = (t.toLowerCase().match(WORDS) ?? []).filter(x => x.length > 1);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
};
/** how much of an addition's text is in one block or item of the chapter already (0–1), with the place */
export function overlap(addition: unknown, chapter: Obj): { share: number; at: string } {
  const mine = shingles(textOf(addition).join('\n'));
  if (mine.size < 8) return { share: 0, at: '' }; // a few words: too short to call a repetition
  let best = { share: 0, at: '' };
  const consider = (v: unknown, at: string): void => {
    const theirs = shingles(textOf(v).join('\n'));
    let n = 0;
    for (const x of mine) if (theirs.has(x)) n++;
    const share = n / mine.size;
    if (share > best.share) best = { share, at };
  };
  for (const sc of objs(chapter.sections))
    objs(sc.blocks).forEach((b, i) => {
      consider(b, `${s(sc.id)} block ${String(i)}`);
    });
  for (const k of ['exercises', 'flashcards', 'pitfalls']) for (const x of objs(chapter[k])) consider(x, s(x.id ?? k));
  return best;
}
/** an addition counts as a repetition from this share of its text */
export const DUPLICATE_SHARE = 0.5;

/* ---------- prepare: once, before the learner sees it ---------- */

const ids = (ch: Obj) => ({
  sections: objs(ch.sections).map(x => s(x.id)),
  exercises: [...objs(ch.exercises), ...objs(ch.flashcards)].map(x => s(x.id)),
});
/** the sections an op's content sits in */
const sectionOfOp = (op: Op): string | null =>
  op.op === 'blocks' || op.op === 'replace'
    ? op.section
    : isItemOp(op) && op.op !== 'pitfalls'
      ? s(op.items[0]?.section ?? '') || null
      : null;
/** the same op in another section (blocks: at its end; an exercise or card: its section field) */
function moved(op: AddOp, to: string): AddOp {
  if (op.op === 'blocks') {
    const rest: Record<string, unknown> = { ...op };
    delete rest['at'];
    return { ...(rest as unknown as typeof op), section: to };
  }
  if (isItemOp(op)) return { ...op, items: op.items.map(it => ({ ...it, section: to })) };
  return op;
}
/** an item op of several items → one op each (an error is then the item's, and only that item moves) */
function split(ops: readonly AddOp[]): AddOp[] {
  const out: AddOp[] = [];
  for (const op of ops) {
    if (!isItemOp(op) || op.items.length < 2 || op.op === 'pitfalls') {
      out.push(op);
      continue;
    }
    op.items.forEach((it, i) => {
      const i18n = op.i18n ? Object.fromEntries(Object.entries(op.i18n).map(([l, v]) => [l, [list(v)[i] as Obj]])) : undefined;
      out.push({ op: op.op, items: [it], ...(i18n ? { i18n } : {}), ...(op.why ? { why: op.why } : {}) });
    });
  }
  return out;
}
const withOps = (u: LessonUpdate, ops: readonly AddOp[], choices?: readonly Choice[]): LessonUpdate => ({
  ...u,
  ops,
  ...((choices ?? u.choices) ? { choices: choices ?? u.choices ?? [] } : {}),
});

export interface Prepared {
  /** the update as the learner will review it (with its notes and any placement choice), or null when refused */
  readonly update: LessonUpdate | null;
  /** why it is refused (English, for Claude: all at once) */
  readonly problems: readonly string[];
  /** where the checks moved something, for the answer to Claude */
  readonly fixed: readonly string[];
}

/** what to do about an error, for Claude: a piece is moved where it belongs, never dropped */
function hint(e: string): string {
  const later = /which (ch\d{2}) introduces later/.exec(e)?.[1];
  if (later)
    return ` — this piece belongs in ${later}: move it into a part for chapter ${later} (after the section that introduces what it uses; one part per chapter in "parts"), do not drop it`;
  return /focus|new concepts/i.test(e)
    ? ' — a section already full: put the addition in a new section, or make it a choice of kind "full" (a new section · replace the weaker text)'
    : '';
}

/** The update as it came (JSON) against the lesson as it is → the update the learner reviews, or every problem. */
export function prepare(checks: Checks, b: Base, raw: unknown): Prepared {
  const chapter = isObj(raw) ? s(raw.chapter) : '';
  const ch = chapterOf(b.pack, chapter);
  if (!ch) return { update: null, problems: [`chapter "${chapter}" is not a chapter of the pack`], fixed: [] };
  const sj = obj(b.pack.subject);
  const locales = localesOf(b, chapter);
  const P = shapeProblems(raw, ids(ch), locales);
  if (isObj(raw) && raw.pack !== sj.id) P.push(`pack is "${s(raw.pack)}" but the lesson is in "${s(sj.id)}"`);
  if (P.length) return { update: null, problems: P, fixed: [] };
  const given = raw as LessonUpdate;
  let u: LessonUpdate = {
    ...given,
    format: UPDATE_FORMAT,
    v: 1,
    base: { version: typeof b.pack.version === 'string' ? b.pack.version : null, chapter: chapterHash(ch) },
    ops: split(given.ops),
  };
  delete (u as { notes?: unknown }).notes; // notes are the checks' own, never Claude's
  // 1. a repetition of what the lesson has goes to the learner as a choice of kind "duplicate"
  const dupChoices = new Set((u.choices ?? []).filter(c => c.kind === 'duplicate').map(c => c.id));
  u.ops.forEach((op, i) => {
    if (op.op === 'map') return;
    const o = overlap(op.op === 'section' ? op.section : op.op === 'blocks' ? op.blocks : op.items, ch);
    if (o.share >= DUPLICATE_SHARE)
      P.push(
        `ops[${String(i)}]: ${String(Math.round(o.share * 100))} % of its text is already in the lesson (${o.at}) — make it a choice of kind "duplicate" for the learner, with the options to skip it, merge it into that place ("replace" with the merged text) or keep it as a second explanation; recommend one`,
      );
  });
  for (const c of u.choices ?? [])
    if (!dupChoices.has(c.id))
      for (const o of c.options)
        o.ops.forEach((op, j) => {
          if (op.op === 'map' || op.op === 'replace') return;
          const ov = overlap(op.op === 'section' ? op.section : op.op === 'blocks' ? op.blocks : op.items, ch);
          if (ov.share >= DUPLICATE_SHARE)
            P.push(
              `choice ${c.id}, option ${o.id}, ops[${String(j)}]: ${String(Math.round(ov.share * 100))} % of its text is already in the lesson (${ov.at}) — a repetition is a choice of kind "duplicate"`,
            );
        });
  if (P.length) return { update: null, problems: P, fixed: [] };

  // 2. the checks with the recommended options; an addition that brings an error is tried later in the chapter
  const g = gate(checks, b);
  const fixed: string[] = [];
  const notes: Note[] = [];
  let errs = g.added(u);
  if (errs.length) {
    const order = (): string[] => objs(chapterOf(applyAll(b, u).pack, chapter)?.sections).map(x => s(x.id));
    for (let i = 0; i < u.ops.length && errs.length; i++) {
      const op = u.ops[i] as AddOp;
      const from = sectionOfOp(op);
      if (!from || !(op.op === 'blocks' || isItemOp(op))) continue;
      const without = withOps(
        u,
        u.ops.filter((_, k) => k !== i),
      );
      const rest = g.added(without);
      if (rest.length >= errs.length) continue; // not this one's
      const secs = order(),
        start = secs.indexOf(from);
      // the earliest later section where the op brings fewer errors and none it did not bring here
      let placed: string | null = null;
      for (const to of secs.slice(start + 1)) {
        const t = g.added(
          withOps(
            u,
            u.ops.map((x, k) => (k === i ? moved(op, to) : x)),
          ),
        );
        if (t.length < errs.length && newErrors(errs, t).length === 0) {
          placed = to;
          break;
        }
      }
      if (!placed) continue;
      const later = moved(op, placed);
      u = withOps(
        u,
        u.ops.map((x, k) => (k === i ? later : x)),
      );
      notes.push({ kind: 'placed', op: i, from, to: placed });
      fixed.push(`ops[${String(i)}] moved from ${from} to ${placed}: it uses something only ${placed} or a section before it teaches`);
      errs = g.added(u);
    }
  }
  if (errs.length)
    return {
      update: null,
      problems: errs.map(e => `with the recommended options: ${e}${hint(e)}`),
      fixed,
    };
  // 3. every other option, the rest recommended
  for (const c of u.choices ?? [])
    for (const o of c.options) {
      if (o.id === c.recommended) continue;
      for (const e of g.added(u, { [c.id]: o.id })) P.push(`choice ${c.id}, option ${o.id}: ${e}`);
    }
  if (P.length) return { update: null, problems: P, fixed };
  return { update: notes.length ? { ...u, notes } : u, problems: [], fixed };
}

/** The app, just before it saves: the update with the learner's picks on the lesson as it is now → its new errors, or a
    reason it no longer fits ('changed': the chapter changed since the update was made). */
export function verify(checks: Checks, b: Base, u: LessonUpdate, picks: Picks): { errors: string[]; changed: boolean } {
  const ch = chapterOf(b.pack, u.chapter);
  if (!ch) return { errors: [`chapter ${u.chapter} is not in the subject any more`], changed: true };
  if (u.base && u.base.chapter !== chapterHash(ch)) return { errors: [], changed: true };
  return { errors: gate(checks, b).added(u, picks), changed: false };
}
