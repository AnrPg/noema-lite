/**
 * Exercise grading, the pure domain of every exercise type the app has (tools/CONTENT_SPEC.md, docs/VISUAL.md):
 * the screen collects what the learner did as an Answer, this decides whether it is complete and right.
 *
 * Answers (option and item indices are the exercise's own, before any shuffling on screen):
 *   mcq · odd · img_reveal       { picked: number[] }                    the option indices chosen
 *   predict                      { picked } with options, else { value }
 *   tf                           { value: boolean }
 *   order                        { order: number[] }                     item indices in the order placed
 *   match                        { links: (number | null)[] }            for each left item, the right item linked
 *   bucket                       { place: (number | null)[] }            for each item, the bucket it was put in
 *   cloze                        { blanks: (string | null)[] }           each blank's text (typed or chosen from the bank)
 *   spotbug                      { lines: number[] }
 *   calc                         { value: number | string | null }
 *   write                        { text: string }
 *   flaw                         { lines: number[], reason: number | null }
 *   case                         { parts: Answer[] }                     each part graded as its own type
 *   inquiry                      { picked: number | null }
 *   debate                       { side: number | null, pick: number | null }
 *   img_hotspot                  { pins: [x, y][] }                      with context.regions (the picture's parts)
 *   img_sequence                 { sequence: string[] }                  region ids in the order tapped
 *   img_drag · img_select        { slots: (string | null)[] }            the name put on each target, in target order
 *   img_label                    { slots: string[] }                     the name typed on each target (small typos pass)
 *   scenario · tree              { mistakes: number }                    wrong turns taken on the way
 *   free                         { score: number } (AI, 0–100) or { rubric: boolean[] } (ticked by the learner)
 *   img_occlusion                { knew: boolean[] }                     self-rated recall per covered part
 *   sim                          { ok: boolean, score?: number }         the activity's own checks grader
 * A grade is `incomplete` (nothing to check yet: the screen asks to finish) or `graded` with ok, a score in 0–1 and,
 * where the screen marks parts, a per-part verdict (`items`), the typos it let pass, the keywords missing, the parts.
 */
import { NoemaError } from '../../../../kernel/errors.ts';
import { err, ok, type Result } from '../../../../kernel/result.ts';
import { hits, targetsOf, type Region } from './regions.ts';
import { clozeBlanks, labelMatch, missingKeywords, norm, str } from './text.ts';

export type Exercise = { readonly type: string } & Readonly<Record<string, unknown>>;
export type Answer = Readonly<Record<string, unknown>>;
export interface GradeContext {
  /** The picture's parts (picture exercises): the exercise's own regions, else its media's. */
  readonly regions?: readonly Region[];
}

export interface GradeDetail {
  readonly items?: readonly boolean[];
  readonly typos?: readonly boolean[];
  readonly missing?: readonly string[];
  readonly parts?: readonly Grade[];
}
export type Grade =
  | { readonly status: 'incomplete' }
  | { readonly status: 'graded'; readonly ok: boolean; readonly score: number; readonly detail: GradeDetail };

const INCOMPLETE: Grade = Object.freeze({ status: 'incomplete' });
const graded = (isOk: boolean, score = isOk ? 1 : 0, detail: GradeDetail = {}): Grade =>
  Object.freeze({ status: 'graded', ok: isOk, score: Math.min(1, Math.max(0, score)), detail });
const share = (items: readonly boolean[]): number => (items.length ? items.filter(Boolean).length / items.length : 0);

const invalid = (type: string, what: string): NoemaError =>
  new NoemaError('study.invalid', `a ${type} answer needs ${what}`, { params: { type } });

/* ---------- reading the loose shapes of packs and screens ---------- */
const arr = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
const ints = (x: unknown): number[] => arr(x).filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
const strs = (x: unknown): string[] => arr(x).map(v => (typeof v === 'string' ? v : str(v)));
const intOrNull = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null);
const sameSet = (a: readonly number[], b: ReadonlySet<number>): boolean =>
  a.length === b.size && new Set(a).size === a.length && a.every(i => b.has(i));
const answerSet = (x: unknown): Set<number> => new Set(Array.isArray(x) ? ints(x) : typeof x === 'number' ? [x] : []);

type Grader = (ex: Exercise, a: Answer, ctx: GradeContext) => Result<Grade>;

const choice: Grader = (ex, a) => {
  if (!Array.isArray(a.picked)) return err(invalid(ex.type, 'picked: the option indices'));
  const picked = ints(a.picked);
  if (!picked.length) return ok(INCOMPLETE);
  return ok(graded(sameSet(picked, answerSet(ex.answer))));
};

const numeric: Grader = (ex, a) => {
  const v = a.value;
  if (v === null || v === undefined || v === '') return ok(INCOMPLETE);
  const x = typeof v === 'number' ? v : Number(v);
  const tol = typeof ex.tolerance === 'number' ? ex.tolerance : 0;
  return ok(graded(Number.isFinite(x) && Math.abs(x - Number(ex.answer)) <= tol + 1e-9));
};

const selfReported = (mistakes: unknown): Grade => graded(mistakes === 0);

/** The graders by exercise type. */
export const GRADERS: Readonly<Record<string, Grader>> = {
  mcq: choice,
  odd: choice,
  img_reveal: choice,
  predict: (ex, a, ctx) => (Array.isArray(ex.options) ? choice(ex, a, ctx) : numeric(ex, a, ctx)),
  calc: numeric,
  tf: (ex, a) =>
    typeof a.value === 'boolean'
      ? ok(graded(a.value === ex.answer))
      : a.value == null
        ? ok(INCOMPLETE)
        : err(invalid('tf', 'value: true or false')),
  order(ex, a) {
    const n = arr(ex.items).length,
      order = ints(a.order);
    if (order.length < n) return ok(INCOMPLETE);
    const items = order.slice(0, n).map((it, k) => it === k);
    return ok(graded(items.every(Boolean), share(items), { items }));
  },
  match(ex, a) {
    const n = arr(ex.pairs).length,
      links = arr(a.links).map(intOrNull);
    if (links.length < n || links.slice(0, n).some(x => x === null)) return ok(INCOMPLETE);
    const items = links.slice(0, n).map((r, l) => r === l);
    return ok(graded(items.every(Boolean), share(items), { items }));
  },
  bucket(ex, a) {
    const items0 = arr(ex.items),
      place = arr(a.place).map(intOrNull);
    if (place.length < items0.length || place.slice(0, items0.length).some(x => x === null)) return ok(INCOMPLETE);
    const items = items0.map((it, i) => place[i] === (it as { bucket?: unknown } | null)?.bucket);
    return ok(graded(items.every(Boolean), share(items), { items }));
  },
  cloze(ex, a) {
    const blanks = clozeBlanks(str(ex.text)),
      given = arr(a.blanks);
    if (blanks.some((_, i) => !norm(given[i]))) return ok(INCOMPLETE);
    const items = blanks.map((alts, i) => alts.some(x => norm(x) === norm(given[i])));
    return ok(graded(items.every(Boolean), share(items), { items }));
  },
  spotbug(ex, a) {
    const lines = ints(a.lines);
    if (!lines.length) return ok(INCOMPLETE);
    return ok(graded(sameSet(lines, new Set(ints(ex.bugs)))));
  },
  write(ex, a) {
    const text = typeof a.text === 'string' ? a.text : '';
    if (!text.trim()) return ok(INCOMPLETE);
    const missing = missingKeywords(strs(ex.keywords), text);
    return ok(graded(missing.length === 0, 1 - missing.length / Math.max(1, strs(ex.keywords).length), { missing }));
  },
  flaw(ex, a) {
    const lines = ints(a.lines),
      reason = intOrNull(a.reason);
    if (!lines.length || reason === null) return ok(INCOMPLETE);
    return ok(graded(sameSet(lines, new Set(ints(ex.flaws))) && reason === ex.reason));
  },
  case(ex, a, ctx) {
    const parts = arr(ex.parts),
      given = arr(a.parts);
    const grades: Grade[] = [];
    for (const [i, p] of parts.entries()) {
      const g = gradeExercise({ ...(p as Exercise), id: `${String(ex.id)}/${String(i)}` }, (given[i] ?? {}) as Answer, ctx);
      if (!g.ok) return g;
      grades.push(g.value);
    }
    if (grades.some(g => g.status === 'incomplete')) return ok(INCOMPLETE);
    const items = grades.map(g => g.status === 'graded' && g.ok);
    return ok(graded(items.every(Boolean), share(items), { items, parts: grades }));
  },
  inquiry(ex, a) {
    const pick = intOrNull(a.picked);
    if (pick === null) return ok(INCOMPLETE);
    const scores = arr(ex.scores).map(Number);
    return ok(graded(scores[pick] === Math.max(...scores), (scores[pick] ?? 0) / Math.max(1, ...scores)));
  },
  debate(ex, a) {
    const side = intOrNull(a.side),
      pick = intOrNull(a.pick);
    if (side === null || pick === null) return ok(INCOMPLETE);
    const sd = arr(ex.sides)[side] as { best?: unknown } | undefined;
    return ok(graded(sd !== undefined && pick === sd.best));
  },
  img_hotspot(ex, a, ctx) {
    const regions = ctx.regions ?? [],
      want = new Set(strs(ex.answer));
    const ans = regions.filter(r => want.has(r.id));
    const any = ex.any === true,
      multi = !any && (ans.length > 1 || ex.multi === true);
    const pins = arr(a.pins).filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number');
    if (!pins.length || (multi && pins.length < ans.length)) return ok(INCOMPLETE);
    const items = pins.map(([x, y]) => ans.some(r => hits(r, x, y)));
    const covered = any || ans.every(r => pins.some(([x, y]) => hits(r, x, y)));
    return ok(graded(items.every(Boolean) && covered, share(items), { items }));
  },
  img_sequence(ex, a) {
    const want = strs(ex.answer),
      seq = strs(a.sequence);
    if (seq.length < want.length) return ok(INCOMPLETE);
    const items = want.map((id, i) => seq[i] === id);
    return ok(graded(items.every(Boolean), share(items), { items }));
  },
  img_drag: slotsExact,
  img_select: slotsExact,
  img_label(ex, a, ctx) {
    const targets = targetsOf(ex.targets, ctx.regions ?? []),
      given = arr(a.slots);
    if (targets.some((_, i) => !str(given[i]).trim())) return ok(INCOMPLETE);
    const res = targets.map((r, i) => labelMatch(r.label ?? '', r.accept ?? [], given[i], ex.fuzzy !== false));
    const items = res.map(r => r.ok);
    return ok(graded(items.every(Boolean), share(items), { items, typos: res.map(r => r.typo === true) }));
  },
  scenario: (_ex, a) => (typeof a.mistakes === 'number' ? ok(selfReported(a.mistakes)) : err(invalid('scenario', 'mistakes'))),
  tree: (_ex, a) => (typeof a.mistakes === 'number' ? ok(selfReported(a.mistakes)) : err(invalid('tree', 'mistakes'))),
  free(_ex, a) {
    if (typeof a.score === 'number') return ok(graded(a.score >= 70, a.score / 100));
    if (Array.isArray(a.rubric)) {
      const items = a.rubric.map(Boolean);
      return ok(graded(items.length > 0 && share(items) >= 0.7, share(items), { items }));
    }
    return ok(INCOMPLETE);
  },
  img_occlusion(ex, a) {
    if (!Array.isArray(a.knew)) return err(invalid('img_occlusion', 'knew: one verdict per part'));
    const items = a.knew.map(Boolean),
      pass = typeof ex.pass === 'number' ? ex.pass : 0.8;
    return ok(graded(items.length > 0 && share(items) >= pass, share(items), { items }));
  },
  sim: (_ex, a) => (typeof a.ok === 'boolean' ? ok(graded(a.ok, typeof a.score === 'number' ? a.score : a.ok ? 1 : 0)) : ok(INCOMPLETE)),
};

function slotsExact(ex: Exercise, a: Answer, ctx: GradeContext): Result<Grade> {
  const targets = targetsOf(ex.targets, ctx.regions ?? []),
    given = arr(a.slots);
  if (targets.some((_, i) => !given[i])) return ok(INCOMPLETE);
  const items = targets.map((r, i) => norm(given[i]) === norm(r.label));
  return ok(graded(items.every(Boolean), share(items), { items }));
}

/** The types this domain grades. */
export const GRADED_TYPES: readonly string[] = Object.freeze(Object.keys(GRADERS).sort());

/** Grades one answer to one exercise. An exercise type this app does not know is study.invalid (the screen shows a
    quiet "newer type" card and never asks). */
export function gradeExercise(ex: Exercise, answer: Answer, ctx: GradeContext = {}): Result<Grade> {
  const g = Object.prototype.hasOwnProperty.call(GRADERS, ex.type) ? GRADERS[ex.type] : undefined;
  if (!g) return err(new NoemaError('study.invalid', 'no grader for the exercise type ' + ex.type, { params: { type: ex.type } }));
  return g(ex, answer, ctx);
}
