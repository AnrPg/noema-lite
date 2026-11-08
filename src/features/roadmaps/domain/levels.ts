/* noema-lite — a Roadmap's levels (docs/CURRICULUM.md §11): the ladder, where each step sits on it, the learner's way up.

   • Ladders ready from the start (presets): school grade, semester, year of study, difficulty (introductory · intermediate ·
     advanced) — and custom ones (any names). Their rules are the contracts' (src/contracts/rules/levels.ts roadmapLevels).
   • A level is DONE when every step that ends at it or below (a step's range ends at its `to`) is mastered; steps without a
     level never hold a level back. The CURRENT level is the lowest level that is not reached yet… precisely: the learner
     starts at the first level; a level reached is an event (roadmap.level.reached, events.ts), and the current level is the
     one after the highest level reached.
   • Moving up is automatic when the level is done; a Roadmap with `levelTest` asks for a final level test first (passed with
     the same 80 % as the step test).
   Names: a level's own names (per locale) first along the UI locale's chain; a preset without a name in that locale is
   named by the app's catalog (roadmap.level.kind.<kind> with its number, or roadmap.level.difficulty.<id>). */
import { ok, err, type Result } from '../../../kernel/result.ts';
import { roadmapLevels, span, type Level, type LevelKind, type LevelRef } from '../../../contracts/rules/levels.ts';
import type { Roadmap, Step } from './model.ts';
import { order as studyOrder } from './graph.ts';

export const LEVEL_KINDS: readonly LevelKind[] = ['grade', 'semester', 'year', 'difficulty', 'custom'];
export const LEVEL_ID = /^[a-z0-9][a-z0-9._-]{0,40}$/;
/** The share of a level test to answer right (the step test's bar, engine/curriculum.js PASS). */
export const LEVEL_PASS = 0.8;
/** The three tiers of the difficulty ladder. */
export const DIFFICULTY_TIERS = ['introductory', 'intermediate', 'advanced'] as const;
const DIFFICULTY_EN: Record<(typeof DIFFICULTY_TIERS)[number], string> = {
  introductory: 'Introductory',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
const KIND_EN: Record<Exclude<LevelKind, 'difficulty' | 'custom'>, string> = { grade: 'Grade', semester: 'Semester', year: 'Year' };
const PREFIX: Record<Exclude<LevelKind, 'difficulty' | 'custom'>, string> = { grade: 'g', semester: 's', year: 'y' };

/** A ready ladder. grade: from–to (default 1–12) · semester: 1–n (default 8) · year: 1–n (default 4) · difficulty: three tiers.
    Each level is named in English (`names.en`); the app names it in other locales from its catalog. */
export function presetLadder(kind: Exclude<LevelKind, 'custom'>, from = 1, to?: number): Level[] {
  if (kind === 'difficulty') return DIFFICULTY_TIERS.map((id, order) => ({ id, kind, order, names: { en: DIFFICULTY_EN[id] } }));
  const last = to ?? (kind === 'grade' ? 12 : kind === 'semester' ? 8 : 4),
    first = kind === 'grade' ? from : 1,
    out: Level[] = [];
  for (let n = first; n <= last; n++)
    out.push({ id: `${PREFIX[kind]}${n}`, kind, order: n - first, names: { en: `${KIND_EN[kind]} ${n}` } });
  return out;
}

/** Is this level one of a preset (its id is the preset's own: s3, g7, y2, introductory…)? → its number (or tier) for the catalog. */
export function presetOf(l: Level): { key: string; n?: number } | null {
  if (l.kind === 'difficulty') return (DIFFICULTY_TIERS as readonly string[]).includes(l.id) ? { key: `difficulty.${l.id}` } : null;
  if (l.kind === 'custom') return null;
  const m = new RegExp(`^${PREFIX[l.kind]}(\\d{1,2})$`).exec(l.id);
  return m ? { key: `kind.${l.kind}`, n: Number(m[1]) } : null;
}

/** A level's name for a reader whose locales are `chain` (most wanted first). null: no own name fits — the app names a preset
    from its catalog (presetOf); `any` gives the first name it has instead. */
export function levelName(l: Level, chain: readonly string[], { any = false }: { any?: boolean } = {}): string | null {
  const names = l.names,
    base = (x: string): string => x.split('-')[0]?.toLowerCase() ?? x;
  for (const t of chain) {
    const k = Object.keys(names).find(x => x.toLowerCase() === t.toLowerCase()) ?? Object.keys(names).find(x => base(x) === base(t));
    const v = k ? names[k] : undefined;
    if (v?.trim()) return v;
  }
  return any ? (Object.values(names).find(v => v.trim()) ?? l.id) : null;
}

/* ---------- a proposed ladder (Claude's plan, the app's import) ---------- */

/** What a plan may say about levels: a preset ("semester", "semester:6", "year:4", "grade:5-9", "difficulty") or the levels
    themselves [{ id, kind, names | name, order? }] (order: the list's order when left out). */
export type LadderInput = string | readonly Record<string, unknown>[];

/** A proposed ladder → the ladder, or every problem at once (English, for Claude). lang: the Roadmap's language (a level given
    with one `name` is named in it). */
export function ladderFrom(input: unknown, lang = 'en'): Result<Level[], string[]> {
  if (typeof input === 'string') {
    const m = /^\s*(grade|semester|year|difficulty)(?:\s*:\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?)?\s*$/i.exec(input);
    if (!m)
      return err([
        `levels "${input}": a preset is "grade", "grade:5-9", "semester", "semester:6", "year", "year:4" or "difficulty" — or give the levels as a list`,
      ]);
    const kind = (m[1] ?? '').toLowerCase() as Exclude<LevelKind, 'custom'>,
      a = m[2] ? Number(m[2]) : undefined,
      b = m[3] ? Number(m[3]) : undefined;
    if (kind === 'difficulty') return a === undefined ? ok(presetLadder(kind)) : err(['levels "difficulty" has no numbers (three tiers)']);
    if (kind === 'grade') {
      const from = b === undefined ? 1 : (a ?? 1),
        to = b ?? a ?? 12;
      return from >= 1 && to >= from && to <= 13 ? ok(presetLadder(kind, from, to)) : err([`levels "${input}": grades 1–13, from ≤ to`]);
    }
    const n = a ?? (kind === 'semester' ? 8 : 4);
    if (b !== undefined) return err([`levels "${input}": a ${kind} ladder is "${kind}:<how many>"`]);
    return n >= 1 && n <= 20 ? ok(presetLadder(kind, 1, n)) : err([`levels "${input}": 1–20 ${kind}s`]);
  }
  if (!Array.isArray(input) || !input.length) return err(['levels: a preset name or a list of levels [{ "id", "kind", "names" }]']);
  const out: Level[] = [],
    E: string[] = [],
    list = input as unknown[];
  const first = list[0] as Record<string, unknown> | undefined;
  const kind0 = typeof first?.kind === 'string' ? first.kind : 'custom';
  list.forEach((x, i) => {
    const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
    if (!o) return void E.push(`levels[${i}]: an object { "id", "kind", "names" }`);
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!LEVEL_ID.test(id)) E.push(`levels[${i}]: id "${id}" — lower-case letters, digits, . _ - (e.g. "s1", "grade-7")`);
    const kind = typeof o.kind === 'string' ? o.kind : kind0;
    if (!(LEVEL_KINDS as readonly string[]).includes(kind)) E.push(`levels[${i}]: kind "${kind}" — one of ${LEVEL_KINDS.join(', ')}`);
    const names: Record<string, string> = {};
    if (o.names && typeof o.names === 'object' && !Array.isArray(o.names))
      for (const [loc, v] of Object.entries(o.names as Record<string, unknown>))
        if (typeof v === 'string' && v.trim()) names[loc] = v.trim().slice(0, 80);
    if (typeof o.name === 'string' && o.name.trim()) names[lang] ??= o.name.trim().slice(0, 80);
    if (!Object.keys(names).length) E.push(`levels[${i}] "${id}": a name ("names": { "${lang}": "…" })`);
    const ord = o.order === undefined ? i : o.order;
    if (typeof ord !== 'number' || !Number.isInteger(ord) || ord < 0) E.push(`levels[${i}] "${id}": order is a whole number ≥ 0`);
    out.push({ id, kind: kind as LevelKind, order: typeof ord === 'number' ? ord : i, names });
  });
  if (!E.length) for (const x of roadmapLevels.issues({ levels: out, nodes: {}, edges: [] })) E.push(x.message);
  return E.length ? err(E) : ok(out);
}

/** A step's level as a plan gives it: "s2", { "from": "s2", "to": "s3" } → the reference, or a problem. */
export function levelRefFrom(x: unknown, ladder: readonly Level[], at: string): Result<LevelRef | undefined, string> {
  if (x === undefined || x === null || x === '') return ok(undefined);
  const ids = ladder.map(l => l.id),
    known = (id: unknown): id is string => typeof id === 'string' && ids.includes(id);
  if (!ladder.length) return err(`${at}: a level, but the Roadmap has no levels (give "levels" first)`);
  if (known(x)) return ok(x);
  if (typeof x === 'object' && !Array.isArray(x)) {
    const r = x as Record<string, unknown>;
    if (known(r.from) && known(r.to)) return ok(r.from === r.to ? r.from : { from: r.from, to: r.to });
  }
  return err(`${at}: level ${JSON.stringify(x)} is not a level of the Roadmap (${ids.join(', ')}) — one id, or { "from": id, "to": id }`);
}

/* ---------- where steps sit, and how far the learner is ---------- */

const ladderOf = (c: Pick<Roadmap, 'levels'>): Level[] => [...(c.levels ?? [])].sort((a, b) => a.order - b.order);

/** The ladder, lowest first. */
export const ladder = ladderOf;

/** A step's span on the ladder (orders), or null (no level, or one the ladder does not have). */
export const stepSpan = (c: Pick<Roadmap, 'levels'>, n: Pick<Step, 'level'> | undefined): { from: number; to: number } | null =>
  n?.level === undefined ? null : span(c.levels ?? [], n.level);

/** Does the step sit at this level (its range includes it)? */
export function atLevel(c: Pick<Roadmap, 'levels'>, n: Pick<Step, 'level'> | undefined, levelId: string): boolean {
  const s = stepSpan(c, n),
    l = (c.levels ?? []).find(x => x.id === levelId);
  return !!s && !!l && s.from <= l.order && l.order <= s.to;
}

/** The steps at a level, in study order. */
export const stepsAt = (c: Pick<Roadmap, 'levels' | 'nodes' | 'edges'>, levelId: string): string[] =>
  studyOrder(c).filter(id => atLevel(c, c.nodes[id], levelId));

/** A level a plan or a tool names, by its id or one of its names (any locale, any case). */
export function findLevel(c: Pick<Roadmap, 'levels'>, q: string): Level | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const L = c.levels ?? [];
  return L.find(l => l.id === s) ?? L.find(l => Object.values(l.names).some(v => v.toLowerCase() === s)) ?? null;
}

export interface LevelProgress {
  readonly id: string;
  readonly order: number;
  /** steps at this level (in its range) */
  readonly steps: string[];
  readonly mastered: number;
  /** every step that ends at this level or below is mastered (and the level has steps) */
  readonly done: boolean;
}

/** Progress per level, lowest first. mastered: is this step mastered (the app's statuses, docs/CURRICULUM.md §3)? */
export function levelProgress(c: Pick<Roadmap, 'levels' | 'nodes' | 'edges'>, mastered: (id: string) => boolean): LevelProgress[] {
  const L = ladderOf(c),
    ids = studyOrder(c),
    spans = new Map(ids.map(id => [id, stepSpan(c, c.nodes[id])] as const));
  return L.map(l => {
    const steps = ids.filter(id => {
      const s = spans.get(id);
      return !!s && s.from <= l.order && l.order <= s.to;
    });
    const upTo = ids.filter(id => {
      const s = spans.get(id);
      return !!s && s.to <= l.order;
    });
    return {
      id: l.id,
      order: l.order,
      steps,
      mastered: steps.filter(mastered).length,
      done: steps.length > 0 && upTo.every(mastered),
    };
  });
}

/** The learner's current level: the one after the highest level reached (reached: level ids from the log), else the first
    level; null on a Roadmap without levels. At the top of the ladder it stays the last level. */
export function currentLevel(c: Pick<Roadmap, 'levels'>, reached: Iterable<string>): Level | null {
  const L = ladderOf(c);
  if (!L.length) return null;
  const got = new Set(reached);
  let top = -1;
  L.forEach((l, i) => {
    if (got.has(l.id)) top = Math.max(top, i);
  });
  return L[Math.min(top + 1, L.length - 1)] ?? null;
}

export type LevelStep =
  /** the level is done: it is reached now (an event), the next one opens */
  | { readonly kind: 'reach'; readonly level: string; readonly next: string | null }
  /** the level is done, but the Roadmap asks for its final test first */
  | { readonly kind: 'test'; readonly level: string; readonly next: string | null };

/** What moves the learner up now (null: nothing). reached: the levels the log has; tested: the levels whose test was passed.
    Levels are reached in order: a done level above one that is not reached waits. */
export function nextLevelStep(
  c: Pick<Roadmap, 'levels' | 'nodes' | 'edges' | 'levelTest'>,
  mastered: (id: string) => boolean,
  reached: ReadonlySet<string>,
  tested: ReadonlySet<string> = new Set(),
): LevelStep | null {
  const P = levelProgress(c, mastered);
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (!p) continue;
    if (reached.has(p.id)) continue;
    if (!p.done) return null;
    const next = P[i + 1]?.id ?? null;
    return c.levelTest && !tested.has(p.id) ? { kind: 'test', level: p.id, next } : { kind: 'reach', level: p.id, next };
  }
  return null;
}

/* ---------- for Claude: targeting one level ---------- */

/** The level a task targets, as Claude reads it in a task or a pipeline (English): what the level is, which steps it has and
    what difficulty means there — the mix 20/25/55 % is kept WITHIN the level and relative to it. */
export function levelBrief(c: Pick<Roadmap, 'levels' | 'nodes' | 'edges' | 'title' | 'goal'>, levelId: string): string {
  const L = ladderOf(c),
    i = L.findIndex(l => l.id === levelId),
    l = L[i];
  if (!l) return '';
  const name = (x: Level): string => levelName(x, ['en'], { any: true }) ?? x.id;
  const steps = stepsAt(c, levelId).map(id => `“${c.nodes[id]?.title ?? id}”`);
  const below = L.slice(0, i).map(name),
    above = L.slice(i + 1).map(name);
  const tier =
    l.kind === 'difficulty'
      ? `This is the ${name(l).toLowerCase()} tier of the difficulty ladder: pitch the whole material at that tier (${l.id === 'introductory' ? 'first contact: intuition, vocabulary, the basic cases' : l.id === 'intermediate' ? 'the standard methods applied to varied problems' : l.id === 'advanced' ? 'depth, proofs, hard and open-ended problems, transfer' : 'its place on the ladder'}).`
      : `This is ${name(l)} (${l.kind}, level ${i + 1} of ${L.length}): what a learner at exactly that ${l.kind} is expected to know and do.`;
  return [
    `## Level: ${name(l)} (level id "${l.id}")`,
    tier,
    `Difficulty is relative to this level: difficulty 1 = the easiest a learner at ${name(l)} meets, 3 = the hardest that is still ${name(l)} material — never material of a higher level${above.length ? ` (${above.join(', ')})` : ''}. Keep the mix ≈ 20 / 25 / 55 % (difficulty 1 / 2 / 3) WITHIN this level.`,
    below.length ? `The learner has the levels below (${below.join(', ')}): build on them, do not re-teach them.` : '',
    steps.length ? `Steps at this level: ${steps.join(', ')}.` : 'No step sits at this level yet.',
    `Give the pack "levels": ["${l.id}"] in subject.json (a chapter, section or exercise of another level of this Roadmap names its own "level").`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The ladder as one line for Claude: id = name, lowest first. */
export const ladderLine = (c: Pick<Roadmap, 'levels'>): string =>
  ladderOf(c)
    .map(l => `${l.id} = ${levelName(l, ['en'], { any: true }) ?? l.id}`)
    .join(' · ');

/** The level of a step as one short text for Claude (e.g. "s2" or "s2–s3"), '' without one. */
export const levelText = (n: Pick<Step, 'level'> | undefined): string =>
  n?.level === undefined ? '' : typeof n.level === 'string' ? n.level : `${n.level.from}–${n.level.to}`;

/** The level rules of a Roadmap (src/contracts/rules/levels.ts roadmapLevels) as English problems for Claude. */
export const levelProblems = (c: Pick<Roadmap, 'levels' | 'nodes' | 'edges'>): string[] =>
  roadmapLevels.issues({ levels: c.levels ?? [], nodes: c.nodes, edges: c.edges }).map(x => x.message);

/** A plan's levels (noema_create_roadmap, noema_extend_roadmap): the ladder it proposes and each step's level, by the plan's
    refs. have: the Roadmap's ladder so far (a new part may add levels at the top, never change one). → the levels to add, the
    whole ladder and the level of each ref, or every problem at once. */
export function planLevels(
  d: { readonly levels?: unknown; readonly steps?: readonly { readonly ref?: unknown; readonly level?: unknown }[] },
  lang: string,
  have: readonly Level[] = [],
): Result<{ add: Level[]; ladder: Level[]; of: Record<string, LevelRef> }, string[]> {
  const E: string[] = [],
    add: Level[] = [];
  if (d.levels !== undefined && d.levels !== null && d.levels !== '' && !(Array.isArray(d.levels) && !d.levels.length)) {
    const L = ladderFrom(d.levels, lang);
    if (!L.ok) return err(L.error);
    let top = have.length ? Math.max(...have.map(x => x.order)) : -1;
    for (const l of [...L.value].sort((a, b) => a.order - b.order)) {
      const old = have.find(x => x.id === l.id);
      if (old) continue;
      if (have.length && have[0] && l.kind !== have[0].kind) {
        E.push(`levels: "${l.id}" is a ${l.kind} level, the Roadmap's ladder is ${have[0].kind}`);
        continue;
      }
      add.push(have.length ? { ...l, order: ++top } : l);
    }
  }
  const all = [...have, ...add],
    of: Record<string, LevelRef> = {};
  (d.steps ?? []).forEach((s, i) => {
    const ref = typeof s.ref === 'string' && s.ref ? s.ref : String(i + 1);
    const r = levelRefFrom(s.level, all, `step "${ref}"`);
    if (!r.ok) E.push(r.error);
    else if (r.value !== undefined) of[ref] = r.value;
  });
  return E.length ? err(E) : ok({ add, ladder: all, of });
}

/* ---------- the final level test (a Roadmap with levelTest) ---------- */

export interface TestQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}
interface ExerciseIn {
  readonly type?: unknown;
  readonly q?: unknown;
  readonly options?: unknown;
  readonly answer?: unknown;
  readonly multi?: unknown;
  readonly explain?: unknown;
}
/** The questions of a level test, from the prepared packs of the level's steps (no AI is asked): single-answer multiple
    choice and true/false exercises, taken in turn from each pack so every step of the level is tested. Fewer than `min`
    questions → [] (the level's packs are not ready for a test). tf: the words of the two answers in the learner's language. */
export function levelTestFrom(
  packs: readonly { readonly chapters?: readonly { readonly exercises?: readonly ExerciseIn[] }[] }[],
  o: { rand: () => number; tf: readonly [string, string]; count?: number; min?: number },
): TestQuestion[] {
  const count = o.count ?? 12,
    min = o.min ?? 8;
  const usable = (e: ExerciseIn): TestQuestion | null => {
    if (typeof e.q !== 'string' || !e.q.trim()) return null;
    const explain = typeof e.explain === 'string' ? e.explain : '';
    if (e.type === 'tf' && typeof e.answer === 'boolean') return { q: e.q, options: [...o.tf], answer: e.answer ? 0 : 1, explain };
    if (e.type === 'mcq' && !e.multi && Array.isArray(e.options) && Number.isInteger(e.answer)) {
      const opts = e.options.map(x => (typeof x === 'string' ? x : '')),
        a = e.answer as number;
      return opts.every(Boolean) && a >= 0 && a < opts.length ? { q: e.q, options: opts, answer: a, explain } : null;
    }
    return null;
  };
  const pools = packs
    .map(p => (p.chapters ?? []).flatMap(ch => (ch.exercises ?? []).map(usable).filter((x): x is TestQuestion => !!x)))
    .filter(x => x.length);
  const out: TestQuestion[] = [];
  for (let i = 0; out.length < count && pools.some(x => x.length); i++) {
    const pool = pools[i % pools.length];
    if (!pool?.length) continue;
    const [q] = pool.splice(Math.floor(o.rand() * pool.length), 1);
    if (q) out.push(q);
  }
  return out.length >= min ? out : [];
}
